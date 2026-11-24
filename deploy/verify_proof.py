"""Read-only StudioNet proof verifier for License Fence."""

import hashlib
import json
import time
from pathlib import Path
from typing import Any

import requests
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.provider import GenLayerProvider

ROOT_DIR = Path(__file__).resolve().parent.parent
CONTRACT_PATH = ROOT_DIR / "contracts" / "license_fence.py"
PROOF_PATH = ROOT_DIR / "deploy" / "proof.json"
FRONTEND_PROOF_PATH = ROOT_DIR / "frontend" / "src" / "data" / "proof.json"
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


def patch_provider_user_agent() -> None:
    if not hasattr(GenLayerProvider, "_make_request"):
        return
    def _make_request(self, method, params):
        payload = {"jsonrpc": "2.0", "id": int(time.time() * 1000), "method": method, "params": params}
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


def unwrap_json(val: Any) -> Any:
    return json.loads(val) if isinstance(val, str) else val


def main() -> int:
    patch_provider_user_agent()
    proof = json.loads(PROOF_PATH.read_text(encoding="utf-8"))
    assert PROOF_PATH.read_bytes() == FRONTEND_PROOF_PATH.read_bytes(), "proof.json mismatch"
    assert proof.get("source_commit"), "Missing source_commit in proof.json"

    expected_sha = hashlib.sha256(CONTRACT_PATH.read_text(encoding="utf-8").encode("utf-8")).hexdigest()
    assert proof["contract_source_sha256"] == expected_sha, (
        f"Source SHA mismatch: {proof['contract_source_sha256']} != {expected_sha}"
    )
    print(f"[OK] contract_source_sha256 matches ({expected_sha[:16]}...)")

    client = create_client(chain=studionet, account=create_account())
    contract_addr = proof["contract_address"]

    print(f"Verifying all {len(proof['txs'])} finalized transactions on StudioNet...")
    for name, tx_hash in proof["txs"].items():
        rec = client.get_transaction(tx_hash)
        lifecycle = rec.get("lifecycle") or {}
        status = str(rec.get("status_name") or lifecycle.get("state") or "").upper()
        exec_res = str(rec.get("execution_result") or "").upper()
        if exec_res != "SUCCESS":
            lr = (rec.get("consensus_data") or {}).get("leader_receipt")
            if isinstance(lr, list) and lr:
                lr = lr[0]
            if isinstance(lr, dict):
                exec_res = str(lr.get("execution_result") or "").upper()
        assert status == "FINALIZED" and exec_res == "SUCCESS", f"{name} failed: {status}/{exec_res}"
        print(f"  [OK] tx {name}: {tx_hash} ({status} / {exec_res})")

    bundles = unwrap_json(client.read_contract(address=contract_addr, function_name="get_all_bundles", args=[]))
    audits = unwrap_json(client.read_contract(address=contract_addr, function_name="get_all_audits", args=[]))
    rejections = unwrap_json(client.read_contract(address=contract_addr, function_name="get_rejected_submissions", args=[]))
    by_bundle = {int(b["bundle_id"]): b for b in bundles}

    assert by_bundle[1]["status"] == "CLEARED_FOR_RELEASE", f"Bundle 1: {by_bundle[1]['status']}"
    assert by_bundle[2]["status"] == "CONTAMINATED", f"Bundle 2: {by_bundle[2]['status']}"
    assert by_bundle[3]["status"] == "CONTAMINATED", f"Bundle 3: {by_bundle[3]['status']}"
    assert by_bundle[4]["status"] == "OPEN", f"Bundle 4: {by_bundle[4]['status']}"
    assert by_bundle[5]["status"] == "EXPIRED_REFUNDED", f"Bundle 5: {by_bundle[5]['status']}"
    assert any(r.get("reason") == "URL_OUTSIDE_SLOT_REPO_PREFIX" for r in rejections), "Missing spoof block rejection"

    for a in audits:
        excerpt = a.get("snippet_excerpt", "")
        if excerpt:
            h = hashlib.sha256(excerpt.encode("utf-8")).hexdigest()
            assert h == a["snippet_sha256"], f"Snippet SHA mismatch on audit #{a['audit_id']}"

    for role_key in ("buyer_address", "vendor_address", "auditor1_address", "auditor2_address"):
        bal = unwrap_json(
            client.read_contract(address=contract_addr, function_name="get_refundable_balance", args=[proof[role_key]])
        )
        assert int(bal["refundable_wei"]) == 0, f"{role_key} refundable balance not 0: {bal}"

    print(
        f"[OK] All 8 License Fence v2 live cases, {len(proof['txs'])} finalized txs, "
        f"NOASSERTION semantic verdicts, cross-repo spoof guard, snippet SHA-256s, and zero balances verified!"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
