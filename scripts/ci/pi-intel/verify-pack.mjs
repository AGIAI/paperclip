import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, readlinkSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function requireTrue(value, message) { if (!value) throw new Error(message); }
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function sha256File(path) { return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`; }
// Exactly the frozen builder's tree framing and localeCompare ordering.
export function sha256Tree(root) {
  const hash = createHash('sha256');
  const visit = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      const p = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) { hash.update(`directory\0${p}\n`); visit(absolute, p); }
      else if (entry.isFile()) hash.update(`file\0${p}\0${sha256File(absolute)}\n`);
      else if (entry.isSymbolicLink()) hash.update(`symlink\0${p}\0${readlinkSync(absolute)}\n`);
      else throw new Error('Unsupported entry');
    }
  };
  visit(root); return `sha256:${hash.digest('hex')}`;
}
function contained(root, candidate) {
  const rel = relative(realpathSync(root), realpathSync(candidate));
  requireTrue(rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel), 'Artifact escaped pack');
}
export function checkedArtifact(pack, entry, kind) {
  requireTrue(typeof entry?.path === 'string' && /^sha256:[a-f0-9]{64}$/.test(entry?.sha256), 'Malformed artifact');
  requireTrue(!isAbsolute(entry.path) && !entry.path.split('/').includes('..'), 'Unsafe artifact path');
  const path = resolve(pack, entry.path); contained(pack, path);
  const st = lstatSync(path);
  requireTrue(kind === 'directory' ? st.isDirectory() && !st.isSymbolicLink() : st.isFile() || st.isSymbolicLink(), 'Artifact type mismatch');
  const actual = kind === 'directory' ? sha256Tree(path) : sha256File(path);
  requireTrue(actual === entry.sha256, 'Artifact bytes mismatch: ' + entry.path);
  return { path: entry.path, kind, sha256: actual };
}
export function verifyPack(pack, source, platform, architecture) {
  const manifest = JSON.parse(readFileSync(join(pack, 'provider-pack.json')));
  const p = manifest.payload;
  requireTrue(manifest.schema === 'paperclip-runner/remote-provider-pack/v1', 'Wrong schema');
  requireTrue(manifest.digest === `sha256:${createHash('sha256').update(canonicalJson(p)).digest('hex')}`, 'Canonical manifest mismatch');
  requireTrue(p.runnerSourceRevision === source, 'Wrong source');
  requireTrue(p.target.platform === platform && p.target.architecture === architecture, 'Wrong target');
  const pins = { cursor: '1df2a15b93bc3a14fa47fa3315344ba023fe2412048047cdc6f32096a6336564', copilot: '48cecd8dc77a5533240fcf2f29d19be05380da4a79f8e5061480f94241db75a8', pi: '47306e6d2a9b59e8f9189f725ebb7a0a7f91826044d1739e1a35ab31f228ba1f' };
  requireTrue(Object.keys(p.candidateProviders).sort().join(',') === Object.keys(pins).sort().join(','), 'Wrong candidate set');
  const closurePins = JSON.parse(readFileSync(new URL('./profile-inputs.json', import.meta.url))).candidateClosureDigests;
  const checks = [];
  for (const [agent, digest] of Object.entries(pins)) {
    const c = p.candidateProviders[agent];
    requireTrue(c.profileDigest === 'sha256:' + digest && c.qualification === 'pending', 'Candidate identity mismatch');
    requireTrue(c.path === `provider-assets/${agent}/${platform}-${architecture}`, 'Unexpected candidate path');
    requireTrue(c.closureDigest === closurePins[agent]?.[`${platform}-${architecture}`], 'Native closure pin mismatch');
    checks.push(checkedArtifact(pack, c, 'directory'));
  }
  for (const entry of Object.values(p.artifacts)) checks.push(checkedArtifact(pack, entry, 'file'));
  requireTrue(sha256Tree(join(pack, 'dist')) === p.distDigest, 'Packed dist mismatch');
  const bridge = createHash('sha256').update(p.artifacts.opencodeProxy.sha256).update('\n').update(p.artifacts.acpxSidecar.sha256).update('\n').update(p.distDigest).digest('hex');
  requireTrue('sha256:' + bridge === p.bridgeDigest, 'Bridge mismatch');
  const r = createRequire(join(pack, 'package.json'));
  const acpx = r.resolve('acpx/package.json');
  const sdk = createRequire(acpx).resolve('@agentclientprotocol/sdk');
  requireTrue(JSON.parse(readFileSync(acpx)).version === '0.13.1' && sdk.includes('@agentclientprotocol+sdk@1.4.0_'), 'Wrong production ACPX/SDK');
  contained(pack, acpx); contained(pack, sdk);
  return { manifestDigest: manifest.digest, checks, distDigest: p.distDigest, bridgeDigest: p.bridgeDigest, acpx, sdk, target: p.target, sourceRevision: source };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  requireTrue(process.argv.length === 6, 'Expected pack source platform architecture');
  console.log(JSON.stringify(verifyPack(...process.argv.slice(2))));
}
