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

  const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
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

async function main(): Promise<void> {
  const projectRoot = process.cwd()
  const rpcUrl = (process.env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network').trim()
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
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error('\nDeploy failed:')
  console.error(message)
  process.exit(1)
})
