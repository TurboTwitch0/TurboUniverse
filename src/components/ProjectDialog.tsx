import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, FileJson, ImagePlus, LoaderCircle, Upload, X } from 'lucide-react';
import { apiFetch } from '../api';

type Props = { onClose: () => void; onCreated: () => void; maxUploadBytes: number };
type ImportProject = {
  title: string;
  type: 'website' | 'app';
  url: string;
  description: string;
  category: string;
  year: number;
  featured: boolean;
};

const CURRENT_YEAR = new Date().getFullYear();
const CATEGORIES = ['Creative', 'Tools', 'Gaming', 'Community'];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const PROJECT_EXTENSIONS = ['zip', 'html', 'apk', 'pdf'];

function safeUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('Use a complete website address, starting with https:// or http://.');
  }
  if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error('Project links must be an http:// or https:// address without login details.');
  }
  return parsed.href;
}

function parseImport(text: string): ImportProject[] {
  if (!text.trim()) throw new Error('Choose a JSON file or paste your project links first.');
  let rows: unknown[];
  if (/^[\[{]/.test(text.trim())) {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error('The JSON could not be read. Check the file or paste one project link per line.');
    }
    const candidate = Array.isArray(value) ? value : value && typeof value === 'object' && 'projects' in value ? value.projects : undefined;
    if (!Array.isArray(candidate)) throw new Error('Use a JSON array of projects, or an object containing a projects array.');
    rows = candidate;
  } else {
    rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((url) => {
      const normalized = safeUrl(url);
      const title = new URL(normalized).hostname.replace(/^www\./, '');
      return { title, url: normalized };
    });
  }
  if (!rows.length) throw new Error('There are no projects to import.');
  if (rows.length > 100) throw new Error('Import up to 100 projects at a time.');
  return rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Project ${index + 1} must be an object with a title and URL.`);
    const item = row as Record<string, unknown>;
    if (typeof item.title !== 'string' || !item.title.trim() || item.title.trim().length > 100) {
      throw new Error(`Project ${index + 1} needs a title of 1–100 characters.`);
    }
    if (typeof item.url !== 'string' || !item.url.trim()) throw new Error(`“${item.title}” needs a website address.`);
    const description = item.description === undefined ? '' : item.description;
    if (typeof description !== 'string' || description.length > 1000) throw new Error(`“${item.title}” needs a description under 1,000 characters.`);
    if (item.type !== undefined && item.type !== 'website' && item.type !== 'app') throw new Error(`“${item.title}” has an invalid type. Choose website or app.`);
    const year = item.year === undefined ? CURRENT_YEAR : Number(item.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) throw new Error(`“${item.title}” needs a year between 1900 and 2100.`);
    if (item.category !== undefined && (typeof item.category !== 'string' || item.category.trim().length > 40)) {
      throw new Error(`“${item.title}” needs a category of 40 characters or fewer.`);
    }
    if (item.featured !== undefined && typeof item.featured !== 'boolean') throw new Error(`“${item.title}” needs featured to be true or false.`);
    return {
      title: item.title.trim(),
      type: item.type === 'app' ? 'app' : 'website',
      url: safeUrl(item.url),
      description,
      category: typeof item.category === 'string' && item.category.trim() ? item.category.trim() : 'Creative',
      year,
      featured: item.featured === true,
    };
  });
}

async function checkResponse(response: Response) {
  let data: { error?: string };
  try {
    data = await response.json();
  } catch {
    throw new Error('The server returned an unexpected response. Please try again.');
  }
  if (!response.ok) throw new Error(data.error || 'Your project could not be saved. Please try again.');
}

export default function ProjectDialog({ onClose, onCreated, maxUploadBytes }: Props) {
  const cloudUpload = maxUploadBytes < 10_000_000;
  const aggregateLimit = cloudUpload ? Math.max(0, maxUploadBytes - 20_000) : maxUploadBytes;
  const coverLimit = Math.min(10 * 1024 * 1024, aggregateLimit);
  const fileLimit = Math.min(30 * 1024 * 1024, aggregateLimit);
  const sizeHint = cloudUpload ? `under ${Math.floor(maxUploadBytes / 1_000_000)} MB combined` : 'up to 30 MB';
  const [tab, setTab] = useState<'add' | 'import'>('add');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cover, setCover] = useState<File | null>(null);
  const [projectFile, setProjectFile] = useState<File | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 0);
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busyRef.current) onCloseRef.current();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')).filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) {
        event.preventDefault();
        dialogRef.current.focus();
      } else if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = originalOverflow;
      previousFocus.current?.focus();
    };
  }, []);

  function switchTab(next: 'add' | 'import') {
    setTab(next);
    setError('');
  }

  async function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const title = String(data.get('title') || '').trim();
      if (!title || title.length > 100) throw new Error('Give your project a title of 1–100 characters.');
      data.set('title', title);
      const url = String(data.get('url') || '').trim();
      if (!url && !projectFile) throw new Error('Add a project link or upload a project file.');
      if (url) data.set('url', safeUrl(url));
      if (cover) {
        if (!IMAGE_TYPES.includes(cover.type)) throw new Error('Choose a PNG, JPEG, WebP, or GIF cover image.');
        if (cover.size > coverLimit) throw new Error(cloudUpload ? `Keep the cover and project file ${sizeHint}.` : 'Cover images must be 10 MB or smaller.');
        data.set('cover', cover);
      } else data.delete('cover');
      if (projectFile) {
        const extension = projectFile.name.split('.').pop()?.toLowerCase();
        if (!extension || !PROJECT_EXTENSIONS.includes(extension)) throw new Error('Upload a ZIP, HTML, APK, or PDF project file.');
        if (projectFile.size > fileLimit) throw new Error(`Project files must be ${sizeHint}.`);
        data.set('file', projectFile);
      } else data.delete('file');
      if ((cover?.size || 0) + (projectFile?.size || 0) > aggregateLimit) throw new Error(cloudUpload ? `Keep the cover and project file ${sizeHint}.` : 'Keep the cover and project file under 30 MB combined.');
      setBusy(true);
      await checkResponse(await apiFetch('/api/projects', { method: 'POST', body: data }));
      onCreated();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function importProjects(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    let completed = 0;
    try {
      const projects = parseImport(bulkText);
      setProgress({ completed: 0, total: projects.length });
      setBusy(true);
      for (let index = 0; index < projects.length; index += 1) {
        await checkResponse(await apiFetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(projects[index]),
        }));
        completed += 1;
        setProgress({ completed, total: projects.length });
        // Keep only unsaved entries, so retrying a partial import never repeats completed requests.
        setBulkText(index + 1 === projects.length ? '' : JSON.stringify({ projects: projects.slice(index + 1) }, null, 2));
      }
      onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The import could not be completed.';
      setError(completed ? `${completed} project${completed === 1 ? '' : 's'} saved. ${message} The remaining projects are ready to retry.` : message);
    } finally {
      if (completed) onCreated();
      setBusy(false);
    }
  }

  async function readImportFile(file: File | undefined) {
    if (!file) return;
    setError('');
    if (file.size > 2 * 1024 * 1024) {
      setError('Choose a JSON file smaller than 2 MB.');
      return;
    }
    try {
      const text = await file.text();
      parseImport(text);
      setBulkText(text);
      setProgress({ completed: 0, total: 0 });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The import file could not be read.');
    }
  }

  function downloadExample() {
    const blob = new Blob([JSON.stringify({ projects: [{ title: 'My first world', type: 'website', url: 'https://example.com', description: 'A little idea that became something bigger.', category: 'Creative', year: CURRENT_YEAR }] }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'turbo-projects-example.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title" aria-describedby="project-dialog-description" ref={dialogRef} tabIndex={-1}>
        <div className="dialog-head">
          <div>
            <span className="eyebrow">EXPAND THE UNIVERSE</span>
            <h2 id="project-dialog-title">A new world awaits.</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="Close add project dialog"><X size={21} /></button>
        </div>
        <p className="dialog-description muted" id="project-dialog-description">Bring your websites and apps together. Projects are saved in your collection.</p>
        <div className="dialog-tabs" aria-label="Choose how to add projects">
          <button className={`dialog-tab ${tab === 'add' ? 'active' : ''}`} type="button" aria-pressed={tab === 'add'} onClick={() => switchTab('add')} disabled={busy}>Add a project</button>
          <button className={`dialog-tab ${tab === 'import' ? 'active' : ''}`} type="button" aria-pressed={tab === 'import'} onClick={() => switchTab('import')} disabled={busy}>Bulk import</button>
        </div>
        {tab === 'add' ? (
          <form onSubmit={addProject}>
            <fieldset disabled={busy} className="form-grid">
              <div className="field-row">
                <label className="field">Project name <input data-autofocus name="title" placeholder="Give your world a name" required maxLength={100} autoComplete="off" /></label>
                <label className="field">Project type <select name="type" defaultValue="website"><option value="website">Website</option><option value="app">App</option></select></label>
              </div>
              <label className="field">Project link <input name="url" type="url" placeholder="https://your-next-big-idea.com" autoComplete="url" /><span className="field-hint">Add a link, upload a file below, or both.</span></label>
              <label className="field">The story <textarea name="description" rows={3} maxLength={1000} placeholder="What did you build? What makes it yours?" /></label>
              <div className="field-row">
                <label className="field">Category <select name="category" defaultValue="Creative">{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
                <label className="field">Year created <input name="year" type="number" min={1900} max={2100} defaultValue={CURRENT_YEAR} required /></label>
              </div>
              <div className="field-row">
                <label className="upload-zone upload-field"><ImagePlus size={22} /><span>{cover ? cover.name : 'Add a cover image'}</span><span className="field-hint">PNG, JPEG, WebP, GIF · {cloudUpload ? sizeHint : 'up to 10 MB'}</span><input type="file" name="cover" aria-label="Cover image" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setCover(event.target.files?.[0] || null)} /></label>
                <label className="upload-zone upload-field"><Upload size={22} /><span>{projectFile ? projectFile.name : 'Upload project files'}</span><span className="field-hint">ZIP, HTML, APK, PDF · {sizeHint}</span><input type="file" name="file" aria-label="Project file" accept=".zip,.html,.apk,.pdf" onChange={(event) => setProjectFile(event.target.files?.[0] || null)} /></label>
              </div>
            </fieldset>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="form-footer"><span className="muted">Your next chapter starts here.</span><button className="primary-button" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={17} className="spin" /> Uploading…</> : <>Add to the universe <ArrowUpRight size={17} /></>}</button></div>
          </form>
        ) : (
          <form onSubmit={importProjects}>
            <fieldset disabled={busy} className="form-grid">
              <label className="upload-zone upload-field"><FileJson size={25} /><span>Choose a project list</span><span className="field-hint">JSON · up to 100 projects per import</span><input type="file" accept=".json,application/json" aria-label="Import project list" onChange={(event) => void readImportFile(event.target.files?.[0])} /></label>
              <label className="field">Or paste project links <textarea className="bulk-textarea" rows={8} value={bulkText} onChange={(event) => { setBulkText(event.target.value); setProgress({ completed: 0, total: 0 }); }} placeholder={'https://my-first-site.com\nhttps://my-favorite-app.com\n\nOne link per line, or paste a JSON project list.'} spellCheck={false} /></label>
              <span className="field-hint">Links become website projects. Use JSON to include names, descriptions, categories, and app types.</span>
              <button className="text-button" type="button" onClick={downloadExample}>Download an example JSON file <ArrowUpRight size={14} /></button>
            </fieldset>
            {progress.total > 0 && <p className="import-progress" role="status" aria-live="polite">{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} {progress.completed} of {progress.total} projects saved</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="form-footer"><span className="muted">All your worlds. One home.</span><button className="primary-button" type="submit" disabled={busy || !bulkText.trim()}>{busy ? <><LoaderCircle size={17} className="spin" /> Importing…</> : <>Import projects <Upload size={17} /></>}</button></div>
          </form>
        )}
      </div>
    </div>
  );
}
