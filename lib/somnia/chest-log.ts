'use client'

import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  encodePacked,
  http,
  keccak256,
  type Address,
} from 'viem'
import type { ContainerRewardBundle, ContainerVerificationRequest } from '@/lib/game/engine'
import type { ConsumableId, ContainerType, Rarity } from '@/lib/game/constants'
import { SOMNIA_RPC_URL, SOMNIA_TESTNET } from './config'
import { PIXEL_ROYALE_ADDRESS, pixelRoyaleAbi, IS_PIXEL_ROYALE_CONFIGURED } from './contract'

const CONTAINER_TYPE_CODE: Record<ContainerType, number> = {
  chest: 0,
  rare_chest: 1,
  ammo_box: 2,
}

const CONTAINER_CODE_TO_TYPE: Record<number, ContainerType> = {
  0: 'chest',
  1: 'rare_chest',
  2: 'ammo_box',
}

const WEAPON_CODE_TO_ID: Record<number, string | null> = {
  0: null,
  1: 'ar',
  2: 'shotgun',
  3: 'smg',
  4: 'sniper',
}

const RARITY_CODE_TO_ID: Record<number, Rarity | null> = {
  0: null,
  1: 'common',
  2: 'uncommon',
  3: 'rare',
  4: 'epic',
  5: 'legendary',
}

const CONSUMABLE_CODE_TO_ID: Record<number, ConsumableId | null> = {
  0: null,
  1: 'bandage',
  2: 'mini_shield',
  3: 'shield_potion',
  4: 'medkit',
}

interface ContainerVerifyResponse {
  txHash: string | null
  reward?: ContainerRewardBundle
  reason?: string
}

function toBytes32FromString(value: string): `0x${string}` {
  return keccak256(encodePacked(['string'], [value]))
}

function decodeContainerOpenedEvent(
  request: ContainerVerificationRequest,
  txHash: string,
  logs: Array<{ data: `0x${string}`; topics: `0x${string}`[] }>,
): ContainerRewardBundle | null {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: pixelRoyaleAbi,
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName !== 'ContainerOpened') continue

      const args = decoded.args as Record<string, unknown>
      const containerTypeCode = Number(args.containerType ?? CONTAINER_TYPE_CODE[request.containerType])
      const weaponCode = Number(args.weaponCode ?? 0)
      const rarityCode = Number(args.weaponRarity ?? 0)
      const consumableCode = Number(args.consumableCode ?? 0)

      return {
        mapSeed: request.mapSeed,
        containerId: Number(args.containerId ?? request.containerId),
        containerType: CONTAINER_CODE_TO_TYPE[containerTypeCode] ?? request.containerType,
        roll: Number(args.roll ?? 0),
        weaponId: WEAPON_CODE_TO_ID[weaponCode] ?? null,
        weaponRarity: RARITY_CODE_TO_ID[rarityCode] ?? null,
        ammoAmount: Number(args.ammoAmount ?? 0),
        ammoWeaponId: WEAPON_CODE_TO_ID[Number(args.ammoWeaponCode ?? 0)] ?? null,
        consumableId: CONSUMABLE_CODE_TO_ID[consumableCode] ?? null,
        consumableAmount: Number(args.consumableAmount ?? 0),
        materials: {
          wood: Number(args.woodAmount ?? 0),
          stone: Number(args.stoneAmount ?? 0),
          metal: Number(args.metalAmount ?? 0),
        },
        verified: true,
      }
    } catch {
      // Ignore non-decodable logs.
    }
  }

  // No event means we cannot safely apply loot.
  console.warn(`[container] tx ${txHash} had no ContainerOpened event`)
  return null
}

export async function openContainerVerifiedOnChain(
  request: ContainerVerificationRequest,
): Promise<ContainerVerifyResponse> {
  if (!IS_PIXEL_ROYALE_CONFIGURED) {
    return { txHash: null, reason: 'contract_not_configured' }
  }

  const containerKey = toBytes32FromString(`${request.mapSeed}:${request.containerId}:${request.containerType}`)
  const publicClient = createPublicClient({
    chain: SOMNIA_TESTNET as any,
    transport: http(SOMNIA_RPC_URL),
  })

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

  try {
    const txHash = await walletClient.writeContract({
      address: PIXEL_ROYALE_ADDRESS,
      abi: pixelRoyaleAbi,
      functionName: 'openContainerVerified',
      chain: SOMNIA_TESTNET as any,
      account,
      args: [
        BigInt(request.gameId),
        BigInt(request.containerId),
        containerKey,
        CONTAINER_TYPE_CODE[request.containerType],
        request.seed,
        request.playerNonce,
      ],
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 90_000 })
    const reward = decodeContainerOpenedEvent(
      request,
      txHash,
      receipt.logs as Array<{ data: `0x${string}`; topics: `0x${string}`[] }>,
    )
    if (!reward) return { txHash, reason: 'event_missing' }
    return { txHash, reward }
  } catch {
    return { txHash: null, reason: 'tx_failed' }
  }
}
