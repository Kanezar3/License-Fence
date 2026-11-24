import type { TrackedTransaction, TxLifecycleStage } from '../types/licenseFence';

const STORAGE_KEY = 'license_fence_tracked_txs_v2';

export function mapGenLayerStatusToLifecycle(
  statusName?: string | null,
  executionResult?: string | null
): TxLifecycleStage {
  const st = String(statusName || '').trim().toUpperCase();
  const er = String(executionResult || '').trim().toUpperCase();

  if (st === 'FINALIZED') {
    if (er === 'ERROR' || er === 'MAJORITY_DISAGREE' || er === 'UNDETERMINED' || er === 'FAILED') {
      return 'FINALIZED_ERROR';
    }
    return 'FINALIZED_SUCCESS';
  }
  if (st === 'ACCEPTED' || st === 'UNDETERMINED' || st === 'APPEALING') {
    return 'ACCEPTED';
  }
  if (st === 'PENDING' || st === 'PROPOSING' || st === 'COMMITTING' || st === 'REVEALING' || st === 'ACTIVATED') {
    return 'PENDING';
  }
  return 'SUBMITTED';
}

export function isTerminalStage(stage: TxLifecycleStage): boolean {
  return stage === 'FINALIZED_SUCCESS' || stage === 'FINALIZED_ERROR';
}

export function stageProgressCount(stage: TxLifecycleStage): number {
  switch (stage) {
    case 'SUBMITTED':
      return 1;
    case 'PENDING':
      return 2;
    case 'ACCEPTED':
      return 3;
    case 'FINALIZED_SUCCESS':
    case 'FINALIZED_ERROR':
      return 5;
  }
}

export function loadTrackedTransactions(): TrackedTransaction[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TrackedTransaction[]) : [];
  } catch {
    return [];
  }
}

export function saveTrackedTransactions(list: TrackedTransaction[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 60)));
  } catch {
    // Ignore storage quota errors
  }
}

export function upsertTrackedTransaction(
  list: TrackedTransaction[],
  entry: TrackedTransaction
): TrackedTransaction[] {
  const norm = entry.txHash.toLowerCase();
  const idx = list.findIndex((x) => x.txHash.toLowerCase() === norm);
  if (idx === -1) {
    return [entry, ...list];
  }
  const copy = [...list];
  copy[idx] = { ...copy[idx], ...entry };
  return copy;
}
