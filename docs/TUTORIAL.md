# License Fence — Technical Walkthrough & Developer Tutorial

**License Fence** (`contracts/license_fence.py`) is a GenLayer Intelligent Contract and StudioNet compliance console (`frontend/`) that enforces open-source license compatibility across multi-dependency software releases.

This tutorial explains why naive SPDX regex classifiers fail on real-world repositories, walks through the exact Python contract architecture in `contracts/license_fence.py`, and demonstrates how to verify and extend the protocol locally or on GenLayer StudioNet (`Chain ID 61999`).

---

## 1. Why License Compliance Requires GenLayer Optimistic Democracy

Automated SPDX scanners like GitHub's `licensee` work well on boilerplate single-license files, but return `NOASSERTION` whenever a repository contains conditional prose, composite notices, or custom commercial use grants. Two real-world examples proven live in `deploy/proof.json` illustrate why LLM validator consensus is necessary:

1. **`FFmpeg/FFmpeg/LICENSE.md` (`NOASSERTION` on GitHub):** The first 12 lines simultaneously mention `MIT`, `BSD`, `LGPL v2.1+`, and `GPL v2+`. A keyword matcher misclassifies it as GPL or MIT, whereas reading the prose reveals that *"In combination the LGPL v2.1+ applies to FFmpeg"* and GPL modules are *"not used by default"* unless `--enable-gpl` is passed. GenLayer validators classify default FFmpeg as `WEAK_COPYLEFT : LGPL_OR_MPL_FILE_SCOPE`, which is compatible with `PROPRIETARY_COMMERCIAL`.
2. **`hashicorp/consul/LICENSE` (`NOASSERTION` on GitHub):** Contains a Business Source License (BSL 1.1) Additional Use Grant prohibiting competitive hosted or embedded offerings against IBM Corp's paid versions. GenLayer validators read the non-compete restriction and classify it as `SOURCE_AVAILABLE_RESTRICTED : BSL_OR_NON_COMPETE_RESTRICTION`, immediately triggering the contamination short-circuit.

---

## 2. Architecture: "The Model Judges; Plain Python Moves Money"

License Fence strictly separates non-deterministic semantic classification from deterministic state and fund custody:

### A. Per-Slot Repository Prefix Pinning (Eliminating Self-Hosted Griefing)
A naive license escrow that accepts any `raw.githubusercontent.com` URL can be exploited by an attacker who pushes an AGPL `LICENSE` to their own GitHub repository to trigger a contamination bounty. In `contracts/license_fence.py`, every dependency slot in `open_clearance_bundle` MUST bind a specific `<owner>/<repo>/` prefix enforced by `_REPO_PREFIX_RE`:

```python
_REPO_PREFIX_RE = re.compile(
    r"^https://raw\.githubusercontent\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/$"
)
_GITHUB_RAW_RE = re.compile(
    r"^https://raw\.githubusercontent\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/[0-9a-fA-F]{40}/[^\s?#]+$"
)
```

During `submit_slot_audit`, any URL outside the slot's bound prefix is rejected deterministically with `URL_OUTSIDE_SLOT_REPO_PREFIX` and the auditor's bond is credited to `refundable_balances` via up-front deposit capture.

### B. Strict Verdict-to-Reason Compatibility & Evidence Agreement
Validators never vote on an unchecked status string alone. Inside `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`:
1. The leader fetches the 40-hex commit-pinned URL, slices `[start_line, end_line]` (`MAX_LINE_WINDOW = 120`, normalized to `<= 3000` chars), hashes `snippet_sha256`, and prompts the model with `<untrusted_evidence>` prompt-injection delimiters.
2. Every validator independently re-fetches the same URL, recomputes `val_sha`, verifies `l_sha == val_sha`, verifies the verbatim `evidence_quote` (`>= 12` chars) appears in its own fetched slice for conclusive classes, and enforces `VERDICT_COMPATIBLE_REASONS`:

```python
POLICY_ALLOWED_CLASSES = {
    "PERMISSIVE_ONLY": ("PERMISSIVE",),
    "PROPRIETARY_COMMERCIAL": ("PERMISSIVE", "WEAK_COPYLEFT"),
    "SAAS_CLOUD_SERVICE": ("PERMISSIVE", "WEAK_COPYLEFT", "STRONG_COPYLEFT"),
}
```

### C. Deterministic Multi-Slot Escrow Settlement & Conservation of Wei
Once validators agree on the license class, plain Python evaluates `_is_compatible_with_policy(target_policy, verdict)`:

- **Compatible Slot (`SLOT_CLEARED`):** Refunds the auditor's bond immediately. When all `N` slots clear, the bundle transitions to `CLEARED_FOR_RELEASE`: **80%** (`escrow_wei - auditor_pool`) is credited to `vendor_beneficiary`, and **20%** (`auditor_pool = escrow_wei // 5`) is divided across all `N` slot-clearing auditors (assigning any integer-division remainder to the final slot auditor so zero wei dust is lost).
- **Incompatible Copyleft or Source-Available Restriction (`CONTAMINATED`):** Short-circuits the entire bundle immediately—**80%** of escrow returns to the buyer (`creator`) and **20% + bond** goes to the discovering auditor.
- **Retryable Non-Slashing Outcomes (`INSUFFICIENT_EVIDENCE`, `UNVERIFIABLE_FETCH`):** Refunds `bond_wei` to the auditor and keeps the slot `PENDING`. Retry limits are enforced **per auditor per slot** (`MAX_AUDITOR_ATTEMPTS_PER_SLOT = 5`) so a spammer cannot permanently brick a slot for honest auditors.
- **Deadline, Grace Period & Pull Withdrawals:** `submit_slot_audit` enforces `now_ts <= deadline_ts` (using fail-closed `gl.message_raw["datetime"]`), `settle_expired_bundle` enforces `now_ts >= deadline_ts + EXPIRY_GRACE_SECONDS` (`15` seconds), and `withdraw_refundable` zeroes the balance before calling `_EoaRecipient(Address(sender)).emit_transfer(value=amount)`.

---

## 3. Running Tests & Verifying the Live StudioNet Proof

```bash
# 1. Run all 10 deterministic contract tests (per-slot pinning, deadline, grace, wei conservation)
pytest tests/test_license_fence.py -v

# 2. Verify all finalized StudioNet transactions, source SHA-256, and zero post-withdrawal balances
python deploy/verify_proof.py

# 3. Run frontend unit tests & build
npm --prefix frontend install
npm --prefix frontend run test
npm --prefix frontend run build
```

## 4. Using the Frontend & Native Appeal Window

- **Bundle Dossiers:** Inspect `LF-01`–`LF-08` without a wallet, compare **Recorded Proof (`deploy/proof.json`)** against **Live StudioNet RPC Reads**, recompute evidence SHA-256 digests in-browser via WebCrypto, and check GenLayer's native Appeal Window status.
- **Clearance Desk:** Connect MetaMask on StudioNet (`Chain ID 61999`), open new repo-pinned bundles, submit slot audits using the `NOASSERTION` presets, or withdraw refundable balances.
- **Consensus Telemetry:** Every transaction submitted from the desk—or loaded from the exhibit bundle—is persisted in `localStorage` and polled against StudioNet every 8 seconds across all 5 states (`SUBMITTED`, `PENDING`, `ACCEPTED`, `FINALIZED_SUCCESS`, `FINALIZED_ERROR`).
