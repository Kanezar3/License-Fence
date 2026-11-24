import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import type {
  LiveTxStatus,
  OnChainAudit,
  OnChainBundle,
  OnChainRejection,
  ProtocolStats,
} from '../types/licenseFence';
import { mapGenLayerStatusToLifecycle } from './txTracker';

export const STUDIONET_CHAIN_ID = 61999;
export const STUDIONET_RPC_URL = 'https://studio.genlayer.com/api';
export const STUDIONET_EXPLORER_URL = 'https://explorer-studio.genlayer.com';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, cb: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
    };
  }
}

function parseJson<T>(raw: unknown): T {
  if (typeof raw === 'string') {
    return JSON.parse(raw) as T;
  }
  return raw as T;
}

export function createReadOnlyClient() {
  return createClient({
    chain: studionet,
    endpoint: STUDIONET_RPC_URL,
  });
}

export async function readLiveProtocolSnapshot(contractAddress: string): Promise<{
  stats: ProtocolStats;
  bundles: OnChainBundle[];
  audits: OnChainAudit[];
  rejections: OnChainRejection[];
}> {
  const client = createReadOnlyClient();
  const addr = contractAddress as `0x${string}`;
  const [statsRaw, bundlesRaw, auditsRaw, rejRaw] = await Promise.all([
    client.readContract({ address: addr, functionName: 'get_protocol_stats', args: [] }),
    client.readContract({ address: addr, functionName: 'get_all_bundles', args: [] }),
    client.readContract({ address: addr, functionName: 'get_all_audits', args: [] }),
    client.readContract({ address: addr, functionName: 'get_rejected_submissions', args: [] }),
  ]);

  return {
    stats: parseJson<ProtocolStats>(statsRaw),
    bundles: parseJson<OnChainBundle[]>(bundlesRaw),
    audits: parseJson<OnChainAudit[]>(auditsRaw),
    rejections: parseJson<OnChainRejection[]>(rejRaw),
  };
}

export async function fetchTransactionLifecycle(txHash: string): Promise<LiveTxStatus> {
  const checkedAt = new Date().toISOString();
  try {
    const client = createReadOnlyClient();
    const rec = (await client.getTransaction({
      hash: txHash as never,
    })) as Record<string, unknown> | null;

    if (!rec) {
      return {
        txHash,
        stage: 'SUBMITTED',
        statusName: 'SUBMITTED',
        executionResult: 'PENDING',
        lastCheckedAt: checkedAt,
      };
    }

    const lifecycle = (rec.lifecycle ?? {}) as Record<string, unknown>;
    const lcState = String(lifecycle.state ?? '').toUpperCase();
    const rawStatus = String(rec.status_name ?? rec.status ?? '').toUpperCase();
    const statusName =
      rawStatus && rawStatus !== 'UNDEFINED' && rawStatus !== 'NULL'
        ? rawStatus
        : lcState === 'FINALIZED'
          ? 'FINALIZED'
          : lcState === 'DECIDED'
            ? 'ACCEPTED'
            : lcState === 'PROCESSING'
              ? 'PENDING'
              : 'PENDING';

    let execRes = String(rec.execution_result ?? '').toUpperCase();
    if (!execRes || execRes === 'UNDEFINED' || execRes === 'NULL') {
      const cons = rec.consensus_data as Record<string, unknown> | undefined;
      const lrRaw = cons?.leader_receipt;
      const lr = Array.isArray(lrRaw)
        ? (lrRaw[0] as Record<string, unknown> | undefined)
        : (lrRaw as Record<string, unknown> | undefined);
      if (lr && lr.execution_result) {
        execRes = String(lr.execution_result).toUpperCase();
      }
    }

    return {
      txHash,
      stage: mapGenLayerStatusToLifecycle(statusName, execRes),
      statusName,
      executionResult: execRes || 'PENDING',
      blockNumber: (rec.block_number as string | number | null | undefined) ?? null,
      appealed: Boolean(rec.appealed),
      lastCheckedAt: checkedAt,
    };
  } catch (err) {
    return {
      txHash,
      stage: 'PENDING',
      statusName: 'RPC_ERROR',
      executionResult: 'UNKNOWN',
      lastCheckedAt: checkedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function submitTransactionAppeal(
  account: string,
  txHash: string
): Promise<string> {
  const client = createClient({
    chain: studionet,
    endpoint: STUDIONET_RPC_URL,
    account: account as `0x${string}`,
  });
  const res = await client.appealTransaction({
    txId: txHash as never,
  });
  return String(res);
}

export async function readRefundableBalance(
  contractAddress: string,
  account: string
): Promise<string> {
  const client = createReadOnlyClient();
  const raw = await client.readContract({
    address: contractAddress as `0x${string}`,
    functionName: 'get_refundable_balance',
    args: [account],
  });
  const parsed = parseJson<{ refundable_wei: string }>(raw);
  return parsed.refundable_wei ?? '0';
}

export async function connectMetaMaskStudioNet(): Promise<string> {
  if (!window.ethereum) {
    throw new Error('No injected Ethereum wallet found. Install MetaMask to submit StudioNet transactions.');
  }
  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[];
  if (!accounts || !accounts[0]) {
    throw new Error('Wallet connection rejected.');
  }
  const chainHex = `0x${STUDIONET_CHAIN_ID.toString(16)}`;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainHex }],
    });
  } catch {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: chainHex,
          chainName: 'GenLayer StudioNet',
          nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
          rpcUrls: [STUDIONET_RPC_URL],
          blockExplorerUrls: [STUDIONET_EXPLORER_URL],
        },
      ],
    });
  }
  return accounts[0];
}

export async function writeLicenseFenceMethod(params: {
  account: string;
  contractAddress: string;
  functionName: string;
  args: unknown[];
  value?: bigint;
}): Promise<string> {
  const client = createClient({
    chain: studionet,
    endpoint: STUDIONET_RPC_URL,
    account: params.account as `0x${string}`,
  });
  let fees: { distribution: unknown; feeValue: bigint } | undefined;
  try {
    const estimate = await client.estimateTransactionFeesForWrite({
      address: params.contractAddress as `0x${string}`,
      functionName: params.functionName,
      args: params.args as never[],
      value: params.value ?? 0n,
    });
    if (estimate?.distribution && estimate?.feeValue !== undefined) {
      fees = {
        distribution: estimate.distribution,
        feeValue: BigInt(estimate.feeValue),
      };
    }
  } catch {
    try {
      const fallback = await client.estimateTransactionFees();
      if (fallback?.distribution && fallback?.feeValue !== undefined) {
        fees = {
          distribution: fallback.distribution,
          feeValue: BigInt(fallback.feeValue),
        };
      }
    } catch {
      fees = undefined;
    }
  }

  const txHash = await client.writeContract({
    address: params.contractAddress as `0x${string}`,
    functionName: params.functionName,
    args: params.args as never[],
    value: params.value ?? 0n,
    ...(fees ? { fees: fees as never } : {}),
  });
  return String(txHash);
}
