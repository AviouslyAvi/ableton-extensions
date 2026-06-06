---
date: 2026-06-03
slug: similar-samples
status: active
---

# Handoff — Similar Samples extension

## Where we left off
Built and **successfully loaded into Live 12 Beta** the `similar-samples` extension. Splice library indexed (3,662 samples), ranking validated.

**In-Live flow CONFIRMED working (2026-06-04).** `host.log` shows 8 successful placements across two days, incl. 3 today — kick clips matched kicks, a percussion/SFX clip matched percussion (so the matcher discriminates by clip type, not always-kicks). Right-click → Find Similar Samples → 3 matches placed on a new track. Validated end-to-end.

**`.ablx` PACKAGED (2026-06-04):** `Similar-Samples-0.1.0.ablx` (3.3 MB) built via `npm run package`. Contains only `manifest.json` + `dist/extension.js` (production, minified). No index inside — by design.

## Immediate next step
Decide on real distribution. The `.ablx` installs + shows the menu, but ships **no index** and there's no in-Live way to build one — recipient must run the separate Node indexer CLI and drop `index.json` in the extension storage dir. So it's shareable as a demo (to people who'll also clone the repo), not a one-click product yet. Next real step = close that gap: standalone indexer binary + in-extension "set library folder" webview.

## Context to load on resume
- Room: `02-extensions/similar-samples/` — read its `README.md` first.
- Code: `src/extension.ts`, `src/features.ts` (DSP+scoring), `src/indexer.ts`, `src/index-format.ts`.
- SDK gotchas/limits: `00-foundation/README.md` ("SDK limitations, gotchas & what NOT to do").

## Open decisions / blockers
- ~~Build `.ablx`~~ → DONE. `Similar-Samples-0.1.0.ablx` built.
- ~~Right-click placement in Live~~ → DONE, confirmed via host.log.
- **OPEN — distribution:** index built by separate Node CLI → not one-click installable. The `.ablx` alone is a demo, not a product. Follow-on: ship indexer as standalone binary + in-extension "set library folder" webview so end users never touch Node/CLI. Not started.
- Note: host process is currently STOPPED (no `npm start` running). Relaunch to test live again.

## Notes
- Run with Node 24: `PATH="/usr/local/bin:$PATH" npm start` (shell default is brew node@22; 24.16 lives at `/usr/local/bin/node`). Live Beta open + Developer Mode ON required.
- `start` pins storage to `.live-storage/`; index persists, no re-index unless library changes.
- End users running a `.ablx` don't need Node (Live bundles its own); they DO need the Live Beta. The indexer step still needs Node.
- Other sample folders found: User Library (1,168), Factory Packs (5,222).
