// Live agreement page. ALL financial state comes from direct contract reads
// (wagmi/viem against Monad Testnet); the backend supplies only the private
// alias and terms metadata. Acceptance, funding, and pre-activation
// withdrawal are real wallet transactions with receipt-verified status.

import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { api } from '../lib/api'
import { EXPLORER_ADDRESS, EXPLORER_TX, monadTestnet } from '../lib/chain'
import { formatTimestamp, monToWei, shortAddress, weiToMon } from '../lib/format'
import { sharedDepositEscrowAbi } from '../generated/sharedDepositEscrow'
import { useAuth } from '../app/AuthContext'
import { useContractTx } from '../hooks/useContractTx'

const STATUS_NAMES = ['NONE', 'FUNDING', 'ACTIVE', 'FINALIZED', 'CANCELLED'] as const
const TABS = ['Overview', 'Participants & funding', 'Activity', 'Terms & proof'] as const

interface Metadata {
  property_alias: string | null
  terms_json: Record<string, unknown> | null
  creation_tx_hash: string | null
  creator: string | null
  recipient: string | null
}

export default function AgreementDetail() {
  const params = useParams<{ chainId: string; contractAddress: string; agreementId: string }>()
  const contractAddress = params.contractAddress as `0x${string}`
  const agreementId = BigInt(params.agreementId ?? '0')
  const { address } = useAccount()
  const { status: authStatus } = useAuth()
  const { send } = useContractTx()
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview')
  const [fundInput, setFundInput] = useState('')
  const [withdrawInput, setWithdrawInput] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

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

  const agreement = agreementRead.data as
    | {
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
    | undefined

  const tenantRecords = useMemo(() => {
    const results = tenantRecordsRead.data ?? []
    return tenantList.map((wallet, index) => {
      const record = results[index]?.result as
        | {
            requiredAmount: bigint
            fundedAmount: bigint
            accepted: boolean
            exists: boolean
          }
        | undefined
      return { wallet, record }
    })
  }, [tenantList, tenantRecordsRead.data])

  if (agreementRead.isLoading) return <main className="page">Reading contract state…</main>
  if (agreementRead.isError || !agreement) {
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
  const me = address?.toLowerCase()
  const myTenant = tenantRecords.find((entry) => entry.wallet.toLowerCase() === me)
  const isRecipient = me === agreement.recipient.toLowerCase()
  const remaining =
    myTenant?.record !== undefined
      ? myTenant.record.requiredAmount - myTenant.record.fundedAmount
      : 0n
  const acceptedCount = tenantRecords.filter((entry) => entry.record?.accepted).length
  const fundedCount = tenantRecords.filter(
    (entry) => entry.record && entry.record.fundedAmount === entry.record.requiredAmount,
  ).length

  async function refetchAll() {
    await Promise.all([agreementRead.refetch(), tenantRecordsRead.refetch()])
  }

  async function acceptAsTenant() {
    await send({
      label: 'Accept agreement (tenant)',
      functionName: 'acceptAsTenant',
      ...contract,
      args: [agreementId, agreement!.termsHash],
      afterReceipt: refetchAll,
    })
  }

  async function acceptAsRecipient() {
    await send({
      label: 'Accept agreement (recipient)',
      functionName: 'acceptAsRecipient',
      ...contract,
      args: [agreementId, agreement!.termsHash],
      afterReceipt: refetchAll,
    })
  }

  async function deposit() {
    setFormError(null)
    let value: bigint
    try {
      value = monToWei(fundInput)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'invalid amount')
      return
    }
    if (value <= 0n) return setFormError('Enter an amount greater than zero.')
    if (value > remaining)
      return setFormError(`Maximum remaining contribution is ${weiToMon(remaining)} MON.`)
    await send({
      label: `Deposit ${fundInput} MON`,
      functionName: 'deposit',
      ...contract,
      args: [agreementId],
      value,
      afterReceipt: refetchAll,
    })
    setFundInput('')
  }

  async function withdrawBeforeActivation() {
    setFormError(null)
    let value: bigint
    try {
      value = monToWei(withdrawInput)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'invalid amount')
      return
    }
    const funded = myTenant?.record?.fundedAmount ?? 0n
    if (value <= 0n || value > funded)
      return setFormError(`You can withdraw up to ${weiToMon(funded)} MON.`)
    await send({
      label: `Withdraw ${withdrawInput} MON (pre-activation)`,
      functionName: 'withdrawFundingBeforeActivation',
      ...contract,
      args: [agreementId, value],
      afterReceipt: refetchAll,
    })
    setWithdrawInput('')
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
            <dt>Recipient accepted</dt>
            <dd>{agreement.recipientAccepted ? 'Yes' : 'Not yet'}</dd>
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
              {agreement.recipientAccepted ? 'accepted ✓' : 'not accepted yet'}
            </p>
          </div>

          {statusName === 'FUNDING' && authStatus === 'authenticated' && (
            <div className="card">
              <h2>Your actions</h2>
              {!myTenant && !isRecipient && (
                <p className="muted">The connected wallet is not a participant in this agreement.</p>
              )}
              {myTenant && !myTenant.record?.accepted && (
                <p>
                  <button className="primary" onClick={() => void acceptAsTenant()}>
                    Accept agreement (records your acceptance onchain)
                  </button>
                </p>
              )}
              {isRecipient && !agreement.recipientAccepted && (
                <p>
                  <button className="primary" onClick={() => void acceptAsRecipient()}>
                    Accept as deposit recipient
                  </button>
                </p>
              )}
              {myTenant?.record?.accepted && remaining > 0n && (
                <>
                  <h3>Fund your contribution</h3>
                  <p className="muted small amount">Remaining: {weiToMon(remaining)} MON (partial deposits allowed)</p>
                  <label className="field">
                    <span className="name">Amount (MON)</span>
                    <input inputMode="decimal" value={fundInput} onChange={(e) => setFundInput(e.target.value)} placeholder="0.0" />
                  </label>
                  <button className="primary" onClick={() => void deposit()}>
                    Deposit
                  </button>
                </>
              )}
              {myTenant?.record?.accepted && remaining === 0n && (
                <div className="notice success">Your contribution is fully funded.</div>
              )}
              {myTenant?.record && myTenant.record.fundedAmount > 0n && (
                <>
                  <h3>Withdraw before activation</h3>
                  <p className="muted small">
                    Withdrawing keeps the agreement from activating until the amount is
                    deposited again.
                  </p>
                  <label className="field">
                    <span className="name">Amount (MON)</span>
                    <input inputMode="decimal" value={withdrawInput} onChange={(e) => setWithdrawInput(e.target.value)} placeholder="0.0" />
                  </label>
                  <button className="secondary" onClick={() => void withdrawBeforeActivation()}>
                    Withdraw
                  </button>
                </>
              )}
              {formError && <div className="notice error">{formError}</div>}
            </div>
          )}
          {statusName === 'ACTIVE' && (
            <div className="notice success">
              All acceptances and contributions are complete — the deposit is locked and the
              agreement is ACTIVE.
            </div>
          )}
          {authStatus !== 'authenticated' && (
            <div className="notice">
              <Link to="/login">Sign in</Link> with a participant wallet to act on this agreement.
            </div>
          )}
        </>
      )}

      {tab === 'Activity' && (
        <div className="card">
          <h2>Activity</h2>
          <p className="muted small">
            Shown here: the verified creation transaction and transactions from your current
            session (in the drawer). This is not the complete blockchain history — the full
            event timeline arrives with the chain indexer in a later phase.
          </p>
          {metadata.data?.creation_tx_hash ? (
            <p>
              Agreement created ·{' '}
              <a href={`${EXPLORER_TX}${metadata.data.creation_tx_hash}`} className="mono" target="_blank" rel="noreferrer">
                {shortAddress(metadata.data.creation_tx_hash)} ↗
              </a>{' '}
              <span className="badge">verified onchain</span>
            </p>
          ) : (
            <p className="muted">Sign in as a participant to see registration details.</p>
          )}
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
