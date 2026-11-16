"use strict";
/*
 * IR Project AI: план кровли АР (АР ч.1 л.5 «План кровли» ИР-71535; инженер 16.11.2026 «покажи как ты его распознаешь»,
 * «а почему не все читает? допиши»).
 *
 * Сетку осей плана читает extractScheme (src/ai-scheme-extract.js); здесь — всё остальное, что лежит на плане кровли и
 * рядом с ним, каждое со своим местом в миллиметрах сетки:
 *   таблицы листа — «Экспликация кровли», «Таблица отверстий, ниш и штраб» (строки по колонкам шапки);
 *   отверстия — прямоугольник с номером строки таблицы на выноске: размер, раздел (ВК, ОВ), отметка из таблицы,
 *     размер по чертежу и расхождение с таблицей;
 *   уклоны — «i=0,5%», «21,1%», «10,0%» у своей стрелки, с направлением надписи;
 *   элементы по выноскам — пожарные лестницы (тип П1, П2, лист КМ3), ограждение кровли (лист КМ3), водосток, желоба,
 *     воронки (лист АР, ВК), узлы «По узлу N см. лист АР-M» — точка, куда показывает выноска;
 *   отметки на плане — отметка кровли в точке.
 * Только чтение: панели кровли берутся из АР ч.2 (раскладка), сталь — из КМ; здесь ничего не ставится в схему.
 */

const LEVEL=/^[+\-−]?\d{1,2}[,.]\d{3}$/u;
const SLOPE=/^(?:i\s*=\s*)?(\d{1,2}[,.]\d{1,2})\s*%$/u;

const str=t=>String(t?.str||"").trim();
const level=s=>{const v=Number(String(s).replace("−","-").replace(",","."));return Number.isFinite(v)?Math.round(v*1000):null};

// A table of the sheet under its title: the header row is the first row of three and more texts under it, its texts the
// columns; each row under it — texts at one height (±3 pt), each in the column whose header starts at or left of it.
function readTable(texts,title,segments=[]){
 const t0=title,h=Number(t0.size)||12,below=texts.filter(u=>u!==t0&&Math.abs(Number(u.angle)||0)<2&&u.y>t0.y+2&&u.y<t0.y+h*20&&u.x>t0.x-h*14&&u.x<t0.x+h*30);
 const rows=[];for(const u of below.sort((a,b)=>a.y-b.y)){const r=rows.find(r=>Math.abs(r.y-u.y)<=3);if(r)r.t.push(u);else rows.push({y:u.y,t:[u]})}
 // The header: the rows within 1.4 heights of its first row (a header in two lines — «Тип кровли» over «по проекту»), its
 // lettering no smaller than 0.8 of it (the «2» of «м²» is no column); columns — its texts by place across, a column's
 // lines joined.
 const first=rows.find(r=>r.t.length>=2);if(!first)return null;
 const hs=Math.max(...first.t.map(u=>Number(u.size)||0));
 const band=rows.filter(r=>Math.abs(r.y-first.y)<=hs*1.4).flatMap(r=>r.t).filter(u=>(Number(u.size)||0)>=hs*.8);
 const cols=[];for(const u of band.sort((a,b)=>a.y-b.y)){const c=cols.find(c=>Math.abs(c.x-u.x)<=hs*1.2);if(c)c.str=c.str+" "+str(u);else cols.push({x:u.x,str:str(u)})}
 cols.sort((a,b)=>a.x-b.x);if(cols.length<3)return null;
 const head={y:Math.max(...band.map(u=>u.y))},out=[];
 // The vertical lines of the table crossing its header, one between each two columns.
 const walls=[];
 for(const s of segments){if(Math.abs(s.a.x-s.b.x)>.4)continue;const x=s.a.x,lo=Math.min(s.a.y,s.b.y),hi=Math.max(s.a.y,s.b.y);
  if(lo>head.y-2||hi<head.y+2)continue;for(let i=0;i+1<cols.length;i++)if(x>cols[i].x+2&&x<cols[i+1].x-1&&!walls.some(w=>Math.abs(w-x)<3))walls.push(x)}
 walls.sort((a,b)=>a-b);if(walls.length!==cols.length-1)walls.length=0;
 // Two header lines («Тип кровли» over «по проекту»): the line under the header with no number in its first column.
 let last=head.y;
 for(const r of rows){
  if(r.y<=head.y)continue;
  // (only what lies across the table's columns: an axis bubble «Н» or a section's «5» of the plan beside it is no row)
  r.t=r.t.filter(u=>u.x>=cols[0].x-hs);if(!r.t.length)continue;
  // (the table ends at a gap of three lines or at a title of larger lettering under it — «Общие указания …»)
  if(r.y-last>h*3.5||r.t.some(u=>(Number(u.size)||0)>hs*1.2))break;last=r.y;
  const cells=cols.map(()=>[]);
  for(const u of r.t.sort((a,b)=>a.x-b.x)){let k=0;
   // by the drawn lines of the table between the columns when there are (a centred header starts right of its cells:
   // «1. Металлические сэндвич-панели …» under «Элементы кровли …»), else by where the header starts
   if(walls.length===cols.length-1){k=walls.filter(x=>x<=u.x+1).length}else for(let i=0;i<cols.length;i++)if(cols[i].x<=u.x+h*.8)k=i;
   cells[k].push(str(u))}
  const row=cells.map(c=>c.join(" "));
  if(!row.some(Boolean))continue;
  // A line that only goes on with the cells of the row above (a long name in two lines): joined to it.
  if(out.length&&!row[0]&&r.t.length<=2){const p=out[out.length-1];row.forEach((c,i)=>{if(c)p[i]=(p[i]?p[i]+" ":"")+c})}
  else out.push(row)
 }
 return{title:str(t0),columns:cols.map(str),rows:out,at:{x:Math.round(t0.x),y:Math.round(t0.y)}}
}

function roofPlan({texts=[],segments=[],bbox,toX,toY,target}){
 const inPlan=p=>p.x>=bbox.x0-40&&p.x<=bbox.x1+40&&p.y>=bbox.y0-40&&p.y<=bbox.y1+40;
 const mm=p=>({x_mm:toX(p.x),y_mm:toY(p.y)});
 const tables=[];
 for(const t of texts)if(/^(?:Таблица\s+отверстий|Экспликация\s+кровли|Ведомость\s+отверстий)/iu.test(str(t))){const tb=readTable(texts,t,segments);if(tb)tables.push(tb)}
 // The rows of the table of openings by number: size, section, level of the bottom, note («- // -» — as above).
 const holes=new Map();
 for(const tb of tables){if(!/отверстий/iu.test(tb.title))continue;
  const col=re=>tb.columns.findIndex(c=>re.test(c)),cN=col(/^№/u),cS=col(/Размер/iu),cR=col(/Раздел/iu),cL=col(/Отметка/iu),cP=col(/Примечан/iu);
  let note="";
  for(const r of tb.rows){const n=Number(r[cN>=0?cN:0]);if(!(n>0))continue;
   const sz=/(\d{2,5})\s*[хx×]\s*(\d{2,5})/u.exec(r[cS]||"");let p=cP>=0?r[cP]:"";if(/^[-\s/]+$/u.test(p))p=note;else note=p;
   holes.set(n,{n,size_mm:sz?[+sz[1],+sz[2]]:null,section:cR>=0?r[cR]:"",level:cL>=0?r[cL]:"",note:p})}
 }
 // Each segment end by its point: the corner of an opening the leader of its number ends at.
 const ends=new Map(),key=(x,y)=>Math.round(x)+","+Math.round(y);
 for(const s of segments)for(const [p,q] of [[s.a,s.b],[s.b,s.a]]){const k=key(p.x,p.y);if(!ends.has(k))ends.set(k,[]);ends.get(k).push({p,q})}
 const from=pt=>{const out=[];for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const e of ends.get((Math.round(pt.x)+i)+","+(Math.round(pt.y)+j))||[])if(Math.hypot(e.p.x-pt.x,e.p.y-pt.y)<=1.5)out.push(e);return out};
 // A number on a shelf whose leader leaves the shelf's end slanting (opening 1 at О8/Б of АР ч.1 л.5: the general search
 // of leaders took the shelf for none): the far end of the slanting stroke from an end of the shelf under the number.
 const shelfLeader=t=>{const h=Number(t.size)||10,x0=t.x-h*.6,x1=t.x+(Number(t.width)||h*.6)+h*.6,y=t.y;
  const shelf=segments.find(s=>Math.abs(s.a.y-s.b.y)<=.4&&Math.abs((s.a.y+s.b.y)/2-y)<=h*.45&&Math.min(s.a.x,s.b.x)<=x0+h&&Math.max(s.a.x,s.b.x)>=x1-h);
  if(!shelf)return null;const L=Math.min(shelf.a.x,shelf.b.x),R=Math.max(shelf.a.x,shelf.b.x),sy=shelf.a.y;
  let best=null;
  for(const s of segments){if(Math.abs(s.a.x-s.b.x)<1||Math.abs(s.a.y-s.b.y)<1||Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y)<8)continue;
   for(const [p,q] of [[s.a,s.b],[s.b,s.a]])if(Math.abs(p.y-sy)<=1&&(Math.abs(p.x-L)<=1||Math.abs(p.x-R)<=1)){const d=Math.hypot(q.x-p.x,q.y-p.y);if(!best||d>best.d)best={x:q.x,y:q.y,d,leader:true}}}
  return best};
 const openings=[];
 if(holes.size)for(const t of texts){
  const n=Number(str(t));if(!/^\d{1,2}$/u.test(str(t))||!holes.has(n)||!inPlan(t))continue;
  let tg=null;try{tg=target(t)}catch{}if(!tg||!tg.leader)tg=shelfLeader(t);if(!tg)continue;
  // The box: a side across and a side along from the corner, 1.5…60 pt each (opening 1, 200 × 200 at 1:200, is 2.8 pt).
  const at=from(tg),hz=at.filter(e=>Math.abs(e.q.y-e.p.y)<=.5&&Math.abs(e.q.x-e.p.x)>=1.5&&Math.abs(e.q.x-e.p.x)<=60),vt=at.filter(e=>Math.abs(e.q.x-e.p.x)<=.5&&Math.abs(e.q.y-e.p.y)>=1.5&&Math.abs(e.q.y-e.p.y)<=60);
  if(!hz.length||!vt.length)continue;
  const H=hz.sort((a,b)=>Math.abs(b.q.x-b.p.x)-Math.abs(a.q.x-a.p.x))[0],V=vt.sort((a,b)=>Math.abs(b.q.y-b.p.y)-Math.abs(a.q.y-a.p.y))[0];
  const x0=Math.min(tg.x,H.q.x),x1=Math.max(tg.x,H.q.x),y0=Math.min(tg.y,V.q.y),y1=Math.max(tg.y,V.q.y);
  const X0=toX(x0),X1=toX(x1),Y0=toY(y1),Y1=toY(y0),row=holes.get(n),drawn=[Math.abs(X1-X0),Math.abs(Y1-Y0)].sort((a,b)=>a-b);
  const o={n,...row,x0_mm:Math.min(X0,X1),x1_mm:Math.max(X0,X1),y0_mm:Math.min(Y0,Y1),y1_mm:Math.max(Y0,Y1),x_mm:Math.round((X0+X1)/2),y_mm:Math.round((Y0+Y1)/2),drawn_mm:[Math.abs(X1-X0),Math.abs(Y1-Y0)]};
  // (opening 3 of АР ч.1 л.5: «700 х 1900» in the table, 700 × 900 drawn — told, the table's size kept)
  if(row.size_mm){const s=[...row.size_mm].sort((a,b)=>a-b);if(s.some((v,i)=>Math.abs(v-drawn[i])>Math.max(60,v*.15)))o.mismatch="на плане "+drawn.join(" × ")+", в таблице "+row.size_mm.join(" × ")}
  if(!openings.some(q=>Math.abs(q.x_mm-o.x_mm)<50&&Math.abs(q.y_mm-o.y_mm)<50))openings.push(o)
 }
 // Slopes by their arrows: the value and the way of the text (the arrow under it points down the slope).
 const slopes=[];
 for(const t of texts){if(!inPlan(t))continue;const parts=str(t).split(/\s+(?=i\s*=)/u);for(const p of parts){const m=SLOPE.exec(p);if(m)slopes.push({pct:Number(m[1].replace(",",".")),angle:Math.round(Number(t.angle)||0),...mm(t)})}}
 // Elements by leaders: the first line of a note and its reference under it («см. лист КМ3-43»).
 const KINDS=[["ladder",/лестниц/iu],["guard",/огражден/iu],["funnel",/воронк/iu],["drain",/водост|желоб|водоприемн/iu],["node",/^(?:По\s+)?узл[уа]?\s+\d|^Узел\s+\d/iu]];
 const items=[];
 for(const t of texts){
  const s=str(t);if(!inPlan(t)||s.length<6)continue;
  const kind=KINDS.find(([,re])=>re.test(s));if(!kind)continue;
  const h=Number(t.size)||10,ref=texts.find(u=>u!==t&&u.y>t.y+1&&u.y-t.y<=h*1.8&&Math.abs((Number(u.angle)||0)-(Number(t.angle)||0))<2&&/^см\s?\./iu.test(str(u))&&Math.abs(u.x-t.x)<=h*12);
  // (the lines of a sentence of a note — «посредством желоба …», «в водоприемный желоб …» — are no element: a note
  // starts with a capital, an element's label too, but only a label has a leader to its place)
  let tg=null;try{tg=target(t)}catch{}
  if((!tg||!tg.leader)&&ref)try{tg=target(ref)}catch{}
  if(!tg||!tg.leader)continue;
  const it={kind:kind[0],text:s,...(ref?{ref:str(ref).replace(/\s+/gu," ")}:{}),...mm(tg)};
  const ty=/тип\s*(П)\s*\.?\s*(\d)/iu.exec(s);if(ty)it.type=ty[1]+ty[2];
  const nd=/узл[уа]?\s+(\d{1,3})|Узел\s+(\d{1,3})/iu.exec(s);if(kind[0]==="node"&&nd)it.node=nd[1]||nd[2];
  items.push(it)
 }
 // The lines of the roof guards: small squares (posts, 1,2…2,8 pt — 1,8 pt at 1:200 on АР ч.1 л.5) three and more in a
 // row at a steady step (the step of the posts, ~1000 mm), on one line across; each run from its first post to its last
 // — in mm of the grid, with the number of posts and the step. The engineer, 16.11.2026: «а ограждения?» — the callouts
 // «Ограждение кровли» point at two places only, the line itself shows where the guard runs.
 const guards=roofGuards(segments,inPlan).map(r=>({x0_mm:toX(r.a.x),y0_mm:toY(r.a.y),x1_mm:toX(r.b.x),y1_mm:toY(r.b.y),posts:r.n,
  step_mm:Math.round(Math.hypot(toX(r.b.x)-toX(r.a.x),toY(r.b.y)-toY(r.a.y))/Math.max(1,r.n-1))}));
 // Levels on the plan: the roof's level at its point.
 const levels=texts.filter(t=>inPlan(t)&&LEVEL.test(str(t))).map(t=>({z_mm:level(str(t)),...mm(t)})).filter(l=>l.z_mm!==null);
 return{tables,openings,slopes,items,levels,...(guards.length?{guards}:{})}
}

// The posts of the guards: squares of 1,2…2,8 pt — two sides across of one length at that distance (a side may be drawn in
// two pieces: by its pair across), and their runs — on one line (±0,6 pt), three and more, the step within 0,6…1,6 of
// the run's middle step, a gap over 1,6 steps ends the run.
function roofGuards(segments,inside=()=>true){
 const len=s=>Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y),sq=[];
 for(const hz of [true,false]){const B=s=>hz?s.a.y:s.a.x,L=s=>hz?[Math.min(s.a.x,s.b.x),Math.max(s.a.x,s.b.x)]:[Math.min(s.a.y,s.b.y),Math.max(s.a.y,s.b.y)];
  const P=segments.filter(s=>(hz?Math.abs(s.a.y-s.b.y):Math.abs(s.a.x-s.b.x))<.2&&len(s)>=1.2&&len(s)<=2.8);
  const by=new Map();for(const s of P){const k=Math.round(B(s));if(!by.has(k))by.set(k,[]);by.get(k).push(s)}
  for(const s of P){const [l0,l1]=L(s),w=l1-l0,b=B(s);let o=null;
   for(const d of [-1,0,1]){o=(by.get(Math.round(b+w)+d)||[]).find(t=>t!==s&&Math.abs(L(t)[0]-l0)<.3&&Math.abs(L(t)[1]-l1)<.3&&Math.abs(B(t)-b-w)<.4);if(o)break}
   if(!o)continue;const c=hz?{x:(l0+l1)/2,y:b+w/2}:{x:b+w/2,y:(l0+l1)/2};
   if(inside(c)&&!sq.some(q=>Math.hypot(q.x-c.x,q.y-c.y)<.6))sq.push(c)}}
 const runs=[];
 for(const hz of [true,false]){const K=q=>hz?q.y:q.x,A=q=>hz?q.x:q.y,lines=[];
  for(const q of sq){const l=lines.find(l=>Math.abs(l.k-K(q))<=.6);if(l)l.q.push(q);else lines.push({k:K(q),q:[q]})}
  for(const l of lines){if(l.q.length<3)continue;l.q.sort((a,b)=>A(a)-A(b));
   const st=l.q.slice(1).map((q,i)=>A(q)-A(l.q[i])).sort((a,b)=>a-b),mid=st[Math.floor(st.length/2)];if(!(mid>=4))continue;
   let cur=[l.q[0]];const flush=()=>{if(cur.length>=3)runs.push({a:cur[0],b:cur[cur.length-1],n:cur.length});cur=[]};
   for(let i=1;i<l.q.length;i++){const d=A(l.q[i])-A(l.q[i-1]);if(d>mid*1.6)flush();else if(d<mid*.6)continue;cur.push(l.q[i])}flush()}}
 return runs
}

module.exports={roofPlan,readTable,roofGuards};
