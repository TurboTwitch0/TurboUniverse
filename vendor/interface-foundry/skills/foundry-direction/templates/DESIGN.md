# Design contract

## Product and decision

- Audience:
- Primary task and success condition:
- Existing constraints:
- Chosen direction:
- Why this supports the task:
- Assumptions to validate:

## Tokens

Replace these example values with deliberate project choices. Check actual foreground/background combinations in the rendered UI.

```css
:root {
  --color-bg: #f4f2ec;
  --color-surface: #ffffff;
  --color-text: #19251e;
  --color-muted: #536058;
  --color-border: #cdd4ce;
  --color-action: #234e37;
  --color-on-action: #ffffff;
  --color-danger: #a21f2b;
  --color-focus: #225cc2;
  --font-body: system-ui, sans-serif;
  --font-display: Georgia, serif;
  --text-sm: 0.875rem;
  --text-body: 1rem;
  --text-title: clamp(2rem, 4vw, 3.5rem);
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --radius-control: 0.375rem;
  --radius-panel: 0.75rem;
  --motion-fast: 140ms;
}
```

## Component rules

| Element | Hierarchy and size | States | Small-screen behavior |
| --- | --- | --- | --- |
| Navigation | | Active, focus | |
| Primary action | | Hover, focus, loading, disabled | |
| Input | | Focus, error, filled | |
| Content structure | | Empty, loading, populated | |
| Feedback | | Success, error | |

## Responsive and accessible behavior

- Content-driven layout breakpoints:
- Text wrapping and content overflow:
- Keyboard order and visible focus:
- Labels, names, status announcements:
- Touch targets and reduced motion:

## Provenance

| Asset or reference | URL/source | License or permission | Use |
| --- | --- | --- | --- |

## Acceptance criteria

- [ ] Main task and primary action are identifiable on first screen.
- [ ] Small-screen layout preserves reading and action order.
- [ ] Text contrast, keyboard operation, and focus are checked.
- [ ] Relevant loading, empty, error, and success states are represented.
- [ ] Design choices match the component rules above.

## Verification evidence

Record viewport, action, result, and evidence path. Separate observed results from assumptions or checks not run.
