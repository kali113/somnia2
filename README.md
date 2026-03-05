# somnia2

Pixel Royale on Somnia Shannon Testnet.

## Somnia testnet network info

- Chain ID: `50312`
- Symbol: `STT`
- RPC: `https://dream-rpc.somnia.network`
- Explorer: `https://shannon-explorer.somnia.network/`
- Faucet: `https://cloud.google.com/application/web3/faucet/somnia/shannon`

Source: Somnia docs (`docs.somnia.network/developer/network-info`).

## Deploy PixelRoyale contract

1. Fund your deployer wallet on Shannon faucet.
2. Add env values in `.env.local` (or shell):

```env
SOMNIA_DEPLOYER_PRIVATE_KEY=0xYOUR_DEPLOYER_PRIVATE_KEY
SOMNIA_ORCHESTRATOR_ADDRESS=0xYOUR_ORCHESTRATOR_ADDRESS
```

3. Deploy:

```bash
pnpm deploy:somnia
```

4. Use the printed address for:

- `NEXT_PUBLIC_PIXEL_ROYALE_ADDRESS` (frontend)
- `GAME_CONTRACT_ADDRESS` (backend)

Deployment metadata is written to `contracts/deployments/somnia-shannon-50312.json`.

## Frontend setup

1. Copy env file and add your deployed game contract:

```bash
cp .env.example .env.local
```

2. Set the deployed contract address:

```env
NEXT_PUBLIC_PIXEL_ROYALE_ADDRESS=0xYOUR_DEPLOYED_PIXEL_ROYALE_CONTRACT
```

3. Install and run:

```bash
pnpm install
pnpm dev
```

## Backend setup (orchestrator)

```bash
cd server
cp .env.example .env
pnpm install
pnpm dev
```

Required backend env:

- `GAME_CONTRACT_ADDRESS`
- `ORCHESTRATOR_PRIVATE_KEY`

## GitHub Pages deployment

GitHub Pages does not read your local `.env` files.

Set repository variable:

- `NEXT_PUBLIC_PIXEL_ROYALE_ADDRESS`

The workflow resolves the contract address from:

- `vars.NEXT_PUBLIC_PIXEL_ROYALE_ADDRESS` (preferred), or
- `contracts/deployments/somnia-shannon-50312.json` (`contract.address`) if the repo variable is missing.

If neither is present (or the address is invalid), the Pages build fails with a clear error.

Workflow: `.github/workflows/deploy-pages.yml`
