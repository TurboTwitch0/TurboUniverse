import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from datetime import datetime, timezone

spec = importlib.util.spec_from_file_location('refresh', Path(__file__).with_name('refresh-catalog.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
OLD = {'id': 'owner', 'title': 'Orbit Study', 'url': 'https://github.com/TurboTwitch0/StudyOrbit', 'status': 'setup-pending', 'description': 'Owner copy', 'featured': True}
NEW = {'title': 'New App', 'url': 'https://new.example/', 'description': 'Discovered', 'type': 'website'}
NOW = datetime(2026, 10, 26, tzinfo=timezone.utc)

class RefreshTests(unittest.TestCase):
    def test_curated_link_and_fields_win_over_old_source_url(self):
        self.assertEqual(module.merge([OLD], [{**NEW, 'title': 'Orbit Study', 'url': 'https://old.example/'}], NOW), [OLD])
    def test_append_is_idempotent_and_preserves_owner_record(self):
        result = module.merge([OLD], [NEW, NEW], NOW)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0], OLD)
        self.assertFalse(result[1]['featured'])
        self.assertEqual(module.merge(result, [NEW], NOW), result)
        self.assertEqual(result[1]['id'], module.merge([], [NEW], NOW)[0]['id'])
    def test_failed_partial_empty_and_no_change_retain_bytes(self):
        def failed(**_):
            raise module.importer.ImportFailure('Sign-in required')
        def partial(*, failures):
            failures.append('Missing page')
            return [NEW]
        for crawl in [failed, partial, lambda **_: [], lambda **_: [OLD]]:
            with self.subTest(crawl=crawl), tempfile.TemporaryDirectory() as directory:
                catalog = Path(directory) / 'catalog.json'
                original = json.dumps([OLD]).encode()
                catalog.write_bytes(original)
                if crawl == failed or crawl == partial or not crawl():
                    with self.assertRaises(module.importer.ImportFailure):
                        module.refresh(catalog, crawl)
                else:
                    self.assertEqual(module.refresh(catalog, crawl), 0)
                self.assertEqual(catalog.read_bytes(), original)

if __name__ == '__main__':
    unittest.main(verbosity=2)
