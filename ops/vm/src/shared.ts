import { spawn } from 'node:child_process'
import { once, type EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface RunOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  logStream?: NodeJS.WritableStream
  streamOutput?: boolean
}

export async function runCommand(command: string, args: string[], options: RunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  const { cwd, env, logStream, streamOutput = true } = options

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    if (!child.stdout || !child.stderr) {
      reject(new Error(`${command} ${args.join(' ')} failed to start with piped stdio`))
      return
    }

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString()
      stdout += text
      if (streamOutput) {
        process.stdout.write(chunk)
      }
      logStream?.write(chunk)
    })

    child.stderr.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString()
      stderr += text
      if (streamOutput) {
        process.stderr.write(chunk)
      }
      logStream?.write(chunk)
    })

    void Promise.race([
      once(child as unknown as EventEmitter, 'close'),
      once(child as unknown as EventEmitter, 'error').then(([error]) => {
        throw error
      }),
    ])
      .then(([code]) => {
        if (code === 0) {
          resolve({ stdout, stderr })
          return
        }

        const detail = stderr.trim() || stdout.trim() || `exit code ${String(code)}`
        reject(new Error(`${command} ${args.join(' ')} failed: ${detail}`))
      })
      .catch(reject)
  })
}

export function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u)
    if (!match) {
      continue
    }

    const [, key, rawValue] = match
    values[key] = normalizeEnvValue(rawValue)
  }

  return values
}

function normalizeEnvValue(rawValue: string): string {
  const trimmed = rawValue.trim()
  if (!trimmed) {
    return ''
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const quote = trimmed[0]
    const inner = trimmed.slice(1, -1)
    if (quote === '"') {
      return inner
        .replace(/\\n/gu, '\n')
        .replace(/\\r/gu, '\r')
        .replace(/\\t/gu, '\t')
        .replace(/\\"/gu, '"')
        .replace(/\\\\/gu, '\\')
    }
    return inner
  }

  return trimmed.replace(/\s+#.*$/u, '')
}

export function getRequired(config: Record<string, string>, key: string): string {
  const value = (config[key] || process.env[key] || '').trim()
  if (!value) {
    throw new Error(`${key} is required`)
  }
  return value
}

export function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z')
}

export function durationSeconds(startedAt: string, finishedAt: string): number {
  return Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000))
}

export function formatReleaseTimestamp(date: Date): string {
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')
  return `${year}${month}${day}${hours}${minutes}${seconds}`
}

export async function writeJsonFile(filePath: string, value: unknown, mode = 0o644): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fs.chmod(filePath, mode)
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content) as T
  } catch (error) {
    if (isMissing(error)) {
      return null
    }
    throw error
  }
}

export async function copyDirectory(sourceDir: string, targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true })
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath)
      continue
    }

    await fs.copyFile(sourcePath, targetPath)
  }
}

export async function forceSymlink(target: string, linkPath: string): Promise<void> {
  try {
    await fs.rm(linkPath, { recursive: true, force: true })
  } catch {
    // ignore cleanup failures before recreating the link
  }

  await fs.mkdir(path.dirname(linkPath), { recursive: true })
  await fs.symlink(target, linkPath)
}

export function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT')
}
