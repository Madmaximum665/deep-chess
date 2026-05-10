# DeepChess

A browser-based chess website where players challenge the Stockfish AI engine with three difficulty levels, move history, hints, and an evaluation bar.

## Run & Operate

- `pnpm --filter @workspace/deep-chess run dev` — run DeepChess frontend (port auto-assigned)
- `pnpm run typecheck` — full typecheck across all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS
- Chess logic: chess.js v1.x
- Board rendering: react-chessboard
- AI engine: Stockfish 18 lite (WASM, single-threaded) via Web Worker

## Where things live

- `artifacts/deep-chess/` — DeepChess React + Vite app
- `artifacts/deep-chess/public/stockfish.js` — Stockfish WASM loader (copied from node_modules)
- `artifacts/deep-chess/public/stockfish.wasm` — Stockfish WASM binary (lite single-threaded, ~7MB)
- `artifacts/deep-chess/src/hooks/useStockfish.ts` — Stockfish Web Worker hook
- `artifacts/deep-chess/src/pages/Home.tsx` — Home/stats page
- `artifacts/deep-chess/src/pages/Game.tsx` — Game logic and board
- `artifacts/deep-chess/src/components/` — EvalBar, ControlsPanel, PromotionDialog, MoveHistory

## Architecture decisions

- Zero backend — fully browser-only, no server-side code
- Stockfish runs as a Web Worker from the public folder to avoid blocking the main thread
- Single-threaded lite Stockfish WASM chosen for compatibility (avoids SharedArrayBuffer requirements)
- Stats stored in localStorage under `deepchess_stats`
- react-router-dom v7 used for client-side routing (Home → Game)

## Product

- Home page with win/loss/draw stats from localStorage
- Chess game vs Stockfish AI (Easy/Medium/Hard difficulty)
- Click-to-select or drag-and-drop piece movement
- Legal move highlighting, last-move highlighting, check highlighting
- Evaluation bar, move history, hint mode, undo, pawn promotion dialog
- Game over overlay with result and play-again button

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After updating stockfish in node_modules, re-copy the .js and .wasm files to public/
- The stockfish.wasm must be at the same URL path as stockfish.js (same directory)
- COOP/COEP headers are set in vite.config.ts server.headers for local dev

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
