"use strict";
/* Two-source, manually checked KM versus KMD evidence. Never treats
   a missing KM drawing or OCR proposal as verified equality. */
const STATES=new Set(["requires_review","confirmed","rejected"]);
const DISPOSITIONS=new Set(["open","agreed","correction_required","accepted_deviation"]);
const FIELDS=Object.freeze({
 mark_quantity:{label:"Количество отправочных элементов, шт.",type:"integer",unit:"шт."},
 profile:{label:"Профиль / сечение",type:"text",unit:""},
 steel_grade:{label:"Марка стали",type:"text",unit:""},
 length_mm:{label:"Длина",type:"number",unit:"мм"},
 width_mm:{label:"Ширина",type:"number",unit:"мм"},
 thickness_mm:{label:"Толщина",type:"number",unit:"мм"},
 elevation_mm:{label:"Отметка / высота",type:"number",unit:"мм"},
 mass_kg:{label:"Масса",type:"number",unit:"кг"},
 fastener_count:{label:"Количество метизов",type:"integer",unit:"шт."},
 weld_length_mm:{label:"Длина сварных швов",type:"number",unit:"мм"},
 joint_count:{label:"Число физических узлов",type:"integer",unit:"шт."},
 connection_type:{label:"Тип соединения",type:"text",unit:""},
 joint_code:{label:"Обозначение узла",type:"text",unit:""},
 drawing_revision:{label:"Изменение чертежа",type:"text",unit:""},
 other:{label:"Другая проверяемая характеристика",type:"text",unit:""}
});
const TEXT_ID=/^[\p{L}\p{N}][\p{L}\p{N} ._+\-/()№]*$/u;
function createKmKmdCompare({database,revisions=null,clock=()=>new Date().toISOString()}={}){
 if(!database)throw Error("Нужна локальная база IR Project");
 const oid=id=>{
  const value=Number(id);
  if(!Number.isSafeInteger(value)||value<1||!database.getObject(value))
   throw Error("Объект не найден");
  return value
 };
 const label=(input,field,max=120,required=false)=>{
  if(typeof input!=="string")throw Error("Поле «"+field+"» должно быть текстом");
  const value=input.trim().replace(/\s+/g," ");
  if(value.length>max||required&&!value)throw Error("Заполните поле «"+field+"»");
  return value
 };
 const identifier=(input,field,max=100)=>{
  const value=label(input,field,max,true);
  if(!TEXT_ID.test(value))throw Error("Некорректное обозначение «"+field+"»");
  return value
 };
 const document=(id,documentId,kind)=>{
  const n=Number(documentId),doc=database.getEntity(id,"ai-documents",n);
  if(!Number.isSafeInteger(n)||n<1||!doc||doc.record_type!=="document"||
   doc.data?.kind!==kind||doc.data?.extension!==".pdf"||
   !/^[a-f0-9]{64}$/i.test(String(doc.data?.sha256||"")))
   throw Error("Укажите исходный PDF "+kind+" из текущего объекта");
  return doc
 };
 function evidence(id,raw,kind){
  if(!raw||typeof raw!=="object")throw Error("Для "+kind+" нужна ссылка на исходный лист");
  const doc=document(id,raw.documentId,kind);
  const page=Number(raw.page);
  if(!Number.isSafeInteger(page)||page<1||page>2000)
   throw Error("Номер листа "+kind+" должен быть целым числом от 1 до 2000");
  return{documentId:doc.id,name:String(doc.data.original_name||doc.title||""),
   kind,sha256:String(doc.data.sha256),page,
   position:label(raw.position??"","Позиция на листе "+kind,120,true),
   revision:label(raw.revision??"","Ревизия "+kind,50,true)}
 }
 function fresh(id,src,kind){
  const doc=database.getEntity(id,"ai-documents",Number(src?.documentId));
  return Boolean(doc&&doc.record_type==="document"&&doc.data?.kind===kind&&
   doc.data?.extension===".pdf"&&doc.data?.sha256===src.sha256&&
   (!revisions||revisions.isCurrent(id,{...src,kind})));
 }
 function parseValue(raw,field){
  const info=FIELDS[field];
  if(!info)throw Error("Неизвестное сравниваемое поле");
  if(info.type==="text")return label(raw,"Значение",240,true);
  const stringValue=typeof raw==="number"?String(raw):label(raw,"Числовое значение",70,true);
  const normal=stringValue.replace(",",".");
  if(!/^[+-]?\d+(?:\.\d+)?$/.test(normal))throw Error("Значение "+info.label+" должно быть числовым");
  const value=Number(normal);
  if(!Number.isFinite(value)||Math.abs(value)>1e10)throw Error("Числовое значение выходит за пределы");
  if(info.type==="integer"&&(!Number.isSafeInteger(value)||value<0))
   throw Error("Количество должно быть целым неотрицательным числом");
  return value
 }
 function verdict(field,kmValue,kmdValue,tolerance=0){
  const def=FIELDS[field];
  if(!def)throw Error("Неизвестное поле");
  if(kmValue===null||kmdValue===null||kmValue===undefined||kmdValue===undefined)
   return{result:"incomplete",delta:null};
  if(def.type==="text"){
   const normalized=v=>String(v).trim().replace(/\s+/g," ").toLocaleUpperCase("ru-RU");
   return{result:normalized(kmValue)===normalized(kmdValue)?"match":"difference",delta:null}
  }
  const difference=kmdValue-kmValue;
  return{result:Math.abs(difference)<=tolerance+1e-8?"match":"difference",delta:difference}
 }
 function rowById(id,entryId){
  const n=Number(entryId),row=database.getEntity(id,"ai-km-kmd-comparison",n);
  if(!Number.isSafeInteger(n)||n<1||!row||row.record_type!=="difference_check")
   throw Error("Проверка КМ/КМД не найдена в этом объекте");
  return row
 }
 function view(id,row){
  const d=row.data||{},field=d.field;
  const sourceKm={...d.km?.source},sourceKmd={...d.kmd?.source};
  const kmFresh=fresh(id,sourceKm,"КМ"),kmdFresh=fresh(id,sourceKmd,"КМД");
  const measured=FIELDS[field]?verdict(field,d.km?.value,d.kmd?.value,Number(d.tolerance)||0):
   {result:"incomplete",delta:null};
  const status=STATES.has(d.status)?d.status:"requires_review";
  const approved=status==="confirmed"&&kmFresh&&kmdFresh;
  return{id:row.id,mark:String(d.mark||""),cipher:String(d.cipher||""),
   position:String(d.position||""),field,fieldName:FIELDS[field]?.label||field,
   unit:FIELDS[field]?.unit||"",
   km:{value:d.km?.value??null,source:sourceKm,sourceValid:kmFresh},
   kmd:{value:d.kmd?.value??null,source:sourceKmd,sourceValid:kmdFresh},
   tolerance:Number(d.tolerance)||0,delta:measured.delta,
   rawResult:measured.result,
   result:!kmFresh||!kmdFresh?"invalid_source":measured.result,
   status,approved,disposition:d.disposition||"open",
   comment:String(d.comment||""),revision:Number(d.revision)||0,
   reviewedAt:d.reviewedAt||null,reviewedBy:d.reviewedBy||null,
   createdAt:row.created_at,updatedAt:row.updated_at}
 }
 function list(id){
  const target=oid(id);
  return database.listEntity(target,"ai-km-kmd-comparison")
   .filter(x=>x.record_type==="difference_check")
   .map(row=>view(target,row))
 }
 const identity=d=>[d.mark,d.cipher,d.position,d.field]
  .map(x=>String(x||"").toLocaleUpperCase("ru-RU")).join("\u0001");
 function save(objectId,recordId,request,{role}={}){
  const id=oid(objectId);
  if(!["admin","engineer"].includes(role))
   throw Error("Проверять КМ и КМД может только инженер или администратор");
  if(!request||typeof request!=="object"||!STATES.has(request.status))
   throw Error("Выберите статус проверки");
  const old=recordId==null?null:rowById(id,recordId),rev=Number(old?.data?.revision)||0;
  if(!Number.isSafeInteger(request.expectedRevision)||request.expectedRevision!==rev)
   throw Error("Данные были изменены в другом окне; обновите сравнение");
  const mark=identifier(request.mark,"Марка/участок",80);
  const cipher=label(request.cipher??"","Шифр",80),
   position=identifier(request.position,"Позиция/узел",100);
  const field=String(request.field||"");
  if(!FIELDS[field])throw Error("Выберите сравниваемый параметр");
  const kmSource=evidence(id,request.km?.source,"КМ"),
   kmdSource=evidence(id,request.kmd?.source,"КМД");
  const kmValue=parseValue(request.km?.value,field),
   kmdValue=parseValue(request.kmd?.value,field);
  const tolInput=request.tolerance===null||request.tolerance===""||request.tolerance===undefined?0:Number(request.tolerance);
  if(!Number.isFinite(tolInput)||tolInput<0||tolInput>100000)
   throw Error("Допуск должен быть числом от 0 до 100000");
  if(FIELDS[field].type==="integer"&&(!Number.isInteger(tolInput)||tolInput!==0))
   throw Error("Количество элементов сравнивается без допуска");
  if(FIELDS[field].type==="text"&&tolInput!==0)
   throw Error("Для текстового параметра числовой допуск не применяется");
  const check=verdict(field,kmValue,kmdValue,tolInput);
  const disposition=String(request.disposition||"open");
  if(!DISPOSITIONS.has(disposition))throw Error("Выберите решение по расхождению");
  const comment=label(request.comment??"","Комментарий инженера",2000);
  if(request.status==="confirmed"){
   if(check.result==="match"&&disposition!=="agreed")
    throw Error("Совпадающие значения подтверждаются решением «Соответствует»");
   if(check.result==="difference"&&
    !["correction_required","accepted_deviation"].includes(disposition))
    throw Error("Для расхождения укажите «Исправить» или «Принятое отклонение»");
   if(disposition==="accepted_deviation"&&!comment)
    throw Error("Принятое отклонение требует обоснования инженера");
   if(tolInput>0&&!comment)
    throw Error("Подтверждение с допуском требует указать основание допуска");
  }else if(disposition!=="open")
   throw Error("Без инженерного подтверждения решение должно оставаться открытым");
  const next={mark,cipher,position,field,
   km:{value:kmValue,source:kmSource},kmd:{value:kmdValue,source:kmdSource},
   tolerance:tolInput,status:request.status,disposition,comment,
   reviewedAt:clock(),reviewedBy:role,revision:rev+1,
   origin:"engineer_compared_two_original_drawings"};
  const dup=list(id).find(x=>x.id!==old?.id&&x.status!=="rejected"&&identity(x)===identity(next));
  if(dup)throw Error("Этот параметр марки уже сравнивается в записи № "+dup.id);
  if(typeof database.transaction!=="function")throw Error("SQLite должен поддерживать атомарные транзакции");
  return database.transaction(()=>{
   const value={record_type:"difference_check",title:mark+" / "+position+" / "+field,data:next};
   const saved=old?database.updateEntity(id,"ai-km-kmd-comparison",old.id,value):
    database.createEntity(id,"ai-km-kmd-comparison",value);
   if(!saved)throw Error("Не удалось записать сравнение");
   const audit=database.createEntity(id,"ai-km-kmd-comparison-history",{
    record_type:"comparison_change",parent_id:saved.id,title:"КМ / КМД · редакция "+next.revision,
    data:{comparisonId:saved.id,previous:old?.data||null,current:next,
     revision:next.revision,reviewedBy:role,reviewedAt:next.reviewedAt}
   });
   if(!audit)throw Error("Не удалось сохранить журнал сравнения");
   return{...view(id,saved),historyId:audit.id}
  })
 }
 function summary(id){
  const rows=list(id),confirmed=rows.filter(x=>x.approved);
  return{total:rows.length,confirmed:confirmed.length,
   matches:confirmed.filter(x=>x.result==="match").length,
   correctionRequired:confirmed.filter(x=>x.result==="difference"&&x.disposition==="correction_required").length,
   acceptedDeviations:confirmed.filter(x=>x.result==="difference"&&x.disposition==="accepted_deviation").length,
   pending:rows.filter(x=>x.status==="requires_review").length,
   invalidSources:rows.filter(x=>x.result==="invalid_source").length,
   rejected:rows.filter(x=>x.status==="rejected").length,
   complete:false,meaning:"Частичная сверка КМ/КМД по введённым инженером параметрам, не автоматическая экспертиза всех листов"}
 }
 function history(id,entryId){
  const obj=oid(id),rec=rowById(obj,entryId);
  return database.listEntity(obj,"ai-km-kmd-comparison-history")
   .filter(x=>x.record_type==="comparison_change"&&Number(x.parent_id)===rec.id)
   .map(x=>({id:x.id,...x.data}))
 }
 return{list,save,summary,history,fields:FIELDS};
}
module.exports={createKmKmdCompare,FIELDS,verdict};
