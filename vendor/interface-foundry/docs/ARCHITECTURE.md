# Architecture

Interface Foundry has two connected parts: a static website for exploring the
workflows, and a local CLI that installs those workflows into a real project.
Both use the Markdown files in `skills/` as the skill source of truth.

## Source map

| Location | Responsibility |
| --- | --- |
| [index.html](../index.html) | Website structure, initial content, navigation, workflow and direction tabs, skill dialog, and download links. |
| [assets/app.js](../assets/app.js) | Browser interactions: tabs, copying, skill loading and downloads, entry filtering, and temporary demo notes. |
| [assets/styles.css](../assets/styles.css) | Responsive page layout, design-lab themes, interaction states, dialog styling, and reduced-motion treatment. |
| [skills/](../skills/) | Five original `SKILL.md` workflows and their supporting report or design templates. |
| [bin/foundry.mjs](../bin/foundry.mjs) | CLI entry point and error reporting. |
| [lib/cli.mjs](../lib/cli.mjs) | Command parsing, skill installation, brief output, audit output, and installation checks. |
| [lib/brief.mjs](../lib/brief.mjs) | Editable design briefs and tokens for Editorial, Studio, and Terminal directions. |
| [lib/audit.mjs](../lib/audit.mjs) | Bounded HTML, JSX, TSX, Vue, Svelte, and CSS source heuristics. |
| [scripts/build.mjs](../scripts/build.mjs) | Website assembly, skill-data generation, and downloadable toolkit generation. |
| [scripts/archive.mjs](../scripts/archive.mjs) | Source-file selection and dependency-free ZIP creation. |
| [scripts/serve.mjs](../scripts/serve.mjs) | Local HTTP preview of the built `dist/` directory. |
| [test/](../test/) | Node tests for commands, filesystem behavior, source findings, preview serving, and build behavior. |
| [examples/](../examples/) | Generated design-brief examples and a real-project walkthrough. |

## Build and serve

Use Node.js 20 or newer. There are no runtime or build dependencies to install.

```sh
npm run build
npm start
```

`npm start` runs the build through `prestart`, then serves the result at
`http://127.0.0.1:4173`. To preview an existing build without rebuilding, run
`node scripts/serve.mjs`. Set `PORT` to choose another local port. Use HTTP
preview rather than opening the source HTML through `file://`; the skill dialog
loads a generated JSON resource.

The build produces:

```text
dist/
  index.html
  assets/
    app.js
    styles.css
  data/
    skills.json
  downloads/
    interface-foundry-toolkit.zip
```

The build copies the root page and assets, reads each complete `SKILL.md` into
`data/skills.json`, and creates a ZIP containing the editable project source.
The ZIP includes skills and templates, CLI code, website source, build scripts,
tests, examples, documentation, and the license. It excludes generated output,
Git history, hosting identity, dependencies, and credential-like filenames.
Review any new source material before adding it to the repository; filename
filters cannot identify every possible secret.

Output is assembled in a temporary directory before replacing `dist/`. A normal
build failure therefore keeps the previous output available. Treat `dist/` as
generated output: edit the source files and rebuild. Static hosting uses the
repository root, build command `npm run build`, and output directory `dist`.
The local preview server is for development, not a production application server.

## Browser state and skill loading

The browser stores the selected workflow, direction, filter, and demo entries
in memory. Adding a note changes the current document only; reloading restores
the initial examples. There are no accounts, database writes, model calls, or
persistent user records in the design lab.

The skill dialog fetches `data/skills.json` when first opened. Successful content
is reused, concurrent requests share the same promise, and failed loads can be
retried. A request counter prevents a response from updating a dialog that has
closed or changed selection. Copy and download actions stay disabled until the
selected skill has loaded. Skill text is inserted as text rather than rendered
as HTML.

Downloading a single `SKILL.md` provides that workflow's Markdown only. Its
relative template links require the supporting template directory, available in
the complete toolkit ZIP or Git checkout. The website labels this distinction.

## CLI boundaries

`init` copies all five skills and their supporting files into `.claude/skills/`,
`.agents/skills/`, or both under an existing target project. It checks planned
destinations before writing, preserves identical existing files, and refuses
conflicting files and symlink destinations. It does not run an agent or install
project dependencies. `brief --out` creates a new file and refuses to overwrite
an existing one.

`audit` reads supported source files without following symlinks. Its findings
are leads for review, not a rendered accessibility or behavioral assessment.
It does not execute the target app, compute visual contrast, test keyboard
navigation, or establish that a user journey succeeds. The installed
`foundry-verify` workflow guides those checks through whatever browser and
application tools the coding agent actually has.

## Extend the project

- **Change skill guidance:** edit its `SKILL.md` or templates in `skills/`, then
  rebuild. The modal and ZIP will use the changed source.
- **Add a workflow:** add a standards-compatible skill directory, then update
  the skill list in `lib/cli.mjs`, the map in `scripts/build.mjs`, the workflow
  metadata in `assets/app.js`, and the page's tabs. Add coverage for its install
  and build output.
- **Change the design lab:** edit theme metadata and browser behavior in
  `assets/app.js`, theme selectors in `assets/styles.css`, and initial example
  content in `index.html`. The CLI brief palettes live separately in
  `lib/brief.mjs`; align them deliberately when a shared direction is intended.
- **Add audit rules:** use explicit evidence and conservative severity in
  `lib/audit.mjs`. Include a failing example and a valid counterexample in tests.
- **Change toolkit packaging:** edit the allowlists in `scripts/archive.mjs`,
  then verify the resulting ZIP includes the new source and still excludes
  generated files and private state.

Run `npm test`, `npm run build`, and `npm run check` after a code change. Browser
checks remain necessary for interaction and layout changes; see
[the workflow guide](WORKFLOWS.md) for what to record.
