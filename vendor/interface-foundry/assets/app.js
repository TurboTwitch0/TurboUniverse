'use strict';

const workflows = {
  direction: {
    title: 'Set a direction.\nThen commit to it.',
    description: 'Define the audience, the main task, and a visual point of view. Turn those decisions into a small set of design tokens that your agent can actually follow.',
    output: 'A DESIGN.md with typography, color, spacing, interaction rules, and the reasons behind them.',
    prompt: 'Use foundry-direction to define a calm, editorial interface for a research notes app. Prioritize scanning and retrieval. Create DESIGN.md before changing components.'
  },
  audit: {
    title: 'Find the friction.\nFix what matters.',
    description: 'Inspect the interface around a real user task. Look for unclear hierarchy, inaccessible controls, inconsistent components, and broken states. Tie every finding to observable evidence.',
    output: 'A prioritized audit: the problem, its evidence, its user impact, and a concrete next step. Untested areas stay explicit.',
    prompt: 'Use foundry-audit to review the research notes app. Follow the create-and-find-a-note flow. Prioritize accessibility and confusing states. Give evidence for each finding; distinguish inspected behavior from assumptions.'
  },
  reference: {
    title: 'Study the choices.\nMake your own.',
    description: 'Use relevant references to understand hierarchy, density, type, and interaction patterns. Extract the principles that fit your product, with sources and attribution kept intact.',
    output: 'A reference map that connects observed design decisions to your own tokens and components, with provenance and reuse limits.',
    prompt: 'Use foundry-reference to study the references I provide for the notes app. Compare typography, hierarchy, density, and navigation. Record source URLs and what we can adapt. Propose an original direction rather than copying a brand.'
  },
  reconstruct: {
    title: 'From a visual.\nTo something usable.',
    description: 'Read a screenshot as a system of layout, type, spacing, and components. Rebuild the visible structure, then make explicit choices for the responsive layouts and states the image cannot show.',
    output: 'A working interface with a visual inventory, reusable tokens, responsive rules, and a clear list of inferred behavior.',
    prompt: 'Use foundry-reconstruct with the screenshot I attach. First inventory its layout and tokens, then implement it in the existing stack. Make the page responsive, wire its primary actions, and label assumptions about unseen states.'
  },
  verify: {
    title: 'Follow the flow.\nProve the result.',
    description: 'Open the interface and exercise its main task end to end. Check keyboard access, narrow screens, empty and error states, and whether saved data returns correctly when a backend is present.',
    output: 'A verification record with steps, actual outcomes, viewport details, supporting evidence, and any checks that could not be run.',
    prompt: 'Use foundry-verify to test creating, finding, and reopening a note. Check desktop and narrow screens, keyboard navigation, and empty states. Report actual results and failures. Do not claim browser or backend checks you cannot run.'
  }
};

const themes = {
  editorial: { summary: 'Warm. Literate. Considered.', caption: 'Paper + ink / Serif headlines / Fine rules', color: '#d5f05a' },
  studio: { summary: 'Quiet. Friendly. Purposeful.', caption: 'Sage + pine / Bold sans / Soft corners', color: '#b2dec1' },
  terminal: { summary: 'Precise. Direct. Focused.', caption: 'Phosphor + forest / Monospace / Dashed rules', color: '#b4ed71' }
};

const workflowTabs = [...document.querySelectorAll('[data-workflow]')];
const directionTabs = [...document.querySelectorAll('[data-direction]')];
const toast = document.querySelector('#toast');
let toastTimer;
let currentFilter = 'all';
let noteNumber = 3;

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

function setWorkflow(tab) {
  const name = tab.dataset.workflow;
  const workflow = workflows[name];
  if (!workflow) return;
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
  document.querySelector('#workflow-prompt').textContent = workflow.prompt;
  document.querySelector('#skill-source').dataset.skill = name;
}

function setDirection(tab) {
  const name = tab.dataset.direction;
  const theme = themes[name];
  if (!theme) return;
  selectTab(directionTabs, tab);
  const preview = document.querySelector('#design-preview');
  preview.dataset.theme = name;
  preview.setAttribute('aria-labelledby', tab.id);
  document.querySelector('#theme-summary').textContent = theme.summary;
  document.querySelector('#token-caption').textContent = theme.caption;
  document.querySelector('#token-color').style.backgroundColor = theme.color;
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
  const cards = [...document.querySelectorAll('.note-card')];
  let shown = 0;
  cards.forEach((card) => {
    const visible = currentFilter === 'all' || card.dataset.kind === currentFilter;
    card.hidden = !visible;
    if (visible) shown += 1;
  });
  document.querySelector('#sidebar-count').textContent = String(cards.length);
  document.querySelector('#entry-count').textContent = `${shown} ${shown === 1 ? 'entry' : 'entries'}`;
}

wireTabs(workflowTabs, setWorkflow, true);
wireTabs(directionTabs, setDirection);

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
    currentFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((option) => {
      option.setAttribute('aria-pressed', String(option === button));
    });
    updateEntries();
  });
});

document.querySelector('#new-note').addEventListener('click', () => {
  noteNumber += 1;
  const card = document.createElement('article');
  card.className = 'note-card';
  card.dataset.kind = 'note';
  const meta = document.createElement('div');
  meta.className = 'note-meta';
  const kind = document.createElement('span');
  kind.className = 'note-type';
  kind.textContent = 'NOTE';
  const arrow = document.createElement('span');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '↗';
  meta.append(kind, arrow);
  const heading = document.createElement('h4');
  heading.textContent = `A new idea. No. ${noteNumber}`;
  const description = document.createElement('p');
  description.textContent = 'One small thought, ready to become something useful. This is a local demo entry.';
  const footer = document.createElement('div');
  footer.className = 'note-footer';
  footer.textContent = 'YOUR NEXT THOUGHT';
  const number = document.createElement('span');
  number.textContent = String(noteNumber).padStart(2, '0');
  footer.append(number);
  card.append(meta, heading, description, footer);
  document.querySelector('#note-grid').prepend(card);
  currentFilter = 'all';
  document.querySelectorAll('[data-filter]').forEach((option) => {
    option.setAttribute('aria-pressed', String(option.dataset.filter === 'all'));
  });
  updateEntries();
  announce('New note added to the local demo. It resets when you reload.');
});

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
skillDialog.addEventListener('click', event => { if (event.target === skillDialog) skillDialog.close(); });
skillDialog.addEventListener('close', () => {
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
