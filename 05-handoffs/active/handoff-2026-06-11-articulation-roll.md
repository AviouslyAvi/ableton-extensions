---
date: 2026-06-11
slug: articulation-roll
status: active
---

# Handoff — Articulation Roll (FL-style articulation MIDI editor)

## SESSION 2 UPDATE (2026-06-11 evening) — PREVIEW BRIDGE BUILT & PROBE PASSED

1. **Text-size bump:** verified via static 1100×720 browser render, committed
   (`f366bb9`), pushed; **PR #2 open, awaiting Avi's merge**
   (https://github.com/AviouslyAvi/ableton-extensions/pull/2 — classifier blocked
   self-merge). frosty worktree can be deleted after merge.
2. **Mid-modal probe DECIDED (option B wins):** spike in
   `03-experiments/artroll-preview-bridge/` ran live at 21:28 — **all four
   side-channels escape the open modal** (fetch, img beacon, sendBeacon,
   WebSocket incl. round-trip). Binary inspection: `close_and_send` is the ONLY
   SDK webview method string in Live — protocol route closed, network route open.
   Full M4L port NOT needed for preview.
3. **Preview integrated into the real editor** (committed + pushed on
   `claude/infallible-margulis-67c167`, worktree of same name): `src/preview.ts`
   (per-modal HTTP+WS server :7475 → OSC/UDP :7474), `previewNote()` in
   `roll.html` (place/click/re-art/pitch-drag; WS primary, fetch/img fallback;
   toolbar "● preview" dot), `ArtRollPreview.maxpat` in the extension folder,
   ADR `01-decisions/2026-06-11-artroll-preview-network-side-channel.md`,
   options chart in `/Users/aviouslyavi/.claude/plans/so-how-do-we-jazzy-cascade.md`.
4. **PENDING LIVE VERIFY:** host started from the infallible-margulis worktree
   but stuck pre-greeting (known flaky reconnect — **toggle Developer Mode**).
   Then: drop `ArtRollPreview.maxpat` on an instrument track, open the roll,
   confirm green dot + audible keyswitch-then-note on click; confirm preview
   creates NO undo entries; then PR/merge the branch.
5. swub KS&EM (€29) assessed: different axis (automation lanes; SDK cannot
   write envelopes — verified no envelope API in .d.ts). Worth €29 of study for
   its PC/CC/UACC output model someday. VST plugin path re-confirmed ruled out;
   Live's plugin MIDI routing/External Instrument noted as viable for a future
   cross-DAW product only.

## Where we left off (session 1)
**MERGED TO MAIN.** The live walk happened: 11 of 13 checklist steps verified
first try, Avi gave a feedback round, all fixes were implemented + live-bound
same day, then committed (`9596873`), pushed, and merged via
https://github.com/AviouslyAvi/ableton-extensions/pull/1 (fast-forwarded main).

Feedback round implemented on top of the verified base:
- **Marquee select is the default** Mouse-tool drag on empty grid (no Cmd);
  plain click = deselect + insert marker; Cmd+drag still works.
- **Shift = additive** selection (click and marquee); Cmd = toggle.
- **Both note edges grabbable** (hover → resize cursor): multi-note resize is
  RELATIVE to each note's length; Shift during the drag = uniform length.
- **Razor cursor** (inline SVG) for the Cut tool.
- **Native webview menu suppressed document-wide** (the right-click "Reload"
  leak is gone).
- **Selector Mode is selection-wide** (click in selection converts all).
- **Cmd/Ctrl+1 = finer grid, Cmd/Ctrl+2 = coarser** (Off stays menu-only;
  from Off lands at 1/16). NB: Live draws at the grid value — note-length
  memory is FL behavior; Avi chose to keep the memory anyway.

**UNCOMMITTED in the frosty-solomon-cf8a62 worktree (post-merge):** the
text-size bump — base UI 11.5→13px, buttons/inputs +2px, lane articulation
names 9px→12px semibold, keyboard/ruler 9→10px. Parses clean; host was
restarted with it but the log shows `greeting` without `send success`, so the
re-bind is unconfirmed (known flaky reconnect; Developer Mode toggle fixes it).

## SDK capability verdicts (researched from the .d.ts, 2026-06-11)
- **No audio/audition API at all** — editor is silent by design; that's why
  the M4L port plan exists: `04-plans/articulation-roll-m4l-port.md`.
- **Modal is fixed-size** (`showModalDialog(url, w, h)`) — Avi is fine with
  1100×720 now that text is bigger.
- **Notes have NO per-note MIDI channel** (full field list verified) — FL's
  channel-per-articulation trick is impossible in Live; keyswitches stand.

## Immediate next step
1. Have Avi confirm the bigger text in Live (toggle Developer Mode if the
   modal doesn't open — handshake unconfirmed after last restart).
2. Commit the text-size change in the frosty worktree, push, PR/merge.
3. Then the worktree + branch `claude/frosty-solomon-cf8a62` can be deleted
   (host must stop first — it runs from that worktree).
4. Next build candidate: the M4L port spike (plan in `04-plans/`).

## Context to load on resume
- Room: `02-extensions/articulation-roll/` — on `main` now; the only delta
  lives in the frosty-solomon-cf8a62 worktree (`src/roll.html` text sizes).
- Files: `src/extension.ts` (host), `src/roll.html` (webview), `README.md`
  (design + 13-step checklist; update Status to "live-verified + merged").
- Plans: `04-plans/articulation-roll-m4l-port.md` (M4L port: jweb UI reuse,
  get_notes_extended/apply_note_modifications, noteout audition, 5 spike steps)
- Older plans: `/Users/aviouslyavi/.claude/plans/someone-made-a-score-virtual-sedgewick.md`
  (original build), `/Users/aviouslyavi/.claude/plans/task-notification-task-id-ba5hzqsn3-tas-sprightly-muffin.md`
  (interaction rework)
- UI preview (no Live): `03-experiments/roll-spike/preview.html`
- Sibling spike: `03-experiments/keyswitch-m4l/` — independently validates the
  M4L stack (v8 + Live API; get_selected_notes_extended works there).

## Open decisions / blockers
- Bigger-text live check pending (only step needing Ableton).
- Large-clip data-URI injection still unverified at scale.
- Known limitation (documented in README): overlapping notes with different
  articulations collapse deterministically by (startTime, pitch) run order —
  keyswitches can't express polyphonic articulation (now PROVEN a Live
  ceiling, not ours — no per-note channel in the note type).
- `vendor/*.tgz` is gitignored → absent in fresh worktrees. package.json uses
  `file:../../vendor/…`; in a worktree symlink it: `ln -sfn "<repo>/vendor" vendor`.
- Per Avi: handoffs live in the MAIN checkout's `05-handoffs/`, not in worktrees.

## Notes (durable)
- Model: modal popup editor (SDK has no docked panel / realtime sync / hotkeys).
- Articulations = keyswitch notes only (no MPE/note-expression). Host derives
  per-note art from keyswitches on open; groups same-art runs back into
  keyswitches on Apply inside one `withinTransaction`. Note fidelity preserved
  via id-overlay (untouched fields like probability survive; `art` never leaks
  into written melodic notes).
- Webview `laneSpans()` and host `keyswitchesFromNotes()` implement the SAME
  run-grouping rule (sort by startTime, tie-break pitch asc, null art breaks
  the run) — keep them in sync or the lane lies about what Apply writes.
- Map re-pitch verified in code: host re-`loadMap()`s both on the save-map
  reopen loop AND at Apply time, so Edit map → Save → Apply uses new pitches.
- **One extension host at a time.** The flaky re-handshake earlier today was
  THREE stale hosts fighting for the socket; `pkill -f "extensions-cli|ExtensionHostNodeModule"`
  then a single `npm start` bound instantly. Log: `/tmp/artroll-start.log`.
- FL note-color reference Avi likes: https://www.syntheticorchestra.com/tools/articulate/
- Positioning (Avi + Claude agreed): keep full editing, but the product is an
  **articulation manager** first — compose with sound in Live's piano roll,
  manage articulations here.
