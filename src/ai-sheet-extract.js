"use strict";
/*
 * IR Project: what a sheet says about shipping marks, read from its text layer.
 * - assembly views (КМД сборочные): view titles "Ф3", "Ф4, Ф5 (обр. Ф4)" with level marks
 *   and dimensions below them → bottom/top level and overall length of each mark;
 * - "Требуется (изготовить)" tables → required quantity and mass per mark;
 * - "Ведомость элементов" (КМ) → profile and steel per mark;
 * - stamp → document code and sheet name.
 * Tables drawn as vector strokes have no text and are left to the AI step.
 */
const {parseFastener}=require("./ai-fasteners");
// Plant numbering of shipping marks: a letter and 5–7 digits with a revision letter, «А003855-а».
const MARK=/[А-ЯЁA-Z]\d{5,7}(?:-[а-яa-z])?(?![\dа-яa-z])|(?:[А-ЯЁA-Z]{1,3}|[А-ЯЁ][а-яё]{1,2})\d{1,4}(?:[-.]\d{1,3})?[а-яa-z]?/gu;
const LEVEL=/^([+\-−±]?)(\d{1,2})[,.](\d{3})$/;
const PROFILE=/(?:ｴ|I|Двутавр|Швеллер|Гн\.?|Тр\.?|∟|L|Уголок|▢|□|—|-)\s*[\d□]|^\d{2}[БКШМП]\d?$|^\d+х\d+(?:х\d+)?$|^[∅ØФ]\s*\d{1,3}(?:\s*[хx×]\s*\d{1,2}(?:[,.]\d)?)?$/u;
// A «Сечение» cell: a rolled section or a plate from its first sign; «Сечение сложное, см. л. …» is not one.
const SIZE=/^(?:2\s*)?(?:ｴ|I|Двутавр|Швеллер|Гн\.?\s*[□▢]?|Тр\.?|∟|L|Уголок|▢|□|\[)\s*\d|^[-−—]\s*t?\s*\d{1,3}(?:\s*[хx×]\s*\d{2,4})?$|^\d{2}[БКШМП]\d?$|^\d+х\d+(?:х\d+)?$|^[∅ØФ]\s*\d{1,3}(?:\s*[хx×]\s*\d{1,2}(?:[,.]\d)?)?$/u;
const STEEL=/^[СC]\s?\d{3}(?:-\d)?$/u;
const median=a=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[s.length>>1]};
const levelMm=s=>{const m=LEVEL.exec(String(s).trim());if(!m)return null;const v=Number(m[2])*1000+Number(m[3]);return m[1]==="-"||m[1]==="−"?-v:v};
const number=s=>/^\d{2,5}$/.test(String(s).trim())?Number(s):null;
const horizontal=t=>Math.abs(t.angle||0)<10;

// Text items on one line, left to right.
// A word the reading boxed taller than the line (a rule under it caught: «позиции по» 18 pt high among 12, its foot 8 pt
// lower — ГПЭС К27 «Все позиции по К26» read as two lines) alone on a line of its own: on the line its top part stands on.
function rowsOf(texts,tol=4){
 const rows=[];
 for(const t of [...texts].sort((a,b)=>a.y-b.y)){
  const row=rows.find(r=>Math.abs(r.y-t.y)<=tol);
  if(row){row.items.push(t);row.y=(row.y*(row.items.length-1)+t.y)/row.items.length}else rows.push({y:t.y,items:[t]})
 }
 const sizes=texts.filter(t=>t.ocr&&t.size>0).map(t=>t.size).sort((a,b)=>a-b),z=sizes[Math.floor(sizes.length/2)];
 if(z)for(let i=rows.length-1;i>=0;i--){const r=rows[i];if(!r.items.every(t=>t.ocr&&t.size>1.3*z))continue;
  const y=r.y-(Math.min(...r.items.map(t=>t.size))-z),to=rows.find(o=>o!==r&&Math.abs(o.y-y)<=tol);if(!to)continue;
  to.items.push(...r.items);rows.splice(i,1)}
 for(const r of rows)r.items.sort((a,b)=>a.x-b.x);
 return rows
}

// A view title is a large text made only of marks: "Ф3", "К1, К2 (обратно К1)", "(обратна К1)" (ГПЭС К1).
function titleMarks(str){
 // A profile over the sketch of its section is not a mark (ГПЭС л. 113: «I50ШС2» — the welded I-beam of К101).
 if(/^[IΙ]\s?\d{2,3}\s?[БШКСДМУ]/u.test(String(str).trim()))return null;
 // Steel grades (С245, C345-3) look like marks but are not.
 const marks=(String(str).match(MARK)||[]).filter(m=>!STEEL.test(m)&&!/^Ст\d/u.test(m));
 if(!marks.length)return null;
 const rest=String(str).replace(MARK,"").replace(/обр(?:атн[оа])?\.?|зеркально|[(),;\s]/giu,"");
 return rest?null:[...new Set(marks)]
}

function stampOf(texts,w,h,med){
 const box=texts.filter(t=>t.x>w-700&&t.y>h-190&&horizontal(t));
 // Numbered notes ("13. Изменения … КМ1-1") also mention codes; the stamp code is a short line.
 const codes=box.filter(t=>/КМ/u.test(t.str)&&/\d/.test(t.str)&&!/^\d+\.\s/.test(t.str)&&t.str.length<60);
 const code=(codes.find(t=>/КМД/u.test(t.str))||codes[0])?.str||"";
 const name=box.filter(t=>t.size>=med*1.2&&!/КМД?\s*\(|ТОО|ООО|АО\s|Формат|^А\d$|изм\.?$|ГПЭС|^\d/u.test(t.str)&&t.str!==code&&t.str.length<70)
  .sort((a,b)=>a.y-b.y).map(t=>t.str);
 // A stamp written in the size of the sheet (its name no larger than the rest): the line naming the marks of the sheet
 // («Подкрановая балка Ф131») is still its name.
 if(!stampNames(name.join(" ")).length)name.push(...box.filter(t=>!/^\d+\.\s/u.test(t.str)&&t.str.length<70&&!name.includes(t.str)&&stampNames(t.str).length).sort((a,b)=>a.y-b.y).map(t=>t.str));
 const block=stampBlock(texts,w,h,code);
 return{code,name:name.join(" · "),...(Object.keys(block).length?{block}:{})}
}
// The cells of the stamp (ГОСТ 21.101, forms 3–6), each value under its own label: «Стадия», «Лист», «Листов»; the
// change rows above the line «Изм. Кол.уч. Лист №док. Подп. Дата» (number or «Нов.», «Зам.», document, date); the
// dates of the signatures below it. A cell left empty stays empty: the sheet number is never counted from the pages.
const SECTION=/(?:^|[^А-ЯЁа-яё])(КМД|КМ|КЖИ|КЖ|АР|АС|ТХ|ТМ|ГП|ОВ|ВК|ЭС|ЭМ|ЭО|АТХ|АК|КР|ГР)(?:\d{0,2})(?![А-ЯЁа-яё])/u;
const plainOf=t=>String(t.str).replace(/\s+/g,"");
const centreOf=t=>t.x+(t.width||String(t.str).length*(t.size||8)*0.55)/2;
const DATE=/^(?:\d{1,2}\.)?\d{2}\.(?:\d{2}|\d{4})$/;
function dateValue(s){
 const p=s.split(".").map(Number);
 const [d,m,y]=p.length===3?p:[1,...p];
 const year=y<100?2000+y:y;
 return m>=1&&m<=12&&d>=1&&d<=31&&year>=1950&&year<=2100?year*10000+m*100+d:null
}
function stampBlock(texts,w,h,code){
 const box=texts.filter(t=>t.x>w-760&&t.y>h-320&&horizontal(t));
 const out={};
 const section=(String(code).replace(/\([^)]*\)/g," ").match(SECTION)||[])[1];
 if(section)out.section=section;
 const under=(label,re)=>box.filter(t=>t!==label&&t.y>label.y+5&&t.y<label.y+42&&Math.abs(centreOf(t)-centreOf(label))<Math.max(18,(label.width||20)*0.75)&&re.test(String(t.str).trim()))
  .sort((a,b)=>a.y-b.y)[0];
 const stage=box.find(t=>plainOf(t)==="Стадия");
 if(stage){
  const v=under(stage,/^[А-ЯЁA-Z]{1,4}$/u);if(v)out.stage=v.str.trim();
  const row=box.filter(t=>Math.abs(t.y-stage.y)<6&&t.x>stage.x);
  const sheetLabel=row.find(t=>plainOf(t)==="Лист"),totalLabel=row.find(t=>plainOf(t)==="Листов");
  const sheet=sheetLabel&&under(sheetLabel,/^\d{1,3}(?:[.,]\d{1,2})?[а-я]?$/u),total=totalLabel&&under(totalLabel,/^\d{1,3}$/);
  if(sheet)out.sheet=sheet.str.trim();
  if(total)out.sheets=Number(total.str.trim())
 }
 // The line of the change table: «Изм.», «Изм.К» (glued with «Кол.уч.»), «Изм .».
 const head=box.filter(t=>/^Изм\.?(?:К|Кол|$)/u.test(plainOf(t))).sort((a,b)=>b.y-a.y)[0];
 // Where a column of that line is, also inside a glued label («Лист №док . Подпись Дата»).
 const column=re=>{
  const t=head&&box.find(o=>Math.abs(o.y-head.y)<6&&re.test(String(o.str)));
  if(!t)return null;
  const s=String(t.str),i=s.search(re),len=(s.match(re)||[""])[0].length,width=t.width||s.length*(t.size||8)*0.55;
  return t.x+width*(i+len/2)/Math.max(1,s.length)
 };
 const docX=head&&column(/№\s*док|N\s*док/u),dateX=head&&column(/Дата/u);
 if(head){
  const rows=box.filter(t=>t.y<head.y-4&&t.y>head.y-48&&centreOf(t)>head.x-4&&centreOf(t)<head.x+28&&/^(?:\d{1,2}|Нов\.?|Зам\.?|Изм\.?|Анн\.?)$/u.test(String(t.str).trim()))
   .map(t=>{
    const line=box.filter(o=>o!==t&&Math.abs(o.y-t.y)<5);
    const doc=docX!==null&&line.find(o=>Math.abs(centreOf(o)-docX)<30&&/\d/.test(o.str)&&!DATE.test(String(o.str).trim()));
    const date=line.find(o=>DATE.test(String(o.str).trim())&&dateValue(String(o.str).trim())&&(dateX===null||Math.abs(centreOf(o)-dateX)<40));
    return{change:t.str.trim(),...(doc?{doc:doc.str.trim()}:{}),...(date?{date:date.str.trim()}:{})}
   });
  // The latest change: the highest number, the row farthest from the line when there are no numbers.
  if(rows.length)out.revision=rows.reduce((a,b)=>Number(b.change)>Number(a.change)||(!Number(a.change)&&!Number(b.change))?b:a)
 }
 // The date of the sheet: the latest date of the signatures, in the column «Дата» below the change line.
 const dates=box.filter(t=>head&&t.y>head.y+4&&t.y<head.y+90&&DATE.test(String(t.str).trim())&&(dateX===null||Math.abs(centreOf(t)-dateX)<40))
  .map(t=>({s:t.str.trim(),v:dateValue(t.str.trim())})).filter(d=>d.v);
 if(dates.length)out.date=dates.reduce((a,b)=>b.v>a.v?b:a).s;
 return out
}

// The overall size of a view (rules of 24.10.2026): the dimension between the extreme extension lines of its direction —
// the outline of the part — not the largest number of the view (a reference size, a size of another view or a number of
// the table can be larger). Its dimensions keep one scale; the overall one spans all the others and the chain under it
// adds up to it. None spans them — no overall dimension is drawn: the largest number stays, as ambiguous.
// (`along`: only the dimensions along the title — a slanted view, its length along the flight, not the height of its
// posts across it, ГПЭС Ф135 «945»)
function overallOf(inside,segments,box,along=false){
 if(!segments?.length)return null;
 const {dimensionsOf}=require("./ai-scheme-extract");
 const near=segments.filter(q=>Math.max(q.a.x,q.b.x)>=box.x0&&Math.min(q.a.x,q.b.x)<=box.x1&&Math.max(q.a.y,q.b.y)>=box.y0&&Math.min(q.a.y,q.b.y)<=box.y1);
 const dims=dimensionsOf(inside,near).filter(d=>d.v>=100&&d.v<=30000);
 if(!dims.length)return null;
 const ratio=d=>d.v/(d.hi-d.lo),n=median(dims.map(ratio)),same=dims.filter(d=>Math.abs(ratio(d)-n)/n<=0.06);
 // (the length is along the member: not in a direction whose dimensions span under a third of the other's — the height
 // of a beam's section, ГПЭС К161 «200» against its run of «120 · 920 · 120» along it)
 const reachOf=f=>{const l=dims.filter(d=>d.flat===f);return l.length?Math.max(...l.map(d=>d.hi))-Math.min(...l.map(d=>d.lo)):0};
 const across=f=>!along&&reachOf(f)<0.3*reachOf(!f);
 let best=null;const dirs=along?[true]:[true,false];
 for(const flat of dirs){
  const list=same.filter(d=>d.flat===flat);if(!list.length||across(flat))continue;
  const lo=Math.min(...list.map(d=>d.lo)),hi=Math.max(...list.map(d=>d.hi)),tol=Math.max(1.5,(hi-lo)*0.01);
  const over=list.filter(d=>d.lo<=lo+tol&&d.hi>=hi-tol).sort((a,b)=>b.v-a.v)[0];
  // (and spans at least half of all the view's dimensions that way: two sizes of a plate at an end, of one scale, are no
  // overall size of a beam drawn shorter, ГПЭС К160 «130» at the end of «7480»)
  if(!over||list.length<2&&over.v<1000||over.hi-over.lo<0.5*reachOf(flat))continue;
  // The chain on another line between the same ends: its parts add up to the overall dimension.
  const chain=list.filter(d=>d!==over&&Math.abs(d.line-over.line)>1&&d.lo>=lo-tol&&d.hi<=hi+tol);
  const lines=new Map();for(const d of chain){const k=Math.round(d.line);lines.set(k,[...(lines.get(k)||[]),d])}
  const closes=[...lines.values()].some(g=>g.length>=2&&Math.abs(g.reduce((a,d)=>a+d.v,0)-over.v)<=Math.max(2,over.v*0.002));
  // One dimension alone in its direction is not confirmed by anything: kept, with the other numbers as candidates.
  if(!best||over.v>best.v)best={v:over.v,how:closes?"по крайним выносным линиям, цепочка сходится":list.length<2?"единственный размер вида — общий размер не подтверждён":"по крайним выносным линиям",...(list.length<2&&!closes?{weak:true}:{})}
 }
 // A long member drawn with a break (a railing, a beam «с разрывом»): its length is written at its true value over a
 // shortened drawing — off the scale of the view, drawn shorter than it. Spanning the extreme extension lines of its
 // direction and larger than the overall found, it is the length (a detail of a larger scale is drawn longer, not shorter).
 for(const flat of dirs){
  // (spanning the extension lines of the dimensions at the scale — a size of another view in the area, drawn shorter
  // too, runs past them: К161's «7360» over the area of К160)
  const all=dims.filter(d=>d.flat===flat);if(all.length<2)continue;const ends=same.filter(d=>d.flat===flat).length?same.filter(d=>d.flat===flat):all;
  const lo=Math.min(...ends.map(d=>d.lo)),hi=Math.max(...ends.map(d=>d.hi)),tol=Math.max(1.5,(hi-lo)*0.01);
  const broken=all.filter(d=>!same.includes(d)&&ratio(d)>n&&d.lo<=lo+tol&&d.hi>=hi-tol&&d.v>=1000).sort((a,b)=>b.v-a.v)[0];
  if(broken&&(!best||broken.v>best.v))best={v:broken.v,how:"по крайним выносным линиям, вид с разрывом"}
 }
 return best
}
// The texts of the mark columns of the «Спецификация» and «Требуется изготовить» tables (and the numbers of their rows):
// what is in a table is not a view.
function tableMarkCells(texts){
 const out=new Set();
 const take=(markH,top,right,edge=Infinity)=>{
  let last=null;
  for(const r of rowsOf(texts.filter(t=>t.y>top+4&&t.y<top+1600&&t.x>markH.x-60&&t.x<right))){
   if(last!==null&&r.y-last>80||r.items.some(t=>t.x<edge&&/^(Всего|Итого|Выборка|Ведомость)/u.test(t.str)))break;
   last=r.y;for(const t of r.items)if(Math.abs(t.x-markH.x)<60&&titleMarks(t.str)||/^\d+(?:[,.]\d+)?$/.test(String(t.str).trim()))out.add(t)
  }
 };
 for(const head of texts.filter(t=>/^Спецификац/u.test(t.str))){const {hdr,markH}=specHeader(texts,head);if(markH)take(markH,Math.max(...hdr.map(t=>t.y)),Math.max(...hdr.map(t=>t.x))+160)}
 for(const head of texts.filter(t=>/^Тре[бдв]уется|^изготовить$|^Таблица\s+отправочных/u.test(t.str))){
  const hdr=texts.filter(t=>t.y>head.y&&t.y<head.y+70&&Math.abs(t.x-head.x)<260&&/^(Марка|Отправочная|Отпр|марка|Кол(?!\.?\s*уч)|Масса|Вес|марки|[Вв]сех|шт|изготовить)/u.test(t.str));
  const markH=requiredMarkHead(hdr,head);if(markH)take(markH,Math.max(...hdr.map(t=>t.y)),markH.x+340,headerEdge(hdr))
 }
 return out
}
// A title written at a slant (a stair's railing drawn along its flight: ГПЭС Ф133 at 45°, Ф136 at −45°, its length
// «3228» under it): its view is drawn along it. The sheet is read turned so that the title reads level — only the texts
// written along it or across it (the view's own; the level texts are other views'), the segments turned with them, the
// other titles of the slant where they stand; its title and its area given back on the sheet as drawn.
const slanted=t=>{const a=Math.abs(t.angle||0)%90;return a>=10&&a<=80};
// (a text's middle on the sheet: along its own line)
const midOf=t=>{const b=-(t.angle||0)*Math.PI/180;return{x:t.x+Math.cos(b)*(t.width||0)/2,y:t.y+Math.sin(b)*(t.width||0)/2}};
function turnedSheet(title,texts,segments,titles,cells,w,h){
 const a=-(title.angle||0)*Math.PI/180,u={x:Math.cos(a),y:Math.sin(a)},dn={x:-u.y,y:u.x};
 const P=p=>({x:p.x*u.x+p.y*u.y,y:p.x*dn.x+p.y*dn.y}),back=p=>({x:p.x*u.x+p.y*dn.x,y:p.x*u.y+p.y*dn.y});
 const turn=an=>{let d=((an-(title.angle||0))%360+360)%360;return d>180?d-360:d};
 const own=t=>{const d=Math.abs(turn(t.angle||0))%90;return d<4||d>86};
 const mid=midOf,tx=texts.filter(t=>t!==title&&!cells.has(t)&&own(t)).map(t=>({...t,...P(t),angle:turn(t.angle||0)}));
 // (the other titles of the slant part it: the level ones are of views of level texts)
 const ts=titles.filter(o=>own(o.t)).map(o=>{const c=P(mid(o.t));return{...o,t:{...o.t,x:c.x-(o.t.width||0)/2,y:c.y,angle:0},page:o}});
 const sg=segments.map(q=>({...q,a:P(q.a),b:P(q.b)}));
 const corners=[{x:0,y:0},{x:w,y:0},{x:0,y:h},{x:w,y:h}].map(P);
 // (its area on the sheet: round its own texts and its title, else the turned area)
 const box=(b,inside)=>{const c=inside.length?[...inside.map(back),mid(title)]:[{x:b.x0,y:b.y0},{x:b.x1,y:b.y0},{x:b.x0,y:b.y1},{x:b.x1,y:b.y1}].map(back),xs=c.map(p=>p.x),ys=c.map(p=>p.y),pad=inside.length?30:0;
  return{x0:Math.round(Math.max(0,Math.min(...xs)-pad)),y0:Math.round(Math.max(0,Math.min(...ys)-pad)),x1:Math.round(Math.min(w,Math.max(...xs)+pad)),y1:Math.round(Math.min(h,Math.max(...ys)+pad))}};
 return{texts:tx,titles:ts,segments:sg,v:ts.find(o=>o.page.t===title),bottom:Math.max(...corners.map(p=>p.y))-40,at:mid(title),box,
  of:list=>list.filter(t=>own(t)).map(t=>({...t,...P(t),angle:turn(t.angle||0)}))}
}
// A group drawing — one view for several marks (ГПЭС К114–К118 on л. 111, К131 and К132 on л. 123) — writes the sizes
// that differ by mark on rows of their own, «для К114» at the end of the row (on its line run on, over it or under it).
// The length of a mark is its own row's: the longest of its rows — the overall size or the chain of the row added up —
// when it is as long as the member (at least 0.6 of the view's length: «305 · 305 для К131» is the place of a part).
// (a label sticks out past the edge of the view's area: К152, «для К152» 9 pt past it — `pool`, the texts round it)
// Its spans: the middle of a chain of its from end to end, the ends short — between the axes of the holes at its ends
// (К137 «300 · 6900 · 300», К140 «200 · 7100 · 200»: the holes of the drawing moved for each mark), with the ends and the
// line of the row (a view may hold two drawings, each with rows of its own). {lengths, spans} or null.
function markLengths(inside,segments,box,marks,length,pool=inside){
 const labels=pool.map(t=>{const m=/^для\s+(.+)$/u.exec(String(t.str).trim());const own=m?(titleMarks(m[1])||[]).filter(x=>marks.includes(x)):[];return own.length?{t,marks:own}:null}).filter(Boolean);
 // (a drawing of pieces joined end to end, each named over its piece — ГПЭС «Ф76, Ф77»: «Ф76» over the one of 8785,
 // «Ф77» over the one of 5195, «8785 · 5195» adding up to its «13980»)
 const pieceOf=t=>{const s=String(t.str).trim();return marks.includes(s)?s:null},pieces=labels.length?[]:pool.filter(pieceOf);
 if(!labels.length&&new Set(pieces.map(pieceOf)).size<marks.length)return null;
 const {dimensionsOf}=require("./ai-scheme-extract");
 const near=segments.filter(q=>Math.max(q.a.x,q.b.x)>=box.x0&&Math.min(q.a.x,q.b.x)<=box.x1&&Math.max(q.a.y,q.b.y)>=box.y0&&Math.min(q.a.y,q.b.y)<=box.y1);
 const rows=[];
 for(const d of dimensionsOf(inside,near)){const r=rows.find(r=>r.flat===d.flat&&Math.abs(r.c-d.line)<=1);if(r)r.dims.push(d);else rows.push({flat:d.flat,c:d.line,dims:[d]})}
 for(const r of rows){r.lo=Math.min(...r.dims.map(d=>d.lo));r.hi=Math.max(...r.dims.map(d=>d.hi));
  const chain=r.dims.slice().sort((a,b)=>a.lo-b.lo),joined=chain.every((d,k)=>!k||Math.abs(d.lo-chain[k-1].hi)<=1.5);
  r.v=Math.max(...r.dims.map(d=>d.v),joined?chain.reduce((a,d)=>a+d.v,0):0);
  const sum=chain.reduce((a,d)=>a+d.v,0),e0=chain[0].v,e1=chain[chain.length-1].v;
  if(joined&&chain.length>=3&&Math.max(e0,e1)<=sum*0.15)r.span={span:sum-e0-e1,a:e0,b:e1,c:Math.round(r.c*10)/10}}
 if(!labels.length){
  const L=Number(length)||0;
  // (the row adding up to it the closest: «8785 · 5195» to the extension lines of «13980», not «8740 · 5150» between its
  // end gaps)
  const total=r=>r.dims.reduce((a,d)=>a+d.v,0);
  for(const r of rows.slice().sort((p,q)=>Math.abs(total(p)-L)-Math.abs(total(q)-L))){const chain=r.dims.slice().sort((p,q)=>p.lo-q.lo),sum=total(r);
   if(chain.length!==marks.length||!chain.every((d,k)=>!k||Math.abs(d.lo-chain[k-1].hi)<=1.5)||!(Math.abs(sum-L)<=Math.max(2,L*0.01)))continue;
   const at=t=>r.flat?t.x+(t.width||0)/2:t.y,got={},used=new Map();
   for(const t of pieces){const k=chain.findIndex(d=>at(t)>=d.lo&&at(t)<=d.hi),m=pieceOf(t);if(k<0)continue;if(used.has(m)&&used.get(m)!==k){used.set(m,-1);continue}used.set(m,k);got[m]=chain[k].v}
   const ks=marks.map(m=>used.get(m));if(ks.every(k=>k>=0)&&new Set(ks).size===marks.length)return{lengths:got,spans:null}}
  return null}
 const out={},spans={};
 for(const l of labels){
  const b=l.t,flat=Math.abs(b.angle||0)<10,z=Number(b.size)||10,w=Number(b.width)||0;
  const [c,t0,t1]=flat?[b.y-z*0.36,b.x,b.x+w]:[b.x-z*0.36,Math.min(b.y,b.y-w*Math.sign(b.angle||1)),Math.max(b.y,b.y-w*Math.sign(b.angle||1))];
  // (the row whose line runs on to it — the shelf it is written on — before a row merely as near: «130» under the ends
  // of К151 a little nearer «для К151» than the line of «7870» drawn on under it)
  const reach=r=>t0>=r.hi-4?Math.max(...r.dims.map(d=>d.to??d.hi))>=t0-6:Math.min(...r.dims.map(d=>d.from??d.lo))<=t1+6;
  const row=rows.filter(r=>r.flat===flat&&Math.abs(r.c-c)<=z&&(t1<=r.lo+4&&r.lo-t1<=150||t0>=r.hi-4&&t0-r.hi<=150)).sort((p,q)=>reach(q)-reach(p)||Math.abs(p.c-c)-Math.abs(q.c-c))[0];
  if(row)for(const m of l.marks){out[m]=Math.max(out[m]||0,row.v);if(row.span&&row.v>=(Number(length)||0)*0.6&&!(spans[m]||[]).some(o=>o.c===row.span.c))(spans[m]=spans[m]||[]).push(row.span)}
 }
 for(const m of Object.keys(out))if(!(out[m]>=Math.max(1000,(Number(length)||0)*0.6)))delete out[m];
 return Object.keys(out).length||Object.keys(spans).length?{lengths:Object.keys(out).length?out:null,spans:Object.keys(spans).length?spans:null}:null
}
function assemblyViews(texts,w,h,med,segments=[]){
 // A mark in a table («Требуется изготовить», a «Спецификация») is a cell, not a view's title (ГПЭС Ф126: a sheet of
 // tables only gave a «view» with the mass of 1000 washers «16,361» for its level and the total «28884» for its length).
 const cells=tableMarkCells(texts);
 const all=texts.filter(t=>(horizontal(t)||slanted(t))&&t.size>=med*1.3&&!(t.x>w-700&&t.y>h-190)&&!cells.has(t))
  .map(t=>({t,marks:titleMarks(t.str)})).filter(x=>x.marks);
 // (a slanted title parts the sheet where its middle stands)
 const page={texts,segments,titles:all.map(o=>slanted(o.t)?{...o,t:{...o.t,x:midOf(o.t).x-(o.t.width||0)/2,y:midOf(o.t).y}}:o),h};
 const views=[];
 for(const v0 of all){
  // (a slanted title: the sheet turned to it)
  const f=slanted(v0.t)?turnedSheet(v0.t,page.texts,page.segments,all,cells,w,page.h):null;
  const v=f?f.v:v0,texts=f?f.texts:page.texts,segments=f?f.segments:page.segments,titles=f?f.titles:page.titles,h=f?f.bottom+40:page.h;
  const cx=v.t.x+v.t.width/2;
  // The view spans to halfway towards the neighbouring titles on the same band of the sheet.
  // (A title a little higher or lower and well aside — views drawn in steps, Ф15 and Ф16 — parts the sheet across too.)
  // (on the sheet as drawn, only when the higher view's drawing runs down past the lower title — a line of it, between its title and halfway,
  // crosses that height from well above it, not a leader by the title; a view ended above the lower title is above it,
  // not beside it: ГПЭС Ф137 over Ф140, whose «250» at its left end fell in Ф137's half)
  const ocx=o=>o.t.x+o.t.width/2,runsPast=(hi,lo)=>{const x0=Math.min(ocx(hi),(ocx(hi)+ocx(lo))/2),x1=Math.max(ocx(hi),(ocx(hi)+ocx(lo))/2),y=lo.t.y;
   return !segments.length||segments.some(q=>Math.min(q.a.y,q.b.y)<y-30&&Math.max(q.a.y,q.b.y)>y&&Math.max(q.a.x,q.b.x)>=x0&&Math.min(q.a.x,q.b.x)<=x1)};
  const aside=o=>Math.abs(o.t.y-v.t.y)<600&&Math.abs(ocx(o)-cx)>200&&(f||Math.abs(o.t.y-v.t.y)<120||(o.t.y<v.t.y?runsPast(o,v):runsPast(v,o)));
  const row=titles.filter(o=>o!==v&&(Math.abs(o.t.y-v.t.y)<120||aside(o)));
  // (a slanted view, of its own texts only: as far as a flight is long)
  const reach=f?800:420;
  let left=Math.max(cx-reach,...row.map(ocx).filter(x=>x<cx).map(x=>(x+cx)/2)),right=Math.min(cx+reach,...row.map(ocx).filter(x=>x>cx).map(x=>(x+cx)/2));
  const bottomOf=()=>{const below=titles.filter(o=>o.t.y>v.t.y+120&&!aside(o)&&ocx(o)>left&&ocx(o)<right).map(o=>o.t.y);
   // (A table under the view — «Требуется изготовить», «Выборка металла», a «Ведомость» — ends it: its «Итого» is not a size.)
   const tables=texts.filter(t=>t.y>v.t.y+60&&t.x+(t.width||0)>left&&t.x<right&&/^(Тре[бдв]уется|Выборка|Ведомость|Спецификац)/u.test(String(t.str))).map(t=>t.y-(t.size||10)*1.5);
   return Math.min(h-40,...below,...tables)};
  let bottom=bottomOf();
  // (a view drawn wider than that — a beam of 5500 drawn 1700 pt long under its title, ГПЭС Ф48: its long level lines
  // under its title, not under a title beside it, run on to its ends — past halfway to that title when it stands far off
  // its own drawing, В174 by В177)
  // (again over the area so ended: the lines of a view under a title that ends it are not its, Ф74 under Ф72)
  // (not a column drawn upright between its levels: its level lines run on across the other views of the sheet, ГПЭС К62)
  const upright=new Set(texts.filter(t=>t.x>=left&&t.x<=right&&t.y>v.t.y&&t.y<bottom&&levelMm(t.str)!==null).map(t=>levelMm(t.str))).size>=2;
  if(!f&&!upright){const l0=left,r0=right,xs=row.map(ocx),g0=Math.max(-Infinity,...xs.filter(x=>x<cx)),g1=Math.min(Infinity,...xs.filter(x=>x>cx));
   for(let i=0;i<2;i++){const long=segments.filter(q=>Math.abs(q.a.y-q.b.y)<0.5&&Math.abs(q.a.x-q.b.x)>=200&&q.a.y>v.t.y&&q.a.y<bottom&&Math.min(q.a.x,q.b.x)<cx&&Math.max(q.a.x,q.b.x)>cx&&!xs.some(x=>Math.min(q.a.x,q.b.x)<x&&Math.max(q.a.x,q.b.x)>x)&&!(q.a.y>h-190&&Math.min(q.a.x,q.b.x)>w-700));
    left=Math.max(g0,Math.min(l0,...long.map(q=>Math.min(q.a.x,q.b.x)-30)));right=Math.min(g1,Math.max(r0,...long.map(q=>Math.max(q.a.x,q.b.x)+30)));bottom=Math.min(bottom,bottomOf())}}
  // (a slanted view: its own texts packed under its title — the next drawing of the slant lies past a gap of 300 pt,
  // ГПЭС Ф135 over Ф134 and Ф133)
  if(f){let last=v.t.y;for(const y of texts.filter(t=>t.x>=left&&t.x<=right&&t.y>v.t.y&&t.y<bottom).map(t=>t.y).sort((a,b)=>a-b)){if(y-last>300){bottom=y;break}last=y}}
  const inside=texts.filter(t=>t.x>=left&&t.x<=right&&t.y>v.t.y&&t.y<bottom&&!cells.has(t));
  // A level without its sign among other numbers of its line is a cell of a table: «17,156» — the mass of 1000 washers in
  // the «Ведомость метизов» under the view («+9,705» among the dimensions is a level).
  const tableNumber=t=>/^\d/.test(String(t.str).trim())&&levelMm(t.str)!==0&&texts.some(o=>o!==t&&Math.abs(o.y-t.y)<Math.max(3,(t.size||8)*0.4)&&Math.abs(o.x-t.x)<220&&
   /^\d+(?:[,.]\d+)?$/.test(String(o.str).trim())&&levelMm(o.str)===null);
  const levels=[...new Set(inside.filter(t=>levelMm(t.str)!==null&&!tableNumber(t)).map(t=>levelMm(t.str)))].sort((a,b)=>a-b);
  const dims=inside.map(t=>number(t.str)).filter(v=>v&&v>=300&&v<=30000);
  // (the turned sheet runs below naught)
  const box={x0:Math.round(left),y0:Math.round(f?v.t.y-30:Math.max(0,v.t.y-30)),x1:Math.round(right),y1:Math.round(bottom)};
  // A level title over a drawing at a slant (a brace drawn along its line, ГПЭС К114–К118 at 41°: its sizes written
  // along it, the level ones and the upright ones are its run and its rise): its sizes are read with the sheet turned to
  // them — its length is along it.
  let g=null,slope=0;
  if(!f){const sl=inside.filter(t=>slanted(t)&&number(t.str)),lv=inside.filter(t=>!slanted(t)&&number(t.str));
   if(sl.length>=4&&sl.length>lv.length){const n=new Map(),m=new Map();for(const t of sl){const a=Math.round((((t.angle||0)%90)+90)%90),r=Math.round(t.angle||0);n.set(a,(n.get(a)||0)+1);m.set(r,(m.get(r)||0)+1)}
    // (turned exactly by its lines: a dimension line is level to a hundredth of a degree, a text's angle is not)
    const a0=[...n.entries()].sort((p,q)=>q[1]-p[1])[0][0],lines=[];
    for(const q of segments){const dx=q.b.x-q.a.x,dy=q.b.y-q.a.y,l=Math.hypot(dx,dy);if(l<30||Math.min(q.a.x,q.b.x)<box.x0||Math.max(q.a.x,q.b.x)>box.x1||Math.min(q.a.y,q.b.y)<box.y0||Math.max(q.a.y,q.b.y)>box.y1)continue;
     const t=((-Math.atan2(dy,dx)*180/Math.PI)%90+90)%90;if(Math.abs(t-a0)<=3)lines.push([t,l])}
    lines.sort((p,q)=>p[0]-q[0]);let half=lines.reduce((s,x)=>s+x[1],0)/2,a=a0;for(const [t,l] of lines){half-=l;if(half<=0){a=t;break}}
    // (as its numbers read: along them, not across)
    const ref=[...m.entries()].sort((p,q)=>q[1]-p[1])[0][0];a+=90*Math.round((ref-a)/90);
    slope=Math.round(a*10)/10;g=turnedSheet({...v0.t,angle:a},page.texts,page.segments,all,cells,w,page.h)}}
  // (its lines run on along it past its texts, out of the level area: К192's «6440» to its top end over its title)
  const gin=g?g.of(inside):null,gbox=gin?.length?{x0:Math.min(...gin.map(t=>t.x))-600,y0:Math.min(...gin.map(t=>t.y))-40,x1:Math.max(...gin.map(t=>t.x+(t.width||0)))+600,y1:Math.max(...gin.map(t=>t.y))+40}:null;
  const [rin,rseg,rbox]=gbox?[gin,g.segments,gbox]:[inside,segments,box];
  const rdims=gbox?gin.map(t=>number(t.str)).filter(v=>v&&v>=300&&v<=30000):dims;
  const over=rdims.length?overallOf(rin,rseg,rbox,Boolean(f||gbox)):null;
  const length=over?over.v:rdims.length?Math.max(...rdims):null;
  const wide=t=>t.x+(t.width||0)>=rbox.x0-160&&t.x<=rbox.x1+160&&t.y>=rbox.y0-40&&t.y<=rbox.y1+40;
  const ml=v.marks.length>1?markLengths(rin,rseg,rbox,v.marks,length,(gbox?g.of(page.texts):texts).filter(t=>!cells.has(t)&&wide(t))):null,lengths=ml?.lengths,spans=ml?.spans;
  const others=[...new Set(rdims)].filter(x=>x!==length).sort((a,b)=>b-a);
  const how=over?over.how:length?"наибольшее число вида — общий размер не найден":"";
  let z0=levels.length>=2?levels[0]:null,z1=levels.length>=2?levels[levels.length-1]:null;
  // Only the top levels sit in the view (the bottom one is drawn by another view): the bottom is the level
  // written elsewhere on the sheet that matches the top minus the overall length.
  if(levels.length&&length>=2000&&(z0===null||z1-z0<length*0.5)){
   const top=levels[levels.length-1],est=top-length;
   const match=texts.map(t=>levelMm(t.str)).filter(v=>v!==null&&Math.abs(v-est)<=150).sort((a,b)=>Math.abs(a-est)-Math.abs(b-est))[0];
   if(match!==undefined){z0=match;z1=top}
  }
  // Its area on the sheet (points): the mark card shows this piece of the drawing.
  // The member's own section labelled in its view («□140х4» on the leader of the post Ф15): when it is the one rolled
  // section there.
  const rolled=[...new Set(inside.filter(t=>ROLLED.test(profileWords(cyr(String(t.str))))&&!/^(уголок|L|∟)/iu.test(profileWords(cyr(String(t.str))))).map(t=>normProfile(t.str)))];
  const at=f?f.at:{x:cx,y:v.t.y};
  views.push({marks:v.marks,title:v.t.str,title_at:{x:Math.round(at.x*10)/10,y:Math.round(at.y*10)/10},levels,z0_mm:z0,z1_mm:z1,length_mm:length,...(lengths?{lengths}:{}),...(spans?{spans}:{}),...(rolled.length===1?{profile:rolled[0]}:{}),...(how?{length_how:how}:{}),...(gbox?{slope}:{}),...((!over||over.weak)&&others.length?{length_candidates:[length,...others.slice(0,2)]}:{}),box:f?f.box(box,inside):box,...(f?{angle:Math.round(v0.t.angle)}:{})})
 }
 return views
}

// "Требуется / изготовить": Марка | Кол. | Масса марки | всех.
// The marks' column of «Требуется изготовить»: the «Отправочная (марка)» / «Марка» header nearest the title — the
// «Марка» of a «Спецификация» beside it is within reach too (К77); «Отправочная» lost by OCR leaves «марка».
// The right edge of a table's header: an «Итого» right of it is of the table beside (ГПЭС л. 123: «Итого:» of «Выборка
// металла» on the row of К140 ended the marks table there, and К140–К142 were lost).
const headerEdge=hdr=>Math.max(...hdr.map(t=>t.x+(t.width||0)))+40;
function requiredMarkHead(hdr,head){
 const near=re=>hdr.filter(t=>re.test(t.str)).sort((a,b)=>Math.abs(a.x-head.x)-Math.abs(b.x-head.x))[0];
 return near(/^Марка|^Отправочная|^Отпр/u)||near(/^марка$/u)
}
function requiredTable(texts){
 const out=[];
 // OCR of a pasted table often loses one of the two title words.
 // («Тредуется» — OCR of «б».)
 for(const head of texts.filter(t=>/^Тре[бдв]уется|^изготовить$|^Таблица\s+отправочных/u.test(t.str)).filter((t,i,all)=>!all.slice(0,i).some(o=>Math.abs(o.y-t.y)<12&&Math.abs(o.x-t.x)<200))){
  // Only header words, so the first data row is not mistaken for part of the header.
  // («Кол.уч.» of the stamp next to it is not the count.)
  const hdr=texts.filter(t=>t.y>head.y&&t.y<head.y+70&&Math.abs(t.x-head.x)<260&&/^(Марка|Отправочная|Отпр|марка|Кол(?!\.?\s*уч)|Масса|Вес|марки|[Вв]сех|шт|изготовить)/u.test(t.str));
  const markH=requiredMarkHead(hdr,head),qtyH=hdr.find(t=>/^Кол/u.test(t.str));
  if(!markH)continue;
  const massH=hdr.find(t=>/^марки/u.test(t.str)),allH=hdr.find(t=>/^[Вв]сех/u.test(t.str));
  const top=Math.max(...hdr.map(t=>t.y)),usedMarks=new Set();
  for(const row of rowsOf(texts.filter(t=>t.y>top+4&&t.y<top+900&&t.x>markH.x-60&&t.x<(qtyH?qtyH.x:markH.x+80)+260))){
   if(row.items.some(t=>t.x<headerEdge(hdr)&&/^(Всего|Итого)/u.test(t.str)))break;
   // A mark read by OCR in a taller box than the numbers of its row sits a few points off it.
   const markCell=row.items.find(t=>Math.abs(t.x-markH.x)<60&&titleMarks(t.str))||texts.filter(t=>!row.items.includes(t)&&!usedMarks.has(t)&&Math.abs(t.x-markH.x)<60&&Math.abs(t.y-row.y)<Math.max(6,(t.size||8)*0.5)&&titleMarks(t.str)).sort((a,b)=>Math.abs(a.y-row.y)-Math.abs(b.y-row.y))[0];
   // Without the "Кол." header (lost by OCR) the quantity is the first whole number right of the mark.
   const qty=qtyH?row.items.find(t=>Math.abs(t.x-qtyH.x)<40&&/^\d{1,4}$/.test(t.str))
    // (only when the mass follows it, so that a lone mass is not taken for a quantity).
    :markCell&&(n=>n.length>=2&&/^\d{1,2}$/.test(n[0].str)&&Number(n[1].str.replace(",","."))>=Number(n[0].str)?n[0]:null)(row.items.filter(t=>t.x>markCell.x+markCell.width&&t.x<markCell.x+200&&/^\d+(?:[,.]\d+)?$/.test(t.str)).sort((a,b)=>a.x-b.x));
   // A row whose mark OCR lost: its count still belongs to the mark of a one-mark sheet.
   if(!markCell&&qty&&qtyH){out.unnamed=(out.unnamed||0)+1;out.unnamedCount=Number(qty.str)}
   if(!markCell||!qty)continue;
   usedMarks.add(markCell);
   // The mass column is right of the quantity column; never take the quantity again.
   const number=t=>t!==qty&&t.x>qty.x+10&&/^\d+(?:[,.]\d+)?$/.test(t.str);
   const mass=massH?row.items.find(t=>number(t)&&Math.abs(t.x-massH.x)<30):qtyH?null:row.items.filter(number).sort((a,b)=>a.x-b.x)[0];
   // Only the mass of all pieces filled in («Вес, кг: марки | всех»): the mark weighs that over the count.
   const all=!mass&&allH&&row.items.find(t=>number(t)&&Math.abs(t.x-allH.x)<30);
   const count=Number(qty.str),kg=mass?Number(mass.str.replace(",",".")):all&&count?Math.round(Number(all.str.replace(",","."))/count*10)/10:null;
   for(const mark of titleMarks(markCell.str))out.push({mark,count,mass_kg:kg,...(markCell.ocr?{ocr:true}:{})})
  }
 }
 return out
}

// КМ "Ведомость элементов": the first cell holds the mark, the row the profile and steel.
function elementTable(texts){
 const title=texts.find(t=>/^Ведомость элементов/u.test(t.str));
 if(!title)return[];
 // The table sits beside a drawing: only what is right of its «Марка» column and below its title is the table.
 const head=texts.filter(t=>/^Марка$/u.test(t.str.trim())&&t.y>title.y&&t.y<title.y+120&&Math.abs(t.x-title.x)<600).sort((a,b)=>a.y-b.y)[0];
 const area=head?texts.filter(t=>t.x>=head.x-40&&t.y>title.y):texts;
 const out=[];
 for(const row of rowsOf(area)){
  const first=row.items[0];if(!first)continue;
  // A mark without a number («Рр», «Рн» — rails of a wall) in the «Марка» column is a mark too.
  const word=head&&Math.abs(first.x-head.x)<60&&/^[А-ЯЁ][а-яё]{1,2}$/u.test(first.str.trim())&&!/^(?:Поз|Лист|Вид|Узел|Ось|См)$/u.test(first.str.trim());
  const marks=titleMarks(first.str)||(word?[first.str.trim()]:null);if(!marks)continue;
  const cells=row.items.slice(1).filter(horizontal);
  // Profiles are often split into a symbol and a size: "ｴ" + "50Ш2".
  const joined=cells.map(t=>t.str);let profile="";
  for(let i=0;i<joined.length&&!profile;i++){
   const pair=(joined[i]+" "+(joined[i+1]||"")).trim();
   if(/^(?:ｴ|I)\s*\d{2}[БКШМ]\d?$/u.test(pair))profile=pair.replace(/^ｴ/u,"I").replace(/\s+/g,"");
   else if(SIZE.test(joined[i]))profile=joined[i].replace(/^ｴ/u,"I").replace(/^[-−—]\s*t?\s*/u,"−").replace(/\s*([хx×])\s*/gu,"$1")
  }
  const steel=(joined.find(s=>STEEL.test(s))||"").replace(/\s+/g,"");
  if(profile||steel)for(const mark of marks)out.push({mark,profile,steel,y:first.y,x:first.x})
 }
 // A mark of several parts is written one part per line round the mark's row, each with its position number:
 // «1 −t20 х 380», «2 −t25 х 290». The parts from position 1 on are one group; the group goes to the mark whose row
 // is inside it. A rolled section among them is the profile (a beam with plates), plates alone a welded section.
 const cell=t=>horizontal(t)&&SIZE.test(t.str.trim())&&(!head||t.x>head.x+120);
 const parts=area.filter(cell).sort((a,b)=>a.y-b.y).map(t=>({t,pos:area.find(p=>/^\d$/.test(p.str.trim())&&Math.abs(p.y-t.y)<5&&p.x<t.x&&t.x-p.x<70)?.str.trim()||""}));
 const groups=[];
 for(const p of parts){const g=groups[groups.length-1];if(g&&p.pos&&p.pos!=="1"&&p.t.y-g.y1<40){g.items.push(p.t);g.y1=p.t.y}else groups.push({y0:p.t.y,y1:p.t.y,items:[p.t]})}
 const size=t=>t.str.trim().replace(/^ｴ/u,"I").replace(/^[-−—]\s*t?\s*/u,"−").replace(/\s*[хx×]\s*/gu,"×");
 for(const g of groups){
  if(g.items.length<2)continue;
  const r=out.filter(r=>r.y>=g.y0-6&&r.y<=g.y1+6).sort((a,b)=>Math.abs(a.y-(g.y0+g.y1)/2)-Math.abs(b.y-(g.y0+g.y1)/2))[0];if(!r)continue;
  const list=g.items.map(size),rolled=list.find(x=>!/^−/u.test(x));
  r.profile=rolled||"Сварной "+list.join(", ")
 }
 return out.map(({y,x,...r})=>r)
}

// "Спецификация на отправочный элемент": per mark the main profile (the longest rolled section of its group)
// and the mass of the mark. Groups end with "1% на сварку"; "обратно К1" takes the profile of К1.
// The I-beam sign comes from a symbol font as "}" or "ｴ": "} 30Ш2" is I30Ш2; the channel sign of the same fonts as «~»:
// «~ 12» is [12, the angle sign as «{»: «{ 50х5» is L50х5.
const ROLLED=/двутавр|швеллер|уголок|труба|^Тр\s*\.|^Гн|[□▢]\s*\d|^∟|^L\s*\d|^\[|^~\s*\d{1,2}(?:[УПАЭЛС]|\s|$)|^\{\s*\d{2,3}\s*[хx×]\s*\d|^I\s*\d|ｴ|^[}]?\s*\d{2}[БКШМП]\d?$|^Св\.?\s*I?\s*\d{2}\s*[БКШ]/iu;
const LOOK={T:"Т",p:"р",P:"Р",x:"х",X:"Х",H:"Н",K:"К",M:"М",a:"а",e:"е",o:"о",c:"с",B:"В",C:"С",y:"у"};
const cyr=str=>String(str).replace(/(^|[^A-Za-z])([A-Za-z]{1,3})(?=[\d.\s]|$)/g,(m,pre,w)=>pre+(w==="L"||w==="I"?w:[...w].map(c=>LOOK[c]||c).join("")));
// OCR digits of the italic in a size: «&» is 4, «О» 0, «б» 6, «З» 3 («Тр.1&0х&» is Тр.140х4); «Сварной двутавр 50ШС2»,
// «Двутавр сварной 50Ш2», «Св. двутавр 40КС2» (and the reading «орнойдвутавр») are welded I-beams «Св.I…».
const ocrDigits=d=>d.replace(/&/g,"4").replace(/[Оо]/g,"0").replace(/б/g,"6").replace(/З/g,"3");
const sizeDigits=v=>v.replace(/[0-9&ОобЗ]{1,4}(?:[хx×][0-9&ОобЗ]{1,4}){1,2}/gu,m=>/\d/.test(m)?ocrDigits(m):m)
 .replace(/(^|[\s.I])([0-9&ОобЗ]{2})(?=[БКШМ]С?\d)/u,(m,a,d)=>/[\d&ЗО]/.test(d)?a+ocrDigits(d):m);
// OCR of an italic CAD font reads «в» as «б» and the «дв» of «двутавр» as «Об»: «Обутавр 35Ш2», «шбеллер 20», «уголак 160х14».
// («тавр» alone is a T-section and stays.) A box sign of a font read as a letter: «Тр.r140х4», «Тр.з160х5» are «Тр.□…»;
// «Тр.3120х5» is «Тр.□120х5» (a «3» before three digits: no tube is 3120 across, it was drawn through the walls);
// «Трубаr140х4» is «Тр.□140х4» too — a square tube 140×140×4 (ГПЭС К96, the engineer, 27.10.2026: «это профильная труба 140х140х4»).
// A monorail beam «балка 24М» is the I-beam 24М (ГОСТ 19425). A welded I-beam «Св I50 ШС2» is «Св.I50ШС2»; OCR digits of a designation: «IЗОК1» is I30К1, its italic «1» read as
// «Т» («Сборной двутавр &5ШСТ» is Св.I45ШС1); «Дбутодр» is «двутавр».
const PROFILE_WORDS=[[/^(?:\S*рной\s*[дО0о]?[вбё]\s?ут[ао][вбёд]р|двутавр\s*сварной|С[вбё]\.?\s*[дО0оа]?[вбё]\s?ут[ао][вбёд]р)\s*(?=[0-9&ОЗ])/iu,"Св.I"],[/^Св\.?\s*I?\s*([0-9&ОЗ]{2})\s*([БКШ]С?)([\dТ])$/iu,(m,a,b,c)=>"Св.I"+ocrDigits(a)+b+(c==="Т"?"1":c)],[/^I\s*([0-9ЗОо]{2,3})\s*([БКШМ]С?)([\dТ])$/u,(m,a,b,c)=>"I"+a.replace(/З/g,"3").replace(/[Оо]/g,"0")+b+(c==="Т"?"1":c)],[/^[дО0оа][вбё]\s?ут[ао][вбёд]р/iu,"двутавр"],[/^[бБ6]ал[кх][аи]\s*(?=\d{2}\s*М)/u,"двутавр "],[/^ш[вб]ел+ер/iu,"швеллер"],[/^(?:[ПГLШ∟]?\s*угол[оа]к|Чгол[оа]к)/iu,"уголок"],[/^Труба\s*(?:профильная\s*)?(?:[rгзо0□▢](?=\s*\d{2,3}\s*[хx×])|3(?=\d{3}\s*[хx×]))/iu,"Тр.□"],[/^(Тр\.?|Гн\.?)\s*(?:[rгзо0](?=\s*\d{2,3}\s*[хx×])|3(?=\d{3}\s*[хx×]))/u,"$1□"]];
const profileWords=str=>{const v=PROFILE_WORDS.reduce((v,[re,w])=>v.replace(re,w),String(str).trim());return/^(?:Тр|Гн|I|L|\[|[−–—-]|Св\.I)|двутавр|швеллер|уголок|труба/iu.test(v)?sizeDigits(v):v};
function normProfile(str){
 let s=profileWords(cyr(str)).replace(/\s*(?:\([^)]*\)?|С\d{3}(?:-\d)?\))\s*$/u,"").replace(/^Сб\.?\s*/iu,"").trim();
 s=s.replace(/^двутавр\s*/iu,"I").replace(/^[ｴ}]\s*/u,"I").replace(/^~\s*(?=\d)/u,"[").replace(/^\{\s*(?=\d)/u,"L").replace(/^(\d{2}[БКШМП]\d?)$/u,"I$1").replace(/^швеллер\s*/iu,"[").replace(/^уголок\s*/iu,"L").replace(/^∟\s*/u,"L");
 return s.replace(/\s+/g,"").replace(/^(I|Св\.I)(\d{2,3}[БКШМ]С?)Т$/u,"$1$21")
}
// A text of the «Сечение» column that is a section: a rolled profile, a plate «−220х10», a sheet, a bar (its size: the
// steel «(С255)» after it is not one — «двутавр С255» is a name whose size OCR lost). A bare size has two digits before
// its «х» («2х4» is what is left of «□120х4», not a section).
const sectionLike=str=>{const t=profileWords(cyr(String(str||"")));return/\d/.test(t.replace(/\(?\s*С\d{3}(?:-\d)?\s*\)?/gu,""))&&(ROLLED.test(t)||/^[−–—-]\s*t?\s*\d{1,4}\s*[хx×]\s*\d|^\d{2,4}\s*[хx×]\s*\d|лист|круг|^[Øø∅]|полоса|квадрат|арматур|профнастил|рифл/iu.test(t))};
// The row «1% на сварку» that closes the parts of a mark (OCR: «сборку», «но сборку», «на сборки.», the «1%» alone or
// «19%»).
const WELD_ROW=/н[ао]\s+с[вб][ао]р[кх][уи]|^\d{1,2}\s*%/iu;
// The groups of rows of a specification, one a mark: up to and including each «1% на сварку» (left of the length column:
// «29%» in the masses is a «294» read badly); a row «Все позиции по …» («Все детали по В60»), «обратно …», «позиции 2, 3 по Ф17» opens the
// group of the next mark even without the weld row before it, and a row that is a whole mark («Ф85 | подобна Ф78, все
// позиции по Ф78 | 317») is a group of its own.
function specGroups(rows,{lenX=Infinity,whole=()=>false}={}){
 const groups=[];let cur=[];
 for(const r of rows){
  const one=whole(r);
  // (On the line: «позиции» and «6,7 по Ф60», «1 | на | сборку» may be read apart.)
  const line=r.items.slice().sort((a,b)=>a.x-b.x).map(t=>t.str).join(" "),left=r.items.filter(t=>t.x<lenX).sort((a,b)=>a.x-b.x).map(t=>t.str).join(" ");
  if(cur.length&&(one||/(?:позиции|детали)\s+по|обратн[ао]|по\s+марке|по[дб]о[дб]н|позиции\s+[\d,\s-]+\s+по/iu.test(line))){groups.push(cur);cur=[]}
  cur.push(r);if(one||r.items.some(t=>t.x<lenX&&WELD_ROW.test(t.str))||WELD_ROW.test(left)){groups.push(cur);cur=[]}
 }
 if(cur.length)groups.push(cur);
 return groups
}
// A row that is a whole mark: «подобна …» (OCR: «пободна», «побобна»), or «все позиции по …» with the mark in the row itself or
// after «обратна» (its mark lost by the reading: «обратна Ф60, все позиции по Ф60 | 546» of Ф61), without «кроме».
const wholeRow=(r,isLabel)=>{const line=r.items.map(t=>t.str).join(" ");return!/кроме/iu.test(line)&&(/по[дб]о[дб]н/iu.test(line)||/(?:позиции|детали)\s+по/iu.test(line)&&(r.items.some(isLabel)||/обратн/iu.test(line)))};
// A length of the «Длина» column, its italic digits as OCR reads them («&130» is 4130).
const lenText=(r,lenH)=>{const t=r.items.find(t=>Math.abs(t.x-lenH.x)<40&&/^[\d&ОобЗ]{2,5}$/u.test(t.str)&&/\d[^\d]*\d|\d{2}/.test(t.str));return t&&{...t,str:ocrDigits(t.str)}};
// A section the reading left as a bare size «140х4» (its box sign lost): what its mass per metre says it is — a square
// tube A×A×s (about 4s(A−s) mm² of steel), an angle A×A×s (s(2A−s)) or a plate A×s — within 12 %.
function bareSection(sec,kgPerM){
 const m=/^(\d{2,3})\s*[хx×]\s*(\d{1,2}(?:[,.]\d)?)$/u.exec(String(sec).trim());if(!m||!(kgPerM>0))return null;
 const a=Number(m[1]),t=Number(m[2].replace(",","."));if(t*2>=a)return null;
 // (Rolled angles are no thinner than a twentieth of their leg, tubes than a fiftieth of their side: «250х6» is a plate.)
 const k=.00785,kinds=[["□",4*t*(a-t)*k],["L",t*(2*a-t)*k]].filter(([sign])=>a/t<=(sign==="L"?20:50));
 const best=kinds.map(([sign,w])=>({sign,d:Math.abs(w-kgPerM)/kgPerM})).sort((x,y)=>x.d-y.d)[0];
 return best&&best.d<=.12?best.sign+m[1]+"х"+m[2]:null
}
// The header of a «Спецификация» table under its title: the words of its columns, «Марка», «Сечение», «Длина».
// The title stands over the middle of the table, so «Марка» may be some 300 left of it (К76: 124); the marks' column is
// the «Марка» nearest left of «Сечение» (another table's header farther left is not it; «Марка стали» is right of it).
// Header words only: the first data row sits right under them («т», «н» of «Кол-во» alone: «Тр.160х5» is a row).
// (The words of a table beside it, «Требуется изготовить», are left of its «Марка» and not its header.)
function specHeader(texts,head){
 const words=texts.filter(t=>t.y>head.y-2&&t.y<head.y+80&&t.x>head.x-320&&t.x<head.x+900&&
  /^(Марка|Поз|№|Сечение|Длина|Кол|Масса|шт|общ|элем|марки|мм|стали|Примечание|дет|всех)|^[тн]\.?$/iu.test(t.str));
 const secH=words.filter(t=>/^Сечение/u.test(t.str)).sort((a,b)=>Math.abs(a.x-head.x)-Math.abs(b.x-head.x))[0];
 const markH=secH&&words.filter(t=>/^Марка$/u.test(t.str)&&t.x<secH.x&&secH.x-t.x<260).sort((a,b)=>b.x-a.x)[0];
 const lenH=secH&&words.filter(t=>/^Длина/u.test(t.str)&&t.x>secH.x).sort((a,b)=>a.x-b.x)[0];
 // (The header is the lines of «Сечение» up to its «Примечание»: words of a table beside it are not.)
 const noteH=lenH&&words.filter(t=>/^Примечание/u.test(t.str)&&t.x>lenH.x).sort((a,b)=>a.x-b.x)[0];
 const x1=noteH?noteH.x+(noteH.width||60)+40:Infinity;
 return markH&&lenH?{hdr:words.filter(t=>t.x>markH.x-30&&t.x<x1&&t.y<secH.y+2.5*(secH.size||12)),markH,secH,lenH,noteH}:{hdr:words}
}
// A specification ends where the next table under it begins: «Требуется изготовить» (its «изготовить» alone when OCR lost
// the first word), «Выборка металла», «Ведомость …» — under the width of the table (its header), not only its first
// columns; a table beside it is not.
const tableEnd=(texts,top,markH,hdr)=>Math.min(top+1600,...texts.filter(t=>t.y>top+4&&t.y<top+1600&&t.x>markH.x-60&&t.x<Math.max(...hdr.map(h=>h.x))+60&&/^(Тре[бдв]уется|Выборка|Ведомость)|^изготовить$/u.test(t.str)).map(t=>t.y-(t.size||10)));
// The cells of the «Сечение» column the reading left empty or unreadable, in rows that have a length: OCR reads them
// again one by one (a pasted table in a CAD italic: «Тр.□160х5» doubted as a whole by Tesseract and dropped).
function specCells(texts){
 const out=[];
 for(const head of texts.filter(t=>/^Спецификац/u.test(t.str))){
  const {hdr,markH,secH,lenH}=specHeader(texts,head);
  if(!markH)continue;
  const top=Math.max(...hdr.map(t=>t.y)),rows=[];
  const end=tableEnd(texts,top,markH,hdr);
  for(const r of rowsOf(texts.filter(t=>t.y>top+4&&t.y<end&&t.x>markH.x-60&&t.x<lenH.x+60))){if(rows.length&&r.y-rows[rows.length-1].y>80)break;rows.push(r)}
  // The column: from the right of the position numbers to the length column.
  const pos=rows.flatMap(r=>r.items).filter(t=>/^\d{1,2}$/.test(t.str)&&t.x<secH.x-15&&t.x>markH.x+20),w=t=>t.width||String(t.str).length*(t.size||8)*0.55;
  const x0=pos.length?Math.max(...pos.map(t=>t.x+w(t)))+3:secH.x-Math.max(20,lenH.x-secH.x-w(secH)),x1=lenH.x-3;
  for(const r of rows){
   const len=lenText(r,lenH);if(!len)continue;
   const sec=r.items.filter(t=>t.x>=x0-5&&t.x<x1).map(t=>t.str).join(" ");if(sectionLike(sec))continue;
   // One line high: a length the reading took with the row under it is taller than its font.
   const s=Math.min(len.size||10,median(r.items.map(t=>t.size||10))*1.15);out.push({kind:"section",x:x0,y:r.y-s*1.15,w:x1-x0,h:s*1.45})
  }
  // A row of numbers right of the length (the count, the masses) with neither its section nor its length read: both read
  // again («1 | 198,5 | 199» of «двутавр 25Ш1 4502»).
  const kol=hdr.filter(t=>/^(т|Кол)/u.test(t.str)&&t.x>lenH.x).sort((a,b)=>a.x-b.x)[0],lx1=kol?kol.x-6:lenH.x+(lenH.width||30)+20;
  for(const r of rowsOf(texts.filter(t=>t.y>top+4&&t.y<(rows.length?rows[rows.length-1].y+4:top)&&t.x>markH.x-60&&t.x<lenH.x+260))){
   const nums=r.items.filter(t=>t.x>lx1-4&&/^\d+(?:[,.]\d+)?$/.test(t.str));
   if(nums.length<2||lenText(r,lenH)||r.items.some(t=>t.x<lx1&&(t.x>=x0-5&&sectionLike(t.str)||/позиц|детали\s+по|обратн|по[дб]о[дб]н|н[ао]\s+с[вб]|%/iu.test(t.str))))continue;
   const s=median(nums.map(t=>t.size||10));
   out.push({kind:"section",x:x0,y:r.y-s*1.15,w:x1-x0,h:s*1.45},{kind:"length",x:x1,y:r.y-s*1.15,w:lx1-x1,h:s*1.45})
  }
  // A group of rows (up to its «1% на сварку») without its mark: the mark column read again across the middle of the group
  // (a row «подобна Ф106, все позиции по Ф106» is a group too).
  const isLabel=t=>Math.abs(t.x-markH.x)<45&&titleMarks(t.str);
  const groups=specGroups(rows,{lenX:lenH.x-10,whole:r=>wholeRow(r,isLabel)});
  const mx1=pos.length?Math.min(...pos.map(t=>t.x))-3:secH.x-40;
  for(const g of groups){
   if(g.length<2&&!(g.length===1&&wholeRow(g[0],()=>true))||g.some(r=>r.items.some(isLabel)))continue;
   const s=Math.max(...g.flatMap(r=>r.items).map(t=>t.size||10)),mid=(g[0].y+g[g.length-1].y)/2;
   out.push({kind:"mark",x:markH.x-25,y:mid-s*1.3,w:mx1-(markH.x-25),h:s*2.2})
  }
 }
 // A row of «Требуется изготовить» with its numbers and without its mark.
 for(const head of texts.filter(t=>/^Тре[бдв]уется|^изготовить$|^Таблица\s+отправочных/u.test(t.str))){
  const hdr=texts.filter(t=>t.y>head.y&&t.y<head.y+70&&Math.abs(t.x-head.x)<260&&/^(Марка|Отправочная|Отпр|марка)/u.test(t.str));
  const markH=requiredMarkHead(hdr,head);if(!markH)continue;
  const top=Math.max(...hdr.map(t=>t.y));
  for(const row of rowsOf(texts.filter(t=>t.y>top+4&&t.y<top+900&&t.x>markH.x-60&&t.x<markH.x+340))){
   if(row.items.some(t=>/^(Всего|Итого)/u.test(t.str)))break;
   const nums=row.items.filter(t=>t.x>markH.x+40&&/^\d+(?:[,.]\d+)?$/.test(t.str));
   if(nums.length<2||texts.some(t=>Math.abs(t.x-markH.x)<60&&Math.abs(t.y-row.y)<8&&titleMarks(t.str)))continue;
   const s=nums[0].size||10,x1=Math.min(...nums.map(t=>t.x))-4;
   out.push({kind:"mark",x:markH.x-30,y:row.y-s*1.3,w:x1-(markH.x-30),h:s*1.7})
  }
 }
 return out
}
// A cell read again holds what its column holds: a section, or a mark of one shipping element (OCR digits of the
// italic: «Вб6» is В66, «КЗ» К3, «ФО» Ф0). Returns the text taken, or null.
// (The italic capital of a mark read as a small letter: «в7» in the mark column is В7.)
const markDigits=str=>String(str).replace(/\s+/g,"").replace(/^([А-ЯЁа-яё][А-ЯЁ]{0,2})([0-9бЗОо]{1,4})$/u,(m,a,b)=>a.toUpperCase()+b.replace(/б/g,"6").replace(/З/g,"3").replace(/[Оо]/g,"0"));
// A box or angle sign read as a letter before a bare size («а 140х4», «В 120х4»): the size, its kind by its mass.
const cellAccept={length:str=>{const v=ocrDigits(String(str).replace(/\s+/g,""));return/^\d{2,5}$/.test(v)?v:null},section:str=>{const bare=/^\S\s+(\d{2,3}\s*[хx×]\s*\d{1,2})$/u.exec(String(str).trim());return bare&&!sectionLike(str)?bare[1]:sectionLike(str)?str:null},mark:str=>{const v=markDigits(str),m=titleMarks(v);return m&&m.length===1?v:null}};
// A specification pasted as a picture (its header read by OCR): the area of the table, from its title to its last row,
// for the rules of its cells (specGrid).
function specPictures(texts){
 const out=[],w=t=>t.width||String(t.str).length*(t.size||8)*0.55;
 for(const head of texts.filter(t=>/^Спецификац/u.test(t.str))){
  const h=specHeader(texts,head);if(!h.markH||!(h.secH.ocr||h.lenH.ocr))continue;
  const top=Math.max(...h.hdr.map(t=>t.y)),right=h.noteH?h.noteH.x+w(h.noteH)+50:Math.max(...h.hdr.map(t=>t.x+w(t)))+60,rows=[];
  for(const r of rowsOf(texts.filter(t=>t.y>top+4&&t.y<top+1600&&t.x>h.markH.x-60&&t.x<right))){if(rows.length&&r.y-rows[rows.length-1].y>80)break;rows.push(r)}
  const end=Math.min(tableEnd(texts,top,h.markH,h.hdr),(rows.length?rows[rows.length-1].y:top)+40),x0=h.markH.x-70,y0=head.y-4;
  out.push({...h,top,rect:{x:x0,y:y0,w:right-x0,h:end-y0}})
 }
 return out
}
// Kilograms in a metre of a section of a specification: a plate «−65х6» by its sizes, a rolled one by the sortament
// (the global base); null when it is not known.
function kgPerMetre(section){
 const p=/^[−–—-]\s*(\d{1,4}(?:[,.]\d)?)\s*[хx×]\s*(\d{1,4}(?:[,.]\d)?)$/u.exec(section);
 if(p)return Number(p[1].replace(",","."))*Number(p[2].replace(",","."))*7.85e-3;
 if(!globalKb){try{globalKb=require("./ai-global-kb").createGlobalKnowledge()}catch{return null}}
 const r=globalKb.findProfile(section,{});return r&&r.mass_kg_m>0?r.mass_kg_m:null
}
// What a cell of numbers holds as the italic is read: «&» 4, «О» 0, «б» 6, «З» 3, «!» 1, and a cell «Ш» or «И» alone
// is «11» (two slanted ones, ГПЭС К26: the count 11 of поз. 6, поз. 11).
const cellDigits=s=>{const v=ocrDigits(String(s||"").replace(/\s+/g,"")).replace(/!/g,"1");return/^[ШИ]$/u.test(v)?"11":v};
// A length: whole millimetres — a gap of the italic read as a sign between its digits («14:0», «14-0», «14.0» of 140) is
// none.
const cellLength=s=>{const v=cellDigits(s).replace(/[)\]|.,:;]+$/u,""),j=/^(\d{1,3})[.,:-](\d{1,3})$/u.exec(v);
 return j&&(j[1]+j[2]).length<=5?Number(j[1]+j[2]):/^\d{2,5}$/.test(v)?Number(v):null};
// The masses a cell may be: as read, or with the comma it lost when it has none («403» of 40,3; «03» of 0,3); unit is
// the last digit's, for the rounding.
const cellMasses=s=>{const v=cellDigits(s).replace(/[)\]|]+$/u,"");
 if(/^\d+[,.]\d+$/.test(v))return[{v:Number(v.replace(",",".")),unit:10**-v.split(/[,.]/)[1].length}];
 if(!/^\d+$/.test(v))return[];
 const lost=v.length>=2?[{v:Number(v)/10,unit:0.1,comma:true}]:[];return v.length>=2&&v[0]==="0"?lost:[{v:Number(v),unit:1},...lost]};
// The sections a cell may be: as read, its angle sign read as «1» («1125х10» is ∟125×10), a bare size without its dash
// (a plate) or an angle; each with its kilograms in a metre.
function cellSections(s){
 // (The steel after a size, its bracket or its letter lost: «50х22 С255)», «190х10 0255)», «500х40 35-3)».)
 const t=profileWords(cyr(String(s||"").trim().replace(/(\d{2,4}\s*[хx×]\s*\d{1,3})\s+\(?\s*[СC0О]?\s*\d{2,3}(?:\s*-\s*\d)?\s*\)?$/u,"$1")));if(!/\d/.test(t))return[];
 const n=ROLLED.test(t)?normProfile(t):t.replace(/\s*\([^)]*\)?\s*$/u,"").replace(/^[—–-]\s*/u,"−").replace(/\s+/g,"");
 // (and «\» for the italic «4»: «250х1\» is −250×14)
 const out=[n],bare=/^(1?)(\d{2,4}[хx×]\d{1,3}(?:[хx×]\d{1,2})?)$/u.exec(cellDigits(n).replace(/(\d)\\/g,"$14"));
 if(bare){if(bare[1]&&/^\d{2,3}[хx×]/u.test(bare[2]))out.push("L"+bare[2]);out.push("−"+bare[1]+bare[2],"L"+bare[1]+bare[2])}
 return[...new Set(out)].filter(sectionLike).map((section,i)=>({section,kgm:kgPerMetre(section),alt:i>0}))
}
// The section a note cuts the part from («из ∟125х10 отб.», its sign read as «1», «[»): kilograms in its metre.
const sourceKgm=note=>{const m=/из\s*\S?\s*(\d{2,3})\s*[хx×]\s*(\d{1,2})(?:\s*[хx×]\s*(\d{1,2}))?(?!\d)/u.exec(String(note||"").replace(/&/g,"4"));
 return m?kgPerMetre("L"+m[1]+"х"+m[2]+(m[3]?"х"+m[3]:"")):null};
// The readings of one row of the grid that agree: the mass of one part (as read or with its comma) is its section's
// kilograms in a metre × its length, within 4 % and the rounding of the mass (by the section the note cuts it from, if
// any). Of those that agree the nearest, then the surest. None — a length one digit off what was read that alone agrees
// within 3 % (the mass of the row repairs it: by_mass); else in each cell the value most readings give (a known
// section before one the base does not know). The count: as read, else the mass of all over that of one.
function pickRow(row){
 const all=col=>[...(row.old[col]?[row.old[col]]:[]),...(row.reads[col]||[]).filter(Boolean)];
 const secs=all("section").flatMap(c=>cellSections(c.str).map(v=>({...v,conf:c.confidence})));
 const lens=all("length").map(c=>({v:cellLength(c.str),conf:c.confidence,str:cellDigits(c.str).replace(/[^\d]/g,"")})).filter(c=>c.v!==null);
 const parts=all("part").flatMap(c=>cellMasses(c.str).map(m=>({...m,conf:c.confidence-(m.comma?3:0)})));
 const src=all("note").map(c=>sourceKgm(c.str)).find(Boolean)||null,kgmOf=s=>src&&/^L/.test(s.section)?src:s.kgm;
 const off=(kgm,L,m,share)=>Math.abs(kgm*L/1000-m.v)/(m.v*share+m.unit/2);
 // (Each value by the readings that give it, the best first; then by prefer.)
 const vote=(list,key,prefer=()=>0)=>{const m=new Map();for(const c of list){const k=key(c),e=m.get(k)||{c,score:0};e.score+=Math.max(1,c.conf);m.set(k,e)}
  return[...m.values()].sort((a,b)=>b.score-a.score||prefer(b.c)-prefer(a.c)).map(e=>e.c)};
 const out={pos:null,count:null,count2:null,all:null};
 // (A position changed by a revision: «13 изм.».)
 for(const col of ["pos","count","count2"]){const b=vote(all(col).map(c=>({v:cellDigits(String(c.str).replace(/\s*изм\.?$/u,"")),conf:c.confidence})).filter(c=>/^\d{1,3}$/.test(c.v)),c=>c.v)[0];if(b)out[col]=Number(b.v)}
 {const b=vote(all("all").flatMap(c=>cellMasses(c.str).filter(m=>!m.comma).map(m=>({...m,conf:c.confidence}))),c=>c.v)[0];if(b)out.all=b}
 const totals=all("all").flatMap(c=>cellMasses(c.str));
 const counted=m=>{if(out.count!==null||!m)return out;
  const ks=totals.map(t=>{const n=t.v/m.v-(out.count2||0),k=Math.round(n);return{k,e:Math.abs(n-k)/Math.max(1,k)}}).filter(x=>x.k>=1&&x.e<=0.06).sort((a,b)=>a.e-b.e);
  return ks.length?{...out,count:ks[0].k,count_by_mass:true}:out};
 let best=null;
 for(const s of secs){const kgm=kgmOf(s);if(!kgm)continue;
  for(const l of lens)for(const m of parts){const e=off(kgm,l.v,m,0.04);if(e>1)continue;
   const score=-e*100+s.conf+l.conf+m.conf-(s.alt?5:0);if(!best||score>best.score)best={score,s,l,m}}}
 if(best)return{...counted(best.m),section:best.s.section,length:best.l.v,part:best.m,sure:true};
 // (The mass of one part: one that the count makes the mass of all, when both are read — «80» of «8,0» for 1 and 8.)
 const fit=out.count!==null&&out.all?parts.filter(m=>Math.abs(m.v*(out.count+(out.count2||0))-out.all.v)<=out.all.v*0.06+out.all.unit/2):[];
 const s=vote(secs,c=>c.section,c=>(kgmOf(c)?2:0)+(c.alt?0:1))[0]||null,l=vote(lens,c=>c.v)[0]||null,m=vote(fit.length?fit:parts,c=>c.v,c=>c.comma?0:1)[0]||null;
 // (One digit off: each one put in, changed or dropped in turn, by each known section the cell may be.)
 // (Only once its cells were read again at both slants, by a section read surely, and when no two readings of the length
 // agree surely — «900» read so four times stays, its mass «113» of 141,3 is what is off; of two lengths that fit, the one
 // more readings come to — «140» from «150» and «10» over «1450» with the mass «27» from «150» alone.)
 const fits=new Map();
 if((row.reads["length"]||[]).length>=2&&!lens.some(c=>c.conf>=90&&lens.some(o=>o!==c&&o.conf>=90&&o.v===c.v)))lens.forEach((c,k)=>{const vs=new Set();
  for(let i=0;i<=c.str.length;i++)for(const d of [..."0123456789",""])for(const v of [c.str.slice(0,i)+d+c.str.slice(i),c.str.slice(0,i)+d+c.str.slice(i+1)])if(/^[1-9]\d{1,4}$/.test(v))vs.add(v);
  for(const v of vs)for(const sv of secs.filter(x=>kgmOf(x)&&x.conf>=50))for(const mv of parts)if(off(kgmOf(sv),Number(v),mv,0.03)<=1){
   const key=v+"|"+mv.v;if(!fits.has(key))fits.set(key,{len:Number(v),m:mv,secs:[],by:new Map()});const f=fits.get(key);f.secs.push(sv);f.by.set(k,Math.max(1,c.conf))}});
 const ranked=[...fits.values()].map(f=>({...f,score:[...f.by.values()].reduce((a,b)=>a+b,0)})).sort((a,b)=>b.score-a.score);
 if(ranked.length&&(ranked.length===1||ranked[0].score>ranked[1].score)){const f=ranked[0],sec=vote(f.secs,c=>c.section,c=>c.alt?0:1)[0];
  return{...counted(f.m),section:sec.section,length:f.len,part:f.m,sure:true,by_mass:true}}
 // (A section whose metre the base does not know — «Ст.лист −2..20» — cannot be checked: read with its length, it is taken.)
 return{...counted(m),section:s?s.section:null,length:l?l.v:null,part:m,sure:Boolean(s&&l&&!secs.some(kgmOf)&&!/\d{2,4}\s*[хx×]\s*\d/u.test(s.section))}
}
// The cells of a specification pasted as a picture, by the rules of its table (tableRules of ai-ocr): its columns named
// by the words of its header — the position left of «Сечение», «Длина», the counts «т», «н» (under «Кол-во»), the
// masses of one part and of all (under «Масса»), the note — and its rows between the rules under the header, each cell
// with what the reading of the whole picture put in it. need: the cells of the rows whose readings do not agree, to be
// read again one by one (reads, then pickRow).
function specGrid(table,{xs,rowsIn},texts){
 const {hdr,markH,secH,lenH,top,rect}=table,w=t=>t.width||String(t.str).length*(t.size||8)*0.55,mid=t=>t.x+w(t)/2;
 const cols=[];for(let i=0;i+1<xs.length;i++)if(xs[i+1]-xs[i]>=8)cols.push({x0:xs[i],x1:xs[i+1],role:null});
 const colAt=x=>cols.find(c=>x>=c.x0&&x<c.x1),sec=colAt(mid(secH)),len=colAt(mid(lenH));
 if(!sec||!len||sec===len)return null;
 sec.role="section";len.role="length";
 for(const t of hdr){const c=colAt(mid(t));if(!c||c.role)continue;
  if(t===markH)c.role="mark";
  else if(c.x1<=sec.x0+1&&/^(№|Поз|дет)/u.test(t.str))c.role="pos";
  else if(c.x0>=len.x1-1)c.role=/^т\.?$/u.test(t.str)?"count":/^н\.?$/u.test(t.str)?"count2":/^дет/u.test(t.str)?"part":/^(всех|общ)/iu.test(t.str)?"all":/^(марки|элем)/u.test(t.str)?"markMass":/^Примечание/u.test(t.str)?"note":null}
 // (Columns under «Кол-во» and «Масса» whose own words the reading lost: in their order.)
 for(const [re,roles] of [[/^Кол/u,["count","count2"]],[/^Масса/u,["part","all","markMass"]]]){const h=hdr.find(t=>re.test(t.str));if(!h)continue;
  const under=cols.filter(c=>c.x0>=len.x1-1&&c.x1>h.x-20&&c.x0<h.x+w(h)+20);for(const r of roles)if(!under.some(c=>c.role===r)){const c=under.find(c=>!c.role);if(c)c.role=r}}
 {const i=cols.indexOf(sec);if(i>0&&!cols[i-1].role&&!cols.some(c=>c.role==="pos"))cols[i-1].role="pos"}
 const ys=rowsIn(sec.x0,sec.x1),rows=[];
 for(let i=0;i+1<ys.length;i++){const y0=ys[i],y1=ys[i+1];if(y0<top-3||y1-y0<8||y1>rect.y+rect.h+8)continue;
  const inRow=texts.filter(t=>!t.angle&&t.y-(t.size||8)*0.375>=y0&&t.y-(t.size||8)*0.375<y1&&mid(t)>cols[0].x0&&mid(t)<cols[cols.length-1].x1);
  const old={},cells={};
  for(const c of cols.filter(c=>c.role&&c.role!=="mark"&&c.role!=="markMass")){
   const at=inRow.filter(t=>mid(t)>=c.x0&&mid(t)<c.x1).sort((a,b)=>a.x-b.x);
   if(at.length)old[c.role]={str:at.map(t=>t.str).join(" "),confidence:Math.min(...at.map(t=>t.ocr?t.confidence??60:100)),texts:at};
   cells[c.role]={x:c.x0+2,y:y0+1.5,w:c.x1-c.x0-4,h:y1-y0-3,col:c}}
  const ty=inRow.filter(t=>t.size<=(y1-y0)*0.8).map(t=>t.y);
  const own=inRow.filter(t=>{const c=colAt(mid(t));return!c||c.role!=="mark"&&c.role!=="markMass"});
  rows.push({y0,y1,y:ty.length?median(ty):y1-(y1-y0)*0.28,cells,old,reads:{},texts:own})
 }
 const grid={cols,rows};regrid(grid);return grid
}
// The picks of the rows again (after reads): a part row (a section or a length) whose readings do not agree needs its
// section, length and mass of one part read, one without its count its count; the positions by their order — a run of
// part rows without one (or with one out of order) between two that have theirs takes the numbers between them.
function regrid(grid){
 for(const r of grid.rows){r.pick=pickRow(r);const p=r.pick;r.part=Boolean(p.section||p.length)&&!WELD_ROW.test(r.old.section?.str||"")}
 // (A row between two part rows with neither its section nor its length read is a part row the reading lost — ГПЭС К26
 // «8 | −65х6 | 110 | 13» with only its note read.)
 const at=grid.rows.map((r,i)=>r.part?i:-1).filter(i=>i>=0);
 for(let i=at[0]+1;i<at[at.length-1];i++){const r=grid.rows[i];if(!r.part&&!cellSections(r.old.section?.str).length&&cellLength(r.old.length?.str)===null&&!WELD_ROW.test(r.old.section?.str||""))r.part=true}
 // (Read again: of a row whose readings do not agree, the cells not yet read the same twice surely — 90 and over: «200»
 // at 90 and «13» at 95 of 900 and 141,3 — and the note of an angle, which may name the section it is cut from; a count
 // not read.)
 const parses={section:v=>cellSections(v).length>0,length:v=>cellLength(v)!==null,part:v=>cellMasses(v).length>0,count:v=>/^\d{1,3}$/.test(cellDigits(v))};
 const settled=(r,col)=>{const sure=[r.old[col],...(r.reads[col]||[])].filter(c=>c&&c.confidence>=90&&parses[col](c.str)).map(c=>String(c.str).replace(/\s+/g,""));return sure.some((v,i)=>sure.indexOf(v)!==i)};
 for(const r of grid.rows){const p=r.pick;
  r.need=!r.part?[]:[...(p.sure?[]:["section","length","part"].filter(c=>!settled(r,c))),...(!p.sure&&/^L/.test(p.section||"")?["note"]:[]),...((p.count===null||p.count_by_mass)&&!settled(r,"count")&&!(r.reads.count||[]).length?["count"]:[])].filter(c=>r.cells[c])}
 // (Positions go one by one: a position that fits another within three rows of it is sure; the rows between two sure
 // ones as many apart as their numbers take the numbers between, read otherwise or not — «В», «1» of 13 and 14 between
 // 12 and 15 — and the rows before the first sure one count down to 1 when it is their number.)
 const parts=grid.rows.filter(r=>r.part),pos=k=>parts[k].pick.pos;
 const sure=parts.map((r,k)=>pos(k)!==null&&parts.some((o,j)=>j!==k&&Math.abs(j-k)<=3&&pos(j)!==null&&pos(k)-pos(j)===k-j)?k:-1).filter(k=>k>=0);
 for(let i=0;i+1<sure.length;i++){const a=sure[i],b=sure[i+1];if(pos(b)-pos(a)===b-a)for(let k=a+1;k<b;k++)parts[k].pick.pos=pos(a)+(k-a)}
 if(sure.length&&pos(sure[0])===sure[0]+1)for(let k=0;k<sure[0];k++)parts[k].pick.pos=k+1;
 if(sure.length){const z=sure[sure.length-1];for(let k=z+1;k<parts.length;k++)if(pos(k)!==null&&pos(k)!==pos(z)+(k-z)&&!parts.slice(k+1).some((o,j)=>o.pick.pos===pos(k)+j+1))parts[k].pick.pos=null}
 for(const r of parts)if(r.pick.pos===null&&r.cells.pos&&!r.need.includes("pos"))r.need.push("pos");
 return grid
}
// The texts of the sheet with the cells of the grid as picked: each cell whose pick differs from the reading of the whole
// picture is one text in its middle on the row's line (the texts it had go); a length the mass repaired is by_mass. The
// other texts of a part row are put on its line too (a word read lower — «360» under «−190х12» — is not a row of its own).
function gridTexts(texts,grid){
 const drop=new Set(),add=[],line=new Map();
 for(const r of grid.rows){if(!r.part)continue;const p=r.pick,size=Math.min((r.y1-r.y0)*0.5,...Object.values(r.old).flatMap(o=>o.texts.map(t=>t.size||12)));
  const vals={pos:p.pos,section:p.section,length:p.length,count:p.count,part:p.part?String(p.part.v).replace(".",","):null};
  for(const [col,v] of Object.entries(vals)){const c=r.cells[col];if(v===null||v===undefined||!c)continue;const str=String(v),o=r.old[col];
   if(o&&o.str===str)continue;if(o)for(const t of o.texts)drop.add(t);
   const width=str.length*size*0.5;add.push({str,x:c.x+c.w/2-width/2,y:r.y,width,size,angle:0,ocr:true,grid:true,...(col==="length"&&p.by_mass?{by_mass:true}:{}),confidence:p.sure?90:40})}
  for(const t of r.texts||[])if(!drop.has(t)&&t.y!==r.y)line.set(t,r.y)}
 return[...texts.filter(t=>!drop.has(t)).map(t=>line.has(t)?{...t,y:line.get(t)}:t),...add]
}
// Marks of the groups as OCR read them, put right where the italic digits were read wrong: a mark «Требуется» does not
// list whose one digit read otherwise («Ф62» — 6 for 8 — , «Ф688» with a digit twice, «В13а» with a letter of the
// frame after it) gives the one listed mark not
// taken by another group; else the one that fits between the marks of the groups before and after it («Ф60» between Ф79
// and Ф81 is Ф80).
const MISREAD={"0":"86","1":"7","3":"8","5":"6","6":"85","7":"1","9":"8","8":"630"};
function markVariants(mark){
 const m=/^(\D+)(\d+)(.*)$/u.exec(mark);if(!m)return[];const [,a0,d0,rest]=m,out=new Set();
 // (The italic «1» read «Т» after the letter: «ВТ702» is В1702 — and so В170.)
 for(const [a,d] of a0.length>1&&/[ТT]$/u.test(a0)?[[a0,d0],[a0.slice(0,-1),"1"+d0]]:[[a0,d0]]){
  if(a!==a0)out.add(a+d+rest);
  for(let i=0;i<d.length;i++){
   for(const c of MISREAD[d[i]]||"")out.add(a+d.slice(0,i)+c+d.slice(i+1)+rest);
   if(d.length>=3)out.add(a+d.slice(0,i)+d.slice(i+1)+rest)
  }
 }
 const a=a0,d=d0;
 if(rest)out.add(a+d);
 // («11» of the italic read as one letter: «ФИ3» is Ф113.)
 if(a.length>1&&/[ИНПШ]$/u.test(a))out.add(a.slice(0,-1)+"11"+d+rest);
 // (A digit read as the letter like it after the letter of the mark: «ВА5» is В45.)
 if(a.length>1&&/[АЧЗОБб]$/u.test(a))out.add(a.slice(0,-1)+{А:"4",Ч:"4",З:"3",О:"0",Б:"6",б:"6"}[a.at(-1)]+d+rest);
 out.delete(mark);return[...out]
}
function markNames(groups,order){
 if(!order.length)return groups;
 const listed=new Set(order),taken=new Set(groups.flat().map(x=>x.mark).filter(m=>listed.has(m)));
 const first=groups.map(g=>g.map(x=>{
  if(listed.has(x.mark))return x;
  const hit=markVariants(x.mark).filter(v=>listed.has(v)&&!taken.has(v));
  if(hit.length!==1)return x;taken.add(hit[0]);return{...x,mark:hit[0],fixed:x.mark}
 }));
 const num=s=>{const m=/^(\D+)(\d+)$/u.exec(s||"");return m&&{a:m[1],n:Number(m[2])}};
 const second=first.map((g,i)=>g.map(x=>{
  if(listed.has(x.mark)||x.fixed)return x;
  const prev=num(first.slice(0,i).reverse().find(g=>g.length)?.at(-1).mark),next=num(first.slice(i+1).find(g=>g.length)?.[0].mark);
  if(!prev||!next)return x;
  const hit=markVariants(x.mark).filter(v=>{const c=num(v);return c&&c.a===prev.a&&c.a===next.a&&c.n===prev.n+1&&next.n===c.n+1});
  if(hit.length===1)return{...x,mark:hit[0],fixed:x.mark};
  // (Or the one reading between them: «ВА3» between В42 and В45 is В43, «В0» between В9 and В12 is В10 — its thin
  // italic «1» lost; a label of a number there is left as read.)
  const own=num(x.mark),inside=c=>c&&c.a===prev.a&&c.a===next.a&&c.n>prev.n&&c.n<next.n;
  const d=(/\d+/u.exec(x.mark)||[""])[0],ones=own?Array.from({length:d.length+1},(_,k)=>own.a+d.slice(0,k)+"1"+d.slice(k)):[];
  const among=inside(own)?[]:[...new Set([...markVariants(x.mark),...ones])].filter(v=>inside(num(v)));
  if(among.length===1)return{...x,mark:among[0],fixed:x.mark};
  // (One number left between the marks round it, a label of the same letter read beyond repair — «ВТ2» between В170
  // and В172 — is that number.)
  return prev.a===next.a&&next.n===prev.n+2&&x.mark[0]===prev.a[0]?{...x,mark:prev.a+(prev.n+1),fixed:x.mark}:x
 }));
 // Groups of one label each read beyond repair, between listed marks (or the ends of the table), as many as the marks
 // the list has there not taken: those, in order, when the letters agree — «В21», «В213» round В242 of «В241, В242,
 // В243». (A group without a label among them is left to the rows: no guessing which is which.)
 const ok=g=>g.length&&g.every(x=>listed.has(x.mark)||x.fixed),used=new Set(second.flat().filter(x=>listed.has(x.mark)).map(x=>x.mark));
 for(let i=0;i<second.length;){
  if(ok(second[i])){i++;continue}
  let j=i;while(j<second.length&&!ok(second[j]))j++;
  const run=second.slice(i,j),before=i>0?order.indexOf(second[i-1].at(-1).mark):-1,after=j<second.length?order.indexOf(second[j][0].mark):order.length;
  const slots=before>=-1&&after>before?order.slice(before+1,after).filter(m=>!used.has(m)):[];
  if((i===0||before>=0)&&after>=0&&run.every(g=>g.length===1)&&slots.length===run.length&&run.every((g,k)=>g[0].mark[0]===slots[k][0]))
   run.forEach((g,k)=>{second[i+k]=[{...g[0],mark:slots[k],fixed:g[0].mark}];used.add(slots[k])});
  i=j
 }
 return second
}
function specTable(texts,order=[]){
 const out=[];
 for(const head of texts.filter(t=>/^Спецификац/u.test(t.str))){
  const {hdr,markH,secH,lenH,noteH}=specHeader(texts,head);
  if(!markH)continue;
  // «Марка дет.» left of «Сечение»: the table lists the parts of one shipping mark, not marks.
  // «№ дет.» (positions, a column of its own right of «Марка») is not that.
  const mid=t=>t.x+(t.width||String(t.str).length*(t.size||8)*0.55)/2;
  if(hdr.some(t=>/^дет\.?$/u.test(t.str)&&t.x<secH.x&&t.y>markH.y&&Math.abs(mid(t)-mid(markH))<(markH.width||30)*0.6+6&&
   !texts.some(n=>/^№$/u.test(n.str.trim())&&Math.abs(n.y-t.y)<6&&n.x<t.x&&t.x-n.x<30)))continue;
  const massH=hdr.find(t=>/^(элем|марки)\.?$/u.test(t.str));
  // Without the "марки" header (lost by OCR) the mass of the mark is the column between "всех" and "Марка стали".
  const allH=hdr.find(t=>/^всех$/iu.test(t.str)),steelH=allH&&hdr.filter(t=>/^Марка$/u.test(t.str)&&t.x>allH.x).sort((a,b)=>a.x-b.x)[0];
  const massAt=t=>massH?Math.abs(t.x-massH.x)<16:Boolean(allH&&steelH&&t.x>allH.x+allH.width+4&&t.x<steelH.x-4);
  const top=Math.max(...hdr.map(t=>t.y)),right=Math.max(...hdr.map(t=>t.x))+160;
  const all=rowsOf(texts.filter(t=>t.y>top+4&&t.y<tableEnd(texts,top,markH,hdr)&&t.x>markH.x-60&&t.x<right));
  // The table ends where its rows stop or where the next table ("Требуется", "Выборка") begins.
  const rows=[];for(const r of all){if(rows.length&&r.y-rows[rows.length-1].y>80)break;rows.push(r)}
  const isLabel=t=>Math.abs(t.x-markH.x)<45&&titleMarks(t.str);
  const groups=specGroups(rows,{lenX:lenH.x-10,whole:r=>wholeRow(r,isLabel)});
  const byMark=new Map(),seq=[];let previous=null;
  // A bare size the table types by the mass of one of its rows is that section in the rows whose length or mass the
  // reading lost.
  // CAD fonts mix Latin lookalikes into Cyrillic profile names ("Tp.140x4"); the position number left of the section
  // column is not part of it.
  const secOf=r=>profileWords(cyr(r.items.filter(t=>t.x>=secH.x-60&&t.x<lenH.x-10&&!(/^\d{1,2}$/.test(t.str)&&t.x<secH.x-15)).map(t=>t.str).join(" ").trim()));
  const lenOf=r=>lenText(r,lenH);
  const numsOf=r=>r.items.filter(t=>t.x>lenH.x+15&&t.x<lenH.x+260&&/^\d+(?:[,.]\d+)?$/.test(t.str)).sort((a,b)=>a.x-b.x);
  // The mass of one part: the number under «дет.» of «Масса» (not the second number of the row: a count or a mass the
  // reading lost moves the others — «2 | 9» of «−250х6 380 2 4,5 9»); without that header, the second number.
  const partH=hdr.filter(t=>/^дет\.?$/u.test(t.str)&&t.x>lenH.x).sort((a,b)=>a.x-b.x)[0];
  const partOf=r=>{const nums=numsOf(r);if(!partH)return nums.length>=2?nums[1]:null;
   const c=partH.x+(partH.width||20)/2;return nums.filter(t=>Math.abs(t.x+(t.width||String(t.str).length*(t.size||8)*0.55)/2-c)<28).sort((a,b)=>Math.abs(a.x-c)-Math.abs(b.x-c))[0]||null};
  const typed=new Map(),known=[];
  for(const r of rows){
   const sec=secOf(r),len=lenOf(r),k=sec.replace(/\s+/g,"");
   if(len&&ROLLED.test(sec))known.push({sec,len:Number(len.str),nums:numsOf(r)});
   if(!len||!/^\d{2,3}[хx×]\d{1,2}$/u.test(k)||typed.has(k))continue;
   const part=partOf(r),one=part?Number(part.str.replace(",",".")):null,per=one/Number(len.str)*1000;
   const as=one&&(bareSection(k,per)||!/[,.]/.test(part.str)&&bareSection(k,per/10));if(as)typed.set(k,as)
  }
  // A row whose section the reading lost is the part of another row of the table with the same mass of one part (three
  // digits or more, in the same column) and its length within 1 % («Двутавр 25Ш2 6140 330,3» of В7 for the unread row
  // «6160 330,3» of В5).
  const twinOf=r=>{const len=lenOf(r);if(!len)return null;const L=Number(len.str),nums=numsOf(r).filter(t=>t.str.replace(/\D/g,"").length>=3);
   const k=known.find(k=>Math.abs(k.len-L)<=L*0.01&&k.nums.some(a=>nums.some(b=>a.str.replace(",",".")===b.str.replace(",",".")&&Math.abs(a.x-b.x)<15)));
   return k?k.sec:null};
  // Each row a part of the mark (ГПЭС В46: «2 | −181х10 | 222 | 1 | 3,2 | 3 | скосы, отв. Ø19»): its position (the number
  // left of «Сечение»), section, length, count (under «т» of «Кол-во», right of the length or left of «Сечение» — ГПЭС К32:
  // «Поз. | т | н | Сечение»; else the first number after the length) and note (right of «Марка стали»: not «С255»).
  const kolH=hdr.filter(t=>/^т\.?$/u.test(t.str)).sort((a,b)=>a.x-b.x)[0],steelCol=hdr.filter(t=>/^Марка$/u.test(t.str)&&t.x>lenH.x).sort((a,b)=>a.x-b.x)[0];
  const partRow=(r,sec,len)=>{
   const pos=r.items.slice().sort((a,b)=>a.x-b.x).find(t=>/^\d{1,2}$/.test(t.str)&&t.x<secH.x-15&&t.x>markH.x+20&&!(kolH&&Math.abs(t.x-kolH.x)<20)),nums=numsOf(r);
   const kol=kolH?r.items.find(t=>Math.abs(t.x-kolH.x)<20&&/^\d{1,3}$/.test(t.str)):nums.find(t=>/^\d{1,3}$/.test(t.str));
   // (the note within its column: «Требуется изготовить» may stand right beside the table)
   const n0=Math.max(noteH?noteH.x-50:0,steelCol?steelCol.x+(steelCol.width||String(steelCol.str).length*(steelCol.size||8)*0.55)+2:0);
   const note=noteH?r.items.filter(t=>t.x>=n0&&t.x<noteH.x+(noteH.width||60)+40).sort((a,b)=>a.x-b.x).map(t=>t.str).join(" ").replace(/\s+/g," ").trim():"";
   let section=sec&&ROLLED.test(sec)?normProfile(sec):String(sec||"").replace(/^[—–-]\s*/u,"−").replace(/\s+/g,"");
   // A bare size whose dash the reading lost («80х10»): a plate when the mass of one part is that of a plate A×s, within 12 %.
   {const m=/^(\d{2,4})[хx×](\d{1,2})$/u.exec(section),one=Number(partOf(r)?.str.replace(",","."));
    if(m&&len&&one>0){const w=Number(m[1])*Number(m[2])*Number(len.str)*7.85e-6;if(Math.abs(w-one)<=one*0.12||Math.abs(w-one/10)<=one*0.012)section="−"+section}}
   // (the mass of one part, only under «дет.» of «Масса»: without that header the second number may be the mark's)
   const kg=partH?Number(partOf(r)?.str.replace(",",".")):0;
   return{pos:pos?Number(pos.str):null,section,length_mm:len?Number(len.str):null,count:kol?Number(kol.str):null,...(kg>0?{mass_kg:kg}:{}),...(note?{note}:{})}};
  const names=markNames(groups.map(g=>g.flatMap(r=>r.items).filter(isLabel).flatMap(l=>titleMarks(l.str).map(mark=>({mark,l})))),order);
  groups.forEach((g,gi)=>{
   const labels=names[gi];
   let best=null,mass=null,back="",derived=false,except=false,word=false;const parts=[];
   for(const r of g){
    let sec=secOf(r);const len=lenOf(r);
    // A bare size: the mass of one part (the number after the count, right of the length) by its length; its comma may
    // be lost by the reading («595» for 59,5).
    if(typed.has(sec.replace(/\s+/g,"")))sec=typed.get(sec.replace(/\s+/g,""));
    else if(len&&/^\d{2,3}\s*[хx×]\s*\d/u.test(sec)){
     const part=partOf(r),one=part?Number(part.str.replace(",",".")):null,per=one/Number(len.str)*1000;
     const as=one&&(bareSection(sec,per)||!/[,.]/.test(part.str)&&bareSection(sec,per/10));
     if(as)sec=as
    }
    if(!(sec&&ROLLED.test(sec))&&!sectionLike(sec))sec=twinOf(r)||sec;
    // (A member's word whose size the reading lost: «абутавр С253» of «Сб. двутавр 40КС2 (С255)».)
    if(/ут[ао][вбёд]р|швел|труба|^Св\.I/iu.test(sec)&&!sectionLike(sec))word=true;
    const line=r.items.map(t=>t.str).join(" "),ref=/(?:обратн[ао]|(?:позиции|детали)\s+по|по)\s+(?:марке\s+)?([А-ЯЁA-Z]{1,3}\d{1,4}(?:[-.]\d{1,3})?)/iu.exec(line);
    if(ref&&/обратн|позици|детали\s+по|поз\.|по\s+марке/iu.test(line))back=ref[1];
    // («Обратна В108» whose word the reading lost: a mark alone in «Сечение» of a row without a length is that mark.)
    else if(!lenOf(r)){const alone=r.items.find(t=>t.x>=secH.x-60&&t.x<lenH.x-10&&titleMarks(t.str)?.length===1&&!isLabel(t));if(alone){back=titleMarks(alone.str)[0];derived=true}}
    // "Все позиции по Ф3, кроме …", "обратно Ф4", «Обратна марке К105»: the mark is made like another; its own rows are
    // only changes. («Поз. 1, 2, 9-14 по марке К105» — some parts as there: a group without a member of its own takes it.)
    if(r.items.some(t=>/(?:все\s+)?(?:позиции|детали)\s+по|обратн[ао]/iu.test(t.str)&&!/позиции\s+\d/iu.test(t.str)))derived=true;
    if(/кроме/iu.test(line))except=true;
    {const m=r.items.find(t=>massAt(t)&&/^\d+(?:[,.]\d+)?$/.test(t.str));if(m)mass=Number(m.str.replace(",","."))}
    // (each row with a section or a length a part of the mark)
    if((sectionLike(sec)||len)&&!r.items.some(t=>WELD_ROW.test(t.str)))parts.push(partRow(r,sectionLike(sec)?sec:"",len));
    // The member itself: an I-beam, channel or tube before angles and plates, then the longest; a length the
    // OCR lost does not disqualify it.
    if(sec&&ROLLED.test(sec)&&sectionLike(sec)){
     // (Of two as long, the larger: «∟50х5 1970» over «∟25х3 1970».)
     const c={sec,len:len?Number(len.str):0,main:/^(уголок|L|∟)/iu.test(sec)?0:1,size:Number((/\d{2,3}/.exec(sec)||[0])[0])};
     if(!best||c.main>best.main||c.main===best.main&&(c.len>best.len||c.len===best.len&&c.size>best.size))best=c
    }
   }
   // An I-beam, channel or tube named without its size is the member: an angle of the group is not taken for it.
   if(word&&best&&!best.main)best=null;
   // The mark it refers to; when OCR lost that name, the group above (such tables list the base mark first). «Все позиции
   // по Ф78, кроме поз. 1» with a member of its own in the group is that member.
   const like=derived&&!(except&&best&&best.main),base=like?(back&&byMark.get(back))||previous:!best&&back?byMark.get(back)||null:null;
   // (Like a mark whose name the reading lost: the group above is a guess the mass of one mark may correct below.)
   const guessed=like&&!back;
   // A group whose mark the reading lost: named after the table «Требуется» (the one mark it lists between the groups
   // round it that this table has not).
   // (A group whose name was lost is still the mark the next «все позиции по …» rows above it refer to.)
   // A group whose member row the reading could not make out (a length or masses, no section): the sheet's «Выборка
   // металла» may still name it.
   const lost=!best&&!base&&g.some(r=>(lenOf(r)||numsOf(r).length>=2)&&!sectionLike(secOf(r))&&!r.items.some(t=>WELD_ROW.test(t.str)||/позиц|детали\s+по|обратн|по[дб]о[дб]н/iu.test(t.str)));
   if(!labels.length){if(best||base||lost||g.some(r=>lenOf(r)))seq.push({best,base,mass,back,like:like&&back,lost,guessed,parts:derived?null:parts});if(base||best)previous=base||{profile:normProfile(best.sec),length_mm:best.len||null};return}
   seq.push({marks:labels.map(x=>x.mark)});
   for(const {mark,l,fixed} of labels)if(!byMark.get(mark)?.profile){
    const e=base?{mark,profile:base.profile,length_mm:base.length_mm,mass_kg:mass,same:back,ocr:Boolean(l.ocr)}
     :{mark,profile:best?normProfile(best.sec):"",length_mm:best?.len||null,mass_kg:mass,same:back,ocr:Boolean(l.ocr)};
    if(fixed){e.read=fixed;e.by_order=true}
    // (its own parts; a mark made like another lists only its changes — «все позиции по К32», «обратно К1» without
    // «кроме» has the parts of that mark)
    if(!derived&&parts.length)e.parts=parts;else if(derived&&back&&!except&&!parts.some(p=>p.section))e.parts_by=back;
    if(like&&back)e.like=back;
    if(lost)e.lost=true;
    if(guessed)e.guessed=true;
    byMark.set(mark,e);previous=e
   }
  });
  // Groups without a name between two named ones take the marks «Требуется» lists between those, in order, when there
  // are as many of them (a mark lost in both tables does not shift the names onto the wrong groups).
  const named=new Set(byMark.keys());
  seq.forEach((u,i)=>{
   if(u.marks||!(u.best||u.base||u.lost))return;
   let bi=i-1;while(bi>=0&&!seq[bi].marks)bi--;let ai=i+1;while(ai<seq.length&&!seq[ai].marks)ai++;
   const before=bi>=0?seq[bi].marks.at(-1):undefined,after=ai<seq.length?seq[ai].marks[0]:undefined;
   // (Between the last mark before it and the first after it that «Требуется» lists: «Ф8-1» it does not list is passed.)
   const a=Math.max(-1,...seq.slice(0,bi+1).flatMap(x=>x.marks||[]).map(m=>order.indexOf(m)));
   const b=Math.min(order.length,...seq.slice(ai).flatMap(x=>x.marks||[]).map(m=>order.indexOf(m)).filter(k=>k>=0));
   const free=b<=a?[]:order.slice(a+1,b).filter(m=>!named.has(m));
   // (Or the numbers between those of the marks round them, as many as the groups: В10, В11 between В9 and В12.)
   const num=v=>{const m=/^(\D+)(\d+)$/u.exec(v||"");return m&&{a:m[1],n:Number(m[2])}},p=num(before),q=num(after);
   const gap=p&&q&&p.a===q.a&&q.n-p.n-1===ai-bi-1?Array.from({length:ai-bi-1},(_,k)=>p.a+(p.n+k+1)).filter(m=>!named.has(m)):[];
   const mark=free.length===ai-bi-1?free[i-bi-1]:gap.length===ai-bi-1?gap[i-bi-1]:null;if(!mark)return;
   const e=u.base?{mark,profile:u.base.profile,length_mm:u.base.length_mm,mass_kg:u.mass,same:u.back,ocr:true,by_order:true}
    :{mark,profile:u.best?normProfile(u.best.sec):"",length_mm:u.best?.len||null,mass_kg:u.mass,same:u.back,ocr:true,by_order:true,lost:u.lost};
   if(u.like)e.like=u.like;
   if(u.guessed)e.guessed=true;
   if(u.parts?.length)e.parts=u.parts;
   byMark.set(mark,e)
  });
  for(const e of byMark.values()){const b=e.parts_by&&byMark.get(e.parts_by);if(b?.parts)e.parts=b.parts.map(p=>({...p}))}
  // «Все позиции по Ф6» takes Ф6 as named in the end (a group named by «Требуется» after it was read).
  for(let k=0;k<2;k++)for(const e of byMark.values()){const b=e.like&&byMark.get(e.like);if(b&&b!==e&&b.profile){e.profile=b.profile;e.length_mm=b.length_mm}}
  // A mark with only its mass left («307» of Ф91 whose «подобна Ф86» the reading lost), or made like a mark whose name
  // was lost: the marks of the table with the same mass of one mark (three digits or more) are what it is like, when
  // they are all of one section (and one length, for the length).
  for(const e of byMark.values()){
   if(e.profile&&!e.guessed||!(Number(e.mass_kg)>=100))continue;
   const mates=[...byMark.values()].filter(o=>o!==e&&o.profile&&!o.guessed&&o.mass_kg===e.mass_kg),profiles=new Set(mates.map(o=>o.profile)),lengths=new Set(mates.map(o=>o.length_mm||0));
   if(profiles.size!==1)continue;
   e.profile=mates[0].profile;if(lengths.size===1)e.length_mm=mates[0].length_mm||e.length_mm;else if(e.guessed)e.length_mm=null;e.by_mass=mates[0].mark
  }
  for(const e of byMark.values()){
   if(!e.profile&&e.same&&byMark.get(e.same))e.profile=byMark.get(e.same).profile;
   out.push({mark:e.mark,profile:e.profile,mass_kg:e.mass_kg,length_mm:e.length_mm,...(e.ocr?{ocr:true}:{}),...(e.by_order?{by_order:true}:{}),...(e.read?{read:e.read}:{}),...(e.by_mass?{by_mass:e.by_mass}:{}),...(e.lost&&!e.profile?{lost:true}:{}),...(e.parts?{parts:e.parts,...(e.parts_by?{parts_by:e.parts_by}:{})}:{})})
  }
 }
 return out
}
// Fasteners (метизы) in any table of the sheet: «Болт М20-6gх60.58 ГОСТ 7798-70», «Гайка М20.5», «Шайба 20».
// The designation is the run of close items from the item word; the next column (count, mass) is apart by a gap.
// The count is read under a «Кол.» header, or left of the «Масса» columns when OCR lost that header.
const CLASS_NOTE=/кл(?:асс)?\.?\s*(?:пр(?:оч[а-яё]*)?\.?)?\s*(\d{1,2}\.\d)\b/iu;
// Holes of an assembly sheet as its notes give them: «Все отверстия Ø23, кроме оговоренных» («Неоговоренные отверстия
// ф23мм»), «отв. Ø27», «отверстия под
// болты М24-∅27 выполнять сверлением» — the diameters, the one for all first.
function holeNotes(texts){
 const all=[],other=[],said=[];
 // A note written in pieces of one line («2. Все отверстия» «Ç» «23 мм, кроме оговоренных.» — «Ç» is the sign Ø of a
 // CAD font without it): the pieces close together are read as one.
 const runs=[];
 for(const r of rowsOf(texts.filter(t=>Math.abs(Math.round(t.angle||0))<10),3)){let run=null;
  for(const t of r.items){const z=t.size||10;if(run&&t.x-run.end<=z*1.2){run.str+=" "+t.str;run.end=t.x+(t.width||String(t.str).length*z*0.55)}else{run={str:String(t.str),end:t.x+(t.width||String(t.str).length*z*0.55)};runs.push(run)}}}
 for(const t of [...texts,...runs]){const s=String(t.str||"").replace(/\s+/g," ");let m;
  if((m=/(?:вс[еи]|неоговоренн\S*)\s+отверсти\S*\s*(?:—|-|–)?\s*[ØøФ∅Ç⌀]\s*(\d{1,2}(?:[.,]\d)?)/iu.exec(s))){all.push(+m[1].replace(",","."));said.push(s.trim())}
  else if((m=/(?:отв\.?|отверсти\S*)\s*(?:под\s+болты\s+М\s*\d{2}\s*[-–—]\s*)?[ØøФ∅Ç⌀]\s*(\d{1,2}(?:[.,]\d)?)/iu.exec(s))){other.push(+m[1].replace(",","."));if(/под\s+болт/iu.test(s))said.push(s.trim())}}
 const d=[...new Set([...all,...other])];
 return d.length?{all_mm:all[0]||null,diameters_mm:d,notes:[...new Set(said)].slice(0,4)}:null
}
const FASTENER_WORD=/^(?:фундаментн\S*\s+)?(?:Болт|Гайк|Шайб|Шпильк|Анкер|Саморез|Винт|Заклеп|Заклёп)/iu;
function fastenerTable(texts){
 // The count column: «Кол.», or «шт» of a «Кол-во, шт» header split in two; of several (the mass per piece is also
 // «шт.»), the first one right of the designation.
 const out=[],heads=texts.filter(t=>/^(?:Кол(?:-во|ичество|\.)?\.?|шт\.?)$/iu.test(t.str.trim()));
 // «Ведомость временных (монтажных) метизов» — bolts of the erection only; «постоянных» stay in the structure.
 const titles=texts.filter(t=>/метиз|болт/iu.test(t.str)&&/ведомост|временн|монтажн|постоянн/iu.test(t.str));
 for(const row of rowsOf(texts)){
  const at=row.items.findIndex(t=>FASTENER_WORD.test(t.str));if(at<0)continue;
  const run=[row.items[at]];
  for(const t of row.items.slice(at+1)){
   const prev=run[run.length-1],gap=t.x-(prev.x+(prev.width||prev.str.length*(prev.size||8)*0.55));
   if(gap>Math.max(8,(prev.size||8)*1.5))break;
   // A bare number after the standard is the next column (the thickness of the package, the count), however close.
   if(/^\d{1,4}$/.test(t.str.trim())&&/(?:ГОСТ|ISO|DIN|EN|СТ\s*РК|ОСТ)\s*[\d.-]*\d[-.]\d{2,4}\*?$/iu.test(run.map(r=>r.str).join(" ").trim()))break;
   run.push(t)
  }
  const text=run.map(t=>t.str).join(" ").replace(/\s+/g," ").trim(),f=parseFastener(text);
  if(!f)continue;
  // Only a header over this table: right of the designation, not the «Кол-во» of a specification beside it.
  const end=run[run.length-1],near=heads.filter(h=>h.y<row.y&&row.y-h.y<1600&&h.x>row.items[at].x&&h.x-row.items[at].x<900);
  const top=Math.max(...near.map(h=>h.y)),head=near.filter(h=>top-h.y<40&&h.x>end.x-10).sort((a,b)=>a.x-b.x)[0]||near.sort((a,b)=>b.y-a.y)[0];
  // Without the «Кол.» header (lost by OCR of a pasted table) the count is the whole number just left of the «Масса»
  // columns («Масса, кг» over «1 шт.|общ.» or «1000шт|общ.»): the thickness of the package is left of it.
  const mass=!head&&texts.filter(h=>/^(?:Масса|Вес|1000\s*шт|1\s*шт)/iu.test(h.str.trim())&&h.y<row.y&&row.y-h.y<400&&h.x>end.x).sort((a,b)=>a.x-b.x)[0];
  const qty=head?row.items.find(t=>t.x>end.x&&Math.abs(t.x-head.x)<30&&/^\d{1,5}$/.test(t.str)):
   mass?row.items.filter(t=>t.x>end.x&&t.x<mass.x-2&&/^\d{1,5}$/.test(t.str)).sort((a,b)=>b.x-a.x)[0]:null;
  const title=titles.filter(t=>t.y<row.y&&row.y-t.y<400&&Math.abs(t.x-row.items[at].x)<400).sort((a,b)=>b.y-a.y)[0];
  // The class written apart, in the «Примечание» column of the row («кл. пр. 8.8», «оцинк.» under it).
  // «-//-» there (and the standard «-//-») repeats the row above.
  const size=row.items[at].size||8,beside=texts.filter(t=>t.x>end.x&&Math.abs(t.y-row.y)<=size*1.3);
  const note=f.strength_class?null:beside.map(t=>CLASS_NOTE.exec(t.str)).find(Boolean),above=out[out.length-1];
  const ditto=!note&&!f.strength_class&&above&&above.item===f.item&&beside.some(t=>/^[-–—]?\s*[\/|]{2}\s*[-–—]?$/u.test(t.str.trim()));
  out.push({text,item:f.item,d_mm:f.d_mm,length_mm:f.length_mm,strength_class:f.strength_class||(note?note[1]:ditto?above.strength_class:null),tensile_MPa:f.tensile_MPa,
   standard:f.standard,standard_note:f.standard_note,high_strength:f.high_strength,steel:f.steel,count:qty?Number(qty.str):null,...(title&&/временн|монтажн/iu.test(title.str)?{temporary:true}:{})})
 }
 return out
}
// Standards the sheet cites («ГОСТ 26020-83», «ГОСТ 27772-2015», «DIN 933») with what the registry says: a replaced or
// cancelled edition gets a note for the engineer.
// The same pattern as the global base: ГОСТ, СТ РК, СП/СН/НТП РК, СТО АСЧМ, DIN, ISO.
const STD_CITED=new RegExp(require("./ai-global-kb").STD_SOURCE,"giu");
let globalKb=null;
function standardsCited(texts){
 if(!globalKb){try{globalKb=require("./ai-global-kb").createGlobalKnowledge()}catch{return[]}}
 const seen=new Map();
 for(const row of rowsOf(texts))for(const m of row.items.map(t=>t.str).join(" ").matchAll(STD_CITED)){
  const k=m[0].replace(/\s+/g," ").trim();if(seen.has(k))continue;
  const s=globalKb.standardOf(k);
  seen.set(k,{designation:k,known:Boolean(s?.known),group:s?.group||null,current:s?.current?.designation||null,kz_current:s?.kz_current?.designation||null,note:s?.note||""})
 }
 return[...seen.values()]
}
// Sheet number, document code and name from the stamp, for choosing sheets before the analysis.
function sheetStamp({texts=[],widthPt=0,heightPt=0}={}){
 const med=median(texts.map(t=>t.size))||10,stamp=stampOf(texts,widthPt,heightPt,med);
 return{code:stamp.code,name:stamp.name}
}
const assemblyTextOf=texts=>texts.some(t=>/^Спецификация\s+на\s+отправочн|^Тре[бдв]уется|^изготовить$|^Отправочная/u.test(t.str));
// Shipping marks named by the stamp of an assembly sheet («Сегмент 9 · А003855-а»).
// The marks of a stamp in its order, ranges opened: «Ф106-Ф117, Ф154-Ф157».
const stampOrder=str=>[...new Set([...String(str||"").matchAll(/([А-ЯЁ]{1,3})(\d{1,4})(?:\s*[-–]\s*\1?(\d{1,4})(?!\d))?/gu)]
 .flatMap(m=>m[3]&&+m[3]>+m[2]&&+m[3]-+m[2]<=60?Array.from({length:+m[3]-+m[2]+1},(_,i)=>m[1]+(+m[2]+i)):[m[1]+m[2]]))].filter(m=>!STEEL.test(m));
const stampMarks=stamp=>[...new Set(String(stamp?.name||"").split(" · ").flatMap(part=>titleMarks(part.trim())||[]))];
// Element names with their marks in the stamp of an assembly sheet: «Колонна Ф52, Ф53», «Распорка Ф76-Ф81, · связь
// горизонтальная Ф82, Ф83», «Ригель фахверка · Ф101-Ф106». A range is every number between its ends. The name is the
// words before the marks — from the last capitalised word (the object and building come first in the stamp), or all
// the words after the previous marks. [{mark, name}].
const STAMP_MARK=/^([А-ЯЁA-Z]{1,3})(\d{1,4})$/u;
function stampNames(str){
 const words=String(str||"").replace(/[·,;]/gu," ").replace(/\s*[-–—]\s*(?=[А-ЯЁA-Z]{1,3}\d|\d)/gu,"-").split(/\s+/u).filter(Boolean);
 const out=[];let run=[],afterMarks=false;
 for(const w of words){
  const range=/^([А-ЯЁA-Z]{1,3})(\d{1,4})-(?:([А-ЯЁA-Z]{1,3}))?(\d{1,4})$/u.exec(w),one=STAMP_MARK.exec(w);
  if(!range&&!one){if(afterMarks){run=[];afterMarks=false}run.push(w);continue}
  if(STEEL.test(w))continue;
  const start=run.findLastIndex(x=>/^[А-ЯЁ][а-яё]/u.test(x)),name=(afterMarks||start<0?run:run.slice(start)).join(" ");
  if(!/^[А-ЯЁа-яё][а-яё]+/u.test(name)){afterMarks=true;continue}
  const marks=[];
  if(range&&(!range[3]||range[3]===range[1])&&Number(range[4])>Number(range[2])&&Number(range[4])-Number(range[2])<=60)for(let n=Number(range[2]);n<=Number(range[4]);n++)marks.push(range[1]+n);
  else if(one)marks.push(w);
  for(const mark of marks)if(!out.some(o=>o.mark===mark))out.push({mark,name:name[0].toUpperCase()+name.slice(1)});
  // The marks of one name go on until the next words.
  if(!afterMarks){run=name.split(" ");afterMarks=true}
 }
 return out
}
// Marks read by OCR from a pasted table («ВИ3», «В1390», «В0» for В143, В139, В40) are checked against the marks the
// sheet's text layer names (view titles, notes): a mark it does not know is the one mark of the sheet left over when
// only one is left (or the known mark it begins with); otherwise it is not taken, and the sheet keeps what was not read.
function checkOcrMarks(list,known,unread,table){
 if(!known.size)return list;
 const ok=list.filter(e=>!e.ocr||known.has(e.mark)),bad=list.filter(e=>e.ocr&&!known.has(e.mark));
 const left=[...known].filter(m=>!ok.some(e=>e.mark===m));
 for(const e of bad){
  const to=left.find(m=>e.mark.startsWith(m))||(bad.length===1&&left.length===1?left[0]:null);
  if(to){ok.push({...e,mark:to,read_as:e.mark});left.splice(left.indexOf(to),1)}else unread.push({table,text:e.mark})
 }
 return ok
}
// The letter of an I-beam in a CAD italic is lost by OCR: «двутавр 35Ш2» read «3512», «3502». The sheet says the letter
// elsewhere (the «Выборка металла», a section's label «35Ш2»): taken from there when one letter fits; otherwise the
// profile stays unread rather than made up.
function ibeamLetters(list,texts,unread){
 return list.map(e=>{
  const m=/^(I|Св\.I)(\d{2})[10](\d)$/u.exec(e.profile||"");if(!m||!e.ocr)return e;
  const re=new RegExp("(?:^|[^\\d])"+m[2]+"\\s*(ДБ|ДШ|[БШКМ])(С?)\\s*"+m[3]+"(?!\\d)","u");
  // (its digits as OCR reads them too: «дбутоёр З5Ш2»)
  const found=[...new Set(texts.map(t=>re.exec(cyr(String(t.str)))||re.exec(profileWords(cyr(String(t.str))))).filter(Boolean).map(x=>x[1]+x[2]))];
  if(found.length===1)return{...e,profile:m[1]+m[2]+found[0]+m[3],read_as:e.profile};
  unread.push({table:"Спецификация",text:e.mark+": "+e.profile});return{...e,profile:"",profile_read:e.profile}
 })
}
// The box sign of a tube drawn as a small square of lines just before a bare size («□140х4» on a leader: the text
// layer holds «140х4» alone).
function boxSigns(texts,segments){
 const bare=texts.filter(t=>!t.ocr&&/^\d{2,3}\s*[хx×]\s*\d{1,2}(?:[.,]\d)?$/u.test(String(t.str).trim()));if(!bare.length)return texts;
 const short=segments.filter(g=>{const l=Math.hypot(g.a.x-g.b.x,g.a.y-g.b.y);return l>=3&&l<=20});
 const vert=short.filter(g=>Math.abs(g.a.x-g.b.x)<0.3),hor=short.filter(g=>Math.abs(g.a.y-g.b.y)<0.3);
 const has=(list,f)=>list.some(f),near=(a,b,d=1.2)=>Math.abs(a-b)<=d;
 const boxed=new Set(bare.filter(t=>{const z=t.size||10;
  return vert.some(v=>{const x=v.a.x,y0=Math.min(v.a.y,v.b.y),y1=Math.max(v.a.y,v.b.y),L=y1-y0;
   if(x>t.x+1||x<t.x-6||L<z*0.35||L>z*1.1||Math.abs(y1-t.y)>z*0.35)return false;
   return has(vert,u=>near(u.a.x,x-L,1.5)&&near(Math.min(u.a.y,u.b.y),y0)&&near(Math.max(u.a.y,u.b.y),y1))&&
    [y0,y1].every(y=>has(hor,h=>near(h.a.y,y)&&near(Math.min(h.a.x,h.b.x),x-L,1.5)&&near(Math.max(h.a.x,h.b.x),x,1.5)))})}));
 return boxed.size?texts.map(t=>boxed.has(t)?{...t,str:"□"+String(t.str).trim()}:t):texts
}
// The rolled sections the sheet's «Выборка металла» lists (I-beams, channels, tubes; not angles and sheets).
function metalProfiles(texts){
 const out=new Set();
 for(const head of texts.filter(t=>/^Выборка/u.test(String(t.str)))){
  const end=Math.min(head.y+700,...texts.filter(t=>t.y>head.y&&t.y<head.y+700&&Math.abs(t.x-head.x)<300&&/^(Итого|Всего|Масса\s+стали)/u.test(String(t.str))).map(t=>t.y));
  for(const t of texts)if(t.y>head.y&&t.y<end&&t.x>head.x-200&&t.x<head.x+300){const v=profileWords(cyr(String(t.str)));
   if(ROLLED.test(v)&&!/^(уголок|L|∟|\{)/iu.test(v)&&sectionLike(t.str))out.add(normProfile(t.str))}
 }
 return[...out]
}
function extractSheet({texts=[],widthPt=0,heightPt=0,segments=[]}={}){
 texts=boxSigns(texts,segments);
 const med=median(texts.map(t=>t.size))||10;
 const stamp=stampOf(texts,widthPt,heightPt,med),own=stampMarks(stamp).filter(m=>/\d{5}/.test(m));
 // A sheet of one shipping mark in plant numbering: other numbers in view titles are its parts.
 const views=assemblyViews(texts,widthPt,heightPt,med,segments).filter(v=>v.levels.length>=2||v.length_mm)
  .filter(v=>!own.length||v.marks.some(m=>own.includes(m)));
 // (ranges of the stamp and the notes, «Ф26-Ф28», «В1 - В4», and the sheet's title «Колонна К77» count too)
 const range=str=>[...String(str).matchAll(/([А-ЯЁ]{1,3})(\d{1,4})\s*[-–]\s*\1?(\d{1,4})(?!\d)/gu)].flatMap(m=>+m[3]>+m[2]&&+m[3]-+m[2]<=60?Array.from({length:+m[3]-+m[2]+1},(_,i)=>m[1]+(+m[2]+i)):[]);
 const known=new Set(texts.filter(t=>!t.ocr).flatMap(t=>[...(titleMarks(t.str)||titleMarks(String(t.str).replace(/^[А-ЯЁ][а-яё]{3,}\s+/u,""))||[]),...range(t.str)]).filter(m=>!/^[A-Z]\d$/.test(m))),unread=[];
 const table=requiredTable(texts),required=checkOcrMarks([...table],known,unread,"Требуется"),elements=elementTable(texts);
 // The groups of the specification go in the order of the stamp («Ф106-Ф117, Ф154-Ф157») when it names every mark of
 // «Требуется»: the marks made on the sheet that «Требуется» does not list (needed on another scheme) are places too.
 const need=required.map(r=>r.mark),titled=stampOrder(stamp?.name),order=titled.length&&need.every(m=>titled.includes(m))?titled:need;
 const spec=ibeamLetters(checkOcrMarks(specTable(texts,order),known,unread,"Спецификация"),texts,unread);
 // The one mark whose member row the reading could not make out takes the one rolled section of the «Выборка металла»
 // no other row of the sheet has (В146: «Тр.□140х4» beside the «Двутавр 25Ш1» of В142).
 {const lost=spec.filter(e=>e.lost&&!e.profile),free=metalProfiles(texts).filter(p=>!spec.some(e=>e.profile===p));
  if(lost.length===1&&free.length===1)Object.assign(lost[0],{profile:free[0],from_sheet:"Выборка металла"})}
 // A mark the specification gives no section (its rows on another sheet, or not read) takes the one rolled section
 // labelled in its own view.
 for(const v of views)if(v.profile)for(const mark of v.marks){
  const e=spec.find(r=>r.mark===mark);
  if(e&&!e.profile)Object.assign(e,{profile:v.profile,from_view:true});
  else if(!e&&(required.some(r=>r.mark===mark)||!required.length))spec.push({mark,profile:v.profile,mass_kg:null,length_mm:v.length_mm||null,from_view:true})
 }
 const levels=texts.map(t=>levelMm(t.str)).filter(v=>v!==null);
 const assemblyText=assemblyTextOf(texts);
 // I-beams «30Ш2» of ГОСТ 26020-83 and of ГОСТ Р 57837-2017 differ (40Б1: 48,1 and 56,6 кг/м): the standard the
 // sheet cites goes with each such section; a sheet citing both or neither leaves it open.
 const standards=standardsCited(texts);
 const ib=[...new Set(standards.map(x=>/26020/.test(x.designation)?"ГОСТ 26020-83":/57837/.test(x.designation)?x.designation:"").filter(Boolean))];
 if(ib.length===1)for(const r of [...elements,...spec])if(/^I?\d{2,3}(?:ДБ|ДШ|[БШК])\d/u.test(r.profile||""))r.profile_standard=ib[0];
 // A sheet of one shipping mark: its single «Требуется» row is that mark even when the row names another
 // (a table copied from another sheet); the engineer sees the difference.
 if(own.length===1&&required.length===1&&required[0].mark!==own[0]){
  const norm=m=>m.replace(/A/g,"А").toLowerCase();
  // The table writes the revision letter the stamp left out («А003727» — «А003727-а»): the table's mark is fuller.
  if(norm(required[0].mark).startsWith(norm(own[0])+"-"));
  else if(norm(required[0].mark)!==norm(own[0]))required[0]={...required[0],mark:own[0],table_mark:required[0].mark,warning:"в таблице «Требуется» указана марка "+required[0].mark+", в штампе — "+own[0]};
  else required[0]={...required[0],mark:own[0]}
 }
 // The stamp alone names the mark when the table was not read: one piece is not assumed, the count stays open.
 if(own.length===1&&!required.length&&assemblyTextOf(texts))required.push({mark:own[0],count:table.unnamed===1?table.unnamedCount:null,mass_kg:null,from:"stamp"});
 // The holes of each member at their places on its views (src/ai-holes-extract.js): «Все отверстия Ø23» names those no
 // callout does.
 const holes=holeNotes(texts),drill=views.length&&segments.length<=80000?require("./ai-holes-extract").sheetHoles({texts,segments,widthPt,heightPt},{views,allMm:holes?.all_mm||null}):null;
 // The plates across each member (ribs, connection plates) at their places on its views.
 // (the views of all members, holes or none: the plates on them, the place of a cut of a plate drawn apart on them)
 const seeded=views.length&&segments.length<=80000?require("./ai-holes-extract").sheetHoles({texts,segments,widthPt,heightPt},{views,allMm:holes?.all_mm||null,seed:true,withMembers:true}):null;
 const plates=seeded?require("./ai-holes-extract").sheetPlates({texts,segments,widthPt,heightPt},{views,allMm:holes?.all_mm||null,seeded}).filter(m=>m.plates.length||m.gussets):[];
 // The positions of the specification at their places on the views (a number in a circle, its leader to the part).
 const place=seeded?require("./ai-parts-place").sheetParts({texts,segments,widthPt,heightPt},{seeded}):[];
 // The ends cut aslant on the main views (a tube cut over its seat, the cap inside).
 const bevels=seeded?require("./ai-parts-place").sheetBevels({texts,segments,widthPt,heightPt},{seeded}):[];
 // The plates drawn apart with their holes (a base plate «1 - 1», an end plate «2 - 2»), at their cuts.
 const sections=seeded?.sections||[];if(drill)delete drill.sections;
 return{stamp,views,required,elements,spec,fasteners:fastenerTable(texts),holes,...(drill?.views.length?{drill}:{}),...(plates.length?{plates}:{}),...(place.length?{place}:{}),...(bevels.length?{bevels}:{}),...(sections.length?{sections}:{}),standards,levelCount:levels.length,assemblyText,...(unread.length?{unread}:{})}
}
module.exports={extractSheet,sheetStamp,stampNames,titleMarks,levelMm,rowsOf,specTable,specCells,cellAccept,specPictures,specGrid,regrid,gridTexts,pickRow,sectionLike,normProfile,fastenerTable,standardsCited};
