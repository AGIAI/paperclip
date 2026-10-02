"""One diagnostic child, deferred cancellation through handle publication."""
import time,subprocess
from launch_gate import LaunchGate
from source_guard import require
from owned_processes import process_table,command_tokens,ProcessInspectionUnavailable

class DiagnosticInspection:
 """Same identity inspection, bounded by the current diagnostic lifecycle phase."""
 def __init__(self,owner,child):self.owner=owner;self.child=child
 def budget(self):
  deadline=self.owner.stop_deadline if self.owner.stop_deadline is not None else self.child.deadline
  require(deadline is not None,'Diagnostic inspection before deadline publication')
  remaining=deadline-self.child.clock()
  require(remaining>0,'Diagnostic inspection deadline')
  return min(5,remaining)
 def table(self):return process_table(timeout=self.budget())
 def argv(self,pid):
  try:return command_tokens(pid,timeout=self.budget())
  except ProcessInspectionUnavailable as error:
   # Active diagnosis must not continue with an unresolved identity. Cleanup
   # retains its existing bounded fresh-inspection/revalidation policy.
   if self.owner.stop_deadline is None:raise RuntimeError('Diagnostic active argv inspection failed') from error
   raise

class DiagnosticChild:
 def __init__(self,owner):self.owner=owner;self.child=None;self.attempted=False;self.uncertain=False;self.retired=False;self.cancelled=None;self.gate=LaunchGate(self.retire);self.deadline=None;self.clock=time.monotonic
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
  self.clock=clock;self.deadline=clock()+timeout
  def before():
   if self.cancelled:self.gate.cancel(self.cancelled)
  def launch():self.attempted=True;return factory()
  def publish(child):self.child=child;self.owner.observe(child.pid)
  try:
   self.gate.spawn(launch,publish,before)
   while self.child.poll() is None:
    require(clock()<self.deadline,'Diagnostic outer deadline');self.owner.observe(self.child.pid)
    require(clock()<self.deadline,'Diagnostic outer deadline');sleep(min(.5,self.deadline-clock()))
   self.owner.observe(self.child.pid)
  finally:
   if self.child is not None:self.retire(self.child)
   elif self.attempted:self.uncertain=True
  return self.child.returncode
