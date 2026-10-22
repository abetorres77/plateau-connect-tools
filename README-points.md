# PEI Points — Trimble Connect 3D Viewer extension

Search survey points by **point number**, **number range** (`1005-1020`), **list** (`1003,2003`) or **description** (`MH`, `fire hydrant`) and zoom the 3D Viewer to the one you pick. Built for Plateau Excavation field and office staff; same hosting and install path as Plateau Tools / Plateau QTO.

| File | What it is |
|---|---|
| `manifest-points.json` | The manifest you register in Connect. `extensionType: ["3dviewer"]`, `type: "panel"` — the tool opens as a tab in the viewer's left side panel. |
| `points.html` | The extension page (version tag in the header). |
| `pin.png` | Marker dropped in the viewer when zooming to a point from a point file. |
| `icon.png` | PEI menu icon (Connect renders nothing without one). |
| `trimbleconnect.workspace.api.js` | Trimble Workspace API v0.3.34, served from the same GitHub Pages repo (already published by the Plateau Tools deploy). |
| `harness.html` | Local fake-host test page: 40 Civil 3D COGO points, 3 IFC control points, a Revit-style model with no points. |
| `deploy.ps1` | Publishes `points.html`, `manifest-points.json`, `pin.png`, `README-points.md` to `abetorres77/plateau-connect-tools` (GitHub Pages). `-DryRun` to preview. |

## Install (project admin, once per project)

1. Open the project in Trimble Connect for Browser.
2. Left nav **Settings → Apps & Capabilities → + Add Custom**.
3. Capability Manifest URL: `https://abetorres77.github.io/plateau-connect-tools/manifest-points.json` → **Add**.
4. Open a model in the **3D Viewer**; **PEI Points** appears in the side-panel tabs.

Changed `points.html` shows up on the next viewer load (allow up to 10 min of GitHub Pages / Chrome caching). A changed manifest needs **⋮ → Remove** then **+ Add Custom** again.

## Two sources of points

**Model points** — the tool reads every object of the checked models through the Workspace API (`getObjects` → `getObjectProperties`) and indexes point number, description, name and elevation. An object counts as a survey point when it has a point-number-like property (`Point Number`, `Point No`, `Pt #`, `Number`, `Point Name`…) or when its class / object type looks like a point (`AECC_COGO_POINT`, `IfcAnnotation`, "Survey Point"…). Description comes from `Raw Description` / `Full Description` / `Description` / `Code`, else the object's description. Everything else (pipes, structures, layers) is still indexed, so with **Points only** unchecked you can search any object by name — e.g. a manhole family `A11-CB`. Clicking a row selects the object and calls `setCamera` with that object, which is the viewer's own "zoom to object"; the detail line shows the model name, the object's bounding-box center in US survey feet and its point-related properties.

**Point file** — load the P,N,E,Z,D CSV you already have (TBC export, the Point Extractor output, a field file) or paste rows. Column order and units are selectable; a header row is skipped automatically. Clicking a row moves the camera so the coordinate sits at the center of the view, keeping the current viewing direction, at the chosen **View distance** (default 100 ft), and drops the orange **marker** at the point (`viewer.addIcon`). **Look straight down on next zoom** gives a plan view instead. The last file is remembered per project in the browser.

### Model alignment

Point-file zoom assumes viewer X = Easting, Y = Northing, Z = elevation in the file's units, which is how Civil 3D / TBC state-plane models land in Connect. If the model is shifted (local origin, different datum) use **Calibrate**: select an object in the viewer whose point number is in the file, type that number, click Calibrate. The tool reads the object's bounding-box center and stores the E/N/Z offset (file units) that is then added to every file point. **Model X is Northing** swaps axes for models exported N/E.

## Verified / not yet verified

Harness-tested 2026-10-22 (`harness.html`, 48 objects): scan, number / range / list / description search, zoom to object (setSelection + setCamera selector), zoom to coordinate (camera moved 100 ft back along the current view direction, marker placed at the converted coordinates), Calibrate offset.

Not yet seen on a real project — check on first use and fix the matchers if needed:

- **Civil 3D COGO point property names** in a Navisworks export are a best guess (`General:Point Number`, `General:Raw Description`, `General:Full Description`, `General:Elevation`). Use Plateau QTO's *Inspect selected object* on one point to see the real names; the regexes in `points.html` (`PROP.number`, `PROP.desc`, `PROP.elev`) are the only place to change.
- **`setCamera` with a `Camera` object**: the typings say `position` is in meters and `lookAt` is deprecated in favor of `pitch` / `yaw`. The tool copies the current camera and replaces `position` + `lookAt`; if the viewer ignores `lookAt`, use "Look straight down on next zoom" and report it so the pitch/yaw path can be added.
- **`addIcon` size units** are undocumented (default 24; change under Model alignment if the marker is huge or invisible).
- **`getObjectBoundingBoxes` units** are assumed meters like `ObjectPosition`; Calibrate and the "Model position" detail line depend on it.

## Diagnostic hook

The hosting Connect page (parent window on `*.connect.trimble.com`, or `127.0.0.1` / `localhost` for the harness) can post `{peiCmd: "status" | "scan" | "search" | "zoom" | "loadCsv", q, text, label, from}` to the panel iframe and gets `{peiResult, …}` back — used to drive the tool from the browser console when the panel can't be clicked by automation.
