# TurboUniverse

A cinematic home for Turbo’s websites and apps, with a responsive collection manager and an installable progressive web app.

## Publish on Vercel

Import **TurboTwitch0/TurboUniverse**, choose the **main** branch, and keep the project root at **./**. The checked-in `vercel.json` selects Vite, builds with `npm run build`, serves `dist/`, and routes API requests to a Node.js 24 serverless function. No custom start command is needed.

The public site works immediately without environment variables: all 30 imported project links, cinematic story, search, filters, metadata export, and the installable app are available. Collection changes are hidden until owner storage is connected.

To enable owner editing and persistent uploads:

1. In your Vercel project, open **Storage**, create a **private Vercel Blob** store, and connect it to the project. This provides `BLOB_READ_WRITE_TOKEN`.
2. In **Settings → Environment Variables**, add `TURBO_ADMIN_KEY` with a long random value (at least 32 characters). Keep both values private; never use a `VITE_` prefix for these server credentials.
3. Redeploy. Open **Manage collection** on the site and enter your owner key. Visitors can explore; only the signed-in owner can add or remove projects.

Cloud uploads allow a combined cover and project file size below 4 MB per submission to fit Vercel’s function request limit. Larger projects can be added as hosted links. The local development server retains its larger upload limit. Uploaded files and per-project metadata persist in Blob across deployments; deleting a starter project persists too.

If Vercel reports that the repository has no requested branch or commit, verify that GitHub has a commit on `main` before importing it. Workspace files alone are not available to Vercel until committed and pushed.

## Run

Requires Node.js 24 or newer. Python 3 is used by the TurboHome importer.

```sh
npm ci --cache /workspace/.npm-cache
npm run dev
```

The development frontend uses port 5173 and proxies the API on port 3001. For a production build, run `npm run build` followed by `npm start`; the Node server serves both the website and API on port 3001.

## Your collection

The collection starts with TurboHome and its imported project links. Add website/app links, upload cover images and project files, or bulk-import JSON or one URL per line. Search and filter the collection, open projects, download uploaded files, and export project metadata. Uploading an archive stores a downloadable copy; importing a link opens the original website. The app does not mirror external websites.

During local development, project metadata and uploads persist in `data/`, which is ignored by Git. Keep this directory when restarting or upgrading. `DATA_DIR` can select another local storage location. Vercel deployments use private Blob storage instead. Metadata exports do not include uploaded files; back up local `data/` or your Blob store separately to retain them.

The cinematic story is a creative introduction to Turbo’s work, rather than a factual personal biography.

The visual theme uses warm earth tones, original people-free landscape backgrounds, and six space artworks for project covers. Images are hosted locally in `public/images/` and cached by the installed app for offline browsing. A custom uploaded cover takes precedence over the default space artwork.

## Make it your atmosphere

Choose **Earth** or **Space** in the appearance bar. Colors, landscape or galaxy backgrounds, and the T orbit change with the season. Automatic mode follows your local calendar using meteorological seasons; northern hemisphere is the default. **Appearance options** lets you select the southern hemisphere, preview a season, or pause motion. Preferences stay on your device, and reduced-motion device settings are respected.

The restored T orbit has clickable project satellites. Tap the T or **Spin the universe** to discover a random real project. Star projects to save them on this device, then use the **Saved** filter to find them again. Saved worlds work for visitors too and do not change the public collection.

## Update announcements

Each build automatically emits `dist/release.json` with a release ID and a fixed publication timestamp. The site announces that update for exactly 48 hours from that timestamp. Reloading or visiting late never extends the window. Dismissing an announcement hides that release on your device while allowing the next release to appear. The banner also expires while a page stays open and can read cached release metadata offline.

Vercel uses its Git commit ID to distinguish updates; other builds use the local commit or a source fingerprint. Publishing the next code update automatically creates its announcement without editing dates or adding a backend job.

## Import TurboHome

With the local server running:

```sh
python3 scripts/import-turbohome.py --dry-run --output /tmp/turbo-projects.json
python3 scripts/import-turbohome.py
```

The importer reads publicly accessible pages within the supplied TurboHome directory, follows its internal navigation, and registers the linked projects without fetching or copying those external sites. Repeated runs skip projects already in the collection. It uses the inherited proxy and verified TLS; `sites.google.com` must be allowed by the environment network policy. Private or sign-in-only pages require public access before they can be imported.

## Install the app

Use **Get the app** for device instructions. Browsers that support installation offer a native install prompt. Safari supports Share → Add to Home Screen. Installation requires HTTPS or localhost. The production service worker retains the shell and last successful project list for offline browsing; adding, removing, and uploading projects requires a connection. This is a progressive web app, not an App Store or Play Store package.

## Validate

```sh
npm run build
npm test
python3 scripts/import-turbohome.test.py
node scripts/smoke.mjs
node scripts/smoke-vercel.mjs
node scripts/smoke-features.mjs
```

The browser checks use Playwright and installed Chromium (`CHROMIUM_PATH` can override its location), start isolated servers, and leave your collection unchanged. Build first. Feature checks cover all eight seasonal appearances, calendar rollover, hemisphere selection, saved-world persistence, orbit interactions, announcement expiry, and mobile layout. The API tests use temporary storage and exercise real HTTP requests, persistence, validation, and multipart uploads.

The local server binds to loopback for a single-owner development workflow. The separate Vercel handler uses private Blob storage and owner authentication for public hosting. Its automated tests use a simulated Blob service; live Blob access is verified after you connect your store and deploy.
