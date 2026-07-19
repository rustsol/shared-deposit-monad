// Dashboard: the signed-in wallet's drafts and onchain agreements. Statuses
// come from direct contract reads on the backend - never the cache column.

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../app/AuthContext'
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
  RoleBadge,
  StatusBadge,
} from '../components/ui'
import { shortAddress, weiToMon } from '../lib/format'

interface DashboardDraft {
  id: string
  property_alias: string
  status: string
  tenants: { wallet: string }[]
}

interface DashboardAgreement {
  chain_id: number
  contract_address: string
  agreement_id: string
  property_alias: string | null
  role: string
  status_name: string
  total_required_wei: string
  total_funded_wei: string
}

interface DashboardData {
  drafts: DashboardDraft[]
  pending_invitations: number
  agreements: DashboardAgreement[]
}

export default function Dashboard() {
  const { status, wallet } = useAuth()
  const dashboard = useQuery({
    queryKey: ['dashboard', wallet],
    queryFn: () => api<DashboardData>('/dashboard'),
    enabled: status === 'authenticated',
  })

  if (status === 'loading') {
    return (
      <main className="page">
        <PageHeader title="Dashboard" />
        <LoadingSkeleton lines={4} label="Checking your session" />
      </main>
    )
  }
  if (status !== 'authenticated') {
    return (
      <main className="page">
        <PageHeader title="Dashboard" />
        <EmptyState
          title="Sign in to see your agreements"
          action={
            <Link className="button-primary" to="/login">
              Sign in with your wallet
            </Link>
          }
        >
          Your dashboard shows the deposits you take part in - as a tenant, creator, or deposit
          recipient.
        </EmptyState>
      </main>
    )
  }

  const data = dashboard.data
  const isEmpty =
    data &&
    data.drafts.length === 0 &&
    data.agreements.length === 0 &&
    data.pending_invitations === 0

  return (
    <main className="page">
      <PageHeader
        title="Dashboard"
        lead="Every deposit you take part in, with live status read directly from the contract."
      />
      {dashboard.isLoading && <LoadingSkeleton lines={4} label="Loading your agreements" />}
      {dashboard.isError && (
        <ErrorState title="Could not load your agreements" retry={() => void dashboard.refetch()}>
          The application server is unreachable. Your onchain deposits are unaffected.
        </ErrorState>
      )}

      {isEmpty && (
        <EmptyState
          title="No agreements yet"
          action={
            <Link className="button-primary" to="/agreements/new">
              Create a shared deposit
            </Link>
          }
        >
          Create your first shared deposit to lock everyone's contribution in one transparent
          onchain escrow.
        </EmptyState>
      )}

      {data && data.pending_invitations > 0 && (
        <div className="notice">
          You have {data.pending_invitations} open invitation
          {data.pending_invitations > 1 ? 's' : ''}. Open the invitation link you received to
          review and join.
        </div>
      )}

      {data && data.drafts.length > 0 && (
        <section aria-labelledby="drafts-heading">
          <h2 id="drafts-heading">Drafts - not onchain yet</h2>
          <div className="grid-cards">
            {data.drafts.map((draft) => (
              <div className="card" key={draft.id} style={{ marginBottom: 0 }}>
                <h3 style={{ marginTop: 0 }}>{draft.property_alias}</h3>
                <p className="muted small">
                  {draft.tenants.length} tenant{draft.tenants.length === 1 ? '' : 's'} · draft
                  only, nothing is onchain yet
                </p>
                <Link className="button-secondary" to={`/drafts/${draft.id}`}>
                  Open draft
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {data && data.agreements.length > 0 && (
        <section aria-labelledby="agreements-heading">
          <h2 id="agreements-heading">Onchain agreements</h2>
          <div className="grid-cards">
            {data.agreements.map((agreement) => {
              const funded = weiToMon(agreement.total_funded_wei)
              const required = weiToMon(agreement.total_required_wei)
              return (
                <div
                  className="card"
                  key={`${agreement.contract_address}-${agreement.agreement_id}`}
                  style={{ marginBottom: 0 }}
                >
                  <h3 style={{ marginTop: 0 }}>
                    {agreement.property_alias ?? shortAddress(agreement.contract_address)}
                  </h3>
                  <p style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <StatusBadge status={agreement.status_name} />
                    <RoleBadge role={agreement.role} />
                  </p>
                  <p className="small muted">
                    Funded:{' '}
                    <span className="amount">
                      {funded} / {required} MON
                    </span>
                  </p>
                  <Link
                    className="button-secondary"
                    to={`/agreements/${agreement.chain_id}/${agreement.contract_address}/${agreement.agreement_id}`}
                  >
                    Open agreement
                  </Link>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </main>
  )
}
