---
date: 2026-06-05
slug: similar-samples
status: active
---

# Handoff — Similar Samples

## Where we left off
All features coded, typecheck-clean, reloaded into the live host (connects fine). Original-skip
counts confirmed by code trace (all→3, other-from-match→2, other-from-original→3) — in-Live
eyeball still nice-to-have but the logic is unconditional. `.ablx` re-cut. **New command built:**
"Unpack This Take Lane → Track". README brought up to date.

## Immediate next step
Test the new **Unpack This Take Lane → Track** in Live (right-click a clip inside a *match* lane
→ should spin out only that one lane to a new track; on the `Original ·` lane it no-ops with a
message). If good, re-cut the `.ablx` again (`npm run package`) since it was packaged just
*before* this command landed. Code: `02-extensions/similar-samples/src/extension.ts`.

## Context to load on resume
- Room: `02-extensions/similar-samples/` — `README.md` is now current (Original lane, all three
  unpack entry points, dedup logic all documented).
- ADR: `01-decisions/2026-06-05-similar-samples-single-vs-split-extension.md` (keep unified).
- Dev loop: `pkill -f extensions-cli; pkill -f ExtensionHost; sleep 1;` then
  `PATH="/usr/local/bin:$PATH" npm start` (Node 24 at /usr/local/bin); logs →
  `.live-storage/npm-start.log`. Offline match eval: `npm run index -- --nn …`.

## What we did this chat
- Verified whole flow live (blocker gone after Live relaunch).
- **Self/dup exclusion** (`DEDUP_DISTANCE` = near-zero audio dist + de-suffixed stem) — kills the
  100% self-match + unpack doubling; matcher confirmed healthy via `--nn` eval.
- **Unpack Other** moved ArrangementSelection → **AudioClip scope** (clicked clip → parent
  TakeLane); reliable skip (selected_lanes was not).
- Added top **"Original ·" take lane** for A/B; unpack always skips it. Wrote the split ADR.

## Open decisions / blockers
- **"Unpack This Take Lane → Track" — DONE** (AudioClip-scope cmd `similarSamples.unpackThis`;
  `runUnpack` with skip = all lanes except `keepLane`; no-ops on Original/non-lane clips).
  Pending only the live test above.
- `SIMILARITY_DECAY=0.5` — looked honest once self-match removed; revisit only if numbers feel off.
- (2b) similarity dial — still HELD.

## Notes
- `.ablx` was re-cut once this session, but **before** the new Unpack-This command — re-package
  after the live test to make the release current. README doc debt is cleared.
