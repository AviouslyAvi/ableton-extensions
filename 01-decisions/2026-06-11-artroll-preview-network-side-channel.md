# ADR — Articulation Roll preview = localhost side-channel bridge to M4L

_Date: 2026-06-11 · Status: accepted (probe-verified live) · Room: 02-extensions/articulation-roll_

## Problem

The Extensions SDK (1.0.0-beta.0) has **no audio/audition API**, so the Articulation
Roll modal is silent. We needed click-a-note preview through the *real instrument on
the edited track*, and the SDK's only documented webview→host channel is
`close_and_send` — which closes the modal.

## Decision

**Preview = network side-channel bridge:**
`roll.html (WebSocket, fetch + img-beacon fallback) → extension host server on
127.0.0.1:7475 → OSC datagram on UDP 7474 → ArtRollPreview M4L device (on the edited
track, before the instrument) → keyswitch-then-note through the real instrument.`

Implemented in `02-extensions/articulation-roll/src/preview.ts` (host) and the
`previewNote()` block in `src/roll.html` (webview). Helper device:
`ArtRollPreview.maxpat` (also in the extension folder). Failure mode at every hop is
silence — never an error dialog, never clip writes, never undo entries.

## Evidence

- Binary inspection of Live 12 Beta: webview messages go through a generic
  `TWebMessageDispatcher` (`RegisterWebMessageHandler(<string>, …)`); the string
  `close_and_send` occurs exactly once in the whole binary with no sibling method
  names → the SDK protocol route is closed for mid-modal messaging.
- Live probe (`03-experiments/artroll-preview-bridge/`, run in Live 2026-06-11
  21:28): **all four side-channels escaped the open modal** — fetch, img beacon,
  `sendBeacon`, and a full WebSocket handshake + message. WS chosen as primary
  (connected-state indicator for free); fetch/img remain as runtime fallbacks.

## Alternatives considered (full chart in 04-plans/extension-m4l-bridge-and-plugin.md
and the 2026-06-11 options chart)

- `DeviceParameter.setInternalValue` as transport — official API but encodes poorly
  and risks undo pollution; reserve as fallback.
- swub "KeySwitch & Expression Map" (€29 M4L) — different axis (articulations as
  automation lanes; SDK **cannot write clip envelopes**, verified against the .d.ts),
  so no integration possible; worth studying for its PC/CC/UACC *output model*.
- Virtual MIDI (IAC) — plan-B for users without Max for Live; native dep + routing
  setup.
- VST/AU relay plugin — ruled out (~100× cost of the 6-object M4L patch, no Live API).
- Full M4L port — fallback only; probe success made it unnecessary for preview.

## Consequences

- Preview requires the user to drop ArtRollPreview on the track once (documented
  setup step). Without it: editor behaves exactly as before (silent).
- Fixed port convention: 7475 (HTTP/WS webview→host), 7474 (UDP host→M4L).
- One extension host at a time also guards the port; a collision logs and disables
  preview for that session only.
