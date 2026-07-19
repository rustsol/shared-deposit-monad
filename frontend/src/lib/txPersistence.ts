// Backend persistence for application-originated contract transactions.
//
// The moment the wallet returns a hash it is POSTed to the backend, which
// stores it as SUBMITTED and independently verifies it by receipt. From that
// point MySQL is the durable transaction record; sessionStorage remains only
// a temporary same-tab recovery backup. All calls here are best-effort: a
// persistence failure must never break the onchain flow itself.

import { api } from './api'
import type { TxEntry } from '../app/TxContext'

export interface StoredTransaction {
  chain_id: number
  contract_address: string
  tx_hash: string
  wallet_address: string
  function_name: string
  agreement_id: string | null
  claim_id: string | null
  value_wei: string
  status: string
  submitted_at: string
  first_observed_at: string | null
  mined_at: string | null
  block_number: number | null
  block_hash: string | null
  receipt_status: number | null
  decoded_error: string | null
  decoded_events: Array<{ event_name: string; log_index: number; payload: Record<string, unknown> }> | null
  explorer_tx_url: string
}

export interface AgreementTransactionsResponse {
  chain_id: number
  contract_address: string
  agreement_id: string
  status_cache: string
  transactions: StoredTransaction[]
}

export interface RecordTransactionInput {
  chainId: number
  contractAddress: string
  txHash: `0x${string}`
  functionName: string
  agreementId?: string
  claimId?: string
  valueWei: string
}

/** Persist a wallet-returned hash. Best-effort by design. */
export async function recordTransaction(
  input: RecordTransactionInput,
): Promise<StoredTransaction | null> {
  try {
    return await api<StoredTransaction>('/transactions', {
      method: 'POST',
      body: {
        chain_id: input.chainId,
        contract_address: input.contractAddress,
        tx_hash: input.txHash,
        function_name: input.functionName,
        agreement_id: input.agreementId ?? null,
        claim_id: input.claimId ?? null,
        value_wei: input.valueWei,
      },
    })
  } catch {
    return null
  }
}

/** Ask the backend to re-run receipt verification for a stored hash. */
export async function reverifyTransaction(
  chainId: number,
  txHash: string,
): Promise<StoredTransaction | null> {
  try {
    return await api<StoredTransaction>(`/transactions/${chainId}/${txHash}/verify`, {
      method: 'POST',
    })
  } catch {
    return null
  }
}

/** The session wallet's unresolved stored transactions (reload recovery). */
export async function fetchUnresolvedTransactions(): Promise<StoredTransaction[]> {
  try {
    return await api<StoredTransaction[]>('/transactions?unresolved=true')
  } catch {
    return []
  }
}

/** Backend statuses that still need client-side receipt polling. */
const BACKEND_UNRESOLVED = new Set([
  'SUBMITTED',
  'BROADCAST_CONFIRMED',
  'PENDING',
  'MINED_SUCCESS',
])

/**
 * Pure merge for reload recovery: backend rows that are not already tracked
 * locally become resumable entries. Only rows recorded by the connected
 * wallet are restored - a different wallet's transactions never attach.
 */
export function mergeBackendTransactions(
  existing: Pick<TxEntry, 'hash'>[],
  backend: StoredTransaction[],
  connectedWallet: string | null,
): Omit<TxEntry, 'id'>[] {
  if (!connectedWallet) return []
  const known = new Set(existing.map((entry) => entry.hash?.toLowerCase()).filter(Boolean))
  const additions: Omit<TxEntry, 'id'>[] = []
  for (const row of backend) {
    if (!BACKEND_UNRESOLVED.has(row.status)) continue
    if (row.wallet_address.toLowerCase() !== connectedWallet.toLowerCase()) continue
    if (known.has(row.tx_hash.toLowerCase())) continue
    additions.push({
      label: `${row.function_name} (restored)`,
      functionName: row.function_name,
      status: 'PENDING_ONCHAIN', // resumable: TxRecovery re-polls the receipt
      chainId: row.chain_id,
      hash: row.tx_hash as `0x${string}`,
      contractAddress: row.contract_address,
      agreementId: row.agreement_id ?? undefined,
      connectedWallet,
      submittedAt: Date.parse(row.submitted_at) || undefined,
    })
  }
  return additions
}

/** The direct contract read is authoritative; refresh only on a real,
 *  known disagreement. */
export function shouldRefreshCache(
  onchainStatusName: string | null,
  cacheStatusName: string | null,
): boolean {
  return (
    onchainStatusName !== null &&
    cacheStatusName !== null &&
    onchainStatusName !== 'NONE' &&
    onchainStatusName !== cacheStatusName
  )
}
