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
  return await compileContract(projectRoot, {
    entrySource: 'PixelRoyale.sol',
    contractName: 'PixelRoyale',
    sources: [
      'PixelRoyale.sol',
    ],
  })
}

async function compileReactivityHandler(projectRoot: string): Promise<{ abi: unknown[]; bytecode: `0x${string}` }> {
  return await compileContract(projectRoot, {
    entrySource: 'PixelRoyaleReactivityHandler.sol',
    contractName: 'PixelRoyaleReactivityHandler',
    sources: [
      'PixelRoyaleReactivityHandler.sol',
      'somnia-reactivity/SomniaEventHandler.sol',
    ],
  })
}

async function compileReactiveOrchestrator(projectRoot: string): Promise<{ abi: unknown[]; bytecode: `0x${string}` }> {
  return await compileContract(projectRoot, {
    entrySource: 'PixelRoyaleReactiveOrchestrator.sol',
    contractName: 'PixelRoyaleReactiveOrchestrator',
    sources: [
      'PixelRoyaleReactiveOrchestrator.sol',
      'somnia-reactivity/SomniaEventHandler.sol',
    ],
  })
}

async function compileReactiveRewards(projectRoot: string): Promise<{ abi: unknown[]; bytecode: `0x${string}` }> {
  return await compileContract(projectRoot, {
    entrySource: 'PixelRoyaleReactiveRewards.sol',
    contractName: 'PixelRoyaleReactiveRewards',
    sources: [
      'PixelRoyaleReactiveRewards.sol',
      'somnia-reactivity/SomniaEventHandler.sol',
    ],
  })
}

async function compileLeaderboard(projectRoot: string): Promise<{ abi: unknown[]; bytecode: `0x${string}` }> {
  return await compileContract(projectRoot, {
    entrySource: 'PixelRoyaleLeaderboard.sol',
    contractName: 'PixelRoyaleLeaderboard',
    sources: [
      'PixelRoyaleLeaderboard.sol',
      'somnia-reactivity/SomniaEventHandler.sol',
    ],
  })
}

async function compileContract(
  projectRoot: string,
  options: {
    entrySource: string
    contractName: string
    sources: string[]
  },
): Promise<{ abi: unknown[]; bytecode: `0x${string}` }> {
  const contractsDir = path.join(projectRoot, 'contracts')
  const sources = await Promise.all(options.sources.map(async (sourcePath) => {
    const content = await readFile(path.join(contractsDir, sourcePath), 'utf8')
    return [sourcePath, { content }] as const
  }))

  const input = {
    language: 'Solidity',
    sources: Object.fromEntries(sources),
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
      throw new Error(`${options.contractName} compile failed:\n${message}`)
    }
  }

  const contract = output.contracts?.[options.entrySource]?.[options.contractName]
  if (!contract?.evm?.bytecode?.object || !contract.abi) {
    throw new Error(`Could not find compiled ${options.contractName} bytecode.`)
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
  const initialOrchestratorAddress = getOrchestratorAddress(account.address)

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

  const [pixelRoyaleArtifact, handlerArtifact, orchestratorArtifact, rewardsArtifact, leaderboardArtifact] = await Promise.all([
    compilePixelRoyale(projectRoot),
    compileReactivityHandler(projectRoot),
    compileReactiveOrchestrator(projectRoot),
    compileReactiveRewards(projectRoot),
    compileLeaderboard(projectRoot),
  ])

  const suggestedGasPrice = await publicClient.getGasPrice()
  const gasPrice = (suggestedGasPrice * 12n) / 10n

  async function deployCompiledContract(
    label: string,
    artifact: { abi: unknown[]; bytecode: `0x${string}` },
    args: readonly unknown[],
  ): Promise<{ address: `0x${string}`; txHash: `0x${string}`; blockNumber: number }> {
    const nonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: 'pending',
    })

    const deploymentData = encodeDeployData({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      args,
    })

    const estimatedGas = await publicClient.estimateGas({
      account: account.address,
      data: deploymentData,
    })

    const gas = (estimatedGas * 12n) / 10n

    console.log(`Deploying ${label}...`)
    console.log(`Nonce: ${nonce}`)
    console.log(`GasPrice: ${gasPrice}`)
    console.log(`GasLimit: ${gas}`)

    const txHash = await walletClient.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      args,
      nonce,
      gasPrice,
      gas,
      account,
      chain: somniaShannon,
    })

    console.log(`${label} deployment tx: ${txHash}`)
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 900_000,
      pollingInterval: 2_000,
    })

    if (!receipt.contractAddress) {
      throw new Error(`${label} deployment mined but no contract address returned.`)
    }

    console.log(`${label} deployed at: ${receipt.contractAddress}`)

    return {
      address: receipt.contractAddress,
      txHash,
      blockNumber: Number(receipt.blockNumber),
    }
  }

  console.log('Deploying PixelRoyale reactive suite...')
  console.log(`Deployer: ${account.address}`)
  console.log(`Initial orchestrator: ${initialOrchestratorAddress}`)
  console.log(`RPC: ${rpcUrl}`)

  const pixelRoyaleDeployment = await deployCompiledContract(
    'PixelRoyale',
    pixelRoyaleArtifact,
    [initialOrchestratorAddress],
  )

  const contractAddress = pixelRoyaleDeployment.address
  console.log(`Contract deployed at: ${contractAddress}`)
  console.log(`Explorer: https://shannon-explorer.somnia.network/address/${contractAddress}`)

  const abiPath = path.join(projectRoot, 'contracts', 'abi.json')
  await writeFile(abiPath, `${JSON.stringify(pixelRoyaleArtifact.abi, null, 2)}\n`, 'utf8')

  const baseHandlerDeployment = await deployCompiledContract(
    'PixelRoyaleReactivityHandler',
    handlerArtifact,
    [contractAddress],
  )

  const reactiveOrchestratorDeployment = await deployCompiledContract(
    'PixelRoyaleReactiveOrchestrator',
    orchestratorArtifact,
    [contractAddress],
  )

  const reactiveRewardsDeployment = await deployCompiledContract(
    'PixelRoyaleReactiveRewards',
    rewardsArtifact,
    [contractAddress],
  )

  const leaderboardDeployment = await deployCompiledContract(
    'PixelRoyaleLeaderboard',
    leaderboardArtifact,
    [contractAddress],
  )

  const setOrchestratorAbi = [
    {
      type: 'function',
      name: 'setOrchestrator',
      inputs: [{ name: '_orch', type: 'address' }],
      outputs: [],
      stateMutability: 'nonpayable',
    },
  ] as const

  const setOrchestratorTx = await walletClient.writeContract({
    address: contractAddress,
    abi: setOrchestratorAbi,
    functionName: 'setOrchestrator',
    args: [reactiveOrchestratorDeployment.address],
    account,
    chain: somniaShannon,
    gasPrice,
  })

  await publicClient.waitForTransactionReceipt({
    hash: setOrchestratorTx,
    timeout: 300_000,
    pollingInterval: 2_000,
  })

  console.log(`Reactive orchestrator activated: ${reactiveOrchestratorDeployment.address}`)

  const deploymentsDir = path.join(projectRoot, 'contracts', 'deployments')
  await mkdir(deploymentsDir, { recursive: true })
  const deploymentPath = path.join(deploymentsDir, 'somnia-shannon-50312.json')
  const deploymentPayload = {
    chainId: 50312,
    chainName: 'Somnia Testnet',
    rpcUrl,
    deployer: account.address,
    initialOrchestrator: initialOrchestratorAddress,
    orchestrator: reactiveOrchestratorDeployment.address,
    contract: {
      name: 'PixelRoyale',
      address: contractAddress,
      txHash: pixelRoyaleDeployment.txHash,
      deployedAtBlock: pixelRoyaleDeployment.blockNumber,
    },
    reactivityHandler: {
      name: 'PixelRoyaleReactivityHandler',
      address: baseHandlerDeployment.address,
      txHash: baseHandlerDeployment.txHash,
      deployedAtBlock: baseHandlerDeployment.blockNumber,
    },
    reactiveOrchestrator: {
      name: 'PixelRoyaleReactiveOrchestrator',
      address: reactiveOrchestratorDeployment.address,
      txHash: reactiveOrchestratorDeployment.txHash,
      deployedAtBlock: reactiveOrchestratorDeployment.blockNumber,
      activatedByTxHash: setOrchestratorTx,
    },
    reactiveRewards: {
      name: 'PixelRoyaleReactiveRewards',
      address: reactiveRewardsDeployment.address,
      txHash: reactiveRewardsDeployment.txHash,
      deployedAtBlock: reactiveRewardsDeployment.blockNumber,
    },
    leaderboard: {
      name: 'PixelRoyaleLeaderboard',
      address: leaderboardDeployment.address,
      txHash: leaderboardDeployment.txHash,
      deployedAtBlock: leaderboardDeployment.blockNumber,
    },
    deployedAt: new Date().toISOString(),
  } as Record<string, unknown>

  await writeFile(deploymentPath, `${JSON.stringify(deploymentPayload, null, 2)}\n`, 'utf8')

  console.log('\nSet these env values now:')
  console.log(`NEXT_PUBLIC_PIXEL_ROYALE_ADDRESS=${contractAddress}`)
  console.log(`GAME_CONTRACT_ADDRESS=${contractAddress}`)

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

  const gameStartedTopic = keccak256(toBytes('GameStarted(uint256,address[],uint256)'))
  const gameEndedTopic = keccak256(toBytes('GameEnded(uint256,address,address[],uint256)'))
  const playerJoinedTopic = keccak256(toBytes('PlayerJoinedQueue(address,uint256)'))

  // Helper to create a subscription via the precompile
  async function createSubscription(
    eventTopic: `0x${string}`,
    handlerAddress: `0x${string}`,
    label: string,
  ): Promise<`0x${string}`> {
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
    return subHash
  }

  const subscriptions = {
    gameStartedMirror: await createSubscription(gameStartedTopic, baseHandlerDeployment.address, 'GameStarted -> base handler'),
    gameEndedMirror: await createSubscription(gameEndedTopic, baseHandlerDeployment.address, 'GameEnded -> base handler'),
    matchmaking: await createSubscription(playerJoinedTopic, reactiveOrchestratorDeployment.address, 'PlayerJoinedQueue -> reactive orchestrator'),
    rewards: await createSubscription(gameEndedTopic, reactiveRewardsDeployment.address, 'GameEnded -> reactive rewards'),
    leaderboard: await createSubscription(gameEndedTopic, leaderboardDeployment.address, 'GameEnded -> leaderboard'),
  }

  deploymentPayload.subscriptions = subscriptions
  await writeFile(deploymentPath, `${JSON.stringify(deploymentPayload, null, 2)}\n`, 'utf8')

  console.log('\nReactive suite deployment complete!')
  console.log(`Base handler: ${baseHandlerDeployment.address}`)
  console.log(`Reactive orchestrator: ${reactiveOrchestratorDeployment.address}`)
  console.log(`Reactive rewards: ${reactiveRewardsDeployment.address}`)
  console.log(`Leaderboard: ${leaderboardDeployment.address}`)
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error('\nDeploy failed:')
  console.error(message)
  process.exit(1)
})
