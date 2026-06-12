---
date: 2026-06-11
slug: preview-bridge
status: active
---

# Handoff — Articulation Roll preview bridge

## Where we left off
Mid-modal probe PASSED live (all four localhost side-channels escape the SDK
modal; WebSocket primary). Audible note preview is integrated into the roll and
committed/pushed on `claude/infallible-margulis-67c167`. M4L port ruled
unnecessary for preview.

## Immediate next step
Live-verify preview: toggle Developer Mode (host stalled pre-greeting — log
`/tmp/artroll-preview.log`), drop `ArtRollPreview.maxpat` on an instrument track
(Max MIDI Effect, before the instrument), open the roll, click notes → expect
green "● preview" dot + keyswitch-then-note, and NO undo entries. Then PR the branch.

## Context to load on resume
- Full detail: `05-handoffs/active/handoff-2026-06-11-articulation-roll.md`
  (SESSION 2 UPDATE block at top)
- Room: `02-extensions/articulation-roll/` — `src/preview.ts` (host WS/HTTP
  :7475 → OSC/UDP :7474), `previewNote()` in `src/roll.html`, `ArtRollPreview.maxpat`
- ADR: `01-decisions/2026-06-11-artroll-preview-network-side-channel.md`
- Options chart: `/Users/aviouslyavi/.claude/plans/so-how-do-we-jazzy-cascade.md`
- Spike (probe evidence): `03-experiments/artroll-preview-bridge/`

## Open decisions / blockers
- Merge PR #2 (text-size bump, `claude/frosty-solomon-cf8a62`) — classifier
  blocked self-merge; delete frosty worktree after.
- After live-verify: PR/merge `claude/infallible-margulis-67c167`.
- Optional: buy swub KS&EM (€29) to study its PC/CC/UACC output model.

## Notes
- Ports: 7475 (webview→host HTTP/WS), 7474 (host→M4L UDP `/artroll/note`).
- One extension host at a time; port collision = preview silently disabled.
- SDK has no envelope-writing API, so swub-style automation-lane approaches
  can't integrate — preview had to go through the network/M4L route.
