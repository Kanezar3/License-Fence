import importlib.util
import json
import sys
import types
from pathlib import Path

import pytest


CONTRACT_PATH = Path(__file__).resolve().parent.parent / "contracts" / "license_fence.py"

BUYER = "0x1111111111111111111111111111111111111111"
VENDOR = "0x2222222222222222222222222222222222222222"
AUDITOR_1 = "0x3333333333333333333333333333333333333333"
AUDITOR_2 = "0x4444444444444444444444444444444444444444"

PREFIX = "https://raw.githubusercontent.com/"
APACHE_URL = (
    "https://raw.githubusercontent.com/psf/requests/"
    "3c7baaa05ab4aa49cc819ce3a819d260de19c157/LICENSE"
)
BSD_URL = (
    "https://raw.githubusercontent.com/pallets/flask/"
    "49943b5a94413a530761350f04e896f76e8d620e/LICENSE.txt"
)
AGPL_URL = (
    "https://raw.githubusercontent.com/grafana/grafana/"
    "88998cea58e933452355eb4c7cbe1a452ef0f817/LICENSE"
)


class _TransferLog:
    def __init__(self):
        self.transfers = []

    def clear(self):
        self.transfers.clear()


_TRANSFERS = _TransferLog()


class _FakeAddress:
    def __init__(self, hex_str: str):
        self.as_hex = hex_str


class _FakeWebResponse:
    def __init__(self, status: int, body: bytes):
        self.status = status
        self.body = body


class _FakeReturn:
    def __init__(self, calldata):
        self.calldata = calldata


class _FakeUserError(Exception):
    pass


class _TreeMap(dict):
    def __class_getitem__(cls, item):
        return cls


def _load_module():
    gl_mod = types.ModuleType("genlayer")

    class _Contract:
        def __new__(cls, *args, **kwargs):
            obj = super().__new__(cls)
            obj.bundles_json = _TreeMap()
            obj.audits_json = _TreeMap()
            obj.rejections_json = _TreeMap()
            obj.refundable_balances = _TreeMap()
            return obj

    class _PublicWrite:
        def __call__(self, fn):
            return fn

        @property
        def payable(self):
            return lambda fn: fn

    class _Public:
        write = _PublicWrite()

        @staticmethod
        def view(fn):
            return fn

    class _Evm:
        @staticmethod
        def contract_interface(cls):
            class _Proxy:
                def __init__(self, addr):
                    self._addr = addr.as_hex if hasattr(addr, "as_hex") else str(addr)

                def emit_transfer(self, value=0):
                    _TRANSFERS.transfers.append((self._addr.lower(), int(value)))

            return _Proxy

    class _Vm:
        UserError = _FakeUserError
        Return = _FakeReturn

        @staticmethod
        def run_nondet_unsafe(leader_fn, validator_fn):
            res = leader_fn()
            ok = validator_fn(_FakeReturn(res))
            if not ok:
                raise AssertionError("Validator rejected leader result")
            return res

    class _NondetWeb:
        get = staticmethod(lambda url: _FakeWebResponse(200, b""))

    class _Nondet:
        web = _NondetWeb()
        exec_prompt = staticmethod(lambda prompt, response_format="json": "{}")

    class _Gl:
        Contract = _Contract
        public = _Public()
        evm = _Evm()
        vm = _Vm()
        nondet = _Nondet()
        message = types.SimpleNamespace(sender_address=_FakeAddress(BUYER), value=0)
        message_raw = {"datetime": "2026-11-23T10:00:00Z"}

    gl_mod.gl = _Gl()
    gl_mod.u256 = int
    gl_mod.Address = _FakeAddress
    gl_mod.TreeMap = _TreeMap

    sys.modules["genlayer"] = gl_mod
    spec = importlib.util.spec_from_file_location("license_fence_mod", CONTRACT_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod, gl_mod.gl


def _set_tx(gl, sender: str, value: int, dt: str | None = "2026-11-23T10:00:00Z"):
    gl.message = types.SimpleNamespace(sender_address=_FakeAddress(sender), value=value)
    gl.message_raw = {"datetime": dt} if dt is not None else {}


def _wire_nondet(gl, web_fn, prompt_fn):
    gl.nondet.web.get = staticmethod(web_fn)
    gl.nondet.exec_prompt = staticmethod(prompt_fn)


def _open_bundle(c, gl, policy="PROPRIETARY_COMMERCIAL", slots="http-client,web-router", deadline=1795431600, escrow=1001):
    _set_tx(gl, BUYER, escrow, dt="2026-11-23T10:00:00Z")
    _wire_nondet(
        gl,
        lambda url: _FakeWebResponse(200, b""),
        lambda prompt, response_format="json": json.dumps(
            {
                "verdict": "OBSERVABLE_SCOPE",
                "reason_code": "CONCRETE_DEPENDENCY_POLICY",
                "rationale": "Concrete dependency slots and SPDX policy.",
            }
        ),
    )
    res = json.loads(
        c.open_clearance_bundle(
            "Core SDK v2.4 Release Clearance",
            policy,
            VENDOR,
            "All dependencies must satisfy the target commercial license compatibility policy.",
            slots,
            PREFIX,
            deadline,
        )
    )
    assert res["ok"] is True
    return res["bundle"]


def test_upfront_deposit_capture_and_validation_refund():
    mod, gl = _load_module()
    c = mod.LicenseFence()
    _set_tx(gl, BUYER, 500)
    res = json.loads(
        c.open_clearance_bundle(
            "Bad Policy Bundle",
            "INVALID_POLICY",
            VENDOR,
            "Concrete scope charter for release clearance.",
            "dep-a",
            PREFIX,
            1795431600,
        )
    )
    assert res["ok"] is False
    assert res["error"] == "INVALID_TARGET_POLICY"
    assert int(json.loads(c.get_refundable_balance(BUYER))["refundable_wei"]) == 500
    assert int(json.loads(c.get_protocol_stats())["total_locked_wei"]) == 0


def test_fail_closed_trusted_time_unavailable():
    mod, gl = _load_module()
    c = mod.LicenseFence()
    _set_tx(gl, BUYER, 500, dt=None)
    with pytest.raises(mod.gl.vm.UserError, match="TRUSTED_TIME_UNAVAILABLE"):
        c.open_clearance_bundle(
            "No Time",
            "PERMISSIVE_ONLY",
            VENDOR,
            "Concrete scope charter for release.",
            "dep-a",
            PREFIX,
            1795431600,
        )


def test_gate1_too_vague_refunds_buyer():
    mod, gl = _load_module()
    c = mod.LicenseFence()
    _set_tx(gl, BUYER, 750)
    _wire_nondet(
        gl,
        lambda url: _FakeWebResponse(200, b""),
        lambda prompt, response_format="json": json.dumps(
            {
                "verdict": "TOO_VAGUE",
                "reason_code": "SUBJECTIVE_OR_UNMEASURABLE",
                "rationale": "Vague vibes without measurable license scope.",
            }
        ),
    )
    res = json.loads(
        c.open_clearance_bundle(
            "Good Vibes Release",
            "PERMISSIVE_ONLY",
            VENDOR,
            "Make sure everything feels friendly and clean.",
            "dep-a",
            PREFIX,
            1795431600,
        )
    )
    assert res["ok"] is False
    assert res["verdict"] == "TOO_VAGUE"
    assert int(json.loads(c.get_refundable_balance(BUYER))["refundable_wei"]) == 750


def test_multi_slot_clearance_and_exact_wei_conservation():
    mod, gl = _load_module()
    c = mod.LicenseFence()
    # Escrow = 1001 wei -> auditor_pool = 200, vendor = 801; 2 auditors -> 100 each (exact conservation)
    bundle = _open_bundle(c, gl, escrow=1001)

    apache_body = b"Apache License\nVersion 2.0, January 2004\nTERMS AND CONDITIONS FOR USE\n"
    _set_tx(gl, AUDITOR_1, 150)
    _wire_nondet(
        gl,
        lambda url: _FakeWebResponse(200, apache_body),
        lambda prompt, response_format="json": json.dumps(
            {
                "verdict": "PERMISSIVE",
                "reason_code": "APACHE_2_GRANT",
                "evidence_quote": "Apache License Version 2.0, January 2004",
                "rationale": "Explicit Apache 2.0 permissive license.",
            }
        ),
    )
    r1 = json.loads(c.submit_slot_audit(bundle["bundle_id"], 0, APACHE_URL, 1, 3))
    assert r1["ok"] is True
    assert r1["audit"]["audit_status"] == "SLOT_CLEARED"
    assert r1["bundle"]["status"] == "OPEN"
    assert r1["bundle"]["cleared_slot_count"] == 1
    assert int(json.loads(c.get_refundable_balance(AUDITOR_1))["refundable_wei"]) == 150

    bsd_body = b"Copyright 2010 Pallets\nRedistribution and use in source and binary forms are permitted.\n"
    _set_tx(gl, AUDITOR_2, 175)
    _wire_nondet(
        gl,
        lambda url: _FakeWebResponse(200, bsd_body),
        lambda prompt, response_format="json": json.dumps(
            {
                "verdict": "PERMISSIVE",
                "reason_code": "MIT_OR_BSD_GRANT",
                "evidence_quote": "Redistribution and use in source and binary forms",
                "rationale": "BSD-3-Clause permissive grant.",
            }
        ),
    )
    r2 = json.loads(c.submit_slot_audit(bundle["bundle_id"], 1, BSD_URL, 1, 2))
    assert r2["ok"] is True
    assert r2["bundle"]["status"] == "CLEARED_FOR_RELEASE"
    assert r2["bundle"]["cleared_slot_count"] == 2
    assert int(json.loads(c.get_protocol_stats())["total_locked_wei"]) == 0

    vendor_bal = int(json.loads(c.get_refundable_balance(VENDOR))["refundable_wei"])
    a1_bal = int(json.loads(c.get_refundable_balance(AUDITOR_1))["refundable_wei"])
    a2_bal = int(json.loads(c.get_refundable_balance(AUDITOR_2))["refundable_wei"])
    assert vendor_bal == 801
    assert a1_bal == 150 + 100
    assert a2_bal == 175 + 100
    assert (vendor_bal + (a1_bal - 150) + (a2_bal - 175)) == 1001


def test_copyleft_contamination_short_circuit():
    mod, gl = _load_module()
    c = mod.LicenseFence()
    bundle = _open_bundle(c, gl, policy="PROPRIETARY_COMMERCIAL", slots="ui-core,chart-lib", escrow=1000)

    agpl_body = b"GNU AFFERO GENERAL PUBLIC LICENSE\nVersion 3, 19 November 2007\nnetwork server software.\n"
    _set_tx(gl, AUDITOR_1, 200)
    _wire_nondet(
        gl,
        lambda url: _FakeWebResponse(200, agpl_body),
        lambda prompt, response_format="json": json.dumps(
            {
                "verdict": "NETWORK_COPYLEFT",
                "reason_code": "AGPL_NETWORK_INTERACTION_CLAUSE",
                "evidence_quote": "GNU AFFERO GENERAL PUBLIC LICENSE",
                "rationale": "AGPL-3.0 network copyleft incompatible with proprietary commercial target.",
            }
        ),
    )
    res = json.loads(c.submit_slot_audit(bundle["bundle_id"], 0, AGPL_URL, 1, 3))
    assert res["ok"] is True
    assert res["audit"]["audit_status"] == "CONTAMINATION_TRIGGERED"
    assert res["bundle"]["status"] == "CONTAMINATED"
    assert res["bundle"]["contaminating_slot"] == 0
    assert int(json.loads(c.get_refundable_balance(BUYER))["refundable_wei"]) == 800
    assert int(json.loads(c.get_refundable_balance(AUDITOR_1))["refundable_wei"]) == 400
    assert int(json.loads(c.get_refundable_balance(VENDOR))["refundable_wei"]) == 0
    assert int(json.loads(c.get_protocol_stats())["total_locked_wei"]) == 0


def test_insufficient_evidence_refunds_auditor_and_keeps_slot_pending():
    mod, gl = _load_module()
    c = mod.LicenseFence()
    bundle = _open_bundle(c, gl, escrow=1000)

    _set_tx(gl, AUDITOR_1, 120)
    _wire_nondet(
        gl,
        lambda url: _FakeWebResponse(200, b"*.pyc\n__pycache__/\n.env\n"),
        lambda prompt, response_format="json": json.dumps(
            {
                "verdict": "INSUFFICIENT_EVIDENCE",
                "reason_code": "UNRELATED_FILE_OR_SLICE",
                "evidence_quote": "",
                "rationale": "File is a .gitignore with no license terms.",
            }
        ),
    )
    res = json.loads(c.submit_slot_audit(bundle["bundle_id"], 0, BSD_URL, 1, 3))
    assert res["ok"] is True
    assert res["audit"]["audit_status"] == "INSUFFICIENT_RETRYABLE"
    assert res["bundle"]["status"] == "OPEN"
    assert res["bundle"]["slots"][0]["status"] == "PENDING"
    assert res["bundle"]["slots"][0]["attempts"] == 1
    assert int(json.loads(c.get_refundable_balance(AUDITOR_1))["refundable_wei"]) == 120
    assert int(json.loads(c.get_refundable_balance(BUYER))["refundable_wei"]) == 0


def test_unverifiable_fetch_503_and_max_5_retries():
    mod, gl = _load_module()
    c = mod.LicenseFence()
    bundle = _open_bundle(c, gl, escrow=1000)

    for attempt in range(1, 6):
        _set_tx(gl, AUDITOR_1, 100)
        _wire_nondet(
            gl,
            lambda url: _FakeWebResponse(503, b"Service Unavailable"),
            lambda prompt, response_format="json": "{}",
        )
        res = json.loads(c.submit_slot_audit(bundle["bundle_id"], 0, APACHE_URL, 1, 5))
        assert res["ok"] is True
        assert res["audit"]["verdict"] == "UNVERIFIABLE_FETCH"
        assert res["audit"]["audit_status"] == "UNVERIFIABLE_RETRYABLE"
        assert res["bundle"]["slots"][0]["attempts"] == attempt
        assert int(json.loads(c.get_refundable_balance(AUDITOR_1))["refundable_wei"]) == 100 * attempt

    _set_tx(gl, AUDITOR_1, 100)
    res6 = json.loads(c.submit_slot_audit(bundle["bundle_id"], 0, APACHE_URL, 1, 5))
    assert res6["ok"] is False
    assert res6["error"] == "MAX_SLOT_ATTEMPTS_REACHED"
    assert int(json.loads(c.get_refundable_balance(AUDITOR_1))["refundable_wei"]) == 600


def test_incompatible_verdict_reason_rejected():
    mod, gl = _load_module()
    c = mod.LicenseFence()
    bundle = _open_bundle(c, gl, escrow=1000)

    _set_tx(gl, AUDITOR_1, 100)
    _wire_nondet(
        gl,
        lambda url: _FakeWebResponse(200, b"Apache License Version 2.0, January 2004"),
        lambda prompt, response_format="json": json.dumps(
            {
                "verdict": "PERMISSIVE",
                "reason_code": "AGPL_NETWORK_INTERACTION_CLAUSE",
                "evidence_quote": "Apache License Version 2.0",
                "rationale": "Mismatched reason code.",
            }
        ),
    )
    with pytest.raises(ValueError, match="Incompatible reason"):
        c.submit_slot_audit(bundle["bundle_id"], 0, APACHE_URL, 1, 1)


def test_settle_expired_bundle_enforces_grace_period_and_withdraw():
    mod, gl = _load_module()
    _TRANSFERS.clear()
    c = mod.LicenseFence()
    # 2026-11-23T10:00:00Z = 1795428000; deadline = +50s (1795428050)
    deadline = 1795428050
    bundle = _open_bundle(c, gl, deadline=deadline, escrow=1000)

    # Before deadline -> BUNDLE_NOT_EXPIRED
    _set_tx(gl, BUYER, 0, dt="2026-11-23T10:00:30Z")
    with pytest.raises(mod.gl.vm.UserError, match="BUNDLE_NOT_EXPIRED"):
        c.settle_expired_bundle(bundle["bundle_id"])

    # Inside EXPIRY_GRACE_SECONDS (deadline + 10s < deadline + 15s) -> still BUNDLE_NOT_EXPIRED
    _set_tx(gl, BUYER, 0, dt="2026-11-23T10:01:00Z")
    with pytest.raises(mod.gl.vm.UserError, match="BUNDLE_NOT_EXPIRED"):
        c.settle_expired_bundle(bundle["bundle_id"])

    # At deadline + 15s (10:01:05Z) -> EXPIRED_REFUNDED
    _set_tx(gl, BUYER, 0, dt="2026-11-23T10:01:05Z")
    res_exp = json.loads(c.settle_expired_bundle(bundle["bundle_id"]))
    assert res_exp["ok"] is True
    assert res_exp["bundle"]["status"] == "EXPIRED_REFUNDED"
    assert int(json.loads(c.get_refundable_balance(BUYER))["refundable_wei"]) == 1000

    # Pull withdrawal via emit_transfer
    w_res = json.loads(c.withdraw_refundable())
    assert w_res["ok"] is True
    assert int(w_res["withdrawn_wei"]) == 1000
    assert int(json.loads(c.get_refundable_balance(BUYER))["refundable_wei"]) == 0
    assert _TRANSFERS.transfers == [(BUYER, 1000)]

    with pytest.raises(mod.gl.vm.UserError, match="ZERO_REFUNDABLE_BALANCE"):
        c.withdraw_refundable()
