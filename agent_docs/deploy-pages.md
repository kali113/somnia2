# Deploy to GitHub Pages

Use this for deployment, static export, or base-path issues.

## Build Behavior
- Next config: `next.config.mjs`
- Static export is enabled with `output: "export"` and `trailingSlash: true`.
- `basePath` and `assetPrefix` are derived from GitHub Actions env to support repo-path hosting.

## CI Workflow
- Deployment workflow: `.github/workflows/deploy-pages.yml`
- Trigger: push to `main` or manual dispatch.
- Build job installs with pnpm, runs `pnpm build`, then uploads `out/`.
- Deploy job publishes the Pages artifact.

## Troubleshooting Focus
- Broken assets on Pages usually indicate base path/asset prefix mismatch.
- If local works and Pages fails, compare `GITHUB_ACTIONS`, `GITHUB_REPOSITORY`, and generated paths under `out/`.
