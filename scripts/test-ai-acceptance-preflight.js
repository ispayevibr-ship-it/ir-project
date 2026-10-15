"use strict";
/* DEFERRED acceptance contract: no downloads and no neural inference. */
const assert=require("node:assert/strict");
const {createPreflight}=require("../src/ai-acceptance-preflight");
(async()=>{
 let publisher=false,qwen=false,paddle=false,running=false,corrupt=false;
 const models={
  info:()=>({signedImportAvailable:publisher}),
  resolveRuntime:async id=>{
   if(corrupt)throw Error("SHA-256 mismatch");
   const present=id==="qwen3-vl-4b"?qwen:paddle;
   return present?{installed:true,version:"1.0.0"}:null
  }
 };
 const engine={status:()=>({state:running?"ready":"missing"})};
 const ocr={status:()=>({installed:paddle})};
 const preflight=createPreflight({models,engine,ocr});
 let report=await preflight.check();
 assert.equal(report.readyForFirstPdf,false);
 assert.equal(report.modelTestingPerformed,false);
 assert.equal(report.releaseCertified,false);
 assert.deepEqual(report.checks.map(x=>x.id),
  ["publisher_key","qwen3-vl-4b","paddleocr-vl-1.6","qwen_running"]);
 assert(report.checks.every(x=>x.ok===false));
 publisher=true;qwen=true;paddle=true;running=true;
 report=await preflight.check();
 assert.equal(report.readyForFirstPdf,true);
 assert(report.checks.every(x=>x.ok===true));
 assert.equal(report.modelTestingPerformed,false,"a package check is not a model test");
 corrupt=true;
 report=await preflight.check();
 assert.equal(report.readyForFirstPdf,false);
 assert(report.checks.filter(x=>!x.ok).length>=2);
 assert.match(report.checks[1].description,/SHA-256/);
 running=false;corrupt=false;
 report=await preflight.check();
 assert.equal(report.readyForFirstPdf,false,"not running is not inference-ready");
 assert.equal(report.checks.at(-1).ok,false);
 console.log("Deferred readiness preflight acceptance completed");
})().catch(e=>{console.error(e);process.exitCode=1});
