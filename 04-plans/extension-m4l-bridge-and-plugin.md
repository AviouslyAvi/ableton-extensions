# Assessment — SDK extension ↔ M4L bridge, and plugin viability

_Status: assessed 2026-06-11 · Decision doc, no code yet_
_Parent: `02-extensions/articulation-roll/` · Sibling plan: `04-plans/articulation-roll-m4l-port.md`_

## The question

The SDK has **no audio/audition API** (verified against the 1.0.0-beta.0 `.d.ts`), so the
Articulation Roll is silent. Avi asked: can the SDK extension **connect to an M4L device**
to get preview sound without porting the whole editor? And is a **VST/AU plugin** viable?

## A. Extension ↔ M4L bridge: YES — feasible, and the cheapest path to audio preview

**Why it works:** the extension host is a full Node.js process (no sandbox on sockets),
and M4L devices can receive UDP natively. Nothing in either runtime forbids local IPC.

```
roll.html (webview)            extension host (Node)            M4L helper device
  click note ──message──▶  dgram.send JSON ──UDP :7474──▶  [udpreceive 7474] → unpack
                                                            → keyswitch noteout (lead)
                                                            → note noteout → instrument
```

- **Payload:** `{ pitch, velocity, ksPitch, ksHold, durMs }` — one datagram per click.
- **M4L side needs NO Live API**: ~6 objects (`udpreceive` → `route`/`unpack` →
  `makenote` ×2 → `noteout`). Dumb, robust, version-control-friendly. The SDK editor
  remains the single source of truth for clip data; the device only makes sound.
- **Keyswitch-first ordering** is trivial in Max (fire ks note a few ms before the note —
  mirrors `KS_LEAD` in the keyswitch extension).
- **Placement:** the helper device must sit on the track being edited, before the
  instrument. Document as a setup step ("drop ArtRollPreview.amxd on the track").
- **Liveness:** fixed port convention (7474) + optional ping/pong so the editor can show
  "Preview: on/off". Failure mode is silence — never data corruption.

**The ONE open technical risk (the spike's first question):**
the webview's only *verified* channel to the host is `close_and_send` — which closes the
modal. Preview needs **mid-modal** webview→host messages. The SDK webview bridge
(`window.webkit.messageHandlers.live.postMessage`) may support non-closing methods —
this is unverified. Outcomes:
- *Works* → bridge is a ~half-day build, preview lands in the existing SDK editor.
- *Doesn't work* → preview is impossible in the SDK modal, and the **full M4L port**
  (`articulation-roll-m4l-port.md`) becomes the only preview path. The bridge spike is
  still not wasted — its M4L audition patch is step 4 of the port plan.

**Bridge spike (in `03-experiments/artroll-preview-bridge/`):**
1. Probe the webview bridge for non-closing message methods while a modal is open
   (log every `postMessage` method the host can observe).
2. Host-side UDP sender (Node `dgram`, ~10 lines).
3. Minimal M4L receiver patch; click → hear keyswitch+note through a real instrument.

## B. VST/AU plugin: viable in theory, wrong tool here

- A JUCE MIDI-effect plugin *could* play the same audition-relay role (socket listener →
  MIDI out) and would work cross-DAW. But a plugin has **no Live API access** — it can't
  read/write clips or know articulation maps — so inside Live it can only ever be the
  same dumb relay the 6-object M4L patch already is, at ~100× the build cost
  (JUCE project, C++, code-signing/notarization, installers, plugin-scan support burden).
- A full plugin **product** ("FL-style articulation piano roll for any DAW") is a
  different architecture entirely: plugins see the real-time MIDI stream, not the DAW's
  clip data. That's a green-field product decision, not a port of this codebase.
- **Verdict: no plugin.** Revisit only if targeting non-Live DAWs as a product someday.

## Recommendation hierarchy

1. **Run the bridge spike now** — small, and its step 1 answer (mid-modal messaging)
   decides everything downstream.
2. If mid-modal messaging fails → go straight to the **full M4L port** plan.
3. **Plugin: no** (documented above; decision made unless the product scope changes).
