"use strict";
/* Claude engine: encrypted key storage, exact API request shape, refusals and error messages. No network. */
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const Anthropic=require("@anthropic-ai/sdk");
const {createEngine}=require("../src/ai-claude-engine");
const Errors=Anthropic.default||Anthropic;
const KEY="sk-ant-api03-"+"a".repeat(40);
const safeStorage={isEncryptionAvailable:()=>true,
 encryptString:s=>Buffer.from("enc:"+Buffer.from(s).toString("hex")),
 decryptString:b=>{const t=b.toString();assert(t.startsWith("enc:"));return Buffer.from(t.slice(4),"hex").toString()}};
const SCHEMA={type:"object",additionalProperties:false,required:["summary"],properties:{summary:{type:"string"}}};
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-claude-"));
 const calls=[];let reply=null,failure=null;
 const createClient=(apiKey,options)=>({errors:Errors,client:{
  models:{retrieve:async model=>{calls.push({kind:"retrieve",apiKey,model,options});if(failure)throw failure;return{id:model}}},
  beta:{messages:{stream:(body,requestOptions)=>{calls.push({kind:"stream",apiKey,body,options,requestOptions});
   return{finalMessage:async()=>{if(failure)throw failure;return reply}}}}}}});
 const engine=createEngine({getUserDataPath:()=>root,safeStorage,createClient});
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(64)]);
 const ask=extra=>engine.requestJSON({system:"S",images:[{buffer:png,mime:"image/png",label:"Лист 1"},{buffer:png,mime:"image/png",label:"Лист 2"}],text:"Данные",schema:SCHEMA,...extra});
 try{
  assert.equal(engine.status().state,"missing");
  assert.equal(engine.status().installed,false);
  await assert.rejects(ask(),/API-ключ/);
  assert.throws(()=>engine.setKey("not-a-key"),/sk-ant-/);
  assert.throws(()=>createEngine({getUserDataPath:()=>root,safeStorage:{isEncryptionAvailable:()=>false},createClient}).setKey(KEY),/Шифрование/);
  const info=engine.setKey(KEY,"claude-sonnet-5-5");
  assert.equal(info.hasKey,true);assert.equal(info.model,"claude-sonnet-5-5");
  const stored=fs.readFileSync(path.join(root,"ir-project-ai","claude.json"),"utf8");
  assert(!stored.includes(KEY),"the key is never written in plain text");
  assert(!JSON.stringify(engine.settings()).includes(KEY),"settings never return the key");
  assert.equal(engine.status().installed,true);
  assert.equal((await engine.start()).reason,"");
  const check=calls.pop();
  assert.deepEqual([check.kind,check.apiKey,check.model,check.options.maxRetries],["retrieve",KEY,"claude-sonnet-5-5",0]);
  assert(check.options.timeout<=20000,"the connection check is short");
  engine.setModel("claude-opus-5-5");
  reply={model:"claude-opus-5-5",stop_reason:"end_turn",usage:{input_tokens:1200,output_tokens:80},
   content:[{type:"text",text:JSON.stringify({summary:"Колонны на отметке 0,000"})}]};
  const result=await ask();
  assert.deepEqual(result.data,{summary:"Колонны на отметке 0,000"});
  assert.equal(result.model,"claude-opus-5-5");
  const {body,requestOptions}=calls.pop();
  assert.equal(body.model,"claude-opus-5-5");assert.equal(body.system,"S");
  assert.deepEqual(body.betas,["server-side-fallback-2026-07-01"]);assert.equal(body.fallbacks,"default");
  assert.deepEqual(body.output_config,{effort:"medium",format:{type:"json_schema",schema:SCHEMA}});
  let content=body.messages[0].content;
  assert.deepEqual(content.map(c=>c.type),["text","image","text","image","text"],"each sheet image is labelled");
  assert.equal(content[1].source.data,png.toString("base64"));
  assert.equal(content[4].text,"Данные");
  assert(content.every(c=>!c.cache_control),"nothing is cached without a shared part");
  // The shared part of a series comes first and carries the cache breakpoint.
  await ask({shared:"Комплект и марки"});
  content=calls.pop().body.messages[0].content;
  assert.deepEqual([content[0].text,content[0].cache_control],["Комплект и марки",{type:"ephemeral"}]);
  assert.equal(content.filter(c=>c.cache_control).length,1);
  assert(requestOptions.signal instanceof AbortSignal);
  reply={model:"claude-opus-5-5",stop_reason:"refusal",stop_details:{explanation:"policy"},content:[]};
  await assert.rejects(ask(),/отказался/);
  reply={model:"claude-opus-5-5",stop_reason:"max_tokens",content:[{type:"text",text:"{\"summ"}]};
  await assert.rejects(ask(),/лимит/);
  reply={model:"claude-opus-5-5",stop_reason:"end_turn",content:[{type:"text",text:"{oops"}]};
  await assert.rejects(ask(),/неполный ответ/);
  failure=new Errors.AuthenticationError(401,{},"invalid x-api-key",new Headers());
  await assert.rejects(ask(),/ключ отклонён/);
  assert.equal(engine.status().state,"failed");
  failure=null;
  await assert.rejects(engine.requestJSON({images:[{buffer:png,mime:"image/gif"}],text:"x",schema:SCHEMA}),/PNG и JPG/);
  // A hanging network must end the check quickly with a clear message (real SDK, fake fetch).
  let seen=null;
  const hanging=createEngine({getUserDataPath:()=>root,safeStorage,checkTimeout:300,
   fetch:(url,init)=>{seen=url;return new Promise((_,reject)=>init.signal?.addEventListener("abort",()=>reject(Object.assign(new Error("aborted"),{name:"AbortError"}))))}});
  const started=Date.now(),checked=await hanging.start();
  assert(Date.now()-started<5000,"the connection check does not hang");
  assert(String(seen).startsWith("https://api.anthropic.com/v1/models/"),"requests go through the injected Electron fetch");
  assert.match(checked.reason,/не ответил вовремя/);
  engine.clearKey();assert.equal(engine.status().state,"missing");
  console.log("Claude engine: encrypted key, labelled multi-image JSON request, fallbacks, refusals and errors PASS");
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
