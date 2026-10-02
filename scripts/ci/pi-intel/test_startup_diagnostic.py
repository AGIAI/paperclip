import copy,hashlib,json,os,subprocess,tempfile,unittest
from pathlib import Path
from startup_timing_patch import patch_sidecar,ORIGINAL_SHA
from startup_diagnostic import validate_pack_delta,validate_timing_sink,reject_sink_failure,post_run_integrity,finalize_diagnostic,PIN
from diagnostic_lifecycle import DiagnosticChild,DiagnosticInspection
from owned_processes import process_table,command_tokens,ProcessInspectionUnavailable
from unittest.mock import patch
from types import SimpleNamespace

class FakeProcess:
 pid=111;returncode=0
 def __init__(self,fail_wait=False):self.fail_wait=fail_wait
 def poll(self):return 0
 def wait(self,timeout):
  if self.fail_wait:raise RuntimeError('wait failed')
  return 0
class FakeOwner:
 def __init__(self,fail_stop=False):self.fail_stop=fail_stop;self.stops=0
 def observe(self,pid):pass
 def stop(self,pid):
  self.stops+=1
  if self.fail_stop:raise RuntimeError('stop failed')
  return {'status':'stopped'}
 def live(self):return set()

class DiagnosticTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.original=Path(os.environ['PI_DIAGNOSTIC_ORIGINAL_SIDECAR']).read_bytes()
 def binding(self,root):
  p=root/'startup-timings.jsonl';p.touch(mode=0o600);s=p.stat()
  return p,{'path':str(p),**{k:str(getattr(s,'st_'+k)) for k in ['dev','ino','uid']}}
 def test_patch_is_exact_additions_only(self):
  sink={'path':'/private/tmp/pc-intel-diagnostic-fixture/startup-timings.jsonl','dev':'1','ino':'2','uid':'501'}
  patched,proof=patch_sidecar(self.original,sink);text=patched.decode();shift=0
  for change in proof['insertions']:
   at=change['offset']+shift;self.assertEqual(text[at:at+len(change['inserted'])],change['inserted']);shift+=len(change['inserted'])
  for change in reversed(proof['insertions']):
   shift-=len(change['inserted']);at=change['offset']+shift;text=text[:at]+text[at+len(change['inserted']):]
  self.assertEqual(text.encode(),self.original);self.assertEqual(hashlib.sha256(text.encode()).hexdigest(),ORIGINAL_SHA)
  self.assertEqual(len(proof['phases']),54)
 def test_current_bba_patch_and_exact_retained_provenance(self):
  from startup_timing_patch import BBA_SHA
  from retained_qualification import validate_original,RetainedChild
  current=json.loads((Path(__file__).parent/'startup-diagnostic-bba-inputs.json').read_text())
  original=Path(os.environ['PI_DIAGNOSTIC_BBA_SIDECAR']).read_bytes()
  modified,proof=patch_sidecar(original,{'path':'/private/tmp/pc-intel-diagnostic-fixture/startup-timings.jsonl','dev':'1','ino':'2','uid':'501'},BBA_SHA)
  self.assertEqual(proof['originalSha256'],BBA_SHA)
  text=modified.decode();shift=sum(len(x['inserted']) for x in proof['insertions'])
  for change in reversed(proof['insertions']):
   shift-=len(change['inserted']);at=change['offset']+shift
   self.assertEqual(text[at:at+len(change['inserted'])],change['inserted'])
   text=text[:at]+text[at+len(change['inserted']):]
  self.assertEqual(text.encode(),original);self.assertEqual(len(proof['phases']),54)
  self.assertEqual(current['sourceRevision'],'bba63f51207de8513ad2d9593694f718fc60ef17')
  self.assertEqual(current['artifactRunId'],'37004499595')
  self.assertTrue(current['repairedObserver']);self.assertTrue(current['compilerProvenanceValidated'])
  self.assertEqual(current['originalSidecarSha256'],BBA_SHA)
  self.assertEqual(current['testSha256'],PIN['testSha256'])
  validate_original(Path(os.environ['PI_DIAGNOSTIC_BBA_ORIGINAL_ARTIFACT']),current)
  with self.assertRaisesRegex(RuntimeError,'original digest mismatch'):
   patch_sidecar(original,{'path':'unused','dev':'1','ino':'2','uid':'3'})
  workflow=(Path(__file__).parents[3]/'.github/workflows/docker-runner-check.yml').read_text()
  job=workflow.split('  manual_pi_startup_diagnostic:',1)[1].split('  manual_pi_startup_overlap:',1)[0]
  self.assertIn('--inputs bba',job);self.assertIn('artifacts/11226760000/zip',job)
  self.assertIn(current['artifactZipSha256'],job)
  fallback=workflow.split('  manual_image:',1)[1].split('\n    needs:',1)[0]
  self.assertIn('!inputs.diagnose_pi_startup',fallback)
 def test_wrong_original_rejected(self):
  with self.assertRaises(RuntimeError):patch_sidecar(self.original+b' ',{'path':'unused','dev':'1','ino':'2','uid':'3'})
 def test_retained_f5_pack_identity_and_original_test_contract(self):
  self.assertEqual(PIN['sourceRevision'],'f5c5fde380f60937ef26cc5a92e1d6a043e9cddc')
  self.assertEqual(PIN['artifactRunId'],'36984851998')
  self.assertEqual(PIN['artifactId'],'11218057612')
  self.assertEqual(PIN['originalSidecarSha256'],ORIGINAL_SHA)
  self.assertEqual(PIN['selectedFiles']['paperclip-runnerd']['sha256'],PIN['daemonSha256'])
  self.assertEqual(PIN['selectedFiles']['resolved-pnpm-lock.yaml']['sha256'],PIN['resolvedLockSha256'])
  self.assertEqual(PIN['testSha256'],'32bb057e1505082c0ed6b1d71cdd8cdb3271d920c2bea9cdc1ebddedf568c0c4')
  self.assertEqual((PIN['executionCount'],PIN['providerCalls'],PIN['timeoutChanges']),(1,0,False))
  self.assertEqual((PIN['archiveBytesMaximum'],PIN['retentionDays']),(268435456,7))
 def test_f5_markers_follow_outer_layout_and_snapshot_boundaries(self):
  _,proof=patch_sidecar(self.original,{'path':'/private/tmp/pc-intel-diagnostic-fixture/startup-timings.jsonl','dev':'1','ino':'2','uid':'501'})
  phases=proof['phases']
  self.assertFalse(any(p.startswith('pi.hash.') for p in phases))
  for begin,end in [('pi.native_manifest.begin','pi.native_manifest.end'),('pi.discovery.begin','pi.discovery.end'),('pi.layout.begin','pi.layout.end'),('snapshot.directories.begin','snapshot.directories.end'),('snapshot.copy.begin','snapshot.copy.end'),('snapshot.seal.begin','snapshot.seal.end')]:
   self.assertEqual(phases.count(begin),1);self.assertEqual(phases.count(end),1)
  # Discovery recursion and descriptor-copy loops must not emit one row per file.
  source=self.original.decode()
  for begin,end in [('  const visit = async (directory) => {','  await visit(physicalRoot);'),('    const copyEntry = async (entry) => {','    const active = /* @__PURE__ */ new Set();')]:
   start=source.index(begin);finish=source.index(end,start)
   interior=[x for x in proof['insertions'] if start < x['offset'] < finish]
   self.assertEqual(interior,[])
 def test_pi_acp_markers_preserve_actual_admission_and_no_native_rpc_claim(self):
  _,proof=patch_sidecar(self.original,{'path':'/private/tmp/pc-intel-diagnostic-fixture/startup-timings.jsonl','dev':'1','ino':'2','uid':'501'})
  for phase in ['acp.initialize.begin','acp.initialize.response','pi.acp.session.request','pi.acp.correlated.response','pi.acp.mode.verified','pi.acp.thought_level.begin','pi.acp.thought_level.verified']:
   self.assertEqual(proof['phases'].count(phase),1)
  self.assertFalse(any('get_state' in phase for phase in proof['phases']))
  source=self.original.decode()
  selected=next(x for x in proof['insertions'] if 'Mark("pi.acp.thought_level.verified")' in x['inserted'])
  self.assertTrue(source[:selected['offset']].endswith('      piThinking.assertReady();'))
 def test_unknown_rebind_profile_rejects_before_any_pack_access(self):
  result=subprocess.run([os.environ['PI_DIAGNOSTIC_TEST_NODE'],str(Path(__file__).parent/'rebind-diagnostic-pack.mjs'),'/nonexistent-pack','0'*64,'0'*40,'unknown'],capture_output=True,text=True,timeout=5)
  self.assertNotEqual(result.returncode,0);self.assertIn('Unexpected diagnostic profile mode',result.stderr);self.assertNotIn('ENOENT',result.stderr)
 def test_missing_terminal_retains_incomplete_classification(self):
  with tempfile.TemporaryDirectory() as tmp:
   p,b=self.binding(Path(tmp))
   p.write_text(''.join(json.dumps({'phase':phase,'ns':str(i)})+'\n' for i,phase in enumerate(['sidecar.entry','session.open.begin','snapshot.copy.begin'])))
   with self.assertRaisesRegex(RuntimeError,'terminal marks missing'):
    validate_timing_sink(p,b,{'sidecar.entry','session.open.begin','snapshot.copy.begin','sidecar.exit'})
   self.assertIn('snapshot.copy.begin',p.read_text())
 def test_post_run_integrity_drains_checks_after_pack_failure(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);names=['daemon','test','source.tar','source-input-inventory.json','resolved-pnpm-lock.yaml']
   for name in names:(root/name).write_bytes(name.encode())
   digest=lambda name:hashlib.sha256(name.encode()).hexdigest()
   pin={'daemonSha256':digest('daemon'),'testSha256':digest('test'),'selectedFiles':{name:{'sha256':digest(name)} for name in names[2:]}}
   with patch('startup_diagnostic.closed_tree',side_effect=RuntimeError('mutation')):
    result=post_run_integrity(root,[],root/'daemon',root,root/'test',pin)
   self.assertFalse(result['passed']);self.assertTrue(result['complete'])
   self.assertEqual(result['checks'],{'pack':False,**{name:True for name in names}})
   (root/'test').write_bytes(b'drift')
   with patch('startup_diagnostic.closed_tree',return_value=[]):
    result=post_run_integrity(root,[],root/'daemon',root,root/'test',pin)
   self.assertFalse(result['passed']);self.assertFalse(result['checks']['test']);self.assertTrue(result['checks']['resolved-pnpm-lock.yaml'])
 def test_partial_sink_finally_keeps_integrity_and_cleanup(self):
  proof={'status':'diagnostic_failed','timing':{'completeSink':False},'cleanupUncertain':False};calls=[]
  finalize_diagnostic(proof,None,lambda:(calls.append('integrity') or {'passed':True}),lambda:calls.append('retain'),lambda:calls.append('remove'))
  self.assertEqual(calls,['integrity','retain','remove']);self.assertTrue(proof['scratchRemoved']);self.assertFalse(proof['timing']['completeSink']);self.assertEqual(proof['status'],'diagnostic_failed')
 def test_finalization_integrity_and_retention_errors_do_not_block_cleanup(self):
  for failed_phase in ['integrity','retain']:
   proof={'cleanupUncertain':False};calls=[]
   def step(name):
    calls.append(name)
    if name==failed_phase:raise RuntimeError(name)
    return {'passed':True}
   with self.assertRaises(RuntimeError):finalize_diagnostic(proof,None,lambda:step('integrity'),lambda:step('retain'),lambda:step('remove'))
   self.assertEqual(calls,['integrity','retain','remove']);self.assertTrue(proof['scratchRemoved']);self.assertFalse(proof['cleanupUncertain'])
 def test_uncertain_cleanup_still_records_integrity_but_retains_scratch(self):
  active=DiagnosticChild(FakeOwner(fail_stop=True));active.child=FakeProcess();proof={'cleanupUncertain':False};calls=[]
  with self.assertRaises(RuntimeError):finalize_diagnostic(proof,active,lambda:(calls.append('integrity') or {'passed':True}),lambda:calls.append('retain'),lambda:self.fail('uncertain scratch removed'))
  self.assertEqual(calls,['integrity','retain']);self.assertTrue(proof['cleanupUncertain'])
 def test_numeric_inode_rejected(self):
  with self.assertRaises(RuntimeError):patch_sidecar(self.original,{'path':'/private/tmp/pc-intel-diagnostic-x/startup-timings.jsonl','dev':1,'ino':2,'uid':3})
 def run_prelude(self,extra='',identity_mutation=None):
  with tempfile.TemporaryDirectory(prefix='pc-intel-diagnostic-',dir='/private/tmp') as tmp:
   root=Path(tmp);sink,binding=self.binding(root)
   if identity_mutation:identity_mutation(binding)
   _,proof=patch_sidecar(self.original,binding);prelude=next(r['inserted'] for r in proof['insertions'] if '// Explicit diagnostic derivative' in r['inserted'])
   script=root/'fixture.cjs';script.write_text(prelude+'\n__pcStartupDiagnosticMark("sidecar.entry");\n'+extra+'\n__pcStartupDiagnosticMark("session.open.begin");\n')
   run=subprocess.run([os.environ['PI_DIAGNOSTIC_TEST_NODE'],script],env={'PATH':'/usr/bin:/bin'},capture_output=True,text=True,timeout=10)
   self.assertEqual(run.returncode,0)
   if identity_mutation or extra:
    with self.assertRaises(RuntimeError):validate_timing_sink(sink,{k:str(getattr(sink.stat(),'st_'+k)) for k in ['dev','ino','uid']},set(proof['phases']))
   else:
    rows=validate_timing_sink(sink,binding,set(proof['phases']))['rows'];self.assertEqual([r['phase'] for r in rows],['sidecar.entry','session.open.begin','sidecar.exit'])
   return run.stderr,sink.stat().st_size
 def test_sink_exact_identity_and_terminal(self):self.run_prelude()
 def test_sink_wrong_inode_is_failure(self):self.assertIn('SINK_FAILED',self.run_prelude(identity_mutation=lambda b:b.update(ino='0'))[0])
 def test_sink_late_mode_change_prevents_complete_diagnosis(self):self.assertIn('SINK_FAILED',self.run_prelude('__pcStartupDiagnosticFs.chmodSync(__pcStartupDiagnosticBinding.path,0o400);')[0])
 def test_sink_existing_near_cap_cannot_overflow(self):
  stderr,size=self.run_prelude('__pcStartupDiagnosticFs.appendFileSync(__pcStartupDiagnosticBinding.path,"x".repeat(32760-__pcStartupDiagnosticFs.statSync(__pcStartupDiagnosticBinding.path).size));')
  self.assertIn('SINK_FAILED',stderr);self.assertLessEqual(size,32768)
 def test_sink_row_cap_prevents_complete_diagnosis(self):self.assertIn('SINK_FAILED',self.run_prelude('for(let n=0;n<130;n++)__pcStartupDiagnosticMark("sidecar.dispatch");')[0])
 def test_sink_parser_rejects_bad_rows(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);p,b=self.binding(root)
   for rows in [[{'phase':'sidecar.entry','ns':'2'},{'phase':'sidecar.exit','ns':'1'}],[{'phase':'unknown','ns':'1'}],[{'phase':'sidecar.entry','ns':'1','path':'secret'}]]:
    p.write_text(''.join(json.dumps(r)+'\n' for r in rows))
    with self.assertRaises(RuntimeError):validate_timing_sink(p,b,{'sidecar.entry','sidecar.exit'})
 def test_explicit_failure_marker_rejects_even_with_valid_terminal(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);p,b=self.binding(root)
   p.write_text(''.join(json.dumps({'phase':phase,'ns':str(i)})+'\n' for i,phase in enumerate(['sidecar.entry','session.open.begin','sidecar.exit'])))
   self.assertTrue(validate_timing_sink(p,b,{'sidecar.entry','session.open.begin','sidecar.exit'})['completeSink'])
   log=root/'runnerd.stderr.log';log.write_text('PC_STARTUP_DIAGNOSTIC_SINK_FAILED\n')
   with self.assertRaises(RuntimeError):reject_sink_failure([log])
 def test_only_sidecar_and_manifest_delta(self):
  before=[{'path':p,'kind':'file','mode':0o644,'sha256':'a','size':1} for p in ['dist/cli/acpx-runtime-sidecar.cjs','provider-pack.json','vendor']]
  after=copy.deepcopy(before)
  for row in after[:2]:row['sha256']='b'
  self.assertEqual(len(validate_pack_delta(before,after)),2)
  after[2]['sha256']='b'
  with self.assertRaises(RuntimeError):validate_pack_delta(before,after)
 def test_complete_small_evidence_admitted_with_diagnostic_cap(self):
  from admit_evidence import admit_evidence
  from admit_diagnostic_evidence import MAX_DIAGNOSTIC_BYTES
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);(root/'unique-sidecar').write_bytes(b'unique')
   result=admit_evidence(root,MAX_DIAGNOSTIC_BYTES)
   self.assertEqual(result['status'],'admitted_complete_evidence');self.assertEqual(result['maximumBytes'],268435456);self.assertEqual(result['retentionDays'],7)
   self.assertEqual((root/'unique-sidecar').read_bytes(),b'unique')
 def test_oversized_diagnostic_evidence_rejected_without_truncation(self):
  from admit_evidence import admit_evidence
  from admit_diagnostic_evidence import MAX_DIAGNOSTIC_BYTES
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);p=root/'oversized-unique-evidence'
   with p.open('wb') as f:f.truncate(MAX_DIAGNOSTIC_BYTES+1)
   result=admit_evidence(root,MAX_DIAGNOSTIC_BYTES)
   self.assertEqual(result['status'],'rejected_storage_cap');self.assertFalse(result['truncated']);self.assertEqual(p.stat().st_size,MAX_DIAGNOSTIC_BYTES+1)
 def test_cancel_before_spawn(self):
  c=DiagnosticChild(FakeOwner());c.cancel('before');calls=[]
  with self.assertRaises(RuntimeError):c.execute(lambda:calls.append(True),1)
  self.assertEqual(calls,[]);self.assertFalse(c.uncertain)
 def test_cancel_during_spawn_publishes_then_retires(self):
  owner=FakeOwner();c=DiagnosticChild(owner);p=FakeProcess()
  def factory():c.cancel('during');return p
  with self.assertRaises(RuntimeError):c.execute(factory,1)
  self.assertIs(c.child,p);self.assertTrue(c.retired);self.assertEqual(owner.stops,1)
 def test_cancel_after_publication_retires_once(self):
  owner=FakeOwner();c=DiagnosticChild(owner)
  owner.observe=lambda pid:c.cancel('published')
  with self.assertRaises(RuntimeError):c.execute(lambda:FakeProcess(),1)
  self.assertTrue(c.retired);self.assertEqual(owner.stops,1)
 def test_stop_exception_sticky_and_no_second_launch(self):
  c=DiagnosticChild(FakeOwner(fail_stop=True))
  with self.assertRaises(RuntimeError):c.execute(lambda:FakeProcess(),1)
  self.assertTrue(c.uncertain)
  with self.assertRaises(RuntimeError):c.execute(lambda:self.fail('second launch'),1)
 def test_wait_exception_sticky(self):
  c=DiagnosticChild(FakeOwner())
  with self.assertRaises(RuntimeError):c.execute(lambda:FakeProcess(fail_wait=True),1)
  self.assertTrue(c.uncertain)
 def test_factory_exception_uncertain(self):
  c=DiagnosticChild(FakeOwner())
  def factory():raise OSError('spawn uncertainty')
  with self.assertRaises(OSError):c.execute(factory,1)
  self.assertTrue(c.uncertain)

class DiagnosticInspectionTests(unittest.TestCase):
 def fixture(self,now=10,active_end=80,cleanup_end=None):
  self.now=now
  owner=SimpleNamespace(stop_deadline=cleanup_end)
  child=SimpleNamespace(deadline=active_end,clock=lambda:self.now)
  return owner,child,DiagnosticInspection(owner,child)
 def test_shared_inspection_defaults_and_exact_commands(self):
  with patch('owned_processes.subprocess.check_output',return_value='') as run:
   self.assertEqual(process_table(),{})
   run.assert_called_once_with(['/bin/ps','-axo','pid=,ppid=,lstart=,stat=,comm='],text=True,timeout=2)
  with patch('owned_processes.subprocess.check_output',return_value='node /owned/sidecar') as run:
   self.assertEqual(command_tokens(123),['node','/owned/sidecar'])
   run.assert_called_once_with(['/bin/ps','-p','123','-o','command='],text=True,stderr=subprocess.DEVNULL,timeout=2)
 def test_diagnostic_maximum_and_remaining_active_budget(self):
  _,_,inspection=self.fixture()
  with patch('owned_processes.subprocess.check_output',return_value='node') as run:
   inspection.table();self.assertEqual(run.call_args.kwargs['timeout'],5)
   inspection.argv(123);self.assertEqual(run.call_args.kwargs['timeout'],5)
   self.now=79.75;inspection.table();self.assertEqual(run.call_args.kwargs['timeout'],.25)
   self.now=79.9;inspection.argv(123);self.assertAlmostEqual(run.call_args.kwargs['timeout'],.1)
 def test_cleanup_budget_replaces_expired_active_deadline(self):
  owner,_,inspection=self.fixture(now=90,active_end=80,cleanup_end=190)
  with patch('owned_processes.subprocess.check_output',return_value='node') as run:
   inspection.table();self.assertEqual(run.call_args.kwargs['timeout'],5)
   self.now=189.75;inspection.argv(123);self.assertEqual(run.call_args.kwargs['timeout'],.25)
 def test_expired_or_unpublished_deadlines_never_launch_inspection(self):
  for active_end,cleanup_end in [(10,None),(None,None),(80,10)]:
   _,_,inspection=self.fixture(active_end=active_end,cleanup_end=cleanup_end)
   with patch('owned_processes.subprocess.check_output') as run:
    for invoke in [inspection.table,lambda:inspection.argv(123)]:
     with self.assertRaises(RuntimeError):invoke()
    run.assert_not_called()
 def test_active_argv_failure_fatal_cleanup_policy_preserved(self):
  owner,_,inspection=self.fixture()
  with patch('owned_processes.subprocess.check_output',side_effect=subprocess.TimeoutExpired('ps',5)) as run:
   with self.assertRaisesRegex(RuntimeError,'active argv inspection'):inspection.argv(123)
   self.assertEqual(run.call_count,1)
   owner.stop_deadline=110
   with self.assertRaises(ProcessInspectionUnavailable):inspection.argv(123)
   self.assertEqual(run.call_count,2)
 def test_active_cadence_half_second_and_deadline_capped(self):
  owner=FakeOwner();child=DiagnosticChild(owner);process=FakeProcess();process.poll=lambda:None
  self.now=0;sleeps=[]
  def sleep(duration):sleeps.append(duration);self.now+=duration
  with self.assertRaisesRegex(RuntimeError,'outer deadline'):
   child.execute(lambda:process,1.2,clock=lambda:self.now,sleep=sleep)
  self.assertEqual(len(sleeps),3);self.assertEqual(sleeps[:2],[.5,.5]);self.assertAlmostEqual(sleeps[2],.2)
  self.assertTrue(child.retired);self.assertEqual(owner.stops,1)
 def test_active_table_timeout_fatal_retired_once_without_retry(self):
  owner=FakeOwner();child=DiagnosticChild(owner);process=FakeProcess();process.poll=lambda:None
  calls=[]
  def observe(pid):
   calls.append(pid)
   if len(calls)==2:raise subprocess.TimeoutExpired('ps',5)
  owner.observe=observe
  with self.assertRaises(subprocess.TimeoutExpired):child.execute(lambda:process,70)
  self.assertEqual(calls,[111,111]);self.assertEqual(owner.stops,1);self.assertTrue(child.retired)
  with self.assertRaises(RuntimeError):child.execute(lambda:self.fail('second launch'),70)
 def test_inspection_failure_with_cleanup_error_stays_uncertain(self):
  owner=FakeOwner(fail_stop=True);child=DiagnosticChild(owner)
  owner.observe=lambda pid:(_ for _ in ()).throw(subprocess.TimeoutExpired('ps',5))
  with self.assertRaisesRegex(RuntimeError,'stop failed'):child.execute(lambda:FakeProcess(),70)
  self.assertTrue(child.uncertain);self.assertEqual(owner.stops,1)
  with self.assertRaises(RuntimeError):child.execute(lambda:self.fail('second launch'),70)

if __name__=='__main__':unittest.main()
