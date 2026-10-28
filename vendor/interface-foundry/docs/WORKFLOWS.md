# Use the workflows on a real project

The website helps you explore the five skills and copy prompts. To use them on
your application, install them into that application's directory and run your
coding agent there. The website itself does not execute an AI model.

## Install and establish the task

From the toolkit checkout, replace `/path/to/your-app` with an existing project:

```sh
node bin/foundry.mjs doctor
node bin/foundry.mjs init /path/to/your-app --agent both
node bin/foundry.mjs brief --name "Reading Room" --audience "Independent readers" --goal "Save a book to a reading list" --direction editorial --out /path/to/your-app/DESIGN.md
```

Choose `--agent claude` for `.claude/skills/`, `--agent codex` for
`.agents/skills/`, or `--agent both` for both locations. The installer preserves
identical files on repeat runs and stops before installation if an existing
destination differs. Move a customized file aside deliberately before retrying;
there is no overwrite flag. The brief command also refuses an existing output
file, so skip it when your app already has a design contract.

Open Claude Code or Codex in the target project. Follow that project's existing
instructions and make the user's primary task concrete before changing the UI.
For this example, the task is saving a book and finding it again after a reload.
State whether persistence exists, is part of the work, or is intentionally a
temporary browser demo.

## Choose the relevant skill

| Skill | Use it when | Useful artifact |
| --- | --- | --- |
| [foundry-direction](../skills/foundry-direction/SKILL.md) | The product needs a coherent layout, typography, color, and interaction direction. | `DESIGN.md`: decisions, tokens, reasons, and acceptance criteria. |
| [foundry-reference](../skills/foundry-reference/SKILL.md) | Supplied or accessible references can inform those decisions. | `REFERENCES.md`: observations, source provenance, reuse limits, and original adaptations. |
| [foundry-reconstruct](../skills/foundry-reconstruct/SKILL.md) | A supplied screenshot is the starting point for implementation. | `RECONSTRUCTION.md`: visible structure, tokens, responsive assumptions, and unseen states. |
| [foundry-audit](../skills/foundry-audit/SKILL.md) | An existing or newly built interface needs a prioritized review. | `AUDIT.md`: location, evidence, impact, severity, and repair for each finding. |
| [foundry-verify](../skills/foundry-verify/SKILL.md) | The main flow is implemented and needs observed end-to-end checks. | Verification results; use `verification-report.md` when a written record is useful. |

All five skills include a supporting template. You can use one workflow for a
specific task or combine them. A screenshot reconstruction is optional; a
project without a screenshot does not need one.

## Build a representative slice

Give the coding agent a bounded, testable request:

> Use foundry-direction to refine DESIGN.md for Reading Room. Build the
> reading-list screen in the existing stack. Make saving a book the main action,
> then let readers find and reopen it. Include an empty list, invalid input,
> saving feedback, success, and failure states where the implementation needs
> them. Preserve the existing data model and say what is still an assumption.

If you have references, use `foundry-reference` before committing to the design.
Provide real URLs or files and let the agent record what it could inspect. If
you have a screenshot, attach it and ask `foundry-reconstruct` to separate
observed layout from inferred behavior before coding.

## Audit the result

From the toolkit checkout, inspect the target project's source:

```sh
node bin/foundry.mjs audit /path/to/your-app
node bin/foundry.mjs audit /path/to/your-app --format json --fail-on warning
```

The default exit policy fails on errors. `--fail-on warning` also fails on
warnings; `--fail-on never` emits the report without failing on findings. The
scan reports unsupported or absent source explicitly and lists oversized files
it skipped. It cannot assess runtime behavior or establish accessibility.

Then ask the agent to connect source leads with an actual user task:

> Use foundry-audit to review saving and reopening a book. Investigate the source
> findings, inspect the rendered flow where tools are available, and prioritize
> repairs by user impact. Include a location and observed evidence for every
> finding. Mark source-only and untested areas explicitly.

Fix the highest-impact confirmed issues before widening the review.

## Verify the completed flow

> Use foundry-verify to exercise saving, finding, and reopening a book. Check
> keyboard navigation, visible focus, a narrow and wide viewport, invalid input,
> and an empty list. If saved data is meant to persist, reload and confirm it
> returns. Record actual outcomes and checks that could not run.

Record the route, relevant data, viewport, steps, expected result, and actual
result. Attach a screenshot or other evidence when available. A passing source
scan or build is not evidence that the browser flow passed. If the agent lacks
a browser, backend access, or representative data, keep that limitation visible
and complete the checks that are available.

## Explore the included example

Run `npm start` from the toolkit root and open the printed local address. The
design lab changes the same notes workspace between Editorial, Studio, and
Terminal treatments. Filtering and adding notes operate in the current page;
those example entries reset on reload. They demonstrate interface choices and
interaction states, not persistent application records.

The complete skill dialog reads generated Markdown from `data/skills.json`.
Use the toolkit ZIP or Git checkout when you need its supporting templates and
CLI. See [architecture](ARCHITECTURE.md) for the source and build map, and
[examples](../examples/README.md) for the three editable brief examples.
