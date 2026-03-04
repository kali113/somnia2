# Frontend Map

Use this for UI, gameplay rendering, or routing tasks.

## Entry Points
- App shell: `app/layout.tsx`
- Landing page: `app/page.tsx`
- Play page: `app/play/page.tsx`
- Game page: `app/game/page.tsx`

## Component Layers
- Reusable primitives: `components/ui/*`
- Gameplay UI: `components/game/*`
- Dashboard/queue/rewards UI: `components/dashboard/*`

## Game Logic
- Engine systems live in `lib/game/*` (player, collision, storm, map, camera, input).
- Keep rendering and game loop changes localized to `lib/game` + `components/game`.

## Styling
- Global styles: `app/globals.css`, `styles/globals.css`
- Follow existing utility-first patterns in touched files; avoid broad style rewrites.
