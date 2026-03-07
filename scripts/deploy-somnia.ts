import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import dotenv from 'dotenv'
import solc from 'solc'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeDeployData,
  http,
  isAddress,
  keccak256,
  toBytes,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

dotenv.config({ path: '.env', quiet: true })
dotenv.config({ path: '.env.local', override: true, quiet: true })

const somniaShannon = defineChain({
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: {
    name: 'Somnia Test Token',
    symbol: 'STT',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://dream-rpc.somnia.network'],
      webSocket: ['wss://dream-rpc.somnia.network/ws'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Somnia Shannon Explorer',
      url: 'https://shannon-explorer.somnia.network/',
    },
  },
  testnet: true,
})

function requirePrivateKey(): `0x${string}` {
  const key = (
    process.env.SOMNIA_DEPLOYER_PRIVATE_KEY ||
    process.env.DEPLOYER_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    ''
  ).trim()

  if (!/^0x[a-fA-F0-9]{64}$/u.test(key)) {
    throw new Error('Missing deployer key. Set SOMNIA_DEPLOYER_PRIVATE_KEY (0x-prefixed, 64 hex chars).')
  }

  return key as `0x${string}`
}

function getOrchestratorAddress(fallbackAddress: `0x${string}`): `0x${string}` {
  const orchestrator = (process.env.SOMNIA_ORCHESTRATOR_ADDRESS || '').trim()

  if (!orchestrator) {
    return fallbackAddress
  }

  if (!isAddress(orchestrator) || orchestrator.toLowerCase() === ZERO_ADDRESS) {
    throw new Error('SOMNIA_ORCHESTRATOR_ADDRESS is invalid.')
  }

  return orchestrator
}

async function compilePixelRoyale(projectRoot: string): Promise<{ abi: unknown[]; bytecode: `0x${string}` }> {
  const contractPath = path.join(projectRoot, 'contracts', 'PixelRoyale.sol')
  const source = await readFile(contractPath, 'utf8')

  const input = {
    language: 'Solidity',
    sources: {
      'PixelRoyale.sol': { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object'],
        },
      },
    },
  }

  const compile = solc.compile as (source: string) => string
  const output = JSON.parse(compile(JSON.stringify(input))) as {
    errors?: Array<{ severity?: string; formattedMessage?: string; message?: string }>
    contracts?: Record<string, Record<string, { abi?: unknown[]; evm?: { bytecode?: { object?: string } } }>>
  }

  if (Array.isArray(output.errors) && output.errors.length > 0) {
    const fatal = output.errors.filter((error) => error.severity === 'error')
    if (fatal.length > 0) {
      const message = fatal.map((error) => error.formattedMessage || error.message || 'Unknown Solidity error').join('\n')
      throw new Error(`Solidity compile failed:\n${message}`)
    }
  }

  const contract = output.contracts?.['PixelRoyale.sol']?.PixelRoyale
  if (!contract?.evm?.bytecode?.object || !contract.abi) {
    throw new Error('Could not find compiled PixelRoyale bytecode.')
  }

  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
  }
}

async function compileReactivityHandler(projectRoot: string): Promise<{ abi: unknown[]; bytecode: `0x${string}` }> {
  const contractsDir = path.join(projectRoot, 'contracts')

  // Read all source files needed
  const handlerSource = await readFile(path.join(contractsDir, 'PixelRoyaleReactivityHandler.sol'), 'utf8')
  const eventHandlerSource = await readFile(path.join(contractsDir, 'somnia-reactivity', 'SomniaEventHandler.sol'), 'utf8')

  const input = {
    language: 'Solidity',
    sources: {
      'PixelRoyaleReactivityHandler.sol': { content: handlerSource },
      'somnia-reactivity/SomniaEventHandler.sol': { content: eventHandlerSource },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object'],
        },
      },
    },
  }

  const compile = solc.compile as (source: string) => string
  const output = JSON.parse(compile(JSON.stringify(input))) as {
    errors?: Array<{ severity?: string; formattedMessage?: string; message?: string }>
    contracts?: Record<string, Record<string, { abi?: unknown[]; evm?: { bytecode?: { object?: string } } }>>
  }

  if (Array.isArray(output.errors) && output.errors.length > 0) {
    const fatal = output.errors.filter((error) => error.severity === 'error')
    if (fatal.length > 0) {
      const message = fatal.map((error) => error.formattedMessage || error.message || 'Unknown Solidity error').join('\n')
      throw new Error(`Reactivity handler compile failed:\n${message}`)
    }
  }

  const contract = output.contracts?.['PixelRoyaleReactivityHandler.sol']?.PixelRoyaleReactivityHandler
  if (!contract?.evm?.bytecode?.object || !contract.abi) {
    throw new Error('Could not find compiled PixelRoyaleReactivityHandler bytecode.')
  }

  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
  }
}

async function main(): Promise<void> {
  const projectRoot = process.cwd()
  const rpcUrl = (process.env.SOMNIA_RPC_URL || 'https://rpc.ankr.com/somnia_testnet').trim()
  const privateKey = requirePrivateKey()
  const account = privateKeyToAccount(privateKey)
  const orchestratorAddress = getOrchestratorAddress(account.address)

  const publicClient = createPublicClient({
    chain: somniaShannon,
    transport: http(rpcUrl),
  })

  const walletClient = createWalletClient({
    account,
    chain: somniaShannon,
    transport: http(rpcUrl),
  })

  const balance = await publicClient.getBalance({ address: account.address })
  if (balance === 0n) {
    throw new Error(`Deployer ${account.address} has 0 STT. Fund it from faucet first: https://cloud.google.com/application/web3/faucet/somnia/shannon`)
  }

  const { abi, bytecode } = await compilePixelRoyale(projectRoot)

  const nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: 'pending',
  })

  const suggestedGasPrice = await publicClient.getGasPrice()
  const gasPrice = (suggestedGasPrice * 12n) / 10n

  const deploymentData = encodeDeployData({
    abi,
    bytecode,
    args: [orchestratorAddress],
  })

  const estimatedGas = await publicClient.estimateGas({
    account: account.address,
    data: deploymentData,
  })
  const gas = (estimatedGas * 12n) / 10n

  console.log('Deploying PixelRoyale...')
  console.log(`Deployer: ${account.address}`)
  console.log(`Orchestrator: ${orchestratorAddress}`)
  console.log(`RPC: ${rpcUrl}`)
  console.log(`Nonce: ${nonce}`)
  console.log(`GasPrice: ${gasPrice}`)
  console.log(`GasLimit: ${gas}`)

  const hash = await walletClient.deployContract({
    abi,
    bytecode,
    args: [orchestratorAddress],
    nonce,
    gasPrice,
    gas,
    account,
    chain: somniaShannon,
  })

  console.log(`Deployment tx: ${hash}`)
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: 900_000,
    pollingInterval: 2_000,
  })

  if (!receipt.contractAddress) {
    throw new Error('Deployment mined but no contract address returned.')
  }

  const contractAddress = receipt.contractAddress
  console.log(`Contract deployed at: ${contractAddress}`)
  console.log(`Explorer: https://shannon-explorer.somnia.network/address/${contractAddress}`)

  const abiPath = path.join(projectRoot, 'contracts', 'abi.json')
  await writeFile(abiPath, `${JSON.stringify(abi, null, 2)}\n`, 'utf8')

  const deploymentsDir = path.join(projectRoot, 'contracts', 'deployments')
  await mkdir(deploymentsDir, { recursive: true })
  const deploymentPath = path.join(deploymentsDir, 'somnia-shannon-50312.json')
  await writeFile(
    deploymentPath,
    `${JSON.stringify({
      chainId: 50312,
      chainName: 'Somnia Testnet',
      rpcUrl,
      deployer: account.address,
      orchestrator: orchestratorAddress,
      contract: {
        name: 'PixelRoyale',
        address: contractAddress,
        txHash: hash,
        deployedAtBlock: Number(receipt.blockNumber),
      },
      deployedAt: new Date().toISOString(),
    }, null, 2)}\n`,
    'utf8',
  )

  console.log('\nSet these env values now:')
  console.log(`NEXT_PUBLIC_PIXEL_ROYALE_ADDRESS=${contractAddress}`)
  console.log(`GAME_CONTRACT_ADDRESS=${contractAddress}`)

  // ── Deploy Reactivity Handler ───────────────────────────────────────
  console.log('\nCompiling PixelRoyaleReactivityHandler...')
  const handler = await compileReactivityHandler(projectRoot)

  const handlerNonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: 'pending',
  })

  const handlerDeployData = encodeDeployData({
    abi: handler.abi,
    bytecode: handler.bytecode,
    args: [contractAddress], // pass PixelRoyale contract address
  })

  const handlerGas = await publicClient.estimateGas({
    account: account.address,
    data: handlerDeployData,
  })

  console.log('Deploying PixelRoyaleReactivityHandler...')
  const handlerHash = await walletClient.deployContract({
    abi: handler.abi,
    bytecode: handler.bytecode,
    args: [contractAddress],
    nonce: handlerNonce,
    gasPrice,
    gas: (handlerGas * 12n) / 10n,
    account,
    chain: somniaShannon,
  })

  console.log(`Handler deployment tx: ${handlerHash}`)
  const handlerReceipt = await publicClient.waitForTransactionReceipt({
    hash: handlerHash,
    timeout: 900_000,
    pollingInterval: 2_000,
  })

  if (!handlerReceipt.contractAddress) {
    throw new Error('Handler deployment mined but no contract address returned.')
  }

  const handlerAddress = handlerReceipt.contractAddress
  console.log(`Handler deployed at: ${handlerAddress}`)

  // ── Create on-chain reactivity subscriptions via precompile ──────────
  console.log('\nCreating on-chain reactivity subscriptions...')

  const REACTIVITY_PRECOMPILE = '0x0000000000000000000000000000000000000100' as const

  // Minimal ABI for the precompile subscribe() function
  const precompileAbi = [
    {
      type: 'function',
      name: 'subscribe',
      inputs: [
        {
          name: 'subscriptionData',
          type: 'tuple',
          components: [
            { name: 'eventTopics', type: 'bytes32[4]' },
            { name: 'origin', type: 'address' },
            { name: 'caller', type: 'address' },
            { name: 'emitter', type: 'address' },
            { name: 'handlerContractAddress', type: 'address' },
            { name: 'handlerFunctionSelector', type: 'bytes4' },
            { name: 'priorityFeePerGas', type: 'uint64' },
            { name: 'maxFeePerGas', type: 'uint64' },
            { name: 'gasLimit', type: 'uint64' },
            { name: 'isGuaranteed', type: 'bool' },
            { name: 'isCoalesced', type: 'bool' },
          ],
        },
      ],
      outputs: [{ name: 'subscriptionId', type: 'uint256' }],
      stateMutability: 'nonpayable',
    },
  ] as const

  const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`
  const DEFAULT_HANDLER_SELECTOR = '0x00000000' as `0x${string}`

  // GameStarted topic
  const gameStartedTopic = keccak256(toBytes('GameStarted(uint256,address[],uint256)'))
  // GameEnded topic
  const gameEndedTopic = keccak256(toBytes('GameEnded(uint256,address,address[],uint256)'))

  // Helper to create a subscription via the precompile
  async function createSubscription(eventTopic: `0x${string}`, label: string): Promise<void> {
    const subNonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: 'pending',
    })

    const subHash = await walletClient.writeContract({
      address: REACTIVITY_PRECOMPILE,
      abi: precompileAbi,
      functionName: 'subscribe',
      args: [
        {
          eventTopics: [eventTopic, ZERO_BYTES32, ZERO_BYTES32, ZERO_BYTES32],
          origin: ZERO_ADDRESS as `0x${string}`,
          caller: ZERO_ADDRESS as `0x${string}`,
          emitter: contractAddress,
          handlerContractAddress: handlerAddress,
          handlerFunctionSelector: DEFAULT_HANDLER_SELECTOR,
          priorityFeePerGas: 2_000_000_000n, // 2 gwei in nanoSomi
          maxFeePerGas: 10_000_000_000n, // 10 gwei in nanoSomi
          gasLimit: 3_000_000n,
          isGuaranteed: true,
          isCoalesced: false,
        },
      ],
      nonce: subNonce,
      gasPrice,
      gas: 500_000n,
      account,
      chain: somniaShannon,
    })

    console.log(`${label} subscription tx: ${subHash}`)
    const subReceipt = await publicClient.waitForTransactionReceipt({
      hash: subHash,
      timeout: 300_000,
      pollingInterval: 2_000,
    })
    console.log(`${label} subscription confirmed in block ${subReceipt.blockNumber}`)
  }

  await createSubscription(gameStartedTopic, 'GameStarted')
  await createSubscription(gameEndedTopic, 'GameEnded')

  // Update deployment file with handler info
  const deploymentPath2 = path.join(deploymentsDir, 'somnia-shannon-50312.json')
  const existingDeployment = JSON.parse(await readFile(deploymentPath2, 'utf8')) as Record<string, unknown>
  existingDeployment.reactivityHandler = {
    name: 'PixelRoyaleReactivityHandler',
    address: handlerAddress,
    txHash: handlerHash,
    deployedAtBlock: Number(handlerReceipt.blockNumber),
  }
  await writeFile(deploymentPath2, `${JSON.stringify(existingDeployment, null, 2)}\n`, 'utf8')

  console.log('\nReactivity handler deployment complete!')
  console.log(`Handler: ${handlerAddress}`)
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error('\nDeploy failed:')
  console.error(message)
  process.exit(1)
})
