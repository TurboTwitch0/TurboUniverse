# TurboUniverse

A cinematic home for Turbo’s websites and apps, with a responsive collection manager and an installable progressive web app.

## Publish on Vercel

Import **TurboTwitch0/TurboUniverse**, choose the **main** branch, and keep the project root at **./**. The checked-in `vercel.json` selects Vite, builds with `npm run build`, serves `dist/`, and routes API requests to a Node.js 24 serverless function. No custom start command is needed.

The public site works immediately without environment variables: the project catalog, cinematic story, search, filters, AI studio, metadata export, and the installable app are available. Collection changes are hidden until owner storage is connected.

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

The collection starts with TurboHome and its imported project links. Add website/app links, upload cover images and project files, or bulk-import JSON or one URL per line. Search the collection, narrow it by project type or category, and sort the results to find your next world. Open project details, download uploaded files, and export project metadata. Uploading an archive stores a downloadable copy; importing a link opens the original website. The app does not mirror external websites.

During local development, project metadata and uploads persist in `data/`, which is ignored by Git. Keep this directory when restarting or upgrading. `DATA_DIR` can select another local storage location. Vercel deployments use private Blob storage instead. Metadata exports do not include uploaded files; back up local `data/` or your Blob store separately to retain them.

Each project has a short introduction to help you choose where to explore. Existing imported placeholder descriptions receive the new copy without replacing owner-written descriptions. Popular destinations also have direct **Open** links, and a shared world URL opens that project’s details in TurboUniverse. Keyboard navigation, visible focus, and reduced-motion support keep the experience comfortable across devices.

The cinematic story is a creative introduction to Turbo’s work, rather than a factual personal biography.

The default is Space + Light with a professional white, black, and blue palette. Dark mode uses near-black surfaces and an icy blue accent. The centered TurboUniverse title sits over cinematic space artwork. Website and app names sit in the center of image covers, with matching natural landscapes in Earth mode; custom uploaded covers take precedence. A Neptune-inspired discovery planet sits below the hero, followed by four curated popular destinations: TurboChat, TurboGames, TurboStocks, and Orbit Study. Cinematic background images are compressed, hosted locally, and available offline.

## Your launchpad

The Space + Light identity uses a consistent cobalt, ink, mist, and cyan palette, the existing lightning mark, rounded components, and Space Grotesk typography. The home page’s live collection preview prioritizes the verified popular destinations; its star controls save real projects, its category paths open the filtered collection, and its AI starter opens an editable prompt without starting a model download. Empty, loading, and retry states use the same visual system. Motion follows the device preference and the appearance control.

Opening project details or a card’s **Open world** link adds it to **Your launchpad**, a compact list of up to six recently explored worlds. Reopening moves it to the front; reload keeps the list when browser storage is available. **Clear recent** clears that history without changing saved worlds. Only project IDs stay in this browser, and browsing still works when storage is blocked. Unpublished projects have GitHub source links with **Setup pending** labels.

## Free on-device AI

Open **AI studio** in the navigation or home page preview. **Free local AI** runs the Apache-licensed Qwen2.5 0.5B model in a dedicated browser worker through WebLLM. It generates real streamed replies for Chat, Writing, Studying, Coding, and Brainstorming. There is no paid inference service, API key, subscription, billable credit, or server inference endpoint.

The model downloads only after **Download free model** is clicked: approximately 300 MB including model files and runtime. WebGPU and roughly 1 GB of working memory are required. The browser’s actual adapter and shader features determine support; devices without half-precision support use the compatible float32 variant. An unsupported browser shows an error rather than fake AI output. Model files come from the public MLC/Hugging Face hosts and are cached when the browser allows it. Prompts remain on the device. Downloads can be cancelled and retried; leaving local AI or unloading terminates its worker and releases GPU resources.

This is a small model for basic help, not a guarantee of accurate or advanced reasoning. It has no web browsing or account access. Context is limited to a few short recent messages, with long input shortened to fit; replies are capped at 192 tokens. One reply runs at a time, with a stop button and a 90-second timeout. Conversations are not saved. **Sample tour** remains a separate, clearly labeled preview with prewritten replies and no model download.

The implementation follows [WebLLM’s worker and cache documentation](https://webllm.mlc.ai/docs/user/advanced_usage.html). The installed version and its model configuration are pinned in the package lock.

## Current project destinations

TurboChat, TurboGames, and TurboStocks retain their verified existing app links. Orbit Study points to **TurboTwitch0/StudyOrbit** on GitHub, and TurboWatch points to its existing GitHub project. Both show **Setup pending** because their owners have not confirmed a published app. These entries do not claim hosted accounts or other live services are available. Existing project IDs remain stable for saved and shared links.

## Make it your atmosphere

Choose **Earth** or **Space**, then **Light** or **Dark** in the appearance bar. Earth uses brighter landscape backgrounds. Signature blue is the default palette; select Seasonal colors for season-specific accents. Backgrounds and the T orbit follow the time of year. **Appearance options** also offers hemisphere selection, seasonal previews, and motion control. Preferences stay on your device, and reduced-motion settings are respected. Older saved settings migrate to the new Space + Light default while retaining their season, hemisphere, and motion choices.

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
node scripts/smoke-ai.mjs
node scripts/smoke-launchpad.mjs
node scripts/smoke-owner-session.mjs
```

`npm run test:local-ai` is the separate real-inference check. It downloads the model, requires a working WebGPU device, and uses a persistent isolated browser profile under the task’s work directory. It verifies real replies and another response with external network requests blocked. It is intentionally separate from the standard API tests and daily refresh.

The browser checks use Playwright and installed Chromium (`CHROMIUM_PATH` can override its location), start isolated servers, and leave your collection unchanged. Build first. Feature checks cover all eight seasonal appearances, calendar rollover, hemisphere selection, saved-world persistence, orbit interactions, announcement expiry, and mobile layout. The API tests use temporary storage and exercise real HTTP requests, persistence, validation, and multipart uploads.

The local server binds to loopback for a single-owner development workflow. The separate Vercel handler uses private Blob storage and owner authentication for public hosting. Its automated tests use a simulated Blob service; live Blob access is verified after you connect your store and deploy.

## Daily GitHub refresh

The **Daily catalog refresh** GitHub Actions workflow checks public TurboHome links daily at **9 a.m. America/Chicago**, respecting daylight saving time. It also supports **Actions → Daily catalog refresh → Run workflow**. GitHub may delay scheduled runs.

The job appends new catalog projects after passing discovery tests, site tests, and the production build. Existing IDs, URLs, descriptions, covers, featured settings, and owner storage are preserved. Matching titles prevent stale TurboHome deployment links from duplicating curated projects. Unavailable, sign-in-only, empty, or incomplete discovery leaves the catalog unchanged and fails the run. No-change runs create no commits or announcements.

Validated catalog additions are committed to the default branch for the existing Vercel Git integration to publish. GitHub Actions and repository write permission must be enabled; branch rules may block automated pushes. The existing release banner announces deployed changes.
