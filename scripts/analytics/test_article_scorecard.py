"""Fixture tests for article_scorecard.py. No network, no credentials.

Run: python3 -m unittest discover -s scripts/analytics -p 'test_*.py'
"""

import datetime as dt
import json
import sys
import tempfile
import unittest
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import article_scorecard as sc  # noqa: E402

NY = ZoneInfo("America/New_York")
ARTICLES = [
    {"slug": "alpha-post", "title": "Alpha", "author": "Ann", "tags": ["gear", "safety"], "pubDate": "2026-01-01"},
    {"slug": "beta-post", "title": "Beta", "author": "Ann", "tags": ["gear"], "pubDate": "2026-10-18"},
    {"slug": "gamma-post", "title": "Gamma", "author": "Bo", "tags": ["safety"], "pubDate": "2026-02-01"},
]
WIN = {"days": 7, "start": "2026-10-14", "end": "2026-10-20"}
COMPLETE = {"version": "1", "deployment_date": "2026-10-01", "completeness": "complete", "evidence": "verified"}


def row(dims, mets):
    return {"dimensionValues": [{"value": d} for d in dims], "metricValues": [{"value": str(m)} for m in mets]}


def raw(pages=(), events=(), sitewide=(), hosts=(), users=None):
    return {
        "pages": list(pages), "events": list(events), "sitewide": list(sitewide), "hosts": list(hosts),
        "article_users": [row([], [users])] if users is not None else [],
    }


class FakeResp:
    def __init__(self, status, payload=None, text=""):
        self.status_code, self._payload, self.text = status, payload, text

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


class FakeSession:
    """Serves runReport pages from a list of rows, honouring limit/offset."""

    def __init__(self, rows_by_report=None, meta=None, tz="America/New_York", metadata=None, fail=None):
        self.rows_by_report = rows_by_report or {}
        self.meta = meta or {}
        self.tz = tz
        self.calls = []
        self.fail = fail
        self.metadata_payload = metadata or {
            "dimensions": [{"apiName": n} for n in ("pagePath", "eventName", "hostName", "customEvent:foo")],
            "metrics": [{"apiName": n} for n in ("screenPageViews", "userEngagementDuration", "totalUsers", "eventCount")],
        }

    def _report_name(self, body):
        dims = [d["name"] for d in body.get("dimensions", [])]
        if dims == ["pagePath"]:
            return "pages"
        if dims == ["pagePath", "eventName"]:
            return "events"
        if dims == ["eventName"]:
            return "sitewide"
        if dims == ["hostName"]:
            return "hosts"
        return "article_users"

    def request(self, method, url, timeout=None, json=None):
        self.calls.append((method, url, json))
        if self.fail:
            return self.fail
        if method == "GET":
            return FakeResp(200, self.metadata_payload)
        name = self._report_name(json)
        rows = self.rows_by_report.get(name, [])
        page = rows[json["offset"]: json["offset"] + json["limit"]]
        return FakeResp(200, {"rowCount": len(rows), "rows": page,
                              "metadata": {"timeZone": self.tz, **self.meta.get(name, {})}})


class Dates(unittest.TestCase):
    def test_windows_end_yesterday_in_new_york_not_utc(self):
        # 02:30 UTC on Oct 21 is still Oct 20 in New York, so yesterday is Oct 19.
        now = dt.datetime(2026, 10, 21, 2, 30, tzinfo=dt.timezone.utc)
        w = sc.resolve_windows(now)
        self.assertEqual(w["7d"], {"days": 7, "start": "2026-10-13", "end": "2026-10-19"})
        self.assertEqual(w["28d"]["start"], "2026-09-22")

    def test_dst_boundary_counts_calendar_days(self):
        now = dt.datetime(2026, 11, 2, 12, tzinfo=NY)  # day after DST ends
        w = sc.resolve_windows(now)
        self.assertEqual(w["7d"], {"days": 7, "start": "2026-10-26", "end": "2026-11-01"})

    def test_rejects_incomplete_end_date_and_naive_now(self):
        now = dt.datetime(2026, 10, 21, 12, tzinfo=NY)
        with self.assertRaises(sc.UsageError):
            sc.resolve_windows(now, "2026-10-21")
        with self.assertRaises(sc.UsageError):
            sc.resolve_windows(now, "10/20/2026")
        with self.assertRaises(sc.UsageError):
            sc.resolve_windows(dt.datetime(2026, 10, 21))
        self.assertEqual(sc.resolve_windows(now, "2026-10-01")["7d"]["end"], "2026-10-01")


class Pagination(unittest.TestCase):
    def test_follows_offsets_until_row_count(self):
        rows = [row([f"/blog/p{i}/"], [i, 0, 1]) for i in range(25)]
        s = FakeSession({"pages": rows})
        c = sc.GA4Client(s, page_size=10)
        got = c.run_report("pages", {"dimensions": [{"name": "pagePath"}]})
        self.assertEqual(len(got), 25)
        self.assertEqual([call[2]["offset"] for call in s.calls], [0, 10, 20])

    def test_short_read_is_an_error(self):
        class Short(FakeSession):
            def request(self, method, url, timeout=None, json=None):
                return FakeResp(200, {"rowCount": 5, "rows": [row(["/blog/a/"], [1, 0, 1])] if json["offset"] == 0 else [],
                                      "metadata": {"timeZone": "America/New_York"}})
        with self.assertRaises(sc.ScorecardError):
            sc.GA4Client(Short(), page_size=1).run_report("pages", {})

    def test_wrong_timezone_fails(self):
        with self.assertRaisesRegex(sc.ScorecardError, "timezone"):
            sc.GA4Client(FakeSession(tz="UTC")).run_report("pages", {"dimensions": [{"name": "pagePath"}]})

    def test_sampled_report_fails(self):
        s = FakeSession(meta={"pages": {"samplingMetadatas": [{"samplesReadCount": "10", "samplingSpaceSize": "100"}]}})
        with self.assertRaisesRegex(sc.ScorecardError, "sampled"):
            sc.GA4Client(s).run_report("pages", {"dimensions": [{"name": "pagePath"}]})


class Metadata(unittest.TestCase):
    def test_missing_required_field_fails(self):
        with self.assertRaisesRegex(sc.ScorecardError, "screenPageViews"):
            sc.check_metadata({"dimensions": [{"apiName": "pagePath"}, {"apiName": "eventName"}, {"apiName": "hostName"}],
                               "metrics": [{"apiName": "eventCount"}, {"apiName": "totalUsers"}, {"apiName": "userEngagementDuration"}]})

    def test_reports_registered_custom_dims_but_queries_none(self):
        got = sc.check_metadata(FakeSession().metadata_payload)
        self.assertEqual(got["registered_custom_event_dimensions"], ["customEvent:foo"])
        self.assertEqual(got["custom_dimensions_queried"], [])

    def test_quality_flags(self):
        dq = sc.data_quality([{"report": "pages", "timeZone": "America/New_York", "dataLossFromOtherRow": True},
                              {"report": "events", "timeZone": "America/New_York", "subjectToThresholding": True}])
        self.assertEqual(dq["data_loss_from_other_row_reports"], ["pages"])
        self.assertEqual(dq["thresholded_reports"], ["events"])
        self.assertFalse(dq["complete"])


class Aggregation(unittest.TestCase):
    def test_classify_excludes_index_pagination_and_unlisted(self):
        allow = {"alpha-post"}
        self.assertEqual(sc.classify_path("/blog", allow), ("blog_index", None))
        self.assertEqual(sc.classify_path("/blog/", allow), ("blog_index", None))
        self.assertEqual(sc.classify_path("/blog/3/", allow), ("pagination", None))
        self.assertEqual(sc.classify_path("/blog/alpha-post", allow), ("article", "alpha-post"))
        self.assertEqual(sc.classify_path("/blog/alpha-post/?utm=x", allow), ("article", "alpha-post"))
        self.assertEqual(sc.classify_path("/blog/Alpha-Post/", allow), ("unlisted", None))
        self.assertEqual(sc.classify_path("/blog/secret-draft/", allow), ("unlisted", None))
        self.assertEqual(sc.classify_path("/blog/alpha-post/extra", allow), ("unlisted", None))

    def test_aliases_add_pageviews_but_not_users(self):
        r = raw(pages=[row(["/blog/alpha-post/"], [60, 600, 40]), row(["/blog/alpha-post"], [5, 50, 4]),
                       row(["/blog/gamma-post/"], [10, 100, 7]), row(["/blog/"], [99, 1, 50]), row(["/blog/2/"], [3, 1, 2]),
                       row(["/blog/old-deleted/"], [8, 1, 2])], users=48)
        out = sc.aggregate_window(r, ARTICLES, WIN)
        a = out["articles"]["alpha-post"]["metrics"]
        self.assertEqual(a["pageviews"], sc.measured(65))
        self.assertEqual(a["engagement_seconds_foreground_proxy"]["value"], 650.0)
        self.assertEqual(a["users"]["status"], "unknown")
        self.assertIn("not additive", a["users"]["reason"])
        self.assertEqual(out["articles"]["gamma-post"]["metrics"]["users"], sc.measured(7))
        self.assertEqual(out["excluded_pageviews"], {"blog_index": 99, "pagination": 3, "unlisted": 8})
        self.assertEqual(out["site_article_scope_users"]["value"], 48)

    def test_zero_pageviews_are_measured_zero(self):
        out = sc.aggregate_window(raw(), ARTICLES, WIN)
        b = out["articles"]["beta-post"]
        self.assertEqual(b["metrics"]["pageviews"], sc.measured(0))
        self.assertEqual(b["metrics"]["avg_engagement_seconds_per_pageview_foreground_proxy"]["status"], "unknown")
        self.assertTrue(b["low_traffic"])
        self.assertTrue(b["partial_window"])
        self.assertFalse(out["articles"]["alpha-post"]["partial_window"])

    def test_newsletter_seen_sitewide_is_not_coverage(self):
        r = raw(events=[row(["/blog/alpha-post/", "newsletter_signup_submitted"], [3]),
                        row(["/blog/alpha-post", "newsletter_signup_submitted"], [1])],
                sitewide=[row(["newsletter_signup_submitted"], [9])])
        out = sc.aggregate_window(r, ARTICLES, WIN)
        a = out["articles"]["alpha-post"]["metrics"]["newsletter_submitted"]
        self.assertEqual((a["status"], a["value"], a["observed_lower_bound"]), ("unknown", None, 4))
        g = out["articles"]["gamma-post"]["metrics"]["newsletter_submitted"]
        self.assertEqual((g["status"], g["value"]), ("unknown", None), "absent + unverified coverage is never zero")
        self.assertNotIn("observed_lower_bound", g)
        self.assertEqual(out["articles"]["alpha-post"]["metrics"]["newsletter_confirmed"]["status"], "unknown")
        self.assertEqual(out["observed_sitewide_event_counts"]["values"]["newsletter_signup_submitted"], 9)
        self.assertFalse(out["coverage"]["newsletter_events"])

    def test_newsletter_zero_only_under_verified_coverage(self):
        rollouts = {**sc.DEFAULT_ROLLOUTS, "newsletter_events": COMPLETE}
        r = raw(events=[row(["/blog/alpha-post/", "newsletter_signup_submitted"], [3])])
        out = sc.aggregate_window(r, ARTICLES, WIN, rollouts)
        self.assertEqual(out["articles"]["alpha-post"]["metrics"]["newsletter_submitted"], sc.measured(3))
        self.assertEqual(out["articles"]["gamma-post"]["metrics"]["newsletter_submitted"], sc.measured(0))
        self.assertEqual(out["articles"]["gamma-post"]["metrics"]["meaningful_reads"]["status"], "unknown")
        partial = {**sc.DEFAULT_ROLLOUTS, "newsletter_events": {**COMPLETE, "completeness": "partial"}}
        self.assertEqual(sc.aggregate_window(r, ARTICLES, WIN, partial)["articles"]["gamma-post"]["metrics"]["newsletter_submitted"]["status"], "unknown")

    def test_article_events_unknown_without_rollout_even_if_observed(self):
        r = raw(events=[row(["/blog/alpha-post/", "article_meaningful_read"], [2])],
                sitewide=[row(["article_meaningful_read"], [2])])
        out = sc.aggregate_window(r, ARTICLES, WIN)
        m = out["articles"]["alpha-post"]["metrics"]["meaningful_reads"]
        self.assertEqual((m["status"], m["value"], m["observed_lower_bound"]), ("unknown", None, 2))
        g = out["articles"]["gamma-post"]["metrics"]["meaningful_reads"]
        self.assertEqual((g["status"], g["value"]), ("unknown", None))
        self.assertNotIn("observed_lower_bound", g)

    def test_article_events_measured_once_rollout_covers_window(self):
        rollouts = {**sc.DEFAULT_ROLLOUTS, "article_tracker": COMPLETE}
        out = sc.aggregate_window(raw(events=[row(["/blog/alpha-post/", "article_active_60s"], [4])]), ARTICLES, WIN, rollouts)
        self.assertEqual(out["articles"]["gamma-post"]["metrics"]["completions"], sc.measured(0))
        self.assertEqual(out["articles"]["alpha-post"]["metrics"]["active_60s"], sc.measured(4))
        self.assertEqual(out["articles"]["alpha-post"]["metrics"]["active_120s"], sc.measured(0))
        late = {**sc.DEFAULT_ROLLOUTS, "article_tracker": {**COMPLETE, "deployment_date": "2026-10-16"}}
        self.assertEqual(sc.aggregate_window(raw(), ARTICLES, WIN, late)["articles"]["gamma-post"]["metrics"]["completions"]["status"], "unknown")

    def test_active_time_threshold_metrics_exist_and_are_unknown_pre_rollout(self):
        out = sc.aggregate_window(raw(), ARTICLES, WIN)
        for key in ("active_30s", "active_60s", "active_120s"):
            self.assertEqual(out["articles"]["alpha-post"]["metrics"][key]["status"], "unknown")
            self.assertIn(key, sc.METRIC_DEFINITIONS)

    def test_hostname_includes_apex_and_www_and_classifies_exclusions(self):
        r = raw(hosts=[row(["concretecomeback.com"], [71]), row(["www.concretecomeback.com"], [20]),
                       row(["127.0.0.1"], [290]), row(["localhost"], [7]),
                       row(["cc-app-abc12.ondigitalocean.app"], [2]), row(["evil.example"], [1])])
        h = sc.aggregate_window(r, ARTICLES, WIN)["hostname"]
        self.assertEqual(h["included_blog_pageviews_by_host"], {"concretecomeback.com": 71, "www.concretecomeback.com": 20})
        self.assertEqual(h["included_blog_pageviews"], 91)
        self.assertEqual(h["excluded_blog_pageviews"], 300)
        self.assertEqual(h["excluded_blog_pageviews_by_class"], {"local": 297, "preview": 2, "not_set": 0, "other": 1})
        self.assertEqual(h["excluded_distinct_hosts"], 4)
        blob = json.dumps(h)
        for name in ("127.0.0.1", "localhost", "ondigitalocean", "evil.example"):
            self.assertNotIn(name, blob)

    def test_queries_filter_both_production_hosts(self):
        s = FakeSession()
        sc.fetch_window(sc.GA4Client(s), WIN, ["newsletter_impression"])
        bodies = [json_body for _m, _u, json_body in s.calls]
        host_filters = [b for b in bodies if "hostName" in json.dumps(b.get("dimensionFilter", {}))]
        self.assertEqual(len(host_filters), 4, "every report except the host breakdown filters production hosts")
        for b in host_filters:
            self.assertIn('"values": ["concretecomeback.com", "www.concretecomeback.com"]', json.dumps(b["dimensionFilter"]))
        hosts_report = [b for b in bodies if b.get("dimensions") == [{"name": "hostName"}]][0]
        self.assertNotIn("hostName", json.dumps(hosts_report["dimensionFilter"]))
        for b in bodies:
            self.assertNotIn("customEvent", json.dumps(b))

    def test_groups_sum_additive_only_and_flag_tags_nonadditive(self):
        r = raw(pages=[row(["/blog/alpha-post/"], [60, 600, 40]), row(["/blog/gamma-post/"], [10, 100, 7])])
        win = sc.aggregate_window(r, ARTICLES, WIN)
        g = sc.build_groups(ARTICLES, win, {"alpha-post": "how-to"})
        self.assertEqual(g["author"]["groups"]["Ann"]["pageviews"], sc.measured(60))
        self.assertEqual(g["author"]["groups"]["Ann"]["users"]["status"], "unknown")
        self.assertFalse(g["topic_tag"]["additive"])
        self.assertEqual(g["topic_tag"]["groups"]["safety"]["pageviews"], sc.measured(70))
        self.assertEqual(g["topic_tag"]["groups"]["gear"]["article_count"], 2)
        self.assertEqual(set(g["editorial_angle"]["groups"]), {"how-to", "unclassified"})
        self.assertEqual(g["author"]["groups"]["Ann"]["newsletter_submitted"]["status"], "unknown")
        self.assertTrue(g["author"]["groups"]["Bo"]["low_traffic"])

    def test_groups_carry_reading_and_navigation_metrics(self):
        r = raw(events=[row(["/blog/alpha-post/", "article_read_complete"], [2]),
                        row(["/blog/beta-post/", "article_read_complete"], [1]),
                        row(["/blog/alpha-post/", "article_next_click"], [5])])
        pre = sc.build_groups(ARTICLES, sc.aggregate_window(r, ARTICLES, WIN), {})["author"]["groups"]["Ann"]
        for key in ("active_30s", "active_60s", "active_120s", "meaningful_reads", "completions", "next_article_clicks", "directory_clicks"):
            self.assertEqual(pre[key]["status"], "unknown", key)
        self.assertEqual(pre["completions"]["observed_lower_bound"], 3)
        self.assertEqual(pre["next_article_clicks"]["observed_lower_bound"], 5)
        rollouts = {**sc.DEFAULT_ROLLOUTS, "article_tracker": COMPLETE}
        post = sc.build_groups(ARTICLES, sc.aggregate_window(r, ARTICLES, WIN, rollouts), {})
        self.assertEqual(post["author"]["groups"]["Ann"]["completions"], sc.measured(3))
        self.assertEqual(post["author"]["groups"]["Bo"]["directory_clicks"], sc.measured(0))
        self.assertEqual(post["topic_tag"]["groups"]["gear"]["completions"], sc.measured(3))


class Rollout(unittest.TestCase):
    def write(self, d, data):
        p = Path(d) / "rollout.json"
        p.write_text(json.dumps(data))
        return p

    def base(self, **over):
        return {"schema_version": 1, "article_tracker": dict(sc.UNKNOWN_ROLLOUT), "newsletter_events": dict(sc.UNKNOWN_ROLLOUT), **over}

    def test_repo_default_config_is_valid_and_unknown(self):
        got = sc.load_rollouts(sc.DEFAULT_ROLLOUT, "2026-10-20", sc.tracker_source_version())
        for entry in got.values():
            self.assertEqual((entry["version"], entry["deployment_date"], entry["completeness"], entry["readiness"]),
                             (None, None, "unknown", "unknown"))
        self.assertEqual(sc.tracker_source_version(), "1")

    def test_complete_rollout_accepted(self):
        with tempfile.TemporaryDirectory() as d:
            got = sc.load_rollouts(self.write(d, self.base(article_tracker=COMPLETE)), "2026-10-20", "1")
            self.assertEqual(got["article_tracker"]["readiness"], "ready")
            self.assertTrue(sc.covers(WIN, got["article_tracker"]))

    def test_invalid_configs_rejected(self):
        bad = [
            self.base(schema_version=2),
            self.base(extra=1),
            {"schema_version": 1, "article_tracker": dict(sc.UNKNOWN_ROLLOUT)},
            self.base(article_tracker={**COMPLETE, "completeness": "done"}),
            self.base(article_tracker={**COMPLETE, "deployment_date": "2026-13-01"}),
            self.base(article_tracker={**COMPLETE, "deployment_date": "10/01/2026"}),
            self.base(article_tracker={**COMPLETE, "deployment_date": "2026-10-21"}),  # after end date
            self.base(article_tracker={**COMPLETE, "version": None}),
            self.base(article_tracker={**COMPLETE, "evidence": ""}),
            self.base(article_tracker={**COMPLETE, "version": "2"}),  # != TRACKER_VERSION
            self.base(article_tracker={**COMPLETE, "version": "<script>"}),
            self.base(newsletter_events={**COMPLETE, "surprise": True}),
        ]
        with tempfile.TemporaryDirectory() as d:
            for i, data in enumerate(bad):
                with self.assertRaises(sc.UsageError, msg=str(i)):
                    sc.load_rollouts(self.write(d, data), "2026-10-20", "1")
            p = Path(d) / "broken.json"
            p.write_text("{not json")
            with self.assertRaises(sc.UsageError):
                sc.load_rollouts(p, "2026-10-20", "1")

    def test_bad_rollout_exits_usage_before_any_ga4_call(self):
        with tempfile.TemporaryDirectory() as d:
            man = Path(d) / "m.json"
            man.write_text(json.dumps({"articles": ARTICLES}))
            cfg = self.write(d, self.base(article_tracker={**COMPLETE, "completeness": "yes"}))
            session = FakeSession()
            import contextlib
            import io
            with contextlib.redirect_stderr(io.StringIO()):
                code = sc.main(["--out", str(Path(d) / "out"), "--manifest", str(man), "--rollout", str(cfg)],
                               now=dt.datetime(2026, 10, 21, 9, tzinfo=NY), session_factory=lambda _p: session)
            self.assertEqual(code, sc.EXIT_USAGE)
            self.assertEqual(session.calls, [])


class OutputSafety(unittest.TestCase):
    def test_rejects_public_dist_and_repo_paths(self):
        for bad in ["/var/www/public/x", "/tmp/dist/report", str(sc.REPO_ROOT / "reports"), str(sc.REPO_ROOT)]:
            with self.assertRaises(sc.OutputPathError, msg=bad):
                sc.validate_out_dir(bad)
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(sc.validate_out_dir(d + "/current"), Path(d).resolve() / "current")

    def test_end_to_end_writes_four_files_without_raw_paths(self):
        rows = {
            "pages": [row(["/blog/alpha-post/"], [60, 600, 40]), row(["/blog/private-thing/"], [3, 1, 1]),
                      row(["/blog/alpha-post/?email=a@b.c"], [1, 1, 1])],
            "events": [row(["/blog/alpha-post/", "newsletter_signup_pending"], [1])],
            "sitewide": [row(["newsletter_signup_pending"], [1])],
            "hosts": [row(["concretecomeback.com"], [64]), row(["staging.internal"], [5])],
            "article_users": [row([], [41])],
        }
        with tempfile.TemporaryDirectory() as d:
            man = Path(d) / "m.json"
            man.write_text(json.dumps({"articles": ARTICLES}))
            out = Path(d) / "current"
            out.mkdir()
            (out / "old.txt").write_text("prior")
            now = dt.datetime(2026, 10, 21, 9, tzinfo=NY)
            code = sc.main(["--out", str(out), "--manifest", str(man), "--credentials", "/nonexistent"],
                           now=now, session_factory=lambda _p: FakeSession(rows))
            self.assertEqual(code, 0)
            self.assertEqual(sorted(p.name for p in out.iterdir()), ["scorecard.csv", "scorecard.html", "scorecard.json", "scorecard.md"])
            self.assertTrue((Path(d) / "current.previous" / "old.txt").exists())
            blob = "".join((out / f).read_text() for f in ["scorecard.csv", "scorecard.html", "scorecard.json", "scorecard.md"])
            for leak in ["private-thing", "a@b.c", "staging.internal", "/nonexistent"]:
                self.assertNotIn(leak, blob)
            rep = json.loads((out / "scorecard.json").read_text())
            self.assertEqual(rep["windows"]["7d"]["end"], "2026-10-20")
            for name in ("article_tracker", "newsletter_events"):
                self.assertIsNone(rep["rollouts"][name]["deployment_date"])
                self.assertIsNone(rep["rollouts"][name]["version"])
                self.assertEqual(rep["rollouts"][name]["readiness"], "unknown")
            self.assertIn("UNKNOWN", (out / "scorecard.csv").read_text())
            md = (out / "scorecard.md").read_text()
            self.assertIn("foreground engagement proxy", md)
            for col in ("Completions", "Next-article clicks", "Directory clicks", "Active 60s", "Meaningful"):
                self.assertIn(col, md)
            self.assertIn("UNKNOWN (≥1)", md, "observed newsletter pending shown as a lower bound")
            page = (out / "scorecard.html").read_text()
            for needle in ("By author", "By topic tag", "overlapping", "By editorial angle", "Data complete",
                           "Rollout article_tracker", "Rollout newsletter_events", "excluded: 5", "local 0",
                           "never marked cannot be removed", "Completions", "Directory clicks", "blog_index"):
                self.assertIn(needle, page, needle)

    def test_failed_swap_restores_current_and_previous(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            out = root / "current"
            out.mkdir()
            (out / "scorecard.json").write_text("current")
            prev = root / "current.previous"
            prev.mkdir()
            (prev / "scorecard.json").write_text("older")
            tmp = root / ".current.tmp-x"
            tmp.mkdir()
            (tmp / "scorecard.json").write_text("new")
            real = sc.os.replace

            def flaky(src, dst):
                if Path(src) == tmp:
                    raise OSError("disk full")
                return real(src, dst)

            from unittest import mock
            with mock.patch.object(sc.os, "replace", side_effect=flaky):
                with self.assertRaises(OSError):
                    sc.swap_in(tmp, out)
            self.assertEqual((out / "scorecard.json").read_text(), "current")
            self.assertEqual((prev / "scorecard.json").read_text(), "older")
            self.assertEqual(sorted(p.name for p in root.iterdir()), ["current", "current.previous"])

    def test_failed_swap_without_prior_report_leaves_nothing_half_written(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            tmp = root / ".current.tmp-y"
            tmp.mkdir()
            from unittest import mock
            with mock.patch.object(sc.os, "replace", side_effect=OSError("nope")):
                with self.assertRaises(OSError):
                    sc.swap_in(tmp, root / "current")
            self.assertEqual(list(root.iterdir()), [])

    def test_successful_swap_rotates_previous(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for name, text in (("current", "cur"), ("current.previous", "old"), (".current.tmp-z", "new")):
                (root / name).mkdir()
                (root / name / "f").write_text(text)
            sc.swap_in(root / ".current.tmp-z", root / "current")
            self.assertEqual((root / "current" / "f").read_text(), "new")
            self.assertEqual((root / "current.previous" / "f").read_text(), "cur")
            self.assertEqual(sorted(p.name for p in root.iterdir()), ["current", "current.previous"])

    def test_failure_preserves_prior_report_and_exits_nonzero(self):
        with tempfile.TemporaryDirectory() as d:
            man = Path(d) / "m.json"
            man.write_text(json.dumps({"articles": ARTICLES}))
            out = Path(d) / "current"
            out.mkdir()
            (out / "scorecard.json").write_text("prior")
            fail = FakeResp(403, None, "PERMISSION_DENIED -----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY----- ya29.tok")
            import io
            import contextlib
            err = io.StringIO()
            with contextlib.redirect_stderr(err):
                code = sc.main(["--out", str(out), "--manifest", str(man)],
                               now=dt.datetime(2026, 10, 21, 9, tzinfo=NY), session_factory=lambda _p: FakeSession(fail=fail))
            self.assertEqual(code, sc.EXIT_DATA)
            self.assertEqual((out / "scorecard.json").read_text(), "prior")
            self.assertIn("HTTP 403", err.getvalue())
            self.assertNotIn("abc", err.getvalue())
            self.assertNotIn("ya29.tok", err.getvalue())
            self.assertEqual([p.name for p in Path(d).iterdir() if p.name.startswith(".current.tmp")], [])

    def test_unsafe_out_exit_code(self):
        self.assertEqual(sc.main(["--out", "/srv/public/x"]), sc.EXIT_OUTPUT)


class Exceptions(unittest.TestCase):
    def test_network_exception_is_wrapped(self):
        class Boom:
            def request(self, *a, **k):
                raise ConnectionError("refused")
        with self.assertRaisesRegex(sc.ScorecardError, "ConnectionError"):
            sc.GA4Client(Boom()).metadata()

    def test_non_numeric_metric_fails(self):
        with self.assertRaises(sc.ScorecardError):
            sc.aggregate_window(raw(pages=[row(["/blog/alpha-post/"], ["x", 0, 0])]), ARTICLES, WIN)

    def test_manifest_rejects_unsafe_slug_and_angles_unknown_slug(self):
        with tempfile.TemporaryDirectory() as d:
            m = Path(d) / "m.json"
            m.write_text(json.dumps({"articles": [{**ARTICLES[0], "slug": "../etc"}]}))
            with self.assertRaises(sc.ScorecardError):
                sc.load_manifest("2026-10-20", str(m))
            m.write_text(json.dumps({"articles": []}))
            with self.assertRaises(sc.ScorecardError):
                sc.load_manifest("2026-10-20", str(m))
            a = Path(d) / "a.json"
            a.write_text(json.dumps({"nope": "x"}))
            with self.assertRaises(sc.UsageError):
                sc.load_angles(str(a), {"alpha-post"})

    @unittest.skipUnless(__import__("shutil").which("node"), "node not installed")
    def test_real_manifest_via_node_helper(self):
        arts = sc.load_manifest("2026-10-20")
        self.assertGreater(len(arts), 10)
        self.assertTrue(all(a["pubDate"] <= "2026-10-20" for a in arts))

    def test_missing_google_auth_or_credentials_is_actionable(self):
        with self.assertRaises(sc.ScorecardError):
            sc.make_session("/nonexistent/key.json")


if __name__ == "__main__":
    unittest.main()
