# Keyswitch (experiment)

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
| MIDI clip | **Apply keyswitch…** | Palette → insert keyswitch at **clip start** |
| MIDI track arrangement selection | **Apply keyswitch at selection…** | Palette → insert at the **selection start**, inside the clip under that beat |
| MIDI clip / MIDI track | **Edit keyswitch map…** | Edit the articulation→pitch map (persisted) |

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
> (this workspace currently has Node 22 — bump it before running). Build/typecheck
> works on Node 22.

```bash
cp .env.example .env          # then set EXTENSION_HOST_PATH=…
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

## Promote

Once the in-Live gates pass, copy to `02-extensions/keyswitch/`, finalize
`manifest.json`, run `npm run package`, and write a handoff.
