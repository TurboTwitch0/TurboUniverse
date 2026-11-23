import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../assets/prompt-builder.js';

const WORKFLOWS = ['direction', 'audit', 'reference', 'reconstruct', 'verify'];

test('each workflow includes the supplied product intent, distinct skill, outputs and evidence rules', () => {
  const expectedOutputs = {
    direction: 'DESIGN.md', audit: 'AUDIT.md', reference: 'REFERENCES.md',
    reconstruct: 'RECONSTRUCTION.md', verify: 'verification-report.md'
  };
  const prompts = WORKFLOWS.map(workflow => {
    const prompt = buildPrompt(workflow, { project: 'Field research notebook', goal: 'Record a finding and retrieve it later', direction: 'studio' });
    assert.match(prompt, new RegExp(`Use foundry-${workflow} `));
    assert.ok(prompt.includes('Field research notebook'));
    assert.ok(prompt.includes('Record a finding and retrieve it later'));
    assert.ok(prompt.includes(expectedOutputs[workflow]));
    assert.match(prompt, /evidence|observations/);
    assert.match(prompt, /never invent/);
    assert.ok(prompt.length < 1000, 'a reusable prompt should stay concise');
    return prompt;
  });
  assert.equal(new Set(prompts).size, 5);
});

test('omitted or blank project and goal use useful defaults in every workflow', () => {
  for (const workflow of WORKFLOWS) {
    const defaultPrompt = buildPrompt(workflow);
    assert.ok(defaultPrompt.includes('your project'));
    assert.ok(defaultPrompt.includes('complete the primary user journey'));
    assert.equal(buildPrompt(workflow, { project: ' \n ', goal: '\t ' }), defaultPrompt);
    assert.equal(buildPrompt(workflow, { project: undefined, goal: undefined, direction: undefined }), defaultPrompt);
  }
  assert.match(buildPrompt('direction'), /Editorial: mint and ink, condensed display type/);
});

test('the direction workflow reflects the selected lab style without changing user intent', () => {
  const editorial = buildPrompt('direction', { direction: 'editorial' });
  const studio = buildPrompt('direction', { direction: 'studio' });
  const terminal = buildPrompt('direction', { direction: 'terminal' });
  assert.match(editorial, /Editorial: mint and ink, condensed display type/);
  assert.match(studio, /Studio: sage surfaces, soft sans-serif typography/);
  assert.match(terminal, /Terminal: a dark field, monospaced typography/);
  assert.equal(buildPrompt('direction', { direction: ' studio ' }), studio);
  assert.equal(buildPrompt('direction', { direction: ' ' }), editorial);
  assert.equal(new Set([editorial, studio, terminal]).size, 3);
});

test('outer whitespace is trimmed while Unicode, newlines and punctuation remain plain text', () => {
  const project = 'Nøtes\n研究室';
  const goal = 'Keep ideas & “decisions” together.\nFind mañana’s work';
  const prompt = buildPrompt('audit', { project: `  ${project}  `, goal: `\t${goal}\n` });
  assert.ok(prompt.includes(`for ${project};`));
  assert.ok(prompt.includes(`“${goal}”`));
  assert.equal(prompt.includes('for   '), false);
});

test('HTML-looking and JavaScript-looking input is returned as inert text without evaluation', () => {
  const project = '<img src=x onerror="alert(1)">';
  const goal = '${globalThis.__foundryPromptEvaluation = true}';
  assert.equal(Object.hasOwn(globalThis, '__foundryPromptEvaluation'), false);
  const prompt = buildPrompt('verify', { project, goal });
  assert.equal(typeof prompt, 'string');
  assert.ok(prompt.includes(project));
  assert.ok(prompt.includes(goal));
  assert.equal(Object.hasOwn(globalThis, '__foundryPromptEvaluation'), false);
});

test('unknown, prototype and non-string workflow or direction keys are rejected', () => {
  for (const workflow of ['', 'unknown', '__proto__', 'constructor', 'toString', 'hasOwnProperty', null, 1, {}, []]) {
    assert.throws(() => buildPrompt(workflow), /Workflow must be/);
  }
  for (const direction of ['unknown', '__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.throws(() => buildPrompt('direction', { direction }), /Direction must be editorial/);
    assert.throws(() => buildPrompt('audit', { direction }), /Direction must be editorial/);
  }
  for (const direction of [null, 1, {}, []]) assert.throws(() => buildPrompt('direction', { direction }), /Direction must be a string/);
});

test('context types and length limits fail descriptively without silently coercing values', () => {
  for (const context of [null, [], 'text', 1, new Date()]) assert.throws(() => buildPrompt('direction', context), /context must be a plain object/);
  for (const value of [null, 1, true, {}, [], new String('not a primitive')]) {
    assert.throws(() => buildPrompt('direction', { project: value }), /Project must be a string/);
    assert.throws(() => buildPrompt('direction', { goal: value }), /Main task must be a string/);
  }
  assert.throws(() => buildPrompt('direction', { project: 'x'.repeat(81) }), /Project must contain at most 80/);
  assert.throws(() => buildPrompt('direction', { goal: 'x'.repeat(161) }), /Main task must contain at most 160/);
  const boundary = buildPrompt('direction', { project: ` ${'é'.repeat(80)} `, goal: ` ${'x'.repeat(160)} ` });
  assert.ok(boundary.includes('é'.repeat(80)));
  assert.ok(boundary.includes('x'.repeat(160)));
});
