---
date: 2026-06-16
slug: fl-ableton-converter
status: active
---

# Handoff — FL→Ableton Automation Converter

## Where we left off
Researched, planned, and built **v1** of a FL Studio → Ableton automation converter. It's a **standalone Python repo** (not an Ableton extension) at `~/Projects/fl-ableton-automation`, committed (`7dfee14`), 18 tests passing. Built for Avi's friend who wants automation to survive moving projects between FL and Ableton.

## Immediate next step
Get a real **FL Studio 2025** `.flp` (one track, 1–2 automation clips) and drop it at `~/Projects/fl-ableton-automation/tests/fixtures/sample.flp`, then run the reader to confirm PyFLP can parse FL 2025 at all.

## Context to load on resume
- Repo: `~/Projects/fl-ableton-automation/` (README has full usage)
- Plan: `~/.claude/plans/yes-please-make-a-abstract-sun.md`
- Memory: `fl-ableton-automation-converter.md`
- Scope v1: FL→Ableton, **automation only**, template-based (inject into a user-supplied `.als`), empirical value calibration.

## Open decisions / blockers
- **BLOCKER (risk):** PyFLP has open unresolved parse failures on **FL Studio 2025** files (GitHub issues #200/#202/#203). Automation *may* still extract (#200 is playlist-only) — must test a real file. If it chokes: pin older PyFLP, patch parser, or another route.
- Friend's setup: **FL Studio 2025 + Ableton 12** (Ableton 12 = low risk, writer is template-based).
- FL tension encoding (−1..1 vs 0..1) is auto-detected but unverified against a real `.flp`.

## Notes
- Architecture: neutral IR between PyFLP reader and lxml ALS writer → makes reverse direction (Ableton→FL) + DAWproject export later additions, not rewrites.
- After Step 1 passes: Avi makes `template.als` + min/max `calibration.als` in Ableton 12, then full end-to-end conversion + visual check in Live.
- This is outside the extensions workspace by design (standalone tool the friend can use/share).
