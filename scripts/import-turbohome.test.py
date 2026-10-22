"""Offline tests for TurboHome discovery; no external requests are made."""

import importlib.util
from pathlib import Path
import sys
import unittest


SPEC = importlib.util.spec_from_file_location(
    "turbohome_importer", Path(__file__).with_name("import-turbohome.py")
)
importer = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = importer
SPEC.loader.exec_module(importer)

HOME = "https://sites.google.com/stu.neisd.net/turbohome/home"


class LinkDiscoveryTests(unittest.TestCase):
    def test_nested_anchor_titles_are_cleaned_and_relative_pages_resolved(self):
        html = """
            <a href="/stu.neisd.net/turbohome/apps"> More <span>Turbo</span> apps </a>
            <a href="https://example.com"> Turbo  <strong>Studio</strong> </a>
        """
        links = importer.extract_links(html, HOME)
        found = {link.url: link.title for link in links}
        self.assertEqual(found["https://example.com/"], "Turbo Studio")
        self.assertEqual(
            found["https://sites.google.com/stu.neisd.net/turbohome/apps"],
            "More Turbo apps",
        )

    def test_google_redirects_are_unwrapped_but_unsafe_and_account_links_ignored(self):
        html = """
            <a href="https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fgame">Game</a>
            <a href="/url?q=https%3A%2F%2Fanother.example%2F">Other</a>
            <a href="javascript:alert(1)">Unsafe</a>
            <a href="mailto:turbo@example.com">Email</a>
            <a href="https://accounts.google.com/ServiceLogin">Sign in</a>
            <a href="https://sites.google.com/d/editor-id/edit">Edit site</a>
        """
        links = importer.extract_links(html, HOME)
        urls = {link.url for link in links}
        self.assertIn("https://example.com/game", urls)
        self.assertIn("https://another.example/", urls)
        self.assertFalse(any(url.startswith(("javascript:", "mailto:")) for url in urls))
        self.assertFalse(any("accounts.google.com" in url for url in urls))
        self.assertFalse(any("/d/editor-id/" in url for url in urls))

    def test_internal_scope_is_exact_and_rejects_lookalikes(self):
        self.assertTrue(importer.is_internal(HOME))
        self.assertTrue(importer.is_internal("https://sites.google.com/stu.neisd.net/turbohome/apps"))
        for url in (
            "https://sites.google.com/stu.neisd.net/turbohome-evil/home",
            "https://sites.google.com.evil.example/stu.neisd.net/turbohome/home",
            "https://sites.google.com/stu.neisd.net/another-site/home",
            "https://example.com/stu.neisd.net/turbohome/home",
        ):
            with self.subTest(url=url):
                self.assertFalse(importer.is_internal(url))

    def test_project_keys_group_google_site_pages_but_keep_distinct_projects(self):
        key = importer.canonical_key
        self.assertEqual(
            key("https://sites.google.com/stu.neisd.net/turbogames/home"),
            key("https://sites.google.com/stu.neisd.net/turbogames/arcade"),
        )
        self.assertEqual(
            key("https://sites.google.com/view/turbostudio/home"),
            key("https://sites.google.com/view/turbostudio/gallery"),
        )
        self.assertNotEqual(key("https://one.example/"), key("https://two.example/"))
        self.assertNotEqual(
            key("https://sites.google.com/view/one/home"),
            key("https://sites.google.com/view/two/home"),
        )

    def test_collect_projects_deduplicates_google_site_pages_and_omits_hub_navigation(self):
        pages = [
            (HOME, """
                <a href="/stu.neisd.net/turbohome/apps">Apps</a>
                <a href="https://sites.google.com/view/turbogame/home">Turbo Game</a>
                <a href="https://studio.example/">Turbo Studio</a>
            """),
            ("https://sites.google.com/stu.neisd.net/turbohome/apps", """
                <a href="https://sites.google.com/view/turbogame/levels">More levels</a>
                <a href="https://studio.example/">Studio again</a>
                <a href="https://play.google.com/store/apps/details?id=dev.turbo.app">Turbo App</a>
            """),
        ]
        projects = importer.collect_projects(pages)
        self.assertEqual(len(projects), 3)
        self.assertTrue(all(not importer.is_internal(project["url"]) for project in projects))
        self.assertEqual(len({importer.canonical_key(p["url"]) for p in projects}), 3)
        by_title = {p["title"]: p for p in projects}
        self.assertIn("Turbo Game", by_title)
        self.assertEqual(by_title["Turbo App"]["type"], "app")
        self.assertTrue(all(p["description"] for p in projects))


class CrawlTests(unittest.TestCase):
    def test_crawler_only_fetches_pages_inside_turbohome(self):
        second = "https://sites.google.com/stu.neisd.net/turbohome/apps"
        fixtures = {
            HOME: """
                <a href="/stu.neisd.net/turbohome/apps">Apps</a>
                <a href="https://external.example/">An external creation</a>
            """,
            second: """
                <a href="/stu.neisd.net/turbohome/home">Home</a>
                <a href="https://other.example/">Another creation</a>
            """,
        }
        fetched = []

        def fetch_page(url):
            self.assertIn(url, fixtures, "External sites must never be crawled")
            fetched.append(url)
            return url, fixtures[url]

        projects = importer.crawl_site(fetch_page=fetch_page, max_pages=40)
        self.assertEqual(set(fetched), {HOME, second})
        self.assertEqual(len(fetched), 2)
        self.assertEqual({p["url"] for p in projects}, {"https://external.example/", "https://other.example/"})

    def test_page_limit_bounds_crawl_requests(self):
        fetched = []

        def fetch_page(url):
            fetched.append(url)
            return url, '<a href="/stu.neisd.net/turbohome/page-2">Next</a><a href="https://example.com">Project</a>'

        projects = importer.crawl_site(fetch_page=fetch_page, max_pages=1)
        self.assertEqual(fetched, [HOME])
        self.assertEqual(len(projects), 1)

    def test_sign_in_redirect_is_an_access_failure(self):
        def fetch_page(_url):
            return "https://accounts.google.com/ServiceLogin", "<title>Sign in</title>"

        with self.assertRaises(Exception):
            importer.crawl_site(fetch_page=fetch_page, max_pages=40)


if __name__ == "__main__":
    unittest.main(verbosity=2)
