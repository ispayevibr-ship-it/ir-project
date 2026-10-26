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
// Column bases ("Бк1") are drawn at the column and are not members of the scheme. A radius («R400», the Latin R) is a size.
const NOT_MARK=/^(?:М\d|Л\d|ПК|КМД?\d|КЖ\d|АР\d|Бк\d|R\d{2,4}$)/u,BASE_LABEL=/^Бк\d{1,2}$/u;
// "А1", "А20" are marks in sets that use this letter for their elements: many different such labels on the sheet.
// Alone, "А3" is a sheet format; А240…А1000 are rebar classes.
const REBAR=/^А(?:240|300|400|500|600|800|1000)[СC]?$/u;
function aMarksOn(texts){
 const seen=new Set();
 for(const t of texts){const s=String(t.str||"").trim();if(/^А\d{1,3}(?:[-.]\d{1,3})?$/u.test(s)&&!REBAR.test(s))seen.add(s)}
 return seen.size>=5
}
// «Все цифровые обозначения отправочных элементов, замаркированные на данной монтажной схеме, имеют буквенный индекс
// "Т"» (355-11 «Площадки»): the scheme writes its marks as bare numbers on leader shelves; the letter is in the notes.
function markIndexOf(texts){
 const all=texts.map(t=>String(t.str||"")).join(" ").replace(/\s+/g," ");
 const m=/цифров\S*\s+(?:обозначени|марк)\S*.{0,160}?буквенн\S*\s+индекс\S*\s*[«"“„]?\s*([А-ЯЁA-Z]{1,3})\s*[»"”]?/iu.exec(all);
 return m?m[1].toUpperCase():null
}
const notMark=(mark,aMarks)=>/^А\d/u.test(mark)?!aMarks||REBAR.test(mark):NOT_MARK.test(mark);
// Prefix of a shipping mark → element kind, by ГОСТ 26047 and КМД practice (src/ai-kmd-rules.js).
const {KIND_BY_CODE,schemeTitleKind,markCode}=require("./ai-kmd-rules");
const {extractFootprints,footprintPlacements,outlineOf}=require("./ai-footprint-extract");
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
  // The ring centre is found to about a point; the axis line may pass a little aside of it. Farther aside (two
  // bubbles 800 mm apart push each other: 355-10, Б 3.2 pt off its line) only when nothing is nearer: a longer line
  // there is a wall or another axis (a КМ set: М and a line 2.2 pt from it).
  const near=new Set([centre]),aside=new Set();
  for(const s of segments){
   const p=orient==="V"?s.a.x:s.a.y,q=orient==="V"?s.b.x:s.b.y,off=Math.abs(p-centre);
   if(Math.abs(p-q)<=0.3&&off>0.6&&off<=Math.min(4,b.r*0.4))(off<=Math.min(3,b.r*0.3)?near:aside).add(Math.round(p*10)/10)
  }
  // Dash-dot patterns differ between CAD programs: a gap up to about two bubble radii is still one axis.
  let any=false;
  const consider=(pos,list)=>{for(const run of runsAt(list,orient,pos,0.8,Math.max(20,b.r*3.5))){
   const len=run[1]-run[0];
   const touch=Math.min(Math.abs(run[0]-along),Math.abs(run[1]-along));
   // The line starts at the bubble edge and does not pass through the label.
   if(touch>b.r+8||(run[0]<along-b.r&&run[1]>along+b.r))continue;
   // Dash-dot axes are drawn as many dashes; a single long solid line is a
   // dimension or outline, not an axis.
   if(len<Math.max(60,b.r*8)||run.n<3)continue;
   any=true;if(!best||len>best.len)best={orient,pos,span:[run[0],run[1]],len}
  }};
  for(const pos of near)consider(pos,segments);
  if(!any)for(const pos of aside)consider(pos,segments);
  for(const pos of aside)near.add(pos);
  // A stroke just past the bubble (the heavy line of a section mark drawn on the axis) joins the axis across the
  // bubble: each side of the bubble is taken alone.
  if(!best||best.orient!==orient)for(const pos of near)for(const side of [-1,1])consider(pos,segments.filter(s=>{
   const p=orient==="V"?[s.a.y,s.b.y]:[s.a.x,s.b.x];return side<0?Math.max(...p)<=along-b.r*0.5:Math.min(...p)>=along+b.r*0.5}));
 }
 return best?{name:b.name,orient:best.orient,pos:best.pos,span:best.span,bubbles:[b]}:null
}

// The place of an axis name in its row: numbers by value («О4/1» after О4), letters by the alphabet of axes
// (ГОСТ 21.101: no Ё, З, Й, О, Х, Ц, Ч, Щ, Ъ, Ы, Ь), a fraction just after its letter or number.
const AXIS_SEQ="АБВГДЕЖИКЛМНПРСТУФШЭЮЯ";
function axisRank(name){
 const n=/^(\D*?)(\d+)(?:\/(\d{1,2}))?$/u.exec(name);if(n)return{p:n[1],v:Number(n[2])+(n[3]?Number(n[3])/100:0)};
 const l=/^([А-ЯЁA-Z])(?:\/(\d{1,2}))?$/u.exec(name),k=l?AXIS_SEQ.indexOf(l[1]):-1;
 return k>=0?{p:"#",v:k+(l[2]?Number(l[2])/100:0)}:null
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
  // A large number stands a little farther off its line (ГПЭС М1.25: up to 5.4 pt at 15 pt); the longest line under
  // it is the size's. A short size is written past the end of its line, over its end.
  const band=along.filter(l=>l.c>=base+0.3&&l.c<=base+Math.max(4,(Number(t.size)||0)*0.4)),[u0,u1]=flat?[b.x0,b.x1]:[b.y0,b.y1];
  const longest=list=>list.reduce((p,l)=>!p||l.hi-l.lo>p.hi-p.lo?l:p,null);
  const line=longest(band.filter(l=>l.lo<=at&&l.hi>=at))||longest(band.filter(l=>l.lo<=u1&&l.hi>=u0));if(!line)continue;
  const ext=across.filter(e=>e.lo<=line.c+3&&e.hi>=line.c-3&&e.c>=line.lo-1&&e.c<=line.hi+1).map(e=>e.c);
  // A dimension's own extension lines never cross its number: one that does (the middle tick of the chain above,
  // run down through the overall dimension «2430» under «1215 1215») is passed over.
  const [t0,t1]=flat?[b.x0,b.x1]:[b.y0,b.y1],m=(t1-t0)*0.2,cross=ext.some(c=>c>t0+m&&c<t1-m);
  let lo=Math.max(...ext.filter(c=>cross?c<=t0+m:c<at)),hi=Math.min(...ext.filter(c=>cross?c>=t1-m:c>at));
  // A short size written past its extension lines (ГПЭС М1.25: «100» beside its 8.6 pt): the two lines on its side,
  // the number starting right at the nearer one (a number 10 pt off is another size's).
  const gap=Math.max(4,(Number(t.size)||0)*0.3);
  if(!Number.isFinite(hi)){const below=[...new Set(ext.filter(c=>c<at).map(c=>Math.round(c*10)/10))].sort((a,b)=>b-a);if(below.length>=2&&t0-below[0]<=gap){hi=below[0];lo=below[1]}}
  else if(!Number.isFinite(lo)){const above=[...new Set(ext.filter(c=>c>at).map(c=>Math.round(c*10)/10))].sort((a,b)=>a-b);if(above.length>=2&&above[0]-t1<=gap){lo=above[0];hi=above[1]}}
  if(Number.isFinite(lo)&&Number.isFinite(hi)&&hi-lo>=4)out.push({v,lo,hi,flat,line:line.c,from:line.lo,to:line.hi,text:t})
 }
 return out
}
function dimensionScale(texts,segments,measured){
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
 if(best||!measured)return best?best.n:NaN;
 // A sheet printed at another size (ГПЭС М1.27: 14.7 mm a point, of no scale of the list): the ratio that at least three
 // dimensions agree on within 3 %, two of every three found (asked for local views by their axes; a frame read so
 // would take in elevations). A view drawn out of scale (ГПЭС М1.25: the plan of a stair, its sizes 11…14 mm a point)
 // is not read so. Sizes of another scale altogether (a node beside it at 2.4 mm a point) are of another view, not
 // against it.
 const r=dims.map(d=>({k:d.v/(d.hi-d.lo),v:d.v}));let most=null;
 for(const m of r){const agree=r.filter(x=>Math.abs(x.k-m.k)/m.k<=0.03),near=r.filter(x=>Math.abs(x.k-m.k)/m.k<=0.25);if(agree.length<3||agree.length*3<near.length*2)continue;
  const top=Math.max(...agree.map(x=>x.v));if(!most||agree.length>most.agree.length||agree.length===most.agree.length&&top>most.top)most={agree,top}}
 if(!most)return NaN;
 const ks=most.agree.map(x=>x.k).sort((a,b)=>a-b),k=ks[Math.floor(ks.length/2)];
 // Measured round a view (its neighbours' sizes taken in): two sizes of the view itself agree too — node details beside
 // a plan (М1.1: «50», «78» by the purlin chains of the plan) are not read by the plan's sizes.
 if(Array.isArray(measured)&&dimensionsOf(measured,segments).filter(d=>Math.abs(d.v/(d.hi-d.lo)-k)/k<=0.03).length<2)return NaN;
 return k
}

// Sizes read from a picture a digit off (ГПЭС М1.9: «1175» and «125» for the «1125» of the chain, the italic 2 taken
// for 7, the first of two 1s lost): a size its drawn length at the plan's scale disagrees with by over 2 % takes the
// number one digit away from it (one changed, added or dropped) that agrees within 1.5 %, one the sheet has more of
// first. Sizes of the text layer are as drawn.
function fixReadSizes(texts,segments,scale){
 const fixed=new Map(),dims=dimensionsOf(texts.filter(t=>t.ocr),segments),times=new Map();
 for(const d of dims)times.set(d.v,(times.get(d.v)||0)+1);
 for(const d of dims){
  const L=(d.hi-d.lo)*scale,v=d.v;if(Math.abs(v-L)<=Math.max(v*0.02,15))continue;
  const s=String(v),near=[];
  for(let i=0;i<=s.length;i++)for(const c of "0123456789"){
   if(i<s.length)near.push(s.slice(0,i)+c+s.slice(i+1));
   near.push(s.slice(0,i)+c+s.slice(i))
  }
  for(let i=0;i<s.length;i++)near.push(s.slice(0,i)+s.slice(i+1));
  // A size the sheet has more of goes first («1175» drawn 1140 long is the 1125 of its chain, not 1145).
  const best=near.filter(x=>/^[1-9]/.test(x)).map(Number).filter(x=>Math.abs(x-L)<=L*0.015).sort((a,b)=>(times.get(b)||0)-(times.get(a)||0)||Math.abs(a-L)-Math.abs(b-L))[0];
  if(best)fixed.set(d.text,{...d.text,str:String(best),read:d.text.str})
 }
 return fixed.size?texts.map(t=>fixed.get(t)||t):texts
}
// A view drawn out of scale (the plan of a stair, ГПЭС М1.25: 1305, 1938 and 1110 drawn at 11.8, 10.5 and 14.1 mm a
// point): a point is read by the chain of sizes along its direction, each piece by its own size. The chain through the
// axis (a node of it or standing in one of its pieces) gives millimetres from the axis, growing with the sheet point;
// past its ends the end piece goes on. Null without a chain of two pieces through the axis.
function chainMap(dims,flat,axis){
 const nodes=[],node=p=>{let n=nodes.find(n=>Math.abs(n.pt-p)<=1.5);if(!n)nodes.push(n={pt:p,mm:null,edges:[]});return n};
 for(const d of dims.filter(d=>d.flat===flat)){const a=node(d.lo),b=node(d.hi);if(a===b)continue;a.edges.push({to:b,v:d.v});b.edges.push({to:a,v:-d.v})}
 let best=null;
 for(const start of nodes){
  if(start.mm!==null)continue;
  const part=[start];start.mm=0;
  for(let i=0;i<part.length;i++)for(const e of part[i].edges)if(e.to.mm===null){e.to.mm=part[i].mm+e.v;part.push(e.to)}
  const lo=Math.min(...part.map(n=>n.pt)),hi=Math.max(...part.map(n=>n.pt));
  if(part.length>=3&&axis>=lo-2&&axis<=hi+2&&(!best||part.length>best.length))best=part
 }
 if(!best)return null;
 // Overall sizes over the pieces may disagree with their sum by a rounding: each node keeps its first reading. The
 // millimetres must grow with the point.
 const pts=[...best].sort((a,b)=>a.pt-b.pt);
 if(pts.some((n,i)=>i&&n.mm-pts[i-1].mm<=0))return null;
 const u=pt=>{let i=pts.findIndex(n=>n.pt>=pt);if(i<0)i=pts.length-1;else if(i===0)i=1;
  const a=pts[i-1],b=pts[i];return a.mm+(pt-a.pt)*(b.mm-a.mm)/(b.pt-a.pt)};
 const at=u(axis),k=(pts[pts.length-1].mm-pts[0].mm)/(pts[pts.length-1].pt-pts[0].pt);
 return{mm:pt=>u(pt)-at,nodes:pts.map(n=>Math.round(n.mm-at)),k}
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
 const spans=[],notes=[],rows=[];
 // A size written in the bay: along the bay (its middle between the axes) and across it (the line of its chain).
 const sizes=(a,b)=>texts.map(t=>{const v=numberValue(t.str),box=textBox(t);
  const inside=orient==="V"?box.angle===0&&box.cx>Math.min(a,b)&&box.cx<Math.max(a,b):box.angle!==0&&box.cy>Math.min(a,b)&&box.cy<Math.max(a,b);
  return v>=50&&inside?{v,along:orient==="V"?box.cx:box.cy,across:orient==="V"?box.cy:box.cx}:null}).filter(Boolean);
 const exacts=[];
 for(let i=0;i+1<lines.length;i++){
  const a=lines[i],b=lines[i+1],d=Math.abs(b-a),geo=d*scale;
  let exact=null;
  const inBay=sizes(a,b);
  for(const c of inBay)if(Math.abs(c.v-geo)/geo<0.02&&(!exact||Math.abs(c.v-geo)<Math.abs(exact.v-geo)))exact=c;
  exacts.push(exact);if(exact)rows.push(exact.across)
 }
 // A chain splitting the bay («500 5500» from an axis to a wall line and on; the small size often written outside):
 // its sizes on the line of the other bays' sizes add up to the bay. Only that line: an inner chain of a bay drawn
 // out of scale may add up to the drawing (a КМ set: «11050» of the bay, a chain of 15000 inside it).
 const chainRows=[...rows];
 for(let i=0;i+1<lines.length;i++){
  if(exacts[i])continue;
  const a=lines[i],b=lines[i+1],d=Math.abs(b-a),geo=d*scale,inBay=sizes(a,b).filter(c=>chainRows.some(r=>Math.abs(c.across-r)<3));
  const near=sizes(Math.min(a,b)-d*0.5,Math.max(a,b)+d*0.5);
  for(const c of inBay){const line=near.filter(o=>o!==c&&Math.abs(o.across-c.across)<3),inSum=inBay.filter(o=>Math.abs(o.across-c.across)<3).reduce((n,o)=>n+o.v,0);
   const pair=line.find(o=>Math.abs(c.v+o.v-geo)/geo<0.02);
   if(inSum!==c.v&&Math.abs(inSum-geo)/geo<0.02){exacts[i]={v:inSum,along:c.along,across:c.across};break}
   if(pair&&!inBay.some(o=>o!==c&&o.v===pair.v&&o.along===pair.along)){exacts[i]={v:c.v+pair.v,along:c.along,across:c.across};break}}
  // A small bay (355-10: «800» between Б and В, two bubbles apart): its size stands beside it on the line of the
  // others' sizes, and the drawing is out by a part of a point — a large part of so short a bay.
  if(!exacts[i]&&d<40){const mid=(a+b)/2,used=exacts.filter(Boolean);
   const c=sizes(mid-d/2-30,mid+d/2+30).filter(c=>chainRows.some(r=>Math.abs(c.across-r)<3)&&Math.abs(c.along-mid)<=d/2+20&&Math.abs(c.v-geo)<=Math.max(geo*0.02,scale*0.8)&&
    !used.some(u=>u.v===c.v&&u.along===c.along)).sort((p,q)=>Math.abs(p.along-mid)-Math.abs(q.along-mid))[0];
   if(c)exacts[i]=c}
 }
 for(let i=0;i+1<lines.length;i++){
  const a=lines[i],b=lines[i+1],d=Math.abs(b-a),geo=d*scale;
  // A drawing not to scale (a run of equal bays drawn shorter, «6000» under each): the written size of the bay wins —
  // the one on the line of the other bays' sizes, or, of the sizes alone on their lines within the bay, the largest:
  // the overall «24000» beside the chain «750 22500 750» (the small sizes of a chain stand outside it).
  let written=null;
  if(!exacts[i]){
   // A size of several bays written over their middle (a КМ set: «15000» from О4 to О5 over the bay О4/1–О4/2 between
   // them) is not the size of the one bay under it.
   const ofRun=c=>{for(let j=0;j<=i;j++)for(let k=Math.max(i+1,j+2);k<lines.length;k++){const lo=Math.min(lines[j],lines[k]),hi=Math.max(lines[j],lines[k]);
    if(Math.abs((hi-lo)*scale-c.v)<=c.v*0.02&&Math.abs(c.along-(lo+hi)/2)<=(hi-lo)*0.1)return true}return false};
   // Drawn shorter, never longer: a smaller size in the bay is of something in it (a КМ set, sheet 44: «2750» in the bay
   // О1–К/1 of 5030).
   const all=sizes(a,b).filter(c=>c.v>geo*1.02&&c.v<=geo*2.5&&Math.abs(c.along-(a+b)/2)<=d*0.3&&!ofRun(c));
   const onRow=all.filter(c=>rows.some(r=>Math.abs(c.across-r)<3));
   if(onRow.length===1)written=onRow[0].v;
   else if(!rows.length){
    const inBay=sizes(a,b),alone=all.filter(c=>inBay.filter(o=>Math.abs(o.across-c.across)<3).length===1);
    if(alone.length)written=Math.max(...alone.map(c=>c.v))
   }
  }
  // Without a dimension text, grids are almost always laid out in 50 mm steps.
  const step50=Math.round(geo/50)*50;
  if(exacts[i])spans.push(exacts[i].v);else if(written)spans.push(written);else{spans.push(Math.abs(geo-step50)<=Math.max(15,geo*0.002)?step50:Math.round(geo/10)*10);notes.push(i)}
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
 const piece=i=>{
  const s=segments[i],l=dist(s.a,s.b);if(l<1)return null;
  const v={x:(s.b.x-s.a.x)/l,y:(s.b.y-s.a.y)/l};
  if(Math.abs(cross(u,v))>.02||Math.abs(cross(u,{x:s.a.x-a0.x,y:s.a.y-a0.y}))>.8)return null;
  const t1=(s.a.x-a0.x)*u.x+(s.a.y-a0.y)*u.y,t2=(s.b.x-a0.x)*u.x+(s.b.y-a0.y)*u.y;
  return{l,lo:Math.min(t1,t2),hi:Math.max(t1,t2)}
 };
 // A member drawn dash-dot (struts and bracing on a scheme): a short dash, and another of about its length at most
 // its own length further on. The line is followed across such gaps from dash to dash; a long stroke still joins
 // only across a small gap. A member drawn in two lines is no dash (ГПЭС М1.9: «В4», pieces of purlin 27 pt long between
 // the double lines of the rafters, the next piece 6 pt on).
 let dash=0;
 if(len<30&&!twinOf(seed,segments,lines,skip))for(const i of lines.near(at(len/2),len+30)){
  if(skip.has(i))continue;const p=piece(i);if(!p||p.l>=30||Math.abs(p.l-len)>len*0.5)continue;
  const gap=p.lo>len?p.lo-len:-p.hi;if(gap>3&&gap<=Math.max(8,len*0.9)){dash=Math.max(8,len*0.9);break}
 }
 for(let pass=0;pass<(dash?400:80);pass++){
  let grown=false;
  for(const end of [at(tA),at(tB)])for(const i of lines.near(end,dash?dash+4:8)){
   if(skip.has(i))continue;
   const p=piece(i);if(!p)continue;
   const {lo,hi}=p,reach=dash&&p.l<40?dash:3;
   if(hi<tA-reach||lo>tB+reach)continue;
   if(lo<tA-.01){tA=lo;grown=true}
   if(hi>tB+.01){tB=hi;grown=true}
  }
  if(!grown)break
 }
 return{a:at(tA),b:at(tB)}
}
// A member drawn as a line on the plan: its label lies along it, or a leader points onto it.
// A stroke with strokes of about its length on its line on both sides, across gaps: a dash of a dash-dot line.
function dashOf(i,segments,lines){
 const s=segments[i],len=dist(s.a,s.b);if(len<4)return false;
 const u={x:(s.b.x-s.a.x)/len,y:(s.b.y-s.a.y)/len};
 const side=dir=>{const end=dir>0?s.b:s.a;
  return lines.near(end,len*0.9+4).some(j=>{if(j===i)return false;const q=segments[j],l=dist(q.a,q.b);if(Math.abs(l-len)>len*0.3)return false;
   const v={x:(q.b.x-q.a.x)/l,y:(q.b.y-q.a.y)/l};if(Math.abs(cross(u,v))>.02||Math.abs(cross(u,{x:q.a.x-s.a.x,y:q.a.y-s.a.y}))>.8)return false;
   const t1=(q.a.x-s.a.x)*u.x+(q.a.y-s.a.y)*u.y,t2=(q.b.x-s.a.x)*u.x+(q.b.y-s.a.y)*u.y;
   const gap=dir>0?Math.min(t1,t2)-len:-Math.max(t1,t2);return gap>=2&&gap<=len*0.8})};
 return side(1)&&side(-1)
}

// The other edge of a member drawn in two lines: a line of about its length beside it 1.2–8 pt off, along at least
// 80 % of it. A dash of an axis drawn inside a wide beam has the beam's long edges beside it, and a dash of another
// dash-dot line beside the axis has the axis's dashes (ГПЭС М1.2: «К146»): no twin. The strokes of the axes (skip) are
// no edges.
function twinOf(line,segments,lines,skip){
 const l=dist(line.a,line.b),u={x:(line.b.x-line.a.x)/l,y:(line.b.y-line.a.y)/l},mid={x:(line.a.x+line.b.x)/2,y:(line.a.y+line.b.y)/2};
 return lines.near(mid,l/2+8).some(i=>{
  if(skip?.has(i))return false;
  const s=segments[i],m=dist(s.a,s.b);if(m<l*0.7||m>l*1.3+3)return false;
  const v={x:(s.b.x-s.a.x)/m,y:(s.b.y-s.a.y)/m};if(Math.abs(cross(u,v))>.02)return false;
  const off=Math.abs(cross(u,{x:s.a.x-line.a.x,y:s.a.y-line.a.y}));if(off<1.2||off>8)return false;
  const t1=(s.a.x-line.a.x)*u.x+(s.a.y-line.a.y)*u.y,t2=(s.b.x-line.a.x)*u.x+(s.b.y-line.a.y)*u.y;
  return Math.min(l,Math.max(t1,t2))-Math.max(0,Math.min(t1,t2))>=l*0.8
 })
}
function memberLine(t,target,segments,lines,skip){
 const f=textFrame(t);
 const found=[];
 const consider=(i,score)=>found.push({i,score});
 if(target.leader){
  // The leader ends on the member: the longest line through that point.
  // A turned label's "leader" running along it may be its member itself (a КМ set: «Б2» turned along a short beam
  // ending on another).
  const ls0=Number.isInteger(target.segment)?segments[target.segment]:null;
  const own=ls0&&Math.abs(Number(t.angle)||0)>5&&Math.abs(cross({x:(ls0.b.x-ls0.a.x)/(dist(ls0.a,ls0.b)||1),y:(ls0.b.y-ls0.a.y)/(dist(ls0.a,ls0.b)||1)},f.dir))<=.07;
  for(const i of lines.near(target,6)){
   if(skip.has(i)||i===target.segment&&!own)continue;
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
   if(off>f.h*1.7||along<-f.w/2-f.h||along>l+f.w/2+f.h)continue;
   // A line passing under the label goes before one that only starts beside it (029-2025: «53» over its beam, the
   // frame of a level mark beside it, nearer).
   consider(i,off+(along<-f.w/2||along>l+f.w/2?f.h*2:0))
  }
 }
 // Nearest first; short strokes next to the label (ticks, hatching) are passed over.
 found.sort((a,b)=>a.score-b.score);
 let pick=null;
 for(const c of found.slice(0,8)){
  const line=growLine(segments[c.i],segments,lines,skip),l=dist(line.a,line.b);
  // A leader shelf is about as long as its label; a member is clearly longer — or drawn in two lines, its edges (ГПЭС
  // М1.9: «В58», a beam of 1 m between two purlins, as long as two of its labels).
  if(l<Math.max(24,f.w*2.2)&&!(l>=12&&twinOf(line,segments,lines,skip)))continue;
  if(!pick){pick={c,line,l};if(c.score<0||!dashOf(c.i,segments,lines))break;continue}
  // A dash of a dash-dot line along the label and a far longer line about as near: the dashes are an axis drawn beside
  // the member (a КМ set: «П1» between its purlin and the axis it stands on).
  if(c.score>pick.c.score+2.5)break;
  if(l>pick.l*1.5){pick={c,line,l};break}
 }
 return pick?.line||null
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
    out.push({flat,lo,hi,a,b,mid:(lo+hi)/2,step})
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
function columnSymbol(target,segments,index,outline){
 const box=(reach,few,within)=>{
  const near=p=>Math.abs(p.x-target.x)<=reach&&Math.abs(p.y-target.y)<=reach;
  const parts=[...new Set(index.near(target,reach+4))].map(i=>segments[i])
   // Straight strokes only: arrow heads and brace ends are slanted.
   .filter(s=>near(s.a)&&near(s.b)&&dist(s.a,s.b)<10&&(Math.abs(s.a.x-s.b.x)<.3||Math.abs(s.a.y-s.b.y)<.3));
  const across=parts.filter(s=>Math.abs(s.a.y-s.b.y)<.3).length;
  if(parts.length<6&&!(few&&parts.length>=4&&across>=2&&parts.length-across>=2))return null;
  const xs=parts.flatMap(s=>[s.a.x,s.b.x]),ys=parts.flatMap(s=>[s.a.y,s.b.y]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),w=x1-x0,h=y1-y0;
  const off=Math.hypot(Math.max(0,x0-target.x,target.x-x1),Math.max(0,y0-target.y,target.y-y1));
  return w>=3&&h>=3&&w<=14&&h<=14&&off<=within?{x:(x0+x1)/2,y:(y0+y1)/2}:null
 };
 // The arrow of the leader may stop short of the symbol, at a corner (355-11: a square of 6.6 pt, the tip up to 5 pt
 // from it, drawn by four strokes): looked for farther when nothing is at the tip.
 // A square standing on the outline of a partition (ГПЭС АБК: 3.7 pt, the dashed double line through it): its own
 // strokes, joined at their ends, apart from the lines beside it. Only when asked (outline): a leader of a mark whose
 // letters tell no kind; a number of the index ends at junctions of members drawn the same way (029-2025: «41»).
 // A post on its base plate (ГПЭС М1.25: the arrow at the corner of the plate of 25 pt, the post's square of 8.7 pt in
 // its middle): the middle of the plate, not the corner (100 mm off the axis is 8.5 pt there).
 if(outline==="closed")return plate()||closed();
 return plate()||box(9,false,Infinity)||box(12,true,7)||(outline?closed():null)
 function plate(){
  // Its sides are often cut where the ribs meet them: strokes of one line touching end to end are joined first.
  const runs=new Map(),joined=[];
  for(const q of new Set(index.near(target,45))){const s=segments[q],flat=Math.abs(s.a.y-s.b.y)<0.3;if(!flat&&Math.abs(s.a.x-s.b.x)>=0.3)continue;
   const c=flat?s.a.y:s.a.x,k=(flat?"H":"V")+Math.round(c*2),u0=flat?Math.min(s.a.x,s.b.x):Math.min(s.a.y,s.b.y),u1=flat?Math.max(s.a.x,s.b.x):Math.max(s.a.y,s.b.y);
   if(!runs.has(k))runs.set(k,[]);runs.get(k).push({flat,c,u0,u1})}
  for(const list of runs.values()){list.sort((a,b)=>a.u0-b.u0);let cur=null;
   for(const r of [...list,null]){if(r&&cur&&r.u0<=cur.u1+0.5){cur.u1=Math.max(cur.u1,r.u1);continue}
    if(cur)joined.push(cur.flat?{a:{x:cur.u0,y:cur.c},b:{x:cur.u1,y:cur.c}}:{a:{x:cur.c,y:cur.u0},b:{x:cur.c,y:cur.u1}});cur=r&&{...r}}}
  // The plate is the box with the post's square in its middle (the ribs cut it into quarters with none).
  let post=null;
  const o=outlineOf(joined,target,30,b=>{const w=b.x1-b.x0,h=b.y1-b.y0;if(w<10||h<10||w>40||h>40||Math.max(w,h)>Math.min(w,h)*1.5)return false;
   // The post is well inside it (a box of its own size is the plate itself, or another square by it: 029-2025).
   const c={x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2},p=closed(c,0,Math.min(w,h)*0.6);return Boolean(p&&Math.hypot(p.x-c.x,p.y-c.y)<=Math.min(w,h)*0.1&&(post=p))})[0];
  return o?post&&closed({x:(o.x0+o.x1)/2,y:(o.y0+o.y1)/2},0,Math.min(o.x1-o.x0,o.y1-o.y0)*0.6):null
 }
 function closed(at=target,within=5,most=14.5){
  const parts=[...new Set(index.near(at,12))].map(i=>segments[i]).filter(s=>dist(s.a,s.b)>=2.5&&dist(s.a,s.b)<=most&&
   [s.a,s.b].every(p=>Math.abs(p.x-at.x)<=12&&Math.abs(p.y-at.y)<=12));
  const flat=parts.filter(s=>Math.abs(s.a.y-s.b.y)<.3).map(s=>({y:s.a.y,x0:Math.min(s.a.x,s.b.x),x1:Math.max(s.a.x,s.b.x)}));
  const up=parts.filter(s=>Math.abs(s.a.x-s.b.x)<.3).map(s=>({x:s.a.x,y0:Math.min(s.a.y,s.b.y),y1:Math.max(s.a.y,s.b.y)}));
  const side=(x,y0,y1)=>up.some(v=>Math.abs(v.x-x)<0.6&&Math.abs(v.y0-y0)<0.6&&Math.abs(v.y1-y1)<0.6);
  let best=null;
  for(const a of flat)for(const b of flat){
   if(b.y-a.y<2.5||b.y-a.y>most||Math.abs(a.x0-b.x0)>0.6||Math.abs(a.x1-b.x1)>0.6)continue;
   const w=a.x1-a.x0,h=b.y-a.y;if(Math.max(w,h)>Math.min(w,h)*3||!side(a.x0,a.y,b.y)||!side(a.x1,a.y,b.y))continue;
   const off=Math.hypot(Math.max(0,a.x0-at.x,at.x-a.x1),Math.max(0,a.y-at.y,at.y-b.y));
   if(off<=within&&(!best||off<best.off))best={off,x:(a.x0+a.x1)/2,y:(a.y+b.y)/2}
  }
  return best?{x:best.x,y:best.y}:null
 }
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

function leaderTarget(text,segments,index,axisSegs,lines){
 const box=textBox(text);
 // The shelf sits just under the label; the leader leaves from its ends. A large label's shelf runs on farther past it
 // (ГПЭС М1.25: «Ф127» at 17.6 pt, its shelf 10 pt past the end): its shelf, the leaders from the shelf's ends and
 // slanted ones are looked for that far; a straight stroke with no shelf drawn only as near as of any label (ГПЭС М1.1:
 // a line of the panels under «Ф170-20» is no leader).
 const pad=8,wide=Math.max(pad,(Number(text.size)||0)*0.6);
 const zone={x0:box.x0-pad,x1:box.x1+pad,y0:box.y1-3,y1:box.y1+12};
 const inZone=p=>p.x>=zone.x0&&p.x<=zone.x1&&p.y>=zone.y0&&p.y<=zone.y1,inWide=p=>p.x>=box.x0-wide&&p.x<=box.x1+wide&&p.y>=zone.y0&&p.y<=zone.y1;
 const near=[...new Set(index.near({x:box.cx,y:box.y1+4},40))].filter(i=>!axisSegs.has(i));
 // A member drawn under its label (К143 over the beam of axis А): its line, in pieces broken at the joints, runs on
 // well past the label. Its pieces are no shelf, and the braces meeting it there are no leaders.
 const flat=Math.abs(Number(text.angle)||0)<=5,w0=box.x1-box.x0;
 const rails=[];
 // Lines passing under the label with their ends far off are found by the index of whole lines.
 const along=lines?[...new Set([...near,...lines.near({x:box.cx,y:box.y1+4},Math.max(40,w0))])].filter(i=>!axisSegs.has(i)):near;
 if(flat)for(const i of along){
  const s=segments[i];if(Math.abs(s.a.y-s.b.y)>=0.6||!(s.a.y>=zone.y0&&s.a.y<=zone.y1))continue;
  const y=(s.a.y+s.b.y)/2;let lo=Math.min(s.a.x,s.b.x),hi=Math.max(s.a.x,s.b.x);
  if(Math.min(hi,box.x1)-Math.max(lo,box.x0)<w0*0.3&&hi-lo<w0)continue;
  for(let grown=true,k=0;grown&&k<40;k++){grown=false;
   for(const j of [...new Set([...index.near({x:lo,y},4),...index.near({x:hi,y},4)])]){const q=segments[j];if(Math.abs(q.a.y-y)>0.6||Math.abs(q.b.y-y)>0.6)continue;
    const a=Math.min(q.a.x,q.b.x),b=Math.max(q.a.x,q.b.x);if(b<lo-3||a>hi+3)continue;if(a<lo-0.01){lo=a;grown=true}if(b>hi+0.01){hi=b;grown=true}}}
  // It runs on past both ends of the label: a line leaving from under the label's start (a КМ set: «Бл2» at the
  // start of a long leader running across its beams) is the label's leader, not its member.
  // A short beam drawn in two lines is a member too (ГПЭС М1.9: «В58» over its 37 pt beam; the extension line of the
  // size «2120» starting on it is no leader).
  const m=Math.max(3,w0*0.2);
  if((hi-lo>=Math.max(24,w0*2.2)||lines&&hi-lo>=12&&twinOf({a:{x:lo,y},b:{x:hi,y}},segments,lines,axisSegs))&&Math.min(hi,box.x1)-Math.max(lo,box.x0)>=w0*0.5&&lo<=box.x0-m&&hi>=box.x1+m)rails.push({y,lo,hi,i})
 }
 // The member's other edge (a beam drawn with two lines) belongs to it too.
 const onRail=p=>rails.some(r=>Math.abs(p.y-r.y)<5&&p.x>=r.lo-1.5&&p.x<=r.hi+1.5);
 const railSeg=new Set([...rails.map(r=>r.i),...along.filter(i=>{const q=segments[i];return Math.abs(q.a.y-q.b.y)<0.6&&onRail(q.a)&&onRail(q.b)})]);
 // When the shelf is drawn, the leader leaves from one of its ends: a member line passing the zone is not a leader.
 const ends=!flat?[]:near.filter(i=>!railSeg.has(i)&&!onRail(segments[i].a)).map(i=>segments[i]).filter(s=>inWide(s.a)&&inWide(s.b)&&Math.abs(s.a.y-s.b.y)<1.5&&dist(s.a,s.b)>=(box.x1-box.x0)*0.6).flatMap(s=>[s.a,s.b]);
 const fromShelf=p=>!ends.length||ends.some(e=>dist(e,p)<4);
 let best=null;const leaders=[];
 for(const i of near){
  const s=segments[i],len=dist(s.a,s.b);if(len<6)continue;
  const diagonal=Math.abs(s.a.x-s.b.x)>1&&Math.abs(s.a.y-s.b.y)>1;
  for(const [p,q] of [[s.a,s.b],[s.b,s.a]]){
   const In=diagonal||ends.length?inWide:inZone;
   // A leader leaves the label's zone: a stroke along the shelf (flat) even its wide one.
   if(!In(p)||(Math.abs(s.a.y-s.b.y)<1.5?In(q):inZone(q))||!fromShelf(p)||!ends.length&&onRail(p))continue;
   const score=(diagonal?100:0)+len;
   if(diagonal)leaders.push({from:p,to:q,segment:i});
   if(!best||score>best.score)best={score,from:p,to:q,diagonal,segment:i}
  }
 }
 // One label, several slanted leaders from the same end of its shelf: the same mark at each of their ends (355-11:
 // «23» with two leaders to two posts). Pieces of one leader (the same way, ends together) are one.
 const way=l=>Math.atan2(l.to.y-l.from.y,l.to.x-l.from.x);
 const more=best?.diagonal?leaders.filter(l=>l.segment!==best.segment&&dist(l.from,best.from)<3&&dist(l.to,best.to)>8).filter((l,k,list)=>
  Math.acos(Math.max(-1,Math.min(1,Math.cos(way(l)-way(best)))))>0.17&&!list.slice(0,k).some(o=>dist(o.to,l.to)<=8)).map(l=>({x:l.to.x,y:l.to.y,segment:l.segment})):[];
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
   .filter(q=>Math.abs(q.a.y-q.b.y)<0.5&&q.a.y>=box.y1-3&&q.a.y<=box.y1+12&&Math.min(Math.max(q.a.x,q.b.x),box.x1)-Math.max(Math.min(q.a.x,q.b.x),box.x0)>=w*0.8&&dist(q.a,q.b)<=Math.min(220,w*9)&&
    !rails.some(r=>r.hi-r.lo>Math.min(220,w*9)&&Math.abs(q.a.y-r.y)<5&&Math.min(q.a.x,q.b.x)>=r.lo-1.5&&Math.max(q.a.x,q.b.x)<=r.hi+1.5)&&
    // A shelf is one line: one drawn in two is a member (ГПЭС М1.9: «В3» over its piece of purlin, the rafter's edge
    // leaving its end).
    !(lines&&twinOf(q,segments,lines,axisSegs)));
  // A shelf may come in pieces: carried on along its line to its real ends.
  const extend=(e,dir)=>{let p=e;for(let k=0;k<20;k++){const nx=index.near(p,3).map(i=>segments[i]).find(q=>Math.abs(q.a.y-q.b.y)<0.5&&Math.abs(q.a.y-p.y)<0.5&&
   [q.a,q.b].some(r=>dist(r,p)<1)&&[q.a,q.b].some(r=>(r.x-p.x)*dir>0.5));if(!nx)break;p=[nx.a,nx.b].sort((u,v)=>(v.x-u.x)*dir)[0]}return p};
  for(const sh of shelves)for(const e of [sh.a,sh.b].map(e=>extend(e,e===(sh.a.x<sh.b.x?sh.a:sh.b)?-1:1)))for(const i of index.near(e,4)){
   const q=segments[i];if(axisSegs.has(i)||q===sh)continue;
   const len=dist(q.a,q.b);if(len<10||Math.abs(q.a.y-q.b.y)<=1)continue;
   for(const [p,r] of [[q.a,q.b],[q.b,q.a]])if(dist(p,e)<3&&(!best||len>best.score))best={score:len,to:r,diagonal:Math.abs(q.a.x-q.b.x)>1,segment:i,shelf:true}
  }
 }
 // shelf: the label stands on a shelf of its own (a leader label), not over a line passing by.
 // rail: no leader, the label is written over its member line.
 // slant: the longest slanted leader when a straight stroke from the label was taken (an extension line of a size
 // passing the label's end); it may end at the post the label names.
 const slant=best&&!best.diagonal&&leaders.length?leaders.reduce((a,l)=>dist(l.from,l.to)>dist(a.from,a.to)?l:a):null;
 return best?{x:best.to.x,y:best.to.y,leader:true,diagonal:best.diagonal,segment:best.segment,shelf:Boolean(best.shelf||ends.length),...(more.length?{more}:{}),...(slant?{slant:{x:slant.to.x,y:slant.to.y,segment:slant.segment}}:{})}:{x:box.cx,y:box.y1+6,leader:false,...(rails.length?{rail:true}:{})}
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

// A word written under a mark on its shelf names it: «огр.» (ограждение) under «Ф133» of a stair's plan. Under is across
// the text's own line, whichever way it is turned.
function nameUnder(t,texts){
 const a=(Number(t.angle)||0)*Math.PI/180,size=Number(t.size)||10,down={x:Math.sin(a),y:Math.cos(a)},along={x:Math.cos(a),y:-Math.sin(a)};
 const u=texts.find(u=>u!==t&&/^огр\.?$/iu.test(String(u.str||"").trim())&&Math.abs((Number(u.angle)||0)-(Number(t.angle)||0))<3&&(()=>{
  const dx=u.x-t.x,dy=u.y-t.y,p=dx*down.x+dy*down.y,q=dx*along.x+dy*along.y;return p>=size*0.3&&p<=size*1.6&&q>=-size&&q<=size*2})());
 return u?"Ограждение":null
}

function extractScheme({segments=[],texts=[],glyphs=[],page=1,kinds=DEFAULT_KINDS}={}){
 const aMarks=aMarksOn(texts),markIndex=markIndexOf(texts);
 // The height of the sizes of the sheet (four and five digits are sizes).
 const dimSize=median(texts.filter(t=>/^\d{4,5}$/.test(String(t.str).trim())).map(t=>Number(t.size)||0));
 segments=segments.filter(s=>s&&Number.isFinite(s.a?.x)&&Number.isFinite(s.b?.y)&&dist(s.a,s.b)>0.05);
 const index=buildIndex(segments),lines=buildLineIndex(segments);
 const bubbles=[];
 for(const t of texts){
  if(!AXIS_LABEL.test(String(t.str||"").trim()))continue;
  const b=findBubble(t,segments,index);if(b)bubbles.push({...b,text:t})
 }
 const found=bubbles.map(b=>axisFromBubble(b,segments));
 // A bubble in a row of axis bubbles whose own line is not drawn (axis 6 beside 7, 500 mm apart: only a tick under the
 // bubble): an axis at the bubble, as long as the lines of its row.
 bubbles.forEach((b,i)=>{
  if(found[i])return;
  const row=bubbles.map((o,j)=>({o,a:found[j]})).filter(({o,a})=>a&&o!==b&&Math.abs(o.r-b.r)<=1&&(a.orient==="V"?Math.abs(o.y-b.y)<=1.5:Math.abs(o.x-b.x)<=1.5));
  if(row.length<2||new Set(row.map(r=>r.a.orient)).size>1)return;
  const orient=row[0].a.orient,spans=row.map(r=>r.a.span);
  // Its name falls in order between its neighbours of the row (6 between 5 and 7): a fraction bubble standing off its
  // place (a КМ set: «О1/1» between О2 and О3, its line elsewhere) is not an axis there.
  const at=o=>orient==="V"?o.x:o.y,me=axisRank(b.name),prev=row.filter(r=>at(r.o)<at(b)).sort((p,q)=>at(q.o)-at(p.o))[0],next=row.filter(r=>at(r.o)>at(b)).sort((p,q)=>at(p.o)-at(q.o))[0];
  const lo=prev&&axisRank(prev.o.name),hi=next&&axisRank(next.o.name);
  if(!me||!lo||!hi||lo.p!==me.p||hi.p!==me.p||!((lo.v<me.v&&me.v<hi.v)||(lo.v>me.v&&me.v>hi.v)))return;
  // Only a bubble with the tick of its axis at its edge (355-11: a stroke of 4 pt under «6»): a bubble with no stroke
  // of its own is of another view or stands off its place (a КМ set, sheet 44: «О2» 180 mm off, its line 38 pt away).
  const c=orient==="V"?b.x:b.y,along=orient==="V"?b.y:b.x;
  if(!segments.some(s=>{const [p,q,u,v]=orient==="V"?[s.a.x,s.b.x,s.a.y,s.b.y]:[s.a.y,s.b.y,s.a.x,s.b.x];
   const d=[Math.abs(u-along),Math.abs(v-along)];return Math.abs(p-q)<=0.3&&Math.abs(p-c)<=1.5&&Math.min(...d)>=b.r-1&&Math.min(...d)<=b.r+5&&Math.abs(u-v)>=1.5}))return;
  found[i]={name:b.name,orient,pos:orient==="V"?b.x:b.y,span:[Math.max(...spans.map(x=>x[0])),Math.min(...spans.map(x=>x[1]))],bubbles:[b],drawn:false}
 });
 const axes=mergeAxes(found.filter(Boolean));
 const usedTexts=new Set(bubbles.map(b=>b.text));
 // A title in two lines («Схема расположения элементов покрытия» / «на отм. +2,200»): the second line starts in lower
 // case and lies under the first, within two heights of the smaller lettering (ГПЭС М1.9: the title read off a picture
 // stands taller than written; «по 9 (М1.8)» of a node 3 cm under it is no part of it).
 const titles=texts.filter(t=>/^Схема\s/u.test(String(t.str||"").trim())).map(t=>{
  const next=texts.find(u=>u!==t&&Math.abs(Number(u.angle)||0)<2&&u.y>t.y+1&&u.y-t.y<=Math.min(t.size||10,u.size||t.size||10)*2&&u.x<t.x+(t.width||0)&&u.x+(u.width||0)>t.x&&/^[а-яё(]/u.test(String(u.str||"").trim()));
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
  // A word read alone on a leader's shelf is a label, not a size (355-11 М1.3: «64», «104» all over the plan).
  let sized=local.filter(t=>!t.shelf);
  let scale=group.framed?group.framed.scale:group.local?dimensionScale(local1.filter(t=>!t.shelf),segments,local.filter(t=>!t.shelf)):detectScale(vAxes.map(a=>a.pos),hAxes.map(a=>a.pos),sized);
  // A stair's plan drawn out of scale: read by its chains of sizes, both ways through its axes.
  let chain=null;
  if(group.local&&!Number.isFinite(scale)&&vAxes.length===1&&hAxes.length===1&&/лестниц|марш/iu.test(titleFor(titles,bbox))){
   const dims=dimensionsOf(local.filter(t=>!t.shelf),segments),cx=chainMap(dims,true,vAxes[0].pos),cy=chainMap(dims,false,hAxes[0].pos);
   if(cx&&cy){chain={x:cx,y:cy};scale=(cx.k+cy.k)/2}
  }
  if(group.local&&!Number.isFinite(scale))continue;
  if(!Number.isFinite(scale)){
   schemes.push({title:titleFor(titles,bbox),bbox,error:"Не удалось определить масштаб: нет размеров между осями",
    axesX:vAxes.map(a=>a.name),axesY:hAxes.map(a=>a.name),placements:[],warnings});
   continue
  }
  if(!chain)sized=fixReadSizes(sized,segments,scale);
  const sx=spansFor(vAxes.map(a=>a.pos),"V",sized,scale),sy=spansFor(hAxes.map(a=>a.pos),"H",sized,scale);
  // An axis known by its bubble alone is drawn where the bubble fits, not to scale: of its two bays one has a written
  // size, the other is the rest of the two together as drawn (6 between 5 and 7: «5500», and 500 to 7).
  for(const [list,res] of [[vAxes,sx],[hAxes,sy]])list.forEach((ax,k)=>{
   if(ax.drawn!==false||k===0||k===list.length-1)return;
   const both=Math.round(Math.abs(list[k+1].pos-list[k-1].pos)*scale/50)*50,gi=res.notes.includes(k-1),gj=res.notes.includes(k);
   if(gi===gj||Math.abs(res.spans[k-1]+res.spans[k]-both)<=both*0.02)return;
   const rest=both-res.spans[gi?k:k-1];if(rest>0)res.spans[gi?k-1:k]=rest
  });
  if(sx.notes.length||sy.notes.length)warnings.push("Часть пролётов определена по геометрии, без размерной надписи — проверьте сетку");
  const cum=a=>a.reduce((acc,v)=>{acc.push(acc[acc.length-1]+v);return acc},[0]);
  const xMm=cum(sx.spans),yMm=cum(sy.spans);
  // The error of the calibration (journal of the sheet): each span between axes as drawn, by the scale, against the span
  // as written.
  const calib=[];
  for(const [axes,spans] of [[vAxes,sx.spans],[hAxes,sy.spans]])for(let i=1;i<axes.length;i++){const w=spans[i-1];if(w>0)calib.push({d:Math.abs(Math.abs(axes[i].pos-axes[i-1].pos)*scale-w),w})}
  const calibration=calib.length?{spans:calib.length,max_mm:Math.round(Math.max(...calib.map(c=>c.d))),max_pct:Math.round(Math.max(...calib.map(c=>c.d/c.w))*1000)/10}:null;
  // Millimetre position of any sheet point, measured from the nearest
  // labelled axis so that rounding never accumulates across the grid.
  // A bay drawn out of scale (its written size differs from the drawn one by more than 5 %) is measured by its own
  // scale: the point keeps its share of the bay.
  const local1d=(axes,mm,pt,sign)=>{
   for(let k=0;k+1<axes.length;k++){const a=axes[k].pos,b=axes[k+1].pos,w=mm[k+1]-mm[k];
    if(pt>=Math.min(a,b)&&pt<=Math.max(a,b)&&Math.abs(Math.abs(b-a)*scale-Math.abs(w))>Math.abs(w)*0.05)return mm[k]+Math.round(w*(pt-a)/(b-a)/10)*10}
   return null
  };
  const toX=chain?pt=>Math.round(chain.x.mm(pt)/10)*10:pt=>{const o=local1d(vAxes,xMm,pt);if(o!==null)return o;let i=0;for(let k=0;k<vAxes.length;k++)if(Math.abs(vAxes[k].pos-pt)<Math.abs(vAxes[i].pos-pt))i=k;return xMm[i]+Math.round((pt-vAxes[i].pos)*scale/10)*10};
  const toY=chain?pt=>-Math.round(chain.y.mm(pt)/10)*10:pt=>{const o=local1d(hAxes,yMm,pt);if(o!==null)return o;let i=0;for(let k=0;k<hAxes.length;k++)if(Math.abs(hAxes[k].pos-pt)<Math.abs(hAxes[i].pos-pt))i=k;return yMm[i]+Math.round((hAxes[i].pos-pt)*scale/10)*10};
  // Exact positions offered by the drawing: labelled axes plus or minus any
  // dimension value written along that direction ("4340", "2375"...).
  const dimsX=sized.filter(t=>textBox(t).angle===0).map(t=>numberValue(t.str)).filter(v=>v>=50);
  const dimsY=sized.filter(t=>textBox(t).angle!==0).map(t=>numberValue(t.str)).filter(v=>v>=50);
  const candidates=(axisMm,dims)=>[...new Set(axisMm.flatMap(a=>[a,...dims.flatMap(v=>[a+v,a-v])]))];
  // The ticks of a dimension chain tied to an axis (ГПЭС М1.9: «1125» after «1125» from axis 1 — the purlins of the bay
  // stand on them): each a position summed from the axis along the chain. A size that its drawn length disagrees with
  // by over 3 % (misread: «125») breaks the chain there; the next axis ties the rest. The sizes are tied the most
  // repeated first, then the best drawn: one closing a loop already tied is passed over (a «1135» read for the first
  // 1125 of a bay drawn a point long, beside the seven other 1125 and the 9000 over them). A part tied to two axes that
  // disagree with it gives nothing.
  const ticks=(flat,axes,mm)=>{
   if(chain)return[];
   const nodes=[],node=p=>{let n=nodes.find(n=>Math.abs(n.pt-p)<=1.5);if(!n)nodes.push(n={pt:p,up:null,off:0});return n};
   // mm(n) = mm(n.up) + n.off.
   const root=n=>{let o=0,r=n;while(r.up){o+=r.off;r=r.up}return{r,o}};
   const sizes=dimensionsOf(sized,segments).filter(d=>d.flat===flat).map(d=>({d,err:Math.abs(d.v-(d.hi-d.lo)*scale)/d.v})).filter(x=>x.err<=0.03);
   const times=new Map();for(const {d} of sizes)times.set(d.v,(times.get(d.v)||0)+1);
   sizes.sort((p,q)=>times.get(q.d.v)-times.get(p.d.v)||p.err-q.err);
   for(const {d} of sizes){
    const a=node(d.lo),b=node(d.hi);if(a===b)continue;
    const A=root(a),B=root(b);if(A.r===B.r)continue;
    B.r.up=A.r;B.r.off=A.o+(flat?d.v:-d.v)-B.o
   }
   const parts=new Map();
   for(const n of nodes){const {r,o}=root(n);if(!parts.has(r))parts.set(r,[]);parts.get(r).push({n,o})}
   const out=[];
   for(const list of parts.values()){
    const at=list.map(({n,o})=>{const k=axes.findIndex(a=>Math.abs(a.pos-n.pt)<=1.5);return k>=0?{pt:n.pt,base:mm[k]-o}:null}).filter(Boolean);
    if(!at.length||at.some(v=>Math.abs(v.base-at[0].base)>20))continue;
    // Each tick from its nearest axis (a size read 10 off between them stays between them).
    out.push(...list.map(({n,o})=>at.reduce((p,q)=>Math.abs(q.pt-n.pt)<Math.abs(p.pt-n.pt)?q:p).base+o))
   }
   return out
  };
  const candX=[...candidates(xMm,dimsX),...(chain?chain.x.nodes:[]),...ticks(true,vAxes,xMm)],candY=[...candidates(yMm,dimsY),...(chain?chain.y.nodes.map(v=>-v):[]),...ticks(false,hAxes,yMm)];
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
  // A member drawn on a line known only from the dimensions (a beam in the middle of a bay) is still a member: only the
  // strokes of the named axes are kept out of member lines.
  const namedSegs=new Set();
  segments.forEach((s,i)=>{
   if(Math.abs(s.a.x-s.b.x)<=0.3){const l=gridX.find(l=>Math.abs(l.pt-s.a.x)<0.8);if(l)axisSegs.add(i);if(l&&(l.name||gridX.some(n=>n.name&&Math.abs(n.pt-s.a.x)<0.8)))namedSegs.add(i)}
   if(Math.abs(s.a.y-s.b.y)<=0.3){const l=gridY.find(l=>Math.abs(l.pt-s.a.y)<0.8);if(l)axisSegs.add(i);if(l&&(l.name||gridY.some(n=>n.name&&Math.abs(n.pt-s.a.y)<0.8)))namedSegs.add(i)}
  });
  const snap=Math.max(6,250/scale);
  const title=group.framed?String(group.framed.title.str).trim():titleFor(titles,bbox),titleKind=sheetKind(title);
  // A ladder's own plan («Схема расположения элементов пожарной лестницы в осях И/6», a view by two axes).
  const ladderPlan=group.local&&/стремянк|(?:пожарн|внутренн|вертикальн|наружн)\S*\s+лестниц/iu.test(title||"");
  // A point not on a grid line is placed at the nearest dimensioned position.
  // A local view (a porch at 1:50) is drawn exactly: a point snaps only to a position within a few points of it.
  const freeTol=group.local?Math.max(30,scale*3):200;
  const freeX=pt=>{const g=toX(pt),h=snapDim(g,candX,freeTol);return h?{mm:h.mm,dim:true}:{mm:g,dim:false}};
  const freeY=pt=>{const g=toY(pt),h=snapDim(g,candY,freeTol);return h?{mm:h.mm,dim:true}:{mm:g,dim:false}};
  // Ends of a member lying on one grid line between its two neighbouring lines.
  const spanAlong=(target,lx,ly)=>{
   if(lx&&(!ly||lx.d<=ly.d)){
    const below=linesY.filter(l=>l.pt>=target.y).sort((a,b)=>a.pt-b.pt)[0],above=linesY.filter(l=>l.pt<target.y).sort((a,b)=>b.pt-a.pt)[0];
    return below&&above?{x_mm:lx.mm,y_mm:below.mm,x2_mm:lx.mm,y2_mm:above.mm,axis_x:lx.name||nearestName(linesX,target.x),line_pt:{a:{x:lx.pt,y:below.pt},b:{x:lx.pt,y:above.pt}}}:null
   }
   if(ly){
    const left=linesX.filter(l=>l.pt<=target.x).sort((a,b)=>b.pt-a.pt)[0],right=linesX.filter(l=>l.pt>target.x).sort((a,b)=>a.pt-b.pt)[0];
    return left&&right?{x_mm:left.mm,y_mm:ly.mm,x2_mm:right.mm,y2_mm:ly.mm,axis_y:ly.name||nearestName(linesY,target.y),line_pt:{a:{x:left.pt,y:ly.pt},b:{x:right.pt,y:ly.pt}}}:null
   }
   return null
  };
  // Ends of a drawn member: on a grid line when close, otherwise at a dimensioned position.
  const endTol=group.local?freeTol:600;
  // Secondary beams and bracing often meet the middle of a bay that has no dimension of its own.
  const mids=pos=>pos.slice(1).map((v,i)=>(v+pos[i])/2);
  const memberX=[...candX,...mids(xMm)],memberY=[...candY,...mids(yMm)];
  const snapMm=(v,lines2,cand,tol=endTol)=>{
   let best=null;for(const l of lines2){const d=Math.abs(l.mm-v);if(d<=tol&&(!best||d<best.d))best={mm:l.mm,d}}
   if(best)return{mm:best.mm,exact:true};
   const h=snapDim(v,cand,tol);return h?{mm:h.mm,exact:true}:{mm:Math.round(v/10)*10,exact:false}
  };
  // Across a straight member its line is where it is drawn, give or take its edge: an end may stop short of an axis by
  // a column's width, the member itself is not moved onto an axis a size away (ГПЭС М1.9: «В58» 530 below И).
  const acrossTol=Math.min(endTol,Math.max(150,6*scale));
  const memberEnds=line=>{
   const flat=Math.abs(line.a.y-line.b.y)<1.5,upright=Math.abs(line.a.x-line.b.x)<1.5;
   return[line.a,line.b].map(p=>{
    const x=snapMm(toX(p.x),linesX,memberX,upright?acrossTol:endTol),y=snapMm(toY(p.y),linesY,memberY,flat?acrossTol:endTol);
    return{x:x.mm,y:y.mm,exact:x.exact&&y.exact}
   })
  };
  // bare: placed from a label without a leader (written on the thing it names: a flight, a landing).
  const placements=[],bases=[],drawn=new Map(),bare=new Set(),tips=new Map();
  // Marks of the index written in a size of their own (three and more on shelves with slanted leaders): a number on a
  // shelf in the height of the sizes is then a size too.
  // The height of a word read from a picture is known to a quarter, of a text item exactly.
  let own=null;
  const sizeOfDims=t=>Math.abs((Number(t.size)||0)-dimSize)<=dimSize*(t.ocr?0.25:0.1);
  const ownSize=()=>own??(own=local.filter(t=>/^\d{1,3}$/.test(String(t.str).trim())&&!sizeOfDims(t)&&Math.abs(Number(t.angle)||0)<5)
   .filter(t=>{const tg=leaderTarget(t,segments,index,axisSegs,lines);return tg.leader&&tg.diagonal&&tg.shelf}).length>=3);
  // Where a label names its member line: the end of its leader, or the label itself when written along the member (a
  // turned label's "leader" is usually a junction of lines).
  const labelOn=(t,target,line)=>{const frame=textFrame(t),angle=Number(t.angle)||0,led=target.leader&&Math.abs(angle)<5;
   return{line,at:led?{x:target.x,y:target.y}:frame.c,half:led?0:frame.w/2,h:frame.h,angle,along:!(led&&target.diagonal)}};
  const nodes=group.local?nodeBoxes(segments,bbox):null;
  // One label may name two marks on one line: «Бкр 1, Р 1» — a crane beam and its rail. Each mark is placed by the
  // same leader and line.
  const MULTI=/^(?:[А-ЯЁA-Z][а-яёА-ЯЁA-Z]{0,2}\s*\d{1,3}(?:[-.]\d{1,2})?\s*,\s*)+[А-ЯЁA-Z][а-яёА-ЯЁA-Z]{0,2}\s*\d{1,3}(?:[-.]\d{1,2})?$/u;
  const split=local.flatMap(t=>MULTI.test(String(t.str||"").trim())&&!usedTexts.has(t)?String(t.str).split(",").map(p=>({...t,str:p.trim()})):[t]);
  // A label with several leaders names a member at the end of each: a copy of the label for each further leader.
  const further=new Map();
  const labels=split.flatMap(t=>{
   const str=String(t.str||"").trim().replace(/\s+/gu,"");
   if(usedTexts.has(t)||Math.abs(Number(t.angle)||0)>=5||!MARK_LABEL.test(str)&&!(markIndex&&/^\d{1,3}(?:\.\d{1,2})?$/u.test(str)))return[t];
   const more=leaderTarget(t,segments,index,axisSegs,lines).more||[];
   return[t,...more.map(m=>{const c={...t};further.set(c,m);return c})]
  });
  // A bare number of the index written over the shelf of a level mark (029-2025: «41» over «отм. +3,100», whose leader
  // goes to the post of that level) is no leader label: it names the member it is written along, the shelf left out.
  const levels=local.filter(t=>/^отм\.?\s*[+\-−±]?\s*\d/iu.test(String(t.str||"").trim()));
  const levelShelf=(t,tg)=>{
   if(!markIndex||!tg.leader||!Number.isInteger(tg.segment)||!/^\d{1,3}(?:\.\d{1,2})?$/u.test(String(t.str||"").trim())||Math.abs(Number(t.angle)||0)>=5)return null;
   const b=textBox(t),h=b.y1-b.y0;
   const l=levels.map(textBox).find(c=>c.y0>=b.y1-2&&c.y0<=b.y1+h*1.5&&Math.min(c.x1,b.x1)-Math.max(c.x0,b.x0)>0);if(!l)return null;
   const skip=new Set([...index.near({x:b.cx,y:b.y1+2},Math.max(40,l.x1-l.x0))].filter(i=>{const q=segments[i];
    return Math.abs(q.a.y-q.b.y)<0.6&&q.a.y>=b.y1-3&&q.a.y<=l.y0+3&&Math.min(Math.max(q.a.x,q.b.x),l.x1)-Math.max(Math.min(q.a.x,q.b.x),l.x0)>=(l.x1-l.x0)*0.3}));
   // Its leader leaves an end of that shelf.
   const ld=segments[tg.segment];
   if(![...skip].some(i=>{const q=segments[i];return[q.a,q.b].some(e=>[ld.a,ld.b].some(p=>dist(p,e)<3))}))return null;
   skip.add(tg.segment);
   return skip
  };
  const targetOf=t=>{const tg=leaderTarget(t,segments,index,axisSegs,lines),m=further.get(t);if(m)return{...tg,x:m.x,y:m.y,segment:m.segment};
   const sk=levelShelf(t,tg);if(!sk)return tg;
   // Only when a member line runs along it (029-2025: «100» over «отм. +2,840» in open space names the landing at the
   // level's leader).
   const b=textBox(t),on={x:b.cx,y:b.y1+6,leader:false,rail:true,skip:sk},line=memberLine(t,on,segments,lines,new Set([...namedSegs,...sk]));
   return line&&dist(line.a,line.b)>=Math.max(24,(b.x1-b.x0)*2.5)?on:tg};
  for(const t of labels){
   // "К 1" is written with a space on some sheets.
   let mark=String(t.str||"").trim().replace(/^([А-ЯЁA-Z]{1,3}|[А-ЯЁA-Z][а-яё]{1,2})\s+(\d)/u,"$1$2"),byIndex=false;
   // A bare number is a mark of the index of the notes when it stands on a shelf with a slanted leader (a dimension
   // stands on its dimension line, a level on its sign).
   // So is one whose leader ends at a post drawn as a small square, written larger or smaller than the sizes (their
   // extension lines end at posts too).
   let postAt=null;
   if(markIndex&&/^\d{1,3}(?:\.\d{1,2})?$/u.test(mark)&&!usedTexts.has(t)&&Math.abs(Number(t.angle)||0)<5){const tg=targetOf(t);
    postAt=tg.leader&&!(tg.diagonal&&tg.shelf)&&!sizeOfDims(t)?columnSymbol(tg,segments,index):null;
    // A number written over its member line, larger or smaller than the sizes (029-2025: «50» over its beam), is one too.
    if(tg.leader&&tg.diagonal&&tg.shelf&&!(ownSize()&&sizeOfDims(t))||postAt||tg.rail&&!sizeOfDims(t)){mark=markIndex+mark;byIndex=true}}
   // A column base («Бк 4») is not a member: its leader points at the base symbol, which stands at a column. Its place
   // goes with the scheme (from the nearest named axes), for the base details of that column.
   if(BASE_LABEL.test(mark)&&!usedTexts.has(t)){
    const box=textBox(t);
    if(box.cx<bbox.x0-40||box.cx>bbox.x1+40||box.cy<bbox.y0-40||box.cy>bbox.y1+40)continue;
    const target=targetOf(t);if(!target.leader)continue;
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
   let target=targetOf(t);
   const under=nameUnder(t,local);
   let ruledKind=markKind(mark,kinds);
   // «Ф» is a truss in ГОСТ 26047, a post on many КМД sets and on some the index of every mark (Ф1…Ф145 of 355-10:
   // columns, beams, struts, bracing alike). On a scheme of beams or bracing its letter tells nothing: the marks there
   // are members, placed by their lines.
   if(ruledKind==="column"&&kinds===DEFAULT_KINDS&&markCode(mark)?.loose&&(titleKind==="beam"||titleKind==="brace"))ruledKind="beam";
   // The index the notes give every mark («ФП» of 355-10 internal structures, «Т» of 355-11) is the project's own: its
   // letters are not a kind of ГОСТ 26047 (ФП is no truss there). The scheme's title decides, else the drawing.
   const indexed=Boolean(markIndex)&&kinds===DEFAULT_KINDS&&mark.startsWith(markIndex)&&/^\d/u.test(mark.slice(markIndex.length));
   if(indexed)ruledKind=titleKind==="beam"||titleKind==="brace"?"beam":titleKind==="column"?"column":null;
   // The leader of a column mark points at its section symbol, often drawn on a beam line: it stays a column.
   // Only a slanted leader from a level label: line junctions next to a label look like a symbol too.
   // So does the leader of a mark whose letters tell no kind to a post drawn as a small square (ГПЭС АБК: «В152» at a
   // post of a partition, its square on the dashed outline of the partition).
   let symbol=postAt&&ruledKind!=="beam"?postAt:target.leader&&target.diagonal&&Math.abs(Number(t.angle)||0)<5&&(ruledKind==="column"||!ruledKind)&&columnSymbol(target,segments,index,ruledKind||indexed?false:"closed");
   // A slanted leader beside a straight stroke from the label (an extension line of a size) ending at such a square.
   if(!symbol&&!postAt&&target.slant&&Math.abs(Number(t.angle)||0)<5&&(ruledKind==="column"||!ruledKind&&!indexed)){const at=columnSymbol(target.slant,segments,index,ruledKind?false:"closed");
    if(at){symbol=at;target={...target,...target.slant,diagonal:true}}}
   // On a ladder's own plan its mark (letters of no kind: «В124») is the whole ladder, standing upright in the outline
   // its leader touches; its height comes from its section.
   let ladder=null;
   if(!symbol&&ladderPlan&&!ruledKind&&!indexed&&target.leader){const o=outlineOf(segments,target,60)[0];
    ladder=o?{x:(o.x0+o.x1)/2,y:(o.y0+o.y1)/2,w:Math.min(o.x1-o.x0,o.y1-o.y0)}:{x:target.x,y:target.y,w:0};symbol={x:ladder.x,y:ladder.y}}
   if(symbol&&!ruledKind)ruledKind="column";
   if(symbol)target={...target,...symbol};
   // Beams, purlins and bracing on a plan are drawn lines: the ends come from the drawing itself.
   if(!symbol&&(titleKind!=="column"||ruledKind==="beam"||ruledKind==="brace")){
    let line=memberLine(t,target,segments,lines,target.skip?new Set([...namedSegs,...target.skip]):namedSegs);
    // On a local view the frame line runs on past the posts and into the extension lines: the member is between the
    // outermost node symbols on it.
    if(line&&nodes)line=clipToNodes(line,nodes);
    // A framed view: nothing of it lies outside its overall dimensions (the lines run on into the dimension chains).
    if(line&&group.framed){const c=(v,a,b)=>Math.max(Math.min(a,b)-1,Math.min(Math.max(a,b)+1,v));const x0=vAxes[0].pos,x1=vAxes[vAxes.length-1].pos,y0=hAxes[hAxes.length-1].pos,y1=hAxes[0].pos;
     line={...line,a:{x:c(line.a.x,x0,x1),y:c(line.a.y,y0,y1)},b:{x:c(line.b.x,x0,x1),y:c(line.b.y,y0,y1)}}}
    const ends=line&&memberEnds(line);
    if(ends&&Math.hypot(ends[1].x-ends[0].x,ends[1].y-ends[0].y)>=300){
     const straight=Math.abs(line.a.x-line.b.x)<1.5||Math.abs(line.a.y-line.b.y)<1.5;
     const geometry=ruledKind==="brace"||!straight?"brace":"beam",frame=textFrame(t),mid=frame.c;
     const placed={mark,...(under?{name:under}:{}),...(byIndex?{by_index:markIndex}:{}),...(indexed?{mark_index:markIndex}:{}),geometry_type:geometry,kind_label:KIND_NAMES[geometry],
      sheet_point_pt:{x:Math.round(mid.x*10)/10,y:Math.round(mid.y*10)/10},page,
      x_mm:ends[0].x,y_mm:ends[0].y,x2_mm:ends[1].x,y2_mm:ends[1].y,
      axis_x:nearestName(linesX,(line.a.x+line.b.x)/2),axis_y:nearestName(linesY,(line.a.y+line.b.y)/2),
      confidence:ends.every(e=>e.exact)?"medium":"low",
      notes:["Концы по линии элемента на схеме"+(ends.every(e=>e.exact)?"":" — часть концов не на оси, проверьте")]};
     placements.push(placed);drawn.set(placed,labelOn(t,target,line));if(!target.leader)bare.add(placed);else tips.set(placed,{x:target.x,y:target.y});
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
   // A member label turned along a grid line it stands beside (a beam drawn on an axis, its label written along it):
   // the member lies on that line.
   if(ruledKind!=="column"&&!lx&&!ly){const a=Math.abs(Number(t.angle)||0),c=textFrame(t).c,reach=(Number(t.size)||8)*1.7;
    if(Math.abs(a-90)<5)lx=nearestLine(linesX,c.x,reach);else if(a<5)ly=nearestLine(linesY,c.y,reach)}
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
   // A bare number read as a mark by the index (a small dimension on a shelf looks the same): the plan checks it
   // against the marks of the assembly sheets.
   const base={mark,...(under?{name:under}:{}),...(byIndex?{by_index:markIndex}:{}),...(indexed?{mark_index:markIndex}:{}),geometry_type:geometry,kind_label:KIND_NAMES[geometry],
    sheet_point_pt:{x:Math.round(target.x*10)/10,y:Math.round(target.y*10)/10},page};
   if(geometry==="column"){
    const fx=lx?{mm:lx.mm,dim:true}:freeX(target.x),fy=ly?{mm:ly.mm,dim:true}:freeY(target.y);
    if(!lx||!ly)notes.push(fx.dim&&fy.dim?"Не на оси — привязано к ближайшему размеру":"Не на оси — координата по геометрии листа");
    const confidence=ladder||!target.leader||!fx.dim||!fy.dim?"low":lx&&ly&&ruled==="column"?"high":"medium";
    if(ladder)Object.assign(base,{fitting_type:"ladder",...(ladder.w*scale>=400?{diameter_mm:Math.round(ladder.w*scale/10)*10}:{})}),notes.unshift("Стремянка по своей схеме: стоит вертикально в контуре, на который указывает выноска; высота — по разрезу");
    // Kept for the AI step, which may decide the sheet shows beams, not posts.
    const line=lx&&ly?null:spanAlong(target,lx,ly);
    placements.push({...base,x_mm:fx.mm,y_mm:fy.mm,axis_x:lx?.name||nearestName(linesX,target.x),axis_y:ly?.name||nearestName(linesY,target.y),
     confidence,notes,...(line?{line:{x_mm:line.x_mm,y_mm:line.y_mm,x2_mm:line.x2_mm,y2_mm:line.y2_mm}}:{})});
    if(!target.leader)bare.add(placements[placements.length-1]);
    continue
   }
   // Linear members lie on one grid line between two neighbouring lines.
   const span=spanAlong(target,lx,ly);
   if(!span){
    notes.push(lx||ly?"Не найдены соседние оси для концов элемента":"Линейный элемент не привязан к оси — требуется ручная проверка");
    placements.push({...base,x_mm:toX(target.x),y_mm:toY(target.y),x2_mm:toX(target.x),y2_mm:toY(target.y),confidence:"low",notes});
    continue
   }
   const spanned={...base,...span,confidence:target.leader&&ruled?"medium":"low",notes};delete spanned.line_pt;
   placements.push(spanned);if(target.leader)tips.set(spanned,{x:target.x,y:target.y});
   drawn.set(spanned,labelOn(t,target,span.line_pt))
  }
  // Several labels along one member line or one span (struts in a row, crane beams bay after bay drawn as one continuous
  // line, two beams on one axis between two rows): each names the piece of it between the named grid lines on either
  // side; a label the grid line runs through, the two bays around that line. Labels written along a line with no named
  // grid line inside part it half-way between them (the joint is not on the plan: to be checked). A line with all its
  // labels in one bay stays whole.
  const lineOf=d=>{const l=d.line,flat=Math.abs(l.a.y-l.b.y)<1.5;if(!flat&&Math.abs(l.a.x-l.b.x)>=1.5)return null;
   const c=flat?"x":"y",lo=Math.min(l.a[c],l.b[c]),hi=Math.max(l.a[c],l.b[c]);
   // A line drawn a little past an axis (to the face of the steel) is not cut there.
   const end=Math.max(2,600/scale);
   return{l,flat,c,lo,hi,cuts:[lo,...(flat?linesX:linesY).filter(g=>g.name&&g.pt>lo+end&&g.pt<hi-end).map(g=>g.pt).sort((a,b)=>a-b),hi]}};
  const bayOf=(d,{c,cuts})=>{const s=d.at[c];let k=cuts.findIndex((v,i)=>i<cuts.length-1&&s<=cuts[i+1]);if(k<0)k=cuts.length-2;
   let a=k,b=k+1;if(a>0&&s-cuts[a]<d.half)a--;else if(b<cuts.length-1&&cuts[b]-s<d.half)b++;return[cuts[a],cuts[b]]};
  // Written along the line: turned as the line runs, and not a label with a slanted leader.
  const along=(d,flat)=>{const a=Math.abs(d.angle)%180;return d.along&&(flat?Math.min(a,180-a)<5:Math.abs(a-90)<5)};
  const cutTo=(p,L,[a,b],halfway)=>{
   const ends=memberEnds(L.flat?{a:{x:a,y:L.l.a.y},b:{x:b,y:L.l.a.y}}:{a:{x:L.l.a.x,y:a},b:{x:L.l.a.x,y:b}});
   Object.assign(p,{x_mm:ends[0].x,y_mm:ends[0].y,x2_mm:ends[1].x,y2_mm:ends[1].y,confidence:!halfway&&ends.every(e=>e.exact)?"medium":"low",
    ...(L.flat?{axis_x:nearestName(linesX,(a+b)/2)}:{axis_y:nearestName(linesY,(a+b)/2)}),
    notes:[halfway?"Несколько марок на одной линии без оси между ними — граница посередине между надписями, проверьте":
     "Линия общая с соседними марками — участок между осями у надписи"+(ends.every(e=>e.exact)?"":", часть концов не на оси, проверьте")]});
   drawn.get(p).cut=true
  };
  const rows=new Map();
  for(const [p,d] of drawn){if(!lineOf(d))continue;const k=[d.line.a.x,d.line.a.y,d.line.b.x,d.line.b.y].map(Math.round).join();(rows.get(k)||rows.set(k,[]).get(k)).push(p)}
  for(const list of rows.values()){
   if(list.length<2)continue;
   const L=lineOf(drawn.get(list[0])),{c,lo,hi}=L;
   let pieces,halfway=false;
   if(L.cuts.length>2)pieces=list.map(p=>bayOf(drawn.get(p),L));
   else{
    const written=list.filter(p=>along(drawn.get(p),L.flat)).sort((p,q)=>drawn.get(p).at[c]-drawn.get(q).at[c]),gap=Math.max(0,...written.map(p=>drawn.get(p).h))*3;
    const stops=[];for(let i=1;i<written.length;i++){const u=drawn.get(written[i-1]).at[c],v=drawn.get(written[i]).at[c];if(v-u>gap)stops.push((u+v)/2)}
    if(!stops.length)continue;
    const bounds=[lo,...stops,hi];halfway=true;
    pieces=list.map(p=>{const d=drawn.get(p);if(!along(d,L.flat))return[lo,hi];const k=Math.max(0,bounds.findIndex((v,i)=>i<bounds.length-1&&d.at[c]<=bounds[i+1]));return[bounds[k],bounds[Math.min(k+1,bounds.length-1)]]})
   }
   if(new Set(pieces.map(String)).size<2)continue;
   list.forEach((p,i)=>{if(pieces[i][0]!==lo||pieces[i][1]!==hi)cutTo(p,L,pieces[i],halfway)})
  }
  // A mark found a bay long elsewhere on the scheme is as long here: a label alone on a line through several bays names
  // the bay it stands in.
  const shortest=new Map();
  for(const p of placements){const n=Math.hypot((p.x2_mm??p.x_mm)-p.x_mm,(p.y2_mm??p.y_mm)-p.y_mm);if(n>0&&!(shortest.get(p.mark)<=n))shortest.set(p.mark,n)}
  for(const [p,d] of drawn){
   const L=!d.cut&&lineOf(d);if(!L||L.cuts.length<3)continue;
   if(!(shortest.get(p.mark)<Math.hypot(p.x2_mm-p.x_mm,p.y2_mm-p.y_mm)*0.6))continue;
   cutTo(p,L,bayOf(d,L),false)
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
   // A stair's own plan (ГПЭС М1.25 «Схема расположения металлической лестницы в осях А/6»): a flight is named by the
   // mark written on its treads without a leader (that label is no post); on a plan drawn out of scale its ends rest on
   // the ends of the sizes along its run within a step and a half (to scale they are as drawn: ПК-05 КМ1, the ladder
   // of the series 240 mm past the size of the upper flight). Two flights side by side whose ends meet on one line make a dog-leg stair: the
   // one lower on the sheet climbs from the ground to the landing at that line, the other from the landing on up (a
   // reading, to be checked by the section). The landing spans both flights, from that line to the end of the size
   // beyond it, named by the mark written in it. A railing («огр.») is put by the end of its leader: along a flight
   // (sloped with it), on a side of the landing, or past the free ends (at the top the stair arrives at).
   const stairPlan=/лестниц|марш/iu.test(title||"");
   const runDims=stairPlan?dimensionsOf(sized,segments):[];
   const span=f=>[Math.min(f.a,f.b),Math.max(f.a,f.b)];
   const inFlight=(f,p,pad=0)=>{const u=f.flat?p.y:p.x,v=f.flat?p.x:p.y,[a,b]=span(f);return u>=a-pad&&u<=b+pad&&v>=f.lo-pad&&v<=f.hi+pad};
   // The mark written on it (its leader, if any, not slanted off to something else; no «огр.» under it): what was placed
   // of that mark there goes.
   const takeName=inside=>{
    const t=local.find(t=>{const m=String(t.str||"").trim();if(usedTexts.has(t)||!MARK_LABEL.test(m)||notMark(m,aMarks)||nameUnder(t,local))return false;
     const b=textBox(t);return inside({x:b.cx,y:b.cy},0)&&!targetOf(t).diagonal});
    if(!t)return null;
    const mark=String(t.str).trim().replace(/^([А-ЯЁA-Z]{1,3}|[А-ЯЁA-Z][а-яё]{1,2})\s+(\d)/u,"$1$2");
    for(const p of placements.filter(p=>p.mark===mark&&p.sheet_point_pt&&inside(p.sheet_point_pt,Math.max(...flights.map(f=>f.step)))))placements.splice(placements.indexOf(p),1);
    return mark};
   if(stairPlan&&chain)for(const f of flights){const ends=runDims.filter(d=>d.flat===!f.flat).flatMap(d=>[d.lo,d.hi]);
    for(const k of ["a","b"]){const e=ends.reduce((m,v)=>Math.abs(v-f[k])<Math.abs(m-f[k])?v:m,Infinity);if(Math.abs(e-f[k])<=f.step*1.5)f[k]=e}}
   // The dog-leg: the line where the ends of the two flights meet, and the side of the landing beyond it.
   let leg=null;
   if(stairPlan&&flights.length===2&&flights[0].flat===flights[1].flat){
    const [f0,f1]=flights,[a0,b0]=span(f0),[a1,b1]=span(f1),tol=Math.max(f0.step,f1.step);
    const gap=Math.max(f0.lo,f1.lo)-Math.min(f0.hi,f1.hi),lo=Math.min(f0.lo,f1.lo),hi=Math.max(f0.hi,f1.hi);
    // Flights of one run meet on both sides: the landing is where the far edge spans both of them (the top the stair
    // arrives at, beyond the other ends, spans the upper one only).
    const cover=u=>{const iv=segments.filter(q=>flights[0].flat?Math.abs(q.a.y-q.b.y)<0.3&&Math.abs(q.a.y-u)<=1.5:Math.abs(q.a.x-q.b.x)<0.3&&Math.abs(q.a.x-u)<=1.5)
      .map(q=>flights[0].flat?[Math.min(q.a.x,q.b.x),Math.max(q.a.x,q.b.x)]:[Math.min(q.a.y,q.b.y),Math.max(q.a.y,q.b.y)]).map(([a,b])=>[Math.max(a,lo),Math.min(b,hi)]).filter(([a,b])=>b>a).sort((p,q)=>p[0]-q[0]);
     let sum=0,end=lo;for(const [a,b] of iv){if(b>end){sum+=b-Math.max(a,end);end=b}}return sum/(hi-lo)};
    const sides=[Math.abs(b0-b1)<=tol?{e:(b0+b1)/2,dir:1}:null,Math.abs(a0-a1)<=tol?{e:(a0+a1)/2,dir:-1}:null].filter(Boolean).map(at=>{
     const d=runDims.filter(d=>d.flat===!f0.flat).map(d=>({o:at.dir>0?d.lo:d.hi,far:at.dir>0?d.hi:d.lo})).filter(x=>Math.abs(x.o-at.e)<=tol).sort((p,q)=>Math.abs(p.o-at.e)-Math.abs(q.o-at.e))[0];
     return d?{...at,e:d.o,far:d.far,cover:cover(d.far)}:null}).filter(Boolean).sort((p,q)=>q.cover-p.cover);
    const at=sides[0];
    if(at&&at.cover>=0.8&&gap<=Math.max(f0.hi-f0.lo,f1.hi-f1.lo)){
     for(const f of flights)f[at.dir>0?(f.a>f.b?"a":"b"):(f.a<f.b?"a":"b")]=at.e;
     leg={e:at.e,far:at.far,dir:at.dir,lo,hi,free:at.dir>0?Math.min(a0,a1):Math.max(b0,b1)}
    }
   }
   const slope=stairPlan&&texts.map(t=>/^(\d{2})\s*°$/u.exec(String(t.str||"").trim())).find(m=>m&&+m[1]>=30&&+m[1]<=75);
   flights.forEach((f,i)=>{
    // Along the run: the way the arrow on its line points (ГОСТ 21.201: the climb), else from the sheet-lower end up.
    // A dog-leg's flights climb to their landing and away from it.
    const arrow=climbOf(f,segments,glyphs),dir=leg?(i===0?leg.dir:-leg.dir):arrow,up=dir||-1,[s0,s1]=up<0?[f.b,f.a]:[f.a,f.b];
    const [p,q]=f.flat?[{x:f.mid,y:s0},{x:f.mid,y:s1}]:[{x:s0,y:f.mid},{x:s1,y:f.mid}];
    // The levels of its ends: the marks of the landings it starts and ends at (a stack of marks — one per tier).
    // One mark nearest to both ends names the landing at the nearer one; the other end is the next level.
    let from=marks.nearest(p),to=marks.nearest(q);
    if(from&&to&&from.stack===to.stack){if(from.d<to.d)to=null;else from=null}
    from=from&&from.v;to=to&&to.v;
    const named=stairPlan?takeName((pt,m)=>inFlight(f,pt,m)):null,x0=toX(p.x),y0=toY(p.y),x1=toX(q.x),y1=toY(q.y);
    placements.push({mark:named||"Марш",name:"Марш лестницы",geometry_type:"beam",kind_label:"Марш",page,fitting_type:"flight",diameter_mm:Math.round((f.hi-f.lo)*scale/10)*10,
     scheme_group:"stairs",flight:{order:i,of:flights.length,...(arrow?{arrow:true}:{}),...(from?{from_mm:from}:{}),...(to?{to_mm:to}:{}),
      ...(leg?{stair:"dog-leg",run_mm:Math.round(Math.hypot(x1-x0,y1-y0)),...(slope?{slope_deg:+slope[1]}:{})}:{})},x_mm:x0,y_mm:y0,x2_mm:x1,y2_mm:y1,confidence:"low",
     notes:[leg?"Марш двухмаршевой лестницы по ступеням на схеме: "+(i===0?"нижний (ниже по листу) — с земли на площадку":"верхний — с площадки наверх")+", проверьте по разрезу":
      dir?"Марш по ступеням на схеме, подъём по стрелке":"Марш по ступеням на схеме; направление подъёма — с нижнего по листу конца, проверьте"]})
   });
   if(leg){
    const pad=Math.max(...flights.map(f=>f.step)),flat=flights[0].flat;
    // In sheet points: u along the run, v across it.
    const pt=(u,v)=>flat?{x:v,y:u}:{x:u,y:v},uv=p=>flat?{u:p.y,v:p.x}:{u:p.x,v:p.y};
    const [u0,u1]=[Math.min(leg.e,leg.far),Math.max(leg.e,leg.far)],inLanding=(p,m=0)=>{const {u,v}=uv(p);return u>=u0-m&&u<=u1+m&&v>=leg.lo-m&&v<=leg.hi+m};
    const named=takeName((p,m)=>inLanding(p,m));
    const A=pt(u0,(leg.lo+leg.hi)/2),B=pt(u1,(leg.lo+leg.hi)/2),C=pt(u0,leg.lo),D=pt(u0,leg.hi);
    const [x0,y0,x1,y1]=[toX(A.x),toY(A.y),toX(B.x),toY(B.y)],across=Math.round(Math.hypot(toX(D.x)-toX(C.x),toY(D.y)-toY(C.y)));
    const long=across>Math.hypot(x1-x0,y1-y0);
    placements.push({mark:named||"Площадка",name:"Площадка лестницы",geometry_type:"beam",kind_label:"Площадка",page,fitting_type:"deck",scheme_group:"platforms",
     ...(long?{x_mm:Math.round((x0+x1)/2),y_mm:toY(C.y),x2_mm:Math.round((x0+x1)/2),y2_mm:toY(D.y),diameter_mm:Math.round(Math.hypot(x1-x0,y1-y0))}:{x_mm:x0,y_mm:y0,x2_mm:x1,y2_mm:y1,diameter_mm:across}),
     ...(flat?{x_mm:toX(C.x),y_mm:Math.round((y0+y1)/2),x2_mm:toX(D.x),y2_mm:Math.round((y0+y1)/2)}:{}),
     stair:"landing",confidence:"low",notes:["Промежуточная площадка двухмаршевой лестницы: между маршами, до конца размера за ними; высота — по маршам, проверьте по разрезу"]});
    // Railings by the ends of their leaders.
    for(const r of placements.filter(p=>p.name==="Ограждение"&&tips.has(p)&&p.x2_mm!==undefined)){
     const tip=tips.get(r),{u,v}=uv(tip);
     const dist=f=>{const [a,b]=span(f);return Math.max(0,a-u,u-b)*4+Math.max(0,f.lo-v,v-f.hi)};
     const f=flights.slice().sort((p,q)=>dist(p)-dist(q))[0],flatR=Math.abs(r.y_mm-r.y2_mm)<1,alongRun=flat?!flatR:flatR;
     const setU=(a,b)=>{const pa=pt(a,v),pb=pt(b,v);if(flat){r.y_mm=toY(pa.y);r.y2_mm=toY(pb.y)}else{r.x_mm=toX(pa.x);r.x2_mm=toX(pb.x)}};
     // Across the run: on the edge of the landing nearer its leader, the whole width (the leader of a turned label may
     // end at its shelf, a little off the edge).
     if(alongRun?inLanding(tip,pad):u>=u0-pad*2.5&&u<=u1+pad*2.5&&v>=leg.lo-pad&&v<=leg.hi+pad){r.stair="landing";if(alongRun)setU(u0,u1);else{const e=Math.abs(u-u0)<Math.abs(u-u1)?u0:u1,a=pt(e,leg.lo),b=pt(e,leg.hi);
      if(flat){r.x_mm=toX(a.x);r.x2_mm=toX(b.x);r.y_mm=r.y2_mm=toY(a.y)}else{r.y_mm=toY(a.y);r.y2_mm=toY(b.y);r.x_mm=r.x2_mm=toX(a.x)}}}
     else if(alongRun&&f&&inFlight(f,tip,pad)){const i=flights.indexOf(f),[a,b]=span(f),cl=i===0?leg.dir:-leg.dir;r.stair="flight";r.stair_flight=i;cl>0?setU(a,b):setU(b,a)}
     else if(alongRun&&(leg.dir>0?u<leg.free:u>leg.free)){
      // Past the free ends: on the top the stair arrives at, as far as the size beyond them.
      const d=runDims.filter(d=>d.flat===!flat).find(d=>Math.abs((leg.dir>0?d.hi:d.lo)-leg.free)<=pad&&(leg.dir>0?d.lo<=u+pad:d.hi>=u-pad));
      r.stair="top";if(d)setU(leg.dir>0?leg.free:d.hi,leg.dir>0?d.lo:leg.free)}
     if(r.stair)Object.assign(r,{fitting_type:"railing",diameter_mm:1000,scheme_group:"guards"});
     if(r.stair)r.notes=[...(r.notes||[]),"Ограждение лестницы: "+(r.stair==="flight"?"вдоль марша, по его уклону":r.stair==="landing"?"на промежуточной площадке":"наверху, у выхода с лестницы")+", проверьте по разрезу"]
    }
   }
  }
  // One plan for several tiers («балок на отм. +5,500; +11,100»): its members at each of them.
  const tiers=titleLevels(title);
  const onTier=(v,k)=>v.length===tiers.length?[v[k]]:v.length===1?[v[0]+tiers[k]-tiers[0]]:v;
  if(group.local&&tiers.length>=2){const one=placements.splice(0);tiers.forEach((z,k)=>{for(const p of one)placements.push(p.geometry_type==="column"?{...p}:{...p,z0_mm:z,z1_mm:z,levels_from:"отметка в названии схемы",...(p.flight?{flight:{...p.flight,tier:z,
   // A stack of marks at a landing names it on each tier, in the order of the title's levels.
   // A single mark is written for the first tier: the others are as far apart as the tiers.
   ...(p.flight.from_mm?{from_mm:onTier(p.flight.from_mm,k)}:{}),...(p.flight.to_mm?{to_mm:onTier(p.flight.to_mm,k)}:{})}}:{})})})}
  // A location plan of platforms, stairs and porches: the hatched outline of each structure with its level.
  const footprints=!group.local&&/расположения\s+(?:площад|лестниц|крыл)/iu.test(title||"")?extractFootprints({texts,segments,bbox,toX,toY,target:t=>leaderTarget(t,segments,index,axisSegs,lines)}):[];
  // A structure found by its outline is placed by it: the mark read as a member line beside it is dropped.
  if(footprints.length){const drawn=new Set(footprints.map(f=>f.mark).filter(Boolean));for(let i=placements.length-1;i>=0;i--)if(drawn.has(placements[i].mark))placements.splice(i,1);
   placements.push(...footprintPlacements(footprints,page))}
  schemes.push({title,bbox,scaleMmPerPt:Math.round(scale*1000)/1000,...(calibration?{calibration}:{}),
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

module.exports={extractScheme,fixReadSizes,leaderTarget,buildIndex,markIndexOf,axisFromBubble,dimensionScale,dimensionsOf,flightsOf,climbOf,levelMarksNear,nodeBoxes,titleLevels,columnSymbol,textBox,textFrame,memberLine,buildLineIndex,DEFAULT_KINDS,KIND_NAMES,notMark,aMarksOn};
