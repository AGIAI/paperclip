#!/usr/bin/env python3
"""One instrumented native Intel startup from retained exact artifacts; never qualification."""
import argparse,copy,datetime,difflib,hashlib,json,os,platform,shutil,signal,stat,subprocess,tarfile,tempfile,time
from pathlib import Path
from source_guard import require,sha
from native_daemon_reuse import extract_selected
from retain_pack import verify_archive
from closed_inventory import closed_tree
from startup_timing_patch import patch_sidecar
from owned_processes import OwnedProcesses,atomic_json
from diagnostic_lifecycle import DiagnosticChild,DiagnosticInspection
HERE=Path(__file__).resolve().parent
PIN=json.loads((HERE/'startup-diagnostic-inputs.json').read_text())

def restore_pack(archive,destination,inventory):
 verify_archive(archive,inventory)
 require(not destination.exists(),'Diagnostic extraction destination already exists')
 destination.mkdir(mode=0o700)
 with tarfile.open(archive,'r:gz') as tar:tar.extractall(destination,filter='data')
 root=destination/'provider-pack'
 # Python's data filter intentionally normalizes modes; restore only audited regular/directory modes.
 for row in inventory:
  require(row['mode'] & ~0o777 == 0,'Special archived mode rejected')
  if row['kind']!='symlink':os.chmod(root/row['path'],row['mode'],follow_symlinks=False)
 require(closed_tree(root)==inventory,'Restored pack differs from exact original inventory')
 return root

def validate_pack_delta(before,after):
 old={r['path']:r for r in before};new={r['path']:r for r in after}
 require(old.keys()==new.keys(),'Diagnostic pack file set changed')
 changed={p for p in old if old[p]!=new[p]}
 require(changed=={'dist/cli/acpx-runtime-sidecar.cjs','provider-pack.json'},'Diagnostic changed bytes outside sidecar/manifest')
 for name in changed:
  a=copy.deepcopy(old[name]);b=copy.deepcopy(new[name])
  for key in ['sha256','size']:a.pop(key,None);b.pop(key,None)
  require(a==b,'Diagnostic changed file type/mode/links')
 return sorted(changed)

def validate_timing_sink(path,identity,allowed):
 s=path.lstat()
 require(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600 and all(str(getattr(s,'st_'+k))==identity[k] for k in ['dev','ino','uid']),'Timing sink identity changed')
 data=path.read_bytes();require(0<len(data)<=32768 and data.endswith(b'\n'),'Missing, oversized or incomplete timing data')
 rows=[json.loads(line) for line in data.splitlines()]
 require(0<len(rows)<=128,'Timing row bound')
 previous=-1
 for row in rows:
  require(set(row)=={'phase','ns'} and row['phase'] in allowed and isinstance(row['ns'],str) and row['ns'].isdigit(),'Malformed timing row')
  current=int(row['ns']);require(current>=previous,'Nonmonotonic timing data');previous=current
 phases=[r['phase'] for r in rows]
 require(phases[0]=='sidecar.entry' and phases[-1]=='sidecar.exit' and 'session.open.begin' in phases,'Required diagnostic entry/open/terminal marks missing; sink or startup incomplete')
 require(phases.count('sidecar.entry')==phases.count('sidecar.exit')==1,'Duplicate sidecar execution')
 return {'rows':rows,'elapsedFromEntryMs':[{'phase':r['phase'],'milliseconds':round((int(r['ns'])-int(rows[0]['ns']))/1e6,3)} for r in rows],'sha256':sha(path),'bytes':len(data),'completeSink':True}

def reject_sink_failure(logs):
 require(len(logs)<=8,'Unexpected diagnostic log count')
 for path in logs:
  st=path.lstat()
  require(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and st.st_size<=1024*1024,'Diagnostic stderr is missing, linked or oversized')
  require(b'PC_STARTUP_DIAGNOSTIC_SINK_FAILED' not in path.read_bytes(),'Explicit diagnostic sink failure marker')

def post_run_integrity(pack,inventory,daemon,original,test,pin):
 # Every independent check runs even if another fails or timing was incomplete.
 checks={};errors={}
 actions={'pack':lambda:closed_tree(pack)==inventory,
          'daemon':lambda:sha(daemon)==pin['daemonSha256'],
          'test':lambda:sha(test)==pin['testSha256']}
 for name in ['source.tar','source-input-inventory.json','resolved-pnpm-lock.yaml']:
  actions[name]=lambda name=name:sha(original/name)==pin['selectedFiles'][name]['sha256']
 for name,check in actions.items():
  try:
   require(check(),'Post-run identity mismatch: '+name);checks[name]=True
  except BaseException as error:checks[name]=False;errors[name]=type(error).__name__+': '+str(error)
 return {'complete':True,'passed':not errors,'checks':checks,'errors':errors}

def finalize_diagnostic(proof,active,post_check,retain,remove):
 errors=[]
 try:
  if active is not None:
   if active.child is not None:active.retire(active.child)
   proof['cleanupUncertain']=active.uncertain
 except BaseException as error:
  proof['cleanupUncertain']=True;errors.append('owned cleanup: '+repr(error))
 try:
  proof['postRunIntegrity']=post_check()
  if not proof['postRunIntegrity']['passed']:errors.append('post-run integrity failed')
 except BaseException as error:errors.append('post-run integrity: '+repr(error))
 try:retain()
 except BaseException as error:errors.append('evidence retention: '+repr(error))
 if not proof['cleanupUncertain']:
  try:remove();proof['scratchRemoved']=True
  except BaseException as error:proof['cleanupUncertain']=True;errors.append('scratch cleanup: '+repr(error))
 else:errors.append('scratch retained after uncertain owned cleanup')
 if errors:
  proof.update(status='diagnostic_failed',finalizationErrors=errors)
  raise RuntimeError('; '.join(errors))

def execute(args):
 out=args.output.resolve();out.mkdir(mode=0o700,parents=True,exist_ok=False)
 scratch=Path(tempfile.mkdtemp(prefix='pc-intel-diagnostic-',dir='/private/tmp'));scratch.chmod(0o700)
 scratch_id=(scratch.stat().st_dev,scratch.stat().st_ino,scratch.stat().st_uid)
 proof={'schema':'paperclip.native-intel-startup-diagnostic/v1','status':'preparing','sourceRevision':PIN['sourceRevision'],'runId':os.environ['GITHUB_RUN_ID'],'trustedWorkflowRevision':os.environ['GITHUB_WORKFLOW_SHA'],'originalQualificationRunId':PIN['artifactRunId'],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'isQualification':False,'providerCalls':0,'credentialsRead':False,'runtimePromptsSubmitted':0,'nativeRecompiled':False,'dependencyInstallExecuted':False,'testSourceUnmodified':True,'deadlineChanged':False,'helpers':{p.name:sha(p) for p in HERE.iterdir() if p.is_file()},'commands':[],'cleanupUncertain':False,'scratchRemoved':False,'hardwareBareMetalClaim':False,'physicalColdDiskClaim':False,'cacheNote':'Artifact integrity verification necessarily reads payload before testing; no startup warmup is performed.'}
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
  proof['originalPackVerification']=json.loads(command('original-pack-verify',[node,HERE/'verify-pack.mjs',pack,PIN['sourceRevision'],'darwin','x64'],180))
  require(proof['originalPackVerification']['manifestDigest']==PIN['originalPackDigest'],'Original pack identity mismatch')
  before_manifest=json.loads((pack/'provider-pack.json').read_text())
  sink=scratch/'startup-timings.jsonl';fd=os.open(sink,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);st=os.fstat(fd);os.close(fd)
  identity={k:str(getattr(st,'st_'+k)) for k in ['dev','ino','uid']};identity['path']=str(sink)
  sidecar=pack/'dist/cli/acpx-runtime-sidecar.cjs';original_sidecar=sidecar.read_bytes();patched,patch=patch_sidecar(original_sidecar,identity)
  # Preserve original file mode; this one private copy now has an explicit diagnostic identity.
  sidecar.write_bytes(patched);atomic_json(out/'sidecar-patch.json',patch)
  (out/'sidecar.diff').write_text(''.join(difflib.unified_diff(original_sidecar.decode().splitlines(True),patched.decode().splitlines(True),fromfile='original-B9-sidecar',tofile='diagnostic-sidecar')))
  command('diagnostic-sidecar-syntax',[node,'--check',sidecar])
  proof['diagnosticPackVerification']=json.loads(command('diagnostic-pack-rebind',[node,HERE/'rebind-diagnostic-pack.mjs',pack,PIN['originalSidecarSha256'],PIN['sourceRevision']],180))
  after_manifest=json.loads((pack/'provider-pack.json').read_text());expected=copy.deepcopy(before_manifest)
  expected['payload']['artifacts']['acpxSidecar']['sha256']=after_manifest['payload']['artifacts']['acpxSidecar']['sha256']
  for key in ['distDigest','bridgeDigest']:expected['payload'][key]=after_manifest['payload'][key]
  expected['digest']=after_manifest['digest'];require(expected==after_manifest,'Diagnostic changed other manifest authority')
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
  row={'label':'original-closed-startup-test-with-diagnostic-sidecar','argv':[str(node),'--import',str(HERE/'retain-test-state.mjs'),'--test',str(test)],'outerDeadlineSeconds':70,'originalTestTimeoutMs':60000,'originalAdmissionLimitMs':30000,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'startedMonotonicNs':str(time.monotonic_ns())};proof['commands'].append(row);proof['status']='diagnostic_running';save()
  try:
   with (out/'closed-startup.log').open('xb') as log:
    result=active.execute(lambda:subprocess.Popen(row['argv'],env=tenv,cwd=pack,stdout=log,stderr=log,start_new_session=True),70)
  finally:
   row.update(finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),finishedMonotonicNs=str(time.monotonic_ns()))
   row['supervisorElapsedMs']=round((int(row['finishedMonotonicNs'])-int(row['startedMonotonicNs']))/1e6,3)
   proof['clockScope']='Supervisor uses Python monotonic_ns; sidecar uses Node hrtime.bigint. Compare elapsed spans; absolute cross-process clock equivalence is not asserted.'
   save()
  reports=list(retained.rglob('report.json'))
  if len(reports)==1:
   report=json.loads(reports[0].read_text());proof['originalTestReport']={k:report.get(k) for k in ['error','settledMs','durationMs']}
  row.update(exitCode=result,logSha256=sha(out/'closed-startup.log'));proof['originalAssertionExitCode']=result;proof['shutdown']=owner.stop_result
  reject_sink_failure([out/'closed-startup.log',*retained.rglob('runnerd.stderr.log')])
  proof['timing']=validate_timing_sink(sink,identity,set(patch['phases']));shutil.copy2(sink,out/'startup-timings.jsonl')
  atomic_json(out/'timing-summary.json',proof['timing'])
  proof.update(status='diagnostic_complete_original_test_passed' if result==0 else 'diagnostic_complete_original_test_failed',isQualification=False,finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat());save()
  return result
 except BaseException as error:
  proof.update(status='diagnostic_failed',errorType=type(error).__name__,error=str(error),finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
  if 'timing' not in proof:proof['timing']={'completeSink':False,'error':type(error).__name__+': '+str(error),'partialEvidenceRetained':(scratch/'startup-timings.jsonl').is_file()}
  raise
 finally:
  def post_check():
   if after is None or test is None:return {'complete':False,'passed':False,'reason':'diagnostic pack/test preparation not completed'}
   return post_run_integrity(pack,after,daemon,original,test,PIN)
  def retain():
   if (out/'retained-test-state').is_dir():proof['retainedTestStateInventory']=closed_tree(out/'retained-test-state')
   if (scratch/'startup-timings.jsonl').is_file() and not (out/'startup-timings.jsonl').exists():
    st=(scratch/'startup-timings.jsonl').lstat()
    if stat.S_ISREG(st.st_mode) and st.st_nlink==1 and st.st_size<=32768:shutil.copyfile(scratch/'startup-timings.jsonl',out/'startup-timings.jsonl')
  def remove():
   st=scratch.lstat();require((st.st_dev,st.st_ino,st.st_uid)==scratch_id and stat.S_ISDIR(st.st_mode),'Scratch identity changed')
   shutil.rmtree(scratch)
  try:finalize_diagnostic(proof,active,post_check,retain,remove)
  finally:save()

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
 raise SystemExit(execute(p.parse_args()))
