#!/usr/bin/env python3
"""Unit tests for scripts/social/post-blog-to-social.py."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent / "post-blog-to-social.py"
spec = importlib.util.spec_from_file_location("post_blog_to_social", SCRIPT_PATH)
assert spec and spec.loader
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class PostBlogToSocialTests(unittest.TestCase):
    def test_markdown_table_is_never_treated_as_raw_pipe_paragraph(self) -> None:
        meta = {
            "slug": "test-table-post",
            "title": "Test Table Post",
            "author": "Marcus Webb",
            "description": "Short summary.",
            "body": (
                "Opening direct answer paragraph for older skaters.\n\n"
                "## Section With Prose and Table\n\n"
                "First prose paragraph explaining the mechanical setup.\n\n"
                "| Wheel Diameter | Pad Thickness | Bolts |\n"
                "|---|---|---|\n"
                "| 54mm | 1/8 inch | 1 inch |\n"
                "| 58mm | 1/4 inch | 1 1/4 inch |\n\n"
                "Second prose paragraph after the table.\n\n"
                "## Section With Only Table\n\n"
                "| Solvent | Water Content | Verdict |\n"
                "|---|---|---|\n"
                "| 99% IPA | 1% | Best winter flush |\n"
                "| 70% IPA | 30% | Avoid flash rust |\n"
            ),
        }
        parsed = mod.extract_structured_content(meta)
        self.assertEqual(len(parsed["sections"]), 2)

        sec1 = parsed["sections"][0]
        self.assertEqual(len(sec1["paragraphs"]), 2)
        for p in sec1["paragraphs"]:
            self.assertNotIn("|", p)

        sec2 = parsed["sections"][1]
        self.assertEqual(len(sec2["paragraphs"]), 0)
        self.assertEqual(len(sec2["subpoints"]), 2)
        self.assertEqual(sec2["subpoints"][0]["title"], "99% IPA")
        self.assertIn("Water Content: 1%", sec2["subpoints"][0]["body"])
        self.assertNotIn("|", sec2["subpoints"][0]["body"])

        caption = mod.build_instagram_caption(meta, parsed, ["@35thnorth"])
        self.assertNotIn("|", caption)
        self.assertIn("@35thnorth", caption)

        thread = mod.build_x_thread(meta, parsed)
        for tweet in thread:
            self.assertNotIn("|", tweet)

    def test_table_after_h3_does_not_pollute_subpoint_body(self) -> None:
        meta = {
            "slug": "test-h3-table",
            "title": "Test H3 Table",
            "author": "Jo Fairweather",
            "body": (
                "Intro paragraph.\n\n"
                "## Main Section\n\n"
                "### 1. First Subpoint\n\n"
                "Subpoint explanation sentence.\n\n"
                "| Col A | Col B |\n"
                "|---|---|\n"
                "| A1 | B1 |\n\n"
                "Trailing section paragraph after table.\n"
            ),
        }
        parsed = mod.extract_structured_content(meta)
        sec = parsed["sections"][0]
        self.assertEqual(len(sec["subpoints"]), 1)
        self.assertEqual(sec["subpoints"][0]["body"], "Subpoint explanation sentence.")
        self.assertEqual(sec["paragraphs"], ["Trailing section paragraph after table."])

    def test_real_new_blog_posts_produce_pipe_free_captions_and_threads(self) -> None:
        slugs = [
            "skateboard-riser-pads-vs-shock-pads-older-skaters",
            "skateboard-deck-concave-mellow-vs-steep-older-skaters",
            "cleaning-skateboard-bearings-damp-winter-sessions",
            "choosing-a-local-skate-shop-older-returning-skater",
            "skateboarding-after-meniscus-tear-knee-surgery",
        ]
        for slug in slugs:
            path = mod.BLOG_DIR / f"{slug}.md"
            meta = mod.parse_markdown_post(path)
            parsed = mod.extract_structured_content(meta)
            handles = mod.extract_directory_handles(meta["body"])
            caption = mod.build_instagram_caption(meta, parsed, handles)
            thread = mod.build_x_thread(meta, parsed)

            self.assertNotIn("|", caption, f"Raw pipe found in Instagram caption for {slug}")
            for tweet in thread:
                self.assertNotIn("|", tweet, f"Raw pipe found in X thread for {slug}")
                self.assertLessEqual(len(tweet), 275, f"Tweet exceeds 275 chars ({len(tweet)}) for {slug}: {tweet}")
            for sec in parsed["sections"]:
                for p in sec["paragraphs"]:
                    self.assertNotIn("|", p, f"Raw pipe found in paragraph of {slug}")
                for sp in sec["subpoints"]:
                    self.assertNotIn("|", sp["title"], f"Raw pipe found in subpoint title of {slug}")
                    self.assertNotIn("|", sp["body"], f"Raw pipe found in subpoint body of {slug}")


if __name__ == "__main__":
    unittest.main()
