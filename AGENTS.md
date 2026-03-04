# Repository Guidelines

## Project Structure & Module Organization
- `app/` contains Next.js App Router pages and layouts (`/`, `/play`, `/game`).
- `components/` holds reusable UI primitives in `components/ui/` plus feature-level components in `components/game/` and `components/dashboard/`.
- `lib/` contains shared TypeScript logic, including `lib/game/` (engine systems) and `lib/somnia/` (chain config, contracts, session wallet).
- `server/` is a standalone Express + WebSocket TypeScript service (`routes/`, `store.ts`, `indexer.ts`).
- `contracts/` stores Solidity sources and ABI; `public/` stores static images/icons.

## Build, Test, and Development Commands
- `pnpm install` installs frontend dependencies (root project).
- `pnpm dev` starts the Next.js app locally on port 3000.
- `pnpm build` creates the static export (`out/`) used by GitHub Pages.
- `pnpm lint` runs ESLint across the repository (`eslint .`).
- `cd server && pnpm install` installs backend dependencies.
- `cd server && pnpm dev` runs the orchestrator server with hot reload (`tsx watch`).
- `cd server && pnpm build && pnpm start` builds backend TS and runs `dist/index.js`.

## Coding Style & Naming Conventions
- Language: TypeScript with `strict: true` in both frontend and backend configs.
- Follow existing formatting: 2-space indentation, single quotes, and no semicolons.
- Use `PascalCase` for React component files (`GameCanvas.tsx`, `WalletPanel.tsx`).
- Use lowercase module names for non-component logic (`engine.ts`, `collision.ts`).
- Prefer the `@/*` import alias for root-relative frontend imports.
- Run `pnpm lint` before opening a PR.

## Testing Guidelines
- No automated test framework is currently configured in root or `server/`.
- Required pre-PR checks: `pnpm lint`, `pnpm build`, and `cd server && pnpm build`.
- Manual smoke test at minimum: `/`, `/play`, `/game`, plus `GET /api/health` on local backend.
- If adding tests, use `*.test.ts` or `*.test.tsx` naming and cover game logic, queue flow, and API edge cases.

## Commit & Pull Request Guidelines
- Match existing commit style: short, imperative, capitalized subjects (e.g., `Fix Pages workflow pnpm setup order`).
- Keep commits focused by concern (UI, engine logic, backend routes, deployment config).
- PRs should include: what changed, why, how to verify, and linked issue/ticket.
- Add screenshots or short recordings for UI changes, and call out any `.env` or contract-address impacts.

## Configuration & Security Tips
- Frontend build is static-exported via `next.config.mjs`; avoid introducing frontend runtime server dependencies.
- Backend secrets come from environment variables in `server/index.ts` (`SOMNIA_RPC_URL`, `GAME_CONTRACT_ADDRESS`, `ORCHESTRATOR_PRIVATE_KEY`, `CORS_ORIGIN`).
- Never commit `.env` files or private keys.
