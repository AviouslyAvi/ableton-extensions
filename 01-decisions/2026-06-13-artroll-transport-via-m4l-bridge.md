# ADR — Articulation Roll: drive Live's transport through the M4L bridge

- **Date:** 2026-06-13
- **Status:** Accepted (pending live verification)
- **Branch:** `claude/artroll-transport-sync`
- **Supersedes the playback half of:** in-editor Play as a pure software playhead
  (still kept as a fallback). Builds on
  [`2026-06-11-artroll-preview-network-side-channel.md`](2026-06-11-artroll-preview-network-side-channel.md).

## Context

Two user asks the SDK can't satisfy directly:

1. **Sync the editor's playhead to Live's transport.**
2. **Hear the whole arrangement** (other instruments) while editing, not just the
   edited track.

Hard constraints (re-confirmed, don't re-chase):
- **No SDK transport API** — the whole `Song` class has no start/stop/isPlaying/
  position. The host literally cannot read or move Live's transport.
- **The modal WebView blocks Live's UI** — the user can't click out to hit
  Space, and Live's transport won't run from the modal.

The in-editor Play we shipped first is a *software playhead*: a JS timer in the
WebView sequencing the edited clip's notes out the preview bridge. By
construction it is unsynced and single-track — exactly the two limitations above.

## Decision

Route **transport control + observation through the Max for Live device** that is
already in the track's signal path (`ArtRollPreview.maxpat`). M4L has full Live
Object Model access and keeps running while the modal is up (the modal only
blocks the *user's* input to Live, not M4L messages). So the device becomes a
transport remote:

- **Play (synced):** WebView → bridge → M4L sets `live_set current_song_time` to
  the clip's arrangement position and calls `start_playing`. Live's *real*
  transport rolls → the whole arrangement sounds, in sync. The WebView does **not**
  schedule bridge preview notes in this mode (Live plays the real track).
- **Playhead follows Live:** a `metro` in the device polls `current_song_time` +
  `is_playing` and sends them back to the host, which forwards them to the
  WebView. The editor playhead is positioned at `songTime − clip.startTime`
  (clip-local).
- **Stop:** WebView → bridge → M4L calls `stop_playing`.
- **Graceful fallback:** if no position frames have arrived recently (device not
  installed / older device), Play falls back to the original software playhead.
  Detection = a freshness check on the last `/artroll/pos` frame (<800 ms).

### Wire protocol (added to the existing bridge)

| Dir | Transport | Message |
|---|---|---|
| WebView → host | WS :7475 | `play <songTimeMs>` , `stop` |
| host → M4L | OSC UDP :7474 | `/artroll/play <songTimeMs>` , `/artroll/stop 1` |
| M4L → host | OSC UDP :7476 *(new port)* | `/artroll/pos <songTimeMs> <isPlaying>` |
| host → WebView | WS :7475 | `pos <songTimeMs> <isPlaying>` |

All args are integers in both directions (song time carried as **milli-beats**),
matching the bridge's existing int-only discipline — the host's WS note parser is
`\d+`-only, and the earlier silent-playback bug was a float leaking into it.

## Consequences

- **Pro:** delivers both asks with no SDK transport API; reuses the installed
  device and the proven localhost side-channel; degrades to the software
  playhead when the device isn't present.
- **Con / limits:**
  - **Arrangement-oriented.** `clip.startTime` (= `clipGetStartTime`) is the
    clip's *arrangement* position. For **Session** clips this mapping isn't
    meaningful — Play still starts the global transport (you hear the
    arrangement) but the playhead offset may not line up with the clip. Acceptable
    for v1; revisit if Session editing matters.
  - Setting `current_song_time` scrubs Live's global playhead to the clip — that
    is the intended "play this clip in context," but it *does* move Live's
    position.
  - Reverse channel is best-effort UDP; a dropped frame just means one stale
    playhead tick.
- **Risk to verify live (Max side):** that `set current_song_time` is honored and
  `call start_playing/stop_playing` on `live_set` behave; and that the
  `live.path live_set → live.object` wiring resolves. If `current_song_time` turns
  out read-only in this Live build, Play still starts/stops transport from Live's
  current position (degraded, not broken).

## Install note

The device is copy-pasted into a blank Max MIDI Effect (see
`05-handoffs/` notes). **This change adds objects**, so the *installed* device
must be updated: open it in the Max editor, delete the old contents, and
copy/paste the new `ArtRollPreview.maxpat`. Keep it BEFORE the instrument and
confirm the `midiin → midiout` passthrough cord survives the paste.
