// Draft page: canonical-hash comparison, the real createAgreement wallet
// transaction with backend verification, and invitation management.

import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount, useChainId } from 'wagmi'
import { api, ApiError } from '../lib/api'
import { termsHash } from '../lib/canonical'
import { monadTestnet } from '../lib/chain'
import { shortAddress, formatTimestamp } from '../lib/format'
import { sharedDepositEscrowAbi } from '../generated/sharedDepositEscrow'
import { useAuth } from '../app/AuthContext'
import { useContractTx } from '../hooks/useContractTx'
import {
  AmountDisplay,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
  ProofRow,
  WalletAddress,
} from '../components/ui'

interface Draft {
  id: string
  status: string
  property_alias: string
  recipient: string
  creator: string
  terms_hash: string
  terms_json: Record<string, unknown>
  chain_id: number
  contract_address: string
  agreement_id_onchain: string | null
  creation_tx_hash: string | null
  tenants: { tenant_index: number; wallet: string; required_amount_wei: string; display_label: string | null }[]
}

interface Prepared {
  contractAddress: `0x${string}`
  termsHash: `0x${string}`
  canonicalTerms: Record<string, unknown>
  arguments: {
    recipient: `0x${string}`
    termsHash: `0x${string}`
    leaseStart: string
    leaseEnd: string
    fundingDeadline: string
    claimDeadline: string
    settlementDeadline: string
    tenantAddresses: `0x${string}`[]
    requiredAmounts: string[]
  }
}

interface CreatedInvitation {
  invitation_id: string
  invitation_token: string
  expected_wallet: string
  role: string
  expires_at: string
  warning: string
}

export default function DraftDetail() {
  const { draftId } = useParams<{ draftId: string }>()
  const { status } = useAuth()
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { send } = useContractTx()
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [frontendHash, setFrontendHash] = useState<`0x${string}` | null>(null)
  const [creationError, setCreationError] = useState<string | null>(null)
  const [issuedInvitation, setIssuedInvitation] = useState<CreatedInvitation | null>(null)

  const draft = useQuery({
    queryKey: ['draft', draftId],
    queryFn: () => api<Draft>(`/agreement-drafts/${draftId}`),
    enabled: status === 'authenticated' && Boolean(draftId),
  })

  const prepare = useMutation({
    mutationFn: () =>
      api<Prepared>(`/agreement-drafts/${draftId}/prepare-onchain`, { method: 'POST' }),
    onSuccess: (data) => {
      setPrepared(data)
      // Independent reproduction of the canonical hash in the browser.
      setFrontendHash(termsHash(data.canonicalTerms))
    },
  })

  const invite = useMutation({
    mutationFn: (input: { expected_wallet: string; role: string }) =>
      api<CreatedInvitation>(`/agreement-drafts/${draftId}/invitations`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (data) => setIssuedInvitation(data),
  })

  if (status !== 'authenticated') {
    return (
      <main className="page">
        <div className="notice"><Link to="/login">Sign in</Link> to open this draft.</div>
      </main>
    )
  }
  if (draft.isLoading) {
    return (
      <main className="page">
        <PageHeader title="Draft" />
        <LoadingSkeleton lines={4} label="Loading draft" />
      </main>
    )
  }
  if (draft.isError || !draft.data) {
    return (
      <main className="page">
        <ErrorState title="Draft unavailable">
          {draft.error instanceof ApiError ? draft.error.message : 'This draft could not be loaded.'}
        </ErrorState>
      </main>
    )
  }
  const data = draft.data
  const hashesMatch = prepared !== null && frontendHash !== null && frontendHash === prepared.termsHash
  const canCreate =
    hashesMatch && isConnected && chainId === monadTestnet.id && data.status === 'DRAFT'

  async function createOnchain() {
    if (!prepared || !draftId) return
    setCreationError(null)
    const args = prepared.arguments
    const hash = await send({
      label: `Create agreement (${data.property_alias})`,
      functionName: 'createAgreement',
      address: prepared.contractAddress,
      abi: sharedDepositEscrowAbi,
      args: [
        args.recipient,
        args.termsHash,
        BigInt(args.leaseStart),
        BigInt(args.leaseEnd),
        BigInt(args.fundingDeadline),
        BigInt(args.claimDeadline),
        BigInt(args.settlementDeadline),
        args.tenantAddresses,
        args.requiredAmounts.map((amount) => BigInt(amount)),
      ],
      verify: async (txHash) => {
        // The backend independently verifies the real receipt + AgreementCreated
        // event before we treat creation as done. VERIFIED requires it to succeed.
        const confirmed = await api<{ agreementId: string; contractAddress: string; chainId: number }>(
          `/agreement-drafts/${draftId}/confirm-onchain`,
          { method: 'POST', body: { tx_hash: txHash } },
        )
        await queryClient.invalidateQueries({ queryKey: ['draft', draftId] })
        navigate(
          `/agreements/${confirmed.chainId}/${confirmed.contractAddress}/${confirmed.agreementId}`,
        )
        return true
      },
    })
    if (hash === null) setCreationError('The transaction did not complete — see the drawer for details.')
  }

  return (
    <main className="page">
      <PageHeader
        title={data.property_alias}
        eyebrow="Agreement draft"
        meta={
          <span className={`badge ${data.status === 'CONFIRMED' ? 'active' : 'funding'}`}>
            {data.status === 'CONFIRMED' ? 'Onchain' : 'Draft — not onchain yet'}
          </span>
        }
      />

      <div className="card">
        <h2>Participants</h2>
        <table className="data">
          <thead>
            <tr><th>Role</th><th>Wallet</th><th>Contribution</th></tr>
          </thead>
          <tbody>
            {data.tenants.map((tenant) => (
              <tr key={tenant.wallet}>
                <td>{tenant.wallet === data.creator ? 'Creator · tenant' : 'Tenant'}</td>
                <td><WalletAddress address={tenant.wallet} /></td>
                <td><AmountDisplay wei={tenant.required_amount_wei} /></td>
              </tr>
            ))}
            <tr>
              <td>Deposit recipient</td>
              <td><WalletAddress address={data.recipient} /></td>
              <td className="muted">No contribution required</td>
            </tr>
          </tbody>
        </table>
        <dl className="kv small" style={{ marginTop: '0.75rem' }}>
          <dt>Funding deadline</dt><dd>{formatTimestamp(data.terms_json.fundingDeadline as number)}</dd>
          <dt>Lease</dt>
          <dd>
            {formatTimestamp(data.terms_json.leaseStart as number)} → {formatTimestamp(data.terms_json.leaseEnd as number)}
          </dd>
          <dt>Claim deadline</dt><dd>{formatTimestamp(data.terms_json.claimDeadline as number)}</dd>
          <dt>Settlement deadline</dt><dd>{formatTimestamp(data.terms_json.settlementDeadline as number)}</dd>
        </dl>
      </div>

      {data.status === 'DRAFT' && (
        <div className="card">
          <h2>Create onchain</h2>
          <p className="muted small">
            Before anything goes onchain, your browser independently recomputes the terms
            fingerprint and compares it with the server's. Creation stays disabled unless both
            match byte-for-byte — so what you sign is exactly what was agreed.
          </p>
          <button className="secondary" onClick={() => prepare.mutate()} disabled={prepare.isPending}>
            {prepare.isPending ? 'Checking…' : 'Run the terms check'}
          </button>
          {prepare.isError && (
            <div className="notice error">
              {prepare.error instanceof ApiError ? prepare.error.message : 'prepare failed'}
            </div>
          )}
          {prepared && (
            <div style={{ marginTop: '0.75rem' }}>
              <ProofRow label="Server fingerprint" value={prepared.termsHash} />
              <ProofRow label="Your browser's fingerprint" value={frontendHash ?? ''} />
              <ProofRow label="Escrow contract" value={prepared.contractAddress} />
              <p>
                {hashesMatch ? (
                  <span className="badge tone-success">Fingerprints match ✓</span>
                ) : (
                  <span className="badge tone-danger">Mismatch — do not proceed</span>
                )}
              </p>
            </div>
          )}
          {prepared && !isConnected && <div className="notice warn">Connect your wallet to continue.</div>}
          {prepared && isConnected && chainId !== monadTestnet.id && (
            <div className="notice warn">Switch to Monad Testnet (chain 10143).</div>
          )}
          <p>
            <button className="primary" disabled={!canCreate} onClick={() => void createOnchain()}>
              Create agreement on Monad Testnet
            </button>
          </p>
          {creationError && <div className="notice error">{creationError}</div>}
        </div>
      )}

      {data.status === 'CONFIRMED' && data.agreement_id_onchain && (
        <div className="notice success">
          Onchain as agreement #{data.agreement_id_onchain}.{' '}
          <Link to={`/agreements/${data.chain_id}/${data.contract_address}/${data.agreement_id_onchain}`}>
            Open the live agreement
          </Link>
        </div>
      )}

      <div className="card">
        <h2>Invitations</h2>
        <p className="muted small">
          One private link per participant. Each link is shown <strong>once</strong>; joining a
          link grants offchain access only — onchain acceptance is a separate wallet
          transaction by each participant.
        </p>
        <table className="data">
          <thead>
            <tr><th>Participant</th><th>Role</th><th></th></tr>
          </thead>
          <tbody>
            {data.tenants
              .filter((tenant) => tenant.wallet !== data.creator)
              .map((tenant) => (
                <tr key={tenant.wallet}>
                  <td className="mono">{shortAddress(tenant.wallet)}</td>
                  <td>Tenant</td>
                  <td>
                    <button
                      className="secondary"
                      disabled={invite.isPending}
                      onClick={() => invite.mutate({ expected_wallet: tenant.wallet, role: 'TENANT' })}
                    >
                      Create invitation
                    </button>
                  </td>
                </tr>
              ))}
            <tr>
              <td className="mono">{shortAddress(data.recipient)}</td>
              <td>Recipient</td>
              <td>
                <button
                  className="secondary"
                  disabled={invite.isPending}
                  onClick={() => invite.mutate({ expected_wallet: data.recipient, role: 'RECIPIENT' })}
                >
                  Create invitation
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        {invite.isError && (
          <div className="notice error">
            {invite.error instanceof ApiError ? invite.error.message : 'invitation failed'}
          </div>
        )}
        {issuedInvitation && (
          <div className="notice warn">
            <strong>Copy this link now — it is shown only once.</strong>
            <p className="mono small">
              {`${window.location.origin}/invitations/${issuedInvitation.invitation_token}`}
            </p>
            <button
              className="secondary"
              onClick={() =>
                void navigator.clipboard.writeText(
                  `${window.location.origin}/invitations/${issuedInvitation.invitation_token}`,
                )
              }
            >
              Copy link
            </button>{' '}
            <span className="small muted">
              For {shortAddress(issuedInvitation.expected_wallet)} ({issuedInvitation.role}), expires{' '}
              {new Date(issuedInvitation.expires_at).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </main>
  )
}
