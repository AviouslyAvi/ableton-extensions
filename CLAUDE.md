# CLAUDE.md — Operating Procedure (Ableton Extensions Workspace)

This is a **code workspace** for building Ableton Live Extensions. It uses a three-layer routing system to keep context small. Follow it.

## Architecture

- **Layer 1:** `START_HERE.md` — read first, every session. Routes any task to one room.
- **Layer 2:** `NN-room/README.md` — each room's local context (what to load / skip / which skills).
- **Layer 3:** work files inside rooms — loaded only when a room README says they're relevant.

Rooms:
- `00-foundation/` — SDK reference, API notes, manifest schema, env + CLI setup. **Stable knowledge.**
- `01-decisions/` — design/architecture decision records (ADRs), one file per decision.
- `02-extensions/` — actual shippable extension projects, each in its own subfolder.
- `03-experiments/` — spikes and throwaway API exploration. Nothing here is load-bearing.
- `04-plans/` — roadmap and idea backlog for extensions to build.
- `05-handoffs/` — session continuity (`active/`, `archive/`, `_TEMPLATE.md`).

## Token discipline

1. **Always read `START_HERE.md` first.** Then read only the target room's README, then only the files it lists.
2. **Never load multiple rooms at once.** If a task spans rooms, finish in one, then move.
3. **Never bulk-load the SDK.** The SDK lives at `/Users/aviouslyavi/Downloads/extensions-sdk-1.0.0-beta.0/`. Reference specific files (a single API HTML page, one example's `extension.ts`) — do not read `api/` or `docs/` wholesale. The rendered API docs are HTML; strip tags when reading.
4. **Prefer the examples** in the SDK over guessing API shapes. Each example is small and authoritative.

## Where things go

- A new extension you intend to keep → new folder under `02-extensions/<name>/`.
- A quick "does this API even work" test → `03-experiments/`.
- "We chose esbuild CJS bundling because…" → `01-decisions/`.
- Reusable facts (manifest fields, `minimumApiVersion`, CLI flags) → `00-foundation/`.
- An idea you're not building yet → `04-plans/`.

## Extension project conventions (per the SDK)

- Entry: `src/extension.ts` exports `activate(context: ActivationContext)`.
- Inside `activate`: `const api = initialize(context, "1.0.0")`, then register commands / context-menu actions.
- `manifest.json`: `name`, `author`, `entry` (`dist/extension.js`), `version`, `minimumApiVersion`.
- Build: `build.ts` runs esbuild (bundle, `format: "cjs"`, `platform: "node"`).
- `.env` must set `EXTENSION_HOST_PATH=…` or `npm start` cannot connect to Live.
- Requires Node ≥ 24.14.1 and the Live Beta build.

## Handoff protocol

- On `/handoff` or session wrap-up: copy `05-handoffs/_TEMPLATE.md` to `05-handoffs/active/YYYY-MM-DD-<slug>.md`, fill it in, and update the **Active threads** list in `START_HERE.md`.
- When a thread is done, move its handoff from `active/` to `archive/`.
- At session end on handoff-tracked work, also emit a copy-paste resume prompt in chat.

## Subagent delegation

- Use subagents for parallel, independent reads (e.g. surveying several SDK examples or API classes at once) so the main context stays lean — return conclusions, not file dumps.
- Keep build/run of extensions (`npm start`) in the main thread where the user can see output.
