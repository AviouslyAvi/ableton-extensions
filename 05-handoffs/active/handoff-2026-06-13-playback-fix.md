---
date: 2026-06-13
slug: playback-fix
status: active
---

# Handoff — Articulation Roll playback: passthrough VERIFIED, in-editor sound FIXED (needs verify)

## Where we left off
Two bugs from the preview/playback thread are resolved. Branch
`claude/infallible-margulis-67c167` is pushed (HEAD `da9a86f`) and ready to PR
once the last item is live-verified.

1. **Silent track when device enabled — FIXED + VERIFIED LIVE.** Root cause:
   `ArtRollPreview.maxpat` had no `midiin->midiout` passthrough, so the Max MIDI
   Effect swallowed the track's own MIDI. Added the passthrough; confirmed on
   screen 2026-06-13 — the clip plays through the device into Kontakt. (Same root
   cause as the old "no playback" note.)
2. **No sound during in-editor Play (playhead moved silently) — FIXED, NEEDS
   LIVE VERIFY.** Root cause: `pvSend()` in `roll.html` forwarded **float**
   values during playback (`durMs = duration * secPerBeat * 1000`, and `ksHold`
   inherits it for held arts). The host's WS parser in `preview.ts` is
   `/^note (\d+) (\d+) (\d+) (-?\d+) (\d+)$/` — integers only — so every float
   frame was silently dropped. Click-preview worked only because it sends the
   integer `PV_DUR_MS`. Fix (`da9a86f`): round all five args to ints in `pvSend`.

## Immediate next step
**Live-verify in-editor playback now makes sound**, then PR the branch:
1. Host should be running from the worktree (`.claude/worktrees/infallible-margulis-67c167/02-extensions/articulation-roll`,
   `npm start`). If not: clear orphan (`pkill -9 -f "Helpers/ExtensionHost/node"`),
   then `npm start`. Dev Mode ON. (Connection was clean this session — greeting
   landed first try, no orphan.)
2. Open the Articulation Roll on a clip, press **▶ Play / Space** → you should
   now HEAR the part (it sequences notes out the same preview bridge/device).
   Playhead should sweep AND sound.
3. If good → **open the PR** for `claude/infallible-margulis-67c167`
   (preview bridge + passthrough fix + in-editor playback). `gh pr create`.

## If still silent after the rounding fix
- Confirm the new build is loaded (host restarted since `da9a86f`).
- Check the host log for `[articulation-roll/preview]` lines and whether WS
  frames arrive. Add a temporary `log()` in `preview.ts`'s WS `socket.on("data")`
  to confirm frames reach the host and match the regex.
- Verify the bridge is connected (green "● preview" dot in the roll toolbar).
- Remember: HTTP fallback coerces floats fine; the bug was WS-path only — so if
  the dot is green (WS) it exercised the broken path.

## Context to load on resume
- Room: `02-extensions/articulation-roll/` (in the **infallible** worktree) —
  `src/roll.html` (transport: `pvSend`/`startPlayback`/`drawPlayhead`/
  `togglePlayback`, ~line 195–280), `src/preview.ts` (WS parser regex),
  `src/extension.ts` (`DATA.tempo` from `context.application.song.tempo`),
  `ArtRollPreview.maxpat`
- Connection troubleshooting: `00-foundation/README.md` ("Host won't connect")
- Prior handoff (this thread): `05-handoffs/active/handoff-2026-06-12-preview-verified.md`

## Notes / SDK verdicts (don't re-chase)
- **No SDK transport API** — verified the full `Song` class; no start/stop/
  isPlaying/fire/playhead. The modal also blocks Live's transport. So true
  transport control is impossible; the in-editor Play is a software playhead that
  sequences notes out the existing bridge. Tempo comes from
  `context.application.song.tempo` (payload `DATA.tempo`, 120 fallback).
- maxpat install: bare `.maxpat` won't drag-drop — blank Max MIDI Effect → edit
  → File>Open `ArtRollPreview.maxpat` → copy/paste into device → ⌘S, placed
  BEFORE the instrument. (Watch that the `midiin->midiout` cord survives paste.)
- Ports: 7475 (webview→host), 7474 (host→M4L UDP).
- Optional: buy swub KS&EM (€29) to study its PC/CC/UACC output model.
