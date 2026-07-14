import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../app/AuthContext'
import { weiToMon, shortAddress } from '../lib/format'

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

  if (status === 'loading') return <main className="page">Loading…</main>
  if (status !== 'authenticated') {
    return (
      <main className="page">
        <h1>Dashboard</h1>
        <div className="notice">
          <Link to="/login">Sign in with your wallet</Link> to see your agreements.
        </div>
      </main>
    )
  }

  const data = dashboard.data
  const isEmpty =
    data && data.drafts.length === 0 && data.agreements.length === 0 && data.pending_invitations === 0

  return (
    <main className="page">
      <h1>Dashboard</h1>
      {dashboard.isLoading && <p className="muted">Loading your records…</p>}
      {dashboard.isError && <div className="notice error">Backend unavailable.</div>}

      {isEmpty && (
        <div className="card">
          <h2>No agreements yet.</h2>
          <p className="muted">
            Create your first shared deposit to lock contributions transparently onchain.
          </p>
          <Link to="/agreements/new">
            <button className="primary">Create your first shared deposit</button>
          </Link>
        </div>
      )}

      {data && data.pending_invitations > 0 && (
        <div className="notice">
          You have {data.pending_invitations} open invitation
          {data.pending_invitations > 1 ? 's' : ''}. Open the invitation link you received to
          review it.
        </div>
      )}

      {data && data.drafts.length > 0 && (
        <div className="card">
          <h2>Drafts (not yet onchain)</h2>
          <table className="data">
            <thead>
              <tr>
                <th>Alias</th>
                <th>Tenants</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.drafts.map((draft) => (
                <tr key={draft.id}>
                  <td>{draft.property_alias}</td>
                  <td className="amount">{draft.tenants.length}</td>
                  <td>
                    <Link to={`/drafts/${draft.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.agreements.length > 0 && (
        <div className="card">
          <h2>Onchain agreements</h2>
          <table className="data">
            <thead>
              <tr>
                <th>Alias</th>
                <th>Role</th>
                <th>Status</th>
                <th>Funded</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.agreements.map((agreement) => (
                <tr key={`${agreement.contract_address}-${agreement.agreement_id}`}>
                  <td>{agreement.property_alias ?? shortAddress(agreement.contract_address)}</td>
                  <td>{agreement.role.replace('_', ' ').toLowerCase()}</td>
                  <td>
                    <span className={`badge ${agreement.status_name.toLowerCase()}`}>
                      {agreement.status_name}
                    </span>
                  </td>
                  <td className="amount">
                    {weiToMon(agreement.total_funded_wei)} / {weiToMon(agreement.total_required_wei)} MON
                  </td>
                  <td>
                    <Link
                      to={`/agreements/${agreement.chain_id}/${agreement.contract_address}/${agreement.agreement_id}`}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
