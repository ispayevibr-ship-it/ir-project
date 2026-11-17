"use strict";
// Graphic symbols of steel drawings that carry no text: bolts and welds (ГОСТ 21.502). Found in the lines of the sheet,
// given to the views of the sheet (src/ai-sheet-details.js) and to the self-check of the sheet (src/ai-sheet-audit.js).
// - a bolt: a small square 3…9 pt with its diagonals (⊠ — КМ2 л.8 ИР-71535 node 13: six to a brace Сг-10 on the gusset of Ф-1)
//   or a small circle with a cross through its centre;
// - a site weld: a chain of small crosses «+» (two strokes 2…7 pt crossing at their middles) along the welded edge;
// - a shop weld: a comb of short parallel ticks, 4 and more, evenly spaced, one end of each on the welded edge.

const len=s=>Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y);
const near=(p,q,d)=>Math.abs(p.x-q.x)<=d&&Math.abs(p.y-q.y)<=d;
const mid=s=>({x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2});
const unit=s=>{const L=len(s)||1;return{x:(s.b.x-s.a.x)/L,y:(s.b.y-s.a.y)/L}};

function grid(items,cell,at){const g=new Map();items.forEach((it,i)=>{const p=at(it),k=Math.floor(p.x/cell)+","+Math.floor(p.y/cell);if(!g.has(k))g.set(k,[]);g.get(k).push(i)});
 return(p,r)=>{const out=[];const x0=Math.floor((p.x-r)/cell),x1=Math.floor((p.x+r)/cell),y0=Math.floor((p.y-r)/cell),y1=Math.floor((p.y+r)/cell);
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const l=g.get(x+","+y);if(l)out.push(...l)}return out}}

// Distance of a point from the line of a segment, and whether its foot lies on the segment.
function offLine(s,p){const u=unit(s),dx=p.x-s.a.x,dy=p.y-s.a.y,t=dx*u.x+dy*u.y;return{d:Math.abs(dx*u.y-dy*u.x),t,on:t>=-.5&&t<=len(s)+.5}}

function boltsOf(segs){
 const small=segs.filter(s=>{const L=len(s);return L>=3&&L<=9.5});
 const byEnd=grid(small.map((s,i)=>i),2,i=>small[i].a),byEnd2=grid(small.map((s,i)=>i),2,i=>small[i].b);
 const ends=p=>[...new Set([...byEnd(p,.6),...byEnd2(p,.6)])];
 const other=(s,p)=>near(s.a,p,.6)?s.b:near(s.b,p,.6)?s.a:null;
 const out=[];
 const anyNear=grid(segs.map((s,i)=>i),12,i=>mid(segs[i]));
 for(let i=0;i<small.length;i++){const s1=small[i],L=len(s1),u1=unit(s1);
  // the next side from s1.b, square to it, of its length; then the third and the fourth back to s1.a
  for(const j of ends(s1.b)){if(j===i)continue;const s2=small[j],u2=unit(s2);if(Math.abs(u1.x*u2.x+u1.y*u2.y)>.1||Math.abs(len(s2)-L)>L*.15)continue;
   const c2=other(s2,s1.b);if(!c2)continue;
   const c4={x:s1.a.x+(c2.x-s1.b.x),y:s1.a.y+(c2.y-s1.b.y)};
   const has=(p,q)=>ends(p).some(k=>{const o=other(small[k],p);return o&&near(o,q,.7)});
   if(!has(c2,c4)||!has(c4,s1.a))continue;
   const c={x:(s1.a.x+c2.x)/2,y:(s1.a.y+c2.y)/2};if(out.some(o=>near(o,c,L/2)))break;
   // both diagonals through the centre (strokes or longer lines crossing it at 45° to the sides)
   let dg=0,dirs=[];
   for(const k of anyNear(c,L*6)){const q=segs[k];if(q===s1||q===s2)continue;const uq=unit(q),cs=Math.abs(uq.x*u1.x+uq.y*u1.y);if(cs<.55||cs>.85)continue;
    const o=offLine(q,c);if(o.d>.6||!o.on)continue;
    // (a line ending at the centre counts too: the diagonal drawn as two halves)
    const sg=Math.sign(uq.x*u1.x+uq.y*u1.y)*Math.sign(uq.x*u2.x+uq.y*u2.y);if(!dirs.includes(sg)){dirs.push(sg);dg++}}
   if(dg<2)continue;
   out.push({kind:"bolt",x:c.x,y:c.y,size:L,box:{x0:c.x-L/2,y0:c.y-L/2,x1:c.x+L/2,y1:c.y+L/2}});break}}
 return out
}

// Circles 3…12 pt across (closed chains of short strokes, every end at one distance from the centre) with a line
// through the centre: a bolt in its hole (КМ1 л.17 ИР-71535, the holes of the bolts in the washers of Фп1).
function circleBoltsOf(segs,bolts){
 const sm=segs.filter(s=>len(s)<=3.2);if(!sm.length)return[];
 const par=sm.map((_,i)=>i),find=i=>{while(par[i]!==i)i=par[i]=par[par[i]];return i};
 const at=grid(sm.map((_,i)=>i),1,i=>sm[i].a);
 sm.forEach((s,i)=>{for(const p of [s.a,s.b])for(const j of at(p,.3))if(j!==i&&(near(sm[j].a,p,.2)))par[find(i)]=find(j)});
 const groups=new Map();sm.forEach((s,i)=>{const r=find(i);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(s)});
 const anyNear=grid(segs.map((s,i)=>i),12,i=>mid(segs[i]));const out=[];
 for(const g of groups.values()){if(g.length<8)continue;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const s of g)for(const p of [s.a,s.b]){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y)}
  const w=x1-x0,h=y1-y0;if(w<3||w>12||Math.abs(w-h)>w*.12)continue;
  const c={x:(x0+x1)/2,y:(y0+y1)/2},r=(w+h)/4;
  if(!g.every(s=>[s.a,s.b].every(p=>Math.abs(Math.hypot(p.x-c.x,p.y-c.y)-r)<=r*.15)))continue;
  if(bolts.some(o=>near(o,c,o.size))||out.some(o=>near(o,c,r)))continue;
  // a cross through the centre: two lines at right angles
  // (short lines — the centre marks of the hole; a long axis through a circle is a pipe or a post: АР ч.1 л.8 downpipes)
  const thr=[...anyNear(c,r*4)].map(k=>segs[k]).filter(q=>len(q)>r*1.5&&len(q)<=w*3.5&&offLine(q,c).d<=.6&&offLine(q,c).on);
  if(!thr.some(a=>thr.some(b=>{const ua=unit(a),ub=unit(b);return Math.abs(ua.x*ub.x+ua.y*ub.y)<.2})))continue;
  out.push({kind:"bolt",round:true,x:c.x,y:c.y,size:w,box:{x0,y0,x1,y1}})}
 return out
}

// Whether a point lies on a line of the sheet other than the given ones (cells of 6 pt along each line).
function onLines(segs){
 if(segs.onAny)return segs.onAny;
 const cells=new Map();segs.forEach((z,k)=>{const L=len(z);if(L>1500)return;const n=Math.max(1,Math.ceil(L/6));for(let j=0;j<=n;j++){const x=z.a.x+(z.b.x-z.a.x)*j/n,y=z.a.y+(z.b.y-z.a.y)*j/n,key=Math.floor(x/6)+","+Math.floor(y/6);let l=cells.get(key);if(!l)cells.set(key,l=new Set());l.add(k)}});
 return segs.onAny=(p,q,o)=>{const key=Math.floor(p.x/6)+","+Math.floor(p.y/6),l=cells.get(key);return Boolean(l)&&[...l].some(k=>{const z=segs[k];if(z===q||z===o)return false;const f=offLine(z,p);return f.d<=.3&&f.on})}
}

function crossesOf(segs,bolts){
 const sh=segs.filter(s=>{const L=len(s);return L>=2&&L<=7&&(Number(s.w)||0)<.6});
 const at=grid(sh.map((s,i)=>i),4,i=>mid(sh[i]));const out=[],used=new Set();
 // (the ends of a weld's cross are free; the crosses of a cross-hatching — insulation, АР ч.1 л.13 — touch their neighbours)
 const ea=grid(segs.map((_,i)=>i),2,i=>segs[i].a),eb=grid(segs.map((_,i)=>i),2,i=>segs[i].b);
 // (an end on another line counts too: the crosses of a hatching end on the outline of the band)
 const onAny=onLines(segs);
 const touch=(q,o)=>[q.a,q.b].filter(p=>onAny(p,q,o)).length;
 for(let i=0;i<sh.length;i++){if(used.has(i))continue;const a=sh[i],ma=mid(a),ua=unit(a);
  for(const j of at(ma,1)){if(j<=i||used.has(j))continue;const b=sh[j],mb=mid(b),ub=unit(b);
   if(!near(ma,mb,.5)||Math.abs(ua.x*ub.x+ua.y*ub.y)>.2||Math.abs(len(a)-len(b))>Math.max(len(a),len(b))*.35)continue;
   const c={x:(ma.x+mb.x)/2,y:(ma.y+mb.y)/2};if(bolts.some(o=>near(o,c,o.size))||touch(a,b)+touch(b,a)>2)continue;
   used.add(i);used.add(j);out.push({x:c.x,y:c.y,size:Math.max(len(a),len(b))});break}}
 // (crosses of a hatching stand tip to tip — the next one nearer than a stroke's length; the crosses of a weld apart)
 const ca=grid(out.map((_,i)=>i),8,i=>out[i]);
 return out.filter(p=>!ca(p,p.size).some(k=>out[k]!==p&&Math.hypot(out[k].x-p.x,out[k].y-p.y)<p.size))
}

// Chains of crosses: neighbours within 30 pt; a seam of 2 and more crosses lying along one line (±2 pt).
function seamsOfCrosses(cr){
 const par=cr.map((_,i)=>i),find=i=>{while(par[i]!==i)i=par[i]=par[par[i]];return i};
 const at=grid(cr.map((_,i)=>i),30,i=>cr[i]);
 cr.forEach((c,i)=>{for(const j of at(c,30))if(j!==i&&Math.hypot(cr[j].x-c.x,cr[j].y-c.y)<=30)par[find(i)]=find(j)});
 const groups=new Map();cr.forEach((c,i)=>{const r=find(i);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(c)});
 const out=[];
 for(const g of groups.values()){if(g.length<2)continue;
  // the line of the chain: the two crosses farthest apart
  let a=g[0],b=g[1],d=0;for(const p of g)for(const q of g){const e=Math.hypot(p.x-q.x,p.y-q.y);if(e>d){d=e;a=p;b=q}}
  const s={a,b},on=g.filter(p=>offLine(s,p).d<=2.5);
  if(on.length<2||on.length<g.length*.7)continue;
  out.push(seam("weld_site",a,b,on.length))}
 return out
}

function seam(kind,a,b,n){const x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x),y0=Math.min(a.y,b.y),y1=Math.max(a.y,b.y);
 return{kind,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},n,length_pt:Math.round(Math.hypot(b.x-a.x,b.y-a.y)*10)/10,box:{x0:x0-3,y0:y0-3,x1:x1+3,y1:y1+3}}}

// Combs: short parallel ticks 1.5…6 pt, one end of each on one line, the other free, 1,5…4,5 pt apart evenly, 4 and more.
function combsOf(segs){
 const ticks=segs.filter(s=>{const L=len(s);return L>=1.5&&L<=6});
 const byDir=new Map();
 for(const s of ticks){const u=unit(s);let ang=Math.atan2(u.y,u.x);if(ang<0)ang+=Math.PI;if(ang>=Math.PI-.03)ang-=Math.PI;const k=Math.round(ang/.05);if(!byDir.has(k))byDir.set(k,[]);byDir.get(k).push(s)}
 const onAny=onLines(segs),out=[],long=segs.filter(s=>len(s)>6),at=grid(long.map((_,i)=>i),40,i=>mid(long[i]));
 const edges=(a,b)=>{const L=Math.hypot(b.x-a.x,b.y-a.y),c={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  // (the edge may be drawn in pieces: lines on the base line, together over 80 % of the comb)
  let cover=0;const u={x:(b.x-a.x)/(L||1),y:(b.y-a.y)/(L||1)};
  for(const i of at(c,Math.max(40,L))){const q=long[i],oa=offLine({a:q.a,b:q.b},a),ob=offLine({a:q.a,b:q.b},b);if(oa.d>.8||ob.d>.8)continue;
   const t=p=>(p.x-a.x)*u.x+(p.y-a.y)*u.y,t0=Math.max(0,Math.min(t(q.a),t(q.b))),t1=Math.min(L,Math.max(t(q.a),t(q.b)));if(t1>t0)cover+=t1-t0}
  return cover>=L*.8};
 for(const list of byDir.values()){if(list.length<4)continue;const u=unit(list[0]),n={x:-u.y,y:u.x};
  // the base line of each tick: its end with the smaller (and with the larger) offset along u — ticks of one comb share it
  for(const side of [0,1]){const rows=new Map();
   for(const s of list){const e=((s.a.x*u.x+s.a.y*u.y)<(s.b.x*u.x+s.b.y*u.y))===(side===0)?s.a:s.b;const off=e.x*u.x+e.y*u.y,k=Math.round(off/.8);
    // (the far end of a tick of a weld is free; a hatching runs from outline to outline)
    const far=e===s.a?s.b:s.a;if(onAny(far,s))continue;
    if(!rows.has(k))rows.set(k,[]);rows.get(k).push({s,e,t:e.x*n.x+e.y*n.y})}
   for(const r of rows.values()){if(r.length<4)continue;r.sort((p,q)=>p.t-q.t);let run=[r[0]];
    const close=()=>{if(run.length>=4){const gaps=run.slice(1).map((p,i)=>p.t-run[i].t),m=gaps.reduce((a,b)=>a+b,0)/gaps.length;
      // (on an edge: a line along the base of the ticks over the whole comb — the welded edge; hatching has none)
      const a=run[0].e,b=run[run.length-1].e,base={a,b};
      if(m>=1.5&&m<=4.5&&gaps.every(g=>Math.abs(g-m)<=m*.35)&&edges(a,b))out.push(seam("weld_shop",a,b,run.length))}};
    for(const p of r.slice(1)){const g=p.t-run[run.length-1].t;if(g<.5)continue;if(g<=9)run.push(p);else{close();run=[p]}}close()}}}
 // (one comb found from both ends of its ticks only once)
 return out.filter((c,i)=>!out.slice(0,i).some(o=>near(o.a,c.a,7)&&near(o.b,c.b,7)))
}

function symbolsOf(segments){
 const segs=(segments||[]).filter(s=>s&&s.a&&s.b&&len(s)>.2);
 const square=boltsOf(segs),bolts=[...square,...circleBoltsOf(segs,square)];
 const welds=[...seamsOfCrosses(crossesOf(segs,bolts)),...combsOf(segs)];
 return{bolts,welds}
}

module.exports={symbolsOf,boltsOf,circleBoltsOf,crossesOf,combsOf};
