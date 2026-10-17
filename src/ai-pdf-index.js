"use strict";
/* IR Project AI: real PDF text-layer index. No OCR/LLM inference is claimed. */
const path=require("node:path"),{Worker}=require("node:worker_threads");
const {markOccurrences}=require("./ai-pdf-mark-matcher");
const MAX_PDF_BYTES=48*1024*1024,DEADLINE=120000;
function createPdfIndex({database,documents,workerFactory=(file,options)=>new Worker(file,options),onProgress=()=>{}}){
 if(!database||!documents)throw Error("PDF index needs document store and database");
 const jobs=new Map();
 const object=id=>{
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<1||!database.getObject(n))throw Error("Объект не найден");
  return n
 };
 const rows=id=>database.listEntity(object(id),"ai-pdf-index").filter(r=>r.record_type==="pdf_text_index");
 function summarize(row){
  const data=row.data||{};
  return{id:row.id,documentId:data.source?.documentId||null,sourceName:data.source?.name||"",
   sourceSha256:data.source?.sha256||"",totalPages:data.total||0,
   indexedAt:row.created_at,mode:"Текстовый слой PDF — без ИИ",status:"Не проверено инженером",
   pages:(data.pages||[]).map(p=>({
    page:p.page,widthPt:p.widthPt,heightPt:p.heightPt,rotation:p.rotation,
    hasTextLayer:p.hasTextLayer,uncertainEncoding:p.uncertainEncoding,
    truncated:p.truncated,fragmentCount:p.fragments?.length||0,
    excerpt:String(p.text||"").slice(0,1400)
   }))}
 }
 function list(id){return rows(id).map(summarize)}
 function registerMarks(id){
  const entries=database.listEntity(object(id),"marks")||[];
  return [...new Set(entries.map(r=>String(r?.data?.mark??r?.title??"").trim()).filter(Boolean))];
 }
 function markSummary(id){
  const marks=registerMarks(id);
  const counts=new Map(marks.map(mark=>[mark,0]));
  const documents=[];
  for(const row of rows(id)){
   const sheets=[];
   for(const p of row.data?.pages||[]){
    const hits=markOccurrences(p,marks);
    for(const hit of hits)counts.set(hit.mark,(counts.get(hit.mark)||0)+1);
    sheets.push({page:p.page,occurrences:hits.length,
     marks:[...new Set(hits.map(hit=>hit.mark))],
     hasTextLayer:!!p.hasTextLayer,truncated:!!p.truncated});
   }
   documents.push({indexId:row.id,documentId:row.data?.source?.documentId||null,
    sourceName:row.data?.source?.name||"",pages:sheets});
  }
  const matched=[...counts].filter(([,count])=>count>0).map(([mark,count])=>({mark,count}));
  return{totalRegisterMarks:marks.length,matchedMarks:matched.length,
   unmatchedMarks:[...counts].filter(([,count])=>count===0).map(([mark])=>mark),
   totalOccurrences:matched.reduce((sum,row)=>sum+row.count,0),
   matched,documents,source:"pdf_text_layer",safeForAutoPlacement:false};
 }
 function page(id,indexId,pageNumber,allowedMarks){
  const item=rows(id).find(r=>String(r.id)===String(indexId));
  if(!item)throw Error("Индекс PDF не найден");
  const p=item.data?.pages?.find(p=>p.page===Number(pageNumber));
  if(!p)throw Error("Лист PDF не найден");
  return{indexId:item.id,source:item.data.source,page:p,
   markMatches:markOccurrences(p,registerMarks(id))}
 }
 function processPdf(bytes,progress){
  return new Promise((resolve,reject)=>{
   const file=path.join(__dirname,"ai-pdf-worker.js");
   const w=workerFactory(file,{workerData:{bytes:new Uint8Array(bytes)},resourceLimits:{
    maxOldGenerationSizeMb:256,maxYoungGenerationSizeMb:32
   },execArgv:[]});
   let completed=false;
   const timeout=setTimeout(()=>finish(new Error("Индексация PDF превысила 120 секунд")),DEADLINE);
   function finish(error,result){
    if(completed)return;completed=true;clearTimeout(timeout);
    try{w.terminate()}catch{}
    if(error)reject(error);else resolve(result)
   }
   w.on("message",event=>{
    if(event?.type==="progress"){
     progress({page:event.page,total:event.total});return
    }
    if(event?.type==="error")finish(new Error(event.message||"PDF worker error"));
    else if(event?.type==="result"){
     if(!Array.isArray(event.pages)||event.pages.length!==event.total||event.total<1||event.total>80)
      return finish(new Error("Некорректные результаты разбора PDF"));
     finish(null,event)
    }
   });
   w.once("error",error=>finish(error));
   w.once("exit",code=>{if(!completed)finish(new Error("PDF worker завершился без результата (код "+code+")"))})
  })
 }
 async function index(id,documentId){
  id=object(id);const docId=Number(documentId);
  if(!Number.isSafeInteger(docId)||docId<1)throw Error("Некорректный ID документа");
  const key=id+":"+docId;
  if(jobs.has(key))throw Error("Этот PDF уже индексируется");
  const task=(async()=>{
   const input=await documents.readForPdfIndex(id,docId);
   if(input.buffer.length>MAX_PDF_BYTES)throw Error("PDF превышает лимит 48 МиБ");
   const existing=rows(id).find(r=>r.data?.source?.documentId===docId&&
    r.data.source.sha256===input.source.sha256);
   if(existing)return{cached:true,...summarize(existing)};
   const progress=point=>onProgress({objectId:id,documentId:docId,...point});
   const result=await processPdf(input.buffer,progress);
   if(!result.pages.length)throw Error("Не найдены страницы PDF");
   if(typeof documents.verify==="function"&&!documents.verify(id,docId))
    throw Error("Исходный PDF изменился или удалён во время индексации — индекс не сохранён");
   const saved=database.createEntity(id,"ai-pdf-index",{
    record_type:"pdf_text_index",title:"PDF: "+input.source.name,
    data:{source:input.source,total:result.total,parser:"pdfjs-dist",
     extraction:"text_layer",pages:result.pages,review:"requires_review",
     generatedByAI:false}
   });
   if(!saved)throw Error("Не удалось сохранить текстовый индекс PDF");
   return{cached:false,...summarize(saved)}
  })();
  jobs.set(key,task);
  try{return await task}finally{jobs.delete(key)}
 }
 return{list,index,page,markSummary,busy:()=>jobs.size>0};
}
module.exports={createPdfIndex};
