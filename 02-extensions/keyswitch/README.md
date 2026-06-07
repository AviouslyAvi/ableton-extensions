# Keyswitch

Proof-of-concept MIDI **keyswitching** extension. A keyswitch is just an ordinary
low-pitch MIDI note that tells a sample library which articulation to play
(legato / staccato / pizz / …). This extension inserts those notes for you from a
palette, using a user-editable articulation map.

## Why this is feasible

The SDK exposes `MidiClip.notes` as a `NoteDescription[]` getter/setter, so we read
the clip's notes, append a keyswitch note, and write the array back. See
`01-decisions` / the build plan for the full API assessment. The only real limit:
there is **no "selected notes" API and no keyboard-shortcut binding**, so the
workflow is clip-scoped or arrangement-time-selection-scoped (right-click), not
per-note.

## What it does

Right-click menus registered:

| Scope | Action | Behaviour |
|---|---|---|
| MIDI clip | **Keyswitch: `<name>`** (one per map entry) | **No modal** — instantly inserts that articulation at **clip start**. The fast path. |
| MIDI clip / arrangement selection | **Repeat keyswitch: `<name>`** | One click re-applies the **last-used** articulation (clip start, or selection start in the clip under that beat). Label tracks the last sound; persisted across restarts. |
| MIDI clip | **Apply keyswitch…** | Palette → insert keyswitch at **clip start**. Full-control fallback (lets you tick **Hold**). |
| MIDI track arrangement selection | **Apply keyswitch at selection…** | Palette → insert at the **selection start**, inside the clip under that beat |
| MIDI clip / MIDI track | **Edit keyswitch map…** | Edit the articulation→pitch map (persisted). Editing the map **live-rebuilds** the per-articulation items — no reload needed. |

- **"Hold for rest of clip"** latches the keyswitch (note held to clip end) instead
  of a short 0.25-beat trigger.
- Inserting the same articulation at the same beat **replaces** rather than stacks.
- The map lives in `articulations.json` in the extension's storage directory
  (`.live-storage/` when run via `npm start`). Seeded with a generic low-octave map
  (C-2 = Sustain, C#-2 = Legato, …) on first use — re-pitch to your instrument.

## Build (verified ✅)

```bash
npm install
npm run build   # tsc --noEmit + esbuild bundle → dist/extension.js
```

This typechecks and bundles cleanly (HTML inlined via esbuild's text loader).

## Run in Live (your machine — needs Live Beta + .env)

> Requires **Node ≥ 24.14.1** for `npm start` to connect to the Live Extension Host
> (this machine's default `node` is now v24). `.env` and `node_modules/` are
> gitignored, so after a fresh checkout: `npm install`, then create `.env`.

```bash
cp .env.example .env          # set EXTENSION_HOST_PATH to the ExtensionHostNodeModule.node
                              # e.g. /Applications/Ableton Live 12 Beta.app/Contents/Helpers/ExtensionHost/ExtensionHostNodeModule.node
npm start                     # builds + extensions-cli run --storage-directory .live-storage
```

### Phased verification (the plan's gates)

1. **Round-trip (core premise):** add a MIDI clip with a few notes → right-click it
   → **Apply keyswitch… → Sustain**. Open the clip: a note at **C-2** (pitch 0),
   beat 0, should appear and survive deselect/save. ← proves `MidiClip.notes` works.
2. **Palette + hold:** try other articulations; tick **Hold for rest of clip** and
   confirm the keyswitch spans the whole clip.
3. **Time-selection:** in Arrangement, drag a time-selection over a MIDI clip →
   right-click → **Apply keyswitch at selection…**. The keyswitch should land at the
   **selection start inside that clip** (verify the offset is clip-relative, not
   arrangement-absolute).
4. **Edit map persistence:** **Edit keyswitch map…**, re-pitch an entry, Save, quit
   and relaunch Live → the change persists (written to `.live-storage/articulations.json`).
5. **Edge cases:** empty clip; time-selection over a gap (no clip → logged no-op,
   nothing inserted); duplicate apply at same pitch+beat (deduped, not stacked).
6. **Fast-apply (per-articulation):** right-click a MIDI clip → there should be a
   **Keyswitch: `<name>`** item per map entry. Click one → its note lands at clip
   start with **no modal**. ← the core speed win.
7. **Repeat last:** after step 6, **Repeat keyswitch: `<name>`** should show the
   just-used articulation; clicking it on another clip re-applies it in one click.
   In Arrangement, **Repeat keyswitch…** on a time-selection drops it at the
   selection start. Relaunch Live → the label/behaviour persists
   (`.live-storage/lastKeyswitch.json`).
8. **Live map rebuild:** **Edit keyswitch map…**, rename/add an entry, Save → the
   **Keyswitch: `<name>`** items update immediately, no reload.

## Package

`npm run package` builds for production and writes the installable
`dist-extensions/Keyswitch.ablx` (repo-root folder). Or `npm run package:all`
from the repo root to rebuild every extension's `.ablx`. Install by dropping the
`.ablx` onto Live's **Extensions** settings page.

> Status: promoted from `03-experiments/`. The fast-apply items (verification
> steps 6–8) still need a live confirmation pass — the host didn't reconnect in
> the session that built them.
