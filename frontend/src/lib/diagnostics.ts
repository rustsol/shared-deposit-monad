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
  walletClientAccount: string | null
  blockDifference: number | null
  contractCodeMatches: boolean
  safeReadMatches: boolean
  // ---- Identity (who is connected vs who is signed in) --------------------
  // A mismatch here is an ACCOUNT problem to be fixed by re-authenticating -
  // it is NOT a network/RPC fault and must never be reported as one.
  walletMatchesSession: boolean
  walletClientMatches: boolean
  identityMatch: boolean
  identityReasons: string[]
  connectedIsRecipient: boolean | null
  // ---- Network readiness (can this chain be transacted on at all) ---------
  // Only genuinely necessary, network-level facts. Optional injected-provider
  // reads (nonce, wallet balance, wallet block/code) never appear here.
  networkReady: boolean
  networkBlockingReasons: string[]
  // Backward-compatible network health flag == networkReady.
  overallHealth: 'healthy' | 'unhealthy'
  // Combined list (network + identity) for any legacy consumer.
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
  /** Address reported by the active wallet client (connector), if available. */
  walletClientAccount?: string | null
  requiredRecipient?: string | null
  /** Minimum balance (wei) needed for estimated gas. Checked against the
   *  APPLICATION RPC balance only - a wallet-provider read failure never
   *  blocks the action. */
  minBalanceWei?: bigint
}

const norm = (value: string | null | undefined): string | null =>
  value ? value.toLowerCase() : null

/**
 * Pure health evaluation from two providers' readings.
 *
 * Network readiness and identity are evaluated SEPARATELY. Network readiness
 * requires only genuinely necessary facts: both chains are 10143, the
 * application RPC returns a block, and the deployed contract is visible through
 * the application RPC. Optional injected-provider reads - nonce, wallet
 * balance, wallet-side block/code, exact block/balance parity - are diagnostic
 * only and never block a write. Identity (connected == signed-in == wallet
 * client) is an account concern handled by re-authentication, not the network.
 */
export function evaluateHealth(
  wallet: ProviderReadings,
  app: ProviderReadings,
  opts: EvaluateOptions,
): NetworkDiagnostics {
  // ---- Network readiness (hard requirements only) -------------------------
  const networkBlockingReasons: string[] = []

  if (wallet.chainId !== MONAD_CHAIN_ID)
    networkBlockingReasons.push(`Wallet chain ID is ${wallet.chainId ?? 'unknown'}, expected 10143`)
  if (app.chainId !== MONAD_CHAIN_ID)
    networkBlockingReasons.push(
      `Application RPC chain ID is ${app.chainId ?? 'unknown'}, expected 10143`,
    )
  if (app.latestBlock === null)
    networkBlockingReasons.push('Application RPC did not return a latest block')

  const appCodeOk = Boolean(app.contractCode && app.contractCode !== '0x')
  if (!appCodeOk)
    networkBlockingReasons.push('Deployed contract code is not visible through the application RPC')

  // Gas balance is authoritative from the application RPC. A wallet-provider
  // balance read failure must never block when the app RPC has the balance.
  if (opts.minBalanceWei !== undefined && app.balanceWei !== null) {
    if (BigInt(app.balanceWei) < opts.minBalanceWei)
      networkBlockingReasons.push('Wallet balance (via application RPC) is below the estimated gas')
  }

  const networkReady = networkBlockingReasons.length === 0

  // ---- Identity (account concern, not a network fault) --------------------
  const connected = norm(opts.connectedWallet)
  const auth = norm(opts.authWallet)
  const walletClient = norm(opts.walletClientAccount)

  const walletMatchesSession = Boolean(connected && auth && connected === auth)
  // Unknown wallet-client account (some connectors don't expose it) is not a
  // mismatch - only a definite disagreement counts.
  const walletClientMatches =
    walletClient === null || connected === null || walletClient === connected

  const identityReasons: string[] = []
  if (!walletMatchesSession)
    identityReasons.push('Connected wallet does not match the signed-in session')
  if (!walletClientMatches)
    identityReasons.push('Wallet client account differs from the connected wallet')
  const identityMatch = walletMatchesSession && walletClientMatches

  let connectedIsRecipient: boolean | null = null
  if (opts.requiredRecipient) {
    connectedIsRecipient = connected !== null && connected === norm(opts.requiredRecipient)
  }

  // ---- Diagnostic-only comparisons (never gate) ---------------------------
  const blockDifference =
    wallet.latestBlock !== null && app.latestBlock !== null
      ? Math.abs(wallet.latestBlock - app.latestBlock)
      : null
  const walletCodeOk = Boolean(wallet.contractCode && wallet.contractCode !== '0x')
  const contractCodeMatches =
    walletCodeOk && appCodeOk && wallet.contractCodeHash === app.contractCodeHash
  const safeReadMatches = wallet.safeReadOk && app.safeReadOk

  return {
    wallet,
    app,
    connectedWallet: opts.connectedWallet,
    authWallet: opts.authWallet,
    walletClientAccount: opts.walletClientAccount ?? null,
    blockDifference,
    contractCodeMatches,
    safeReadMatches,
    walletMatchesSession,
    walletClientMatches,
    identityMatch,
    identityReasons,
    connectedIsRecipient,
    networkReady,
    networkBlockingReasons,
    overallHealth: networkReady ? 'healthy' : 'unhealthy',
    failures: [...networkBlockingReasons, ...identityReasons],
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
