"use strict";
/* Source-bound AI montage drafts. These are explicitly UNCONFIRMED data.
 * Draft changes and their immutable revision events share one SQLite transaction.
 * No scheme placements or manually approved records are modified. */
const crypto=require("node:crypto");
const VALID_TYPES=new Set(["column","beam","brace","unknown"]);
const text=(v,max)=>String(v??"").trim().slice(0,max);
const markKey=v=>text(v,90).toLocaleUpperCase("ru-RU")
 .replace(/K/g,"К").replace(/B/g,"В").replace(/P/g,"Р").replace(/C/g,"С").replace(/\s+/g,"");
const positive=(v,label)=>{
 const n=Number(v);
 if(!Number.isSafeInteger(n)||n<1)throw Error("Неверный "+label);
 return n
};
const digest=obj=>crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
function identity(candidate){
 if(!candidate||typeof candidate!=="object")throw Error("Не указан источник черновика");
 const source=candidate.source;
 const documentId=positive(source?.documentId,"ID чертежа"),
  page=positive(source?.page,"номер листа");
 const sha256=text(source?.sha256,100).toLowerCase();
 if(!/^[0-9a-f]{64}$/.test(sha256))throw Error("Неверная контрольная сумма PDF");
 const mark=text(candidate.mark,45);
 if(!mark||!markKey(mark))throw Error("Не указана марка");
 const extractedType=text(candidate.type,40);
 if(!VALID_TYPES.has(extractedType))throw Error("Неизвестный исходный тип");
 // The extracted type is immutable in this identity; corrected type is data.
 const key=digest([documentId,sha256,page,markKey(mark),extractedType]);
 return{key,documentId,page,sha256,mark,extractedType};
}
function parseValues(input){
 if(!input||typeof input!=="object"||Array.isArray(input))
  throw Error("Поля черновика должны быть объектом");
 const type=text(input.type,40);
 if(!VALID_TYPES.has(type))throw Error("Неверный тип конструкции");
 const val=x=>{
  const raw=input[x];
  if(raw===null||raw===undefined||String(raw).trim()==="")return null;
  const n=Number(String(raw).trim().replace(/−/g,"-").replace(",","."));
  if(!Number.isSafeInteger(n)||Math.abs(n)>100000000)
   throw Error("Отметка "+x+" должна быть целым числом миллиметров");
  return n
 };
 const axis=x=>{
  const v=text(input[x],18);
  if(/[\x00-\x1f<>]/.test(v))throw Error("Некорректная ось "+x);
  return v
 };
 return{type,axisX:axis("axisX"),axisY:axis("axisY"),
  endAxisX:axis("endAxisX"),endAxisY:axis("endAxisY"),
  z0Mm:val("z0Mm"),z1Mm:val("z1Mm")}
}
function createDraftService({database,verifyDocument}={}){
 if(!database?.transaction||!database?.listEntity||
  !database?.createEntity||!database?.updateEntity||!database?.getObject)
  throw Error("Черновики ИИ требуют транзакционную SQLite");
 function checkObject(objectId){
  const id=positive(objectId,"объект");
  if(!database.getObject(id))throw Error("Объект не найден");
  return id
 }
 function confirmOrigin(objectId,ref){
  const docs=database.listEntity(objectId,"ai-documents"),
    doc=docs.find(r=>r.record_type==="document"&&Number(r.id)===ref.documentId);
  if(!doc||doc.data?.archived===true||doc.data?.sha256!==ref.sha256)
   throw Error("Исходный PDF отсутствует, архивирован или изменён");
  if(typeof verifyDocument==="function"&&!verifyDocument(objectId,ref.documentId))
   throw Error("Оригинал PDF не прошёл проверку SHA-256");
  const page=database.listEntity(objectId,"ai-pdf-index").some(r=>
   r.record_type==="pdf_text_index"&&
   Number(r.data?.source?.documentId)===ref.documentId&&
   r.data?.source?.sha256===ref.sha256&&
   (r.data?.pages||[]).some(p=>Number(p.page)===ref.page));
  if(!page)throw Error("Нет индекса PDF для выбранного листа");
  return doc
 }
 function checkMark(objectId,ref){
  const matches=database.listEntity(objectId,"marks").filter(r=>
   markKey(r.data?.mark||r.title)===markKey(ref.mark));
  if(matches.length!==1)throw Error(matches.length?
   "Обозначение есть в нескольких шифрах — черновик требует уточнения":
   "Марка отсутствует в ведомости");
  return matches[0]
 }
 function list(objectId){
  const id=checkObject(objectId),docs=database.listEntity(id,"ai-documents");
  const byId=new Map(docs.map(r=>[Number(r.id),r]));
  return database.listEntity(id,"ai-mounting-drafts")
   .filter(r=>r.record_type==="montage_draft")
   .map(r=>{
    const d=r.data||{},src=d.source||{},doc=byId.get(Number(src.documentId));
    return{id:r.id,revision:d.revision||0,key:d.key,mark:d.mark,
     extractedType:d.extractedType,markId:d.markId,
     source:src,values:d.values,updatedAt:d.updatedAt,
     stale:!doc||doc.record_type!=="document"||doc.data?.archived===true||
      doc.data?.sha256!==src.sha256}
   })
 }
 function save(objectId,{candidate,values,expectedRevision=0}={}){
  const id=checkObject(objectId),ref=identity(candidate),
    parsed=parseValues(values),revision=Number(expectedRevision);
  if(!Number.isSafeInteger(revision)||revision<0)
   throw Error("Неверный номер ревизии");
  if(typeof candidate?.origin!=="string"||!["text_layer","filename_only"].includes(candidate.origin))
   throw Error("Черновик должен быть связан с реальным PDF");
  confirmOrigin(id,ref);
  const mark=checkMark(id,ref);
  return database.transaction(()=>{
   const drafts=database.listEntity(id,"ai-mounting-drafts")
    .filter(r=>r.record_type==="montage_draft"&&r.data?.key===ref.key);
   if(drafts.length>1)throw Error("В базе есть повторяющиеся черновики. Требуется проверка");
   const existing=drafts[0]||null,prior=Number(existing?.data?.revision||0);
   if(prior!==revision)
    throw Error("Черновик уже изменён в другом окне. Обновите данные перед сохранением");
   const changedAt=new Date().toISOString(),record={
    key:ref.key,mark:ref.mark,extractedType:ref.extractedType,markId:mark.id,
    source:{documentId:ref.documentId,sha256:ref.sha256,page:ref.page},
    values:parsed,origin:candidate.origin,status:"requires_review",
    revision:prior+1,updatedAt:changedAt,createdAt:existing?.data?.createdAt||changedAt
   };
   const updated=existing?
    database.updateEntity(id,"ai-mounting-drafts",existing.id,{
     record_type:"montage_draft",title:ref.mark,data:record}):
    database.createEntity(id,"ai-mounting-drafts",{
     record_type:"montage_draft",title:ref.mark,data:record});
   if(!updated?.id)throw Error("Не удалось записать черновик");
   const audit=database.createEntity(id,"ai-mounting-draft-history",{
    record_type:"montage_draft_revision",title:ref.mark,
    data:{draftId:updated.id,key:ref.key,revision:record.revision,
     source:record.source,markId:record.markId,values:parsed,
     savedAt:changedAt,decision:"requires_review"}
   });
   if(!audit?.id)throw Error("Не удалось сохранить историю исправления");
   return{id:updated.id,...record}
  })
 }
 return{list,save}
}
module.exports={createDraftService,identity,parseValues};
