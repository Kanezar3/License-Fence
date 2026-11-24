import { useState } from 'react';
import { RefreshCw, Send, Wallet, ArrowDownToLine, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { OnChainBundle, ProofBundle, TargetPolicy } from '../types/licenseFence';
import {
  connectMetaMaskStudioNet,
  readRefundableBalance,
  STUDIONET_EXPLORER_URL,
  writeLicenseFenceMethod,
} from '../lib/genlayerClient';
import {
  formatWeiToGen,
  isValidEvmAddress,
  parseGenToWei,
  truncateMiddle,
  validateCommitPinnedGithubUrl,
  validateSlotSpecString,
} from '../lib/validation';

const AUDIT_PRESETS = [
  {
    id: 'ffmpeg',
    label: 'Preset A · FFmpeg LGPL v2.1+ (GitHub NOASSERTION)',
    bundleId: '1',
    slotIdx: '1',
    url: 'https://raw.githubusercontent.com/FFmpeg/FFmpeg/f9145f2284641ff1567a58aebe616370fd8f04d7/LICENSE.md',
    start: '1',
    end: '15',
  },
  {
    id: 'consul',
    label: 'Preset B · HashiCorp Consul BSL 1.1 (NOASSERTION)',
    bundleId: '2',
    slotIdx: '0',
    url: 'https://raw.githubusercontent.com/hashicorp/consul/1b3b4fc657b239ead67349bb7142095a566419d3/LICENSE',
    start: '1',
    end: '28',
  },
  {
    id: 'injection',
    label: 'Preset C · Prompt-Injection Defense (rebuff)',
    bundleId: '4',
    slotIdx: '1',
    url: 'https://raw.githubusercontent.com/protectai/rebuff/4d2fe064abf164e7381556d23e48e210080f8afa/python-sdk/tests/test_sdk.py',
    start: '1',
    end: '30',
  },
];

export function LiveDeskPanel({
  proof,
  liveBundles,
  onRefreshLive,
  isRefreshing,
  onTxSubmitted,
}: {
  proof: ProofBundle;
  liveBundles: OnChainBundle[] | null;
  onRefreshLive: () => Promise<void>;
  isRefreshing: boolean;
  onTxSubmitted: (txHash: string, label: string, action: string) => void;
}) {
  const [account, setAccount] = useState<string | null>(null);
  const [refundableWei, setRefundableWei] = useState<string>('0');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Open bundle form (per-slot repo-pinned spec)
  const [title, setTitle] = useState('Commercial Media & HTTP SDK v3.2');
  const [policy, setPolicy] = useState<TargetPolicy>('PROPRIETARY_COMMERCIAL');
  const [vendorAddr, setVendorAddr] = useState(proof.vendor_address);
  const [slotsSpec, setSlotsSpec] = useState(
    'http-client=https://raw.githubusercontent.com/psf/requests/\nmedia-codec=https://raw.githubusercontent.com/FFmpeg/FFmpeg/'
  );
  const [charter, setCharter] = useState(
    'Every dependency slot must verify permissive or weak-copyleft default licensing compatible with proprietary commercial distribution.'
  );
  const [escrowGen, setEscrowGen] = useState('0.001');
  const [ttlSec, setTtlSec] = useState('86400');

  // Submit audit form
  const [bundleId, setBundleId] = useState('4');
  const [slotIdx, setSlotIdx] = useState('1');
  const [evidenceUrl, setEvidenceUrl] = useState(AUDIT_PRESETS[2].url);
  const [startLine, setStartLine] = useState(AUDIT_PRESETS[2].start);
  const [endLine, setEndLine] = useState(AUDIT_PRESETS[2].end);
  const [bondGen, setBondGen] = useState('0.0002');
  const [expireId, setExpireId] = useState('4');

  const handleConnect = async () => {
    setErrorMsg(null);
    try {
      const addr = await connectMetaMaskStudioNet();
      setAccount(addr);
      const bal = await readRefundableBalance(proof.contract_address, addr);
      setRefundableWei(bal);
      setStatusMsg(`Connected ${truncateMiddle(addr)} on StudioNet (61999).`);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const handleWithdraw = async () => {
    if (!account) return;
    setBusy('withdraw');
    setErrorMsg(null);
    try {
      const tx = await writeLicenseFenceMethod({
        account,
        contractAddress: proof.contract_address,
        functionName: 'withdraw_refundable',
        args: [],
      });
      onTxSubmitted(tx, 'Withdraw Refundable Escrow', 'withdraw_refundable');
      setStatusMsg(`Withdrawal tx submitted and tracked in Consensus Telemetry: ${tx}`);
      const bal = await readRefundableBalance(proof.contract_address, account);
      setRefundableWei(bal);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleOpenBundle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) {
      setErrorMsg('Connect MetaMask (StudioNet 61999) first.');
      return;
    }
    if (!isValidEvmAddress(vendorAddr)) {
      setErrorMsg('Vendor beneficiary must be a valid 0x EVM address.');
      return;
    }
    const specCheck = validateSlotSpecString(slotsSpec);
    if (!specCheck.valid) {
      setErrorMsg(specCheck.reason || 'Invalid per-slot repo prefix spec.');
      return;
    }
    setBusy('open');
    setErrorMsg(null);
    try {
      const deadlineTs = Math.floor(Date.now() / 1000) + Math.max(30, Number(ttlSec) || 86400);
      const normalizedSpec = slotsSpec
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .join('|');
      const tx = await writeLicenseFenceMethod({
        account,
        contractAddress: proof.contract_address,
        functionName: 'open_clearance_bundle',
        args: [title.trim(), policy, vendorAddr.trim(), charter.trim(), normalizedSpec, deadlineTs],
        value: parseGenToWei(escrowGen),
      });
      onTxSubmitted(tx, `Open Bundle: ${title.trim()}`, 'open_clearance_bundle');
      setStatusMsg(`open_clearance_bundle submitted and added to resumable tracker: ${tx}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleSubmitAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) {
      setErrorMsg('Connect MetaMask (StudioNet 61999) first.');
      return;
    }
    const urlCheck = validateCommitPinnedGithubUrl(evidenceUrl);
    if (!urlCheck.valid) {
      setErrorMsg(urlCheck.reason || 'Invalid evidence URL');
      return;
    }
    setBusy('audit');
    setErrorMsg(null);
    try {
      const tx = await writeLicenseFenceMethod({
        account,
        contractAddress: proof.contract_address,
        functionName: 'submit_slot_audit',
        args: [Number(bundleId), Number(slotIdx), evidenceUrl.trim(), Number(startLine), Number(endLine)],
        value: parseGenToWei(bondGen),
      });
      onTxSubmitted(tx, `Audit Bundle #${bundleId} Slot ${slotIdx}`, 'submit_slot_audit');
      setStatusMsg(`submit_slot_audit submitted and added to resumable tracker: ${tx}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleSettleExpired = async () => {
    if (!account) {
      setErrorMsg('Connect MetaMask (StudioNet 61999) first.');
      return;
    }
    setBusy('expire');
    setErrorMsg(null);
    try {
      const tx = await writeLicenseFenceMethod({
        account,
        contractAddress: proof.contract_address,
        functionName: 'settle_expired_bundle',
        args: [Number(expireId)],
      });
      onTxSubmitted(tx, `Expire Bundle #${expireId}`, 'settle_expired_bundle');
      setStatusMsg(`settle_expired_bundle submitted and added to resumable tracker: ${tx}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const bundles = liveBundles ?? proof.on_chain_snapshot.bundles;

  return (
    <div className="space-y-5">
      {/* Wallet Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-[#0F0F12] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleConnect()}
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 cursor-pointer"
          >
            <Wallet className="h-3.5 w-3.5" />
            {account ? truncateMiddle(account) : 'Connect MetaMask (61999)'}
          </button>
          <button
            type="button"
            onClick={() => void onRefreshLive()}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.10] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.07] cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Sync On-Chain Tables
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-1.5 font-mono text-xs text-zinc-400">
            Refundable Escrow:{' '}
            <span className="text-emerald-300 font-semibold">{formatWeiToGen(refundableWei)}</span>
          </div>
          <button
            type="button"
            disabled={!account || busy !== null}
            onClick={() => void handleWithdraw()}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 cursor-pointer"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            Withdraw Escrow
          </button>
        </div>
      </div>

      {/* Audit Presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">Audit Presets:</span>
        {AUDIT_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setBundleId(p.bundleId);
              setSlotIdx(p.slotIdx);
              setEvidenceUrl(p.url);
              setStartLine(p.start);
              setEndLine(p.end);
            }}
            className="rounded-md border border-white/[0.08] bg-[#0F0F12] px-2.5 py-1 text-xs text-zinc-300 hover:border-white/[0.18] hover:text-white cursor-pointer"
          >
            {p.label}
          </button>
        ))}
      </div>

      {statusMsg && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="font-mono break-all">{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-md border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Two-Column Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-5">
          <form
            onSubmit={(e) => void handleOpenBundle(e)}
            className="rounded-lg border border-white/[0.08] bg-[#0F0F12] p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <h3 className="font-mono text-sm font-semibold text-white">open_clearance_bundle</h3>
              <span className="text-xs text-zinc-500">Per-Slot Repo Pinning</span>
            </div>

            <div className="space-y-2.5 text-xs">
              <label className="block">
                <span className="text-zinc-400">Release Title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-2 text-zinc-100 focus:border-white/25 focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="text-zinc-400">Target Policy</span>
                <select
                  value={policy}
                  onChange={(e) => setPolicy(e.target.value as TargetPolicy)}
                  className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-2 font-mono text-zinc-100 focus:border-white/25 focus:outline-none"
                >
                  <option value="PERMISSIVE_ONLY">PERMISSIVE_ONLY</option>
                  <option value="PROPRIETARY_COMMERCIAL">PROPRIETARY_COMMERCIAL</option>
                  <option value="SAAS_CLOUD_SERVICE">SAAS_CLOUD_SERVICE</option>
                </select>
              </label>

              <label className="block">
                <span className="text-zinc-400">
                  Dependency Slots (1–5 lines, <code className="text-zinc-300">name=https://raw.githubusercontent.com/owner/repo/</code>)
                </span>
                <textarea
                  rows={3}
                  value={slotsSpec}
                  onChange={(e) => setSlotsSpec(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-2 font-mono text-[11px] text-zinc-100 focus:border-white/25 focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="text-zinc-400">Vendor Beneficiary (0x...)</span>
                <input
                  value={vendorAddr}
                  onChange={(e) => setVendorAddr(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-2 font-mono text-zinc-100 focus:border-white/25 focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="text-zinc-400">Scope Charter</span>
                <textarea
                  rows={2}
                  value={charter}
                  onChange={(e) => setCharter(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-2 text-zinc-100 focus:border-white/25 focus:outline-none"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400">Escrow Collateral (GEN)</span>
                  <input
                    value={escrowGen}
                    onChange={(e) => setEscrowGen(e.target.value)}
                    className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-2 font-mono text-zinc-100 focus:border-white/25 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-zinc-400">Deadline TTL (Seconds)</span>
                  <input
                    value={ttlSec}
                    onChange={(e) => setTtlSec(e.target.value)}
                    className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-2 font-mono text-zinc-100 focus:border-white/25 focus:outline-none"
                  />
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy !== null}
              className="rounded-md bg-white px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-45 cursor-pointer"
            >
              {busy === 'open' ? 'Submitting...' : 'Fund & Open Bundle'}
            </button>
          </form>

          <div className="rounded-lg border border-white/[0.08] bg-[#0F0F12] p-4 flex flex-wrap items-end justify-between gap-3">
            <label className="text-xs flex-1 min-w-[140px]">
              <span className="text-zinc-400">Bundle ID to Expire (enforces deadline + 15s grace)</span>
              <input
                value={expireId}
                onChange={(e) => setExpireId(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-1.5 font-mono text-zinc-100"
              />
            </label>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleSettleExpired()}
              className="rounded-md border border-white/[0.12] bg-white/[0.04] px-3.5 py-2 font-mono text-xs text-zinc-200 hover:bg-white/[0.08] cursor-pointer"
            >
              settle_expired_bundle
            </button>
          </div>
        </div>

        <div className="space-y-5">
          <form
            onSubmit={(e) => void handleSubmitAudit(e)}
            className="rounded-lg border border-white/[0.08] bg-[#0F0F12] p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <h3 className="font-mono text-sm font-semibold text-white">submit_slot_audit</h3>
              <span className="text-xs text-zinc-500">40-Hex Commit-Pinned</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <label className="block">
                <span className="text-zinc-400">Bundle ID</span>
                <input
                  value={bundleId}
                  onChange={(e) => setBundleId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-2 font-mono text-zinc-100"
                />
              </label>
              <label className="block">
                <span className="text-zinc-400">Slot Index</span>
                <input
                  value={slotIdx}
                  onChange={(e) => setSlotIdx(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-2 font-mono text-zinc-100"
                />
              </label>
              <label className="block">
                <span className="text-zinc-400">Start Line</span>
                <input
                  value={startLine}
                  onChange={(e) => setStartLine(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-2 font-mono text-zinc-100"
                />
              </label>
              <label className="block">
                <span className="text-zinc-400">End Line</span>
                <input
                  value={endLine}
                  onChange={(e) => setEndLine(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-2 font-mono text-zinc-100"
                />
              </label>
            </div>

            <label className="block text-xs">
              <span className="text-zinc-400">Immutable Evidence URL (Must Match Slot&apos;s Bound Repo)</span>
              <input
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-2 font-mono text-zinc-100"
              />
            </label>

            <div className="flex items-end justify-between gap-3">
              <label className="block text-xs w-40">
                <span className="text-zinc-400">Audit Bond (GEN)</span>
                <input
                  value={bondGen}
                  onChange={(e) => setBondGen(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-2 font-mono text-zinc-100"
                />
              </label>
              <button
                type="submit"
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/35 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-45 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                {busy === 'audit' ? 'Submitting...' : 'Submit Slot Audit'}
              </button>
            </div>
          </form>

          <div className="rounded-lg border border-white/[0.08] bg-[#0F0F12] p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-100">On-Chain Clearance Bundles ({bundles.length})</span>
              <a
                href={`${STUDIONET_EXPLORER_URL}/address/${proof.contract_address}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-zinc-400 hover:text-white"
              >
                {truncateMiddle(proof.contract_address)}
              </a>
            </div>
            <div className="divide-y divide-white/[0.06] text-xs">
              {bundles.map((b) => (
                <div key={b.bundle_id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-200 truncate">
                      #{b.bundle_id} · {b.title}
                    </div>
                    <div className="font-mono text-[11px] text-zinc-500">
                      {b.target_policy} · {b.cleared_slot_count}/{b.total_slots} slots cleared
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-zinc-300 shrink-0">{b.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
