---
date: 2026-06-11
slug: articulation-roll
status: active
---

# Handoff — Articulation Roll (FL-style articulation MIDI editor)

## Where we left off
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
