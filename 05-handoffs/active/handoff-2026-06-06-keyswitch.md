---
date: 2026-06-06
slug: keyswitch
status: active
---

# Handoff — Keyswitch extension

## Where we left off
Keyswitch spike (Phases A–D) is **built and verified live** in Ableton Live 12 Beta — right-click a MIDI clip → "Apply keyswitch…" → palette → note inserted (9 successful inserts confirmed in host log). User says the current right-click → palette → click flow is **too slow** and wants a faster way to apply keyswitches.

## Immediate next step
Design + build a low-friction application method (see Open decisions for options). Decide the UX first, then implement in `03-experiments/keyswitch/src/extension.ts`.

## Context to load on resume
- Room: `03-experiments/keyswitch/` (README has full design + in-Live test steps)
- Files: `03-experiments/keyswitch/src/extension.ts`, `src/palette.html`
- Plan: `/Users/aviouslyavi/.claude/plans/could-there-possibly-be-shimmering-nova.md`
- SDK refs: `MidiClip.notes` (get/set `NoteDescription[]`), scopes `"MidiClip"` / `"MidiTrack.ArrangementSelection"`. No "selected notes" API, no keyboard-shortcut binding.

## Open decisions / blockers
- **Faster-apply UX** — pick a direction:
  - **Per-articulation context-menu items** (e.g. "Keyswitch → Legato" directly, skipping the palette) — fewest clicks, no modal.
  - **Submenu** of all articulations under one "Keyswitch" entry.
  - **Repeat-last-keyswitch** action (one click re-applies the last-used articulation).
  - **Auto-place at every phrase boundary** in a clip (reads note gaps, drops keyswitches automatically).
  - Note: SDK has no global hotkey binding, so a true keyboard shortcut isn't available — context-menu items are the fastest path.

## Dev-loop gotchas (cost us time — don't repeat)
- Live needs **Developer Mode ON** (Prefs → Extensions). It was already on.
- Only **one** extension host may be connected — kill any other host (e.g. similar-samples) before `npm start`, else Live binds to the wrong/old one and your menu items never appear.
- After a clean start, host log must show `Extension Host sends greeting to Live` + `send success`; if it's silent, Live didn't connect.
- Requires **Node 24** (we removed Homebrew node@22; default `node` is now /usr/local/bin v24).
- Run: `cd 03-experiments/keyswitch && npm start` (`.env` has `EXTENSION_HOST_PATH=/Applications/Ableton Live 12 Beta.app`).

## Notes
Verdict on feasibility = YES, proven. Promote to `02-extensions/keyswitch/` + `npm run package` once the faster-apply UX lands and remaining gates (time-selection, map persistence) are checked in Live.
