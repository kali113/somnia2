# VM Auto Deploy

Use this when working on the VM deployment pipeline and status page.

## Layout
- Installer and deploy scripts: `ops/vm/`
- Status site source: `ops/vm/status-site/`
- VM install root: `/opt/somnia2-deployer`
- Live status site root: `/var/www/somnia2-status`

## Runtime
- `systemd` timer `somnia2-deploy.timer` runs every minute.
- `deploy.sh` fetches `origin/main`, skips if unchanged, otherwise builds a new release under `releases/`.
- Frontend export syncs to `/var/www/somnia2`.
- Backend restarts through PM2 using `ecosystem.config.cjs` and the stable `current` symlink.
- Status files are written to `/var/www/somnia2-status/data/`.

## Verification
- Local repo: `pnpm lint && pnpm build`
- Server: `cd server && pnpm build`
- VM smoke checks:
  - `/status/`
  - `/status/data/status.json`
  - `/api/health`
  - `systemctl status somnia2-deploy.timer`
