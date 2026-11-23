export function getVerdictDotColor(verdict: string): string {
  const v = verdict.toUpperCase();
  if (v === 'PERMISSIVE' || v === 'CLEARED_FOR_RELEASE' || v === 'CLEARED' || v === 'SLOT_CLEARED') {
    return 'bg-emerald-400';
  }
  if (v === 'NETWORK_COPYLEFT' || v === 'STRONG_COPYLEFT' || v === 'CONTAMINATED' || v === 'CONTAMINATION_TRIGGERED') {
    return 'bg-rose-400';
  }
  if (v === 'WEAK_COPYLEFT' || v === 'INSUFFICIENT_EVIDENCE' || v === 'TOO_VAGUE') {
    return 'bg-amber-400';
  }
  if (v === 'EXPIRED_REFUNDED') {
    return 'bg-sky-400';
  }
  return 'bg-zinc-400';
}

export function VerdictBadge({
  verdict,
  reasonCode,
}: {
  verdict: string;
  reasonCode?: string;
}) {
  const v = verdict.toUpperCase();
  let tone = 'border-white/[0.10] bg-white/[0.03] text-zinc-200';
  if (v === 'PERMISSIVE' || v === 'CLEARED_FOR_RELEASE' || v === 'SLOT_CLEARED') {
    tone = 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300';
  } else if (v === 'NETWORK_COPYLEFT' || v === 'STRONG_COPYLEFT' || v === 'CONTAMINATED' || v === 'CONTAMINATION_TRIGGERED') {
    tone = 'border-rose-500/25 bg-rose-500/[0.08] text-rose-300';
  } else if (v === 'WEAK_COPYLEFT' || v === 'INSUFFICIENT_EVIDENCE' || v === 'TOO_VAGUE') {
    tone = 'border-amber-500/25 bg-amber-500/[0.08] text-amber-300';
  } else if (v === 'EXPIRED_REFUNDED') {
    tone = 'border-sky-500/25 bg-sky-500/[0.08] text-sky-300';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium ${tone}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${getVerdictDotColor(verdict)}`} />
      <span>{verdict}</span>
      {reasonCode && <span className="opacity-65">· {reasonCode}</span>}
    </span>
  );
}
