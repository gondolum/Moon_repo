# RaceLine — Racing Kings Opening Trainer

Mobile-friendly web app for analyzing and training **Racing Kings** openings from your Lichess games.

## Features

1. **Import** — enter a Lichess username; downloads up to 1000 Racing Kings games via the public API
2. **Openings overview** — groups games by early move sequences, ranks worst-performing lines, surfaces repeated mistakes
3. **Offline analysis** — [Fairy Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish) WASM (`UCI_Variant = racingkings`) runs locally in the browser
4. **Train** — learn corrected lines with move suggestions, then practice without hints; perfect runs get a checkmark

Games and progress are stored in IndexedDB on your device.

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL (COOP/COEP headers are enabled so SharedArrayBuffer works for the engine).

```bash
npm run build
npm run preview
```

## Phone use

This is a Progressive Web App–style site: open it in mobile Chrome/Firefox, then “Add to Home Screen”. Analysis runs on-device; only the Lichess download needs network.

## Stack

- React + Vite + TypeScript
- `chessops` for Racing Kings rules / move generation
- `fairy-stockfish-nnue.wasm` for offline evaluation (classical eval; NNUE optional)
- `idb` for local persistence
