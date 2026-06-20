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
1. KS pre-roll nudge (#6) — tiny, fixes real misfires. ✅ DONE + verified
2. Hotkeys 1–9 (#3) + re-preview on change (#1) + key-0 deactivate (#4). ✅ DONE + verified
3. Open zoomed (#5a). ⚠️ see #5a fix in Round 2 (currently shows ~33 bars, not the clip)
4. Live-apply over the bridge (#7) — unlocks #1's deeper form; medium. ✅ DONE + verified
5. Extend-clip-by-a-bar (#5b) — pending SDK length-setter check.
6. Device UI (#2) — after #7 settles the device/extension split.
7. Multi-track / one-device-per-group (#8) — ADR first; largest.

---

## Round 2 — new requests (2026-06-13, after #6/#3/#4/#1/#7 verified live)

Branch with verified work: `claude/artroll-backlog` (commits `51ba0cb`, `9ec1d77`).

### 9. Locate / set play-from position inside the extension
**Ask:** "Be able to locate inside the extension — right now it always plays
from the beginning of the clip." Want to click to set a play-from point and
start there.
**Notes:** `togglePlayback()` already passes `marker` if set
(`startBeat = marker != null ? snapBeat(marker) : 0`), but the insert marker
isn't an obvious "locator." Add an explicit ruler-click → set a locator beat,
draw it, and start from it. Synced path already takes a start position
(`pvCmd("play " + (CLIP_START + fromBeat)*1000)`), so passing the locator there
should make Live's transport start at the right song time. `roll.html`
transport section + ruler hit-testing.

### 10. FIX #5a — open zoomed to the clip's actual length
**Ask:** on open, fit the view to the selected clip. Reported broken: shows
~33 bars for a 2-bar loop clip.
**Notes:** `init()` sets `pxPerBeat = gridW()/clipDuration` from
`DATA.clip.duration`. If it shows 33 bars, `clip.duration` is returning far
more than the loop length (likely the full clip/slot extent, not the loop
region). Investigate the SDK clip API: use loop length (`loopEnd - loopStart`)
or end/start markers to get the *musical* length, and fit to that. Real bug,
not just a nice-to-have. `extension.ts` buildPayload (clip fields) + `roll.html`
init zoom.

### 11. Pencil mode: Ctrl/Cmd+click to marquee-select a range
**Ask:** while in pencil mode, hold Ctrl/Cmd + left-click-drag to select a
range of notes (instead of drawing).
**Notes:** In the pencil-tool mousedown branch, if `e.metaKey||e.ctrlKey`, run
the mouse-tool marquee path instead of inserting. Reuse the existing marquee
selection. Medium. `roll.html` interaction handlers (~line 800–1075).

### 12. Tool-swap hotkeys: b = pencil, a = mouse/regular, c = cut
**Ask:** tap `b` → pencil, `a` → regular (mouse), `c` → cut.
**Notes:** `setTool("pencil"|"mouse"|"cut")` already exists; bind bare b/a/c in
the keydown handler. Collisions OK: Cmd+A (select-all) is cmd-guarded, bare `a`
is free; `e` hold-cut stays. Easy. `roll.html` keydown.

### 13. Zoom to selection: tap `z`
**Ask:** `z` zooms into all selected notes.
**Notes:** Compute selection bbox (min start, max end, min/max pitch), set
`pxPerBeat` + `scrollX/scrollY` to fit (reuse init's fit math). No selection →
fit whole clip (overlaps #10). Cmd+Z (undo) is cmd-guarded; bare `z` free.
Easy. `roll.html` keydown + a fitTo(beatStart,beatEnd,pitchLo,pitchHi) helper.

### 14. Bank of saved articulation maps (per-instrument)
**Ask:** save a list/bank of articulation maps for different instruments. Later
(NOT yet): ship presets for common instruments pre-loaded in the manager.
**Notes:** Today one map persists at `storageDirectory/articulations.json`.
Move to a collection: `{ active: string, banks: { [name]: Articulation[] } }`
(single file) or per-instrument files. Add map-editor UI: bank dropdown +
Save-As / Rename / Delete. Payload carries active bank name + bank list; the
`save-map` round-trip extends to carry the bank id. Medium — design the storage
shape first. `extension.ts` map persistence + `roll.html` map overlay.

### IMPLEMENTATION DESIGN — Round 2 QoL batch (designed 2026-06-13, plan ready)
> ✅ **SHIPPED + MERGED (2026-06-14, PR #6 → main).** All waves A–F built, live-
> verified, and merged on `claude/artroll-round2`. Three live-verify fixes folded
> in: Cmd+V paste-after-source, legato length-to-next-in-time (any pitch), and
> trackpad wheel-zoom normalization. Horizontal Cmd/Ctrl-wheel zoom coefficient
> tuned to `0.0100` (`Math.exp(-dy * 0.0100)` in `roll.html`). ADR: live-apply
> mid-modal (`01-decisions/2026-06-13-artroll-live-apply-mid-modal.md`).

Full code-level plan (functions, insert points, signatures, edge cases) lives at
`~/.claude/plans/a-velocity-editing-zippy-dawn.md`. Built on exploration of
`roll.html` + `extension.ts`. **Decisions (Avi):** scroll zoom = horizontal-only
refine (ROW_H stays constant, no vertical pitch zoom); velocity multi-drag =
proportional scale (preserve relative dynamics); extras included = velocity ramp
(Shift-drag), legato/length-to-next, snap-to-scale (select-none/invert deferred).

Sequenced into waves (build + live-verify after each) — **all ✅ shipped in PR #6**:
- **A — keyboard/input (easy):** ✅ tool hotkeys b=pencil/a=mouse/c=cut; arrow
  nudge (←/→ by snap) + transpose (↑/↓ semitone, Shift=octave); Cmd+C/V/D
  clipboard (paste at marker; D = duplicate-after); Cmd/Ctrl+click marquee in
  pencil mode (delegate to onMouseToolDown); ruler-click locator (sets the
  existing `marker`, which already drives play-from; works in any tool).
- **B — transport:** ✅ loop playback — add `looping/loopStart/loopEnd` to payload
  (extension.ts buildPayload + RollPayload), refactor startPlayback SOFTWARE path
  into `scheduleSoftwareWindow(fromBeat)` that loops at LOOP_END→LOOP_START
  (synced path: Live loops natively). VERIFY loopStart/loopEnd are clip-local
  (else subtract clip.startTime). Playhead auto-follow: in playLoop, page scrollX
  when playhead exits the grid view.
- **C — legend/status/swatches:** ✅ DOM `.legendbar` row under the toolbar; one
  chip per articulation (number + artColor swatch + name); click selects all
  notes of that art + adopts currentArt; status line = selection count / grid /
  current art. renderStatus() in the requestDraw RAF callback; renderLegend() on
  art/map change via a setCurrentArt() helper.
- **D — velocity drag-lane:** ✅ add VEL_LANE=56, BOTTOM()=LANE+VEL_LANE; route grid
  boundary through BOTTOM() in just gridH() + inGrid (articulation lane stays at
  viewH-LANE). drawVelLane() (stem+head per note), velNoteAt/velToY/yToVel,
  drag.mode "velocity": proportional scale for multi-select, freehand sweep for
  single, Shift = straight-line ramp. Commits via pushUndoState → auto live-apply
  (serializeNotes already sends velocity).
- **E — extras:** ✅ legato/length-to-next (context menu + bare `L`: stretch each
  selected note to the next note **in time, any pitch** — corrected during verify
  from "next note on its pitch row", which ran melodic lines to clip end); snap-to-
  scale (payload carries song scale; toolbar toggle off by default; snapPitchToScale
  on place/transpose/move).
- **F — scroll zoom refine:** ✅ Cmd/Ctrl+wheel horizontal zoom-about-cursor,
  plain=v-scroll, Shift=h-scroll. Trackpad delta normalized (lines×16/pages×400,
  clamped ±120) so many tiny events don't compound; coefficient tuned to `0.0100`.

**Mousedown routing order:** ruler-locator → velLane → artLane → grid.
**Top risk:** velocity-lane vertical space — contained by the single BOTTOM()
helper (playhead/overlay/grid clip off gridH() and auto-correct).
Ships under the same PR as the rest of Round 2; live-verify before merge.

### QoL suggestions (Claude's, for Avi to pick from)
- **Velocity editing** — drag note tops, or a velocity lane, to set velocity
  (today notes just inherit original/100; no way to edit it in the roll).
- **Copy / paste / duplicate** — Cmd+C/V and Cmd+D on the selection (no
  clipboard today).
- **Arrow-key nudge** — ←/→ move selection by grid, ↑/↓ transpose a semitone,
  Shift+↑/↓ by an octave.
- **Loop playback** — loop the clip region during in-editor Play instead of
  stopping at the end (great for auditioning articulation tweaks live via #7).
- **Scroll-wheel zoom** — Cmd+wheel = horizontal zoom, Alt+wheel = vertical;
  plus a "fit" button. Pairs with #10/#13.
- **Playhead auto-follow** — auto-scroll to keep the playhead in view during
  playback.
- **Select-all-of-articulation** — click an articulation swatch (or its lane
  span) to select every note with that art (fast re-articulating).
- **On-screen hotkey legend** — a small 1–9 → articulation key now that the
  hotkeys exist; and a status line (selection count, grid, active art).

---

## Round 3 — new requests (from Avi's 2026-06-14 Round 2 live-verify) — NOT started

Surfaced while verifying Round 2. Round 2 (A–F + 3 fixes + `0.0100` zoom) shipped
in PR #6; these are the next candidates.

### 15. Pencil multi-note extend ✅ DONE + verified (Round 3, `7a563ea`)
**Ask:** in Mouse mode, dragging a note edge extends ALL selected notes together;
in **Pencil mode it doesn't**. Make pencil-mode edge-resize honor the multi-
selection too. `roll.html` — the pencil mousedown/resize branch should route
through the same multi-resize path the mouse tool uses.
**Fix:** `onPencilDown` resize branch collapsed `selection` to the single grabbed
note before `startResizeDrag` (which builds `origins` from `[...selection]`). Now
matches the mouse tool — `if (!selection.has(n._key)) selection = new Set([n._key])`
— so an edge-drag on a selected note resizes the whole selection; body grabs still
collapse to a single-note move. On `claude/artroll-round3` (off merged Round 2).

### 16. Cut tool: snap-to-grid by DEFAULT (Alt = freehand) ✅ DONE + verified (`7c3902f`)
**Ask:** the cut tool currently slices freehand and Cmd/Ctrl snaps to grid.
Invert it: **snap to grid by default**, hold **Option/Alt = freehand** slicing.
`roll.html` cut-tool handler (~line 1306, "unsnapped by default; Cmd/Ctrl snaps").
**Fix:** `cutAt` now `e.altKey ? xToBeat(x) : snapBeat(xToBeat(x))`. Cmd/Ctrl no
longer special-cased here. Cut tooltip updated.

### 17. Alt/Option = freehand off-grid drag ✅ DONE + verified (`7c3902f`)
**Ask:** let note drags (Mouse AND Pencil) move off-grid (ignore snap) while
Option/Alt is held — same modifier principle as the cut-tool toggle (#16). Apply
the Alt-bypass-snap check in the note-move drag path.
**Fix:** shared `move` handler and the pencil-place follow bypass `snapBeat` when
`e.altKey` held. Scoped to position MOVES, not edge-resize (resize-off-grid left
as a possible follow-up). Mouse/Pencil tooltips updated.

### 18. CC envelopes (orchestral) — BIGGEST, needs its own ADR
**Ask:** author CC1 (mod wheel), CC11 (expression), and other common orchestral
CCs as drawable envelopes in the roll. **Needs design first (likely its own ADR):**
lane vs overlay rendering; how CC data writes back through the SDK / live-apply
path; what the SDK MIDI-write surface exposes for CC (vs notes). Largest Round-3
item — scope before building.

### 19. Transport-locate + loop-region viz (carried from Round 2 #B)
**Ask:** (1) send the in-editor locator to Live's transport via the M4L bridge so
**synced** playback starts from the clicked position instead of the clip top; and
(2) render/confirm the loop region with a **visible loop playhead** in clip-local
bars. This is transport-bridge work (a song-position locate through the bridge),
not a one-liner. Files: `roll.html` transport section + the M4L maxpat/bridge.
NOTE from verify: ruler-click = play-from-here IS intended (not a bug); the gap is
that Live-driven (synced) transport restarts from the top rather than the locator.

### Still-open earlier backlog
#5b clip length-setter (extend-by-a-bar, pending SDK setter check) · #2 device UI ·
#8 one-device-per-group (ADR first) · #10 fix open-zoom (~33 bars, not clip length) ·
#13 zoom-to-selection (`z`) · #14 articulation banks (per-instrument saved maps).
