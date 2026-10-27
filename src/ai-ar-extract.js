"use strict";
/*
 * IR Project: АР read from its sheets without AI (the engineer, 25.10.2026: «Ар чертеж вообще ничего не
 * раставляется»; «сэндвич панель (если есть цвет, то и цвет тоже), окна, все 100% должен показывать»).
 * - specifications of sandwich panels («Спецификация наружных сэндвич-панелей (RAL 7047)»): a position «ПН-1», its
 *   size from the name «ПС 8260.1190.150» (length.width.thickness), the colours from the code
 *   «…(ПЭ-RAL2008-0.5/ПЭ-RAL9003-0.5)» (outside/inside) or from the title of its table, the count;
 * - specifications of windows, doors and gates: «ОСвп-П-1160х3530» and «ДБН 2080х1280» (height×width of the
 *   block), «ВМ П Р С Г К 3600-4000» (height-width), «О-П (6000 х 3600)» (width×height);
 * - schemes of panels on the facades: a view is the field above its row of axis bubbles; every label «ПН-30» is one
 *   panel in the rectangle of its joints (the hatching inside a panel is not a joint), from the line under it to the
 *   line over it (dimension lines are not), heights by the level marks of the view, along the wall by the bubbles.
 */
const {bubbleRows,levelOf,levelOffset,fit}=require("./ai-section-extract");
const {textBox}=require("./ai-scheme-extract");

const POS=/^([А-ЯЁ]{1,3})-(\d{1,3}[а-я]?)$/u;
const PANEL_NAME=/П[СCК]\s*(\d{3,5})[.,](\d{3,4})[.,](\d{2,3})/u;
// RAL codes in a text: RAL Classic «RAL 7047», «ПЭ-RAL7047-0.5» (the coating's thickness after it) — "7047"; RAL Design
// System+ «RAL 210 50 15», «RAL 210-50-15» — "210 50 15" (hue, lightness, chroma); RAL Effect «RAL 110-M» — "110-M".
const RAL=/RAL\s*(?:D\d\s+)?(\d{3})(?:[\s-](\d{2})[\s-](\d{2})(?!\d)|-([1-6M])(?![\dA-Za-zА-Яа-я])|(\d)(?!\d))/giu;
const ralCodes=str=>[...String(str||"").matchAll(RAL)].map(m=>m[2]?m[1]+" "+m[2]+" "+m[3]:m[4]?m[1]+"-"+m[4].toUpperCase():m[1]+m[5]);
const horizontalText=t=>Math.abs(t.angle||0)<10;

// One row of a table: the texts on the line of its position, to the right of it.
const rowOf=(texts,p,span)=>texts.filter(o=>o!==p&&Math.abs(o.y-p.y)<3&&o.x>p.x&&o.x<p.x+span);
// The nearest title above a position of its table.
const titleOf=(titles,p)=>titles.filter(t=>t.y<p.y&&Math.abs(t.x-p.x)<420).sort((a,b)=>b.y-a.y)[0]||null;

function panelSpec(texts){
 const titles=texts.filter(t=>/Спецификация.*панел/iu.test(String(t.str)));
 const out=[];
 for(const p of texts){
  const m=POS.exec(String(p.str).trim());if(!m||!horizontalText(p))continue;
  const row=rowOf(texts,p,620),nameT=row.find(o=>PANEL_NAME.test(String(o.str)));if(!nameT)continue;
  const n=PANEL_NAME.exec(String(nameT.str)),title=titleOf(titles,p);
  const count=row.filter(o=>o.x>nameT.x+20&&/^\d{1,4}$/.test(String(o.str).trim())).sort((a,b)=>a.x-b.x)[0];
  // The code is written over the row (the cell holds two lines): «ТСП-Z-150-1190-Н-П-МВ (ПЭ-RAL2008-0.5/…)».
  const code=texts.filter(o=>o.y<=p.y+1&&o.y>p.y-14&&o.x>=p.x-5&&o.x<nameT.x&&/RAL\s*\d{3}|ТСП|^\S*-\d{2,3}-\d{3,4}-/iu.test(String(o.str))).sort((a,b)=>b.y-a.y)[0];
  const rals=code?ralCodes(code.str):[],own=title?ralCodes(title.str):[];
  out.push({at:p,pos:m[1]+"-"+m[2],kind:m[1],length_mm:Number(n[1]),width_mm:Number(n[2]),thickness_mm:Number(n[3]),
   ral:rals[0]||own[0]||"",...(rals[1]?{ral_inside:rals[1]}:{}),count:count?Number(count.str):null,
   name:String(nameT.str).replace(/[-\s]+$/u,"").trim(),...(code?{code:String(code.str).trim()}:{}),table:title?String(title.str).trim():""})
 }
 return out
}
// «ОСвп-П-1160х3530» and «ДБН 2080х1280»: height×width; «О-П (6000 х 3600)»: width×height as drawn; gates
// «ВМ П Р С Г К 3600-4000»: height-width.
function fillSpec(texts){
 const out=[];
 for(const p of texts){
  const str=String(p.str).trim(),m=/^(ОК|Д|В|ВР|ДВ)-(\d{1,3}[а-я]?)$/u.exec(str);if(!m||!horizontalText(p))continue;
  const kind=m[1]==="ОК"?"window":m[1]==="Д"||m[1]==="ДВ"?"door":"gate";
  const row=rowOf(texts,p,480);let w=0,h=0,name="";
  for(const o of row){
   const s=String(o.str),br=/\(\s*(\d{3,5})\s*[хx×]\s*(\d{3,5})\s*\)/u.exec(s),hw=/(\d{3,5})\s*[хx×]\s*(\d{3,5})/u.exec(s),gate=/^В[МР]\s.*?(\d{3,5})\s*-\s*(\d{3,5})$/u.exec(s);
   if(br){w=Number(br[1]);h=Number(br[2]);name=s.trim();break}
   if(gate){h=Number(gate[1]);w=Number(gate[2]);name=s.trim();break}
   if(hw&&!/ГОСТ/u.test(s)){h=Number(hw[1]);w=Number(hw[2]);name=s.trim();break}
  }
  if(!w||!h)continue;
  const count=row.filter(o=>/^\d{1,3}$/.test(String(o.str).trim())).sort((a,b)=>a.x-b.x).find(o=>o.x>p.x+200);
  out.push({pos:str,kind,width_mm:w,height_mm:h,name,count:count?Number(count.str):null})
 }
 return out
}

// Positions of lines across a label; a run of four and more at one spacing is hatching, not a joint.
function uniq(list){const out=[];for(const v of list.sort((a,b)=>a-b))if(!out.length||v-out[out.length-1]>.2)out.push(v);return out}
function hatching(xs){
 const hatch=new Set();
 for(let i=0;i+3<xs.length;){
  let j=i+1;const g=xs[i+1]-xs[i];
  if(g<1.8||g>9){i++;continue}
  while(j+1<xs.length&&Math.abs(xs[j+1]-xs[j]-g)<=.4)j++;
  if(j-i>=3){for(let k=i;k<=j;k++)hatch.add(xs[k]);i=j}else i++
 }
 return hatch
}
// A dimension line has its number written on it.
function dimensionLine(h,numbers){
 return numbers.some(t=>{const b=textBox(t);return b.angle===0&&b.y1<=h.y+.5&&b.y1>=h.y-8&&b.cx>=h.x0&&b.cx<=h.x1})
}
// A panel drawn as its own rectangle: the edges under and over its label start and end together.
// A panel under a slope of a lower roof is cut along it: its lower edge slopes (its height at its middle).
function edgesAround(b,horiz,scale,slopes=[],sized=null){
 const min=250/scale,max=14000/scale,fits=h=>h.x0<=b.x0+1&&h.x1>=b.x1-1&&h.x1-h.x0>=min&&h.x1-h.x0<=max;
 const at=h=>h.ya===undefined?h:{...h,y:h.ya+(h.yb-h.ya)*((h.x0+h.x1)/2-h.x0)/(h.x1-h.x0),slope:true};
 const below=[...horiz,...slopes].map(at).filter(h=>h.y>b.y1-.3&&h.y-b.y1<max&&fits(h)).sort((p,q)=>p.y-q.y).slice(0,8);
 const above=horiz.filter(h=>h.y<b.y0+.3&&b.y0-h.y<max&&fits(h)).sort((p,q)=>q.y-p.y).slice(0,8);
 const all=[];
 for(const lo of below)for(const hi of above){
  if(Math.abs(lo.x0-hi.x0)>.6||Math.abs(lo.x1-hi.x1)>.6||lo.y-hi.y<min)continue;
  all.push({l:(lo.x0+hi.x0)/2,r:(lo.x1+hi.x1)/2,top:hi.y,bottom:lo.y,...(lo.slope?{cut:{l:lo.ya,r:lo.yb}}:{})})
 }
 // The smallest rectangle round the label, the one of the size of its specification first.
 all.sort((p,q)=>p.bottom-p.top-(q.bottom-q.top));
 return(sized&&all.find(sized))||all[0]||null
}
// A panel whose top edge is its own and its lower edge is broken (at a corner of an opening, along a slope): the
// sides that go down from the ends of the top edge end at its bottom. Cut along a slope only where both ends lie on a
// sloping line; sides of different length otherwise are the corner of a door or a window in the panel (its hole is
// cut by the block placed there), the panel goes down by its longer side.
function sidesAround(b,horiz,vert,scale,sized=null,slopes=[]){
 const min=250/scale,max=14000/scale;
 const onSlope=(x,y)=>slopes.some(s=>x>=s.x0-1&&x<=s.x1+1&&Math.abs(s.ya+(s.yb-s.ya)*(x-s.x0)/(s.x1-s.x0)-y)<=.8);
 const above=horiz.filter(h=>h.y<b.y0+.3&&b.y0-h.y<max&&h.x0<=b.x0+1&&h.x1>=b.x1-1&&h.x1-h.x0>=min&&h.x1-h.x0<=max).sort((p,q)=>q.y-p.y).slice(0,4);
 for(const hi of above){
  const side=x=>vert.filter(v=>Math.abs(v.x-x)<=.5&&Math.abs(v.y0-hi.y)<=.6&&v.y1>b.y1+.3).sort((p,q)=>q.y1-p.y1)[0];
  const sl=side(hi.x0),sr=side(hi.x1);if(!sl||!sr)continue;
  const flat=Math.abs(sl.y1-sr.y1)<=.6,sloped=!flat&&onSlope(hi.x0,sl.y1)&&onSlope(hi.x1,sr.y1);
  const rect={l:hi.x0,r:hi.x1,top:hi.y,bottom:flat||sloped?(sl.y1+sr.y1)/2:Math.max(sl.y1,sr.y1),...(sloped?{cut:{l:sl.y1,r:sr.y1}}:{})};
  if(!sized||sized(rect))return rect
 }
 return null
}
// A panel whose outline the drawing breaks — a gate or a grille cut in it, a grille drawn over its joint (ГПЭС, АР-1
// лист 9: «ПН-27» inside the grille 1000×1400 over a gate): the rectangle of the size its specification gives round its
// label. Its sides — joints, the lines where the lines along the tiers end (hatching does not end them); its ends — lines
// across it, however short the pieces of them left; of several, the one whose lines cover it most.
function sizedAround(b,vert,horiz,scale,kinds,numbers){
 const tol=40/scale,lines=horiz.filter(h=>!dimensionLine(h,numbers));
 const near=(v,reach)=>v.y1>b.cy-reach&&v.y0<b.cy+reach&&Math.abs(v.x-b.cx)<reach;
 let best=null;
 for(const q of kinds)for(const [w,h] of [[q.width_mm,q.length_mm],[q.length_mm,q.width_mm]]){
  if(!(w>0&&h>0))continue;
  const W=w/scale,H=h/scale,ends=lines.filter(l=>Math.abs(l.y-b.cy)<H+1);
  const joints=uniq(vert.filter(v=>near(v,Math.max(W,H)+1)&&ends.some(l=>(Math.abs(l.x0-v.x)<=.6||Math.abs(l.x1-v.x)<=.6)&&l.y>=v.y0-1&&l.y<=v.y1+1)).map(v=>v.x));
  for(const l of joints.filter(x=>x<b.cx))for(const r of joints.filter(x=>x>b.cx&&Math.abs(x-l-W)<=tol)){
   const across=ends.filter(e=>Math.min(e.x1,r)-Math.max(e.x0,l)>=100/scale),ys=uniq(across.map(e=>e.y));
   const cover=y=>{let s=0,need=l;for(const e of across.filter(e=>Math.abs(e.y-y)<=.3).sort((p,q)=>p.x0-q.x0)){const a=Math.max(need,e.x0),z=Math.min(r,e.x1);if(z>a)s+=z-a;need=Math.max(need,z)}return s/(r-l)};
   const side=x=>{let s=0;for(const v of vert.filter(v=>Math.abs(v.x-x)<=.3))s+=Math.max(0,Math.min(v.y1,b.cy+H)-Math.max(v.y0,b.cy-H));return s};
   for(const top of ys.filter(y=>y<b.y0))for(const bottom of ys.filter(y=>y>b.y1&&Math.abs(y-top-H)<=tol)){
    const score=Math.abs(r-l-W)+Math.abs(bottom-top-H)-(cover(top)+cover(bottom))*2-Math.min(1,(side(l)+side(r))/(2*H));
    if(!best||score<best.score)best={score,rect:{l,r,top,bottom}}
   }
  }
 }
 return best?.rect||null
}
// Panels drawn by one line along a tier: the joints left and right of the label (not its hatching), the lines under
// and over it (not dimension lines).
function jointsAround(b,vert,horiz,numbers,win){
 const xs=uniq(vert.filter(v=>v.y0<=b.cy&&v.y1>=b.cy&&Math.abs(v.x-b.cx)<win).map(v=>v.x)),hx=hatching(xs);
 const l=xs.filter(x=>!hx.has(x)&&x<b.x0-.3).at(-1),r=xs.find(x=>!hx.has(x)&&x>b.x1+.3);
 if(l===undefined||r===undefined)return null;
 const w=r-l,mid0=l+w*.3,mid1=r-w*.3;
 const ys=uniq(horiz.filter(h=>h.x0<=mid0&&h.x1>=mid1&&Math.abs(h.y-b.cy)<win*2&&!dimensionLine(h,numbers)).map(h=>h.y)),hy=hatching(ys);
 const top=ys.filter(y=>!hy.has(y)&&y<b.y0-.3).at(-1),bottom=ys.find(y=>!hy.has(y)&&y>b.y1+.3);
 return top===undefined||bottom===undefined?null:{l,r,top,bottom}
}
function along(bubbles,dims,scale){
 const left=[0];
 for(let i=1;i<bubbles.length;i++){
  const raw=(bubbles[i].pt-bubbles[i-1].pt)*scale,near=dims.filter(d=>Math.abs(d-raw)<=raw*.04).sort((a,b)=>Math.abs(a-raw)-Math.abs(b-raw))[0];
  left.push(left[i-1]+(near||Math.round(raw/50)*50))
 }
 return left
}
// A facade is drawn at one scale both ways: at the scale of its level marks most distances between its bubbles are the
// dimensions written under them (a plan with marks of floors here and there gives a scale of nothing).
function sameScale(bubbles,dims,scale){
 let n=0;for(let i=1;i<bubbles.length;i++){const raw=(bubbles[i].pt-bubbles[i-1].pt)*scale;if(dims.some(d=>Math.abs(d-raw)<=raw*.04))n++}
 return n>=Math.max(1,(bubbles.length-1)/2)
}
const LETTERS="АБВГДЕЖЗИКЛМНПРСТУФХЦЧШЩЭЮЯ";
const numbered=n=>/\d/.test(String(n));
const axisRank=n=>{const m=/(\d+)(?:\/(\d+))?/.exec(String(n));return m?Number(m[1])+(m[2]?Number(m[2])/100:0):1000+LETTERS.indexOf(String(n).toUpperCase())};
// The view a text belongs to: the nearest row of bubbles under it; of two views side by side (their rows within 100 pt
// of height), the one it stands over (a window at the end of one facade is not of the facade drawn next to it).
const ownerOf=rows=>(x,y)=>{
 const near=rows.filter(r=>r.y>y&&r.y-y<1300&&x>=r.x0-260&&x<=r.x1+260).sort((a,b)=>a.y-b.y),out=r=>Math.max(0,r.x0-x,x-r.x1)>30;
 const best=near[0]||null;if(!best||!out(best))return best;
 return near.find(r=>r.y-best.y<100&&!out(r))||best};
// Rows of axis bubbles only: names that do not repeat, all numbers or all letters, in their order along the row (sizes of
// windows in circles, «24 26 21 18», or marks of nodes, «54 54 54», are not axes and would take the labels above them).
const axisRows=(texts,segments)=>bubbleRows(texts,segments).filter(r=>{const n=r.items.slice().sort((a,b)=>a.x-b.x).map(t=>String(t.str).trim().toUpperCase()),k=n.map(axisRank);
 return n.length>=2&&new Set(n).size===n.length&&new Set(n.map(numbered)).size===1&&(k.every((v,i)=>!i||v>k[i-1])||k.every((v,i)=>!i||v<k[i-1]))});

// Openings of a wall of panels: what no panel covers under a panel over it, column by column between the joints of
// the panels, joined along the wall where they share their top and bottom; then cut down to its own sides, the lines
// that start at its top and go down its height (pieces of panels beside it without a label are not the opening). Under
// a panel cut along a lower roof is that roof, not an opening. One whose bottom is the foot of the wall starts there.
function openingRects(panels,vert,horiz,scale,u,z,numbers=[],texts=[],ticks=[]){
 if(panels.length<4)return[];
 const rects=panels.map(p=>p.rect),xs=[];
 for(const v of rects.flatMap(r=>[r.l,r.r]).sort((a,b)=>a-b))if(!xs.length||v-xs[xs.length-1]>.4)xs.push(v);
 const foot=Math.max(...rects.map(r=>r.bottom)),cells=[];
 for(let i=0;i+1<xs.length;i++){
  const c0=xs[i],c1=xs[i+1];if((c1-c0)*scale<150)continue;
  let y=foot;
  for(const r of rects.filter(r=>r.l<=c0+.4&&r.r>=c1-.4).sort((a,b)=>b.bottom-a.bottom)){
   if(!r.cut&&(y-r.bottom)*scale>=250)cells.push({l:c0,r:c1,top:r.bottom,bottom:y});
   y=Math.min(y,r.top)
  }
 }
 const merged=[];
 for(const c of cells.sort((a,b)=>a.top-b.top||a.l-b.l)){
  const o=merged.find(o=>Math.abs(o.r-c.l)<=.4&&Math.abs(o.top-c.top)<=.8&&Math.abs(o.bottom-c.bottom)<=.8);
  if(o)o.r=c.r;else merged.push({...c})
 }
 const out=[];
 for(const o of merged){
  // The sides of the opening start at its top (hatching of the pieces beside it runs on up past it).
  const h=o.bottom-o.top,sides=uniq(vert.filter(v=>v.x>=o.l-.5&&v.x<=o.r+.5&&Math.abs(v.y0-o.top)<=1.5&&v.y1>=o.bottom-h*.1).map(v=>v.x));
  if(sides.length>=2&&(sides[sides.length-1]-sides[0])*scale>=400)out.push({...o,l:sides[0],r:sides[sides.length-1]});
  else out.push(o)
 }
 // Openings cut in panels drawn whole — a door in the lower part of a panel, a gate in the corner of two, a grille over
 // a joint (ГПЭС, АР-1 лист 9: grilles 1000×1400 and 800×800 over the gates): a rectangle its lines close. Two sides
 // (pieces drawn end to end as one: a side broken at the joint of the tiers), its top drawn across them (a piece of
 // it may be missing, a tenth), its bottom drawn or the foot of the wall; nothing running through its top but dimension
 // lines; empty — no joint, hatching or line across through it but dimension lines; in the wall, not a strip of a panel's
 // full height; no label of its own (the label of the panel round it may stand in it). It takes the place of the gaps
 // between panels it holds.
 const x0=Math.min(...rects.map(r=>r.l))-1,x1=Math.max(...rects.map(r=>r.r))+1,y0=Math.min(...rects.map(r=>r.top))-1;
 const pieces=vert.filter(v=>v.x>=x0&&v.x<=x1&&v.y0>=y0&&v.y1<=foot+2).sort((a,b)=>a.x-b.x||a.y0-b.y0),joined=[];
 for(const v of pieces){const o=joined.find(o=>Math.abs(o.x-v.x)<=.3&&Math.abs(o.y1-v.y0)<=.3);if(o)o.y1=Math.max(o.y1,v.y1);else joined.push({...v})}
 const vs=joined.filter(v=>(v.y1-v.y0)*scale>=300).sort((a,b)=>a.x-b.x);
 // A dimension line along a side: the nearest line its number is written along (not the side of the opening behind it).
 const dims=new Set();
 for(const b of numbers.map(textBox).filter(b=>b.angle!==0)){
  const at=joined.filter(v=>v.x>=b.x1-.5&&v.x<=b.x1+8&&b.cy>=v.y0&&b.cy<=v.y1).sort((p,q)=>p.x-q.x)[0];
  if(at)for(const v of joined)if(Math.abs(v.x-at.x)<=.3&&b.cy>=v.y0&&b.cy<=v.y1)dims.add(v)
 }
 // … or a line with the ticks of a dimension at both its ends (its number may stand off it).
 const ticked=v=>[v.y0,v.y1].every(y=>ticks.some(t=>[t.a,t.b].some(p=>Math.abs(p.x-v.x)<=.3&&p.y>=v.y0-.5&&p.y<=v.y1+.5&&Math.abs(p.y-y)<=6)));
 const sized=v=>dims.has(v)||ticked(v);
 const rows=new Map();for(const h of horiz){const k=Math.round(h.y*2);if(!rows.has(k))rows.set(k,[]);rows.get(k).push(h)}
 // The length of [a, b] the pieces cover.
 const span=(list,a,b)=>{let s=0,need=a;for(const [p,q] of list.sort((x,y)=>x[0]-y[0])){const c=Math.max(need,p),d=Math.min(b,q);if(d>c)s+=d-c;need=Math.max(need,d)}return s};
 const cover=(y,l,r,skip)=>span([-1,0,1].flatMap(d=>rows.get(Math.round(y*2)+d)||[]).filter(h=>Math.abs(h.y-y)<=.6&&h.x1>l&&h.x0<r&&!(skip&&skip(h))).map(h=>[h.x0,h.x1]),l,r)/(r-l);
 // The line under a level mark («+2,650») is its shelf, not a line of the wall; one under a number, a dimension line.
 const marks=texts.filter(t=>horizontalText(t)&&/^[+\-−±]?\d{1,2}[,.]\d{3}$/u.test(String(t.str).trim())).map(textBox);
 const noted=h=>marks.some(b=>b.y1<=h.y+.5&&b.y1>=h.y-4.5&&b.cx>=h.x0&&b.cx<=h.x1);
 for(let i=0;i<vs.length;i++){
  const A=vs[i];
  for(let j=i+1;j<vs.length&&vs[j].x-A.x<=6500/scale;j++){
   const B=vs[j];if(B.x-A.x<380/scale||sized(A)||sized(B))continue;
   const l=A.x,r=B.x,top=Math.max(A.y0,B.y0),bottom=Math.min(A.y1,B.y1);
   if((bottom-top)*scale<300||cover(top,l,r,noted)<.9||!(Math.abs(bottom-foot)<=1.5||cover(bottom,l,r,noted)>=.9))continue;
   const within=joined.filter(v=>v.x>l+.5&&v.x<r-.5&&v.y1>top&&v.y0<bottom&&!sized(v));
   if(within.some(v=>v.y0<top-1&&v.y1>top+1))continue;
   // Lines through it drawn in pieces (a joint of the tiers panel by panel) as much as whole ones.
   const xs=uniq(within.map(v=>v.x));
   if(xs.some(x=>span(within.filter(v=>Math.abs(v.x-x)<=.3).map(v=>[v.y0,v.y1]),top,bottom)>=(bottom-top)/2))continue;
   const aside=h=>noted(h)||dimensionLine(h,numbers),ys=uniq(horiz.filter(h=>h.y>top+1&&h.y<bottom-1&&h.x1>l&&h.x0<r&&!aside(h)).map(h=>h.y));
   if(ys.some(y=>cover(y,l,r,aside)>=.5))continue;
   const over=rects.filter(q=>Math.min(q.r,r)-Math.max(q.l,l)>1&&Math.min(q.bottom,bottom)-Math.max(q.top,top)>1);
   if(!over.length||over.some(q=>q.l<=l+1&&q.r>=r-1&&(top-q.top)*scale<100&&(q.bottom-bottom)*scale<100))continue;
   const same=q=>Math.max(Math.abs(q.l-l),Math.abs(q.r-r),Math.abs(q.top-top),Math.abs(q.bottom-bottom))*scale<100;
   if(panels.some(p=>p.pt.x>l&&p.pt.x<r&&p.pt.y>top&&p.pt.y<bottom&&same(p.rect))||rects.some(same))continue;
   const o={l,r,top,bottom,inner:true},held=q=>q.l>=l-1&&q.r<=r+1&&q.top>=top-1&&q.bottom<=bottom+1;
   const k=out.findIndex(q=>!held(q)&&q.l<r-1&&q.r>l+1&&q.top<bottom-1&&q.bottom>top+1);
   if(k<0){for(let n=out.length-1;n>=0;n--)if(held(out[n]))out.splice(n,1);out.push(o)}
   else if(r-l<out[k].r-out[k].l)out[k]=o;
   break
  }
 }
 return out.map(o=>{const a=u(o.l),b=u(o.r);return{u0:Math.min(a,b),u1:Math.max(a,b),z0:z(o.bottom),z1:z(o.top),base:Math.abs(o.bottom-foot)<=1.5,...(o.inner?{inner:true}:{})}}).sort((p,q)=>p.u0-q.u0||p.z0-q.z0)
}
// Openings inside a panel drawn whole are holes of that panel (along it from its start, and up).
function holesOf(panels,openings){
 for(const p of panels){
  const holes=openings.filter(o=>o.u0>=p.u0-20&&o.u1<=p.u1+20&&o.z0>=p.z0-20&&o.z1<=p.z1+20&&o.u1-o.u0<p.u1-p.u0-20||o.inner&&o.u0<p.u1-20&&o.u1>p.u0+20&&o.z0<p.z1-20&&o.z1>p.z0+20)
   .map(o=>[Math.max(0,o.u0-p.u0),Math.min(p.u1-p.u0,o.u1-p.u0),Math.max(p.z0,o.z0),Math.min(p.z1,o.z1)]);
  if(holes.length)p.holes=holes
 }
 return panels
}
// Views of panels: every row of bubbles with panel labels over it.
function panelViews({segments=[],texts=[]}={},spec=[]){
 // Positions of the tables are not labels of panels.
 const rowsOf=new Set(spec.map(p=>p.at));
 // Labels of panels: «ПН-30» (наружная), «ПС», «ПК», «ПП», «ПВ», «ПШ», or the positions of the panel table of the
 // sheet («ПД-3» is a sill board, not a panel).
 const kinds=new Set(spec.map(p=>p.kind));
 const labels=texts.filter(t=>{const m=horizontalText(t)&&POS.exec(String(t.str).trim());return m&&(/^П[НСКПВШ]$/u.test(m[1])||kinds.has(m[1]))&&!rowsOf.has(t)});
 const sizes=new Map();for(const p of spec){if(!sizes.has(p.pos))sizes.set(p.pos,[]);sizes.get(p.pos).push(p)}
 if(labels.length<4)return[];
 const rows=axisRows(texts,segments);if(!rows.length)return[];
 const owner=ownerOf(rows);
 const vert=[],horiz=[],slopes=[],ticks=[];
 for(const s of segments){
  const dx=Math.abs(s.a.x-s.b.x),dy=Math.abs(s.a.y-s.b.y);
  // The ticks of dimensions: short strokes at 45°.
  if(dx>.3&&dy>.3&&dy/dx>.5&&dy/dx<2&&Math.hypot(dx,dy)>.8&&Math.hypot(dx,dy)<6)ticks.push(s);
  if(dx<=.3&&dy>=4)vert.push({x:(s.a.x+s.b.x)/2,y0:Math.min(s.a.y,s.b.y),y1:Math.max(s.a.y,s.b.y)});
  else if(dy<=.3&&dx>=3)horiz.push({y:(s.a.y+s.b.y)/2,x0:Math.min(s.a.x,s.b.x),x1:Math.max(s.a.x,s.b.x)});
  else if(dx>=3&&dy/dx<.35){const [p,q]=s.a.x<s.b.x?[s.a,s.b]:[s.b,s.a];slopes.push({x0:p.x,x1:q.x,ya:p.y,yb:q.y})}
 }
 const numbers=texts.filter(t=>/^\d{2,5}$/.test(String(t.str).trim()));
 const views=[],found=[];
 for(const row of rows){
  const own=labels.filter(t=>{const b=textBox(t);return owner(b.cx,b.cy)===row});
  if(own.length<4)continue;
  const region=texts.filter(t=>{const b=textBox(t);return owner(b.cx,b.cy)===row});
  const levels=region.filter(horizontalText).map(t=>({mm:levelOf(t.str),y:t.y,x:t.x,w:t.width||0})).filter(l=>l.mm!==null);
  const offset=levelOffset(levels,horiz);levels.forEach(l=>{l.y+=offset});
  found.push({row,own,region,levels,f:fit(levels)})
 }
 // Marks of openings drawn under their line («+7,450» under the head of a window) can make two scales agree as well:
 // the scale of the other views of the sheet decides (a facade is drawn at one scale both ways).
 const sure=found.filter(v=>v.f).map(v=>v.f.b).sort((x,y)=>x-y);
 for(const v of found){
  const {row,own,region,levels}=v,f=v.f||(sure.length?fit(levels,sure[sure.length>>1]):null);if(!f)continue;
  const scale=Math.abs(f.b);
  const bubbles=row.items.map(t=>({name:String(t.str).trim().toUpperCase(),pt:t.x+(t.width||0)/2})).sort((a,b)=>a.pt-b.pt);
  if(new Set(bubbles.map(b=>b.name)).size!==bubbles.length||new Set(bubbles.map(b=>numbered(b.name))).size!==1)continue;
  const dims=region.filter(t=>/^\d{3,5}$/.test(String(t.str).trim())).map(t=>Number(t.str));
  const left=along(bubbles,dims,scale),total=left[left.length-1];
  const reversed=axisRank(bubbles[0].name)>axisRank(bubbles[bubbles.length-1].name);
  const canon=m=>reversed?total-m:m;
  const u=xpt=>{let k=0;for(let i=1;i<bubbles.length;i++)if(Math.abs(bubbles[i].pt-xpt)<Math.abs(bubbles[k].pt-xpt))k=i;return Math.round(canon(left[k]+(xpt-bubbles[k].pt)*scale)/5)*5};
  const z=ypt=>Math.round((f.a+f.b*ypt)/5)*5;
  const win=3000/scale,panels=[];
  for(const t of own){
   // A rectangle of the size the specification gives the position (either way round: a panel may lie), ±40 mm.
   const kinds=sizes.get(String(t.str).trim()),sized=kinds?rc=>{const w=(rc.r-rc.l)*scale,h=(rc.bottom-rc.top)*scale;
    return kinds.some(q=>Math.abs(q.width_mm-w)<=40&&Math.abs(q.length_mm-h)<=40||Math.abs(q.length_mm-w)<=40&&Math.abs(q.width_mm-h)<=40)}:null;
   // Of the size first: drawn round it, by its sides, by its joints and the lines across it; then the nearest outline.
   const b=textBox(t),first=edgesAround(b,horiz,scale,slopes,sized);
   const rect=(sized&&((first&&sized(first)?first:null)||sidesAround(b,horiz,vert,scale,sized,slopes)||sizedAround(b,vert,horiz,scale,kinds,numbers)))||
    first||sidesAround(b,horiz,vert,scale,null,slopes)||jointsAround(b,vert,horiz,numbers,win);
   if(!rect){if(process.env.AR_DEBUG)console.log("unplaced",t.str,Math.round(b.cx),Math.round(b.cy));continue}
   const u0=u(rect.l),u1=u(rect.r);
   // The cut of a panel under a slope: the heights of its lower edge at the ends, in the order along the wall.
   const cut=rect.cut?(u0<=u1?[z(rect.cut.l),z(rect.cut.r)]:[z(rect.cut.r),z(rect.cut.l)]):null;
   panels.push({mark:String(t.str).trim(),u0:Math.min(u0,u1),u1:Math.max(u0,u1),z0:z(rect.bottom),z1:z(rect.top),...(cut?{cut}:{}),pt:{x:Math.round(b.cx),y:Math.round(b.cy)},rect})
  }
  if(!panels.length)continue;
  const axes=bubbles.map((bb,i)=>({name:bb.name,mm:canon(left[i])})).sort((a,b)=>a.mm-b.mm);
  // A view under a title of a section («4-4») is a cut through the building (partitions, barriers), not a facade.
  const top=Math.min(...own.map(t=>t.y)),cut=texts.filter(t=>horizontalText(t)&&/^(\d{1,2}|[А-ЯЁ])\s*[-–—]\s*\1$/u.test(String(t.str).trim())&&t.y<top&&top-t.y<220&&t.x>=row.x0-260&&t.x<=row.x1+260).sort((a,b)=>b.y-a.y)[0];
  views.push({axes,numbered:numbered(bubbles[0].name),reversed,...(cut?{section:String(cut.str).replace(/\s+/g,"")}:{}),scaleMmPerPt:Math.round(scale*1000)/1000,
   bbox:{x0:row.x0-260,x1:row.x1+260,y1:row.y},levels:[...new Set(levels.map(l=>l.mm))].sort((a,b)=>a-b),
   ...(()=>{const openings=openingRects(panels,vert,horiz,scale,u,z,numbers,region,ticks);return{panels:holesOf(panels.map(({rect,...p})=>p),openings),openings}})(),unplaced:own.length-panels.length})
 }
 return views
}
// Windows, doors and gates on the facades («ОК-1», «Д-7», «В-1» at each of them): every label with the rectangles
// drawn near it (a top and a bottom of one extent and the sides between them), in the frame of its view; the plan picks
// the one of the size of the block its table gives.
const FILL=/^(ОК|Д|В|ВР|ДВ)-(\d{1,3}[а-я]?)$/u;
function fillViews({segments=[],texts=[]}={}){
 const inTable=t=>texts.some(o=>o!==t&&Math.abs(o.y-t.y)<3&&o.x>t.x&&o.x<t.x+520&&/ГОСТ|\d{3,5}\s*[хx×-]\s*\d{3,5}/u.test(String(o.str)));
 const labels=texts.filter(t=>horizontalText(t)&&FILL.test(String(t.str).trim())&&!inTable(t));
 if(labels.length<3)return[];
 const rows=axisRows(texts,segments);if(!rows.length)return[];
 const owner=ownerOf(rows);
 const box=labels.map(textBox),near=(x,y,d)=>box.some(b=>Math.abs(b.cx-x)<d&&Math.abs(b.cy-y)<d);
 const horiz=[],vert=[],lines=[];
 for(const s of segments){
  const dx=Math.abs(s.a.x-s.b.x),dy=Math.abs(s.a.y-s.b.y);
  if(dy<=.3&&dx>=3)lines.push({y:(s.a.y+s.b.y)/2,x0:Math.min(s.a.x,s.b.x),x1:Math.max(s.a.x,s.b.x)});
  if(dy<=.3&&dx>=8&&near((s.a.x+s.b.x)/2,s.a.y,200))horiz.push({y:(s.a.y+s.b.y)/2,x0:Math.min(s.a.x,s.b.x),x1:Math.max(s.a.x,s.b.x)});
  else if(dx<=.3&&dy>=8&&near(s.a.x,(s.a.y+s.b.y)/2,260))vert.push({x:(s.a.x+s.b.x)/2,y0:Math.min(s.a.y,s.b.y),y1:Math.max(s.a.y,s.b.y)})
 }
 const found=[];
 for(const row of rows){
  const own=labels.filter(t=>{const b=textBox(t);return owner(b.cx,b.cy)===row});
  if(!own.length)continue;
  const region=texts.filter(t=>{const b=textBox(t);return owner(b.cx,b.cy)===row});
  const levels=region.filter(horizontalText).map(t=>({mm:levelOf(t.str),y:t.y,x:t.x,w:t.width||0})).filter(l=>l.mm!==null);
  const offset=levelOffset(levels,lines);levels.forEach(l=>{l.y+=offset});
  found.push({row,own,region,levels,f:fit(levels)})
 }
 const sure=found.filter(v=>v.f).map(v=>v.f.b).sort((x,y)=>x-y),views=[];
 for(const v of found){
  const {row,own,region,levels}=v,f=v.f||(sure.length?fit(levels,sure[sure.length>>1]):null);if(!f)continue;
  const scale=Math.abs(f.b);
  const bubbles=row.items.map(t=>({name:String(t.str).trim().toUpperCase(),pt:t.x+(t.width||0)/2})).sort((a,b)=>a.pt-b.pt);
  if(new Set(bubbles.map(b=>b.name)).size!==bubbles.length||new Set(bubbles.map(b=>numbered(b.name))).size!==1)continue;
  const dims=region.filter(t=>/^\d{3,5}$/.test(String(t.str).trim())).map(t=>Number(t.str));
  if(dims.length&&!sameScale(bubbles,dims,scale))continue;
  const left=along(bubbles,dims,scale),total=left[left.length-1];
  const reversed=axisRank(bubbles[0].name)>axisRank(bubbles[bubbles.length-1].name),canon=m=>reversed?total-m:m;
  const u=xpt=>{let k=0;for(let i=1;i<bubbles.length;i++)if(Math.abs(bubbles[i].pt-xpt)<Math.abs(bubbles[k].pt-xpt))k=i;return Math.round(canon(left[k]+(xpt-bubbles[k].pt)*scale)/5)*5};
  const z=ypt=>Math.round((f.a+f.b*ypt)/5)*5;
  const reach=4000/scale,fills=[];
  for(const t of own){
   const b=textBox(t),hs=horiz.filter(h=>Math.abs(h.y-b.cy)<reach&&h.x1>b.cx-reach&&h.x0<b.cx+reach&&(h.x1-h.x0)*scale>=400&&(h.x1-h.x0)*scale<=8000);
   // A side down from the top to the bottom; a railing or a stair drawn in front may break it for a fifth of its height.
   const side=(x,top,bottom)=>{let need=top,gap=0;for(const q of vert.filter(q=>Math.abs(q.x-x)<=.6&&q.y1>top&&q.y0<bottom).sort((p,q)=>p.y0-q.y0)){if(q.y0>need+1)gap+=q.y0-need;need=Math.max(need,q.y1)}
    return gap+Math.max(0,bottom-need)<=(bottom-top)*.2};
   const rects=[];
   for(let i=0;i<hs.length;i++)for(let j=0;j<hs.length;j++){
    // The top and the bottom of one extent, or one of them a part of a longer line (a gate behind a platform stands on
    // its deck, a window under the line of a canopy).
    const a=hs[i],c=hs[j],h=(c.y-a.y)*scale;if(h<400||h>5000)continue;
    const same=Math.abs(a.x0-c.x0)<=.6&&Math.abs(a.x1-c.x1)<=.6,n=same?a:c.x0<=a.x0+.6&&c.x1>=a.x1-.6?a:a.x0<=c.x0+.6&&a.x1>=c.x1-.6?c:null;if(!n)continue;
    if(rects.some(r=>Math.abs(r.l-n.x0)<.3&&Math.abs(r.r-n.x1)<.3&&Math.abs(r.top-a.y)<.3&&Math.abs(r.bottom-c.y)<.3))continue;
    if(!side(n.x0,a.y,c.y)||!side(n.x1,a.y,c.y))continue;
    const dx=Math.max(0,n.x0-b.cx,b.cx-n.x1),dy=Math.max(0,a.y-b.cy,b.cy-c.y);
    rects.push({l:n.x0,r:n.x1,top:a.y,bottom:c.y,d:Math.hypot(dx,dy)+(same?0:.5)})
   }
   rects.sort((p,q)=>p.d-q.d);
   fills.push({mark:String(t.str).trim(),u:u(b.cx),z:z(b.cy),rects:rects.slice(0,60).map(r=>{const p=u(r.l),q=u(r.r);return[Math.min(p,q),Math.max(p,q),z(r.bottom),z(r.top)]})})
  }
  views.push({axes:bubbles.map((bb,i)=>({name:bb.name,mm:canon(left[i])})).sort((a,b)=>a.mm-b.mm),numbered:numbered(bubbles[0].name),reversed,scaleMmPerPt:Math.round(scale*1000)/1000,fills})
 }
 return views
}
// Schemes of the blocks over their tables, drawn as on the facade (from outside): the block «ОК-3» is the rectangle of
// its proportions under its label. Inside it a window's fields (a pane in the frame; a sash — a second rectangle in its
// field); the joints of the leaves of a door or a gate (lines over its height); a wicket (a rectangle on the foot of a
// leaf); the glass of a door (a rectangle with the strokes of glass). The lines of a sash meet at the side it opens
// from: at its handle (turn — hinged at the other side), at the top (tilt — hinged at its foot); both — «ПОТ» (ГОСТ
// 23166: «с поворотом створки вокруг вертикальной и нижней крайних осей»). Millimetres from the lower left corner of
// the block as drawn. The engineer, 27.10.2026: «Окна и ворота сделай в 3д нормальное отображение».
function fillSketches({segments=[],texts=[]}={},fills=[]){
 const want=new Map(fills.filter(f=>f.width_mm&&f.height_mm).map(f=>[f.pos,f]));
 const labels=texts.filter(t=>horizontalText(t)&&want.has(String(t.str).trim())&&!rowOf(texts,t,480).some(o=>/ГОСТ|\d{3,5}\s*[хx×-]\s*\d{3,5}/u.test(String(o.str))));
 if(!labels.length)return;
 const H=[],V=[],D=[];
 for(const s of segments){
  const dx=Math.abs(s.a.x-s.b.x),dy=Math.abs(s.a.y-s.b.y);
  if(dy<=.3&&dx>=2)H.push({y:(s.a.y+s.b.y)/2,x0:Math.min(s.a.x,s.b.x),x1:Math.max(s.a.x,s.b.x)});
  else if(dx<=.3&&dy>=2)V.push({x:(s.a.x+s.b.x)/2,y0:Math.min(s.a.y,s.b.y),y1:Math.max(s.a.y,s.b.y)});
  else if(dx>.4&&dy>.4)D.push(s)
 }
 // Rectangles: two upright lines and the outermost lines across both of them, each side one unbroken line; the glass of
 // a door — from a corner for 80 % of it at least (a handle drawn over a leaf breaks its lines).
 const cover=(list,a,b,part)=>{
  const runs=[];for(const q of list.slice().sort((p,q)=>p[0]-q[0])){const r=runs[runs.length-1];if(r&&q[0]<=r[1]+.8)r[1]=Math.max(r[1],q[1]);else runs.push(q.slice())}
  let best=0;for(const r of runs){if(r[0]>a+.8&&r[1]<b-.8)continue;if(!part&&(r[0]>a+.8||r[1]<b-.8))continue;const lo=Math.max(a,r[0]),hi=Math.min(b,r[1]);if(hi>lo)best=Math.max(best,(hi-lo)/(b-a))}
  return part?best:best>=.99?1:0
 };
 const rectsIn=(x0,x1,y0,y1,part=false)=>{
  const vs=V.filter(v=>v.x>=x0&&v.x<=x1&&v.y1>=y0&&v.y0<=y1&&v.y1-v.y0>=4),ys=new Map(),xs=new Map(),key=v=>Math.round(v*3)/3,out=[];
  for(const v of vs){const k=key(v.x);if(!xs.has(k))xs.set(k,[]);xs.get(k).push([v.y0,v.y1])}
  for(const h of H)if(h.y>=y0&&h.y<=y1&&h.x1>=x0&&h.x0<=x1){const k=key(h.y);if(!ys.has(k))ys.set(k,[]);ys.get(k).push([h.x0,h.x1])}
  for(const a of vs)for(const b of vs){
   if(b.x-a.x<3||Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)<4)continue;
   const lo=Math.min(a.y0,b.y0)-.8,hi=Math.max(a.y1,b.y1)+.8,across=[...ys.keys()].filter(y=>y>=lo&&y<=hi&&cover(ys.get(y),a.x,b.x,part)>=.8);if(across.length<2)continue;
   const t=Math.min(...across),u=Math.max(...across);if(u-t<4)continue;
   if(cover(xs.get(key(a.x)),t,u,part)<.8||cover(xs.get(key(b.x)),t,u,part)<.8)continue;
   if(!out.some(r=>Math.abs(r.l-a.x)<.3&&Math.abs(r.r-b.x)<.3&&Math.abs(r.t-t)<.3&&Math.abs(r.b-u)<.3))out.push({l:a.x,r:b.x,t,b:u})
  }
  return out
 };
 const inside=(r,q,e=.4)=>r!==q&&r.l>=q.l-e&&r.r<=q.r+e&&r.t>=q.t-e&&r.b<=q.b+e;
 // The strokes along a line from p to q: their length over its length.
 const along=(p,q,box)=>{
  const L=Math.hypot(q.x-p.x,q.y-p.y),ux=(q.x-p.x)/L,uy=(q.y-p.y)/L,tol=Math.max(.8,.04*Math.min(box.r-box.l,box.b-box.t));let sum=0;
  for(const s of D){
   const off=[s.a,s.b].map(e=>Math.abs((e.x-p.x)*uy-(e.y-p.y)*ux)),at=[s.a,s.b].map(e=>((e.x-p.x)*ux+(e.y-p.y)*uy)/L);
   if(off[0]<=tol&&off[1]<=tol&&Math.min(...at)>=-.05&&Math.max(...at)<=1.05)sum+=Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y)
  }
  return sum/L
 };
 for(const t of labels){
  const f=want.get(String(t.str).trim());if(f.sketch)continue;
  const b=textBox(t),aspect=f.width_mm/f.height_mm;
  const all=rectsIn(b.cx-420,b.cx+420,b.cy-4,b.cy+520);
  const blocks=all.filter(r=>r.t>b.cy&&r.t-b.cy<(r.b-r.t)*.9+90&&b.cx>=r.l-10&&b.cx<=r.r+10&&Math.abs((r.r-r.l)/(r.b-r.t)/aspect-1)<=.04)
   .sort((p,q)=>Math.abs((p.r-p.l)/(p.b-p.t)/aspect-1)-Math.abs((q.r-q.l)/(q.b-q.t)/aspect-1)||(q.r-q.l)*(q.b-q.t)-(p.r-p.l)*(p.b-p.t));
  const B=blocks[0];if(!B)continue;
  const w=B.r-B.l,h=B.b-B.t,mmU=x=>Math.round((x-B.l)/w*f.width_mm/5)*5,mmZ=y=>Math.round((B.b-y)/h*f.height_mm/5)*5;
  const box=r=>[mmU(r.l),mmU(r.r),mmZ(r.b),mmZ(r.t)];
  const own=all.filter(r=>inside(r,B)&&!(r.r-r.l>=.95*w&&r.b-r.t>=.9*h));
  const sketch={};
  if(f.kind==="window"){
   let fields=own.filter(r=>r.r-r.l>=.08*w&&r.b-r.t>=.2*h);fields=fields.filter(r=>!fields.some(q=>inside(r,q)));
   // A transom: a pair of lines across the whole field.
   fields=fields.flatMap(r=>{
    const cut=H.filter(l=>l.x0<=r.l+.03*(r.r-r.l)&&l.x1>=r.r-.03*(r.r-r.l)&&l.y>r.t+.08*(r.b-r.t)&&l.y<r.b-.08*(r.b-r.t)).map(l=>l.y).sort((p,q)=>p-q);
    if(!cut.length)return[r];const out=[];let top=r.t;
    for(let i=0;i<cut.length;){let j=i;while(j+1<cut.length&&cut[j+1]-cut[j]<6)j++;out.push({l:r.l,r:r.r,t:top,b:cut[i]});top=cut[j];i=j+1}
    out.push({l:r.l,r:r.r,t:top,b:r.b});return out.filter(q=>q.b-q.t>=4)
   });
   fields=fields.filter(r=>!fields.some(q=>q!==r&&inside(q,r,.3)));
   // Fields over each other are not read (the lines of a frame behind a glazing drawn over it).
   if(!fields.length||fields.some(r=>fields.some(q=>q!==r&&Math.min(r.r,q.r)-Math.max(r.l,q.l)>1&&Math.min(r.b,q.b)-Math.max(r.t,q.t)>1)))continue;
   sketch.fields=fields.sort((p,q)=>p.l-q.l||q.t-p.t).map(r=>{
    const inner=own.filter(q=>inside(q,r)&&q.r-q.l>=.6*(r.r-r.l)).sort((p,q)=>(p.r-p.l)-(q.r-q.l))[0]||r,g=inner;
    const mid={x:(g.l+g.r)/2,y:(g.t+g.b)/2},meets=(p1,p2,q)=>along(p1,q,g)>=.25&&along(p2,q,g)>=.25;
    const right=meets({x:g.l,y:g.t},{x:g.l,y:g.b},{x:g.r,y:mid.y}),left=meets({x:g.r,y:g.t},{x:g.r,y:g.b},{x:g.l,y:mid.y});
    const top=meets({x:g.l,y:g.b},{x:g.r,y:g.b},{x:mid.x,y:g.t}),foot=meets({x:g.l,y:g.t},{x:g.r,y:g.t},{x:mid.x,y:g.b});
    const turn=right?"right":left?"left":"",open=turn&&top?"ПОТ":turn?"ПР":top?"ОТ":foot?"П":"";
    const [u0,u1,z0,z1]=box(r);
    return{u:[u0,u1],z:[z0,z1],sash:Boolean(open)||inner!==r&&inner.l-r.l>=.5&&r.r-inner.r>=.5&&inner.t-r.t>=.5&&r.b-inner.b>=.5,...(open?{open,handle:turn||(top?"top":"bottom")}:{})}
   })
  }
  else{
   const joints=[];
   for(const v of V.filter(v=>v.x>B.l+.08*w&&v.x<B.r-.08*w&&v.y0<=B.t+.15*h&&v.y1>=B.b-.15*h&&v.y1-v.y0>=.8*h).sort((p,q)=>p.x-q.x)){
    const last=joints[joints.length-1];if(last&&v.x-last.x1<=3)last.x1=v.x;else joints.push({x0:v.x,x1:v.x})
   }
   if(joints.length)sketch.joints=joints.map(j=>mmU((j.x0+j.x1)/2));
   const wicket=f.kind==="gate"&&own.filter(r=>r.b-r.t>=.3*h&&r.b-r.t<=.85*h&&r.r-r.l>=.12*w&&r.r-r.l<=.45*w&&B.b-r.b<=.08*h).sort((p,q)=>(q.r-q.l)*(q.b-q.t)-(p.r-p.l)*(p.b-p.t))[0];
   if(wicket)sketch.wicket=box(wicket);
   // Glass: a rectangle with the strokes of glass inside it (short parallel strokes, not across it).
   const loose=rectsIn(B.l-1,B.r+1,B.t-1,B.b+1,true).filter(r=>inside(r,B)&&!(r.r-r.l>=.95*w&&r.b-r.t>=.9*h));
   // Glass: a rectangle with its mark inside — two or three short strokes side by side (not the dashes of one line).
   const strokes=r=>D.filter(s=>Math.min(s.a.x,s.b.x)>=r.l-.5&&Math.max(s.a.x,s.b.x)<=r.r+.5&&Math.min(s.a.y,s.b.y)>=r.t-.5&&Math.max(s.a.y,s.b.y)<=r.b+.5&&Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y)>=2&&Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y)<.6*Math.max(r.r-r.l,r.b-r.t));
   const marked=r=>{const list=strokes(r);return list.some((s,i)=>list.some((q,k)=>{if(k<=i)return false;
    const L1=Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y),L2=Math.hypot(q.b.x-q.a.x,q.b.y-q.a.y),ux=(s.b.x-s.a.x)/L1,uy=(s.b.y-s.a.y)/L1;
    if(Math.abs(ux*(q.b.y-q.a.y)-uy*(q.b.x-q.a.x))/L2>.09||Math.min(L1,L2)/Math.max(L1,L2)<.4)return false;
    const off=Math.abs((q.a.x-s.a.x)*uy-(q.a.y-s.a.y)*ux),c=((q.a.x+q.b.x)/2-s.a.x)*ux+((q.a.y+q.b.y)/2-s.a.y)*uy;
    return off>=.8&&off<=5&&c>-.2*L1&&c<1.2*L1}))};
   const glass=loose.filter(r=>r!==wicket&&r.r-r.l>=.1*w&&r.b-r.t>=.1*h&&marked(r));
   const panes=glass.filter(r=>!glass.some(q=>inside(q,r)));
   if(panes.length)sketch.panes=panes.sort((p,q)=>p.l-q.l||q.b-p.b).map(box)
  }
  f.sketch=sketch
 }
}
// The finish of the facade («Ведомость отделки фасада»): the colour of window profiles («Окна | Профиль ПВХ | Белый»),
// of gates and doors («Ворота, двери | Стальные с полимерным покрытием | RAL 7047»).
const COLOUR_WORD=/^(бел|сер|черн|чёрн|коричн|графит|антрацит|серебр)[а-яё]*$/iu;
function facadeFinish(texts){
 const titles=texts.filter(t=>/Ведомость отделки фасада/iu.test(String(t.str)));if(!titles.length)return[];
 const out=[];
 for(const p of texts){
  const s=String(p.str).trim();if(!horizontalText(p)||!/^(окна|окон|витраж|ворота|двер)/iu.test(s)||s.length>40)continue;
  if(!titles.some(t=>t.y<p.y&&p.y-t.y<500&&p.x>=t.x-220&&p.x<t.x+500))continue;
  const what=[...(/окн|окон|витраж/iu.test(s)?["window"]:[]),...(/ворот/iu.test(s)?["gate"]:[]),...(/двер/iu.test(s)?["door"]:[])];
  const row=texts.filter(o=>o!==p&&Math.abs(o.y-p.y)<9&&o.x>p.x&&o.x<p.x+450).sort((a,b)=>a.x-b.x);
  const ral=row.flatMap(o=>ralCodes(o.str))[0],word=row.map(o=>String(o.str).trim()).find(x=>COLOUR_WORD.test(x));
  if(ral||word)out.push({what,...(ral?{ral}:{colour:word.toLowerCase()})})
 }
 return out
}
// The sills under the windows («Спецификация отливов»: «Отлив из оцинкованной стали … (RAL9003)») and the window
// boards («ПД-1 | ГОСТ 30673-2015 | 7 | 250х1820»: its depth and length).
function sillSpec(texts){
 const out={},title=texts.find(t=>/Спецификация отливов/iu.test(String(t.str)));
 if(title){const own=texts.filter(t=>t.y>title.y&&t.y<title.y+200&&Math.abs(t.x-title.x)<300&&/отлив|RAL/iu.test(String(t.str)));
  const ral=own.flatMap(t=>ralCodes(t.str))[0];if(ral)out.sill_ral=ral}
 const boards=[];
 for(const p of texts){
  if(!/^ПД-\d{1,3}$/u.test(String(p.str).trim())||!horizontalText(p))continue;
  const m=rowOf(texts,p,520).map(o=>/^(\d{2,3})\s*[хx×]\s*(\d{3,5})$/u.exec(String(o.str).trim())).find(Boolean);
  if(m)boards.push({pos:String(p.str).trim(),depth_mm:Number(m[1]),length_mm:Number(m[2])})
 }
 if(boards.length)out.boards=boards;
 return out
}
function extractArchitecture(geometry){
 const texts=geometry?.texts||[];
 const spec=panelSpec(texts),fills=fillSpec(texts),views=panelViews(geometry||{},spec),facades=fillViews(geometry||{});
 if(fills.length)fillSketches(geometry||{},fills);
 const finish=facadeFinish(texts),sills=sillSpec(texts);
 const panels=spec.map(({at,...p})=>p),extra={...(facades.length?{facades}:{}),...(finish.length?{finish}:{}),...(Object.keys(sills).length?{sills}:{})};
 return panels.length||fills.length||views.length||Object.keys(extra).length?{panels,fills,views,...extra}:null
}
module.exports={extractArchitecture,panelSpec,fillSpec,panelViews,fillViews,fillSketches,facadeFinish,sillSpec,ralCodes};
