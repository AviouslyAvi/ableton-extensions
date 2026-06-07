---
date: 2026-06-06
slug: keyswitch
status: active
---

# Handoff — Keyswitch extension

## Where we left off
Keyswitch spike (Phases A–D) was **built and verified live** in Ableton Live 12 Beta (9 inserts confirmed). This session: (1) **promoted** the project from `03-experiments/keyswitch/` → `02-extensions/keyswitch/`; (2) **built the faster-apply UX** the user asked for — **per-articulation context-menu items** (one `Keyswitch: <name>` per map entry, inserts at clip start with **no modal**) + a **`Repeat keyswitch: <name>`** action (clip + arrangement-selection scopes, label tracks last sound, persisted to `lastKeyswitch.json`); (3) set up a **`dist-extensions/`** folder and compiled both extensions into it (`Keyswitch.ablx`, `Similar-Samples.ablx`). Typechecks + builds clean.

**NOT yet done: live re-test.** The extension host was started but Live never completed the handshake (no `greeting`/`send success` in the log) — likely needs Developer Mode toggled / Live relaunched to reconnect. The new menu items are unverified in Live.

## Immediate next step
Re-test the fast-apply UX live. From `02-extensions/keyswitch`: `npm start`, confirm host handshake, then in Live right-click a MIDI clip → verify the `Keyswitch: <name>` items insert with no modal and `Repeat keyswitch: <name>` re-applies the last one. See README "Phased verification" steps 6–8.

## Context to load on resume
- Room: `02-extensions/keyswitch/` (README has full design + in-Live test steps, incl. new steps 6–8)
- Files: `02-extensions/keyswitch/src/extension.ts`, `src/palette.html`
- Compiled: `dist-extensions/Keyswitch.ablx` (rebuild via `npm run package` in the project, or `npm run package:all` at repo root)
- Plan: `/Users/aviouslyavi/.claude/plans/could-there-possibly-be-shimmering-nova.md`
- SDK refs: `MidiClip.notes` (get/set `NoteDescription[]`), scopes `"MidiClip"` / `"MidiTrack.ArrangementSelection"`. No "selected notes" API, no keyboard-shortcut binding. `registerContextMenuAction` returns an unregister handle (used to live-rebuild items on map edit); `registerCommand` has no unregister (so per-articulation commands use a fixed 32-slot pool reading the live map at trigger time).

## Open decisions / blockers
- **Faster-apply UX — DECIDED & BUILT:** per-articulation context-menu items + repeat-last. (Submenu not supported by the SDK — flat items only. Auto-place-at-phrase-boundaries deliberately skipped: it guesses musical intent; can be added later as a separate command if wanted.)
- **Remaining blocker:** live re-test of the new items (see "Where we left off").

## Dev-loop gotchas (cost us time — don't repeat)
- Live needs **Developer Mode ON** (Prefs → Extensions). It was already on.
- Only **one** extension host may be connected — kill any other host (e.g. similar-samples) before `npm start`, else Live binds to the wrong/old one and your menu items never appear.
- After a clean start, host log must show `Extension Host sends greeting to Live` + `send success`; if it's silent, Live didn't connect.
- Requires **Node 24** (we removed Homebrew node@22; default `node` is now /usr/local/bin v24).
- Run: `cd 02-extensions/keyswitch && npm start`. **`.env` is gitignored** — if missing after a fresh checkout, recreate it with `EXTENSION_HOST_PATH=/Applications/Ableton Live 12 Beta.app/Contents/Helpers/ExtensionHost/ExtensionHostNodeModule.node` (full path to the `.node` module, not just the `.app`).
- `node_modules` is gitignored too — run `npm install` in the project after a fresh checkout before `npm start`.

## Notes
Verdict on feasibility = YES, proven. **Promoted** to `02-extensions/keyswitch/`; compiled to `dist-extensions/Keyswitch.ablx`. Remaining gates to confirm in Live before calling it done: the new fast-apply items (README steps 6–8), plus the earlier time-selection / map-persistence gates.
