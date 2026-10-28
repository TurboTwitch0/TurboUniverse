---
name: foundry-direction
description: Establish a concrete visual direction and reusable design tokens before building or substantially restyling an interface. Use for open-ended UI briefs, generic-looking screens, or aligning a multi-page product.
---

# Foundry Direction

Turn the product's purpose into a small, implementable design system. Make design choices that support the user's task; do not force every product into one aesthetic.

## Inspect the context

1. Read the user brief, repository instructions, existing routes, design tokens, and components. Preserve established branding unless a redesign is requested.
2. Identify the primary audience, main task, device constraints, content density, and success condition. Use available evidence before asking questions. Record consequential assumptions.
3. Identify the visual problem with examples: a weak hierarchy, too many competing colors, indistinguishable actions, excessive empty space, or inconsistent components.

## Choose a direction

Draft two short candidate directions with a distinct type hierarchy, palette, spacing rhythm, and layout behavior. Choose the direction that best fits the task. Explain the choice in concrete terms; “modern,” “clean,” and “premium” are not sufficient specifications.

Use a clear hierarchy:

- One primary action per decision point, with secondary actions visually quieter.
- A readable text scale and comfortable line length, tuned to content density.
- A restrained palette with semantic roles; test text and interactive-state contrast.
- A spacing scale that describes relationships, not arbitrary per-element offsets.
- Components whose size, focus state, disabled state, and error state are defined.

Avoid arbitrary gradient backgrounds, identical card grids, oversized headings, and decorative charts unless they serve this specific interface. These are options, not universal bans.

## Write the design contract

Create or update `DESIGN.md` using [the template](templates/DESIGN.md). Record:

1. Product task, audience, chosen direction, and reasons.
2. Tokens as actual CSS custom properties: colors, typography, spacing, radius, borders, shadows, and motion.
3. Component rules for navigation, buttons, inputs, feedback, and the product's dominant content structure.
4. Responsive changes based on where content stops fitting. Include a small-screen plan and touch-target plan.
5. Accessibility and motion constraints. Prefer native controls; respect reduced motion.
6. Explicit acceptance criteria that can be checked in the implemented UI.

If fonts or imagery need a third-party service or license, record provenance and provide a fallback. Do not silently introduce paid dependencies.

## Implement one representative slice

Build the most informative screen or component before propagating the system. Include realistic content, a narrow viewport, keyboard focus, and an error/empty state where relevant. Inspect the result visually when browser tools are available. Adjust the tokens before copying patterns across the application.

Return the chosen direction, files changed, and evidence for the acceptance criteria. Mark unverified criteria explicitly. Continue with `foundry-audit` and `foundry-verify` after implementation.
