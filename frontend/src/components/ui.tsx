// Shared presentational components. Every page composes these instead of
// re-implementing badges, addresses, amounts, deadlines, and states - so
// role, status, amount, and address presentation stays consistent app-wide.
// No component here holds financial logic; values arrive already exact.

import { useState, type ReactNode } from 'react'
import { formatTimestamp, shortAddress, weiToMon } from '../lib/format'

/* ------------------------------------------------------------ PageHeader */

export function PageHeader(props: {
  title: string
  eyebrow?: string
  lead?: string
  meta?: ReactNode
}) {
  return (
    <header className="page-header">
      {props.eyebrow && <p className="eyebrow">{props.eyebrow}</p>}
      <h1>{props.title}</h1>
      {props.lead && <p className="lead">{props.lead}</p>}
      {props.meta && <div className="header-meta">{props.meta}</div>}
    </header>
  )
}

/* ----------------------------------------------------------- StatusBadge */

// Contract status enum -> plain-English label. The technical name stays
// available on proof surfaces; here users read what the state MEANS.
const AGREEMENT_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  NONE: { label: 'Not created', tone: '' },
  FUNDING: { label: 'Collecting deposits', tone: 'funding' },
  ACTIVE: { label: 'Deposit locked', tone: 'active' },
  FINALIZED: { label: 'Settled', tone: 'finalized' },
  CANCELLED: { label: 'Cancelled', tone: 'cancelled' },
}

export function StatusBadge({ status }: { status: string }) {
  const entry = AGREEMENT_STATUS_LABELS[status]
  if (!entry) return <span className="badge">{status}</span>
  return (
    <span className={`badge ${entry.tone}`} title={`Contract status: ${status}`}>
      {entry.label}
    </span>
  )
}

export function describeAgreementStatus(status: string): string {
  return AGREEMENT_STATUS_LABELS[status]?.label ?? status
}

/* ------------------------------------------------------------- RoleBadge */

const ROLE_LABELS: Record<string, string> = {
  CREATOR_TENANT: 'Creator · tenant',
  CREATOR: 'Creator',
  TENANT: 'Tenant',
  RECIPIENT: 'Deposit recipient',
  READ_ONLY: 'Read-only',
}

export function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABELS[role] ?? role
  const tone = role === 'RECIPIENT' ? 'tone-accent' : ''
  return <span className={`badge ${tone}`}>{label}</span>
}

export function describeRole(role: string): string {
  return ROLE_LABELS[role] ?? role
}

/* --------------------------------------------------------- WalletAddress */

export function WalletAddress({
  address,
  copyable = true,
  full = false,
}: {
  address: string
  copyable?: boolean
  full?: boolean
}) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="mono" title={address}>
      {full ? address : shortAddress(address)}
      {copyable && (
        <>
          {' '}
          <button
            type="button"
            className="copy-inline"
            aria-label={`Copy address ${address}`}
            onClick={() => {
              void navigator.clipboard.writeText(address)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </>
      )}
    </span>
  )
}

/* --------------------------------------------------------- AmountDisplay */

export function AmountDisplay({ wei }: { wei: bigint | string }) {
  return (
    <span className="amount">
      {weiToMon(wei)} <span className="unit">MON</span>
    </span>
  )
}

/* ------------------------------------------------------- DeadlineDisplay */

export function DeadlineDisplay({
  seconds,
  passedText = 'passed',
}: {
  seconds: number | string | bigint
  passedText?: string
}) {
  const value = Number(seconds)
  const passed = value * 1000 < Date.now()
  return (
    <span>
      {formatTimestamp(value)}
      {passed && passedText && <> <span className="badge tone-warning">{passedText}</span></>}
    </span>
  )
}

/* ------------------------------------------------------------ EmptyState */

export function EmptyState(props: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state-block" role="status">
      <div className="state-icon" aria-hidden="true">
        ◦
      </div>
      <h3>{props.title}</h3>
      {props.children && <p>{props.children}</p>}
      {props.action}
    </div>
  )
}

/* ------------------------------------------------------------ ErrorState */

export function ErrorState(props: { title?: string; children?: ReactNode; retry?: () => void }) {
  return (
    <div className="state-block error" role="alert">
      <div className="state-icon" aria-hidden="true">
        !
      </div>
      <h3>{props.title ?? 'Something went wrong'}</h3>
      {props.children && <p>{props.children}</p>}
      {props.retry && (
        <button type="button" className="secondary" onClick={props.retry}>
          Try again
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------- LoadingSkeleton */

export function LoadingSkeleton({
  lines = 3,
  label = 'Loading',
}: {
  lines?: number
  label?: string
}) {
  return (
    <div role="status" aria-label={label}>
      <span className="visually-hidden">{label}…</span>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className="skeleton"
          style={{ height: '1.1rem', marginBottom: '0.6rem', width: `${100 - index * 12}%` }}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------ AgreementProgress */

export function AgreementProgress(props: {
  fundedWei: bigint
  requiredWei: bigint
  acceptedCount?: number
  tenantCount?: number
}) {
  const percent =
    props.requiredWei > 0n ? Number((props.fundedWei * 100n) / props.requiredWei) : 0
  return (
    <div>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Deposit funding progress"
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="progress-legend">
        <span>
          <AmountDisplay wei={props.fundedWei} /> of <AmountDisplay wei={props.requiredWei} />{' '}
          funded ({percent}%)
        </span>
        {props.tenantCount !== undefined && props.acceptedCount !== undefined && (
          <span>
            {props.acceptedCount} of {props.tenantCount} tenants accepted
          </span>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------- ParticipantCard */

export function ParticipantCard(props: {
  address: string
  roleLabel: string
  isYou?: boolean
  accepted?: boolean
  facts?: { label: string; value: ReactNode }[]
}) {
  return (
    <div className="participant-card">
      <div className="who">
        <span className="badge">{props.roleLabel}</span>
        <WalletAddress address={props.address} />
        {props.isYou && <span className="badge tone-accent">You</span>}
        {props.accepted !== undefined &&
          (props.accepted ? (
            <span className="badge tone-success">Accepted ✓</span>
          ) : (
            <span className="badge">Not accepted yet</span>
          ))}
      </div>
      {props.facts && props.facts.length > 0 && (
        <div className="facts">
          {props.facts.map((fact) => (
            <div className="fact" key={fact.label}>
              <span className="label">{fact.label}</span>
              <span>{fact.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- ActionCard */

export function ActionCard(props: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <h2>{props.title}</h2>
      {props.description && <p className="muted small">{props.description}</p>}
      {props.children}
    </section>
  )
}

/* --------------------------------------------------------------- ProofRow */

export function ProofRow(props: { label: string; value: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="proof-row">
      <span className="proof-label">{props.label}</span>
      <span className="proof-value mono">{props.value}</span>
      {props.copyable !== false && (
        <button
          type="button"
          className="copy-inline"
          aria-label={`Copy ${props.label}`}
          onClick={() => {
            void navigator.clipboard.writeText(props.value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      )}
    </div>
  )
}

/* ----------------------------------------------------------- NetworkStatus */

export function NetworkStatus({ ready }: { ready: boolean | null }) {
  if (ready === null) return <span className="badge">Checking network…</span>
  return ready ? (
    <span className="badge tone-success">Network ready ✓</span>
  ) : (
    <span className="badge tone-warning">Network not ready</span>
  )
}

/* -------------------------------------------------------------- FormField */

export function FormField(props: {
  label: string
  hint?: string
  error?: string | null
  children: ReactNode
}) {
  return (
    <label className="field">
      <span className="name">{props.label}</span>
      {props.hint && <span className="hint">{props.hint}</span>}
      {props.children}
      {props.error && <span className="field-error">{props.error}</span>}
    </label>
  )
}

/* -------------------------------------------------------------- DateField */

export function DateField(props: {
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  error?: string | null
}) {
  return (
    <FormField label={props.label} hint={props.hint} error={props.error}>
      <input
        type="datetime-local"
        value={props.value}
        aria-invalid={props.error ? true : undefined}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </FormField>
  )
}

/* ------------------------------------------------------ ConfirmationPanel */

export function ConfirmationPanel(props: {
  title?: string
  rows: { label: string; value: ReactNode }[]
  children?: ReactNode
}) {
  return (
    <div className="card tinted">
      {props.title && <h3>{props.title}</h3>}
      <dl className="kv">
        {props.rows.map((row) => (
          <div key={row.label} style={{ display: 'contents' }}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {props.children}
    </div>
  )
}

/* ---------------------------------------------------------------- Stepper */

export function Stepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="steps" aria-label="Steps">
      {steps.map((name, index) => (
        <li
          key={name}
          className={`step ${index === current ? 'current' : index < current ? 'done' : ''}`}
          aria-current={index === current ? 'step' : undefined}
        >
          {index < current ? '✓' : index + 1}. {name}
        </li>
      ))}
    </ol>
  )
}
