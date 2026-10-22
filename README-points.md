# PEI Points — Trimble Connect 3D Viewer extension

Search the survey points of the models loaded in the 3D Viewer by **point number**, **number range** (`1005-1020`), **list** (`1003,2003`) or **description** (`MH`, `fire hydrant`) and zoom the viewer to the one you pick. (A CSV review tab existed in build v2026.10.22c and was removed at the owner's request in v2026.10.22d.) Built for Plateau Excavation field and office staff; same hosting and install path as Plateau Tools / Plateau QTO.

| File | What it is |
|---|---|
| `manifest-points.json` | Stand-alone fallback manifest (normally not needed — see *Part of Plateau Tools*). `extensionType: ["3dviewer"]`, `type: "panel"` — the tool opens as a tab in the viewer's left side panel. |
| `points.html` | The extension page (version tag in the header). |
| `pin.png` | Marker dropped in the viewer at the zoomed point. |
| `icon.png` | PEI menu icon (Connect renders nothing without one). |
| `trimbleconnect.workspace.api.js` | Trimble Workspace API v0.3.34, served from the same GitHub Pages repo (already published by the Plateau Tools deploy). |
| `harness.html` | Local fake-host test page: 40 Civil 3D COGO points, 3 IFC control points, a Revit-style model with no points. |
| `deploy.ps1` | Publishes `points.html`, `manifest-points.json`, `pin.png`, `README-points.md` to `abetorres77/plateau-connect-tools` (GitHub Pages). `-DryRun` to preview. |

## Part of Plateau Tools (since 2026-10-22)

PEI Points is part of the combined **Plateau Tools** extension (`manifest.json` in `Y:\Private\abe.torres\Claude Drive\Trimble Connect\`): the project-side dropdown has a **Point Search** entry right under Point Extractor (it explains the tool; its "Open the 3D Viewer" button lands on it), and inside the 3D Viewer the Plateau Tools tab opens a **tools menu** (QTO Takeoff / Point Search); every tool has a **&#9776; Tools** link in its header that returns to that menu. Projects that already have Plateau Tools installed get it automatically on the next viewer load; nothing to add. `manifest-points.json` below remains as a stand-alone fallback only.

## Stand-alone install (fallback only)

1. Open the project in Trimble Connect for Browser.
2. Left nav **Settings → Apps & Capabilities → + Add Custom**.
3. Capability Manifest URL: `https://abetorres77.github.io/plateau-connect-tools/manifest-points.json` → **Add**.
4. Open a model in the **3D Viewer**; **PEI Points** appears in the side-panel tabs.

Changed `points.html` shows up on the next viewer load (allow up to 10 min of GitHub Pages / Chrome caching). A changed manifest needs **⋮ → Remove** then **+ Add Custom** again.

## How it finds and zooms to points (build v2026.10.22d)

**Model points** — the tool reads every object of the checked models through the Workspace API (`getObjects` → `getObjectProperties`) and indexes point number, description, name and elevation. An object counts as a survey point when it has a point-number-like property (`Point Number`, `Point No`, `Pt #`, `Number`, `Point Name`…) or when its class / object type looks like a point (`AECC_COGO_POINT`, `IfcAnnotation`, "Survey Point"…). Description comes from `Raw Description` / `Full Description` / `Description` / `Code`, else the object's description. Everything else (pipes, structures, layers) is still indexed, so with **Points only** unchecked you can search any object by name — e.g. a manhole family `A11-CB`. Clicking a row selects the object and calls `setCamera` with that object, which is the viewer's own "zoom to object"; the detail line shows the model name, the object's bounding-box center in US survey feet and its point-related properties.

**Zoom distance.** Both sources zoom the same way: the point's center is read (bounding box, or the object's Northing/Easting properties) and the camera is moved back along its current viewing direction by **View distance** (default 150 ft, remembered), never looking up at the point; **Plan view** makes the next zoom look straight down. The viewer's own fit-to-object (which lands on top of a point) is only the last resort when no center can be read. A marker (`viewer.addIcon`) is dropped at the point when **Marker** is on.

**Point numbers.** The number is taken, in order, from a point-number property (`Point Number`, `Point No`, `Pt #`, `Number`, `No` — any property-set, `Category:` prefixes ignored, also integer-typed), from a `Name` / `Point Name` / `Id` property or the object name when they are numeric-like (`1005`, `CP12`), or from names such as `Point - (1005)` / `PT1005`. The scan summary lists which source each number came from. If a model still shows no numbers, click **Inspect** on a result: it prints every property of that object and copies a JSON inventory of the scan to the clipboard — paste it to get the matchers fixed.

## Verified / not yet verified

Harness-tested 2026-10-22 (`harness.html`, 51 objects): scan, number / range / list / description search, number taken from a property / a numeric name / a `Point - (1101)` name pattern / an integer-typed `Number`, zoom to object (setSelection + camera flown to the bounding-box center at the view distance, marker placed).

Not yet seen on a real project — check on first use and fix the matchers if needed:

- **Civil 3D COGO point property names** in a Navisworks export are a best guess (`General:Point Number`, `General:Raw Description`, `General:Full Description`, `General:Elevation`). Use Plateau QTO's *Inspect selected object* on one point to see the real names; the regexes in `points.html` (`PROP.number`, `PROP.desc`, `PROP.elev`) are the only place to change.
- **`setCamera` with a `Camera` object**: the typings say `position` is in meters and `lookAt` is deprecated in favor of `pitch` / `yaw`. The tool copies the current camera and replaces `position` + `lookAt`; if the viewer ignores `lookAt`, use "Look straight down on next zoom" and report it so the pitch/yaw path can be added.
- **`addIcon` size units** are undocumented (default 24; change under Model alignment if the marker is huge or invisible).
- **`getObjectBoundingBoxes` units** are assumed meters like `ObjectPosition`; Calibrate and the "Model position" detail line depend on it.

## Diagnostic hook

The hosting Connect page (parent window on `*.connect.trimble.com`, or `127.0.0.1` / `localhost` for the harness) can post `{peiCmd: "status" | "scan" | "search" | "zoom" | "loadCsv", q, text, label, from}` to the panel iframe and gets `{peiResult, …}` back — used to drive the tool from the browser console when the panel can't be clicked by automation.
