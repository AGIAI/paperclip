"""Sticky launch/cleanup gate shared by execution and the narrow regressions."""
class CleanupUncertain(RuntimeError):
    pass

class Lifecycle:
    def __init__(self):
        self.pending = False
        self.uncertain = False

    @property
    def safe(self):
        return not self.pending and not self.uncertain

    def begin(self):
        if not self.safe:
            raise CleanupUncertain('Previous launch/cleanup is unresolved; no next command')
        # Set before Popen: an interrupted launch may have no trustworthy handle.
        self.pending = True

    def failed(self):
        self.uncertain = True

    def confirmed(self):
        if self.uncertain:
            raise CleanupUncertain('An earlier cleanup failure cannot be cleared')
        self.pending = False


def run_test_cases(cases, run, lifecycle):
    failures = []
    for label, command in cases:
        if not lifecycle.safe:
            raise CleanupUncertain('Unresolved owner prohibits subsequent test launch')
        try:
            run(command, label)
        except RuntimeError as error:
            failures.append(str(error))
            if not lifecycle.safe:
                raise CleanupUncertain('Test cleanup uncertain; stopping without another test') from error
    return failures
