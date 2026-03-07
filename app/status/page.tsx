'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, ChevronRight, Crosshair, RefreshCcw, RotateCw, ScrollText, ShieldAlert, Sparkles } from 'lucide-react'

type DeployState = 'idle' | 'running' | 'success' | 'failed' | (string & {})

interface DeployStatus {
  repoUrl: string
  branch: string
  status: DeployState
  message: string
  targetCommit: string
  deployedCommit: string
  startedAt: string
  finishedAt: string
  durationSec: number
  releasePath: string
  updatedAt: string
}

interface HistoryEntry {
  status: DeployState
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
  history?: HistoryEntry[]
}

interface SummaryRow {
  label: string
  value: ReactNode
}

function formatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return 'n/a'
  }

  return String(value)
}

function statusClasses(status: DeployState): string {
  if (status === 'success') {return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'}
  if (status === 'running') {return 'border-amber-300/30 bg-amber-300/10 text-amber-100'}
  if (status === 'failed') {return 'border-rose-400/30 bg-rose-400/10 text-rose-100'}
  return 'border-white/10 bg-white/5 text-white/65'
}

function statusLabel(status: DeployState): string {
  return status || 'idle'
}

function CommitValue({ commit, repoUrl }: { commit: string; repoUrl: string }) {
  if (!commit) {
    return <span>n/a</span>
  }

  const shortCommit = commit.slice(0, 7)
  if (!repoUrl) {
    return <span>{shortCommit}</span>
  }

  return (
    <a href={`${repoUrl.replace(/\.git$/u, '')}/commit/${commit}`} target="_blank" rel="noreferrer" className="text-[#3ae8ff] transition-colors hover:text-white">
      {shortCommit}
    </a>
  )
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: HTTP ${response.status}`)
  }

  return await (response.json() as Promise<T>)
}

async function fetchText(path: string): Promise<string> {
  const response = await fetch(path, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: HTTP ${response.status}`)
  }

  return await response.text()
}

export default function StatusPage() {
  const [status, setStatus] = useState<DeployStatus | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [log, setLog] = useState('Loading deployment log...')
  const [actionStatus, setActionStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [redeploying, setRedeploying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollTimerRef = useRef<number | null>(null)

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const load = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const [nextStatus, nextHistory, nextLog] = await Promise.all([
        fetchJson<DeployStatus>('./data/status.json'),
        fetchJson<HistoryPayload>('./data/history.json'),
        fetchText('./data/deploy.log'),
      ])

      setStatus(nextStatus)
      setHistory(nextHistory.history || [])
      setLog(nextLog || 'No log output yet.')
      setError(null)
      return nextStatus
    } catch (loadError: unknown) {
      const message = loadError instanceof Error ? loadError.message : String(loadError)
      setError(message)
      setLog(`Failed to load status: ${message}`)
      throw loadError
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    pollTimerRef.current = window.setInterval(() => {
      void load(true)
        .then((nextStatus) => {
          if (nextStatus.status === 'running') {
            setActionStatus('Redeploy in progress...')
            return
          }

          if (nextStatus.status === 'success') {
            setActionStatus('Redeploy completed.')
          } else if (nextStatus.status === 'failed') {
            setActionStatus(`Redeploy failed: ${nextStatus.message || 'unknown error'}`)
          }

          stopPolling()
        })
        .catch((pollError: unknown) => {
          const message = pollError instanceof Error ? pollError.message : String(pollError)
          setActionStatus(`Status refresh failed: ${message}`)
          stopPolling()
        })
    }, 2000)
  }, [load, stopPolling])

  useEffect(() => {
    void load().then((nextStatus) => {
      if (nextStatus.status === 'running') {
        setActionStatus('Deployment currently running...')
        startPolling()
      }
    }).catch(() => {
      // initial load error already reflected in state
    })

    return () => { stopPolling(); }
  }, [load, startPolling, stopPolling])

  const handleRefresh = async () => {
    try {
      await load(true)
      setActionStatus('Status refreshed.')
    } catch {
      setActionStatus('Refresh failed.')
    }
  }

  const handleRedeploy = async () => {
    const providedPassword = window.prompt('Redeploy password')
    if (!providedPassword) {
      return
    }

    setRedeploying(true)
    setActionStatus('Triggering redeploy...')

    try {
      const response = await fetch('/api/admin/redeploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-redeploy-password': providedPassword,
        },
        body: JSON.stringify({ password: providedPassword }),
      })

      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!response.ok) {
        throw new Error(payload.error || payload.message || `HTTP ${response.status}`)
      }

      setActionStatus('Redeploy requested. Waiting for deploy status...')
      startPolling()
    } catch (redeployError) {
      const message = redeployError instanceof Error ? redeployError.message : String(redeployError)
      setActionStatus(`Redeploy failed: ${message}`)
    } finally {
      setRedeploying(false)
    }
  }

  const rows: SummaryRow[] = status ? [
    { label: 'Status', value: <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.25em] ${statusClasses(status.status)}`}>{statusLabel(status.status)}</span> },
    { label: 'Message', value: <span>{formatValue(status.message)}</span> },
    { label: 'Branch', value: <span>{formatValue(status.branch)}</span> },
    { label: 'Target Commit', value: <CommitValue commit={status.targetCommit} repoUrl={status.repoUrl} /> },
    { label: 'Deployed Commit', value: <CommitValue commit={status.deployedCommit} repoUrl={status.repoUrl} /> },
    { label: 'Started', value: <span>{formatValue(status.startedAt)}</span> },
    { label: 'Finished', value: <span>{formatValue(status.finishedAt)}</span> },
    { label: 'Duration', value: <span>{status.durationSec ? `${status.durationSec}s` : 'n/a'}</span> },
    { label: 'Release Path', value: <span>{formatValue(status.releasePath)}</span> },
    { label: 'Updated', value: <span>{formatValue(status.updatedAt)}</span> },
  ] : []

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050508] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(58,232,255,0.14),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(123,45,255,0.18),transparent_28%),linear-gradient(180deg,#050508_0%,#070b14_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:36px_36px]" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-[28px] border border-white/10 bg-black/25 px-5 py-5 backdrop-blur-xl sm:px-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#3ae8ff]/20 bg-[#3ae8ff]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.28em] text-[#8af4ff]">
                <Sparkles className="h-3.5 w-3.5" />
                Pixel Royale Ops
              </div>
              <div>
                <h1 className="text-4xl font-black tracking-[-0.08em] text-white sm:text-5xl">Deploy Status</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                  Release state, build log, and deployment history for the VM-backed export and orchestrator.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-white/70 transition-colors hover:border-[#3ae8ff]/30 hover:text-white">
                <Crosshair className="h-4 w-4 text-[#3ae8ff]" />
                Back To Lobby
              </Link>
              <button
                type="button"
                onClick={() => { void handleRedeploy() }}
                disabled={redeploying}
                className="inline-flex items-center gap-2 rounded-full border border-[#3ae8ff]/30 bg-[#3ae8ff] px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-[#050508] transition-transform hover:scale-[1.02] disabled:cursor-wait disabled:opacity-60"
              >
                <RotateCw className={`h-4 w-4 ${redeploying ? 'animate-spin' : ''}`} />
                Redeploy
              </button>
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-white/80 transition-colors hover:border-white/20 hover:bg-white/8 disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-white/55">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
              <Activity className="h-3.5 w-3.5 text-[#3ae8ff]" />
              {status ? `branch ${formatValue(status.branch)}` : 'status offline'}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-[#ffd166]" />
              {actionStatus || 'Manual redeploy is available when the backend token is configured.'}
            </span>
          </div>
        </header>

        {error ? (
          <section className="rounded-[24px] border border-rose-400/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100 backdrop-blur-xl">
            Failed to load deployment data: {error}
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <article className="rounded-[28px] border border-white/10 bg-black/25 p-5 backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#8af4ff]">Current State</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.06em] text-white">Live deployment snapshot</h2>
              </div>
              {loading ? <span className="text-xs uppercase tracking-[0.24em] text-white/45">Loading</span> : null}
            </div>

            <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-[minmax(132px,180px)_1fr]">
              {rows.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-xs font-bold uppercase tracking-[0.22em] text-white/40">{row.label}</dt>
                  <dd className="min-w-0 break-words text-sm leading-6 text-white/82">{row.value}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className="rounded-[28px] border border-white/10 bg-black/25 p-5 backdrop-blur-xl sm:p-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#ffd166]">Recent Deployments</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.06em] text-white">Release trail</h2>
            </div>

            <div className="mt-6 space-y-3">
              {history.length ? history.map((entry, index) => (
                <article key={`${entry.commit}-${entry.finishedAt}-${index}`} className="rounded-2xl border border-white/8 bg-white/[0.035] p-4 transition-colors hover:border-white/14">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] ${statusClasses(entry.status)}`}>
                      {statusLabel(entry.status)}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.24em] text-white/35">{formatValue(entry.finishedAt)}</span>
                  </div>
                  <p className="mt-3 text-sm font-bold text-white">{entry.commitSubject || 'No commit subject'}</p>
                  <p className="mt-2 text-xs leading-5 text-white/58">
                    {entry.commitUrl ? (
                      <a href={entry.commitUrl} target="_blank" rel="noreferrer" className="text-[#3ae8ff] hover:text-white">
                        {(entry.commit || '').slice(0, 7) || 'n/a'}
                      </a>
                    ) : formatValue(entry.commit)}{' '}
                    by {formatValue(entry.commitAuthor)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-white/42">{entry.durationSec || 0}s</p>
                </article>
              )) : (
                <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-8 text-sm text-white/48">
                  No deployments recorded yet.
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-black/25 p-5 backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#7b2dff]">Build Log</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.06em] text-white">Terminal replay</h2>
            </div>
            <Link href="/play" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[#8af4ff] transition-colors hover:text-white">
              Open Game Queue
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-6 rounded-[24px] border border-white/10 bg-[#02060c] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3 text-[11px] uppercase tracking-[0.26em] text-white/38">
              <ScrollText className="h-3.5 w-3.5 text-[#3ae8ff]" />
              deploy.log
            </div>
            <pre className="max-h-[60vh] overflow-auto px-4 py-4 text-xs leading-6 whitespace-pre-wrap break-words text-[#cfe7ff]">{log}</pre>
          </div>
        </section>
      </div>
    </main>
  )
}
