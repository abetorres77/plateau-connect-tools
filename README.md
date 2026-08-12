# Plateau Tools — Trimble Connect extension

Files in this folder:

| File | What it is |
|---|---|
| `manifest.json` | The file you register in Trimble Connect. Points at `index.html`. |
| `index.html` | The extension app: Point Extractor (saved Views → PNEZD CSV) + About. |
| `trimbleconnect.workspace.api.js` | Trimble's Workspace API library (v0.3.34, downloaded from npm) — served locally so there is no CDN dependency. |
| `icon.png` | PEI black/gold menu icon (required — Connect won't render menu items without an icon). |
| `pristine.tflx` | Empty FieldLink job template (SQLite) cloned for TFLX export — same template as the desktop CsvToTflx tool. |
| `sql-wasm.js` / `sql-wasm.wasm` | sql.js (SQLite compiled to WebAssembly), loaded on demand for TFLX export. |

## Important: these files must be reachable by HTTPS

Trimble Connect loads extensions from a **public HTTPS URL** — it fetches `manifest.json` from its servers (so the URL must be CORS-enabled) and loads `index.html` in an iframe in the browser. A network drive path like `Y:\...` cannot be used directly.

Easy hosting options (all three files go up together, keep them in one folder):

1. **GitHub Pages** (free, simplest): make a repo, drop the 3 files in, enable Pages. GitHub Pages sends `Access-Control-Allow-Origin: *`, so the manifest fetch works out of the box.
2. **Netlify Drop** (free, no account tooling needed): drag the folder onto https://app.netlify.com/drop.
3. **Company web server**: any IIS/nginx that serves this folder over HTTPS. Make sure `manifest.json` is served with the header `Access-Control-Allow-Origin: *`.

After hosting, **edit `manifest.json`** and replace `https://YOUR-PUBLIC-HOST/trimble-connect/index.html` with the real URL of `index.html`, then re-upload it.

## Installing in a project

1. Open the project in Trimble Connect for Browser (you must be a **project admin**).
2. Project Settings → **Extensions** → paste the URL of `manifest.json` → Add.
3. "Plateau Tools" appears in the left navigation for every project member, with **Point Extractor** and **About** buttons.

## What Point Extractor does

- Asks Connect for the signed-in user's access token (one-time consent prompt — no separate login).
- Reads every saved **View** in the current project via `GET /tc/api/2.0/views?projectId=…` and `GET /tc/api/2.0/views/{id}`.
- Collects markups with `type === "measure"` (single-point measurements). Connect stores these in **millimeters**; the tool converts to US survey feet (mm ÷ 304.800609601), international feet, or meters.
- Outputs `Connect_Points_PNEZD.csv` — columns P, N, E, Z, Description (Description = View name, points auto-numbered from 1000).

Same logic as the `ConnectPointExtractor.html` bookmarklet on the Desktop, verified on Project Nova #26006 — but installed once per project instead of run per-browser.

## Known unknowns (check on first run)

- **CORS on the REST API**: the token consent + `getCurrentProject` calls go through Connect itself and will work. The direct `fetch` calls to `app.connect.trimble.com` from the extension iframe should work (the API is built for browser apps), but if the browser console shows CORS errors, the fix is to route those two GET calls through a tiny proxy on the same host as the extension.
- **Views list shape**: the code handles both a plain array and `{items: [...]}` responses.
