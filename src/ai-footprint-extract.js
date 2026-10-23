"use strict";
/*
 * Footprints of the structures on a location plan («Схема расположения площадок, лестниц, крылец»): each structure is
 * a hatched outline on the building grid with its label («Лм 1», «Кр 4», «Площадка обслуживания крана на отм. +9,500»)
 * and a leader to it. The hatch is cross lines at 45° clipped to the outline, so the outline is where the hatch lies:
 * the hatch round the leader's end is collected, rasterised and cut into rectangles (an L or a U shape gives two or
 * three). The level is the one in the label («на отм. +9,500») or the level mark inside the outline.
 */
const LEVEL=/отм\s*\.?\s*([+−-]?\d{1,2}[,.]\d{3})/iu;
const MARK=/^(Лм|Л|Кр|Пл|П|Ст|Ог|Пд|В|Пн)\s*-?\s*(\d{1,2})$/u;
const NAME=/^(Площадка|Лестница|Пожарная лестница|Крыльцо|Пандус|Каркас)/u;
const flat=t=>Math.abs(Number(t.angle)||0)<2;
const s=t=>String(t.str).replace(/\s+/g," ").trim();
const num=v=>Number(String(v).replace("−","-").replace(",","."));

function hatchOf(segments,at,reach=14){
 const diag=q=>{const dx=q.b.x-q.a.x,dy=q.b.y-q.a.y,l=Math.hypot(dx,dy);if(l<2||l>400)return false;const a=Math.abs(Math.atan2(dy,dx)*180/Math.PI)%90;return Math.abs(a-45)<4};
 const near=(q,p,d)=>{const vx=q.b.x-q.a.x,vy=q.b.y-q.a.y,l2=vx*vx+vy*vy||1,t=Math.max(0,Math.min(1,((p.x-q.a.x)*vx+(p.y-q.a.y)*vy)/l2));return Math.hypot(q.a.x+vx*t-p.x,q.a.y+vy*t-p.y)<=d};
 const pool=segments.filter(diag);
 const seed=pool.filter(q=>near(q,at,reach));if(!seed.length)return[];
 // Neighbouring hatch lines touch at their ends on the outline or cross each other: grown by ends within 4 pt.
 const cell=8,grid=new Map(),key=(x,y)=>Math.floor(x/cell)+":"+Math.floor(y/cell);
 pool.forEach((q,i)=>{for(const p of [q.a,q.b,{x:(q.a.x+q.b.x)/2,y:(q.a.y+q.b.y)/2}]){const k=key(p.x,p.y);(grid.get(k)||grid.set(k,[]).get(k)).push(i)}});
 const seen=new Set(seed.map(q=>pool.indexOf(q))),queue=[...seen];
 while(queue.length&&seen.size<20000){
  const q=pool[queue.pop()];
  for(const p of [q.a,q.b,{x:(q.a.x+q.b.x)/2,y:(q.a.y+q.b.y)/2}]){
   const gx=Math.floor(p.x/cell),gy=Math.floor(p.y/cell);
   for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const j of grid.get((gx+dx)+":"+(gy+dy))||[]){
    if(seen.has(j))continue;const r=pool[j];
    if([r.a,r.b].some(e=>Math.hypot(e.x-p.x,e.y-p.y)<4)||[q.a,q.b].some(e=>near(r,e,1.5))){seen.add(j);queue.push(j)}
   }
  }
 }
 return[...seen].map(i=>pool[i])
}
// Covered cells of a 2 pt raster, cut into rectangles: rows of runs merged while they keep the same span.
function rectanglesOf(lines,step=2){
 const cells=new Set();let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const q of lines){const l=Math.hypot(q.b.x-q.a.x,q.b.y-q.a.y),n=Math.max(1,Math.ceil(l/(step/2)));
  for(let i=0;i<=n;i++){const x=q.a.x+(q.b.x-q.a.x)*i/n,y=q.a.y+(q.b.y-q.a.y)*i/n,cx=Math.floor(x/step),cy=Math.floor(y/step);cells.add(cx+":"+cy);x0=Math.min(x0,cx);x1=Math.max(x1,cx);y0=Math.min(y0,cy);y1=Math.max(y1,cy)}}
 if(!cells.size)return[];
 // Hatch lines are a few points apart: the gaps between them are filled along rows and columns.
 const has=(x,y)=>cells.has(x+":"+y),gap=4,fill=new Set(cells);
 for(let y=y0;y<=y1;y++){let last=null;for(let x=x0;x<=x1;x++)if(has(x,y)){if(last!==null&&x-last<=gap)for(let k=last+1;k<x;k++)fill.add(k+":"+y);last=x}}
 for(let x=x0;x<=x1;x++){let last=null;for(let y=y0;y<=y1;y++)if(fill.has(x+":"+y)){if(last!==null&&y-last<=gap)for(let k=last+1;k<y;k++)fill.add(x+":"+k);last=y}}
 const rects=[];let open=[];
 for(let y=y0;y<=y1+1;y++){
  const runs=[];if(y<=y1){let start=null;for(let x=x0;x<=x1+1;x++){const on=x<=x1&&fill.has(x+":"+y);if(on&&start===null)start=x;if(!on&&start!==null){runs.push([start,x-1]);start=null}}}
  const next=[];
  for(const r of runs){const o=open.find(o=>Math.abs(o.a-r[0])<=1&&Math.abs(o.b-r[1])<=1);if(o){o.y1=y;next.push(o)}else next.push({a:r[0],b:r[1],y0:y,y1:y})}
  for(const o of open)if(!next.includes(o))rects.push(o);
  open=next
 }
 return rects.filter(r=>r.b-r.a>=2&&r.y1-r.y0>=2).map(r=>({x0:r.a*step,x1:(r.b+1)*step,y0:r.y0*step,y1:(r.y1+1)*step}))
}
// An outline drawn without hatch (a porch «Кр 4»: a small box at the wall): the smallest closed box of straight lines
// that the leader ends in or touches (within 6 pt). The sides may run on (the wall line is one side).
function outlineOf(segments,at,reach=160,sizeOk=null){
 const close=q=>Math.min(q.a.x,q.b.x)<at.x+reach&&Math.max(q.a.x,q.b.x)>at.x-reach&&Math.min(q.a.y,q.b.y)<at.y+reach&&Math.max(q.a.y,q.b.y)>at.y-reach;
 const H=[],V=[];
 for(const q of segments){
  if(Math.hypot(q.b.x-q.a.x,q.b.y-q.a.y)<4||!close(q))continue;
  if(Math.abs(q.a.y-q.b.y)<0.3)H.push({y:(q.a.y+q.b.y)/2,x0:Math.min(q.a.x,q.b.x),x1:Math.max(q.a.x,q.b.x)});
  else if(Math.abs(q.a.x-q.b.x)<0.3)V.push({x:(q.a.x+q.b.x)/2,y0:Math.min(q.a.y,q.b.y),y1:Math.max(q.a.y,q.b.y)})
 }
 // A side may stop a few points short of the corner (a wall line drawn to the next line of the plan).
 const t=1.2,e=4.5,covers=(list,c,a,b,key0,key1,at0)=>list.some(l=>Math.abs(l[at0]-c)<t&&l[key0]<=a+e&&l[key1]>=b-e);
 const ys=[...new Set(H.map(h=>Math.round(h.y*2)/2))].sort((a,b)=>a-b),xs=[...new Set(V.map(v=>Math.round(v.x*2)/2))].sort((a,b)=>a-b);
 const dist=(b)=>Math.hypot(Math.max(b.x0-at.x,0,at.x-b.x1),Math.max(b.y0-at.y,0,at.y-b.y1));
 let best=null;
 for(let i=0;i<ys.length;i++)for(let j=i+1;j<ys.length;j++){
  const y0=ys[i],y1=ys[j];if(y1-y0<5)continue;if(y1-y0>2*reach)break;
  for(let k=0;k<xs.length;k++)for(let l=k+1;l<xs.length;l++){
   const x0=xs[k],x1=xs[l];if(x1-x0<5)continue;if(x1-x0>2*reach)break;
   const box={x0,x1,y0,y1},area=(x1-x0)*(y1-y0);
   if(best&&area>=best.area||dist(box)>6||sizeOk&&!sizeOk(box))continue;
   if(covers(H,y0,x0,x1,"x0","x1","y")&&covers(H,y1,x0,x1,"x0","x1","y")&&covers(V,x0,y0,y1,"y0","y1","x")&&covers(V,x1,y0,y1,"y0","y1","x"))best={...box,area}
  }
 }
 return best?[{x0:best.x0,x1:best.x1,y0:best.y0,y1:best.y1}]:[]
}

// labels: the texts of the plan; target(text) — the end of its leader (from the plan reader); toX/toY — sheet to mm.
function extractFootprints({texts,segments,target,toX,toY,bbox}){
 const inside=t=>t.x>bbox.x0-200&&t.x<bbox.x1+200&&t.y>bbox.y0-200&&t.y<bbox.y1+200;
 const labels=texts.filter(t=>flat(t)&&inside(t)&&(MARK.test(s(t))||NAME.test(s(t))));
 const out=[],used=new Set();
 for(const t of labels){
  const m=MARK.exec(s(t)),name=m?m[1]+m[2]:s(t);
  // The second line of a two-line label: «крана на отм. +9,500».
  const next=texts.find(u=>u!==t&&flat(u)&&/[а-яё]/iu.test(s(u))&&!MARK.test(s(u))&&u.y>t.y&&u.y-t.y<t.size*2.2&&Math.abs(u.x-t.x)<t.size*8);
  const level=LEVEL.exec(s(t)+" "+(next?s(next):""));
  const at=target(t);
  if(!at?.leader||at.x<bbox.x0-5||at.x>bbox.x1+5||at.y<bbox.y0-5||at.y>bbox.y1+5)continue;
  const hatch=hatchOf(segments,at);
  // A box without hatch only for a porch or a small platform with a slanted leader: a frame («Каркас») or a stair
  // drawn by its members has boxes inside, and the smallest one is not the structure.
  const boxed=at.diagonal&&(m?/^(?:Кр|Пл|П|Пд)$/u.test(m[1]):/^(?:Площадка|Крыльцо|Пандус)/u.test(s(t)));
  // A stair («Лм 1») is filled with its own pattern: its box is the one dimensioned on the plan («2430», «4000»).
  const stair=m&&/^(?:Лм|Л)$/u.test(m[1]);
  const written=new Set(texts.filter(u=>/^\d{3,5}$/.test(s(u))&&Math.abs(u.x-at.x)<300&&Math.abs(u.y-at.y)<300).map(u=>Number(s(u))));
  const sized=box=>{const w=Math.abs(toX(box.x1)-toX(box.x0)),h=Math.abs(toY(box.y1)-toY(box.y0));
   return[...written].some(v=>Math.abs(v-w)<=Math.max(60,v*0.03))&&[...written].some(v=>Math.abs(v-h)<=Math.max(60,v*0.03))};
  const rects=stair?outlineOf(segments,at,160,sized):hatch.length>=4?rectanglesOf(hatch):boxed?outlineOf(segments,at):[];if(!rects.length)continue;
  const sig=rects.map(r=>Math.round(r.x0)+","+Math.round(r.y0)).join("|");if(used.has(sig))continue;used.add(sig);
  const mm=rects.map(r=>{const a=toX(r.x0),b=toX(r.x1),c=toY(r.y0),d=toY(r.y1);return{x0_mm:Math.min(a,b),x1_mm:Math.max(a,b),y0_mm:Math.min(c,d),y1_mm:Math.max(c,d)}})
   .filter(r=>r.x1_mm-r.x0_mm>=300&&r.y1_mm-r.y0_mm>=300);
  if(!mm.length)continue;
  // A level mark inside the outline when the label has none («+9.500» in a box).
  const box={x0:Math.min(...rects.map(r=>r.x0)),x1:Math.max(...rects.map(r=>r.x1)),y0:Math.min(...rects.map(r=>r.y0)),y1:Math.max(...rects.map(r=>r.y1))};
  const mark=level?null:texts.find(u=>/^[+−-]?\d{1,2}[,.]\d{3}$/.test(s(u))&&u.x>=box.x0&&u.x<=box.x1&&u.y>=box.y0&&u.y<=box.y1);
  const z=level?num(level[1])*1000:mark?num(s(mark))*1000:null;
  out.push({mark:m?name:"",name:m?"":(s(t)+(next&&!NAME.test(s(next))?" "+s(next):"")).replace(/\s+([.,])/g,"$1").replace(/\s*-\s*(?=[а-яё])/giu,"-").replace(/\s+/g," "),level_mm:Number.isFinite(z)?Math.round(z):null,rects:mm})
 }
 return out
}
// The footprints as members of the plan: each rectangle a deck at its level, laid along its longer side (the
// width is the shorter side). Without a level on the plan the deck lies at ±0.000 and asks to be checked.
const KIND={Кр:"Крыльцо",Пл:"Площадка",П:"Площадка",Пд:"Площадка",Лм:"Лестница",Л:"Лестница",Ст:"Стремянка",Ог:"Ограждение",В:"Пандус",Пн:"Пандус"};
function footprintPlacements(list,page){
 const out=[];
 for(const f of list){
  const prefix=/^\D+/u.exec(f.mark||"")?.[0]||"";
  const name=f.name||KIND[prefix]||"Площадка",z=f.level_mm;
  const mark=f.mark||name.split(" ")[0]+(Number.isFinite(z)?" "+(z>=0?"+":"−")+(Math.abs(z)/1000).toFixed(3).replace(".",","):"");
  for(const r of f.rects){
   const along=r.x1_mm-r.x0_mm>=r.y1_mm-r.y0_mm,w=along?r.y1_mm-r.y0_mm:r.x1_mm-r.x0_mm;
   const [x,y,x2,y2]=along?[r.x0_mm,(r.y0_mm+r.y1_mm)/2,r.x1_mm,(r.y0_mm+r.y1_mm)/2]:[(r.x0_mm+r.x1_mm)/2,r.y0_mm,(r.x0_mm+r.x1_mm)/2,r.y1_mm];
   const level=Number.isFinite(z)?z:0;
   out.push({mark,name,geometry_type:"beam",kind_label:"Площадка",page,fitting_type:"deck",diameter_mm:Math.round(w),scheme_group:"platforms",
    x_mm:Math.round(x),y_mm:Math.round(y),x2_mm:Math.round(x2),y2_mm:Math.round(y2),z0_mm:level,z1_mm:level,levels_from:"схема расположения",
    confidence:Number.isFinite(z)?"medium":"low",
    notes:["Контур по схеме расположения"+(f.rects.length>1?" (часть "+(f.rects.indexOf(r)+1)+" из "+f.rects.length+")":""),...(Number.isFinite(z)?[]:["Отметка не найдена на схеме — поставлено на ±0,000, проверьте"])]})
  }
 }
 return out
}
module.exports={footprintPlacements,extractFootprints,hatchOf,rectanglesOf,outlineOf};
