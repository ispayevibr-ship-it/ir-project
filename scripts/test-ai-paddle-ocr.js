"use strict";
/* DEFERRED acceptance contract: does NOT require or download actual models. */
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),
 path=require("node:path"),crypto=require("node:crypto"),{EventEmitter}=require("node:events");
const {createPaddleOcr}=require("../src/ai-paddle-ocr");
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-paddle-deferred-"));
 const profile={installed:true,protocol:"ir-paddleocr-vl-json-1",
  modelId:"PaddleOCR-VL-1.6",version:"1.0.0",
  files:{binary:{path:path.join(root,"signed-worker.exe")}},
  cwd:root,layoutDir:path.join(root,"signed-layout"),
  visionDir:path.join(root,"signed-vision")};
 const image=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40,17)]);
 let activeSpawn=null,hold=false;
 const models={
  managedRuntime:()=>profile,
  resolveRuntime:async()=>profile
 };
 const engine=createPaddleOcr({getUserDataPath:()=>root,models,spawn:(executable,args,options)=>{
  assert.equal(executable,profile.files.binary.path);
  assert.equal(options.shell,false);
  assert.equal(options.env.HF_HUB_OFFLINE,"1");
  assert.equal(options.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK,"True");
  assert(!args.some(x=>x.startsWith("http")));
  assert.equal(args[args.indexOf("--layout")+1],profile.layoutDir);
  assert.equal(args[args.indexOf("--vision")+1],profile.visionDir);
  const out=args[args.indexOf("--output")+1],child=new EventEmitter();
  child.stderr=new EventEmitter();
  child.kill=()=>{child.killed=true};
  activeSpawn=child;
  if(!hold)queueMicrotask(()=>{
   fs.writeFileSync(out,JSON.stringify({schema:"ir-paddleocr-vl-json-1",complete:true,
    blocks:[{type:"table",text:"К41 6 шт.",bbox:[10,20,70,40]}],
    text:"К41 6 шт."}));
   child.emit("close",0)
  });
  return child
 }});
 try{
  assert.equal(engine.status().installed,true);
  const result=await engine.recognize({buffer:image,mime:"image/png"});
  assert.equal(result.text,"К41 6 шт.");
  assert.equal(result.unverified,true);
  assert.equal(result.modelId,"PaddleOCR-VL-1.6");
  assert.deepEqual(result.blocks[0].bbox,[10,20,70,40]);
  assert.equal(result.sourceImageSha256,crypto.createHash("sha256").update(image).digest("hex"));
  assert.equal(engine.status().busy,false);
  hold=true;activeSpawn=null;
  const pending=engine.recognize({buffer:image,mime:"image/png"});
  for(let i=0;i<100&&!activeSpawn;i++)await new Promise(resolve=>setImmediate(resolve));
  assert(activeSpawn,"signed OCR worker must have started");
  engine.cancel();
  await assert.rejects(pending,/OCR отменён/);
  assert.equal(activeSpawn.killed,true);
  assert.equal(engine.status().busy,false);
  await assert.rejects(()=>engine.recognize({buffer:Buffer.from("bad"),mime:"image/png"}),/PNG|JPEG/);
  const absent=createPaddleOcr({getUserDataPath:()=>root,models:{
   managedRuntime:()=>null,resolveRuntime:async()=>null
  }});
  await assert.rejects(()=>absent.recognize({buffer:image,mime:"image/png"}),/Подписанный офлайн-пакет/);
  assert.equal(absent.status().installed,false);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
