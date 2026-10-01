import copy,hashlib,json,os,subprocess,tempfile,unittest
from pathlib import Path
from startup_timing_patch import patch_sidecar,ORIGINAL_SHA
from startup_diagnostic import validate_pack_delta,validate_timing_sink,reject_sink_failure
from diagnostic_lifecycle import DiagnosticChild

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
  self.assertEqual(len(proof['phases']),46)
 def test_wrong_original_rejected(self):
  with self.assertRaises(RuntimeError):patch_sidecar(self.original+b' ',{'path':'unused','dev':'1','ino':'2','uid':'3'})
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

if __name__=='__main__':unittest.main()
