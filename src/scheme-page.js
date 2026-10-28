"use strict";
// Visible immediately on navigation, before the DB and GPU work begins.
// A generation token prevents an old paint callback from hiding a newer load.
const irSchemeLoading=(()=>{
 let active=null,nextId=0;
 function begin(){
  const id=++nextId,route=location.hash;
  active?.element?.remove();
  const element=document.createElement("div");
  element.id="irSchemeLoading";
  element.className="ir-scheme-loading";
  element.setAttribute("role","status");
  element.setAttribute("aria-live","polite");
  element.innerHTML='<div class="ir-scheme-loading-card">'+
   '<div class="ir-scheme-loading-wheel" aria-hidden="true"></div>'+
   '<strong>Загрузка монтажной схемы</strong>'+
   '<p>Подготавливаем оси, элементы и 3D-модель…</p>'+
   '</div>';
  document.body.appendChild(element);
  active={id,route,element};
  const current=()=>active?.id===id&&active.element===element;
  const cancel=()=>{if(current()){element.remove();active=null}};
  return {
   cancel,
   done(){
    if(!current())return;
    requestAnimationFrame(()=>{if(current()&&location.hash===route)cancel()})
   },
   fail(error){
    if(!current())return;
    const card=element.querySelector(".ir-scheme-loading-card");
    if(!card)return cancel();
    card.classList.add("error");
    card.innerHTML='<strong>Не удалось загрузить монтажную схему</strong>'+
     '<p>Проверьте данные или попробуйте открыть схему повторно.</p>'+
     '<button type="button" class="ir-scheme-loading-back">Вернуться к объекту</button>';
    card.querySelector("button").onclick=()=>{cancel();location.hash=route.replace(/\/scheme$/,"")};
    console.error("Монтажная схема: ошибка загрузки",error)
   }
  }
 }
 window.addEventListener("hashchange",()=>{
  if(active&&location.hash!==active.route){active.element.remove();active=null}
 });
 return{begin}
})();
window.irSchemePage=async function(objectId){
 const oid=String(objectId||"");if(!oid)return;
 const loading=irSchemeLoading.begin(),requestedRoute=location.hash;
 try{
 const app=document.getElementById("app"),root=irProject.data.forObject(oid),schemeApi=root.section("scheme"),object=await irProject.data.objects.get(oid);
 if(location.hash!==requestedRoute){loading.cancel();return}
 if(!object){loading.cancel();location.hash="/objects";return}
 const canEdit=()=>window.irAccess?window.irAccess.canEdit("scheme"):false;
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const fmt=v=>Number(num(v).toFixed(1)).toLocaleString("ru-RU",{maximumFractionDigits:1});
 const defaultAxesX=["1","2","3","4","5","6"],defaultAxesY=["А","Б","В","Г","Д","Е","Ж","И","К","Л"],defaultSpanX=45000,defaultSpanY=60000;
 let axesX=[...defaultAxesX],axesY=[...defaultAxesY],targetSpanX=defaultSpanX,targetSpanY=defaultSpanY,gridDirX="ltr",gridDirY="btt";
 let frameMode=true,selectedId="",activeWorkId="",activeScheme="all",rows=[],markRows=[],workRows=[],gridXSpans=[],gridYSpans=[],spanX=targetSpanX,spanY=targetSpanY,axisXPos=new Map(),axisYPos=new Map(),labelsVisible=false,dimensionsVisible=false,hiddenGroups=new Set(),hiddenSections=new Set(),confFilter="all",statusFilter="all",levelMin="",levelMax="",layersPanelOpen=false,elementSearch="",pickerScrollTop=0,previewFullscreen=false,previewNativeFullscreen=false,previewOriginalOverflow="";

 // Shared view state: neither the 2D plan nor 3D owns a separate data model.
 // The scheme opens coloured by montage (the engineer, 25.10.2026: «по стандарту первым вывод делай монтаж в схеме»); a
 // colouring chosen after that is kept.
 let schemeColorMode="status",cutHidden=[];
 try{
  const mode=localStorage.getItem("ir-project-3d-colors");
  if(localStorage.getItem("ir-project-3d-colors-v3")==="ready"&&["status","type","mark","confidence"].includes(mode))schemeColorMode=mode;
  const saved=JSON.parse(localStorage.getItem("ir-project-3d-sections."+oid)||"[]");
  if(Array.isArray(saved))cutHidden=saved.filter(x=>typeof x==="string")
 }catch(_error){}
 const cutBands=()=>[
  ...axesX.slice(0,-1).map((axis,i)=>({id:"x:"+axis+":"+axesX[i+1],axis:"X",label:axis+"–"+axesX[i+1],index:i})),
  ...axesY.slice(0,-1).map((axis,i)=>({id:"y:"+axis+":"+axesY[i+1],axis:"Y",label:axis+"–"+axesY[i+1],index:i}))
 ];
 const cutFor=(c,axis)=>{
  const bands=cutBands().filter(b=>b.axis===axis);
  if(!bands.length)return null;
  const positions=axis==="X"?axesX.map(a=>num(axisXPos.get(a))):axesY.map(a=>num(axisYPos.get(a)));
  const pos=axis==="X"?(c.geometryType==="column"?num(c.x):c.geometryType==="bent"?(num(c.x)+num(c.mx)+num(c.x2))/3:(num(c.x)+num(c.x2))/2):
   c.geometryType==="column"?num(c.y):c.geometryType==="bent"?(num(c.y)+num(c.my)+num(c.y2))/3:(num(c.y)+num(c.y2))/2;
  return bands.find(b=>pos>=Math.min(positions[b.index],positions[b.index+1])-.1&&pos<=Math.max(positions[b.index],positions[b.index+1])+.1)||
   bands.reduce((a,b)=>Math.abs((positions[b.index]+positions[b.index+1])/2-pos)<Math.abs((positions[a.index]+positions[a.index+1])/2-pos)?b:a,bands[0])
 };
 const planCutVisible=c=>!["X","Y"].some(axis=>{const band=cutFor(c,axis);return band&&cutHidden.includes(band.id)});
 const changeColorMode=next=>{
  if(!["status","type","mark","confidence"].includes(next))return;
  schemeColorMode=next;
  try{localStorage.setItem("ir-project-3d-colors",next);localStorage.setItem("ir-project-3d-colors-v3","ready")}catch(_error){}
  renderScene()
 };
 const backgroundChoices=["standard","white","gray","blue","sand","dark","custom"],
  backgroundStorageKey="ir-project.scheme-background."+oid;
 let schemeBackground="standard",schemeCustomBackground="#e9f2ff";
 const isHexColor=v=>/^#[\da-f]{6}$/i.test(String(v||""));
 try{
  const stored=JSON.parse(window.localStorage?.getItem(backgroundStorageKey)||"null");
  if(stored&&backgroundChoices.includes(stored.mode))schemeBackground=stored.mode;
  if(stored&&isHexColor(stored.color))schemeCustomBackground=stored.color.toLowerCase()
 }catch(e){}
 const currentBackground=()=>schemeBackground;
 const currentCustomBackground=()=>schemeCustomBackground;
 const backgroundIsDark=()=>{
  const selected=currentBackground();
  if(selected==="dark")return true;
  if(selected!=="custom")return false;
  const hex=currentCustomBackground(),r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return(r*299+g*587+b*114)/1000<155
 };
 function applySchemeBackground(selected=currentBackground(),color=currentCustomBackground()){
  if(!backgroundChoices.includes(selected))selected="standard";
  schemeBackground=selected;
  if(isHexColor(color))schemeCustomBackground=color.toLowerCase();
  const stage=document.getElementById("schemePreviewStage");
  if(stage){
   stage.dataset.schemeBackground=currentBackground();
   stage.dataset.schemeContrast=backgroundIsDark()?"dark":"light";
   stage.style.setProperty("--scheme-custom-background",currentCustomBackground())
  }
  const select=document.getElementById("schemeBackgroundSelect");
  if(select)select.value=currentBackground();
  const custom=document.getElementById("schemeBackgroundCustom");
  if(custom){custom.value=currentCustomBackground();custom.hidden=currentBackground()!=="custom"}
  try{window.localStorage?.setItem(backgroundStorageKey,JSON.stringify({mode:currentBackground(),color:currentCustomBackground()}))}catch(e){}
  renderScene()
 }
 [rows,markRows,workRows]=await Promise.all([schemeApi.list().catch(()=>[]),root.section("marks").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);
 if(location.hash!==requestedRoute){loading.cancel();return}
 const equalSpans=(total,count)=>{count=Math.max(1,count);const base=Math.floor(total/count),rem=Math.round(total-base*count);return Array.from({length:count},(_,i)=>base+(i<rem?1:0))};
 const validAxes=v=>Array.isArray(v)&&v.length>=2&&v.every(x=>String(x||"").trim());
 const validSpans=(v,count,total)=>Array.isArray(v)&&v.length===count&&v.every(x=>num(x)>0)&&Math.abs(v.reduce((s,x)=>s+num(x),0)-total)<.11;
 // Grid and view records are unchanged during a single render. Recomputing
 // them for every steel member made legacy placements O(members * DB rows).
 let gridRowsSnapshot=null,gridRowSnapshot=null;
 let viewRowsSnapshot=null,viewWorkSnapshot=null,viewRowsSnapshotValue=[];
 const emptyGrid=Object.freeze({});
 const gridRecord=()=>{
  if(gridRowsSnapshot!==rows){
   gridRowsSnapshot=rows;
   gridRowSnapshot=arr(rows).find(r=>r.record_type==="scheme_grid"||r.data?.entity_type==="grid")||null
  }
  return gridRowSnapshot
 };
 const customViews=()=>{
  if(viewRowsSnapshot!==rows||viewWorkSnapshot!==activeWorkId){
   viewRowsSnapshot=rows;viewWorkSnapshot=activeWorkId;
   viewRowsSnapshotValue=arr(rows).filter(r=>(r.record_type==="scheme_view"||r.data?.entity_type==="scheme_view")&&String(r.data?.work_type_id||"")===activeWorkId)
  }
  return viewRowsSnapshotValue
 };
 let activeViewSnapshotRows=null,activeViewSnapshotWork=null,activeViewSnapshotKey=null,activeViewSnapshot=null;
 const activeView=()=>{
  if(frameMode)return null;
  if(activeViewSnapshotRows!==rows||activeViewSnapshotWork!==activeWorkId||activeViewSnapshotKey!==activeScheme){
   activeViewSnapshotRows=rows;activeViewSnapshotWork=activeWorkId;activeViewSnapshotKey=activeScheme;
   activeViewSnapshot=customViews().find(r=>"view:"+r.id===activeScheme)||null
  }
  return activeViewSnapshot
 };
 const baseGrid=()=>gridRecord()?.data||emptyGrid;
 const activeGrid=()=>activeView()?.data?.grid||baseGrid();
 const groupKeys=v=>arr(v?.data?.mark_groups).map(String);
 const availableGroups=()=>{const map=new Map();for(const m of workMarks()){const g=markGroup(m),x=map.get(g.key)||{...g,count:0};x.count++;map.set(g.key,x)}return [...map.values()].sort((a,b)=>a.label.localeCompare(b.label,"ru"))};
 const gridCoords=(g,key)=>{const x=key==="x",axes=validAxes(g[x?"axes_x":"axes_y"])?g[x?"axes_x":"axes_y"]:(x?defaultAxesX:defaultAxesY),total=num(g[x?"span_x_mm":"span_y_mm"])||(x?defaultSpanX:defaultSpanY),spans=validSpans(g[x?"x_spans_mm":"y_spans_mm"],axes.length-1,total)?g[x?"x_spans_mm":"y_spans_mm"]:equalSpans(total,axes.length-1);return cumulative(axes,spans)};
 let baseCoordGrid=null,baseCoordX=null,baseCoordY=null;
 const worldPosition=c=>{
  if(c.absolute_x_mm!==undefined&&c.absolute_y_mm!==undefined&&Number.isFinite(Number(c.absolute_x_mm))&&Number.isFinite(Number(c.absolute_y_mm)))
   return{x:Number(c.absolute_x_mm),y:Number(c.absolute_y_mm)};
  const grid=baseGrid();
  if(baseCoordGrid!==grid){baseCoordGrid=grid;baseCoordX=gridCoords(grid,"x");baseCoordY=gridCoords(grid,"y")}
  return{x:num(baseCoordX.get(String(c.axis_x)))+num(c.offset_x_mm),y:num(baseCoordY.get(String(c.axis_y)))+num(c.offset_y_mm)}
 };
 const cumulative=(axes,spans)=>{let at=0;return new Map(axes.map((axis,i)=>{const here=at;if(i<spans.length)at+=num(spans[i]);return[axis,here]}))};
 const refreshGridModel=()=>{const g=activeGrid();axesX=validAxes(g.axes_x)?g.axes_x.map(x=>String(x).trim()):[...defaultAxesX];axesY=validAxes(g.axes_y)?g.axes_y.map(x=>String(x).trim()):[...defaultAxesY];gridDirX=g.x_direction==="rtl"?"rtl":"ltr";gridDirY=g.y_direction==="ttb"?"ttb":"btt";targetSpanX=num(g.span_x_mm)>0?num(g.span_x_mm):defaultSpanX;targetSpanY=num(g.span_y_mm)>0?num(g.span_y_mm):defaultSpanY;const gx=validSpans(g.x_spans_mm,axesX.length-1,targetSpanX)?g.x_spans_mm.map(num):equalSpans(targetSpanX,axesX.length-1),gy=validSpans(g.y_spans_mm,axesY.length-1,targetSpanY)?g.y_spans_mm.map(num):equalSpans(targetSpanY,axesY.length-1);gridXSpans=gx;gridYSpans=gy;spanX=gx.reduce((s,x)=>s+x,0);spanY=gy.reduce((s,x)=>s+x,0);axisXPos=cumulative(axesX,gx);axisYPos=cumulative(axesY,gy)};
 const workById=new Map(arr(workRows).map(r=>[String(r.id),r.data||{}]));
 const marks=arr(markRows).map(r=>({id:String(r.id),title:r.title||"",...(r.data||{})}));
 const norm=s=>String(s||"").trim().toLowerCase().replace(/ё/g,"е");
 const enabledWorks=()=>arr(workRows).filter(r=>r.data?.scheme_enabled===true).map(r=>({id:String(r.id),name:r.data?.work_type||r.title||"Без названия",code:r.data?.project_code||"",data:r.data||{}}));
 const schemeGroupOf=(name,mark="")=>{const st=window.irStructureTypes?.typeByName?.(name);if(st){const g=window.irStructureTypes.group(st.group);return{key:g.key,label:g.label}}const s=norm(name);if(s.includes("резервуар")||s.includes("стенк"))return{key:"tanks",label:"Резервуар"};if(s.includes("патруб")||s.includes("люк"))return{key:"nozzles",label:"Патрубки, люки"};if(s.includes("крыш"))return{key:"roof",label:"Крыша"};if(s.includes("фахвер"))return{key:"fahwerk",label:"Фахверк"};if(s.includes("колон"))return{key:"columns",label:"Колонны"};if(s.includes("связ"))return{key:"ties",label:"Связи"};if(s.includes("прогон"))return{key:"purlins",label:"Прогоны"};if(s.includes("распорк"))return{key:"spacers",label:"Распорки"};if(s.includes("балк"))return{key:"beams",label:"Балки"};if(s.includes("ферм"))return{key:"trusses",label:"Фермы"};if(s.includes("ригел"))return{key:"girders",label:"Ригели"};if(s.includes("огражд"))return{key:"guards",label:"Ограждения"};if(s.includes("лестн"))return{key:"stairs",label:"Лестницы"};if(s.includes("площад"))return{key:"platforms",label:"Площадки"};if(s.includes("стойк"))return{key:"posts",label:"Стойки"};const raw=String(name||mark||"Прочие марки").trim()||"Прочие марки",key="name:"+norm(raw).replace(/[^a-zа-я0-9]+/gi,"-").replace(/^-|-$/g,"");return{key,label:raw}};
 const markGroupCache=new WeakMap();
 // A mark and its elements are of one kind (the engineer, 28.10.2026: «1 марок - 535 элемента, это как понять?» —
 // «Стойки: 12 марок, 0 элементов», «Фахверк: 0 марок, 563 элемента»): the kind of the mark by its name in the register;
 // a mark the register names no kind of (no name, a word that is no kind) — the kind most of its elements were placed
 // with by the analysis.
 let placedKinds=null,placedKindsOf=null;
 const placedKind=id=>{
  const list=allRecords();
  if(placedKindsOf!==list){placedKindsOf=list;placedKinds=new Map();const count=new Map();
   for(const r of list){const g=String(r.scheme_group||"");if(!g||g==="all"||!r.mark_id)continue;const k=String(r.mark_id),c=count.get(k)||new Map();c.set(g,(c.get(g)||{n:0,label:r.scheme_group_label}));c.get(g).n++;count.set(k,c)}
   for(const [k,c] of count){const [key,best]=[...c].sort((a,b)=>b[1].n-a[1].n)[0];placedKinds.set(k,{key,label:frameLabels[key]||String(best.label||key)})}}
  return placedKinds.get(String(id))||null
 };
 const markGroup=m=>{
  let group=m&&typeof m==="object"&&markGroupCache.has(m)?markGroupCache.get(m):null;
  if(!group){group=schemeGroupOf([m?.name,m?.work_type,workById.get(String(m?.work_type_id||""))?.work_type].filter(Boolean).join(" "),m?.mark||m?.title);
   if(m&&typeof m==="object")markGroupCache.set(m,group)}
  return!frameKeys.has(group.key)&&m?.id!=null&&placedKind(m.id)||group
 };
  const frameCategories=window.irStructureTypes?window.irStructureTypes.GROUPS.map(g=>g.key):["columns","fahwerk","girders","purlins","spacers","ties","beams","trusses","posts","tanks","bottom","roof","nozzles","stairs","platforms","guards"];
  const frameKeys=new Set(frameCategories);
  const frameLabels=window.irStructureTypes?Object.fromEntries(window.irStructureTypes.GROUPS.map(g=>[g.key,g.label])):{columns:"Колонны",fahwerk:"Фахверки",girders:"Ригели",purlins:"Прогоны",spacers:"Распорки",ties:"Связи",beams:"Балки",posts:"Стойки",tanks:"Резервуар",bottom:"Днище",roof:"Крыша",nozzles:"Патрубки, люки",stairs:"Лестницы",platforms:"Площадки",guards:"Ограждения"};
 const markLabel=m=>{const w=workById.get(String(m.work_type_id||""))||{},name=m.name||"",wt=w.work_type||m.work_type||"";return [m.mark||m.title||"Без марки",name||wt].filter(Boolean).join(" · ")};

 const markById=new Map(marks.map(m=>[m.id,m]));
 // Preserve the original unique-match rules for old records without IDs,
 // but use indexed lookups instead of filtering every mark per member.
 const marksByName=new Map(),marksByWorkName=new Map();
 const markLookupKey=(workId,label)=>String(workId)+"\u001f"+norm(label);
 const appendMarkLookup=(index,key,value)=>{
  let values=index.get(key);if(!values){values=[];index.set(key,values)}values.push(value)
 };
 function rebuildMarkLookup(){
  marksByName.clear();marksByWorkName.clear();
  for(const mark of marks){
   const label=norm(mark.mark||mark.title);
   appendMarkLookup(marksByName,label,mark);
   appendMarkLookup(marksByWorkName,markLookupKey(mark.work_type_id||"",label),mark)
  }
 }
 rebuildMarkLookup();
 let updatingMarkProgress=false,syncNotice=null;
 async function refreshSchemeMarkProgress(){
  if(updatingMarkProgress)return;updatingMarkProgress=true;syncNotice=null;
  const button=document.getElementById("schemeRefreshMarkProgress"),message=document.getElementById("schemeMarkSyncNotice");
  if(button){button.disabled=true;button.textContent="Обновляем…"}
  if(message){message.hidden=false;message.className="scheme-mark-sync-result pending";message.textContent="Сверяем ежедневные отчёты и обновляем ведомость марок…"}
  const snapshot=m=>({id:String(m.id),mark:String(m.mark||m.title||""),workId:String(m.work_type_id||""),qty:Math.max(0,num(m.qty??m.count)),mounted:Math.max(0,num(m.mounted??m.done))});
  const before=new Map(activeMarks().map(m=>{const v=snapshot(m);return[v.id,v]}));
  try{
   if(typeof window.irSyncMountedFromReports!=="function")throw Error("Модуль сверки отчётов не подключён. Перезапустите приложение после обновления.");
   const audit=await window.irSyncMountedFromReports(oid);mountDays=null;
   const fresh=await root.section("marks").list();
   const updated=arr(fresh).map(x=>({id:String(x.id),title:x.title||"",...(x.data||{})}));
   markRows=fresh;marks.splice(0,marks.length,...updated);
   markById.clear();marks.forEach(x=>markById.set(x.id,x));
   rebuildMarkLookup();
   cachedPlacementRows=null; // refreshed mark links invalidate the quota index
   const after=activeMarks().map(snapshot),seen=new Set(),changed=[];
   for(const v of after){
    seen.add(v.id);const old=before.get(v.id);
    if(!old||old.qty!==v.qty||old.mounted!==v.mounted)changed.push(v.mark||v.id)
   }
   for(const old of before.values())if(!seen.has(old.id))changed.push(old.mark||old.id);
   const summary=statusCounts(),names=[...new Set(changed)].slice(0,5);
   const details=changed.length?"Изменено марок: "+changed.length+(names.length?" ("+names.join(", ")+(changed.length>names.length?", …":"")+")":"")+".":"Изменений нет.";
   const verified="Сверено отчётов: "+audit.reportsChecked+", строк с привязкой к маркам: "+audit.linkedLines+". В ведомости объекта обновлено позиций: "+audit.updated+". ";
   const warnings=(audit.unrecognizedIds?.length?" В отчётах найдены отсутствующие в ведомости ID марок: "+audit.unrecognizedIds.length+".":"")+(audit.withoutMarkId?" Строк с названием марки, но без ID: "+audit.withoutMarkId+".":"");
   syncNotice={ok:true,text:"✓ Проверено в "+new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit",second:"2-digit"})+". "+verified+details+" Смонтировано "+fmt(summary.mounted)+" из "+fmt(summary.total)+" шт., осталось "+fmt(summary.left)+" шт."+warnings};
  }catch(e){
   syncNotice={ok:false,text:"Не удалось обновить ведомость: "+String(e?.message||e)}
  }finally{
   updatingMarkProgress=false;draw();
   const ready=document.getElementById("schemeRefreshMarkProgress");if(ready){ready.disabled=false;ready.textContent="↻ Обновить по ведомости"}
  }
 }
 const markProgress=m=>{
  if(!m)return null;
  const total=Math.max(0,num(m.qty??m.count)),mounted=Math.min(total,Math.max(0,num(m.mounted??m.done)));
  return{total,mounted,left:Math.max(0,total-mounted),state:total<=0?"unknown":mounted>=total-1e-9?"mounted":mounted>0?"partial":"planned"}
 };
 // The days of mounting of each mark by the daily reports (their sum is the register's «смонтировано», report-mounted-sync):
 // the day its count was reached and the last day of work on it — the card shows «смонтирован 24.09.2026» (the engineer,
 // 27.10.2026, after the report of 21.10).
 let mountDays=null,mountDaysLoading=null;
 function loadMountDays(){
  if(mountDays)return Promise.resolve(mountDays);
  if(!mountDaysLoading)mountDaysLoading=root.section("reports").list().then(list=>{
   const by=new Map();
   for(const report of arr(list)){
    const d=report?.data||report||{},day=String(d.date||d.report_date||"").slice(0,10),works=Array.isArray(d.items)?d.items:Array.isArray(d.works)?d.works:[];
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day))continue;
    for(const w of works){
     if(w?.accounting_type==="service"||w?.is_service===true)continue;
     const id=String(w?.mark_id??w?.markId??"").trim(),q=Math.max(0,num(w?.qty??w?.count??w?.quantity));if(!id||!q)continue;
     if(!by.has(id))by.set(id,[]);by.get(id).push([day,q])
    }
   }
   by.forEach(l=>l.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0));return mountDays=by
  }).catch(()=>mountDays=new Map()).finally(()=>{mountDaysLoading=null});
  return mountDaysLoading
 }
 const ruDay=d=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d||""));return m?m[3]+"."+m[2]+"."+m[1]:""};
 const mountDay=(m,progress)=>{
  const l=m&&mountDays?.get(String(m.id));if(!l?.length||!progress?.total)return{date:"",more:""};
  let sum=0,done="";for(const [day,q] of l){sum+=q;if(!done&&sum>=progress.total-1e-9)done=day}
  return progress.state==="mounted"?{date:ruDay(done),more:""}:progress.state==="partial"?{date:"",more:fmt(progress.mounted)+" из "+fmt(progress.total)+" шт., последний монтаж "+ruDay(l[l.length-1][0])}:{date:"",more:""}
 };
 const linkedMark=r=>{
  const byId=markById.get(String(r.mark_id||"")),workId=recordWorkId(r);
  if(byId&&String(byId.work_type_id||"")===workId)return byId;
  const candidates=marksByWorkName.get(markLookupKey(workId,r.mark))||[];
  return candidates.length===1?candidates[0]:null
 };
 const effectiveStatus=r=>{
  const progress=markProgress(linkedMark(r));
  return progress&&progress.state!=="unknown"?progress.state:String(r.status||"planned")
 };
 const statusCounts=()=>{
  const m=activeMarks(),placed=records(),total=m.reduce((acc,x)=>acc+(markProgress(x)?.total||0),0),mounted=m.reduce((acc,x)=>acc+(markProgress(x)?.mounted||0),0),partial=placed.filter(x=>effectiveStatus(x)==="partial").length,done=placed.filter(x=>effectiveStatus(x)==="mounted").length;
  return{total,mounted,left:Math.max(0,total-mounted),pct:total?Math.round(mounted/total*100):0,placed:placed.length,placedMounted:done,placedPartial:partial}
 };
 // Cache the placed records once per database snapshot. The editor previously
 // rescanned the complete scheme for every mark and every filter refresh.
 let cachedSchemeRows=null,cachedSchemeElements=[],indexedSchemeElements=new Map();
 let cachedPlacementRows=null,cachedPlacementCounts=new Map();
 const allRecords=()=>{
  if(cachedSchemeRows!==rows){
   cachedSchemeRows=rows;
   cachedSchemeElements=arr(rows).filter(r=>r.record_type==="scheme_column"||r.data?.entity_type==="column")
    .map(r=>({id:String(r.id),title:r.title||"",...(r.data||{})}));
   indexedSchemeElements=new Map(cachedSchemeElements.map(r=>[String(r.id),r]));
   cachedPlacementRows=null;
  }
  return cachedSchemeElements;
 };
 const storedSchemeElement=id=>{allRecords();return indexedSchemeElements.get(String(id))||null};
 // Merge the normalized saved row from SQLite: a second full list() is not
 // necessary for a single create/update and would block a large 3D view.
 function rememberSavedSchemeRecord(saved){
  if(saved?.id==null)return false;
  const id=String(saved.id),at=arr(rows).findIndex(r=>String(r.id)===id);
  rows=at>=0?rows.map((r,i)=>i===at?saved:r):[saved,...rows];
  return true
 }
 const recordWorkId=r=>{
  const direct=String(r?.work_type_id||"");if(direct)return direct;
  const byId=markById.get(String(r?.mark_id||""));
  if(byId?.work_type_id)return String(byId.work_type_id);
  const matches=marksByName.get(norm(r?.mark))||[];
  return matches.length===1?String(matches[0].work_type_id||""):""
 };
 const workMarks=()=>frameMode?marks.filter(m=>frameKeys.has(markGroup(m).key)):activeWorkId?marks.filter(m=>String(m.work_type_id||"")===activeWorkId):[];
 const workRecords=()=>frameMode?allRecords().filter(r=>frameKeys.has(recordMarkGroup(r).key)):activeWorkId?allRecords().filter(r=>recordWorkId(r)===activeWorkId):[];
 const recordGroup=r=>r?.scheme_group&&String(r.scheme_group)!=="all"?{key:String(r.scheme_group),label:String(r.scheme_group_label||schemeGroupOf(r.mark_name,r.mark).label)}:schemeGroupOf(r?.mark_name,r?.mark);
 const recordMarkGroup=r=>{const m=markById.get(String(r.mark_id||""));return m?markGroup(m):recordGroup(r)};
 // What the analysis found the element to be draws it in 3D (`role`: a wall girder of the framing on its brackets, a
 // brace with its gussets) — the kind of its mark only counts and colours it: «Стеновой ригель» counted with the girders
 // lost its brackets and hung in the air (the engineer, 28.10.2026: «на чем держится? в воздухе будто висит»).
 const recordRole=r=>r.import_batch&&r.scheme_group&&String(r.scheme_group)!=="all"?String(r.scheme_group):recordMarkGroup(r).key;
 const inView=(r,v)=>{const assigned=String(r.scheme_view_id||"");return assigned?assigned!=="all"&&assigned===String(v.id):groupKeys(v).includes(recordMarkGroup(r).key)};
 const schemeGroups=()=>{const scoped=workMarks(),placed=workRecords();if(frameMode)return[{key:"all",label:"Весь каркас",marks:scoped.length,placed:placed.length},...frameCategories.map(key=>({key,label:frameLabels[key],marks:scoped.filter(m=>markGroup(m).key===key).length,placed:placed.filter(r=>recordMarkGroup(r).key===key).length})).filter(g=>g.marks>0||g.placed>0||g.key===activeScheme)];return[{key:"all",label:"Общая схема",marks:scoped.length,placed:placed.length},...customViews().map(v=>({key:"view:"+v.id,label:v.data?.name||v.title||"Новая сетка",marks:scoped.filter(m=>groupKeys(v).includes(markGroup(m).key)).length,placed:placed.filter(r=>inView(r,v)).length}))]};
 const records=()=>{const v=activeView();return activeScheme==="all"?workRecords():frameMode?workRecords().filter(r=>recordMarkGroup(r).key===activeScheme):v?workRecords().filter(r=>inView(r,v)):[]};
 const activeGroup=()=>schemeGroups().find(g=>g.key===activeScheme)||schemeGroups()[0];
 const activeMarks=()=>{const scoped=workMarks(),v=activeView();return activeScheme==="all"?scoped:frameMode?scoped.filter(m=>markGroup(m).key===activeScheme):v?scoped.filter(m=>groupKeys(v).includes(markGroup(m).key)):[]};
 if(!activeWorkId)activeWorkId=enabledWorks()[0]?.id||String(workRows[0]?.id||"");
 refreshGridModel();
 const guessGeometry=m=>{const key=markGroup(m).key;if(["columns","fahwerk","posts"].includes(key))return"column";if(key==="ties")return"brace";if(key==="trusses")return"truss";return"beam"};
 const geometry=c=>["column","beam","bent","brace","truss","shell","plate"].includes(c.geometry_type)?c.geometry_type:c.absolute_x2_mm!==undefined&&c.absolute_y2_mm!==undefined?guessGeometry(c):"column";
 const FITTING_LABEL={nozzle:"Патрубок",manhole:"Люк-лаз",hatch:"Люк на крыше",valve:"Клапан",foam:"Пеногенератор",ring:"Кольцо на стенке",rod:"Молниеприёмник",sensor:"Патрубок прибора",railing:"Ограждение",flight:"Лестничный марш",ladder:"Стремянка",deck:"Настил площадки",panel:"Сэндвич-панели",trim:"Нащельник, доборный элемент"};
 // A window, a door, a gate — its block, height × width as its mark writes them; a sandwich panel — its thickness.
const fittingSection=c=>c.ft==="flight"||c.ft==="ladder"||c.ft==="deck"?(c.fd>0?"Ширина "+Math.round(c.fd):""):
 c.ft==="window"||c.ft==="door"||c.ft==="gate"?"Блок "+(c.fd>0?Math.round(c.fd)+"×"+Math.round(num(c.lay?.width_mm)||Math.hypot(c.x2-c.x,c.y2-c.y))+" (высота × ширина)":""):
 c.ft==="panel"?"Сэндвич-панель"+(num(c.lay?.thickness_mm)>0?" "+Math.round(num(c.lay.thickness_mm))+" мм":""):c.ft==="trim"?"Фасонный элемент":
 c.ft&&c.ft!=="ring"&&c.ft!=="railing"?"Труба"+(c.fd>0?" Ø"+Math.round(c.fd):""):"";
 const SHAPE_SECTION={ibeam:"Двутавр",channel:"Швеллер",angle:"Уголок",round:"Труба",plate:"Лист",shell:"Лист (обечайка)",ring:"Лист (кольцо)",rail:"Уголок (ограждение)",stair:"Швеллер (косоур марша)",truss:"Ферма",frame:"Рама",box:"Короб",manhole:"Труба с крышкой (люк)",hatch:"Труба с крышкой (люк)",valve:"Труба с клапаном",foam:"Пеногенератор",sensor:"Труба",nozzle:"Труба",rod:"Стержень",panel:"Сэндвич-панель",trim:"Гнутый элемент (нащельник, планка)"};
 // The section of an element without a profile read from the drawings: what the catalog says it is made of
 // (a tank wall is a sheet, a railing — angles, a nozzle — a pipe), not an I-beam by default.
 const catalogSection=c=>{if(c.ft==="railing")return"Уголок (стойки, поручень)";const t=window.irStructureTypes?.byKey?.get?.(String(c.type_key||""));
  if(t)return SHAPE_SECTION[t.shape]||"";return c.geometryType==="shell"?"Лист (обечайка)":c.geometryType==="plate"?"Лист":""};
 const hasProfile=c=>String(c?.profile_name||"").trim()!=="";
 // The section by how the profile is written: «2L75×6» is a pair of angles, «[16П» a channel — not «Двутавр» for all.
 const profileSection=p=>{const t=String(p||"").replace(/\s+/g,"");if(!t)return"";
  if(/^2[L∟]/i.test(t))return"Уголки парные";if(/^[L∟]/i.test(t))return"Уголок";if(/^2\[/.test(t))return"Швеллеры парные";
  if(/^\[/.test(t)||/^\d+(?:\.5)?а?[УПЭЛ]$/.test(t))return"Швеллер";if(/Гн|□|▢|^Кв/.test(t))return"Труба профильная";
  if(/^(?:Тр|Ø|ø|∅)/.test(t))return/[xх×*]/.test(t)?(window.irThreeSchemeView?.sectionOf?.(t)?.shape==="box"?"Труба профильная":"Труба"):"Круг";if(/^[−-]\d/.test(t))return"Лист, полоса";
  if(/^(?:Р|КР)\d{2,3}$/.test(t))return"Рельс";if(/^Сварной/i.test(t))return"Двутавр сварной";if(/^I|^\d+[БКШДМ]\d*$/.test(t))return"Двутавр";return""};
 const sectionShown=c=>fittingSection(c)||(hasProfile(c)?profileSection(c.profile_name)||sectionTypeLabel(sectionType(c)):catalogSection(c)||sectionTypeLabel(sectionType(c)));
 const profileShown=c=>String(c?.profile_name||"").trim()||fittingSection(c)||catalogSection(c)||"—";
 const closestAxis=(value,axes,pos)=>axes.reduce((best,a)=>Math.abs(num(pos.get(a))-value)<Math.abs(num(pos.get(best))-value)?a:best,axes[0]||"");
 const coord=c=>{const p=worldPosition(c),v=activeView(),own=v&&String(c.scheme_view_id||"")===String(v.id),axisX=own&&axesX.includes(String(c.axis_x))?String(c.axis_x):closestAxis(p.x,axesX,axisXPos),axisY=own&&axesY.includes(String(c.axis_y))?String(c.axis_y):closestAxis(p.y,axesY,axisYPos),dx=p.x-num(axisXPos.get(axisX)),dy=p.y-num(axisYPos.get(axisY)),x2=c.absolute_x2_mm!==undefined?num(c.absolute_x2_mm):p.x,y2=c.absolute_y2_mm!==undefined?num(c.absolute_y2_mm):p.y,z0=num(c.z0_mm),z1=num(c.z1_mm??8400),kind=geometry(c);return{x:p.x,y:p.y,x2,y2,z0,z1,z2:kind==="column"||kind==="shell"||kind==="plate"?z1:num(c.end_z_mm??c.z1_mm??8400),r:num(c.radius_mm),ri:num(c.inner_radius_mm),open:c.shell_open===true,sa:num(c.sector_start_deg),sw:num(c.sector_deg),cr:num(c.cone_rise_mm),lay:c.layout&&typeof c.layout==="object"?c.layout:null,ft:String(c.fitting_type||""),fd:num(c.diameter_mm),mx:num(c.absolute_mid_x_mm??p.x),my:num(c.absolute_mid_y_mm??p.y),mz:num(c.mid_z_mm??z1),axisX,axisY,dx,dy,geometryType:kind}};
 const allVisibleTypes=()=>availableGroups().filter(g=>activeScheme==="all"||(frameMode?g.key===activeScheme:groupKeys(activeView()).includes(g.key))).sort((a,b)=>frameMode?frameCategories.indexOf(a.key)-frameCategories.indexOf(b.key):a.label.localeCompare(b.label,"ru"));
 // How fully the reading of the drawings determined an element (src/ai-montage.js) and the section it came from: an
 // element not fully determined is placed all the same, pale, as «предварительно» — the engineer edits it afterwards.
 const INSTANCE_STATUS={confirmed:"подтверждено",computed:"вычислено",partial:"определено частично",ambiguous:"неоднозначно",conflict:"конфликт данных",not_found:"нет в новом анализе"};
 const isPreliminary=c=>c?.preliminary===true;
 const sectionOfRecord=c=>String(c?.source_section||(c?.import_batch?"КМД":"Вручную"));
 const sectionsPresent=()=>{const m=new Map();for(const c of records()){const k=sectionOfRecord(c);m.set(k,(m.get(k)||0)+1)}return[...m].sort((a,b)=>["КМ","КМД","АР","ТХ","Вручную"].indexOf(a[0])-["КМ","КМД","АР","ТХ","Вручную"].indexOf(b[0]))};
 const isShown=c=>{if(hiddenGroups.has(recordMarkGroup(c).key))return false;if(hiddenSections.size&&hiddenSections.has(sectionOfRecord(c)))return false;if(confFilter==="sure"&&isPreliminary(c)||confFilter==="prelim"&&!isPreliminary(c))return false;if(statusFilter!=="all"&&effectiveStatus(c)!==statusFilter)return false;const start=num(c.z0_mm),end=num(c.end_z_mm??c.z1_mm??8400),mid=geometry(c)==="bent"?num(c.mid_z_mm):start,lo=Math.min(start,end,mid),hi=Math.max(start,end,mid),min=String(levelMin).trim()===""?null:Number(levelMin),max=String(levelMax).trim()===""?null:Number(levelMax);if(min!==null&&Number.isFinite(min)&&hi<min)return false;if(max!==null&&Number.isFinite(max)&&lo>max)return false;return true};
 const columns=()=>records().filter(isShown).map(c=>({...c,...coord(c),status:effectiveStatus(c)}));
 const selected=()=>columns().find(x=>x.id===selectedId)||null;
 // What the chat with Claude sends with a message from this page: the object and the element selected on the scheme.
 window.irChatContext=()=>{if(location.hash!==requestedRoute)return null;const c=selected();
  return{page:"Монтажная схема",object:String(object.name||object.title||""),objectId:oid,element:c?{id:String(c.id),mark:String(c.mark||""),name:String(c.mark_name||c.title||""),
   profile:String(c.profile_name||""),axes:[c.axisX,c.axisY].filter(Boolean).join("/"),z:Math.round(c.z0)+"…"+Math.round(c.z2),
   x:Math.round(c.x),y:Math.round(c.y),sheet:String(c.source_sheet||c.sheet||""),status:String(c.status||"")}:null}};
 const resolveSavedMarkId=c=>{const pool=activeMarks();if(!c)return String(pool[0]?.id||"");const direct=pool.find(m=>m.id===String(c.mark_id||""));if(direct)return direct.id;const snap=String(c.mark||"").trim().toLowerCase(),snapName=String(c.mark_name||"").trim().toLowerCase();const exact=snap&&pool.find(m=>String(m.mark||m.title||"").trim().toLowerCase()===snap);if(exact)return exact.id;const byName=snapName&&pool.find(m=>String(m.name||"").trim().toLowerCase()===snapName);return byName?.id||""};
 const gridForEditor=key=>{
  const v=String(key||"")==="all"?null:customViews().find(view=>"view:"+view.id===key)||null;
  const g=v?.data?.grid||baseGrid();
  const ax=validAxes(g.axes_x)?g.axes_x.map(String):[...defaultAxesX],ay=validAxes(g.axes_y)?g.axes_y.map(String):[...defaultAxesY];
  return{view:v,key:v?"view:"+v.id:"all",axesX:ax,axesY:ay,xPos:gridCoords(g,"x"),yPos:gridCoords(g,"y")}
 };
 const marksForGrid=key=>{
  const v=key==="all"?null:customViews().find(x=>"view:"+x.id===key);
  return v?workMarks().filter(m=>groupKeys(v).includes(markGroup(m).key)):workMarks()
 };
 const markPlacement=m=>{
  if(!m)return{total:0,placed:0,left:0};
  allRecords();
  if(cachedPlacementRows!==rows){
   const counts=new Map();
   for(const r of cachedSchemeElements){
    const ids=new Set([String(r.mark_id||""),String(linkedMark(r)?.id||"")]);
    ids.delete("");
    for(const id of ids)counts.set(id,(counts.get(id)||0)+1);
   }
   cachedPlacementCounts=counts;
   cachedPlacementRows=rows;
  }
  const total=Math.max(0,Math.floor(num(m.qty??m.count)));
  const placed=cachedPlacementCounts.get(String(m.id))||0;
  return{total,placed,left:Math.max(0,total-placed)}
 };
 const markAvailable=(m,editingId="")=>{
  const q=markPlacement(m),own=editingId&&storedSchemeElement(editingId);
  // Existing placements remain editable even if older data exceeded today's quantity.
  return Boolean(own&&(String(own.mark_id||"")===String(m.id)||String(linkedMark(own)?.id||"")===String(m.id)))||q.placed<q.total
 };
 const searchMarks=(query,pool=activeMarks())=>{const q=String(query||"").trim().toLowerCase();if(!q)return [...pool];return pool.map(m=>{const mark=String(m.mark||m.title||"").trim().toLowerCase(),name=String(m.name||"").trim().toLowerCase(),text=`${mark} ${name}`;let score=99;if(mark===q)score=0;else if(mark.startsWith(q))score=1;else if(mark.includes(q))score=2;else if(name.startsWith(q))score=3;else if(name.includes(q)||text.includes(q))score=4;return{m,score}}).filter(x=>x.score<99).sort((a,b)=>a.score-b.score||String(a.m.mark||a.m.title||"").localeCompare(String(b.m.mark||b.m.title||""),"ru",{numeric:true,sensitivity:"base"})).map(x=>x.m)};
 const markOptions=(selectedMark,query="",unresolved=false,pool=activeMarks(),editingId="")=>{
  const q=String(query||"").trim(),visible=searchMarks(q,pool),available=visible.filter(m=>markAvailable(m,editingId));
  const hasSelected=visible.some(m=>m.id===String(selectedMark)&&markAvailable(m,editingId));
  let prefix="";
  if(unresolved&&!q)prefix='<option value="" selected>Марка не найдена — выберите заново</option>';
  else if(!hasSelected)prefix='<option value="" selected>Выберите марку (доступно: '+available.length+')</option>';
  if(!visible.length)return'<option value="" selected>Ничего не найдено</option>';
  return prefix+visible.map(m=>{
   const q=markPlacement(m),remaining=markAvailable(m,editingId),disabled=!remaining;
   return `<option value="${esc(m.id)}" ${disabled?'disabled data-exhausted="1"':''} ${hasSelected&&String(selectedMark)===m.id?"selected":""}>${esc(markLabel(m))} · На схеме: ${q.placed} из ${q.total} · Осталось: ${q.left}${disabled?" · НЕТ ОСТАТКА":""}</option>`
  }).join("")
 };
 const axisOptions=(items,value)=>items.map(x=>`<option value="${esc(x)}" ${String(value)===x?"selected":""}>${esc(x)}</option>`).join("");
 const statusText=s=>s==="mounted"?"Смонтирована":s==="partial"?"Частично смонтирована":"Не смонтирована";
 // What an element is besides a frame member — a sandwich panel, a profiled sheet, a trim, a railing, a tank sheet: its kind
 // decides which sections and geometries the element editor offers (not «Двутавр» and «Балка» for a sandwich panel).
 const SECTION_LABEL={ibeam:"Двутавр",square:"Квадратная труба",round:"Круглая труба",box:"Короб / сплошное",panel:"Сэндвич-панель",profsheet:"Профлист (профнастил)",trim:"Гнутый элемент (нащельник, планка)",deck:"Настил (рифлёный лист, решётка)",angle:"Уголок (стойки, поручень)",stair:"Косоуры и ступени",block:"Блок (окно, дверь, ворота)",sheet:"Лист"};
 const SECTION_KIND={panel:["panel","profsheet"],profsheet:["profsheet","panel"],trim:["trim"],deck:["deck"],railing:["angle"],flight:["stair"],ladder:["stair"],window:["block"],door:["block"],gate:["block"],ring:["sheet"],sheet:["sheet"]};
 const sectionChoices=ek=>SECTION_KIND[ek]||(ek?["round"]:["ibeam","square","round","box"]);
 // A saved «ibeam» of a panel is the old default of the editor, not a reading of the drawings: a kind takes its own section.
 const sectionFor=(c,ek)=>{const list=sectionChoices(ek),t=sectionType(c);return list.includes(t)?t:list[0]};
 const GEOMETRY_LABEL={column:"Колонна / стойка",beam:"Балка / прогон / ригель",bent:"Ломаная балка (3 точки)",brace:"Связь / раскос",truss:"Ферма",shell:"Обечайка резервуара (по радиусу)",plate:"Лист днища, крыши (по радиусу)"};
 const KIND_NAME={panel:"Сэндвич-панели",profsheet:"Профлист",trim:"Нащельник, планка",sheet:"Лист резервуара",window:"Окно",door:"Дверь",gate:"Ворота"};
 const elementKind=(c,m)=>{const ft=String(c?.ft||c?.fitting_type||"");if(ft)return ft;const g=String(c?.geometryType||c?.geometry_type||"");if(g==="shell"||g==="plate")return"sheet";
  const types=window.irStructureTypes,t=types?.byKey?.get?.(String(c?.type_key||""))||types?.typeByName?.(String(c?.mark_name||m?.name||m?.title||""));
  return t?.key==="sheeting"?"profsheet":t?.shape==="panel"?"panel":t?.shape==="trim"?"trim":""};
 // A tank sheet keeps its shell or plate (a point and a radius); a fitting, a panel, a trim goes along its line or stands up.
 const geometryChoices=(kind,ek)=>{const list=ek==="sheet"?[["shell",GEOMETRY_LABEL.shell],["plate",GEOMETRY_LABEL.plate]]:ek?[["beam",(KIND_NAME[ek]||FITTING_LABEL[ek]||"Элемент")+" — по линии от точки до точки"],["column",(KIND_NAME[ek]||FITTING_LABEL[ek]||"Элемент")+" — вертикально, от низа до верха"]]:["column","beam","bent","brace","truss"].map(k=>[k,GEOMETRY_LABEL[k]]);
  return kind&&!list.some(x=>x[0]===kind)?list.concat([[kind,GEOMETRY_LABEL[kind]||kind]]):list};
 const pointGeometry=kind=>kind==="column"||kind==="shell"||kind==="plate";
 const sectionType=c=>{const explicit=String(c?.section_type||"").trim().toLowerCase();if(SECTION_LABEL[explicit])return explicit;const s=`${c?.profile_name||""} ${c?.mark_name||""}`.toLowerCase();if(/профлист|профнастил/.test(s))return"profsheet";if(/сэндвич|тр[её]хслойн/.test(s))return"panel";if(/круг|труб.*ø|труб.*ф|ø|⌀/.test(s))return"round";if(/квад|проф.*труб|\d+\s*[xх×]\s*\d+/.test(s))return"square";if(/короб|сварн.*короб/.test(s))return"box";return"ibeam"};
 const sectionTypeLabel=t=>SECTION_LABEL[t]||"Двутавр";
 const profileText=c=>String(c?.profile_name||"").trim()||sectionTypeLabel(sectionType(c));
 const sectionOptions=(value,ek="")=>sectionChoices(ek).map(v=>`<option value="${v}" ${value===v?"selected":""}>${SECTION_LABEL[v]}</option>`).join("");
 const geometryLabel=kind=>GEOMETRY_LABEL[kind]||"Колонна / стойка";
 const geometryOptions=(kind,ek="")=>geometryChoices(kind,ek).map(([k,label])=>`<option value="${k}" ${k===kind?"selected":""}>${label}</option>`).join("");
 const spanSummary=spans=>{const min=Math.min(...spans),max=Math.max(...spans),avg=spans.reduce((s,x)=>s+x,0)/Math.max(1,spans.length);return max-min<=1?`≈ по ${fmt(avg)} мм`:"индивидуальные размеры"};
 const pairLabel=(items,i)=>`${items[i]}–${items[i+1]}`;
 function stats(){
  const cols=records(),mounted=cols.filter(x=>effectiveStatus(x)==="mounted").length,partial=cols.filter(x=>effectiveStatus(x)==="partial").length;
  return{total:cols.length,mounted,partial,left:cols.length-mounted-partial,pct:cols.length?Math.round(mounted/cols.length*100):0}
 }
 const line=(a,b,cls)=>`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="${cls}"/>`;
 function axisText(c){
  const x=c.dx?`${c.axisX} ${c.dx>=0?"+":"−"} ${fmt(Math.abs(c.dx))} мм`:c.axisX,y=c.dy?`${c.axisY} ${c.dy>=0?"+":"−"} ${fmt(Math.abs(c.dy))} мм`:c.axisY;
  return{x,y}
 }

 // Direct placement uses the existing scheme_column record format.
 async function createFrameMember(placement){
  if(!canEdit())throw Error("Нет прав для изменения монтажной схемы.");
  const mark=marks.find(m=>m.id===String(placement?.markId||""));
  if(!mark||!activeMarks().some(m=>m.id===mark.id)||!markAvailable(mark))throw Error("Марка отсутствует или все экземпляры уже размещены.");
  const kind=guessGeometry(mark);
  if(kind!==placement.geometry&&!(kind==="beam"&&placement.geometry==="bent"))throw Error("Выбранная марка и тип конструкции не совпадают.");
  const existingAnchors=allRecords();
  // An existing column or beam may legitimately overhang the nominal grid.
  // The exact snap point is allowed only when it lies ON that stored element.
  const attachedToExisting=(id,x,y,z)=>{
   const found=existingAnchors.find(r=>String(r.id)===id);
   if(!found)return false;
   const c=coord(found),start=[c.x,c.y,c.z0],
    end=c.geometryType==="column"?[c.x,c.y,c.z2]:[c.x2,c.y2,c.z2],
    vertices=c.geometryType==="bent"?[start,[c.mx,c.my,c.mz],end]:[start,end];
   return vertices.slice(1).some((b,i)=>{
    const a=vertices[i],vx=b[0]-a[0],vy=b[1]-a[1],vz=b[2]-a[2],
     length2=vx*vx+vy*vy+vz*vz,
     t=Math.max(0,Math.min(1,((x-a[0])*vx+(y-a[1])*vy+(z-a[2])*vz)/(length2||1)));
    return Math.hypot(x-a[0]-vx*t,y-a[1]-vy*t,z-a[2]-vz*t)<=35
   });
  };
  const point=a=>{
   if(!a||!axesX.includes(String(a.ax))||!axesY.includes(String(a.ay))||!Number.isFinite(Number(a.z)))throw Error("Укажите оси и точную отметку Z.");
   const rawX=num(axisXPos.get(String(a.ax)))+num(a.dx),
    rawY=num(axisYPos.get(String(a.ay)))+num(a.dy),z=Number(a.z),
    // Treat only sub-millimetre numeric imprecision at an edge as in-bounds.
    x=rawX<0&&rawX>=-1?0:rawX>spanX&&rawX<=spanX+1?spanX:rawX,
    y=rawY<0&&rawY>=-1?0:rawY>spanY&&rawY<=spanY+1?spanY:rawY,
    memberId=String(a.memberId||a.columnId||""),
    inBounds=x>=0&&x<=spanX&&y>=0&&y<=spanY;
   if(!inBounds&&!memberId)throw Error("Точка X "+fmt(x)+" / Y "+fmt(y)+" мм выходит за сетку "+fmt(spanX)+" × "+fmt(spanY)+" мм. Выберите место внутри сетки или привязку к существующему элементу.");
   if(memberId&&!attachedToExisting(memberId,x,y,z))throw Error("Точка крепления не совпадает с существующим элементом. Выберите его ещё раз.");
   return{x,y,z,ax:String(a.ax),ay:String(a.ay),dx:x-num(axisXPos.get(String(a.ax))),dy:y-num(axisYPos.get(String(a.ay))),memberId};
  };
  const start=point(placement.start);
  const end=kind==="column"?{...start,z:Number(placement.topZ)}:point(placement.end);
  const centerRidge=placement.geometry==="bent"&&placement.ridgeMode!=="manual";
  // In center mode, X/Y are derived from the two endpoints, never from a
  // cursor-picked coordinate or an arbitrary nearby axis.
  const ridgeInput=placement.geometry==="bent"?placement.middle:null;
  const middle=placement.geometry!=="bent"?null:centerRidge?
   (()=>{
    if(!ridgeInput||!Number.isFinite(Number(ridgeInput.z)))throw Error("Укажите отметку Z конька.");
    const x=Math.round((start.x+end.x)/2),y=Math.round((start.y+end.y)/2),
     ax=closestAxis(x,axesX,axisXPos),ay=closestAxis(y,axesY,axisYPos);
    return{x,y,z:Number(ridgeInput.z),ax,ay,dx:x-num(axisXPos.get(ax)),dy:y-num(axisYPos.get(ay)),memberId:""}
   })():point(ridgeInput);
  if(middle&&(Math.hypot(middle.x-start.x,middle.y-start.y,middle.z-start.z)<1||Math.hypot(end.x-middle.x,end.y-middle.y,end.z-middle.z)<1))throw Error("Для ломаной балки нужны три различные точки.");
  if(!Number.isFinite(end.z)||Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z)<1)throw Error("Начало и конец должны различаться.");
  if(kind==="column"&&end.z<=start.z)throw Error("Верх колонны должен быть выше низа.");
  const existing=allRecords(),used=new Set(existing.map(r=>String(r.position||r.title||"")));
  let index=1,title;do{title="COL-"+String(index++).padStart(4,"0")}while(used.has(title));
  const group=markGroup(mark),reference=existing.find(r=>String(r.mark_id||"")===mark.id);
  const payload={record_type:"scheme_column",title,data:{
   entity_type:"column",position:title,mark_id:mark.id,mark:mark.mark||mark.title||"",mark_name:mark.name||"",work_type_id:String(mark.work_type_id||""),
   axis_x:start.ax,axis_y:start.ay,offset_x_mm:start.dx,offset_y_mm:start.dy,absolute_x_mm:start.x,absolute_y_mm:start.y,
   geometry_type:placement.geometry,absolute_x2_mm:kind==="column"?undefined:end.x,absolute_y2_mm:kind==="column"?undefined:end.y,
   absolute_mid_x_mm:middle?.x,absolute_mid_y_mm:middle?.y,mid_z_mm:middle?.z,
   mid_axis_x:middle?.ax,mid_axis_y:middle?.ay,mid_offset_x_mm:middle?.dx,mid_offset_y_mm:middle?.dy,mid_anchor_member_id:middle?.memberId||undefined,
   ridge_mode:placement.geometry==="bent"?(centerRidge?"center":"manual"):undefined,
   end_axis_x:kind==="column"?undefined:end.ax,end_axis_y:kind==="column"?undefined:end.ay,
   end_offset_x_mm:kind==="column"?undefined:end.dx,end_offset_y_mm:kind==="column"?undefined:end.dy,
   z0_mm:start.z,z1_mm:end.z,end_z_mm:kind==="column"?undefined:end.z,
   start_anchor_member_id:start.memberId||undefined,end_anchor_member_id:end.memberId||undefined,
   status:"planned",section_type:sectionType(reference||{}),profile_name:reference?.profile_name||"",
   scheme_group:group.key,scheme_group_label:group.label,scheme_view_id:"all"
  }};
  const saved=await schemeApi.create(payload);
  if(!rememberSavedSchemeRecord(saved))rows=await schemeApi.list();
  selectedId=String(saved?.id||"");journalAuto(saved?.id,"placed");
  return{savedEnd:{ax:end.ax,ay:end.ay,x:end.x,y:end.y,z:end.z}};
 }

 // Confirm dialogs in nested Electron tabs can leave the keyboard aimed
 // at a destroyed/hidden native browsing context, despite a visible caret.
 function restoreKeyboardAfterConfirm(){
  try{window.frameElement?.focus({preventScroll:true});window.focus()}catch(_error){}
  requestAnimationFrame(()=>{
   try{window.frameElement?.focus({preventScroll:true});window.focus()}catch(_error){}
   const search=document.getElementById("irbMarkSearch");
   if(search?.isConnected)search.focus({preventScroll:true});
  });
 }
 // Preserve the existing 3D canvas, WebGL context and active input on
 // layer/status/elevation changes. Only update currently visible elements.
 function updateLayerVisibility(){
  const groups=allVisibleTypes();
  document.querySelectorAll("[data-scheme-layer]").forEach(btn=>{
   const visible=!hiddenGroups.has(btn.dataset.schemeLayer);
   btn.classList.toggle("on",visible);btn.classList.toggle("off",!visible);
   btn.setAttribute("aria-pressed",String(visible));
  });
  document.querySelectorAll("[data-scheme-section]").forEach(btn=>{
   const visible=!hiddenSections.has(btn.dataset.schemeSection);
   btn.classList.toggle("on",visible);btn.classList.toggle("off",!visible);btn.setAttribute("aria-pressed",String(visible));
  });
  const heading=document.querySelector(".scheme-layers>summary small");
  if(heading)heading.textContent=groups.filter(g=>!hiddenGroups.has(g.key)).length+" из "+groups.length;
  const visible=columns();
  const count=document.querySelector(".scheme-visible-counter b");if(count)count.textContent=String(visible.length);
  renderScene();
 }

 // Updating the current 3D model does not require destroying the entire
 // application layout or recreating its expensive WebGL resources.
 function refreshAfterMemberChange(){
  if(!document.querySelector("#schemeCanvas .ir-three-root")){draw();return}
  const visible=columns();
  renderScene();
  renderDetails();
  const s=stats(),mp=statusCounts();
  const summary=document.querySelector(".scheme-summary");
  if(summary?.children[2]){
   const value=summary.children[2].querySelector("b");
   if(value)value.textContent=String(s.total);
   const note=summary.children[2].querySelector("small");
   if(note)note.textContent=activeGroup().label+" · "+activeMarks().length+" позиций ведомости";
  }
  if(summary?.children[3]){
   const value=summary.children[3].querySelector("b");
   if(value)value.textContent=mp.pct+"%";
   const note=summary.children[3].querySelector("small");
   if(note)note.textContent=fmt(mp.mounted)+" из "+fmt(mp.total)+" шт. смонтировано";
  }
  const markSummary=document.querySelector(".scheme-mark-summary");
  if(markSummary?.children[3]){
   const value=markSummary.children[3].querySelector("b");
   if(value)value.innerHTML=mp.placed+' <small>элем.</small>';
   const note=markSummary.children[3].querySelector("small:last-child");
   if(note)note.textContent=mp.placedMounted+" полностью смонтировано · "+mp.placedPartial+" частично";
  }
  const counter=document.querySelector(".scheme-visible-counter b");
  if(counter)counter.textContent=String(visible.length);
  const caption=document.querySelector(".scheme-preview-title span");
  if(caption)caption.textContent=s.total+" элементов · 3D";
  const select=document.getElementById("schemeTypeSelect");
  if(select){
   const byKey=new Map(schemeGroups().map(g=>[g.key,g]));
   for(const option of select.options){
    const g=byKey.get(option.value);
    if(g)option.textContent=g.label+" · "+g.marks+" марок · "+g.placed+" элементов";
   }
  }
 }
 // Copy a complete member to a new XY location, preserving length,
 // cross-section, elevations, orientation and intermediate bend.
 async function copySchemeMember(sourceId,destination){
  if(!canEdit())throw Error("Нет прав на копирование монтажной схемы.");
  // Re-read the authoritative rows before counting placements.
  rows=await schemeApi.list();
  const source=allRecords().find(r=>String(r.id)===String(sourceId));
  if(!source)throw Error("Исходный элемент удалён. Выберите его заново.");
  const mark=linkedMark(source);
  if(!mark)throw Error("Марка элемента отсутствует в ведомости. Копирование недоступно.");
  const quota=markPlacement(mark);
  if(quota.left<=0)throw Error("Нет остатка по марке "+String(mark.mark||mark.title)+": "+quota.placed+" из "+quota.total+" шт.");
  const original=coord(source),targetX=Number(destination?.x),targetY=Number(destination?.y);
  if(!Number.isFinite(targetX)||!Number.isFinite(targetY))throw Error("Укажите точные координаты нового начала X/Y.");
  const dx=targetX-original.x,dy=targetY-original.y;
  if(Math.hypot(dx,dy)<1)throw Error("Выберите другое место: копию нельзя наложить на оригинал.");
  const kind=original.geometryType,roundMm=value=>Math.round(value*1000)/1000;
  const translate=(x,y)=>{
   const px=roundMm(x+dx),py=roundMm(y+dy);
   if(!Number.isFinite(px)||!Number.isFinite(py)||px<0||px>spanX||py<0||py>spanY)
    throw Error("Весь элемент должен помещаться в сетку "+fmt(spanX)+" × "+fmt(spanY)+" мм. Точка X "+fmt(px)+" / Y "+fmt(py)+" выходит за границу.");
   const ax=closestAxis(px,axesX,axisXPos),ay=closestAxis(py,axesY,axisYPos);
   return{x:px,y:py,ax,ay,offX:roundMm(px-num(axisXPos.get(ax))),offY:roundMm(py-num(axisYPos.get(ay)))}
  };
  const start=translate(original.x,original.y),
   end=kind==="column"?start:translate(original.x2,original.y2),
   middle=kind==="bent"?translate(original.mx,original.my):null;
  const samePoint=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<5;
  const destPoints=[{...start,z:original.z0},...(middle?[{...middle,z:original.mz}]:[]),{...end,z:original.z2}];
  const collides=allRecords().some(r=>{
   if(String(r.mark_id||"")!==String(mark.id)&&String(linkedMark(r)?.id||"")!==String(mark.id))return false;
   const p=coord(r);
   if(p.geometryType!==kind)return false;
   const points=[{x:p.x,y:p.y,z:p.z0},...(kind==="bent"?[{x:p.mx,y:p.my,z:p.mz}]:[]),
    {x:kind==="column"?p.x:p.x2,y:kind==="column"?p.y:p.y2,z:p.z2}];
   return points.every((a,i)=>samePoint(a,destPoints[i]))||
    points.every((a,i)=>samePoint(a,destPoints[points.length-1-i]));
  });
  if(collides)throw Error("В этом месте уже размещён такой же элемент. Выберите другой ряд.");
  const used=new Set(allRecords().map(r=>String(r.position||r.title||"")));
  let index=1,title;do{title="COL-"+String(index++).padStart(4,"0")}while(used.has(title));
  const group=recordMarkGroup(source);
  const ridgeIsCentered=kind==="bent"&&Math.hypot(original.mx-(original.x+original.x2)/2,
   original.my-(original.y+original.y2)/2)<0.01;
  const saved=await schemeApi.create({record_type:"scheme_column",title,data:{
   entity_type:"column",position:title,mark_id:mark.id,
   mark:mark.mark||mark.title||"",mark_name:mark.name||source.mark_name||"",
   work_type_id:recordWorkId(source)||String(mark.work_type_id||""),
   axis_x:start.ax,axis_y:start.ay,offset_x_mm:start.offX,offset_y_mm:start.offY,
   absolute_x_mm:start.x,absolute_y_mm:start.y,geometry_type:kind,
   absolute_x2_mm:kind==="column"?undefined:end.x,absolute_y2_mm:kind==="column"?undefined:end.y,
   end_axis_x:kind==="column"?undefined:end.ax,end_axis_y:kind==="column"?undefined:end.ay,
   end_offset_x_mm:kind==="column"?undefined:end.offX,end_offset_y_mm:kind==="column"?undefined:end.offY,
   absolute_mid_x_mm:middle?.x,absolute_mid_y_mm:middle?.y,
   mid_axis_x:middle?.ax,mid_axis_y:middle?.ay,
   mid_offset_x_mm:middle?.offX,mid_offset_y_mm:middle?.offY,
   mid_z_mm:middle?original.mz:undefined,
   // Preserve an off-centre ridge without re-centring on the next edit.
   ridge_mode:kind==="bent"?(ridgeIsCentered?String(source.ridge_mode||"manual"):"manual"):undefined,
   z0_mm:original.z0,
   z1_mm:source.z1_mm!=null&&Number.isFinite(Number(source.z1_mm))?Number(source.z1_mm):original.z2,
   end_z_mm:kind==="column"?undefined:original.z2,
   rotation_deg:num(source.rotation_deg),
   section_type:sectionType(source),profile_name:String(source.profile_name||""),
   scheme_group:group.key,scheme_group_label:group.label,
   scheme_view_id:String(source.scheme_view_id||"all"),status:"planned"
  }});
  if(!rememberSavedSchemeRecord(saved))rows=await schemeApi.list();
  journalAuto(saved?.id,"placed");
  return String(saved?.id||"");
 }

 // The montage scheme is shown in 3D only; filters, cuts and the details panel stay on the page.
 function renderScene(){
  const box=document.getElementById("schemeCanvas");if(!box)return;
  if(!window.irThreeSchemeView){
   box.innerHTML='<div class="scheme-three-failed">Модуль 3D не подключён. Переустановите программу.</div>';
   loading.done();return
  }
  const members=columns().filter(planCutVisible);
  const count=document.querySelector(".scheme-visible-counter b");
  if(count)count.textContent=String(members.length);
  const cutSummary=document.querySelector(".scheme-plan-cuts>summary>small");
  if(cutSummary)cutSummary.textContent=cutHidden.length?"Скрыто: "+cutHidden.length:"Все видны";
  const remove=async id=>{
   if(!canEdit())return;
   const record=allRecords().find(r=>String(r.id)===String(id));
   if(!record)return;
   const name=String(record.mark||record.title||"").trim();
   if(!confirm("Удалить элемент "+(name?"«"+name+"» ":"")+"со схемы?")){restoreKeyboardAfterConfirm();return}
   restoreKeyboardAfterConfirm();
   try{
    await journalAuto(id,"deleted");
    await schemeApi.remove(id);
    rows=await schemeApi.list().catch(()=>rows.filter(r=>String(r.id)!==String(id)));
    selectedId="";refreshAfterMemberChange();restoreKeyboardAfterConfirm()
   }catch(error){alert("Не удалось удалить элемент: "+String(error?.message||error))}
  };
  window.irThreeSchemeView.render(box,{
   objectId:oid,axesX:[...axesX],axesY:[...axesY],spanX,spanY,gridDirX,gridDirY,
   gridX:Object.fromEntries(axisXPos),gridY:Object.fromEntries(axisYPos),
   elements:members.map(c=>({...c,scheme_group:recordMarkGroup(c).key,role:recordRole(c)})),
   selected:selectedId,
   maxZ:members.reduce((m,c)=>Math.max(m,num(c.z0),num(c.z2),num(c.mz)),0),
   colorMode:schemeColorMode,showLabels:labelsVisible,showDimensions:dimensionsVisible,
   background:currentBackground(),backgroundColor:currentCustomBackground(),
   canEdit:Boolean(canEdit()&&activeWorkId),
   // Marks with their remaining quantity for placing new members by clicks.
   marks:activeMarks().map(m=>{const q=markPlacement(m);return{id:m.id,title:markLabel(m),mark:m.mark||m.title,total:q.total,placed:q.placed,left:q.left,geometry:guessGeometry(m)}}),
   onColorModeChange:next=>changeColorMode(next),
   onSelect:id=>{selectedId=id;renderDetails()},
   onAdd:()=>{if(canEdit()&&activeWorkId)openEditor()},
   onPlacement:placement=>openEditor(null,false,placement),
   onQuickPlace:frameMode?createFrameMember:null,
   onQuickPlaced:()=>refreshAfterMemberChange(),
   onCopyPlacement:(id,target)=>copySchemeMember(id,target),
   onCopied:id=>{selectedId=String(id||"");refreshAfterMemberChange()},
   onDelete:remove,
   onFirstPaint:()=>loading.done()
  })
 }

 // The scheme as one HTML file for viewing without the program (src/scheme-export-html.js): what is on the screen now
 // — this scheme, its grid and elements with their kinds, sections, statuses and the marks register; no editing.
 async function exportSchemeHtml(btn){
  if(!window.irSchemeHtmlExport){alert("Выгрузка схемы в HTML недоступна — обновите программу.");return}
  await loadMountDays();
  const list=records().map(c=>{const p={...c,...coord(c)},g=recordMarkGroup(c),lm=linkedMark(c),pr=markProgress(lm),name=String(lm?.name||"").trim()||String(c.mark_name||""),day=mountDay(lm,pr);
   return{id:String(c.id),mark:String(c.mark||""),mark_name:name,title:String(name||c.title||""),type_name:String(c.type_name||FITTING_LABEL[p.ft]||geometryLabel(p.geometryType)),
    section:sectionShown(p),profile:profileShown(p),status:effectiveStatus(c),scheme_group:g.key,role:recordRole(c),axisX:p.axisX,axisY:p.axisY,axisText:axisText(p),
    x:p.x,y:p.y,x2:p.x2,y2:p.y2,z0:p.z0,z1:p.z1,z2:p.z2,mx:p.mx,my:p.my,mz:p.mz,r:p.r,ri:p.ri,open:p.open,sa:p.sa,sw:p.sw,cr:p.cr,lay:p.lay,ft:p.ft,fd:p.fd,geometryType:p.geometryType,
    progress:pr&&pr.total>0?pr:null,draft:false,draft_doc:String(c.source_import_doc||""),work:recordWorkId(c),
    // What the 3D draws a member by: its rolled section, a truss or a lattice column, the base, the joint and the nodes of
    // the drawings — without them the exported scheme showed conventional sections, trusses as beams and no bolts.
    profile_name:String(c.profile_name||""),profile_standard:String(c.profile_standard||""),section_type:String(c.section_type||""),type_key:String(c.type_key||""),
    truss:c.truss||undefined,column:c.column||undefined,base:c.base||undefined,joint:c.joint||undefined,drill:Array.isArray(c.drill)?c.drill:undefined,cuts:Array.isArray(c.cuts?.rows)?c.cuts:undefined,parts:Array.isArray(c.parts?.rows)?c.parts:undefined,plates:Array.isArray(c.plates?.rows)||Array.isArray(c.plates?.gussets)?c.plates:undefined,place:Array.isArray(c.place?.rows)?c.place:undefined,bevels:Array.isArray(c.bevels?.rows)?c.bevels:undefined,cross:c.cross||undefined,nodes:c.nodes||undefined,
    // How fully the drawings determined it and its section: the exported page shows the same pale «предварительно».
    preliminary:isPreliminary(c)||undefined,instance_status:INSTANCE_STATUS[c.instance_status]?String(c.instance_status):undefined,
    instance_reasons:Array.isArray(c.instance_reasons)&&c.instance_reasons.length?c.instance_reasons.map(String).slice(0,5):undefined,source_section:sectionOfRecord(c),
    param_sources:c.param_sources&&typeof c.param_sources==="object"?c.param_sources:undefined,
    // The card in plain words of the exported page (src/scheme-element-card.js): what a new analysis gives after an edit,
    // what to check, an element placed by hand.
    pdf_new:c.pdf_new&&typeof c.pdf_new==="object"?c.pdf_new:undefined,check_note:c.check_note?String(c.check_note):undefined,manual:c.import_batch?undefined:true,
    // The top of the card as in the report of 21.10.2026: the day of mounting, the sheet, the mass of the КМД.
    status_date:day.date||undefined,status_more:day.more||undefined,sheet:sheetOfRecord(c)||undefined,mass_kmd:markMass(c,lm)||undefined}});
  if(!list.length){alert("На схеме нет элементов для выгрузки.");return}
  const counts=new Map();for(const c of list){const g=counts.get(c.scheme_group)||{key:c.scheme_group,label:recordMarkGroup(records().find(r=>String(r.id)===c.id)).label,count:0};g.count++;counts.set(c.scheme_group,g)}
  // All the work types together: the exported page can show each apart, as the scheme does.
  const workCounts=new Map();for(const c of list){const w=workCounts.get(c.work)||{id:c.work,label:c.work?String(workById.get(c.work)?.work_type||"Вид работ "+c.work):"Без вида работ",count:0};w.count++;workCounts.set(c.work,w)}
  const currentWork=frameMode?null:enabledWorks().find(w=>w.id===activeWorkId);
  const old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent="Выгрузка…"}
  try{
   const saved=await window.irSchemeHtmlExport.save({objectId:oid,object:{name:String(object.name||object.title||""),address:String(object.address||"")},title:activeGroup()?.label||"Все",
    axesX:[...axesX],axesY:[...axesY],spanX,spanY,gridDirX,gridDirY,gridX:Object.fromEntries(axisXPos),gridY:Object.fromEntries(axisYPos),background:currentBackground(),
    elements:list,groups:[...counts.values()].sort((a,b)=>b.count-a.count),summary:statusCounts(),
    work:frameMode?(workCounts.size>1?"Все виды работ":""):currentWork?currentWork.name+(currentWork.code?" · "+currentWork.code:""):"",works:frameMode&&workCounts.size>1?[...workCounts.values()].sort((a,b)=>b.count-a.count):[]});
   if(saved)alert("Монтажная схема сохранена:\n"+saved)
  }catch(error){alert("Не удалось выгрузить схему: "+String(error?.message||error))}
  finally{if(btn){btn.disabled=false;btn.textContent=old}}
 }
 function pickerRecords(){
  return records().map(c=>({...c,...coord(c),status:effectiveStatus(c)})).sort((a,b)=>String(a.mark||"").localeCompare(String(b.mark||""),"ru",{numeric:true,sensitivity:"base"})||Number(a.id)-Number(b.id))
 }
 function pickerMatches(c,query){
  const q=norm(query);return !q||norm([c.mark,c.mark_name,c.position,c.title,c.id,c.axisX,c.axisY,fmt(c.x),fmt(c.y)].join(" ")).includes(q)
 }
 function pickerOptionText(c){const progress=markProgress(linkedMark(c));return [c.mark||"Без марки",c.axisX+"/"+c.axisY,"X "+fmt(c.x),"Y "+fmt(c.y),progress?.total>0?fmt(progress.mounted)+"/"+fmt(progress.total)+" смонт.":"Статус вручную","#"+c.id].join(" · ")}
 function pickerOptions(found){
  return '<option value="">Выберите размещённый элемент…</option>'+found.map(c=>'<option value="'+esc(c.id)+'" '+(c.id===selectedId?'selected':'')+'>'+esc(pickerOptionText(c))+'</option>').join("")
 }
 function pickerRows(found){
  const overlapping=new Map();
  for(const r of records()){const p=coord(r),key=[Math.round(p.x),Math.round(p.y),Math.round(p.z0)].join("|");overlapping.set(key,(overlapping.get(key)||0)+1)}
  return found.slice(0,150).map(c=>{
   const key=[Math.round(c.x),Math.round(c.y),Math.round(c.z0)].join("|"),stack=overlapping.get(key)||1,progress=markProgress(linkedMark(c));
   return '<div class="scheme-element-row '+(c.id===selectedId?'on':'')+' status-'+esc(c.status)+'"><button type="button" data-pick-element="'+esc(c.id)+'" title="Выбрать элемент"><b>'+esc(c.mark||"Без марки")+'</b><span>'+esc(c.axisX+'/'+c.axisY)+' · X '+fmt(c.x)+' · Y '+fmt(c.y)+'</span><small>#'+esc(c.id)+(stack>1?' · '+stack+' в точке':'')+(progress?.total>0?' · '+fmt(progress.mounted)+'/'+fmt(progress.total)+' смонт.':'')+'</small></button>'+(canEdit()?'<button type="button" class="scheme-list-copy" data-copy-element="'+esc(c.id)+'" title="Копировать элемент">⧉</button>':'')+'</div>'
  }).join("")+(found.length>150?'<div class="scheme-picker-more">Показаны первые 150 из '+found.length+'. Уточните поиск.</div>':'')
 }
 function pickerHtml(){
  const all=pickerRecords(),found=all.filter(c=>pickerMatches(c,elementSearch));
  return '<section class="scheme-element-picker"><div class="scheme-picker-title"><b>Размещённые элементы</b><span>'+all.length+'</span></div>'+
   '<label class="scheme-picker-search">Поиск марки или осей<input id="schemeElementSearch" type="search" value="'+esc(elementSearch)+'" autocomplete="off" placeholder="Марка, ось, ID"></label>'+
   '<select id="schemeElementSelect" data-native-select="1" aria-label="Выбрать размещённый элемент">'+pickerOptions(found)+'</select>'+
   '<div class="scheme-picker-count" id="schemeElementCount">Найдено: '+found.length+(found.length<all.length?' из '+all.length:'')+'</div>'+
   '<div class="scheme-element-list" id="schemeElementRows">'+pickerRows(found)+'</div></section>'
 }
 function selectFromPicker(id){
  const entry=records().find(c=>String(c.id)===String(id));selectedId=entry?String(entry.id):"";
  if(entry&&(!isShown(entry)||!planCutVisible({...entry,...coord(entry)}))){
   hiddenGroups.delete(recordMarkGroup(entry).key);hiddenSections.clear();confFilter="all";statusFilter="all";levelMin="";levelMax="";cutHidden=[];
   try{localStorage.setItem("ir-project-3d-sections."+oid,"[]")}catch(_error){}
   draw()
  }else{renderScene();renderDetails()}
  // Fly the camera to the chosen element once the model has it.
  if(entry)setTimeout(()=>window.irThreeSchemeView?.focus?.(String(entry.id)),60)
 }
 function bindElementPicker(panel){
  const search=panel.querySelector("#schemeElementSearch"),select=panel.querySelector("#schemeElementSelect");
  if(search)search.oninput=()=>{
   elementSearch=search.value;pickerScrollTop=0;const all=pickerRecords(),found=all.filter(c=>pickerMatches(c,elementSearch));
   if(select)select.innerHTML=pickerOptions(found);
   const list=panel.querySelector("#schemeElementRows");if(list){list.innerHTML=pickerRows(found);list.scrollTop=0}
   const counter=panel.querySelector("#schemeElementCount");if(counter)counter.textContent="Найдено: "+found.length+(found.length<all.length?" из "+all.length:"")
  };
  if(select)select.onchange=()=>selectFromPicker(select.value);
  const list=panel.querySelector("#schemeElementRows");if(list){list.scrollTop=pickerScrollTop;list.onscroll=()=>{pickerScrollTop=list.scrollTop}}
  panel.onclick=e=>{
   const copy=e.target.closest?.("[data-copy-element]");if(copy){const row=records().find(r=>String(r.id)===copy.dataset.copyElement);if(row&&canEdit())openEditor({...row,...coord(row)},true);return}
   const pick=e.target.closest?.("[data-pick-element]");if(pick)selectFromPicker(pick.dataset.pickElement)
  }
 }
 function cloneOffset(c){
  const step=Math.min(1000,Math.max(200,Math.min(spanX,spanY)/10));
  const options=[[step,0],[-step,0],[0,step],[0,-step],[step,step],[-step,-step],[step,-step],[-step,step]];
  const existing=allRecords().map(r=>({...r,...coord(r)}));
  const inside=(dx,dy)=>[c.x+dx,c.x2+dx].every(x=>x>=0&&x<=spanX)&&[c.y+dy,c.y2+dy].every(y=>y>=0&&y<=spanY);
  return options.find(([dx,dy])=>inside(dx,dy)&&!existing.some(r=>Math.hypot(r.x-(c.x+dx),r.y-(c.y+dy))<100&&Math.abs(r.z0-c.z0)<100))||options.find(([dx,dy])=>inside(dx,dy))||[step,0]
 }
 // Card of a member placed from the drawings: what the sheets say of its mark and the pieces of the PDF where it is
 // drawn (the montage scheme with a ring round it, the mark's own view). Read locally by the recognition module.
 const markCards=new Map();
 const journalSent=new Map();
 // Everything the engineer edits and places goes to the journal of edits by itself (src/ai-training.js): what the program
 // placed, what it is now, what changed; a kind given to a mark becomes the rule of the set. Never in the way of the
 // edit: a failure is only written to the console.
 const journalStamp=text=>new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})+" · "+text;
 function journalAuto(elementId,action,extra){
  if(!irProject.ai?.invoke||(!elementId&&action!=="grid"))return Promise.resolve(null);
  return irProject.ai.invoke("ai-montage:journal-add",{objectId:oid,elementId:elementId?String(elementId):undefined,action,auto:true,objectName:String(object?.name||object?.title||""),...(extra||{})})
   .then(r=>{if(r?.entry&&elementId)journalSent.set(String(elementId),journalStamp(r.entry.text+(r.entry.rule?" → правило: "+r.entry.rule.mark+" — "+r.entry.rule.typeName:"")));return r})
   .catch(e=>{console.warn("Монтажная схема: журнал правок не записан",e);return null})
 }
 function markCardHtml(card){
  const k=card?.catalog,lv=v=>v===null||v===undefined||v===""?"":(v>0?"+":v<0?"−":"")+(Math.abs(v)/1000).toFixed(3).replace(".",",");
  const rows=k?[["Профиль",k.profile+(k.profile_standard?" ("+k.profile_standard+")":"")],["Сталь",k.steel],["Длина",k.length_mm?fmt(k.length_mm)+" мм":""],["Кол-во по чертежу",k.count?k.count+" шт.":""],["Масса",k.mass_kg?fmt(k.mass_kg)+" кг":""],
   ["Отметки по разрезу",k.z0_mm!==null&&k.z1_mm!==null?lv(k.z0_mm)+" … "+lv(k.z1_mm):""],["Отметка балки",k.beam_mm!==null?lv(k.beam_mm):""]].filter(r=>r[1]):[];
  return`<div class="scheme-mark-card"><b>Марка ${esc(card.mark||"")} на чертежах${k?.doc?" · "+esc(k.doc):""}</b>
   ${rows.length?`<div class="scheme-mark-card-grid">${rows.map(r=>`<span>${esc(r[0])}</span><b>${esc(r[1])}</b>`).join("")}</div>`:'<small>Сведений о марке в разобранных листах нет.</small>'}
   ${(card.crops||[]).map(c=>c.error?`<small class="scheme-mark-card-error">${esc(c.title)}: ${esc(c.error)}</small>`:`<figure><div class="scheme-mark-card-shot" data-mark-zoom tabindex="0" title="Нажмите, чтобы увеличить"><img src="${esc(c.dataUrl)}" alt="${esc(c.title)}">${c.at&&c.at.x>=0&&c.at.x<=1&&c.at.y>=0&&c.at.y<=1?`<i style="left:${(c.at.x*100).toFixed(2)}%;top:${(c.at.y*100).toFixed(2)}%"></i>`:""}</div><figcaption>${esc(c.title)}<small>${esc(c.source)}</small></figcaption></figure>`).join("")}
   ${k?.sources?.length?`<details><summary>Где описана марка (${k.sources.length})</summary>${k.sources.map(s=>`<div>${esc(s)}</div>`).join("")}</details>`:""}
  </div>`
 }
 async function loadMarkCard(panel,c){
  const box=document.createElement("div");box.className="scheme-mark-card-host";
  if(!c.source_import_key||!irProject.ai?.invoke)return;
  const host=panel.querySelector(".ec-mark-host"),actions=panel.querySelector(".scheme-detail-actions");
  if(host)host.appendChild(box);else if(actions)panel.insertBefore(box,actions);else panel.appendChild(box);
  const volume=(/КМ\s*\d+/u.exec(String(c.source_import_doc||""))||[""])[0].replace(/\s+/g,"");
  const key=oid+"|"+c.source_import_key+"|"+c.mark+"|"+volume;
  const show=card=>{if(!card){box.innerHTML="";return}box.innerHTML=markCardHtml(card);box.querySelectorAll("[data-mark-zoom]").forEach(el=>el.onclick=()=>el.classList.toggle("zoom"))};
  if(markCards.has(key)){show(markCards.get(key));return}
  box.innerHTML='<div class="scheme-mark-card"><small>Читаю чертёж марки…</small></div>';
  try{const card=await irProject.ai.invoke("ai-montage:element-card",{objectId:oid,key:c.source_import_key,mark:c.mark,volume});markCards.set(key,card);if(box.isConnected)show(card)}
  catch(error){if(box.isConnected)box.innerHTML=`<div class="scheme-mark-card"><small class="scheme-mark-card-error">Чертёж марки не прочитан: ${esc(String(error?.message||error).replace(/^Error invoking remote method[^:]*: (Error: )?/,""))}</small></div>`}
 }
 // In the card: how the drawings determined the element and why it is preliminary; for an element the engineer changed,
 // what the latest reading of the drawings gives instead (his values stay).
 function instanceHtml(c){
  const st=String(c.instance_status||""),n=c.pdf_new&&typeof c.pdf_new==="object"?c.pdf_new:null;
  const ps=c.param_sources&&typeof c.param_sources==="object"?c.param_sources:null;
  const from=ps?[["Положение",ps.position],["Отметки",ps.levels],["Наименование",ps.name],["Наименование на чертеже",ps.name_other],["Профиль",ps.profile],["Габарит",ps.size],["Другой профиль",ps.profile_other]].filter(r=>r[1]):[];
  if(!INSTANCE_STATUS[st]&&!n&&!from.length)return"";
  const reasons=Array.isArray(c.instance_reasons)?c.instance_reasons.map(String):[];
  const top=c.geometryType==="column"||c.geometryType==="shell"||c.geometryType==="plate"?n?.z1:n?.end_z??n?.z1;
  const diffs=n?[["X",c.x,n.x],["Y",c.y,n.y],["низ",c.z0,n.z0],["верх",c.z2,top]].filter(r=>r[2]!==undefined&&r[2]!==null&&Number.isFinite(Number(r[2]))&&Math.abs(num(r[1])-num(r[2]))>5).map(r=>r[0]+" "+fmt(r[2])+" мм"):[];
  if(n?.mark&&String(n.mark).trim().toLowerCase()!==String(c.mark||"").trim().toLowerCase())diffs.unshift("марка "+String(n.mark));
  return`<div class="scheme-instance ${isPreliminary(c)?"preliminary":""}"><b>По чертежам: ${esc(INSTANCE_STATUS[st]||"—")}${isPreliminary(c)?" · предварительно":""}</b>${c.source_section?`<small>Раздел: ${esc(c.source_section)}${c.source_import_doc?" · "+esc(c.source_import_doc):""}</small>`:""}${reasons.map(r=>`<small>• ${esc(r)}</small>`).join("")}${n?`<small>Ваша правка сохранена. Новый анализ чертежей: ${diffs.length?esc(diffs.join(", ")):"то же, что у вас"}.</small>`:""}${from.length?`<details><summary>Откуда данные</summary>${from.map(r=>`<small>${esc(r[0])}: ${esc(String(r[1]))}</small>`).join("")}</details>`:""}</div>`
 }
 // The permanent fasteners and the holes of the member's assembly sheet («Ведомость постоянных метизов», «Все отверстия
 // Ø23, кроме оговоренных»): the engineer, 25.10.2026, «где метизы? выдай метизы и отверстия».
 function fastenersHtml(c){
  const j=c.joint;if(!j||!(j.fasteners?.length||j.holes_mm?.length))return"";
  return`<div class="scheme-fasteners"><b>Метизы и отверстия</b>${(j.fasteners||[]).map(f=>`<span>${esc(f)}</span>`).join("")}${j.holes_mm?.length?`<span>Отверстия Ø${esc(j.holes_mm.join(", Ø"))}${j.hole_mm?` (все Ø${esc(j.hole_mm)}, кроме оговоренных)`:""}</span>`:""}${j.fasteners_sheet?`<small>${esc(j.fasteners_sheet)}</small>`:""}</div>`
 }
 // The holes of the member at their places on the views of its assembly sheet (c.drill, src/ai-holes-extract.js): along
 // it from the start of the view, by diameter; those of the gussets on it counted apart.
 function drillHtml(c){
  const views=Array.isArray(c.drill)?c.drill.filter(v=>v&&Array.isArray(v.holes)):[];if(!views.length)return"";
  const row=v=>{const own=v.holes.filter(h=>!h[3]),part=v.holes.length-own.length,by=new Map();
   for(const h of own){const d=num(h[2]);if(!by.has(d))by.set(d,[]);by.get(d).push(num(h[0]))}
   const groups=[...by].map(([d,at])=>(d?"Ø"+d:"Ø не указан")+" — "+at.length+" шт.: "+[...new Set(at)].sort((a,b)=>a-b).slice(0,24).map(fmt).join(", ")+" мм от начала");
   return`<span>Вид «${esc(v.view||"")}»${v.scale?", М "+esc(v.scale):""}, длина ${fmt(v.length_mm)} мм${v.not_to_scale?" (нарисован не в масштабе — по размерам чертежа)":""}: ${esc(groups.join("; ")||"—")}${part?"; в фасонках на нём — "+part+" шт.":""}</span>`};
  return`<div class="scheme-fasteners"><b>Отверстия по сборочному чертежу</b>${views.map(row).join("")}${views[0].sheet?`<small>${esc(views[0].sheet)}</small>`:""}</div>`
 }
 // The plates drawn apart with their holes (c.cuts, src/ai-holes-extract.js sheetHoles: a base plate «1 - 1», an end
 // plate «2 - 2» seen from the end of a beam): size, where its cut is along the mark, the holes from the plate's middle.
 function cutsHtml(c){
  const rows=Array.isArray(c.cuts?.rows)?c.cuts.rows:[];if(!rows.length)return"";
  const line=r=>{const p=Array.isArray(r.plate)?r.plate:[],L=num(p[0]),flat=r.dir!=="по вертикали",of=num(r.of),at=num(r.at);
   // (at an end as the 3D takes it: within 5% of the view, 250 mm at least; an upright view starts at the top)
   const edge=Math.max(250,of*0.05),up=r.on_dir==="по вертикали",cut=`разрез в ${fmt(at)} из ${fmt(of)} мм от ${up?"верха":"начала"} вида «${esc(r.on||"")}»`;
   const where=r.at===undefined||r.at===null?"":of>0&&at>=of-edge?`, ${up?"внизу":"у конца"} (${cut})`:of>0&&at<=edge?`, ${up?"вверху":"у начала"} (${cut})`:`, ${cut}`;
   const spec=r.section?` — поз. ${esc(r.pos??"—")} «${esc(r.section)}» по спецификации`:"";
   const by=new Map();for(const h of Array.isArray(r.holes)?r.holes:[]){const d=num(h[2]);if(!by.has(d))by.set(d,[]);const a=num(h[0])-L/2,o=num(h[1]);by.get(d).push(flat?[a,o]:[o,a])}
   const holes=[...by].map(([d,list])=>(d?"Ø"+d:"Ø не указан")+" — "+list.length+" шт.: "+list.slice(0,16).map(([x,y])=>"("+fmt(x)+"; "+fmt(y)+")").join(", ")).join("; ");
   return`<span>«${esc(r.view||"")}»: пластина ${fmt(flat?L:num(p[1]))}×${fmt(flat?num(p[1]):L)} мм${spec}${where}; отверстия ${esc(holes||"—")} мм от середины пластины (вправо; вниз по чертежу)</span>`};
  return`<div class="scheme-fasteners"><b>Пластины с отверстиями по разрезам</b>${rows.map(line).join("")}<small>${esc(c.cuts.sheet||"")}</small></div>`
 }
 // The plates across the member (ribs, connection plates) at their places on its assembly sheet (c.plates,
 // src/ai-holes-extract.js sheetPlates): one line for the plates at one place, both sides of the web or one; then its
 // gussets — where along it, in which plane, how far out.
 function platesHtml(c){
  const rows=Array.isArray(c.plates?.rows)?c.plates.rows:[];
  const groups=new Map();for(const r of rows){const k=(r.at||[]).join("–")+"|"+(r.pos??r.section??r.t);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
  const line=list=>{const r=list[0],x=list.filter(o=>Array.isArray(o.x)),signs=new Set(x.map(o=>Math.sign(num(o.x[0])+num(o.x[1])))),w=x.length?Math.max(...x.map(o=>num(o.x[1])-num(o.x[0]))):0;
   const h=Array.isArray(r.z)?num(r.z[1])-num(r.z[0]):num(r.h_mm);
   const side=!x.length?"сторона стенки на плане не показана":signs.size>1?"с двух сторон стенки":"с одной стороны стенки";
   return`<span>${r.pos?"поз. "+esc(r.pos)+" — ":""}${esc(r.section||"пластина "+fmt(r.t)+" мм")}: ${fmt(num(r.at?.[0]))}–${fmt(num(r.at?.[1]))} мм от начала, ${side}${w?", ширина "+fmt(w)+" мм":""}${h?", высота "+fmt(h)+" мм":", высота — между полками"}${r.approx?" (место примерно: вид нарисован с разрывом)":""}</span>`};
  const gussets=Array.isArray(c.plates?.gussets)?c.plates.gussets:[];
  const gline=g=>{const cs=(g.poly||[]).map(e=>num(e[1])),out=cs.length?Math.max(...cs.map(Math.abs)):0,d=Array.isArray(g.depth)?g.depth:null,x=Array.isArray(g.x)?g.x:null;
   const where=g.plane==="план"?(d?`параллельно полкам, ${fmt(num(d[0]))}–${fmt(num(d[1]))} мм от ${g.edge>0?"нижней":"верхней"} грани`:"параллельно полкам"):(x&&Math.abs(num(x[0])+num(x[1]))>10?`параллельно стенке, ${fmt(num(x[0]))}…${fmt(num(x[1]))} мм от оси`:"в плоскости стенки");
   // (its holes, by diameter: where along)
   const by=new Map();for(const h of Array.isArray(g.holes)?g.holes:[]){const dm=num(h[2]);if(!by.has(dm))by.set(dm,[]);by.get(dm).push(num(h[0]))}
   const holes=[...by].map(([dm,at])=>(dm?"Ø"+dm:"Ø не указан")+" — "+at.length+" шт. ("+at.sort((a,b)=>a-b).map(fmt).join(", ")+" мм от начала)").join("; ");
   return`<span>${g.pos?"поз. "+esc(g.pos)+" — ":""}${esc(g.section||"пластина "+fmt(g.t)+" мм")}: фасонка ${fmt(num(g.at?.[0]))}–${fmt(num(g.at?.[1]))} мм от начала, ${where}${out?", до "+fmt(out)+" мм от оси":""}${holes?", отверстия: "+esc(holes):""}</span>`};
  if(!rows.length&&!gussets.length)return"";
  return`<div class="scheme-fasteners"><b>Рёбра, пластины и фасонки по сборочному чертежу</b>${[...groups.values()].map(line).join("")}${gussets.map(gline).join("")}<small>${esc(c.plates.sheet||"")}</small></div>`
 }
 // The parts of the member as the specification of its assembly sheet lists them (c.parts): position, section, length,
 // count, note (the engineer, 25.10.2026: «каждый узел должен быть показан идеально»).
 function partsHtml(c){
  const rows=Array.isArray(c.parts?.rows)?c.parts.rows:[];if(!rows.length)return"";
  return`<div class="scheme-fasteners"><b>Детали марки по спецификации</b>${rows.map(r=>`<span>${r.pos?"поз. "+esc(r.pos)+" — ":""}${esc(r.section||"сечение не прочитано")}${r.length_mm?", L "+fmt(r.length_mm)+" мм":""}${r.count?", "+fmt(r.count)+" шт.":""}${r.note?" ("+esc(r.note)+")":""}</span>`).join("")}<small>${esc(c.parts.sheet||"")}${c.parts.by?" · как "+esc(c.parts.by):""}</small></div>`
 }
 // The sheet of the member for its card: its assembly sheet (the specification, the plates, the cuts, the fasteners), else
 // the sheet it was placed from.
 function sheetOfRecord(c){return String(c.parts?.sheet||c.plates?.sheet||c.cuts?.sheet||c.joint?.fasteners_sheet||c.source_import_doc||"")}
 // The mass of the mark by the КМД: of the register, else of the specification when it gives every part's.
 function markMass(c,linked){
  const m=num(linked?.mass_kg);if(m>0)return m;
  const rows=Array.isArray(c.parts?.rows)?c.parts.rows:[];
  return rows.length&&rows.every(r=>num(r.mass_kg)>0&&num(r.count)>0)?Math.round(rows.reduce((a,r)=>a+num(r.mass_kg)*num(r.count),0)*10)/10:null
 }
 function renderDetails(){
  const panel=document.getElementById("schemeDetails");if(!panel)return;const c=selected();
  if(!c){panel.innerHTML=pickerHtml()+`<div class="scheme-detail-empty"><b>Элемент не выбран</b><span>Нажмите на элемент на схеме или добавьте новый.</span>${canEdit()?'<button type="button" data-scheme-add>＋ Добавить элемент</button>':""}</div>`;panel.querySelector("[data-scheme-add]")?.addEventListener("click",()=>window.irThreeSchemeView?.startPlacement?.()??openEditor());bindElementPicker(panel);return}
  // The name as the register of the program has it now (it goes first: the engineer, 26.10.2026), else as placed.
  const a=axisText(c),between=c.dx||c.dy,linked=linkedMark(c),progress=markProgress(linked),name=String(linked?.name||"").trim()||c.mark_name;
  const progressHtml=progress?.total>0?`<div class="scheme-mark-progress">
    <b>Марка ${esc(c.mark)} · данные из ведомости</b>
    <div><span>Всего <strong>${fmt(progress.total)} шт.</strong></span><span>Смонтировано <strong>${fmt(progress.mounted)} шт.</strong></span><span>Осталось <strong>${fmt(progress.left)} шт.</strong></span></div>
    <div class="scheme-mark-progress-bar"><i style="width:${Math.max(0,Math.min(100,progress.mounted/progress.total*100))}%"></i></div>
    ${progress.state==="partial"?'<small>Ведомость показывает частичное выполнение марки, но не указывает, какой именно экземпляр смонтирован.</small>':""}
   </div>`:"";
  const actionsHtml=canEdit()?`<div class="scheme-detail-actions"><button type="button" data-scheme-edit>Редактировать</button><button type="button" data-scheme-copy-place>⧉ Размещение</button><button type="button" data-scheme-copy>⧉ Копировать позицию</button><button type="button" class="danger" data-scheme-delete>Удалить</button></div>${irProject.ai?.invoke?`<div class="scheme-journal-send"><input type="text" data-scheme-journal-note maxlength="500" placeholder="Комментарий к правке (необязательно)"><button type="button" data-scheme-journal title="Правки и расстановка записываются в журнал сами; кнопка добавляет к элементу ваш комментарий. Журнал уходит на GitHub каждый час">В журнал</button><small data-scheme-journal-state>${journalSent.has(String(c.id))?"В журнале: "+esc(journalSent.get(String(c.id))):""}</small></div>`:""}`:"";
  // The card in plain words, by the drawings (src/scheme-element-card.js): what it is, its section, where it stands, what
  // the drawings say of it; the exact coordinates folded away. The tiles of before only when the module is not loaded.
  const EC=window.irSchemeElementCard;
  if(EC){
   const e={mark:c.mark,name,type_name:String(c.type_name||FITTING_LABEL[c.ft]||""),type_key:String(c.type_key||""),lay:c.lay||null,group:recordMarkGroup(c).key,geometry:c.geometryType,
    profile:profileShown(c),standard:String(c.profile_standard||""),section:sectionShown(c),status:c.status,
    status_label:statusText(c.status),status_title:progress?.total>0?"Статус по ведомости марок":"Статус задан вручную",
    x:c.x,y:c.y,x2:c.x2,y2:c.y2,z0:c.z0,z2:c.z2,mx:c.mx,my:c.my,mz:c.mz,r:c.r,ri:c.ri,sw:c.sw,ft:c.ft,
    doc:String(c.source_import_doc||""),src_section:String(c.source_section||""),instance_status:String(c.instance_status||""),preliminary:isPreliminary(c),
    reasons:Array.isArray(c.instance_reasons)?c.instance_reasons.map(String):[],sources:c.param_sources&&typeof c.param_sources==="object"?c.param_sources:null,
    pdf_new:c.pdf_new&&typeof c.pdf_new==="object"?c.pdf_new:null,check_note:String(c.check_note||""),manual:!c.import_batch};
   const grid={axesX:[...axesX],axesY:[...axesY],posX:Object.fromEntries(axisXPos),posY:Object.fromEntries(axisYPos)};
   // As the card of the report of 21.10.2026: the day of mounting, the sheet, the masses, the bolts, the nodes and the parts
   // of the member in their colours on the model (src/scheme-element-card.js head … parts).
   if(!mountDays&&progress?.total>0)loadMountDays().then(()=>{if(selectedId===c.id)renderDetails()});
   const V=window.irThreeSchemeView,day=mountDay(linked,progress);
   Object.assign(e,{status_date:day.date,status_more:day.more,sheet:sheetOfRecord(c),mass_kmd:markMass(c,linked),model:V?.card?.(c.id)||null,
    spec:Array.isArray(c.parts?.rows)?c.parts:null,kgm:t=>V?.massPerMetre?.(t,c.profile_standard)??null});
   panel.innerHTML=pickerHtml()+`<div class="ec-card"><div class="scheme-detail-title"><span>Выбранный элемент</span></div>${EC.head(e)}${EC.facts(e)}${EC.nodes(e)}${EC.tools(e)}${EC.parts(e)}${EC.what(e)}${EC.where(e,grid)}${EC.drawings(e)}<div class="ec-mark-host"></div>
    ${progressHtml}${fastenersHtml(c)}${drillHtml(c)}${cutsHtml(c)}${platesHtml(c)}${EC.coords(e)}</div>${actionsHtml}`;
   EC.bind(panel,String(c.id));
  }else
  panel.innerHTML=pickerHtml()+`${c.check_note?`<div class="scheme-check-note"><small>Проверьте: ${esc(String(c.check_note).replace(/\s*—?\s*проверьте\.?/giu,""))}</small></div>`:""}<div class="scheme-detail-title"><span>Выбранный элемент</span><b>${esc(c.mark||"—")}</b>${name?`<small>${esc(name)}</small>`:""}</div>${instanceHtml(c)}
   <div class="scheme-detail-grid">
    <div><span>Наименование</span><b>${esc(name||"—")}</b></div>
    <div><span>Тип элемента</span><b>${esc(c.type_name||FITTING_LABEL[c.ft]||geometryLabel(c.geometryType))}</b></div><div><span>Сечение</span><b>${esc(sectionShown(c))}</b></div>
    <div><span>Профиль</span><b>${esc(profileShown(c))}</b></div>
    <div><span>${progress?.total>0?"Статус по ведомости":"Статус (ручной)"}</span><b class="${c.status==="mounted"?"ok":c.status==="partial"?"partial":"wait"}">${statusText(c.status)}</b></div>
    <div><span>Ось ${esc(axesX[0])}–${esc(axesX.at(-1))}</span><b>${esc(a.x)}</b></div>
    <div><span>Ось ${esc(axesY[0])}–${esc(axesY.at(-1))}</span><b>${esc(a.y)}</b></div>
    <div><span>Коорд. X</span><b>${fmt(c.x)} мм</b></div>
    <div><span>Коорд. Y</span><b>${fmt(c.y)} мм</b></div>
    <div><span>Низ</span><b>${fmt(c.z0)} мм</b></div>
    <div><span>Верх / конец Z</span><b>${fmt(c.z2)} мм</b></div>
    ${c.geometryType==="bent"?`<div><span>Конёк X</span><b>${fmt(c.mx)} мм</b></div><div><span>Конёк Y</span><b>${fmt(c.my)} мм</b></div><div><span>Конёк Z</span><b>${fmt(c.mz)} мм</b></div><div><span>Длина обеих ветвей</span><b>${fmt(Math.hypot(c.mx-c.x,c.my-c.y,c.mz-c.z0)+Math.hypot(c.x2-c.mx,c.y2-c.my,c.z2-c.mz))} мм</b></div>`:""}
    ${c.geometryType!=="column"?`<div><span>Конец X</span><b>${fmt(c.x2)} мм</b></div><div><span>Конец Y</span><b>${fmt(c.y2)} мм</b></div>`:""}
   </div>
   ${progressHtml}
   ${fastenersHtml(c)}${drillHtml(c)}${cutsHtml(c)}${platesHtml(c)}${partsHtml(c)}
   ${between?`<div class="scheme-between"><b>Элемент между осями</b><span>${esc(a.x)} / ${esc(a.y)}</span><small>Положение вычисляется от выбранных базовых осей и сохраняется точно в миллиметрах.</small></div>`:""}
   ${actionsHtml}`;
  loadMarkCard(panel,c);
  // The journal of edits: the element as it is now, what the program placed and the comment (src/ai-training.js).
  panel.querySelector("[data-scheme-journal]")?.addEventListener("click",async e=>{
   const btn=e.currentTarget,state=panel.querySelector("[data-scheme-journal-state]"),note=panel.querySelector("[data-scheme-journal-note]");btn.disabled=true;
   try{const r=await irProject.ai.invoke("ai-montage:journal-add",{objectId:oid,elementId:String(c.id),comment:note?.value||""});
    const t=journalStamp(r.entry.text);journalSent.set(String(c.id),t);if(state)state.textContent="В журнале: "+t;if(note)note.value=""}
   catch(error){if(state)state.textContent="Не записано: "+String(error?.message||error).replace(/^Error invoking remote method[^:]*: (Error: )?/,"")}
   finally{btn.disabled=false}
  });
  panel.querySelector("[data-scheme-edit]")?.addEventListener("click",()=>openEditor(c));
  panel.querySelector("[data-scheme-copy]")?.addEventListener("click",()=>openEditor(c,true));
  panel.querySelector("[data-scheme-copy-place]")?.addEventListener("click",()=>{
   const mark=linkedMark(c),quota=mark&&markPlacement(mark);
   if(!quota?.left){alert("Нет остатка марки по ведомости.");return}
   window.irThreeSchemeView?.startCopy?.(String(c.id))
  });
  panel.querySelector("[data-scheme-delete]")?.addEventListener("click",async()=>{if(!confirm(`Удалить элемент ${c.mark?`«${c.mark}» `:""}со схемы?`)){restoreKeyboardAfterConfirm();return}restoreKeyboardAfterConfirm();await journalAuto(c.id,"deleted");await schemeApi.remove(c.id);rows=await schemeApi.list().catch(()=>rows);selectedId="";refreshAfterMemberChange();restoreKeyboardAfterConfirm()});bindElementPicker(panel)
 }
 let gridDraft=null;
 const yAlphabet=["А","Б","В","Г","Д","Е","Ж","З","И","К","Л","М","Н","П","Р","С","Т","У","Ф","Х","Ц","Ч","Ш","Щ","Э","Ю","Я"];
 function nextAxisLabel(key,items){
  if(key==="x"){const nums=items.map(x=>Number(x)).filter(Number.isFinite);return String((nums.length?Math.max(...nums):items.length)+1)}
  return yAlphabet.find(x=>!items.includes(x))||`Ось ${items.length+1}`
 }
 function gridDirectionHtml(key){
  const isX=key==="x",items=isX?gridDraft.axesX:gridDraft.axesY,spans=isX?gridDraft.spansX:gridDraft.spansY,size=isX?gridDraft.sizeX:gridDraft.sizeY,title=`${items[0]}–${items.at(-1)}`,direction=isX?gridDraft.dirX:gridDraft.dirY;
  return`<section data-grid-section="${key}">
   <div class="scheme-grid-config-head"><div><b>Направление ${esc(title)}</b><span>${items.length} осей · ${spans.length} пролётов</span></div><button type="button" data-grid-equal="${key}">Распределить равномерно</button></div>
   <label class="scheme-grid-size"><span>Общий размер</span><input type="text" inputmode="decimal" data-grid-size="${key}" value="${esc(fmt(size))}"><small>мм</small></label>
   <label class="scheme-grid-direction"><span>Отображение осей</span><select data-grid-direction="${key}">${isX?`<option value="ltr" ${direction==="ltr"?"selected":""}>Слева направо: ${esc(items[0])} → ${esc(items.at(-1))}</option><option value="rtl" ${direction==="rtl"?"selected":""}>Справа налево: ${esc(items[0])} → ${esc(items.at(-1))}</option>`:`<option value="btt" ${direction==="btt"?"selected":""}>Снизу вверх: ${esc(items[0])} → ${esc(items.at(-1))}</option><option value="ttb" ${direction==="ttb"?"selected":""}>Сверху вниз: ${esc(items[0])} → ${esc(items.at(-1))}</option>`}</select></label>
   <div class="scheme-grid-axis-title"><span>Оси</span><small>Название оси можно изменить</small></div>
   <div class="scheme-axis-list">${items.map((axis,i)=>`<div class="scheme-axis-item"><input type="text" data-grid-axis="${key}" data-index="${i}" value="${esc(axis)}"><button type="button" data-grid-remove-axis="${key}" data-index="${i}" ${items.length<=2?"disabled":""} title="Удалить ось">×</button></div>`).join("")}<button type="button" class="scheme-add-axis" data-grid-add-axis="${key}">＋ Добавить ось</button></div>
   <div class="scheme-grid-axis-title"><span>Пролёты</span><small>Расстояние между соседними осями</small></div>
   <div class="scheme-grid-spans">${spans.map((value,i)=>`<label><span>${esc(pairLabel(items,i))}</span><input type="text" inputmode="decimal" data-grid-span="${key}" data-index="${i}" value="${esc(fmt(value))}"><small>мм</small></label>`).join("")}</div>
   <div class="scheme-grid-total" id="schemeGridTotal${isX?"X":"Y"}"></div>
  </section>`
 }
 function gridEditorHtml(){
  return`<dialog id="schemeGridEditor" class="scheme-grid-editor"><form id="schemeGridForm" novalidate><div class="scheme-editor-head"><div><h2>Параметры сетки</h2><p>Добавляйте и удаляйте оси, меняйте их названия, пролёты и общий размер сетки.</p></div><button type="button" id="schemeGridX">×</button></div>
   <div class="scheme-grid-warning">В Общей схеме нельзя удалить используемые оси. Дополнительная сетка настраивается отдельно, координаты элементов сохраняются в миллиметрах.</div>
   <div class="scheme-grid-config" id="schemeGridBody"></div>
   <div class="scheme-form-error" id="schemeGridError" hidden></div>
   <div class="actions"><button type="button" id="schemeGridCancel">Отмена</button><button type="submit" class="primary" id="schemeGridSave">Сохранить сетку</button></div>
  </form></dialog>`
 }
 function showGridError(message){
  const err=document.getElementById("schemeGridError");if(!err)return;err.textContent=message||"";err.hidden=!message
 }
 function renderGridEditor(){
  const body=document.getElementById("schemeGridBody");if(!body||!gridDraft)return;body.innerHTML=gridDirectionHtml("x")+gridDirectionHtml("y");
  body.querySelectorAll("[data-grid-axis]").forEach(el=>{el.oninput=()=>{const key=el.dataset.gridAxis,i=Number(el.dataset.index),items=key==="x"?gridDraft.axesX:gridDraft.axesY;items[i]=el.value};el.onchange=()=>{const key=el.dataset.gridAxis,i=Number(el.dataset.index),items=key==="x"?gridDraft.axesX:gridDraft.axesY;items[i]=el.value.trim();renderGridEditor()}});
  body.querySelectorAll("[data-grid-span]").forEach(el=>el.oninput=()=>{const key=el.dataset.gridSpan,i=Number(el.dataset.index),spans=key==="x"?gridDraft.spansX:gridDraft.spansY;spans[i]=num(el.value);refreshGridEditor()});
  body.querySelectorAll("[data-grid-size]").forEach(el=>el.oninput=()=>{if(el.dataset.gridSize==="x")gridDraft.sizeX=num(el.value);else gridDraft.sizeY=num(el.value);refreshGridEditor()});
  body.querySelectorAll("[data-grid-direction]").forEach(el=>el.onchange=()=>{if(el.dataset.gridDirection==="x")gridDraft.dirX=el.value;else gridDraft.dirY=el.value});
  body.querySelectorAll("[data-grid-equal]").forEach(btn=>btn.onclick=()=>{const key=btn.dataset.gridEqual,count=(key==="x"?gridDraft.axesX:gridDraft.axesY).length-1,total=key==="x"?gridDraft.sizeX:gridDraft.sizeY,vals=equalSpans(total,count);if(key==="x")gridDraft.spansX=vals;else gridDraft.spansY=vals;renderGridEditor()});
  body.querySelectorAll("[data-grid-add-axis]").forEach(btn=>btn.onclick=()=>{const key=btn.dataset.gridAddAxis,items=key==="x"?gridDraft.axesX:gridDraft.axesY,sources=key==="x"?gridDraft.sourceX:gridDraft.sourceY,spans=key==="x"?gridDraft.spansX:gridDraft.spansY,sizeKey=key==="x"?"sizeX":"sizeY",suggested=Math.max(1,Math.round(spans.length?spans.reduce((s,x)=>s+num(x),0)/spans.length:6000));items.push(nextAxisLabel(key,items));sources.push(null);spans.push(suggested);gridDraft[sizeKey]+=suggested;renderGridEditor()});
  body.querySelectorAll("[data-grid-remove-axis]").forEach(btn=>btn.onclick=()=>{const key=btn.dataset.gridRemoveAxis,i=Number(btn.dataset.index),items=key==="x"?gridDraft.axesX:gridDraft.axesY,sources=key==="x"?gridDraft.sourceX:gridDraft.sourceY,spans=key==="x"?gridDraft.spansX:gridDraft.spansY,sizeKey=key==="x"?"sizeX":"sizeY";if(items.length<=2)return;const source=sources[i],used=activeScheme==="all"&&source&&allRecords().some(r=>String(key==="x"?r.axis_x:r.axis_y)===String(source));if(used){showGridError(`Ось «${source}» используется колоннами. Сначала перенесите эти колонны на другую ось.`);return}showGridError("");if(i===0){gridDraft[sizeKey]-=num(spans.shift());items.shift();sources.shift()}else if(i===items.length-1){gridDraft[sizeKey]-=num(spans.pop());items.pop();sources.pop()}else{spans[i-1]=num(spans[i-1])+num(spans[i]);spans.splice(i,1);items.splice(i,1);sources.splice(i,1)}renderGridEditor()});
  refreshGridEditor()
 }
 function openGridEditor(){
  const d=document.getElementById("schemeGridEditor");if(!d)return;gridDraft={axesX:[...axesX],axesY:[...axesY],sourceX:[...axesX],sourceY:[...axesY],spansX:[...gridXSpans],spansY:[...gridYSpans],sizeX:targetSpanX,sizeY:targetSpanY,dirX:gridDirX,dirY:gridDirY};showGridError("");renderGridEditor();d.showModal()
 }
 function refreshGridEditor(){
  if(!gridDraft)return;const tx=document.getElementById("schemeGridTotalX"),ty=document.getElementById("schemeGridTotalY"),save=document.getElementById("schemeGridSave"),sx=gridDraft.spansX.reduce((s,x)=>s+num(x),0),sy=gridDraft.spansY.reduce((s,x)=>s+num(x),0);
  const paint=(el,sum,target)=>{const diff=target-sum,ok=target>0&&Math.abs(diff)<.11;el.className=`scheme-grid-total ${ok?"ok":"bad"}`;el.innerHTML=`<span>Сумма пролётов</span><b>${fmt(sum)} мм</b><small>${ok?"Совпадает с размером":diff>0?`Не хватает ${fmt(diff)} мм`:`Превышение ${fmt(Math.abs(diff))} мм`}</small>`;return ok};
  const unique=a=>a.length===new Set(a.map(x=>String(x).trim().toLowerCase())).size&&a.every(x=>String(x).trim()),okX=paint(tx,sx,gridDraft.sizeX),okY=paint(ty,sy,gridDraft.sizeY),positive=gridDraft.spansX.every(x=>num(x)>0)&&gridDraft.spansY.every(x=>num(x)>0),names=unique(gridDraft.axesX)&&unique(gridDraft.axesY);save.disabled=!(okX&&okY&&positive&&names&&gridDraft.axesX.length>=2&&gridDraft.axesY.length>=2)
 }
 function bindGridEditor(){
  if(!canEdit())return;const d=document.getElementById("schemeGridEditor"),form=document.getElementById("schemeGridForm");if(!d||!form)return;
  document.getElementById("schemeGridConfig")?.addEventListener("click",openGridEditor);document.getElementById("schemeGridX").onclick=()=>d.close();document.getElementById("schemeGridCancel").onclick=()=>d.close();
  form.onsubmit=async e=>{e.preventDefault();showGridError("");if(!gridDraft)return;const ax=gridDraft.axesX.map(x=>String(x).trim()),ay=gridDraft.axesY.map(x=>String(x).trim()),xs=gridDraft.spansX.map(num),ys=gridDraft.spansY.map(num),sx=xs.reduce((s,x)=>s+x,0),sy=ys.reduce((s,x)=>s+x,0);if(ax.some(x=>!x)||ay.some(x=>!x)||new Set(ax.map(x=>x.toLowerCase())).size!==ax.length||new Set(ay.map(x=>x.toLowerCase())).size!==ay.length){showGridError("Названия осей должны быть заполнены и не должны повторяться.");return}if(xs.some(x=>x<=0)||ys.some(x=>x<=0)||gridDraft.sizeX<=0||gridDraft.sizeY<=0){showGridError("Размеры и расстояния между осями должны быть больше 0.");return}if(Math.abs(sx-gridDraft.sizeX)>=.11||Math.abs(sy-gridDraft.sizeY)>=.11){showGridError("Сумма пролётов должна совпадать с общим размером каждого направления.");return}
   const mapX=new Map(gridDraft.sourceX.map((old,i)=>old?[String(old),ax[i]]:null).filter(Boolean)),mapY=new Map(gridDraft.sourceY.map((old,i)=>old?[String(old),ay[i]]:null).filter(Boolean));
   const nextGrid={axes_x:ax,axes_y:ay,x_spans_mm:xs,y_spans_mm:ys,span_x_mm:gridDraft.sizeX,span_y_mm:gridDraft.sizeY,x_direction:gridDraft.dirX,y_direction:gridDraft.dirY};
   const view=activeView(),gridBefore={axes_x:[...axesX],axes_y:[...axesY],x_spans_mm:[...gridXSpans],y_spans_mm:[...gridYSpans]};try{
    if(view)await schemeApi.update(view.id,{record_type:"scheme_view",title:view.data?.name||view.title||"Монтажная сетка",data:{...view.data,grid:nextGrid}});
    else{
     for(const row of arr(rows).filter(r=>r.record_type==="scheme_column"||r.data?.entity_type==="column")){
      const d0=row.data||{},nx=mapX.get(String(d0.axis_x||""))||String(d0.axis_x||""),ny=mapY.get(String(d0.axis_y||""))||String(d0.axis_y||"");
      if(nx!==String(d0.axis_x||"")||ny!==String(d0.axis_y||""))await schemeApi.update(row.id,{record_type:row.record_type||"scheme_column",title:row.title||d0.position||"Колонна",data:{...d0,axis_x:nx,axis_y:ny}})
     }
     const existing=gridRecord(),payload={record_type:"scheme_grid",title:"Сетка осей",data:{entity_type:"grid",...nextGrid}};
     if(existing)await schemeApi.update(existing.id,payload);else await schemeApi.create(payload);
    }
    rows=await schemeApi.list();refreshGridModel();d.close();gridDraft=null;draw();journalAuto(null,"grid",{grid:{before:gridBefore,after:nextGrid}})
   }catch(error){showGridError("Не удалось сохранить сетку: "+String(error?.message||error))}
  }
 }
 function editorHtml(){
  return`<dialog id="schemeEditor" class="scheme-editor"><form id="schemeForm" novalidate><input type="hidden" name="id"><div class="scheme-editor-head"><div><h2 id="schemeEditorTitle">Добавить элемент</h2><p>Выберите марку для текущей монтажной схемы и задайте положение относительно осей.</p></div><button type="button" id="schemeEditorX">×</button></div>
   <div class="scheme-form-grid">
    <label class="wide scheme-editor-grid-field">Сетка размещения<select name="scheme_target" id="schemeEditorGridSelect" data-native-select="1">${schemeGroups().map(g=>`<option value="${esc(g.key)}">${esc(g.label)}</option>`).join("")}</select><small>По умолчанию — текущая сетка. На Общей схеме видны все размещённые конструкции.</small></label>
    <label class="wide scheme-mark-field">Марка из ведомости<div class="scheme-mark-search"><input id="schemeMarkSearch" type="search" autocomplete="off" placeholder="Поиск по марке или наименованию…"><span id="schemeMarkCount"></span></div><select name="mark_id" required>${markOptions("")}</select><div id="schemeMarkPlacementInfo" class="scheme-mark-placement-info" aria-live="polite"></div></label>
    <label>Статус монтажа<select name="status"><option value="planned">Не смонтирована</option><option value="partial">Частично</option><option value="mounted">Смонтирована</option></select></label><div class="scheme-editor-mount-info wide" id="schemeEditorMountInfo"></div>
    <label>Геометрия элемента<select name="geometry_type" id="schemeGeometryType">${geometryOptions("column")}</select></label>
    <label>Тип сечения<select name="section_type">${sectionOptions("ibeam")}</select></label>
    <label class="wide">Профиль / обозначение<input name="profile_name" placeholder="Например: 40К2, 300×300×10, Ø273×8"></label>
    <div class="scheme-form-axis"><b>Направление ${esc(axesX[0])}–${esc(axesX.at(-1))}</b><label>Базовая ось<select name="axis_x">${axisOptions(axesX,axesX[0])}</select></label><label>Смещение, мм<input name="offset_x_mm" inputmode="decimal" value="0"></label></div>
    <div class="scheme-form-axis"><b>Направление ${esc(axesY[0])}–${esc(axesY.at(-1))}</b><label>Базовая ось<select name="axis_y">${axisOptions(axesY,axesY[0])}</select></label><label>Смещение, мм<input name="offset_y_mm" inputmode="decimal" value="0"></label></div>
    <div class="scheme-member-end wide" id="schemeMemberEnd" hidden><b>Конец элемента — вторая точка для балки, связи или фермы</b>
     <div><label>Ось по X<select name="end_axis_x">${axisOptions(axesX,axesX[1]||axesX[0])}</select></label><label>Смещение X, мм<input name="end_offset_x_mm" inputmode="decimal" value="0"></label>
     <label>Ось по Y<select name="end_axis_y">${axisOptions(axesY,axesY[0])}</select></label><label>Смещение Y, мм<input name="end_offset_y_mm" inputmode="decimal" value="0"></label></div></div>
    <div class="scheme-member-end wide" id="schemeMemberMiddle" hidden><b>Конёк / излом — одна балка, две наклонные части</b>
     <label class="wide scheme-ridge-mode">Расположение конька
      <select name="ridge_mode" id="schemeRidgeMode" data-native-select="1">
       <option value="center">По центру — X/Y между началом и концом</option>
       <option value="manual">Вручную — точные оси и смещения X/Y</option>
      </select>
     </label>
     <div class="scheme-middle-coordinates" id="schemeMiddleCoordinates">
      <label>Ось по X<select name="mid_axis_x">${axisOptions(axesX,axesX[1]||axesX[0])}</select></label><label>Смещение X, мм<input name="mid_offset_x_mm" inputmode="decimal" value="0"></label>
      <label>Ось по Y<select name="mid_axis_y">${axisOptions(axesY,axesY[0])}</select></label><label>Смещение Y, мм<input name="mid_offset_y_mm" inputmode="decimal" value="0"></label>
     </div>
     <div class="scheme-ridge-note" id="schemeRidgeNote">X/Y конька рассчитываются автоматически точно посередине между началом и концом. Смещения вручную не требуются.</div>
     <label>Отметка конька Z, мм<input name="mid_z_mm" inputmode="decimal" value="10000"></label>
    </div>
    <label>Отметка низа / начала, мм<input name="z0_mm" inputmode="decimal" value="0"></label>
    <label>Отметка верха / конца, мм<input name="z1_mm" inputmode="decimal" value="8400"></label>
    <label>Поворот, °<input name="rotation_deg" inputmode="decimal" value="0"></label>
    <div class="scheme-coordinate-preview wide" id="schemeCoordPreview"></div>
   </div>
   <div class="scheme-form-error" id="schemeFormError" hidden></div>
   <div class="actions"><button type="button" id="schemeEditorCancel">Отмена</button><button type="submit" class="primary">Сохранить элемент</button></div>
  </form></dialog>`
 }
 function openEditor(c=null,copy=false,placement=null){
  const d=document.getElementById("schemeEditor"),f=document.getElementById("schemeForm"),err=document.getElementById("schemeFormError");if(!d||!f)return;
  // Position templates retain exact XY, both Z elevations, ridge, profile
  // and rotation, while creating a new record with its own available mark.
  const copyingPosition=Boolean(c&&copy);
  if(copyingPosition)c={...c,id:"",status:"planned",position:"",title:""};
  f.reset();f.dataset.copyPosition=copyingPosition?"1":"0";err.hidden=true;
  // The geometries and sections of the element's kind: a sandwich panel offers a panel and a profiled sheet, not an I-beam.
  const fitShape=(src,m,geo)=>{const ek=elementKind(src,m);f.elements.geometry_type.innerHTML=geometryOptions(geo,ek);f.elements.section_type.innerHTML=sectionOptions(sectionFor(src,ek),ek);f.elements.profile_name.placeholder=ek==="panel"||ek==="profsheet"?"Например: ПС 5490.1190.150, Н57-750-0,7":"Например: 40К2, 300×300×10, Ø273×8"};
  document.getElementById("schemeEditorTitle").textContent=copyingPosition?"Копировать позицию — параметры и отметки Z":c?"Редактировать элемент":"Добавить элемент";
  f.elements.id.value=copyingPosition?"":c?.id||"";
  // Reopen the actual stored grid for edits and copies, including the shared grid.
  const sourceView=c?.scheme_view_id&&c.scheme_view_id!=="all"?customViews().find(x=>String(x.id)===String(c.scheme_view_id)):null;
  let gridChoice=c?.scheme_view_id==="all"?"all":sourceView?"view:"+sourceView.id:activeScheme,editorGrid=gridForEditor(gridChoice),editorMarks=marksForGrid(gridChoice);
  const sourceGeometry=c?.geometryType||c?.geometry_type||"";
  const compatibleMark=m=>!copyingPosition||guessGeometry(m)===(sourceGeometry==="bent"?"beam":sourceGeometry);
  if(copyingPosition)editorMarks=editorMarks.filter(compatibleMark);
  f.elements.scheme_target.value=gridChoice;
  let chosenMark=placement?.markId||resolveSavedMarkId(c),currentMark=chosenMark;
  const editingId=String(f.elements.id.value||""),unresolvedExisting=!!editingId&&!currentMark,
   search=document.getElementById("schemeMarkSearch"),count=document.getElementById("schemeMarkCount"),
   selection=f.elements.mark_id,availability=document.getElementById("schemeMarkPlacementInfo");
  if(!editorMarks.some(m=>m.id===chosenMark&&markAvailable(m,editingId)))chosenMark=editorMarks.find(m=>markAvailable(m,editingId))?.id||"";
  const renderMarkOptions=()=>{
   const q=search?.value||"",matched=searchMarks(q,editorMarks),valid=matched.some(m=>m.id===chosenMark&&markAvailable(m,editingId));
   if(!valid)chosenMark="";
   selection.innerHTML=markOptions(chosenMark,q,unresolvedExisting&&!chosenMark,editorMarks,editingId);
   selection.value=chosenMark;
   count.textContent=q?`Найдено: ${matched.length} · Доступно: ${matched.filter(m=>markAvailable(m,editingId)).length}`:`Марок: ${editorMarks.length} · Доступно: ${editorMarks.filter(m=>markAvailable(m,editingId)).length}`;
   selection._irSelectUI?.refresh?.();refreshEditorProgress()
  };
  selection.onchange=()=>{
   const value=String(selection.value||"");
   if(value&&!editorMarks.some(m=>m.id===value&&markAvailable(m,editingId))){selection.value="";chosenMark="";renderMarkOptions();return}
   chosenMark=value;
   if(value&&!editingId&&!copyingPosition){const m=editorMarks.find(x=>x.id===value),same=allRecords().find(x=>String(x.mark_id||"")===value);f.elements.profile_name.value=same?.profile_name||"";fitShape(same||{},m,same?geometry(same):m?guessGeometry(m):"column");updateGeometry(true)}
   refreshEditorProgress()
  };
  if(search){search.value="";search.oninput=renderMarkOptions}
  f.elements.status.value=c?.status||"planned";
  function refreshEditorProgress(){
   const m=editorMarks.find(x=>x.id===String(selection.value||"")),progress=markProgress(m),info=document.getElementById("schemeEditorMountInfo");
   const q=markPlacement(m),remaining=m?markAvailable(m,editingId):false;
   availability.classList.toggle("exhausted",!remaining);
   selection.classList.toggle("exhausted",!remaining);
   const field=selection.closest(".scheme-mark-field");field?.classList.toggle("exhausted",!remaining);
   availability.textContent=m?`По ведомости: ${q.total} шт. · На схеме: ${q.placed} шт. · Осталось разместить: ${q.left} шт.${remaining?"":" · НЕТ ОСТАТКА"}`:"Выберите марку, доступную для размещения. Красные марки уже полностью размещены.";

   f.elements.status.disabled=!!progress&&progress.total>0;
   if(progress?.total>0){
    f.elements.status.value=progress.state;
    if(info)info.innerHTML=`<b>Статус определяется по ведомости марок</b><span>Всего: ${fmt(progress.total)} шт. · Смонтировано: ${fmt(progress.mounted)} шт. · Осталось: ${fmt(progress.left)} шт.</span>${progress.state==="partial"?"<small>Частичный монтаж: конкретные экземпляры пока не сопоставлены с отчётами.</small>":""}`
   }else{
    f.elements.status.value=c?.status||"planned";
    if(info)info.innerHTML='<span>У этой марки нет количества в ведомости. Доступен ручной статус.</span>'
   }
  }
  refreshEditorProgress();
  const sameMark=allRecords().find(x=>String(x.mark_id||"")===chosenMark&&(!c||x.id!==c.id)),shapeSource=c||sameMark||{},chosen=editorMarks.find(x=>x.id===chosenMark);
  f.elements.profile_name.value=shapeSource.profile_name||"";
  f.elements.axis_x.value=c?.axisX||editorGrid.axesX[0]||"";f.elements.axis_y.value=c?.axisY||editorGrid.axesY[0]||"";
  f.elements.offset_x_mm.value=c?.dx??0;f.elements.offset_y_mm.value=c?.dy??0;
  f.elements.z0_mm.value=c?.z0??c?.z0_mm??0;f.elements.z1_mm.value=c?.z2??c?.z1_mm??8400;f.elements.rotation_deg.value=c?.rotation_deg??0;
  fitShape(shapeSource,chosen,c?.geometryType||c?.geometry_type||(sameMark?geometry(sameMark):chosen?guessGeometry(chosen):"column"));
  const assignAxes=(reset=false)=>{
   editorGrid=gridForEditor(gridChoice);
   const prevX=reset?editorGrid.axesX[0]:f.elements.axis_x.value,
    prevY=reset?editorGrid.axesY[0]:f.elements.axis_y.value;
   f.elements.axis_x.innerHTML=axisOptions(editorGrid.axesX,prevX);
   f.elements.axis_y.innerHTML=axisOptions(editorGrid.axesY,prevY);
   f.elements.end_axis_x.innerHTML=axisOptions(editorGrid.axesX,editorGrid.axesX[1]||editorGrid.axesX[0]);
   f.elements.end_axis_y.innerHTML=axisOptions(editorGrid.axesY,editorGrid.axesY[0]);
   f.elements.mid_axis_x.innerHTML=axisOptions(editorGrid.axesX,editorGrid.axesX[1]||editorGrid.axesX[0]);
   f.elements.mid_axis_y.innerHTML=axisOptions(editorGrid.axesY,editorGrid.axesY[0]);
   if(!reset&&c){
    // Prefer the saved axes and offsets. Nearest-axis matching is only for legacy records.
    const firstX=editorGrid.axesX.includes(String(c.axis_x||""))?String(c.axis_x):editorGrid.axesX.includes(String(c.axisX||""))?String(c.axisX):closestAxis(c.x,editorGrid.axesX,editorGrid.xPos);
    const firstY=editorGrid.axesY.includes(String(c.axis_y||""))?String(c.axis_y):editorGrid.axesY.includes(String(c.axisY||""))?String(c.axisY):closestAxis(c.y,editorGrid.axesY,editorGrid.yPos);
    f.elements.axis_x.value=firstX;f.elements.axis_y.value=firstY;
    const eX=editorGrid.axesX.includes(String(c.end_axis_x||""))?String(c.end_axis_x):closestAxis(c.x2,editorGrid.axesX,editorGrid.xPos);
    const eY=editorGrid.axesY.includes(String(c.end_axis_y||""))?String(c.end_axis_y):closestAxis(c.y2,editorGrid.axesY,editorGrid.yPos);
    f.elements.end_axis_x.value=eX;f.elements.end_axis_y.value=eY;
    f.elements.offset_x_mm.value=c.offset_x_mm!==undefined?c.offset_x_mm:c.x-num(editorGrid.xPos.get(firstX));
    f.elements.offset_y_mm.value=c.offset_y_mm!==undefined?c.offset_y_mm:c.y-num(editorGrid.yPos.get(firstY));
    f.elements.end_offset_x_mm.value=c.end_offset_x_mm!==undefined?c.end_offset_x_mm:c.x2-num(editorGrid.xPos.get(eX));
    f.elements.end_offset_y_mm.value=c.end_offset_y_mm!==undefined?c.end_offset_y_mm:c.y2-num(editorGrid.yPos.get(eY));
    const mxAxis=closestAxis(c.mx,editorGrid.axesX,editorGrid.xPos),myAxis=closestAxis(c.my,editorGrid.axesY,editorGrid.yPos);
    f.elements.mid_axis_x.value=editorGrid.axesX.includes(String(c.mid_axis_x))?String(c.mid_axis_x):mxAxis;
    f.elements.mid_axis_y.value=editorGrid.axesY.includes(String(c.mid_axis_y))?String(c.mid_axis_y):myAxis;
    f.elements.mid_offset_x_mm.value=c.mx-num(editorGrid.xPos.get(f.elements.mid_axis_x.value));
    f.elements.mid_offset_y_mm.value=c.my-num(editorGrid.yPos.get(f.elements.mid_axis_y.value));
    f.elements.mid_z_mm.value=c.mz;
   }else{
    f.elements.offset_x_mm.value=0;f.elements.offset_y_mm.value=0;
    f.elements.end_offset_x_mm.value=0;f.elements.end_offset_y_mm.value=0;
    f.elements.mid_offset_x_mm.value=0;f.elements.mid_offset_y_mm.value=0
   }
   const heads=f.querySelectorAll(".scheme-form-axis>b");
   if(heads[0])heads[0].textContent="Направление "+editorGrid.axesX[0]+"–"+editorGrid.axesX.at(-1);
   if(heads[1])heads[1].textContent="Направление "+editorGrid.axesY[0]+"–"+editorGrid.axesY.at(-1);
   f.elements.axis_x._irSelectUI?.refresh?.();f.elements.axis_y._irSelectUI?.refresh?.();
   f.elements.end_axis_x._irSelectUI?.refresh?.();f.elements.end_axis_y._irSelectUI?.refresh?.();
   f.elements.mid_axis_x._irSelectUI?.refresh?.();f.elements.mid_axis_y._irSelectUI?.refresh?.()
  };
  assignAxes(false);
  f.elements.scheme_target.onchange=()=>{
   gridChoice=f.elements.scheme_target.value;
   editorGrid=gridForEditor(gridChoice);editorMarks=marksForGrid(gridChoice).filter(compatibleMark);
   chosenMark=editorMarks.some(m=>m.id===chosenMark&&markAvailable(m,editingId))?chosenMark:editorMarks.find(m=>markAvailable(m,editingId))?.id||"";
   assignAxes(true);renderMarkOptions();refreshPreview()
  };
  renderMarkOptions();
  function updateGeometry(defaultHeights=false){
   const kind=f.elements.geometry_type.value,member=!pointGeometry(kind),end=document.getElementById("schemeMemberEnd");
   if(end)end.hidden=!member;
   const middle=document.getElementById("schemeMemberMiddle");if(middle)middle.hidden=kind!=="bent";
   const manual=f.elements.ridge_mode.value==="manual",
    midCoords=document.getElementById("schemeMiddleCoordinates"),
    note=document.getElementById("schemeRidgeNote");
   if(midCoords)midCoords.hidden=!manual;
   if(note)note.hidden=manual;
   if(defaultHeights&&member){if(kind==="brace"){f.elements.z0_mm.value=0;f.elements.z1_mm.value=8400}else{f.elements.z0_mm.value=8400;f.elements.z1_mm.value=8400}}
   if(defaultHeights&&!member){f.elements.z0_mm.value=0;f.elements.z1_mm.value=8400}
   if(defaultHeights&&kind==="bent"){f.elements.z0_mm.value=9400;f.elements.z1_mm.value=9400;f.elements.mid_z_mm.value=10000}
   refreshPreview()
  }
  const refreshPreview=()=>{
   const ax=f.elements.axis_x.value,ay=f.elements.axis_y.value,x=num(editorGrid.xPos.get(ax))+num(f.elements.offset_x_mm.value),y=num(editorGrid.yPos.get(ay))+num(f.elements.offset_y_mm.value),member=!pointGeometry(f.elements.geometry_type.value),endX=num(editorGrid.xPos.get(f.elements.end_axis_x.value))+num(f.elements.end_offset_x_mm.value),endY=num(editorGrid.yPos.get(f.elements.end_axis_y.value))+num(f.elements.end_offset_y_mm.value),
   bent=f.elements.geometry_type.value==="bent",centered=f.elements.ridge_mode.value!=="manual",
   mx=centered?(x+endX)/2:num(editorGrid.xPos.get(f.elements.mid_axis_x.value))+num(f.elements.mid_offset_x_mm.value),
   my=centered?(y+endY)/2:num(editorGrid.yPos.get(f.elements.mid_axis_y.value))+num(f.elements.mid_offset_y_mm.value),
   length=bent?Math.hypot(mx-x,my-y,num(f.elements.mid_z_mm.value)-num(f.elements.z0_mm.value))+Math.hypot(endX-mx,endY-my,num(f.elements.z1_mm.value)-num(f.elements.mid_z_mm.value)):0;
   document.getElementById("schemeCoordPreview").innerHTML=`<span>Точные координаты</span><b>Начало X = ${fmt(x)} мм · Y = ${fmt(y)} мм</b><small>${member?`${bent?"Конёк X = "+fmt(mx)+" мм · Y = "+fmt(my)+" мм · Z = "+fmt(f.elements.mid_z_mm.value)+" мм · ":""}Конец X = ${fmt(endX)} мм · Y = ${fmt(endY)} мм${bent?" · Длина "+fmt(length)+" мм":""}`:f.elements.geometry_type.value==="column"?"Колонна расположена вертикально":"Центр листа, размер — по радиусу элемента"}</small>`;
  };
  // Existing asymmetric beams must stay asymmetric unless explicitly changed.
  // Legacy records without a ridge_mode are classified using their saved X/Y.
  const existingCentered=c?.geometryType==="bent"&&
   Math.hypot(num(c.mx)-(num(c.x)+num(c.x2))/2,num(c.my)-(num(c.y)+num(c.y2))/2)<1.1;
  f.elements.ridge_mode.value=c?.ridge_mode==="manual"?"manual":
   c?.ridge_mode==="center"||!c||existingCentered?"center":"manual";
  f.elements.ridge_mode.onchange=()=>updateGeometry(false);
  f.elements.geometry_type.onchange=()=>updateGeometry(false);updateGeometry(!c&&f.elements.geometry_type.value!=="column");
  if(placement){
   const start=placement.start,end=placement.end||start;
   f.elements.mark_id.value=placement.markId;chosenMark=placement.markId;
   {const same=allRecords().find(x=>String(x.mark_id||"")===String(placement.markId));fitShape(same||{},editorMarks.find(x=>x.id===String(placement.markId)),placement.geometry)}
   f.elements.axis_x.value=start.ax;f.elements.axis_y.value=start.ay;
   f.elements.offset_x_mm.value=start.dx??0;f.elements.offset_y_mm.value=start.dy??0;
   f.elements.end_axis_x.value=end.ax;f.elements.end_axis_y.value=end.ay;
   f.elements.end_offset_x_mm.value=end.dx??0;f.elements.end_offset_y_mm.value=end.dy??0;
   f.elements.z0_mm.value=placement.geometry==="column"?0:(start.z??placement.height);
   f.elements.z1_mm.value=placement.geometry==="column"?placement.height:(end.z??placement.height);
   if(placement.middle){const mid=placement.middle;f.elements.mid_axis_x.value=mid.ax;f.elements.mid_axis_y.value=mid.ay;f.elements.mid_offset_x_mm.value=mid.dx??0;f.elements.mid_offset_y_mm.value=mid.dy??0;f.elements.mid_z_mm.value=mid.z??10000}
   f.elements.ridge_mode.value=placement.ridgeMode==="manual"?"manual":"center";
   updateGeometry(false);renderMarkOptions();
  }
  ["axis_x","axis_y","offset_x_mm","offset_y_mm","end_axis_x","end_axis_y","end_offset_x_mm","end_offset_y_mm","mid_axis_x","mid_axis_y","mid_offset_x_mm","mid_offset_y_mm","mid_z_mm","z0_mm","z1_mm"].forEach(n=>f.elements[n].addEventListener("input",refreshPreview));refreshPreview();d.showModal()
 }
 function bindEditor(){
  if(!canEdit())return;const d=document.getElementById("schemeEditor"),f=document.getElementById("schemeForm"),err=document.getElementById("schemeFormError");
   document.getElementById("schemeEditorX").onclick=()=>d.close();document.getElementById("schemeEditorCancel").onclick=()=>d.close();
  f.onsubmit=async e=>{
   e.preventDefault();err.hidden=true;
   const fd=new FormData(f),id=String(fd.get("id")||"");
   const choice=String(fd.get("scheme_target")||"all"),allowed=schemeGroups().some(g=>g.key===choice);
   if(!allowed){err.textContent="Выбранная сетка больше не существует.";err.hidden=false;return}
   const targetGrid=gridForEditor(choice),pool=marksForGrid(choice);
   if(!pool.length){err.textContent="Для выбранной сетки нет подходящих марок.";err.hidden=false;return}
   const m=pool.find(x=>x.id===String(fd.get("mark_id")||""));
   if(!m){err.textContent="Выберите доступную марку из ведомости.";err.hidden=false;return}
   try{rows=await schemeApi.list()}catch(error){err.textContent="Не удалось проверить остатки по схеме: "+String(error?.message||error);err.hidden=false;return}
   if(!markAvailable(m,id)){const quota=markPlacement(m);err.textContent="Марка "+(m.mark||m.title)+" полностью размещена: "+quota.placed+" из "+quota.total+" шт. Добавление невозможно.";err.hidden=false;return}
   const axisX=String(fd.get("axis_x")||targetGrid.axesX[0]),axisY=String(fd.get("axis_y")||targetGrid.axesY[0]),dx=num(fd.get("offset_x_mm")),dy=num(fd.get("offset_y_mm")),x=num(targetGrid.xPos.get(axisX))+dx,y=num(targetGrid.yPos.get(axisY))+dy;
   const kind=String(fd.get("geometry_type")||"column"),point=pointGeometry(kind),z0=num(fd.get("z0_mm")),z1=num(fd.get("z1_mm"));
   if(!id&&f.dataset.copyPosition==="1"&&guessGeometry(m)!==(kind==="bent"?"beam":kind)){
    err.textContent="Для копируемой позиции выберите марку соответствующего типа конструкции.";err.hidden=false;return
   }
   const endX=String(fd.get("end_axis_x")||targetGrid.axesX[0]),endY=String(fd.get("end_axis_y")||targetGrid.axesY[0]),endDx=num(fd.get("end_offset_x_mm")),endDy=num(fd.get("end_offset_y_mm")),x2=num(targetGrid.xPos.get(endX))+endDx,y2=num(targetGrid.yPos.get(endY))+endDy;
   const ridgeMode=fd.get("ridge_mode")==="manual"?"manual":"center",
    manualMidX=String(fd.get("mid_axis_x")||targetGrid.axesX[0]),
    manualMidY=String(fd.get("mid_axis_y")||targetGrid.axesY[0]),
    manualDx=num(fd.get("mid_offset_x_mm")),manualDy=num(fd.get("mid_offset_y_mm")),
    mx=ridgeMode==="center"?Math.round((x+x2)/2):num(targetGrid.xPos.get(manualMidX))+manualDx,
    my=ridgeMode==="center"?Math.round((y+y2)/2):num(targetGrid.yPos.get(manualMidY))+manualDy,
    midX=ridgeMode==="center"?closestAxis(mx,targetGrid.axesX,targetGrid.xPos):manualMidX,
    midY=ridgeMode==="center"?closestAxis(my,targetGrid.axesY,targetGrid.yPos):manualMidY,
    mdx=mx-num(targetGrid.xPos.get(midX)),mdy=my-num(targetGrid.yPos.get(midY)),
    mz=num(fd.get("mid_z_mm"));
   if(!targetGrid.axesX.includes(axisX)||!targetGrid.axesY.includes(axisY)||!point&&(!targetGrid.axesX.includes(endX)||!targetGrid.axesY.includes(endY))){err.textContent="Выберите существующие оси выбранной сетки.";err.hidden=false;return}
   if(kind==="bent"){
    if(guessGeometry(m)!=="beam"||!targetGrid.axesX.includes(midX)||!targetGrid.axesY.includes(midY)){err.textContent="Ломаная балка подходит только для балок, ригелей и прогонов. Проверьте оси конька.";err.hidden=false;return}
    if(!String(fd.get("mid_z_mm")||"").trim()||Math.hypot(mx-x,my-y,mz-z0)<1||Math.hypot(x2-mx,y2-my,z1-mz)<1){err.textContent="Нужны три различные точки и отметка Z конька.";err.hidden=false;return}
   }
   if(kind==="column"&&z1<=z0){err.textContent="У колонны верх должен быть выше низа.";err.hidden=false;return}
   if(!point&&Math.hypot(x2-x,y2-y,z1-z0)<1){err.textContent="Конечная точка должна отличаться от начальной.";err.hidden=false;return}
   if(!id&&f.dataset.copyPosition==="1"){
    const overlap=allRecords().some(row=>{
     const q=coord(row);if(q.geometryType!==kind)return false;
     const same=(a,b)=>Math.abs(a-b)<5;
     return same(q.x,x)&&same(q.y,y)&&same(q.z0,z0)&&
      (point||same(q.x2,x2)&&same(q.y2,y2))&&same(q.z2,z1)&&
      (kind!=="bent"||same(q.mx,mx)&&same(q.my,my)&&same(q.mz,mz))
    });
    if(overlap){err.textContent="Позиция полностью совпадает с размещённой конструкцией. Измените оси, смещение или отметки Z перед сохранением копии.";err.hidden=false;return}
   }
   const storedRow=id?records().find(x=>String(x.id)===id):null,status=String(fd.get("status")||storedRow?.status||"planned"),section_type=String(fd.get("section_type")||"ibeam"),profile_name=String(fd.get("profile_name")||"").trim(),rot=num(fd.get("rotation_deg"));
   const existing=id?records().find(r=>r.id===id):null,used=new Set(allRecords().map(r=>String(r.position||r.title||"")));
   let internalPosition=String(existing?.position||existing?.title||"");
   if(!internalPosition){let n=1;do{internalPosition="COL-"+String(n++).padStart(4,"0")}while(used.has(internalPosition))}
   const g=markGroup(m),oldRow=id?arr(rows).find(r=>String(r.id)===id):null,previous=oldRow?.data||{},view=targetGrid.view;
   const payload={record_type:"scheme_column",title:internalPosition,data:{...previous,entity_type:"column",position:internalPosition,mark_id:m.id,mark:m.mark||m.title||"",mark_name:m.name||"",work_type_id:m.work_type_id||"",axis_x:axisX,axis_y:axisY,offset_x_mm:dx,offset_y_mm:dy,absolute_x_mm:x,absolute_y_mm:y,geometry_type:kind,absolute_x2_mm:point?undefined:x2,absolute_y2_mm:point?undefined:y2,
   absolute_mid_x_mm:kind==="bent"?mx:undefined,absolute_mid_y_mm:kind==="bent"?my:undefined,mid_z_mm:kind==="bent"?mz:undefined,
   mid_axis_x:kind==="bent"?midX:undefined,mid_axis_y:kind==="bent"?midY:undefined,
   mid_offset_x_mm:kind==="bent"?mdx:undefined,mid_offset_y_mm:kind==="bent"?mdy:undefined,
   ridge_mode:kind==="bent"?ridgeMode:undefined,
   mid_anchor_member_id:kind==="bent"&&ridgeMode==="manual"?previous.mid_anchor_member_id:undefined,end_axis_x:point?undefined:endX,end_axis_y:point?undefined:endY,end_offset_x_mm:point?undefined:endDx,end_offset_y_mm:point?undefined:endDy,end_z_mm:point?undefined:z1,z0_mm:z0,z1_mm:z1,rotation_deg:rot,status,section_type,profile_name,scheme_group:g.key,scheme_group_label:g.label,scheme_view_id:view?.id||"all"}};
   try{
    const saved=id?await schemeApi.update(id,payload):await schemeApi.create(payload);
    const merged=rememberSavedSchemeRecord(saved);
    // Edited elevations must be read back from the authoritative saved record
    // before refreshing the in-place 3D renderer. Otherwise an older local
    // snapshot can remain on screen until the entire page is reloaded.
    if(id||!merged){
     try{
      const latest=await schemeApi.list();
      if(Array.isArray(latest))rows=latest;
      else if(!merged)throw Error("Список элементов не получен после сохранения.");
     }catch(refreshError){
      if(!merged)throw refreshError;
      console.warn("Монтажная схема: чтение сохранённых координат недоступно, используем подтверждённую запись.",refreshError);
     }
    }
    selectedId=String(saved?.id||id||"");d.close();
    journalAuto(saved?.id||id,id?"edited":"placed").then(r=>{if(r?.entry&&String(selectedId)===String(saved?.id||id))renderDetails()});
    refreshAfterMemberChange()
   }catch(error){err.textContent="Не удалось сохранить элемент: "+String(error?.message||error);err.hidden=false}
  }
 }

 function importDialogHtml(){
  return `<dialog id="schemeImportDialog" class="scheme-view-dialog scheme-import-dialog">
    <div class="scheme-editor-head"><div><h2>Импорт размещения из КМД (JSON)</h2><p>Проверка марок по ведомости текущего вида работ, без изменения существующих элементов.</p></div><button type="button" id="schemeImportClose">×</button></div>
    <label class="scheme-view-name">Файл примера JSON<input id="schemeImportFile" type="file" accept=".json,application/json"></label>
    <div class="scheme-import-result" id="schemeImportResult">Выберите файл размещения. Он будет сначала проверен без записи в базу данных.</div>
    <label class="scheme-import-consent"><input id="schemeImportConsent" type="checkbox"><span>Я понимаю, что черновые координаты и высоты требуют проверки по чертежам. Импортируемые элементы будут помечены «Не смонтирована».</span></label>
    <div class="scheme-form-error" id="schemeImportError" hidden></div>
    <div class="actions"><button type="button" id="schemeImportCancel">Отмена</button><button type="button" class="primary" id="schemeImportApply" disabled>Добавить проверенные совпадения марок</button></div>
   </dialog>`
 }
 function bindImportDialog(){
  if(!canEdit()||!activeWorkId)return;
  const dialog=document.getElementById("schemeImportDialog"),fileInput=document.getElementById("schemeImportFile"),message=document.getElementById("schemeImportResult"),consent=document.getElementById("schemeImportConsent"),apply=document.getElementById("schemeImportApply"),error=document.getElementById("schemeImportError");
  if(!dialog||!fileInput||!message||!consent||!apply||!error)return;
  let batch=[];
  const reportError=text=>{error.textContent=text;error.hidden=!text};
  const updateApply=()=>{apply.disabled=!batch.length||!consent.checked};
  const normalizedMark=v=>norm(v).replace(/\s+/g,"").replace(/^k(?=\d)/,"к").replace(/^b(?=\d)/,"в").replace(/^f(?=\d)/,"ф");
  const open=()=>{batch=[];fileInput.value="";consent.checked=false;message.textContent="Сначала выберите файл: данные не будут записаны до вашего подтверждения.";reportError("");updateApply();dialog.showModal()};
  document.getElementById("schemeImportOpen")?.addEventListener("click",open);
  document.getElementById("schemeImportCancel").onclick=()=>dialog.close();
  document.getElementById("schemeImportClose").onclick=()=>dialog.close();
  consent.onchange=updateApply;
  fileInput.onchange=async()=>{
   batch=[];consent.checked=false;updateApply();reportError("");
   const file=fileInput.files?.[0];if(!file)return;
   if(file.size>5*1024*1024){reportError("Слишком большой JSON-файл (максимум 5 МБ).");return}
   try{
    const info=JSON.parse(await file.text());
    if(info?.schema!=="ir-project-scheme-placements-v1"||!Array.isArray(info.placements)||info.placements.length>3000||!info.placements.length)throw Error("Неверный формат или отсутствуют элементы.");
    const scoped=workMarks(),candidates=new Map();
    for(const m of scoped){const k=normalizedMark(m.mark||m.title);if(k){if(!candidates.has(k))candidates.set(k,[]);candidates.get(k).push(m)}}
    const keys=new Set(),existing=workRecords(),unmatched=[],ambiguous=[],invalid=[],duplicates=[];
    for(const p of info.placements){
     const key=String(p?.source_key||"").trim(),mark=String(p?.mark||"").trim(),matches=candidates.get(normalizedMark(mark))||[],kind=String(p?.geometry_type||"column"),x=Number(p?.x_mm),y=Number(p?.y_mm),z0=Number(p?.z0_mm),z1=Number(p?.z1_mm),x2=Number(p?.x2_mm),y2=Number(p?.y2_mm);
     if(!key||keys.has(key)||!mark||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z0)||!Number.isFinite(z1)||x<0||x>spanX||y<0||y>spanY||Math.abs(z0)>100000||Math.abs(z1)>100000||!["column","beam","brace","truss"].includes(kind)||kind==="column"&&z1<=z0||kind!=="column"&&(!Number.isFinite(x2)||!Number.isFinite(y2)||Math.hypot(x2-x,y2-y,z1-z0)<1)){invalid.push(mark||key||"неизвестный");continue}
     keys.add(key);
     if(!matches.length){unmatched.push(mark);continue}
     if(matches.length>1){ambiguous.push(mark);continue}
     const m=matches[0];
     if(existing.some(r=>String(r.source_import_key||"")===key||String(r.mark_id||"")===String(m.id)&&Math.abs(worldPosition(r).x-x)<250&&Math.abs(worldPosition(r).y-y)<250&&Math.abs(num(r.z0_mm)-z0)<250)){duplicates.push(mark);continue}
     batch.push({m,p,key,kind,x,y,z0,z1,x2,y2})
    }
    const gridNote=(JSON.stringify(info.axes_x||[])!==JSON.stringify(axesX)||JSON.stringify(info.axes_y||[])!==JSON.stringify(axesY))?" Названия осей отличаются от активной сетки — применены абсолютные координаты в миллиметрах.":"";
    message.innerHTML=`<b>${esc(info.project||file.name)}</b><div>В файле: ${info.placements.length}; можно добавить: <strong>${batch.length}</strong>; уже размещены: ${duplicates.length}; не найдены в ведомости: ${unmatched.length}; неоднозначные марки: ${ambiguous.length}; ошибки: ${invalid.length}.</div><small>${esc(gridNote)}${unmatched.length?" Не найдены: "+esc([...new Set(unmatched)].slice(0,16).join(", ")):""}${ambiguous.length?" Неоднозначные: "+esc([...new Set(ambiguous)].slice(0,12).join(", ")):""}</small><p><b>Внимание:</b> координаты и отметки в демо-файле предварительные. Никакие существующие записи не изменяются.</p>`;
    updateApply()
   }catch(e){reportError("Не удалось прочитать пример: "+String(e?.message||e))}
  };
  apply.onclick=async()=>{
   if(!canEdit()||!batch.length||!consent.checked)return;
   apply.disabled=true;fileInput.disabled=true;reportError("");
   let created=0,failed=0;
   for(const item of batch){
    const {m,p,key,kind,x,y,z0,z1,x2,y2}=item;
    const ax=closestAxis(x,axesX,axisXPos),ay=closestAxis(y,axesY,axisYPos),g=markGroup(m);
    const position="COL-DEMO-"+key.replace(/[^a-z0-9_-]/gi,"").slice(0,48);
    const payload={record_type:"scheme_column",title:position,data:{entity_type:"column",position,mark_id:m.id,mark:m.mark||m.title||"",mark_name:m.name||"",work_type_id:activeWorkId,axis_x:ax,axis_y:ay,offset_x_mm:x-num(axisXPos.get(ax)),offset_y_mm:y-num(axisYPos.get(ay)),absolute_x_mm:x,absolute_y_mm:y,geometry_type:kind,absolute_x2_mm:kind==="column"?undefined:x2,absolute_y2_mm:kind==="column"?undefined:y2,end_z_mm:kind==="column"?undefined:z1,z0_mm:z0,z1_mm:z1,status:"planned",section_type:"ibeam",profile_name:"",scheme_group:g.key,scheme_group_label:g.label,source_import_key:key,source_import_doc:String(p.source_sheet||"КМД"),import_requires_verification:true,import_approximate:p.approximate===true}};
    try{await schemeApi.create(payload);created++}catch(e){failed++;console.error("Ошибка импорта КМД",key,e)}
   }
   fileInput.disabled=false;
   try{rows=await schemeApi.list()}catch(e){reportError("Элементы добавлены, но перечитать базу не удалось: "+String(e?.message||e));return}
   activeScheme="all";selectedId="";hiddenGroups.clear();hiddenSections.clear();confFilter="all";statusFilter="all";levelMin="";levelMax="";
   dialog.close();draw();
   alert(`Импорт чернового размещения завершён. Добавлено: ${created}. Ошибок: ${failed}. Проверьте координаты и высоты по КМД.`)
  };
 }
 function viewDialogHtml(){
  const types=availableGroups();
  return `<dialog id="schemeViewDialog" class="scheme-view-dialog"><form id="schemeViewForm" novalidate><input type="hidden" name="view_id">
  <div class="scheme-editor-head"><div><h2 id="schemeViewTitle">Добавить сетку</h2><p>Общая схема остаётся всегда. Выберите виды марок для дополнительной сетки.</p></div><button type="button" id="schemeViewClose">×</button></div>
  <label class="scheme-view-name">Название сетки<input type="text" name="view_name" maxlength="90" required placeholder="Например: Фахверк, стены А–Л"></label>
  <b class="scheme-view-types-title">Виды марок из ведомости</b>
  <div class="scheme-view-types">${types.map(t=>`<label><input type="checkbox" name="mark_group" value="${esc(t.key)}"><span><b>${esc(t.label)}</b><small>${t.count} марок</small></span></label>`).join("")||'<p>В ведомости нет подходящих марок.</p>'}</div>
  <p class="scheme-view-explain">Каждая сетка может иметь собственные оси и размеры. Все элементы дополнительно отображаются в Общей схеме.</p>
  <div id="schemeViewError" class="scheme-form-error" hidden></div>
  <div class="actions"><button type="button" id="schemeViewCancel">Отмена</button><button type="submit" class="primary">Сохранить сетку</button></div></form></dialog>`
 }
 function bindViewManager(){
  if(!canEdit())return;
  const dlg=document.getElementById("schemeViewDialog"),form=document.getElementById("schemeViewForm"),err=document.getElementById("schemeViewError");if(!dlg||!form)return;
  const open=(v=null)=>{form.reset();err.hidden=true;form.elements.view_id.value=v?.id||"";form.elements.view_name.value=v?.data?.name||v?.title||"";document.getElementById("schemeViewTitle").textContent=v?"Настроить сетку":"Добавить сетку";const keys=groupKeys(v);form.querySelectorAll('input[name="mark_group"]').forEach(el=>el.checked=keys.includes(el.value));dlg.showModal()};
  document.getElementById("schemeNewView")?.addEventListener("click",()=>open());
  document.getElementById("schemeEditView")?.addEventListener("click",()=>open(activeView()));
  document.getElementById("schemeViewCancel").onclick=()=>dlg.close();document.getElementById("schemeViewClose").onclick=()=>dlg.close();
  document.getElementById("schemeDeleteView")?.addEventListener("click",async()=>{const v=activeView();if(!v||!confirm(`Удалить сетку «${v.data?.name||v.title}»? Все элементы останутся на Общей схеме.`))return;try{await schemeApi.remove(v.id);rows=await schemeApi.list();activeScheme="all";selectedId="";refreshGridModel();draw()}catch(e){alert("Ошибка удаления сетки: "+String(e?.message||e))}});
  form.onsubmit=async e=>{e.preventDefault();err.hidden=true;const id=String(form.elements.view_id.value||""),name=String(form.elements.view_name.value||"").trim(),groups=[...form.querySelectorAll('input[name="mark_group"]:checked')].map(el=>el.value);
   if(!name||!groups.length){err.textContent="Введите название сетки и выберите минимум один вид марок.";err.hidden=false;return}
   if(customViews().some(v=>String(v.id)!==id&&norm(v.data?.name||v.title)===norm(name))){err.textContent="Такая сетка уже существует.";err.hidden=false;return}
   const old=customViews().find(v=>String(v.id)===id),data={...old?.data,entity_type:"scheme_view",work_type_id:activeWorkId,name,mark_groups:groups,grid:old?.data?.grid||JSON.parse(JSON.stringify(baseGrid()))};
   try{const saved=id?await schemeApi.update(id,{record_type:"scheme_view",title:name,data}):await schemeApi.create({record_type:"scheme_view",title:name,data});rows=await schemeApi.list();const v=customViews().find(v=>String(v.id)===String(saved?.id||id))||customViews().find(v=>v.data?.name===name);
    activeScheme=v?"view:"+v.id:"all";selectedId="";refreshGridModel();dlg.close();draw()
   }catch(e){err.textContent="Ошибка сохранения сетки: "+String(e?.message||e);err.hidden=false}
  }
 }

 function onSchemePreviewKeydown(event){
  if(event.key==="Escape"&&previewFullscreen){event.preventDefault();leaveSchemeFullscreen()}
 }
 function onSchemePreviewNativeChange(){
  if(previewFullscreen&&previewNativeFullscreen&&!document.fullscreenElement)leaveSchemeFullscreen()
 }
 function onSchemePreviewRouteChange(){
  if(previewFullscreen)leaveSchemeFullscreen(false)
 }
 function leaveSchemeFullscreen(redraw=true){
  if(!previewFullscreen)return;
  const wasNative=previewNativeFullscreen;
  previewFullscreen=false;previewNativeFullscreen=false;
  document.body.style.overflow=previewOriginalOverflow;
  document.removeEventListener("keydown",onSchemePreviewKeydown);
  document.removeEventListener("fullscreenchange",onSchemePreviewNativeChange);
  window.removeEventListener("hashchange",onSchemePreviewRouteChange);
  if(wasNative&&document.fullscreenElement&&typeof document.exitFullscreen==="function")Promise.resolve(document.exitFullscreen()).catch(()=>{});
  if(redraw)draw()
 }
 function enterSchemeFullscreen(){
  if(previewFullscreen)return;
  previewOriginalOverflow=document.body.style.overflow;
  previewFullscreen=true;document.body.style.overflow="hidden";
  document.addEventListener("keydown",onSchemePreviewKeydown);
  document.addEventListener("fullscreenchange",onSchemePreviewNativeChange);
  window.addEventListener("hashchange",onSchemePreviewRouteChange);
  draw();
  if(!document.fullscreenElement&&typeof document.documentElement?.requestFullscreen==="function"){
   let fullscreenPromise;try{fullscreenPromise=document.documentElement.requestFullscreen()}catch(e){fullscreenPromise=Promise.reject(e)}
   Promise.resolve(fullscreenPromise).then(()=>{
    if(previewFullscreen)previewNativeFullscreen=true;
    else if(document.fullscreenElement&&typeof document.exitFullscreen==="function")return document.exitFullscreen()
   }).catch(()=>{})
  }
 }
 let schemeSnapshot=null;
 const loadSnapshot=async()=>{try{schemeSnapshot=await irProject.ai?.invoke?.("ai-montage:scheme-snapshot",{objectId:oid})||null}catch(_error){schemeSnapshot=null}};
 async function clearScheme(){
  if(!canEdit())return;
  const total=allRecords().length;
  if(!confirm("Удалить все элементы монтажной схемы ("+total+")? Сетка осей останется. Копия сохранится — её можно вернуть кнопкой «Вернуть».")){restoreKeyboardAfterConfirm();return}
  restoreKeyboardAfterConfirm();
  try{
   const r=await irProject.ai.invoke("ai-montage:clear-scheme",{objectId:oid});
   schemeSnapshot=r.snapshot;rows=await schemeApi.list().catch(()=>[]);selectedId="";draw()
  }catch(error){alert("Не удалось очистить схему: "+String(error?.message||error).replace(/^Error invoking remote method '[^']+': (Error: )?/,""))}
 }
 async function restoreScheme(){
  if(!canEdit()||!schemeSnapshot)return;
  if(!confirm("Вернуть "+schemeSnapshot.count+" элементов, удалённых очисткой?")){restoreKeyboardAfterConfirm();return}
  restoreKeyboardAfterConfirm();
  try{
   const r=await irProject.ai.invoke("ai-montage:restore-scheme",{objectId:oid});
   schemeSnapshot=r.snapshot;rows=await schemeApi.list().catch(()=>rows);refreshGridModel();draw()
  }catch(error){alert("Не удалось вернуть схему: "+String(error?.message||error).replace(/^Error invoking remote method '[^']+': (Error: )?/,""))}
 }
 function draw(){
  if(activeScheme!=="all"&&!frameMode&&!activeView()){activeScheme="all";refreshGridModel()}
  if(selectedId&&!columns().some(c=>c.id===selectedId))selectedId="";
  const s=stats(),mp=statusCounts(),works=enabledWorks(),currentWork=works.find(w=>w.id===activeWorkId)||null,workOptions='<option value="__frame__" '+(frameMode?'selected':'')+'>Все виды работ вместе</option>'+works.map(w=>'<option value="'+esc(w.id)+'" '+(!frameMode&&w.id===activeWorkId?'selected':'')+'>'+esc(w.name)+(w.code?' · '+esc(w.code):'')+'</option>').join(""),groupOptions=schemeGroups().map(g=>`<option value="${esc(g.key)}" ${g.key===activeScheme?"selected":""}>${esc(g.label)} · ${g.marks} марок · ${g.placed} элементов</option>`).join(""),editActions=canEdit()?`<button type="button" class="scheme-grid-button" id="schemeGridConfig">⚙ Параметры сетки</button>${irProject.ai?.invoke?`<button type="button" class="scheme-grid-button danger" id="schemeClear" ${s.total?"":"disabled"} title="Удалить все элементы схемы; копия сохраняется">Очистить схему</button>${schemeSnapshot?`<button type="button" class="scheme-grid-button" id="schemeRestore" title="Вернуть элементы, удалённые очисткой ${esc(new Date(schemeSnapshot.at).toLocaleString("ru-RU"))}">↺ Вернуть (${schemeSnapshot.count})</button>`:""}`:""}${!frameMode&&activeWorkId?`<button type="button" class="scheme-grid-button" id="schemeNewView">＋ Добавить сетку</button>${activeView()?`<button type="button" class="scheme-grid-button" id="schemeEditView">Изменить</button><button type="button" class="scheme-grid-button danger" id="schemeDeleteView">Удалить сетку</button>`:""}`:""}`:"",emptyOverlay=activeWorkId?(s.total?"":`<div class="scheme-empty-overlay"><b>Схема пока пустая</b><span>Нажмите «Добавить элемент» и выберите марку для этой монтажной схемы${window.irAiRecognitionPage?" или загрузите чертежи в «ИИ-распознавание»":""}.</span></div>`):`<div class="scheme-empty-overlay"><b>Монтажная схема не включена</b><span>Откройте «Виды работ» и включите галочку «Нужна монтажная схема» у нужного вида работ.</span></div>`;
  app.innerHTML=`<div class="scheme-page">
   <div class="scheme-head"><button class="back" id="schemeBack">← Назад</button><div><h1>Монтажная схема</h1><p>${esc(object.name||"")}${frameMode?"":currentWork?` · ${esc(currentWork.name)}`:""} · ${esc(activeGroup().label)}</p></div><div class="scheme-head-actions">${window.irAiRecognitionPage?`<a class="scheme-grid-button scheme-ai-button" id="schemeAiRecognition" href="#/objects/object/${esc(oid)}/ai-recognition" title="Загрузить чертежи КМ / КМД / АР и расставить элементы на этой схеме">ИИ-распознавание</a>`:""}<label class="scheme-type-select-wrap work"><span>Режим / вид работ</span><select id="schemeWorkSelect" data-native-select="1">${workOptions}</select></label><label class="scheme-type-select-wrap"><span>Схема</span><select id="schemeTypeSelect" data-native-select="1" ${frameMode||activeWorkId?"":"disabled"}>${groupOptions}</select></label>${editActions}</div></div>
   <div class="scheme-summary">
    <div><span>Оси ${esc(axesX[0])}–${esc(axesX.at(-1))}</span><b>${fmt(spanX)} мм</b><small>${gridDirX==="ltr"?"Слева направо":"Справа налево"}: ${esc(axesX[0])} → ${esc(axesX.at(-1))} · ${gridXSpans.length} пролётов</small></div>
    <div><span>Оси ${esc(axesY[0])}–${esc(axesY.at(-1))}</span><b>${fmt(spanY)} мм</b><small>${gridDirY==="btt"?"Снизу вверх":"Сверху вниз"}: ${esc(axesY[0])} → ${esc(axesY.at(-1))} · ${gridYSpans.length} пролётов</small></div>
    <div><span>Размещено на схеме</span><b>${s.total}</b><small>${esc(activeGroup().label)} · ${activeMarks().length} позиций ведомости</small></div>
    <div><span>Готовность по ведомости</span><b>${mp.pct}%</b><small>${fmt(mp.mounted)} из ${fmt(mp.total)} шт. смонтировано</small></div>
   </div>
   <div class="scheme-mark-summary" aria-label="Состояние марок по ведомости">
    <div><span>Всего по ведомости</span><b>${fmt(mp.total)} <small>шт.</small></b></div>
    <div class="mounted"><span>Смонтировано</span><b>${fmt(mp.mounted)} <small>шт.</small></b></div>
    <div class="remaining"><span>Осталось</span><b>${fmt(mp.left)} <small>шт.</small></b></div>
    <div><span>На схеме</span><b>${mp.placed} <small>элем.</small></b><small>${mp.placedMounted} полностью смонтировано · ${mp.placedPartial} частично</small></div>
   </div>
   <div class="scheme-mark-sync-hint"><span>Статусы связаны с ведомостью марок и ежедневными отчётами. Частичное выполнение не определяет конкретную установленную конструкцию.</span><button type="button" id="schemeRefreshMarkProgress">↻ Обновить по ведомости</button></div>
   <div id="schemeMarkSyncNotice" class="scheme-mark-sync-result ${syncNotice?(syncNotice.ok?"success":"error"):""}" role="status" aria-live="polite" ${syncNotice?"":"hidden"}>${syncNotice?esc(syncNotice.text):""}</div>
   <section class="scheme-visibility" aria-label="Фильтры монтажной схемы">
    <div class="scheme-visibility-top">
     <details class="scheme-layers" ${layersPanelOpen?"open":""}><summary>Слои по видам марок <small>${allVisibleTypes().filter(g=>!hiddenGroups.has(g.key)).length} из ${allVisibleTypes().length}</small></summary>
      <div class="scheme-layer-panel">
       <div class="scheme-layer-header"><b>Показать конструкции</b><div><button type="button" id="schemeLayersShowAll">Все</button><button type="button" id="schemeLayersHideAll">Скрыть</button></div></div>
       <div class="scheme-layer-list">${allVisibleTypes().map(g=>`<button type="button" data-scheme-layer="${esc(g.key)}" class="${hiddenGroups.has(g.key)?"off":"on"}" aria-pressed="${!hiddenGroups.has(g.key)}" title="${esc(g.label)}">${esc(g.label)} <small>${g.count}</small></button>`).join("")}</div>
      </div>
     </details>
     <details class="scheme-plan-cuts"><summary>▤ Разрезы <small>${cutHidden.length?"Скрыто: "+cutHidden.length:"Все видны"}</small></summary><div class="scheme-plan-cut-list">${["X","Y"].map(axis=>`<b>${axis==="X"?"Цифровые оси":"Буквенные оси"}</b>`+cutBands().filter(b=>b.axis===axis).map(b=>`<label><input type="checkbox" data-plan-cut="${esc(b.id)}" ${cutHidden.includes(b.id)?"":"checked"}><span>${esc(b.label)}</span></label>`).join("")).join("")}<button type="button" id="schemePlanCutsReset">Все разрезы</button></div></details>
     <label>Статус<select id="schemeStatusFilter" data-native-select="1"><option value="all" ${statusFilter==="all"?"selected":""}>Все</option><option value="planned" ${statusFilter==="planned"?"selected":""}>Не смонтированы</option><option value="mounted" ${statusFilter==="mounted"?"selected":""}>Смонтированы</option><option value="partial" ${statusFilter==="partial"?"selected":""}>Частично</option></select></label>
     ${records().some(isPreliminary)?`<label title="Предварительно — экземпляры, определённые по чертежам не полностью (низ не найден, отметки по соседним, листы расходятся, нет в новом анализе). Они расставлены и показаны бледно; правьте их как обычно.">Достоверность<select id="schemeConfFilter" data-native-select="1"><option value="all" ${confFilter==="all"?"selected":""}>Все</option><option value="sure" ${confFilter==="sure"?"selected":""}>Определены полностью</option><option value="prelim" ${confFilter==="prelim"?"selected":""}>Только предварительные (${records().filter(isPreliminary).length})</option></select></label>`:""}
     ${sectionsPresent().length>1?`<div class="scheme-section-layers" role="group" aria-label="Разделы чертежей" title="Слои по разделам чертежей: откуда взят элемент">${sectionsPresent().map(([k,n])=>`<button type="button" data-scheme-section="${esc(k)}" class="${hiddenSections.has(k)?"off":"on"}" aria-pressed="${!hiddenSections.has(k)}">${esc(k)} <small>${n}</small></button>`).join("")}</div>`:""}
     <label>Отметка от, мм<input id="schemeLevelMin" type="number" step="100" placeholder="Любая" value="${esc(levelMin)}"></label>
     <label>До, мм<input id="schemeLevelMax" type="number" step="100" placeholder="Любая" value="${esc(levelMax)}"></label>
     <button id="schemeVisibilityReset" type="button">Сбросить фильтры</button>
     <span class="scheme-visible-counter">На экране: <b>${columns().length}</b> из ${s.total}</span>
    </div>
   </section>
   <div class="scheme-workspace">
    <section class="scheme-stage scheme-three-stage ${previewFullscreen?"scheme-preview-fullscreen":""}" id="schemePreviewStage" aria-label="Предпросмотр монтажной схемы" data-scheme-background="${currentBackground()}" data-scheme-contrast="${backgroundIsDark()?"dark":"light"}" style="--scheme-custom-background:${currentCustomBackground()}">
     <div class="scheme-stage-toolbar"><div class="scheme-preview-title"><b>Монтажная схема · ${esc(activeGroup().label)}</b><span>${s.total} элементов · 3D</span></div>
      <div class="scheme-toolbar-actions"><button type="button" id="schemeExportHtml" class="scheme-fullscreen-toggle" title="Выгрузить монтажную схему в HTML: 3D, фильтры, карточки элементов — без редактирования">⇩ HTML</button><button type="button" id="schemeFullscreenToggle" class="scheme-fullscreen-toggle" title="${previewFullscreen?"Закрыть полноэкранный просмотр":"Предпросмотр схемы на весь экран"}">${previewFullscreen?"✕ Закрыть":"⛶ На весь экран"}</button><label class="scheme-background-picker" title="Цвет фона поля монтажной схемы"><span>Фон</span><select id="schemeBackgroundSelect" data-native-select="1" aria-label="Цвет фона монтажной схемы"><option value="standard" ${currentBackground()==="standard"?"selected":""}>Стандартный</option><option value="white" ${currentBackground()==="white"?"selected":""}>Белый</option><option value="gray" ${currentBackground()==="gray"?"selected":""}>Серый</option><option value="blue" ${currentBackground()==="blue"?"selected":""}>Голубой</option><option value="sand" ${currentBackground()==="sand"?"selected":""}>Бежевый</option><option value="dark" ${currentBackground()==="dark"?"selected":""}>Тёмный</option><option value="custom" ${currentBackground()==="custom"?"selected":""}>Свой цвет</option></select><input id="schemeBackgroundCustom" type="color" aria-label="Выбрать свой цвет фона" value="${currentCustomBackground()}" ${currentBackground()==="custom"?"":"hidden"}></label><button type="button" id="schemeToggleLabels" class="${labelsVisible?"on":""}" title="Показать марки элементов">Подписи</button><button type="button" id="schemeToggleDimensions" class="${dimensionsVisible?"on":""}" title="Показать межосевые размеры сетки">Размеры</button></div>
     </div>
     <div class="scheme-canvas" id="schemeCanvas"></div>
     ${emptyOverlay}
    </section>
    <aside class="scheme-details" id="schemeDetails"></aside>
   </div>
   <div class="scheme-hint"><b>Сетка:</b><span><strong>${esc(axesX[0])} → ${esc(axesX.at(-1))}</strong> — ${gridDirX==="ltr"?"слева направо":"справа налево"}, <strong>${esc(axesY[0])} → ${esc(axesY.at(-1))}</strong> — ${gridDirY==="btt"?"снизу вверх":"сверху вниз"}. Направление можно изменить в «Параметрах сетки».</span></div>
   ${canEdit()?gridEditorHtml()+editorHtml()+viewDialogHtml():""}
  </div>`;
  document.getElementById("schemeBack").onclick=()=>location.hash=`/objects/object/${oid}`;document.getElementById("schemeAiRecognition")?.addEventListener("click",e=>{e.preventDefault();location.hash=`/objects/object/${oid}/ai-recognition`});document.getElementById("schemeWorkSelect")?.addEventListener("change",e=>{frameMode=e.target.value==="__frame__";if(!frameMode)activeWorkId=e.target.value;activeScheme="all";selectedId="";syncNotice=null;elementSearch="";pickerScrollTop=0;hiddenGroups.clear();hiddenSections.clear();confFilter="all";statusFilter="all";levelMin="";levelMax="";refreshGridModel();draw()});document.getElementById("schemeTypeSelect")?.addEventListener("change",e=>{activeScheme=e.target.value;selectedId="";syncNotice=null;elementSearch="";pickerScrollTop=0;refreshGridModel();draw()});
  document.querySelector(".scheme-layers")?.addEventListener("toggle",e=>{layersPanelOpen=e.target.open});
  document.querySelectorAll("[data-scheme-layer]").forEach(btn=>btn.addEventListener("click",()=>{layersPanelOpen=true;const key=btn.dataset.schemeLayer;if(hiddenGroups.has(key))hiddenGroups.delete(key);else hiddenGroups.add(key);updateLayerVisibility()}));
  document.getElementById("schemeLayersShowAll")?.addEventListener("click",()=>{layersPanelOpen=true;hiddenGroups.clear();updateLayerVisibility()});
  document.getElementById("schemeLayersHideAll")?.addEventListener("click",()=>{layersPanelOpen=true;allVisibleTypes().forEach(g=>hiddenGroups.add(g.key));updateLayerVisibility()});
  document.getElementById("schemeRefreshMarkProgress")?.addEventListener("click",refreshSchemeMarkProgress);
  document.getElementById("schemeStatusFilter")?.addEventListener("change",e=>{statusFilter=e.target.value;updateLayerVisibility()});
  document.getElementById("schemeConfFilter")?.addEventListener("change",e=>{confFilter=e.target.value;updateLayerVisibility()});
  document.querySelectorAll("[data-scheme-section]").forEach(btn=>btn.addEventListener("click",()=>{const key=btn.dataset.schemeSection;if(hiddenSections.has(key))hiddenSections.delete(key);else hiddenSections.add(key);updateLayerVisibility()}));
  document.getElementById("schemeLevelMin")?.addEventListener("change",e=>{levelMin=e.target.value;updateLayerVisibility()});
  document.getElementById("schemeLevelMax")?.addEventListener("change",e=>{levelMax=e.target.value;updateLayerVisibility()});
  document.getElementById("schemeVisibilityReset")?.addEventListener("click",()=>{hiddenGroups.clear();hiddenSections.clear();confFilter="all";statusFilter="all";levelMin="";levelMax="";cutHidden=[];try{localStorage.setItem("ir-project-3d-sections."+oid,"[]")}catch(_error){}updateLayerVisibility()});

  document.querySelectorAll("[data-plan-cut]").forEach(input=>input.addEventListener("change",()=>{
   const id=input.dataset.planCut;
   cutHidden=input.checked?cutHidden.filter(x=>x!==id):[...new Set([...cutHidden,id])];
   try{localStorage.setItem("ir-project-3d-sections."+oid,JSON.stringify(cutHidden))}catch(_error){}
   renderScene()
  }));
  document.getElementById("schemePlanCutsReset")?.addEventListener("click",()=>{
   cutHidden=[];document.querySelectorAll("[data-plan-cut]").forEach(input=>input.checked=true);
   try{localStorage.setItem("ir-project-3d-sections."+oid,"[]")}catch(_error){}
   renderScene()
  });
  document.getElementById("schemeExportHtml")?.addEventListener("click",e=>exportSchemeHtml(e.currentTarget));
  document.getElementById("schemeFullscreenToggle")?.addEventListener("click",()=>previewFullscreen?leaveSchemeFullscreen():enterSchemeFullscreen());
  document.getElementById("schemeBackgroundSelect")?.addEventListener("change",e=>applySchemeBackground(e.target.value));
  document.getElementById("schemeBackgroundCustom")?.addEventListener("input",e=>applySchemeBackground("custom",e.target.value));
  document.getElementById("schemeBackgroundCustom")?.addEventListener("change",e=>applySchemeBackground("custom",e.target.value));
  // Annotation switches only update the existing 3D model; WebGL is not recreated.
  const updateAnnotations=()=>{
   document.getElementById("schemeToggleLabels")?.classList.toggle("on",labelsVisible);
   document.getElementById("schemeToggleDimensions")?.classList.toggle("on",dimensionsVisible);
   renderScene()
  };
  document.getElementById("schemeToggleLabels")?.addEventListener("click",()=>{labelsVisible=!labelsVisible;updateAnnotations()});
  document.getElementById("schemeToggleDimensions")?.addEventListener("click",()=>{dimensionsVisible=!dimensionsVisible;updateAnnotations()});
  document.getElementById("schemeClear")?.addEventListener("click",clearScheme);
  document.getElementById("schemeRestore")?.addEventListener("click",restoreScheme);
  renderScene();renderDetails();bindGridEditor();bindEditor();bindViewManager()
 }
 await loadSnapshot();
 // A work type renamed in another tab («Виды работ») or made by a placement: its name here too, without reopening.
 const pageSerial=window.__irSchemePageSerial=(window.__irSchemePageSerial||0)+1;
 window.irWorkTypesSync?.watch(oid,()=>pageSerial===window.__irSchemePageSerial&&location.hash===requestedRoute,async()=>{
  workRows=await root.section("work-types").list().catch(()=>workRows);
  if(pageSerial===window.__irSchemePageSerial&&location.hash===requestedRoute)try{draw()}catch(error){console.error("Монтажная схема: виды работ",error)}
 });
 draw();
 }catch(error){loading.fail(error)}
};