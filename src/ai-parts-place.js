"use strict";
// The positions of an assembly sheet (КМД) at their places on the views of its marks (the engineer, 28.10.2026: «ты
// деталировочные чертежи обрабатываешь процентов на 5», «это не только колонн касается, это всех деталей»). A position
// is named on a view by its number in a circle (ГОСТ 2.316: a balloon, its leader to the part ending in a dot inside it);
// the part is the outline of thick lines round the end of the leader. Its place in the scale of the view: along the
// member from the start of its view (as the holes, src/ai-holes-extract.js), across from its axis (+ down, or + left of
// an upright one), on each view it is drawn on; the view says which face of an I it shows (facesOf).
const {dedupe,gridOf,projector,facesOf,thickOf}=require("./ai-holes-extract");

const dist=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y);
const NUMBER=/^(\d{1,2})([а-яё]?)$/u;

// The balloons: a number (with a letter, «7т», «8н») written upright in a ring — the ends of the ring's chords at one
// distance from the middle of the number, all round it (0.45–1.2 of the size of the number).
function balloonsOf(texts,segs){
 const near=gridOf(segs,40),out=[];
 for(const t of texts){
  const m=NUMBER.exec(String(t.str||"").trim());if(!m||Math.abs(t.angle||0)>5||!(t.size>0))continue;
  // (the ring's middle: the mean of the ends round the number, twice — the number stands a little off it)
  let c={x:t.x+(t.width||0)/2,y:t.y-t.size*0.35},pts=[];
  for(let k=0;k<3;k++){pts=[];for(const i of near(c))for(const p of [segs[i].a,segs[i].b]){const d=dist(p,c);if(d>=t.size*0.45&&d<=t.size*1.2)pts.push({p,d,a:Math.atan2(p.y-c.y,p.x-c.x)})}
   if(k<2&&pts.length)c={x:pts.reduce((a,q)=>a+q.p.x,0)/pts.length,y:pts.reduce((a,q)=>a+q.p.y,0)/pts.length}}
  let best=null;
  for(const p of pts){const on=pts.filter(q=>Math.abs(q.d-p.d)<=1.2);if(!best||on.length>best.on.length)best={r:p.d,on}}
  if(!best||best.on.length<12)continue;
  // (all round: no gap over a quarter turn)
  const as=best.on.map(q=>q.a).sort((x,y)=>x-y),gap=Math.max(as[0]+2*Math.PI-as[as.length-1],...as.slice(1).map((a,i)=>a-as[i]));
  if(gap>Math.PI/2)continue;
  const r=best.on.reduce((a,q)=>a+q.d,0)/best.on.length;
  out.push({pos:m[1],side:m[2]||"",x:c.x,y:c.y,r,t})
 }
 return out
}
// The leaders of a balloon: a thin line from its ring outward (radial), run on through its pieces in line; its end.
function leadersOf(b,segs,thick,near){
 const out=[];
 for(const i of near(b)){
  const s=segs[i];if(thick&&thick(s))continue;
  for(const [p,q] of [[s.a,s.b],[s.b,s.a]]){
   const dp=dist(p,b),dq=dist(q,b);if(Math.abs(dp-b.r)>2.5||dq<b.r+4)continue;
   const u={x:(q.x-p.x)/s.l,y:(q.y-p.y)/s.l},rad={x:(p.x-b.x)/dp,y:(p.y-b.y)/dp};if(u.x*rad.x+u.y*rad.y<0.8)continue;
   let end=q;
   for(let k=0;k<6;k++){const next=near(end).map(j=>segs[j]).find(o=>o!==s&&!(thick&&thick(o))&&o.l>=2&&[[o.a,o.b],[o.b,o.a]].some(([e,f])=>dist(e,end)<=0.8&&((f.x-e.x)*u.x+(f.y-e.y)*u.y)/o.l>=0.97));
    if(!next)break;end=dist(next.a,end)<=0.8?next.b:next.a}
   if(!out.some(e=>dist(e,end)<=1))out.push(end)
  }
 }
 return out
}
// The outline round a point of a member's view: the region of the view the thick lines close round it, filled on a
// raster of the view (two cells to a point) — any shape (a rib cut slant, a gusset, an angle's L); its box along and
// across the member and its corners (the hull of its edge). A dot at the leader's end is a region of its own too small
// to be the part: the region nearest round it. A region open to the
// edge of the raster or larger than a fifth of it ran out of the part through a gap: the nearest lines round the point (raysAt).
function rasterOf(f){
 if(f.raster)return f.raster;
 const g=f.g,k=g.sc.n,w=g.hi-g.lo,far=400*k,side=Math.max(w,far),R=2;
 const s0=g.s0-far,o0=g.lo-side,W=Math.ceil((g.s1+far-s0)*R)+1,H=Math.ceil((g.hi+side-o0)*R)+1;
 if(W*H>12e6)return f.raster={none:true};
 const cells=new Uint8Array(W*H),put=(x,y)=>{if(x>=0&&y>=0&&x<W&&y<H)cells[y*W+x]=1};
 for(const q of f.P){const x0=(q.a-s0)*R,y0=(q.c-o0)*R,x1=(q.b-s0)*R,y1=(q.d-o0)*R,n=Math.ceil(Math.max(Math.abs(x1-x0),Math.abs(y1-y0)))+1;
  for(let i=0;i<=n;i++){const x=Math.round(x0+(x1-x0)*i/n),y=Math.round(y0+(y1-y0)*i/n);put(x,y);put(x+1,y);put(x,y+1)}}
 return f.raster={cells,W,H,s0,o0,R}
}
function regionAt(E,f){
 const g=f.g,r=rasterOf(f);if(r.none)return null;
 const {cells,W,H,s0,o0,R}=r,s=E.x*g.u.x+E.y*g.u.y,o=E.x*g.n.x+E.y*g.n.y,cap=Math.floor(W*H/5);
 const fill=(x,y)=>{if(x<0||y<0||x>=W||y>=H||cells[y*W+x])return null;
  const seen=new Set([y*W+x]),queue=[y*W+x];let open=false,x0=x,x1=x,y0=y,y1=y;
  while(queue.length){const i=queue.pop(),cx=i%W,cy=(i-cx)/W;if(cx<x0)x0=cx;if(cx>x1)x1=cx;if(cy<y0)y0=cy;if(cy>y1)y1=cy;
   if(cx===0||cy===0||cx===W-1||cy===H-1)open=true;if(open||seen.size>cap)return{open:true};
   for(const j of [i-1,i+1,i-W,i+W])if(!seen.has(j)&&!cells[j]){seen.add(j);queue.push(j)}}
  return{seen,x0,x1,y0,y1,n:seen.size}};
 const at=(ds,dо)=>fill(Math.round((s+ds-s0)*R),Math.round((o+dо-o0)*R));
 let best=at(0,0);
 // (at a line, a thin part drawn by two lines just over it: that one — the dot of a leader has no room in it, ГПЭС К120
 // «11» a rib 10 mm thick at 1:10 beside a plate)
 const ok=x=>x&&!x.open&&x.n>=(3*R)*(3*R),thin=[[1,0],[-1,0],[0,1],[0,-1]].map(([a,b])=>at(a,b)).filter(x=>ok(x)&&Math.min(x.x1-x.x0,x.y1-x.y0)<3*R&&
  !(best&&best.x0===x.x0&&best.y0===x.y0&&best.x1===x.x1&&best.y1===x.y1)).sort((a,b)=>a.n-b.n)[0];
 if(thin&&!(ok(best)&&Math.min(best.x1-best.x0,best.y1-best.y0)<3*R))best=thin;
 if(!best||!best.open&&best.n<(3*R)*(3*R)){
  // (the nearest: 1, 2, 3 points off; there the most of the eight ways, the smallest of a tie — on a line between two
  // parts, the thin one: ГПЭС К120 «11», a rib drawn by two lines 10 mm apart beside a plate)
  for(const d of [1,2,3]){const e=d*0.7071;
   const tries=[[d,0],[-d,0],[0,d],[0,-d],[e,e],[-e,e],[e,-e],[-e,-e]].map(([a,b])=>at(a,b)).filter(ok);
   const votes=new Map();for(const t of tries){const key=t.x0+","+t.y0+","+t.x1+","+t.y1;const v=votes.get(key);if(v)v.k++;else votes.set(key,{t,k:1})}
   best=[...votes.values()].sort((a,b)=>b.k-a.k||a.t.n-b.t.n)[0]?.t||null;if(best)break}}
 if(!best||best.open)return raysAt(r,s,o);
 // (its corners: the hull of the cells on its edge)
 const pts=[];for(const i of best.seen){const cx=i%W,cy=(i-cx)/W;if(!best.seen.has(i-1)||!best.seen.has(i+1)||!best.seen.has(i-W)||!best.seen.has(i+W))pts.push([cx,cy])}
 const hull=hullOf(pts).map(([x,y])=>[x/R+s0,y/R+o0]);
 return{a0:best.x0/R+s0,a1:(best.x1+1)/R+s0,c0:best.y0/R+o0,c1:(best.y1+1)/R+o0,s,o,hull}
}
// A region open through a gap (a long part broken off, ГПЭС К26 «9» the tube on top): the nearest thick lines round the
// point (or a point just off it, at a dot) — across it both ways (none: no part), along it both ways (none past the edge).
function raysAt({cells,W,H,s0,o0,R},s,o){
 const free=[[0,0],[3,0],[-3,0],[0,3],[0,-3]].map(([a,b])=>[Math.round((s+a-s0)*R),Math.round((o+b-o0)*R)]).find(([x,y])=>x>=0&&y>=0&&x<W&&y<H&&!cells[y*W+x]);
 if(!free)return null;
 const [x,y]=free,run=(dx,dy)=>{for(let cx=x,cy=y;cx>=0&&cy>=0&&cx<W&&cy<H;cx+=dx,cy+=dy)if(cells[cy*W+cx])return dx?cx:cy;return null};
 const c0=run(0,-1),c1=run(0,1);if(c0===null||c1===null)return null;
 const a0=run(-1,0),a1=run(1,0);
 return{a0:a0===null?null:(a0+1)/R+s0,a1:a1===null?null:a1/R+s0,c0:(c0+1)/R+o0,c1:c1/R+o0,s,o,hull:null}
}
function hullOf(pts){
 const p=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;
 const x=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lo=[],hi=[];
 for(const e of p){while(lo.length>=2&&x(lo[lo.length-2],lo[lo.length-1],e)<=0)lo.pop();lo.push(e)}
 for(const e of p.slice().reverse()){while(hi.length>=2&&x(hi[hi.length-2],hi[hi.length-1],e)<=0)hi.pop();hi.push(e)}
 return lo.slice(0,-1).concat(hi.slice(0,-1))
}
// The positions on the views of the members of a sheet: [{mark, rows:[{pos, side, view, face, at_mm:[a0, a1],
// off_mm:[o0, o1]}]}] — `seeded`: the views of the members (sheetHoles with `seed` and `withMembers`).
function sheetParts(geo={},{seeded=null}={}){
 if(!seeded||!seeded.members)return[];
 const segs=dedupe(geo.segments||[]),thick=thickOf(segs);if(!thick)return[];
 const near=gridOf(segs,40),bold=segs.filter(thick),balloons=balloonsOf(geo.texts||[],segs),byMark=new Map();
 const frames=seeded.members.map(({g,view})=>{const proj=projector(g),P=bold.map(q=>({...proj(q),l:q.l})),f=facesOf(g,segs,P);
  return{g,view,P,face:f.top!==undefined&&f.bot!==undefined?"web":f.web?"flange":null,marks:g.who.named||g.who.view?.marks||view.marks||[]}});
 // The places along a view beside the main one, in line with it (a view «Вид А» of a column drawn by it, its levels on
 // the same lines): by the main view's dimensions — a stretch drawn shorter is measured there (ГПЭС К26: the tube
 // «1690» broken off in both, its chain written by the main one only).
 for(const f of frames){const g=f.g;f.ref=f;
  const main=frames.filter(o=>o!==f&&o.g.who.main&&o.marks.some(m=>f.marks.includes(m))&&Math.abs(o.g.u.x*g.u.y-o.g.u.y*g.u.x)<0.003&&o.g.u.x*g.u.x+o.g.u.y*g.u.y>0&&
   Math.min(o.g.s1,g.s1)-Math.max(o.g.s0,g.s0)>=0.8*(g.s1-g.s0)&&o.g.sc.k===g.sc.k).sort((a,b)=>(b.g.s1-b.g.s0)-(a.g.s1-a.g.s0))[0];
  if(main&&!g.who.main)f.ref=main}
 for(const b of balloons)for(const E of leadersOf(b,segs,thick,near)){
  // (the view the end of the leader is in, or beside it — out of it by its width, 400 mm at least; past its ends by
  // 400 mm: a plate on an end, К120 «12»)
  let best=null;
  for(const f of frames){const g=f.g,s=E.x*g.u.x+E.y*g.u.y,o=E.x*g.n.x+E.y*g.n.y,w=g.hi-g.lo,far=400*g.sc.n,out=Math.max(0,g.lo-o,o-g.hi,g.s0-s,s-g.s1);
   if(s<g.s0-far||s>g.s1+far||out>Math.max(w,far))continue;if(!best||out<best.out)best={f,out}}
  if(!best)continue;
  const {f}=best,g=f.g,k=g.sc.n,axis=(g.lo+g.hi)/2,mm=c=>c===null?null:Math.round((c-axis)/k),r=f.ref.g;
  const box=regionAt(E,f)||{s:E.x*g.u.x+E.y*g.u.y,o:E.x*g.n.x+E.y*g.n.y,a0:null,a1:null,c0:null,c1:null,hull:null};
  // (past an end of the view at its scale from the end: plates on an end are drawn at it, a chain there may be another's
  // — ГПЭС К120 «12», 215 long, read 873 by a «736» of the holes)
  const along=p=>p===null?null:p<r.s0?r.alongMm(r.s0)-Math.round((r.s0-p)/r.sc.n):p>r.s1?r.alongMm(r.s1)+Math.round((p-r.s1)/r.sc.n):r.alongMm(p);
  const at=[along(box.a0),along(box.a1)];
  for(const mark of f.marks){if(!byMark.has(mark))byMark.set(mark,[]);
   byMark.get(mark).push({pos:b.pos,...(b.side?{side:b.side}:{}),view:f.view.title,...(g.who.main?{main:true}:{}),...(f.face?{face:f.face}:{}),dir:f.view.dir,of_mm:r.length,
    at_mm:at,off_mm:[mm(box.c0),mm(box.c1)],end_mm:[along(box.s),mm(box.o)],
    // (its outline, when it is not a box: [along, across] mm)
    ...(box.hull&&box.hull.length>4&&box.hull.length<=24?{poly:box.hull.map(([a,c])=>[along(a),mm(c)])}:{})})}
 }
 return[...byMark].map(([mark,rows])=>({mark,rows}))
}
module.exports={sheetParts,balloonsOf,leadersOf,regionAt};
