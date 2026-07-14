// One shared path for every real contract write: wallet request → broadcast
// → receipt → optional backend verification. Success is never shown from a
// hash alone; a receipt (status success) is always awaited, and reverts are
// surfaced with the decoded error when the wallet/RPC provides one.

import { useCallback } from 'react'
import { useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { wagmiConfig } from '../lib/chain'
import { useTx } from '../app/TxContext'

export interface ContractTxRequest {
  label: string
  functionName: string
  address: `0x${string}`
  abi: readonly unknown[]
  args: readonly unknown[]
  value?: bigint
  /** Runs after a successful receipt (e.g. backend verification). */
  afterReceipt?: (hash: `0x${string}`) => Promise<void>
}

export function useContractTx() {
  const { writeContractAsync } = useWriteContract()
  const { track, update } = useTx()

  const send = useCallback(
    async (request: ContractTxRequest): Promise<`0x${string}` | null> => {
      const id = track({
        label: request.label,
        functionName: request.functionName,
        status: 'waiting-for-wallet',
      })
      let hash: `0x${string}`
      try {
        hash = await writeContractAsync({
          address: request.address,
          abi: request.abi as never,
          functionName: request.functionName as never,
          args: request.args as never,
          value: request.value,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/reject|denied/i.test(message)) {
          update(id, { status: 'user-rejected' })
        } else {
          update(id, { status: 'error', error: message.split('\n')[0] })
        }
        return null
      }

      update(id, { status: 'broadcast', hash })
      let receipt
      try {
        update(id, { status: 'pending', hash })
        receipt = await waitForTransactionReceipt(wagmiConfig, { hash })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        update(id, { status: 'error', hash, error: message.split('\n')[0] })
        return null
      }
      if (receipt.status !== 'success') {
        update(id, { status: 'reverted', hash, error: 'transaction reverted onchain' })
        return null
      }
      update(id, { status: 'mined', hash })

      if (request.afterReceipt) {
        update(id, { status: 'backend-verification', hash })
        try {
          await request.afterReceipt(hash)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          update(id, { status: 'error', hash, error: `backend verification failed: ${message}` })
          return null
        }
      }
      update(id, { status: 'verified', hash })
      return hash
    },
    [track, update, writeContractAsync],
  )

  return { send }
}
