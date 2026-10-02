"""Fail-closed final-source admission; no compiler, provider or runtime launch."""
import copy,json,unittest,subprocess,sys
from pathlib import Path
from unittest.mock import patch
import verify

class Profile13Tests(unittest.TestCase):
 def setUp(self):
  self.original=(verify.INPUTS,verify.PIN,verify.SOURCE)
  self.addCleanup(self.restore)
  self.inputs=json.loads((Path(__file__).parent/'profile13-inputs.json').read_text())
  self.inputs['localComparison'].update(sourceRevision='1'*40,sourceArchiveSha256='2'*64)
 def restore(self):verify.INPUTS,verify.PIN,verify.SOURCE=self.original
 def activate(self,inputs):
  with patch.object(Path,'read_text',return_value=json.dumps(inputs)):verify.activate_profile13()
 def test_exact_frozen_source_admits_fresh_recipe_only(self):
  self.activate(self.inputs)
  self.assertEqual(verify.SOURCE,'1'*40)
  self.assertEqual(verify.INPUTS['freshNativeBuild'],{'toolchain':'1.97.1','target':'x86_64-apple-darwin','jobs':2,'deadlineSeconds':1500})
  self.assertNotIn('nativeDaemonReuse',verify.INPUTS)
 def test_missing_malformed_source_or_archive_never_activates(self):
  for field,values in [('sourceRevision',[None,'PROFILE13_SOURCE_PENDING','a'*39,'A'*40,1]),('sourceArchiveSha256',[None,'a'*63,'A'*64,1])]:
   for value in values:
    with self.subTest(field=field,value=value):
     inputs=copy.deepcopy(self.inputs);inputs['localComparison'][field]=value
     with self.assertRaisesRegex(RuntimeError,'not frozen'):self.activate(inputs)
     self.assertIs(verify.INPUTS,self.original[0])
 def test_historical_reuse_and_old_profile_are_rejected(self):
  for delta in ['reuse','old']:
   inputs=copy.deepcopy(self.inputs)
   if delta=='reuse':inputs['nativeDaemonReuse']={'originalBuildSource':'a'*40}
   else:inputs['normalProviderSelection']['pi']['profileVersion']=12
   with self.assertRaisesRegex(RuntimeError,'fresh native'):self.activate(inputs)
   self.assertIs(verify.INPUTS,self.original[0])
 def test_missing_or_malformed_test_pins_reject_before_activation(self):
  for delta in ['missing','malformed','extra']:
   inputs=copy.deepcopy(self.inputs)
   if delta=='missing':inputs['testSourcePins'].pop('pi-closed-startup.test.mjs')
   elif delta=='malformed':inputs['testSourcePins']['pi-native-package-contract.test.mjs']='wrong'
   else:inputs['testSourcePins']['extra.test.mjs']='a'*64
   with self.assertRaisesRegex(RuntimeError,'test source pins'):self.activate(inputs)
   self.assertIs(verify.INPUTS,self.original[0])
 def test_fresh_mode_cannot_accept_a_historical_archive(self):
  result=subprocess.run([sys.executable,'-B',str(Path(__file__).parent/'verify.py'),'--source','/nonexistent-source','--output','/nonexistent-output','--fresh-profile13','--native-archive','/nonexistent-archive'],capture_output=True,text=True,timeout=5)
  self.assertEqual(result.returncode,2);self.assertIn('not allowed with argument',result.stderr)
 def test_new_workflow_has_no_archive_download_and_keeps_bounds(self):
  text=(Path(__file__).parents[3]/'.github/workflows/docker-runner-check.yml').read_text()
  job=text.split('  manual_pi_intel:\n',1)[1].split('\n  manual_',1)[0]
  self.assertIn('--fresh-profile13',job);self.assertNotIn('--native-archive',job)
  self.assertNotIn('Download exact previously signed',job)
  self.assertIn('timeout-minutes: 60',job);self.assertIn('timeout-minutes: 55',job)
  from admit_evidence import MAX_BYTES
  self.assertEqual(MAX_BYTES,17179869184);self.assertIn('retention-days: 7',job)
if __name__=='__main__':unittest.main()
