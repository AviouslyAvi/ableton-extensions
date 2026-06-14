# ADR — Articulation Roll: live-apply by writing the clip mid-modal

- **Date:** 2026-06-13
- **Status:** Accepted (verified live)
- **Branch:** `claude/artroll-backlog` (commit `9ec1d77`)
- **Builds on:**
  [`2026-06-11-artroll-preview-network-side-channel.md`](2026-06-11-artroll-preview-network-side-channel.md)
  (the bridge that escapes the modal) and
  [`2026-06-13-artroll-transport-via-m4l-bridge.md`](2026-06-13-artroll-transport-via-m4l-bridge.md)
  (transport sync, which makes a *live* clip audible in context).

## Context

Two user asks (backlog #1 and #7):

1. **Hear articulation changes while still inside the editor**, not only after
   Apply. Clicking a note already previews it through the bridge, but *changing*
   a note's articulation produced no audible feedback in transport context.
2. **"Apply but don't close"** — ideally just have Live reflect edits as you make
   them.

Hard constraints (re-confirmed, don't re-chase):
- **The SDK modal only returns via `close_and_send`.** `showModalWebView`
  resolves once, when the modal closes. There is no SDK channel to push data
  from the WebView back to the host *while the modal is open*, and no SDK call to
  write the clip from inside the modal-handling code path before it returns.
- BUT the **preview bridge already escapes the modal** — the WebView reaches a
  localhost server the host runs (WS :7475), proven by the preview work. That
  same side-channel can carry *edits*, not just preview triggers.

So the question is purely: what message shape carries a full notes array back to
the host mid-modal, and how do we avoid hammering the clip on every mouse move.

## Decision

Add a **`POST /apply`** endpoint to the existing bridge HTTP server. The WebView
serializes the current notes and POSTs them; the host writes `clip.notes`
**without closing the modal**. With transport sync (the M4L bridge) the edited
clip then plays the real keyswitches in context as you edit.

This single mechanism delivers both asks:
- **Live preview on change (#1):** every committed edit auto-applies.
- **"Apply, stay open" (#7):** the same write path runs while the modal lives;
  Cancel/Escape closes but keeps the writes (undo via Live's own Cmd+Z).

### Why POST, not a WS frame

`wsTextFrame` in the bridge only emits unmasked frames with a payload `<= 125`
bytes (single-byte length). A full notes array blows past that immediately. A
plain HTTP POST body has no such limit and the host already runs the listener,
so `POST /apply` with a JSON body is the cheap, correct carrier. Preview
triggers (tiny) stay on the existing channel; bulk clip state goes over POST.

### Debounce + undo coalescing

Writing on every `mousemove` would spam the clip and Live's undo history. So:
- `roll.html` debounces `liveApply()` at **200 ms**, hooked into
  `pushUndoState` + `restoreState` — i.e. it fires once per *committed* edit and
  on in-editor undo/redo, not on every intermediate frame.
- `flushLiveApply()` runs on Cancel/Escape so the last edit inside the debounce
  window is never lost.
- `applyResult` gained a **`quiet`** flag: the ~5/s live writes don't spam the
  host log; only the final explicit Apply logs.

### Stable id mapping across live writes

A live write must map WebView note ids back to the clip's original notes the same
way the final Apply does. `openRoll` wires `onApply` to a **per-iteration
`liveApply` closure** that captures that modal session's `melodicOriginals`
(id → original mapping), so every mid-modal write resolves against a stable
snapshot rather than drifting state.

### Semantics (per Avi)

- Full live preview on change.
- Keep the **editor's own** undo stack while open.
- **Cancel = close-keep-writes** — edits already pushed to the clip stay; the
  user reverts with Live's Cmd+Z if they don't want them.

## Consequences

- **Good:** the editor now behaves like a live piano roll — articulation edits
  are audible in transport context without closing. Unlocks the deeper form of
  #1 and satisfies #7 with one endpoint.
- **Good:** no new SDK surface or M4L change required — rides the bridge that
  already existed.
- **Trade-off:** "Cancel keeps writes" is non-obvious vs. a classic modal. It's
  intentional (matches live-preview tools) and recoverable via Live undo, but
  documented here so future work doesn't "fix" it into a revert-on-cancel.
- **Trade-off:** live writes go through Live's undo history (coalesced by the
  debounce). Acceptable; the alternative (a silent write that bypasses undo)
  would make Cancel unrecoverable.
- **Watch:** the 200 ms debounce is a feel knob. If edits feel laggy or the log
  shows write pile-ups, tune it; it is not load-bearing for correctness.

### Wire protocol (added to the existing bridge)

| Dir | Transport | Message |
|---|---|---|
| WebView → host | HTTP POST :7475 `/apply` | JSON `{ notes: [...] }` (full serialized clip state) |

(Preview triggers and transport commands keep their existing WS/OSC channels;
this row is the only addition.)
