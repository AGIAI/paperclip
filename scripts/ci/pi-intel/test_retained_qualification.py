import copy, hashlib, io, json, tarfile, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from lifecycle import Lifecycle
from qualification_observer import ActiveInspectionFailed
from retained_qualification import (PIN, RetainedChild, complete_integrity, extract_test_sources,
                                    finalize, test_summary, validate_original)


class RetainedQualificationTests(unittest.TestCase):
    def test_exact_summary_and_missing_duplicate_failure_skip_rejections(self):
        for prefix in ('#', 'ℹ'):
            good = '\n'.join(f'{prefix} {k} {v}' for k, v in dict(tests=63, pass_=63, fail=0, cancelled=0, skipped=0, todo=0).items()).replace('pass_', 'pass')
            self.assertEqual(test_summary(good, 63)['pass'], 63)
            for bad in (good.replace('tests 63', 'tests 62'), good.replace('skipped 0', 'skipped 1'),
                        good.replace('fail 0', 'fail 1'), good+'\n'+prefix+' pass 63',
                        good.replace(prefix+' todo 0', '')):
                with self.assertRaises(RuntimeError): test_summary(bad, 63)

    def test_source_closure_exact_bytes_and_link_duplicate_escape_negatives(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); name = 'packages/paperclip-runner/test/fixture.mjs'; data = b'fixture only'
            expected = {name:hashlib.sha256(data).hexdigest()}
            def archive(kind):
                path = root/(kind+'.tar')
                with tarfile.open(path, 'w') as tar:
                    item = tarfile.TarInfo(name); item.size = len(data)
                    if kind == 'link': item.type = tarfile.SYMTYPE; item.linkname = '/foreign'; item.size = 0
                    tar.addfile(item, io.BytesIO(data) if kind != 'link' else None)
                    if kind == 'duplicate': tar.addfile(item, io.BytesIO(data))
                return path
            extract_test_sources(archive('good'), root/'good-output', expected)
            self.assertEqual((root/'good-output'/name).read_bytes(), data)
            for kind in ('link', 'duplicate'):
                with self.assertRaises(RuntimeError): extract_test_sources(archive(kind), root/(kind+'-output'), expected)
            with self.assertRaises(RuntimeError): extract_test_sources(root/'good.tar', root/'wrong-hash', {name:'0'*64})
            with self.assertRaises(RuntimeError): extract_test_sources(root/'good.tar', root/'escape', {'../x':'0'*64})

    def test_original_build_provenance_rejects_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); commands = []
            for i in range(22):
                label = 'daemon-build' if i == 0 else f'preparation-{i}'
                log = root/(label+'.log'); log.write_text(label)
                commands.append({'label':label, 'status':'passed', 'exitCode':0,
                                 'logSha256':hashlib.sha256(log.read_bytes()).hexdigest(),
                                 'command':['cargo', *PIN['buildCommandTail']]})
            commands.append({'label':'closed-startup'})
            r = {'sourceRevision':PIN['sourceRevision'], 'runId':PIN['artifactRunId'], 'runAttempt':'1',
                 'trustedWorkflowRevision':PIN['artifactWorkflowRevision'], 'nativeRecompiled':True,
                 'nativeDaemonReuse':False, 'nativeBuildSource':PIN['sourceRevision'], 'compiler':PIN['compiler'],
                 'daemonBuildMetadata':PIN['daemonBuildMetadata'], 'helpers':{'verify.py':PIN['originalVerifierSha256']},
                 'normalProviderSelection':PIN['normalProviderSelection'], 'qualificationOverride':False,
                 'localComparison':{'sourceArchiveSha256':PIN['selectedFiles']['source.tar']['sha256'], 'resolvedLockSha256':PIN['resolvedLockSha256']},
                 'sourceInputInventorySha256':PIN['selectedFiles']['source-input-inventory.json']['sha256'],
                 'packVerification':{'manifestDigest':PIN['originalPackDigest']},
                 'status':'failed_no_retry', 'errorType':'TimeoutExpired', 'cleanupUncertain':False,
                 'scratchCleanup':'removed_verified_owned_root', 'commands':commands,
                 'daemonSha256':PIN['selectedFiles']['paperclip-runnerd']['sha256'],
                 'packManifestSha256':PIN['selectedFiles']['provider-pack.json']['sha256'],
                 'packInventorySha256':PIN['selectedFiles']['pack-inventory.json']['sha256'],
                 'providerPackArchive':{'sha256':PIN['selectedFiles']['provider-pack.tar.gz']['sha256']}}
            def check(value):
                (root/'receipt.json').write_text(json.dumps(value)); return validate_original(root, PIN)
            self.assertEqual(check(r)['sourceRevision'], PIN['sourceRevision'])
            for key, value in [('sourceRevision','wrong'), ('compiler',{}), ('nativeDaemonReuse',True),
                               ('cleanupUncertain',True), ('qualificationOverride',True), ('daemonSha256','wrong')]:
                bad = copy.deepcopy(r); bad[key] = value
                with self.subTest(key=key), self.assertRaises(RuntimeError): check(bad)
            bad = copy.deepcopy(r); bad['commands'][0]['status'] = 'failed'
            with self.assertRaises(RuntimeError): check(bad)
            (root/'preparation-1.log').write_text('changed')
            with self.assertRaises(RuntimeError): check(r)

    def child(self, observe=None):
        owner = SimpleNamespace(stop_deadline=None, owned={}, observe=observe or Mock(return_value={}),
                                stop=Mock(return_value={'status':'stopped'}), live=Mock(return_value=set()))
        process = SimpleNamespace(pid=123, returncode=0, poll=Mock(return_value=0), wait=Mock())
        return RetainedChild(owner), process

    def test_publication_observation_failure_still_retires_exact_child(self):
        child, process = self.child(Mock(side_effect=ActiveInspectionFailed('fixture')))
        with self.assertRaises(ActiveInspectionFailed): child.execute(lambda:process, 180)
        child.owner.stop.assert_called_once_with(123); process.wait.assert_called_once_with(timeout=10)
        self.assertTrue(child.retired); self.assertFalse(child.uncertain)

    def test_cancellation_during_factory_publishes_then_retires_no_second_launch(self):
        child, process = self.child()
        def factory(): child.cancel('fixture signal'); return process
        with self.assertRaises(RuntimeError): child.execute(factory, 180)
        child.owner.stop.assert_called_once_with(123)
        self.assertTrue(child.retired)
        with self.assertRaises(RuntimeError): child.execute(Mock(), 180)

    def test_prelaunch_cancellation_does_not_call_factory(self):
        child, _ = self.child(); factory = Mock(); child.cancel('fixture signal')
        with self.assertRaises(RuntimeError): child.execute(factory, 180)
        factory.assert_not_called(); self.assertFalse(child.uncertain)

    def test_unknown_launch_and_failed_retirement_remain_uncertain(self):
        child, process = self.child()
        with self.assertRaises(OSError): child.execute(Mock(side_effect=OSError('launch failure')), 180)
        self.assertTrue(child.uncertain)
        child, process = self.child(); child.owner.stop.side_effect = OSError('inspection failure')
        with self.assertRaises(OSError): child.execute(lambda:process, 180)
        self.assertTrue(child.uncertain)

    def test_every_integrity_check_runs_after_first_failure(self):
        second = Mock(return_value=True)
        result = complete_integrity({'first':Mock(side_effect=OSError('read')), 'second':second})
        self.assertFalse(result['passed']); second.assert_called_once_with()
        self.assertEqual(result['checks'], {'first':False, 'second':True})

    def test_failed_test_still_gets_full_integrity_retention_and_cleanup(self):
        proof = {'status':'failed_no_retry'}; check = Mock(return_value=True); retain = Mock(); remove = Mock()
        self.assertFalse(finalize(proof, [], Lifecycle(), {'pack':check}, retain, remove))
        self.assertEqual(proof['status'], 'failed_no_retry')
        check.assert_called_once_with(); retain.assert_called_once_with(); remove.assert_called_once_with()

    def test_post_integrity_failure_cannot_report_pass(self):
        proof = {'status':'native_intel_no_provider_checks_passed_pending_review'}
        self.assertTrue(finalize(proof, [], Lifecycle(), {'pack':lambda:False}, Mock(), Mock()))
        self.assertEqual(proof['status'], 'failed_no_retry')

    def test_uncertain_child_keeps_scratch_but_drains_other_child_and_checks(self):
        bad = SimpleNamespace(child=object(), uncertain=True, retire=Mock(side_effect=OSError('retirement')))
        good = SimpleNamespace(child=object(), uncertain=False, retire=Mock())
        proof = {}; remove = Mock(); check = Mock(return_value=True)
        self.assertTrue(finalize(proof, [bad, good], Lifecycle(), {'pack':check}, Mock(), remove))
        good.retire.assert_called_once_with(good.child); check.assert_called_once_with(); remove.assert_not_called()
        self.assertTrue(proof['cleanupUncertain'])


if __name__ == '__main__': unittest.main()
