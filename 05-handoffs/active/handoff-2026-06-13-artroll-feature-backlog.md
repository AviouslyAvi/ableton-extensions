---
date: 2026-06-13
slug: artroll-feature-backlog
status: active
---

# Handoff — Articulation Roll: transport sync shipped, feature backlog open

## Where we left off
Transport sync **shipped & verified live** — in-editor Play now drives Live's
real transport via the M4L bridge (hear the whole arrangement, in sync; playhead
follows Live). PR #4 open. Avi then dumped an 8-item feature backlog to work
through next.

## Immediate next step
Start the backlog. Cheapest-highest-value first = **#6 keyswitch pre-roll nudge**
(subtract ~1/64 beat from KS `startTime` in `keyswitchesFromNotes()` so they fire
reliably). Then hotkeys 1–9 + re-preview-on-change + key-0 deactivate.
**Full backlog (all 8 items + per-item feasibility): `04-plans/artroll-feature-backlog.md`.**

## Context to load on resume
- Room: `02-extensions/articulation-roll/` (work it in the **infallible-margulis-67c167**
  worktree, where the dev host runs: `npm start`, Dev Mode ON).
- Files: `src/extension.ts` (keyswitchesFromNotes, payload, clip API),
  `src/roll.html` (transport, keydown, artMap, preview), `src/preview.ts` (bridge),
  `ArtRollPreview.maxpat`.
- Plan: `04-plans/artroll-feature-backlog.md`
- ADR (transport): `01-decisions/2026-06-13-artroll-transport-via-m4l-bridge.md`

## Open decisions / blockers
- Several items need SDK checks before building: note mute/deactivate field (#4),
  clip length setters for extend-by-a-bar (#5b). Item #8 (one device per group /
  multi-track) needs its own ADR first.
- #1 live-preview and #7 Apply-without-close share one enabler: an `apply`
  command over the bridge so the host writes `clip.notes` without closing the
  modal. Design before building.

## Notes
- Two open PRs: #3 (preview bridge + passthrough + in-editor playback) and
  #4 (transport sync, `claude/artroll-transport-sync`, HEAD `bd17940`). Merge #3
  first if not already, then #4.
- Branches stack: `infallible-margulis-67c167` → `artroll-transport-sync`.
- Updating an installed M4L device after a `.maxpat` change = re-paste the patch
  (objects get added); keep `midiin→midiout` cord, device BEFORE the instrument.
- Ports: 7475 webview↔host · 7474 host→M4L · 7476 M4L→host. Song time = integer
  milli-beats end to end (bridge is int-only).
