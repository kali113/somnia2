import { existsSync, createWriteStream } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { copyDirectory, forceSymlink, isMissing, parseEnvFile, runCommand, writeJsonFile } from './shared'

const scriptRoot = path.resolve(__dirname, '..')

async function main(): Promise<void> {
  const remoteRoot = (process.env.REMOTE_ROOT || '/opt/somnia2-deployer').trim()
  const statusRoot = (process.env.STATUS_ROOT || '/var/www/somnia2-status').trim()
  const nginxSite = (process.env.NGINX_SITE || '/etc/nginx/sites-available/somnia2').trim()
  const configPath = path.join(remoteRoot, 'config.env')
  const configValues = existsSync(configPath) ? parseEnvFile(await fs.readFile(configPath, 'utf8')) : {}
  const appName = (process.env.APP_NAME || configValues.APP_NAME || 'somnia2-api').trim()

  const remoteBin = path.join(remoteRoot, 'bin')
  const remoteDist = path.join(remoteBin, 'dist')
  const statusData = path.join(statusRoot, 'data')

  await fs.mkdir(remoteBin, { recursive: true })
  await fs.mkdir(path.join(remoteRoot, 'releases'), { recursive: true })
  await fs.mkdir(statusData, { recursive: true })

  await installFile(path.join(scriptRoot, 'deploy.sh'), path.join(remoteBin, 'deploy.sh'), 0o755)
  await installFile(path.join(scriptRoot, 'check.sh'), path.join(remoteBin, 'check.sh'), 0o755)
  await fs.writeFile(path.join(remoteRoot, 'ecosystem.config.cjs'), createEcosystemConfig(appName, remoteRoot), 'utf8')
  await fs.chmod(path.join(remoteRoot, 'ecosystem.config.cjs'), 0o644)

  if (!existsSync(path.join(scriptRoot, 'dist', 'deploy.js'))) {
    throw new Error('Missing compiled ops scripts at ops/vm/dist. Run `pnpm build:ops-vm` first.')
  }
  await copyDirectory(path.join(scriptRoot, 'dist'), remoteDist)

  if (!existsSync(path.join(remoteRoot, 'config.env'))) {
    await installFile(path.join(scriptRoot, 'config.env.example'), path.join(remoteRoot, 'config.env'), 0o600)
  }

  if (!existsSync(path.join(remoteRoot, 'server.env'))) {
    process.stderr.write(`Missing ${path.join(remoteRoot, 'server.env')}. Copy your backend env there before first deploy.\n`)
  }

  await fs.writeFile(path.join(statusRoot, 'index.html'), createPendingStatusPage(), 'utf8')
  await fs.chmod(path.join(statusRoot, 'index.html'), 0o644)
  await forceSymlink(statusRoot, '/var/www/somnia2/status')

  await fs.writeFile('/etc/systemd/system/somnia2-deploy.service', createDeployService(remoteRoot), 'utf8')
  await fs.writeFile('/etc/systemd/system/somnia2-force-deploy.service', createForceDeployService(remoteRoot), 'utf8')
  await fs.writeFile('/etc/systemd/system/somnia2-deploy.timer', createDeployTimer(), 'utf8')

  await updateNginxSite(nginxSite)

  await runCommand('systemctl', ['daemon-reload'])
  await runCommand('nginx', ['-t'])
  await runCommand('systemctl', ['reload', 'nginx'])
  await runCommand('systemctl', ['enable', '--now', 'somnia2-deploy.timer'])

  await ensureHistoryFile(path.join(statusData, 'history.json'))
  await ensureStatusFile(path.join(statusData, 'status.json'))
  const logPath = path.join(statusData, 'deploy.log')
  const stream = createWriteStream(logPath, { flags: 'a' })
  stream.end()
  await fs.chmod(logPath, 0o644)
}

async function installFile(sourcePath: string, targetPath: string, mode: number): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.copyFile(sourcePath, targetPath)
  await fs.chmod(targetPath, mode)
}

function createDeployService(remoteRoot: string): string {
  return `[Unit]
Description=Somnia2 deployment check
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${remoteRoot}
Environment=HOME=/root
Environment=PM2_HOME=/root/.pm2
Environment=USER=root
ExecStart=${remoteRoot}/bin/check.sh
`
}

function createForceDeployService(remoteRoot: string): string {
  return `[Unit]
Description=Somnia2 forced deployment
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${remoteRoot}
Environment=HOME=/root
Environment=PM2_HOME=/root/.pm2
Environment=USER=root
ExecStart=${remoteRoot}/bin/deploy.sh --force
`
}

function createDeployTimer(): string {
  return `[Unit]
Description=Run Somnia2 deployment check every minute

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
Unit=somnia2-deploy.service

[Install]
WantedBy=timers.target
`
}

function createEcosystemConfig(appName: string, remoteRoot: string): string {
  return `module.exports = {
  apps: [
    {
      name: ${JSON.stringify(appName)},
      cwd: ${JSON.stringify(path.join(remoteRoot, 'current', 'server'))},
      script: 'dist/index.js',
      interpreter: 'node',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
    },
  ],
}\n`
}

function createPendingStatusPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pixel Royale Deploy Status</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top, rgba(58, 232, 255, 0.18), transparent 32%), #050508;
        color: #e8e8ef;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      main {
        width: min(680px, calc(100vw - 32px));
        padding: 28px;
        border: 1px solid rgba(58, 232, 255, 0.22);
        border-radius: 24px;
        background: rgba(10, 10, 16, 0.88);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
      }
      p { color: rgba(232, 232, 239, 0.72); line-height: 1.6; }
      code { color: #3ae8ff; }
    </style>
  </head>
  <body>
    <main>
      <p>Pixel Royale deployment status is waiting for the first successful frontend export.</p>
      <p>Status data will appear here after the next deploy writes <code>/status/index.html</code>.</p>
    </main>
  </body>
</html>
`
}

async function updateNginxSite(filePath: string): Promise<void> {
  const marker = '    location / {\n        try_files $uri $uri/ $uri.html /index.html;\n    }\n'
  const statusBlock = [
    '    location = /status {',
    '        return 301 /status/;',
    '    }',
    '',
    '    location = /status/ {',
    '        return 302 /status/index.html;',
    '    }',
  ].join('\n')

  const text = await fs.readFile(filePath, 'utf8')
  if (!text.includes(marker)) {
    throw new Error('Expected nginx location block not found.')
  }

  let nextText: string
  if (text.includes('location = /status')) {
    const start = text.indexOf('location = /status')
    const end = text.indexOf('    location / {', start)
    nextText = `${text.slice(0, start)}${statusBlock}\n\n${text.slice(end)}`
  } else {
    nextText = text.replace(marker, `${statusBlock}\n\n${marker}`)
  }

  await fs.writeFile(filePath, nextText, 'utf8')
}

async function ensureHistoryFile(filePath: string): Promise<void> {
  try {
    await fs.access(filePath)
  } catch (error) {
    if (!isMissing(error)) {
      throw error
    }
    await writeJsonFile(filePath, { history: [] })
  }
}

async function ensureStatusFile(filePath: string): Promise<void> {
  try {
    await fs.access(filePath)
  } catch (error) {
    if (!isMissing(error)) {
      throw error
    }
    await writeJsonFile(filePath, {
      repoUrl: '',
      branch: 'main',
      status: 'idle',
      message: 'Awaiting first deployment.',
      targetCommit: '',
      deployedCommit: '',
      startedAt: '',
      finishedAt: '',
      durationSec: 0,
      releasePath: '',
      logPath: '/status/data/deploy.log',
      historyPath: '/status/data/history.json',
      updatedAt: '',
    })
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
