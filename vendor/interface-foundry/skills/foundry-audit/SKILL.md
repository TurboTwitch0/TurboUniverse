---
name: foundry-audit
description: Review an existing interface for usability, visual hierarchy, accessibility, and responsive problems, then fix the most consequential issues with evidence. Use after a UI build or when a product feels inconsistent or hard to use.
---

# Foundry Audit

Produce a prioritized, evidence-based review. A screenshot, static source scan, or automated accessibility tool alone cannot establish that an interface is fully usable or accessible.

## Establish scope

Read repository guidance and `DESIGN.md` if present. Identify the routes, representative data, primary task, supported devices, and changes under review. Start the application using its documented command when the environment supports it. Never guess that a development server or browser check succeeded.

From a checkout of this toolkit, `node bin/foundry.mjs audit <project>` runs a lightweight source heuristic scan. Use the findings as leads for investigation. Source heuristics cannot replace rendered contrast measurements, accessible-name computation, or keyboard testing.

## Inspect in task order

1. **Task clarity:** Can the intended user identify what to do next? Are primary actions named concretely? Is content arranged around decisions rather than decoration?
2. **Hierarchy:** Does type, spacing, and grouping establish a reading order? Are secondary controls quieter? Are related items grouped and unrelated items separated?
3. **Content:** Check realistic long titles, empty results, error messages, dates, and numbers. Placeholder content can conceal layout failures.
4. **Interaction:** Check native semantics, accessible names, input labels, focus visibility, keyboard access, loading/disabled states, and helpful errors.
5. **Responsive behavior:** Inspect a narrow viewport and at least one larger width. Look for horizontal overflow, clipped text, overlapping controls, and content reordered against reading order.
6. **Visual system:** Compare repeated elements against tokens. Measure actual text contrast when tooling permits; inspect hover/focus/error combinations too.
7. **Motion and media:** Respect reduced motion; prevent unnecessary layout shifts; give meaningful images useful alternatives and decorative images empty alternatives.

## Write actionable findings

Use [the report template](templates/AUDIT.md). Each finding needs a location, observed behavior, user impact, proposed repair, and evidence. Use severity consistently:

- **Critical:** prevents a primary task, loses data, or creates a serious access barrier.
- **High:** substantially impairs a common task or keyboard/screen-reader operation.
- **Medium:** causes avoidable confusion, friction, or a layout failure in a supported context.
- **Low:** localized consistency or polish issue with limited effect on the task.

Do not report a violation from source pattern alone when the runtime may resolve it correctly. Label those items “needs verification” and explain what would confirm them. Separate measurements, observations, and recommendations.

## Fix and verify

Repair the highest-impact issues first within the requested scope. Prefer changes to shared tokens/components over scattered one-off overrides. Re-run the relevant user path, viewport, and keyboard checks after each meaningful repair. Check for regressions in nearby states.

Return a short findings list, files changed, checks completed, and remaining unverified items. Avoid unsupported scores or “WCAG compliant” claims. Use `foundry-verify` for complete flow validation.
