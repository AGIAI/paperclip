import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// This is an owned ACP-only patch of the immutable vendor archive. The legacy
// Cursor adapter and the vendor's interactive CLI are not changed.
export const CURSOR_RUNTIME_PATCH_VERSION = "paperclip-cursor-isolation-v1";
export const CURSOR_RUNTIME_PATCH_PINS = Object.freeze({
  "darwin-arm64": { file: "5672.index.js", before: "7784c8b16d4e639814c13b12be2a687f5dc2cd98cbf29ed0a10820778ab1bf62", after: "db997911906014ec9c522b48b6748bb39001e44d9a10730a433ab1e135aa0432" },
  "darwin-x64": { file: "9841.index.js", before: "3c0aaf6ecc4fceb0f95e1731deec75384984570d14d0871cecec11972b948ac4", after: "713aecb34c994d83ce46942f6b15bff173eb7b605f15a4653b24b9cc46dd3b5a" },
  "linux-x64": { file: "1699.index.js", before: "2de420f1b31e70ca74b083a1ce5b519c2abffa5789d71cc06e84d2c38acb7c07", after: "27e6e048b30afbf722c36cc3ef8ac4350957963291d15c34fdaea355d110ea2a" },
});
const digest = value => createHash("sha256").update(value).digest("hex");

export function replaceCursorPatchAnchor(source, before, after) {
  if (source.split(before).length !== 2) throw new Error("Cursor runtime patch requires exactly one source anchor");
  return source.replace(before, () => after);
}

/** Never exported as a general-purpose runtime hook; bytes are checked first. */
export function patchCursorRuntimeSource(source, platform) {
  const pin = CURSOR_RUNTIME_PATCH_PINS[platform];
  if (!pin || digest(source) !== pin.before) throw new Error("Cursor runtime patch input digest mismatch");
  const replace = (before, after) => { source = replaceCursorPatchAnchor(source, before, after); };
  // Do not even initialize the ambient loader: load() can start subprocesses.
  replace(`te=r.aK.init(X,W.projectRoot,W.projectDir,!1,ee,new ${platform === "darwin-x64" ? "m" : "f"}.v)`, "te=null");
  replace("se=yield te.load(e),ie=new u.uz(se)", "se=new u.i9({}),ie=new u.uz(se)");
  // Session-scoped owned MCP stays functional, including an explicitly empty
  // list. It never borrows clients from an earlier session or ambient lease.
  const sessionMcp = platform === "darwin-arm64" ? "A" : "x";
  replace("if(0===i.length)return t.mcpLease;", `if(0===i.length)return new ${sessionMcp}.uz(new ${sessionMcp}.i9({}));`);
  replace("if(0===r.length)return t.mcpLease;", `if(0===r.length)return new ${sessionMcp}.uz(new ${sessionMcp}.i9({}));`);
  replace("u=Object.assign({},yield t.mcpLease.getClients(e))", "u=Object.create(null)");
  // Stop hook discovery at the source, including the asynchronous remote team
  // refresh. A filesystem watcher would leave an execution race here.
  replace("null!=re&&n.dashboardClient&&(ae=(0,y.a)({dashboardClient:n.dashboardClient,teamId:re}));", "void re;");
  replace("let ue=yield ce.load();", "let ue={errors:[],configDirs:{}};");
  // Use the exact SDK module already present in this verified vendor chunk.
  const sdk = [...source.matchAll(/n\("([^"\n]+@agentclientprotocol\/sdk\/dist\/acp\.js)"\)/g)].map(match => match[1]);
  if (new Set(sdk).size !== 1) throw new Error("Cursor runtime patch SDK identity is ambiguous");
  const errorType = `n(${JSON.stringify(sdk[0])}).GI`;
  const oldAction = 'if(e instanceof r.ao){const t=null!==(u={login:"Please sign in to continue",upgrade:"Upgrade your plan to continue",payment:"Add a payment method to continue",config:"Check your settings to continue"}[e.action])&&void 0!==u?u:e.message;return void(yield this.sendAgentMessageChunk(`\\n\\n${t}`))}';
  const newAction = `if(e instanceof r.ao){const action=["login","upgrade","payment","config"].includes(e.action)?e.action:"unknown";throw new (${errorType})(action==="login"?-32000:-32603,"Cursor provider action required: "+action,{schema:"paperclip.cursor.provider-error.v1",kind:"action_required",action})}`;
  replace(oldAction, newAction);
  replace('if(e instanceof g.T&&e.code===m.C.Unauthenticated)return void(yield this.sendAgentMessageChunk("\\n\\nError: [unauthenticated] Backend rejected authentication. Verify this is a User API Key for the same endpoint/environment, then rerun with --debug for request-level auth logs."));'.replace('m.C.Unauthenticated', `${platform === "darwin-x64" ? "f" : "m"}.C.Unauthenticated`),
    `if(e instanceof g.T&&e.code===${platform === "darwin-x64" ? "f" : "m"}.C.Unauthenticated)throw new (${errorType})(-32000,"Cursor provider authentication rejected",{schema:"paperclip.cursor.provider-error.v1",kind:"authentication_required"});`);
  return source;
}

export async function applyCursorRuntimePatch(directory, platform) {
  const pin = CURSOR_RUNTIME_PATCH_PINS[platform];
  if (!pin) throw new Error("Cursor runtime patch platform is unsupported");
  const path = join(directory, pin.file);
  const patched = patchCursorRuntimeSource(await readFile(path, "utf8"), platform);
  if (digest(patched) !== pin.after) throw new Error("Cursor runtime patch output digest mismatch");
  await writeFile(path, patched);
  return { patchVersion: CURSOR_RUNTIME_PATCH_VERSION, file: pin.file, sha256: pin.after };
}
