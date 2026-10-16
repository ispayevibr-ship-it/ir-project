"use strict";
const assert=require("node:assert/strict"),{EventEmitter}=require("node:events");
const {createPdfGeometry}=require("../src/ai-pdf-geometry");
const sha="a".repeat(64);
let verified=true,workerCount=0,mode="ok";
const documents={
 readForPdfIndex:async(id,doc)=>{
  assert.equal(id,7);assert.equal(doc,12);
  return{buffer:Buffer.from("%PDF-1.7 data"),source:{sha256:sha}}
 },
 verify:()=>verified
};
const database={getObject:id=>id===7?{id:7}:null};
function workerFactory(file,options){
 assert(file.endsWith("ai-pdf-vector-worker.js"));
 assert.equal(options.workerData.page,2);
 workerCount++;
 const worker=new EventEmitter;
 worker.terminate=()=>Promise.resolve(0);
 setImmediate(()=>{
  if(mode==="error")worker.emit("message",{type:"error",message:"Недоступный графический слой"});
  else worker.emit("message",{type:"result",page:2,total:6,rotation:0,
   segments:[{x1:10,y1:20,x2:100,y2:20,lengthPt:90,direction:"horizontal"}],
   stats:{storedSegments:1,horizontal:1,vertical:0,diagonal:0,truncated:false},
   coordinateSystem:"viewport_points_top_left",widthPt:1000,heightPt:750})
 });
 return worker
}
const api=createPdfGeometry({documents,database,workerFactory});
(async()=>{
 const [a,b]=await Promise.all([api.page(7,12,2),api.page(7,12,2)]);
 assert.equal(workerCount,1,"concurrent requests share one worker");
 assert.equal(a.sourceSha256,sha);
 assert.equal(a.safeForAutoPlacement,false);
 assert.equal(b.segments.length,1);
 assert.equal(api.busy(),false);
 await assert.rejects(()=>api.page(9,12,2),/Объект не найден/);
 await assert.rejects(()=>api.page(7,12,0),/Неверный PDF/);
 verified=false;
 await assert.rejects(()=>api.page(7,12,2),/изменился/);
 verified=true;mode="error";
 await assert.rejects(()=>api.page(7,12,2),/Недоступный графический слой/);
 assert.equal(api.busy(),false);
 console.log("PDF geometry worker: SHA verification, IPC shape, cache-less retry, single job PASS");
})().catch(e=>{console.error(e);process.exitCode=1});
