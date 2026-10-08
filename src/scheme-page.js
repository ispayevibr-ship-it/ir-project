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
 const axesX=["1","2","3","4","5","6"],axesY=["А","Б","В","Г","Д","Е","Ж","И","К","Л"];
 const spanX=45000,spanY=60000,stepX=spanX/(axesX.length-1),stepY=spanY/(axesY.length-1);
 const axisXPos=new Map(axesX.map((a,i)=>[a,i*stepX])),axisYPos=new Map(axesY.map((a,i)=>[a,i*stepY]));
 let mode="3d",yaw=-34,selectedId="",rows=[],markRows=[],workRows=[];
 [rows,markRows,workRows]=await Promise.all([schemeApi.list().catch(()=>[]),root.section("marks").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);
 const workById=new Map(arr(workRows).map(r=>[String(r.id),r.data||{}]));
 const marks=arr(markRows).map(r=>({id:String(r.id),title:r.title||"",...(r.data||{})}));
 const markLabel=m=>{const w=workById.get(String(m.work_type_id||""))||{},name=m.name||"",wt=w.work_type||m.work_type||"";return [m.mark||m.title||"Без марки",name||wt].filter(Boolean).join(" · ")};
 const records=()=>arr(rows).filter(r=>r.record_type==="scheme_column"||r.data?.entity_type==="column").map(r=>({id:String(r.id),title:r.title||"",...(r.data||{})}));
 const coord=c=>{const axisX=axesX.includes(String(c.axis_x))?String(c.axis_x):"1",axisY=axesY.includes(String(c.axis_y))?String(c.axis_y):"А",dx=num(c.offset_x_mm),dy=num(c.offset_y_mm);return{x:num(axisXPos.get(axisX))+dx,y:num(axisYPos.get(axisY))+dy,z0:num(c.z0_mm),z1:num(c.z1_mm||8400),axisX,axisY,dx,dy}};
 const columns=()=>records().map(c=>({...c,...coord(c)}));
 const selected=()=>columns().find(x=>x.id===selectedId)||null;
 const markOptions=(selectedMark,query="")=>{const q=String(query||"").trim().toLowerCase(),list=q?marks.filter(m=>`${m.mark||m.title||""} ${m.name||""}`.toLowerCase().includes(q)):marks;return list.length?list.map(m=>`<option value="${esc(m.id)}" ${String(selectedMark)===m.id?"selected":""}>${esc(markLabel(m))}</option>`).join(""):`<option value="">${marks.length?"Ничего не найдено":"Ведомость марок пустая"}</option>`};
 const axisOptions=(items,value)=>items.map(x=>`<option value="${esc(x)}" ${String(value)===x?"selected":""}>${esc(x)}</option>`).join("");
 const statusText=s=>s==="mounted"?"Смонтирована":"Не смонтирована";
 function stats(){
  const cols=columns(),mounted=cols.filter(x=>x.status==="mounted").length;
  return{total:cols.length,mounted,left:cols.length-mounted,pct:cols.length?Math.round(mounted/cols.length*100):0}
 }
 function projection(cols){
  const W=1040,H=650,padX=105,padY=90,a=yaw*Math.PI/180,maxZ=Math.max(9,...cols.map(c=>Math.max(c.z0,c.z1)/1000));
  const raw=(xmm,ymm,zmm)=>{const x=(xmm-spanX/2)/1000,y=(ymm-spanY/2)/1000,z=zmm/1000,rx=x*Math.cos(a)-y*Math.sin(a),ry=x*Math.sin(a)+y*Math.cos(a);return{x:rx,y:ry*.48-z}};
  const samples=[];
  for(const x of [0,spanX])for(const y of [0,spanY]){samples.push(raw(x,y,0));samples.push(raw(x,y,maxZ*1000))}
  for(const c of cols){samples.push(raw(c.x,c.y,c.z0));samples.push(raw(c.x,c.y,c.z1))}
  const minX=Math.min(...samples.map(p=>p.x)),maxX=Math.max(...samples.map(p=>p.x)),minY=Math.min(...samples.map(p=>p.y)),maxY=Math.max(...samples.map(p=>p.y));
  const scale=Math.min((W-padX*2)/Math.max(1,maxX-minX),(H-padY*2)/Math.max(1,maxY-minY));
  const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  return(x,y,z)=>{const p=raw(x,y,z);return{x:W/2+(p.x-cx)*scale,y:H/2+(p.y-cy)*scale}}
 }
 const line=(a,b,cls)=>`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="${cls}"/>`;
 function grid3d(cols){
  const p=projection(cols);let out="";
  for(const axis of axesX){const x=axisXPos.get(axis),a=p(x,0,0),b=p(x,spanY,0),label=p(x,-4200,0);out+=line(a,b,"scheme-grid-line")+ `<text x="${label.x}" y="${label.y}" class="scheme-axis-label">${axis}</text>`}
  for(const axis of axesY){const y=axisYPos.get(axis),a=p(0,y,0),b=p(spanX,y,0),label=p(-4200,y,0);out+=line(a,b,"scheme-grid-line")+ `<text x="${label.x}" y="${label.y}" class="scheme-axis-label">${axis}</text>`}
  return{html:out,p}
 }
 function prism(c,p){
  const base=p(c.x,c.y,c.z0),top=p(c.x,c.y,c.z1),w=3.6,h=2.6,sel=c.id===selectedId?" selected":"",status=c.status==="mounted"?" mounted":" planned",between=c.dx||c.dy?" between":"";
  return`<g class="scheme-column${status}${sel}${between}" data-column="${esc(c.id)}" tabindex="0">
   <polygon points="${base.x-w},${base.y} ${base.x},${base.y-h} ${base.x+w},${base.y} ${top.x+w},${top.y} ${top.x},${top.y-h} ${top.x-w},${top.y}" class="scheme-column-body"/>
   <line x1="${base.x}" y1="${base.y-h}" x2="${top.x}" y2="${top.y-h}" class="scheme-column-edge"/>
   <circle cx="${top.x}" cy="${top.y-h}" r="4.5" class="scheme-column-top"/>
  </g>`
 }
 function planSvg(cols){
  const W=1040,H=650,padX=150,padY=78,availW=W-padX*2,availH=H-padY*2,scale=Math.min(availW/spanX,availH/spanY),gridW=spanX*scale,gridH=spanY*scale,left=(W-gridW)/2,top=(H-gridH)/2;
  const sx=x=>left+x*scale,sy=y=>top+y*scale;let svg="";
  axesX.forEach(a=>{const x=sx(axisXPos.get(a));svg+=`<line x1="${x}" y1="${top}" x2="${x}" y2="${top+gridH}" class="scheme-grid-line"/><text x="${x}" y="${top-24}" class="scheme-axis-label">${a}</text>`});
  axesY.forEach(a=>{const y=sy(axisYPos.get(a));svg+=`<line x1="${left}" y1="${y}" x2="${left+gridW}" y2="${y}" class="scheme-grid-line"/><text x="${left-30}" y="${y}" class="scheme-axis-label">${a}</text>`});
  cols.forEach(c=>{const x=sx(c.x),y=sy(c.y),sel=c.id===selectedId?" selected":"",status=c.status==="mounted"?" mounted":" planned",between=c.dx||c.dy?" between":"";svg+=`<g class="scheme-column${status}${sel}${between}" data-column="${esc(c.id)}" tabindex="0"><rect x="${x-6}" y="${y-6}" width="12" height="12" rx="2" class="scheme-plan-column"/><circle cx="${x}" cy="${y}" r="2.3" class="scheme-plan-dot"/></g>`});
  svg+=`<line x1="${left}" y1="${top+gridH+35}" x2="${left+gridW}" y2="${top+gridH+35}" class="scheme-dim-line"/><text x="${W/2}" y="${top+gridH+56}" class="scheme-dim-text">45 000 мм</text>`;
  svg+=`<line x1="${left+gridW+42}" y1="${top}" x2="${left+gridW+42}" y2="${top+gridH}" class="scheme-dim-line"/><text x="${left+gridW+66}" y="${H/2}" class="scheme-dim-text scheme-dim-vertical">60 000 мм</text>`;
  return svg
 }
 function renderScene(){
  const box=document.getElementById("schemeCanvas");if(!box)return;const cols=columns();
  if(mode==="3d"){const g=grid3d(cols);box.innerHTML=`<svg viewBox="0 0 1040 650" aria-label="3D монтажная схема"><g>${g.html}${cols.map(c=>prism(c,g.p)).join("")}</g><text x="520" y="626" class="scheme-demo-note" text-anchor="middle">Сетка 45 000 × 60 000 мм · оси 1–6 / А–Л</text></svg>`}
  else box.innerHTML=`<svg viewBox="0 0 1040 650" aria-label="План монтажной схемы">${planSvg(cols)}<text x="520" y="626" class="scheme-demo-note" text-anchor="middle">Колонны можно ставить на оси или со смещением в мм</text></svg>`;
  box.querySelectorAll("[data-column]").forEach(el=>{const pick=()=>{selectedId=el.dataset.column;renderScene();renderDetails()};el.onclick=pick;el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pick()}}})
 }
 function axisText(c){
  const x=c.dx?`${c.axisX} ${c.dx>=0?"+":"−"} ${fmt(Math.abs(c.dx))} мм`:c.axisX,y=c.dy?`${c.axisY} ${c.dy>=0?"+":"−"} ${fmt(Math.abs(c.dy))} мм`:c.axisY;
  return{x,y}
 }
 function renderDetails(){
  const panel=document.getElementById("schemeDetails");if(!panel)return;const c=selected();
  if(!c){panel.innerHTML=`<div class="scheme-detail-empty"><b>Колонна не выбрана</b><span>Нажмите на колонну на схеме или добавьте новую.</span>${canEdit()?'<button type="button" data-scheme-add>＋ Добавить колонну</button>':""}</div>`;panel.querySelector("[data-scheme-add]")?.addEventListener("click",()=>openEditor());return}
  const a=axisText(c),between=c.dx||c.dy;
  panel.innerHTML=`<div class="scheme-detail-title"><span>Выбранная колонна</span><b>${esc(c.position||c.title||"Колонна")}</b></div>
   <div class="scheme-detail-grid">
    <div><span>Марка</span><b>${esc(c.mark||"—")}</b></div>
    <div><span>Статус</span><b class="${c.status==="mounted"?"ok":"wait"}">${statusText(c.status)}</b></div>
    <div><span>Ось 1–6</span><b>${esc(a.x)}</b></div>
    <div><span>Ось А–Л</span><b>${esc(a.y)}</b></div>
    <div><span>Коорд. X</span><b>${fmt(c.x)} мм</b></div>
    <div><span>Коорд. Y</span><b>${fmt(c.y)} мм</b></div>
    <div><span>Низ</span><b>${fmt(c.z0)} мм</b></div>
    <div><span>Верх</span><b>${fmt(c.z1)} мм</b></div>
   </div>
   ${between?`<div class="scheme-between"><b>Колонна между осями</b><span>${esc(a.x)} / ${esc(a.y)}</span><small>Положение вычисляется от выбранных базовых осей и сохраняется точно в миллиметрах.</small></div>`:""}
   ${canEdit()?`<div class="scheme-detail-actions"><button type="button" data-scheme-edit>Редактировать</button><button type="button" class="danger" data-scheme-delete>Удалить</button></div>`:""}`;
  panel.querySelector("[data-scheme-edit]")?.addEventListener("click",()=>openEditor(c));
  panel.querySelector("[data-scheme-delete]")?.addEventListener("click",async()=>{if(!confirm(`Удалить колонну «${c.position||c.title||""}» со схемы?`))return;await schemeApi.remove(c.id);rows=await schemeApi.list().catch(()=>rows);selectedId="";draw()})
 }
 function editorHtml(){
  return`<dialog id="schemeEditor" class="scheme-editor"><form id="schemeForm" novalidate><input type="hidden" name="id"><div class="scheme-editor-head"><div><h2 id="schemeEditorTitle">Добавить колонну</h2><p>Укажите марку и точное положение относительно осей.</p></div><button type="button" id="schemeEditorX">×</button></div>
   <div class="scheme-form-grid">
    <label class="wide scheme-mark-field">Марка из ведомости<div class="scheme-mark-search"><input id="schemeMarkSearch" type="search" autocomplete="off" placeholder="Поиск по марке или наименованию…"><span id="schemeMarkCount"></span></div><select name="mark_id" ${marks.length?"required":"disabled"}>${markOptions("")}</select></label>
    <label>Позиция / обозначение<input name="position" required placeholder="Например: К1-01"></label>
    <label>Статус<select name="status"><option value="planned">Не смонтирована</option><option value="mounted">Смонтирована</option></select></label>
    <div class="scheme-form-axis"><b>Направление 1–6</b><label>Базовая ось<select name="axis_x">${axisOptions(axesX,"1")}</select></label><label>Смещение, мм<input name="offset_x_mm" inputmode="decimal" value="0"></label></div>
    <div class="scheme-form-axis"><b>Направление А–Л</b><label>Базовая ось<select name="axis_y">${axisOptions(axesY,"А")}</select></label><label>Смещение, мм<input name="offset_y_mm" inputmode="decimal" value="0"></label></div>
    <label>Отметка низа, мм<input name="z0_mm" inputmode="decimal" value="0"></label>
    <label>Отметка верха, мм<input name="z1_mm" inputmode="decimal" value="8400"></label>
    <label>Поворот, °<input name="rotation_deg" inputmode="decimal" value="0"></label>
    <div class="scheme-coordinate-preview wide" id="schemeCoordPreview"></div>
   </div>
   <div class="scheme-form-error" id="schemeFormError" hidden></div>
   <div class="actions"><button type="button" id="schemeEditorCancel">Отмена</button><button type="submit" class="primary">Сохранить колонну</button></div>
  </form></dialog>`
 }
 function openEditor(c=null){
  const d=document.getElementById("schemeEditor"),f=document.getElementById("schemeForm"),err=document.getElementById("schemeFormError");if(!d||!f)return;
  f.reset();err.hidden=true;document.getElementById("schemeEditorTitle").textContent=c?"Редактировать колонну":"Добавить колонну";f.elements.id.value=c?.id||"";
  const currentMark=String(c?.mark_id||marks[0]?.id||""),search=document.getElementById("schemeMarkSearch"),count=document.getElementById("schemeMarkCount");
  const applyMarkSearch=()=>{const q=search?.value||"",previous=String(f.elements.mark_id.value||currentMark||"");f.elements.mark_id.innerHTML=markOptions(previous,q);const visible=[...f.elements.mark_id.options].filter(o=>o.value);if(visible.some(o=>o.value===previous))f.elements.mark_id.value=previous;else if(visible[0])f.elements.mark_id.value=visible[0].value;count.textContent=q?`Найдено: ${visible.length}`:`Марок: ${marks.length}`;f.elements.mark_id._irSelectUI?.refresh?.()};
  if(search){search.value="";search.oninput=applyMarkSearch}applyMarkSearch();
  f.elements.position.value=c?.position||c?.title||"";
  f.elements.status.value=c?.status||"planned";f.elements.axis_x.value=c?.axis_x||"1";f.elements.axis_y.value=c?.axis_y||"А";
  f.elements.offset_x_mm.value=c?.offset_x_mm??0;f.elements.offset_y_mm.value=c?.offset_y_mm??0;f.elements.z0_mm.value=c?.z0_mm??0;f.elements.z1_mm.value=c?.z1_mm??8400;f.elements.rotation_deg.value=c?.rotation_deg??0;
  if(!c&&marks.length){const m=marks.find(x=>x.id===currentMark),base=String(m?.mark||m?.title||"К").trim()||"К",used=new Set(columns().map(x=>String(x.position||x.title)));let n=1,name="";do{name=`${base}-${String(n++).padStart(2,"0")}`}while(used.has(name));f.elements.position.value=name}
  const refreshPreview=()=>{const ax=f.elements.axis_x.value,ay=f.elements.axis_y.value,dx=num(f.elements.offset_x_mm.value),dy=num(f.elements.offset_y_mm.value),x=num(axisXPos.get(ax))+dx,y=num(axisYPos.get(ay))+dy;document.getElementById("schemeCoordPreview").innerHTML=`<span>Точная координата</span><b>X = ${fmt(x)} мм · Y = ${fmt(y)} мм</b><small>${ax}${dx?` ${dx>=0?"+":"−"} ${fmt(Math.abs(dx))} мм`:""} / ${ay}${dy?` ${dy>=0?"+":"−"} ${fmt(Math.abs(dy))} мм`:""}</small>`};
  ["axis_x","axis_y","offset_x_mm","offset_y_mm"].forEach(n=>f.elements[n].addEventListener("input",refreshPreview));refreshPreview();d.showModal()
 }
 function bindEditor(){
  if(!canEdit())return;const d=document.getElementById("schemeEditor"),f=document.getElementById("schemeForm"),err=document.getElementById("schemeFormError");
  document.getElementById("schemeAdd")?.addEventListener("click",()=>openEditor());document.getElementById("schemeEditorX").onclick=()=>d.close();document.getElementById("schemeEditorCancel").onclick=()=>d.close();
  f.onsubmit=async e=>{e.preventDefault();err.hidden=true;if(!marks.length){err.textContent="Сначала добавьте марки колонн в ведомость марок.";err.hidden=false;return}const fd=new FormData(f),id=String(fd.get("id")||""),markId=String(fd.get("mark_id")||""),m=marks.find(x=>x.id===markId),position=String(fd.get("position")||"").trim(),axisX=String(fd.get("axis_x")||"1"),axisY=String(fd.get("axis_y")||"А"),dx=num(fd.get("offset_x_mm")),dy=num(fd.get("offset_y_mm")),z0=num(fd.get("z0_mm")),z1=num(fd.get("z1_mm")),rot=num(fd.get("rotation_deg")),status=String(fd.get("status")||"planned");if(!m||!position){err.textContent="Выберите марку и укажите обозначение колонны.";err.hidden=false;return}if(z1<=z0){err.textContent="Отметка верха должна быть выше отметки низа.";err.hidden=false;return}if(columns().some(x=>x.id!==id&&String(x.position||x.title).trim().toLowerCase()===position.toLowerCase())){err.textContent="Колонна с таким обозначением уже есть на схеме.";err.hidden=false;return}const payload={record_type:"scheme_column",title:position,data:{entity_type:"column",position,mark_id:m.id,mark:m.mark||m.title||"",mark_name:m.name||"",work_type_id:m.work_type_id||"",axis_x:axisX,axis_y:axisY,offset_x_mm:dx,offset_y_mm:dy,z0_mm:z0,z1_mm:z1,rotation_deg:rot,status}};let saved;if(id){saved=await schemeApi.update(id,payload)}else saved=await schemeApi.create(payload);rows=await schemeApi.list().catch(()=>rows);selectedId=String(saved?.id||id||records().at(-1)?.id||"");d.close();draw()}
 }
 function draw(){
  const s=stats();
  app.innerHTML=`<div class="scheme-page">
   <div class="scheme-head"><button class="back" id="schemeBack">← Назад</button><div><h1>Монтажная схема</h1><p>${esc(object.name||"")} · колонны</p></div><div class="scheme-head-actions"><div class="scheme-view-switch"><button data-mode="plan" class="${mode==="plan"?"on":""}">План</button><button data-mode="3d" class="${mode==="3d"?"on":""}">3D</button></div>${canEdit()?'<button type="button" class="primary" id="schemeAdd">＋ Добавить колонну</button>':""}</div></div>
   <div class="scheme-summary">
    <div><span>Оси 1–6</span><b>45 000 мм</b><small>5 пролётов · по 9 000 мм</small></div>
    <div><span>Оси А–Л</span><b>60 000 мм</b><small>9 пролётов · по ${fmt(stepY)} мм</small></div>
    <div><span>Колонн на схеме</span><b>${s.total}</b><small>Задаются вручную</small></div>
    <div><span>Смонтировано</span><b>${s.mounted} / ${s.total}</b><small>${s.pct}%</small></div>
   </div>
   <div class="scheme-workspace">
    <section class="scheme-stage">
     <div class="scheme-stage-toolbar">
      <div class="scheme-legend"><span><i class="mounted"></i>Смонтировано</span><span><i class="planned"></i>Не смонтировано</span><span><i class="between"></i>Со смещением от оси</span></div>
      <div class="scheme-rotate" ${mode==="plan"?"hidden":""}><button id="schemeLeft">↶ Повернуть</button><button id="schemeReset">По центру</button><button id="schemeRight">Повернуть ↷</button></div>
     </div>
     <div class="scheme-canvas" id="schemeCanvas"></div>
     ${s.total?"":'<div class="scheme-empty-overlay"><b>Схема пока пустая</b><span>Нажмите «Добавить колонну» и задайте её марку, оси и смещение.</span></div>'}
    </section>
    <aside class="scheme-details" id="schemeDetails"></aside>
   </div>
   <div class="scheme-hint"><b>Размер сетки:</b><span><strong>1–6 = 45 000 мм</strong>, <strong>А–Л = 60 000 мм</strong>. Колонна между осями задаётся базовой осью и смещением, например «3 / Б + 2200 мм».</span></div>
   ${canEdit()?editorHtml():""}
  </div>`;
  document.getElementById("schemeBack").onclick=()=>location.hash=`/objects/object/${oid}`;document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{mode=b.dataset.mode;draw()});
  document.getElementById("schemeLeft")?.addEventListener("click",()=>{yaw-=10;renderScene()});document.getElementById("schemeRight")?.addEventListener("click",()=>{yaw+=10;renderScene()});document.getElementById("schemeReset")?.addEventListener("click",()=>{yaw=-34;renderScene()});
  renderScene();renderDetails();bindEditor()
 }
 draw();
};