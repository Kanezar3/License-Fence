import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Plus, RefreshCw, Trash2, Zap } from 'lucide-react';
import type { ProofBundle, TrackedTransaction, TxLifecycleStage } from '../types/licenseFence';
import { stageProgressCount } from '../lib/txTracker';
import { truncateMiddle } from '../lib/validation';
import { VerdictBadge } from './VerdictBadge';
import { AppealWindowPanel } from './AppealWindowPanel';

function stageLabel(stage: TxLifecycleStage): string {
  switch (stage) {
    case 'SUBMITTED':
      return '1/5 Submitted';
    case 'PENDING':
      return '2/5 Pending';
    case 'ACCEPTED':
      return '3/5 Accepted (Appealable)';
    case 'FINALIZED_SUCCESS':
      return '5/5 Finalized';
    case 'FINALIZED_ERROR':
      return '5/5 Finalized Error';
  }
}

export function LedgerTelemetryPanel({
  proof,
  trackedTxs,
  isPolling,
  autoPoll,
  onToggleAutoPoll,
  onPollNow,
  onLoadAllProofTxs,
  onAddManualTx,
  onRemoveTx,
}: {
  proof: ProofBundle;
  trackedTxs: TrackedTransaction[];
  isPolling: boolean;
  autoPoll: boolean;
  onToggleAutoPoll: () => void;
  onPollNow: () => Promise<void>;
  onLoadAllProofTxs: () => void;
  onAddManualTx: (txHash: string, label: string) => void;
  onRemoveTx: (txHash: string) => void;
}) {
  const [manualHash, setManualHash] = useState('');
  const [manualLabel, setManualLabel] = useState('');
  const [expandedHash, setExpandedHash] = useState<string | null>(null);

  const proofTxCount = Object.keys(proof.txs).length;

  const handleTrackManual = (e: React.FormEvent) => {
    e.preventDefault();
    const h = manualHash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(h)) return;
    onAddManualTx(h, manualLabel.trim() || 'Manual StudioNet Tx');
    setManualHash('');
    setManualLabel('');
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="rounded-lg border border-white/[0.08] bg-[#0F0F12] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onLoadAllProofTxs}
              className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 cursor-pointer"
            >
              <Zap className="h-3.5 w-3.5" />
              Load All {proofTxCount} Exhibit Txs
            </button>
            <button
              type="button"
              onClick={() => void onPollNow()}
              disabled={isPolling || trackedTxs.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.08] disabled:opacity-40 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isPolling ? 'animate-spin' : ''}`} />
              {isPolling ? 'Polling StudioNet...' : 'Poll Live Status'}
            </button>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-400 cursor-pointer ml-1">
              <input
                type="checkbox"
                checked={autoPoll}
                onChange={onToggleAutoPoll}
                className="rounded border-white/20 bg-zinc-900 accent-emerald-500"
              />
              8s Auto-Poll (Resumable)
            </label>
          </div>
          <span className="font-mono text-xs text-zinc-500">
            {trackedTxs.length} tracked · Persisted in localStorage
          </span>
        </div>

        <form onSubmit={handleTrackManual} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input
            value={manualHash}
            onChange={(e) => setManualHash(e.target.value)}
            placeholder="Track any StudioNet 0x... transaction hash (64 hex chars)"
            className="sm:col-span-7 rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-1.5 font-mono text-xs text-zinc-100 focus:border-white/25 focus:outline-none"
          />
          <input
            value={manualLabel}
            onChange={(e) => setManualLabel(e.target.value)}
            placeholder="Label (optional)"
            className="sm:col-span-3 rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-1.5 text-xs text-zinc-100 focus:border-white/25 focus:outline-none"
          />
          <button
            type="submit"
            className="sm:col-span-2 inline-flex items-center justify-center gap-1 rounded-md border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.08] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> Track Tx
          </button>
        </form>
      </div>

      {/* Live Ledger Table */}
      <div className="rounded-lg border border-white/[0.08] bg-[#0F0F12] overflow-hidden">
        {trackedTxs.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-400">
            No transactions tracked yet. Click <strong className="text-zinc-200">Load All {proofTxCount} Exhibit Txs</strong> to query live StudioNet RPC status for every recorded exhibit, or submit a transaction from Clearance Desk.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/[0.06] bg-white/[0.02] text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Transaction</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium">5-Stage Consensus</th>
                  <th className="px-4 py-2.5 font-medium">Live RPC Status</th>
                  <th className="px-4 py-2.5 font-medium text-right">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {trackedTxs.map((tx) => {
                  const steps = stageProgressCount(tx.stage);
                  const isOpen = expandedHash === tx.txHash;
                  return (
                    <>
                      <tr key={tx.txHash} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setExpandedHash(isOpen ? null : tx.txHash)}
                            className="inline-flex items-start gap-2 text-left cursor-pointer"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 mt-0.5 text-zinc-500" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-zinc-500" />
                            )}
                            <div>
                              <div className="font-medium text-zinc-100">{tx.label}</div>
                              <div className="font-mono text-[11px] text-zinc-500">
                                {truncateMiddle(tx.txHash, 10, 8)}
                              </div>
                            </div>
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-zinc-400">
                          <span className="rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5">
                            {tx.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <span
                                  key={n}
                                  className={`h-1.5 w-4 rounded-full ${
                                    n <= steps
                                      ? tx.stage === 'FINALIZED_ERROR'
                                        ? 'bg-rose-400'
                                        : tx.stage === 'ACCEPTED'
                                          ? 'bg-amber-400'
                                          : 'bg-emerald-400'
                                      : 'bg-white/[0.08]'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="font-mono text-[11px] text-zinc-400">
                              {stageLabel(tx.stage)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <VerdictBadge
                            verdict={tx.stage}
                            reasonCode={tx.error ? 'RPC_ERR' : tx.executionResult}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <a
                              href={`${proof.explorer_url}/tx/${tx.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-white/[0.10] bg-white/[0.03] px-2 py-1 font-mono text-[11px] text-zinc-300 hover:text-white"
                            >
                              Explorer <ExternalLink className="h-3 w-3" />
                            </a>
                            <button
                              type="button"
                              onClick={() => onRemoveTx(tx.txHash)}
                              className="rounded border border-white/[0.08] p-1 text-zinc-500 hover:text-rose-300 cursor-pointer"
                              title="Remove from tracker"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${tx.txHash}-appeal`} className="bg-[#0B0B0E]">
                          <td colSpan={5} className="px-6 py-3">
                            <AppealWindowPanel
                              txHash={tx.txHash}
                              stage={tx.stage}
                              appealed={tx.appealed}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
