# License Fence Tutorial

**License Fence** is a GenLayer Intelligent Contract (`contracts/license_fence.py`) and React/Vite dApp (`frontend/`) implementing a deterministic **SPDX Compatibility Lattice** over multi-slot release clearance bundles.

## 1. Core Mechanism: Deterministic Lattice + Optimistic Democracy

1. **Open Clearance Bundle (`open_clearance_bundle`, payable)**:
   - A buyer locks GEN escrow (`escrow_wei`) across `1..5` named dependency slots under a target compliance policy:
     - `PERMISSIVE_ONLY`: allows `PERMISSIVE` only.
     - `PROPRIETARY_COMMERCIAL`: allows `PERMISSIVE` and `WEAK_COPYLEFT`.
     - `SAAS_CLOUD_SERVICE`: allows `PERMISSIVE`, `WEAK_COPYLEFT`, and `STRONG_COPYLEFT`.
   - **Gate 1 (Clarity Check)**: GenLayer validators verify the scope charter is objectively verifiable (`OBSERVABLE_SCOPE`) rather than subjective (`TOO_VAGUE`). Any validation error or `TOO_VAGUE` verdict immediately credits `escrow_wei` to `refundable_balances[sender]`.

2. **Per-Slot Semantic Audit (`submit_slot_audit`, payable)**:
   - Auditors post a bond (`bond_wei`) and submit a 40-hex commit-pinned `raw.githubusercontent.com` URL and line window (`<= 120` lines, normalized `<= 3000` chars).
   - **Gate 2 (Optimistic Democracy)**: Validators independently fetch the commit-pinned slice, verify `snippet_sha256`, ignore prompt-injection instructions inside `<untrusted_evidence>`, verify a verbatim quote (`>= 12` chars) for conclusive verdicts, and enforce the strict `VERDICT_COMPATIBLE_REASONS` table.

3. **Deterministic Settlement in Plain Python**:
   - **Compatible Slot (`SLOT_CLEARED`)**: Refunds the auditor's bond immediately. When **all `N` slots** are cleared, the bundle finalizes as `CLEARED_FOR_RELEASE`: **80%** of escrow is credited to `vendor_beneficiary` and **20%** is split across all `N` slot-clearing auditors (with any integer remainder credited to the final slot auditor for exact wei conservation).
   - **Copyleft Contamination Short-Circuit (`CONTAMINATED`)**: If any slot is classified into a license class disallowed by `target_policy` (e.g., `NETWORK_COPYLEFT` AGPL-3.0 under `PROPRIETARY_COMMERCIAL`), the bundle immediately short-circuits to `CONTAMINATED`: **80%** of escrow is refunded to the buyer (`creator`) and **20% + bond** is credited to the discovering auditor.
   - **Retryable Non-Slashing Outcomes (`INSUFFICIENT_EVIDENCE` / `UNVERIFIABLE_FETCH`)**: The slot stays `PENDING` (up to `MAX_SLOT_ATTEMPTS = 5`), and the auditor's full `bond_wei` is refunded to `refundable_balances[sender]`.

4. **Expiry & Pull Withdrawals**:
   - **Pool Expiry (`settle_expired_bundle`)**: Once `now_ts >= deadline_ts + EXPIRY_GRACE_SECONDS` (`EXPIRY_GRACE_SECONDS = 15`), any caller can settle an `OPEN` bundle to `EXPIRED_REFUNDED`, crediting `escrow_wei` back to `creator`.
   - **Pull Withdrawals (`withdraw_refundable`)**: Uses checks-effects-interactions (zeroes `refundable_balances[sender]` first) and transfers native GEN via `_EoaRecipient(Address(sender)).emit_transfer(value=amount)`.

## 2. Running Locally

```bash
# 1. Run contract unit tests
pytest tests/test_license_fence.py -v

# 2. Verify live StudioNet proof bundle (read-only)
python deploy/verify_proof.py

# 3. Run frontend tests and build
npm --prefix frontend install
npm --prefix frontend run test
npm --prefix frontend run build
```
