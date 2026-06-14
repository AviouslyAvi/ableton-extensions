---
date: 2026-06-11
slug: preview-bridge
status: active
---

# Handoff — Articulation Roll preview bridge

## Where we left off
Mid-modal probe PASSED live (all four localhost side-channels escape the SDK
modal; WebSocket primary). Audible note preview is integrated into the roll and
committed/pushed on `claude/infallible-margulis-67c167`. M4L port ruled
unnecessary for preview.

## Immediate next step
**BLOCKED on host↔Live handshake — try after a full Mac reboot.** Live-verify
preview: relaunch host (`npm start` in `02-extensions/articulation-roll`, from the
`infallible-margulis-67c167` worktree), confirm it connects (see check below),
drop `ArtRollPreview.maxpat` on an instrument track (Max MIDI Effect, before the
instrument), open the roll, click notes → expect green "● preview" dot +
keyswitch-then-note, and NO undo entries. Then PR `claude/infallible-margulis-67c167`.

**Connection check (do this BEFORE the maxpat dance):** right-click a MIDI clip →
look for **"Edit (Articulation Roll)…"** in the context menu. If present = host
connected, proceed. If absent = still blocked (see Session 3 findings). The Live
Settings → Extensions list does NOT show dev extensions, so don't rely on it.

## Session 3 (2026-06-12) — handshake blocker, fully triaged, NOT solved
Spent the session trying to get past the pre-greeting stall. **Could not connect**
the host to Live tonight. The one partial success was at 23:42 (greeting sent, but
even that never fully registered) and was irreproducible. Symptom is deterministic:
host process starts, the native runtime logs `Started: Extension Host 1.0.0` to
`/tmp/artroll-preview.log`, then **never sends the greeting / never registers** —
no "Edit (Articulation Roll)…" menu item, extension absent everywhere.

**Ruled OUT (all verified, don't re-test these):**
- Stacked/zombie hosts & port collision — was happening early (two hosts at once);
  cleaned up. `pkill -9 -f extensions-cli; pkill -9 -f "tsx build.ts"` then verify
  zero before each launch. Not the root cause on its own.
- Live state — full quit+reopen with Dev Mode stably on: still fails.
- Stale IPC sockets — deleted `exthost-ctrl-ipc-channel` + `exthost-flip-api-ipc-channel`
  from `$TMPDIR` (`/var/folders/0f/wn38s2f56xb8htzjt99ywmxc0000gn/T/`) while Live
  down; Live recreated them clean on reopen: still fails.
- Launch timing — host into a fully-settled Live (30s+ after load): still fails.
- Launch method — both harness tracked-background AND `(npm start &)` subshell: same.
- `$TMPDIR` mismatch — host and Live share the same `$TMPDIR`. Not it.
- Manifest — valid (`name: Articulation Roll`, `entry: dist/extension.js`,
  `minimumApiVersion: 1.0.0`). Not it.
- Live version drift — Live is `12.4.5b3` dated **2026-05-29**, NOT updated
  mid-session; predates the work. SDK/CLI are vendored `@ableton-extensions/{sdk,cli}@1.0.0-beta.0`.
- preview.ts top-level — pure (node imports + pure fns); `startPreviewBridge()`
  (the only port bind) is inside the roll command handler, not `activate()`, so it
  cannot block the greeting. Not it.
- Orphaned Ableton helpers — none surviving between Live restarts.

**Best current theory:** kernel/mach-port-level IPC wedge that survives Live
restarts + socket cleanup → only a **full machine reboot** is likely to clear it.
NOT a code problem: session-1 articulation-roll was verified live (PR #1), and the
preview-bridge probe (`03-experiments/artroll-preview-bridge/`) connected live
earlier today. The integrated build is sound; the runtime is stuck.

**Diagnostic one-liner** (after launching a host, to see if it actually attached):
`NPID=$(pgrep -f "node.*extensions-cli run" | head -1); lsof -nP -p "$NPID" | grep -iE "exthost|unix"`
— empty = not connected; should show a unix socket to `exthost-ctrl-ipc-channel`.
Also confirm Live is listening: `lsof -nP -p $(pgrep -f "MacOS/Live") | grep exthost`.

## Context to load on resume
- Full detail: `05-handoffs/active/handoff-2026-06-11-articulation-roll.md`
  (SESSION 2 UPDATE block at top)
- Room: `02-extensions/articulation-roll/` — `src/preview.ts` (host WS/HTTP
  :7475 → OSC/UDP :7474), `previewNote()` in `src/roll.html`, `ArtRollPreview.maxpat`
- ADR: `01-decisions/2026-06-11-artroll-preview-network-side-channel.md`
- Options chart: `/Users/aviouslyavi/.claude/plans/so-how-do-we-jazzy-cascade.md`
- Spike (probe evidence): `03-experiments/artroll-preview-bridge/`

## Open decisions / blockers
- ~~Merge PR #2 (text-size bump, `claude/frosty-solomon-cf8a62`)~~ ✅ DONE
  2026-06-12 — merged (PR #2, mergedAt 19:35Z), frosty worktree removed, local +
  remote branch deleted, pruned.
- After live-verify: PR/merge `claude/infallible-margulis-67c167`. **Still gated on
  the handshake blocker above — do NOT PR until preview is verified in Live.**
- Optional: buy swub KS&EM (€29) to study its PC/CC/UACC output model.

## Notes
- Ports: 7475 (webview→host HTTP/WS), 7474 (host→M4L UDP `/artroll/note`).
- One extension host at a time; port collision = preview silently disabled.
- SDK has no envelope-writing API, so swub-style automation-lane approaches
  can't integrate — preview had to go through the network/M4L route.
