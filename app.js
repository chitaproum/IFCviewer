import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { IFCLoader } from 'three/examples/jsm/loaders/IFCLoader';

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------
const canvas = document.getElementById('three-canvas');
const viewport = document.getElementById('viewport');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e13);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
camera.position.set(14, 12, 18);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.localClippingEnabled = true;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(20, 40, 15);
scene.add(dir);
const dir2 = new THREE.DirectionalLight(0xffffff, 0.35);
dir2.position.set(-15, 20, -20);
scene.add(dir2);

// Grid
const grid = new THREE.GridHelper(100, 100, 0x2b333d, 0x1c232d);
scene.add(grid);
const axes = new THREE.AxesHelper(5);
scene.add(axes);

// Clipping plane (section)
const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 10);
let clipEnabled = false;

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

(function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
})();

// ---------------------------------------------------------------------------
// IFC loader
// ---------------------------------------------------------------------------
const ifcLoader = new IFCLoader();
// WASM parser served from CDN, version matched to web-ifc-three in three r149.
ifcLoader.ifcManager.setWasmPath('https://unpkg.com/web-ifc@0.0.36/');

let model = null;              // loaded IFC mesh
let modelID = null;
const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true;
const mouse = new THREE.Vector2();

const statusEl = document.getElementById('status');
const statsEl = document.getElementById('stats');
const loaderEl = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');
const dropZone = document.getElementById('drop-zone');

function setStatus(t) { statusEl.textContent = t; }
function showLoader(t) { loaderText.textContent = t || 'Loading model…'; loaderEl.hidden = false; }
function hideLoader() { loaderEl.hidden = true; }

async function loadIFC(file) {
  showLoader('Reading ' + file.name + ' …');
  setStatus('Parsing ' + file.name);
  const url = URL.createObjectURL(file);
  try {
    if (model) { await clearModel(); }
    model = await ifcLoader.loadAsync(url, (p) => {
      if (p && p.total) showLoader('Loading … ' + Math.round((p.loaded / p.total) * 100) + '%');
    });
    modelID = model.modelID;
    scene.add(model);
    dropZone.classList.add('hidden');
    fitToModel();
    await buildTree();
    const tris = countTriangles(model);
    statsEl.textContent = file.name + '  •  ' + tris.toLocaleString() + ' triangles';
    setStatus('Model loaded.');
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
  try { await ifcLoader.ifcManager.dispose(); } catch (e) {}
  if (model) { scene.remove(model); }
  model = null; modelID = null;
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

function fitToModel() {
  if (!model) return;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 10;
  const dist = maxDim * 1.6;
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(dist, dist * 0.8, dist));
  camera.near = maxDim / 100;
  camera.far = maxDim * 100;
  camera.updateProjectionMatrix();
  // resize helpers to the model footprint
  const g = Math.ceil(maxDim * 1.5 / 10) * 10;
  grid.scale.setScalar(g / 100);
  grid.position.set(center.x, box.min.y, center.z);
  controls.update();
}

// SELECTION ------------------------------------------------------------------
const preselectMat = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.6, color: 0x2f81f7, depthTest: false });
const selectMat   = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.9, color: 0xffb000, depthTest: false });
let selectedExpressID = null;

function castRay(event) {
  if (!model) return null;
  const r = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - r.left) / r.width) * 2 - 1;
  mouse.y = -((event.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(model);
  return hits.length ? hits[0] : null;
}

async function pick(event) {
  const hit = castRay(event);
  if (!hit) { setStatus('Ready.'); return; }
  const id = ifcLoader.ifcManager.getExpressId(hit.object.geometry, hit.faceIndex);
  if (id == null) return;
  selectExpressID(id, true);
}

function highlight(ids, mat, remove) {
  if (modelID === null) return;
  ifcLoader.ifcManager.createSubset({
    modelID, ids, material: mat, scene, removePrevious: remove,
    customID: mat === selectMat ? 'sel' : 'pre'
  });
}

async function selectExpressID(id, focusTree) {
  selectedExpressID = id;
  highlight([id], selectMat, true);
  await showProperties(id);
  if (focusTree) markTreeSelection(id);
}

let hoverRAF = 0;
canvas.addEventListener('mousemove', (e) => {
  if (!model || hoverRAF) return;
  hoverRAF = requestAnimationFrame(() => {
    hoverRAF = 0;
    const hit = castRay(e);
    if (!hit) { ifcLoader.ifcManager.removeSubset(modelID, preselectMat, 'pre'); return; }
    const id = ifcLoader.ifcManager.getExpressId(hit.object.geometry, hit.faceIndex);
    if (id != null) highlight([id], preselectMat, true);
  });
});

let downXY = null;
canvas.addEventListener('mousedown', (e) => downXY = [e.clientX, e.clientY]);
canvas.addEventListener('mouseup', (e) => {
  if (!downXY) return;
  const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
  downXY = null;
  if (moved < 5 && e.button === 0) pick(e);
});

// PROPERTIES -----------------------------------------------------------------
const propsEl = document.getElementById('props');

function decode(v) {
  if (v == null) return '';
  if (typeof v === 'object') return ('value' in v) ? v.value : JSON.stringify(v);
  return v;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function rowsFromObject(obj, skip) {
  skip = skip || [];
  let html = '';
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

// SPATIAL TREE ---------------------------------------------------------------
const treeEl = document.getElementById('tree');
const treeNodes = {}; // expressID -> DOM .tree-item

async function buildTree() {
  treeEl.innerHTML = '';
  const struct = await ifcLoader.ifcManager.getSpatialStructure(modelID, true);
  const root = renderNode(struct, 0);
  treeEl.appendChild(root);
}

function nodeLabel(node) {
  const name = node.Name || node.LongName || (node.type || 'Element');
  return name;
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
  label.innerHTML = esc(nodeLabel(node)) + ' <span class="tree-type">' + esc(node.type || '') + '</span>';
  item.appendChild(label);

  if (node.expressID != null) {
    treeNodes[node.expressID] = item;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      selectExpressID(node.expressID, false);
      markTreeSelection(node.expressID);
    });
  }
  wrap.appendChild(item);

  if (kids.length) {
    const childBox = document.createElement('div');
    childBox.className = 'tree-children';
    for (const c of kids) childBox.appendChild(renderNode(c, depth + 1));
    if (depth >= 2) { childBox.classList.add('collapsed'); toggle.textContent = '▸'; }
    wrap.appendChild(childBox);
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const col = childBox.classList.toggle('collapsed');
      toggle.textContent = col ? '▸' : '▾';
    });
  }
  return wrap;
}

function markTreeSelection(id) {
  document.querySelectorAll('.tree-item.sel').forEach((n) => n.classList.remove('sel'));
  const node = treeNodes[id];
  if (node) {
    node.classList.add('sel');
    // expand ancestors
    let p = node.parentElement;
    while (p) {
      if (p.classList && p.classList.contains('tree-children')) p.classList.remove('collapsed');
      p = p.parentElement;
    }
    node.scrollIntoView({ block: 'nearest' });
  }
}

// TOOLBAR + INPUT ------------------------------------------------------------
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) loadIFC(f);
});

// Drag & drop
['dragenter', 'dragover'].forEach((ev) => viewport.addEventListener(ev, (e) => {
  e.preventDefault(); dropZone.classList.remove('hidden'); dropZone.classList.add('hover');
}));
['dragleave', 'drop'].forEach((ev) => viewport.addEventListener(ev, (e) => {
  e.preventDefault(); dropZone.classList.remove('hover');
}));
viewport.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f && f.name.toLowerCase().endsWith('.ifc')) loadIFC(f);
  else if (f) alert('Please drop a .ifc file.');
});

document.getElementById('btn-fit').addEventListener('click', fitToModel);

document.getElementById('btn-grid').addEventListener('click', (e) => {
  grid.visible = !grid.visible; axes.visible = grid.visible;
  e.currentTarget.classList.toggle('active', !grid.visible);
});

let wire = false;
document.getElementById('btn-wire').addEventListener('click', (e) => {
  if (!model) return;
  wire = !wire;
  model.traverse((c) => { if (c.material) {
    const mats = Array.isArray(c.material) ? c.material : [c.material];
    mats.forEach((m) => m.wireframe = wire);
  }});
  e.currentTarget.classList.toggle('active', wire);
});

document.getElementById('btn-clip').addEventListener('click', (e) => {
  if (!model) return;
  clipEnabled = !clipEnabled;
  const box = new THREE.Box3().setFromObject(model);
  clipPlane.constant = box.getCenter(new THREE.Vector3()).y;
  const planes = clipEnabled ? [clipPlane] : [];
  model.traverse((c) => { if (c.material) {
    const mats = Array.isArray(c.material) ? c.material : [c.material];
    mats.forEach((m) => { m.clippingPlanes = planes; m.clipShadows = true; });
  }});
  e.currentTarget.classList.toggle('active', clipEnabled);
  setStatus(clipEnabled ? 'Section plane ON (horizontal cut at mid-height).' : 'Section plane OFF.');
});

document.getElementById('btn-iso').addEventListener('click', async () => {
  if (modelID === null || selectedExpressID == null) { setStatus('Select an element first to isolate it.'); return; }
  if (model) model.visible = false;
  ifcLoader.ifcManager.createSubset({
    modelID, ids: [selectedExpressID], scene, removePrevious: true, customID: 'iso',
    material: undefined
  });
  setStatus('Isolated element ' + selectedExpressID + '. Click “Show all” to restore.');
});

document.getElementById('btn-show').addEventListener('click', () => {
  if (model) model.visible = true;
  try { ifcLoader.ifcManager.removeSubset(modelID, undefined, 'iso'); } catch (e) {}
  setStatus('Showing full model.');
});

// Keyboard: F = fit, Esc = clear selection
window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') fitToModel();
  if (e.key === 'Escape') {
    selectedExpressID = null;
    try { ifcLoader.ifcManager.removeSubset(modelID, selectMat, 'sel'); } catch (x) {}
    propsEl.innerHTML = '<p class="hint">Click an element to inspect its properties.</p>';
    document.querySelectorAll('.tree-item.sel').forEach((n) => n.classList.remove('sel'));
  }
});

setStatus('Ready — open or drop an .ifc file to begin.');
