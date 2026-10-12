"use strict";
/*
 * Unified building 3D viewer for IR Project.
 * All construction members are derived exclusively from existing scheme records.
 * The faint roof and outline are visual guides, never persisted as building marks.
 * 2D canvas projection: offline, no dependencies or database access.
 */
window.irBuildingView=(()=>{
 const state={yaw:-.75,pitch:.60,zoom:1,panX:0,panY:0,preset:"iso",grid:true,roof:false,placing:false,mark:"",start:null,end:null,hover:"",selected:"",layersOpen:false,markSearch:"",zigzag:false,chainNext:null,hoverAnchor:null,continuing:false,topZ:"",error:"",busy:false,repeat:false,directColumns:true,bent:false,middle:null};
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
  if(!markById(state.mark)||selectedMark()?.left<=0){
   // Keep the chain endpoint when the previous mark is exhausted.
   const next=state.continuing?leftMark().find(m=>m.geometry!=="column"):leftMark()[0];
   if(!next){state.placing=false;state.zigzag=false;state.start=null;state.end=null;state.continuing=false}
   state.mark=next?.id||"";
  }
  const header='<div class="irb-panel-head"><b>Слои модели</b></div>';
  host.innerHTML='<div class="irb-wrap"><aside class="irb-layers">'+header+
   '<div class="irb-layer-list">'+groups.map(g=>'<button type="button" class="irb-layer '+(g.visible?'active':'')+'" data-irb-layer="'+html(g.key)+'"><i>'+(g.visible?'✓':'')+'</i><b>'+html(g.label)+'</b><small>'+g.count+'</small></button>').join("")+'</div>'+
   '<div class="irb-panel-head"><b>Отображение</b></div>'+
   '<label class="irb-switch"><input type="checkbox" id="irbGrid" '+(state.grid?'checked':'')+'><span>Сетка осей</span></label>'+
   '<label class="irb-switch"><input type="checkbox" id="irbRoof" '+(state.roof?'checked':'')+'><span>Контур кровли (эскиз)</span></label>'+
   '<div class="irb-info">Голубой пунктир — условный контур здания. Цветные конструкции — ваши размещённые марки. Проектные формы уточняются по КМ/КМД.</div>'+
   '<div class="irb-count"><span>'+html(props.scopeLabel||"На схеме")+'</span><strong>'+cols.length+'</strong><small>Размещённых элементов</small></div>'+
   (props.canEdit?'<button type="button" class="irb-add" id="irbStart">＋ Разместить марку</button>':'')+
   '</aside><div class="irb-viewport">'+
   '<canvas id="irbCanvas" aria-label="3D-модель каркаса здания"></canvas>'+
   '<div class="irb-tags"><span>● Общая модель здания</span><span>'+fmt(spanX/1000)+' × '+fmt(spanY/1000)+' м · '+axesX.length+' × '+axesY.length+' осей</span></div>'+
   '<label class="irb-camera">Вид <select id="irbView"><option value="iso">Изометрия</option><option value="top">Сверху</option><option value="front">Фасад</option><option value="side">Сбоку</option><option value="free" disabled>Свободный ракурс</option></select></label>'+
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
  layerClose.onclick=()=>{state.layersOpen=false;updateLayers();paint()};
  topControls.querySelector("#irbLayerToggle").onclick=()=>{state.layersOpen=!state.layersOpen;updateLayers();paint()};
  updateLayers();detailPanel.hidden=true;
  const el=id=>host.querySelector("#"+id),canvas=el("irbCanvas"),ctx=canvas.getContext("2d");
  if(!ctx){el("irbProperties").textContent="3D Canvas недоступен";return}
  const maxZ=Math.max(7000,8400,...cols.map(c=>Math.max(num(c.z0),num(c.z2),c.geometryType==="bent"?num(c.mz):0)),1);
  const projectFactory=()=>{
   const rect=canvas.getBoundingClientRect(),w=Math.max(260,rect.width),h=Math.max(320,rect.height);
    const insetL=state.layersOpen?Math.min(305,w*.24):0,insetR=state.selected||state.placing?Math.min(305,w*.24):0;
    const safeW=Math.max(200,w-insetL-insetR),centerX=insetL+safeW/2;
   const raw=point=>{
    const x=(point.x-spanX/2)/1000,y=(point.y-spanY/2)/1000,z=(point.z-maxZ/2)/1000;
    const co=Math.cos(state.yaw),si=Math.sin(state.yaw),sp=Math.sin(state.pitch),cp=Math.cos(state.pitch),r=x*si+y*co;
    return {x:x*co-y*si,y:r*sp-z*cp,depth:r*cp+z*sp};
   };
   const vertices=[];for(const x of [0,spanX])for(const y of [0,spanY])for(const z of [0,maxZ*1.23])vertices.push(raw(pt(x,y,z)));
   const minX=Math.min(...vertices.map(p=>p.x)),maxX=Math.max(...vertices.map(p=>p.x)),
    minY=Math.min(...vertices.map(p=>p.y)),maxY=Math.max(...vertices.map(p=>p.y));
   const scale=Math.min((safeW-100)/Math.max(1,maxX-minX),(h-118)/Math.max(1,maxY-minY))*state.zoom;
   const project=point=>{const v=raw(point);return{x:centerX+state.panX+(v.x-(minX+maxX)/2)*scale,y:h/2+state.panY+(v.y-(minY+maxY)/2)*scale,depth:v.depth}};
   return {w,h,raw,project};
  };
  const pickGeometry=()=>selectedMark()?.geometry==="beam"&&state.bent?"bent":selectedMark()?.geometry||"column";
  const anchorZ=()=>pickGeometry()==="column"?0:maxZ*.94;
  const originAxis=(m,a)=>num(m[a]);
  const anchorPoint=(a,z=a?.z??anchorZ())=>pt(
   Number.isFinite(Number(a?.worldX))?Number(a.worldX):originAxis(gridX,a.x),
   Number.isFinite(Number(a?.worldY))?Number(a.worldY):originAxis(gridY,a.y),z);
  // Independent column-head anchors retain exact X, Y and elevation, even
  // for columns located between grid axes or having different heights.
  const gridAnchors=()=>axesX.flatMap(x=>axesY.map(y=>({
   kind:"grid",x,y,worldX:originAxis(gridX,x),worldY:originAxis(gridY,y),z:anchorZ(),zConfirmed:pickGeometry()==="column"
  })));
  const closest=(axes,map,value)=>axes.reduce((best,a)=>
   Math.abs(originAxis(map,a)-value)<Math.abs(originAxis(map,best)-value)?a:best,axes[0]);
  // Invert the orthographic projection on Z=0: this also allows placing
  // columns between axes, instead of restricting users to grid intersections.
  const groundAt=(x,y)=>{
   if(Math.abs(Math.sin(state.pitch))<.18)return null; // front/side views are edge-on
   const project=projectFactory().project,o=project(pt(0,0,0)),
    xp=project(pt(1000,0,0)),yp=project(pt(0,1000,0)),
    xx=xp.x-o.x,xy=xp.y-o.y,yx=yp.x-o.x,yy=yp.y-o.y,
    det=xx*yy-yx*xy;
   if(Math.abs(det)<.01)return null;
   const dx=x-o.x,dy=y-o.y,
    worldX=Math.round(1000*(dx*yy-dy*yx)/det),
    worldY=Math.round(1000*(xx*dy-xy*dx)/det);
   if(worldX<0||worldX>spanX||worldY<0||worldY>spanY)return null;
   return{kind:"ground",x:closest(axesX,gridX,worldX),y:closest(axesY,gridY,worldY),
    worldX,worldY,z:0,zConfirmed:true};
  };
  const columnOccupied=a=>!!a&&cols.some(c=>c.geometryType==="column"&&
   Math.hypot(num(c.x)-num(a.worldX),num(c.y)-num(a.worldY))<25&&Math.abs(num(c.z0)-num(a.z))<25);
  const columnAnchors=()=>cols.filter(c=>c.geometryType==="column").map(c=>{
   const x=axesX.includes(String(c.axisX))?String(c.axisX):closest(axesX,gridX,num(c.x));
   const y=axesY.includes(String(c.axisY))?String(c.axisY):closest(axesY,gridY,num(c.y));
   return {kind:"column",columnId:String(c.id),label:String(c.mark||"Колонна"),
    x,y,worldX:num(c.x),worldY:num(c.y),z:num(c.z2),zConfirmed:true,minZ:Math.min(num(c.z0),num(c.z2)),maxZ:Math.max(num(c.z0),num(c.z2))}
  });
  const memberAnchors=()=>cols.filter(c=>c.geometryType!=="column").flatMap(c=>
   [{worldX:num(c.x),worldY:num(c.y),z:num(c.z0)},...(c.geometryType==="bent"?[{worldX:num(c.mx),worldY:num(c.my),z:num(c.mz)}]:[]),{worldX:num(c.x2),worldY:num(c.y2),z:num(c.z2)}].map(v=>({
    kind:"member",memberId:String(c.id),label:String(c.mark||"Элемент"),
    x:closest(axesX,gridX,v.worldX),y:closest(axesY,gridY,v.worldY),...v,zConfirmed:true
   }))
  );
  const memberSegmentHit=(x,y)=>{
   if(pickGeometry()==="column")return null;
   const project=projectFactory().project;let best=11,hit=null;
   for(const s of memberSegments()){
    if(s.c.geometryType==="column")continue;
    const a=project(s.start),b=project(s.end),dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
    if(den<20)continue;
    const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/den,0,1),distance=Math.hypot(x-a.x-dx*t,y-a.y-dy*t);
    if(distance>best)continue;
    const px=s.start.x+(s.end.x-s.start.x)*t,py=s.start.y+(s.end.y-s.start.y)*t;
    best=distance;hit={kind:"member",memberId:String(s.c.id),memberPart:s.part,label:String(s.c.mark||"Элемент"),
     x:closest(axesX,gridX,px),y:closest(axesY,gridY,py),worldX:Math.round(px),worldY:Math.round(py),
     z:Math.round(s.start.z+(s.end.z-s.start.z)*t),zConfirmed:true};
   }
   return hit;
  };
  const availableAnchors=()=>pickGeometry()==="column"?gridAnchors():[...gridAnchors(),...columnAnchors(),...memberAnchors()];
  const columnSegmentHit=(x,y)=>{
   if(pickGeometry()==="column")return null;
   const project=projectFactory().project;let best=12,hit=null;
   for(const c of cols){
    if(c.geometryType!=="column")continue;
    const a=project(pt(c.x,c.y,c.z0)),b=project(pt(c.x,c.y,c.z2)),
     dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy;
    if(length2<25)continue;
    const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/length2,0,1),
     distance=Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
    if(distance>best)continue;
    const xAxis=axesX.includes(String(c.axisX))?String(c.axisX):closest(axesX,gridX,num(c.x)),
     yAxis=axesY.includes(String(c.axisY))?String(c.axisY):closest(axesY,gridY,num(c.y));
    best=distance;
    hit={kind:"column",columnId:String(c.id),label:String(c.mark||"Колонна"),
     x:xAxis,y:yAxis,worldX:num(c.x),worldY:num(c.y),
     z:Math.round(num(c.z0)+(num(c.z2)-num(c.z0))*t),zConfirmed:true,
     minZ:Math.min(num(c.z0),num(c.z2)),maxZ:Math.max(num(c.z0),num(c.z2))}
   }
   return hit;
  };
  // Choose the closest projected member instead of always prioritising a column.
  const segmentHit=(x,y)=>{
   const hits=[columnSegmentHit(x,y),memberSegmentHit(x,y)].filter(Boolean);
   if(hits.length<2)return hits[0]||null;
   const project=projectFactory().project;
   const d=a=>{const p=project(anchorPoint(a));return Math.hypot(p.x-x,p.y-y)};
   return d(hits[0])<=d(hits[1])?hits[0]:hits[1];
  };
  const sameAnchor=(a,b)=>Boolean(a&&b&&Math.hypot(num(a.worldX)-num(b.worldX),num(a.worldY)-num(b.worldY),num(a.z)-num(b.z))<1);
  const memberSegments=()=>cols.flatMap(c=>{
    const start=pt(c.x,c.y,c.z0),end=pt(c.geometryType==="column"?c.x:c.x2,c.geometryType==="column"?c.y:c.y2,c.z2);
    if(c.geometryType==="bent"){const mid=pt(c.mx,c.my,c.mz);return[{c,start,end:mid,part:0},{c,start:mid,end,part:1}]}
    return[{c,start,end,part:0}];
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
    if(pickGeometry()!=="column")for(const a of [...columnAnchors(),...memberAnchors()]){
     const q=m.project(anchorPoint(a)),selected=sameAnchor(a,state.start)||sameAnchor(a,state.end);
     circle(q,selected?8.5:6.2,"#fff");
     circle(q,selected?6.2:4.5,selected?"#ee9a25":"#217ce7");
    }
    if(state.hoverAnchor&&!sameAnchor(state.hoverAnchor,state.start)&&!sameAnchor(state.hoverAnchor,state.end)){
     const hover=m.project(anchorPoint(state.hoverAnchor));
     circle(hover,7,"#fff");circle(hover,5,"#e89927")
    }
    if(pickGeometry()==="column"&&state.directColumns){
     const anchor=state.hoverAnchor||state.start;
     if(anchor){
      const height=Number(state.topZ),valid=state.topZ!==""&&Number.isFinite(height)&&height>num(anchor.z),
       previewZ=valid?height:maxZ*.94,occupied=columnOccupied(anchor);
      const a=m.project(anchorPoint(anchor)),b=m.project(anchorPoint(anchor,previewZ)),
       color=occupied?"#c94c4c":valid?"#168ee0":"#b68e45";
      line(a,b,"rgba(255,255,255,.88)",10);
      line(a,b,color,6,[9,5]);circle(a,8,"#fff");circle(a,5.5,color);
      ctx.font="800 11px Segoe UI,Arial";ctx.textAlign="left";ctx.textBaseline="middle";
      const text=occupied?"Место занято":valid?String(selectedMark()?.mark||selectedMark()?.title||"Колонна"):"Задайте верх Z";
      const tw=Math.min(180,ctx.measureText(text).width+16),tx=Math.min(m.w-tw-6,Math.max(5,b.x+12)),ty=Math.max(6,Math.min(m.h-26,b.y-12));
      ctx.fillStyle="rgba(255,255,255,.95)";ctx.fillRect(tx,ty,tw,23);
      ctx.strokeStyle=color;ctx.lineWidth=1;ctx.strokeRect(tx,ty,tw,23);
      ctx.fillStyle=color;ctx.fillText(text,tx+8,ty+12,tw-12);
     }
    }else if(state.start){
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
   const segment=segmentHit(x,y);
   if(pickGeometry()==="column")return best||groundAt(x,y);
   return segment&&(!best||minScore>5)?segment:best
  };
  const position=a=>a?html((a.kind==="column"||a.kind==="member"?a.label+" · крепление · ":a.kind==="ground"?"Между осями · ":"Ось ")+a.x+" / "+a.y+
   " · X "+fmt(a.worldX)+" · Y "+fmt(a.worldY)+" · Z "+(a.zConfirmed===false?"нужно указать":fmt(a.z)+" мм")+
   (a.kind==="ground"?" · смещение X "+fmt(num(a.worldX)-originAxis(gridX,a.x))+" / Y "+fmt(num(a.worldY)-originAxis(gridY,a.y))+" мм":a.kind==="grid"?" (сетка)":"")):"Выберите точку на модели";
  const searchMatches=m=>!state.markSearch.trim()||String(m.title+" "+(m.mark||"")).toLocaleLowerCase("ru").includes(state.markSearch.trim().toLocaleLowerCase("ru"));
  const markOptions=()=>'<option value="">Выберите марку</option>'+
   marks.filter(searchMatches).map(a=>'<option value="'+html(a.id)+'" '+(a.left>0?"":"disabled")+
   ' '+(a.id===state.mark?"selected":"")+'>'+html(a.title)+' · остаток '+a.left+
   (a.left?"":" · НЕТ ОСТАТКА")+'</option>').join("");
  const matchedCount=()=>marks.filter(searchMatches).length;
  const zEditor=(a,index)=>a?
   '<label class="irb-level">Отметка Z, мм<input type="number" step="1" data-irb-level="'+index+
   '" min="'+(a.kind==="column"?num(a.minZ):-20000)+'" max="'+(a.kind==="column"?num(a.maxZ):200000)+
   '" value="'+(a.zConfirmed===false?"":Math.round(num(a.z)))+'" placeholder="Отметка по КМД"></label>':"";
  let commitQuickPlacement=()=>{};
  const updateHoverInfo=()=>{
   const field=el("irbHoverPosition");if(!field)return;
   field.textContent=state.hoverAnchor?position(state.hoverAnchor):"Наведите курсор на точку установки на каркасе";
   field.classList.toggle("occupied",columnOccupied(state.hoverAnchor));
  };
  const updateHint=()=>{
   const column=selectedMark()?.geometry==="column";
   const hasHeight=state.topZ!==""&&Number.isFinite(Number(state.topZ))&&Number(state.topZ)>0;
   el("irbHint").textContent=!state.placing?"ЛКМ — вращение · колесо — масштаб · нажатие на элемент — свойства":
    column&&state.directColumns?(!hasHeight?"Сначала задайте «Верх Z, мм» · затем щёлкните по месту колонны":
     "Наведите курсор — появится колонна · щелчок — установить · перетаскивание — вращать"):
    !state.start?"1. Выберите начальную точку":column||state.end?"Проверьте отметки и нажмите «Сохранить на схеме»":"2. Выберите конечную точку";
  };
  function refreshPanel(){
   const m=selectedMark(),left=num(m?.left),column=m?.geometry==="column",available=left>0;
   updateHint();
   const pane=el("irbProperties");
    const readyToSave=()=>!!(state.start&&selectedMark()?.left>0&&(selectedMark()?.geometry==="column"||state.end)&&state.start.zConfirmed!==false&&
     (selectedMark()?.geometry==="column"?state.topZ!==""&&Number.isFinite(Number(state.topZ))&&Number(state.topZ)>num(state.start.z):state.end?.zConfirmed!==false));
   const ready=readyToSave();
   const current=cols.find(c=>String(c.id)===String(state.selected));
   pane.hidden=!state.placing&&!current;
   if(state.placing){
    pane.innerHTML='<div class="irb-panel-head"><b>Размещение элемента</b><small>НОВАЯ МАРКА</small></div>'+
    '<label class="irb-field">Поиск марки<input type="search" id="irbMarkSearch" autocomplete="off" placeholder="Марка или наименование…" value="'+html(state.markSearch)+'"></label>'+
    '<label class="irb-field">Марка из ведомости<select id="irbMark">'+markOptions()+'</select><small>Найдено: '+matchedCount()+' из '+marks.length+'</small></label>'+
    '<div class="irb-placement-type"><span>Тип выбранной марки</span><b>'+html(column?"Колонна / стойка":m?.geometry==="brace"?"Связь / раскос":m?.geometry==="truss"?"Ферма":"Балка / ригель / прогон")+'</b>'+
     (!column?'<small>Для установки колонн щелчком выберите марку из категории «Колонны», «Фахверки» или «Стойки».</small>':"")+'</div>'+
    '<div class="irb-quota">По ведомости: '+num(m?.total)+' шт.<br>На схеме: '+num(m?.placed)+' шт.<br><b>Осталось: '+left+' шт.</b></div>'+
    (column?'<div class="irb-direct-info"><b>Установка колонн на каркасе</b><span>Укажите верх Z по КМД. Затем наведите мышь на модель: появится контур колонны. Один щелчок размещает её на выбранной точке, в том числе между осями.</span></div>'+
    '<label class="irb-click-toggle"><input type="checkbox" id="irbClickPlace" '+(state.directColumns?"checked":"")+'><span>Устанавливать колонны щелчком</span></label>'+
    '<div class="irb-hover-position" id="irbHoverPosition"></div>':"")+
    '<div class="irb-anchor"><b>1. Начало</b><span>'+position(state.start)+'</span>'+zEditor(state.start,"start")+'</div>'+
    '<div class="irb-anchor"><b>2. '+(column?"Верх колонны":"Конец")+'</b><span>'+(column?"Укажите проектную отметку":position(state.end))+'</span>'+(column?'<label class="irb-level">Верх Z, мм<input type="number" step="1" id="irbTopZ" placeholder="По КМД" value="'+html(state.topZ)+'"></label>':zEditor(state.end,"end"))+'</div>'+
    (typeof props.onQuickPlace==="function"?'<label class="irb-zigzag"><input id="irbRepeat" type="checkbox" '+(state.repeat?"checked":"")+'><span><b>Серия одной марки</b><small>После сохранения выбирайте следующие точки без повторного поиска марки (пока есть остаток).</small></span></label>':"")+
     (!column?'<label class="irb-zigzag"><input id="irbZigzag" type="checkbox" '+(state.zigzag?"checked":"")+'><span><b>Зигзаг / цепочка</b><small>После сохранения следующая связь начнётся от конца предыдущей. Каждому отрезку соответствует своя марка из ведомости.</small></span></label>':"")+
    '<p class="irb-help">'+(column?"Точная привязка к сетке либо свободная точка между осями. В виде «Фасад» и «Сбоку» для установки используйте изометрию или вид сверху.":"Привязка к колоннам, балкам и ригелям. Для точек сетки требуется проектная отметка Z по КМД.")+'</p>'+
     '<div class="irb-form-error" id="irbQuickError" role="alert" '+(state.error?'':'hidden')+'>'+html(state.error)+'</div>'+
     (typeof props.onQuickPlace==="function"?'<button type="button" class="irb-save irb-quick-save" id="irbQuickSave" '+(!ready||state.busy?'disabled':'')+'>✓ Сохранить на схеме</button>':'')+
    '<button class="irb-save" id="irbContinue" '+(!(state.start&&(column||state.end)&&available)?'disabled':'')+'>Продолжить в редакторе →</button>'+
    '<button class="irb-secondary" id="irbClear">Сбросить точки</button><button class="irb-secondary" id="irbCancel">Отмена</button>';
    el("irbMark").onchange=e=>{
     const next=markById(e.target.value),keep=state.continuing&&next?.geometry!=="column";
     state.mark=e.target.value;state.topZ="";state.error="";if(!keep){state.start=null;state.continuing=false}
     if(next?.geometry==="column")state.zigzag=false;
     state.repeat=next?.geometry==="column";
     state.hoverAnchor=null;state.end=null;refreshPanel();paint()
    };
    el("irbMarkSearch").oninput=e=>{
     const cursor=e.target.selectionStart;
     state.markSearch=e.target.value;state.topZ="";state.error="";
     const matched=marks.filter(a=>a.left>0&&searchMatches(a));
     if(!matched.some(a=>a.id===state.mark)){
      const next=matched[0];state.mark=next?.id||"";
      if(!state.continuing||next?.geometry==="column"){state.start=null;state.continuing=false}
      if(next?.geometry==="column")state.zigzag=false;
      state.repeat=next?.geometry==="column";
      state.hoverAnchor=null;state.end=null
     }
     refreshPanel();paint();
     const input=el("irbMarkSearch");input.focus();input.setSelectionRange(cursor,cursor)
    };
    if(el("irbRepeat"))el("irbRepeat").onchange=e=>{state.repeat=e.target.checked};
    if(el("irbClickPlace"))el("irbClickPlace").onchange=e=>{state.directColumns=e.target.checked;updateHint();paint()};
    updateHoverInfo();
     if(el("irbZigzag"))el("irbZigzag").onchange=e=>{state.zigzag=e.target.checked};
    if(el("irbTopZ"))el("irbTopZ").oninput=e=>{
      state.topZ=e.target.value;const save=el("irbQuickSave");
      if(save)save.disabled=state.busy||!readyToSave();
      updateHint();paint();
     };
     pane.querySelectorAll("[data-irb-level]").forEach(input=>input.onchange=e=>{
     const a=e.target.dataset.irbLevel==="start"?state.start:state.end;
     if(!a)return;
     const value=Number(e.target.value);
     if(e.target.value===""||!Number.isFinite(value)||value<num(a.kind==="column"?a.minZ:-20000)||value>num(a.kind==="column"?a.maxZ:200000)){e.target.value=a.zConfirmed===false?"":String(a.z);return}
     // Editing Z on a sloping member also moves X/Y along its actual centreline.
     if(a.kind==="member"&&a.memberId){
      const ref=cols.find(c=>String(c.id)===String(a.memberId));
      if(ref){
       const base=num(ref.z0),dz=num(ref.z2)-base;
       if(Math.abs(dz)<1){
        if(Math.abs(value-base)>.5){e.target.value=String(Math.round(a.z));return}
       }else{
        const t=(value-base)/dz;
        if(t<0||t>1){e.target.value=String(Math.round(a.z));return}
        a.worldX=Math.round(num(ref.x)+(num(ref.x2)-num(ref.x))*t);
        a.worldY=Math.round(num(ref.y)+(num(ref.y2)-num(ref.y))*t);
        a.x=closest(axesX,gridX,a.worldX);a.y=closest(axesY,gridY,a.worldY)
       }
      }
     }
     a.z=Math.round(value);a.zConfirmed=true;state.error="";refreshPanel();paint()
    });
    el("irbClear").onclick=()=>{state.start=null;state.end=null;state.error="";state.continuing=false;refreshPanel();paint()};
    el("irbCancel").onclick=()=>{state.placing=false;state.start=null;state.end=null;state.chainNext=null;state.continuing=false;refreshPanel();paint()};
         const quickSave=el("irbQuickSave");
     commitQuickPlacement=async()=>{
      if(!readyToSave()||state.busy)return;
      if(m.geometry==="column"&&columnOccupied(state.start)){
       state.error="В этой точке уже установлена колонна. Выберите другое место.";
       const err=el("irbQuickError");if(err){err.textContent=state.error;err.hidden=false}
       return
      }
      const pack=a=>a?{ax:a.x,ay:a.y,dx:num(a.worldX)-originAxis(gridX,a.x),dy:num(a.worldY)-originAxis(gridY,a.y),z:num(a.z),memberId:a.memberId||a.columnId||""}:null;
      const data={markId:state.mark,start:pack(state.start),end:column?null:pack(state.end),topZ:column?Number(state.topZ):undefined,geometry:m.geometry,zigzag:state.zigzag};
      state.busy=true;quickSave.disabled=true;state.error="";
      try{
       const result=await props.onQuickPlace(data);
       if(state.zigzag&&!column&&state.end){
        state.start={...state.end,zConfirmed:true,worldX:num(result.savedEnd.x),worldY:num(result.savedEnd.y),z:num(result.savedEnd.z)};
        state.end=null;state.placing=true;state.continuing=true;
       }else if(state.repeat&&num(m.left)>1){
        state.start=null;state.end=null;state.placing=true;state.continuing=false;
       }else{state.start=null;state.end=null;state.placing=false;state.continuing=false}
       if(!(column&&state.placing&&state.repeat))state.topZ="";
       state.error="";state.busy=false;state.hoverAnchor=null;
       props.onQuickPlaced?.(result);
      }catch(e){state.error=String(e?.message||e);state.busy=false;refreshPanel();paint()}
     };
     if(quickSave)quickSave.onclick=commitQuickPlacement;
     el("irbContinue").onclick=()=>{
     if(!state.start||!selectedMark()||left<=0||!column&&!state.end)return;
     const pack=a=>a?{ax:a.x,ay:a.y,dx:num(a.worldX)-originAxis(gridX,a.x),dy:num(a.worldY)-originAxis(gridY,a.y),z:num(a.z),source:a.kind,columnId:a.columnId||""}:null;
     const data={markId:state.mark,start:pack(state.start),end:pack(state.end),geometry:m.geometry,height:maxZ,zigzag:state.zigzag};
     state.chainNext=state.zigzag&&state.end?{...state.end}:null;
     state.placing=false;state.continuing=false;refreshPanel();paint();props.onPlacement(data);
    };
   }else{
    const c=cols.find(c=>String(c.id)===String(state.selected));
    pane.innerHTML='<div class="irb-panel-head"><b>Свойства конструкции</b></div>'+
      (c?'<div class="irb-selected"><small>Выбранная марка</small><strong>'+html(c.mark||"—")+'</strong><span>'+html(c.mark_name||c.title||"")+'</span><em>'+html(c.status==="mounted"?"Смонтировано":c.status==="partial"?"Частично":"Не смонтировано")+'</em></div>'+
      '<div class="irb-row"><span>Начальная ось</span><b>'+html(c.axisX+" / "+c.axisY)+'</b></div>'+
      '<div class="irb-row"><span>Начало, мм</span><b>X '+fmt(c.x)+' · Y '+fmt(c.y)+' · Z '+fmt(c.z0)+'</b></div>'+
       '<div class="irb-row"><span>Конец, мм</span><b>X '+fmt(c.x2??c.x)+' · Y '+fmt(c.y2??c.y)+' · Z '+fmt(c.z2)+'</b></div>'+
       '<div class="irb-row irb-length"><span>Длина элемента по осям</span><b>'+fmt(Math.hypot(num(c.x2??c.x)-num(c.x),num(c.y2??c.y)-num(c.y),num(c.z2)-num(c.z0)))+' мм · '+(Math.hypot(num(c.x2??c.x)-num(c.x),num(c.y2??c.y)-num(c.y),num(c.z2)-num(c.z0))/1000).toLocaleString("ru-RU",{minimumFractionDigits:3,maximumFractionDigits:3})+' м</b></div>'+
      '<div class="irb-row"><span>Отметка низа, мм</span><b>'+fmt(c.z0)+'</b></div>'+
      '<div class="irb-row"><span>Отметка конца, мм</span><b>'+fmt(c.z2)+'</b></div>'+
      (props.canEdit?'<div class="irb-action-row">'+
       '<button type="button" class="irb-secondary" id="irbSelectDetails">Подробнее и редактирование →</button>'+
       '<button type="button" class="irb-icon-delete" id="irbDeleteSelected" title="Удалить элемент со схемы" aria-label="Удалить выбранный элемент со схемы">'+
        '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
         '<path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v6m4-6v6"/>'+
        '</svg></button></div>':''):
      '<div class="irb-empty">Выберите конструкцию на общей модели, чтобы посмотреть её марку и положение. Все реальные элементы берутся из вашей монтажной схемы.</div>')+
      (props.canEdit?'<button class="irb-save" id="irbStartRight">＋ Добавить марку</button>':'');
    const btn=el("irbStartRight");if(btn)btn.onclick=startPlacement;
    const detail=el("irbSelectDetails");if(detail)detail.onclick=()=>{
     if(props.canEdit&&typeof props.onEdit==="function")props.onEdit(String(c.id));
    };
    const deleteButton=el("irbDeleteSelected");if(deleteButton)deleteButton.onclick=()=>{
     if(props.canEdit&&typeof props.onDelete==="function")props.onDelete(String(c.id));
    };
   }
   if(!pane.hidden){
    const dismiss=document.createElement("button");dismiss.type="button";
    dismiss.className="irb-pane-close";dismiss.textContent="×";dismiss.title="Скрыть свойства";
    dismiss.setAttribute("aria-label","Закрыть свойства");
    dismiss.onclick=()=>{state.placing=false;state.continuing=false;state.chainNext=null;state.start=null;state.end=null;state.selected="";props.onSelect("");refreshPanel();paint()};
    pane.prepend(dismiss);
   }
  }
  function startPlacement(){
   if(!props.canEdit||!marks.some(m=>m.left>0))return;
   state.placing=true;state.start=null;state.end=null;state.chainNext=null;state.continuing=false;state.topZ="";state.error="";state.markSearch="";state.hoverAnchor=null;state.directColumns=true;state.mark=leftMark().find(m=>m.id===state.mark)?.id||leftMark()[0]?.id||"";state.repeat=selectedMark()?.geometry==="column";
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
  el("irbView").value=state.preset;
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
    if(drag.moved){state.yaw+=(p.x-drag.lastX)*.008;state.pitch=clamp(state.pitch+(p.y-drag.lastY)*.006,.02,Math.PI/2);state.preset="free";el("irbView").value="free";paint()}
    drag.lastX=p.x;drag.lastY=p.y;return;
   }
   if(!state.placing){const id=nearestMember(p.x,p.y)?.id||"";if(state.hover!==id){state.hover=id;paint()}canvas.style.cursor=id?"pointer":"grab"}
   else{
    const anchor=nearestAxis(p.x,p.y);
    const previous=state.hoverAnchor;
    const changed=!!anchor!==!!previous||anchor&&previous&&
     (Math.hypot(num(anchor.worldX)-num(previous.worldX),num(anchor.worldY)-num(previous.worldY))>15||
      Math.abs(num(anchor.z)-num(previous.z))>50||anchor.kind!==previous.kind);
    if(changed){state.hoverAnchor=anchor;updateHoverInfo();paint()}
    canvas.style.cursor=columnOccupied(anchor)?"not-allowed":"crosshair"
   }
  };
  canvas.onpointerup=e=>{
   if(!drag)return;const moved=drag.moved;drag=null;if(moved)return;
   const p=point(e);
   if(state.placing){
    if(state.busy||!selectedMark())return;
    const a=nearestAxis(p.x,p.y);if(!a)return;
    const column=pickGeometry()==="column";
    if(column&&columnOccupied(a)){
     state.error="В выбранной точке уже есть колонна. Выберите свободное место.";
     refreshPanel();paint();return
    }
    if(!state.start||state.end||column){state.start=a;state.end=null;if(!column)state.topZ="";}
    else if(!sameAnchor(a,state.start))state.end=a;
    state.error="";refreshPanel();paint();
    if(column&&state.directColumns&&state.topZ!==""&&
     Number.isFinite(Number(state.topZ))&&Number(state.topZ)>num(a.z)){
     // Use exactly the same validated save path as the sidebar button.
     void commitQuickPlacement()
    }
   }else{state.selected=String(nearestMember(p.x,p.y)?.id||"");props.onSelect(state.selected);refreshPanel();paint()}
  };
  canvas.onpointerleave=()=>{if(!drag&&state.hoverAnchor){state.hoverAnchor=null;updateHoverInfo();paint()}};
  canvas.onpointercancel=()=>{drag=null};
  canvas.onwheel=e=>{e.preventDefault();setZoom(state.zoom*(e.deltaY>0?.9:1.1))};
  if(window.ResizeObserver){observer=new ResizeObserver(()=>paint());observer.observe(canvas)}
  state.selected=String(props.selected||"");
  refreshPanel();paint();
 }
 return {render,start:()=>{const b=document.getElementById("irbStart");if(b)b.click()},
  placementSaved:placement=>{
   if(!placement?.zigzag||!state.chainNext)return;
   const previous=state.chainNext,saved=placement.savedEnd;
   // Continue from the actual endpoint persisted in the standard editor.
   const sameColumn=saved&&previous.kind==="column"&&
    Math.hypot(num(saved.x)-num(previous.worldX),num(saved.y)-num(previous.worldY))<1&&
    num(saved.z)>=num(previous.minZ)&&num(saved.z)<=num(previous.maxZ);
   state.start=!saved?{...previous}:sameColumn?{...previous,z:num(saved.z)}:{
    kind:"grid",x:String(saved.ax),y:String(saved.ay),
    worldX:num(saved.x),worldY:num(saved.y),z:num(saved.z)
   };
   state.end=null;state.placing=true;state.continuing=true;
   state.markSearch="";state.hoverAnchor=null;state.chainNext=null
  },
  placementCancelled:()=>{state.chainNext=null;state.continuing=false;state.placing=false;state.start=null;state.end=null;state.hoverAnchor=null},
  dispose:()=>{observer?.disconnect();observer=null;paint=null}};
})();