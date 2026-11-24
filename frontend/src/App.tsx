import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import rawProof from './data/proof.json';
import type {
  LiveTxStatus,
  OnChainBundle,
  ProofBundle,
  ProtocolStats,
  TrackedTransaction,
} from './types/licenseFence';
import {
  fetchTransactionLifecycle,
  readLiveProtocolSnapshot,
  STUDIONET_CHAIN_ID,
} from './lib/genlayerClient';
import {
  isTerminalStage,
  loadTrackedTransactions,
  saveTrackedTransactions,
  upsertTrackedTransaction,
} from './lib/txTracker';
import { truncateMiddle } from './lib/validation';
import { BundleDossierPanel } from './components/BundleDossierPanel';
import { LiveDeskPanel } from './components/LiveDeskPanel';
import { LedgerTelemetryPanel } from './components/LedgerTelemetryPanel';

type Tab = 'dossiers' | 'desk' | 'telemetry';

export default function App() {
  const proof = rawProof as unknown as ProofBundle;
  const [tab, setTab] = useState<Tab>('dossiers');
  const [liveBundles, setLiveBundles] = useState<OnChainBundle[] | null>(null);
  const [liveStats, setLiveStats] = useState<ProtocolStats | null>(null);
  const [liveTxMap, setLiveTxMap] = useState<Record<string, LiveTxStatus>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rpcState, setRpcState] = useState<'idle' | 'live' | 'error'>('idle');

  // Resumable localStorage-persisted tx tracker
  const [trackedTxs, setTrackedTxs] = useState<TrackedTransaction[]>(() => loadTrackedTransactions());
  const [isPolling, setIsPolling] = useState(false);
  const [autoPoll, setAutoPoll] = useState(true);

  useEffect(() => {
    saveTrackedTransactions(trackedTxs);
  }, [trackedTxs]);

  const handleVerifyLive = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const snap = await readLiveProtocolSnapshot(proof.contract_address);
      setLiveBundles(snap.bundles);
      setLiveStats(snap.stats);
      setRpcState('live');
    } catch {
      setRpcState('error');
    } finally {
      setIsRefreshing(false);
    }
  }, [proof.contract_address]);

  useEffect(() => {
    void handleVerifyLive();
  }, [handleVerifyLive]);

  const pollTracked = useCallback(
    async (listToPoll?: TrackedTransaction[]) => {
      const targets = listToPoll ?? trackedTxs;
      if (targets.length === 0) return;
      setIsPolling(true);
      try {
        const updatedMap: Record<string, LiveTxStatus> = {};
        const nextList: TrackedTransaction[] = [];
        // Pace StudioNet RPC calls sequentially (250ms gap) to avoid 503 burst throttling
        for (const item of targets) {
          if (isTerminalStage(item.stage) && item.lastCheckedAt && !item.error) {
            nextList.push(item);
            continue;
          }
          const live = await fetchTransactionLifecycle(item.txHash);
          if (!live.error) {
            updatedMap[item.txHash.toLowerCase()] = live;
            nextList.push({
              ...item,
              stage: live.stage,
              statusName: live.statusName,
              executionResult: live.executionResult,
              blockNumber: live.blockNumber,
              appealed: live.appealed,
              lastCheckedAt: live.lastCheckedAt,
              error: undefined,
            });
          } else {
            // Preserve prior known stage on transient RPC error instead of regressing to PENDING
            nextList.push({
              ...item,
              lastCheckedAt: live.lastCheckedAt,
              error: live.error,
            });
          }
          await new Promise((r) => setTimeout(r, 250));
        }
        setTrackedTxs(nextList);
        if (Object.keys(updatedMap).length > 0) {
          setLiveTxMap((prev) => ({ ...prev, ...updatedMap }));
        }
      } finally {
        setIsPolling(false);
      }
    },
    [trackedTxs]
  );

  // 8s resumable auto-polling for non-terminal transactions (respects StudioNet 30 req/min rate limit)
  useEffect(() => {
    if (!autoPoll) return;
    const hasPending = trackedTxs.some((t) => !isTerminalStage(t.stage) || !t.lastCheckedAt);
    if (!hasPending) return;
    const id = window.setInterval(() => {
      void pollTracked();
    }, 8000);
    return () => window.clearInterval(id);
  }, [autoPoll, trackedTxs, pollTracked]);

  const handleTxSubmitted = (txHash: string, label: string, action: string) => {
    const entry: TrackedTransaction = {
      txHash,
      label,
      action,
      addedAt: new Date().toISOString(),
      stage: 'SUBMITTED',
      statusName: 'SUBMITTED',
      executionResult: 'PENDING',
    };
    setTrackedTxs((prev) => upsertTrackedTransaction(prev, entry));
  };

  const handleLoadAllProofTxs = () => {
    const entries: TrackedTransaction[] = Object.entries(proof.txs).map(([key, hash]) => ({
      txHash: hash,
      label: key,
      action: key.includes('withdraw')
        ? 'withdraw_refundable'
        : key.includes('expired')
          ? 'settle_expired_bundle'
          : key.includes('open_') || key.includes('too_vague')
            ? 'open_clearance_bundle'
            : key === 'deploy_tx'
              ? 'deploy_contract'
              : 'submit_slot_audit',
      addedAt: new Date().toISOString(),
      stage: 'FINALIZED_SUCCESS',
      statusName: 'FINALIZED',
      executionResult: 'SUCCESS',
    }));
    let merged = [...trackedTxs];
    for (const e of entries) {
      merged = upsertTrackedTransaction(merged, e);
    }
    setTrackedTxs(merged);
    void pollTracked(merged);
  };

  const stats = liveStats ?? proof.on_chain_snapshot.stats;

  return (
    <div className="min-h-screen bg-[#09090B] text-[#FAFAFA]">
      <header className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#09090B]/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="License Fence" className="h-7 w-7 rounded-md border border-white/10" />
            <span className="font-semibold tracking-tight text-white">License Fence</span>
            <span className="hidden sm:inline-flex items-center gap-1.5 font-mono text-xs text-zinc-400">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  rpcState === 'live' ? 'bg-emerald-400' : rpcState === 'error' ? 'bg-amber-400' : 'bg-zinc-500'
                }`}
              />
              StudioNet · {STUDIONET_CHAIN_ID} {rpcState === 'live' ? '(Live)' : ''}
            </span>
          </div>

          <nav className="flex items-center rounded-md border border-white/[0.08] bg-[#0F0F12] p-0.5 text-xs">
            {[
              { id: 'dossiers', label: 'Bundle Dossiers' },
              { id: 'desk', label: 'Clearance Desk' },
              { id: 'telemetry', label: 'Consensus Telemetry' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id as Tab);
                  window.scrollTo({ top: 0 });
                }}
                className={`rounded px-3 py-1 font-medium transition cursor-pointer ${
                  tab === item.id ? 'bg-white/[0.10] text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={`${proof.explorer_url}/address/${proof.contract_address}`}
              target="_blank"
              rel="noreferrer"
              className="hidden md:inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#0F0F12] px-2.5 py-1.5 font-mono text-xs text-zinc-300 hover:border-white/[0.18] hover:text-white"
            >
              {truncateMiddle(proof.contract_address, 6, 4)}
              <ExternalLink className="h-3 w-3" />
            </a>
            <button
              type="button"
              onClick={() => void handleVerifyLive()}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.10] bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.08] cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Verify Live StudioNet
            </button>
          </div>
        </div>
      </header>

      <div className="border-b border-white/[0.06] bg-[#0C0C0F]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-zinc-400">
            5-Class SPDX Lattice &amp; Per-Slot Repo-Pinned Copyleft-Contamination Escrow
          </span>
          <div className="flex flex-wrap items-center gap-4 font-mono text-zinc-400">
            <span>
              Bundles <strong className="text-zinc-100">{stats.total_bundles}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Cleared <strong className="text-zinc-100">{stats.cleared_bundles}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              Contaminated <strong className="text-zinc-100">{stats.contaminated_bundles}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              Expired <strong className="text-zinc-100">{stats.expired_bundles}</strong>
            </span>
            <span>
              Audits <strong className="text-zinc-100">{stats.total_audits}</strong>
            </span>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        {tab === 'dossiers' && (
          <BundleDossierPanel
            proof={proof}
            liveBundles={liveBundles}
            liveTxMap={liveTxMap}
            rpcState={rpcState}
          />
        )}
        {tab === 'desk' && (
          <LiveDeskPanel
            proof={proof}
            liveBundles={liveBundles}
            onRefreshLive={handleVerifyLive}
            isRefreshing={isRefreshing}
            onTxSubmitted={handleTxSubmitted}
          />
        )}
        {tab === 'telemetry' && (
          <LedgerTelemetryPanel
            proof={proof}
            trackedTxs={trackedTxs}
            isPolling={isPolling}
            autoPoll={autoPoll}
            onToggleAutoPoll={() => setAutoPoll((v) => !v)}
            onPollNow={() => pollTracked()}
            onLoadAllProofTxs={handleLoadAllProofTxs}
            onAddManualTx={(hash, label) => handleTxSubmitted(hash, label, 'manual_track')}
            onRemoveTx={(hash) =>
              setTrackedTxs((prev) => prev.filter((t) => t.txHash.toLowerCase() !== hash.toLowerCase()))
            }
          />
        )}
      </main>
    </div>
  );
}
