# AGENTS.md — Pixel Royale (somnia2)

## Project Overview

Pixel Royale is a Somnia blockchain demo: a static-exported **Next.js 16** frontend
with an optional **Express 5 + WebSocket** backend for queueing, events, and
leaderboard APIs. Contracts are Solidity 0.8.x deployed on Somnia Shannon testnet.

## Codebase Map

| Path | Purpose |
|---|---|
| `app/` | Next.js App Router pages (`/`, `/play`, `/game`) |
| `components/game/` | Gameplay UI (canvas, HUD, kill feed, wallet connect) |
| `components/dashboard/` | Queue, rewards, leaderboard, session-key panels |
| `components/ui/` | shadcn/ui primitives (button, card, scroll-area, etc.) |
| `lib/game/` | Game engine, collision, storm logic |
| `lib/somnia/` | Chain config, contract helpers, session wallet, matchmaking client |
| `server/` | Express + WS backend (separate `package.json`, ESM) |
| `server/routes/` | REST routes: matchmaking, leaderboard, player, queue, game |
| `server/store.ts` | In-memory game/queue state |
| `contracts/` | Solidity sources, ABI, deployment metadata |
| `scripts/` | Deploy scripts, e2e runner |
| `ops/vm/` | VM deployment/ops tooling |
| `tests/unit/` | Frontend unit tests |
| `server/tests/` | Server unit tests |
| `agent_docs/` | Detailed docs for agents (build, frontend, backend, chain, deploy) |

## Build / Lint / Test Commands

Package manager: **pnpm**

```sh
# Install
pnpm install                          # frontend + root deps
cd server && pnpm install             # server deps (separate package.json)

# Development
pnpm dev                              # Next.js dev server
cd server && pnpm dev                 # backend dev server (tsx watch)

# Lint (zero warnings enforced)
pnpm lint                             # eslint . --max-warnings=0

# Type-check (all tsconfig projects)
pnpm typecheck                        # web + ops-vm + scripts

# Build
pnpm build                            # next build + ops-vm tsc
cd server && pnpm build               # server tsc -> dist/

# Tests — unit (vitest)
pnpm test                             # all unit tests with coverage
pnpm test:unit                        # same as above

# Run a SINGLE test file
pnpm vitest run tests/unit/storm.test.ts              # frontend test
pnpm vitest run server/tests/store.test.ts            # server test (from root)
cd server && pnpm vitest run tests/store.test.ts      # server test (from server/)

# Run tests matching a name pattern
pnpm vitest run -t "tracks queue state"

# E2E (Playwright)
pnpm test:e2e

# Deploy contracts
pnpm deploy:somnia
```

**Required verification before finishing work:**
```sh
pnpm lint && pnpm build               # always
cd server && pnpm build               # if server files changed
pnpm test                             # if logic changed
```

## Code Style

### Formatting
- **2-space indentation**, no tabs
- **Single quotes** everywhere (double quotes only in JSX attributes)
- **No semicolons**
- **Trailing commas** in multi-line constructs
- **Braces always required** on `if`/`else`/`for`/`while` (`curly: all`)
- Short guard clauses may be single-line: `if (!x) {return null}`
- `===` required (`eqeqeq: smart`)

### Naming
| Kind | Convention | Example |
|---|---|---|
| Files (`.ts`) | kebab-case | `session-wallet.ts` |
| Files (`.tsx`) | PascalCase for components | `QueuePanel.tsx` |
| UI primitives | kebab-case (shadcn style) | `button.tsx` |
| Variables / functions | camelCase | `fetchMatchmakingMe` |
| Config constants | UPPER_SNAKE_CASE | `SOMNIA_RPC_URL` |
| Types / Interfaces | PascalCase | `SessionWallet`, `GameMode` |
| React components | PascalCase | `export default function QueuePanel()` |
| Props types | PascalCase + `Props` suffix | `GameCanvasProps` |
| Express routers | camelCase + `Router` suffix | `matchmakingRouter` |
| Test addresses | UPPER_SNAKE_CASE | `const ALPHA = '0x...'` |

### Imports
1. External packages (`react`, `viem`, `next/navigation`, `lucide-react`)
2. Internal alias imports (`@/lib/...`, `@/components/...`, `@/contracts/...`)
3. Relative imports (`./config`, `../store.js`)
4. Blank line before first non-import statement

**Type imports** — enforced by ESLint `consistent-type-imports`:
```ts
import { createWalletClient, type Address } from 'viem'  // inline type
import type { Duplex } from 'node:stream'                 // standalone
```

**Server relative imports** must include `.js` extension (ESM requirement):
```ts
import { GameStore } from './store.js'
```
Frontend imports use `@/` alias without extensions.

### Types
- Use `interface` for object shapes; `type` for unions/aliases/computed types
- Use `as const` for immutable config objects and ABI definitions
- Prefix unused parameters/catch variables with `_`: `(_err) =>`
- Numeric separators for large literals: `60_000`, `64 * 1024`

### Exports
- **Named exports** for library/server code (the default)
- **`export default`** only for React page/component functions
- No anonymous default exports (enforced by ESLint)

### Comments
- Section dividers use box-drawing characters: `// ── Section Name ──────`
- JSDoc for public functions with multi-line descriptions
- JSX section comments: `{/* Queue Progress */}`
- No comments unless explaining non-obvious logic

### Error Handling
- Catch blocks: `error instanceof Error ? error.message : String(error)`
- Empty `catch` with early return for acceptable failures
- `void` prefix for fire-and-forget async calls: `void refetchInQueue()`
- HTTP errors return JSON: `res.status(400).json({ error: 'Invalid address' })`
- Assertion functions throw `Error` with descriptive messages

### React Patterns
- `'use client'` directive at the top of client components
- `useCallback` for event handlers passed as props
- `useRef` for mutable values that should not trigger re-renders
- `dynamic()` with `{ ssr: false }` for browser-only components
- Cleanup functions always provided in `useEffect` when needed

## TypeScript Configuration

- `strict: true` everywhere
- Frontend: `target ES2020`, `module esnext`, `moduleResolution bundler`
- Server: `target ES2022`, `module ES2022`, `moduleResolution bundler`, ESM
- ESLint uses `typescript-eslint strictTypeChecked` preset
- Key enforced rules: `return-await: always`, `switch-exhaustiveness-check`,
  `only-throw-error`, `no-unused-expressions`, `restrict-template-expressions`

## Testing Conventions

- **Framework**: Vitest with v8 coverage (95% thresholds)
- **Structure**: `describe` / `it` blocks (not `test`)
- **Descriptions**: lowercase, verb-first phrases
- **Test files**: `tests/unit/*.test.ts` (frontend), `server/tests/*.test.ts` (server)
- **Assertions**: `expect().toBe()`, `.toEqual()`, `.toMatchObject()`, etc.
- **Test isolation**: fresh instances per test; no shared mutable state

```ts
import { describe, expect, it } from 'vitest'

import { GameStore } from '../store.js'

describe('game store', () => {
  it('tracks queue state', () => {
    const store = new GameStore()
    expect(store.getQueueState()).toMatchObject({ count: 0 })
  })
})
```

## Git Workflow

- Create a feature branch before starting: `git checkout -b <short-description>`
- Commit frequently with descriptive messages
- Run `pnpm lint && pnpm build` before merging into `main`
- Push `main` to remote after merging
- Never commit secrets (`.env`, private keys)

## Agent Orchestration

- **Prefer parallel subagents**: launch concurrent Task agents for independent
  subtasks (e.g., Solidity + server + frontend work in parallel)
- Plan first, fan out, then consolidate before the shared verification step
- Read `agent_docs/` for deeper context on specific subsystems
