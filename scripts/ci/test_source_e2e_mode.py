"""Offline regressions for the reviewed, exclusive hosted support dispatch."""
import os
from pathlib import Path
import re
import shutil
import sys
import subprocess
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = '.github/workflows/docker-runner-check.yml'
SOURCE = '5cd6d3d5237e3e15394fcc1c7e754c30a63c5169'
LOCK = '38338a6867358440c5ab5993eaeb85fb501bc7df65d24acf52fbd63c880ee4ba'
INTEL_SOURCE = '5eba61ece929dcfb2b0c1761825a2d9e557c2554'
BASELINE = 'b58907578'


def job(text, name):
    return re.search(r'^  ' + name + r':\n.*?(?=^  [a-z_]+:\n|\Z)', text, re.M | re.S).group()


def script(block, name):
    step = block.split('      - name: ' + name + '\n', 1)[1].split('\n      - ', 1)[0]
    return textwrap.dedent(step.split('        run: |\n', 1)[1]).rstrip() + '\n'


class SupportMode(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = (ROOT / WORKFLOW).read_text()
        cls.authorize = script(job(cls.workflow, 'authorize_manual'), 'Authorize an explicit maintainer image build')

    def admission(self, **changes):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            fake = root / 'gh'
            fake.write_text('''#!/usr/bin/env python3
import os, sys
path = sys.argv[2]
if path == 'users/maintainer': print('1')
elif path == 'repos/paperclipai/paperclip/git/ref/heads/coverage': print(os.environ['FAKE_TARGET'])
elif path == 'repos/paperclipai/paperclip': print(os.environ['FAKE_VISIBILITY'])
else: raise RuntimeError('Unexpected offline GitHub request')
''')
            fake.chmod(0o755)
            env = dict(PATH=str(root) + os.pathsep + str(Path(shutil.which('jq')).parent) + os.pathsep + os.defpath,
                       REPOSITORY='paperclipai/paperclip', REPOSITORY_ID='1170821064', ACTOR_ID='1',
                       TRIGGERING_ACTOR='maintainer', ALLOWED_IDS='[1]', TARGET_BRANCH='coverage',
                       EXPECTED_SOURCE_SHA=SOURCE, EXPECTED_LOCK_SHA256=LOCK, FAKE_TARGET=SOURCE,
                       FAKE_VISIBILITY='public', VERIFY_RUNNER='false', VERIFY_SOURCE='false',
                       SOURCE_ROOT_TESTS_ONLY='false', SOURCE_E2E_SUPPORT_ONLY='true', IMAGE_MODE='false',
                       VERIFY_PI_INTEL='false', DIAGNOSE_AJV='false', OTHER_MODE='true',
                       GITHUB_OUTPUT=str(root / 'output'))
            env.update(changes)
            result = subprocess.run(['bash', '-c', self.authorize], env=env, capture_output=True, text=True, timeout=5)
            return result.returncode, (root / 'output').read_text() if (root / 'output').exists() else ''

    def test_exact_reviewed_source_and_overlay_are_admitted(self):
        self.assertEqual(self.admission(), (0, 'target_sha=' + SOURCE + '\n'))

    def test_every_other_execution_mode_conflicts(self):
        for mode in ('VERIFY_RUNNER', 'VERIFY_SOURCE', 'SOURCE_ROOT_TESTS_ONLY', 'IMAGE_MODE', 'VERIFY_PI_INTEL', 'DIAGNOSE_AJV'):
            with self.subTest(mode=mode):
                status, output = self.admission(**{mode: 'true'})
                self.assertNotEqual(status, 0); self.assertEqual(output, '')

    def test_wrong_missing_or_moving_source_and_lock_fail(self):
        for changes in ({'EXPECTED_SOURCE_SHA': ''}, {'EXPECTED_SOURCE_SHA': INTEL_SOURCE},
                        {'FAKE_TARGET': INTEL_SOURCE}, {'EXPECTED_LOCK_SHA256': ''},
                        {'EXPECTED_LOCK_SHA256': 'a' * 64}, {'FAKE_VISIBILITY': 'private'}, {'ACTOR_ID': '2'}):
            with self.subTest(changes=changes):
                status, output = self.admission(**changes)
                self.assertNotEqual(status, 0); self.assertEqual(output, '')

    def test_original_intel_admission_and_entire_job_are_unchanged(self):
        self.assertEqual(self.admission(SOURCE_E2E_SUPPORT_ONLY='false', VERIFY_PI_INTEL='true',
                                       EXPECTED_SOURCE_SHA=INTEL_SOURCE, FAKE_TARGET=INTEL_SOURCE),
                         (0, 'target_sha=' + INTEL_SOURCE + '\n'))
        baseline = subprocess.check_output(['git', 'show', BASELINE + ':' + WORKFLOW], cwd=ROOT, text=True)
        self.assertEqual(job(self.workflow, 'manual_pi_intel'), job(baseline, 'manual_pi_intel'))
        for name in ('manual_runner_verify', 'manual_ajv_pack_diagnostic'):
            self.assertEqual(job(self.workflow, name), job(baseline, name))

    def test_focused_commands_are_complete_support_only_and_image_is_excluded(self):
        source = job(self.workflow, 'manual_source_verify')
        plan = script(source, 'Record immutable source and planned checks')
        focused = plan.split('if [ "$SOURCE_E2E_SUPPORT_ONLY" = true ]; then', 1)[1].split('\nfi', 1)[0]
        self.assertEqual(re.findall(r"^    '([^']+)'", focused, re.M), [
            'pnpm test:e2e:runner:typecheck', 'pnpm test:e2e:runner:unit',
            'node cli/node_modules/tsx/dist/cli.mjs tests/runner-e2e/launch.ts --list'])
        self.assertIn('!inputs.source_e2e_support_only', job(self.workflow, 'manual_image'))
        self.assertIn("inputs.source_e2e_support_only && 'source-e2e-support'", self.workflow)
        self.assertNotIn('packages: write', source)
        self.assertNotIn('secrets.', source)
        self.assertIn('persist-credentials: false', source)
        self.assertIn('1380 - $(date +%s) + checks_started_at', source)
        self.assertIn('check_timeout=15m', source)
        self.assertIn('inputs.source_e2e_support_only && 45', source)
        self.assertIn('256 * 1024 * 1024', source)
        self.assertIn('inputs.source_e2e_support_only && 7 || 14', source)

    def test_complete_failure_evidence_is_admitted_and_unsafe_or_oversize_is_not(self):
        source = script(job(self.workflow, 'manual_source_verify'), 'Admit complete focused evidence within the storage bound')
        admission = source.split("<<'PYTHON'\n", 1)[1].rsplit('PYTHON', 1)[0]
        for scenario in ('failed-check', 'oversize', 'symlink', 'absent'):
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as temp:
                root = Path(temp); evidence = root / 'remote-source-verification'; evidence.mkdir()
                if scenario == 'failed-check':
                    (evidence / 'check-1.log').write_text('real failure output\n')
                    (evidence / 'check-1.status').write_text('1\n')
                elif scenario == 'oversize':
                    with (evidence / 'large.log').open('wb') as output: output.truncate(256 * 1024 * 1024 + 1)
                elif scenario == 'symlink': (evidence / 'link').symlink_to(root / 'outside')
                output = root / 'output'
                result = subprocess.run([sys.executable, '-c', admission], cwd=root,
                                        env={'GITHUB_OUTPUT': str(output)}, capture_output=True, timeout=5)
                if scenario == 'failed-check':
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(output.read_text(), 'admitted=true\n')
                    self.assertIn('real failure output', (evidence / 'check-1.log').read_text())
                    self.assertTrue((evidence / 'evidence-inventory.json').is_file())
                else:
                    self.assertNotEqual(result.returncode, 0)
                    self.assertFalse(output.exists())

    def test_all_embedded_shell_scripts_parse(self):
        for number, match in enumerate(re.finditer(r'^        run: \|\n((?:          .*\n|\n)+)', self.workflow, re.M)):
            # The heredoc retains its Python as data for bash syntax validation.
            with self.subTest(block=number):
                subprocess.run(['bash', '-n'], input=textwrap.dedent(match.group(1)), text=True, check=True)


if __name__ == '__main__':
    unittest.main()
