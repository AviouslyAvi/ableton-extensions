/**
 * Similar Samples — right-click an audio clip in the Arrangement and the extension
 * finds the closest-sounding samples in your indexed library and stacks them in new
 * take lanes on the same track, aligned to the original clip, so you can A/B them in place.
 *
 * Two-part design (see README): a separate `indexer.ts` CLI crawls your sample folder
 * and writes `index.json` into this extension's storage directory; this extension reads
 * that index, analyses the clicked clip, ranks candidates, and places the top matches.
 * The extension never reads outside its sandbox — the source clip is analysed via
 * `renderPreFxAudio`, and library files are pulled in host-side via `importIntoProject`.
 */
import {
  initialize,
  AudioClip,
  AudioTrack,
  DataModelObject,
  TakeLane,
  type ActivationContext,
  type ExtensionContext,
  type Handle,
} from "@ableton-extensions/sdk";

import * as fs from "node:fs/promises";
import * as path from "node:path";
import decodeAudio from "audio-decode";

import {
  audioDistance,
  computeFeatures,
  matchScore,
  similarityPercent,
  tokenize,
  FEATURE_VERSION,
} from "./features.js";
import { INDEX_FILENAME, type SampleIndex } from "./index-format.js";

const COMMAND_ID = "similarSamples.find";
const UNPACK_COMMAND_ID = "similarSamples.unpack";
const UNPACK_OTHERS_COMMAND_ID = "similarSamples.unpackOthers";
const UNPACK_THIS_COMMAND_ID = "similarSamples.unpackThis";
const DEFAULT_MATCH_COUNT = 3;
const MIN_MATCH_COUNT = 1;
const MAX_MATCH_COUNT = 12;
// Tightness dial (0 = loose … 100 = tight). Acts as a minimum-similarity gate on the ranked
// matches: at higher tightness only candidates whose displayed similarity clears the floor are
// placed, so you may get FEWER than the requested count. Default 0 = loose = no gate, which
// reproduces the pre-dial behaviour (place exactly `matchCount` matches).
const MIN_TIGHTNESS = 0;
const MAX_TIGHTNESS = 100;
const DEFAULT_TIGHTNESS = 0;
// Below this acoustic distance, a candidate is the source itself (or a near-identical dup) and
// is excluded. Live copies a dragged-in sample into the project as "<name>-2.wav", so a path
// check alone misses the self-match; near-zero distance catches it whatever the file is named.
const DEDUP_DISTANCE = 0.05;
// Take lane holding a copy of the source clip, for A/B against the matches. Identified by this
// name prefix so unpacking can always skip it — it already lives on the main lane, so spinning
// it out to its own track would just duplicate the original.
const ORIGINAL_LANE_PREFIX = "Original · ";
const CONFIG_FILENAME = "config.json";

type Ctx = ExtensionContext<"1.0.0">;

export function activate(activation: ActivationContext): void {
  const context = initialize(activation, "1.0.0");

  const storage = context.environment.storageDirectory;
  console.log(`[Similar Samples] storage directory: ${storage ?? "(unavailable)"}`);
  if (storage) {
    console.log(
      `[Similar Samples] Build your library index with:\n` +
        `    npm run index -- "<your sample folder>" "${storage}"`,
    );
  }

  context.commands.registerCommand(COMMAND_ID, (arg: unknown) => {
    void findSimilar(context, arg as Handle).catch((e) => console.error("[Similar Samples]", e));
  });

  context.commands.registerCommand(UNPACK_COMMAND_ID, (arg: unknown) => {
    void unpackTakeLanes(context, arg as Handle).catch((e) => console.error("[Similar Samples]", e));
  });

  // Clip-scoped variant: the host hands us the exact clip you right-clicked, so we walk up to
  // the take lane that owns it and unpack every OTHER take lane (keeping that one in place).
  context.commands.registerCommand(UNPACK_OTHERS_COMMAND_ID, (arg: unknown) => {
    void unpackOtherFromClip(context, arg as Handle).catch((e) =>
      console.error("[Similar Samples]", e),
    );
  });

  // Clip-scoped variant: unpack ONLY the lane that owns the clicked clip (the inverse of
  // Unpack Other) — one new track for just that take, leaving every other lane in place.
  context.commands.registerCommand(UNPACK_THIS_COMMAND_ID, (arg: unknown) => {
    void unpackThisFromClip(context, arg as Handle).catch((e) =>
      console.error("[Similar Samples]", e),
    );
  });

  void context.ui
    .registerContextMenuAction("AudioClip", "Find Similar Samples", COMMAND_ID)
    .catch((e) => console.error("[Similar Samples] failed to register action", e));

  void context.ui
    .registerContextMenuAction("AudioClip", "Unpack Other Take Lanes → Tracks", UNPACK_OTHERS_COMMAND_ID)
    .catch((e) => console.error("[Similar Samples] failed to register unpack-others action", e));

  void context.ui
    .registerContextMenuAction("AudioClip", "Unpack This Take Lane → Track", UNPACK_THIS_COMMAND_ID)
    .catch((e) => console.error("[Similar Samples] failed to register unpack-this action", e));

  void context.ui
    .registerContextMenuAction("AudioTrack", "Unpack Take Lanes → Tracks", UNPACK_COMMAND_ID)
    .catch((e) => console.error("[Similar Samples] failed to register unpack action", e));
}

/** Filename without directory/extension and without Live's "-N" duplicate suffix, lowercased. */
function sampleStem(p: string): string {
  return path
    .basename(p)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "") // extension
    .replace(/-\d+$/, ""); // Live's "-2", "-3"… project-copy suffix
}

/** Climb the object hierarchy from a clip to the AudioTrack that owns it. */
function findAudioTrack(start: DataModelObject<"1.0.0"> | null): AudioTrack<"1.0.0"> | null {
  let obj = start;
  while (obj) {
    if (obj instanceof AudioTrack) return obj;
    obj = obj.parent;
  }
  return null;
}

async function loadIndex(context: Ctx): Promise<SampleIndex | null> {
  const storage = context.environment.storageDirectory;
  if (!storage) return null;
  try {
    const raw = await fs.readFile(path.join(storage, INDEX_FILENAME), "utf-8");
    return JSON.parse(raw) as SampleIndex;
  } catch {
    return null;
  }
}

/** Persisted Find settings, remembered in config.json so the popup pre-fills last time's values. */
interface FindConfig {
  matchCount: number;
  tightness: number;
}

/** Clamp any value to a whole number of matches within the supported range. */
function clampMatchCount(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_MATCH_COUNT;
  return Math.min(MAX_MATCH_COUNT, Math.max(MIN_MATCH_COUNT, v));
}

/** Clamp the tightness dial to a whole 0–100. */
function clampTightness(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_TIGHTNESS;
  return Math.min(MAX_TIGHTNESS, Math.max(MIN_TIGHTNESS, v));
}

/**
 * Minimum similarity % a match must clear at a given tightness. Loose (0) → 0% (no gate);
 * tight (100) → 90%. Kept deliberately simple and mirrored verbatim in the popup JS
 * (`Math.round(t * 0.9)`) so the dial's live readout always matches what the search filters on.
 */
function tightnessFloorPercent(tightness: number): number {
  return Math.round(clampTightness(tightness) * 0.9);
}

/** Read both Find settings fresh on every run; defaults if no/invalid config. */
async function loadConfig(context: Ctx): Promise<FindConfig> {
  const fallback: FindConfig = { matchCount: DEFAULT_MATCH_COUNT, tightness: DEFAULT_TIGHTNESS };
  const storage = context.environment.storageDirectory;
  if (!storage) return fallback;
  try {
    const raw = await fs.readFile(path.join(storage, CONFIG_FILENAME), "utf-8");
    const cfg = JSON.parse(raw) as { matchCount?: unknown; tightness?: unknown };
    return { matchCount: clampMatchCount(cfg.matchCount), tightness: clampTightness(cfg.tightness) };
  } catch {
    return fallback;
  }
}

async function saveConfig(context: Ctx, cfg: FindConfig): Promise<void> {
  const storage = context.environment.storageDirectory;
  if (!storage) return;
  const out: FindConfig = {
    matchCount: clampMatchCount(cfg.matchCount),
    tightness: clampTightness(cfg.tightness),
  };
  await fs.writeFile(path.join(storage, CONFIG_FILENAME), JSON.stringify(out, null, 2), "utf-8");
}

async function findSimilar(context: Ctx, handle: Handle): Promise<void> {
  const clip = context.getObjectFromHandle(handle, AudioClip);
  const sourcePath = clip.filePath;
  const track = findAudioTrack(clip.parent);

  if (!track) {
    await notify(context, "Could not find the audio track for this clip. Try the Arrangement view.");
    return;
  }

  // Ask how many matches to place and how tight to filter before doing any work. The popup
  // pre-fills with the remembered settings, so a repeat user just hits Enter; Cancel/Escape
  // does nothing.
  const opts = await promptFindOptions(context);
  if (opts == null) return;
  await saveConfig(context, opts);
  const { matchCount, tightness } = opts;
  const floorPct = tightnessFloorPercent(tightness);

  const index = await loadIndex(context);
  if (!index || index.entries.length === 0) {
    await notify(
      context,
      "No sample index found.<br><br>Build one first — see the console for the exact command:<br>" +
        "<code>npm run index -- \"&lt;your folder&gt;\" \"&lt;storage dir&gt;\"</code>",
    );
    return;
  }
  if (index.featureVersion !== FEATURE_VERSION) {
    await notify(context, "Your sample index is out of date. Please re-run the indexer.");
    return;
  }

  await context.ui.withinProgressDialog("Find Similar Samples", { progress: 0 }, async (update, signal) => {
    await update("Analysing the source clip…", 10);

    // Render the source clip's region to a temp WAV we're allowed to read, then fingerprint it.
    const wavPath = await context.resources.renderPreFxAudio(track, clip.startTime, clip.endTime);
    if (signal.aborted) return;
    const decoded = await decodeAudio(await fs.readFile(wavPath));
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    const sourceFeatures = computeFeatures(channels, decoded.sampleRate);

    const sourceResolved = path.resolve(sourcePath);
    const sourceTokens = tokenize(path.basename(sourcePath));
    const sourceFolder = path.basename(path.dirname(sourcePath));
    const sourceStem = sampleStem(sourcePath);

    await update("Ranking your library…", 40);
    const candidates = index.entries
      .map((e) => ({
        entry: e,
        audio: audioDistance(sourceFeatures, e.features),
        score: matchScore(sourceFeatures, sourceTokens, sourceFolder, e.features, e.tokens, e.folder),
      }))
      // Exclude the source itself (and any near-identical duplicate). Three nets, because Live
      // copies a dragged-in sample into the project as "<name>-2.wav" so the path differs:
      //   1. exact resolved path, 2. near-zero acoustic distance (same audio, any name),
      //   3. de-suffixed filename stem (catches Live's "-2" copy of an indexed original).
      .filter(
        (r) =>
          path.resolve(r.entry.path) !== sourceResolved &&
          r.audio > DEDUP_DISTANCE &&
          sampleStem(r.entry.path) !== sourceStem,
      )
      .sort((a, b) => a.score - b.score);

    // Tightness gate: keep only matches whose displayed similarity clears the floor, THEN take
    // the top `matchCount`. At loose (floor 0) this is a no-op and we place exactly the count.
    const ranked = candidates
      .filter((r) => similarityPercent(r.score) >= floorPct)
      .slice(0, matchCount);

    if (ranked.length === 0) {
      await notify(
        context,
        candidates.length === 0
          ? "No other samples in the index to compare against."
          : `No samples cleared the tightness floor (≥ ${floorPct}% similar).<br><br>` +
              "Lower the <b>Tightness</b> dial and try again.",
      );
      return;
    }
    if (signal.aborted) return;

    // Pull each match into the project host-side (works outside the sandbox), then place them.
    await update("Importing matches…", 65);
    const imported: string[] = [];
    for (const { entry } of ranked) {
      imported.push(await context.resources.importIntoProject(entry.path));
      if (signal.aborted) return;
    }

    await update("Adding take lanes…", 85);

    // First take lane is the ORIGINAL, so it stays in the A/B audition set instead of only
    // living on the main lane. Dedup deliberately keeps the source out of the *match ranking*
    // (no wasted slot, no false 100%); this re-adds it as a clearly-labelled reference take.
    // The match lanes follow, in ranked order. Lanes are created sequentially (each appends to
    // the end of takeLanes) to preserve that order; the clips are then made in one undo step.
    const originalName = path.basename(sourcePath);
    const originalLane = await track.createTakeLane();
    originalLane.name = `${ORIGINAL_LANE_PREFIX}${originalName}`;
    if (signal.aborted) return;

    const lanes: TakeLane<"1.0.0">[] = [];
    for (const { entry, score } of ranked) {
      const lane = await track.createTakeLane();
      // Lead with the % — the take-lane header is narrow and Live truncates long sample
      // names from the right, so a trailing percentage would be clipped off and never seen.
      lane.name = `${similarityPercent(score)}% · ${entry.name}`;
      lanes.push(lane);
      if (signal.aborted) return;
    }

    await Promise.all(
      context.withinTransaction(() => [
        // The original take: copy the source clip's own file/position/length/warp.
        originalLane
          .createAudioClip({
            filePath: clip.filePath,
            startTime: clip.startTime,
            duration: clip.duration,
            isWarped: clip.warping,
          })
          .then((c) => {
            c.name = `${ORIGINAL_LANE_PREFIX}${originalName}`;
            c.color = clip.color;
          }),
        ...lanes.map((lane, i) =>
          lane
            .createAudioClip({ filePath: imported[i]!, startTime: clip.startTime })
            .then((c) => {
              // Mirror the % onto the clip label too — that's the wide, always-visible
              // name on the timeline, so the match strength reads at a glance there as well.
              c.name = `${similarityPercent(ranked[i]!.score)}% · ${ranked[i]!.entry.name}`;
            }),
        ),
      ]),
    );

    const names = ranked.map((r) => `${r.entry.name} (${similarityPercent(r.score)}%)`).join(", ");
    console.log(
      `[Similar Samples] added Original + ${ranked.length} match take lane(s): ${names}`,
    );
    await update("Done", 100);
  });
}

/**
 * Unpack Take Lanes → Tracks (track-header menu): turn EVERY take lane on the track into
 * its own audio track.
 */
async function unpackTakeLanes(context: Ctx, handle: Handle): Promise<void> {
  const track = context.getObjectFromHandle(handle, AudioTrack);
  await runUnpack(context, track, null);
}

/**
 * Unpack Other Take Lanes → Tracks (audio-clip menu): unpack every take lane EXCEPT the one
 * that owns the clip you right-clicked. The host hands us the exact clicked clip, so we walk
 * up its parent chain to find both the owning take lane (the keeper) and the audio track.
 * Right-clicking the main/top clip (no owning take lane) leaves nothing to keep → unpacks all.
 */
async function unpackOtherFromClip(context: Ctx, handle: Handle): Promise<void> {
  const clip = context.getObjectFromHandle(handle, AudioClip);

  let keepLane: TakeLane<"1.0.0"> | null = null;
  let track: AudioTrack<"1.0.0"> | null = null;
  for (let o: DataModelObject<"1.0.0"> | null = clip; o; o = o.parent) {
    if (!keepLane && o instanceof TakeLane) keepLane = o;
    if (!track && o instanceof AudioTrack) track = o;
  }

  if (!track) {
    await notify(context, "Couldn't find the audio track for this clip.");
    return;
  }
  await runUnpack(context, track, keepLane ? new Set([keepLane]) : null);
}

/**
 * Unpack This Take Lane → Track (audio-clip menu): the inverse of Unpack Other — unpack ONLY
 * the take lane that owns the clicked clip, leaving every other lane in place. Implemented by
 * skipping every lane except the keeper. Right-clicking the main/top clip (no owning take lane)
 * or the "Original" reference lane has no single lane to spin out, so we say so rather than
 * silently unpacking nothing.
 */
async function unpackThisFromClip(context: Ctx, handle: Handle): Promise<void> {
  const clip = context.getObjectFromHandle(handle, AudioClip);

  let keepLane: TakeLane<"1.0.0"> | null = null;
  let track: AudioTrack<"1.0.0"> | null = null;
  for (let o: DataModelObject<"1.0.0"> | null = clip; o; o = o.parent) {
    if (!keepLane && o instanceof TakeLane) keepLane = o;
    if (!track && o instanceof AudioTrack) track = o;
  }

  if (!track) {
    await notify(context, "Couldn't find the audio track for this clip.");
    return;
  }
  if (!keepLane || keepLane.name.startsWith(ORIGINAL_LANE_PREFIX)) {
    await notify(
      context,
      "Right-click a clip inside a match take lane to unpack just that lane.",
    );
    return;
  }
  // Unpack only the keeper: skip every other lane. (runUnpack also always skips "Original".)
  const skip = new Set<DataModelObject<"1.0.0">>(track.takeLanes.filter((l) => l !== keepLane));
  await runUnpack(context, track, skip);
}

/**
 * Shared core for both unpack commands. Live has no native "explode take lanes" command,
 * so we rebuild it from `createAudioTrack` + `createAudioClip`. Non-destructive — the
 * source track and its lanes are left intact.
 *
 * @param skip - Take lanes to leave behind (selection-aware variant); `null` unpacks all.
 */
async function runUnpack(
  context: Ctx,
  track: AudioTrack<"1.0.0">,
  skip: Set<DataModelObject<"1.0.0">> | null,
): Promise<void> {
  // Only audio clips can be recreated (we need a filePath); skip anything else in the lane,
  // any lanes the caller asked us to leave in place, and always the "Original" reference lane
  // (it already lives on the main lane, so unpacking it would just duplicate the source).
  const sources = track.takeLanes
    .filter((lane) => !skip?.has(lane) && !lane.name.startsWith(ORIGINAL_LANE_PREFIX))
    .map((lane) => ({
      lane,
      clips: lane.clips.filter((c): c is AudioClip<"1.0.0"> => c instanceof AudioClip),
    }))
    .filter((s) => s.clips.length > 0);

  if (sources.length === 0) {
    await notify(
      context,
      skip
        ? "No other take lanes with audio clips to unpack."
        : "This track has no take lanes with audio clips to unpack.",
    );
    return;
  }

  await context.ui.withinProgressDialog("Unpack Take Lanes", { progress: 0 }, async (update) => {
    await update("Creating tracks…", 25);

    // One new audio track per non-empty lane, batched into a single undo step. The
    // returned array is in call order, so newTracks[i] pairs with sources[i] regardless
    // of where Live visually inserts each track.
    const song = context.application.song;
    const newTracks = await context.withinTransaction(() =>
      Promise.all(sources.map(() => song.createAudioTrack())),
    );
    newTracks.forEach((t, i) => {
      t.name = sources[i]!.lane.name || `Take ${i + 1}`;
    });

    await update("Copying clips…", 70);

    // Recreate each clip on its paired track at the same position, preserving warp,
    // length, name and colour as far as the API allows (loop settings aren't copied).
    await Promise.all(
      context.withinTransaction(() =>
        sources.flatMap(({ clips }, i) =>
          clips.map((c) =>
            newTracks[i]!
              .createAudioClip({
                filePath: c.filePath,
                startTime: c.startTime,
                duration: c.duration,
                isWarped: c.warping,
              })
              .then((nc) => {
                nc.name = c.name;
                nc.color = c.color;
              }),
          ),
        ),
      ),
    );

    const total = sources.reduce((n, s) => n + s.clips.length, 0);
    console.log(
      `[Similar Samples] unpacked ${sources.length} take lane(s) → ${newTracks.length} new track(s), ${total} clip(s).`,
    );
    await update("Done", 100);
  });
}

/**
 * Find popup: a small Live-themed webview with a number field for how many matches to place and
 * a Loose↔Tight similarity dial. Pre-fills with the values remembered in config.json so a repeat
 * user just hits Enter. Returns the clamped settings when the user confirms (Find/Enter), or null
 * when they cancel (Cancel/Escape) — the caller persists them and runs the search. Wrapped so a
 * webview-bridge hiccup can never throw into the command handler.
 */
async function promptFindOptions(context: Ctx): Promise<FindConfig | null> {
  const current = await loadConfig(context);
  const html = findHtml(current.matchCount, current.tightness);
  let result: string;
  try {
    result = await context.ui.showModalDialog(`data:text/html,${encodeURIComponent(html)}`, 360, 300);
  } catch (e) {
    console.error("[Similar Samples] find dialog failed", e);
    return null;
  }

  // Find posts { matchCount: <int>, tightness: <int> }; Cancel/Escape posts { matchCount: null }.
  let payload: { matchCount?: unknown; tightness?: unknown };
  try {
    payload = JSON.parse(result) as { matchCount?: unknown; tightness?: unknown };
  } catch {
    return null; // no/!JSON payload → treat as cancel
  }
  if (payload.matchCount == null || !Number.isFinite(Number(payload.matchCount))) return null;

  return { matchCount: clampMatchCount(payload.matchCount), tightness: clampTightness(payload.tightness) };
}

/** Inline HTML for the Find webview, themed to Live's dark UI (see SDK modal-dialog example). */
function findHtml(currentCount: number, currentTightness: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *,*::before,*::after{box-sizing:border-box}*:not(dialog){margin:0}input,button{font:inherit}
    :root{
      --bg:hsl(0,0%,21%);--control:hsl(0,0%,16%);--control-hi:hsl(0,0%,19%);
      --input:hsl(0,0%,12%);--text:hsl(0,0%,71%);--text2:hsl(0,0%,41%);
      --border:hsl(0,0%,7%);--accent:hsl(31,100%,67%);--on-accent:hsl(0,0%,7%);
    }
    html{background:var(--bg);color:var(--text);
      font-family:"AbletonSansSmall",-apple-system,system-ui,sans-serif;
      font-size:11.5px;font-weight:500;-webkit-font-smoothing:antialiased;height:100%}
    body{height:100%;display:flex;align-items:center;justify-content:center;padding:1.5em}
    .form{display:flex;flex-direction:column;gap:.75em;width:100%}
    .title{font-size:1.1rem;color:var(--text)}
    .hint{font-size:.95rem;color:var(--text2)}
    label{display:flex;flex-direction:column;gap:.3em;cursor:pointer}
    input[type=number]{font-size:1rem;line-height:1.5;background:var(--input);color:var(--text);
      border:1px solid var(--border);height:22px;padding:0 .4em;width:100%;outline-offset:0}
    input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:4px;padding:0;
      margin:.35em 0;background:var(--input);border:1px solid var(--border);border-radius:2px;cursor:pointer}
    input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:13px;
      height:13px;border-radius:50%;background:var(--accent);border:1px solid var(--border);cursor:pointer}
    input:focus{outline:2px solid var(--text2)}
    .dialrow{display:flex;justify-content:space-between;align-items:baseline;color:var(--text2)}
    #floor{color:var(--text)}
    .buttons{display:flex;gap:.5em;justify-content:flex-end;margin-top:.25em}
    button{font-size:1rem;line-height:1;background:var(--control);color:var(--text);
      border:1px solid var(--border);height:22px;padding:0 1.1em;border-radius:1em;cursor:pointer}
    button:hover{background:var(--control-hi)}
    button:active,button.primary:active{color:var(--on-accent);background:var(--accent)}
    button:focus{outline:2px solid var(--text2)}
  </style></head><body>
    <div class="form">
      <div class="title">Similar Samples</div>
      <label for="count">Matches to place (${MIN_MATCH_COUNT}–${MAX_MATCH_COUNT})
        <input id="count" type="number" min="${MIN_MATCH_COUNT}" max="${MAX_MATCH_COUNT}"
          step="1" value="${currentCount}" />
      </label>
      <label for="tightness">Tightness
        <input id="tightness" type="range" min="${MIN_TIGHTNESS}" max="${MAX_TIGHTNESS}"
          step="1" value="${currentTightness}" oninput="updateFloor()" />
      </label>
      <div class="dialrow"><span>Loose</span><span id="floor"></span><span>Tight</span></div>
      <div class="hint">Each match lands in its own take lane, aligned to the clicked clip.
        Tighter keeps only closer matches — you may get fewer than the count.</div>
      <div class="buttons">
        <button onclick="cancel()">Cancel</button>
        <button class="primary" onclick="find()">Find</button>
      </div>
    </div>
    <script>
      function send(o){var m={method:"close_and_send",params:[JSON.stringify(o)]};
        if(window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.live)
          window.webkit.messageHandlers.live.postMessage(m);
        else if(window.chrome&&window.chrome.webview) window.chrome.webview.postMessage(m);}
      // Mirrors tightnessFloorPercent() server-side: floor% = round(tightness * 0.9).
      function updateFloor(){var t=parseInt(document.getElementById("tightness").value,10)||0;
        var f=Math.round(t*0.9);
        document.getElementById("floor").textContent=f<=0?"no minimum":"\\u2265 "+f+"% similar";}
      function find(){var v=parseInt(document.getElementById("count").value,10);
        var t=parseInt(document.getElementById("tightness").value,10);
        send({matchCount:isNaN(v)?null:v,tightness:isNaN(t)?0:t});}
      function cancel(){send({matchCount:null});}
      document.addEventListener("DOMContentLoaded",function(){
        updateFloor();var el=document.getElementById("count");el.focus();el.select();});
      document.addEventListener("keydown",function(e){
        if(e.key==="Enter")find();if(e.key==="Escape")cancel();});
    </script>
  </body></html>`;
}

/**
 * Best-effort informational popup. Wrapped so a webview-bridge hiccup can never break the
 * main flow; the same message is always logged to the console as well.
 */
async function notify(context: Ctx, messageHtml: string): Promise<void> {
  console.log(`[Similar Samples] ${messageHtml.replace(/<[^>]+>/g, " ")}`);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font:13px -apple-system,system-ui,sans-serif;margin:0;padding:20px;
      background:#2b2b2b;color:#e6e6e6;display:flex;flex-direction:column;gap:16px}
    code{background:#1c1c1c;padding:2px 5px;border-radius:3px}
    button{align-self:flex-end;padding:6px 18px;border:0;border-radius:4px;
      background:#5a8ce6;color:#fff;font-size:13px;cursor:pointer}
  </style></head><body>
    <div>${messageHtml}</div>
    <button onclick="done()">OK</button>
    <script>
      function done(){
        var msg={method:"close_and_send",params:[""]};
        if(window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.live)
          window.webkit.messageHandlers.live.postMessage(msg);
        else if(window.chrome&&window.chrome.webview)
          window.chrome.webview.postMessage(msg);
      }
    </script>
  </body></html>`;
  try {
    await context.ui.showModalDialog(`data:text/html,${encodeURIComponent(html)}`, 420, 200);
  } catch {
    /* console log above is the fallback */
  }
}
