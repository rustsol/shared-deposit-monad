// Explicit, role-specific action components. Each renders only for its role,
// with permissions taken from the shared role resolver — no generic card that
// morphs labels between tenant and recipient. Every write uses useContractTx
// and only reports VERIFIED after a direct contract-state re-read confirms the
// change.

import { useState } from 'react'
import { useDisconnect } from 'wagmi'
import { monToWei, weiToMon, shortAddress } from '../lib/format'
import { monadTestnet } from '../lib/chain'
import type { AgreementRole } from '../hooks/useAgreementRole'
import { useContractTx } from '../hooks/useContractTx'
import { useAuth } from '../app/AuthContext'
import { makeActionKey, useTx } from '../app/TxContext'
import { sharedDepositEscrowAbi } from '../generated/sharedDepositEscrow'

interface Common {
  role: AgreementRole
  recipientAccepted: boolean
  contractAddress: `0x${string}`
  agreementId: bigint
  termsHash: `0x${string}`
  refetch: () => Promise<void>
  /** Reads acceptance back from the contract for the VERIFIED check. */
  readAccepted: (kind: 'tenant' | 'recipient') => Promise<boolean>
  /** Reads the connected tenant's exact funded amount from the contract. */
  readFunded: () => Promise<bigint>
  /** Dual-provider network health gate: no write is allowed unless healthy. */
  networkHealthy: boolean
}

const contractOf = (address: `0x${string}`) =>
  ({ address, abi: sharedDepositEscrowAbi }) as const

/** Builds the single-flight action key for a role action on this agreement. */
function actionKeyFor(props: Common, functionName: string): string {
  return makeActionKey({
    chainId: monadTestnet.id,
    contractAddress: props.contractAddress,
    agreementId: props.agreementId.toString(),
    functionName,
    wallet: props.role.connectedWallet ?? '',
  })
}

/**
 * Shown when a session exists but a DIFFERENT wallet is connected. This is an
 * account change, not a network fault — so it replaces every participant action
 * card until the connected wallet re-authenticates and the role is recomputed.
 */
export function AccountMismatchCard({
  sessionWallet,
  connectedWallet,
}: {
  sessionWallet: string
  connectedWallet: string
}) {
  const { signInAsConnected, status, error } = useAuth()
  const { disconnect } = useDisconnect()
  const [busy, setBusy] = useState(false)
  const signing = busy || status === 'signing' || status === 'verifying'

  async function signIn() {
    setBusy(true)
    try {
      await signInAsConnected()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h2>Connected wallet changed</h2>
      <p>
        You are signed in as <span className="mono">{shortAddress(sessionWallet)}</span>, but your
        wallet is connected as <span className="mono">{shortAddress(connectedWallet)}</span>.
      </p>
      <p className="muted small">
        Sign in with the connected wallet to continue. Your previous session will be revoked and a
        new signature will be requested for the connected wallet — no need to clear cookies or
        storage.
      </p>
      <button className="primary" disabled={signing} onClick={() => void signIn()}>
        {signing ? 'Signing in…' : 'Sign in as connected wallet'}
      </button>{' '}
      <button className="secondary" disabled={signing} onClick={() => disconnect()}>
        Reconnect previous wallet
      </button>
      {error && <div className="notice error">{error}</div>}
    </div>
  )
}

export function WalletMismatchNotice({ role }: { role: AgreementRole }) {
  if (role.walletMatchesSession) return null
  return (
    <div className="notice warn">
      Your connected wallet does not match your signed-in session. Reconnect the
      wallet you signed in with, or sign in again with the connected wallet, before
      taking any action. Actions are disabled until they match.
    </div>
  )
}

export function RecipientAcceptanceCard(props: Common) {
  const { role, recipientAccepted, contractAddress, agreementId, termsHash, refetch, readAccepted } =
    props
  const { send } = useContractTx()
  const { isActionLocked } = useTx()
  const key = actionKeyFor(props, 'acceptAsRecipient')
  const locked = isActionLocked(key)

  return (
    <div className="card">
      <h2>Your role: deposit recipient</h2>
      <p className="muted">
        Tenants fund the escrow. <strong>The deposit recipient does not deposit funds</strong> —
        there is no contribution required from you.
      </p>
      <dl className="kv">
        <dt>Acceptance</dt>
        <dd>{recipientAccepted ? 'Accepted' : 'Not accepted'}</dd>
        <dt>Contribution</dt>
        <dd className="muted">No contribution required</dd>
      </dl>
      {recipientAccepted ? (
        <div className="notice success">Recipient accepted.</div>
      ) : role.fundingDeadlinePassed ? (
        <div className="notice warn">
          Funding deadline passed. This agreement cannot receive additional acceptance or
          deposits. Create a new agreement with a future funding deadline.
        </div>
      ) : (
        <>
          <button
            className="primary"
            disabled={!role.canAcceptAsRecipient || locked || !props.networkHealthy}
            onClick={() =>
              void send({
                label: 'Accept as deposit recipient',
                functionName: 'acceptAsRecipient',
                actionKey: key,
                agreementId: agreementId.toString(),
                ...contractOf(contractAddress),
                args: [agreementId, termsHash],
                verify: async () => {
                  const accepted = await readAccepted('recipient')
                  await refetch()
                  return accepted
                },
              })
            }
          >
            Accept as deposit recipient
          </button>
          {locked && (
            <p className="muted small">
              An acceptance attempt is already in progress — see the transaction drawer. This
              button stays disabled until it resolves.
            </p>
          )}
        </>
      )}
    </div>
  )
}

export function TenantAcceptanceCard(props: Common) {
  const { role, contractAddress, agreementId, termsHash, refetch, readAccepted } = props
  const { send } = useContractTx()
  const { isActionLocked } = useTx()
  const key = actionKeyFor(props, 'acceptAsTenant')
  const locked = isActionLocked(key)
  if (!role.tenantRecord) return null

  if (role.tenantRecord.accepted) {
    return <div className="notice success">You have accepted this agreement as a tenant.</div>
  }
  return (
    <div className="card">
      <h2>Accept as tenant</h2>
      <p className="muted small">
        Accepting records your acceptance onchain. You must accept before you can fund
        your contribution.
      </p>
      {role.fundingDeadlinePassed ? (
        <div className="notice warn">
          Funding deadline passed. This agreement cannot receive additional acceptance or
          deposits. Create a new agreement with a future funding deadline.
        </div>
      ) : (
        <button
          className="primary"
          disabled={!role.canAcceptAsTenant || locked || !props.networkHealthy}
          onClick={() =>
            void send({
              label: 'Accept agreement (tenant)',
              functionName: 'acceptAsTenant',
              actionKey: key,
              agreementId: agreementId.toString(),
              ...contractOf(contractAddress),
              args: [agreementId, termsHash],
              verify: async () => {
                const accepted = await readAccepted('tenant')
                await refetch()
                return accepted
              },
            })
          }
        >
          Accept agreement
        </button>
      )}
    </div>
  )
}

export function TenantFundingCard(props: Common) {
  const { role, contractAddress, agreementId, refetch, readFunded } = props
  const { send } = useContractTx()
  const { isActionLocked } = useTx()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const key = actionKeyFor(props, 'deposit')
  const locked = isActionLocked(key)

  const tenant = role.tenantRecord
  if (!tenant || !tenant.accepted) return null

  async function deposit() {
    setError(null)
    let value: bigint
    try {
      value = monToWei(amount)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'invalid amount')
      return
    }
    if (value <= 0n) return setError('Enter an amount greater than zero.')
    if (value > role.remaining)
      return setError(`Maximum remaining contribution is ${weiToMon(role.remaining)} MON.`)
    const before = tenant!.fundedAmount
    await send({
      label: `Deposit ${amount} MON`,
      functionName: 'deposit',
      actionKey: key,
      agreementId: agreementId.toString(),
      ...contractOf(contractAddress),
      args: [agreementId],
      value,
      verify: async () => {
        const funded = await readFunded()
        await refetch()
        return funded > before // exact on-chain funded amount increased
      },
    })
    setAmount('')
  }

  return (
    <div className="card">
      <h2>Fund your contribution</h2>
      <dl className="kv small">
        <dt>Required</dt><dd className="amount">{weiToMon(tenant.requiredAmount)} MON</dd>
        <dt>Funded</dt><dd className="amount">{weiToMon(tenant.fundedAmount)} MON</dd>
        <dt>Remaining</dt><dd className="amount">{weiToMon(role.remaining)} MON</dd>
      </dl>
      {role.remaining === 0n ? (
        <div className="notice success">Your contribution is fully funded.</div>
      ) : role.fundingDeadlinePassed ? (
        <div className="notice warn">
          The funding deadline has passed — no further deposits are accepted.
        </div>
      ) : (
        <>
          <p className="muted small">Partial deposits are allowed, up to your remaining amount.</p>
          <label className="field">
            <span className="name">Amount (MON)</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" />
          </label>
          <button
            className="primary"
            disabled={!role.canDeposit || locked || !props.networkHealthy}
            onClick={() => void deposit()}
          >
            Deposit
          </button>{' '}
          <button
            className="secondary"
            disabled={!role.canDeposit || locked || !props.networkHealthy}
            onClick={() => setAmount(weiToMon(role.remaining))}
          >
            Fill remaining
          </button>
        </>
      )}
      {error && <div className="notice error">{error}</div>}
    </div>
  )
}

export function TenantWithdrawCard(props: Common) {
  const { role, contractAddress, agreementId, refetch, readFunded } = props
  const { send } = useContractTx()
  const { isActionLocked } = useTx()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const key = actionKeyFor(props, 'withdrawFundingBeforeActivation')
  const locked = isActionLocked(key)

  const tenant = role.tenantRecord
  if (!tenant || tenant.fundedAmount === 0n) return null

  async function withdraw() {
    setError(null)
    let value: bigint
    try {
      value = monToWei(amount)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'invalid amount')
      return
    }
    if (value <= 0n || value > tenant!.fundedAmount)
      return setError(`You can withdraw up to ${weiToMon(tenant!.fundedAmount)} MON.`)
    const before = tenant!.fundedAmount
    await send({
      label: `Withdraw ${amount} MON (pre-activation)`,
      functionName: 'withdrawFundingBeforeActivation',
      actionKey: key,
      agreementId: agreementId.toString(),
      ...contractOf(contractAddress),
      args: [agreementId, value],
      verify: async () => {
        const funded = await readFunded()
        await refetch()
        return funded < before
      },
    })
    setAmount('')
  }

  return (
    <div className="card">
      <h2>Withdraw before activation</h2>
      <p className="muted small">
        Withdrawing your own funding keeps the agreement from activating until you
        deposit it again. You can only ever withdraw your own contribution.
      </p>
      <label className="field">
        <span className="name">Amount (MON)</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" />
      </label>
      <button
        className="secondary"
        disabled={!role.canWithdrawFunding || locked || !props.networkHealthy}
        onClick={() => void withdraw()}
      >
        Withdraw
      </button>
      {error && <div className="notice error">{error}</div>}
    </div>
  )
}

export function ReadOnlyParticipantCard({ role }: { role: AgreementRole }) {
  if (role.isParticipant) return null
  return (
    <div className="card">
      <h2>Read-only</h2>
      <p className="muted">
        The connected wallet is not a participant in this agreement. You can view the
        public onchain state, but no actions are available.
      </p>
    </div>
  )
}
