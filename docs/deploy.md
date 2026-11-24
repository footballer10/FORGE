# Deploying Forge to Cloudflare Pages

Forge is a static site (Vite build in `dist/`). Hosting is Cloudflare Pages at the domain root (`base: '/'`).

## One-time setup (Cloudflare dashboard)
1. Workers & Pages → Create → Pages → Connect to Git → pick the `FORGE` repository.
2. Production branch: `main`.
3. Build command: `npm run build`. Build output directory: `dist`.
4. Environment variable: `NODE_VERSION` = `20` (or newer).
5. Save and deploy. Every push to `main` redeploys; other branches get preview URLs.

SPA fallback: Pages serves `index.html` for unknown paths by default when there is no 404.html, and the service worker also falls back to `/index.html`.

`public/_headers` keeps `sw.js`, `index.html` and the manifest uncached (so updates ship) and hashes assets as immutable.

## After the first deploy
- Open the `*.pages.dev` URL in Safari on the iPhone, Share → Add to Home Screen.
- Open it once online so the service worker precaches everything, then test in airplane mode.
- Data lives in the browser (IndexedDB) per origin. A new domain starts empty: export a backup from Train → Backup & restore before changing the URL, and restore it on the new one.
