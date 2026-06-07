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

  // ---- Commands -------------------------------------------------------------

  // Phase A/B: apply to a whole MIDI clip (keyswitch at clip start).
  context.commands.registerCommand("keyswitch.applyToClip", (args: unknown) =>
    void (async () => {
      const clip = context.getObjectFromHandle(args as Handle, MidiClip);
      const result = await openPalette("apply");
      if (result.type === "apply") insertKeyswitch(clip, result.articulation, 0);
    })(),
  );

  // Phase C: apply at an arrangement time-selection start.
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
        insertKeyswitch(clip, result.articulation, beat - clip.startTime);
      }
    })(),
  );

  // Phase D: edit the articulation map.
  context.commands.registerCommand("keyswitch.editMap", () =>
    void (async () => {
      await openPalette("edit");
    })(),
  );

  // ---- Context-menu registration -------------------------------------------

  context.ui.registerContextMenuAction("MidiClip", "Apply keyswitch…", "keyswitch.applyToClip");
  context.ui.registerContextMenuAction(
    "MidiTrack.ArrangementSelection",
    "Apply keyswitch at selection…",
    "keyswitch.applyToSelection",
  );
  context.ui.registerContextMenuAction("MidiClip", "Edit keyswitch map…", "keyswitch.editMap");
  context.ui.registerContextMenuAction("MidiTrack", "Edit keyswitch map…", "keyswitch.editMap");
}
