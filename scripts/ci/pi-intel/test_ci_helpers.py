import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import Mock, patch
from lifecycle import CleanupUncertain, Lifecycle, run_test_cases
from retain_pack import retain_pack
from source_guard import tree, sha
from admit_evidence import admit_evidence, regular_bytes
from verify import tool_invocation, verify_tool_invocation

class CleanupRegression(unittest.TestCase):
    def test_first_cleanup_failure_prevents_second_test_and_scratch_removal(self):
        lifecycle = Lifecycle(); launched = []; remove_scratch = Mock()
        def run(command, label):
            lifecycle.begin(); launched.append(label)
            try:
                raise RuntimeError('owner.stop inspection failed')
            finally:
                lifecycle.failed()
        with self.assertRaises(CleanupUncertain):
            run_test_cases([('startup', []), ('sdk', [])], run, lifecycle)
        if lifecycle.safe: remove_scratch()
        self.assertEqual(launched, ['startup']); remove_scratch.assert_not_called()
        with self.assertRaises(CleanupUncertain): lifecycle.confirmed()
        with self.assertRaises(CleanupUncertain): lifecycle.begin()
        self.assertFalse(lifecycle.safe)

    def test_interrupted_launch_without_handle_retains_scratch(self):
        lifecycle = Lifecycle(); lifecycle.begin()
        # Popen may be interrupted before Python receives a handle: pending is unsafe.
        launched = Mock()
        with self.assertRaises(CleanupUncertain):
            run_test_cases([('sdk', [])], launched, lifecycle)
        launched.assert_not_called(); self.assertFalse(lifecycle.safe)

    def test_assertion_failure_with_confirmed_cleanup_allows_independent_sdk_test(self):
        lifecycle = Lifecycle(); launched = []
        def run(command, label):
            lifecycle.begin(); launched.append(label); lifecycle.confirmed()
            if label == 'startup': raise RuntimeError('test assertion failed')
        failures = run_test_cases([('startup', []), ('sdk', [])], run, lifecycle)
        self.assertEqual(launched, ['startup', 'sdk'])
        self.assertEqual(failures, ['test assertion failed']); self.assertTrue(lifecycle.safe)

class PackRetentionRegression(unittest.TestCase):
    def test_full_pack_survives_scratch_removal_with_bytes_links_and_modes(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root); pack = root/'scratch'/'provider-pack'; pack.mkdir(parents=True)
            (pack/'bin').mkdir(); (pack/'bin'/'node').write_bytes(b'exact-tested-bytes')
            (pack/'bin'/'node').chmod(0o755); (pack/'node').symlink_to('bin/node')
            (pack/'.hidden').write_bytes(b'inventory-must-include-hidden'); (pack/'.hidden').chmod(0o444)
            inventory = tree(pack, allow_links=True)
            archive = root/'retained-pack.tar.gz'
            receipt = retain_pack(pack, archive, inventory)
            self.assertEqual(receipt['sha256'], sha(archive)); self.assertTrue(receipt['inventoryVerified'])
            shutil.rmtree(root/'scratch')
            restored = root/'restored'; restored.mkdir()
            # This archive was created above and every member was verified against our owned inventory.
            # The data filter intentionally rewrites read-only modes, so it cannot test exact restoration.
            with tarfile.open(archive) as tar: tar.extractall(restored, filter='fully_trusted')
            self.assertEqual(tree(restored/'provider-pack', allow_links=True), inventory)
            self.assertEqual(os.readlink(restored/'provider-pack/node'), 'bin/node')

class ArtifactStorageRegression(unittest.TestCase):
    def test_complete_evidence_size_includes_receipts_and_hidden_files(self):
        with tempfile.TemporaryDirectory() as root:
            root=Path(root); (root/'receipt.json').write_text('{}'); (root/'.hidden').write_bytes(b'exact')
            result=admit_evidence(root, maximum_bytes=1024*1024)
            self.assertEqual(result['status'], 'admitted_complete_evidence')
            self.assertEqual(result['regularFileBytes'], regular_bytes(root))
            self.assertEqual(result['retentionDays'], 7)
            self.assertFalse(result['truncated'])

    def test_over_cap_rejects_upload_without_truncating_pack(self):
        with tempfile.TemporaryDirectory() as root:
            root=Path(root); pack=root/'provider-pack.tar.gz'; pack.write_bytes(b'x'*4096)
            before=sha(pack); result=admit_evidence(root, maximum_bytes=1024)
            self.assertEqual(result['status'], 'rejected_storage_cap')
            self.assertEqual(sha(pack), before)
            self.assertEqual(result['regularFileBytes'], regular_bytes(root))

    def test_symlink_cannot_escape_storage_accounting(self):
        with tempfile.TemporaryDirectory() as root:
            root=Path(root); (root/'escape').symlink_to('/etc/hosts')
            with self.assertRaisesRegex(RuntimeError, 'symlink'): admit_evidence(root)

class MulticallInvocationRegression(unittest.TestCase):
    def test_symlink_dispatched_cli_keeps_invocation_name_and_audits_target(self):
        with tempfile.TemporaryDirectory() as root:
            root=Path(root); target=root/'rustup-init'; invocation=root/'rustup'
            target.write_text('#!/bin/sh\ncase "$0" in */rustup) test "$1" = toolchain; exit $?;; *) exit 2;; esac\n')
            target.chmod(0o755); invocation.symlink_to(target.name)
            with patch('verify.shutil.which', return_value=str(invocation)):
                executable,audit=tool_invocation('rustup')
            self.assertEqual(executable,invocation)
            self.assertEqual(audit['resolvedTarget'],str(target.resolve()))
            self.assertEqual(audit['targetSha256'],sha(target))
            verify_tool_invocation(executable,audit)
            clean={'PATH':'/usr/bin:/bin'}
            self.assertEqual(subprocess.run([executable,'toolchain','install','1.97.1'],env=clean,timeout=5).returncode,0)
            # This reproduces the CI failure: resolving the alias changes multicall mode.
            self.assertEqual(subprocess.run([executable.resolve(),'toolchain','install','1.97.1'],env=clean,timeout=5).returncode,2)
            target.write_text('#!/bin/sh\nexit 0\n')
            with self.assertRaisesRegex(RuntimeError,'target bytes changed'):
                verify_tool_invocation(executable,audit)

if __name__ == '__main__': unittest.main()
