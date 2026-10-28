---
name: foundry-reconstruct
description: Implement a working, responsive interface from a supplied screenshot or visual reference. Use for image-to-code work, matching a supplied design, or translating a static composition into usable components and states.
---

# Foundry Reconstruct

Treat a screenshot as evidence of one state at one viewport. Build the intended interaction and responsive layout, and identify the behavior a still image cannot establish.

## Inspect before coding

1. Open the actual image or reference with an image/browser tool. Record source dimensions, visible content, and any obscured regions. Do not claim pixel matching from a textual description alone.
2. Read the repository's stack, reusable components, routing, and design rules. Work in the existing system rather than rebuilding infrastructure without need.
3. Decompose the image into content regions, alignment anchors, repeated components, typography roles, color roles, and spacing relationships.
4. Separate **observed** facts from **inferred** behavior in `RECONSTRUCTION.md` using [the template](templates/RECONSTRUCTION.md).

## Plan the implementation

Estimate ratios and relationships first: container width, dominant columns, heading-to-body scale, image aspect ratio, and spacing rhythm. Use fixed values only where justified. Use semantic HTML and ordinary grid/flex layout; avoid absolute positioning an entire screen.

Reuse supplied assets when authorized. Record provenance and licensing. When an asset is missing, use an original substitute or clearly marked placeholder; do not silently hotlink unknown assets or manufacture a logo. If typography cannot be identified, choose an available fallback and record the approximation.

Define a responsive hypothesis:

- Which columns collapse, and when content needs that change.
- How navigation and actions remain reachable on a narrow screen.
- How long text, dynamic lists, and images resize without clipping.
- What interaction, empty/loading/error states, and motion the screenshot leaves unknown.

Choose sensible behavior within the task; ask only when the missing behavior materially blocks a correct implementation.

## Build a working slice

Implement the complete visible task, including real control behavior. Links must lead to valid destinations; buttons must perform the represented action or explicitly disclose an unavailable integration. Native inputs need labels, validation, and useful feedback. Avoid dead controls added solely to match an image.

Use realistic content of similar length. Preserve reading order and keyboard operation. Respect reduced motion and avoid making critical meaning depend on color or hover alone.

## Compare and refine

When browser tooling is available, capture the implementation at the reference dimensions. Compare:

1. Region geometry and alignment.
2. Typography scale, wrapping, and density.
3. Spacing and component dimensions.
4. Color roles, borders, imagery, and smaller details.

Fix the largest mismatch first. Then check a narrow viewport, a larger viewport, keyboard focus, and content/state variations. Do not set fixed heights that merely hide a mismatch.

Return changed files, the comparison evidence, deliberate differences, inferred behavior, and checks not run. Use `foundry-verify` to validate the full implemented flow.
