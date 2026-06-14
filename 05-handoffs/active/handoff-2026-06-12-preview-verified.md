---
date: 2026-06-12
slug: preview-verified
status: active
---

# Handoff — Articulation Roll preview VERIFIED LIVE

## Where we left off
Audible note preview **works live** — clicking a note in the roll plays
keyswitch-then-note through the instrument (green "● preview" dot, no undo entries).
The all-night host-connection blocker is solved (see below). Preview branch
`claude/infallible-margulis-67c167` is now verify-passed and ready to PR.

## Immediate next step
**Live-verify the two new changes (commit `974518c` on the same branch), then
PR `claude/infallible-margulis-67c167`.** Verify gate for the preview bridge
itself is already cleared; the new commit needs a quick live pass:
1. **Reload the preview device** — the `.maxpat` changed. Open the ArtRoll
   Preview M4L device's edit window, File>Open the updated `ArtRollPreview.maxpat`,
   copy/paste over the device contents, ⌘S. (Or rebuild the device fresh.)
2. **Confirm the silent-track bug is gone** — with the device enabled, play a
   clip / hit keys: the instrument should sound again.
3. **Test in-editor Play** — open the roll, press ▶ Play (or Space): the
   playhead sweeps and you hear the part through the preview device. Marker set
   = starts there; Esc/Stop halts.

## Open threads
- **"No playback" — DIAGNOSED + FIXED (needs live verify).** Root cause was the
  same maxpat bug as the silent-track issue: `ArtRollPreview.maxpat` had no
  `midiin->midiout` passthrough, so the Max MIDI Effect swallowed ALL of the
  track's own MIDI (clips, keys, Live's piano-roll preview) — only the
  OSC-injected preview-on-click survived. Fixed by adding the passthrough.
- **In-editor playback — BUILT (needs live verify).** SDK has NO transport API
  (verified the full `Song` class) and the modal blocks Live's UI, so true
  transport control is impossible. Instead the roll now sequences the clip's own
  notes out the existing bridge with a software playhead (Play button + Space).
  Tempo added to payload as `DATA.tempo` from `context.application.song.tempo`.
- Optional: buy swub KS&EM (€29) to study its PC/CC/UACC output model.

## What we did this chat
- **Solved the pre-greeting stall.** Root cause = an ORPHANED `…/Helpers/ExtensionHost/node`
  process (for `similar-samples`, reparented to PID 1) squatting the single dev-host slot.
  Fix: `pkill -9 -f "Helpers/ExtensionHost/node"` then relaunch. Full writeup +
  diagnostics now in **`00-foundation/README.md` → "Host won't connect"**.
- Merged **PR #2** (text-size bump), removed frosty worktree + branch.
- Loaded `ArtRollPreview.maxpat` (bare .maxpat won't drag-drop): blank Max MIDI Effect
  → edit → File>Open → copy/paste into device → ⌘S, placed BEFORE the instrument.

## Context to load on resume
- Room: `02-extensions/articulation-roll/` — `src/preview.ts`, `src/roll.html`
  (`previewNote()`), `ArtRollPreview.maxpat`
- Connection troubleshooting: `00-foundation/README.md` ("Host won't connect")
- Prior detail/forensics: `05-handoffs/active/handoff-2026-06-11-preview-bridge.md`
- ADR: `01-decisions/2026-06-11-artroll-preview-network-side-channel.md`

## Notes
- To run host: clear orphan (foundation), then `npm start` in extension dir
  (infallible worktree), Dev Mode ON. Ports: 7475 (webview→host), 7474 (host→M4L UDP).
