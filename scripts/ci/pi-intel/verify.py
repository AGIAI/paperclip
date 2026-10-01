#!/usr/bin/env python3
"""Frozen Pi1 native Intel qualification evidence; no keys, prompts, or publication."""
import argparse,datetime,difflib,hashlib,json,os,platform,shutil,signal,subprocess,sys,tempfile,time
from pathlib import Path
from closed_inventory import closed_tree
from owned_processes import OwnedProcesses,atomic_json
import source_guard

HERE=Path(__file__).resolve().parent
INPUTS=json.loads((HERE/'profile-inputs.json').read_text())
PIN=INPUTS['localComparison']
SOURCE=PIN['sourceRevision']
sha=source_guard.sha
require=source_guard.require

def execute(args):
    stage=args.source.resolve(strict=True);out=args.output.resolve()
    out.mkdir(mode=0o700,parents=True,exist_ok=False)
    scratch=Path(tempfile.mkdtemp(prefix='pc-intel-',dir='/private/tmp'));scratch.chmod(0o700)
    identity=(scratch.stat().st_dev,scratch.stat().st_ino,scratch.stat().st_uid)
    receipt={'status':'running','sourceRevision':SOURCE,'trustedWorkflowRevision':os.environ['GITHUB_WORKFLOW_SHA'],
             'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runId':os.environ['GITHUB_RUN_ID'],'runAttempt':os.environ['GITHUB_RUN_ATTEMPT'],
             'runnerLabel':'macos-15-intel','hostIsBareMetalClaim':False,'providerCalls':0,'credentialsRead':False,
             'providerPromptsSubmitted':0,'imagePublications':0,'cloudSandboxesCreated':0,'automaticRetries':0,
             'model':PIN['model'],'commands':[],'helpers':{p.name:sha(p) for p in HERE.iterdir() if p.is_file()},
             'originalTestSourceUnmodified':True,'cleanupObserverUsed':True,'localComparison':PIN}
    def save():atomic_json(out/'receipt.json',receipt)
    save()
    inherited_path=os.environ['PATH']
    node=Path(shutil.which('node')).resolve(strict=True)
    pnpm=Path(shutil.which('pnpm')).resolve(strict=True)
    rustup=Path(shutil.which('rustup')).resolve(strict=True)
    env={'PATH':inherited_path,'HOME':str(scratch/'home'),'TMPDIR':str(scratch),'LANG':'en_US.UTF-8','CI':'true',
         'PAPERCLIP_TELEMETRY_ENABLED':'false','PAPERCLIP_RUNNER_SOURCE_REVISION':SOURCE,
         'CARGO_HOME':str(scratch/'cargo'),'RUSTUP_HOME':str(scratch/'rustup'),'CARGO_TARGET_DIR':str(scratch/'target'),
         'RUSTUP_TOOLCHAIN':'1.97.1','CARGO_BUILD_JOBS':'2','npm_config_audit':'false','npm_config_fund':'false',
         'npm_config_update_notifier':'false','npm_config_package_import_method':'copy'}
    Path(env['HOME']).mkdir(mode=0o700)
    active=None;owner=None;cleanup_ok=True
    def stop_signal(signum,_):raise InterruptedError('CI stopped with signal '+str(signum))
    signal.signal(signal.SIGTERM,stop_signal)
    def run(command,label,timeout,cwd=stage,command_env=None,owned=False):
        nonlocal active,owner,cleanup_ok
        row={'label':label,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':list(map(str,command)),'deadlineSeconds':timeout,'status':'running'}
        receipt['commands'].append(row);save();start=time.monotonic()
        with (out/(label+'.log')).open('x') as log:
            try:
                active=subprocess.Popen(row['command'],cwd=cwd,env=command_env or env,stdout=log,stderr=log,start_new_session=True)
                if owned:cleanup_ok=False;owner=OwnedProcesses(out/(label+'-processes.json'),scratch,stage,pack/'dist/cli/acpx-runtime-sidecar.cjs')
                while active.poll() is None:
                    if owner:owner.observe(active.pid)
                    require(time.monotonic()-start<timeout,'Command deadline exceeded: '+label)
                    time.sleep(.1 if owner else .5)
                if owner:owner.observe(active.pid)
            finally:
                if active:
                    if owner:
                        shutdown=owner.stop(active.pid);row['shutdown']=shutdown
                        cleanup_ok=shutdown['status']=='stopped' and not owner.live()
                        require(cleanup_ok,'Owned descendants remain')
                    elif active.poll() is None:
                        require(os.getpgid(active.pid)==active.pid,'Process group identity changed')
                        os.killpg(active.pid,signal.SIGTERM)
                        try:active.wait(timeout=15)
                        except subprocess.TimeoutExpired:os.killpg(active.pid,signal.SIGKILL)
                    active.wait(timeout=10)
                    row.update(exitCode=active.returncode,durationSeconds=round(time.monotonic()-start,3),logSha256=sha(out/(label+'.log')),status='passed' if active.returncode==0 else 'failed')
                    active=None;owner=None;save()
        require(row['exitCode']==0,'Command failed without retry: '+label)
        return (out/(label+'.log')).read_text()
    def source_inventory():
        names=subprocess.check_output(['git','ls-files','-z'],cwd=stage).split(b'\0')
        return {os.fsdecode(n):sha(stage/os.fsdecode(n)) for n in names if n and (stage/os.fsdecode(n)).is_file()}
    try:
        require(platform.system()=='Darwin' and platform.machine()=='x86_64','Native Intel macOS required')
        translated=subprocess.run(['/usr/sbin/sysctl','-in','sysctl.proc_translated'],capture_output=True,text=True)
        arm=subprocess.run(['/usr/sbin/sysctl','-in','hw.optional.arm64'],capture_output=True,text=True)
        require(translated.stdout.strip() in ('','0') and arm.stdout.strip() in ('','0'),'Rosetta/ARM host rejected')
        hardware=run(['/usr/sbin/sysctl','hw.machine','machdep.cpu.vendor','machdep.cpu.brand_string'],'hardware',30)
        require('GenuineIntel' in hardware and 'x86_64' in hardware,'Intel hardware evidence missing')
        receipt['host']={'uname':platform.uname()._asdict(),'translated':translated.stdout.strip(),'translatedExitCode':translated.returncode,'arm64':arm.stdout.strip(),'arm64ExitCode':arm.returncode,'sysctl':hardware}
        require(sha(node)==PIN['nodeSha256'],'Official pinned Node bytes mismatch')
        require(json.loads(run([node,'-p','JSON.stringify([process.platform,process.arch,process.version])'],'node',30))==['darwin','x64','v24.21.0'],'Node architecture/version mismatch')
        require(run([pnpm,'--version'],'pnpm',30).strip()=='9.15.4','pnpm version mismatch')
        npm=Path(shutil.which('npm')).resolve(strict=True)
        receipt['packageManagers']={'pnpmEntrySha256':sha(pnpm),'pnpmVersion':'9.15.4','npmEntrySha256':sha(npm),'npmVersion':run([npm,'--version'],'npm-version',30).strip()}
        require(subprocess.check_output(['git','rev-parse','HEAD'],cwd=stage,text=True).strip()==SOURCE,'Wrong frozen source')
        require(not subprocess.check_output(['git','status','--porcelain'],cwd=stage),'Source checkout dirty')
        with (out/'source.tar').open('xb') as f:subprocess.run(['git','archive',SOURCE],cwd=stage,stdout=f,check=True)
        require(sha(out/'source.tar')==PIN['sourceArchiveSha256'],'Source archive mismatch')
        lock=stage/'pnpm-lock.yaml';original=lock.read_text();require(sha(lock)==PIN['trackedLockSha256'],'Tracked lock mismatch')
        require(original.count('xinuppsghzi2pwhozdhfegto3m')==4,'Unexpected overlay scope')
        resolved=original.replace('xinuppsghzi2pwhozdhfegto3m','glhukwf7nfpmpbdvrnmtdtjn5q')
        (out/'original-pnpm-lock.yaml').write_text(original);lock.write_text(resolved)
        require(sha(lock)==PIN['resolvedLockSha256'],'Resolved lock mismatch')
        shutil.copy2(lock,out/'resolved-pnpm-lock.yaml')
        (out/'lock.diff').write_text(''.join(difflib.unified_diff(original.splitlines(True),resolved.splitlines(True),fromfile='tracked-lock',tofile='resolved-lock')))
        for agent,pin in INPUTS['profiles'].items():
            p=stage/pin['path'];require(sha(p)==pin['sha256'],'Profile bytes changed: '+agent)
            data=json.loads(p.read_text());require(data['commandDigest']==pin['digest'],'Profile digest changed')
        for rel,digest in INPUTS['additionalSourceFiles'].items():require(sha(stage/rel)==digest,'Supplementary source changed: '+rel)
        receipt['sourceInputInventory']=source_inventory();atomic_json(out/'source-input-inventory.json',receipt.pop('sourceInputInventory'))
        receipt['sourceInputInventorySha256']=sha(out/'source-input-inventory.json');receipt['profiles']=INPUTS['profiles'];save()
        source_guard.verify_source(stage,SOURCE,PIN['resolvedLockSha256'])
        run([pnpm,'install','--frozen-lockfile','--ignore-scripts','--package-import-method','copy'],'install',600)
        source_guard.verify_source(stage,SOURCE,PIN['resolvedLockSha256'])
        run([pnpm,'--filter','@paperclipai/paperclip-runner','build:typescript'],'typescript',600)
        run([rustup,'toolchain','install','1.97.1','--profile','minimal','--component','rustfmt'],'rust-install',600)
        cargo=run([rustup,'which','--toolchain','1.97.1','cargo'],'cargo-path',30).strip()
        rustc=run([rustup,'which','--toolchain','1.97.1','rustc'],'rustc-path',30).strip();env['RUSTC']=rustc
        require(run([rustc,'--version'],'rust-version',30).startswith('rustc 1.97.1 '),'Wrong Rust')
        receipt['compiler']={'rustcSha256':sha(rustc),'cargoSha256':sha(cargo),'versionVerbose':run([rustc,'--version','--verbose'],'rust-version-verbose',30),'jobs':2}
        run([cargo,'build','--release','--target','x86_64-apple-darwin','--manifest-path','packages/paperclip-runner/runner/Cargo.toml','--locked','-p','paperclip-runner-core','--bin','paperclip-runnerd','-j','2'],'daemon-build',1500)
        daemon=stage/'packages/paperclip-runner/dist/bin/paperclip-runnerd';daemon.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(scratch/'target/x86_64-apple-darwin/release/paperclip-runnerd',daemon)
        run(['/usr/bin/codesign','--force','--sign','-',daemon],'daemon-sign',30)
        require('Mach-O 64-bit executable x86_64' in run(['/usr/bin/file',daemon],'daemon-architecture',30),'Wrong daemon architecture')
        receipt['daemonBuildMetadata']=json.loads(run([daemon,'--build-metadata'],'daemon-metadata',30))
        pack=scratch/'provider-pack'
        run([node,'packages/paperclip-runner/scripts/build-provider-pack.mjs',pack,'--candidate-providers=pi,copilot,cursor'],'pack-build',600)
        verified=json.loads(run([node,HERE/'verify-pack.mjs',pack,SOURCE,'darwin','x64'],'pack-verify',180))
        require(sha(pack/'node_modules/node/bin/node')==PIN['nodeSha256'],'Pack Node mismatch')
        authority={'pack':source_guard.tree(pack,allow_links=True),'dist':source_guard.tree(stage/'packages/paperclip-runner/dist'),'assets':source_guard.tree(stage/source_guard.ASSETS)}
        source_guard.verify_source(stage,SOURCE,PIN['resolvedLockSha256'],pack,authority)
        atomic_json(out/'pack-inventory.json',closed_tree(pack));shutil.copy2(pack/'provider-pack.json',out/'provider-pack.json');shutil.copy2(daemon,out/'paperclip-runnerd')
        receipt.update(packVerification=verified,packManifestSha256=sha(out/'provider-pack.json'),packInventorySha256=sha(out/'pack-inventory.json'),daemonSha256=sha(daemon),nodeSha256=sha(node),buildInputsMatchLocal=True,outputDigestsAssumedEqual=False)
        test=stage/'packages/paperclip-runner/test/pi-closed-startup.test.mjs'
        require(sha(test)=='8967cf9c8cd130b68bf9d64abef8cb8d352af00646e2288b341d8c6ae758b47a','Closed startup test changed')
        receipt['testSourceSha256']={n:sha(stage/'packages/paperclip-runner/test'/n) for n in ['pi-closed-startup.test.mjs','pi-native-package-contract.test.mjs','pi-acp-package-contract.test.mjs']};save()
        retained=out/'retained-test-state';retained.mkdir(mode=0o700)
        testenv={'HOME':str(scratch/'home'),'TMPDIR':str(scratch),'PATH':'/usr/bin:/bin','LANG':'en_US.UTF-8',
          'PI_INTEL_OWNED_TMP':str(scratch),'PI_INTEL_RETAINED_STATE':str(retained),
          'PAPERCLIP_TEST_PI_STARTUP_PACKAGE_ROOT':str(pack),'PAPERCLIP_TEST_PI_STARTUP_RUNNER_BINARY':str(daemon),
          'PAPERCLIP_TEST_PI_RUNTIME_ROOT':str(pack/'provider-assets/pi/darwin-x64/runtime/node_modules/@earendil-works/pi-coding-agent'),
          'PAPERCLIP_TEST_PI_ACP_PACKAGE':str(pack/'provider-assets/pi/darwin-x64/runtime/node_modules/pi-acp/package.json')}
        # The observer is passed only to the test process; runtime children receive no NODE_OPTIONS.
        failures=[]
        for label,command in [('closed-startup',[node,'--import',HERE/'retain-test-state.mjs','--test',test]),('native-extension-contracts',[node,'--test',stage/'packages/paperclip-runner/test/pi-native-package-contract.test.mjs',stage/'packages/paperclip-runner/test/pi-acp-package-contract.test.mjs'])]:
            try:run(command,label,180,command_env=testenv,owned=True)
            except RuntimeError as e:failures.append(str(e))
        source_guard.verify_source(stage,SOURCE,PIN['resolvedLockSha256'],pack,authority)
        require(source_inventory()==json.loads((out/'source-input-inventory.json').read_text()),'Tracked source changed')
        require(closed_tree(pack)==json.loads((out/'pack-inventory.json').read_text()),'Pack changed during tests')
        receipt['retainedTestStateInventory']=closed_tree(retained)
        receipt['testFailures']=failures;require(not failures,'Native Intel test failure; no retry')
        receipt['status']='native_intel_no_provider_checks_passed_pending_review'
    except BaseException as error:
        receipt.update(status='failed_no_retry',errorType=type(error).__name__,error=str(error));raise
    finally:
        if scratch.exists():
            st=scratch.stat();require((st.st_dev,st.st_ino,st.st_uid)==identity and st.st_uid==os.getuid(),'Scratch ownership changed')
            if cleanup_ok:shutil.rmtree(scratch);receipt['scratchCleanup']='removed_verified_owned_root'
            else:receipt['scratchCleanup']='retained_unresolved_processes'
        receipt['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);execute(parser.parse_args())
