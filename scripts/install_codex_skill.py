#!/usr/bin/env python3
"""Install the repository's DFX skill into Codex's skills directory."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Sequence


SOURCE_SKILL_DIR = Path(__file__).resolve().parents[1] / "codex" / "skills" / "dfx"
SKILL_NAME = "dfx"


def default_skills_dir(environ: dict[str, str] | None = None) -> Path:
    """Return Codex's default skills directory without creating it."""
    environment = os.environ if environ is None else environ
    codex_home = environment.get("CODEX_HOME")
    if codex_home:
        return Path(codex_home).expanduser() / "skills"
    return Path.home() / ".codex" / "skills"


def paths_match(link: Path, source: Path) -> bool:
    """Whether *link* is a symlink whose resolved target is *source*."""
    if not link.is_symlink():
        return False
    try:
        return link.resolve(strict=False) == source.resolve(strict=False)
    except RuntimeError:
        # Path.resolve raises on a symlink cycle. Treat it as a conflicting path
        # so every action preserves it rather than exposing a traceback.
        return False


def link_status(destination: Path, source: Path) -> str:
    """Classify destination as matching, absent, or conflicting."""
    if not os.path.lexists(destination):
        return "absent"
    if paths_match(destination, source):
        return "matching"
    return "mismatch"


def install(source: Path, skills_dir: Path) -> int:
    """Create the DFX skill symlink, preserving every conflicting entry."""
    source = source.resolve(strict=False)
    skill_file = source / "SKILL.md"
    if not skill_file.is_file():
        print(f"error: source skill is missing SKILL.md: {source}", file=sys.stderr)
        return 1

    destination = skills_dir / SKILL_NAME
    status = link_status(destination, source)
    if status == "matching":
        print(f"already installed: {destination} -> {source}")
        return 0
    if status == "mismatch":
        print(f"error: refusing to overwrite existing path: {destination}", file=sys.stderr)
        return 1

    try:
        skills_dir.mkdir(parents=True, exist_ok=True)
        destination.symlink_to(source, target_is_directory=True)
    except OSError as exc:
        print(f"error: could not install {destination}: {exc}", file=sys.stderr)
        return 1
    print(f"installed: {destination} -> {source}")
    return 0


def uninstall(source: Path, skills_dir: Path) -> int:
    """Remove only this installer's matching DFX symlink."""
    destination = skills_dir / SKILL_NAME
    status = link_status(destination, source)
    if status == "absent":
        print(f"not installed: {destination}")
        return 0
    if status != "matching":
        print(f"error: refusing to remove non-matching path: {destination}", file=sys.stderr)
        return 1
    try:
        destination.unlink()
    except OSError as exc:
        print(f"error: could not remove {destination}: {exc}", file=sys.stderr)
        return 1
    print(f"uninstalled: {destination}")
    return 0


def check(source: Path, skills_dir: Path) -> int:
    """Report whether the expected symlink is installed, without writing."""
    destination = skills_dir / SKILL_NAME
    if not (source / "SKILL.md").is_file():
        print(f"not installed (source missing SKILL.md): {destination}")
        return 1
    status = link_status(destination, source)
    if status == "matching":
        print(f"installed: {destination} -> {source.resolve(strict=False)}")
        return 0
    print(f"not installed ({status}): {destination}")
    return 1


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skills-dir", type=Path, help="Codex skills directory to use")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--uninstall", action="store_true", help="remove this skill symlink")
    action.add_argument("--check", action="store_true", help="check this skill symlink")
    return parser.parse_args(argv)


def main(
    argv: Sequence[str] | None = None,
    *,
    source_dir: Path | None = None,
    environ: dict[str, str] | None = None,
) -> int:
    """Run the installer; keyword parameters make the filesystem source testable."""
    args = parse_args(argv)
    source = SOURCE_SKILL_DIR if source_dir is None else Path(source_dir)
    skills_dir = args.skills_dir if args.skills_dir is not None else default_skills_dir(environ)

    if args.uninstall:
        return uninstall(source, skills_dir)
    if args.check:
        return check(source, skills_dir)
    return install(source, skills_dir)


if __name__ == "__main__":
    raise SystemExit(main())
