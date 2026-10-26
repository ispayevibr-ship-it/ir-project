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
  // Closed all round: the chords cover the circle (not an arc of a weld sign or a rounded corner).
  const len=g.reduce((a,i)=>a+segs[i].l,0);if(len<2*Math.PI*r*0.85)continue;
  // (and round: of chords shorter than its radius — a small square with its diagonals is not a ring)
  if(g.some(i=>segs[i].l>r*1.05))continue;
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
   for(const h of holes){const v={x:(q.x-p.x)/s.l,y:(q.y-p.y)/s.l},w={x:h.x-p.x,y:h.y-p.y},t=w.x*v.x+w.y*v.y,off=Math.abs(w.x*v.y-w.y*v.x);
    if(t<s.l*0.5||t>s.l+h.size*1.5||off>Math.max(1.2,h.size*0.8))continue;
    const k=Math.abs(s.l-t)+off;if(!best||k<best.k)best={k,hole:h}}
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
 const nodes=[],at=p=>{let i=nodes.findIndex(q=>Math.abs(q-p)<=tol);if(i<0){nodes.push(p);i=nodes.length-1}return i};
 const par=[],off=[],find=i=>{let o=0,r=i;while(par[r]!==r){o+=off[r];r=par[r]}return[r,o]};
 const join=(i,j,v)=>{const [ri,oi]=find(i),[rj,oj]=find(j);if(ri===rj)return;par[rj]=ri;off[rj]=v+oi-oj};
 for(const d of dims){const i=at(d.lo),j=at(d.hi);while(par.length<nodes.length){par.push(par.length);off.push(0)}if(i!==j)join(i,j,d.v)}
 const order=nodes.map((p,i)=>({p,i})).sort((a,b)=>a.p-b.p);
 const gaps=order.slice(1).map((b,k)=>({a:order[k],b,gap:b.p-order[k].p})).filter(x=>x.gap<=bridge).sort((x,y)=>x.gap-y.gap);
 for(const {a,b,gap} of gaps)join(a.i,b.i,gap/n);
 const val=i=>find(i)[1],root=i=>find(i)[0];
 // A place: its value from the root of its extension lines' group.
 const place=p=>{
  const k=order.findIndex(q=>Math.abs(q.p-p)<=tol);if(k>=0)return{r:root(order[k].i),v:val(order[k].i),node:true};
  const L=[...order].reverse().find(q=>q.p<p),R=order.find(q=>q.p>p);
  if(L&&R&&root(L.i)===root(R.i)){const vl=val(L.i),vr=val(R.i),r=(vr-vl)/(R.p-L.p);
   if(Math.abs(r*n-1)<=0.03)return{r:root(L.i),v:vl+(p-L.p)*r};
   const v=p-L.p<=R.p-p?vl+(p-L.p)/n:vr-(R.p-p)/n;return{r:root(L.i),v:Math.min(Math.max(v,Math.min(vl,vr)),Math.max(vl,vr))}}
  const q=[L,R].filter(Boolean).sort((a,b)=>Math.abs(a.p-p)-Math.abs(b.p-p))[0];
  return q?{r:root(q.i),v:val(q.i)+(p-q.p)/n}:null
 };
 return{mm(a,b){const A=place(a),B=place(b);return A&&B&&A.r===B.r?B.v-A.v:null},at:p=>order.some(q=>Math.abs(q.p-p)<=tol)}
}
// The standard scale of the dimensions around a place: pt per mm of the member.
function scaleNear(dims,box){
 const list=dims.filter(d=>{const c=(d.lo+d.hi)/2;return d.flat?c>=box.x0&&c<=box.x1&&d.line>=box.y0&&d.line<=box.y1:c>=box.y0&&c<=box.y1&&d.line>=box.x0&&d.line<=box.x1});
 let best=null;
 for(const k of SCALES){const n=PT/k,agree=list.filter(d=>Math.abs((d.hi-d.lo)/d.v-n)/n<=0.03);if(agree.length&&(!best||agree.length>best.count))best={k,n,count:agree.length}}
 return best
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
 for(const L of lines){
  const iv=L.pieces.map(q=>[q.s0,q.s1]).sort((a,b)=>a[0]-b[0]);let cov=0,e=-Infinity;
  for(const [a,b] of iv){if(b<=e)continue;cov+=b-Math.max(a,e);e=b}
  L.cover=cov;L.longest=Math.max(...L.pieces.map(q=>q.l))
 }
 // (the frame of the sheet runs all across it)
 const frame=L=>Math.abs(L.u.x)>0.999?widthPt>0&&L.s1-L.s0>=widthPt*0.93:Math.abs(L.u.y)>0.999&&heightPt>0&&L.s1-L.s0>=heightPt*0.93;
 return lines.filter(L=>L.cover>=(L.s1-L.s0)*0.6&&L.longest>=(L.s1-L.s0)*0.2&&!frame(L))
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
    if(at(p0,c0,a)&&at(p1,c1,b)||at(p0,c0,b)&&at(p1,c1,a))return true}
   return cover.some(iv=>{let c=0,e=-Infinity;for(const [x,y] of iv.filter(([x,y])=>y>x).sort((p,q)=>p[0]-q[0])){if(y<=e)continue;c+=y-Math.max(x,e);e=y}return c>=(hi-lo)*0.8})};
  if(!joined(above,below))continue;
  // The outline goes on past a line inside the member (its web drawn in a plan of a flange, a stiffener's edge): the
  // next line out of the same length, not farther than half as much again as the member is wide so far.
  const same=(a,b)=>Math.abs(a.s0-b.s0)<=Math.max(3,(a.s1-a.s0)*0.02)&&Math.abs(a.s1-b.s1)<=Math.max(3,(a.s1-a.s0)*0.02);
  for(let k=0;k<6;k++){
   const w=below.off-above.off,up2=near.filter(L=>L.off<above.off-0.3&&above.off-L.off<=w*1.5&&same(L,above)&&joined(L,above)).sort((a,b)=>b.off-a.off)[0];
   const dn2=near.filter(L=>L.off>below.off+0.3&&L.off-below.off<=w*1.5&&same(L,below)&&joined(L,below)).sort((a,b)=>a.off-b.off)[0];
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
function ownerOf(g,texts,titled){
 const along=t=>t.x*g.u.x+t.y*g.u.y,across=t=>t.x*g.n.x+t.y*g.n.y,upright=Math.abs(g.u.y)>Math.abs(g.u.x);
 const centre=t=>({x:t.x+(t.width||0)/2,y:t.y});
 // How far over the view a text stands (null — not over it).
 const over=t=>upright?(across(t)>=g.lo-200&&across(t)<=g.hi+200&&along(t)<g.s0&&g.s0-along(t)<150?g.s0-along(t):null):
  (along(t)>=g.s0-40&&along(t)<=g.s1+40&&across(t)<g.lo&&g.lo-across(t)<150?g.lo-across(t):null);
 const nearest=list=>list.map(x=>({x,d:over(x.at)})).filter(o=>o.d!==null).sort((a,b)=>a.d-b.d)[0];
 const own=nearest(titled.map(v=>({at:v.title_at,v})));
 const named=nearest(texts.filter(t=>{const v=String(t.str).trim();return VID.test(v)||CUT.test(v)||DETAIL.test(v)}).map(t=>({at:centre(t),t})));
 if(named&&(!own||named.d<own.d)){
  const title=String(named.x.t.str).trim().replace(/\s+/g," ");
  if(DETAIL.test(title))return{title,view:null,detail:true};
  // The marks it names; else the arrows of its letter or number.
  const marks=[...new Set(titled.flatMap(v=>v.marks))].filter(m=>new RegExp("(?:^|[^А-ЯЁа-яё\\d])"+m+"(?![\\dа-яё])","u").test(title));
  if(marks.length)return{title,view:titled.find(v=>marks.every(m=>v.marks.includes(m)))||{marks,title},named:marks};
  const label=(VID.exec(title)||CUT.exec(title))[1],arrows=texts.filter(t=>t!==named.x.t&&new RegExp("^(?:по\\s*)?"+label+"$","u").test(String(t.str).trim()));
  let best=null;
  for(const a of arrows)for(const v of titled){const d=Math.hypot(a.x-v.title_at.x,a.y-v.title_at.y);if(!best||d<best.d)best={d,v}}
  return{title,view:best?.v||(titled.length===1?titled[0]:null)}
 }
 if(own)return{title:own.x.v.title,view:own.x.v,main:true};
 // (the distance from the title to the view's outline)
 const box=t=>{const s=along(t),o=across(t);return Math.hypot(Math.max(0,g.s0-s,s-g.s1),Math.max(0,g.lo-o,o-g.hi))};
 const near=titled.slice().sort((a,b)=>box(a.title_at)-box(b.title_at))[0];
 return{title:near?near.title:"",view:near||null}
}
// Holes of the sheet by view of a member: [{title, marks, scale, length_mm, band_mm, holes:[{at_mm, off_mm, d_mm, sign,
// from, part?}]}] — at_mm from the start of the member's outline (left, or top), off_mm from its axis (+ down or right).
// `views` — the titled views of the sheet (src/ai-sheet-extract.js assemblyViews: marks, title_at, length_mm); `allMm` —
// the diameter of the holes not named («Все отверстия Ø23»). The signs in plates drawn apart (sections, details) are
// counted in `parts`, the signs not in any member or plate in `loose`.
function sheetHoles({texts=[],segments=[],widthPt=0,heightPt=0}={},{views=[],allMm=null}={}){
 const segs=dedupe(segments),signs=holeSymbols(segments,texts);
 if(!signs.length)return{views:[],parts:0,loose:0};
 const calls=holeCallouts(texts),dims=dimensionsOf(texts,segments).filter(d=>d.v>=50&&d.v<=40000);
 for(const c of calls){const h=leaderHoles(c,segs,signs);if(h){c.hole=h;if(!h.call)h.call=c}}
 const dimLine=q=>dims.some(d=>(d.flat?Math.abs(q.u.y)<0.001&&Math.abs(d.line-q.a.y)<0.6:Math.abs(q.u.x)<0.001&&Math.abs(d.line-q.a.x)<0.6)&&q.s0<=d.hi+1&&q.s1>=d.lo-1);
 // (a line through the middles of holes is their gauge line, not an edge)
 const gauge=L=>signs.some(h=>{const sh=h.x*L.u.x+h.y*L.u.y;return Math.abs(h.x*L.n.x+h.y*L.n.y-L.off)<Math.max(0.5,h.size*0.15)&&sh>=L.s0-1&&sh<=L.s1+1});
 const thick=thickOf(segs),crossers=thick?segs.filter(thick):segs,edges=edgeLines(segs,dimLine,{widthPt,heightPt,thick}).filter(L=>!gauge(L)),titled=views.filter(v=>v.marks?.length&&v.title_at),len=L=>L.s1-L.s0;
 // The signs between the same two edges: one view of one part.
 const groups=new Map();
 for(const h of signs){
  const b=memberBand(h,edges,crossers);if(!b){h.loose=true;continue}
  const k=edges.indexOf(b.above)+"|"+edges.indexOf(b.below);
  if(!groups.has(k))groups.set(k,{u:b.u,n:b.n,above:b.above,below:b.below,signs:[]});groups.get(k).signs.push(h)
 }
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
  if(beside.length){const e0=Math.min(...beside.map(d=>d.lo)),e1=Math.max(...beside.map(d=>d.hi));
   if(e0<=g.s0+1&&e1>=g.s1-1&&e1-e0<=(g.s1-g.s0)*1.25){if(e0<g.s0-0.6&&drawnAt(e0))g.s0=e0;if(e1>g.s1+0.6&&drawnAt(e1))g.s1=e1}}
  // (the dimensions beside it, the nearer first)
  const gap=d=>Math.max(0,lo-cross(d),cross(d)-hi),map=chainMap(beside.slice().sort((a,b)=>gap(a)-gap(b)),g.sc.n);
  g.byChain=map.at(g.s0)&&map.at(g.s1)&&map.mm(g.s0,g.s1)>0;
  g.alongMm=p=>{const v=map.mm(g.s0,p);return Math.round(v===null?(p-g.s0)/g.sc.n:v)};
  g.length=g.alongMm(g.s1)
 };
 // A member's view: both edges long, at a scale of its dimensions, not shorter than half the longest view of its mark
 // (a plate drawn apart — a detail, a section — is not).
 const members=[];
 const longs=list.filter(long).sort((a,b)=>(b.below.off-b.above.off)-(a.below.off-a.above.off));
 for(const g of longs){g.lo=g.above.off;g.hi=g.below.off;g.s0=Math.min(g.above.s0,g.below.s0);g.s1=Math.max(g.above.s1,g.below.s1);g.edges=[g.above,g.below]}
 // A view split by a line along it (the web of a beam in the plan of its flange, ГПЭС К32 «1–1»): its parts are one.
 for(const g of longs)if(!g.into)for(const h of longs)if(h!==g&&!h.into&&Math.abs(g.u.x*h.u.y-g.u.y*h.u.x)<0.003&&h.lo>=g.lo-0.5&&h.hi<=g.hi+0.5&&
  Math.min(g.s1,h.s1)-Math.max(g.s0,h.s0)>=0.8*Math.min(g.s1-g.s0,h.s1-h.s0)){h.into=g;g.signs.push(...h.signs);h.signs=[];g.edges.push(...h.edges);g.s0=Math.min(g.s0,h.s0);g.s1=Math.max(g.s1,h.s1)}
 for(const g of longs.filter(g=>!g.into)){
  // Its ends: the outermost lines drawn across it by the ends of its edges (an end plate) — not an axis or a centre line
  // run on past it (ГПЭС К33: «65» from the plate, the middle line drawn on to the axis).
  g.cross=[];for(const q of segs){if(thick&&!thick(q))continue;const a=q.a.x*g.u.x+q.a.y*g.u.y,b=q.b.x*g.u.x+q.b.y*g.u.y;if(Math.abs(a-b)>0.6)continue;
   const c0=q.a.x*g.n.x+q.a.y*g.n.y,c1=q.b.x*g.n.x+q.b.y*g.n.y;if(Math.min(Math.max(c0,c1),g.hi)-Math.max(Math.min(c0,c1),g.lo)>=(g.hi-g.lo)*0.5)g.cross.push((a+b)/2)}
  // (an axis is a dash-dot line: its pieces one after another with short gaps — a long dash of it may cross the member,
  // ГПЭС В46: the axis 10 mm off the end plate)
  const w=g.hi-g.lo,axisAt=p=>{const iv=segs.filter(q=>Math.abs(q.a.x*g.u.x+q.a.y*g.u.y-p)<=0.3&&Math.abs(q.b.x*g.u.x+q.b.y*g.u.y-p)<=0.3).map(q=>{const c0=q.a.x*g.n.x+q.a.y*g.n.y,c1=q.b.x*g.n.x+q.b.y*g.n.y;return[Math.min(c0,c1),Math.max(c0,c1)]})
   .filter(([a,b])=>b>=g.lo-3*w&&a<=g.hi+3*w).sort((a,b)=>a[0]-b[0]);let gaps=0,e=null;for(const [a,b] of iv){if(e!==null&&a-e>=1&&a-e<=8)gaps++;e=e===null?b:Math.max(e,b)}return gaps>=2};
  g.cross=g.cross.filter(p=>!axisAt(p));
  {const st=g.edges.map(L=>L.s0),en=g.edges.map(L=>L.s1),m=Math.max(4,0.01*(g.s1-g.s0));
   const c0=g.cross.filter(p=>p>=Math.min(...st)-m&&p<=Math.max(...st)+2),c1=g.cross.filter(p=>p<=Math.max(...en)+m&&p>=Math.min(...en)-2);
   if(c0.length)g.s0=Math.min(...c0);if(c1.length)g.s1=Math.max(...c1)}
  const p0={x:g.u.x*g.s0+g.n.x*g.lo,y:g.u.y*g.s0+g.n.y*g.lo},p1={x:g.u.x*g.s1+g.n.x*g.hi,y:g.u.y*g.s1+g.n.y*g.hi};
  g.sc=scaleNear(dims,{x0:Math.min(p0.x,p1.x)-120,x1:Math.max(p0.x,p1.x)+120,y0:Math.min(p0.y,p1.y)-120,y1:Math.max(p0.y,p1.y)+120});
  if(!g.sc)continue;
  alongOf(g);g.who=ownerOf(g,texts,titled);if(!g.who.detail)members.push(g)
 }
 // (the member is as long as its view says or its longest view of holes; a view of its mark shorter than half of it is
 // a plate — a base plate «1–1» under a column)
 const key=g=>(g.who.view?.marks||[]).join(","),longest=new Map();for(const g of members)longest.set(key(g),Math.max(longest.get(key(g))||0,g.length,Number(g.who.view?.length_mm)||0));
 for(let i=members.length-1;i>=0;i--)if(members[i].length<Math.max(300,longest.get(key(members[i]))*0.5))members.splice(i,1);
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
 const out=[],parts=list.filter(g=>!members.includes(g)).reduce((a,g)=>a+g.signs.length,0);let unnamed=0;
 for(const g of members){
  const sc=g.sc,mm=v=>v/sc.n,length=g.length,who=g.who;
  // A callout names the diameter of the signs like the one it points to, as many as it says, the nearest first.
  for(const c of calls.filter(c=>c.hole&&g.signs.includes(c.hole))){
   const like=g.signs.filter(h=>(h.shape==="circle")===(c.hole.shape==="circle")&&Math.abs(h.size-c.hole.size)<0.6&&!h.call&&Boolean(h.part)===Boolean(c.hole.part)).sort((a,b)=>dist(a,c.hole)-dist(b,c.hole));
   for(const h of like.slice(0,Math.max(0,(c.n||1)-1)))h.call={...c,by:"count"}
  }
  // A sign's middle is where an extension line of a dimension runs through it (a sign drawn a little off it): taken
  // there, along and across (a member drawn along the sheet or upright).
  const square=Math.abs(g.u.x)>0.999||Math.abs(g.u.y)>0.999,ends=f=>square?[...new Set(dims.filter(d=>d.flat===f).flatMap(d=>[d.lo,d.hi]))]:[];
  const xs=ends(true),ys=ends(false),snap=(v,list,k)=>{let best=v,gap=k;for(const e of list)if(Math.abs(e-v)<=gap){best=e;gap=Math.abs(e-v)}return best};
  const axis=(g.lo+g.hi)/2,acrossDims=square?dims.filter(d=>d.flat!==(Math.abs(g.u.x)>0.999)):[];
  const alongMm=g.alongMm,byChain=g.byChain,endMm=g.length;
  const exact=(list,a,b)=>exactMm(list,a,b,sc.n);
  // A circle no callout or note names is not taken for a hole (a round bar cut across has a line through it as well).
  const named=g.signs.filter(h=>h.shape!=="circle"||h.call||allMm);unnamed+=g.signs.length-named.length;
  const holes=named.map(h=>{const k=Math.min(0.5,h.size*0.15),p={x:snap(h.x,xs,k),y:snap(h.y,ys,k)},s=p.x*g.u.x+p.y*g.u.y,o=p.x*g.n.x+p.y*g.n.y;
   const drawn=h.shape==="circle"?mm(h.size):null,round=drawn?HOLE_D.reduce((a,b)=>Math.abs(b-drawn)<Math.abs(a-drawn)?b:a):null;
   const d=h.call?.d??allMm??(drawn&&Math.abs(round-drawn)<=2.5?round:null);
   return{at_mm:alongMm(s),off_mm:Math.sign(o-axis)*exact(acrossDims,axis,o),d_mm:d,sign:h.shape,...(h.part?{part:true}:{}),
    ...(h.call?{from:h.call.by?"выноска (по числу отверстий)":"выноска"}:allMm?{from:"примечание «все отверстия»"}:d?{from:"по размеру на чертеже"}:{})}
  }).sort((a,b)=>a.at_mm-b.at_mm||a.off_mm-b.off_mm);
  out.push({title:who.title,marks:who.named||who.view?.marks||[],...(who.main?{main:true}:{}),scale:"1:"+sc.k,length_mm:length,...(byChain&&Math.abs(endMm-mm(g.s1-g.s0))>Math.max(5,endMm*0.03)?{not_to_scale:true}:{}),band_mm:Math.round(mm(g.hi-g.lo)),
   dir:Math.abs(g.u.x)>=Math.abs(g.u.y)?"по горизонтали":"по вертикали",holes})
 }
 return{views:out.filter(v=>v.holes.length),parts,loose:signs.filter(h=>h.loose).length,...(unnamed?{unnamed}:{})}
}
module.exports={holeSymbols,holeCallouts,leaderHoles,sheetHoles,memberBand,edgeLines,thickOf,scaleNear,chainMm,chainMap};
