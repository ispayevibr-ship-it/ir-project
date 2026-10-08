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
 let mode="3d",yaw=-34,viewRotation=0,zoom=1,panX=0,panY=0,selectedId="",rows=[],markRows=[],workRows=[],gridXSpans=[],gridYSpans=[],spanX=targetSpanX,spanY=targetSpanY,axisXPos=new Map(),axisYPos=new Map(),labelsVisible=false,dimensionsVisible=false;
 [rows,markRows,workRows]=await Promise.all([schemeApi.list().catch(()=>[]),root.section("marks").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);
 const equalSpans=(total,count)=>{count=Math.max(1,count);const base=Math.floor(total/count),rem=Math.round(total-base*count);return Array.from({length:count},(_,i)=>base+(i<rem?1:0))};
 const validAxes=v=>Array.isArray(v)&&v.length>=2&&v.every(x=>String(x||"").trim());
 const validSpans=(v,count,total)=>Array.isArray(v)&&v.length===count&&v.every(x=>num(x)>0)&&Math.abs(v.reduce((s,x)=>s+num(x),0)-total)<.11;
 const gridRecord=()=>arr(rows).find(r=>r.record_type==="scheme_grid"||r.data?.entity_type==="grid")||null;
 const cumulative=(axes,spans)=>{let at=0;return new Map(axes.map((axis,i)=>{const here=at;if(i<spans.length)at+=num(spans[i]);return[axis,here]}))};
 const refreshGridModel=()=>{const g=gridRecord()?.data||{};axesX=validAxes(g.axes_x)?g.axes_x.map(x=>String(x).trim()):[...defaultAxesX];axesY=validAxes(g.axes_y)?g.axes_y.map(x=>String(x).trim()):[...defaultAxesY];gridDirX=g.x_direction==="rtl"?"rtl":"ltr";gridDirY=g.y_direction==="ttb"?"ttb":"btt";targetSpanX=num(g.span_x_mm)>0?num(g.span_x_mm):defaultSpanX;targetSpanY=num(g.span_y_mm)>0?num(g.span_y_mm):defaultSpanY;const gx=validSpans(g.x_spans_mm,axesX.length-1,targetSpanX)?g.x_spans_mm.map(num):equalSpans(targetSpanX,axesX.length-1),gy=validSpans(g.y_spans_mm,axesY.length-1,targetSpanY)?g.y_spans_mm.map(num):equalSpans(targetSpanY,axesY.length-1);gridXSpans=gx;gridYSpans=gy;spanX=gx.reduce((s,x)=>s+x,0);spanY=gy.reduce((s,x)=>s+x,0);axisXPos=cumulative(axesX,gx);axisYPos=cumulative(axesY,gy)};
 refreshGridModel();
 const workById=new Map(arr(workRows).map(r=>[String(r.id),r.data||{}]));
 const marks=arr(markRows).map(r=>({id:String(r.id),title:r.title||"",...(r.data||{})}));
 const markLabel=m=>{const w=workById.get(String(m.work_type_id||""))||{},name=m.name||"",wt=w.work_type||m.work_type||"";return [m.mark||m.title||"Без марки",name||wt].filter(Boolean).join(" · ")};
 const records=()=>arr(rows).filter(r=>r.record_type==="scheme_column"||r.data?.entity_type==="column").map(r=>({id:String(r.id),title:r.title||"",...(r.data||{})}));
 const coord=c=>{const axisX=axesX.includes(String(c.axis_x))?String(c.axis_x):(axesX[0]||""),axisY=axesY.includes(String(c.axis_y))?String(c.axis_y):(axesY[0]||""),dx=num(c.offset_x_mm),dy=num(c.offset_y_mm);return{x:num(axisXPos.get(axisX))+dx,y:num(axisYPos.get(axisY))+dy,z0:num(c.z0_mm),z1:num(c.z1_mm||8400),axisX,axisY,dx,dy}};
 const columns=()=>records().map(c=>({...c,...coord(c)}));
 const selected=()=>columns().find(x=>x.id===selectedId)||null;
 const resolveSavedMarkId=c=>{if(!c)return String(marks[0]?.id||"");const direct=marks.find(m=>m.id===String(c.mark_id||""));if(direct)return direct.id;const snap=String(c.mark||"").trim().toLowerCase(),snapName=String(c.mark_name||"").trim().toLowerCase();const exact=snap&&marks.find(m=>String(m.mark||m.title||"").trim().toLowerCase()===snap);if(exact)return exact.id;const byName=snapName&&marks.find(m=>String(m.name||"").trim().toLowerCase()===snapName);return byName?.id||""};
 const searchMarks=query=>{const q=String(query||"").trim().toLowerCase();if(!q)return [...marks];return marks.map(m=>{const mark=String(m.mark||m.title||"").trim().toLowerCase(),name=String(m.name||"").trim().toLowerCase(),text=`${mark} ${name}`;let score=99;if(mark===q)score=0;else if(mark.startsWith(q))score=1;else if(mark.includes(q))score=2;else if(name.startsWith(q))score=3;else if(name.includes(q)||text.includes(q))score=4;return{m,score}}).filter(x=>x.score<99).sort((a,b)=>a.score-b.score||String(a.m.mark||a.m.title||"").localeCompare(String(b.m.mark||b.m.title||""),"ru",{numeric:true,sensitivity:"base"})).map(x=>x.m)};
 const markOptions=(selectedMark,query="",unresolved=false)=>{const q=String(query||"").trim(),visible=searchMarks(q),hasSelected=visible.some(m=>m.id===String(selectedMark));let prefix="";if(unresolved&&!q)prefix='<option value="" selected>Марка не найдена — выберите заново</option>';else if(q&&!hasSelected)prefix='<option value="" selected>Выберите из найденных марок</option>';if(!visible.length)return'<option value="" selected>Ничего не найдено</option>';return prefix+visible.map(m=>`<option value="${esc(m.id)}" ${hasSelected&&String(selectedMark)===m.id?"selected":""}>${esc(markLabel(m))}</option>`).join("")};
 const axisOptions=(items,value)=>items.map(x=>`<option value="${esc(x)}" ${String(value)===x?"selected":""}>${esc(x)}</option>`).join("");
 const statusText=s=>s==="mounted"?"Смонтирована":"Не смонтирована";
 const sectionType=c=>{const explicit=String(c?.section_type||"").trim().toLowerCase();if(["ibeam","square","round","box"].includes(explicit))return explicit;const s=`${c?.profile_name||""} ${c?.mark_name||""}`.toLowerCase();if(/круг|труб.*ø|труб.*ф|ø|⌀/.test(s))return"round";if(/квад|проф.*труб|\d+\s*[xх×]\s*\d+/.test(s))return"square";if(/короб|сварн.*короб/.test(s))return"box";return"ibeam"};
 const sectionTypeLabel=t=>({ibeam:"Двутавр",square:"Квадратная труба",round:"Круглая труба",box:"Короб / сплошное"}[t]||"Двутавр");
 const profileText=c=>String(c?.profile_name||"").trim()||sectionTypeLabel(sectionType(c));
 const sectionOptions=value=>[["ibeam","Двутавр"],["square","Квадратная труба"],["round","Круглая труба"],["box","Короб / сплошное"]].map(([v,n])=>`<option value="${v}" ${value===v?"selected":""}>${n}</option>`).join("");
 const spanSummary=spans=>{const min=Math.min(...spans),max=Math.max(...spans),avg=spans.reduce((s,x)=>s+x,0)/Math.max(1,spans.length);return max-min<=1?`≈ по ${fmt(avg)} мм`:"индивидуальные размеры"};
 const pairLabel=(items,i)=>`${items[i]}–${items[i+1]}`;
 function stats(){
  const cols=columns(),mounted=cols.filter(x=>x.status==="mounted").length;
  return{total:cols.length,mounted,left:cols.length-mounted,pct:cols.length?Math.round(mounted/cols.length*100):0}
 }
 function projection(cols){
  const W=1040,H=650,padX=105,padY=90,a=(yaw+viewRotation)*Math.PI/180,maxZ=Math.max(9,...cols.map(c=>Math.max(c.z0,c.z1)/1000));
  const raw=(xmm,ymm,zmm)=>{const xd=gridDirX==="rtl"?spanX-xmm:xmm,yd=gridDirY==="btt"?spanY-ymm:ymm,x=(xd-spanX/2)/1000,y=(yd-spanY/2)/1000,z=zmm/1000,rx=x*Math.cos(a)-y*Math.sin(a),ry=x*Math.sin(a)+y*Math.cos(a);return{x:rx,y:ry*.48-z}};
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
  const parts=[],xn=`${axesX[0]}–${axesX.at(-1)}`,yn=`${axesY[0]}–${axesY.at(-1)}`;if(c.dx)parts.push(`по ${xn}: ${c.dx>=0?"+":"−"}${fmt(Math.abs(c.dx))} мм`);if(c.dy)parts.push(`по ${yn}: ${c.dy>=0?"+":"−"}${fmt(Math.abs(c.dy))} мм`);return parts.join(" · ")
 }
 function columnTitle(c){
  const a=axisText(c),mark=c.mark||"—",name=c.mark_name||"";
  return `${mark}${name?" · "+name:""}\nПрофиль: ${profileText(c)}\nОси: ${a.x} / ${a.y}\nX: ${fmt(c.x)} мм · Y: ${fmt(c.y)} мм\nНиз: ${fmt(c.z0)} мм · Верх: ${fmt(c.z1)} мм${c.dx||c.dy?"\nСмещение: "+offsetText(c):""}`
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
 function column3dShape(c,base,top){
  const t=sectionType(c),dx=top.x-base.x,dy=top.y-base.y,len=Math.max(1,Math.hypot(dx,dy)),nx=-dy/len,ny=dx/len,pt=(p,off)=>({x:p.x+nx*off,y:p.y+ny*off}),poly=(a,b,c1,d,cls)=>`<polygon points="${a.x},${a.y} ${b.x},${b.y} ${c1.x},${c1.y} ${d.x},${d.y}" class="${cls}"/>`;
  const plate=[pt(base,-6),pt(base,6),{x:pt(base,6).x+4,y:pt(base,6).y+2},{x:pt(base,-6).x+4,y:pt(base,-6).y+2}];
  let out=`<polygon points="${plate.map(q=>`${q.x},${q.y}`).join(" ")}" class="scheme-base-plate"/>`;
  if(t==="round"){
   out+=`<line x1="${base.x}" y1="${base.y}" x2="${top.x}" y2="${top.y}" class="scheme-round-column"/><ellipse cx="${top.x}" cy="${top.y}" rx="4.2" ry="2.2" class="scheme-section-cap"/>`;return out
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
 function prism(c,p,index){
  const base=p(c.x,c.y,c.z0),top=p(c.x,c.y,c.z1),isSelected=c.id===selectedId,sel=isSelected?" selected":"",status=c.status==="mounted"?" mounted":" planned",between=c.dx||c.dy?" between":"";
  const baseAxis=p(axisXPos.get(c.axisX),axisYPos.get(c.axisY),c.z0),showOffset=!!(c.dx||c.dy)&&dimensionsVisible,showLabel=isSelected||labelsVisible;
  const lw=82,lh=28,placeBelow=top.y<150,preferLeft=index%2===1,rawX=top.x+(preferLeft?-lw-12:12),rawY=placeBelow?top.y+12:top.y-lh-12,lx=Math.max(8,Math.min(1040-lw-8,rawX)),ly=Math.max(8,Math.min(650-lh-8,rawY)),anchorX=preferLeft?lx+lw:lx;
  const offsetMid={x:(base.x+baseAxis.x)/2,y:(base.y+baseAxis.y)/2};
  return`<g class="scheme-column section-${sectionType(c)}${status}${sel}${between}" data-column="${esc(c.id)}" tabindex="0">
   <title>${esc(columnTitle(c))}</title>
   <line x1="${base.x}" y1="${base.y}" x2="${top.x}" y2="${top.y}" class="scheme-column-hit-line"/>
   ${showOffset?`<line x1="${baseAxis.x}" y1="${baseAxis.y}" x2="${base.x}" y2="${base.y}" class="scheme-offset-line"/><text x="${offsetMid.x}" y="${offsetMid.y-7}" class="scheme-offset-text">${esc(offsetText(c))}</text>`:""}
   ${column3dShape(c,base,top)}
   ${showLabel?`<line x1="${top.x}" y1="${top.y}" x2="${anchorX}" y2="${ly+lh/2}" class="scheme-label-leader"/><g class="scheme-column-label compact${isSelected?" selected-label":""}"><rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="6"/><text x="${lx+7}" y="${ly+17}" class="scheme-label-position">${esc(c.mark||"—")}</text></g>`:""}
  </g>`
 }
 function planSectionSymbol(c,x,y){
  const t=sectionType(c),rot=num(c.rotation_deg)+viewRotation,tr=`translate(${x} ${y}) rotate(${rot})`;
  if(t==="round")return`<g transform="${tr}" class="scheme-plan-section"><circle r="6" class="scheme-plan-section-outer"/><circle r="3.4" class="scheme-plan-section-inner"/></g>`;
  if(t==="square")return`<g transform="${tr}" class="scheme-plan-section"><rect x="-6" y="-6" width="12" height="12" rx="1" class="scheme-plan-section-outer"/><rect x="-3.5" y="-3.5" width="7" height="7" rx=".7" class="scheme-plan-section-inner"/></g>`;
  if(t==="box")return`<g transform="${tr}" class="scheme-plan-section"><rect x="-5.5" y="-5.5" width="11" height="11" rx="1" class="scheme-plan-box"/></g>`;
  return`<g transform="${tr}" class="scheme-plan-section"><path d="M-6 -5V5 M6 -5V5 M-6 0H6" class="scheme-plan-ibeam"/><circle r="1.8" class="scheme-plan-dot"/></g>`
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
   gridXSpans.forEach((dist,i)=>{const x1=axisXPos.get(axesX[i]),x2=axisXPos.get(axesX[i+1]),q=outward(p((x1+x2)/2,0),42);grid+=`<text x="${q.x}" y="${q.y}" class="scheme-span-text">${pairLabel(axesX,i)} · ${fmt(dist)} мм</text>`});
   gridYSpans.forEach((dist,i)=>{const y1=axisYPos.get(axesY[i]),y2=axisYPos.get(axesY[i+1]),q=outward(p(0,(y1+y2)/2),42);grid+=`<text x="${q.x}" y="${q.y}" class="scheme-span-text">${pairLabel(axesY,i)} · ${fmt(dist)} мм</text>`})
  }
  const horizName=rot90?yName:xName,horizSize=rot90?spanY:spanX,vertName=rot90?xName:yName,vertSize=rot90?spanX:spanY;
  grid+=`<line x1="${left}" y1="${gridTop+gridH+52}" x2="${left+gridW}" y2="${gridTop+gridH+52}" class="scheme-dim-line"/><text x="${W/2}" y="${gridTop+gridH+71}" class="scheme-dim-text">${esc(horizName)} = ${fmt(horizSize)} мм</text>`;
  grid+=`<line x1="${left+gridW+54}" y1="${gridTop}" x2="${left+gridW+54}" y2="${gridTop+gridH}" class="scheme-dim-line"/><text x="${left+gridW+79}" y="${H/2}" class="scheme-dim-text scheme-dim-vertical">${esc(vertName)} = ${fmt(vertSize)} мм</text>`;
  let columnsSvg="";
  cols.forEach((c,index)=>{
   const q=p(c.x,c.y),axis=p(axisXPos.get(c.axisX),axisYPos.get(c.axisY)),x=q.x,y=q.y,axisX=axis.x,axisY=axis.y,isSelected=c.id===selectedId,sel=isSelected?" selected":"",status=c.status==="mounted"?" mounted":" planned",between=c.dx||c.dy?" between":"",showLabel=isSelected||labelsVisible,lw=78,lh=27,placeBelow=y<gridTop+70,preferLeft=index%2===1,rawX=x+(preferLeft?-lw-9:9),rawY=placeBelow?y+9:y-lh-9,lx=Math.max(6,Math.min(W-lw-6,rawX)),ly=Math.max(8,Math.min(H-lh-8,rawY)),anchorX=preferLeft?lx+lw:lx;
   const showOffset=!!(c.dx||c.dy)&&dimensionsVisible,midX=(x+axisX)/2,midY=(y+axisY)/2;
   columnsSvg+=`<g class="scheme-column${status}${sel}${between}" data-column="${esc(c.id)}" tabindex="0"><title>${esc(columnTitle(c))}</title><circle cx="${x}" cy="${y}" r="11" class="scheme-column-hit"/>${showOffset?`<line x1="${axisX}" y1="${axisY}" x2="${x}" y2="${y}" class="scheme-offset-line"/><circle cx="${axisX}" cy="${axisY}" r="3" class="scheme-offset-origin"/><text x="${midX}" y="${midY-7}" class="scheme-offset-text">${esc(offsetText(c))}</text>`:""}${planSectionSymbol(c,x,y)}${showLabel?`<line x1="${x}" y1="${y}" x2="${anchorX}" y2="${ly+lh/2}" class="scheme-label-leader"/><g class="scheme-column-label compact${isSelected?" selected-label":""}"><rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="6"/><text x="${lx+7}" y="${ly+17}" class="scheme-label-position">${esc(c.mark||"—")}</text></g>`:""}</g>`;
  });
  return`<g class="scheme-grid-layer">${grid}</g><g class="scheme-column-layer">${columnsSvg}</g>`
 }
 function zoomTransform(){return `translate(${520+panX} ${325+panY}) scale(${zoom}) translate(-520 -325)`}
 function setZoom(next,resetPan=false){
  zoom=Math.max(.6,Math.min(3,Math.round(next*100)/100));if(resetPan){panX=0;panY=0}renderScene();const z=document.getElementById("schemeZoomValue");if(z)z.textContent=`${Math.round(zoom*100)}%`
 }
 function bindScenePanZoom(box){
  const svg=box.querySelector("svg"),layer=box.querySelector("#schemeZoomLayer");if(!svg||!layer)return;
  let dragging=false,lastX=0,lastY=0;
  svg.onpointerdown=e=>{if(e.button!==0||e.target.closest?.("[data-column]"))return;dragging=true;lastX=e.clientX;lastY=e.clientY;svg.classList.add("dragging");svg.setPointerCapture?.(e.pointerId);e.preventDefault()};
  svg.onpointermove=e=>{if(!dragging)return;const rect=svg.getBoundingClientRect(),sx=1040/Math.max(1,rect.width),sy=650/Math.max(1,rect.height);panX+=(e.clientX-lastX)*sx;panY+=(e.clientY-lastY)*sy;lastX=e.clientX;lastY=e.clientY;layer.setAttribute("transform",zoomTransform())};
  const stop=e=>{if(!dragging)return;dragging=false;svg.classList.remove("dragging");try{svg.releasePointerCapture?.(e.pointerId)}catch{}};
  svg.onpointerup=stop;svg.onpointercancel=stop;svg.onpointerleave=e=>{if(dragging&&e.buttons===0)stop(e)};
  svg.onwheel=e=>{if(!e.ctrlKey)return;e.preventDefault();setZoom(zoom+(e.deltaY<0?.15:-.15))};
 }
 function renderScene(){
  const box=document.getElementById("schemeCanvas");if(!box)return;const cols=columns(),xName=`${axesX[0]}–${axesX.at(-1)}`,yName=`${axesY[0]}–${axesY.at(-1)}`,meta=`<div class="scheme-grid-meta"><b>${fmt(spanX)} × ${fmt(spanY)} мм</b><span>${esc(xName)}: ${axesX.length} осей</span><span>${esc(yName)}: ${axesY.length} осей</span><small>Поворот ${viewRotation}° · Ctrl + колесо — масштаб · пустое место — перемещение</small></div>`;
  if(mode==="3d"){const g=grid3d(cols);box.innerHTML=`${meta}<svg viewBox="0 0 1040 650" aria-label="3D монтажная схема"><g id="schemeZoomLayer" transform="${zoomTransform()}"><g class="scheme-grid-layer">${g.html}</g><g class="scheme-column-layer">${cols.map((c,i)=>prism(c,g.p,i)).join("")}</g></g><text x="520" y="626" class="scheme-demo-note" text-anchor="middle">${labelsVisible?"Подписи включены":"Подписи скрыты — выберите колонну для просмотра"} · ${dimensionsVisible?"Размеры пролётов включены":"Размеры пролётов скрыты"}</text></svg>`}
  else box.innerHTML=`${meta}<svg viewBox="0 0 1040 650" aria-label="План монтажной схемы"><g id="schemeZoomLayer" transform="${zoomTransform()}">${planSvg(cols)}</g><text x="520" y="626" class="scheme-demo-note" text-anchor="middle">${labelsVisible?"Подписи включены":"Подписи скрыты — выберите колонну для просмотра"} · масштаб X/Y одинаковый</text></svg>`;
  box.querySelectorAll("[data-column]").forEach(el=>{const pick=()=>{selectedId=el.dataset.column;renderScene();renderDetails()};el.onclick=pick;el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pick()}}});
  bindScenePanZoom(box)
 }
 function renderDetails(){
  const panel=document.getElementById("schemeDetails");if(!panel)return;const c=selected();
  if(!c){panel.innerHTML=`<div class="scheme-detail-empty"><b>Колонна не выбрана</b><span>Нажмите на колонну на схеме или добавьте новую.</span>${canEdit()?'<button type="button" data-scheme-add>＋ Добавить колонну</button>':""}</div>`;panel.querySelector("[data-scheme-add]")?.addEventListener("click",()=>openEditor());return}
  const a=axisText(c),between=c.dx||c.dy;
  panel.innerHTML=`<div class="scheme-detail-title"><span>Выбранная колонна</span><b>${esc(c.mark||"—")}</b>${c.mark_name?`<small>${esc(c.mark_name)}</small>`:""}</div>
   <div class="scheme-detail-grid">
    <div><span>Наименование</span><b>${esc(c.mark_name||"—")}</b></div>
    <div><span>Сечение</span><b>${esc(sectionTypeLabel(sectionType(c)))}</b></div>
    <div><span>Профиль</span><b>${esc(profileText(c))}</b></div>
    <div><span>Статус</span><b class="${c.status==="mounted"?"ok":"wait"}">${statusText(c.status)}</b></div>
    <div><span>Ось ${esc(axesX[0])}–${esc(axesX.at(-1))}</span><b>${esc(a.x)}</b></div>
    <div><span>Ось ${esc(axesY[0])}–${esc(axesY.at(-1))}</span><b>${esc(a.y)}</b></div>
    <div><span>Коорд. X</span><b>${fmt(c.x)} мм</b></div>
    <div><span>Коорд. Y</span><b>${fmt(c.y)} мм</b></div>
    <div><span>Низ</span><b>${fmt(c.z0)} мм</b></div>
    <div><span>Верх</span><b>${fmt(c.z1)} мм</b></div>
   </div>
   ${between?`<div class="scheme-between"><b>Колонна между осями</b><span>${esc(a.x)} / ${esc(a.y)}</span><small>Положение вычисляется от выбранных базовых осей и сохраняется точно в миллиметрах.</small></div>`:""}
   ${canEdit()?`<div class="scheme-detail-actions"><button type="button" data-scheme-edit>Редактировать</button><button type="button" class="danger" data-scheme-delete>Удалить</button></div>`:""}`;
  panel.querySelector("[data-scheme-edit]")?.addEventListener("click",()=>openEditor(c));
  panel.querySelector("[data-scheme-delete]")?.addEventListener("click",async()=>{if(!confirm(`Удалить колонну ${c.mark?`«${c.mark}» `:""}со схемы?`))return;await schemeApi.remove(c.id);rows=await schemeApi.list().catch(()=>rows);selectedId="";draw()})
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
  body.querySelectorAll("[data-grid-axis]").forEach(el=>{el.oninput=()=>{const key=el.dataset.gridAxis,i=Number(el.dataset.index),items=key==="x"?gridDraft.axesX:gridDraft.axesY;items[i]=el.value};el.onchange=()=>{const key=el.dataset.gridAxis,i=Number(el.dataset.index),items=key==="x"?gridDraft.axesX:gridDraft.axesY;items[i]=el.value.trim();renderGridEditor()}});
  body.querySelectorAll("[data-grid-span]").forEach(el=>el.oninput=()=>{const key=el.dataset.gridSpan,i=Number(el.dataset.index),spans=key==="x"?gridDraft.spansX:gridDraft.spansY;spans[i]=num(el.value);refreshGridEditor()});
  body.querySelectorAll("[data-grid-size]").forEach(el=>el.oninput=()=>{if(el.dataset.gridSize==="x")gridDraft.sizeX=num(el.value);else gridDraft.sizeY=num(el.value);refreshGridEditor()});
  body.querySelectorAll("[data-grid-direction]").forEach(el=>el.onchange=()=>{if(el.dataset.gridDirection==="x")gridDraft.dirX=el.value;else gridDraft.dirY=el.value});
  body.querySelectorAll("[data-grid-equal]").forEach(btn=>btn.onclick=()=>{const key=btn.dataset.gridEqual,count=(key==="x"?gridDraft.axesX:gridDraft.axesY).length-1,total=key==="x"?gridDraft.sizeX:gridDraft.sizeY,vals=equalSpans(total,count);if(key==="x")gridDraft.spansX=vals;else gridDraft.spansY=vals;renderGridEditor()});
  body.querySelectorAll("[data-grid-add-axis]").forEach(btn=>btn.onclick=()=>{const key=btn.dataset.gridAddAxis,items=key==="x"?gridDraft.axesX:gridDraft.axesY,sources=key==="x"?gridDraft.sourceX:gridDraft.sourceY,spans=key==="x"?gridDraft.spansX:gridDraft.spansY,sizeKey=key==="x"?"sizeX":"sizeY",suggested=Math.max(1,Math.round(spans.length?spans.reduce((s,x)=>s+num(x),0)/spans.length:6000));items.push(nextAxisLabel(key,items));sources.push(null);spans.push(suggested);gridDraft[sizeKey]+=suggested;renderGridEditor()});
  body.querySelectorAll("[data-grid-remove-axis]").forEach(btn=>btn.onclick=()=>{const key=btn.dataset.gridRemoveAxis,i=Number(btn.dataset.index),items=key==="x"?gridDraft.axesX:gridDraft.axesY,sources=key==="x"?gridDraft.sourceX:gridDraft.sourceY,spans=key==="x"?gridDraft.spansX:gridDraft.spansY,sizeKey=key==="x"?"sizeX":"sizeY";if(items.length<=2)return;const source=sources[i],used=source&&records().some(r=>String(key==="x"?r.axis_x:r.axis_y)===String(source));if(used){showGridError(`Ось «${source}» используется колоннами. Сначала перенесите эти колонны на другую ось.`);return}showGridError("");if(i===0){gridDraft[sizeKey]-=num(spans.shift());items.shift();sources.shift()}else if(i===items.length-1){gridDraft[sizeKey]-=num(spans.pop());items.pop();sources.pop()}else{spans[i-1]=num(spans[i-1])+num(spans[i]);spans.splice(i,1);items.splice(i,1);sources.splice(i,1)}renderGridEditor()});
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
   for(const row of arr(rows).filter(r=>r.record_type==="scheme_column"||r.data?.entity_type==="column")){const d0=row.data||{},nx=mapX.get(String(d0.axis_x||""))||String(d0.axis_x||""),ny=mapY.get(String(d0.axis_y||""))||String(d0.axis_y||"");if(nx!==String(d0.axis_x||"")||ny!==String(d0.axis_y||""))await schemeApi.update(row.id,{record_type:row.record_type||"scheme_column",title:row.title||d0.position||"Колонна",data:{...d0,axis_x:nx,axis_y:ny}})}
   const existing=gridRecord(),payload={record_type:"scheme_grid",title:"Сетка осей",data:{entity_type:"grid",axes_x:ax,axes_y:ay,x_spans_mm:xs,y_spans_mm:ys,span_x_mm:gridDraft.sizeX,span_y_mm:gridDraft.sizeY,x_direction:gridDraft.dirX,y_direction:gridDraft.dirY}};if(existing)await schemeApi.update(existing.id,payload);else await schemeApi.create(payload);rows=await schemeApi.list().catch(()=>rows);refreshGridModel();d.close();gridDraft=null;draw()}
 }
 function editorHtml(){
  return`<dialog id="schemeEditor" class="scheme-editor"><form id="schemeForm" novalidate><input type="hidden" name="id"><div class="scheme-editor-head"><div><h2 id="schemeEditorTitle">Добавить колонну</h2><p>Укажите марку и точное положение относительно осей.</p></div><button type="button" id="schemeEditorX">×</button></div>
   <div class="scheme-form-grid">
    <label class="wide scheme-mark-field">Марка из ведомости<div class="scheme-mark-search"><input id="schemeMarkSearch" type="search" autocomplete="off" placeholder="Поиск по марке или наименованию…"><span id="schemeMarkCount"></span></div><select name="mark_id" ${marks.length?"required":"disabled"}>${markOptions("")}</select></label>
    <label>Статус<select name="status"><option value="planned">Не смонтирована</option><option value="mounted">Смонтирована</option></select></label>
    <label>Тип сечения<select name="section_type">${sectionOptions("ibeam")}</select></label>
    <label class="wide">Профиль / обозначение<input name="profile_name" placeholder="Например: 40К2, 300×300×10, Ø273×8"></label>
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
  const currentMark=resolveSavedMarkId(c),unresolvedExisting=!!c&&!currentMark,search=document.getElementById("schemeMarkSearch"),count=document.getElementById("schemeMarkCount");let chosenMark=currentMark;
  f.elements.mark_id.innerHTML=markOptions(chosenMark,"",unresolvedExisting);if(chosenMark)f.elements.mark_id.value=chosenMark;
  f.elements.mark_id.onchange=()=>{const value=String(f.elements.mark_id.value||"");if(value){chosenMark=value;if(!c){const same=records().find(x=>String(x.mark_id||"")===value);f.elements.section_type.value=sectionType(same||{});f.elements.profile_name.value=same?.profile_name||""}}};
  const applyMarkSearch=()=>{const q=search?.value||"",matched=searchMarks(q);f.elements.mark_id.innerHTML=markOptions(chosenMark,q,unresolvedExisting&&!chosenMark);if(!q&&chosenMark&&[...f.elements.mark_id.options].some(o=>o.value===chosenMark))f.elements.mark_id.value=chosenMark;count.textContent=q?`Найдено: ${matched.length}`:`Марок: ${marks.length}`;f.elements.mark_id._irSelectUI?.refresh?.()};
  if(search){search.value="";search.oninput=applyMarkSearch}applyMarkSearch();
  f.elements.status.value=c?.status||"planned";const sameMark=records().find(x=>String(x.mark_id||"")===currentMark&&(!c||x.id!==c.id)),shapeSource=c||sameMark||{};f.elements.section_type.value=sectionType(shapeSource);f.elements.profile_name.value=shapeSource.profile_name||"";f.elements.axis_x.value=c?.axis_x||axesX[0]||"";f.elements.axis_y.value=c?.axis_y||axesY[0]||"";
  f.elements.offset_x_mm.value=c?.offset_x_mm??0;f.elements.offset_y_mm.value=c?.offset_y_mm??0;f.elements.z0_mm.value=c?.z0_mm??0;f.elements.z1_mm.value=c?.z1_mm??8400;f.elements.rotation_deg.value=c?.rotation_deg??0;
  const refreshPreview=()=>{const ax=f.elements.axis_x.value,ay=f.elements.axis_y.value,dx=num(f.elements.offset_x_mm.value),dy=num(f.elements.offset_y_mm.value),x=num(axisXPos.get(ax))+dx,y=num(axisYPos.get(ay))+dy;document.getElementById("schemeCoordPreview").innerHTML=`<span>Точная координата</span><b>X = ${fmt(x)} мм · Y = ${fmt(y)} мм</b><small>${ax}${dx?` ${dx>=0?"+":"−"} ${fmt(Math.abs(dx))} мм`:""} / ${ay}${dy?` ${dy>=0?"+":"−"} ${fmt(Math.abs(dy))} мм`:""}</small>`};
  ["axis_x","axis_y","offset_x_mm","offset_y_mm"].forEach(n=>f.elements[n].addEventListener("input",refreshPreview));refreshPreview();d.showModal()
 }
 function bindEditor(){
  if(!canEdit())return;const d=document.getElementById("schemeEditor"),f=document.getElementById("schemeForm"),err=document.getElementById("schemeFormError");
  document.getElementById("schemeAdd")?.addEventListener("click",()=>openEditor());document.getElementById("schemeEditorX").onclick=()=>d.close();document.getElementById("schemeEditorCancel").onclick=()=>d.close();
  f.onsubmit=async e=>{e.preventDefault();err.hidden=true;if(!marks.length){err.textContent="Сначала добавьте марки колонн в ведомость марок.";err.hidden=false;return}const fd=new FormData(f),id=String(fd.get("id")||""),markId=String(fd.get("mark_id")||""),m=marks.find(x=>x.id===markId),axisX=String(fd.get("axis_x")||axesX[0]||""),axisY=String(fd.get("axis_y")||axesY[0]||""),dx=num(fd.get("offset_x_mm")),dy=num(fd.get("offset_y_mm")),z0=num(fd.get("z0_mm")),z1=num(fd.get("z1_mm")),rot=num(fd.get("rotation_deg")),status=String(fd.get("status")||"planned"),section_type=String(fd.get("section_type")||"ibeam"),profile_name=String(fd.get("profile_name")||"").trim();if(!m){err.textContent="Выберите марку колонны.";err.hidden=false;return}if(z1<=z0){err.textContent="Отметка верха должна быть выше отметки низа.";err.hidden=false;return}const existing=id?records().find(x=>x.id===id):null,used=new Set(records().map(x=>String(x.position||x.title||"")));let internalPosition=String(existing?.position||existing?.title||"");if(!internalPosition){let n=1;do{internalPosition="COL-"+String(n++).padStart(4,"0")}while(used.has(internalPosition))}const payload={record_type:"scheme_column",title:internalPosition,data:{entity_type:"column",position:internalPosition,mark_id:m.id,mark:m.mark||m.title||"",mark_name:m.name||"",work_type_id:m.work_type_id||"",axis_x:axisX,axis_y:axisY,offset_x_mm:dx,offset_y_mm:dy,z0_mm:z0,z1_mm:z1,rotation_deg:rot,status,section_type,profile_name}};let saved;if(id){saved=await schemeApi.update(id,payload)}else saved=await schemeApi.create(payload);rows=await schemeApi.list().catch(()=>rows);selectedId=String(saved?.id||id||records().at(-1)?.id||"");d.close();draw()}
 }
 function draw(){
  const s=stats();
  app.innerHTML=`<div class="scheme-page">
   <div class="scheme-head"><button class="back" id="schemeBack">← Назад</button><div><h1>Монтажная схема</h1><p>${esc(object.name||"")} · колонны</p></div><div class="scheme-head-actions"><div class="scheme-view-switch"><button data-mode="plan" class="${mode==="plan"?"on":""}">План</button><button data-mode="3d" class="${mode==="3d"?"on":""}">3D</button></div>${canEdit()?'<button type="button" class="scheme-grid-button" id="schemeGridConfig">⚙ Параметры сетки</button><button type="button" class="primary" id="schemeAdd">＋ Добавить колонну</button>':""}</div></div>
   <div class="scheme-summary">
    <div><span>Оси ${esc(axesX[0])}–${esc(axesX.at(-1))}</span><b>${fmt(spanX)} мм</b><small>${gridDirX==="ltr"?"Слева направо":"Справа налево"}: ${esc(axesX[0])} → ${esc(axesX.at(-1))} · ${gridXSpans.length} пролётов</small></div>
    <div><span>Оси ${esc(axesY[0])}–${esc(axesY.at(-1))}</span><b>${fmt(spanY)} мм</b><small>${gridDirY==="btt"?"Снизу вверх":"Сверху вниз"}: ${esc(axesY[0])} → ${esc(axesY.at(-1))} · ${gridYSpans.length} пролётов</small></div>
    <div><span>Колонн на схеме</span><b>${s.total}</b><small>Задаются вручную</small></div>
    <div><span>Смонтировано</span><b>${s.mounted} / ${s.total}</b><small>${s.pct}%</small></div>
   </div>
   <div class="scheme-workspace">
    <section class="scheme-stage">
     <div class="scheme-stage-toolbar">
      <div class="scheme-legend"><span><i class="mounted"></i>Смонтировано</span><span><i class="planned"></i>Не смонтировано</span><span><i class="between"></i>Со смещением от оси</span></div>
      <div class="scheme-toolbar-actions"><button type="button" id="schemeToggleLabels" class="${labelsVisible?"on":""}">Подписи</button><button type="button" id="schemeToggleDimensions" class="${dimensionsVisible?"on":""}">Размеры</button><div class="scheme-zoom"><button type="button" id="schemeZoomOut" title="Уменьшить">−</button><button type="button" id="schemeZoomValue" title="Вернуть 100%">${Math.round(zoom*100)}%</button><button type="button" id="schemeZoomIn" title="Увеличить">+</button></div><div class="scheme-orient"><button type="button" id="schemeRotate90Left" title="Повернуть на 90° влево">↶90°</button><button type="button" id="schemeRotationValue" title="Вернуть поворот в 0°">${viewRotation}°</button><button type="button" id="schemeRotate90Right" title="Повернуть на 90° вправо">↷90°</button></div><div class="scheme-rotate" ${mode==="plan"?"hidden":""}><button id="schemeLeft" title="Повернуть 3D на 10°">↶10°</button><button id="schemeReset" title="Вернуть 3D ракурс">3D</button><button id="schemeRight" title="Повернуть 3D на 10°">↷10°</button></div></div>
     </div>
     <div class="scheme-canvas" id="schemeCanvas"></div>
     ${s.total?"":'<div class="scheme-empty-overlay"><b>Схема пока пустая</b><span>Нажмите «Добавить колонну» и задайте её марку, оси и смещение.</span></div>'}
    </section>
    <aside class="scheme-details" id="schemeDetails"></aside>
   </div>
   <div class="scheme-hint"><b>Сетка:</b><span><strong>${esc(axesX[0])} → ${esc(axesX.at(-1))}</strong> — ${gridDirX==="ltr"?"слева направо":"справа налево"}, <strong>${esc(axesY[0])} → ${esc(axesY.at(-1))}</strong> — ${gridDirY==="btt"?"снизу вверх":"сверху вниз"}. Направление можно изменить в «Параметрах сетки».</span></div>
   ${canEdit()?gridEditorHtml()+editorHtml():""}
  </div>`;
  document.getElementById("schemeBack").onclick=()=>location.hash=`/objects/object/${oid}`;document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{mode=b.dataset.mode;draw()});
  document.getElementById("schemeToggleLabels")?.addEventListener("click",()=>{labelsVisible=!labelsVisible;draw()});document.getElementById("schemeToggleDimensions")?.addEventListener("click",()=>{dimensionsVisible=!dimensionsVisible;draw()});
  document.getElementById("schemeZoomOut")?.addEventListener("click",()=>setZoom(zoom-.15));document.getElementById("schemeZoomIn")?.addEventListener("click",()=>setZoom(zoom+.15));document.getElementById("schemeZoomValue")?.addEventListener("click",()=>setZoom(1,true));
  const rotateView=delta=>{viewRotation=((viewRotation+delta)%360+360)%360;panX=0;panY=0;renderScene();const v=document.getElementById("schemeRotationValue");if(v)v.textContent=`${viewRotation}°`};document.getElementById("schemeRotate90Left")?.addEventListener("click",()=>rotateView(-90));document.getElementById("schemeRotate90Right")?.addEventListener("click",()=>rotateView(90));document.getElementById("schemeRotationValue")?.addEventListener("click",()=>{viewRotation=0;panX=0;panY=0;renderScene()});
  document.getElementById("schemeLeft")?.addEventListener("click",()=>{yaw-=10;renderScene()});document.getElementById("schemeRight")?.addEventListener("click",()=>{yaw+=10;renderScene()});document.getElementById("schemeReset")?.addEventListener("click",()=>{yaw=-34;panX=0;panY=0;renderScene()});
  renderScene();renderDetails();bindGridEditor();bindEditor()
 }
 draw();
};