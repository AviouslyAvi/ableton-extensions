# 02 — Extensions

## Room purpose
The real work. Each shippable Ableton extension lives in its own subfolder here as a full SDK project.

## What lives here
- One subfolder per extension: `02-extensions/<extension-name>/` containing the generated SDK project (`manifest.json`, `src/extension.ts`, `build.ts`, `package.json`, `tsconfig.json`, `.env`, `vendor/`).
- A short `NOTES.md` per extension describing what it does and its current state.

## Files to load
- This README.
- The target extension's `src/extension.ts` and `manifest.json`.
- That extension's `NOTES.md`.

## Files to skip
- `node_modules/`, `dist/`, `vendor/*.tgz` — never read these into context.
- Other extensions' folders you're not working on.

## Skills to invoke
- `run` / `verify` to build and confirm an extension loads into Live.
- Foundation room (`00-foundation`) for API/manifest reference while coding.

## Pipeline
Idea (`04-plans`) → spike (`03-experiments`) → promote to a project here → build & run (`npm start`) → `package` for distribution.

## When to leave this room
- To record a design choice → `01-decisions`.
- To save session state → `05-handoffs`.

---

## Creating a new extension here
```bash
mkdir "02-extensions/<name>" && cd "02-extensions/<name>"
npx file:/Users/aviouslyavi/Downloads/extensions-sdk-1.0.0-beta.0/ableton-create-extension-1.0.0-beta.0.tgz
# edit src/extension.ts, set EXTENSION_HOST_PATH in .env, then:
npm start
```

## Extensions index
| Extension | Purpose | Status |
|---|---|---|
| [similar-samples](similar-samples/README.md) | Right-click an Arrangement audio clip → find & place 2–3 sonically similar samples from an indexed library | Built; DSP+ranking validated offline. Pending in-Live test (`npm start`). |
