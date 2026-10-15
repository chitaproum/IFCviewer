# Deploying the Web BIM IFC Viewer to GitHub Pages

This guide walks you through publishing the `ifc-viewer/` static site to
[GitHub Pages](https://pages.github.com/) — a free host for static websites.
No build step is required; GitHub serves the files exactly as they are.

> The viewer loads ES modules and a WebAssembly (WASM) parser, which browsers
> only allow over `https://` / `http://`. GitHub Pages serves over HTTPS, so it
> works out of the box.

---

## 0. Prerequisites

- A free [GitHub account](https://github.com/join).
- [Git](https://git-scm.com/downloads) installed, **or** just use the GitHub
  website (drag-and-drop upload — see Method B).
- The extracted project folder `ifc-viewer/` containing:
  ```
  ifc-viewer/
  ├─ index.html
  ├─ styles.css
  ├─ app.js
  └─ README.md
  ```

---

## Method A — Command line (recommended)

### 1. Create an empty repository on GitHub
1. Go to <https://github.com/new>.
2. **Repository name:** e.g. `web-bim-ifc-viewer`.
3. Visibility: **Public** (Pages is free for public repos).
4. Do **not** add a README/.gitignore/license (keep it empty).
5. Click **Create repository** and copy the repo URL, e.g.
   `https://github.com/<your-username>/web-bim-ifc-viewer.git`.

### 2. Push the site

Open a terminal **inside the `ifc-viewer/` folder** and run:

```bash
git init
git add .
git commit -m "Web BIM IFC viewer"
git branch -M main
git remote add origin https://github.com/<your-username>/web-bim-ifc-viewer.git
git push -u origin main
```

> If `git push` asks for a password, use a **Personal Access Token** instead of
> your account password: GitHub → Settings → Developer settings →
> Personal access tokens → generate one with `repo` scope and paste it as the
> password. Or set up SSH keys and use the `git@github.com:...` remote URL.

### 3. Turn on GitHub Pages
1. In your repo, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. **Branch:** `main`  •  **Folder:** `/ (root)`  → **Save**.
4. Wait ~1–2 minutes. The page will show:
   **“Your site is live at `https://<your-username>.github.io/web-bim-ifc-viewer/`”**

Open that URL and load an `.ifc` file. Done. 🎉

---

## Method B — No command line (web upload)

1. Create the empty repo as in Method A, step 1.
2. On the empty repo page click **“uploading an existing file”**.
3. Drag the **contents** of `ifc-viewer/` (the `index.html`, `styles.css`,
   `app.js`, `README.md`) into the upload area — not the folder itself, the
   files must sit at the repo **root** so `index.html` is at the top level.
4. Click **Commit changes**.
5. Enable Pages exactly as in Method A, step 3.

---

## Method C — GitHub Actions (optional, auto-deploy)

Use this if you want every push to redeploy automatically. Add this file to the
repo at `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'          # the whole repo root is the site
      - id: deployment
        uses: actions/deploy-pages@v4
```

Then in **Settings → Pages → Source**, choose **GitHub Actions**. Every push to
`main` now rebuilds and publishes the site.

---

## Verifying the deployment

1. Open `https://<your-username>.github.io/<repo>/`.
2. You should see the dark viewer UI with the “Drag & drop an .ifc file” panel.
3. Open an `.ifc` model; the status bar should report the triangle count.
4. Open the browser DevTools **Console** (F12) — there should be no red errors.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Blank page, 404 for `index.html` | Files committed inside a subfolder | Make sure `index.html` is at the repo **root**, not under `ifc-viewer/`. In Pages, root folder must be `/`. |
| Page loads but model won't open; console shows WASM/CORS error | WASM parser blocked | GitHub Pages serves HTTPS so this normally works. If self-hosting elsewhere, serve over HTTP(S), never `file://`. |
| Loads to 100% then alert: `WebAssembly.instantiate() ... Import #0 "a" "a": requires a callable` | WASM binary version ≠ the IFC glue code version | Make sure `setWasmPath(...)` in `app.js` points to the **same** three release as the import map (`.../three@0.149.0/examples/jsm/loaders/ifc/`). Mixing a standalone `web-ifc@x` wasm with three's bundled loader triggers this LinkError. |
| `Failed to resolve module specifier "three"` | Import map not loaded | Confirm `index.html` was uploaded unmodified (it contains the `<script type="importmap">` block). |
| Styles missing | `styles.css` not at root / wrong case | Keep file names exactly `styles.css`, `app.js` (case-sensitive on Pages). |
| Site not updating after a push | Browser / CDN cache | Hard-refresh (Ctrl/Cmd+Shift+R) or wait a minute; check the Pages build status in **Actions**. |
| 404 after enabling Pages | Build still running | Wait 1–2 minutes after first enable. |

---

## Custom domain (optional)

1. In **Settings → Pages → Custom domain**, enter e.g. `bim.example.com` and save
   (this creates a `CNAME` file in the repo).
2. At your DNS provider, add a `CNAME` record pointing
   `bim.example.com` → `<your-username>.github.io`.
3. Tick **Enforce HTTPS** once the certificate is issued.

---

## Making offline / fully self-contained (optional)

By default the viewer pulls `three` and the `web-ifc.wasm` parser from a CDN
(unpkg), both from the **same** `three@0.149.0` release. To make the deployed
site independent of the CDN:

1. Download into the repo:
   - `three.module.js` and the needed `examples/jsm/...` modules,
   - `examples/jsm/loaders/ifc/web-ifc.wasm` (keep it next to a local wasm folder).
2. In `index.html`, point the import-map entries to those local paths.
3. In `app.js`, change
   `setWasmPath('https://unpkg.com/three@0.149.0/examples/jsm/loaders/ifc/');`
   to the local folder, e.g. `setWasmPath('./wasm/')` (put `web-ifc.wasm` there).
4. Commit and push — the site now has no external dependencies.

---

### Quick reference

```text
Live URL pattern:  https://<username>.github.io/<repo>/
Source setting:    Settings → Pages → Deploy from a branch → main → / (root)
Requirement:       index.html must be at the repository root
```
