"""Cancellation-safe publication of one owned child, without changing signal masks."""
import threading

class LaunchCancelled(RuntimeError):
    pass

class LaunchGate:
    def __init__(self, retire):
        self.retire = retire
        self.reason = None
        self.child = None
        self.launching = False
        self.lock = threading.RLock()

    def cancel(self, reason):
        with self.lock:
            self.reason = self.reason or reason
            # Popen can release the GIL or run a Python signal handler before
            # returning its handle. Publication owns cleanup until it finishes.
            child = None if self.launching else self.child
        if child is not None:
            self.retire(child)

    def spawn(self, factory, publish, before_launch):
        with self.lock:
            if self.reason is not None:
                raise LaunchCancelled(self.reason)
            if self.launching or self.child is not None:
                raise RuntimeError("owned child launch cannot be repeated")
            self.launching = True
        child = None
        try:
            before_launch()
            with self.lock:
                if self.reason is not None:
                    raise LaunchCancelled(self.reason)
            child = factory()
            self.child = child
            # The caller retains the handle before ownership observation can
            # fail. Cancellation during this callback is deferred until here.
            publish(child)
        finally:
            with self.lock:
                self.launching = False
                cancelled = self.reason is not None
            if cancelled and child is not None:
                self.retire(child)
        if cancelled:
            raise LaunchCancelled(self.reason)
        return child
