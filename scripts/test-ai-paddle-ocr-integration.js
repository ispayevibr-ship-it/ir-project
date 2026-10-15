"use strict";
/* DEFERRED offline integration contract — do not run until final acceptance. */
const assert=require("node:assert/strict");
const {createAnalysis}=require("../src/ai-analysis");
(async()=>{
 const pdfHash="a".repeat(64);
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40,7)]);
 const input={buffer:png,mime:"image/png",
  source:{documentId:7,name:"KMD-sheet-1.pdf",kind:"КМД",sha256:pdfHash,page:1}};
 const rows=[],database={
  getObject:oid=>oid===1?{id:1}:null,
  listEntity:()=>rows,
  createEntity:(oid,key,payload)=>{
   const row={id:rows.length+1,object_id:oid,section_key:key,
    record_type:payload.record_type,data:payload.data};
   rows.push(row);return row
  }
 };
 let qwenCalls=0,ocrCalls=0,failOcr=false,receivedOcr="";
 const analysis=createAnalysis({
  database,
  documents:{verify:()=>true},
  pdfRenderer:{renderForAnalysis:async()=>input},
  revisions:{isCurrent:()=>true},
  ocr:{recognize:async({buffer,mime})=>{
   ocrCalls++;
   assert.equal(buffer,png);assert.equal(mime,"image/png");
   if(failOcr)throw Error("Signed local OCR is not installed");
   return{engine:"paddleocr-vl-1.6",modelId:"PaddleOCR-VL-1.6",
    modelVersion:"1.0.0",complete:true,unverified:true,sourceImageSha256:"b".repeat(64),
    text:"К41 6 шт.",blocks:[{type:"table",text:"К41 6 шт.",bbox:[4,5,60,25]}]}
  }},
  engine:{
   status:()=>({state:"ready"}),
   analyzeImage:async({buffer,mime,ocrContext})=>{
    assert.equal(buffer,png);assert.equal(mime,"image/png");
    receivedOcr=ocrContext;qwenCalls++;
    return{raw:JSON.stringify({schema:"ir-kmd-v1",text:"Ведомость КМД",
     marks:[],records:[],unknowns:["Требуется сверка количества"]}),
     engine:"local-qwen3-vl",modelId:"Qwen3-VL-4B",
     modelVersion:"1.0.0",complete:true}
   }
  }
 });
 const result=await analysis.analyzePdf(1,7,1);
 assert.equal(result.status,"Требует проверки инженера");
 assert.equal(rows.length,1);
 assert.equal(ocrCalls,1);assert.equal(qwenCalls,1);
 assert.equal(receivedOcr,"К41 6 шт.");
 assert.equal(rows[0].data.source.sha256,pdfHash);
 assert.equal(rows[0].data.ocr.unverified,true);
 assert.deepEqual(rows[0].data.ocr.blocks[0].bbox,[4,5,60,25]);
 assert.equal(rows[0].data.review,undefined,
  "OCR cannot write an engineering approval or modify production data");
 failOcr=true;
 await assert.rejects(()=>analysis.analyzePdf(1,7,1),/Signed local OCR is not installed/);
 assert.equal(rows.length,1,"a failed OCR run must not create a fake confirmed analysis");
 assert.equal(qwenCalls,1,"a missing PaddleOCR runtime must block the combined inference");
})().catch(error=>{console.error(error);process.exitCode=1});
