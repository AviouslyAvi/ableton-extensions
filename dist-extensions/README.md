# dist-extensions — compiled `.ablx` builds

This folder collects the **compiled, installable** builds of every extension in
this workspace, one `.ablx` per extension. Drop any of these onto the
**Extensions** page in Ableton Live's settings to install it.

| File | Source project |
|---|---|
| `Similar-Samples.ablx` | [`02-extensions/similar-samples/`](../02-extensions/similar-samples/) |
| `Keyswitch.ablx` | [`02-extensions/keyswitch/`](../02-extensions/keyswitch/) |

## Rebuilding

From the repo root:

```bash
npm run package:all      # builds + packages every extension into this folder
```

Or one at a time, from inside an extension's folder:

```bash
npm run package          # outputs ../../dist-extensions/<Name>.ablx
```

Filenames here are **unversioned and stable** (e.g. `Keyswitch.ablx`) so the
folder is a clean "install these" set — the real version lives inside each
package's `manifest.json`. These `.ablx` files are tracked in git (via a
`!dist-extensions/*.ablx` exception in `.gitignore`) so the compiled set ships
with the repo; everything else `.ablx` stays ignored.
