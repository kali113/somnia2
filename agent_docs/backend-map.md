# Backend Map

Use this for API, queue, indexing, or WebSocket updates.

## Entry and Wiring
- Server bootstrap: `server/index.ts`
- Shared in-memory state: `server/store.ts`
- Chain event ingestion: `server/indexer.ts`

## Routes
- Player APIs: `server/routes/player.ts`
- Queue APIs: `server/routes/queue.ts`
- Game result APIs: `server/routes/game.ts`
- Leaderboard APIs: `server/routes/leaderboard.ts`

## Runtime Model
- Express attaches shared state/clients onto each request in `server/index.ts`.
- Queue and game events broadcast over WebSocket path `/ws/queue`.
- Store is in-memory; restarts reset runtime state.

## Change Discipline
- Keep HTTP route behavior aligned with current JSON response shapes.
- Validate all incoming user input before mutating queue/game state.
