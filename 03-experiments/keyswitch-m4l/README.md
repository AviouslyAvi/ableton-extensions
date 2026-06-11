# Keyswitch (per-note) — Max for Live experiment

A Max for Live device that does what the Ableton **Extensions SDK could not**: read the
notes you **select in the MIDI editor** and write a **keyswitch note for each, spanning that
note's duration**. The Logic/Cubase/Studio One gesture — without drawing automation.

## Why M4L (and not the SDK)

The SDK device (`02-extensions/keyswitch/`) is stuck at clip / time-selection scope:
`note.selected` reads `undefined`, extension menu items don't appear in the piano roll, and
the only UI is a blocking modal. Max for Live's Live API exposes
`clip get_selected_notes_extended`, which is the whole reason this exists. Target: **Live
12.4+ / Max 9** (so the modern **`v8`** object is available).

## Architecture

```
Keyswitch.amxd (MIDI Effect — thin UI shell, built in Max)
   buttons → named messages → [v8 keyswitch.js] → Live API → focused clip
```

`keyswitch.js` holds ALL logic and is version-controlled. The `.amxd` is a small shell of
buttons wired into the `v8` object. The device edits clip **data**; it is not in the MIDI
signal path and does no real-time processing.

## Files

| File | Role |
|---|---|
| `keyswitch.js` | All logic (v8). The real deliverable. |
| `keyswitch.test.js` | Node unit tests for the pure beat-math functions. |
| `articulations.json` | Default low-octave map seed (Sustain=0/C-2, Legato=1, …). |
| `package.json` | Scopes the folder to CommonJS for Node tests (Max ignores it). |
| `Keyswitch.amxd` | The device shell (assembled in Max — not yet created). |

## Test the logic off-Live

```bash
cd 03-experiments/keyswitch-m4l
npm test        # or: node --test
```
Covers per-note span, chord collapse, hold, selectionSpan, onset/phrase detection. ✅ 9/9.

## Build the `.amxd` shell in Max (Stage 0 → 1)

The logic is done; the device shell is assembled in the Max editor. Minimal shell to prove
the gesture, then expand:

1. In Live: create a **MIDI track**. On it, add a **Max MIDI Effect** (Max Instrument? no —
   *MIDI Effect*). Click its **Edit (✎)** to open the Max editor.
2. Drop a **`v8`** object and type: `v8 keyswitch.js`. Save the device **in this folder**
   (`03-experiments/keyswitch-m4l/`) so the `.js` is on the Max search path. Name it
   `Keyswitch.amxd`.
3. **Stage 0 proof:** add a `button` (bang) and a `message` box containing `diag`. Wire
   `button → message(diag) → v8` inlet. Also add a `print` or open the **Max Console**
   (right-click → Open Console). Save.
   - In Live: open a MIDI clip in the Detail editor, **select a few notes**, click the
     button → the console should print `[keyswitch][diag] N selected note(s)` with the right
     N and the first note's JSON. This proves runtime + file load + message dispatch + the
     critical Live API read.
4. **Stage 1 gesture:** add a `message` box `applySelection` wired to `v8`. Select notes →
   click → a keyswitch note (default Sustain, C-2) should appear at each onset spanning each
   note's duration. Re-click → it **replaces** (no stack).
5. **Stage 2+ (quick-apply / repeat / auto-place):** add more message boxes wired to `v8`:
   - `apply 0`, `apply 1`, … → apply map slot N to the selection (one button per articulation)
   - `repeatLast` → re-apply the last-used articulation
   - `autoPlaceOnset` / `autoPlacePhrase` → place across the whole clip
   - The `v8` left outlet emits `repeatLabel <name>` — wire it to a `live.text`/`comment` to
     show the last-used articulation.

### Dev loop (edit → reload)

Keep the device **unfrozen** so `keyswitch.js` stays an external editable file. Edit it here,
then reload in Max. With `autowatch = 1` (set at the top of the script), the `v8` object
**reloads automatically when the file changes on disk**. If it doesn't pick up a change,
double-click the `v8` object and re-trigger, or toggle the device off/on. *(Confirm the exact
auto-reload behaviour during Stage 0 — it's the main iteration-speed risk.)*

## Message API (what the UI sends `v8`)

| Message | Effect |
|---|---|
| `diag` | Log how many notes are selected (+ first note JSON). Stage-0 proof. |
| `applySelection` | Apply last-used (or map[0]) to the selected notes, per-note span. |
| `apply <i>` | Apply articulation map slot `i` to the selection. |
| `repeatLast` | Re-apply the last-used articulation. |
| `autoPlaceOnset` | Drop the articulation before every melodic note onset in the clip. |
| `autoPlacePhrase` | Drop it at each phrase start (rest gap ≥ 1 beat). |

## Status / next

- ✅ `keyswitch.js` logic written; pure functions unit-tested (9/9).
- ⏳ `Keyswitch.amxd` shell not yet assembled in Max → **Stage 0 proof is the next step.**
- Deferred: disk persistence of the map + last-used (currently in-memory per device load);
  in-device map editor; freeze for distribution. See the plan file.

## Notes / conventions

This is the workspace's **first Max for Live device** — no M4L convention existed (only TS
extensions). Tracked as `.amxd` + external `.js`, no Node build step. Whether M4L devices get
their own room and how this relates to the SDK device is an open decision (see plan §
"Convention gap").
