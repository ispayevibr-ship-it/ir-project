"use strict";
/* 1.7.130 — GPU-cached steel cross-sections. Rendering only; no DB changes. */
window.irSteelRenderer=(canvas,state,{markRgb,typeRgb,typeKey,pt})=>{
 const gl=canvas.getContext("webgl",{alpha:true,antialias:true,depth:true,premultipliedAlpha:false});if(!gl)return null;
 const shader=(kind,code)=>{const s=gl.createShader(kind);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){console.warn("Steel shader:",gl.getShaderInfoLog(s));gl.deleteShader(s);return null}return s};
 const vs=shader(gl.VERTEX_SHADER,"attribute vec3 p;attribute vec3 color;attribute float light;attribute float member;uniform vec3 origin;uniform vec3 vx;uniform vec3 vy;uniform vec3 vz;uniform float selected;uniform float hovered;varying vec3 rgb;void main(){vec3 c=color;if(abs(member-selected)<.25)c=vec3(.12,.45,.95);else if(abs(member-hovered)<.25)c=vec3(.12,.68,.93);rgb=clamp(c*light,0.,1.);gl_Position=vec4(origin+p.x*vx+p.y*vy+p.z*vz,1.);}");
 const fs=shader(gl.FRAGMENT_SHADER,"precision mediump float;varying vec3 rgb;void main(){gl_FragColor=vec4(rgb,1.);}");
 if(!vs||!fs)return null;
 const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS)){gl.deleteProgram(program);return null}
 const a=["p","color","light","member"].map(n=>gl.getAttribLocation(program,n));
 const u=["origin","vx","vy","vz","selected","hovered"].map(n=>gl.getUniformLocation(program,n));
 const buffer=gl.createBuffer();gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
 const bound=(n,a,b)=>Math.max(a,Math.min(b,n));
 const vec=(a,k)=>a.map(n=>n*k),plus=(a,b)=>a.map((n,i)=>n+b[i]),diff=(a,b)=>a.map((n,i)=>n-b[i]);
 const unit=v=>vec(v,1/(Math.hypot(...v)||1));
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const sun=unit([-.44,.50,.77]);
 const section=c=>{
  const label=String(c.profile_name||"").toUpperCase().replace(/,/g,".");
  const group=typeKey(c);
  let type=String(c.section_type||"ibeam").toLowerCase(),[h,w]=["columns","fahwerk"].includes(group)?[360,350]:group==="purlins"?[150,90]:group==="ties"?[90,90]:[310,165],t=0;
  const round=label.match(/[Ø⌀Ф]\s*(\d{2,4}(?:\.\d+)?)(?:\s*[XХ×]\s*(\d{1,3}(?:\.\d+)?))?/);
  const rect=label.match(/(\d{2,4}(?:\.\d+)?)\s*[XХ×]\s*(\d{2,4}(?:\.\d+)?)(?:\s*[XХ×]\s*(\d{1,3}(?:\.\d+)?))?/);
  const beam=label.match(/(?:^|\s)(\d{2,3})\s*([КБШ])\d*/);
  if(round){type="round";h=w=+round[1];t=+round[2]||0}
  else if(rect){h=+rect[1];w=+rect[2];t=+rect[3]||0}
  else if(beam){h=+beam[1]*10;w=beam[2]==="К"?h:h*(beam[2]==="Ш"?.68:.52)}
  h=bound(h,35,1600);w=bound(w,25,1600);t=bound(t||Math.min(h,w)*.06,2,Math.min(h,w)*.24);
  return{type,h:h/2,w:w/2,t,flange:bound(h*.065,4,h*.22)}
 };
 let last=null,mode="",colorMode="",vertices=0,uploads=0,ids=new Map(),meshCache=new Map(),computedParts=0,reusedParts=0;
 const build=segments=>{
  let data=[];
  const parts=[];let totalFloats=0;
  // Cutting away bays or hiding construction types never changes their
  // geometry. Reuse already extruded members instead of generating again.
  if(mode!==state.renderMode||colorMode!==state.colorMode)meshCache.clear();
  const realistic=state.renderMode==="real";
  const tint=c=>state.colorMode==="mark"?markRgb(c):state.colorMode==="type"?typeRgb(c):({mounted:[.13,.62,.47],partial:[.82,.60,.28],planned:[.78,.42,.47]})[c.status]||[.78,.42,.47];
  const vertex=(p,color,shade,id)=>data.push(...p,...color,shade,id);
  const tri=(p,q,r,color,id,offset=0)=>{
   const n=unit(cross(diff(q,p),diff(r,p))),light=bound((realistic?.60:.66)+(realistic?.56:.44)*Math.abs(n[0]*sun[0]+n[1]*sun[1]+n[2]*sun[2])+offset,.4,1.22);
   vertex(p,color,light,id);vertex(q,color,light,id);vertex(r,color,light,id)
  };
  const quad=(p,q,r,s,color,id,offset=0)=>{tri(p,q,r,color,id,offset);tri(p,r,s,color,id,offset)};
  for(const seg of segments){
   const idKey=String(seg.c.id);
   if(!ids.has(idKey))ids.set(idKey,ids.size);
   const cacheKey=idKey+":"+String(seg.part||0);
   const existing=meshCache.get(cacheKey);
   if(existing){
    parts.push(existing);totalFloats+=existing.length;reusedParts++;continue;
   }
   data=[];
   const c=seg.c,start=[seg.start.x,seg.start.y,seg.start.z],end=[seg.end.x,seg.end.y,seg.end.z],v=diff(end,start);
   if(Math.hypot(...v)<.5)continue;
   const key=String(c.id);if(!ids.has(key))ids.set(key,ids.size);
   const id=ids.get(key),col=tint(c),d=unit(v),ref=Math.abs(d[2])>.78?[0,1,0]:[0,0,1];
   let right=unit(cross(d,ref)),up=unit(cross(d,right));
   const rot=(Number(c.rotation_deg)||0)*Math.PI/180;
   if(rot){const x=right,y=up;right=plus(vec(x,Math.cos(rot)),vec(y,Math.sin(rot)));up=plus(vec(y,Math.cos(rot)),vec(x,-Math.sin(rot)))}
   const pos=(base,x,y)=>plus(base,plus(vec(right,x),vec(up,y)));
   const box=(x0,x1,y0,y1)=>{
    const shape=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],A=shape.map(([x,y])=>pos(start,x,y)),B=shape.map(([x,y])=>pos(end,x,y));
    for(let i=0;i<4;i++){const j=(i+1)%4;quad(A[i],B[i],B[j],A[j],col,id,i===0?.06:0)}
    quad(A[3],A[2],A[1],A[0],col,id);quad(B[0],B[1],B[2],B[3],col,id)
   };
   if(!realistic){const w=c.geometryType==="column"?180:c.geometryType==="brace"?78:115;box(-w,w,-w*.73,w*.73)}
   else{
   const s=section(c),w=s.w,h=s.h,t=s.t;
   if(s.type==="ibeam"){
    const f=Math.min(s.flange,h*.4),web=Math.min(w*.32,t*.5);
    box(-w,w,-h,-h+f);box(-web,web,-h+f,h-f);box(-w,w,h-f,h);
   }else if(s.type==="square"||s.type==="box"){
    const iw=Math.max(2,w-t),ih=Math.max(2,h-t),o=[[-w,-h],[w,-h],[w,h],[-w,h]],inside=[[-iw,-ih],[iw,-ih],[iw,ih],[-iw,ih]];
    for(let i=0;i<4;i++){let j=(i+1)%4;
     quad(pos(start,...o[i]),pos(end,...o[i]),pos(end,...o[j]),pos(start,...o[j]),col,id);
     quad(pos(start,...inside[j]),pos(end,...inside[j]),pos(end,...inside[i]),pos(start,...inside[i]),col,id,-.17);
     quad(pos(start,...o[i]),pos(start,...o[j]),pos(start,...inside[j]),pos(start,...inside[i]),col,id,.03);
     quad(pos(end,...o[j]),pos(end,...o[i]),pos(end,...inside[i]),pos(end,...inside[j]),col,id,.03)
    }
   }else if(s.type==="round"){
    const N=10,iw=Math.max(2,w-t),ih=Math.max(2,h-t),circle=(p,x,y,a)=>pos(p,x*Math.cos(a),y*Math.sin(a));
    for(let i=0;i<N;i++){let a=i*2*Math.PI/N,b=(i+1)*2*Math.PI/N;
     quad(circle(start,w,h,a),circle(end,w,h,a),circle(end,w,h,b),circle(start,w,h,b),col,id);
     quad(circle(start,iw,ih,b),circle(end,iw,ih,b),circle(end,iw,ih,a),circle(start,iw,ih,a),col,id,-.17);
     quad(circle(start,w,h,a),circle(start,w,h,b),circle(start,iw,ih,b),circle(start,iw,ih,a),col,id,.03);
     quad(circle(end,w,h,b),circle(end,w,h,a),circle(end,iw,ih,a),circle(end,iw,ih,b),col,id,.03)
    }
   }else box(-w,w,-h,h)
   }
   const chunk=new Float32Array(data);
   meshCache.set(cacheKey,chunk);parts.push(chunk);totalFloats+=chunk.length;computedParts++;
  }
  const merged=new Float32Array(totalFloats);
  let offset=0;
  for(const chunk of parts){merged.set(chunk,offset);offset+=chunk.length}
  vertices=totalFloats/8;
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,merged,gl.STATIC_DRAW);
  uploads++;last=segments;mode=state.renderMode;colorMode=state.colorMode
 };
 const render=(segments,projection,w,h,dpr)=>{
  const px=Math.max(1,Math.round(w*dpr)),py=Math.max(1,Math.round(h*dpr));
  if(canvas.width!==px||canvas.height!==py){canvas.width=px;canvas.height=py}
  gl.viewport(0,0,px,py);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  if(last!==segments||mode!==state.renderMode||colorMode!==state.colorMode)build(segments);
  if(!vertices)return;
  let extent=40;for(const s of segments)extent=Math.max(extent,Math.abs(projection.raw(s.start).depth),Math.abs(projection.raw(s.end).depth));
  extent*=1.65;
  const point=p=>{const s=projection.project(pt(...p));return[2*s.x/w-1,1-2*s.y/h,-bound(s.depth/extent,-.95,.95)]};
  const o=point([0,0,0]),axis=v=>point(v).map((x,i)=>(x-o[i])/1000);
  gl.useProgram(program);
  gl.uniform3fv(u[0],o);gl.uniform3fv(u[1],axis([1000,0,0]));gl.uniform3fv(u[2],axis([0,1000,0]));gl.uniform3fv(u[3],axis([0,0,1000]));
  gl.uniform1f(u[4],ids.has(String(state.selected))?ids.get(String(state.selected)):-1);
  gl.uniform1f(u[5],ids.has(String(state.hover))?ids.get(String(state.hover)):-1);
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  for(const [id,n,offset] of [[a[0],3,0],[a[1],3,12],[a[2],1,24],[a[3],1,28]]){
   if(id<0)continue;gl.enableVertexAttribArray(id);gl.vertexAttribPointer(id,n,gl.FLOAT,false,32,offset)
  }
  gl.drawArrays(gl.TRIANGLES,0,vertices)
 };
 return{render,stats:()=>({vertices,uploads,computedParts,reusedParts}),dispose(){
  meshCache.clear();
  gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.getExtension("WEBGL_lose_context")?.loseContext()
 }};
};
