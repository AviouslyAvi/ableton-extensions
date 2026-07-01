# ArticulationRoll for REAPER

A ReaScript (Lua) port of the Ableton **Articulation Roll** extension. Same brain,
different host: it tags melodic notes with an articulation and synthesizes the
matching **keyswitch notes** into the take — the Reaticulate-style workflow, but
built on the exact articulation logic from the Ableton version.

## Why it's a port, not an import

The Ableton extension is a `.ablx` package that runs in Live's Node-based
extension host and renders a 575 KB HTML piano roll in a webview. None of that
exists in Reaper. **But Reaper already has a piano roll** (its native MIDI
editor), so this version ships no custom UI — you edit notes normally, and the
script owns only the articulation → keyswitch half.

The two core algorithms are ported 1:1 from `../src/extension.ts`:

| Ableton (`extension.ts`) | Reaper (`ArticulationRoll_lib.lua`) |
|---|---|
| `artForMelodicNotes()` | `articulationForMelodic()` |
| `keyswitchesFromNotes()` | `keyswitchesFromNotes()` |
| webview piano roll | Reaper's native MIDI editor |
| `articulations.json` in storageDir | `ArticulationRoll_map.txt` in resource path |
| context-menu "Edit (Articulation Roll)…" | this action (bind to key/toolbar) |

Articulations are **derived from the keyswitch notes already in the take** (just
like the Ableton version re-derives them on every open), so there's no hidden
metadata to keep in sync — the keyswitch notes *are* the source of truth.

## Files

Keep all of these in the **same folder** — the action scripts load
`ArticulationRoll_lib.lua` from next to themselves.

| File | What it is |
|---|---|
| `ArticulationRoll_lib.lua` | Shared engine. Never bound directly. |
| `ArticulationRoll_Menu.lua` | Pop-up menu (assign / clear / rebuild / edit map). |
| `ArticulationRoll_Assign_Slot1.lua` … `Slot8.lua` | Assign the **Nth** articulation in the map to selected notes. |
| `ArticulationRoll_Clear.lua` | Clear articulation from selected notes. |
| `ArticulationRoll_Rebuild.lua` | Re-derive + rewrite all keyswitches. |

## Install via ReaPack (recommended)

Once these files are pushed to GitHub, install/update the whole set through
ReaPack — no manual file loading, and `Rebuild`/`Assign`/etc. auto-register in the
MIDI Editor action list.

1. Install the [ReaPack extension](https://reapack.com/) if you haven't.
2. In Reaper: **Extensions → ReaPack → Import repositories…**
3. Paste the index URL:
   ```
   https://raw.githubusercontent.com/AviouslyAvi/ableton-extensions/main/02-extensions/articulation-roll/reaper/index.xml
   ```
4. **Extensions → ReaPack → Browse packages…** → find **Articulation Roll** →
   right-click → **Install**. All 12 files install together; the action scripts
   appear in the **MIDI Editor** section of the Action List, ready to bind.
5. To update later: **ReaPack → Synchronize packages**.

> The index points at raw URLs on `AviouslyAvi/ableton-extensions@main`. If you
> move the files or rename the repo/branch, update the `<source>` URLs in
> `index.xml` to match, then bump the `<version name="…">` so ReaPack sees the
> change. The `desc`/`main`/`file` structure can stay as-is.

## Install manually (no ReaPack)

1. Copy the whole `reaper/` folder somewhere permanent (keep the files together).
2. In Reaper: **Actions → Show action list → New action → Load ReaScript…** and
   load each script you want (at minimum `ArticulationRoll_Menu.lua`; add the
   `Assign_Slot*` / `Clear` / `Rebuild` ones you want on keys).
3. **Bind to keys.** In the Action List, select an imported script → set the
   keyboard shortcut. Recommended in the **MIDI Editor** section so the keys work
   while you're editing notes — e.g. `1`–`8` → `Assign_Slot1`–`Slot8`,
   `0` → `Clear`, `` ` `` → `Rebuild`, `M` → `Menu`.
4. *(Optional)* Install the **SWS extension** so "Edit map…" opens the map file in
   your default editor; without SWS it falls back to `open`/`start`.

## Use

### Bindable actions (no menu)

With a MIDI editor open, select some melodic notes and hit a key:

- **`Assign_Slot1…8`** — assign the articulation on that **line number** of the
  map file to the selected notes, then rewrite keyswitches. Slot = position, not
  name, so renaming or re-pitching entries in the map keeps your key bindings
  pointing at the same slot.
- **`Clear`** — un-tag the selected notes.
- **`Rebuild`** — re-derive + rewrite everything. Run after you move/resize
  melodic notes so the keyswitches follow.

### Menu (discoverable)

`ArticulationRoll_Menu.lua` pops a menu at the mouse listing every articulation
(numbered by slot), plus Clear / Rebuild / Edit map. Good when you don't remember
which slot is which.

Typical flow: draw your melody in Reaper → select a phrase → press `3`
(Staccato) → the D-2 keyswitch notes appear → select another phrase → press `1`
(Sustain) → done.

## The articulation map

Lives at `<REAPER resource path>/ArticulationRoll_map.txt`, auto-created with the
same defaults + pitches as the Ableton extension. One line per articulation:

```
Name = pitch, velocity, hold
```

- **pitch** — MIDI note number (0–127) the keyswitch fires on.
- **velocity** — keyswitch note velocity.
- **hold** — `true` latches the keyswitch for the whole articulated region;
  `false` emits a short trigger note (0.25 beat) at the region start.

Example:

```
Sustain   = 0, 100, true
Staccato  = 2, 100, false
Pizzicato = 4, 100, false
```

Re-pitch these to match your sample library (Spitfire, Kontakt, etc.), same as
you would in the Ableton version's "Edit map" dialog.

## Behavior notes (matches the Ableton version)

- **Keyswitch pre-roll**: each keyswitch is nudged 1/64 note (0.0625 beat) before
  the note it governs, so the library registers the switch before the note sounds.
- **Runs**: consecutive notes with the same articulation share one keyswitch; a
  held keyswitch spans to the run's furthest note end.
- **Muted notes** emit no keyswitch (but don't break a run).
- **Nil/unarticulated** notes break a run and emit nothing.
- **Dedupe**: coincident same-pitch keyswitches collapse to one.
- Keyswitch notes are written on MIDI channel 1 (`KS_CHANNEL = 0`, edit in the
  script to change).

## Not ported

The Ableton webview extras — in-editor audible preview, the Randomize/Ramp lane
footer, marquee/resize gestures, snap-to-scale — are all UI features of the
custom roll. In Reaper you get those from the native MIDI editor instead. This
script is purely the articulation ↔ keyswitch engine.
