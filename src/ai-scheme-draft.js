"use strict";
/* IR Project: geometry scan of one stored PDF in an isolated worker. No AI; results feed the montage steps. */
const path=require("node:path"),{Worker}=require("node:worker_threads");
const {workerPackages}=require("./ai-packages");
const MAX_PDF_BYTES=48*1024*1024,DEADLINE=180000;
function createSchemeDrafts({database,documents,aliases=()=>[],workerFactory=(file,options)=>new Worker(file,options)}){
 if(!database||!documents)throw Error("Scheme drafts need document store and database");
 const object=id=>{
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<1||!database.getObject(n))throw Error("Объект не найден");
  return n
 };
 // gate (scan only): the engineer's pause and stop of the analysis (src/ai-montage.js). Paused, the worker waits before
 // its next sheet and the deadline is off; stopped, the worker ends at once and the sheets it sent so far are the result
 // (stopped: true) — the sheet it was reading is read again when the analysis is continued.
 function run(bytes,progress,options={},gate=null){
  return new Promise((resolve,reject)=>{
   const w=workerFactory(path.join(__dirname,"ai-scheme-worker.js"),{workerData:{bytes:new Uint8Array(bytes),packages:workerPackages(),aliases:(()=>{try{return aliases()||[]}catch{return[]}})(),...options},
    resourceLimits:{maxOldGenerationSizeMb:512,maxYoungGenerationSizeMb:64},execArgv:[]});
   let completed=false,paused=false,off=null;
   // Every sheet as it is read (the worker sends them one by one).
   const pages=[];
   // The deadline runs from the last sign of life: a long set read by OCR keeps reporting its pages.
   let timeout=null;
   const arm=()=>{clearTimeout(timeout);if(!paused)timeout=setTimeout(()=>finish(new Error("Разбор PDF: нет ответа 180 секунд")),DEADLINE)};
   arm();
   function finish(error,result){
    if(completed)return;completed=true;clearTimeout(timeout);
    try{off?.()}catch{}
    try{w.terminate()}catch{}
    if(error)reject(error);else resolve(result)
   }
   const steer=state=>{
    if(state==="stop")return finish(null,{pages,totalPages:null,stopped:true});
    paused=state==="pause";arm();
    try{w.postMessage({type:paused?"pause":"resume"})}catch{}
   };
   if(gate){off=gate.listen(steer);if(gate.state==="pause"||gate.state==="stop")steer(gate.state)}
   w.on("message",event=>{
    if(event?.type==="page"){arm();if(event.page)pages.push(event.page);return}
    if(event?.type==="progress"){arm();return progress({page:event.page,total:event.total,...(event.ocr?{ocr:true}:{}),...(event.paused?{paused:true,done:event.done}:{})})}
    if(event?.type==="error")finish(new Error(event.message||"Ошибка разбора PDF"));
    else if(event?.type==="result"){
     if(event.pages!==null&&!Array.isArray(event.pages))return finish(new Error("Некорректный результат разбора PDF"));
     finish(null,{...event,pages:event.pages||pages})
    }
   });
   w.once("error",error=>finish(error));
   w.once("exit",code=>{if(!completed)finish(new Error("Разбор PDF завершился без результата (код "+code+")"))})
  })
 }
 // The stored PDF bytes, within the size limit of the worker.
 async function read(id,documentId){
  const oid=object(id),docId=Number(documentId);
  if(!Number.isSafeInteger(docId)||docId<1)throw Error("Некорректный ID документа");
  const input=await documents.readForPdfIndex(oid,docId);
  if(input.buffer.length>MAX_PDF_BYTES)throw Error("PDF превышает лимит 48 МиБ");
  return input
 }
 // Every page of one stored PDF except the excluded ones: schemes found by geometry plus the sheet context.
 async function scan(id,documentId,progress=()=>{},exclude=[],gate=null){
  const input=await read(id,documentId);
  const result=await run(input.buffer,progress,{exclude},gate);
  return{source:input.source,pages:result.pages,totalPages:result.totalPages,...(result.stopped?{stopped:true}:{})}
 }
 // Sheet list with stamp names, read from text only.
 async function sheets(id,documentId){
  const input=await read(id,documentId);
  const result=await run(input.buffer,()=>{},{mode:"sheets"});
  return{source:input.source,sheets:result.pages,totalPages:result.totalPages}
 }
 return{scan,sheets};
}
module.exports={createSchemeDrafts};
