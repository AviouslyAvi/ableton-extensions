# START HERE — Ableton Extensions Workspace

> Router for building **Ableton Live Extensions** (TypeScript/Node.js running alongside Live).
> Read this file first, every session. It tells you which room to enter and what to load — so you never load the whole workspace into context.

---

## The three-layer system

1. **Layer 1 — This router (`START_HERE.md`).** The map. Always read first. Routes a task to exactly one room.
2. **Layer 2 — Room READMEs (`NN-room/README.md`).** Each room's local context: what lives there, what to load, what to skip, which skills to use.
3. **Layer 3 — The actual work files** inside each room. Only loaded once a room's README tells you they're relevant.

**Loading protocol:** Read this file → pick the room → read that room's `README.md` → load only the files it lists. Do not pre-load other rooms.

---

## What this workspace builds

Extensions for **Ableton Live** using the **Ableton Extension SDK** (currently `1.0.0-beta.0`). Extensions are TypeScript, run in Node.js next to Live, and can manipulate the Live Set (tracks, clips, devices), work with audio/files, register context-menu actions and commands, run transactions, and show WebView UIs.

- **SDK distribution:** `/Users/aviouslyavi/Downloads/extensions-sdk-1.0.0-beta.0/` (api/, docs/, examples/, and the three `.tgz` packages).
- **Each extension** = its own folder under `02-extensions/<name>/` with `manifest.json`, `src/extension.ts`, `build.ts`, `package.json`, `tsconfig.json`. Run with `npm start`.
- **Compiled builds** = `dist-extensions/<Name>.ablx`, one installable file per extension. Rebuild all with `npm run package:all` from the repo root (or `npm run package` inside one extension). Drop a `.ablx` onto Live's Extensions settings page to install.

---

## Task → Room map

| If you're about to… | Go to | Load |
|---|---|---|
| Look up SDK API, manifest schema, CLI commands, env setup | **00-foundation** | `00-foundation/README.md` |
| Record/recall an architecture or design decision | **01-decisions** | `01-decisions/README.md` |
| Work on an actual shippable extension | **02-extensions** | `02-extensions/README.md` + that extension's folder |
| Spike, test an API, throwaway exploration | **03-experiments** | `03-experiments/README.md` |
| Plan what to build next, backlog of ideas | **04-plans** | `04-plans/README.md` |
| Resume from / save a prior session | **05-handoffs** | newest file in `05-handoffs/active/` |

---

## Slash-style triggers

- `/scaffold` — (already run) bootstrap this structure.
- `/handoff` — save current state to `05-handoffs/active/` and update Active threads below.
- `/log` — capture a chat snippet into the right room.
- `/resume` — read the newest handoff and continue.

---

## Active threads

- [ ] **Articulation Roll** — FL-style articulation MIDI editor (modal piano roll).
  **MERGED TO MAIN** (`9596873`, PR #1) after live-verifying the 13-step checklist and
  implementing Avi's feedback round same day (marquee-default select, shift-additive,
  dual-edge relative resize, razor cursor, selection-wide selector mode, Cmd/Ctrl+1/2 grid,
  native-menu suppression). SDK verdicts: no audio API, fixed modal, no per-note MIDI channel.
  **NEW (session 2): preview bridge BUILT — probe passed live** (all four localhost
  side-channels escape the modal; WS primary). Preview integrated into the roll
  (`src/preview.ts` + `previewNote()`; `ArtRollPreview.maxpat` helper), committed/pushed
  on `claude/infallible-margulis-67c167`. ADR:
  `01-decisions/2026-06-11-artroll-preview-network-side-channel.md`. M4L port NOT needed.
  **NEW (session 3, 2026-06-12): preview VERIFIED LIVE** — ks+note audible on click.
  PR #2 merged + frosty worktree deleted. The pre-greeting stall was an orphaned
  `Helpers/ExtensionHost/node` (for similar-samples, ppid 1) squatting the dev-host slot
  — fix in `00-foundation/README.md`.
  **NEW (session 4, 2026-06-13):** silent-track bug FIXED + VERIFIED LIVE
  (`ArtRollPreview.maxpat` was missing `midiin->midiout` passthrough — it swallowed all
  track MIDI; same root cause as old "no playback"). Built **in-editor Play** (software
  playhead via the bridge; SDK has no transport API). Found + fixed the silent in-editor
  playback bug (`pvSend` sent float durMs → host WS regex is int-only → frames dropped;
  now rounds args). In-editor Play VERIFIED LIVE; **PR #3** opened.
  **NEW (session 5, 2026-06-13): TRANSPORT SYNC SHIPPED + VERIFIED LIVE** — Play
  now drives Live's real transport via the M4L bridge (hear the whole arrangement,
  in sync; playhead follows Live). Reverse UDP :7476 + maxpat transport objects.
  **PR #4** (`claude/artroll-transport-sync`, HEAD `bd17940`). ADR:
  `01-decisions/2026-06-13-artroll-transport-via-m4l-bridge.md`. **Next: 8-item
  feature backlog** in `04-plans/artroll-feature-backlog.md` (start with KS
  pre-roll nudge).
  → Resume: `05-handoffs/active/handoff-2026-06-13-artroll-feature-backlog.md`
  (prior: `…/handoff-2026-06-13-playback-fix.md`; full record: `…/handoff-2026-06-11-articulation-roll.md`)

- [ ] **Keyswitch** — Fast-apply + **bulk auto-placement** (per onset / per phrase, ranged
  apply, KS_LEAD pre-roll) committed (`5a62517` on `keyswitch-fast-apply`, now pushed).
  New: `03-experiments/keyswitch-m4l/` — M4L v8 spike reading SELECTED notes
  (`get_selected_notes_extended`), which the SDK can't see. **Pending: live re-test of
  fast-apply items + the new bulk placement** before calling it done.
  → Resume: `05-handoffs/active/handoff-2026-06-06-keyswitch.md`
- [ ] **Similar Samples** — Find→take lanes, similarity %, dedup, both Unpack commands, and an
  "Original" A/B lane all built & verified live. Pending: confirm Original auto-skip on unpack,
  then `npm run package`. Next build: "Unpack This Take Lane → Track" (single-lane).
  → Resume: `05-handoffs/active/handoff-2026-06-05-similar-samples.md`

---

_Last updated: 2026-06-11_
