import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createAcpRuntime, createAgentRegistry, createRuntimeStore, type AcpRuntimeEvent } from "acpx/runtime";

// The process is a deterministic ACP transport peer, never a provider/model.
// Exercise the installed ACPX normalization path rather than duplicating it.
const peer = String.raw`
const send=m=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...m})+'\n');
let turn=0;
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method==='initialize')send({id:m.id,result:{protocolVersion:1,agentCapabilities:{loadSession:true},authMethods:[]}});
 else if(m.method==='session/new')send({id:m.id,result:{sessionId:'copilot-message-session'}});
 else if(m.method==='session/prompt'){
  turn++;
  for(const [id,text] of [[turn+':first',''],[turn+':first','SAME'],[turn+':second',''],[turn+':second','SA'],[turn+':second','ME'],[turn+':empty-final','']]){
   send({method:'session/update',params:{sessionId:'copilot-message-session',update:{sessionUpdate:'agent_message_chunk',messageId:id,content:{type:'text',text}}}});
  }
  send({id:m.id,result:{stopReason:'end_turn'}});
 }
});`;

it("actual ACPX preserves empty native starts and distinct equal-text IDs across warm turns", async () => {
  const directory = await mkdtemp(join(tmpdir(), "copilot-message-acpx-"));
  const children: ReturnType<typeof spawn>[] = [];
  const runtime = createAcpRuntime({ cwd: directory, permissionMode: "deny-all",
    agentRegistry: createAgentRegistry({ overrides: { copilot: "fixture" } }), sessionStore: createRuntimeStore({ stateDir: join(directory, "state") }),
    spawnAgent: () => { const child = spawn(process.execPath, ["-e", peer], { cwd: directory, env: {}, stdio: ["pipe", "pipe", "pipe"] }); children.push(child); return child; },
  });
  let handle;
  try {
    handle = await runtime.ensureSession({ sessionKey: "copilot-message-identity", agent: "copilot", mode: "persistent", cwd: directory });
    for (let n = 1; n <= 3; n++) {
      const turn = runtime.startTurn({ handle, text: "fixture", mode: "prompt", requestId: `fixture-${n}`, timeoutMs: 2000 });
      const events: AcpRuntimeEvent[] = [];
      const drain = (async () => { for await (const event of turn.events) events.push(event); })();
      expect(await turn.result).toMatchObject({ status: "completed" }); await drain;
      expect(events.filter(e => e.type === "text_delta").map(e => [e.messageId, e.text])).toEqual([
        [`${n}:first`, ""], [`${n}:first`, "SAME"], [`${n}:second`, ""], [`${n}:second`, "SA"], [`${n}:second`, "ME"], [`${n}:empty-final`, ""],
      ]);
    }
    expect(children).toHaveLength(1);
  } finally {
    if (handle) await runtime.close({ handle, reason: "message identity fixture complete" });
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await rm(directory, { recursive: true, force: true });
  }
});
