"""Append new public TurboHome links without replacing curated records."""
import importlib.util
import json
from pathlib import Path
import re
import sys
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, uuid5

spec = importlib.util.spec_from_file_location('turbohome_importer', Path(__file__).with_name('import-turbohome.py'))
importer = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = importer
spec.loader.exec_module(importer)
CATALOG = Path(__file__).resolve().parents[1] / 'server/catalog.json'

def merge(existing, discovered, now):
    result = list(existing)
    keys = {importer.canonical_key(p.get('url', '')) for p in existing}
    title_key = lambda title: re.sub(r'[^\w]', '', title.casefold())
    titles = {title_key(p.get('title', '')) for p in existing}
    for project in discovered:
        key = importer.canonical_key(project.get('url', ''))
        title = title_key(project.get('title', ''))
        if not key or not title or key in keys or title in titles:
            continue
        result.append({**project, 'id': str(uuid5(NAMESPACE_URL, 'turbouniverse:' + key)), 'year': now.year, 'featured': False, 'createdAt': now.isoformat().replace('+00:00', 'Z')})
        keys.add(key)
        titles.add(title)
    return result

def refresh(catalog=CATALOG, crawl=None):
    existing = json.loads(catalog.read_text(encoding='utf-8'))
    if not isinstance(existing, list) or any(not isinstance(p, dict) for p in existing):
        raise importer.ImportFailure('Invalid existing catalog; no changes written.')
    failures = []
    discovered = (crawl or importer.crawl_site)(failures=failures)
    if failures or not discovered:
        raise importer.ImportFailure('Unavailable, empty, or incomplete discovery; catalog preserved. ' + ' '.join(failures))
    updated = merge(existing, discovered, datetime.now(timezone.utc))
    added = len(updated) - len(existing)
    if added:
        temporary = catalog.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(updated, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        temporary.replace(catalog)
    print(f'Added {added} projects; preserved all {len(existing)} existing records.')
    return added

if __name__ == '__main__':
    try:
        refresh()
    except (importer.ImportFailure, OSError, ValueError) as error:
        print(f'Refresh stopped: {error}', file=sys.stderr)
        raise SystemExit(1)
