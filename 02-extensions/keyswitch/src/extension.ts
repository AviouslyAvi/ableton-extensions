import {
  initialize,
  MidiClip,
  TakeLane,
  Track,
  DataModelObject,
  type ActivationContext,
  type Handle,
  type NoteDescription,
  type ArrangementSelection,
} from "@ableton-extensions/sdk";
import * as fs from "node:fs";
import * as path from "node:path";

// esbuild inlines this as a string (see build.ts `.html` text loader).
import paletteHtml from "./palette.html";

type V = "1.0.0";

/**
 * One articulation = one keyswitch note. `pitch` is the MIDI note number Live
 * sends to trigger the articulation (Live convention: C-2 = 0, C3 = 60).
 * `hold` true => the keyswitch is held for the rest of the clip (latched);
 * false => a short trigger note (default 0.25 beat).
 */
type Articulation = {
  name: string;
  pitch: number;
  velocity?: number;
  hold?: boolean;
};

const TRIGGER_DURATION = 0.25; // beats, for non-held keyswitches
const KS_LEAD = 0.02; // beats a keyswitch is nudged before a note onset so it registers first
const PHRASE_GAP = 1.0; // beats of rest that begins a new phrase (auto-place per phrase)
const MAP_FILENAME = "articulations.json";
const LAST_FILENAME = "lastKeyswitch.json";

// Fixed pool of per-articulation command IDs registered once at activate. Each
// slot's handler reads the *current* map at trigger time, so the map can grow,
// shrink, or be re-pitched without re-registering commands — only the visible
// context-menu items get rebuilt. 32 comfortably exceeds any realistic map.
const MAX_ARTICULATION_SLOTS = 32;

// Generic starter map. Low keyswitch octave (C-2 .. ), library-agnostic — the
// user re-pitches these to match their own instrument via the "Edit map" dialog.
const DEFAULT_MAP: Articulation[] = [
  { name: "Sustain", pitch: 0 }, // C-2
  { name: "Legato", pitch: 1 }, // C#-2
  { name: "Staccato", pitch: 2 }, // D-2
  { name: "Spiccato", pitch: 3 }, // D#-2
  { name: "Pizzicato", pitch: 4 }, // E-2
  { name: "Tremolo", pitch: 5 }, // F-2
  { name: "Trill", pitch: 6 }, // F#-2
  { name: "Marcato", pitch: 7 }, // G-2
];

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");

  // ---- Map persistence ------------------------------------------------------

  const mapPath = (): string | null => {
    const dir = context.environment.storageDirectory;
    return dir ? path.join(dir, MAP_FILENAME) : null;
  };

  const loadMap = (): Articulation[] => {
    const file = mapPath();
    if (file) {
      try {
        if (fs.existsSync(file)) {
          const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
          if (Array.isArray(parsed) && parsed.length) return parsed as Articulation[];
        }
      } catch (err) {
        console.error("[keyswitch] failed to read map, using defaults:", err);
      }
    }
    return DEFAULT_MAP;
  };

  const saveMap = (map: Articulation[]): void => {
    const file = mapPath();
    if (!file) {
      console.warn("[keyswitch] no storage directory; map changes not persisted");
      return;
    }
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(map, null, 2), "utf8");
    } catch (err) {
      console.error("[keyswitch] failed to write map:", err);
    }
  };

  // ---- Last-used articulation (for "repeat last") ---------------------------

  // Persist the whole articulation (not just an index) so "repeat" survives a
  // map re-order or a Live restart and always re-applies the same sound.
  const lastPath = (): string | null => {
    const dir = context.environment.storageDirectory;
    return dir ? path.join(dir, LAST_FILENAME) : null;
  };

  const loadLastUsed = (): Articulation | null => {
    const file = lastPath();
    if (file) {
      try {
        if (fs.existsSync(file)) {
          const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
          if (parsed && typeof parsed.name === "string" && typeof parsed.pitch === "number") {
            return parsed as Articulation;
          }
        }
      } catch (err) {
        console.error("[keyswitch] failed to read last-used keyswitch:", err);
      }
    }
    return null;
  };

  const saveLastUsed = (art: Articulation): void => {
    const file = lastPath();
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(art, null, 2), "utf8");
    } catch (err) {
      console.error("[keyswitch] failed to write last-used keyswitch:", err);
    }
  };

  let lastUsed: Articulation | null = loadLastUsed();

  // Forward declaration — assigned in the dynamic-menu section once the
  // context-menu helpers exist; `applyAndRemember` (below) calls it at runtime.
  let refreshRepeatLabel: () => Promise<void> = () => Promise.resolve();

  // ---- Keyswitch insertion (shared core) ------------------------------------

  /**
   * Insert `art` into `clip` at clip-relative beat `relStart`, deduping.
   * `opts.relEnd` paints the keyswitch over an explicit range (start→end), used by
   * time-selection "apply for a duration"; otherwise `art.hold` latches to clip end,
   * and the default is a short trigger.
   */
  const insertKeyswitch = (
    clip: MidiClip<V>,
    art: Articulation,
    relStart: number,
    opts?: { relEnd?: number },
  ): void => {
    const start = Math.max(0, relStart);
    let duration: number;
    if (opts?.relEnd !== undefined) {
      duration = Math.max(TRIGGER_DURATION, opts.relEnd - start);
    } else if (art.hold) {
      duration = Math.max(TRIGGER_DURATION, clip.duration - start);
    } else {
      duration = TRIGGER_DURATION;
    }

    const ks: NoteDescription = {
      pitch: art.pitch,
      startTime: start,
      duration,
      velocity: art.velocity ?? 100,
    };

    // Drop any existing note at the same pitch+start so we replace, not stack.
    const kept = clip.notes.filter(
      (n) => !(n.pitch === art.pitch && Math.abs(n.startTime - start) < 1e-6),
    );
    clip.notes = [...kept, ks];
    const span = opts?.relEnd !== undefined ? ` over ${duration.toFixed(2)} beats` : "";
    console.log(
      `[keyswitch] inserted "${art.name}" (pitch ${art.pitch}) at beat ${start}${span} in "${clip.name}"`,
    );
  };

  /** Insert and record as the last-used keyswitch (drives "repeat last"). */
  const applyAndRemember = (
    clip: MidiClip<V>,
    art: Articulation,
    relStart: number,
    opts?: { relEnd?: number },
  ): void => {
    insertKeyswitch(clip, art, relStart, opts);
    lastUsed = art;
    saveLastUsed(art);
    void refreshRepeatLabel(); // hoisted; reflects the new name in the menu
  };

  // ---- Bulk placement (auto-place per onset / per phrase) -------------------

  /** Map pitches = the keyswitch range; everything else in a clip is "melodic". */
  const keyswitchPitches = (): Set<number> => new Set(loadMap().map((a) => a.pitch));

  /** De-duplicated, sorted onset beats of melodic (non-keyswitch) notes. */
  const melodicOnsets = (clip: MidiClip<V>): number[] => {
    const ks = keyswitchPitches();
    const onsets = new Set<number>();
    for (const n of clip.notes) if (!ks.has(n.pitch)) onsets.add(n.startTime);
    return [...onsets].sort((a, b) => a - b);
  };

  /** Phrase-start beats: a melodic note beginning >= PHRASE_GAP after the prior note's end. */
  const phraseStarts = (clip: MidiClip<V>): number[] => {
    const ks = keyswitchPitches();
    const mel = clip.notes
      .filter((n) => !ks.has(n.pitch))
      .sort((a, b) => a.startTime - b.startTime);
    const starts: number[] = [];
    let prevEnd = Number.NEGATIVE_INFINITY;
    for (const n of mel) {
      if (n.startTime - prevEnd >= PHRASE_GAP) starts.push(n.startTime);
      prevEnd = Math.max(prevEnd, n.startTime + n.duration);
    }
    return starts;
  };

  /**
   * Place `art` at every beat in `relStarts` in a single `notes` write (cheap, atomic).
   * `hold` latches each keyswitch to the next placement (clip end for the last); otherwise
   * a short trigger. Replaces existing notes at the same pitch+start. Returns the count placed.
   */
  const placeKeyswitches = (
    clip: MidiClip<V>,
    art: Articulation,
    relStarts: number[],
    hold: boolean,
  ): number => {
    const sorted = relStarts.map((s) => Math.max(0, s)).sort((a, b) => a - b);
    const uniq: number[] = [];
    for (const p of sorted) {
      const last = uniq[uniq.length - 1];
      if (last === undefined || Math.abs(p - last) > 1e-6) uniq.push(p);
    }
    if (!uniq.length) return 0;
    const kept = clip.notes.filter(
      (n) => !(n.pitch === art.pitch && uniq.some((u) => Math.abs(n.startTime - u) < 1e-6)),
    );
    const additions: NoteDescription[] = uniq.map((start, idx) => {
      let duration = TRIGGER_DURATION;
      if (hold) {
        const next = uniq[idx + 1];
        duration =
          next !== undefined
            ? Math.max(TRIGGER_DURATION, next - start)
            : Math.max(TRIGGER_DURATION, clip.duration - start);
      }
      return { pitch: art.pitch, startTime: start, duration, velocity: art.velocity ?? 100 };
    });
    clip.notes = [...kept, ...additions];
    return additions.length;
  };

  // ---- Palette modal --------------------------------------------------------

  type PaletteResult =
    | { type: "apply"; articulation: Articulation }
    | { type: "save"; map: Articulation[] }
    | { type: "cancel" };

  /** Show the palette. `mode` "apply" lets the user pick + apply; "edit" only edits the map. */
  const openPalette = async (mode: "apply" | "edit"): Promise<PaletteResult> => {
    const map = loadMap();
    const html = paletteHtml
      .replace("__MODE__", mode)
      .replace("[/*__MAP__*/]", () => JSON.stringify(map));
    const raw = await context.ui.showModalDialog(
      `data:text/html,${encodeURIComponent(html)}`,
      420,
      460,
    );
    try {
      const parsed = JSON.parse(raw) as PaletteResult;
      if (parsed.type === "save") saveMap(parsed.map);
      return parsed;
    } catch {
      return { type: "cancel" };
    }
  };

  // ---- Clip resolution for arrangement selections ---------------------------

  /** All MIDI clips reachable from a selected-lane handle (Track or TakeLane). */
  const clipsFromLane = (handle: Handle): MidiClip<V>[] => {
    const out: MidiClip<V>[] = [];
    try {
      const lane = context.getObjectFromHandle(handle, DataModelObject);
      const clips = lane instanceof TakeLane ? lane.clips : lane instanceof Track ? lane.arrangementClips : [];
      for (const c of clips) if (c instanceof MidiClip) out.push(c);
    } catch (err) {
      console.error("[keyswitch] could not resolve selected lane:", err);
    }
    return out;
  };

  /** Find the MIDI clip on the selection's lanes that spans `beat`. */
  const clipAtBeat = (selection: ArrangementSelection, beat: number): MidiClip<V> | null => {
    for (const laneHandle of selection.selected_lanes) {
      for (const clip of clipsFromLane(laneHandle)) {
        if (beat >= clip.startTime && beat < clip.endTime) return clip;
      }
    }
    return null;
  };

  /**
   * Resolve a time-selection to its target clip and clip-relative range, clamped to the
   * clip end so a selection running past the clip doesn't over-extend the keyswitch.
   * Returns null when no MIDI clip sits under the selection start.
   */
  const selectionRange = (
    selection: ArrangementSelection,
  ): { clip: MidiClip<V>; relStart: number; relEnd: number } | null => {
    const beat = selection.time_selection_start;
    const clip = clipAtBeat(selection, beat);
    if (!clip) return null;
    const relStart = beat - clip.startTime;
    const relEnd = Math.min(selection.time_selection_end, clip.endTime) - clip.startTime;
    return { clip, relStart, relEnd };
  };

  // ---- Dynamic context-menu items (per-articulation + repeat-last) ----------
  //
  // These items depend on runtime state (the map, the last-used articulation),
  // so unlike the static items below they're (re)built via the unregister
  // handles that `registerContextMenuAction` returns. All rebuilds run through
  // `serialize` so a map edit and a repeat-label refresh can't interleave.

  let menuQueue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = menuQueue.then(fn, fn);
    menuQueue = next.catch(() => {});
    return next;
  };

  type Unregister = () => Promise<void>;
  let articulationItems: Unregister[] = [];
  let repeatItems: Unregister[] = [];

  const dropItems = async (items: Unregister[]): Promise<void> => {
    for (const off of items) {
      try {
        await off();
      } catch (err) {
        console.error("[keyswitch] failed to unregister a menu item:", err);
      }
    }
  };

  // One item per map entry on each scope → applies instantly, no modal.
  //  • On a MIDI clip  → inserts at clip start.
  //  • On a time-selection → paints the articulation over the selected range.
  // Both point at the same `keyswitch.apply.<i>` command, which duck-types its arg.
  const registerArticulationItems = async (): Promise<void> => {
    await dropItems(articulationItems);
    articulationItems = [];
    const map = loadMap();
    for (let i = 0; i < map.length && i < MAX_ARTICULATION_SLOTS; i++) {
      const art = map[i];
      if (!art) continue;
      articulationItems.push(
        await context.ui.registerContextMenuAction(
          "MidiClip",
          `Keyswitch: ${art.name}`,
          `keyswitch.apply.${i}`,
        ),
      );
      articulationItems.push(
        await context.ui.registerContextMenuAction(
          "MidiTrack.ArrangementSelection",
          `Keyswitch over selection: ${art.name}`,
          `keyswitch.apply.${i}`,
        ),
      );
    }
  };

  // "Repeat keyswitch: <name>" on both a clip and an arrangement selection.
  // Rebuilt whenever `lastUsed` changes so the label tracks the current sound.
  const registerRepeatItems = async (): Promise<void> => {
    await dropItems(repeatItems);
    repeatItems = [];
    const label = lastUsed ? `Repeat keyswitch: ${lastUsed.name}` : "Repeat last keyswitch";
    const selLabel = lastUsed
      ? `Repeat keyswitch over selection: ${lastUsed.name}`
      : "Repeat last keyswitch over selection";
    repeatItems.push(
      await context.ui.registerContextMenuAction("MidiClip", label, "keyswitch.repeatLast"),
    );
    repeatItems.push(
      await context.ui.registerContextMenuAction(
        "MidiTrack.ArrangementSelection",
        selLabel,
        "keyswitch.repeatLast",
      ),
    );
  };

  // Full rebuild (map changed): re-list articulations, then re-add repeat below.
  const rebuildMenus = (): Promise<void> =>
    serialize(async () => {
      await registerArticulationItems();
      await registerRepeatItems();
    });

  // Cheap refresh (only last-used changed): just the two repeat items.
  // Hoisted above via `var`-less const — called from applyAndRemember at runtime.
  refreshRepeatLabel = (): Promise<void> => serialize(registerRepeatItems);

  // ---- Commands -------------------------------------------------------------

  // Per-articulation quick-apply: one command per slot, registered once. Reads
  // the live map at trigger time and inserts at clip start with no modal.
  for (let i = 0; i < MAX_ARTICULATION_SLOTS; i++) {
    context.commands.registerCommand(`keyswitch.apply.${i}`, (args: unknown) => {
      const art = loadMap()[i];
      if (!art) {
        console.warn(`[keyswitch] no articulation in slot ${i}; nothing inserted`);
        return;
      }
      const maybeSelection = args as Partial<ArrangementSelection>;
      if (maybeSelection && typeof maybeSelection.time_selection_start === "number") {
        // Time-selection → paint the articulation over the selected range.
        const range = selectionRange(args as ArrangementSelection);
        if (!range) {
          console.warn("[keyswitch] no MIDI clip under the time-selection; nothing inserted");
          return;
        }
        applyAndRemember(range.clip, art, range.relStart, { relEnd: range.relEnd });
      } else {
        const clip = context.getObjectFromHandle(args as Handle, MidiClip);
        applyAndRemember(clip, art, 0);
      }
    });
  }

  // Repeat the last-used articulation. Shared across the MidiClip and
  // ArrangementSelection scopes — duck-type the arg to tell them apart.
  context.commands.registerCommand("keyswitch.repeatLast", (args: unknown) => {
    if (!lastUsed) {
      console.warn("[keyswitch] no previous keyswitch to repeat yet");
      return;
    }
    const maybeSelection = args as Partial<ArrangementSelection>;
    if (maybeSelection && typeof maybeSelection.time_selection_start === "number") {
      const range = selectionRange(args as ArrangementSelection);
      if (!range) {
        console.warn("[keyswitch] repeat: no MIDI clip under the time-selection; nothing inserted");
        return;
      }
      applyAndRemember(range.clip, lastUsed, range.relStart, { relEnd: range.relEnd });
    } else {
      const clip = context.getObjectFromHandle(args as Handle, MidiClip);
      applyAndRemember(clip, lastUsed, 0);
    }
  });

  // Phase A/B: apply to a whole MIDI clip (keyswitch at clip start) via palette.
  context.commands.registerCommand("keyswitch.applyToClip", (args: unknown) =>
    void (async () => {
      const clip = context.getObjectFromHandle(args as Handle, MidiClip);
      const result = await openPalette("apply");
      if (result.type === "apply") applyAndRemember(clip, result.articulation, 0);
      else if (result.type === "save") void rebuildMenus();
    })(),
  );

  // Phase C: paint over an arrangement time-selection (start→end) via palette.
  context.commands.registerCommand("keyswitch.applyToSelection", (args: unknown) =>
    void (async () => {
      const range = selectionRange(args as ArrangementSelection);
      if (!range) {
        console.warn(
          "[keyswitch] no MIDI clip under the time-selection on the selected lane(s); nothing inserted",
        );
        return;
      }
      const result = await openPalette("apply");
      if (result.type === "apply") {
        applyAndRemember(range.clip, result.articulation, range.relStart, { relEnd: range.relEnd });
      } else if (result.type === "save") void rebuildMenus();
    })(),
  );

  // Auto-place: pick an articulation once, then drop it before every melodic note onset.
  context.commands.registerCommand("keyswitch.autoPlaceOnset", (args: unknown) =>
    void (async () => {
      const clip = context.getObjectFromHandle(args as Handle, MidiClip);
      const result = await openPalette("apply");
      if (result.type === "save") return void rebuildMenus();
      if (result.type !== "apply") return;
      const art = result.articulation;
      const starts = melodicOnsets(clip).map((o) => Math.max(0, o - KS_LEAD));
      const count = placeKeyswitches(clip, art, starts, art.hold ?? false);
      lastUsed = art;
      saveLastUsed(art);
      void refreshRepeatLabel();
      console.log(
        `[keyswitch] auto-placed "${art.name}" at ${count} note onset(s) in "${clip.name}"`,
      );
    })(),
  );

  // Auto-place: pick an articulation once, then drop it at each phrase start (rest-gap detection).
  context.commands.registerCommand("keyswitch.autoPlacePhrase", (args: unknown) =>
    void (async () => {
      const clip = context.getObjectFromHandle(args as Handle, MidiClip);
      const result = await openPalette("apply");
      if (result.type === "save") return void rebuildMenus();
      if (result.type !== "apply") return;
      const art = result.articulation;
      const starts = phraseStarts(clip).map((o) => Math.max(0, o - KS_LEAD));
      const count = placeKeyswitches(clip, art, starts, art.hold ?? false);
      lastUsed = art;
      saveLastUsed(art);
      void refreshRepeatLabel();
      console.log(
        `[keyswitch] auto-placed "${art.name}" at ${count} phrase start(s) in "${clip.name}"`,
      );
    })(),
  );

  // Phase D: edit the articulation map; rebuild the per-articulation items after.
  context.commands.registerCommand("keyswitch.editMap", () =>
    void (async () => {
      const result = await openPalette("edit");
      if (result.type === "save") void rebuildMenus();
    })(),
  );

  // ---- Context-menu registration -------------------------------------------

  // Static items (modal-based — kept as the full-control fallback, incl. "hold").
  context.ui.registerContextMenuAction("MidiClip", "Apply keyswitch…", "keyswitch.applyToClip");
  context.ui.registerContextMenuAction(
    "MidiTrack.ArrangementSelection",
    "Apply keyswitch at selection…",
    "keyswitch.applyToSelection",
  );
  context.ui.registerContextMenuAction(
    "MidiClip",
    "Auto-place keyswitches (per note)…",
    "keyswitch.autoPlaceOnset",
  );
  context.ui.registerContextMenuAction(
    "MidiClip",
    "Auto-place keyswitches (per phrase)…",
    "keyswitch.autoPlacePhrase",
  );
  context.ui.registerContextMenuAction("MidiClip", "Edit keyswitch map…", "keyswitch.editMap");
  context.ui.registerContextMenuAction("MidiTrack", "Edit keyswitch map…", "keyswitch.editMap");

  // Dynamic items (per-articulation quick-apply + repeat-last).
  void rebuildMenus();
}
