---
name: foundry-reference
description: Translate genuine interface references into an original, documented design direction. Use when collecting visual inspiration, choosing a design system, or explaining which layout and typography principles to adopt from supplied references.
---

# Foundry Reference

Use references to learn principles and make an original implementation. Keep source provenance visible. Do not invent pages you have inspected or assume a public asset is licensed for reuse.

## Gather a bounded reference set

1. Read the user's references and product goal. Inspect supplied images or linked pages with available tools before describing them.
2. Choose two to four references relevant to the task, content density, and device context. Prefer primary product pages, official design systems, and openly licensed examples.
3. Record URL or local source, date inspected, what was actually visible, and license/permission status in `REFERENCES.md` using [the template](templates/REFERENCES.md).
4. If a URL is inaccessible, say so. Continue with available references; do not fabricate its visual details.

## Extract principles

For each reference, describe specific observable properties:

- Type roles, approximate scale, weight, line length, and density.
- Grid or content structure, alignment, spacing relationships, and navigation model.
- Color roles and contrast relationships, rather than a list of attractive hex values.
- Interaction patterns, responsive changes, and component states only when observed.
- What makes it suitable for the user's task, and what would transfer poorly.

Map each chosen property to a project decision. Example: “Reference A groups metadata in a narrow column; use a secondary metadata rail on wide screens and a disclosure below the title on narrow screens.” Distinguish estimated values from measured values.

## Synthesize a direction

Choose one organizing principle and a few supporting details. Do not mix every reference into a collage. Preserve any existing brand contract. Write transferable decisions into `DESIGN.md` with `foundry-direction`.

Copying a workflow idea or general grid principle is different from copying brand identity, artwork, logos, proprietary code, or exact text. Reuse assets or code only with an applicable license or permission, preserve required attribution, and record its source. If permission is unknown, use an original substitute or a placeholder and identify it.

## Deliver evidence

Return:

1. The inspected references and limits of inspection.
2. A mapping from source observation to original project decision.
3. Asset provenance and any unresolved permission questions.
4. The design rules that implementation should follow.

No scraping or asset download is required by this skill. Use only the tools and access already authorized for the project.
