// Five-step agreement-creation wizard (docs/05 §5.4). Produces a backend
// draft; the onchain creation itself happens on the draft page after the
// frontend independently reproduces the canonical terms hash.

import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { isAddress } from 'viem'
import { useAuth } from '../app/AuthContext'
import { api, ApiError } from '../lib/api'
import { fundingDeadlineWarning, monToWei } from '../lib/format'

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
      if (others.length < 1) return 'Add at least one other tenant wallet (2–8 tenants total).'
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
    <main className="page">
      <h1>Create a shared deposit</h1>
      <div className="steps" role="list">
        {STEPS.map((name, index) => (
          <span
            key={name}
            role="listitem"
            className={`step ${index === step ? 'current' : index < step ? 'done' : ''}`}
          >
            {index + 1}. {name}
          </span>
        ))}
      </div>

      {step === 0 && (
        <div className="card">
          <label className="field">
            <span className="name">Private rental alias</span>
            <input value={alias} onChange={(e) => setAlias(e.target.value)} maxLength={160} placeholder="e.g. Indiranagar apartment" />
          </label>
          <label className="field">
            <span className="name">Private address (optional, stays offchain)</span>
            <input value={privateAddress} onChange={(e) => setPrivateAddress(e.target.value)} />
          </label>
          <div className="grid-two">
            <label className="field"><span className="name">Lease start</span>
              <input type="datetime-local" value={leaseStart} onChange={(e) => setLeaseStart(e.target.value)} /></label>
            <label className="field"><span className="name">Lease end</span>
              <input type="datetime-local" value={leaseEnd} onChange={(e) => setLeaseEnd(e.target.value)} /></label>
            <label className="field"><span className="name">Funding deadline</span>
              <input type="datetime-local" value={fundingDeadline} onChange={(e) => setFundingDeadline(e.target.value)} /></label>
            <label className="field"><span className="name">Claim deadline</span>
              <input type="datetime-local" value={claimDeadline} onChange={(e) => setClaimDeadline(e.target.value)} /></label>
            <label className="field"><span className="name">Settlement deadline</span>
              <input type="datetime-local" value={settlementDeadline} onChange={(e) => setSettlementDeadline(e.target.value)} /></label>
          </div>
          <p className="muted small">Required order: funding deadline ≤ lease end &lt; claim deadline &lt; settlement deadline.</p>
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
          <h3>Tenants</h3>
          <p className="muted small">
            Your connected wallet is tenant 1 and cannot be removed:{' '}
            <span className="mono">{creatorWallet}</span>
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
          <p>
            <button
              className="secondary"
              disabled={tenants.length >= 7}
              onClick={() => setTenants([...tenants, { wallet: '', displayLabel: '', amountMon: '' }])}
            >
              Add tenant
            </button>{' '}
            <button
              className="secondary"
              disabled={tenants.length <= 1}
              onClick={() => setTenants(tenants.slice(0, -1))}
            >
              Remove last
            </button>
          </p>
          <h3>Deposit recipient (landlord / property manager)</h3>
          <label className="field">
            <span className="name">Recipient wallet</span>
            <input className="mono" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x…" />
          </label>
          <p className="muted small">The recipient cannot be one of the tenants.</p>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h3>Exact contributions (Monad Testnet MON)</h3>
          <label className="field">
            <span className="name">Your contribution (tenant 1)</span>
            <input inputMode="decimal" value={creatorAmount} onChange={(e) => setCreatorAmount(e.target.value)} placeholder="e.g. 0.5" />
          </label>
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
          <p className="amount">
            Total required:{' '}
            <strong>{totalWei !== null ? `${totalWei} wei` : 'enter valid amounts'}</strong>
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h3>The rules you are agreeing to</h3>
          <ul>
            <li><strong>Strict-majority voting</strong> — deduction claims need more than half of the tenants to vote YES.</li>
            <li><strong>Claim window</strong> — the recipient can submit claims only between lease end and the claim deadline.</li>
            <li><strong>Contract custody</strong> — funds stay locked in the contract; no platform administrator can move them.</li>
            <li><strong>Funding cancellation</strong> — if funding is incomplete at the deadline, anyone involved can cancel and every tenant reclaims their own money.</li>
            <li><strong>Immutable terms</strong> — participants, amounts, and deadlines cannot be changed after creation. A mistake requires a new agreement.</li>
            <li><strong>Public onchain data</strong> — wallet addresses, amounts, dates, votes, and hashes are permanently public.</li>
          </ul>
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <h3>Review</h3>
          <dl className="kv">
            <dt>Alias</dt><dd>{alias}</dd>
            <dt>Recipient</dt><dd className="mono">{recipient}</dd>
            <dt>Tenants</dt>
            <dd>
              <span className="mono">{creatorWallet}</span> ({creatorAmount} MON)
              {tenants.map((tenant, index) => (
                <div key={index}>
                  <span className="mono">{tenant.wallet}</span> ({tenant.amountMon} MON)
                </div>
              ))}
            </dd>
            <dt>Total</dt><dd className="amount">{totalWei !== null ? `${totalWei} wei` : '—'}</dd>
          </dl>
          <div className="notice warn">
            Creating the draft stores it privately. The onchain transaction (with the
            frontend/backend hash comparison) happens on the next screen.
          </div>
          <label className="field">
            <input
              type="checkbox"
              style={{ width: 'auto', marginRight: '0.5rem' }}
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            I understand the agreement cannot be edited after onchain creation.
          </label>
        </div>
      )}

      {error && <div className="notice error">{error}</div>}

      <p>
        {step > 0 && (
          <button className="secondary" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}{' '}
        {step < STEPS.length - 1 && (
          <button className="primary" onClick={next}>
            Continue
          </button>
        )}
        {step === STEPS.length - 1 && (
          <button className="primary" disabled={!acknowledged || submitting} onClick={() => void submit()}>
            {submitting ? 'Saving draft…' : 'Save draft & continue'}
          </button>
        )}
      </p>
    </main>
  )
}
