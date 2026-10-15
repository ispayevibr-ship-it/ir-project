"use strict";
/* Signed Qwen3-VL 4B -> model manager -> verified llama.cpp process -> inference.
   The executable/model are fixtures; no real neural weights are claimed. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 os=require("node:os"),crypto=require("node:crypto"),{EventEmitter}=require("node:events"),
 {pipeline}=require("node:stream/promises"),yazl=require("yazl");
const {createModelManager}=require("../src/ai-model-manager");
const {createEngine}=require("../src/ai-local-engine");
const hash=x=>crypto.createHash("sha256").update(x).digest("hex");
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-qwen4-"));
 const keys=crypto.generateKeyPairSync("ed25519");
 const trustedKeys={"publisher-fixture":keys.publicKey.export({format:"pem",type:"spki"})};
 const binName=process.platform==="win32"?"llama-server.exe":"llama-server";
 const modelFiles=(version)=>{
  const entries={
   ["bin/"+binName]:Buffer.from("Fake llama executable "+version+"; never execute this fixture"),
   "model/model.gguf":Buffer.from("Qwen3-VL-4B GGUF "+version+" fixture bytes xxxx"),
   "model/mmproj.gguf":Buffer.from("Vision projector "+version+" fixture bytes yyyy")
  };
  return entries
 };
 async function pack(version,{missingRuntime=false}={}){
  const files=modelFiles(version);
  const manifest={schema:1,modelId:"qwen3-vl-4b",engine:"llama.cpp",
   version,keyId:"publisher-fixture",minAppVersion:"1.7.213",
   ...(missingRuntime?{}:{runtime:{
    binary:"bin/"+binName,model:"model/model.gguf",vision:"model/mmproj.gguf",gpuLayers:6}}),
   files:Object.entries(files).map(([file,buffer])=>({path:file,bytes:buffer.length,sha256:hash(buffer)}))};
  const raw=Buffer.from(JSON.stringify(manifest));
  const archive=new yazl.ZipFile();
  archive.addBuffer(raw,"manifest.json");
  archive.addBuffer(Buffer.from(crypto.sign(null,raw,keys.privateKey).toString("base64")),"manifest.sig");
  for(const [name,buffer] of Object.entries(files))archive.addBuffer(buffer,"files/"+name);
  const target=path.join(dir,"signed-"+version+".ir-ai-pack");
  archive.end();await pipeline(archive.outputStream,fs.createWriteStream(target));
  return target
 }
 let next="",launches=[],lastChild=null,calls=[];
 const manager=createModelManager({getUserDataPath:()=>dir,trustedKeys,appVersion:()=>"1.7.213",
  dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[next]})}});
 const engine=createEngine({getUserDataPath:()=>dir,managedModel:{
   inspect:()=>manager.managedRuntime("qwen3-vl-4b"),
   resolve:()=>manager.resolveRuntime("qwen3-vl-4b")
  },memory:()=>16*1024**3,wait:async()=>{},
  spawn:(binary,args,opts)=>{
   launches.push({binary,args,opts});
   assert.equal(path.basename(binary),binName);
   assert.equal(opts.cwd,path.dirname(binary));
   assert.equal(opts.shell,false);
   assert(args.includes("--mmproj"));
   assert.deepEqual(args.slice(args.indexOf("--n-gpu-layers")+1,args.indexOf("--n-gpu-layers")+2),["6"]);
   lastChild=new EventEmitter();lastChild.kill=()=>{lastChild.killed=true};return lastChild
  },
  httpFetch:async(url,options)=>{
   calls.push({url,options});
   assert(url.startsWith("http://127.0.0.1:"));
   if(url.endsWith("/health"))return{ok:true,status:200};
   if(url.endsWith("/v1/chat/completions"))return{ok:true,status:200,
    json:async()=>({choices:[{message:{content:'{"text":"К41","marks":["К41"],"notes":[],"unknowns":[]}'},
      finish_reason:"stop"}]})};
   throw Error("Unexpected external request")
  }
 });
 async function install(version,settings){
  next=await pack(version,settings);
  const selected=await manager.select();
  assert(selected?.token);
  return manager.install(selected.token)
 }
 try{
  assert.equal(manager.managedRuntime(),null);
  assert.equal(engine.status().state,"missing");
  await install("1.0.0",{missingRuntime:true});
  assert.equal(manager.managedRuntime().installed,false,"missing signed runtime must not launch");
  await engine.start();
  assert.equal(launches.length,0);
  await install("1.1.0");
  let candidate=manager.managedRuntime();
  assert.equal(candidate.installed,true);
  assert.equal(candidate.modelId,"Qwen3-VL-4B");
  assert.equal(candidate.version,"1.1.0");
  assert.equal((await engine.verify()).installed,true);
  let result=await engine.start();
  assert.equal(result.state,"ready");assert.equal(result.model,"Qwen3-VL-4B");
  assert.equal(result.modelVersion,"1.1.0");assert.equal(result.managed,true);
  assert(launches[0].binary.includes(path.join("qwen3-vl-4b","1.1.0")));
  const image=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(64,2)]);
  const reply=await engine.analyzeImage({buffer:image,mime:"image/png",prompt:"На листе К41"});
  assert.equal(reply.modelId,"Qwen3-VL-4B");assert.equal(reply.modelVersion,"1.1.0");
  assert(reply.raw.includes("К41"));
  engine.stop();assert(lastChild.killed);
  const file=path.join(dir,"ir-project-ai","model-manager","models","qwen3-vl-4b","1.1.0","files","model","model.gguf");
  const bytes=fs.readFileSync(file);bytes[4]^=0xff;fs.writeFileSync(file,bytes);
  const failed=await engine.verify();
  assert.equal(failed.installed,false);assert.match(failed.reason,/SHA-256|Повреждён/);
  const before=launches.length;
  result=await engine.start();assert.notEqual(result.state,"ready");assert.equal(launches.length,before);
  const rollback=await manager.rollback("qwen3-vl-4b");assert.equal(rollback.active,"1.0.0");
  assert.equal(manager.managedRuntime().installed,false,"rollback to incomplete package must not claim ready");
  console.log("Signed Qwen3-VL 4B -> manager -> verified local llama process, version/source and corruption fallback PASS");
 }finally{engine.stop();fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
