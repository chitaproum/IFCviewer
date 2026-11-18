/* ==========================================================================
   3D Model Viewer — multi-format (IFC, glTF/GLB, STEP, IGES, OBJ, STL, PLY,
   FBX, DAE, 3DS, 3MF, AMF, WRL, OFF, BIM/dotbim, FCStd, BREP, 3DM)
   three.js r149 + web-ifc + OpenCascade (occt-import-js) + rhino3dm
   ========================================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GammaCorrectionShader } from 'three/addons/shaders/GammaCorrectionShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (id) => document.getElementById(id);
const THREE_VER = '0.149.0';
const THREE_BASE = 'https://unpkg.com/three@' + THREE_VER + '/examples/jsm/';
const OCCT_BASE = 'https://unpkg.com/occt-import-js@0.0.19/dist/';
const RHINO_BASE = 'https://unpkg.com/rhino3dm@7.15.0/';

/* ---------------------------------------------------------------- formats */
const FORMATS = {
  ifc:   { kind: 'ifc',    label: 'IFC' },
  glb:   { kind: 'gltf',   label: 'glTF binary' },
  gltf:  { kind: 'gltf',   label: 'glTF' },
  obj:   { kind: 'obj',    label: 'Wavefront OBJ' },
  stl:   { kind: 'stl',    label: 'STL' },
  ply:   { kind: 'ply',    label: 'PLY' },
  fbx:   { kind: 'fbx',    label: 'FBX' },
  dae:   { kind: 'dae',    label: 'Collada' },
  '3ds': { kind: '3ds',    label: '3D Studio' },
  '3mf': { kind: '3mf',    label: '3MF' },
  amf:   { kind: 'amf',    label: 'AMF' },
  wrl:   { kind: 'wrl',    label: 'VRML' },
  off:   { kind: 'off',    label: 'OFF' },
  bim:   { kind: 'bim',    label: 'dotbim' },
  step:  { kind: 'occt',   label: 'STEP',   ext: 'step' },
  stp:   { kind: 'occt',   label: 'STEP',   ext: 'step' },
  iges:  { kind: 'occt',   label: 'IGES',   ext: 'iges' },
  igs:   { kind: 'occt',   label: 'IGES',   ext: 'iges' },
  brep:  { kind: 'occt',   label: 'BREP',   ext: 'brep' },
  brp:   { kind: 'occt',   label: 'BREP',   ext: 'brep' },
  fcstd: { kind: 'fcstd',  label: 'FreeCAD' },
  '3dm': { kind: '3dm',    label: 'Rhino 3DM' }
};

/* --------------------------------------------------------------- renderer */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(1, 1, false);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

const camera0 = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
camera0.position.set(12, 9, 12);
const orthoCam = new THREE.OrthographicCamera(-10, 10, 10, -10, -10000, 10000);
orthoCam.position.copy(camera0.position);
let activeCamera = camera0;
let isOrtho = false;

let orbit = new OrbitControls(activeCamera, canvas);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.screenSpacePanning = true;

/* ---------------------------------------------------------------- lights */
const hemi = new THREE.HemisphereLight(0xdfefff, 0x2a3138, 0.55);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 2.2);
dir.position.set(30, 45, 22);
dir.castShadow = true;
dir.shadow.mapSize.set(2048, 2048);
dir.shadow.bias = -0.0004;
dir.shadow.normalBias = 0.03;
scene.add(dir);
scene.add(dir.target);

const fill = new THREE.DirectionalLight(0xbcd4ff, 0.45);
fill.position.set(-25, 18, -18);
scene.add(fill);

/* image-based lighting: makes PBR materials look right instead of flat */
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = env.texture;
}

/* ------------------------------------------------------- helpers + ground */
let gridOn = true;
let gridAuto = true;   // follow the model size
let gridCell = 1;      // spacing in model units
let gridExtent = 100;  // overall width in model units

function makeGridHelper(size, divisions) {
  const g = new THREE.GridHelper(size, divisions, 0x2f3a47, 0x1b232d);
  g.material.transparent = true;
  g.material.opacity = 0.75;
  g.material.depthWrite = false;
  return g;
}

let grid = makeGridHelper(100, 100);
scene.add(grid);

const axes = new THREE.AxesHelper(5);
axes.visible = false;
scene.add(axes);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.ShadowMaterial({ opacity: 0.28 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* ------------------------------------------------------------- composer */
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, activeCamera);
composer.addPass(renderPass);
const smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
composer.addPass(smaaPass);
const gammaPass = new ShaderPass(GammaCorrectionShader);
gammaPass.renderToScreen = true;
composer.addPass(gammaPass);

/* --------------------------------------------------------------- app state */
const state = {
  root: null,            // loaded Object3D
  format: null,          // { kind, label }
  name: '',
  url: null,             // set when loaded from a remote URL (shareable)
  isIFC: false,
  modelID: null,
  ifcLoader: null,
  box: new THREE.Box3(),
  nodes: [],             // flat index of selectable items
  byId: new Map(),       // id -> node
  selection: new Map(),  // id -> node
  multi: false,
  selMode: 'element',
  isolateKey: null,
  hiddenByIso: [],
  ghosted: [],
  savedMats: new Map()   // object.id -> original material(s)
};

/* ------------------------------------------------------------------- UI --- */
let toastTimer = null;
let statusTimer = null;
function setStatus(t, isError) {
  const bar = $('statusbar');
  const el = $('status');
  if (!el) return;
  el.textContent = t;
  if (!bar) return;
  bar.hidden = false;
  bar.classList.remove('fade');
  bar.classList.toggle('err', !!isError);
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    bar.classList.add('fade');
    setTimeout(() => { if (bar.classList.contains('fade')) bar.hidden = true; }, 400);
  }, isError ? 6500 : 3800);
}
function toast(msg, ms) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms || 3200);
}
function showLoader(msg) {
  $('loader-msg').textContent = msg || 'Loading…';
  $('loader').hidden = false;
}
function hideLoader() { $('loader').hidden = true; }

function resize() {
  const vp = $('viewport');
  const w = Math.max(1, vp.clientWidth), h = Math.max(1, vp.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  smaaPass.setSize(w, h);
  if (activeCamera.isPerspectiveCamera) {
    activeCamera.aspect = w / h;
    activeCamera.updateProjectionMatrix();
  }
  updateOrthoFrustum();
}
window.addEventListener('resize', resize);

function updateOrthoFrustum() {
  if (!activeCamera.isOrthographicCamera) return;
  const vp = $('viewport');
  const aspect = vp.clientWidth / Math.max(1, vp.clientHeight);
  const d = orthoCam.userData.halfHeight || 10;
  orthoCam.left = -d * aspect; orthoCam.right = d * aspect;
  orthoCam.top = d; orthoCam.bottom = -d;
  orthoCam.updateProjectionMatrix();
}

/* ------------------------------------------------------------ fit + views */
function modelBox() {
  if (!state.root) return new THREE.Box3();
  const b = new THREE.Box3().setFromObject(state.root);
  if (b.isEmpty()) { b.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)); }
  return b;
}

function niceStep(v) {
  const x = Math.max(1e-6, Math.abs(v) || 1);
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const n = x / p;
  const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return s * p;
}

function syncGridInputs() {
  const c = $('grid-cell'), e = $('grid-extent');
  if (c) c.value = gridCell >= 1 ? +gridCell.toFixed(2) : +gridCell.toFixed(3);
  if (e) e.value = +gridExtent.toFixed(1);
}

/* rebuild the grid: auto = derived from the model, manual = user values */
function updateGrid() {
  const b = state.root ? modelBox() : new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 1, 10));
  const size = b.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 1);
  if (gridAuto) {
    gridCell = niceStep(span / 20);
    gridExtent = Math.max(gridCell * 4, Math.ceil((span * 1.9) / gridCell) * gridCell);
    syncGridInputs();
  }
  const cell = Math.max(1e-4, gridCell);
  const extent = Math.max(cell * 2, gridExtent);
  const divs = Math.max(2, Math.min(600, Math.round(extent / cell)));
  const c = b.getCenter(new THREE.Vector3());

  scene.remove(grid);
  if (grid.geometry) grid.geometry.dispose();
  if (grid.material) grid.material.dispose();
  grid = makeGridHelper(extent, divs);
  grid.position.set(c.x, b.min.y + span * 0.0008, c.z);
  grid.visible = gridOn;
  scene.add(grid);
}

function fitToModel() {
  if (!state.root) return;
  const box = modelBox();
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 10;

  orbit.target.copy(center);
  const dist = maxDim * 1.7;
  activeCamera.position.copy(center).add(new THREE.Vector3(dist * 0.62, dist * 0.52, dist * 0.62));

  camera0.near = maxDim / 500; camera0.far = maxDim * 60; camera0.updateProjectionMatrix();
  orthoCam.near = -maxDim * 30; orthoCam.far = maxDim * 60;
  orthoCam.userData.halfHeight = maxDim * 0.75;
  updateOrthoFrustum();

  updateGrid();
  axes.position.set(box.min.x, box.min.y, box.min.z);
  axes.scale.setScalar(Math.max(0.01, maxDim / 10));

  ground.position.set(center.x, box.min.y - maxDim * 0.002, center.z);
  dir.position.set(center.x + maxDim, center.y + maxDim * 1.7, center.z + maxDim);
  dir.target.position.copy(center);
  const r = maxDim * 1.1;
  const sc = dir.shadow.camera;
  sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
  sc.near = maxDim * 0.02; sc.far = maxDim * 6;
  sc.updateProjectionMatrix();

  orbit.update();
}

function setView(dirName) {
  const box = modelBox();
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const d = (Math.max(s.x, s.y, s.z) || 10) * 1.9;
  const pos = c.clone();
  switch (dirName) {
    case 'top': pos.y += d; break;
    case 'bottom': pos.y -= d; break;
    case 'front': pos.z += d; break;
    case 'back': pos.z -= d; break;
    case 'left': pos.x -= d; break;
    case 'right': pos.x += d; break;
    default: pos.x += d * 0.68; pos.y += d * 0.55; pos.z += d * 0.68;
  }
  activeCamera.position.copy(pos);
  if (dirName === 'top') activeCamera.up.set(0, 0, -1);
  else if (dirName === 'bottom') activeCamera.up.set(0, 0, 1);
  else activeCamera.up.set(0, 1, 0);
  orbit.target.copy(c);
  orbit.update();
}

function setProjection(mode) {
  const toOrtho = mode === 'ortho';
  if (toOrtho === isOrtho) return;
  isOrtho = toOrtho;
  const tgt = orbit.target.clone();
  const prev = activeCamera;
  activeCamera = toOrtho ? orthoCam : camera0;
  activeCamera.position.copy(prev.position);
  activeCamera.up.copy(prev.up);
  orbit.dispose();
  orbit = new OrbitControls(activeCamera, canvas);
  orbit.enableDamping = true; orbit.dampingFactor = 0.08; orbit.screenSpacePanning = true;
  orbit.target.copy(tgt);
  applyMoveMode();
  updateOrthoFrustum();
  orbit.update();
  renderPass.camera = activeCamera;
  document.querySelectorAll('#menu-views .proj').forEach((b) => {
    b.classList.toggle('active', b.dataset.proj === mode);
    b.textContent = (b.dataset.proj === mode ? '✓ ' : '') + (b.dataset.proj === 'ortho' ? 'Orthographic' : 'Perspective');
  });
}

/* ==========================================================================
   Navigation: orbit / pan / zoom mouse modes + quick view helpers
   ========================================================================== */
const MOUSE_SETS = {
  orbit: { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN },
  pan:   { LEFT: THREE.MOUSE.PAN,    MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE },
  zoom:  { LEFT: THREE.MOUSE.DOLLY,  MIDDLE: THREE.MOUSE.PAN,   RIGHT: THREE.MOUSE.ROTATE }
};
const TOUCH_SETS = {
  orbit: { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN },
  pan:   { ONE: THREE.TOUCH.PAN,    TWO: THREE.TOUCH.DOLLY_ROTATE },
  zoom:  { ONE: THREE.TOUCH.DOLLY_PAN, TWO: THREE.TOUCH.DOLLY_PAN }
};
let moveMode = 'orbit';

function applyMoveMode() {
  if (orbit) {
    orbit.mouseButtons = Object.assign({}, MOUSE_SETS[moveMode]);
    orbit.touches = Object.assign({}, TOUCH_SETS[moveMode]);
  }
  canvas.classList.remove('m-orbit', 'm-pan', 'm-zoom');
  canvas.classList.add('m-' + moveMode);
  const rot = $('toggle-rot');
  if (rot && orbit) { orbit.autoRotate = rot.checked; orbit.autoRotateSpeed = 0.9; }
}

function setMoveMode(mode, quiet) {
  moveMode = mode;
  applyMoveMode();
  document.querySelectorAll('#menu-move [data-move]').forEach((b) => {
    const on = b.dataset.move === mode;
    b.classList.toggle('active', on);
    b.textContent = (on ? '\u2713 ' : '') + b.textContent.replace(/^\u2713 /, '');
  });
  document.querySelectorAll('.navbtn[data-move]').forEach((b) => b.classList.toggle('on', b.dataset.move === mode));
  if (!quiet) {
    setStatus(mode === 'pan' ? 'Pan mode — drag with the left mouse button to slide the view.'
      : mode === 'zoom' ? 'Zoom mode — drag up / down with the left mouse button.'
      : 'Orbit mode — drag with the left mouse button to rotate.');
  }
}

function selectionBox() {
  const box = new THREE.Box3();
  if (state.isIFC && state.ifcLoader && state.modelID != null) {
    try {
      const m = state.ifcLoader.ifcManager.getSubset(state.modelID, selMat);
      if (m) box.expandByObject(m);
    } catch (e) { /* ignore */ }
  }
  state.selection.forEach((n) => { if (n.obj) box.expandByObject(n.obj); });
  return box;
}

function frameBox(box) {
  if (!box || box.isEmpty()) return false;
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const d = (Math.max(size.x, size.y, size.z) || 1) * 1.9;
  orbit.target.copy(c);
  activeCamera.position.copy(c).add(new THREE.Vector3(d * 0.62, d * 0.5, d * 0.62));
  orbit.update();
  return true;
}

function zoomToSelection() {
  if (!state.selection.size) { setStatus('Select something first, then zoom to it.'); return; }
  const box = selectionBox();
  if (!frameBox(box)) { toast('The selection has no visible geometry.'); return; }
  setStatus('Zoomed to the selected part.');
}

function homeView() {
  if (!state.root) { setStatus('Open a model first.'); return; }
  if (isOrtho) setProjection('persp');
  activeCamera.up.set(0, 1, 0);
  fitToModel();
  setStatus('Home view.');
}

function setGridVisible(on) {
  gridOn = on;
  if (grid) grid.visible = on;
}

function setShadowsOn(on) {
  renderer.shadowMap.enabled = on;
  renderer.shadowMap.needsUpdate = true;
  dir.castShadow = on;
  scene.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach((m) => { if (m) m.needsUpdate = true; });
  });
}

/* ==========================================================================
   Materials: make every loader's output look consistent (PBR + shadows)
   ========================================================================== */
function toStandardMaterial(m, geo) {
  if (!m) return m;
  if (m.isMeshStandardMaterial) return m;
  if (m.map || m.alphaMap || m.emissiveMap || m.normalMap) return m; // keep textured originals
  const std = new THREE.MeshStandardMaterial({
    color: m.color ? m.color.clone() : new THREE.Color(0xb9c1cc),
    metalness: 0.06,
    roughness: 0.82,
    transparent: !!m.transparent,
    opacity: m.opacity !== undefined ? m.opacity : 1,
    side: m.side,
    vertexColors: !!(geo && geo.attributes && geo.attributes.color),
    flatShading: false
  });
  std.name = m.name || '';
  return std;
}

function polish(root) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isLine && !o.isPoints) return;
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      const geo = o.geometry;
      if (Array.isArray(o.material)) o.material = o.material.map((m) => toStandardMaterial(m, geo));
      else o.material = toStandardMaterial(o.material, geo);
      const stds = Array.isArray(o.material) ? o.material : [o.material];
      stds.forEach((m) => { if (m && m.isMeshStandardMaterial && m.envMapIntensity === 1) m.envMapIntensity = 0.5; });
      if (geo && !geo.attributes.normal && geo.attributes.position) geo.computeVertexNormals();
    }
  });
}

function disposeRoot() {
  if (!state.root) return;
  if (state.isIFC && state.ifcLoader) {
    try { state.ifcLoader.ifcManager.removeSubset(state.modelID, scene, selMat); } catch (e) {}
    try { state.ifcLoader.ifcManager.removeSubset(state.modelID, scene); } catch (e) {}
    try { state.ifcLoader.ifcManager.close(state.modelID, scene); } catch (e) {}
  }
  state.root.traverse((o) => {
    if (o.geometry && o.geometry.dispose) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    mats.forEach((m) => {
      if (!m) return;
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap'].forEach((k) => {
        if (m[k] && m[k].dispose) m[k].dispose();
      });
      if (m.dispose) m.dispose();
    });
  });
  scene.remove(state.root);
  state.root = null;
  state.nodes = [];
  state.byId.clear();
  state.selection.clear();
  state.savedMats.clear();
  state.isolateKey = null;
  state.hiddenByIso = [];
  state.ghosted = [];
  $('tree').innerHTML = '';
  $('props').innerHTML = '<div class="empty">Nothing selected.</div>';
  state.triCount = 0;
  updateBadge();
}

/* ==========================================================================
   Format loaders
   ========================================================================== */
const dec = new TextDecoder('utf-8');

async function parseGLTF(buf, ext) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  // optional Draco compression support
  try {
    const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(draco);
  } catch (e) { /* non-fatal */ }
  const gltf = await new Promise((res, rej) => loader.parse(buf, '', res, rej));
  return gltf.scene || (gltf.scenes && gltf.scenes[0]);
}

async function parseOBJ(buf) {
  const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
  return new OBJLoader().parse(dec.decode(buf));
}

async function parseSTL(buf) {
  const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
  const geo = new STLLoader().parse(buf);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb9c1cc, metalness: 0.08, roughness: 0.72 }));
  mesh.name = 'STL mesh';
  const g = new THREE.Group(); g.add(mesh); return g;
}

async function parsePLY(buf) {
  const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js');
  const geo = new PLYLoader().parse(buf);
  const hasColor = !!(geo.attributes.color);
  const mat = new THREE.MeshStandardMaterial({ color: hasColor ? 0xffffff : 0xb9c1cc, vertexColors: hasColor, metalness: 0.08, roughness: 0.75 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'PLY mesh';
  const g = new THREE.Group(); g.add(mesh); return g;
}

async function parseFBX(buf) {
  const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
  return new FBXLoader().parse(buf, '');
}

async function parseDAE(buf) {
  const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js');
  return new ColladaLoader().parse(dec.decode(buf), '').scene;
}

async function parse3DS(buf) {
  const { TDSLoader } = await import('three/addons/loaders/TDSLoader.js');
  return new TDSLoader().parse(buf, '');
}

async function parse3MF(buf) {
  const { ThreeMFLoader } = await import('three/addons/loaders/3MFLoader.js');
  return new ThreeMFLoader().parse(buf);
}

async function parseAMF(buf) {
  const { AMFLoader } = await import('three/addons/loaders/AMFLoader.js');
  // AMFLoader handles both plain XML and ZIP-compressed AMF, so pass the buffer
  return new AMFLoader().parse(buf);
}

async function parseWRL(buf) {
  const { VRMLLoader } = await import('three/addons/loaders/VRMLLoader.js');
  return new VRMLLoader().parse(dec.decode(buf), '');
}

/* --- OFF (Object File Format) — line based, tolerant parser --------------- */
function parseOFF(buf) {
  const lines = dec.decode(buf).split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter((l) => l.length > 0);
  if (!lines.length) throw new Error('OFF: empty file');

  const head = lines[0].split(/\s+/);
  const header = head[0].toUpperCase();
  if (header.indexOf('OFF') === -1) throw new Error('OFF: missing OFF header');
  const hasColor = header.indexOf('C') !== -1;

  let counts;
  let li;
  if (head.length >= 3) { counts = head.slice(1); li = 1; }        // OFF 8 6 0
  else { counts = (lines[1] || '').split(/\s+/); li = 2; }         // OFF \n 8 6 0

  const nv = parseInt(counts[0], 10);
  const nf = parseInt(counts[1], 10);
  if (isNaN(nv) || isNaN(nf)) throw new Error('OFF: bad element counts');

  const verts = new Float32Array(nv * 3);
  const colors = new Float32Array(nv * 3);
  let anyColor = false;

  for (let v = 0; v < nv && li < lines.length; v++, li++) {
    const p = lines[li].split(/\s+/).map(Number);
    verts[v * 3] = p[0] || 0; verts[v * 3 + 1] = p[1] || 0; verts[v * 3 + 2] = p[2] || 0;
    const hasC = p.length >= 6 && !isNaN(p[3]);
    if (hasC) {
      const sc = (p[3] > 1 || p[4] > 1 || p[5] > 1) ? 1 / 255 : 1;
      colors[v * 3] = p[3] * sc; colors[v * 3 + 1] = p[4] * sc; colors[v * 3 + 2] = p[5] * sc;
      anyColor = true;
    } else {
      colors[v * 3] = colors[v * 3 + 1] = colors[v * 3 + 2] = 0.72;
    }
  }

  const idx = [];
  for (let f = 0; f < nf && li < lines.length; f++, li++) {
    const p = lines[li].split(/\s+/).map(Number);
    const n = p[0];
    if (!n || n < 3) continue;
    for (let k = 1; k < n - 1; k++) idx.push(p[1], p[k + 1], p[k + 2]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  if (anyColor) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: anyColor ? 0xffffff : 0xb9c1cc,
    vertexColors: anyColor,
    metalness: 0.08, roughness: 0.8, side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'OFF mesh';
  const g = new THREE.Group(); g.add(mesh); return g;
}

/* --- dotbim (.bim) — JSON mesh format ------------------------------------ */
function parseDOTBIM(buf) {
  const data = JSON.parse(dec.decode(buf));
  const meshes = data.meshes || [];
  const elements = data.elements || [];
  const group = new THREE.Group();
  group.name = (data.meta && data.meta.file_name) || 'dotbim';
  meshes.forEach((m, mi) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(m.coordinates || [], 3));
    if (m.indices && m.indices.length) geo.setIndex(m.indices);
    geo.computeVertexNormals();
    const users = elements.filter((e) => e.mesh_id === mi);
    if (!users.length) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb9c1cc }));
      mesh.name = m.name || ('mesh ' + mi);
      group.add(mesh);
      return;
    }
    users.forEach((e, k) => {
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb9c1cc, metalness: 0.05, roughness: 0.85 }));
      const c = e.color;
      if (c) mesh.material.color = new THREE.Color(c.r, c.g, c.b).convertSRGBToLinear();
      const v = e.vector || { x: 0, y: 0, z: 0 };
      mesh.position.set(v.x || 0, v.y || 0, v.z || 0);
      const q = e.rotation;
      if (q && (q.qx || q.qy || q.qz || q.qw)) mesh.quaternion.set(q.qx || 0, q.qy || 0, q.qz || 0, q.qw === undefined ? 1 : q.qw);
      const info = e.info || {};
      mesh.name = info.Name || info.name || (e.type ? e.type + ' ' + (k + 1) : 'element ' + k);
      mesh.userData.dotbim = { type: e.type, guid: e.guid, info };
      group.add(mesh);
    });
  });
  return group;
}

/* --- OpenCascade: STEP / IGES / BREP (and FreeCAD's embedded BREP) -------- */
let occtPromise = null;
function ensureOCCT() {
  if (occtPromise) return occtPromise;
  occtPromise = new Promise((resolve, reject) => {
    const boot = () => {
      try {
        Promise.resolve(window.occtimportjs({ locateFile: (f) => OCCT_BASE + f })).then(resolve, reject);
      } catch (e) { reject(e); }
    };
    if (window.occtimportjs) return boot();
    const s = document.createElement('script');
    s.src = OCCT_BASE + 'occt-import-js.js';
    s.onload = boot;
    s.onerror = () => reject(new Error('Could not download the CAD (OpenCascade) engine — check your connection.'));
    document.head.appendChild(s);
  });
  return occtPromise;
}

function occtResultToObject(result, label) {
  if (!result || result.success === false) throw new Error('The CAD engine could not read this ' + label + ' file.');
  const meshes = result.meshes || [];
  if (!meshes.length) throw new Error('No solids were found in this ' + label + ' file.');
  const group = new THREE.Group();
  group.name = (result.root && result.root.name) || label;
  meshes.forEach((m, i) => {
    if (!m.attributes || !m.attributes.position || !m.index) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
    if (m.attributes.normal) geo.setAttribute('normal', new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
    geo.setIndex(m.index.array);
    if (!m.attributes.normal) geo.computeVertexNormals();
    // occt reports [0,0,0] when the file carries no colour — fall back to steel grey
    const c = (m.color && m.color.length === 3 && (m.color[0] + m.color[1] + m.color[2]) > 0.02)
      ? m.color : [0.72, 0.74, 0.78];
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(c[0], c[1], c[2]).convertSRGBToLinear(),
      metalness: 0.12, roughness: 0.66, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = m.name || (label + ' solid ' + (i + 1));
    mesh.userData.solidName = m.name || '';
    group.add(mesh);
  });
  return group;
}

async function parseOCCT(buf, ext) {
  const occt = await ensureOCCT();
  let result;
  if (ext === 'brep') result = occt.ReadBrepFile(buf, null);
  else if (ext === 'iges') result = occt.ReadIgesFile(buf, null);
  else result = occt.ReadStepFile(buf, null);
  return occtResultToObject(result, ext.toUpperCase());
}

/* --- FreeCAD .FCStd — a ZIP that stores the shape as embedded BREP ------- */
async function parseFCStd(buf) {
  const fflate = await import('three/addons/libs/fflate.module.js');
  const files = fflate.unzipSync(new Uint8Array(buf));
  const names = Object.keys(files).filter((n) => /\.(brp|brep)$/i.test(n));
  if (!names.length) throw new Error('This FreeCAD file stores no B-rep shape (save it with "Part" shapes, or export as STEP).');
  names.sort((a, b) => files[b].length - files[a].length);
  const occt = await ensureOCCT();
  const result = occt.ReadBrepFile(files[names[0]], null);
  const obj = occtResultToObject(result, 'BREP');
  obj.name = 'FreeCAD shape';
  return obj;
}

/* --- Rhino .3dm --------------------------------------------------------- */
async function parse3DM(buf, name) {
  const { Rhino3dmLoader } = await import('three/addons/loaders/3DMLoader.js');
  const loader = new Rhino3dmLoader();
  loader.setLibraryPath(RHINO_BASE);
  const url = URL.createObjectURL(new Blob([buf]));
  try {
    const obj = await new Promise((res, rej) => loader.load(url, res, undefined, rej));
    obj.name = name || 'Rhino model';
    return obj;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

/* --- IFC (web-ifc through three's IFCLoader) ---------------------------- */
async function parseIFC(buf) {
  const { IFCLoader } = await import('three/addons/loaders/IFCLoader.js');
  if (!state.ifcLoader) {
    state.ifcLoader = new IFCLoader();
    state.ifcLoader.ifcManager.setWasmPath('https://unpkg.com/three@' + THREE_VER + '/examples/jsm/loaders/ifc/', true);
  }
  const url = URL.createObjectURL(new Blob([buf]));
  try {
    const model = await new Promise((res, rej) => state.ifcLoader.load(url, res, undefined, rej));
    state.modelID = model.modelID;
    model.name = 'IFC model';
    return model;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

/* ==========================================================================
   Load pipeline
   ========================================================================== */
function extOf(name) {
  const clean = String(name || '').split('#')[0].split('?')[0];
  const m = clean.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

function countTriangles(root) {
  let tri = 0;
  root.traverse((o) => {
    if (o.isMesh && o.geometry) {
      const g = o.geometry;
      const n = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
      tri += Math.floor(n / 3);
    }
  });
  return tri;
}

async function loadBuffer(buf, name, url) {
  const ext = extOf(name);
  const fmt = FORMATS[ext];
  if (!fmt) throw new Error('Unsupported file type “' + (ext || '?') + '”. Try: ' + Object.keys(FORMATS).join(', '));

  disposeRoot();
  state.isIFC = false;
  state.modelID = null;
  state.format = fmt;
  state.name = name || ('model.' + ext);
  state.url = url || null;

  showLoader('Reading ' + fmt.label + '…');
  setStatus('Loading ' + state.name + ' (' + fmt.label + ')…');

  let root;
  switch (fmt.kind) {
    case 'ifc':   root = await parseIFC(buf); state.isIFC = true; break;
    case 'gltf':  root = await parseGLTF(buf, ext); break;
    case 'obj':   root = await parseOBJ(buf); break;
    case 'stl':   root = await parseSTL(buf); break;
    case 'ply':   root = await parsePLY(buf); break;
    case 'fbx':   root = await parseFBX(buf); break;
    case 'dae':   root = await parseDAE(buf); break;
    case '3ds':   root = await parse3DS(buf); break;
    case '3mf':   root = await parse3MF(buf); break;
    case 'amf':   root = await parseAMF(buf); break;
    case 'wrl':   root = await parseWRL(buf); break;
    case 'off':   root = parseOFF(buf); break;
    case 'bim':   root = parseDOTBIM(buf); break;
    case 'occt':  root = await parseOCCT(buf, fmt.ext); break;
    case 'fcstd': root = await parseFCStd(buf); break;
    case '3dm':   root = await parse3DM(buf, state.name); break;
    default: throw new Error('No loader for ' + fmt.label);
  }
  if (!root) throw new Error('The ' + fmt.label + ' file produced no geometry.');
  if (!root.isObject3D) throw new Error('Unexpected ' + fmt.label + ' content.');

  polish(root);
  if (state.isIFC) {
    // IFC meshes carry per-vertex colours; keep them but let PBR lighting work
    root.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.color) o.material.vertexColors = true;
    });
  }

  state.root = root;
  root.userData.format = fmt.label;
  scene.add(root);

  state.box = modelBox();
  fitToModel();
  buildIndex();
  renderTree();
  updateBadge();

  const tri = countTriangles(root);
  state.triCount = tri;
  updateBadge();

  hideLoader();
  $('start').hidden = true;
  $('empty-hint').hidden = true;
  setStatus(state.name + ' — ' + fmt.label + ' loaded.' + (state.isIFC ? '' : ' Click a part to inspect it.'));

  // restore a shared camera view if the link carried one
  if (pendingCam) { applyCameraState(pendingCam); pendingCam = null; }
  if (clipMode !== 'off') applyClip();
}

function updateBadge() {
  const b = $('badge');
  if (!state.root) { b.hidden = true; return; }
  b.hidden = false;
  let txt = '<b>' + escapeHtml(state.name) + '</b> · ' + (state.format ? state.format.label : '');
  if (state.triCount) txt += ' · ' + state.triCount.toLocaleString() + ' triangles';
  b.innerHTML = txt;
}

/* ==========================================================================
   Model tree + element index
   ========================================================================== */
function escapeHtml(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function prettyType(t) {
  if (!t) return 'Item';
  return String(t).replace(/^IFC/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
}

function iconFor(type) {
  const t = String(type || '').toLowerCase();
  if (/storey|level|buildingstorey/.test(t)) return '🏢';
  if (/site/.test(t)) return '🌐';
  if (/building/.test(t)) return '🏗';
  if (/wall/.test(t)) return '🧱';
  if (/slab|floor|plate/.test(t)) return '▭';
  if (/column/.test(t)) return '▮';
  if (/beam/.test(t)) return '▬';
  if (/door/.test(t)) return '🚪';
  if (/window/.test(t)) return '🪟';
  if (/pipe/.test(t)) return '⌐';
  if (/space/.test(t)) return '⬚';
  return '◻';
}

function buildIndex() {
  state.nodes = [];
  state.byId.clear();
  const nodes = [];

  if (state.isIFC && state.ifcLoader) {
    let struct = null;
    try { struct = state.ifcLoader.ifcManager.getSpatialStructure(state.modelID, true); } catch (e) { struct = null; }
    const convert = (n) => {
      const id = n.expressID;
      const type = prettyType(n.type);
      const label = n.name || n.longName || (type + ' #' + id);
      const node = { id: 'ifc-' + id, expressID: id, label: label, type: type, children: [], ids: [] };
      const kids = n.children || [];
      kids.forEach((c) => node.children.push(convert(c)));
      if (!node.children.length) node.ids.push(id);
      else node.children.forEach((c) => node.ids.push.apply(node.ids, c.ids));
      state.byId.set(node.id, node);
      if (node.children.length || n.expressID !== undefined) state.nodes.push(node);
      return node;
    };
    if (struct) {
      const roots = Array.isArray(struct) ? struct : [struct];
      roots.forEach((r) => nodes.push(convert(r)));
    }
  }

  if (!nodes.length) {
    // generic formats: mirror the scene graph
    const convertObj = (obj, depth) => {
      const label = obj.name || (obj.type + ' ' + obj.id);
      const node = { id: 'obj-' + obj.uuid, obj: obj, label: label, type: obj.type, children: [], ids: [obj.uuid] };
      state.byId.set(node.id, node);
      state.nodes.push(node);
      if (depth < 40) {
        (obj.children || []).forEach((c) => {
          if (c.isMesh || c.isGroup || c.isObject3D) node.children.push(convertObj(c, depth + 1));
        });
      }
      node.children.forEach((c) => { (c.ids || []).forEach((i) => { if (node.ids.indexOf(i) === -1) node.ids.push(i); }); });
      return node;
    };
    (state.root.children || []).forEach((c) => nodes.push(convertObj(c, 0)));
    if (!nodes.length) nodes.push(convertObj(state.root, 0));
  }

  state.treeRoots = nodes;
  return nodes;
}

function renderTree() {
  const host = $('tree');
  host.innerHTML = '';
  const roots = state.treeRoots || [];
  if (!roots.length) { host.innerHTML = '<div class="empty" style="color:#8b97a7">No structure available.</div>'; return; }

  const makeRow = (node, depth, parentReveal) => {
    const wrap = document.createElement('div');
    wrap.className = 'node';
    const row = document.createElement('div');
    row.className = 'node-row';
    row.style.paddingLeft = (depth * 10 + 4) + 'px';
    const caret = document.createElement('span');
    caret.className = 'caret';
    caret.textContent = node.children.length ? '▸' : '';
    const icon = document.createElement('span');
    icon.className = 'node-icon';
    icon.textContent = iconFor(node.type);
    const label = document.createElement('span');
    label.className = 'node-label';
    label.textContent = node.label;
    label.title = node.label + (node.type ? '  (' + node.type + ')' : '');
    row.appendChild(caret); row.appendChild(icon); row.appendChild(label);
    wrap.appendChild(row);

    // children are built lazily so huge IFC trees do not freeze the browser
    let kidsEl = null;
    let built = false;
    const buildKids = () => {
      if (built || !kidsEl) return;
      built = true;
      node.children.forEach((c) => kidsEl.appendChild(makeRow(c, depth + 1, reveal)));
    };
    if (node.children.length) {
      kidsEl = document.createElement('div');
      kidsEl.className = 'children';
      kidsEl.hidden = depth > 1;
      if (!kidsEl.hidden) buildKids();
      wrap.appendChild(kidsEl);
    }

    const toggle = (e) => {
      if (e) e.stopPropagation();
      if (!kidsEl) return;
      if (kidsEl.hidden) buildKids();
      kidsEl.hidden = !kidsEl.hidden;
      caret.textContent = kidsEl.hidden ? '▸' : '▾';
    };

    function reveal() {
      if (parentReveal) parentReveal();
      if (kidsEl && kidsEl.hidden) toggle();
    }
    node._reveal = reveal;
    row.addEventListener('click', (e) => {
      if (e.detail >= 1) { /* single click selects */ }
      selectNode(node, e.ctrlKey || e.metaKey || state.multi);
      if (node.children.length) toggle();
    });
    row.addEventListener('dblclick', (e) => { e.stopPropagation(); if (node.children.length) toggle(); });
    if (!kidsEl.hidden && node.children.length) caret.textContent = '▾';
    node._row = row;
    return wrap;
  };

  roots.forEach((n) => host.appendChild(makeRow(n, 0)));
}

/* ==========================================================================
   Properties panel
   ========================================================================== */
function propRow(k, v) {
  if (v === undefined || v === null || v === '') return '';
  return '<div class="prop-row"><span class="k">' + escapeHtml(k) + '</span><span class="v">' + escapeHtml(v) + '</span></div>';
}

function renderProperties(node) {
  const host = $('props');
  if (!node) { host.innerHTML = '<div class="empty">Nothing selected.</div>'; return; }
  let html = '';

  if (node.expressID !== undefined && state.ifcLoader) {
    const mgr = state.ifcLoader.ifcManager;
    let attrs = null, psets = null, qsets = null;

    html += '<div class="prop-group"><h4>' + escapeHtml(node.type || 'Element') + '</h4>';
    html += propRow('Express ID', node.expressID);
    html += propRow('Name', node.label);
    html += '</div>';

    try { attrs = mgr.getItemProperties(state.modelID, node.expressID, false); } catch (e) { attrs = null; }
    if (attrs) {
      let rows = '';
      ['GlobalId', 'Tag', 'ObjectType', 'Description', 'PredefinedType', 'OverallWidth', 'OverallHeight'].forEach((k) => {
        const v = attrs[k];
        if (v === null || v === undefined) return;
        const val = (typeof v === 'object' && v.value !== undefined) ? v.value : v;
        if (typeof val === 'object') return;
        rows += propRow(k, val);
      });
      if (rows) html += '<div class="prop-group"><h4>Attributes</h4>' + rows + '</div>';
    }

    try { psets = mgr.getPropertySets(state.modelID, node.expressID, true); } catch (e) { psets = null; }
    if (Array.isArray(psets) && psets.length) {
      psets.forEach((set) => {
        const rows = [];
        (set.HasProperties || []).forEach((hp) => {
          if (!hp || !hp.Name) return;
          let v = hp.NominalValue;
          if (v && typeof v === 'object') v = v.value !== undefined ? v.value : (v.Name !== undefined ? v.Name : '');
          if (typeof v === 'object') return;
          if (v === null || v === undefined || v === '') return;
          rows.push(propRow(hp.Name, v));
        });
        if (rows.length) html += '<div class="prop-group"><h4>' + escapeHtml(set.Name || 'Property set') + '</h4>' + rows.join('') + '</div>';
      });
    }

    try { qsets = mgr.getQuantities ? mgr.getQuantities(state.modelID, node.expressID, true) : null; } catch (e) { qsets = null; }
    if (Array.isArray(qsets) && qsets.length) {
      qsets.forEach((set) => {
        const rows = [];
        (set.HasQuantities || []).forEach((q) => {
          if (!q || !q.Name) return;
          let v = q.LengthValue !== undefined ? q.LengthValue
            : q.AreaValue !== undefined ? q.AreaValue
            : q.VolumeValue !== undefined ? q.VolumeValue
            : q.CountValue !== undefined ? q.CountValue
            : q.WeightValue !== undefined ? q.WeightValue : undefined;
          if (v && typeof v === 'object') v = v.value !== undefined ? v.value : undefined;
          if (v === undefined || v === null) return;
          rows.push(propRow(q.Name, v));
        });
        if (rows.length) html += '<div class="prop-group"><h4>' + escapeHtml(set.Name || 'Quantities') + '</h4>' + rows.join('') + '</div>';
      });
    }
  } else {
    const o = node.obj;
    html += '<div class="prop-group"><h4>' + escapeHtml(node.type || 'Object') + '</h4>';
    html += propRow('Name', node.label);
    if (o) {
      html += propRow('Type', o.type);
      if (o.isMesh && o.geometry) {
        const g = o.geometry;
        const pos = g.attributes.position ? g.attributes.position.count : 0;
        const tri = g.index ? Math.floor(g.index.count / 3) : Math.floor(pos / 3);
        html += propRow('Vertices', pos.toLocaleString());
        html += propRow('Triangles', tri.toLocaleString());
        const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
        html += propRow('Size (x,y,z)', size.x.toFixed(2) + ' × ' + size.y.toFixed(2) + ' × ' + size.z.toFixed(2));
      }
      if (o.material && o.material.color) html += propRow('Colour', '#' + o.material.color.getHexString());
    }
    html += '</div>';
    if (o && o.userData && o.userData.dotbim && o.userData.dotbim.info) {
      const rows = Object.keys(o.userData.dotbim.info).map((k) => propRow(k, o.userData.dotbim.info[k]));
      if (rows.length) html += '<div class="prop-group"><h4>Element info</h4>' + rows.join('') + '</div>';
    }
  }
  host.innerHTML = html;
}

/* ==========================================================================
   Selection + highlight + isolate
   ========================================================================== */
const selMat = new THREE.MeshStandardMaterial({
  color: 0xffb020, metalness: 0.25, roughness: 0.35, emissive: 0x3a1d00,
  transparent: true, opacity: 0.92, depthTest: true
});

function clearGenericHighlight() {
  state.savedMats.forEach((rec) => {
    if (rec && rec.obj) rec.obj.material = rec.mats.length === 1 ? rec.mats[0] : rec.mats;
  });
  state.savedMats.clear();
}

function applyHighlight() {
  const nodes = Array.from(state.selection.values());
  if (state.isIFC) {
    const ids = [];
    nodes.forEach((n) => (n.ids || []).forEach((i) => ids.push(i)));
    try {
      if (!ids.length) state.ifcLoader.ifcManager.removeSubset(state.modelID, scene, selMat);
      else {
        state.ifcLoader.ifcManager.createSubset({
          modelID: state.modelID, ids: ids.filter((v, i, a) => a.indexOf(v) === i),
          material: selMat, scene: scene, removePrevious: true, customID: 'sel'
        });
      }
    } catch (e) { console.warn('highlight failed', e); }
    if (clipMode !== 'off') applyClip();
    return;
  }
  clearGenericHighlight();
  nodes.forEach((n) => {
    if (!n.obj) return;
    n.obj.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (!state.savedMats.has(o.uuid)) {
        state.savedMats.set(o.uuid, { obj: o, mats: Array.isArray(o.material) ? o.material.slice() : [o.material] });
      }
      o.material = selMat;
    });
  });
  if (clipMode !== 'off') applyClip();
}

function selectNode(node, additive) {
  if (!node) return;
  if (!additive) state.selection.clear();
  // collapse to one node if the same one is clicked again
  if (additive && state.selection.has(node.id)) state.selection.delete(node.id);
  else state.selection.set(node.id, node);

  // reflect in the tree
  document.querySelectorAll('.node-row.sel').forEach((r) => r.classList.remove('sel'));
  state.selection.forEach((n) => { if (n._row) n._row.classList.add('sel'); });

  applyHighlight();
  const n = state.selection.size;
  renderProperties(node);
  setStatus(n > 1 ? n + ' items selected.' : 'Selected: ' + node.label);
}

function currentObjects() {
  const out = [];
  state.selection.forEach((n) => {
    if (n.obj) out.push(n.obj);
    else if (n.expressID !== undefined) out.push(null);
  });
  return out;
}

function focusOn(node) {
  if (!node.obj) return;
  const box = new THREE.Box3().setFromObject(node.obj);
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const d = Math.max(s.x, s.y, s.z) * 2.4 + 0.001;
  orbit.target.copy(c);
  activeCamera.position.copy(c).add(new THREE.Vector3(d * 0.6, d * 0.45, d * 0.6));
  orbit.update();
}

function clearSelection() {
  state.selection.clear();
  document.querySelectorAll('.node-row.sel').forEach((r) => r.classList.remove('sel'));
  if (state.isIFC) {
    try { state.ifcLoader.ifcManager.removeSubset(state.modelID, scene, selMat); } catch (e) {}
  } else {
    clearGenericHighlight();
  }
  renderProperties(null);
}

/* ------------------------------------------------------------- isolation */
function isolateSelection() {
  const nodes = Array.from(state.selection.values());
  if (!nodes.length) { setStatus('Select something first.'); return; }
  showAll(true);

  if (state.isIFC) {
    const ids = [];
    nodes.forEach((n) => (n.ids || []).forEach((i) => ids.push(i)));
    try {
      state.root.visible = false;
      state.ifcLoader.ifcManager.createSubset({
        modelID: state.modelID, ids: ids, scene: scene, removePrevious: true, customID: 'iso'
      });
      state.isolateKey = 'ifc';
      setStatus('Isolated ' + ids.length + ' element(s). Click “Show all” to restore.');
    } catch (e) { toast('Isolate failed: ' + e.message); }
    return;
  }

  const keep = new Set();
  nodes.forEach((n) => { if (n.obj) n.obj.traverse((o) => keep.add(o)); });
  state.hiddenByIso = [];
  state.root.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    if (!keep.has(o) && o.visible) { o.visible = false; state.hiddenByIso.push(o); }
  });
  state.isolateKey = 'generic';
  setStatus('Isolated ' + keep.size + ' object(s). Click “Show all” to restore.');
}

function showAll(silent) {
  if (state.isolateKey === 'ifc' && state.ifcLoader) {
    try { state.ifcLoader.ifcManager.removeSubset(state.modelID, scene); } catch (e) {}
    if (state.root) state.root.visible = true;
  }
  if (state.hiddenByIso && state.hiddenByIso.length) {
    state.hiddenByIso.forEach((o) => { o.visible = true; });
    state.hiddenByIso = [];
  }
  state.isolateKey = null;
  if (!silent) setStatus('Showing the whole model.');
}

/* ------------------------------------------------------------------ pick */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function pickAt(ev) {
  if (!state.root) return null;
  const r = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, activeCamera);

  let hits = [];
  if (state.isIFC) {
    hits = raycaster.intersectObject(state.root, false);
  } else {
    hits = raycaster.intersectObject(state.root, true);
  }
  if (!hits.length) return null;
  const hit = hits[0];

  if (state.isIFC) {
    let id = null;
    try { id = state.ifcLoader.ifcManager.getExpressId(hit.object.geometry, hit.faceIndex); } catch (e) { id = null; }
    if (id === undefined || id === null) return null;
    return resolveIfcNode(id);
  }

  let o = hit.object;
  // climb to the object that the tree knows about
  while (o && !state.byId.get('obj-' + o.uuid) && o.parent) o = o.parent;
  const node = o ? state.byId.get('obj-' + o.uuid) : null;
  if (node) return node;
  return { id: 'obj-' + hit.object.uuid, obj: hit.object, label: hit.object.name || hit.object.type, type: hit.object.type, ids: [hit.object.uuid], children: [] };
}

function resolveIfcNode(expressID) {
  const existing = state.byId.get('ifc-' + expressID);
  if (existing) return existing;
  let type = '', label = '';
  try {
    type = prettyType(state.ifcLoader.ifcManager.getIfcType(state.modelID, expressID) || '');
  } catch (e) {}
  try {
    const p = state.ifcLoader.ifcManager.getItemProperties(state.modelID, expressID, false);
    if (p) label = p.Name || p.LongName || '';
  } catch (e) {}
  const node = { id: 'ifc-' + expressID, expressID: expressID, label: label || ('Element #' + expressID), type: type, children: [], ids: [expressID] };
  state.byId.set(node.id, node);
  return node;
}

let downPt = null;
canvas.addEventListener('pointerdown', (ev) => { downPt = { x: ev.clientX, y: ev.clientY }; });
canvas.addEventListener('click', (ev) => {
  if (walk.active) return;
  // ignore the click that ends an orbit/pan drag
  if (downPt && (Math.abs(ev.clientX - downPt.x) > 5 || Math.abs(ev.clientY - downPt.y) > 5)) return;
  const node = pickAt(ev);
  if (!node) { clearSelection(); return; }
  const additive = ev.ctrlKey || ev.metaKey || ev.shiftKey || state.multi;
  let target = node;

  if (state.selMode === 'parent') {
    let p = node;
    while (p && p.parent) p = p.parent;
    target = p || node;
  } else if (state.selMode === 'type' && node.type) {
    const same = state.nodes.filter((n) => n.type === node.type && n.expressID !== undefined).slice(0, 4000);
    if (same.length) {
      if (!additive) state.selection.clear();
      same.forEach((n) => state.selection.set(n.id, n));
      applyHighlight();
      document.querySelectorAll('.node-row.sel').forEach((r) => r.classList.remove('sel'));
      state.selection.forEach((n) => { if (n._row) n._row.classList.add('sel'); });
      renderProperties(node);
      setStatus(same.length + ' items of type ' + node.type + ' selected.');
      return;
    }
  }

  const already = state.selection.has(target.id);
  if (additive) {
    if (already) {
      state.selection.delete(target.id);
      if (target._row) target._row.classList.remove('sel');
      applyHighlight();
      setStatus(state.selection.size + ' selected.');
      return;
    }
  }
  selectNode(target, additive);
});

canvas.addEventListener('dblclick', (ev) => {
  const node = pickAt(ev);
  if (node) { selectNode(node, false); isolateSelection(); }
});

/* ------------------------------------------------------------------ search */
let searchTimer = null;
$('search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim().toLowerCase();
  searchTimer = setTimeout(() => runSearch(q), 260);
});
$('search').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; runSearch(''); } });

function runSearch(q) {
  if (!state.root) return;
  if (!q) { clearSelection(); showAll(); setStatus('Search cleared.'); return; }
  const matches = [];
  state.nodes.forEach((n) => {
    if (n.children && n.children.length) return;
    const hay = (n.label + ' ' + n.type + ' ' + (n.expressID !== undefined ? n.expressID : '')).toLowerCase();
    if (hay.indexOf(q) !== -1) matches.push(n);
    if (matches.length >= 600) return;
  });
  if (!matches.length) { setStatus('No match for “' + q + '”.'); return; }
  state.selection.clear();
  matches.forEach((n) => state.selection.set(n.id, n));
  document.querySelectorAll('.node-row.sel').forEach((r) => r.classList.remove('sel'));
  matches.forEach((n, i) => {
    if (n._reveal) n._reveal();          // expand ancestors so the row exists
    if (n._row) {
      n._row.classList.add('sel');
      if (i === 0) n._row.scrollIntoView({ block: 'center' });
    }
  });
  applyHighlight();
  renderProperties(matches[0]);
  setStatus(matches.length + ' match(es) — click “Isolate” or “Show all” to focus.');
}

/* ==========================================================================
   Section / clipping (single plane or box)
   ========================================================================== */
const planes = {
  x: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
  y: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
  z: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
};
// box clip: 6 inward-facing planes; kept region = intersection (box interior)
const boxPlanes = [
  new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
  new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
  new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
  new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
  new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
];
let clipMode = 'off';
let clipFlip = false;

function sectionTargets() {
  const out = [];
  if (state.root) out.push(state.root);
  // include IFC subset meshes that live at the scene root
  scene.children.forEach((c) => {
    if (c.userData && c.userData.isIfcSubset) out.push(c);
  });
  return out;
}

function applyClip() {
  if (!state.root) return;
  let active = [];

  if (clipMode === 'box') {
    const b = modelBox();
    const min = b.min, max = b.max;
    const sx = max.x - min.x, sy = max.y - min.y, sz = max.z - min.z;
    const frac = (id, dflt) => {
      const el = $(id);
      if (!el) return dflt;
      const v = el.valueAsNumber;
      return isNaN(v) ? dflt : v / 100;
    };
    let x0 = frac('box-xmin', 0), x1 = frac('box-xmax', 1);
    let y0 = frac('box-ymin', 0), y1 = frac('box-ymax', 1);
    let z0 = frac('box-zmin', 0), z1 = frac('box-zmax', 1);
    const gap = 0.02;
    if (x1 < x0 + gap) x1 = Math.min(1, x0 + gap);
    if (y1 < y0 + gap) y1 = Math.min(1, y0 + gap);
    if (z1 < z0 + gap) z1 = Math.min(1, z0 + gap);
    const xMin = min.x + sx * x0, xMax = min.x + sx * x1;
    const yMin = min.y + sy * y0, yMax = min.y + sy * y1;
    const zMin = min.z + sz * z0, zMax = min.z + sz * z1;
    boxPlanes[0].constant = -xMin;
    boxPlanes[1].constant = xMax;
    boxPlanes[2].constant = -yMin;
    boxPlanes[3].constant = yMax;
    boxPlanes[4].constant = -zMin;
    boxPlanes[5].constant = zMax;
    active = boxPlanes;
  } else if (clipMode !== 'off') {
    const b = modelBox();
    const min = b.min, max = b.max;
    const el = $('clip-range');
    const t = el ? (isNaN(el.valueAsNumber) ? 0.5 : el.valueAsNumber / 100) : 0.5;
    const pl = planes[clipMode];
    const sign = clipFlip ? -1 : 1;
    if (clipMode === 'x') { pl.normal.set(-sign, 0, 0); pl.constant = sign * (min.x + (max.x - min.x) * t); }
    if (clipMode === 'y') { pl.normal.set(0, -sign, 0); pl.constant = sign * (min.y + (max.y - min.y) * t); }
    if (clipMode === 'z') { pl.normal.set(0, 0, -sign); pl.constant = sign * (min.z + (max.z - min.z) * t); }
    active = [pl];
  }

  const apply = (obj) => {
    obj.traverse((c) => {
      if (!c.material) return;
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      mats.forEach((m) => { m.clippingPlanes = active; m.clipShadows = true; m.needsUpdate = true; });
    });
  };
  apply(state.root);
  // highlight / isolate subsets use their own materials
  scene.children.forEach((c) => { if (c !== state.root && c.isMesh) apply(c); });
}

/* ==========================================================================
   Walk mode (first person)
   ========================================================================== */
const walk = { active: false, keys: {}, yaw: 0, pitch: 0, speed: 1, last: 0 };
let walkSaved = null;

function startWalk() {
  if (!state.root) { toast('Load a model first.'); return; }
  if (isOrtho) setProjection('persp');
  walk.active = true;
  walkSaved = { pos: activeCamera.position.clone(), target: orbit.target.clone() };
  // put the eye at the current target, a bit above model base
  const b = modelBox();
  const size = b.getSize(new THREE.Vector3());
  walk.speed = Math.max(0.5, Math.max(size.x, size.z) / 60);
  const eye = orbit.target.clone();
  eye.y = b.min.y + Math.min(size.y * 0.5, size.y - 0.1) + (size.y > 0 ? 0 : 1.7);
  activeCamera.position.copy(eye);
  const dirv = orbit.target.clone().sub(activeCamera.position);
  walk.yaw = Math.atan2(-dirv.x, -dirv.z);
  walk.pitch = 0;
  orbit.enabled = false;
  canvas.requestPointerLock && canvas.requestPointerLock();
  $('btn-walk').classList.add('on');
  setStatus('Walk mode — WASD to move, Q/E up/down, mouse to look, Shift to run, Esc to exit.');
  document.addEventListener('keydown', walkKeyDown);
  document.addEventListener('keyup', walkKeyUp);
  document.addEventListener('mousemove', walkMouse);
  document.addEventListener('pointerlockchange', walkLockChange);
}

function endWalk() {
  if (!walk.active) return;
  walk.active = false;
  orbit.enabled = true;
  $('btn-walk').classList.remove('on');
  document.removeEventListener('keydown', walkKeyDown);
  document.removeEventListener('keyup', walkKeyUp);
  document.removeEventListener('mousemove', walkMouse);
  document.removeEventListener('pointerlockchange', walkLockChange);
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  if (walkSaved) { activeCamera.position.copy(walkSaved.pos); orbit.target.copy(walkSaved.target); orbit.update(); }
  setStatus('Exited walk mode.');
}

function walkLockChange() {
  if (!document.pointerLockElement && walk.active) endWalk();
}

function walkKeyDown(e) {
  walk.keys[e.code] = true;
  if (e.code === 'Escape') endWalk();
}
function walkKeyUp(e) { walk.keys[e.code] = false; }
function walkMouse(e) {
  if (!walk.active || document.pointerLockElement !== canvas) return;
  walk.yaw -= e.movementX * 0.0025;
  walk.pitch -= e.movementY * 0.0025;
  walk.pitch = Math.max(-1.5, Math.min(1.5, walk.pitch));
}

function updateWalk(dt) {
  if (!walk.active) return;
  const dirv = new THREE.Vector3(
    -Math.sin(walk.yaw) * Math.cos(walk.pitch),
    Math.sin(walk.pitch),
    -Math.cos(walk.yaw) * Math.cos(walk.pitch)
  );
  const look = activeCamera.position.clone().add(dirv);
  activeCamera.lookAt(look);

  const fwd = new THREE.Vector3(-Math.sin(walk.yaw), 0, -Math.cos(walk.yaw));
  const right = new THREE.Vector3(Math.cos(walk.yaw), 0, -Math.sin(walk.yaw));
  const v = new THREE.Vector3();
  if (walk.keys['KeyW'] || walk.keys['ArrowUp']) v.add(fwd);
  if (walk.keys['KeyS'] || walk.keys['ArrowDown']) v.sub(fwd);
  if (walk.keys['KeyD'] || walk.keys['ArrowRight']) v.add(right);
  if (walk.keys['KeyA'] || walk.keys['ArrowLeft']) v.sub(right);
  if (walk.keys['KeyE']) v.y += 1;
  if (walk.keys['KeyQ']) v.y -= 1;
  if (v.lengthSq() > 0) {
    const run = walk.keys['ShiftLeft'] || walk.keys['ShiftRight'] ? 3 : 1;
    activeCamera.position.add(v.normalize().multiplyScalar(walk.speed * run * dt * 8));
  }
}
/* ==========================================================================
   Opening files: local, URL, drag & drop, shared links
   ========================================================================== */
const ACCEPT = Object.keys(FORMATS).map((e) => '.' + e).join(',');
$('file-input').accept = ACCEPT;

async function openFile(file) {
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    await loadBuffer(buf, file.name, null);
  } catch (err) {
    hideLoader();
    console.error(err);
    setStatus('Could not open ' + file.name + ': ' + err.message, true);
    const tip = /\.(fbx|dae|3ds)$/i.test(file.name)
      ? ' Tip: export the model as glTF (.glb) or OBJ from the authoring app — those load most reliably.'
      : '';
    toast('Could not open this file — ' + err.message + '.' + tip, 8000);
  }
}

async function openURL(url) {
  const clean = String(url || '').trim();
  if (!clean) return;
  try {
    const ext = extOf(clean);
    if (!FORMATS[ext]) {
      throw new Error('The link does not end in a supported file extension (got “' + (ext || 'none') + '”). Use a direct link such as .../model.step');
    }
    showLoader('Downloading ' + fmtName(ext) + '…');
    setStatus('Downloading from the web…');
    const res = await fetch(clean, { mode: 'cors' });
    if (!res.ok) throw new Error('Server replied ' + res.status + ' ' + res.statusText);
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) throw new Error('The downloaded file is empty');
    const name = decodeURIComponent(clean.split('#')[0].split('?')[0].split('/').pop()) || ('model.' + ext);
    await loadBuffer(buf, name, clean);
  } catch (err) {
    hideLoader();
    console.error(err);
    setStatus('Download failed: ' + err.message, true);
    toast('Could not load that link — ' + err.message + ' (the server must allow cross-origin access / CORS)', 7000);
  }
}

function fmtName(ext) {
  const f = FORMATS[ext];
  return f ? f.label : ext.toUpperCase();
}

$('btn-open').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length > 1) toast('Opening ' + files[0].name + ' (one model at a time).');
  if (files[0]) openFile(files[0]);
  e.target.value = '';
});

$('btn-url').addEventListener('click', () => {
  const url = prompt('Paste a direct link to a 3D model\n(.ifc .glb .gltf .step .stp .iges .obj .stl .ply .fbx .dae .3ds .3mf .amf .wrl .off .bim .fcstd .brep .3dm):', state.url || 'https://');
  if (url) openURL(url);
});

/* ---------------------------------------------------------- camera + share */
let pendingCam = null;

function cameraState() {
  const p = activeCamera.position, t = orbit.target;
  return [p.x, p.y, p.z, t.x, t.y, t.z, isOrtho ? 1 : 0].map((n) => +n.toFixed(3)).join(',');
}
function applyCameraState(s) {
  const a = String(s).split(',').map(Number);
  if (a.length < 6 || a.some(isNaN)) return;
  if (a[6] === 1 && !isOrtho) setProjection('ortho');
  if (a[6] === 0 && isOrtho) setProjection('persp');
  activeCamera.position.set(a[0], a[1], a[2]);
  orbit.target.set(a[3], a[4], a[5]);
  updateOrthoFrustum();
  orbit.update();
}

$('btn-share').addEventListener('click', async () => {
  if (!state.url) {
    toast('Sharing needs a model opened from a web link. Use “Open URL” first, then Share.', 6000);
    return;
  }
  const hash = 'model=' + encodeURIComponent(state.url) + '&' + 'cam=' + encodeURIComponent(cameraState());
  const link = location.origin + location.pathname + '#' + hash;
  try { await navigator.clipboard.writeText(link); toast('Shareable link copied to the clipboard.'); }
  catch (e) { prompt('Copy this link:', link); }
});

(function initFromHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return;
  const h = new URLSearchParams(raw);
  const model = h.get('model') || h.get('ifc');
  if (!model) return;
  pendingCam = h.get('cam');
  const url = decodeURIComponent(model);
  setTimeout(() => openURL(url), 300);
})();

/* ------------------------------------------------------------- drag & drop */
const vp = $('viewport');
let dragDepth = 0;
['dragenter', 'dragover'].forEach((evt) => {
  vp.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation();
    if (evt === 'dragenter') dragDepth++;
    $('drop').hidden = false;
  });
});
vp.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('drop').hidden = true;
});
vp.addEventListener('drop', (e) => {
  e.preventDefault(); e.stopPropagation();
  dragDepth = 0; $('drop').hidden = true;
  const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
  if (!files.length) return;
  const ok = files.filter((f) => FORMATS[extOf(f.name)]);
  if (!ok.length) {
    toast('Unsupported file. Try: ' + Object.keys(FORMATS).join(', '), 6000);
    return;
  }
  if (files.length > 1) toast('Opening ' + ok[0].name + ' (one model at a time).');
  openFile(ok[0]);
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

/* ------------------------------------------------------------------ chips */
(function buildChips() {
  const seen = new Set();
  const host = $('chips');
  Object.keys(FORMATS).forEach((ext) => {
    const f = FORMATS[ext];
    const key = f.label;
    if (seen.has(key)) return;
    seen.add(key);
    const b = document.createElement('span');
    b.className = 'chip';
    b.textContent = ext + ' · ' + f.label;
    b.addEventListener('click', () => {
      $('file-input').accept = '.' + ext;
      $('file-input').click();
      setTimeout(() => { $('file-input').accept = ACCEPT; }, 1000);
    });
    host.appendChild(b);
  });
})();
/* ==========================================================================
   Menu wiring, keyboard, render loop
   ========================================================================== */
// generic dropdown behaviour
function closeMenus(except) {
  document.querySelectorAll('.menu.open').forEach((m) => { if (m !== except) m.classList.remove('open'); });
}
document.querySelectorAll('.menu > .menu-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = btn.parentElement;
    const willOpen = !menu.classList.contains('open');
    closeMenus(menu);
    menu.classList.toggle('open', willOpen);
  });
});
document.addEventListener('click', () => closeMenus(null));
document.querySelectorAll('.menu-list').forEach((l) => l.addEventListener('click', (e) => e.stopPropagation()));

// move / pan / zoom + view helpers
document.querySelectorAll('#menu-move [data-move]').forEach((b) => {
  b.addEventListener('click', () => { setMoveMode(b.dataset.move); closeMenus(null); });
});
document.querySelectorAll('.navbtn[data-move]').forEach((b) => {
  b.addEventListener('click', () => setMoveMode(b.dataset.move));
});
$('btn-fit-model').addEventListener('click', () => { fitToModel(); closeMenus(null); });
$('rail-fit').addEventListener('click', () => fitToModel());
$('btn-home').addEventListener('click', () => { homeView(); closeMenus(null); });
$('rail-home').addEventListener('click', () => homeView());
$('btn-zoom-sel').addEventListener('click', () => { zoomToSelection(); closeMenus(null); });
$('toggle-grid').addEventListener('change', (e) => { setGridVisible(e.target.checked); });
$('grid-auto').addEventListener('change', (e) => {
  gridAuto = e.target.checked;
  updateGrid();
  setStatus(gridAuto ? 'Grid follows the model size.' : 'Grid fixed at ' + gridCell + ' x ' + gridCell + ' units.');
});
$('grid-cell').addEventListener('change', (e) => {
  const v = parseFloat(e.target.value);
  if (!isFinite(v) || v <= 0) { syncGridInputs(); return; }
  gridCell = v;
  gridAuto = false;
  $('grid-auto').checked = false;
  updateGrid();
  setStatus('Grid cell = ' + gridCell + ' model units.');
});
$('grid-extent').addEventListener('change', (e) => {
  const v = parseFloat(e.target.value);
  if (!isFinite(v) || v <= 0) { syncGridInputs(); return; }
  gridExtent = v;
  gridAuto = false;
  $('grid-auto').checked = false;
  updateGrid();
  setStatus('Grid extent = ' + gridExtent + ' model units.');
});

// formats card (hidden by default, opened from the toolbar)
$('btn-formats').addEventListener('click', () => { $('start').hidden = !$('start').hidden; });
$('start-close').addEventListener('click', () => { $('start').hidden = true; });
$('toggle-shadow').addEventListener('change', (e) => { setShadowsOn(e.target.checked); });
$('toggle-rot').addEventListener('change', (e) => {
  orbit.autoRotate = e.target.checked;
  orbit.autoRotateSpeed = 0.9;
});
canvas.addEventListener('pointerdown', () => {
  canvas.classList.add('dragging');
  if (!$('start').hidden) $('start').hidden = true;
});
window.addEventListener('pointerup', () => canvas.classList.remove('dragging'));

// views + projection
function markActive(sel, el) {
  document.querySelectorAll(sel).forEach((b) => {
    b.classList.toggle('active', b === el);
    b.textContent = (b === el ? '✓ ' : '') + b.textContent.replace(/^✓ /, '');
  });
}
document.querySelectorAll('#menu-views [data-view]').forEach((b) => {
  b.addEventListener('click', () => { setView(b.dataset.view); markActive('#menu-views [data-view]', b); });
});
document.querySelectorAll('#menu-views [data-proj]').forEach((b) => {
  b.addEventListener('click', () => { setProjection(b.dataset.proj); });
});

// section
document.querySelectorAll('#menu-section [data-axis]').forEach((b) => {
  b.addEventListener('click', () => {
    clipMode = b.dataset.axis;
    markActive('#menu-section [data-axis]', b);
    const axisCtl = $('axis-controls'), boxCtl = $('box-controls');
    axisCtl.hidden = !(clipMode === 'x' || clipMode === 'y' || clipMode === 'z');
    boxCtl.hidden = clipMode !== 'box';
    applyClip();
    setStatus(clipMode === 'off' ? 'Section off.'
      : clipMode === 'box' ? 'Box section on — drag the six sliders to crop the model.'
      : 'Section on — ' + clipMode.toUpperCase() + ' axis.');
  });
});
['clip-range', 'box-xmin', 'box-xmax', 'box-ymin', 'box-ymax', 'box-zmin', 'box-zmax'].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener('input', applyClip);
});
$('clip-flip').addEventListener('change', (e) => { clipFlip = e.target.checked; applyClip(); });
$('box-reset').addEventListener('click', () => {
  [['box-xmin', 0], ['box-xmax', 100], ['box-ymin', 0], ['box-ymax', 100], ['box-zmin', 0], ['box-zmax', 100]]
    .forEach((pair) => { const el = $(pair[0]); if (el) el.value = pair[1]; });
  applyClip();
});

// select menu
document.querySelectorAll('#menu-select [data-selmode]').forEach((b) => {
  b.addEventListener('click', () => {
    state.selMode = b.dataset.selmode;
    markActive('#menu-select [data-selmode]', b);
    setStatus('Selection mode: ' + b.textContent.replace(/^✓ /, ''));
  });
});
$('multi-select').addEventListener('change', (e) => { state.multi = e.target.checked; });
$('btn-isolate').addEventListener('click', isolateSelection);
$('btn-showall').addEventListener('click', () => { showAll(); clearSelection(); });

// tabs
document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    $('pane-tree').hidden = t.dataset.tab !== 'tree';
    $('pane-props').hidden = t.dataset.tab !== 'props';
  });
});

// toolbar
$('btn-fit').addEventListener('click', () => { showAll(true); fitToModel(); });
$('btn-walk').addEventListener('click', () => { walk.active ? endWalk() : startWalk(); });

// keyboard
document.addEventListener('keydown', (e) => {
  if (walk.active) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  if (k === 'f') fitToModel();
  if (k === 'h') homeView();
  if (k === '1') setMoveMode('orbit');
  if (k === '2') setMoveMode('pan');
  if (k === '3') setMoveMode('zoom');
  if (k === 'z') zoomToSelection();
  if (e.key === 'Escape') {
    if (!$('start').hidden) { $('start').hidden = true; return; }
    clearSelection();
  }
});

/* --------------------------------------------------------------- the loop */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (walk.active) updateWalk(dt);
  else orbit.update();
  renderPass.camera = activeCamera;
  composer.render();
}

/* ------------------------------------------------------------------- init */
function init() {
  resize();
  applyMoveMode();
  renderer.compile(scene, activeCamera);
  animate();
  // no permanent bottom bar: messages appear as a small pill and fade away
  $('statusbar').hidden = true;
}
init();

// expose a couple of things for console debugging
window.__viewer = { scene, state, fitToModel, openURL };
