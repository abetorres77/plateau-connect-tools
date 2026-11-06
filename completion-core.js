// completion-core.js - proposed vs as-built completion logic shared by completion.html (Trimble Connect 3D Viewer tool)
// and the harness. Pure functions, no DOM. Mirrors ModelCompletion (the desktop exe) so both give the same numbers.
// Reads Civil 3D (NWC/DWG) models through their Civil3D properties and Revit (NWC) models through the element nodes
// that carry an "Element" property set (build v2026.11.06b).
export const VERSION = "v2026.11.06c";

const GROUP_TYPES = /^(file|layer|lcoapartition|block|insert|category|family|type|levels?:?.*|group|collection|)$/i;
const GEOM_TYPES = /^(pipe|pressure pipe|structure|fitting|appurtenance|3d solid|solid)$/i;
const NETWORK_TYPES = /^(pipe|pressure pipe|structure)$/i;
// Revit categories (Element · Category) and what they count as
const REVIT_PIPE = /^(pipes|pipe placeholders|conduits|ducts)$/i;
const REVIT_FITTING = /^(pipe fittings|pipe accessories|conduit fittings|duct fittings)$/i;
const REVIT_INSULATION = /^(pipe insulations?|duct insulations?|duct linings?)$/i;
export const REVIT_STRUCTURE = /^(generic models|mechanical equipment|plumbing fixtures|specialty equipment|structural foundations|site)$/i;
const REVIT_IGNORE = /^(center ?lines?|lines|detail items|levels|grids|cameras|views|reference planes|imports in families)$/i;

/** Only pipe-network objects count: pipes (incl. pressure pipes) and structures. Fittings, insulation, centre lines, solids, blocks and layers are ignored. */
export function isNetworkObject(m) { return NETWORK_TYPES.test(m.type) || (/^object$/i.test(m.type) && m.isPipeLike && m.hasEnds); }

export function normalize(s) {
  if (s == null) return "";
  s = String(s).replace(/''/g, '"').replace(/[\r\n\t]/g, " ");
  while (s.includes("  ")) s = s.replace("  ", " ");
  return s.trim().toUpperCase();
}

export function flatten(op) {
  const flat = new Map();
  for (const ps of (op.properties || [])) {
    const setName = ps.name || "Properties";
    for (const p of (ps.properties || [])) {
      if (!p || p.name == null) continue;
      if (p.value === null || p.value === undefined || p.value === "") continue;
      const key = setName + " · " + p.name;
      if (!flat.has(key)) flat.set(key, { v: p.value, t: p.type, set: setName, name: p.name });
    }
  }
  return flat;
}

// first property whose name matches one of the given names (exact, case-insensitive); Civil3D set preferred
function pick(flat, names) {
  const want = names.map(n => n.toLowerCase());
  let best = null;
  for (const e of flat.values()) {
    const i = want.indexOf(String(e.name).toLowerCase());
    if (i < 0) continue;
    const score = i * 10 + (/^civil ?3d$/i.test(e.set) ? 0 : 5);
    if (!best || score < best.score) best = { score, e };
  }
  return best ? best.e : null;
}

function str(flat, names) { const e = pick(flat, names); return e ? String(e.v) : ""; }

// numeric property in feet: LengthMeasure (t=0) arrives in mm; everything else is in model units (feet for Plateau work)
function num(flat, names, unitM) {
  const e = pick(flat, names);
  if (!e) return NaN;
  let v = e.v;
  if (typeof v === "string") { const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/); if (!m) return NaN; v = parseFloat(m[0]); }
  if (typeof v !== "number" || isNaN(v)) return NaN;
  if (e.t === 0) return v / 1000 / unitM;
  return v;
}

// ---- Revit helpers: property pinned to its set (dozens of Revit sets carry a Name / Type / Category)
const sget = (flat, set, name) => flat.get(set + " · " + name) || null;
const sstr = (flat, set, name) => { const e = sget(flat, set, name); return e ? String(e.v) : ""; };
function snum(flat, set, name, unitM) {
  const e = sget(flat, set, name); if (!e) return NaN;
  let v = e.v;
  if (typeof v === "string") { const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/); if (!m) return NaN; v = parseFloat(m[0]); }
  if (typeof v !== "number" || isNaN(v)) return NaN;
  return e.t === 0 ? v / 1000 / unitM : v;
}
/** Revit model = its objects carry an "Element" property set (Revit -> NWC -> TrimBIM). */
export function isRevitModel(objs) { return (objs || []).some(op => (op.properties || []).some(ps => ps && ps.name === "Element")); }
export function revitCategory(op) { return sstr(flatten(op), "Element", "Category"); }
const cleanSize = s => String(s || "").trim().replace(/[o\u00F8\u00D8\s]+$/, "");

function finish(it) {
  it.isPipeLike = /^(pipe|pressure pipe)$/i.test(it.type) || (it.hasEnds && it.len > 0);
  it.nameKey = it.nameIsGeneric ? "" : normalize(it.name);
  it.category = it.type + (it.layer ? " / " + it.layer : "");
  it.sizeKey = normalize(it.desc) || normalize(it.partSize) || "(no size)";
  it.hasLocation = it.hasEnds || it.hasPos || it.hasCenter;
  it.midX = it.hasEnds ? (it.sx + it.ex) / 2 : (it.hasPos ? it.px : it.cx);
  it.midY = it.hasEnds ? (it.sy + it.ey) / 2 : (it.hasPos ? it.py : it.cy);
  return it;
}

/**
 * One Revit element node -> item. Pipes: ends from the bounding box (centre ± half the length along the box diagonal;
 * a sloped box has two possible diagonals, so the other one is kept in altEnds). Structures: centre of the bounding box.
 */
function parseRevit(op, flat, opts, unitM, box) {
  const cat = sstr(flat, "Element", "Category");
  if (!cat) return null;                                  // file / level / category / family / type / solid nodes
  let type;
  if (REVIT_PIPE.test(cat)) type = "Pipe";
  else if (REVIT_FITTING.test(cat)) type = "Fitting";
  else if (REVIT_INSULATION.test(cat)) type = "Insulation";
  else if (REVIT_STRUCTURE.test(cat)) type = "Structure";
  else type = cat;
  const prod = op.product || {};
  const typeName = sstr(flat, "Element", "Type") || sstr(flat, "Revit Type", "Name");
  const family = sstr(flat, "Element", "Family") || sstr(flat, "Symbol", "FamilyName");
  const elementName = sstr(flat, "Element", "Name") || sstr(flat, "Element Properties", "Name") || prod.name || "";
  const mark = sstr(flat, "Element", "Mark");
  const elementId = sstr(flat, "Element", "Id") || sstr(flat, "Id", "IntegerValue") || sstr(flat, "Element ID", "Value");
  const it = {
    id: op.id, modelId: opts && opts.modelId, cls: op.class || "", source: "Revit",
    name: "", nameIsGeneric: false, type, layer: cat, desc: "", partSize: "",
    guid: sstr(flat, "Element", "IfcGUID"),
    material: sstr(flat, "Pipe Segment", "Name") || sstr(flat, "PipeSegment", "Name") || sstr(flat, "Revit Material", "Name"),
    network: sstr(flat, "Element", "System Name") || sstr(flat, "MEPSystem", "Name"),
    len: NaN, hasEnds: false, hasPos: false, hasCenter: false, altEnds: null,
    sx: 0, sy: 0, sz: 0, ex: 0, ey: 0, ez: 0, px: 0, py: 0, pz: 0, cx: 0, cy: 0, cz: 0, flat
  };
  if (type === "Pipe") {
    let size = cleanSize(sstr(flat, "Element", "Size"));
    if (!size) { const d = sget(flat, "Element", "Diameter"); if (d && typeof d.v === "number" && d.v > 0) size = (d.t === 0 ? d.v / 25.4 : d.v).toFixed(2).replace(/\.?0+$/, "") + '"'; }
    it.partSize = size;
    it.desc = (size + " " + (typeName || elementName)).trim();
    // Revit pipes have no instance name unless a Mark was entered; the type name (RCP, HDPE) is shared by every pipe of that type
    if (mark) it.name = mark; else { it.name = ((typeName || elementName) + (elementId ? " #" + elementId : "")).trim(); it.nameIsGeneric = true; }
    // Element · Length: a length value (t=0) is mm; Revit 2025 exports it that way, older NWC exports carry a plain number in mm,
    // Revit 2023 a text in model units. Keep the candidates and let the bounding box decide below.
    const le = sget(flat, "Element", "Length");
    if (le) {
      let v = le.v;
      if (typeof v === "string") { const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/); v = m ? parseFloat(m[0]) : NaN; }
      if (typeof v === "number" && v > 0) {
        const mm = v / 1000 / unitM, units = v;
        it.lenCands = le.t === 0 ? [mm] : (typeof le.v === "string" ? [units, mm] : [mm, units]);
        it.len = it.lenCands[0];
      }
    }
  } else {
    const nm = mark || elementName || prod.name || typeName;
    it.name = nm;
    it.desc = typeName && typeName.toUpperCase() !== nm.toUpperCase() ? typeName : (family && family.toUpperCase() !== nm.toUpperCase() ? family : "");
    it.partSize = cleanSize(sstr(flat, "Element", "Size"));
  }
  if (box) {
    it.cx = (box.min.x + box.max.x) / 2 / unitM; it.cy = (box.min.y + box.max.y) / 2 / unitM; it.cz = (box.min.z + box.max.z) / 2 / unitM; it.hasCenter = true;
    if (type === "Pipe") {
      const ex = (box.max.x - box.min.x) / unitM, ey = (box.max.y - box.min.y) / unitM, lb = Math.hypot(ex, ey);
      if (lb > 0.05) {
        if (it.lenCands && it.lenCands.length > 1) it.len = it.lenCands.reduce((b, c) => Math.abs(Math.log(c / lb)) < Math.abs(Math.log(b / lb)) ? c : b);
        const lh = !isNaN(it.len) && it.len > 0 ? Math.min(lb, it.len) : lb;   // the box may include the pipe body; never longer than the pipe
        const ux = ex / lb, uy = ey / lb;
        it.hasEnds = true; it.sz = it.cz; it.ez = it.cz;
        it.sx = it.cx - ux * lh / 2; it.sy = it.cy - uy * lh / 2; it.ex = it.cx + ux * lh / 2; it.ey = it.cy + uy * lh / 2;
        if (ex > 0.2 && ey > 0.2) it.altEnds = [it.cx - ux * lh / 2, it.cy + uy * lh / 2, it.cx + ux * lh / 2, it.cy - uy * lh / 2];
        if (isNaN(it.len) || it.len <= 0) it.len = lh;
      }
    }
  }
  if (!it.hasEnds && it.hasCenter) { it.hasPos = true; it.px = it.cx; it.py = it.cy; it.pz = it.cz; }
  return finish(it);
}

/**
 * Turn getObjectProperties results into comparison items.
 * objs: [{id, class, product:{name,objectType,description}, properties:[...]}]
 * opts: { modelId, unitM (metres per model foot), boxes: Map(id -> {min:{x,y,z}, max:{x,y,z}} in metres), revit (bool, auto) }
 */
export function parseObjects(objs, opts) {
  const unitM = (opts && opts.unitM) || 1200 / 3937;
  const boxes = (opts && opts.boxes) || new Map();
  const revit = opts && opts.revit != null ? !!opts.revit : isRevitModel(objs);
  const items = [];
  for (const op of (objs || [])) {
    const flat = flatten(op);
    if (revit) { const it = parseRevit(op, flat, opts, unitM, boxes.get(op.id)); if (it) items.push(it); continue; }
    const prod = op.product || {};
    let type = prod.objectType || "";
    const objType = str(flat, ["Information:General Object Type", "Internal Type"]);
    const hasCivil = [...flat.keys()].some(k => /^civil ?3d · /i.test(k));
    if (!type) {
      if (/pipe/i.test(objType)) type = /pressure/i.test(objType) ? "Pressure Pipe" : "Pipe";
      else if (/structure/i.test(objType)) type = "Structure";
      else if (/fitting/i.test(objType)) type = "Fitting";
      else if (hasCivil) type = "Object";
    }
    const box = boxes.get(op.id);
    if (!hasCivil && !GEOM_TYPES.test(type) && !box) continue;           // hierarchy / layer / block nodes
    if (GROUP_TYPES.test(type) && !hasCivil && !box) continue;

    const it = {
      id: op.id, modelId: opts && opts.modelId, cls: op.class || "", source: "Civil3D",
      name: str(flat, ["Information:Name"]) || prod.name || "", nameIsGeneric: false,
      type, layer: str(flat, ["General:Layer name", "Layer"]),
      desc: str(flat, ["Information:Description"]) || prod.description || str(flat, ["Description"]),
      partSize: str(flat, ["General:Part Size Name"]),
      material: str(flat, ["Part Data:Material", "General:Material"]),
      network: str(flat, ["General:Network name", "General:Pressure Part Network Name", "General:Pressure Network name"]),
      guid: "", len: NaN, hasEnds: false, hasPos: false, hasCenter: false, altEnds: null,
      sx: 0, sy: 0, sz: 0, ex: 0, ey: 0, ez: 0, px: 0, py: 0, pz: 0, cx: 0, cy: 0, cz: 0, flat
    };
    const sx = num(flat, ["Geometry:Pipe Start Easting", "Geometry:Start Easting"], unitM), sy = num(flat, ["Geometry:Pipe Start Northing", "Geometry:Start Northing"], unitM);
    const ex = num(flat, ["Geometry:Pipe End Easting", "Geometry:End Easting"], unitM), ey = num(flat, ["Geometry:Pipe End Northing", "Geometry:End Northing"], unitM);
    if (![sx, sy, ex, ey].some(isNaN)) {
      it.hasEnds = true; it.sx = sx; it.sy = sy; it.ex = ex; it.ey = ey;
      it.sz = num(flat, ["Geometry:Start Invert Elevation", "Geometry:Start Centerline Elevation"], unitM) || 0;
      it.ez = num(flat, ["Geometry:End Invert Elevation", "Geometry:End Centerline Elevation"], unitM) || 0;
    }
    const len = num(flat, ["Geometry:3D Length", "Geometry:Pipe Length 3D", "Geometry:2D Length", "Geometry:Pipe Chord Length", "Length"], unitM);
    if (!isNaN(len) && len > 0) it.len = len;
    else if (it.hasEnds) it.len = Math.sqrt((it.ex - it.sx) ** 2 + (it.ey - it.sy) ** 2 + (it.ez - it.sz) ** 2);

    if (box) {
      it.cx = (box.min.x + box.max.x) / 2 / unitM; it.cy = (box.min.y + box.max.y) / 2 / unitM; it.cz = (box.min.z + box.max.z) / 2 / unitM; it.hasCenter = true;
    }
    const px = num(flat, ["Geometry:Structure Easting", "Geometry:Insertion Point Easting"], unitM), py = num(flat, ["Geometry:Structure Northing", "Geometry:Insertion Point Northing"], unitM);
    if (!isNaN(px) && !isNaN(py)) {
      it.hasPos = true; it.px = px; it.py = py;
      it.pz = num(flat, ["Insertion Rim Behavior:Insertion Rim Elevation", "Geometry:Insertion Point Elevation"], unitM) || 0;
    } else if (!it.hasEnds && it.hasCenter) { it.hasPos = true; it.px = it.cx; it.py = it.cy; it.pz = it.cz; }
    items.push(finish(it));
  }
  return items;
}

/** objects that need a bounding box to get a location (no Civil 3D coordinates). In a Revit model only the countable element nodes. */
export function needsBox(op, revit) {
  const flat = flatten(op);
  if (revit) {
    const cat = sstr(flat, "Element", "Category");
    return !!cat && !REVIT_INSULATION.test(cat) && !REVIT_FITTING.test(cat) && !REVIT_IGNORE.test(cat);
  }
  const type = (op.product && op.product.objectType) || "";
  if (GROUP_TYPES.test(type) && !GEOM_TYPES.test(type)) return false;
  const hasCoord = [...flat.values()].some(e => /(easting|northing)/i.test(e.name));
  return !hasCoord;
}

// ---------------- matching ----------------
export function typeGroup(m) {
  if (m.isPipeLike) return "PIPE";
  if (/^(structure|3d solid|solid)$/i.test(m.type)) return "STRUCT";
  return String(m.type).toUpperCase();
}
function pointToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, len2 = vx * vx + vy * vy;
  let t = len2 <= 1e-12 ? 0 : ((px - ax) * vx + (py - ay) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * vx, cy = ay + t * vy;
  return Math.hypot(px - cx, py - cy);
}
const endsOf = m => m.altEnds ? [[m.sx, m.sy, m.ex, m.ey], m.altEnds] : [[m.sx, m.sy, m.ex, m.ey]];
/** worst of the two as-built end points measured to the proposed pipe; the best of the possible box diagonals when ends came from a bounding box */
export function pipeFit(p, a) {
  let best = Infinity;
  for (const P of endsOf(p)) for (const A of endsOf(a)) {
    const d = Math.max(pointToSegment(A[0], A[1], P[0], P[1], P[2], P[3]), pointToSegment(A[2], A[3], P[0], P[1], P[2], P[3]));
    if (d < best) best = d;
  }
  return best;
}
export function distance(p, a) {
  if (!p.hasLocation || !a.hasLocation) return 0;
  if (p.isPipeLike && a.isPipeLike && p.hasEnds && a.hasEnds) return pipeFit(p, a);
  return Math.hypot(p.midX - a.midX, p.midY - a.midY);
}
function nameAllowance(p, tol) { const len = p.isPipeLike && !isNaN(p.len) ? p.len : 0; return Math.max(25 * tol, len + 10 * tol); }

function newGroup(key) { return { key, count: 0, complete: 0, partial: 0, notStarted: 0, proposedLen: 0, installedLen: 0, progressSum: 0 }; }
function addTo(g, r) {
  g.count++; if (r.status === "Complete") g.complete++; else if (r.status === "Partial") g.partial++; else g.notStarted++;
  g.proposedLen += r.proposedLen; g.installedLen += Math.min(r.installedLen, r.proposedLen > 0 ? r.proposedLen : r.installedLen); g.progressSum += r.progress;
}
export const pctByCount = g => g.count ? 100 * g.complete / g.count : 0;
export const pctWeighted = g => g.count ? 100 * g.progressSum / g.count : 0;
export const pctByLength = g => g.proposedLen > 0 ? Math.min(100, 100 * g.installedLen / g.proposedLen) : NaN;
const sizeSort = s => { const m = String(s).match(/^(\d+(\.\d+)?)/); return m ? parseFloat(m[1]) : 1e9; };

export function compare(proposed, asBuilt, opt) {
  const tol = opt.toleranceFt || 3, inc = opt.includedCategories || null;
  const scope = [], excluded = [], ignored = proposed.filter(p => !isNetworkObject(p));
  for (const p of proposed) { if (!isNetworkObject(p)) continue; (inc && !inc.has(p.category) ? excluded : scope).push(p); }
  const asBuiltAll = asBuilt; asBuilt = asBuilt.filter(isNetworkObject);
  const results = new Map(), items = [];
  for (const p of scope) { const r = { proposed: p, asBuilt: [], method: "", proposedLen: p.isPipeLike && !isNaN(p.len) ? p.len : 0, installedLen: 0, progress: 0, status: "Not Started", dist: NaN }; results.set(p, r); items.push(r); }
  const used = new Set();

  // pass 0: Revit keeps the IfcGUID of an element across exports - same GUID in both models = the same object
  const byGuid = new Map();
  for (const p of scope) { if (!p.guid) continue; if (!byGuid.has(p.guid)) byGuid.set(p.guid, []); byGuid.get(p.guid).push(p); }
  if (byGuid.size) for (const a of asBuilt) {
    if (!a.guid) continue;
    const cands = byGuid.get(a.guid); if (!cands) continue;
    let best = null, bestD = Infinity;
    for (const p of cands) { if (typeGroup(p) !== typeGroup(a)) continue; const d = distance(p, a); if (d <= nameAllowance(p, tol) && d < bestD) { bestD = d; best = p; } }
    if (best) { const r = results.get(best); r.asBuilt.push(a); r.method = "GUID"; r.dist = isNaN(r.dist) ? bestD : Math.max(r.dist, bestD); used.add(a); }
  }
  // pass 1: same name (and kind), close enough to be the same object
  const byName = new Map();
  for (const p of scope) { if (!p.nameKey) continue; const k = typeGroup(p) + "|" + p.nameKey; if (!byName.has(k)) byName.set(k, []); byName.get(k).push(p); }
  for (const a of asBuilt) {
    if (used.has(a) || !a.nameKey) continue;
    const cands = byName.get(typeGroup(a) + "|" + a.nameKey); if (!cands) continue;
    let best = null, bestD = Infinity;
    for (const p of cands) { const d = distance(p, a); if (d <= nameAllowance(p, tol) && d < bestD) { bestD = d; best = p; } }
    if (best) { const r = results.get(best); r.asBuilt.push(a); if (!r.method) r.method = "Name"; r.dist = isNaN(r.dist) ? bestD : Math.max(r.dist, bestD); used.add(a); }
  }
  // pass 2: location for whatever is left
  const pipes = scope.filter(p => p.isPipeLike && p.hasEnds), points = scope.filter(p => !p.isPipeLike && p.hasLocation);
  for (const a of asBuilt) {
    if (used.has(a) || !a.hasLocation) continue;
    let best = null, bestD = Infinity;
    if (a.isPipeLike && a.hasEnds) {
      for (const p of pipes) { if (typeGroup(p) !== typeGroup(a)) continue; const d = pipeFit(p, a); if (d <= tol && d < bestD) { bestD = d; best = p; } }
    } else if (!a.isPipeLike) {
      for (const p of points) { if (typeGroup(p) !== typeGroup(a) || results.get(p).asBuilt.length) continue; const d = distance(p, a); if (d <= tol && d < bestD) { bestD = d; best = p; } }
    }
    if (best) { const r = results.get(best); r.asBuilt.push(a); if (!r.method) r.method = "Location"; r.dist = isNaN(r.dist) ? bestD : Math.max(r.dist, bestD); used.add(a); }
  }
  const asBuiltOnly = asBuilt.filter(a => !used.has(a));

  // a matched object is complete; lengths are never compared (design length only weights the LF figures)
  for (const r of items) {
    const done = r.asBuilt.length > 0;
    r.progress = done ? 1 : 0; r.status = done ? "Complete" : "Not Started"; r.installedLen = done ? r.proposedLen : 0;
  }
  const overall = newGroup("All included items"), pipesG = newGroup("Pipes"), pointsG = newGroup("Structures");
  const cat = new Map(), size = new Map();
  for (const r of items) {
    addTo(overall, r); addTo(r.proposed.isPipeLike ? pipesG : pointsG, r);
    if (!cat.has(r.proposed.category)) cat.set(r.proposed.category, newGroup(r.proposed.category)); addTo(cat.get(r.proposed.category), r);
    if (r.proposed.isPipeLike) { if (!size.has(r.proposed.sizeKey)) size.set(r.proposed.sizeKey, newGroup(r.proposed.sizeKey)); addTo(size.get(r.proposed.sizeKey), r); }
  }
  const res = {
    options: { toleranceFt: tol, includedCategories: inc }, items, asBuiltOnly, excluded, ignored, asBuiltIgnored: asBuiltAll.length - asBuilt.length,
    overall, pipes: pipesG, points: pointsG,
    byCategory: [...cat.values()].sort((a, b) => a.key.localeCompare(b.key)),
    bySize: [...size.values()].sort((a, b) => sizeSort(a.key) - sizeSort(b.key) || a.key.localeCompare(b.key)),
    proposedCount: proposed.length, asBuiltCount: asBuiltAll.length,
    modelProposedCount: scope.length, modelAsBuiltCount: asBuilt.length
  };
  res.modelPctByCount = res.modelProposedCount ? 100 * res.modelAsBuiltCount / res.modelProposedCount : NaN;
  return res;
}
// ---------------- reporting ----------------
export const pct = v => (v == null || isNaN(v)) ? "-" : v.toFixed(1) + "%";
export const lenF = v => (v == null || isNaN(v)) ? "" : v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = (v, d) => (v == null || isNaN(v)) ? "" : Number(v).toFixed(d);
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const csvq = s => { s = String(s == null ? "" : s); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const prop = (m, name) => { for (const e of m.flat.values()) if (e.name === name) return String(e.v); return ""; };
export const asBuiltNames = r => r.asBuilt.map(a => a.name).join("; ");
export const startStruct = p => prop(p, "Geometry:Start Structure");
export const endStruct = p => prop(p, "Geometry:End Structure");

export function textSummary(r, meta) {
  const L = [];
  L.push("Proposed : " + (meta.proposedName || "") + "  (" + r.proposedCount + " objects, " + r.items.length + " in scope)");
  L.push("As-built : " + (meta.asBuiltName || "") + "  (" + r.asBuiltCount + " objects)");
  L.push("Tolerance: " + r.options.toleranceFt + " ft   (a matched object is complete; lengths are not compared)");
  L.push("");
  L.push("OVERALL COMPLETION (by item count): " + pct(pctByCount(r.overall)));
  L.push("  Items complete " + r.overall.complete + " / " + r.overall.count + ", not started " + r.overall.notStarted);
  L.push("  Pipe complete by design length " + lenF(r.pipes.installedLen) + " / " + lenF(r.pipes.proposedLen) + " LF (" + pct(pctByLength(r.pipes)) + ")");
  L.push("  Structures complete " + r.points.complete + " / " + r.points.count + " (" + pct(pctByCount(r.points)) + ")");
  L.push("  As-built objects with no proposed counterpart: " + r.asBuiltOnly.length);
  L.push("  Ignored (not pipes or structures): " + r.ignored.length + " proposed, " + r.asBuiltIgnored + " as-built");
  L.push("");
  L.push("BY CATEGORY");
  for (const g of r.byCategory) L.push("  " + g.key.padEnd(40) + " " + g.complete + "/" + g.count + " complete (" + pct(pctByCount(g)) + ")" + (g.proposedLen > 0 ? ", " + lenF(g.installedLen) + "/" + lenF(g.proposedLen) + " LF (" + pct(pctByLength(g)) + ")" : ""));
  L.push("");
  L.push("BY PIPE SIZE");
  for (const g of r.bySize) L.push("  " + g.key.padEnd(40) + " " + g.complete + "/" + g.count + " complete, " + lenF(g.installedLen) + "/" + lenF(g.proposedLen) + " LF (" + pct(pctByLength(g)) + ")");
  return L.join("\n");
}

/** rows for Copy-for-Excel / summary CSV */
export function summaryRows(r) {
  const row = (grp, g) => [grp, g.key, g.count, g.complete, g.notStarted, n2(pctByCount(g), 1), n2(g.proposedLen, 2), n2(g.installedLen, 2), n2(pctByLength(g), 1)];
  const rows = [["Group", "Key", "Items", "Complete", "Not Started", "Pct By Count", "Design LF", "Complete LF", "Pct By Length"]];
  rows.push(row("Overall", r.overall), row("Overall", r.pipes), row("Overall", r.points));
  for (const g of r.byCategory) rows.push(row("Category", g));
  for (const g of r.bySize) rows.push(row("Pipe size", g));
  return rows;
}

export function itemsCsv(r) {
  const L = ["Status,Type,Name,Description,Part Size,Layer,Network,Design LF,Matched As-Built,Match Method,Match Dist ft,Start Structure,End Structure,Easting,Northing"];
  for (const it of r.items) {
    const p = it.proposed;
    L.push([it.status, p.type, p.name, p.desc, p.partSize, p.layer, p.network, p.isPipeLike ? n2(it.proposedLen, 2) : "",
      asBuiltNames(it), it.method, n2(it.dist, 2), startStruct(p), endStruct(p), n2(p.midX, 2), n2(p.midY, 2)].map(csvq).join(","));
  }
  L.push(""); L.push("AS-BUILT ONLY (no proposed counterpart)"); L.push("Type,Name,Description,Part Size,Layer,Easting,Northing");
  for (const a of r.asBuiltOnly) L.push([a.type, a.name, a.desc, a.partSize, a.layer, n2(a.midX, 2), n2(a.midY, 2)].map(csvq).join(","));
  return L.join("\r\n");
}

export function htmlReport(r, meta) {
  const bar = v => isNaN(v) ? '<span class="muted">n/a</span>' : '<div class="bar"><div class="fill" style="width:' + Math.round(Math.max(0, Math.min(100, v))) + '%"></div><span>' + pct(v) + "</span></div>";
  const tile = (t, big, sub) => '<div class="tile"><div class="sub">' + esc(t) + '</div><div class="big">' + esc(big) + '</div><div class="sub">' + esc(sub) + "</div></div>";
  const grow = g => "<tr><td>" + esc(g.key) + '</td><td class=num>' + g.count + '</td><td class=num>' + g.complete + '</td><td class=num>' + g.notStarted + "</td><td>" + bar(pctByCount(g)) + '</td><td class=num>' + (g.proposedLen > 0 ? lenF(g.proposedLen) : "") + '</td><td class=num>' + (g.proposedLen > 0 ? lenF(g.installedLen) : "") + "</td><td>" + (g.proposedLen > 0 ? bar(pctByLength(g)) : "") + "</td></tr>";
  const ghead = k => "<tr><th>" + k + "</th><th class=num>Items</th><th class=num>Complete</th><th class=num>Not started</th><th>% complete</th><th class=num>Design LF</th><th class=num>Complete LF</th><th>% by length</th></tr>";
  let h = '<!doctype html><html><head><meta charset="utf-8"><title>Model Completion Report</title><style>' +
    "body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#1b1f23;background:#fff}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid #d0d7de;padding-bottom:4px}" +
    ".meta{color:#57606a;font-size:13px}table{border-collapse:collapse;font-size:13px;margin-top:6px}th,td{border:1px solid #d8dee4;padding:4px 8px;text-align:left;vertical-align:top}th{background:#f6f8fa}td.num,th.num{text-align:right}" +
    ".tiles{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}.tile{border:1px solid #d0d7de;border-radius:8px;padding:12px 18px;min-width:220px}.tile .big{font-size:34px;font-weight:600}.tile .sub{color:#57606a;font-size:13px}" +
    ".bar{position:relative;background:#eaeef2;border-radius:4px;height:18px;min-width:120px}.bar .fill{background:#2da44e;height:100%;border-radius:4px}.bar span{position:absolute;left:6px;top:0;font-size:12px;line-height:18px}" +
    ".Complete{background:#dafbe1}.NotStarted{background:#ffebe9}.muted{color:#8c959f}</style></head><body>";
  h += "<h1>Model Completion Report</h1><div class=meta>Generated " + esc(meta.generated || new Date().toLocaleString()) + " from Trimble Connect<br>Proposed: " + esc(meta.proposedName) + " (" + r.proposedCount + " objects, " + r.items.length + " in scope)<br>As-built: " + esc(meta.asBuiltName) + " (" + r.asBuiltCount + " objects)<br>Match tolerance " + r.options.toleranceFt + " ft. A matched object is complete; lengths are not compared.</div>";
  h += '<div class="tiles">' + tile("Overall completion", pct(pctByCount(r.overall)), r.overall.complete + " of " + r.overall.count + " items complete") +
    tile("Pipe complete by design length", pct(pctByLength(r.pipes)), lenF(r.pipes.installedLen) + " of " + lenF(r.pipes.proposedLen) + " LF") +
    tile("Structures", pct(pctByCount(r.points)), r.points.complete + " of " + r.points.count + " complete") +
    "</div>";
  h += "<h2>By category</h2><table>" + ghead("Category") + r.byCategory.map(grow).join("") + "</table>";
  h += "<h2>By pipe size</h2><table>" + ghead("Size") + r.bySize.map(grow).join("") + "</table>";
  h += "<h2>Items (" + r.items.length + ")</h2><table><tr><th>Status</th><th>Type</th><th>Name</th><th>Description</th><th>Layer</th><th class=num>Design LF</th><th>Matched as-built</th><th>Match</th><th class=num>Dist ft</th><th>From</th><th>To</th></tr>";
  const sorted = [...r.items].sort((a, b) => a.status.localeCompare(b.status) || a.proposed.category.localeCompare(b.proposed.category) || a.proposed.name.localeCompare(b.proposed.name));
  for (const it of sorted) {
    const p = it.proposed;
    h += '<tr class="' + it.status.replace(" ", "") + '"><td>' + esc(it.status) + "</td><td>" + esc(p.type) + "</td><td>" + esc(p.name) + "</td><td>" + esc(p.desc) + "</td><td>" + esc(p.layer) + "</td><td class=num>" + (p.isPipeLike ? lenF(it.proposedLen) : "") + "</td><td>" + esc(asBuiltNames(it)) + "</td><td>" + esc(it.method) + "</td><td class=num>" + n2(it.dist, 1) + "</td><td>" + esc(startStruct(p)) + "</td><td>" + esc(endStruct(p)) + "</td></tr>";
  }
  h += "</table><h2>As-built objects with no proposed counterpart (" + r.asBuiltOnly.length + ")</h2>";
  if (!r.asBuiltOnly.length) h += "<p class=muted>None.</p>";
  else {
    h += "<table><tr><th>Type</th><th>Name</th><th>Description</th><th>Layer</th><th class=num>Easting</th><th class=num>Northing</th></tr>";
    for (const a of r.asBuiltOnly) h += "<tr><td>" + esc(a.type) + "</td><td>" + esc(a.name) + "</td><td>" + esc(a.desc) + "</td><td>" + esc(a.layer) + "</td><td class=num>" + n2(a.midX, 1) + "</td><td class=num>" + n2(a.midY, 1) + "</td></tr>";
    h += "</table>";
  }
  h += "<p class=meta>Only pipes and structures count. Ignored: " + r.ignored.length + " proposed and " + r.asBuiltIgnored + " as-built objects that are not pipes or structures (fittings, pipe insulation / clearance, centre lines, solids, blocks)."
    + (r.excluded.length ? " " + r.excluded.length + " proposed objects were excluded by the category filter." : "") + "</p>";
  return h + "</body></html>";
}