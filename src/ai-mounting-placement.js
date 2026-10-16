"use strict";
/* Verified, transactional KM/KMD placement service.
 * Client-provided coordinates are only engineer-approved proposals; the main
 * process independently validates the register, grid, PDF index and current
 * placements inside a single SQLite transaction.
 */
const crypto=require("node:crypto");
const sha=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
const key=x=>String(x??"").trim().toLocaleUpperCase("ru-RU")
 .replace(/K/g,"К").replace(/B/g,"В").replace(/P/g,"Р").replace(/C/g,"С").replace(/\s+/g,"");
const placement=r=>r.record_type==="scheme_column"||r.data?.entity_type==="column";
const kindSet=new Set(["column","beam","brace"]);
const finite=(value,label)=>{
 if(value===null||value===undefined||String(value).trim()==="")throw Error("Не указано: "+label);
 const n=Number(value);
 if(!Number.isSafeInteger(n)||Math.abs(n)>100000000)
  throw Error("Некорректные миллиметры для "+label);
 return n
};
const posId=(id,name)=>{
 const v=Number(id);
 if(!Number.isSafeInteger(v)||v<1)throw Error("Неверный идентификатор "+name);
 return v
};
function createService({database,verifyDocument}={}){
 if(!database?.transaction||!database?.getObject||!database?.listEntity||
    !database?.createEntity||!database?.getEntity||!database?.deleteEntity||
    !database?.updateEntity||!database?.listRecordChildren)
  throw Error("Массовая расстановка требует защищённых SQLite-операций");
 function state(objectId){
  const id=posId(objectId,"объекта");
  if(!database.getObject(id))throw Error("Объект не найден");
  const sections=["marks","work-types","scheme","ai-documents","ai-pdf-index"];
  const rows=Object.fromEntries(sections.map(s=>[s,database.listEntity(id,s)]));
  const version=sha(sections.map(s=>[s,rows[s].map(r=>[r.id,r.record_type,r.parent_id,r.title,r.data])]));
  const grid=rows.scheme.find(r=>r.record_type==="scheme_grid"||r.data?.entity_type==="grid")?.data;
  if(!grid)throw Error("Для расстановки требуется сохранённая сетка осей");
  function positions(axes,steps,label){
   if(!Array.isArray(axes)||axes.length<2||!Array.isArray(steps)||
      steps.length!==axes.length-1)throw Error("Неполная сетка осей: "+label);
   const map=new Map(),names=new Set();
   let at=0;
   for(let i=0;i<axes.length;i++){
    const name=String(axes[i]);
    if(!name||names.has(name))throw Error("Повторяющаяся ось "+label+": "+name);
    names.add(name);map.set(name,at);
    if(i<steps.length){
     const step=finite(steps[i],"шага осей");
     if(step<1||step>1000000)throw Error("Неверный шаг между осями");
     at+=step
    }
   }
   return map
  }
  return{id,rows,version,
   x:positions(grid.axes_x,grid.x_spans_mm,"X"),
   y:positions(grid.axes_y,grid.y_spans_mm,"Y")}
 }
 function planState(st,entries){
  if(!Array.isArray(entries)||entries.length>400)
   throw Error("За одну операцию допускается не более 400 предложений");
  const accepted=[],skipped=[],occupied=new Set(),occupiedGeometry=new Set(),
   pendingGeometry=new Set(),verifiedDocs=new Set(),ordinals=new Map(),
   byMark=new Map(),titles=new Set(),
   markMap=new Map(st.rows.marks.map(r=>[String(r.id),r])),
   workMap=new Map(st.rows["work-types"].map(r=>[String(r.id),r])),
   docs=new Map(st.rows["ai-documents"].filter(r=>r.record_type==="document").map(r=>[String(r.id),r]));
  const grids=st.rows.scheme.filter(placement).sort((a,b)=>a.id-b.id);
  function signature(mId,type,x,y,ex,ey,z0,z1){
   return [mId,type,x,y,ex,ey,z0,z1].join("|")
  }
  const geo=(type,x,y,ex,ey,z0,z1)=>[type,x,y,ex,ey,z0,z1].join("|");
  for(const row of grids){
   titles.add(String(row.title||row.data?.position||""));
   const d=row.data||{},m=String(d.mark_id??"");
   if(m){
    byMark.set(m,(byMark.get(m)||0)+1);
    if(!ordinals.has(m))ordinals.set(m,new Set());
    const num=Number(d.ai_instance_ordinal);
    if(Number.isSafeInteger(num)&&num>0)ordinals.get(m).add(num)
   }
   if(kindSet.has(d.geometry_type)&&Number.isFinite(Number(d.absolute_x_mm))&&
      Number.isFinite(Number(d.absolute_y_mm))){
    const t=d.geometry_type,x=Number(d.absolute_x_mm),y=Number(d.absolute_y_mm);
    const ex=t==="column"?x:Number(d.absolute_x2_mm);
    const ey=t==="column"?y:Number(d.absolute_y2_mm);
    const z0=Number(d.z0_mm),z1=Number(d.z1_mm);
    occupied.add(signature(m,t,x,y,ex,ey,z0,z1));
    occupiedGeometry.add(geo(t,x,y,ex,ey,z0,z1));
   }
  }
  const pending=new Set();
  let nextTitle=1;
  function title(){
   let v;do{v="COL-"+String(nextTitle++).padStart(4,"0")}while(titles.has(v));
   titles.add(v);return v
  }
  function proposal(c){
   if(!c||typeof c!=="object"||Array.isArray(c))throw Error("Неверный формат предложения");
   const mId=String(posId(c.markId,"марки")),mark=markMap.get(mId);
   if(!mark)throw Error("Марка отсутствует в ведомости");
   const md=mark.data||{};
   if(key(md.mark||mark.title)!==key(c.mark))throw Error("Обозначение марки не совпадает с ведомостью");
   const matching=st.rows.marks.filter(r=>key(r.data?.mark||r.title)===key(c.mark));
   const code=String(c.projectCode||"").trim();
   if(matching.length>1)throw Error("Марка встречается в нескольких шифрах. "+
    "Автоматическая расстановка запрещена до подтверждения принадлежности PDF к шифру");
   const wid=String(md.work_type_id??""),work=workMap.get(wid);
   if(!work||work.data?.scheme_enabled!==true)throw Error("Вид работ не разрешён для схемы");
   const expectedCode=String(md.project_code||work.data?.project_code||"").trim();
   if(md.project_code&&work.data?.project_code&&key(md.project_code)!==key(work.data.project_code))
    throw Error("Шифр марки отличается от шифра вида работ");
   if(code&&key(code)!==key(expectedCode))throw Error("Шифр источника отличается от ведомости");
   const qty=finite(md.qty??md.count,"количества");
   if(qty<1||qty>100000)throw Error("Количество в ведомости должно быть целым и положительным");
   const type=String(c.type||"");
   if(!kindSet.has(type))throw Error("Неизвестный тип конструкции");
   const x=st.x.get(String(c.axisX||"")),y=st.y.get(String(c.axisY||""));
   if(x===undefined||y===undefined)throw Error("Не подтверждены начальные оси X/Y");
   const dx=finite(c.offsetXmm??0,"смещения X"),dy=finite(c.offsetYmm??0,"смещения Y");
   const sx=x+dx,sy=y+dy;
   let ex=sx,ey=sy;
   if(type!=="column"){
    const tx=st.x.get(String(c.endAxisX||"")),ty=st.y.get(String(c.endAxisY||""));
    if(tx===undefined||ty===undefined)throw Error("Не подтверждены конечные оси балки или связи");
    ex=tx+finite(c.endOffsetXmm??0,"конечного смещения X");
    ey=ty+finite(c.endOffsetYmm??0,"конечного смещения Y")
   }
   const z0=finite(c.z0Mm,"отметки низа"),z1=finite(c.z1Mm,"отметки верха");
   if(type==="column"&&z1<=z0)throw Error("Верх колонны должен быть выше низа");
   if(type!=="column"&&Math.hypot(ex-sx,ey-sy,z1-z0)<1)
    throw Error("У балки или связи совпадают начальная и конечная точки");
   const src=c.source;
   if(!src||!Number.isSafeInteger(Number(src.page))||Number(src.page)<1)
    throw Error("Нет исходного листа PDF");
   const doc=docs.get(String(posId(src.documentId,"PDF")));
   if(!doc||doc.data?.archived===true||doc.data?.sha256!==src.sha256||
      !/^[a-f0-9]{64}$/i.test(String(src.sha256||"")))
    throw Error("Оригинал PDF отсутствует, архивирован или изменил SHA-256");
   const indexedPage=st.rows["ai-pdf-index"].filter(r=>r.record_type==="pdf_text_index"&&
     Number(r.data?.source?.documentId)===Number(doc.id)&&
     r.data?.source?.sha256===src.sha256)
    .flatMap(r=>r.data?.pages||[])
    .find(p=>Number(p.page)===Number(src.page));
   if(!indexedPage)throw Error("Нет актуального индекса исходного листа PDF");
   // Trust the index, not bounding boxes provided by the renderer. These
   // rectangles locate PDF text, never independently prove mounting geometry.
   const regions=[];
   for(const region of (Array.isArray(src.regions)?src.regions:[]).slice(0,12)){
    const ids=region?.fragmentIds;
    if(!Array.isArray(ids)||!ids.length||ids.length>6||
       ids.some(i=>!Number.isSafeInteger(i)||i<0||i>=(indexedPage.fragments||[]).length))
     continue;
    const fragments=ids.map(i=>indexedPage.fragments[i]);
    const coords=fragments.flatMap(f=>[Number(f.x),Number(f.y),Number(f.width),Number(f.height)]);
    if(coords.some(v=>!Number.isFinite(v)))continue;
    const minX=Math.min(...fragments.map(f=>Number(f.x))),
      minY=Math.min(...fragments.map(f=>Number(f.y))),
      maxX=Math.max(...fragments.map(f=>Number(f.x)+Number(f.width))),
      maxY=Math.max(...fragments.map(f=>Number(f.y)+Number(f.height)));
    regions.push({fragmentIds:ids,sourceText:fragments.map(f=>String(f.text||"")).join(" ").slice(0,180),
     rectPt:{x:Math.round(minX*100)/100,y:Math.round(minY*100)/100,
      width:Math.round((maxX-minX)*100)/100,height:Math.round((maxY-minY)*100)/100}})
   }
   if(typeof verifyDocument==="function"&&!verifiedDocs.has(doc.id)){
    if(!verifyDocument(st.id,doc.id))
     throw Error("Файл PDF отсутствует либо фактический SHA-256 не совпадает");
    verifiedDocs.add(doc.id)
   }
   if(c.origin!=="text_layer"||!["plan","section"].includes(c.sheetType))
    throw Error("Нужно подтверждение расположения по монтажному плану или разрезу");
   if(!Array.isArray(c.evidence)||!c.evidence.length)
    throw Error("Нет проверяемого источника привязки");
   const sig=signature(mId,type,sx,sy,ex,ey,z0,z1);
   if(occupied.has(sig)||pending.has(sig))
    return{skip:"Такой экземпляр уже размещён или продублирован в предложениях"};
   const geom=geo(type,sx,sy,ex,ey,z0,z1);
   if(occupiedGeometry.has(geom)||pendingGeometry.has(geom))
    return{skip:"Конфликт геометрии с уже размещённой конструкцией"};

   if((byMark.get(mId)||0)>=qty)
    throw Error("Превышено количество экземпляров из ведомости");
   pending.add(sig);pendingGeometry.add(geom);
   byMark.set(mId,(byMark.get(mId)||0)+1);
   if(!ordinals.has(mId))ordinals.set(mId,new Set());
   const used=ordinals.get(mId);
   const count=byMark.get(mId);
   let ordinal=1;while(used.has(ordinal)&&ordinal<=qty)ordinal++;
   if(ordinal<count)ordinal=count;
   if(ordinal>qty)throw Error("Превышено количество физических экземпляров");
   used.add(ordinal);
   const position=title(),data={
    entity_type:"column",position,mark_id:mId,
    ai_instance_id:mId+":"+ordinal,ai_instance_ordinal:ordinal,
    mark:String(md.mark||mark.title),
    mark_name:String(md.name||""),work_type_id:wid,project_code:expectedCode,
    axis_x:String(c.axisX),axis_y:String(c.axisY),offset_x_mm:dx,offset_y_mm:dy,
    absolute_x_mm:sx,absolute_y_mm:sy,geometry_type:type,
    absolute_x2_mm:type==="column"?undefined:ex,
    absolute_y2_mm:type==="column"?undefined:ey,
    end_axis_x:type==="column"?undefined:String(c.endAxisX),
    end_axis_y:type==="column"?undefined:String(c.endAxisY),
    z0_mm:z0,z1_mm:z1,end_z_mm:type==="column"?undefined:z1,
    status:"planned",scheme_view_id:"all",
    scheme_group:type==="column"?"columns":type==="brace"?"ties":"beams",
    scheme_group_label:type==="column"?"Колонны":type==="brace"?"Связи":"Балки",
    ai_source:{documentId:Number(doc.id),sha256:src.sha256,page:Number(src.page),
     evidence:c.evidence.map(x=>String(x).slice(0,180)).slice(0,10),
     textRegions:regions,verifiedManually:true},
    ai_placement_method:"engineer_approved_plan",ai_operation_id:null
   };
   return{record_type:"scheme_column",title:position,data}
  }
  entries.forEach((c,index)=>{
   try{
    const item=proposal(c);
    if(item.skip)skipped.push({index,reason:item.skip});
    else accepted.push({index,item})
   }catch(error){skipped.push({index,reason:String(error.message||error)})}
  });
  return{ready:accepted,skipped}
 }
 function preview(objectId,entries){
  const st=state(objectId),result=planState(st,entries);
  return{objectId:st.id,token:st.version,
   ready:result.ready.map(x=>({index:x.index,mark:x.item.data.mark,
    markId:x.item.data.mark_id,instanceId:x.item.data.ai_instance_id,
    axes:x.item.data.axis_x+"/"+x.item.data.axis_y,
    xMm:x.item.data.absolute_x_mm,yMm:x.item.data.absolute_y_mm,
    endXMm:x.item.data.absolute_x2_mm??null,endYMm:x.item.data.absolute_y2_mm??null,
    z0Mm:x.item.data.z0_mm,z1Mm:x.item.data.z1_mm,
    source:x.item.data.ai_source})),
   skipped:result.skipped,total:entries?.length||0,existing:st.rows.scheme.filter(placement).length}
 }
 function apply(objectId,entries,expectedToken){
  if(typeof expectedToken!=="string"||!/^[a-f0-9]{64}$/.test(expectedToken))
   throw Error("Сначала откройте актуальный предпросмотр расстановки");
  return database.transaction(()=>{
   const st=state(objectId);
   if(st.version!==expectedToken)throw Error("Ведомость, сетка или чертежи изменились — откройте предпросмотр заново");
   const plan=planState(st,entries);
   if(!plan.ready.length)throw Error("Нет достоверно размещаемых экземпляров");
   const operationId=crypto.randomUUID(),created=[];
   for(const {item} of plan.ready){
    item.data.ai_operation_id=operationId;
    const record=database.createEntity(st.id,"scheme",item);
    if(!record?.id)throw Error("SQLite не подтвердила создание размещения");
    created.push({id:record.id,hash:sha(record.data),markId:item.data.mark_id})
   }
   const event=database.createEntity(st.id,"ai-placement-operations",{
    record_type:"placement_operation",title:"Массовая расстановка "+operationId,
    data:{operationId,status:"applied",createdAt:new Date().toISOString(),
     count:created.length,created,skipped:plan.skipped.length,source:"KM/KMD plans",
     approvedBy:"authenticated_editor",previewToken:expectedToken}
   });
   if(!event?.id)throw Error("Не удалось сохранить контрольную точку расстановки");
   return{operationId,recordId:event.id,created:created.length,
    skipped:plan.skipped,existing:st.rows.scheme.filter(placement).length}
  })
 }
 function inventory(objectId){
  const id=posId(objectId,"объекта");
  if(!database.getObject(id))throw Error("Объект не найден");
  const placed=new Map(),scheme=database.listEntity(id,"scheme");
  for(const r of scheme.filter(placement)){
   const k=String(r.data?.mark_id||"");
   if(!k)continue;
   if(!placed.has(k))placed.set(k,[]);
   placed.get(k).push(r)
  }
  const instances=[],maxInstances=10000;
  const marks=database.listEntity(id,"marks").map(r=>{
   const x=r.data||{},qty=Number(x.qty??x.count),
    list=(placed.get(String(r.id))||[]).sort((a,b)=>a.id-b.id),count=list.length;
   const valid=Number.isSafeInteger(qty)&&qty>0;
   if(valid&&instances.length+qty<=maxInstances){
    const slots=new Map(),without=[];
    for(const item of list){
     const ordinal=Number(item.data?.ai_instance_ordinal);
     if(Number.isSafeInteger(ordinal)&&ordinal>=1&&ordinal<=qty&&!slots.has(ordinal))
      slots.set(ordinal,item);
     else without.push(item)
    }
    for(const row of without){
     let j=1;while(slots.has(j)&&j<=qty)j++;
     if(j<=qty)slots.set(j,row)
    }
    for(let i=1;i<=qty;i++){
     const item=slots.get(i),auto=Boolean(item?.data?.ai_operation_id);
     instances.push({instanceId:r.id+":"+i,markId:r.id,
      mark:String(x.mark||r.title),projectCode:String(x.project_code||""),
      workTypeId:String(x.work_type_id||""),ordinal:i,
      placementStatus:item?"placed":"unplaced",
      recognitionStatus:item?"confirmed":"unprocessed",
      schemeRecordId:item?.id||null,
      placementMethod:item?auto?"automatic":"manual":null})
    }
   }
   return{markId:r.id,mark:String(x.mark||r.title),workTypeId:String(x.work_type_id||""),
    projectCode:String(x.project_code||""),quantity:qty,
    placed:count,remaining:Math.max(0,qty-count),valid}
  });
  return{positions:marks.length,totalInstances:marks.reduce((n,m)=>n+(m.valid?m.quantity:0),0),
   placed:marks.reduce((n,m)=>n+m.placed,0),
   unplaced:marks.reduce((n,m)=>n+(m.valid?m.remaining:0),0),
   instances,instancesTruncated:instances.length<marks.reduce((n,m)=>n+(m.valid?m.quantity:0),0),
   marks}
 }
 function latest(objectId){
  const id=posId(objectId,"объекта");
  if(!database.getObject(id))throw Error("Объект не найден");
  const active=database.listEntity(id,"ai-placement-operations").filter(r=>
   r.record_type==="placement_operation"&&r.data?.status==="applied");
  if(!active.length)return null;
  const item=active.reduce((a,b)=>a.id>b.id?a:b);
  return{operationId:item.data.operationId,created:item.data.count,
   createdAt:item.data.createdAt}
 }
 function undo(objectId,operationId){
  if(!/^[0-9a-f-]{36}$/i.test(String(operationId||"")))
   throw Error("Некорректная операция расстановки");
  return database.transaction(()=>{
   const st=state(objectId),event=database.listEntity(st.id,"ai-placement-operations").find(r=>
    r.record_type==="placement_operation"&&r.data?.operationId===operationId);
   if(!event||event.data?.status!=="applied")throw Error("Активная операция для отката не найдена");
   const all=database.listEntity(st.id,"ai-placement-operations").filter(r=>
    r.record_type==="placement_operation"&&r.data?.status==="applied");
   if(all.some(r=>r.id>event.id))throw Error("Сначала отмените более позднюю автоматическую расстановку");
   const ids=new Set(event.data.created.map(x=>Number(x.id)));
   for(const entry of event.data.created){
    const r=database.getEntity(st.id,"scheme",entry.id);
    if(!r||r.data?.ai_operation_id!==operationId||sha(r.data)!==entry.hash)
     throw Error("Элемент №"+entry.id+" был вручную изменён — безопасный откат запрещён");
   }
   const children=database.listRecordChildren(st.id).find(r=>
    ids.has(Number(r.parent_id))&&!ids.has(Number(r.id)));
   if(children)throw Error("Элементы расстановки имеют связанные записи; откат запрещён");
   for(const entry of event.data.created)
    if(!database.deleteEntity(st.id,"scheme",entry.id))
     throw Error("Не удалось откатить элемент №"+entry.id);
   const updated=database.updateEntity(st.id,"ai-placement-operations",event.id,{
    record_type:event.record_type,title:event.title,
    data:{...event.data,status:"undone",undoneAt:new Date().toISOString()}
   });
   if(!updated)throw Error("Не удалось зафиксировать откат в журнале");
   return{undone:event.data.created.length,operationId}
  })
 }
 return{preview,apply,undo,latest,inventory}
}
module.exports={createService};
