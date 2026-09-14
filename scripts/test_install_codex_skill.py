#!/usr/bin/env python3
"""Unit tests for install_codex_skill using isolated temporary directories."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_codex_skill as installer


class InstallCodexSkillTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.source = self.root / "source skill"
        self.source.mkdir()
        (self.source / "SKILL.md").write_text("---\nname: dfx\n---\n", encoding="utf-8")
        self.skills = self.root / "skills dir"

    def tearDown(self):
        self.tmp.cleanup()

    @property
    def destination(self):
        return self.skills / "dfx"

    def invoke(self, *args):
        return installer.main(args, source_dir=self.source)

    def test_install_creates_absolute_symlink_with_paths_containing_spaces(self):
        self.assertEqual(self.invoke("--skills-dir", str(self.skills)), 0)
        self.assertTrue(self.destination.is_symlink())
        self.assertEqual(self.destination.resolve(), self.source.resolve())

    def test_install_is_idempotent_for_matching_link(self):
        self.assertEqual(self.invoke("--skills-dir", str(self.skills)), 0)
        self.assertEqual(self.invoke("--skills-dir", str(self.skills)), 0)
        self.assertTrue(self.destination.is_symlink())

    def test_install_refuses_regular_file_and_directory_conflicts(self):
        self.skills.mkdir()
        self.destination.write_text("keep me", encoding="utf-8")
        self.assertEqual(self.invoke("--skills-dir", str(self.skills)), 1)
        self.assertEqual(self.destination.read_text(encoding="utf-8"), "keep me")

        self.destination.unlink()
        self.destination.mkdir()
        self.assertEqual(self.invoke("--skills-dir", str(self.skills)), 1)
        self.assertTrue(self.destination.is_dir())

    def test_install_preserves_dangling_link(self):
        self.skills.mkdir()
        missing = self.root / "missing target"
        self.destination.symlink_to(missing, target_is_directory=True)
        self.assertEqual(self.invoke("--skills-dir", str(self.skills)), 1)
        self.assertTrue(self.destination.is_symlink())
        self.assertEqual(os.readlink(self.destination), str(missing))

    def test_uninstall_removes_matching_link(self):
        self.assertEqual(self.invoke("--skills-dir", str(self.skills)), 0)
        self.assertEqual(self.invoke("--skills-dir", str(self.skills), "--uninstall"), 0)
        self.assertFalse(os.path.lexists(self.destination))

    def test_uninstall_refuses_mismatched_link(self):
        self.skills.mkdir()
        other = self.root / "other source"
        other.mkdir()
        self.destination.symlink_to(other, target_is_directory=True)
        self.assertEqual(self.invoke("--skills-dir", str(self.skills), "--uninstall"), 1)
        self.assertTrue(self.destination.is_symlink())
        self.assertEqual(self.destination.resolve(), other.resolve())

    def test_missing_source_skill_file_refuses_install(self):
        (self.source / "SKILL.md").unlink()
        self.assertEqual(self.invoke("--skills-dir", str(self.skills)), 1)
        self.assertFalse(os.path.lexists(self.destination))

    def test_check_fails_when_installed_link_has_no_source_skill_file(self):
        self.assertEqual(self.invoke("--skills-dir", str(self.skills)), 0)
        (self.source / "SKILL.md").unlink()
        self.assertEqual(self.invoke("--skills-dir", str(self.skills), "--check"), 1)
        self.assertTrue(self.destination.is_symlink())

    def test_symlink_cycle_is_a_conflict_without_a_traceback(self):
        self.skills.mkdir()
        self.destination.symlink_to(self.destination, target_is_directory=True)
        self.assertEqual(self.invoke("--skills-dir", str(self.skills)), 1)
        self.assertEqual(self.invoke("--skills-dir", str(self.skills), "--check"), 1)
        self.assertEqual(self.invoke("--skills-dir", str(self.skills), "--uninstall"), 1)
        self.assertTrue(self.destination.is_symlink())

    def test_check_is_read_only_and_reports_matching_or_absent(self):
        self.assertEqual(self.invoke("--skills-dir", str(self.skills), "--check"), 1)
        self.assertFalse(self.skills.exists())
        self.assertEqual(self.invoke("--skills-dir", str(self.skills)), 0)
        self.assertEqual(self.invoke("--skills-dir", str(self.skills), "--check"), 0)


if __name__ == "__main__":
    unittest.main()
