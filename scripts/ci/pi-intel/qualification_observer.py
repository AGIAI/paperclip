"""Normal qualification inspection budgets; no change to test or cleanup deadlines."""
import subprocess
import time
from owned_processes import process_table, command_tokens, ProcessInspectionUnavailable


class ActiveInspectionFailed(Exception):
    """Fatal observer failure, deliberately not a recoverable test RuntimeError."""


class QualificationInspection:
    def __init__(self, owner, deadline, *, clock=time.monotonic):
        self.owner = owner
        self.deadline = deadline
        self.clock = clock

    def budget(self):
        deadline = self.owner.stop_deadline
        if deadline is None:
            deadline = self.deadline
        remaining = deadline - self.clock()
        if remaining <= 0:
            if self.owner.stop_deadline is None:
                raise ActiveInspectionFailed('Qualification command observation deadline exhausted')
            raise ProcessInspectionUnavailable('Qualification cleanup observation deadline exhausted')
        return min(5, remaining)

    def inspect(self, operation, *args, identity_recheck=False):
        try:
            return operation(*args, timeout=self.budget())
        except (ProcessInspectionUnavailable, subprocess.SubprocessError, OSError) as error:
            if self.owner.stop_deadline is None:
                if (identity_recheck and isinstance(error, ProcessInspectionUnavailable)
                        and (error.__cause__ is None or isinstance(error.__cause__, (subprocess.CalledProcessError, ValueError)))):
                    # A completed ps snapshot can race natural exit/reuse.
                    # OwnedProcesses rechecks the exact observed identity;
                    # observe() below rejects any still-live unresolved role.
                    raise
                # An actual inspection timeout/OS failure is fatal even if a
                # later sample might find the process gone. Never retry it.
                raise ActiveInspectionFailed('Qualification active inspection failed: ' + type(error).__name__) from error
            raise

    def table(self):
        return self.inspect(process_table)

    def argv(self, pid):
        return self.inspect(command_tokens, pid, identity_recheck=True)

    def observe(self, pid):
        self.budget()
        rows = self.owner.observe(pid)
        if any(record['role'] == 'unresolved_inspection'
               and rows.get(owned_pid, {}).get('started') == record['started']
               for owned_pid, record in self.owner.owned.items()):
            raise ActiveInspectionFailed('Qualification active process identity remains unresolved')
        self.budget()


def wait_for_owned_command(child, inspection, *, sleep=time.sleep):
    while child.poll() is None:
        inspection.observe(child.pid)
        sleep(min(.5, inspection.budget()))
    inspection.observe(child.pid)
