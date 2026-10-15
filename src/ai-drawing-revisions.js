"use strict";
/* KМ/КМД explicit page revision register.
 * Never assumes that a newer filename or later upload is the current issue.
 * Active set is a complete list of authorized pages for one discipline.
 */
const KINDS=new Set(["КМ","КМД"]);
const STATUS=new Set(["draft","active","superseded"]);
const SHEETS="ai-drawing-sheet-links",SETS="ai-drawing-sets",AUDIT="ai-drawing-set-history";
function createDrawingRevisions({database,documents,pdfIndex,clock=()=>new Date().toISOString()}={}){
 if(!database||!documents||!pdfIndex)throw Error("Для ревизий нужны база, PDF и индекс листов");
 const oid=n=>{const x=Number(n);if(!Number.isSafeInteger(x)||x<1||!database.getObject(x))throw Error("Объект не найден");return x};
 const int=(v,label,min=1,max=2000)=>{
  if(v==null||v===""||typeof v==="boolean"||!Number.isSafeInteger(Number(v))||Number(v)<min||Number(v)>max)
   throw Error("Укажите корректное целое число: "+label);
  return Number(v)
 };
 const label=(v,label,max=100)=>{
  if(typeof v!=="string"||!v.trim()||v.trim().length>max)throw Error("Укажите "+label);
  return v.trim().replace(/\s+/g," ")
 };
 const checks=ctx=>{if(!["admin","engineer"].includes(ctx?.role))
  throw Error("Комплект может редактировать только инженер или администратор")};
 const withTx=fn=>{
  if(typeof database.transaction!=="function")throw Error("Требуются транзакции SQLite");
  return database.transaction(fn)
 };
 const all=id=>database.listEntity(oid(id),SETS).filter(x=>x.record_type==="drawing_set");
 const pages=id=>database.listEntity(oid(id),SHEETS).filter(x=>x.record_type==="drawing_page");
 const key=v=>String(v||"").trim().toLocaleUpperCase("ru-RU");
 function findSet(id,setId){
  const n=int(setId,"ID комплекта",1,1e9),row=database.getEntity(oid(id),SETS,n);
  if(!row||row.record_type!=="drawing_set")throw Error("Комплект не найден в этом объекте");
  return row
 }
 const docMap=id=>new Map(documents.list(id).map(x=>[x.id,x]));
 const indexMap=id=>pdfIndex.list(id);
 function getSheets(id,setId){
  const sid=int(setId,"ID комплекта",1,1e9);
  const docs=docMap(id);
  return pages(id).filter(x=>x.data?.setId===sid).map(x=>{
   const d=x.data||{},doc=docs.get(Number(d.documentId));
   const valid=Boolean(doc&&doc.exists&&doc.ext===".pdf"&&doc.kind===d.kind&&
    doc.sha256===d.sha256&&
    (typeof documents.verify!=="function"||documents.verify(id,doc.id)));
   return{id:x.id,setId:sid,sheetCode:String(d.sheetCode||""),
    documentId:d.documentId,page:d.page,sourceName:String(d.sourceName||""),
    sha256:String(d.sha256||""),kind:String(d.kind||""),
    valid,reason:valid?"":"PDF отсутствует, тип изменился или SHA-256 не совпадает"}
  })
 }
 function list(id){
  const o=oid(id);
  return all(o).map(x=>({id:x.id,kind:x.data.kind,label:x.data.label,
   issue:x.data.issue,status:STATUS.has(x.data.status)?x.data.status:"draft",
   revision:x.data.revision||0,sheets:getSheets(o,x.id),
   createdAt:x.created_at,approvedBy:x.data.approvedBy||null,
   approvedAt:x.data.approvedAt||null,previousSetId:x.data.previousSetId||null}))
 }
 function active(id,kind){
  if(!KINDS.has(kind))throw Error("Некорректный тип комплекта");
  const found=all(id).filter(x=>x.data?.kind===kind&&x.data?.status==="active");
  if(found.length>1)throw Error("Обнаружено несколько действующих комплектов "+kind);
  return found[0]||null
 }
 function sourceState(id,source){
  const o=oid(id),src=source||{},docs=docMap(o);
  const doc=docs.get(Number(src.documentId)),kind=src.kind||doc?.kind||null;
  if(!KINDS.has(kind))return{current:false,reason:"Неизвестный тип КМ/КМД",state:"invalid"};
  if(!doc||!doc.exists||doc.ext!==".pdf"||doc.sha256!==src.sha256||doc.kind!==kind||
   (typeof documents.verify==="function"&&!documents.verify(o,doc.id)))
   return{current:false,reason:"Оригинальный PDF отсутствует или фактический SHA-256 не совпадает",state:"missing"};
  const set=active(o,kind);
  if(!set)return{current:true,controlled:false,state:"uncontrolled",
   reason:"Для этого типа чертежей ещё не назначен действующий комплект"};
  const page=Number(src.page);
  const found=getSheets(o,set.id).some(x=>x.valid&&x.documentId===doc.id&&
   x.sha256===src.sha256&&x.page===page);
  return{current:found,controlled:true,state:found?"active":"superseded",
   setId:set.id,issue:set.data.issue,reason:found?"":"Лист не входит в действующий комплект "+kind}
 }
 function isCurrent(id,source){return sourceState(id,source).current}
 function setHistory(id,setId){
  const o=oid(id),set=findSet(o,setId);
  return database.listEntity(o,AUDIT).filter(x=>
   x.record_type==="drawing_set_change"&&Number(x.parent_id)===set.id)
   .map(x=>({id:x.id,...x.data}))
 }
 function log(o,setId,event,previous,next,role){
  const row=database.createEntity(o,AUDIT,{
   record_type:"drawing_set_change",parent_id:setId,
   title:"Комплект "+setId+" · "+event,
   data:{event,previous,next,reviewedBy:role,at:clock()}
  });
  if(!row)throw Error("Не удалось записать журнал комплекта")
 }
 function createSet(id,cmd,{role}={}){
  const o=oid(id);checks({role});
  if(!cmd||!KINDS.has(cmd.kind))throw Error("Выберите КМ или КМД");
  const issue=label(cmd.issue,"обозначение ревизии",50),
   title=label(cmd.label,"название комплекта",130);
  if(all(o).some(x=>x.data.kind===cmd.kind&&key(x.data.issue)===key(issue)))
   throw Error("Ревизия "+issue+" для "+cmd.kind+" уже зарегистрирована");
  return withTx(()=>{
   const data={kind:cmd.kind,issue,label:title,status:"draft",revision:1,
    approvedAt:null,approvedBy:null,createdBy:role,createdAt:clock()};
   const set=database.createEntity(o,SETS,{record_type:"drawing_set",title,data});
   if(!set)throw Error("Не удалось создать комплект");
   log(o,set.id,"created",null,data,role);
   return{id:set.id,kind:cmd.kind,issue,status:"draft"}
  })
 }
 function addSheets(id,setId,items,{role}={}){
  const o=oid(id);checks({role});
  const set=findSet(o,setId);
  if(set.data.status!=="draft")throw Error("Редактировать листы можно только у чернового комплекта");
  if(!Array.isArray(items)||!items.length||items.length>80)
   throw Error("Добавьте от 1 до 80 листов за один раз");
  const known=getSheets(o,set.id),used=new Set(known.map(x=>key(x.sheetCode)));
  const files=new Set(known.map(x=>x.documentId+":"+x.page));
  const docList=docMap(o),idxs=indexMap(o),normalized=[];
  for(const entry of items){
   const docId=int(entry.documentId,"ID документа",1,1e9),pg=int(entry.page,"номер листа"),
    name=label(entry.sheetCode,"обозначение листа",80);
   const doc=docList.get(docId);
   if(!doc||!doc.exists||doc.kind!==set.data.kind||doc.ext!==".pdf")
    throw Error("Лист должен относиться к PDF "+set.data.kind+" текущего объекта");
   const idx=idxs.find(x=>x.documentId===docId&&x.sourceSha256===doc.sha256);
   if(!idx||!idx.pages.some(x=>x.page===pg))
    throw Error("Для листа "+pg+" требуется индекс исходного PDF с совпадающим SHA-256");
   const idKey=docId+":"+pg;
   if(used.has(key(name)))throw Error("Обозначение листа "+name+" повторяется внутри комплекта");
   if(files.has(idKey))throw Error("Один физический лист нельзя включать дважды");
   used.add(key(name));files.add(idKey);
   normalized.push({setId:set.id,kind:set.data.kind,sheetCode:name,documentId:docId,
    page:pg,sha256:doc.sha256,sourceName:doc.name})
  }
  if(known.length+normalized.length>500)throw Error("В одном комплекте допускается не более 500 листов");
  return withTx(()=>{
   const ids=[];
   for(const data of normalized){
    const row=database.createEntity(o,SHEETS,{record_type:"drawing_page",
     parent_id:set.id,title:data.sheetCode,data});
    if(!row)throw Error("Не удалось зарегистрировать лист");
    ids.push(row.id)
   }
   const old=set.data,next={...old,revision:(old.revision||0)+1};
   database.updateEntity(o,SETS,set.id,{record_type:"drawing_set",title:set.title,data:next});
   log(o,set.id,"sheets_added",old,{...next,added:normalized},role);
   return{added:ids.length,ids}
  })
 }
 function removeSheet(id,setId,sheetId,{role}={}){
  const o=oid(id);checks({role});
  const set=findSet(o,setId);
  if(set.data.status!=="draft")throw Error("Листы действующего комплекта нельзя менять");
  const row=database.getEntity(o,SHEETS,int(sheetId,"ID листа",1,1e9));
  if(!row||row.record_type!=="drawing_page"||row.data?.setId!==set.id)
   throw Error("Лист не относится к выбранному комплекту");
  return withTx(()=>{
   if(!database.deleteEntity(o,SHEETS,row.id))throw Error("Удаление листа не выполнено");
   const d={...set.data,revision:(set.data.revision||0)+1};
   database.updateEntity(o,SETS,set.id,{record_type:"drawing_set",title:set.title,data:d});
   log(o,set.id,"sheet_removed",set.data,{...d,removed:row.data},role);
   return true
  })
 }
 function activate(id,setId,expectedRevision,{role}={}){
  const o=oid(id);checks({role});
  const set=findSet(o,setId);
  if(set.data.status!=="draft")throw Error("Активировать можно только черновой комплект");
  if(expectedRevision!==set.data.revision)throw Error("Редакция комплекта устарела, обновите список");
  const sheets=getSheets(o,set.id);
  if(!sheets.length)throw Error("Комплект пустой: сначала добавьте листы");
  if(sheets.some(x=>!x.valid))throw Error("Некоторые исходные PDF удалены или изменены");
  const prior=active(o,set.data.kind);
  return withTx(()=>{
   if(prior){
    const old=prior.data,next={...old,status:"superseded",supersededAt:clock(),supersededBy:set.id};
    if(!database.updateEntity(o,SETS,prior.id,{record_type:"drawing_set",title:prior.title,data:next}))
     throw Error("Не удалось закрыть предыдущий комплект");
    log(o,prior.id,"superseded",old,next,role)
   }
   const updated={...set.data,status:"active",revision:set.data.revision+1,
    previousSetId:prior?.id||null,approvedAt:clock(),approvedBy:role};
   if(!database.updateEntity(o,SETS,set.id,{record_type:"drawing_set",title:set.title,data:updated}))
    throw Error("Не удалось утвердить комплект");
   log(o,set.id,"activated",set.data,updated,role);
   return{id:set.id,kind:set.data.kind,status:"active",
    previousSetId:prior?.id||null,sheetCount:sheets.length}
  })
 }
 // Follow evidence through derived reviews and queued sheets; skip unrelated photos.
 function evidenceSources(o,section,row,docs){
  const d=row.data||{};
  let candidates;
  if(section==="ai-km-kmd-comparison")
   candidates=[d.km?.source,d.kmd?.source];
  else if(section==="ai-structured-reviews"){
   const analysis=database.getEntity(o,"ai-analysis",Number(d.analysisId||row.parent_id));
   candidates=analysis?.record_type==="image_analysis"?[analysis.data?.source]:[];
  }else if(section==="ai-workflow-tasks")
   candidates=d.source?[{...d.source,page:d.page}]:[];
  else candidates=d.source?[d.source]:[];
  return candidates.filter(src=>src&&KINDS.has(src.kind||docs.get(Number(src.documentId))?.kind))
 }
 function previewActivation(id,setId){
  const o=oid(id),target=findSet(o,setId);
  if(target.data.status!=="draft")throw Error("Прогноз доступен только для чернового комплекта");
  const replacements=getSheets(o,target.id),files=docMap(o);
  const relevant=(src)=>{
   const doc=files.get(Number(src?.documentId)),kind=src?.kind||doc?.kind;
   if(kind!==target.data.kind)return null;
   return replacements.some(x=>x.valid&&x.documentId===Number(src.documentId)&&
    x.sha256===src.sha256&&x.page===Number(src.page))
  };
  const sections=["ai-analysis","ai-mark-quantities","ai-kmd-materials",
   "ai-kmd-joints","ai-kmd-connection-items","ai-km-kmd-comparison",
   "ai-assembly-placement","ai-assembly-attachments","ai-structured-reviews","ai-workflow-tasks"];
  const affected=[];
  for(const section of sections)for(const row of database.listEntity(o,section)){
   const sources=evidenceSources(o,section,row,files);
   const checks=sources.map(relevant).filter(x=>x!==null);
   if(checks.includes(false))affected.push({section,id:row.id,title:String(row.title||"")})
  }
  return{setId:target.id,kind:target.data.kind,
   pages:replacements.length,invalidPages:replacements.filter(x=>!x.valid).length,
   affectedCount:affected.length,affected,
   warning:"После активации старые подтверждения на исключённых листах перестанут учитываться. Архив и история сохранятся."}
 }
 function impact(id){
  const o=oid(id),sections=[
   ["ai-analysis","Анализы ИИ"],["ai-mark-quantities","Количество марок"],
   ["ai-kmd-materials","Детали металла"],["ai-kmd-joints","Узлы"],
   ["ai-kmd-connection-items","Метизы/швы"],["ai-km-kmd-comparison","Сравнения КМ/КМД"],
   ["ai-assembly-placement","3D-размещения"],["ai-assembly-attachments","3D-привязки"],
   ["ai-structured-reviews","Проверенные предложения ИИ"],["ai-workflow-tasks","Очередь распознавания"]];
  const files=docMap(o),output=[];
  for(const [section,title] of sections){
   for(const row of database.listEntity(o,section)){
    const srcs=evidenceSources(o,section,row,files);
    const matches=srcs.map(s=>sourceState(o,s));
    if(!matches.length)continue;
    const outdated=matches.some(s=>!s.current);
    output.push({section,title,id:row.id,recordTitle:String(row.title||""),
     sourceCount:srcs.length,outdated,reasons:matches.filter(x=>!x.current).map(x=>x.reason),
     unchecked:matches.some(x=>x.state==="uncontrolled")})
   }
  }
  return{total:output.length,outdated:output.filter(x=>x.outdated).length,
   uncontrolled:output.filter(x=>x.unchecked).length,records:output,
   note:"Отчёт только отмечает влияние смены ревизий; оригиналы, истории и решения не удаляются"}
 }
 return{list,active,getSheets,createSet,addSheets,removeSheet,activate,sourceState,isCurrent,
  impact,previewActivation,history:setHistory};
}
module.exports={createDrawingRevisions};
