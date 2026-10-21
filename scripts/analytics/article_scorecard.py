#!/usr/bin/env python3
"""Read-only GA4 article engagement scorecard for concretecomeback.com.

Pulls complete America/New_York days (7- and 28-day windows ending yesterday)
from GA4 property 543447613 with an analytics.readonly service account, joins
them to the published-article allowlist built from repo metadata
(scripts/analytics/article-manifest.mjs, which reuses the newsletter's
fail-closed frontmatter reader) and writes scorecard.json/.csv/.md/.html to a
private directory outside the repo.

Measurement rules this file enforces (see docs/article-scorecard.md):
  * Reach is pageviews (screenPageViews). It is additive across path aliases.
  * userEngagementDuration is a *foreground engagement proxy* (tab focused /
    visible), not active reading time.
  * totalUsers is never summed across aliases, articles, tags, authors or
    angles. A per-article user count is reported only when the article was
    seen under exactly one path row; otherwise it is UNKNOWN. Returning users
    are UNKNOWN everywhere.
  * Article tracker events (article_*) and newsletter events are UNKNOWN until
    instrumentation-rollout.json records a verified, complete rollout on or
    before the window start. Absence is never reported as zero; observed
    counts under unverified coverage are only a lower bound.
  * Newsletter events keep their existing semantics: submitted = a JS form
    submit attempt, pending = the endpoint accepted it and sent a confirmation
    email. Confirmed subscriptions per article are UNKNOWN (no
    confirmation-page join).
  * Only the production hosts (apex and www) count; local, preview and other
    hosts are excluded and reported as class totals. Internal testers who were
    never marked cannot be removed from history.
  * No custom dimensions are queried; only pagePath / eventName / hostName.

The credential file is passed to google-auth and never read, printed or
copied by this script.

Exit codes: 0 success (quiet unless --verbose), 2 usage, 3 data/API failure,
4 unsafe output path. On any failure the previous report is left untouched.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import html
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from zoneinfo import ZoneInfo

SCRIPT_VERSION = "1.0.0"
PROPERTY_ID = "543447613"
TIMEZONE = "America/New_York"
# Both production aliases. GA aggregates pagePath across them (hostName is a
# filter, never a dimension), so per-path user counts stay deduplicated.
PRODUCTION_HOSTS = ("concretecomeback.com", "www.concretecomeback.com")
LOCAL_HOST_RE = re.compile(r"^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0|.*\.local|.*\.localhost)$")
PREVIEW_HOST_RE = re.compile(r".*\.(ondigitalocean\.app|pages\.dev|vercel\.app|netlify\.app)$")
SCOPE = "https://www.googleapis.com/auth/analytics.readonly"
API_ROOT = "https://analyticsdata.googleapis.com/v1beta"
DEFAULT_CREDENTIALS = "/home/beno/.config/gm_tbrd/ga4-service-account.json"
DEFAULT_OUT = "/home/beno/clawd/reports/cc-article-scorecard/current"
REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_SCRIPT = REPO_ROOT / "scripts" / "analytics" / "article-manifest.mjs"
DEFAULT_ROLLOUT = REPO_ROOT / "scripts" / "analytics" / "instrumentation-rollout.json"
TRACKER_SOURCE = REPO_ROOT / "src" / "scripts" / "article-engagement.js"
WINDOWS = (7, 28)
PAGE_SIZE = 10000
MAX_PAGES = 50
LOW_TRAFFIC_PAGEVIEWS = 50

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
ARTICLE_PATH_RE = re.compile(r"^/blog/([a-z0-9]+(?:-[a-z0-9]+)*)/?$")
BLOG_INDEX_RE = re.compile(r"^/blog/?$")
PAGINATION_RE = re.compile(r"^/blog/[0-9]+/?$")

NEWSLETTER_EVENTS = {
    "newsletter_impressions": "newsletter_impression",
    "newsletter_submitted": "newsletter_signup_submitted",
    "newsletter_pending": "newsletter_signup_pending",
}
# Emitted by src/scripts/article-engagement.js. Their coverage is unknown until
# instrumentation-rollout.json records a verified deployment.
ARTICLE_EVENTS = {
    "active_30s": "article_active_30s",
    "active_60s": "article_active_60s",
    "active_120s": "article_active_120s",
    "meaningful_reads": "article_meaningful_read",
    "completions": "article_read_complete",
    "next_article_clicks": "article_next_click",
    "directory_clicks": "article_directory_click",
}
GROUP_METRICS = ["pageviews", "engagement_seconds_foreground_proxy", *NEWSLETTER_EVENTS, *ARTICLE_EVENTS]
COMPLETENESS = ("unknown", "partial", "complete")
UNKNOWN_ROLLOUT = {"version": None, "deployment_date": None, "completeness": "unknown"}
DEFAULT_ROLLOUTS = {"article_tracker": dict(UNKNOWN_ROLLOUT), "newsletter_events": dict(UNKNOWN_ROLLOUT)}

REQUIRED_DIMENSIONS = {"pagePath", "eventName", "hostName"}
REQUIRED_METRICS = {"screenPageViews", "userEngagementDuration", "totalUsers", "eventCount"}

EXIT_USAGE, EXIT_DATA, EXIT_OUTPUT = 2, 3, 4


class ScorecardError(Exception):
    """A failure the operator can act on. Message must never contain secrets."""

    exit_code = EXIT_DATA


class OutputPathError(ScorecardError):
    exit_code = EXIT_OUTPUT


class UsageError(ScorecardError):
    exit_code = EXIT_USAGE


# --------------------------------------------------------------------------- dates


def resolve_windows(now: dt.datetime, end_date: str | None = None) -> dict:
    """Complete New York days only: windows end yesterday (NY) at the latest."""
    if now.tzinfo is None:
        raise UsageError("now must be timezone-aware")
    yesterday = now.astimezone(ZoneInfo(TIMEZONE)).date() - dt.timedelta(days=1)
    if end_date is None:
        end = yesterday
    else:
        try:
            end = dt.date.fromisoformat(end_date)
        except ValueError as exc:
            raise UsageError(f"--end-date must be YYYY-MM-DD, got {end_date!r}") from exc
        if end > yesterday:
            raise UsageError(f"--end-date {end} is not a complete {TIMEZONE} day (latest is {yesterday})")
    return {
        f"{n}d": {"days": n, "start": (end - dt.timedelta(days=n - 1)).isoformat(), "end": end.isoformat()}
        for n in WINDOWS
    }


# --------------------------------------------------------------------------- GA4 client


def _sanitize_error(text: str) -> str:
    text = re.sub(r"-----BEGIN [A-Z ]+-----.*?-----END [A-Z ]+-----", "[redacted]", text, flags=re.S)
    text = re.sub(r"ya29\.[A-Za-z0-9._-]+", "[redacted]", text)
    return text[:500]


class GA4Client:
    def __init__(self, session, property_id: str = PROPERTY_ID, page_size: int = PAGE_SIZE):
        self.session = session
        self.property_id = property_id
        self.page_size = page_size
        self.response_meta: list[dict] = []

    def _call(self, method: str, url: str, **kwargs) -> dict:
        try:
            resp = self.session.request(method, url, timeout=60, **kwargs)
        except Exception as exc:  # network / auth refresh failures
            raise ScorecardError(f"GA4 request failed: {type(exc).__name__}: {_sanitize_error(str(exc))}") from None
        if resp.status_code != 200:
            raise ScorecardError(f"GA4 {method} {url.rsplit('/', 1)[-1]} returned HTTP {resp.status_code}: {_sanitize_error(resp.text)}")
        try:
            return resp.json()
        except ValueError:
            raise ScorecardError("GA4 returned a non-JSON response") from None

    def metadata(self) -> dict:
        return self._call("GET", f"{API_ROOT}/properties/{self.property_id}/metadata")

    def run_report(self, name: str, body: dict) -> list[dict]:
        """All rows of a report, following limit/offset pagination."""
        rows: list[dict] = []
        offset = 0
        expected = None
        for _ in range(MAX_PAGES):
            page = self._call("POST", f"{API_ROOT}/properties/{self.property_id}:runReport",
                              json={**body, "limit": self.page_size, "offset": offset})
            meta = page.get("metadata", {}) or {}
            self.response_meta.append({"report": name, **meta})
            tz = meta.get("timeZone")
            if tz != TIMEZONE:
                raise ScorecardError(f"GA4 property timezone is {tz!r}, expected {TIMEZONE}; date windows would be wrong")
            if any(s.get("samplesReadCount") for s in meta.get("samplingMetadatas", []) or []):
                raise ScorecardError(f"GA4 report {name} is sampled; refusing to publish sampled counts")
            count = int(page.get("rowCount", 0) or 0)
            if expected is None:
                expected = count
            elif count != expected:
                raise ScorecardError(f"GA4 report {name} rowCount changed during pagination ({expected} -> {count})")
            batch = page.get("rows", []) or []
            rows.extend(batch)
            offset += len(batch)
            if offset >= expected or not batch:
                break
        else:
            raise ScorecardError(f"GA4 report {name} exceeded {MAX_PAGES} pages")
        if len(rows) != expected:
            raise ScorecardError(f"GA4 report {name} returned {len(rows)} rows, rowCount said {expected}")
        return rows


def _string_filter(field: str, match: str, value: str) -> dict:
    return {"filter": {"fieldName": field, "stringFilter": {"matchType": match, "value": value, "caseSensitive": True}}}


def _host_filter() -> dict:
    return {"filter": {"fieldName": "hostName", "inListFilter": {"values": list(PRODUCTION_HOSTS), "caseSensitive": False}}}


def _host_and_blog() -> dict:
    return {"andGroup": {"expressions": [_host_filter(), _string_filter("pagePath", "BEGINS_WITH", "/blog")]}}


def classify_host(host: str) -> str:
    h = host.strip().lower()
    if h in PRODUCTION_HOSTS:
        return "production"
    if LOCAL_HOST_RE.match(h):
        return "local"
    if PREVIEW_HOST_RE.match(h):
        return "preview"
    if h in ("", "(not set)"):
        return "not_set"
    return "other"


def _date_range(window: dict) -> list[dict]:
    return [{"startDate": window["start"], "endDate": window["end"]}]


def check_metadata(meta: dict) -> dict:
    dims = {d.get("apiName") for d in meta.get("dimensions", [])}
    mets = {m.get("apiName") for m in meta.get("metrics", [])}
    missing = sorted((REQUIRED_DIMENSIONS - dims) | (REQUIRED_METRICS - mets))
    if missing:
        raise ScorecardError(f"GA4 metadata lacks required fields: {', '.join(missing)}")
    custom = sorted(d for d in dims if d and d.startswith("customEvent:"))
    return {
        "required_fields_present": True,
        "registered_custom_event_dimensions": custom,
        "custom_dimensions_queried": [],
        "note": "Scorecard uses standard pagePath/eventName/hostName only; custom parameters are not queried.",
    }


def _metric(row: dict, i: int) -> float:
    try:
        return float(row["metricValues"][i]["value"])
    except (KeyError, IndexError, TypeError, ValueError):
        raise ScorecardError("GA4 row has a missing or non-numeric metric value") from None


def _dim(row: dict, i: int) -> str:
    try:
        return str(row["dimensionValues"][i]["value"])
    except (KeyError, IndexError, TypeError):
        raise ScorecardError("GA4 row has a missing dimension value") from None


def fetch_window(client: GA4Client, window: dict, event_names: list[str]) -> dict:
    dr = _date_range(window)
    pages = client.run_report("pages", {
        "dateRanges": dr,
        "dimensions": [{"name": "pagePath"}],
        "metrics": [{"name": "screenPageViews"}, {"name": "userEngagementDuration"}, {"name": "totalUsers"}],
        "dimensionFilter": _host_and_blog(),
        "keepEmptyRows": False,
    })
    events = client.run_report("events", {
        "dateRanges": dr,
        "dimensions": [{"name": "pagePath"}, {"name": "eventName"}],
        "metrics": [{"name": "eventCount"}],
        "dimensionFilter": {"andGroup": {"expressions": [
            _host_filter(),
            {"filter": {"fieldName": "eventName", "inListFilter": {"values": event_names, "caseSensitive": True}}},
        ]}},
    })
    sitewide = client.run_report("events_sitewide", {
        "dateRanges": dr,
        "dimensions": [{"name": "eventName"}],
        "metrics": [{"name": "eventCount"}],
        "dimensionFilter": {"andGroup": {"expressions": [
            _host_filter(),
            {"filter": {"fieldName": "eventName", "inListFilter": {"values": event_names, "caseSensitive": True}}},
        ]}},
    })
    hosts = client.run_report("hosts", {
        "dateRanges": dr,
        "dimensions": [{"name": "hostName"}],
        "metrics": [{"name": "screenPageViews"}],
        "dimensionFilter": _string_filter("pagePath", "BEGINS_WITH", "/blog"),
    })
    article_users = client.run_report("article_scope_users", {
        "dateRanges": dr,
        "metrics": [{"name": "totalUsers"}],
        "dimensionFilter": {"andGroup": {"expressions": [
            _host_filter(),
            _string_filter("pagePath", "FULL_REGEXP", r"/blog/[a-z0-9]+(-[a-z0-9]+)*/?"),
            {"notExpression": _string_filter("pagePath", "FULL_REGEXP", r"/blog/[0-9]+/?")},
        ]}},
    })
    return {"pages": pages, "events": events, "sitewide": sitewide, "hosts": hosts, "article_users": article_users}


# --------------------------------------------------------------------------- aggregation


def classify_path(path: str, allow: set[str]) -> tuple[str, str | None]:
    """('article', slug) | ('blog_index'|'pagination'|'unlisted', None). Query strings never reach here."""
    path = path.split("?", 1)[0].split("#", 1)[0]
    if BLOG_INDEX_RE.match(path):
        return "blog_index", None
    if PAGINATION_RE.match(path):
        return "pagination", None
    m = ARTICLE_PATH_RE.match(path)
    if m and m.group(1) in allow:
        return "article", m.group(1)
    return "unlisted", None


def measured(value):
    return {"value": value, "status": "measured", "reason": None}


def unknown(reason: str, lower_bound=None):
    out = {"value": None, "status": "unknown", "reason": reason}
    if lower_bound is not None:
        out["observed_lower_bound"] = lower_bound
    return out


def covers(window: dict, rollout: dict) -> bool:
    """True only for a validated, complete rollout live on or before the window start."""
    dep = rollout.get("deployment_date")
    return bool(dep) and rollout.get("completeness") == "complete" and dt.date.fromisoformat(dep) <= dt.date.fromisoformat(window["start"])


def event_metric(count, covered: bool, what: str) -> dict:
    """Measured (absence = 0) only under verified coverage; otherwise a lower bound at most."""
    if covered:
        return measured(int(count or 0))
    return unknown(f"{what} rollout coverage not verified for this window; absence is not zero",
                   lower_bound=int(count) if count else None)


def aggregate_window(raw: dict, articles: list[dict], window: dict, rollouts: dict = DEFAULT_ROLLOUTS) -> dict:
    allow = {a["slug"] for a in articles}
    per = {a["slug"]: {"pageviews": 0.0, "engagement_seconds": 0.0, "user_rows": [], "events": {}} for a in articles}
    excluded = {"blog_index": 0.0, "pagination": 0.0, "unlisted": 0.0}

    for row in raw["pages"]:
        kind, slug = classify_path(_dim(row, 0), allow)
        pv, eng, users = _metric(row, 0), _metric(row, 1), _metric(row, 2)
        if kind == "article":
            per[slug]["pageviews"] += pv
            per[slug]["engagement_seconds"] += eng
            per[slug]["user_rows"].append(users)
        else:
            excluded[kind] += pv

    for row in raw["events"]:
        kind, slug = classify_path(_dim(row, 0), allow)
        if kind == "article":
            name = _dim(row, 1)
            per[slug]["events"][name] = per[slug]["events"].get(name, 0.0) + _metric(row, 0)

    sitewide = {_dim(r, 0): int(_metric(r, 0)) for r in raw["sitewide"]}
    tracker_covered = covers(window, rollouts["article_tracker"])
    newsletter_covered = covers(window, rollouts["newsletter_events"])

    out_articles = {}
    for a in articles:
        p = per[a["slug"]]
        pv = int(p["pageviews"])
        rows = p["user_rows"]
        if len(rows) == 1:
            users = measured(int(rows[0]))
        elif not rows:
            users = measured(0) if pv == 0 else unknown("no user row")
        else:
            users = unknown("article seen under multiple path aliases; totalUsers is not additive")
        metrics = {
            "pageviews": measured(pv),
            "engagement_seconds_foreground_proxy": measured(round(p["engagement_seconds"], 1)),
            "avg_engagement_seconds_per_pageview_foreground_proxy": measured(round(p["engagement_seconds"] / pv, 1)) if pv else unknown("no pageviews"),
            "users": users,
            "returning_users": unknown("not additive across aliases; not queried at article scope"),
            "newsletter_confirmed": unknown("confirmation is not attributable to an article (no confirmation-page join)"),
        }
        for key, ev in NEWSLETTER_EVENTS.items():
            metrics[key] = event_metric(p["events"].get(ev), newsletter_covered, "newsletter event")
        for key, ev in ARTICLE_EVENTS.items():
            metrics[key] = event_metric(p["events"].get(ev), tracker_covered, "article tracker")
        starts_in_window = a["pubDate"] > window["start"]
        out_articles[a["slug"]] = {
            "metrics": metrics,
            "partial_window": starts_in_window,
            "low_traffic": pv < LOW_TRAFFIC_PAGEVIEWS,
            "path_alias_rows": len(rows),
        }

    included = {h: 0 for h in PRODUCTION_HOSTS}
    excluded_by_class = {"local": 0, "preview": 0, "not_set": 0, "other": 0}
    excluded_hosts = set()
    for r in raw["hosts"]:
        host, pv = _dim(r, 0), int(_metric(r, 0))
        kind = classify_host(host)
        if kind == "production":
            included[host.strip().lower()] += pv
        else:
            excluded_by_class[kind] += pv
            excluded_hosts.add(host.strip().lower())
    article_users = raw["article_users"]
    site_users = int(_metric(article_users[0], 0)) if article_users else 0

    return {
        "articles": out_articles,
        "excluded_pageviews": {k: int(v) for k, v in excluded.items()},
        "hostname": {
            "included_hosts": list(PRODUCTION_HOSTS),
            "included_blog_pageviews_by_host": included,
            "included_blog_pageviews": sum(included.values()),
            "excluded_blog_pageviews": sum(excluded_by_class.values()),
            "excluded_blog_pageviews_by_class": excluded_by_class,
            "excluded_distinct_hosts": len(excluded_hosts),
            "note": "Production aliases are filtered in GA4 (pagePath aggregated across them before user counts). "
                    "Local, preview and other hosts are excluded and reported only as class totals.",
        },
        "site_article_scope_users": {
            **measured(site_users),
            "note": "Deduplicated by GA4 across all /blog/<slug> paths on the production hosts, including slugs not in the allowlist.",
        },
        "observed_sitewide_event_counts": {
            "values": {ev: sitewide.get(ev, 0) for ev in sorted({*NEWSLETTER_EVENTS.values(), *ARTICLE_EVENTS.values()})},
            "note": "Observed on production hosts only; not proof of full-window coverage.",
        },
        "coverage": {"article_tracker": tracker_covered, "newsletter_events": newsletter_covered},
    }


def build_groups(articles: list[dict], window_result: dict, angles: dict[str, str]) -> dict:
    """Author / tag / angle rollups. Only additive metrics are summed."""
    def roll(members: list[str]) -> dict:
        out = {"article_count": len(members), "users": unknown("totalUsers is not additive across articles")}
        for key in GROUP_METRICS:
            cells = [window_result["articles"][s]["metrics"][key] for s in members]
            if all(c["status"] == "measured" for c in cells):
                total = sum(c["value"] for c in cells)
                out[key] = measured(round(total, 1) if key.startswith("engagement") else int(total))
            else:
                bound = sum(c["value"] if c["status"] == "measured" else c.get("observed_lower_bound", 0) for c in cells)
                out[key] = unknown("at least one member is unknown", lower_bound=int(bound) if bound else None)
        out["low_traffic"] = out["pageviews"]["status"] == "measured" and out["pageviews"]["value"] < LOW_TRAFFIC_PAGEVIEWS
        return out

    by_author: dict[str, list[str]] = {}
    by_tag: dict[str, list[str]] = {}
    by_angle: dict[str, list[str]] = {}
    for a in articles:
        by_author.setdefault(a["author"], []).append(a["slug"])
        for t in a["tags"]:
            by_tag.setdefault(t, []).append(a["slug"])
        by_angle.setdefault(angles.get(a["slug"], "unclassified"), []).append(a["slug"])
    return {
        "author": {"additive": True, "groups": {k: roll(v) for k, v in sorted(by_author.items())}},
        "topic_tag": {
            "additive": False,
            "note": "Articles carry several tags; tag rows overlap and must not be summed.",
            "groups": {k: roll(v) for k, v in sorted(by_tag.items())},
        },
        "editorial_angle": {
            "additive": True,
            "curated": bool(angles),
            "note": "Angles come only from a curated file; everything else is 'unclassified'.",
            "groups": {k: roll(v) for k, v in sorted(by_angle.items())},
        },
    }


def data_quality(response_meta: list[dict]) -> dict:
    loss = sorted({m["report"] for m in response_meta if m.get("dataLossFromOtherRow")})
    thresh = sorted({m["report"] for m in response_meta if m.get("subjectToThresholding")})
    return {
        "timezone": TIMEZONE,
        "timezone_verified": all(m.get("timeZone") == TIMEZONE for m in response_meta),
        "data_loss_from_other_row_reports": loss,
        "thresholded_reports": thresh,
        "complete": not loss and not thresh,
        "internal_traffic": "Production hostname only. Historical internal/tester traffic that was never marked cannot be removed.",
    }


# --------------------------------------------------------------------------- manifest


def load_manifest(as_of: str, manifest_path: str | None = None) -> list[dict]:
    if manifest_path:
        data = json.loads(Path(manifest_path).read_text())
    else:
        try:
            proc = subprocess.run(["node", str(MANIFEST_SCRIPT), "--as-of", as_of],
                                  capture_output=True, text=True, timeout=60, check=False)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ScorecardError(f"could not run article manifest: {exc}") from None
        if proc.returncode != 0:
            raise ScorecardError(f"article manifest failed: {proc.stderr.strip()[:500]}")
        data = json.loads(proc.stdout)
    articles = data.get("articles")
    if not isinstance(articles, list) or not articles:
        raise ScorecardError("article manifest is empty")
    for a in articles:
        if not SLUG_RE.match(str(a.get("slug", ""))):
            raise ScorecardError(f"article manifest has an unsafe slug {a.get('slug')!r}")
        if not isinstance(a.get("tags"), list) or not isinstance(a.get("author"), str) or not isinstance(a.get("pubDate"), str):
            raise ScorecardError(f"article manifest entry {a['slug']} is malformed")
    return articles


def load_angles(path: str | None, allow: set[str]) -> dict[str, str]:
    if not path:
        return {}
    data = json.loads(Path(path).read_text())
    if not isinstance(data, dict):
        raise UsageError("--angles must be a JSON object of slug -> angle")
    unknown_slugs = sorted(set(data) - allow)
    if unknown_slugs:
        raise UsageError(f"--angles names unpublished slugs: {', '.join(unknown_slugs[:5])}")
    return {k: str(v) for k, v in data.items() if v}


def tracker_source_version(source: Path = TRACKER_SOURCE) -> str | None:
    try:
        m = re.search(r"export const TRACKER_VERSION = '([^']+)'", source.read_text())
    except OSError:
        return None
    return m.group(1) if m else None


def load_rollouts(path: str | Path, end_date: str, tracker_version: str | None = None) -> dict:
    """Validate instrumentation-rollout.json. Any doubt fails the run (exit 2)."""
    try:
        data = json.loads(Path(path).read_text())
    except (OSError, ValueError) as exc:
        raise UsageError(f"rollout config {path} is unreadable: {type(exc).__name__}") from None
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        raise UsageError("rollout config must be an object with schema_version 1")
    extra = sorted(set(data) - {"schema_version", "article_tracker", "newsletter_events", "_comment"})
    if extra:
        raise UsageError(f"rollout config has unknown keys: {', '.join(extra)}")
    out = {}
    for name in ("article_tracker", "newsletter_events"):
        entry = data.get(name)
        if not isinstance(entry, dict):
            raise UsageError(f"rollout config lacks {name}")
        bad = sorted(set(entry) - {"version", "deployment_date", "completeness", "evidence"})
        if bad:
            raise UsageError(f"rollout {name} has unknown keys: {', '.join(bad)}")
        version, date, completeness = entry.get("version"), entry.get("deployment_date"), entry.get("completeness")
        if completeness not in COMPLETENESS:
            raise UsageError(f"rollout {name}.completeness must be one of {', '.join(COMPLETENESS)}")
        if version is not None and (not isinstance(version, str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,32}", version)):
            raise UsageError(f"rollout {name}.version must be a short string or null")
        if date is not None:
            try:
                parsed = dt.date.fromisoformat(date) if isinstance(date, str) and len(date) == 10 else None
            except ValueError:
                parsed = None
            if parsed is None:
                raise UsageError(f"rollout {name}.deployment_date must be YYYY-MM-DD or null")
            if parsed > dt.date.fromisoformat(end_date):
                raise UsageError(f"rollout {name}.deployment_date {date} is after the report end date {end_date}")
        if completeness == "complete":
            if not version or not date:
                raise UsageError(f"rollout {name} is 'complete' but lacks version or deployment_date")
            if not isinstance(entry.get("evidence"), str) or not entry["evidence"].strip():
                raise UsageError(f"rollout {name} is 'complete' but lacks evidence (how it was verified live)")
            if name == "article_tracker" and tracker_version and version != tracker_version:
                raise UsageError(f"rollout article_tracker.version {version} does not match TRACKER_VERSION {tracker_version}")
        out[name] = {"version": version, "deployment_date": date, "completeness": completeness,
                     "readiness": "ready" if completeness == "complete" else "unknown",
                     "evidence": entry.get("evidence")}
    return out


# --------------------------------------------------------------------------- output


def validate_out_dir(out: str) -> Path:
    path = Path(out).expanduser().resolve()
    parts = {p.lower() for p in path.parts}
    if parts & {"public", "dist", "www", "htdocs"}:
        raise OutputPathError(f"refusing to write the private scorecard under a public/dist path: {path}")
    if path == REPO_ROOT or REPO_ROOT in path.parents:
        raise OutputPathError(f"refusing to write the private scorecard inside the site repo: {path}")
    return path


def _cell(c: dict) -> str:
    return "UNKNOWN" if c["status"] != "measured" else str(c["value"])


CSV_METRICS = ["pageviews", "engagement_seconds_foreground_proxy", "avg_engagement_seconds_per_pageview_foreground_proxy",
               "users", "newsletter_impressions", "newsletter_submitted", "newsletter_pending", "newsletter_confirmed",
               *ARTICLE_EVENTS]


def render_csv(report: dict) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["window", "start", "end", "slug", "author", "pub_date", "partial_window", "low_traffic", *CSV_METRICS])
    meta = {a["slug"]: a for a in report["articles"]}
    for wname, win in report["windows"].items():
        for slug, row in win["articles"].items():
            w.writerow([wname, win["start"], win["end"], slug, meta[slug]["author"], meta[slug]["pubDate"],
                        row["partial_window"], row["low_traffic"], *(_cell(row["metrics"][m]) for m in CSV_METRICS)])
    return buf.getvalue()


def _sorted_slugs(win: dict) -> list[str]:
    # Alphabetical on purpose: low-traffic counts are not a ranking.
    return sorted(win["articles"])


CAVEATS = [
    "Reach = pageviews. Engagement seconds are a foreground engagement proxy (tab visible), not active reading.",
    "Active reading time is measured only by the article tracker (article_active_30s/60s/120s, meaningful read, completion); "
    "UNKNOWN until its rollout is verified for the whole window.",
    "Users are never summed across aliases or groups. UNKNOWN means not measurable — it is not zero; "
    "'≥n' is an observed lower bound under incomplete coverage.",
    "Newsletter confirmations are not attributable to articles. Newsletter counts include every placement on the page.",
    f"Rows are alphabetical, not ranked; ⚠ marks low traffic (< {LOW_TRAFFIC_PAGEVIEWS} pageviews) where differences are noise.",
    "Only production hosts (concretecomeback.com, www.concretecomeback.com) count. Historical internal/tester traffic "
    "that was never marked cannot be removed.",
]
# (column label, metric key) — articles and groups share the reading/navigation columns.
ARTICLE_COLUMNS = [("Pageviews", "pageviews"), ("Fg engagement s", "engagement_seconds_foreground_proxy"), ("Users", "users"),
                   ("Active 30s", "active_30s"), ("Active 60s", "active_60s"), ("Active 120s", "active_120s"),
                   ("Meaningful", "meaningful_reads"), ("Completions", "completions"),
                   ("Next-article clicks", "next_article_clicks"), ("Directory clicks", "directory_clicks"),
                   ("NL submitted", "newsletter_submitted"), ("NL pending", "newsletter_pending"),
                   ("NL confirmed", "newsletter_confirmed")]
GROUP_COLUMNS = [c for c in ARTICLE_COLUMNS if c[1] in GROUP_METRICS]


def _show(c: dict) -> str:
    if c["status"] == "measured":
        return str(c["value"])
    return f"UNKNOWN (≥{c['observed_lower_bound']})" if c.get("observed_lower_bound") else "UNKNOWN"


def _context_lines(report: dict, win: dict) -> list[str]:
    dq, host = report["data_quality"], win["hostname"]
    roll = report["rollouts"]
    return [
        f"Data complete: {dq['complete']} · timezone verified: {dq['timezone_verified']} · "
        f"data-loss reports: {', '.join(dq['data_loss_from_other_row_reports']) or 'none'} · "
        f"thresholded: {', '.join(dq['thresholded_reports']) or 'none'}",
        *(f"Rollout {n}: version {r['version']}, deployed {r['deployment_date']}, completeness {r['completeness']}, "
          f"covers this window: {win['coverage'][n]}" for n, r in roll.items()),
        f"Included hosts: {', '.join(f'{h} {v}' for h, v in host['included_blog_pageviews_by_host'].items())} /blog pageviews · "
        f"excluded: {host['excluded_blog_pageviews']} ({', '.join(f'{k} {v}' for k, v in host['excluded_blog_pageviews_by_class'].items())}; "
        f"{host['excluded_distinct_hosts']} hosts)",
        f"Excluded blog paths: {', '.join(f'{k} {v}' for k, v in win['excluded_pageviews'].items())} pageviews · "
        f"article-scope users (GA4-deduplicated superset): {win['site_article_scope_users']['value']}",
    ]


def render_md(report: dict) -> str:
    lines = ["# Article engagement scorecard", "",
             f"Generated {report['generated_at']} · property {report['property_id']} · timezone {TIMEZONE}", "",
             *(f"> {c}" for c in CAVEATS), ""]
    for wname, win in report["windows"].items():
        lines += [f"## {wname} ({win['start']} → {win['end']})", "", *(f"- {x}" for x in _context_lines(report, win)), "",
                  "| Article | " + " | ".join(label for label, _ in ARTICLE_COLUMNS) + " | Notes |",
                  "|---|" + "---:|" * len(ARTICLE_COLUMNS) + "---|"]
        for slug in _sorted_slugs(win):
            r = win["articles"][slug]
            notes = " ".join(x for x in ["⚠ low traffic" if r["low_traffic"] else "", "partial window" if r["partial_window"] else ""] if x)
            lines.append(f"| {slug} | " + " | ".join(_show(r["metrics"][k]) for _, k in ARTICLE_COLUMNS) + f" | {notes} |")
        lines.append("")
        for gname, grp in win["groups"].items():
            lines += [f"### By {gname.replace('_', ' ')}" + ("" if grp["additive"] else " (overlapping — do not sum)"), "",
                      "| Group | Articles | " + " | ".join(label for label, _ in GROUP_COLUMNS) + " |",
                      "|---|---:|" + "---:|" * len(GROUP_COLUMNS)]
            for name, g in grp["groups"].items():
                lines.append(f"| {name}{' ⚠' if g['low_traffic'] else ''} | {g['article_count']} | "
                             + " | ".join(_show(g[k]) for _, k in GROUP_COLUMNS) + " |")
            lines.append("")
    return "\n".join(lines) + "\n"


def render_html(report: dict) -> str:
    e = html.escape
    parts = ["<!doctype html><html lang=en><meta charset=utf-8><meta name=robots content=noindex>",
             "<title>Article engagement scorecard</title>",
             "<style>body{font:14px system-ui;margin:2rem;color:#222}table{border-collapse:collapse;margin:1rem 0}"
             "td,th{border:1px solid #ccc;padding:4px 8px}td.n{text-align:right}.u{color:#888}.lt{background:#fff7e0}</style>",
             f"<h1>Article engagement scorecard</h1><p>Generated {e(report['generated_at'])} · property {e(report['property_id'])} · {TIMEZONE}</p>",
             "<ul class=caveats>" + "".join(f"<li>{e(c)}</li>" for c in CAVEATS) + "</ul>"]

    def td(c: dict) -> str:
        return f"<td class=\"n{' u' if c['status'] != 'measured' else ''}\">{e(_show(c))}</td>"

    for wname, win in report["windows"].items():
        parts.append(f"<h2>{e(wname)} ({e(win['start'])} → {e(win['end'])})</h2>")
        parts.append("<ul>" + "".join(f"<li>{e(x)}</li>" for x in _context_lines(report, win)) + "</ul>")
        parts.append("<table><tr><th>Article</th>" + "".join(f"<th>{e(label)}</th>" for label, _ in ARTICLE_COLUMNS) + "<th>Notes</th></tr>")
        for slug in _sorted_slugs(win):
            r = win["articles"][slug]
            notes = " ".join(x for x in ["low traffic" if r["low_traffic"] else "", "partial window" if r["partial_window"] else ""] if x)
            cls = " class=lt" if r["low_traffic"] else ""
            parts.append(f"<tr{cls}><td>{e(slug)}</td>" + "".join(td(r["metrics"][k]) for _, k in ARTICLE_COLUMNS) + f"<td>{e(notes)}</td></tr>")
        parts.append("</table>")
        for gname, grp in win["groups"].items():
            title = f"By {gname.replace('_', ' ')}" + ("" if grp["additive"] else " (overlapping — do not sum)")
            parts.append(f"<h3>{e(title)}</h3>" + (f"<p>{e(grp['note'])}</p>" if grp.get("note") else ""))
            parts.append("<table><tr><th>Group</th><th>Articles</th>" + "".join(f"<th>{e(label)}</th>" for label, _ in GROUP_COLUMNS) + "</tr>")
            for name, g in grp["groups"].items():
                cls = " class=lt" if g["low_traffic"] else ""
                parts.append(f"<tr{cls}><td>{e(name)}</td><td class=n>{g['article_count']}</td>" + "".join(td(g[k]) for _, k in GROUP_COLUMNS) + "</tr>")
            parts.append("</table>")
    parts.append("</html>")
    return "\n".join(parts)


def write_outputs(report: dict, out_dir: Path) -> None:
    """Build all files in a sibling temp dir, then swap it in; a failure leaves the prior report."""
    out_dir.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix=f".{out_dir.name}.tmp-", dir=out_dir.parent))
    try:
        os.chmod(tmp, 0o700)
        (tmp / "scorecard.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
        (tmp / "scorecard.csv").write_text(render_csv(report))
        (tmp / "scorecard.md").write_text(render_md(report))
        (tmp / "scorecard.html").write_text(render_html(report))
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    swap_in(tmp, out_dir)


def swap_in(tmp: Path, out_dir: Path) -> None:
    """current -> previous, tmp -> current. Any failure puts current and previous back."""
    prev = out_dir.parent / f"{out_dir.name}.previous"
    stash = out_dir.parent / f".{out_dir.name}.previous.rollback-{tmp.name}"
    moved_prev = moved_current = False
    try:
        if prev.exists():
            os.replace(prev, stash)
            moved_prev = True
        if out_dir.exists():
            os.replace(out_dir, prev)
            moved_current = True
        os.replace(tmp, out_dir)
    except BaseException:
        try:
            if moved_current and not out_dir.exists():
                os.replace(prev, out_dir)
            if moved_prev and not prev.exists():
                os.replace(stash, prev)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        raise
    if moved_prev:
        shutil.rmtree(stash, ignore_errors=True)


# --------------------------------------------------------------------------- orchestration


def build_report(client: GA4Client, articles: list[dict], windows: dict, angles: dict[str, str],
                 now: dt.datetime, rollouts: dict = DEFAULT_ROLLOUTS) -> dict:
    meta_check = check_metadata(client.metadata())
    event_names = sorted({*NEWSLETTER_EVENTS.values(), *ARTICLE_EVENTS.values()})
    out_windows = {}
    for wname, win in windows.items():
        result = aggregate_window(fetch_window(client, win, event_names), articles, win, rollouts)
        result["groups"] = build_groups(articles, result, angles)
        out_windows[wname] = {**win, **result}
    return {
        "schema_version": 1,
        "script_version": SCRIPT_VERSION,
        "generated_at": now.astimezone(ZoneInfo(TIMEZONE)).isoformat(timespec="seconds"),
        "property_id": client.property_id,
        "metadata": meta_check,
        "data_quality": data_quality(client.response_meta),
        "rollouts": {k: {"readiness": "ready" if v.get("completeness") == "complete" else "unknown", **v} for k, v in rollouts.items()},
        "caveats": CAVEATS,
        "articles": [{k: a[k] for k in ("slug", "title", "author", "tags", "pubDate")} | {"editorial_angle": angles.get(a["slug"])}
                     for a in articles],
        "windows": out_windows,
        "definitions": METRIC_DEFINITIONS,
    }


METRIC_DEFINITIONS = {
    "pageviews": "GA4 screenPageViews on /blog/<slug> (with or without trailing slash) on concretecomeback.com or www.concretecomeback.com. Reach.",
    "engagement_seconds_foreground_proxy": "GA4 userEngagementDuration: seconds the page was in the foreground. Not active reading.",
    "avg_engagement_seconds_per_pageview_foreground_proxy": "engagement_seconds_foreground_proxy / pageviews.",
    "users": "GA4 totalUsers for the article, only when it appears under a single path row; never summed.",
    "returning_users": "UNKNOWN: not additive and not queried at article scope.",
    "newsletter_impressions": "newsletter_impression events on the article page (any placement, incl. popup). UNKNOWN (≥ observed) until newsletter_events rollout coverage is verified.",
    "newsletter_submitted": "newsletter_signup_submitted: a JS form submit attempt on the page (any placement). Not people; no-JS submits are invisible. Coverage rule as above.",
    "newsletter_pending": "newsletter_signup_pending: endpoint accepted and sent a confirmation email. Not a subscription. Coverage rule as above.",
    "newsletter_confirmed": "UNKNOWN per article: confirmation happens on another page with no article join.",
    "active_30s": "article_active_30s: page views reaching 30 s of active reading (tab visible, article body on screen, interaction within 30 s). UNKNOWN until rollout documented.",
    "active_60s": "article_active_60s: as active_30s at 60 s.",
    "active_120s": "article_active_120s: as active_30s at 120 s.",
    "meaningful_reads": "article_meaningful_read: active-reading threshold (scaled to length) plus body progress. UNKNOWN until rollout documented.",
    "completions": "article_read_complete: reached body end with minimum active time. UNKNOWN until rollout documented.",
    "next_article_clicks": "article_next_click: click to another allowlisted article. UNKNOWN until rollout documented.",
    "directory_clicks": "article_directory_click: click into /directory. UNKNOWN until rollout documented.",
    "low_traffic": f"pageviews < {LOW_TRAFFIC_PAGEVIEWS} in the window; treat comparisons as noise.",
    "partial_window": "Article was published after the window start, so it had fewer days to accrue traffic.",
}


def make_session(credentials_path: str):
    try:
        from google.auth.transport.requests import AuthorizedSession
        from google.oauth2 import service_account
    except ImportError:
        raise ScorecardError("google-auth is not installed (pip install google-auth requests)") from None
    if not Path(credentials_path).is_file():
        raise ScorecardError(f"credential file not found at {credentials_path}")
    try:
        creds = service_account.Credentials.from_service_account_file(credentials_path, scopes=[SCOPE])
    except Exception as exc:
        raise ScorecardError(f"could not load service-account credentials ({type(exc).__name__})") from None
    return AuthorizedSession(creds)


def parse_args(argv):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--credentials", default=DEFAULT_CREDENTIALS, help="service-account JSON path (never printed)")
    p.add_argument("--out", default=DEFAULT_OUT, help="private output directory (not public/dist, not in repo)")
    p.add_argument("--end-date", help="last complete New York day to include (default: yesterday)")
    p.add_argument("--angles", help="curated JSON {slug: editorial_angle}; default: all unclassified")
    p.add_argument("--manifest", help="pre-built article manifest JSON (default: run article-manifest.mjs)")
    p.add_argument("--rollout", default=str(DEFAULT_ROLLOUT), help="instrumentation rollout JSON (validated)")
    p.add_argument("--verbose", action="store_true", help="print a summary on success")
    return p.parse_args(argv)


def main(argv=None, now=None, session_factory=make_session) -> int:
    try:
        args = parse_args(argv)
        out_dir = validate_out_dir(args.out)
        now = now or dt.datetime.now(dt.timezone.utc)
        windows = resolve_windows(now, args.end_date)
        as_of = windows["7d"]["end"]
        articles = load_manifest(as_of, args.manifest)
        angles = load_angles(args.angles, {a["slug"] for a in articles})
        rollouts = load_rollouts(args.rollout, as_of, tracker_source_version())
        client = GA4Client(session_factory(args.credentials))
        report = build_report(client, articles, windows, angles, now, rollouts)
        write_outputs(report, out_dir)
    except ScorecardError as exc:
        print(f"article-scorecard: {exc}", file=sys.stderr)
        return exc.exit_code
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"article-scorecard: {type(exc).__name__}: {_sanitize_error(str(exc))}", file=sys.stderr)
        return EXIT_DATA
    if args.verbose:
        spans = ", ".join("%s %s..%s" % (k, v["start"], v["end"]) for k, v in windows.items())
        print(f"article-scorecard: wrote {out_dir} ({len(articles)} articles, {spans}, complete={report['data_quality']['complete']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
