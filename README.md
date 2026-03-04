# somnia2

Pixel Royale Somnia demo, ported as a static Next.js site for GitHub Pages.

## Local development

```bash
pnpm install
pnpm dev
```

## Production build

```bash
pnpm build
```

This project is configured with `output: "export"` and deploys from `main` using:

- `.github/workflows/deploy-pages.yml`
- GitHub Pages Actions deployment (`actions/deploy-pages`)

Expected Pages URL:

`https://kali113.github.io/somnia2/`
