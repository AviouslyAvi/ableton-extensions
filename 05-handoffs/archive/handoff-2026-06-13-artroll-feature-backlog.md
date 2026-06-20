---
date: 2026-06-13
slug: artroll-feature-backlog
status: active
---

# Handoff — Articulation Roll: Round 1 shipped (PR #5), Round 2 Waves A–D built, E in progress

## Where we left off
- **PR #5 is open** for the 5 verified Round-1 items (#6 KS pre-roll, #3 hotkeys,
  #4 key-0 deactivate, #1 re-preview, #7 live preview). Remote branch head =
  `9ec1d77`, so PR #5 contains exactly `51ba0cb` + `9ec1d77` and nothing else.
  https://github.com/AviouslyAvi/ableton-extensions/pull/5
- **Live-apply ADR written + committed** (`975bc47`):
  `01-decisions/2026-06-13-artroll-live-apply-mid-modal.md`.
- **Round 2 Waves A, B, C, D are CODED, BUILT (tsc+esbuild pass), webview-JS
  syntax-checked, and committed locally** on `claude/artroll-backlog`:
  - A `e5446e3` — tool hotkeys b/a/c, arrow nudge/transpose, Cmd+C/V/D clipboard,
    pencil Cmd+click marquee, ruler-click locator.
  - B `e5d065f` — loop playback (`scheduleSoftwareWindow`) + playhead auto-follow;
    host payload gains `looping/loopStart/loopEnd` (clipLoop()).
  - C `4f3fbc0` — DOM legend bar + status line + clickable art swatches.
  - D `7771461` — velocity drag-lane (VEL_LANE/BOTTOM(), drawVelLane, proportional
    / freehand / Shift-ramp drag).
- **Wave E is HALF DONE and UNCOMMITTED.** `extension.ts` has uncommitted edits:
  added `scale` to RollPayload + `songScale()` + wired into buildPayload (host
  side complete, compiles). The **roll.html side of Wave E is NOT written yet.**
- **Wave F not started.** **Nothing in Round 2 has been live-verified yet** —
  Avi chose *batch-verify* (build all waves, one dev-host restart, verify before
  merge).

## ⚠️ Critical git/PR structure note
`claude/artroll-backlog` is the branch behind **PR #5**. The 5 Round-2/ADR commits
sit on top of the pushed head (`9ec1d77`) but are **NOT pushed**. If you
`git push` the branch now, **PR #5 will swallow all the unverified Round-2 work.**
Decision owed (see Open threads): either (a) branch Round 2 off into
`claude/artroll-round2` for its own PR and keep PR #5 scoped, or (b) deliberately
fold everything into PR #5 and rename it. Do NOT blind-push.

## Context for next chat
- Work in **infallible-margulis-67c167** worktree (dev host runs there:
  `npm start`, PID was 35854, Dev Mode ON). The running host holds the OLD bundle
  — **restart `npm start`** before live-verifying.
- Branch **`claude/artroll-backlog`**, local head `7771461`, off main `868818b`.
- Build/verify per wave: `cd 02-extensions/articulation-roll && npm run build`
  (tsc --noEmit + esbuild). roll.html JS isn't parsed by the build, so also run the
  one-liner vm syntax check (extract `<script>`, `new vm.Script(...)`).
- Round 2 full design: `04-plans/artroll-feature-backlog.md` ("IMPLEMENTATION
  DESIGN") + code-level plan `~/.claude/plans/a-velocity-editing-zippy-dawn.md`.
- Files: `02-extensions/articulation-roll/src/{roll.html,extension.ts}`
  (preview.ts unchanged).

## Exact next step — finish Wave E (roll.html side)
Host side (extension.ts `scale` payload) is done but uncommitted. Remaining in
`roll.html`:
1. Parse `DATA.scale` → `SCALE = { root%12, set:Set(intervals→(root+i)%12) }` or null.
2. `let scaleOn = false;` + a toolbar **"Scale"** toggle button (mirror
   `selector-toggle` wiring; default off).
3. `snapPitchToScale(p)`: if `!scaleOn || !SCALE` return p; else nearest in-scale
   pitch (check d=0,1,2… down-then-up, clamp 0–127).
4. Apply `snapPitchToScale` in: `placeNote` (pencil), `transposeSelection`
   (arrows), and the `move` drag pitch (`n.pitch = snapPitchToScale(o.pitch+dP)`).
5. **Legato / length-to-next**: `legatoSelection()` — for each selected note set
   `duration = (next note on same pitch row).startTime − startTime`; no next →
   extend to `playEnd()`; floor ~0.03125; `pushUndoState`. Bind **bare `L`** in
   keydown (`!cmd`) AND add a `showCtxMenu` item "Legato (length to next)".
6. Build + syntax-check + **commit Wave E**.

Then **Wave F** (wheel-zoom tuning, ~L1439: Cmd/Ctrl+wheel h-zoom-about-cursor,
plain=v-scroll, Shift=h-scroll — confirm directions match Ableton; low effort),
build + commit. Then **batch live-verify A–F** (restart dev host; checklist in the
plan's "Verification" section), incl. confirming the one-time
`[articulation-roll] loop:` log shows loopStart/loopEnd are **clip-local**.

## Round 2 decisions (already made)
Scroll zoom = horizontal-only refine; velocity multi-drag = proportional scale;
extras = velocity ramp (Shift-drag) / legato / snap-to-scale.

## Open threads
- **Decide PR structure** (own Round-2 PR vs fold into #5) before pushing.
- Finish Wave E, do Wave F, batch live-verify A–F, then push/PR.
- Runtime-verify loop `loopStart/loopEnd` are clip-local (Wave B log).
- Mark items done in `04-plans/artroll-feature-backlog.md` after the batch lands.
- Later backlog: #5b (clip length-setter), #2 device UI, #8 one-device-per-group
  (ADR first), #10 fix open-zoom (shows ~33 bars not the clip), #13 zoom-to-`z`,
  #14 articulation banks.

## Files referenced
- `02-extensions/articulation-roll/src/{roll.html,extension.ts,preview.ts}`
- `01-decisions/2026-06-13-artroll-live-apply-mid-modal.md`
- `04-plans/artroll-feature-backlog.md`
- `~/.claude/plans/a-velocity-editing-zippy-dawn.md`
