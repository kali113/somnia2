'use client'

import { createWalletClient, custom, encodePacked, keccak256, type Address } from 'viem'
import type { ChestOpenResult } from '@/lib/game/engine'
import { SOMNIA_TESTNET } from './config'
import { PIXEL_ROYALE_ADDRESS, pixelRoyaleAbi, pixelRoyaleConfigured } from './contract'

const CHEST_TYPE_CODE: Record<ChestOpenResult['chestType'], number> = {
  normal: 0,
  rare: 1,
}

const REWARD_TYPE_CODE: Record<ChestOpenResult['rewardType'], number> = {
  weapon: 0,
  consumable: 1,
  ammo: 2,
}

interface ChestLogResponse {
  txHash: string | null
  reason?: string
}

function toBytes32FromString(value: string): `0x${string}` {
  return keccak256(encodePacked(['string'], [value]))
}

export async function logChestOpenOnChain(result: ChestOpenResult): Promise<ChestLogResponse> {
  if (!pixelRoyaleConfigured) {
    return { txHash: null, reason: 'contract_not_configured' }
  }

  const ethereum = (window as any).ethereum
  if (!ethereum) {
    return { txHash: null, reason: 'wallet_unavailable' }
  }

  const chainIdHex = `0x${SOMNIA_TESTNET.id.toString(16)}`
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    })
  } catch {
    return { txHash: null, reason: 'chain_switch_failed' }
  }

  const walletClient = createWalletClient({
    chain: SOMNIA_TESTNET as any,
    transport: custom(ethereum),
  })

  const addresses = await walletClient.getAddresses()
  const account = addresses[0] as Address | undefined
  if (!account) {
    return { txHash: null, reason: 'wallet_not_connected' }
  }

  const chestKey = toBytes32FromString(`${result.mapSeed}:${result.chestId}`)
  const rewardKey = toBytes32FromString(result.rewardId)
  const clampedAmount = Math.max(0, Math.min(65535, Math.floor(result.rewardAmount)))

  try {
    const txHash = await walletClient.writeContract({
      address: PIXEL_ROYALE_ADDRESS,
      abi: pixelRoyaleAbi,
      functionName: 'recordChestOpen',
      chain: SOMNIA_TESTNET as any,
      account,
      args: [
        BigInt(result.mapSeed),
        chestKey,
        CHEST_TYPE_CODE[result.chestType],
        BigInt(result.roll),
        REWARD_TYPE_CODE[result.rewardType],
        rewardKey,
        BigInt(clampedAmount),
      ],
    })
    return { txHash }
  } catch {
    return { txHash: null, reason: 'tx_failed' }
  }
}
