# Reading Room — design brief

Status: initial direction; validate with the real product and users.

## Product intent

- Audience: Independent readers
- Primary task: Save a book to a reading list
- Primary action label: [Use a concrete verb + object]
- Success signal: [Observable user outcome, not a vanity metric]
- Constraints: [Existing stack, branding, assets, deadlines]

## Direction: Studio

Soft surfaces, rounded controls, and a clear sans-serif hierarchy suit collaborative, approachable product work.

Use one dominant visual moment, a visible primary action, consistent spacing,
and real product content. Build from the user's task before adding decoration.
The palette below is a starting point; measure all actual foreground/background
pairs, including muted and hover states, before shipping.

## Tokens

```css
:root {
  --color-background: #f4f5fa;
  --color-foreground: #252c47;
  --color-accent: #b9c8ff;
  --color-surface: #e2e7f5;
  --font-display: Arial, Helvetica, sans-serif;
  --font-body: Arial, Helvetica, sans-serif;
  --radius-control: 20px;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --content-width: 76rem;
}
```

## Layout and behavior

- Small screen: single column; keep the main action visible and avoid overflow.
- Wide screen: use a purposeful grid; maintain a comfortable reading width.
- Controls: visible labels, keyboard focus, clear pressed/selected state.
- Feedback: define empty, loading, success, invalid-input, and failure states.
- Motion: short purposeful transitions; respect prefers-reduced-motion.
- Content: use meaningful sample data and distinguish examples from live data.

## Reference ledger

| Source URL / supplied image | Principle to borrow | Original treatment | Asset license |
| --- | --- | --- | --- |
| [Add a real reference] | [Hierarchy / rhythm / density] | [How this project differs] | [Verify before reuse] |

## Acceptance evidence

- [ ] Main flow completes from entry through confirmation.
- [ ] Keyboard-only navigation has visible focus and logical order.
- [ ] 360px and 1440px layouts avoid clipped content and horizontal overflow.
- [ ] Text contrast measured; normal text >= 4.5:1 and large text >= 3:1.
- [ ] 200% zoom and reduced motion checked.
- [ ] Empty, loading, error, and success states exercised where applicable.
- [ ] Record route, viewport, steps, result, and screenshot where available.

## Open assumptions

- [List what is unknown; a generated brief is not user research.]
