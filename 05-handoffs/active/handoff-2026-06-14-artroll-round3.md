---
date: 2026-06-14
slug: artroll-round3
status: active
---

# Handoff — Articulation Roll Round 3: #15/#16/#17 shipped (PR #7 OPEN)

## Where we left off
Round 2 is **merged** (PR #6 → main, incl. the `0.0100` horizontal-zoom retune).
Round 3 on branch **`claude/artroll-round3`** (off the merged Round 2 HEAD
`71b5c98`): three items **built, live-verified GREEN, committed, pushed, and
PR'd** — **PR #7 is OPEN** (base main), awaiting merge.

- **#15** pencil multi-note edge-resize honors the multi-selection (`7a563ea`).
- **#16** cut tool snaps to grid by default; Option/Alt = freehand (`7c3902f`).
- **#17** Option/Alt = off-grid (freehand) note drag, Mouse + Pencil (`7c3902f`).

## Immediate next step
**PR #7 is open** (https://github.com/AviouslyAvi/ableton-extensions/pull/7,
base main; PR #5/#6 untouched, both merged). Merge it when ready. The three
items are already marked ✅ in `04-plans/artroll-feature-backlog.md`.
Then continue Round 3 with the remaining items (below): **#19** transport-locate
+ loop viz (bridge work) and **#18** CC envelopes (needs its own ADR first).

## Branch / commit state
- **`claude/artroll-round3`** @ `7c3902f` → **PR #7 OPEN** (base main). Newest first:
  `7c3902f` #16/#17 · `7a563ea` #15 · base `71b5c98` (Round 2, in main).
- **`claude/artroll-round3-transport`** @ `05dfef4` (#19, NEW) — branched off
  `7c3902f`, so it stacks on PR #7. **NOT pushed, no PR — pending live verify.**
  Worktree **infallible-margulis-67c167** is now checked out on THIS branch.
  `vendor` is an untracked symlink — never stage it.
- #15/#16/#17 touched only `src/roll.html`. #19 (`05dfef4`) touches
  `src/roll.html` (loop-region viz) **and `ArtRollPreview.maxpat`** (locate fix).
  `dist/` is NOT tracked (built on demand).

## #19 status — BUILT (`05dfef4`), PENDING LIVE VERIFY
Two parts, both need the live host (Part A also needs the Max device re-pasted):
- **Part A — transport-locate (maxpat).** Synced Play already sent the clicked
  locator as the song position; Live ignored it and started from the top because
  `set current_song_time` + `call start_playing` fired in the same scheduler
  servicing. Fix = a `delay 30` between the play trigger's bang and
  `call start_playing`, so the locate commits before playback starts. **HYPOTHESIS
  — verify live.** If it still ignores the locate, the fallback risk the transport
  ADR flagged (current_song_time read-only in this build) is back on the table.
  ⚠️ **The installed Max device must be re-pasted** from the updated
  `ArtRollPreview.maxpat` (open the device in the Max editor, delete contents,
  copy/paste the file, keep it BEFORE the instrument, confirm midiin→midiout).
- **Part B — loop-region viz (roll.html).** When the clip loops: grid dimmed
  outside [LOOP_START, LOOP_END], accent boundary lines at the loop edges, and a
  loop brace (with end caps) along the bottom of the ruler. No device change.
  Verify with a clip whose loop is a **sub-region** (not full-clip) so the band is
  visible; Play and watch the playhead wrap inside the band.

### Verify recipe for #19 (in YOUR terminal)
1. `git checkout claude/artroll-round3-transport` in the worktree (if not already).
2. **Re-paste the Max device** from the updated `ArtRollPreview.maxpat` (Part A).
3. Build + host reset dance (below), reopen the modal.
4. **Part A:** click a ruler position mid-clip → Play → Live's transport should
   start FROM there (whole arrangement, in sync), not the clip top.
5. **Part B:** on a clip with a sub-region loop, confirm the dimmed band + ruler
   brace + boundary lines render at the loop edges and the playhead wraps inside.

## ⚠️ Dev-host gotcha that cost us most of this session — READ THIS
Symptoms looked like "the fix doesn't work" but were ALWAYS a stale bundle. Two
independent traps, both must be cleared to test a roll.html change:
1. **`roll.html` is inlined into `dist/extension.js` at build time** AND the host
   loads `dist` into memory at **startup**. So a change needs `npm run build`
   **+ a full host restart** — reopening the modal alone re-runs the *old*
   in-memory bundle.
2. **Orphaned host children squat the dev-host slot.** `pkill -f "extensions-cli run"`
   only kills the CLI wrapper; Live's actual `Helpers/ExtensionHost/node` children
   get reparented to ppid 1 and keep the slot, so a new host **never greets Live**
   (no `FlipMessageStreamSocket send success`). They pile up (we hit 6).

**Reliable reset (run in YOUR OWN terminal — background `npm start` keeps getting
reaped with exit 143/144, and respawns orphans):**
```bash
pkill -f "extensions-cli run"; pkill -f "articulation-roll/.live-storage"; sleep 2
cd "/Users/aviouslyavi/Claude/Projects/Ableton SDK/.claude/worktrees/infallible-margulis-67c167/02-extensions/articulation-roll"
npm start
```
The **second pkill** (orphaned host children) is the part that was missing all
session. Then wait for **`send success`** in the terminal, and **close + reopen**
the modal. Only when (a) a host is connected AND (b) it's serving the freshly
rebuilt bundle AND (c) the modal was reopened against it does a change go live.
Verify a host is actually connected: `pgrep -f "articulation-roll/.live-storage"`
and grep the host log for `send success`.

## Per-change build/verify recipe
`npm run build` (tsc --noEmit + esbuild) **+ webview-JS syntax check** (roll.html's
`<script>` is NOT parsed by the build):
```bash
node -e 'const fs=require("fs"),vm=require("vm");const m=fs.readFileSync("src/roll.html","utf8").match(/<script>([\s\S]*?)<\/script>/);new vm.Script(m[1]);console.log("OK")'
```

## Remaining Round 3 backlog (NOT started) — in `04-plans/artroll-feature-backlog.md`
- **#19 Transport-locate + loop-region viz** (medium): send the in-editor locator
  to Live's transport via the M4L bridge so SYNCED playback starts from the clicked
  position (not the top); render the loop region + a visible loop playhead in
  clip-local bars. Bridge work, not a one-liner. (Carried from Round 2 #B.)
- **#18 CC envelopes (CC1/CC11, orchestral)** (large — **its own ADR first**):
  drawable CC envelopes in the roll. Decide lane-vs-overlay, how CC writes back
  through the SDK / live-apply, what the SDK MIDI-write surface exposes for CC.
- Possible follow-up surfaced this round: extend #17's Alt-off-grid to edge-
  **resize** too (currently scoped to position moves only).
- Older still-open: #5b clip length-setter · #2 device UI · #8 one-device-per-group
  (ADR first) · #10 fix open-zoom (~33 bars, not clip) · #13 zoom-to-`z` · #14
  articulation banks.

## Open decisions / blockers
- None blocking the push/PR. For #18, the lane-vs-overlay + SDK-CC-write approach
  is an open design question (ADR) the next session should scope before coding.

## Files referenced
- `02-extensions/articulation-roll/src/roll.html` (all Round 3 edits)
- `04-plans/artroll-feature-backlog.md` (#15–19 + older items; #15/#16/#17 marked ✅)
- `01-decisions/2026-06-13-artroll-live-apply-mid-modal.md` (live-apply ADR)
- Prior handoff: `05-handoffs/archive/handoff-2026-06-14-artroll-round2-verify.md`
- Full record: `05-handoffs/active/handoff-2026-06-11-articulation-roll.md`
