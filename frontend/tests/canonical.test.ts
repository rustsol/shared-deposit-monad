// Cross-language canonical hashing: the browser implementation must exactly
// reproduce the backend golden vector (backend/tests/fixtures).

import { describe, expect, test } from 'vitest'
import { canonicalize, termsHash } from '../src/lib/canonical'

// Mirror of backend/tests/fixtures/canonical_terms_vector.json (values only).
const VECTOR_INPUT = {
  approvalRule: { requiredApprovals: 2, type: 'STRICT_MAJORITY' },
  chainId: 10143,
  claimDeadline: 1801353600,
  creator: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
  currency: 'MON',
  evidenceRequired: true,
  fundingDeadline: 1769904000,
  individualDeductionRule: 'DEDUCT_FROM_LIABLE_TENANT_FIRST',
  leaseEnd: 1798761600,
  leaseStart: 1767225600,
  propertyAlias: 'Test Apartment Ünit 4',
  recipient: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2',
  schemaVersion: '1.0',
  settlementDeadline: 1803945600,
  sharedDeductionRule: 'PROPORTIONAL_TO_REMAINING_BALANCE_AFTER_INDIVIDUAL_DEDUCTIONS',
  tenantContributions: [
    { requiredAmountWei: '1500000000000000000', wallet: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1' },
    { requiredAmountWei: '2500000000000000001', wallet: '0xccccccccccccccccccccccccccccccccccccccc3' },
  ],
}

const EXPECTED_HASH = '0x14a430dcd11421b8c95e7aca3f7c3a062cda665587885bfa95f93cb7015c5446'

describe('canonical terms hashing (backend parity)', () => {
  test('reproduces the backend golden vector hash exactly', () => {
    expect(termsHash(VECTOR_INPUT)).toBe(EXPECTED_HASH)
  })

  test('object key insertion order does not matter', () => {
    const reordered = Object.fromEntries(Object.entries(VECTOR_INPUT).reverse())
    expect(termsHash(reordered)).toBe(EXPECTED_HASH)
  })

  test('any value change changes the hash', () => {
    const changed = structuredClone(VECTOR_INPUT)
    changed.tenantContributions[0].requiredAmountWei = '1500000000000000001'
    expect(termsHash(changed)).not.toBe(EXPECTED_HASH)
  })

  test('tenant order is significant', () => {
    const swapped = structuredClone(VECTOR_INPUT)
    swapped.tenantContributions.reverse()
    expect(termsHash(swapped)).not.toBe(EXPECTED_HASH)
  })

  test('floating point values are rejected', () => {
    expect(() => canonicalize({ amount: 1.5 })).toThrow(/floating-point/)
  })
})
