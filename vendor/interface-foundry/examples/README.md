# Try the complete workflow

From the repository root, create a brief for your real project:

```sh
node bin/foundry.mjs init /path/to/your-app --agent both
node bin/foundry.mjs brief --name "Reading Room" --audience "Independent readers" --goal "Save a book to a reading list" --direction editorial --out /path/to/your-app/DESIGN.md
```

Use an existing app directory. If it already has `DESIGN.md`, refine that file
instead of generating a replacement; the CLI refuses to overwrite it. Open your
coding agent in the app directory and ask:

> Use foundry-direction to refine DESIGN.md, then build the reading-list screen.
> Keep the main action clear and include an empty list and a saved-book state.
> Use foundry-audit to review the result and foundry-verify to exercise saving a
> book at a narrow and wide viewport. Record anything you cannot verify.

The generated briefs in [design-briefs/](design-briefs/) show three possible
visual directions for the same product. They are starting points, not research
or completed implementations. Run `npm start` from the toolkit root to build
and serve the [design lab source](../index.html) at the printed local address.
The lab lets you compare directions on an illustrative interface; filtering and
adding notes change the current page only and reset on reload.

Run a source audit on the app after implementation:

```sh
node /path/to/interface-foundry/bin/foundry.mjs audit /path/to/your-app --format json
```

Use the findings alongside a real browser review. Passing the source audit does
not establish accessible behavior, correct persistence, or a successful journey.
See [the workflow guide](../docs/WORKFLOWS.md) for prompts, installation targets,
and verification evidence, and [architecture](../docs/ARCHITECTURE.md) for the
static build and source map.
