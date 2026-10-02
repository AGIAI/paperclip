import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyProfile13Selection as verifyNormalPiSelection } from './verify-pack-profile13.mjs';
const valid = () => ({ candidateProviders: { pi: {
  qualification: 'qualified',
  profileDigest: 'sha256:fe1e6da01b2a9e4c691ca27cf689d2d6de846a93be6b23fc1e103c9addd7b177',
  path: 'provider-assets/pi/darwin-x64',
  closureDigest: 'sha256:4728e5a4e7fc1ba602c3e219824fb84884b05a06cdd19dd3e521ee312e1b373a',
} } });
test('admits exact default qualified Pi13 only', () => {
  const payload = valid(); assert.equal(verifyNormalPiSelection(payload, 'darwin', 'x64'), payload.candidateProviders.pi);
});
for (const [name, change] of [
  ['old pending qualification', p => p.candidateProviders.pi.qualification = 'pending'],
  ['stale profile digest', p => p.candidateProviders.pi.profileDigest = 'sha256:' + '0'.repeat(64)],
  ['stale native closure', p => p.candidateProviders.pi.closureDigest = 'sha256:' + '0'.repeat(64)],
  ['extra pending provider', p => p.candidateProviders.cursor = { qualification: 'pending' }],
  ['missing Pi', p => delete p.candidateProviders.pi],
  ['missing provider map', p => delete p.candidateProviders],
  ['escaped assets path', p => p.candidateProviders.pi.path = '../provider-assets/pi/darwin-x64'],
  ['wrong architecture path', p => p.candidateProviders.pi.path = 'provider-assets/pi/darwin-arm64'],
]) test(`rejects ${name}`, () => { const payload = valid(); change(payload); assert.throws(() => verifyNormalPiSelection(payload, 'darwin', 'x64')); });
