"use strict";
/* Standalone HTML export helpers only. They never change IR Project data. */
(()=>{
 const workLabel=(v,context="base")=>window.irWorkNames?.format?.(v,context)||String(v??"");
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
  const normalize=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
  const uniqueByMark=new Map(),uniqueByWork=new Map();
  for(const m of arr(markDetails)){
   const name=normalize(m.mark),wid=String(m.workId||"");
   if(!name)continue;
   const key=wid+"|"+name;
   if(!uniqueByWork.has(key))uniqueByWork.set(key,m);else uniqueByWork.set(key,null);
   if(!uniqueByMark.has(name))uniqueByMark.set(name,m);else uniqueByMark.set(name,null)
  }
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
   const markName=String(d.mark||r.title||""),markId=String(d.mark_id??"");
   const linked=detailById.get(markId)||uniqueByWork.get(String(d.work_type_id||"")+"|"+normalize(markName))||uniqueByMark.get(normalize(markName))||{};
   const count=Number(linked.qty),done=Number(linked.done);
   const validProgress=linked.qty!=null&&Number.isFinite(count)&&count>0&&linked.done!=null&&Number.isFinite(done);
   const status=validProgress?(done>=count-1e-9?"mounted":done>0?"partial":"planned"):String(d.status||"planned");
   return{id:String(r.id),markId:String(d.mark_id??""),mark:String(d.mark||linked.mark||r.title||""),
    name:String(linked.name||d.mark_name||""),work:String(linked.work||""),code:String(linked.code||""),
    code2:String(linked.code2||""),qty:linked.qty??null,done:linked.done??null,left:linked.left??null,
    pct:linked.pct??null,unit:String(linked.unit||""),unitVolume:linked.uv??null,totalVolume:linked.total??null,
    type:String(d.scheme_group_label||d.scheme_group||kind),group:String(d.scheme_group||kind),status,kind,
    profile:String(d.profile_name||""),section:String(d.section_type||""),
    axis:String(d.axis_x||"")+" / "+String(d.axis_y||""),endAxis:d.end_axis_x&&d.end_axis_y?String(d.end_axis_x)+" / "+String(d.end_axis_y):"",
    start,end:finish,mid}
  }).filter(m=>[...m.start,...m.end].every(Number.isFinite));
  return {axesX:xAxis,axesY:yAxis,x:xPos,y:yPos,members}
 }
 function schemeHtml(data){
  const views=[["3d","3D"],["top","Сверху"],["front","Фасад"],["side","Сбоку"]];
  const viewBtns=views.map(([id,label])=>'<button type="button" data-view="'+id+'" class="'+(id==="3d"?"active":"")+'" aria-pressed="'+String(id==="3d")+'">'+label+'</button>').join("");
  return'<div class="ir-export-scheme" data-mode="real">'+
   '<div class="ir-export-scheme-controls" role="toolbar" aria-label="Просмотр монтажной схемы"><div class="ir-export-scheme-toolbar">'+
   '<button type="button" data-tool="layers" aria-expanded="false">▦ Слои</button>'+
   '<button type="button" data-tool="cuts" aria-expanded="false">▤ Разрезы</button>'+
   '<button type="button" data-tool="dimensions" aria-pressed="false">↔ Размеры</button>'+
   '<button type="button" data-tool="labels" aria-pressed="false">⌗ Подписи</button>'+
   '<button type="button" data-tool="colors" aria-label="Режим раскраски" aria-pressed="false">◉ Цвет: статус</button>'+
   '<button type="button" data-tool="render" class="active" aria-pressed="true">⬡ Реалистичный 3D</button>'+
   '<button type="button" data-view="reset">↺ Сбросить вид</button></div>'+
   '<div class="ir-export-scheme-viewbuttons" role="group" aria-label="Ракурс схемы">'+viewBtns+'</div></div>'+
   '<div class="ir-export-scheme-filters" data-scheme-filters>'+
   '<div class="ir-export-scheme-filter" data-panel="layers" hidden><div class="ir-export-scheme-filterhead"><strong>Слои модели</strong><button type="button" data-close-panel="layers" aria-label="Закрыть слои">×</button></div><div class="ir-export-scheme-layer-list"></div></div>'+
   '<div class="ir-export-scheme-filter" data-panel="cuts" hidden><div class="ir-export-scheme-filterhead"><strong>Разрезы / диапазоны, мм</strong><button type="button" data-close-panel="cuts" aria-label="Закрыть разрезы">×</button></div><div class="ir-export-scheme-cut-list"></div><button type="button" data-reset-cuts>Сбросить разрезы</button></div></div>'+
   '<div class="ir-export-scheme-stage"><canvas id="ir-export-scheme-canvas" aria-label="Реалистичная интерактивная монтажная схема"></canvas>'+
   '<div class="ir-export-scheme-member-card" id="ir-export-scheme-member-card" hidden><div class="ir-export-scheme-member-card-head"><span>Свойства конструкции</span><button class="ir-export-scheme-member-close" type="button" aria-label="Закрыть информацию о марке">✕</button></div><h3 class="ir-export-scheme-member-title"></h3><div class="ir-export-scheme-member-fields"></div></div>'+
   '<span class="ir-export-scheme-hint">ЛКМ — вращение · ПКМ — перемещение · колесо — масштаб · выбор элемента — информация</span></div>'+
   '<div class="ir-export-scheme-info" id="ir-export-scheme-info">Всего элементов: '+data.members.length+'. Только просмотр, без изменения базы данных.</div></div>'
 }
 function schemeViewer(){
  "use strict";
  const root=document.querySelector(".ir-export-scheme"),cv=root?.querySelector("#ir-export-scheme-canvas"),ctx=cv?.getContext("2d");
  if(!root||!cv||!ctx)return;
  let data;try{data=JSON.parse(document.getElementById("ir-export-scheme-data").textContent)}catch{return}
  const arr=v=>Array.isArray(v)?v:[],num=v=>Number.isFinite(Number(v))?Number(v):0,fmt=v=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(num(v));
  const members=arr(data.members),xs=Object.values(data.x||{}).map(num),ys=Object.values(data.y||{}).map(num);
  const vertices=members.flatMap(m=>[m.start,m.end,...(m.mid?[m.mid]:[])]),gridPoints=xs.flatMap(x=>ys.map(y=>[x,y,0]));
  const positions=vertices.length?[...vertices,...gridPoints]:[[0,0,0],[Math.max(1000,...xs),Math.max(1000,...ys),8000],...gridPoints];
  const range=i=>{const v=positions.map(p=>num(p[i]));return [Math.min(...v),Math.max(...v)]};
  const bounds=[0,1,2].map(range),center=bounds.map(([a,b])=>(a+b)/2),span=Math.max(1000,...bounds.map(([a,b])=>b-a));
  const statusName=s=>s==="mounted"?"Смонтировано":s==="partial"?"Частично смонтировано":"Не смонтировано";
  const types=[...new Set(members.map(m=>String(m.group||m.kind||m.type||"other")))].sort((a,b)=>a.localeCompare(b,"ru"));
  const shownTypes=new Set(types),cuts=bounds.map(([min,max])=>[min,max]);
  const state={view:"3d",real:true,colors:"status",layers:false,cutPanel:false,dimensions:false,labels:false,grid:true};
  let scale=1,yaw=-.72,pitch=.6,zoom=1,panX=0,panY=0,drag=null,moved=false,hits=[],selectedId=null;
  const $=selector=>root.querySelector(selector),$$=selector=>[...root.querySelectorAll(selector)];
  const card=$("#ir-export-scheme-member-card"),hint=$(".ir-export-scheme-hint"),info=$("#ir-export-scheme-info");
  const field=(area,label,value)=>{
   if(value==null||String(value).trim()==="")return;
   const el=document.createElement("div"),small=document.createElement("small"),bold=document.createElement("b");
   el.className="ir-export-scheme-member-field";small.textContent=label;bold.textContent=String(value);el.append(small,bold);area.append(el)
  };
  function selectMember(member){
   selectedId=member.id;
   card.querySelector(".ir-export-scheme-member-title").textContent=member.mark||"Без марки";
   const list=card.querySelector(".ir-export-scheme-member-fields");list.replaceChildren();
   field(list,"Наименование",member.name);
   field(list,"Вид работы",member.work);
   field(list,"Шифр",member.code);
   field(list,"Дополнительный шифр",member.code2);
   field(list,"Категория",member.type);
   field(list,"Статус",statusName(member.status));
   if(member.qty!=null)field(list,"Всего марок",fmt(member.qty)+" шт.");
   if(member.done!=null)field(list,"Смонтировано",fmt(member.done)+" шт.");
   if(member.left!=null)field(list,"Осталось",fmt(member.left)+" шт.");
   if(member.pct!=null)field(list,"Готовность",fmt(member.pct)+"%");
   if(member.unitVolume!=null&&member.unit)field(list,"Объём 1 ед.",fmt(member.unitVolume)+" "+member.unit);
   if(member.totalVolume!=null&&member.unit)field(list,"Общий объём",fmt(member.totalVolume)+" "+member.unit);
   field(list,"Профиль",member.profile);field(list,"Сечение",member.section);
   field(list,"Начальная ось",member.axis===" / "?"":member.axis);
   field(list,"Конечная ось",member.endAxis);
   field(list,"Начало, мм",member.start.map(fmt).join(" · "));
   field(list,"Конец, мм",member.end.map(fmt).join(" · "));
   field(list,"Длина, мм",fmt(Math.hypot(...member.start.map((v,i)=>num(member.end[i])-num(v)))));
   card.hidden=false;paint()
  }
  card.querySelector(".ir-export-scheme-member-close").addEventListener("click",()=>{card.hidden=true;selectedId=null;paint()});
  const groupOf=m=>String(m.group||m.kind||m.type||"other");
  const visible=m=>{
   if(!shownTypes.has(groupOf(m)))return false;
   const parts=[m.start,m.end,...(m.mid?[m.mid]:[])];
   return [0,1,2].every(i=>parts.some(p=>num(p[i])>=cuts[i][0]&&num(p[i])<=cuts[i][1]))
  };
  const palette={"columns":"#6594b8","fahwerk":"#7e9dcb","girders":"#708bbf","purlins":"#b69c75","spacers":"#8ca5b9","ties":"#b5a2d1","beams":"#619bb6","posts":"#659faa"};
  const hash=value=>{let n=2166136261;for(const c of String(value)){n=Math.imul(n^c.charCodeAt(0),16777619)}return(n>>>0)%360};
  const markColor=m=>{const h=hash(m.mark);return hslHex(h,52,54)};
  function hslHex(h,s,l){s/=100;l/=100;const a=s*Math.min(l,1-l),f=n=>{const k=(n+h/30)%12,c=l-a*Math.max(-1,Math.min(k-3,9-k,1));return Math.round(255*c).toString(16).padStart(2,"0")};return"#"+f(0)+f(8)+f(4)}
  const tint=(color,ratio)=>{const hex=color.replace("#",""),n=parseInt(hex,16),rgb=[(n>>16)&255,(n>>8)&255,n&255];return"#"+rgb.map(v=>Math.max(0,Math.min(255,Math.round(v*ratio+(ratio>1?10:0)))).toString(16).padStart(2,"0")).join("")};
  const mainColor=m=>state.colors==="mark"?markColor(m):state.colors==="type"?(palette[groupOf(m)]||hslHex(hash(groupOf(m)),38,52)):m.status==="mounted"?"#269d73":m.status==="partial"?"#dba347":"#c65e66";
  const projectRaw=point=>{
   const x=(num(point[0])-center[0])*scale,y=(num(point[1])-center[1])*scale,z=(num(point[2])-center[2])*scale;
   const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
   return{x:x*cy-y*sy,y:(x*sy+y*cy)*sp-z*cp,depth:(x*sy+y*cy)*cp+z*sp}
  };
  const screen=p=>{const q=projectRaw(p);return{x:cv.width/2+(q.x+panX)*zoom,y:cv.height/2+(q.y+panY)*zoom,depth:q.depth}};
  function fitCamera(){
   const pts=positions.map(projectRaw),minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y));
   scale*=Math.min(.91*cv.width/Math.max(1,maxX-minX),.86*cv.height/Math.max(1,maxY-minY));
   const centerXY=positions.map(projectRaw);panX=-(Math.min(...centerXY.map(p=>p.x))+Math.max(...centerXY.map(p=>p.x)))/2;
   panY=-(Math.min(...centerXY.map(p=>p.y))+Math.max(...centerXY.map(p=>p.y)))/2;zoom=1
  }
  const addFace=(faces,points,color,light)=>{
   const projected=points.map(screen);
   faces.push({points:projected,depth:projected.reduce((n,p)=>n+p.depth,0)/projected.length,color:tint(color,light)})
  };
  const vec=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const normal=a=>{const len=Math.hypot(...a)||1;return a.map(v=>v/len)};
  const add=(a,b,c)=>a.map((v,i)=>v+b[i]*c);
  function prism(faces,member,start,end){
   const dir=normal(vec(end,start)),ref=Math.abs(dir[2])>.90?[1,0,0]:[0,0,1],u=normal(cross(dir,ref)),v=normal(cross(dir,u));
   const kind=groupOf(member),base=Math.max(140,Math.min(400,span/180)),width=base*(kind==="columns"?1.4:kind==="beams"||kind==="girders"?1.12:kind==="ties"?.62:.82),depth=width*.55;
   const corner=(p,ui,vi)=>add(add(p,u,ui*width/2),v,vi*depth/2);
   const a=[corner(start,-1,-1),corner(start,1,-1),corner(start,1,1),corner(start,-1,1)],b=[corner(end,-1,-1),corner(end,1,-1),corner(end,1,1),corner(end,-1,1)];
   const color=mainColor(member);
   addFace(faces,[a[0],a[1],b[1],b[0]],color,.82);
   addFace(faces,[a[1],a[2],b[2],b[1]],color,1.10);
   addFace(faces,[a[2],a[3],b[3],b[2]],color,.63);
   addFace(faces,[a[3],a[0],b[0],b[3]],color,.97);
   addFace(faces,a,color,.75);addFace(faces,b,color,1.16)
  }
  function line(a,b,color,width=1){
   const x=screen(a),y=screen(b);ctx.beginPath();ctx.moveTo(x.x,x.y);ctx.lineTo(y.x,y.y);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap="round";ctx.stroke();return{x,y}
  }
  const dimension=(a,b,text)=>{
   const x=screen(a),y=screen(b),mx=(x.x+y.x)/2,my=(x.y+y.y)/2;
   ctx.strokeStyle="#86a1b5";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x.x,x.y);ctx.lineTo(y.x,y.y);ctx.stroke();
   ctx.fillStyle="#476d88";ctx.font=Math.max(10,10*(cv.width/Math.max(1,cv.clientWidth)))+"px Segoe UI";
   ctx.fillText(text, mx+5,my-8)
  };
  function paint(fit=false){
   const rect=cv.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(360,Math.round(rect.width*dpr)),h=Math.max(260,Math.round(rect.height*dpr));
   const resize=cv.width!==w||cv.height!==h;if(resize){cv.width=w;cv.height=h}
   if(fit||resize)fitCamera();
   ctx.setTransform(1,0,0,1,0,0);
   const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,"#fdfefe");bg.addColorStop(1,"#edf5fa");ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);hits=[];
   const ax=arr(data.axesX),ay=arr(data.axesY),xa=ax.map(v=>num(data.x?.[v])),ya=ay.map(v=>num(data.y?.[v])),xmax=Math.max(1000,...xa),ymax=Math.max(1000,...ya);
   if(state.grid){
    for(const x of xa)line([x,0,0],[x,ymax,0],"#cee0e9",1);
    for(const y of ya)line([0,y,0],[xmax,y,0],"#cee0e9",1);
    const dprFont=Math.max(10,11*dpr);ctx.font=dprFont+"px Segoe UI";ctx.fillStyle="#62829a";
    ax.forEach((label,i)=>{const p=screen([xa[i],0,0]);ctx.fillText(label,p.x+5,p.y-9)});
    ay.forEach((label,i)=>{const p=screen([0,ya[i],0]);ctx.fillText(label,p.x+5,p.y-9)})
   }
   if(state.dimensions){
    for(let i=1;i<xa.length;i++)dimension([xa[i-1],0,0],[xa[i],0,0],fmt(xa[i]-xa[i-1])+" мм");
    for(let i=1;i<ya.length;i++)dimension([0,ya[i-1],0],[0,ya[i],0],fmt(ya[i]-ya[i-1])+" мм")
   }
   const shown=members.filter(visible),segments=shown.flatMap(m=>(m.mid?[[m.start,m.mid],[m.mid,m.end]]:[[m.start,m.end]]).map(([a,b])=>({m,a,b,depth:(screen(a).depth+screen(b).depth)/2})));
   if(state.real&&state.view!=="top"){
    const faces=[];for(const seg of segments)prism(faces,seg.m,seg.a,seg.b);
    faces.sort((a,b)=>b.depth-a.depth);
    for(const face of faces){
     ctx.beginPath();ctx.moveTo(face.points[0].x,face.points[0].y);
     for(let i=1;i<face.points.length;i++)ctx.lineTo(face.points[i].x,face.points[i].y);
     ctx.closePath();ctx.fillStyle=face.color;ctx.fill();
     ctx.strokeStyle="rgba(19,54,77,.15)";ctx.lineWidth=.75*dpr;ctx.stroke()
    }
   }else{
    segments.sort((a,b)=>b.depth-a.depth);
    for(const seg of segments){line(seg.a,seg.b,"#708ba133",7*dpr);line(seg.a,seg.b,mainColor(seg.m),Math.max(2.5,4*dpr))}
   }
   for(const seg of segments){
    if(seg.m.id===selectedId)line(seg.a,seg.b,"#1679de",3.5*dpr);
    const a=screen(seg.a),b=screen(seg.b);hits.push({m:seg.m,a,b})
   }
   if(state.labels){
    const font=Math.max(9,10*dpr);ctx.font="700 "+font+"px Segoe UI";ctx.textAlign="center";
    const rendered=new Set();
    for(const member of shown){
     if(rendered.has(member.id))continue;rendered.add(member.id);
     const middle=(member.mid||member.start.map((v,i)=>(num(v)+num(member.end[i]))/2)),p=screen(middle);
     ctx.lineWidth=3*dpr;ctx.strokeStyle="#fff";ctx.strokeText(String(member.mark||""),p.x,p.y-9*dpr);
     ctx.fillStyle="#254d69";ctx.fillText(String(member.mark||""),p.x,p.y-9*dpr)
    }
    ctx.textAlign="left"
   }
   if(info)info.textContent="Показано "+shown.length+" из "+members.length+" элементов · "+(state.real?"Реалистичный 3D":"Схематичный вид")+" · "+(state.colors==="status"?"Цвет по статусу":state.colors==="type"?"Цвет по видам":"Цвет по маркам")+". Просмотр без редактирования."
  }
  function camera(view){
   state.view=view;yaw=view==="top"?0:view==="front"?0:view==="side"?Math.PI/2:-.72;
   pitch=view==="top"?Math.PI/2:view==="front"||view==="side"?0:.6;
   panX=0;panY=0;zoom=1;
   $$("[data-view]").forEach(el=>{const active=el.dataset.view===view;el.classList.toggle("active",active);if(el.dataset.view!=="reset")el.setAttribute("aria-pressed",String(active))});
   if(hint)hint.textContent=view==="top"?"Сверху · перетаскивание — перемещение · колесо — масштаб":"ЛКМ — вращение · ПКМ — перемещение · колесо — масштаб · щелчок — информация";
   paint(true)
  }
  $$("[data-view]").forEach(button=>button.addEventListener("click",()=>{if(button.dataset.view==="reset")camera(state.view);else camera(button.dataset.view)}));
  const panel=key=>$('[data-panel="'+key+'"]');
  function togglePanel(key,open){
   panel(key).hidden=!open;const button=$('[data-tool="'+key+'"]');button.classList.toggle("active",open);button.setAttribute("aria-expanded",String(open))
  }
  for(const key of ["layers","cuts"]){
   $('[data-tool="'+key+'"]').addEventListener("click",()=>togglePanel(key,panel(key).hidden));
   $('[data-close-panel="'+key+'"]').addEventListener("click",()=>togglePanel(key,false))
  }
  const layers=$(".ir-export-scheme-layer-list");
  function layerCheckbox(key,label,count,checked){
   const wrapper=document.createElement("label"),input=document.createElement("input"),span=document.createElement("span");
   input.type="checkbox";input.value=key;input.checked=checked;span.textContent=label+" · "+count;wrapper.append(input,span);layers.append(wrapper);
   input.addEventListener("change",()=>{if(key==="@grid")state.grid=input.checked;else if(input.checked)shownTypes.add(key);else shownTypes.delete(key);paint()})
  }
  layerCheckbox("@grid","Сетка осей",arr(data.axesX).length*arr(data.axesY).length,true);
  for(const type of types)layerCheckbox(type,{"columns":"Колонны","fahwerk":"Фахверки","girders":"Ригели","purlins":"Прогоны","spacers":"Распорки","ties":"Связи","beams":"Балки","posts":"Стойки"}[type]||type,members.filter(m=>groupOf(m)===type).length,true);
  const cutList=$(".ir-export-scheme-cut-list");
  for(let index=0;index<3;index++){
   const wrap=document.createElement("div"),label=document.createElement("div");wrap.className="ir-export-scheme-cut-row";
   const minInput=document.createElement("input"),maxInput=document.createElement("input"),min=bounds[index][0],max=bounds[index][1];
   label.textContent=["X","Y","Z"][index]+" · "+fmt(min)+" — "+fmt(max)+" мм";
   for(const [input,val] of [[minInput,min],[maxInput,max]]){input.type="range";input.min=String(min);input.max=String(max);input.step="1";input.value=String(val)}
   minInput.setAttribute("aria-label","Минимальная "+["X","Y","Z"][index]);
   maxInput.setAttribute("aria-label","Максимальная "+["X","Y","Z"][index]);
   const update=()=>{let a=num(minInput.value),b=num(maxInput.value);if(a>b){if(document.activeElement===minInput)maxInput.value=String(a);else minInput.value=String(b);a=num(minInput.value);b=num(maxInput.value)}
    cuts[index]=[a,b];label.textContent=["X","Y","Z"][index]+" · "+fmt(a)+" — "+fmt(b)+" мм";paint()};
   minInput.addEventListener("input",update);maxInput.addEventListener("input",update);wrap.append(label,minInput,maxInput);cutList.append(wrap)
  }
  $("[data-reset-cuts]").addEventListener("click",()=>{cutList.querySelectorAll(".ir-export-scheme-cut-row").forEach((row,i)=>{const controls=row.querySelectorAll('input[type="range"]');controls[0].value=String(bounds[i][0]);controls[1].value=String(bounds[i][1]);cuts[i]=bounds[i].slice();row.firstChild.textContent=["X","Y","Z"][i]+" · "+fmt(cuts[i][0])+" — "+fmt(cuts[i][1])+" мм"});paint()});
  for(const key of ["dimensions","labels"])$('[data-tool="'+key+'"]').addEventListener("click",()=>{state[key]=!state[key];const btn=$('[data-tool="'+key+'"]');btn.classList.toggle("active",state[key]);btn.setAttribute("aria-pressed",String(state[key]));paint()});
  const colors=$('[data-tool="colors"]'),render=$('[data-tool="render"]'),colorModes=["status","type","mark"];
  colors.addEventListener("click",()=>{state.colors=colorModes[(colorModes.indexOf(state.colors)+1)%colorModes.length];colors.textContent={"status":"◉ Цвет: статус","type":"◉ Цвет: виды","mark":"◉ Цвет: марки"}[state.colors];colors.classList.toggle("active",state.colors!=="status");colors.setAttribute("aria-pressed",String(state.colors!=="status"));paint()});
  render.addEventListener("click",()=>{state.real=!state.real;root.dataset.mode=state.real?"real":"simple";render.textContent=state.real?"⬡ Реалистичный 3D":"▤ Обычный 3D";render.classList.toggle("active",state.real);render.setAttribute("aria-pressed",String(state.real));paint()});
  cv.addEventListener("contextmenu",event=>event.preventDefault());
  cv.addEventListener("pointerdown",event=>{drag={x:event.clientX,y:event.clientY,button:event.button,yaw,pitch,panX,panY};moved=false;try{cv.setPointerCapture(event.pointerId)}catch{}});
  cv.addEventListener("pointermove",event=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y,dpr=cv.width/Math.max(1,cv.clientWidth);
   if(Math.abs(dx)+Math.abs(dy)>3)moved=true;
   if(drag.button===2||event.shiftKey||state.view==="top"){panX=drag.panX+dx*dpr;panY=drag.panY+dy*dpr}
   else{yaw=drag.yaw+dx*.008;pitch=Math.max(0,Math.min(Math.PI/2,drag.pitch+dy*.006))}
   paint()});
  cv.addEventListener("pointerup",event=>{if(!drag)return;drag=null;if(moved)return;
   const rect=cv.getBoundingClientRect(),dpr=cv.width/Math.max(1,rect.width),x=(event.clientX-rect.left)*dpr,y=(event.clientY-rect.top)*dpr;
   const distance=s=>{const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,t=Math.max(0,Math.min(1,((x-s.a.x)*dx+(y-s.a.y)*dy)/Math.max(.1,dx*dx+dy*dy)));return Math.hypot(x-s.a.x-t*dx,y-s.a.y-t*dy)};
   const winner=hits.map(seg=>({seg,dist:distance(seg)})).sort((a,b)=>a.dist-b.dist)[0];
   if(winner&&winner.dist<Math.max(12,15*dpr))selectMember(winner.seg.m);
   // Clicking away must not silently dismiss the mark information card.
  });
  cv.addEventListener("pointercancel",()=>{drag=null});
  cv.addEventListener("wheel",event=>{event.preventDefault();zoom=Math.max(.15,Math.min(12,zoom*(event.deltaY>0?.90:1.11)));paint()},{passive:false});
  if(typeof ResizeObserver==="function")new ResizeObserver(()=>paint()).observe(cv);
  window.addEventListener("resize",()=>paint());camera("3d")
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

/* Standalone 3D scene controls use the same action layout as the live scheme. */
.ir-export-scheme-controls{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:12px 14px;background:#f6f9fc}
.ir-export-scheme-toolbar,.ir-export-scheme-viewbuttons{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.ir-export-scheme-controls button,.ir-export-scheme-filters button{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:0;padding:9px 11px!important;border:1px solid #cfdde8!important;border-radius:8px!important;background:#fff!important;color:#365d78!important;font:750 11px/1.3 'Segoe UI',Arial,sans-serif!important;box-shadow:0 1px 5px #183c5b10!important;cursor:pointer!important}
.ir-export-scheme-controls button.active,.ir-export-scheme-controls button[aria-pressed=true],.ir-export-scheme-controls button[aria-expanded=true]{background:#e1effb!important;color:#18639c!important;border-color:#9fc5e6!important}
.ir-export-scheme-controls button:hover,.ir-export-scheme-filters button:hover{background:#edf5fc!important}
.ir-export-scheme-stage{position:relative!important;isolation:isolate;min-height:500px;background:linear-gradient(#fdfefe,#eef5fa)}
.ir-export-scheme-stage canvas{width:100%;height:100%;display:block;touch-action:none;cursor:grab}
.ir-export-scheme-stage canvas:active{cursor:grabbing}
.ir-export-scheme-filters{display:flex;gap:9px;flex-wrap:wrap;padding:0 12px}
.ir-export-scheme-filters:empty{display:none}
.ir-export-scheme-filter{flex:1 1 330px;max-width:620px;min-width:0;padding:12px;margin:10px 0;border:1px solid #cfdfea;border-radius:9px;background:#fff}
.ir-export-scheme-filter[hidden],.ir-export-scheme-member-card[hidden]{display:none!important}
.ir-export-scheme-filterhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px;color:#264c65;font-size:12px}
.ir-export-scheme-filterhead button{width:29px;height:29px;padding:0!important;font-size:18px!important}
.ir-export-scheme-layer-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.ir-export-scheme-layer-list label{display:flex;gap:8px;align-items:center;font:650 11px/1.4 'Segoe UI',Arial,sans-serif;color:#31556d;cursor:pointer}
.ir-export-scheme-layer-list input{display:inline-block!important;visibility:visible!important;opacity:1!important;width:15px;height:15px;accent-color:#257cbd;pointer-events:auto!important}
.ir-export-scheme-cut-list{display:grid;gap:10px;margin-bottom:10px}
.ir-export-scheme-cut-row{display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:8px}
.ir-export-scheme-cut-row>div{grid-column:1/-1;font:650 11px/1.4 'Segoe UI',Arial,sans-serif;color:#426780}
.ir-export-scheme-cut-row input[type=range]{display:block!important;visibility:visible!important;opacity:1!important;width:100%;height:16px;accent-color:#287fc0;pointer-events:auto!important}
.ir-export-scheme-member-card{display:block;z-index:15!important;pointer-events:auto!important;box-shadow:0 8px 30px rgba(15,54,82,.22)}
.ir-export-scheme-member-card .ir-export-scheme-member-close{display:inline-flex!important;visibility:visible!important;pointer-events:auto!important}
.ir-export-scheme-hint{max-width:calc(100% - 24px);line-height:1.5}
@media(max-width:760px){.ir-export-scheme-controls{padding:10px!important}.ir-export-scheme-toolbar{flex:1 1 100%}.ir-export-scheme-controls button{padding:8px 9px!important;font-size:10px!important}.ir-export-scheme-hint{font-size:9px}.ir-export-scheme-stage{min-height:360px}}
@media print{.ir-export-scheme-controls,.ir-export-scheme-filters{break-inside:avoid}}

`;
 window.irObjectExportExtras={deliveries,recentPhotos,schemeData,schemeHtml,schemeViewer,css};
})();
