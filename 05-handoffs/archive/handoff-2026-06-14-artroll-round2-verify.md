---
date: 2026-06-14
slug: artroll-round2-verify
status: active
---

# Handoff — Articulation Roll: Round 2 (A–F) built + live-verified once, 3 fixes applied, re-verify + push pending

## TL;DR / immediate next step
Round 2 Waves **A–F** are coded, built, live-verified, committed on
**`claude/artroll-round2`** (head `71b5c98`), **PUSHED**, and shipped as
**PR #6** → https://github.com/AviouslyAvi/ableton-extensions/pull/6 (base `main`,
PR #5 untouched). All 3 live-verify fixes CONFIRMED green by Avi (Cmd+V paste,
legato, trackpad zoom — zoom coefficient dialed in at `0.0100`).
**Next:** review/merge PR #6 (stacked: until PR #5 merges to main, #6's diff also
shows #5's two commits `51ba0cb`/`9ec1d77`); then mark Waves A–F done in
`04-plans/artroll-feature-backlog.md` and tackle the new backlog below.

⚠️ **Concurrency hazard:** a parallel Claude session in the `serene-satoshi-bfd902`
worktree was editing this SAME working tree / managing its own dev host, which kept
reaping the background host and even co-edited roll.html. Before pushing, make sure
**only one session** drives this branch/worktree.

## Branch / PR structure (DECIDED — own Round 2 PR)
- **`claude/artroll-round2`** @ `71b5c98` = ADR (`975bc47`) + Waves A–F + fixes.
  **Pushed; shipped as PR #6 (base `main`).**
- **`claude/artroll-backlog`** was reset to `9ec1d77` so it now matches **PR #5's**
  remote head exactly — PR #5 stays scoped to the 5 verified Round-1 items. Do
  NOT push artroll-backlog.
- The worktree **infallible-margulis-67c167** is checked out on
  `claude/artroll-round2` (dev host runs there). `vendor` is an untracked symlink
  to repo-root `vendor/` — never stage it.
- Commit stack on round2 (newest first): `71b5c98` fixes · `f9b55a6` Wave F ·
  `a34eca0` Wave E · `7771461` D · `4f3fbc0` C · `e5d065f` B · `e5446e3` A ·
  `975bc47` ADR · (`9ec1d77`,`51ba0cb` = PR #5 base).

## Live-verify results (2026-06-13, first pass)
- **A (keyboard/input):** ✅ b/a/c tools, arrows + Shift-octave, Cmd+C, Cmd+D,
  Cmd+click marquee. ⚠️ **Cmd+V pasted at clip start** — FIXED (now pastes after
  the source like Cmd+D; tiles forward on repeat). RE-VERIFY.
- **B (loop playback):** ✅ looped clip plays, stays in sync while playing.
  ⚠️ **OPEN — not fixed:** (1) the in-editor locator does NOT move Live's transport
  to that clip-local position; when Live drives transport it **restarts from the
  beginning** each time. (2) Avi **couldn't see a "loop playhead"** / couldn't
  confirm loop bars are clip-local. These are **transport-bridge** work (send a
  song-position locate through the M4L bridge), not a Wave-B one-liner → moved to
  backlog. NOTE: locator starting the clip from the click point IS intended
  (ruler-click = play-from-here) — confirmed not a bug.
- **C (legend/status/swatches):** ✅ all good.
- **D (velocity lane):** ✅ drag sets one, multi scales, Shift ramp, audible after
  live-apply.
- **E (scale + legato):** ✅ **Scale snap works** (re-snaps when the song scale is
  changed). ⚠️ **Legato extended every note to clip end** — FIXED (root cause: it
  searched for the next note on the SAME pitch row; a melodic line has none, so it
  ran to the end. Now connects to the next note in TIME, any pitch). RE-VERIFY.
  Minor/no-fix: the Scale button shows only "on/off", not the scale name (name is
  tooltip-only, and only if Live reports one) — acceptable.
- **F (wheel zoom):** ✅ Shift h-scroll, plain v-scroll, Cmd-zoom-about-cursor.
  ⚠️ **Trackpad zoom way too fast** — FIXED (factor now scales with deltaMode-
  normalized, clamped scroll magnitude instead of a fixed 1.12 per event, so a
  trackpad's many tiny events stop compounding). RE-VERIFY (tune coeff `0.0022`
  if still off).

## The 3 fixes (commit `71b5c98`, all in roll.html, need re-verify)
1. **Cmd+V paste-after** — `copySelection` records `clipSpan` + default `pasteAt`
   (minStart+span); `pasteClipboard` tiles `pasteAt` forward; Cmd+V uses
   `marker ?? pasteAt`.
2. **Legato length-to-next** — `legatoKeys` dropped the `m.pitch === n.pitch`
   constraint; now nearest next onset in time (else `playEnd()`, floor 1/32).
3. **Trackpad zoom** — wheel Cmd/Ctrl branch: `dy` normalized (lines×16, pages×400),
   clamped ±120, `factor = exp(-dy*0.0100)` (retuned up from 0.0022 in steps per
   Avi — "less taming"). roll.html:1510.

## Context for the next chat
- Dev host: running in **infallible-margulis-67c167** worktree, bundle `130.5kb`,
  connected to Live (greeting "send success"). `roll.html` is **inlined into
  dist/extension.js at build time** (esbuild text loader) — so ANY roll.html edit
  needs `npm run build` + **dev-host restart** before it's live. Restart:
  `pkill -f "extensions-cli run"` then `cd 02-extensions/articulation-roll && npm start`.
- Build/verify per change: `npm run build` (tsc --noEmit + esbuild) + the
  webview-JS syntax check (extract `<script>`, `new vm.Script(...)` — roll.html JS
  isn't parsed by the build).
- Files: `02-extensions/articulation-roll/src/{roll.html,extension.ts}`
  (`preview.ts` unchanged this round).
- Design: `04-plans/artroll-feature-backlog.md` ("IMPLEMENTATION DESIGN", Waves
  A–F at the bottom) + code-level plan `~/.claude/plans/a-velocity-editing-zippy-dawn.md`
  (has the per-wave verification checklist).

## NEW backlog from Avi's verify (Round 3 candidates — NOT started)
1. **Pencil multi-note extend** — in Mouse mode, dragging an edge extends ALL
   selected notes together; in **Pencil mode it doesn't**. Make pencil resize
   honor the multi-selection too.
2. **Cut tool: snap-to-grid by DEFAULT** — currently freehand, Cmd/Ctrl snaps.
   Invert: snap by default, hold **Option/Alt = freehand** slicing.
3. **Alt/Option = freehand off-grid drag** — let note drags (Mouse AND Pencil)
   move off-grid (ignore snap) while Option/Alt is held. Same principle as the
   cut-tool toggle above.
4. **CC envelopes (orchestral)** — author CC1 (mod), CC11 (expression), and other
   common orchestral CCs as drawable envelopes in the roll. Biggest feature; needs
   its own design (lane vs overlay; how CC writes back through the SDK / live-apply;
   the SDK MIDI-write surface). Likely an ADR first.
5. **Transport locate + loop-region viz (from B):** send the in-editor locator to
   Live's transport via the M4L bridge so synced playback starts from the clicked
   position (not the top); and render/confirm the loop region + a visible loop
   playhead with clip-local bars.

## Open threads / decisions
- ✅ Re-verified + pushed + **PR #6 open** (base `main`). Next: review/merge.
- After merge: mark Waves A–F done in `04-plans/artroll-feature-backlog.md`.
- Triage the 5 new backlog items (esp. #4 CC envelopes — wants its own round/ADR).
- Older backlog still open: #5b clip length-setter, #2 device UI, #8 one-device-
  per-group (ADR first), #10 fix open-zoom (~33 bars not clip), #13 zoom-to-`z`,
  #14 articulation banks.

## Files referenced
- `02-extensions/articulation-roll/src/{roll.html,extension.ts,preview.ts}`
- `01-decisions/2026-06-13-artroll-live-apply-mid-modal.md`
- `04-plans/artroll-feature-backlog.md`
- `~/.claude/plans/a-velocity-editing-zippy-dawn.md`
- Prior handoff: `05-handoffs/archive/handoff-2026-06-13-artroll-feature-backlog.md`
