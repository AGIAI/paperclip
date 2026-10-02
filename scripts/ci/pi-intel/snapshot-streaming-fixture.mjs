// Diagnostic derivative only; original retained pack never changes.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {validateEnvironment,verifySealedSnapshot} from './snapshot-pool-fixture.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function run(pack, pin, variant, report) {
  validateEnvironment(process.env, '4');
  assert.ok(['baseline','candidate'].includes(variant));
  assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'x64');
  assert.equal(process.version, 'v24.21.0');
  const tmp = fs.realpathSync(process.env.TMPDIR);
  assert.deepEqual(fs.readdirSync(tmp), []);
  const tmpIdentity = fs.lstatSync(tmp);
  assert.equal(tmpIdentity.mode & 0o777, 0o700);
  const modulePath = variant==='baseline' ? join(pack,pin.modulePath) : join(dirname(fileURLToPath(import.meta.url)),'snapshot-streaming-candidate.mjs');
  const moduleSha256=variant==='baseline'?pin.moduleSha256:pin.candidateModuleSha256;
  assert.equal(sha(fs.readFileSync(join(pack,pin.modulePath))),pin.moduleSha256);
  assert.equal(sha(fs.readFileSync(modulePath)), moduleSha256);
  assert.equal(sha(fs.readFileSync(join(pack, pin.closureManifestPath))), pin.closureManifestSha256);
  const native = await import(pathToFileURL(modulePath).href);
  const input = { distributionRoot: join(pack, pin.distributionPath), manifestPath: join(pack, pin.closureManifestPath), expectedClosureSha256: pin.closureDigest.replace(/^sha256:/, ''), executable: 'node/bin/node', entrypoint: 'pi-entry.cjs', fixedArguments: [] };
  const proof = { schema: 'paperclip.snapshot-streaming-copy/v1', variant, isQualification: false, poolRequestedAtProcessStart: 4, actualThreadCountMeasured: false, moduleSha256, admittedEnvironmentKeys: Object.keys(process.env).sort(), osAddedTextEncoding: process.env.__CF_USER_TEXT_ENCODING ?? null, providerCalls: 0, vendorProcessesStarted: 0, snapshotClosed: false, commandDirectoryClosed: false };
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
  const [pack, pinPath, variant, report] = process.argv.slice(2);
  await run(pack, JSON.parse(fs.readFileSync(pinPath)), variant, report);
}
