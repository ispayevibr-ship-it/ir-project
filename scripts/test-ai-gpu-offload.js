"use strict";
/* Never assume an NVIDIA GPU is usable. Only start partial GPU offload if a
 * matching local llama.cpp CUDA DLL and sufficient free VRAM are present.
 * A startup crash must transparently fall back to CPU with source files intact. */
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),
 path=require("node:path"),crypto=require("node:crypto"),{EventEmitter}=require("node:events");
const {createEngine,chooseManualGpuLayers,probeNvidiaFreeMiB}=require("../src/ai-local-engine");
assert.equal(chooseManualGpuLayers({manual:true,cudaBackend:false,freeVramMiB:5500}),0);
assert.equal(chooseManualGpuLayers({manual:true,cudaBackend:true,freeVramMiB:3000}),0);
assert.equal(chooseManualGpuLayers({manual:true,cudaBackend:true,freeVramMiB:4000}),6);
assert.equal(chooseManualGpuLayers({manual:true,cudaBackend:true,freeVramMiB:5200}),12);
assert.equal(chooseManualGpuLayers({manual:false,cudaBackend:true,freeVramMiB:5200}),0);
assert.equal(probeNvidiaFreeMiB(()=>({status:0,stdout:"5120\n"})),5120);
assert.equal(probeNvidiaFreeMiB(()=>({status:1,stdout:""})),null);
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-cuda-safe-"));
 const folder=path.join(tmp,"ir-project-ai","manual-qwen");
 fs.mkdirSync(folder,{recursive:true});
 const fileData={
  binary:Buffer.from("MZ "+".exe".repeat(20)),
  model:Buffer.from("GGUF model test"),vision:Buffer.from("GGUF mmproj")
 };
 const files={};
 for(const [key,data] of Object.entries(fileData)){
  const filename=path.join(folder,key+".bin");fs.writeFileSync(filename,data);
  files[key]={path:filename,bytes:data.length,
   expected:crypto.createHash("sha256").update(data).digest("hex")}
 }
 fs.writeFileSync(path.join(folder,"ggml-cuda.dll"),Buffer.alloc(1200000));
 const profile={installed:true,manual:true,managed:false,modelId:"qwen3-vl-4b",
  version:"manual-beta",cwd:folder,files,gpuLayers:0,
  bytes:Object.values(files).reduce((n,v)=>n+v.bytes,0)};
 const model={inspect:()=>profile};
 const setup=(failGpu=false)=>{
  const starts=[];
  const engine=createEngine({
   getUserDataPath:()=>tmp,managedModel:model,memory:()=>16*1024**3,
   freeMemory:()=>4*1024**3,
   gpuProbe:()=>5200,wait:async()=>{},
   spawn:(_binary,args)=>{
    const p=new EventEmitter();p.stderr=new EventEmitter();p.kill=()=>{};
    const count=Number(args[args.indexOf("--n-gpu-layers")+1]);
    starts.push(count);
    if(failGpu&&count>0)queueMicrotask(()=>p.emit("exit",1,null));
    else if(count>0)queueMicrotask(()=>p.stderr.emit("data",
     Buffer.from("load_tensors: offloaded 12/36 layers to GPU\n")));
    return p
   },
   httpFetch:async url=>{
    assert(url.endsWith("/health"),"only local health check is performed");
    await new Promise(resolve=>setImmediate(resolve));
    return{ok:true,status:200}
   }
  });
  return{engine,starts}
 };
 try{
  const gpu=setup();
  assert.equal((await gpu.engine.start()).state,"ready");
  assert.deepEqual(gpu.starts,[12]);
  assert.equal(gpu.engine.status().gpuLayers,12);
  assert.equal(gpu.engine.status().gpuConfirmed,true);
  assert.equal(gpu.engine.status().contextTokens,6144);
  gpu.engine.stop();
  const fallback=setup(true);
  const result=await fallback.engine.start();
  assert.equal(result.state,"ready","failed CUDA start must recover using CPU");
  assert.deepEqual(fallback.starts,[12,0]);
  assert.equal(result.gpuLayers,0);
  assert.match(result.gpuFallback,/Автоматически использован CPU/);
  fallback.engine.stop();
  fs.rmSync(path.join(folder,"ggml-cuda.dll"));
  const cpu=setup();
  assert.equal((await cpu.engine.start()).state,"ready");
  assert.deepEqual(cpu.starts,[0],"CUDA DLL missing: CPU only, even with NVIDIA");
  assert.equal(cpu.engine.status().gpuBackendFound,false);
  cpu.engine.stop();
  console.log("CUDA startup: backend/VRAM checks, confirmed partial GPU, automatic safe CPU fallback PASS");
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
