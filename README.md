# Web BIM — IFC Viewer

A lightweight, **100% client-side** BIM viewer for `.ifc` (Industry Foundation
Classes) files. Everything runs in the browser — your model is **never uploaded**
to any server. Built on [Three.js](https://threejs.org/) + the
[web-ifc](https://github.com/ThatOpen/engine_web-ifc) WASM parser (via the
`IFCLoader` in the Three.js examples).

## Features

- Open an IFC model from the file picker **or drag & drop** it onto the viewport.
- Orbit / pan / zoom 3D navigation.
- **Spatial structure tree** (Project → Site → Building → Storey → Elements).
- **Click to select** any element; hover to pre-highlight.
- **Properties panel**: attributes, property sets (Psets) and quantities (Qto).
- Toolbar: Fit view, toggle grid, wireframe, horizontal **section plane**,
  **isolate** selection, show all.
- Keyboard: `F` = fit view, `Esc` = clear selection.
- Responsive dark UI.

## Run it

Because the app loads ES modules and a WASM parser, it must be served over
`http://` (not opened as a `file://` path). Any static server works:

```bash
# Python 3
cd ifc-viewer
python -m http.server 8080
# then open http://localhost:8080
```

```bash
# Node (if you have it)
npx serve ifc-viewer
```

Then browse to the printed URL and open an `.ifc` file.

## Deploy

It's a static site — push the `ifc-viewer/` folder to any static host
(GitHub Pages, Netlify, Vercel, S3, etc.). No build step required.

### GitHub Pages quick start
```bash
cd ifc-viewer
git init && git add . && git commit -m "Web BIM IFC viewer"
# create a repo on GitHub, then:
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
# In the repo: Settings → Pages → Deploy from branch → main / root
```

## Notes & limits

- CDN-pinned versions: `three@0.149.0` + `web-ifc@0.0.36` (WASM parser matched to
  the `web-ifc-three` bundled in that Three.js release). If you later bump
  Three.js, update the `setWasmPath(...)` version in `app.js` to match.
- For fully offline use, download `three`, the example modules and the
  `web-ifc` `.wasm`/`.js` into the folder and update the import map + wasm path
  to local paths.
- Very large IFC files are parsed in a single thread; expect a short wait on
  first load. Triangle count is shown in the status bar.

## Files

```
ifc-viewer/
├─ index.html    # layout + import map
├─ styles.css    # dark UI theme
├─ app.js        # viewer logic (loader, selection, tree, properties, tools)
└─ README.md
```
