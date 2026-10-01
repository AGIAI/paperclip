"""Sparse additive instrumentation of one pinned bundle; never edits vendor closure bytes."""
import hashlib,json
from source_guard import require
ORIGINAL_SHA='97eedf930681729c6a1654e6c54bcc9657154e5dd2761f9922f4b01c7358f9f7'
PREFIX='__pcStartupDiagnostic'

def patch_sidecar(original,sink):
 require(hashlib.sha256(original).hexdigest()==ORIGINAL_SHA,'Diagnostic sidecar original digest mismatch')
 require(set(sink)=={'path','dev','ino','uid'} and sink['path'].startswith('/private/tmp/pc-intel-diagnostic-') and sink['path'].endswith('/startup-timings.jsonl'),'Unexpected timing sink binding')
 require(all(isinstance(sink[k],str) and sink[k].isdigit() for k in ['dev','ino','uid']),'Sink identity must use decimal strings')
 text=original.decode();insertions=[];labels=[]
 def mark(scope,anchor,label,after=False):
  start=text.rindex(scope) if scope else 0
  end=text.find('\n// src/',start+len(scope)) if scope else len(text)
  if end<0:end=len(text)
  sub=text[start:end];require(sub.count(anchor)==1,'Missing/ambiguous timing anchor: '+label)
  pos=start+sub.index(anchor)+(len(anchor) if after else 0)
  insertions.append((pos,'\n'+PREFIX+'Mark('+json.dumps(label)+');\n'));labels.append(label)
 mark('', '#!/usr/bin/env node\n','sidecar.entry',True)
 mark('// src/cli/acpx-runtime-sidecar.ts','async function dispatch(request) {','sidecar.dispatch',True)
 mark('// src/cli/acpx-runtime-sidecar.ts','if (request.command === "session.open") {','session.open.begin',True)
 mark('// src/cli/acpx-runtime-sidecar.ts','    host = openedHost;','session.open.admitted')
 mark('// src/cli/acpx-runtime-sidecar.ts','    const normalized = error51 instanceof Error ? error51 : new Error(String(error51));','sidecar.command.error')
 mark('// src/cli/acpx-runtime-sidecar.ts','function requestShutdown(reason) {','sidecar.shutdown.request',True)
 mark('// src/drivers/acpx/runtime-host.ts','  static async open(options, dependencies) {','host.open.begin',True)
 mark('// src/drivers/acpx/runtime-host.ts','    const installation = await runAbortableAdmissionStage(','installation.begin')
 mark('// src/drivers/acpx/runtime-host.ts','    if (installation.commandDigest !== profile.commandDigest) {','installation.end')
 mark('// src/drivers/acpx/runtime-host.ts','      const sandbox = await runAbortableAdmissionStage(','sandbox.begin')
 mark('// src/drivers/acpx/runtime-host.ts','      assertAcpxProfileEnvironment(options.agent, sandbox.launchEnvironment);','sandbox.lifetime.end')
 mark('// src/drivers/acpx/runtime-host.ts','      command = await acquireAbortableAdmissionResource({','command.acquire.begin')
 mark('// src/drivers/acpx/runtime-host.ts','      const commandOwner = createAcpxCommandLeaseOwner(','command.acquire.end')
 mark('// src/drivers/acpx/runtime-host.ts','      runtime = await acquireAbortableAdmissionResource({','runtime.acquire.begin')
 mark('// src/drivers/acpx/pi-installation.ts','async function verifyPiInstallation(profile) {','pi.install.begin',True)
 mark('// src/drivers/acpx/pi-installation.ts','  const verified = await verifyPiRuntimeManifest(runtimeRoot, manifest);','pi.manifest.begin')
 mark('// src/drivers/acpx/pi-installation.ts','  if (verified.manifestDigest !== metadata.manifestDigest)','pi.manifest.end')
 mark('// src/drivers/acpx/pi-installation.ts','  return Object.freeze({','pi.install.end')
 mark('// src/drivers/acpx/pi-verified-runtime.ts','async function inventoryPiRuntimeFiles(root) {','pi.discovery.begin',True)
 mark('// src/drivers/acpx/pi-verified-runtime.ts','  await visit(physicalRoot);','pi.discovery.end',True)
 mark('// src/drivers/acpx/pi-verified-runtime.ts','  for (let index = 0; index < regular.length;','pi.hash.begin')
 mark('// src/drivers/acpx/pi-verified-runtime.ts','  return files;','pi.hash.end')
 mark('// src/drivers/acpx/native-distribution-integrity.ts','async function createNativeAcpxDistributionSnapshot(input, entries) {','snapshot.begin',True)
 mark('// src/drivers/acpx/native-distribution-integrity.ts','    const copyEntry = async (entry) => {','snapshot.directories.end')
 mark('// src/drivers/acpx/native-distribution-integrity.ts','    for (let start = 0; start < entries.length; ) {','snapshot.copy.begin')
 mark('// src/drivers/acpx/native-distribution-integrity.ts','    const executable = (0, import_node_path5.join)(packageRoot, ...input.executable.split("/"));','snapshot.copy.end')
 mark('// src/drivers/acpx/native-distribution-integrity.ts','    await directoryBatch([...directories], (path3) => (0, import_promises6.chmod)(path3, 320));','snapshot.seal.begin')
 mark('// src/drivers/acpx/native-distribution-integrity.ts','    return { commandDirectory, bootstrap, snapshot:','snapshot.seal.end')
 mark('// src/drivers/acpx/installation-integrity.ts','      const lease = commandLease(','command.lease.begin')
 mark('// src/drivers/acpx/installation-integrity.ts','      return {\n        spawn(args = [], options = {}, lifetime) {','command.lease.end')
 mark('// src/drivers/acpx/installation-integrity.ts','      if (consumed) throw new Error("Verified ACPX command lease is closed");','command.spawn.begin')
 mark('// src/drivers/acpx/installation-integrity.ts','        const runtimeHandoff = verifiedRuntimeExecutableHandoff(runtimeTargetFd);','runtime.handoff.begin')
 mark('// src/drivers/acpx/installation-integrity.ts','        const environment = sanitizedNodeEnvironment(options.env);','runtime.handoff.end')
 mark('// src/drivers/acpx/installation-integrity.ts','        child = (0, import_node_child_process2.spawn)(','command.os_spawn.begin')
 mark('// src/drivers/acpx/installation-integrity.ts','        if (guarded) {\n          const guardianOwnerPipe','command.os_spawn.end')
 mark('// src/drivers/acpx/codex-runtime-adapter.ts','    onAgentInitialize: (result) => {','wrapper.initialize.ack',True)
 mark('// src/drivers/acpx/codex-runtime-adapter.ts','      commandLaunches.count += 1;','runtime.spawn.callback')
 mark('// src/drivers/acpx/codex-runtime-adapter.ts','  const ensuredSession = Promise.resolve().then(','runtime.ensure.begin')
 mark('// src/drivers/acpx/codex-runtime-adapter.ts','    cursorInstructions?.assertReady();','runtime.ensure.settled')
 # Catch-all standalone function boundaries relevant to verified-runtime preparation.
 for name in ['verifyAcpxProfileInstallation','verifyQualifiedRuntimeExecutable','openVerifiedRuntimeExecutable','openVerifiedCommandDirectory','createAcpxPrivateSnapshot','acquireAcpxProviderLifetimeLease']:
  anchor='async function '+name+'('
  start=text.index(anchor);body=text.index(' {\n',start)+3
  label='entry.'+name
  insertions.append((body,'\n'+PREFIX+'Mark('+json.dumps(label)+');\n'));labels.append(label)
 require(len(labels)==len(set(labels)),'Duplicate diagnostic phase')
 prelude='''
// Explicit diagnostic derivative: bounded phase-only sink, no runtime policy changes.
const __pcStartupDiagnosticFs = require("node:fs");
const __pcStartupDiagnosticBinding = SINK_BINDING;
const __pcStartupDiagnosticAllowed = new Set(ALLOWED_PHASES);
let __pcStartupDiagnosticFd = null, __pcStartupDiagnosticRows = 0, __pcStartupDiagnosticBytes = 0, __pcStartupDiagnosticFailed = false;
function __pcStartupDiagnosticMark(phase) {
  if (__pcStartupDiagnosticFailed) return;
  try {
    if (!__pcStartupDiagnosticAllowed.has(phase) || ++__pcStartupDiagnosticRows > 128) throw new Error("diagnostic bound");
    if (__pcStartupDiagnosticFd === null) __pcStartupDiagnosticFd = __pcStartupDiagnosticFs.openSync(__pcStartupDiagnosticBinding.path, __pcStartupDiagnosticFs.constants.O_WRONLY | __pcStartupDiagnosticFs.constants.O_APPEND | __pcStartupDiagnosticFs.constants.O_NOFOLLOW);
    const st = __pcStartupDiagnosticFs.fstatSync(__pcStartupDiagnosticFd, {bigint:true});
    if (!st.isFile() || st.nlink !== 1n || (st.mode & 511n) !== 384n || st.dev !== BigInt(__pcStartupDiagnosticBinding.dev) || st.ino !== BigInt(__pcStartupDiagnosticBinding.ino) || st.uid !== BigInt(__pcStartupDiagnosticBinding.uid)) throw new Error("diagnostic identity");
    const line = JSON.stringify({phase, ns:process.hrtime.bigint().toString()}) + "\\n";
    if ((__pcStartupDiagnosticBytes += Buffer.byteLength(line)) > 32768 || st.size + BigInt(Buffer.byteLength(line)) > 32768n) throw new Error("diagnostic bound");
    __pcStartupDiagnosticFs.writeSync(__pcStartupDiagnosticFd,line);
    __pcStartupDiagnosticFs.writeSync(2,"PC_STARTUP_TIMING " + line);
  } catch {
    __pcStartupDiagnosticFailed = true;
    try { __pcStartupDiagnosticFs.writeSync(2,"PC_STARTUP_DIAGNOSTIC_SINK_FAILED\\n"); } catch {}
  }
}
process.once("exit", () => __pcStartupDiagnosticMark("sidecar.exit"));
'''.replace('SINK_BINDING',json.dumps(sink)).replace('ALLOWED_PHASES',json.dumps(labels+['sidecar.exit']))
 # Prelude must precede the first mark while preserving the original shebang.
 insertions.append((text.index('\n')+1,prelude))
 # Stable ordering at the shared header offset puts prelude before entry mark.
 ordered=sorted(enumerate(insertions),key=lambda x:(x[1][0],0 if x[1][1]==prelude else 1,x[0]))
 result=[];at=0;patch=[]
 for _,(pos,value) in ordered:
  result.append(text[at:pos]);result.append(value);patch.append({'offset':pos,'inserted':value});at=pos
 result.append(text[at:]);modified=''.join(result).encode()
 return modified,{'schema':'paperclip.startup-timing-additive-patch/v1','originalSha256':ORIGINAL_SHA,'diagnosticSha256':hashlib.sha256(modified).hexdigest(),'sinkBinding':sink,'phases':labels+['sidecar.exit'],'insertions':patch,'onlyAdditions':True,'vendorClosureChanged':False}
