# ArticulationRoll for REAPER

A ReaScript (Lua) port of the Ableton **Articulation Roll** extension. Same brain,
different host: it tags melodic notes with an articulation and synthesizes the
matching **keyswitch notes** into the take — the Reaticulate-style workflow, but
built on the exact articulation logic from the Ableton version.

There are two ways to use it, sharing one engine (`ArticulationRoll_lib.lua`):

1. **The app** (`ArticulationRoll_App.lua`) — a dockable panel: pick a bank, click
   an articulation to apply it to the selected notes, edit bank/articulation names
   and keyswitch pitches inline. Closest to the Ableton experience. **Start here.**
2. **Key-bind scripts** — no-UI actions you bind to keys (`1`–`8` = assign, etc.),
   for fast keyboard workflows. Optional.

## The app (recommended)

### One-time setup

The app needs the **ReaImGui** extension (for the window). Install it once:

- REAPER → **Extensions → ReaPack → Browse packages** → search **`ReaImGui`** →
  right-click **"ReaImGui: ReaScript binding for Dear ImGui" → Install** → **Apply**
  → restart REAPER.

Then load the app as an action:

- **Actions → Show action list → New action → Load ReaScript…** →
  `Scripts/ArticulationRoll/ArticulationRoll_App.lua`. Bind it to a key/toolbar if
  you like, or just run it from the action list. Dock the window wherever you want.

### Note coloring (one-time, per project)

Each articulation owns a **MIDI channel**, and that channel is what colors the
notes. To see the colors: in the MIDI editor, set the **note-color dropdown**
(top toolbar) to **"Channel"**. Now assigning an articulation recolors its notes —
the button colors in the app correspond to the channel colors in the editor.

For this to sound right, the instrument on the track should **receive omni** (the
default for most single-instrument tracks) — the channel is just a color/tag, and
the keyswitch note is what actually selects the articulation.

### Using it

- **Bank dropdown** — choose the articulation set for the instrument on the track.
- **Articulation buttons** (color-coded by channel) — select notes in the MIDI
  editor, click a button to apply that articulation. The notes move to that
  articulation's channel (recoloring them) and the matching keyswitch notes are
  regenerated. The button highlights when the selection already carries it.
- **Clear** — send the selected notes back to the unassigned channel (channel 1),
  removing their articulation. **Rebuild** — regenerate keyswitches after you move
  or resize notes.
- **Edit** checkbox — rename the bank and, per articulation: name, **KS note**
  (the keyswitch note, typed as a name like `C4`/`F#3`/`Db2` or a bare MIDI number,
  matching REAPER's octave display), velocity, **Chan** (its color/channel, 1–16; channel 1 is
  reserved for "unassigned"), and **Hold** (latch vs short trigger). The color
  swatch on each row shows the channel color. **+ Bank / – Bank** manage multiple
  instrument banks. Edits auto-save to `ArticulationRoll_banks.lua`.

That's the whole setup: install ReaImGui once, load one script. Banks, names,
pitches, and channels are all editable in the panel — no text files to hand-edit.

---

## Key-bind scripts (optional, no ReaImGui needed)

## Why it's a port, not an import

The Ableton extension is a `.ablx` package that runs in Live's Node-based
extension host and renders a 575 KB HTML piano roll in a webview. None of that
exists in Reaper. **But Reaper already has a piano roll** (its native MIDI
editor), so this version ships no custom UI — you edit notes normally, and the
script owns only the articulation → keyswitch half.

The two core algorithms are ported 1:1 from `../src/extension.ts`:

| Ableton (`extension.ts`) | Reaper (`ArticulationRoll_lib.lua`) |
|---|---|
| `keyswitchesFromNotes()` | `keyswitchesFromNotes()` (run/hold/pre-roll logic) |
| webview piano roll | Reaper's native MIDI editor |
| per-note articulation field | the note's **MIDI channel** |
| `articulations.json` in storageDir | `ArticulationRoll_banks.lua` in resource path |
| custom-roll note colors | native "color notes by channel" |

Each melodic note's articulation is stored as its **MIDI channel** — explicit and
per-note, so it survives moves, colors the note, and never gets ambiguous. The
keyswitch notes are regenerated from those channels each time (never the other way
around).

## Files

Keep all of these in the **same folder** — the action scripts load
`ArticulationRoll_lib.lua` from next to themselves.

| File | What it is |
|---|---|
| `ArticulationRoll_lib.lua` | Shared engine. Never bound directly. |
| `ArticulationRoll_App.lua` | The dockable ReaImGui panel (banks + articulations). |
| `ArticulationRoll_Menu.lua` | Pop-up menu (assign / clear / rebuild / edit banks). |
| `ArticulationRoll_Assign_Slot1.lua` … `Slot8.lua` | Assign the **Nth** articulation of bank 1 to selected notes. |
| `ArticulationRoll_Clear.lua` | Clear articulation from selected notes. |
| `ArticulationRoll_Rebuild.lua` | Regenerate all keyswitches. |

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
   right-click → **Install**. All files install together; the action scripts
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
4. *(Optional)* Install the **SWS extension** so "Edit banks…" opens the config
   file in your default editor; without SWS it falls back to `open`/`start`.

These key-bind scripts operate on **bank 1** of the same config the app uses
(`ArticulationRoll_banks.lua`), so edit your articulations in the app and the keys
follow. They don't need ReaImGui.

## Use

### Bindable actions (no UI)

With a MIDI editor open, select some notes and hit a key:

- **`Assign_Slot1…8`** — assign the **Nth** articulation of bank 1 to the selected
  notes (retagging their channel + regenerating keyswitches). Slot = position, so
  renaming or re-pitching an articulation in the app keeps the binding stable.
- **`Clear`** — send the selected notes to the unassigned channel.
- **`Rebuild`** — regenerate keyswitches. Run after you move/resize notes.

### Menu (discoverable)

`ArticulationRoll_Menu.lua` pops a menu at the mouse listing bank 1's articulations
(numbered by slot), plus Clear / Rebuild / Edit banks.

Typical flow: draw your melody → select a phrase → press `3` (Staccato) → the notes
recolor and the keyswitch appears → select another phrase → press `1` (Sustain).

## The config file

Everything lives in `<REAPER resource path>/ArticulationRoll_banks.lua`, edited
entirely from the app's **Edit** panel — you shouldn't need to touch it by hand.
It stores one or more banks, each a list of articulations with `name`, `pitch`
(keyswitch note), `velocity`, `hold`, and `channel` (color/tag, 0-based; 0 =
unassigned). Re-pitch articulations to match your sample library (Spitfire,
Kontakt, etc.) right in the panel.

## Behavior notes (keyswitch logic matches the Ableton version)

- **Keyswitch pre-roll**: each keyswitch is nudged 1/64 note (0.0625 beat) before
  the note it governs, so the library registers the switch before the note sounds.
- **Runs**: consecutive notes with the same articulation share one keyswitch; a
  held keyswitch spans to the run's furthest note end.
- **Muted notes** emit no keyswitch (but don't break a run).
- **Unassigned** notes (channel 1) break a run and emit nothing.
- **Dedupe**: coincident same-pitch keyswitches collapse to one.
- Each keyswitch is written on **its articulation's channel** (same channel as the
  notes it governs), so libraries that expect the keyswitch on the note's channel
  work correctly.

## Not ported

The Ableton webview extras — in-editor audible preview, the Randomize/Ramp lane
footer, marquee/resize gestures, snap-to-scale — are all UI features of the
custom roll. In Reaper you get those from the native MIDI editor instead. This
script is purely the articulation ↔ keyswitch engine.
