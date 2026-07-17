// Shared UI components: plain-language status/role mapping, exact amount
// rendering, progress math, address truncation, and accessible states.

import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  AgreementProgress,
  AmountDisplay,
  EmptyState,
  ErrorState,
  RoleBadge,
  StatusBadge,
  WalletAddress,
  describeAgreementStatus,
  describeRole,
} from '../src/components/ui'

const WALLET = '0x7ab3adf1c8fc4746333e104b6a793f6782d7ba23'

describe('StatusBadge', () => {
  test('maps contract statuses to plain language, keeping the enum as title', () => {
    render(<StatusBadge status="FUNDING" />)
    const badge = screen.getByText('Collecting deposits')
    expect(badge.getAttribute('title')).toContain('FUNDING')
  })
  test('covers every lifecycle status without inventing labels', () => {
    expect(describeAgreementStatus('ACTIVE')).toBe('Deposit locked')
    expect(describeAgreementStatus('FINALIZED')).toBe('Settled')
    expect(describeAgreementStatus('CANCELLED')).toBe('Cancelled')
    // Unknown statuses fall back to the raw name — never hidden.
    expect(describeAgreementStatus('SOMETHING_NEW')).toBe('SOMETHING_NEW')
  })
})

describe('RoleBadge', () => {
  test('uses product language, not enum text', () => {
    render(<RoleBadge role="CREATOR_TENANT" />)
    expect(screen.getByText('Creator · tenant')).toBeDefined()
    expect(describeRole('RECIPIENT')).toBe('Deposit recipient')
  })
})

describe('AmountDisplay', () => {
  test('renders exact MON amounts with tabular numerals', () => {
    render(<AmountDisplay wei={500000000000000000n} />)
    expect(screen.getByText('0.5')).toBeDefined()
    expect(screen.getByText('MON')).toBeDefined()
  })
})

describe('WalletAddress', () => {
  test('truncates visually but exposes the full address', () => {
    render(<WalletAddress address={WALLET} copyable={false} />)
    const element = screen.getByTitle(WALLET)
    expect(element.textContent).toContain('0x7ab3')
    expect(element.textContent).not.toContain(WALLET)
  })
  test('copy control is labelled for screen readers', () => {
    render(<WalletAddress address={WALLET} />)
    expect(screen.getByRole('button', { name: `Copy address ${WALLET}` })).toBeDefined()
  })
})

describe('AgreementProgress', () => {
  test('reports exact funded percentage via progressbar semantics', () => {
    render(
      <AgreementProgress
        fundedWei={1500000000000000000n}
        requiredWei={1500000000000000000n}
        acceptedCount={3}
        tenantCount={3}
      />,
    )
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
    expect(screen.getByText(/3 of 3 tenants accepted/)).toBeDefined()
  })
  test('handles zero-required without dividing by zero', () => {
    const { container } = render(<AgreementProgress fundedWei={0n} requiredWei={0n} />)
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar?.getAttribute('aria-valuenow')).toBe('0')
  })
})

describe('states', () => {
  test('EmptyState is a status region, ErrorState is an alert', () => {
    render(<EmptyState title="Nothing here" />)
    expect(screen.getByRole('status')).toBeDefined()
    render(<ErrorState title="Broken">details</ErrorState>)
    expect(screen.getByRole('alert')).toBeDefined()
  })
})
