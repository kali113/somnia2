# Repository Guidelines

## WHY (Project Purpose)
Pixel Royale is a Somnia demo: a static-exported Next.js frontend plus an optional Node orchestrator server for queueing, events, and leaderboard APIs.

## WHAT (Codebase Map)
- `app/`: Next.js App Router pages (`/`, `/play`, `/game`).
- `components/game`, `lib/game`: gameplay UI and engine logic.
- `components/dashboard`, `lib/somnia`: wallet, chain integration, queue/reward UX.
- `server/`: Express + WebSocket backend (`routes/`, `store.ts`, `indexer.ts`).
- `contracts/`: Solidity + ABI used by frontend/server integrations.

## HOW (Default Workflow)
- Frontend: `pnpm install`, `pnpm dev`, `pnpm lint`, `pnpm build`.
- Backend: `cd server && pnpm install`, `pnpm dev` or `pnpm build && pnpm start`.
- Required verification before finishing work:
  - Root: `pnpm lint && pnpm build`
  - Server changes: `cd server && pnpm build`
  - Manual smoke checks for `/`, `/play`, `/game`, and `/api/health` when backend is touched.

## Progressive Disclosure (Read Only What You Need)
Start with one or two docs below, then follow their file pointers:
- `agent_docs/build-and-verify.md`: install, run, and verification workflow.
- `agent_docs/frontend-map.md`: app routes, UI layers, and game engine entry points.
- `agent_docs/backend-map.md`: API/WebSocket flow and in-memory state model.
- `agent_docs/chain-and-contracts.md`: Somnia config, wallet/session, contract bindings.
- `agent_docs/deploy-pages.md`: static export behavior and GitHub Pages pipeline.

## Guardrails
- Keep edits minimal and local to the task.
- Follow existing TypeScript style already present in touched files.
- Do not add style-only churn; use lint/build as deterministic quality gates.
- Never commit secrets (`.env`, private keys).
