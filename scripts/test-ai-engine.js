"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),crypto=require("node:crypto"),{EventEmitter}=require("node:events");
const {createEngine,names}=require("../src/ai-local-engine");
const {createAnalysis}=require("../src/ai-analysis");
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-engine-"));
 const dir=path.join(temp,"ir-project-ai","runtime");fs.mkdirSync(dir,{recursive:true});
 let calls=[],child=null;
 const client=async (url,args)=>{
  calls.push({url,args});
  if(url.endsWith("/health"))return{ok:true,status:200};
  if(url.endsWith("/v1/chat/completions"))return{ok:true,status:200,json:async()=>({
   choices:[{message:{content:JSON.stringify({text:"Виден лист КМД",marks:["К41"],notes:["Требует сверки"],unknowns:["Масса"]})},finish_reason:"stop"}]
  })};
  throw Error("External URL must never be called")
 };
 const engine=createEngine({
  getUserDataPath:()=>temp,httpFetch:client,memory:()=>16*1024**3,
  spawn:(command,args,options)=>{
   assert(command.startsWith(dir));assert(args.includes("--mmproj"));
   assert.deepEqual(args.slice(args.indexOf("--host"),args.indexOf("--host")+2),["--host","127.0.0.1"]);
   assert.equal(options.shell,false);
   child=new EventEmitter();child.kill=()=>{child.killed=true};return child
  },
  wait:async()=>{}
 });
 try{
  assert.equal(engine.status().state,"missing");
  assert.equal((await engine.start()).installed,false);
  const sha256={},content={binary:Buffer.from("fake-executable-for-test"),model:Buffer.from("model.gguf-test-bytes"),vision:Buffer.from("vision-encoder-bytes")};
  for(const [key,name] of Object.entries(names)){
   fs.writeFileSync(path.join(dir,name),content[key]);sha256[key]=crypto.createHash("sha256").update(content[key]).digest("hex")
  }
  fs.writeFileSync(path.join(dir,"manifest.json"),JSON.stringify({format:1,engine:"llama.cpp",modelId:"Qwen3-VL-8B-Instruct",sha256,gpuLayers:0}));
  assert.equal((await engine.verify()).installed,true);
  assert.equal((await engine.start()).state,"ready");
  assert.equal(calls.length,1);
  const img=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(32,17)]);
  const result=await engine.analyzeImage({buffer:img,mime:"image/png",prompt:"Find K41"});
  assert(result.raw.includes("К41"));
  const body=JSON.parse(calls[1].args.body);
  assert.equal(body.messages[1].content[1].image_url.url.startsWith("data:image/png;base64,"),true);
  assert.equal(body.model,"local-qwen3-vl");
  assert.match(calls[1].args.headers.Authorization,/^Bearer [a-f0-9]{64}$/);
  const db={getObject:id=>id===1?{id:1}:null,rows:[],listEntity(id,key){return this.rows.filter(r=>r.object_id===id&&r.section_key===key)},
   createEntity(id,key,data){const row={id:this.rows.length+1,object_id:id,section_key:key,record_type:data.record_type,title:data.title,data:data.data};this.rows.push(row);return row}};
  const documents={readForAnalysis:async()=>({buffer:img,mime:"image/png",source:{documentId:21,name:"K41.png",sha256:"sha-test"}})};
  const analysis=createAnalysis({database:db,documents,engine});
  const saved=await analysis.analyze(1,21);
  assert.equal(saved.status,"Требует проверки инженера");assert.deepEqual(saved.marks,["К41"]);
  assert.equal(analysis.list(1).length,1);assert.equal(analysis.list(1)[0].sourceName,"K41.png");
  assert.equal(analysis.list(1)[0].region.includes("координаты"),true);
  assert.deepEqual(analysis.parseClaims("unparseable output"),null);
  engine.stop();assert.equal(child.killed,true);
  assert.equal(engine.status().state,"stopped");
  // Deferred cancellation regression: a late successful /health response must
  // never resurrect a process explicitly stopped while it was starting.
  let completeHealth=null,delayedChild=null;
  const startupEngine=createEngine({
   getUserDataPath:()=>temp,memory:()=>16*1024**3,wait:async()=>{},
   spawn:()=>{
    delayedChild=new EventEmitter();
    delayedChild.kill=()=>{delayedChild.killed=true};
    return delayedChild
   },
   httpFetch:async url=>{
    if(!url.endsWith("/health"))throw Error("Unexpected external request");
    return new Promise(resolve=>{completeHealth=resolve})
   }
  });
  const pendingStart=startupEngine.start();
  for(let i=0;i<200&&!completeHealth;i++)
   await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof completeHealth,"function","test startup reached /health");
  assert.equal(startupEngine.stop().state,"stopped");
  completeHealth({ok:true,status:200});
  assert.equal((await pendingStart).state,"stopped");
  assert.equal(startupEngine.status().state,"stopped");
  assert.equal(delayedChild.killed,true);
  // A canceled analyze request must not be stored merely because a stubbed
  // HTTP client delivers a successful response after ignoring the abort.
  let completeAnalysis=null,analysisChild=null;
  const cancellationEngine=createEngine({
   getUserDataPath:()=>temp,memory:()=>16*1024**3,wait:async()=>{},
   spawn:()=>{
    analysisChild=new EventEmitter();
    analysisChild.kill=()=>{analysisChild.killed=true};
    return analysisChild
   },
   httpFetch:async url=>{
    if(url.endsWith("/health"))return{ok:true,status:200};
    if(url.endsWith("/v1/chat/completions"))
     return new Promise(resolve=>{completeAnalysis=resolve});
    throw Error("Unexpected external request")
   }
  });
  assert.equal((await cancellationEngine.start()).state,"ready");
  const pendingAnalysis=cancellationEngine.analyzeImage({
   buffer:img,mime:"image/png",prompt:"Check mark K41"
  });
  assert.equal(typeof completeAnalysis,"function");
  cancellationEngine.stop();
  completeAnalysis({ok:true,json:async()=>({choices:[{
   message:{content:'{"text":"false completed result"}'},finish_reason:"stop"
  }]})});
  await assert.rejects(pendingAnalysis,/Анализ отменён/);
  assert.equal(cancellationEngine.status().state,"stopped");
  assert.equal(analysisChild.killed,true);
  fs.writeFileSync(path.join(dir,names.model),"corrupted model");
  assert.equal((await engine.verify()).installed,false);
  console.log("Local AI: checksums, isolated subprocess, loopback, auth token, real API payload and unverified provenance PASS");
 }finally{engine.stop();fs.rmSync(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
