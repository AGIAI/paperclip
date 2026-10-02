import copy,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from snapshot_streaming import PIN,admit_copy,child_environment,verify_report,post_integrity,assert_complete,verify_baseline_source
from diagnostic_lifecycle import DiagnosticChild

class SnapshotStreamingTests(unittest.TestCase):
 def test_terminal_success_cannot_survive_failed_or_incomplete_finalization(self):
  good={'status':'comparison_complete_not_qualification','cleanupUncertain':False,'scratchRemoved':True,'postRunIntegrity':{'complete':True,'passed':True,'checks':{'pack':True},'errors':{}}}
  assert_complete(good)
  for delta in [{'status':'diagnostic_failed'},{'cleanupUncertain':True},{'scratchRemoved':False},{'postRunIntegrity':{}},{'postRunIntegrity':{'complete':True,'passed':False,'checks':{'pack':False},'errors':{'pack':'changed'}}},{'postRunIntegrity':{'complete':True,'passed':True,'checks':{},'errors':{}}}]:
   with self.subTest(delta=delta),self.assertRaises(RuntimeError):assert_complete(good|delta)
 def test_exact_four_sequence_and_full_window(self):
  for i,p in enumerate(['baseline','candidate','candidate','baseline']):admit_copy(i,p,270,None,False)
  for args in [(4,'baseline',600,None,False),(0,'candidate',600,None,False),(0,'baseline',269.9,None,False),(0,'baseline',600,'cancel',False),(0,'baseline',600,None,True)]:
   with self.assertRaises(RuntimeError):admit_copy(*args)
 def test_only_explicit_noncredential_process_environment(self):
  with patch.dict('os.environ',{'OPENROUTER_API_KEY':'must-not-propagate','UV_THREADPOOL_SIZE':'128'}):
   e=child_environment('/private/home','/private/tmp')
  self.assertEqual(e,{'HOME':'/private/home','TMPDIR':'/private/tmp','UV_THREADPOOL_SIZE':'4','LANG':'en_US.UTF-8','PATH':'/usr/bin:/bin:/usr/sbin:/sbin'})
 def receipt(self):
  return {'variant':'baseline','status':'snapshot_verified_not_executed','isQualification':False,'poolRequestedAtProcessStart':4,'actualThreadCountMeasured':False,'moduleSha256':PIN['moduleSha256'],'providerCalls':0,'vendorProcessesStarted':0,'snapshotClosed':True,'commandDirectoryClosed':True,'temporaryRootEmpty':True,'cleanupErrors':[],'sealedOutput':{'files':PIN['entries']+2,'bytes':PIN['distributionBytes'],'handoffVerified':True,'descriptorIdentityVerified':True},'snapshotMilliseconds':125.0}
 def test_exact_receipt(self):
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/'receipt.json';r=self.receipt();path.write_text(json.dumps(r));self.assertEqual(verify_report(path,'baseline'),r)
 def test_false_or_incomplete_measurements_rejected(self):
  deltas=[{'variant':'candidate'},{'poolRequestedAtProcessStart':16},{'moduleSha256':'0'*64},{'providerCalls':1},{'snapshotClosed':False},{'commandDirectoryClosed':False},{'temporaryRootEmpty':False},{'cleanupErrors':['error']},{'snapshotMilliseconds':float('nan')},{'snapshotMilliseconds':float('inf')},{'snapshotMilliseconds':0},{'sealedOutput':{}},{'status':'ok'}]
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/'receipt.json'
   for delta in deltas:
    with self.subTest(delta=delta):
     path.write_text(json.dumps(self.receipt()|delta))
     with self.assertRaises(RuntimeError):verify_report(path,'baseline')
 def test_post_checks_continue_after_pack_failure(self):
  calls=[];pin={'candidateModuleSha256':'expected','candidateSourceSha256':'expected','selectedFiles':{'one':{'sha256':'1'},'two':{'sha256':'2'}}}
  def digest(path):calls.append(path.name);return path.name=='one' and '1' or 'wrong'
  with patch('snapshot_streaming.closed_tree',side_effect=RuntimeError('pack changed')),patch('snapshot_streaming.sha',side_effect=digest):r=post_integrity(Path('/pack'),[],Path('/original'),pin)
  self.assertEqual(calls,['snapshot-streaming-candidate.mjs','snapshot-streaming-candidate.ts','one','two']);self.assertEqual(r['checks'],{'pack':False,'candidateModule':False,'candidateSource':False,'one':True,'two':False});self.assertFalse(r['passed'])
 def test_before_launch_cancellation_never_calls_factory(self):
  owner=type('Owner',(),{})();child=DiagnosticChild(owner);child.cancel('between copies')
  with self.assertRaises(RuntimeError):child.execute(lambda:self.fail('cancelled spawn'),90)
  self.assertFalse(child.attempted);self.assertFalse(child.uncertain)
 def test_during_publication_cancellation_retires_owned_handle(self):
  class Process:
   pid=123;returncode=0
   def wait(self,timeout):return 0
  class Owner:
   stops=0
   def observe(self,pid):child.cancel('during publication')
   def stop(self,pid):self.stops+=1;return {'status':'stopped'}
   def live(self):return []
  owner=Owner();child=DiagnosticChild(owner)
  with self.assertRaises(RuntimeError):child.execute(Process,90)
  self.assertTrue(child.retired);self.assertEqual(owner.stops,1)
  with self.assertRaises(RuntimeError):child.execute(lambda:self.fail('second spawn'),90)

class BaselineSourceTests(unittest.TestCase):
 def test_safe_source_member_and_mismatched_hash_link_duplicate_rejected(self):
  import tarfile,io,hashlib
  name='packages/paperclip-runner/src/drivers/acpx/native-distribution-integrity.ts'
  payload=b'baseline source';pin={'baselineSourceSha256':hashlib.sha256(payload).hexdigest()}
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'source.tar'
   for kind in ['valid','changed','link','duplicate','missing']:
    with tarfile.open(p,'w') as t:
     member=tarfile.TarInfo(name);member.size=len(payload)
     if kind=='link':member.type=tarfile.SYMTYPE;member.linkname='/foreign';member.size=0
     if kind!='missing':t.addfile(member,io.BytesIO(b'changed source!' if kind=='changed' else payload))
     if kind=='duplicate':t.addfile(member,io.BytesIO(payload))
    if kind=='valid':self.assertEqual(verify_baseline_source(p,pin),payload)
    else:
     with self.assertRaises(RuntimeError):verify_baseline_source(p,pin)
 def test_candidate_report_must_use_candidate_hash(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'receipt.json';r=SnapshotStreamingTests().receipt()|{'variant':'candidate'};p.write_text(json.dumps(r))
   with self.assertRaises(RuntimeError):verify_report(p,'candidate')
   r['moduleSha256']=PIN['candidateModuleSha256'];p.write_text(json.dumps(r));self.assertEqual(verify_report(p,'candidate'),r)

if __name__=='__main__':unittest.main()
