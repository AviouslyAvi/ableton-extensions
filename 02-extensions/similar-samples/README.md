# Similar Samples

Right-click an audio clip in the Arrangement → **Find Similar Samples** → the extension
finds the closest-sounding samples in your indexed library and stacks the top 3 in new
**take lanes** on the same track, each aligned to the original clip, so you can A/B them
in place. A reference copy of the source clip is added as a top **`Original ·` take lane**
too, so the original is part of the audition set instead of only living on the main lane.

> Take lanes are hidden by default. After running the command, reveal them with the
> track header's **⊟ Show Take Lanes** toggle (or right-click the track → *Show Take
> Lanes*) to see and audition the matches.

It's the spirit of Live's browser "Similar Samples" feature, but triggered from a clip on the
timeline — using our own acoustic matching, because Live's engine isn't exposed to extensions.

## Why it's split in two

The Extensions SDK sandbox lets an extension read only its own storage/temp dirs — it **can't**
crawl your Samples folder. So the work is split:

- **`src/indexer.ts`** — a plain Node CLI (not sandboxed) that crawls a folder you point at,
  fingerprints every sample, and writes `index.json`.
- **`src/extension.ts`** — the sandboxed Live extension. It reads that index, analyses the
  clicked clip via `renderPreFxAudio` (allowed), ranks candidates, and places the matches using
  `importIntoProject` (host-side, can reach external files) + `createAudioClip`.
- **`src/features.ts`** — shared, pure DSP used by both sides so their fingerprints are
  comparable (FFT spectral centroid/rolloff, fundamental, zero-crossing rate, decay, length).
- **`src/index-format.ts`** — the `index.json` schema shared by both sides.

This design already complies with the stricter OS sandbox the SDK docs warn is coming.

## Matching

Hybrid: audio-feature distance is the primary signal (frequency dims compared in log/octave
space), nudged by a small heuristic boost for filename-token overlap and same-folder samples.
Tune weights in `audioDistance` / `matchScore` in `features.ts`.

**Self/duplicate exclusion.** The source clip is kept out of its own match ranking so it never
wastes a slot or shows a false 100% match. Three nets catch it, because Live copies a dragged-in
sample into the project as `<name>-2.wav` (so a path check alone misses it): exact resolved path,
near-zero acoustic distance (`DEDUP_DISTANCE` — same audio under any name), and a de-suffixed
filename stem (catches Live's `-2`/`-3` copy of an indexed original). The source is then re-added
deliberately as the labelled `Original ·` reference take — not as a match.

## Requirements to run in Live

- **Node ≥ 24.14.1** (the Extension Host needs it; building/indexing alone work on older Node).
- The **Ableton Live Beta build** that supports Extensions (regular Live won't work).
- **Developer Mode** enabled: Live → **Preferences → Extensions → Developer Mode**. Without it,
  `npm start` cannot connect.

## Setup & use

```bash
npm install
```

The `start` script pins the extension's storage directory to `./.live-storage`, so the index
location is fixed and predictable (no need to fish a path out of the logs).

1. **Point the CLI at your Live Beta.** Either set `EXTENSION_HOST_PATH` in `.env` to your Live
   Beta app path (copy `.env.example` → `.env`), e.g.
   `EXTENSION_HOST_PATH=/Applications/Ableton Live 12.x Beta.app`
   — or skip `.env` and pass `--live "<path>"` to the CLI yourself.

2. **Build the index into the pinned storage dir:**
   ```bash
   npm run index -- "/path/to/your/Samples" ".live-storage"
   ```

3. **Launch into Live:** with Developer Mode on and the Live Beta open,
   ```bash
   npm start
   ```
   builds the extension and loads it via the Extension Host. Watch the terminal for
   `[Similar Samples] storage directory: …` and the registration log.

4. **Use it.** In Live's Arrangement, right-click an audio clip → **Find Similar Samples**.
   New take lanes appear on the same track (reveal them with **Show Take Lanes**): a top
   `Original · <sample>` lane holding a copy of the source clip for reference, followed by
   one lane per match, each aligned to the original clip so you can A/B them in place. Each
   match lane (and its clip) is named `NN% · <sample>`, where **NN%** is how close that match
   is to the source (100% = effectively identical; the figure tapers toward 0 as matches get
   looser). The % leads the name so it stays visible even when Live truncates a long sample
   name in the narrow take-lane header.

Re-run step 2 whenever your library changes (the index is a snapshot). If you'd rather not pin
the storage dir, drop `--storage-directory .live-storage` from the `start` script and instead
index into the path the extension logs on launch.

## Adjusting how many matches

Right-click an audio clip → **Similar Samples Settings…** opens a small dialog with a number
field. Set how many matches to place (default **3**, range **1–12**) and click OK. The value is
saved to `config.json` in the extension's storage dir and **read fresh on every Find**, so it
persists across sessions and takes effect immediately — no rebuild. Cancel/Escape leaves it
unchanged. You can also edit `config.json` (`{ "matchCount": N }`) by hand if you prefer.

## Unpacking take lanes to tracks

Once you've auditioned the matches and want to keep one or more, unpack take lanes into their
own audio tracks. Each take lane becomes a new audio track, with every audio clip recreated at
its original position (warp state, length, name, and colour preserved). Live has no native
"explode take lanes" command, so this rebuilds it with `createAudioTrack` + `createAudioClip`.

There are three entry points, depending on how much you want to unpack:

- **All lanes** — right-click the **track header** → **Unpack Take Lanes → Tracks**. Every
  take lane on the track is spun out.
- **Every lane except one** — right-click a **clip inside a take lane** → **Unpack Other Take
  Lanes → Tracks**. The lane that owns the clicked clip stays in place; all the others are
  unpacked. (Right-click the main/top clip, which owns no take lane, and this unpacks all.)
- **Just one lane** — right-click a **clip inside a match take lane** → **Unpack This Take
  Lane → Track**. Only that one lane is spun out to a single new track; every other lane is
  left alone.

The clip-scoped commands work because the host hands the extension the exact clip you
right-clicked, so it walks up to the owning take lane and audio track.

It's **non-destructive**: the source track and its take lanes are left untouched — you get
copies on fresh tracks, so delete the lanes (or the new tracks) afterward as you like.

- The `Original ·` reference lane is **always skipped** by every unpack command — it already
  lives on the main lane, so spinning it out would just duplicate the source. (For the same
  reason, **Unpack This** on the `Original ·` lane does nothing and says so.)
- Only **audio** clips are unpacked; empty lanes and non-audio clips are skipped.
- Loop settings aren't carried over (filePath, start, length, warp, name, and colour are).
- New-track *visual* order may not match lane order — Live inserts each created track after
  the current selection. The clip→track pairing is always correct regardless of order.

## Verifying matching without Live

The indexer can rank against an existing index from the CLI:

```bash
npm run index -- --nn "<storage dir>/index.json" "/path/to/some/kick.wav"
```

Prints the 3 nearest neighbours with scores (lower = closer).

## Notes / limits

- The `"AudioClip"` context-menu scope also fires in Session view; placement targets the
  Arrangement, and the extension bails gracefully if it can't resolve the owning audio track.
- Matches land in take lanes on the **clicked clip's own track**, aligned to its start time —
  non-destructive (existing clips/lanes are untouched; new lanes append after any you already
  have). Take lanes are hidden until you toggle **Show Take Lanes** on the track.
- Undo: the clips are one undo step; each take lane is its own step. (The SDK can't create a
  lane and its clip in one transaction because the clip needs the lane handle first, so a full
  undo of one run takes a few presses.)
- `npm start` requires Node ≥ 24.14.1. Building/typechecking and the indexer run on older Node.
- Scripts: `npm run build` (typecheck + bundle), `npm run build:dev` (bundle only),
  `npm start` (bundle + launch host), `npm run index` (indexer CLI).
