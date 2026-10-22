#!/usr/bin/env python3
"""Import publicly linked TurboHome projects without fetching external sites.

Usage: python3 scripts/import-turbohome.py --dry-run --output /tmp/turbo-projects.json
       python3 scripts/import-turbohome.py

The Google Sites host must be allowed in the cloud environment settings. This
tool preserves inherited proxy settings and TLS certificate verification.
"""

from __future__ import annotations

import argparse
from collections import deque
from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import ssl
import sys
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener, urlopen


SOURCE = "https://sites.google.com/stu.neisd.net/turbohome/home"
SITE_PATH = "/stu.neisd.net/turbohome/"
MAX_PAGE_BYTES = 4 * 1024 * 1024
MAX_API_BYTES = 8 * 1024 * 1024
USER_AGENT = "TurboUniverse-ProjectImporter/1.0"
EXCLUDED_TITLES = {
    "sign in", "sign out", "report abuse", "report a problem", "google sites",
    "powered by google sites", "privacy", "privacy policy", "terms", "terms of service",
    "edit this site", "skip to main content", "skip to navigation", "search this site",
}
EXCLUDED_HOSTS = {
    "accounts.google.com", "support.google.com", "policies.google.com",
    "www.google.com", "google.com", "sites.google.com",
}


class ImportFailure(Exception):
    """A readable prerequisite or access error rather than imported page data."""


@dataclass(frozen=True)
class Link:
    url: str
    title: str


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", unescape(value)).strip()


def normalize_url(value: str, base_url: str = SOURCE) -> str | None:
    """Accept HTTP(S) links, unwrap Google's outbound redirect, and omit trackers."""
    value = unescape(value).strip()
    if not value or value.startswith(("#", "javascript:", "mailto:", "tel:", "data:")):
        return None
    target = urljoin(base_url, value)
    for _ in range(3):
        parsed = urlsplit(target)
        if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password:
            return None
        if parsed.hostname.lower() in {"www.google.com", "google.com", "sites.google.com"} and parsed.path == "/url":
            query = parse_qs(parsed.query)
            wrapped = (query.get("q") or query.get("url") or [None])[0]
            if wrapped:
                target = urljoin(base_url, wrapped)
                continue
        break
    else:
        return None
    parsed = urlsplit(target)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password:
        return None
    host = parsed.hostname.lower()
    try:
        port = parsed.port
    except ValueError:
        return None
    netloc = host + (f":{port}" if port and not (parsed.scheme == "https" and port == 443 or parsed.scheme == "http" and port == 80) else "")
    # Keep meaningful query parameters. A signed/query-based project URL must not
    # be rewritten merely to make a prettier portfolio link.
    return urlunsplit((parsed.scheme.lower(), netloc, parsed.path or "/", parsed.query, ""))


def is_internal(url: str) -> bool:
    parsed = urlsplit(url)
    decoded_path = unquote(parsed.path)
    # Never follow dot segments or alternate ports out of the intended site.
    return (
        parsed.scheme == "https"
        and parsed.hostname == "sites.google.com"
        and parsed.port in {None, 443}
        and decoded_path.startswith(SITE_PATH)
        and not any(part in {".", ".."} for part in decoded_path.split("/"))
        and not re.search(r"/(?:edit|preview)(?:/|$)", decoded_path)
    )


def google_site_identity(url: str) -> str | None:
    parsed = urlsplit(url)
    if parsed.hostname != "sites.google.com":
        return None
    parts = [part for part in parsed.path.split("/") if part]
    if not parts or parts[0] == "d" or re.search(r"/(?:edit|preview)(?:/|$)", parsed.path):
        return None
    count = 3 if parts[0] == "a" else 2
    if len(parts) < count:
        return None
    return "https://sites.google.com/" + "/".join(parts[:count])


def canonical_key(url: str) -> str:
    normalized = normalize_url(url)
    if not normalized:
        return ""
    identity = google_site_identity(normalized)
    if identity:
        return identity
    parsed = urlsplit(normalized)
    if parsed.hostname in {'docs.google.com', 'drive.google.com'}:
        document = re.search(r'/d/([^/]+)', parsed.path)
        if document:
            return f'https://{parsed.hostname}/d/{document.group(1)}'
    # Scheme and www spelling should not duplicate the same destination. Preserve
    # paths and queries for hosts that serve multiple independent applications.
    host = parsed.netloc.removeprefix("www.")
    return urlunsplit(("https", host, parsed.path.rstrip("/") or "/", parsed.query, ""))


def is_project_link(url: str, title: str) -> bool:
    if clean_text(title).lower() in EXCLUDED_TITLES:
        return False
    parsed = urlsplit(url)
    if parsed.hostname == "sites.google.com":
        return google_site_identity(url) is not None and not is_internal(url)
    return parsed.hostname not in EXCLUDED_HOSTS


class AnchorParser(HTMLParser):
    def __init__(self, base_url: str):
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.links: list[Link] = []
        self.anchor: tuple[str, str] | None = None
        self.text: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag in {"script", "style"}:
            self.hidden += 1
        if tag == "a":
            self.finish_anchor()
            self.anchor = (attributes.get("href") or "", attributes.get("aria-label") or attributes.get("title") or "")
            self.text = []
        elif tag == "img" and self.anchor:
            self.text.append(attributes.get("alt") or "")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"}:
            self.hidden = max(0, self.hidden - 1)
        if tag == "a":
            self.finish_anchor()

    def handle_data(self, data: str) -> None:
        if self.anchor and not self.hidden:
            self.text.append(data)

    def finish_anchor(self) -> None:
        if self.anchor:
            href, fallback = self.anchor
            url = normalize_url(href, self.base_url)
            title = clean_text(" ".join(self.text)) or clean_text(fallback)
            if url:
                if not title:
                    parts = [part for part in urlsplit(url).path.split("/") if part]
                    site_identity = google_site_identity(url)
                    title = unquote(site_identity.rsplit("/", 1)[-1]).replace("-", " ") if site_identity else urlsplit(url).hostname or (parts[-1] if parts else "Turbo project")
                if is_internal(url) or is_project_link(url, title):
                    self.links.append(Link(url, title[:100]))
        self.anchor = None
        self.text = []


def extract_links(html: str, base_url: str) -> list[Link]:
    parser = AnchorParser(base_url)
    parser.feed(html)
    parser.finish_anchor()
    seen: set[tuple[str, str]] = set()
    links = []
    for link in parser.links:
        key = (link.url, link.title)
        if key not in seen:
            seen.add(key)
            links.append(link)
    return links


def collect_projects(pages: list[tuple[str, str]]) -> list[dict]:
    projects = []
    seen = {canonical_key(SOURCE)}
    for page_url, html in pages:
        for link in extract_links(html, page_url):
            key = canonical_key(link.url)
            if not key or key in seen or is_internal(link.url) or not is_project_link(link.url, link.title):
                continue
            seen.add(key)
            parsed = urlsplit(link.url)
            is_app = (
                bool(re.search(r"app", link.title, re.I))
                or parsed.hostname in {"apps.apple.com", "play.google.com", "scratch.mit.edu"}
                or parsed.path.lower().endswith((".apk", ".aab", ".ipa", ".exe", ".dmg"))
            )
            projects.append({
                "title": link.title,
                "type": "app" if is_app else "website",
                "url": link.url,
                "description": "Part of the Turbo universe, shared on TurboHome.",
                "category": "Community",
            })
    return projects


class SiteRedirectsOnly(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        target = normalize_url(new_url, request.full_url)
        if not target or not is_internal(target):
            raise ImportFailure("TurboHome redirected outside its public site, possibly to Google sign-in. Public access is required; private content was not imported.")
        return super().redirect_request(request, response, code, message, headers, target)


def fetch_public_page(url: str) -> tuple[str, str]:
    if not is_internal(url):
        raise ImportFailure("Refusing to fetch a page outside the public TurboHome site.")
    opener = build_opener(HTTPSHandler(context=ssl.create_default_context()), SiteRedirectsOnly())
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    try:
        with opener.open(request, timeout=30) as response:
            final_url = response.geturl()
            if not is_internal(final_url):
                raise ImportFailure("Google sign-in or an off-site redirect prevents public access to TurboHome.")
            if "text/html" not in response.headers.get("Content-Type", ""):
                raise ImportFailure("TurboHome did not return a public HTML page.")
            raw = response.read(MAX_PAGE_BYTES + 1)
            if len(raw) > MAX_PAGE_BYTES:
                raise ImportFailure("TurboHome page exceeded the 4 MB safety limit.")
            charset = response.headers.get_content_charset() or "utf-8"
            html = raw.decode(charset, errors="replace")
            if re.search(r"<title[^>]*>\s*(?:Sign in|Google Accounts)", html, re.I):
                raise ImportFailure("TurboHome requires Google sign-in. Private content was not imported.")
            return final_url, html
    except HTTPError as error:
        if error.code in {401, 403, 407}:
            raise ImportFailure(
                f"TurboHome access was denied (HTTP {error.code}). Check that sites.google.com is allowed in environment settings and applied to this runtime, and that the site is publicly readable."
            ) from None
        raise ImportFailure(f"TurboHome returned HTTP {error.code}; the page could not be read.") from None
    except (URLError, TimeoutError, ssl.SSLError) as error:
        reason = error.reason if isinstance(error, URLError) else error
        if isinstance(reason, ssl.SSLCertVerificationError):
            raise ImportFailure("TLS verification failed. Restore the environment's trusted CA configuration; certificate checks were kept enabled.") from None
        raise ImportFailure("TurboHome could not be reached. Check sites.google.com access in environment settings and the inherited HTTPS proxy configuration.") from None


def crawl_site(fetch_page: Callable[[str], tuple[str, str]] | None = None, max_pages: int = 40, failures: list[str] | None = None) -> list[dict]:
    fetch_page = fetch_page or fetch_public_page
    failures = failures if failures is not None else []
    queue = deque([SOURCE])
    seen: set[str] = set()
    pages: list[tuple[str, str]] = []
    while queue and len(seen) < max_pages:
        url = queue.popleft()
        if url in seen:
            continue
        seen.add(url)
        try:
            final_url, html = fetch_page(url)
            if not is_internal(final_url):
                raise ImportFailure("TurboHome redirected to sign-in or another site; access was not imported.")
        except ImportFailure as error:
            if not pages:
                raise
            failures.append(str(error))
            continue
        pages.append((final_url, html))
        seen.add(final_url)
        for link in extract_links(html, final_url):
            if is_internal(link.url) and link.url not in seen:
                queue.append(link.url)
    if queue:
        failures.append(f"Stopped at the {max_pages}-page crawl limit; additional TurboHome pages may remain.")
    return collect_projects(pages)


def api_request(api: str, method: str = "GET", project: dict | None = None) -> dict:
    body = json.dumps(project).encode("utf-8") if project is not None else None
    request = Request(api.rstrip("/") + "/api/projects", data=body, method=method, headers={"Content-Type": "application/json", "Accept": "application/json"})
    try:
        with urlopen(request, timeout=15) as response:
            raw = response.read(MAX_API_BYTES + 1)
            if len(raw) > MAX_API_BYTES:
                raise ImportFailure("The project API response exceeded the expected size.")
            result = json.loads(raw)
            if not isinstance(result, dict):
                raise ImportFailure("The project API returned an unexpected response.")
            return result
    except HTTPError as error:
        raise ImportFailure(f"The TurboUniverse project API returned HTTP {error.code}. Check that the app is running and the project data is valid.") from None
    except (URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError):
        raise ImportFailure("The TurboUniverse API could not be read. Start the app with npm run dev, then retry the import.") from None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Discover projects without changing the TurboUniverse collection.")
    parser.add_argument("--output", type=Path, help="Write discovered project metadata as importable JSON.")
    parser.add_argument("--api", default="http://127.0.0.1:3001", help="Local TurboUniverse API base URL (default: http://127.0.0.1:3001).")
    parser.add_argument("--max-pages", type=int, default=40, help="Maximum internal public pages to read, between 1 and 40.")
    args = parser.parse_args(argv)
    if not 1 <= args.max_pages <= 40:
        parser.error("--max-pages must be between 1 and 40")
    parsed_api = urlsplit(args.api)
    if parsed_api.scheme not in {"http", "https"} or parsed_api.hostname not in {"localhost", "127.0.0.1", "::1"} or parsed_api.username or parsed_api.password or parsed_api.query or parsed_api.fragment:
        parser.error("--api must be a local HTTP(S) server URL without credentials, a query, or a fragment")
    failures: list[str] = []
    try:
        projects = crawl_site(max_pages=args.max_pages, failures=failures)
        if args.output:
            args.output.write_text(json.dumps(projects, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"Saved {len(projects)} discovered projects to {args.output}.")
        print(f"Discovered {len(projects)} unique project links on publicly readable TurboHome pages. External project sites were not fetched.")
        if args.dry_run:
            for project in projects:
                print(f"  {project['title']} — {project['url']}")
            print("Dry run: no projects were uploaded.")
        else:
            existing = api_request(args.api).get("projects")
            if not isinstance(existing, list):
                raise ImportFailure("The API response is missing the project collection.")
            keys = {canonical_key(project.get("url", "")) for project in existing}
            imported = skipped = 0
            for project in projects:
                key = canonical_key(project["url"])
                if key in keys:
                    skipped += 1
                    continue
                result = api_request(args.api, "POST", project)
                if not isinstance(result.get("project"), dict):
                    raise ImportFailure("The API did not confirm project creation. Retry the import to skip projects that were already saved.")
                keys.add(key)
                imported += 1
                print(f"Imported {project['title']}.")
            print(f"Imported {imported} projects; skipped {skipped} already in the collection.")
        for failure in failures:
            print(f"Warning: {failure}", file=sys.stderr)
        if failures:
            print("Discovery is incomplete. Resolve the warnings and retry; existing projects will be skipped.", file=sys.stderr)
            return 2
        return 0
    except (ImportFailure, OSError) as error:
        print(f"Import stopped: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
