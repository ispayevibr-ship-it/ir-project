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
 let axesX=[...defaultAxesX],axesY=[...defaultAxesY],targetSpanX=defaultSpanX,targetSpanY=defaultSpanY;
 let mode="3d",yaw=-34,selectedId="",rows=[],markRows=[],workRows=[],gridXSpans=[],gridYSpans=[],spanX=targetSpanX,spanY=targetSpanY,axisXPos=new Map(),axisYPos=new Map(),labelsVisible=false,dimensionsVisible=false;
 [rows,markRows,workRows]=await Promise.all([schemeApi.list().catch(()=>[]),root.section("marks").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);
 const equalSpans=(total,count)=>{count=Math.max(1,count);const base=Math.floor(total/count),rem=Math.round(total-base*count);return Array.from({length:count},(_,i)=>base+(i<rem?1:0))};
 const validAxes=v=>Array.isArray(v)&&v.length>=2&&v.every(x=>String(x||"").trim());
 const validSpans=(v,count,total)=>Array.isArray(v)&&v.length===count&&v.every(x=>num(x)>0)&&Math.abs(v.reduce((s,x)=>s+num(x),0)-total)<.11;
 const gridRecord=()=>arr(rows).find(r=>r.record_type==="scheme_grid"||r.data?.entity_type==="grid")||null;
 const cumulative=(axes,spans)=>{let at=0;return new Map(axes.map((axis,i)=>{const here=at;if(i<spans.length)at+=num(spans[i]);return[axis,here]}))};
 const refreshGridModel=()=>{const g=gridRecord()?.data||{};axesX=validAxes(g.axes_x)?g.axes_x.map(x=>String(x).trim()):[...defaultAxesX];axesY=validAxes(g.axes_y)?g.axes_y.map(x=>String(x).trim()):[...defaultAxesY];targetSpanX=num(g.span_x_mm)>0?num(g.span_x_mm):defaultSpanX;targetSpanY=num(g.span_y_mm)>0?num(g.span_y_mm):defaultSpanY;const gx=validSpans(g.x_spans_mm,axesX.length-1,targetSpanX)?g.x_spans_mm.map(num):equalSpans(targetSpanX,axesX.length-1),gy=validSpans(g.y_spans_mm,axesY.length-1,targetSpanY)?g.y_spans_mm.map(num):equalSpans(targetSpanY,axesY.length-1);gridXSpans=gx;gridYSpans=gy;spanX=gx.reduce((s,x)=>s+x,0);spanY=gy.reduce((s,x)=>s+x,0);axisXPos=cumulative(axesX,gx);axisYPos=cumulative(axesY,gy)};
 refreshGridModel();
 const workById=new Map(arr(workRows).map(r=>[String(r.id),r.data||{}]));
 const marks=arr(markRows).map(r=>({id:String(r.id),title:r.title||"",...(r.data||{})}));
 const markLabel=m=>{const w=workById.get(String(m.work_type_id||""))||{},name=m.name||"",wt=w.work_type||m.work_type||"";return [m.mark||m.title||"Без марки",name||wt].filter(Boolean).join(" · ")};
 const records=()=>arr(rows).filter(r=>r.record_type==="scheme_column"||r.data?.entity_type==="column").map(r=>({id:String(r.id),title:r.title||"",...(r.data||{})}));
 const coord=c=>{const axisX=axesX.includes(String(c.axis_x))?String(c.axis_x):(axesX[0]||""),axisY=axesY.includes(String(c.axis_y))?String(c.axis_y):(axesY[0]||""),dx=num(c.offset_x_mm),dy=num(c.offset_y_mm);return{x:num(axisXPos.get(axisX))+dx,y:num(axisYPos.get(axisY))+dy,z0:num(c.z0_mm),z1:num(c.z1_mm||8400),axisX,axisY,dx,dy}};
 const columns=()=>records().map(c=>({...c,...coord(c)}));
 const selected=()=>columns().find(x=>x.id===selectedId)||null;
 const markOptions=(selectedMark,query="")=>{const q=String(query||"").trim().toLowerCase(),list=q?marks.filter(m=>`${m.mark||m.title||""} ${m.name||""}`.toLowerCase().includes(q)):marks;return list.length?list.map(m=>`<option value="${esc(m.id)}" ${String(selectedMark)===m.id?"selected":""}>${esc(markLabel(m))}</option>`).join(""):`<option value="">${marks.length?"Ничего не найдено":"Ведомость марок пустая"}</option>`};
 const axisOptions=(items,value)=>items.map(x=>`<option value="${esc(x)}" ${String(value)===x?"selected":""}>${esc(x)}</option>`).join("");
 const statusText=s=>s==="mounted"?"Смонтирована":"Не смонтирована";
 const spanSummary=spans=>{const min=Math.min(...spans),max=Math.max(...spans),avg=spans.reduce((s,x)=>s+x,0)/Math.max(1,spans.length);return max-min<=1?`≈ по ${fmt(avg)} мм`:"индивидуальные размеры"};
 const pairLabel=(items,i)=>`${items[i]}–${items[i+1]}`;
 function stats(){
  const cols=columns(),mounted=cols.filter(x=>x.status==="mounted").length;
  return{total:cols.length,mounted,left:cols.length-mounted,pct:cols.length?Math.round(mounted/cols.length*100):0}
 }
 function projection(cols){
  const W=1040,H=650,padX=105,padY=90,a=yaw*Math.PI/180,maxZ=Math.max(9,...cols.map(c=>Math.max(c.z0,c.z1)/1000));
  const raw=(xmm,ymm,zmm)=>{const x=(xmm-spanX/2)/1000,y=(ymm-spanY/2)/1000,z=zmm/1000,rx=x*Math.cos(a)-y*Math.sin(a),ry=x*Math.sin(a)+y*Math.cos(a);return{x:rx,y:ry*.48-z}};
  const samples=[],margin=12000;
  for(const x of [-margin,spanX+margin])for(const y of [-margin,spanY+margin]){samples.push(raw(x,y,0));samples.push(raw(x,y,maxZ*1000))}
  for(const c of cols){samples.push(raw(c.x,c.y,c.z0));samples.push(raw(c.x,c.y,c.z1))}
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
  const parts=[];if(c.dx)parts.push(`по 1–6: ${c.dx>=0?"+":"−"}${fmt(Math.abs(c.dx))} мм`);if(c.dy)parts.push(`по А–Л: ${c.dy>=0?"+":"−"}${fmt(Math.abs(c.dy))} мм`);return parts.join(" · ")
 }
 function columnTitle(c){
  const a=axisText(c),position=c.position||c.title||"Колонна",mark=c.mark||"—";
  return `${position} · ${mark}\nОси: ${a.x} / ${a.y}\nX: ${fmt(c.x)} мм · Y: ${fmt(c.y)} мм\nНиз: ${fmt(c.z0)} мм · Верх: ${fmt(c.z1)} мм${c.dx||c.dy?"\nСмещение: "+offsetText(c):""}`
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
   gridXSpans.forEach((dist,i)=>{const x1=axisXPos.get(axesX[i]),x2=axisXPos.get(axesX[i+1]),m=p((x1+x2)/2,-7600,0);out+=`<text x="${m.x}" y="${m.y}" class="scheme-3d-span-text">${pairLabel(axesX,i)} · ${fmt(dist)} мм</text>`});
   gridYSpans.forEach((dist,i)=>{const y1=axisYPos.get(axesY[i]),y2=axisYPos.get(axesY[i+1]),m=p(-7600,(y1+y2)/2,0);out+=`<text x="${m.x}" y="${m.y}" class="scheme-3d-span-text">${pairLabel(axesY,i)} · ${fmt(dist)} мм</text>`})
  }
  const d1=p(spanX/2,-10800,0),d2=p(-10800,spanY/2,0);
  out+=`<g class="scheme-3d-dim"><rect x="${d1.x-50}" y="${d1.y-11}" width="100" height="20" rx="5"/><text x="${d1.x}" y="${d1.y+3}">${esc(xName)}: ${fmt(spanX)} мм</text></g>`;
  out+=`<g class="scheme-3d-dim"><rect x="${d2.x-50}" y="${d2.y-11}" width="100" height="20" rx="5"/><text x="${d2.x}" y="${d2.y+3}">${esc(yName)}: ${fmt(spanY)} мм</text></g>`;
  return{html:out,p}
 }
 function prism(c,p,index){
  const base=p(c.x,c.y,c.z0),top=p(c.x,c.y,c.z1),w=3.6,h=2.6,isSelected=c.id===selectedId,sel=isSelected?" selected":"",status=c.status==="mounted"?" mounted":" planned",between=c.dx||c.dy?" between":"",a=axisText(c);
  const baseAxis=p(axisXPos.get(c.axisX),axisYPos.get(c.axisY),c.z0),showOffset=!!(c.dx||c.dy)&&(isSelected||dimensionsVisible),showLabel=isSelected||labelsVisible;
  const lw=isSelected?122:82,lh=isSelected?43:28,preferLeft=index%2===1,rawX=top.x+(preferLeft?-lw-13:13),lx=Math.max(8,Math.min(1040-lw-8,rawX)),ly=Math.max(8,Math.min(650-lh-8,top.y-22-(index%2)*6)),anchorX=preferLeft?lx+lw:lx;
  const offsetMid={x:(base.x+baseAxis.x)/2,y:(base.y+baseAxis.y)/2};
  return`<g class="scheme-column${status}${sel}${between}" data-column="${esc(c.id)}" tabindex="0">
   <title>${esc(columnTitle(c))}</title>
   ${showOffset?`<line x1="${baseAxis.x}" y1="${baseAxis.y}" x2="${base.x}" y2="${base.y}" class="scheme-offset-line"/><text x="${offsetMid.x}" y="${offsetMid.y-7}" class="scheme-offset-text">${esc(offsetText(c))}</text>`:""}
   <polygon points="${base.x-w},${base.y} ${base.x},${base.y-h} ${base.x+w},${base.y} ${top.x+w},${top.y} ${top.x},${top.y-h} ${top.x-w},${top.y}" class="scheme-column-body"/>
   <line x1="${base.x}" y1="${base.y-h}" x2="${top.x}" y2="${top.y-h}" class="scheme-column-edge"/>
   <circle cx="${top.x}" cy="${top.y-h}" r="4.5" class="scheme-column-top"/>
   ${showLabel?`<line x1="${top.x}" y1="${top.y-h}" x2="${anchorX}" y2="${ly+lh/2}" class="scheme-label-leader"/><g class="scheme-column-label${isSelected?" selected-label":" compact"}${showOffset?" offset":""}"><rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="6"/><text x="${lx+7}" y="${ly+12}" class="scheme-label-position">${esc(c.position||c.title||"Колонна")}</text><text x="${lx+7}" y="${ly+(isSelected?25:23)}" class="scheme-label-mark">${esc(c.mark||"—")}</text>${isSelected?`<text x="${lx+7}" y="${ly+37}" class="scheme-label-axis">${esc(a.x)} / ${esc(a.y)}</text>`:""}</g>`:""}
  </g>`
 }
 function planSvg(cols){
  const W=1040,H=650,padX=190,padY=98,availW=W-padX*2,availH=H-padY*2,scale=Math.min(availW/spanX,availH/spanY),gridW=spanX*scale,gridH=spanY*scale,left=(W-gridW)/2,top=(H-gridH)/2,xName=`${axesX[0]}–${axesX.at(-1)}`,yName=`${axesY[0]}–${axesY.at(-1)}`;
  const sx=x=>left+x*scale,sy=y=>top+y*scale;let svg="";
  svg+=`<rect x="${left}" y="${top}" width="${gridW}" height="${gridH}" class="scheme-grid-floor-plan"/><rect x="${left}" y="${top}" width="${gridW}" height="${gridH}" class="scheme-grid-outline-plan"/>`;
  axesX.forEach(a=>{const x=sx(axisXPos.get(a));svg+=`<line x1="${x}" y1="${top}" x2="${x}" y2="${top+gridH}" class="scheme-grid-line"/>${svgBubble(x,top-20,a)}${svgBubble(x,top+gridH+20,a)}`});
  axesY.forEach(a=>{const y=sy(axisYPos.get(a));svg+=`<line x1="${left}" y1="${y}" x2="${left+gridW}" y2="${y}" class="scheme-grid-line"/>${svgBubble(left-20,y,a)}${svgBubble(left+gridW+20,y,a)}`});
  if(dimensionsVisible){
   gridXSpans.forEach((dist,i)=>{const x1=sx(axisXPos.get(axesX[i])),x2=sx(axisXPos.get(axesX[i+1])),mx=(x1+x2)/2;svg+=`<line x1="${x1}" y1="${top-50}" x2="${x2}" y2="${top-50}" class="scheme-span-line"/><line x1="${x1}" y1="${top-54}" x2="${x1}" y2="${top-46}" class="scheme-span-tick"/><line x1="${x2}" y1="${top-54}" x2="${x2}" y2="${top-46}" class="scheme-span-tick"/><text x="${mx}" y="${top-59}" class="scheme-span-text">${fmt(dist)}</text>`});
   gridYSpans.forEach((dist,i)=>{const y1=sy(axisYPos.get(axesY[i])),y2=sy(axisYPos.get(axesY[i+1])),my=(y1+y2)/2;svg+=`<line x1="${left-54}" y1="${y1}" x2="${left-54}" y2="${y2}" class="scheme-span-line"/><line x1="${left-58}" y1="${y1}" x2="${left-50}" y2="${y1}" class="scheme-span-tick"/><line x1="${left-58}" y1="${y2}" x2="${left-50}" y2="${y2}" class="scheme-span-tick"/><text x="${left-65}" y="${my}" class="scheme-span-text scheme-span-y">${fmt(dist)}</text>`})
  }
  cols.forEach((c,index)=>{
   const x=sx(c.x),y=sy(c.y),axisX=sx(axisXPos.get(c.axisX)),axisY=sy(axisYPos.get(c.axisY)),isSelected=c.id===selectedId,sel=isSelected?" selected":"",status=c.status==="mounted"?" mounted":" planned",between=c.dx||c.dy?" between":"",a=axisText(c),showLabel=isSelected||labelsVisible,lw=isSelected?118:78,lh=isSelected?42:27,preferLeft=index%2===1,rawX=x+(preferLeft?-lw-10:10),lx=Math.max(6,Math.min(W-lw-6,rawX)),ly=Math.max(8,Math.min(H-lh-8,y-16-(index%2)*7)),anchorX=preferLeft?lx+lw:lx;
   const showOffset=!!(c.dx||c.dy)&&(isSelected||dimensionsVisible),baseX=axisX,baseY=axisY,midX=(x+baseX)/2,midY=(y+baseY)/2;
   svg+=`<g class="scheme-column${status}${sel}${between}" data-column="${esc(c.id)}" tabindex="0"><title>${esc(columnTitle(c))}</title>${showOffset?`<line x1="${baseX}" y1="${baseY}" x2="${x}" y2="${y}" class="scheme-offset-line"/><circle cx="${baseX}" cy="${baseY}" r="3" class="scheme-offset-origin"/><text x="${midX}" y="${midY-7}" class="scheme-offset-text">${esc(offsetText(c))}</text>`:""}<rect x="${x-6}" y="${y-6}" width="12" height="12" rx="2" class="scheme-plan-column"/><circle cx="${x}" cy="${y}" r="2.3" class="scheme-plan-dot"/>${showLabel?`<line x1="${x}" y1="${y}" x2="${anchorX}" y2="${ly+lh/2}" class="scheme-label-leader"/><g class="scheme-column-label${isSelected?" selected-label":" compact"}${showOffset?" offset":""}"><rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="6"/><text x="${lx+7}" y="${ly+12}" class="scheme-label-position">${esc(c.position||c.title||"Колонна")}</text><text x="${lx+7}" y="${ly+(isSelected?25:22)}" class="scheme-label-mark">${esc(c.mark||"—")}</text>${isSelected?`<text x="${lx+7}" y="${ly+36}" class="scheme-label-axis">${esc(a.x)} / ${esc(a.y)}</text>`:""}</g>`:""}</g>`;
  });
  svg+=`<line x1="${left}" y1="${top+gridH+52}" x2="${left+gridW}" y2="${top+gridH+52}" class="scheme-dim-line"/><text x="${W/2}" y="${top+gridH+71}" class="scheme-dim-text">${esc(xName)} = ${fmt(spanX)} мм</text>`;
  svg+=`<line x1="${left+gridW+54}" y1="${top}" x2="${left+gridW+54}" y2="${top+gridH}" class="scheme-dim-line"/><text x="${left+gridW+79}" y="${H/2}" class="scheme-dim-text scheme-dim-vertical">${esc(yName)} = ${fmt(spanY)} мм</text>`;
  return svg
 }
 function renderScene(){
  const box=document.getElementById("schemeCanvas");if(!box)return;const cols=columns(),xName=`${axesX[0]}–${axesX.at(-1)}`,yName=`${axesY[0]}–${axesY.at(-1)}`,meta=`<div class="scheme-grid-meta"><b>${fmt(spanX)} × ${fmt(spanY)} мм</b><span>${esc(xName)}: ${axesX.length} осей</span><span>${esc(yName)}: ${axesY.length} осей</span><small>Нажмите колонну — подробности появятся справа</small></div>`;
  if(mode==="3d"){const g=grid3d(cols);box.innerHTML=`${meta}<svg viewBox="0 0 1040 650" aria-label="3D монтажная схема"><g>${g.html}${cols.map((c,i)=>prism(c,g.p,i)).join("")}</g><text x="520" y="626" class="scheme-demo-note" text-anchor="middle">${labelsVisible?"Подписи включены":"Подписи скрыты — выберите колонну для просмотра"} · ${dimensionsVisible?"Размеры пролётов включены":"Размеры пролётов скрыты"}</text></svg>`}
  else box.innerHTML=`${meta}<svg viewBox="0 0 1040 650" aria-label="План монтажной схемы">${planSvg(cols)}<text x="520" y="626" class="scheme-demo-note" text-anchor="middle">${labelsVisible?"Подписи включены":"Подписи скрыты — выберите колонну для просмотра"} · масштаб X/Y одинаковый</text></svg>`;
  box.querySelectorAll("[data-column]").forEach(el=>{const pick=()=>{selectedId=el.dataset.column;renderScene();renderDetails()};el.onclick=pick;el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pick()}}})
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
 let gridDraft=null;
 const yAlphabet=["А","Б","В","Г","Д","Е","Ж","З","И","К","Л","М","Н","П","Р","С","Т","У","Ф","Х","Ц","Ч","Ш","Щ","Э","Ю","Я"];
 function nextAxisLabel(key,items){
  if(key==="x"){const nums=items.map(x=>Number(x)).filter(Number.isFinite);return String((nums.length?Math.max(...nums):items.length)+1)}
  return yAlphabet.find(x=>!items.includes(x))||`Ось ${items.length+1}`
 }
 function gridDirectionHtml(key){
  const isX=key==="x",items=isX?gridDraft.axesX:gridDraft.axesY,spans=isX?gridDraft.spansX:gridDraft.spansY,size=isX?gridDraft.sizeX:gridDraft.sizeY,title=`${items[0]}–${items.at(-1)}`;
  return`<section data-grid-section="${key}">
   <div class="scheme-grid-config-head"><div><b>Направление ${esc(title)}</b><span>${items.length} осей · ${spans.length} пролётов</span></div><button type="button" data-grid-equal="${key}">Распределить равномерно</button></div>
   <label class="scheme-grid-size"><span>Общий размер</span><input type="text" inputmode="decimal" data-grid-size="${key}" value="${esc(fmt(size))}"><small>мм</small></label>
   <div class="scheme-grid-axis-title"><span>Оси</span><small>Название оси можно изменить</small></div>
   <div class="scheme-axis-list">${items.map((axis,i)=>`<div class="scheme-axis-item"><input type="text" data-grid-axis="${key}" data-index="${i}" value="${esc(axis)}"><button type="button" data-grid-remove-axis="${key}" data-index="${i}" ${items.length<=2?"disabled":""} title="Удалить ось">×</button></div>`).join("")}<button type="button" class="scheme-add-axis" data-grid-add-axis="${key}">＋ Добавить ось</button></div>
   <div class="scheme-grid-axis-title"><span>Пролёты</span><small>Расстояние между соседними осями</small></div>
   <div class="scheme-grid-spans">${spans.map((value,i)=>`<label><span>${esc(pairLabel(items,i))}</span><input type="text" inputmode="decimal" data-grid-span="${key}" data-index="${i}" value="${esc(fmt(value))}"><small>мм</small></label>`).join("")}</div>
   <div class="scheme-grid-total" id="schemeGridTotal${isX?"X":"Y"}"></div>
  </section>`
 }
 function gridEditorHtml(){
  return`<dialog id="schemeGridEditor" class="scheme-grid-editor"><form id="schemeGridForm" novalidate><div class="scheme-editor-head"><div><h2>Параметры сетки</h2><p>Добавляйте и удаляйте оси, меняйте их названия, пролёты и общий размер сетки.</p></div><button type="button" id="schemeGridX">×</button></div>
   <div class="scheme-grid-warning">Колонны остаются привязаны к своим осям. Используемую колоннами ось удалить нельзя, но её можно переименовать — привязки обновятся автоматически.</div>
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
  body.querySelectorAll("[data-grid-axis]").forEach(el=>el.oninput=()=>{const key=el.dataset.gridAxis,i=Number(el.dataset.index),items=key==="x"?gridDraft.axesX:gridDraft.axesY;items[i]=el.value.trim();renderGridEditor()});
  body.querySelectorAll("[data-grid-span]").forEach(el=>el.oninput=()=>{const key=el.dataset.gridSpan,i=Number(el.dataset.index),spans=key==="x"?gridDraft.spansX:gridDraft.spansY;spans[i]=num(el.value);refreshGridEditor()});
  body.querySelectorAll("[data-grid-size]").forEach(el=>el.oninput=()=>{if(el.dataset.gridSize==="x")gridDraft.sizeX=num(el.value);else gridDraft.sizeY=num(el.value);refreshGridEditor()});
  body.querySelectorAll("[data-grid-equal]").forEach(btn=>btn.onclick=()=>{const key=btn.dataset.gridEqual,count=(key==="x"?gridDraft.axesX:gridDraft.axesY).length-1,total=key==="x"?gridDraft.sizeX:gridDraft.sizeY,vals=equalSpans(total,count);if(key==="x")gridDraft.spansX=vals;else gridDraft.spansY=vals;renderGridEditor()});
  body.querySelectorAll("[data-grid-add-axis]").forEach(btn=>btn.onclick=()=>{const key=btn.dataset.gridAddAxis,items=key==="x"?gridDraft.axesX:gridDraft.axesY,sources=key==="x"?gridDraft.sourceX:gridDraft.sourceY,spans=key==="x"?gridDraft.spansX:gridDraft.spansY,sizeKey=key==="x"?"sizeX":"sizeY",suggested=Math.max(1,Math.round(spans.length?spans.reduce((s,x)=>s+num(x),0)/spans.length:6000));items.push(nextAxisLabel(key,items));sources.push(null);spans.push(suggested);gridDraft[sizeKey]+=suggested;renderGridEditor()});
  body.querySelectorAll("[data-grid-remove-axis]").forEach(btn=>btn.onclick=()=>{const key=btn.dataset.gridRemoveAxis,i=Number(btn.dataset.index),items=key==="x"?gridDraft.axesX:gridDraft.axesY,sources=key==="x"?gridDraft.sourceX:gridDraft.sourceY,spans=key==="x"?gridDraft.spansX:gridDraft.spansY,sizeKey=key==="x"?"sizeX":"sizeY";if(items.length<=2)return;const source=sources[i],used=source&&records().some(r=>String(key==="x"?r.axis_x:r.axis_y)===String(source));if(used){showGridError(`Ось «${source}» используется колоннами. Сначала перенесите эти колонны на другую ось.`);return}showGridError("");if(i===0){gridDraft[sizeKey]-=num(spans.shift());items.shift();sources.shift()}else if(i===items.length-1){gridDraft[sizeKey]-=num(spans.pop());items.pop();sources.pop()}else{spans[i-1]=num(spans[i-1])+num(spans[i]);spans.splice(i,1);items.splice(i,1);sources.splice(i,1)}renderGridEditor()});
  refreshGridEditor()
 }
 function openGridEditor(){
  const d=document.getElementById("schemeGridEditor");if(!d)return;gridDraft={axesX:[...axesX],axesY:[...axesY],sourceX:[...axesX],sourceY:[...axesY],spansX:[...gridXSpans],spansY:[...gridYSpans],sizeX:targetSpanX,sizeY:targetSpanY};showGridError("");renderGridEditor();d.showModal()
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
   for(const row of arr(rows).filter(r=>r.record_type==="scheme_column"||r.data?.entity_type==="column")){const d0=row.data||{},nx=mapX.get(String(d0.axis_x||""))||String(d0.axis_x||""),ny=mapY.get(String(d0.axis_y||""))||String(d0.axis_y||"");if(nx!==String(d0.axis_x||"")||ny!==String(d0.axis_y||""))await schemeApi.update(row.id,{record_type:row.record_type||"scheme_column",title:row.title||d0.position||"Колонна",data:{...d0,axis_x:nx,axis_y:ny}})}
   const existing=gridRecord(),payload={record_type:"scheme_grid",title:"Сетка осей",data:{entity_type:"grid",axes_x:ax,axes_y:ay,x_spans_mm:xs,y_spans_mm:ys,span_x_mm:gridDraft.sizeX,span_y_mm:gridDraft.sizeY}};if(existing)await schemeApi.update(existing.id,payload);else await schemeApi.create(payload);rows=await schemeApi.list().catch(()=>rows);refreshGridModel();d.close();gridDraft=null;draw()}
 }
 function editorHtml(){
  return`<dialog id="schemeEditor" class="scheme-editor"><form id="schemeForm" novalidate><input type="hidden" name="id"><div class="scheme-editor-head"><div><h2 id="schemeEditorTitle">Добавить колонну</h2><p>Укажите марку и точное положение относительно осей.</p></div><button type="button" id="schemeEditorX">×</button></div>
   <div class="scheme-form-grid">
    <label class="wide scheme-mark-field">Марка из ведомости<div class="scheme-mark-search"><input id="schemeMarkSearch" type="search" autocomplete="off" placeholder="Поиск по марке или наименованию…"><span id="schemeMarkCount"></span></div><select name="mark_id" ${marks.length?"required":"disabled"}>${markOptions("")}</select></label>
    <label>Позиция / обозначение<input name="position" required placeholder="Например: К1-01"></label>
    <label>Статус<select name="status"><option value="planned">Не смонтирована</option><option value="mounted">Смонтирована</option></select></label>
    <div class="scheme-form-axis"><b>Направление ${esc(axesX[0])}–${esc(axesX.at(-1))}</b><label>Базовая ось<select name="axis_x">${axisOptions(axesX,axesX[0])}</select></label><label>Смещение, мм<input name="offset_x_mm" inputmode="decimal" value="0"></label></div>
    <div class="scheme-form-axis"><b>Направление ${esc(axesY[0])}–${esc(axesY.at(-1))}</b><label>Базовая ось<select name="axis_y">${axisOptions(axesY,axesY[0])}</select></label><label>Смещение, мм<input name="offset_y_mm" inputmode="decimal" value="0"></label></div>
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
  f.elements.status.value=c?.status||"planned";f.elements.axis_x.value=c?.axis_x||axesX[0]||"";f.elements.axis_y.value=c?.axis_y||axesY[0]||"";
  f.elements.offset_x_mm.value=c?.offset_x_mm??0;f.elements.offset_y_mm.value=c?.offset_y_mm??0;f.elements.z0_mm.value=c?.z0_mm??0;f.elements.z1_mm.value=c?.z1_mm??8400;f.elements.rotation_deg.value=c?.rotation_deg??0;
  if(!c&&marks.length){const m=marks.find(x=>x.id===currentMark),base=String(m?.mark||m?.title||"К").trim()||"К",used=new Set(columns().map(x=>String(x.position||x.title)));let n=1,name="";do{name=`${base}-${String(n++).padStart(2,"0")}`}while(used.has(name));f.elements.position.value=name}
  const refreshPreview=()=>{const ax=f.elements.axis_x.value,ay=f.elements.axis_y.value,dx=num(f.elements.offset_x_mm.value),dy=num(f.elements.offset_y_mm.value),x=num(axisXPos.get(ax))+dx,y=num(axisYPos.get(ay))+dy;document.getElementById("schemeCoordPreview").innerHTML=`<span>Точная координата</span><b>X = ${fmt(x)} мм · Y = ${fmt(y)} мм</b><small>${ax}${dx?` ${dx>=0?"+":"−"} ${fmt(Math.abs(dx))} мм`:""} / ${ay}${dy?` ${dy>=0?"+":"−"} ${fmt(Math.abs(dy))} мм`:""}</small>`};
  ["axis_x","axis_y","offset_x_mm","offset_y_mm"].forEach(n=>f.elements[n].addEventListener("input",refreshPreview));refreshPreview();d.showModal()
 }
 function bindEditor(){
  if(!canEdit())return;const d=document.getElementById("schemeEditor"),f=document.getElementById("schemeForm"),err=document.getElementById("schemeFormError");
  document.getElementById("schemeAdd")?.addEventListener("click",()=>openEditor());document.getElementById("schemeEditorX").onclick=()=>d.close();document.getElementById("schemeEditorCancel").onclick=()=>d.close();
  f.onsubmit=async e=>{e.preventDefault();err.hidden=true;if(!marks.length){err.textContent="Сначала добавьте марки колонн в ведомость марок.";err.hidden=false;return}const fd=new FormData(f),id=String(fd.get("id")||""),markId=String(fd.get("mark_id")||""),m=marks.find(x=>x.id===markId),position=String(fd.get("position")||"").trim(),axisX=String(fd.get("axis_x")||axesX[0]||""),axisY=String(fd.get("axis_y")||axesY[0]||""),dx=num(fd.get("offset_x_mm")),dy=num(fd.get("offset_y_mm")),z0=num(fd.get("z0_mm")),z1=num(fd.get("z1_mm")),rot=num(fd.get("rotation_deg")),status=String(fd.get("status")||"planned");if(!m||!position){err.textContent="Выберите марку и укажите обозначение колонны.";err.hidden=false;return}if(z1<=z0){err.textContent="Отметка верха должна быть выше отметки низа.";err.hidden=false;return}if(columns().some(x=>x.id!==id&&String(x.position||x.title).trim().toLowerCase()===position.toLowerCase())){err.textContent="Колонна с таким обозначением уже есть на схеме.";err.hidden=false;return}const payload={record_type:"scheme_column",title:position,data:{entity_type:"column",position,mark_id:m.id,mark:m.mark||m.title||"",mark_name:m.name||"",work_type_id:m.work_type_id||"",axis_x:axisX,axis_y:axisY,offset_x_mm:dx,offset_y_mm:dy,z0_mm:z0,z1_mm:z1,rotation_deg:rot,status}};let saved;if(id){saved=await schemeApi.update(id,payload)}else saved=await schemeApi.create(payload);rows=await schemeApi.list().catch(()=>rows);selectedId=String(saved?.id||id||records().at(-1)?.id||"");d.close();draw()}
 }
 function draw(){
  const s=stats();
  app.innerHTML=`<div class="scheme-page">
   <div class="scheme-head"><button class="back" id="schemeBack">← Назад</button><div><h1>Монтажная схема</h1><p>${esc(object.name||"")} · колонны</p></div><div class="scheme-head-actions"><div class="scheme-view-switch"><button data-mode="plan" class="${mode==="plan"?"on":""}">План</button><button data-mode="3d" class="${mode==="3d"?"on":""}">3D</button></div>${canEdit()?'<button type="button" class="scheme-grid-button" id="schemeGridConfig">⚙ Параметры сетки</button><button type="button" class="primary" id="schemeAdd">＋ Добавить колонну</button>':""}</div></div>
   <div class="scheme-summary">
    <div><span>Оси ${esc(axesX[0])}–${esc(axesX.at(-1))}</span><b>${fmt(spanX)} мм</b><small>${axesX.length} осей · ${gridXSpans.length} пролётов · ${spanSummary(gridXSpans)}</small></div>
    <div><span>Оси ${esc(axesY[0])}–${esc(axesY.at(-1))}</span><b>${fmt(spanY)} мм</b><small>${axesY.length} осей · ${gridYSpans.length} пролётов · ${spanSummary(gridYSpans)}</small></div>
    <div><span>Колонн на схеме</span><b>${s.total}</b><small>Задаются вручную</small></div>
    <div><span>Смонтировано</span><b>${s.mounted} / ${s.total}</b><small>${s.pct}%</small></div>
   </div>
   <div class="scheme-workspace">
    <section class="scheme-stage">
     <div class="scheme-stage-toolbar">
      <div class="scheme-legend"><span><i class="mounted"></i>Смонтировано</span><span><i class="planned"></i>Не смонтировано</span><span><i class="between"></i>Со смещением от оси</span></div>
      <div class="scheme-toolbar-actions"><button type="button" id="schemeToggleLabels" class="${labelsVisible?"on":""}">Подписи</button><button type="button" id="schemeToggleDimensions" class="${dimensionsVisible?"on":""}">Размеры</button><div class="scheme-rotate" ${mode==="plan"?"hidden":""}><button id="schemeLeft">↶</button><button id="schemeReset">Центр</button><button id="schemeRight">↷</button></div></div>
     </div>
     <div class="scheme-canvas" id="schemeCanvas"></div>
     ${s.total?"":'<div class="scheme-empty-overlay"><b>Схема пока пустая</b><span>Нажмите «Добавить колонну» и задайте её марку, оси и смещение.</span></div>'}
    </section>
    <aside class="scheme-details" id="schemeDetails"></aside>
   </div>
   <div class="scheme-hint"><b>Сетка:</b><span><strong>${esc(axesX[0])}–${esc(axesX.at(-1))} = ${fmt(spanX)} мм</strong>, <strong>${esc(axesY[0])}–${esc(axesY.at(-1))} = ${fmt(spanY)} мм</strong>. Подписи и межосевые размеры можно включать только когда они нужны, чтобы схема не превращалась в кашу.</span></div>
   ${canEdit()?gridEditorHtml()+editorHtml():""}
  </div>`;
  document.getElementById("schemeBack").onclick=()=>location.hash=`/objects/object/${oid}`;document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{mode=b.dataset.mode;draw()});
  document.getElementById("schemeToggleLabels")?.addEventListener("click",()=>{labelsVisible=!labelsVisible;draw()});document.getElementById("schemeToggleDimensions")?.addEventListener("click",()=>{dimensionsVisible=!dimensionsVisible;draw()});
  document.getElementById("schemeLeft")?.addEventListener("click",()=>{yaw-=10;renderScene()});document.getElementById("schemeRight")?.addEventListener("click",()=>{yaw+=10;renderScene()});document.getElementById("schemeReset")?.addEventListener("click",()=>{yaw=-34;renderScene()});
  renderScene();renderDetails();bindGridEditor();bindEditor()
 }
 draw();
};