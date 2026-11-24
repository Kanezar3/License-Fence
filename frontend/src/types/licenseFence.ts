export type TargetPolicy =
  | 'PERMISSIVE_ONLY'
  | 'PROPRIETARY_COMMERCIAL'
  | 'SAAS_CLOUD_SERVICE';

export type TxLifecycleStage =
  | 'SUBMITTED'
  | 'PENDING'
  | 'ACCEPTED'
  | 'FINALIZED_SUCCESS'
  | 'FINALIZED_ERROR';

export interface LiveTxStatus {
  txHash: string;
  stage: TxLifecycleStage;
  statusName: string;
  executionResult: string;
  blockNumber?: string | number | null;
  appealed?: boolean;
  lastCheckedAt: string;
  error?: string;
}

export interface TrackedTransaction {
  txHash: string;
  label: string;
  action: string;
  addedAt: string;
  stage: TxLifecycleStage;
  statusName: string;
  executionResult: string;
  blockNumber?: string | number | null;
  appealed?: boolean;
  lastCheckedAt?: string;
  error?: string;
}

export interface BundleSlot {
  slot_index: number;
  name: string;
  allowed_repo_prefix: string;
  status: 'PENDING' | 'CLEARED' | 'CONTAMINATED' | string;
  attempts: number;
  attempts_by_auditor?: Record<string, number>;
  license_class: string;
  reason_code: string;
  cleared_by: string;
  audit_id: number | null;
}

export interface OnChainBundle {
  bundle_id: number;
  creator: string;
  vendor_beneficiary: string;
  title: string;
  target_policy: TargetPolicy | string;
  allowed_classes: string[];
  scope_charter: string;
  charter_sha256: string;
  escrow_wei: string;
  deadline_ts: number;
  expiry_threshold_ts: number;
  created_ts: number;
  status: 'OPEN' | 'CLEARED_FOR_RELEASE' | 'CONTAMINATED' | 'EXPIRED_REFUNDED' | string;
  slots: BundleSlot[];
  cleared_slot_count: number;
  total_slots: number;
  contaminating_slot: number | null;
  contaminating_audit_id: number | null;
  gate1_reason_code: string;
  gate1_rationale: string;
}

export interface OnChainAudit {
  audit_id: number;
  bundle_id: number;
  slot_index: number;
  slot_name: string;
  auditor: string;
  evidence_url: string;
  start_line: number;
  end_line: number;
  bond_wei: string;
  auditor_payout_wei: string;
  buyer_refund_wei: string;
  vendor_payout_wei: string;
  audit_status: string;
  policy_effect: string;
  verdict: string;
  reason_code: string;
  snippet_sha256: string;
  snippet_excerpt: string;
  evidence_quote: string;
  rationale: string;
  created_ts: number;
}

export interface OnChainRejection {
  rejection_id: number;
  kind: string;
  sender: string;
  reason: string;
  refunded_wei: string;
  title: string;
  detail: string;
}

export interface ProtocolStats {
  total_bundles: number;
  open_bundles: number;
  cleared_bundles: number;
  contaminated_bundles: number;
  expired_bundles: number;
  total_audits: number;
  total_rejections: number;
  total_locked_wei: string;
  total_withdrawn_wei: string;
  expiry_grace_seconds: number;
  max_auditor_attempts_per_slot?: number;
}

export interface ProofCase {
  exhibit_code: string;
  case_id: string;
  label: string;
  bundle_id: number | null;
  slot_index: number | null;
  slot_name: string;
  audit_id: number | null;
  target_policy: string;
  bundle_status: string;
  verdict: string;
  reason_code: string;
  audit_status: string;
  policy_effect: string;
  evidence_url: string;
  start_line: number | null;
  end_line: number | null;
  snippet_sha256: string;
  snippet_excerpt: string;
  evidence_quote: string;
  rationale: string;
  open_tx_hash: string;
  audit_tx_hash: string;
  withdraw_tx_hash: string;
  notes: string;
}

export interface ProofBundle {
  protocol: string;
  network: string;
  chain_id: number;
  rpc_url: string;
  explorer_url: string;
  contract_address: string;
  contract_source_sha256: string;
  source_commit: string;
  deploy_tx: string;
  buyer_address: string;
  vendor_address: string;
  auditor1_address: string;
  auditor2_address: string;
  txs: Record<string, string>;
  cases: ProofCase[];
  on_chain_snapshot: {
    stats: ProtocolStats;
    bundles: OnChainBundle[];
    audits: OnChainAudit[];
    rejections: OnChainRejection[];
    refundable_after_withdraw: Record<string, { account: string; refundable_wei: string }>;
  };
}
