# 03 — Experiments

## Room purpose
Throwaway spikes. "Does this API even work?", "what does `Song.getSelectedTracks()` return?", quick proofs before committing to a real extension in `02-extensions`.

## What lives here
- Small, disposable test scripts and scratch extension projects.
- A `LOG.md` of findings ("warp mode enum values are X/Y/Z", "transactions roll back on throw").

## Files to load
- This README and `LOG.md`.
- The specific experiment you're touching.

## Files to skip
- Everything else here — experiments are independent and disposable.

## Skills to invoke
- `00-foundation` for the API surface; copy the closest SDK example to start fast.

## Pipeline
SDK example → tweak here to confirm behavior → record finding in `LOG.md` → if it pans out, promote to `02-extensions` and/or record a decision in `01-decisions`.

## When to leave this room
As soon as you have your answer. Don't build production extensions here.

---

_Findings log starts empty. Append dated entries as you learn the API._
