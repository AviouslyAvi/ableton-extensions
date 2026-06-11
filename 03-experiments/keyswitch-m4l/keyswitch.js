// keyswitch.js — logic for the "Keyswitch (per-note)" Max for Live device.
//
// Runs inside a `v8` object (Max 9 / Live 12.2+). The .amxd is a thin shell of
// UI buttons that send named messages into this object; ALL behaviour lives here
// so it stays version-controlled and (for the pure functions) unit-testable.
//
// Core gesture the SDK could never do: read the notes the user SELECTED in the
// MIDI editor (via the Live API `get_selected_notes_extended`) and write a
// keyswitch note for each, spanning that note's duration.
//
// Live API surface used:
//   live_set view detail_clip            -> the clip shown in the Detail editor
//   clip get_selected_notes_extended     -> {notes:[{pitch,start_time,duration,velocity,note_id}]}
//   clip get_notes_extended f p f s      -> all notes in a range (auto-place)
//   clip add_new_notes {notes:[...]}     -> insert
//   clip remove_notes_extended p 1 f s   -> delete at a pitch over a range (dedup)

autowatch = 1;
inlets = 1;
outlets = 1;

// ---- Constants ------------------------------------------------------------

var TRIGGER_DURATION = 0.25; // beats, for short (non-spanning) keyswitches
var KS_LEAD = 0.02; // beats a KS is nudged before an onset so it registers first
var PHRASE_GAP = 1.0; // beats of rest that begins a new phrase (auto-place per phrase)
var EPS = 1e-4;

// Generic low-octave starter map (Live convention: C-2 = 0). Re-pitch to your
// library. Mirrors the SDK device's default so behaviour matches.
var DEFAULT_MAP = [
  { name: "Sustain", pitch: 0 }, // C-2
  { name: "Legato", pitch: 1 }, // C#-2
  { name: "Staccato", pitch: 2 }, // D-2
  { name: "Spiccato", pitch: 3 }, // D#-2
  { name: "Pizzicato", pitch: 4 }, // E-2
  { name: "Tremolo", pitch: 5 }, // F-2
  { name: "Trill", pitch: 6 }, // F#-2
  { name: "Marcato", pitch: 7 }, // G-2
];

// Runtime state (disk persistence deferred to a later stage — see README).
var MAP = DEFAULT_MAP.slice();
var lastUsed = null;

function currentMap() {
  return MAP;
}

// ---- Pure logic (no Max/Live globals — unit-tested under Node) -------------

// Collapse notes to one entry per distinct onset; duration = the longest note
// at that onset (so a chord yields a single keyswitch spanning its longest note).
function collapseByOnset(notes) {
  var byOnset = {};
  for (var i = 0; i < notes.length; i++) {
    var n = notes[i];
    var key = n.start_time.toFixed(6);
    if (!byOnset[key] || n.duration > byOnset[key].duration) {
      byOnset[key] = { start_time: n.start_time, duration: n.duration };
    }
  }
  var out = [];
  for (var k in byOnset) if (byOnset.hasOwnProperty(k)) out.push(byOnset[k]);
  out.sort(function (a, b) {
    return a.start_time - b.start_time;
  });
  return out;
}

// Given the selected notes + chosen articulation, return the keyswitch notes to
// write. Modes:
//   "perNote" (default) — one KS per onset, spanning that note's duration
//   "selectionSpan"     — a single KS covering the whole selection
//   "trigger"           — a short KS at each onset
// opts.hold latches each KS to the next onset (clip end for the last, needs
// opts.clipLength); opts.lead nudges each KS earlier by KS_LEAD.
function computeKeyswitchNotes(selectedNotes, art, opts) {
  opts = opts || {};
  var mode = opts.mode || "perNote";
  var lead = opts.lead ? KS_LEAD : 0;
  var vel = art.velocity != null ? art.velocity : 100;
  if (!selectedNotes || !selectedNotes.length) return [];

  if (mode === "selectionSpan") {
    var minStart = Infinity;
    var maxEnd = -Infinity;
    for (var i = 0; i < selectedNotes.length; i++) {
      var n = selectedNotes[i];
      if (n.start_time < minStart) minStart = n.start_time;
      var e = n.start_time + n.duration;
      if (e > maxEnd) maxEnd = e;
    }
    var s = Math.max(0, minStart - lead);
    return [
      { pitch: art.pitch, start_time: s, duration: Math.max(TRIGGER_DURATION, maxEnd - s), velocity: vel },
    ];
  }

  var onsets = collapseByOnset(selectedNotes);
  var ks = [];
  for (var j = 0; j < onsets.length; j++) {
    var o = onsets[j];
    var start = Math.max(0, o.start_time - lead);
    var dur;
    if (mode === "trigger") dur = TRIGGER_DURATION;
    else dur = o.duration + lead; // perNote: span the note's duration
    if (opts.hold) {
      var next = onsets[j + 1];
      if (next) dur = next.start_time - start;
      else if (opts.clipLength != null) dur = opts.clipLength - start;
    }
    ks.push({ pitch: art.pitch, start_time: start, duration: Math.max(TRIGGER_DURATION, dur), velocity: vel });
  }
  return ks;
}

// Distinct onset beats of melodic (non-keyswitch) notes, sorted.
function melodicOnsets(notes, ksPitches) {
  var ex = {};
  (ksPitches || []).forEach(function (p) {
    ex[p] = true;
  });
  var set = {};
  for (var i = 0; i < notes.length; i++) {
    var n = notes[i];
    if (!ex[n.pitch]) set[n.start_time.toFixed(6)] = n.start_time;
  }
  var out = [];
  for (var k in set) if (set.hasOwnProperty(k)) out.push(set[k]);
  out.sort(function (a, b) {
    return a - b;
  });
  return out;
}

// Phrase-start beats: a melodic note that begins >= PHRASE_GAP after the prior
// note's end (the first melodic note is always a phrase start).
function phraseStarts(notes, ksPitches) {
  var ex = {};
  (ksPitches || []).forEach(function (p) {
    ex[p] = true;
  });
  var mel = notes
    .filter(function (n) {
      return !ex[n.pitch];
    })
    .slice()
    .sort(function (a, b) {
      return a.start_time - b.start_time;
    });
  var starts = [];
  var prevEnd = -Infinity;
  for (var i = 0; i < mel.length; i++) {
    var n = mel[i];
    if (n.start_time - prevEnd >= PHRASE_GAP) starts.push(n.start_time);
    var e = n.start_time + n.duration;
    if (e > prevEnd) prevEnd = e;
  }
  return starts;
}

// ---- Live API helpers (Max-only) ------------------------------------------

function detailClip() {
  var clip = new LiveAPI("live_set view detail_clip");
  if (!clip || clip.id == 0) return null;
  return clip;
}

function getNum(api, prop) {
  var v = api.get(prop);
  if (Array.isArray(v)) v = v[0];
  return parseFloat(v);
}

function parseNotes(raw) {
  if (raw == null) return [];
  var dict = typeof raw === "string" ? JSON.parse(raw) : raw;
  return dict && dict.notes ? dict.notes : [];
}

function getSelectedNotes(clip) {
  return parseNotes(clip.call("get_selected_notes_extended"));
}

function getAllNotes(clip) {
  var len = getNum(clip, "length") || 0;
  return parseNotes(clip.call("get_notes_extended", 0, 128, 0, len + EPS));
}

function addNotes(clip, notes) {
  if (notes.length) clip.call("add_new_notes", { notes: notes });
}

// Only ever called at the keyswitch pitch over the affected window, so a bug
// here can never delete melodic notes.
function removeNotesRange(clip, pitch, fromTime, timeSpan) {
  clip.call("remove_notes_extended", pitch, 1, fromTime, timeSpan);
}

function rangeOf(ks) {
  var fromTime = Infinity;
  var maxEnd = -Infinity;
  for (var i = 0; i < ks.length; i++) {
    if (ks[i].start_time < fromTime) fromTime = ks[i].start_time;
    var e = ks[i].start_time + ks[i].duration;
    if (e > maxEnd) maxEnd = e;
  }
  return { fromTime: fromTime, timeSpan: maxEnd - fromTime + EPS };
}

// ---- Orchestration (Max-only) ---------------------------------------------

function applyArticulationToSelection(art, opts) {
  var clip = detailClip();
  if (!clip) {
    post("[keyswitch] no focused clip (open a MIDI clip in the Detail editor)\n");
    return 0;
  }
  var sel = getSelectedNotes(clip);
  if (!sel.length) {
    post("[keyswitch] no notes selected\n");
    return 0;
  }
  opts = opts || {};
  if (opts.hold && opts.clipLength == null) opts.clipLength = getNum(clip, "length");
  var ks = computeKeyswitchNotes(sel, art, opts);
  if (!ks.length) return 0;
  var r = rangeOf(ks);
  removeNotesRange(clip, art.pitch, r.fromTime, r.timeSpan); // dedup: replace, don't stack
  addNotes(clip, ks);
  lastUsed = art;
  outlet(0, "repeatLabel", art.name);
  post('[keyswitch] applied "' + art.name + '" (pitch ' + art.pitch + ') to ' + ks.length + " onset(s)\n");
  return ks.length;
}

function autoPlace(art, mode) {
  var clip = detailClip();
  if (!clip) {
    post("[keyswitch] no focused clip\n");
    return 0;
  }
  var notes = getAllNotes(clip);
  var ksPitches = currentMap().map(function (a) {
    return a.pitch;
  });
  var starts = mode === "phrase" ? phraseStarts(notes, ksPitches) : melodicOnsets(notes, ksPitches);
  if (!starts.length) {
    post("[keyswitch] no melodic notes found to place against\n");
    return 0;
  }
  var vel = art.velocity != null ? art.velocity : 100;
  var ks = starts.map(function (s) {
    return { pitch: art.pitch, start_time: Math.max(0, s - KS_LEAD), duration: TRIGGER_DURATION, velocity: vel };
  });
  var r = rangeOf(ks);
  removeNotesRange(clip, art.pitch, r.fromTime, r.timeSpan);
  addNotes(clip, ks);
  lastUsed = art;
  outlet(0, "repeatLabel", art.name);
  post('[keyswitch] auto-placed "' + art.name + '" at ' + ks.length + " " + mode + "(s)\n");
  return ks.length;
}

// ---- Message entry points (called from .amxd UI) --------------------------

// Stage-0 proof: just report what the clip says is selected.
function diag() {
  var clip = detailClip();
  if (!clip) {
    post("[keyswitch][diag] no focused clip\n");
    return;
  }
  var sel = getSelectedNotes(clip);
  post("[keyswitch][diag] " + sel.length + " selected note(s)\n");
  if (sel.length) post("[keyswitch][diag] first = " + JSON.stringify(sel[0]) + "\n");
}

function applySelection() {
  applyArticulationToSelection(lastUsed || MAP[0], { mode: "perNote" });
}

// Quick-apply map[i] to the selection. Message: "apply 2".
function apply(i) {
  var art = MAP[i];
  if (!art) {
    post("[keyswitch] no articulation in slot " + i + "\n");
    return;
  }
  applyArticulationToSelection(art, { mode: "perNote" });
}

function repeatLast() {
  if (!lastUsed) {
    post("[keyswitch] nothing to repeat yet\n");
    return;
  }
  applyArticulationToSelection(lastUsed, { mode: "perNote" });
}

function autoPlaceOnset() {
  autoPlace(lastUsed || MAP[0], "onset");
}

function autoPlacePhrase() {
  autoPlace(lastUsed || MAP[0], "phrase");
}

function loadbang() {
  post("[keyswitch] loaded — " + MAP.length + " articulations; select notes and click Apply\n");
}

// ---- Node export (ignored by the v8 object) -------------------------------

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    computeKeyswitchNotes: computeKeyswitchNotes,
    collapseByOnset: collapseByOnset,
    melodicOnsets: melodicOnsets,
    phraseStarts: phraseStarts,
    TRIGGER_DURATION: TRIGGER_DURATION,
    KS_LEAD: KS_LEAD,
    PHRASE_GAP: PHRASE_GAP,
    DEFAULT_MAP: DEFAULT_MAP,
  };
}
