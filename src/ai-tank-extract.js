"use strict";
/*
 * IR Project AI: vertical steel tanks (РВС, РВСП, РГС drawn standing). A tank set has no grid of axes: its plan is
 * a circle with radial roof members, its facade gives the height of the wall. From one sheet this reads what the
 * sheet shows; the montage plan joins plan and facade into one tank:
 *  - plan:   centre and radius of the wall circle (perpendicular bisectors of the arc chords vote for the centre),
 *            roof members (lines through the centre), marked items on the roof or the wall at their angle;
 *  - facade: wall height (the largest vertical dimension), roof rise (the dimension above it), marked items at
 *            their height.
 * The diameter in millimetres comes from a dimension with the diameter sign ("Ø8250", "⌀ 8250", "Ç 8250" in CAD
 * fonts that map Ø to Ç).
 */
const {textBox,buildLineIndex}=require("./ai-scheme-extract");
// \b does not see Cyrillic letters as letters: "РВС-700" is matched with explicit look-arounds.
const TANK=/резервуар|(?<![а-яё])(?:РВСП?|РГС)(?![а-яё])|ёмкост|емкост/iu;
const DIAMETER_SIGN=/^(?:Ø|⌀|Ç|ø|Ф)\s*$/u;
const MARK=/^([А-ЯЁA-Z]{1,3}|[А-ЯЁA-Z][а-яё]{1,2})\s?(\d{1,3}[а-я]?)$/u;
const num=s=>{const m=/^(\d{3,6})(?:\*{1,2})?$/.exec(String(s).trim());return m?Number(m[1]):null};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// Diameters written on the sheet: a value right after a diameter sign, or "Ø8250" in one text.
function diameters(texts){
 const out=[];
 for(const t of texts){
  const one=/^(?:Ø|⌀|Ç|ø)\s*(\d{3,6})\**$/u.exec(t.str.trim());
  if(one){out.push(Number(one[1]));continue}
  // "Dн=10430", "Дн = 10430"; OCR reads the Ø of "Øн" as 0 or О.
  const named=/^(?:D|Д|Ø|0|О)[нвn]?\s*=\s*(\d{3,6})\**$/u.exec(t.str.trim().replace(/\s+/g," "));
  if(named){out.push(Number(named[1]));continue}
  // "Двн 15180" (OCR: "Дбн"), and the Ø that OCR reads as "#" ("#8530").
  const dvn=/^(?:D|Д)[вб]н\s*=?\s*(\d{4,6})$/u.exec(t.str.trim())||(t.ocr?/^#\s*(\d{4,6})$/u.exec(t.str.trim()):null);
  if(dvn){out.push(Number(dvn[1]));continue}
  // The inner diameter on a wall development: "Вн Ø10480", "Вн. Ø 18980".
  const inner=/^Вн\.?\s*(?:Ø|⌀|Ф|ø|0)?\s*(\d{4,6})\**$/u.exec(t.str.trim());
  if(inner){out.push(Number(inner[1]));continue}
  if(!DIAMETER_SIGN.test(t.str.trim()))continue;
  const next=texts.find(o=>o!==t&&Math.abs(o.y-t.y)<3&&o.x>t.x&&o.x-t.x<t.size*1.6&&num(o.str));
  if(next)out.push(num(next.str))
 }
 return out
}
// The centre most arc chords agree on and the radius of the largest well-drawn circle around it.
function circleOf(segments,box,minChord=2,maxChord=40){
 // A circle drawn as a polygon (an 18-gon on a layout sheet) has longer chords.
 return circleBy(segments,box,minChord,maxChord)||(maxChord<90?circleBy(segments,box,minChord,90):null)
}
function circleBy(segments,{x0,y0,x1,y1},minChord,maxChord){
 const cell=4,votes=new Map();
 const chords=segments.filter(s=>{const l=dist(s.a,s.b);return l>=minChord&&l<=maxChord&&Math.min(s.a.x,s.b.x)>=x0&&Math.max(s.a.x,s.b.x)<=x1&&Math.min(s.a.y,s.b.y)>=y0&&Math.max(s.a.y,s.b.y)<=y1});
 if(chords.length<60)return null;
 for(const s of chords){
  const m={x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2},l=dist(s.a,s.b),n={x:-(s.b.y-s.a.y)/l,y:(s.b.x-s.a.x)/l};
  // Along the bisector in both directions, one vote per cell.
  const seen=new Set();
  for(let t=-900;t<=900;t+=cell){
   const x=m.x+n.x*t,y=m.y+n.y*t;if(x<x0||x>x1||y<y0||y>y1)continue;
   const k=Math.round(x/cell)+":"+Math.round(y/cell);if(seen.has(k))continue;seen.add(k);
   votes.set(k,(votes.get(k)||0)+1)
  }
 }
 let best=null;for(const [k,v] of votes)if(!best||v>best.v)best={k,v};
 if(!best||best.v<40)return null;
 const [cx,cy]=best.k.split(":").map(Number),c={x:cx*cell,y:cy*cell};
 // Radii of chords that face the centre (the chord is perpendicular to the radius).
 const radii=new Map();
 for(const s of chords){
  const m={x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2},r=dist(m,c);if(r<20)continue;
  const v={x:(s.b.x-s.a.x)/dist(s.a,s.b),y:(s.b.y-s.a.y)/dist(s.a,s.b)},u={x:(m.x-c.x)/r,y:(m.y-c.y)/r};
  if(Math.abs(v.x*u.x+v.y*u.y)>0.15)continue;
  const k=Math.round(r/2);radii.set(k,(radii.get(k)||0)+dist(s.a,s.b))
 }
 // A full circle has its length ≈ 2πr in chords; the outermost one drawn nearly whole is the wall.
 let wall=null;
 for(const [k,len] of radii){const r=k*2,whole=(len+(radii.get(k-1)||0)+(radii.get(k+1)||0))/(2*Math.PI*r);if(whole>0.6&&(!wall||r>wall.r))wall={r,whole}}
 return wall?{c,r:wall.r}:null
}
// Several tanks on one layout sheet ("Схема расположения резервуаров"): circles of one size found one after another,
// the lines of each found one taken away. Their centres (pt, y down) and the bearing of what stands outside each.
function tankCircles(segments,area,texts=[]){
 let rest=segments;const out=[];
 for(let k=0;k<8;k++){
  const c=circleOf(rest,area);if(!c)break;
  if(out.length&&Math.abs(c.r-out[0].r)>out[0].r*0.08)break;
  out.push(c);rest=rest.filter(s=>dist({x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2},c.c)>c.r*1.3)
 }
 if(out.length<2)return null;
 // The scale: the dimension between two neighbouring centres ("13200 | 23600 | 13200").
 out.sort((a,b)=>a.c.x-b.c.x||a.c.y-b.c.y);
 let mmPerPt=null,spanDims=null;
 for(let i=0;i+1<out.length&&!mmPerPt;i++){
  const a=out[i].c,b=out[i+1].c,span=dist(a,b),horizontal=Math.abs(a.y-b.y)<Math.abs(a.x-b.x);
  const t=texts.filter(t=>num(t.str)&&(horizontal?Math.abs(t.angle||0)<5&&t.x>a.x&&t.x<b.x:Math.abs(Math.abs(t.angle||0)-90)<5&&t.y>Math.min(a.y,b.y)&&t.y<Math.max(a.y,b.y)))
   .map(t=>({t,k:num(t.str)/span})).filter(x=>x.k>5&&x.k<500);
  // The total of the chain also stands between the centres: the plan picks the smallest one wider than the tank.
  if(t.length){spanDims={pt:Math.round(span*10)/10,mm:[...new Set(t.map(x=>num(x.t.str)))].sort((p,q)=>p-q)};mmPerPt=t[0].k}
 }
 // What stands outside each tank and away from the others (a shaft stair): the densest 30° window of lines.
 return out.map(({c,r})=>{
  const sec=new Array(36).fill(0);
  for(const sg of segments){const m={x:(sg.a.x+sg.b.x)/2,y:(sg.a.y+sg.b.y)/2},d=dist(m,c);if(d<r*1.15||d>r*1.7)continue;
   if(out.some(o=>o.c!==c&&dist(m,o.c)<o.r*1.7))continue;
   const b=((90-Math.atan2(-(m.y-c.y),m.x-c.x)*180/Math.PI)%360+360)%360;sec[Math.floor(b/10)%36]+=dist(sg.a,sg.b)}
  const win=sec.map((_,i)=>sec[(i+35)%36]+sec[i]+sec[(i+1)%36]),top=win.indexOf(Math.max(...win));
  return{x:c.x,y:c.y,r,...(win[top]>r?{outside:top*10+5}:{}),...(spanDims?{spanDims}:{})}
 })
}
// The point a label's leader ends at: the end of the line leaving its shelf, else the label itself.
function leaderEnd(t,segments){
 const b=textBox(t),below=Math.max(6,(t.size||10)*0.35);
 const shelf=p=>p.x>=b.x0-10&&p.x<=b.x1+10&&p.y>=b.y1-3&&p.y<=b.y1+below;
 const near=segments.filter(s=>shelf(s.a)||shelf(s.b));
 let best=null;
 for(const s of near)for(const [p,q] of [[s.a,s.b],[s.b,s.a]]){
  if(!shelf(p))continue;
  if(Math.abs(p.y-q.y)<1.5&&Math.abs(q.x-p.x)<(b.x1-b.x0)+20)continue;// the shelf itself
  const l=dist(p,q);if(!best||l>best.l)best={l,q}
 }
 return best?best.q:{x:(b.x0+b.x1)/2,y:b.y1}
}
function marksOf(texts,widthPt,heightPt){
 // Not the stamp, not the notes block at the right.
 return texts.filter(t=>Math.abs(t.angle||0)<5&&MARK.test(t.str.trim())&&!(t.x>widthPt-700&&t.y>heightPt-200))
  .map(t=>{const m=MARK.exec(t.str.trim());return{t,mark:m[1]+m[2]}})
}
// The end of a callout's leader: the shelf under the position number, then the line leaving one of its ends.
function calloutEnd(t,segments){
 const b=textBox(t),h=Math.max(4,b.y1-b.y0);
 const shelves=segments.filter(s=>Math.abs(s.a.y-s.b.y)<0.8&&Math.abs(s.a.x-s.b.x)>b.x1-b.x0&&
  Math.min(s.a.x,s.b.x)<=b.x0+2&&Math.max(s.a.x,s.b.x)>=b.x1-2&&s.a.y>=b.y1-h*0.3&&s.a.y<=b.y1+h*1.2);
 let best=null;
 for(const s of shelves)for(const p of [s.a,s.b])for(const o of segments){
  if(o===s||Math.abs(o.a.y-o.b.y)<0.8)continue;
  for(const [u,v] of [[o.a,o.b],[o.b,o.a]]){
   if(dist(u,p)>1.5)continue;
   // Leaders may be drawn as several pieces: follow straight continuations.
   let end=v;
   for(let k=0;k<6;k++){
    const dir=Math.atan2(end.y-u.y,end.x-u.x);
    const next=segments.find(n=>n!==o&&(dist(n.a,end)<1.2||dist(n.b,end)<1.2)&&(w=>dist(w,u)>dist(end,u)+0.5&&Math.abs(((Math.atan2(w.y-end.y,w.x-end.x)-dir+3*Math.PI)%(2*Math.PI))-Math.PI)<0.05)(dist(n.a,end)<1.2?n.b:n.a));
    if(!next)break;
    end=dist(next.a,end)<1.2?next.b:next.a
   }
   const l=dist(u,end);if(!best||l>best.l)best={l,q:end}
  }
 }
 return best?best.q:null
}
// Callouts of a tank plan: a position number over a shelf and the description under it,
// "Патрубок монтажный для клапана аварийного Ду 500(334°)" — the angle is read from the text, the leader tells
// whether the item is on the wall or on the roof (and gives the angle when the text lost it).
const DESCRIPTION=/[а-яё]{2}|Ду|\(\s*\d|\d{3}\s*[хx]\s*\d{3}/iu;
const ANGLE=/\(\s*\d{1,3}(?:[.,]\d)?\s*[°'"”º*]?\s*\)|\d\(\s*\d{1,3}/u,ANGLE_ALL=/\(\s*(\d{1,3})(?:[.,]\d)?\s*[°'"”º*]?\s*\)?/gu;
// Usual OCR slips of the drafting font in callout names.
const tidy=s=>String(s).replace(/\s+/g," ").replace(/(?<![а-яё])Потрубок/gu,"Патрубок").replace(/(?<![а-яё])дл[ЯR](?![а-яё])/gu,"для").replace(/(?<![а-яё])(Люк|Лю)\s*-\s*лаз/giu,"Люк-лаз")
 .replace(/приемно\s*-\s*/giu,"приемно-").replace(/^Лю\s+(?=\d)/u,"Люк-лаз ").trim();
function callouts(texts,segments,circle,widthPt,heightPt){
 if(!circle)return[];
 const {c,r}=circle;
 const nums=texts.filter(t=>Math.abs(t.angle||0)<5&&/^\d{1,2}$/.test(t.str.trim())&&Number(t.str)>0&&(b=>dist({x:b.cx,y:b.cy},c))(textBox(t))<r*2.7&&
  !(t.x>widthPt-700&&t.y>heightPt-260)).map(t=>({t,pos:Number(t.str),box:textBox(t),lines:[]}));
 // Each description line belongs to the nearest number above it.
 for(const t of texts){
  if(Math.abs(t.angle||0)>=5||nums.some(n=>n.t===t)||!DESCRIPTION.test(t.str)||/лестниц/iu.test(t.str))continue;
  const b=textBox(t);let owner=null;
  for(const n of nums){
   const dy=b.y1-n.box.y1;if(dy<2||dy>46)continue;
   if(b.x1<n.box.x0-230||b.x0>n.box.x1+230)continue;
   const score=dy+Math.abs((b.x0+b.x1)/2-(n.box.x0+n.box.x1)/2)*0.15;
   if(!owner||score<owner.score)owner={n,score}
  }
  if(owner)owner.n.lines.push(t)
 }
 // Description lines whose number OCR lost: a line with an angle and the lines just over it are a callout too.
 const owned=new Set(nums.flatMap(n=>n.lines));
 const loose=texts.filter(t=>Math.abs(t.angle||0)<5&&!owned.has(t)&&!nums.some(n=>n.t===t)&&DESCRIPTION.test(t.str)&&!/лестниц/iu.test(t.str)&&(b=>dist({x:b.cx,y:b.cy},c))(textBox(t))<r*2.7&&!(t.x>widthPt-700&&t.y>heightPt-260));
 for(const t of loose){
  if(!ANGLE.test(t.str)||owned.has(t))continue;
  const group=[t];owned.add(t);
  for(let grown=true;grown;){grown=false;
   const top=group.reduce((p,q)=>q.y<p.y?q:p),tb=textBox(top);
   const up=loose.filter(o=>!owned.has(o)&&!ANGLE.test(o.str)).map(o=>({o,b:textBox(o)})).filter(({b})=>tb.y1-b.y1>=4&&tb.y1-b.y1<=16&&b.x1>tb.x0-120&&b.x0<tb.x1+120);
   const row=up.length?Math.max(...up.map(u=>u.b.y1)):null;
   for(const u of up)if(u.b.y1>=row-3){group.push(u.o);owned.add(u.o);grown=true}
  }
  // Same-row neighbours of the angle line ("Потрубок" "сигнализатора" "Ду 100(80°)").
  for(const o of loose)if(!owned.has(o)&&group.some(g=>Math.abs(g.y-o.y)<3&&Math.abs(g.x-o.x)<160)){group.push(o);owned.add(o)}
  nums.push({t:group.reduce((p,q)=>q.y<p.y?q:p),pos:null,box:null,lines:group,shelfUnder:group.reduce((p,q)=>q.y>p.y?q:p)})
 }
 const out=[];
 for(const n of nums){
  if(!n.lines.length)continue;
  // Reading order: rows top to bottom, left to right within a row.
  const sorted=n.lines.slice().sort((a,b)=>Math.abs(a.y-b.y)<5?a.x-b.x:a.y-b.y);
  const text=tidy(sorted.map(l=>l.str.trim()).join(" "));
  if(!/[а-яё]{4}|[а-яё]{2}\s*\d{3,4}\s*[хx]/iu.test(text))continue;
  const du=/Ду\s*(\d{2,4})/u.exec(text),size=/(\d{3,4})\s*[хxXХ]\s*(\d{3,4})/u.exec(text);
  const angles=[...text.matchAll(ANGLE_ALL)].map(m=>Number(m[1])).filter(v=>v<360);
  const end=n.pos!==null?calloutEnd(n.t,segments):n.shelfUnder?calloutEnd(n.shelfUnder,segments):null;
  const geo=end?{bearing:Math.round((90-Math.atan2(-(end.y-c.y),end.x-c.x)*180/Math.PI+720)%360*10)/10,r:Math.round(dist(end,c)/r*1000)/1000}:null;
  const gap0=(a,b)=>Math.abs(((a-b+540)%360)-180),said=[...text.matchAll(ANGLE_ALL)].map(m=>Number(m[1])).filter(v=>v<360);
  // A leader found for a callout without its number is kept only if it points where the text says.
  const leader=n.pos===null&&geo&&said.length&&!said.some(v=>gap0(v,geo.bearing)<=8)?null:geo;
  const gap=(a,b)=>Math.abs(((a-b+540)%360)-180);
  // The angle written in the text wins; the leader decides between several readings and overrules a reading
  // that points elsewhere (a neighbour's line taken into the callout).
  let bearing=angles.length?angles[angles.length-1]:null,check="";
  if(angles.length>1&&geo)bearing=angles.slice().sort((a,b)=>gap(a,geo.bearing)-gap(b,geo.bearing))[0];
  if(bearing!==null&&geo&&n.pos!==null&&gap(bearing,geo.bearing)>8){check="угол по тексту "+bearing+"°, по выноске "+Math.round(geo.bearing)+"°";bearing=Math.round(geo.bearing)}
  if(bearing===null&&geo)bearing=Math.round(geo.bearing);
  if(bearing===null)continue;
  const name=text.replace(/\s*\(\s*\d{1,3}(?:[.,]\d)?\s*[°'"”º*]?\s*\)?/gu," ").replace(/\s+Ду\s*$/u,"").replace(/\s+/g," ").replace(/^[\s\-–—_]+/,"").trim();
  out.push({pos:n.pos,name,du:du?Number(du[1]):size?Number(size[1]):null,size:size?size[1]+"x"+size[2]:null,bearing,leader,fromText:angles.length>0,check})
 }
 // One position once: the reading with the most text.
 const best=new Map();
 for(const o of out){const k=o.pos??"@"+o.bearing+"/"+o.du;if(!best.has(k)||best.get(k).name.length<o.name.length)best.set(k,o)}
 return[...best.values()].sort((a,b)=>(a.pos??99)-(b.pos??99)||a.bearing-b.bearing)
}
// "Шахтная лестница (90°)", "Лестница (270°)": the stair by its bearing on the plan. Its kind (ГОСТ 31385): a shaft
// stair on its own frame, a ring (spiral) stair along the wall, resting on it, or a straight single flight.
const STAIR_KIND=s=>/кольцев|винтов|витов|спирал/iu.test(s)?"ring":/шахтн/iu.test(s)?"shaft":/одномаршев|маршев/iu.test(s)?"single":null;
const STAIR_NAME={ring:"Кольцевая лестница",shaft:"Шахтная лестница",single:"Лестница"};
function ladderOf(texts){
 const all=texts.map(t=>t.str).join(" ");
 for(const t of texts){
  const m=/лестниц[аы]?\s*\(?\s*(\d{1,3})\s*[°'"”º*]?\s*\)?/iu.exec(t.str);
  if(m&&Number(m[1])<360){const kind=STAIR_KIND(t.str)||STAIR_KIND(all)||"shaft";return{bearing:Number(m[1]),kind,name:STAIR_NAME[kind]}}
 }
 return null
}
// "Конструктивные элементы резервуара": Поз. / Обозначение / Наименование — the parts of the tank.
const PARTS=[["wall",/^Стенк/iu],["bottom",/^Днищ/iu],["roof",/^Крыш|^Покрыти/iu],["nozzles",/^Люк|^Патруб/iu],["ladder",/лестниц/iu],["platforms",/^Площадк/iu],["railing",/^Огражд/iu]];
function partsTable(texts){
 // Rows "1 | лист 4 | Стенка": a part name with a sheet reference to its left (the title is often unreadable).
 const out={};
 for(const t of texts){
  const kind=PARTS.find(([,re])=>re.test(t.str.trim()));if(!kind||out[kind[0]])continue;
  const ref=texts.find(o=>Math.abs(o.y-t.y)<4&&o.x<t.x&&t.x-o.x<260&&/^лист\s*\d/iu.test(o.str.trim()));if(!ref)continue;
  // The name may go on in the next texts of the row ("Площадки" "на крыше" "с ограждением").
  const row=texts.filter(o=>Math.abs(o.y-t.y)<3&&o.x>=t.x&&o.x<t.x+400).sort((a,b)=>a.x-b.x).map(o=>o.str.trim()).join(" ");
  const pos=texts.filter(o=>Math.abs(o.y-t.y)<4&&o.x<ref.x&&ref.x-o.x<200&&/^\d{1,2}$/.test(o.str.trim())).sort((a,b)=>b.x-a.x)[0];
  out[kind[0]]={name:row.replace(/\s+/g," "),sheets:ref.str.trim(),pos:pos?Number(pos.str):null}
 }
 return Object.keys(out).length>=3?out:null
}
// Sheets of platforms and railings on the roof: the walkway level (a level mark above the wall top) and its width
// (a dimension that is the sum of the two written next to it: "665 + 700 = 1365").
function platformsOf(texts){
 if(!texts.some(t=>/площад/iu.test(t.str))||!texts.some(t=>/огражд|покрыти|крыш/iu.test(t.str)))return null;
 const levels=[...new Set(texts.map(t=>/^[+]?(\d{1,2})[,.](\d{3})$/.exec(t.str.trim())).filter(Boolean).map(m=>Number(m[1])*1000+Number(m[2])))].filter(v=>v>=1500).sort((a,b)=>a-b);
 const dims=texts.filter(t=>Math.abs(t.angle||0)<5&&num(t.str)).map(t=>({t,v:num(t.str)}));
 let width=null,split=null;
 for(const d of dims){
  if(d.v<600||d.v>3000)continue;
  const row=dims.filter(o=>o!==d&&o.t.y<d.t.y&&d.t.y-o.t.y<30&&Math.abs(o.t.x-d.t.x)<d.v/2);
  const pair=row.flatMap(a=>row.filter(b=>a!==b&&a.v+b.v===d.v).map(b=>[a,b]))[0];
  if(pair&&(!width||d.v>width)){width=d.v;split=pair}
 }
 // Of the two parts ("665 + 700") the one next to the wall top ("+8,940 верх стенки") is the gap over the roof
 // edge, the other is the deck.
 // OCR may keep only "стенки" of "верх стенки"; then the lowest level mark is the wall top.
 const lowest=texts.filter(t=>/^[+]?\d{1,2}[,.]\d{3}$/.test(t.str.trim())).sort((a,b)=>Number(a.str.replace(/[^\d]/g,""))-Number(b.str.replace(/[^\d]/g,"")))[0];
 const levelsSeen=new Set(texts.filter(t=>/^[+]?\d{1,2}[,.]\d{3}$/.test(t.str.trim())).map(t=>t.str.trim()));
 const wallMark=texts.find(t=>/верх\s*стенк|^стенк[аи]?$/iu.test(t.str.trim()))||(levelsSeen.size>1?lowest:null);
 let offset=null;
 if(split&&wallMark){const [a,b]=split.sort((p,q)=>Math.abs(p.t.x-wallMark.x)-Math.abs(q.t.x-wallMark.x));if(Math.abs(a.t.x-b.t.x)>5)offset=a.v}
 // The railing height: the tallest vertical dimension of the railing sections (900–1500).
 const rail=Math.max(0,...texts.filter(t=>Math.abs(Math.abs(t.angle||0)-90)<5&&num(t.str)>=900&&num(t.str)<=1500).map(t=>num(t.str)))||null;
 return levels.length?{levels,width,rail,...(offset?{offset}:{})}:null
}
// "Спецификация люков и патрубков": rows "Поз. | Наименование | Ду | … | α° | A | B | C | …" under the section
// rows "СТЕНКА" and "КРЫША". α is the bearing; A is the height of a wall item's axis over the bottom and the distance
// of a roof item from the tank axis.
function nozzleTable(texts){
 const sections=texts.filter(t=>Math.abs(t.angle||0)<5&&/^(СТЕНКА|КРЫША|СТЕНКЕ|КРЫШЕ|ПОКРЫТИЕ)$/u.test(t.str.trim()))
  .map(t=>({y:t.y,x:t.x,roof:/^(КРЫШ|ПОКР)/u.test(t.str.trim())}));
 if(!sections.length||!texts.some(t=>/люк|патруб/iu.test(t.str)))return null;
 const top=Math.min(...sections.map(s=>s.y))-4,flat=texts.filter(t=>Math.abs(t.angle||0)<5&&t.y>top);
 const near=(t,o)=>Math.abs(o.y-t.y)<=6;
 // α: a number with one decimal under 360 ("31.0", "154,0") with an integer right after it (A). The pressure column
 // ("2,5") is followed by the nozzle type, not by a number.
 const cand=[];
 for(const t of flat){
  if(!/^\d{1,3}[.,]\d$/.test(t.str.trim()))continue;
  const v=Number(t.str.replace(",","."));if(v>=360)continue;
  const right=flat.filter(o=>o!==t&&near(t,o)&&o.x>t.x+(t.width||0)*0.5).sort((a,b)=>a.x-b.x);
  const next=right[0]&&right[0].x-t.x<110?right[0]:null;
  const A=next&&/^\d{2,5}$/.test(next.str.trim())?Number(next.str):null;
  // B: the length of the nozzle out of the wall or above the roof, the column after A.
  const after=next?right.find(o=>o.x>next.x+(next.width||0)*0.5&&o.x-next.x<90):null;
  const B=after&&/^\d{2,4}$/.test(after.str.trim())?Number(after.str):null;
  if(A!==null&&A>=50)cand.push({t,v,A,B})
 }
 if(cand.length<2)return null;
 const xs=cand.map(c=>c.t.x).sort((a,b)=>a-b),mx=xs[xs.length>>1];
 const alphas=cand.filter(c=>Math.abs(c.t.x-mx)<=25).sort((a,b)=>a.t.y-b.t.y);
 // The words of a name belong to the nearest row, the one above on a tie (second lines hang under the first).
 const words=flat.filter(t=>t.x<mx-60&&/[а-яё]{2}/iu.test(t.str)&&!/^(СТЕНК|КРЫШ|ПОКР)/u.test(t.str.trim()));
 const rowOf=new Map();
 for(const w of words){
  let best=null;for(const r of alphas){const d=w.y-r.t.y,score=Math.abs(d)+(d<0?3:0);if(Math.abs(d)<=16&&(!best||score<best.score))best={r,score}}
  if(best){if(!rowOf.has(best.r))rowOf.set(best.r,[]);rowOf.get(best.r).push(w)}
 }
 // Position numbers read in the left column; a number that breaks the order counts only when a later one agrees
 // with it ("15" read for 13 is a misreading, a real gap shows again further down).
 const readPos=alphas.map(r=>{const w=rowOf.get(r)||[],x0=w.length?Math.min(...w.map(o=>o.x)):mx-400;
  const t=flat.find(o=>near(r.t,o)&&o.x<x0-4&&/^\d{1,2}$/.test(o.str.trim()));return t?Number(t.str):null});
 const rows=[];let last=0;
 alphas.forEach((r,i)=>{r.pos=readPos[i]});
 for(const [i,r] of alphas.entries()){
  const section=sections.filter(s=>s.y<r.t.y).sort((a,b)=>b.y-a.y)[0];if(!section)continue;
  const name=(rowOf.get(r)||[]).sort((a,b)=>Math.abs(a.y-b.y)<4?a.x-b.x:a.y-b.y);
  const nameX0=name.length?Math.min(...name.map(w=>w.x)):mx-400,nameX1=name.length?Math.max(...name.map(w=>w.x+(w.width||0))):mx-300;
  // Ду: the first number right of the name ("200", "600х900"); the position: a small integer left of the name,
  // else the next number in order (positions of a specification run on).
  const nums=flat.filter(o=>near(r.t,o)&&o.x<r.t.x-20&&o.x>nameX0&&/^\d{2,4}(?:\s*[хx]\s*\d{3,4})?$/.test(o.str.trim())).sort((a,b)=>a.x-b.x);
  const duT=nums.find(o=>o.x>=nameX1-40)||nums[0],du=duT?/^(\d{2,4})(?:\s*[хx]\s*(\d{3,4}))?$/.exec(duT.str.trim()):null;
  const read=readPos[i];
  const agreed=read!==null&&read>last&&(read===last+1||readPos.some((q,j)=>j>i&&q!==null&&q-read===j-i));
  const pos=agreed?read:last+1;last=pos;
  rows.push({pos,name:tidy(name.map(w=>w.str.trim()).join(" ")),du:du?Number(du[1]):null,size:du?.[2]?du[1]+"x"+du[2]:null,bearing:r.v,a:r.A,b:r.B,roof:section.roof})
 }
 return rows.length>=2?rows:null
}
// The sheet of the shaft stair itself ("Шахтная лестница Ш1", its sections and hoops): its lowest and highest level
// marks are the foot and the top landing (the facade of the tank may show other levels next to it).
function ladderSheetOf(texts,all){
 if(!/шахтн\S*\s+лестниц/iu.test(all)||!/разрез|кольц|марш/iu.test(all))return null;
 const lv=[...new Set(texts.map(t=>/^([+\-−—]?)(\d{1,2})[,.](\d{3})$/.exec(String(t.str).trim())).filter(Boolean)
  .map(m=>(/[-−—]/.test(m[1])?-1:1)*(Number(m[2])*1000+Number(m[3]))))].filter(v=>v>-1000&&v<40000).sort((a,b)=>a-b);
 // Dimensions are read more reliably than level marks: the height of the shaft (the largest vertical one), the first
 // rise (1300–1900) and the landing step (1200); the width along the wall (2100 = 1050 + 1050).
 const vert=new Set(texts.filter(t=>Math.abs(Math.abs(t.angle||0)-90)<5).map(t=>num(t.str)).filter(Boolean));
 const height=Math.max(0,...[...vert].filter(v=>v>=3000&&v<=30000))||null;
 const first=[...vert].find(v=>v>=1300&&v<=1900)||null,step=vert.has(1200)?1200:null;
 const width=[...vert].find(v=>v>=1500&&v<=3000&&vert.has(v/2))||null;
 const out={foot:lv.length&&lv[0]<0?lv[0]:null,top:lv.length?lv.at(-1):null,height,first,step,width};
 return height||lv.length>=2&&lv.at(-1)-lv[0]>=2500?out:null
}
// Courses of the wall: a column of equal-direction vertical dimensions one above the other ("1490" ×6 on the wall
// development or its section). Every column of three or more is kept; the plan takes the one that sums to the wall
// height (the bottom layout has such columns too, they sum to the diameter).
function coursesOf(texts){
 const vert=texts.filter(t=>Math.abs(Math.abs(t.angle||0)-90)<5&&num(t.str)>=300&&num(t.str)<=3500);
 const cols=[];
 for(const t of vert){const c=cols.find(c=>Math.abs(c.x-t.x)<4);if(c)c.items.push(t);else cols.push({x:t.x,items:[t]})}
 const out=[];
 for(const c of cols){
  const items=c.items.sort((a,b)=>b.y-a.y);
  // Neighbours no farther apart than the longer of the two dimensions would take on the sheet: one chain.
  let chain=[items[0]];
  const flush=()=>{if(chain.length>=3)out.push(chain.map(t=>num(t.str)))};
  for(let i=1;i<items.length;i++){const gap=chain[chain.length-1].y-items[i].y;if(gap>2&&gap<120)chain.push(items[i]);else{flush();chain=[items[i]]}}
  flush()
 }
 return out
}
// Shield roof (ГОСТ 31385, щитовое покрытие): the number of shields from "1/10 часть окружности" on the shield
// sheets, the kinds of shields named (начальный Щ1, промежуточные Щ2, замыкающий Щ3) and the central ring with its
// two diameters ("ЦЕНТРАЛЬНОЕ КОЛЬЦО ЦК1", Ø1720 / Ø1400; OCR reads Ø as "$" or "#").
function roofOf(texts){
 const all=texts.map(t=>t.str).join(" ");
 if(!/щит|кольц/iu.test(all))return null;
 const part=/1\s*\/\s*(\d{1,2})\s*(?:-?\s*я\s+)?част/iu.exec(all);
 const sectors=part&&Number(part[1])>=4&&Number(part[1])<=60?Number(part[1]):null;
 const kinds=[["start",/начальн[а-яё]*\s+(?:укрупн[а-яё]*\s+)?щит|щит[а-яё]*\s+начальн/iu],["middle",/промежуточн[а-яё]*\s+(?:укрупн[а-яё]*\s+)?щит|щит[а-яё]*\s+промежуточн/iu],
  ["end",/замыкающ[а-яё]*\s+(?:укрупн[а-яё]*\s+)?щит|щит[а-яё]*\s+замыкающ/iu]].filter(([,re])=>re.test(all)).map(([k])=>k);
 let ring=null;
 if(/центральн[а-яё]*\s+кольц/iu.test(all)){
  const d=texts.map(t=>/^(?:Ø|⌀|Ç|ø|\$|#)\s*(\d{3,4})$/u.exec(t.str.trim())).filter(Boolean).map(m=>Number(m[1])).filter(v=>v>=500&&v<=5000);
  if(d.length)ring={outer:Math.max(...d),inner:Math.min(...d)<Math.max(...d)?Math.min(...d):null}
 }
 // The mark of the ring may stand on another roof sheet (the roof layout: "Центральное кольцо ЦК1").
 const ck=/ЦК\s*[1!|lI]/u.test(all);
 return sectors||kinds.length||ring||ck?{sectors,kinds,ring,...(ck?{ck}:{})}:null
}
// Anchors of the wall on their layout sheet: one small symbol repeated round the circle just outside the wall.
// Short strokes near the circle are grouped by bearing; the set of stroke lengths seen most often is the symbol, and
// a group with part of it in its regular place (one hidden under an axis line) counts too.
function anchorsOf(segments,circle){
 const {c,r}=circle,strokes=[];
 for(const s of segments){
  const m={x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2},d=dist(m,c),l=dist(s.a,s.b);
  if(d<r*0.97||d>r*1.08||l<2||l>8)continue;
  // Chords of the circle itself are not strokes of a symbol.
  if(Math.abs(dist(s.a,c)-r)<r*0.004&&Math.abs(dist(s.b,c)-r)<r*0.004)continue;
  strokes.push({b:((90-Math.atan2(-(m.y-c.y),m.x-c.x)*180/Math.PI)%360+360)%360,l:Math.round(l),d:d/r})
 }
 strokes.sort((a,b)=>a.b-b.b);
 const groups=[];
 for(const s of strokes){const g=groups[groups.length-1];if(g&&s.b-g.last<=2.5){g.items.push(s);g.last=s.b}else groups.push({items:[s],last:s.b})}
 if(groups.length>1){const a=groups[0],z=groups[groups.length-1];if(a.items[0].b+360-z.last<=2.5){z.items.push(...a.items.map(s=>({...s,b:s.b+360})));groups.shift()}}
 const sig=g=>g.items.map(s=>s.l).sort((a,b)=>a-b).join(",");
 const count=new Map();for(const g of groups)count.set(sig(g),(count.get(sig(g))||0)+1);
 const [core,n]=[...count.entries()].sort((a,b)=>b[1]-a[1])[0]||[];
 if(!core||n<4||core.split(",").length<3)return null;
 const coreSet=core.split(",").map(Number);
// A group may hold a nozzle stub beside the symbol: the centre is that of the strokes of the symbol.
 const matched=g=>{const left=[...coreSet],hit=[];for(const s of g.items){const i=left.indexOf(s.l);if(i>=0){left.splice(i,1);hit.push(s)}}return hit};
 const has=g=>matched(g).length;
 const centre=g=>{const m=matched(g),b=m.reduce((s,x)=>s+x.b,0)/m.length;return Math.round((b%360)*10)/10};
 const sure=groups.filter(g=>has(g)===coreSet.length).map(centre);
 if(sure.length<4)return null;
 // The usual spacing; a weak group exactly in a gap of two spacings is the hidden one.
 const sorted=[...sure].sort((a,b)=>a-b),gaps=sorted.map((b,i)=>((sorted[(i+1)%sorted.length]-b)+360)%360||360);
 const step=[...gaps].sort((a,b)=>a-b)[Math.floor(gaps.length/2)];
 const extra=groups.filter(g=>has(g)>0&&has(g)<coreSet.length).map(centre).filter(b=>{
  const prev=sorted.filter(x=>x<b).pop()??sorted[sorted.length-1]-360,next=sorted.find(x=>x>b)??sorted[0]+360;
  return Math.abs(b-prev-step)<=step*0.3&&Math.abs(next-b-step)<=step*0.3});
 const ratio=groups.filter(g=>has(g)===coreSet.length).flatMap(matched).reduce((s,x,i,a)=>s+x.d/a.length,0);
 return{bearings:[...sorted,...extra].sort((a,b)=>a-b),ratio:Math.round(ratio*1000)/1000}
}
function extractTank({segments=[],texts=[],widthPt=0,heightPt=0}){
 const all=texts.map(t=>t.str).join(" ");
 // Without the word "резервуар" (OCR may lose the stamp) only what is unmistakable is read: the roof platforms sheet
 // and the specification of hatches and nozzles. A tank is built only when the set also has its plan or facade.
 if(!TANK.test(all)){
  const table=nozzleTable(texts);
  // Shield sheets of the roof carry no word "резервуар" once the stamp is lost: only their own words count.
  const roof=/щит/iu.test(all)&&/покрыти|кровл/iu.test(all)?roofOf(texts):null;
  const platforms=/площад/iu.test(all)&&/огражд/iu.test(all)&&/покрыти|крыш/iu.test(all)&&/схема\s+расположения/iu.test(all)?platformsOf(texts):null;
  const lsheet=ladderSheetOf(texts,all);
  // A bottom sheet whose stamp lost the word "резервуар": "Схема сборки днища", "Раскрой листов на днище".
  const bottom=/(?:схем\S*|раскро\S*)\s+(?:\S+\s+){0,3}днищ/iu.test(all)?{diameters:diameters(texts).filter(v=>v>=2000&&v<=80000)}:null;
  if(bottom&&!(table||platforms||lsheet||roof))return{diameters:[],title:"",byAngle:[],bottom};
  return table||platforms||lsheet||roof?{diameters:[],title:"",byAngle:[],...(table?{nozzleTable:table}:{}),...(platforms?{platforms}:{}),...(lsheet?{ladderSheet:lsheet}:{}),...(roof?{roof}:{})}:null
 }
 const D=diameters(texts).filter(v=>v>=2000&&v<=80000);
 // "Вид профиля и ГОСТ" heads the steel specification, not a view of the tank.
 const title=texts.filter(t=>/^(План|Фасад|Вид|Разрез|Общий вид|Схема расположения)/iu.test(t.str)&&!/^Вид\s+профил/iu.test(t.str)).map(t=>t.str).join(" | ");
 const isFacade=/Фасад|Общий вид|^Вид\s/iu.test(title),isPlan=/План|Схема расположения/iu.test(title);
 const area={x0:60,y0:40,x1:Math.max(200,widthPt-560),y1:heightPt-40};
 // Without a diameter sign: a facade dimensioned from the axis, two equal halves side by side ("5215 5215").
 if(!D.length&&isFacade){
  const flat=texts.filter(t=>Math.abs(t.angle||0)<5&&num(t.str)>=1000).sort((a,b)=>a.y-b.y||a.x-b.x);
  for(let i=0;i+1<flat.length;i++){const a=flat[i],b=flat[i+1];if(Math.abs(a.y-b.y)<3&&num(a.str)===num(b.str)&&b.x-a.x<num(a.str)){D.push(num(a.str)*2);break}}
 }
 // Items written with their angle on the plan: "Патрубок … Ду 150(323°)", "Люк световой Ду 500(283°)".
 const byAngle=[];
 for(const t of texts){
  const m=/Ду\s*(\d{2,4})\s*\(\s*(\d{1,3}(?:[.,]\d)?)\s*[°'"º]?\s*\)?/u.exec(t.str);if(!m)continue;
  const above=texts.filter(o=>o!==t&&Math.abs(o.x-t.x)<60&&t.y-o.y>2&&t.y-o.y<t.size*2.4&&/[а-яё]{4}/iu.test(o.str)).sort((a,b)=>b.y-a.y)[0];
  const name=((/[а-яё]{4}/iu.test(t.str.replace(m[0],""))?t.str.replace(m[0],"").trim()+" ":above?above.str.trim()+" ":"")+"Ду"+m[1]).replace(/\s+/g," ");
  byAngle.push({mark:"Ду"+m[1]+"/"+Math.round(Number(m[2].replace(",","."))),name,du:Number(m[1]),bearing:Number(m[2].replace(",","."))})
 }
 const out={diameters:D,title,byAngle};
 if(/переходн\S*\s+площадк|площадк\S*\s+(?:обслуживани\S*\s+)?переходн/iu.test(all))out.bridge=true;
 if(/расположени\S*\s+резервуар/iu.test(all)){const many=tankCircles(segments,{...area,x1:widthPt-40},texts);if(many)out.layout=many}
 // A bottom resting on beams ("Схема расположения балок под дно резервуара", acid tanks): the step from "15х600=9000",
 // the height from the profile ("I20Б1").
 if(/балок\s+под\s+дн|балк\S*\s+под\s+днищ/iu.test(all)){
  const sp=/(\d{1,2})\s*[xх×]\s*(\d{3,4})\s*=\s*(\d{4,5})/u.exec(all),prof=/(?:^|[\sIІ])(\d{2})[БШК]\d/u.exec(all);
  out.bottomBeams={...(sp&&Number(sp[1])*Number(sp[2])===Number(sp[3])?{step:Number(sp[2])}:{}),...(prof?{height:Number(prof[1])*10}:{})}
 }
 // A wall shipped in rolls ("полотнище стенки … наворачивать на каркас"): unrolled on the bottom at the site.
 // "Соединение листов полотнищ стенки" of a wall assembled sheet by sheet (РВС-700) is not a roll: a roll is wound,
 // shipped in rolls or unrolled.
 if(/наворачива\S*|каркас\S*\s+наворачивани|рулон\S*\s+(?:стенк|полотнищ)|(?:стенк|полотнищ)\S*\s+(?:\S+\s+){0,2}рулон|рулонн\S*\s+(?:сборк|монтаж|метод|заготовк)|разворачива\S*\s+рулон/iu.test(all))out.rolled=true;
 const passport=passportOf(texts);if(passport)out.passport=passport;
 const ship=shipList(texts);if(ship)out.ship=ship;
 // Plan: a big circle.
 // A facade sheet may carry the plan too (small tanks: facade, bottom and roof plan on one sheet).
 const circle=isPlan||!isFacade?circleOf(segments,area):(c=>c&&c.r>80?c:null)(circleOf(segments,{...area,x0:area.x0+(area.x1-area.x0)*0.4}));
 if(circle&&circle.r>80){
  const {c,r}=circle;
  // Roof members: long lines that pass through the centre.
  const angles=new Set();
  for(const s of segments){
   const l=dist(s.a,s.b);if(l<r*0.25)continue;
   const v={x:(s.b.x-s.a.x)/l,y:(s.b.y-s.a.y)/l},w={x:c.x-s.a.x,y:c.y-s.a.y};
   if(Math.abs(v.x*w.y-v.y*w.x)>3)continue;
   const far=dist(s.a,c)>dist(s.b,c)?s.a:s.b;if(dist(far,c)<r*0.6)continue;
   angles.add(Math.round(Math.atan2(-(far.y-c.y),far.x-c.x)*180/Math.PI))
  }
  // Both faces of one member and neighbouring degrees are one member.
  const sorted=[...angles].sort((a,b)=>a-b),members=[];
  for(const a of sorted)if(!members.length||a-members[members.length-1]>4)members.push(a);
  if(members.length>1&&members[0]+360-members[members.length-1]<=4)members.pop();
  const items=[];
  for(const {t,mark} of marksOf(texts,widthPt,heightPt)){
   const p=leaderEnd(t,segments),d=dist(p,c);
   if(d>r*1.35)continue;
   const du=texts.find(o=>o!==t&&/^Ду\s*\d+/u.test(o.str)&&Math.abs(o.x-t.x)<40&&o.y>t.y&&o.y-t.y<30);
   items.push({mark,angle:Math.round(Math.atan2(-(p.y-c.y),p.x-c.x)*1800/Math.PI)/10,r:Math.round(d/r*1000)/1000,
    du:du?Number(/(\d+)/.exec(du.str)[1]):null,radial:members.some(a=>Math.abs(((Math.atan2(-(p.y-c.y),p.x-c.x)*180/Math.PI-a+540)%360)-180)<2.5)&&d<r*0.97})
  }
  // Whatever stands outside the wall (a stair tower, a platform) is the biggest mass of lines just beyond the circle:
  // its bearing, in 10° sectors weighted by line length. Nozzle stubs are short and spread round.
  const sectors=new Array(36).fill(0);
  for(const sg of segments){
   const m={x:(sg.a.x+sg.b.x)/2,y:(sg.a.y+sg.b.y)/2},d=dist(m,c),l=dist(sg.a,sg.b);
   if(d<r*1.04||d>r*1.9||l<2)continue;
   const b=((90-Math.atan2(-(m.y-c.y),m.x-c.x)*180/Math.PI)%360+360)%360;sectors[Math.floor(b/10)%36]+=l
  }
  // 30° windows: the densest one, if it stands out twice over the usual window (callout leaders spread round).
  const win=sectors.map((_,i)=>sectors[(i+35)%36]+sectors[i]+sectors[(i+1)%36]);
  const top=win.indexOf(Math.max(...win)),usual=[...win].sort((a,b)=>a-b)[18];
  const centre=[-1,0,1].reduce((acc,k)=>{const i=(top+k+36)%36;return{w:acc.w+sectors[i],m:acc.m+sectors[i]*(top*10+5+k*10)}},{w:0,m:0});
  const outside=win[top]>r*3&&win[top]>=usual*2?{bearing:Math.round(((centre.m/centre.w)%360+360)%360/5)*5,weight:Math.round(win[top])}:null;
  out.plan={radiusPt:r,roofMembers:members.length,items,...(outside?{outside}:{}),outsideSectors:sectors.map(v=>Math.round(v/r*100)/100)};
  const cs=callouts(texts,segments,circle,widthPt,heightPt);
  if(cs.length)out.callouts=cs;
  if(/анкерн/iu.test(all)){const an=anchorsOf(segments,circle);if(an)out.anchors=an}
 }
 const table=nozzleTable(texts);if(table)out.nozzleTable=table;
 const ladder=ladderOf(texts);if(ladder)out.ladder=ladder;
 const lsheet=ladderSheetOf(texts,all);if(lsheet)out.ladderSheet=lsheet;
 const parts=partsTable(texts);if(parts)out.parts=parts;
 const courses=coursesOf(texts);if(courses.length)out.courses=courses;
 const sheets=sheetsOf(texts,all);if(sheets)out.sheets=sheets;
 const roof=roofOf(texts);if(roof)out.roof=roof;
 // Only the sheet of the roof platforms: other sheets mention platforms (the parts table, the stair landings).
 // OCR may split the title ("СХЕМА РАСПОЛОЖЕНИЯ" | "И ОГРАЖДЕНИЙ ПО ПОКРЫТИЮ"): the words anywhere on the sheet count.
 const platforms=/площад/iu.test(all)&&/огражд/iu.test(all)&&/покрыти|крыш/iu.test(all)&&/схема\s+расположения/iu.test(all)?platformsOf(texts):null;if(platforms)out.platforms=platforms;
 // Facade: the wall height is the largest vertical dimension; the roof rise is the one above it on the same line.
 if(isFacade){
  // Roof slope "1:10" (not the bottom slope "1:100"), level marks ("−0,030" at the stair foot, "+9,170" its top)
  // and the width of what stands beside the wall: the third dimension after the two radii ("5215 5215 2500").
  const slopes=texts.map(t=>/^1\s*:\s*(\d{1,3})$/.exec(t.str.trim())).filter(Boolean).map(m=>Number(m[1])).filter(v=>v>=4&&v<=40);
  const levels=[...new Set(texts.map(t=>/^([+\-−—]?)(\d{1,2})[,.](\d{3})$/.exec(t.str.trim())).filter(Boolean)
   .map(m=>(/[-−—]/.test(m[1])?-1:1)*(Number(m[2])*1000+Number(m[3]))))].sort((a,b)=>a-b);
  const flat=texts.filter(t=>Math.abs(t.angle||0)<5&&num(t.str)>=500).sort((a,b)=>a.x-b.x);
  let beside=null;
  for(let i=0;i+2<flat.length;i++){const a=flat[i],b=flat.find(o=>o!==a&&Math.abs(o.y-a.y)<3&&o.x>a.x&&num(o.str)===num(a.str));
   if(!b)continue;const c=flat.find(o=>Math.abs(o.y-a.y)<3&&o.x>b.x&&num(o.str)<num(a.str));if(c){beside=num(c.str);break}}
  out.facadeExtra={slope:slopes.length?Math.min(...slopes):null,levels,beside};
  const vert=texts.filter(t=>Math.abs(Math.abs(t.angle||0)-90)<5&&num(t.str)).map(t=>({t,v:num(t.str)}));
  // Every vertical dimension: the wall height is the one the courses add up to when the tallest runs up to the roof top.
  out.facadeExtra.verticals=[...new Set(vert.map(x=>x.v).filter(v=>v>=1000&&v<=40000))];
  const tall=vert.filter(x=>x.v>=1500&&x.v<=40000).sort((a,b)=>b.v-a.v)[0];
  // Without a height dimension: the level marks, the wall top below the roof top ("+8,940", "+9,170").
  if(!tall){
   const lv=[...new Set(texts.map(t=>/^[+]?(\d{1,2})[,.](\d{3})$/.exec(t.str.trim())).filter(Boolean).map(m=>Number(m[1])*1000+Number(m[2])))].filter(v=>v>=1500).sort((a,b)=>b-a);
   if(lv.length)out.facade={height:lv.length>1&&lv[0]-lv[1]<lv[0]/3?lv[1]:lv[0],rise:lv.length>1&&lv[0]-lv[1]<lv[0]/3?lv[0]-lv[1]:null,items:[]}
  }
  if(tall){
   const H=tall.v;
   // The dimension line of the height: the longest vertical segment next to its text.
   const line=segments.filter(s=>Math.abs(s.a.x-s.b.x)<0.5&&Math.abs(s.a.x-tall.t.x)<16&&Math.min(s.a.y,s.b.y)<tall.t.y&&Math.max(s.a.y,s.b.y)>tall.t.y-tall.t.width)
    .sort((a,b)=>Math.abs(b.a.y-b.b.y)-Math.abs(a.a.y-a.b.y))[0];
   const rise=vert.filter(x=>x!==tall&&Math.abs(x.t.x-tall.t.x)<16&&x.t.y<tall.t.y-tall.t.width&&x.v>=100&&x.v<H/3).sort((a,b)=>b.v-a.v)[0];
   const facade={height:H,rise:rise?rise.v:null,items:[]};
   if(line){
    const y0=Math.max(line.a.y,line.b.y),y1=Math.min(line.a.y,line.b.y),k=H/(y0-y1);
    for(const {t,mark} of marksOf(texts,widthPt,heightPt)){
     const p=leaderEnd(t,segments);
     facade.items.push({mark,z:Math.round((y0-p.y)*k/10)*10})
    }
   }
   out.facade=facade
  }
 }
 if(out.facade&&out.facadeExtra)Object.assign(out.facade,out.facadeExtra);
 delete out.facadeExtra;
 // The bottom sheets "—8х1500х6000": the thickest one is the thickness of the bottom (its top is at 0,000).
 if(/дни[щш]/iu.test(title)||texts.some(t=>/^(?:схема\s+(?:сборки\s+|раскроя\s+)?дни[щш]|дни[щш]\S*\s+резервуар|раскрой\s+(?:\S+\s+){1,3}дни[щш])/iu.test(t.str.trim()))){
  const t=texts.map(x=>/^[—–-]\s*(\d{1,2})\s*[хx×]\s*\d{3,4}\s*[хx×]\s*\d{3,5}/u.exec(x.str.trim())).filter(Boolean).map(m=>Number(m[1])).filter(v=>v>=4&&v<=40);
  out.bottom={diameters:D,...(t.length?{thickness:Math.max(...t)}:{})}
 }
 return out.plan||out.facade||byAngle.length||out.parts||out.platforms||out.ladder||out.bottom||out.nozzleTable||out.ladderSheet||out.roof||out.courses||out.passport||out.ship||out.sheets||out.layout||out.bridge||out.bottomBeams||out.rolled?out:null
}

// Equipment of a vertical tank (ГОСТ 31385 and the usual tank fittings) by its name: what it is, where it sits and
// how it is drawn in 3D. type: nozzle — a pipe with a flange; manhole — a short wide pipe with a cover; hatch — a roof
// hatch with a cover; valve — a pipe with a valve body; foam — a foam generator on the top course; ring — a ring
// round the wall at its level; rod — a lightning rod; sensor — a small pipe of an instrument.
const FITTINGS=[
 ["manhole",/люк\s*-?\s*лаз|лаз(?![а-яё])|очистн[а-яё]*\s+люк|придонн/iu,"Люк-лаз"],
 ["hatch",/люк\s+светов|светов[а-яё]*\s+люк|монтажн[а-яё]*\s+люк|люк\s+монтажн|смотров[а-яё]*\s+люк|люк\s+смотров|люк\s+обслуживани/iu,"Люк на крыше"],
 ["hatch",/люк\s+замерн|замерн[а-яё]*\s+люк/iu,"Люк замерный"],
 ["valve",/клапан|огне\s*-?\s*преград|огнепрегр|хлопушк|задвижк|затвор/iu,"Клапан"],
 ["foam",/пеногенерат|генератор\s+пен|камер[а-яё]*\s+(низкократн|пен)|КНП|ГПСС/iu,"Пеногенератор"],
 ["ring",/кольц[а-яё]*\s+(жестк|жёстк|орошен|ветров)|ветров[а-яё]*\s+кольц/iu,"Кольцо"],
 ["rod",/молние(приемн|приёмн|отвод)/iu,"Молниеприёмник"],
 ["sensor",/уровнемер|сигнализатор|датчик|извещател|пробоотборн/iu,"Прибор"],
 ["nozzle",/кран\s+сифон|сифонн/iu,"Кран сифонный"],
 ["nozzle",/сифон/iu,"Сифон"],
 ["nozzle",/патруб|ПРУ|ППР|штуцер|вентиляц/iu,"Патрубок"]];
// Outer diameter of a steel pipe by its nominal bore (ГОСТ 33259 flanges).
const OD={15:21,20:27,25:32,32:38,40:45,50:57,65:76,80:89,100:108,125:133,150:159,200:219,250:273,300:325,350:377,400:426,450:480,500:530,600:630,700:720,800:820,900:920,1000:1020};
function fittingOf(name,du,size){
 const hit=FITTINGS.find(([,re])=>re.test(String(name||"")));
 const type=hit?hit[0]:"nozzle";
 const big=size?Math.max(...String(size).split(/[xх]/).map(Number)):0;
 const d=big||OD[du]||(du>0?Math.round(du*1.06):type==="manhole"?630:type==="hatch"?530:type==="rod"?40:159);
 return{type,label:hit?hit[2]:"Патрубок",d_mm:d}
}
// Lowest axis of a wall nozzle over the bottom by its Ду (ГОСТ 31385, table of nozzles in the wall).
const AXIS_MIN={50:150,80:150,100:150,150:200,200:240,250:290,300:340,350:390,400:430,500:530,600:600,700:600};
const axisDefault=(name,du,wallTop)=>/люк\s*-?\s*лаз|лаз(?![а-яё])/iu.test(name)?750:Math.min(wallTop,AXIS_MIN[du]||Math.max(300,Math.round((du||200)*1.2/10)*10));
// How far a fitting sticks out of the wall (or up from the roof) when the drawing gives no length.
const OUTREACH={nozzle:250,manhole:350,hatch:330,valve:500,foam:600,sensor:250,rod:2500};
// "Ведомость отправочных элементов" (any table headed Марка | Наименование | Кол.): what is shipped and how many.
// The text layer of КМД sheets loses cells now and then: a row is anchored by its name, a lost mark is the one between
// its neighbours ("РС3", ?, "РС5" → "РС4"), a bare prefix in the first row is number 1.
function shipList(texts){
 const out=[];
 for(const head of texts.filter(t=>/^Марка,?$/iu.test(t.str.trim())&&Math.abs(t.angle||0)<5)){
  const nameHead=texts.find(t=>/^Наименование/iu.test(t.str.trim())&&t.x>head.x&&t.x-head.x<350&&Math.abs(t.y-head.y)<14);if(!nameHead)continue;
  const qtyHead=texts.find(t=>/^Кол/iu.test(t.str.trim())&&t.x>nameHead.x&&t.x-nameHead.x<400&&Math.abs(t.y-head.y)<14);
  const right=qtyHead?qtyHead.x-8:nameHead.x+nameHead.width+150;
  const end=texts.filter(t=>/^(Итого|Всего)/iu.test(t.str.trim())&&t.y>head.y&&Math.abs(t.x-nameHead.x)<300).sort((a,b)=>a.y-b.y)[0];
  // "Спецификация элементов на патрубки": every row is a fitting, named by its purpose ("Загрузочный", "Сифон").
  const fittings=texts.some(t=>t.y<head.y&&head.y-t.y<60&&Math.abs(t.x-head.x)<500&&/спецификаци|ведомост/iu.test(t.str)&&/патруб|штуцер|люк/iu.test(t.str));
  const y1=end?end.y:head.y+600;
  const names=texts.filter(t=>t.y>head.y+8&&t.y<y1&&t.x>Math.max(head.x+25,nameHead.x-70)&&t.x<right&&/[а-яё]{3}/iu.test(t.str)&&!/^(Марка|Наименование|Кол|Масса|шт|общ|ед|поз|во)\.?$|^(Сборочные\s+единицы|Детали)$/iu.test(t.str.trim())&&Math.abs(t.angle||0)<5).sort((a,b)=>a.y-b.y);
  const rows=[];
  for(const n of names){
   if(rows.length&&Math.abs(rows[rows.length-1].y-n.y)<6){rows[rows.length-1].name+=" "+n.str.trim();continue}
   // The table ends where the rows stop following each other (the stamp below it).
   if(rows.length>=2){const gaps=rows.slice(1).map((r,i)=>r.y-rows[i].y).sort((a,b)=>a-b),g=gaps[gaps.length>>1];if(n.y-rows[rows.length-1].y>g*3)break}
   const mk=texts.find(t=>Math.abs(t.y-n.y)<7&&t.x>=head.x-15&&t.x<head.x+70&&/^[А-ЯЁA-Z][А-ЯЁA-Zа-яё]{0,3}-?\d{0,3}[а-я]?$/u.test(t.str.trim()));
   const qty=texts.filter(t=>Math.abs(t.y-n.y)<7&&/^\d{1,4}$/.test(t.str.trim())&&(qtyHead?Math.abs(t.x-qtyHead.x)<35:t.x>n.x+n.width-5)).sort((a,b)=>a.x-b.x)[0];
   const du=texts.map(t=>Math.abs(t.y-n.y)<7&&/(?:Ду|Dy|Ду)\s*-?\s*(\d{2,4})/iu.exec(t.str)).find(Boolean);
   rows.push({y:n.y,mark:mk?mk.str.trim().replace("-",""):null,name:n.str.trim(),qty:qty?Number(qty.str):null,...(du?{du:Number(du[1])}:{}),...(fittings?{fitting:true}:{})})
  }
  if(rows.length<2)continue;
  // A lost or bare mark between marks of one series: "РС3", ?, "РС5" → "РС4"; "РС", "РС2" → "РС1".
  const parse=m=>/^([А-ЯЁA-Z]+)(\d*)$/u.exec(m||"");
  for(let pass=0;pass<rows.length;pass++)rows.forEach((r,i)=>{
   const p=parse(r.mark),pv=parse(rows[i-1]?.mark),nx=parse(rows[i+1]?.mark);
   if(r.mark&&!(p&&!p[2]))return;
   if(nx&&nx[2]&&(!p||p[1]===nx[1]))r.mark=nx[1]+(Number(nx[2])-1);
   else if(pv&&pv[2]&&(!p||p[1]===pv[1]))r.mark=pv[1]+(Number(pv[2])+1)
  });
  // Fonts of some КМД exports swap letters in the text layer ("Площабка", "Патрудок", "Шасба").
  out.push(...rows.map(({y,...r})=>({...r,name:r.name.replace(/\s+/g," ").replace(/лощабк/gu,"лощадк").replace(/[ао]тру[дб]ок/gu,"атрубок").replace(/наклабк/gu,"накладк").replace(/(?<![а-яё])витов/giu,"винтов").replace(/Шасб/gu,"Шайб")})))
 }
 // "Требуется изготовить": Отправочная марка | Кол. — how many of each mark the sheet makes.
 for(const head of texts.filter(t=>/^Отправочная/iu.test(t.str.trim()))){
  const qh=texts.find(t=>/^Кол/iu.test(t.str.trim())&&t.x>head.x&&t.x-head.x<250&&Math.abs(t.y-head.y)<14);if(!qh)continue;
  for(const m of texts.filter(t=>t.y>head.y+6&&t.y<head.y+200&&Math.abs(t.x-head.x)<60&&/^[А-ЯЁA-Z][А-ЯЁA-Zа-яё]{0,3}-?\d{1,3}[а-я]?$/u.test(t.str.trim()))){
   const q=texts.find(t=>Math.abs(t.y-m.y)<6&&Math.abs(t.x-qh.x)<30&&/^\d{1,4}$/.test(t.str.trim()));
   if(q)out.push({mark:m.str.trim().replace("-",""),name:"",qty:Number(q.str),made:true})
  }
 }
 return out.length?out:null
}
// Sheets of the wall and of the bottom (ГОСТ 19903: 1500×6000, 2000×8000…): "—8х1500х6000", "из листов 1500х6000х8".
// A sheet named on the bottom sheet (or next to the word) is the bottom's; the wall's sheet length is the length the
// wall development repeats ("6000 6000 6000 …" along a course).
function sheetsOf(texts,all){
 const out={};
 for(const t of texts){
  const a=/[—–-]\s*(\d{1,2})\s*[хx×]\s*(\d{3,4})\s*[хx×]\s*(\d{4,5})/u.exec(t.str),b=a?null:/(?:^|[^\d])(\d{3,4})\s*[хx×]\s*(\d{4,5})(?:\s*[хx×]\s*(\d{1,2}))?(?!\d)/u.exec(t.str);
  const w=a?Number(a[2]):b?Number(b[1]):0,l=a?Number(a[3]):b?Number(b[2]):0,th=a?Number(a[1]):b&&b[3]?Number(b[3]):null;
  if(!(w>=1000&&w<=3000&&l>=3000&&l<=12000))continue;
  const kind=/днищ/iu.test(t.str)||/днищ/iu.test(all)&&!/развертк|развёртк/iu.test(all)?"bottom":/стенк|развертк|развёртк|пояс/iu.test(t.str+" "+all)?"wall":null;
  if(kind&&!out[kind])out[kind]={width:w,length:l,...(th?{thickness:th}:{})}
 }
 if(/развертк|развёртк/iu.test(all)){
  const n=new Map();for(const t of texts)if(Math.abs(t.angle||0)<5){const v=num(t.str);if(v>=4000&&v<=12000)n.set(v,(n.get(v)||0)+1)}
  const best=[...n].sort((a,b)=>b[1]-a[1])[0];
  if(best&&best[1]>=3)out.wall={...(out.wall||{}),length:best[0],fromDevelopment:true}
 }
 return Object.keys(out).length?out:null
}
// The general data of a set: "Диаметр резервуара 18,9 м", "Высота стенки резервуара 11,92 м", "Объем 3000 м3".
function passportOf(texts){
 // A table of the general data reads row by row: "Диаметр резервуара" | "– 15,18" | "м." are three texts of one row.
 const flat=texts.filter(t=>!t.angle).sort((a,b)=>a.y-b.y||a.x-b.x),rows=[];
 for(const t of flat){const r=rows.find(r=>Math.abs(r.y-t.y)<5&&t.x-r.x1<450);if(r){r.items.push(t);r.x1=Math.max(r.x1,t.x+(t.width||0))}else rows.push({y:t.y,x1:t.x+(t.width||0),items:[t]})}
 const all=[...rows.map(r=>r.items.sort((a,b)=>a.x-b.x).map(t=>t.str).join(" ")),...texts.map(t=>t.str)].join("\n"),mm=(v,u)=>Math.round(Number(v.replace(",","."))*(/^мм/iu.test(u||"")?1:/^м/iu.test(u||"")?1000:Number(v.replace(",","."))<100?1000:1));
 const d=/диаметр\s+(?:стенки\s+)?резервуара[^\d\n]{0,12}(\d{1,5}(?:[.,]\d{1,3})?)\s*(мм|м)?/iu.exec(all);
 const h=/высота\s+(?:стенки|стены)(?:\s+резервуара)?[^\d\n]{0,12}(\d{1,5}(?:[.,]\d{1,3})?)\s*(мм|м)?/iu.exec(all);
 const out={};
 if(d){const v=mm(d[1],d[2]);if(v>=2000&&v<=80000)out.diameter=v}
 if(h){const v=mm(h[1],h[2]);if(v>=1500&&v<=30000)out.height=v}
 return Object.keys(out).length?out:null
}
// The wall among the diameters of a set: the bottom sheet runs out past the wall and the roof overhangs it, platforms
// round the top give a still larger width. The values of one tank stand within 6 % of each other; the group with most
// values (the one nearest the written diameter, if the set has one) is the tank, its smallest value the wall.
function wallDiameter(values,written){
 const v=values.filter(x=>x>=2000).sort((a,b)=>b-a),groups=[];
 for(const x of v){const g=groups.find(g=>g[0]/x<=1.06);if(g)g.push(x);else groups.push([x])}
 if(!groups.length)return written||0;
 const near=g=>written?-Math.abs(g[g.length-1]-written)/written:0;
 groups.sort((a,b)=>written?near(b)-near(a):b.length-a.length||b[0]-a[0]);
 const g=groups[0],min=g[g.length-1];
 return written&&Math.abs(min-written)/written>0.06?written:min
}
// One tank from the sheets of a set: diameter, wall, bottom, roof, nozzles and hatches, the stair tower, the roof
// walkway with its railing, placed in millimetres. The frame of the montage scheme is the square around the tank
// with a margin; its centre is the tank axis.
const ROOF_ITEM=/крыш|светов|дыхат|клапан|замерн|огнепрег|вентил|сигнализ/iu;
function buildTank(pages){
 const tanks=pages.filter(p=>p.tank);if(!tanks.length)return null;
 // The plan with the callouts carries the items; the roof framing is counted on the plan with the most radial members.
 const plans=tanks.filter(p=>p.tank.plan);
 const score=p=>(p.tank.callouts?.length||0)*10+p.tank.plan.items.length+p.tank.plan.roofMembers;
 const plan=plans.slice().sort((a,b)=>score(b)-score(a))[0];
 const framing=plans.slice().sort((a,b)=>b.tank.plan.roofMembers-a.tank.plan.roofMembers)[0];
 const facade=tanks.find(p=>p.tank.facade);
 const passport=Object.assign({},...tanks.map(p=>p.tank.passport).filter(Boolean));
 const D=wallDiameter(tanks.flatMap(p=>p.tank.diameters||[]),passport.diameter);
 // Without a plan (scanned sheets give no lines) the tank stands on what the text says: its dispatch list or courses.
 if(!plan&&!tanks.some(p=>p.tank.byAngle?.length||p.tank.nozzleTable?.length||p.tank.fromClaude||p.tank.ship?.some(r=>/^(?:стенк|днищ)/iu.test(r.name))||p.tank.courses?.length)||!D)return null;
 const fc={...(facade?.tank.facade||{})};
 // The wall height: the vertical dimension the courses of the wall add up to (the tallest one often runs to the roof
 // top: then the rest above the wall is the roof rise), else the written one of the general data.
 const sums=tanks.flatMap(p=>p.tank.courses||[]).filter(c=>c.length>=2&&c.length<=20).map(c=>c.reduce((a,b)=>a+b,0));
 const byCourses=sums.find(v=>(fc.verticals||[]).includes(v)&&v!==fc.height)||(passport.height&&sums.find(v=>Math.abs(v-passport.height)<=Math.max(20,v*0.005)));
 if(byCourses){const rest=fc.height-byCourses;fc.rise=fc.height>byCourses&&rest<byCourses/3?fc.rise&&fc.rise<rest?fc.rise:rest:null;fc.height=byCourses}
 else if(passport.height&&(!fc.height||Math.abs(fc.height-passport.height)>passport.height*0.1)){fc.height=passport.height;fc.rise=null}
 const R=Math.round(D/2),H=fc.height||null;
 // Roof rise: written above the wall, else from the roof slope ("1:10" over the radius), else a usual cone.
 const rise=fc.rise??(fc.slope?Math.round(R/fc.slope/10)*10:Math.round(D/16));
 const heightOf=new Map((fc.items||[]).map(i=>[i.mark,i.z]));
 const pl=plan?.tank.plan||{items:[],roofMembers:0},placements=[],notes=[];
 const host=plan||tanks.find(p=>p.tank.byAngle?.length)||tanks.find(p=>p.tank.nozzleTable?.length)||tanks.find(p=>p.tank.facade)||tanks[0];
 const parts=tanks.map(p=>p.tank.parts).find(Boolean)||{};
 // The dispatch list of the set (Марка | Наименование | Кол.): the marks and the number of what is shipped.
 const ship=[];for(const r of tanks.flatMap(p=>p.tank.ship||[]).filter(r=>!r.made))if(!ship.some(o=>o.mark===r.mark&&o.name===r.name))ship.push(r);
 // Counts the dispatch list lost come from the "Требуется изготовить" tables of the mark sheets.
 for(const m of tanks.flatMap(p=>p.tank.ship||[]).filter(r=>r.made)){const r=ship.find(o=>o.mark===m.mark);if(r&&!r.qty)r.qty=m.qty}
 const shipRow=re=>ship.find(r=>re.test(r.name));
 const sheetOf=k=>tanks.map(p=>p.tank.sheets?.[k]).filter(Boolean).sort((a,b)=>(b.fromDevelopment?1:0)-(a.fromDevelopment?1:0))[0]||null;
 // The stair by its bearing written on the plan; when OCR lost it but the set has a stair (the parts table, the width
 // beside the wall on the facade), by the mass of lines outside the wall on the plan.
 const written=tanks.map(p=>p.tank.ladder).find(Boolean)||null;
 // Several tanks of the set on their layout sheet: each with what stands outside it (the stair) at its bearing.
 const lay=tanks.map(p=>p.tank.layout).find(Boolean)||null;
 const stairRow=shipRow(/лестниц/iu);
 const guess=!written&&(parts.ladder||fc.beside)&&plan?.tank.plan.outside?{bearing:plan.tank.plan.outside.bearing,kind:STAIR_KIND(parts.ladder?.name||"")||"shaft",name:parts.ladder?.name||"Лестница",guessed:true}
  :!written&&stairRow&&lay?.[0]?.outside!==undefined?{bearing:lay[0].outside,kind:STAIR_KIND(stairRow.name)||"shaft",name:stairRow.name,guessed:true}
  // The dispatch list ships a stair (its kind from the names: "Кронштейн (винтовая лестница)"), the plan shows where.
  :!written&&stairRow&&plan?.tank.plan.outside?{bearing:plan.tank.plan.outside.bearing,kind:STAIR_KIND(ship.map(r=>r.name).join(" "))||"shaft",name:stairRow.name,guessed:true}:null;
 const sheet=tanks.map(p=>p.tank.ladderSheet).find(Boolean)||{};
 const ladder=written||guess?{...(written||guess),sheet}:null;
 // The sheet of the roof platforms gives the width; other sheets only mention them.
 const platforms=tanks.map(p=>p.tank.platforms).filter(Boolean).sort((a,b)=>(b.width?1:0)-(a.width?1:0))[0]||null;
 const ladderWidth=ladder?(ladder.gap>0?ladder.gap:680)+(ladder.depth>0?ladder.depth:1300)+600:0;
 // A margin around the tank keeps nozzles, hatches and the stair tower inside the frame of the scheme.
 const M=Math.max(1500,ladderWidth+500),C=R+M;
 const at=(angle,r)=>({x:Math.round(C+Math.cos(angle*Math.PI/180)*r),y:Math.round(C+Math.sin(angle*Math.PI/180)*r)});
 // Bearing on the plan (0° at the top, clockwise) to the angle of at().
 const fromBearing=b=>90-b;
 const wallTop=H||6000;
 const partName=(k,fallback)=>parts[k]?.name||fallback;
 // The wall: the lowest-numbered mark on the facade is the wall in most sets ("поз. 1 — стенка").
 const marks=[...new Set([...(fc.items||[]).map(i=>i.mark),...pl.items.map(i=>i.mark)])];
 const series=m=>Number(/\d+/.exec(m)?.[0]||999);
 // A mark the dispatch list gives to something else is not the wall.
 // A mark read by OCR is taken only when it looks like one (letters and a number, or two letters): "ЛИЛ" is noise.
 const markOk=m=>m&&/^[А-ЯЁA-Z][А-ЯЁA-Zа-яё]{0,3}-?\d{1,3}(?:-\d{1,3})?[а-яa-z]?$|^[А-ЯЁA-Z][А-ЯЁа-яё]?$/u.test(m)?m:null;
 // A part shipped in pieces (днище П2-1 … П2-33): the mark they share.
 const groupMark=re=>{const rows=ship.filter(r=>re.test(r.name)&&r.mark);if(rows.length<2)return markOk(rows[0]?.mark);
  const heads=new Set(rows.map(r=>r.mark.replace(/-\d+$/,"")));return heads.size===1?markOk([...heads][0]):markOk(rows[0].mark)};
 const wallMark=groupMark(/^стенк/iu)||(ship.length?null:marks.sort((a,b)=>series(a)-series(b))[0])||"Стенка";
 // Sheets of the wall: the length the development repeats, else the sheet of the set; a course is one sheet high. The
 // vertical joints of neighbouring courses are staggered (ГОСТ 31385: apart by no less than 10 t, usually half a sheet).
 const wallSheet=sheetOf("wall"),bottomSheet=sheetOf("bottom");
 const L=wallSheet?.length||bottomSheet?.length||6000;
 const wallLayout=(k,h)=>({kind:"wall",sheet_len_mm:L,sheet_h_mm:h,shift_mm:k%2?Math.round(L/2):0,sheets:Math.ceil(Math.PI*D/L),
  from:wallSheet?"развёртка стенки":"лист 1500×6000 принят"});
 const hasBottom=Boolean(parts.bottom||tanks.some(p=>p.tank.bottom));
 // Courses of the wall: the column of dimensions that sums to the wall height (the wall development, its section).
 const courses=H?tanks.flatMap(p=>p.tank.courses||[]).find(c=>c.length>=2&&c.length<=20&&Math.abs(c.reduce((a,b)=>a+b,0)-H)<=Math.max(20,H*0.005)):null;
 const rolled=tanks.some(p=>p.tank.rolled);
 if(courses){
  let z=0;
  courses.forEach((h,k)=>{
   const lay=wallLayout(k,h);
   // Sheet by sheet (полистовая сборка): every sheet of the course is a placement of its own — a sector of the course
   // from its vertical joint, so that the mounting of each sheet is marked on the scheme. The last sheet closes the
   // circle (cut to the remainder). A rolled wall stays one course (it is unrolled, not assembled from sheets).
   const circ=Math.PI*D,n=Math.max(1,Math.ceil(circ/L-0.02));
   for(let j=0;j<(rolled?1:n);j++){
    const len=rolled?circ:Math.min(L,circ-j*L),start=rolled?0:((lay.shift_mm+j*L)%circ)/circ*360;
    placements.push({mark:"Пояс "+(k+1),name:"Пояс "+(k+1)+" стенки резервуара"+(rolled?"":" — лист "+(j+1)+" из "+n)+(wallMark!=="Стенка"?" ("+wallMark+")":""),type_key:"tank_wall",geometry_type:"shell",x_mm:C,y_mm:C,radius_mm:R,z0_mm:z,z1_mm:z+h,
     shell_open:true,...(rolled?{layout:lay}:{sector_start_deg:Math.round(start*100)/100,sector_deg:Math.round(len/circ*36000)/100,wall_sheet:j+1}),levels_from:"развёртка стенки",confidence:"medium",scheme_group:"tanks",
     notes:[(rolled?"":"Лист "+(j+1)+" из "+n+" ("+h+"×"+Math.round(len)+(len<L-1?", доборный":"")+"), ")+"пояс "+(k+1)+" из "+courses.length+": высота "+h+", отметки "+z+"…"+(z+h)+", стенка Ø"+D+"; листы "+h+"×"+L+", "+lay.sheets+" шт по окружности"+(lay.shift_mm?", стыки смещены на "+lay.shift_mm:"")+" ("+lay.from+")"]})
   }
   // The welds of the course: its vertical joints and the ring seam at its top (to the next course or the roof).
   placements.push({mark:"Ш-П"+(k+1),name:"Сварные швы пояса "+(k+1)+": вертикальные стыковые и кольцевой",type_key:"weld_butt",geometry_type:"shell",shell_open:true,x_mm:C,y_mm:C,radius_mm:R,z0_mm:z,z1_mm:z+h,
    levels_from:"развёртка стенки",confidence:"low",scheme_group:"welds",fitting_type:"weld",diameter_mm:12,layout:{...lay,kind:"wall_welds"},
    notes:["Вертикальных стыков "+lay.sheets+" (по листам "+L+"), кольцевой шов на +"+(z+h)+(k+1===courses.length?" (к опорному кольцу/крыше)":" (к поясу "+(k+2)+")")+"; ГОСТ 31385: стыковые, 100% контроль 1–2 поясов"]});
   z+=h
  })
 }else placements.push({mark:wallMark,name:partName("wall","Стенка")+" резервуара",type_key:"tank_wall",geometry_type:"shell",x_mm:C,y_mm:C,radius_mm:R,z0_mm:0,z1_mm:wallTop,
  shell_open:hasBottom||undefined,levels_from:H?"фасад резервуара":"нет отметок",confidence:H?"medium":"low",
  notes:["Стенка резервуара Ø"+D+(H?", высота "+H:", высота не найдена")]});
 // The bottom: a flat disc at 0,000 ("верх днища"), a little wider than the wall.
 // Its top is 0,000; the sheet thickness ("—8х1500х6000") goes down from there.
 const bt=Math.max(0,...tanks.map(p=>p.tank.bottom?.thickness||0))||null;
 const bs=bottomSheet||{width:1500,length:6000},bLayout={kind:"bottom",sheet_w_mm:bs.width,sheet_len_mm:bs.length,shift_mm:Math.round(bs.length/2),from:bottomSheet?"схема днища":"лист 1500×6000 принят"};
 const bottomMark=groupMark(/^днищ/iu)||"Днище";
 if(hasBottom||ship.some(r=>/^днищ/iu.test(r.name))){
  placements.push({mark:bottomMark,name:partName("bottom","Днище"),type_key:"tank_bottom",geometry_type:"plate",x_mm:C,y_mm:C,radius_mm:R+50,z0_mm:-(bt||bottomSheet?.thickness||10),z1_mm:0,
   levels_from:"верх днища 0,000",confidence:"medium",scheme_group:"bottom",layout:bLayout,notes:["Днище Ø"+(D+100)+" (стенка Ø"+D+" + окрайка), верх на отметке 0,000"+(bt?", лист "+bt+" мм":", толщина не найдена — принята 10")+"; листы "+bs.width+"×"+bs.length+" рядами, стыки смещены ("+bLayout.from+")"]});
  // Welds of the bottom (the joints of its sheets) and the corner weld of the wall to the bottom (уторный шов, both sides).
  placements.push({mark:"Ш-Д",name:"Сварные швы днища",type_key:"weld_butt",geometry_type:"plate",x_mm:C,y_mm:C,radius_mm:R+50,z0_mm:0,z1_mm:5,
   levels_from:"верх днища 0,000",confidence:"low",scheme_group:"welds",fitting_type:"weld",diameter_mm:10,layout:{...bLayout,kind:"bottom_welds"},notes:["Швы между листами днища "+bs.width+"×"+bs.length+"; ГОСТ 31385: контроль вакуумированием всех швов днища"]});
  placements.push({mark:"Ш-У",name:"Уторный шов (стенка — днище)",type_key:"weld_fillet",geometry_type:"shell",shell_open:true,x_mm:C,y_mm:C,radius_mm:R,z0_mm:0,z1_mm:20,
   levels_from:"верх днища 0,000",confidence:"medium",scheme_group:"welds",fitting_type:"weld",diameter_mm:14,layout:{kind:"ring"},notes:["Угловой шов приварки стенки к днищу с двух сторон"]})
 }
 // A bottom on beams (acid tanks: a gap under the bottom to see leaks): the dispatch list ships them as "Балки" by
 // lengths, the longest first (the middle pair), each mark twice — one on each side of the centre line. Parallel, at the
 // step of the beam sheet ("17х600=10200"), else the bottom diameter shared evenly; each as long as the chord.
 const bb=tanks.map(p=>p.tank.bottomBeams).find(Boolean)||null;
 const beamRows=ship.filter(r=>/^балк[аи]?$/iu.test(r.name.trim())&&r.qty>0);
 // Lines of beams may be made of two pieces each (a long beam and a short one butt-joined): then the sheet gives the count.
 const beamCount=bb?.count||beamRows.reduce((n,r)=>n+r.qty,0);
 if((bb||(beamRows.length>=3&&shipRow(/щит/iu)))&&beamCount>=4&&beamCount<=120){
  const Rb=R+50,step=bb?.step||Math.round(2*Rb/beamCount),h=bb?.height||200,top=-(bt||bottomSheet?.thickness||10);
  const marks=beamRows.flatMap(r=>Array.from({length:r.qty},()=>r.mark));
  const order=Array.from({length:beamCount},(_,k)=>k).sort((a,b)=>Math.abs(a-(beamCount-1)/2)-Math.abs(b-(beamCount-1)/2));
  order.forEach((k,i)=>{
   const y=(k-(beamCount-1)/2)*step,half=Math.sqrt(Math.max(0,Rb*Rb-y*y));if(half<200)return;
   placements.push({mark:marks[i]||"Балка",name:"Балка под днищем",type_key:"tank_bottom_beam",geometry_type:"beam",x_mm:Math.round(C-half),y_mm:Math.round(C+y),x2_mm:Math.round(C+half),y2_mm:Math.round(C+y),
    z0_mm:top,z1_mm:top,diameter_mm:h,levels_from:"низ днища",confidence:"low",scheme_group:"bottom",
    notes:["Балка под днищем, длина "+Math.round(2*half)+", шаг "+step+(bb?.step?"":" (принят по диаметру днища)")+", высота "+h+(bb?.height?"":" (принята)")+"; марки по ведомости — длиннейшие в середине, проверьте"]})
  });
  notes.push("Днище на балках: "+beamCount+" шт с шагом "+step+(bb?.step?"":" (принят)")+" — проверьте по схеме расположения балок")
 }
 // Stops round the wall foot ("Упор" ×66): spread evenly outside the wall on the bottom edge.
 const stopRow=shipRow(/^упор/iu);
 if(stopRow?.qty>=6&&stopRow.qty<=400)for(let k=0;k<stopRow.qty;k++){
  const a=at(fromBearing(360*k/stopRow.qty),R+60);
  placements.push({mark:stopRow.mark||"Упор",name:stopRow.name,type_key:"tank_stop",geometry_type:"column",x_mm:Math.round(a.x),y_mm:Math.round(a.y),z0_mm:0,z1_mm:110,
   levels_from:"верх днища 0,000",confidence:"low",scheme_group:"bottom",notes:["Упор "+(k+1)+" из "+stopRow.qty+" по окружности стенки, шаг принят равным — проверьте"]})
 }
 // A wall in rolls: unrolled on the bottom, the rolling frame goes back to the plant.
 if(tanks.some(p=>p.tank.rolled))notes.push("Стенка рулонная (полотнища): монтаж разворачиванием рулона на днище, каркас наворачивания — оснастка, не монтируется");
 // Roof members from the rim up to the centre.
 const roofItem=pl.items.find(i=>i.radial);
 // A shield roof: as many shields as the sheets say ("1/10 часть окружности"), each a sector of the roof cone from the
 // wall to the central ring (3D draws the sheeting); the first is the starting shield, the last the closing one.
 const roofs=tanks.map(p=>p.tank.roof).filter(Boolean);
 // Without "1/N часть окружности" the dispatch list counts the shields ("щит для крышки — 9", and as many deck panels
 // between them: "настил — 9").
 const shieldRow=shipRow(/щит/iu),panelRow=shipRow(/^(?:№\s*\d+\s+)?настил|^элемент\S*\s+покрыти/iu);
 const shipSectors=shieldRow?.qty>=4&&shieldRow.qty<=60?shieldRow.qty+(panelRow?.qty===shieldRow.qty?panelRow.qty:0):null;
 const sectors=roofs.map(r=>r.sectors).find(Boolean)||shipSectors||null,kinds=new Set(roofs.flatMap(r=>r.kinds||[])),cring=roofs.map(r=>r.ring).find(Boolean)||null;
 // The central ring of a shield roof the dispatch list ships ("Кольцо покрытия", "Конус центрального кольца"),
 // its size not read: about D/9.
 const ringRow=shipRow(/центр\S*\s+кольц|^кольц\S*\s+покрыти/iu),ringGuess=!cring&&sectors&&ringRow?Math.max(400,Math.round(D/18/10)*10):0;
 const top=wallTop+rise,rr=cring?Math.round(cring.outer/2):ringGuess;
 if(sectors){
  const SH={start:["Щ1","Укрупнённый начальный щит покрытия"],middle:["Щ2","Укрупнённый промежуточный щит покрытия"],end:["Щ3","Укрупнённый замыкающий щит покрытия"]};
  for(let k=0;k<sectors;k++){
   const kind=k===0&&kinds.has("start")?"start":k===sectors-1&&kinds.has("end")?"end":kinds.has("middle")?"middle":null;
   // Without kinds on the sheets the dispatch list names them: its shields, and its deck panels between them when it ships as many.
   const alt=!kind&&shipSectors&&panelRow?.qty===shieldRow.qty&&k%2===1;
   const [mark,name]=kind?SH[kind]:alt?[panelRow.mark||"Н",panelRow.name]:shieldRow?[shieldRow.mark||"Щ",shieldRow.name]:["Щ","Щит покрытия"];
   // Sector on the plan: from the bearing of its far edge, counter-clockwise in the angles of at().
   const step=360/sectors,start=((fromBearing(step*(k+1))%360)+360)%360;
   placements.push({mark,name,type_key:kind||shieldRow?"roof_shield":"tank_roof",geometry_type:"shell",shell_open:true,x_mm:C,y_mm:C,radius_mm:R,inner_radius_mm:rr||Math.round(R*0.05),
    sector_start_deg:Math.round(start*10)/10,sector_deg:Math.round(step*10)/10,z0_mm:wallTop,z1_mm:rr?Math.round(top-rise*rr/R):top,
    levels_from:"щиты покрытия",confidence:"medium",scheme_group:"roof",
    notes:["Щит "+(k+1)+" из "+sectors+" (1/"+sectors+" окружности), сектор "+Math.round(step*k)+"…"+Math.round(step*(k+1))+"° от оси I"+(fc.rise?"":fc.slope?", подъём по уклону 1:"+fc.slope:", подъём принят D/16 — проверьте")]})
  }
 }
 if(cring)placements.push({mark:roofs.some(r=>r.ck)?"ЦК1":markOk(ringRow?.mark)||"Кольцо",name:ringRow?.name||"Центральное кольцо покрытия",type_key:"roof_central_ring",geometry_type:"plate",x_mm:C,y_mm:C,radius_mm:rr,
  inner_radius_mm:cring.inner?Math.round(cring.inner/2):Math.round(rr*0.8),z0_mm:Math.round(top-rise*rr/R),z1_mm:Math.round(top-rise*rr/R)+20,
  levels_from:"щиты покрытия",confidence:"medium",scheme_group:"roof",notes:["Центральное кольцо Ø"+cring.outer+(cring.inner?" / Ø"+cring.inner:"")]});
 // Radial members of a frame roof: as many as the dispatch list ships ("Элемент крыши — 18"), else as the plan shows.
 const rafter=sectors?null:shipRow(/элемент\S*\s+(?:крыш|покрыти|каркас)|балк\S*\s+(?:крыш|покрыти)|стропил|радиальн/iu);
 const n=sectors?0:rafter?.qty>=4&&rafter.qty<=200?rafter.qty:(framing||plan)?.tank.plan.roofMembers||0;
 const roofMark=rafter?.mark||roofItem?.mark||(parts.roof||n>=6?"Крыша":null);
 const centralRow=shipRow(/центральн\S*\s+кольц/iu),supportRow=shipRow(/опорн\S*\s+кольц|кольц\S*\s+опорн/iu),deckRow=shipRow(/^покрыти[ея]?$|настил\S*\s+(?:крыш|кровл|покрыти)/iu);
 // A frame roof has its central ring too ("Центральное кольцо крыши"): its size from the sheets, else about D/9.
 const rIn=!sectors&&n>0?(rr||(centralRow?Math.max(400,Math.round(D/18/10)*10):0)):ringGuess;
 for(let k=0;k<n&&roofMark;k++){
  const a=360/n*k,p=at(a,R),q=rIn?at(a,rIn):{x:C,y:C};
  placements.push({mark:roofMark,name:rafter?rafter.name:roofItem?"Элемент крыши":partName("roof","Крыша")+" — радиальный элемент",type_key:"roof_rafter",geometry_type:"beam",x_mm:p.x,y_mm:p.y,x2_mm:q.x,y2_mm:q.y,
   z0_mm:wallTop,z1_mm:rIn?Math.round(top-rise*rIn/R):wallTop+rise,levels_from:rafter?"ведомость отправочных элементов":"фасад резервуара",confidence:"medium",scheme_group:"roof",
   notes:["Радиальный элемент крыши "+(k+1)+" из "+n+(rafter?" (по ведомости отправочных элементов)":"")+(fc.rise?"":fc.slope?", подъём по уклону 1:"+fc.slope:", подъём принят D/16 — проверьте")]})
 }
 if(rIn&&!cring)placements.push({mark:(centralRow||ringRow)?.mark||"Кольцо",name:(centralRow||ringRow)?.name||"Центральное кольцо крыши",type_key:"roof_central_ring",geometry_type:"plate",x_mm:C,y_mm:C,radius_mm:rIn,
  inner_radius_mm:Math.round(rIn*0.85),z0_mm:Math.round(top-rise*rIn/R),z1_mm:Math.round(top-rise*rIn/R)+20,levels_from:"ведомость отправочных элементов",confidence:"low",scheme_group:"roof",
  notes:["Центральное кольцо Ø"+2*rIn+" — размер по листу не прочитан, принят ≈ D/9, проверьте"]});
 // The sheeting of a frame roof (a cone over the members) and the support ring at the wall top.
 if(n>0&&roofMark)placements.push({mark:deckRow?.mark||"Настил",name:deckRow?.name||"Настил крыши",type_key:"roof_deck",geometry_type:"shell",shell_open:true,x_mm:C,y_mm:C,radius_mm:R,
  inner_radius_mm:rIn||Math.round(R*0.05),z0_mm:wallTop,z1_mm:rIn?Math.round(top-rise*rIn/R):top,levels_from:"фасад резервуара",confidence:"low",scheme_group:"roof",
  notes:["Настил крыши по радиальным элементам, конус от стенки к центру, подъём "+rise]});
 if(supportRow)placements.push({mark:supportRow.mark||"ОК",name:supportRow.name,type_key:"roof_support_ring",geometry_type:"plate",x_mm:C,y_mm:C,radius_mm:R+60,inner_radius_mm:R-90,
  z0_mm:wallTop-10,z1_mm:wallTop,levels_from:"верх стенки",confidence:"low",scheme_group:"rings",notes:["Опорное кольцо по верху стенки; сечение по узлу (условно 150 мм)"]});
 // Items: on the wall (near the circle) as a short branch outwards, on the roof as a short post.
 // Fittings are drawn as what they are (a pipe with a flange, a hatch with a cover, a valve, a ring), not as members:
 // the placement keeps its axis (out of the wall, up from the roof) and carries the kind and the outer diameter.
 const wallItem=({mark,name,angle,du,size,z,from,note,length})=>{
  const f=fittingOf(name,du,size);
  if(f.type==="ring"){ring({mark,name,z,note});return}
  // A foam generator sits on the top course whatever height is given.
  const zz=f.type==="foam"&&!(z>wallTop*0.6)?Math.round(wallTop-600):z;
  const len=length>=60&&length<=3000?length:OUTREACH[f.type]||250,p=at(angle,R),q=at(angle,R+len);
  placements.push({mark,name,geometry_type:"beam",x_mm:p.x,y_mm:p.y,x2_mm:q.x,y2_mm:q.y,z0_mm:zz,z1_mm:zz,levels_from:from,
   confidence:from==="фасад резервуара"||/спецификац|база знаний/.test(from)?"medium":"low",scheme_group:"nozzles",
   fitting_type:f.type,diameter_mm:f.d_mm,notes:[note]})
 };
 const roofAt=(r)=>Math.round(wallTop+rise*(1-Math.max(0,Math.min(1,r))));
 const roofItemAt=({mark,name,angle,r,du,size,note,length})=>{
  const f=fittingOf(name,du,size);
  const len=length>=60&&length<=3000?length:OUTREACH[f.type]||250,p=at(angle,R*r),z=roofAt(r);
  placements.push({mark,name,geometry_type:"column",x_mm:p.x,y_mm:p.y,z0_mm:z,z1_mm:z+len,levels_from:"крыша резервуара",
   confidence:"low",scheme_group:"nozzles",fitting_type:f.type,diameter_mm:f.d_mm,notes:[note]})
 };
 // Stiffening, wind and spray rings: a ring round the wall at their level.
 const ring=({mark,name,z,note})=>{
  const w=/орошен/iu.test(name)?150:300;
  placements.push({mark,name,geometry_type:"plate",x_mm:C,y_mm:C,radius_mm:R+w,inner_radius_mm:R,z0_mm:z,z1_mm:z+10,
   levels_from:"нет отметок",confidence:"low",scheme_group:"nozzles",fitting_type:"ring",notes:[note]})
 };
 const FITTING_WORDS=new RegExp(FITTINGS.map(([,re])=>re.source).join("|"),"iu");
 for(const i of pl.items){
  if(i.mark===wallMark||roofItem&&i.mark===roofItem.mark)continue;
  // A mark of the dispatch list is what the list names it: the wall, the roof members, the rings and the rungs are
  // built above; a hatch or a nozzle keeps its name and Ду.
  const row=ship.find(r=>r.mark===i.mark);
  // A service platform at the wall ("По2" of the series "Площадка обслуживания По1"): a deck out from the wall at that angle.
  const series=String(i.mark).replace(/\d+$/,""),deckOf=row&&/^площад/iu.test(row.name)?row:series.length>=2&&ship.find(r=>r.mark?.startsWith(series)&&/^площад/iu.test(r.name));
  if(deckOf&&i.r>=0.85){
   const z=heightOf.get(i.mark),p=at(i.angle,R+100),q=at(i.angle,R+1100);
   placements.push({mark:i.mark,name:row?.name||"Площадка обслуживания "+i.mark,type_key:"platform",fitting_type:"deck",diameter_mm:1000,geometry_type:"beam",x_mm:p.x,y_mm:p.y,x2_mm:q.x,y2_mm:q.y,
    z0_mm:Number.isFinite(z)?z:1500,z1_mm:Number.isFinite(z)?z:1500,levels_from:Number.isFinite(z)?"фасад резервуара":"нет отметок",confidence:"low",scheme_group:"platforms",
    notes:["Площадка обслуживания у стенки, угол "+i.angle+"°, вынос 1000"+(Number.isFinite(z)?"":"; отметка не найдена — поставлена на 1500, проверьте")]});
   continue
  }
  if(row&&!FITTING_WORDS.test(row.name)&&!row.fitting)continue;
  const du=i.du||row?.du||null;
  if(i.r>=0.9){
   const z=heightOf.get(i.mark),zz=Number.isFinite(z)?Math.max(0,Math.min(wallTop,z)):Math.round(wallTop/2);
   const label=row?row.name:fittingOf("",du,null).label+(du?" Ду"+du:"");
   wallItem({mark:i.mark,name:label,angle:i.angle,du,z:Number.isFinite(z)?zz:axisDefault(label,du,wallTop),from:Number.isFinite(z)?"фасад резервуара":"нет отметок",
    note:"На стенке, угол "+i.angle+"°"+(du?", Ду"+du:"")+(Number.isFinite(z)?"":" — высота по ГОСТ (минимальная), проверьте")})
  }else roofItemAt({mark:i.mark,name:row?row.name:(du>=500?"Люк":"Патрубок")+(du?" Ду"+du:"")+" на крыше",angle:i.angle,r:i.r,du,note:"На крыше"+(du?", Ду"+du:"")})
 }
 // Callouts of the plan "N — Патрубок … Ду 150 (323°)" and the rows of the specification of hatches and nozzles
// (α, and A: the axis height on the wall or the distance from the axis on the roof) — one item per position.
 const callouts=plan?.tank.callouts||[];
 // Rows of the specification; a position missing there may come from another source (Claude's reading).
 const table=[];for(const t of tanks.map(p=>p.tank.nozzleTable).filter(Boolean))for(const r of t)if(!table.some(o=>o.pos===r.pos))table.push(r);
 const gap=(a,b)=>Math.abs(((a-b+540)%360)-180);
 // A callout that names no fitting and gives no Ду (a note "Развертка конусной части…") is not an item.
 const items=callouts.filter(c=>c.du||FITTING_WORDS.test(c.name||"")||ROOF_ITEM.test(c.name||"")).map(c=>({...c}));
 for(const row of table){
  let it=items.find(i=>i.pos===row.pos);
  // A callout whose number was not read: the one at the same bearing with a fitting Ду.
  if(!it)it=items.find(i=>i.pos===null&&gap(i.bearing,row.bearing)<=3&&(!i.du||!row.du||i.du===row.du));
  if(!it){it={pos:row.pos,name:row.name,du:row.du,size:row.size,bearing:row.bearing,leader:null,fromTable:true};items.push(it)}
  it.pos=row.pos;it.row=row;it.bearing=row.bearing;
  if(row.du)it.du=row.du;if(row.size)it.size=row.size;
  if(row.name&&row.name.length>(it.name||"").length)it.name=row.name
 }
 const used=new Set();
 for(const c of items.sort((a,b)=>(a.pos??99)-(b.pos??99)||a.bearing-b.bearing)){
  // A table that letters its items ("А — Загрузочный") keeps the letters.
  let mark=c.row?.mark||(c.pos!==null?"П"+c.pos:"П "+c.bearing+"°");
  for(let k=2;used.has(mark);k++)mark=(c.pos!==null?"П"+c.pos:"П "+c.bearing+"°")+"-"+k;
  used.add(mark);
  const name=c.name+(c.du&&!/Ду/u.test(c.name)&&!c.size?" Ду"+c.du:"");
  const onRoof=c.row?c.row.roof:c.leader?c.leader.r<0.9:ROOF_ITEM.test(c.name);
  const where="поз. "+(c.pos??"?")+", угол "+c.bearing+"°"+(c.check&&!c.row?" ("+c.check+")":"")+(c.fromTable?", только в спецификации":"");
  const A=c.row?.a;
  if(onRoof){
   const r=A>0&&A<R?A/R:c.leader?Math.max(0.15,Math.min(0.95,c.leader.r)):0.75;
   roofItemAt({mark,name,angle:fromBearing(c.bearing),r,du:c.du,size:c.size,length:c.row?.b,
    note:"На крыше, "+where+(A>0&&A<R?", A="+A+" от оси ("+(c.row?.from||"спецификация")+")":c.leader?"":"; радиус не найден — принят 0,75R, проверьте")})
  }else{
   const manhole=/люк\s*-?\s*лаз|лаз(?![а-яё])/iu.test(c.name);
   const z=A>0&&A<wallTop?A:axisDefault(c.name,c.du,wallTop);
   const fromTable=A>0&&A<wallTop;
   wallItem({mark,name,angle:fromBearing(c.bearing),du:c.du,size:c.size,length:c.row?.b,z,from:fromTable?(c.row?.from||"спецификация люков и патрубков"):"нет отметок",
    note:"На стенке, "+where+"; "+(fromTable?"ось на "+A+" от днища ("+(c.row?.from||"спецификация")+")":"высота "+(manhole?"оси люка-лаза 1-го пояса принята 750":"не указана — минимальная по ГОСТ 31385 для Ду"+(c.du||"?")+": "+z)+", проверьте")})
  }
 }
 // Items given by their bearing in one text ("… Ду 150(323°)") when the plan has no readable callouts.
 if(!items.length){
  const seen=new Set();
  for(const i of tanks.flatMap(p=>p.tank.byAngle||[])){
   if(seen.has(i.mark))continue;seen.add(i.mark);
   const angle=fromBearing(i.bearing);
   if(ROOF_ITEM.test(i.name))roofItemAt({mark:i.mark,name:i.name,angle,r:0.75,du:i.du,note:"По углу "+i.bearing+"° с плана"});
   else wallItem({mark:i.mark,name:i.name,angle,du:i.du,z:axisDefault(i.name,i.du,wallTop),from:"нет отметок",
    note:"По углу "+i.bearing+"° с плана; высота не указана — внизу стенки, проверьте"})
  }
 }
 // The shaft stair beside the wall at its bearing (ГОСТ 31385 / ГОСТ Р 52910, sheets of a typical shaft stair Ш1):
 // a frame of four posts (depth from the wall × width along it), landings every 1200 mm (the first rise up to 1800),
 // flights 700 wide in the two halves of the shaft, back and forth (no steeper than 50°), cage hoops round the shaft at
 // every landing and a bridge from the top landing to the wall. Sizes from the drawings, otherwise those of Ш1.
 // A ring (spiral) stair along the wall and a straight single flight (ГОСТ 31385 / ГОСТ Р 52910): resting on the wall,
 // 100 from it, 700 wide (no less), no steeper than 50° (taken 45°), the foot 100–250 over the ground; a straight flight
 // is for walls up to 7.5 m, a ring stair over 7.5 m has a landing at least every 6 m of height. The flight runs
 // clockwise on the plan from the written bearing (the foot of the stair) and ends on the walkway; each flight is drawn
 // as chords of the circle, one record per chord, so that the 3D treads follow the wall.
 const alongWall=({kind,foot,top,bearing,width,name,conf,from})=>{
  const w=width||700,gapW=100,rc=R+gapW+w/2,H=top-foot,tan=Math.tan(45*Math.PI/180),notes0=[];
  const add=(o)=>placements.push({mark:stairRow?.mark||"Лестница",levels_from:from,confidence:conf,scheme_group:"stairs",...o});
  let flights=kind==="single"||H<=7500?1:Math.ceil(H/6000);
  if(kind==="single"&&H>7500)notes0.push("высота "+H+" больше 7,5 м — по ГОСТ нужна кольцевая или шахтная лестница, проверьте");
  const LAND=1000,rise=H/flights;
  // Bearing (clockwise from the top of the plan) of a point s mm along the stair centre line.
  let s=0;const deg=len=>len/rc*180/Math.PI,pos=(b,r)=>at(fromBearing(b),r);
  if(kind==="single"){
   // A straight flight: tangent to the wall, from the foot to the top landing.
   const run=Math.ceil(H/tan),b=bearing,p0=pos(b,rc),dir=fromBearing(b)+90,rad=dir*Math.PI/180;
   const q={x:Math.round(p0.x-Math.cos(rad)*run),y:Math.round(p0.y-Math.sin(rad)*run)};
   add({name:name+" — марш",type_key:"stair_flight",fitting_type:"flight",diameter_mm:w,geometry_type:"brace",x_mm:p0.x,y_mm:p0.y,x2_mm:q.x,y2_mm:q.y,z0_mm:foot,z1_mm:top,
    notes:["Одномаршевая лестница вдоль стенки, ширина "+w+", уклон 45°, "+foot+" → +"+top+(notes0.length?"; "+notes0.join("; "):"")]});
   return
  }
  for(let k=0;k<flights;k++){
   const z0=Math.round(foot+rise*k),z1=Math.round(foot+rise*(k+1)),run=rise/tan,chords=Math.max(1,Math.ceil(run/1500));
   for(let c=0;c<chords;c++){
    const b0=bearing+deg(s+run*c/chords),b1=bearing+deg(s+run*(c+1)/chords),p=pos(b0,rc),q=pos(b1,rc);
    add({name:name+" — марш "+(k+1),type_key:"stair_flight",fitting_type:"flight",diameter_mm:w,geometry_type:"brace",x_mm:p.x,y_mm:p.y,x2_mm:q.x,y2_mm:q.y,
     z0_mm:Math.round(z0+(z1-z0)*c/chords),z1_mm:Math.round(z0+(z1-z0)*(c+1)/chords),
     notes:["Кольцевая лестница, марш "+(k+1)+" из "+flights+": "+z0+" → "+z1+", ширина "+w+", уклон 45°, в 100 от стенки"+(notes0.length?"; "+notes0.join("; "):"")]})
   }
   s+=run;
   if(k+1<flights){
    // An intermediate landing (no more than 6 m apart): two edge beams along the wall.
    for(const r of [R+gapW,R+gapW+w]){const p=pos(bearing+deg(s),r),q=pos(bearing+deg(s+LAND),r);
     add({name:name+" — промежуточная площадка",type_key:"stair_landing",geometry_type:"beam",x_mm:p.x,y_mm:p.y,x2_mm:q.x,y2_mm:q.y,z0_mm:z1,z1_mm:z1,notes:["Промежуточная площадка на +"+z1+" (ГОСТ 31385: не реже чем через 6 м)"]})}
    s+=LAND
   }
  }
 };
 const levels=[...new Set(tanks.flatMap(p=>p.tank.facade?.levels||[]))];
 // The level of the walkway round the roof: above the wall top first (the wall top itself is often among the marks
 // of the section); a deck level with it stays possible.
 const walkLevel=()=>{const lv=(platforms?.levels||[]).filter(v=>v>=wallTop&&v<=wallTop+1500).sort((a,b)=>a-b);return lv.find(v=>v>wallTop)??lv[0]??wallTop+380};
 let stairAt=null;
 if(ladder){
  const sh=ladder.sheet||{};
  const foot=ladder.foot??(sh.foot!==null&&sh.foot!==undefined?sh.foot:undefined)??levels.filter(v=>v<0&&v>-1000).sort((a,b)=>b-a)[0]??0;
  // The top: given (knowledge, Claude) → the height of the shaft on its sheet → a plausible level on the stair sheet
  // (OCR misreads them: "+6,940" for "+8,940") → the level beside the wall top on the facade.
  const top=ladder.top>wallTop-300?ladder.top:sh.height>wallTop*0.7?foot+sh.height:sh.top>wallTop-300&&sh.top<wallTop+1500?sh.top
   :levels.filter(v=>v>wallTop&&v<=wallTop+1500).sort((a,b)=>a-b)[0]??wallTop+200;
  const kind=ladder.kind||"shaft";
  if(kind!=="shaft")alongWall({kind,foot,top,bearing:ladder.bearing,width:ladder.width>=600&&ladder.width<=1200?ladder.width:0,name:partName("ladder",ladder.name),
   conf:ladder.guessed?"low":"medium",from:ladder.fromBase?"база знаний":"фасад резервуара"});
  else{
  const depth=ladder.depth>0?ladder.depth:1300,width=ladder.width>0?ladder.width:sh.width||2100,gap=ladder.gap>0?ladder.gap:680;
  const a=fromBearing(ladder.bearing),rad=a*Math.PI/180,u={x:Math.cos(rad),y:Math.sin(rad)},v={x:-Math.sin(rad),y:Math.cos(rad)};
  // along — from the wall outwards, side — along the wall.
  const pt=(along,side)=>({x:Math.round(C+u.x*(R+along)+v.x*side),y:Math.round(C+u.y*(R+along)+v.y*side)});
  const name=partName("ladder",ladder.name),conf=ladder.guessed?"low":"medium",from=ladder.fromBase?"база знаний":"фасад резервуара";
  const note="Шахтная лестница "+depth+"×"+width+", угол "+ladder.bearing+"°"+(ladder.guessed?" (по плану, надпись не прочитана — проверьте)":"")+", от "+foot+" до +"+top;
  const add=(o)=>placements.push({mark:stairRow?.mark||"Лестница",levels_from:from,confidence:conf,scheme_group:"stairs",type_key:"stair_shaft",...o});
  const near=gap,far=gap+depth,hw=width/2;
  for(const [s,t] of [[near,-hw],[near,hw],[far,-hw],[far,hw]]){const p=pt(s,t);add({name:name+" — стойка каркаса",geometry_type:"column",x_mm:p.x,y_mm:p.y,z0_mm:foot,z1_mm:top+1250,notes:[note]})}
  // Landings: the first rise takes what is left over whole 1200 mm rises.
  // Rises of 1200 with the first one 1200–1800 (as on Ш1: 1800 + 6×1200 = 9000); otherwise equal rises up to 1200.
  const pitch=sh.step||1200,H=top-foot,given=sh.first&&(H-sh.first)%pitch===0?sh.first:null;
  const steps=given?(H-given)/pitch:Math.max(1,Math.ceil((H-1800)/pitch)),first=given||H-steps*pitch,stops=[foot];
  if(first>=1200)for(let k=0;k<=steps;k++)stops.push(foot+first+k*pitch);
  else{const n=Math.ceil(H/1200);for(let k=1;k<=n;k++)stops.push(Math.round(foot+H*k/n))}
  // Landing decks (настил ПВ): at the turn of the flights, across the whole shaft, half its depth, at the end where the
  // flight below arrives (flights alternate towards the wall and away from it); the top landing covers the shaft.
  const deck=(s0,s1,z,label,w)=>{const p=pt(s0,0),q=pt(s1,0);add({name:name+" — "+label,type_key:"stair_landing",fitting_type:"deck",diameter_mm:w||width,geometry_type:"beam",
   x_mm:p.x,y_mm:p.y,x2_mm:q.x,y2_mm:q.y,z0_mm:z,z1_mm:z,notes:[label[0].toUpperCase()+label.slice(1)+" на +"+z+", ширина "+(w||width)]})};
  stops.slice(1).forEach((z,k,all)=>{
   if(k===all.length-1)deck(near,far,z,"верхняя площадка");
   else if(k%2===0)deck(near,near+depth/2,z,"площадка");else deck(far-depth/2,far,z,"площадка")
  });
  for(const z of stops.slice(1)){
   for(const t of [-hw,hw]){const p=pt(near,t),q=pt(far,t);add({name:name+" — балка площадки",type_key:"stair_landing",geometry_type:"beam",x_mm:p.x,y_mm:p.y,x2_mm:q.x,y2_mm:q.y,z0_mm:z,z1_mm:z,notes:["Площадка лестницы на +"+z]})}
   // A cage hoop round the shaft (ПК), from the axis of the shaft.
   const c=pt(gap+depth/2,0),r=Math.round(Math.hypot(depth/2,hw)+95);
   add({name:name+" — кольцо ограждения шахты",type_key:"stair_shaft",geometry_type:"plate",x_mm:c.x,y_mm:c.y,radius_mm:r,inner_radius_mm:r-30,z0_mm:z,z1_mm:z+10,notes:["Поперечное кольцо Ø"+2*r+" на +"+z]})
  }
  // Flights: two stringers 700 apart, in alternate halves of the shaft, running across its depth.
  const run=depth-200,tan50=Math.tan(50*Math.PI/180);
  for(let k=0;k+1<stops.length;k++){
   const z0=stops[k],z1=stops[k+1],side=(k%2?1:-1)*(125+350),inward=k%2===0;
   // The bottom flight is longer: it starts outside the frame, so that it is no steeper than 50°.
   const len=k===0?Math.max(run,Math.ceil((z1-z0)/tan50)):run;
   const s0=inward?near+100+len:near+100,s1=inward?near+100:near+100+len,slope=Math.round(Math.atan2(z1-z0,len)*180/Math.PI);
   // One record per flight: 3D draws its two stringers, treads and handrails at the width (diameter_mm).
   const p=pt(s0,side),q=pt(s1,side);
   add({name:name+" — марш",type_key:"stair_flight",fitting_type:"flight",diameter_mm:700,geometry_type:"brace",x_mm:p.x,y_mm:p.y,x2_mm:q.x,y2_mm:q.y,z0_mm:z0,z1_mm:z1,confidence:"low",
    notes:["Марш "+(k+1)+" из "+(stops.length-1)+": "+z0+" → "+z1+", ширина 700, уклон "+slope+"°"+(slope>50?" — круче 50° по ГОСТ 31385, проверьте":"")+", ступени через "+Math.round((z1-z0)/Math.max(1,Math.ceil((z1-z0)/250)))+" (не более 250)"]})
  }
  // The bridge from the top landing over the wall top to the roof walkway (Б3 on the stair sheets). A walkway higher
  // than the top landing (РВС-700: Ш1 to +8,970, walkway +9,320 on the roof slope) is reached by a short flight at
  // the wall: the bridge stops where that flight starts, the flight rises to the walkway at the wall face.
  const walk=(platforms||parts.platforms)?walkLevel():null,up=walk!==null&&walk-top>150&&walk-top<=1200?walk-top:0;
  if(up){
   const len=Math.max(300,Math.round(up/Math.tan(45*Math.PI/180))),p=pt(Math.min(near-100,len),0),q=pt(0,0);
   deck(near,Math.min(near-100,len),top,"переход на крышу",700);
   add({name:name+" — марш на площадку крыши",type_key:"stair_flight",fitting_type:"flight",diameter_mm:700,geometry_type:"brace",x_mm:p.x,y_mm:p.y,x2_mm:q.x,y2_mm:q.y,z0_mm:top,z1_mm:walk,confidence:"low",
    notes:["Подъём с верхней площадки +"+top+" на площадку крыши +"+walk+": "+Math.max(1,Math.ceil(up/250))+" ступ. — по узлу перехода проверьте"]})
  }else deck(near,platforms?.offset>0?-platforms.offset:0,top,"переход на крышу",700);
  stairAt={bearing:ladder.bearing,width,top}
  }
 }
 // The walkway round the roof edge: a ring at its level, as wide as its section shows, with a railing at the rim.
 if(platforms||parts.platforms){
  const level=walkLevel();
  const width=platforms?.width||1000,rail=platforms?.rail||1100;
  // The section "665 + 700": the walkway deck stands off the wall by the first part; the strip over the roof edge has
  // the outer railing standing on the wall top.
  const offset=tanks.map(p=>p.tank.platforms?.offset).find(v=>v>0&&v<width)||0,inner=Math.max(500,R-width),outer=R-offset;
  const deckRow=shipRow(/^площад/iu),railRow=shipRow(/^огражд/iu);
  placements.push({mark:markOk(deckRow?.mark)||"Площадка",name:partName("platforms","Площадка на крыше"),type_key:"platform",geometry_type:"plate",x_mm:C,y_mm:C,radius_mm:outer,inner_radius_mm:inner,
   z0_mm:level,z1_mm:level+40,levels_from:platforms?"схема площадок":"нет отметок",confidence:platforms?"medium":"low",scheme_group:"platforms",
   notes:["Кольцевая площадка по крыше: настил "+(outer-inner)+(offset?", в "+offset+" от стенки":"")+(platforms?.width?"":" (ширина принята)")+", отметка +"+level]});
  // The landing between the stair and the walkway (уз. 5): over the roof edge, as wide as the stair beside the wall.
  if(stairAt&&offset){const a=fromBearing(stairAt.bearing),p=at(a,R),q=at(a,outer),w=fc.beside>stairAt.width?fc.beside:stairAt.width+400;
   placements.push({mark:"Площадка",name:"Площадка у шахтной лестницы",type_key:"platform",fitting_type:"deck",diameter_mm:w,geometry_type:"beam",x_mm:p.x,y_mm:p.y,x2_mm:q.x,y2_mm:q.y,
    z0_mm:level,z1_mm:level,levels_from:"схема площадок",confidence:"low",scheme_group:"platforms",notes:["Площадка от шахтной лестницы до кольцевой площадки, ширина "+w+", отметка +"+level]})}
  // Railings on both edges of the walkway (ГОСТ: handrail 1.25 m over the deck, posts no farther than 2.5 m apart,
  // two intermediate rails, a toe board): drawn by 3D as posts, rails and the toe board; diameter_mm carries the post step.
  // A checked entry keeps the drawing's handrail height (old sets: 1000); a value read from a sheet is raised to the 1.25 m of ГОСТ.
  const h=platforms?.exact&&platforms?.rail>=900?platforms.rail:Math.max(1250,rail),step=platforms?.post>0?platforms.post:1000;
  // The outer railing stands on the wall top when the deck is set off the wall; its handrail is level with the inner one.
  // The outer railing is open where the bridge from the stair comes over the wall (700 wide, 150 clear each side).
  const gap=stairAt?Math.round((350+150)/R*180/Math.PI*10)/10:0,open=stairAt?{sector_start_deg:Math.round((((fromBearing(stairAt.bearing)+gap)%360)+360)%360*10)/10,sector_deg:360-2*gap}:{};
  for(const [r,edge,z0,arc] of [[R,"наружный край",offset?wallTop:level,open],[inner,"внутренний край",level,{}]])
   placements.push({mark:markOk(railRow?.mark)||"Ограждение",name:partName("railing","Ограждение")+" — "+edge,geometry_type:"shell",shell_open:true,x_mm:C,y_mm:C,radius_mm:r,...arc,
    z0_mm:z0,z1_mm:level+h,levels_from:platforms?"схема площадок":"нет отметок",confidence:"low",scheme_group:"guards",type_key:"railing",fitting_type:"railing",diameter_mm:step,
    notes:["Ограждение площадки ("+edge+"): поручень +"+h+" от настила, стойки через "+step+", промежуточные элементы, бортовая полоса"]});
 }
 // The railing round the roof edge the dispatch list ships ("Ограждение кровли") when no walkway carries one: on the
 // wall top, 1.25 m, open where the stair comes up.
 const roofRail=shipRow(/огражд\S*\s+(?:кровл|крыш|покрыти)/iu);
 if(roofRail&&!placements.some(e=>e.type_key==="railing")){
  const gap=stairAt?Math.round((350+150)/R*180/Math.PI*10)/10:0,open=stairAt?{sector_start_deg:Math.round((((fromBearing(stairAt.bearing)+gap)%360)+360)%360*10)/10,sector_deg:360-2*gap}:{};
  placements.push({mark:roofRail.mark||"Ограждение",name:roofRail.name,type_key:"railing",geometry_type:"shell",shell_open:true,x_mm:C,y_mm:C,radius_mm:R,...open,z0_mm:wallTop,z1_mm:wallTop+1250,
   levels_from:"верх стенки",confidence:"low",scheme_group:"guards",fitting_type:"railing",diameter_mm:1000,notes:["Ограждение по краю крыши на верху стенки, поручень 1250"+(stairAt?", проход у лестницы":"")]})
 }
 // Hatches and nozzles of the dispatch list that no plan or table placed: shown all the same, spread round the wall
 // (away from the stair), at the lowest height ГОСТ 31385 allows for their Ду — their places are to be checked.
 const placedNames=new Set(placements.map(e=>e.name));
 // Parts ("Элементы люка", "Патрубки" without Ду) are not items when the table or the plan placed the fittings.
 const placedFit=placements.some(e=>["nozzle","manhole","hatch","valve","sensor","foam"].includes(e.fitting_type));
 const loose=ship.filter(r=>(FITTING_WORDS.test(r.name)||r.fitting)&&!/^элемент/iu.test(r.name)&&!(placedFit&&!r.du&&/^(?:патрубк\S*|люк\S*|штуцер\S*)$/iu.test(r.name.trim()))&&!/^(?:площад|огражд|лестниц)/iu.test(r.name)&&!placedNames.has(r.name)&&!placements.some(e=>r.mark&&e.mark===r.mark)&&!/катушк/iu.test(r.name));
 const looseList=loose.flatMap(r=>Array.from({length:Math.min(6,r.qty>0?r.qty:1)},(_,i)=>({...r,i})));
 looseList.forEach((r,j)=>{
  let b=(15+360*j/Math.max(1,looseList.length))%360;if(stairAt&&Math.abs(((b-stairAt.bearing+540)%360)-180)<25)b=(b+40)%360;
  const du=r.du||Number(/Ду\s*(\d{2,4})/iu.exec(r.name)?.[1])||null,mark=r.mark||fittingOf(r.name,du,null).label.split(" ")[0]+(du?du:"");
  const note="Место по листам не найдено — поставлено условно на "+Math.round(b)+"°, проверьте по схеме расположения патрубков";
  if(/вертикальн/iu.test(r.name)||ROOF_ITEM.test(r.name))roofItemAt({mark,name:r.name,angle:fromBearing(b),r:0.7,du,note:"На крыше. "+note});
  else wallItem({mark,name:r.name,angle:fromBearing(b),du,z:axisDefault(r.name,du,wallTop),from:"нет отметок",note:"На стенке. "+note})
 });
 if(looseList.length)notes.push("По ведомости без места на листах: "+loose.map(r=>r.name+(r.qty>1?" ×"+r.qty:"")).join(", ")+" — поставлены условно, проверьте");
 // A ring platform outside the wall top on brackets (small tanks, ГОСТ 31385: deck no narrower than 700, railing 1.25 m):
 // the dispatch list ships "Площадка", "Кронштейн", "Настил", "Ограждение площадки"; the facade's overall width (the
 // platforms on both sides, "8246" over a roof of 6856) gives how far it reaches out.
 const outRow=!(platforms||parts.platforms)&&shipRow(/^площад/iu),brRow=shipRow(/кронштейн/iu);
 // Its level and overall diameter when known (a checked entry: the platform one course below the wall top).
 const op=tanks.map(p=>p.tank.outerPlatform).find(Boolean)||null;
 const W=op?.diameter||Math.max(0,...tanks.flatMap(p=>p.tank.diameters||[]).filter(v=>v>=D*1.1&&v<=D*1.6));
 if(outRow&&(brRow||W)){
  const ro=W?Math.round(W/2):R+800,ri=Math.max(R+50,ro-(W?Math.min(1200,ro-R-50):750)),level=op?.level||wallTop;
  const railRow=shipRow(/огражд/iu),deckRow2=shipRow(/^настил/iu),k=outRow.qty>=2&&outRow.qty<=24?outRow.qty:0;
  placements.push({mark:outRow.mark||"Площадка",name:outRow.name+(k?" ("+k+" секций)":"")+(deckRow2?", настил "+deckRow2.mark:""),type_key:"platform",geometry_type:"plate",x_mm:C,y_mm:C,radius_mm:ro,inner_radius_mm:ri,
   z0_mm:level,z1_mm:level+40,levels_from:"верх стенки",confidence:"low",scheme_group:"platforms",
   notes:["Кольцевая площадка снаружи по верху стенки: от R"+ri+" до R"+ro+" (ширина "+(ro-ri)+(W?", по габариту фасада "+W:", принята")+"); охват по плану и отметку проверьте"]});
  placements.push({mark:railRow?.mark||"Ограждение",name:railRow?.name||"Ограждение площадки",type_key:"railing",geometry_type:"shell",shell_open:true,x_mm:C,y_mm:C,radius_mm:ro,
   z0_mm:level,z1_mm:level+(op?.rail||1250),levels_from:"верх стенки",confidence:"low",scheme_group:"guards",fitting_type:"railing",diameter_mm:1000,
   notes:["Ограждение по наружному краю кольцевой площадки, поручень "+(op?.rail||1250)]});
  const nb=brRow?.qty>=3&&brRow.qty<=200?brRow.qty:Math.max(6,Math.round(2*Math.PI*ro/1500));
  for(let j=0;j<nb;j++){const a=360/nb*j,p=at(a,R),q=at(a,ro);
   placements.push({mark:brRow?.mark||"Кр",name:brRow?.name||"Кронштейн площадки",type_key:"bracket",geometry_type:"brace",x_mm:p.x,y_mm:p.y,x2_mm:q.x,y2_mm:q.y,z0_mm:level-Math.round((ro-R)*0.8),z1_mm:level,
    levels_from:"верх стенки",confidence:"low",scheme_group:"brackets",notes:["Кронштейн "+(j+1)+" из "+nb+(brRow?.qty?"":" (число принято через 1,5 м)")+": подкос от стенки к краю площадки"]})}
 }
 // Rungs on the wall (ступени-скобы, ГОСТ 31385: a ladder of rungs every 300 mm) under the hatch they lead to: the
 // vertical ladder from the ground up the wall to the roof hatch near the rim.
 const rungs=shipRow(/ступен\S*\s*-?\s*скоб|скоб\S*\s+ходов/iu);
 if(rungs?.qty>=3){
  const hatch=placements.filter(e=>["manhole","hatch"].includes(e.fitting_type)&&e.z0_mm>=wallTop-100).map(e=>({e,r:Math.hypot(e.x_mm-C,e.y_mm-C)})).sort((a,b)=>b.r-a.r)[0];
  const ang=hatch?Math.atan2(hatch.e.y_mm-C,hatch.e.x_mm-C):fromBearing(stairAt?stairAt.bearing+30:0)*Math.PI/180,p={x:Math.round(C+Math.cos(ang)*(R+150)),y:Math.round(C+Math.sin(ang)*(R+150))};
  const z1=Math.min(wallTop,300*rungs.qty);
  placements.push({mark:rungs.mark||"Скобы",name:rungs.name+" ("+rungs.qty+" шт)",type_key:"rung_ladder",geometry_type:"column",x_mm:p.x,y_mm:p.y,z0_mm:Math.max(150,z1-300*(rungs.qty-1)),z1_mm:z1,
   levels_from:"ведомость отправочных элементов",confidence:"low",scheme_group:"stairs",fitting_type:"ladder",diameter_mm:400,
   notes:["Ступени-скобы по стенке через 300, "+rungs.qty+" шт"+(hatch?", под люком "+hatch.e.mark:", место не найдено — проверьте")]})
 }
 // Fasteners of the set (ведомости метизов): the bolts of the roof framing at the ends of its members (to the support
 // ring and to the central ring), so many per joint as the list gives; the rest are listed in the warnings.
 const fast=[];for(const pg of pages)for(const f of pg.sheet?.fasteners||[])if(f.count>0){const roof=/крыш|покрыти/iu.test(((pg.context?.titles||[]).join(" "))+" "+(pg.sheet?.stamp?.name||""))||Boolean(pg.tank?.ship?.some(r=>/крыш/iu.test(r.name)));
  const same=fast.find(o=>o.text===f.text&&o.count===f.count);if(same)same.roof=same.roof||roof;else fast.push({...f,roof})}
 const roofBars=placements.filter(e=>e.type_key==="roof_rafter");
 for(const f of fast){
  const joints=roofBars.length*2,per=f.item==="bolt"&&f.roof&&joints?f.count/joints:0;
  if(per>=1&&Number.isInteger(per)){
   roofBars.forEach((b,k)=>[[b.x_mm,b.y_mm,b.z0_mm],[b.x2_mm,b.y2_mm,b.z1_mm]].forEach(([x,y,z],end)=>placements.push({mark:"М"+f.d_mm,name:f.text+(f.temporary?" (временные)":""),type_key:"bolt",geometry_type:"column",
    x_mm:x,y_mm:y,z0_mm:z,z1_mm:z+Math.max(40,f.length_mm||60),levels_from:"ведомость метизов",confidence:"low",scheme_group:"fasteners",fitting_type:"bolt",diameter_mm:f.d_mm||20,layout:{kind:"bolts",count:per},
    notes:[per+" шт "+f.text+" в узле "+(end?"у центрального кольца":"у опорного кольца")+" элемента "+(k+1)+(f.temporary?" — временные, на период монтажа":"")+"; всего по ведомости "+f.count]})))
  }else notes.push("Метизы по ведомости: "+f.text+" — "+f.count+" шт"+(f.temporary?" (временные)":""))
 }
 // Anchors of the wall at their bearings, just outside it, as on their layout sheet.
 const anchors=tanks.map(p=>p.tank.anchors).find(Boolean);
 if(anchors)anchors.bearings.forEach((b,k)=>{const p=at(fromBearing(b),Math.round(R*Math.max(1,anchors.ratio)));
  placements.push({mark:"Анкер",name:"Анкерное крепление стенки",type_key:"base",geometry_type:"column",x_mm:p.x,y_mm:p.y,z0_mm:0,z1_mm:300,
   levels_from:"схема анкерных креплений",confidence:"low",scheme_group:"embeds",notes:["Анкер "+(k+1)+" из "+anchors.bearings.length+", угол "+b+"°; высота столика условная — по узлу"]})});
 if(!H)notes.push("Высота стенки не найдена — фасад резервуара не прочитан");
 const unnumbered=items.filter(c=>c.pos===null).length;
 if(unnumbered)notes.push("У "+unnumbered+" патрубков/люков номер позиции не прочитан — марка дана по углу");
 // The tank built above stands at the centre of each circle of the layout sheet, turned so that its stair is where the
 // layout shows it (the nozzles of a turned copy follow — their own sheets per type are not read yet); the transition
 // platform joins the roofs of neighbours.
 let spanX=D+2*M,spanY=D+2*M,title="Резервуар Ø"+D+(H?" × "+H:"");
 if(lay&&lay.length>=2){
  const sd=lay[0].spanDims,v=sd?.mm.find(x=>x>=D*1.02),k=v?v/sd.pt:D/(2*lay[0].r);
  const off=lay.map(t=>({dx:Math.round((t.x-lay[0].x)*k),dy:Math.round(-(t.y-lay[0].y)*k)}));
  const minX=Math.min(0,...off.map(o=>o.dx)),minY=Math.min(0,...off.map(o=>o.dy));
  const one=placements.splice(0);
  const turn=(e,rot,dx,dy,n)=>{const r=rot*Math.PI/180,f=(x,y)=>({x:Math.round(C+(x-C)*Math.cos(r)-(y-C)*Math.sin(r)+dx),y:Math.round(C+(x-C)*Math.sin(r)+(y-C)*Math.cos(r)+dy)});
   const a=f(e.x_mm,e.y_mm),b=e.x2_mm!==undefined?f(e.x2_mm,e.y2_mm):null;
   return{...e,x_mm:a.x,y_mm:a.y,...(b?{x2_mm:b.x,y2_mm:b.y}:{}),...(e.sector_deg>0?{sector_start_deg:Math.round((((e.sector_start_deg+rot)%360)+360)%360*10)/10}:{}),
    notes:[...(e.notes||[]),"Резервуар "+(n+1)+" из "+lay.length+(rot?", повёрнут на "+Math.round(rot)+"° по схеме расположения":"")]}};
  lay.forEach((t,n)=>{const rot=t.outside!==undefined&&lay[0].outside!==undefined?-(t.outside-lay[0].outside):0;
   for(const e of one)placements.push(turn(e,n?rot:0,off[n].dx-minX,off[n].dy-minY,n))});
  // The transition platform between neighbouring roofs (переходная площадка), at the wall top, 1000 wide, railings both sides.
  if(tanks.some(p=>p.tank.bridge))for(let n=0;n+1<lay.length;n++){
   const a={x:C+off[n].dx-minX,y:C+off[n].dy-minY},b={x:C+off[n+1].dx-minX,y:C+off[n+1].dy-minY},L2=Math.hypot(b.x-a.x,b.y-a.y),u={x:(b.x-a.x)/L2,y:(b.y-a.y)/L2},v={x:-u.y,y:u.x};
   const p={x:Math.round(a.x+u.x*R),y:Math.round(a.y+u.y*R)},q={x:Math.round(b.x-u.x*R),y:Math.round(b.y-u.y*R)},z=wallTop;
   placements.push({mark:"ПП"+(n+1),name:"Площадка переходная между резервуарами",type_key:"platform",fitting_type:"deck",diameter_mm:1000,geometry_type:"beam",x_mm:p.x,y_mm:p.y,x2_mm:q.x,y2_mm:q.y,z0_mm:z,z1_mm:z,
    levels_from:"схема расположения резервуаров",confidence:"low",scheme_group:"platforms",notes:["Переходная площадка между резервуарами "+(n+1)+" и "+(n+2)+", длина "+Math.round(Math.hypot(q.x-p.x,q.y-p.y))+", ширина 1000 (принята), отметка по верху стенки — проверьте"]});
   for(const sd of [-500,500])placements.push({mark:"Ограждение",name:"Ограждение переходной площадки",type_key:"railing",geometry_type:"beam",x_mm:Math.round(p.x+v.x*sd),y_mm:Math.round(p.y+v.y*sd),x2_mm:Math.round(q.x+v.x*sd),y2_mm:Math.round(q.y+v.y*sd),
    z0_mm:z+1250,z1_mm:z+1250,levels_from:"схема расположения резервуаров",confidence:"low",scheme_group:"guards",notes:["Поручень ограждения переходной площадки, 1250 над настилом"]})
  }
  spanX=D+2*M+Math.max(...off.map(o=>o.dx))-minX;spanY=D+2*M+Math.max(...off.map(o=>o.dy))-minY;
  title=lay.length+" резервуара Ø"+D+(H?" × "+H:"");
  notes.push("По схеме расположения: "+lay.length+" резервуара, расстояния между центрами "+off.slice(1).map((o,i)=>Math.round(Math.hypot(o.dx-off[i].dx,o.dy-off[i].dy))).join(", ")+(v?"":" (масштаб по диаметру стенки — проверьте)"))
 }
 return{page:host.page,docType:host.docType,sourceName:host.sourceName,pdfPage:host.pdfPage,
  scheme:{kind:"tank",title,axesX:["1","2"],axesY:["А","Б"],spansX:[spanX],spansY:[spanY],placements,warnings:notes}}
}
// Several different tanks in one set (a checked entry names them: РВС-2000 and РВС-400 of one КМ): each is built from
// its own pages and they stand in a row, 6 m apart — the site plan places them, this only keeps them apart. Sheets that
// belong to no tank of the entry go with the first one.
function buildTanks(pages){
 const groups=[...new Set(pages.map(p=>p.tankGroup).filter(Number.isInteger))].sort((a,b)=>a-b);
 if(groups.length<2)return buildTank(pages);
 const built=groups.map(g=>buildTank(pages.filter(p=>p.tankGroup===g||g===groups[0]&&!Number.isInteger(p.tankGroup)))).filter(Boolean);
 if(built.length<2)return built[0]||null;
 const placements=[],warnings=[];let x=0,H=0;
 built.forEach((t,k)=>{
  const s=t.scheme,w=s.spansX.reduce((a,b)=>a+b,0),label=pages.find(p=>p.tankGroup===groups[k]&&p.tank?.label)?.tank.label||s.title;
  for(const e of s.placements)placements.push({...e,x_mm:e.x_mm+x,...(e.x2_mm!==undefined?{x2_mm:e.x2_mm+x}:{}),notes:[...(e.notes||[]),label]});
  warnings.push(...(s.warnings||[]).map(w=>label+": "+w));
  x+=w+6000;H=Math.max(H,s.spansY.reduce((a,b)=>a+b,0))
 });
 warnings.push("В комплекте "+built.length+" разных резервуара — поставлены в ряд через 6 м; места по генплану проверьте");
 const t0=built[0];
 return{...t0,scheme:{...t0.scheme,title:built.map((t,k)=>pages.find(p=>p.tankGroup===groups[k]&&p.tank?.label)?.tank.label||t.scheme.title).join(" + "),spansX:[x-6000],spansY:[H],placements,warnings}}
}
module.exports={extractTank,buildTank,buildTanks,circleOf,diameters,fittingOf};
