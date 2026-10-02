import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from lifecycle import Lifecycle, run_test_cases
from owned_processes import OwnedProcesses, ProcessInspectionUnavailable, process_table, command_tokens
from qualification_observer import ActiveInspectionFailed, QualificationInspection, wait_for_owned_command


class QualificationObserverTests(unittest.TestCase):
    def setUp(self):
        self.now = 10
        self.owner = SimpleNamespace(stop_deadline=None, observe=Mock(return_value={}), owned={})
        self.inspection = QualificationInspection(self.owner, 190, clock=lambda: self.now)

    def test_normal_budget_five_seconds_then_remaining_command_window(self):
        with patch('qualification_observer.process_table', return_value={}) as table:
            self.inspection.table()
            table.assert_called_once_with(timeout=5)
            self.now = 188.75
            self.inspection.table()
            self.assertEqual(table.call_args.kwargs['timeout'], 1.25)

    def test_three_second_inspection_is_admitted_once_without_retry(self):
        def table(*, timeout):
            self.assertEqual(timeout, 5)
            self.now += 3
            return {123: {'started': 'fixture'}}
        with patch('qualification_observer.process_table', side_effect=table) as call:
            self.assertEqual(self.inspection.table(), {123: {'started': 'fixture'}})
            self.assertEqual(call.call_count, 1)

    def test_cleanup_uses_its_own_existing_deadline_after_active_expiry(self):
        self.now = 191
        self.owner.stop_deadline = 291
        with patch('qualification_observer.command_tokens', return_value=['fixture']) as argv:
            self.inspection.argv(123)
            argv.assert_called_once_with(123, timeout=5)
            self.now = 290.75
            self.inspection.argv(123)
            self.assertEqual(argv.call_args.kwargs['timeout'], .25)

    def test_exhausted_active_deadline_never_starts_inspection(self):
        self.now = 190
        with patch('qualification_observer.process_table') as table:
            with self.assertRaises(ActiveInspectionFailed): self.inspection.table()
            table.assert_not_called()

    def test_exhausted_cleanup_deadline_preserves_cleanup_failure_type(self):
        self.owner.stop_deadline = self.now
        with patch('qualification_observer.command_tokens') as argv:
            with self.assertRaises(ProcessInspectionUnavailable): self.inspection.argv(123)
            argv.assert_not_called()

    def test_active_table_and_argv_failures_are_fatal_without_retry(self):
        for operation, method, args, error in (
            ('process_table', self.inspection.table, (), subprocess.TimeoutExpired('ps', 5)),
            ('command_tokens', self.inspection.argv, (123,), self.argv_timeout()),
        ):
            with self.subTest(operation=operation), patch('qualification_observer.' + operation, side_effect=error) as call:
                with self.assertRaises(ActiveInspectionFailed): method(*args)
                self.assertEqual(call.call_count, 1)

    @staticmethod
    def argv_timeout():
        error = ProcessInspectionUnavailable()
        error.__cause__ = subprocess.TimeoutExpired('ps', 5)
        return error

    def inspect_argv_race(self, after, error):
        root_row = {'parent': 1, 'started': 'root-identity', 'status': 'sleeping', 'executable': '/fixture/Python'}
        child_row = {'parent': 123, 'started': 'child-identity', 'status': 'sleeping', 'executable': '/fixture/node'}
        with tempfile.TemporaryDirectory() as tmp:
            private = Path(tmp).resolve(); private.chmod(0o700)
            owner = OwnedProcesses(private/'journal.json', private, private, private/'sidecar.cjs')
            inspection = QualificationInspection(owner, 190, clock=lambda: self.now)
            owner.table = inspection.table; owner.argv = inspection.argv
            next_rows = {123: root_row}
            if after == 'same': next_rows[124] = child_row
            elif after == 'reused': next_rows[124] = {**child_row, 'started': 'different-identity'}
            with patch('qualification_observer.process_table', side_effect=[{123: root_row, 124: child_row}, next_rows]) as table:
                with patch('qualification_observer.command_tokens', side_effect=error) as argv:
                    inspection.observe(123)
                    self.assertEqual(table.call_count, 2)
                    self.assertEqual(argv.call_count, 1)
                    self.assertNotIn(124, owner.owned)

    def test_completed_empty_argv_after_natural_exit_does_not_invent_failure(self):
        self.inspect_argv_race('gone', ProcessInspectionUnavailable())

    def test_completed_ps_exit_one_after_pid_reuse_does_not_admit_new_identity(self):
        error = ProcessInspectionUnavailable()
        error.__cause__ = subprocess.CalledProcessError(1, 'ps')
        self.inspect_argv_race('reused', error)

    def test_same_identity_with_unresolved_argv_is_fatal(self):
        with self.assertRaisesRegex(ActiveInspectionFailed, 'remains unresolved'):
            self.inspect_argv_race('same', ProcessInspectionUnavailable())

    def test_argv_timeout_never_gets_natural_exit_recheck(self):
        with patch('qualification_observer.process_table') as table:
            with patch('qualification_observer.command_tokens', side_effect=self.argv_timeout()) as argv:
                with self.assertRaises(ActiveInspectionFailed): self.inspection.argv(123)
                self.assertEqual(argv.call_count, 1)
            table.assert_not_called()

    def test_cleanup_retains_original_inspection_exception(self):
        self.owner.stop_deadline = 110
        error = ProcessInspectionUnavailable()
        with patch('qualification_observer.command_tokens', side_effect=error):
            with self.assertRaises(ProcessInspectionUnavailable) as caught: self.inspection.argv(123)
            self.assertIs(caught.exception, error)

    def test_poll_cadence_and_final_observation(self):
        child = SimpleNamespace(pid=123, poll=Mock(side_effect=[None, None, 0]))
        sleep = Mock()
        wait_for_owned_command(child, self.inspection, sleep=sleep)
        self.assertEqual([c.args for c in sleep.call_args_list], [(.5,), (.5,)])
        self.assertEqual(self.owner.observe.call_count, 3)

    def test_observation_consuming_window_stops_without_sleep_or_next_poll(self):
        child = SimpleNamespace(pid=123, poll=Mock(return_value=None))
        self.owner.observe.side_effect = lambda pid: setattr(self, 'now', 190)
        sleep = Mock()
        with self.assertRaises(ActiveInspectionFailed): wait_for_owned_command(child, self.inspection, sleep=sleep)
        sleep.assert_not_called()
        self.assertEqual(child.poll.call_count, 1)

    def test_failed_observation_still_retires_and_cannot_launch_next_test(self):
        lifecycle = Lifecycle()
        launched = []
        stop = Mock()
        child = SimpleNamespace(pid=123, poll=Mock(return_value=None))
        # Match observe(pid)'s callback signature while using the actual adapter.
        self.owner.observe.side_effect = lambda pid: self.inspection.table()
        def run(command, label):
            lifecycle.begin(); launched.append(label)
            try: wait_for_owned_command(child, self.inspection, sleep=Mock())
            finally: stop(child.pid); lifecycle.confirmed()
        with patch('qualification_observer.process_table', side_effect=subprocess.TimeoutExpired('ps', 5)) as table:
            with self.assertRaises(ActiveInspectionFailed):
                run_test_cases([('startup', []), ('sdk', [])], run, lifecycle)
            self.assertEqual(table.call_count, 1)
        stop.assert_called_once_with(123)
        self.assertEqual(launched, ['startup'])
        self.assertTrue(lifecycle.safe)

    def test_shared_process_inspection_defaults_remain_two_seconds(self):
        with patch('owned_processes.subprocess.check_output', return_value='') as ps:
            process_table()
            self.assertEqual(ps.call_args.kwargs['timeout'], 2)
        with patch('owned_processes.subprocess.check_output', return_value='fixture') as ps:
            command_tokens(123)
            self.assertEqual(ps.call_args.kwargs['timeout'], 2)


if __name__ == '__main__': unittest.main()
