"""Canonical no-provider checks on exact retained bba Intel build; no rebuild or patch."""
import argparse, datetime, json, os, platform, re, shutil, signal, stat, subprocess, tarfile, tempfile, time
from pathlib import Path
from source_guard import require, sha
from native_daemon_reuse import extract_selected
from startup_diagnostic import restore_pack
from closed_inventory import closed_tree
from owned_processes import OwnedProcesses, atomic_json
from diagnostic_lifecycle import DiagnosticChild
from qualification_observer import QualificationInspection, wait_for_owned_command
from lifecycle import Lifecycle, run_test_cases

HERE = Path(__file__).resolve().parent
PIN = json.loads((HERE/'retained-qualification-inputs.json').read_text())


def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()


def validate_original(original, pin):
    receipt = json.loads((original/'receipt.json').read_text())
    require(receipt['sourceRevision'] == pin['sourceRevision'] and receipt['runId'] == pin['artifactRunId']
            and receipt['runAttempt'] == '1' and receipt['trustedWorkflowRevision'] == pin['artifactWorkflowRevision'], 'Original build identity differs')
    require(receipt['nativeRecompiled'] is True and receipt['nativeDaemonReuse'] is False
            and receipt['nativeBuildSource'] == pin['sourceRevision'], 'Original fresh native provenance missing')
    require(receipt['compiler'] == pin['compiler'] and receipt['daemonBuildMetadata'] == pin['daemonBuildMetadata']
            and receipt['helpers']['verify.py'] == pin['originalVerifierSha256'], 'Original compiler/recipe differs')
    require(receipt['normalProviderSelection'] == pin['normalProviderSelection'] and receipt['qualificationOverride'] is False, 'Original normal provider selection differs')
    require(receipt['localComparison']['sourceArchiveSha256'] == pin['selectedFiles']['source.tar']['sha256']
            and receipt['localComparison']['resolvedLockSha256'] == pin['resolvedLockSha256']
            and receipt['sourceInputInventorySha256'] == pin['selectedFiles']['source-input-inventory.json']['sha256']
            and receipt['packVerification']['manifestDigest'] == pin['originalPackDigest'], 'Original source/lock/inventory cross-binding differs')
    require(receipt['status'] == 'failed_no_retry' and receipt['errorType'] == 'TimeoutExpired'
            and receipt['cleanupUncertain'] is False and receipt['scratchCleanup'] == 'removed_verified_owned_root', 'Unexpected original failure or retirement')
    commands = receipt['commands']
    require(len(commands) == 23 and commands[-1]['label'] == 'closed-startup', 'Original command scope differs')
    require(len({c['label'] for c in commands}) == len(commands), 'Duplicate original command')
    for command in commands[:-1]:
        require(command['status'] == 'passed' and command['exitCode'] == 0, 'Original preparation failed')
        require(sha(original/(command['label']+'.log')) == command['logSha256'], 'Original preparation log differs')
    build = next(c for c in commands if c['label'] == 'daemon-build')
    require(build['command'][1:] == pin['buildCommandTail'], 'Original compiler flags differ')
    require(receipt['daemonSha256'] == pin['selectedFiles']['paperclip-runnerd']['sha256']
            and receipt['packManifestSha256'] == pin['selectedFiles']['provider-pack.json']['sha256']
            and receipt['packInventorySha256'] == pin['selectedFiles']['pack-inventory.json']['sha256']
            and receipt['providerPackArchive']['sha256'] == pin['selectedFiles']['provider-pack.tar.gz']['sha256'], 'Original output cross-binding differs')
    return receipt


def extract_test_sources(archive, root, expected):
    require(not root.exists(), 'Test source root already exists')
    root.mkdir(mode=0o700)
    with tarfile.open(archive, 'r:') as source:
        members = source.getmembers()
        require(len({m.name for m in members}) == len(members), 'Duplicate source member')
        for name, digest in expected.items():
            path = Path(name)
            require(not path.is_absolute() and '..' not in path.parts and str(path) == name, 'Unsafe test source path')
            member = source.getmember(name)
            require(member.isfile() and 0 <= member.size <= 1024*1024, 'Test source member is not bounded regular data')
            target = root/path; target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with source.extractfile(member) as src, target.open('xb') as dst: shutil.copyfileobj(src, dst)
            require(sha(target) == digest, 'Test source digest differs')
            target.chmod(0o444)


def test_summary(text, expected):
    # Node24's canonical spec or TAP totals; reject duplicate/missing fields.
    values = {}
    for key in ('tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'):
        matches = re.findall(r'^(?:ℹ|#) '+key+r' (\d+)\s*$', text, re.MULTILINE)
        require(len(matches) == 1, 'Missing/duplicate test summary: '+key)
        values[key] = int(matches[0])
    require(values == {'tests':expected, 'pass':expected, 'fail':0, 'cancelled':0, 'skipped':0, 'todo':0}, 'Canonical test counts did not pass')
    return values


class RetainedChild(DiagnosticChild):
    """Reuse exact launch gate/retirement, with the normal observer's failure policy."""
    def execute(self, factory, timeout, clock=time.monotonic, sleep=time.sleep):
        require(not self.attempted and not self.uncertain, 'Owned command may launch once')
        self.clock = clock; self.deadline = clock()+timeout
        inspection = QualificationInspection(self.owner, self.deadline, clock=clock)
        self.owner.table = inspection.table; self.owner.argv = inspection.argv
        def before():
            if self.cancelled: self.gate.cancel(self.cancelled)
        def launch(): self.attempted = True; return factory()
        def publish(child):
            self.child = child
            inspection.observe(child.pid)
        try:
            self.gate.spawn(launch, publish, before)
            wait_for_owned_command(self.child, inspection, sleep=sleep)
        finally:
            if self.child is not None: self.retire(self.child)
            elif self.attempted: self.uncertain = True
        return self.child.returncode


def complete_integrity(checks):
    result = {}; errors = {}
    for name, check in checks.items():
        try:
            require(check(), 'Identity differs: '+name); result[name] = True
        except BaseException as error:
            result[name] = False; errors[name] = type(error).__name__+': '+str(error)
    return {'complete':True, 'passed':not errors, 'checks':result, 'errors':errors}


def finalize(proof, children, lifecycle, checks, retain, remove):
    errors = []
    for child in children:
        try:
            if child.child is not None: child.retire(child.child)
        except BaseException as failure: errors.append(repr(failure))
    proof['cleanupUncertain'] = not lifecycle.safe or any(c.uncertain for c in children) or bool(errors)
    proof['postRunIntegrity'] = (complete_integrity(checks) if checks is not None
                                 else {'complete':False, 'passed':False, 'reason':'preparation incomplete'})
    try: retain()
    except BaseException as failure: errors.append('retention: '+repr(failure))
    if not proof['cleanupUncertain']:
        try: remove(); proof['scratchRemoved'] = True
        except BaseException as failure:
            proof['cleanupUncertain'] = True; errors.append('scratch: '+repr(failure))
    proof['finalizationErrors'] = errors
    failed = proof['cleanupUncertain'] or errors or not proof['postRunIntegrity']['passed']
    if failed: proof['status'] = 'failed_no_retry'
    return bool(failed)


def execute(args):
    out = args.output.resolve(); out.mkdir(mode=0o700, parents=True, exist_ok=False)
    scratch = Path(tempfile.mkdtemp(prefix='pc-intel-retained-', dir='/private/tmp')); scratch.chmod(0o700)
    st = scratch.lstat(); scratch_id = (st.st_dev, st.st_ino, st.st_uid)
    proof = {'schema':'paperclip.retained-native-intel-qualification/v1', 'status':'preparing',
             'sourceRevision':PIN['sourceRevision'], 'runId':os.environ['GITHUB_RUN_ID'],
             'trustedWorkflowRevision':os.environ['GITHUB_WORKFLOW_SHA'], 'startedAt':now(),
             'originalBuildRunId':PIN['artifactRunId'], 'nativeRecompiled':False, 'nativeResigned':False,
             'sidecarModified':False, 'vendorClosureModified':False, 'originalTestsUnmodified':True,
             'providerCalls':0, 'credentialsRead':False, 'externalProviderPromptsSubmitted':0,
             'syntheticLoopbackModelPromptsExpected':True, 'automaticRetries':0, 'commands':[],
             'physicalColdDiskClaim':False, 'startupWarmupPerformed':False,
             'cacheNote':'Mandatory artifact verification reads the payload before original tests. No physical cache-cold claim.',
             'originalFailurePreserved':True, 'originalPostTestIntegrityMissing':True,
             'normalProviderSelection':PIN['normalProviderSelection'], 'packDigest':PIN['originalPackDigest'],
             'daemonSha256':PIN['selectedFiles']['paperclip-runnerd']['sha256'],
             'expectedTests':PIN['expectedTests'],
             'bounds':{'commandSeconds':180, 'ownedCleanupSeconds':100, 'overallAdmissionSeconds':1200,
                       'finalIntegrityReserveSeconds':120, 'originalAdmissionMs':30000, 'originalTestMs':60000},
             'processInspection':{'maximumCallSeconds':5, 'activeCadenceSeconds':.5, 'activeRetries':0},
             'cleanupUncertain':False, 'scratchRemoved':False,
             'helpers':{p.name:sha(p) for p in HERE.iterdir() if p.is_file()}}
    def save(): atomic_json(out/'receipt.json', proof)
    children = []; active = None; cancelled = None; integrity_checks = None
    execution_deadline = time.monotonic()+20*60
    lifecycle = Lifecycle(); save()
    env = {'HOME':str(scratch/'home'), 'TMPDIR':str(scratch), 'PATH':'/usr/bin:/bin:/usr/sbin:/sbin', 'LANG':'en_US.UTF-8'}
    Path(env['HOME']).mkdir(mode=0o700)
    def cancel(sig, _):
        nonlocal cancelled
        cancelled = 'signal '+str(sig)
        if active is not None: active.cancel(cancelled)
    signal.signal(signal.SIGTERM, cancel); signal.signal(signal.SIGINT, cancel)
    def run(argv, label, timeout, cwd, command_env=None):
        nonlocal active
        require(cancelled is None, 'Qualification cancelled before launch')
        require(time.monotonic()+timeout+100+120 < execution_deadline,
                'Insufficient overall window for command, owned cleanup and final integrity')
        lifecycle.begin()
        owner = OwnedProcesses(out/(label+'-processes.json'), scratch, cwd, cwd/'dist/cli/acpx-runtime-sidecar.cjs')
        active = RetainedChild(owner); children.append(active)
        if cancelled is not None: active.cancel(cancelled)
        row = {'label':label, 'argv':list(map(str, argv)), 'deadlineSeconds':timeout, 'startedAt':now(), 'status':'running'}
        proof['commands'].append(row); save(); started = time.monotonic()
        try:
            with (out/(label+'.log')).open('xb') as log:
                code = active.execute(lambda:subprocess.Popen(row['argv'], cwd=cwd, env=command_env or env,
                                                             stdout=log, stderr=log, start_new_session=True), timeout)
            row.update(exitCode=code, status='passed' if code == 0 else 'failed')
            require(code == 0, 'Command failed without retry: '+label)
            return (out/(label+'.log')).read_text()
        finally:
            row.update(finishedAt=now(), durationSeconds=round(time.monotonic()-started, 3),
                       shutdown=owner.stop_result, logSha256=sha(out/(label+'.log')))
            if active.uncertain or (active.attempted and not active.retired): lifecycle.failed()
            else: lifecycle.confirmed()
            if row['status'] == 'running': row['status'] = 'interrupted_or_observer_failed'
            save()
    error = None
    try:
        require(platform.system() == 'Darwin' and platform.machine() == 'x86_64', 'Native Intel required')
        original = extract_selected(args.archive, scratch/'original', PIN)
        prior = validate_original(original, PIN)
        proof['originalCompiler'] = prior['compiler']; proof['originalBuildReceiptSha256'] = sha(original/'receipt.json')
        refs = out/'original-reference'; refs.mkdir(mode=0o700)
        for name in PIN['selectedFiles']:
            if name not in ('paperclip-runnerd', 'provider-pack.tar.gz'): shutil.copy2(original/name, refs/name)
        atomic_json(out/'input-pins.json', PIN)
        inventory = json.loads((original/'pack-inventory.json').read_text())
        pack = restore_pack(original/'provider-pack.tar.gz', scratch/'unpacked', inventory)
        daemon = scratch/'paperclip-runnerd'; shutil.copyfile(original/'paperclip-runnerd', daemon); daemon.chmod(0o755)
        node = pack/'node_modules/node/bin/node'
        require(sha(node) == PIN['nodeSha256'] and sha(daemon) == PIN['selectedFiles']['paperclip-runnerd']['sha256'], 'Native bytes differ')
        source_root = scratch/'source-tests'; extract_test_sources(original/'source.tar', source_root, PIN['testSourceClosure'])
        source_inventory = closed_tree(source_root)
        atomic_json(out/'source-test-inventory.json', source_inventory)
        retained = out/'retained-test-state'; retained.mkdir(mode=0o700)
        helpers_before = proof['helpers']
        integrity_checks = {'pack':lambda:closed_tree(pack) == inventory,
                            'sourceTests':lambda:closed_tree(source_root) == source_inventory,
                            'daemon':lambda:sha(daemon) == PIN['selectedFiles']['paperclip-runnerd']['sha256'],
                            'helpers':lambda:{p.name:sha(p) for p in HERE.iterdir() if p.is_file()} == helpers_before}
        for name, pin in PIN['selectedFiles'].items():
            integrity_checks['original:'+name] = lambda name=name, pin=pin:sha(original/name) == pin['sha256']
        require(sha(HERE/'retain-test-state.mjs') == PIN['observerSha256']
                and sha(HERE/'verify-pack-profile13.mjs') == PIN['packVerifierSha256'], 'Test observer or pack verifier differs')
        hardware = run(['/usr/sbin/sysctl', 'hw.machine', 'machdep.cpu.vendor', 'machdep.cpu.brand_string'], 'hardware', 30, pack)
        require('GenuineIntel' in hardware and 'x86_64' in hardware, 'Intel hardware evidence missing')
        for flag in ('sysctl.proc_translated', 'hw.optional.arm64'):
            value = run(['/usr/sbin/sysctl', '-in', flag], flag, 30, pack).strip()
            require(value in ('', '0'), 'Rosetta/ARM host rejected')
        require(json.loads(run([node, '-p', 'JSON.stringify([process.platform,process.arch,process.version])'], 'node-identity', 30, pack))
                == ['darwin', 'x64', 'v24.21.0'], 'Node platform differs')
        run(['/usr/bin/codesign', '--verify', '--strict', daemon], 'daemon-signature', 30, pack)
        require('Mach-O 64-bit executable x86_64' in run(['/usr/bin/file', daemon], 'daemon-architecture', 30, pack), 'Daemon architecture differs')
        require(json.loads(run([daemon, '--build-metadata'], 'daemon-metadata', 30, pack)) == PIN['daemonBuildMetadata'], 'Daemon metadata differs')
        verified = json.loads(run([node, HERE/'verify-pack-profile13.mjs', pack, PIN['sourceRevision'], 'darwin', 'x64'], 'pack-verify', 180, pack))
        require(verified['manifestDigest'] == PIN['originalPackDigest'], 'Pack identity differs')
        proof['packVerification'] = verified
        proof['beforeTestIntegrity'] = complete_integrity(integrity_checks)
        require(proof['beforeTestIntegrity']['passed'], 'Pre-test integrity failed')
        test_env = {'HOME':env['HOME'], 'TMPDIR':env['TMPDIR'], 'PATH':'/usr/bin:/bin', 'LANG':env['LANG'],
                    'PI_INTEL_OWNED_TMP':str(scratch), 'PI_INTEL_RETAINED_STATE':str(retained),
                    'PAPERCLIP_TEST_PI_STARTUP_PACKAGE_ROOT':str(pack), 'PAPERCLIP_TEST_PI_STARTUP_RUNNER_BINARY':str(daemon),
                    'PAPERCLIP_TEST_PI_RUNTIME_ROOT':str(pack/'provider-assets/pi/darwin-x64/runtime/node_modules/@earendil-works/pi-coding-agent'),
                    'PAPERCLIP_TEST_PI_ACP_PACKAGE':str(pack/'provider-assets/pi/darwin-x64/runtime/node_modules/pi-acp/package.json')}
        tests = source_root/'packages/paperclip-runner/test'
        cases = [('closed-startup', [node, '--import', HERE/'retain-test-state.mjs', '--test', tests/'pi-closed-startup.test.mjs']),
                 ('native-extension-contracts', [node, '--test', tests/'pi-native-package-contract.test.mjs', tests/'pi-acp-package-contract.test.mjs'])]
        proof['testSummaries'] = {}; proof['status'] = 'testing'; save()
        def test(command, label):
            text = run(command, label, 180, pack, test_env)
            proof['testSummaries'][label] = test_summary(text, PIN['expectedTests'][label]); save()
        failures = run_test_cases(cases, test, lifecycle)
        proof['testFailures'] = failures
        require(not failures, 'Canonical test failure; no retry')
        require(set(proof['testSummaries']) == set(PIN['expectedTests']), 'Missing original test group')
        require(cancelled is None, 'Qualification cancelled')
        proof['status'] = 'native_intel_no_provider_checks_passed_pending_review'
    except BaseException as failure:
        error = failure; proof.update(status='failed_no_retry', errorType=type(failure).__name__, error=str(failure))
    finally:
        def retain():
            if (out/'retained-test-state').is_dir(): proof['retainedTestStateInventory'] = closed_tree(out/'retained-test-state')
        def remove():
            st = scratch.lstat()
            require(stat.S_ISDIR(st.st_mode) and not scratch.is_symlink()
                    and (st.st_dev, st.st_ino, st.st_uid) == scratch_id, 'Scratch identity differs')
            shutil.rmtree(scratch)
        if finalize(proof, children, lifecycle, integrity_checks, retain, remove) and error is None:
            error = RuntimeError('Final integrity/retirement incomplete')
        proof['finishedAt'] = now(); save()
    if error is not None: raise error


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True); parser.add_argument('--output', type=Path, required=True)
    execute(parser.parse_args())
