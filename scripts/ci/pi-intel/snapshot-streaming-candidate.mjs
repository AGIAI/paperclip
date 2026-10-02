import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, open, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
const MAX_NATIVE_TREE_BYTES = 1024 * 1024 * 1024;
const MAX_NATIVE_FILE_BYTES = 384 * 1024 * 1024;
const MAX_NATIVE_MANIFEST_BYTES = 4 * 1024 * 1024;
// Bound active copy workers and their retained buffers. Large files stream
// through one chunk instead of excluding other copies or retaining whole files.
const NATIVE_COPY_CONCURRENCY = 32;
const NATIVE_DIRECTORY_CONCURRENCY = 32;
const NATIVE_COPY_BUFFER_BYTES = 32 * 1024 * 1024;
const NATIVE_COPY_CHUNK_BYTES = 1024 * 1024;
const BOOTSTRAP = ".paperclip-native-entry.cjs";
const GUARD = ".paperclip-native-module-guard.cjs";
const COPILOT_ENTRY = ".paperclip-copilot-entry";
export const NATIVE_ACPX_BOOTSTRAP_NAME = BOOTSTRAP;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const validPath = (value) => typeof value === "string" && value.length > 0 && value.length <= 4_096 && !isAbsolute(value) && !/[\u0000-\u001f\u007f\\]/.test(value) && value.split("/").every(part => part.length > 0 && part !== "." && part !== "..");
/** Parse a closed, canonical execution inventory before opening any file in it. */
export function parseNativeAcpxDistributionEntries(value, expectedSha256) {
    if (!/^[a-f0-9]{64}$/.test(expectedSha256))
        throw new Error("Native ACPX closure pin is invalid");
    const entries = value !== null && typeof value === "object" ? value.entries : undefined;
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 30_000)
        throw new Error("Native ACPX closure inventory is invalid");
    let total = 0;
    let previous = "";
    const parsed = entries.map(raw => {
        if (raw === null || typeof raw !== "object" || Array.isArray(raw))
            throw new Error("Native ACPX closure entry is invalid");
        const entry = raw;
        if (Object.keys(entry).some(key => !["path", "sha256", "size", "executable"].includes(key)) || !validPath(entry.path) || entry.path <= previous || entry.path === BOOTSTRAP || entry.path === GUARD || entry.path === "manifest.json" || entry.path.startsWith(".paperclip-"))
            throw new Error("Native ACPX closure paths must be safe, unique and sorted");
        if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.size) || Number(entry.size) < 0 || Number(entry.size) > MAX_NATIVE_FILE_BYTES || typeof entry.executable !== "boolean")
            throw new Error("Native ACPX closure file metadata is invalid");
        previous = entry.path;
        total += Number(entry.size);
        if (total > MAX_NATIVE_TREE_BYTES)
            throw new Error("Native ACPX closure exceeds its byte bound");
        return { path: entry.path, sha256: entry.sha256, size: Number(entry.size), executable: entry.executable };
    });
    if (sha256(JSON.stringify(parsed)) !== expectedSha256)
        throw new Error("Native ACPX closure manifest digest mismatch");
    return parsed;
}
export async function readNativeAcpxDistributionEntries(input) {
    if (!validPath(input.executable) || (input.entrypoint !== undefined && !validPath(input.entrypoint)) || input.fixedArguments.length > 128 || input.fixedArguments.some(arg => typeof arg !== "string" || arg.length > 16_384 || arg.includes("\0")) || (input.isolatedCacheEnvironmentName !== undefined && input.isolatedCacheEnvironmentName !== "COPILOT_PKG_CACHE_HOME")
        || (input.copilotDistributionDirectory !== undefined && (!validPath(input.copilotDistributionDirectory) || input.entrypoint !== undefined)))
        throw new Error("Native ACPX launch declaration is invalid");
    const file = await open(input.manifestPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const before = await file.stat({ bigint: true });
        if (!before.isFile() || before.size < 1n || before.size > BigInt(MAX_NATIVE_MANIFEST_BYTES))
            throw new Error("Native ACPX manifest must be a bounded regular file");
        const bytes = await file.readFile();
        if (!same(before, await file.stat({ bigint: true })) || bytes.length !== Number(before.size))
            throw new Error("Native ACPX manifest changed while read");
        const entries = parseNativeAcpxDistributionEntries(JSON.parse(bytes.toString("utf8")), input.expectedClosureSha256);
        if (!entries.some(entry => entry.path === input.executable && entry.executable && entry.size > 0) || (input.entrypoint !== undefined && !entries.some(entry => entry.path === input.entrypoint && entry.size > 0)))
            throw new Error("Native ACPX executable or entrypoint is absent from its closure");
        if (input.copilotDistributionDirectory !== undefined && !entries.some(entry => entry.path === `${input.copilotDistributionDirectory}/index.js` && entry.size > 0))
            throw new Error("Copilot owned entrypoint is absent from its closure");
        return entries;
    }
    finally {
        await file.close();
    }
}
/**
 * Freeze only manifest-admitted bytes. Native trees deliberately have a separate
 * bound; the tighter JavaScript/npm snapshot limits remain unchanged.
 */
export async function createNativeAcpxDistributionSnapshot(input, entries) {
    // Callers cannot substitute entries between manifest validation and copying.
    entries = parseNativeAcpxDistributionEntries({ entries }, input.expectedClosureSha256);
    if (process.platform !== "linux" && process.platform !== "darwin")
        throw new Error("Native ACPX snapshots require Linux or macOS");
    const source = await realpath(input.distributionRoot);
    const rootBefore = await lstat(source, { bigint: true });
    if (!rootBefore.isDirectory() || rootBefore.isSymbolicLink())
        throw new Error("Native ACPX distribution must be a directory");
    const heldRoot = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY);
    const privateRoot = await realpath(await mkdtemp(join(tmpdir(), "paperclip-acpx-native-")));
    const packageRoot = join(privateRoot, "distribution");
    const cacheRoot = join(privateRoot, "state");
    const directories = new Set([privateRoot, packageRoot]);
    const digests = {};
    const close = async () => {
        for (const path of directories)
            await chmod(path, 0o700).catch(() => undefined);
        await rm(privateRoot, { recursive: true, force: true });
    };
    let commandDirectory;
    try {
        if (!same(rootBefore, await heldRoot.stat({ bigint: true })))
            throw new Error("Native ACPX distribution root changed before snapshot");
        await mkdir(packageRoot, { mode: 0o700 });
        if (input.isolatedCacheEnvironmentName)
            await mkdir(cacheRoot, { mode: 0o700 });
        // Build each private parent once. Level ordering prevents child creation
        // from racing its parent; batches bound work and drain before any cleanup.
        const parentLevels = new Map();
        for (const entry of entries) {
            const parts = entry.path.split("/");
            for (let depth = 1; depth < parts.length; depth++) {
                const path = join(packageRoot, ...parts.slice(0, depth));
                const level = parentLevels.get(depth) ?? new Set();
                level.add(path);
                parentLevels.set(depth, level);
                directories.add(path);
            }
        }
        const directoryBatch = async (paths, operation) => {
            for (let start = 0; start < paths.length; start += NATIVE_DIRECTORY_CONCURRENCY) {
                const settled = await Promise.allSettled(paths.slice(start, start + NATIVE_DIRECTORY_CONCURRENCY).map(operation));
                const failed = settled.find(result => result.status === "rejected");
                if (failed?.status === "rejected")
                    throw failed.reason;
            }
        };
        for (const depth of [...parentLevels.keys()].sort((a, b) => a - b)) {
            await directoryBatch([...parentLevels.get(depth)].sort(), path => mkdir(path, { mode: 0o700 }));
        }
        let failed = false;
        let failure;
        const recordFailure = (error) => { if (!failed) {
            failed = true;
            failure = error;
        } };
        const copyEntry = async (entry) => {
            const path = join(source, ...entry.path.split("/"));
            if (await realpath(path) !== path)
                throw new Error("Native ACPX closure contains a symbolic link");
            // Bind metadata to the descriptor we will read, without a redundant
            // pathname stat. NONBLOCK prevents a raced-in FIFO from blocking open;
            // only a bounded regular single-link file may reach the read below.
            const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
            let destination;
            try {
                const before = await file.stat({ bigint: true });
                if (!before.isFile() || before.nlink !== 1n || before.size !== BigInt(entry.size) || Boolean(before.mode & 73n) !== entry.executable)
                    throw new Error("Native ACPX closure file identity is invalid");
                const bytes = Buffer.alloc(Math.min(entry.size, NATIVE_COPY_CHUNK_BYTES));
                const target = join(packageRoot, ...entry.path.split("/"));
                const streaming = entry.size > NATIVE_COPY_CHUNK_BYTES;
                const contentHash = streaming ? createHash("sha256") : undefined;
                // Partial large files remain inside the unpublished private tree. No
                // digests, command lease or handoff exist until every copy is verified.
                if (streaming)
                    destination = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, entry.executable ? 0o500 : 0o400);
                let offset = 0;
                while (offset < entry.size) {
                    const bufferOffset = streaming ? 0 : offset;
                    const read = await file.read(bytes, bufferOffset, Math.min(bytes.length - bufferOffset, entry.size - offset), offset);
                    if (read.bytesRead === 0)
                        throw new Error("Native ACPX closure file ended during snapshot");
                    if (destination) {
                        contentHash.update(bytes.subarray(0, read.bytesRead));
                        let written = 0;
                        while (written < read.bytesRead) {
                            const result = await destination.write(bytes, written, read.bytesRead - written, offset + written);
                            if (result.bytesWritten === 0)
                                throw new Error("Native ACPX snapshot write made no progress");
                            written += result.bytesWritten;
                        }
                    }
                    offset += read.bytesRead;
                }
                if (!same(before, await file.stat({ bigint: true })) || !same(before, await lstat(path, { bigint: true })) || await realpath(path) !== path)
                    throw new Error("Native ACPX closure file changed while read");
                if ((contentHash ? contentHash.digest("hex") : sha256(bytes)) !== entry.sha256)
                    throw new Error(`Native ACPX closure file digest mismatch: ${entry.path}`);
                if (destination) {
                    const copied = await destination.stat({ bigint: true });
                    if (!copied.isFile() || copied.nlink !== 1n || copied.size !== BigInt(entry.size))
                        throw new Error("Native ACPX snapshot file identity is invalid");
                }
                else
                    await writeFile(target, bytes, { mode: entry.executable ? 0o500 : 0o400, flag: "wx" });
            }
            catch (error) {
                recordFailure(error);
                throw error;
            }
            finally {
                // A failed close must not skip the other owned descriptor's retirement.
                const closed = await Promise.allSettled([file, ...(destination ? [destination] : [])].map(async (handle) => {
                    try {
                        await handle.close();
                    }
                    catch (error) {
                        recordFailure(error);
                        throw error;
                    }
                }));
                const failedClose = closed.find(result => result.status === "rejected");
                if (failedClose?.status === "rejected")
                    throw failedClose.reason;
            }
        };
        // Keep bounded capacity occupied when one file is slower than its peers.
        // Every task catches its rejection before releasing capacity; once failed,
        // no new copy is admitted and all owned descriptors drain before cleanup.
        const active = new Set();
        let activeBytes = 0;
        for (const entry of entries) {
            const bufferBytes = Math.min(entry.size, NATIVE_COPY_CHUNK_BYTES);
            while (!failed && (active.size >= NATIVE_COPY_CONCURRENCY
                || activeBytes + bufferBytes > NATIVE_COPY_BUFFER_BYTES)) {
                await Promise.race(active);
            }
            if (failed)
                break;
            activeBytes += bufferBytes;
            const copying = copyEntry(entry).catch(recordFailure)
                .finally(() => { activeBytes -= bufferBytes; active.delete(copying); });
            active.add(copying);
        }
        await Promise.all(active);
        if (failed)
            throw failure;
        // Completion order must not change the module guard or manifest.
        for (const entry of entries)
            digests[join(packageRoot, ...entry.path.split("/"))] = entry.sha256;
        if (!same(rootBefore, await heldRoot.stat({ bigint: true })) || !same(rootBefore, await lstat(source, { bigint: true })))
            throw new Error("Native ACPX distribution root changed during snapshot");
        const executable = join(packageRoot, ...input.executable.split("/"));
        const args = [...(input.entrypoint === undefined ? [] : ["--require", join(packageRoot, GUARD), join(packageRoot, ...input.entrypoint.split("/"))]), ...input.fixedArguments];
        let copilotEntryDirectory;
        if (input.copilotDistributionDirectory !== undefined) {
            copilotEntryDirectory = join(packageRoot, COPILOT_ENTRY);
            await mkdir(copilotEntryDirectory, { mode: 0o700 });
            directories.add(copilotEntryDirectory);
            const shim = Buffer.from([
                `require(${JSON.stringify(join(packageRoot, GUARD))});`,
                `import(require("node:url").pathToFileURL(${JSON.stringify(join(packageRoot, input.copilotDistributionDirectory, "index.js"))}).href).catch(error=>{console.error(error);process.exitCode=1;});`,
            ].join("\n"));
            const shimPath = join(copilotEntryDirectory, "index.js");
            await writeFile(shimPath, shim, { mode: 0o400, flag: "wx" });
            digests[shimPath] = sha256(shim);
        }
        if (input.entrypoint !== undefined || copilotEntryDirectory !== undefined) {
            const guard = Buffer.from(nativeModuleGuard(digests));
            await writeFile(join(packageRoot, GUARD), guard, { mode: 0o400, flag: "wx" });
            digests[join(packageRoot, GUARD)] = sha256(guard);
        }
        const bootstrap = Buffer.from(nativeBootstrap(executable, digests[executable], args, input.isolatedCacheEnvironmentName ? { name: input.isolatedCacheEnvironmentName, value: cacheRoot } : undefined, copilotEntryDirectory));
        await writeFile(join(packageRoot, BOOTSTRAP), bootstrap, { mode: 0o400, flag: "wx" });
        digests[join(packageRoot, BOOTSTRAP)] = sha256(bootstrap);
        // executable is null: commandLease's separately-qualified provider runtime
        // slot is unused; this distribution is spawned by the trusted bootstrap.
        const manifest = Buffer.from(JSON.stringify({ roots: [packageRoot], executable: null, digests }));
        const manifestPath = join(privateRoot, "manifest.json");
        await writeFile(manifestPath, manifest, { mode: 0o400, flag: "wx" });
        await directoryBatch([...directories], path => chmod(path, 0o500));
        commandDirectory = await open(packageRoot, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY);
        return { commandDirectory, bootstrap, snapshot: { roots: [packageRoot], executable: null, digests, handoff: { path: manifestPath, digest: sha256(manifest) }, close } };
    }
    catch (error) {
        await commandDirectory?.close();
        await close();
        throw error;
    }
    finally {
        await heldRoot.close();
    }
}
function nativeBootstrap(executable, executableDigest, args, cache, copilotEntryDirectory) {
    return [
        'const {spawn}=require("node:child_process");',
        'const fs=require("node:fs");',
        // The commandLease's guarded bootstrap owns FDs 5 (guardian), 6 (exit),
        // 7/8 (credential fences). Keep them open in the native process too.
        'const guarded=process.env.PAPERCLIP_ACPX_NATIVE_GUARDED==="1";',
        'const env={...process.env}; delete env.PAPERCLIP_ACPX_NATIVE_GUARDED; delete env.PAPERCLIP_ACPX_PRIVATE_SNAPSHOT; delete env.PAPERCLIP_VERIFIED_RUNTIME_EXECUTABLE;',
        'env.NODE_DISABLE_COMPILE_CACHE="1"; delete env.NODE_COMPILE_CACHE;',
        ...(cache ? [`env[${JSON.stringify(cache.name)}]=${JSON.stringify(cache.value)};`] : []),
        ...(copilotEntryDirectory ? [
            // Never permit the native loader to choose a different cached version,
            // app, bootstrap mode or module path supplied by a workspace/caller.
            'for(const name of ["COPILOT_CLI_VERSION","COPILOT_CLI_DIST_DIR","COPILOT_CLI_RESOLVED_DIST_DIR","COPILOT_VOICE_SERVER_MODE","COPILOT_SHUTDOWN_FLUSH","NODE_OPTIONS","NODE_PATH"])delete env[name];',
            `env.COPILOT_CLI_DIST_DIR=${JSON.stringify(copilotEntryDirectory)};`,
        ] : []),
        'if(guarded)for(const fd of [5,6,7,8])fs.fstatSync(fd);',
        `const executable=${JSON.stringify(executable)};const fd=fs.openSync(executable,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);`,
        `if(require("node:crypto").createHash("sha256").update(fs.readFileSync(fd)).digest("hex")!==${JSON.stringify(executableDigest)})throw new Error("Native ACPX executable changed before spawn");`,
        'const stdio=guarded?[0,1,2,5,6,7,8]:[0,1,2]; const childExecutable=process.platform==="linux"?"/proc/self/fd/"+stdio.length:executable;stdio.push(fd);',
        `const child=spawn(childExecutable,${JSON.stringify(args)},{env,cwd:process.cwd(),shell:false,detached:false,stdio});fs.closeSync(fd);`,
        'child.once("error",()=>process.exit(1)); child.once("exit",(code,signal)=>process.exit(signal?1:code??1));',
        'for(const signal of ["SIGTERM","SIGINT","SIGHUP"])process.on(signal,()=>child.kill(signal));',
    ].join("\n");
}
function nativeModuleGuard(digests) {
    return [
        'const {registerHooks,isBuiltin}=require("node:module");',
        'const {readFileSync,realpathSync}=require("node:fs");',
        'const {fileURLToPath}=require("node:url"); const {createHash}=require("node:crypto");',
        `const digests=${JSON.stringify(digests)};`,
        'const verify=url=>{if(!url.startsWith("file:"))throw new Error("Native ACPX module must be a qualified file or builtin");const path=fileURLToPath(url);if(realpathSync(path)!==path||!Object.hasOwn(digests,path))throw new Error("Native ACPX module escaped its closed distribution");const bytes=readFileSync(path);if(createHash("sha256").update(bytes).digest("hex")!==digests[path])throw new Error("Native ACPX module digest mismatch");return bytes;};',
        'registerHooks({resolve(specifier,context,next){const result=next(specifier,context);if(!isBuiltin(specifier)&&!result.url.startsWith("node:"))verify(result.url);return result;},load(url,context,next){if(url.startsWith("node:"))return next(url,context);const bytes=verify(url);if(["module","commonjs","json"].includes(context.format))return {format:context.format,source:bytes,shortCircuit:true};return next(url,context);}});',
    ].join("\n");
}
function same(a, b) {
    return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}
