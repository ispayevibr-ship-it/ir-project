"use strict";
/* Source-backed KMD steel-part register.
 * All work remains isolated from production marks, material procurement and 3D.
 * Human-confirmed mass basis only. No guessed steel section data.
 */
const {createMarkQuantities}=require("./ai-mark-quantities");
const STATES=new Set(["requires_review","confirmed","rejected"]);
const TYPES=new Set(["plate","rib","gusset","profile","pipe","rod","other"]);
const METHODS=new Set(["drawing","rectangular","linear"]);
const MARK=/^[\p{L}\p{N}][\p{L}\p{N} ._+\-/()№]*$/u;
const round=(n,d=5)=>Math.round((n+Number.EPSILON)*10**d)/10**d;
const finite=(value,label,{optional=false,min=0,max=1e9}={})=>{
 if(value==null||value===""){
  if(optional)return null;
  throw Error("Укажите значение: "+label)
 }
 const n=Number(value);
 if(typeof value==="boolean"||!Number.isFinite(n)||n<min||n>max)
  throw Error("Некорректное значение «"+label+"»");
 return n
};
const string=(v,name,max=100,{required=false}={})=>{
 if(typeof v!=="string")throw Error("Поле «"+name+"» должно быть строкой");
 const normalized=v.trim().replace(/\s+/g," ");
 if(normalized.length>max||required&&!normalized)throw Error("Заполните поле «"+name+"»");
 return normalized
};
function massOf(value){
 const method=value.massMethod;
 if(!METHODS.has(method))throw Error("Выберите способ определения массы");
 let kg;
 switch(method){
  case "drawing":
   kg=finite(value.drawingMassKg,"Масса детали по КМД, кг",{min:0.00001,max:1000000});
   break;
  case "rectangular":{
   if(!["plate","rib","gusset","other"].includes(value.type))
    throw Error("Массу по габаритам разрешено считать только для прямоугольной листовой детали");
   if(value.isSolidRectangle!==true)
    throw Error("Подтвердите, что деталь — сплошной прямоугольник без вырезов");
   const l=finite(value.lengthMm,"Длина, мм",{min:0.01,max:1000000}),
    w=finite(value.widthMm,"Ширина, мм",{min:0.01,max:1000000}),
    t=finite(value.thicknessMm,"Толщина, мм",{min:0.01,max:10000}),
    density=finite(value.densityKgM3,"Плотность стали, кг/м³",{min:5000,max:10000});
   kg=l*w*t*density/1e9;
   break
  }
  case "linear":{
   const l=finite(value.lengthMm,"Длина, мм",{min:0.01,max:1000000});
   const linear=finite(value.linearKgM,"Масса профиля, кг/м",{min:0.00001,max:100000});
   kg=l/1000*linear;
   break
  }
 }
 if(!Number.isFinite(kg)||kg<=0||kg>1000000)
  throw Error("Неверная масса детали; проверьте размерность и источник");
 return kg
}
function createKmdMaterials({database,quantities,clock=()=>new Date().toISOString()}={}){
 if(!database)throw Error("Нет базы данных IR Project");
 quantities=quantities||createMarkQuantities({database,clock});
 const object=id=>{
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<1||!database.getObject(n))throw Error("Объект не найден");
  return n
 };
 const record=(oid,id)=>{
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<1)throw Error("Неверный номер детали");
  const row=database.getEntity(oid,"ai-kmd-materials",n);
  if(!row||row.record_type!=="kmd_part")throw Error("Деталь не найдена в указанном объекте");
  return row
 };
 function assembly(oid,id){
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<1)throw Error("Выберите отправочную марку из ведомости КМД");
  const row=quantities.list(oid).find(x=>x.id===n);
  if(!row)throw Error("Отправочная марка не найдена");
  return row
 }
 function source(oid,documentId,page,specPosition,revision){
  const id=Number(documentId);
  if(!Number.isSafeInteger(id)||id<1)throw Error("Укажите исходный PDF КМД");
  const doc=database.getEntity(oid,"ai-documents",id);
  if(!doc||doc.record_type!=="document"||doc.data?.kind!=="КМД"||
   doc.data?.extension!==".pdf"||!/^[0-9a-f]{64}$/i.test(String(doc.data?.sha256||"")))
   throw Error("Источник должен быть исходным PDF КМД данного объекта");
  if(!Number.isSafeInteger(Number(page))||Number(page)<1||Number(page)>2000)
   throw Error("Номер листа должен быть целым числом от 1 до 2000");
  return{documentId:doc.id,name:String(doc.data.original_name||doc.title||""),
   sha256:String(doc.data.sha256),kind:"КМД",page:Number(page),
   specPosition:string(specPosition,"Позиция спецификации",100,{required:true}),
   drawingRevision:string(revision,"Изменение КМД",40)}
 }
 function validSource(oid,value){
  const doc=database.getEntity(oid,"ai-documents",Number(value?.documentId));
  return Boolean(doc&&doc.record_type==="document"&&doc.data?.kind==="КМД"&&
   doc.data?.extension===".pdf"&&doc.data?.sha256===value?.sha256)
 }
 function decode(oid,row,known){
  const d=row.data||{},a=known.get(Number(d.assemblyId)),s=d.source||{};
  const sourceValid=validSource(oid,s);
  let massKg=null;
  try{massKg=massOf(d)}catch{}
  const partCount=Number.isSafeInteger(d.partCount)&&d.partCount>0?d.partCount:null;
  const massPerAssemblyKg=massKg!==null&&partCount!==null?massKg*partCount:null;
  const associationValid=Boolean(a&&a.mark===d.assemblyMark&&a.cipher===d.assemblyCipher&&
   a.secondaryCipher===d.assemblySecondaryCipher);
  const assemblyReady=associationValid&&a.status==="confirmed"&&a.sourceValid&&
   Number.isSafeInteger(a.quantity)&&a.quantity>0;
  const confirmed=d.status==="confirmed"&&sourceValid&&assemblyReady&&
   Number.isFinite(massPerAssemblyKg)&&massPerAssemblyKg>0;
  const reason=!sourceValid?"Источник КМД отсутствует или изменён":
   !associationValid?"Привязка к отправочной марке изменилась":
   !assemblyReady?"Количество отправочной марки не подтверждено":
   massPerAssemblyKg===null?"Масса или количество деталей не определены":"";
  const output={id:row.id,assemblyId:Number(d.assemblyId)||null,
   assemblyMark:String(d.assemblyMark||""),cipher:String(d.assemblyCipher||""),
   secondaryCipher:String(d.assemblySecondaryCipher||""),
   position:String(d.position||""),type:String(d.type||""),name:String(d.name||""),
   profile:String(d.profile||""),steelGrade:String(d.steelGrade||""),
   standard:String(d.standard||""),massMethod:String(d.massMethod||""),
   partCount, lengthMm:d.lengthMm??null,widthMm:d.widthMm??null,
   thicknessMm:d.thicknessMm??null,densityKgM3:d.densityKgM3??null,
   isSolidRectangle:d.isSolidRectangle===true,linearKgM:d.linearKgM??null,
   drawingMassKg:d.drawingMassKg??null,
   calculatedUnitMassKg:massKg===null?null:round(massKg),
   massPerAssemblyKg:massPerAssemblyKg===null?null:round(massPerAssemblyKg),
   assemblyQuantity:assemblyReady?a.quantity:null,
   totalMassKg:confirmed?round(massPerAssemblyKg*a.quantity):null,
   source:{documentId:s.documentId??null,name:String(s.name||""),sha256:String(s.sha256||""),
    kind:String(s.kind||""),page:s.page??null,specPosition:String(s.specPosition||""),
    drawingRevision:String(s.drawingRevision||"")},sourceValid,associationValid,
   counted:confirmed,reason:confirmed?"":reason||"Позиция не подтверждена",
   status:STATES.has(d.status)?d.status:"requires_review",
   revision:Number(d.revision)||0,reviewedBy:d.reviewedBy||null,
   reviewedAt:d.reviewedAt||null,comment:String(d.comment||""),
   createdAt:row.created_at};
  return output
 }
 function list(id){
  const oid=object(id),assemblies=new Map(quantities.list(oid).map(a=>[a.id,a]));
  return database.listEntity(oid,"ai-kmd-materials")
   .filter(x=>x.record_type==="kmd_part").map(row=>decode(oid,row,assemblies))
 }
 function summary(id){
  const items=list(id),counted=items.filter(x=>x.counted);
  let massPerConfirmedAssemblies=0;
  const byAssembly=new Map();
  for(const item of counted){
   const a=byAssembly.get(item.assemblyId)||{assemblyId:item.assemblyId,mark:item.assemblyMark,
    cipher:item.cipher,secondaryCipher:item.secondaryCipher,
    assemblyQuantity:item.assemblyQuantity,parts:0,unitMassKg:0,totalMassKg:0};
   a.parts+=1;
   a.unitMassKg+=item.massPerAssemblyKg;
   a.totalMassKg+=item.massPerAssemblyKg*item.assemblyQuantity;
   massPerConfirmedAssemblies+=item.massPerAssemblyKg*item.assemblyQuantity;
   byAssembly.set(item.assemblyId,a)
  }
  if(!Number.isFinite(massPerConfirmedAssemblies)||massPerConfirmedAssemblies>1e12)
   throw Error("Суммарная масса требует инженерной перепроверки");
  return{confirmedDetailPositions:counted.length,
   confirmedAssemblies:byAssembly.size,confirmedMassKg:round(massPerConfirmedAssemblies),
   confirmedMassTonnes:round(massPerConfirmedAssemblies/1000),
   pendingCount:items.filter(x=>x.status==="requires_review"||x.status==="confirmed"&&!x.counted).length,
   rejectedCount:items.filter(x=>x.status==="rejected").length,
   byAssembly:[...byAssembly.values()].map(x=>({...x,
    unitMassKg:round(x.unitMassKg),totalMassKg:round(x.totalMassKg)}))
    .sort((a,b)=>new Intl.Collator("ru",{numeric:true}).compare(a.mark,b.mark)),
   complete:false,massMeaning:"Частичная масса подтверждённых деталей по КМД. Не полный тоннаж объекта"}
 }
 function save(id,recordId,command,{role}={}){
  const oid=object(id);
  if(!["admin","engineer"].includes(role))throw Error("Спецификацию металла может проверять только инженер или администратор");
  if(!command||typeof command!=="object"||!STATES.has(command.status))
   throw Error("Выберите статус проверки детали");
  if(!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<0)
   throw Error("Требуется актуальная редакция детали");
  const old=recordId==null?null:record(oid,recordId),
   revision=Number(old?.data?.revision)||0;
  if(revision!==command.expectedRevision)throw Error("Деталь изменена в другом окне. Обновите страницу");
  const a=assembly(oid,command.assemblyId),
   type=string(command.type,"Тип детали",20,{required:true});
  if(!TYPES.has(type))throw Error("Недопустимый тип детали");
  const position=string(command.position,"Позиция детали КМД",100,{required:true});
  if(!MARK.test(position))throw Error("Недопустимое обозначение позиции детали");
  const partCount=finite(command.partCount,"Количество деталей на марку, шт.",{min:1,max:100000});
  if(!Number.isSafeInteger(partCount))throw Error("Количество деталей должно быть целым");
  const steelGrade=string(command.steelGrade??"","Марка стали",80);
  const profile=string(command.profile??"","Профиль/сечение",100);
  const standard=string(command.standard??"","Норматив профиля/стали",100);
  const name=string(command.name??"","Наименование детали",150);
  const comment=string(command.comment??"","Комментарий инженера",1500);
  const massMethod=string(command.massMethod,"Способ определения массы",25,{required:true});
  const data={
   assemblyId:a.id,assemblyMark:a.mark,assemblyCipher:a.cipher,
   assemblySecondaryCipher:a.secondaryCipher,
   position,type,name,steelGrade,profile,standard,partCount,massMethod,
   lengthMm:finite(command.lengthMm,"Длина, мм",{optional:true,min:0.01,max:1000000}),
   widthMm:finite(command.widthMm,"Ширина, мм",{optional:true,min:0.01,max:1000000}),
   thicknessMm:finite(command.thicknessMm,"Толщина, мм",{optional:true,min:0.01,max:10000}),
   densityKgM3:finite(command.densityKgM3,"Плотность кг/м³",{optional:true,min:5000,max:10000}),
   linearKgM:finite(command.linearKgM,"Масса 1 м, кг/м",{optional:true,min:0.00001,max:100000}),
   drawingMassKg:finite(command.drawingMassKg,"Масса 1 детали по КМД, кг",
    {optional:true,min:0.00001,max:1000000}),
   isSolidRectangle:command.isSolidRectangle===true,
   source:source(oid,command.documentId,command.page,command.specPosition,command.drawingRevision),
   status:command.status,comment,
   revision:revision+1,reviewedAt:clock(),reviewedBy:role,
   origin:"human_entered_steel_detail_from_kmd"
  };
  if(command.status==="confirmed"){
   if(!a.sourceValid||a.status!=="confirmed"||!Number.isSafeInteger(a.quantity)||a.quantity<=0)
    throw Error("Сначала подтвердите количество отправочной марки по спецификации КМД");
   if(!steelGrade)throw Error("Для подтверждения укажите марку стали по чертежу");
   if(!profile&&["profile","pipe","rod"].includes(type))
    throw Error("Укажите подтверждённый профиль/сечение детали");
   massOf(data);
  }else if(!METHODS.has(massMethod))throw Error("Неизвестный способ расчёта массы");
  const matches=list(oid).find(v=>v.id!==old?.id&&v.assemblyId===a.id&&
   v.position.toLocaleUpperCase("ru-RU")===position.toLocaleUpperCase("ru-RU")&&
   v.status!=="rejected");
  if(matches)throw Error("Позиция детали уже есть в этой отправочной марке (№ "+matches.id+")");
  if(typeof database.transaction!=="function")throw Error("Требуется атомарная транзакция SQLite");
  return database.transaction(()=>{
   const payload={record_type:"kmd_part",title:a.mark+" / "+position,data};
   const saved=old?database.updateEntity(oid,"ai-kmd-materials",old.id,payload):
    database.createEntity(oid,"ai-kmd-materials",payload);
   if(!saved)throw Error("Не удалось сохранить деталь КМД");
   const history=database.createEntity(oid,"ai-kmd-material-history",{
    record_type:"kmd_part_change",title:"Редакция детали "+position,
    parent_id:saved.id,data:{partId:saved.id,revision:data.revision,
     previous:old?.data||null,current:data,reviewedBy:role,reviewedAt:data.reviewedAt}
   });
   if(!history)throw Error("Не удалось сохранить историю детали");
   return{...decode(oid,saved,new Map([[a.id,a]])),historyId:history.id}
  })
 }
 function history(id,recordId){
  const oid=object(id),row=record(oid,recordId);
  return database.listEntity(oid,"ai-kmd-material-history")
   .filter(x=>x.record_type==="kmd_part_change"&&Number(x.parent_id)===row.id)
   .map(x=>({id:x.id,...x.data}))
 }
 return{list,summary,save,history}
}
module.exports={createKmdMaterials,massOf,TYPES,METHODS};
