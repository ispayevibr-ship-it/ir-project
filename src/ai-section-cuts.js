"use strict";
/* Знаки разрезов на плане (ИР-71535 АР ч.1 л.10 «План на отм. 0,000»: «1 … 1», «3 … 3», «4 … 4», ломаный «2 … 2»; просьба
   инженера 16.11.2026 «весь лист пусть читает» — разрез сверяет 3D там, где он проходит): концы линии разреза — толстые
   штрихи 18…45 pt (2,28 pt против 0,48…0,84 линий плана) с цифрой разреза рядом; два конца одной цифры — одна линия; если
   они не на одной прямой — излом: короткие толстые уголки на прямых обоих концов на общей поперечной (у «2-2» л.10 —
   y 470). На сетку — по кружкам осей плана (`planAxes`): место по листу → мм прямой по осям, выбросы отброшены.
   Выход: [{name, way:"x"|"y", runs:[{at, from, to}]}] — разрез вдоль x (way "x") проходит на y = at мм, вдоль y — на x = at;
   from…to — его участок поперёк. */
const {planAxes}=require("./ai-ar-extract");

const len=s=>Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y);
function cutEnds({segments=[],texts=[]}){
 const ends=segments.filter(s=>(s.w||0)>=1.9&&len(s)>=18&&len(s)<=45&&(Math.abs(s.a.x-s.b.x)<.5||Math.abs(s.a.y-s.b.y)<.5));
 const digits=texts.filter(t=>/^\s*\d{1,2}\s*$/.test(String(t.str))&&!t.angle);
 const out=[];
 for(const s of ends){const cx=(s.a.x+s.b.x)/2,cy=(s.a.y+s.b.y)/2,vert=Math.abs(s.a.x-s.b.x)<.5;
  const near=digits.map(t=>({t,d:Math.hypot(t.x+(t.width||0)/2-cx,t.y-(t.size||10)*.36-cy)})).filter(o=>o.d<=48).sort((a,b)=>(b.t.size||0)-(a.t.size||0)||a.d-b.d)[0];
  if(near)out.push({name:String(near.t.str).trim(),size:near.t.size||0,vert,c:vert?cx:cy,along:vert?cy:cx,s})}
 // (the mark of a section is the largest digit by the stroke: the numbers of the rooms are smaller)
 const big=Math.max(0,...out.map(o=>o.size));return out.filter(o=>o.size>=big*.9)
}
function sectionCutsPt(g){
 const ends=cutEnds(g),thick=(g.segments||[]).filter(s=>(s.w||0)>=1.4&&len(s)<=40),out=[];
 const names=[...new Set(ends.map(e=>e.name))];
 for(const n of names){const e=ends.filter(o=>o.name===n);if(e.length!==2||e[0].vert!==e[1].vert)continue;
  const [p,q]=e[0].along<e[1].along?e:[e[1],e[0]],vert=p.vert;
  if(Math.abs(p.c-q.c)<=2){out.push({name:n,vert,runs:[{c:(p.c+q.c)/2,from:p.along,to:q.along}]});continue}
  // (a broken line: the corners on both lines at one place across)
  const on=(s,c)=>vert?Math.abs(s.a.x-c)<1.5&&Math.abs(s.b.x-c)<1.5:Math.abs(s.a.y-c)<1.5&&Math.abs(s.b.y-c)<1.5;
  const across=s=>vert?Math.abs(s.a.y-s.b.y)<.5?s.a.y:null:Math.abs(s.a.x-s.b.x)<.5?s.a.x:null;
  const touch=(s,c)=>vert?Math.min(Math.abs(s.a.x-c),Math.abs(s.b.x-c))<1.5:Math.min(Math.abs(s.a.y-c),Math.abs(s.b.y-c))<1.5;
  const jp=thick.filter(s=>s!==p.s&&across(s)!==null&&touch(s,p.c)).map(across),jq=thick.filter(s=>s!==q.s&&across(s)!==null&&touch(s,q.c)).map(across);
  const j=jp.find(a=>jq.some(b=>Math.abs(a-b)<1.5)&&a>p.along&&a<q.along);
  if(j===undefined||!thick.some(s=>on(s,p.c))&&!jp.length)continue;
  out.push({name:n,vert,runs:[{c:p.c,from:p.along,to:j},{c:q.c,from:j,to:q.along}]})}
 return out
}
// a straight line through the bubbles: mm = a + b·pt, the farthest off dropped while it is off by more than 150 mm
function fit(pairs){let P=pairs.slice();
 for(;;){if(P.length<2)return null;const n=P.length,mx=P.reduce((s,p)=>s+p[0],0)/n,my=P.reduce((s,p)=>s+p[1],0)/n;
  const sxx=P.reduce((s,p)=>s+(p[0]-mx)**2,0);if(!sxx)return null;const b=P.reduce((s,p)=>s+(p[0]-mx)*(p[1]-my),0)/sxx,a=my-b*mx;
  const off=P.map(p=>Math.abs(a+b*p[0]-p[1])),k=off.indexOf(Math.max(...off));if(off[k]<=150||P.length<=3)return{a,b,n:P.length};P.splice(k,1)}}
function sectionCuts(g,grid){
 const axes=planAxes(g);if(!axes||!grid)return[];
 const gx=grid.gridX||{},gy=grid.gridY||{};
 const pick=(lines,map)=>lines.map(l=>l.items.filter(i=>map[i.name]!==undefined).map(i=>[i.pt,map[i.name]])).sort((a,b)=>b.length-a.length)[0]||[];
 // (the bubbles of the X axes stand in a row — their x on the sheet; of the Y axes in a column — their y)
 const fx=fit(pick(axes.rows,gx)),fy=fit(pick(axes.cols,gy));if(!fx||!fy)return[];
 const X=v=>Math.round(fx.a+fx.b*v),Y=v=>Math.round(fy.a+fy.b*v);
 return sectionCutsPt(g).map(c=>({name:c.name,way:c.vert?"y":"x",runs:c.runs.map(r=>{const f=c.vert?Y:X,a=f(r.from),b=f(r.to);
  return{at:c.vert?X(r.c):Y(r.c),from:Math.min(a,b),to:Math.max(a,b)}})}))
}
module.exports={sectionCuts,sectionCutsPt,cutEnds};
