export const DIRECTIONS = {
  editorial: { label: 'Editorial', background: '#f4f1e8', foreground: '#242820', accent: '#d8f36a', secondary: '#e5e0d2', display: "Georgia, 'Times New Roman', serif", body: 'Arial, Helvetica, sans-serif', radius: '4px', rationale: 'Warm paper, generous margins, a serif headline, and one sharp accent make the main idea easy to find.' },
  studio: { label: 'Studio', background: '#f4f5fa', foreground: '#252c47', accent: '#b9c8ff', secondary: '#e2e7f5', display: 'Arial, Helvetica, sans-serif', body: 'Arial, Helvetica, sans-serif', radius: '20px', rationale: 'Soft surfaces, rounded controls, and a clear sans-serif hierarchy suit collaborative, approachable product work.' },
  terminal: { label: 'Terminal', background: '#121a17', foreground: '#eef4df', accent: '#c9f76f', secondary: '#243129', display: "'Courier New', Courier, monospace", body: "'Courier New', Courier, monospace", radius: '0px', rationale: 'A dark field, crisp borders, and monospaced labels prioritize dense technical information and explicit state.' }
};

export function createBrief(options = {}) {
  const direction = options.direction ?? 'editorial';
  if (!Object.hasOwn(DIRECTIONS, direction)) throw new Error('Direction must be editorial, studio, or terminal.');
  const theme = DIRECTIONS[direction];
  const name = options.name ?? 'Untitled project';
  const audience = options.audience ?? '[Who is this for?]';
  const goal = options.goal ?? '[The one task visitors should complete]';
  return `# ${name} — design brief

Status: initial direction; validate with the real product and users.

## Product intent

- Audience: ${audience}
- Primary task: ${goal}
- Primary action label: [Use a concrete verb + object]
- Success signal: [Observable user outcome, not a vanity metric]
- Constraints: [Existing stack, branding, assets, deadlines]

## Direction: ${theme.label}

${theme.rationale}

Use one dominant visual moment, a visible primary action, consistent spacing,
and real product content. Build from the user's task before adding decoration.
The palette below is a starting point; measure all actual foreground/background
pairs, including muted and hover states, before shipping.

## Tokens

\`\`\`css
:root {
  --color-background: ${theme.background};
  --color-foreground: ${theme.foreground};
  --color-accent: ${theme.accent};
  --color-surface: ${theme.secondary};
  --font-display: ${theme.display};
  --font-body: ${theme.body};
  --radius-control: ${theme.radius};
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
\`\`\`

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
`;
}
