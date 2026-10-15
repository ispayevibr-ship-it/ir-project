"use strict";
/* IR Project AI: evidence-verified individual placements inside ONE KMD assembly.
 * Coordinates in millimetres, X/Y transverse, Z longitudinal. These are
 * manually provided drawing coordinates; never inferred from mass or mark label.
 */
const {createMarkQuantities}=require("./ai-mark-quantities");
const {createKmdMaterials}=require("./ai-kmd-materials");
const STATUSES=new Set(["requires_review","confirmed","rejected"]);
const SHAPES=new Set(["plate","solid_rect","ibeam","rhs","chs"]);
const EPS=0.01;
function createAssemblyGeometry({database,quantities,materials,revisions=null,clock=()=>new Date().toISOString()}={}){
 if(!database)throw Error("Требуется база IR Project");
 quantities=quantities||createMarkQuantities({database,clock});
 materials=materials||createKmdMaterials({database,quantities,clock});
 const oid=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1||!database.getObject(n))throw Error("Объект не найден");return n};
 const integer=(value,label,{min=1,max=100000}={})=>{
  if(value===""||value===null||value===undefined||typeof value==="boolean"||
   !Number.isSafeInteger(Number(value))||Number(value)<min||Number(value)>max)
   throw Error(label+": требуется целое число от "+min+" до "+max);
  return Number(value)
 };
 const num=(value,label,{min=-1000000,max=1000000}={})=>{
  if(value===""||value===undefined||value===null||typeof value==="boolean"||
   !Number.isFinite(Number(value))||Number(value)<min||Number(value)>max)
   throw Error("Не указано точное значение «"+label+"» в заданных пределах");
  return Number(value)
 };
 const plain=(value,label,max=180,required=false)=>{
  if(typeof value!=="string")throw Error(label+": требуется текст");
  const v=value.trim().replace(/\s+/g," ");
  if(v.length>max||required&&!v)throw Error("Заполните поле «"+label+"»");
  return v
 };
 function assembly(id,num){
  const assemblyId=integer(num,"Отправочная марка");
  const result=quantities.list(id).find(x=>x.id===assemblyId);
  if(!result)throw Error("Отправочная марка отсутствует в этом объекте");
  return result
 }
 function part(id,partId){
  const n=integer(partId,"Деталь КМД");
  const item=materials.list(id).find(x=>x.id===n);
  if(!item)throw Error("Деталь не найдена среди позиций КМД этого объекта");
  return item
 }
 function drawing(id,documentId,page,place,revision){
  const document=database.getEntity(id,"ai-documents",integer(documentId,"PDF КМД"));
  if(!document||document.record_type!=="document"||document.data?.kind!=="КМД"||
   document.data?.extension!==".pdf"||
   !/^[a-f0-9]{64}$/i.test(String(document.data?.sha256||"")))
   throw Error("Источник геометрии должен быть PDF КМД текущего объекта");
  return{documentId:document.id,name:String(document.data.original_name||document.title||""),
   sha256:String(document.data.sha256),kind:"КМД",
   page:integer(page,"Номер листа",{min:1,max:2000}),
   location:plain(place,"Узел/размер на листе",120,true),
   revision:plain(revision,"Изменение КМД",50,true)}
 }
 function sourceFresh(id,source){
  const doc=database.getEntity(id,"ai-documents",Number(source?.documentId));
  return Boolean(doc&&doc.record_type==="document"&&doc.data?.kind==="КМД"&&
   doc.data?.extension===".pdf"&&doc.data?.sha256===source?.sha256&&
   (!revisions||revisions.isCurrent(id,source)))
 }
 function parseShape(value){
  if(!value||typeof value!=="object"||!SHAPES.has(value.type))
   throw Error("Выберите поддерживаемый точный тип сечения");
  const type=value.type,lengthMm=num(value.lengthMm,"Длина детали, мм",{min:0.01,max:1000000});
  const p={type,lengthMm};
  if(type==="plate"||type==="solid_rect"){
   p.widthMm=num(value.widthMm,"Ширина, мм",{min:0.01,max:100000});
   p.heightMm=num(value.heightMm,"Толщина/высота, мм",{min:0.01,max:100000});
  }else if(type==="ibeam"){
   p.widthMm=num(value.widthMm,"Ширина полки, мм",{min:0.01,max:100000});
   p.heightMm=num(value.heightMm,"Высота двутавра, мм",{min:0.01,max:100000});
   p.webMm=num(value.webMm,"Толщина стенки, мм",{min:0.01,max:10000});
   p.flangeMm=num(value.flangeMm,"Толщина полки, мм",{min:0.01,max:10000});
   if(p.webMm>=p.widthMm||p.flangeMm*2>=p.heightMm)
    throw Error("Геометрия двутавра невозможна: стенка/полки превышают размеры");
  }else if(type==="rhs"){
   p.widthMm=num(value.widthMm,"Ширина трубы, мм",{min:0.01,max:100000});
   p.heightMm=num(value.heightMm,"Высота трубы, мм",{min:0.01,max:100000});
   p.wallMm=num(value.wallMm,"Толщина стенки трубы, мм",{min:0.01,max:10000});
   if(2*p.wallMm>=Math.min(p.widthMm,p.heightMm))
    throw Error("Толщина стенки прямоугольной трубы перекрывает полость");
  }else{
   p.diameterMm=num(value.diameterMm,"Наружный диаметр трубы, мм",{min:0.01,max:100000});
   p.wallMm=num(value.wallMm,"Толщина стенки трубы, мм",{min:0.01,max:10000});
   if(2*p.wallMm>=p.diameterMm)throw Error("Толщина круглой трубы перекрывает полость")
  }
  return p
 }
 const close=(a,b)=>Math.abs(a-b)<=EPS;
 function materialCompatibility(part,shape){
  if(part.type==="pipe"&&!["rhs","chs"].includes(shape.type))
   throw Error("Труба КМД требует модели полого профиля");
  if(part.type==="profile"&&!["solid_rect","ibeam","rhs","chs"].includes(shape.type))
   throw Error("Профиль КМД требует подтверждённого сечения");
  if(["plate","rib","gusset"].includes(part.type)&&shape.type!=="plate")
   throw Error("Для листовой детали используйте тип «Прямоугольная пластина»");
  if(part.lengthMm!==null&&!close(part.lengthMm,shape.lengthMm))
   throw Error("Длина в геометрии не совпадает с указанной длиной детали в ведомости КМД");
  if(part.thicknessMm!==null&&shape.type==="plate"&&
   !close(part.thicknessMm,shape.heightMm))
   throw Error("Толщина пластины не совпадает с ведомостью КМД");
  if(part.widthMm!==null&&shape.type==="plate"&&
   !close(part.widthMm,shape.widthMm))
   throw Error("Ширина пластины не совпадает с ведомостью КМД");
  if(shape.type==="plate"&&part.isSolidRectangle!==true)
   throw Error("Для точной 3D-пластины нужно подтвердить в ведомости, что нет вырезов и отверстий");
  if(!part.sourceValid)throw Error("Источник детали КМД изменён или недействителен")
 }
 function position(command){
  const raw=command?.position||{},rotation=command?.rotation||{};
  return{position:{x:num(raw.x,"X, мм"),y:num(raw.y,"Y, мм"),z:num(raw.z,"Z, мм")},
   rotation:{x:num(rotation.x,"Поворот X, °",{min:-360,max:360}),
    y:num(rotation.y,"Поворот Y, °",{min:-360,max:360}),
    z:num(rotation.z,"Поворот Z, °",{min:-360,max:360})}}
 }
 function record(id,recordId){
  const row=database.getEntity(id,"ai-assembly-placement",integer(recordId,"ID размещения"));
  if(!row||row.record_type!=="part_placement")throw Error("Размещение детали не найдено");
  return row
 }
 function rows(id){return database.listEntity(id,"ai-assembly-placement").filter(x=>x.record_type==="part_placement")}
 function view(id,row,assemblyMap,partMap){
  const d=row.data||{},a=assemblyMap.get(Number(d.assemblyId)),p=partMap.get(Number(d.partId));
  const bind=Boolean(a&&p&&p.assemblyId===a.id&&p.position===d.partPosition&&
   p.assemblyMark===a.mark&&p.cipher===a.cipher&&p.secondaryCipher===a.secondaryCipher);
  const sourceValid=sourceFresh(id,d.source);
  const assemblyRevisionValid=Boolean(a&&Number.isSafeInteger(d.assemblyRevision)&&
   d.assemblyRevision>0&&d.assemblyRevision===a.revision);
  const partRevisionValid=Boolean(p&&Number.isSafeInteger(d.partRevision)&&
   d.partRevision>0&&d.partRevision===p.revision);
  let geometryMatchesMaterial=false;
  try{if(p&&d.shape){parseShape(d.shape);materialCompatibility(p,d.shape);geometryMatchesMaterial=true}}catch{}
  const approved=Boolean(geometryMatchesMaterial&&assemblyRevisionValid&&partRevisionValid&&
   a?.status==="confirmed"&&a.sourceValid&&
   p?.status==="confirmed"&&p.counted&&bind&&sourceValid&&
   Number.isSafeInteger(d.instanceIndex)&&d.instanceIndex>0&&d.instanceIndex<=p.partCount&&
   STATUSES.has(d.status)&&d.status==="confirmed");
  return{id:row.id,assemblyId:Number(d.assemblyId)||null,
   assemblyMark:String(d.assemblyMark||""),cipher:String(d.cipher||""),
   secondaryCipher:String(d.secondaryCipher||""),
   partId:Number(d.partId)||null,partPosition:String(d.partPosition||""),
   partType:p?.type||null,partCount:p?.partCount||null,instanceIndex:d.instanceIndex||null,
   shape:d.shape||null,position:d.position||null,rotation:d.rotation||null,
   source:{...d.source},sourceValid,
   assemblyRevision:d.assemblyRevision??null,partRevision:d.partRevision??null,
   assemblyRevisionValid,partRevisionValid,
   materialValid:bind&&Boolean(p?.counted)&&geometryMatchesMaterial,
   status:STATUSES.has(d.status)?d.status:"requires_review",counted:approved,
   reason:!a?.sourceValid||!p?.sourceValid||!sourceValid?"Изменился или исчез исходный PDF КМД":
    !bind?"Деталь или связь с отправочной маркой изменена":
    !assemblyRevisionValid||!partRevisionValid?"Изменилась редакция марки или детали КМД — перепроверьте 3D":
    !geometryMatchesMaterial?"Размеры 3D не согласуются с подтверждённой деталью КМД":
    !p?.counted||a?.status!=="confirmed"?"Отправочная марка или деталь не подтверждена":
    d.status!=="confirmed"?"Геометрия ожидает проверки инженера":"",
   revision:Number(d.revision)||0,reviewedBy:d.reviewedBy||null,
   reviewedAt:d.reviewedAt||null,comment:String(d.comment||""),
   createdAt:row.created_at}
 }
 function list(id,assemblyId){
  const obj=oid(id),a=assembly(obj,assemblyId),
   as=new Map([[a.id,a]]),parts=new Map(materials.list(obj).filter(p=>p.assemblyId===a.id).map(p=>[p.id,p]));
  return rows(obj).filter(r=>Number(r.data?.assemblyId)===a.id).map(r=>view(obj,r,as,parts))
 }
 function summary(id,assemblyId){
  const obj=oid(id),a=assembly(obj,assemblyId),parts=materials.list(obj).filter(p=>p.assemblyId===a.id),
   entries=list(obj,a.id),confirmed=entries.filter(x=>x.counted);
  const counts=new Map();
  for(const item of confirmed)counts.set(item.partId,(counts.get(item.partId)||0)+1);
  const coverage=parts.filter(p=>p.status==="confirmed"&&p.counted).map(p=>({
   partId:p.id,position:p.position,required:p.partCount,modeled:counts.get(p.id)||0,
   remaining:Math.max(0,p.partCount-(counts.get(p.id)||0)),
   type:p.type
  }));
  const nonmodelable=parts.filter(p=>p.status==="confirmed"&&!p.counted);
  return{assemblyId:a.id,mark:a.mark,quantity:a.quantity,assemblyStatus:a.status,
   confirmedPlacements:confirmed.length,pendingPlacements:entries.filter(x=>!x.counted).length,
   coverage,unmodelableMaterials:nonmodelable.map(x=>({id:x.id,position:x.position,reason:x.reason})),
   noConfirmedMaterials:coverage.length===0,
   coverageReady:coverage.length>0&&coverage.every(x=>x.remaining===0)&&nonmodelable.length===0,
   complete:false,
   message:"Проверенный 3D-предпросмотр отдельных деталей; не аттестованная полная CAD-модель отправочной марки"}
 }
 function save(id,placementId,command,{role}={}){
  const obj=oid(id);
  if(!["admin","engineer"].includes(role))
   throw Error("Подтверждать геометрию может только инженер или администратор");
  if(!command||!STATUSES.has(command.status))throw Error("Выберите статус проверки 3D");
  const old=placementId==null?null:record(obj,placementId),oldRev=Number(old?.data?.revision)||0;
  if(!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision!==oldRev)
   throw Error("Размещение было изменено в другом окне; обновите данные");
  const a=assembly(obj,command.assemblyId),p=part(obj,command.partId);
  if(p.assemblyId!==a.id)throw Error("Деталь относится к другой отправочной марке");
  const instanceIndex=integer(command.instanceIndex,"Номер экземпляра детали");
  if(!p.partCount||instanceIndex>p.partCount)
   throw Error("Номер экземпляра превышает количество деталей на одну отправочную марку");
  const shape=parseShape(command.shape),pose=position(command);
  if(command.status==="confirmed"){
   if(a.status!=="confirmed"||!a.sourceValid||p.status!=="confirmed"||!p.counted)
    throw Error("Сначала подтвердите отправочную марку и её деталь КМД");
   materialCompatibility(p,shape)
  }
  const duplicate=rows(obj).find(r=>r.id!==old?.id&&r.data?.status!=="rejected"&&
   Number(r.data?.assemblyId)===a.id&&Number(r.data?.partId)===p.id&&
   Number(r.data?.instanceIndex)===instanceIndex);
  if(duplicate)throw Error("Экземпляр детали уже размещён в 3D; измените запись № "+duplicate.id);
  const source=drawing(obj,command.documentId,command.page,command.sourcePosition,command.drawingRevision);
  if(command.status==="confirmed"&&!sourceFresh(obj,source))
   throw Error("Нельзя подтвердить 3D-размещение по устаревшему листу КМД");
  const next={assemblyId:a.id,assemblyMark:a.mark,cipher:a.cipher,secondaryCipher:a.secondaryCipher,
   assemblyRevision:a.revision,partId:p.id,partPosition:p.position,
   partRevision:p.revision,instanceIndex,shape,...pose,source,
   status:command.status,comment:plain(command.comment??"","Комментарий инженера",1500),
   revision:oldRev+1,reviewedBy:role,reviewedAt:clock(),
   origin:"engineer_verified_individual_kmd_detail_placement"};
  if(typeof database.transaction!=="function")throw Error("Требуются транзакции SQLite");
  return database.transaction(()=>{
   const payload={record_type:"part_placement",title:a.mark+" / "+p.position+" № "+instanceIndex,data:next};
   const rec=old?database.updateEntity(obj,"ai-assembly-placement",old.id,payload):
    database.createEntity(obj,"ai-assembly-placement",payload);
   if(!rec)throw Error("Не удалось сохранить геометрию детали");
   const history=database.createEntity(obj,"ai-assembly-placement-history",{
    record_type:"placement_change",parent_id:rec.id,
    title:"Редакция 3D-размещения "+next.revision,
    data:{placementId:rec.id,revision:next.revision,previous:old?.data||null,
     current:next,reviewedBy:role,reviewedAt:next.reviewedAt}
   });
   if(!history)throw Error("Не удалось сохранить историю 3D-размещения");
   return{...view(obj,rec,new Map([[a.id,a]]),new Map([[p.id,p]])),historyId:history.id}
  })
 }
 function history(id,placementId){
  const obj=oid(id),rec=record(obj,placementId);
  return database.listEntity(obj,"ai-assembly-placement-history")
   .filter(x=>x.record_type==="placement_change"&&Number(x.parent_id)===rec.id)
   .map(x=>({id:x.id,...x.data}))
 }
 return{list,summary,save,history,parseShape};
}
module.exports={createAssemblyGeometry};
