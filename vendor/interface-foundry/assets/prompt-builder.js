/** Compose reusable plain-text instructions; this module performs no AI or storage calls. */
const DIRECTIONS = Object.freeze({
  editorial: 'Editorial: mint and ink, condensed display type, and a clear editorial hierarchy',
  studio: 'Studio: sage surfaces, soft sans-serif typography, and approachable spacing',
  terminal: 'Terminal: a dark field, monospaced typography, and explicit technical states'
});

const WORKFLOWS = Object.freeze({
  direction: ({ intent, direction }) => `${intent} Use the ${DIRECTIONS[direction]} direction. Create DESIGN.md with audience, layout priorities, typography, color and spacing tokens, responsive behavior, and the loading, empty, error, and success states relevant to this task. Implement one representative screen and report decisions with observed evidence; identify assumptions and checks not run, and never invent test results.`,
  audit: ({ intent }) => `${intent} Follow that journey and inspect hierarchy, labels, keyboard focus, mobile reflow, and relevant empty, error, and success states. Create AUDIT.md with prioritized findings, route or component locations, observed evidence, user impact, and concrete repairs. Recheck repaired behavior and separate observed results from assumptions or checks not run; never invent findings or test results.`,
  reference: ({ intent }) => `${intent} Inspect the references I supply and compare their hierarchy, typography, spacing, layout, and interaction patterns against this task. Create REFERENCES.md mapping source observations to original design decisions, with URLs, asset provenance, license or permission status, and inspection limits. Propose the resulting DESIGN.md rules without copying brand assets; identify inaccessible sources and never invent observations or checks.`,
  reconstruct: ({ intent }) => `${intent} Inspect the supplied screenshot or mockup, then implement its hierarchy and layout as working, responsive components. Create RECONSTRUCTION.md with the component map, asset provenance, responsive and interaction assumptions, and a comparison at the reference size plus a narrow viewport when tools permit. Report the implemented journey and actual visual or browser evidence; identify unavailable assets and checks not run, and never invent a match or test result.`,
  verify: ({ intent }) => `${intent} Test the complete entry-to-confirmation journey with realistic inputs, then check a narrow viewport, keyboard navigation, visible focus, and recovery from a relevant invalid state. Create verification-report.md with routes, viewport sizes, steps, expected and observed results, and real screenshot or trace paths when available. Check saved data and reload behavior when persistence matters; mark results passed, failed, blocked, or not run, and never invent browser runs or evidence.`
});

function contextText(value, label, limit, fallback) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string.`);
  const text = value.trim();
  if (text.length > limit) throw new RangeError(`${label} must contain at most ${limit} characters.`);
  return text || fallback;
}

/**
 * @param {'direction'|'audit'|'reference'|'reconstruct'|'verify'} workflow
 * @param {{project?: string, goal?: string, direction?: string}} [context]
 * @returns {string} Plain text. Render with textContent, never innerHTML.
 */
export function buildPrompt(workflow, context = {}) {
  if (typeof workflow !== 'string' || !Object.hasOwn(WORKFLOWS, workflow)) throw new TypeError('Workflow must be direction, audit, reference, reconstruct, or verify.');
  if (!context || typeof context !== 'object' || Array.isArray(context) || ![Object.prototype, null].includes(Object.getPrototypeOf(context))) throw new TypeError('Prompt context must be a plain object.');
  const { project = '', goal = '', direction = 'editorial' } = context;
  const projectText = contextText(project, 'Project', 80, 'your project');
  const goalText = contextText(goal, 'Main task', 160, 'complete the primary user journey');
  if (typeof direction !== 'string') throw new TypeError('Direction must be a string.');
  const selectedDirection = direction.trim() || 'editorial';
  if (!Object.hasOwn(DIRECTIONS, selectedDirection)) throw new TypeError('Direction must be editorial, studio, or terminal.');
  const intent = `Use foundry-${workflow} for ${projectText}; the main task is “${goalText}”.`;
  return WORKFLOWS[workflow]({ intent, direction: selectedDirection });
}
