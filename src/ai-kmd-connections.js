"use strict";
/* IR Project AI / KMD connection ledger.
   An erection joint is counted ONCE per object, fabrication nodes are multiplied
   by the approved quantity of ONE owning assembly. Neither AI mentions nor
   drawing callouts are interpreted as physical joint counts.
   Separate welded seam lengths from discrete hardware pieces.
 */
const {createMarkQuantities}=require("./ai-mark-quantities");
const STATES=new Set(["requires_review","confirmed","rejected"]);
const SCOPES=new Set(["fabrication","erection"]);
const HARDWARE=new Set(["bolt","nut","washer","anchor","stud","pin","other"]);
const WELDS=new Set(["fillet","butt","plug","slot","other"]);
const NAME=/^[\p{L}\p{N}][\p{L}\p{N} ._+\-/()№]*$/u;
const round=(x,d=3)=>Math.round((x+Number.EPSILON)*10**d)/10**d;
const text=(v,label,max=120,required=false)=>{
 if(typeof v!=="string")throw Error("Поле «"+label+"» должно быть текстом");
 const s=v.trim().replace(/\s+/g," ");
 if(s.length>max||required&&!s)throw Error("Неверное значение поля «"+label+"»");
 return s
};
const name=(v,label,max=100)=>{
 const s=text(v,label,max,true);
 if(!NAME.test(s))throw Error("Недопустимое обозначение «"+label+"»");
 return s
};
function integer(value,label,{nullable=false,max=1000000}={}){
 if(nullable&&(value==null||value===""))return null;
 if(value===null||value===undefined||value===""||typeof value==="boolean")throw Error("Укажите «"+label+"»");
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<1||n>max)throw Error("«"+label+"» должно быть целым числом от 1 до "+max);
 return n
}
function positive(value,label,{optional=false,max=1e7}={}){
 if(optional&&(value==null||value===""))return null;
 if(value===null||value===undefined||value===""||typeof value==="boolean")throw Error("Укажите «"+label+"»");
 const n=Number(value);
 if(!Number.isFinite(n)||n<=0||n>max)throw Error("Некорректное значение «"+label+"»");
 return n
}
function createKmdConnections({database,quantities,revisions=null,clock=()=>new Date().toISOString()}={}){
 if(!database)throw Error("Требуется база IR Project");
 quantities=quantities||createMarkQuantities({database,clock});
 const getObject=id=>{
  const oid=Number(id);
  if(!Number.isSafeInteger(oid)||oid<1||!database.getObject(oid))throw Error("Объект IR Project не найден");
  return oid
 };
 const getRow=(oid,section,id,type)=>{
  const value=Number(id);
  if(!Number.isSafeInteger(value)||value<1)throw Error("Недопустимый ID записи");
  const row=database.getEntity(oid,section,value);
  if(!row||row.record_type!==type)throw Error("Запись не найдена в текущем объекте");
  return row
 };
 const verifiedDocument=(oid,id)=>{
  const doc=database.getEntity(oid,"ai-documents",Number(id));
  if(!doc||doc.record_type!=="document"||doc.data?.kind!=="КМД"||
   doc.data?.extension!==".pdf"||!/^[0-9a-f]{64}$/i.test(String(doc.data?.sha256||"")))
   throw Error("Нужен загруженный исходный PDF КМД этого объекта");
  return doc
 };
 function source(oid,cmd){
  const doc=verifiedDocument(oid,cmd.documentId);
  return{documentId:doc.id,name:String(doc.data.original_name||doc.title||""),
   sha256:String(doc.data.sha256),kind:"КМД",page:integer(cmd.page,"Лист КМД",{max:2000}),
   position:text(cmd.sourcePosition??"","Позиция на листе",110,true),
   drawingRevision:text(cmd.drawingRevision??"","Ревизия КМД",50)}
 }
 function sourceValid(oid,src){
  const row=database.getEntity(oid,"ai-documents",Number(src?.documentId));
  return Boolean(row&&row.record_type==="document"&&row.data?.kind==="КМД"&&
   row.data?.extension===".pdf"&&row.data?.sha256===src?.sha256&&
   (!revisions||revisions.isCurrent(oid,src)))
 }
 const assemblies=oid=>new Map(quantities.list(oid).map(a=>[a.id,a]));
 function assembly(oid,assemblyId){
  const a=assemblies(oid).get(Number(assemblyId));
  if(!a)throw Error("Отправочная марка не зарегистрирована в этом объекте");
  return a
 }
 const assemblyReady=a=>Boolean(a&&a.status==="confirmed"&&a.sourceValid&&
  Number.isSafeInteger(a.quantity)&&a.quantity>0);
 const key=s=>String(s||"").toLocaleUpperCase("ru-RU");
 function nodeView(oid,row,known=assemblies(oid)){
  const d=row.data||{},a=known.get(Number(d.assemblyId)),src=d.source||{};
  const associationValid=Boolean(a&&a.mark===d.assemblyMark&&
   a.cipher===d.assemblyCipher&&a.secondaryCipher===d.assemblySecondaryCipher);
  const sourceOk=sourceValid(oid,src);
  const instances=d.scope==="fabrication"&&assemblyReady(a)&&associationValid?
   Number(d.occurrencesPerAssembly)*a.quantity:
   d.scope==="erection"&&associationValid&&assemblyReady(a)?Number(d.siteOccurrences):null;
  const safeInstances=Number.isSafeInteger(instances)&&instances>0&&instances<=1e9?instances:null;
  const status=STATES.has(d.status)?d.status:"requires_review";
  const counted=status==="confirmed"&&sourceOk&&associationValid&&assemblyReady(a)&&safeInstances!==null;
  return{id:row.id,assemblyId:Number(d.assemblyId)||null,assemblyMark:String(d.assemblyMark||""),
   assemblyCipher:String(d.assemblyCipher||""),assemblySecondaryCipher:String(d.assemblySecondaryCipher||""),
   jointCode:String(d.jointCode||""),scope:String(d.scope||""),
   occurrencesPerAssembly:d.occurrencesPerAssembly??null,siteOccurrences:d.siteOccurrences??null,
   instances:counted?safeInstances:null,status,counted,
   reason:!sourceOk?"Изменён или удалён источник КМД":
    !associationValid?"Изменилась привязка к отправочной марке":
    !assemblyReady(a)?"Не подтверждено количество отправочной марки":
    safeInstances===null?"Не подтверждено число физических узлов":
    status!=="confirmed"?"Узел ещё не подтверждён":"",
   source:{documentId:src.documentId??null,name:String(src.name||""),
    sha256:String(src.sha256||""),page:src.page??null,
    position:String(src.position||""),drawingRevision:String(src.drawingRevision||"")},
   sourceValid:sourceOk,associationValid,comment:String(d.comment||""),
   reviewedBy:d.reviewedBy||null,reviewedAt:d.reviewedAt||null,revision:Number(d.revision)||0,
   createdAt:row.created_at}
 }
 function listNodes(id){
  const oid=getObject(id),lookup=assemblies(oid);
  return database.listEntity(oid,"ai-kmd-joints")
   .filter(row=>row.record_type==="connection")
   .map(row=>nodeView(oid,row,lookup))
 }
 function saveNode(id,recordId,cmd,{role}={}){
  const oid=getObject(id);
  if(!["admin","engineer"].includes(role))throw Error("Подтверждать соединения может только инженер или администратор");
  if(!cmd||!STATES.has(cmd.status))throw Error("Выберите статус узла");
  const old=recordId==null?null:getRow(oid,"ai-kmd-joints",recordId,"connection");
  if(!Number.isSafeInteger(cmd.expectedRevision)||cmd.expectedRevision!==(Number(old?.data?.revision)||0))
   throw Error("Редакция узла устарела. Обновите данные");
  const a=assembly(oid,cmd.assemblyId),
   jointCode=name(cmd.jointCode,"Узел соединения",80),
   scope=text(cmd.scope,"Тип соединения",25,true);
  if(!SCOPES.has(scope))throw Error("Нужно выбрать заводской или монтажный узел");
  const occurrencesPerAssembly=scope==="fabrication"?
   integer(cmd.occurrencesPerAssembly,"Число узлов на отправочную марку",{nullable:cmd.status!=="confirmed"}):null;
  const siteOccurrences=scope==="erection"?
   integer(cmd.siteOccurrences,"Количество монтажных стыков объекта",{nullable:cmd.status!=="confirmed"}):null;
  if(cmd.status==="confirmed"&&!assemblyReady(a))
   throw Error("Сначала подтвердите количество привязанной отправочной марки");
  const same=listNodes(oid).find(x=>x.id!==old?.id&&x.status!=="rejected"&&
   key(x.jointCode)===key(jointCode)&&
   (scope==="erection"&&x.scope==="erection"||
    scope==="fabrication"&&x.scope==="fabrication"&&x.assemblyId===a.id));
  if(same)throw Error("Узел "+jointCode+" уже учтён в записи № "+same.id+
   ". Одна физическая позиция не может учитываться повторно");
  const now=clock(),payload={assemblyId:a.id,assemblyMark:a.mark,
   assemblyCipher:a.cipher,assemblySecondaryCipher:a.secondaryCipher,
   jointCode,scope,occurrencesPerAssembly,siteOccurrences,source:source(oid,cmd),
   status:cmd.status,comment:text(cmd.comment??"","Комментарий",1500),
   reviewedBy:role,reviewedAt:now,revision:(Number(old?.data?.revision)||0)+1,
   origin:"engineer_confirmed_kmd_joint"};
  if(cmd.status==="confirmed"&&!sourceValid(oid,payload.source))
   throw Error("Нельзя подтвердить узел по устаревшему листу КМД");
  if(typeof database.transaction!=="function")throw Error("Необходимы транзакции SQLite");
  return database.transaction(()=>{
   const input={record_type:"connection",title:jointCode,data:payload};
   const row=old?database.updateEntity(oid,"ai-kmd-joints",old.id,input):
    database.createEntity(oid,"ai-kmd-joints",input);
   if(!row)throw Error("Не удалось сохранить узел");
   const history=database.createEntity(oid,"ai-kmd-joint-history",{
    record_type:"connection_change",title:"Узел "+jointCode+" · редакция "+payload.revision,
    parent_id:row.id,data:{jointId:row.id,revision:payload.revision,
     previous:old?.data||null,current:payload,reviewedAt:now,reviewedBy:role}
   });
   if(!history)throw Error("Не удалось сохранить журнал узла");
   return{...nodeView(oid,row),historyId:history.id}
  })
 }
 function parseComponent(oid,row,nodes){
  const d=row.data||{},joint=nodes.get(Number(d.jointId)),src=d.source||{};
  const sourceOk=sourceValid(oid,src);
  const status=STATES.has(d.status)?d.status:"requires_review";
  const number=Number.isSafeInteger(d.perJoint)&&d.perJoint>0?d.perJoint:null;
  const valid=Boolean(joint&&joint.jointCode===d.jointCode&&joint.assemblyId===d.assemblyId);
  const common=valid&&joint.counted&&sourceOk&&status==="confirmed"&&number!==null;
  const count=common?joint.instances*number:null;
  const safeCount=Number.isSafeInteger(count)&&count>0&&count<=1e12?count:null;
  const weld=d.category==="weld";
  const length=positive(d.lengthMm,"Длина шва, мм",{optional:true,max:1e7});
  const totalLengthM=common&&weld&&safeCount!==null&&length!==null?
   safeCount*length/1000:null;
  return{id:row.id,jointId:Number(d.jointId)||null,
   jointCode:String(d.jointCode||""),assemblyId:Number(d.assemblyId)||null,
   assemblyMark:joint?.assemblyMark||"",scope:joint?.scope||"",
   category:d.category,kind:d.kind,position:d.position,
   standard:String(d.standard||""),strength:String(d.strength||""),
   diameterMm:d.diameterMm??null,lengthMm:d.lengthMm??null,
   weldSizeMm:d.weldSizeMm??null,coating:String(d.coating||""),
   perJoint:number,instances:common?joint.instances:null,
   totalPieces:!weld?safeCount:null,totalLengthM:weld&&totalLengthM!==null?round(totalLengthM,3):null,
   totalLengthMm:weld&&totalLengthM!==null?round(totalLengthM*1000,2):null,
   source:{documentId:src.documentId??null,name:String(src.name||""),
    page:src.page??null,sha256:String(src.sha256||""),
    position:String(src.position||""),drawingRevision:String(src.drawingRevision||"")},
   sourceValid:sourceOk,status,revision:Number(d.revision)||0,
   counted:common&&safeCount!==null&&(weld?totalLengthM!==null:true),
   reason:!valid?"Узел-предок изменён или удалён":
    !joint?.counted?"Исходный узел ещё не подтверждён":
    !sourceOk?"Источник КМД отсутствует или изменён":
    status!=="confirmed"?"Позиция требует проверки":
    safeCount===null?"Количество вне допустимых границ":"",
   reviewedAt:d.reviewedAt||null,reviewedBy:d.reviewedBy||null,
   comment:String(d.comment||""),createdAt:row.created_at}
 }
 function listComponents(id){
  const oid=getObject(id),nodes=new Map(listNodes(oid).map(n=>[n.id,n]));
  return database.listEntity(oid,"ai-kmd-connection-items")
   .filter(x=>x.record_type==="connection_item")
   .map(row=>parseComponent(oid,row,nodes))
 }
 function saveComponent(id,recordId,cmd,{role}={}){
  const oid=getObject(id);
  if(!["admin","engineer"].includes(role))throw Error("Проверять метизы и швы может только инженер или администратор");
  if(!cmd||!STATES.has(cmd.status))throw Error("Выберите статус позиции");
  const old=recordId==null?null:getRow(oid,"ai-kmd-connection-items",recordId,"connection_item");
  if(!Number.isSafeInteger(cmd.expectedRevision)||cmd.expectedRevision!==(Number(old?.data?.revision)||0))
   throw Error("Редакция позиции устарела. Обновите данные");
  const nodes=new Map(listNodes(oid).map(n=>[n.id,n])),joint=nodes.get(Number(cmd.jointId));
  if(!joint)throw Error("Нужно выбрать существующий узел КМД");
  const category=text(cmd.category,"Категория",20,true);
  if(!["fastener","weld"].includes(category))throw Error("Неизвестная категория соединения");
  const kind=text(cmd.kind,"Вид соединения",20,true);
  if(category==="fastener"&&!HARDWARE.has(kind)||category==="weld"&&!WELDS.has(kind))
   throw Error("Некорректный тип метиза или сварного шва");
  const position=name(cmd.position,"Позиция детали/шва",80);
  const existing=listComponents(oid).find(x=>x.id!==old?.id&&x.status!=="rejected"&&
   x.jointId===joint.id&&x.category===category&&key(x.position)===key(position));
  if(existing)throw Error("Позиция "+position+" уже учтена в этом узле, запись № "+existing.id);
  const perJoint=integer(cmd.perJoint,"Количество на один узел",
   {nullable:cmd.status!=="confirmed",max:1000000});
  const diameterMm=positive(cmd.diameterMm,"Диаметр, мм",{optional:true,max:10000});
  const lengthMm=positive(cmd.lengthMm,"Длина, мм",{optional:true,max:1e7});
  const weldSizeMm=positive(cmd.weldSizeMm,"Размер шва, мм",{optional:true,max:10000});
  const standard=text(cmd.standard??"","ГОСТ/стандарт",110),
   strength=text(cmd.strength??"","Класс прочности/материал",80),
   coating=text(cmd.coating??"","Покрытие/примечание",100),
   comment=text(cmd.comment??"","Комментарий инженера",1500);
  if(cmd.status==="confirmed"){
   if(!joint.counted)throw Error("Сначала подтвердите узел и количество соединений");
   if(!perJoint)throw Error("Для подтверждения необходимо количество на узел");
   if(category==="fastener"){
    if(!standard||!diameterMm)throw Error("Нужны диаметр и стандарт метиза по КМД");
    if(["bolt","anchor","stud","pin"].includes(kind)&&!lengthMm)
     throw Error("Для болта, анкера, шпильки и штифта нужна длина");
    if(["bolt","anchor","stud","nut"].includes(kind)&&!strength)
     throw Error("Нужен указанный в КМД класс прочности/материал");
   }else if(!lengthMm||!weldSizeMm)
    throw Error("Укажите длину и катет/размер сварного шва по КМД");
  }
  const now=clock(),data={jointId:joint.id,jointCode:joint.jointCode,
   assemblyId:joint.assemblyId,category,kind,position,perJoint,
   diameterMm,lengthMm,weldSizeMm,standard,strength,coating,
   status:cmd.status,source:source(oid,cmd),comment,
   reviewedAt:now,reviewedBy:role,revision:(Number(old?.data?.revision)||0)+1,
   origin:"engineer_verified_connection_component"};
  if(cmd.status==="confirmed"&&!sourceValid(oid,data.source))
   throw Error("Нельзя подтвердить крепёж или шов по устаревшему листу КМД");
  if(typeof database.transaction!=="function")throw Error("Необходима транзакция SQLite");
  return database.transaction(()=>{
   const payload={record_type:"connection_item",title:joint.jointCode+" / "+position,data};
   const row=old?database.updateEntity(oid,"ai-kmd-connection-items",old.id,payload):
    database.createEntity(oid,"ai-kmd-connection-items",payload);
   if(!row)throw Error("Не удалось записать метиз или шов");
   const history=database.createEntity(oid,"ai-kmd-connection-item-history",{
    record_type:"connection_item_change",parent_id:row.id,
    title:"Редакция "+position+" · "+data.revision,
    data:{itemId:row.id,revision:data.revision,previous:old?.data||null,
     current:data,reviewedAt:now,reviewedBy:role}
   });
   if(!history)throw Error("Не удалось сохранить историю позиции");
   return{...parseComponent(oid,row,nodes),historyId:history.id}
  })
 }
 function summary(id){
  const nodes=listNodes(id),items=listComponents(id),hardware=new Map();
  const usedJoints=new Set(),usedItems=new Set();
  for(const node of nodes.filter(x=>x.counted)){
   const key=node.scope+"\u0001"+(node.scope==="erection"?"объект":node.assemblyId)+
    "\u0001"+node.jointCode.trim().toLocaleUpperCase("ru-RU");
   if(usedJoints.has(key))throw Error("Повторный подтверждённый узел "+node.jointCode+
    ": сводка крепежа не рассчитана во избежание двойного учёта");
   usedJoints.add(key)
  }
  let weldedLengthM=0,confirmedWelds=0;
  for(const part of items.filter(x=>x.counted)){
   const itemKey=part.jointId+"\u0001"+part.category+"\u0001"+
    part.position.trim().toLocaleUpperCase("ru-RU");
   if(usedItems.has(itemKey))throw Error("Повторная подтверждённая позиция "+part.position+
    ": сводка крепежа не рассчитана во избежание двойного учёта");
   usedItems.add(itemKey);
   if(part.category==="weld"){
    weldedLengthM+=part.totalLengthM;confirmedWelds++;
    continue
   }
   const k=[part.kind,part.standard,part.strength,part.diameterMm,
    part.lengthMm,part.coating].map(v=>key(v)).join("\u0001");
   if(!hardware.has(k))hardware.set(k,{kind:part.kind,standard:part.standard,
    strength:part.strength,diameterMm:part.diameterMm,lengthMm:part.lengthMm,
    coating:part.coating,pieces:0,sources:[]});
   const group=hardware.get(k);
   group.pieces+=part.totalPieces;
   group.sources.push({itemId:part.id,jointId:part.jointId,
    jointCode:part.jointCode,page:part.source.page,documentId:part.source.documentId,
    sha256:part.source.sha256});
  }
  const rows=[...hardware.values()].sort((a,b)=>
   new Intl.Collator("ru",{numeric:true}).compare(a.kind,b.kind)||
   (a.diameterMm||0)-(b.diameterMm||0)||
   new Intl.Collator("ru",{numeric:true}).compare(a.standard,b.standard));
  const total=rows.reduce((sum,x)=>sum+x.pieces,0);
  if(!Number.isSafeInteger(total)||!Number.isFinite(weldedLengthM))
   throw Error("Итоги соединений превышают допустимые пределы; нужна перепроверка");
  return{confirmedNodes:nodes.filter(x=>x.counted).length,
   pendingNodes:nodes.filter(x=>x.status==="requires_review"||x.status==="confirmed"&&!x.counted).length,
   pendingItems:items.filter(x=>x.status==="requires_review"||x.status==="confirmed"&&!x.counted).length,
   confirmedFastenerPositions:items.filter(x=>x.counted&&x.category==="fastener").length,
   confirmedWeldPositions:confirmedWelds,
   totalFastenerPieces:total,totalWeldLengthM:round(weldedLengthM,3),
   fasteners:rows,complete:false,
   note:"Проверенные отдельные компоненты и длина сварных швов; не полный объём соединений объекта"}
 }
 function history(id,type,recordId){
  const oid=getObject(id),joint=type==="joint";
  if(!joint&&type!=="item")throw Error("Выберите вид журнала");
  const section=joint?"ai-kmd-joints":"ai-kmd-connection-items";
  const row=getRow(oid,section,recordId,joint?"connection":"connection_item");
  const historySection=joint?"ai-kmd-joint-history":"ai-kmd-connection-item-history";
  return database.listEntity(oid,historySection).filter(x=>
   Number(x.parent_id)===row.id&&
   x.record_type===(joint?"connection_change":"connection_item_change"))
   .map(x=>({id:x.id,...x.data}))
 }
 return{listNodes,listComponents,saveNode,saveComponent,summary,history};
}
module.exports={createKmdConnections,HARDWARE,WELDS,SCOPES};
