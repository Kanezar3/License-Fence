import { useState } from 'react';
import { Scale, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { TxLifecycleStage } from '../types/licenseFence';
import { connectMetaMaskStudioNet, submitTransactionAppeal } from '../lib/genlayerClient';

export function AppealWindowPanel({
  txHash,
  stage,
  appealed,
}: {
  txHash: string;
  stage: TxLifecycleStage;
  appealed?: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isAppealable = stage === 'ACCEPTED' && !appealed;
  const isFinal = stage === 'FINALIZED_SUCCESS' || stage === 'FINALIZED_ERROR';

  const handleAppeal = async () => {
    setSubmitting(true);
    setErr(null);
    setMsg(null);
    try {
      const account = await connectMetaMaskStudioNet();
      const res = await submitTransactionAppeal(account, txHash);
      setMsg(`Appeal submitted to GenLayer Optimistic Democracy: ${res}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-md border border-white/[0.08] bg-[#121216] p-3.5 text-xs space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 font-medium text-zinc-200">
          <Scale className="h-3.5 w-3.5 text-zinc-400" />
          <span>GenLayer Native Appeal Window</span>
        </div>
        {isFinal ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Window Closed · Finalized On-Chain
          </span>
        ) : isAppealable ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            Appeal Window Open (ACCEPTED)
          </span>
        ) : (
          <span className="font-mono text-[11px] text-zinc-400">
            {appealed ? 'Appeal Active' : 'Awaiting Validator Acceptance'}
          </span>
        )}
      </div>

      <p className="text-zinc-400 leading-relaxed">
        License Fence relies exclusively on GenLayer&apos;s native Optimistic Democracy appeal window rather than a custom court. Any validator majority verdict can be appealed while in <code className="text-zinc-300">ACCEPTED</code> before finality commits escrow changes.
      </p>

      {isAppealable && (
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleAppeal()}
          className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 font-mono text-[11px] font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-45 cursor-pointer"
        >
          {submitting ? 'Submitting Appeal...' : 'Trigger Native Validator Appeal'}
        </button>
      )}

      {msg && <div className="font-mono text-[11px] text-emerald-300 break-all">{msg}</div>}
      {err && <div className="font-mono text-[11px] text-rose-300">{err}</div>}
    </div>
  );
}
