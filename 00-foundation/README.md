# 00 — Foundation

## Room purpose
Stable reference knowledge for the Ableton Extension SDK. This is the room you enter to answer "how does X work in the SDK" — API shapes, the manifest schema, CLI commands, environment setup.

## What lives here
- Notes distilled from the SDK docs/api (so we don't re-read HTML every time).
- The manifest schema and field meanings.
- CLI / build / run command reference.
- Environment + prerequisites checklist.

## Files to load
- This README.
- Any `*.md` notes you've saved in this room relevant to the question.

## Files to skip
- Don't load the raw SDK `api/*.html` or `docs/*.html` wholesale — reference one page at a time and strip tags.

## Skills to invoke
- `Avious-documentation` to save distilled SDK notes here as `.md`.

## Pipeline
SDK docs/examples → distilled notes here → consumed by `02-extensions` and `03-experiments`.

## When to leave this room
Once you know the API/command you needed, go to `02-extensions` (to build) or `03-experiments` (to test it).

---

## SDK quick reference (v1.0.0-beta.0)

**Location:** `/Users/aviouslyavi/Downloads/extensions-sdk-1.0.0-beta.0/`
- `api/` — rendered TypeDoc (classes: `Song`, `Track`, `Clip`, `MidiClip`, `AudioClip`, `Device`, `Ui`, `Commands`, `Application`, `Scene`, `Sample`, `RackDevice`, …).
- `docs/` — guides: getting-started, essentials (Activation/Context, Handles, Commands, Transactions, Progress, Resources/Filesystem, Context Menu Items, Webviews, Bundling/Packaging), design, development (Logging, Execution).
- `examples/` — `strip-silence`, `progress-dialog`, `arrangementselection`, `warpMode`, `context-menu`, `audio-clips`, `modal-dialog`.
- `.tgz` packages: `ableton-extensions-sdk`, `ableton-extensions-cli`, `ableton-create-extension`.

**Prerequisites:** Node ≥ 24.14.1 · Ableton Live **Beta** build · VS Code recommended.

**Create a new extension** (run inside an empty folder):
```bash
npx file:/Users/aviouslyavi/Downloads/extensions-sdk-1.0.0-beta.0/ableton-create-extension-1.0.0-beta.0.tgz
```
Generates: `.env`, `.gitignore`, `README.md`, `build.ts`, `manifest.json`, `package.json`, `tsconfig.json`, `src/extension.ts`, `vendor/*.tgz`.

**Manifest (`manifest.json`):**
```json
{
  "name": "My Extension",
  "author": "Your Name",
  "entry": "dist/extension.js",
  "version": "0.0.1",
  "minimumApiVersion": "1.0.0"
}
```

**Entry point (`src/extension.ts`):**
```ts
import { initialize, type ActivationContext } from "@ableton-extensions/sdk";

export function activate(context: ActivationContext) {
  const api = initialize(context, "1.0.0");
  api.commands.registerCommand("myAction", () => { /* ... */ });
  api.ui.registerContextMenuAction("ClipSlot", "Process this ClipSlot", "myAction");
}
```

**Run:** `npm start` (builds via esbuild + loads into Live). **Required:** `.env` must set `EXTENSION_HOST_PATH=…` or `npm start` can't connect to Live.

**Build:** `build.ts` uses esbuild — `bundle: true`, `format: "cjs"`, `platform: "node"`; `--production` minifies. Scripts: `start`, `build`, `package`.

---

## SDK limitations, gotchas & what NOT to do

> Distilled the hard way while building `02-extensions/similar-samples`. Read this before
> scoping any extension — several appealing ideas are simply not reachable from the API.

### Hard limitations — things the SDK does NOT expose
- **No browser / library / "Similar Samples" access.** There is no API for Live's Browser,
  Collections, Places, file browser, sample search, tagging, or the acoustic "Similar Samples"
  engine. You cannot query, list, or search the user's sample library from an extension.
- **No real-time / DSP audio processing.** Extensions are not an audio plugin. You can render a
  region offline (`renderPreFxAudio`) and analyse the WAV, but you cannot process the live audio
  stream. The docs point you to **Max for Live** for real-time work.
- **Only built-in Live devices** can be inserted (`Track.insertDevice("Reverb", …)`). Third-party
  VST/AU plug-ins cannot be loaded via the API.
- **No transport / playback control, no recording, no automation editing** in v1.0.0-beta.0. The
  object model is tracks / clips / devices / scenes / mixer params — not the transport.
- **No arbitrary UI** — UI is limited to context-menu actions + modal **webviews**
  (`showModalDialog`) + progress dialogs. No custom panels docked in Live.

### Filesystem sandbox — the big one (`docs/essentials/concepts/6-resources-and-filesystem.html`)
- The extension may **only read/write `context.environment.storageDirectory` and
  `.tempDirectory`**. Do **not** read the user's Documents/Downloads/Desktop or any arbitrary
  path — even though `fs` currently works there, a stricter OS sandbox is coming and will break it.
- Both directories are `string | undefined` — always guard for `undefined`.
- `tempDirectory` may be wiped between sessions; put anything durable in `storageDirectory`.
- **To touch a file outside the sandbox, go through the host:**
  - `resources.importIntoProject(absPath)` — copies an external file into the project, host-side.
    Use the **returned** path afterwards, never the original.
  - `resources.renderPreFxAudio(track, startBeat, endBeat)` — renders a track region to a WAV in
    `tempDirectory` that you *are* allowed to `fs.readFile` + decode.
- The sandbox extends to `child_process` and native addons — no working around it.
- **Pattern for "analyse the user's whole library":** you can't crawl it from the extension. Do
  the crawl in a **separate, non-sandboxed Node CLI** and write results into `storageDirectory`
  for the extension to read. (This is exactly the indexer/extension split in `similar-samples`.)

### Context menus (`registerContextMenuAction`)
- Registered **in code**, not in the manifest. Returns a `Promise<() => Promise<void>>`
  (an unregister fn) — `await`/catch it.
- Pair it with a `commands.registerCommand(id, cb)` of the **same `commandId`**.
- **Scopes that pass the object's `Handle`:** `AudioClip`, `AudioTrack`, `ClipSlot`, `DrumRack`,
  `MidiClip`, `MidiTrack`, `Sample`, `Scene`, `Simpler`.
  **Scopes that pass a selection object:** `ClipSlotSelection`, `AudioTrack.ArrangementSelection`,
  `MidiTrack.ArrangementSelection` (→ `{ time_selection_start, time_selection_end, selected_lanes }`).
- **`"AudioClip"` fires in BOTH Session and Arrangement** — you can't tell which view. Handle both
  or resolve the owning track defensively (a clip's `parent` may be a `TakeLane`, not the
  `AudioTrack` — climb `parent` until `instanceof AudioTrack`).
- The command callback arg is typed `unknown` — cast to `Handle` / `ArrangementSelection` yourself.

### Handles & the object model
- Never construct a `Handle`; only use ones the host gives you. Resolve with
  `context.getObjectFromHandle(handle, SomeClass)`. Pass `DataModelObject` when the type is unknown,
  then branch with `instanceof`.
- `getObjectFromHandle` **throws** if the object was deleted, is the wrong type, or is unrecognised.
- `DataModelObject.parent` is the canonical hierarchy parent (may be `null`).
- Reads are synchronous getters (`clip.filePath`, `clip.startTime`, `song.tempo`). Mutations that
  create/delete objects are **async** (`createAudioClip`, `createAudioTrack`, `deleteTrack`, …).

### Transactions (`withinTransaction`) — easy to misuse
- Groups mutations into **one undo step**. The callback **must be synchronous** — you cannot
  `await` inside it. To group async ops, return an array/`Promise.all` of promises and await
  *outside*: `await Promise.all(withinTransaction(() => specs.map(s => track.createAudioClip(s))))`.
- Because the body is sync, you **can't create a track and then add clips to it in one
  transaction** (the clips need the awaited track handle first) → that's inherently ≥2 undo steps.
- Pre-compute anything that depends on prior results (e.g. clip positions from sample durations)
  *before* the transaction so the body stays sync.

### `createAudioClip` / clip placement
- `AudioTrack.createAudioClip({ filePath, startTime, duration?, isWarped?, loopSettings? })` — arg is
  an **object**; `startTime`/durations are in **beats**. Omitting `duration` uses the sample's
  natural length at the current tempo.
- `loopSettings` requires `isWarped` to be defined; if `isWarped:false`, `looping` must be `false`
  and positions non-negative. Loop must be ≥ 0.25 beat.
- Seconds → beats: `beats = seconds * song.tempo / 60`. The SDK gives you sample seconds only if
  you measured them (the API has no "sample length in beats" before creation).

### Webview modals (`showModalDialog`)
- Schemes: `file:`, `data:`, `https:`, `http://localhost`. Returns `Promise<string>`.
- The dialog **only closes when its HTML posts** `{ method:"close_and_send", params:[str] }` to
  `window.webkit.messageHandlers.live` (macOS) or `window.chrome.webview` (Windows). An info popup
  with no such button will **hang the promise** — always include a close path, and wrap in
  try/catch so a bridge hiccup can't stall your flow.

### Tooling / build gotchas
- **`npm start` needs Node ≥ 24.14.1** AND the Live **Beta** build running. Typechecking, esbuild
  bundling, and standalone CLIs run fine on older Node — so you can build/validate logic without Live.
- `EXTENSION_HOST_PATH` in `.env` is mandatory for `npm start` to connect.
- esbuild config must stay `format:"cjs"`, `platform:"node"`, `bundle:true`. Bundles can be large
  (e.g. `audio-decode` → ~4 MB) — that's expected, not an error.
- `tsconfig` is strict with `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`: typed-array
  **compound assignment** (`a[i] += x`) trips the undefined check — write `a[i] = a[i]! + x`. And
  **omit** optional keys entirely rather than passing `undefined`.
- With `moduleResolution:"nodenext"`, relative imports need a **`.js` extension** in the specifier
  (`import {x} from "./features.js"`) even though the file is `.ts` — tsc, tsx, and esbuild all map it.

### Capability cheat-sheet (what you CAN do)
Manipulate the Live Set object model (tracks/clips/devices/scenes/mixer params), create/delete
tracks·scenes·clips, insert built-in devices, read clip/sample file paths, render arrangement audio
offline, import external files into the project, register context-menu actions + commands, run
transactions, show progress dialogs and webview modals, persist state in `storageDirectory`,
use `fetch` and the Node stdlib (within the sandbox boundaries).
