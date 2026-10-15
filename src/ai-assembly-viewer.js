"use strict";
/* Fully offline orthographic 3D mesh preview of CONFIRMED KMD geometry.
   No Three.js CDN, no model weights, no imaginary dimensions.
   Mesh dimensions are literal verified millimetres, not inferred section sizes.
   Preview is not a fabrication CAD file. */
window.irAiAssemblyViewer=(function(){
 const FACE_LIMIT=15000;
 const NUMERIC=v=>typeof v==="number"&&Number.isFinite(v)?v:0;
 function profile(shape){
  const {type}=shape,w=NUMERIC(shape.widthMm),h=NUMERIC(shape.heightMm),
   t=NUMERIC(shape.wallMm);
  if(type==="plate"||type==="solid_rect")
   return{solid:[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]]};
  if(type==="ibeam"){
   const b=w/2,hh=h/2,web=shape.webMm/2,f=shape.flangeMm;
   return{solid:[[-b,-hh],[b,-hh],[b,-hh+f],[web,-hh+f],
    [web,hh-f],[b,hh-f],[b,hh],[-b,hh],[-b,hh-f],
    [-web,hh-f],[-web,-hh+f],[-b,-hh+f]]}
  }
  if(type==="rhs")return{outer:[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]],
   inner:[[-w/2+t,-h/2+t],[w/2-t,-h/2+t],[w/2-t,h/2-t],[-w/2+t,h/2-t]]};
  if(type==="chs"){
   const n=28,ro=shape.diameterMm/2,ri=ro-t,outer=[],inner=[];
   for(let i=0;i<n;i++){
    const a=2*Math.PI*i/n;
    outer.push([Math.cos(a)*ro,Math.sin(a)*ro]);
    inner.push([Math.cos(a)*ri,Math.sin(a)*ri])
   }
   return{outer,inner}
  }
  throw Error("Неподдерживаемое подтверждённое сечение: "+type)
 }
 function prism(shape){
  const p=profile(shape),z=shape.lengthMm,faces=[];
  const face=(coords)=>faces.push(coords);
  const shell=p.solid||p.outer;
  const start=([x,y])=>[x,y,0],end=([x,y])=>[x,y,z];
  if(p.solid){
   // Solid end cap fan is valid for rectangles; I beam is concave,
   // so explicitly tile flange/web into three rectangles instead.
   if(shape.type==="ibeam"){
    const b=shape.widthMm/2,h=shape.heightMm/2,f=shape.flangeMm,
     w=shape.webMm/2;
    const rectangles=[
     [[-b,-h],[b,-h+f]],
     [[-w,-h+f],[w,h-f]],
     [[-b,h-f],[b,h]]
    ];
    for(const [a,c] of rectangles){
     const q=[[a[0],a[1]],[c[0],a[1]],[c[0],c[1]],[a[0],c[1]]];
     face(q.map(start));face([...q].reverse().map(end))
    }
   }else{
    face(shell.map(start));face([...shell].reverse().map(end))
   }
  }else{
   for(let i=0;i<p.outer.length;i++){
    const j=(i+1)%p.outer.length;
    const a=p.outer[i],b=p.outer[j],c=p.inner[i],d=p.inner[j];
    face([start(a),start(b),start(d),start(c)]);
    face([end(d),end(b),end(a),end(c)]);
   }
  }
  for(let i=0;i<shell.length;i++){
   const j=(i+1)%shell.length;
   face([start(shell[i]),start(shell[j]),end(shell[j]),end(shell[i])])
  }
  if(p.inner){
   for(let i=0;i<p.inner.length;i++){
    const j=(i+1)%p.inner.length;
    face([start(p.inner[j]),start(p.inner[i]),end(p.inner[i]),end(p.inner[j])])
   }
  }
  return faces
 }
 function transform(v,item){
  let [x,y,z]=v;
  const degrees=Math.PI/180,r=item.rotation||{};
  const rx=NUMERIC(r.x)*degrees,ry=NUMERIC(r.y)*degrees,rz=NUMERIC(r.z)*degrees;
  let a=y*Math.cos(rx)-z*Math.sin(rx),b=y*Math.sin(rx)+z*Math.cos(rx);y=a;z=b;
  a=x*Math.cos(ry)+z*Math.sin(ry);b=-x*Math.sin(ry)+z*Math.cos(ry);x=a;z=b;
  a=x*Math.cos(rz)-y*Math.sin(rz);b=x*Math.sin(rz)+y*Math.cos(rz);x=a;y=b;
  const p=item.position||{};
  return[x+NUMERIC(p.x),y+NUMERIC(p.y),z+NUMERIC(p.z)]
 }
 function build(items){
  const list=[],all=[];
  for(const item of items.slice(0,150)){
   if(!item.counted||!item.shape||!item.position||!item.rotation)continue;
   const faces=prism(item.shape);
   if(list.length+faces.length>FACE_LIMIT)break;
   for(const f of faces){
    const verts=f.map(v=>transform(v,item));
    list.push({verts,id:item.id,mark:item.partPosition,shape:item.shape.type});
    all.push(...verts)
   }
  }
  const bbox=all.length?{
   min:[0,1,2].map(i=>Math.min(...all.map(v=>v[i]))),
   max:[0,1,2].map(i=>Math.max(...all.map(v=>v[i])))
  }:null;
  return{faces:list,bbox,partIds:new Set(list.map(f=>f.id))}
 }
 function create(host,items,{onSelect}={}){
  host.innerHTML="";
  const holder=document.createElement("div");holder.className="ir-ai-assembly-viewport";
  const canvas=document.createElement("canvas");canvas.className="ir-ai-assembly-canvas";
  canvas.tabIndex=0;canvas.setAttribute("aria-label","3D-просмотр подтверждённых деталей КМД. Перетаскивание — поворот, колесо — масштаб.");
  holder.appendChild(canvas);host.appendChild(holder);
  const ctx=canvas.getContext("2d",{alpha:false});
  const model=build(items||[]),box=model.bbox;
  let yaw=-.68,pitch=.39,zoom=1.0,selected=null,disposed=false,drag=null,
   lastFaces=[],raf=0;
  const center=box?box.min.map((x,i)=>(x+box.max[i])/2):[0,0,0];
  const span=box?Math.max(1,...box.max.map((x,i)=>x-box.min[i])):1000;
  function project(point,w,h){
   const dx=point[0]-center[0],dy=point[1]-center[1],dz=point[2]-center[2];
   const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
   const right=[cy,-sy,0],up=[sp*sy,sp*cy,cp],depth=[-cp*sy,-cp*cy,sp];
   const scale=Math.min(w,h)/span*.73*zoom;
   return{x:w/2+(dx*right[0]+dy*right[1]+dz*right[2])*scale,
    y:h/2-(dx*up[0]+dy*up[1]+dz*up[2])*scale,
    depth:dx*depth[0]+dy*depth[1]+dz*depth[2]}
  }
  function inside(p,polygon){
   let hit=false;
   for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit
   }
   return hit
  }
  function updateSize(){
   const rect=holder.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
   const w=Math.max(320,Math.round(rect.width*dpr)),h=Math.max(250,Math.round(rect.height*dpr));
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
   return{w,h}
  }
  function draw(){
   if(disposed||!ctx)return;
   const {w,h}=updateSize();
   ctx.fillStyle="#f3f7fb";ctx.fillRect(0,0,w,h);
   ctx.lineWidth=Math.max(1,window.devicePixelRatio||1);
   if(!box){
    ctx.fillStyle="#648298";ctx.textAlign="center";ctx.font="14px Arial";
    ctx.fillText("Нет подтверждённой геометрии деталей",w/2,h/2);return
   }
   const axes=[[[0,0,0],[span*.32,0,0],"X","#e06355"],
    [[0,0,0],[0,span*.32,0],"Y","#3d9d81"],
    [[0,0,0],[0,0,span*.32],"Z","#3372bf"]];
   for(const [a,b,t,col] of axes){
    const u=project(center.map((v,i)=>v+a[i]),w,h),
     v=project(center.map((c,i)=>c+b[i]),w,h);
    ctx.strokeStyle=col;ctx.beginPath();ctx.moveTo(u.x,u.y);ctx.lineTo(v.x,v.y);ctx.stroke();
    ctx.fillStyle=col;ctx.font="bold 12px Arial";ctx.fillText(t,v.x+4,v.y-4)
   }
   const polygons=[];
   for(const face of model.faces){
    const points=face.verts.map(v=>project(v,w,h)),d=points.reduce((s,p)=>s+p.depth,0)/points.length;
    const ax=face.verts[1].map((x,i)=>x-face.verts[0][i]),
     bx=face.verts[2].map((x,i)=>x-face.verts[0][i]);
    const normal=[ax[1]*bx[2]-ax[2]*bx[1],ax[2]*bx[0]-ax[0]*bx[2],ax[0]*bx[1]-ax[1]*bx[0]];
    const mag=Math.hypot(...normal)||1,bright=.64+.24*Math.abs((normal[0]*.37+normal[1]*.51+normal[2]*.78)/mag);
    polygons.push({...face,points,depth:d,brightness:bright})
   }
   polygons.sort((a,b)=>a.depth-b.depth);
   lastFaces=polygons;
   for(const face of polygons){
    const chosen=selected===face.id;
    const base=face.shape==="plate"?"#3c9c86":face.shape==="chs"?"#845bc9":
     face.shape==="rhs"?"#5f83c9":face.shape==="ibeam"?"#477dbb":"#7d90a8";
    const shade=chosen?"#efb64a":base;
    ctx.fillStyle=shade;ctx.globalAlpha=Math.min(1,face.brightness+.08);
    ctx.beginPath();face.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.closePath();ctx.fill();ctx.globalAlpha=1;
    ctx.strokeStyle=chosen?"#b96d10":"#284b6688";ctx.stroke()
   }
   ctx.fillStyle="#637e93";ctx.font="11px Arial";ctx.textAlign="left";
   ctx.fillText("X / Y / Z — мм   •   "+model.partIds.size+" подтверждённых деталей",14,h-15)
  }
  const redraw=()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;draw()})};
  function selectAt(x,y){
   const rect=canvas.getBoundingClientRect();
   const point={x:(x-rect.left)*canvas.width/rect.width,
    y:(y-rect.top)*canvas.height/rect.height};
   const polygons=[...lastFaces].reverse();
   const hit=polygons.find(f=>inside(point,f.points));
   selected=hit?.id||null;onSelect?.(selected);redraw()
  }
  canvas.addEventListener("pointerdown",e=>{
   if(e.button!==0)return;
   drag={id:e.pointerId,x:e.clientX,y:e.clientY,originalX:e.clientX,originalY:e.clientY};
   canvas.setPointerCapture?.(e.pointerId)
  });
  canvas.addEventListener("pointermove",e=>{
   if(!drag||drag.id!==e.pointerId)return;
   const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
   yaw+=dx*.009;pitch=Math.max(-1.5,Math.min(1.5,pitch+dy*.009));
   drag.x=e.clientX;drag.y=e.clientY;redraw()
  });
  canvas.addEventListener("pointerup",e=>{
   if(!drag||drag.id!==e.pointerId)return;
   if(Math.hypot(e.clientX-drag.originalX,e.clientY-drag.originalY)<5)selectAt(e.clientX,e.clientY);
   drag=null
  });
  canvas.addEventListener("pointercancel",()=>{drag=null});
  canvas.addEventListener("wheel",e=>{
   e.preventDefault();zoom=Math.max(.22,Math.min(8,zoom*(e.deltaY>0?.88:1.12)));redraw()
  },{passive:false});
  const resizer=typeof ResizeObserver==="function"?new ResizeObserver(redraw):null;
  resizer?.observe(holder);
  window.addEventListener("resize",redraw);
  redraw();
  return{
   setView(name){
    if(name==="front"){yaw=0;pitch=0}
    else if(name==="side"){yaw=Math.PI/2;pitch=0}
    else if(name==="top"){yaw=0;pitch=Math.PI/2-.001}
    else{yaw=-.68;pitch=.39}
    redraw()
   },
   reset(){zoom=1;selected=null;onSelect?.(null);redraw()},
   select(id){selected=id;redraw()},
   dispose(){disposed=true;resizer?.disconnect();window.removeEventListener("resize",redraw);
    if(raf)cancelAnimationFrame(raf);host.innerHTML=""}
  }
 }
 return{create}
})();
