"use strict";
/* Claude through Claude Code on this computer: one stream-json user message with images, no tools, schema answer,
   the subscription login (no API key in the child's environment). */
const assert=require("node:assert/strict"),{EventEmitter}=require("node:events"),{PassThrough}=require("node:stream");
const {createClaudeCode,childEnv}=require("../src/ai-claude-code");
(async()=>{
 const calls=[];let reply=null;
 const spawnProcess=(command,args,options)=>{
  const p=new EventEmitter();p.stdin=new PassThrough();p.stdout=new PassThrough();p.stderr=new PassThrough();p.kill=()=>{};
  let input="";p.stdin.on("data",d=>input+=d);
  p.stdin.on("finish",()=>{calls.push({command,args,env:options.env,input});setImmediate(()=>{p.stdout.end(reply.map(l=>JSON.stringify(l)).join("\n")+"\n");p.emit("close",0)})});
  return p
 };
 const cc=createClaudeCode({locateBinary:()=>({command:"claude",prefix:[],env:{}}),spawnProcess});
 process.env.ANTHROPIC_API_KEY="sk-ant-test";
 reply=[{type:"system",subtype:"init"},{type:"result",subtype:"success",result:"",structured_output:{mark:"К12"},usage:{input_tokens:10,output_tokens:5},modelUsage:{"claude-opus-5-5":{}}}];
 const schema={type:"object",properties:{mark:{type:"string"}}};
 const r=await cc.request({system:"S",schema,model:"claude-opus-5-5",content:[{type:"text",text:"Что?"},{type:"image",source:{type:"base64",media_type:"image/png",data:"AAAA"}}]});
 assert.deepEqual(r.data,{mark:"К12"});assert.equal(r.usage.input_tokens,10);
 const {args,env,input}=calls[0];
 for(const flag of ["-p","--input-format","stream-json","--output-format","--verbose","--no-session-persistence","--json-schema","--system-prompt"])assert(args.includes(flag),flag);
 assert.equal(args[args.indexOf("--tools")+1],"","no tools: the answer only");
 assert.equal(args[args.indexOf("--model")+1],"opus");
 assert.deepEqual(JSON.parse(args[args.indexOf("--json-schema")+1]),schema);
 assert.equal(env.ANTHROPIC_API_KEY,undefined,"the subscription login is used, not an API key");
 const msg=JSON.parse(input.trim());
 assert.equal(msg.type,"user");assert.equal(msg.message.content[1].type,"image");
 // Errors from the run reach the engineer in plain words.
 reply=[{type:"result",subtype:"error_during_execution",is_error:true,result:"Claude usage limit reached"}];
 await assert.rejects(cc.request({system:"S",schema,content:[]}),/Лимит подписки/);
 reply=[];
 await assert.rejects(cc.request({system:"S",schema,content:[]}),/без ответа/);
 assert.equal(childEnv({}).ANTHROPIC_API_KEY,undefined);
 const none=createClaudeCode({locateBinary:()=>null});
 assert.equal((await none.check()).available,false);
 console.log("Claude Code: subscription requests with images and schema, no tools, clear errors PASS")
})().catch(e=>{console.error(e);process.exit(1)});
