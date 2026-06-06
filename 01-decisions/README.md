# 01 — Decisions

## Room purpose
Decision records (ADRs). One file per meaningful design/architecture choice, so future sessions know *why* something is the way it is and don't re-litigate it.

## What lives here
- `YYYY-MM-DD-<slug>.md` decision records.
- Cross-cutting conventions (naming, bundling, error handling) once settled.

## Files to load
- This README, plus the specific decision file relevant to the question.

## Files to skip
- Experiment logs (those live in `03-experiments`).

## Skills to invoke
- `Avious-documentation` to write a decision as `.md`.

## Pipeline
A choice gets made while working in `02-extensions`/`03-experiments` → record it here → it becomes a rule in `CLAUDE.md` if it's workspace-wide.

## When to leave this room
Once the decision is recorded, return to the room you were building in.

---

## Decision record format
```md
# <Decision title>
- Date:
- Status: proposed | accepted | superseded
- Context: what forced the choice
- Decision: what we chose
- Alternatives considered:
- Consequences:
```

## Decisions recorded
- `2026-06-05-similar-samples-single-vs-split-extension.md` — keep Find + Unpack as one
  extension (don't split take-lane tools out yet); seam kept clean for a later lift-and-shift.
