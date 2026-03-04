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

## Git Workflow
1. **Branch**: `git checkout -b <short-description>` before any changes.
2. **Commit**: commit early and often with descriptive messages.
3. **Verify**: run `pnpm lint && pnpm build` (and `cd server && pnpm build` if server touched) before final commit.
4. **Push & PR**: `git push -u origin <branch>` and open a pull request targeting `main`.
5. **Merge**: merge only after verification passes; delete the branch after merge.
6. Never push directly to `main`.

## Notes
- If lint/build fails due environment/tooling gaps, report the exact command and error output.
- Do not silently skip verification commands.
