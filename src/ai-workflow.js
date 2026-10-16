"use strict";
/* IR Project AI: durable sequential drawing-sheet workflow.
 * Queue is local SQLite, never auto-runs at app start or downloads models.
 * AI results are only proposals: production databases stay untouched.
 */
function createAiWorkflow({database,documents,pdfIndex,analysis,reviews,engine,ocr=null,revisions=null,onProgress=()=>{},clock=()=>new Date().toISOString()}={}){
 if(!database||!documents||!pdfIndex||!analysis||!reviews||!engine)
  throw Error("Для очереди IR Project AI нужны документы, PDF, локальная модель и журнал проверок");
 const running=new Map(),stopping=new Set();
 const SECTION="ai-workflow-tasks",EVENTS="ai-workflow-events";
 const object=id=>{const n=Number(id);if(!Number.isSafeInteger(n)||n<1||!database.getObject(n))throw Error("Объект не найден");return n};
 const number=(val,name)=>{const n=Number(val);if(val==null||val===""||!Number.isSafeInteger(n)||n<1)throw Error("Некорректный "+name);return n};
 const rows=oid=>database.listEntity(oid,SECTION).filter(x=>x.record_type==="sheet_task");
 const docs=oid=>new Map(documents.list(oid).map(x=>[x.id,x]));
 const sourceOk=(row,doc)=>Boolean(doc&&doc.exists&&doc.ext===".pdf"&&doc.sha256===row.data?.source?.sha256&&
  (!revisions||revisions.isCurrent(row.object_id,{...row.data.source,page:row.data.page})));
 function progress(oid){try{onProgress({objectId:oid,at:clock()})}catch{}}
 function publicRow(row,documentMap,reviewMap){
  const d=row.data||{},source=d.source||{},doc=documentMap.get(source.documentId);
  const result=reviewMap.get(Number(d.analysisId)),valid=sourceOk(row,doc);
  // An analysis ID is not evidence unless it belongs to this exact PDF sheet.
  const correctLink=Boolean(result&&Number(result.documentId)===Number(source.documentId)&&
   result.sha256===source.sha256&&result.kind===source.kind&&
   Number(result.page)===Number(d.page)&&!result.region);
  const invalidLink=d.analysisId!=null&&!correctLink&&
   ["awaiting_review","confirmed","rejected"].includes(d.status);
  let status=d.status||"queued";
  if(!valid)status="outdated";
  else if(invalidLink)status="failed";
  else if(status==="running")status=running.has(row.object_id)?"running":"interrupted";
  else if(status==="awaiting_review"&&correctLink&&result.status==="confirmed")status="confirmed";
  else if(status==="awaiting_review"&&correctLink&&result.status==="rejected")status="rejected";
  return{id:row.id,documentId:source.documentId,sourceName:String(source.name||""),
   kind:String(source.kind||""),sha256:String(source.sha256||""),
   page:d.page,mode:"pdf_sheet",status,storedStatus:d.status||"queued",
   indexId:d.indexId||null,analysisId:d.analysisId||null,
   reviewStatus:correctLink?result.status:null,reviewedAt:correctLink?result.reviewedAt||null:null,
   lastError:invalidLink?"Результат ИИ не принадлежит исходному PDF или листу задания":String(d.lastError||""),
   attempts:Number(d.attempts)||0,
   createdAt:row.created_at,updatedAt:row.updated_at||null}
 }
 function list(id){
  const oid=object(id),documentMap=docs(oid),reviewMap=new Map(reviews.list(oid).map(x=>[x.id,x]));
  return rows(oid).map(row=>publicRow(row,documentMap,reviewMap))
 }
 function summary(id){
  const oid=object(id),entries=list(oid),totals={};
  for(const x of entries)totals[x.status]=(totals[x.status]||0)+1;
  const indexes=pdfIndex.list(oid),indexed=indexes.reduce((s,r)=>s+(r.totalPages||0),0);
  const reviewEntries=reviews.list(oid);
  return{total:entries.length,byStatus:totals,indexedPages:indexed,
   reviewRequired:reviewEntries.filter(x=>x.status==="requires_review").length,
   confirmedAnalyses:reviewEntries.filter(x=>x.status==="confirmed").length,
   isRunning:running.has(oid),stopRequested:stopping.has(oid),
   next:entries.find(x=>["queued","needs_model"].includes(x.status))?.id||null,
   modelState:engine.status?.().state||"missing",
   ocrState:ocr?ocr.status?.()||{installed:false}:null,
   complete:false,note:"Очередь распознавания листов PDF; результаты остаются предложениями ИИ до проверки инженером"}
 }
 function requireEditor(context){
  if(!["admin","engineer"].includes(context?.role))throw Error("Операции с очередью доступны только инженеру или администратору")
 }
 function record(oid,id){
  const row=database.getEntity(oid,SECTION,number(id,"ID задания"));
  if(!row||row.record_type!=="sheet_task")throw Error("Задание не найдено в указанном объекте");
  return row
 }
 function trans(fn){
  if(typeof database.transaction!=="function")throw Error("SQLite требует поддержку транзакций");
  return database.transaction(fn)
 }
 function update(oid,row,patch,event){
  return trans(()=>{
   const next={...row.data,...patch,updatedAt:clock()};
   const changed=database.updateEntity(oid,SECTION,row.id,{
    record_type:"sheet_task",title:row.title,data:next,parent_id:null
   });
   if(!changed)throw Error("Не удалось обновить состояние листа");
   if(!database.createEntity(oid,EVENTS,{
    record_type:"sheet_event",parent_id:row.id,
    title:"Лист "+next.page+" · "+event,
    data:{taskId:row.id,event,at:next.updatedAt,previousStatus:row.data?.status||null,
     status:next.status,analysisId:next.analysisId||null,error:next.lastError||""}
   }))throw Error("Не удалось сохранить историю обработки");
   return changed
  })
 }
 function emit(oid){progress(oid)}
 function enqueue(id,documentId,pages,{role}={}){
  const oid=object(id);requireEditor({role});
  if(running.has(oid))throw Error("Пока идёт обработка, очередь нельзя изменять");
  const docId=number(documentId,"ID PDF"),doc=docs(oid).get(docId);
  if(!doc||!doc.exists||doc.ext!==".pdf"||!["КМ","КМД"].includes(doc.kind))
   throw Error("Для очереди требуется доступный PDF КМ или КМД");
  if(!Array.isArray(pages)||!pages.length||pages.length>80)
   throw Error("Выберите от 1 до 80 листов одного PDF");
  const wanted=new Set(pages.map(p=>number(p,"номер листа")));
  if(wanted.size!==pages.length)throw Error("Один лист нельзя добавить дважды");
  const index=pdfIndex.list(oid).find(x=>x.documentId===docId&&x.sourceSha256===doc.sha256);
  if(!index)throw Error("Сначала выполните индексацию данного PDF, затем выберите листы");
  if(revisions)for(const page of wanted){if(!revisions.isCurrent(oid,{documentId:docId,sha256:doc.sha256,kind:doc.kind,page}))
   throw Error("Лист "+page+" не входит в действующую редакцию комплекта "+doc.kind)}
  const validPages=new Set(index.pages.map(p=>p.page));
  for(const page of wanted)if(!validPages.has(page))throw Error("Лист "+page+" отсутствует в индексе исходного PDF");
  const tasks=rows(oid);
  if(tasks.length+wanted.size>500)throw Error("Лимит журнала очереди: 500 листов на объект");
  const exists=new Set(tasks.filter(row=>row.data?.source?.documentId===docId&&
   row.data?.source?.sha256===doc.sha256&&row.data?.status!=="canceled").map(row=>row.data.page));
  const previousAnalyses=reviews.list(oid).filter(x=>x.documentId===docId&&x.sha256===doc.sha256&&
   Number.isInteger(x.page)&&!x.region);
  const entries=trans(()=>{
   const created=[];
   for(const page of wanted){
    if(exists.has(page))continue;
    const old=previousAnalyses.find(x=>x.page===page);
    const state=old?"awaiting_review":"queued";
    const payload={page,source:{documentId:doc.id,name:doc.name,sha256:doc.sha256,
     kind:doc.kind},indexId:index.id,status:state,analysisId:old?.id||null,
     attempts:0,lastError:"",createdAt:clock(),updatedAt:clock()};
    const row=database.createEntity(oid,SECTION,{record_type:"sheet_task",
     title:doc.name+" · лист "+page,data:payload});
    if(!row)throw Error("Не удалось создать задание листа");
    if(!database.createEntity(oid,EVENTS,{record_type:"sheet_event",parent_id:row.id,
     title:"Лист "+page+" · добавлен в очередь",data:{taskId:row.id,event:"enqueued",
      at:clock(),status:state,analysisId:old?.id||null}}))
     throw Error("Не удалось сохранить историю добавления листа");
    created.push(row.id)
   }
   return created
  });
  emit(oid);return{added:entries.length,skipped:wanted.size-entries.length,taskIds:entries}
 }
 function retry(id,taskId,{role}={}){
  const oid=object(id);requireEditor({role});
  if(running.has(oid))throw Error("Дождитесь завершения текущего листа");
  const row=record(oid,taskId),v=publicRow(row,docs(oid),new Map(reviews.list(oid).map(x=>[x.id,x])));
  if(!["failed","needs_model","interrupted","outdated"].includes(v.status))
   throw Error("Повтор разрешён только для прерванного или неудачного задания");
  if(v.status==="outdated")throw Error("Источник PDF изменился. Повторно добавьте лист из нового индекса");
  const next=update(oid,row,{status:"queued",lastError:""},"retry");
  emit(oid);return{id:next.id,status:"queued"}
 }
 function cancel(id,taskId,{role}={}){
  const oid=object(id);requireEditor({role});
  if(running.has(oid))throw Error("Остановите очередь перед изменением заданий");
  const row=record(oid,taskId);
  if(["confirmed","rejected","awaiting_review"].includes(row.data?.status))
   throw Error("Результаты анализа уже существуют; отмена не удаляет инженерную проверку");
  update(oid,row,{status:"canceled"},"canceled");emit(oid);return true
 }
 function pause(id,{role}={}){
  const oid=object(id);requireEditor({role});
  if(running.has(oid))stopping.add(oid);
  emit(oid);return{requested:running.has(oid),message:"Очередь остановится после текущего листа"}
 }
 async function process(oid){
  try{
   while(!stopping.has(oid)){
    const entry=rows(oid).find(x=>x.data?.status==="queued");
    if(!entry)break;
    const doc=docs(oid).get(entry.data?.source?.documentId);
    if(!sourceOk(entry,doc)){update(oid,entry,{status:"outdated",lastError:"Исходный PDF удалён либо SHA-256 изменён"},"invalid_source");emit(oid);continue}
    if(engine.status?.().state!=="ready"){
     update(oid,entry,{status:"needs_model",lastError:"Установите и запустите локальную Qwen-модель в настройках ИИ"},"model_required");
     emit(oid);break
    }
    // The queue can run with Qwen alone. PaddleOCR augments text and tables when installed,
    // but its absence must not block first-sheet offline PDF recognition.
    const current=update(oid,entry,{status:"running",attempts:(Number(entry.data?.attempts)||0)+1,lastError:""},"started");
    emit(oid);
    try{
     const known=reviews.list(oid).find(x=>x.documentId===doc.id&&x.sha256===doc.sha256&&
      x.page===current.data.page&&!x.region);
     const result=known?{id:known.id}:await analysis.analyzePdf(oid,doc.id,current.data.page);
     update(oid,current,{status:"awaiting_review",analysisId:result.id,lastError:""},"awaiting_engineer");
    }catch(error){
     const reason=String(error?.message||error).slice(0,600);
     update(oid,current,{status:engine.status?.().state!=="ready"?"needs_model":"failed",lastError:reason},"failed");
     if(engine.status?.().state!=="ready"){emit(oid);break}
    }
    emit(oid)
   }
  }finally{running.delete(oid);stopping.delete(oid);emit(oid)}
 }
 function start(id,{role}={}){
  const oid=object(id);requireEditor({role});
  if(running.has(oid))return{started:false,alreadyRunning:true};
  const queued=rows(oid).some(x=>x.data?.status==="queued");
  if(!queued)return{started:false,reason:"Нет листов в очереди. Для задач «Ожидает модель» нажмите «Повторить» после запуска ИИ."};
  stopping.delete(oid);
  const task=Promise.resolve().then(()=>process(oid)).catch(error=>{
   // If the local DB failed during processing, a persisted "running" task
   // remains safely recoverable as "interrupted" on the next manual start.
   try{onProgress({objectId:oid,error:String(error?.message||error).slice(0,500)})}catch{}
  });
  running.set(oid,task);
  emit(oid);
  return{started:true,message:"Листы обрабатываются по одному. Результаты будут отправлены на проверку инженеру."}
 }
 function history(id,taskId){
  const oid=object(id),row=record(oid,taskId);
  return database.listEntity(oid,EVENTS).filter(x=>x.record_type==="sheet_event"&&
   Number(x.parent_id)===row.id).map(x=>({id:x.id,...x.data}))
 }
 return{list,summary,enqueue,retry,cancel,pause,start,history};
}
module.exports={createAiWorkflow};
