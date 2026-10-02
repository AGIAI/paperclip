import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateEnvironment, verifySealedSnapshot } from './snapshot-pool-fixture.mjs';

const modulePath = process.env.PI_POOL_TEST_MODULE;
assert.ok(modulePath, 'Explicit retained built-module path is required for this calibration');
assert.equal(createHash('sha256').update(fs.readFileSync(modulePath)).digest('hex'), '2c321e2a6b356bdd92e19493ee1d848436bdc895e5aa98c4190a0d8658df15df');
const native = await import(pathToFileURL(modulePath).href);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('environment rejects ambient credentials, mismatched or unsupported pools', () => {
  const good = { HOME: '/home', LANG: 'C', PATH: '/bin', TMPDIR: '/tmp', UV_THREADPOOL_SIZE: '4' };
  validateEnvironment(good, '4');
  assert.throws(() => validateEnvironment({ ...good, OPENROUTER_API_KEY: 'dummy' }, '4'));
  assert.throws(() => validateEnvironment(good, '16'));
  assert.throws(() => validateEnvironment({ ...good, UV_THREADPOOL_SIZE: '8' }, '8'));
  validateEnvironment({ ...good, __CF_USER_TEXT_ENCODING: `0x${process.getuid().toString(16)}:0x0:0x0` }, '4');
  assert.throws(() => validateEnvironment({ ...good, __CF_USER_TEXT_ENCODING: `0x${(process.getuid() + 1).toString(16)}:0x0:0x0` }, '4'));
  assert.throws(() => validateEnvironment({ ...good, __CF_USER_TEXT_ENCODING: 'unknown' }, '4'));
});

for (const mutation of ['none', 'changed bytes', 'wrong mode', 'extra file', 'extra directory', 'symbolic link', 'hardlink', 'handoff drift']) {
  test(`actual built snapshot calibration: ${mutation}`, async () => {
    const source = fs.mkdtempSync(join(tmpdir(), 'pc-pool-calibration-'));
    let value;
    try {
      const entries = [{ path: 'entry.cjs', sha256: sha('entry'), size: 5, executable: false }, { path: 'node', sha256: sha('node'), size: 4, executable: true }];
      fs.writeFileSync(join(source, 'entry.cjs'), 'entry', { mode: 0o600 });
      fs.writeFileSync(join(source, 'node'), 'node', { mode: 0o700 });
      const manifestPath = join(source, 'closure.json');
      fs.writeFileSync(manifestPath, JSON.stringify({ entries }));
      const input = { distributionRoot: source, manifestPath, expectedClosureSha256: sha(JSON.stringify(entries)), executable: 'node', entrypoint: 'entry.cjs', fixedArguments: [] };
      value = await native.createNativeAcpxDistributionSnapshot(input, await native.readNativeAcpxDistributionEntries(input));
      const root = value.snapshot.roots[0], target = join(root, 'entry.cjs');
      if (mutation !== 'none') fs.chmodSync(root, 0o700);
      if (mutation === 'changed bytes') { fs.chmodSync(target, 0o600); fs.writeFileSync(target, 'wrong'); fs.chmodSync(target, 0o400); }
      if (mutation === 'wrong mode') fs.chmodSync(target, 0o600);
      if (mutation === 'extra file') fs.writeFileSync(join(root, 'extra'), 'x', { mode: 0o400 });
      if (mutation === 'extra directory') fs.mkdirSync(join(root, 'extra'), { mode: 0o500 });
      if (mutation === 'symbolic link') { fs.unlinkSync(target); fs.symlinkSync(join(source, 'entry.cjs'), target); }
      if (mutation === 'hardlink') fs.linkSync(target, join(source, 'linked'));
      if (mutation === 'handoff drift') value.snapshot.handoff.digest = '0'.repeat(64);
      if (mutation !== 'none') fs.chmodSync(root, 0o500);
      if (mutation === 'none') assert.equal(verifySealedSnapshot(value, entries, fs.realpathSync(tmpdir())).files, 4);
      else assert.throws(() => verifySealedSnapshot(value, entries, fs.realpathSync(tmpdir())));
    } finally {
      if (value) {
        await value.commandDirectory.close();
        // The extra empty directory is an intentionally foreign fixture node;
        // make it removable without changing the production close function.
        const extra = join(value.snapshot.roots[0], 'extra');
        if (fs.existsSync(extra) && fs.lstatSync(extra).isDirectory()) fs.chmodSync(extra, 0o700);
        await value.snapshot.close();
      }
      fs.rmSync(source, { recursive: true, force: true });
    }
  });
}
