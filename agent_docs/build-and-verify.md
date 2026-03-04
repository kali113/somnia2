# Build and Verify

Use this when your task changes behavior, not just prose.

## Environment
- Prefer Node `22.x` and pnpm `10.x` (matches `.github/workflows/deploy-pages.yml`).
- Install dependencies in each package you touch:
  - Root: `pnpm install`
  - Backend: `cd server && pnpm install`

## Run Locally
- Frontend dev server: `pnpm dev`
- Backend dev server: `cd server && pnpm dev`

## Verification
- Frontend checks: `pnpm lint && pnpm build`
- Backend check (only when backend is touched): `cd server && pnpm build`
- Manual checks when gameplay or API behavior changes:
  - Routes: `/`, `/play`, `/game`
  - Health endpoint: `GET http://localhost:3001/api/health`
- CI linter: `.github/workflows/ci.yml` runs `pnpm lint` on pull requests and `main`.

## Notes
- If lint/build fails due environment/tooling gaps, report the exact command and error output.
- Do not silently skip verification commands.
