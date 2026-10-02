// Diagnostic only: import the exact built verifier, never execute its snapshot.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function validateEnvironment(env, pool) {
  assert.ok(['4', '16'].includes(pool));
  assert.equal(env.UV_THREADPOOL_SIZE, pool);
  const expected = ['HOME', 'LANG', 'PATH', 'TMPDIR', 'UV_THREADPOOL_SIZE'];
  // macOS adds this scalar even to a replaced OS process environment. Admit
  // only the current UID with the default encoding; never filter unknown keys.
  if (Object.hasOwn(env, '__CF_USER_TEXT_ENCODING')) {
    const match = /^0x([0-9a-f]+):0x0:0x0$/i.exec(env.__CF_USER_TEXT_ENCODING);
    assert.ok(match); assert.equal(Number.parseInt(match[1], 16), process.getuid());
    expected.push('__CF_USER_TEXT_ENCODING');
  }
  assert.deepEqual(Object.keys(env).sort(), expected.sort());
}
export function verifySealedSnapshot(value, entries, temporaryRoot) {
  const snapshot = value.snapshot;
  assert.equal(snapshot.executable, null);
  assert.equal(snapshot.roots.length, 1);
  const root = snapshot.roots[0];
  assert.equal(dirname(dirname(root)), temporaryRoot);
  assert.equal(fs.realpathSync(root), root);
  const expected = new Map(entries.map(e => [e.path, { sha256: e.sha256, mode: e.executable ? 0o500 : 0o400, size: e.size }]));
  const expectedDirectories = new Set(['']);
  for (const entry of entries) {
    const parts = entry.path.split('/');
    for (let n = 1; n < parts.length; n++) expectedDirectories.add(parts.slice(0, n).join('/'));
  }
  for (const name of ['.paperclip-native-entry.cjs', '.paperclip-native-module-guard.cjs']) {
    expected.set(name, { sha256: snapshot.digests[join(root, name)], mode: 0o400 });
  }
  assert.equal(Object.keys(snapshot.digests).length, expected.size);
  const seen = [], seenDirectories = [];
  function walk(directory) {
    const ds = fs.lstatSync(directory);
    assert.ok(ds.isDirectory() && !ds.isSymbolicLink());
    assert.equal(ds.mode & 0o777, 0o500);
    seenDirectories.push(relative(root, directory));
    for (const name of fs.readdirSync(directory).sort()) {
      const path = join(directory, name), st = fs.lstatSync(path);
      assert.ok(!st.isSymbolicLink());
      if (st.isDirectory()) { walk(path); continue; }
      const key = relative(root, path), entry = expected.get(key);
      assert.ok(entry, `Unexpected snapshot member: ${key}`);
      assert.ok(st.isFile()); assert.equal(st.nlink, 1);
      assert.equal(st.mode & 0o777, entry.mode);
      if (entry.size !== undefined) assert.equal(st.size, entry.size);
      assert.equal(snapshot.digests[path], entry.sha256);
      assert.equal(sha(fs.readFileSync(path)), entry.sha256);
      seen.push(key);
    }
  }
  walk(root);
  assert.deepEqual(seen.sort(), [...expected.keys()].sort());
  assert.deepEqual(seenDirectories.sort(), [...expectedDirectories].sort());
  const privateRoot = dirname(root);
  assert.deepEqual(fs.readdirSync(privateRoot).sort(), ['distribution', 'manifest.json']);
  const manifestStat = fs.lstatSync(snapshot.handoff.path);
  assert.equal(snapshot.handoff.path, join(privateRoot, 'manifest.json'));
  assert.ok(manifestStat.isFile()); assert.equal(manifestStat.nlink, 1);
  assert.equal(manifestStat.mode & 0o777, 0o400);
  const handoff = fs.readFileSync(snapshot.handoff.path);
  assert.equal(sha(handoff), snapshot.handoff.digest);
  assert.deepEqual(JSON.parse(handoff), { roots: [root], executable: null, digests: snapshot.digests });
  assert.equal(sha(value.bootstrap), expected.get('.paperclip-native-entry.cjs').sha256);
  const fd = fs.fstatSync(value.commandDirectory.fd), named = fs.lstatSync(root);
  assert.equal(fd.dev, named.dev); assert.equal(fd.ino, named.ino);
  return { files: seen.length, bytes: entries.reduce((sum, e) => sum + e.size, 0), handoffVerified: true, descriptorIdentityVerified: true };
}
export async function run(pack, pin, pool, report) {
  validateEnvironment(process.env, pool);
  assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'x64');
  assert.equal(process.version, 'v24.21.0');
  const tmp = fs.realpathSync(process.env.TMPDIR);
  assert.deepEqual(fs.readdirSync(tmp), []);
  const tmpIdentity = fs.lstatSync(tmp);
  assert.equal(tmpIdentity.mode & 0o777, 0o700);
  const modulePath = join(pack, pin.modulePath);
  assert.equal(sha(fs.readFileSync(modulePath)), pin.moduleSha256);
  assert.equal(sha(fs.readFileSync(join(pack, pin.closureManifestPath))), pin.closureManifestSha256);
  const native = await import(pathToFileURL(modulePath).href);
  const input = { distributionRoot: join(pack, pin.distributionPath), manifestPath: join(pack, pin.closureManifestPath), expectedClosureSha256: pin.closureDigest.replace(/^sha256:/, ''), executable: 'node/bin/node', entrypoint: 'pi-entry.cjs', fixedArguments: [] };
  const proof = { schema: 'paperclip.snapshot-pool-copy/v1', isQualification: false, poolRequestedAtProcessStart: Number(pool), actualThreadCountMeasured: false, moduleSha256: pin.moduleSha256, admittedEnvironmentKeys: Object.keys(process.env).sort(), osAddedTextEncoding: process.env.__CF_USER_TEXT_ENCODING ?? null, providerCalls: 0, vendorProcessesStarted: 0, snapshotClosed: false, commandDirectoryClosed: false };
  let snapshot;
  try {
    const entries = await native.readNativeAcpxDistributionEntries(input);
    assert.equal(entries.length, pin.entries);
    assert.equal(entries.reduce((sum, e) => sum + e.size, 0), pin.distributionBytes);
    const start = process.hrtime.bigint();
    snapshot = await native.createNativeAcpxDistributionSnapshot(input, entries);
    proof.snapshotMilliseconds = Number(process.hrtime.bigint() - start) / 1e6;
    // Deliberately outside the timed routine; this extra verification is identical in all four children.
    proof.sealedOutput = verifySealedSnapshot(snapshot, entries, tmp);
    proof.status = 'snapshot_verified_not_executed';
  } finally {
    const errors = [];
    if (snapshot) {
      try { await snapshot.commandDirectory.close(); proof.commandDirectoryClosed = true; } catch (error) { errors.push(error); }
      try { await snapshot.snapshot.close(); proof.snapshotClosed = true; } catch (error) { errors.push(error); }
    }
    try {
      const current = fs.lstatSync(tmp);
      assert.equal(current.dev, tmpIdentity.dev); assert.equal(current.ino, tmpIdentity.ino);
      assert.deepEqual(fs.readdirSync(tmp), []); proof.temporaryRootEmpty = true;
    } catch (error) { errors.push(error); }
    proof.cleanupErrors = errors.map(error => String(error));
    fs.writeFileSync(report, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    if (errors.length) throw new AggregateError(errors, 'Snapshot cleanup incomplete');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [pack, pinPath, pool, report] = process.argv.slice(2);
  await run(pack, JSON.parse(fs.readFileSync(pinPath)), pool, report);
}
