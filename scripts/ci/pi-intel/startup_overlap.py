#!/usr/bin/env python3
"""One original native Intel startup with a separately bound overlap prototype; never qualification."""
import argparse,copy,datetime,difflib,hashlib,json,os,platform,shutil,signal,stat,subprocess,tarfile,tempfile,time
from pathlib import Path
from source_guard import require,sha
from native_daemon_reuse import extract_selected
from retain_pack import verify_archive
from closed_inventory import closed_tree
from startup_overlap_patch import apply_overlap
from owned_processes import OwnedProcesses,atomic_json
from diagnostic_lifecycle import DiagnosticChild,DiagnosticInspection
HERE=Path(__file__).resolve().parent
PIN=json.loads((HERE/'startup-overlap-inputs.json').read_text())

from startup_diagnostic import restore_pack,validate_pack_delta,post_run_integrity,finalize_diagnostic

def execute(args):
 out=args.output.resolve();out.mkdir(mode=0o700,parents=True,exist_ok=False)
 scratch=Path(tempfile.mkdtemp(prefix='pc-intel-diagnostic-',dir='/private/tmp'));scratch.chmod(0o700)
 scratch_id=(scratch.stat().st_dev,scratch.stat().st_ino,scratch.stat().st_uid)
 proof={'schema':'paperclip.native-intel-startup-overlap-experiment/v1','status':'preparing','sourceRevision':PIN['sourceRevision'],'runId':os.environ['GITHUB_RUN_ID'],'trustedWorkflowRevision':os.environ['GITHUB_WORKFLOW_SHA'],'originalQualificationRunId':PIN['artifactRunId'],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'isQualification':False,'providerCalls':0,'credentialsRead':False,'runtimePromptsSubmitted':0,'nativeRecompiled':False,'dependencyInstallExecuted':False,'testSourceUnmodified':True,'deadlineChanged':False,'helpers':{p.name:sha(p) for p in HERE.iterdir() if p.is_file()},'commands':[],'cleanupUncertain':False,'scratchRemoved':False,'hardwareBareMetalClaim':False,'physicalColdDiskClaim':False,'cacheNote':'Artifact integrity verification necessarily reads payload before testing; no startup warmup is performed.','prototypeSource':PIN['prototypeSource'],'timingInstrumentation':False,'originalSourceRole':'frozen base provenance; sidecar is explicitly a two-module unpublished derivative'}
 def save():atomic_json(out/'receipt.json',proof)
 active=None;pack=None;after=None;daemon=None;original=None;test=None
 def cancelled(sig,_):
  if active is not None:active.cancel('signal '+str(sig))
  else:raise InterruptedError('Diagnostic cancelled')
 signal.signal(signal.SIGTERM,cancelled);signal.signal(signal.SIGINT,cancelled)
 env={'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','HOME':str(scratch/'home'),'LANG':'en_US.UTF-8','TMPDIR':str(scratch)};Path(env['HOME']).mkdir(mode=0o700)
 def command(label,argv,timeout=30):
  row={'label':label,'argv':list(map(str,argv)),'deadlineSeconds':timeout};proof['commands'].append(row);save()
  with (out/(label+'.log')).open('xb') as log:r=subprocess.run(row['argv'],env=env,cwd=scratch,stdout=log,stderr=log,timeout=timeout)
  row.update(exitCode=r.returncode,logSha256=sha(out/(label+'.log')));save();require(r.returncode==0,'Diagnostic preparation failed: '+label)
  return (out/(label+'.log')).read_text()
 save()
 try:
  require(platform.system()=='Darwin' and platform.machine()=='x86_64','Native Intel required')
  for flag in ['sysctl.proc_translated','hw.optional.arm64']:
   r=subprocess.run(['/usr/sbin/sysctl','-in',flag],capture_output=True,text=True,env=env,timeout=10)
   require(r.stdout.strip() in ('','0'),'Rosetta/ARM rejected');proof[flag]={'value':r.stdout.strip(),'exitCode':r.returncode}
  hardware=command('hardware',['/usr/sbin/sysctl','hw.machine','machdep.cpu.vendor','machdep.cpu.brand_string'])
  require('GenuineIntel' in hardware and 'x86_64' in hardware,'Intel hardware evidence missing')
  original=extract_selected(args.archive,scratch/'original-artifact',PIN)
  references=out/'original-reference';references.mkdir(mode=0o700)
  for name in ['receipt.json','provider-pack.json','pack-inventory.json','source-input-inventory.json','resolved-pnpm-lock.yaml']:shutil.copy2(original/name,references/name)
  atomic_json(out/'original-input-pins.json',PIN)
  receipt=json.loads((original/'receipt.json').read_text());require(receipt['sourceRevision']==PIN['sourceRevision'] and receipt['runId']==PIN['artifactRunId'] and receipt['trustedWorkflowRevision']==PIN['artifactWorkflowRevision'],'Original artifact provenance mismatch')
  require(receipt['cleanupUncertain'] is False and receipt['status']=='failed_no_retry','Unexpected original qualification disposition')
  proof['originalFailure']={'status':receipt['status'],'testFailures':receipt.get('testFailures'),'packArchiveSha256':sha(original/'provider-pack.tar.gz'),'daemonSha256':sha(original/'paperclip-runnerd')}
  require(sha(original/'paperclip-runnerd')==PIN['daemonSha256'] and sha(original/'resolved-pnpm-lock.yaml')==PIN['resolvedLockSha256'],'Original daemon/lock mismatch')
  inventory=json.loads((original/'pack-inventory.json').read_text());pack=restore_pack(original/'provider-pack.tar.gz',scratch/'unpacked',inventory)
  node=pack/'node_modules/node/bin/node';daemon=scratch/'paperclip-runnerd';shutil.copyfile(original/'paperclip-runnerd',daemon);daemon.chmod(0o755)
  require(sha(node)==PIN['nodeSha256'] and sha(daemon)==PIN['daemonSha256'],'Native executable changed')
  require(json.loads(command('node-identity',[node,'-p','JSON.stringify([process.platform,process.arch,process.version])']))==['darwin','x64','v24.21.0'],'Node platform mismatch')
  command('daemon-signature',['/usr/bin/codesign','--verify','--strict',daemon]);require('Mach-O 64-bit executable x86_64' in command('daemon-architecture',['/usr/bin/file',daemon]),'Daemon architecture mismatch')
  proof['originalPackVerification']=json.loads(command('original-pack-verify',[node,HERE/('verify-pack-profile13.mjs' if PIN.get('profileVersion')==13 else 'verify-pack.mjs'),pack,PIN['sourceRevision'],'darwin','x64'],180))
  require(proof['originalPackVerification']['manifestDigest']==PIN['originalPackDigest'],'Original pack identity mismatch')
  before_manifest=json.loads((pack/'provider-pack.json').read_text())
  patch_path=HERE/'startup-overlap-patch.json'
  require(sha(patch_path)==PIN['prototypePatchSha256'],'Prototype patch identity changed')
  patch=json.loads(patch_path.read_text())
  require(patch['originalSha256']==PIN['originalSidecarSha256'] and patch['candidateSha256']==PIN['prototypeSidecarSha256'],'Prototype source/output binding mismatch')
  require(patch['sourceChanges']==PIN['prototypeSource']['changes'],'Unexpected prototype source delta')
  sidecar=pack/'dist/cli/acpx-runtime-sidecar.cjs';original_sidecar=sidecar.read_bytes();patched=apply_overlap(original_sidecar,patch)
  sidecar.write_bytes(patched);atomic_json(out/'sidecar-patch.json',patch)
  (out/'sidecar.diff').write_text(''.join(difflib.unified_diff(original_sidecar.decode().splitlines(True),patched.decode().splitlines(True),fromfile='original-f5-profile13-sidecar',tofile='unpublished-overlap-sidecar')))
  command('diagnostic-sidecar-syntax',[node,'--check',sidecar])
  proof['diagnosticPackVerification']=json.loads(command('diagnostic-pack-rebind',[node,HERE/'rebind-diagnostic-pack.mjs',pack,PIN['originalSidecarSha256'],PIN['sourceRevision'],*(['profile13'] if PIN.get('profileVersion')==13 else [])],180))
  require(proof['diagnosticPackVerification']['manifestDigest']==PIN['prototypePackDigest'],'Prototype pack differs from independently derived inventory identity')
  after_manifest=json.loads((pack/'provider-pack.json').read_text());expected=copy.deepcopy(before_manifest)
  expected['payload']['artifacts']['acpxSidecar']['sha256']=after_manifest['payload']['artifacts']['acpxSidecar']['sha256']
  for key in ['distDigest','bridgeDigest']:expected['payload'][key]=after_manifest['payload'][key]
  expected['digest']=after_manifest['digest'];require(expected==after_manifest,'Diagnostic changed other manifest authority')
  proof['closureBinding']={'before':before_manifest['payload']['candidateProviders']['pi'],'after':after_manifest['payload']['candidateProviders']['pi'],'daemonSha256':sha(daemon),'nativeBytesChanged':False}
  after=closed_tree(pack);proof['allowedPackDelta']=validate_pack_delta(inventory,after);atomic_json(out/'diagnostic-pack-inventory.json',after)
  shutil.copy2(pack/'provider-pack.json',out/'diagnostic-provider-pack.json')
  shutil.copy2(sidecar,out/'diagnostic-acpx-runtime-sidecar.cjs')
  proof['diagnosticReconstruction']={'originalArtifactId':PIN['artifactId'],'originalZipSha256':PIN['artifactZipSha256'],'originalPackTarSha256':PIN['selectedFiles']['provider-pack.tar.gz']['sha256'],'replaceOnly':['dist/cli/acpx-runtime-sidecar.cjs','provider-pack.json'],'sidecarSha256':sha(out/'diagnostic-acpx-runtime-sidecar.cjs'),'manifestSha256':sha(out/'diagnostic-provider-pack.json'),'inventorySha256':sha(out/'diagnostic-pack-inventory.json'),'fullOriginalPackDuplicated':False,'diagnosticPackArchiveDuplicated':False}
  test=out/'pi-closed-startup.test.mjs'
  with tarfile.open(original/'source.tar','r:') as source:
   member=source.getmember(PIN['testPath']);require(member.isfile(),'Original test is not regular');test.write_bytes(source.extractfile(member).read())
  require(sha(test)==PIN['testSha256'] and sha(HERE/'retain-test-state.mjs')==PIN['observerSha256'],'Test/observer changed');test.chmod(0o444);shutil.copy2(HERE/'retain-test-state.mjs',out/'retain-test-state.mjs')
  retained=out/'retained-test-state';retained.mkdir(mode=0o700)
  tenv={**env,'PAPERCLIP_TEST_PI_STARTUP_PACKAGE_ROOT':str(pack),'PAPERCLIP_TEST_PI_STARTUP_RUNNER_BINARY':str(daemon),'PI_INTEL_OWNED_TMP':str(scratch),'PI_INTEL_RETAINED_STATE':str(retained)}
  owner=OwnedProcesses(out/'closed-startup-processes.json',scratch,pack,sidecar);active=DiagnosticChild(owner)
  inspection=DiagnosticInspection(owner,active);owner.table=inspection.table;owner.argv=inspection.argv
  proof['processInspection']={'activeCadenceSeconds':0.5,'maximumCallSeconds':5,'defaultSharedCallSeconds':2,'deadlineCap':'remaining active70s or existing cleanup100s','activeFailuresFatal':True,'activeInspectionRetries':0}
  row={'label':'original-closed-startup-test-with-unpublished-overlap-sidecar','argv':[str(node),'--import',str(HERE/'retain-test-state.mjs'),'--test',str(test)],'outerDeadlineSeconds':70,'originalTestTimeoutMs':60000,'originalAdmissionLimitMs':30000,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'startedMonotonicNs':str(time.monotonic_ns())};proof['commands'].append(row);proof['status']='diagnostic_running';save()
  try:
   with (out/'closed-startup.log').open('xb') as log:
    result=active.execute(lambda:subprocess.Popen(row['argv'],env=tenv,cwd=pack,stdout=log,stderr=log,start_new_session=True),70)
  finally:
   row.update(finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),finishedMonotonicNs=str(time.monotonic_ns()))
   row['supervisorElapsedMs']=round((int(row['finishedMonotonicNs'])-int(row['startedMonotonicNs']))/1e6,3)
   proof['clockScope']='Only original test report durations and supervisor monotonic duration are recorded; no cross-process clock subtraction or inner-phase attribution.'
   save()
  reports=list(retained.rglob('report.json'))
  if len(reports)==1:
   report=json.loads(reports[0].read_text());proof['originalTestReport']={k:report.get(k) for k in ['error','settledMs','durationMs']}
  row.update(exitCode=result,logSha256=sha(out/'closed-startup.log'));proof['originalAssertionExitCode']=result;proof['shutdown']=owner.stop_result
  proof.update(status='experiment_complete_original_test_passed' if result==0 else 'experiment_complete_original_test_failed',isQualification=False,finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat());save()
  return result
 except BaseException as error:
  proof.update(status='diagnostic_failed',errorType=type(error).__name__,error=str(error),finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
  raise
 finally:
  def post_check():
   if after is None or test is None:return {'complete':False,'passed':False,'reason':'diagnostic pack/test preparation not completed'}
   return post_run_integrity(pack,after,daemon,original,test,PIN)
  def retain():
   if (out/'retained-test-state').is_dir():proof['retainedTestStateInventory']=closed_tree(out/'retained-test-state')
  def remove():
   st=scratch.lstat();require((st.st_dev,st.st_ino,st.st_uid)==scratch_id and stat.S_ISDIR(st.st_mode),'Scratch identity changed')
   shutil.rmtree(scratch)
  try:finalize_diagnostic(proof,active,post_check,retain,remove)
  finally:save()

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
 raise SystemExit(execute(p.parse_args()))
