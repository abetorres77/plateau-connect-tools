# PEI Color & Dates

Trimble Connect 3D Viewer tool (build v2026.11.19a). Sixth tool of the Plateau Tools extension, menu item **Color & Dates**.
Modelled on Construsoft's "Color Models Extension for Trimble Connect" (https://marketplace.trimble.com/en/product/650979), plus installation dates saved in the Connect project.

## Files in this folder

| File | Purpose | Published |
|---|---|---|
| `install.html` | the tool (single page) | yes |
| `manifest-install.json` | stand-alone install manifest (3D Viewer panel) | yes |
| `README-install.md` | this file | yes |
| `deploy.ps1` | publishes the three files above to GitHub Pages (`abetorres77/plateau-connect-tools`) | no |
| `harness-install.html` | offline test host (fake viewer + fake Connect services) | no |
| `trimbleconnect.workspace.api.js`, `icon.png` | copies so the harness runs from this folder; the published copies come from the Trimble Connect folder | no |

The menu entry lives in `Y:\Private\abe.torres\Claude Drive\Trimble Connect\index.html` (launcher button, project menu item `install`, "Open the 3D Viewer" card). Publishing the tool therefore takes two deploys: this folder's `deploy.ps1` and the Trimble Connect folder's `deploy.ps1`.

## Installation dates tab

1. Select objects in the viewer.
2. Pick the date, Installed or Planned, optional note.
3. **Save date to selection**. **Clear date on selection** removes it. **Reload from Connect** reads the saved dates again.

Where the date goes: Trimble Connect's Property Set service.

- One library per project: id `pei-install-<projectId>`, name "PEI Install Tracking".
- One definition `installation` ("PEI Installation"): Installation Date, Status, Note, Object, Model, Object ID.
- One property set per object, linked as `frn:entity:<permanent object id>`.
- The first save creates the library, sets a policy that lets every project member read and write, and registers the library with the project (Organizer tree `ProjectContext`, node `PSetLibs`) so Connect's own Properties panel can list it. **A project admin has to do that first save.**
- Revit exports: the viewer selects the `Solid` leaves; the tool walks up to the element (`Element · Category`) and stores the date there.

**Color model** paints by Installed / planned, month or week. Dates after the *As of* day count as planned. *Grey out objects without a date* dims everything else. The legend rows and the table rows select the objects; **CSV** exports the table.

Colors are painted from the saved dates each time. They are not stored in the model.

## Color by property tab

1. **Read model properties** scans every object of the loaded models.
2. Pick a property; each value gets a color (click a swatch to change it).
3. **Color model**.

**Export colors (CSV)** / **Import colors (CSV)**: a value column and a `#RRGGBB` column, so the list can be edited in Excel. The mapping is remembered per property in the browser.

## Test offline

```
cd "Y:\Private\abe.torres\Claude Drive\Color by property"
python -m http.server 8791
```

Open `http://127.0.0.1:8791/harness-install.html?auto=1`. The harness runs the whole script and logs it (fake viewer with a Revit-style model and a flat Civil 3D model, in-memory fake property-set / organizer services). `&member=1` = the library already exists and deletes are refused.

## Not yet verified in real Connect

- That the extension's access token is accepted by pset-api / org-api.
- The id format `convertToObjectIds` returns (the tool compresses 36-character GUIDs to the 22-character IFC form for .ifc models only).
- That the set shows in Connect's native Properties panel.
- That `setObjectState` with `recursive: true` colors the geometry under a Revit element (the date coloring also passes the child ids explicitly; the property coloring relies on `recursive`).
- Licence: Connect's own UI needs Business Premium to apply property sets.
- Dates follow the object's permanent id; a new model version that changes ids loses them.
