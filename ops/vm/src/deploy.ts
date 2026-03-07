import { createWriteStream, existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import {
  durationSeconds,
  forceSymlink,
  formatReleaseTimestamp,
  getRequired,
  isoNow,
  parseEnvFile,
  readJsonFile,
  runCommand,
  writeJsonFile,
} from './shared'

interface DeployStatusPayload {
  status: string
  message: string
  targetCommit: string
  deployedCommit: string
  startedAt: string
  finishedAt: string
  durationSec: number
  releasePath: string
}

interface HistoryEntry {
  status: string
  commit: string
  message: string
  startedAt: string
  finishedAt: string
  durationSec: number
  commitSubject: string
  commitAuthor: string
  commitDate: string
  commitUrl: string
}

interface HistoryPayload {
  history: HistoryEntry[]
}

interface DeployContext {
  repoUrl: string
  branch: string
  deployRoot: string
  liveWebRoot: string
  statusRoot: string
  serverEnvSource: string
  keepReleases: number
  repoDir: string
  releasesDir: string
  currentLink: string
  lockDir: string
  logPath: string
  statusIndexPath: string
  statusJson: string
  historyJson: string
  ecosystemFile: string
}

const scriptRoot = path.resolve(__dirname, '..')

function resolveConfigFile(): string {
  const configured = (process.env.CONFIG_FILE || '').trim()
  if (configured) {
    return configured
  }

  const parentConfig = path.resolve(scriptRoot, '..', 'config.env')
  if (existsSync(parentConfig)) {
    return parentConfig
  }

  return path.resolve(scriptRoot, 'config.env')
}

function createContext(): DeployContext {
  const configFile = resolveConfigFile()
  if (!existsSync(configFile)) {
    throw new Error(`Missing config file: ${configFile}`)
  }

  const config = parseEnvFile(readFileSync(configFile, 'utf8'))
  const deployRoot = getRequired(config, 'DEPLOY_ROOT')
  const statusRoot = getRequired(config, 'STATUS_ROOT')
  getRequired(config, 'APP_NAME')

  return {
    repoUrl: getRequired(config, 'REPO_URL'),
    branch: getRequired(config, 'BRANCH'),
    deployRoot,
    liveWebRoot: getRequired(config, 'LIVE_WEB_ROOT'),
    statusRoot,
    serverEnvSource: getRequired(config, 'SERVER_ENV_SOURCE'),
    keepReleases: Number.parseInt(config.KEEP_RELEASES || process.env.KEEP_RELEASES || '3', 10) || 3,
    repoDir: path.join(deployRoot, 'repo'),
    releasesDir: path.join(deployRoot, 'releases'),
    currentLink: path.join(deployRoot, 'current'),
    lockDir: path.join(deployRoot, 'lock'),
    logPath: path.join(statusRoot, 'data', 'deploy.log'),
    statusIndexPath: path.join(statusRoot, 'index.html'),
    statusJson: path.join(statusRoot, 'data', 'status.json'),
    historyJson: path.join(statusRoot, 'data', 'history.json'),
    ecosystemFile: path.join(deployRoot, 'ecosystem.config.cjs'),
  }
}

async function writeStatus(context: DeployContext, payload: Omit<DeployStatusPayload, 'repoUrl' | 'branch' | 'logPath' | 'historyPath' | 'updatedAt'>): Promise<void> {
  await writeJsonFile(context.statusJson, {
    repoUrl: context.repoUrl,
    branch: context.branch,
    status: payload.status,
    message: payload.message,
    targetCommit: payload.targetCommit,
    deployedCommit: payload.deployedCommit,
    startedAt: payload.startedAt,
    finishedAt: payload.finishedAt,
    durationSec: payload.durationSec,
    releasePath: payload.releasePath,
    logPath: '/status/data/deploy.log',
    historyPath: '/status/data/history.json',
    updatedAt: isoNow(),
  })
}

async function appendHistory(context: DeployContext, entry: Omit<HistoryEntry, 'commitSubject' | 'commitAuthor' | 'commitDate' | 'commitUrl'>, logStream: NodeJS.WritableStream): Promise<void> {
  const commitMeta = entry.commit ? await readCommitMetadata(context, entry.commit, logStream) : null
  const existing = (await readJsonFile<HistoryPayload>(context.historyJson)) || { history: [] }

  const nextEntry: HistoryEntry = {
    ...entry,
    commitSubject: commitMeta?.subject || '',
    commitAuthor: commitMeta?.author || '',
    commitDate: commitMeta?.commitDate || '',
    commitUrl: commitMeta?.commitUrl || '',
  }

  await writeJsonFile(context.historyJson, {
    history: [nextEntry, ...(existing.history || [])].slice(0, 20),
  })
}

async function readCommitMetadata(context: DeployContext, commit: string, logStream: NodeJS.WritableStream): Promise<{ subject: string; author: string; commitDate: string; commitUrl: string } | null> {
  try {
    await runCommand('git', ['-C', context.repoDir, 'cat-file', '-e', `${commit}^{commit}`], { logStream, streamOutput: false })
    const subject = (await runCommand('git', ['-C', context.repoDir, 'show', '-s', '--format=%s', commit], { logStream, streamOutput: false })).stdout.trim()
    const author = (await runCommand('git', ['-C', context.repoDir, 'show', '-s', '--format=%an', commit], { logStream, streamOutput: false })).stdout.trim()
    const commitDate = (await runCommand('git', ['-C', context.repoDir, 'show', '-s', '--format=%cI', commit], { logStream, streamOutput: false })).stdout.trim()
    return {
      subject,
      author,
      commitDate,
      commitUrl: `${context.repoUrl.replace(/\.git$/u, '')}/commit/${commit}`,
    }
  } catch {
    return null
  }
}

async function removeRelease(context: DeployContext, releaseDir: string, logStream: NodeJS.WritableStream): Promise<void> {
  if (!releaseDir) {
    return
  }

  try {
    await runCommand('git', ['-C', context.repoDir, 'worktree', 'remove', releaseDir, '--force'], { logStream })
  } catch {
    await fs.rm(releaseDir, { recursive: true, force: true })
  }
}

async function pruneOldReleases(context: DeployContext, currentRelease: string, logStream: NodeJS.WritableStream): Promise<void> {
  const entries = await fs.readdir(context.releasesDir, { withFileTypes: true })
  const releasePaths = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(context.releasesDir, entry.name))
    .sort((left, right) => left.localeCompare(right))

  const oldReleases = releasePaths.slice(0, Math.max(0, releasePaths.length - context.keepReleases))
  for (const releasePath of oldReleases) {
    if (releasePath !== currentRelease) {
      await removeRelease(context, releasePath, logStream)
    }
  }
}

async function currentCommitFor(context: DeployContext, logStream: NodeJS.WritableStream): Promise<string> {
  if (!existsSync(path.join(context.currentLink, '.git'))) {
    return ''
  }

  return (await runCommand('git', ['-C', context.currentLink, 'rev-parse', 'HEAD'], { logStream, streamOutput: false })).stdout.trim()
}

export async function main(args: string[]): Promise<void> {
  const force = args.includes('--force')
  const context = createContext()

  await fs.mkdir(context.repoDir, { recursive: true })
  await fs.mkdir(context.releasesDir, { recursive: true })
  await fs.mkdir(context.liveWebRoot, { recursive: true })
  await fs.mkdir(path.join(context.statusRoot, 'data'), { recursive: true })

  try {
    await fs.mkdir(context.lockDir)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'EEXIST') {
      process.stderr.write('Another deployment is already running.\n')
      return
    }
    throw error
  }

  const logStream = createWriteStream(context.logPath, { flags: 'w' })
  const startedAt = isoNow()
  let targetCommit = ''
  let currentCommit = ''
  let releaseDir = ''

  try {
    if (!existsSync(path.join(context.repoDir, '.git'))) {
      await runCommand('git', ['clone', '--filter=blob:none', '--branch', context.branch, context.repoUrl, context.repoDir], { logStream })
    }

    await runCommand('git', ['-C', context.repoDir, 'fetch', 'origin', context.branch, '--prune'], { logStream })
    targetCommit = (await runCommand('git', ['-C', context.repoDir, 'rev-parse', `origin/${context.branch}`], { logStream, streamOutput: false })).stdout.trim()
    currentCommit = await currentCommitFor(context, logStream)

    if (!force && currentCommit && currentCommit === targetCommit) {
      await writeStatus(context, {
        status: 'idle',
        targetCommit,
        deployedCommit: currentCommit,
        message: 'No new commit to deploy.',
        startedAt,
        finishedAt: isoNow(),
        durationSec: 0,
        releasePath: context.currentLink,
      })
      return
    }

    await writeStatus(context, {
      status: 'running',
      targetCommit,
      deployedCommit: currentCommit,
      message: 'Building new release.',
      startedAt,
      finishedAt: '',
      durationSec: 0,
      releasePath: '',
    })

    releaseDir = path.join(context.releasesDir, `${formatReleaseTimestamp(new Date())}-${targetCommit.slice(0, 7)}`)
    await runCommand('git', ['-C', context.repoDir, 'worktree', 'add', '--detach', releaseDir, targetCommit], { logStream })
    await fs.copyFile(context.serverEnvSource, path.join(releaseDir, 'server', '.env'))

    await runCommand('pnpm', ['install', '--frozen-lockfile'], { cwd: releaseDir, logStream })
    await runCommand('pnpm', ['build'], { cwd: releaseDir, logStream })
    await runCommand('pnpm', ['install', '--frozen-lockfile'], { cwd: path.join(releaseDir, 'server'), logStream })
    await runCommand('pnpm', ['build'], { cwd: path.join(releaseDir, 'server'), logStream })

    await runCommand('rsync', ['-a', '--delete', '--exclude=/status', `${releaseDir}/out/`, `${context.liveWebRoot}/`], { logStream })
    await fs.copyFile(path.join(releaseDir, 'out', 'status', 'index.html'), context.statusIndexPath)
    await forceSymlink(context.statusRoot, path.join(context.liveWebRoot, 'status'))
    await forceSymlink(releaseDir, context.currentLink)
    await runCommand('pm2', ['startOrReload', context.ecosystemFile, '--update-env'], { logStream })
    await runCommand('pm2', ['save'], { logStream })

    await pruneOldReleases(context, releaseDir, logStream)

    const finishedAt = isoNow()
    const durationSec = durationSeconds(startedAt, finishedAt)
    const commitSubject = (await runCommand('git', ['-C', context.repoDir, 'show', '-s', '--format=%s', targetCommit], { logStream, streamOutput: false })).stdout.trim()

    await writeStatus(context, {
      status: 'success',
      targetCommit,
      deployedCommit: targetCommit,
      message: commitSubject,
      startedAt,
      finishedAt,
      durationSec,
      releasePath: releaseDir,
    })

    await appendHistory(context, {
      status: 'success',
      commit: targetCommit,
      message: commitSubject,
      startedAt,
      finishedAt,
      durationSec,
    }, logStream)
  } catch (error) {
    const finishedAt = isoNow()
    const durationSec = durationSeconds(startedAt, finishedAt)
    const message = 'Deployment failed.'

    await writeStatus(context, {
      status: 'failed',
      targetCommit,
      deployedCommit: currentCommit,
      message,
      startedAt,
      finishedAt,
      durationSec,
      releasePath: releaseDir,
    })

    await appendHistory(context, {
      status: 'failed',
      commit: targetCommit,
      message,
      startedAt,
      finishedAt,
      durationSec,
    }, logStream)

    if (releaseDir) {
      await removeRelease(context, releaseDir, logStream)
    }

    throw error
  } finally {
    logStream.end()
    await fs.rm(context.lockDir, { recursive: true, force: true })
  }
}

if (require.main === module) {
  void main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
