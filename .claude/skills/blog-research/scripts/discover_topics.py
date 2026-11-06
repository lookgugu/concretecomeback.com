#!/usr/bin/env python3
"""Read-only blog topic discovery tool for concretecomeback.com.

Combines four evidence sources to surface new blog topics and content refreshes:
  1. On-site reader interest (GA4 article scorecard + top directory pages)
  2. Google Search Console (90d & 28d queries, pages, and query-page pairs)
  3. Google Trends & Google Search Autocomplete (seasonal + evergreen queries)
  4. Local blog corpus audit (duplicate/cannibalization check matching
     scripts/check-duplicate-posts.mjs, plus author and tag balance)

Privacy & safety rules:
  * Read-only API scopes only (analytics.readonly, webmasters.readonly).
  * Credentials are passed to google-auth and never read, printed, or copied.
  * Report files (--out) are written outside the repository (default:
    /home/beno/clawd/reports/cc-blog-research/current) so raw GSC query exports
    are never committed to git.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

import requests
from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

SITE_URL = "https://concretecomeback.com/"
GA4_PROPERTY_ID = "543447613"
DEFAULT_CREDENTIALS = "/home/beno/.config/gm_tbrd/ga4-service-account.json"
DEFAULT_SCORECARD = "/home/beno/clawd/reports/cc-article-scorecard/current/scorecard.json"
DEFAULT_OUT = "/home/beno/clawd/reports/cc-blog-research/current"


def _find_repo_root() -> Path:
    here = Path(__file__).resolve()
    for p in here.parents:
        if (p / "src" / "content" / "blog").is_dir():
            return p
    cwd = Path.cwd().resolve()
    if (cwd / "src" / "content" / "blog").is_dir():
        return cwd
    return here.parents[4]


REPO_ROOT = _find_repo_root()
BLOG_DIR = REPO_ROOT / "src" / "content" / "blog"

# Exact noise words from scripts/check-duplicate-posts.mjs so overlap scores match CI
NOISE_WORDS = {
    "how", "to", "the", "a", "an", "for", "of", "on", "at", "in", "and", "or", "is",
    "it", "its", "your", "you", "what", "why", "that", "this", "with", "without",
    "after", "before", "when", "can", "do", "does", "should", "need", "needs",
    "best", "guide", "real", "still", "first", "every", "my", "me", "we", "us",
    "adult", "adults", "skater", "skaters", "skate", "skating", "skateboard",
    "skateboarding", "skatepark", "over", "under", "plan", "tips",
    "20", "30", "40", "45", "50", "2025", "2026", "2027",
}

# Irrelevant terms in autocomplete (toys, cross-country skiing, video games, etc.)
AUTOCOMPLETE_EXCLUDE_RE = re.compile(
    r"\b(magnatiles|magna tiles|magnetic tiles|tech deck|fingerboard|skate skiing|ice skating|roller skate|inline skate|skate 3|skate 4|tony hawk pro skater|winter olympics)\b",
    re.I,
)

SEASONAL_SEEDS = {
    "winter": [
        "skateboard in winter",
        "indoor skatepark beginner",
        "skateboard balance board training",
        "skateboarding in cold weather",
        "skateboard bearings wet weather",
        "garage mini ramp",
        "skateboarding ankle stiffness",
        "skateboarding knee pain cold",
        "carpet boarding skateboard",
    ],
    "spring": [
        "getting back into skateboarding",
        "skateboard setup for older beginners",
        "skateboarding after 40",
        "skateboarding conditioning",
        "how to start skateboarding again",
        "cruiser vs popsicle skateboard",
    ],
    "summer": [
        "morning skatepark session",
        "skateboarding heat hydration",
        "outdoor concrete skatepark beginner",
        "bowl skating tips beginner",
        "pump track skateboard setup",
    ],
    "autumn": [
        "skateboarding wet ground",
        "outdoor skatepark autumn leaves",
        "skateboard wheels rough pavement",
        "padded shorts skateboarding",
        "wrist guards skateboarding",
    ],
}

EVERGREEN_SEEDS = [
    "skateboarding over 40",
    "skateboarding at 50",
    "returning to skateboarding",
    "older skater",
    "skateboard for heavy riders",
    "skateboard wheels for rough roads",
    "skateboard trucks for carving",
    "skateboarding lower back pain",
    "skateboarding hip pain",
    "skateboarding plantar fasciitis",
    "skateboarding shin splints",
    "skateboarding sciatica",
    "how to pump a transition skateboard",
    "how to kickturn on a ramp",
    "skatepark etiquette beginner",
    "skateboard bushing hardness weight",
    "skateboard riser pads wheel bite",
]


def tokenize(text: str) -> set[str]:
    words = re.sub(r"[^a-z0-9\s-]", " ", text.lower()).split()
    out: set[str] = set()
    for w in words:
        for part in w.split("-"):
            if part and part not in NOISE_WORDS:
                out.add(part)
    return out


def jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def load_corpus(blog_dir: Path) -> list[dict]:
    posts = []
    if not blog_dir.exists():
        return posts
    for path in sorted(blog_dir.glob("*.md")):
        raw = path.read_text(encoding="utf-8")
        slug = path.stem
        title_m = re.search(r'^title:\s*["\']?(.+?)["\']?\s*$', raw, re.M)
        author_m = re.search(r'^author:\s*["\']?(.+?)["\']?\s*$', raw, re.M)
        pub_m = re.search(r'^pubDate:\s*["\']?(\d{4}-\d{2}-\d{2})', raw, re.M)
        tags_m = re.search(r'^tags:\s*\[(.*?)\]', raw, re.M)
        title = title_m.group(1) if title_m else slug
        author = author_m.group(1) if author_m else "Unknown"
        pub_date = pub_m.group(1) if pub_m else ""
        tags = []
        if tags_m:
            tags = [t.strip().strip("\"'") for t in tags_m.group(1).split(",") if t.strip()]
        posts.append({
            "slug": slug,
            "title": title,
            "author": author,
            "pubDate": pub_date,
            "tags": tags,
            "slug_tokens": tokenize(slug),
            "title_tokens": tokenize(title),
            "tag_tokens": tokenize(" ".join(tags)),
            "raw_body": raw,
        })
    return posts


def suggest_cross_links(candidate_text: str, corpus: list[dict], limit: int = 6, exclude_slug: str | None = None) -> list[dict]:
    cand_tokens = tokenize(candidate_text)
    scored = []
    for post in corpus:
        if exclude_slug and post["slug"] == exclude_slug:
            continue
        if post["slug_tokens"] == cand_tokens:
            continue
        st = jaccard(cand_tokens, post["slug_tokens"])
        tt = jaccard(cand_tokens, post["title_tokens"])
        gt = jaccard(cand_tokens, post.get("tag_tokens", set()))
        combined = max(st, tt) + (0.35 * gt)
        if combined > 0:
            scored.append((combined, post))
    scored.sort(key=lambda x: (x[0], x[1]["pubDate"]), reverse=True)
    results = []
    for score, post in scored[:limit]:
        slug = post["slug"]
        title = post["title"]
        results.append({
            "slug": slug,
            "url": f"/blog/{slug}/",
            "title": title,
            "author": post["author"],
            "tags": post["tags"],
            "relevance_score": round(score, 2),
            "markdown": f"[{title}](/blog/{slug}/)",
        })
    return results


def verify_post_cross_links(file_paths: list[str], corpus: list[dict], min_blog_links: int = 2) -> tuple[bool, dict]:
    blog_slugs = {p["slug"] for p in corpus}
    report = {}
    all_ok = True
    for fp in file_paths:
        path = Path(fp)
        if not path.is_absolute():
            path = (REPO_ROOT / path).resolve()
        if not path.exists():
            all_ok = False
            report[fp] = {"ok": False, "error": "File does not exist"}
            continue
        raw = path.read_text(encoding="utf-8")
        self_slug = path.stem
        blog_links: list[str] = []
        dir_links: list[str] = []
        broken_links: list[dict] = []
        for m in re.finditer(r"\]\((/[^)#\s]+)", raw):
            url = m.group(1)
            if url.startswith("/blog/"):
                parts = url.strip("/").split("/")
                if len(parts) >= 2 and not parts[1].isdigit():
                    target_slug = parts[1]
                    if target_slug == self_slug:
                        continue
                    if target_slug in blog_slugs:
                        if target_slug not in blog_links:
                            blog_links.append(target_slug)
                    else:
                        suggestions = [s["url"] for s in suggest_cross_links(target_slug, corpus, limit=3)]
                        broken_links.append({"url": url, "type": "blog", "closest_valid": suggestions})
            elif url.startswith("/directory/"):
                parts = url.strip("/").split("/")
                if len(parts) >= 4:
                    col, country, dslug = parts[1], parts[2], parts[3]
                    md_target = REPO_ROOT / "src" / "content" / col / country / f"{dslug}.md"
                    if md_target.exists():
                        if url not in dir_links:
                            dir_links.append(url)
                    else:
                        broken_links.append({"url": url, "type": "directory"})
                else:
                    if url not in dir_links:
                        dir_links.append(url)
        has_enough = len(blog_links) >= min_blog_links
        post_ok = (len(broken_links) == 0) and has_enough
        if not post_ok:
            all_ok = False
        title_m = re.search(r'^title:\s*["\']?(.+?)["\']?\s*$', raw, re.M)
        tags_m = re.search(r'^tags:\s*\[(.*?)\]', raw, re.M)
        search_seed = f"{self_slug} {title_m.group(1) if title_m else ''} {tags_m.group(1) if tags_m else ''}"
        suggested = [
            s for s in suggest_cross_links(search_seed, corpus, limit=6, exclude_slug=self_slug)
            if s["slug"] not in blog_links
        ]
        inbound_backlinks = [
            p["slug"] for p in corpus
            if p["slug"] != self_slug and f"/blog/{self_slug}" in p.get("raw_body", "")
        ]
        report[str(path.relative_to(REPO_ROOT))] = {
            "ok": post_ok,
            "verified_blog_cross_links": [f"/blog/{s}/" for s in blog_links],
            "blog_cross_link_count": len(blog_links),
            "min_blog_links_required": min_blog_links,
            "verified_directory_links": dir_links,
            "broken_internal_links": broken_links,
            "inbound_blog_backlinks": [f"/blog/{s}/" for s in inbound_backlinks],
            "suggested_blog_cross_links_to_add_or_backlink": suggested[:5],
        }
    return all_ok, report


def check_overlap(candidate_text: str, corpus: list[dict]) -> dict:
    cand_tokens = tokenize(candidate_text)
    best_match = None
    best_score = 0.0
    overlaps = []
    for post in corpus:
        st = jaccard(cand_tokens, post["slug_tokens"])
        tt = jaccard(cand_tokens, post["title_tokens"])
        score = max(st, tt)
        if score > best_score:
            best_score = score
            best_match = post["slug"]
        if score >= 0.34:
            overlaps.append({"slug": post["slug"], "title": post["title"], "score": round(score, 2)})
    overlaps.sort(key=lambda x: x["score"], reverse=True)
    status = "new_topic"
    if best_score >= 0.50:
        status = "duplicate_covered"
    elif best_score >= 0.34:
        status = "overlap_warning"
    return {
        "status": status,
        "max_similarity": round(best_score, 2),
        "closest_slug": best_match,
        "overlapping_posts": overlaps[:5],
        "suggested_cross_links": suggest_cross_links(candidate_text, corpus, limit=6),
    }


def _metric_val(cell: dict | None, default: float = 0.0) -> float:
    if not isinstance(cell, dict):
        return default
    v = cell.get("value")
    return float(v) if v is not None else default


def load_on_site_interest(scorecard_path: Path, credentials_path: Path) -> dict:
    result: dict = {
        "scorecard_available": False,
        "window_28d": None,
        "top_articles_28d": [],
        "top_articles_7d": [],
        "top_tags_28d": [],
        "authors_28d": [],
        "top_directory_pages_28d": [],
    }
    if scorecard_path.exists():
        try:
            data = json.loads(scorecard_path.read_text(encoding="utf-8"))
            result["scorecard_available"] = True
            meta_by_slug = {a["slug"]: a for a in data.get("articles", [])}
            w28 = data.get("windows", {}).get("28d", {})
            w7 = data.get("windows", {}).get("7d", {})
            result["window_28d"] = {"start": w28.get("start"), "end": w28.get("end")}

            def extract_articles(win: dict) -> list[dict]:
                out = []
                for slug, row in win.get("articles", {}).items():
                    m = row.get("metrics", {})
                    pvs = int(_metric_val(m.get("pageviews"), 0))
                    if pvs <= 0:
                        continue
                    fg = round(_metric_val(m.get("engagement_seconds_foreground_proxy"), 0.0), 1)
                    avg_fg = round(_metric_val(m.get("avg_engagement_seconds_per_pageview_foreground_proxy"), 0.0), 1)
                    users = m.get("users", {}).get("value")
                    meta = meta_by_slug.get(slug, {})
                    out.append({
                        "slug": slug,
                        "title": meta.get("title", slug),
                        "author": meta.get("author", "Unknown"),
                        "tags": meta.get("tags", []),
                        "pageviews": pvs,
                        "fg_engagement_seconds": fg,
                        "avg_fg_seconds": avg_fg,
                        "users": users,
                    })
                out.sort(key=lambda x: (x["pageviews"], x["fg_engagement_seconds"]), reverse=True)
                return out

            result["top_articles_28d"] = extract_articles(w28)[:15]
            result["top_articles_7d"] = extract_articles(w7)[:10]

            tags_28 = w28.get("groups", {}).get("topic_tag", {}).get("groups", {})
            active_tags = []
            for tag_name, trow in tags_28.items():
                pvs = int(_metric_val(trow.get("pageviews"), 0))
                if pvs <= 0:
                    continue
                fg = round(_metric_val(trow.get("engagement_seconds_foreground_proxy"), 0.0), 1)
                active_tags.append({
                    "tag": tag_name,
                    "article_count": trow.get("article_count", 0),
                    "pageviews": pvs,
                    "fg_engagement_seconds": fg,
                })
            active_tags.sort(key=lambda x: (x["pageviews"], x["fg_engagement_seconds"]), reverse=True)
            result["top_tags_28d"] = active_tags[:12]

            authors_28 = w28.get("groups", {}).get("author", {}).get("groups", {})
            author_list = []
            for author_name, arow in authors_28.items():
                pvs = int(_metric_val(arow.get("pageviews"), 0))
                fg = round(_metric_val(arow.get("engagement_seconds_foreground_proxy"), 0.0), 1)
                author_list.append({
                    "author": author_name,
                    "article_count": arow.get("article_count", 0),
                    "pageviews": pvs,
                    "fg_engagement_seconds": fg,
                })
            author_list.sort(key=lambda x: (x["pageviews"], x["fg_engagement_seconds"]), reverse=True)
            result["authors_28d"] = author_list
        except Exception as exc:
            result["scorecard_error"] = str(exc)

    # Also query GA4 for top sitewide /directory/* pages to see which cities/parks/groups attract visitors
    if credentials_path.exists():
        try:
            cred = service_account.Credentials.from_service_account_file(
                str(credentials_path),
                scopes=["https://www.googleapis.com/auth/analytics.readonly"],
            )
            session = AuthorizedSession(cred)
            today = dt.datetime.now(dt.timezone.utc).date()
            end = today - dt.timedelta(days=1)
            start = end - dt.timedelta(days=27)
            body = {
                "dateRanges": [{"startDate": str(start), "endDate": str(end)}],
                "dimensions": [{"name": "pagePath"}],
                "metrics": [{"name": "screenPageViews"}, {"name": "userEngagementDuration"}],
                "dimensionFilter": {
                    "andGroup": {
                        "expressions": [
                            {
                                "filter": {
                                    "fieldName": "hostName",
                                    "inListFilter": {
                                        "values": ["concretecomeback.com", "www.concretecomeback.com"],
                                        "caseSensitive": False,
                                    },
                                }
                            },
                            {
                                "filter": {
                                    "fieldName": "pagePath",
                                    "stringFilter": {"matchType": "BEGINS_WITH", "value": "/directory"},
                                }
                            },
                        ]
                    }
                },
                "limit": 15,
            }
            resp = session.post(
                f"https://analyticsdata.googleapis.com/v1beta/properties/{GA4_PROPERTY_ID}:runReport",
                json=body,
                timeout=30,
            )
            if resp.status_code == 200:
                rows = resp.json().get("rows", [])
                for r in rows:
                    path = r["dimensionValues"][0]["value"]
                    pvs = int(r["metricValues"][0]["value"])
                    dur = round(float(r["metricValues"][1]["value"]), 1)
                    result["top_directory_pages_28d"].append(
                        {"path": path, "pageviews": pvs, "fg_engagement_seconds": dur}
                    )
        except Exception as exc:
            result["ga4_directory_error"] = str(exc)

    return result


def fetch_gsc_signals(credentials_path: Path, corpus: list[dict]) -> dict:
    if not credentials_path.exists():
        return {"available": False, "reason": "Credentials file not found"}

    cred = service_account.Credentials.from_service_account_file(
        str(credentials_path),
        scopes=["https://www.googleapis.com/auth/webmasters.readonly"],
    )
    session = AuthorizedSession(cred)
    encoded_site = urllib.parse.quote(SITE_URL, safe="")
    endpoint = f"https://www.googleapis.com/webmasters/v3/sites/{encoded_site}/searchAnalytics/query"

    today = dt.datetime.now(dt.timezone.utc).date()
    probe_resp = session.post(
        endpoint,
        json={
            "startDate": str(today - dt.timedelta(days=100)),
            "endDate": str(today),
            "type": "web",
            "dataState": "final",
            "dimensions": ["date"],
            "rowLimit": 1000,
        },
        timeout=45,
    )
    probe_resp.raise_for_status()
    date_rows = probe_resp.json().get("rows", [])
    if not date_rows:
        return {"available": False, "reason": "No finalized GSC daily rows returned"}

    latest = dt.date.fromisoformat(max(r["keys"][0] for r in date_rows))
    start_90 = latest - dt.timedelta(days=89)
    start_28 = latest - dt.timedelta(days=27)

    def run_query(start: dt.date, end: dt.date, dims: list[str]) -> list[dict]:
        resp = session.post(
            endpoint,
            json={
                "startDate": str(start),
                "endDate": str(end),
                "type": "web",
                "dataState": "final",
                "dimensions": dims,
                "rowLimit": 5000,
            },
            timeout=45,
        )
        resp.raise_for_status()
        return resp.json().get("rows", [])

    queries_90 = run_query(start_90, latest, ["query"])
    pages_90 = run_query(start_90, latest, ["page"])
    qp_90 = run_query(start_90, latest, ["query", "page"])
    queries_28 = run_query(start_28, latest, ["query"])

    q28_map = {r["keys"][0]: r for r in queries_28}

    # Consolidate trailing-slash and non-trailing-slash blog page rows
    blog_by_slug: dict[str, dict] = {}
    for r in pages_90:
        url = r["keys"][0]
        path = urllib.parse.urlparse(url).path.rstrip("/")
        if not path.startswith("/blog/") or path == "/blog":
            continue
        slug = path.split("/blog/", 1)[1]
        if slug.isdigit():
            continue
        impr = r.get("impressions", 0)
        clicks = r.get("clicks", 0)
        pos = r.get("position", 0.0)
        cur = blog_by_slug.get(slug)
        if cur is None:
            blog_by_slug[slug] = {
                "path": f"/blog/{slug}/",
                "clicks_90d": clicks,
                "impressions_90d": impr,
                "weighted_pos_sum": pos * impr,
            }
        else:
            cur["clicks_90d"] += clicks
            cur["impressions_90d"] += impr
            cur["weighted_pos_sum"] += pos * impr

    top_blog_pages = []
    refresh_candidates = []
    for slug, info in blog_by_slug.items():
        impr = info["impressions_90d"]
        clicks = info["clicks_90d"]
        ctr = round((clicks / impr) * 100, 2) if impr else 0.0
        pos = round(info["weighted_pos_sum"] / impr, 1) if impr else 0.0
        entry = {
            "path": info["path"],
            "clicks_90d": clicks,
            "impressions_90d": impr,
            "ctr_pct": ctr,
            "avg_position": pos,
        }
        top_blog_pages.append(entry)
        if impr >= 25 and 3.5 <= pos <= 20.0 and ctr < 2.5:
            refresh_candidates.append(entry)

    top_blog_pages.sort(key=lambda x: (x["clicks_90d"], x["impressions_90d"]), reverse=True)
    refresh_candidates.sort(key=lambda x: x["impressions_90d"], reverse=True)

    # Map query -> pages it matched in 90d
    qp_by_query: dict[str, list[dict]] = {}
    for r in qp_90:
        q, p = r["keys"][0], r["keys"][1]
        qp_by_query.setdefault(q, []).append({
            "page": urllib.parse.urlparse(p).path,
            "clicks": r.get("clicks", 0),
            "impressions": r.get("impressions", 0),
            "position": round(r.get("position", 0.0), 1),
        })

    editorial_queries = []
    unmet_editorial_gaps = []
    directory_queries = []

    for r in queries_90:
        q = r["keys"][0]
        impr_90 = r.get("impressions", 0)
        clicks_90 = r.get("clicks", 0)
        pos_90 = round(r.get("position", 0.0), 1)
        r28 = q28_map.get(q, {})
        impr_28 = r28.get("impressions", 0)
        clicks_28 = r28.get("clicks", 0)

        overlap = check_overlap(q, corpus)
        matched_pages = qp_by_query.get(q, [])
        is_directory_only = bool(matched_pages) and all(
            m["page"].startswith("/directory") for m in matched_pages
        )

        entry = {
            "query": q,
            "clicks_90d": clicks_90,
            "impressions_90d": impr_90,
            "clicks_28d": clicks_28,
            "impressions_28d": impr_28,
            "avg_position_90d": pos_90,
            "matched_pages": matched_pages[:3],
            "corpus_overlap": overlap,
        }

        if is_directory_only:
            directory_queries.append(entry)
        else:
            editorial_queries.append(entry)
            if overlap["status"] == "new_topic" and len(tokenize(q)) >= 1:
                unmet_editorial_gaps.append(entry)

    editorial_queries.sort(key=lambda x: (x["impressions_90d"], x["clicks_90d"]), reverse=True)
    unmet_editorial_gaps.sort(key=lambda x: (x["impressions_90d"], x["clicks_90d"]), reverse=True)
    directory_queries.sort(key=lambda x: (x["impressions_90d"], x["clicks_90d"]), reverse=True)

    return {
        "available": True,
        "latest_final_date": str(latest),
        "window_90d": {"start": str(start_90), "end": str(latest)},
        "window_28d": {"start": str(start_28), "end": str(latest)},
        "top_blog_pages_90d": top_blog_pages[:20],
        "refresh_candidates": refresh_candidates[:15],
        "editorial_queries_90d": editorial_queries[:30],
        "unmet_editorial_gaps": unmet_editorial_gaps[:20],
        "top_directory_queries_90d": directory_queries[:15],
    }


def current_season(month: int) -> str:
    if month in (11, 12, 1, 2):
        return "winter"
    if month in (3, 4, 5):
        return "spring"
    if month in (6, 7, 8):
        return "summer"
    return "autumn"


def fetch_trends_and_autocomplete(corpus: list[dict], extra_seeds: list[str] | None = None) -> dict:
    now = dt.datetime.now(dt.timezone.utc)
    season = current_season(now.month)
    seeds = list(SEASONAL_SEEDS.get(season, [])) + list(EVERGREEN_SEEDS)
    if extra_seeds:
        seeds = list(extra_seeds) + seeds

    seen_suggestions: set[str] = set()
    new_topic_suggestions: list[dict] = []
    covered_suggestions: list[dict] = []

    headers = {"User-Agent": "Mozilla/5.0 (compatible; ConcreteComebackResearch/1.0)"}

    for seed in seeds:
        try:
            url = "https://suggestqueries.google.com/complete/search?" + urllib.parse.urlencode(
                {"client": "firefox", "hl": "en", "gl": "us", "q": seed}
            )
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code != 200:
                continue
            payload = resp.json()
            suggestions = payload[1] if isinstance(payload, list) and len(payload) > 1 else []
            for s in suggestions:
                s_clean = s.strip().lower()
                if not s_clean or s_clean in seen_suggestions or s_clean == seed.lower():
                    continue
                if AUTOCOMPLETE_EXCLUDE_RE.search(s_clean):
                    continue
                seen_suggestions.add(s_clean)
                overlap = check_overlap(s_clean, corpus)
                if len(tokenize(s_clean)) == 0:
                    continue
                item = {
                    "seed": seed,
                    "suggestion": s_clean,
                    "season_context": season if seed in SEASONAL_SEEDS.get(season, []) else "evergreen",
                    "corpus_overlap": overlap,
                }
                if overlap["status"] == "new_topic":
                    new_topic_suggestions.append(item)
                else:
                    covered_suggestions.append(item)
        except Exception:
            continue

    trending_rss_items: list[dict] = []
    try:
        rss_resp = requests.get(
            "https://trends.google.com/trending/rss?geo=US",
            headers=headers,
            timeout=10,
        )
        if rss_resp.status_code == 200:
            root = ET.fromstring(rss_resp.text)
            for item in root.findall("./channel/item"):
                title_el = item.find("title")
                if title_el is not None and title_el.text:
                    trending_rss_items.append({"title": title_el.text.strip()})
    except Exception:
        pass

    return {
        "season": season,
        "seeds_checked": len(seeds),
        "new_topic_suggestions": new_topic_suggestions[:40],
        "already_covered_suggestions": covered_suggestions[:20],
        "us_daily_trends_sample": trending_rss_items[:10],
    }


def summarize_corpus(corpus: list[dict]) -> dict:
    by_author: dict[str, int] = {}
    by_tag: dict[str, int] = {}
    for p in corpus:
        by_author[p["author"]] = by_author.get(p["author"], 0) + 1
        for t in p["tags"]:
            by_tag[t] = by_tag.get(t, 0) + 1
    sorted_tags = sorted(by_tag.items(), key=lambda x: x[1], reverse=True)
    return {
        "total_posts": len(corpus),
        "by_author": by_author,
        "top_tags": [{"tag": k, "count": v} for k, v in sorted_tags[:15]],
        "underrepresented_tags": [{"tag": k, "count": v} for k, v in sorted_tags if v <= 2][:20],
    }


def validate_safe_out(out_dir: Path) -> None:
    resolved = out_dir.resolve()
    if resolved == REPO_ROOT or REPO_ROOT in resolved.parents:
        raise ValueError(f"--out {out_dir} must be outside the git repository ({REPO_ROOT})")
    forbidden = {"public", "dist", "www", "htdocs"}
    if any(part in forbidden for part in resolved.parts):
        raise ValueError(f"--out {out_dir} contains a public web directory component")


def format_markdown(report: dict) -> str:
    lines = [
        "# Concrete Comeback — Blog Topic Discovery Report",
        "",
        f"Generated: `{report['generated_at']}`",
        "",
        "## 1. On-Site Reader Interest (GA4 + Article Scorecard)",
        "",
    ]
    onsite = report["on_site_interest"]
    if onsite.get("scorecard_available"):
        w = onsite.get("window_28d") or {}
        lines.append(f"**28d Window:** `{w.get('start')} → {w.get('end')}`")
        lines.append("")
        lines.append("### Top Engaging Blog Posts on Site (28d)")
        lines.append("| Slug | Author | Pageviews | Fg Engagement (s) | Avg (s/pv) | Tags |")
        lines.append("|---|---|---:|---:|---:|---|")
        for a in onsite.get("top_articles_28d", [])[:12]:
            tags = ", ".join(a.get("tags", [])[:4])
            lines.append(
                f"| `{a['slug']}` | {a['author']} | {a['pageviews']} | {a['fg_engagement_seconds']} | {a['avg_fg_seconds']} | {tags} |"
            )
        lines.append("")
        lines.append("### Top Topic Tags by Reader Reach on Site (28d)")
        lines.append("| Tag | Published Posts | Pageviews | Fg Engagement (s) |")
        lines.append("|---|---:|---:|---:|")
        for t in onsite.get("top_tags_28d", [])[:12]:
            lines.append(f"| `{t['tag']}` | {t['article_count']} | {t['pageviews']} | {t['fg_engagement_seconds']} |")
        lines.append("")
    if onsite.get("top_directory_pages_28d"):
        lines.append("### Top Directory Pages Visited on Site (28d)")
        lines.append("| Path | Pageviews | Fg Engagement (s) |")
        lines.append("|---|---:|---:|")
        for d in onsite["top_directory_pages_28d"][:10]:
            lines.append(f"| `{d['path']}` | {d['pageviews']} | {d['fg_engagement_seconds']} |")
        lines.append("")

    gsc = report["gsc"]
    lines.append("## 2. Google Search Console Signals")
    lines.append("")
    if gsc.get("available"):
        w90 = gsc["window_90d"]
        lines.append(f"**90d Finalized Window:** `{w90['start']} → {w90['end']}`")
        lines.append("")
        lines.append("### A. Existing Post Refresh Candidates (Pos 3.5–20, Impr ≥ 25, CTR < 2.5%)")
        lines.append("> **Rule:** Update the existing post's title, meta description, or opening answer. Never write a duplicate competing post.")
        lines.append("")
        lines.append("| Path | Impressions (90d) | Clicks (90d) | CTR % | Avg Position |")
        lines.append("|---|---:|---:|---:|---:|")
        for r in gsc.get("refresh_candidates", []):
            lines.append(
                f"| `{r['path']}` | {r['impressions_90d']} | {r['clicks_90d']} | {r['ctr_pct']}% | {r['avg_position']} |"
            )
        lines.append("")
        lines.append("### B. Disclosed Blog / Editorial Search Queries (90d)")
        lines.append("| Query | Impr (90d) | Clicks (90d) | Impr (28d) | Pos | Corpus Status | Closest Post | Landing Pages |")
        lines.append("|---|---:|---:|---:|---:|---|---|---|")
        for q in gsc.get("editorial_queries_90d", [])[:25]:
            ov = q["corpus_overlap"]
            pages = ", ".join(f"`{m['page']}`" for m in q.get("matched_pages", [])[:2])
            lines.append(
                f"| `{q['query']}` | {q['impressions_90d']} | {q['clicks_90d']} | {q['impressions_28d']} | {q['avg_position_90d']} | `{ov['status']}` ({ov['max_similarity']}) | `{ov['closest_slug'] or '-'}` | {pages} |"
            )
        lines.append("")
        lines.append("### C. Top Directory Venue Queries in GSC (90d)")
        lines.append("| Query | Impr (90d) | Clicks (90d) | Pos | Landing Directory Page |")
        lines.append("|---|---:|---:|---:|---|")
        for q in gsc.get("top_directory_queries_90d", [])[:10]:
            pages = ", ".join(f"`{m['page']}`" for m in q.get("matched_pages", [])[:2])
            lines.append(
                f"| `{q['query']}` | {q['impressions_90d']} | {q['clicks_90d']} | {q['avg_position_90d']} | {pages} |"
            )
        lines.append("")
    else:
        lines.append(f"GSC unavailable: {gsc.get('reason')}")
        lines.append("")

    trends = report["trends_and_autocomplete"]
    lines.append(f"## 3. Google Trends & Search Autocomplete (`{trends['season']}` + evergreen)")
    lines.append("")
    lines.append("### A. Uncovered Search Suggestions (Clean of Corpus Duplicates, Jaccard < 0.34)")
    lines.append("| Seed | Real User Search Suggestion | Context | Closest Existing Post (Sim) |")
    lines.append("|---|---|---|---|")
    for item in trends.get("new_topic_suggestions", [])[:30]:
        ov = item["corpus_overlap"]
        lines.append(
            f"| `{item['seed']}` | **{item['suggestion']}** | `{item['season_context']}` | `{ov['closest_slug']}` ({ov['max_similarity']}) |"
        )
    lines.append("")

    corpus_sum = report["corpus_summary"]
    lines.append("## 4. Corpus & Author Balance")
    lines.append("")
    lines.append(f"Total published posts: **{corpus_sum['total_posts']}**")
    lines.append("")
    lines.append("| Author | Post Count |")
    lines.append("|---|---:|")
    for author, count in sorted(corpus_sum["by_author"].items(), key=lambda x: x[1], reverse=True):
        lines.append(f"| {author} | {count} |")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Discover and vet blog topics using GA4, GSC, and Google Trends.")
    parser.add_argument("--credentials", default=DEFAULT_CREDENTIALS, help="Path to Google service account JSON")
    parser.add_argument("--scorecard", default=DEFAULT_SCORECARD, help="Path to GA4 scorecard.json")
    parser.add_argument("--out", default=DEFAULT_OUT, help="Private output directory outside repo")
    parser.add_argument("--seed", action="append", default=[], help="Extra Google Autocomplete/Trends seed query")
    parser.add_argument("--check-topic", action="append", default=[], help="Check specific topic title(s) against corpus and output suggested internal blog cross-links")
    parser.add_argument("--suggest-links", action="append", default=[], help="Suggest verified internal /blog/<slug>/ cross-links for a topic or tag query")
    parser.add_argument("--verify-links", nargs="*", help="Verify internal /blog/ and /directory/ cross-links in the given markdown files (or pass no paths to check all blog posts)")
    parser.add_argument("--min-blog-links", type=int, default=2, help="Minimum number of verified /blog/<slug>/ cross-links required per post (default: 2)")
    parser.add_argument("--stdout-md", action="store_true", help="Print Markdown summary to stdout")
    args = parser.parse_args()

    out_dir = Path(args.out)
    validate_safe_out(out_dir)

    corpus = load_corpus(BLOG_DIR)

    if args.suggest_links:
        results = {q: suggest_cross_links(q, corpus, limit=8) for q in args.suggest_links}
        print(json.dumps(results, indent=2))
        return 0

    if args.verify_links is not None:
        targets = args.verify_links or [str(p) for p in sorted(BLOG_DIR.glob("*.md"))]
        ok, link_report = verify_post_cross_links(targets, corpus, min_blog_links=args.min_blog_links)
        print(json.dumps({"all_ok": ok, "posts": link_report}, indent=2))
        return 0 if ok else 1

    if args.check_topic:
        results = {}
        for t in args.check_topic:
            results[t] = check_overlap(t, corpus)
        print(json.dumps(results, indent=2))
        return 0

    report = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "corpus_summary": summarize_corpus(corpus),
        "on_site_interest": load_on_site_interest(Path(args.scorecard), Path(args.credentials)),
        "gsc": fetch_gsc_signals(Path(args.credentials), corpus),
        "trends_and_autocomplete": fetch_trends_and_autocomplete(corpus, args.seed),
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "topic-discovery.json"
    md_path = out_dir / "topic-discovery.md"
    md_text = format_markdown(report)
    json_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    md_path.write_text(md_text + "\n", encoding="utf-8")

    if args.stdout_md:
        print(md_text)
    else:
        print(f"Wrote {json_path} and {md_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
