Original prompt: there is not a victory screen when killing everyone

- Created branch `fix-victory-screen`.
- Read `agent_docs/build-and-verify.md`, `agent_docs/frontend-map.md`, and the `develop-web-game` skill.
- Located an existing `VictoryScreen` component and confirmed the engine already emits `phase = 'victory'` in several elimination paths.
- Next: reproduce the end-of-match flow in-browser and compare engine state with the rendered UI.

- Current prompt: bots are running into the storm.
- Created branch `fix-bots-avoid-storm` from the current dirty worktree without touching unrelated edits.
- Read the bot AI, storm state, `/game` page, and the existing browser-test hooks.
- Diagnosis: bot loot waypoints ignore the safe zone, bots only switch to `move_to_zone` after they are already in storm damage, and fight strafing/chasing can drag them over the edge during a shrink.
- Implemented zone-aware bot navigation in `lib/game/bot.ts`: loot targets are clamped to the safe zone, bots proactively retreat before crossing the edge, and fight movement now biases back toward the zone when pressure is high.
- Added a dev-only `window.pixel_debug_snapshot()` / `window.pixel_debug_state` hook in `components/game/GameCanvas.tsx` to verify storm behavior without affecting production.
- Verification:
- `node $WEB_GAME_CLIENT --url http://localhost:3000/game/ ...` smoke run completed and produced screenshots/state under `output/web-game/storm-short-2/`.
- Fast-forwarded the game in-browser to ~`84.8s` (storm shrinking) and ~`127.0s` (post-shrink); both snapshots reported `botsInStorm: 0` and `botsOutsideTargetZone: 0`, with matching minimap screenshots in `output/web-game/storm-debug-keepalive/`.
- `pnpm lint` passed.
- `pnpm build` passed.
- `curl -I http://localhost:3000/` and `curl -I http://localhost:3000/play/` returned `200 OK`.

- Patched app/game/page.tsx to derive victory/elimination UI props from live gameStateRef so the overlay follows the authoritative engine phase, placement, and end time even if React callback state lags.
- Next: browser-verify the end-of-match overlay after the patch, then run lint/build.

- Re-ran the web-game Playwright client after the final patch.
- Browser regression check: forcing engine `phase = victory` with `onPhaseChange` disabled still renders `VICTORY ROYALE` after the new sync effect runs.
- `pnpm lint` passed; next running `pnpm build`.

- `pnpm build` passed.

- Current prompt: make it so i can play and use the web also in mobile
- Created branch `mobile-web-support` from the current dirty worktree without reverting unrelated edits.
- Read the mobile-relevant repo docs and the `develop-web-game` skill, then captured baseline mobile screenshots for `/`, `/play`, and `/game`.
- Added mobile-safe viewport handling:
  - Root viewport no longer disables zoom.
  - Game shell now uses `100dvh`.
  - Global safe-area variables and touch-action defaults were added.
  - `GameCanvas` now resizes from `visualViewport`.
- Added a touch gameplay path:
  - `lib/game/input.ts` now supports virtual move/aim axes plus virtual keys/clicks.
  - `components/game/MobileControls.tsx` adds on-screen move, aim, interact, reload/place, heal, and build buttons.
  - `components/game/GameHUD.tsx` now exposes tappable slot buttons on touch devices and uses responsive HUD sizing.
- Reduced mobile gameplay overlap:
  - Game minimap now shrinks on narrow screens.
  - Top HUD shifts below the utility row on touch devices.
  - Mobile event feed is condensed and kill feed is hidden on touch.
  - Mobile utility bar hides wallet connect in non-verified solo play to preserve space.
  - Victory screen now wraps and scales down for narrow screens.
- Verification completed:
  - `pnpm lint`
  - `pnpm build`
  - `develop-web-game` Playwright client rerun against `/game`, artifacts in `output/web-game/mobile-pass/`
  - Touch-emulated Playwright pass against `/game` confirmed movement changed player position and the build button toggled build mode on/off.
  - Refreshed mobile screenshots:
    - `output/mobile-check/home-after.png`
    - `output/mobile-check/play-after.png`
    - `output/mobile-check/game-after-controls.png`
- Remaining note:
  - Mobile build placement/shooting UI is implemented, but I only automated movement and build-mode toggling in this pass. A fuller multi-touch browser script would be the next step if deeper gameplay validation is needed.
