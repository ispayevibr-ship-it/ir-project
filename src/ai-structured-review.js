"use strict";
/* Human review of per-position OCR/VLM proposals, isolated from production records.
   Every candidate is derived from immutable raw AI output and original PDF SHA.
 */
const structured=require("./ai-structured-extraction");
const STATUSES=new Set(["requires_review","confirmed","rejected"]);
const STRINGS=new Set(["mark","cipher","secondaryCipher","position","specPosition",
 "drawingRevision","steelGrade","profile","partType","jointCode","fastenerKind","standard"]);
const INTS=new Set(["quantity","partCount","perJoint"]);
const NUMS=new Set(["unitMassKg","lengthMm","widthMm","thicknessMm","diameterMm","weldSizeMm"]);
function createStructuredReviews({database,documents,revisions=null,clock=()=>new Date().toISOString()}={}){
 if(!database||!documents)throw Error("Требуются база и локальные документы КМД");
 const oid=id=>{const n=Number(id);if(!Number.isSafeInteger(n)||n<1||!database.getObject(n))throw Error("Объект не найден");return n};
 const positive=(v,field,integer)=>{
  if(v==null||v==="")return null;
  if(typeof v==="boolean")throw Error("Некорректное значение «"+field+"»");
  const s=String(v).trim().replace(",",".");
  if(!/^\d+(?:\.\d+)?$/.test(s))throw Error("«"+field+"» должно быть числом");
  const n=Number(s);
  if(!Number.isFinite(n)||n<=0||n>10000000||integer&&(!Number.isSafeInteger(n)||n>1000000))
   throw Error("Некорректное количество или размер «"+field+"»");
  return n
 };
 const corrections=(proposal,input)=>{
  const out={...proposal.data};
  if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Нужно указать проверенные значения");
  for(const [key,val] of Object.entries(input)){
   if(STRINGS.has(key)){
    if(typeof val!=="string"||val.length>300)throw Error("Недопустимое поле «"+key+"»");
    out[key]=val.trim().replace(/\s+/g," ")
   }else if(INTS.has(key))out[key]=positive(val,key,true);
   else if(NUMS.has(key))out[key]=positive(val,key,false);
   else throw Error("Недопустимое поле коррекции «"+key+"»")
  }
  return out
 };
 const validate=(proposal,values)=>{
  if(!values.mark)throw Error("Подтверждение требует обозначение марки");
  if(!proposal.evidence.quote)throw Error("Подтвердите по исходному листу: нет цитаты модели");
  if(proposal.type==="mark_quantity"){
   if(!values.quantity||!Number.isSafeInteger(values.quantity))
    throw Error("Укажите проверенное количество, шт.");
   if(!values.specPosition)throw Error("Укажите позицию спецификации КМД")
  }else if(proposal.type==="steel_part"){
   if(!values.position)throw Error("Укажите обозначение отдельной детали");
   if(!values.partCount||!Number.isSafeInteger(values.partCount))
    throw Error("Укажите число деталей на одну отправочную марку")
  }else if(proposal.type==="connection"){
   if(!values.jointCode)throw Error("Укажите обозначение узла")
  }else if(proposal.type==="dimension"){
   if(!["lengthMm","widthMm","thicknessMm","diameterMm"].some(k=>values[k]!=null))
    throw Error("Укажите подтверждённый размер")
  }
 };
 const analysisRows=id=>database.listEntity(id,"ai-analysis").filter(x=>x.record_type==="image_analysis");
 const reviews=id=>database.listEntity(id,"ai-structured-reviews").filter(x=>x.record_type==="structured_review");
 const sourceValid=(id,a)=>{
  const src=a?.data?.source||{},doc=documents.list(id).find(x=>x.id===Number(src.documentId));
  return Boolean(doc&&doc.exists&&["КМ","КМД"].includes(doc.kind)&&doc.sha256===src.sha256&&
   doc.ext===".pdf"&&Number.isSafeInteger(Number(src.page))&&Number(src.page)>0&&
   (!revisions||revisions.isCurrent(id,src)))
 };
 function sources(id,analysisId){
  const row=analysisRows(id).find(x=>x.id===Number(analysisId));
  if(!row)throw Error("Анализ PDF не найден в этом объекте");
  const analysis=structured.extract(row.data?.raw);
  return{row,analysis};
 }
 function findReview(id,analysisId,index){
  const matches=reviews(id).filter(x=>x.data?.analysisId===analysisId&&x.data?.index===index);
  if(matches.length>1)throw Error("Для одного предложения ИИ обнаружено несколько инженерных решений. Редактирование заблокировано до устранения конфликта");
  return matches[0]||null
 }
 function view(id,a,proposal,review,ambiguous=false){
  const src=a.data?.source||{},stored=review?.data||{};
  const fpOk=!ambiguous&&(!review||stored.fingerprint===proposal.fingerprint);
  const valid=sourceValid(id,a);
  const values=fpOk&&stored.corrected?stored.corrected:proposal.data;
  const status=fpOk&&STATUSES.has(stored.status)?stored.status:"requires_review";
  return{analysisId:a.id,index:proposal.index,type:proposal.type,
   fingerprint:proposal.fingerprint,values,original:proposal.data,
   evidence:proposal.evidence,unit:proposal.unit,
   source:{documentId:src.documentId,name:String(src.name||""),
    kind:String(src.kind||""),sha256:String(src.sha256||""),
    page:src.page??null,region:src.region||null},
   sourceValid:valid,reviewValid:fpOk,
   status:valid&&fpOk?status:"requires_review",
   approved:status==="confirmed"&&valid&&fpOk,revision:Number(stored.revision)||0,
   comment:String(stored.comment||""),reviewedBy:stored.reviewedBy||null,
   reviewedAt:stored.reviewedAt||null,
   errors:proposal.errors,
   warnings:ambiguous?[...proposal.warnings,"Несколько инженерных решений для одного предложения — требуется разбор конфликта"]:proposal.warnings,
   conflictingReviews:ambiguous,requiresReview:true,reviewId:ambiguous?null:review?.id||null}
 }
 function list(id){
  const target=oid(id),allReviews=new Map();
  for(const row of reviews(target)){
   const key=row.data?.analysisId+":"+row.data?.index;
   if(!allReviews.has(key))allReviews.set(key,[]);
   allReviews.get(key).push(row)
  }
  const result=[];
  for(const row of analysisRows(target)){
   const records=structured.extract(row.data?.raw).records;
   for(const proposal of records){
    const matching=allReviews.get(row.id+":"+proposal.index)||[];
    result.push(view(target,row,proposal,matching[0]||null,matching.length>1))
   }
  }
  return result
 }
 function summary(id){
  const rows=list(id);
  return{total:rows.length,confirmed:rows.filter(x=>x.approved).length,
   requiresReview:rows.filter(x=>!x.approved&&x.status!=="rejected").length,
   rejected:rows.filter(x=>x.status==="rejected").length,
   invalidSources:rows.filter(x=>!x.sourceValid).length,
   conflictingReviews:rows.filter(x=>x.conflictingReviews).length,
   byType:Object.fromEntries([...new Set(rows.map(x=>x.type))].map(k=>[k,rows.filter(x=>x.type===k).length])),
   complete:false,meaning:"Предложения локального ИИ; не действующая ведомость отправочных марок"}
 }
 function save(id,analysisId,index,command,{role}={}){
  const target=oid(id);
  if(!["admin","engineer"].includes(role))throw Error("Проверять структурированные данные может только инженер или администратор");
  const analysisNo=Number(analysisId),ix=Number(index);
  if(!Number.isSafeInteger(analysisNo)||analysisNo<1||!Number.isSafeInteger(ix)||ix<0||ix>=80)
   throw Error("Некорректный ID предложения");
  const {row,analysis}=sources(target,analysisNo),proposal=analysis.records.find(x=>x.index===ix);
  if(!proposal)throw Error("Предложение отсутствует в сохранённом ответе модели");
  if(!command||!STATUSES.has(command.status))throw Error("Выберите статус проверки");
  if(!sourceValid(target,row))throw Error("Исходный PDF изменён или отсутствует: подтвердить предложение нельзя");
  const prior=findReview(target,analysisNo,ix),rev=Number(prior?.data?.revision)||0;
  if(command.expectedRevision!==rev)throw Error("Редакция проверки устарела. Обновите список");
  if(prior&&prior.data.fingerprint!==proposal.fingerprint)
   throw Error("Предложение модели изменилось; старое подтверждение недействительно");
  const values=corrections(proposal,command.values||{});
  if(command.status==="confirmed")validate(proposal,values);
  const comment=String(command.comment??"").trim();
  if(comment.length>2000)throw Error("Комментарий инженера слишком длинный");
  if(command.status==="confirmed"&&(proposal.uncertain||proposal.warnings.length)&&!comment)
   throw Error("При сомнениях модели требуется комментарий о проверке оригинала");
  const updated={analysisId:analysisNo,index:ix,type:proposal.type,fingerprint:proposal.fingerprint,
   status:command.status,corrected:values,comment,revision:rev+1,
   reviewedAt:clock(),reviewedBy:role,sourceSha256:row.data?.source?.sha256,
   origin:"engineer_verified_structured_model_proposal"};
  if(typeof database.transaction!=="function")throw Error("Необходимо атомарное сохранение SQLite");
  return database.transaction(()=>{
   const data={record_type:"structured_review",parent_id:row.id,
    title:"Предложение № "+(ix+1)+" / анализ "+analysisNo,data:updated};
   const saved=prior?database.updateEntity(target,"ai-structured-reviews",prior.id,data):
    database.createEntity(target,"ai-structured-reviews",data);
   if(!saved)throw Error("Не удалось сохранить решение");
   const audit=database.createEntity(target,"ai-structured-review-history",{
    record_type:"structured_review_change",parent_id:saved.id,
    title:"Структурная проверка · редакция "+updated.revision,
    data:{analysisId:analysisNo,index:ix,revision:updated.revision,
     previous:prior?.data||null,current:updated}
   });
   if(!audit)throw Error("Не удалось сохранить историю");
   return{...view(target,row,proposal,saved),historyId:audit.id}
  })
 }
 function history(id,analysisId,index){
  const target=oid(id),review=findReview(target,Number(analysisId),Number(index));
  if(!review)return[];
  return database.listEntity(target,"ai-structured-review-history")
   .filter(x=>x.record_type==="structured_review_change"&&Number(x.parent_id)===review.id)
   .map(x=>({id:x.id,...x.data}))
 }
 return{list,summary,save,history};
}
module.exports={createStructuredReviews};
