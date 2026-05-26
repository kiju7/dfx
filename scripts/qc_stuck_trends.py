#!/usr/bin/env python3
"""QC STUCK trend analyzer.

Parses `_workspace/<run-id>/04-qc/iter-<N>.json` QC iteration files across runs,
reconstructs the "STUCK" pattern (a finding that re-appears in two *consecutive*
iterations within the same run, i.e. stays unresolved), and prints a text table
of which `category` ends up STUCK most often.

STUCK is NOT stored in the JSON; it is reconstructed here from re-appearance
across consecutive iterations. See `compute_stuck_findings` for the rules.

Standard library only.
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict

# iter-<N>.json — N is an integer iteration counter (iter-0 = initial QC,
# iter-N = Ralph iteration N). We sort by the integer N, not lexically, so
# iter-2 sorts before iter-10.
ITER_RE = re.compile(r"^iter-(\d+)\.json$")


def parse_iter_number(filename):
    """Return the integer N from 'iter-<N>.json', or None if it doesn't match."""
    m = ITER_RE.match(filename)
    if m is None:
        return None
    return int(m.group(1))


def normalize_title(title):
    """Normalize a finding title for identity matching.

    strip + lowercase only: titles authored by different QC agents / iterations
    may differ in surrounding whitespace or casing while describing the same
    issue; we deliberately avoid heavier normalization (punctuation/whitespace
    collapsing) to keep matches conservative and predictable.
    """
    return (title or "").strip().lower()


def file_part(location):
    """Extract the file path from a 'path:line' location string.

    `location.rsplit(':', 1)[0]` drops a trailing ':<line>'. If location is the
    empty string (cross-cutting finding with no file) we return "" so the caller
    can skip the file-based identity key.
    """
    loc = (location or "").strip()
    if not loc:
        return ""
    return loc.rsplit(":", 1)[0]


def normalize_finding(finding):
    """Validate + normalize a single finding (untrusted input) in ONE place.

    A QC file can be valid JSON yet structurally corrupt. Earlier versions
    validated field-by-field (title/location as str, category only as
    *hashable*) — which let the gap migrate from one field to the next across
    Ralph iterations: a non-str title was caught but a null/int/bool category
    sailed through `hash()` and then crashed (or rendered garbage) downstream.

    Root fix: validate ALL fields that the STUCK aggregation + table render
    actually consume — category, title, location, severity — together, and
    return a *normalized* finding so every consumer downstream can trust the
    types of its own data (경계 검증: 안쪽에서는 자기 타입을 신뢰).

    Contract (the '깨진 입력 경고 + skip' rule applies per finding, not per run):
      - finding must be a dict                       -> else None (skip)
      - category: str, with None -> 'other' fallback;
                  any non-str non-None category      -> None (skip)
      - title:    str or None                        -> else None (skip)
      - location: str or None                        -> else None (skip)
      - severity: str or None                        -> else None (skip)

    Returns the normalized dict (safe to use everywhere) or None if invalid.
    """
    if not isinstance(finding, dict):
        return None

    category = finding.get("category", "other")
    if category is None:
        category = "other"
    elif not isinstance(category, str):
        # null/int/bool/list/dict category — the field the loop kept missing.
        # Force str-only so it is safe as a dict/set key AND as a table cell.
        return None

    title = finding.get("title")
    if title is not None and not isinstance(title, str):
        return None

    location = finding.get("location")
    if location is not None and not isinstance(location, str):
        return None

    severity = finding.get("severity")
    if severity is not None and not isinstance(severity, str):
        return None

    return {
        "category": category,
        "title": title,
        "location": location,
        "severity": severity,
    }


def finding_identity_keys(finding):
    """Identity keys for a finding.

    A finding's identity is "title OR file+category". We emit up to two keys and
    consider two findings 'the same' if they share *either* key:
      - ('title', normalized_title, category)
      - ('file',  file_part(location), category)   (skipped when no file)

    Tagging each key with its kind ('title'/'file') prevents an empty/short
    title from colliding with a file path that happens to be equal.
    """
    category = finding.get("category", "other")
    keys = set()

    ntitle = normalize_title(finding.get("title"))
    if ntitle:
        keys.add(("title", ntitle, category))

    fpart = file_part(finding.get("location"))
    if fpart:
        keys.add(("file", fpart, category))

    return keys


def load_run_iterations(run_dir):
    """Load all iter-*.json for one run.

    Returns a list of (iter_number, findings_list) sorted by integer iter_number.
    Broken JSON files emit a stderr warning and are skipped (no crash).
    """
    qc_dir = os.path.join(run_dir, "04-qc")
    if not os.path.isdir(qc_dir):
        return []

    # os.listdir can raise OSError (unreadable/perm-denied dir, or a TOCTOU
    # delete after the isdir check above). Same '깨진 입력 → stderr 경고 + skip'
    # contract as the per-file read below: warn + skip this whole run, never
    # crash the CLI (불변식: 어떤 깨진 입력도 크래시 0).
    try:
        entries = os.listdir(qc_dir)
    except OSError as exc:
        print(f"warning: skipping unreadable QC dir {qc_dir}: {exc}",
              file=sys.stderr)
        return []

    iterations = []
    for entry in entries:
        n = parse_iter_number(entry)
        if n is None:
            continue
        path = os.path.join(qc_dir, entry)
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        # OSError: unreadable file. ValueError: malformed JSON. RecursionError:
        # deeply-nested JSON blows the parser's stack (RecursionError subclasses
        # RuntimeError, so it is NOT a ValueError). All three are per-file
        # failures of untrusted input — warn + skip this one file, never crash
        # the whole CLI (the '깨진 JSON → stderr 경고 + skip' contract).
        except (OSError, ValueError, RecursionError) as exc:
            print(f"warning: skipping unreadable QC file {path}: {exc}",
                  file=sys.stderr)
            continue

        findings = data.get("findings") if isinstance(data, dict) else None
        if not isinstance(findings, list):
            print(f"warning: skipping QC file with no findings list {path}",
                  file=sys.stderr)
            continue

        iterations.append((n, findings))

    iterations.sort(key=lambda pair: pair[0])
    return iterations


def discover_runs(workspace, run_filter=None):
    """Yield (run_id, run_dir) for each run directory under the workspace."""
    if not os.path.isdir(workspace):
        return []
    # os.listdir can raise OSError (unreadable workspace, or a TOCTOU delete
    # after the isdir check). Warn + treat as no runs so analyze() yields a
    # graceful '데이터 없음' exit 0 instead of a traceback (불변식: 크래시 0).
    try:
        entries = os.listdir(workspace)
    except OSError as exc:
        print(f"warning: cannot read workspace dir {workspace}: {exc}",
              file=sys.stderr)
        return []
    runs = []
    for entry in sorted(entries):
        if run_filter is not None and entry != run_filter:
            continue
        run_dir = os.path.join(workspace, entry)
        if os.path.isdir(run_dir):
            runs.append((entry, run_dir))
    return runs


def compute_stuck_for_run(iterations):
    """Reconstruct STUCK findings for a single run, in DISTINCT-FINDING units.

    Metric redefinition (root fix for STUCK% unit mismatch)
    -------------------------------------------------------
    The earlier metric mixed units: the numerator counted adjacent-iter *pair
    occurrences* (a finding unresolved across K iters contributed K-1) while the
    denominator counted per-iter *instances* (the same finding contributed K).
    A single never-fixed finding therefore read as e.g. 3/4 = 75%, which is
    nonsense for the user's actual question — "어떤 category 가 자주 STUCK 으로
    끝나는지" / which category tends to *end up* stuck.

    Both sides are now counted in the SAME unit: the distinct finding. A
    "distinct finding" is one logical issue tracked across the run via its
    identity keys (title / file+category), unioned across iterations. Then:
      - DENOMINATOR (category_totals): number of distinct non-nit findings of
        that category seen anywhere in the run.
      - NUMERATOR  (stuck_finding_categories): one entry per distinct finding
        that ended up STUCK (appeared in >=2 *consecutive* iterations). A
        finding stuck across K iters counts once, not K-1 times.
    So a lone unresolved finding now reads 1 / 1 = 100%, and "1 of 2 distinct
    findings ended up stuck" reads 50% — directly answering the user's question.

    nit-severity findings are excluded from STUCK consideration entirely.

    Returns:
      stuck_finding_categories: list of category — one entry per distinct
                                finding that ended up STUCK in this run.
      category_totals:          dict category -> number of distinct non-nit
                                findings of that category in this run.
      nit_count:                number of nit finding instances (reference only).
    """
    nit_count = 0

    # --- Union identity keys into distinct findings across the whole run. ---
    # Each non-nit finding contributes 1..2 identity keys (title-key, file-key).
    # Keys that co-occur on one finding, OR that recur across iterations, denote
    # the same logical finding. We union them so K re-appearances collapse to 1
    # distinct finding. parent: key -> representative key (union-find).
    parent = {}

    def find(k):
        parent.setdefault(k, k)
        root = k
        while parent[root] != root:
            root = parent[root]
        while parent[k] != root:  # path compression
            parent[k], k = root, parent[k]
        return root

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    key_category = {}          # identity key -> category (str)
    per_iter_keys = []         # list of set(keys) present in each iteration

    for _, findings in iterations:
        iter_keys = set()
        for gid, raw in enumerate(findings):
            f = normalize_finding(raw)
            if f is None:
                print("warning: skipping structurally invalid finding "
                      f"(index {gid}): {raw!r}", file=sys.stderr)
                continue
            if f.get("severity") == "nit":
                nit_count += 1
                continue
            category = f["category"]
            keys = finding_identity_keys(f)
            if not keys:
                # No usable identity (no title and no file) — cannot track this
                # finding across iters; count it as its own distinct finding via
                # a unique synthetic key so the denominator still includes it.
                keys = {("anon", id(raw), category)}
            klist = list(keys)
            first = klist[0]
            for k in klist:
                key_category.setdefault(k, category)
                union(first, k)
                iter_keys.add(k)
        per_iter_keys.append(iter_keys)

    # DENOMINATOR: distinct findings per category = distinct union roots, each
    # attributed to its category. (All keys in one component share a category
    # because category is part of every identity key, so the root's category is
    # well-defined.)
    category_totals = defaultdict(int)
    root_category = {}
    for k in list(parent.keys()):
        r = find(k)
        if r not in root_category:
            root_category[r] = key_category[r]
    for r, category in root_category.items():
        category_totals[category] += 1

    # NUMERATOR: a distinct finding is STUCK if any of its keys appears in two
    # *consecutive* iterations (iter numbers differ by exactly 1). We collect
    # the set of stuck union-roots, then emit one category per stuck finding.
    stuck_roots = set()
    for idx in range(len(iterations) - 1):
        if iterations[idx + 1][0] - iterations[idx][0] != 1:
            continue  # gap in iter sequence — not consecutive
        shared = per_iter_keys[idx] & per_iter_keys[idx + 1]
        for k in shared:
            stuck_roots.add(find(k))

    stuck_finding_categories = [root_category[r] for r in stuck_roots]

    return stuck_finding_categories, category_totals, nit_count


def aggregate(runs_data):
    """Aggregate per-category STUCK stats across all runs.

    runs_data: list of
      (run_id, stuck_finding_categories, category_totals, nit_count).

    All counts are in DISTINCT-FINDING units (see compute_stuck_for_run):

      category -> {
        'stuck_count': number of distinct findings that ended up STUCK
                       (summed across runs),
        'stuck_runs':  number of distinct runs in which this category went STUCK,
        'total':       number of distinct non-nit findings of this category
                       (summed across runs) — the STUCK% denominator,
      }
    plus global nit_count. Because numerator and denominator are now the same
    unit, stuck_count <= total always holds and STUCK% <= 100%.
    """
    stats = defaultdict(lambda: {"stuck_count": 0, "stuck_runs": 0, "total": 0})
    total_nit = 0

    for _run_id, stuck_finding_categories, category_totals, nit_count in runs_data:
        total_nit += nit_count

        for category, total in category_totals.items():
            stats[category]["total"] += total

        runs_categories = set()
        for category in stuck_finding_categories:
            stats[category]["stuck_count"] += 1
            runs_categories.add(category)
        for category in runs_categories:
            stats[category]["stuck_runs"] += 1

    return stats, total_nit


def render_table(stats, total_nit):
    """Render the aggregated stats as a sorted fixed-width text table.

    Sorted by STUCK count descending (ties broken by category name).
    """
    rows = []
    for category, s in stats.items():
        total = s["total"]
        ratio = (s["stuck_count"] / total * 100.0) if total else 0.0
        rows.append((category, s["stuck_count"], s["stuck_runs"], total, ratio))

    rows.sort(key=lambda r: (-r[1], r[0]))

    headers = ("CATEGORY", "STUCK", "RUNS", "TOTAL", "STUCK%")
    aligns = ("l", "r", "r", "r", "r")

    # Materialize every cell as a string first, then derive each column's width
    # from the widest cell (header + data) so a long category name can no longer
    # overrun a fixed width and break the alignment of later columns.
    # str() the category cell too (not just the numeric cells) as a last-ditch
    # safety net: normalize_finding already guarantees str categories upstream,
    # but wrapping here means any residual non-str value can never crash the
    # width/len computation below (목표: 깨진 입력으로 인한 크래시 0).
    str_rows = [
        (str(category), str(stuck), str(stuck_runs), str(total), f"{ratio:.1f}")
        for category, stuck, stuck_runs, total, ratio in rows
    ]
    ncols = len(headers)
    widths = []
    for col in range(ncols):
        cell_lens = [len(headers[col])] + [len(r[col]) for r in str_rows]
        widths.append(max(cell_lens))

    def fmt_row(cells):
        parts = []
        for cell, width, align in zip(cells, widths, aligns):
            text = str(cell)
            parts.append(text.ljust(width) if align == "l" else text.rjust(width))
        return "  ".join(parts).rstrip()

    lines = []
    lines.append("QC STUCK trend by category (STUCK = finding re-appearing in "
                 "consecutive iterations)")
    # Define STUCK% explicitly. Numerator and denominator are BOTH in
    # distinct-finding units, so the ratio reads as "share of this category's
    # findings that ended up stuck" and is always <= 100%.
    lines.append("STUCK = distinct findings that ended up STUCK; "
                 "RUNS = distinct runs in which this category ended up STUCK; "
                 "TOTAL = distinct non-nit findings; "
                 "STUCK% = STUCK / TOTAL of that category")
    lines.append("")
    lines.append(fmt_row(headers))
    lines.append("  ".join("-" * w for w in widths))
    for row in str_rows:
        lines.append(fmt_row(row))
    lines.append("")
    lines.append(f"(nit findings excluded from STUCK; nit count for reference: "
                 f"{total_nit})")
    return "\n".join(lines)


def analyze(workspace, run_filter=None):
    """Run the full analysis. Returns (report_text, had_data: bool)."""
    runs = discover_runs(workspace, run_filter=run_filter)

    runs_data = []
    any_iterations = False
    for run_id, run_dir in runs:
        iterations = load_run_iterations(run_dir)
        if iterations:
            any_iterations = True
        stuck_finding_categories, category_totals, nit_count = \
            compute_stuck_for_run(iterations)
        runs_data.append(
            (run_id, stuck_finding_categories, category_totals, nit_count))

    stats, total_nit = aggregate(runs_data)

    # "데이터 없음" only when NO iterations were loaded at all. If iterations
    # loaded but `stats` is empty (e.g. every finding is a nit), that is still
    # real data: render the table so it reports STUCK 0 + the nit count, per the
    # nit_count-별도-표기 intent. Empty `stats` -> empty rows + nit caption.
    if not any_iterations:
        return ("분석할 QC iteration 데이터 없음 "
                f"(workspace='{workspace}'"
                + (f", run='{run_filter}'" if run_filter else "")
                + ").", False)

    return render_table(stats, total_nit), True


def build_arg_parser():
    parser = argparse.ArgumentParser(
        description="Aggregate QC STUCK trends from _workspace iteration JSON.")
    parser.add_argument(
        "--workspace", default="_workspace",
        help="workspace directory to scan for */04-qc/iter-*.json "
             "(default: _workspace)")
    parser.add_argument(
        "--run", dest="run", default=None,
        help="only analyze the given run-id (directory name under workspace)")
    return parser


def main(argv=None):
    args = build_arg_parser().parse_args(argv)
    report, _had_data = analyze(args.workspace, run_filter=args.run)
    print(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
