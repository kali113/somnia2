# Chain and Contracts

Use this for wallet, RPC, contract call, or ABI tasks.

## Frontend Chain Integration
- Core config: `lib/somnia/config.ts`
- Contract helpers: `lib/somnia/contract.ts`
- Reactivity/events helpers: `lib/somnia/events.ts`, `lib/somnia/reactivity.ts`
- Session wallet logic: `lib/somnia/session-wallet.ts`
- Thirdweb setup: `lib/thirdweb-config.ts`
- Wallet/contract hook shim: `lib/wagmi-shim.ts`

## Contract Sources
- Solidity contract: `contracts/PixelRoyale.sol`
- ABI used by app/server: `contracts/abi.json`

## Backend Chain Integration
- Server orchestrator wallet and clients are configured in `server/index.ts`.
- Required env vars are read there (`SOMNIA_RPC_URL`, `GAME_CONTRACT_ADDRESS`, `ORCHESTRATOR_PRIVATE_KEY`, `CORS_ORIGIN`).

## Safety
- Never commit private keys or populated `.env` files.
- Keep zero-address and missing-key behavior compatible with existing fallback logic.
