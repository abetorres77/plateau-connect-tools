# PEI Paving — Trimble Connect 3D Viewer tool (paving & concrete takeoff)

Quantifies **asphalt paving (SF / SY / tons)**, **concrete sidewalk (SF / CY)**, **curb & gutter (LF)** and **concrete slabs / pads (SF / CY)** straight from the models loaded in the Trimble Connect 3D Viewer. Fifth viewer tool of the Plateau Tools extension (same hosting and install as QTO / Points / Object Properties / Progress %). Built 2026-11-18 against the real Revit road model `STC_W-C_RD_Z1_PEI_RD_3D.trb` (Stafford Technology Campus Phase II West Zone, road & curb).

| File | What it is |
|---|---|
| `paving.html` | The extension page (version tag in the header). Deployed. |
| `manifest-paving.json` | Stand-alone fallback manifest (`extensionType: ["3dviewer"]`, `type: "panel"`). Normally not needed — the tool is in the Plateau Tools menu. Published by deploy.ps1. |
| `README-paving.md` | This file. Deployed. |
| `deploy.ps1` | Publishes the three files above to `abetorres77/plateau-connect-tools` (GitHub Pages). `-DryRun` to preview. |
| `harness-paving.html` | Local fake-host test page that replays the real road model through a fake viewer API (not deployed). |
| `harness-data-paving.js` | 4.3 MB dump of `STC_W-C_RD_Z1_PEI_RD_3D.trb` in the shape `viewer.getObjectProperties` returns, plus `_parent` / `_layer` / `_bbox` (world metres) / `_geom` (plan area, surface, volume computed from the mesh). Not deployed. |
| `tools\TrbDump.cs`, `build-trbdump.ps1`, `TrbDump.exe` | The dumper: reads any `.trb` with Trimble's `Trimble.Technology.TrimBim.dll` (from Trimble Connect for Windows) and writes the harness module. `TrbDump.exe model.trb out.js RD`. |
| `trimbleconnect.workspace.api.js`, `icon.png` | Copies for the local harness (already published by the Plateau Tools deploy). |

## Using it

1. Open the project's **3D Viewer**, load the road / site model(s).
2. Click the **Plateau Tools** icon (black & gold) at the bottom of the viewer's left toolbar → **Paving & Concrete**. (Project side: the Plateau Tools dropdown has a *Paving & Concrete* entry whose "Open the 3D Viewer" button lands on it.)
3. Check the models, pick the scope (everything, or only the viewer selection) and the units, then **Run takeoff**.
4. **Summary** tab: asphalt by type & thickness (SF, SY, tons), sidewalk / slab / other paving (SF, SY, CY), curb by type (LF). **Types** tab: every type found with a category dropdown (override the automatic class) and a **pay thickness** box (drives tons and CY; blank = the model's thickness). **Detail**: one row per element with the source of each number. **Unclassified**: what was left out.
5. Click any row to select those objects in the viewer (tick *Zoom to objects* in the mapping card to also fly there). **Download summary CSV / detail CSV** or **Copy summary for Excel**.

Overrides, pay thicknesses and property mappings are remembered per model set in the browser. **Inspect selected object** prints every property of one object (plus its bounding box); **Copy inventory** copies a JSON of every property key and example objects for a new model type.

## How it measures (build v2026.11.18)

**Revit models (NWC / TrimBIM).** Only nodes with `Element · Category` are elements. A floor's geometry hangs below it (element → `Floors` container → `Solid` leaves, one per material layer with `Revit Material · Name`). The tool resolves that tree with one `getHierarchyParents` call per 250 nodes (reply in input order), or, if the viewer does not answer in order, one `getHierarchyChildren(recursive)` call per element; then reads the solids' bounding boxes (`getObjectBoundingBoxes`) and unions them onto the element. Both paths and a viewer that boxes elements itself are harness-verified and give identical totals.

**Quantities, in order of preference**
- *Plan area*: `Element · Area` (AreaMeasure, m²) — for Revit floors this is the plan (sketch) area: verified against the mesh (85,137 m² from the property vs 85,090 m² from the geometry, 0.06 %). Else Volume ÷ Thickness, else half of a solid's surface area (`Geometry · Area` on Navisworks / Civil 3D solids), else bounding-box footprint (flagged **bbox**).
- *Thickness*: `Element · Thickness` / `Revit Type · Default Thickness` (mm), else Volume ÷ Area, else the bounding-box height when ≤ 0.6 m (flagged). It is the floor type's **total** thickness, all layers.
- *Volume*: `Element · Volume` (m³) for the detail CSV; the CY in the tables = plan area × **pay thickness**.
- *Curb length*: `Element · Length` (walls, slab edges, sweeps) else the horizontal diagonal of the element's bounding box (flagged **bbox**: exact for straight runs, short for curved ones).
- *Asphalt tons* = SY × pay thickness (in) × lb/SY/in (default 110) ÷ 2000. Metric: tonnes.
- Property sets that carry a *Length* that is not the element's own are skipped (`Rebar Cover · Length` = the cover setting `0' - 1"`, `Level · Computation Height`, Navisworks `3D Visualization`).

**Classification** = keyword rules (editable in the mapping card, remembered) on type + family + name + comments + layer + Revit category + the materials of the solid layers, first match wins: curb (`curb, gutter, c&g, cg-, header, ribbon…`) → sidewalk (`sidewalk, walk, path, trail, ramp…`) → slab (`slab, pad, apron, dock, foundation…`) → asphalt (`asphalt, hma, bitum, duty, pavement, paving, parking, drive, road…`) → other paving (`gravel, stone, gab, paver, brick…`). Without a keyword: Slab Edges / Wall Sweeps → curb; Structural Foundations / Pads → slab; floors with an asphalt material → asphalt, with a concrete material → slab; **in-place floor pieces with no quantities → curb** (that is what they are in Plateau's road models); anything else → Unclassified (walls, framing…). The Types tab overrides any of it.

**In-place families.** An element with a `Symbol` set whose type / family is Revit's automatic name (`Floors 286`) is an in-place family. Revit exports **no Area, Volume, Thickness or Length** for them, so they are measured from bounding boxes and grouped by their material set (`cg-6 white + Transition curb- GREY (in-place Floors)`), never by their meaningless type names. Ask the BIM team to model curb with a system family that carries Length (wall, slab edge, floor with a curb type) when exact LF matter.

## Verified on STC_W-C_RD_Z1_PEI_RD_3D (harness, 2026-11-18)

2,730 nodes, 511 elements (510 floors, 1 wall), 636 solids.

| Item | Count | Result |
|---|---|---|
| HEAVY DUTY ASPHALT (14", ASPHALT PAVEMENT + GRAVEL) | 83 | 837,185 SF = 93,021 SY, 71,626 tons at 14" pay |
| STANDARD DUTY (12", ASPHALT PAVEMENT + GRAVEL) | 30 | 61,740 SF = 6,860 SY, 4,528 tons at 12" pay |
| CONCRETE SIDEWALK (12", Concrete + GRAVEL) | 6 | 17,020 SF, 630.4 CY at 12" pay |
| Curb (391 in-place floor pieces + 1 wall, bbox diagonal) | 392 | 31,030 LF (mesh check: plan area ÷ 0.72 m width ≈ 30,400 LF; sum of diagonals from the mesh 30,940 LF) |

The 14" / 12" model thicknesses include the gravel base layer: set the asphalt pay thickness per type in the Types tab (e.g. 5" surface + binder) before quoting tons — the model does not carry per-layer thicknesses.

Run the harness yourself: `python -m http.server 8766` in this folder, open `http://127.0.0.1:8766/harness-paving.html?auto=1` (`&parents=flat` forces the children fallback, `&agg=1` boxes elements). Headless: `msedge --headless=new --dump-dom --virtual-time-budget=90000 <url>` with a fresh `--user-data-dir` prints the harness log.

## Not yet verified in real Connect

Whether `getHierarchyParents(ids, undefined, false)` really answers one entry per id in order (if not, the per-element fallback is slower: ~500 calls on this model) and whether `getObjectBoundingBoxes` boxes Revit solids (expected, as in Progress %). First real run: compare the asphalt SF with the harness numbers above; if curb LF are zero, click **Inspect selected object** on a curb piece and send the output.