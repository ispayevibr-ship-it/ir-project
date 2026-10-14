"use strict";
/* Standalone HTML export helpers only. They never change IR Project data. */
(()=>{
 const workLabel=(v,context="base")=>window.irWorkNames?.format?.(v,context)||String(v??"");{
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const x=Number(String(v??0).replace(",",".").replace(/\s/g,""));return Number.isFinite(x)?x:0};
 const fmt=v=>String(Number(num(v).toFixed(4))).replace(".",",");
 const date=v=>{const s=String(v||"").slice(0,10),p=s.split("-");return p.length===3?p[2]+"."+p[1]+"."+p[0]:(s||"—")};
 const items=d=>{for(const k of ["items","marks","positions","rows"])if(Array.isArray(d?.[k]))return d[k];return[]};
 const photoPath=p=>typeof p==="string"?p:String(p?.file_path||p?.file||p?.path||"");
 function deliveries(rows){
  const ordered=[...arr(rows)].sort((a,b)=>String(b.data?.date||b.data?.delivery_date||"").localeCompare(String(a.data?.date||a.data?.delivery_date||""))||num(b.id)-num(a.id));
  if(!ordered.length)return'<div class="ir-export-empty-card">Накладных пока нет</div>';
  const cards=ordered.map(row=>{
   const d=row.data||{},list=items(d),works=new Map(),total=new Map();
   for(const p of list){
    if(p.accounting_type==="service"||p.is_service===true)continue;
    const key=String(p.work_type||p.type||"Работа")+"|"+String(p.project_code||p.code||"");
    works.set(key,(works.get(key)||0)+1);
    const unit=String(p.unit||"ед."),v=p.volume!=null?num(p.volume):p.total_volume!=null?num(p.total_volume):num(p.qty??p.count??p.quantity)*num(p.unit_volume);
    total.set(unit,(total.get(unit)||0)+v)
   }
   if(!list.length&&d.totals_by_unit&&typeof d.totals_by_unit==="object")
    for(const [unit,value] of Object.entries(d.totals_by_unit))total.set(unit,num(value));
   const totalText=[...total].filter(([,v])=>v>0).map(([u,v])=>fmt(v)+" "+u).join(" · ")||"—";
   const short=[...works].slice(0,3).map(([k,n])=>{const [name,code]=k.split("|");return'<span><b>'+esc(name)+'</b> · '+esc(code||"Без шифра")+' · '+n+' поз.</span>'}).join("");
   const rowsHtml=list.map(p=>'<div class="ir-export-delivery-detail"><strong>'+esc(p.mark||p.name||workLabel(p.work_type,"delivery")||"Позиция")+'</strong><span>'+esc(p.project_code||p.code||"—")+'</span><b>'+esc(fmt(p.qty??p.count??p.quantity))+' шт.</b></div>').join("");
   return'<article class="ood-delivery-row ir-export-invoice"><details><summary class="ir-export-invoice-summary">'+
    '<div><small>Накладная</small><b>№'+esc(d.number||d.delivery_number||row.id)+'</b><span>'+esc(date(d.date||d.delivery_date))+'</span></div>'+
    '<div><small>Транспорт</small><b>'+esc(d.vehicle_number||"—")+'</b><span>'+esc(d.driver_name||"Водитель не указан")+'</span></div>'+
    '<div class="ood-delivery-works"><small>Работы</small>'+(short||'<span>Позиции не указаны</span>')+'</div>'+
    '<div class="ood-delivery-total"><small>Общий объём</small><b>'+esc(totalText)+'</b></div>'+
    '<span class="ir-export-invoice-arrow" aria-hidden="true">⌄</span></summary>'+
    (rowsHtml?'<div class="ir-export-invoice-details"><h3>Позиции накладной · '+list.length+'</h3>'+rowsHtml+'</div>':"")+
    '</details></article>'
  });
  const more=cards.length>3?'<details class="ir-export-invoice-more"><summary><span class="ir-export-invoice-more-open">Показать ещё (всего '+cards.length+' накладных)</span><span class="ir-export-invoice-more-close">Свернуть до 3 накладных</span></summary><div class="ir-export-invoice-more-rows">'+cards.slice(3).join("")+'</div></details>':"";
  return'<div class="ir-export-invoice-list">'+cards.slice(0,3).join("")+more+'</div>'
 }
 function recentPhotos(reports,images){
  const ordered=[...arr(reports)].sort((a,b)=>String(b.data?.date||b.data?.report_date||"").localeCompare(String(a.data?.date||a.data?.report_date||""))||num(b.id)-num(a.id)),selected=[];
  for(const row of ordered){
   const d=row.data||{},list=arr(d.photos).length?d.photos:arr(d.reportPhotos);
   for(const p of list){
    const key=photoPath(p),src=/^data:image\//.test(key)?key:images.get(key);
    if(src&&selected.length<12)selected.push({src,date:date(d.date||d.report_date),no:selected.length+1})
   }
   if(selected.length>=12)break
  }
  if(!selected.length)return'<div class="ir-export-empty-card">Фотографий пока нет</div>';
  const grid=selected.map((p,i)=>'<a class="ir-export-gallery-tile" href="#ir-export-lightbox-'+i+'" title="Увеличить"><img src="'+esc(p.src)+'" loading="lazy" alt="Фото '+(i+1)+'"><span>'+esc(p.date)+' · фото '+(i+1)+'</span></a>').join("");
  const modal=selected.map((p,i)=>'<div class="ir-export-gallery-lightbox" id="ir-export-lightbox-'+i+'"><a class="ir-export-gallery-shade" href="#section-photos" aria-label="Закрыть"></a><figure><img src="'+esc(p.src)+'" alt="Фото '+(i+1)+'"><figcaption>'+esc(p.date)+' · Фото '+(i+1)+'<a href="#section-photos">✕ Закрыть</a></figcaption></figure></div>').join("");
  return'<div class="ir-export-gallery">'+grid+'</div>'+modal
 }
 function schemeData(rows,markDetails=[]){
  const detailById=new Map(arr(markDetails).map(m=>[String(m.id),m]));
  const all=arr(rows),grid=all.find(r=>r.record_type==="scheme_grid"||r.data?.entity_type==="grid")?.data||{};
  const xAxis=arr(grid.axes_x).length>=2?grid.axes_x.map(String):["1","2","3","4","5","6"];
  const yAxis=arr(grid.axes_y).length>=2?grid.axes_y.map(String):["А","Б","В","Г","Д","Е","Ж","И","К","Л"];
  const axisPositions=(axis,spans,total)=>{let n=0;const map={};axis.forEach((v,i)=>{map[v]=n;if(i<axis.length-1)n+=num(spans?.[i])>0?num(spans[i]):total/(axis.length-1)});return map};
  const xPos=axisPositions(xAxis,grid.x_spans_mm,num(grid.span_x_mm)||45000),yPos=axisPositions(yAxis,grid.y_spans_mm,num(grid.span_y_mm)||60000);
  const point=(d,end=false)=>{
   const absX=d[end?"absolute_x2_mm":"absolute_x_mm"],absY=d[end?"absolute_y2_mm":"absolute_y_mm"];
   const ax=end?d.end_axis_x||d.axis_x:d.axis_x,ay=end?d.end_axis_y||d.axis_y:d.axis_y;
   return {x:absX!=null?num(absX):num(xPos[String(ax)])+num(d[end?"end_offset_x_mm":"offset_x_mm"]),
           y:absY!=null?num(absY):num(yPos[String(ay)])+num(d[end?"end_offset_y_mm":"offset_y_mm"])}
  };
  const members=all.filter(r=>r.record_type==="scheme_column"||r.data?.entity_type==="column").map(r=>{
   const d=r.data||{},p=point(d),end=point(d,true),kind=String(d.geometry_type||"column"),z0=num(d.z0_mm),z1=num(d.end_z_mm??d.z1_mm??8400);
   const start=[p.x,p.y,z0],finish=kind==="column"?[p.x,p.y,z1]:[end.x,end.y,z1];
   const mid=kind==="bent"||kind==="truss"?[num(d.absolute_mid_x_mm??(p.x+end.x)/2),num(d.absolute_mid_y_mm??(p.y+end.y)/2),num(d.mid_z_mm??z1)]:null;
   const linked=detailById.get(String(d.mark_id??""))||{};
   return{id:String(r.id),markId:String(d.mark_id??""),mark:String(d.mark||linked.mark||r.title||""),
    name:String(linked.name||d.mark_name||""),work:String(linked.work||""),code:String(linked.code||""),
    code2:String(linked.code2||""),qty:linked.qty??null,done:linked.done??null,left:linked.left??null,
    pct:linked.pct??null,unit:String(linked.unit||""),unitVolume:linked.uv??null,totalVolume:linked.total??null,
    type:String(d.scheme_group_label||d.scheme_group||kind),status:String(d.status||"planned"),kind,
    profile:String(d.profile_name||""),section:String(d.section_type||""),
    axis:String(d.axis_x||"")+" / "+String(d.axis_y||""),endAxis:d.end_axis_x&&d.end_axis_y?String(d.end_axis_x)+" / "+String(d.end_axis_y):"",
    start,end:finish,mid}
  }).filter(m=>[...m.start,...m.end].every(Number.isFinite));
  return {axesX:xAxis,axesY:yAxis,x:xPos,y:yPos,members}
 }
 function schemeHtml(data){
  return'<div class="ir-export-scheme"><div class="ir-export-scheme-controls"><b>Монтажная схема · '+data.members.length+' элементов</b><div><button type="button" data-view="3d" class="active" aria-pressed="true">3D</button><button type="button" data-view="plan" aria-pressed="false">План</button><button type="button" data-view="reset">Сбросить вид</button></div></div><div class="ir-export-scheme-stage"><canvas id="ir-export-scheme-canvas" aria-label="Интерактивная монтажная схема. Нажмите на элемент для получения информации"></canvas><div class="ir-export-scheme-member-card" id="ir-export-scheme-member-card" hidden><div class="ir-export-scheme-member-card-head"><span>Информация о марке</span><button class="ir-export-scheme-member-close" type="button" aria-label="Закрыть информацию о марке">✕</button></div><h3 class="ir-export-scheme-member-title"></h3><div class="ir-export-scheme-member-fields"></div></div><span class="ir-export-scheme-hint">ЛКМ — вращение · ПКМ — перемещение · колесо — масштаб · щелчок — сведения о марке</span></div><div class="ir-export-scheme-info" id="ir-export-scheme-info">Просмотр без редактирования. Для выбора элемента нажмите на него.</div></div>'
 }
 function schemeViewer(){
  "use strict";
  const root=document.querySelector(".ir-export-scheme"),cv=document.getElementById("ir-export-scheme-canvas");
  if(!root||!cv)return;
  let data;try{data=JSON.parse(document.getElementById("ir-export-scheme-data").textContent)}catch{return}
  const ctx=cv.getContext("2d");if(!ctx)return;
  const members=Array.isArray(data.members)?data.members:[],xs=Object.values(data.x||{}),ys=Object.values(data.y||{});
  const finite=members.flatMap(m=>[m.start,m.end,...(m.mid?[m.mid]:[])]);
  const gridPoints=xs.flatMap(x=>ys.map(y=>[x,y,0]));
  const positions=finite.length?[...finite,...gridPoints]:[[0,0,0],[Math.max(1000,...xs),Math.max(1000,...ys),8000],...gridPoints];
  const axis=(i)=>positions.map(p=>Number(p[i])||0);
  const extents=[0,1,2].map(i=>({min:Math.min(...axis(i)),max:Math.max(...axis(i))}));
  const center=extents.map(e=>(e.min+e.max)/2);
  const span=Math.max(1000,...extents.map(e=>e.max-e.min));
  let scale=220/span;
  let yaw=-.72,pitch=.6,zoom=1,panX=0,panY=0,plan=false,drag=null,moved=false,hit=[],selectedId=null;
  const memberCard=root.querySelector("#ir-export-scheme-member-card");
  const fmt=v=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:3}).format(Number(v)||0);
  const field=(container,label,value)=>{
   if(value===null||value===undefined||String(value).trim()==="")return;
   const row=document.createElement("div");row.className="ir-export-scheme-member-field";
   const caption=document.createElement("small");caption.textContent=label;
   const cell=document.createElement("b");cell.textContent=String(value);
   row.append(caption,cell);container.append(row)
  };
  function selectMember(m){
   selectedId=m.id;
   const title=memberCard.querySelector(".ir-export-scheme-member-title");
   title.textContent=m.mark||"Без марки";
   const fields=memberCard.querySelector(".ir-export-scheme-member-fields");
   fields.replaceChildren();
   const status=m.status==="mounted"?"Смонтировано":m.status==="partial"?"Частично смонтировано":"Не смонтировано";
   field(fields,"Наименование",m.name);
   field(fields,"Вид работы",workLabel(m.work));
   field(fields,"Шифр",m.code);
   field(fields,"Дополнительный шифр",m.code2);
   field(fields,"Тип элемента",m.type);
   field(fields,"Статус на схеме",status);
   if(m.qty!==null)field(fields,"Всего марок",fmt(m.qty)+" шт.");
   if(m.done!==null)field(fields,"Смонтировано",fmt(m.done)+" шт.");
   if(m.left!==null)field(fields,"Осталось",fmt(m.left)+" шт.");
   if(m.pct!==null)field(fields,"Готовность",fmt(m.pct)+"%");
   if(m.unitVolume!==null&&m.unit)field(fields,"Объём 1 ед.",fmt(m.unitVolume)+" "+m.unit);
   if(m.totalVolume!==null&&m.unit)field(fields,"Общий объём",fmt(m.totalVolume)+" "+m.unit);
   field(fields,"Профиль",m.profile);
   field(fields,"Сечение",m.section);
   field(fields,"Оси",m.axis===" / "?"":m.axis);
   field(fields,"Конечные оси",m.endAxis);
   memberCard.hidden=false;paint()
  }
  memberCard.querySelector(".ir-export-scheme-member-close").onclick=()=>{
   memberCard.hidden=true;selectedId=null;paint()
  };
  const color=m=>m.status==="mounted"?"#2ca47b":m.status==="partial"?"#dcaa57":m.type.includes("column")||m.kind==="column"?"#397bb4":m.type.includes("tie")||m.kind==="brace"?"#d3a255":"#58a18b";
  const raw=p=>{const x=(p[0]-center[0])*scale,y=(p[1]-center[1])*scale,z=(p[2]-center[2])*scale,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);return {x:x*cy-y*sy,y:(x*sy+y*cy)*sp-z*cp,depth:(x*sy+y*cy)*cp+z*sp}};
  const project=p=>{let o=raw(p);return{x:cv.width/2+(o.x+panX)*zoom,y:cv.height/2+(o.y+panY)*zoom,depth:o.depth}};
  const segment=(start,end,c,w)=>{const a=project(start),b=project(end);ctx.lineCap="round";ctx.lineWidth=w;ctx.strokeStyle=c;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();return {a,b}};
  function paint(fit=false){
   const rect=cv.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(360,Math.round(rect.width*dpr)),h=Math.max(250,Math.round(rect.height*dpr));
   if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}
   if(fit){
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const projected=positions.map(p=>{
     const x=p[0]-center[0],y=p[1]-center[1],z=p[2]-center[2];
     return [x*cy-y*sy,(x*sy+y*cy)*sp-z*cp]
    });
    const minX=Math.min(...projected.map(p=>p[0])),maxX=Math.max(...projected.map(p=>p[0]));
    const minY=Math.min(...projected.map(p=>p[1])),maxY=Math.max(...projected.map(p=>p[1]));
    scale=Math.min(.93*w/Math.max(1,maxX-minX),.90*h/Math.max(1,maxY-minY));
    panX=-(minX+maxX)*scale/2;panY=-(minY+maxY)*scale/2
   }
   ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle="#f6faff";ctx.fillRect(0,0,w,h);hit=[];
   const axesX=Array.isArray(data.axesX)?data.axesX:[],axesY=Array.isArray(data.axesY)?data.axesY:[];
   const xa=axesX.map(k=>Number(data.x?.[k])||0),ya=axesY.map(k=>Number(data.y?.[k])||0),xmax=Math.max(1000,...xa),ymax=Math.max(1000,...ya);
   for(const x of xa)segment([x,0,0],[x,ymax,0],"#cfdde9",1);
   for(const y of ya)segment([0,y,0],[xmax,y,0],"#cfdde9",1);
   ctx.font=Math.max(11,11*dpr)+"px Segoe UI";ctx.fillStyle="#6f8fa6";
   xa.forEach((x,i)=>{const p=project([x,0,0]);ctx.fillText(axesX[i],p.x+4,p.y-9)});
   ya.forEach((y,i)=>{const p=project([0,y,0]);ctx.fillText(axesY[i],p.x+5,p.y-9)});
   const segs=members.flatMap(m=>{const parts=m.mid?[[m.start,m.mid],[m.mid,m.end]]:[[m.start,m.end]];return parts.map(([a,b])=>({m,a,b,depth:(raw(a).depth+raw(b).depth)/2}))}).sort((a,b)=>b.depth-a.depth);
   for(const x of segs){
    const selected=x.m.id===selectedId;
    const ab=segment(x.a,x.b,selected?"#0d5fa5":color(x.m),Math.max(selected?8:3,(selected?8:3)*dpr));
    hit.push({...ab,m:x.m})
   }
   const info=document.getElementById("ir-export-scheme-info");
   if(!members.length&&info)info.textContent="Монтажные элементы ещё не размещены на схеме."
  }
  const view3D=root.querySelector('[data-view="3d"]'),viewPlan=root.querySelector('[data-view="plan"]');
  const hint=root.querySelector(".ir-export-scheme-hint");
  function setPlan(enabled){
   plan=Boolean(enabled);yaw=plan?0:-.72;pitch=plan?Math.PI/2:.60;
   zoom=1;panX=0;panY=0;
   view3D.classList.toggle("active",!plan);
   viewPlan.classList.toggle("active",plan);
   view3D.setAttribute("aria-pressed",String(!plan));
   viewPlan.setAttribute("aria-pressed",String(plan));
   if(hint)hint.textContent=plan?"План · перетаскивание — перемещение · колесо — масштаб":"3D · ЛКМ — вращение · ПКМ — перемещение · колесо — масштаб";
   paint(true)
  }
  const reset=()=>setPlan(plan);
  view3D.onclick=()=>setPlan(false);
  viewPlan.onclick=()=>setPlan(true);
  root.querySelector('[data-view="reset"]').onclick=reset;
  cv.addEventListener("contextmenu",e=>e.preventDefault());
  cv.addEventListener("pointerdown",e=>{drag={x:e.clientX,y:e.clientY,button:e.button,yaw,pitch,panX,panY};moved=false;cv.setPointerCapture(e.pointerId)});
  cv.addEventListener("pointermove",e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;if(drag.button===2||e.shiftKey){panX=drag.panX+dx;panY=drag.panY+dy}else if(!plan){yaw=drag.yaw+dx*.008;pitch=Math.max(.06,Math.min(1.5,drag.pitch+dy*.006))}else{panX=drag.panX+dx;panY=drag.panY+dy}paint()});
  cv.addEventListener("pointerup",e=>{if(!drag)return;drag=null;if(moved)return;const rect=cv.getBoundingClientRect(),px=(e.clientX-rect.left)*(cv.width/rect.width),py=(e.clientY-rect.top)*(cv.height/rect.height);
   const distance=seg=>{const a=seg.a,b=seg.b,dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((px-a.x)*dx+(py-a.y)*dy)/Math.max(1,dx*dx+dy*dy)));return Math.hypot(px-a.x-t*dx,py-a.y-t*dy)};
   const found=hit.map(s=>({s,d:distance(s)})).sort((a,b)=>a.d-b.d)[0];
   const hitThreshold=18*(cv.width/Math.max(1,rect.width));
   if(found?.d<hitThreshold)selectMember(found.s.m)
  });
  cv.addEventListener("wheel",e=>{e.preventDefault();zoom=Math.max(.2,Math.min(9,zoom*(e.deltaY>0?.90:1.10)));paint()},{passive:false});
  if(typeof ResizeObserver==="function")new ResizeObserver(()=>paint(true)).observe(cv);
  window.addEventListener("resize",()=>paint(true));paint(true)
 }
 const css=String.raw`
.ir-export-gallery{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.ir-export-gallery-tile{position:relative;display:block;aspect-ratio:4/3;border:1px solid #d7e5ed;border-radius:8px;overflow:hidden;background:#ebf1f5}
.ir-export-gallery-tile img{display:block;width:100%;height:100%;object-fit:cover}
.ir-export-gallery-tile span{position:absolute;bottom:0;left:0;right:0;padding:17px 10px 8px;color:white;background:linear-gradient(transparent,rgba(10,27,39,.83));font-size:11px}
.ir-export-gallery-lightbox{display:none;position:fixed;inset:0;z-index:500;align-items:center;justify-content:center;padding:30px;background:rgba(8,21,37,.94)}
.ir-export-gallery-lightbox:target{display:flex}
.ir-export-gallery-shade{position:absolute;inset:0}
.ir-export-gallery-lightbox figure{position:relative;max-width:min(98vw,1400px);max-height:95vh;margin:0}
.ir-export-gallery-lightbox img{max-width:100%;max-height:85vh;object-fit:contain}
.ir-export-gallery-lightbox figcaption{display:flex;align-items:center;justify-content:space-between;gap:20px;color:white;padding:10px}
.ir-export-gallery-lightbox figcaption a{color:white;text-decoration:none;padding:7px 10px;border-radius:7px;background:#2e5773}
.ir-export-invoice-list{display:grid;gap:8px}
.ir-export-invoice{display:block!important;padding:0!important}
.ir-export-invoice-summary{list-style:none;display:grid;grid-template-columns:1fr 1fr 1.5fr 1fr 25px;align-items:center;gap:12px;cursor:pointer;padding:15px}
.ir-export-invoice-summary::-webkit-details-marker{display:none}
.ir-export-invoice>details[open]>summary{background:#f2f9ff;border-bottom:1px solid #e1eaf1}
.ir-export-invoice-arrow{font-size:22px;color:#4386ad}.ir-export-invoice>details[open] .ir-export-invoice-arrow{transform:rotate(180deg)}
.ir-export-invoice-details{padding:15px;background:#fbfdff}
.ir-export-invoice-details h3{margin:0 0 10px;font-size:12px}
.ir-export-delivery-detail{display:grid;grid-template-columns:2fr 1fr auto;gap:10px;padding:9px 0;border-bottom:1px solid #e4edf3;font-size:12px}
.ir-export-invoice-more{border:1px solid #d7e8f3;border-radius:8px;background:#f2f9ff}
.ir-export-invoice-more>summary{cursor:pointer;list-style:none;text-align:center;color:#2c73a3;padding:12px;font-size:12px;font-weight:750}
.ir-export-invoice-more>summary::-webkit-details-marker{display:none}
.ir-export-invoice-more-close{display:none}.ir-export-invoice-more[open] .ir-export-invoice-more-open{display:none}.ir-export-invoice-more[open] .ir-export-invoice-more-close{display:inline}
.ir-export-invoice-more-rows{display:grid;gap:8px;padding:10px;background:white}
.ir-export-scheme{border:1px solid #d9e5ee;border-radius:12px;background:#fff;overflow:hidden}
.ir-export-scheme-controls{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:13px 17px;background:#f4f9fe;border-bottom:1px solid #dae7f0}
.ir-export-scheme-controls b{font-size:13px;color:#224b65}
.ir-export-scheme-controls>div{display:flex;gap:6px;flex-wrap:wrap}
.ir-export-scheme-controls button{cursor:pointer;border:1px solid #d1e0e9;background:white;color:#4c738d;padding:8px 13px;font-size:11px;font-weight:750;border-radius:7px}
.ir-export-scheme-controls button.active,.ir-export-scheme-controls button:hover{background:#236fa9;color:white;border-color:#236fa9}
.ir-export-scheme-stage{position:relative;height:min(68vh,660px);min-height:350px;background:#f6faff}
.ir-export-scheme-stage canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}
.ir-export-scheme-hint{position:absolute;left:12px;bottom:12px;color:#60829a;background:#fff;border:1px solid #e0eaf2;border-radius:7px;padding:7px 10px;font-size:10px;pointer-events:none}
.ir-export-scheme-info{padding:11px 17px;color:#5e7f94;font-size:11px;border-top:1px solid #e1ebf2}
.ir-export-scheme-member-card{position:absolute;right:18px;top:16px;z-index:5;width:min(370px,calc(100% - 36px));max-height:calc(100% - 95px);overflow-y:auto;padding:0 17px 15px;background:rgba(255,255,255,.98);border:1px solid #c6dcea;border-radius:12px;box-shadow:0 10px 35px rgba(21,64,94,.23);font-family:'Segoe UI',Arial,sans-serif}
.ir-export-scheme-member-card[hidden]{display:none!important}
.ir-export-scheme-member-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;position:sticky;top:0;padding:13px 0 10px;background:#fff;border-bottom:1px solid #e3ecf2}
.ir-export-scheme-member-card-head span{font-size:10px;color:#728fa1;font-weight:800;text-transform:uppercase;letter-spacing:.6px}
.ir-export-scheme-member-close{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0!important;border:1px solid #d8e7f0!important;border-radius:8px;background:#f5faff!important;color:#386d8f!important;cursor:pointer}
.ir-export-scheme-member-card h3{color:#174863;margin:13px 0;font-size:20px;font-weight:800}
.ir-export-scheme-member-fields{display:grid;gap:0}
.ir-export-scheme-member-field{display:grid;grid-template-columns:43% minmax(0,1fr);align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #edf2f6}
.ir-export-scheme-member-field:last-child{border-bottom:0}
.ir-export-scheme-member-field small{font-size:11px;color:#829bab}
.ir-export-scheme-member-field b{font-size:12px;font-weight:700;color:#254f69;overflow-wrap:anywhere}
@media(max-width:750px){.ir-export-scheme-member-card{right:8px;top:8px;width:min(340px,calc(100% - 16px));max-height:72%}}
.ir-export-mark-code{display:grid;gap:3px}.ir-export-mark-code small{font-size:10px;color:#7893a7}
@media(max-width:900px){.ir-export-gallery{grid-template-columns:repeat(3,minmax(0,1fr))}.ir-export-invoice-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:540px){.ir-export-gallery{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
 window.irObjectExportExtras={deliveries,recentPhotos,schemeData,schemeHtml,schemeViewer,css};
})();
