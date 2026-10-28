# Contributing

Use Node.js 20 or newer; CI checks Node 20 and 24. Clone the full repository, run `npm ci`, and use `npm start` for the website at `http://127.0.0.1:4173`.

## Make a focused change

Explain the user problem and resulting behavior. For bugs, include the command or browser steps, Node/browser version, affected path, expected result, and actual result without private data. Include viewport dimensions for layout issues.

- Edit website source in `index.html` and `assets/`. Rebuild generated `dist/` output instead of editing it directly.
- Preserve a dependency-free runtime, local CLI operations, and no telemetry. Do not add application secrets or generated credentials.
- Keep skill names aligned with their directories and descriptions useful for selecting the right workflow. Supporting references must remain relative so installed copies work.
- Write original instructions and retain provenance for external ideas. Verify licenses before bundling third-party content.
- Preserve non-overwriting installation and brief output. Exercise new filesystem behavior with disposable temporary directories.
- Treat source audit findings as review leads. Add both an issue and a realistic non-issue when changing a heuristic; document material limits.
- Keep controls functional and keyboard operable. Do not present sample data as a live integration or a static scan as a complete accessibility test.
- Preserve build generation of skill JSON and the toolkit ZIP. The download must contain usable source and templates, not just a link to a repository.

## Validate

```sh
npm ci
npm test
npm run check
npm run build
npm run audit
```

For website changes, run `npm start` and test the affected flow in a real browser at narrow and wide viewports. Check workflow details, theme switching, keyboard navigation, brief export, and toolkit download when relevant. Report checks that were not run; a passing source audit does not establish complete accessibility.

For installer changes, use a disposable existing project directory and test `--agent both`, repeat installation, and a differing destination file. For build changes, inspect `dist/data/skills.json` and extract `dist/downloads/interface-foundry-toolkit.zip`; verify the CLI and templates remain usable from the extracted copy.

## Submit

Open a pull request describing the concrete problem, final change, and validation. Include screenshots for visual changes when available. Keep unrelated formatting and generated files out of the change. Update [DEPLOYMENT.md](DEPLOYMENT.md) when build output or hosting configuration changes. Contributions use the repository's [MIT license](LICENSE).
