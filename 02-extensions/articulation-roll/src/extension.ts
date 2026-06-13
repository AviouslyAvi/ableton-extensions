import {
  initialize,
  MidiClip,
  type ActivationContext,
  type Handle,
  type NoteDescription,
} from "@ableton-extensions/sdk";
import * as fs from "node:fs";

import { startPreviewBridge } from "./preview.js";
import * as path from "node:path";

// esbuild inlines this as a string (see build.ts `.html` text loader).
import rollHtml from "./roll.html";

type V = "1.0.0";

/**
 * One articulation = one keyswitch note. `pitch` is the MIDI note number Live
 * sends to trigger the articulation (Live convention: C-2 = 0, C3 = 60).
 * `hold` true => the keyswitch is held for its whole region (latched);
 * false => a short trigger note (default 0.25 beat) at the region start.
 *
 * This mirrors the `keyswitch` extension's map shape so the two stay compatible.
 */
type Articulation = {
  name: string;
  pitch: number;
  velocity?: number;
  hold?: boolean;
};

/**
 * A melodic note as it travels to/from the webview. `id` ties back to an
 * original clip note (fidelity overlay); `art` is the note's articulation name
 * (null = none) — the source of truth the keyswitch notes are synthesized from.
 */
type RollNote = NoteDescription & { id?: number; art?: string | null };

const TRIGGER_DURATION = 0.25; // beats, for non-held keyswitches
const MIN_DURATION = 1e-4; // guard against zero/negative note lengths
const MAP_FILENAME = "articulations.json";
const DEFAULT_GRID = 0.25; // 1/16 note: default snap + seed "remembered length"

// Generic starter map (same defaults as the keyswitch extension). The user
// re-pitches these to match their instrument via the in-roll "Edit map" dialog.
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

  // ---- Map persistence (own storageDirectory; seeded from DEFAULT_MAP) -------
  // NOTE: each extension has its own storageDirectory, so this map is separate
  // from the keyswitch extension's copy even though the shape is identical.

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
        console.error("[articulation-roll] failed to read map, using defaults:", err);
      }
    }
    return DEFAULT_MAP;
  };

  const saveMap = (map: Articulation[]): void => {
    const file = mapPath();
    if (!file) {
      console.warn("[articulation-roll] no storage directory; map changes not persisted");
      return;
    }
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(map, null, 2), "utf8");
    } catch (err) {
      console.error("[articulation-roll] failed to write map:", err);
    }
  };

  // ---- Per-note articulation <-> keyswitch-note conversion ------------------

  /**
   * Derive each melodic note's articulation from the keyswitch notes already in
   * the clip: a note's art = the articulation of the most recent keyswitch note
   * at-or-before its startTime; no preceding keyswitch = null.
   */
  const artForMelodicNotes = (
    allClipNotes: readonly NoteDescription[],
    melodicOriginals: readonly NoteDescription[],
    map: Articulation[],
  ): (string | null)[] => {
    const byPitch = new Map<number, string>();
    for (const a of map) byPitch.set(a.pitch, a.name);

    const ks = allClipNotes
      .filter((n) => byPitch.has(n.pitch))
      .map((n) => ({ start: n.startTime, name: byPitch.get(n.pitch)! }))
      .sort((a, b) => a.start - b.start);

    return melodicOriginals.map((n) => {
      let art: string | null = null;
      for (const k of ks) {
        if (k.start <= n.startTime + 1e-6) art = k.name;
        else break;
      }
      return art;
    });
  };

  /**
   * Synthesize keyswitch notes from the notes' per-note articulations: sort by
   * (startTime, pitch asc) — the deterministic answer for simultaneous notes
   * with different articulations — group consecutive runs of equal art (null
   * breaks a run and emits nothing), and emit one keyswitch at each run start.
   * Held articulations span to the run's furthest note end; others get a short
   * trigger. Deduped by pitch+start. MUST mirror the webview's laneSpans().
   */
  const keyswitchesFromNotes = (
    rollNotes: readonly RollNote[],
    map: Articulation[],
    clipDuration: number,
  ): NoteDescription[] => {
    const byName = new Map<string, Articulation>();
    for (const a of map) byName.set(a.name, a);

    const sorted = [...rollNotes].sort(
      (a, b) => a.startTime - b.startTime || a.pitch - b.pitch,
    );

    type Run = { art: Articulation; start: number; lastEnd: number };
    const runs: Run[] = [];
    let run: Run | null = null;
    for (const n of sorted) {
      const art = n.art ? byName.get(n.art) : undefined;
      if (!art) {
        run = null; // unarticulated note breaks the run, emits nothing
        continue;
      }
      if (run && run.art.name === art.name) {
        run.lastEnd = Math.max(run.lastEnd, n.startTime + n.duration);
      } else {
        run = { art, start: n.startTime, lastEnd: n.startTime + n.duration };
        runs.push(run);
      }
    }

    const seen = new Set<string>();
    const out: NoteDescription[] = [];
    for (const r of runs) {
      const start = Math.max(0, Math.min(r.start, clipDuration));
      const span = Math.max(TRIGGER_DURATION, r.lastEnd - start);
      const duration = r.art.hold ? span : TRIGGER_DURATION;
      const key = `${r.art.pitch}@${start.toFixed(6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ pitch: r.art.pitch, startTime: start, duration, velocity: r.art.velocity ?? 100 });
    }
    return out;
  };

  // ---- Note sanitizing (preserve unknown fields via id overlay) -------------

  const clampPitch = (p: number): number => Math.max(0, Math.min(127, Math.round(p)));

  /**
   * Turn one webview note back into a NoteDescription. When the note carries an
   * `id` it maps to an original clip note: we spread that original first so any
   * field we don't explicitly edit (probability, velocityDeviation,
   * releaseVelocity, muted, …) is preserved byte-for-byte, then overlay the four
   * fields the roll can edit. New notes (no id) get just the core four.
   */
  const toNoteDescription = (
    n: RollNote,
    originals: readonly NoteDescription[],
  ): NoteDescription => {
    const original = typeof n.id === "number" ? originals[n.id] : undefined;
    const velocity = typeof n.velocity === "number" ? n.velocity : original?.velocity ?? 100;
    // Spread the original first so any field the roll doesn't edit (probability,
    // velocityDeviation, releaseVelocity, muted, …) is preserved untouched, then
    // overlay the four fields the roll can change. Cast keeps the passthrough
    // fields without fighting exactOptionalPropertyTypes on a Partial spread.
    const merged = {
      ...(original ?? {}),
      pitch: clampPitch(n.pitch),
      startTime: Math.max(0, n.startTime),
      duration: Math.max(MIN_DURATION, n.duration),
      velocity,
    };
    return merged as NoteDescription;
  };

  // ---- Payload (host -> webview) --------------------------------------------

  type RollPayload = {
    schema: string;
    clip: { name: string; startTime: number; duration: number };
    grid: { snap: number; default: number };
    tempo: number;
    notes: RollNote[];
    articulations: Articulation[];
  };

  // Song tempo, so the roll's in-editor playback runs at the right speed.
  // Live's transport can't be driven from the modal, so the roll sequences the
  // clip's own notes out the preview bridge — it needs beats->seconds.
  const songTempo = (): number => {
    try {
      const t = context.application.song.tempo;
      return typeof t === "number" && t > 0 ? t : 120;
    } catch {
      return 120;
    }
  };

  const buildPayload = (clip: MidiClip<V>, melodicOriginals: NoteDescription[]): RollPayload => {
    const map = loadMap();
    const arts = artForMelodicNotes(clip.notes, melodicOriginals, map);
    return {
      schema: "1.1.0",
      clip: { name: clip.name, startTime: clip.startTime, duration: clip.duration },
      grid: { snap: DEFAULT_GRID, default: DEFAULT_GRID },
      tempo: songTempo(),
      // id = index into melodicOriginals, used to preserve untouched fields on
      // apply; art = derived from the clip's existing keyswitch notes.
      notes: melodicOriginals.map((n, i) => ({ ...n, id: i, art: arts[i] ?? null })),
      articulations: map,
    };
  };

  // ---- Result (webview -> host) ---------------------------------------------

  type RollResult =
    | { type: "apply"; notes?: RollNote[] }
    | { type: "save-map"; map: Articulation[] }
    | { type: "cancel" };

  /** Open the roll for a clip; loops so a map edit re-opens with fresh data. */
  const openRoll = async (clip: MidiClip<V>): Promise<void> => {
    // Audible preview for the modal session (webview -> :7475 -> UDP :7474 ->
    // ArtRollPreview.amxd). Inert if the device/ports are absent.
    const preview = startPreviewBridge();
    try {
      await openRollLoop(clip);
    } finally {
      preview.close();
    }
  };

  const openRollLoop = async (clip: MidiClip<V>): Promise<void> => {
    // eslint-disable-next-line no-constant-condition
    for (;;) {
      const map = loadMap();
      const ksPitches = new Set(map.map((a) => a.pitch));
      const melodicOriginals = clip.notes.filter((n) => !ksPitches.has(n.pitch));

      const payload = buildPayload(clip, melodicOriginals);
      const html = rollHtml.replace("[/*__DATA__*/]", () => JSON.stringify(payload));

      let raw: string;
      try {
        raw = await context.ui.showModalDialog(
          `data:text/html,${encodeURIComponent(html)}`,
          1100,
          720,
        );
      } catch (err) {
        console.error("[articulation-roll] modal failed to open:", err);
        return;
      }

      let result: RollResult;
      try {
        result = JSON.parse(raw) as RollResult;
      } catch {
        result = { type: "cancel" };
      }

      if (result.type === "save-map") {
        saveMap(result.map);
        continue; // re-open with the updated map / re-derived articulations
      }
      if (result.type !== "apply") return; // cancel

      applyResult(clip, melodicOriginals, result.notes ?? []);
      return;
    }
  };

  /** Merge edited melodic notes + synthesized keyswitch notes; write in one undo. */
  const applyResult = (
    clip: MidiClip<V>,
    melodicOriginals: NoteDescription[],
    rollNotes: RollNote[],
  ): void => {
    const map = loadMap();
    const ksPitches = new Set(map.map((a) => a.pitch));

    // Melodic notes from the roll, with reserved keyswitch pitches stripped
    // defensively (the roll shouldn't emit them, but round-trip drift is cheap
    // to guard against — those pitches belong to the articulation lane).
    // toNoteDescription only copies the four editable fields, so `art` never
    // leaks into the written melodic notes.
    const melodic = rollNotes
      .map((n) => toNoteDescription(n, melodicOriginals))
      .filter((n) => !ksPitches.has(n.pitch));

    const ksNotes = keyswitchesFromNotes(rollNotes, map, clip.duration);
    const merged = [...melodic, ...ksNotes];

    try {
      context.withinTransaction(() => {
        clip.notes = merged;
      });
      console.log(
        `[articulation-roll] wrote ${melodic.length} melodic + ${ksNotes.length} keyswitch notes to "${clip.name}"`,
      );
    } catch (err) {
      console.error("[articulation-roll] failed to write notes:", err);
    }
  };

  // ---- Commands + context menu ----------------------------------------------

  context.commands.registerCommand("articulationRoll.open", (args: unknown) =>
    void (async () => {
      const clip = context.getObjectFromHandle(args as Handle, MidiClip);
      await openRoll(clip);
    })(),
  );

  context.ui.registerContextMenuAction(
    "MidiClip",
    "Edit (Articulation Roll)…",
    "articulationRoll.open",
  );
}
