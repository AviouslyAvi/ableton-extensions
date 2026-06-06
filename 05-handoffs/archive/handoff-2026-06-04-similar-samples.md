---
date: 2026-06-04
slug: similar-samples
status: active
---

# Handoff — Similar Samples extension

## Where we left off
Take-lane placement + integrated Find popup **plus (2a) similarity % on lane names and (4) Unpack Take Lanes → Tracks** are all coded & typecheck-clean (build passes, bundles to dist/extension.js). Still **blocked: dev host won't connect to Live** — needs a full Live relaunch to verify the whole flow in one pass.

## Context to load on resume
- Room `02-extensions/similar-samples/` (read `README.md`). Code: `src/extension.ts`; popup = `promptMatchCount`/`findHtml` (~L219–295).
- Plan: `~/.claude/plans/now-what-about-adjusting-fizzy-puzzle.md`.

## What we did this chat
- Placement "new track" → **take lanes** on the clicked clip's track, aligned to start (in-place A/B). `track.createTakeLane()` + `TakeLane.createAudioClip()`.
- Match count = **option C**: Find opens a popup pre-filled w/ saved count (Enter accepts), persists to `config.json` in `.live-storage`. Separate "Settings…" item removed.
- `Similar-Samples-0.1.0.ablx` is **STALE** (predates lanes+popup); re-cut via `npm run package`.

## Open threads / next build
- **(2a)** ✅ DONE — `similarityPercent(score)` in `features.ts` (exp decay, k=0.5, display-only); lane names now `<sample> · NN%`. Tune `SIMILARITY_DECAY` after seeing real numbers in Live.
- **(4)** ✅ DONE — **"Unpack Take Lanes → Tracks"** registered on `AudioTrack` scope (right-click track header). `unpackTakeLanes()` in `extension.ts`: one new audio track per non-empty lane, audio clips recreated at original pos (filePath/start/duration/warp + name/color). Non-destructive; loop settings not copied; new-track visual order may differ from lane order (clip→track pairing always correct).
- **(2b)** HELD per decision — revisit only if the (2a) % numbers show a dial is worth it.

## BLOCKER — host won't connect
`npm start` stops at `Started: Extension Host 1.0.0`; `...greeting to Live` + `[Similar Samples] storage directory:` never appear → menu items don't register. Cause: stale dev connection.
**Fix:** Ctrl-C → `pkill -f extensions-cli; pkill -f ExtensionHost` → **fully quit Live (Cmd-Q)** → reopen Live (Dev Mode ON) → `PATH="/usr/local/bin:$PATH" npm start`. Storage-directory line = registered.

## Exact next step
Relaunch Live to connect the host (see BLOCKER), then verify the full flow in one pass:
1. Find → popup → Enter → take lanes appear, each named `<sample> · NN%`.
2. Show Take Lanes → audition; sanity-check the % feels right (tune `SIMILARITY_DECAY` if not).
3. Right-click track header → **Unpack Take Lanes → Tracks** → one new track per lane, clips at the same position.
Then re-cut the package: `npm run package` (the `.ablx` is now two builds stale).

## Notes
- Node 24 needed (brew node@22 rejected; 24.16 at `/usr/local/bin`).
- `.live-storage/host.log` = old launches; user's `npm start` logs to its terminal only.
