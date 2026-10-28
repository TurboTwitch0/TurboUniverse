# Deploy Interface Foundry

Deploy the **full repository** at [TurboTwitch0/INTERFACE-FOUNDRY](https://github.com/TurboTwitch0/INTERFACE-FOUNDRY). The build generates the website, skill data, and toolkit ZIP together. Deploy `dist/`, not the source checkout.

## Verify locally

Use Node.js 20 or newer; Node 24 is recommended for hosting.

```sh
npm ci
npm test
npm run check
npm run build
npm run audit
npm start
```

Visit `http://127.0.0.1:4173`. Check a workflow's skill details, the three design directions, the brief download, and the toolkit ZIP. Browser behavior needs a real browser check; passing a build or source scan alone does not verify those interactions.

The build requires no API keys or application environment variables. It produces a static site without server functions or a database.

## Netlify: import from GitHub

1. In Netlify, choose **Add new project → Import an existing project** and select GitHub. Authorize access if Netlify requests it.
2. Select `TurboTwitch0/INTERFACE-FOUNDRY` and the intended production branch, normally `main`.
3. Keep the base directory at the repository root. The checked-in `netlify.toml` supplies:

   | Setting | Value |
   | --- | --- |
   | Build command | `npm run build` |
   | Publish directory | `dist` |
   | Node version | `24` |

4. Create/deploy the project. Netlify installs from the root package manifest and builds the site.
5. Open the generated site URL and verify the interactions and downloads described above.

Future pushes to the configured production branch trigger a new deployment. Netlify's file-based settings take precedence over corresponding dashboard settings. See [Netlify's configuration documentation](https://docs.netlify.com/build/configure-builds/file-based-configuration/).

### Netlify: manual upload

Run `npm ci` and `npm run build` locally. Upload the **contents of `dist/`**, or drop the `dist` folder into Netlify's manual deploy area. `index.html`, `assets/`, `data/`, and `downloads/` must remain at the same relative paths. Uploading only `index.html` omits the scripts, skill data, and toolkit download. A manual upload does not run the Git build configuration; rebuild and upload again after changing source.

## Vercel: import from GitHub

1. In Vercel, choose **Add New → Project**, then import `TurboTwitch0/INTERFACE-FOUNDRY`. Authorize repository access if requested.
2. Keep **Root Directory** at the repository root (`./`). Use **Other** as the Framework Preset.
3. The checked-in `vercel.json` defines:

   | Setting | Value |
   | --- | --- |
   | Framework | `Other` (`framework: null`) |
   | Install command | `npm ci` |
   | Build command | `npm run build` |
   | Output directory | `dist` |

4. Choose Node 24 in the project's build settings if selecting a runtime explicitly, then click **Deploy**.
5. Open the deployment URL and verify workflow details, theme switching, the brief download, and the toolkit ZIP.

Vercel uses the repository configuration for the build and static output. Future pushes follow the project's Git integration settings. See [Vercel's repository configuration reference](https://vercel.com/docs/project-configuration/vercel-json).

### Updating an existing project

If this repository was previously deployed as a single HTML file, inspect its **Settings → Build and Deployment**. Confirm the root is the repository root, framework is Other, build command is `npm run build`, output is `dist`, and install command is `npm ci`. Remove stale conflicting overrides and deploy the latest commit. The full-source version needs its build to create `data/skills.json` and the downloadable toolkit.

## Common problems

| Symptom | Check |
| --- | --- |
| Build cannot find `package.json` | The host's base/root directory should be the repository root. |
| `npm ci` fails | Commit the root `package-lock.json` with changes to `package.json`; use a supported Node version. |
| Site displays a 404 | Build with `npm run build` and publish `dist`; inspect the deployment's build log and output. |
| Skill details fail to load | Confirm `/data/skills.json` exists in the deployed output and is served as JSON rather than rewritten to HTML. |
| Toolkit download returns HTML or a 404 | Confirm `/downloads/interface-foundry-toolkit.zip` exists in the same deployment. |
| Changes are missing | Confirm the deployed branch and commit; redeploy after changing host settings. |

The site uses ordinary static paths and in-page anchors. No catch-all SPA rewrite is needed; rewriting every path to `index.html` can conceal missing JSON or ZIP files.

Both host configs add `nosniff`, a referrer policy, frame protection, and restricted camera/microphone/location permissions. They preserve local scripts, JSON loading, and downloads. The local Node server is a development preview and does not apply every hosting header.
