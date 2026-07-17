// Live agreement page. ALL financial and role state comes from DIRECT contract
// reads (wagmi/viem against Monad Testnet). The backend supplies only the
// private alias and terms metadata — never acceptance or funding state, and
// never role. Role and permitted actions come from the shared resolver.

import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { readContract } from 'wagmi/actions'
import { api } from '../lib/api'
import { EXPLORER_ADDRESS, EXPLORER_TX, monadTestnet, wagmiConfig } from '../lib/chain'
import { formatTimestamp, shortAddress, weiToMon } from '../lib/format'
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
import {
  resolveAgreementRole,
  type AgreementSnapshot,
  type TenantSnapshot,
} from '../hooks/useAgreementRole'
import { useAgreementCacheSync } from '../hooks/useAgreementCacheSync'
import { AgreementActivity } from '../components/AgreementActivity'
import { NetworkDiagnosticsPanel } from '../components/NetworkDiagnosticsPanel'
import { useWalletNetworkDiagnostics } from '../hooks/useWalletNetworkDiagnostics'

const STATUS_NAMES = ['NONE', 'FUNDING', 'ACTIVE', 'FINALIZED', 'CANCELLED'] as const
const TABS = ['Overview', 'Participants & funding', 'Activity', 'Terms & proof'] as const

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
  totalRequired: bigint
  totalFunded: bigint
  recipientAccepted: boolean
  status: number
}

type RawTenant = {
  requiredAmount: bigint
  fundedAmount: bigint
  accepted: boolean
  exists: boolean
}

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
  // only (both chains 10143, app RPC returns a block, contract visible through
  // the app RPC). Optional injected-provider reads (nonce, wallet balance) are
  // diagnostic and never gate. Identity (account) mismatch is handled
  // separately by the AccountMismatchCard, not by this flag.
  const diagnostics = useWalletNetworkDiagnostics({ contractAddress })
  const networkReady = diagnostics.data?.networkReady ?? false

  const agreement = agreementRead.data as RawAgreement | undefined

  // Stored application transactions + page-load cache repair. The direct
  // contract reads above stay authoritative for everything actionable; when
  // the DB status cache disagrees with them, the backend refreshes it from
  // its own direct contract read.
  const cacheSync = useAgreementCacheSync({
    chainId: params.chainId,
    contractAddress,
    agreementId: params.agreementId,
    onchainStatusName: agreement ? (STATUS_NAMES[agreement.status] ?? 'NONE') : null,
    enabled: authStatus === 'authenticated',
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

  if (agreementRead.isLoading) return <main className="page">Reading contract state…</main>
  if (agreementRead.isError || !agreement || !role) {
    return (
      <main className="page">
        <div className="notice error">
          Could not read this agreement from the contract. Check the RPC connection and the
          address in the URL.
        </div>
      </main>
    )
  }

  const statusName = STATUS_NAMES[agreement.status] ?? 'NONE'
  const acceptedCount = tenantRecords.filter((entry) => entry.record?.accepted).length
  const fundedCount = tenantRecords.filter(
    (entry) => entry.record && entry.record.fundedAmount === entry.record.requiredAmount,
  ).length
  const me = role.connectedWallet

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

  return (
    <main className="page">
      <h1>{metadata.data?.property_alias ?? `Agreement #${params.agreementId}`}</h1>
      <p>
        <span className={`badge ${statusName.toLowerCase()}`}>{statusName}</span>{' '}
        <span className="muted small">
          Agreement #{params.agreementId} ·{' '}
          <a href={`${EXPLORER_ADDRESS}${contractAddress}`} target="_blank" rel="noreferrer" className="mono">
            {shortAddress(contractAddress)} ↗
          </a>
        </span>
      </p>

      {statusName === 'FUNDING' && role.fundingDeadlinePassed && (
        <div className="notice error">
          The funding deadline for this agreement has passed. It can no longer be accepted
          or funded and will not activate — it can only be cancelled, after which each
          tenant withdraws its own contribution.
        </div>
      )}

      <div className="tabs" role="tablist">
        {TABS.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? 'current' : ''}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="card">
          <dl className="kv">
            <dt>Status</dt><dd>{statusName}</dd>
            <dt>Total funded</dt>
            <dd className="amount">
              {weiToMon(agreement.totalFunded)} / {weiToMon(agreement.totalRequired)} MON
            </dd>
            <dt>Tenant acceptance</dt><dd>{acceptedCount} of {agreement.tenantCount}</dd>
            <dt>Tenants fully funded</dt><dd>{fundedCount} of {agreement.tenantCount}</dd>
            <dt>Recipient accepted</dt><dd>{agreement.recipientAccepted ? 'Yes' : 'Not yet'}</dd>
            <dt>Creator</dt><dd className="mono">{agreement.creator}</dd>
            <dt>Recipient</dt><dd className="mono">{agreement.recipient}</dd>
            <dt>Funding deadline</dt><dd>{formatTimestamp(agreement.fundingDeadline.toString())}</dd>
            <dt>Lease</dt>
            <dd>
              {formatTimestamp(agreement.leaseStart.toString())} →{' '}
              {formatTimestamp(agreement.leaseEnd.toString())}
            </dd>
            <dt>Claim deadline</dt><dd>{formatTimestamp(agreement.claimDeadline.toString())}</dd>
            <dt>Settlement deadline</dt><dd>{formatTimestamp(agreement.settlementDeadline.toString())}</dd>
            <dt>Chain</dt><dd>Monad Testnet ({monadTestnet.id})</dd>
            {metadata.data?.creation_tx_hash && (
              <>
                <dt>Creation transaction</dt>
                <dd>
                  <a href={`${EXPLORER_TX}${metadata.data.creation_tx_hash}`} target="_blank" rel="noreferrer" className="mono">
                    {shortAddress(metadata.data.creation_tx_hash)} ↗
                  </a>
                </dd>
              </>
            )}
          </dl>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Number(
              agreement.totalRequired > 0n
                ? (agreement.totalFunded * 100n) / agreement.totalRequired
                : 0n,
            )}
            aria-label="Funding progress"
            style={{ marginTop: '0.75rem' }}
          >
            <div
              className="progress-fill"
              style={{
                width: `${Number(
                  agreement.totalRequired > 0n
                    ? (agreement.totalFunded * 100n) / agreement.totalRequired
                    : 0n,
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {tab === 'Participants & funding' && (
        <>
          <div className="card">
            <h2>Tenants</h2>
            <table className="data">
              <thead>
                <tr><th>Wallet</th><th>Required</th><th>Funded</th><th>Remaining</th><th>Accepted</th></tr>
              </thead>
              <tbody>
                {tenantRecords.map(({ wallet, record }) => (
                  <tr key={wallet}>
                    <td className="mono">
                      {shortAddress(wallet)}
                      {wallet.toLowerCase() === me ? ' (you)' : ''}
                    </td>
                    <td className="amount">{record ? weiToMon(record.requiredAmount) : '…'}</td>
                    <td className="amount">{record ? weiToMon(record.fundedAmount) : '…'}</td>
                    <td className="amount">
                      {record ? weiToMon(record.requiredAmount - record.fundedAmount) : '…'}
                    </td>
                    <td>{record?.accepted ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted">
              Recipient {shortAddress(agreement.recipient)}:{' '}
              {agreement.recipientAccepted ? 'accepted ✓' : 'not accepted yet'} (recipients do not
              fund the escrow)
            </p>
          </div>

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
              agreement is ACTIVE.
            </div>
          ) : statusName === 'FUNDING' ? (
            <>
              <WalletMismatchNotice role={role} />
              {role.isParticipant && !networkReady && (
                <div className="notice warn">
                  Actions are disabled until <strong>Network ready</strong> shows{' '}
                  <strong>Yes</strong> above. Use Recheck / Switch to Monad Testnet.
                </div>
              )}
              {role.isRecipient && <RecipientAcceptanceCard {...commonProps} />}
              {role.isTenant && (
                <>
                  {role.isCreator && (
                    <div className="notice">
                      You created this agreement <strong>and</strong> you are one of its tenants.
                      Creating it gave you no special power over the funds — you still accept and
                      fund your own contribution like any tenant, and you cannot move anyone
                      else's money.
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
            <div className="notice">This agreement is {statusName.toLowerCase()}.</div>
          )}
        </>
      )}

      {tab === 'Activity' && (
        <div className="card">
          <h2>Activity</h2>
          <p className="muted small">
            Verified application transactions stored for this agreement. Current status and
            balances above always come from direct contract reads.
          </p>
          <AgreementActivity
            transactions={cacheSync.transactions}
            isLoading={cacheSync.isLoading}
            isError={cacheSync.isError}
            authenticated={authStatus === 'authenticated'}
          />
        </div>
      )}

      {tab === 'Terms & proof' && (
        <div className="card">
          <h2>Terms & proof</h2>
          <dl className="kv">
            <dt>Onchain terms hash</dt>
            <dd className="mono">{agreement.termsHash}</dd>
          </dl>
          {metadata.data?.terms_json ? (
            <>
              <p className="muted small">
                Canonical terms accepted by every participant (private copy; its Keccak-256 hash
                is the value stored onchain above):
              </p>
              <pre className="mono small" style={{ overflowX: 'auto' }}>
                {JSON.stringify(metadata.data.terms_json, null, 2)}
              </pre>
            </>
          ) : (
            <p className="muted small">
              Sign in as a participant to view the private readable terms.
            </p>
          )}
        </div>
      )}
    </main>
  )
}
