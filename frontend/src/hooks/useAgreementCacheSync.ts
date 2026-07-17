// Page-load cache synchronization + stored-transaction feed for one
// agreement. The DIRECT contract read (done by the page) stays authoritative
// for everything the user can act on; this hook only (1) loads the stored
// application transactions, and (2) when the database status cache disagrees
// with the direct read, asks the backend to refresh the cache from its own
// direct contract read. It never blocks or overrides onchain state.

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import {
  shouldRefreshCache,
  type AgreementTransactionsResponse,
} from '../lib/txPersistence'

export function useAgreementCacheSync(params: {
  chainId: string | undefined
  contractAddress: string
  agreementId: string | undefined
  onchainStatusName: string | null
  enabled: boolean
}) {
  const { chainId, contractAddress, agreementId, onchainStatusName, enabled } = params
  const base = `/agreements/${chainId}/${contractAddress}/${agreementId}`

  const stored = useQuery({
    queryKey: ['agreement-transactions', chainId, contractAddress, agreementId],
    queryFn: () => api<AgreementTransactionsResponse>(`${base}/transactions`),
    enabled: enabled && Boolean(chainId && agreementId),
    retry: false,
  })

  const refreshRequested = useRef(false)
  const cacheStatus = stored.data?.status_cache ?? null

  useEffect(() => {
    if (!enabled || refreshRequested.current) return
    if (!shouldRefreshCache(onchainStatusName, cacheStatus)) return
    refreshRequested.current = true
    void api(`${base}/refresh-cache`, { method: 'POST' })
      .catch(() => null) // cache repair is best-effort; the page shows chain state
      .then(() => stored.refetch())
  }, [enabled, onchainStatusName, cacheStatus, base, stored])

  return {
    transactions: stored.data?.transactions ?? [],
    statusCache: cacheStatus,
    isLoading: stored.isLoading,
    isError: stored.isError,
    refetch: stored.refetch,
  }
}
