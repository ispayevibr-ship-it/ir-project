"use strict";
/* Contract tests: real PNG pixels and injected mock llama response.
   These tests do not claim that real Qwen weights were downloaded or executed. */
const assert=require("node:assert/strict");
const {createDiagnostics,parseGpuCsv}=require("../src/ai-runtime-diagnostics");
const {createCanvas}=require("@napi-rs/canvas");
const sleep=()=>new Promise(resolve=>setTimeout(resolve,10));
(async()=>{
 assert.deepEqual(parseGpuCsv("NVIDIA GeForce RTX 4050 Laptop GPU, 6141, 4213, 580.25\n"),
  [{name:"NVIDIA GeForce RTX 4050 Laptop GPU",vramTotalMiB:6141,vramFreeMiB:4213,driver:"580.25"}]);
 assert.throws(()=>parseGpuCsv("broken"),/формат/);
 assert.throws(()=>parseGpuCsv("NVIDIA, -1, 30, 0"),/Некорректные/);
 let queried=[],shown=null,state={installed:true,state:"ready",model:"Qwen3-VL-4B",modelVersion:"1.0.0",active:false};
 const diagnostics=createDiagnostics({
  engine:{status:()=>state,analyzeImage:async request=>{
   shown=request;assert(Buffer.isBuffer(request.buffer));assert(request.buffer.length>7000);
   assert.deepEqual([...request.buffer.subarray(0,8)],[137,80,78,71,13,10,26,10]);
   assert.equal(request.mime,"image/png");
   assert(request.prompt.includes("диагностический тест"));
   return{raw:'{"text":"На листе маркировка K41","marks":["K41"],"notes":[],"unknowns":[]}',
    modelId:"Qwen3-VL-4B",modelVersion:"1.0.0"}
  }},
  platform:()=> "win32",totalmem:()=>16*1024**3,freemem:()=>9*1024**3,cpus:()=>12,
  execFile:async (binary,args,options)=>{
   queried.push([binary,args,options]);return{stdout:"NVIDIA GeForce RTX 4050 Laptop GPU, 6141, 4213, 580.25\n"}
  },
  canvasFactory:createCanvas
 });
 const hardware=await diagnostics.hardware();
 assert.equal(hardware.ramTotalGiB,16);assert.equal(hardware.gpuStatus,"available");
 assert.equal(hardware.gpu[0].vramTotalMiB,6141);assert.equal(queried[0][0],"nvidia-smi");
 assert.equal(queried[0][2].shell,false);assert.equal(queried[0][2].timeout,6000);
 const test=await diagnostics.smokeTest();
 assert.equal(test.success,true);assert.equal(test.recognizedMark,"К41");
 assert.equal(test.modelId,"Qwen3-VL-4B");assert.equal(test.modelVersion,"1.0.0");
 assert.equal(diagnostics.status().running,false);
 assert.equal(diagnostics.status().last.success,true);
 assert.equal(test.local,true);
 assert(shown.buffer.length>7000);
 state={state:"missing",installed:false};
 await assert.rejects(diagnostics.smokeTest(),/Сначала установите/);
 state={state:"ready",installed:true,active:true};
 await assert.rejects(diagnostics.smokeTest(),/занята/);
 const missingGpu=createDiagnostics({engine:{status:()=>state,analyzeImage:async()=>{}},
  execFile:async()=>{const e=new Error("not found");e.code="ENOENT";throw e}});
 const offline=await missingGpu.hardware();
 assert.equal(offline.gpuStatus,"unknown");
 assert.match(offline.gpuReason,/nvidia-smi недоступен/);
 let resolver;
 const pending=createDiagnostics({engine:{status:()=>({installed:true,state:"ready",model:"Qwen3-VL-4B",active:false}),
  analyzeImage:()=>new Promise(resolve=>{resolver=resolve})},canvasFactory:createCanvas});
 const first=pending.smokeTest();await sleep();
 await assert.rejects(pending.smokeTest(),/уже выполняется/);
 resolver({raw:'{"marks":["непонятно"]}'});
 const uncertain=await first;assert.equal(uncertain.success,false);
 assert.equal(uncertain.recognizedMark,null);
 const failure=createDiagnostics({engine:{status:()=>({installed:true,state:"ready",active:false}),
  analyzeImage:async()=>{throw Error("local server timeout")}},canvasFactory:createCanvas});
 const failed=await failure.smokeTest();
 assert.equal(failed.success,false);assert.match(failed.diagnostic,/local server timeout/);
 console.log("AI hardware+live diagnostics: NVIDIA memory, real PNG, success/failure, busy and no-model guards PASS (mock model responses)");
})().catch(e=>{console.error(e);process.exitCode=1});
