// Dual-provider Monad Testnet health + broadcast-propagation logic.
//
// The application has TWO independent blockchain connections that must be
// validated separately:
//   1. the application public client (our configured official Monad RPC), and
//   2. the injected browser wallet provider (MetaMask/Rabby), which may
//      internally use a stale/broken RPC even while reporting chain 10143.
//
// Reporting chain 10143 is NOT sufficient. We compare real responses from both
// providers and only allow a write when both are healthy. The pure evaluators
// here are unit-tested without any provider.

import { encodeFunctionData, keccak256 } from 'viem'
import { sharedDepositEscrowAbi } from '../generated/sharedDepositEscrow'

export const MONAD_CHAIN_ID = 10143
export const MONAD_CHAIN_HEX = '0x279f' // 10143
export const MONAD_RPC = 'https://testnet-rpc.monad.xyz'
export const MONAD_EXPLORER = 'https://testnet.monadvision.com'
// Block staleness tolerance between the two providers (adjacent blocks are ok).
export const BLOCK_TOLERANCE = 20

export interface ProviderReadings {
  chainId: number | null
  latestBlock: number | null
  balanceWei: string | null
  latestNonce: number | null
  pendingNonce: number | null
  contractCode: string | null
  contractCodeHash: string | null
  safeReadOk: boolean
  error?: string
}

export interface NetworkDiagnostics {
  wallet: ProviderReadings
  app: ProviderReadings
  connectedWallet: string | null
  authWallet: string | null
  blockDifference: number | null
  contractCodeMatches: boolean
  safeReadMatches: boolean
  walletMatchesSession: boolean
  connectedIsRecipient: boolean | null
  overallHealth: 'healthy' | 'unhealthy'
  failures: string[]
}

/** Calldata for a cheap, safe view call used to prove connectivity. */
export function safeReadCalldata(): `0x${string}` {
  return encodeFunctionData({ abi: sharedDepositEscrowAbi, functionName: 'nextAgreementId' })
}

export function codeHash(code: string | null): string | null {
  if (!code || code === '0x') return null
  return keccak256(code as `0x${string}`)
}

export interface EvaluateOptions {
  connectedWallet: string | null
  authWallet: string | null
  requiredRecipient?: string | null
  /** Minimum balance (wei) each provider must report to permit the write. */
  minBalanceWei?: bigint
}

/** Pure health evaluation from two providers' readings. */
export function evaluateHealth(
  wallet: ProviderReadings,
  app: ProviderReadings,
  opts: EvaluateOptions,
): NetworkDiagnostics {
  const failures: string[] = []

  if (wallet.chainId !== MONAD_CHAIN_ID)
    failures.push(`Wallet provider chain ID is ${wallet.chainId ?? 'unknown'}, expected 10143`)
  if (app.chainId !== MONAD_CHAIN_ID)
    failures.push(`Application RPC chain ID is ${app.chainId ?? 'unknown'}, expected 10143`)

  const blockDifference =
    wallet.latestBlock !== null && app.latestBlock !== null
      ? Math.abs(wallet.latestBlock - app.latestBlock)
      : null
  if (app.latestBlock === null) failures.push('Application RPC did not return a block number')
  if (wallet.latestBlock === null)
    failures.push('Wallet provider did not return a block number')
  if (blockDifference !== null && blockDifference > BLOCK_TOLERANCE)
    failures.push(
      `Wallet provider block is stale by ${blockDifference} blocks (tolerance ${BLOCK_TOLERANCE})`,
    )

  const walletCodeOk = Boolean(wallet.contractCode && wallet.contractCode !== '0x')
  const appCodeOk = Boolean(app.contractCode && app.contractCode !== '0x')
  if (!appCodeOk) failures.push('Contract code not visible through the application RPC')
  if (!walletCodeOk) failures.push('Contract code not visible through the wallet provider')
  const contractCodeMatches =
    walletCodeOk && appCodeOk && wallet.contractCodeHash === app.contractCodeHash
  if (walletCodeOk && appCodeOk && !contractCodeMatches)
    failures.push('Contract code differs between the wallet provider and the application RPC')

  const safeReadMatches = wallet.safeReadOk && app.safeReadOk
  if (!app.safeReadOk) failures.push('Safe contract read failed through the application RPC')
  if (!wallet.safeReadOk) failures.push('Safe contract read failed through the wallet provider')

  if (wallet.latestNonce === null || wallet.pendingNonce === null)
    failures.push('Wallet provider nonce is not readable')
  if (wallet.balanceWei === null) failures.push('Wallet balance is not readable')

  const connected = opts.connectedWallet?.toLowerCase() ?? null
  const auth = opts.authWallet?.toLowerCase() ?? null
  const walletMatchesSession = Boolean(connected && auth && connected === auth)
  if (!walletMatchesSession)
    failures.push('Connected wallet does not match the signed-in session')

  let connectedIsRecipient: boolean | null = null
  if (opts.requiredRecipient) {
    connectedIsRecipient = connected === opts.requiredRecipient.toLowerCase()
    if (!connectedIsRecipient)
      failures.push('Connected wallet is not the deposit recipient for this agreement')
  }

  if (opts.minBalanceWei !== undefined) {
    const walletBal = wallet.balanceWei !== null ? BigInt(wallet.balanceWei) : null
    const appBal = app.balanceWei !== null ? BigInt(app.balanceWei) : null
    if (walletBal !== null && walletBal < opts.minBalanceWei)
      failures.push('Wallet-provider balance is insufficient for gas')
    if (appBal !== null && appBal < opts.minBalanceWei)
      failures.push('Application-RPC balance is insufficient for gas')
  }

  return {
    wallet,
    app,
    connectedWallet: opts.connectedWallet,
    authWallet: opts.authWallet,
    blockDifference,
    contractCodeMatches,
    safeReadMatches,
    walletMatchesSession,
    connectedIsRecipient,
    overallHealth: failures.length === 0 ? 'healthy' : 'unhealthy',
    failures,
  }
}

// ---- Broadcast propagation classification ---------------------------------

export type PropagationDecision =
  | 'APP_CONFIRMED' // official RPC sees it → begin receipt polling
  | 'WALLET_RPC_DIVERGED' // wallet sees it, official RPC does not (extended)
  | 'APPLICATION_RPC_DELAYED' // only wallet sees it, still within window
  | 'BROADCAST_FAILED_NOT_PROPAGATED' // neither sees it after the window
  | 'KEEP_POLLING'

export function classifyPropagation(params: {
  walletSeen: boolean
  appSeen: boolean
  elapsedMs: number
  windowMs: number
  extendedMs: number
}): PropagationDecision {
  const { walletSeen, appSeen, elapsedMs, windowMs, extendedMs } = params
  // The official RPC is authoritative for our contract's chain.
  if (appSeen) return 'APP_CONFIRMED'
  if (walletSeen) {
    // Wallet broadcast somewhere, but the official RPC can't see it.
    return elapsedMs >= extendedMs ? 'WALLET_RPC_DIVERGED' : 'APPLICATION_RPC_DELAYED'
  }
  // Neither provider has ever seen the transaction.
  return elapsedMs >= windowMs ? 'BROADCAST_FAILED_NOT_PROPAGATED' : 'KEEP_POLLING'
}

// ---- Wallet network repair parameters -------------------------------------

export function monadSwitchChainParams(): [{ chainId: string }] {
  return [{ chainId: MONAD_CHAIN_HEX }]
}

export function monadAddChainParams() {
  return [
    {
      chainId: MONAD_CHAIN_HEX,
      chainName: 'Monad Testnet',
      rpcUrls: [MONAD_RPC],
      nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
      blockExplorerUrls: [MONAD_EXPLORER],
    },
  ]
}
