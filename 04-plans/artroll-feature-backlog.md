# Articulation Roll — feature backlog & brainstorm

Captured 2026-06-13 after transport-sync shipped (PR #4). Each item has Avi's
ask verbatim-ish + a first-pass feasibility note from the code as it stands.
Branch with the latest code: `claude/artroll-transport-sync` (HEAD `bd17940`).
Key files: `02-extensions/articulation-roll/src/{extension.ts,roll.html,preview.ts}`,
`ArtRollPreview.maxpat`.

---

## 1. Live preview of articulation changes (before Apply)
**Ask:** "I cannot hear the articulation changes while inside the editor until
hitting Apply. Can changes update live?"
**Notes:** Clicking a note already previews it through the bridge
(`previewNote()` → keyswitch+note). The gap: when you *change* a note's
articulation, it isn't re-previewed with the new keyswitch. Quick win: call
`previewNote(n)` on art-change so you hear the new articulation immediately.
Deeper version overlaps #7 (write to the clip live so it plays in transport
context). Articulations only become audible keyswitch notes once Apply writes
them to the clip — live audibility in transport needs the live-apply path.

## 2. M4L device UI — brainstorm
**Ask:** "Make a little UI for the M4L device. What buttons? Maybe delete/bypass
articulations? Brainstorm."
**Ideas to weigh:** device bypass toggle; "panic / all-notes-off"; a connection/
activity LED (note + transport frames seen); port readout (7474/7475/7476);
bypass-keyswitch-injection vs pass-through; maybe a small monitor of last
note/keyswitch. "Delete/bypass articulations" probably belongs in the *extension*
UI, not the device (the device has no notion of the art map). Decide device-vs-
extension split.

## 3. Articulation hotkeys 1–9
**Ask:** keys 1–9 assign the selected note(s) to articulation N.
**Notes:** `roll.html` already has a keydown handler + an `artMap`. Map digit →
`artMap[n-1]`, set `.art` on selected notes, re-preview (ties into #1). Easy.
Note: Cmd/Ctrl+1/2 is already bound to grid — make sure bare 1–9 don't collide.

## 4. Key 0 = deactivate note (Ableton parity)
**Ask:** "Could 0 be deactivate-note like in Ableton?"
**Notes:** Add a deactivated/muted flag to notes, toggle on `0`, render greyed,
exclude from playback/preview. `NoteDescription` — check whether the SDK carries
a mute/deactivated field (`midiclipGetNotes`/`SetNotes`); if not, the roll must
track it and simply not write deactivated notes (or write them muted if the
field exists). Verify SDK note shape.

## 5. Open zoomed-in; extend clip by a bar
**Ask:** on open, zoom into the clip; and extend the currently selected clip by a
bar from within the extension.
**Notes:** Zoom = set initial view to fit `clipDuration` (layout math already in
`roll.html`; just set pxPerBeat/scroll on load). Extend-by-a-bar = needs a clip
length setter. SDK has `clipGetEndMarker`/`clipGetLoopEnd`; confirm setters exist
(`clipSet*`) — `clipSetLooping` is present; need end/loop setters to grow the
clip. Research the SDK clip API for length mutation.

## 6. Keyswitch pre-roll nudge (TINY early placement)
**Ask:** place keyswitches a tiny bit early (1/64 or 1/128) so they reliably
trigger before the note above them — perfectly-quantized keyswitches sometimes
don't fire.
**Notes:** In `keyswitchesFromNotes()` (`extension.ts`), subtract a small epsilon
from each keyswitch `startTime` (e.g. 1/64 beat = 0.0625, or 1/128 = 0.03125),
clamped at ≥0. High value, low effort. Relates to the existing KS_LEAD pre-roll
concept in the keyswitch extension. Make the nudge a constant (maybe later a
setting).

## 7. Apply without closing / live preview on change
**Ask:** "Select Apply and the extension doesn't close? Or better, just have Live
preview when changed in the extension."
**Notes:** The SDK modal only returns via `close_and_send`, so Apply closes by
design. BUT the preview bridge already escapes the modal — add an `apply` command
over the bridge so the host writes `clip.notes` mid-modal *without* closing. That
single mechanism enables both "Apply, stay open" and true live preview (write on
change → Live plays the real keyswitches in transport). This is the big enabler;
design carefully (debounce writes, undo coalescing).

## 8. One device per group instead of per track
**Ask:** "Avoid an M4L device on EVERY articulated track. Put one on a group with
independent per-track control? Or pick the active track inside the extension,
like FabFilter Pro-Q 4 cross-track editing?"
**Notes:** Hardest item. A group device sees merged MIDI and can't separate
tracks without channel routing. Options to explore: (a) device addresses tracks
by MIDI channel; (b) the extension targets the selected track's device by a
per-track port/id; (c) keep one device per track but make install trivial. The
extension already edits one clip at a time, so "select active track in the
window" is mostly a workflow/targeting question. Needs an ADR before building.

---

### Suggested sequencing (cheapest-highest-value first)
1. KS pre-roll nudge (#6) — tiny, fixes real misfires.
2. Hotkeys 1–9 (#3) + re-preview on change (#1) + key-0 deactivate (#4).
3. Open zoomed (#5a).
4. Live-apply over the bridge (#7) — unlocks #1's deeper form; medium.
5. Extend-clip-by-a-bar (#5b) — pending SDK length-setter check.
6. Device UI (#2) — after #7 settles the device/extension split.
7. Multi-track / one-device-per-group (#8) — ADR first; largest.
