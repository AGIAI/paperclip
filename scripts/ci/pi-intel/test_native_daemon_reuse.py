"""Synthetic archive admission; no compiler/runtime/network execution."""
import hashlib,io,json,stat,tarfile,tempfile,unittest,zipfile
from pathlib import Path
from native_daemon_reuse import archive_inventory,compare_declared_inputs,extract_selected,import_daemon
from source_guard import sha
class NativeDaemonReuseTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
  self.old={'packages/paperclip-runner/runner/Cargo.toml':b'[workspace]','packages/paperclip-runner/runner/crates/lib.rs':b'fn main(){}','packages/paperclip-runner/protocol/schema.json':b'{}','packages/paperclip-runner/rust-toolchain.toml':b'channel="1.97.1"','src/runtime.ts':b'old'}
  def tar(files):
   stream=io.BytesIO()
   with tarfile.open(fileobj=stream,mode='w') as archive:
    for name,content in files.items():
     item=tarfile.TarInfo(name);item.size=len(content);item.mode=0o644;archive.addfile(item,io.BytesIO(content))
   return stream.getvalue()
  self.current=self.root/'source.tar';self.current.write_bytes(tar(self.old|{'src/runtime.ts':b'new'}))
  commands=[{'label':n,'exitCode':0,'status':'passed','command':['cargo','build','--locked']} for n in ('rust-install','rust-version-verbose','daemon-build','daemon-sign','daemon-architecture','daemon-metadata')]
  inventory={p:hashlib.sha256(data).hexdigest() for p,data in self.old.items()}
  self.members={'source.tar':tar(self.old),'source-input-inventory.json':json.dumps(inventory).encode(),'paperclip-runnerd':b'fake-test-daemon-not-executable'}
  receipt={'sourceRevision':'old','runId':'123','runAttempt':'1','trustedWorkflowRevision':'workflow','helpers':{'verify.py':'recipe'},'compiler':{'version':'pinned'},'daemonSha256':hashlib.sha256(self.members['paperclip-runnerd']).hexdigest(),'commands':commands,'daemonBuildMetadata':{'schema':'fake'},'cleanupUncertain':False,'sourceInputInventorySha256':hashlib.sha256(self.members['source-input-inventory.json']).hexdigest(),'status':'historical_failure'}
  self.members['receipt.json']=json.dumps(receipt).encode();self.zip=self.root/'input.zip'
  with zipfile.ZipFile(self.zip,'w') as z:
   for name,data in self.members.items():z.writestr(name,data)
  self.pin={'schema':'test','originalBuildSource':'old','nativeInputEquivalentTo':'new','artifactRunId':'123','artifactId':'456','artifactWorkflowRevision':'workflow','artifactZipSha256':sha(self.zip),'artifactZipBytes':self.zip.stat().st_size,'selectedFiles':{p:{'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)} for p,b in self.members.items()},'sourceArchiveSha256':hashlib.sha256(self.members['source.tar']).hexdigest(),'compiler':{'version':'pinned'},'buildCommandTail':['build','--locked'],'daemonBuildMetadata':{'schema':'fake'},'sourceDeltaAllowed':['src/runtime.ts'],'originalVerifierSha256':'recipe','missingOriginalToolchainEvidence':['Apple SDK'],'claims':{'freshNativeCompilation':False}}
 def run_import(self,pin=None):return import_daemon(self.zip,self.current,self.root/'retained',self.root/'dist/bin/daemon',pin or self.pin)
 def test_exact_import_retains_original_provenance_and_current_equality(self):
  result=self.run_import();self.assertEqual(result['declaredInputCount'],4);self.assertEqual(result['originalBuildSource'],'old');self.assertEqual(result['nativeInputEquivalentTo'],'new');self.assertFalse(result['claims']['freshNativeCompilation']);self.assertEqual((self.root/'dist/bin/daemon').read_bytes(),self.members['paperclip-runnerd']);self.assertEqual(result['historicalQualificationStatus'],'historical_failure')
 def test_wrong_whole_zip_hash_rejected_before_extraction(self):
  self.pin['artifactZipSha256']='0'*64
  with self.assertRaisesRegex(RuntimeError,'ZIP mismatch'):self.run_import()
  self.assertFalse((self.root/'retained').exists())
 def test_selected_daemon_digest_mismatch_rejected(self):
  self.pin['selectedFiles']['paperclip-runnerd']['sha256']='0'*64
  with self.assertRaisesRegex(RuntimeError,'member digest'):self.run_import()
 def test_archive_traversal_and_symlink_rejected(self):
  for name,mode in [('../escape',stat.S_IFREG|0o644),('evil',stat.S_IFLNK|0o777)]:
   with self.subTest(name=name),tempfile.TemporaryDirectory() as td:
    p=Path(td)/'bad.zip'
    with zipfile.ZipFile(p,'w') as z:
     item=zipfile.ZipInfo(name);item.external_attr=mode<<16;z.writestr(item,b'x')
    pin=self.pin|{'artifactZipBytes':p.stat().st_size,'artifactZipSha256':sha(p)}
    with self.assertRaises(RuntimeError):extract_selected(p,Path(td)/'out',pin)
 def test_native_change_cannot_hide_in_delta_allowlist(self):
  old={'runner/lib.rs':{'kind':'file','sha256':'old'}};new={'runner/lib.rs':{'kind':'file','sha256':'new'}}
  with self.assertRaisesRegex(RuntimeError,'native source'):compare_declared_inputs(old,new,['runner/lib.rs'])
 def test_new_native_config_or_unlisted_source_delta_rejected(self):
  old=archive_inventory(self.current)
  for name in ['.cargo/config.toml','unlisted/file.txt']:
   with self.subTest(name=name),self.assertRaises(RuntimeError):compare_declared_inputs(old,old|{name:{'kind':'file','sha256':'new'}},[])
 def test_original_compiler_or_flags_mismatch_rejected(self):
  for key,value in [('compiler',{'version':'different'}),('buildCommandTail',['build','--unlocked'])]:
   with self.subTest(key=key),tempfile.TemporaryDirectory() as td:
    with self.assertRaises(RuntimeError):import_daemon(self.zip,self.current,Path(td)/'retained',Path(td)/'daemon',self.pin|{key:value})
 def test_existing_daemon_not_overwritten(self):
  target=self.root/'dist/bin/daemon';target.parent.mkdir(parents=True);target.write_bytes(b'existing')
  with self.assertRaisesRegex(RuntimeError,'overwriting'):self.run_import()
  self.assertEqual(target.read_bytes(),b'existing')
if __name__=='__main__':unittest.main()
