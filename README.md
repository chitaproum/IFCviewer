# 3D Model Viewer

A browser-based viewer for the most common CAD / BIM / mesh formats.
Everything runs client-side — files are read in the browser and never uploaded.

Built with three.js r149, web-ifc (IFC), OpenCascade via `occt-import-js`
(STEP / IGES / BREP), and `rhino3dm` (3DM).

---

## Supported formats

| Extension | Format | Engine |
|---|---|---|
| `.ifc` | International Foundation Class | web-ifc |
| `.glb` / `.gltf` | glTF / GL Transmission Format (incl. Draco) | GLTFLoader |
| `.obj` | Wavefront OBJ | OBJLoader |
| `.stl` | Stereolithography | STLLoader |
| `.ply` | Polygon File Format | PLYLoader |
| `.fbx` | Autodesk FBX | FBXLoader |
| `.dae` | Collada | ColladaLoader |
| `.3ds` | Autodesk 3D Studio | TDSLoader |
| `.3mf` | 3D Manufacturing Format | 3MFLoader |
| `.amf` | Additive Manufacturing Format | AMFLoader |
| `.wrl` | VRML | VRMLLoader |
| `.off` | Object File Format | built-in parser |
| `.bim` | dotbim (JSON) | built-in parser |
| `.step` / `.stp` | STEP (ISO 10303) | OpenCascade (WASM) |
| `.iges` / `.igs` | IGES | OpenCascade (WASM) |
| `.brep` / `.brp` | OpenCascade B-rep | OpenCascade (WASM) |
| `.fcstd` | FreeCAD document (embedded BREP) | ZIP + OpenCascade |
| `.3dm` | Rhino | rhino3dm (WASM) |

Notes on the “engine” column:

- **web-ifc / OpenCascade / rhino3dm** are downloaded from a CDN the first time
you open a file of that type. After that the browser caches them.
- STEP/IGES/BREP files are tessellated by OpenCascade in the browser; very large
assemblies can take a while and need a desktop-class amount of memory.
- `.fcstd` is a ZIP archive: the viewer extracts the largest `.brp` shape inside
it. Objects, colours and the FreeCAD feature tree are **not** reproduced.
- `.3dm` covers mesh/polysurface/Brep geometry; Rhino-specific render materials,
materials and block instances may come through simplified or missing.
- `.obj` without a `.mtl` file loads geometry only (default grey appearance).

---

## Features

- Open from disk, **drag & drop**, or a **web link** (`Open URL`).
- Model tree on the left + **Properties** tab (IFC attributes, property sets and
  quantities; for other formats: name, type, vertex/triangle counts, size).
- **Selection**: click a part; Ctrl/Cmd/Shift-click adds; modes for single part,
  whole assembly, or everything of the same type.
- **Isolate** selection, **Search** by name / ID / IFC class, **Show all**.
- **Views** menu: iso / top / bottom / front / back / left / right, and a
  perspective ↔ orthographic switch.
- **Section** menu: clip on X, Y or Z with a position slider and flip-side
  toggle, or a **box clip** with six min/max sliders that crops the model to a
  rectangular region (Reset restores everything).
- **Walk mode**: first-person WASD + mouse look, Q/E up-down, Shift to run.
- **Share** a link: `#model=<url>&cam=<camera>` reopens the same cloud model at
  the same view.
- Rendering: SMAA anti-aliasing, ACES tone mapping, sRGB output, image-based
  lighting, a shadow-casting key light and soft shadows.

---

## Running it

A static web server is needed (ES modules do not work from `file://`):

```bash
cd viewer
python3 -m http.server 8080
# then open http://localhost:8080
```

or use the VS Code “Live Server” extension, or push the folder to any static host.

---

## Deploying to GitHub Pages

1. Create a repository and copy `index.html`, `styles.css`, `app.js` to its root.
2. **Settings → Pages → Branch: `main` / folder `/ (root)` → Save**.
3. Open `https://<user>.github.io/<repo>/`.

No build step, no dependencies to install — everything is loaded from CDNs.

---

## Links and CORS

`Open URL` and `Share` retrieve the model with `fetch`, so the host must send
`Access-Control-Allow-Origin`. That works for:

- public S3 / GCS / Azure buckets with CORS enabled,
- signed URLs,
- `raw.githubusercontent.com/...` links,
- any server that sets the header.

It does **not** work for Google Drive / Dropbox / OneDrive *preview* pages — use
their direct-download form instead. A model opened from your own disk cannot be
shared by link, because the recipient's browser has no access to that file.

---

## Known limits

- Section clipping is axis-aligned (single plane or AABB box); no rotated clip
  planes yet.
- Walk mode has no collision detection — you can pass through walls.
- IFC: property sets/quantities only; the model tree is the spatial structure.
- Very large models are parsed on the main thread; the tab freezes briefly.
- Formats not listed above (e.g. `.skp`, `.dwg`, `.dgn`, `.rvt`) cannot be read
  in the browser — export them to IFC / glTF / STEP first.

---

## Files

```
viewer/
├─ index.html   # layout, import map, menus
├─ styles.css   # dark UI
├─ app.js       # renderer, format loaders, tree, selection, section, share
└─ README.md
```
