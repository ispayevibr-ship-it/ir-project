"use strict";
/* Independent AI engineering review; raw AI data never overwritten.
   Confirmation is not quantity certification and never mutates real IR marks. */
const STATUS=new Set(["requires_review","confirmed","rejected"]);
const MARK_PATTERN=/^[\p{L}\p{N}][\p{L}\p{N} ._+\-/()№]*$/u;
function createAiReview({database,revisions=null,clock=()=>new Date().toISOString()}={}){
 if(!database)throw Error("AI review requires database");
 function object(id){
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<=0||!database.getObject(n))throw Error("Объект IR Project не найден");
  return n
 }
 function record(oid,analysisId){
  const num=Number(analysisId);
  if(!Number.isSafeInteger(num)||num<=0)throw Error("Неверный номер анализа");
  const item=database.getEntity(oid,"ai-analysis",num);
  if(!item||item.record_type!=="image_analysis")throw Error("Анализ не найден в этом объекте");
  return item
 }
 function cleanMark(value){
  if(typeof value!=="string")throw Error("Марка должна быть текстом");
  const name=value.trim().replace(/\s+/g," ");
  if(name.length<1||name.length>64||!MARK_PATTERN.test(name))
   throw Error("Недопустимое обозначение марки: "+name.slice(0,80));
  return name
 }
 function markList(values){
  if(!Array.isArray(values)||values.length>80)throw Error("Допускается не более 80 марок в одном анализе");
  const set=new Set(),clean=[];
  for(const value of values){
   const mark=cleanMark(value),key=mark.toLocaleUpperCase("ru-RU");
   if(!set.has(key)){set.add(key);clean.push(mark)}
  }
  return clean
 }
 function statusFor(data){
  return STATUS.has(data?.review?.status)?data.review.status:"requires_review"
 }
 function candidate(data){
  return Array.isArray(data?.review?.marks)?data.review.marks:
   Array.isArray(data?.extracted?.marks)?data.extracted.marks:[]
 }
 function list(id){
  const oid=object(id);
  return database.listEntity(oid,"ai-analysis").filter(x=>x.record_type==="image_analysis")
   .map(x=>({
    id:x.id,sourceName:String(x.data?.source?.name||""),
    documentId:x.data?.source?.documentId??null,
    kind:String(x.data?.source?.kind||""),
    sha256:String(x.data?.source?.sha256||""),
    page:x.data?.source?.page??null,
    region:x.data?.source?.region??null,
    sourceRectPt:x.data?.source?.sourceRectPt??null,
    sourceRegion:String(x.data?.sourceRegion||""),
    status:revisions&&x.data?.source?.page&&!revisions.isCurrent(oid,x.data?.source)?"requires_review":statusFor(x.data),
    sourceValid:!revisions||!x.data?.source?.page||revisions.isCurrent(oid,x.data?.source),
    revision:Number(x.data?.review?.revision)||0,
    reviewedAt:x.data?.review?.reviewedAt||null,
    reviewedBy:x.data?.review?.reviewedBy||null,
    comment:String(x.data?.review?.comment||""),
    marks:candidate(x.data),originalMarks:Array.isArray(x.data?.extracted?.marks)?x.data.extracted.marks:[],
    notes:x.data?.extracted||null,raw:String(x.data?.raw||""),
    complete:x.data?.complete===true,finishReason:String(x.data?.finishReason||""),
    ocr:x.data?.ocr&&typeof x.data.ocr==="object"?{
     modelId:String(x.data.ocr.modelId||""),
     modelVersion:String(x.data.ocr.modelVersion||""),
     text:String(x.data.ocr.text||"").slice(0,60000),
     sourceImageSha256:String(x.data.ocr.sourceImageSha256||""),
     blocks:Array.isArray(x.data.ocr.blocks)?x.data.ocr.blocks.slice(0,600):[],
     complete:x.data.ocr.complete===true,unverified:true
    }:null,
    modelId:x.data?.modelId||x.data?.model||"",
    modelVersion:x.data?.modelVersion||null,
    createdAt:x.created_at
   }))
 }
 function confirm(objectId,analysisId,command,{role}={}){
  const oid=object(objectId),row=record(oid,analysisId);
  if(!["admin","engineer"].includes(role))throw Error("Только администратор или инженер может подтвердить результаты");
  if(!command||typeof command!=="object"||!STATUS.has(command.status))
   throw Error("Выберите действительный статус проверки");
  const previous=row.data?.review||{},revision=Number(previous.revision)||0;
  if(!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision!==revision)
   throw Error("Результат изменился в другом окне. Обновите страницу перед сохранением");
  if(command.status==="confirmed"&&revisions&&row.data?.source?.page&&!revisions.isCurrent(oid,row.data?.source))
   throw Error("Этот лист больше не входит в действующий комплект КМ/КМД");
  const updatedMarks=markList(command.marks);
  if(command.status==="confirmed"&&!updatedMarks.length)
   throw Error("Чтобы подтвердить анализ, укажите хотя бы одну проверенную марку");
  const comment=String(command.comment??"").trim();
  if(comment.length>3000)throw Error("Комментарий не может превышать 3000 символов");
  const when=clock(),next={
   status:command.status,marks:updatedMarks,comment,
   reviewedAt:when,reviewedBy:role,revision:revision+1
  };
  // Validation and both writes are kept in one SQLite transaction.
  const save=()=>{
   const data={...row.data,review:next};
   const updated=database.updateEntity(oid,"ai-analysis",row.id,{
    record_type:row.record_type,title:row.title,parent_id:row.parent_id,data
   });
   if(!updated)throw Error("Не удалось сохранить проверку");
   const history=database.createEntity(oid,"ai-review-history",{
    record_type:"review_change",parent_id:row.id,
    title:"Анализ № "+row.id+" · "+command.status,
    data:{analysisId:row.id,revision:next.revision,
     previousStatus:statusFor(row.data),status:command.status,
     previousMarks:Array.isArray(previous.marks)?previous.marks:
      Array.isArray(row.data?.extracted?.marks)?row.data.extracted.marks:[],
     marks:updatedMarks,comment,reviewedBy:role,reviewedAt:when,
     source:{...row.data?.source}}
   });
   if(!history)throw Error("Не удалось записать историю проверки");
   return{analysisId:row.id,...next,historyId:history.id}
  };
  return typeof database.transaction==="function"?database.transaction(save):save()
 }
 function history(id,analysisId){
  const oid=object(id),row=record(oid,analysisId);
  return database.listEntity(oid,"ai-review-history")
   .filter(x=>x.record_type==="review_change"&&Number(x.parent_id)===row.id)
   .map(x=>({id:x.id,...x.data}))
 }
 function register(id){
  const mentions=new Map(),rows=list(id);
  for(const record of rows){
   if(record.status!=="confirmed")continue;
   for(const value of markList(record.marks)){
    const key=value.toLocaleUpperCase("ru-RU");
    if(!mentions.has(key))mentions.set(key,{mark:value,analysisCount:0,sources:[]});
    const grouped=mentions.get(key);
    grouped.analysisCount++;
    grouped.sources.push({
     analysisId:record.id,documentId:record.documentId,
     sourceName:record.sourceName,kind:record.kind,page:record.page,
     sha256:record.sha256,region:record.region,sourceRectPt:record.sourceRectPt,
     reviewedAt:record.reviewedAt
    })
   }
  }
  return [...mentions.values()].sort((a,b)=>new Intl.Collator("ru",{numeric:true,sensitivity:"base"}).compare(a.mark,b.mark))
 }
 return{list,confirm,history,register,markList}
}
module.exports={createAiReview};
