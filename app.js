import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
import { IFCLoader } from 'three/examples/jsm/loaders/IFCLoader';

// ===========================================================================
// Scene, renderer, cameras
// ===========================================================================
const canvas = document.getElementById('three-canvas');
const viewport = document.getElementById('viewport');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e13);

const perspCam = new THREE.PerspectiveCamera(60, 1, 0.05, 10000);
perspCam.position.set(14, 12, 18);
const orthoCam = new THREE.OrthographicCamera(-10, 10, 10, -10, -5000, 10000);
orthoCam.position.copy(perspCam.position);
let activeCamera = perspCam;
let isOrtho = false;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.localClippingEnabled = true;

let orbit = new OrbitControls(activeCamera, canvas);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;

// First-person walk / fly
const walk = new PointerLockControls(perspCam, canvas);
let walking = false;
const keys = {};
const walkVel = new THREE.Vector3();
let walkSpeed = 1;

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(20, 40, 15); scene.add(dir);
const dir2 = new THREE.DirectionalLight(0xffffff, 0.35); dir2.position.set(-15, 20, -20); scene.add(dir2);

// Grid + axes
const grid = new THREE.GridHelper(100, 100, 0x2b333d, 0x1c232d);
const axes = new THREE.AxesHelper(5);
scene.add(grid); scene.add(axes);

// Clipping planes (one active at a time)
const planes = {
  x: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
  y: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
  z: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
};
let clipAxis = 'off';
let clipFlip = false;

// ===========================================================================
// Render loop + resize
// ===========================================================================
function resize() {
  const w = viewport.clientWidth || 1, h = viewport.clientHeight || 1;
  renderer.setSize(w, h, false);
  perspCam.aspect = w / h; perspCam.updateProjectionMatrix();
  updateOrthoFrustum();
}
window.addEventListener('resize', resize);

function updateOrthoFrustum() {
  const w = viewport.clientWidth || 1, h = viewport.clientHeight || 1;
  const aspect = w / h;
  // frustum height derived from distance to target (keeps zoom feel on toggle)
  const dist = activeCamera.position.distanceTo(orbit.target) || 20;
  const halfH = dist * 0.5;
  orthoCam.top = halfH; orthoCam.bottom = -halfH;
  orthoCam.left = -halfH * aspect; orthoCam.right = halfH * aspect;
  orthoCam.updateProjectionMatrix();
}

const clock = new THREE.Clock();
(function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  if (walking && walk.isLocked) stepWalk(dt);
  else orbit.update();
  if (isOrtho) updateOrthoFrustum();
  renderer.render(scene, activeCamera);
})();

function stepWalk(dt) {
  const sp = walkSpeed * 10 * dt;
  if (keys['KeyW']) walk.moveForward(sp);
  if (keys['KeyS']) walk.moveForward(-sp);
  if (keys['KeyA']) walk.moveRight(-sp);
  if (keys['KeyD']) walk.moveRight(sp);
  if (keys['KeyE'] || keys['Space']) perspCam.position.y += sp;
  if (keys['KeyQ'] || keys['ShiftLeft']) perspCam.position.y -= sp;
}

// ===========================================================================
// IFC loader
// ===========================================================================
const ifcLoader = new IFCLoader();
// WASM must come from the SAME three release that provides the loader glue,
// otherwise WebAssembly.instantiate throws a LinkError.
ifcLoader.ifcManager.setWasmPath('https://unpkg.com/three@0.149.0/examples/jsm/loaders/ifc/');

let model = null, modelID = null;
const raycaster = new THREE.Raycaster(); raycaster.firstHitOnly = true;
const mouse = new THREE.Vector2();

// Data collected after load
let nodeByID = {};      // expressID -> tree node
let typeByID = {};      // expressID -> IFC type string
let allElements = [];   // {id, type, name}
let storeys = [];       // {id, name, ids:[...]}

const statusEl = document.getElementById('status');
const statsEl = document.getElementById('stats');
const loaderEl = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');
const dropZone = document.getElementById('drop-zone');
const setStatus = (t) => statusEl.textContent = t;
const showLoader = (t) => { loaderText.textContent = t || 'Loading model…'; loaderEl.hidden = false; };
const hideLoader = () => { loaderEl.hidden = true; };

async function loadIFC(file) {
  showLoader('Reading ' + file.name + ' …');
  setStatus('Parsing ' + file.name);
  const url = URL.createObjectURL(file);
  try {
    if (model) await clearModel();
    model = await ifcLoader.loadAsync(url, (p) => {
      if (p && p.total) showLoader('Loading … ' + Math.round((p.loaded / p.total) * 100) + '%');
    });
    modelID = model.modelID;
    scene.add(model);
    dropZone.classList.add('hidden');
    hideLoader();                     // hide BEFORE heavier tree build so UI frees up
    fitToModel();
    await buildTree();                // also fills nodeByID / allElements / storeys
    populateSelectors();
    statsEl.textContent = file.name + '  •  ' + countTriangles(model).toLocaleString() + ' triangles';
    setStatus('Model loaded — ' + allElements.length + ' elements.');
  } catch (err) {
    console.error(err);
    setStatus('Failed to load IFC: ' + err.message);
    alert('Could not load this IFC file.\n\n' + err.message);
  } finally {
    hideLoader();
    URL.revokeObjectURL(url);
  }
}

async function clearModel() {
  clearSelection();
  try { await ifcLoader.ifcManager.dispose(); } catch (e) {}
  if (model) scene.remove(model);
  model = null; modelID = null;
  nodeByID = {}; typeByID = {}; allElements = []; storeys = [];
  document.getElementById('tree').innerHTML = '';
  document.getElementById('props').innerHTML = '';
}

function countTriangles(obj) {
  let n = 0;
  obj.traverse((c) => {
    if (c.geometry && c.geometry.index) n += c.geometry.index.count / 3;
    else if (c.geometry && c.geometry.attributes.position) n += c.geometry.attributes.position.count / 3;
  });
  return Math.round(n);
}

function modelBox() { return new THREE.Box3().setFromObject(model); }

function fitToModel() {
  if (!model) return;
  const box = modelBox();
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 10;
  const dist = maxDim * 1.6;
  orbit.target.copy(center);
  activeCamera.position.copy(center).add(new THREE.Vector3(dist, dist * 0.8, dist));
  perspCam.near = maxDim / 100; perspCam.far = maxDim * 100; perspCam.updateProjectionMatrix();
  const g = Math.ceil(maxDim * 1.5 / 10) * 10;
  grid.scale.setScalar(g / 100);
  grid.position.set(center.x, box.min.y, center.z);
  updateOrthoFrustum();
  orbit.update();
}

// ===========================================================================
// Selection + highlight (single / multi / modes)
// ===========================================================================
const preMat  = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.6, color: 0x2f81f7, depthTest: false });
const selMat  = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.9, color: 0xffb000, depthTest: false });
let selectMode = 'element';       // element | parent | type
let multiSelect = false;
let selectedIDs = new Set();
let lastSelected = null;

function castRay(event) {
  if (!model) return null;
  const r = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - r.left) / r.width) * 2 - 1;
  mouse.y = -((event.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(mouse, activeCamera);
  const hits = raycaster.intersectObject(model);
  return hits.length ? hits[0] : null;
}

function idsForMode(id) {
  if (selectMode === 'type') {
    const t = typeByID[id];
    return allElements.filter((e) => e.type === t).map((e) => e.id);
  }
  if (selectMode === 'parent') {
    const node = nodeByID[id];
    const parent = node && node._parent;
    if (parent) return collectIDs(parent);
  }
  return [id];
}

async function pick(event) {
  const hit = castRay(event);
  if (!hit) { if (!multiSelect) clearSelection(); return; }
  const id = ifcLoader.ifcManager.getExpressId(hit.object.geometry, hit.faceIndex);
  if (id == null) return;
  const ids = idsForMode(id);
  const add = multiSelect || event.ctrlKey || event.metaKey;
  if (!add) selectedIDs.clear();
  ids.forEach((x) => selectedIDs.add(x));
  lastSelected = id;
  applySelection();
  await showProperties(id);
  markTreeSelection(id);
}

function applySelection() {
  if (modelID === null) return;
  const ids = [...selectedIDs];
  if (!ids.length) { try { ifcLoader.ifcManager.removeSubset(modelID, selMat, 'sel'); } catch (e) {} ; updateSelStatus(); return; }
  ifcLoader.ifcManager.createSubset({ modelID, ids, material: selMat, scene, removePrevious: true, customID: 'sel' });
  updateSelStatus();
}

function updateSelStatus() {
  const n = selectedIDs.size;
  if (n > 1) setStatus(n + ' elements selected.');
  else if (n === 1) setStatus('1 element selected.');
}

function clearSelection() {
  selectedIDs.clear(); lastSelected = null;
  try { ifcLoader.ifcManager.removeSubset(modelID, selMat, 'sel'); } catch (e) {}
  try { ifcLoader.ifcManager.removeSubset(modelID, preMat, 'pre'); } catch (e) {}
  const p = document.getElementById('props');
  if (p) p.innerHTML = '<p class="hint">Click an element to inspect its properties.</p>';
  document.querySelectorAll('.tree-item.sel').forEach((n) => n.classList.remove('sel'));
}

async function selectByID(id, scroll) {
  selectedIDs = new Set(idsForMode(id)); lastSelected = id;
  applySelection();
  await showProperties(id);
  if (scroll) markTreeSelection(id);
}

// Hover pre-highlight (throttled)
let hoverRAF = 0;
canvas.addEventListener('mousemove', (e) => {
  if (!model || walking || hoverRAF) return;
  hoverRAF = requestAnimationFrame(() => {
    hoverRAF = 0;
    const hit = castRay(e);
    if (!hit) { try { ifcLoader.ifcManager.removeSubset(modelID, preMat, 'pre'); } catch (x) {} return; }
    const id = ifcLoader.ifcManager.getExpressId(hit.object.geometry, hit.faceIndex);
    if (id != null) ifcLoader.ifcManager.createSubset({ modelID, ids: [id], material: preMat, scene, removePrevious: true, customID: 'pre' });
  });
});

let downXY = null;
canvas.addEventListener('mousedown', (e) => downXY = [e.clientX, e.clientY]);
canvas.addEventListener('mouseup', (e) => {
  if (walking || !downXY) { downXY = null; return; }
  const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
  downXY = null;
  if (moved < 5 && e.button === 0) pick(e);
});

// ===========================================================================
// Properties panel
// ===========================================================================
const propsEl = document.getElementById('props');
const decode = (v) => v == null ? '' : (typeof v === 'object' ? ('value' in v ? v.value : JSON.stringify(v)) : v);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function rowsFromObject(obj, skip) {
  skip = skip || []; let html = '';
  for (const k in obj) {
    if (skip.indexOf(k) >= 0) continue;
    const val = decode(obj[k]);
    if (val === '' || val === null) continue;
    html += '<div class="prop-row"><div class="k">' + esc(k) + '</div><div class="v">' + esc(String(val)) + '</div></div>';
  }
  return html;
}

async function showProperties(id) {
  if (modelID === null) return;
  const mgr = ifcLoader.ifcManager;
  const props = await mgr.getItemProperties(modelID, id, true);
  const type = await mgr.getIfcType(modelID, id);
  let html = '<div class="prop-group"><h4>' + esc(type || 'Element') + '</h4>';
  if (selectedIDs.size > 1) html += '<div class="prop-row"><div class="k">Selected</div><div class="v">' + selectedIDs.size + ' elements</div></div>';
  html += '<div class="prop-row"><div class="k">ExpressID</div><div class="v">' + id + '</div></div>';
  html += rowsFromObject(props, ['expressID', 'type', 'OwnerHistory']);
  html += '</div>';
  try {
    const psets = await mgr.getPropertySets(modelID, id, true);
    for (const set of psets) {
      const name = decode(set.Name) || 'Property Set';
      const items = set.HasProperties || set.Quantities || [];
      if (!items.length) continue;
      html += '<div class="prop-group"><h4>' + esc(name) + '</h4>';
      for (const p of items) {
        const pk = decode(p.Name);
        let pv = decode(p.NominalValue);
        if (pv === '') pv = decode(p.LengthValue) || decode(p.AreaValue) || decode(p.VolumeValue) || decode(p.CountValue) || decode(p.WeightValue);
        if (pk === '' && pv === '') continue;
        html += '<div class="prop-row"><div class="k">' + esc(pk) + '</div><div class="v">' + esc(String(pv)) + '</div></div>';
      }
      html += '</div>';
    }
  } catch (e) {}
  propsEl.innerHTML = html;
}

// ===========================================================================
// Spatial tree + data collection
// ===========================================================================
const treeEl = document.getElementById('tree');
const treeNodes = {};

function collectIDs(node, out) {
  out = out || [];
  if (node.expressID != null) out.push(node.expressID);
  (node.children || []).forEach((c) => collectIDs(c, out));
  return out;
}

async function buildTree() {
  treeEl.innerHTML = '';
  const mgr = ifcLoader.ifcManager;
  // includeProperties=true attaches Name/LongName inline — avoids thousands of
  // per-element async calls that would make a large model appear to “hang”.
  const struct = await mgr.getSpatialStructure(modelID, true);
  function walkNode(node, parent) {
    node._parent = parent || null;
    if (node.expressID != null) {
      nodeByID[node.expressID] = node;
      typeByID[node.expressID] = node.type || '';
      const name = decode(node.Name) || decode(node.LongName) || '';
      node._name = name;
      allElements.push({ id: node.expressID, type: node.type || '', name: name });
      if ((node.type || '') === 'IFCBUILDINGSTOREY') {
        storeys.push({ id: node.expressID, name: name || ('Storey ' + node.expressID), ids: [] });
      }
    }
    for (const c of (node.children || [])) walkNode(c, node);
  }
  walkNode(struct, null);
  storeys.forEach((s) => { s.ids = collectIDs(nodeByID[s.id]); });
  treeEl.appendChild(renderNode(struct, 0));
}

function nodeLabel(node) {
  const nm = node._name || '';
  return (nm ? esc(nm) + ' ' : '') + '<span class="tree-type">' + esc(node.type || '') + '</span>';
}

function renderNode(node, depth) {
  const wrap = document.createElement('div');
  const item = document.createElement('div');
  item.className = 'tree-item';
  const kids = node.children || [];
  const toggle = document.createElement('span');
  toggle.className = 'tree-toggle';
  toggle.textContent = kids.length ? '▾' : '';
  item.appendChild(toggle);
  const label = document.createElement('span');
  label.innerHTML = nodeLabel(node);
  item.appendChild(label);
  if (node.expressID != null) {
    treeNodes[node.expressID] = item;
    item.addEventListener('click', (e) => { e.stopPropagation(); selectByID(node.expressID, false); markTreeSelection(node.expressID); });
  }
  wrap.appendChild(item);
  if (kids.length) {
    const box = document.createElement('div');
    box.className = 'tree-children';
    for (const c of kids) box.appendChild(renderNode(c, depth + 1));
    if (depth >= 2) { box.classList.add('collapsed'); toggle.textContent = '▸'; }
    wrap.appendChild(box);
    toggle.addEventListener('click', (e) => { e.stopPropagation(); const col = box.classList.toggle('collapsed'); toggle.textContent = col ? '▸' : '▾'; });
  }
  return wrap;
}

function markTreeSelection(id) {
  document.querySelectorAll('.tree-item.sel').forEach((n) => n.classList.remove('sel'));
  const node = treeNodes[id];
  if (!node) return;
  node.classList.add('sel');
  let p = node.parentElement;
  while (p) { if (p.classList && p.classList.contains('tree-children')) p.classList.remove('collapsed'); p = p.parentElement; }
  node.scrollIntoView({ block: 'nearest' });
}

// ===========================================================================
// Populate dynamic selectors (storeys + IFC class filter)
// ===========================================================================
function populateSelectors() {
  // Storeys
  const list = document.getElementById('storey-list');
  list.innerHTML = '<button data-storey="all" class="active">✓ All levels</button>';
  storeys.forEach((s) => {
    const b = document.createElement('button');
    b.dataset.storey = s.id;
    b.textContent = s.name + '  (' + s.ids.length + ')';
    list.appendChild(b);
  });
  list.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => selectStorey(b.dataset.storey, b)));
  // IFC class filter
  const sel = document.getElementById('search-class');
  const types = [...new Set(allElements.map((e) => e.type).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All classes</option>' + types.map((t) => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join('');
}

function selectStorey(key, btn) {
  document.querySelectorAll('#storey-list button').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  try { ifcLoader.ifcManager.removeSubset(modelID, undefined, 'storey'); } catch (e) {}
  if (key === 'all') {
    if (model) model.visible = true;
    setStatus('Showing all levels.');
    return;
  }
  const s = storeys.find((x) => String(x.id) === String(key));
  if (!s) return;
  if (model) model.visible = false;
  ifcLoader.ifcManager.createSubset({ modelID, ids: s.ids, scene, removePrevious: true, customID: 'storey' });
  setStatus('Isolated level: ' + s.name + ' (' + s.ids.length + ' elements).');
}

// ===========================================================================
// Section / clipping planes
// ===========================================================================
function applyClip() {
  if (!model) return;
  let active = [];
  if (clipAxis !== 'off') {
    const box = modelBox();
    const min = box.min, max = box.max;
    const t = (document.getElementById('clip-range').valueAsNumber || 50) / 100;
    const pl = planes[clipAxis];
    const sign = clipFlip ? -1 : 1;
    if (clipAxis === 'x') { pl.normal.set(-sign, 0, 0); pl.constant = sign * (min.x + (max.x - min.x) * t); }
    if (clipAxis === 'y') { pl.normal.set(0, -sign, 0); pl.constant = sign * (min.y + (max.y - min.y) * t); }
    if (clipAxis === 'z') { pl.normal.set(0, 0, -sign); pl.constant = sign * (min.z + (max.z - min.z) * t); }
    active = [pl];
  }
  model.traverse((c) => { if (c.material) {
    const mats = Array.isArray(c.material) ? c.material : [c.material];
    mats.forEach((m) => { m.clippingPlanes = active; m.clipShadows = true; });
  }});
}

// ===========================================================================
// Camera views + projection toggle
// ===========================================================================
function setView(dir) {
  if (!model) return;
  const box = modelBox();
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const d = Math.max(size.x, size.y, size.z) * 1.8 || 30;
  const off = { top:[0,d,0.001], bottom:[0,-d,0.001], front:[0,0,d], back:[0,0,-d],
                left:[-d,0,0], right:[d,0,0], iso:[d,d*0.8,d] }[dir] || [d,d*0.8,d];
  orbit.target.copy(center);
  activeCamera.position.set(center.x + off[0], center.y + off[1], center.z + off[2]);
  activeCamera.up.set(0, 1, 0);
  updateOrthoFrustum();
  orbit.update();
  setStatus('View: ' + dir);
}

function setProjection(mode) {
  const toOrtho = mode === 'ortho';
  if (toOrtho === isOrtho) return;
  isOrtho = toOrtho;
  const tgt = orbit.target.clone();
  const from = activeCamera;
  activeCamera = toOrtho ? orthoCam : perspCam;
  activeCamera.position.copy(from.position);
  orbit.dispose();
  orbit = new OrbitControls(activeCamera, canvas);
  orbit.enableDamping = true; orbit.dampingFactor = 0.08;
  orbit.target.copy(tgt);
  updateOrthoFrustum();
  orbit.update();
  document.querySelectorAll('#menu-views .proj').forEach((b) => {
    const on = b.dataset.proj === mode;
    b.classList.toggle('active', on);
    b.textContent = (on ? '✓ ' : '') + (b.dataset.proj === 'persp' ? 'Perspective' : 'Orthographic');
  });
}

// ===========================================================================
// Search & filter
// ===========================================================================
function runSearch() {
  if (modelID === null) return;
  const q = document.getElementById('search-box').value.trim().toLowerCase();
  const cls = document.getElementById('search-class').value;
  if (!q && !cls) { try { ifcLoader.ifcManager.removeSubset(modelID, undefined, 'search'); } catch (e) {} if (model) model.visible = true; setStatus('Search cleared.'); return; }
  const matches = allElements.filter((e) => {
    const okCls = !cls || e.type === cls;
    const okQ = !q || (e.name && e.name.toLowerCase().includes(q)) || (e.type && e.type.toLowerCase().includes(q)) || String(e.id) === q;
    return okCls && okQ;
  });
  try { ifcLoader.ifcManager.removeSubset(modelID, undefined, 'search'); } catch (e) {}
  if (!matches.length) { setStatus('No elements match “' + (q || cls) + '”.'); return; }
  if (model) model.visible = false;
  ifcLoader.ifcManager.createSubset({ modelID, ids: matches.map((m) => m.id), scene, removePrevious: true, customID: 'search' });
  setStatus(matches.length + ' element(s) match — isolated. Clear search to restore.');
}

// ===========================================================================
// Walk / fly mode
// ===========================================================================
const walkHint = document.getElementById('walk-hint');
// PointerLockControls (three r149) manipulates perspCam directly — no scene add needed.

function enterWalk() {
  if (!model) { setStatus('Load a model first.'); return; }
  if (isOrtho) setProjection('persp');
  walking = true;
  const box = modelBox(); const c = box.getCenter(new THREE.Vector3());
  walkSpeed = Math.max(1, (box.max.y - box.min.y) / 6);
  perspCam.position.set(c.x, box.min.y + walkSpeed * 1.6, c.z);
  perspCam.lookAt(c.x + 1, perspCam.position.y, c.z);
  walk.lock();
}
function exitWalk() {
  walking = false;
  walkHint.hidden = true;
  document.getElementById('btn-walk').classList.remove('active');
  orbit.target.copy(new THREE.Vector3().addVectors(perspCam.position, new THREE.Vector3(0,0,-1).applyQuaternion(perspCam.quaternion)));
  orbit.update();
}
walk.addEventListener('lock', () => { walkHint.hidden = false; document.getElementById('btn-walk').classList.add('active'); });
walk.addEventListener('unlock', () => exitWalk());
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ===========================================================================
// Dropdown menus (click to open, click outside to close)
// ===========================================================================
document.querySelectorAll('.menu > .menu-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = btn.parentElement;
    const open = menu.classList.contains('open');
    document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
    menu.classList.toggle('open', !open);
  });
});
document.addEventListener('click', () => document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')));
document.querySelectorAll('.menu-list').forEach((l) => l.addEventListener('click', (e) => {
  if (e.target.closest('.menu-slider,.menu-check')) e.stopPropagation();
}));

// ===========================================================================
// Toolbar wiring
// ===========================================================================
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) loadIFC(f); });

// Drag & drop
['dragenter', 'dragover'].forEach((ev) => viewport.addEventListener(ev, (e) => { e.preventDefault(); if (!model) { dropZone.classList.remove('hidden'); dropZone.classList.add('hover'); } }));
['dragleave', 'drop'].forEach((ev) => viewport.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove('hover'); }));
viewport.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f && f.name.toLowerCase().endsWith('.ifc')) loadIFC(f);
  else if (f) alert('Please drop a .ifc file.');
});

// Views menu
document.querySelectorAll('#menu-views [data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
document.querySelectorAll('#menu-views [data-proj]').forEach((b) => b.addEventListener('click', () => setProjection(b.dataset.proj)));

// Section menu
document.querySelectorAll('#menu-section [data-axis]').forEach((b) => b.addEventListener('click', () => {
  clipAxis = b.dataset.axis;
  document.querySelectorAll('#menu-section [data-axis]').forEach((x) => { x.classList.toggle('active', x === b); x.textContent = (x === b ? '✓ ' : '') + x.textContent.replace(/^✓ /, ''); });
  applyClip();
  setStatus(clipAxis === 'off' ? 'Section off.' : 'Section on — ' + clipAxis.toUpperCase() + ' axis.');
}));
document.getElementById('clip-range').addEventListener('input', applyClip);
document.getElementById('clip-flip').addEventListener('change', (e) => { clipFlip = e.target.checked; applyClip(); });

// Selection modes
document.querySelectorAll('#menu-select [data-selmode]').forEach((b) => b.addEventListener('click', () => {
  selectMode = b.dataset.selmode;
  document.querySelectorAll('#menu-select [data-selmode]').forEach((x) => { x.classList.toggle('active', x === b); x.textContent = (x === b ? '✓ ' : '') + x.textContent.replace(/^✓ /, ''); });
  setStatus('Selection mode: ' + selectMode);
}));
document.getElementById('multi-select').addEventListener('change', (e) => { multiSelect = e.target.checked; });

// Simple buttons
document.getElementById('btn-fit').addEventListener('click', fitToModel);
document.getElementById('btn-grid').addEventListener('click', (e) => { grid.visible = !grid.visible; axes.visible = grid.visible; e.currentTarget.classList.toggle('active', !grid.visible); });

let wire = false;
document.getElementById('btn-wire').addEventListener('click', (e) => {
  if (!model) return; wire = !wire;
  model.traverse((c) => { if (c.material) { const m = Array.isArray(c.material) ? c.material : [c.material]; m.forEach((x) => x.wireframe = wire); } });
  e.currentTarget.classList.toggle('active', wire);
});

document.getElementById('btn-iso').addEventListener('click', () => {
  if (modelID === null || !selectedIDs.size) { setStatus('Select element(s) first to isolate.'); return; }
  if (model) model.visible = false;
  ifcLoader.ifcManager.createSubset({ modelID, ids: [...selectedIDs], scene, removePrevious: true, customID: 'iso' });
  setStatus('Isolated ' + selectedIDs.size + ' element(s). Click “Show all” to restore.');
});

document.getElementById('btn-show').addEventListener('click', () => {
  if (model) model.visible = true;
  ['iso', 'storey', 'search'].forEach((id) => { try { ifcLoader.ifcManager.removeSubset(modelID, undefined, id); } catch (e) {} });
  document.querySelectorAll('#storey-list button').forEach((b) => b.classList.toggle('active', b.dataset.storey === 'all'));
  setStatus('Showing full model.');
});

document.getElementById('btn-walk').addEventListener('click', () => { if (walking) walk.unlock(); else enterWalk(); });

// Search
document.getElementById('search-box').addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
document.getElementById('search-class').addEventListener('change', runSearch);
document.getElementById('search-clear').addEventListener('click', () => { document.getElementById('search-box').value = ''; document.getElementById('search-class').value = ''; runSearch(); });

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].indexOf(document.activeElement.tagName) >= 0) return;
  if (e.key === 'f' || e.key === 'F') fitToModel();
  if (e.key === 'Escape' && !walking) clearSelection();
});

setStatus('Ready — open or drop an .ifc file to begin.');

