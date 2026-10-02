#!/usr/bin/env python3
"""Four baseline/candidate exact-snapshot ABBA measurements; no provider, daemon or qualification."""
import argparse,datetime,hashlib,json,os,platform,shutil,signal,stat,subprocess,tarfile,tempfile,time
from pathlib import Path
from source_guard import require,sha
from native_daemon_reuse import extract_selected
from closed_inventory import closed_tree
from startup_diagnostic import restore_pack,finalize_diagnostic
from diagnostic_lifecycle import DiagnosticChild,DiagnosticInspection
from owned_processes import OwnedProcesses,atomic_json
HERE=Path(__file__).resolve().parent
PIN=json.loads((HERE/'snapshot-streaming-inputs.json').read_text())

def admit_copy(index,variant,remaining,cancelled,uncertain):
 require(not cancelled and not uncertain,'Cancelled or uncertain experiment cannot launch another copy')
 require(type(index) is int and 0<=index<4 and variant==["baseline","candidate","candidate","baseline"][index],'Only the exact four-copy ABBA sequence is admitted')
 require(remaining>=90+120+60,'Full copy, cleanup and final-integrity windows no longer fit')

def child_environment(home,tmp):
 return {'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','HOME':str(home),'LANG':'en_US.UTF-8','TMPDIR':str(tmp),'UV_THREADPOOL_SIZE':'4'}

def verify_report(path,variant,pin=PIN):
 st=path.lstat();require(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and st.st_size<=16384,'Unsafe copy receipt')
 r=json.loads(path.read_text())
 require(variant in ('baseline','candidate') and r['variant']==variant,'Wrong experiment variant')
 require(r['status']=='snapshot_verified_not_executed' and r['isQualification'] is False and r['poolRequestedAtProcessStart']==4 and r['actualThreadCountMeasured'] is False,'Copy receipt identity/status mismatch')
 expected=pin['moduleSha256'] if variant=='baseline' else pin['candidateModuleSha256']
 require(r['moduleSha256']==expected and r['providerCalls']==r['vendorProcessesStarted']==0,'Copy code/execution scope mismatch')
 require(all(r[k] is True for k in ['snapshotClosed','commandDirectoryClosed','temporaryRootEmpty']) and r['cleanupErrors']==[],'Copy cleanup incomplete')
 require(r['sealedOutput']=={'files':pin['entries']+2,'bytes':pin['distributionBytes'],'handoffVerified':True,'descriptorIdentityVerified':True},'Incomplete sealed snapshot verification')
 require(type(r['snapshotMilliseconds']) in (int,float) and 0<r['snapshotMilliseconds']<90000,'Invalid copy duration')
 return r

def verify_baseline_source(archive,pin=PIN):
 name='packages/paperclip-runner/src/drivers/acpx/native-distribution-integrity.ts'
 with tarfile.open(archive,'r:') as source:
  rows=[m for m in source.getmembers() if m.name==name]
  require(len(rows)==1 and rows[0].isreg() and 0<rows[0].size<=131072,'Missing or unsafe baseline source member')
  with source.extractfile(rows[0]) as member:payload=member.read(131073)
 require(len(payload)==rows[0].size and hashlib.sha256(payload).hexdigest()==pin['baselineSourceSha256'],'Baseline source identity mismatch')
 return payload

def post_integrity(pack,inventory,original,pin):
 checks={};errors={}
 actions={'pack':lambda:closed_tree(pack)==inventory,'candidateModule':lambda:sha(HERE/'snapshot-streaming-candidate.mjs')==pin['candidateModuleSha256'],'candidateSource':lambda:sha(HERE/'snapshot-streaming-candidate.ts')==pin['candidateSourceSha256']}
 for name,row in pin['selectedFiles'].items():actions[name]=lambda name=name,row=row:sha(original/name)==row['sha256']
 for name,check in actions.items():
  try:require(check(),'Identity mismatch: '+name);checks[name]=True
  except BaseException as error:checks[name]=False;errors[name]=repr(error)
 return {'complete':True,'passed':not errors,'checks':checks,'errors':errors}

def assert_complete(proof):
 integrity=proof.get('postRunIntegrity',{})
 require(proof.get('status')=='comparison_complete_not_qualification' and proof.get('cleanupUncertain') is False and proof.get('scratchRemoved') is True and integrity.get('complete') is True and integrity.get('passed') is True and not integrity.get('errors') and integrity.get('checks') and all(v is True for v in integrity['checks'].values()),'Comparison finalization did not establish complete integrity and owned cleanup')

def execute(args):
 out=args.output.resolve();out.mkdir(mode=0o700,parents=True,exist_ok=False)
 scratch=Path(tempfile.mkdtemp(prefix='pc-snapshot-streaming-',dir='/private/tmp'));scratch.chmod(0o700)
 initial=scratch.stat();identity=(initial.st_dev,initial.st_ino,initial.st_uid)
 proof={'schema':'paperclip.native-intel-snapshot-streaming/v1','status':'preparing','sourceRevision':PIN['sourceRevision'],'runId':os.environ['GITHUB_RUN_ID'],'trustedWorkflowRevision':os.environ['GITHUB_WORKFLOW_SHA'],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'isQualification':False,'providerCalls':0,'runtimePromptsSubmitted':0,'vendorProcessesStarted':0,'nativeRecompiled':False,'dependencyInstallExecuted':False,'sourceOrPackModified':False,'actualThreadCountMeasured':False,'poolBinding':'Identical explicit UV_THREADPOOL_SIZE=4 in all four children','candidateScope':'Separately compiled unpublished streaming derivative; original pack and built baseline remain byte-identical','cacheLimitation':'Full archive admission reads all bytes before ABBA. Four sequential samples measure this host and warm-cache order only, not canonical cold startup or end-to-end qualification.','helpers':{p.name:sha(p) for p in HERE.iterdir() if p.is_file()},'copies':[],'cleanupUncertain':False,'scratchRemoved':False}
 active=None;cancelled=None;pack=None;inventory=None;original=None;experiment_started=None
 def save():atomic_json(out/'receipt.json',proof)
 def cancel(sig,_):
  nonlocal cancelled
  cancelled='signal '+str(sig)
  if active is not None:active.cancel(cancelled)
 signal.signal(signal.SIGTERM,cancel);signal.signal(signal.SIGINT,cancel)
 save()
 try:
  require(platform.system()=='Darwin' and platform.machine()=='x86_64','Native Intel required')
  env={'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','LANG':'en_US.UTF-8'}
  for flag in ['sysctl.proc_translated','hw.optional.arm64']:
   r=subprocess.run(['/usr/sbin/sysctl','-in',flag],capture_output=True,text=True,env=env,timeout=10)
   require(r.stdout.strip() in ('','0'),'Rosetta/ARM rejected');proof[flag]={'value':r.stdout.strip(),'exitCode':r.returncode}
  hardware=subprocess.run(['/usr/sbin/sysctl','hw.machine','machdep.cpu.vendor','machdep.cpu.brand_string'],capture_output=True,text=True,env=env,timeout=10)
  require(hardware.returncode==0 and 'GenuineIntel' in hardware.stdout and 'x86_64' in hardware.stdout,'Intel identity missing');(out/'hardware.log').write_text(hardware.stdout)
  require(not cancelled,'Cancelled before artifact preparation')
  original=extract_selected(args.archive,scratch/'original-artifact',PIN)
  baseline_source=verify_baseline_source(original/'source.tar');(out/'baseline-native-distribution-integrity.ts').write_bytes(baseline_source)
  original_receipt=json.loads((original/'receipt.json').read_text())
  require(all(original_receipt[k]==PIN[v] for k,v in [('sourceRevision','sourceRevision'),('runId','artifactRunId'),('trustedWorkflowRevision','artifactWorkflowRevision')]),'Original source/workflow/run mismatch')
  require(original_receipt['status']=='failed_no_retry' and original_receipt['cleanupUncertain'] is False,'Original failure/cleanup provenance mismatch')
  refs=out/'original-reference';refs.mkdir(mode=0o700)
  for name in ['receipt.json','provider-pack.json','pack-inventory.json','source-input-inventory.json','resolved-pnpm-lock.yaml']:shutil.copy2(original/name,refs/name)
  atomic_json(out/'original-input-pins.json',PIN)
  inventory=json.loads((original/'pack-inventory.json').read_text());pack=restore_pack(original/'provider-pack.tar.gz',scratch/'unpacked',inventory)
  node=pack/'node_modules/node/bin/node'
  for path,digest in [(node,PIN['nodeSha256']),(pack/PIN['modulePath'],PIN['moduleSha256']),(pack/PIN['closureManifestPath'],PIN['closureManifestSha256'])]:require(sha(path)==digest,'Exact executable/module/closure mismatch')
  require(sha(HERE/'snapshot-streaming-candidate.mjs')==PIN['candidateModuleSha256'] and sha(HERE/'snapshot-streaming-candidate.ts')==PIN['candidateSourceSha256'],'Candidate code changed')
  for name in ['snapshot-streaming-fixture.mjs','snapshot-streaming-inputs.json','snapshot-streaming-candidate.mjs','snapshot-streaming-candidate.ts','snapshot-pool-fixture.mjs']:shutil.copy2(HERE/name,out/name)
  shutil.copy2(pack/PIN['modulePath'],out/'native-distribution-integrity.js')
  require(PIN['variants']==['baseline','candidate','candidate','baseline'] and PIN['maximumCopies']==4 and PIN['experimentDeadlineSeconds']==600 and PIN['perCopyDeadlineSeconds']==90 and PIN['cleanupReserveSeconds']==120 and PIN['finalIntegrityReserveSeconds']==60,'Experiment bounds changed')
  experiment_started=time.monotonic();deadline=experiment_started+600
  proof.update(status='measuring',experimentStartedAt=datetime.datetime.now(datetime.timezone.utc).isoformat());save()
  for index,variant in enumerate(PIN['variants']):
   admit_copy(index,variant,deadline-time.monotonic(),cancelled,proof['cleanupUncertain'])
   copy_root=scratch/('copy-'+str(index));copy_root.mkdir(mode=0o700)
   home=copy_root/'home';home.mkdir(mode=0o700);tmp=copy_root/'tmp';tmp.mkdir(mode=0o700)
   report=out/('copy-'+str(index)+'.json');log=out/('copy-'+str(index)+'.log')
   owner=OwnedProcesses(out/('copy-'+str(index)+'-processes.json'),scratch,pack,pack/'dist/cli/acpx-runtime-sidecar.cjs')
   active=DiagnosticChild(owner);inspection=DiagnosticInspection(owner,active);owner.table=inspection.table;owner.argv=inspection.argv
   if cancelled:active.cancel(cancelled)
   row={'index':index,'variant':variant,'outerDeadlineSeconds':90,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()};proof['copies'].append(row);save()
   def spawn():
    # Recheck after publishing the new lifecycle; a cancellation before this
    # exact boundary cannot escape through the previous child's gate.
    if cancelled:active.cancel(cancelled);raise InterruptedError(cancelled)
    admit_copy(index,variant,deadline-time.monotonic(),cancelled,proof['cleanupUncertain'])
    return subprocess.Popen([str(node),str(HERE/'snapshot-streaming-fixture.mjs'),str(pack),str(HERE/'snapshot-streaming-inputs.json'),variant,str(report)],env=child_environment(home,tmp),cwd=pack,stdout=output,stderr=output,start_new_session=True)
   with log.open('xb') as output:result=active.execute(spawn,90)
   row.update(exitCode=result,logSha256=sha(log),finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),shutdown=owner.stop_result)
   proof['cleanupUncertain']=active.uncertain;save()
   require(result==0,'Snapshot child failed; no later copy will launch')
   row['measurement']=verify_report(report,variant);row['reportSha256']=sha(report);save()
  require(not cancelled,'Experiment cancelled before completion')
  proof.update(status='comparison_complete_not_qualification',meansMilliseconds={v:sum(r['measurement']['snapshotMilliseconds'] for r in proof['copies'] if r['variant']==v)/2 for v in ['baseline','candidate']})
  return 0
 except BaseException as error:
  proof.update(status='comparison_failed_no_retry',errorType=type(error).__name__,error=str(error));raise
 finally:
  def post():
   if pack is None:return {'complete':False,'passed':False,'reason':'pack preparation incomplete'}
   return post_integrity(pack,inventory,original,PIN)
  def retain():
   proof['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
   if experiment_started is not None:proof['experimentThroughIntegritySeconds']=time.monotonic()-experiment_started
  def remove():
   st=scratch.lstat();require(stat.S_ISDIR(st.st_mode) and (st.st_dev,st.st_ino,st.st_uid)==identity,'Scratch identity changed')
   # A forcibly retired copy may leave sealed 0500 snapshot directories. Only
   # this owned scratch is made removable, after retirement and integrity audit.
   for root,dirs,_ in os.walk(scratch,followlinks=False):
    require(not Path(root).is_symlink(),'Scratch directory replaced by link');os.chmod(root,0o700,follow_symlinks=False)
   shutil.rmtree(scratch)
  try:
   finalize_diagnostic(proof,active,post,retain,remove)
   if experiment_started is not None:
    proof['experimentIncludingCleanupSeconds']=time.monotonic()-experiment_started
    if proof['experimentIncludingCleanupSeconds']>600:
     proof['status']='comparison_failed_no_retry'
     raise RuntimeError('Experiment exceeded its 600-second bound; cleanup completed')
   if cancelled:
    proof['status']='comparison_failed_no_retry'
    raise InterruptedError(cancelled+'; owned cleanup completed')
   try:assert_complete(proof)
   except BaseException:
    proof['status']='comparison_failed_no_retry';raise
  finally:save()

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
 raise SystemExit(execute(p.parse_args()))
