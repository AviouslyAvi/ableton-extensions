# Running the Dev Host — a plain-English runbook

> How to start, stop, restart, and troubleshoot an Ableton extension yourself,
> without anyone driving it for you. Written around **Articulation Roll**, but the
> steps are the same for any extension in `02-extensions/`.

---

## The 10-second mental model

An "extension" is a little program that runs in **Node.js right next to Ableton
Live**. `npm start` does two things in one go:

1. **Builds** your code (TypeScript → one bundled `dist/extension.js`).
2. **Connects** that bundle to a running copy of Live (the "dev host").

Once connected, your feature shows up inside Live — for Articulation Roll, that's
the right-click menu item **Edit (Articulation Roll)…** on a MIDI clip. Quit
`npm start` and the menu item goes away. That's the whole loop.

**One rule that explains 90% of the pain:** only **one** dev host can be connected
to Live at a time. Two of them (or a leftover one from a crashed session) fight
over the slot and nothing works. When in doubt, kill all of them and start one.

---

## Cheat sheet (copy-paste)

```bash
# 1. Go to the Articulation Roll extension folder (this is the worktree where the work lives)
cd "/Users/aviouslyavi/Claude/Projects/Ableton SDK/.claude/worktrees/infallible-margulis-67c167/02-extensions/articulation-roll"

# 2. Kill any leftover/competing dev hosts first (safe to always run)
pkill -f "extensions-cli run"; pkill -9 -f "Helpers/ExtensionHost/node"

# 3. Start the dev host (builds + connects). Leave this terminal open.
npm start
```

To **stop** it: click that terminal and press **Ctrl+C**.
To **restart** it (e.g. after I change code): Ctrl+C, then run steps 2–3 again.

---

## Step by step (the first few times)

### 0. One-time prerequisites (check these once)
- **Ableton Live 12 Beta is open.** Not regular Live — the **Beta** build
  (`Ableton Live 12 Beta.app`). The dev host only talks to the Beta.
- **Dev Mode is ON** in Live: *Settings → Library/Extensions page →* enable the
  developer/extensions toggle. (You set this once; it sticks.)
- **Node is new enough:** in a terminal, `node --version` should be **≥ 24.14.1**.
- **`.env` is set:** the extension folder has a `.env` file containing
  `EXTENSION_HOST_PATH=…`. Without it, `npm start` can't find Live and won't
  connect. (Articulation Roll already has this — you don't need to touch it.)

### 1. Open a terminal in the right folder
Run the `cd "…/articulation-roll"` line from the cheat sheet. **The folder matters** —
`npm start` builds whatever extension you're standing in. For Round 2 work the
correct folder is the **`infallible-margulis-67c167`** worktree (that's where the
current branch and code live).

### 2. Clear any stragglers, then start
Run the `pkill …` line, then `npm start`. You'll see it build (a few KB of
`dist/extension.js`), then a block of log lines.

### 3. Confirm it actually connected
Watch the log for these two lines near the bottom:

```
info: Extension Host sends greeting to Live
info: FlipMessageStreamSocket send success
```

`send success` = **you're connected.** (A single `FlipMessageStreamSocket cannot
send now` right before it is normal — it's the handshake settling.) If you only
see `Started: Extension Host 1.0.0` and then nothing, jump to Troubleshooting.

### 4. Use it in Live
In Live, **right-click a MIDI clip → Edit (Articulation Roll)…**. The editor opens.
Leave the `npm start` terminal running the whole time you're testing.

### 5. Stop when you're done
Ctrl+C in the terminal. The menu item disappears; the slot is freed.

---

## After code changes — you must rebuild AND restart

The editor UI (`roll.html`) is **baked into the bundle at build time**, not read
live. So whenever the code changes (mine or yours), the running host is still
holding the *old* version. To pick up changes:

```
Ctrl+C        # stop the old host
pkill -f "extensions-cli run"; pkill -9 -f "Helpers/ExtensionHost/node"
npm start     # rebuilds + reconnects with the new code
```

Then **re-open** the clip in Live (close and re-open the Articulation Roll editor)
so it loads the fresh UI.

> Rule of thumb: "I changed something but Live still shows the old behavior" almost
> always means *the host wasn't restarted* (or the editor wasn't re-opened).

---

## Troubleshooting

### "It says `Started…` but never `send success`" (no greeting)
This is the classic **orphaned-host-squatting-the-slot** problem. A dead session
left a host process behind that's hogging the one slot. Fix:

```bash
pkill -9 -f "Helpers/ExtensionHost/node"
# then start again:
npm start
```

Full diagnosis + root cause is written up in
[`00-foundation/README.md`](README.md) under **"Host won't connect — pre-greeting
stall"** (the squatter is a `…/Helpers/ExtensionHost/node` process with **ppid 1**).
To see offenders: `ps axo pid,ppid,command | grep "Helpers/ExtensionHost/node"`.

### "It connects, then dies a few seconds later" / behavior is flaky
You probably have **two hosts running** — e.g. another terminal, or a second
Claude/automation session managing its own host. They reap each other. Fix: close
the other one, then `pkill -f "extensions-cli run"` and start a single clean host.
**If I (Claude) am also running one in the background, that counts as a second host
— tell me to stop mine, or just take it over yourself with this guide.**

### "Menu item doesn't appear in Live"
- Confirm `send success` showed in the log (Step 3).
- Confirm Dev Mode is ON and you're in **Live 12 Beta** (not regular Live).
- Right-click a **MIDI** clip specifically (Articulation Roll attaches to MIDI clips).

### "npm start: command not found / errors immediately"
- Are you in the extension folder (the `cd …/articulation-roll` line)?
- `node --version` ≥ 24.14.1?
- First time in a fresh checkout, you may need `npm install` once.

---

## Why there are "worktrees" (so the paths don't confuse you)

Each piece of in-progress work lives in its own copy of the repo under
`.claude/worktrees/<name>/`. They're real folders you can `cd` into. The Articulation
Roll Round 2 work is in **`infallible-margulis-67c167`** — that's why the cheat-sheet
path points there. If you ever start the host from the wrong worktree, you'll be
testing old or unrelated code. When in doubt, check the branch:

```bash
cd "/Users/aviouslyavi/Claude/Projects/Ableton SDK/.claude/worktrees/infallible-margulis-67c167"
git branch --show-current        # should print: claude/artroll-round2
```

---

## Related
- [`00-foundation/README.md`](README.md) — SDK quick reference, prerequisites,
  and the deep "pre-greeting stall" write-up.
- `START_HERE.md` — workspace router / what's in progress.
