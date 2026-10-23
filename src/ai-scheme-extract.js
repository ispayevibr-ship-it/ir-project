"use strict";
/*
 * IR Project: deterministic montage-scheme extraction from vector PDF geometry.
 * No neural network. Input is the page's line segments and text items in
 * top-down PDF points; output is the axis grid in millimetres and element
 * placements in the ir-project-scheme-placements-v1 coordinate convention
 * (X from the leftmost axis to the right, Y from the lowest axis upwards).
 * Every placement keeps its source point on the sheet and a confidence note.
 */
// Axis names: "12", "4а", "Б", "Л/1", "О3", "О6/2" (an extension of the building numbered after axis О).
const AXIS_LABEL=/^(?:[А-ЯЁA-Z]{0,2}\d{1,3}[а-яa-z]?|[А-ЯЁA-Z]{1,2})(?:\/\d{1,2})?$/u;
// "O4" typed with a Latin O and "04" typed with a zero are the same axis "О4".
const axisName=str=>String(str).trim().replace(/^[OО0](?=\d)/u,"О");
// Upper-case codes ("СВ3") and mixed-case ones ("Сгф3", "Фс1").
const MARK_LABEL=/^([А-ЯЁA-Z]{1,3}|[А-ЯЁA-Z][а-яё]{1,2})(\d{1,4})(?:[-.]\d{1,3})?[а-я]?$/u;
// Sheet references (М1.4) and section names are not shipping marks.
// Sheet references ("КМ1-21", "КМД-3"), sheet sizes and the like are not shipping marks.
// Column bases ("Бк1") are drawn at the column and are not members of the scheme.
const NOT_MARK=/^(?:М\d|Л\d|ПК|КМД?\d|КЖ\d|АР\d|Бк\d)/u,BASE_LABEL=/^Бк\d{1,2}$/u;
// "А1", "А20" are marks in sets that use this letter for their elements: many different such labels on the sheet.
// Alone, "А3" is a sheet format; А240…А1000 are rebar classes.
const REBAR=/^А(?:240|300|400|500|600|800|1000)[СC]?$/u;
function aMarksOn(texts){
 const seen=new Set();
 for(const t of texts){const s=String(t.str||"").trim();if(/^А\d{1,3}(?:[-.]\d{1,3})?$/u.test(s)&&!REBAR.test(s))seen.add(s)}
 return seen.size>=5
}
const notMark=(mark,aMarks)=>/^А\d/u.test(mark)?!aMarks||REBAR.test(mark):NOT_MARK.test(mark);
// Prefix of a shipping mark → element kind, by ГОСТ 26047 and КМД practice (src/ai-kmd-rules.js).
const {KIND_BY_CODE,schemeTitleKind,markCode}=require("./ai-kmd-rules");
const {extractFootprints,footprintPlacements}=require("./ai-footprint-extract");
const DEFAULT_KINDS=KIND_BY_CODE;
const KIND_NAMES={column:"Колонна/стойка",brace:"Связь",beam:"Балка/ригель/прогон"};

const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const median=a=>{if(!a.length)return NaN;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};

function textBox(t){
 // Text baseline-left point in top-down space; italic drafting fonts lean
 // right, the glyph body is about 0.7 of the font size above the baseline.
 const angle=Math.round(t.angle||0);
 if(Math.abs(angle)<10)return{x0:t.x,x1:t.x+t.width,y0:t.y-t.size*0.75,y1:t.y,cx:t.x+t.width/2,cy:t.y-t.size*0.36,angle:0};
 // Rotated (vertical) text: width runs along -Y in top-down coordinates.
 const up=angle>0;
 return{x0:t.x-t.size*0.75,x1:t.x,y0:up?t.y-t.width:t.y,y1:up?t.y:t.y+t.width,
  cx:t.x-t.size*0.36,cy:up?t.y-t.width/2:t.y+t.width/2,angle:up?90:-90};
}

function buildIndex(segments){
 const cell=24,grid=new Map();
 const key=(x,y)=>Math.floor(x/cell)+":"+Math.floor(y/cell);
 segments.forEach((s,i)=>{
  for(const p of [s.a,s.b]){const k=key(p.x,p.y);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i)}
 });
 return{near(p,r){
  const out=new Set();
  for(let gx=Math.floor((p.x-r)/cell);gx<=Math.floor((p.x+r)/cell);gx++)
   for(let gy=Math.floor((p.y-r)/cell);gy<=Math.floor((p.y+r)/cell);gy++)
    for(const i of grid.get(gx+":"+gy)||[])out.add(i);
  return[...out]
 }}
}

// An axis bubble is a circle drawn around its label; KOMPAS and AutoCAD export
// it as a polygon of short segments, so detect it by endpoints on a ring.
function findBubble(text,segments,index){
 const box=textBox(text);if(box.angle!==0)return null;
 const c0={x:box.cx,y:box.cy};
 const pts=[];
 for(const i of index.near(c0,26)){
  const s=segments[i];
  if(dist(s.a,s.b)>9)continue;
  for(const p of [s.a,s.b]){const d=dist(p,c0);if(d>3&&d<24)pts.push(p)}
 }
 const unique=[...new Map(pts.map(p=>[p.x.toFixed(1)+","+p.y.toFixed(1),p])).values()];
 if(unique.length<10)return null;
 // The label centre is only approximate: search nearby centres for the one
 // with the most endpoints at a common radius.
 let best=null;
 for(let dx=-6;dx<=6;dx+=0.5)for(let dy=-6;dy<=6;dy+=0.5){
  const c={x:c0.x+dx,y:c0.y+dy},ds=unique.map(p=>dist(p,c));
  for(let r=4;r<=20;r+=0.5){
   const n=ds.filter(d=>Math.abs(d-r)<0.6).length;
   if(!best||n>best.n)best={n,c,r}
  }
 }
 if(best.n<10)return null;
 const center=best.c,r=best.r;
 const ring=unique.filter(p=>Math.abs(dist(p,center)-r)<0.6);
 const octants=new Set(ring.map(p=>Math.floor(((Math.atan2(p.y-center.y,p.x-center.x)+Math.PI)/(2*Math.PI))*8)%8));
 if(r<4||r>20||ring.length<10||octants.size<7)return null;
 // The label must sit inside the ring.
 if(dist(c0,center)>r*0.7)return null;
 return{name:axisName(text.str),x:center.x,y:center.y,r}
}

// Collinear runs of horizontal or vertical segments (dash-dot axis lines are
// many short dashes). Returns merged intervals along the line.
function runsAt(segments,orient,pos,tol=0.8,gap=14){
 const iv=[];
 for(const s of segments){
  if(orient==="V"){
   if(Math.abs(s.a.x-s.b.x)>0.3||Math.abs((s.a.x+s.b.x)/2-pos)>tol)continue;
   iv.push([Math.min(s.a.y,s.b.y),Math.max(s.a.y,s.b.y)])
  }else{
   if(Math.abs(s.a.y-s.b.y)>0.3||Math.abs((s.a.y+s.b.y)/2-pos)>tol)continue;
   iv.push([Math.min(s.a.x,s.b.x),Math.max(s.a.x,s.b.x)])
  }
 }
 iv.sort((a,b)=>a[0]-b[0]);
 const out=[];
 for(const [a,b] of iv){
  const last=out[out.length-1];
  if(last&&a<=last[1]+gap){last[1]=Math.max(last[1],b);last.n++}else out.push(Object.assign([a,b],{n:1}))
 }
 return out
}

function axisFromBubble(b,segments){
 let best=null;
 for(const orient of ["V","H"]){
  const centre=orient==="V"?b.x:b.y,along=orient==="V"?b.y:b.x;
  // The ring centre is found to about a point; the axis line may pass a little aside of it.
  const near=new Set([centre]);
  for(const s of segments){
   const p=orient==="V"?s.a.x:s.a.y,q=orient==="V"?s.b.x:s.b.y;
   if(Math.abs(p-q)<=0.3&&Math.abs(p-centre)<=Math.min(3,b.r*0.3)&&Math.abs(p-centre)>0.6)near.add(Math.round(p*10)/10)
  }
  // Dash-dot patterns differ between CAD programs: a gap up to about two bubble radii is still one axis.
  for(const pos of near)for(const run of runsAt(segments,orient,pos,0.8,Math.max(20,b.r*3.5))){
   const len=run[1]-run[0];
   const touch=Math.min(Math.abs(run[0]-along),Math.abs(run[1]-along));
   // The line starts at the bubble edge and does not pass through the label.
   if(touch>b.r+8||(run[0]<along-b.r&&run[1]>along+b.r))continue;
   // Dash-dot axes are drawn as many dashes; a single long solid line is a
   // dimension or outline, not an axis.
   if(len<Math.max(60,b.r*8)||run.n<3)continue;
   if(!best||len>best.len)best={orient,pos,span:[run[0],run[1]],len}
  }
 }
 return best?{name:b.name,orient:best.orient,pos:best.pos,span:best.span,bubbles:[b]}:null
}

function mergeAxes(axes){
 const out=[];
 for(const a of axes){
  // Side-by-side plans repeat axis names at the same height; only bubbles
  // at both ends of one continuous line belong to the same axis.
  const same=out.find(o=>o.orient===a.orient&&o.name===a.name&&Math.abs(o.pos-a.pos)<1.5&&
   a.span[0]<=o.span[1]+20&&a.span[1]>=o.span[0]-20);
  if(same){same.span=[Math.min(same.span[0],a.span[0]),Math.max(same.span[1],a.span[1])];same.bubbles.push(...a.bubbles)}
  else out.push({...a,bubbles:[...a.bubbles]})
 }
 return out
}

// One grid line labelled differently at its two ends (old and new numbering, "3" on the left, "В" on the right):
// the name of the kind most lines of that direction use (letters or numbers) is kept.
function oneName(list){
 const digit=a=>/^\d/.test(a.name),digits=list.filter(digit).length,preferDigits=digits*2>list.length;
 const out=[];
 for(const a of [...list].sort((x,y)=>(digit(x)===preferDigits?0:1)-(digit(y)===preferDigits?0:1))){
  const same=out.find(o=>Math.abs(o.pos-a.pos)<3);
  if(same){if(same.name!==a.name)same.alias=a.name;continue}
  out.push({...a})
 }
 return out
}

function groupSchemes(axes){
 const parent=axes.map((_,i)=>i);
 const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
 // A dash-dot line may start with a gap of up to a dash before the line it meets.
 const crosses=(v,h)=>v.pos>=h.span[0]-15&&v.pos<=h.span[1]+15&&h.pos>=v.span[0]-15&&h.pos<=v.span[1]+15;
 axes.forEach((a,i)=>axes.forEach((b,j)=>{
  if(j<=i||a.orient===b.orient)return;
  const [v,h]=a.orient==="V"?[a,b]:[b,a];
  if(crosses(v,h))parent[find(i)]=find(j)
 }));
 const groups=new Map();
 axes.forEach((a,i)=>{const k=find(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(a)});
 // Sections and details carry one or two bubbles; a plan has a grid. A small plan of a porch or a platform may be tied
 // to one or two axes each way (О7 and Б crossing): kept as «local», a scheme only with its title and dimensions (below).
 return[...groups.values()].filter(g=>g.some(a=>a.orient==="V")&&g.some(a=>a.orient==="H"))
  .filter(g=>{const nv=g.filter(a=>a.orient==="V").length,nh=g.filter(a=>a.orient==="H").length;if(nv>=2&&nh>=2)return true;
   // A long run of axes with one crossing line is a wall elevation or a detail of the main grid, not a small structure.
   g.local=true;return nv<=2&&nh<=2})
}

// Drawings are made at standard scales: millimetres per point of 1:N is N·25.4/72.
const SCALES=[1,2,2.5,4,5,10,15,20,25,40,50,75,100,150,200,250,300,400,500,800,1000];
// The scale of a view tied to one axis each way, from its dimensions: the dimension line just under a horizontal
// number (or beside a vertical one) and the extension lines crossing it nearest to the number on each side.
function dimensionsOf(texts,segments){
 const H=[],V=[];
 for(const q of segments){
  if(Math.abs(q.a.y-q.b.y)<0.3&&Math.abs(q.a.x-q.b.x)>=8)H.push({c:(q.a.y+q.b.y)/2,lo:Math.min(q.a.x,q.b.x),hi:Math.max(q.a.x,q.b.x)});
  else if(Math.abs(q.a.x-q.b.x)<0.3&&Math.abs(q.a.y-q.b.y)>=4)V.push({c:(q.a.x+q.b.x)/2,lo:Math.min(q.a.y,q.b.y),hi:Math.max(q.a.y,q.b.y)})
 }
 const out=[];
 for(const t of texts){
  const v=numberValue(t.str);if(!(v>=50))continue;
  const b=textBox(t),flat=b.angle===0;
  // Along: the direction of the dimension; the line lies 0.3–4 pt off the text's baseline.
  const at=flat?b.cx:b.cy,base=flat?b.y1:b.x1,along=flat?H:V,across=flat?V:H;
  const line=along.find(l=>l.c>=base+0.3&&l.c<=base+4&&l.lo<=at&&l.hi>=at);if(!line)continue;
  const ext=across.filter(e=>e.lo<=line.c+3&&e.hi>=line.c-3&&e.c>=line.lo-1&&e.c<=line.hi+1).map(e=>e.c);
  // A dimension's own extension lines never cross its number: one that does (the middle tick of the chain above,
  // run down through the overall dimension «2430» under «1215 1215») is passed over.
  const [t0,t1]=flat?[b.x0,b.x1]:[b.y0,b.y1],m=(t1-t0)*0.2,cross=ext.some(c=>c>t0+m&&c<t1-m);
  const lo=Math.max(...ext.filter(c=>cross?c<=t0+m:c<at)),hi=Math.min(...ext.filter(c=>cross?c>=t1-m:c>at));
  if(Number.isFinite(lo)&&Number.isFinite(hi)&&hi-lo>=4)out.push({v,lo,hi,flat,line:line.c,from:line.lo,to:line.hi})
 }
 return out
}
function dimensionScale(texts,segments){
 const dims=dimensionsOf(texts,segments);
 // Details of a larger scale may stand beside the plan («5-5», 1:10): of the standard scales that at least three
 // dimensions agree with, the one of the overall dimension (the largest number) is the plan's.
 let best=null;
 for(const k of SCALES){
  const n=k*25.4/72,agree=dims.filter(d=>Math.abs(d.v/(d.hi-d.lo)-n)/n<=0.04);
  if(agree.length<3)continue;
  const top=Math.max(...agree.map(d=>d.v));
  if(!best||top>best.top)best={n,top}
 }
 return best?best.n:NaN
}

// A plan drawn without axes («Схема расположения балок на отм. +5,500; +11,100» of a platform standing on its own): the
// view under its title is framed by its overall dimensions — the longest one each way, between its extension lines.
// The frame takes the place of the axes (named ▯1, ▯2 and ▯А, ▯Б, which no grid shares); the plan of the set puts it
// on the outline of the same size on the location plan.
// Levels named in a title: «на отм. +5,500; +11,100» → [5500, 11100].
function titleLevels(title){
 const m=/отм\s*\.?\s*(.*)$/iu.exec(String(title||""));if(!m)return[];
 return[...m[1].matchAll(/([+−-]?\d{1,2})[,.](\d{3})/gu)].map(x=>Math.round(Number((x[1]+"."+x[2]).replace("−","-"))*1000))
}
// What a framed plan covers: its frame and every member drawn beside it (the stair of a platform), in plan mm.
function extentOf(placements,f){
 const xs=[0,f.w_mm],ys=[0,f.h_mm];
 for(const p of placements){for(const k of ["x_mm","x2_mm"])if(Number.isFinite(p[k]))xs.push(p[k]);for(const k of ["y_mm","y2_mm"])if(Number.isFinite(p[k]))ys.push(p[k])}
 // A flight's width lies across its run.
 for(const p of placements.filter(p=>p.fitting_type==="flight")){const h=(p.diameter_mm||0)/2;if(p.x_mm===p.x2_mm)xs.push(p.x_mm-h,p.x_mm+h);else ys.push(p.y_mm-h,p.y_mm+h)}
 // The parts it occupies: the frame and each flight.
 const shapes=[{x0:0,x1:f.w_mm,y0:0,y1:f.h_mm},...placements.filter(p=>p.fitting_type==="flight").map(p=>{const h=(p.diameter_mm||0)/2;
  return p.x_mm===p.x2_mm?{x0:p.x_mm-h,x1:p.x_mm+h,y0:Math.min(p.y_mm,p.y2_mm),y1:Math.max(p.y_mm,p.y2_mm)}:{x0:Math.min(p.x_mm,p.x2_mm),x1:Math.max(p.x_mm,p.x2_mm),y0:p.y_mm-h,y1:p.y_mm+h}})];
 return{x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys),shapes}
}
function framedGroups(titles,texts,segments,claimed){
 const out=[];
 for(const t of titles){
  if(claimed.has(t))continue;
  const b=textBox(t);
  const row=titles.filter(o=>o!==t&&Math.abs(textBox(o).cy-b.cy)<60).map(o=>textBox(o).cx);
  const left=Math.max(b.cx-320,...row.filter(x=>x<b.cx).map(x=>(x+b.cx)/2)),right=Math.min(b.cx+320,...row.filter(x=>x>b.cx).map(x=>(x+b.cx)/2));
  const below=titles.filter(o=>o!==t&&textBox(o).cy>b.cy+60&&Math.abs(textBox(o).cx-b.cx)<220).map(o=>textBox(o).cy-20);
  const top=b.cy+(t.size||10)*1.6,bottom=Math.min(b.cy+800,...below);
  const zone=texts.filter(u=>{const c=textBox(u);return c.cx>left&&c.cx<right&&c.cy>top&&c.cy<bottom});
  const dims=dimensionsOf(zone,segments.filter(q=>Math.max(q.a.x,q.b.x)>left&&Math.min(q.a.x,q.b.x)<right&&Math.max(q.a.y,q.b.y)>top&&Math.min(q.a.y,q.b.y)<bottom));
  const scale=dimensionScale(zone,segments.filter(q=>Math.max(q.a.x,q.b.x)>left&&Math.min(q.a.x,q.b.x)<right&&Math.max(q.a.y,q.b.y)>top&&Math.min(q.a.y,q.b.y)<bottom));
  if(!Number.isFinite(scale))continue;
  const fits=d=>Math.abs(d.v/(d.hi-d.lo)-scale)/scale<=0.04&&d.v>=500;
  // An overall dimension whose far extension line was not found (it stops short of the line, or a tick of the chain
  // above was taken for it): measured to scale from the end that was found, when its dimension line reaches there.
  const repaired=d=>{
   if(fits(d)||d.v<500)return d;const n=d.v/scale;
   for(const [lo,hi] of [[d.hi-n,d.hi],[d.lo,d.lo+n]])if(lo>=d.from-1&&hi<=d.to+1&&(lo<d.lo-2||hi>d.hi+2))return{...d,lo,hi};
   return d
  };
  const sized=dims.map(repaired).filter(fits);
  const W=sized.filter(d=>d.flat).sort((a,b)=>b.v-a.v)[0],H=sized.filter(d=>!d.flat).sort((a,b)=>b.v-a.v)[0];
  if(!W||!H)continue;
  const g=[{orient:"V",pos:W.lo,span:[H.lo,H.hi],name:"▯1"},{orient:"V",pos:W.hi,span:[H.lo,H.hi],name:"▯2"},
   {orient:"H",pos:H.hi,span:[W.lo,W.hi],name:"▯А"},{orient:"H",pos:H.lo,span:[W.lo,W.hi],name:"▯Б"}];
  g.local=true;g.framed={scale,w_mm:W.v,h_mm:H.v,title:t};
  out.push(g)
 }
 return out
}

function bboxOf(axes){
 const xs=[],ys=[];
 for(const a of axes){
  if(a.orient==="V"){xs.push(a.pos);ys.push(...a.span)}else{ys.push(a.pos);xs.push(...a.span)}
 }
 return{x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)}
}

const numberValue=s=>{const t=String(s).trim();return/^\d{2,6}$/.test(t)?Number(t):NaN};

// Dimension texts between neighbouring axes give millimetres per point.
function detectScale(xs,ys,texts){
 const ratios=[];
 const scan=(lines,orient)=>{
  for(let i=0;i+1<lines.length;i++){
   const a=lines[i],b=lines[i+1],d=Math.abs(b-a);if(d<5)continue;
   for(const t of texts){
    const v=numberValue(t.str);if(!(v>=50))continue;
    const box=textBox(t);
    if(orient==="V"&&box.angle===0&&box.cx>Math.min(a,b)&&box.cx<Math.max(a,b))ratios.push({r:v/d,v,d});
    if(orient==="H"&&box.angle!==0&&box.cy>Math.min(a,b)&&box.cy<Math.max(a,b))ratios.push({r:v/d,v,d})
   }
  }
 };
 scan(xs,"V");scan(ys,"H");
 let best=null;
 for(const c of ratios){
  const members=ratios.filter(o=>Math.abs(o.r-c.r)/c.r<0.015);
  const span=new Set(members.map(m=>m.d.toFixed(1))).size;
  if(!best||span>best.span||span===best.span&&members.length>best.members.length)best={span,members}
 }
 // One matching dimension could be a coincidence; require it to repeat.
 return best&&(best.span>=2||best.members.length>=3)?median(best.members.map(m=>m.r)):NaN
}

function spansFor(lines,orient,texts,scale){
 const spans=[],notes=[];
 for(let i=0;i+1<lines.length;i++){
  const a=lines[i],b=lines[i+1],d=Math.abs(b-a),geo=d*scale;
  let exact=null;
  for(const t of texts){
   const v=numberValue(t.str);if(!(v>=50))continue;
   const box=textBox(t);
   const inside=orient==="V"?box.angle===0&&box.cx>Math.min(a,b)&&box.cx<Math.max(a,b):
    box.angle!==0&&box.cy>Math.min(a,b)&&box.cy<Math.max(a,b);
   if(inside&&Math.abs(v-geo)/geo<0.02&&(!exact||Math.abs(v-geo)<Math.abs(exact-geo)))exact=v
  }
  // Without a dimension text, grids are almost always laid out in 50 mm steps.
  const step50=Math.round(geo/50)*50;
  if(exact)spans.push(exact);else{spans.push(Math.abs(geo-step50)<=Math.max(15,geo*0.002)?step50:Math.round(geo/10)*10);notes.push(i)}
 }
 return{spans,notes}
}

// Unlabelled dash-dot lines inside a scheme (e.g. "оси стоек бокса").
function secondaryLines(segments,bbox,orient,labelled){
 const found=new Map();
 for(const s of segments){
  const vertical=Math.abs(s.a.x-s.b.x)<=0.3,horizontal=Math.abs(s.a.y-s.b.y)<=0.3;
  if(orient==="V"&&!vertical||orient==="H"&&!horizontal)continue;
  const pos=orient==="V"?s.a.x:s.a.y;
  if(orient==="V"&&(pos<bbox.x0-2||pos>bbox.x1+2)||orient==="H"&&(pos<bbox.y0-2||pos>bbox.y1+2))continue;
  const k=Math.round(pos*2)/2;found.set(k,(found.get(k)||0)+1)
 }
 const full=orient==="V"?bbox.y1-bbox.y0:bbox.x1-bbox.x0,out=[];
 for(const [k,n] of found){
  if(n<4||labelled.some(p=>Math.abs(p-k)<2)||out.some(p=>Math.abs(p-k)<2))continue;
  const runs=runsAt(segments,orient,k,0.6,14).filter(r=>r.n>=4);
  const len=runs.reduce((s,r)=>s+(r[1]-r[0]),0);
  if(len>=full*0.25)out.push(k)
 }
 return out.sort((a,b)=>a-b)
}

// Segments listed in every cell they cross, so that long member lines are found near a label.
function buildLineIndex(segments,minLength=6){
 const cell=24,grid=new Map();
 segments.forEach((s,i)=>{
  if(dist(s.a,s.b)<minLength)return;
  const x0=Math.floor(Math.min(s.a.x,s.b.x)/cell),x1=Math.floor(Math.max(s.a.x,s.b.x)/cell),
   y0=Math.floor(Math.min(s.a.y,s.b.y)/cell),y1=Math.floor(Math.max(s.a.y,s.b.y)/cell);
  if((x1-x0+1)*(y1-y0+1)>400)return;
  for(let gx=x0;gx<=x1;gx++)for(let gy=y0;gy<=y1;gy++){const k=gx+":"+gy;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i)}
 });
 return{near(p,r){
  const out=new Set();
  for(let gx=Math.floor((p.x-r)/cell);gx<=Math.floor((p.x+r)/cell);gx++)
   for(let gy=Math.floor((p.y-r)/cell);gy<=Math.floor((p.y+r)/cell);gy++)
    for(const i of grid.get(gx+":"+gy)||[])out.add(i);
  return[...out]
 }}
}
// Label centre and reading direction for text at any angle (top-down space, +90° reads upwards).
function textFrame(t){
 const a=(Number(t.angle)||0)*Math.PI/180,dir={x:Math.cos(a),y:-Math.sin(a)},up={x:dir.y,y:-dir.x};
 const w=Number(t.width)||0,h=Number(t.size)||8;
 return{dir,up,w,h,c:{x:t.x+dir.x*w/2+up.x*h*.36,y:t.y+dir.y*w/2+up.y*h*.36}}
}
const cross=(a,b)=>a.x*b.y-a.y*b.x;
// The whole drawn line of a member: collinear pieces joined across small gaps (joints, breaks).
function growLine(seed,segments,lines,skip){
 const a0=seed.a,len=dist(seed.a,seed.b),u={x:(seed.b.x-a0.x)/len,y:(seed.b.y-a0.y)/len};
 let tA=0,tB=len;
 const at=t=>({x:a0.x+u.x*t,y:a0.y+u.y*t});
 for(let pass=0;pass<80;pass++){
  let grown=false;
  for(const end of [at(tA),at(tB)])for(const i of lines.near(end,8)){
   if(skip.has(i))continue;
   const s=segments[i],l=dist(s.a,s.b);if(l<1)continue;
   const v={x:(s.b.x-s.a.x)/l,y:(s.b.y-s.a.y)/l};
   if(Math.abs(cross(u,v))>.02||Math.abs(cross(u,{x:s.a.x-a0.x,y:s.a.y-a0.y}))>.8)continue;
   const t1=(s.a.x-a0.x)*u.x+(s.a.y-a0.y)*u.y,t2=(s.b.x-a0.x)*u.x+(s.b.y-a0.y)*u.y;
   const lo=Math.min(t1,t2),hi=Math.max(t1,t2);
   if(hi<tA-3||lo>tB+3)continue;
   if(lo<tA-.01){tA=lo;grown=true}
   if(hi>tB+.01){tB=hi;grown=true}
  }
  if(!grown)break
 }
 return{a:at(tA),b:at(tB)}
}
// A member drawn as a line on the plan: its label lies along it, or a leader points onto it.
function memberLine(t,target,segments,lines,skip){
 const f=textFrame(t);
 const found=[];
 const consider=(i,score)=>found.push({i,score});
 if(target.leader){
  // The leader ends on the member: the longest line through that point.
  for(const i of lines.near(target,6)){
   if(skip.has(i)||i===target.segment)continue;
   const s=segments[i],l=dist(s.a,s.b);if(l<12)continue;
   const v={x:(s.b.x-s.a.x)/l,y:(s.b.y-s.a.y)/l},w={x:target.x-s.a.x,y:target.y-s.a.y},tt=w.x*v.x+w.y*v.y;
   if(tt<-1||tt>l+1||Math.abs(cross(v,w))>2.5)continue;
   // A label turned along a member is read along it first; its "leader" is usually a junction of lines.
   consider(i,(Math.abs(Number(t.angle)||0)>5?1e6:-1e6)-l)
  }
  // An arrow drawn filled stops a few points short of the member: the leader carried on hits it.
  const ls=Number.isInteger(target.segment)?segments[target.segment]:null;
  if(!found.length&&ls){
   const from=dist(ls.a,target)<dist(ls.b,target)?ls.b:ls.a,ll=dist(from,target)||1,r={x:(target.x-from.x)/ll,y:(target.y-from.y)/ll};
   for(const i of lines.near(target,10)){
    if(skip.has(i)||i===target.segment)continue;
    const s=segments[i],l=dist(s.a,s.b);if(l<24)continue;
    const v={x:(s.b.x-s.a.x)/l,y:(s.b.y-s.a.y)/l},den=cross(r,v);if(Math.abs(den)<0.2)continue;
    const w={x:s.a.x-target.x,y:s.a.y-target.y},k=cross(w,v)/den,u=cross(w,r)/den;
    if(k<0||k>8||u<-1||u>l+1)continue;
    consider(i,-1e6-l)
   }
  }
 }
 // Without a leader, or when the "leader" is a stroke of the drawing, the member runs along the label.
 {
  for(const i of lines.near(f.c,f.w/2+f.h*2.2)){
   if(skip.has(i))continue;
   const s=segments[i],l=dist(s.a,s.b);if(l<10)continue;
   const v={x:(s.b.x-s.a.x)/l,y:(s.b.y-s.a.y)/l};
   if(Math.abs(cross(v,f.dir))>.07)continue;
   const w={x:f.c.x-s.a.x,y:f.c.y-s.a.y},along=w.x*v.x+w.y*v.y,off=Math.abs(cross(v,w));
   if(off>f.h*1.7||along<-f.w/2||along>l+f.w/2)continue;
   consider(i,off)
  }
 }
 // Nearest first; short strokes next to the label (ticks, hatching) are passed over.
 found.sort((a,b)=>a.score-b.score);
 for(const c of found.slice(0,8)){
  const line=growLine(segments[c.i],segments,lines,skip);
  // A leader shelf is about as long as its label; a member is clearly longer.
  if(dist(line.a,line.b)>=Math.max(24,f.w*2.2))return line
 }
 return null
}

// Stair flights on a small plan: five or more equal parallel strokes (treads) at an even step of 180–320 mm, each
// 500–1600 mm long; a gap of a landing between two runs on one line makes two flights. Returned in the order of the
// climb — from the end lowest on the sheet (the south of the plan) — which is a reading, to be checked.
function flightsOf(segments,bbox,scale){
 const pad=2500/scale,out=[];
 for(const flat of [true,false]){
  const by=new Map();
  for(const q of segments){
   const along=flat?Math.abs(q.a.y-q.b.y)<0.3:Math.abs(q.a.x-q.b.x)<0.3;if(!along)continue;
   const lo=flat?Math.min(q.a.x,q.b.x):Math.min(q.a.y,q.b.y),hi=flat?Math.max(q.a.x,q.b.x):Math.max(q.a.y,q.b.y),at=flat?q.a.y:q.a.x;
   const len=(hi-lo)*scale;if(len<500||len>1600)continue;
   if((flat?at:lo)<bbox.y0-pad||(flat?at:hi)>bbox.y1+pad||(flat?lo:at)<bbox.x0-pad||(flat?hi:at)>bbox.x1+pad)continue;
   const k=Math.round(lo*2)+":"+Math.round(hi*2);(by.get(k)||by.set(k,[]).get(k)).push({at,lo,hi})
  }
  for(const list of by.values()){
   const ats=[...new Set(list.map(l=>Math.round(l.at*10)/10))].sort((a,b)=>a-b);if(ats.length<5)continue;
   const steps=ats.slice(1).map((v,i)=>v-ats[i]),step=median(steps);
   if(step*scale<180||step*scale>320)continue;
   // Runs of treads at the step; a gap of a landing (1 m and more) parts two flights, a shorter one is the break
   // line drawn across a flight cut by the plan.
   let run=[ats[0]];const runs=[];
   for(let i=1;i<ats.length;i++){const d=ats[i]-ats[i-1];if(d<step*0.6)continue;if(d<=step*1.4||d*scale<1000)run.push(ats[i]);else{runs.push(run);run=[ats[i]]}}
   runs.push(run);
   const {lo,hi}=list[0];
   for(const r of runs.filter(r=>r.length>=4)){
    // The flight runs from the step before its first tread to the step after its last.
    const a=r[0]-step,b=r[r.length-1]+step;
    out.push(flat?{flat,lo,hi,a,b,mid:(lo+hi)/2}:{flat,lo,hi,a,b,mid:(lo+hi)/2})
   }
  }
 }
 // Lowest on the sheet first (largest y), then the next along the climb.
 return out.sort((p,q)=>(q.flat?q.b:(q.hi))-(p.flat?p.b:(p.hi)))
}

// The climb of a flight: its line along the middle ends in an arrowhead (a small filled triangle, read as a glyph box
// lying along the line beyond its end) — +1 when it points to larger sheet coordinates, −1 to smaller, 0 when none.
function climbOf(f,segments,glyphs){
 const lo=Math.min(f.a,f.b)-12,hi=Math.max(f.a,f.b)+12,w=(f.hi-f.lo)*0.15;
 const lines=segments.filter(q=>f.flat?Math.abs(q.a.x-q.b.x)<0.3&&Math.abs(q.a.x-f.mid)<=w&&Math.abs(q.a.y-q.b.y)>=8:Math.abs(q.a.y-q.b.y)<0.3&&Math.abs(q.a.y-f.mid)<=w&&Math.abs(q.a.x-q.b.x)>=8)
  .map(q=>f.flat?{c:q.a.x,lo:Math.min(q.a.y,q.b.y),hi:Math.max(q.a.y,q.b.y)}:{c:q.a.y,lo:Math.min(q.a.x,q.b.x),hi:Math.max(q.a.x,q.b.x)}).filter(l=>l.hi>lo&&l.lo<hi);
 let vote=0;
 for(const g of glyphs||[]){
  const [g0,g1,a0,a1]=f.flat?[g.y0,g.y1,g.x0,g.x1]:[g.x0,g.x1,g.y0,g.y1],len=g1-g0,wid=a1-a0;
  if(!(len>=4&&len<=18&&wid>=1&&wid<=len*0.7)||g1<lo||g0>hi)continue;
  // The line the head sits on is the longest touching it (a leader may run on past the tip).
  let best=null;
  for(const l of lines){
   if(Math.abs(l.c-(a0+a1)/2)>1)continue;
   const c=Math.abs(l.hi-g0)<=1.5&&l.lo<g0-4?1:Math.abs(l.lo-g1)<=1.5&&l.hi>g1+4?-1:0;
   if(c&&(!best||l.hi-l.lo>best.len))best={c,len:l.hi-l.lo}
  }
  if(best)vote+=best.c
 }
 return Math.sign(vote)
}
// Level marks («+4,500», «-0,100») in and around a small plan: single ones and stacks (one mark per tier, read top
// down); nearest(p) — the values of the mark closest to a point (a landing), ascending.
function levelMarksNear(texts,bbox){
 const LEVEL=/^([+\-−±]?)\s*(\d{1,2})[,.](\d{3})$/u,pad=40;
 const found=texts.map(t=>{const m=LEVEL.exec(String(t.str||"").trim());if(!m||!m[1]&&m[2]!=="0")return null;const b=textBox(t);
  const v=(Number(m[2])*1000+Number(m[3]))*(/[−-]/u.test(m[1])?-1:1);return{v,cx:b.cx,cy:b.cy,x0:b.x0}})
  .filter(t=>t&&t.cx>bbox.x0-pad&&t.cx<bbox.x1+pad&&t.cy>bbox.y0-120&&t.cy<bbox.y1+160);
 const stacks=[];
 for(const t of [...found].sort((a,b)=>a.cy-b.cy)){const s=stacks.find(s=>Math.abs(s.x0-t.x0)<=4&&t.cy-s.last<=20);if(s){s.v.push(t.v);s.last=t.cy;s.cy1=t.cy}else stacks.push({x0:t.x0,cx:t.cx,cy:t.cy,cy1:t.cy,last:t.cy,v:[t.v]})}
 return{list:stacks,nearest:p=>{
  let best=null,d=Infinity;
  for(const s of stacks){const dy=p.y<s.cy?s.cy-p.y:p.y>s.cy1?p.y-s.cy1:0,e=Math.hypot(s.cx-p.x,dy);if(e<d){d=e;best=s}}
  return best?{stack:best,d,v:[...best.v].sort((a,b)=>a-b)}:null
 }}
}

// Node symbols of a small plan (a post or a joint drawn as a small box of 3–8 pt): the chained short strokes of each,
// grouped by their ends.
function nodeBoxes(segments,bbox){
 const pad=40,short=segments.filter(q=>dist(q.a,q.b)<7&&q.a.x>bbox.x0-pad&&q.a.x<bbox.x1+pad&&q.a.y>bbox.y0-pad&&q.a.y<bbox.y1+pad);
 const cell=4,grid=new Map(),key=(x,y)=>Math.floor(x/cell)+":"+Math.floor(y/cell);
 short.forEach((q,i)=>{for(const p of [q.a,q.b]){const k=key(p.x,p.y);(grid.get(k)||grid.set(k,[]).get(k)).push(i)}});
 const parent=short.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
 short.forEach((q,i)=>{for(const p of [q.a,q.b]){const gx=Math.floor(p.x/cell),gy=Math.floor(p.y/cell);
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const j of grid.get((gx+dx)+":"+(gy+dy))||[])if(j!==i&&[short[j].a,short[j].b].some(r=>dist(r,p)<0.15))parent[find(i)]=find(j)}});
 const groups=new Map();short.forEach((q,i)=>{const k=find(i);(groups.get(k)||groups.set(k,[]).get(k)).push(q)});
 const out=[];
 for(const g of groups.values()){
  if(g.length<4)continue;
  const xs=g.flatMap(q=>[q.a.x,q.b.x]),ys=g.flatMap(q=>[q.a.y,q.b.y]),w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);
  // Closed: every end meets another stroke.
  const ends=g.flatMap(q=>[q.a,q.b]),open=ends.filter(p=>ends.filter(r=>dist(r,p)<0.15).length<2).length;
  if(w>=3&&w<=9&&h>=3&&h<=9&&Math.abs(w-h)<=2.5&&open===0)out.push({x:(Math.max(...xs)+Math.min(...xs))/2,y:(Math.max(...ys)+Math.min(...ys))/2})
 }
 // A thick outline is drawn twice (inner and outer stroke): one node.
 return out.filter((n,i)=>!out.slice(0,i).some(m=>dist(m,n)<2))
}
function clipToNodes(line,nodes){
 const l=dist(line.a,line.b);if(l<1)return line;
 const v={x:(line.b.x-line.a.x)/l,y:(line.b.y-line.a.y)/l};
 const on=nodes.map(n=>{const w={x:n.x-line.a.x,y:n.y-line.a.y};return{t:w.x*v.x+w.y*v.y,off:Math.abs(cross(v,w))}}).filter(n=>n.off<=2&&n.t>=-8&&n.t<=l+8).map(n=>n.t);
 if(on.length<2)return line;
 const t0=Math.min(...on),t1=Math.max(...on);
 return{...line,a:{x:line.a.x+v.x*t0,y:line.a.y+v.y*t0},b:{x:line.a.x+v.x*t1,y:line.a.y+v.y*t1}}
}

// A column on a plan is drawn as a small closed section symbol (an "I" of a few pt) at the leader end.
function columnSymbol(target,segments,index){
 const near=p=>Math.abs(p.x-target.x)<=9&&Math.abs(p.y-target.y)<=9;
 const parts=[...new Set(index.near(target,12))].map(i=>segments[i])
  // Straight strokes only: arrow heads and brace ends are slanted.
  .filter(s=>near(s.a)&&near(s.b)&&dist(s.a,s.b)<10&&(Math.abs(s.a.x-s.b.x)<.3||Math.abs(s.a.y-s.b.y)<.3));
 if(parts.length<6)return null;
 const xs=parts.flatMap(s=>[s.a.x,s.b.x]),ys=parts.flatMap(s=>[s.a.y,s.b.y]);
 const w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);
 return w>=3&&h>=3&&w<=14&&h<=14?{x:(Math.max(...xs)+Math.min(...xs))/2,y:(Math.max(...ys)+Math.min(...ys))/2}:null
}

// An I section symbol of a column: two equal parallel flanges with a web between their middles, one of them under the
// end of the leader. Returns the middle of the web.
function iSymbol(target,strokes){
 const len=q=>Math.hypot(q.a.x-q.b.x,q.a.y-q.b.y),vert=q=>Math.abs(q.a.x-q.b.x)<=0.3,mid=q=>({x:(q.a.x+q.b.x)/2,y:(q.a.y+q.b.y)/2});
 const toSeg=(p,q)=>{const vx=q.b.x-q.a.x,vy=q.b.y-q.a.y,l2=vx*vx+vy*vy||1,t=Math.max(0,Math.min(1,((p.x-q.a.x)*vx+(p.y-q.a.y)*vy)/l2));return Math.hypot(q.a.x+vx*t-p.x,q.a.y+vy*t-p.y)};
 const fl=strokes.filter(q=>len(q)>=4&&len(q)<=26);
 for(const f of fl){
  if(toSeg(target,f)>5)continue;
  for(const g of fl){
   if(g===f||vert(g)!==vert(f)||Math.abs(len(g)-len(f))>1.5)continue;
   const a=mid(f),b=mid(g),gap=vert(f)?Math.abs(a.x-b.x):Math.abs(a.y-b.y),shift=vert(f)?Math.abs(a.y-b.y):Math.abs(a.x-b.x);
   if(gap<4||gap>26||shift>1.5)continue;
   const web=strokes.find(w=>vert(w)!==vert(f)&&toSeg(mid(w),{a,b})<1.5&&Math.abs(len(w)-gap)<=2);
   if(web)return{x:(a.x+b.x)/2,y:(a.y+b.y)/2}
  }
 }
 return null
}

function leaderTarget(text,segments,index,axisSegs){
 const box=textBox(text);
 // The shelf sits just under the label; the leader leaves from its ends.
 const pad=8;
 const zone={x0:box.x0-pad,x1:box.x1+pad,y0:box.y1-3,y1:box.y1+12};
 const inZone=p=>p.x>=zone.x0&&p.x<=zone.x1&&p.y>=zone.y0&&p.y<=zone.y1;
 const near=[...new Set(index.near({x:box.cx,y:box.y1+4},40))].filter(i=>!axisSegs.has(i));
 // When the shelf is drawn, the leader leaves from one of its ends: a member line passing the zone is not a leader.
 const ends=Math.abs(Number(text.angle)||0)>5?[]:near.map(i=>segments[i]).filter(s=>inZone(s.a)&&inZone(s.b)&&Math.abs(s.a.y-s.b.y)<1.5&&dist(s.a,s.b)>=(box.x1-box.x0)*0.6).flatMap(s=>[s.a,s.b]);
 const fromShelf=p=>!ends.length||ends.some(e=>dist(e,p)<4);
 let best=null;
 for(const i of near){
  const s=segments[i],len=dist(s.a,s.b);if(len<6)continue;
  const diagonal=Math.abs(s.a.x-s.b.x)>1&&Math.abs(s.a.y-s.b.y)>1;
  for(const [p,q] of [[s.a,s.b],[s.b,s.a]]){
   if(!inZone(p)||inZone(q)||!fromShelf(p))continue;
   const score=(diagonal?100:0)+len;
   if(!best||score>best.score)best={score,from:p,to:q,diagonal,segment:i}
  }
 }
 // The "leader" found is the shelf itself running on past the label: the leader leaves its far end.
 if(best&&!best.diagonal&&Math.abs(best.from.y-best.to.y)<1.5&&Math.abs(Number(text.angle)||0)<=5){
  let next=null;
  for(const i of index.near(best.to,4)){
   if(axisSegs.has(i)||i===best.segment)continue;const q=segments[i],len=dist(q.a,q.b);if(len<10||Math.abs(q.a.y-q.b.y)<=1)continue;
   for(const [p,r] of [[q.a,q.b],[q.b,q.a]])if(dist(p,best.to)<3&&(!next||len>next.score))next={score:len,from:p,to:r,diagonal:Math.abs(q.a.x-q.b.x)>1,segment:i}
  }
  if(next)best=next
 }
 // A shelf drawn much longer than the label («К 8» over a long shelf, «с отм. +11,220» under it): the leader leaves a
 // far end of the shelf with a slanted line (dimension ticks are short).
 if(!best&&Math.abs(Number(text.angle)||0)<=5){
  const w=box.x1-box.x0;
  const shelves=near.map(i=>segments[i]).concat([...new Set(index.near({x:box.cx,y:box.y1+4},Math.min(200,w*8)))].map(i=>segments[i]))
   .filter(q=>Math.abs(q.a.y-q.b.y)<0.5&&q.a.y>=box.y1-3&&q.a.y<=box.y1+12&&Math.min(Math.max(q.a.x,q.b.x),box.x1)-Math.max(Math.min(q.a.x,q.b.x),box.x0)>=w*0.8&&dist(q.a,q.b)<=Math.min(220,w*9));
  // A shelf may come in pieces: carried on along its line to its real ends.
  const extend=(e,dir)=>{let p=e;for(let k=0;k<20;k++){const nx=index.near(p,3).map(i=>segments[i]).find(q=>Math.abs(q.a.y-q.b.y)<0.5&&Math.abs(q.a.y-p.y)<0.5&&
   [q.a,q.b].some(r=>dist(r,p)<1)&&[q.a,q.b].some(r=>(r.x-p.x)*dir>0.5));if(!nx)break;p=[nx.a,nx.b].sort((u,v)=>(v.x-u.x)*dir)[0]}return p};
  for(const sh of shelves)for(const e of [sh.a,sh.b].map(e=>extend(e,e===(sh.a.x<sh.b.x?sh.a:sh.b)?-1:1)))for(const i of index.near(e,4)){
   const q=segments[i];if(axisSegs.has(i)||q===sh)continue;
   const len=dist(q.a,q.b);if(len<10||Math.abs(q.a.y-q.b.y)<=1)continue;
   for(const [p,r] of [[q.a,q.b],[q.b,q.a]])if(dist(p,e)<3&&(!best||len>best.score))best={score:len,to:r,diagonal:Math.abs(q.a.x-q.b.x)>1,segment:i}
  }
 }
 return best?{x:best.to.x,y:best.to.y,leader:true,diagonal:best.diagonal,segment:best.segment}:{x:box.cx,y:box.y1+6,leader:false}
}

function nearestLine(lines,v,tol){
 let best=null;
 for(const l of lines){const d=Math.abs(l.pt-v);if(d<=tol&&(!best||d<best.d))best={...l,d}}
 return best
}

// Latin letters that look like Cyrillic are common in drawings exported from CAD.
const LOOKALIKE={A:"А",B:"В",C:"С",E:"Е",H:"Н",K:"К",M:"М",O:"О",P:"Р",T:"Т",X:"Х"};
function markKind(mark,kinds){
 const m=MARK_LABEL.exec(mark);if(!m)return null;
 // Mixed-case codes keep their case ("Бк" is not "БК").
 if(kinds===DEFAULT_KINDS&&/[а-яё]/u.test(m[1])){const code=markCode(mark);if(code)return code.kind}
 const prefix=[...m[1].toUpperCase()].map(c=>LOOKALIKE[c]||c).join("");
 // The longest known prefix: "СВ" is a brace although "С" is a post.
 for(let n=prefix.length;n>0;n--)if(kinds[prefix.slice(0,n)])return kinds[prefix.slice(0,n)];
 return null
}

function extractScheme({segments=[],texts=[],glyphs=[],page=1,kinds=DEFAULT_KINDS}={}){
 const aMarks=aMarksOn(texts);
 segments=segments.filter(s=>s&&Number.isFinite(s.a?.x)&&Number.isFinite(s.b?.y)&&dist(s.a,s.b)>0.05);
 const index=buildIndex(segments),lines=buildLineIndex(segments);
 const bubbles=[];
 for(const t of texts){
  if(!AXIS_LABEL.test(String(t.str||"").trim()))continue;
  const b=findBubble(t,segments,index);if(b)bubbles.push({...b,text:t})
 }
 const axes=mergeAxes(bubbles.map(b=>axisFromBubble(b,segments)).filter(Boolean));
 const usedTexts=new Set(bubbles.map(b=>b.text));
 // A title in two lines («Схема расположения элементов покрытия» / «на отм. +2,200»): the second line starts in lower
 // case and lies under the first.
 const titles=texts.filter(t=>/^Схема\s/u.test(String(t.str||"").trim())).map(t=>{
  const next=texts.find(u=>u!==t&&Math.abs(Number(u.angle)||0)<2&&u.y>t.y+1&&u.y-t.y<=(t.size||10)*2&&u.x<t.x+(t.width||0)&&u.x+(u.width||0)>t.x&&/^[а-яё(]/u.test(String(u.str||"").trim()));
  return next?{...t,str:String(t.str).trim()+" "+String(next.str).trim()}:t
 });
 const schemes=[];
 const axisGroups=groupSchemes(axes);
 // Titles already over a plan with axes.
 const claimed=new Set(axisGroups.map(g=>{const bb=bboxOf(g),name=titleFor(titles,bb);return titles.find(t=>String(t.str).trim()===name)}).filter(Boolean));
 for(const group of [...axisGroups,...framedGroups(titles,texts,segments,claimed)]){
  const bbox=bboxOf(group),warnings=[];
  const vAxes=oneName(group.filter(a=>a.orient==="V")).sort((a,b)=>a.pos-b.pos);
  // Y in millimetres grows upwards, so the lowest line on the sheet is first.
  const hAxes=oneName(group.filter(a=>a.orient==="H")).sort((a,b)=>b.pos-a.pos);
  for(const list of [vAxes,hAxes]){
   const names=list.map(a=>a.name);
   if(new Set(names).size!==names.length)warnings.push("Повторяющиеся названия осей: "+names.join(", "))
  }
  const pad=90,local=texts.filter(t=>{const b=textBox(t);return b.cx>bbox.x0-pad&&b.cx<bbox.x1+pad&&b.cy>bbox.y0-pad&&b.cy<bbox.y1+pad});
  if(group.local&&/^Схема без названия/u.test(titleFor(titles,bbox)))continue;
  const local1=group.local?texts.filter(t=>{const b=textBox(t);return b.cx>bbox.x0-pad*3&&b.cx<bbox.x1+pad*3&&b.cy>bbox.y0-pad*3&&b.cy<bbox.y1+pad*3}):null;
  const scale=group.framed?group.framed.scale:group.local?dimensionScale(local1,segments):detectScale(vAxes.map(a=>a.pos),hAxes.map(a=>a.pos),local);
  if(group.local&&!Number.isFinite(scale))continue;
  if(!Number.isFinite(scale)){
   schemes.push({title:titleFor(titles,bbox),bbox,error:"Не удалось определить масштаб: нет размеров между осями",
    axesX:vAxes.map(a=>a.name),axesY:hAxes.map(a=>a.name),placements:[],warnings});
   continue
  }
  const sx=spansFor(vAxes.map(a=>a.pos),"V",local,scale),sy=spansFor(hAxes.map(a=>a.pos),"H",local,scale);
  if(sx.notes.length||sy.notes.length)warnings.push("Часть пролётов определена по геометрии, без размерной надписи — проверьте сетку");
  const cum=a=>a.reduce((acc,v)=>{acc.push(acc[acc.length-1]+v);return acc},[0]);
  const xMm=cum(sx.spans),yMm=cum(sy.spans);
  // Millimetre position of any sheet point, measured from the nearest
  // labelled axis so that rounding never accumulates across the grid.
  const toX=pt=>{let i=0;for(let k=0;k<vAxes.length;k++)if(Math.abs(vAxes[k].pos-pt)<Math.abs(vAxes[i].pos-pt))i=k;return xMm[i]+Math.round((pt-vAxes[i].pos)*scale/10)*10};
  const toY=pt=>{let i=0;for(let k=0;k<hAxes.length;k++)if(Math.abs(hAxes[k].pos-pt)<Math.abs(hAxes[i].pos-pt))i=k;return yMm[i]+Math.round((hAxes[i].pos-pt)*scale/10)*10};
  // Exact positions offered by the drawing: labelled axes plus or minus any
  // dimension value written along that direction ("4340", "2375"...).
  const dimsX=local.filter(t=>textBox(t).angle===0).map(t=>numberValue(t.str)).filter(v=>v>=50);
  const dimsY=local.filter(t=>textBox(t).angle!==0).map(t=>numberValue(t.str)).filter(v=>v>=50);
  const candidates=(axisMm,dims)=>[...new Set(axisMm.flatMap(a=>[a,...dims.flatMap(v=>[a+v,a-v])]))];
  const candX=candidates(xMm,dimsX),candY=candidates(yMm,dimsY);
  const snapDim=(mm,cand,tol)=>{let best=null;for(const c of cand){const d=Math.abs(c-mm);if(d<=tol&&(!best||d<best.d))best={mm:c,d}}return best};
  const lineTol=Math.max(40,scale*1.2);
  const exactLines=(orient,labelled,toMm,cand)=>secondaryLines(segments,bbox,orient,labelled)
   .map(pt=>({pt,hit:snapDim(toMm(pt),cand,lineTol)})).filter(l=>l.hit).map(l=>({pt:l.pt,mm:l.hit.mm,name:null}));
  const linesX=[...vAxes.map((a,i)=>({pt:a.pos,mm:xMm[i],name:a.name})),
   ...exactLines("V",vAxes.map(a=>a.pos),toX,candX)].sort((a,b)=>a.pt-b.pt);
  const linesY=[...hAxes.map((a,i)=>({pt:a.pos,mm:yMm[i],name:a.name})),
   ...exactLines("H",hAxes.map(a=>a.pos),toY,candY)].sort((a,b)=>b.pt-a.pt);
  // Segments that belong to grid lines are never leaders.
  const axisSegs=new Set();
  // On a local view the members themselves lie on the dimensioned lines: only the axes are skipped there.
  // A framed view has no axes at all: its frame lines are members.
  const gridX=group.framed?[]:group.local?linesX.filter(l=>l.name):linesX,gridY=group.framed?[]:group.local?linesY.filter(l=>l.name):linesY;
  segments.forEach((s,i)=>{
   if(Math.abs(s.a.x-s.b.x)<=0.3&&gridX.some(l=>Math.abs(l.pt-s.a.x)<0.8))axisSegs.add(i);
   if(Math.abs(s.a.y-s.b.y)<=0.3&&gridY.some(l=>Math.abs(l.pt-s.a.y)<0.8))axisSegs.add(i)
  });
  const snap=Math.max(6,250/scale);
  const title=group.framed?String(group.framed.title.str).trim():titleFor(titles,bbox),titleKind=sheetKind(title);
  // A point not on a grid line is placed at the nearest dimensioned position.
  // A local view (a porch at 1:50) is drawn exactly: a point snaps only to a position within a few points of it.
  const freeTol=group.local?Math.max(30,scale*3):200;
  const freeX=pt=>{const g=toX(pt),h=snapDim(g,candX,freeTol);return h?{mm:h.mm,dim:true}:{mm:g,dim:false}};
  const freeY=pt=>{const g=toY(pt),h=snapDim(g,candY,freeTol);return h?{mm:h.mm,dim:true}:{mm:g,dim:false}};
  // Ends of a member lying on one grid line between its two neighbouring lines.
  const spanAlong=(target,lx,ly)=>{
   if(lx&&(!ly||lx.d<=ly.d)){
    const below=linesY.filter(l=>l.pt>=target.y).sort((a,b)=>a.pt-b.pt)[0],above=linesY.filter(l=>l.pt<target.y).sort((a,b)=>b.pt-a.pt)[0];
    return below&&above?{x_mm:lx.mm,y_mm:below.mm,x2_mm:lx.mm,y2_mm:above.mm,axis_x:lx.name||nearestName(linesX,target.x)}:null
   }
   if(ly){
    const left=linesX.filter(l=>l.pt<=target.x).sort((a,b)=>b.pt-a.pt)[0],right=linesX.filter(l=>l.pt>target.x).sort((a,b)=>a.pt-b.pt)[0];
    return left&&right?{x_mm:left.mm,y_mm:ly.mm,x2_mm:right.mm,y2_mm:ly.mm,axis_y:ly.name||nearestName(linesY,target.y)}:null
   }
   return null
  };
  // Ends of a drawn member: on a grid line when close, otherwise at a dimensioned position.
  const endTol=group.local?freeTol:600;
  // Secondary beams and bracing often meet the middle of a bay that has no dimension of its own.
  const mids=pos=>pos.slice(1).map((v,i)=>(v+pos[i])/2);
  const memberX=[...candX,...mids(xMm)],memberY=[...candY,...mids(yMm)];
  const snapMm=(v,lines2,cand)=>{
   let best=null;for(const l of lines2){const d=Math.abs(l.mm-v);if(d<=endTol&&(!best||d<best.d))best={mm:l.mm,d}}
   if(best)return{mm:best.mm,exact:true};
   const h=snapDim(v,cand,endTol);return h?{mm:h.mm,exact:true}:{mm:Math.round(v/10)*10,exact:false}
  };
  const memberEnds=line=>[line.a,line.b].map(p=>{
   const x=snapMm(toX(p.x),linesX,memberX),y=snapMm(toY(p.y),linesY,memberY);
   return{x:x.mm,y:y.mm,exact:x.exact&&y.exact}
  });
  const placements=[],bases=[];
  const nodes=group.local?nodeBoxes(segments,bbox):null;
  // One label may name two marks on one line: «Бкр 1, Р 1» — a crane beam and its rail. Each mark is placed by the
  // same leader and line.
  const MULTI=/^(?:[А-ЯЁA-Z][а-яёА-ЯЁA-Z]{0,2}\s*\d{1,3}(?:[-.]\d{1,2})?\s*,\s*)+[А-ЯЁA-Z][а-яёА-ЯЁA-Z]{0,2}\s*\d{1,3}(?:[-.]\d{1,2})?$/u;
  const labels=local.flatMap(t=>MULTI.test(String(t.str||"").trim())&&!usedTexts.has(t)?String(t.str).split(",").map(p=>({...t,str:p.trim()})):[t]);
  for(const t of labels){
   // "К 1" is written with a space on some sheets.
   const mark=String(t.str||"").trim().replace(/^([А-ЯЁA-Z]{1,3}|[А-ЯЁA-Z][а-яё]{1,2})\s+(\d)/u,"$1$2");
   // A column base («Бк 4») is not a member: its leader points at the base symbol, which stands at a column. Its place
   // goes with the scheme (from the nearest named axes), for the base details of that column.
   if(BASE_LABEL.test(mark)&&!usedTexts.has(t)){
    const box=textBox(t);
    if(box.cx<bbox.x0-40||box.cx>bbox.x1+40||box.cy<bbox.y0-40||box.cy>bbox.y1+40)continue;
    const target=leaderTarget(t,segments,index,axisSegs);if(!target.leader)continue;
    const reach=Math.max(snap,800/scale),lx=nearestLine(linesX,target.x,reach),ly=nearestLine(linesY,target.y,reach);
    const fx=lx?lx.mm:freeX(target.x).mm,fy=ly?ly.mm:freeY(target.y).mm;
    const named=(lines2,v)=>lines2.filter(l=>l.name).sort((a,b)=>Math.abs(a.pt-v)-Math.abs(b.pt-v))[0];
    const ax=named(linesX,target.x),ay=named(linesY,target.y);if(!ax||!ay)continue;
    bases.push({mark,x_mm:fx,y_mm:fy,axis_x:ax.name,axis_y:ay.name,dx_mm:fx-ax.mm,dy_mm:fy-ay.mm,page,
     sheet_point_pt:{x:Math.round(target.x*10)/10,y:Math.round(target.y*10)/10}});
    continue
   }
   if(usedTexts.has(t)||!MARK_LABEL.test(mark)||notMark(mark,aMarks))continue;
   const box=textBox(t);
   if(box.cx<bbox.x0-40||box.cx>bbox.x1+40||box.cy<bbox.y0-40||box.cy>bbox.y1+40)continue;
   let target=leaderTarget(t,segments,index,axisSegs);
   const ruledKind=markKind(mark,kinds);
   // The leader of a column mark points at its section symbol, often drawn on a beam line: it stays a column.
   // Only a slanted leader from a level label: line junctions next to a label look like a symbol too.
   const symbol=target.leader&&target.diagonal&&Math.abs(Number(t.angle)||0)<5&&ruledKind==="column"&&columnSymbol(target,segments,index);
   if(symbol)target={...target,...symbol};
   // Beams, purlins and bracing on a plan are drawn lines: the ends come from the drawing itself.
   if(!symbol&&(titleKind!=="column"||ruledKind==="beam"||ruledKind==="brace")){
    let line=memberLine(t,target,segments,lines,axisSegs);
    // On a local view the frame line runs on past the posts and into the extension lines: the member is between the
    // outermost node symbols on it.
    if(line&&nodes)line=clipToNodes(line,nodes);
    // A framed view: nothing of it lies outside its overall dimensions (the lines run on into the dimension chains).
    if(line&&group.framed){const c=(v,a,b)=>Math.max(Math.min(a,b)-1,Math.min(Math.max(a,b)+1,v));const x0=vAxes[0].pos,x1=vAxes[vAxes.length-1].pos,y0=hAxes[hAxes.length-1].pos,y1=hAxes[0].pos;
     line={...line,a:{x:c(line.a.x,x0,x1),y:c(line.a.y,y0,y1)},b:{x:c(line.b.x,x0,x1),y:c(line.b.y,y0,y1)}}}
    const ends=line&&memberEnds(line);
    if(ends&&Math.hypot(ends[1].x-ends[0].x,ends[1].y-ends[0].y)>=300){
     const straight=Math.abs(line.a.x-line.b.x)<1.5||Math.abs(line.a.y-line.b.y)<1.5;
     const geometry=ruledKind==="brace"||!straight?"brace":"beam",mid=textFrame(t).c;
     placements.push({mark,geometry_type:geometry,kind_label:KIND_NAMES[geometry],
      sheet_point_pt:{x:Math.round(mid.x*10)/10,y:Math.round(mid.y*10)/10},page,
      x_mm:ends[0].x,y_mm:ends[0].y,x2_mm:ends[1].x,y2_mm:ends[1].y,
      axis_x:nearestName(linesX,(line.a.x+line.b.x)/2),axis_y:nearestName(linesY,(line.a.y+line.b.y)/2),
      confidence:ends.every(e=>e.exact)?"medium":"low",
      notes:["Концы по линии элемента на схеме"+(ends.every(e=>e.exact)?"":" — часть концов не на оси, проверьте")]});
     continue
    }
   }
   // A frame column mark written beside its column without a leader: the nearest crossing of grid lines (within
   // about two text heights of the label), not the label itself. Wind posts stand between axes and are left alone.
   if(!target.leader&&!symbol&&ruledKind==="column"&&markCode(mark)?.group==="columns"&&titleKind!=="beam"){
    const c=textBox(t),reach=Math.max(30,t.size*4);let best=null;
    for(const x of linesX.filter(l=>l.name))for(const y of linesY.filter(l=>l.name)){
     const d=Math.hypot(x.pt-c.cx,y.pt-c.cy);if(d<=reach&&(!best||d<best.d))best={d,x:x.pt,y:y.pt}
    }
    if(best)target={...target,x:best.x,y:best.y,near:true}
   }
   let lx=nearestLine(linesX,target.x,snap),ly=nearestLine(linesY,target.y,snap);
   // A frame column whose leader ends short of its symbol (the label stands just past the row, by an outer axis
   // А or М drawn 500 off): the named grid crossing next to it, not the outer line or a dimension tick.
   if((!lx||!ly||!lx.name||!ly.name)&&!symbol&&ruledKind==="column"&&markCode(mark)?.group==="columns"&&titleKind!=="beam"){
    const reach=Math.max(30,t.size*4);let best=null;
    for(const x of linesX.filter(l=>l.name))for(const y of linesY.filter(l=>l.name)){
     const d=Math.hypot(x.pt-target.x,y.pt-target.y);if(d<=reach&&(!best||d<best.d))best={d,x,y}
    }
    // A side tied by its own dimension (К1 drawn 1050 off axis 03) keeps that dimension: only a side resting on an
    // unnamed line or on nothing measured is moved to the crossing.
    if(best){if(lx||!freeX(target.x).dim)lx=best.x;if(ly||!freeY(target.y).dim)ly=best.y}
   }
   // A column symbol drawn centred on a named axis (both flanges of a branch pair at equal distances from it), with
   // the leader ending at its outer edge: the column is on that axis, whatever dimension happens to fit the edge.
   if(ruledKind==="column"&&markCode(mark)?.group==="columns"&&titleKind!=="beam"){
    // Offsets from the line of the strokes of the symbol around the leader's end: strokes along the line by their
    // position, strokes across it by their ends (an I drawn across a lettered axis: its flanges end at equal distances).
    const reach=Math.max(snap,14),box=q=>Math.max(q.a.x,q.b.x)>target.x-reach&&Math.min(q.a.x,q.b.x)<target.x+reach&&Math.max(q.a.y,q.b.y)>target.y-reach&&Math.min(q.a.y,q.b.y)<target.y+reach;
    const strokes=segments.filter(q=>box(q)&&Math.hypot(q.a.x-q.b.x,q.a.y-q.b.y)<=2.5*reach&&(Math.abs(q.a.x-q.b.x)<=0.3||Math.abs(q.a.y-q.b.y)<=0.3));
    const offsets=(pos,vertical)=>strokes.flatMap(q=>{const along=vertical?Math.abs(q.a.x-q.b.x)<=0.3:Math.abs(q.a.y-q.b.y)<=0.3;
     return along?[(vertical?q.a.x:q.a.y)-pos]:[(vertical?q.a.x:q.a.y)-pos,(vertical?q.b.x:q.b.y)-pos]}).filter(o=>Math.abs(o)>1&&Math.abs(o)<=reach);
    const centred=(lines,v,vertical)=>lines.filter(l=>l.name&&Math.abs(l.pt-v)<=reach).find(l=>{
     const offs=offsets(l.pt,vertical);
     return offs.some(o=>offs.some(r=>Math.abs(o+r)<0.8))&&Math.max(...offs.map(Math.abs))>=Math.abs(v-l.pt)-3
    });
    // The column is where its I symbol is (the middle of its web), not at the flange tip the leader ends on; the
    // nearest dimensioned position is taken from there (К4 drawn 1000 off axis О8, К6 170 off О3). A branch of a
    // two-branch column centred on an axis is not the column: the axis is.
    const I=iSymbol(target,segments.filter(q=>Math.max(q.a.x,q.b.x)>target.x-30&&Math.min(q.a.x,q.b.x)<target.x+30&&Math.max(q.a.y,q.b.y)>target.y-30&&Math.min(q.a.y,q.b.y)<target.y+30&&(Math.abs(q.a.x-q.b.x)<=0.3||Math.abs(q.a.y-q.b.y)<=0.3)));
    const cx=centred(linesX,target.x,true),cy=centred(linesY,target.y,false);
    const nx=I&&nearestLine(linesX,I.x,2),ny=I&&nearestLine(linesY,I.y,2);
    if(!lx?.name){if(I&&!(cx&&Math.abs(I.x-cx.pt)>10)){lx=nx?.name?nx:null;target={...target,x:I.x}}else if(cx)lx=cx}
    if(!ly?.name){if(I&&!(cy&&Math.abs(I.y-cy.pt)>10)){ly=ny?.name?ny:null;target={...target,y:I.y}}else if(cy)ly=cy}
   }
   const notes=[];
   if(!target.leader)notes.push(target.near?"Без выноски — у ближайшего пересечения осей":"Выноска не найдена — положение по надписи");
   const ruled=ruledKind;
   let geometry=ruled;
   if(!ruled||ruled==="brace"){
    // Unknown or ambiguous prefix: decide by the sheet and the element position.
    geometry=lx&&ly&&titleKind!=="beam"?"column":ruled||titleKind||"column";
    notes.push("Тип элемента определён по листу и положению — проверьте")
   }
   const base={mark,geometry_type:geometry,kind_label:KIND_NAMES[geometry],
    sheet_point_pt:{x:Math.round(target.x*10)/10,y:Math.round(target.y*10)/10},page};
   if(geometry==="column"){
    const fx=lx?{mm:lx.mm,dim:true}:freeX(target.x),fy=ly?{mm:ly.mm,dim:true}:freeY(target.y);
    if(!lx||!ly)notes.push(fx.dim&&fy.dim?"Не на оси — привязано к ближайшему размеру":"Не на оси — координата по геометрии листа");
    const confidence=!target.leader||!fx.dim||!fy.dim?"low":lx&&ly&&ruled==="column"?"high":"medium";
    // Kept for the AI step, which may decide the sheet shows beams, not posts.
    const line=lx&&ly?null:spanAlong(target,lx,ly);
    placements.push({...base,x_mm:fx.mm,y_mm:fy.mm,axis_x:lx?.name||nearestName(linesX,target.x),axis_y:ly?.name||nearestName(linesY,target.y),
     confidence,notes,...(line?{line:{x_mm:line.x_mm,y_mm:line.y_mm,x2_mm:line.x2_mm,y2_mm:line.y2_mm}}:{})});
    continue
   }
   // Linear members lie on one grid line between two neighbouring lines.
   const span=spanAlong(target,lx,ly);
   if(!span){
    notes.push(lx||ly?"Не найдены соседние оси для концов элемента":"Линейный элемент не привязан к оси — требуется ручная проверка");
    placements.push({...base,x_mm:toX(target.x),y_mm:toY(target.y),x2_mm:toX(target.x),y2_mm:toY(target.y),confidence:"low",notes});
    continue
   }
   placements.push({...base,...span,confidence:target.leader&&ruled?"medium":"low",notes})
  }
  // Stair flights drawn by their treads on a small plan (the stair of a platform).
  if(group.local){
   const flights=flightsOf(segments,bbox,scale);
   // A run of treads well outside the plan belongs to a section or a view beside it; one beside the plan (the stair of
   // a platform) lies along it: at least half of its run within the plan's extent that way.
   const near=f=>{
    const m=1600/scale,[r0,r1]=f.flat?[bbox.y0,bbox.y1]:[bbox.x0,bbox.x1],[c0,c1]=f.flat?[bbox.x0,bbox.x1]:[bbox.y0,bbox.y1];
    const lo=Math.min(f.a,f.b),hi=Math.max(f.a,f.b),inside=Math.max(0,Math.min(hi,r1)-Math.max(lo,r0));
    return inside*2>=hi-lo&&f.mid>c0-m&&f.mid<c1+m
   };
   flights.splice(0,flights.length,...flights.filter(near));
   const marks=levelMarksNear(texts,bbox);
   flights.forEach((f,i)=>{
    // Along the run: the way the arrow on its line points (ГОСТ 21.201: the climb), else from the sheet-lower end up.
    const dir=climbOf(f,segments,glyphs),up=dir||-1,[s0,s1]=up<0?[f.b,f.a]:[f.a,f.b];
    const [p,q]=f.flat?[{x:f.mid,y:s0},{x:f.mid,y:s1}]:[{x:s0,y:f.mid},{x:s1,y:f.mid}];
    // The levels of its ends: the marks of the landings it starts and ends at (a stack of marks — one per tier).
    // One mark nearest to both ends names the landing at the nearer one; the other end is the next level.
    let from=marks.nearest(p),to=marks.nearest(q);
    if(from&&to&&from.stack===to.stack){if(from.d<to.d)to=null;else from=null}
    from=from&&from.v;to=to&&to.v;
    placements.push({mark:"Марш",name:"Марш лестницы",geometry_type:"beam",kind_label:"Марш",page,fitting_type:"flight",diameter_mm:Math.round((f.hi-f.lo)*scale/10)*10,
     scheme_group:"stairs",flight:{order:i,of:flights.length,...(dir?{arrow:true}:{}),...(from?{from_mm:from}:{}),...(to?{to_mm:to}:{})},x_mm:toX(p.x),y_mm:toY(p.y),x2_mm:toX(q.x),y2_mm:toY(q.y),confidence:"low",
     notes:[dir?"Марш по ступеням на схеме, подъём по стрелке":"Марш по ступеням на схеме; направление подъёма — с нижнего по листу конца, проверьте"]})
   })
  }
  // One plan for several tiers («балок на отм. +5,500; +11,100»): its members at each of them.
  const tiers=titleLevels(title);
  const onTier=(v,k)=>v.length===tiers.length?[v[k]]:v.length===1?[v[0]+tiers[k]-tiers[0]]:v;
  if(group.local&&tiers.length>=2){const one=placements.splice(0);tiers.forEach((z,k)=>{for(const p of one)placements.push(p.geometry_type==="column"?{...p}:{...p,z0_mm:z,z1_mm:z,levels_from:"отметка в названии схемы",...(p.flight?{flight:{...p.flight,tier:z,
   // A stack of marks at a landing names it on each tier, in the order of the title's levels.
   // A single mark is written for the first tier: the others are as far apart as the tiers.
   ...(p.flight.from_mm?{from_mm:onTier(p.flight.from_mm,k)}:{}),...(p.flight.to_mm?{to_mm:onTier(p.flight.to_mm,k)}:{})}}:{})})})}
  // A location plan of platforms, stairs and porches: the hatched outline of each structure with its level.
  const footprints=!group.local&&/расположения\s+(?:площад|лестниц|крыл)/iu.test(title||"")?extractFootprints({texts,segments,bbox,toX,toY,target:t=>leaderTarget(t,segments,index,axisSegs)}):[];
  // A structure found by its outline is placed by it: the mark read as a member line beside it is dropped.
  if(footprints.length){const drawn=new Set(footprints.map(f=>f.mark).filter(Boolean));for(let i=placements.length-1;i>=0;i--)if(drawn.has(placements[i].mark))placements.splice(i,1);
   placements.push(...footprintPlacements(footprints,page))}
  schemes.push({title,bbox,scaleMmPerPt:Math.round(scale*1000)/1000,
   axesX:vAxes.map(a=>a.name),axesY:hAxes.map(a=>a.name),spansX:sx.spans,spansY:sy.spans,
   sizeX:xMm[xMm.length-1],sizeY:yMm[yMm.length-1],
   secondaryX:linesX.filter(l=>!l.name).map(l=>l.mm),secondaryY:linesY.filter(l=>!l.name).map(l=>l.mm),
   placements,...(bases.length?{bases}:{}),...(footprints.length?{footprints}:{}),...(group.local?{local:true}:{}),...(group.framed?{framed:{w_mm:group.framed.w_mm,h_mm:group.framed.h_mm,levels_mm:titleLevels(title),extent:extentOf(placements,group.framed)}}:{}),warnings})
 }
 schemes.sort((a,b)=>a.bbox.x0-b.bbox.x0);
 return{page,schemes}
}

function sheetKind(title){return schemeTitleKind(title)}

function nearestName(lines,v){
 let best=null;for(const l of lines)if(l.name&&(!best||Math.abs(l.pt-v)<Math.abs(best.pt-v)))best=l;
 return best?.name||""
}

function titleFor(titles,bbox){
 let best=null;
 for(const t of titles){
  const b=textBox(t);
  if(b.cy>bbox.y0+20||b.cx<bbox.x0-200||b.cx>bbox.x1+200)continue;
  const d=Math.abs(bbox.y0-b.cy)+Math.abs((bbox.x0+bbox.x1)/2-b.cx)*0.3;
  if(!best||d<best.d)best={d,str:String(t.str).trim()}
 }
 return best?.str||"Схема без названия"
}

module.exports={extractScheme,dimensionScale,dimensionsOf,flightsOf,climbOf,levelMarksNear,nodeBoxes,titleLevels,columnSymbol,textBox,textFrame,memberLine,buildLineIndex,DEFAULT_KINDS,KIND_NAMES,notMark,aMarksOn};
