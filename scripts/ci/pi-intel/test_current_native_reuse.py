"""Normal Intel admission uses original signed bytes, never a fresh compiler."""
import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from verify import reuse_native_daemon,INPUTS
from source_guard import sha
class CurrentReuseTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
  self.stage=self.root/'stage';self.out=self.root/'out';self.scratch=self.root/'scratch'
  for p in (self.stage,self.out,self.scratch):p.mkdir()
  self.receipt={};self.commands=[];self.bad_metadata=False;self.fail_label=None;self.count=145
  self.bytes=b'original-signed-fixture';self.pin=INPUTS['nativeDaemonReuse']|{'selectedFiles':{'paperclip-runnerd':{'sha256':__import__('hashlib').sha256(self.bytes).hexdigest()}}}
 def fake_import(self,archive,current,retained,daemon,pin):
  self.assertEqual(current,self.out/'source.tar');self.assertEqual(pin,self.pin)
  retained.mkdir()
  for n in ['receipt.json','source-input-inventory.json','declared-input-equality.json']:(retained/n).write_text('{}')
  daemon.parent.mkdir(parents=True);daemon.write_bytes(self.bytes)
  return {'declaredInputCount':self.count,'claims':{'freshNativeCompilation':False}}
 def run_command(self,command,label,timeout):
  self.commands.append((list(map(str,command)),label,timeout))
  if label==self.fail_label:raise RuntimeError('injected '+label)
  if label=='daemon-architecture':return 'Mach-O 64-bit executable x86_64'
  if label=='daemon-metadata':return json.dumps({} if self.bad_metadata else INPUTS['expectedDaemonBuildMetadata'])
  return ''
 def run_reuse(self):
  with patch.dict(INPUTS,{'nativeDaemonReuse':self.pin}),patch('verify.import_daemon',side_effect=self.fake_import):return reuse_native_daemon(self.root/'archive.zip',self.stage,self.out,self.scratch,self.run_command,self.receipt,lambda:None)
 def test_original_provenance_and_signature_verification_without_compile_or_resign(self):
  daemon=self.run_reuse();self.assertEqual(daemon.read_bytes(),self.bytes)
  self.assertFalse(self.receipt['nativeRecompiled']);self.assertEqual(self.receipt['nativeBuildSource'],self.pin['originalBuildSource']);self.assertEqual(self.receipt['originalNativeCompiler'],self.pin['compiler'])
  self.assertEqual([c[1] for c in self.commands],['daemon-signature-verify','daemon-architecture','daemon-metadata']);self.assertEqual(self.commands[0][0][:3],['/usr/bin/codesign','--verify','--strict'])
  self.assertEqual(len(list((self.out/'original-native-provenance').iterdir())),3)
 def test_wrong_native_inventory_scope_prevents_execution(self):
  self.count=144
  with self.assertRaisesRegex(RuntimeError,'inventory scope'):self.run_reuse()
  self.assertEqual(self.commands,[])
 def test_signature_failure_stops_before_metadata(self):
  self.fail_label='daemon-signature-verify'
  with self.assertRaisesRegex(RuntimeError,'injected'):self.run_reuse()
  self.assertEqual(len(self.commands),1)
 def test_wrong_metadata_rejected(self):
  self.bad_metadata=True
  with self.assertRaisesRegex(RuntimeError,'build metadata'):self.run_reuse()
 def test_wrong_source_or_fresh_claim_rejected_before_import(self):
  for delta in [{'nativeInputEquivalentTo':'0'*40},{'claims':{'freshNativeCompilation':True}}]:
   with patch.dict(INPUTS,{'nativeDaemonReuse':self.pin|delta}),patch('verify.import_daemon') as importer:
    with self.assertRaisesRegex(RuntimeError,'reuse authority'):reuse_native_daemon(self.root/'archive',self.stage,self.out,self.scratch,self.run_command,self.receipt,lambda:None)
    importer.assert_not_called()
if __name__=='__main__':unittest.main()
