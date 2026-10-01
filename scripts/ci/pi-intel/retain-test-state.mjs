// Observe only this test's final cleanup; source, assertions, and runtime stay unchanged.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
const original = fs.promises.rm;
const owner = fs.realpathSync(process.env.PI_INTEL_OWNED_TMP);
const retained = fs.realpathSync(process.env.PI_INTEL_RETAINED_STATE);
fs.promises.rm = async function (path, options) {
  const absolute = typeof path === 'string' ? resolve(path) : null;
  if (!absolute || dirname(absolute) !== owner || !basename(absolute).startsWith('pi-closed-startup-')) {
    return original.call(this, path, options);
  }
  const info = await fs.promises.lstat(absolute);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid()) {
    throw new Error('Refusing unowned Pi startup retention path');
  }
  try {
    await fs.promises.cp(absolute, `${retained}/${basename(absolute)}`, {
      recursive: true, errorOnExist: true, force: false, dereference: false,
    });
  } finally {
    // Capturing evidence must never prevent the original test's cleanup.
    await original.call(this, path, options);
  }
};
syncBuiltinESMExports();
