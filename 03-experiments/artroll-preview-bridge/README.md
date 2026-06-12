# ArtRoll Preview Bridge — spike

_Status: **PROBE PASSED 2026-06-11 21:28** — all four channels (fetch, img beacon,
sendBeacon, WebSocket incl. message round-trip) escaped the open modal. Verdict:
bridge GO, WebSocket primary. Integrated into `02-extensions/articulation-roll/`
(`src/preview.ts` + `previewNote()` in `roll.html`); ADR:
`01-decisions/2026-06-11-artroll-preview-network-side-channel.md`._
_Parent plan: `04-plans/extension-m4l-bridge-and-plugin.md`_

Answers the plan's step 1 — **can the modal webview reach the extension host
MID-MODAL?** — and bundles steps 2–3 (UDP→OSC sender + M4L receiver) so a "yes"
becomes audible immediately.

## Pre-run finding (binary inspection, 2026-06-11)

Live 12 Beta's binary has a generic `TWebMessageDispatcher` with
`RegisterWebMessageHandler(<string name>, handler)`. The string
`close_and_send` occurs **exactly once** in the entire Live binary, with no
sibling method names — so the SDK's webview protocol almost certainly accepts
*only* `close_and_send`. The probe's unknown-method test confirms/denies this
empirically (expected: silently ignored).

**The real candidates are network side-channels** — the modal is a real
WKWebView, so JS can try `fetch`, image beacons, `sendBeacon`, and `WebSocket`
against a localhost server owned by the extension host (`127.0.0.1:7475`).
None of these touch Ableton's protocol. If even one works, the bridge is on.

## What's here

- `src/extension.ts` — host: HTTP+WebSocket side-channel server on `:7475`,
  OSC-over-UDP sender to `:7474` (`/artroll/note pitch vel durMs ksPitch ksHoldMs`,
  all int32), probe modal via context-menu on any MIDI clip.
- `src/probe.html` — the modal: auto-runs all five probes on open, shows
  PASS/FAIL lines on screen, "Play test note" button (C3 + Staccato ks D-2),
  returns its log through `close_and_send` on close.
- `ArtRollPreview.maxpat` — minimal M4L receiver: `udpreceive 7474` →
  `route /artroll/note` → `unpack` → keyswitch `makenote` (immediate) +
  melodic `makenote` (5 ms behind, via `pipe 5`) → `noteout`.
  `ksPitch -1` = no keyswitch (gated by `if $i1 >= 0`).

## How to run

1. Stop any other extension host (`pkill -f "extensions-cli|ExtensionHostNodeModule"`).
2. `npm install && npm start` here (`.env` already points at Live Beta).
3. In Live: right-click a MIDI clip → **Preview Bridge Probe…**
4. Read the modal: green lines = working channels. Host console shows
   `MID-MODAL` lines for every channel that escaped the webview.
5. For sound: drop `ArtRollPreview.maxpat` (as a Max MIDI Effect) on an
   instrument track, then hit **Play test note**.

## Decision matrix (from the parent plan)

| Probe outcome | Verdict |
|---|---|
| WebSocket opens | Best case — bidirectional; build the bridge (~half-day) |
| Only fetch/img/beacon work | Still a yes — one-way fire-and-forget is all preview needs |
| Everything blocked (CSP/ATS on data: origin) | Mid-modal messaging is dead → full M4L port (`04-plans/articulation-roll-m4l-port.md`) |

## Notes

- `vendor/` at the worktree root must symlink the repo's `vendor/` (gitignored
  .tgz packages): `ln -sfn "<main checkout>/vendor" vendor`.
- The data-URI origin is opaque (`"null"`), which is why the server answers
  `Access-Control-Allow-Origin: *` and the img-beacon path exists (no CORS at
  all). WebSocket handshakes ignore same-origin policy by design.
