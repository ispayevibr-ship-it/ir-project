"use strict";
/* Read-only on-demand vector geometry of one SHA-verified PDF page.
 * Importantly no geometry is written into scheme or mark registers. */
const path=require("node:path"),{Worker}=require("node:worker_threads");
const MAX_PDF_BYTES=48*1024*1024,DEADLINE=65000;
function createPdfGeometry({documents,database,
 workerFactory=(file,options)=>new Worker(file,options)}={}){
 if(!documents?.readForPdfIndex||!database?.getObject)
  throw Error("Геометрический анализ требует проверяемый PDF и базу объекта");
 const jobs=new Map();
 async function page(objectId,documentId,pageNumber){
  const id=Number(objectId),doc=Number(documentId),num=Number(pageNumber);
  if(!Number.isSafeInteger(id)||id<1||!database.getObject(id))
   throw Error("Объект не найден");
  if(!Number.isSafeInteger(doc)||doc<1||!Number.isSafeInteger(num)||num<1||num>80)
   throw Error("Неверный PDF или номер листа");
  const key=id+":"+doc+":"+num;
  if(jobs.has(key))return jobs.get(key);
  const task=(async()=>{
   const input=await documents.readForPdfIndex(id,doc);
   if(!input?.source?.sha256||!input.buffer||input.buffer.length>MAX_PDF_BYTES)
    throw Error("Недоступен исходный PDF");
   const result=await new Promise((resolve,reject)=>{
    const instance=workerFactory(path.join(__dirname,"ai-pdf-vector-worker.js"),
     {workerData:{bytes:new Uint8Array(input.buffer),page:num},
      resourceLimits:{maxOldGenerationSizeMb:256,maxYoungGenerationSizeMb:32},execArgv:[]});
    let done=false;
    const timeout=setTimeout(()=>finish(Error("Превышено время анализа геометрии (65 секунд)")),DEADLINE);
    function finish(error,value){
     if(done)return;done=true;clearTimeout(timeout);
     try{instance.terminate()}catch{}
     if(error)reject(error);else resolve(value)
    }
    instance.on("message",message=>{
     if(message?.type==="error")finish(Error(message.message||"Ошибка PDF"));
     else if(message?.type==="result"){
      if(message.page!==num||!Array.isArray(message.segments)||
       message.segments.length>2400||message.coordinateSystem!=="viewport_points_top_left")
       finish(Error("Недопустимые данные векторного анализатора"));
      else finish(null,message)
     }
    });
    instance.once("error",error=>finish(error));
    instance.once("exit",code=>{if(!done)finish(Error("PDF worker завершился: "+code))})
   });
   if(typeof documents.verify==="function"&&!documents.verify(id,doc))
    throw Error("Исходный PDF изменился во время анализа");
   return{...result,objectId:id,documentId:doc,sourceSha256:input.source.sha256,
    verified:typeof documents.verify==="function",
    safeForAutoPlacement:false}
  })();
  jobs.set(key,task);
  try{return await task}finally{jobs.delete(key)}
 }
 return{page,busy:()=>jobs.size>0}
}
module.exports={createPdfGeometry};
