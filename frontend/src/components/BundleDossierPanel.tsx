import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Fingerprint,
  AlertTriangle,
} from 'lucide-react';
import type { LiveTxStatus, OnChainBundle, ProofBundle, ProofCase } from '../types/licenseFence';
import { computeSha256Hex, formatWeiToGen, truncateMiddle } from '../lib/validation';
import { getVerdictDotColor, VerdictBadge } from './VerdictBadge';
import { AppealWindowPanel } from './AppealWindowPanel';

const POLICIES = ['PERMISSIVE_ONLY', 'PROPRIETARY_COMMERCIAL', 'SAAS_CLOUD_SERVICE'] as const;
const CLASSES = [
  'PERMISSIVE',
  'WEAK_COPYLEFT',
  'STRONG_COPYLEFT',
  'NETWORK_COPYLEFT',
  'SOURCE_AVAILABLE_RESTRICTED',
] as const;
const ALLOWED: Record<string, string[]> = {
  PERMISSIVE_ONLY: ['PERMISSIVE'],
  PROPRIETARY_COMMERCIAL: ['PERMISSIVE', 'WEAK_COPYLEFT'],
  SAAS_CLOUD_SERVICE: ['PERMISSIVE', 'WEAK_COPYLEFT', 'STRONG_COPYLEFT'],
};

export function BundleDossierPanel({
  proof,
  liveBundles,
  liveTxMap,
  rpcState,
}: {
  proof: ProofBundle;
  liveBundles: OnChainBundle[] | null;
  liveTxMap: Record<string, LiveTxStatus>;
  rpcState: 'idle' | 'live' | 'error';
}) {
  const [selectedCode, setSelectedCode] = useState<string>(proof.cases[0]?.exhibit_code ?? 'LF-01');
  const [filter, setFilter] = useState<string>('ALL');
  const [shaStatus, setShaStatus] = useState<'idle' | 'verified' | 'mismatch'>('idle');

  const cases = proof.cases.filter((c) => {
    if (filter === 'ALL') return true;
    if (filter === 'CLEARED')
      return c.bundle_status === 'CLEARED_FOR_RELEASE' || c.verdict === 'PERMISSIVE' || c.verdict === 'WEAK_COPYLEFT';
    if (filter === 'CONTAMINATED')
      return (
        c.bundle_status === 'CONTAMINATED' ||
        c.verdict === 'NETWORK_COPYLEFT' ||
        c.verdict === 'SOURCE_AVAILABLE_RESTRICTED'
      );
    if (filter === 'RETRY') return c.verdict === 'INSUFFICIENT_EVIDENCE' || c.verdict === 'TOO_VAGUE';
    if (filter === 'EXPIRED') return c.verdict === 'EXPIRED_REFUNDED';
    return true;
  });

  const active: ProofCase =
    cases.find((c) => c.exhibit_code === selectedCode) ?? cases[0] ?? proof.cases[0];

  useEffect(() => {
    setShaStatus('idle');
  }, [active?.exhibit_code]);

  const recordedBundle = active?.bundle_id
    ? proof.on_chain_snapshot.bundles.find((b) => b.bundle_id === active.bundle_id) ?? null
    : null;
  const liveBundle = active?.bundle_id && liveBundles
    ? liveBundles.find((b) => b.bundle_id === active.bundle_id) ?? null
    : null;
  const displayBundle = liveBundle ?? recordedBundle;

  const primaryTx = active?.audit_tx_hash || active?.open_tx_hash || '';
  const liveTx = primaryTx ? liveTxMap[primaryTx.toLowerCase()] : undefined;
  const parityMatches =
    liveBundle && recordedBundle ? liveBundle.status === recordedBundle.status : liveTx?.stage === 'FINALIZED_SUCCESS';

  const handleVerifySha = async () => {
    if (!active?.snippet_excerpt || !active?.snippet_sha256) return;
    const digest = await computeSha256Hex(active.snippet_excerpt);
    setShaStatus(digest.toLowerCase() === active.snippet_sha256.toLowerCase() ? 'verified' : 'mismatch');
  };

  const highlightExcerpt = (excerpt: string, quote: string) => {
    if (!quote) return excerpt;
    const idx = excerpt.indexOf(quote);
    if (idx === -1) return excerpt;
    return (
      <>
        {excerpt.slice(0, idx)}
        <mark className="rounded bg-amber-400/20 px-1 text-amber-200">{quote}</mark>
        {excerpt.slice(idx + quote.length)}
      </>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ALL', label: 'All Exhibits' },
            { id: 'CLEARED', label: 'Cleared' },
            { id: 'CONTAMINATED', label: 'Contaminated' },
            { id: 'RETRY', label: 'Spoof / Retry / Rejected' },
            { id: 'EXPIRED', label: 'Expired' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                filter === f.id
                  ? 'border-white/20 bg-white/[0.08] text-white'
                  : 'border-white/[0.06] bg-transparent text-zinc-400 hover:border-white/[0.12] hover:text-zinc-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <span className="font-mono text-xs text-zinc-500">
          5-Class SPDX Lattice · Per-Slot Repo Pinning · {proof.cases.length} Live Exhibits
        </span>
      </div>

      {/* Master-Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <aside className="lg:col-span-4 rounded-lg border border-white/[0.08] bg-[#0F0F12] divide-y divide-white/[0.06] overflow-hidden">
          {cases.map((item) => {
            const isSel = item.exhibit_code === active?.exhibit_code;
            return (
              <button
                key={item.exhibit_code}
                type="button"
                onClick={() => setSelectedCode(item.exhibit_code)}
                className={`w-full text-left px-4 py-3.5 transition cursor-pointer border-l-2 ${
                  isSel
                    ? 'border-l-emerald-400 bg-white/[0.04]'
                    : 'border-l-transparent hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 font-mono text-[11px] font-medium text-zinc-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${getVerdictDotColor(item.verdict)}`} />
                    {item.exhibit_code}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {item.bundle_id ? `Bundle #${item.bundle_id}` : 'Gate-1'}
                  </span>
                </div>
                <div className="mt-1 text-sm font-medium text-zinc-100 leading-snug">
                  {item.label}
                </div>
                <div className="mt-1 font-mono text-[11px] text-zinc-500 truncate">
                  {item.target_policy} · {item.slot_name}
                </div>
              </button>
            );
          })}
        </aside>

        {active && (
          <section className="lg:col-span-8 rounded-lg border border-white/[0.08] bg-[#0F0F12] p-5 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div>
                <div className="font-mono text-xs text-zinc-500">
                  {active.exhibit_code}
                  {active.bundle_id !== null ? ` · Bundle #${active.bundle_id}` : ''}
                  {active.slot_index !== null ? ` · Slot ${active.slot_index} (${active.slot_name})` : ''}
                </div>
                <h2 className="mt-1 text-lg font-semibold text-white">{active.label}</h2>
              </div>
              <VerdictBadge verdict={active.verdict} reasonCode={active.reason_code} />
            </div>

            {/* Explicit Recorded Proof vs Live StudioNet RPC Read Parity Strip */}
            <div className="grid grid-cols-1 md:grid-cols-2 rounded-md border border-white/[0.08] divide-y md:divide-y-0 md:divide-x divide-white/[0.08] bg-[#121216] text-xs">
              <div className="p-3 space-y-1">
                <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  Recorded Proof (deploy/proof.json)
                </div>
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-zinc-200">{recordedBundle?.status ?? active.bundle_status}</span>
                  {primaryTx && (
                    <a
                      href={`${proof.explorer_url}/tx/${primaryTx}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-zinc-400 hover:text-white"
                    >
                      {truncateMiddle(primaryTx, 8, 6)} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
              <div className="p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    Live StudioNet RPC Read
                  </span>
                  {rpcState === 'error' ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-rose-300">
                      <AlertTriangle className="h-3 w-3" /> RPC Error
                    </span>
                  ) : liveBundle || liveTx ? (
                    parityMatches ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> Verified On-Chain
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-amber-300">
                        <AlertTriangle className="h-3 w-3" /> State Diff
                      </span>
                    )
                  ) : (
                    <span className="font-mono text-[10px] text-zinc-500">Syncing...</span>
                  )}
                </div>
                <div className="font-mono text-[11px] text-zinc-300">
                  {liveBundle
                    ? `On-chain Bundle #${liveBundle.bundle_id}: ${liveBundle.status}`
                    : liveTx
                      ? `Live Tx Status: ${liveTx.statusName} (${liveTx.executionResult})`
                      : 'Click "Verify Live StudioNet" to refresh RPC read'}
                </div>
              </div>
            </div>

            {/* Multi-Slot Bundle Table with Per-Slot Repo Prefix */}
            {displayBundle && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-zinc-300">
                    Dependency Slots ({displayBundle.cleared_slot_count}/{displayBundle.total_slots} Cleared)
                  </span>
                  <span className="font-mono text-zinc-400">
                    Policy: <strong className="text-zinc-200">{displayBundle.target_policy}</strong> · Escrow:{' '}
                    <strong className="text-zinc-200">{formatWeiToGen(displayBundle.escrow_wei)}</strong>
                  </span>
                </div>
                <div className="rounded-md border border-white/[0.08] overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/[0.02] text-zinc-500 border-b border-white/[0.06]">
                      <tr>
                        <th className="px-3 py-2 font-medium">Slot</th>
                        <th className="px-3 py-2 font-medium">Dependency &amp; Bound Repo</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Judged Class</th>
                        <th className="px-3 py-2 font-medium text-right">Audits</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] font-mono">
                      {displayBundle.slots.map((s) => (
                        <tr key={s.slot_index} className="text-zinc-300">
                          <td className="px-3 py-2 text-zinc-500">#{s.slot_index}</td>
                          <td className="px-3 py-2">
                            <div className="text-zinc-100">{s.name}</div>
                            <div className="text-[10px] text-zinc-500 truncate max-w-[260px]">
                              {s.allowed_repo_prefix.replace('https://raw.githubusercontent.com/', '')}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full ${getVerdictDotColor(s.status)}`} />
                              {s.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-zinc-400">{s.license_class || '—'}</td>
                          <td className="px-3 py-2 text-right text-zinc-400">{s.attempts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Policy Effect & Rationale */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="rounded-md border border-white/[0.06] bg-[#141418] p-3">
                <div className="text-zinc-500">Deterministic Settlement Effect</div>
                <div className="mt-1 font-mono text-zinc-200">{active.policy_effect}</div>
                <p className="mt-1.5 text-zinc-400 leading-relaxed">{active.notes}</p>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-[#141418] p-3">
                <div className="text-zinc-500">Validator Consensus Rationale</div>
                <p className="mt-1 text-zinc-300 leading-relaxed">
                  {active.rationale || 'Deterministic state transition finalized on StudioNet.'}
                </p>
              </div>
            </div>

            {/* Commit-Pinned Evidence Plate */}
            {active.snippet_excerpt && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-zinc-200">Commit-Pinned Evidence</span>
                    {active.start_line && active.end_line && (
                      <span className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
                        L{active.start_line}–L{active.end_line}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {shaStatus === 'verified' && (
                      <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        SHA-256 Verified
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleVerifySha()}
                      className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.12] bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-white/[0.08] cursor-pointer"
                    >
                      <Fingerprint className="h-3.5 w-3.5" />
                      Verify SHA-256 in Browser
                    </button>
                  </div>
                </div>

                <div className="font-mono text-[11px] text-zinc-500 truncate">
                  Source:{' '}
                  <a
                    href={active.evidence_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-zinc-300 hover:text-white underline decoration-white/20"
                  >
                    {active.evidence_url}
                  </a>
                </div>

                <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-md border border-white/[0.08] bg-[#09090B] p-4 font-mono text-xs leading-relaxed text-zinc-300">
                  {highlightExcerpt(active.snippet_excerpt, active.evidence_quote)}
                </pre>

                <div className="font-mono text-[11px] text-zinc-500">
                  On-chain SHA-256: <span className="text-zinc-300">{active.snippet_sha256}</span>
                </div>
              </div>
            )}

            {/* Native GenLayer Appeal Window */}
            {primaryTx && (
              <AppealWindowPanel
                txHash={primaryTx}
                stage={liveTx && !liveTx.error ? liveTx.stage : 'FINALIZED_SUCCESS'}
                appealed={liveTx?.appealed}
              />
            )}

            {/* StudioNet Tx Anchors */}
            <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-3 font-mono text-[11px] text-zinc-400">
              {active.open_tx_hash && (
                <a
                  href={`${proof.explorer_url}/tx/${active.open_tx_hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-white"
                >
                  Open Tx: {truncateMiddle(active.open_tx_hash)} <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {active.audit_tx_hash && (
                <a
                  href={`${proof.explorer_url}/tx/${active.audit_tx_hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-white"
                >
                  Audit/Settle Tx: {truncateMiddle(active.audit_tx_hash)} <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {active.withdraw_tx_hash && (
                <a
                  href={`${proof.explorer_url}/tx/${active.withdraw_tx_hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-white"
                >
                  Withdraw Tx: {truncateMiddle(active.withdraw_tx_hash)} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </section>
        )}
      </div>

      {/* 5-Class Deterministic SPDX Compatibility Lattice */}
      <div className="rounded-lg border border-white/[0.08] bg-[#0F0F12] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-zinc-100">
            Deterministic 5-Class SPDX &amp; Source-Available Lattice
          </h3>
          <span className="font-mono text-[11px] text-zinc-500">
            Evaluated in plain Python after GenLayer validator classification
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/[0.08] text-zinc-500 font-mono">
              <tr>
                <th className="py-2 pr-4 font-medium">Target Policy</th>
                {CLASSES.map((cls) => (
                  <th key={cls} className="py-2 px-2.5 font-medium">
                    {cls}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] font-mono">
              {POLICIES.map((pol) => (
                <tr key={pol}>
                  <td className="py-2.5 pr-4 text-zinc-200">{pol}</td>
                  {CLASSES.map((cls) => {
                    const ok = ALLOWED[pol].includes(cls);
                    return (
                      <td key={cls} className="py-2.5 px-2.5">
                        {ok ? (
                          <span className="inline-flex items-center gap-1 text-emerald-300">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Compatible
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-300">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            Contaminates
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
