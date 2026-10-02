import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { requireTrue, verifyPack } from './verify-pack.mjs';

// Separate authority preserves the historical profile12 diagnostic verifier.
export function verifyProfile13Selection(payload, platform, architecture) {
  const inputs = JSON.parse(readFileSync(new URL('./profile13-inputs.json', import.meta.url)));
  const digest = 'sha256:fe1e6da01b2a9e4c691ca27cf689d2d6de846a93be6b23fc1e103c9addd7b177';
  requireTrue(Object.keys(payload.candidateProviders ?? {}).sort().join(',') === 'pi', 'Wrong normal provider set');
  const pi = payload.candidateProviders.pi;
  requireTrue(pi?.profileDigest === digest && pi.qualification === 'qualified', 'Normal Pi13 identity mismatch');
  requireTrue(pi.path === `provider-assets/pi/${platform}-${architecture}`, 'Unexpected Pi path');
  requireTrue(pi.closureDigest === inputs.candidateClosureDigests.pi?.[`${platform}-${architecture}`], 'Native Pi13 closure mismatch');
  requireTrue(inputs.normalProviderSelection.pi.profileVersion === 13 && inputs.normalProviderSelection.pi.profileDigest === digest && inputs.normalProviderSelection.pi.qualification === 'qualified', 'Pi13 selection authority mismatch');
  requireTrue(inputs.profiles.pi.version === 13 && inputs.profiles.pi.digest === digest, 'Pi13 source authority mismatch');
  return pi;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  requireTrue(process.argv.length === 6, 'Expected pack source platform architecture');
  console.log(JSON.stringify(verifyPack(...process.argv.slice(2), verifyProfile13Selection)));
}
