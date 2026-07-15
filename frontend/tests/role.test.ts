// Role resolution: the single source of truth for what each wallet may do.
// Recipient must never be able to deposit; connected wallet must match the
// authenticated session; roles derive only from direct contract state.

import { describe, expect, test } from 'vitest'
import { resolveAgreementRole } from '../src/hooks/useAgreementRole'
import type { AgreementSnapshot, TenantSnapshot } from '../src/hooks/useAgreementRole'

const CREATOR = '0xEE2A36A186203858dd734387A29b42478e3FaD48'
const TENANT_B = '0x7ab3adF1c8fc4746333E104b6A793f6782d7ba23'
const RECIPIENT = '0x2E35125f5d6552281E663254083Bd2b6713977dF'
const OUTSIDER = '0x9999999999999999999999999999999999999999'

const FUTURE = BigInt(Math.floor(Date.now() / 1000) + 10_000)
const PAST = BigInt(Math.floor(Date.now() / 1000) - 10_000)
const NOW = Math.floor(Date.now() / 1000)

function agreement(overrides: Partial<AgreementSnapshot> = {}): AgreementSnapshot {
  return {
    creator: CREATOR,
    recipient: RECIPIENT,
    recipientAccepted: false,
    status: 1, // FUNDING
    fundingDeadline: FUTURE,
    ...overrides,
  }
}

function tenants(overrides: Partial<TenantSnapshot>[] = []): TenantSnapshot[] {
  const base: TenantSnapshot[] = [
    { wallet: CREATOR, requiredAmount: 10n ** 18n, fundedAmount: 0n, accepted: false, exists: true },
    { wallet: TENANT_B, requiredAmount: 10n ** 18n, fundedAmount: 0n, accepted: false, exists: true },
  ]
  return base.map((t, i) => ({ ...t, ...(overrides[i] ?? {}) }))
}

function resolve(connected: string, auth: string, a = agreement(), t = tenants()) {
  return resolveAgreementRole({
    connectedAddress: connected,
    authWallet: auth,
    nowSeconds: NOW,
    agreement: a,
    tenants: t,
  })
}

describe('role resolution', () => {
  test('creator-tenant is recognized as both creator and tenant', () => {
    const role = resolve(CREATOR, CREATOR)
    expect(role.isCreator).toBe(true)
    expect(role.isTenant).toBe(true)
    expect(role.isRecipient).toBe(false)
    expect(role.tenantIndex).toBe(0)
    expect(role.canAcceptAsTenant).toBe(true)
    expect(role.canAcceptAsRecipient).toBe(false)
  })

  test('non-creator tenant is a tenant only', () => {
    const role = resolve(TENANT_B, TENANT_B)
    expect(role.isTenant).toBe(true)
    expect(role.isCreator).toBe(false)
    expect(role.isRecipient).toBe(false)
    expect(role.canAcceptAsTenant).toBe(true)
  })

  test('recipient can accept as recipient and can NEVER deposit', () => {
    const role = resolve(RECIPIENT, RECIPIENT)
    expect(role.isRecipient).toBe(true)
    expect(role.isTenant).toBe(false)
    expect(role.canAcceptAsRecipient).toBe(true)
    expect(role.canDeposit).toBe(false)
    expect(role.canAcceptAsTenant).toBe(false)
    expect(role.tenantRecord).toBeNull()
  })

  test('unrelated wallet is not a participant and has no actions', () => {
    const role = resolve(OUTSIDER, OUTSIDER)
    expect(role.isParticipant).toBe(false)
    expect(role.canAcceptAsTenant).toBe(false)
    expect(role.canAcceptAsRecipient).toBe(false)
    expect(role.canDeposit).toBe(false)
  })

  test('connected wallet must match the authenticated session', () => {
    // Signed in as recipient, but a tenant wallet is connected: the ROLE tracks
    // the connected wallet, but no action is enabled because they mismatch.
    const role = resolve(TENANT_B, RECIPIENT)
    expect(role.walletMatchesSession).toBe(false)
    expect(role.canAcceptAsTenant).toBe(false)
    expect(role.canDeposit).toBe(false)
    expect(role.canAcceptAsRecipient).toBe(false)
  })

  test('address comparison is case-insensitive (normalized)', () => {
    const role = resolve(CREATOR.toUpperCase(), CREATOR.toLowerCase())
    expect(role.walletMatchesSession).toBe(true)
    expect(role.isCreator).toBe(true)
  })

  test('deposit requires tenant acceptance first', () => {
    const notAccepted = resolve(TENANT_B, TENANT_B)
    expect(notAccepted.canDeposit).toBe(false) // not accepted yet
    const accepted = resolve(
      TENANT_B,
      TENANT_B,
      agreement(),
      tenants([{}, { accepted: true }]),
    )
    expect(accepted.canDeposit).toBe(true)
    expect(accepted.remaining).toBe(10n ** 18n)
  })

  test('fully funded tenant cannot deposit further', () => {
    const role = resolve(
      TENANT_B,
      TENANT_B,
      agreement(),
      tenants([{}, { accepted: true, fundedAmount: 10n ** 18n }]),
    )
    expect(role.remaining).toBe(0n)
    expect(role.canDeposit).toBe(false)
  })

  test('expired funding deadline closes all acceptance and funding', () => {
    const a = agreement({ fundingDeadline: PAST })
    const tenant = resolve(TENANT_B, TENANT_B, a, tenants([{}, { accepted: true }]))
    expect(tenant.fundingDeadlinePassed).toBe(true)
    expect(tenant.fundingOpen).toBe(false)
    expect(tenant.canAcceptAsTenant).toBe(false)
    expect(tenant.canDeposit).toBe(false)
    const recipient = resolve(RECIPIENT, RECIPIENT, a)
    expect(recipient.canAcceptAsRecipient).toBe(false)
  })

  test('already-accepted recipient cannot accept again', () => {
    const role = resolve(RECIPIENT, RECIPIENT, agreement({ recipientAccepted: true }))
    expect(role.canAcceptAsRecipient).toBe(false)
  })

  test('withdrawal allowed while FUNDING when the tenant has funds', () => {
    const role = resolve(
      TENANT_B,
      TENANT_B,
      agreement(),
      tenants([{}, { accepted: true, fundedAmount: 5n * 10n ** 17n }]),
    )
    expect(role.canWithdrawFunding).toBe(true)
  })

  test('non-FUNDING status disables acceptance and funding', () => {
    const role = resolve(TENANT_B, TENANT_B, agreement({ status: 2 })) // ACTIVE
    expect(role.canAcceptAsTenant).toBe(false)
    expect(role.canDeposit).toBe(false)
  })

  // Reported bug: connected as the configured recipient, the UI must never
  // present tenant controls. Role is keyed on the CONNECTED wallet, so the
  // recipient is never a tenant regardless of who the session belongs to.
  test('configured recipient is never a tenant and never sees tenant controls', () => {
    const matched = resolve(RECIPIENT, RECIPIENT)
    expect(matched.isRecipient).toBe(true)
    expect(matched.isTenant).toBe(false)
    expect(matched.tenantRecord).toBeNull()
    expect(matched.canAcceptAsTenant).toBe(false)
    expect(matched.canDeposit).toBe(false)
    expect(matched.canAcceptAsRecipient).toBe(true)

    // Even during a session mismatch, the recipient connection never becomes a
    // tenant — it just has no enabled actions until re-auth.
    const mismatched = resolve(RECIPIENT, TENANT_B)
    expect(mismatched.isRecipient).toBe(true)
    expect(mismatched.isTenant).toBe(false)
    expect(mismatched.canAcceptAsTenant).toBe(false)
  })

  test('switching the connected account recomputes the role from the new wallet', () => {
    const asTenant = resolve(TENANT_B, TENANT_B)
    expect(asTenant.isTenant).toBe(true)
    expect(asTenant.isRecipient).toBe(false)

    // Same session inputs, different connected wallet → recipient role, no
    // leaked tenant permissions from the previous account.
    const asRecipient = resolve(RECIPIENT, RECIPIENT)
    expect(asRecipient.isRecipient).toBe(true)
    expect(asRecipient.isTenant).toBe(false)
    expect(asRecipient.canAcceptAsTenant).toBe(false)
    expect(asRecipient.canDeposit).toBe(false)
  })
})
