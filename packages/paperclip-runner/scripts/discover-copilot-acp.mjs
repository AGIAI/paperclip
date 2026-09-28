// Metadata only: initialize, create a disposable session, select an advertised model, then close.
// Usage: node discover-copilot-acp.mjs <verified-provider-pack> <safe-output.json> [exact-model-id]
// Supply only an explicitly bound COPILOT_GITHUB_TOKEN. This script never sends a prompt.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const pack=await realpath(process.argv[2]);
const output=process.argv[3];
const model=process.argv[4];
const token=process.env.COPILOT_GITHUB_TOKEN;
assert.equal(typeof token,'string');assert.ok(token.trim());
const manifest=JSON.parse(await readFile(join(pack,'provider-pack.json'),'utf8'));
process.env.PAPERCLIP_ACPX_PROVIDER_PACKAGE_ROOT=pack;
process.env.PAPERCLIP_ACPX_PROVIDER_PACKAGE_MANIFEST=join(pack,'package.json');
const {verifyAcpxProfileInstallation,assertAcpxProfileEnvironment}=await import(pathToFileURL(join(pack,'dist/drivers/acpx/profile-installation.js')));
const {resolveQualifiedAcpxProfile}=await import(pathToFileURL(join(pack,'dist/drivers/acpx/qualified-profiles.js')));
const {COPILOT_ACP_CLIENT_CAPABILITIES}=await import(pathToFileURL(join(pack,'dist/drivers/acpx/copilot-events.js')));
assertAcpxProfileEnvironment('copilot',{COPILOT_GITHUB_TOKEN:token});
// The verified profile resolves the fixed binary only. session/new discovers the
// native catalog; no prompt or model inference is permitted in this script.
const install=await verifyAcpxProfileInstallation(resolveQualifiedAcpxProfile('copilot',model??'discovery-unselected'));
const lease=await install.openCommand();
const root=await mkdtemp('/tmp/paperclip-copilot-auth-discovery-');
const env={PATH:'/usr/bin:/bin',COPILOT_GITHUB_TOKEN:token,COPILOT_AUTO_UPDATE:'false',COPILOT_ALLOW_ALL:'false',NO_COLOR:'1'};
for(const key of ['HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME','COPILOT_HOME','COPILOT_CACHE_HOME']){env[key]=join(root,key.toLowerCase());await mkdir(env[key],{mode:0o700});}
await writeFile(join(env.COPILOT_HOME,'config.json'),JSON.stringify({autoUpdate:false,trustedFolders:[],disableAllHooks:true,memory:false,ide:{autoConnect:false}}),{mode:0o600});
let child,exitPromise;const pending=new Map();let nextId=0,buffer='',bytes=0;const observedMethods={};
function request(method,params){assert.ok(['initialize','session/new','session/set_model','session/set_config_option','session/close'].includes(method));const id=nextId++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('request_deadline:'+method));},25000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
try{
 child=lease.spawn([],{cwd:root,env,stdio:'pipe'});exitPromise=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>2097152){child.kill('SIGTERM');return;}buffer+=chunk.toString();while(buffer.includes('\n')){const end=buffer.indexOf('\n');const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;let msg;try{msg=JSON.parse(line);}catch{child.kill('SIGTERM');return;}if(msg.method){observedMethods[msg.method]=(observedMethods[msg.method]??0)+1;if(msg.id!==undefined)child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Discovery does not support inbound methods'}})+'\n');continue;}const item=pending.get(msg.id);if(item){clearTimeout(item.timer);pending.delete(msg.id);msg.error?item.reject(new Error('provider_rpc_error:'+String(msg.error.code))):item.resolve(msg.result);}}});
 child.stderr.on('data',()=>{});child.once('error',()=>{for(const item of pending.values())item.reject(new Error('provider_spawn_failure'));});
 const initialized=await request('initialize',{protocolVersion:1,clientInfo:{name:'paperclip-authenticated-model-discovery',version:'1'},clientCapabilities:COPILOT_ACP_CLIENT_CAPABILITIES});
 const opened=await request('session/new',{cwd:root,mcpServers:[]});
 const safe={schema:'paperclip.copilot-authenticated-discovery/v1',observedAt:new Date().toISOString(),harnessVersion:initialized.agentInfo?.version,sourceRevision:manifest.payload.runnerSourceRevision,providerPackDigest:manifest.digest,profileDigest:install.commandDigest,agentCapabilities:initialized.agentCapabilities,models:opened.models??null,configOptions:opened.configOptions??[],promptSent:false,promptRequestsSent:0,inferenceVerified:false,qualification:'pending; metadata discovery only',observedMethods};
 if(model){const advertised=opened.models?.availableModels??[];assert.ok(advertised.some(value=>value.modelId===model),'requested model must be advertised');const selected=await request('session/set_model',{sessionId:opened.sessionId,modelId:model});const configured=await request('session/set_config_option',{sessionId:opened.sessionId,configId:'model',value:model});assert.equal(configured.configOptions?.find(option=>option.id==='model')?.currentValue,model);safe.modelSelection={requestedModel:model,succeeded:true,response:selected,configEcho:configured};}
 try{await request('session/close',{sessionId:opened.sessionId});safe.sessionClosed=true;}catch{safe.sessionClosed=false;}
 const text=JSON.stringify(safe,null,2)+'\n';assert.ok(!text.includes(token));assert.ok(!text.includes(opened.sessionId));assert.ok(!text.includes(root));await writeFile(output,text,{mode:0o600});console.log(JSON.stringify({output,sha256:createHash('sha256').update(text).digest('hex'),harnessVersion:safe.harnessVersion,modelCount:safe.models?.availableModels?.length??0,configOptionIds:safe.configOptions.map(value=>value.id),modelIds:safe.models?.availableModels?.map(value=>value.modelId)??[],promptSent:false}));
}finally{for(const item of pending.values())clearTimeout(item.timer);pending.clear();if(child&&child.exitCode===null&&child.signalCode===null){child.stdin.end();const timer=setTimeout(()=>child.kill('SIGTERM'),1000);const kill=setTimeout(()=>child.kill('SIGKILL'),5000);await exitPromise;clearTimeout(timer);clearTimeout(kill);}await lease.close();await rm(root,{recursive:true,force:true});}
