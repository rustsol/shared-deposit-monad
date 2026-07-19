// Five-step agreement-creation wizard (docs/05 §5.4). Produces a backend
// draft; the onchain creation itself happens on the draft page after the
// frontend independently reproduces the canonical terms hash.

import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { isAddress } from 'viem'
import { useAuth } from '../app/AuthContext'
import { api, ApiError } from '../lib/api'
import { fundingDeadlineWarning, monToWei } from '../lib/format'
import {
  AmountDisplay,
  ConfirmationPanel,
  DateField,
  FormField,
  PageHeader,
  Stepper,
  WalletAddress,
} from '../components/ui'

const STEPS = ['Basics', 'Participants', 'Contributions', 'Rules & dates', 'Review'] as const

interface TenantRow {
  wallet: string
  displayLabel: string
  amountMon: string
}

function toUnix(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000)
}

export default function NewAgreement() {
  const { status, wallet } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [alias, setAlias] = useState('')
  const [privateAddress, setPrivateAddress] = useState('')
  const [leaseStart, setLeaseStart] = useState('')
  const [leaseEnd, setLeaseEnd] = useState('')
  const [fundingDeadline, setFundingDeadline] = useState('')
  const [claimDeadline, setClaimDeadline] = useState('')
  const [settlementDeadline, setSettlementDeadline] = useState('')
  const [recipient, setRecipient] = useState('')
  const [tenants, setTenants] = useState<TenantRow[]>([{ wallet: '', displayLabel: '', amountMon: '' }])
  const [acknowledged, setAcknowledged] = useState(false)

  const creatorWallet = wallet ?? ''

  const allTenantWallets = useMemo(
    () => [creatorWallet, ...tenants.map((t) => t.wallet.trim().toLowerCase()).filter(Boolean)],
    [creatorWallet, tenants],
  )

  function validateStep(current: number): string | null {
    if (current === 0) {
      if (!alias.trim()) return 'Enter a private rental alias.'
      for (const [label, value] of [
        ['lease start', leaseStart],
        ['lease end', leaseEnd],
        ['funding deadline', fundingDeadline],
        ['claim deadline', claimDeadline],
        ['settlement deadline', settlementDeadline],
      ] as const) {
        if (!value) return `Choose the ${label}.`
      }
      if (toUnix(fundingDeadline) <= Date.now() / 1000) return 'The funding deadline must be in the future.'
      if (toUnix(leaseStart) > toUnix(leaseEnd)) return 'Lease start must not be after lease end.'
      if (toUnix(fundingDeadline) > toUnix(leaseEnd)) return 'Funding deadline must be on or before lease end.'
      if (toUnix(claimDeadline) <= toUnix(leaseEnd)) return 'Claim deadline must be after lease end.'
      if (toUnix(settlementDeadline) <= toUnix(claimDeadline))
        return 'Settlement deadline must be after the claim deadline.'
    }
    if (current === 1) {
      if (!isAddress(recipient.trim())) return 'Enter a valid deposit-recipient wallet address.'
      const others = tenants.map((t) => t.wallet.trim()).filter(Boolean)
      if (others.length < 1) return 'Add at least one other tenant wallet (2-8 tenants total).'
      if (others.length > 7) return 'At most 8 tenants in total.'
      for (const address of others) {
        if (!isAddress(address)) return `Invalid tenant address: ${address}`
      }
      const lower = allTenantWallets
      if (new Set(lower).size !== lower.length) return 'Tenant wallets must be unique.'
      if (lower.includes(recipient.trim().toLowerCase()))
        return 'The deposit recipient cannot also be a tenant.'
    }
    if (current === 2) {
      for (const [index, tenant] of [{ wallet: creatorWallet, displayLabel: 'You', amountMon: creatorAmount }, ...tenants].entries()) {
        try {
          const wei = monToWei(tenant.amountMon)
          if (wei <= 0n) return `Contribution ${index + 1} must be greater than zero.`
        } catch (caught) {
          return `Contribution ${index + 1}: ${caught instanceof Error ? caught.message : 'invalid amount'}`
        }
      }
    }
    return null
  }

  const [creatorAmount, setCreatorAmount] = useState('')

  const totalWei = useMemo(() => {
    try {
      let total = monToWei(creatorAmount || '0')
      for (const tenant of tenants) total += monToWei(tenant.amountMon || '0')
      return total
    } catch {
      return null
    }
  }, [creatorAmount, tenants])

  function next() {
    const problem = validateStep(step)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const body = {
        property_alias: alias.trim(),
        private_address: privateAddress.trim() || null,
        recipient: recipient.trim(),
        lease_start: toUnix(leaseStart),
        lease_end: toUnix(leaseEnd),
        funding_deadline: toUnix(fundingDeadline),
        claim_deadline: toUnix(claimDeadline),
        settlement_deadline: toUnix(settlementDeadline),
        tenants: [
          {
            wallet: creatorWallet,
            required_amount_wei: monToWei(creatorAmount).toString(),
            display_label: null,
          },
          ...tenants.map((tenant) => ({
            wallet: tenant.wallet.trim(),
            required_amount_wei: monToWei(tenant.amountMon).toString(),
            display_label: tenant.displayLabel.trim() || null,
          })),
        ],
      }
      const draft = await api<{ id: string }>('/agreement-drafts', { method: 'POST', body })
      navigate(`/drafts/${draft.id}`)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'draft creation failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (status !== 'authenticated') {
    return (
      <main className="page">
        <h1>New agreement</h1>
        <div className="notice">
          <Link to="/login">Sign in with your wallet</Link> to create an agreement.
        </div>
      </main>
    )
  }

  return (
    <main className="page narrow">
      <PageHeader
        title="Create a shared deposit"
        lead="Set the property, people, contributions, and dates. Nothing goes onchain until you approve the creation transaction on the next screen."
      />
      <Stepper steps={STEPS} current={step} />

      {step === 0 && (
        <div className="card">
          <FormField
            label="Private rental alias"
            hint="Only participants ever see this. It is never written onchain."
          >
            <input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              maxLength={160}
              placeholder="e.g. Indiranagar apartment"
            />
          </FormField>
          <FormField
            label="Property address (optional)"
            hint="The street address of the rental. Stays private, never onchain."
          >
            <input
              value={privateAddress}
              onChange={(e) => setPrivateAddress(e.target.value)}
              placeholder="e.g. 12 Rose Street, 2nd floor"
            />
          </FormField>
          <div className="grid-two">
            <DateField label="Lease start" value={leaseStart} onChange={setLeaseStart} />
            <DateField label="Lease end" value={leaseEnd} onChange={setLeaseEnd} />
            <DateField
              label="Funding deadline"
              hint="Everyone must accept and pay by this time."
              value={fundingDeadline}
              onChange={setFundingDeadline}
            />
            <DateField
              label="Claim deadline"
              hint="Deduction claims close at this time."
              value={claimDeadline}
              onChange={setClaimDeadline}
            />
            <DateField
              label="Settlement deadline"
              value={settlementDeadline}
              onChange={setSettlementDeadline}
            />
          </div>
          <p className="muted small">
            Required order: funding deadline ≤ lease end &lt; claim deadline &lt; settlement
            deadline.
          </p>
          {fundingDeadline &&
            fundingDeadlineWarning(toUnix(fundingDeadline), Math.floor(Date.now() / 1000)) && (
              <div className="notice warn">
                {fundingDeadlineWarning(toUnix(fundingDeadline), Math.floor(Date.now() / 1000))}
              </div>
            )}
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <h2>Tenants</h2>
          <p className="muted small">
            You are tenant 1 (<WalletAddress address={creatorWallet} copyable={false} />) and
            cannot be removed - the creator has no special authority and pays a share like
            everyone else.
          </p>
          {tenants.map((tenant, index) => (
            <div key={index} className="grid-two">
              <label className="field">
                <span className="name">Tenant {index + 2} wallet</span>
                <input
                  className="mono"
                  value={tenant.wallet}
                  onChange={(e) =>
                    setTenants(tenants.map((t, i) => (i === index ? { ...t, wallet: e.target.value } : t)))
                  }
                  placeholder="0x…"
                />
              </label>
              <label className="field">
                <span className="name">Private label (optional)</span>
                <input
                  value={tenant.displayLabel}
                  onChange={(e) =>
                    setTenants(tenants.map((t, i) => (i === index ? { ...t, displayLabel: e.target.value } : t)))
                  }
                />
              </label>
            </div>
          ))}
          <div className="button-row">
            <button
              className="secondary"
              disabled={tenants.length >= 7}
              onClick={() => setTenants([...tenants, { wallet: '', displayLabel: '', amountMon: '' }])}
            >
              Add tenant
            </button>
            <button
              className="secondary"
              disabled={tenants.length <= 1}
              onClick={() => setTenants(tenants.slice(0, -1))}
            >
              Remove last
            </button>
          </div>
          <h2>Deposit recipient</h2>
          <FormField
            label="Recipient wallet"
            hint="The landlord or property manager who receives approved deductions. The recipient never deposits and cannot be one of the tenants."
          >
            <input
              className="mono"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x…"
            />
          </FormField>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h2>Contributions (Monad Testnet MON)</h2>
          <FormField label="Your contribution (tenant 1)">
            <input
              inputMode="decimal"
              value={creatorAmount}
              onChange={(e) => setCreatorAmount(e.target.value)}
              placeholder="e.g. 0.5"
            />
          </FormField>
          {tenants.map((tenant, index) => (
            <label className="field" key={index}>
              <span className="name">
                Tenant {index + 2} ({tenant.wallet ? tenant.wallet.slice(0, 10) + '…' : 'wallet pending'})
              </span>
              <input
                inputMode="decimal"
                value={tenant.amountMon}
                onChange={(e) =>
                  setTenants(tenants.map((t, i) => (i === index ? { ...t, amountMon: e.target.value } : t)))
                }
                placeholder="e.g. 0.5"
              />
            </label>
          ))}
          <p>
            Total deposit:{' '}
            {totalWei !== null ? (
              <AmountDisplay wei={totalWei} />
            ) : (
              <span className="muted">enter valid amounts</span>
            )}
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h2>The rules you are agreeing to</h2>
          <ul>
            <li><strong>Strict-majority voting</strong> - deduction claims need more than half of the tenants to vote YES.</li>
            <li><strong>Claim window</strong> - the recipient can submit claims only between lease end and the claim deadline.</li>
            <li><strong>Contract custody</strong> - funds stay locked in the contract; no platform administrator can move them.</li>
            <li><strong>Funding cancellation</strong> - if funding is incomplete at the deadline, anyone involved can cancel and every tenant reclaims their own money.</li>
            <li><strong>Immutable terms</strong> - participants, amounts, and deadlines cannot be changed after creation. A mistake requires a new agreement.</li>
            <li><strong>Public onchain data</strong> - wallet addresses, amounts, dates, votes, and hashes are permanently public.</li>
          </ul>
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <h2>Review</h2>
          <ConfirmationPanel
            rows={[
              { label: 'Rental alias', value: alias },
              { label: 'Deposit recipient', value: <WalletAddress address={recipient} copyable={false} /> },
              {
                label: 'Tenants',
                value: (
                  <>
                    <div>
                      <WalletAddress address={creatorWallet} copyable={false} /> - {creatorAmount}{' '}
                      MON (you)
                    </div>
                    {tenants.map((tenant, index) => (
                      <div key={index}>
                        <WalletAddress address={tenant.wallet} copyable={false} /> -{' '}
                        {tenant.amountMon} MON
                      </div>
                    ))}
                  </>
                ),
              },
              {
                label: 'Total deposit',
                value: totalWei !== null ? <AmountDisplay wei={totalWei} /> : '-',
              },
            ]}
          />
          <div className="notice warn">
            Saving stores this draft privately. The onchain creation transaction (with an
            independent hash check in your browser) happens on the next screen.
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>I understand the agreement cannot be edited after onchain creation.</span>
          </label>
        </div>
      )}

      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}

      <div className="button-row">
        {step > 0 && (
          <button className="secondary" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {step < STEPS.length - 1 && (
          <button className="primary" onClick={next}>
            Continue
          </button>
        )}
        {step === STEPS.length - 1 && (
          <button
            className="primary"
            disabled={!acknowledged || submitting}
            onClick={() => void submit()}
          >
            {submitting ? 'Saving draft…' : 'Save draft & continue'}
          </button>
        )}
      </div>
    </main>
  )
}
