# Plan — Articulation Roll M4L port spike

_Status: idea, ready to spike in `03-experiments/` · Created 2026-06-11_
_Parent project: `02-extensions/articulation-roll/` (shipped via SDK, merged to main in PR #1)_

## Why port to Max for Live

The Extension SDK version is feature-complete as an **articulation manager**, but the SDK
has hard ceilings (verified against `@ableton-extensions/sdk` 1.0.0-beta.0 type defs,
2026-06-11):

- **No audio: there is no API to play/audition notes** — no `playNote`, no MIDI output,
  no transport control. The editor is silent by design.
- Modal is fixed-size: `showModalDialog(url, width, height)` only — no resize.

Max for Live flips both:

- **An M4L MIDI device sits in the track's MIDI chain → it can send notes to the
  instrument.** Clicking a note in the editor can *sound* through the actual patch,
  with the correct keyswitch fired first. This is the killer feature the SDK cannot do.
- M4L can open floating patcher windows (sizeable), not just a fixed modal.

## Architecture sketch

- **UI: reuse `roll.html` nearly verbatim** inside a `jweb` object. It is self-contained
  HTML/JS/canvas with a tiny JSON message contract (`apply` / `save-map` / `cancel` +
  injected `DATA`). Swap the SDK's `window.webkit.messageHandlers` bridge for jweb's
  `window.max.outlet(...)` / `max.bindInlet(...)`.
- **Clip I/O: Live API via `live.object`** —
  - read: `call get_notes_extended` on the highlighted clip (`live_set view detail_clip`)
  - write: `call apply_note_modifications` (preserves note ids → keeps our id-overlay
    fidelity story) / `call add_new_notes` for created notes
- **Audition: `noteout`-style MIDI from the device** — on note click: send the
  articulation's keyswitch pitch (velocity ~1, or hold per `hold` flag), then the note
  pitch, then note-offs. Goes straight into the instrument after the device.
- **Port the host logic** (`artForMelodicNotes`, `keyswitchesFromNotes`, id-overlay merge)
  from `src/extension.ts` into the jweb page itself or a `js`/`v8` object — the
  run-grouping rule MUST stay identical to `laneSpans()` in the webview.
- **Map storage:** `live.thisdevice` + pattr / dict saved with the device (replaces the
  SDK's `.live-storage`).

## Known risks / unknowns (what the spike answers)

1. jweb ↔ patcher messaging round-trip: can we inject `DATA` and get the apply payload
   back reliably? (jweb uses `max.bindInlet` / `outlet` — different lifecycle from the
   SDK modal's close-and-send.)
2. Window: can jweb live in a floating window at ~1100×720+ and be opened/closed from
   the device? (Subpatcher window with `@enable 1`, or `pcontrol`.)
3. `apply_note_modifications` semantics vs the SDK's `withinTransaction` — is the write
   one undo step in Live's history?
4. Keyswitch audition timing: how much pre-roll does the keyswitch need before the note
   for common libraries (Kontakt, Spitfire)? Make it configurable.
5. Live 12 jweb is Chromium — verify canvas perf is fine for large clips (the SDK
   webview was WebKit).

## Spike steps (in `03-experiments/articulation-roll-m4l/`)

1. Empty M4L MIDI device: button → `get_notes_extended` on detail clip → print to Max
   console. (Proves clip read.)
2. Add `jweb` loading a stripped `roll.html`; inject the notes JSON; render. (Proves UI.)
3. Wire Apply: jweb outlet → `apply_note_modifications`. Round-trip one edit. (Proves write.)
4. Audition: click note in jweb → keyswitch + note through `noteout` → hear it. (Proves
   the whole reason to port.)
5. Decide: promote to `02-extensions/articulation-roll-m4l/` or document why not.

## Decision criteria

Promote if (a) audition works with believable timing, (b) Apply is a single Live undo
step or acceptably close, (c) the jweb UI holds up at full size. Otherwise the SDK
version stays the canonical one and this file records the findings.
