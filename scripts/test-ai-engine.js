"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),crypto=require("node:crypto"),{EventEmitter}=require("node:events");
const {createEngine,names,VISION_CONTEXT_TOKENS,COMPACT_VISION_CONTEXT_TOKENS,selectVisionContext,CPU_VISION_TIMEOUT_MS,GPU_VISION_TIMEOUT_MS}=require("../src/ai-local-engine");
const {createAnalysis}=require("../src/ai-analysis");
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-engine-"));
 const dir=path.join(temp,"ir-project-ai","runtime");fs.mkdirSync(dir,{recursive:true});
 let calls=[],child=null,returnHttp400=false;
 const client=async (url,args)=>{
  calls.push({url,args});
  if(url.endsWith("/health"))return{ok:true,status:200};
  if(url.endsWith("/v1/chat/completions"))return returnHttp400?
   {ok:false,status:400,text:async()=>JSON.stringify({error:{message:"context size exhausted"}})}:
   {ok:true,status:200,json:async()=>({
   choices:[{message:{content:JSON.stringify({text:"Виден лист КМД",marks:["К41"],notes:["Требует сверки"],unknowns:["Масса"]})},finish_reason:"stop"}]
  })};
  throw Error("External URL must never be called")
 };
 const engine=createEngine({
  getUserDataPath:()=>temp,httpFetch:client,memory:()=>16*1024**3,
  spawn:(command,args,options)=>{
   assert(command.startsWith(dir));assert(args.includes("--mmproj"));
   assert.deepEqual(args.slice(args.indexOf("--host"),args.indexOf("--host")+2),["--host","127.0.0.1"]);
   assert.equal(VISION_CONTEXT_TOKENS,8192,"KM/KMD sheet with 4472 visual tokens needs more than 4096 context");
   assert.equal(CPU_VISION_TIMEOUT_MS,600000);
   assert.equal(GPU_VISION_TIMEOUT_MS,360000);
   assert.deepEqual(args.slice(args.indexOf("--ctx-size"),args.indexOf("--ctx-size")+2),["--ctx-size","8192"]);
   assert.deepEqual(args.slice(args.indexOf("--parallel"),args.indexOf("--parallel")+2),["--parallel","1"],
    "one inference slot keeps memory bounded on 16 GB laptops");
   assert.equal(options.shell,false);
   child=new EventEmitter();child.kill=()=>{child.killed=true};return child
  },
  wait:async()=>{}
 });
 try{
  assert.equal(COMPACT_VISION_CONTEXT_TOKENS,6144);
  assert.equal(selectVisionContext({manual:true},16*1024**3),6144,
   "manual Qwen4B on 16 GiB uses safer context than 8192 tokens");
  assert.equal(selectVisionContext({manual:true},24*1024**3),8192);
  assert.equal(selectVisionContext({manual:false},16*1024**3),8192);
  assert.equal(engine.status().state,"missing");
  assert.equal((await engine.start()).installed,false);
  const sha256={},content={binary:Buffer.from("fake-executable-for-test"),model:Buffer.from("model.gguf-test-bytes"),vision:Buffer.from("vision-encoder-bytes")};
  for(const [key,name] of Object.entries(names)){
   fs.writeFileSync(path.join(dir,name),content[key]);sha256[key]=crypto.createHash("sha256").update(content[key]).digest("hex")
  }
  fs.writeFileSync(path.join(dir,"manifest.json"),JSON.stringify({format:1,engine:"llama.cpp",modelId:"Qwen3-VL-8B-Instruct",sha256,gpuLayers:0}));
  assert.equal((await engine.verify()).installed,true);
  assert.equal((await engine.start()).state,"ready");
  assert.equal(engine.status().contextTokens,8192);
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
  returnHttp400=true;
  await assert.rejects(engine.analyzeImage({buffer:img,mime:"image/png",prompt:"K60"}),
   /Контекст Qwen переполнен.*8192.*context size exhausted/,"oversized requests must explain the context limit");
  returnHttp400=false;
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
  await assert.rejects(pendingAnalysis,/Распознавание прервано: локальная модель была остановлена/);
  assert.equal(cancellationEngine.status().state,"stopped");
  assert.equal(analysisChild.killed,true);
  // llama.cpp can need more than three minutes to handle a large A1 KMD on CPU.
  // A real AbortError must become a useful timeout reason and must clear busy.
  function abortAwareEngine(timeoutMs){
   const runtime=createEngine({
    getUserDataPath:()=>temp,memory:()=>16*1024**3,wait:async()=>{},
    requestTimeoutMs:timeoutMs,
    spawn:()=>{const proc=new EventEmitter();proc.kill=()=>{};return proc},
    httpFetch:async(url,options)=>{
     if(url.endsWith("/health"))return{ok:true,status:200};
     if(!url.endsWith("/v1/chat/completions"))throw Error("Unexpected URL");
     return new Promise((_resolve,reject)=>{
      const abort=()=>reject(Object.assign(new Error("This operation was aborted"),
       {name:"AbortError"}));
      options.signal.addEventListener("abort",abort,{once:true});
      if(options.signal.aborted)abort()
     })
    }
   });
   return runtime
  }
  const timeoutEngine=abortAwareEngine(35);
  assert.equal((await timeoutEngine.start()).state,"ready");
  await assert.rejects(timeoutEngine.analyzeImage({buffer:img,mime:"image/png",
   prompt:"PDF K60"}),/Превышено время ожидания ответа Qwen/);
  assert.equal(timeoutEngine.status().state,"ready");
  assert.equal(timeoutEngine.status().active,false,"timeout must free active slot");
  assert.match(timeoutEngine.status().reason,/Превышено время ожидания/);
  timeoutEngine.stop();
  const userCancelEngine=abortAwareEngine(5000);
  assert.equal((await userCancelEngine.start()).state,"ready");
  const canceled=userCancelEngine.analyzeImage({buffer:img,mime:"image/png",prompt:"PDF K60"});
  userCancelEngine.cancel();
  await assert.rejects(canceled,/отменено пользователем/);
  assert.equal(userCancelEngine.status().active,false);
  userCancelEngine.stop();
  // Process exits during a real Qwen image request: capture only bounded
  // allocation-related stderr and never collapse this into generic fetch failed.
  let crashChild;
  const crashEngine=createEngine({
   getUserDataPath:()=>temp,memory:()=>16*1024**3,
   freeMemory:()=>Math.round(1.4*1024**3),wait:async()=>{},
   spawn:()=>{
    crashChild=new EventEmitter();
    crashChild.stderr=new EventEmitter();
    crashChild.kill=()=>{crashChild.killed=true};
    return crashChild
   },
   httpFetch:async(url,args)=>{
    if(url.endsWith("/health"))return{ok:true,status:200};
    return new Promise((_resolve,reject)=>{
     args.signal.addEventListener("abort",()=>reject(Object.assign(
      new Error("This operation was aborted"),{name:"AbortError"})),{once:true})
    })
   }
  });
  assert.equal((await crashEngine.start()).state,"ready");
  const crashed=crashEngine.analyzeImage({buffer:img,mime:"image/png",prompt:"K60"});
  crashChild.stderr.emit("data",Buffer.from("ggml_backend_buffer_alloc: failed to allocate 1 GiB (out of memory)\n"));
  crashChild.emit("exit",3221225477,null);
  await assert.rejects(crashed,/llama-server завершился.*ошибка выделения памяти/);
  assert.equal(crashEngine.status().state,"failed");
  assert.equal(crashEngine.status().lastServerExit.code,3221225477);
  assert.equal(crashEngine.status().active,false);
  crashEngine.stop();
  // A dropped localhost socket with a living process must be explained, with
  // the actual local cause code and available RAM; source drawings are untouched.
  const socketEngine=createEngine({
   getUserDataPath:()=>temp,memory:()=>16*1024**3,
   freeMemory:()=>Math.round(1.3*1024**3),wait:async()=>{},
   spawn:()=>{const proc=new EventEmitter();proc.kill=()=>{};return proc},
   httpFetch:async url=>{
    if(url.endsWith("/health"))return{ok:true,status:200};
    const failure=new TypeError("fetch failed");
    failure.cause=Object.assign(new Error("socket hang up"),{code:"ECONNRESET"});
    throw failure
   }
  });
  assert.equal((await socketEngine.start()).state,"ready");
  await assert.rejects(socketEngine.analyzeImage({buffer:img,mime:"image/png",
   prompt:"K60"}),/Связь с Qwen прервана \(ECONNRESET\).*Свободная RAM: 1.3 ГБ/);
  assert.equal(socketEngine.status().active,false);
  assert.equal(socketEngine.status().state,"ready");
  socketEngine.stop();
  fs.writeFileSync(path.join(dir,names.model),"corrupted model");
  assert.equal((await engine.verify()).installed,false);
  console.log("Local AI: checksums, isolated subprocess, loopback, auth token, real API payload and unverified provenance PASS");
 }finally{engine.stop();fs.rmSync(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
