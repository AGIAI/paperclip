import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import executable_holders as observer


class HolderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.proc = self.root / "proc"
        self.proc.mkdir()
        self.target = self.root / "paperclip-runnerd"
        self.target.write_bytes(b"exact daemon")

    def process(self, pid, executable):
        root = self.proc / str(pid)
        root.mkdir()
        (root / "exe").symlink_to(executable)
        # Include malicious-looking comm; it must never appear in output.
        (root / "stat").write_text(f"{pid} (secret ) argv) S 7 8 " + "0 " * 16 + "12345 0")
        (root / "environ").write_text("DO_NOT_READ_SECRET")
        (root / "cmdline").write_text("DO_NOT_READ_SECRET")
        return root

    def inspect(self, **kw):
        return observer.inspect(self.target, self.proc, **kw)

    def test_exact_inode_and_only_numeric_process_fields(self):
        self.process(12, self.target)
        other = self.root / "other"
        other.write_bytes(b"foreign")
        self.process(13, other)
        result = self.inspect()
        self.assertTrue(result["complete"])
        self.assertEqual([r["pid"] for r in result["holders"]], [12])
        self.assertEqual(result["holders"][0]["startTimeTicks"], "12345")
        self.assertNotIn("secret", json.dumps(result).lower())
        self.assertEqual(result["signalsSent"], 0)

    def test_inode_alias_is_still_holder(self):
        alias = self.root / "alias"
        alias.hardlink_to(self.target)
        self.process(12, alias)
        row = self.inspect()["holders"][0]
        self.assertTrue(row["matchesTargetInode"])
        self.assertFalse(row["matchesTargetPath"])

    def test_deleted_path_preserved_even_after_replacement(self):
        deleted = Path(str(self.target) + " (deleted)")
        deleted.write_bytes(b"old")
        self.process(12, deleted)
        row = self.inspect()["holders"][0]
        self.assertTrue(row["matchesTargetPath"])
        self.assertTrue(row["deletedExecutable"])
        self.assertFalse(row["matchesTargetInode"])

    def test_target_not_built_yet(self):
        self.target.unlink()
        self.assertIsNone(self.inspect()["targetBefore"])

    def test_symlink_target_rejected(self):
        self.target.unlink()
        self.target.symlink_to(self.root / "foreign")
        with self.assertRaisesRegex(ValueError, "non-symlink"):
            self.inspect()

    def test_bounded_scan_is_explicitly_incomplete(self):
        self.process(12, self.target)
        result = self.inspect(max_pids=0)
        self.assertFalse(result["complete"])
        self.assertEqual(result["stopReason"], "bounded_scan_limit")

    def test_process_identity_race_is_not_attested(self):
        self.process(12, self.target)
        with patch.object(observer, "process_identity", side_effect=[{"pid": 12}, {"pid": 99}]):
            result = self.inspect()
        self.assertFalse(result["complete"])
        self.assertEqual(result["holders"], [])
        self.assertEqual(result["racedMatches"], 1)

    def test_permission_denial_is_explicitly_incomplete(self):
        self.process(12, self.target)
        with patch.object(observer.os, "readlink", side_effect=PermissionError):
            result = self.inspect()
        self.assertFalse(result["complete"])
        self.assertEqual(result["permissionDenied"], 1)

    def test_target_replacement_during_scan_is_incomplete(self):
        real = observer.identity
        calls = 0

        def changed(path):
            nonlocal calls
            row = real(path)
            if path == self.target:
                calls += 1
                if calls == 2:
                    row["ino"] = "replacement"
            return row

        with patch.object(observer, "identity", side_effect=changed):
            result = self.inspect()
        self.assertTrue(result["targetChangedDuringScan"])
        self.assertFalse(result["complete"])


if __name__ == "__main__":
    unittest.main()
