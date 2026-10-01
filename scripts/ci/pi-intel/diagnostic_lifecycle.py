"""One diagnostic child, deferred cancellation through handle publication."""
import time,subprocess
from launch_gate import LaunchGate
from source_guard import require
class DiagnosticChild:
 def __init__(self,owner):self.owner=owner;self.child=None;self.attempted=False;self.uncertain=False;self.retired=False;self.cancelled=None;self.gate=LaunchGate(self.retire)
 def cancel(self,reason):self.cancelled=reason;self.gate.cancel(reason)
 def retire(self,child):
  if self.retired:return
  try:
   result=self.owner.stop(child.pid)
   require(result['status']=='stopped' and not self.owner.live(),'Diagnostic descendants remain')
   child.wait(timeout=10);self.retired=True
  except BaseException:self.uncertain=True;raise
 def execute(self,factory,timeout,clock=time.monotonic,sleep=time.sleep):
  require(not self.attempted and not self.uncertain,'Diagnostic may execute once only')
  start=clock()
  def before():
   if self.cancelled:self.gate.cancel(self.cancelled)
  def launch():self.attempted=True;return factory()
  def publish(child):self.child=child;self.owner.observe(child.pid)
  try:
   self.gate.spawn(launch,publish,before)
   while self.child.poll() is None:
    self.owner.observe(self.child.pid);require(clock()-start<timeout,'Diagnostic outer deadline');sleep(.1)
   self.owner.observe(self.child.pid)
  finally:
   if self.child is not None:self.retire(self.child)
   elif self.attempted:self.uncertain=True
  return self.child.returncode
