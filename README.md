# Plateau Tools — Trimble Connect extension

Files in this folder:

| File | What it is |
|---|---|
| `manifest.json` | The one file you register in Trimble Connect. Declares `"extensionType": ["project", "3dviewer"]` so the same "Plateau Tools" entry runs in the project UI **and** in the 3D Viewer. Points at `index.html`. |
| `index.html` | Entry page. In the project UI it builds the left-nav menu: Point Extractor (saved Views → PNEZD CSV/TFLX), File Converter, **QTO** (explains the takeoff and has an "Open the 3D Viewer" button — the takeoff itself runs in the viewer), About. Inside the 3D Viewer it detects the host (`extension.getHost()`) and hands over to `qto.html`. |
| `qto.html` | **Plateau QTO** — pipe LF by size & material, structures, fittings, appurtenances from the models loaded in the 3D Viewer. See below. |
| `deploy.ps1` | Publishes changed files to the GitHub Pages repo with the GitHub CLI (`-DryRun` to preview). |
| `manifest-qto.json` | **Fallback only.** A stand-alone 3D-Viewer-only manifest for `qto.html`, in case the combined manifest does not show up inside the viewer. |
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

Current Connect UI (checked 2026-09-11 — the old "Project Settings → Extensions" page is gone):

1. Open the project in Trimble Connect for Browser (you must be a **project admin**).
2. Left nav **Settings → Apps & Capabilities → + Add Custom**. The dialog has one field, **Capability Manifest URL**: paste
   `https://abetorres77.github.io/plateau-connect-tools/manifest.json` → **Add**.
3. "Plateau Tools" appears in the list tagged *Custom*, vendor `abetorres77.github.io`, with a Category of *Project* (old manifest) or *Project & 3D Viewer* (current manifest). Every project member sees it in the left navigation; inside the 3D Viewer it appears in the viewer's extension/side panel as **Plateau Tools** and opens the QTO tool.

**Updating an already-installed copy.** Connect reads the manifest when you add it and the row's ⋮ menu only offers *Reset authorization* and *Remove* — there is no "refresh". Changes to `index.html` / `qto.html` show up on the next page load with no action needed (allow up to 10 minutes: GitHub Pages caches for 600 s and Chrome keeps a separate cache for pages loaded inside Connect, so reloading the GitHub URL in its own tab does not help; the QTO header shows a version tag so you can tell which build is running), but a changed `manifest.json` (new `extensionType`, title, description) needs **⋮ → Remove**, then **+ Add Custom** again with the same URL. Do this once per project that has Plateau Tools installed (Project Nova #26006 as of 2026-09-11). Users may get the access-token consent prompt again the first time they use Point Extractor.

## What Point Extractor does

- Asks Connect for the signed-in user's access token (one-time consent prompt — no separate login).
- Reads every saved **View** in the current project via `GET /tc/api/2.0/views?projectId=…` and `GET /tc/api/2.0/views/{id}`.
- Collects markups with `type === "measure"` (single-point measurements). Connect stores these in **millimeters**; the tool converts to US survey feet (mm ÷ 304.800609601), international feet, or meters.
- Outputs `Connect_Points_PNEZD.csv` — columns P, N, E, Z, Description (Description = View name, points auto-numbered from 1000).

Same logic as the `ConnectPointExtractor.html` bookmarklet on the Desktop, verified on Project Nova #26006 — but installed once per project instead of run per-browser.

## Plateau QTO (3D Viewer extension) — pipe LF, structures, fittings

`qto.html`, reached through the combined `manifest.json`. It reads the models **loaded in the 3D Viewer** through the Workspace API (`viewer.getObjects` → `viewer.getObjectProperties`), so it needs no access token and works on any model format Connect can show (NWD/NWC from Civil 3D, IFC, DWG, RVT…).

**Install:** nothing extra if `manifest.json` (with `"extensionType": ["project", "3dviewer"]`) is registered as described above — open a model in the 3D Viewer and pick **Plateau Tools** in the viewer's extension panel. If it does not appear there, register the fallback `https://abetorres77.github.io/plateau-connect-tools/manifest-qto.json` the same way (Settings → Apps & Capabilities → + Add Custom); it shows as a separate "Plateau QTO" entry with Category *3D Viewer*.

**Use:**
1. Check the loaded models to include. Scope = everything, or only the objects currently selected in the viewer (select a network, an area, a sheet…).
2. **Run takeoff**. Results: Summary (pipe by size & material with segment count and LF; structures by type; fittings by size & type; appurtenances), By network, Detail (every object), Unclassified (anything that didn't look like pipe/structure/fitting — check this so nothing is missed).
3. Click any row to select those objects in the viewer (optional zoom).
4. Download summary CSV / detail CSV, or "Copy summary for Excel" (tab-separated).

**How it classifies:** first by explicit type — Civil 3D `Internal Type` (`AECC_PIPE`, `AECC_PRESSURE_PIPE`, `AECC_STRUCTURE`, `AECC_FITTING`, `AECC_APPURTENANCE`), Revit category (`Element · Category` = Pipes / Pipe Fittings / Pipe Accessories / Generic Models…, see below), IFC class (`IfcPipeSegment`, `IfcPipeFitting`, `IfcDistributionChamberElement`, `IfcValve`…) — then by keywords in the name/description (manhole, inlet, bend, tee, valve, hydrant, pipe…). Civil 3D "Null Structure" objects are ignored by default.

**Revit NWC exports (validated 2026-09-18 on SWITCH ATL `SWITCH_CM_SAN_PH2B_PEI_3D.nwc` / `SWITCH_CM_STORM_PH2B_PEI_3D.nwc`):** a model counts as Revit when its objects carry an `Element` property set. Only nodes with `Element · Category` are takeoff items; the file / level / category / family / type hierarchy nodes, the `Solid` geometry leaves and nested components are **ignored**, as are the sub-elements Revit exports next to every pipe (`Center Line` and `Pipe Insulations`, which Plateau uses as the clearance envelope) — counting those would double the LF. Ignored nodes are listed by kind at the bottom of the *Unclassified* tab (click a row to see them). Pipes: LF = `Element · Length`, size = `Element · Size` (`10"ø` → `10"`), material = `Pipe Segment · Name` shortened (`RCP - Class III` → `RCP Class III`, `Polyvinyl Chloride - Rigid - Schedule 40` → `PVC Schedule 40`), network = `System Type · Name` (`STORM`, `SANITARY`). Structures (Generic Models): the type is the last all-caps 2–3 letter code in the family name (`A11-CB` → CB, `H8.1-WI` → WI, `ST- A1 HW` → HW, `SS-J6` → SS); families without a code (`Structure`, `PLACE HOLDER`) are listed by name. Size = `Custom box Length x Width` (feet) or `Base OD` / `Diameter` (inches) when the family has one. The detail CSV adds Family / ID, System, Slope and Lower invert columns.

**Property mapping:** the tool auto-detects which property holds Length (prefers `3D Length` / center-to-center over `2D Length`; Revit `Element · Length`), Size (`Part Size Name`, Revit `Element · Size` / `Diameter`, `Inner Diameter or Width`, `NominalDiameter`…), Material, Network and Description. Matchers can pin the property-set name, which matters for Revit where dozens of sets have a `Name` / `Type` / `Category`. If a table looks wrong, open "Property mapping" and pick the exact property; the choice is remembered per model set. **Inspect selected object** dumps every property of one selected object so you can see the real names; **Copy inventory** copies a JSON of every property key (count, type, sample values) plus example objects for all loaded models — paste it into a file when a new model type needs support.

**Diagnostic hook:** the hosting Connect page (and only it — `web.connect.trimble.com` / `app.connect.trimble.com`, parent window) can post `{plateauCmd: "status" | "run" | "summary" | "inventory", from?}` to the panel iframe and gets `{plateauResult, …}` back. Used to drive the tool from the browser console when the panel's own buttons can't be reached (browser automation cannot click into a cross-origin iframe).

**Units:** Connect stores Length-type property values in millimeters; those are converted exactly. Text lengths like `125.34'` are parsed. Bare numbers use the "Unitless numbers in model are" setting (default US survey feet). Sizes are normalized to inches (`8"`, `24"`, `2x4` for box sections).

## Known unknowns (check on first run)

- **QTO property names:** the auto-detection was built from Civil 3D → Navisworks exports (`Civil3D` / `Item` property sets, validated on IND101 SAN), Revit → Navisworks exports (`Element` / `Revit Type` / `Pipe Segment` / `System Type` sets, validated on SWITCH ATL SAN + STORM) and IFC. On the first model of a new kind, run **Inspect selected object** on one pipe and one manhole (or **Copy inventory**) and confirm the mapping card picked the right properties. Not yet seen in a real Revit model: Pipe Fittings, Pipe Accessories, Conduits, Structural Framing ductbanks — their category rules exist but are untested.

- **CORS on the REST API**: the token consent + `getCurrentProject` calls go through Connect itself and will work. The direct `fetch` calls to `app.connect.trimble.com` from the extension iframe should work (the API is built for browser apps), but if the browser console shows CORS errors, the fix is to route those two GET calls through a tiny proxy on the same host as the extension.
- **Views list shape**: the code handles both a plain array and `{items: [...]}` responses.
