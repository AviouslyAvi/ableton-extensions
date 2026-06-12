# Articulation Roll

An FL-Studio-style, articulation-aware MIDI editor for Ableton Live, hosted in a
modal webview. Right-click a MIDI clip → **Edit (Articulation Roll)…** → a piano
roll opens; edit notes the FL way, tag time regions with articulations, hit
**Apply** and the notes + the matching keyswitch trigger notes are written back
to the clip in a single undo step.

This is the sibling of the [`keyswitch`](../keyswitch/) extension — it reuses the
same articulation→pitch map shape, but gives you a full editing surface instead
of one-shot context-menu inserts.

## Why a popup (and what it can't be)

The SDK exposes **modal webviews only** — there is no way to dock a panel into
Live's own piano roll, no realtime selection sync, and no Live-bound keyboard
shortcuts (see `00-foundation/README.md`). So this is a snapshot editor:

- The modal **owns the clip while it's open**. It loads the clip's notes when it
  opens and overwrites the clip's notes on **Apply**. Don't edit the same clip in
  Live while the roll is open — Apply will overwrite those edits.
- **Cancel / Esc** leaves the clip untouched.
- Articulations are **keyswitch notes** (low trigger pitches), the only
  articulation mechanism the SDK supports — no MPE / note-expression / per-note CC.

## How it works

Articulation is a **per-note property** (FL "Articulate"-style note coloring):
every melodic note carries an `art` (articulation name or none) and is tinted by
its articulation's color. The bottom lane is a **derived view** of those notes —
it shows the keyswitch runs Apply will write — and painting in it bulk
re-articulates the notes inside the painted span.

```
right-click MIDI clip
        │  context-menu action "Edit (Articulation Roll)…"
        ▼
extension.ts (host)
  • split clip.notes into melodic notes vs keyswitch-pitch notes (per the map)
  • derive each melodic note's ART from the most recent keyswitch at-or-before it
  • inject { clip, notes (with art), articulations } into roll.html as a data URI
        ▼
roll.html (webview, canvas piano roll)
  • three tools (Mouse / Pencil / Cut), multi-select, full in-modal undo/redo
  • re-articulate via right-click menu, Selector Mode, or lane paint
  • Apply → returns { notes (melodic only, each with art) } via close_and_send
        ▼
extension.ts (host)
  • group consecutive same-art note runs → one keyswitch note per run start
  • merged = melodic notes + keyswitch notes
  • context.withinTransaction(() => clip.notes = merged)   // one undo
```

The host preserves note fidelity with an **id overlay**: each melodic note sent
to the roll carries an `id` indexing back to the original `NoteDescription`. On
Apply, an edited note is rebuilt by spreading its original (so `probability`,
`velocityDeviation`, `releaseVelocity`, `muted`, … survive untouched) and then
overlaying only the four fields the roll can change (pitch / start / duration /
velocity). New notes (no `id`) get just those four.

## Editing (in the roll)

Three toolbar tools. Hold **E** to temporarily switch to Cut from any tool.

**Mouse (default — Ableton-style):**

| Action | Behavior |
|---|---|
| **Click empty grid** | Deselect + drop the snapped **insert marker** (locator-style). No note placed. |
| **Double-click empty grid + drag** | Place a note and extend it as you drag (snapped). |
| **Click a note** | Select it (and adopt its length as the remembered length). |
| **Shift+click / Cmd+click a note** | Toggle it in/out of the multi-selection. |
| **Cmd/Ctrl+A** | Select all notes. |
| **Cmd/Ctrl+drag empty grid** | Marquee-select every note intersecting the rectangle. |
| **Drag a selected note** | Move the **whole selection** together (snapped, clamped). |
| **Drag a note's right edge** | Resize; the new length becomes the remembered length. |
| **Delete / Backspace** | Delete all selected notes. |

**Pencil (FL-style):**

| Action | Behavior |
|---|---|
| **Click empty grid** | Immediately place a note at the snapped grid line, remembered length, **current articulation**. |
| **Drag after placing** | **Moves** the note (snapped) — never resizes, never changes velocity on vertical movement. |
| **Shift while dragging** | Extend the note's right edge instead (snapped). |
| **Click / edge-drag an existing note** | Select+move / resize, as in Mouse. |

**Cut:**

| Action | Behavior |
|---|---|
| **Click / drag across notes** | Split at the cut position — **unsnapped** by default. |
| **Hold Cmd/Ctrl while cutting** | Snap the cut to the grid. |
| **Hold E (any tool)** | Temporary Cut tool; releases back to the previous tool. |
| **Cmd/Ctrl+E** | One-shot: split the **selected** notes at the insert marker (snapped). |

**Undo / redo:** **Cmd/Ctrl+Z** / **Cmd/Ctrl+Shift+Z** — every edit (place, move,
resize, delete, re-articulate, paint, cut) is one undoable step inside the modal.
(Live's own Cmd-Z still undoes the whole Apply in one step, as before.)

**Misc:** Snap selector 1/1 … 1/32 or Off. **Ctrl/Cmd+wheel** = zoom (about the
cursor), **wheel** = vertical scroll, **Shift+wheel** = horizontal.

### Articulations (three ways to change them)

The toolbar **Articulation selector** sets the articulation that **newly placed
notes** get — it never retroactively changes existing notes. To re-articulate
existing notes:

1. **Right-click a note** → context menu of all articulations (+ "No
   articulation" + Delete). Acts on the whole selection when the clicked note is
   part of it. Right-clicking a span in the bottom lane shows the same menu for
   every note in that span.
2. **Articulation Selector Mode** (the `Art. select` toggle next to the
   selector): while on, plain-clicking a note converts it to the current
   articulation instead of selecting it. Shift/marquee/Cmd+A still select
   normally. Toggle off to restore click-select.
3. **Paint the bottom lane**: drag a span in the lane to re-articulate every
   note starting inside it to the current articulation (the bulk tool). Click a
   span (no drag) to adopt its articulation as current.

**The lane is derived, not stored**: it always shows the keyswitch runs implied
by the notes — consecutive notes (sorted by start time) with the same
articulation form one run, and Apply emits one keyswitch note per run start
(held for the run's span if the articulation's `hold` flag is set, otherwise a
0.25-beat trigger).

> **Known limitation:** keyswitches are monophonic in time — simultaneous or
> overlapping notes with *different* articulations can't both be honored. Runs
> are grouped deterministically by (startTime, then pitch ascending); the
> resulting keyswitch order follows that grouping.

**Edit map…** opens an inline editor for the articulation→pitch map (name, MIDI
pitch, hold). Saving persists it to this extension's `storageDirectory` and
reopens the roll. Note: this map is **separate** from the keyswitch extension's
copy — each extension has its own storage. Reserved keyswitch pitches are treated
as the articulation lane's range; melodic notes written at those pitches are
dropped on Apply.

## Build & run

> The Extensions SDK (`@ableton-extensions/sdk` + `@ableton-extensions/cli`)
> installs from the project-vendored `.tgz` files via `file:../../vendor/…` in
> `package.json` (matching the root `package.json` convention). Needs Node ≥
> 24.14.1. **Building does not require Live** — only `npm start` does.

```bash
cd 02-extensions/articulation-roll
cp .env.example .env          # then set EXTENSION_HOST_PATH=…
npm install
npm run build                 # tsc --noEmit + esbuild bundle  (no Live needed)
npm start                     # build + load into Live (Live Beta must be running)
npm run package               # → ../../dist-extensions/ArticulationRoll.ablx
```

> **Worktree note:** `vendor/*.tgz` is gitignored, so it lives only in the main
> checkout. When building from a git *worktree* (which has no `vendor/`), symlink
> it in once: `ln -sfn "<repo>/vendor" vendor` at the worktree root. In the main
> checkout `../../vendor/` resolves natively and no symlink is needed.

### Audible note preview (optional, one-time setup)

The SDK has no audio API, so preview rides a localhost bridge instead
(ADR: `01-decisions/2026-06-11-artroll-preview-network-side-channel.md`):
clicking/placing/dragging notes in the roll sends
`pitch vel durMs ksPitch ksHoldMs` over WebSocket (fetch/img fallback) to the
extension host on `127.0.0.1:7475`, which fires an OSC datagram
(`/artroll/note`, UDP `7474`) at the **ArtRollPreview** helper device — which
plays keyswitch-then-note through the track's real instrument.

Setup: drop `ArtRollPreview.maxpat` (in this folder) on the edited track as a
Max MIDI Effect, **before the instrument**. No device → the roll is simply
silent, exactly as before. The `● preview` toolbar dot turns green when the
webview's WebSocket reaches the host (it can be green with no device on the
track — it reports the webview→host hop only).

### Previewing the UI without Live
A standalone, data-injected copy of the roll lives at
`03-experiments/roll-spike/preview.html` — open it in any browser to see and click
the editor (it won't write back anywhere; there's no host bridge outside Live).

## Verification checklist (run in Live Beta)

Phase 1 — tools + editing round-trip:
1. `npm run build` typechecks + bundles clean.
2. Right-click a MIDI clip with a handful of notes → **Edit (Articulation Roll)…**
   → modal opens; existing notes render at the correct pitch/time, tinted by the
   articulation derived from the clip's keyswitch notes. *(Record the largest
   usable modal size — it currently opens at 1100×720; resizability is
   unverified.)*
3. **Mouse tool**: click empty grid → marker drops, nothing placed; double-click
   + drag → note places and extends snapped; shift+click builds a multi-select;
   Cmd+A selects all; Cmd+drag marquee-selects; dragging one selected note moves
   the whole selection.
4. **Pencil tool**: single click places instantly at the snapped line with the
   toolbar articulation; dragging after placing moves it (no velocity change);
   Shift-drag extends instead.
5. **Cut**: with the tool (or holding E) click across a long note → it splits
   (unsnapped; Cmd held = snapped). Cmd+E splits the selection at the marker.
6. **Undo/redo**: Cmd+Z steps back through every edit above; Cmd+Shift+Z redoes.
7. **Apply** → reopen the clip in Live → edits are present and **all** untouched
   fields (velocity, probability, etc.) are intact; one **Cmd-Z in Live**
   restores the clip exactly (single-undo transaction).
8. **Cancel / Esc** leaves the clip unchanged.

Phase 2 — articulations:
9. Right-click a note → choose a different articulation → its color changes; on
   **Apply** the keyswitch notes land at each run start (held for the run span
   when the articulation has `hold`, else 0.25-beat triggers).
10. Toggle **Art. select** on → clicking notes converts them to the current
    articulation; toggle off → clicking selects again.
11. Paint a span in the bottom lane over several notes → they all flip to the
    painted articulation; the lane spans redraw to match.
12. Reopen the same clip → notes come back tinted with the articulations implied
    by the keyswitch notes; re-Apply without edits → keyswitches are not
    stacked/duplicated.
13. **Edit map…** → re-pitch an articulation to match your library → Save → the
    colors, lane, and Apply use the new pitch.

## Status

- **Webview (`roll.html`)**: the reworked interaction model is verified in a
  browser harness (programmatic gesture tests + manual preview) — marker click,
  double-click place+extend, pencil place/move/Shift-extend, shift/Cmd+A/marquee
  multi-select, group move, right-click articulation menu, Selector Mode, lane
  bulk paint with derived spans, cut (click, E-hold, Cmd+E), undo/redo, and the
  Apply payload shape (per-note `art`, ids preserved). No console errors.
- **Host (`extension.ts`)**: **compiles clean** — `npm run build` (`tsc --noEmit`
  + esbuild) passes with zero type errors and bundles `dist/extension.js`.
  `npm start` + handshake with Live verified 2026-06-11. **The in-Live walk of
  the checklist above is the remaining verification step.**
