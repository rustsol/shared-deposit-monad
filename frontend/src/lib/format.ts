// Exact financial value handling. Wei travels as decimal strings, becomes
// bigint in the browser, and is NEVER converted to a JavaScript Number.

import { formatEther, parseEther } from 'viem'

const DECIMAL_INPUT = /^\d+(\.\d{1,18})?$/

/** Parses a user-typed MON amount into exact wei. Throws on anything unsafe:
 * scientific notation, commas, negatives, more than 18 decimals. */
export function monToWei(input: string): bigint {
  const trimmed = input.trim()
  if (!DECIMAL_INPUT.test(trimmed)) {
    throw new Error('enter a plain decimal MON amount (up to 18 decimal places)')
  }
  return parseEther(trimmed)
}

/** Formats exact wei (bigint or decimal string) for display. */
export function weiToMon(wei: bigint | string): string {
  const value = typeof wei === 'bigint' ? wei : BigInt(wei)
  return formatEther(value)
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function formatTimestamp(seconds: number | string): string {
  const value = typeof seconds === 'string' ? Number.parseInt(seconds, 10) : seconds
  return new Date(value * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** A warning when the funding deadline is soon (or in the past). Returns null
 *  when it is comfortably in the future. */
export function fundingDeadlineWarning(
  fundingDeadlineUnix: number,
  nowUnix: number,
): string | null {
  const hours = (fundingDeadlineUnix - nowUnix) / 3600
  if (hours <= 0) return 'The funding deadline is in the past. Choose a future date and time.'
  if (hours < 24) {
    return 'The funding deadline is less than 24 hours away. Give every participant enough time to accept and fund - a deadline at least 48 hours out is recommended.'
  }
  return null
}
