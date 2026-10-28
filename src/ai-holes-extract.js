"use strict";
// Holes of an assembly sheet (КМД), each at its place on the member (the engineer, 25.10.2026: «каждый узел должен быть
// показан идеально, каждый метиз, каждое отверстие»). A hole is drawn by its sign — a square or a diamond with a cross
// (ГОСТ 2.315), or a small circle at its size — and named by a callout «Ø23 / 2 отв.» on a leader. Its place is
// measured on the view of the member in the scale of the view: from the end of the member along it, from its axis
// across it. The sheets of a section or a detail (no member drawn along) are left to the parts.
const {dimensionsOf}=require("./ai-scheme-extract");

const dist=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y);
const SCALES=[1,2,2.5,4,5,10,15,20,25,40,50,75,100];
const PT=72/25.4;
// Standard diameters of holes for bolts (ГОСТ 11284-75, СП 16.13330), to round a circle measured at the scale.
const HOLE_D=[9,11,13,14,15,17,18,19,21,22,23,24,25,26,27,28,30,32,33,35,36,39,40,42,45,48,50];

function dedupe(segments){
 const out=[],seen=new Map();
 for(const s of segments){
  const l=dist(s.a,s.b);if(l<0.15)continue;
  const k=[s.a.x,s.a.y,s.b.x,s.b.y].map(v=>Math.round(v*20)),k1=k.join(),k2=[k[2],k[3],k[0],k[1]].join(),o=seen.get(k1)||seen.get(k2);
  if(o){if((s.w||0)>(o.w||0))o.w=s.w;continue}const q={a:s.a,b:s.b,l,...(s.w>0?{w:s.w}:{})};seen.set(k1,q);out.push(q)
 }
 return out
}
// A thick line of the sheet — an outline (ГОСТ 2.303: S; an axis, a dimension, its extension lines thin, S/3–S/2):
// wider than the thinnest width drawn much by 1.6 times. Null when the lines carry no widths or all one.
function thickOf(segs){
 const by=new Map();let all=0;for(const s of segs)if(s.w>0){by.set(s.w,(by.get(s.w)||0)+s.l);all+=s.l}
 if(by.size<2)return null;
 const thin=Math.min(...[...by].filter(([,l])=>l>=all*0.1).map(([w])=>w)),thickLen=[...by].reduce((a,[w,l])=>a+(w>=thin*1.6?l:0),0);
 return thickLen>=all*0.03?s=>s.w>=thin*1.6:null
}
function gridOf(segs,cell){
 const grid=new Map(),key=(x,y)=>Math.floor(x/cell)+","+Math.floor(y/cell);
 segs.forEach((s,i)=>{for(const p of [s.a,s.b]){const k=key(p.x,p.y);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i)}});
 return p=>{const out=new Set(),cx=Math.floor(p.x/cell),cy=Math.floor(p.y/cell);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const i of grid.get((cx+dx)+","+(cy+dy))||[])out.add(i);return[...out]}
}
// The signs of holes: a square (or a diamond) of 2.5–8 pt with its diagonals, or a closed ring of short chords
// 1.5–14 pt across (a circle at the hole's size; a circle of an axis or a position balloon is larger and has a text).
function holeSymbols(segments,texts=[]){
 const segs=dedupe(segments),near=gridOf(segs,4),out=[],found=[];
 const at=(p,tol)=>near(p).filter(i=>dist(segs[i].a,p)<tol||dist(segs[i].b,p)<tol);
 const edge=(p,q,tol)=>at(p,tol).some(i=>{const s=segs[i];return dist(s.a,p)<tol&&dist(s.b,q)<tol||dist(s.b,p)<tol&&dist(s.a,q)<tol});
 for(const s of segs){
  if(s.l<0.8||s.l>8)continue;const tol=Math.max(0.25,s.l*0.08);
  const u={x:(s.b.x-s.a.x)/s.l,y:(s.b.y-s.a.y)/s.l},n={x:-u.y,y:u.x};
  for(const sg of [1,-1]){
   const c={x:s.b.x+n.x*s.l*sg,y:s.b.y+n.y*s.l*sg},d={x:s.a.x+n.x*s.l*sg,y:s.a.y+n.y*s.l*sg};
   if(!(edge(s.b,c,tol)&&edge(c,d,tol)&&edge(d,s.a,tol)))continue;
   const m={x:(s.a.x+c.x)/2,y:(s.a.y+c.y)/2};
   // The cross inside: a stroke through the middle (a square with nothing in it is a box of a table or a tube's sign).
   const r=s.l*0.5,crossed=near(m).concat(...[s.a,s.b,c,d].map(near)).some(i=>{const q=segs[i];if(q.l<r*0.6)return false;
    const v={x:(q.b.x-q.a.x)/q.l,y:(q.b.y-q.a.y)/q.l},w={x:m.x-q.a.x,y:m.y-q.a.y},t=w.x*v.x+w.y*v.y;
    return Math.abs(w.x*v.y-w.y*v.x)<Math.max(0.25,r*0.12)&&t>-0.2&&t<q.l+0.2&&Math.abs(v.x*u.x+v.y*u.y)<0.9});
   if(crossed)found.push({x:m.x,y:m.y,size:s.l,shape:Math.abs(u.x*u.y)>0.3?"diamond":"square"})
  }
 }
 // A dot at the end of a leader is filled with squares one in another: not a hole (ГПЭС Ф3: the dots of the balloons «1»).
 for(const q of found){
  if(q.size<2.5||found.some(o=>o!==q&&dist(o,q)<0.4&&Math.abs(o.size-q.size)>q.size*0.15))continue;
  if(!out.some(o=>dist(o,q)<q.size*0.4))out.push(q)
 }
 // Rings: chords of 0.2–4 pt joined end to end, every point about as far from the middle.
 const short=segs.map((s,i)=>i).filter(i=>segs[i].l<=4),parent=new Map(),root=i=>{while(parent.get(i)!==i){parent.set(i,parent.get(parent.get(i)));i=parent.get(i)}return i};
 for(const i of short)parent.set(i,i);
 for(const i of short)for(const p of [segs[i].a,segs[i].b])for(const j of near(p))if(j!==i&&parent.has(j)&&(dist(segs[j].a,p)<0.12||dist(segs[j].b,p)<0.12))parent.set(root(i),root(j));
 const groups=new Map();for(const i of short){const r=root(i);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(i)}
 const labels=texts.filter(t=>t.str&&String(t.str).trim());
 for(const g of groups.values()){
  if(g.length<6||g.length>64)continue;
  const pts=g.flatMap(i=>[segs[i].a,segs[i].b]),c={x:pts.reduce((a,p)=>a+p.x,0)/pts.length,y:pts.reduce((a,p)=>a+p.y,0)/pts.length};
  const rs=pts.map(p=>dist(p,c)),r=rs.reduce((a,b)=>a+b,0)/rs.length;
  if(r<0.75||r>7||Math.min(...rs)<r*0.8||Math.max(...rs)>r*1.2)continue;
  // Round: a rim of chords shorter than its radius (a small square with its diagonals is not a ring); a stroke or two
  // across it (a leader into the hole, ГПЭС К17а) are left aside.
  const rim=g.filter(i=>segs[i].l<=r*1.05);if(rim.length<6||g.length-rim.length>2)continue;
  // Closed all round: the rim covers the circle (not an arc of a weld sign or a rounded corner).
  const len=rim.reduce((a,i)=>a+segs[i].l,0);if(len<2*Math.PI*r*0.85)continue;
  // A circle round a text is a balloon or a bubble, not a hole.
  if(labels.some(t=>Math.abs(t.x+(t.width||0)/2-c.x)<r&&Math.abs(t.y-(t.size||8)*0.36-c.y)<r))continue;
  // A hole has its centre marked: a line through its middle out past it (a centre line, the gauge line of a row); a
  // circle with none is a round bar cut across (the rungs Ø18 of a ladder, ГПЭС В124).
  const marked=segs.some(q=>{if(q.l<r*1.5)return false;const v={x:(q.b.x-q.a.x)/q.l,y:(q.b.y-q.a.y)/q.l},w={x:c.x-q.a.x,y:c.y-q.a.y},t=w.x*v.x+w.y*v.y;
   return Math.abs(w.x*v.y-w.y*v.x)<r*0.25&&(t>r*1.3||q.l-t>r*1.3)&&t>-r*0.2&&t<q.l+r*0.2});
  if(!marked)continue;
  if(!out.some(o=>dist(o,c)<r))out.push({x:c.x,y:c.y,size:2*r,shape:"circle"})
 }
 return out
}
// The callouts «Ø23 / 2 отв.» («Ç» is the sign Ø of a CAD font without it; the number may be a text of its own), «отв.
// Ø50 4 отв.», «4 отв. Ø22»: the diameter, the count, where the text stands.
const DIA=/^(?:отв\.?\s*)?[ØøÇç⌀∅Фф]\s*(\d{1,2}(?:[.,]\d)?)(?:\s*мм)?(?:\s+(\d{1,3})\s*отв\.?)?$/u,SIGN=/^[ØøÇç⌀∅Фф]$/u,COUNT=/^(\d{1,3})\s*отв\.?(?:\s*[ØøÇç⌀∅Фф]\s*(\d{1,2}(?:[.,]\d)?))?$/u;
function holeCallouts(texts){
 const flat=texts.filter(t=>Math.abs(Math.round(t.angle||0))<10),out=[],used=new Set();
 for(const t of flat){
  const s=String(t.str).trim(),z=t.size||10;let d=null,n=null,m;
  if((m=DIA.exec(s))){d=+m[1].replace(",",".");n=m[2]?+m[2]:null}
  else if(SIGN.test(s)){const num=flat.find(o=>o!==t&&/^\d{1,2}(?:[.,]\d)?$/.test(String(o.str).trim())&&Math.abs(o.y-t.y)<z*0.4&&o.x>t.x&&o.x-(t.x+(t.width||z*0.6))<z*0.6);
   if(num){d=+String(num.str).trim().replace(",",".");used.add(num)}}
  if(!d||d<5||d>60)continue;
  if(n===null){const c=flat.find(o=>{const m2=COUNT.exec(String(o.str).trim());return m2&&o.y>t.y&&o.y-t.y<z*1.8&&Math.abs(o.x-t.x)<z*2.5});if(c)n=+COUNT.exec(String(c.str).trim())[1]}
  out.push({d,n,x:t.x,y:t.y,size:z,width:Math.max(t.width||0,z*1.6)})
 }
 return out
}
// The hole a callout's leader points to: from the shelf under the text (or the text itself) a line runs to the sign;
// its far end is at the sign (an arrow) or across it.
function leaderHoles(call,segs,holes){
 const z=call.size,box={x0:call.x-z*0.6,x1:call.x+call.width+z*0.6,y0:call.y-z*1.2,y1:call.y+z*1.4};
 const inBox=p=>p.x>=box.x0&&p.x<=box.x1&&p.y>=box.y0&&p.y<=box.y1;
 let best=null;
 for(const s of segs){
  if(s.l<z*0.8)continue;
  for(const [p,q] of [[s.a,s.b],[s.b,s.a]]){
   if(!inBox(p)||inBox(q))continue;
   // The sign at the far end, or on the line near it (the leader runs through a row of holes).
   const along=(p,q,l,extra)=>{for(const h of holes){const v={x:(q.x-p.x)/l,y:(q.y-p.y)/l},w={x:h.x-p.x,y:h.y-p.y},t=w.x*v.x+w.y*v.y,off=Math.abs(w.x*v.y-w.y*v.x);
    if(t<l*0.5||t>l+h.size*1.5||off>Math.max(1.2,h.size*0.8))continue;
    const k=extra+Math.abs(l-t)+off;if(!best||k<best.k)best={k,hole:h}}};
   along(p,q,s.l,0);
   // (the shelf under the text, the leader on from its end — ГПЭС Ф2-1 «Ø27 в шайбе»)
   if(Math.abs(p.y-q.y)<0.5)for(const s2 of segs){if(s2===s||s2.l<z*0.8)continue;
    for(const [a,b] of [[s2.a,s2.b],[s2.b,s2.a]])if(Math.hypot(a.x-q.x,a.y-q.y)<=1.5&&!inBox(b))along(a,b,s2.l,0.5)}
  }
 }
 return best?best.hole:null
}
// The size between two places along a direction by the dimensions written there: one dimension, or a chain of them
// (on any lines: «150» then «75»), as the drawing says it — a place measured at the scale is off by the rounding of
// the drawing's coordinates (0.12 pt: 0.4 mm at 1:10). Null without such a chain or when it disagrees with the
// measured size.
function chainMm(dims,a,b,measured,tol=0.6){
 const nodes=[],at=p=>{let i=nodes.findIndex(q=>Math.abs(q-p)<=tol);if(i<0){nodes.push(p);i=nodes.length-1}return i},adj=new Map();
 for(const d of dims){const i=at(d.lo),j=at(d.hi);if(i===j)continue;for(const [x,y,v] of [[i,j,d.v],[j,i,-d.v]]){if(!adj.has(x))adj.set(x,[]);adj.get(x).push([y,v])}}
 const s=nodes.findIndex(q=>Math.abs(q-a)<=tol),t=nodes.findIndex(q=>Math.abs(q-b)<=tol);
 if(s<0||t<0)return s>=0&&s===t?0:null;
 const seen=new Map([[s,0]]),queue=[s];
 while(queue.length){const x=queue.shift();if(x===t)break;for(const [y,v] of adj.get(x)||[])if(!seen.has(y)){seen.set(y,seen.get(x)+v);queue.push(y)}}
 if(!seen.has(t))return null;
 const v=Math.abs(seen.get(t));return Math.abs(v-measured)<=Math.max(3,measured*0.03)?v:null
}
// The places along a member by the dimensions written along it: the extension lines joined by dimensions (on any lines
// beside the view, the nearer first; one that disagrees with them is left) get their sizes as the drawing writes them;
// two of them no dimension joins, near each other (≤ `bridge` pt: a size left unwritten, «39» beside «206»), are joined
// at the scale `n` (pt per mm). A place between two of them is taken in proportion where the view is drawn at its scale
// there, else from the nearer of them at the scale (a view drawn shorter in the middle — «7350» over a third of its
// length, its ends at 1:10, ГПЭС К36 — has its holes at the ends). → {mm(a, b): the size from a to b, null when
// nothing joins them; at(p): true at an extension line}.
function chainMap(dims,n,{tol=0.6,bridge=60}={}){
 // (a dimension drawn many times longer than its size at the scale is not one: its number is another's — ГПЭС К187
 // «Вид Б», «60» of the holes read on the line of «4196»; a view is drawn shorter, a small size a little larger)
 dims=dims.filter(d=>!(d.hi-d.lo>Math.max(20,5*Math.abs(d.v)*n)));
 let nodes,par,off,order;
 const at=p=>{let i=nodes.findIndex(q=>Math.abs(q-p)<=tol);if(i<0){nodes.push(p);i=nodes.length-1}return i};
 const find=i=>{let o=0,r=i;while(par[r]!==r){o+=off[r];r=par[r]}return[r,o]};
 const join=(i,j,v)=>{const [ri,oi]=find(i),[rj,oj]=find(j);if(ri===rj)return;par[rj]=ri;off[rj]=v+oi-oj};
 const val=i=>find(i)[1],root=i=>find(i)[0];
 const build=list=>{nodes=[];par=[];off=[];
  for(const d of list){const i=at(d.lo),j=at(d.hi);while(par.length<nodes.length){par.push(par.length);off.push(0)}if(i!==j)join(i,j,d.v)}
  order=nodes.map((p,i)=>({p,i})).sort((a,b)=>a.p-b.p);
  const gaps=order.slice(1).map((b,k)=>({a:order[k],b,gap:b.p-order[k].p})).filter(x=>x.gap<=bridge).sort((x,y)=>x.gap-y.gap);
  for(const {a,b,gap} of gaps)join(a.i,b.i,gap/n)};
 // (the places along go on one way: a dimension that turns them back — its end read at a line crossing it, ГПЭС К68
 // «3980» to 1397 where the column ends at 1565 by «10335» — goes, the one of the end fewer dimensions come to)
 for(let k=0;k<6;k++){build(dims);
  const deg=new Map();for(const d of dims)for(const p of [d.lo,d.hi]){const i=nodes.findIndex(q=>Math.abs(q-p)<=tol);deg.set(i,(deg.get(i)||0)+1)}
  let bad=null;for(let x=0;x<order.length&&!bad;x++)for(let y=x+1;y<order.length;y++){const A=order[x],B=order[y];if(root(A.i)===root(B.i)&&val(A.i)>val(B.i)+1){bad=[A,B];break}}
  if(!bad)break;const drop=bad.sort((a,b)=>(deg.get(a.i)||0)-(deg.get(b.i)||0))[0].p;
  const rest=dims.filter(d=>Math.abs(d.lo-drop)>tol&&Math.abs(d.hi-drop)>tol);if(rest.length===dims.length)break;dims=rest}
 build(dims);
 // A place: its value from the root of its extension lines' group.
 const place=p=>{
  const k=order.findIndex(q=>Math.abs(q.p-p)<=tol);if(k>=0)return{r:root(order[k].i),v:val(order[k].i),node:true};
  const L=[...order].reverse().find(q=>q.p<p),R=order.find(q=>q.p>p);
  if(L&&R&&root(L.i)===root(R.i)){const vl=val(L.i),vr=val(R.i),r=(vr-vl)/(R.p-L.p);
   if(Math.abs(r*n-1)<=0.03)return{r:root(L.i),v:vl+(p-L.p)*r};
   const v=p-L.p<=R.p-p?vl+(p-L.p)/n:vr-(R.p-p)/n;return{r:root(L.i),v:Math.min(Math.max(v,Math.min(vl,vr)),Math.max(vl,vr)),span:[Math.min(vl,vr),Math.max(vl,vr)],prop:vl+(p-L.p)*r}}
  const q=[L,R].filter(Boolean).sort((a,b)=>Math.abs(a.p-p)-Math.abs(b.p-p))[0];
  return q?{r:root(q.i),v:val(q.i)+(p-q.p)/n}:null
 };
 return{mm(a,b){const A=place(a),B=place(b);return A&&B&&A.r===B.r?B.v-A.v:null},at:p=>order.some(q=>Math.abs(q.p-p)<=tol),
  // (a place in a stretch drawn shorter: the stretch from a, and the place in proportion — not certain)
  span(a,b){const A=place(a),B=place(b);return A&&B&&A.r===B.r&&B.span?{v:B.prop-A.v,span:B.span.map(x=>x-A.v)}:null},
  // (a place not joined with a by the dimensions: from the nearest place that is, at the scale)
  near(a,p){const A=place(a);if(!A)return null;const q=order.filter(q=>root(q.i)===A.r).sort((x,y)=>Math.abs(x.p-p)-Math.abs(y.p-p))[0];return q?val(q.i)-A.v+(p-q.p)/n:null},
  // (the extension lines joined with a: their sizes from it)
  marks(a){const A=place(a);return A?order.filter(q=>root(q.i)===A.r).map(q=>({p:q.p,v:val(q.i)-A.v})):[]}}
}
// The convex outline of points [[x, y]] (a gusset drawn with its cut corners: its edges).
function hull(pts){
 const p=[...new Map(pts.map(e=>[e.map(v=>Math.round(v*10)).join(),e])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;
 const x=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lo=[],hi=[];
 for(const e of p){while(lo.length>=2&&x(lo[lo.length-2],lo[lo.length-1],e)<=0)lo.pop();lo.push(e)}
 for(const e of p.slice().reverse()){while(hi.length>=2&&x(hi[hi.length-2],hi[hi.length-1],e)<=0)hi.pop();hi.push(e)}
 return lo.slice(0,-1).concat(hi.slice(0,-1))
}
// The standard scale of the dimensions around a place: pt per mm of the member.
function scaleNear(dims,box,{all=false}={}){
 const list=dims.filter(d=>{const c=(d.lo+d.hi)/2;return d.flat?c>=box.x0&&c<=box.x1&&d.line>=box.y0&&d.line<=box.y1:c>=box.y0&&c<=box.y1&&d.line>=box.x0&&d.line<=box.x1});
 let best=null;
 for(const k of SCALES){const n=PT/k,agree=list.filter(d=>Math.abs((d.hi-d.lo)/d.v-n)/n<=0.03);if(agree.length&&(!best||agree.length>best.count))best={k,n,count:agree.length,agree,list}}
 if(best)Object.defineProperties(best,{agree:{enumerable:false},list:{enumerable:false}});
 // (`all`: the dimensions there, none at a scale)
 return best||(all?{k:null,n:null,count:0,agree:[],list}:null)
}
// The edges of members: long lines of one direction and one offset joined (an edge broken by a gusset drawn over it
// is one line); dash-dot and dashed lines (an axis, a hidden web) are not edges — their pieces are short.
function edgeLines(segs,dimLine,{widthPt=0,heightPt=0,thick=null}={}){
 // (when the lines carry widths, an edge is a thick line: an extension line run on from it is no part of it, ГПЭС К17а)
 const pieces=segs.filter(s=>s.l>=40&&(!thick||thick(s))).map(s=>{
  let u={x:(s.b.x-s.a.x)/s.l,y:(s.b.y-s.a.y)/s.l};
  // One sense for each direction: along +x (or +y when upright).
  if(u.x<-1e-6||Math.abs(u.x)<=1e-6&&u.y<0)u={x:-u.x,y:-u.y};
  // (a line drawn along the sheet or upright is taken exactly so: a slant of a hundredth of a degree moved the places)
  if(Math.abs(u.x)>0.999999)u={x:1,y:0};else if(Math.abs(u.y)>0.999999)u={x:0,y:1};
  const n={x:-u.y,y:u.x},p0=Math.min(s.a.x*u.x+s.a.y*u.y,s.b.x*u.x+s.b.y*u.y);
  return{u,n,s0:p0,s1:p0+s.l,off:s.a.x*n.x+s.a.y*n.y,l:s.l,a:s.a}
 }).filter(q=>!dimLine(q)).sort((a,b)=>a.off-b.off);
 const lines=[];
 for(const q of pieces){
  const line=lines.find(L=>Math.abs(L.u.x*q.u.y-L.u.y*q.u.x)<0.003&&Math.abs(L.off-q.off)<=0.35);
  if(line){line.pieces.push(q);line.s0=Math.min(line.s0,q.s0);line.s1=Math.max(line.s1,q.s1)}else lines.push({u:q.u,n:q.n,off:q.off,s0:q.s0,s1:q.s1,pieces:[q]})
 }
 const measure=L=>{
  const iv=L.pieces.map(q=>[q.s0,q.s1]).sort((a,b)=>a[0]-b[0]);let cov=0,e=-Infinity;
  for(const [a,b] of iv){if(b<=e)continue;cov+=b-Math.max(a,e);e=b}
  L.cover=cov;L.longest=Math.max(...L.pieces.map(q=>q.l))
 };
 for(const L of lines)measure(L);
 // (the frame of the sheet runs all across it)
 const frame=L=>Math.abs(L.u.x)>0.999?widthPt>0&&L.s1-L.s0>=widthPt*0.93:Math.abs(L.u.y)>0.999&&heightPt>0&&L.s1-L.s0>=heightPt*0.93;
 const edge=L=>L.cover>=(L.s1-L.s0)*0.6&&L.longest>=(L.s1-L.s0)*0.2&&!frame(L);
 // (two views in a row on the sheet, their edges on one line: each apart — ГПЭС К41 beside К39, 248 pt between)
 // (each a third of the longest of them at least, not of the whole line: ГПЭС К15 «1 - 1», its lower edge on one line
 // with rows of the table at the other side of the sheet)
 const runs=L=>{const out=[];for(const q of L.pieces.slice().sort((a,b)=>a.s0-b.s0)){const r=out[out.length-1];if(r&&q.s0-r.s1<=100){r.pieces.push(q);r.s1=Math.max(r.s1,q.s1)}else out.push({u:L.u,n:L.n,off:L.off,s0:q.s0,s1:q.s1,pieces:[q]})}
  for(const r of out)measure(r);const most=Math.max(...out.map(r=>r.s1-r.s0));return out.length>1?out.filter(r=>edge(r)&&r.s1-r.s0>=Math.max(300,most*0.3)):[]};
 return lines.flatMap(L=>edge(L)?[L]:runs(L))
}
// The member's view around a sign: the nearest edge on each side of it, of one direction, the sign within their
// length; of two directions — the longer edges (the member, not a stiffener across it).
function memberBand(h,edges,segs=null){
 let best=null;
 const dirs=[];for(const L of edges)if(!dirs.some(u=>Math.abs(u.x*L.u.y-u.y*L.u.x)<0.003))dirs.push(L.u);
 for(const u of dirs){
  const n={x:-u.y,y:u.x},sh=h.x*u.x+h.y*u.y,oh=h.x*n.x+h.y*n.y;
  // One edge runs past the sign; the other may stop short of it by a tenth of its length (hidden there under a gusset
  // drawn over the member), when the two run together.
  const near=edges.filter(L=>Math.abs(L.u.x*u.y-L.u.y*u.x)<0.003&&Math.abs(L.off-oh)<160),reach=(L,k)=>sh>=L.s0-k*(L.s1-L.s0)-2&&sh<=L.s1+k*(L.s1-L.s0)+2;
  const side=list=>list.filter(L=>reach(L,0))[0],full=near.filter(L=>reach(L,0.1));
  const up=full.filter(L=>L.off<oh-0.3).sort((a,b)=>b.off-a.off),down=full.filter(L=>L.off>oh+0.3).sort((a,b)=>a.off-b.off);
  const together=(a,b)=>a&&b&&Math.min(a.s1,b.s1)-Math.max(a.s0,b.s0)>=0.6*Math.min(a.s1-a.s0,b.s1-b.s0);
  let above=side(up),below=side(down);
  if(above&&!(below&&reach(below,0)))below=down.find(L=>together(L,above));
  else if(below&&!above)above=up.find(L=>together(L,below));
  if(!above||!below||!reach(above,0)&&!reach(below,0))continue;
  // (and the two are one outline: a line drawn across joins them at an end, square or slant — not two views of the
  // member one under the other, ГПЭС К17а: a plate's hole under its plan, over «Вид Б»)
  // (the line across may be in pieces, a little past the end: the edges of a base plate and the plates on it, ГПЭС В114)
  const joined=(a,b)=>{if(!segs)return true;const lo=Math.min(a.off,b.off),hi=Math.max(a.off,b.off),ends=[a.s0,a.s1,b.s0,b.s1],cover=ends.map(()=>[]);
   for(const q of segs){const p0=q.a.x*u.x+q.a.y*u.y,p1=q.b.x*u.x+q.b.y*u.y,c0=q.a.x*n.x+q.a.y*n.y,c1=q.b.x*n.x+q.b.y*n.y;
    if(Math.abs(p0-p1)<=0.6){ends.forEach((e,k)=>{if(Math.abs((p0+p1)/2-e)<=Math.max(2,(hi-lo)*0.1))cover[k].push([Math.max(Math.min(c0,c1),lo),Math.min(Math.max(c0,c1),hi)])});continue}
    const at=(p,c,L)=>Math.abs(c-L.off)<=2&&(Math.abs(p-L.s0)<=2||Math.abs(p-L.s1)<=2);
    if(at(p0,c0,a)&&at(p1,c1,b)||at(p0,c0,b)&&at(p1,c1,a))return true;
    // (an end cut aslant: from the end of one edge down to the end of the other, short of it across — a tube cut over
    // its seat, ГПЭС К16: from the top 100 mm in to 20 mm over the bottom at its end)
    const cut=(p,c,L)=>(Math.abs(p-L.s0)<=2||Math.abs(p-L.s1)<=2)&&c>=lo-1&&c<=hi+1;
    if(Math.abs(c0-c1)>=(hi-lo)*0.4&&Math.abs(p0-p1)>=1&&(at(p0,c0,a)&&cut(p1,c1,b)||at(p1,c1,a)&&cut(p0,c0,b)||at(p0,c0,b)&&cut(p1,c1,a)||at(p1,c1,b)&&cut(p0,c0,a)))return true}
   return cover.some(iv=>{let c=0,e=-Infinity;for(const [x,y] of iv.filter(([x,y])=>y>x).sort((p,q)=>p[0]-q[0])){if(y<=e)continue;c+=y-Math.max(x,e);e=y}return c>=(hi-lo)*0.8})};
  if(!joined(above,below))continue;
  // The outline goes on past a line inside the member (its web drawn in a plan of a flange, a stiffener's edge): the
  // next line out of the same length, not farther than half as much again as the member is wide so far.
  const same=(a,b)=>Math.abs(a.s0-b.s0)<=Math.max(3,(a.s1-a.s0)*0.02)&&Math.abs(a.s1-b.s1)<=Math.max(3,(a.s1-a.s0)*0.02);
  // (not past another line between, along the most of it and well apart from both — the plate of the node between two
  // gussets alike, ГПЭС К112 «3 - 3»: the inner edge of the other gusset as long, 85 pt on past the plate; a web's other
  // line by its first, К46 «7 - 7», is no such line)
  const clear=(a,b)=>{const lo=Math.min(a.off,b.off),hi=Math.max(a.off,b.off),s0=Math.max(a.s0,b.s0),s1=Math.min(a.s1,b.s1),m=0.2*(hi-lo);
   return!near.some(E=>E!==a&&E!==b&&E.off>lo+m&&E.off<hi-m&&Math.min(E.s1,s1)-Math.max(E.s0,s0)>=0.5*(s1-s0))};
  for(let k=0;k<6;k++){
   const w=below.off-above.off,up2=near.filter(L=>L.off<above.off-0.3&&above.off-L.off<=w*1.5&&same(L,above)&&joined(L,above)&&clear(L,above)).sort((a,b)=>b.off-a.off)[0];
   const dn2=near.filter(L=>L.off>below.off+0.3&&L.off-below.off<=w*1.5&&same(L,below)&&joined(L,below)&&clear(L,below)).sort((a,b)=>a.off-b.off)[0];
   if(!up2&&!dn2)break;
   // (the nearer first: one side at a time)
   if(up2&&(!dn2||above.off-up2.off<=dn2.off-below.off))above=up2;else below=dn2
  }
  // (a sign in a gusset beside a member: the member's edge on one side is the longest)
  const len=Math.max(above.s1-above.s0,below.s1-below.s0),len2=Math.min(above.s1-above.s0,below.s1-below.s0);
  if(!best||len>best.len+1||Math.abs(len-best.len)<=1&&len2>best.len2)best={u,n,above,below,len,len2}
 }
 return best
}
// The mark of a member's view: the mark's title over it (over a beam drawn along the sheet, over the top end of a
// column drawn upright); a «Вид А» or a section «1–1» over it — of the marks it names («5–5 для К34»), else of the
// mark whose view has the letter «А» (the number «1», «по 1») of its arrows; else the nearest mark title. A detail
// («Дет. поз. 3», «Узел 2») is a part.
const VID=/^Вид\s+([А-ЯЁA-Z]\d?)(?=\s|$|\()/u,CUT=/^(\d{1,2}[а-я]?|[А-ЯЁ])\s*[-–—]\s*\1(?=\s|$|\()/u,DETAIL=/^(?:Дет\.?\s*поз|Деталь|Дет\.\s|Узел\s)/iu;
function ownerOf(g,texts,titled,strokes=[]){
 const along=t=>t.x*g.u.x+t.y*g.u.y,across=t=>t.x*g.n.x+t.y*g.n.y,upright=Math.abs(g.u.y)>Math.abs(g.u.x);
 const centre=t=>({x:t.x+(t.width||0)/2,y:t.y});
 // How far over the view a text stands (null — not over it).
 // (and how far aside of it: of two titles over an upright plate the one over it — ГПЭС К32 «3 - 3 для К32, К37» and
 // «3 - 3 для К33, К36» side by side, the first a little lower)
 const over=(t,lim)=>upright?(across(t)>=g.lo-200&&across(t)<=g.hi+200&&along(t)<g.s0&&g.s0-along(t)<lim?g.s0-along(t)+Math.max(0,g.lo-across(t),across(t)-g.hi):null):
  (along(t)>=g.s0-40&&along(t)<=g.s1+40&&across(t)<g.lo&&g.lo-across(t)<lim?g.lo-across(t)+Math.max(0,g.s0-along(t),along(t)-g.s1):null);
 const nearest=(list,lim)=>list.map(x=>({x,d:over(x.at,lim)})).filter(o=>o.d!==null).sort((a,b)=>a.d-b.d)[0];
 const mains=titled.map(v=>({at:v.title_at,v})),titles=texts.filter(t=>{const v=String(t.str).trim();return VID.test(v)||CUT.test(v)||DETAIL.test(v)}).map(t=>({at:centre(t),t}));
 let own=nearest(mains,150),named=nearest(titles,150);
 // (the distance from a title to the view's outline)
 const box=t=>{const s=along(t),o=across(t);return Math.hypot(Math.max(0,g.s0-s,s-g.s1),Math.max(0,g.lo-o,o-g.hi))};
 // (none so near: a title of a view farther over it — five rows of dimensions between, ГПЭС В53 «Вид А» 170 pt over it —
 // when no mark's title is nearer by it, «В55» under it; a mark's title so far over is another view's, К150–К161 one
 // under another, and «2 - 2» far over К163 is another's, «К163, К164, К165» just under it)
 // (a detail's title stands over its own small drawing, not over a view far under it: ГПЭС В129 «Вид Б», «Дет. поз. 5»
 // between)
 if(!own&&!named){const far=nearest(titles.filter(o=>!DETAIL.test(String(o.t.str).trim())),400),by=Math.min(...titled.map(v=>box(v.title_at)));if(far&&far.d<by)named=far}
 if(named&&(!own||named.d<own.d)){
  const title=String(named.x.t.str).trim().replace(/\s+/g," ");
  if(DETAIL.test(title))return{title,view:null,detail:true};
  // The marks it names — in it or in the line «для К101» under it (ГПЭС л. 113: three cuts «4 - 4», «для К101»,
  // «для К103», «для К133»); else the arrows of its letter or number.
  const nt=named.x.t,z=nt.size||10,under=texts.filter(t=>t!==nt&&/^для\s/iu.test(String(t.str).trim())&&t.y>nt.y&&t.y-nt.y<=2.5*z&&t.x+(t.width||0)>=nt.x-z&&t.x<=nt.x+(nt.width||0)+z).map(t=>String(t.str)).join(" ");
  const marks=[...new Set(titled.flatMap(v=>v.marks))].filter(m=>new RegExp("(?:^|[^А-ЯЁа-яё\\d])"+m+"(?![\\dа-яё])","u").test(title+" "+under));
  const label=(VID.exec(title)||CUT.exec(title))[1],all=texts.filter(t=>t!==named.x.t&&new RegExp("^(?:по\\s*)?"+label+"$","u").test(String(t.str).trim()));
  // (an arrow's letter stands by the thick stroke of the cut — not the number of a position in its circle, ГПЭС К39
  // «1–1»: the balloon «1» under the title «К41, К41б, К42, К43»)
  const stroke=t=>{const c=centre(t);return strokes.some(s=>{const l=dist(s.a,s.b),k=Math.max(0,Math.min(1,((c.x-s.a.x)*(s.b.x-s.a.x)+(c.y-s.a.y)*(s.b.y-s.a.y))/(l*l||1)));return dist(c,{x:s.a.x+k*(s.b.x-s.a.x),y:s.a.y+k*(s.b.y-s.a.y)})<=35})};
  // (and is written as large as the title of the cut: not a size «4» by it, ГПЭС К14)
  const sized=all.filter(t=>!(named.x.t.size>0)||Math.abs((t.size||0)-named.x.t.size)<=named.x.t.size*0.2),pool=sized.length?sized:all;
  const cut=CUT.test(title),arrows=cut&&pool.some(stroke)?pool.filter(stroke):pool;
  // (the two arrows of one cut stand in a line, the member's view between them: of the pairs, the one nearest this view
  // — it is drawn by the view it is cut from —, and the title nearest the middle of it; a single arrow may be nearer
  // another view's title, ГПЭС К9/К11 «3 - 3», «по 5» of К10 by К8, «4 - 4» of К14 and of К12)
  // (a cut's: a view «Вид А» has one arrow)
  const pairs=[];if(cut)for(let i=0;i<arrows.length;i++)for(let j=i+1;j<arrows.length;j++){const a=centre(arrows[i]),b=centre(arrows[j]);
   const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);if(Math.min(dx,dy)<=Math.max(5,0.02*Math.max(dx,dy))&&dist(a,b)>=30)pairs.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2,ends:[arrows[i],arrows[j]]})}
  const off=t=>{const s=along(t),o=across(t);return Math.hypot(Math.max(0,g.s0-s,s-g.s1),Math.max(0,g.lo-o,o-g.hi))};
  // (the place of the cut: the middle of its two strokes — the numbers stand beside them —, else of its two numbers)
  const strokeBy=t=>{const c=centre(t);let best=null;for(const s of strokes){const l=dist(s.a,s.b),k=Math.max(0,Math.min(1,((c.x-s.a.x)*(s.b.x-s.a.x)+(c.y-s.a.y)*(s.b.y-s.a.y))/(l*l||1))),d=dist(c,{x:s.a.x+k*(s.b.x-s.a.x),y:s.a.y+k*(s.b.y-s.a.y)});
   if(d<=35&&(!best||d<best.d))best={d,m:{x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2}}}return best?.m};
  const placeOf=p=>{const sa=strokeBy(p.ends[0]),sb=strokeBy(p.ends[1]);return sa&&sb&&dist(sa,sb)>=10?{x:(sa.x+sb.x)/2,y:(sa.y+sb.y)/2}:{x:p.x,y:p.y}};
  const inBox=(p,b)=>b&&p.x>=b.x0&&p.x<=b.x1&&p.y>=b.y0&&p.y<=b.y1;
  // (the marks named: its arrows those on a view of them, the nearest)
  if(marks.length){const mine=pairs.filter(p=>titled.some(v=>inBox(p,v.box)&&v.marks.some(m=>marks.includes(m)))).sort((a,b)=>off(a)-off(b))[0];
   return{title,view:titled.find(v=>marks.every(m=>v.marks.includes(m)))||{marks,title},named:marks,...(mine?{cut:placeOf(mine)}:{})}}
  // (a view of a detail: titled in a row with a «Дет. поз.» beside it, its arrow by that detail's drawing, away from
  // every member's view — ГПЭС К182 «Вид В», the flange of «Дет. поз. 1» drawn apart; its holes are the member's own,
  // read in its view. Not a member's view with a detail's title by its arrow — an axis «А» in its circle on the base
  // plate of «Дет. поз. 17», К29 «Вид А» — or with a detail's title in its row, К66 «Вид Б» and «Дет. поз. 8»)
  const dets=texts.filter(t=>DETAIL.test(String(t.str).trim())).map(centre),gap=(p,b)=>b?Math.hypot(Math.max(0,b.x0-p.x,p.x-b.x1),Math.max(0,b.y0-p.y,p.y-b.y1)):Infinity;
  const row=dets.some(q=>Math.abs(q.y-centre(nt).y)<=z&&Math.abs(q.x-centre(nt).x)<=400);
  if(!cut&&row&&arrows.length&&arrows.every(a=>{const c=centre(a),d=Math.min(...dets.map(q=>dist(c,q)));return d<=300&&titled.every(v=>gap(c,v.box)>d)}))return{title,view:null,detail:true};
  const pair=pairs.sort((a,b)=>off(a)-off(b))[0];
  // (the titles over it, the nearest first)
  const above=titled.filter(v=>{const t=v.title_at;return upright?across(t)>=g.lo-200&&across(t)<=g.hi+200&&along(t)<g.s0:along(t)>=g.s0-40&&along(t)<=g.s1+40&&across(t)<g.lo}).sort((a,b)=>off(a.title_at)-off(b.title_at));
  // (a view not as long as this one when the title next over it alone is: a cut lettered otherwise than its arrows, ГПЭС
  // «4 - 4» of К16 under arrows «2», К18's «по4» nearer)
  // (of two as long, the nearer by its length: «4 - 4» of К14 2205, К12 2195 on the sheet too)
  const long=v=>Number(v.length_mm)>0&&Math.abs(v.length_mm-g.length)<=Math.max(10,g.length*0.01),fit=titled.filter(long),by=v=>Math.abs(v.length_mm-g.length);
  const sure=v=>v&&Number(v.length_mm)>0&&!long(v)&&above[0]&&long(above[0])&&fit.every(f=>by(f)>=by(above[0]))?above[0]:v;
  // (no cut of its letter by it — the arrows lettered otherwise, ГПЭС «4 - 4» of К14 under arrows «8»: the title nearest it)
  const cutAt=pair?{cut:placeOf(pair)}:{};
  // (a section drawn far from its cut, the cut on a view of the sheet: that view's — ГПЭС «8-8» drawn under Ф14, its
  // arrows at the foot of Ф15)
  const on=pair?titled.filter(v=>inBox(pair,v.box)):[];
  // (not when that view is not as long and the one next over it is: «4 - 4» of К14 under it, «по4» on К10 by К10's own cut)
  if(pair&&off(pair)>300){const v=(on.length===1?on[0]:null)||above[0]||titled.slice().sort((a,b)=>off(a.title_at)-off(b.title_at))[0];if(v)return{title,view:sure(v),...cutAt}}
  let best=null;
  for(const a of pair?[pair]:arrows)for(const v of titled){const d=Math.hypot(a.x-v.title_at.x,a.y-v.title_at.y);if(!best||d<best.d)best={d,v}}
  return{title,view:sure(best?.v)||(titled.length===1?titled[0]:null),...cutAt}
 }
 if(own)return{title:own.x.v.title,view:own.x.v,main:true};
 const near=titled.slice().sort((a,b)=>box(a.title_at)-box(b.title_at))[0];
 return{title:near?near.title:"",view:near||null}
}
// Holes of the sheet by view of a member: [{title, marks, scale, length_mm, band_mm, holes:[{at_mm, off_mm, d_mm, sign,
// from, part?}]}] — at_mm from the start of the member's outline (left, or top), off_mm from its axis (+ down, or + left
// of an upright one); of a plate drawn apart (sections) + down or + right.
// `views` — the titled views of the sheet (src/ai-sheet-extract.js assemblyViews: marks, title_at, length_mm); `allMm` —
// the diameter of the holes not named («Все отверстия Ø23»). The signs in plates drawn apart (sections, details) are
// counted in `parts`, the signs not in any member or plate in `loose`.
function sheetHoles({texts=[],segments=[],widthPt=0,heightPt=0}={},{views=[],allMm=null,seed=false,withMembers=false}={}){
 const segs=dedupe(segments),signs=holeSymbols(segments,texts);
 if(!signs.length&&!seed)return{views:[],parts:0,loose:0};
 const calls=holeCallouts(texts),dims=dimensionsOf(texts,segments).filter(d=>d.v>=50&&d.v<=40000);
 for(const c of calls){const h=leaderHoles(c,segs,signs);if(h){c.hole=h;if(!h.call)h.call=c}}
 const dimLine=q=>dims.some(d=>(d.flat?Math.abs(q.u.y)<0.001&&Math.abs(d.line-q.a.y)<0.6:Math.abs(q.u.x)<0.001&&Math.abs(d.line-q.a.x)<0.6)&&q.s0<=d.hi+1&&q.s1>=d.lo-1);
 // (a line through the middles of holes is their gauge line, not an edge)
 const gauge=L=>signs.some(h=>{const sh=h.x*L.u.x+h.y*L.u.y;return Math.abs(h.x*L.n.x+h.y*L.n.y-L.off)<Math.max(0.5,h.size*0.15)&&sh>=L.s0-1&&sh<=L.s1+1});
 const thick=thickOf(segs),crossers=thick?segs.filter(thick):segs,edges=edgeLines(segs,dimLine,{widthPt,heightPt,thick}).filter(L=>!gauge(L)),titled=views.filter(v=>v.marks?.length&&v.title_at),len=L=>L.s1-L.s0;
 // The signs between the same two edges: one view of one part.
 const groups=new Map();
 // A sign in a plate at a member's end (a plate in the plane of its web run on past its end, its holes in it — ГПЭС
 // К131: the plate 44 pt across, the beam 533 pt on from it): the member's band — the band across the plate, from a point
 // just past its side, the member's end there at the plate's line.
 const onEnd=(h,b)=>{if(b.len>=120)return b;const sh=h.x*b.u.x+h.y*b.u.y;
  for(const [edge,o] of [[b.below.off,8],[b.above.off,-8]]){const p={x:b.u.x*sh+b.n.x*(edge+o),y:b.u.y*sh+b.n.y*(edge+o)},m=memberBand(p,edges,crossers);
   if(!m||Math.abs(m.u.x*b.n.x+m.u.y*b.n.y)<0.999||m.len<3*b.len)continue;
   const oh=h.x*m.n.x+h.y*m.n.y,e={x:b.u.x*sh+b.n.x*edge,y:b.u.y*sh+b.n.y*edge},se=e.x*m.u.x+e.y*m.u.y;
   if(oh<m.above.off-0.5||oh>m.below.off+0.5||![m.above,m.below].some(L=>Math.abs(L.s0-se)<=3||Math.abs(L.s1-se)<=3))continue;
   h.onEnd=true;return m}
  return b};
 for(const h of signs){
  const b0=memberBand(h,edges,crossers);if(!b0){h.loose=true;continue}const b=onEnd(h,b0);
  const k=edges.indexOf(b.above)+"|"+edges.indexOf(b.below);
  if(!groups.has(k))groups.set(k,{u:b.u,n:b.n,above:b.above,below:b.below,signs:[]});groups.get(k).signs.push(h)
 }
 // (`seed`: the views of members with no hole sign in them as well — for the parts on them: the band by each long edge,
 // from a point just inside it)
 if(seed){const most=Math.max(0,...edges.map(len));
  for(const L of edges){if(len(L)<Math.max(150,most*0.15))continue;
   for(const side of [1,-1]){const s=(L.s0+L.s1)/2,o=L.off+side*1.2,b=memberBand({x:L.u.x*s+L.n.x*o,y:L.u.y*s+L.n.y*o},edges,crossers);if(!b)continue;
    const k=edges.indexOf(b.above)+"|"+edges.indexOf(b.below);if(!groups.has(k))groups.set(k,{u:b.u,n:b.n,above:b.above,below:b.below,signs:[],seeded:true})}}}
 // A member's view: both edges long. Signs between a member's edge and a short one are in a part on it (a gusset
 // welded on, the short edge its own): measured from the member's axis, marked so.
 const list=[...groups.values()],long=g=>Math.min(len(g.above),len(g.below))>=0.5*Math.max(len(g.above),len(g.below));
 // (the places are positions along x or y: the projection of an upright member's axis is −x across)
 const exactMm=(list,a,b,n)=>{const m=Math.abs(b-a)/n;const c=chainMm(list,Math.abs(a),Math.abs(b),m);return c===null?Math.round(m):c};
 // Along a member's view: its ends — the extreme extension lines of the dimensions along it beside it, when they take in
 // its edges and not much more (its edges hidden at an end under plates drawn over it: В114, 200 mm under the top); the
 // places by the chains of dimensions from the start when they reach its end (a view drawn shorter than its scale), else
 // at the scale. Its length so (ГПЭС К36 «7–7»: 7500 drawn as 2262 at 1:10).
 const alongOf=g=>{
  const square=Math.abs(g.u.x)>0.999||Math.abs(g.u.y)>0.999,flatU=Math.abs(g.u.x)>0.999,alongDims=square?dims.filter(d=>d.flat===flatU):[];
  const cross=d=>flatU?d.line:-d.line,lo=Math.min(g.lo,g.hi),hi=Math.max(g.lo,g.hi);
  const beside=alongDims.filter(d=>cross(d)>=lo-250&&cross(d)<=hi+250&&d.hi>=g.s0&&d.lo<=g.s1);
  // (an end is drawn there: a line across the member — not an axis the dimensions start from, ГПЭС К36: «75» from the
  // axis, «65» from the end)
  const drawnAt=e=>g.cross.some(p=>Math.abs(p-e)<=0.6);
  // (each end apart, step by step along the dimensions that reach it: «223» to the cap plate's underside, «12» on to its
  // top — ГПЭС В113 «Вид А», its edges hidden under the plates of the node)
  {const L=g.s1-g.s0,near=alongDims.filter(d=>cross(d)>=lo-250&&cross(d)<=hi+250);
   for(let k=0;k<4;k++){const d=near.filter(d=>d.lo<g.s0-0.6&&d.hi>=g.s0-0.6&&g.s0-d.lo<=L*0.25&&drawnAt(d.lo)).sort((a,b)=>a.lo-b.lo)[0];if(!d)break;g.s0=d.lo}
   for(let k=0;k<4;k++){const d=near.filter(d=>d.hi>g.s1+0.6&&d.lo<=g.s1+0.6&&d.hi-g.s1<=L*0.25&&drawnAt(d.hi)).sort((a,b)=>b.hi-a.hi)[0];if(!d)break;g.s1=d.hi}}
  // (the dimensions beside it, the nearer first)
  const gap=d=>Math.max(0,lo-cross(d),cross(d)-hi),map=chainMap(beside.slice().sort((a,b)=>gap(a)-gap(b)),g.sc.n);
  g.byChain=map.at(g.s0)&&map.at(g.s1)&&map.mm(g.s0,g.s1)>0;
  // (a place the chains from the start do not reach: from the nearest place they do — a view drawn shorter, broken off
  // over it: ГПЭС К68, a part under «5 - 5» 904 down read 602 from the top at the scale)
  g.alongMm=p=>{const v=map.mm(g.s0,p)??map.near(g.s0,p);return Math.round(v===null?(p-g.s0)/g.sc.n:v)};
  g.alongSpan=p=>{const o=map.span(g.s0,p);return o&&{v:Math.round(o.v),span:o.span.map(Math.round)}};
  g.marksAt=()=>map.marks(g.s0).map(m=>({p:m.p,v:Math.round(m.v)}));
  g.length=g.alongMm(g.s1)
 };
 // A member's view: both edges long, at a scale of its dimensions, not shorter than half the longest view of its mark
 // (a plate drawn apart — a detail, a section — is not).
 const members=[];
 // (the strokes of the cuts: short lines much thicker than the outlines)
 const strokes=(()=>{if(!thick)return[];const by=new Map();for(const q of segs)if(thick(q))by.set(q.w,(by.get(q.w)||0)+q.l);const W=[...by].sort((a,b)=>b[1]-a[1])[0]?.[0];
  return W?segs.filter(q=>q.w>=W*1.8&&q.l>=8&&q.l<=80):[]})();
 const longs=list.filter(long).sort((a,b)=>(b.below.off-b.above.off)-(a.below.off-a.above.off));
 for(const g of longs){g.lo=g.above.off;g.hi=g.below.off;g.s0=Math.min(g.above.s0,g.below.s0);g.s1=Math.max(g.above.s1,g.below.s1);g.edges=[g.above,g.below]}
 // The side of a beam whose web between the flanges is cut by a line along it (a gusset seen edge-on, ГПЭС В59 «8»
 // under the top): two thin bands as long one over the other — its flanges — and no band of its web between them: one
 // view from the outer line of one to the outer line of the other.
 for(const a of longs.slice())for(const b of longs.slice()){
  if(a===b||a.twin||b.twin||Math.abs(a.u.x*b.u.y-a.u.y*b.u.x)>=0.003||b.lo<a.hi)continue;
  const wa=a.hi-a.lo,wb=b.hi-b.lo,w=Math.max(wa,wb),gap=b.lo-a.hi,L=a.s1-a.s0;
  if(w>12||Math.abs(wa-wb)>Math.max(0.5,0.25*w)||gap<8*w||gap>40*w||Math.abs(a.s0-b.s0)>0.02*L+3||Math.abs(a.s1-b.s1)>0.02*L+3)continue;
  // (no line between them along a third of it: not two views one over the other)
  if(edges.some(E=>Math.abs(E.u.x*a.u.y-E.u.y*a.u.x)<0.003&&E.off>a.hi+0.5&&E.off<b.lo-0.5&&Math.min(E.s1,a.s1)-Math.max(E.s0,a.s0)>=0.3*L))continue;
  a.twin=b.twin=true;longs.push({u:a.u,n:a.n,above:a.above,below:b.below,signs:[],lo:a.lo,hi:b.hi,s0:Math.min(a.s0,b.s0),s1:Math.max(a.s1,b.s1),edges:[a.above,b.below]})}
 longs.sort((a,b)=>(b.hi-b.lo)-(a.hi-a.lo));
 // A view split by a line along it (the web of a beam in the plan of its flange, ГПЭС К32 «1–1»): its parts are one.
 for(const g of longs)if(!g.into)for(const h of longs)if(h!==g&&!h.into&&Math.abs(g.u.x*h.u.y-g.u.y*h.u.x)<0.003&&h.lo>=g.lo-0.5&&h.hi<=g.hi+0.5&&
  Math.min(g.s1,h.s1)-Math.max(g.s0,h.s0)>=0.8*Math.min(g.s1-g.s0,h.s1-h.s0)){h.into=g;g.signs.push(...h.signs);h.signs=[];g.edges.push(...h.edges);g.s0=Math.min(g.s0,h.s0);g.s1=Math.max(g.s1,h.s1)}
 const scaled=[],unscaled=[];
 for(const g of longs.filter(g=>!g.into)){
  // Its edges run on in a row past a gap wide in both (the member and a row of the table beside it, ГПЭС К17 «3 - 3»:
  // 7939 mm instead of 4320): the stretch with its signs.
  {const gapMax=Math.max(60,6*(g.hi-g.lo)),runs=[],at=g.signs.map(h=>h.x*g.u.x+h.y*g.u.y);
   for(const [a,b] of g.edges.flatMap(L=>L.pieces.map(q=>[q.s0,q.s1])).sort((p,q)=>p[0]-q[0])){const r=runs[runs.length-1];if(r&&a-r[1]<=gapMax)r[1]=Math.max(r[1],b);else runs.push([a,b])}
   const i0=runs.findIndex(r=>r[1]>=Math.min(...at)-2),i1=runs.map(r=>r[0]<=Math.max(...at)+2).lastIndexOf(true);
   if(runs.length>1&&i0>=0&&i1>=i0){g.s0=Math.max(g.s0,runs[i0][0]);g.s1=Math.min(g.s1,runs[i1][1])}}
  // Its ends: the outermost lines drawn across it by the ends of its edges (an end plate) — not an axis or a centre line
  // run on past it (ГПЭС К33: «65» from the plate, the middle line drawn on to the axis).
  g.cross=[];for(const q of segs){if(thick&&!thick(q))continue;const a=q.a.x*g.u.x+q.a.y*g.u.y,b=q.b.x*g.u.x+q.b.y*g.u.y;if(Math.abs(a-b)>0.6)continue;
   const c0=q.a.x*g.n.x+q.a.y*g.n.y,c1=q.b.x*g.n.x+q.b.y*g.n.y;if(Math.min(Math.max(c0,c1),g.hi)-Math.max(Math.min(c0,c1),g.lo)>=(g.hi-g.lo)*0.5)g.cross.push((a+b)/2)}
  // (an axis is a dash-dot line: its pieces one after another with short gaps — a long dash of it may cross the member,
  // ГПЭС В46: the axis 10 mm off the end plate)
  const w=g.hi-g.lo,axisAt=p=>{const iv=segs.filter(q=>Math.abs(q.a.x*g.u.x+q.a.y*g.u.y-p)<=0.3&&Math.abs(q.b.x*g.u.x+q.b.y*g.u.y-p)<=0.3).map(q=>{const c0=q.a.x*g.n.x+q.a.y*g.n.y,c1=q.b.x*g.n.x+q.b.y*g.n.y;return[Math.min(c0,c1),Math.max(c0,c1)]})
   .filter(([a,b])=>b>=g.lo-3*w&&a<=g.hi+3*w).sort((a,b)=>a[0]-b[0]);let gaps=0,e=null;for(const [a,b] of iv){if(e!==null&&a-e>=1&&a-e<=8)gaps++;e=e===null?b:Math.max(e,b)}return gaps>=2};
  g.cross=g.cross.filter(p=>!axisAt(p));
  {const st=g.edges.map(L=>Math.max(L.s0,g.s0)),en=g.edges.map(L=>Math.min(L.s1,g.s1)),m=Math.max(4,0.01*(g.s1-g.s0));
   const c0=g.cross.filter(p=>p>=Math.min(...st)-m&&p<=Math.max(...st)+2),c1=g.cross.filter(p=>p<=Math.max(...en)+m&&p>=Math.min(...en)-2);
   if(c0.length)g.s0=Math.min(...c0);if(c1.length)g.s1=Math.max(...c1)}
  // (its signs past an end, in a plate run on from it: the end is the plate's line across past them, the nearest)
  {const at=g.signs.filter(h=>h.onEnd).map(h=>h.x*g.u.x+h.y*g.u.y),L=g.s1-g.s0;
   if(at.length&&Math.min(...at)<g.s0-1){const c=g.cross.filter(p=>p<Math.min(...at)-1&&p>=g.s0-0.25*L);if(c.length)g.s0=Math.max(...c)}
   if(at.length&&Math.max(...at)>g.s1+1){const c=g.cross.filter(p=>p>Math.max(...at)+1&&p<=g.s1+0.25*L);if(c.length)g.s1=Math.min(...c)}}
  const p0={x:g.u.x*g.s0+g.n.x*g.lo,y:g.u.y*g.s0+g.n.y*g.lo},p1={x:g.u.x*g.s1+g.n.x*g.hi,y:g.u.y*g.s1+g.n.y*g.hi};
  const box={x0:Math.min(p0.x,p1.x)-120,x1:Math.max(p0.x,p1.x)+120,y0:Math.min(p0.y,p1.y)-120,y1:Math.max(p0.y,p1.y)+120};
  g.sc=scaleNear(dims,box);
  if(g.sc)scaled.push(g);else{const w=scaleNear(dims,box,{all:true});if(w?.list.length)unscaled.push(Object.assign(g,{sc:w}))}
 }
 // A scale only the dimensions along a view drawn shorter agree with by chance (between its breaks, «3730» at 1:39,
 // «3720» at 1:33 — ГПЭС К41) is not its own: the scale of the other views of the sheet.
 {const flat=g=>Math.abs(g.u.x)>0.999,square=g=>Math.abs(g.u.x)>0.999||Math.abs(g.u.y)>0.999;
  // (by chance: the scales the other dimensions along it are drawn at come near — all of them drawn shorter alike; a
  // dimension at the end of a view shortened in the middle is at its scale, ГПЭС К12 «6 - 6»: «60» at 1:10, «2090» at 1:24)
  const kOf=d=>PT/((d.hi-d.lo)/d.v),median=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
  const chance=g=>{if(!square(g)||!g.sc.agree.every(d=>d.flat===flat(g)))return false;const rest=g.sc.list.filter(d=>d.flat===flat(g)&&!g.sc.agree.includes(d));
   return rest.length>0&&Math.abs(median(g.sc.agree.map(kOf))-median(rest.map(kOf)))<=median(rest.map(kOf))*0.3};
  // (a view drawn at a scale of its own, not a standard one: its dimensions along it and across it all at it — ГПЭС К182
  // «Вид Б» at 1:13, «9730», «452», «250» along and «130» across)
  const own=g=>{let best=null;for(const d of g.sc.list){const c=g.sc.list.filter(e=>Math.abs(kOf(e)-kOf(d))<=kOf(d)*0.01);
    if(c.length>=3&&c.some(e=>e.flat===flat(g))&&c.some(e=>e.flat!==flat(g))&&(!best||c.length>best.length))best=c}
   if(!best)return null;const m=median(best.map(kOf)),k=Math.abs(m-Math.round(m))<=m*0.01?Math.round(m):Math.round(m*10)/10;return{k,n:PT/k,count:best.length}};
  // (a view drawn shorter with its middle left out: the sizes at its ends agree on one scale, the overall size spanning it
  // on a smaller one — the view is at the scale of its ends, a view is never drawn longer; ГПЭС К14 «4 - 4»: «50» at each
  // end at 1:10, «2205» and «2105» at 1:15, the band 210 instead of 140)
  const ends=g=>{if(!square(g))return null;const L=g.s1-g.s0,list=g.sc.list.filter(d=>d.flat===flat(g)&&d.lo>=g.s0-2&&d.hi<=g.s1+2);
   const end=list.filter(d=>d.hi-d.lo<=0.2*L&&(Math.abs(d.lo-g.s0)<=2||Math.abs(d.hi-g.s1)<=2)),over=list.filter(d=>d.hi-d.lo>=0.9*L);
   if(end.length<2||!over.length)return null;const ke=median(end.map(kOf));if(!end.every(d=>Math.abs(kOf(d)-ke)<=ke*0.03)||median(over.map(kOf))<ke*1.2)return null;
   const k=SCALES.find(s=>Math.abs(s-ke)<=ke*0.03);return k?{k,n:PT/k,count:end.length}:null};
  for(const g of scaled){const e=ends(g);if(e&&e.k!==g.sc.k)g.sc=Object.assign(e,{list:g.sc.list,agree:g.sc.agree})}
  const by=new Map();for(const g of scaled)if(!chance(g))by.set(g.sc.k,(by.get(g.sc.k)||0)+1);
  const k=[...by].sort((a,b)=>b[1]-a[1])[0]?.[0];
  for(const g of scaled)if(chance(g)){const o=own(g);if(o)g.sc=o;else if(k&&k!==g.sc.k)g.sc={k,n:PT/k,count:0}}
  // (and a view none of whose dimensions — all along it — is at a scale: ГПЭС К46 «5980» at 1:28)
  for(const g of unscaled)if(square(g)){const o=own(g);if(o){g.sc=o;scaled.push(g)}else if(k&&g.sc.list.every(d=>d.flat===flat(g))){g.sc={k,n:PT/k,count:0};scaled.push(g)}}}
 for(const g of scaled){alongOf(g);g.who=ownerOf(g,texts,titled,strokes);if(!g.who.detail)members.push(g)}
 // (the member is as long as its view says or its longest view of holes; a view of its mark shorter than half of it is
 // a plate — a base plate «1–1» under a column)
 const key=g=>(g.who.view?.marks||[]).join(","),longest=new Map();for(const g of members)longest.set(key(g),Math.max(longest.get(key(g))||0,g.length,Number(g.who.view?.length_mm)||0));
 const apart=[];for(let i=members.length-1;i>=0;i--)if(members[i].length<Math.max(300,longest.get(key(members[i]))*0.5))apart.push(...members.splice(i,1));
 // (a plate drawn apart, its holes: a cut «1 - 1» or a view «Вид А» of a mark — the base plate of a column, the end plate
 // of a beam seen from its end, a plate of a node; ГПЭС Ф15 «8-8»: □320 under the post, 4 holes Ø19)
 const plateSigns=new Map(apart.filter(g=>g.signs.length&&g.who.view&&(CUT.test(g.who.title)||VID.test(g.who.title))).map(g=>[g,g.signs.slice()]));
 // The other signs in a member's view (between other lines of it) are its own; beside it — within its length, off its
 // edge by no more than its width (a gusset of any shape on it) — in a part on it; the nearest member's. A sign on its
 // edge is in a part beside it too (a hole is never so near the edge, ГПЭС К32: a gusset's hole on the flange's line).
 const outOf=(h,g)=>Math.max(g.lo-(h.x*g.n.x+h.y*g.n.y),h.x*g.n.x+h.y*g.n.y-g.hi);
 for(const h of signs){
  if(members.some(g=>g.signs.includes(h)))continue;
  let best=null;
  for(const g of members){const sh=h.x*g.u.x+h.y*g.u.y,out=outOf(h,g);
   if(sh<g.s0-5||sh>g.s1+5||out>Math.max(40,g.hi-g.lo))continue;if(!best||out<best.out)best={g,out}}
  if(best){delete h.loose;best.g.signs.push(h);for(const g of list)if(!members.includes(g))g.signs=g.signs.filter(x=>x!==h)}
 }
 for(const g of members)for(const h of g.signs)if(outOf(h,g)>-h.size*0.5)h.part=true;
 // A sign inside a plate drawn apart, between other lines of it, is the plate's (ГПЭС В53 «1 - 1»: the hole of
 // «Дет. поз. 2» by the web, its own band the flange's — one hole of two read in each plate), the smallest plate first.
 {const inside=(h,g)=>{const s=h.x*g.u.x+h.y*g.u.y,o=h.x*g.n.x+h.y*g.n.y,m=h.size*0.5;return s>g.s0+m&&s<g.s1-m&&o>g.lo+m&&o<g.hi-m};
  const taken=new Set([...plateSigns.values()].flat()),plates=[...plateSigns.keys()].sort((a,b)=>(a.hi-a.lo)*(a.s1-a.s0)-(b.hi-b.lo)*(b.s1-b.s0));
  for(const h of signs){if(taken.has(h)||members.some(g=>g.signs.includes(h)&&!h.part))continue;const g=plates.find(g=>inside(h,g));if(!g)continue;
   plateSigns.get(g).push(h);delete h.loose;delete h.part;for(const m of members)m.signs=m.signs.filter(x=>x!==h)}}
 const out=[],parts=list.filter(g=>!members.includes(g)).reduce((a,g)=>a+g.signs.length,0);let unnamed=0;
 const holesIn=(g,signsOf=g.signs,alike=false)=>{
  const sc=g.sc,mm=v=>v/sc.n;
  // A callout names the diameter of the signs like the one it points to, as many as it says, the nearest first.
  for(const c of calls.filter(c=>c.hole&&signsOf.includes(c.hole))){
   const like=signsOf.filter(h=>(h.shape==="circle")===(c.hole.shape==="circle")&&Math.abs(h.size-c.hole.size)<0.6&&!h.call&&Boolean(h.part)===Boolean(c.hole.part)).sort((a,b)=>dist(a,c.hole)-dist(b,c.hole));
   for(const h of like.slice(0,Math.max(0,(c.n||1)-1)))h.call={...c,by:"count"}
  }
  // (`alike`: in a plate drawn apart a circle as large as one a callout names is such a hole too — ГПЭС Ф2-1 «1-1»:
  // «Ø40» on a leader to one of its four holes, no number)
  if(alike)for(const h of signsOf){if(h.call||h.shape!=="circle")continue;const o=signsOf.find(o=>o.call&&!o.call.by&&o.shape==="circle"&&Math.abs(o.size-h.size)<0.6);if(o)h.call={...o.call,by:"alike"}}
  // A sign's middle is where an extension line of a dimension runs through it (a sign drawn a little off it): taken
  // there, along and across (a member drawn along the sheet or upright).
  const square=Math.abs(g.u.x)>0.999||Math.abs(g.u.y)>0.999,ends=f=>square?[...new Set(dims.filter(d=>d.flat===f).flatMap(d=>[d.lo,d.hi]))]:[];
  const xs=ends(true),ys=ends(false),snap=(v,list,k)=>{let best=v,gap=k;for(const e of list)if(Math.abs(e-v)<=gap){best=e;gap=Math.abs(e-v)}return best};
  const axis=(g.lo+g.hi)/2,acrossDims=square?dims.filter(d=>d.flat!==(Math.abs(g.u.x)>0.999)):[];
  const alongMm=g.alongMm;
  const exact=(list,a,b)=>exactMm(list,a,b,sc.n);
  // A circle no callout or note names is not taken for a hole (a round bar cut across has a line through it as well).
  const named=signsOf.filter(h=>h.shape!=="circle"||h.call||allMm);
  const holes=named.map(h=>{const k=Math.min(0.5,h.size*0.15),p={x:snap(h.x,xs,k),y:snap(h.y,ys,k)},s=p.x*g.u.x+p.y*g.u.y,o=p.x*g.n.x+p.y*g.n.y;
   const drawn=h.shape==="circle"?mm(h.size):null,round=drawn?HOLE_D.reduce((a,b)=>Math.abs(b-drawn)<Math.abs(a-drawn)?b:a):null;
   const d=h.call?.d??allMm??(drawn&&Math.abs(round-drawn)<=2.5?round:null);
   // (its place on the sheet kept aside: a plate read in pieces is put together by it)
   return Object.defineProperty({at_mm:alongMm(s),off_mm:Math.sign(o-axis)*exact(acrossDims,axis,o),d_mm:d,sign:h.shape,...(h.part?{part:true}:{}),
    ...(h.call?{from:h.call.by==="alike"?"выноска (такое же отверстие)":h.call.by?"выноска (по числу отверстий)":"выноска"}:allMm?{from:"примечание «все отверстия»"}:d?{from:"по размеру на чертеже"}:{})},"pt",{value:{...p,shape:h.shape,size:h.size}})
  }).sort((a,b)=>a.at_mm-b.at_mm||a.off_mm-b.off_mm);
  return{holes,unnamed:signsOf.length-named.length}};
 for(const g of members){
  const sc=g.sc,mm=v=>v/sc.n,length=g.length,who=g.who,byChain=g.byChain,endMm=g.length,r0=holesIn(g),holes=r0.holes;unnamed+=r0.unnamed;
  out.push({title:who.title,marks:who.named||who.view?.marks||[],...(who.main?{main:true}:{}),scale:"1:"+sc.k,length_mm:length,...(byChain&&Math.abs(endMm-mm(g.s1-g.s0))>Math.max(5,endMm*0.03)?{not_to_scale:true}:{}),band_mm:Math.round(mm(g.hi-g.lo)),
   dir:Math.abs(g.u.x)>=Math.abs(g.u.y)?"по горизонтали":"по вертикали",holes})
 }
 // The plates drawn apart with their holes: its size (along its view, across), the holes from its start and its axis as a
 // member's; the place of its cut along the mark's view («1 - 1» at the foot of a column), when its arrows are by it.
 const sections=[],placeOf=new Map();
 for(const [g,own] of plateSigns){const r=holesIn(g,own,true);if(!r.holes.length)continue;const who=g.who,marks=who.named||who.view.marks;
  let at=null;
  // (on the longest view of its marks the cut crosses)
  if(who.cut){const crosses=m=>{const sa=who.cut.x*m.u.x+who.cut.y*m.u.y,c=who.cut.x*m.n.x+who.cut.y*m.n.y,w=m.hi-m.lo,L=m.s1-m.s0;return c>=m.lo-3*w&&c<=m.hi+3*w&&sa>=m.s0-0.05*L&&sa<=m.s1+0.05*L};
   const m=members.filter(o=>(o.who.view?.marks||[]).some(x=>marks.includes(x))&&crosses(o)).sort((a,b)=>b.length-a.length)[0];
   if(m){const sa=who.cut.x*m.u.x+who.cut.y*m.u.y;at={mm:m.alongMm(Math.max(m.s0,Math.min(m.s1,sa))),of:m.length,view:m.who.title,dir:Math.abs(m.u.x)>=Math.abs(m.u.y)?"по горизонтали":"по вертикали"}}}
  const s={title:who.title,marks,scale:"1:"+g.sc.k,plate_mm:[g.length,Math.round((g.hi-g.lo)/g.sc.n)],dir:Math.abs(g.u.x)>=Math.abs(g.u.y)?"по горизонтали":"по вертикали",
   // (across it + right on the sheet, as + down when it lies: an upright one's axis is measured + left)
   holes:r.holes.map(h=>Object.defineProperty({at_mm:h.at_mm,off_mm:Math.abs(g.u.y)>Math.abs(g.u.x)&&h.off_mm?-h.off_mm:h.off_mm,d_mm:h.d_mm,...(h.from?{from:h.from}:{})},"pt",{value:h.pt})),...(at?{at_mm:at.mm,of_mm:at.of,cut_on:at.view,cut_dir:at.dir}:{})};
  // (one plate between other pairs of its lines as well — drawn over by the lines of the node, ГПЭС К133 «4 - 4»: the
  // plate 478×299 three times, a hole or three in each —: one plate, its holes together)
  const corner=(a,o)=>({x:g.u.x*a+g.n.x*o,y:g.u.y*a+g.n.y*o}),c0=corner(g.s0,g.lo),c1=corner(g.s1,g.hi),box={x0:Math.min(c0.x,c1.x),x1:Math.max(c0.x,c1.x),y0:Math.min(c0.y,c1.y),y1:Math.max(c0.y,c1.y)};
  const area=b=>Math.max(0,b.x1-b.x0)*Math.max(0,b.y1-b.y0),same=sections.find(o=>{const b=placeOf.get(o);if(o.title!==s.title||o.dir!==s.dir||o.marks.join()!==s.marks.join()||Math.abs(o.plate_mm[0]-s.plate_mm[0])>2||Math.abs(o.plate_mm[1]-s.plate_mm[1])>2)return false;
   const i={x0:Math.max(b.x0,box.x0),x1:Math.min(b.x1,box.x1),y0:Math.max(b.y0,box.y0),y1:Math.min(b.y1,box.y1)};return area(i)>=0.8*Math.min(area(b),area(box))});
  if(same){for(const h of s.holes)if(!same.holes.some(o=>Math.abs(o.at_mm-h.at_mm)<=2&&Math.abs(o.off_mm-h.off_mm)<=2))same.holes.push(h);same.holes.sort((a,b)=>a.at_mm-b.at_mm||a.off_mm-b.off_mm);
   if(same.at_mm===undefined&&s.at_mm!==undefined)Object.assign(same,{at_mm:s.at_mm,of_mm:s.of_mm,cut_on:s.cut_on,cut_dir:s.cut_dir});continue}
  placeOf.set(s,box);sections.push(s)}
 // (one plate read in pieces across one another — the bands between the lines of a node drawn over it, ГПЭС К101
 // «4 - 4»: the gusset 644×480 as a band along its top and two upright ones by the column, a hole or four in each —:
 // one plate, the frame round them all, its holes from their places at the scale; not two plates side by side read
 // alike, К112 «3 - 3»)
 {const area=b=>Math.max(0,b.x1-b.x0)*Math.max(0,b.y1-b.y0),meet=(a,b)=>area({x0:Math.max(a.x0,b.x0),x1:Math.min(a.x1,b.x1),y0:Math.max(a.y0,b.y0),y1:Math.min(a.y1,b.y1)});
  const mixed=new Set();
  for(let again=true;again;){again=false;
   for(let i=0;i<sections.length&&!again;i++)for(let j=i+1;j<sections.length&&!again;j++){const a=sections[i],b=sections[j],A=placeOf.get(a),B=placeOf.get(b);
    if(a.title!==b.title||a.marks.join()!==b.marks.join()||a.scale!==b.scale||!(mixed.has(a)||mixed.has(b)||a.dir!==b.dir)||meet(A,B)<0.25*Math.min(area(A),area(B)))continue;
    if(![...a.holes,...b.holes].every(h=>h.pt))continue;
    const U={x0:Math.min(A.x0,B.x0),x1:Math.max(A.x1,B.x1),y0:Math.min(A.y0,B.y0),y1:Math.max(A.y1,B.y1)},n=PT/Number(a.scale.slice(2)),flat=U.x1-U.x0>=U.y1-U.y0;
    const holes=[];for(const h of [...a.holes,...b.holes]){const at=Math.round(((flat?h.pt.x-U.x0:h.pt.y-U.y0))/n),off=Math.round(((flat?h.pt.y-(U.y0+U.y1)/2:h.pt.x-(U.x0+U.x1)/2))/n);
     if(!holes.some(o=>Math.abs(o.at_mm-at)<=2&&Math.abs(o.off_mm-off)<=2))holes.push(Object.defineProperty({...h,at_mm:at,off_mm:off},"pt",{value:h.pt}))}
    Object.assign(a,{plate_mm:[Math.round((flat?U.x1-U.x0:U.y1-U.y0)/n),Math.round((flat?U.y1-U.y0:U.x1-U.x0)/n)],dir:flat?"по горизонтали":"по вертикали",holes:holes.sort((p,q)=>p.at_mm-q.at_mm||p.off_mm-q.off_mm)});
    if(a.at_mm===undefined&&b.at_mm!==undefined)Object.assign(a,{at_mm:b.at_mm,of_mm:b.of_mm,cut_on:b.cut_on,cut_dir:b.cut_dir});
    placeOf.set(a,U);mixed.add(a);sections.splice(j,1);again=true}}
  // (and a sign inside the plate so put together, in none of its pieces — К174 «1 - 1»: the fourth of its holes —; a circle
  // as large as one named is as that one — a sign of a hole drawn by convention, a diamond, says nothing of its size)
  const taken=new Set([...plateSigns.values()].flat());
  for(const a of mixed){if(!sections.includes(a))continue;const U=placeOf.get(a),n=PT/Number(a.scale.slice(2)),flat=a.dir==="по горизонтали";
   for(const h of signs){const m=h.size*0.5;if(taken.has(h)||h.x<=U.x0+m||h.x>=U.x1-m||h.y<=U.y0+m||h.y>=U.y1-m||members.some(g=>g.signs.includes(h)&&!h.part))continue;
    const at=Math.round(((flat?h.x-U.x0:h.y-U.y0))/n),off=Math.round(((flat?h.y-(U.y0+U.y1)/2:h.x-(U.x0+U.x1)/2))/n);if(a.holes.some(o=>Math.abs(o.at_mm-at)<=2&&Math.abs(o.off_mm-off)<=2))continue;
    const like=h.shape==="circle"&&a.holes.find(o=>o.pt.shape===h.shape&&Math.abs(o.pt.size-h.size)<0.6&&o.d_mm);
    a.holes.push(Object.defineProperty({at_mm:at,off_mm:off,d_mm:like?like.d_mm:null,...(like?{from:/^выноска/.test(like.from||"")?"выноска (такое же отверстие)":like.from}:{})},"pt",{value:{x:h.x,y:h.y,shape:h.shape,size:h.size}}));taken.add(h)}
   a.holes.sort((p,q)=>p.at_mm-q.at_mm||p.off_mm-q.off_mm)}}
 const result={views:out.filter(v=>v.holes.length),parts,loose:signs.filter(h=>h.loose).length,...(unnamed?{unnamed}:{}),...(sections.length?{sections}:{})};
 // (`withMembers`: the views found, for the parts on them — their frames on the sheet)
 if(withMembers)Object.defineProperty(result,"members",{value:members.map((g,i)=>({g,view:out[i]})),enumerable:false});
 return result
}
// A member's view on the sheet: a line's ends along it (a, b) and across it (c, d).
function projector(g){return q=>({a:q.a.x*g.u.x+q.a.y*g.u.y,b:q.b.x*g.u.x+q.b.y*g.u.y,c:q.a.x*g.n.x+q.a.y*g.n.y,d:q.b.x*g.n.x+q.b.y*g.n.y})}
// Which face of an I (a channel) a view of it shows: of the web — a flange's inner line by each edge (within a fifth of
// the width): `top`, `bot`; of a flange — the web's two lines by the axis: `web`. `P` — its thick lines projected.
function facesOf(g,segs,P){
 const w=g.hi-g.lo,axis=(g.lo+g.hi)/2,proj=projector(g),L=g.s1-g.s0;
 // (the lines along it: their cover of its length)
 const along=P.filter(q=>Math.abs(q.c-q.d)<=0.4&&Math.abs(q.a-q.b)>3&&Math.max(q.a,q.b)>g.s0&&Math.min(q.a,q.b)<g.s1).map(q=>({c:(q.c+q.d)/2,s0:Math.max(g.s0,Math.min(q.a,q.b)),s1:Math.min(g.s1,Math.max(q.a,q.b))}));
 const cover=(lo,hi)=>{const iv=along.filter(q=>q.c>lo&&q.c<hi).map(q=>[q.s0,q.s1]).sort((x,y)=>x[0]-y[0]);let c=0,e=-Infinity;for(const [x,y] of iv){if(y<=e)continue;c+=y-Math.max(x,e);e=y}return c};
 const lineIn=(lo,hi)=>{const cs=[...new Set(along.filter(q=>q.c>lo&&q.c<hi).map(q=>Math.round(q.c*4)/4))].filter(c=>cover(c-0.3,c+0.3)>=L*0.6);return cs};
 const top=lineIn(g.lo+0.3,g.lo+w*0.2).sort((x,y)=>x-y)[0],bot=lineIn(g.hi-w*0.2,g.hi-0.3).sort((x,y)=>y-x)[0];
 const web=top===undefined||bot===undefined?(()=>{const cs=segs.map(proj).filter(q=>Math.abs(q.c-q.d)<=0.4&&Math.abs((q.c+q.d)/2-axis)<=w*0.15&&Math.abs((q.c+q.d)/2-axis)>=0.3).map(q=>(q.c+q.d)/2);
  const one=[...new Set(cs.map(c=>Math.round(c*4)/4))].filter(c=>{const iv=segs.map(proj).filter(q=>Math.abs((q.c+q.d)/2-c)<=0.3&&Math.abs(q.c-q.d)<=0.4).map(q=>[Math.max(g.s0,Math.min(q.a,q.b)),Math.min(g.s1,Math.max(q.a,q.b))]).filter(([x,y])=>y>x).sort((x,y)=>x[0]-y[0]);
   // (drawn or dashed — hidden under the flange, the ribs drawn over it all the same: ГПЭС В46 «Вид А»)
   let c2=0,e=-Infinity;for(const [x,y] of iv){if(y<=e)continue;c2+=y-Math.max(x,e);e=y}return c2>=L*0.6});
  const a=one.filter(c=>c<axis).sort((x,y)=>y-x)[0],b=one.filter(c=>c>axis).sort((x,y)=>x-y)[0];return a!==undefined&&b!==undefined&&Math.abs((a+b)/2-axis)<=w*0.05?[a,b]:null})():null;
 return{top,bot,web}
}
// The plates across a member (ribs, a connection plate) at their places on its views (the engineer, 25.10.2026: «каждый
// узел должен быть показан идеально»). A plate across is two thick lines across the member a plate's thickness apart
// (3–40 mm), of one length. In the view of the web (its flanges drawn as thick lines along it inside the outline) — its
// height between them; in the view of a flange (the web two lines along the axis) — its side of the web and its width.
// One plate seen in both views at one place along is one. The ends of the member (a line across all of it) are not.
// [{title, marks, length_mm, plates:[{at_mm:[a0,a1], z_mm:[top,bottom]|null, x_mm:[from,to]|null, t_mm, from}]}] —
// at_mm as the holes' (from the start of the member's outline), z_mm across the view of the web from its axis (+ down
// or right), x_mm across the view of the flange from its axis (as the holes' off_mm there).
function sheetPlates(geo={},{views=[],allMm=null,seeded=null}={}){
 const segs=dedupe(geo.segments||[]),thick=thickOf(segs);if(!thick)return[];
 const r=seeded||sheetHoles(geo,{views,allMm,seed:true,withMembers:true}),bold=segs.filter(thick),found=[];
 const dims=dimensionsOf(geo.texts||[],geo.segments||[]);
 for(const {g,view} of r.members){
  const k=g.sc.n,mm=v=>v/k,w=g.hi-g.lo,axis=(g.lo+g.hi)/2,proj=projector(g);
  const P=bold.map(proj),L=g.s1-g.s0,{top,bot,web}=facesOf(g,segs,P);
  if(top===undefined&&!web)continue;
  // The lines across inside its length (an end — a line across all of it — apart).
  const cross=new Map();
  for(const q of P){if(Math.abs(q.a-q.b)>0.4||Math.abs(q.c-q.d)<2)continue;const p=(q.a+q.b)/2;if(p<g.s0-0.6||p>g.s1+0.6)continue;
   const c0=Math.min(q.c,q.d),c1=Math.max(q.c,q.d);if(c1<g.lo-w*0.8||c0>g.hi+w*0.8)continue;
   const key=[...cross.keys()].find(x=>Math.abs(x-p)<=0.4)??p;if(!cross.has(key))cross.set(key,[]);cross.get(key).push([c0,c1])}
  // (an end runs over the flanges, past their inner lines)
  const full=[...cross].filter(([,iv])=>iv.some(([c0,c1])=>top!==undefined?c0<top-0.5&&c1>bot+0.5:c0<=g.lo+w*0.02+0.3&&c1>=g.hi-w*0.02-0.3)).map(([p])=>p);
  const at=[...cross.keys()].filter(p=>!full.some(f=>Math.abs(f-p)<=0.6)).sort((x,y)=>x-y);
  // (merged where they touch: a rib's edge drawn in two pieces)
  // (each piece as drawn, and the pieces merged where they touch: a rib's edge drawn in two pieces; a gusset's edge
  // drawn on over a rib's, ГПЭС В46)
  const ivs=p=>{const out=[];for(const [x,y] of cross.get(p).slice().sort((u,v)=>u[0]-v[0])){const o=out[out.length-1];if(o&&x<=o[1]+0.5)o[1]=Math.max(o[1],y);else out.push([x,y])}
   return[...cross.get(p),...out.filter(a=>!cross.get(p).some(b=>b[0]===a[0]&&b[1]===a[1]))]};
  const same=(u,v)=>Math.abs(u[0]-v[0])<=1&&Math.abs(u[1]-v[1])<=1,plates=[];
  // (the longer of two matched that overlap)
  const apart=list=>list.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0])).filter((a,i,all)=>!all.slice(0,i).some(b=>Math.min(a[1],b[1])-Math.max(a[0],b[0])>0.5));
  for(let i=0;i+1<at.length;i++){
   const p=at[i],q=at[i+1],t=Math.round(mm(q-p));if(t<3||t>40)continue;
   let pair=[];
   if(top!==undefined){
    // In the view of the web: one piece between the flanges (or a part of the height), the same in both.
    const span=iv=>iv.filter(([x,y])=>x>=top-1&&y<=bot+1&&y-x>=(bot-top)*0.3),u=span(ivs(p)),v=span(ivs(q));
    pair=apart(u.filter(a=>v.some(b=>same(a,b)))).map(a=>({z:a}))
   }else{
    // In the view of a flange: a piece on each side of the web, out to the edge (or past it), the same in both.
    const side=iv=>iv.filter(([x,y])=>y-x>=w*0.15&&(y<=web[0]+1||x>=web[1]-1)),u=side(ivs(p)),v=side(ivs(q));
    pair=apart(u.filter(a=>v.some(b=>same(a,b)))).map(a=>({x:a}))
   }
   if(!pair.length)continue;
   // (in a stretch drawn shorter — between two breaks — its place in proportion, not certain: the place written in the
   // other view is taken, ГПЭС К32 «1–1»: the plate in the middle, «3720» from the rib on the view of the web)
   const sp=g.alongSpan(p),a0=sp?sp.v:g.alongMm(p);
   for(const o of pair)plates.push({at_mm:[a0,a0+t],t_mm:t,...(sp?{span:sp.span}:{}),...(o.z?{z_mm:o.z.map(c=>Math.round(mm(c-axis)))}:{x_mm:o.x.map(c=>Math.round(mm(c-axis)))})});
   i++
  }
  // Gussets (фасонки): a plate in the plane of the view — its outline of thick lines beside the member, from its edge
  // (or from over it) out past it, not a part of another member's view there (ГПЭС В46 «Вид А»: «−260×8» from the end
  // plate, its cut edge along the brace) — and seen edge-on in the other view: two lines along it a plate's thickness
  // apart inside the member (В46: «59» under the top, «8» thick, the lines hidden).
  const outlines=[];{
   const others=r.members.map(o=>o.g).filter(o=>o!==g);
   const theirs=q=>others.some(o=>[q.q.a,q.q.b].every(e=>{const sa=e.x*o.u.x+e.y*o.u.y,c=e.x*o.n.x+e.y*o.n.y;return sa>=o.s0-1&&sa<=o.s1+1&&c>=o.lo-1&&c<=o.hi+1}));
   const cand=bold.map(q=>({...proj(q),q,l:Math.hypot(q.b.x-q.a.x,q.b.y-q.a.y)})).filter(q=>q.l>=8&&Math.max(q.a,q.b)>=g.s0-2&&Math.min(q.a,q.b)<=g.s1+2&&
    (Math.min(q.c,q.d)<g.lo-0.5||Math.max(q.c,q.d)>g.hi+0.5)&&Math.min(q.c,q.d)>g.lo-4*w&&Math.max(q.c,q.d)<g.hi+4*w&&!(Math.abs(q.c-q.d)<0.4&&Math.abs(q.a-q.b)>L*0.5)&&!theirs(q));
   // (joined where an end of one lies on another)
   const par=cand.map((_,i)=>i),root=i=>par[i]===i?i:(par[i]=root(par[i]));
   const on=(x,y,q)=>{const dx=q.b-q.a,dy=q.d-q.c,l2=dx*dx+dy*dy,t=((x-q.a)*dx+(y-q.c)*dy)/l2;return t>=-0.02&&t<=1.02&&Math.hypot(q.a+t*dx-x,q.c+t*dy-y)<=0.8};
   for(let i=0;i<cand.length;i++)for(let j=i+1;j<cand.length;j++){const a=cand[i],b=cand[j];
    if(on(a.a,a.c,b)||on(a.b,a.d,b)||on(b.a,b.c,a)||on(b.b,b.d,a))par[root(i)]=root(j)}
   const groups=new Map();cand.forEach((q,i)=>{const k=root(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(q)});
   for(const list of groups.values()){if(list.length<3)continue;
    const pts=list.flatMap(q=>[[q.a,q.c],[q.b,q.d]]),ss=pts.map(e=>e[0]),cs=pts.map(e=>e[1]),c0=Math.min(...cs),c1=Math.max(...cs),s0=Math.min(...ss),s1=Math.max(...ss);
    // (from the member or over it, out past it by 20 mm at least; along it a local part — not half of it, nor 1.5 m)
    if(!(c0<=g.hi+1&&c1>=g.lo-1)||!(c0<g.lo-20*k||c1>g.hi+20*k)||s1-s0<50*k||s1-s0>Math.min(L*0.5,1500*k))continue;
    const poly=hull(pts).map(([sa,c])=>[g.alongMm(sa),Math.round(mm(c-axis))]);
    outlines.push({at_mm:[g.alongMm(s0),g.alongMm(s1)],poly})}}
  // The plates seen edge-on: two lines along the member inside it (any — drawn or hidden, in pieces), a plate's
  // thickness apart, side by side along it; not a flange's inner line nor the web's two lines by the axis.
  const flats=[];{
   const flatU=Math.abs(g.u.x)>0.999,across=Math.abs(g.u.x)>0.999||Math.abs(g.u.y)>0.999?dims.filter(d=>d.flat!==flatU):[];
   const lines=[];for(const q of segs.map(proj)){if(Math.abs(q.c-q.d)>0.4||Math.abs(q.a-q.b)<3)continue;const c=(q.c+q.d)/2;if(c<=g.lo+0.5||c>=g.hi-0.5)continue;
    let L1=lines.find(o=>Math.abs(o.c-c)<=0.3);if(!L1)lines.push(L1={c,iv:[]});L1.iv.push([Math.max(g.s0,Math.min(q.a,q.b)),Math.min(g.s1,Math.max(q.a,q.b))])}
   const runs=[];for(const o of lines){const iv=o.iv.filter(([x,y])=>y>x).sort((x,y)=>x[0]-y[0]);let cov=0,e=-Infinity;for(const [x,y] of iv){if(y<=e)continue;cov+=y-Math.max(x,e);e=y}
    if(cov>=L*0.6)continue;let r0=null;for(const [x,y] of iv){if(r0&&x<=r0[1]+10)r0[1]=Math.max(r0[1],y);else{if(r0)runs.push({c:o.c,s:r0});r0=[x,y]}}if(r0)runs.push({c:o.c,s:r0})}
   const long=runs.filter(o=>o.s[1]-o.s[0]>=30*k);
   for(let i=0;i<long.length;i++)for(let j=i+1;j<long.length;j++){const a=long[i],b=long[j],t=mm(Math.abs(a.c-b.c));if(t<3||t>40)continue;
    const s0=Math.max(a.s[0],b.s[0]),s1=Math.min(a.s[1],b.s[1]);if(s1-s0<Math.min(a.s[1]-a.s[0],b.s[1]-b.s[0])*0.7)continue;
    const lo2=Math.min(a.c,b.c),hi2=Math.max(a.c,b.c);if(top===undefined&&Math.abs(mm((lo2+hi2)/2-axis))<=2)continue;
    if(long.some(o=>o!==a&&o!==b&&o.c>lo2+0.3&&o.c<hi2-0.3&&o.s[0]<s1&&o.s[1]>s0))continue;
    // (from the nearer edge, by the dimensions across when they join it: «59», «8»)
    const edge=(lo2+hi2)/2<axis?-1:1,from=edge<0?g.lo:g.hi,dist=c=>{const m=Math.abs(c-from)/k,v=chainMm(across,Math.abs(from),Math.abs(c),m);return v===null?Math.round(m):v};
    flats.push({at_mm:[g.alongMm(s0),g.alongMm(s1)],edge,depth_mm:[dist(edge<0?lo2:hi2),dist(edge<0?hi2:lo2)],x_mm:[Math.round(mm(lo2-axis)),Math.round(mm(hi2-axis))],t_mm:Math.round(mm(hi2-lo2))})}}
  if(plates.length||outlines.length||flats.length||top!==undefined)found.push({title:view.title,marks:view.marks,length_mm:view.length_mm,dir:view.dir,view:top!==undefined?"web":"flange",plates,outlines,flats,
   inner_mm:top!==undefined?[mm(top-g.lo),mm(g.hi-bot)]:null,web_mm:web?web.map(c=>Math.round(mm(c-axis))):null,marks_mm:top===undefined?[]:
   // (the extension lines drawn down to it)
   g.marksAt().filter(m=>segs.some(q=>{const o=proj(q);return Math.abs(o.a-m.p)<=0.6&&Math.abs(o.b-m.p)<=0.6&&(Math.min(o.c,o.d)<g.lo-3&&Math.max(o.c,o.d)>=g.lo-3||Math.max(o.c,o.d)>g.hi+3&&Math.min(o.c,o.d)<=g.hi+3)})).map(m=>m.v)})
 }
 // Each mark: one plate in both views is one — its height from the view of the web, its side and width from the view
 // of a flange; seen in two views of a flange (one of the marks together, one of it alone), once. A place not certain
 // (in a stretch drawn shorter) is the other view's there, when it has one plate in that stretch.
 const out=[],near=(a,b)=>Math.abs(a[0]-b[0])<=3&&Math.abs(a[1]-b[1])<=3;
 const inSpan=(q,p)=>q.span&&!p.span&&p.at_mm[0]>=q.span[0]&&p.at_mm[1]<=q.span[1];
 for(const mark of [...new Set(found.flatMap(v=>v.marks))]){
  const mine=found.filter(v=>v.marks.includes(mark)).sort((a,b)=>a.marks.length-b.marks.length),web=mine.find(v=>v.view==="web");
  const length=web?.length_mm??mine[0].length_mm,flange=[];
  for(const o of mine.filter(v=>v.view==="flange"&&Math.abs((v.length_mm||0)-(length||0))<=Math.max(10,(length||0)*0.01)))
   for(const q of o.plates)if(!flange.some(f=>near(f.at_mm,q.at_mm)&&near(f.x_mm,q.x_mm)))flange.push({...q,view:o.title});
  const sides=web?.plates||[],plates=[];
  // (one in the stretch of the other: that one's place)
  const one=(list,q,p)=>list.filter(o=>inSpan(q,o)).length===1;
  for(const p of sides){const like=flange.filter(q=>near(q.at_mm,p.at_mm)&&!q.span===!p.span||inSpan(q,p)&&one(sides,q,p)||inSpan(p,q)&&one(flange,p,q));
   for(const q of like)q.used=true;
   const at=p.span&&like.some(q=>!q.span)?like.find(q=>!q.span).at_mm:p.at_mm,unsure=p.span&&!like.some(q=>!q.span);
   if(like.length)for(const q of like)plates.push({at_mm:at,t_mm:p.t_mm,z_mm:p.z_mm,x_mm:q.x_mm,from:"вид сбоку и план",...(unsure?{approx:true}:{})});
   else plates.push({at_mm:p.at_mm,t_mm:p.t_mm,z_mm:p.z_mm,x_mm:null,from:"вид сбоку",...(p.span?{approx:true}:{})})}
  // (a plate in a stretch drawn shorter in the view of a flange, not drawn in the view of the web: at the one extension
  // line of a dimension there in the stretch, ГПЭС К41 «10 · 3720 · 3730 · 20» — its near face)
  for(const q of flange.filter(q=>!q.used)){let at=q.at_mm,approx=Boolean(q.span);
   if(q.span&&web){const t=web.marks_mm.filter(m=>m>q.span[0]+5&&m<q.span[1]-5&&!sides.some(p=>Math.abs(p.at_mm[0]-m)<=5||Math.abs(p.at_mm[1]-m)<=5));
    if(new Set(t).size===1){at=[t[0],t[0]+q.t_mm];approx=false}}
   plates.push({at_mm:at,t_mm:q.t_mm,z_mm:null,x_mm:q.x_mm,from:"план",...(approx?{approx:true}:{})})}
  plates.sort((a,b)=>a.at_mm[0]-b.at_mm[0]||(a.x_mm?.[0]??0)-(b.x_mm?.[0]??0));
  // Gussets: an outline in the view of a flange, its edge-on lines in the view of the web over the same stretch (its
  // depth from the top or the bottom and its thickness; drawn on 40 % of it at least — a rib across breaks them, В63);
  // an outline in the view of the web, its lines in the view of a
  // flange (its side) — else in the web's plane. Seen in two views of a flange, once.
  const gussets=[],sameLen=v=>Math.abs((v.length_mm||0)-(length||0))<=Math.max(10,(length||0)*0.01);
  const cover=(f,o)=>Math.max(0,Math.min(f.at_mm[1],o.at_mm[1])-Math.max(f.at_mm[0],o.at_mm[0]))/Math.max(1,o.at_mm[1]-o.at_mm[0]);
  for(const v of mine.filter(sameLen))for(const o of v.outlines){const plane=v.view==="web"?"вид сбоку":"план";
   if(gussets.some(q=>q.plane===plane&&near(q.at_mm,o.at_mm)))continue;
   const on=mine.filter(u=>u.view!==v.view&&sameLen(u)).flatMap(u=>u.flats).filter(f=>cover(f,o)>=0.4).sort((a,b)=>cover(b,o)-cover(a,o))[0];
   // (an outline not seen edge-on in the other view is not taken: a part of another kind, a node drawn apart)
   if(!on)continue;
   // (in the plan, a plate between the flanges — deeper than the inner line of the flange — is welded to the web: its
   // edge there, hidden under the flange, runs along the web's face, ГПЭС В46 «−260×8», В113)
   let poly=o.poly;const wv=mine.find(u=>u.view==="web"&&u.flats.includes(on));
   if(plane==="план"&&wv?.inner_mm&&on.depth_mm[0]>=wv.inner_mm[on.edge<0?0:1]-1){const side=Math.sign(poly.reduce((a,e)=>a+e[1],0))||1,face=v.web_mm?v.web_mm[side<0?0:1]:0;
    poly=hull([...poly,[o.at_mm[0],face],[o.at_mm[1],face]])}
   gussets.push({at_mm:o.at_mm,plane,poly,t_mm:on?.t_mm??null,...(plane==="план"?{edge:on?.edge??-1,depth_mm:on?.depth_mm??null}:{x_mm:on?.x_mm??null}),view:v.title})}
  gussets.sort((a,b)=>a.at_mm[0]-b.at_mm[0]);
  out.push({mark,length_mm:length,dir:(web||mine[0]).dir,views:[...new Set(mine.map(v=>v.title))],plates,...(gussets.length?{gussets}:{})})
 }
 return out
}
module.exports={dedupe,gridOf,projector,facesOf,holeSymbols,holeCallouts,leaderHoles,sheetHoles,sheetPlates,memberBand,edgeLines,thickOf,scaleNear,chainMm,chainMap};
