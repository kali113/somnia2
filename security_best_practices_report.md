# Pixel Royale Security Review

Date: 2026-03-06

## Executive Summary

This review covered the static Next.js frontend, the optional Express/WebSocket orchestrator, and the `PixelRoyale` Solidity contract.

The highest-risk issues are:

1. Anonymous clients can hit backend routes that make wallet-backed on-chain writes with the server-held orchestrator key.
2. The contract owner can withdraw funds that are already economically owed to queued players and winners.
3. The frontend generates and stores a raw EVM private key in browser storage, which is directly stealable by any same-origin script execution.

Taken together, the current design has a high likelihood of integrity loss if the backend is exposed to the internet, and a high likelihood of asset loss if the owner or orchestrator trust boundary is ever crossed. I would treat the backend write routes and the contract liability accounting issue as release-blocking.

## Scope And Method

- Reviewed frontend entry points and Somnia integration under `app/`, `components/dashboard/`, `components/game/`, and `lib/somnia/`.
- Reviewed backend entry points and runtime behavior under `server/index.ts`, `server/routes/*`, `server/store.ts`, and `server/indexer.ts`.
- Reviewed the deployed contract and deployment metadata under `contracts/PixelRoyale.sol` and `contracts/deployments/somnia-shannon-50312.json`.
- Did not inspect local secret files such as `.env.local`.
- This was a source review only. I did not run a live backend or perform runtime penetration testing.

## Critical Findings

### PR-SR-001: Anonymous callers can trigger wallet-backed on-chain writes from the backend

- Severity: Critical
- Location:
  - `server/routes/game.ts:130`
  - `server/routes/game.ts:212`
  - `server/index.ts:87`
  - `server/index.ts:107`
- Impact: Any network client that can reach the backend can spend the orchestrator wallet's gas budget and submit fraudulent results or storm commits.
- Evidence:
  - `POST /api/game/result` accepts unauthenticated JSON and, when configured, calls `orchestratorClient.writeContract(...)`.
  - `POST /api/game/storm` does the same for `commitStormCircle(...)`.
  - The orchestrator wallet is created from a server-side private key in `server/index.ts`.
  - The only visible gate is CORS. That is not authentication and does not stop direct `curl`, bots, or non-browser callers.
- Recommended fix:
  - Require authenticated server-to-server access or signed payloads from a trusted game authority before any wallet-backed write.
  - Add replay protection and bind writes to a specific active match.
  - Treat these routes as privileged control-plane endpoints, not public gameplay APIs.

### PR-SR-002: `withdrawFees()` can drain funds already owed to players

- Severity: Critical
- Location:
  - `contracts/PixelRoyale.sol:51`
  - `contracts/PixelRoyale.sol:182`
  - `contracts/PixelRoyale.sol:243`
  - `contracts/PixelRoyale.sol:589`
  - `contracts/PixelRoyale.sol:633`
- Impact: The owner can make `leaveQueue()` refunds and `claimRewards()` fail permanently by withdrawing too much balance first.
- Evidence:
  - The contract tracks liabilities in `pendingRewards`, and queued deposits are also economically reserved.
  - `withdrawFees(uint256 _amount)` transfers arbitrary ETH to `owner` without checking whether that balance is already needed for queue refunds or winner claims.
- Recommended fix:
  - Track reserved liabilities explicitly, for example `queuedDeposits`, `totalPendingRewards`, and `protocolFees`.
  - Only allow withdrawals of `address(this).balance - reservedLiabilities`.
  - Consider pausing withdrawals while games or claims are unsettled.

## High Findings

### PR-SR-003: The frontend stores an extractable raw private key in browser `sessionStorage`

- Severity: High
- Location:
  - `lib/somnia/session-wallet.ts:47`
  - `lib/somnia/session-wallet.ts:60`
  - `lib/somnia/session-wallet.ts:74`
  - `components/dashboard/SessionKeyPanel.tsx:72`
  - `components/dashboard/QueuePanel.tsx:126`
  - `lib/somnia/chest-log.ts:126`
- Impact: Any XSS, compromised third-party script, or same-origin browser compromise can steal the key and sign on-chain actions until expiry or revocation.
- Evidence:
  - `createSessionWallet()` generates a raw EVM private key and stores `{ privateKey, expiry }` in `sessionStorage`.
  - `restoreSessionWallet()` rehydrates that key and rebuilds a wallet client from it.
  - The session key is required by the queue UI, but the reviewed in-game verified container flow still uses `window.ethereum` and the currently connected wallet, not the stored session wallet.
- Recommended fix:
  - Prefer wallet-managed session permissions or delegated capabilities over app-managed raw keys.
  - If app-managed session keys must remain, sharply reduce TTL, avoid exposing the raw key outside the storage module, and wipe it on disconnect, visibility loss, and unload.
  - Reassess whether this feature should exist at all until gameplay transactions actually use the delegated session key.

### PR-SR-004: Backend result ingestion trusts attacker-controlled payloads and records them before verification

- Severity: High
- Location:
  - `server/routes/game.ts:135`
  - `server/routes/game.ts:147`
  - `server/store.ts:233`
- Impact: An attacker can poison leaderboards, match history, and local game state even if the contract write later fails.
- Evidence:
  - `POST /api/game/result` only checks that `placements` is a non-empty array and that `kills.length === placements.length`.
  - It does not verify that addresses are valid or unique, that kill counts are sane, or that the payload belongs to the current active match.
  - `store.recordGame(result)` runs before any trusted verification, and its boolean return value is ignored.
- Recommended fix:
  - Reject unsigned or unauthenticated results outright.
  - Enforce strict schema validation, including address format, uniqueness, integer bounds, and match membership.
  - Make local state updates contingent on trusted verification and reject duplicate `gameId` submissions.

### PR-SR-005: `submitGameResult()` is not bound to a recorded game and can be replayed or over-credit rewards

- Severity: High
- Location:
  - `contracts/PixelRoyale.sol:231`
  - `contracts/PixelRoyale.sol:243`
  - `contracts/PixelRoyale.sol:251`
  - `contracts/PixelRoyale.sol:641`
- Impact: A compromised or malicious orchestrator can fabricate results for nonexistent games, replay settlement, or credit duplicate addresses until payout integrity breaks.
- Evidence:
  - `_startGame()` emits `GameStarted` but does not persist a roster or active-game record on-chain.
  - `submitGameResult()` does not verify `_gameId == nextGameId - 1`, does not mark a game as settled, and does not compare `_placements` against a recorded roster.
  - `_placements.length` is not bounded to `MAX_PLAYERS`, and duplicate addresses are rewarded multiple times.
- Recommended fix:
  - Persist active game metadata on `_startGame()`.
  - Require one-time settlement for each recorded game.
  - Enforce `MIN_PLAYERS <= placements.length <= MAX_PLAYERS`, reject duplicates, and verify that all placements belong to the started roster.

## Medium Findings

### PR-SR-006: `openContainerVerified()` does not prove that a container belongs to a real match or player

- Severity: Medium
- Location:
  - `contracts/PixelRoyale.sol:346`
  - `contracts/PixelRoyale.sol:356`
  - `contracts/PixelRoyale.sol:383`
  - `lib/somnia/chest-log.ts:120`
  - `app/game/page.tsx:228`
- Impact: If downstream systems treat `ContainerOpened` as authoritative, players can fabricate arbitrary "verified" loot opens outside real gameplay.
- Evidence:
  - The function is public and only checks `_containerKey != 0`, `_containerType <= 2`, and whether the caller already opened that key.
  - Replay protection is per `(msg.sender, containerKey)`, not global per logical container.
  - Callers supply `_gameId`, `_containerId`, `_seed`, and `_playerNonce` themselves.
- Recommended fix:
  - Bind opens to a contract-tracked match roster and a tracked set of valid containers.
  - Make replay protection global per container.
  - If the feature is only cosmetic, document that explicitly and do not present it as a verified anti-cheat control.

### PR-SR-007: Any caller can set matchmaking mode preferences for any address

- Severity: Medium
- Location:
  - `server/routes/queue.ts:40`
  - `server/store.ts:127`
  - `server/store.ts:131`
- Impact: Attackers can write preferences on behalf of other users and influence mode selection.
- Evidence:
  - `POST /api/queue/mode` accepts arbitrary `address` and `mode`.
  - There is no wallet proof, signature, session, or other ownership check before storing the preference.
- Recommended fix:
  - Require proof of address ownership for writes, or keep this preference entirely client-side until a trusted mechanism exists.

### PR-SR-008: No visible CSP or clickjacking protection is present on the wallet-signing frontend

- Severity: Medium
- Location:
  - `next.config.mjs:7`
  - `app/layout.tsx:39`
  - `app/layout.tsx:50`
  - `.github/workflows/deploy-pages.yml:60`
- Impact: The browser has no visible backstop against script injection or framing attacks, which increases the blast radius of any frontend bug.
- Evidence:
  - The frontend is statically exported with `output: "export"`.
  - There is no visible Next.js header configuration, CSP meta tag, frame control, or equivalent runtime hardening in the reviewed code.
  - The Pages deployment workflow publishes the static `out/` directory directly.
- Recommended fix:
  - If static hosting remains required, add the strongest feasible early `<meta http-equiv="Content-Security-Policy" ...>` policy.
  - Prefer a CDN or proxy that can set real headers such as `Content-Security-Policy`, `frame-ancestors`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.

### PR-SR-009: Non-local insecure backend transport is permitted by configuration

- Severity: Medium
- Location:
  - `lib/somnia/runtime-config.ts:13`
  - `lib/somnia/runtime-config.ts:17`
  - `lib/somnia/runtime-config.ts:52`
  - `lib/somnia/runtime-config.ts:61`
  - `lib/somnia/matchmaking-client.ts:61`
  - `lib/somnia/storm-log.ts:22`
- Impact: If the app is deployed with `http://` or `ws://` outside localhost, network attackers can tamper with queue state, matchmaking events, and backend gameplay responses.
- Evidence:
  - `runtime-config.ts` accepts both `http://` and `https://` and derives `ws://` from insecure URLs.
  - The frontend uses that derived transport for REST polling, WebSocket matchmaking, and storm-commit requests.
- Recommended fix:
  - Permit `http://` only for `localhost` and `127.0.0.1`.
  - Require `https://` for all non-local deployments and derive `wss://` only from secure origins.

### PR-SR-010: The backend lacks rate limiting and WebSocket admission controls

- Severity: Medium
- Location:
  - `server/index.ts:106`
  - `server/index.ts:139`
  - `server/index.ts:142`
  - `server/routes/game.ts:130`
  - `server/routes/game.ts:212`
- Impact: Attackers can exhaust server resources with anonymous requests or connection floods and can repeatedly exercise expensive privileged paths.
- Evidence:
  - No rate limiter is installed for HTTP routes.
  - WebSocket connections are accepted into an unbounded `Set` with no auth, heartbeat eviction, or per-IP controls.
  - Sensitive POST routes are exposed on the same public app without admission controls.
- Recommended fix:
  - Add per-route rate limits, especially on write paths.
  - Gate WebSocket admission, enforce heartbeats, and cap concurrent clients.
  - Add backpressure handling and idle timeouts.

## Low Findings

### PR-SR-011: Baseline Express hardening is missing and raw internal errors are returned

- Severity: Low
- Location:
  - `server/index.ts:106`
  - `server/routes/game.ts:323`
- Impact: This increases information leakage and weakens defense in depth.
- Evidence:
  - No visible `helmet()` usage, `app.disable('x-powered-by')`, custom 404 handler, or custom error handler.
  - `/api/game/storm` returns a raw `details` field built from provider or transaction errors.
- Recommended fix:
  - Add standard Express hardening middleware and explicit error handling.
  - Log detailed failures server-side only and return generic client errors.

## Important Existing Mitigations

- `leaveQueue()` and `claimRewards()` zero or update state before the external call, which avoids an obvious direct reentrancy bug.
- Backend CORS is allowlisted rather than wildcarded in `server/index.ts:107`.
- Server-side queue mutation routes `/api/queue/join` and `/api/queue/leave` are explicitly disabled in `server/routes/queue.ts:19`.
- The frontend generally avoids obvious unsafe HTML rendering patterns in the reviewed application code.
- External links reviewed in dashboard components use `rel="noopener noreferrer"` when opened in a new tab.

## Operational Assumptions And Risk Notes

- `contracts/deployments/somnia-shannon-50312.json:5` and `contracts/deployments/somnia-shannon-50312.json:6` show the same EOA as both `deployer` and `orchestrator`. That collapses admin and settlement trust boundaries into one hot key.
- If the backend is intended to stay private and fronted by another authenticated control plane, the practical exploitability of PR-SR-001 and PR-SR-004 depends on that missing infrastructure. It is not visible in this repo and must be verified separately.
- If container verification is meant to be cosmetic only, PR-SR-006 becomes lower risk operationally, but the current code and UI language do not make that distinction clear.

## Recommended Remediation Order

1. Lock down backend write routes before exposing the orchestrator server to any shared network.
2. Fix contract liability accounting so owner withdrawals cannot break refunds and claims.
3. Remove or redesign browser-stored raw session keys.
4. Bind game settlement to recorded on-chain game state and reject duplicate or malformed placements.
5. Add browser hardening headers and enforce secure backend transport.
6. Add rate limiting, WebSocket controls, and baseline Express hardening.
