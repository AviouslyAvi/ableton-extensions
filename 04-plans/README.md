# 04 — Plans

## Room purpose
The backlog and roadmap. Ideas for extensions to build, ranked and unranked, before they become real projects.

## What lives here
- `BACKLOG.md` — idea list with one-line descriptions and rough priority.
- Per-idea `.md` specs once an idea is fleshed out enough to plan.

## Files to load
- This README and `BACKLOG.md`.
- The spec for whatever idea you're planning.

## Files to skip
- Implementation details — those belong in `02-extensions` once a build starts.

## Skills to invoke
- `your-asian-mom-pm` or plain planning to break an idea into tasks.

## Pipeline
Idea captured here → fleshed into a spec → spiked in `03-experiments` → built in `02-extensions`.

## When to leave this room
Once an idea is ready to build, create its project in `02-extensions` and move on.

---

## Backlog seed (from SDK capabilities — edit freely)
Extensions become possible with this SDK; candidate ideas:
- **Batch clip renamer** — rename every clip by a pattern (uses `Song`/`Track`/`Clip`).
- **Stem renderer** — render stems from selected arrangement tracks (see `strip-silence`, `audio-clips`).
- **Strip silence** — detect & remove silent regions in selected audio (example exists).
- **Project stats dashboard** — WebView modal showing clip/track/device counts (see `modal-dialog`, `progress-dialog`).
- **Warp-mode batch setter** — set warp mode across many clips (see `warpMode`).
- **Context-menu utilities** — right-click actions on ClipSlot/Track (see `context-menu`).

_Replace these with your own priorities._
