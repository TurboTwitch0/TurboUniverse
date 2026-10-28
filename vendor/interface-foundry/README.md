# Interface Foundry

The complete source for Interface Foundry: an interactive design-workflow website, five original Agent Skills, a dependency-free CLI, templates, examples, tests, and deployment configuration for Netlify and Vercel.

Explore the five workflows, inspect the bundled skill instructions, try three visual directions in the design lab, and download the toolkit from the website. The site runs in the browser; no AI service, API key, account, or database is required.

## Run locally

Requires **Node.js 20 or newer** and Git. Node 24 is the recommended deployment version. The project has no runtime dependencies; the lockfile makes installation reproducible.

```sh
git clone https://github.com/TurboTwitch0/INTERFACE-FOUNDRY.git
cd INTERFACE-FOUNDRY
npm ci
npm start
```

Open **http://127.0.0.1:4173**. `npm start` builds the site before serving `dist/` on the loopback interface. Use `PORT` to choose another port.

```sh
npm run build   # Generate the complete static site in dist/
npm test        # CLI, installer, audit, server, and build regression tests
npm run check   # JavaScript syntax, skill metadata, and local HTML references
npm run audit   # Advisory source heuristic scan of the website
```

Build output includes the site, `data/skills.json`, and `downloads/interface-foundry-toolkit.zip`. The ZIP contains the original skills, templates, CLI, and supporting source. Generated output belongs in `dist/`; edit the source files, then rebuild. Serve the built site over HTTP to exercise JSON loading and downloads.

## Deploy

Import this GitHub repository into either host. Both configuration files specify the same build:

| Setting | Value |
| --- | --- |
| Project/base directory | Repository root |
| Build command | `npm run build` |
| Output/publish directory | `dist` |
| Vercel framework | `Other` |
| Netlify Node version | `24` |

The repository includes [netlify.toml](netlify.toml) and [vercel.json](vercel.json), so new imports can use the checked-in configuration. For an existing imported project, remove stale settings from the earlier single-file version and confirm that it builds and publishes `dist`. Do not use a blank build command or publish the repository root for this full-source project.

See [DEPLOYMENT.md](DEPLOYMENT.md) for exact import steps, manual Netlify upload, and troubleshooting.

## Use the skills in another project

From this checkout, point the CLI at an **existing** project directory:

```sh
node bin/foundry.mjs doctor
node bin/foundry.mjs init ../my-app --agent both
```

| Agent option | Installed location |
| --- | --- |
| `claude` (default) | `.claude/skills/` |
| `codex` | `.agents/skills/` |
| `both` | Both locations |

The installer copies all five skills and templates. Identical existing files are kept. A different existing destination stops preflight without changing files; move the conflict aside deliberately before retrying. Destination symlinks are rejected, and files are never overwritten. Updating this checkout does not silently update copies installed in other projects.

Open the coding agent in the target project and request the appropriate workflow. Claude Code examples:

| Skill | Example invocation | Result |
| --- | --- | --- |
| `foundry-direction` | `/foundry-direction Give our booking page a warm editorial direction.` | `DESIGN.md` with tokens and component rules, plus a representative implementation slice. |
| `foundry-audit` | `/foundry-audit Review our booking flow and fix the highest-impact issues.` | Prioritized findings, scoped repairs, and verification evidence. |
| `foundry-reference` | `/foundry-reference Compare these supplied references for our booking page.` | `REFERENCES.md` mapping inspected principles to original decisions. |
| `foundry-reconstruct` | `/foundry-reconstruct Build this screenshot as a responsive booking page.` | Working interface and `RECONSTRUCTION.md` recording observations and inferences. |
| `foundry-verify` | `/foundry-verify Complete a booking at narrow and wide viewports using the keyboard.` | An observed journey result, failures and fixes, and a concise verification report. |

In another compatible agent, ask it to use the named skill. Skills follow the [Agent Skills specification](https://agentskills.io/specification). They supply instructions and templates; image inspection, code editing, and browser verification require the agent's own configured capabilities.

## CLI examples

```sh
# Print an editable brief; --out saves a new file without overwriting.
node bin/foundry.mjs brief \
  --name "Clay Studio" \
  --audience "People booking their first pottery class" \
  --goal "Reserve a class" \
  --direction editorial \
  --out ../my-app/DESIGN.md

# Supported directions: editorial, studio, terminal.
node bin/foundry.mjs audit ../my-app
node bin/foundry.mjs audit ../my-app --format json --fail-on warning
node bin/foundry.mjs audit ../my-app --fail-on never
node bin/foundry.mjs help
```

The audit scans HTML, JSX, TSX, Vue, Svelte, and CSS for common source patterns. Results include locations and manual follow-up checks. Its default `--fail-on error` returns exit code 1 for error findings; `warning` also fails on warnings; `never` leaves findings advisory. Operational failures still exit nonzero. Large files, symlinks, hidden directories, and common generated/dependency directories are skipped.

**Source scanning is advisory evidence.** It does not run a browser, compute accessible names or color contrast, or establish complete accessibility. Dynamic components can produce false positives and false negatives. Verify the rendered page, keyboard behavior, responsive layouts, and complete success/failure journeys with suitable tools. Report checks that were unavailable as not run.

The CLI works locally with no telemetry, network requests, credentials, or automatic dependency installation. Your coding agent may use its separately authorized tools while following a skill. The package is not published to npm; use this checkout or the website's toolkit download.

## Repository layout

```text
index.html                 Website entry source
assets/                    Website styles and browser JavaScript
bin/ and lib/              CLI and local audit/brief/installer logic
skills/                    Five original SKILL.md workflows and templates
examples/                  Sample design briefs
scripts/                   Build, local server, and validation tools
test/                      Node.js tests
dist/                      Generated deployable website, JSON, and toolkit ZIP
netlify.toml / vercel.json  Static-host build and header configuration
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for change guidance.

## Inspiration and provenance

This independent project was inspired by the five-step design workflow discussed in [this Reel](https://www.instagram.com/reel/DdshHpFpqdi/). Its skills, templates, CLI, and website are original, with no affiliation with or endorsement by the creator or the projects below. Their code and skill instructions are not bundled here.

- [Taste Skill](https://github.com/Leonxlnx/taste-skill): design direction for coding agents.
- [Vercel Web Design Guidelines](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines) and [Web Interface Guidelines](https://vercel.com/design/guidelines): interface review guidance.
- [Awesome DESIGN.md](https://github.com/VoltAgent/awesome-design-md): design-system references. This is an inferred match for the caption's “Awesome Design” label, whose exact repository is not established by the caption.
- [Image-to-Code](https://github.com/Leonxlnx/imagegen-skills/tree/main/skills/image-to-code): image-led implementation, now maintained in `imagegen-skills`.
- [Microsoft Playwright CLI](https://github.com/microsoft/playwright-cli): browser inspection and testing.

Upstream projects retain their own licenses and requirements. Record provenance and permission before adding external assets or code to an implementation.

## License

[MIT](LICENSE), copyright 2026 TurboTwitch0.
