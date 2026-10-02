import copy
import hashlib
import json
import os
import unittest
from pathlib import Path
from startup_overlap_patch import apply_overlap


class OverlapPatchTests(unittest.TestCase):
    def setUp(self):
        self.original = b'first\nold\nlast\n'
        self.candidate = b'first\nnew\nextra\nlast\n'
        self.patch = {
            'schema': 'paperclip.exact-sidecar-overlap-patch/v1',
            'originalSha256': hashlib.sha256(self.original).hexdigest(),
            'candidateSha256': hashlib.sha256(self.candidate).hexdigest(),
            'operations': [{'oldStartLine': 1, 'oldLines': ['old\n'],
                            'newLines': ['new\n', 'extra\n']}],
        }

    def test_exact_compiled_bytes(self):
        self.assertEqual(apply_overlap(self.original, self.patch), self.candidate)

    def test_original_mutation(self):
        with self.assertRaisesRegex(ValueError, 'Original sidecar identity'):
            apply_overlap(self.original + b'changed', self.patch)

    def test_wrong_context(self):
        self.patch['operations'][0]['oldLines'] = ['foreign\n']
        with self.assertRaisesRegex(ValueError, 'context mismatch'):
            apply_overlap(self.original, self.patch)

    def test_changed_candidate(self):
        self.patch['operations'][0]['newLines'] = ['wrong\n']
        with self.assertRaisesRegex(ValueError, 'Compiled candidate identity'):
            apply_overlap(self.original, self.patch)

    def test_duplicate_or_overlapping_operations(self):
        self.patch['operations'].append(copy.deepcopy(self.patch['operations'][0]))
        with self.assertRaisesRegex(ValueError, 'Overlapping or unordered'):
            apply_overlap(self.original, self.patch)

    def test_unbounded_patch(self):
        self.patch['operations'][0]['newLines'] = ['x' * (256 * 1024 + 1)]
        with self.assertRaisesRegex(ValueError, 'addition bound'):
            apply_overlap(self.original, self.patch)


class RetainedCandidateTests(unittest.TestCase):
    def test_exact_compiled_candidate_and_unchanged_base_contract(self):
        here = Path(__file__).parent
        inputs = json.loads((here / 'startup-overlap-inputs.json').read_text())
        patch_bytes = (here / 'startup-overlap-patch.json').read_bytes()
        self.assertEqual(hashlib.sha256(patch_bytes).hexdigest(), inputs['prototypePatchSha256'])
        patch = json.loads(patch_bytes)
        original = Path(os.environ['PI_DIAGNOSTIC_ORIGINAL_SIDECAR']).read_bytes()
        candidate = apply_overlap(original, patch)
        self.assertEqual(hashlib.sha256(candidate).hexdigest(), inputs['prototypeSidecarSha256'])
        self.assertEqual(patch['sourceChanges'], inputs['prototypeSource']['changes'])
        self.assertEqual({row['path'] for row in patch['sourceChanges']}, {
            'packages/paperclip-runner/src/drivers/acpx/pi-installation.ts',
            'packages/paperclip-runner/src/drivers/acpx/pi-verified-runtime.ts',
        })
        self.assertTrue(inputs['prototypeSource']['baseReproducedExactly'])
        base = json.loads((here / 'startup-diagnostic-inputs.json').read_text())
        for name in ['sourceRevision', 'selectedFiles', 'daemonSha256', 'testSha256',
                     'originalSidecarSha256', 'originalPackDigest', 'nodeSha256',
                     'executionCount', 'providerCalls', 'timeoutChanges',
                     'archiveBytesMaximum', 'retentionDays']:
            self.assertEqual(inputs[name], base[name], name)


if __name__ == '__main__':
    unittest.main()
