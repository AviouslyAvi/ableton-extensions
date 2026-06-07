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

  /** Insert `art` into `clip` at clip-relative beat `relStart`, deduping. */
  const insertKeyswitch = (clip: MidiClip<V>, art: Articulation, relStart: number): void => {
    const start = Math.max(0, relStart);
    const duration = art.hold
      ? Math.max(TRIGGER_DURATION, clip.duration - start)
      : TRIGGER_DURATION;

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
    console.log(
      `[keyswitch] inserted "${art.name}" (pitch ${art.pitch}) at beat ${start} in "${clip.name}"`,
    );
  };

  /** Insert and record as the last-used keyswitch (drives "repeat last"). */
  const applyAndRemember = (clip: MidiClip<V>, art: Articulation, relStart: number): void => {
    insertKeyswitch(clip, art, relStart);
    lastUsed = art;
    saveLastUsed(art);
    void refreshRepeatLabel(); // hoisted; reflects the new name in the menu
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

  // One "Keyswitch: <name>" item per map entry → applies instantly, no modal.
  const registerArticulationItems = async (): Promise<void> => {
    await dropItems(articulationItems);
    articulationItems = [];
    const map = loadMap();
    for (let i = 0; i < map.length && i < MAX_ARTICULATION_SLOTS; i++) {
      const art = map[i];
      if (!art) continue;
      const off = await context.ui.registerContextMenuAction(
        "MidiClip",
        `Keyswitch: ${art.name}`,
        `keyswitch.apply.${i}`,
      );
      articulationItems.push(off);
    }
  };

  // "Repeat keyswitch: <name>" on both a clip and an arrangement selection.
  // Rebuilt whenever `lastUsed` changes so the label tracks the current sound.
  const registerRepeatItems = async (): Promise<void> => {
    await dropItems(repeatItems);
    repeatItems = [];
    const label = lastUsed ? `Repeat keyswitch: ${lastUsed.name}` : "Repeat last keyswitch";
    repeatItems.push(
      await context.ui.registerContextMenuAction("MidiClip", label, "keyswitch.repeatLast"),
    );
    repeatItems.push(
      await context.ui.registerContextMenuAction(
        "MidiTrack.ArrangementSelection",
        label,
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
      const clip = context.getObjectFromHandle(args as Handle, MidiClip);
      applyAndRemember(clip, art, 0);
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
      const selection = args as ArrangementSelection;
      const beat = selection.time_selection_start;
      const clip = clipAtBeat(selection, beat);
      if (!clip) {
        console.warn(`[keyswitch] repeat: no MIDI clip under beat ${beat}; nothing inserted`);
        return;
      }
      applyAndRemember(clip, lastUsed, beat - clip.startTime);
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

  // Phase C: apply at an arrangement time-selection start via palette.
  context.commands.registerCommand("keyswitch.applyToSelection", (args: unknown) =>
    void (async () => {
      const selection = args as ArrangementSelection;
      const beat = selection.time_selection_start;
      const clip = clipAtBeat(selection, beat);
      if (!clip) {
        console.warn(
          `[keyswitch] no MIDI clip under beat ${beat} on the selected lane(s); nothing inserted`,
        );
        return;
      }
      const result = await openPalette("apply");
      if (result.type === "apply") {
        applyAndRemember(clip, result.articulation, beat - clip.startTime);
      } else if (result.type === "save") void rebuildMenus();
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
  context.ui.registerContextMenuAction("MidiClip", "Edit keyswitch map…", "keyswitch.editMap");
  context.ui.registerContextMenuAction("MidiTrack", "Edit keyswitch map…", "keyswitch.editMap");

  // Dynamic items (per-articulation quick-apply + repeat-last).
  void rebuildMenus();
}
