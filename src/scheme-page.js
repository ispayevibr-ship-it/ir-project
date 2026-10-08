"use strict";
window.irSchemePage=async function(objectId){
 const oid=String(objectId||"");if(!oid)return;
 const app=document.getElementById("app"),root=irProject.data.forObject(oid),object=await irProject.data.objects.get(oid);
 if(!object){location.hash="/objects";return}
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").replace(",", "."));return Number.isFinite(n)?n:0};
 const axesX=["1","2","3","4","5","6"],axesY=["А","Б","В","Г","Д","Е","Ж","И","К","Л"],step=6;
 let mode="3d",yaw=-32,selectedId="K1-01";
 const [markRows,workRows]=await Promise.all([root.section("marks").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);
 const workById=new Map(arr(workRows).map(r=>[String(r.id),r.data||{}]));
 const columnMarks=arr(markRows).map(r=>({id:String(r.id),title:r.title||"",...(r.data||{})})).filter(x=>{
   const w=workById.get(String(x.work_type_id||""))||{},s=(String(x.name||"")+" "+String(x.mark||x.title||"")+" "+String(w.work_type||"")).toLowerCase();
   return /колон|стойк|column|\bк\d/i.test(s)
 }).slice(0,6);
 const markNames=columnMarks.length?columnMarks.map(x=>x.mark||x.title||x.name).filter(Boolean):["К1","К2","К3"];
 const gridColumns=[];
 let n=1;
 for(let yi=0;yi<axesY.length;yi++){
   for(let xi=0;xi<axesX.length;xi++){
     if((xi+yi)%2===0||yi===0||yi===axesY.length-1){
       const mark=markNames[(xi+yi)%markNames.length]||"К1";
       gridColumns.push({id:`${mark}-${String(n++).padStart(2,"0")}`,mark,x:xi*step,y:yi*step,z0:0,z1:8.4,axisX:axesX[xi],axisY:axesY[yi],dx:0,dy:0,status:(xi+yi)%3===0?"mounted":"planned"});
     }
   }
 }
 gridColumns.push(
  {id:"К2-М1",mark:markNames[1]||"К2",x:2*step,y:1*step+2.2,z0:0,z1:9.6,axisX:"3",axisY:"Б",dx:0,dy:2.2,status:"mounted",between:"Б + 2200 мм"},
  {id:"К2-М2",mark:markNames[1]||"К2",x:4*step+1.5,y:4*step,z0:0,z1:9.6,axisX:"5",axisY:"Д",dx:1.5,dy:0,status:"planned",between:"5 + 1500 мм"},
  {id:"К3-М1",mark:markNames[2]||"К3",x:1*step,y:6*step+3,z0:0,z1:7.2,axisX:"2",axisY:"Ж",dx:0,dy:3,status:"mounted",between:"Ж + 3000 мм"}
 );
 function project(x,y,z){
   const a=yaw*Math.PI/180,scale=9.2,cx=520,cy=365;
   const rx=x*Math.cos(a)-y*Math.sin(a),ry=x*Math.sin(a)+y*Math.cos(a);
   return{x:cx+rx*scale,y:cy+ry*scale*.48-z*scale};
 }
 function line(x1,y1,x2,y2,cls){return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${cls}"/>`}
 function grid3d(){
   let out="";
   for(let xi=0;xi<axesX.length;xi++){const a=project(xi*step,0,0),b=project(xi*step,(axesY.length-1)*step,0);out+=line(a.x,a.y,b.x,b.y,"scheme-grid-line");const l=project(xi*step,-2.2,0);out+=`<text x="${l.x}" y="${l.y}" class="scheme-axis-label">${axesX[xi]}</text>`}
   for(let yi=0;yi<axesY.length;yi++){const a=project(0,yi*step,0),b=project((axesX.length-1)*step,yi*step,0);out+=line(a.x,a.y,b.x,b.y,"scheme-grid-line");const l=project(-2.2,yi*step,0);out+=`<text x="${l.x}" y="${l.y}" class="scheme-axis-label">${axesY[yi]}</text>`}
   return out
 }
 function prism(c){
   const p=project(c.x,c.y,0),t=project(c.x,c.y,c.z1),w=3.3,h=2.4,sel=c.id===selectedId?" selected":"",status=c.status==="mounted"?" mounted":" planned";
   return`<g class="scheme-column${status}${sel}" data-column="${esc(c.id)}">
    <polygon points="${p.x-w},${p.y} ${p.x},${p.y-h} ${p.x+w},${p.y} ${t.x+w},${t.y} ${t.x},${t.y-h} ${t.x-w},${t.y}" class="scheme-column-body"/>
    <line x1="${p.x}" y1="${p.y-h}" x2="${t.x}" y2="${t.y-h}" class="scheme-column-edge"/>
    <circle cx="${t.x}" cy="${t.y-h}" r="4.5" class="scheme-column-top"/>
   </g>`
 }
 function planSvg(){
   const left=78,top=42,w=730,h=560,xStep=w/(axesX.length-1),yStep=h/(axesY.length-1);
   let svg="";
   axesX.forEach((a,i)=>{const x=left+i*xStep;svg+=`<line x1="${x}" y1="${top}" x2="${x}" y2="${top+h}" class="scheme-grid-line"/><text x="${x}" y="26" class="scheme-axis-label">${a}</text>`});
   axesY.forEach((a,i)=>{const y=top+i*yStep;svg+=`<line x1="${left}" y1="${y}" x2="${left+w}" y2="${y}" class="scheme-grid-line"/><text x="48" y="${y+4}" class="scheme-axis-label">${a}</text>`});
   gridColumns.forEach(c=>{const x=left+(c.x/((axesX.length-1)*step))*w,y=top+(c.y/((axesY.length-1)*step))*h,sel=c.id===selectedId?" selected":"",status=c.status==="mounted"?" mounted":" planned";svg+=`<g class="scheme-column${status}${sel}" data-column="${esc(c.id)}"><rect x="${x-5}" y="${y-5}" width="10" height="10" rx="2" class="scheme-plan-column"/><circle cx="${x}" cy="${y}" r="2.2" class="scheme-plan-dot"/></g>`});
   return svg
 }
 function selected(){return gridColumns.find(x=>x.id===selectedId)||gridColumns[0]}
 function stats(){
   const total=gridColumns.length,mounted=gridColumns.filter(x=>x.status==="mounted").length;
   return{total,mounted,left:total-mounted,pct:total?Math.round(mounted/total*100):0}
 }
 function renderScene(){
   const box=document.getElementById("schemeCanvas");if(!box)return;
   box.innerHTML=mode==="3d"?`<svg viewBox="0 0 1040 690" aria-label="3D монтажная схема">${grid3d()}${gridColumns.map(prism).join("")}<text x="24" y="662" class="scheme-demo-note">Пример: шаг осей 6000 мм · высота колонн 7,2–9,6 м</text></svg>`:`<svg viewBox="0 0 900 650" aria-label="План монтажной схемы">${planSvg()}<text x="26" y="635" class="scheme-demo-note">План осей 1–6 / А–Л · пример расстановки колонн</text></svg>`;
   box.querySelectorAll("[data-column]").forEach(el=>el.onclick=()=>{selectedId=el.dataset.column;renderScene();renderDetails()});
 }
 function renderDetails(){
   const c=selected(),panel=document.getElementById("schemeDetails");if(!panel)return;
   const xText=c.dx?`${c.axisX} + ${Math.round(c.dx*1000)} мм`:c.axisX,yText=c.dy?`${c.axisY} + ${Math.round(c.dy*1000)} мм`:c.axisY;
   panel.innerHTML=`<div class="scheme-detail-title"><span>Выбранная колонна</span><b>${esc(c.id)}</b></div>
    <div class="scheme-detail-grid">
     <div><span>Марка</span><b>${esc(c.mark)}</b></div>
     <div><span>Статус</span><b class="${c.status==="mounted"?"ok":"wait"}">${c.status==="mounted"?"Смонтирована":"Не смонтирована"}</b></div>
     <div><span>Ось 1–6</span><b>${esc(xText)}</b></div>
     <div><span>Ось А–Л</span><b>${esc(yText)}</b></div>
     <div><span>Низ</span><b>0.000</b></div>
     <div><span>Верх</span><b>+${String(c.z1.toFixed(3)).replace(".",",")}</b></div>
    </div>
    ${c.between?`<div class="scheme-between"><b>Между осями</b><span>${esc(c.between)}</span><small>Положение хранится как базовая ось + точное смещение.</small></div>`:""}`;
 }
 function draw(){
   const s=stats();
   app.innerHTML=`<div class="scheme-page">
    <div class="scheme-head"><button class="back" id="schemeBack">← Назад</button><div><h1>Монтажная схема</h1><p>${esc(object.name||"")} · тестовый пример по колоннам</p></div><div class="scheme-view-switch"><button data-mode="plan" class="${mode==="plan"?"on":""}">План</button><button data-mode="3d" class="${mode==="3d"?"on":""}">3D</button></div></div>
    <div class="scheme-summary">
     <div><span>Сетка осей</span><b>1–6 / А–Л</b><small>Шаг примера 6000 мм</small></div>
     <div><span>Колонн в примере</span><b>${s.total}</b><small>Включая позиции между осями</small></div>
     <div><span>Смонтировано</span><b>${s.mounted}</b><small>${s.pct}%</small></div>
     <div><span>Осталось</span><b>${s.left}</b><small>Демо-статусы</small></div>
    </div>
    <div class="scheme-workspace">
     <section class="scheme-stage">
      <div class="scheme-stage-toolbar">
       <div class="scheme-legend"><span><i class="mounted"></i>Смонтировано</span><span><i class="planned"></i>Не смонтировано</span><span><i class="between"></i>Между осями</span></div>
       <div class="scheme-rotate" ${mode==="plan"?"hidden":""}><button id="schemeLeft">↶ Повернуть</button><button id="schemeReset">Сбросить</button><button id="schemeRight">Повернуть ↷</button></div>
      </div>
      <div class="scheme-canvas" id="schemeCanvas"></div>
     </section>
     <aside class="scheme-details" id="schemeDetails"></aside>
    </div>
    <div class="scheme-hint"><b>Как будет работать дальше:</b><span>сетка осей задаёт координаты, а каждая физическая колонна привязывается к марке ведомости. Колонну между осями храним как «ось + смещение», например <strong>Б + 2200 мм / 3</strong>.</span></div>
   </div>`;
   document.getElementById("schemeBack").onclick=()=>location.hash=`/objects/object/${oid}`;
   document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{mode=b.dataset.mode;draw()});
   document.getElementById("schemeLeft")?.addEventListener("click",()=>{yaw-=10;renderScene()});
   document.getElementById("schemeRight")?.addEventListener("click",()=>{yaw+=10;renderScene()});
   document.getElementById("schemeReset")?.addEventListener("click",()=>{yaw=-32;renderScene()});
   renderScene();renderDetails();
 }
 draw();
};