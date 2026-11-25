import { createNotesStore } from './notes-store.js';
import { buildPrompt } from './prompt-builder.js';

const workflows = {
  direction: {
    title: 'Set a direction.\nThen commit to it.',
    description: 'Define the audience, the main task, and a visual point of view. Turn those decisions into a small set of design tokens that your agent can actually follow.',
    output: 'A DESIGN.md with typography, color, spacing, interaction rules, and the reasons behind them.'
  },
  audit: {
    title: 'Find the friction.\nFix what matters.',
    description: 'Inspect the interface around a real user task. Look for unclear hierarchy, inaccessible controls, inconsistent components, and broken states. Tie every finding to observable evidence.',
    output: 'A prioritized audit: the problem, its evidence, its user impact, and a concrete next step. Untested areas stay explicit.'
  },
  reference: {
    title: 'Study the choices.\nMake your own.',
    description: 'Use relevant references to understand hierarchy, density, type, and interaction patterns. Extract the principles that fit your product, with sources and attribution kept intact.',
    output: 'A reference map that connects observed design decisions to your own tokens and components, with provenance and reuse limits.'
  },
  reconstruct: {
    title: 'From a visual.\nTo something usable.',
    description: 'Read a screenshot as a system of layout, type, spacing, and components. Rebuild the visible structure, then make explicit choices for the responsive layouts and states the image cannot show.',
    output: 'A working interface with a visual inventory, reusable tokens, responsive rules, and a clear list of inferred behavior.'
  },
  verify: {
    title: 'Follow the flow.\nProve the result.',
    description: 'Open the interface and exercise its main task end to end. Check keyboard access, narrow screens, empty and error states, and whether saved data returns correctly when a backend is present.',
    output: 'A verification record with steps, actual outcomes, viewport details, supporting evidence, and any checks that could not be run.'
  }
};

const themes = {
  editorial: { summary: 'Sharp. Clear. Intentional.', caption: 'Mint + ink / Condensed headlines / Fine rules', color: '#c7ee96' },
  studio: { summary: 'Quiet. Friendly. Purposeful.', caption: 'Sage + pine / Bold sans / Soft corners', color: '#b2dec1' },
  terminal: { summary: 'Precise. Direct. Focused.', caption: 'Phosphor + forest / Monospace / Dashed rules', color: '#b4ed71' }
};

const workflowTabs = [...document.querySelectorAll('[data-workflow]')];
const directionTabs = [...document.querySelectorAll('[data-direction]')];
const toast = document.querySelector('#toast');
let toastTimer;
let currentFilter = 'all';
let currentWorkflow = 'direction';
let currentDirection = 'editorial';
const promptProject = document.querySelector('#prompt-project');
const promptGoal = document.querySelector('#prompt-goal');
let browserStorage;
try { browserStorage = window.localStorage; } catch {}
const notesStore = createNotesStore(browserStorage);
const noteGrid = document.querySelector('#note-grid');
const noteSearch = document.querySelector('#note-search');
const noteDialog = document.querySelector('#note-dialog');
const noteForm = document.querySelector('#note-form');
const noteTitle = document.querySelector('#note-title');
const noteBody = document.querySelector('#note-body');
const noteKind = document.querySelector('#note-kind');
const noteError = document.querySelector('#note-error');
const noteDiscardConfirmation = document.querySelector('#note-discard-confirmation');
const keepEditingButton = document.querySelector('#keep-editing-note');
const newNoteButton = document.querySelector('#new-note');
const resetNotesButton = document.querySelector('#reset-notes');
let activeNoteId = null;
let noteReturnId = null;
let noteDialogTrigger = null;
let initialNoteValues;
let deletedEntry = null;
let resetArmed = false;
let resetTimer;

function announce(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  const modal = document.querySelector('#skill-dialog');
  if (modal?.open) document.querySelector('#skill-feedback').textContent = message;
  toast.classList.add('visible');
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 4500);
}

function selectTab(tabs, selected) {
  tabs.forEach((tab) => {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
}

function renderPrompt() {
  const status = document.querySelector('#prompt-context-status');
  try {
    const prompt = buildPrompt(currentWorkflow, { project: promptProject.value, goal: promptGoal.value, direction: currentDirection });
    document.querySelector('#workflow-prompt').textContent = prompt;
    promptProject.setAttribute('aria-invalid', 'false');
    promptGoal.setAttribute('aria-invalid', 'false');
    status.textContent = promptProject.value.trim() || promptGoal.value.trim()
      ? 'Your prompt is ready. Choose a skill, then copy it into your coding agent.'
      : 'Add your project details to tailor this prompt.';
  } catch (error) {
    promptProject.setAttribute('aria-invalid', String(promptProject.value.trim().length > 80));
    promptGoal.setAttribute('aria-invalid', String(promptGoal.value.trim().length > 160));
    status.textContent = error.message;
  }
}

function setWorkflow(tab) {
  const name = tab.dataset.workflow;
  if (!Object.hasOwn(workflows, name)) return;
  const workflow = workflows[name];
  currentWorkflow = name;
  selectTab(workflowTabs, tab);
  document.querySelector('#workflow-panel').setAttribute('aria-labelledby', tab.id);
  document.querySelector('#skill-name').textContent = `foundry-${name}`;
  const title = document.querySelector('#workflow-title');
  title.replaceChildren();
  workflow.title.split('\n').forEach((line, index) => {
    if (index) title.append(document.createElement('br'));
    title.append(document.createTextNode(line));
  });
  document.querySelector('#workflow-description').textContent = workflow.description;
  document.querySelector('#workflow-output').textContent = workflow.output;
  renderPrompt();
  document.querySelector('#skill-source').dataset.skill = name;
}

function setDirection(tab) {
  const name = tab.dataset.direction;
  if (!Object.hasOwn(themes, name)) return;
  const theme = themes[name];
  currentDirection = name;
  selectTab(directionTabs, tab);
  const preview = document.querySelector('#design-preview');
  preview.dataset.theme = name;
  preview.setAttribute('aria-labelledby', tab.id);
  document.querySelector('#theme-summary').textContent = theme.summary;
  document.querySelector('#token-caption').textContent = theme.caption;
  document.querySelector('#token-color').style.backgroundColor = theme.color;
  setPresentation('designed');
  renderPrompt();
}

function setPresentation(name) {
  if (!['basic', 'designed'].includes(name)) return;
  document.querySelector('#design-preview').dataset.presentation = name;
  document.querySelectorAll('[data-presentation-option]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.presentationOption === name)));
  document.querySelector('#comparison-description').textContent = name === 'basic'
    ? 'Basic treatment: plain surfaces and system type. Your entries and tools stay the same.'
    : `Designed treatment: ${currentDirection[0].toUpperCase()}${currentDirection.slice(1)}. Your entries and tools stay the same.`;
}

function wireTabs(tabs, callback, vertical = false) {
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => callback(tab));
    tab.addEventListener('keydown', (event) => {
      let next;
      const previousKey = vertical ? 'ArrowUp' : 'ArrowLeft';
      const nextKey = vertical ? 'ArrowDown' : 'ArrowRight';
      if (event.key === previousKey) next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === nextKey) next = (index + 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      callback(tabs[next]);
      tabs[next].focus();
    });
  });
}

async function copyFrom(element, successMessage) {
  try {
    if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(element.textContent);
    announce(successMessage);
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    announce('Text selected. Use your browser’s Copy command to copy it.');
  }
}

function updateEntries() {
  const all = notesStore.list();
  const visible = notesStore.search(noteSearch.value, currentFilter);
  const cards = visible.map(note => {
    const card = document.createElement('article');
    card.className = 'note-card';
    card.dataset.kind = note.kind;
    card.dataset.noteId = note.id;
    const open = document.createElement('button');
    open.className = 'note-open';
    open.type = 'button';
    open.setAttribute('aria-label', `Edit ${note.kind}: ${note.title}`);
    open.addEventListener('click', () => openNote(note.id, open));
    const meta = document.createElement('div');
    meta.className = 'note-meta';
    const kind = document.createElement('span');
    kind.className = 'note-type';
    kind.textContent = note.kind.toUpperCase();
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    meta.append(kind, arrow);
    const title = document.createElement('h4');
    title.textContent = note.title;
    const body = document.createElement('p');
    body.textContent = note.body || 'Open to add a thought.';
    const footer = document.createElement('div');
    footer.className = 'note-footer';
    footer.textContent = note.kind === 'decision' ? 'DECISION LOG' : 'YOUR COLLECTION';
    const number = document.createElement('span');
    number.textContent = String(all.findIndex(entry => entry.id === note.id) + 1).padStart(2, '0');
    footer.append(number);
    open.append(meta, title, body, footer);
    card.append(open);
    return card;
  });
  noteGrid.replaceChildren(...cards);
  document.querySelector('#sidebar-count').textContent = String(all.length);
  document.querySelector('#entry-count').textContent = `${visible.length} ${visible.length === 1 ? 'entry' : 'entries'}`;
  const empty = document.querySelector('#empty-notes');
  empty.hidden = visible.length > 0;
  empty.textContent = all.length ? 'No entries match. Try another search or filter.' : 'A blank page, ready for your next idea. Create a note to begin.';
  document.querySelector('#reload-notes').hidden = !notesStore.storageConflict;
  document.querySelector('#workspace-status').textContent = notesStore.storageConflict
    ? 'Notes changed in another tab. Your edits are temporary. Export them before reloading the saved collection.'
    : notesStore.damagedCollection
    ? 'Saved notes could not be read. The original data is preserved. These notes are temporary; export to keep them, or use Reset demo to replace the damaged collection.'
    : notesStore.persistent ? 'Notes saved in this browser.' : 'Notes are temporary. Browser storage is unavailable; export to keep a copy.';
}

function cancelReset() {
  clearTimeout(resetTimer);
  resetArmed = false;
  resetNotesButton.textContent = 'Reset demo';
}

function showAllEntries() {
  currentFilter = 'all';
  noteSearch.value = '';
  document.querySelectorAll('[data-filter]').forEach(option => option.setAttribute('aria-pressed', String(option.dataset.filter === 'all')));
}

function focusEntry(id) {
  const card = [...document.querySelectorAll('.note-card')].find(item => item.dataset.noteId === id);
  const button = card?.querySelector('.note-open');
  if (button) button.focus();
  else if (noteDialogTrigger?.isConnected) noteDialogTrigger.focus();
  else newNoteButton.focus();
}

function readNoteValues() {
  return { title: noteTitle.value, body: noteBody.value, kind: noteKind.value };
}

function dismissNote() {
  const { title, body, kind } = readNoteValues();
  const changed = title !== initialNoteValues.title || body !== initialNoteValues.body || kind !== initialNoteValues.kind;
  if (changed) {
    noteDiscardConfirmation.hidden = false;
    keepEditingButton.focus();
  } else noteDialog.close();
}

function keepEditingNote() {
  noteDiscardConfirmation.hidden = true;
  noteTitle.focus();
}

function handleNoteCancel(event) {
  event.preventDefault();
  if (noteDiscardConfirmation.hidden) dismissNote();
  else keepEditingNote();
}

function openNote(id, trigger) {
  cancelReset();
  const entry = id ? notesStore.list().find(note => note.id === id) : null;
  if (id && !entry) { updateEntries(); announce('That entry is no longer available.'); return; }
  activeNoteId = entry?.id ?? null;
  noteReturnId = activeNoteId;
  noteDialogTrigger = trigger;
  document.querySelector('#note-id').value = activeNoteId ?? '';
  document.querySelector('#note-dialog-title').textContent = entry ? 'Edit your entry' : 'Capture an idea';
  noteTitle.value = entry?.title ?? '';
  noteBody.value = entry?.body ?? '';
  noteKind.value = entry?.kind ?? 'note';
  initialNoteValues = readNoteValues();
  noteError.textContent = '';
  noteDiscardConfirmation.hidden = true;
  document.querySelector('#delete-note').hidden = !entry;
  noteDialog.showModal();
  noteTitle.focus();
}

wireTabs(workflowTabs, setWorkflow, true);
wireTabs(directionTabs, setDirection);
document.querySelectorAll('[data-presentation-option]').forEach(button => {
  button.addEventListener('click', () => setPresentation(button.dataset.presentationOption));
});
promptProject.addEventListener('input', renderPrompt);
promptGoal.addEventListener('input', renderPrompt);
renderPrompt();
setPresentation('designed');

const artStage = document.querySelector('#hero-stage');
const artThemeButtons = [...document.querySelectorAll('[data-art-theme-option]')];
artThemeButtons.forEach(button => {
  button.addEventListener('click', () => {
    const name = button.dataset.artThemeOption;
    if (!artStage || !['mint', 'paper', 'ink'].includes(name)) return;
    artStage.dataset.artTheme = name;
    artThemeButtons.forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  });
});

document.querySelector('#copy-prompt').addEventListener('click', () => {
  copyFrom(document.querySelector('#workflow-prompt'), 'Prompt copied. Paste it into your coding agent.');
});

document.querySelector('#copy-install').addEventListener('click', () => {
  copyFrom(document.querySelector('#install-command'), 'Install commands copied. Replace /path/to/app with your project path.');
});

document.querySelectorAll('[data-agent]').forEach((button) => {
  button.addEventListener('click', () => {
    const agent = button.dataset.agent;
    document.querySelectorAll('[data-agent]').forEach((option) => {
      option.setAttribute('aria-pressed', String(option === button));
    });
    document.querySelector('#install-command').textContent = `git clone https://github.com/TurboTwitch0/INTERFACE-FOUNDRY.git\ncd INTERFACE-FOUNDRY\nnode bin/foundry.mjs init /path/to/app --agent ${agent}`;
    document.querySelector('#install-target').textContent = `Installs into your app’s ${agent === 'codex' ? '.agents' : '.claude'}/skills/ directory.`;
  });
});

document.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    cancelReset();
    currentFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((option) => {
      option.setAttribute('aria-pressed', String(option === button));
    });
    updateEntries();
  });
});

newNoteButton.addEventListener('click', () => openNote(null, newNoteButton));
noteSearch.addEventListener('input', () => { cancelReset(); updateEntries(); });
noteForm.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const values = readNoteValues();
    const entry = activeNoteId ? notesStore.update(activeNoteId, values) : notesStore.create(values);
    noteReturnId = entry.id;
    showAllEntries();
    updateEntries();
    noteDialog.close();
    announce(notesStore.persistent ? 'Entry saved in this browser.' : 'Entry added for this session. Export to keep a copy.');
  } catch (error) { noteError.textContent = error.message; noteTitle.focus(); }
});
document.querySelector('#close-note').addEventListener('click', dismissNote);
document.querySelector('#cancel-note').addEventListener('click', dismissNote);
keepEditingButton.addEventListener('click', keepEditingNote);
document.querySelector('#discard-note').addEventListener('click', () => noteDialog.close());
noteForm.addEventListener('input', () => { noteDiscardConfirmation.hidden = true; });
noteDialog.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.isComposing) return;
  // Repeated Escape presses can produce a non-cancelable native close request.
  if (event.repeat) event.preventDefault();
  else handleNoteCancel(event);
});
noteDialog.addEventListener('cancel', handleNoteCancel);
noteDialog.addEventListener('click', event => {
  if (event.target !== noteDialog) return;
  const rect = noteDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dismissNote();
});
noteDialog.addEventListener('close', () => {
  if (noteDialog.open) return;
  focusEntry(noteReturnId);
  activeNoteId = null;
});
document.querySelector('#delete-note').addEventListener('click', () => {
  if (!activeNoteId) return;
  try {
    const index = notesStore.list().findIndex(note => note.id === activeNoteId);
    deletedEntry = { note: notesStore.remove(activeNoteId), index };
    noteReturnId = null;
    updateEntries();
    document.querySelector('#note-undo').hidden = false;
    noteDialog.close();
    announce('Entry deleted. Undo is available below the collection.');
  } catch (error) { noteError.textContent = error.message; }
});
document.querySelector('#undo-delete').addEventListener('click', () => {
  if (!deletedEntry) return;
  try {
    const entry = notesStore.restore(deletedEntry.note, deletedEntry.index);
    deletedEntry = null;
    document.querySelector('#note-undo').hidden = true;
    showAllEntries();
    updateEntries();
    focusEntry(entry.id);
    announce('Entry restored.');
  } catch (error) { announce(error.message); }
});
document.querySelector('#export-notes').addEventListener('click', () => {
  const collection = { version: 1, exportedAt: new Date().toISOString(), notes: notesStore.list() };
  saveFile(new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' }), 'interface-foundry-notes.json');
  announce('Exported your entries as a JSON file.');
});
resetNotesButton.addEventListener('click', () => {
  if (!resetArmed) {
    resetArmed = true;
    resetNotesButton.textContent = 'Confirm reset';
    announce('Press Confirm reset within 10 seconds to replace your entries with the starter notes. Export first to keep a copy.');
    resetTimer = setTimeout(cancelReset, 10000);
    return;
  }
  cancelReset();
  notesStore.reset();
  deletedEntry = null;
  document.querySelector('#note-undo').hidden = true;
  showAllEntries();
  updateEntries();
  announce('Starter collection restored.');
});
document.querySelector('#reload-notes').addEventListener('click', () => {
  if (window.confirm('Export this tab’s temporary notes first to keep them. Reload and replace them with the saved collection?')) window.location.reload();
});

updateEntries();

const skillDialog = document.querySelector('#skill-dialog');
const skillContent = document.querySelector('#skill-content');
const skillFeedback = document.querySelector('#skill-feedback');
const copySkillButton = document.querySelector('#copy-skill');
const downloadSkillButton = document.querySelector('#download-skill');
const retrySkillButton = document.querySelector('#retry-skill');
let openedSkill = 'direction';
let dialogTrigger;
let currentSkillText = null;
let skillsPromise;
let skillRequestId = 0;

function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function fetchSkills() {
  // Share an in-flight request and cache successful content. A failure can be retried.
  if (!skillsPromise) {
    skillsPromise = fetch('data/skills.json')
      .then(response => {
        if (!response.ok) throw new Error('Skill data could not be loaded.');
        return response.json();
      })
      .then(skills => {
        for (const name of Object.keys(workflows)) {
          if (typeof skills?.[name] !== 'string' || !skills[name].trim()) {
            throw new Error('Skill data is incomplete.');
          }
        }
        return skills;
      })
      .catch(error => {
        skillsPromise = null;
        throw error;
      });
  }
  return skillsPromise;
}

async function loadCurrentSkill() {
  const name = openedSkill;
  const requestId = ++skillRequestId;
  currentSkillText = null;
  copySkillButton.disabled = true;
  downloadSkillButton.disabled = true;
  retrySkillButton.hidden = true;
  skillContent.setAttribute('aria-busy', 'true');
  skillContent.textContent = 'Loading skill…';
  skillFeedback.textContent = 'Loading the complete skill.';
  try {
    const skills = await fetchSkills();
    // Closing or changing the selected workflow must not show an older response.
    if (requestId !== skillRequestId || !skillDialog.open) return;
    currentSkillText = skills[name];
    skillContent.textContent = currentSkillText;
    skillContent.setAttribute('aria-busy', 'false');
    copySkillButton.disabled = false;
    downloadSkillButton.disabled = false;
    skillFeedback.textContent = 'Skill loaded. You can read, copy, or download it.';
  } catch {
    if (requestId !== skillRequestId || !skillDialog.open) return;
    skillContent.textContent = 'The skill text could not be loaded. Try again, or open the complete skill on GitHub.';
    skillContent.setAttribute('aria-busy', 'false');
    skillFeedback.textContent = 'Unable to load this skill. Choose Try again to retry.';
    retrySkillButton.hidden = false;
  }
}

document.querySelector('#skill-source').addEventListener('click', event => {
  const name = event.currentTarget.dataset.skill;
  if (!Object.hasOwn(workflows, name)) return;
  openedSkill = name;
  document.querySelector('#skill-dialog-title').textContent = 'foundry-' + openedSkill;
  document.querySelector('#skill-github').href = `https://github.com/TurboTwitch0/INTERFACE-FOUNDRY/blob/main/skills/foundry-${openedSkill}/SKILL.md`;
  dialogTrigger = event.currentTarget;
  if (!skillDialog.open) skillDialog.showModal();
  loadCurrentSkill();
});
retrySkillButton.addEventListener('click', loadCurrentSkill);
document.querySelector('#close-skill').addEventListener('click', () => skillDialog.close());
skillDialog.addEventListener('click', event => {
  if (event.target !== skillDialog) return;
  const rect = skillDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) skillDialog.close();
});
skillDialog.addEventListener('close', () => {
  if (skillDialog.open) return;
  skillRequestId += 1;
  currentSkillText = null;
  dialogTrigger?.focus();
});
copySkillButton.addEventListener('click', () => {
  if (currentSkillText) copyFrom(skillContent, 'Skill copied. Supporting templates are in the toolkit ZIP.');
});
downloadSkillButton.addEventListener('click', () => {
  if (!currentSkillText) return;
  saveFile(new Blob([currentSkillText], { type: 'text/markdown;charset=utf-8' }), 'SKILL.md');
  announce('SKILL.md downloaded. Get supporting templates from the toolkit ZIP.');
});
