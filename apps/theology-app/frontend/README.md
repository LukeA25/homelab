# Study Desk — frontend mock shell

Dark tabbed theology study UI (iPad-first).

## Run

```bash
cd apps/theology-app/frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5175
```

## Notes

Plain text files. Toolbar rewrites the **current line** (Text / Header / Quote / Comment / Link). Toolbar sits above the keyboard when editing.

## Split

Tap the columns icon on a tab → pick an existing tab or open a new one on the right. No drag-to-split.

Contract: `src/lib/types.ts` + `src/lib/contract.ts` (v0.4)
