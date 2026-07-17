// Live agreement page. ALL financial and role state comes from DIRECT contract
// reads (wagmi/viem against Monad Testnet). The backend supplies only the
// private alias, terms metadata, and stored transaction history — never
// acceptance or funding state, and never role. Role and permitted actions
// come from the shared resolver.

import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { readContract } from 'wagmi/actions'
import { api } from '../lib/api'
import { EXPLORER_ADDRESS, EXPLORER_TX, wagmiConfig } from '../lib/chain'
import { shortAddress } from '../lib/format'
import { sharedDepositEscrowAbi } from '../generated/sharedDepositEscrow'
import { useAuth } from '../app/AuthContext'
import {
  AccountMismatchCard,
  ReadOnlyParticipantCard,
  RecipientAcceptanceCard,
  TenantAcceptanceCard,
  TenantFundingCard,
  TenantWithdrawCard,
  WalletMismatchNotice,
} from '../components/AgreementActions'
import { AgreementActivity } from '../components/AgreementActivity'
import { NetworkDiagnosticsPanel } from '../components/NetworkDiagnosticsPanel'
import {
  AgreementProgress,
  AmountDisplay,
  DeadlineDisplay,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
  ParticipantCard,
  ProofRow,
  StatusBadge,
  WalletAddress,
  describeAgreementStatus,
} from '../components/ui'
import {
  resolveAgreementRole,
  type AgreementSnapshot,
  type TenantSnapshot,
} from '../hooks/useAgreementRole'
import { useAgreementCacheSync } from '../hooks/useAgreementCacheSync'
import { useWalletNetworkDiagnostics } from '../hooks/useWalletNetworkDiagnostics'

const STATUS_NAMES = ['NONE', 'FUNDING', 'ACTIVE', 'FINALIZED', 'CANCELLED'] as const
const TABS = [
  'Overview',
  'Participants & funding',
  'Claims',
  'Settlement',
  'Activity',
  'Terms & proof',
] as const

interface Metadata {
  property_alias: string | null
  terms_json: Record<string, unknown> | null
  creation_tx_hash: string | null
  creator: string | null
  recipient: string | null
}

type RawAgreement = {
  creator: `0x${string}`
  recipient: `0x${string}`
  termsHash: `0x${string}`
  leaseStart: bigint
  leaseEnd: bigint
  fundingDeadline: bigint
  claimDeadline: bigint
  settlementDeadline: bigint
  tenantCount: number
  requiredApprovals: number
  claimCount: number
  unresolvedClaimCount: number
  totalRequired: bigint
  totalFunded: bigint
  recipientAccepted: boolean
  recipientPayoutWithdrawn: boolean
  status: number
}

type RawTenant = {
  requiredAmount: bigint
  fundedAmount: bigint
  refundAmount: bigint
  accepted: boolean
  exists: boolean
  refundWithdrawn: boolean
}

type RawClaim = {
  liableTenant: `0x${string}`
  reasonHash: `0x${string}`
  evidenceHash: `0x${string}`
  amount: bigint
  yesVotes: number
  noVotes: number
  claimType: number
  status: number
}

const CLAIM_STATUS_LABELS = ['—', 'Voting open', 'Approved', 'Rejected', 'Withdrawn'] as const
const CLAIM_TYPE_LABELS = ['Shared deduction', 'Individual deduction'] as const

export default function AgreementDetail() {
  const params = useParams<{ chainId: string; contractAddress: string; agreementId: string }>()
  const contractAddress = params.contractAddress as `0x${string}`
  const agreementId = BigInt(params.agreementId ?? '0')
  const { address } = useAccount()
  const { status: authStatus, wallet: authWallet, accountMismatch } = useAuth()
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview')

  const contract = { address: contractAddress, abi: sharedDepositEscrowAbi } as const

  const agreementRead = useReadContract({
    ...contract,
    functionName: 'getAgreement',
    args: [agreementId],
    query: { refetchInterval: 15_000 },
  })
  const tenantsRead = useReadContract({
    ...contract,
    functionName: 'getAgreementTenants',
    args: [agreementId],
  })
  const tenantList = (tenantsRead.data as readonly `0x${string}`[] | undefined) ?? []
  const tenantRecordsRead = useReadContracts({
    contracts: tenantList.map((tenant) => ({
      ...contract,
      functionName: 'getTenant',
      args: [agreementId, tenant] as const,
    })),
    query: { enabled: tenantList.length > 0, refetchInterval: 15_000 },
  })

  const metadata = useQuery({
    queryKey: ['agreement-metadata', params.chainId, contractAddress, params.agreementId],
    queryFn: () =>
      api<Metadata>(
        `/agreements/${params.chainId}/${contractAddress}/${params.agreementId}/metadata`,
      ),
    enabled: authStatus === 'authenticated',
    retry: false,
  })

  // Dual-provider Monad Testnet health. Writes are gated on NETWORK readiness
  // only; identity (account) mismatch is handled by the AccountMismatchCard.
  const diagnostics = useWalletNetworkDiagnostics({ contractAddress })
  const networkReady = diagnostics.data?.networkReady ?? false

  const agreement = agreementRead.data as RawAgreement | undefined

  // Stored application transactions + page-load cache repair. Direct reads
  // stay authoritative; a disagreeing DB cache is refreshed by the backend
  // from its own direct contract read.
  const cacheSync = useAgreementCacheSync({
    chainId: params.chainId,
    contractAddress,
    agreementId: params.agreementId,
    onchainStatusName: agreement ? (STATUS_NAMES[agreement.status] ?? 'NONE') : null,
    enabled: authStatus === 'authenticated',
  })

  // Claims are read one by one from the contract (IDs 1..claimCount).
  const claimCount = agreement?.claimCount ?? 0
  const claimsRead = useReadContracts({
    contracts: Array.from({ length: claimCount }, (_, index) => ({
      ...contract,
      functionName: 'getClaim',
      args: [agreementId, BigInt(index + 1)] as const,
    })),
    query: { enabled: claimCount > 0 },
  })

  const tenantRecords = useMemo(() => {
    const results = tenantRecordsRead.data ?? []
    return tenantList.map((wallet, index) => ({
      wallet,
      record: results[index]?.result as RawTenant | undefined,
    }))
  }, [tenantList, tenantRecordsRead.data])

  const role = useMemo(() => {
    if (!agreement) return null
    const snapshot: AgreementSnapshot = {
      creator: agreement.creator,
      recipient: agreement.recipient,
      recipientAccepted: agreement.recipientAccepted,
      status: agreement.status,
      fundingDeadline: agreement.fundingDeadline,
    }
    const tenants: TenantSnapshot[] = tenantRecords.map(({ wallet, record }) => ({
      wallet,
      requiredAmount: record?.requiredAmount ?? 0n,
      fundedAmount: record?.fundedAmount ?? 0n,
      accepted: record?.accepted ?? false,
      exists: record?.exists ?? false,
    }))
    return resolveAgreementRole({
      connectedAddress: address,
      authWallet,
      nowSeconds: Math.floor(Date.now() / 1000),
      agreement: snapshot,
      tenants,
    })
  }, [agreement, tenantRecords, address, authWallet])

  if (agreementRead.isLoading) {
    return (
      <main className="page">
        <PageHeader title="Agreement" />
        <LoadingSkeleton lines={5} label="Reading the contract" />
      </main>
    )
  }
  if (agreementRead.isError || !agreement || !role) {
    return (
      <main className="page">
        <ErrorState
          title="Could not read this agreement"
          retry={() => void agreementRead.refetch()}
        >
          The contract could not be read. Check your connection and the address in the URL —
          nothing onchain is affected.
        </ErrorState>
      </main>
    )
  }

  const statusName = STATUS_NAMES[agreement.status] ?? 'NONE'
  const acceptedCount = tenantRecords.filter((entry) => entry.record?.accepted).length
  const fundedCount = tenantRecords.filter(
    (entry) => entry.record && entry.record.fundedAmount === entry.record.requiredAmount,
  ).length
  const me = role.connectedWallet

  const roleLabel = role.isRecipient
    ? 'Deposit recipient'
    : role.isTenant && role.isCreator
      ? 'Creator · tenant'
      : role.isTenant
        ? 'Tenant'
        : 'Read-only'

  async function refetchAll() {
    await Promise.all([agreementRead.refetch(), tenantRecordsRead.refetch()])
  }

  // Fresh DIRECT reads for VERIFIED checks (bypass the cached query).
  async function readAccepted(kind: 'tenant' | 'recipient'): Promise<boolean> {
    if (kind === 'recipient') {
      const a = (await readContract(wagmiConfig, {
        ...contract,
        functionName: 'getAgreement',
        args: [agreementId],
      })) as RawAgreement
      return a.recipientAccepted
    }
    if (!me) return false
    const t = (await readContract(wagmiConfig, {
      ...contract,
      functionName: 'getTenant',
      args: [agreementId, me as `0x${string}`],
    })) as RawTenant
    return t.accepted
  }

  async function readFunded(): Promise<bigint> {
    if (!me) return 0n
    const t = (await readContract(wagmiConfig, {
      ...contract,
      functionName: 'getTenant',
      args: [agreementId, me as `0x${string}`],
    })) as RawTenant
    return t.fundedAmount
  }

  const commonProps = {
    role,
    recipientAccepted: agreement.recipientAccepted,
    contractAddress,
    agreementId,
    termsHash: agreement.termsHash,
    refetch: refetchAll,
    readAccepted,
    readFunded,
    networkHealthy: networkReady,
  }

  const claims = (claimsRead.data ?? [])
    .map((entry, index) => ({ id: index + 1, claim: entry.result as RawClaim | undefined }))
    .filter((entry) => entry.claim !== undefined)

  return (
    <main className="page">
      <PageHeader
        title={metadata.data?.property_alias ?? `Agreement #${params.agreementId}`}
        eyebrow="Shared deposit"
        meta={
          <>
            <StatusBadge status={statusName} />
            <span className="badge tone-accent">{roleLabel}</span>
            <span className="muted small">
              Agreement #{params.agreementId} ·{' '}
              <a
                href={`${EXPLORER_ADDRESS}${contractAddress}`}
                target="_blank"
                rel="noreferrer"
                className="mono"
              >
                {shortAddress(contractAddress)} ↗
              </a>
            </span>
          </>
        }
      />

      {statusName === 'FUNDING' && role.fundingDeadlinePassed && (
        <div className="notice error">
          The funding deadline for this agreement has passed. It can no longer be accepted or
          funded and will not activate — it can only be cancelled, after which each tenant
          withdraws their own contribution.
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Agreement sections">
        {TABS.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? 'current' : ''}
            onClick={() => setTab(name)}
          >
            {name}
            {name === 'Claims' && claimCount > 0 ? ` (${claimCount})` : ''}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <>
          <div className="card">
            <h2>Deposit</h2>
            <AgreementProgress
              fundedWei={agreement.totalFunded}
              requiredWei={agreement.totalRequired}
              acceptedCount={acceptedCount}
              tenantCount={agreement.tenantCount}
            />
            {statusName === 'ACTIVE' && (
              <p className="notice success" style={{ marginBottom: 0 }}>
                The deposit is fully funded and locked. No one — including the creator — can move
                these funds outside the agreement's own rules.
              </p>
            )}
          </div>
          <div className="grid-two">
            <div className="card" style={{ marginBottom: 0 }}>
              <h2>People</h2>
              <dl className="kv">
                <dt>Creator</dt>
                <dd>
                  <WalletAddress address={agreement.creator} />
                </dd>
                <dt>Deposit recipient</dt>
                <dd>
                  <WalletAddress address={agreement.recipient} />
                </dd>
                <dt>Recipient accepted</dt>
                <dd>{agreement.recipientAccepted ? 'Yes' : 'Not yet'}</dd>
                <dt>Tenants fully funded</dt>
                <dd>
                  {fundedCount} of {agreement.tenantCount}
                </dd>
              </dl>
            </div>
            <div className="card" style={{ marginBottom: 0 }}>
              <h2>Key dates</h2>
              <dl className="kv">
                <dt>Funding deadline</dt>
                <dd>
                  <DeadlineDisplay seconds={agreement.fundingDeadline.toString()} />
                </dd>
                <dt>Lease</dt>
                <dd>
                  <DeadlineDisplay seconds={agreement.leaseStart.toString()} passedText="" /> →{' '}
                  <DeadlineDisplay seconds={agreement.leaseEnd.toString()} passedText="" />
                </dd>
                <dt>Claims close</dt>
                <dd>
                  <DeadlineDisplay seconds={agreement.claimDeadline.toString()} />
                </dd>
                <dt>Settlement due</dt>
                <dd>
                  <DeadlineDisplay seconds={agreement.settlementDeadline.toString()} />
                </dd>
              </dl>
            </div>
          </div>
        </>
      )}

      {tab === 'Participants & funding' && (
        <>
          <section className="card" aria-labelledby="tenants-heading">
            <h2 id="tenants-heading">Tenants</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {tenantRecords.map(({ wallet, record }) => (
                <ParticipantCard
                  key={wallet}
                  address={wallet}
                  roleLabel={
                    wallet.toLowerCase() === agreement.creator.toLowerCase()
                      ? 'Creator · tenant'
                      : 'Tenant'
                  }
                  isYou={wallet.toLowerCase() === me}
                  accepted={record?.accepted}
                  facts={
                    record
                      ? [
                          { label: 'Required', value: <AmountDisplay wei={record.requiredAmount} /> },
                          { label: 'Funded', value: <AmountDisplay wei={record.fundedAmount} /> },
                          {
                            label: 'Remaining',
                            value: (
                              <AmountDisplay wei={record.requiredAmount - record.fundedAmount} />
                            ),
                          },
                        ]
                      : []
                  }
                />
              ))}
              <ParticipantCard
                address={agreement.recipient}
                roleLabel="Deposit recipient"
                isYou={agreement.recipient.toLowerCase() === me}
                accepted={agreement.recipientAccepted}
                facts={[{ label: 'Contribution', value: 'No contribution required' }]}
              />
            </div>
          </section>

          {(authStatus === 'authenticated' || accountMismatch) &&
            statusName === 'FUNDING' &&
            role.isParticipant && (
              <NetworkDiagnosticsPanel
                data={diagnostics.data}
                loading={diagnostics.loading}
                recheck={diagnostics.recheck}
              />
            )}
          {accountMismatch && authWallet && address ? (
            <AccountMismatchCard sessionWallet={authWallet} connectedWallet={address} />
          ) : authStatus !== 'authenticated' ? (
            <div className="notice">
              <Link to="/login">Sign in</Link> with a participant wallet to act on this agreement.
            </div>
          ) : statusName === 'ACTIVE' ? (
            <div className="notice success">
              All acceptances and contributions are complete — the deposit is locked and the
              agreement is active.
            </div>
          ) : statusName === 'FUNDING' ? (
            <>
              <WalletMismatchNotice role={role} />
              {role.isParticipant && !networkReady && (
                <div className="notice warn">
                  Actions are paused until <strong>Network ready</strong> shows{' '}
                  <strong>Yes</strong> above. Use Recheck / Switch to Monad Testnet.
                </div>
              )}
              {role.isRecipient && <RecipientAcceptanceCard {...commonProps} />}
              {role.isTenant && (
                <>
                  {role.isCreator && (
                    <div className="notice">
                      You created this agreement <strong>and</strong> you are one of its tenants.
                      Creating it gave you no special power over the funds — you accept and fund
                      your own share like any tenant, and you cannot move anyone else's money.
                    </div>
                  )}
                  <TenantAcceptanceCard {...commonProps} />
                  <TenantFundingCard {...commonProps} />
                  <TenantWithdrawCard {...commonProps} />
                </>
              )}
              <ReadOnlyParticipantCard role={role} />
            </>
          ) : (
            <div className="notice">
              This agreement is {describeAgreementStatus(statusName).toLowerCase()}.
            </div>
          )}
        </>
      )}

      {tab === 'Claims' && (
        <section className="card" aria-labelledby="claims-heading">
          <h2 id="claims-heading">Claims</h2>
          <p className="muted small">
            After the lease, the deposit recipient can claim deductions from the deposit; tenants
            vote under a strict-majority rule ({agreement.requiredApprovals} approvals needed).
            Everything below is read directly from the contract.
          </p>
          {claimCount === 0 ? (
            <EmptyState title="No claims yet">
              {statusName === 'FUNDING'
                ? 'Claims become possible only after the deposit is fully funded and locked.'
                : statusName === 'ACTIVE'
                  ? 'No deductions have been claimed against this deposit.'
                  : 'This agreement finished with no claims.'}
            </EmptyState>
          ) : claimsRead.isLoading ? (
            <LoadingSkeleton lines={3} label="Reading claims" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {claims.map(({ id, claim }) => (
                <div className="card tinted" key={id} style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <strong>Claim #{id}</strong>
                    <span className="badge">{CLAIM_TYPE_LABELS[claim!.claimType] ?? 'Claim'}</span>
                    <span
                      className={`badge ${
                        claim!.status === 2
                          ? 'tone-danger'
                          : claim!.status === 3
                            ? 'tone-success'
                            : ''
                      }`}
                    >
                      {CLAIM_STATUS_LABELS[claim!.status] ?? '—'}
                    </span>
                    <AmountDisplay wei={claim!.amount} />
                  </div>
                  <dl className="kv small">
                    {claim!.claimType === 1 && (
                      <>
                        <dt>Liable tenant</dt>
                        <dd>
                          <WalletAddress address={claim!.liableTenant} />
                        </dd>
                      </>
                    )}
                    <dt>Votes</dt>
                    <dd>
                      {claim!.yesVotes} approve · {claim!.noVotes} reject
                    </dd>
                  </dl>
                  <ProofRow label="Reason hash" value={claim!.reasonHash} />
                  <ProofRow label="Evidence hash" value={claim!.evidenceHash} />
                </div>
              ))}
              <p className="muted small">
                Submitting and voting on claims from this app arrives in a later release. Claim
                data shown here is live contract state.
              </p>
            </div>
          )}
        </section>
      )}

      {tab === 'Settlement' && (
        <section className="card" aria-labelledby="settlement-heading">
          <h2 id="settlement-heading">Settlement & withdrawals</h2>
          {statusName === 'FUNDING' && (
            <EmptyState title="Not settled yet">
              Settlement happens after the deposit is locked, the lease ends, and all claims are
              resolved. Nothing to settle while deposits are still being collected.
            </EmptyState>
          )}
          {statusName === 'ACTIVE' && (
            <>
              <p>
                The deposit of <AmountDisplay wei={agreement.totalFunded} /> is locked. After the
                lease ends (
                <DeadlineDisplay seconds={agreement.leaseEnd.toString()} passedText="ended" />
                ) and all claims are resolved, the contract itself computes exact refunds and
                approved deductions — no administrator is involved.
              </p>
              <dl className="kv">
                <dt>Unresolved claims</dt>
                <dd>{agreement.unresolvedClaimCount}</dd>
                <dt>Settlement due</dt>
                <dd>
                  <DeadlineDisplay seconds={agreement.settlementDeadline.toString()} />
                </dd>
              </dl>
              <p className="muted small">
                Finalization and withdrawals from this app arrive in a later release; the
                contract already enforces all of it onchain.
              </p>
            </>
          )}
          {statusName === 'FINALIZED' && (
            <>
              <p>The contract has computed the final split.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {tenantRecords.map(({ wallet, record }) => (
                  <ParticipantCard
                    key={wallet}
                    address={wallet}
                    roleLabel="Tenant"
                    isYou={wallet.toLowerCase() === me}
                    facts={
                      record
                        ? [
                            { label: 'Refund', value: <AmountDisplay wei={record.refundAmount} /> },
                            {
                              label: 'Withdrawn',
                              value: record.refundWithdrawn ? 'Yes' : 'Not yet',
                            },
                          ]
                        : []
                    }
                  />
                ))}
                <ParticipantCard
                  address={agreement.recipient}
                  roleLabel="Deposit recipient"
                  isYou={agreement.recipient.toLowerCase() === me}
                  facts={[
                    {
                      label: 'Payout withdrawn',
                      value: agreement.recipientPayoutWithdrawn ? 'Yes' : 'Not yet',
                    },
                  ]}
                />
              </div>
              <p className="muted small">
                Withdrawal buttons arrive in a later release; amounts above are live contract
                state.
              </p>
            </>
          )}
          {statusName === 'CANCELLED' && (
            <p>
              Funding was cancelled. Each tenant can reclaim exactly what they contributed;
              nothing is paid to the deposit recipient.
            </p>
          )}
        </section>
      )}

      {tab === 'Activity' && (
        <section className="card" aria-labelledby="activity-heading">
          <h2 id="activity-heading">Activity</h2>
          <p className="muted small">
            Verified transactions made through this application. Current status and balances
            always come from direct contract reads.
          </p>
          <AgreementActivity
            transactions={cacheSync.transactions}
            isLoading={cacheSync.isLoading}
            isError={cacheSync.isError}
            authenticated={authStatus === 'authenticated'}
          />
        </section>
      )}

      {tab === 'Terms & proof' && (
        <section className="card" aria-labelledby="proof-heading">
          <h2 id="proof-heading">Terms & proof</h2>
          <p className="muted small">
            The contract stores only the fingerprint (hash) of the agreed terms. Anyone can
            recompute it from the readable terms below and compare.
          </p>
          <ProofRow label="Terms hash (onchain)" value={agreement.termsHash} />
          <ProofRow label="Escrow contract" value={contractAddress} />
          {metadata.data?.creation_tx_hash && (
            <div className="proof-row">
              <span className="proof-label">Creation transaction</span>
              <span className="proof-value mono">
                <a
                  href={`${EXPLORER_TX}${metadata.data.creation_tx_hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {metadata.data.creation_tx_hash} ↗
                </a>
              </span>
            </div>
          )}
          {metadata.data?.terms_json ? (
            <details style={{ marginTop: '0.75rem' }}>
              <summary style={{ cursor: 'pointer', minHeight: '44px', display: 'flex', alignItems: 'center' }}>
                Show the full readable terms (private to participants)
              </summary>
              <pre className="mono small" style={{ overflowX: 'auto' }}>
                {JSON.stringify(metadata.data.terms_json, null, 2)}
              </pre>
            </details>
          ) : (
            <p className="muted small">Sign in as a participant to view the readable terms.</p>
          )}
        </section>
      )}
    </main>
  )
}
