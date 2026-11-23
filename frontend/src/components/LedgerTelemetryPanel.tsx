import { ExternalLink } from 'lucide-react';
import type { ProofBundle } from '../types/licenseFence';
import { truncateMiddle } from '../lib/validation';

export function LedgerTelemetryPanel({ proof }: { proof: ProofBundle }) {
  const entries = Object.entries(proof.txs);

  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#0F0F12] overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-white">StudioNet Finalized Transaction Ledger</h2>
          <p className="text-xs text-zinc-500">
            All {entries.length} transactions finalized on GenLayer StudioNet (Chain ID {proof.chain_id})
          </p>
        </div>
        <span className="font-mono text-xs text-zinc-400">
          Source SHA-256: {truncateMiddle(proof.contract_source_sha256, 10, 8)}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-white/[0.06] bg-white/[0.02] text-zinc-500">
            <tr>
              <th className="px-5 py-2.5 font-medium">Step</th>
              <th className="px-5 py-2.5 font-medium">Transaction Hash</th>
              <th className="px-5 py-2.5 font-medium">Consensus</th>
              <th className="px-5 py-2.5 font-medium text-right">Explorer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06] font-mono">
            {entries.map(([key, hash]) => (
              <tr key={key} className="hover:bg-white/[0.02]">
                <td className="px-5 py-3 text-zinc-200">{key}</td>
                <td className="px-5 py-3 text-zinc-400">{truncateMiddle(hash, 12, 10)}</td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-1.5 text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    FINALIZED · SUCCESS
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <a
                    href={`${proof.explorer_url}/tx/${hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-white/[0.10] bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-300 hover:text-white"
                  >
                    Explorer <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
