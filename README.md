# Ableton Live Extensions Workspace

A workspace for building **Ableton Live Extensions** with the
[`@ableton-extensions/sdk`](https://ableton.github.io/extensions-sdk/) —
TypeScript/Node.js code that runs alongside Live and can manipulate the Live Set
(tracks, clips, devices), register context-menu actions and commands, run
transactions, and show WebView UIs.

> **New here? Read [`START_HERE.md`](START_HERE.md) first.** It's the router for
> the whole workspace and tells you which folder ("room") to open for any task,
> so you never have to load everything at once.

## The extensions

| Extension | What it does |
|---|---|
| [articulation-roll](02-extensions/articulation-roll/README.md) | Right-click a MIDI clip → **Edit (Articulation Roll)…** → an FL-style, articulation-aware piano roll opens. Tag notes with articulations (sustain, staccato, pizzicato…); **Apply** writes the matching keyswitch trigger notes back to the clip in one undo step. |
| [similar-samples](02-extensions/similar-samples/README.md) | Right-click an Arrangement audio clip → **Find Similar Samples** → finds the closest-sounding samples in your indexed library and stacks the top 3 in new take lanes, aligned to the original for in-place A/B. |

See [`02-extensions/README.md`](02-extensions/README.md) for the full index and status of each.

## How the workspace is organized

A three-layer routing system keeps each task's context small (details in
[`CLAUDE.md`](CLAUDE.md)):

| Folder | Purpose |
|---|---|
| `00-foundation/` | SDK reference, API notes, manifest schema, env + CLI setup. Stable knowledge. |
| `01-decisions/` | Architecture/design decision records (ADRs), one per decision. |
| `02-extensions/` | The shippable extension projects, each in its own subfolder. |
| `03-experiments/` | Spikes and throwaway API exploration. Nothing load-bearing. |
| `04-plans/` | Roadmap and backlog of extensions to build. |
| `05-handoffs/` | Session continuity (`active/`, `archive/`, `_TEMPLATE.md`). |
| `dist-extensions/` | Compiled `.ablx` builds, one installable file per extension. |

## Building & running

Each extension is a self-contained SDK project. From inside an extension folder:

```sh
npm install
npm run build              # tsc --noEmit + esbuild bundle (no Live needed)
npm start                  # build + load into Live's Extension Host (Live Beta must be running)
npm run package            # → dist-extensions/<Name>.ablx (installable)
```

Rebuild every extension at once with `npm run package:all` from the repo root.
Installing: drop a `.ablx` onto Live's **Extensions** settings page.

**Requirements:** Node ≥ 24.14.1, the Ableton Live Beta build, and
`EXTENSION_HOST_PATH` set in each extension's `.env` (copy from `.env.example`)
so `npm start` can connect to Live.

## Learn more

- Extensions SDK docs: https://ableton.github.io/extensions-sdk/
- Workspace router: [`START_HERE.md`](START_HERE.md)
- Operating procedure / conventions: [`CLAUDE.md`](CLAUDE.md)
