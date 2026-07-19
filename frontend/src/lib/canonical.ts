// Independent browser implementation of the canonical agreement-terms
// serialization and Keccak-256 hash (docs/02 §4.1). It must reproduce the
// backend byte-for-byte - agreement creation stays disabled unless the two
// hashes match exactly.

import { keccak256, toHex } from 'viem'

export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort()
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  }
  if (typeof value === 'number' && !Number.isInteger(value)) {
    throw new Error('floating-point values are not permitted in canonical terms')
  }
  return JSON.stringify(value)
}

export function termsHash(terms: unknown): `0x${string}` {
  return keccak256(toHex(canonicalize(terms)))
}
