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
} from '../lib/validation';

const AUDIT_PRESETS = [
  {
    id: 'apache',
    label: 'Preset A · Apache-2.0 (psf/requests)',
    url: 'https://raw.githubusercontent.com/psf/requests/3c7baaa05ab4aa49cc819ce3a819d260de19c157/LICENSE',
    start: '1',
    end: '25',
  },
  {
    id: 'agpl',
    label: 'Preset B · AGPL-3.0 Contamination (grafana)',
    url: 'https://raw.githubusercontent.com/grafana/grafana/88998cea58e933452355eb4c7cbe1a452ef0f817/LICENSE',
    start: '1',
    end: '25',
  },
  {
    id: 'injection',
    label: 'Preset C · Prompt-Injection Defense (rebuff)',
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
}: {
  proof: ProofBundle;
  liveBundles: OnChainBundle[] | null;
  onRefreshLive: () => Promise<void>;
  isRefreshing: boolean;
}) {
  const [account, setAccount] = useState<string | null>(null);
  const [refundableWei, setRefundableWei] = useState<string>('0');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Open bundle form
  const [title, setTitle] = useState('Enterprise API Gateway Release v3.0');
  const [policy, setPolicy] = useState<TargetPolicy>('PROPRIETARY_COMMERCIAL');
  const [vendorAddr, setVendorAddr] = useState(proof.vendor_address);
  const [slotsCsv, setSlotsCsv] = useState('http-client,web-router');
  const [charter, setCharter] = useState(
    'All dependency slots must satisfy permissive or weak-copyleft SPDX licenses compatible with proprietary commercial shipping.'
  );
  const [prefix, setPrefix] = useState('https://raw.githubusercontent.com/');
  const [escrowGen, setEscrowGen] = useState('0.001');
  const [ttlSec, setTtlSec] = useState('86400');

  // Submit audit form
  const [bundleId, setBundleId] = useState('3');
  const [slotIdx, setSlotIdx] = useState('0');
  const [evidenceUrl, setEvidenceUrl] = useState(AUDIT_PRESETS[0].url);
  const [startLine, setStartLine] = useState(AUDIT_PRESETS[0].start);
  const [endLine, setEndLine] = useState(AUDIT_PRESETS[0].end);
  const [bondGen, setBondGen] = useState('0.0002');
  const [expireId, setExpireId] = useState('3');

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
      setStatusMsg(`Withdrawal tx submitted: ${tx}`);
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
    setBusy('open');
    setErrorMsg(null);
    try {
      const deadlineTs = Math.floor(Date.now() / 1000) + Math.max(30, Number(ttlSec) || 86400);
      const tx = await writeLicenseFenceMethod({
        account,
        contractAddress: proof.contract_address,
        functionName: 'open_clearance_bundle',
        args: [title.trim(), policy, vendorAddr.trim(), charter.trim(), slotsCsv.trim(), prefix.trim(), deadlineTs],
        value: parseGenToWei(escrowGen),
      });
      setStatusMsg(`open_clearance_bundle submitted: ${tx}`);
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
      setStatusMsg(`submit_slot_audit submitted: ${tx}`);
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
      setStatusMsg(`settle_expired_bundle submitted: ${tx}`);
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
        {/* Left: Open Bundle + Settle Expired */}
        <div className="space-y-5">
          <form
            onSubmit={(e) => void handleOpenBundle(e)}
            className="rounded-lg border border-white/[0.08] bg-[#0F0F12] p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <h3 className="font-mono text-sm font-semibold text-white">open_clearance_bundle</h3>
              <span className="text-xs text-zinc-500">Multi-Slot Escrow</span>
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

              <div className="grid grid-cols-2 gap-3">
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
                  <span className="text-zinc-400">Dependency Slots (CSV, 1–5)</span>
                  <input
                    value={slotsCsv}
                    onChange={(e) => setSlotsCsv(e.target.value)}
                    className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-2 font-mono text-zinc-100 focus:border-white/25 focus:outline-none"
                  />
                </label>
              </div>

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

              <label className="block">
                <span className="text-zinc-400">Allowed Source Prefix</span>
                <input
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-2 font-mono text-zinc-100 focus:border-white/25 focus:outline-none"
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
              <span className="text-zinc-400">Bundle ID to Expire (after deadline + 15s grace)</span>
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

        {/* Right: Submit Slot Audit + Live Bundles */}
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
              <span className="text-zinc-400">Immutable Evidence URL (40-Hex SHA)</span>
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

          {/* On-Chain Bundles Summary */}
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
