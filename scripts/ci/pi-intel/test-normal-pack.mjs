import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyNormalPiSelection } from './verify-pack.mjs';
const valid = () => ({ candidateProviders: { pi: {
  qualification: 'qualified',
  profileDigest: 'sha256:47306e6d2a9b59e8f9189f725ebb7a0a7f91826044d1739e1a35ab31f228ba1f',
  path: 'provider-assets/pi/darwin-x64',
  closureDigest: 'sha256:03351f4a250a8db0e79411a9079b43a0ff05f72a2aff41fae17f1fc2de24bd41',
} } });
test('admits exact default qualified Pi12 only', () => {
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
