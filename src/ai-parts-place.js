"use strict";
// The positions of an assembly sheet (КМД) at their places on the views of its marks (the engineer, 28.10.2026: «ты
// деталировочные чертежи обрабатываешь процентов на 5», «это не только колонн касается, это всех деталей»). A position
// is named on a view by its number in a circle (ГОСТ 2.316: a balloon, its leader to the part ending in a dot inside it);
// the part is the outline of thick lines round the end of the leader. Its place in the scale of the view: along the
// member from the start of its view (as the holes, src/ai-holes-extract.js), across from its axis (+ down, or + left of
// an upright one), on each view it is drawn on; the view says which face of an I it shows (facesOf).
const {dedupe,gridOf,projector,facesOf,thickOf}=require("./ai-holes-extract");
const {dimensionsOf}=require("./ai-scheme-extract");

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
  let best=ringOf(pts);
  // (a middle the lines round it pull off — a dimension, the part's lines through the ring's reach —: the point near it
  // most ends lie at one distance from, ГПЭС К26 «8» by the brackets)
  if(!round(best)){const c0={x:t.x+(t.width||0)/2,y:t.y-t.size*0.35},all=[],step=t.size*0.02,span=t.size*0.25;
   for(const i of near(c0))for(const p of [segs[i].a,segs[i].b])if(dist(p,c0)<=t.size*1.5)all.push(p);
   for(let dx=-span;dx<=span+1e-9;dx+=step)for(let dy=-span;dy<=span+1e-9;dy+=step){const o={x:c0.x+dx,y:c0.y+dy},ds=all.map(p=>dist(p,o)).filter(d=>d>=t.size*0.45&&d<=t.size*1.2).sort((a,b)=>a-b);
    let j=0,n=0;for(let i=0;i<ds.length;i++){while(ds[i]-ds[j]>1.2)j++;n=Math.max(n,i-j+1)}
    if(n>(best?.n||0)){const ring=ringOf(all.map(p=>({p,d:dist(p,o),a:Math.atan2(p.y-o.y,p.x-o.x)})).filter(q=>q.d>=t.size*0.45&&q.d<=t.size*1.2));if(ring){ring.n=n;ring.c=o;best=ring}}}
   if(best?.c)c=best.c}
  if(!round(best))continue;
  out.push({pos:m[1],side:m[2]||"",x:c.x,y:c.y,r:best.on.reduce((a,q)=>a+q.d,0)/best.on.length,t})
 }
 return out
}
// The ends at one distance from the middle (within 1.2 pt), the most of them: {r, on}.
function ringOf(pts){let best=null;for(const p of pts){const on=pts.filter(q=>Math.abs(q.d-p.d)<=1.2);if(!best||on.length>best.on.length)best={r:p.d,on}}return best}
// (a ring: twelve ends at least, all round — no gap over a quarter turn)
function round(ring){if(!ring||ring.on.length<12)return false;
 const as=ring.on.map(q=>q.a).sort((x,y)=>x-y),gap=Math.max(as[0]+2*Math.PI-as[as.length-1],...as.slice(1).map((a,i)=>a-as[i]));return gap<=Math.PI/2}
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
 // A note «Только для К27» by a part — a line from it, its far end by the leader's end of a balloon (within 60 pt) —: that
 // part is of those marks only (ГПЭС К26, К27: the bracket at «3 - 3» on the right of К26, on the left of К27).
 const only=new Map(),ends=new Map(balloons.map(b=>[b,leadersOf(b,segs,thick,near)]));
 for(const t of geo.texts||[]){const m=/^только\s+для\s+(.+)$/iu.exec(String(t.str||"").trim()),marks=m&&m[1].match(MARKS);if(!marks)continue;
  const x0=t.x-15,x1=t.x+(t.width||0)+15,y0=t.y-(t.size||10)-6,y1=t.y+6,inBox=p=>p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1;
  const far=[];for(const i of new Set([x0,(x0+x1)/2,x1].flatMap(x=>near({x,y:t.y}))))for(const [p,q] of [[segs[i].a,segs[i].b],[segs[i].b,segs[i].a]])if(!thick(segs[i])&&inBox(p)&&!inBox(q))far.push(q);
  let best=null;for(const [b,list] of ends)for(const E of list)for(const F of far){const d=dist(E,F);if(d<=60&&(!best||d<best.d))best={b,d}}
  if(best)only.set(best.b,marks)}
 for(const b of balloons)for(const E of ends.get(b)){
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
  for(const mark of f.marks){if(only.has(b)&&!only.get(b).includes(mark))continue;if(!byMark.has(mark))byMark.set(mark,[]);
   byMark.get(mark).push({pos:b.pos,...(b.side?{side:b.side}:{}),view:f.view.title,...(g.who.main?{main:true}:{}),...(f.face?{face:f.face}:{}),dir:f.view.dir,of_mm:r.length,
    at_mm:at,off_mm:[mm(box.c0),mm(box.c1)],end_mm:[along(box.s),mm(box.o)],
    // (its outline, when it is not a box: [along, across] mm)
    ...(box.hull&&box.hull.length>4&&box.hull.length<=24?{poly:box.hull.map(([a,c])=>[along(a),mm(c)])}:{})})}
 }
 // (the parts the cuts across the members show — their places across both ways —, each at its level along)
 cutParts({texts:geo.texts||[],segs,thick,bold,balloons,near,frames,byMark});
 return[...byMark].map(([mark,rows])=>({mark,rows}))
}
const CUT=/^(\d{1,2}[а-я]?|[А-ЯЁ])\s*[-–—]\s*\1(?=\s|$|\()/u,MARKS=/[А-ЯЁA-Z]{1,3}\d{1,4}(?:[-.]\d{1,3})?[а-я]?/gu;
// The cuts across the upright members of a sheet («4 - 4» of a column, looking down it; ГПЭС К26: the angles «6», «7т»,
// «7н» of its brackets drawn across the column only there — «4 - 4» at four levels, «3 - 3 для К26», «2 - 2»). A cut by its
// title: the marks it names («для К26»), else of the view its arrows are on; its levels — the thick strokes of its arrows
// («4», «по 4») across that view; the member's section in it — the rectangle of thick lines as wide as that view at the
// level (the tube on top of К26 in «6 - 6»), as deep as a view of its side there (or from half to twice as wide); its
// scale by its own dimensions. Each balloon in it: the outline round its leader's end across the main view (+ left, as
// there) and into it (`depth_mm`, + away from its viewer). Its along: of the row of the position on a view of the mark
// next under the level (the side view draws the angle «7т» of the bracket, the main one the rib «8» under it); of a part
// no view draws («7н» on the far side) as far under it as the others of the cut are. Such a row takes the place of the
// view's; a part on the main view the cut does not show, its outline touching one placed so (a rib under the angle), is
// in the middle of that one's depth.
function cutParts({texts,segs,thick,bold,balloons,near,frames,byMark}){
 const mains=frames.filter(f=>f.g.who.main&&Math.abs(f.g.u.y)>Math.abs(f.g.u.x));if(!mains.length)return;
 const dims=dimensionsOf(texts,segs),cuts=[];
 const centre=t=>({x:t.x+(t.width||0)/2,y:t.y-(t.size||10)*0.35});
 // (a view at a place along: its outermost long thick lines along it crossing there — its width, and its middle off the
 // view's axis, mm + left: the tube on top of К26 flush with the front flange)
 const spanAt=(f,sa)=>{const g=f.g,c=f.P.filter(q=>Math.abs(q.c-q.d)<=0.4&&Math.abs(q.a-q.b)>=200*g.sc.n&&Math.min(q.a,q.b)<=sa&&Math.max(q.a,q.b)>=sa&&q.c>=g.lo-1-0.1*(g.hi-g.lo)&&q.c<=g.hi+1+0.1*(g.hi-g.lo)).map(q=>q.c);
  // (a section narrower than a third of the view: its web — the view's band)
  return c.length>=2&&Math.max(...c)-Math.min(...c)>=(g.hi-g.lo)/3?{w:(Math.max(...c)-Math.min(...c))/g.sc.n,mid:Math.round(((Math.max(...c)+Math.min(...c))/2-(g.lo+g.hi)/2)/g.sc.n)}:{w:(g.hi-g.lo)/g.sc.n,mid:0}};
 const widthAt=(f,sa)=>spanAt(f,sa).w;
 for(const t of texts){
  const m=CUT.exec(String(t.str||"").trim());if(!m||Math.abs(t.angle||0)>5)continue;
  const z=t.size||10,label=m[1],at=centre(t);
  const under=texts.filter(o=>o!==t&&/^для\s/iu.test(String(o.str).trim())&&o.y>t.y&&o.y-t.y<=2.5*z&&o.x+(o.width||0)>=t.x-z&&o.x<=t.x+(t.width||0)+z).map(o=>String(o.str)).join(" ");
  const named=[...new Set(((String(t.str)+" "+under).match(MARKS)||[]))].filter(k=>frames.some(f=>f.marks.includes(k)));
  // (its arrows: «4», «по 4» as large as the title, each by a short thick stroke across a main view of its marks)
  const re=new RegExp("^(?:по\\s*)?"+label+"$","u"),levels=[];
  for(const a of texts){if(a===t||!re.test(String(a.str||"").trim())||Math.abs((a.size||0)-z)>z*0.2)continue;const c=centre(a);
   // (the stroke off the box of the label by its size and a half at most: under «по 4», 27 pt under its line)
   const za=a.size||z,bx={x0:a.x,x1:a.x+(a.width||0),y0:a.y-za,y1:a.y};
   const st=bold.filter(q=>Math.abs(q.a.y-q.b.y)<=1&&q.l>=10&&q.l<=80&&Math.hypot(Math.max(0,bx.x0-Math.max(q.a.x,q.b.x),Math.min(q.a.x,q.b.x)-bx.x1),Math.max(0,bx.y0-q.a.y,q.a.y-bx.y1))<=1.5*za)
    .sort((p,q)=>Math.abs((p.a.y+p.b.y)/2-c.y)-Math.abs((q.a.y+q.b.y)/2-c.y))[0];if(!st)continue;
   const y=(st.a.y+st.b.y)/2,x=(st.a.x+st.b.x)/2;
   for(const f of mains){const g=f.g,sa=x*g.u.x+y*g.u.y,o=x*g.n.x+y*g.n.y,w=g.hi-g.lo;
    if(named.length&&!f.marks.some(k=>named.includes(k))||sa<g.s0-2||sa>g.s1+2||Math.abs(o-(g.lo+g.hi)/2)>3*w)continue;
    if(!levels.some(l=>l.f===f&&Math.abs(l.sa-sa)<=3))levels.push({f,sa,at:g.alongMm(sa)})}}
  if(!levels.length)continue;
  const f=levels[0].f,marks=named.length?named:f.marks;
  // (its scale: of its dimensions under the title, agreeing)
  const win={x0:at.x-300,x1:at.x+350,y0:t.y,y1:t.y+350},inWin=(x,y)=>x>=win.x0&&x<=win.x1&&y>=win.y0&&y<=win.y1;
  const ks=dims.filter(d=>d.v>=10&&inWin(d.flat?(d.lo+d.hi)/2:d.line,d.flat?d.line:(d.lo+d.hi)/2)).map(d=>(d.hi-d.lo)/d.v).sort((a,b)=>a-b);
  const km=ks[Math.floor(ks.length/2)],k=ks.filter(v=>Math.abs(v-km)<=km*0.04).length>=2?km:f.g.sc.n;
  // (the section: as wide as the view at its first level — the outer faces of the flanges of an I, its sides open; a box's
  // two sides —, as deep as a view of its side there, else from half to twice as wide)
  const W=widthAt(f,levels[0].sa)*k,side=frames.find(o=>o!==f&&o.ref===f),H=side?widthAt(side,levels[0].sa)*k:null;
  const runs=[];for(const q of bold){if(Math.abs(q.a.y-q.b.y)>0.4||Math.abs(q.a.x-q.b.x)<4)continue;const c=(q.a.y+q.b.y)/2,lo=Math.min(q.a.x,q.b.x),hi=Math.max(q.a.x,q.b.x);
   if(!inWin((lo+hi)/2,c))continue;const r=runs.find(r=>Math.abs(r.c-c)<=0.3&&lo<=r.hi+1&&hi>=r.lo-1);if(r){r.lo=Math.min(r.lo,lo);r.hi=Math.max(r.hi,hi)}else runs.push({c,lo,hi})}
  const covers=(l,a,b)=>Math.min(l.hi,b)-Math.max(l.lo,a)>=0.9*(b-a);
  let rect=null;
  for(const free of H?[false,true]:[true]){
   for(const a of runs){if(Math.abs(a.hi-a.lo-W)>W*0.07)continue;const x0=a.lo,x1=a.hi;
    for(const b of runs){if(b===a||!covers(b,x0,x1))continue;const y0=Math.min(a.c,b.c),y1=Math.max(a.c,b.c),h=y1-y0;
     if(free?h<0.5*W||h>2*W:Math.abs(h-H)>H*0.1)continue;
     // (the nearest under the title as deep as the other view — or, not known, as wide —; of two such round one section,
     // the inner lines of a flange, the larger)
     const d=Math.abs(h/(free?W:H)-1)+Math.hypot((x0+x1)/2-at.x,y0-at.y)/(10*W),same=rect&&Math.abs(rect.x0-x0)<=1.5&&Math.abs(rect.x1-x1)<=1.5&&Math.min(rect.y1,y1)-Math.max(rect.y0,y0)>=0.75*Math.min(h,rect.y1-rect.y0);
     if(!rect||(same?h>rect.y1-rect.y0:d<rect.d-0.05))rect={x0,x1,y0,y1,d}}}
   if(rect)break}
  if(!rect)continue;
  // (the section's middle off the member's axis: across as the main view, into it as the view of its side — + left there,
  // its arrow on the right of the main one)
  cuts.push({title:String(t.str).trim()+(under?" "+under.trim():""),marks,levels,k,rect,f,off0:spanAt(f,levels[0].sa).mid,depth0:side?-spanAt(side,levels[0].sa).mid:0})
 }
 if(!cuts.length)return;
 // Each balloon's leader end in a cut (by its section — its own outline round it, as far again as the section is wide).
 for(const b of balloons)for(const E of leadersOf(b,segs,thick,near)){
  const c=cuts.map(c=>{const r=c.rect,w=r.x1-r.x0,h=r.y1-r.y0;return{c,out:Math.max(0,r.x0-E.x,E.x-r.x1,r.y0-E.y,E.y-r.y1),lim:Math.max(w,h)}}).filter(o=>o.out<=o.lim).sort((p,q)=>p.out-q.out)[0]?.c;
  if(!c)continue;const r=c.rect,g={u:{x:1,y:0},n:{x:0,y:1},s0:r.x0,s1:r.x1,lo:r.y0,hi:r.y1,sc:{n:c.k}};
  if(!c.frame)c.frame={g,P:bold.map(q=>({a:q.a.x,b:q.b.x,c:q.a.y,d:q.b.y,l:q.l}))};
  const box=regionAt(E,c.frame);if(!box||box.a0===null||box.a1===null)continue;
  const cx=(r.x0+r.x1)/2,cy=(r.y0+r.y1)/2,mm=v=>Math.round(v/c.k);
  (c.parts=c.parts||[]).push({pos:b.pos,side:b.side,off:[mm(cx-box.a1)+c.off0,mm(cx-box.a0)+c.off0],depth:[mm(cy-box.c1)+c.depth0,mm(cy-box.c0)+c.depth0]})
 }
 const overlap=(p,q)=>p&&q&&p[0]!==null&&p[1]!==null&&q[0]!==null&&q[1]!==null?Math.min(Math.max(...p),Math.max(...q))-Math.max(Math.min(...p),Math.min(...q)):-Infinity;
 const med=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
 for(const mark of new Set(cuts.flatMap(c=>c.parts?.length?c.marks:[]))){
  const rows=byMark.get(mark)||[];if(!byMark.has(mark))byMark.set(mark,rows);
  const mine=cuts.filter(c=>c.parts?.length&&c.marks.includes(mark)),made=[],used=new Set(),shift=[];
  // (and under no other level of the mark's cuts nearer: the bracket under «3 - 3» is not one under «4 - 4» over it)
  const all=cuts.filter(o=>o.marks.includes(mark)).flatMap(o=>o.levels.map(l=>l.at)),next=a=>all.filter(v=>v<=a+150).sort((x,y)=>y-x)[0];
  // (the row of the position under the level: on the main view across as the cut; on a view of its side the near side,
  // else the one there)
  const rowOf=(p,lv)=>{const list=rows.filter(r=>!used.has(r)&&!r.cut&&String(r.pos)===p.pos&&r.at_mm[0]!==null&&r.at_mm[1]!==null&&r.at_mm[0]>=lv.at-150&&r.at_mm[0]<=lv.at+700&&next(r.at_mm[0])===lv.at&&
    (!r.main||overlap(r.off_mm,p.off)>0)).sort((a,b)=>Math.abs(a.at_mm[0]-lv.at)-Math.abs(b.at_mm[0]-lv.at));
   return list.find(r=>r.main||overlap(r.off_mm,p.depth)>0||overlap(r.off_mm,p.depth.map(v=>-v))>0)||list.find(r=>!r.main)};
  for(const c of mine)for(const lv of c.levels)for(const p of c.parts){const r=rowOf(p,lv);if(!r)continue;used.add(r);shift.push({c,pos:p.pos,d0:r.at_mm[0]-lv.at,d1:r.at_mm[1]-lv.at});made.push({c,p,lv,at:r.at_mm})}
  // (a part no view draws there: as far under the level as the position is under the others, as long — of this cut, else
  // any —; of a position no view draws, its top only, as far under as the parts of the cuts are)
  for(const c of mine)for(const lv of c.levels)for(const p of c.parts){if(made.some(x=>x.p===p&&x.lv===lv))continue;
   const s=[shift.filter(x=>x.c===c&&x.pos===p.pos),shift.filter(x=>x.pos===p.pos)].find(l=>l.length);
   if(s){made.push({c,p,lv,at:[lv.at+med(s.map(x=>x.d0)),lv.at+med(s.map(x=>x.d1))]});continue}
   const o=[shift.filter(x=>x.c===c),shift].find(l=>l.length);if(o){const a=lv.at+med(o.map(x=>x.d0));made.push({c,p,lv,at:[a,a]})}}
  for(const r of used)rows.splice(rows.indexOf(r),1);
  for(const x of made){const f=x.c.f;rows.push({pos:x.p.pos,...(x.p.side?{side:x.p.side}:{}),view:f.view.title,main:true,...(f.face?{face:f.face}:{}),dir:f.view.dir,of_mm:f.g.length,
   at_mm:x.at,off_mm:x.p.off,depth_mm:x.p.depth,cut:x.c.title})}
  // (a part of the main view the section of a cut is — the tube on top —: as deep as there; one beside a part so placed,
  // half of it within that one both ways — a rib under the angle —: in the middle of its depth)
  for(const r of rows){if(r.cut||!r.main||r.depth_mm||r.at_mm[0]===null||r.at_mm[1]===null||r.off_mm[0]===null||r.off_mm[1]===null)continue;
   const c=mine.find(c=>c.levels.some(l=>l.at>=Math.min(...r.at_mm)&&l.at<=Math.max(...r.at_mm))&&Math.abs(Math.abs(r.off_mm[1]-r.off_mm[0])-(c.rect.x1-c.rect.x0)/c.k)<=0.1*(c.rect.x1-c.rect.x0)/c.k);
   if(c&&c.depth0){const h=(c.rect.y1-c.rect.y0)/c.k/2;r.depth_mm=[Math.round(c.depth0-h),Math.round(c.depth0+h)];continue}
   const o=rows.find(q=>q.cut&&overlap(q.off_mm,r.off_mm)>=0.5*Math.abs(r.off_mm[1]-r.off_mm[0])&&overlap(q.at_mm,r.at_mm)>=0.5*Math.abs(r.at_mm[1]-r.at_mm[0]));
   if(o){const d=Math.round((o.depth_mm[0]+o.depth_mm[1])/2);r.depth_mm=[d,d]}}
 }
}
// The ends of the members cut aslant on their main views drawn along the sheet (a tube cut over its seat — ГПЭС К14,
// К16: from its top 100 mm in down to 20 mm over its bottom at the end, «100», «120»; the cap welded in 110 from the
// end, «110»): [{mark, view, rows:[{end, from, run_mm, drop_mm, drop, cap_mm}]}] — end 0 at the start of the view (its
// left), from the edge it is cut from (top, bottom), run along it, drop across from it — drop_mm by the dimension of its
// span, drop the part of the width drawn (a view drawn to another scale across); cap_mm — the dimension from the end a
// little past the cut (up to 60 mm): a plate across inside.
function sheetBevels(geo={},{seeded=null}={}){
 if(!seeded||!seeded.members)return[];
 const segs=dedupe(geo.segments||[]),thick=thickOf(segs);if(!thick)return[];
 const bold=segs.filter(thick),dims=dimensionsOf(geo.texts||[],geo.segments||[]),out=[];
 for(const {g,view} of seeded.members){
  if(!g.who?.main||!(g.length>0)||Math.abs(g.u.x)<0.99)continue;
  const proj=projector(g),w=g.hi-g.lo,L=g.s1-g.s0,rows=[];
  for(const q of bold){const p=proj(q);
   if(Math.abs(p.a-p.b)<1||Math.abs(p.c-p.d)<w*0.3||Math.min(p.c,p.d)<g.lo-1.5||Math.max(p.c,p.d)>g.hi+1.5)continue;
   for(const end of [0,1]){
    const e=end?g.s1:g.s0,[near,far]=Math.abs(p.a-e)<=Math.abs(p.b-e)?[[p.a,p.c],[p.b,p.d]]:[[p.b,p.d],[p.a,p.c]];
    if(Math.abs(near[0]-e)>1.5||Math.abs(far[0]-e)>0.3*L||rows.some(r=>r.end===end))continue;
    const from=Math.abs(far[1]-g.lo)<=1.5?"top":Math.abs(far[1]-g.hi)<=1.5?"bottom":null;if(!from)continue;
    const run=Math.round(Math.abs(g.alongMm(far[0])-g.alongMm(e))),lo=Math.min(near[1],far[1]),hi=Math.max(near[1],far[1]);if(!(run>0))continue;
    const across=dims.filter(d=>!d.flat&&Math.abs(d.lo-lo)<=1.5&&Math.abs(d.hi-hi)<=1.5&&Math.abs(d.line-e)<=150).sort((x,y)=>Math.abs(x.line-e)-Math.abs(y.line-e))[0];
    const cap=dims.filter(d=>d.flat&&(end?Math.abs(d.hi-e)<=1.5:Math.abs(d.lo-e)<=1.5)&&d.v>run&&d.v<=run+60&&d.line>g.lo-150&&d.line<g.hi+150).sort((x,y)=>x.v-y.v)[0];
    rows.push({end,from,run_mm:run,drop_mm:across?across.v:null,drop:Math.round((hi-lo)/w*100)/100,...(cap?{cap_mm:cap.v}:{})})
   }
  }
  if(rows.length)for(const mark of g.who.named||g.who.view?.marks||view.marks||[])out.push({mark,view:view.title,rows:rows.sort((x,y)=>x.end-y.end)})
 }
 return out
}
module.exports={sheetParts,sheetBevels,balloonsOf,leadersOf,regionAt};
