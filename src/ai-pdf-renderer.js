"use strict";
/* PDF sheet rasterizer: content-addressed source, on-demand bounded worker.
   Never sends the PDF outside of the local Electron process. */
const path=require("node:path"),{Worker}=require("node:worker_threads");
const MAX_BYTES=48*1024*1024,TIMEOUT=90000;
function createPdfRenderer({database,documents,workerFactory=(filename,options)=>new Worker(filename,options)}={}){
 if(!database||!documents||typeof documents.readForPdfIndex!=="function")throw Error("PDF renderer missing dependencies");
 const jobs=new Set();
 function valid(id,documentId,page){
  const oid=Number(id),did=Number(documentId),n=Number(page);
  if(!Number.isSafeInteger(oid)||oid<1||!database.getObject(oid))throw Error("Объект не найден");
  if(!Number.isSafeInteger(did)||did<1)throw Error("Неверный документ");
  if(!Number.isSafeInteger(n)||n<1||n>80)throw Error("Номер листа должен быть от 1 до 80");
  return{oid,did,n}
 }
 function work(bytes,page){
  return new Promise((resolve,reject)=>{
   const filename=path.join(__dirname,"ai-pdf-render-worker.js");
   const worker=workerFactory(filename,{workerData:{bytes:new Uint8Array(bytes),page,maxSide:1800},
    execArgv:[],resourceLimits:{maxOldGenerationSizeMb:384,maxYoungGenerationSizeMb:48}});
   let settled=false;
   const timer=setTimeout(()=>done(new Error("Визуализация PDF превысила 90 секунд")),TIMEOUT);
   function done(error,result){
    if(settled)return;settled=true;clearTimeout(timer);
    try{worker.terminate()}catch{}
    if(error)reject(error);else resolve(result)
   }
   worker.on("message",m=>{
    if(m?.type==="error")return done(new Error(m.message||"Ошибка рендера PDF"));
    if(m?.type!=="result")return;
    const image=Buffer.from(m.bytes||[]);
    if(!image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||
       image.length>16*1024*1024||!Number.isSafeInteger(m.page)||m.page!==page)
     return done(new Error("PDF worker вернул некорректное изображение"));
    done(null,{buffer:image,mime:"image/png",page:m.page,total:m.total,
     width:m.width,height:m.height,widthPt:m.widthPt,heightPt:m.heightPt,scale:m.scale})
   });
   worker.once("error",done);
   worker.once("exit",code=>{if(!settled)done(new Error("PDF renderer завершился без результата: "+code))})
  })
 }
 async function renderForAnalysis(objectId,documentId,page){
  const {oid,did,n}=valid(objectId,documentId,page);
  if(jobs.size)throw Error("Другой лист PDF уже обрабатывается, дождитесь завершения");
  const token=Symbol("pdf render");jobs.add(token);
  try{
   const document=await documents.readForPdfIndex(oid,did);
   if(document.buffer.length>MAX_BYTES)throw Error("Слишком большой PDF");
   const result=await work(document.buffer,n);
   return{...result,source:{...document.source,page:n,totalPages:result.total,
    widthPt:result.widthPt,heightPt:result.heightPt,sourceRegion:"Весь лист (без координат распознанных элементов)"}}
  }finally{jobs.delete(token)}
 }
 async function preview(objectId,documentId,page){
  const result=await renderForAnalysis(objectId,documentId,page);
  return{page:result.page,total:result.total,width:result.width,height:result.height,
   sourceName:result.source.name,sha256:result.source.sha256,
   dataUrl:"data:image/png;base64,"+result.buffer.toString("base64")}
 }
 return{preview,renderForAnalysis,busy:()=>jobs.size>0};
}
module.exports={createPdfRenderer};
