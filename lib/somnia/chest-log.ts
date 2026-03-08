'use client'

import {
  createPublicClient,
  decodeEventLog,
  encodePacked,
  http,
  keccak256,
} from 'viem'
import type { ContainerRewardBundle, ContainerVerificationRequest } from '@/lib/game/engine'
import type { ConsumableId, ContainerType, Rarity } from '@/lib/game/constants'
import { SOMNIA_RPC_URL, SOMNIA_TESTNET } from './config'
import { PIXEL_ROYALE_ADDRESS, pixelRoyaleAbi, IS_PIXEL_ROYALE_CONFIGURED } from './contract'
import { getSessionWalletClient } from './session-wallet'

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

type DecodableLog = {
  data: `0x${string}`
  topics: [] | [`0x${string}`, ...`0x${string}`[]]
}

type DecodedContainerOpenedEvent = {
  eventName: string
  args: Record<string, unknown>
}

function toBytes32FromString(value: string): `0x${string}` {
  return keccak256(encodePacked(['string'], [value]))
}

function decodeContainerOpenedEvent(
  request: ContainerVerificationRequest,
  txHash: string,
  logs: DecodableLog[],
): ContainerRewardBundle | null {
  for (const log of logs) {
    try {
      const decoded: unknown = decodeEventLog({
        abi: pixelRoyaleAbi,
        data: log.data,
        topics: log.topics,
      })
      if (!isContainerOpenedEvent(decoded)) {continue}

      const args = decoded.args
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

function isContainerOpenedEvent(value: unknown): value is DecodedContainerOpenedEvent {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'eventName' in value &&
    'args' in value &&
    (value as { eventName?: unknown }).eventName === 'ContainerOpened' &&
    typeof (value as { args?: unknown }).args === 'object' &&
    (value as { args?: unknown }).args !== null,
  )
}

export async function openContainerVerifiedOnChain(
  request: ContainerVerificationRequest,
  playerAddress: `0x${string}`,
): Promise<ContainerVerifyResponse> {
  if (!IS_PIXEL_ROYALE_CONFIGURED) {
    return { txHash: null, reason: 'contract_not_configured' }
  }

  const containerKey = toBytes32FromString(`${request.mapSeed}:${request.containerId}:${request.containerType}`)
  const publicClient = createPublicClient({
    chain: SOMNIA_TESTNET,
    transport: http(SOMNIA_RPC_URL),
  })

  // Use session wallet for signing (no Phantom popup).
  // Pass extendIfExpiring=true so mid-game expiry doesn't block container opens.
  const walletClient = getSessionWalletClient(true)
  if (!walletClient) {
    return { txHash: null, reason: 'session_wallet_unavailable' }
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(playerAddress)) {
    return { txHash: null, reason: 'invalid_player_address' }
  }

  try {
    const txHash = await walletClient.writeContract({
      address: PIXEL_ROYALE_ADDRESS,
      abi: pixelRoyaleAbi,
      functionName: 'openContainerVerifiedForPlayer',
      chain: SOMNIA_TESTNET,
      args: [
        playerAddress,
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
      receipt.logs as DecodableLog[],
    )
    if (!reward) {return { txHash, reason: 'event_missing' }}
    return { txHash, reward }
  } catch {
    return { txHash: null, reason: 'tx_failed' }
  }
}
