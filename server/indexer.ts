import { type PublicClient, type Address, parseAbiItem } from 'viem'
import { GameStore, type StoredGameResult } from './store.js'

/**
 * Listens for on-chain events from the PixelRoyale contract
 * and indexes them into the in-memory store.
 */
export class Indexer {
  private client: PublicClient
  private contractAddress: Address
  private store: GameStore
  private onEvent: (event: any) => void
  private polling: ReturnType<typeof setInterval> | null = null

  constructor(
    client: PublicClient,
    contractAddress: Address,
    store: GameStore,
    onEvent: (event: any) => void
  ) {
    this.client = client
    this.contractAddress = contractAddress
    this.store = store
    this.onEvent = onEvent
  }

  async start() {
    console.log('[indexer] Starting event indexer...')
    console.log(`[indexer] Watching contract: ${this.contractAddress}`)

    // Skip if placeholder address
    if (this.contractAddress === '0x0000000000000000000000000000000000000000') {
      console.log('[indexer] Placeholder contract address — running in demo mode')
      return
    }

    // Poll for events every 5 seconds (Somnia has fast blocks)
    let lastBlock = 0n
    try {
      lastBlock = await this.client.getBlockNumber()
      console.log(`[indexer] Starting from block ${lastBlock}`)
    } catch (e) {
      console.warn('[indexer] Could not get block number, starting from 0')
    }

    this.polling = setInterval(async () => {
      try {
        const currentBlock = await this.client.getBlockNumber()
        if (currentBlock <= lastBlock) return

        // Fetch logs for our contract
        const logs = await this.client.getLogs({
          address: this.contractAddress,
          fromBlock: lastBlock + 1n,
          toBlock: currentBlock,
        })

        for (const log of logs) {
          this.processLog(log)
        }

        lastBlock = currentBlock
      } catch (e) {
        // Silently retry on network errors
      }
    }, 5000)
  }

  stop() {
    if (this.polling) {
      clearInterval(this.polling)
      this.polling = null
    }
  }

  private processLog(log: any) {
    // Event topic hashes (first topic is the event signature)
    // These would be the actual keccak256 hashes of the event signatures
    const topic0 = log.topics?.[0]

    // For now we emit a generic event — in production you'd decode
    // each event type and update the store accordingly
    this.onEvent({
      type: 'contract_event',
      blockNumber: Number(log.blockNumber),
      transactionHash: log.transactionHash,
      topic: topic0,
      data: log.data,
    })
  }
}
