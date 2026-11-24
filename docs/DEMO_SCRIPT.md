# License Fence — 2-Minute Demo Script

1. **Zero-Wallet Inspection (`Bundle Dossiers`) — 45s**:
   - Open https://license-fence.vercel.app. Note the live `StudioNet · 61999 (Live)` indicator and 5-class SPDX Compatibility Lattice table at the bottom.
   - Select **`LF-03`** (*FFmpeg LGPL v2.1+ Default — GitHub `NOASSERTION`*): point out that FFmpeg's `LICENSE.md` mentions MIT, BSD, LGPL v2.1+, and optional `--enable-gpl` GPL v2+ in the same paragraph, causing GitHub's SPDX scanner to return `NOASSERTION`. Show that GenLayer validators classified it as `WEAK_COPYLEFT : LGPL_OR_MPL_FILE_SCOPE` (compatible with `PROPRIETARY_COMMERCIAL`), completing Bundle #1's 2-auditor 80/20 release (`CLEARED_FOR_RELEASE`). Click **Verify SHA-256 in Browser**.
   - Select **`LF-04`** (*HashiCorp Consul BSL 1.1 — GitHub `NOASSERTION`*): show how validators detected the IBM non-compete grant (`SOURCE_AVAILABLE_RESTRICTED`) and triggered the `CONTAMINATED` short-circuit (80% buyer refund + 20% auditor bounty).
   - Select **`LF-06`** and **`LF-07`**: show that cross-repo AGPL spoofing was blocked on-chain (`URL_OUTSIDE_SLOT_REPO_PREFIX`), and prompt injection inside `protectai/rebuff` was ignored with non-slashing auditor bond refund.
   - Point out the side-by-side **Recorded Proof vs. Live StudioNet RPC Read** strip and **GenLayer Native Appeal Window** panel.

2. **Live Resumable Consensus Telemetry (`Consensus Telemetry`) — 35s**:
   - Click **Load All 19 Exhibit Txs** to query live StudioNet RPC status (`getTransaction`) across all 19 finalized transactions, showing the 5-stage progress bars, `localStorage` persistence, 8s auto-polling, and expandable native Appeal Window rows.

3. **Interactive StudioNet Writes (`Clearance Desk`) — 40s**:
   - Click **Connect MetaMask (61999)** and **Sync On-Chain Tables**.
   - Show per-slot repo prefix pinning (`name=https://raw.githubusercontent.com/<owner>/<repo>/`) in `open_clearance_bundle`, select **Preset A / B / C** in `submit_slot_audit`, and explain that `genlayer-js@2.0.0` estimates StudioNet fees (`estimateTransactionFeesForWrite`) before submitting and tracks the returned tx hash in the resumable telemetry monitor.
