'use client'

import { useCallback, useState } from 'react'
import type { Abi } from 'abitype'
import { useQuery } from '@tanstack/react-query'
import { createPublicClient, formatUnits, http } from 'viem'
import { defineChain, getContract, prepareContractCall } from 'thirdweb'
import {
  useActiveAccount as useThirdwebActiveAccount,
  useActiveWallet as useThirdwebActiveWallet,
  useActiveWalletChain as useThirdwebActiveWalletChain,
  useConnect as useThirdwebConnect,
  useDisconnect as useThirdwebDisconnect,
  useSendTransaction,
  useSwitchActiveWalletChain,
  useWaitForReceipt,
} from 'thirdweb/react'
import { createWallet } from 'thirdweb/wallets'
import { SOMNIA_TESTNET } from '@/lib/somnia/config'
import { somniaTestnet, thirdwebClient } from '@/lib/thirdweb-config'

type QueryConfig = {
  enabled?: boolean
  refetchInterval?: number
  retry?: number
}

type ReadContractInput = {
  address: `0x${string}`
  abi: readonly unknown[]
  functionName: string
  args?: readonly unknown[]
  query?: QueryConfig
}

type WriteContractInput = {
  address: `0x${string}`
  abi: readonly unknown[]
  functionName: string
  args?: readonly unknown[]
  value?: bigint
}

type ConnectParams = {
  connector?: { id?: string; name?: string }
  chainId?: number
}

const METAMASK_CONNECTOR = {
  id: 'metaMask',
  name: 'MetaMask',
}

const somniaPublicClient = createPublicClient({
  chain: SOMNIA_TESTNET as any,
  transport: http(SOMNIA_TESTNET.rpcUrls.default.http[0]),
})

function resolveChain(chainId?: number) {
  if (!chainId || chainId === SOMNIA_TESTNET.id) {
    return somniaTestnet
  }

  return defineChain(chainId)
}

function resolveMethod(abi: readonly unknown[], functionName: string) {
  const method = (abi as any[]).find(
    (item) => item?.type === 'function' && item?.name === functionName,
  )

  if (!method) {
    throw new Error(`Function \"${functionName}\" not found in contract ABI.`)
  }

  return method
}

function serializeQueryValue(value: unknown): string {
  return JSON.stringify(value, (_key, nestedValue) => {
    if (typeof nestedValue === 'bigint') {
      return { __type: 'bigint', value: nestedValue.toString() }
    }

    if (typeof nestedValue === 'undefined') {
      return { __type: 'undefined' }
    }

    return nestedValue
  })
}

export function useAccount() {
  const account = useThirdwebActiveAccount()

  return {
    address: account?.address as `0x${string}` | undefined,
    isConnected: !!account?.address,
  }
}

export function useChainId() {
  const chain = useThirdwebActiveWalletChain()
  return chain?.id ?? 0
}

export function useConnect() {
  const { connect: connectWallet, isConnecting, error } = useThirdwebConnect()

  const connect = useCallback(
    ({ chainId }: ConnectParams = {}) => {
      const targetChain = resolveChain(chainId)

      return connectWallet(async () => {
        const wallet = createWallet('io.metamask')
        await wallet.connect({
          client: thirdwebClient,
          chain: targetChain,
        })
        return wallet
      })
    },
    [connectWallet],
  )

  return {
    connect,
    connectors: [METAMASK_CONNECTOR],
    isPending: isConnecting,
    error,
  }
}

export function useDisconnect() {
  const wallet = useThirdwebActiveWallet()
  const { disconnect: disconnectWallet } = useThirdwebDisconnect()

  const disconnect = useCallback(() => {
    if (!wallet) return
    disconnectWallet(wallet)
  }, [wallet, disconnectWallet])

  return {
    disconnect,
  }
}

export function useSwitchChain() {
  const switchActiveWalletChain = useSwitchActiveWalletChain()
  const [isPending, setIsPending] = useState(false)

  const switchChain = useCallback(
    async ({ chainId }: { chainId: number }) => {
      setIsPending(true)
      try {
        await switchActiveWalletChain(resolveChain(chainId))
      } finally {
        setIsPending(false)
      }
    },
    [switchActiveWalletChain],
  )

  return {
    switchChain,
    isPending,
  }
}

export function useBalance({
  address,
  chainId,
  query,
}: {
  address?: `0x${string}`
  chainId?: number
  query?: QueryConfig
}) {
  const enabled = query?.enabled ?? !!address

  const result = useQuery({
    queryKey: ['somnia-native-balance', address?.toLowerCase(), chainId ?? SOMNIA_TESTNET.id],
    queryFn: async () => {
      if (!address) {
        throw new Error('Wallet address is required')
      }

      const value = await somniaPublicClient.getBalance({ address })
      const decimals = SOMNIA_TESTNET.nativeCurrency.decimals
      const symbol = SOMNIA_TESTNET.nativeCurrency.symbol

      return {
        value,
        decimals,
        symbol,
        formatted: formatUnits(value, decimals),
      }
    },
    enabled,
    refetchInterval: query?.refetchInterval,
    retry: query?.retry,
  })

  return {
    ...result,
    data: result.data,
    isPending: result.isLoading,
  }
}

export function useReadContract(config: ReadContractInput) {
  const enabled = config.query?.enabled ?? true

  const result = useQuery({
    queryKey: [
      'somnia-read-contract',
      config.address.toLowerCase(),
      config.functionName,
      serializeQueryValue(config.args ?? []),
    ],
    queryFn: async () =>
      somniaPublicClient.readContract({
        address: config.address,
        abi: config.abi as Abi,
        functionName: config.functionName as never,
        args: (config.args ?? []) as readonly never[],
      }),
    enabled,
    refetchInterval: config.query?.refetchInterval,
    retry: config.query?.retry,
  })

  return {
    ...result,
    isPending: result.isLoading,
  }
}

export function useWriteContract() {
  const transaction = useSendTransaction()
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const [localError, setLocalError] = useState<Error | null>(null)

  const writeContract = useCallback(
    (config: WriteContractInput) => {
      setLocalError(null)

      try {
        const contract = getContract({
          client: thirdwebClient,
          chain: somniaTestnet,
          address: config.address,
          abi: config.abi as Abi,
        })

        const prepared = prepareContractCall({
          contract,
          method: resolveMethod(config.abi, config.functionName),
          params: (config.args ?? []) as readonly unknown[],
          ...(typeof config.value === 'bigint' ? { value: config.value } : {}),
        })

        transaction.mutate(prepared, {
          onSuccess: (result) => {
            setHash(result.transactionHash as `0x${string}`)
          },
        })
      } catch (error) {
        setLocalError(
          error instanceof Error ? error : new Error('Failed to prepare transaction'),
        )
      }
    },
    [transaction],
  )

  return {
    writeContract,
    data: hash,
    isPending: transaction.isPending,
    error: localError ?? (transaction.error as Error | null),
  }
}

export function useWaitForTransactionReceipt({
  hash,
}: {
  hash?: `0x${string}`
}) {
  const receipt = useWaitForReceipt(
    hash
      ? {
          client: thirdwebClient,
          chain: somniaTestnet,
          transactionHash: hash,
          queryOptions: {
            enabled: !!hash,
          },
        }
      : undefined,
  )

  return {
    ...receipt,
    isLoading: receipt.isLoading,
  }
}
