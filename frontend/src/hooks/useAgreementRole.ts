// Single source of truth for a wallet's role and permitted actions on an
// agreement. Everything is derived from DIRECT contract state plus the
// authenticated session — never from the route, invitation/draft metadata,
// dashboard cache, localStorage, or stale React state.
//
// Hard rule: no action is enabled unless the connected wallet EXACTLY matches
// the authenticated session wallet. Recipient and tenant roles are mutually
// exclusive because the contract forbids the recipient being a tenant.

export interface AgreementSnapshot {
  creator: string
  recipient: string
  recipientAccepted: boolean
  status: number // 0 NONE 1 FUNDING 2 ACTIVE 3 FINALIZED 4 CANCELLED
  fundingDeadline: bigint
}

export interface TenantSnapshot {
  wallet: string
  requiredAmount: bigint
  fundedAmount: bigint
  accepted: boolean
  exists: boolean
}

export interface AgreementRole {
  connectedWallet: string | null
  authWallet: string | null
  walletMatchesSession: boolean
  isCreator: boolean
  isTenant: boolean
  tenantIndex: number | null
  isRecipient: boolean
  isParticipant: boolean
  tenantRecord: TenantSnapshot | null
  remaining: bigint
  fundingDeadlinePassed: boolean
  fundingOpen: boolean
  canManageInvitations: boolean
  canAcceptAsTenant: boolean
  canAcceptAsRecipient: boolean
  canDeposit: boolean
  canWithdrawFunding: boolean
}

function norm(value: string | null | undefined): string | null {
  return value ? value.toLowerCase() : null
}

export function resolveAgreementRole(params: {
  connectedAddress: string | null | undefined
  authWallet: string | null | undefined
  nowSeconds: number
  agreement: AgreementSnapshot
  tenants: TenantSnapshot[]
}): AgreementRole {
  const connected = norm(params.connectedAddress)
  const auth = norm(params.authWallet)
  const walletMatchesSession = connected !== null && auth !== null && connected === auth

  const creator = norm(params.agreement.creator)
  const recipient = norm(params.agreement.recipient)

  const tenantIdx = params.tenants.findIndex((t) => norm(t.wallet) === connected)
  const tenantRecord = tenantIdx >= 0 ? params.tenants[tenantIdx] : null
  const isTenant = tenantRecord !== null
  const isRecipient = connected !== null && connected === recipient
  const isCreator = connected !== null && connected === creator
  const isParticipant = isTenant || isRecipient

  const remaining = tenantRecord
    ? tenantRecord.requiredAmount - tenantRecord.fundedAmount
    : 0n

  const isFunding = params.agreement.status === 1
  const fundingDeadlinePassed =
    params.nowSeconds > Number(params.agreement.fundingDeadline)
  const fundingOpen = isFunding && !fundingDeadlinePassed

  // Every action requires the connected wallet to match the signed-in session.
  const gate = walletMatchesSession

  return {
    connectedWallet: connected,
    authWallet: auth,
    walletMatchesSession,
    isCreator,
    isTenant,
    tenantIndex: tenantIdx >= 0 ? tenantIdx : null,
    isRecipient,
    isParticipant,
    tenantRecord,
    remaining,
    fundingDeadlinePassed,
    fundingOpen,
    // Invitation management lives on the draft page; the creator flag is
    // exposed for UI labelling but the agreement page grants no such action.
    canManageInvitations: gate && isCreator,
    canAcceptAsTenant: gate && isTenant && !tenantRecord!.accepted && fundingOpen,
    canAcceptAsRecipient:
      gate && isRecipient && !params.agreement.recipientAccepted && fundingOpen,
    canDeposit: gate && isTenant && tenantRecord!.accepted && remaining > 0n && fundingOpen,
    // Pre-activation withdrawal is valid while FUNDING (even past the deadline,
    // before cancellation), since the contract allows it in that window.
    canWithdrawFunding: gate && isTenant && tenantRecord!.fundedAmount > 0n && isFunding,
  }
}
