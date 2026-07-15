// Exact wei handling: decimal-string transport, bigint math, no Number.

import { describe, expect, test } from 'vitest'
import { monToWei, weiToMon } from '../src/lib/format'

describe('monToWei', () => {
  test('converts decimals exactly', () => {
    expect(monToWei('1')).toBe(1000000000000000000n)
    expect(monToWei('0.1')).toBe(100000000000000000n)
    expect(monToWei('2.500000000000000001')).toBe(2500000000000000001n)
    expect(monToWei('0.000000000000000001')).toBe(1n)
  })

  test('values beyond JavaScript safe-integer range stay exact', () => {
    expect(monToWei('9007199254.740993')).toBe(9007199254740993000000000000n)
  })

  test.each(['1e18', '-1', '1,5', '1.1234567890123456789', 'abc', ''])(
    'rejects unsafe input %s',
    (input) => {
      expect(() => monToWei(input)).toThrow()
    },
  )
})

describe('weiToMon', () => {
  test('formats decimal strings and bigints exactly', () => {
    expect(weiToMon('2500000000000000001')).toBe('2.500000000000000001')
    expect(weiToMon(1n)).toBe('0.000000000000000001')
  })

  test('round trips exactly', () => {
    const values = ['0.5', '123.456789012345678', '1']
    for (const value of values) {
      expect(weiToMon(monToWei(value))).toBe(value)
    }
  })
})

import { fundingDeadlineWarning } from '../src/lib/format'

describe('fundingDeadlineWarning', () => {
  const now = 1_700_000_000
  test('warns when the deadline is in the past', () => {
    expect(fundingDeadlineWarning(now - 3600, now)).toMatch(/in the past/)
  })
  test('warns when less than 24 hours away', () => {
    expect(fundingDeadlineWarning(now + 3600 * 5, now)).toMatch(/less than 24 hours/)
  })
  test('no warning when comfortably in the future (>= 24h)', () => {
    expect(fundingDeadlineWarning(now + 3600 * 48, now)).toBeNull()
  })
})
