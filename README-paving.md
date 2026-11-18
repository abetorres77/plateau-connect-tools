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
| `tools\TrbDump.cs`, `build-trbdump.ps1`, `TrbDump.exe` | **Geometry quantities + dumper.** Reads any `.trb` with Trimble's `Trimble.Technology.TrimBim.dll` (shipped with Trimble Connect for Windows / TBC) and writes, next to the model, `<model>.qty.json` (for the panel's *Load geometry quantities* button) and `<model>.qty.csv` (one row per element: plan area, volume, **curb centerline length**, mean width) plus the harness module. `TrbDump.exe model.trb out.js RD` — about 10 s for this 57 MB model. |
| `STC_W-C_RD_Z1_PEI_RD_3D.qty.json` / `.qty.csv` | The geometry quantities of the road model (generated 2026-11-18). |
| `trimbleconnect.workspace.api.js`, `icon.png` | Copies for the local harness (already published by the Plateau Tools deploy). |

## Using it

1. Open the project's **3D Viewer**, load the road / site model(s).
2. Click the **Plateau Tools** icon (black & gold) at the bottom of the viewer's left toolbar → **Paving & Concrete**. (Project side: the Plateau Tools dropdown has a *Paving & Concrete* entry whose "Open the 3D Viewer" button lands on it.)
3. Check the models, pick the scope (everything, or only the viewer selection) and the units, then **Run takeoff**.
4. **Summary** tab: asphalt by type & thickness (SF, SY, tons), sidewalk / slab / other paving (SF, SY, CY), curb by type (LF). Each row has an editable **Pay (in)** box (build b): type the thickness you will quote (e.g. 5 for the asphalt lifts when the model's 14 in includes the gravel base) and the tons / CY update at once; blank = the model's thickness. **Types** tab: every type found with a category dropdown (override the automatic class) and the same pay thickness box. **Detail**: one row per element with the source of each number. **Unclassified**: what was left out.
5. **Selected in viewer** card (build c): select anything in the 3D Viewer (floors, curb pieces, or their solids) and the card shows that selection's quantities live, by type, from the last run - no re-run needed. *Copy selection for Excel* copies it. The *Scope: only objects selected* option still exists for reading a selection from scratch.
6. Click any row to select those objects in the viewer (tick *Zoom to objects* in the mapping card to also fly there). **Download summary CSV / detail CSV** or **Copy summary for Excel**.

Overrides, pay thicknesses and property mappings are remembered per model set in the browser. **Inspect selected object** prints every property of one object (plus its bounding box); **Copy inventory** copies a JSON of every property key and example objects for a new model type.

## How it measures (build v2026.11.18d)

**Revit models (NWC / TrimBIM).** Only nodes with `Element · Category` are elements. A floor's geometry hangs below it (element → `Floors` container → `Solid` leaves, one per material layer with `Revit Material · Name`). The tool resolves that tree with one `getHierarchyParents` call per 250 nodes (reply in input order), or, if the viewer does not answer in order, one `getHierarchyChildren(recursive)` call per element; then reads the solids' bounding boxes (`getObjectBoundingBoxes`) and unions them onto the element. Both paths and a viewer that boxes elements itself are harness-verified and give identical totals.

**Quantities, in order of preference**
- *Plan area*: `Element · Area` (AreaMeasure, m²) — for Revit floors this is the plan (sketch) area: verified against the mesh (85,137 m² from the property vs 85,090 m² from the geometry, 0.06 %). Else Volume ÷ Thickness, else half of a solid's surface area (`Geometry · Area` on Navisworks / Civil 3D solids), else bounding-box footprint (flagged **bbox**).
- *Thickness*: `Element · Thickness` / `Revit Type · Default Thickness` (mm), else Volume ÷ Area, else the bounding-box height when ≤ 0.6 m (flagged). It is the floor type's **total** thickness, all layers.
- *Volume*: `Element · Volume` (m³) for the detail CSV; the CY in the tables = plan area × **pay thickness**.
- *Curb length*: `Element · Length` (walls, slab edges, sweeps), else the **centerline length from a loaded geometry quantities file** (source *mesh*), else the horizontal diagonal of the element's bounding box (flagged **bbox**). The diagonal is only right for a straight run: on this model it was within 2 % for long straight pieces but up to 40 % high on short pieces (the section width adds to the diagonal) and far too short for curves and runs around islands — overall 31,030 LF against 31,172 LF from the geometry, with individual pieces off both ways. **Use the geometry file whenever the curb is modelled in place.**
- *Asphalt tons* = SY × pay thickness (in) × lb/SY/in (default 110) ÷ 2000. Metric: tonnes.
- Property sets that carry a *Length* that is not the element's own are skipped (`Rebar Cover · Length` = the cover setting `0' - 1"`, `Level · Computation Height`, Navisworks `3D Visualization`).

**Classification** = keyword rules (editable in the mapping card, remembered) on type + family + name + comments + layer + Revit category + the materials of the solid layers, first match wins: curb (`curb, gutter, c&g, cg-, header, ribbon…`) → sidewalk (`sidewalk, walk, path, trail, ramp…`) → slab (`slab, pad, apron, dock, foundation…`) → asphalt (`asphalt, hma, bitum, duty, pavement, paving, parking, drive, road…`) → other paving (`gravel, stone, gab, paver, brick…`). Without a keyword: Slab Edges / Wall Sweeps → curb; Structural Foundations / Pads → slab; floors with an asphalt material → asphalt, with a concrete material → slab; **in-place floor pieces with no quantities → curb** (that is what they are in Plateau's road models); anything else → Unclassified (walls, framing…). The Types tab overrides any of it.

### Geometry quantities (TrbDump, build d)

Trimble Connect's viewer API exposes properties and bounding boxes, never the mesh, so exact lengths of in-place curb must come from the model file. `TrbDump.exe` reads the `.trb` (the format Connect converts every upload to; *Export as TrimBIM* in Connect for Windows, or Plateau's NWC → TrimBIM converter) and, per solid: plan area and volume from the faces (Newell normals), and the **curb centerline**: the plan footprint is rasterised (2 cm cells, up to 8,000 per side), thinned to its skeleton (Zhang-Suen), traced into chains, simplified (Douglas-Peucker, 1 cell) and summed; thinning pulls each end in by half the width, so the width is solved from footprint = w (L + ends w / 2) and the length is footprint / w. Verified on the road model: 175 of 391 pieces come out at exactly 30" wide (the cg-6 curb & gutter section), 32 at 6" (vertical curb), straight runs match their bounding-box diagonal within 2 % (1,445 vs 1,447 ft on the longest run), and the two 6" runs read 982 ft against a 965 ft diagonal. Wide slabs are skipped (no centerline). The raster area equals the Revit Area within 0.03 % on the system floors.

Workflow: run `TrbDump.exe <model>.trb <anything>.js` (or just the harness command) → click **Load geometry quantities** in the panel and pick `<model>.qty.json` → every in-place piece gets its exact plan area, volume and centerline length (source *mesh*), the Section column shows the mesh width snapped to 6", and the file is remembered per model set in the browser (**Forget** clears it). Elements are matched by `Element · IfcGUID`, else Element Id, so the same file works for any later export of the same Revit model. `<model>.qty.csv` has the same numbers for Excel.

**In-place families.** An element with a `Symbol` set whose type / family is Revit's automatic name (`Floors 286`) is an in-place family. Revit exports **no Area, Volume, Thickness or Length** for them, so they are measured from bounding boxes and grouped by their material set (`cg-6 white + Transition curb- GREY (in-place Floors)`), never by their meaningless type names. Ask the BIM team to model curb with a system family that carries Length (wall, slab edge, floor with a curb type) when exact LF matter.

## Verified on STC_W-C_RD_Z1_PEI_RD_3D (harness, 2026-11-18)

2,730 nodes, 511 elements (510 floors, 1 wall), 636 solids.

| Item | Count | Result |
|---|---|---|
| HEAVY DUTY ASPHALT (14", ASPHALT PAVEMENT + GRAVEL) | 83 | 837,185 SF = 93,021 SY, 71,626 tons at 14" pay |
| STANDARD DUTY (12", ASPHALT PAVEMENT + GRAVEL) | 30 | 61,740 SF = 6,860 SY, 4,528 tons at 12" pay |
| CONCRETE SIDEWALK (12", Concrete + GRAVEL) | 6 | 17,020 SF, 630.4 CY at 12" pay |
| Curb, bounding-box diagonal (no geometry file) | 392 | 31,030 LF — per-piece errors both ways, see above |
| Curb, geometry file loaded (centerline) | 392 | **31,172 LF** + 127 LF for the wall (31,299 in the panel): 30" curb & gutter 28,239 LF (323 pieces), 6" curb 2,876 LF (45 pieces), 23 transition pieces |

The 14" / 12" model thicknesses include the gravel base layer: type the asphalt pay thickness in the row's Pay box (e.g. 5" surface + binder) before quoting tons — the model does not carry per-layer thicknesses.

Run the harness yourself: `python -m http.server 8766` in this folder, open `http://127.0.0.1:8766/harness-paving.html?auto=1` (`&parents=flat` forces the children fallback, `&agg=1` boxes elements). Headless: `msedge --headless=new --dump-dom --virtual-time-budget=90000 <url>` with a fresh `--user-data-dir` prints the harness log.

## Not yet verified in real Connect

Whether `getHierarchyParents(ids, undefined, false)` really answers one entry per id in order (if not, the per-element fallback is slower: ~500 calls on this model) and whether `getObjectBoundingBoxes` boxes Revit solids (expected, as in Progress %). First real run: compare the asphalt SF with the harness numbers above; if curb LF are zero, click **Inspect selected object** on a curb piece and send the output.