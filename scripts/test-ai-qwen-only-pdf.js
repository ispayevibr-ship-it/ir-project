"use strict";
/* Qwen-only local KMD analysis when PaddleOCR pack is not installed.
 * Mocked model response; never claims to certify actual K60 recognition. */
const assert=require("node:assert/strict");
const {createAnalysis}=require("../src/ai-analysis");
(async()=>{
 const rows=[],sha256="a".repeat(64);
 let ocrCalls=0,qwenCalls=0;
 const db={
  getObject:id=>id===7?{id:7}:null,
  createEntity(id,key,data){
   const row={id:rows.length+1,record_type:data.record_type,data:data.data,created_at:"2026-10-16"};
   rows.push(row);return row
  },
  listEntity:()=>rows
 };
 const buffer=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(100)]);
 const analysis=createAnalysis({
  database:db,documents:{verify:()=>true},
  pdfRenderer:{renderForAnalysis:async()=>({buffer,mime:"image/png",
   source:{documentId:3,name:"041-2025 КМД К60.pdf",kind:"КМД",sha256,page:1}})},
  ocr:{status:()=>({installed:false}),recognize:async()=>{ocrCalls++;throw Error("should not run")}},
  engine:{status:()=>({state:"ready"}),analyzeImage:async request=>{
   qwenCalls++;assert.equal(request.ocrContext,"");
   return{raw:JSON.stringify({text:"Колонна К60",marks:["К60"],
    notes:[],unknowns:["Масса не подтверждена"],records:[]}),
    engine:"llama.cpp",modelId:"qwen3-vl-4b",modelVersion:"manual-beta",complete:false}
  }}
 });
 const result=await analysis.analyzePdf(7,3,1);
 assert.equal(result.status,"Требует проверки инженера");
 assert.deepEqual(result.marks,["К60"]);
 assert.equal(qwenCalls,1);assert.equal(ocrCalls,0);
 assert.equal(rows.length,1);
 assert.equal(rows[0].data.ocr,null);
 assert.equal(rows[0].data.origin,"locally_executed_llama_cpp_pdf_raster");
 assert.equal(rows[0].data.verification,"requires_review");
 console.log("Qwen-only PDF (PaddleOCR absent): analysis persists as unverified proposal PASS");
})().catch(e=>{console.error(e);process.exitCode=1});
