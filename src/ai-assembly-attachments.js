"use strict";
/* Source-bound 3D engineering annotations. No drill operations, no weld solids,
   and no change to the authoritative hardware takeoff. */
const {createAssemblyGeometry}=require("./ai-assembly-geometry");
const {createKmdConnections}=require("./ai-kmd-connections");
const {createMarkQuantities}=require("./ai-mark-quantities");
const {createKmdMaterials}=require("./ai-kmd-materials");
const TYPES=new Set(["hole","fastener","weld"]);
const STATUSES=new Set(["requires_review","confirmed","rejected"]);
const AXES=new Set(["x","y","z"]);
function createAssemblyAttachments({database,assemblies,connections,clock=()=>new Date().toISOString()}={}){
 if(!database)throw Error("Требуется база IR Project");
 if(!assemblies){
  const quantities=createMarkQuantities({database});
  assemblies=createAssemblyGeometry({database,quantities,materials:createKmdMaterials({database,quantities})})
 }
 if(!connections)connections=createKmdConnections({database});
 const oid=x=>{const n=Number(x);if(!Number.isSafeInteger(n)||n<=0||!database.getObject(n))throw Error("Объект не найден");return n};
 const idx=(x,label)=>{const n=Number(x);if(x==null||x===""||!Number.isSafeInteger(n)||n<=0)throw Error("Не указан "+label);return n};
 const str=(value,name,max=120,required=false)=>{
  if(typeof value!=="string")throw Error("Поле «"+name+"» должно быть строкой");
  const v=value.trim().replace(/\s+/g," ");
  if(v.length>max||required&&!v)throw Error("Не заполнено поле «"+name+"»");
  return v
 };
 const num=(value,name,min,max)=>{
  if(value==null||value===""||typeof value==="boolean"||!Number.isFinite(Number(value))||
   Number(value)<min||Number(value)>max)throw Error("Некорректный параметр: "+name);
  return Number(value)
 };
 const point=(value,name)=>{
  if(!value||typeof value!=="object")throw Error("Не указана точка «"+name+"»");
  return{x:num(value.x,name+" X",-1000000,1000000),
   y:num(value.y,name+" Y",-1000000,1000000),
   z:num(value.z,name+" Z",-1000000,1000000)}
 };
 function localBounds(shape){
  const x=shape.type==="chs"?shape.diameterMm/2:shape.widthMm/2;
  const y=shape.type==="chs"?shape.diameterMm/2:shape.heightMm/2;
  return{x,y,z:shape.lengthMm}
 }
 function checkInside(point,shape){
  const b=localBounds(shape);
  if(Math.abs(point.x)>b.x+0.01||Math.abs(point.y)>b.y+0.01||
   point.z<-.01||point.z>b.z+.01)
   throw Error("Точка находится за габаритами выбранной детали КМД");
  // I-beam cavities and hollow-section walls are not checked as exact surfaces.
 }
 function document(oid,cmd){
  const id=idx(cmd.documentId,"исходного PDF КМД"),row=database.getEntity(oid,"ai-documents",id);
  if(!row||row.record_type!=="document"||row.data?.kind!=="КМД"||
   row.data?.extension!==".pdf"||!/^[a-f0-9]{64}$/i.test(String(row.data?.sha256||"")))
   throw Error("Источник должен быть PDF КМД текущего объекта");
  return{documentId:id,name:String(row.data.original_name||row.title||""),sha256:String(row.data.sha256),
   page:num(cmd.page,"Номер листа",1,2000),
   position:str(cmd.sourcePosition,"Размер или узел на листе",120,true),
   revision:str(cmd.drawingRevision,"Ревизия КМД",50,true)}
 }
 function fresh(oid,src){
  const row=database.getEntity(oid,"ai-documents",Number(src?.documentId));
  return Boolean(row&&row.record_type==="document"&&row.data?.kind==="КМД"&&
   row.data?.extension===".pdf"&&row.data?.sha256===src?.sha256)
 }
 function record(oid,id){
  const row=database.getEntity(oid,"ai-assembly-attachments",idx(id,"ID точки"));
  if(!row||row.record_type!=="assembly_attachment")throw Error("3D-привязка не найдена в этом объекте");
  return row
 }
 function dataMaps(oid,assemblyId){
  const placements=assemblies.list(oid,assemblyId);
  const components=connections.listComponents(oid);
  return{placements:new Map(placements.map(p=>[p.id,p])),
   items:new Map(components.map(p=>[p.id,p]))}
 }
 function view(row,placements,items,oid){
  const data=row.data||{},p=placements.get(Number(data.placementId)),
   item=data.itemId!=null?items.get(Number(data.itemId)):null;
  const locationOk=Boolean(p&&p.assemblyId===data.assemblyId&&
   p.partId===data.partId&&p.instanceIndex===data.instanceIndex);
  const placementOk=locationOk&&p.counted&&p.revision===data.placementRevision;
  const itemOk=data.type==="hole"||Boolean(item&&item.assemblyId===data.assemblyId&&
   item.counted&&item.category===(data.type==="weld"?"weld":"fastener")&&
   item.revision===data.itemRevision);
  const sourceOk=fresh(oid,data.source);
  const status=STATUSES.has(data.status)?data.status:"requires_review";
  const included=status==="confirmed"&&placementOk&&itemOk&&sourceOk;
  const reason=!locationOk?"Размещение детали КМД удалено либо изменена привязка":
   !placementOk?"Исходное 3D-размещение изменено или не подтверждено":
   !itemOk?"Метиз/шов изменён либо не подтверждён в ведомости":
   !sourceOk?"Исходный лист PDF КМД изменён или удалён":
   status!=="confirmed"?"Привязка ещё не подтверждена":"";
  return{id:row.id,assemblyId:data.assemblyId,
   placementId:data.placementId,placementRevision:data.placementRevision,
   partId:data.partId,instanceIndex:data.instanceIndex,
   partPosition:String(p?.partPosition||data.partPosition||""),
   itemId:data.itemId??null,itemRevision:data.itemRevision??null,
   itemName:String(item?.position||data.itemName||""),
   type:data.type,code:String(data.code||""),start:data.start||null,end:data.end||null,
   diameterMm:data.diameterMm??null,axis:data.axis||null,
   status,visible:included,counted:included,reason,
   source:{...data.source},comment:String(data.comment||""),
   reviewedBy:data.reviewedBy||null,reviewedAt:data.reviewedAt||null,
   revision:Number(data.revision)||0,createdAt:row.created_at}
 }
 function list(id,assemblyId){
  const obj=oid(id),aid=idx(assemblyId,"отправочной марки"),maps=dataMaps(obj,aid);
  return database.listEntity(obj,"ai-assembly-attachments")
   .filter(x=>x.record_type==="assembly_attachment"&&Number(x.data?.assemblyId)===aid)
   .map(x=>view(x,maps.placements,maps.items,obj))
 }
 function summary(id,assemblyId){
  const rows=list(id,assemblyId);
  return{total:rows.length,visible:rows.filter(x=>x.visible).length,
   holes:rows.filter(x=>x.visible&&x.type==="hole").length,
   fasteners:rows.filter(x=>x.visible&&x.type==="fastener").length,
   welds:rows.filter(x=>x.visible&&x.type==="weld").length,
   pending:rows.filter(x=>!x.visible&&x.status!=="rejected").length,
   complete:false,note:"3D-аннотации не являются вырезанными отверстиями или полным расчётом соединений"}
 }
 function save(id,recordId,cmd,{role}={}){
  const obj=oid(id);
  if(!["admin","engineer"].includes(role))throw Error("Подтверждать 3D-соединения может только инженер или администратор");
  if(!cmd||!STATUSES.has(cmd.status)||!TYPES.has(cmd.type))
   throw Error("Выберите тип и статус 3D-привязки");
  const old=recordId==null?null:record(obj,recordId),rev=Number(old?.data?.revision)||0;
  if(!Number.isSafeInteger(cmd.expectedRevision)||cmd.expectedRevision!==rev)
   throw Error("Редакция 3D-привязки устарела. Обновите страницу");
  const aid=idx(cmd.assemblyId,"отправочной марки"),maps=dataMaps(obj,aid);
  const placement=maps.placements.get(idx(cmd.placementId,"размещения детали"));
  if(!placement)throw Error("Деталь не размещена в указанной отправочной марке");
  const type=cmd.type,code=str(cmd.code,"Обозначение крепления",80,true);
  const start=point(cmd.start,"начало"),end=type==="weld"?point(cmd.end,"конец"):null;
  checkInside(start,placement.shape);
  if(end){
   checkInside(end,placement.shape);
   if(Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z)<0.01)
    throw Error("Сварной шов должен иметь ненулевую длину")
  }
  const diameterMm=type==="hole"?num(cmd.diameterMm,"Диаметр отверстия, мм",0.01,10000):null;
  const axis=type==="hole"?str(cmd.axis,"Ось отверстия",1,true):null;
  if(type==="hole"&&!AXES.has(axis))throw Error("Ось отверстия может быть X, Y или Z");
  const linked=type==="hole"?null:maps.items.get(idx(cmd.itemId,"позиции метиза/шва"));
  if(type!=="hole"&&(!linked||linked.assemblyId!==aid||
   linked.category!==(type==="weld"?"weld":"fastener")))
   throw Error("Для метиза или шва требуется соответствующая позиция ведомости КМД");
  if(cmd.status==="confirmed"){
   if(!placement.counted)throw Error("Сначала подтвердите размещение детали в 3D");
   if(linked&&!linked.counted)throw Error("Сначала подтвердите позицию метиза или шва в КМД");
  }
  const src=document(obj,cmd);
  const duplicate=list(obj,aid).find(x=>x.id!==old?.id&&x.status!=="rejected"&&
   x.placementId===placement.id&&x.type===type&&
   x.code.toLocaleUpperCase("ru-RU")===code.toLocaleUpperCase("ru-RU"));
  if(duplicate)throw Error("Такое обозначение уже есть на этой детали: № "+duplicate.id);
  const next={assemblyId:aid,placementId:placement.id,
   placementRevision:placement.revision,partId:placement.partId,
   partPosition:placement.partPosition,instanceIndex:placement.instanceIndex,
   itemId:linked?.id??null,itemRevision:linked?.revision??null,
   itemName:linked?.position||"",type,code,start,end,diameterMm,axis,
   source:src,status:cmd.status,comment:str(cmd.comment??"","Комментарий инженера",1500),
   revision:rev+1,reviewedBy:role,reviewedAt:clock(),
   origin:"engineer_placed_3d_kmd_connection_annotation"};
  if(typeof database.transaction!=="function")throw Error("Нужны атомарные транзакции SQLite");
  return database.transaction(()=>{
   const entry={record_type:"assembly_attachment",title:code,data:next};
   const saved=old?database.updateEntity(obj,"ai-assembly-attachments",old.id,entry):
    database.createEntity(obj,"ai-assembly-attachments",entry);
   if(!saved)throw Error("Не удалось сохранить 3D-привязку");
   const audit=database.createEntity(obj,"ai-assembly-attachment-history",{
    record_type:"attachment_change",parent_id:saved.id,
    title:"Изменение крепления "+code+" · "+next.revision,
    data:{attachmentId:saved.id,previous:old?.data||null,current:next,
     revision:next.revision,reviewedBy:role,reviewedAt:next.reviewedAt}
   });
   if(!audit)throw Error("Не удалось сохранить историю крепления");
   return{...view(saved,maps.placements,maps.items,obj),historyId:audit.id}
  })
 }
 function history(id,recordId){
  const obj=oid(id),entry=record(obj,recordId);
  return database.listEntity(obj,"ai-assembly-attachment-history")
   .filter(x=>x.record_type==="attachment_change"&&Number(x.parent_id)===entry.id)
   .map(x=>({id:x.id,...x.data}))
 }
 return{list,summary,save,history}
}
module.exports={createAssemblyAttachments};
