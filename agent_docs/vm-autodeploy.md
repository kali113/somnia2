# VM Auto Deploy

Use this when working on the VM deployment pipeline and status page.

## Layout
- TypeScript deploy sources: `ops/vm/src/`
- Shell bootstrap wrappers: `ops/vm/*.sh`
- Status page route: `app/status/page.tsx`
- VM install root: `/opt/somnia2-deployer`
- Live status site root: `/var/www/somnia2-status`

## Runtime
- `systemd` timer `somnia2-deploy.timer` runs every minute.
- `deploy.ts` fetches `origin/main`, skips if unchanged, otherwise builds a new release under `releases/`.
- Frontend export syncs to `/var/www/somnia2`.
- Installer generates `ecosystem.config.cjs`, and backend restarts through PM2 using the stable `current` symlink.
- Status files are written to `/var/www/somnia2-status/data/`.
- The exported Next `/status` page is copied into `/var/www/somnia2-status/index.html` during deploy.
- Status page can trigger a manual redeploy through `POST /api/admin/redeploy` when `REDEPLOY_TOKEN` is configured on the backend.

## Verification
- Local repo: `pnpm lint && pnpm build`
- Server: `cd server && pnpm build`
- VM smoke checks:
  - `/status/`
  - `/status/data/status.json`
  - `/api/health`
  - `systemctl status somnia2-deploy.timer`
