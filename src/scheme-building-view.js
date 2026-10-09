"use strict";
/*
 * Unified building 3D viewer for IR Project.
 * All construction members are derived exclusively from existing scheme records.
 * The faint roof and outline are visual guides, never persisted as building marks.
 * 2D canvas projection: offline, no dependencies or database access.
 */
window.irBuildingView=(()=>{
 const state={yaw:-.75,pitch:.60,zoom:1,panX:0,panY:0,preset:"iso",grid:true,roof:true,placing:false,mark:"",start:null,end:null,hover:"",selected:"",layersOpen:false};
 let observer=null,paint=null;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const html=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const pt=(x,y,z)=>({x:Number(x)||0,y:Number(y)||0,z:Number(z)||0});
 const num=v=>Number(v)||0;
 const fmt=n=>Math.round(n).toLocaleString("ru-RU");
 const dist=(q,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((q.x-a.x)*dx+(q.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(q.x-(a.x+dx*t),q.y-(a.y+dy*t))};
 function render(host,props){
  if(observer){observer.disconnect();observer=null}
  const axesX=props.axesX,axesY=props.axesY,spanX=props.spanX,spanY=props.spanY,
   gridX=props.gridX,gridY=props.gridY,cols=props.elements,marks=props.marks,groups=props.groups;
  const markById=id=>marks.find(m=>String(m.id)===String(id));
  const selectedMark=()=>markById(state.mark);
  const leftMark=()=>marks.filter(m=>m.left>0);
  if(!markById(state.mark)||selectedMark()?.left<=0)state.mark=leftMark()[0]?.id||"";
  const header='<div class="irb-panel-head"><b>Слои модели</b><small>ПО ТИПАМ</small></div>';
  host.innerHTML='<div class="irb-wrap"><aside class="irb-layers">'+header+
   '<div class="irb-layer-list">'+groups.map(g=>'<button type="button" class="irb-layer '+(g.visible?'active':'')+'" data-irb-layer="'+html(g.key)+'"><i>'+(g.visible?'✓':'')+'</i><b>'+html(g.label)+'</b><small>'+g.count+'</small></button>').join("")+'</div>'+
   '<div class="irb-panel-head"><b>Отображение</b></div>'+
   '<label class="irb-switch"><input type="checkbox" id="irbGrid" '+(state.grid?'checked':'')+'> Сетка осей</label>'+
   '<label class="irb-switch"><input type="checkbox" id="irbRoof" '+(state.roof?'checked':'')+'> Контур кровли (эскиз)</label>'+
   '<div class="irb-info">Голубой пунктир — условный контур здания. Цветные конструкции — ваши размещённые марки. Проектные формы уточняются по КМ/КМД.</div>'+
   '<div class="irb-count"><span>В текущем виде работ</span><strong>'+cols.length+'</strong><small>Размещённых элементов</small></div>'+
   (props.canEdit?'<button type="button" class="irb-add" id="irbStart">＋ Разместить марку</button>':'')+
   '</aside><div class="irb-viewport">'+
   '<canvas id="irbCanvas" aria-label="3D-модель каркаса здания"></canvas>'+
   '<div class="irb-tags"><span>● Общая модель здания</span><span>'+fmt(spanX/1000)+' × '+fmt(spanY/1000)+' м · '+axesX.length+' × '+axesY.length+' осей</span></div>'+
   '<label class="irb-camera">Вид <select id="irbView"><option value="iso">Изометрия</option><option value="top">Сверху</option><option value="front">Фасад</option><option value="side">Сбоку</option></select></label>'+
   '<div class="irb-hint" id="irbHint"></div>'+
   '<div class="irb-bottom"><div class="irb-legend"><i class="green"></i> Смонтировано <i class="red"></i> Не смонтировано <i class="orange"></i> Частично <i class="blue"></i> Выбрано</div>'+
   '<div class="irb-controls"><button type="button" id="irbMinus">−</button><button type="button" id="irbPlus">＋</button><button type="button" id="irbFit">⛶</button></div></div>'+
   '</div><aside class="irb-properties" id="irbProperties"></aside></div>';
  // The panels float over one full-size viewport rather than defining its dimensions.
  const shell=host.querySelector(".irb-wrap"),viewport=host.querySelector(".irb-viewport"),
   layerPanel=host.querySelector(".irb-layers"),detailPanel=host.querySelector(".irb-properties");
  shell.classList.add("irb-immersive");
  viewport.prepend(layerPanel,detailPanel);
  const topControls=document.createElement("div");
  topControls.className="irb-top-actions";
  topControls.innerHTML='<button type="button" id="irbLayerToggle" aria-expanded="'+(state.layersOpen?'true':'false')+'">☷ Слои</button>'+
   (props.canEdit?'<button type="button" id="irbQuickAdd" class="irb-top-add">＋ Добавить марку</button>':'');
  viewport.appendChild(topControls);
  const layerClose=document.createElement("button");layerClose.type="button";
  layerClose.className="irb-pane-close";layerClose.textContent="×";layerClose.title="Скрыть слои";
  layerClose.setAttribute("aria-label","Закрыть панель слоёв");
  layerPanel.prepend(layerClose);
  const updateLayers=()=>{
   layerPanel.hidden=!state.layersOpen;
   topControls.querySelector("#irbLayerToggle")?.setAttribute("aria-expanded",state.layersOpen?"true":"false");
  };
  layerClose.onclick=()=>{state.layersOpen=false;updateLayers()};
  topControls.querySelector("#irbLayerToggle").onclick=()=>{state.layersOpen=!state.layersOpen;updateLayers()};
  updateLayers();detailPanel.hidden=true;
  const el=id=>host.querySelector("#"+id),canvas=el("irbCanvas"),ctx=canvas.getContext("2d");
  if(!ctx){el("irbProperties").textContent="3D Canvas недоступен";return}
  const maxZ=Math.max(7000,8400,...cols.map(c=>Math.max(num(c.z0),num(c.z2))),1);
  const projectFactory=()=>{
   const rect=canvas.getBoundingClientRect(),w=Math.max(260,rect.width),h=Math.max(320,rect.height);
   const raw=point=>{
    const x=(point.x-spanX/2)/1000,y=(point.y-spanY/2)/1000,z=(point.z-maxZ/2)/1000;
    const co=Math.cos(state.yaw),si=Math.sin(state.yaw),sp=Math.sin(state.pitch),cp=Math.cos(state.pitch),r=x*si+y*co;
    return {x:x*co-y*si,y:r*sp-z*cp,depth:r*cp+z*sp};
   };
   const vertices=[];for(const x of [0,spanX])for(const y of [0,spanY])for(const z of [0,maxZ*1.23])vertices.push(raw(pt(x,y,z)));
   const minX=Math.min(...vertices.map(p=>p.x)),maxX=Math.max(...vertices.map(p=>p.x)),
    minY=Math.min(...vertices.map(p=>p.y)),maxY=Math.max(...vertices.map(p=>p.y));
   const scale=Math.min((w-100)/Math.max(1,maxX-minX),(h-118)/Math.max(1,maxY-minY))*state.zoom;
   const project=point=>{const v=raw(point);return{x:w/2+state.panX+(v.x-(minX+maxX)/2)*scale,y:h/2+state.panY+(v.y-(minY+maxY)/2)*scale,depth:v.depth}};
   return {w,h,raw,project};
  };
  const pickGeometry=()=>selectedMark()?.geometry||"column";
  const anchorZ=()=>pickGeometry()==="column"?0:maxZ*.94;
  const originAxis=(m,a)=>num(m[a]);
  const anchorPoint=(a,z=a?.z??anchorZ())=>pt(
   Number.isFinite(Number(a?.worldX))?Number(a.worldX):originAxis(gridX,a.x),
   Number.isFinite(Number(a?.worldY))?Number(a.worldY):originAxis(gridY,a.y),z);
  // Independent column-head anchors retain exact X, Y and elevation, even
  // for columns located between grid axes or having different heights.
  const gridAnchors=()=>axesX.flatMap(x=>axesY.map(y=>({
   kind:"grid",x,y,worldX:originAxis(gridX,x),worldY:originAxis(gridY,y),z:anchorZ()
  })));
  const closest=(axes,map,value)=>axes.reduce((best,a)=>
   Math.abs(originAxis(map,a)-value)<Math.abs(originAxis(map,best)-value)?a:best,axes[0]);
  const columnAnchors=()=>cols.filter(c=>c.geometryType==="column").map(c=>{
   const x=axesX.includes(String(c.axisX))?String(c.axisX):closest(axesX,gridX,num(c.x));
   const y=axesY.includes(String(c.axisY))?String(c.axisY):closest(axesY,gridY,num(c.y));
   return {kind:"column",columnId:String(c.id),label:String(c.mark||"Колонна"),
    x,y,worldX:num(c.x),worldY:num(c.y),z:num(c.z2)}
  });
  const availableAnchors=()=>pickGeometry()==="column"?gridAnchors():[...gridAnchors(),...columnAnchors()];
  const sameAnchor=(a,b)=>Boolean(a&&b&&Math.hypot(num(a.worldX)-num(b.worldX),num(a.worldY)-num(b.worldY),num(a.z)-num(b.z))<1);
  const memberSegments=()=>cols.map(c=>{
    const start=pt(c.x,c.y,c.z0),end=pt(c.geometryType==="column"?c.x:c.x2,c.geometryType==="column"?c.y:c.y2,c.z2);
    return {c,start,end};
  });
  const paintLabel=(p,label,border)=>{ctx.font="700 10px Segoe UI,Arial";const w=Math.max(24,ctx.measureText(label).width+15);ctx.fillStyle="#fff";ctx.strokeStyle=border;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(p.x-w/2,p.y-25,w,20,5);ctx.fill();ctx.stroke();ctx.fillStyle="#24649a";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(label,p.x,p.y-15)};
  const line=(a,b,color,width=1,dash=[])=>{ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.setLineDash(dash);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();ctx.setLineDash([])};
  const circle=(p,r,color)=>{ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill()};
  const outline=(m)=>{
   const p=m.project;
   const floor=[p(pt(0,0,0)),p(pt(spanX,0,0)),p(pt(spanX,spanY,0)),p(pt(0,spanY,0))];
   if(state.grid){
    ctx.fillStyle="rgba(217,233,249,.27)";ctx.strokeStyle="rgba(146,182,215,.52)";ctx.lineWidth=1;ctx.beginPath();floor.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fill();ctx.stroke();
    for(const ax of axesX){const x=originAxis(gridX,ax);line(p(pt(x,0,0)),p(pt(x,spanY,0)),"#d1e0ed",.8,[3,4]);paintLabel(p(pt(x,-Math.max(1000,spanY*.03),0)),ax,"#c8d8e8")}
    for(const ay of axesY){const y=originAxis(gridY,ay);line(p(pt(0,y,0)),p(pt(spanX,y,0)),"#d1e0ed",.8,[3,4]);paintLabel(p(pt(-Math.max(1000,spanX*.03),y,0)),ay,"#c8d8e8")}
   }
   if(state.roof){
    const roof=y=>maxZ*.94+Math.min(2200,maxZ*.17)*(1-Math.abs(y-spanY/2)/Math.max(1,spanY/2));
    const rf=(x,y)=>p(pt(x,y,roof(y)));
    for(const y of [0,spanY/2,spanY])line(rf(0,y),rf(spanX,y),"rgba(92,154,203,.48)",1.15,[5,5]);
    for(const ax of axesX){const x=originAxis(gridX,ax);line(rf(x,0),rf(x,spanY/2),"rgba(107,156,200,.37)",1,[4,6]);line(rf(x,spanY/2),rf(x,spanY),"rgba(107,156,200,.37)",1,[4,6])}
    for(const x of [0,spanX])for(const y of [0,spanY])line(p(pt(x,y,0)),rf(x,y),"rgba(104,155,200,.28)",1,[5,6]);
   }
  };
  paint=()=>{
   const rect=canvas.getBoundingClientRect();if(rect.width<2||rect.height<2)return;
   const dpr=Math.min(2,window.devicePixelRatio||1),w=Math.floor(rect.width*dpr),h=Math.floor(rect.height*dpr);
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);ctx.lineJoin="round";ctx.lineCap="round";
   const m=projectFactory();outline(m);
   const segments=memberSegments().map(s=>({...s,a:m.project(s.start),b:m.project(s.end),depth:(m.raw(s.start).depth+m.raw(s.end).depth)/2})).sort((a,b)=>a.depth-b.depth);
   for(const s of segments){
    const chosen=String(s.c.id)===String(state.selected),hover=String(s.c.id)===String(state.hover),
     color=chosen?"#2879df":hover?"#168fca":s.c.status==="mounted"?"#2e9b7b":s.c.status==="partial"?"#c4a051":"#c16670";
    const width=s.c.geometryType==="column"?7:s.c.geometryType==="truss"?6:s.c.geometryType==="brace"?3.7:4.8;
    line(s.a,s.b,"rgba(35,63,87,.25)",width+2);line(s.a,s.b,color,width);
    line({x:s.a.x-1.15,y:s.a.y-1.15},{x:s.b.x-1.15,y:s.b.y-1.15},"rgba(255,255,255,.5)",Math.max(1,width*.25));
    if(s.c.geometryType==="truss"){
     const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,len=Math.max(1,Math.hypot(dx,dy)),ox=-dy/len*6,oy=dx/len*6;
     line({x:s.a.x+ox,y:s.a.y+oy},{x:s.b.x+ox,y:s.b.y+oy},color,2.5);
     const steps=Math.max(2,Math.min(9,Math.round(len/35)));
     for(let i=0;i<steps;i++)line({x:s.a.x+dx*i/steps,y:s.a.y+dy*i/steps},{x:s.a.x+dx*(i+1)/steps+ox*(i%2),y:s.a.y+dy*(i+1)/steps+oy*(i%2)},color,1.2);
    }
    if(chosen||props.showLabels&&segments.length<120)paintLabel({x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2},String(s.c.mark||"?"),chosen?"#2c85e9":"#c7d9e9");
   }
   if(state.placing){
    // Free grid nodes are small; real column heads are prominent blue points.
    for(const a of gridAnchors()){
     const q=m.project(anchorPoint(a)),selected=sameAnchor(a,state.start)||sameAnchor(a,state.end);
     circle(q,selected?5.8:2.7,selected?"#ed9a2b":"rgba(88,143,194,.62)");
    }
    if(pickGeometry()!=="column")for(const a of columnAnchors()){
     const q=m.project(anchorPoint(a)),selected=sameAnchor(a,state.start)||sameAnchor(a,state.end);
     circle(q,selected?8.5:6.2,"#fff");
     circle(q,selected?6.2:4.5,selected?"#ee9a25":"#217ce7");
    }
    if(state.start){
     const a=m.project(anchorPoint(state.start));
     const b=m.project(pickGeometry()==="column"?anchorPoint(state.start,maxZ*.94):state.end?anchorPoint(state.end):anchorPoint(state.start));
     line(a,b,"#e5982e",4,[7,4]);
     circle(a,5.8,"#e5982e");if(state.end)circle(b,5.8,"#e5982e");
    }
   };
  };
  const nearestMember=(x,y)=>{
   const m=projectFactory(),point={x,y};let best=null,distance=14;
   for(const s of memberSegments()){const d=dist(point,m.project(s.start),m.project(s.end));if(d<distance){distance=d;best=s.c}}return best;
  };
  const nearestAxis=(x,y)=>{
   const m=projectFactory();let best=null,minScore=18;
   for(const a of availableAnchors()){
    const q=m.project(anchorPoint(a)),d=Math.hypot(q.x-x,q.y-y);
    if(d>19)continue;
    const score=d-(a.kind==="column"?3:0);
    if(score<minScore){minScore=score;best=a}
   }
   return best;
  };
  const position=a=>a?html((a.kind==="column"?a.label+" · верх колонны · ":"Ось ")+a.x+" / "+a.y+
   " · Z "+fmt(a.z)+" мм"+(a.kind==="column"?"":" (сетка)")):"Выберите точку на модели";
  function refreshPanel(){
   const m=selectedMark(),left=num(m?.left),column=m?.geometry==="column",available=left>0;
   el("irbHint").textContent=state.placing?(!state.start?"Выберите начальную точку":column||state.end?"Точки заданы — продолжайте в редакторе":"Выберите конечную точку"):"ЛКМ — вращение · колесо — масштаб · нажатие на элемент — свойства";
   const pane=el("irbProperties");
   const current=cols.find(c=>String(c.id)===String(state.selected));
   pane.hidden=!state.placing&&!current;
   if(state.placing){
    pane.innerHTML='<div class="irb-panel-head"><b>Размещение элемента</b><small>НОВАЯ МАРКА</small></div>'+
    '<label class="irb-field">Марка из ведомости<select id="irbMark"><option value="">Выберите марку</option>'+
    marks.map(a=>'<option value="'+html(a.id)+'" '+(a.left>0?'':'disabled')+' '+(a.id===state.mark?'selected':'')+'>'+html(a.title)+' · остаток '+a.left+(a.left?'':' · НЕТ ОСТАТКА')+'</option>').join("")+'</select></label>'+
    '<div class="irb-quota">По ведомости: '+num(m?.total)+' шт.<br>На схеме: '+num(m?.placed)+' шт.<br><b>Осталось: '+left+' шт.</b></div>'+
    '<div class="irb-anchor"><b>1. Начало</b><span>'+position(state.start)+'</span></div>'+
    '<div class="irb-anchor"><b>2. '+(column?"Колонна":"Конец")+'</b><span>'+(column?"Вертикально":position(state.end))+'</span></div>'+
    '<p class="irb-help">Синие точки с белой окантовкой — верх каждой колонны. Маленькие точки — узлы сетки. Отметки и смещения автоматически передаются в редактор.</p>'+
    '<button class="irb-save" id="irbContinue" '+(!(state.start&&(column||state.end)&&available)?'disabled':'')+'>Продолжить в редакторе →</button>'+
    '<button class="irb-secondary" id="irbClear">Сбросить точки</button><button class="irb-secondary" id="irbCancel">Отмена</button>';
    el("irbMark").onchange=e=>{state.mark=e.target.value;state.start=null;state.end=null;refreshPanel();paint()};
    el("irbClear").onclick=()=>{state.start=null;state.end=null;refreshPanel();paint()};
    el("irbCancel").onclick=()=>{state.placing=false;refreshPanel();paint()};
    el("irbContinue").onclick=()=>{
     if(!state.start||!selectedMark()||left<=0||!column&&!state.end)return;
     const pack=a=>a?{ax:a.x,ay:a.y,dx:num(a.worldX)-originAxis(gridX,a.x),dy:num(a.worldY)-originAxis(gridY,a.y),z:num(a.z),source:a.kind,columnId:a.columnId||""}:null;
     const data={markId:state.mark,start:pack(state.start),end:pack(state.end),geometry:m.geometry,height:maxZ};
     state.placing=false;refreshPanel();paint();props.onPlacement(data);
    };
   }else{
    const c=cols.find(c=>String(c.id)===String(state.selected));
    pane.innerHTML='<div class="irb-panel-head"><b>Свойства конструкции</b><small>'+(c?'ВЫБРАНО':'ОБЗОР')+'</small></div>'+
      (c?'<div class="irb-selected"><small>Выбранная марка</small><strong>'+html(c.mark||"—")+'</strong><span>'+html(c.mark_name||c.title||"")+'</span><em>'+html(c.status==="mounted"?"Смонтировано":c.status==="partial"?"Частично":"Не смонтировано")+'</em></div>'+
      '<div class="irb-row"><span>Начальная ось</span><b>'+html(c.axisX+" / "+c.axisY)+'</b></div>'+
      '<div class="irb-row"><span>Координаты, мм</span><b>X '+fmt(c.x)+' · Y '+fmt(c.y)+'</b></div>'+
      '<div class="irb-row"><span>Отметка низа, мм</span><b>'+fmt(c.z0)+'</b></div>'+
      '<div class="irb-row"><span>Отметка конца, мм</span><b>'+fmt(c.z2)+'</b></div>'+
      '<button class="irb-secondary" id="irbSelectDetails">Подробнее и редактирование →</button>':
      '<div class="irb-empty">Выберите конструкцию на общей модели, чтобы посмотреть её марку и положение. Все реальные элементы берутся из вашей монтажной схемы.</div>')+
      (props.canEdit?'<button class="irb-save" id="irbStartRight">＋ Добавить марку</button>':'');
    const btn=el("irbStartRight");if(btn)btn.onclick=startPlacement;
    const detail=el("irbSelectDetails");if(detail)detail.onclick=()=>props.onSelect(String(c.id));
   }
   if(!pane.hidden){
    const dismiss=document.createElement("button");dismiss.type="button";
    dismiss.className="irb-pane-close";dismiss.textContent="×";dismiss.title="Скрыть свойства";
    dismiss.setAttribute("aria-label","Закрыть свойства");
    dismiss.onclick=()=>{state.placing=false;state.selected="";props.onSelect("");refreshPanel();paint()};
    pane.prepend(dismiss);
   }
  }
  function startPlacement(){
   if(!props.canEdit||!marks.some(m=>m.left>0))return;
   state.placing=true;state.start=null;state.end=null;state.mark=leftMark().find(m=>m.id===state.mark)?.id||leftMark()[0]?.id||"";
   refreshPanel();paint();
  }
  const setCamera=mode=>{
   state.preset=mode;state.zoom=1;state.panX=0;state.panY=0;
   if(mode==="top"){state.yaw=0;state.pitch=Math.PI/2}else if(mode==="front"){state.yaw=0;state.pitch=.03}
   else if(mode==="side"){state.yaw=Math.PI/2;state.pitch=.03}else{state.yaw=-.75;state.pitch=.60}
   paint();
  };
  const setZoom=v=>{state.zoom=clamp(v,.45,4);paint()};
  host.querySelectorAll("[data-irb-layer]").forEach(b=>b.onclick=()=>props.onLayer(b.dataset.irbLayer));
  el("irbGrid").onchange=e=>{state.grid=e.target.checked;paint()};
  el("irbRoof").onchange=e=>{state.roof=e.target.checked;paint()};
  if(el("irbStart"))el("irbStart").onclick=startPlacement;
  if(el("irbQuickAdd"))el("irbQuickAdd").onclick=startPlacement;
  el("irbView").value=state.preset==="free"?"iso":state.preset;
  el("irbView").onchange=e=>setCamera(e.target.value);
  el("irbMinus").onclick=()=>setZoom(state.zoom/1.18);
  el("irbPlus").onclick=()=>setZoom(state.zoom*1.18);
  el("irbFit").onclick=()=>setCamera("iso");
  let drag=null;
  const point=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
  canvas.onpointerdown=e=>{if(e.button!==0)return;const p=point(e);drag={...p,lastX:p.x,lastY:p.y,moved:false};try{canvas.setPointerCapture(e.pointerId)}catch(_e){}};
  canvas.onpointermove=e=>{
   const p=point(e);
   if(drag){
    if(Math.hypot(p.x-drag.x,p.y-drag.y)>4)drag.moved=true;
    if(drag.moved){state.yaw+=(p.x-drag.lastX)*.008;state.pitch=clamp(state.pitch+(p.y-drag.lastY)*.006,.02,Math.PI/2);state.preset="free";paint()}
    drag.lastX=p.x;drag.lastY=p.y;return;
   }
   if(!state.placing){const id=nearestMember(p.x,p.y)?.id||"";if(state.hover!==id){state.hover=id;paint()}canvas.style.cursor=id?"pointer":"grab"}
   else canvas.style.cursor="crosshair";
  };
  canvas.onpointerup=e=>{
   if(!drag)return;const moved=drag.moved;drag=null;if(moved)return;
   const p=point(e);
   if(state.placing){
    if(!selectedMark())return;const a=nearestAxis(p.x,p.y);if(!a)return;
    if(!state.start||state.end||pickGeometry()==="column"){state.start=a;state.end=null}
    else if(!sameAnchor(a,state.start))state.end=a;
    refreshPanel();paint();
   }else{state.selected=String(nearestMember(p.x,p.y)?.id||"");props.onSelect(state.selected);refreshPanel();paint()}
  };
  canvas.onpointercancel=()=>{drag=null};
  canvas.onwheel=e=>{e.preventDefault();setZoom(state.zoom*(e.deltaY>0?.9:1.1))};
  if(window.ResizeObserver){observer=new ResizeObserver(()=>paint());observer.observe(canvas)}
  state.selected=String(props.selected||"");
  refreshPanel();paint();
 }
 return {render,start:()=>{const b=document.getElementById("irbStart");if(b)b.click()},dispose:()=>{observer?.disconnect();observer=null;paint=null}};
})();