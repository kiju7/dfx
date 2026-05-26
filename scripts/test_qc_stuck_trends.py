#!/usr/bin/env python3
"""Unit tests for qc_stuck_trends — synthetic fixtures via tempfile.

Run: python3 -m unittest   (from repo root or scripts/)
"""

import json
import os
import tempfile
import unittest

import qc_stuck_trends as mod


def write_iter(qc_dir, n, findings):
    os.makedirs(qc_dir, exist_ok=True)
    path = os.path.join(qc_dir, f"iter-{n}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump({"findings": findings}, fh)
    return path


def finding(category="api", severity="major", title="t", location="src/a.py:1"):
    return {
        "category": category,
        "severity": severity,
        "title": title,
        "location": location,
        "detail_md": "...",
        "tags": [],
    }


class StuckReconstructionTest(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.workspace = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def _qc_dir(self, run_id):
        return os.path.join(self.workspace, run_id, "04-qc")

    def test_consecutive_same_title_is_stuck(self):
        # Same title in iter-0 and iter-1 -> STUCK.
        run = self._qc_dir("run-a")
        f = finding(category="api", title="Null pointer on save")
        write_iter(run, 0, [f])
        write_iter(run, 1, [f])
        stats, _ = mod.aggregate([("run-a",) + mod.compute_stuck_for_run(
            mod.load_run_iterations(os.path.join(self.workspace, "run-a")))])
        self.assertEqual(stats["api"]["stuck_count"], 1)
        self.assertEqual(stats["api"]["stuck_runs"], 1)

    def test_consecutive_same_file_category_is_stuck(self):
        # Different titles but same file+category across consecutive iters.
        run = self._qc_dir("run-a")
        write_iter(run, 0, [finding(category="db", title="X", location="m/x.py:10")])
        write_iter(run, 1, [finding(category="db", title="Y", location="m/x.py:99")])
        iters = mod.load_run_iterations(os.path.join(self.workspace, "run-a"))
        stuck, _totals, _nit = mod.compute_stuck_for_run(iters)
        self.assertIn("db", stuck)

    def test_single_iter_finding_not_stuck(self):
        # Appears only in iter-0, gone in iter-1 -> resolved, not STUCK.
        run = self._qc_dir("run-a")
        write_iter(run, 0, [finding(category="api", title="Transient")])
        write_iter(run, 1, [finding(category="api", title="Different",
                                    location="src/z.py:5")])
        iters = mod.load_run_iterations(os.path.join(self.workspace, "run-a"))
        stuck, _totals, _nit = mod.compute_stuck_for_run(iters)
        self.assertEqual(stuck, [])

    def test_nit_excluded_from_stuck(self):
        run = self._qc_dir("run-a")
        f = finding(category="ui", severity="nit", title="spacing")
        write_iter(run, 0, [f])
        write_iter(run, 1, [f])
        iters = mod.load_run_iterations(os.path.join(self.workspace, "run-a"))
        stuck, totals, nit = mod.compute_stuck_for_run(iters)
        self.assertEqual(stuck, [])
        self.assertEqual(nit, 2)
        self.assertNotIn("ui", totals)

    def test_different_runs_same_title_not_merged(self):
        # Same title in run-a iter-0 and run-b iter-0 must NOT count as STUCK.
        ra = self._qc_dir("run-a")
        rb = self._qc_dir("run-b")
        f = finding(category="auth", title="Same title")
        write_iter(ra, 0, [f])
        write_iter(rb, 0, [f])
        # Each run gets a second iter with a different finding so the same title
        # cannot create STUCK; cross-run identical title must not merge either.
        write_iter(ra, 1, [finding(category="auth", title="other a",
                                   location="ra.py:1")])
        write_iter(rb, 1, [finding(category="auth", title="other b",
                                   location="rb.py:1")])
        runs_data = []
        for rid in ("run-a", "run-b"):
            iters = mod.load_run_iterations(os.path.join(self.workspace, rid))
            runs_data.append((rid,) + mod.compute_stuck_for_run(iters))
        stats, _ = mod.aggregate(runs_data)
        # auth category has findings but never STUCK (no consecutive repeat).
        self.assertEqual(stats["auth"]["stuck_count"], 0)

    def test_empty_findings_and_broken_json_skipped(self):
        run = self._qc_dir("run-a")
        write_iter(run, 0, [])  # empty findings
        # broken JSON
        os.makedirs(run, exist_ok=True)
        with open(os.path.join(run, "iter-1.json"), "w", encoding="utf-8") as fh:
            fh.write("{ this is not valid json ")
        # Should not raise.
        iters = mod.load_run_iterations(os.path.join(self.workspace, "run-a"))
        # iter-0 loads (empty), iter-1 broken -> skipped.
        self.assertEqual([n for n, _ in iters], [0])

    def test_integer_iter_ordering(self):
        # iter-2 must sort before iter-10.
        run = self._qc_dir("run-a")
        write_iter(run, 2, [finding(title="a")])
        write_iter(run, 10, [finding(title="b")])
        iters = mod.load_run_iterations(os.path.join(self.workspace, "run-a"))
        self.assertEqual([n for n, _ in iters], [2, 10])
        # 2 and 10 are NOT consecutive (gap) -> no STUCK even if same finding.
        write_iter(run, 3, [finding(title="b")])
        iters = mod.load_run_iterations(os.path.join(self.workspace, "run-a"))
        self.assertEqual([n for n, _ in iters], [2, 3, 10])

    def test_non_adjacent_iters_not_stuck(self):
        # Same finding in iter-0 and iter-2 (gap at 1) -> not consecutive.
        run = self._qc_dir("run-a")
        f = finding(title="gap finding")
        write_iter(run, 0, [f])
        write_iter(run, 2, [f])
        iters = mod.load_run_iterations(os.path.join(self.workspace, "run-a"))
        stuck, _totals, _nit = mod.compute_stuck_for_run(iters)
        self.assertEqual(stuck, [])

    def test_empty_location_skips_file_key(self):
        # Cross-cutting finding with empty location: only title key applies.
        run = self._qc_dir("run-a")
        f0 = finding(category="security", title="CSRF missing", location="")
        f1 = finding(category="security", title="CSRF missing", location="")
        write_iter(run, 0, [f0])
        write_iter(run, 1, [f1])
        iters = mod.load_run_iterations(os.path.join(self.workspace, "run-a"))
        stuck, _totals, _nit = mod.compute_stuck_for_run(iters)
        self.assertIn("security", stuck)

    def test_no_workspace_dir_returns_no_data(self):
        report, had = mod.analyze(os.path.join(self.workspace, "does-not-exist"))
        self.assertFalse(had)
        self.assertIn("데이터 없음", report)

    def test_run_filter(self):
        ra = self._qc_dir("run-a")
        rb = self._qc_dir("run-b")
        f = finding(category="api", title="dup")
        write_iter(ra, 0, [f])
        write_iter(ra, 1, [f])
        write_iter(rb, 0, [finding(category="db", title="other")])
        # Filter to run-a only.
        report, had = mod.analyze(self.workspace, run_filter="run-a")
        self.assertTrue(had)
        self.assertIn("api", report)

    def test_table_sorted_by_stuck_desc(self):
        run = self._qc_dir("run-a")
        # api STUCK twice (two distinct findings), db STUCK once.
        write_iter(run, 0, [
            finding(category="api", title="A", location="x.py:1"),
            finding(category="api", title="B", location="y.py:1"),
            finding(category="db", title="C", location="z.py:1"),
        ])
        write_iter(run, 1, [
            finding(category="api", title="A", location="x.py:2"),
            finding(category="api", title="B", location="y.py:2"),
            finding(category="db", title="C", location="z.py:2"),
        ])
        report, had = mod.analyze(self.workspace)
        self.assertTrue(had)
        api_pos = report.index("api")
        db_pos = report.index("db")
        self.assertLess(api_pos, db_pos)


    # --- regression tests for QC findings ---

    def test_nit_only_data_reports_stuck_zero_not_no_data(self):
        # Finding 1: iterations loaded but every finding is a nit. Must report
        # data (STUCK 0 + nit count), NOT "데이터 없음".
        run = self._qc_dir("run-a")
        f = finding(category="ui", severity="nit", title="spacing")
        write_iter(run, 0, [f])
        write_iter(run, 1, [f])
        report, had = mod.analyze(self.workspace)
        self.assertTrue(had)
        self.assertNotIn("데이터 없음", report)
        # nit count surfaced for reference.
        self.assertIn("nit count for reference: 2", report)

    def test_deeply_nested_json_skipped_not_crash(self):
        # Finding 2: deeply nested JSON raises RecursionError in json.load,
        # which is a RuntimeError subclass (not OSError/ValueError). Must be
        # skipped with a warning, not crash the CLI.
        run = self._qc_dir("run-a")
        write_iter(run, 0, [finding(title="ok")])
        os.makedirs(run, exist_ok=True)
        depth = 200000
        nested = "[" * depth + "]" * depth
        with open(os.path.join(run, "iter-1.json"), "w", encoding="utf-8") as fh:
            fh.write('{"findings": ' + nested + "}")
        # Should not raise.
        iters = mod.load_run_iterations(os.path.join(self.workspace, "run-a"))
        # iter-0 loads, iter-1 (too deep) skipped.
        self.assertEqual([n for n, _ in iters], [0])

    def test_long_category_does_not_break_alignment(self):
        # Finding 3: a category longer than the old fixed width (14) must not
        # overrun and misalign later columns. With dynamic widths, every data
        # row's columns line up under the header columns.
        run = self._qc_dir("run-a")
        long_cat = "a-very-long-category-name-exceeding-fourteen-chars"
        write_iter(run, 0, [finding(category=long_cat, title="A", location="x.py:1")])
        write_iter(run, 1, [finding(category=long_cat, title="A", location="x.py:2")])
        report, had = mod.analyze(self.workspace)
        self.assertTrue(had)
        lines = report.split("\n")
        header_line = next(l for l in lines if l.startswith("CATEGORY"))
        sep_line = lines[lines.index(header_line) + 1]
        data_line = lines[lines.index(header_line) + 2]
        # Separator and data row are at least as wide as the header, and the
        # STUCK column header position is preserved across header/separator.
        self.assertGreaterEqual(len(sep_line), len(header_line) - 2)
        self.assertIn(long_cat, data_line)
        # The "STUCK" header start aligns with the separator dashes block start.
        self.assertEqual(
            header_line.index("STUCK"),
            sep_line.index("-", header_line.index("STUCK")))

    def test_stuck_percent_definition_in_report(self):
        # STUCK% definition must be stated in the output, in the unit-consistent
        # (distinct-finding) wording — not the old occurrences/instances wording.
        run = self._qc_dir("run-a")
        f = finding(category="api", title="A")
        write_iter(run, 0, [f])
        write_iter(run, 1, [f])
        report, _ = mod.analyze(self.workspace)
        self.assertIn("STUCK%", report)
        self.assertIn("STUCK% = STUCK / TOTAL of that category", report)
        self.assertIn("distinct findings that ended up STUCK", report)
        self.assertIn("distinct non-nit findings", report)

    def test_stuck_percent_caption_has_no_meta_note(self):
        # The old caption mixed units, then a meta-warning was bolted on to
        # "explain" the mismatch. Root fix removes BOTH: no meta-warning AND no
        # occurrences/instances unit-mixing left in the caption.
        run = self._qc_dir("run-a")
        f = finding(category="api", title="A")
        write_iter(run, 0, [f])
        write_iter(run, 1, [f])
        report, _ = mod.analyze(self.workspace)
        self.assertNotIn("units differ", report)
        self.assertNotIn("occurrences vs. instances", report)
        self.assertNotIn("STUCK occurrences", report)
        self.assertIn("STUCK% = STUCK / TOTAL of that category", report)

    # --- Cluster 2 (root fix): STUCK% must be unit-consistent. A single
    # finding that stays unresolved across a K-iteration chain is ONE distinct
    # finding that ended up stuck — it must read as 1 (and 1/1 = 100%), never
    # K-1 occurrences over K instances (the old 3/4 = 75% unit mismatch). ---

    def test_single_unresolved_finding_over_long_chain_reads_as_one(self):
        run = self._qc_dir("run-a")
        f = finding(category="api", title="one persistent bug")
        for n in range(4):  # iter 0..3, same finding every time
            write_iter(run, n, [f])
        iters = mod.load_run_iterations(os.path.join(self.workspace, "run-a"))
        stuck, totals, _nit = mod.compute_stuck_for_run(iters)
        # ONE distinct stuck finding, ONE distinct finding total -> not 3, not 4.
        self.assertEqual(stuck.count("api"), 1)
        self.assertEqual(totals["api"], 1)
        stats, _ = mod.aggregate([("run-a", stuck, totals, 0)])
        self.assertEqual(stats["api"]["stuck_count"], 1)
        self.assertEqual(stats["api"]["total"], 1)

    def test_stuck_percent_never_exceeds_100(self):
        # End-to-end: the rendered STUCK% for a long unresolved chain is 100.0,
        # not 75.0 — the unit mismatch is gone.
        run = self._qc_dir("run-a")
        f = finding(category="api", title="persistent")
        for n in range(5):
            write_iter(run, n, [f])
        report, _ = mod.analyze(self.workspace)
        data_line = next(l for l in report.split("\n") if l.startswith("api"))
        self.assertTrue(data_line.rstrip().endswith("100.0"))
        self.assertNotIn("75.0", report)

    def test_one_of_two_distinct_findings_stuck_is_fifty_percent(self):
        # Two distinct findings in a category, only one persists -> 1/2 = 50%.
        run = self._qc_dir("run-a")
        persistent = finding(category="api", title="stuck one", location="p.py:1")
        write_iter(run, 0, [persistent,
                            finding(category="api", title="transient",
                                    location="t.py:1")])
        write_iter(run, 1, [persistent])  # transient resolved
        iters = mod.load_run_iterations(os.path.join(self.workspace, "run-a"))
        stuck, totals, _nit = mod.compute_stuck_for_run(iters)
        self.assertEqual(stuck.count("api"), 1)   # one distinct stuck finding
        self.assertEqual(totals["api"], 2)        # two distinct findings total
        stats, _ = mod.aggregate([("run-a", stuck, totals, 0)])
        ratio = stats["api"]["stuck_count"] / stats["api"]["total"] * 100
        self.assertEqual(ratio, 50.0)

    # --- Cluster 1 (root fix): comprehensive validation. Earlier iterations
    # patched one field at a time (title, then location, then category) and the
    # crash kept migrating to the next un-validated field. This single group
    # exercises EVERY broken-type combo at once and asserts the same two
    # invariants for all of them: (1) zero crashes, (2) the valid run's output
    # is preserved. normalize_finding validates all consumed fields in one place
    # so no future field can slip through. ---

    BROKEN_FINDINGS = [
        ("non_dict_string", "oops"),
        ("non_dict_int", 42),
        ("non_dict_none", None),
        ("non_dict_list", [1, 2]),
        ("category_int", {"category": 5, "title": "t", "location": "a.py:1",
                          "severity": "major"}),
        ("category_bool", {"category": True, "title": "t",
                           "location": "a.py:1", "severity": "major"}),
        ("category_list", {"category": ["a"], "title": "t",
                           "location": "a.py:1", "severity": "major"}),
        ("category_dict", {"category": {"k": "v"}, "title": "t",
                           "location": "a.py:1", "severity": "major"}),
        ("title_list", {"category": "db", "title": ["nope"],
                        "location": "a.py:1", "severity": "major"}),
        ("title_int", {"category": "db", "title": 7, "location": "a.py:1",
                       "severity": "major"}),
        ("location_int", {"category": "db", "title": "t", "location": 123,
                          "severity": "major"}),
        ("location_bool", {"category": "db", "title": "t", "location": False,
                           "severity": "major"}),
        ("severity_int", {"category": "db", "title": "t",
                          "location": "a.py:1", "severity": 9}),
    ]

    def test_every_broken_finding_type_no_crash_valid_output_preserved(self):
        # For each broken-type combo, plus a known-good STUCK finding in the same
        # iter: the pipeline must not crash AND the good "api" finding must still
        # surface as STUCK in the rendered report.
        good = finding(category="api", title="real bug", location="g.py:1")
        for name, bad in self.BROKEN_FINDINGS:
            with self.subTest(case=name):
                with tempfile.TemporaryDirectory() as ws:
                    run = os.path.join(ws, "run-a", "04-qc")
                    write_iter(run, 0, [bad, good])
                    write_iter(run, 1, [bad, good])
                    report, had = mod.analyze(ws)  # must not raise
                    self.assertTrue(had)
                    self.assertIn("api", report)

    def test_null_category_falls_back_to_other_not_skipped(self):
        # category None is NOT corrupt: per contract it falls back to 'other'
        # and the finding is kept (so it can still be tracked as STUCK).
        run = self._qc_dir("run-a")
        f = {"category": None, "title": "no cat", "location": "n.py:1",
             "severity": "major"}
        write_iter(run, 0, [f])
        write_iter(run, 1, [f])
        report, had = mod.analyze(self.workspace)
        self.assertTrue(had)
        self.assertIn("other", report)

    def test_corrupt_categories_never_reach_table(self):
        # Bogus categories (list/dict/int/bool) must never be rendered as a row.
        run = self._qc_dir("run-a")
        rows = [
            {"category": ["x"], "title": 5, "location": "a.py:1"},
            {"category": {"k": 1}, "title": "t", "location": "b.py:1"},
            {"category": 99, "title": "t", "location": "c.py:1"},
            {"category": True, "title": "t", "location": "d.py:1"},
            "oops",
        ]
        write_iter(run, 0, rows + [finding(category="api", title="ok")])
        write_iter(run, 1, rows + [finding(category="api", title="ok")])
        report, had = mod.analyze(self.workspace)  # no raise
        self.assertTrue(had)
        self.assertIn("api", report)
        # None of the corrupt categories leak into the rendered table.
        self.assertNotIn("'x'", report)
        self.assertNotIn("[", report)
        self.assertNotIn("{", report)
        self.assertNotIn("True", report)

    def test_render_table_str_wraps_residual_non_str_category(self):
        # Safety net: even if a non-str category somehow reaches render_table
        # (bypassing normalize_finding), str()-wrapping the cell prevents the
        # len()/width crash that bit iter2.
        stats = {
            5: {"stuck_count": 1, "stuck_runs": 1, "total": 1},
            True: {"stuck_count": 1, "stuck_runs": 1, "total": 1},
            None: {"stuck_count": 0, "stuck_runs": 0, "total": 1},
        }
        out = mod.render_table(stats, 0)  # must not raise
        self.assertIn("CATEGORY", out)

    def test_unreadable_dir_skipped_valid_run_output_preserved(self):
        # Finding 1: a chmod 000 (unreadable) directory under the workspace must
        # not crash the CLI. os.listdir on it raises OSError (PermissionError);
        # that dir is warned + skipped while the valid run's output is preserved
        # and the CLI still exits 0. tearDown restores perms so cleanup works.
        good_run = self._qc_dir("run-good")
        f = finding(category="api", title="real bug", location="g.py:1")
        write_iter(good_run, 0, [f])
        write_iter(good_run, 1, [f])

        # Unreadable run dir: its 04-qc cannot be listed.
        bad_qc = self._qc_dir("run-bad")
        os.makedirs(bad_qc, exist_ok=True)
        self._chmod_restore = bad_qc
        os.chmod(bad_qc, 0o000)
        try:
            report, had = mod.analyze(self.workspace)  # must not raise
        finally:
            os.chmod(bad_qc, 0o755)  # restore so tearDown can clean up
        self.assertTrue(had)
        self.assertIn("api", report)  # valid run output preserved

    def test_unreadable_workspace_graceful_no_data_no_crash(self):
        # Finding 1: if the workspace dir itself is unlistable, discover_runs
        # must warn + return no runs -> "데이터 없음" graceful exit, never crash.
        ws = os.path.join(self.workspace, "locked-ws")
        os.makedirs(ws, exist_ok=True)
        os.chmod(ws, 0o000)
        try:
            report, had = mod.analyze(ws)  # must not raise
        finally:
            os.chmod(ws, 0o755)
        self.assertFalse(had)
        self.assertIn("데이터 없음", report)

    def test_runs_column_defined_in_caption(self):
        # Finding 2: the RUNS column must be defined in the caption so it is not
        # misread as (or confused with) the STUCK count.
        run = self._qc_dir("run-a")
        f = finding(category="api", title="A")
        write_iter(run, 0, [f])
        write_iter(run, 1, [f])
        report, _ = mod.analyze(self.workspace)
        self.assertIn("RUNS =", report)

    def test_normalize_finding_contract(self):
        # Unit-level: one validator covers all consumed fields consistently.
        self.assertIsNone(mod.normalize_finding("x"))
        self.assertIsNone(mod.normalize_finding(5))
        self.assertIsNone(mod.normalize_finding(None))
        self.assertIsNone(mod.normalize_finding({"category": ["a"]}))
        self.assertIsNone(mod.normalize_finding({"category": 1}))
        self.assertIsNone(mod.normalize_finding({"category": True}))
        self.assertIsNone(mod.normalize_finding({"title": ["x"]}))
        self.assertIsNone(mod.normalize_finding({"location": 1}))
        self.assertIsNone(mod.normalize_finding({"severity": 1}))
        # None category -> 'other' fallback, finding kept.
        self.assertEqual(
            mod.normalize_finding({"category": None})["category"], "other")
        # missing category -> 'other' default.
        self.assertEqual(mod.normalize_finding({})["category"], "other")
        ok = mod.normalize_finding(
            {"category": "api", "title": "t", "location": "a.py:1",
             "severity": "major"})
        self.assertEqual(ok["category"], "api")


if __name__ == "__main__":
    unittest.main()
