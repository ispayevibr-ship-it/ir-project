"use strict";
/* Verify actual PDF index text is used only for the same source SHA and an
 * intact text mapping. Qwen response is mocked; no weights are downloaded. */
const assert=require("node:assert/strict");
const {createAnalysis}=require("../src/ai-analysis");
(async()=>{
 const sha="a".repeat(64),rows=[],contexts=[];
 const db={getObject:id=>id===7?{id:7}:null,createEntity:(id,key,record)=>{
  const row={id:rows.length+1,record_type:record.record_type,data:record.data};
  rows.push(row);return row
 }};
 const pdfRenderer={renderForAnalysis:async()=>({
  buffer:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(90)]),
  mime:"image/png",width:1800,height:1273,scale:1.5,
  source:{documentId:3,sha256:sha,name:"041-2025 КМД К60.pdf",kind:"КМД",page:1}
 })};
 let indexSha=sha,uncertain=false,indexCount=0;
 const pdfIndex={
  list:()=>[{id:59,documentId:3,sourceSha256:indexSha,pages:[{
   page:1,hasTextLayer:true,uncertainEncoding:uncertain
  }]}],
  page:(_id,indexId,page)=>{
   indexCount++;assert.equal(indexId,59);assert.equal(page,1);
   return{source:{documentId:3,sha256:indexSha},
    page:{text:"Колонна К60. Общая длина 10105 мм. Дополнительные сведения требуют проверки"}}
  }
 };
 const engine={status:()=>({state:"ready"}),analyzeImage:async({ocrContext})=>{
  contexts.push(ocrContext);
  return{raw:JSON.stringify({schema:"ir-kmd-v1",text:"",marks:ocrContext.includes("К60")?["К60"]:[],
   notes:[],unknowns:[],records:[]}),engine:"local-qwen3-vl",complete:true}
 }};
 const work=createAnalysis({database:db,documents:{verify:()=>true},
  engine,pdfRenderer,pdfIndex});
 const first=await work.analyzePdf(7,3,1);
 assert.deepEqual(first.marks,["К60"]);
 assert.match(contexts[0],/НЕПРОВЕРЕННЫЙ ТЕКСТОВЫЙ СЛОЙ/);
 assert.match(contexts[0],/Колонна К60/);
 assert.equal(rows[0].data.pdfTextLayer.indexId,59);
 assert.equal(rows[0].data.raster.width,1800);
 assert.equal(rows[0].data.verification,"requires_review");
 indexSha="b".repeat(64);
 const second=await work.analyzePdf(7,3,1);
 assert.deepEqual(second.marks,[]);
 assert.equal(rows[1].data.pdfTextLayer,null);
 assert.equal(contexts[1],"");
 assert.equal(indexCount,1,"must never fetch index from different PDF SHA");
 indexSha=sha;uncertain=true;
 const third=await work.analyzePdf(7,3,1);
 assert.deepEqual(third.marks,[]);
 assert.equal(contexts[2],"");
 assert.equal(indexCount,1,"uncertain PDF text mapping must not be sent to Qwen");
 console.log("KMD PDF text context: source hash, encoding bounds, unverified provenance PASS");
})().catch(error=>{console.error(error);process.exitCode=1});
