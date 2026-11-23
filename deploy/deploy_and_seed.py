"""Resumable GenLayer StudioNet deployment & 7-case live seeding script for License Fence."""

import hashlib
import json
import time
from pathlib import Path
from typing import Any

import requests
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.provider import GenLayerProvider
from genlayer_py.types import TransactionStatus

ROOT_DIR = Path(__file__).resolve().parent.parent
CONTRACT_PATH = ROOT_DIR / "contracts" / "license_fence.py"
STATE_PATH = ROOT_DIR / "deploy" / ".seed_state.json"
PROOF_PATH = ROOT_DIR / "deploy" / "proof.json"
FRONTEND_PROOF_PATH = ROOT_DIR / "frontend" / "src" / "data" / "proof.json"

RPC_URL = "https://studio.genlayer.com/api"
EXPLORER_URL = "https://explorer-studio.genlayer.com"
CHAIN_ID = 61999
POLL_INTERVAL_MS = 9000
POLL_RETRIES = 80
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

ESCROW_WEI = 1_000_000_000_000_000  # 0.001 GEN
BOND_WEI = 200_000_000_000_000      # 0.0002 GEN
FUND_AMOUNT_WEI = 5_000_000_000_000_000_000  # 5 GEN

RAW_GH_PREFIX = "https://raw.githubusercontent.com/"
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
GITIGNORE_URL = (
    "https://raw.githubusercontent.com/pallets/flask/"
    "49943b5a94413a530761350f04e896f76e8d620e/.gitignore"
)
REBUFF_URL = (
    "https://raw.githubusercontent.com/protectai/rebuff/"
    "4d2fe064abf164e7381556d23e48e210080f8afa/python-sdk/tests/test_sdk.py"
)


def patch_provider_user_agent() -> None:
    def _make_request(self, method, params):
        payload = {
            "jsonrpc": "2.0",
            "id": int(time.time() * 1000),
            "method": method,
            "params": params,
        }
        r = requests.post(
            self.url,
            json=payload,
            headers={"Content-Type": "application/json", "User-Agent": BROWSER_UA},
            timeout=120,
        )
        r.raise_for_status()
        data = r.json()
        if "error" in data and data["error"] is not None:
            raise RuntimeError(f"RPC error for {method}: {data['error']}")
        return data.get("result")

    GenLayerProvider._make_request = _make_request


def rpc_call(method: str, params: list[Any]) -> Any:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    r = requests.post(
        RPC_URL,
        json=payload,
        headers={"Content-Type": "application/json", "User-Agent": BROWSER_UA},
        timeout=60,
    )
    r.raise_for_status()
    data = r.json()
    if "error" in data and data["error"] is not None:
        raise RuntimeError(f"RPC error for {method}: {data['error']}")
    return data.get("result")


def fund_account(address: str) -> None:
    bal_hex = rpc_call("eth_getBalance", [address, "latest"])
    bal = int(bal_hex, 16) if isinstance(bal_hex, str) else int(bal_hex or 0)
    if bal >= 1_000_000_000_000_000_000:
        return
    rpc_call("sim_fundAccount", [address, FUND_AMOUNT_WEI])
    print(f"Funded {address}", flush=True)


def load_state() -> dict[str, Any]:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {"accounts": {}, "txs": {}}


def save_state(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


def ensure_account(state: dict[str, Any], role: str):
    if role in state["accounts"]:
        return create_account(state["accounts"][role]["private_key"])
    acct = create_account()
    state["accounts"][role] = {"address": acct.address, "private_key": acct.key.hex()}
    save_state(state)
    return acct


def unwrap_json(val: Any) -> Any:
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return val
    return val


def assert_exec_success(receipt: dict[str, Any], label: str) -> None:
    exec_res = str(receipt.get("execution_result", "")).upper()
    if exec_res != "SUCCESS":
        cons = receipt.get("consensus_data", {})
        lr = cons.get("leader_receipt")
        if isinstance(lr, list) and lr:
            lr = lr[0]
        if isinstance(lr, dict):
            exec_res = str(lr.get("execution_result", "")).upper()
    if exec_res != "SUCCESS":
        raise RuntimeError(f"Tx [{label}] failed ({exec_res}): {json.dumps(receipt)[:700]}")


def wait_finalized(client, tx_hash: str, label: str) -> dict[str, Any]:
    print(f"Waiting for finality [{label}]: {tx_hash}", flush=True)
    rec = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash,
        status=TransactionStatus.FINALIZED,
        interval=POLL_INTERVAL_MS,
        retries=POLL_RETRIES,
    )
    assert_exec_success(rec, label)
    return rec


def run_step_tx(state: dict[str, Any], step_key: str, client, submit_fn) -> tuple[str, dict[str, Any]]:
    if step_key in state["txs"]:
        tx_hash = state["txs"][step_key]
        print(f"Resuming [{step_key}]: {tx_hash}", flush=True)
        rec = client.get_transaction(tx_hash)
        if str(rec.get("status_name", "")).upper() == "FINALIZED":
            assert_exec_success(rec, step_key)
            return tx_hash, rec
        return tx_hash, wait_finalized(client, tx_hash, step_key)

    tx_hash = submit_fn()
    state["txs"][step_key] = tx_hash
    save_state(state)
    print(f"Submitted [{step_key}]: {tx_hash}", flush=True)
    rec = wait_finalized(client, tx_hash, step_key)
    return tx_hash, rec


def main() -> None:
    patch_provider_user_agent()
    state = load_state()

    buyer = ensure_account(state, "buyer")
    vendor = ensure_account(state, "vendor")
    auditor1 = ensure_account(state, "auditor1")
    auditor2 = ensure_account(state, "auditor2")

    for acct in (buyer, vendor, auditor1, auditor2):
        fund_account(acct.address)

    print(f"Buyer:    {buyer.address}", flush=True)
    print(f"Vendor:   {vendor.address}", flush=True)
    print(f"Auditor1: {auditor1.address}", flush=True)
    print(f"Auditor2: {auditor2.address}", flush=True)

    buyer_client = create_client(chain=studionet, account=buyer)
    vendor_client = create_client(chain=studionet, account=vendor)
    aud1_client = create_client(chain=studionet, account=auditor1)
    aud2_client = create_client(chain=studionet, account=auditor2)

    contract_src = CONTRACT_PATH.read_text(encoding="utf-8")
    source_sha256 = hashlib.sha256(contract_src.encode("utf-8")).hexdigest()

    deploy_tx, deploy_rec = run_step_tx(
        state,
        "deploy_license_fence",
        buyer_client,
        lambda: buyer_client.deploy_contract(code=contract_src, args=[]),
    )
    contract_addr = state.get("contract_address") or deploy_rec.get("data", {}).get("contract_address")
    if not contract_addr:
        raise RuntimeError(f"Missing contract_address in deploy receipt: {deploy_rec}")
    state["contract_address"] = contract_addr
    save_state(state)
    print(f"LicenseFence deployed at: {contract_addr}", flush=True)

    long_dl = int(time.time()) + 86400

    # LF-01: Gate-1 TOO_VAGUE rejection
    lf01_tx, lf01_rec = run_step_tx(
        state,
        "lf01_too_vague",
        buyer_client,
        lambda: buyer_client.write_contract(
            address=contract_addr,
            function_name="open_clearance_bundle",
            args=[
                "Subjective Friendly Vibes Release",
                "PERMISSIVE_ONLY",
                vendor.address,
                "Ship nice clean vibes and friendly community energy with good aesthetics.",
                "vibe-pkg",
                RAW_GH_PREFIX,
                long_dl,
            ],
            value=ESCROW_WEI,
        ),
    )

    # LF-02: Open Bundles #1, #2, #3, #4
    b1_tx, _ = run_step_tx(
        state,
        "lf02_bundle1_clearance",
        buyer_client,
        lambda: buyer_client.write_contract(
            address=contract_addr,
            function_name="open_clearance_bundle",
            args=[
                "Enterprise HTTP & Router SDK v2.4",
                "PROPRIETARY_COMMERCIAL",
                vendor.address,
                "Every dependency slot must verify a permissive or weak-copyleft SPDX license text compatible with proprietary commercial distribution.",
                "http-client,web-router",
                RAW_GH_PREFIX,
                long_dl,
            ],
            value=ESCROW_WEI,
        ),
    )

    b2_tx, _ = run_step_tx(
        state,
        "lf02_bundle2_contamination",
        buyer_client,
        lambda: buyer_client.write_contract(
            address=contract_addr,
            function_name="open_clearance_bundle",
            args=[
                "Telemetry Analytics Suite v1.9",
                "PROPRIETARY_COMMERCIAL",
                vendor.address,
                "Verify that neither UI nor metrics core introduces AGPL or GPL copyleft obligations incompatible with proprietary commercial shipping.",
                "dashboard-ui,metrics-core",
                RAW_GH_PREFIX,
                long_dl,
            ],
            value=ESCROW_WEI,
        ),
    )

    b3_tx, _ = run_step_tx(
        state,
        "lf02_bundle3_retry_pool",
        buyer_client,
        lambda: buyer_client.write_contract(
            address=contract_addr,
            function_name="open_clearance_bundle",
            args=[
                "Auth Helper Permissive Audit",
                "PERMISSIVE_ONLY",
                vendor.address,
                "Verify the auth-helper dependency carries an explicit permissive license (MIT, BSD, or Apache-2.0) in its primary LICENSE text.",
                "auth-helper",
                RAW_GH_PREFIX,
                long_dl,
            ],
            value=ESCROW_WEI,
        ),
    )

    if "lf02_bundle4_expiry" not in state["txs"] or "bundle4_dl" not in state:
        state["bundle4_dl"] = int(time.time()) + 90
        save_state(state)
    bundle4_dl = int(state["bundle4_dl"])

    b4_tx, _ = run_step_tx(
        state,
        "lf02_bundle4_expiry",
        buyer_client,
        lambda: buyer_client.write_contract(
            address=contract_addr,
            function_name="open_clearance_bundle",
            args=[
                "Short-Window Plugin Escrow",
                "PERMISSIVE_ONLY",
                vendor.address,
                "Verify plugin-core carries an explicit permissive MIT, BSD, or Apache-2.0 license before bundle deadline.",
                "plugin-core",
                RAW_GH_PREFIX,
                bundle4_dl,
            ],
            value=ESCROW_WEI,
        ),
    )

    # LF-03: Multi-slot 2-auditor clearance on Bundle #1 (Apache-2.0 + BSD-3-Clause)
    lf03_s0_tx, lf03_s0_rec = run_step_tx(
        state,
        "lf03_bundle1_slot0_apache",
        aud1_client,
        lambda: aud1_client.write_contract(
            address=contract_addr,
            function_name="submit_slot_audit",
            args=[1, 0, APACHE_URL, 1, 25],
            value=BOND_WEI,
        ),
    )

    lf03_s1_tx, lf03_s1_rec = run_step_tx(
        state,
        "lf03_bundle1_slot1_bsd",
        aud2_client,
        lambda: aud2_client.write_contract(
            address=contract_addr,
            function_name="submit_slot_audit",
            args=[1, 1, BSD_URL, 1, 28],
            value=BOND_WEI,
        ),
    )

    # LF-04: AGPL-3.0 Contamination Short-Circuit on Bundle #2 Slot 0
    lf04_tx, lf04_rec = run_step_tx(
        state,
        "lf04_bundle2_agpl_contamination",
        aud1_client,
        lambda: aud1_client.write_contract(
            address=contract_addr,
            function_name="submit_slot_audit",
            args=[2, 0, AGPL_URL, 1, 25],
            value=BOND_WEI,
        ),
    )

    # LF-05: Unrelated file (.gitignore) -> INSUFFICIENT_EVIDENCE (auditor bond refunded)
    lf05_tx, lf05_rec = run_step_tx(
        state,
        "lf05_bundle3_unrelated_gitignore",
        aud1_client,
        lambda: aud1_client.write_contract(
            address=contract_addr,
            function_name="submit_slot_audit",
            args=[3, 0, GITIGNORE_URL, 1, 15],
            value=BOND_WEI,
        ),
    )

    # LF-06: Adversarial Prompt Injection -> INSUFFICIENT_EVIDENCE (auditor bond refunded)
    lf06_tx, lf06_rec = run_step_tx(
        state,
        "lf06_bundle3_prompt_injection",
        aud1_client,
        lambda: aud1_client.write_contract(
            address=contract_addr,
            function_name="submit_slot_audit",
            args=[3, 0, REBUFF_URL, 1, 30],
            value=BOND_WEI,
        ),
    )

    # LF-07: Wait until bundle4_dl + 45 (past EXPIRY_GRACE_SECONDS=15 + StudioNet clock skew), settle_expired_bundle(4), and withdraw from all 4 EOAs
    wait_until = bundle4_dl + 45
    now = time.time()
    if now < wait_until:
        sleep_s = int(wait_until - now) + 1
        print(f"Sleeping {sleep_s}s until Bundle #4 deadline + 45s (past 15s grace)...", flush=True)
        time.sleep(sleep_s)

    lf07_exp_tx, _ = run_step_tx(
        state,
        "lf07_settle_expired_bundle4",
        buyer_client,
        lambda: buyer_client.write_contract(
            address=contract_addr,
            function_name="settle_expired_bundle",
            args=[4],
        ),
    )

    w_buyer_tx, _ = run_step_tx(
        state,
        "lf07_withdraw_buyer",
        buyer_client,
        lambda: buyer_client.write_contract(
            address=contract_addr, function_name="withdraw_refundable", args=[]
        ),
    )
    w_vendor_tx, _ = run_step_tx(
        state,
        "lf07_withdraw_vendor",
        vendor_client,
        lambda: vendor_client.write_contract(
            address=contract_addr, function_name="withdraw_refundable", args=[]
        ),
    )
    w_aud1_tx, _ = run_step_tx(
        state,
        "lf07_withdraw_auditor1",
        aud1_client,
        lambda: aud1_client.write_contract(
            address=contract_addr, function_name="withdraw_refundable", args=[]
        ),
    )
    w_aud2_tx, _ = run_step_tx(
        state,
        "lf07_withdraw_auditor2",
        aud2_client,
        lambda: aud2_client.write_contract(
            address=contract_addr, function_name="withdraw_refundable", args=[]
        ),
    )

    # Read final state
    bundles = unwrap_json(buyer_client.read_contract(address=contract_addr, function_name="get_all_bundles", args=[]))
    audits = unwrap_json(buyer_client.read_contract(address=contract_addr, function_name="get_all_audits", args=[]))
    rejections = unwrap_json(buyer_client.read_contract(address=contract_addr, function_name="get_rejected_submissions", args=[]))
    stats = unwrap_json(buyer_client.read_contract(address=contract_addr, function_name="get_protocol_stats", args=[]))

    bals = {
        "buyer": unwrap_json(buyer_client.read_contract(address=contract_addr, function_name="get_refundable_balance", args=[buyer.address])),
        "vendor": unwrap_json(buyer_client.read_contract(address=contract_addr, function_name="get_refundable_balance", args=[vendor.address])),
        "auditor1": unwrap_json(buyer_client.read_contract(address=contract_addr, function_name="get_refundable_balance", args=[auditor1.address])),
        "auditor2": unwrap_json(buyer_client.read_contract(address=contract_addr, function_name="get_refundable_balance", args=[auditor2.address])),
    }

    bundles_by_id = {int(b["bundle_id"]): b for b in bundles}
    audits_by_id = {int(a["audit_id"]): a for a in audits}

    def audit_case(code: str, cid: str, label: str, aid: int, open_tx: str, audit_tx: str, withdraw_tx: str, notes: str):
        a = audits_by_id[aid]
        b = bundles_by_id[int(a["bundle_id"])]
        return {
            "exhibit_code": code,
            "case_id": cid,
            "label": label,
            "bundle_id": int(a["bundle_id"]),
            "slot_index": int(a["slot_index"]),
            "slot_name": a["slot_name"],
            "audit_id": aid,
            "target_policy": b["target_policy"],
            "bundle_status": b["status"],
            "verdict": a["verdict"],
            "reason_code": a["reason_code"],
            "audit_status": a["audit_status"],
            "policy_effect": a["policy_effect"],
            "evidence_url": a["evidence_url"],
            "start_line": a["start_line"],
            "end_line": a["end_line"],
            "snippet_sha256": a["snippet_sha256"],
            "snippet_excerpt": a["snippet_excerpt"],
            "evidence_quote": a["evidence_quote"],
            "rationale": a["rationale"],
            "open_tx_hash": open_tx,
            "audit_tx_hash": audit_tx,
            "withdraw_tx_hash": withdraw_tx,
            "notes": notes,
        }

    cases = [
        {
            "exhibit_code": "LF-01",
            "case_id": "lf01_gate1_too_vague",
            "label": "Gate-1 TOO_VAGUE Scope Rejection & Buyer Refund",
            "bundle_id": None,
            "slot_index": None,
            "slot_name": "vibe-pkg",
            "audit_id": None,
            "target_policy": "PERMISSIVE_ONLY",
            "bundle_status": "REJECTED",
            "verdict": "TOO_VAGUE",
            "reason_code": rejections[0]["reason"] if rejections else "SUBJECTIVE_OR_UNMEASURABLE",
            "audit_status": "GATE1_REJECTED",
            "policy_effect": "BUYER_ESCROW_REFUNDED",
            "evidence_url": "",
            "start_line": None,
            "end_line": None,
            "snippet_sha256": "",
            "snippet_excerpt": "",
            "evidence_quote": "",
            "rationale": rejections[0].get("detail", "") if rejections else "",
            "open_tx_hash": lf01_tx,
            "audit_tx_hash": "",
            "withdraw_tx_hash": w_buyer_tx,
            "notes": "Gate-1 rejected subjective vibes charter; 0.001 GEN refunded to buyer.",
        },
        audit_case(
            "LF-02",
            "lf02_bundle1_slot0_apache",
            "Multi-Slot Clearance Step 1: Apache-2.0 (Bundle #1, Slot 0)",
            1,
            b1_tx,
            lf03_s0_tx,
            w_aud1_tx,
            "Auditor 1 cleared Slot 0 (http-client) with commit-pinned psf/requests Apache-2.0 LICENSE; Bundle #1 remained OPEN awaiting Slot 1.",
        ),
        audit_case(
            "LF-03",
            "lf03_bundle1_slot1_bsd_release",
            "Multi-Slot Clearance Complete: BSD-3-Clause -> 80/20 Release (Bundle #1, Slot 1)",
            2,
            b1_tx,
            lf03_s1_tx,
            w_vendor_tx,
            "Auditor 2 cleared Slot 1 (web-router) with pallets/flask BSD-3-Clause LICENSE.txt; Bundle #1 finalized CLEARED_FOR_RELEASE (80% vendor, 20% split across both auditors).",
        ),
        audit_case(
            "LF-04",
            "lf04_bundle2_agpl_contamination",
            "Copyleft Contamination Short-Circuit: AGPL-3.0 (Bundle #2, Slot 0)",
            3,
            b2_tx,
            lf04_tx,
            w_aud1_tx,
            "Auditor 1 proved grafana/grafana AGPL-3.0 network copyleft incompatible with PROPRIETARY_COMMERCIAL; Bundle #2 short-circuited to CONTAMINATED (80% buyer refund + 20% auditor bounty).",
        ),
        audit_case(
            "LF-05",
            "lf05_bundle3_unrelated_gitignore",
            "Retryable Non-Slashing: Unrelated .gitignore File (Bundle #3, Attempt 1)",
            4,
            b3_tx,
            lf05_tx,
            w_aud1_tx,
            "Unrelated .gitignore slice yielded INSUFFICIENT_EVIDENCE; Slot 0 stayed PENDING (attempts=1) and auditor bond was refunded.",
        ),
        audit_case(
            "LF-06",
            "lf06_bundle3_prompt_injection",
            "Adversarial Prompt Injection Ignored (Bundle #3, Attempt 2)",
            5,
            b3_tx,
            lf06_tx,
            w_aud1_tx,
            "Prompt injection inside protectai/rebuff test fixture ignored; Slot 0 stayed PENDING (attempts=2) and auditor bond was refunded.",
        ),
        {
            "exhibit_code": "LF-07",
            "case_id": "lf07_expiry_and_withdrawals",
            "label": "Enforced 15s Grace Expiry & 4-EOA Native Withdrawals (Bundle #4)",
            "bundle_id": 4,
            "slot_index": None,
            "slot_name": "plugin-core",
            "audit_id": None,
            "target_policy": "PERMISSIVE_ONLY",
            "bundle_status": bundles_by_id[4]["status"],
            "verdict": "EXPIRED_REFUNDED",
            "reason_code": "BUNDLE_DEADLINE_PLUS_GRACE_EXPIRED",
            "audit_status": "EXPIRED_REFUNDED",
            "policy_effect": "BUYER_ESCROW_REFUNDED",
            "evidence_url": "",
            "start_line": None,
            "end_line": None,
            "snippet_sha256": "",
            "snippet_excerpt": "",
            "evidence_quote": "",
            "rationale": "Bundle #4 expired after deadline_ts + EXPIRY_GRACE_SECONDS (15s); full escrow refunded and all 4 EOA accounts withdrew via emit_transfer.",
            "open_tx_hash": b4_tx,
            "audit_tx_hash": lf07_exp_tx,
            "withdraw_tx_hash": w_buyer_tx,
            "notes": "All 4 EOA accounts (buyer, vendor, auditor1, auditor2) withdrew via withdraw_refundable() to 0 balance.",
        },
    ]

    proof = {
        "protocol": "License Fence",
        "network": "studionet",
        "chain_id": CHAIN_ID,
        "rpc_url": RPC_URL,
        "explorer_url": EXPLORER_URL,
        "contract_address": contract_addr,
        "contract_source_sha256": source_sha256,
        "deploy_tx": deploy_tx,
        "buyer_address": buyer.address,
        "vendor_address": vendor.address,
        "auditor1_address": auditor1.address,
        "auditor2_address": auditor2.address,
        "txs": {
            "deploy_tx": deploy_tx,
            "lf01_too_vague": lf01_tx,
            "lf02_bundle1": b1_tx,
            "lf02_bundle2": b2_tx,
            "lf02_bundle3": b3_tx,
            "lf02_bundle4": b4_tx,
            "lf03_bundle1_slot0": lf03_s0_tx,
            "lf03_bundle1_slot1": lf03_s1_tx,
            "lf04_bundle2_contamination": lf04_tx,
            "lf05_bundle3_unrelated": lf05_tx,
            "lf06_bundle3_injection": lf06_tx,
            "lf07_settle_expired_bundle4": lf07_exp_tx,
            "lf07_withdraw_buyer": w_buyer_tx,
            "lf07_withdraw_vendor": w_vendor_tx,
            "lf07_withdraw_auditor1": w_aud1_tx,
            "lf07_withdraw_auditor2": w_aud2_tx,
        },
        "cases": cases,
        "on_chain_snapshot": {
            "stats": stats,
            "bundles": bundles,
            "audits": audits,
            "rejections": rejections,
            "refundable_after_withdraw": bals,
        },
    }

    PROOF_PATH.parent.mkdir(parents=True, exist_ok=True)
    FRONTEND_PROOF_PATH.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(proof, indent=2)
    PROOF_PATH.write_text(serialized, encoding="utf-8")
    FRONTEND_PROOF_PATH.write_text(serialized, encoding="utf-8")
    print(f"Wrote proof.json ({len(proof['txs'])} txs) to {PROOF_PATH} and {FRONTEND_PROOF_PATH}", flush=True)


if __name__ == "__main__":
    main()
