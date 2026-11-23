import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, ShieldAlert, ShieldCheck, Fingerprint } from 'lucide-react';
import type { OnChainBundle, ProofBundle, ProofCase } from '../types/licenseFence';
import { computeSha256Hex, formatWeiToGen, truncateMiddle } from '../lib/validation';
import { getVerdictDotColor, VerdictBadge } from './VerdictBadge';

const POLICIES = ['PERMISSIVE_ONLY', 'PROPRIETARY_COMMERCIAL', 'SAAS_CLOUD_SERVICE'] as const;
const CLASSES = ['PERMISSIVE', 'WEAK_COPYLEFT', 'STRONG_COPYLEFT', 'NETWORK_COPYLEFT'] as const;
const ALLOWED: Record<string, string[]> = {
  PERMISSIVE_ONLY: ['PERMISSIVE'],
  PROPRIETARY_COMMERCIAL: ['PERMISSIVE', 'WEAK_COPYLEFT'],
  SAAS_CLOUD_SERVICE: ['PERMISSIVE', 'WEAK_COPYLEFT', 'STRONG_COPYLEFT'],
};

export function BundleDossierPanel({
  proof,
  liveBundles,
}: {
  proof: ProofBundle;
  liveBundles: OnChainBundle[] | null;
}) {
  const [selectedCode, setSelectedCode] = useState<string>(proof.cases[0]?.exhibit_code ?? 'LF-01');
  const [filter, setFilter] = useState<string>('ALL');
  const [shaStatus, setShaStatus] = useState<'idle' | 'verified' | 'mismatch'>('idle');

  const cases = proof.cases.filter((c) => {
    if (filter === 'ALL') return true;
    if (filter === 'CLEARED') return c.bundle_status === 'CLEARED_FOR_RELEASE' || c.verdict === 'PERMISSIVE';
    if (filter === 'CONTAMINATED') return c.bundle_status === 'CONTAMINATED' || c.verdict === 'NETWORK_COPYLEFT';
    if (filter === 'RETRY') return c.verdict === 'INSUFFICIENT_EVIDENCE' || c.verdict === 'TOO_VAGUE';
    if (filter === 'EXPIRED') return c.verdict === 'EXPIRED_REFUNDED';
    return true;
  });

  const active: ProofCase =
    cases.find((c) => c.exhibit_code === selectedCode) ?? cases[0] ?? proof.cases[0];

  useEffect(() => {
    setShaStatus('idle');
  }, [active?.exhibit_code]);

  const bundlesSource = liveBundles ?? proof.on_chain_snapshot.bundles;
  const activeBundle = active?.bundle_id
    ? bundlesSource.find((b) => b.bundle_id === active.bundle_id) ?? null
    : null;

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
            { id: 'RETRY', label: 'Retry / Rejected' },
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
          Deterministic SPDX Lattice · {bundlesSource.length} On-Chain Bundles
        </span>
      </div>

      {/* Master-Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Exhibit Rail */}
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

        {/* Right Detail Dossier */}
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

            {/* Multi-Slot Bundle Status Table */}
            {activeBundle && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-300">
                    Dependency Slots ({activeBundle.cleared_slot_count}/{activeBundle.total_slots} Cleared)
                  </span>
                  <span className="font-mono text-zinc-400">
                    Policy: <strong className="text-zinc-200">{activeBundle.target_policy}</strong> · Escrow:{' '}
                    <strong className="text-zinc-200">{formatWeiToGen(activeBundle.escrow_wei)}</strong>
                  </span>
                </div>
                <div className="rounded-md border border-white/[0.08] overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/[0.02] text-zinc-500 border-b border-white/[0.06]">
                      <tr>
                        <th className="px-3 py-2 font-medium">Slot</th>
                        <th className="px-3 py-2 font-medium">Dependency</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Judged Class</th>
                        <th className="px-3 py-2 font-medium text-right">Attempts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] font-mono">
                      {activeBundle.slots.map((s) => (
                        <tr key={s.slot_index} className="text-zinc-300">
                          <td className="px-3 py-2 text-zinc-500">#{s.slot_index}</td>
                          <td className="px-3 py-2 text-zinc-100">{s.name}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full ${getVerdictDotColor(s.status)}`} />
                              {s.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-zinc-400">{s.license_class || '—'}</td>
                          <td className="px-3 py-2 text-right text-zinc-400">{s.attempts}/5</td>
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

                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-white/[0.08] bg-[#09090B] p-3.5 font-mono text-xs leading-relaxed text-zinc-300">
                  {highlightExcerpt(active.snippet_excerpt, active.evidence_quote)}
                </pre>

                <div className="font-mono text-[11px] text-zinc-500">
                  On-chain SHA-256: <span className="text-zinc-300">{active.snippet_sha256}</span>
                </div>
              </div>
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

      {/* Deterministic SPDX Compatibility Lattice Reference */}
      <div className="rounded-lg border border-white/[0.08] bg-[#0F0F12] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-100">
            Deterministic SPDX Compatibility Lattice
          </h3>
          <span className="font-mono text-[11px] text-zinc-500">
            Enforced in plain Python after Optimistic Democracy classification
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/[0.08] text-zinc-500 font-mono">
              <tr>
                <th className="py-2 pr-4 font-medium">Target Policy</th>
                {CLASSES.map((cls) => (
                  <th key={cls} className="py-2 px-3 font-medium">
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
                      <td key={cls} className="py-2.5 px-3">
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
