"use strict";
/* DEFERRED IR Project AI CONTRACT — do not execute before final acceptance. */
const assert=require("node:assert/strict");
const {EventEmitter}=require("node:events");
const {createAnalysis}=require("../src/ai-analysis");
const {createPdfIndex}=require("../src/ai-pdf-index");
(async()=>{
 const entries=[],database={
  getObject:id=>Number(id)===1?{id:1}:null,
  listEntity:(id,section)=>entries.filter(x=>x.object_id===id&&x.section_key===section),
  createEntity:(id,section,input)=>{
   const row={id:entries.length+1,object_id:id,section_key:section,
    record_type:input.record_type,data:input.data,title:input.title};
   entries.push(row);return row
  }
 };
 const sha="a".repeat(64),source={documentId:2,name:"041-КМД.pdf",sha256:sha,
  kind:"КМД",page:1},buffer=Buffer.alloc(64,1);
 let fileValid=true,activeRevision=true,flipFile=false,flipRevision=false;
 const documents={
  verify:()=>fileValid,
  readForAnalysis:async()=>({buffer,mime:"image/png",source:{...source}}),
  readForPdfIndex:async()=>({buffer,source:{...source}})
 };
 const engine={
  status:()=>({state:"ready"}),
  analyzeImage:async()=>{
   if(flipFile)fileValid=false;
   if(flipRevision)activeRevision=false;
   return{raw:JSON.stringify({schema:"ir-kmd-v1",records:[]}),
    engine:"offline-mock",complete:true}
  }
 };
 const pdfRenderer={renderForAnalysis:async()=>({
  buffer,mime:"image/png",source:{...source}
 })};
 const revisions={isCurrent:()=>activeRevision};
 const analysis=createAnalysis({database,documents,engine,pdfRenderer,revisions});
 flipFile=true;
 await assert.rejects(analysis.analyzePdf(1,2,1),/PDF изменился/);
 assert.equal(entries.length,0,"changed original cannot be stored as AI evidence");
 flipFile=false;fileValid=true;flipRevision=true;activeRevision=true;
 await assert.rejects(analysis.analyzePdf(1,2,1),/поменялся действующий комплект/);
 assert.equal(entries.length,0,"old revision cannot be silently accepted");
 flipRevision=false;activeRevision=true;
 const saved=await analysis.analyzePdf(1,2,1);
 assert.equal(saved.status,"Требует проверки инженера");
 assert.equal(entries.length,1);
 flipFile=true;fileValid=true;
 await assert.rejects(analysis.analyze(1,2),/Исходный файл изменился/);
 assert.equal(entries.length,1);

 let workerCorruptsFile=true;
 const workerFactory=()=>{
  const worker=new EventEmitter();worker.terminate=()=>Promise.resolve();
  process.nextTick(()=>{
   if(workerCorruptsFile)fileValid=false;
   worker.emit("message",{type:"result",total:1,pages:[{page:1,text:"K41",
    widthPt:595,heightPt:842,fragments:[]}]})
  });
  return worker
 };
 fileValid=true;
 const pdf=createPdfIndex({database,documents,workerFactory});
 await assert.rejects(pdf.index(1,2),/PDF изменился или удалён/);
 assert.equal(entries.filter(x=>x.section_key==="ai-pdf-index").length,0);
 workerCorruptsFile=false;fileValid=true;
 const indexed=await pdf.index(1,2);
 assert.equal(indexed.totalPages,1);
 assert.equal(entries.filter(x=>x.section_key==="ai-pdf-index").length,1);
 console.log("Deferred contract: reject obsolete PDF index / AI analysis on source or revision changes");
})().catch(e=>{console.error(e);process.exitCode=1});
