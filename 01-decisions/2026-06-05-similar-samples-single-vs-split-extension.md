# Keep Find + Unpack as one extension (don't split take-lane tools out yet)

- **Date:** 2026-06-05
- **Status:** accepted
- **Scope:** `02-extensions/similar-samples/`

## Context — what forced the choice

The Similar Samples extension now ships three commands that are really **two features**:

1. **Find Similar Samples** — the acoustic matcher. Depends on the sample index, `features.ts`,
   `index-format.ts`, `renderPreFxAudio`, `importIntoProject`. Places matches into take lanes.
2. **Unpack Take Lanes → Tracks** (+ the selection-aware **Unpack Other Take Lanes**) — a
   **generic** comping utility. It operates on *any* take lanes, regardless of who created them,
   and has zero dependency on the matching code.

Because feature 2 is self-contained and broadly useful, the question came up: should it be its
own extension — partly for tidiness, partly "in case someone else ships a similar extension"
(collision worry)?

## Decision — keep it as a single extension, but keep the seam clean

Ship both features in the one `similar-samples` extension for now. Do **not** split the unpack
utility into a separate `take-lane-tools` extension at this time. Maintain the code so the unpack
feature stays trivially extractable later (it already is — see Consequences).

## Alternatives considered

- **Split into two extensions** (`similar-samples` + a standalone `take-lane-tools`). Rejected
  for now — see Consequences. Revisit if/when the trigger below is met.
- **Distinctive menu labels** as the actual collision defense (kept regardless of packaging).

## Key correction to the collision premise

Splitting *our own* extension in two does **not** protect against a third party's extension:

- **Command IDs are namespaced per extension** (`similarSamples.unpack`) — no hard collision with
  another extension's commands, whether we bundle or split.
- The only real "collision" is two extensions adding a menu item with the **same label string**
  (e.g. "Unpack Take Lanes → Tracks"). That can happen with one bundle or two — it's about the
  label, not the packaging. The defense is a slightly distinctive label, not a split.

So "in case someone else does something similar" is, by itself, **not** a reason to split.

## Consequences

**Why one extension wins now:**
- It's a tight workflow loop — Find drops matches into take lanes → audition → Unpack to tracks.
  Shipping together delivers the complete round-trip in one install.
- Heavy shared scaffolding (manifest, `build.ts`, `.env`/host setup, the `notify` helper,
  `findAudioTrack`, one storage dir). Splitting duplicates all of it and doubles the dev-host /
  handoff overhead.

**The seam is already clean.** `runUnpack`, `findAudioTrack`, and `notify` have no dependency on
the matching code, so extracting a `02-extensions/take-lane-tools/` later is a lift-and-shift, not
a rewrite.

**Split trigger (when to revisit):** if distributing the take-lane utility to *other people
independently* becomes a real goal. Tidiness / future-proofing alone does not meet the bar.

**Follow-up if we ever split:** new folder `take-lane-tools/`, move `runUnpack` + helpers, give it
its own manifest/`build.ts`/storage dir, and pick a distinctive menu label to reduce label
collisions with third parties.
