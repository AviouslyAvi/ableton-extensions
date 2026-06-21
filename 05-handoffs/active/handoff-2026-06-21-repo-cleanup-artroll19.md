---
date: 2026-06-21
slug: repo-cleanup-artroll19
status: active
---

# Handoff — Repo cleanup + Articulation Roll #19 folded

## Where we left off
Removed the Keyswitch extension entirely (local + remote + main), folded Articulation Roll **Round 3 + #19 transport-sync** into `main`, recompiled `dist-extensions/ArticulationRoll.ablx` (109.7kb), and did a full branch/worktree cleanup. `origin/main` = `7a76375`, fully synced; working trees clean.

## Immediate next step
Verify the **#19 transport-sync in Live** — it's on main but **unverified** (commits are WIP-flavored: "brace debug"/"ping"). From `02-extensions/articulation-roll`: `npm install` (deps not installed in this worktree), then `npm start`, confirm host handshake, walk the Phase 1/2 + transport-sync checklist.

## Context to load on resume
- Room: `02-extensions/articulation-roll/`
- Resume doc: `05-handoffs/active/handoff-2026-06-14-artroll-round3.md`
- Dev-host help (read this — it covers the handshake issue we hit): `00-foundation/running-the-dev-host.md`
- Host path for `.env`: `/Applications/Ableton Live 12 Beta.app/Contents/Helpers/ExtensionHost/ExtensionHostNodeModule.node` (Live Beta = 12.4.5b4)

## Open decisions / blockers
- Fold the preserved **similar-samples WIP** (142-line divergence) into main? Lives at `origin/claude/wip-2026-06-14-similar-samples-foundation` — needs a manual review vs main before merging.
- `.env` is gitignored — recreate per above if missing. SDK now lives in repo `vendor/` (symlinked from old `~/Downloads/extensions-sdk-1.0.0-beta.0`).

## Notes
- Remaining origin branches: `main` + 3 preservation (`artroll-round3-transport` = full #19 backup, `wip-2026-06-14-similar-samples-foundation`, `sharp-cori-1caac8` = FL-converter thread). Everything else deleted as redundant.
- "keyswitch" still appears in artroll code/docs — that's the MIDI concept, not the deleted extension. Leave it.
