import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import rawProof from './data/proof.json';
import type { OnChainBundle, ProofBundle, ProtocolStats } from './types/licenseFence';
import { readLiveProtocolSnapshot, STUDIONET_CHAIN_ID } from './lib/genlayerClient';
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rpcState, setRpcState] = useState<'idle' | 'live' | 'error'>('idle');

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

  const stats = liveStats ?? proof.on_chain_snapshot.stats;

  return (
    <div className="min-h-screen bg-[#09090B] text-[#FAFAFA]">
      {/* Sticky Single-Row Top Bar */}
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
                onClick={() => setTab(item.id as Tab)}
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

      {/* Protocol Summary Strip */}
      <div className="border-b border-white/[0.06] bg-[#0C0C0F]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-zinc-400">
            SPDX Compatibility Lattice &amp; Multi-Slot Copyleft-Contamination Escrow
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

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        {tab === 'dossiers' && <BundleDossierPanel proof={proof} liveBundles={liveBundles} />}
        {tab === 'desk' && (
          <LiveDeskPanel
            proof={proof}
            liveBundles={liveBundles}
            onRefreshLive={handleVerifyLive}
            isRefreshing={isRefreshing}
          />
        )}
        {tab === 'telemetry' && <LedgerTelemetryPanel proof={proof} />}
      </main>
    </div>
  );
}
