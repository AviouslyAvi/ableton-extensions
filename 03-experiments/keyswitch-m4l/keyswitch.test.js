// Unit tests for the pure logic in keyswitch.js — run off-Live:
//   node --test 03-experiments/keyswitch-m4l/
// The Live-API functions can't be tested without Live; these cover the beat math.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const ks = require("./keyswitch.js");

const ART = { name: "Legato", pitch: 1 };

test("perNote: one keyswitch per onset, spanning each note's duration", () => {
  const sel = [
    { pitch: 60, start_time: 0, duration: 1 },
    { pitch: 62, start_time: 2, duration: 0.5 },
  ];
  const out = ks.computeKeyswitchNotes(sel, ART, { mode: "perNote" });
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((n) => [n.pitch, n.start_time, n.duration]),
    [
      [1, 0, 1],
      [1, 2, 0.5],
    ],
  );
  assert.equal(out[0].velocity, 100); // default velocity
});

test("chord: notes sharing an onset collapse to one KS = longest duration", () => {
  const sel = [
    { pitch: 60, start_time: 4, duration: 1 },
    { pitch: 64, start_time: 4, duration: 2 },
    { pitch: 67, start_time: 4, duration: 0.5 },
  ];
  const out = ks.computeKeyswitchNotes(sel, ART, { mode: "perNote" });
  assert.equal(out.length, 1);
  assert.equal(out[0].start_time, 4);
  assert.equal(out[0].duration, 2);
});

test("minimum duration is enforced (TRIGGER_DURATION floor)", () => {
  const sel = [{ pitch: 60, start_time: 0, duration: 0.01 }];
  const out = ks.computeKeyswitchNotes(sel, ART, { mode: "perNote" });
  assert.equal(out[0].duration, ks.TRIGGER_DURATION);
});

test("selectionSpan: a single KS covering first onset -> last note end", () => {
  const sel = [
    { pitch: 60, start_time: 1, duration: 1 },
    { pitch: 62, start_time: 3, duration: 2 }, // ends at 5
  ];
  const out = ks.computeKeyswitchNotes(sel, ART, { mode: "selectionSpan" });
  assert.equal(out.length, 1);
  assert.equal(out[0].start_time, 1);
  assert.equal(out[0].duration, 4); // 5 - 1
});

test("trigger mode: short KS at each onset regardless of note length", () => {
  const sel = [{ pitch: 60, start_time: 0, duration: 4 }];
  const out = ks.computeKeyswitchNotes(sel, ART, { mode: "trigger" });
  assert.equal(out[0].duration, ks.TRIGGER_DURATION);
});

test("hold: each KS latches to the next onset, last to clipLength", () => {
  const sel = [
    { pitch: 60, start_time: 0, duration: 0.5 },
    { pitch: 62, start_time: 2, duration: 0.5 },
  ];
  const out = ks.computeKeyswitchNotes(sel, ART, { mode: "perNote", hold: true, clipLength: 8 });
  assert.equal(out[0].duration, 2); // 2 - 0
  assert.equal(out[1].duration, 6); // 8 - 2
});

test("empty selection -> no notes", () => {
  assert.deepEqual(ks.computeKeyswitchNotes([], ART, {}), []);
});

test("melodicOnsets excludes keyswitch pitches and de-dups onsets", () => {
  const notes = [
    { pitch: 1, start_time: 0, duration: 1 }, // a keyswitch (excluded)
    { pitch: 60, start_time: 0, duration: 1 },
    { pitch: 64, start_time: 0, duration: 1 }, // same onset as 60 -> one entry
    { pitch: 62, start_time: 2, duration: 1 },
  ];
  const onsets = ks.melodicOnsets(notes, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(onsets, [0, 2]);
});

test("phraseStarts: first note + notes after a >= PHRASE_GAP rest", () => {
  const notes = [
    { pitch: 60, start_time: 0, duration: 0.5 },
    { pitch: 62, start_time: 0.5, duration: 0.5 }, // contiguous -> same phrase
    { pitch: 64, start_time: 3, duration: 0.5 }, // gap of 2 beats -> new phrase
  ];
  const starts = ks.phraseStarts(notes, [0]);
  assert.deepEqual(starts, [0, 3]);
});
