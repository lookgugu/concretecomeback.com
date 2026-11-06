#!/usr/bin/env python3
"""Repurpose and post Concrete Comeback blog posts to Instagram and X via PostEverywhere.

Connected PostEverywhere accounts:
  * Instagram (@concretecomeback): 11053
  * X (Concrete Comeback):         11054

Features:
  * Generates a 5-slide 1080x1350 branded PNG carousel for Instagram (and uses
    Slide 1 as the visual card for Tweet 1 on X).
  * Extracts the direct opening answer and H2/H3 takeaways into an X thread and
    an Instagram caption (preserving Concrete Comeback's anti-slop rules: zero
    em dashes, 'older skaters' terminology).
  * Automatically looks up Instagram @handles for any /directory/{parks,shops,groups}/
    entries linked inside the blog post and tags them in the Instagram caption.
  * Verifies that the blog post is live (HTTP 200 on concretecomeback.com) before
    any live post is sent.
  * Tracks posted slugs in .agent-state/blog-social-state.json to prevent duplicates.

Usage:
  python3 scripts/social/post-blog-to-social.py --init-state
  python3 scripts/social/post-blog-to-social.py --dry-run --skip-live-check --slug skateboard-truck-bushings-durometer-weight-guide
  python3 scripts/social/post-blog-to-social.py --max-posts 1
"""

from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
import textwrap
import time
import urllib.error
import urllib.request
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BASE = "https://app.posteverywhere.ai/api/v1"
REPO_ROOT = Path(__file__).resolve().parents[2]
BLOG_DIR = REPO_ROOT / "src" / "content" / "blog"
CONTENT_DIR = REPO_ROOT / "src" / "content"
STATE_FILE = REPO_ROOT / ".agent-state" / "blog-social-state.json"
LOG_FILE = REPO_ROOT / "logs" / "social-autopost.jsonl"
ASSET_BASE_DIR = REPO_ROOT / ".agent-state" / "social-assets"
ENV_PATH = Path("/home/beno/.env")
SITE_ORIGIN = "https://concretecomeback.com"

ACCOUNTS = {
    "instagram": 11053,
    "x": 11054,
}

CTX = ssl.create_default_context()

FONT_BOLD_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# Brand palette matching src/styles/global.css
BG_DARK = (20, 18, 16)         # #141210
CARD_BG = (31, 28, 24)         # #1F1C18
BORDER_STONE = (58, 53, 47)    # #3A352F
ACCENT_AMBER = (245, 158, 11)  # #F59E0B
TEXT_WHITE = (250, 250, 249)   # #FAFAF9
TEXT_CREAM = (231, 229, 228)   # #E7E5E4
TEXT_MUTED = (168, 162, 158)   # #A8A29E


def load_api_key() -> str:
    key = os.environ.get("POST_ANYWHERE_API_KEY", "").strip()
    if key:
        return key
    if ENV_PATH.exists():
        for raw in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, val = line.split("=", 1)
            if name.strip() == "POST_ANYWHERE_API_KEY":
                return val.strip().strip('"').strip("'")
    raise RuntimeError("POST_ANYWHERE_API_KEY not found in environment or /home/beno/.env")


def api(method: str, path: str, data: dict | None = None) -> tuple[int, dict]:
    body = json.dumps(data).encode("utf-8") if data is not None else None
    headers = {
        "Authorization": "Bearer " + load_api_key(),
        "Accept": "application/json",
        "User-Agent": "ConcreteComebackSocial/1.0",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"error": {"message": raw[:300]}}
        return exc.code, parsed


def parse_markdown_post(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    if not raw.startswith("---\n"):
        raise ValueError(f"Missing frontmatter in {path}")
    end = raw.find("\n---", 4)
    if end == -1:
        raise ValueError(f"Unclosed frontmatter in {path}")
    fm_block = raw[4:end]
    body = raw[end + 4 :].strip()

    meta: dict = {"slug": path.stem, "path": str(path)}
    for line in fm_block.splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        k, v = line.split(":", 1)
        k = k.strip()
        v = v.strip()
        if v.startswith("[") and v.endswith("]"):
            items = [x.strip().strip("\"'") for x in v[1:-1].split(",") if x.strip()]
            meta[k] = items
        elif v.lower() in ("true", "false"):
            meta[k] = v.lower() == "true"
        else:
            meta[k] = v.strip("\"'")

    meta["body"] = body
    return meta


def strip_md(text: str) -> str:
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    text = re.sub(r"[*_~#>]", "", text)
    text = text.replace("—", ", ").replace("–", "-")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


def extract_structured_content(meta: dict) -> dict:
    body = meta["body"]
    paragraphs: list[str] = []
    sections: list[dict] = []
    current_sec: dict | None = None

    for block in re.split(r"\n\s*\n", body):
        block = block.strip()
        if not block:
            continue
        if block.startswith("## "):
            heading = strip_md(block.splitlines()[0][3:])
            current_sec = {"heading": heading, "subpoints": [], "paragraphs": []}
            sections.append(current_sec)
            rest = "\n".join(block.splitlines()[1:]).strip()
            if rest:
                current_sec["paragraphs"].append(strip_md(rest))
        elif block.startswith("### "):
            lines = block.splitlines()
            sub_h = strip_md(lines[0][4:])
            sub_b = strip_md(" ".join(lines[1:]))
            if current_sec is None:
                current_sec = {"heading": "Key Points", "subpoints": [], "paragraphs": []}
                sections.append(current_sec)
            current_sec["subpoints"].append({"title": sub_h, "body": sub_b})
        elif block.startswith("- "):
            for line in block.splitlines():
                if line.strip().startswith("- "):
                    item_txt = strip_md(line.strip()[2:])
                    if current_sec is not None:
                        current_sec["subpoints"].append({"title": "", "body": item_txt})
        elif not block.startswith("#") and not block.startswith("---"):
            clean_p = strip_md(block)
            if current_sec is None:
                paragraphs.append(clean_p)
            else:
                current_sec["paragraphs"].append(clean_p)

    intro = paragraphs[0] if paragraphs else strip_md(meta.get("description", ""))
    return {
        "intro": intro,
        "intro_extra": paragraphs[1] if len(paragraphs) > 1 else "",
        "sections": sections,
    }


def extract_directory_handles(body: str) -> list[str]:
    """Find /directory/{parks,shops,groups}/<country>/<slug> links and look up instagram handles."""
    matches = re.findall(r"/directory/(parks|shops|groups)/([a-z]{2}|online)/([a-z0-9-]+)", body)
    handles: list[str] = []
    seen: set[str] = set()
    for collection, country, slug in matches:
        md_path = CONTENT_DIR / collection / country / f"{slug}.md"
        if not md_path.exists():
            continue
        raw = md_path.read_text(encoding="utf-8")
        m = re.search(r'^instagram:\s*["\']?@?([A-Za-z0-9_.]+)["\']?\s*$', raw, re.M)
        if m:
            h = "@" + m.group(1).lstrip("@")
            if h.lower() not in seen:
                seen.add(h.lower())
                handles.append(h)
    return handles


def utm_url(slug: str, platform: str) -> str:
    return (
        f"{SITE_ORIGIN}/blog/{slug}/"
        f"?utm_source={platform}&utm_medium=social&utm_campaign=blog-autopost&utm_content={slug}"
    )


def is_live_post(slug: str) -> bool:
    try:
        verify_live_post(slug)
        return True
    except Exception:
        return False


def verify_live_post(slug: str) -> None:
    url = f"{SITE_ORIGIN}/blog/{slug}/"
    req = urllib.request.Request(url, headers={"User-Agent": "ConcreteComebackSocialCheck/1.0"})
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=20) as resp:
            if resp.status != 200:
                raise RuntimeError(f"Live check failed for {url}: HTTP {resp.status}")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Live check failed for {url}: HTTP {exc.code} (is the PR merged and deployed?)") from exc


def truncate(text: str, limit: int) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip(" ,;:-") + "…"


def build_x_thread(meta: dict, parsed: dict) -> list[str]:
    slug = meta["slug"]
    title = strip_md(meta.get("title", slug))
    intro_sents = split_sentences(parsed["intro"])
    hook_body = " ".join(intro_sents[:2]) if intro_sents else strip_md(meta.get("description", ""))

    t1_prefix = f"{title}\n\n"
    t1_budget = 275 - len(t1_prefix)
    tweet1 = t1_prefix + truncate(hook_body, t1_budget)

    tweets = [tweet1]
    secs = parsed["sections"][:4]
    for idx, sec in enumerate(secs, start=1):
        heading = sec["heading"].rstrip("?:.")
        if sec["subpoints"]:
            pts = []
            for sp in sec["subpoints"][:3]:
                if sp["title"]:
                    pts.append(f"• {sp['title']}: {split_sentences(sp['body'])[0] if sp['body'] else ''}")
                else:
                    pts.append(f"• {split_sentences(sp['body'])[0]}")
            sec_text = "\n".join(pts)
        elif sec["paragraphs"]:
            sec_text = " ".join(split_sentences(sec["paragraphs"][0])[:2])
        else:
            continue
        prefix = f"{idx}/ {heading}\n\n"
        tweets.append(prefix + truncate(sec_text, 275 - len(prefix)))

    url = utm_url(slug, "x")
    tweets.append(
        f"Read the full guide on Concrete Comeback:\n{url}\n\n#olderskaters #skateboarding"
    )
    return tweets


def build_instagram_caption(meta: dict, parsed: dict, handles: list[str]) -> str:
    slug = meta["slug"]
    title = strip_md(meta.get("title", slug))
    author = meta.get("author", "Concrete Comeback")
    intro = parsed["intro"]

    lines = [
        title,
        "",
        intro,
        "",
        "Key takeaways from the guide:",
    ]

    bullet_count = 0
    for sec in parsed["sections"]:
        if sec["subpoints"]:
            for sp in sec["subpoints"]:
                if bullet_count >= 4:
                    break
                first_sent = split_sentences(sp["body"])[0] if sp["body"] else ""
                label = f"{sp['title']}: {first_sent}" if sp["title"] else first_sent
                lines.append(f"• {truncate(label, 140)}")
                bullet_count += 1
        elif sec["paragraphs"] and bullet_count < 4:
            first_sent = split_sentences(sec["paragraphs"][0])[0]
            lines.append(f"• {sec['heading']}: {truncate(first_sent, 130)}")
            bullet_count += 1
        if bullet_count >= 4:
            break

    if handles:
        lines.extend(["", f"Spots & shops mentioned: {' '.join(handles)}"])

    lines.extend([
        "",
        f"By {author} · Full guide at concretecomeback.com/blog/{slug}/ (link in bio).",
        "",
        "#olderskaters #skateboardingover40 #skateboardingover50 #concretecomeback #skatepark",
    ])
    caption = "\n".join(lines)
    return truncate(caption, 2150)


# ---------------------------------------------------------------------------
# Branded 1080x1350 Slide Renderer (Pillow)
# ---------------------------------------------------------------------------

def _font(bold: bool, size: int) -> ImageFont.FreeTypeFont:
    path = FONT_BOLD_PATH if bold else FONT_REG_PATH
    return ImageFont.truetype(path, size)


def _draw_wrapped(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont,
    color: tuple[int, int, int],
    x: int,
    y: int,
    max_width: int,
    line_spacing: int = 12,
    max_lines: int = 10,
) -> int:
    words = text.split()
    lines: list[str] = []
    cur = ""
    for w in words:
        test = f"{cur} {w}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width or not cur:
            cur = test
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)

    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(" .,;:") + "…"

    cur_y = y
    for line in lines:
        draw.text((x, cur_y), line, font=font, fill=color)
        bbox = draw.textbbox((0, 0), line, font=font)
        cur_y += (bbox[3] - bbox[1]) + line_spacing
    return cur_y


def _base_slide(slide_num: int, total_slides: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (1080, 1350), BG_DARK)
    draw = ImageDraw.Draw(img)

    # Outer frame card
    draw.rounded_rectangle((48, 48, 1032, 1302), radius=24, fill=CARD_BG, outline=BORDER_STONE, width=3)
    # Top amber accent bar
    draw.rectangle((96, 48, 360, 58), fill=ACCENT_AMBER)

    # Header brand + slide counter
    f_brand = _font(True, 26)
    f_count = _font(True, 24)
    draw.text((96, 96), "CONCRETE COMEBACK", font=f_brand, fill=ACCENT_AMBER)
    counter_txt = f"{slide_num} / {total_slides}"
    cb = draw.textbbox((0, 0), counter_txt, font=f_count)
    draw.text((984 - (cb[2] - cb[0]), 96), counter_txt, font=f_count, fill=TEXT_MUTED)

    # Subtle divider line
    draw.line((96, 148, 984, 148), fill=BORDER_STONE, width=2)
    # Bottom divider line
    draw.line((96, 1190, 984, 1190), fill=BORDER_STONE, width=2)
    draw.text((96, 1220), "concretecomeback.com · Skateboarding in your 40s, 50s & beyond", font=_font(False, 24), fill=TEXT_MUTED)
    return img, draw


def render_carousel_slides(meta: dict, parsed: dict, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    slug = meta["slug"]
    title = strip_md(meta.get("title", slug))
    author = meta.get("author", "Concrete Comeback")
    author_age = meta.get("authorAge", "")
    author_bio = strip_md(meta.get("authorBio", ""))
    tags = meta.get("tags", [])
    tag_label = " · ".join(t.upper() for t in tags[:3]) if isinstance(tags, list) and tags else "OLDER SKATERS GUIDE"

    total_slides = 5
    slides: list[Path] = []

    # --- SLIDE 1: Cover ---
    img1, draw1 = _base_slide(1, total_slides)
    draw1.text((96, 210), tag_label, font=_font(True, 28), fill=ACCENT_AMBER)
    y_after_title = _draw_wrapped(draw1, title, _font(True, 64), TEXT_WHITE, 96, 280, max_width=888, line_spacing=20, max_lines=6)

    # Author box near bottom
    author_line = f"By {author}" + (f" (Age {author_age})" if author_age else "")
    draw1.text((96, max(y_after_title + 60, 880)), author_line, font=_font(True, 34), fill=TEXT_CREAM)
    if author_bio:
        _draw_wrapped(draw1, author_bio, _font(False, 28), TEXT_MUTED, 96, max(y_after_title + 115, 935), max_width=888, line_spacing=10, max_lines=3)
    draw1.text((96, 1120), "SWIPE FOR THE BREAKDOWN  →", font=_font(True, 28), fill=ACCENT_AMBER)
    p1 = out_dir / "slide-1-cover.png"
    img1.save(p1, "PNG")
    slides.append(p1)

    # --- SLIDE 2: The Direct Answer ---
    img2, draw2 = _base_slide(2, total_slides)
    draw2.text((96, 200), "THE SHORT ANSWER", font=_font(True, 30), fill=ACCENT_AMBER)
    intro_short = " ".join(split_sentences(parsed["intro"])[:3])
    y2 = _draw_wrapped(draw2, intro_short, _font(False, 40), TEXT_WHITE, 96, 270, max_width=888, line_spacing=18, max_lines=10)
    if parsed["intro_extra"] and y2 < 780:
        extra_short = " ".join(split_sentences(parsed["intro_extra"])[:2])
        _draw_wrapped(draw2, extra_short, _font(False, 34), TEXT_CREAM, 96, y2 + 36, max_width=888, line_spacing=14, max_lines=5)
    p2 = out_dir / "slide-2-answer.png"
    img2.save(p2, "PNG")
    slides.append(p2)

    # --- SLIDES 3 & 4: Key Sections ---
    secs = parsed["sections"]
    for s_idx, slide_num in enumerate((3, 4)):
        img_s, draw_s = _base_slide(slide_num, total_slides)
        if s_idx < len(secs):
            sec = secs[s_idx]
            draw_s.text((96, 195), f"KEY TAKEAWAY 0{s_idx + 1}", font=_font(True, 28), fill=ACCENT_AMBER)
            y_cur = _draw_wrapped(draw_s, sec["heading"], _font(True, 46), TEXT_WHITE, 96, 250, max_width=888, line_spacing=14, max_lines=3)
            y_cur += 28
            if sec["subpoints"]:
                for sp in sec["subpoints"][:3]:
                    if y_cur > 960:
                        break
                    if sp["title"]:
                        y_cur = _draw_wrapped(draw_s, f"• {sp['title']}", _font(True, 34), ACCENT_AMBER, 96, y_cur, max_width=888, line_spacing=10, max_lines=2)
                        y_cur += 6
                    first_s = split_sentences(sp["body"])[0] if sp["body"] else ""
                    if first_s:
                        y_cur = _draw_wrapped(draw_s, first_s, _font(False, 31), TEXT_CREAM, 120, y_cur, max_width=864, line_spacing=12, max_lines=4)
                        y_cur += 26
            elif sec["paragraphs"]:
                for para in sec["paragraphs"][:2]:
                    if y_cur > 840:
                        break
                    para_short = " ".join(split_sentences(para)[:2])
                    y_cur = _draw_wrapped(draw_s, para_short, _font(False, 36), TEXT_CREAM, 96, y_cur, max_width=888, line_spacing=16, max_lines=6)
                    y_cur += 32
        p_s = out_dir / f"slide-{slide_num}-points.png"
        img_s.save(p_s, "PNG")
        slides.append(p_s)

    # --- SLIDE 5: CTA Card ---
    img5, draw5 = _base_slide(5, total_slides)
    draw5.text((96, 240), "READ THE FULL GUIDE", font=_font(True, 32), fill=ACCENT_AMBER)
    y5 = _draw_wrapped(draw5, title, _font(True, 52), TEXT_WHITE, 96, 310, max_width=888, line_spacing=16, max_lines=4)
    draw5.rounded_rectangle((96, y5 + 50, 984, y5 + 170), radius=16, fill=BG_DARK, outline=ACCENT_AMBER, width=3)
    draw5.text((132, y5 + 90), "concretecomeback.com/blog", font=_font(True, 40), fill=ACCENT_AMBER)

    cta_note = (
        "Plus: Browse 400+ verified older-skater-friendly skateparks, core shops, "
        "and local 30+/40+ skate groups across the US, UK, Canada, and Australia."
    )
    _draw_wrapped(draw5, cta_note, _font(False, 34), TEXT_CREAM, 96, y5 + 230, max_width=888, line_spacing=14, max_lines=5)
    p5 = out_dir / "slide-5-cta.png"
    img5.save(p5, "PNG")
    slides.append(p5)

    return slides


# ---------------------------------------------------------------------------
# PostEverywhere Media Upload & Post Creation
# ---------------------------------------------------------------------------

def multipart_body(field_name: str, path: Path, content_type: str) -> tuple[bytes, str]:
    boundary = "----CCBoundary" + uuid.uuid4().hex
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field_name}"; filename="{path.name}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode("utf-8")
    tail = f"\r\n--{boundary}--\r\n".encode("utf-8")
    return head + path.read_bytes() + tail, boundary


def upload_binary(upload_url: str, path: Path, content_type: str, upload_method: object) -> None:
    spec = upload_method if isinstance(upload_method, dict) else {}
    method = spec.get("method", "PUT").upper()
    field_name = spec.get("field_name")
    headers = dict(spec.get("headers") or {})
    headers.setdefault("User-Agent", "Mozilla/5.0")

    if method == "POST" and field_name:
        body, boundary = multipart_body(field_name, path, content_type)
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    else:
        body = path.read_bytes()
        headers.setdefault("Content-Type", content_type)

    req = urllib.request.Request(upload_url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, context=CTX, timeout=120) as resp:
        if resp.status not in (200, 201, 204):
            raise RuntimeError(f"Binary upload failed: HTTP {resp.status}")


def upload_image(path: Path, dry_run: bool) -> str:
    if dry_run:
        return f"dry-run-media-{path.stem}"
    payload = {
        "filename": path.name,
        "content_type": "image/png",
        "size": path.stat().st_size,
        "width": 1080,
        "height": 1350,
    }
    status, data = api("POST", "/media/upload", payload)
    if status != 201:
        raise RuntimeError(f"POST /media/upload failed: HTTP {status} {data}")
    d = data["data"]
    media_id = d["media_id"]
    upload_binary(d["upload_url"], path, "image/png", d.get("upload_method"))
    status, complete = api("POST", f"/media/{media_id}/complete")
    if status != 200:
        raise RuntimeError(f"POST /media/{media_id}/complete failed: HTTP {status} {complete}")
    return media_id


def require_accounts(platforms: list[str], dry_run: bool) -> dict:
    if dry_run:
        return {p: {"id": ACCOUNTS[p], "can_post": "dry-run"} for p in platforms}
    status, data = api("GET", "/accounts")
    if status != 200:
        raise RuntimeError(f"GET /accounts failed: HTTP {status}")
    accounts = data.get("data", {}).get("accounts", [])
    by_id = {int(a["id"]): a for a in accounts if a.get("id") is not None}
    checked = {}
    for p in platforms:
        aid = ACCOUNTS[p]
        acct = by_id.get(aid)
        if not acct:
            raise RuntimeError(f"Account {aid} ({p}) not found in PostEverywhere")
        health = acct.get("health") or {}
        if not acct.get("is_active") or health.get("can_post") is False:
            raise RuntimeError(f"Account {aid} ({p}) is not healthy/active: {health}")
        checked[p] = {
            "id": aid,
            "account_name": acct.get("account_name"),
            "can_post": health.get("can_post"),
        }
    return checked


def create_platform_post(
    platform: str,
    content: str,
    media_ids: list[str] | None,
    dry_run: bool,
    in_reply_to_post_id: str | None = None,
) -> tuple[str, dict]:
    if dry_run:
        suffix = f"-reply-{in_reply_to_post_id}" if in_reply_to_post_id else ""
        fake_id = f"dry-run-{platform}{suffix}"
        return fake_id, {"destinations": [{"platform": platform, "platform_post_id": fake_id, "destination_status": "dry-run"}]}

    payload: dict = {
        "account_ids": [ACCOUNTS[platform]],
        "content": content,
    }
    if media_ids:
        payload["media_ids"] = media_ids

    if platform == "x":
        x_cfg: dict = {"content": content}
        if in_reply_to_post_id:
            x_cfg["in_reply_to_post_id"] = in_reply_to_post_id
        payload["platform_content"] = {"x": x_cfg}
    elif platform == "instagram":
        payload["platform_content"] = {"instagram": {"content": content}}

    status, data = api("POST", "/posts", payload)
    if status != 201:
        raise RuntimeError(f"POST /posts ({platform}) failed: HTTP {status} {data}")
    post = data.get("data", {})
    post_id = post.get("id") or post.get("post_id")
    if not post_id:
        raise RuntimeError(f"POST /posts ({platform}) returned no post_id: {data}")
    return str(post_id), post


def poll_post_results(post_id: str, dry_run: bool, attempts: int = 8) -> dict:
    if dry_run:
        return {"data": {"results": [{"platform_post_id": f"{post_id}-platform", "destination_status": "dry-run"}]}}
    last = {}
    for _ in range(attempts):
        status, data = api("GET", f"/posts/{post_id}/results")
        last = data
        if status == 200:
            results = data.get("data", {}).get("results", data.get("data", []))
            flat = [r for r in (results if isinstance(results, list) else [results]) if isinstance(r, dict)]
            for r in flat:
                dest_status = str(r.get("status") or r.get("destination_status") or "").lower()
                if dest_status in ("failed", "error", "cancelled", "rejected"):
                    raise RuntimeError(f"Post {post_id} failed on destination: {r}")
            if flat and any(
                str(r.get("status") or r.get("destination_status") or "").lower() in ("done", "published", "success", "completed")
                or (
                    bool(r.get("platform_post_id") or r.get("external_id"))
                    and str(r.get("status") or r.get("destination_status") or "").lower() not in ("pending", "queued", "processing", "failed", "error")
                )
                for r in flat
            ):
                return data
        time.sleep(3)
    raise RuntimeError(f"Post {post_id} did not reach published state after {attempts} attempts: {last}")


def extract_platform_post_id(platform: str, create_data: dict, results_data: dict) -> str:
    candidates = []
    for container in (
        results_data.get("data", {}).get("results", []),
        results_data.get("data", []),
        create_data.get("destinations", []),
    ):
        if isinstance(container, dict):
            candidates.append(container)
        elif isinstance(container, list):
            candidates.extend([x for x in container if isinstance(x, dict)])
    for item in candidates:
        item_platform = item.get("platform")
        item_account = item.get("account_id")
        if item_platform in (None, platform) and item_account in (None, ACCOUNTS[platform]):
            for key in ("platform_post_id", "external_id"):
                if item.get(key):
                    return str(item[key])
    return ""


def load_state() -> dict:
    if not STATE_FILE.exists():
        return {"posted": {}}
    return json.loads(STATE_FILE.read_text(encoding="utf-8"))


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def append_log(entry: dict, dry_run: bool) -> None:
    if dry_run:
        return
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def find_eligible_posts(today: date, slug_filter: str | None = None) -> list[dict]:
    posts = []
    for path in sorted(BLOG_DIR.glob("*.md")):
        if slug_filter and path.stem != slug_filter:
            continue
        meta = parse_markdown_post(path)
        if meta.get("draft") is True:
            continue
        pub_str = str(meta.get("pubDate", ""))[:10]
        try:
            pub_date = date.fromisoformat(pub_str)
        except ValueError:
            continue
        if pub_date > today and not slug_filter:
            continue
        meta["_sort_date"] = str(meta.get("updatedDate") or pub_str)[:10]
        posts.append(meta)
    posts.sort(key=lambda m: (m["_sort_date"], m["slug"]), reverse=True)
    return posts


def main() -> int:
    parser = argparse.ArgumentParser(description="Repurpose and publish Concrete Comeback blog posts to Instagram and X via PostEverywhere.")
    parser.add_argument("--dry-run", action="store_true", help="Render slides and copy without calling PostEverywhere write APIs")
    parser.add_argument("--init-state", action="store_true", help="Mark all currently published blog posts as seen in state file without posting")
    parser.add_argument("--leave-recent", type=int, default=0, help="When used with --init-state, leave the N most recent live posts (plus any not-yet-live posts) queued")
    parser.add_argument("--slug", help="Post a specific blog slug")
    parser.add_argument("--max-posts", type=int, default=1, help="Maximum number of blog posts to publish in one run (default: 1)")
    parser.add_argument("--platforms", default="instagram,x", help="Comma-separated platforms: instagram,x")
    parser.add_argument("--skip-live-check", action="store_true", help="Skip live HTTP 200 verification on concretecomeback.com (only allowed with --dry-run)")
    parser.add_argument("--force", action="store_true", help="Allow re-posting a slug even if already in state file")
    args = parser.parse_args()

    if args.skip_live_check and not args.dry_run:
        raise RuntimeError("--skip-live-check is only allowed with --dry-run")

    platforms = [p.strip().lower() for p in args.platforms.split(",") if p.strip()]
    for p in platforms:
        if p not in ACCOUNTS:
            raise RuntimeError(f"Unsupported platform '{p}'. Supported: {list(ACCOUNTS.keys())}")

    today = datetime.now(timezone.utc).date()
    state = load_state()
    eligible = find_eligible_posts(today, args.slug)

    if args.init_state:
        posted_map = state.setdefault("posted", {})
        queued_slugs: list[str] = []
        live_left = 0
        added = 0
        for meta in eligible:
            s = meta["slug"]
            if args.leave_recent > 0:
                if not is_live_post(s):
                    queued_slugs.append(s)
                    posted_map.pop(s, None)
                    continue
                if live_left < args.leave_recent:
                    queued_slugs.append(s)
                    posted_map.pop(s, None)
                    live_left += 1
                    continue
            if s not in posted_map:
                posted_map[s] = {
                    "baseline_only": True,
                    "marked_at": datetime.now(timezone.utc).isoformat(),
                    "title": meta.get("title"),
                }
                added += 1
        save_state(state)
        print(
            json.dumps(
                {
                    "initialized_new_slugs": added,
                    "total_tracked": len(posted_map),
                    "queued_slugs": queued_slugs,
                    "state_file": str(STATE_FILE),
                },
                indent=2,
            )
        )
        return 0

    posted_map = state.setdefault("posted", {})
    partial_map = state.setdefault("partial", {})

    def is_slug_complete(slug: str) -> bool:
        entry = posted_map.get(slug)
        if not entry:
            return False
        if entry.get("baseline_only"):
            return True
        done_platforms = entry.get("platforms", {})
        return all(p in done_platforms for p in platforms)

    candidates = [m for m in eligible if args.force or not is_slug_complete(m["slug"])]
    todo: list[dict] = []
    skipped_not_live: list[str] = []
    for m in candidates:
        if len(todo) >= args.max_posts:
            break
        if not args.skip_live_check and not args.slug:
            if not is_live_post(m["slug"]):
                skipped_not_live.append(m["slug"])
                continue
        todo.append(m)

    if not todo:
        print(
            json.dumps(
                {
                    "posted_count": 0,
                    "skipped_not_live": skipped_not_live,
                    "message": "No unposted live blog posts found.",
                },
                indent=2,
            )
        )
        return 0

    health = require_accounts(platforms, args.dry_run)
    run_results = []

    for meta in todo:
        slug = meta["slug"]
        if not args.skip_live_check:
            verify_live_post(slug)

        parsed = extract_structured_content(meta)
        handles = extract_directory_handles(meta["body"])
        slide_dir = ASSET_BASE_DIR / slug
        slide_paths = render_carousel_slides(meta, parsed, slide_dir)

        ig_caption = build_instagram_caption(meta, parsed, handles)
        x_thread = build_x_thread(meta, parsed)

        existing_posted = {} if args.force else posted_map.get(slug, {}).get("platforms", {})
        slug_partial = {} if args.force else partial_map.get(slug, {})
        platform_outcomes: dict = dict(existing_posted)

        if "instagram" in platforms:
            if "instagram" in platform_outcomes:
                pass
            elif "instagram" in slug_partial:
                platform_outcomes["instagram"] = slug_partial["instagram"]
            else:
                media_ids = [upload_image(p, args.dry_run) for p in slide_paths]
                ig_post_id, ig_created = create_platform_post("instagram", ig_caption, media_ids, args.dry_run)
                ig_res = poll_post_results(ig_post_id, args.dry_run)
                ig_platform_id = extract_platform_post_id("instagram", ig_created, ig_res) or ig_post_id
                ig_outcome = {
                    "post_id": ig_post_id,
                    "platform_post_id": ig_platform_id,
                    "slides": [str(p) for p in slide_paths],
                    "media_ids": media_ids,
                    "tagged_handles": handles,
                    "caption": ig_caption,
                }
                platform_outcomes["instagram"] = ig_outcome
                if not args.dry_run:
                    partial_map.setdefault(slug, {})["instagram"] = ig_outcome
                    save_state(state)
                append_log(
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "platform": "instagram",
                        "slug": slug,
                        "post_id": ig_post_id,
                        "platform_post_id": ig_platform_id,
                        "tagged_handles": handles,
                    },
                    args.dry_run,
                )

        if "x" in platforms:
            if "x" in platform_outcomes:
                pass
            else:
                saved_x = slug_partial.get("x", {})
                thread_records: list[dict] = list(saved_x.get("thread", []))
                parent_platform_id: str | None = (
                    thread_records[-1]["platform_post_id"] if thread_records else None
                )
                cover_media_id: str | None = saved_x.get("cover_media_id")
                start_idx = len(thread_records) + 1

                for idx, tweet_text in enumerate(x_thread[start_idx - 1 :], start=start_idx):
                    if idx == 1 and not cover_media_id:
                        cover_media_id = upload_image(slide_paths[0], args.dry_run)
                        if not args.dry_run:
                            partial_map.setdefault(slug, {}).setdefault("x", {})["cover_media_id"] = cover_media_id
                            save_state(state)
                    t_media = [cover_media_id] if idx == 1 and cover_media_id else None
                    t_post_id, t_created = create_platform_post(
                        "x",
                        tweet_text,
                        t_media,
                        args.dry_run,
                        in_reply_to_post_id=parent_platform_id,
                    )
                    t_res = poll_post_results(t_post_id, args.dry_run)
                    t_platform_id = extract_platform_post_id("x", t_created, t_res)
                    if not t_platform_id:
                        raise RuntimeError(
                            f"Could not determine published X platform_post_id for tweet {idx} (post_id={t_post_id})"
                        )
                    rec = {
                        "thread_index": idx,
                        "post_id": t_post_id,
                        "platform_post_id": t_platform_id,
                        "text": tweet_text,
                    }
                    thread_records.append(rec)
                    parent_platform_id = t_platform_id
                    if not args.dry_run:
                        partial_map.setdefault(slug, {})["x"] = {
                            "cover_media_id": cover_media_id,
                            "thread": thread_records,
                        }
                        save_state(state)
                    append_log(
                        {
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "platform": "x",
                            "slug": slug,
                            "thread_index": idx,
                            "post_id": t_post_id,
                            "platform_post_id": t_platform_id,
                        },
                        args.dry_run,
                    )
                    if not args.dry_run:
                        time.sleep(1)

                platform_outcomes["x"] = {
                    "root_post_id": thread_records[0]["post_id"],
                    "root_platform_post_id": thread_records[0]["platform_post_id"],
                    "thread": thread_records,
                }

        if not args.dry_run:
            prev_platforms = posted_map.get(slug, {}).get("platforms", {})
            merged_platforms = dict(prev_platforms)
            for k, v in platform_outcomes.items():
                merged_platforms[k] = {
                    "post_id": v.get("post_id") or v.get("root_post_id"),
                    "platform_post_id": v.get("platform_post_id") or v.get("root_platform_post_id"),
                }
            posted_map[slug] = {
                "posted_at": datetime.now(timezone.utc).isoformat(),
                "title": meta.get("title"),
                "platforms": merged_platforms,
            }
            partial_map.pop(slug, None)
            save_state(state)

        run_results.append({
            "slug": slug,
            "title": meta.get("title"),
            "accounts": health,
            "platforms": platform_outcomes,
        })

    print(json.dumps({"dry_run": args.dry_run, "posted_count": len(run_results), "results": run_results}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
