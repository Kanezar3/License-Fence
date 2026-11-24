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

REQUESTS_PREFIX = "https://raw.githubusercontent.com/psf/requests/"
FFMPEG_PREFIX = "https://raw.githubusercontent.com/FFmpeg/FFmpeg/"
CONSUL_PREFIX = "https://raw.githubusercontent.com/hashicorp/consul/"
GRAFANA_PREFIX = "https://raw.githubusercontent.com/grafana/grafana/"

APACHE_URL = f"{REQUESTS_PREFIX}3c7baaa05ab4aa49cc819ce3a819d260de19c157/LICENSE"
FFMPEG_URL = f"{FFMPEG_PREFIX}f9145f2284641ff1567a58aebe616370fd8f04d7/LICENSE.md"
CONSUL_URL = f"{CONSUL_PREFIX}1b3b4fc657b239ead67349bb7142095a566419d3/LICENSE"
AGPL_URL = f"{GRAFANA_PREFIX}88998cea58e933452355eb4c7cbe1a452ef0f817/LICENSE"


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


def _open_bundle(
    c,
    gl,
    policy="PROPRIETARY_COMMERCIAL",
    slots_spec=f"http-client={REQUESTS_PREFIX}|media-codec={FFMPEG_PREFIX}",
    deadline=1795431600,
    escrow=1001,
):
    _set_tx(gl, BUYER, escrow, dt="2026-11-23T10:00:00Z")
    _wire_nondet(
        gl,
        lambda url: _FakeWebResponse(200, b""),
        lambda prompt, response_format="json": json.dumps(
            {
                "verdict": "OBSERVABLE_SCOPE",
                "reason_code": "CONCRETE_DEPENDENCY_POLICY",
                "rationale": "Concrete dependency slots with pinned owner/repo prefixes.",
            }
        ),
    )
    res = json.loads(
        c.open_clearance_bundle(
            "Core SDK v2.4 Release Clearance",
            policy,
            VENDOR,
            "All dependencies must satisfy the target commercial license compatibility policy.",
            slots_spec,
            deadline,
        )
    )
    assert res["ok"] is True
    return res["bundle"]


def test_rejects_unbounded_global_github_prefix_and_refunds():
    mod, gl = _load_module()
    c = mod.LicenseFence()
    _set_tx(gl, BUYER, 500)
    res = json.loads(
        c.open_clearance_bundle(
            "Unbounded Prefix Bundle",
            "PROPRIETARY_COMMERCIAL",
            VENDOR,
            "Concrete scope charter for release clearance.",
            "dep-a=https://raw.githubusercontent.com/",
            1795431600,
        )
    )
    assert res["ok"] is False
    assert res["error"] == "PREFIX_MUST_BIND_OWNER_AND_REPO"
    assert int(json.loads(c.get_refundable_balance(BUYER))["refundable_wei"]) == 500
    assert int(json.loads(c.get_protocol_stats())["total_locked_wei"]) == 0


def test_blocks_cross_repo_agpl_spoofing_attack():
    mod, gl = _load_module()
    c = mod.LicenseFence()
    bundle = _open_bundle(c, gl, escrow=1000)

    # Attacker attempts to submit grafana AGPL URL against Slot 0 (bound to psf/requests)
    _set_tx(gl, AUDITOR_1, 200)
    res = json.loads(c.submit_slot_audit(bundle["bundle_id"], 0, AGPL_URL, 1, 20))
    assert res["ok"] is False
    assert res["error"] == "URL_OUTSIDE_SLOT_REPO_PREFIX"
    assert int(json.loads(c.get_refundable_balance(AUDITOR_1))["refundable_wei"]) == 200
    assert json.loads(c.get_bundle(bundle["bundle_id"]))["status"] == "OPEN"


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
            f"dep-a={REQUESTS_PREFIX}",
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
            f"dep-a={REQUESTS_PREFIX}",
            1795431600,
        )
    )
    assert res["ok"] is False
    assert res["verdict"] == "TOO_VAGUE"
    assert int(json.loads(c.get_refundable_balance(BUYER))["refundable_wei"]) == 750


def test_multi_slot_permissive_plus_weak_copyleft_clearance_and_wei_conservation():
    mod, gl = _load_module()
    c = mod.LicenseFence()
    bundle = _open_bundle(c, gl, policy="PROPRIETARY_COMMERCIAL", escrow=1001)

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

    ffmpeg_body = (
        b"Most files in FFmpeg are under the GNU Lesser General Public License version 2.1 or later (LGPL v2.1+).\n"
        b"None of these GPL parts are used by default unless --enable-gpl is passed.\n"
    )
    _set_tx(gl, AUDITOR_2, 175)
    _wire_nondet(
        gl,
        lambda url: _FakeWebResponse(200, ffmpeg_body),
        lambda prompt, response_format="json": json.dumps(
            {
                "verdict": "WEAK_COPYLEFT",
                "reason_code": "LGPL_OR_MPL_FILE_SCOPE",
                "evidence_quote": "GNU Lesser General Public License version 2.1",
                "rationale": "Default FFmpeg build is LGPL v2.1+ weak copyleft; optional GPL disabled by default.",
            }
        ),
    )
    r2 = json.loads(c.submit_slot_audit(bundle["bundle_id"], 1, FFMPEG_URL, 1, 2))
    assert r2["ok"] is True
    assert r2["bundle"]["status"] == "CLEARED_FOR_RELEASE"
    assert r2["bundle"]["cleared_slot_count"] == 2
    assert int(json.loads(c.get_protocol_stats())["total_locked_wei"]) == 0

    vendor_bal = int(json.loads(c.get_refundable_balance(VENDOR))["refundable_wei"])
    a1_bal = int(json.loads(c.get_refundable_balance(AUDITOR_1))["refundable_wei"])
    a2_bal = int(json.loads(c.get_refundable_balance(AUDITOR_2))["refundable_wei"])
    assert vendor_bal == 801
    assert a1_bal == 250
    assert a2_bal == 275
    assert (vendor_bal + (a1_bal - 150) + (a2_bal - 175)) == 1001


def test_bsl_source_available_contamination_short_circuit():
    mod, gl = _load_module()
    c = mod.LicenseFence()
    bundle = _open_bundle(
        c,
        gl,
        policy="PROPRIETARY_COMMERCIAL",
        slots_spec=f"service-mesh={CONSUL_PREFIX}|http-client={REQUESTS_PREFIX}",
        escrow=1000,
    )

    bsl_body = (
        b"Business Source License\n"
        b"Additional Use Grant: You may make production use provided Your use does not include offering "
        b"the Licensed Work on a hosted basis in order to compete with IBM Corp's paid version(s).\n"
    )
    _set_tx(gl, AUDITOR_1, 200)
    _wire_nondet(
        gl,
        lambda url: _FakeWebResponse(200, bsl_body),
        lambda prompt, response_format="json": json.dumps(
            {
                "verdict": "SOURCE_AVAILABLE_RESTRICTED",
                "reason_code": "BSL_OR_NON_COMPETE_RESTRICTION",
                "evidence_quote": "Business Source License",
                "rationale": "BSL non-compete clause restricts commercial competitive offerings.",
            }
        ),
    )
    res = json.loads(c.submit_slot_audit(bundle["bundle_id"], 0, CONSUL_URL, 1, 3))
    assert res["ok"] is True
    assert res["audit"]["audit_status"] == "CONTAMINATION_TRIGGERED"
    assert res["bundle"]["status"] == "CONTAMINATED"
    assert int(json.loads(c.get_refundable_balance(BUYER))["refundable_wei"]) == 800
    assert int(json.loads(c.get_refundable_balance(AUDITOR_1))["refundable_wei"]) == 400
    assert int(json.loads(c.get_refundable_balance(VENDOR))["refundable_wei"]) == 0


def test_per_auditor_retry_cap_prevents_slot_bricking():
    mod, gl = _load_module()
    c = mod.LicenseFence()
    bundle = _open_bundle(
        c, gl, policy="PERMISSIVE_ONLY", slots_spec=f"http-client={REQUESTS_PREFIX}", escrow=1000
    )

    # Spammer (AUDITOR_1) exhausts 5 retries with HTTP 503 / INSUFFICIENT_EVIDENCE
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

    # 6th attempt from AUDITOR_1 is blocked (and refunded)
    _set_tx(gl, AUDITOR_1, 100)
    res6 = json.loads(c.submit_slot_audit(bundle["bundle_id"], 0, APACHE_URL, 1, 5))
    assert res6["ok"] is False
    assert res6["error"] == "MAX_AUDITOR_ATTEMPTS_REACHED"
    assert int(json.loads(c.get_refundable_balance(AUDITOR_1))["refundable_wei"]) == 600

    # Honest AUDITOR_2 can STILL clear Slot 0 (slot was NOT bricked by AUDITOR_1!)
    _set_tx(gl, AUDITOR_2, 100)
    _wire_nondet(
        gl,
        lambda url: _FakeWebResponse(200, b"Apache License Version 2.0, January 2004"),
        lambda prompt, response_format="json": json.dumps(
            {
                "verdict": "PERMISSIVE",
                "reason_code": "APACHE_2_GRANT",
                "evidence_quote": "Apache License Version 2.0",
                "rationale": "Apache 2.0 permissive grant.",
            }
        ),
    )
    res_honest = json.loads(c.submit_slot_audit(bundle["bundle_id"], 0, APACHE_URL, 1, 1))
    assert res_honest["ok"] is True
    assert res_honest["bundle"]["status"] == "CLEARED_FOR_RELEASE"


def test_late_audit_after_deadline_rejected_and_refunded():
    mod, gl = _load_module()
    c = mod.LicenseFence()
    # 2026-11-23T10:00:00Z = 1795428000; deadline = +50s (1795428050)
    deadline = 1795428050
    bundle = _open_bundle(c, gl, deadline=deadline, escrow=1000)

    # Attempt audit at deadline + 5s (inside grace window) -> rejected with BUNDLE_DEADLINE_PASSED
    _set_tx(gl, AUDITOR_1, 150, dt="2026-11-23T10:00:55Z")
    res = json.loads(c.submit_slot_audit(bundle["bundle_id"], 0, APACHE_URL, 1, 5))
    assert res["ok"] is False
    assert res["error"] == "BUNDLE_DEADLINE_PASSED"
    assert int(json.loads(c.get_refundable_balance(AUDITOR_1))["refundable_wei"]) == 150


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
                "reason_code": "BSL_OR_NON_COMPETE_RESTRICTION",
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
    deadline = 1795428050
    bundle = _open_bundle(c, gl, deadline=deadline, escrow=1000)

    _set_tx(gl, BUYER, 0, dt="2026-11-23T10:00:30Z")
    with pytest.raises(mod.gl.vm.UserError, match="BUNDLE_NOT_EXPIRED"):
        c.settle_expired_bundle(bundle["bundle_id"])

    _set_tx(gl, BUYER, 0, dt="2026-11-23T10:01:00Z")
    with pytest.raises(mod.gl.vm.UserError, match="BUNDLE_NOT_EXPIRED"):
        c.settle_expired_bundle(bundle["bundle_id"])

    _set_tx(gl, BUYER, 0, dt="2026-11-23T10:01:05Z")
    res_exp = json.loads(c.settle_expired_bundle(bundle["bundle_id"]))
    assert res_exp["ok"] is True
    assert res_exp["bundle"]["status"] == "EXPIRED_REFUNDED"
    assert int(json.loads(c.get_refundable_balance(BUYER))["refundable_wei"]) == 1000

    w_res = json.loads(c.withdraw_refundable())
    assert w_res["ok"] is True
    assert int(w_res["withdrawn_wei"]) == 1000
    assert int(json.loads(c.get_refundable_balance(BUYER))["refundable_wei"]) == 0
    assert _TRANSFERS.transfers == [(BUYER, 1000)]

    with pytest.raises(mod.gl.vm.UserError, match="ZERO_REFUNDABLE_BALANCE"):
        c.withdraw_refundable()
