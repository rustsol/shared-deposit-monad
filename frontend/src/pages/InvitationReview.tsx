// Invitation review and offchain claim. The token stays in the URL only —
// never logged, never stored, never echoed into page state beyond this route.

import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../app/AuthContext'
import { weiToMon } from '../lib/format'
import { WalletStatus } from '../app/Shell'

interface Review {
  status: string
  role: string | null
  property_alias: string | null
  draft_id: string | null
  expected_wallet: string | null
  required_amount_wei: string | null
  note: string | null
}

const TERMINAL: Record<string, string> = {
  invalid: 'This invitation link is not valid.',
  expired: 'This invitation has expired. Ask the creator for a new link.',
  revoked: 'This invitation was revoked by the creator.',
  rotated: 'This invitation was replaced with a newer link. Ask the creator for the current one.',
  already_claimed: 'This invitation has already been used.',
}

export default function InvitationReview() {
  const { token } = useParams<{ token: string }>()
  const { status: authStatus } = useAuth()
  const { isConnected } = useAccount()

  const review = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api<Review>(`/invitations/${token}`),
    enabled: Boolean(token),
    retry: false,
  })

  const claim = useMutation({
    mutationFn: () => api<{ status: string; note: string }>(`/invitations/${token}/claim`, { method: 'POST' }),
  })

  if (review.isLoading) return <main className="page">Checking invitation…</main>

  const data = review.isError
    ? review.error instanceof ApiError && review.error.status === 404
      ? ({ status: 'invalid' } as Review)
      : null
    : (review.data ?? null)

  if (!data) {
    return (
      <main className="page">
        <div className="notice error">Backend unavailable — try again shortly.</div>
      </main>
    )
  }

  if (TERMINAL[data.status]) {
    return (
      <main className="page">
        <h1>Invitation</h1>
        <div className="notice warn">{TERMINAL[data.status]}</div>
      </main>
    )
  }

  return (
    <main className="page">
      <h1>You're invited</h1>
      <div className="card">
        {data.property_alias && (
          <p>
            <strong>{data.property_alias}</strong> — invited as{' '}
            <span className="badge">{data.role === 'RECIPIENT' ? 'Deposit recipient' : 'Tenant'}</span>
          </p>
        )}
        {data.status === 'valid_disconnected' && (
          <>
            <p className="muted">{data.note}</p>
            <WalletStatus />
            {isConnected && authStatus !== 'authenticated' && (
              <p>
                <Link to="/login">Sign in with the invited wallet</Link> to continue.
              </p>
            )}
          </>
        )}
        {data.status === 'wrong_wallet' && (
          <div className="notice warn">
            This invitation was issued to a different wallet. Switch to the invited account in
            your wallet and sign in again.
          </div>
        )}
        {data.status === 'valid_wallet_matched' && (
          <>
            <dl className="kv">
              <dt>Your wallet</dt>
              <dd className="mono">{data.expected_wallet}</dd>
              {data.required_amount_wei && (
                <>
                  <dt>Your required contribution</dt>
                  <dd className="amount">{weiToMon(data.required_amount_wei)} MON</dd>
                </>
              )}
            </dl>
            {claim.isSuccess ? (
              <div className="notice success">
                <strong>Joined offchain.</strong> {claim.data.note} Check your{' '}
                <Link to="/dashboard">dashboard</Link> — once the agreement is onchain you will
                accept and fund it with real wallet transactions there.
              </div>
            ) : (
              <>
                <p className="muted small">
                  Joining links this draft to your wallet in the application. It does{' '}
                  <strong>not</strong> accept the agreement onchain — that will be a separate
                  wallet transaction you approve later.
                </p>
                <button className="primary" disabled={claim.isPending} onClick={() => claim.mutate()}>
                  {claim.isPending ? 'Joining…' : 'Join this agreement (offchain)'}
                </button>
              </>
            )}
            {claim.isError && (
              <div className="notice error">
                {claim.error instanceof ApiError ? claim.error.message : 'claim failed'}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
