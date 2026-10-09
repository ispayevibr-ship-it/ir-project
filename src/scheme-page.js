"use strict";
window.irSchemePage=async function(objectId){
 const oid=String(objectId||"");if(!oid)return;
 const app=document.getElementById("app"),root=irProject.data.forObject(oid),schemeApi=root.section("scheme"),object=await irProject.data.objects.get(oid);
 if(!object){location.hash="/objects";return}
 const canEdit=()=>window.irAccess?window.irAccess.canEdit("scheme"):false;
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const fmt=v=>Number(num(v).toFixed(1)).toLocaleString("ru-RU",{maximumFractionDigits:1});
 const defaultAxesX=["1","2","3","4","5","6"],defaultAxesY=["А","Б","В","Г","Д","Е","Ж","И","К","Л"],defaultSpanX=45000,defaultSpanY=60000;
 let axesX=[...defaultAxesX],axesY=[...defaultAxesY],targetSpanX=defaultSpanX,targetSpanY=defaultSpanY,gridDirX="ltr",gridDirY="btt";
 let mode="3d",yaw=-34,viewRotation=0,zoom=1,panX=0,panY=0,selectedId="",activeWorkId="",activeScheme="all",rows=[],markRows=[],workRows=[],gridXSpans=[],gridYSpans=[],spanX=targetSpanX,spanY=targetSpanY,axisXPos=new Map(),axisYPos=new Map(),labelsVisible=false,dimensionsVisible=false,hiddenGroups=new Set(),statusFilter="all",levelMin="",levelMax="",layersPanelOpen=false,elementSearch="",pickerScrollTop=0,previewFullscreen=false,previewNativeFullscreen=false,previewOriginalOverflow="";
 const backgroundChoices=["standard","white","gray","blue","sand","dark","custom"],backgroundStorageKey="ir-project.scheme-background."+oid;
 let schemeBackground="standard",schemeCustomBackground="#e9f2ff";
 const isHexColor=v=>/^#[\da-f]{6}$/i.test(String(v||""));
 try{
  const stored=JSON.parse(window.localStorage?.getItem(backgroundStorageKey)||"null");
  if(stored&&backgroundChoices.includes(stored.mode))schemeBackground=stored.mode;
  if(stored&&isHexColor(stored.color))schemeCustomBackground=stored.color.toLowerCase()
 }catch(e){}
 const backgroundIsDark=()=>schemeBackground==="dark"||schemeBackground==="custom"&&(()=>{
  const hex=schemeCustomBackground;const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return(r*299+g*587+b*114)/1000<155
 })();
 function applySchemeBackground(mode=schemeBackground,color=schemeCustomBackground){
  if(!backgroundChoices.includes(mode))mode="standard";
  if(isHexColor(color))schemeCustomBackground=color.toLowerCase();
  schemeBackground=mode;
  const stage=document.getElementById("schemePreviewStage");
  if(stage){
   stage.dataset.schemeBackground=schemeBackground;
   stage.dataset.schemeContrast=backgroundIsDark()?"dark":"light";
   stage.style.setProperty("--scheme-custom-background",schemeCustomBackground)
  }
  const select=document.getElementById("schemeBackgroundSelect");
  if(select)select.value=schemeBackground;
  const custom=document.getElementById("schemeBackgroundCustom");
  if(custom){custom.value=schemeCustomBackground;custom.hidden=schemeBackground!=="custom"}
  try{window.localStorage?.setItem(backgroundStorageKey,JSON.stringify({mode:schemeBackground,color:schemeCustomBackground}))}catch(e){}
 }
 [rows,markRows,workRows]=await Promise.all([schemeApi.list().catch(()=>[]),root.section("marks").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);
 const equalSpans=(total,count)=>{count=Math.max(1,count);const base=Math.floor(total/count),rem=Math.round(total-base*count);return Array.from({length:count},(_,i)=>base+(i<rem?1:0))};
 const validAxes=v=>Array.isArray(v)&&v.length>=2&&v.every(x=>String(x||"").trim());
 const validSpans=(v,count,total)=>Array.isArray(v)&&v.length===count&&v.every(x=>num(x)>0)&&Math.abs(v.reduce((s,x)=>s+num(x),0)-total)<.11;
 const gridRecord=()=>arr(rows).find(r=>r.record_type==="scheme_grid"||r.data?.entity_type==="grid")||null;
 const customViews=()=>arr(rows).filter(r=>(r.record_type==="scheme_view"||r.data?.entity_type==="scheme_view")&&String(r.data?.work_type_id||"")===activeWorkId);
 const activeView=()=>customViews().find(r=>"view:"+r.id===activeScheme)||null;
 const baseGrid=()=>gridRecord()?.data||{};
 const activeGrid=()=>activeView()?.data?.grid||baseGrid();
 const groupKeys=v=>arr(v?.data?.mark_groups).map(String);
 const availableGroups=()=>{const map=new Map();for(const m of workMarks()){const g=markGroup(m),x=map.get(g.key)||{...g,count:0};x.count++;map.set(g.key,x)}return [...map.values()].sort((a,b)=>a.label.localeCompare(b.label,"ru"))};
 const gridCoords=(g,key)=>{const x=key==="x",axes=validAxes(g[x?"axes_x":"axes_y"])?g[x?"axes_x":"axes_y"]:(x?defaultAxesX:defaultAxesY),total=num(g[x?"span_x_mm":"span_y_mm"])||(x?defaultSpanX:defaultSpanY),spans=validSpans(g[x?"x_spans_mm":"y_spans_mm"],axes.length-1,total)?g[x?"x_spans_mm":"y_spans_mm"]:equalSpans(total,axes.length-1);return cumulative(axes,spans)};
 const worldPosition=c=>{if(c.absolute_x_mm!==undefined&&c.absolute_y_mm!==undefined&&Number.isFinite(Number(c.absolute_x_mm))&&Number.isFinite(Number(c.absolute_y_mm)))return{x:Number(c.absolute_x_mm),y:Number(c.absolute_y_mm)};const bx=gridCoords(baseGrid(),"x"),by=gridCoords(baseGrid(),"y");return{x:num(bx.get(String(c.axis_x)))+num(c.offset_x_mm),y:num(by.get(String(c.axis_y)))+num(c.offset_y_mm)}};
 const cumulative=(axes,spans)=>{let at=0;return new Map(axes.map((axis,i)=>{const here=at;if(i<spans.length)at+=num(spans[i]);return[axis,here]}))};
 const refreshGridModel=()=>{const g=activeGrid();axesX=validAxes(g.axes_x)?g.axes_x.map(x=>String(x).trim()):[...defaultAxesX];axesY=validAxes(g.axes_y)?g.axes_y.map(x=>String(x).trim()):[...defaultAxesY];gridDirX=g.x_direction==="rtl"?"rtl":"ltr";gridDirY=g.y_direction==="ttb"?"ttb":"btt";targetSpanX=num(g.span_x_mm)>0?num(g.span_x_mm):defaultSpanX;targetSpanY=num(g.span_y_mm)>0?num(g.span_y_mm):defaultSpanY;const gx=validSpans(g.x_spans_mm,axesX.length-1,targetSpanX)?g.x_spans_mm.map(num):equalSpans(targetSpanX,axesX.length-1),gy=validSpans(g.y_spans_mm,axesY.length-1,targetSpanY)?g.y_spans_mm.map(num):equalSpans(targetSpanY,axesY.length-1);gridXSpans=gx;gridYSpans=gy;spanX=gx.reduce((s,x)=>s+x,0);spanY=gy.reduce((s,x)=>s+x,0);axisXPos=cumulative(axesX,gx);axisYPos=cumulative(axesY,gy)};
 const workById=new Map(arr(workRows).map(r=>[String(r.id),r.data||{}]));
 const marks=arr(markRows).map(r=>({id:String(r.id),title:r.title||"",...(r.data||{})}));
 const norm=s=>String(s||"").trim().toLowerCase().replace(/ё/g,"е");
 const enabledWorks=()=>arr(workRows).filter(r=>r.data?.scheme_enabled===true).map(r=>({id:String(r.id),name:r.data?.work_type||r.title||"Без названия",code:r.data?.project_code||"",data:r.data||{}}));
 const schemeGroupOf=(name,mark="")=>{const s=norm(name);if(s.includes("фахвер"))return{key:"fahwerk",label:"Фахверк"};if(s.includes("колон"))return{key:"columns",label:"Колонны"};if(s.includes("связ"))return{key:"ties",label:"Связи"};if(s.includes("прогон"))return{key:"purlins",label:"Прогоны"};if(s.includes("балк"))return{key:"beams",label:"Балки"};if(s.includes("ферм"))return{key:"trusses",label:"Фермы"};if(s.includes("ригел"))return{key:"girders",label:"Ригели"};if(s.includes("огражд"))return{key:"guards",label:"Ограждения"};if(s.includes("лестн"))return{key:"stairs",label:"Лестницы"};if(s.includes("площад"))return{key:"platforms",label:"Площадки"};if(s.includes("стойк"))return{key:"posts",label:"Стойки"};const raw=String(name||mark||"Прочие марки").trim()||"Прочие марки",key="name:"+norm(raw).replace(/[^a-zа-я0-9]+/gi,"-").replace(/^-|-$/g,"");return{key,label:raw}};
 const markGroup=m=>schemeGroupOf(m?.name,m?.mark||m?.title);
 const markLabel=m=>{const w=workById.get(String(m.work_type_id||""))||{},name=m.name||"",wt=w.work_type||m.work_type||"";return [m.mark||m.title||"Без марки",name||wt].filter(Boolean).join(" · ")};

 const markById=new Map(marks.map(m=>[m.id,m]));
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
   const audit=await window.irSyncMountedFromReports(oid);
   const fresh=await root.section("marks").list();
   const updated=arr(fresh).map(x=>({id:String(x.id),title:x.title||"",...(x.data||{})}));
   markRows=fresh;marks.splice(0,marks.length,...updated);
   markById.clear();marks.forEach(x=>markById.set(x.id,x));
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
 const linkedMark=r=>{
  const id=String(r.mark_id||""),byId=markById.get(id);
  if(byId&&String(byId.work_type_id||"")===recordWorkId(r))return byId;
  const candidates=marks.filter(m=>String(m.work_type_id||"")===recordWorkId(r)&&norm(m.mark||m.title)===norm(r.mark));
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
 const allRecords=()=>arr(rows).filter(r=>r.record_type==="scheme_column"||r.data?.entity_type==="column").map(r=>({id:String(r.id),title:r.title||"",...(r.data||{})}));
 const recordWorkId=r=>{const direct=String(r?.work_type_id||"");if(direct)return direct;const byId=marks.find(m=>String(m.id)===String(r?.mark_id||""));if(byId?.work_type_id)return String(byId.work_type_id);const snap=norm(r?.mark),matches=marks.filter(m=>norm(m.mark||m.title)===snap);return matches.length===1?String(matches[0].work_type_id||""):""};
 const workMarks=()=>activeWorkId?marks.filter(m=>String(m.work_type_id||"")===activeWorkId):[];
 const workRecords=()=>activeWorkId?allRecords().filter(r=>recordWorkId(r)===activeWorkId):[];
 const recordGroup=r=>r?.scheme_group&&String(r.scheme_group)!=="all"?{key:String(r.scheme_group),label:String(r.scheme_group_label||schemeGroupOf(r.mark_name,r.mark).label)}:schemeGroupOf(r?.mark_name,r?.mark);
 const recordMarkGroup=r=>{const m=marks.find(x=>x.id===String(r.mark_id||""));return m?markGroup(m):recordGroup(r)};
 const inView=(r,v)=>groupKeys(v).includes(recordMarkGroup(r).key);
 const schemeGroups=()=>{const scoped=workMarks(),placed=workRecords();return[{key:"all",label:"Общая схема",marks:scoped.length,placed:placed.length},...customViews().map(v=>({key:"view:"+v.id,label:v.data?.name||v.title||"Новая сетка",marks:scoped.filter(m=>groupKeys(v).includes(markGroup(m).key)).length,placed:placed.filter(r=>inView(r,v)).length}))]};
 const records=()=>{const v=activeView();return activeScheme==="all"?workRecords():v?workRecords().filter(r=>inView(r,v)):[]};
 const activeGroup=()=>schemeGroups().find(g=>g.key===activeScheme)||schemeGroups()[0];
 const activeMarks=()=>{const scoped=workMarks(),v=activeView();return activeScheme==="all"?scoped:v?scoped.filter(m=>groupKeys(v).includes(markGroup(m).key)):[]};
 if(!activeWorkId)activeWorkId=enabledWorks()[0]?.id||"";
 refreshGridModel();
 const guessGeometry=m=>{const key=markGroup(m).key;if(["columns","fahwerk","posts"].includes(key))return"column";if(key==="ties")return"brace";if(key==="trusses")return"truss";return"beam"};
 const geometry=c=>["column","beam","brace","truss"].includes(c.geometry_type)?c.geometry_type:c.absolute_x2_mm!==undefined&&c.absolute_y2_mm!==undefined?guessGeometry(c):"column";
 const closestAxis=(value,axes,pos)=>axes.reduce((best,a)=>Math.abs(num(pos.get(a))-value)<Math.abs(num(pos.get(best))-value)?a:best,axes[0]||"");
 const coord=c=>{const p=worldPosition(c),v=activeView(),own=v&&String(c.scheme_view_id||"")===String(v.id),axisX=own&&axesX.includes(String(c.axis_x))?String(c.axis_x):closestAxis(p.x,axesX,axisXPos),axisY=own&&axesY.includes(String(c.axis_y))?String(c.axis_y):closestAxis(p.y,axesY,axisYPos),dx=p.x-num(axisXPos.get(axisX)),dy=p.y-num(axisYPos.get(axisY)),x2=c.absolute_x2_mm!==undefined?num(c.absolute_x2_mm):p.x,y2=c.absolute_y2_mm!==undefined?num(c.absolute_y2_mm):p.y,z0=num(c.z0_mm),z1=num(c.z1_mm??8400),kind=geometry(c);return{x:p.x,y:p.y,x2,y2,z0,z1,z2:kind==="column"?z1:num(c.end_z_mm??c.z1_mm??8400),axisX,axisY,dx,dy,geometryType:kind}};
 const allVisibleTypes=()=>availableGroups().filter(g=>activeScheme==="all"||groupKeys(activeView()).includes(g.key));
 const isShown=c=>{if(hiddenGroups.has(recordMarkGroup(c).key))return false;if(statusFilter!=="all"&&effectiveStatus(c)!==statusFilter)return false;const start=num(c.z0_mm),end=num(c.end_z_mm??c.z1_mm??8400),lo=Math.min(start,end),hi=Math.max(start,end),min=String(levelMin).trim()===""?null:Number(levelMin),max=String(levelMax).trim()===""?null:Number(levelMax);if(min!==null&&Number.isFinite(min)&&hi<min)return false;if(max!==null&&Number.isFinite(max)&&lo>max)return false;return true};
 const columns=()=>records().filter(isShown).map(c=>({...c,...coord(c),status:effectiveStatus(c)}));
 const selected=()=>columns().find(x=>x.id===selectedId)||null;
 const resolveSavedMarkId=c=>{const pool=activeMarks();if(!c)return String(pool[0]?.id||"");const direct=pool.find(m=>m.id===String(c.mark_id||""));if(direct)return direct.id;const snap=String(c.mark||"").trim().toLowerCase(),snapName=String(c.mark_name||"").trim().toLowerCase();const exact=snap&&pool.find(m=>String(m.mark||m.title||"").trim().toLowerCase()===snap);if(exact)return exact.id;const byName=snapName&&pool.find(m=>String(m.name||"").trim().toLowerCase()===snapName);return byName?.id||""};
 const searchMarks=query=>{const pool=activeMarks(),q=String(query||"").trim().toLowerCase();if(!q)return [...pool];return pool.map(m=>{const mark=String(m.mark||m.title||"").trim().toLowerCase(),name=String(m.name||"").trim().toLowerCase(),text=`${mark} ${name}`;let score=99;if(mark===q)score=0;else if(mark.startsWith(q))score=1;else if(mark.includes(q))score=2;else if(name.startsWith(q))score=3;else if(name.includes(q)||text.includes(q))score=4;return{m,score}}).filter(x=>x.score<99).sort((a,b)=>a.score-b.score||String(a.m.mark||a.m.title||"").localeCompare(String(b.m.mark||b.m.title||""),"ru",{numeric:true,sensitivity:"base"})).map(x=>x.m)};
 const markOptions=(selectedMark,query="",unresolved=false)=>{const q=String(query||"").trim(),visible=searchMarks(q),hasSelected=visible.some(m=>m.id===String(selectedMark));let prefix="";if(unresolved&&!q)prefix='<option value="" selected>Марка не найдена — выберите заново</option>';else if(q&&!hasSelected)prefix='<option value="" selected>Выберите из найденных марок</option>';if(!visible.length)return'<option value="" selected>Ничего не найдено</option>';return prefix+visible.map(m=>`<option value="${esc(m.id)}" ${hasSelected&&String(selectedMark)===m.id?"selected":""}>${esc(markLabel(m))}</option>`).join("")};
 const axisOptions=(items,value)=>items.map(x=>`<option value="${esc(x)}" ${String(value)===x?"selected":""}>${esc(x)}</option>`).join("");
 const statusText=s=>s==="mounted"?"Смонтирована":s==="partial"?"Частично смонтирована":"Не смонтирована";
 const sectionType=c=>{const explicit=String(c?.section_type||"").trim().toLowerCase();if(["ibeam","square","round","box"].includes(explicit))return explicit;const s=`${c?.profile_name||""} ${c?.mark_name||""}`.toLowerCase();if(/круг|труб.*ø|труб.*ф|ø|⌀/.test(s))return"round";if(/квад|проф.*труб|\d+\s*[xх×]\s*\d+/.test(s))return"square";if(/короб|сварн.*короб/.test(s))return"box";return"ibeam"};
 const sectionTypeLabel=t=>({ibeam:"Двутавр",square:"Квадратная труба",round:"Круглая труба",box:"Короб / сплошное"}[t]||"Двутавр");
 const profileText=c=>String(c?.profile_name||"").trim()||sectionTypeLabel(sectionType(c));
 const sectionOptions=value=>[["ibeam","Двутавр"],["square","Квадратная труба"],["round","Круглая труба"],["box","Короб / сплошное"]].map(([v,n])=>`<option value="${v}" ${value===v?"selected":""}>${n}</option>`).join("");
 const geometryLabel=kind=>({column:"Колонна / стойка",beam:"Балка / прогон / ригель",brace:"Связь / раскос",truss:"Ферма"}[kind]||"Колонна / стойка");
 const geometryOptions=kind=>[["column","Колонна / стойка"],["beam","Балка / прогон / ригель"],["brace","Связь / раскос"],["truss","Ферма"]].map(([k,label])=>`<option value="${k}" ${k===kind?"selected":""}>${label}</option>`).join("");
 const spanSummary=spans=>{const min=Math.min(...spans),max=Math.max(...spans),avg=spans.reduce((s,x)=>s+x,0)/Math.max(1,spans.length);return max-min<=1?`≈ по ${fmt(avg)} мм`:"индивидуальные размеры"};
 const pairLabel=(items,i)=>`${items[i]}–${items[i+1]}`;
 function stats(){
  const cols=records(),mounted=cols.filter(x=>effectiveStatus(x)==="mounted").length,partial=cols.filter(x=>effectiveStatus(x)==="partial").length;
  return{total:cols.length,mounted,partial,left:cols.length-mounted-partial,pct:cols.length?Math.round(mounted/cols.length*100):0}
 }
 function projection(cols){
  const W=1040,H=650,padX=105,padY=90,a=(yaw+viewRotation)*Math.PI/180,maxZ=Math.max(9,...cols.map(c=>Math.max(c.z0,c.z1)/1000));
  const raw=(xmm,ymm,zmm)=>{const xd=gridDirX==="rtl"?spanX-xmm:xmm,yd=gridDirY==="btt"?spanY-ymm:ymm,x=(xd-spanX/2)/1000,y=(yd-spanY/2)/1000,z=zmm/1000,rx=x*Math.cos(a)-y*Math.sin(a),ry=x*Math.sin(a)+y*Math.cos(a);return{x:rx,y:ry*.48-z}};
  const samples=[],margin=12000;
  for(const x of [-margin,spanX+margin])for(const y of [-margin,spanY+margin]){samples.push(raw(x,y,0));samples.push(raw(x,y,maxZ*1000))}
  for(const c of cols){samples.push(raw(c.x,c.y,c.z0));samples.push(raw(c.x2,c.y2,c.z2))}
  const minX=Math.min(...samples.map(p=>p.x)),maxX=Math.max(...samples.map(p=>p.x)),minY=Math.min(...samples.map(p=>p.y)),maxY=Math.max(...samples.map(p=>p.y));
  const scale=Math.min((W-padX*2)/Math.max(1,maxX-minX),(H-padY*2)/Math.max(1,maxY-minY));
  const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  return(x,y,z)=>{const p=raw(x,y,z);return{x:W/2+(p.x-cx)*scale,y:H/2+(p.y-cy)*scale}}
 }
 const line=(a,b,cls)=>`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="${cls}"/>`;
 function axisText(c){
  const x=c.dx?`${c.axisX} ${c.dx>=0?"+":"−"} ${fmt(Math.abs(c.dx))} мм`:c.axisX,y=c.dy?`${c.axisY} ${c.dy>=0?"+":"−"} ${fmt(Math.abs(c.dy))} мм`:c.axisY;
  return{x,y}
 }
 function offsetText(c){
  const parts=[],xn=`${axesX[0]}–${axesX.at(-1)}`,yn=`${axesY[0]}–${axesY.at(-1)}`;if(c.dx)parts.push(`по ${xn}: ${c.dx>=0?"+":"−"}${fmt(Math.abs(c.dx))} мм`);if(c.dy)parts.push(`по ${yn}: ${c.dy>=0?"+":"−"}${fmt(Math.abs(c.dy))} мм`);return parts.join(" · ")
 }
 function columnTitle(c){
  const a=axisText(c),mark=c.mark||"—",name=c.mark_name||"",kind=c.geometryType||geometry(c),progress=markProgress(linkedMark(c));
  return `${mark}${name?" · "+name:""}\nТип: ${geometryLabel(kind)}\nПрофиль: ${profileText(c)}${progress?.total>0?"\nПо ведомости: "+fmt(progress.mounted)+" из "+fmt(progress.total)+" смонтировано · осталось "+fmt(progress.left):""}\nОси: ${a.x} / ${a.y}\nНачало: X ${fmt(c.x)} · Y ${fmt(c.y)} · Z ${fmt(c.z0)} мм\nКонец: X ${fmt(c.x2)} · Y ${fmt(c.y2)} · Z ${fmt(c.z2)} мм${c.dx||c.dy?"\nСмещение: "+offsetText(c):""}`
 }
 function placeSchemeLabel(px,py,lw,lh,index,occupied,W,H,preferBelow=false){
  const gap=9,side=index%2?-1:1,clamp=(v,min,max)=>Math.max(min,Math.min(max,v)),hits=r=>occupied.some(o=>!(r.x+r.w+4<o.x||r.x>o.x+o.w+4||r.y+r.h+4<o.y||r.y>o.y+o.h+4));
  const raw=[
   {x:px+(side>0?gap:-lw-gap),y:preferBelow?py+gap:py-lh-gap},
   {x:px+(side<0?gap:-lw-gap),y:preferBelow?py+gap:py-lh-gap},
   {x:px-lw/2,y:py-lh-13},
   {x:px-lw/2,y:py+13},
   {x:px+(side>0?gap:-lw-gap),y:py-lh/2},
   {x:px+(side<0?gap:-lw-gap),y:py-lh/2}
  ];
  for(const d of [24,44,64]){raw.push({x:px+(side>0?gap:-lw-gap),y:py-lh-d},{x:px+(side<0?gap:-lw-gap),y:py-lh-d},{x:px+(side>0?gap:-lw-gap),y:py+d},{x:px+(side<0?gap:-lw-gap),y:py+d})}
  let best=null;
  for(const q of raw){const r={x:clamp(q.x,6,W-lw-6),y:clamp(q.y,6,H-lh-6),w:lw,h:lh};if(!hits(r)){best=r;break}}
  if(!best){let row=0;do{const y=clamp(8+row*(lh+5),6,H-lh-6),x=clamp(px-lw/2+(row%2?lw+8:-lw-8),6,W-lw-6),r={x,y,w:lw,h:lh};if(!hits(r)){best=r;break}row++}while(row<20)}
  best=best||{x:clamp(px+gap,6,W-lw-6),y:clamp(py-lh-gap,6,H-lh-6),w:lw,h:lh};occupied.push(best);
  const ax=px<best.x?best.x:px>best.x+lw?best.x+lw:px,ay=py<best.y?best.y:py>best.y+lh?best.y+lh:py;
  return{lx:best.x,ly:best.y,anchorX:ax,anchorY:ay}
 }
 function svgBubble(x,y,label,cls="scheme-axis-bubble"){
  return `<g class="${cls}"><circle cx="${x}" cy="${y}" r="10"/><text x="${x}" y="${y+3.4}">${esc(label)}</text></g>`
 }
 function grid3d(cols){
  const p=projection(cols);let out="",xName=`${axesX[0]}–${axesX.at(-1)}`,yName=`${axesY[0]}–${axesY.at(-1)}`;
  const c1=p(0,0,0),c2=p(spanX,0,0),c3=p(spanX,spanY,0),c4=p(0,spanY,0);
  out+=`<polygon points="${c1.x},${c1.y} ${c2.x},${c2.y} ${c3.x},${c3.y} ${c4.x},${c4.y}" class="scheme-grid-floor3d"/>`;
  out+=line(c1,c2,"scheme-grid-outline")+line(c2,c3,"scheme-grid-outline")+line(c3,c4,"scheme-grid-outline")+line(c4,c1,"scheme-grid-outline");
  for(const axis of axesX){const x=axisXPos.get(axis),a=p(x,0,0),b=p(x,spanY,0),la=p(x,-4200,0),lb=p(x,spanY+4200,0);out+=line(a,b,"scheme-grid-line")+svgBubble(la.x,la.y,axis,"scheme-axis-bubble3d")+svgBubble(lb.x,lb.y,axis,"scheme-axis-bubble3d")}
  for(const axis of axesY){const y=axisYPos.get(axis),a=p(0,y,0),b=p(spanX,y,0),la=p(-4200,y,0),lb=p(spanX+4200,y,0);out+=line(a,b,"scheme-grid-line")+svgBubble(la.x,la.y,axis,"scheme-axis-bubble3d")+svgBubble(lb.x,lb.y,axis,"scheme-axis-bubble3d")}
  if(dimensionsVisible){
   gridXSpans.forEach((dist,i)=>{const x1=axisXPos.get(axesX[i]),x2=axisXPos.get(axesX[i+1]),m=p((x1+x2)/2,-7600,0);out+=`<text x="${m.x}" y="${m.y}" class="scheme-3d-span-text">${fmt(dist)} мм</text>`});
   gridYSpans.forEach((dist,i)=>{const y1=axisYPos.get(axesY[i]),y2=axisYPos.get(axesY[i+1]),m=p(-7600,(y1+y2)/2,0);out+=`<text x="${m.x}" y="${m.y}" class="scheme-3d-span-text">${fmt(dist)} мм</text>`})
  }
  const d1=p(spanX/2,-10800,0),d2=p(-10800,spanY/2,0);
  out+=`<g class="scheme-3d-dim"><rect x="${d1.x-50}" y="${d1.y-11}" width="100" height="20" rx="5"/><text x="${d1.x}" y="${d1.y+3}">${esc(xName)}: ${fmt(spanX)} мм</text></g>`;
  out+=`<g class="scheme-3d-dim"><rect x="${d2.x-50}" y="${d2.y-11}" width="100" height="20" rx="5"/><text x="${d2.x}" y="${d2.y+3}">${esc(yName)}: ${fmt(spanY)} мм</text></g>`;
  return{html:out,p}
 }
 function column3dShape(c,base,top,compact=1){
  const t=sectionType(c),dx=top.x-base.x,dy=top.y-base.y,len=Math.max(1,Math.hypot(dx,dy)),nx=-dy/len,ny=dx/len,pt=(p,off)=>({x:p.x+nx*off*compact,y:p.y+ny*off*compact}),poly=(a,b,c1,d,cls)=>`<polygon points="${a.x},${a.y} ${b.x},${b.y} ${c1.x},${c1.y} ${d.x},${d.y}" class="${cls}"/>`;
  const plate=[pt(base,-6),pt(base,6),{x:pt(base,6).x+4*compact,y:pt(base,6).y+2*compact},{x:pt(base,-6).x+4*compact,y:pt(base,-6).y+2*compact}];
  let out=`<polygon points="${plate.map(q=>`${q.x},${q.y}`).join(" ")}" class="scheme-base-plate"/>`;
  if(t==="round"){
   out+=`<line x1="${base.x}" y1="${base.y}" x2="${top.x}" y2="${top.y}" class="scheme-round-column"/><ellipse cx="${top.x}" cy="${top.y}" rx="${4.2*compact}" ry="${2.2*compact}" class="scheme-section-cap"/>`;return out
  }
  if(t==="square"){
   out+=poly(pt(base,-4.5),pt(base,4.5),pt(top,4.5),pt(top,-4.5),"scheme-square-column");
   out+=poly(pt(base,-2.2),pt(base,2.2),pt(top,2.2),pt(top,-2.2),"scheme-square-inner");return out
  }
  if(t==="box"){
   out+=poly(pt(base,-4),pt(base,4),pt(top,4),pt(top,-4),"scheme-box-column");
   out+=`<line x1="${pt(base,-4).x}" y1="${pt(base,-4).y}" x2="${pt(top,-4).x}" y2="${pt(top,-4).y}" class="scheme-section-edge"/><line x1="${pt(base,4).x}" y1="${pt(base,4).y}" x2="${pt(top,4).x}" y2="${pt(top,4).y}" class="scheme-section-edge"/>`;return out
  }
  out+=poly(pt(base,-1.4),pt(base,1.4),pt(top,1.4),pt(top,-1.4),"scheme-ibeam-web");
  out+=`<line x1="${pt(base,-4.8).x}" y1="${pt(base,-4.8).y}" x2="${pt(top,-4.8).x}" y2="${pt(top,-4.8).y}" class="scheme-ibeam-flange"/><line x1="${pt(base,4.8).x}" y1="${pt(base,4.8).y}" x2="${pt(top,4.8).x}" y2="${pt(top,4.8).y}" class="scheme-ibeam-flange"/><line x1="${pt(top,-5.7).x}" y1="${pt(top,-5.7).y}" x2="${pt(top,5.7).x}" y2="${pt(top,5.7).y}" class="scheme-ibeam-cap"/>`;
  return out
 }
 function member3dShape(c,base,top,compact=1){
  const kind=c.geometryType;
  if(kind==="column")return column3dShape(c,base,top,compact);
  const dx=top.x-base.x,dy=top.y-base.y,len=Math.max(1,Math.hypot(dx,dy)),nx=-dy/len,ny=dx/len,point=(t,o=0)=>({x:base.x+dx*t+nx*o,y:base.y+dy*t+ny*o}),segment=(q,r,cls)=>line(q,r,cls);
  if(kind==="truss"){
   const a=point(0,-5),b=point(1,-5),c1=point(0,5),d=point(1,5),n=Math.max(2,Math.min(12,Math.ceil(len/45)));
   let out=segment(a,b,"scheme-truss-chord")+segment(c1,d,"scheme-truss-chord");
   for(let i=0;i<n;i++)out+=segment(point(i/n,-5),point((i+1)/n,i%2?-5:5),"scheme-truss-web");
   return out
  }
  if(kind==="brace")return segment(base,top,"scheme-brace-main")+segment(point(0,-2),point(1,-2),"scheme-brace-detail");
  const thickness=Math.min(7,Math.max(2.5,len*.03)),points=[point(0,-thickness),point(0,thickness),point(1,thickness),point(1,-thickness)];
  return `<polygon points="${points.map(q=>`${q.x},${q.y}`).join(" ")}" class="scheme-beam-body"/>${segment(point(0,0),point(1,0),"scheme-beam-axis")}`
 }
 function prism(c,p,index,labelBoxes,compact=1){
  const kind=c.geometryType,base=p(c.x,c.y,c.z0),top=p(c.x2,c.y2,c.z2),isSelected=c.id===selectedId,sel=isSelected?" selected":"",status=c.status==="mounted"?" mounted":c.status==="partial"?" partial":" planned",between=c.dx||c.dy?" between":"";
  const baseAxis=p(axisXPos.get(c.axisX),axisYPos.get(c.axisY),c.z0),showOffset=!!(c.dx||c.dy)&&dimensionsVisible&&isSelected,showLabel=isSelected||(labelsVisible&&index<Math.max(24,zoom>1.8?70:36));
  const anchor=kind==="column"?top:{x:(base.x+top.x)/2,y:(base.y+top.y)/2};
  const label=String(c.mark||"—"),lw=Math.max(28,Math.min(64,14+label.length*6.2)),lh=20,placed=showLabel?placeSchemeLabel(anchor.x,anchor.y,lw,lh,index,labelBoxes||[],1040,650,anchor.y<150):null,lx=placed?.lx||0,ly=placed?.ly||0,anchorX=placed?.anchorX||anchor.x,anchorY=placed?.anchorY||anchor.y;
  const offsetMid={x:(base.x+baseAxis.x)/2,y:(base.y+baseAxis.y)/2};
  return`<g class="scheme-column scheme-geometry-${kind} section-${sectionType(c)}${status}${sel}${between}" data-column="${esc(c.id)}" tabindex="0" style="--scheme-3d-stroke:${Math.max(.55,3.3*compact).toFixed(2)}px;--scheme-3d-cap:${Math.max(.5,2.2*compact).toFixed(2)}px;--scheme-3d-round:${Math.max(.8,7*compact).toFixed(2)}px;--scheme-hit-stroke:${Math.max(2,14*compact).toFixed(2)}px">
   <title>${esc(columnTitle(c))}</title>
   <line x1="${base.x}" y1="${base.y}" x2="${top.x}" y2="${top.y}" class="scheme-column-hit-line"/>
   ${showOffset?`<line x1="${baseAxis.x}" y1="${baseAxis.y}" x2="${base.x}" y2="${base.y}" class="scheme-offset-line"/><text x="${offsetMid.x}" y="${offsetMid.y-7}" class="scheme-offset-text">${esc(offsetText(c))}</text>`:""}
   ${member3dShape(c,base,top,compact)}
   ${showLabel?`<line x1="${anchor.x}" y1="${anchor.y}" x2="${anchorX}" y2="${anchorY}" class="scheme-label-leader"/><g class="scheme-column-label compact${isSelected?" selected-label":""}"><rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="5"/><text x="${lx+7}" y="${ly+13.5}" class="scheme-label-position">${esc(label)}</text></g>`:""}
  </g>`
 }
 function planSectionSymbol(c,x,y,radius=6){
  const t=sectionType(c),rot=num(c.rotation_deg)+viewRotation,factor=radius/6,stroke=Math.min(2.2,Math.max(.45,radius*.31)),tr=`translate(${x} ${y}) rotate(${rot}) scale(${factor.toFixed(4)})`,style=` style="--scheme-symbol-stroke:${stroke.toFixed(2)}px"`;
  if(t==="round")return`<g transform="${tr}" class="scheme-plan-section"${style}><circle r="6" class="scheme-plan-section-outer"/><circle r="3.4" class="scheme-plan-section-inner"/></g>`;
  if(t==="square")return`<g transform="${tr}" class="scheme-plan-section"${style}><rect x="-6" y="-6" width="12" height="12" rx="1" class="scheme-plan-section-outer"/><rect x="-3.5" y="-3.5" width="7" height="7" rx=".7" class="scheme-plan-section-inner"/></g>`;
  if(t==="box")return`<g transform="${tr}" class="scheme-plan-section"${style}><rect x="-5.5" y="-5.5" width="11" height="11" rx="1" class="scheme-plan-box"/></g>`;
  return`<g transform="${tr}" class="scheme-plan-section"${style}><path d="M-6 -5V5 M6 -5V5 M-6 0H6" class="scheme-plan-ibeam"/><circle r="1.8" class="scheme-plan-dot"/></g>`
 }
 function planSvg(cols){
  const W=1040,H=650,padX=190,padY=98,r=((viewRotation%360)+360)%360,xName=`${axesX[0]}–${axesX.at(-1)}`,yName=`${axesY[0]}–${axesY.at(-1)}`;
  const rot90=r===90||r===270,totalW=rot90?spanY:spanX,totalH=rot90?spanX:spanY,availW=W-padX*2,availH=H-padY*2,scale=Math.min(availW/Math.max(1,totalW),availH/Math.max(1,totalH)),gridW=totalW*scale,gridH=totalH*scale,left=(W-gridW)/2,gridTop=(H-gridH)/2;
  const p=(x,y)=>{const bx=gridDirX==="rtl"?spanX-x:x,by=gridDirY==="btt"?spanY-y:y;let u=bx,v=by;if(r===90){u=spanY-by;v=bx}else if(r===180){u=spanX-bx;v=spanY-by}else if(r===270){u=by;v=spanX-bx}return{x:left+u*scale,y:gridTop+v*scale}};
  const extend=(a,b,d)=>{const dx=b.x-a.x,dy=b.y-a.y,l=Math.max(1,Math.hypot(dx,dy)),ux=dx/l,uy=dy/l;return[{x:a.x-ux*d,y:a.y-uy*d},{x:b.x+ux*d,y:b.y+uy*d}]};
  const outward=(q,d)=>{const dx=q.x-W/2,dy=q.y-H/2,l=Math.max(1,Math.hypot(dx,dy));return{x:q.x+dx/l*d,y:q.y+dy/l*d}};
  const corners=[p(0,0),p(spanX,0),p(spanX,spanY),p(0,spanY)],poly=corners.map(q=>`${q.x},${q.y}`).join(" ");
  let grid=`<polygon points="${poly}" class="scheme-grid-floor-plan"/><polygon points="${poly}" class="scheme-grid-outline-plan"/>`;
  axesX.forEach(axis=>{const x=axisXPos.get(axis),a=p(x,0),b=p(x,spanY),[la,lb]=extend(a,b,20);grid+=`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="scheme-grid-line"/>${svgBubble(la.x,la.y,axis)}${svgBubble(lb.x,lb.y,axis)}`});
  axesY.forEach(axis=>{const y=axisYPos.get(axis),a=p(0,y),b=p(spanX,y),[la,lb]=extend(a,b,20);grid+=`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="scheme-grid-line"/>${svgBubble(la.x,la.y,axis)}${svgBubble(lb.x,lb.y,axis)}`});
  if(dimensionsVisible){
   const drawSpan=(q1,q2,dist)=>{
    const horizontal=Math.abs(q2.x-q1.x)>=Math.abs(q2.y-q1.y);
    if(horizontal){
     const y=gridTop+gridH+42,x1=q1.x,x2=q2.x,mx=(x1+x2)/2;
     grid+=`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="scheme-span-line"/><line x1="${x1}" y1="${y-4}" x2="${x1}" y2="${y+4}" class="scheme-span-tick"/><line x1="${x2}" y1="${y-4}" x2="${x2}" y2="${y+4}" class="scheme-span-tick"/><text x="${mx}" y="${y+13}" class="scheme-span-text">${fmt(dist)} мм</text>`
    }else{
     const x=left-38,y1=q1.y,y2=q2.y,my=(y1+y2)/2,tx=x-12;
     grid+=`<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" class="scheme-span-line"/><line x1="${x-4}" y1="${y1}" x2="${x+4}" y2="${y1}" class="scheme-span-tick"/><line x1="${x-4}" y1="${y2}" x2="${x+4}" y2="${y2}" class="scheme-span-tick"/><text x="${tx}" y="${my}" class="scheme-span-text" transform="rotate(-90 ${tx} ${my})">${fmt(dist)} мм</text>`
    }
   };
   gridXSpans.forEach((dist,i)=>drawSpan(p(axisXPos.get(axesX[i]),0),p(axisXPos.get(axesX[i+1]),0),dist));
   gridYSpans.forEach((dist,i)=>drawSpan(p(0,axisYPos.get(axesY[i])),p(0,axisYPos.get(axesY[i+1])),dist))
  }
  const horizName=rot90?yName:xName,horizSize=rot90?spanY:spanX,vertName=rot90?xName:yName,vertSize=rot90?spanX:spanY,totalY=gridTop+gridH+(dimensionsVisible?72:52),totalX=left+gridW+(dimensionsVisible?66:54);
  grid+=`<line x1="${left}" y1="${totalY}" x2="${left+gridW}" y2="${totalY}" class="scheme-dim-line"/><line x1="${left}" y1="${totalY-5}" x2="${left}" y2="${totalY+5}" class="scheme-dim-line"/><line x1="${left+gridW}" y1="${totalY-5}" x2="${left+gridW}" y2="${totalY+5}" class="scheme-dim-line"/><text x="${W/2}" y="${totalY+17}" class="scheme-dim-text">${esc(horizName)} = ${fmt(horizSize)} мм</text>`;
  grid+=`<line x1="${totalX}" y1="${gridTop}" x2="${totalX}" y2="${gridTop+gridH}" class="scheme-dim-line"/><line x1="${totalX-5}" y1="${gridTop}" x2="${totalX+5}" y2="${gridTop}" class="scheme-dim-line"/><line x1="${totalX-5}" y1="${gridTop+gridH}" x2="${totalX+5}" y2="${gridTop+gridH}" class="scheme-dim-line"/><text x="${totalX+18}" y="${H/2}" class="scheme-dim-text" transform="rotate(-90 ${totalX+18} ${H/2})">${esc(vertName)} = ${fmt(vertSize)} мм</text>`;
  const projectedColumns=cols.filter(c=>c.geometryType==="column").map(c=>({id:c.id,at:p(c.x,c.y)}));
  const nearestPlanDistance=(id,at)=>{let nearest=Infinity;for(const other of projectedColumns){if(other.id===id)continue;const d=Math.hypot(other.at.x-at.x,other.at.y-at.y);if(d>.01&&d<nearest)nearest=d}return nearest};
  let columnsSvg="",labelBoxes=[];
  cols.forEach((c,index)=>{
   const q=p(c.x,c.y),end=p(c.x2,c.y2),isColumn=c.geometryType==="column",center=isColumn?q:{x:(q.x+end.x)/2,y:(q.y+end.y)/2},axis=p(axisXPos.get(c.axisX),axisYPos.get(c.axisY)),x=center.x,y=center.y,axisX=axis.x,axisY=axis.y,isSelected=c.id===selectedId,sel=isSelected?" selected":"",status=c.status==="mounted"?" mounted":c.status==="partial"?" partial":" planned",between=c.dx||c.dy?" between":"",showLabel=isSelected||(labelsVisible&&index<Math.max(24,zoom>1.8?70:36)),label=String(c.mark||"—"),lw=Math.max(28,Math.min(64,14+label.length*6.2)),lh=20,placed=showLabel?placeSchemeLabel(x,y,lw,lh,index,labelBoxes,W,H,y<gridTop+70):null,lx=placed?.lx||0,ly=placed?.ly||0,anchorX=placed?.anchorX||x,anchorY=placed?.anchorY||y;
   const showOffset=!!(c.dx||c.dy)&&dimensionsVisible&&isSelected,midX=(q.x+axisX)/2,midY=(q.y+axisY)/2,kind=c.geometryType;
   const nearest=isColumn?nearestPlanDistance(c.id,q):Infinity,symbolRadius=isColumn?Math.max(.8,Math.min(6,650*scale,(nearest-3.5)/2)):6,hitRadius=isColumn?Math.max(1.5,Math.min(10,nearest*.42)):10;
   const symbol=isColumn?planSectionSymbol(c,q.x,q.y,symbolRadius):kind==="truss"?`${line(q,end,"scheme-plan-member")}${line({x:q.x,y:q.y+3},{x:end.x,y:end.y+3},"scheme-plan-truss")}`:line(q,end,kind==="brace"?"scheme-plan-brace":"scheme-plan-member");
   columnsSvg+=`<g class="scheme-column scheme-geometry-${kind}${status}${sel}${between}" data-column="${esc(c.id)}" tabindex="0"><title>${esc(columnTitle(c))}</title><circle cx="${q.x}" cy="${q.y}" r="${hitRadius}" class="scheme-column-hit"/>${isColumn?"":`<line x1="${q.x}" y1="${q.y}" x2="${end.x}" y2="${end.y}" class="scheme-column-hit-line"/>`}${showOffset?`<line x1="${axisX}" y1="${axisY}" x2="${q.x}" y2="${q.y}" class="scheme-offset-line"/><circle cx="${axisX}" cy="${axisY}" r="3" class="scheme-offset-origin"/><text x="${midX}" y="${midY-7}" class="scheme-offset-text">${esc(offsetText(c))}</text>`:""}${symbol}${showLabel?`<line x1="${x}" y1="${y}" x2="${anchorX}" y2="${anchorY}" class="scheme-label-leader"/><g class="scheme-column-label compact${isSelected?" selected-label":""}"><rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="5"/><text x="${lx+7}" y="${ly+13.5}" class="scheme-label-position">${esc(label)}</text></g>`:""}</g>`;

  });
  return`<g class="scheme-grid-layer">${grid}</g><g class="scheme-column-layer">${columnsSvg}</g>`
 }
 function zoomTransform(){return `translate(${520+panX} ${325+panY}) scale(${zoom}) translate(-520 -325)`}
 function setZoom(next,resetPan=false){
  zoom=Math.max(.6,Math.min(3,Math.round(next*100)/100));if(resetPan){panX=0;panY=0}renderScene();const z=document.getElementById("schemeZoomValue");if(z)z.textContent=`${Math.round(zoom*100)}%`
 }
 function bindScenePanZoom(box){
  const svg=box.querySelector("svg"),layer=box.querySelector("#schemeZoomLayer");if(!svg||!layer)return;
  let dragging=false,lastX=0,lastY=0,startX=0,startY=0,moved=false;
  svg.onpointerdown=e=>{if(e.button!==0||e.target.closest?.("[data-column]"))return;dragging=true;moved=false;startX=lastX=e.clientX;startY=lastY=e.clientY;svg.classList.add("dragging");svg.setPointerCapture?.(e.pointerId);e.preventDefault()};
  svg.onpointermove=e=>{if(!dragging)return;if(Math.hypot(e.clientX-startX,e.clientY-startY)>4)moved=true;const rect=svg.getBoundingClientRect(),sx=1040/Math.max(1,rect.width),sy=650/Math.max(1,rect.height);if(moved){panX+=(e.clientX-lastX)*sx;panY+=(e.clientY-lastY)*sy;layer.setAttribute("transform",zoomTransform())}lastX=e.clientX;lastY=e.clientY};
  const stop=(e,clearOnClick=false)=>{if(!dragging)return;const wasMoved=moved;dragging=false;svg.classList.remove("dragging");try{svg.releasePointerCapture?.(e.pointerId)}catch{};if(clearOnClick&&!wasMoved&&selectedId){selectedId="";renderScene();renderDetails()}};
  svg.onpointerup=e=>stop(e,true);svg.onpointercancel=e=>stop(e,false);svg.onpointerleave=e=>{if(dragging&&e.buttons===0)stop(e,false)};
  svg.onwheel=e=>{if(!e.ctrlKey)return;e.preventDefault();setZoom(zoom+(e.deltaY<0?.15:-.15))};
 }
 function renderScene(){
  const box=document.getElementById("schemeCanvas");if(!box)return;const cols=columns(),xName=`${axesX[0]}–${axesX.at(-1)}`,yName=`${axesY[0]}–${axesY.at(-1)}`,meta=`<div class="scheme-grid-meta"><b>${fmt(spanX)} × ${fmt(spanY)} мм</b><span>${esc(xName)}: ${axesX.length} осей</span><span>${esc(yName)}: ${axesY.length} осей</span><small>Поворот ${viewRotation}° · Ctrl + колесо — масштаб · перетащить — перемещение · клик по пустому месту — снять выбор</small></div>`;
  if(mode==="3d"){const g=grid3d(cols),points=cols.filter(c=>c.geometryType==="column").map(c=>({id:c.id,p:g.p(c.x,c.y,0)}));const compactFor=c=>{if(c.geometryType!=="column")return 1;const point=g.p(c.x,c.y,0);let nearest=Infinity;for(const other of points){if(other.id===c.id)continue;const d=Math.hypot(point.x-other.p.x,point.y-other.p.y);if(d>.01&&d<nearest)nearest=d}return Math.max(.12,Math.min(1,(nearest-2.6)/14))};box.innerHTML=`${meta}<svg viewBox="0 0 1040 650" aria-label="3D монтажная схема"><g id="schemeZoomLayer" transform="${zoomTransform()}"><g class="scheme-grid-layer">${g.html}</g><g class="scheme-column-layer">${(()=>{const labelBoxes=[];return cols.map((c,i)=>prism(c,g.p,i,labelBoxes,compactFor(c))).join("")})()}</g></g></svg>`}
  else box.innerHTML=`${meta}<svg viewBox="0 0 1040 650" aria-label="План монтажной схемы"><g id="schemeZoomLayer" transform="${zoomTransform()}">${planSvg(cols)}</g></svg>`;
  box.querySelectorAll("[data-column]").forEach(el=>{const pick=()=>{selectedId=el.dataset.column;renderScene();renderDetails()};el.onclick=pick;el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pick()}}});
  bindScenePanZoom(box)
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
  if(entry&&!isShown(entry)){hiddenGroups.delete(recordMarkGroup(entry).key);statusFilter="all";levelMin="";levelMax="";draw();return}
  renderScene();renderDetails()
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
 function renderDetails(){
  const panel=document.getElementById("schemeDetails");if(!panel)return;const c=selected();
  if(!c){panel.innerHTML=pickerHtml()+`<div class="scheme-detail-empty"><b>Элемент не выбран</b><span>Нажмите на элемент на схеме или добавьте новый.</span>${canEdit()?'<button type="button" data-scheme-add>＋ Добавить элемент</button>':""}</div>`;panel.querySelector("[data-scheme-add]")?.addEventListener("click",()=>openEditor());bindElementPicker(panel);return}
  const a=axisText(c),between=c.dx||c.dy,progress=markProgress(linkedMark(c));
  panel.innerHTML=pickerHtml()+`${c.import_requires_verification?`<div class="scheme-import-review-warning">Черновое размещение по КМД · координаты и отметки требуют проверки${c.source_import_doc?" · "+esc(c.source_import_doc):""}</div>`:""}<div class="scheme-detail-title"><span>Выбранный элемент</span><b>${esc(c.mark||"—")}</b>${c.mark_name?`<small>${esc(c.mark_name)}</small>`:""}</div>
   <div class="scheme-detail-grid">
    <div><span>Наименование</span><b>${esc(c.mark_name||"—")}</b></div>
    <div><span>Тип элемента</span><b>${esc(geometryLabel(c.geometryType))}</b></div><div><span>Сечение</span><b>${esc(sectionTypeLabel(sectionType(c)))}</b></div>
    <div><span>Профиль</span><b>${esc(profileText(c))}</b></div>
    <div><span>${progress?.total>0?"Статус по ведомости":"Статус (ручной)"}</span><b class="${c.status==="mounted"?"ok":c.status==="partial"?"partial":"wait"}">${statusText(c.status)}</b></div>
    <div><span>Ось ${esc(axesX[0])}–${esc(axesX.at(-1))}</span><b>${esc(a.x)}</b></div>
    <div><span>Ось ${esc(axesY[0])}–${esc(axesY.at(-1))}</span><b>${esc(a.y)}</b></div>
    <div><span>Коорд. X</span><b>${fmt(c.x)} мм</b></div>
    <div><span>Коорд. Y</span><b>${fmt(c.y)} мм</b></div>
    <div><span>Низ</span><b>${fmt(c.z0)} мм</b></div>
    <div><span>Верх / конец Z</span><b>${fmt(c.z2)} мм</b></div>${c.geometryType!=="column"?`<div><span>Конец X</span><b>${fmt(c.x2)} мм</b></div><div><span>Конец Y</span><b>${fmt(c.y2)} мм</b></div>`:""}
   </div>
   ${progress?.total>0?`<div class="scheme-mark-progress">
    <b>Марка ${esc(c.mark)} · данные из ведомости</b>
    <div><span>Всего <strong>${fmt(progress.total)} шт.</strong></span><span>Смонтировано <strong>${fmt(progress.mounted)} шт.</strong></span><span>Осталось <strong>${fmt(progress.left)} шт.</strong></span></div>
    <div class="scheme-mark-progress-bar"><i style="width:${Math.max(0,Math.min(100,progress.mounted/progress.total*100))}%"></i></div>
    ${progress.state==="partial"?'<small>Ведомость показывает частичное выполнение марки, но не указывает, какой именно экземпляр смонтирован.</small>':""}
   </div>`:""}
   ${between?`<div class="scheme-between"><b>Элемент между осями</b><span>${esc(a.x)} / ${esc(a.y)}</span><small>Положение вычисляется от выбранных базовых осей и сохраняется точно в миллиметрах.</small></div>`:""}
   ${canEdit()?`<div class="scheme-detail-actions"><button type="button" data-scheme-edit>Редактировать</button><button type="button" data-scheme-copy>⧉ Копировать</button><button type="button" class="danger" data-scheme-delete>Удалить</button></div>`:""}`;
  panel.querySelector("[data-scheme-edit]")?.addEventListener("click",()=>openEditor(c));
  panel.querySelector("[data-scheme-copy]")?.addEventListener("click",()=>openEditor(c,true));
  panel.querySelector("[data-scheme-delete]")?.addEventListener("click",async()=>{if(!confirm(`Удалить элемент ${c.mark?`«${c.mark}» `:""}со схемы?`))return;await schemeApi.remove(c.id);rows=await schemeApi.list().catch(()=>rows);selectedId="";draw()});bindElementPicker(panel)
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
   const view=activeView();try{
    if(view)await schemeApi.update(view.id,{record_type:"scheme_view",title:view.data?.name||view.title||"Монтажная сетка",data:{...view.data,grid:nextGrid}});
    else{
     for(const row of arr(rows).filter(r=>r.record_type==="scheme_column"||r.data?.entity_type==="column")){
      const d0=row.data||{},nx=mapX.get(String(d0.axis_x||""))||String(d0.axis_x||""),ny=mapY.get(String(d0.axis_y||""))||String(d0.axis_y||"");
      if(nx!==String(d0.axis_x||"")||ny!==String(d0.axis_y||""))await schemeApi.update(row.id,{record_type:row.record_type||"scheme_column",title:row.title||d0.position||"Колонна",data:{...d0,axis_x:nx,axis_y:ny}})
     }
     const existing=gridRecord(),payload={record_type:"scheme_grid",title:"Сетка осей",data:{entity_type:"grid",...nextGrid}};
     if(existing)await schemeApi.update(existing.id,payload);else await schemeApi.create(payload);
    }
    rows=await schemeApi.list();refreshGridModel();d.close();gridDraft=null;draw()
   }catch(error){showGridError("Не удалось сохранить сетку: "+String(error?.message||error))}
  }
 }
 function editorHtml(){
  return`<dialog id="schemeEditor" class="scheme-editor"><form id="schemeForm" novalidate><input type="hidden" name="id"><div class="scheme-editor-head"><div><h2 id="schemeEditorTitle">Добавить элемент</h2><p>Выберите марку для текущей монтажной схемы и задайте положение относительно осей.</p></div><button type="button" id="schemeEditorX">×</button></div>
   <div class="scheme-form-grid">
    <label class="wide scheme-mark-field">Марка из ведомости<div class="scheme-mark-search"><input id="schemeMarkSearch" type="search" autocomplete="off" placeholder="Поиск по марке или наименованию…"><span id="schemeMarkCount"></span></div><select name="mark_id" ${activeMarks().length?"required":"disabled"}>${markOptions("")}</select></label>
    <label>Статус монтажа<select name="status"><option value="planned">Не смонтирована</option><option value="partial">Частично</option><option value="mounted">Смонтирована</option></select></label><div class="scheme-editor-mount-info wide" id="schemeEditorMountInfo"></div>
    <label>Геометрия элемента<select name="geometry_type" id="schemeGeometryType">${geometryOptions("column")}</select></label>
    <label>Тип сечения<select name="section_type">${sectionOptions("ibeam")}</select></label>
    <label class="wide">Профиль / обозначение<input name="profile_name" placeholder="Например: 40К2, 300×300×10, Ø273×8"></label>
    <div class="scheme-form-axis"><b>Направление ${esc(axesX[0])}–${esc(axesX.at(-1))}</b><label>Базовая ось<select name="axis_x">${axisOptions(axesX,axesX[0])}</select></label><label>Смещение, мм<input name="offset_x_mm" inputmode="decimal" value="0"></label></div>
    <div class="scheme-form-axis"><b>Направление ${esc(axesY[0])}–${esc(axesY.at(-1))}</b><label>Базовая ось<select name="axis_y">${axisOptions(axesY,axesY[0])}</select></label><label>Смещение, мм<input name="offset_y_mm" inputmode="decimal" value="0"></label></div>
    <div class="scheme-member-end wide" id="schemeMemberEnd" hidden><b>Конец элемента — вторая точка для балки, связи или фермы</b>
     <div><label>Ось по X<select name="end_axis_x">${axisOptions(axesX,axesX[1]||axesX[0])}</select></label><label>Смещение X, мм<input name="end_offset_x_mm" inputmode="decimal" value="0"></label>
     <label>Ось по Y<select name="end_axis_y">${axisOptions(axesY,axesY[0])}</select></label><label>Смещение Y, мм<input name="end_offset_y_mm" inputmode="decimal" value="0"></label></div></div>
    <label>Отметка низа / начала, мм<input name="z0_mm" inputmode="decimal" value="0"></label>
    <label>Отметка верха / конца, мм<input name="z1_mm" inputmode="decimal" value="8400"></label>
    <label>Поворот, °<input name="rotation_deg" inputmode="decimal" value="0"></label>
    <div class="scheme-coordinate-preview wide" id="schemeCoordPreview"></div>
   </div>
   <div class="scheme-form-error" id="schemeFormError" hidden></div>
   <div class="actions"><button type="button" id="schemeEditorCancel">Отмена</button><button type="submit" class="primary">Сохранить элемент</button></div>
  </form></dialog>`
 }
 function openEditor(c=null,copy=false){
  const d=document.getElementById("schemeEditor"),f=document.getElementById("schemeForm"),err=document.getElementById("schemeFormError");if(!d||!f)return;
  if(c&&copy){
   const [shiftX,shiftY]=cloneOffset(c),x=c.x+shiftX,y=c.y+shiftY,x2=c.x2+shiftX,y2=c.y2+shiftY,ax=closestAxis(x,axesX,axisXPos),ay=closestAxis(y,axesY,axisYPos);
   c={...c,id:"",axisX:ax,axisY:ay,dx:x-num(axisXPos.get(ax)),dy:y-num(axisYPos.get(ay)),x,y,x2,y2,status:"planned",position:"",title:""}
  }
  f.reset();err.hidden=true;document.getElementById("schemeEditorTitle").textContent=copy?"Копировать элемент — новое положение":c?"Редактировать элемент":"Добавить элемент";f.elements.id.value=copy?"":c?.id||"";
  const currentMark=resolveSavedMarkId(c),unresolvedExisting=!!c&&!currentMark,search=document.getElementById("schemeMarkSearch"),count=document.getElementById("schemeMarkCount");let chosenMark=currentMark;
  f.elements.mark_id.innerHTML=markOptions(chosenMark,"",unresolvedExisting);if(chosenMark)f.elements.mark_id.value=chosenMark;
  f.elements.mark_id.onchange=()=>{const value=String(f.elements.mark_id.value||"");if(value){chosenMark=value;if(!c){const m=activeMarks().find(x=>x.id===value),same=allRecords().find(x=>String(x.mark_id||"")===value);f.elements.section_type.value=sectionType(same||{});f.elements.profile_name.value=same?.profile_name||"";f.elements.geometry_type.value=m?guessGeometry(m):"column";updateGeometry(true)}refreshEditorProgress()}};
  const applyMarkSearch=()=>{const q=search?.value||"",matched=searchMarks(q);f.elements.mark_id.innerHTML=markOptions(chosenMark,q,unresolvedExisting&&!chosenMark);if(!q&&chosenMark&&[...f.elements.mark_id.options].some(o=>o.value===chosenMark))f.elements.mark_id.value=chosenMark;count.textContent=q?`Найдено: ${matched.length}`:`Марок: ${activeMarks().length}`;f.elements.mark_id._irSelectUI?.refresh?.()};
  if(search){search.value="";search.oninput=applyMarkSearch}applyMarkSearch();
  f.elements.status.value=c?.status||"planned";
  function refreshEditorProgress(){
   const m=activeMarks().find(x=>x.id===String(f.elements.mark_id.value||"")),progress=markProgress(m),info=document.getElementById("schemeEditorMountInfo");
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
  const sameMark=allRecords().find(x=>String(x.mark_id||"")===currentMark&&(!c||x.id!==c.id)),shapeSource=c||sameMark||{},chosen=activeMarks().find(x=>x.id===currentMark);
  f.elements.section_type.value=sectionType(shapeSource);f.elements.profile_name.value=shapeSource.profile_name||"";
  f.elements.axis_x.value=c?.axisX||axesX[0]||"";f.elements.axis_y.value=c?.axisY||axesY[0]||"";
  f.elements.offset_x_mm.value=c?.dx??0;f.elements.offset_y_mm.value=c?.dy??0;
  f.elements.z0_mm.value=c?.z0??c?.z0_mm??0;f.elements.z1_mm.value=c?.z2??c?.z1_mm??8400;f.elements.rotation_deg.value=c?.rotation_deg??0;
  f.elements.geometry_type.value=c?.geometryType||c?.geometry_type||(chosen?guessGeometry(chosen):"column");
  const nextX=axesX[Math.min(axesX.length-1,Math.max(0,axesX.indexOf(f.elements.axis_x.value)+1))]||axesX[0];
  const bx=c?closestAxis(c.x2,axesX,axisXPos):nextX,by=c?closestAxis(c.y2,axesY,axisYPos):f.elements.axis_y.value;
  f.elements.end_axis_x.value=bx;f.elements.end_axis_y.value=by;
  f.elements.end_offset_x_mm.value=c?c.x2-num(axisXPos.get(bx)):0;f.elements.end_offset_y_mm.value=c?c.y2-num(axisYPos.get(by)):0;
  function updateGeometry(defaultHeights=false){
   const kind=f.elements.geometry_type.value,member=kind!=="column",end=document.getElementById("schemeMemberEnd");
   if(end)end.hidden=!member;
   if(defaultHeights&&member){if(kind==="brace"){f.elements.z0_mm.value=0;f.elements.z1_mm.value=8400}else{f.elements.z0_mm.value=8400;f.elements.z1_mm.value=8400}}
   if(defaultHeights&&!member){f.elements.z0_mm.value=0;f.elements.z1_mm.value=8400}
   refreshPreview()
  }
  const refreshPreview=()=>{
   const ax=f.elements.axis_x.value,ay=f.elements.axis_y.value,x=num(axisXPos.get(ax))+num(f.elements.offset_x_mm.value),y=num(axisYPos.get(ay))+num(f.elements.offset_y_mm.value),member=f.elements.geometry_type.value!=="column",endX=num(axisXPos.get(f.elements.end_axis_x.value))+num(f.elements.end_offset_x_mm.value),endY=num(axisYPos.get(f.elements.end_axis_y.value))+num(f.elements.end_offset_y_mm.value);
   document.getElementById("schemeCoordPreview").innerHTML=`<span>Точные координаты</span><b>Начало X = ${fmt(x)} мм · Y = ${fmt(y)} мм</b><small>${member?`Конец X = ${fmt(endX)} мм · Y = ${fmt(endY)} мм`:"Колонна расположена вертикально"}</small>`;
  };
  f.elements.geometry_type.onchange=()=>updateGeometry(false);updateGeometry(!c&&f.elements.geometry_type.value!=="column");
  ["axis_x","axis_y","offset_x_mm","offset_y_mm","end_axis_x","end_axis_y","end_offset_x_mm","end_offset_y_mm","z0_mm","z1_mm"].forEach(n=>f.elements[n].addEventListener("input",refreshPreview));refreshPreview();d.showModal()
 }
 function bindEditor(){
  if(!canEdit())return;const d=document.getElementById("schemeEditor"),f=document.getElementById("schemeForm"),err=document.getElementById("schemeFormError");
  document.getElementById("schemeAdd")?.addEventListener("click",()=>openEditor());document.getElementById("schemeEditorX").onclick=()=>d.close();document.getElementById("schemeEditorCancel").onclick=()=>d.close();
  f.onsubmit=async e=>{
   e.preventDefault();err.hidden=true;
   if(!activeMarks().length){err.textContent="Для этой схемы нет подходящих марок.";err.hidden=false;return}
   const fd=new FormData(f),id=String(fd.get("id")||""),m=activeMarks().find(x=>x.id===String(fd.get("mark_id")||""));
   if(!m){err.textContent="Выберите марку.";err.hidden=false;return}
   const axisX=String(fd.get("axis_x")||axesX[0]),axisY=String(fd.get("axis_y")||axesY[0]),dx=num(fd.get("offset_x_mm")),dy=num(fd.get("offset_y_mm")),x=num(axisXPos.get(axisX))+dx,y=num(axisYPos.get(axisY))+dy;
   const kind=String(fd.get("geometry_type")||"column"),z0=num(fd.get("z0_mm")),z1=num(fd.get("z1_mm"));
   const endX=String(fd.get("end_axis_x")||axesX[0]),endY=String(fd.get("end_axis_y")||axesY[0]),endDx=num(fd.get("end_offset_x_mm")),endDy=num(fd.get("end_offset_y_mm")),x2=num(axisXPos.get(endX))+endDx,y2=num(axisYPos.get(endY))+endDy;
   if(!axesX.includes(axisX)||!axesY.includes(axisY)||kind!=="column"&&(!axesX.includes(endX)||!axesY.includes(endY))){err.textContent="Выберите существующие оси.";err.hidden=false;return}
   if(kind==="column"&&z1<=z0){err.textContent="У колонны верх должен быть выше низа.";err.hidden=false;return}
   if(kind!=="column"&&Math.hypot(x2-x,y2-y,z1-z0)<1){err.textContent="Конечная точка должна отличаться от начальной.";err.hidden=false;return}
   const storedRow=id?records().find(x=>String(x.id)===id):null,status=String(fd.get("status")||storedRow?.status||"planned"),section_type=String(fd.get("section_type")||"ibeam"),profile_name=String(fd.get("profile_name")||"").trim(),rot=num(fd.get("rotation_deg"));
   const existing=id?records().find(r=>r.id===id):null,used=new Set(allRecords().map(r=>String(r.position||r.title||"")));
   let internalPosition=String(existing?.position||existing?.title||"");
   if(!internalPosition){let n=1;do{internalPosition="COL-"+String(n++).padStart(4,"0")}while(used.has(internalPosition))}
   const g=markGroup(m),oldRow=id?arr(rows).find(r=>String(r.id)===id):null,previous=oldRow?.data||{},view=activeView();
   const payload={record_type:"scheme_column",title:internalPosition,data:{...previous,entity_type:"column",position:internalPosition,mark_id:m.id,mark:m.mark||m.title||"",mark_name:m.name||"",work_type_id:m.work_type_id||"",axis_x:axisX,axis_y:axisY,offset_x_mm:dx,offset_y_mm:dy,absolute_x_mm:x,absolute_y_mm:y,geometry_type:kind,absolute_x2_mm:kind==="column"?undefined:x2,absolute_y2_mm:kind==="column"?undefined:y2,end_z_mm:kind==="column"?undefined:z1,z0_mm:z0,z1_mm:z1,rotation_deg:rot,status,section_type,profile_name,scheme_group:g.key,scheme_group_label:g.label,scheme_view_id:view?.id||previous.scheme_view_id||""}};
   try{const saved=id?await schemeApi.update(id,payload):await schemeApi.create(payload);rows=await schemeApi.list();selectedId=String(saved?.id||id||"");d.close();draw()}catch(error){err.textContent="Не удалось сохранить элемент: "+String(error?.message||error);err.hidden=false}
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
   activeScheme="all";selectedId="";hiddenGroups.clear();statusFilter="all";levelMin="";levelMax="";
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
 function draw(){
  if(activeScheme!=="all"&&!activeView()){activeScheme="all";refreshGridModel()}
  if(selectedId&&!columns().some(c=>c.id===selectedId))selectedId="";
  const s=stats(),mp=statusCounts(),works=enabledWorks(),currentWork=works.find(w=>w.id===activeWorkId)||null,workOptions=works.length?works.map(w=>`<option value="${esc(w.id)}" ${w.id===activeWorkId?"selected":""}>${esc(w.name)}${w.code?` · ${esc(w.code)}`:""}</option>`).join(""):`<option value="">Монтажная схема не включена</option>`,groupOptions=schemeGroups().map(g=>`<option value="${esc(g.key)}" ${g.key===activeScheme?"selected":""}>${esc(g.label)} · ${g.marks} марок · ${g.placed} элементов</option>`).join(""),editActions=canEdit()?`<button type="button" class="scheme-grid-button" id="schemeGridConfig">⚙ Параметры сетки</button>${activeWorkId?`<button type="button" class="scheme-grid-button" id="schemeNewView">＋ Добавить сетку</button>${activeView()?`<button type="button" class="scheme-grid-button" id="schemeEditView">Изменить</button><button type="button" class="scheme-grid-button danger" id="schemeDeleteView">Удалить сетку</button>`:""}`:""}`:"",emptyOverlay=activeWorkId?(s.total?"":`<div class="scheme-empty-overlay"><b>Схема пока пустая</b><span>Нажмите «Добавить элемент» и выберите марку для этой монтажной схемы.</span></div>`):`<div class="scheme-empty-overlay"><b>Монтажная схема не включена</b><span>Откройте «Виды работ» и включите галочку «Нужна монтажная схема» у нужного вида работ.</span></div>`;
  app.innerHTML=`<div class="scheme-page ${canEdit()&&activeWorkId?"has-add-dock":""}">
   <div class="scheme-head"><button class="back" id="schemeBack">← Назад</button><div><h1>Монтажная схема</h1><p>${esc(object.name||"")}${currentWork?` · ${esc(currentWork.name)}`:""} · ${esc(activeGroup().label)}</p></div><div class="scheme-head-actions"><label class="scheme-type-select-wrap work"><span>Вид работ</span><select id="schemeWorkSelect" data-native-select="1" ${activeWorkId?"":"disabled"}>${workOptions}</select></label><label class="scheme-type-select-wrap"><span>Схема</span><select id="schemeTypeSelect" data-native-select="1" ${activeWorkId?"":"disabled"}>${groupOptions}</select></label><div class="scheme-view-switch"><button data-mode="plan" class="${mode==="plan"?"on":""}">План</button><button data-mode="3d" class="${mode==="3d"?"on":""}">3D</button></div>${editActions}</div></div>
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
     <label>Статус<select id="schemeStatusFilter" data-native-select="1"><option value="all" ${statusFilter==="all"?"selected":""}>Все</option><option value="planned" ${statusFilter==="planned"?"selected":""}>Не смонтированы</option><option value="mounted" ${statusFilter==="mounted"?"selected":""}>Смонтированы</option><option value="partial" ${statusFilter==="partial"?"selected":""}>Частично</option></select></label>
     <label>Отметка от, мм<input id="schemeLevelMin" type="number" step="100" placeholder="Любая" value="${esc(levelMin)}"></label>
     <label>До, мм<input id="schemeLevelMax" type="number" step="100" placeholder="Любая" value="${esc(levelMax)}"></label>
     <button id="schemeVisibilityReset" type="button">Сбросить фильтры</button>
     <span class="scheme-visible-counter">На экране: <b>${columns().length}</b> из ${s.total}</span>
    </div>
   </section>
   <div class="scheme-workspace">
    <section class="scheme-stage ${previewFullscreen?"scheme-preview-fullscreen":""}" id="schemePreviewStage" aria-label="Предпросмотр монтажной схемы" data-scheme-background="${schemeBackground}" data-scheme-contrast="${backgroundIsDark()?"dark":"light"}" style="--scheme-custom-background:${schemeCustomBackground}">
     <div class="scheme-stage-toolbar"><div class="scheme-preview-title"><b>Монтажная схема · ${esc(activeGroup().label)}</b><span>${s.total} элементов · ${mode==="plan"?"План":"3D"}</span></div>
      <div class="scheme-legend"><span><i class="mounted"></i>Смонтировано</span><span><i class="planned"></i>Не смонтировано</span><span><i class="partial"></i>Частично</span><span><i class="between"></i>Со смещением от оси</span></div>
      <div class="scheme-toolbar-actions"><div class="scheme-preview-mode-switch"><button type="button" data-mode="plan" class="${mode==="plan"?"on":""}">План</button><button type="button" data-mode="3d" class="${mode==="3d"?"on":""}">3D</button></div><button type="button" id="schemeFullscreenToggle" class="scheme-fullscreen-toggle" title="${previewFullscreen?"Закрыть полноэкранный просмотр":"Предпросмотр схемы на весь экран"}">${previewFullscreen?"✕ Закрыть":"⛶ На весь экран"}</button><label class="scheme-background-picker" title="Цвет фона поля монтажной схемы"><span>Фон</span><select id="schemeBackgroundSelect" data-native-select="1" aria-label="Цвет фона монтажной схемы"><option value="standard" ${schemeBackground==="standard"?"selected":""}>Стандартный</option><option value="white" ${schemeBackground==="white"?"selected":""}>Белый</option><option value="gray" ${schemeBackground==="gray"?"selected":""}>Серый</option><option value="blue" ${schemeBackground==="blue"?"selected":""}>Голубой</option><option value="sand" ${schemeBackground==="sand"?"selected":""}>Бежевый</option><option value="dark" ${schemeBackground==="dark"?"selected":""}>Тёмный</option><option value="custom" ${schemeBackground==="custom"?"selected":""}>Свой цвет</option></select><input id="schemeBackgroundCustom" type="color" aria-label="Выбрать свой цвет фона" value="${schemeCustomBackground}" ${schemeBackground==="custom"?"":"hidden"}></label><button type="button" id="schemeToggleLabels" class="${labelsVisible?"on":""}">Подписи</button><button type="button" id="schemeToggleDimensions" class="${dimensionsVisible?"on":""}" title="Показать межосевые размеры сетки">Размеры</button><div class="scheme-zoom"><button type="button" id="schemeZoomOut" title="Уменьшить">−</button><button type="button" id="schemeZoomValue" title="Вернуть 100%">${Math.round(zoom*100)}%</button><button type="button" id="schemeZoomIn" title="Увеличить">+</button></div><div class="scheme-orient"><button type="button" id="schemeRotate90Left" title="Повернуть на 90° влево">↶90°</button><button type="button" id="schemeRotationValue" title="Вернуть поворот в 0°">${viewRotation}°</button><button type="button" id="schemeRotate90Right" title="Повернуть на 90° вправо">↷90°</button></div><div class="scheme-rotate" ${mode==="plan"?"hidden":""}><button id="schemeLeft" title="Повернуть 3D на 10°">↶10°</button><button id="schemeReset" title="Вернуть 3D ракурс">3D</button><button id="schemeRight" title="Повернуть 3D на 10°">↷10°</button></div></div>
     </div>
     <div class="scheme-canvas" id="schemeCanvas"></div>
     ${emptyOverlay}
    </section>
    <aside class="scheme-details" id="schemeDetails"></aside>
   </div>
   ${canEdit()&&activeWorkId?'<div class="scheme-add-dock"><button type="button" class="primary" id="schemeAdd">＋ Добавить элемент</button></div>':""}
   <div class="scheme-hint"><b>Сетка:</b><span><strong>${esc(axesX[0])} → ${esc(axesX.at(-1))}</strong> — ${gridDirX==="ltr"?"слева направо":"справа налево"}, <strong>${esc(axesY[0])} → ${esc(axesY.at(-1))}</strong> — ${gridDirY==="btt"?"снизу вверх":"сверху вниз"}. Направление можно изменить в «Параметрах сетки».</span></div>
   ${canEdit()?gridEditorHtml()+editorHtml()+viewDialogHtml():""}
  </div>`;
  document.getElementById("schemeBack").onclick=()=>location.hash=`/objects/object/${oid}`;document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{mode=b.dataset.mode;draw()});document.getElementById("schemeWorkSelect")?.addEventListener("change",e=>{activeWorkId=e.target.value;activeScheme="all";selectedId="";syncNotice=null;elementSearch="";pickerScrollTop=0;hiddenGroups.clear();statusFilter="all";levelMin="";levelMax="";panX=0;panY=0;refreshGridModel();draw()});document.getElementById("schemeTypeSelect")?.addEventListener("change",e=>{activeScheme=e.target.value;selectedId="";syncNotice=null;elementSearch="";pickerScrollTop=0;panX=0;panY=0;refreshGridModel();draw()});
  document.querySelector(".scheme-layers")?.addEventListener("toggle",e=>{layersPanelOpen=e.target.open});
  document.querySelectorAll("[data-scheme-layer]").forEach(btn=>btn.addEventListener("click",()=>{layersPanelOpen=true;const key=btn.dataset.schemeLayer;if(hiddenGroups.has(key))hiddenGroups.delete(key);else hiddenGroups.add(key);draw()}));
  document.getElementById("schemeLayersShowAll")?.addEventListener("click",()=>{layersPanelOpen=true;hiddenGroups.clear();draw()});
  document.getElementById("schemeLayersHideAll")?.addEventListener("click",()=>{layersPanelOpen=true;allVisibleTypes().forEach(g=>hiddenGroups.add(g.key));draw()});
  document.getElementById("schemeRefreshMarkProgress")?.addEventListener("click",refreshSchemeMarkProgress);
  document.getElementById("schemeStatusFilter")?.addEventListener("change",e=>{statusFilter=e.target.value;draw()});
  document.getElementById("schemeLevelMin")?.addEventListener("change",e=>{levelMin=e.target.value;draw()});
  document.getElementById("schemeLevelMax")?.addEventListener("change",e=>{levelMax=e.target.value;draw()});
  document.getElementById("schemeVisibilityReset")?.addEventListener("click",()=>{hiddenGroups.clear();statusFilter="all";levelMin="";levelMax="";draw()});
  document.getElementById("schemeFullscreenToggle")?.addEventListener("click",()=>previewFullscreen?leaveSchemeFullscreen():enterSchemeFullscreen());
  document.getElementById("schemeBackgroundSelect")?.addEventListener("change",e=>applySchemeBackground(e.target.value));
  document.getElementById("schemeBackgroundCustom")?.addEventListener("input",e=>applySchemeBackground("custom",e.target.value));
  document.getElementById("schemeBackgroundCustom")?.addEventListener("change",e=>applySchemeBackground("custom",e.target.value));
  document.getElementById("schemeToggleLabels")?.addEventListener("click",()=>{labelsVisible=!labelsVisible;draw()});document.getElementById("schemeToggleDimensions")?.addEventListener("click",()=>{dimensionsVisible=!dimensionsVisible;draw()});
  document.getElementById("schemeZoomOut")?.addEventListener("click",()=>setZoom(zoom-.15));document.getElementById("schemeZoomIn")?.addEventListener("click",()=>setZoom(zoom+.15));document.getElementById("schemeZoomValue")?.addEventListener("click",()=>setZoom(1,true));
  const rotateView=delta=>{viewRotation=((viewRotation+delta)%360+360)%360;panX=0;panY=0;renderScene();const v=document.getElementById("schemeRotationValue");if(v)v.textContent=`${viewRotation}°`};document.getElementById("schemeRotate90Left")?.addEventListener("click",()=>rotateView(-90));document.getElementById("schemeRotate90Right")?.addEventListener("click",()=>rotateView(90));document.getElementById("schemeRotationValue")?.addEventListener("click",()=>{viewRotation=0;panX=0;panY=0;renderScene()});
  document.getElementById("schemeLeft")?.addEventListener("click",()=>{yaw-=10;renderScene()});document.getElementById("schemeRight")?.addEventListener("click",()=>{yaw+=10;renderScene()});document.getElementById("schemeReset")?.addEventListener("click",()=>{yaw=-34;panX=0;panY=0;renderScene()});
  renderScene();renderDetails();bindGridEditor();bindEditor();bindViewManager()
 }
 draw();
};