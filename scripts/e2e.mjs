import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptsDir, '..')
const frontendOrigin = 'http://127.0.0.1:3000'
const backendOrigin = 'http://127.0.0.1:3001'

function createManagedProcess(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })

  const logLines = []
  const appendLogs = (chunk) => {
    const lines = chunk
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `[${name}] ${line}`)

    if (lines.length === 0) {
      return
    }

    logLines.push(...lines)
    if (logLines.length > 40) {
      logLines.splice(0, logLines.length - 40)
    }
  }

  child.stdout.on('data', appendLogs)
  child.stderr.on('data', appendLogs)

  const exited = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      resolve({ code, signal, logs: [...logLines] })
    })
  })

  return {
    child,
    exited,
    getLogs() {
      return [...logLines]
    },
    async stop() {
      if (child.killed || child.exitCode !== null) {
        return
      }

      child.kill('SIGTERM')
      const outcome = await Promise.race([
        exited,
        new Promise((resolve) => setTimeout(resolve, 5_000, null)),
      ])

      if (outcome === null && child.exitCode === null) {
        child.kill('SIGKILL')
        await exited
      }
    },
  }
}

async function ensureBuildArtifacts() {
  await access(path.join(repoRoot, 'out', 'index.html'), constants.R_OK)
  await access(path.join(repoRoot, 'server', 'dist', 'index.js'), constants.R_OK)
}

async function waitForUrl(url, label, processRef, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const exit = await Promise.race([
      processRef.exited,
      new Promise((resolve) => setTimeout(resolve, 250, null)),
    ])

    if (exit) {
      const details = exit.logs.length > 0 ? `\n${exit.logs.join('\n')}` : ''
      throw new Error(`${label} exited before becoming ready.${details}`)
    }

    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // Keep waiting until timeout.
    }
  }

  const logs = processRef.getLogs()
  const details = logs.length > 0 ? `\n${logs.join('\n')}` : ''
  throw new Error(`Timed out waiting for ${label} at ${url}.${details}`)
}

async function assertNoPageErrors(page, route, pageErrors) {
  assert.equal(
    pageErrors.length,
    0,
    `Unexpected browser errors on ${route}:\n${pageErrors.join('\n')}`,
  )
}

async function checkRoute(browser, route, verify) {
  const page = await browser.newPage()
  const pageErrors = []
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(30_000)

  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  console.log(`Checking ${route}`)
  await page.goto(`${frontendOrigin}${route}`, {
    timeout: 30_000,
    waitUntil: 'domcontentloaded',
  })
  await verify(page)
  await assertNoPageErrors(page, route, pageErrors)
  console.log(`Checked ${route}`)
  await page.close()
}

async function main() {
  await ensureBuildArtifacts()

  const frontend = createManagedProcess(
    'frontend',
    'python3',
    ['-m', 'http.server', '3000', '-d', 'out', '--bind', '127.0.0.1'],
  )
  const backend = createManagedProcess(
    'backend',
    process.execPath,
    ['dist/index.js'],
    {
      cwd: path.join(repoRoot, 'server'),
      env: {
        ...process.env,
        PORT: '3001',
      },
    },
  )

  let browser

  try {
    await Promise.all([
      waitForUrl(`${frontendOrigin}/`, 'frontend', frontend),
      waitForUrl(`${backendOrigin}/api/health`, 'backend', backend),
    ])
    console.log('Frontend and backend are ready')

    browser = await chromium.launch({ headless: true })

    await checkRoute(browser, '/', async (page) => {
      const hero = page.locator('h1')
      await hero.waitFor()
      assert.match(await hero.innerText(), /PIXEL\s+ROYALE/)
      await page.getByRole('link', { name: /play now/i }).waitFor()
    })

    await checkRoute(browser, '/play', async (page) => {
      await page.getByRole('heading', { name: /battle dashboard/i }).waitFor()
      await page.getByRole('link', { name: /practice mode \(solo vs bots\)/i }).waitFor()
      assert.match(page.url(), /\/play\/$/)
    })

    await checkRoute(browser, '/game', async (page) => {
      await Promise.any([
        page.getByRole('button', { name: /select slot 1: pickaxe/i }).waitFor(),
        page.getByRole('button', { name: /mute|unmute/i }).waitFor(),
        page.getByRole('button', { name: /connect to somnia/i }).waitFor(),
        page.getByText(/preparing match/i).waitFor(),
      ])
      assert.match(page.url(), /\/game\/$/)
    })
  } finally {
    await Promise.allSettled([
      browser?.close(),
      frontend.stop(),
      backend.stop(),
    ])
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
