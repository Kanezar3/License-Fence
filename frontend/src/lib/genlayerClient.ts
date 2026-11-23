import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import type {
  OnChainAudit,
  OnChainBundle,
  OnChainRejection,
  ProtocolStats,
} from '../types/licenseFence';

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
  const txHash = await client.writeContract({
    address: params.contractAddress as `0x${string}`,
    functionName: params.functionName,
    args: params.args as never[],
    value: params.value ?? 0n,
  });
  return String(txHash);
}
