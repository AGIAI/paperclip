import os
import io
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
import json
import re
from unittest.mock import Mock, patch
from lifecycle import CleanupUncertain, Lifecycle, run_test_cases
from retain_pack import retain_pack, verify_archive
from closed_inventory import closed_tree
from source_guard import tree, sha, capture_authority, verify_authority, verify_source, ASSETS
from admit_evidence import admit_evidence, regular_bytes
from verify import tool_invocation, verify_tool_invocation, build_native_daemon, INPUTS, SOURCE

class FreshNativeBuildRegression(unittest.TestCase):
    """Mock command boundaries only: no compiler, platform tool or child launch."""
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name).resolve();self.stage=self.root/'stage';self.stage.mkdir()
        self.scratch=self.root/'scratch';self.scratch.mkdir();self.sdk=self.root/'sdk';self.sdk.mkdir()
        (self.sdk/'SDKSettings.json').write_text('{"Version":"fixture"}')
        self.tools={}
        for name in ('rustup','cargo','rustc','clang','ld'):
            path=self.root/name;path.write_text('fixture-only '+name);path.chmod(0o700);self.tools[name]=path
        self.audit={'invocationPath':str(self.tools['rustup']),'resolvedTarget':str(self.tools['rustup']),'targetSha256':sha(self.tools['rustup'])}
        self.env={'CARGO_TARGET_DIR':str(self.scratch/'target')};self.receipt={};self.calls=[];self.fail_label=None;self.bad_metadata=False
    def run_command(self,command,label,timeout):
        self.calls.append((label,list(map(str,command)),timeout))
        if label==self.fail_label:raise RuntimeError('injected command failure')
        values={'cargo-path':str(self.tools['cargo']),'rustc-path':str(self.tools['rustc']),
                'rust-version-verbose':'rustc 1.97.1 fixture\nhost: x86_64-apple-darwin', 'cargo-version':'cargo 1.97.1 fixture',
                'sdk-path':str(self.sdk),'sdk-version':'fixture','clang-path':str(self.tools['clang']),'ld-path':str(self.tools['ld']),
                'daemon-architecture':'Mach-O 64-bit executable x86_64',
                'daemon-metadata':json.dumps({} if self.bad_metadata else INPUTS['expectedDaemonBuildMetadata'])}
        if label=='daemon-build':
            p=self.scratch/'target/x86_64-apple-darwin/release/paperclip-runnerd';p.parent.mkdir(parents=True);p.write_bytes(b'newly-compiled-fixture');p.chmod(0o755)
        return values.get(label,'')
    def build(self):
        with patch('verify.tool_invocation',return_value=(self.tools['rustup'],self.audit)):
            return build_native_daemon(self.stage,self.scratch,self.env,self.run_command,self.receipt,lambda:None)
    def test_fresh_compiler_recipe_and_output_provenance(self):
        daemon=self.build();self.assertEqual(daemon.read_bytes(),b'newly-compiled-fixture')
        self.assertTrue(self.receipt['nativeRecompiled']);self.assertFalse(self.receipt['nativeDaemonReuse']);self.assertEqual(self.receipt['nativeBuildSource'],SOURCE)
        build=next(c for c in self.calls if c[0]=='daemon-build')
        self.assertEqual(build[2],1500);self.assertEqual(build[1][1:],['build','--release','--target','x86_64-apple-darwin','--manifest-path','packages/paperclip-runner/runner/Cargo.toml','--locked','-p','paperclip-runner-core','--bin','paperclip-runnerd','-j','2'])
        self.assertEqual(self.env['RUSTC'],str(self.tools['rustc']))
        self.assertEqual(self.receipt['compiler']['sdk']['settings']['SDKSettings.json'],sha(self.sdk/'SDKSettings.json'))
        labels=[c[0] for c in self.calls];self.assertLess(labels.index('daemon-sign'),labels.index('daemon-signature-verify'));self.assertLess(labels.index('daemon-signature-verify'),labels.index('daemon-metadata'))
    def test_compiler_failure_cannot_produce_or_claim_fresh_daemon(self):
        self.fail_label='daemon-build'
        with self.assertRaisesRegex(RuntimeError,'injected'):self.build()
        self.assertNotIn('nativeRecompiled',self.receipt);self.assertFalse((self.stage/'packages/paperclip-runner/dist/bin/paperclip-runnerd').exists())
        self.assertNotIn('daemon-sign',[c[0] for c in self.calls])
    def test_wrong_metadata_cannot_claim_fresh_success(self):
        self.bad_metadata=True
        with self.assertRaisesRegex(RuntimeError,'build metadata'):self.build()
        self.assertNotIn('nativeRecompiled',self.receipt)
    def test_missing_sdk_evidence_stops_before_build(self):
        (self.sdk/'SDKSettings.json').unlink()
        with self.assertRaisesRegex(RuntimeError,'SDK settings'):self.build()
        self.assertNotIn('daemon-build',[c[0] for c in self.calls])
    def test_unreviewed_recipe_stops_before_commands(self):
        with patch.dict(INPUTS,{'freshNativeBuild':dict(INPUTS['freshNativeBuild'],jobs=8)}):
            with self.assertRaisesRegex(RuntimeError,'recipe'):self.build()
        self.assertEqual(self.calls,[])

    def test_pack_verifier_and_source_profile_authorities_agree(self):
        verifier=(Path(__file__).parent/'verify-pack.mjs').read_text()
        block=re.search(r'const pins = \{([^}]+)\};',verifier)
        self.assertIsNotNone(block)
        pins=dict(re.findall(r"(\w+): '([a-f0-9]{64})'",block.group(1)))
        self.assertEqual({agent:'sha256:'+digest for agent,digest in pins.items()},
                         {agent:profile['profileDigest'] for agent,profile in INPUTS['normalProviderSelection'].items()})

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
    def hardlinked_pack(self, root):
        pack = root/'pack'; pack.mkdir()
        (pack/'a').write_bytes(b'exact-tested-bytes'); (pack/'a').chmod(0o755)
        os.link(pack/'a', pack/'b')
        (pack/'c').write_bytes(b'different-bytes'); (pack/'c').chmod(0o755)
        return pack

    def test_internal_hardlinks_survive_full_archive_roundtrip(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); pack = self.hardlinked_pack(root)
            # This is the exact pre-fix CI failure; strict inventories stay strict.
            with self.assertRaisesRegex(RuntimeError, "private regular files: path='a'.*links=2"):
                tree(pack, allow_links=True)
            inventory = closed_tree(pack)
            archive = root/'retained.tar.gz'; retain_pack(pack, archive, inventory)
            shutil.rmtree(pack)
            with tarfile.open(archive) as tar: tar.extractall(root/'restored', filter='fully_trusted')
            restored = root/'restored'/'provider-pack'
            self.assertEqual(closed_tree(restored), inventory)
            self.assertEqual((restored/'a').stat().st_ino, (restored/'b').stat().st_ino)

    def test_external_hardlink_and_special_file_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); pack = self.hardlinked_pack(root)
            os.link(pack/'a', root/'outside')
            with self.assertRaisesRegex(RuntimeError, "escapes inventory.*path='a'.*links=3.*inventoriedLinks=2"):
                closed_tree(pack)
            (root/'outside').unlink(); os.mkfifo(pack/'fifo')
            with self.assertRaisesRegex(RuntimeError, "Nonregular pack file: path='fifo'"):
                closed_tree(pack)

    def test_archive_rejects_escaping_cyclic_and_wrong_hardlink_targets(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); pack = self.hardlinked_pack(root); inventory = closed_tree(pack)
            for index, target in enumerate(('../outside', '/outside', 'provider-pack/../outside',
                                             'provider-pack/b', 'provider-pack/missing', 'provider-pack/c')):
                with self.subTest(target=target):
                    archive = root/f'invalid-{index}.tar.gz'
                    with tarfile.open(archive, 'w:gz') as tar:
                        for name in ('a', 'c'): tar.add(pack/name, arcname='provider-pack/'+name)
                        link = tarfile.TarInfo('provider-pack/b'); link.type = tarfile.LNKTYPE
                        link.linkname = target; link.mode = 0o755; tar.addfile(link)
                    with self.assertRaises(RuntimeError): verify_archive(archive, inventory)

    def test_archive_rejects_changed_bytes_mode_and_missing_members(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); pack = self.hardlinked_pack(root); inventory = closed_tree(pack)
            for index, change in enumerate(('bytes', 'mode', 'missing')):
                with self.subTest(change=change):
                    archive = root/f'invalid-{index}.tar.gz'
                    with tarfile.open(archive, 'w:gz') as tar:
                        for name in ('a', 'b', 'c'):
                            if change == 'missing' and name == 'c': continue
                            entry = tar.gettarinfo(pack/name, arcname='provider-pack/'+name)
                            if change == 'mode' and name == 'b': entry.mode = 0o600
                            data = (pack/name).read_bytes()
                            if change == 'bytes' and name == 'a': data = b'x' * len(data)
                            tar.addfile(entry, io.BytesIO(data) if entry.isfile() else None)
                    with self.assertRaises(RuntimeError): verify_archive(archive, inventory)

    def test_archive_rejects_special_members_and_lost_link_identity(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); pack = self.hardlinked_pack(root); inventory = closed_tree(pack)
            for index, change in enumerate(('special', 'escaping', 'lost-link')):
                with self.subTest(change=change):
                    archive = root/f'invalid-{index}.tar.gz'
                    with tarfile.open(archive, 'w:gz') as tar:
                        for name in ('a', 'b', 'c'):
                            data = (pack/name).read_bytes()
                            entry = tarfile.TarInfo('provider-pack/'+name); entry.mode = 0o755
                            entry.size = len(data)
                            if name == 'b' and change == 'special': entry.type = tarfile.FIFOTYPE; entry.size = 0
                            if name == 'b' and change == 'escaping': entry.name = 'provider-pack/../outside'
                            tar.addfile(entry, io.BytesIO(data) if entry.isfile() else None)
                    with self.assertRaises(RuntimeError): verify_archive(archive, inventory)

    def test_full_pack_authority_recheck_rejects_mutation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); pack = self.hardlinked_pack(root); stage = root/'stage'
            dist = stage/'packages/paperclip-runner/dist'; dist.mkdir(parents=True)
            assets = stage/'packages/paperclip-runner/provider-assets'; assets.mkdir()
            (pack/'dist').mkdir(); (pack/'provider-assets').mkdir()
            authority = capture_authority(stage, pack)
            verify_authority(stage, pack, authority)
            (pack/'a').write_bytes(b'changed')
            with self.assertRaisesRegex(RuntimeError, 'Immutable pack inventory drift'):
                verify_authority(stage, pack, authority)

    def test_source_assets_absence_and_presence_are_both_bound(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); pack = self.hardlinked_pack(root); stage = root/'stage'
            dist = stage/'packages/paperclip-runner/dist'; dist.mkdir(parents=True)
            assets = stage/ASSETS
            (pack/'dist').mkdir(); (pack/'provider-assets').mkdir()
            (stage/'pnpm-lock.yaml').write_bytes(b'resolved-lock')
            git_status = b' M pnpm-lock.yaml\0'
            def verify(expected):
                with patch('source_guard.subprocess.check_output', side_effect=['frozen-source\n', git_status]):
                    return verify_source(stage, 'frozen-source', sha(stage/'pnpm-lock.yaml'), pack, expected)
            absent = capture_authority(stage, pack)
            self.assertIsNone(absent['sourceAssets'])
            self.assertFalse(verify(absent)['generatedAssetsAdmitted'])
            assets.mkdir()
            with self.assertRaisesRegex(RuntimeError, 'Source asset presence or inventory drift'): verify(absent)
            present = capture_authority(stage, pack)
            self.assertEqual(present['sourceAssets'], [])
            self.assertTrue(verify(present)['generatedAssetsAdmitted'])
            assets.rmdir()
            with self.assertRaisesRegex(RuntimeError, 'Source asset presence or inventory drift'): verify(present)

    def test_pack_and_source_assets_keep_strict_single_link_contract(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); pack = self.hardlinked_pack(root); stage = root/'stage'
            (stage/'packages/paperclip-runner/dist').mkdir(parents=True)
            (pack/'dist').mkdir(); (pack/'provider-assets').mkdir()
            assets = stage/ASSETS; assets.mkdir()
            for directory in (pack/'provider-assets', assets):
                with self.subTest(directory=directory.name):
                    (directory/'a').write_bytes(b'asset'); os.link(directory/'a', directory/'b')
                    with self.assertRaisesRegex(RuntimeError, 'Inventory requires private regular files'):
                        capture_authority(stage, pack)
                    (directory/'a').unlink(); (directory/'b').unlink()

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
