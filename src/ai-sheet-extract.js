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
function rowsOf(texts,tol=4){
 const rows=[];
 for(const t of [...texts].sort((a,b)=>a.y-b.y)){
  const row=rows.find(r=>Math.abs(r.y-t.y)<=tol);
  if(row){row.items.push(t);row.y=(row.y*(row.items.length-1)+t.y)/row.items.length}else rows.push({y:t.y,items:[t]})
 }
 for(const r of rows)r.items.sort((a,b)=>a.x-b.x);
 return rows
}

// A view title is a large text made only of marks: "Ф3", "К1, К2 (обратно К1)".
function titleMarks(str){
 // Steel grades (С245, C345-3) look like marks but are not.
 const marks=(String(str).match(MARK)||[]).filter(m=>!STEEL.test(m)&&!/^Ст\d/u.test(m));
 if(!marks.length)return null;
 const rest=String(str).replace(MARK,"").replace(/обр(?:атно)?\.?|зеркально|[(),;\s]/giu,"");
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
function overallOf(inside,segments,box){
 if(!segments?.length)return null;
 const {dimensionsOf}=require("./ai-scheme-extract");
 const near=segments.filter(q=>Math.max(q.a.x,q.b.x)>=box.x0&&Math.min(q.a.x,q.b.x)<=box.x1&&Math.max(q.a.y,q.b.y)>=box.y0&&Math.min(q.a.y,q.b.y)<=box.y1);
 const dims=dimensionsOf(inside,near).filter(d=>d.v>=100&&d.v<=30000);
 if(!dims.length)return null;
 const ratio=d=>d.v/(d.hi-d.lo),n=median(dims.map(ratio)),same=dims.filter(d=>Math.abs(ratio(d)-n)/n<=0.06);
 let best=null;
 for(const flat of [true,false]){
  const list=same.filter(d=>d.flat===flat);if(!list.length)continue;
  const lo=Math.min(...list.map(d=>d.lo)),hi=Math.max(...list.map(d=>d.hi)),tol=Math.max(1.5,(hi-lo)*0.01);
  const over=list.filter(d=>d.lo<=lo+tol&&d.hi>=hi-tol).sort((a,b)=>b.v-a.v)[0];
  if(!over||list.length<2&&over.v<1000)continue;
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
 for(const flat of [true,false]){
  const all=dims.filter(d=>d.flat===flat);if(all.length<2)continue;
  const lo=Math.min(...all.map(d=>d.lo)),hi=Math.max(...all.map(d=>d.hi)),tol=Math.max(1.5,(hi-lo)*0.01);
  const broken=all.filter(d=>!same.includes(d)&&ratio(d)>n&&d.lo<=lo+tol&&d.hi>=hi-tol&&d.v>=1000).sort((a,b)=>b.v-a.v)[0];
  if(broken&&(!best||broken.v>best.v))best={v:broken.v,how:"по крайним выносным линиям, вид с разрывом"}
 }
 return best
}
// The texts of the mark columns of the «Спецификация» and «Требуется изготовить» tables (and the numbers of their rows):
// what is in a table is not a view.
function tableMarkCells(texts){
 const out=new Set();
 const take=(markH,top,right)=>{
  let last=null;
  for(const r of rowsOf(texts.filter(t=>t.y>top+4&&t.y<top+1600&&t.x>markH.x-60&&t.x<right))){
   if(last!==null&&r.y-last>80||r.items.some(t=>/^(Всего|Итого|Выборка|Ведомость)/u.test(t.str)))break;
   last=r.y;for(const t of r.items)if(Math.abs(t.x-markH.x)<60&&titleMarks(t.str)||/^\d+(?:[,.]\d+)?$/.test(String(t.str).trim()))out.add(t)
  }
 };
 for(const head of texts.filter(t=>/^Спецификац/u.test(t.str))){const {hdr,markH}=specHeader(texts,head);if(markH)take(markH,Math.max(...hdr.map(t=>t.y)),Math.max(...hdr.map(t=>t.x))+160)}
 for(const head of texts.filter(t=>/^Тре[бдв]уется|^изготовить$|^Таблица\s+отправочных/u.test(t.str))){
  const hdr=texts.filter(t=>t.y>head.y&&t.y<head.y+70&&Math.abs(t.x-head.x)<260&&/^(Марка|Отправочная|Отпр|марка|Кол(?!\.?\s*уч)|Масса|Вес|марки|[Вв]сех|шт|изготовить)/u.test(t.str));
  const markH=requiredMarkHead(hdr,head);if(markH)take(markH,Math.max(...hdr.map(t=>t.y)),markH.x+340)
 }
 return out
}
function assemblyViews(texts,w,h,med,segments=[]){
 // A mark in a table («Требуется изготовить», a «Спецификация») is a cell, not a view's title (ГПЭС Ф126: a sheet of
 // tables only gave a «view» with the mass of 1000 washers «16,361» for its level and the total «28884» for its length).
 const cells=tableMarkCells(texts);
 const titles=texts.filter(t=>horizontal(t)&&t.size>=med*1.3&&!(t.x>w-700&&t.y>h-190)&&!cells.has(t))
  .map(t=>({t,marks:titleMarks(t.str)})).filter(x=>x.marks);
 const views=[];
 for(const v of titles){
  const cx=v.t.x+v.t.width/2;
  // The view spans to halfway towards the neighbouring titles on the same band of the sheet.
  const row=titles.filter(o=>o!==v&&Math.abs(o.t.y-v.t.y)<120);
  const left=Math.max(cx-420,...row.map(o=>o.t.x+o.t.width/2).filter(x=>x<cx).map(x=>(x+cx)/2));
  const right=Math.min(cx+420,...row.map(o=>o.t.x+o.t.width/2).filter(x=>x>cx).map(x=>(x+cx)/2));
  const below=titles.filter(o=>o.t.y>v.t.y+120&&o.t.x+o.t.width/2>left&&o.t.x+o.t.width/2<right).map(o=>o.t.y);
  const bottom=Math.min(h-40,...below);
  const inside=texts.filter(t=>t.x>=left&&t.x<=right&&t.y>v.t.y&&t.y<bottom&&!cells.has(t));
  // A level without its sign among other numbers of its line is a cell of a table: «17,156» — the mass of 1000 washers in
  // the «Ведомость метизов» under the view («+9,705» among the dimensions is a level).
  const tableNumber=t=>/^\d/.test(String(t.str).trim())&&levelMm(t.str)!==0&&texts.some(o=>o!==t&&Math.abs(o.y-t.y)<Math.max(3,(t.size||8)*0.4)&&Math.abs(o.x-t.x)<220&&
   /^\d+(?:[,.]\d+)?$/.test(String(o.str).trim())&&levelMm(o.str)===null);
  const levels=[...new Set(inside.filter(t=>levelMm(t.str)!==null&&!tableNumber(t)).map(t=>levelMm(t.str)))].sort((a,b)=>a-b);
  const dims=inside.map(t=>number(t.str)).filter(v=>v&&v>=300&&v<=30000);
  const box={x0:Math.round(left),y0:Math.round(Math.max(0,v.t.y-30)),x1:Math.round(right),y1:Math.round(bottom)};
  const over=dims.length?overallOf(inside,segments,box):null;
  const length=over?over.v:dims.length?Math.max(...dims):null;
  const others=[...new Set(dims)].filter(x=>x!==length).sort((a,b)=>b-a);
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
  views.push({marks:v.marks,title:v.t.str,levels,z0_mm:z0,z1_mm:z1,length_mm:length,...(how?{length_how:how}:{}),...((!over||over.weak)&&others.length?{length_candidates:[length,...others.slice(0,2)]}:{}),box})
 }
 return views
}

// "Требуется / изготовить": Марка | Кол. | Масса марки | всех.
// The marks' column of «Требуется изготовить»: the «Отправочная (марка)» / «Марка» header nearest the title — the
// «Марка» of a «Спецификация» beside it is within reach too (К77); «Отправочная» lost by OCR leaves «марка».
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
   if(row.items.some(t=>/^(Всего|Итого)/u.test(t.str)))break;
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
// The I-beam sign comes from a symbol font as "}" or "ｴ": "} 30Ш2" is I30Ш2.
const ROLLED=/двутавр|швеллер|уголок|труба|^Тр\s*\.|^Гн|[□▢]\s*\d|^∟|^L\s*\d|^\[|^I\s*\d|ｴ|^[}]?\s*\d{2}[БКШМП]\d?$|^Св\.?\s*I?\s*\d{2}\s*[БКШ]/iu;
const LOOK={T:"Т",p:"р",P:"Р",x:"х",X:"Х",H:"Н",K:"К",M:"М",a:"а",e:"е",o:"о",c:"с",B:"В",C:"С",y:"у"};
const cyr=str=>String(str).replace(/(^|[^A-Za-z])([A-Za-z]{1,3})(?=[\d.\s]|$)/g,(m,pre,w)=>pre+(w==="L"||w==="I"?w:[...w].map(c=>LOOK[c]||c).join("")));
// OCR digits of the italic in a size: «&» is 4, «О» 0, «б» 6, «З» 3 («Тр.1&0х&» is Тр.140х4); «Сварной двутавр 50ШС2»,
// «Двутавр сварной 50Ш2», «Св. двутавр 40КС2» (and the reading «орнойдвутавр») are welded I-beams «Св.I…».
const ocrDigits=d=>d.replace(/&/g,"4").replace(/[Оо]/g,"0").replace(/б/g,"6").replace(/З/g,"3");
const sizeDigits=v=>v.replace(/[0-9&ОобЗ]{1,4}(?:[хx×][0-9&ОобЗ]{1,4}){1,2}/gu,m=>/\d/.test(m)?ocrDigits(m):m)
 .replace(/(^|[\s.I])([0-9&ОобЗ]{2})(?=[БКШМ]С?\d)/u,(m,a,d)=>/[\d&]/.test(d)?a+ocrDigits(d):m);
// OCR of an italic CAD font reads «в» as «б» and the «дв» of «двутавр» as «Об»: «Обутавр 35Ш2», «шбеллер 20», «уголак 160х14».
// («тавр» alone is a T-section and stays.) A box sign of a font read as a letter: «Тр.r140х4», «Тр.з160х5» are «Тр.□…».
// A welded I-beam «Св I50 ШС2» is «Св.I50ШС2»; OCR digits of a designation: «IЗОК1» is I30К1.
const PROFILE_WORDS=[[/^(?:\S*рной\s*двутавр|двутавр\s*сварной|С[вбё]\.?\s*[дО0о]?[вбё]\s?ута[вбё]р)\s*(?=[0-9&ОЗ])/iu,"Св.I"],[/^Св\.?\s*I?\s*([0-9&ОЗ]{2})\s*([БКШ]С?\d)$/iu,(m,a,b)=>"Св.I"+ocrDigits(a)+b],[/^I\s*([0-9ЗОо]{2,3})\s*([БКШМ]С?\d)$/u,(m,a,b)=>"I"+a.replace(/З/g,"3").replace(/[Оо]/g,"0")+b],[/^[дО0о][вбё]\s?ута[вбё]р/iu,"двутавр"],[/^ш[вб]ел+ер/iu,"швеллер"],[/^[ПГL∟]?\s*угол[оа]к/iu,"уголок"],[/^(Тр\.?|Гн\.?)\s*[rгзо0](?=\s*\d{2,3}\s*[хx×])/u,"$1□"]];
const profileWords=str=>{const v=PROFILE_WORDS.reduce((v,[re,w])=>v.replace(re,w),String(str).trim());return/^(?:Тр|Гн|I|L|\[|[−–—-]|Св\.I)|двутавр|швеллер|уголок|труба/iu.test(v)?sizeDigits(v):v};
function normProfile(str){
 let s=profileWords(cyr(str)).replace(/\s*(?:\([^)]*\)?|С\d{3}(?:-\d)?\))\s*$/u,"").replace(/^Сб\.?\s*/iu,"").trim();
 s=s.replace(/^двутавр\s*/iu,"I").replace(/^[ｴ}]\s*/u,"I").replace(/^(\d{2}[БКШМП]\d?)$/u,"I$1").replace(/^швеллер\s*/iu,"[").replace(/^уголок\s*/iu,"L").replace(/^∟\s*/u,"L");
 return s.replace(/\s+/g,"")
}
// A text of the «Сечение» column that is a section: a rolled profile, a plate «−220х10», a sheet, a bar (its size: the
// steel «(С255)» after it is not one — «двутавр С255» is a name whose size OCR lost).
const sectionLike=str=>{const t=profileWords(cyr(String(str||"")));return/\d/.test(t.replace(/\(?\s*С\d{3}(?:-\d)?\s*\)?/gu,""))&&(ROLLED.test(t)||/^[−–—-]?\s*t?\s*\d{1,4}\s*[хx×]\s*\d|лист|круг|^[Øø∅]|полоса|квадрат|арматур|профнастил|рифл/iu.test(t))};
// The row «1% на сварку» that closes the parts of a mark (OCR: «сборку», «но сборку», the «1%» alone).
const WELD_ROW=/н[ао]\s+с[вб][ао]р[кх]у|^\d\s*%/iu;
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
 return markH&&lenH?{hdr:words.filter(t=>t.x>markH.x-30),markH,secH,lenH}:{hdr:words}
}
// The cells of the «Сечение» column the reading left empty or unreadable, in rows that have a length: OCR reads them
// again one by one (a pasted table in a CAD italic: «Тр.□160х5» doubted as a whole by Tesseract and dropped).
function specCells(texts){
 const out=[];
 for(const head of texts.filter(t=>/^Спецификац/u.test(t.str))){
  const {hdr,markH,secH,lenH}=specHeader(texts,head);
  if(!markH)continue;
  const top=Math.max(...hdr.map(t=>t.y)),rows=[];
  for(const r of rowsOf(texts.filter(t=>t.y>top+4&&t.y<top+1600&&t.x>markH.x-60&&t.x<lenH.x+60))){if(rows.length&&r.y-rows[rows.length-1].y>80||r.items.some(t=>/^(Требуется|Выборка|Ведомость)/u.test(t.str)))break;rows.push(r)}
  // The column: from the right of the position numbers to the length column.
  const pos=rows.flatMap(r=>r.items).filter(t=>/^\d{1,2}$/.test(t.str)&&t.x<secH.x-15&&t.x>markH.x+20),w=t=>t.width||String(t.str).length*(t.size||8)*0.55;
  const x0=pos.length?Math.max(...pos.map(t=>t.x+w(t)))+3:secH.x-Math.max(20,lenH.x-secH.x-w(secH)),x1=lenH.x-3;
  for(const r of rows){
   const len=r.items.find(t=>Math.abs(t.x-lenH.x)<40&&/^\d{2,5}$/.test(t.str));if(!len)continue;
   const sec=r.items.filter(t=>t.x>=x0-5&&t.x<x1).map(t=>t.str).join(" ");if(sectionLike(sec))continue;
   const s=len.size||10;out.push({kind:"section",x:x0,y:r.y-s*1.15,w:x1-x0,h:s*1.45})
  }
  // A group of rows (up to its «1% на сварку») without its mark: the mark column read again across the middle of the group.
  const groups=[];let cur=[];
  for(const r of rows){cur.push(r);if(r.items.some(t=>WELD_ROW.test(t.str))){groups.push(cur);cur=[]}}
  if(cur.length)groups.push(cur);
  const mx1=pos.length?Math.min(...pos.map(t=>t.x))-3:secH.x-40;
  for(const g of groups){
   if(g.length<2||g.some(r=>r.items.some(t=>Math.abs(t.x-markH.x)<45&&titleMarks(t.str))))continue;
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
const markDigits=str=>String(str).replace(/\s+/g,"").replace(/^([А-ЯЁ]{1,3})([0-9бЗОо]{1,4})$/u,(m,a,b)=>a+b.replace(/б/g,"6").replace(/З/g,"3").replace(/[Оо]/g,"0"));
const cellAccept={section:str=>sectionLike(str)?str:null,mark:str=>{const v=markDigits(str),m=titleMarks(v);return m&&m.length===1?v:null}};
function specTable(texts){
 const out=[];
 for(const head of texts.filter(t=>/^Спецификац/u.test(t.str))){
  const {hdr,markH,secH,lenH}=specHeader(texts,head);
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
  const all=rowsOf(texts.filter(t=>t.y>top+4&&t.y<top+1600&&t.x>markH.x-60&&t.x<right));
  // The table ends where its rows stop or where the next table ("Требуется", "Выборка") begins.
  const rows=[];for(const r of all){if(rows.length&&r.y-rows[rows.length-1].y>80||r.items.some(t=>/^(Требуется|Выборка|Ведомость)/u.test(t.str)))break;rows.push(r)}
  // Groups: up to and including each "1% на сварку" row.
  const groups=[];let cur=[];
  // A row "Все позиции по …" / "обратно …" opens the group of the next mark even without the weld row before it.
  for(const r of rows){
   if(cur.length&&r.items.some(t=>/позиции\s+по|обратн[ао]|по\s+марке/iu.test(t.str))){groups.push(cur);cur=[]}
   cur.push(r);if(r.items.some(t=>WELD_ROW.test(t.str))){groups.push(cur);cur=[]}
  }
  if(cur.length)groups.push(cur);
  const byMark=new Map();let previous=null;
  for(const g of groups){
   const labels=g.flatMap(r=>r.items).filter(t=>Math.abs(t.x-markH.x)<45&&titleMarks(t.str));
   if(!labels.length)continue;
   let best=null,mass=null,back="",derived=false;
   for(const r of g){
    // CAD fonts mix Latin lookalikes into Cyrillic profile names ("Tp.140x4"); the position number left of
    // the section column is not part of it.
    const sec=profileWords(cyr(r.items.filter(t=>t.x>=secH.x-60&&t.x<lenH.x-10&&!(/^\d{1,2}$/.test(t.str)&&t.x<secH.x-15)).map(t=>t.str).join(" ").trim()));
    const len=r.items.find(t=>Math.abs(t.x-lenH.x)<40&&/^\d{2,5}$/.test(t.str));
    const line=r.items.map(t=>t.str).join(" "),ref=/(?:обратн[ао]|позиции\s+по|по)\s+(?:марке\s+)?([А-ЯЁA-Z]{1,3}\d{1,4}(?:[-.]\d{1,3})?)/iu.exec(line);
    if(ref&&/обратн|позици|поз\.|по\s+марке/iu.test(line))back=ref[1];
    // "Все позиции по Ф3, кроме …", "обратно Ф4", «Обратна марке К105»: the mark is made like another; its own rows are
    // only changes. («Поз. 1, 2, 9-14 по марке К105» — some parts as there: a group without a member of its own takes it.)
    if(r.items.some(t=>/(?:все\s+)?позиции\s+по|обратн[ао]/iu.test(t.str)&&!/позиции\s+\d/iu.test(t.str)))derived=true;
    {const m=r.items.find(t=>massAt(t)&&/^\d+(?:[,.]\d+)?$/.test(t.str));if(m)mass=Number(m.str.replace(",","."))}
    // The member itself: an I-beam, channel or tube before angles and plates, then the longest; a length the
    // OCR lost does not disqualify it.
    if(sec&&ROLLED.test(sec)){
     const c={sec,len:len?Number(len.str):0,main:/^(уголок|L|∟)/iu.test(sec)?0:1};
     if(!best||c.main>best.main||c.main===best.main&&c.len>best.len)best=c
    }
   }
   // The mark it refers to; when OCR lost that name, the group above (such tables list the base mark first).
   const base=derived?(back&&byMark.get(back))||previous:!best&&back?byMark.get(back)||null:null;
   for(const l of labels)for(const mark of titleMarks(l.str))if(!byMark.get(mark)?.profile){
    const e=base?{mark,profile:base.profile,length_mm:base.length_mm,mass_kg:mass,same:back,ocr:Boolean(l.ocr)}
     :{mark,profile:best?normProfile(best.sec):"",length_mm:best?.len||null,mass_kg:mass,same:back,ocr:Boolean(l.ocr)};
    byMark.set(mark,e);previous=e
   }
  }
  for(const e of byMark.values()){
   if(!e.profile&&e.same&&byMark.get(e.same))e.profile=byMark.get(e.same).profile;
   out.push({mark:e.mark,profile:e.profile,mass_kg:e.mass_kg,length_mm:e.length_mm,...(e.ocr?{ocr:true}:{})})
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
 for(const t of texts){const s=String(t.str||"").replace(/\s+/g," ");let m;
  if((m=/(?:вс[еи]|неоговоренн\S*)\s+отверсти\S*\s*(?:—|-|–)?\s*[ØøФ∅]\s*(\d{1,2}(?:[.,]\d)?)/iu.exec(s))){all.push(+m[1].replace(",","."));said.push(s.trim())}
  else if((m=/(?:отв\.?|отверсти\S*)\s*(?:под\s+болты\s+М\s*\d{2}\s*[-–—]\s*)?[ØøФ∅]\s*(\d{1,2}(?:[.,]\d)?)/iu.exec(s))){other.push(+m[1].replace(",","."));if(/под\s+болт/iu.test(s))said.push(s.trim())}}
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
  const found=[...new Set(texts.map(t=>re.exec(cyr(String(t.str)))).filter(Boolean).map(x=>x[1]+x[2]))];
  if(found.length===1)return{...e,profile:m[1]+m[2]+found[0]+m[3],read_as:e.profile};
  unread.push({table:"Спецификация",text:e.mark+": "+e.profile});return{...e,profile:""}
 })
}
function extractSheet({texts=[],widthPt=0,heightPt=0,segments=[]}={}){
 const med=median(texts.map(t=>t.size))||10;
 const stamp=stampOf(texts,widthPt,heightPt,med),own=stampMarks(stamp).filter(m=>/\d{5}/.test(m));
 // A sheet of one shipping mark in plant numbering: other numbers in view titles are its parts.
 const views=assemblyViews(texts,widthPt,heightPt,med,segments).filter(v=>v.levels.length>=2||v.length_mm)
  .filter(v=>!own.length||v.marks.some(m=>own.includes(m)));
 // (ranges of the stamp and the notes, «Ф26-Ф28», «В1 - В4», and the sheet's title «Колонна К77» count too)
 const range=str=>[...String(str).matchAll(/([А-ЯЁ]{1,3})(\d{1,4})\s*[-–]\s*\1?(\d{1,4})(?!\d)/gu)].flatMap(m=>+m[3]>+m[2]&&+m[3]-+m[2]<=60?Array.from({length:+m[3]-+m[2]+1},(_,i)=>m[1]+(+m[2]+i)):[]);
 const known=new Set(texts.filter(t=>!t.ocr).flatMap(t=>[...(titleMarks(t.str)||titleMarks(String(t.str).replace(/^[А-ЯЁ][а-яё]{3,}\s+/u,""))||[]),...range(t.str)]).filter(m=>!/^[A-Z]\d$/.test(m))),unread=[];
 const table=requiredTable(texts),required=checkOcrMarks([...table],known,unread,"Требуется"),elements=elementTable(texts),spec=ibeamLetters(checkOcrMarks(specTable(texts),known,unread,"Спецификация"),texts,unread);
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
 return{stamp,views,required,elements,spec,fasteners:fastenerTable(texts),holes:holeNotes(texts),standards,levelCount:levels.length,assemblyText,...(unread.length?{unread}:{})}
}
module.exports={extractSheet,sheetStamp,stampNames,titleMarks,levelMm,rowsOf,specTable,specCells,cellAccept,sectionLike,normProfile,fastenerTable,standardsCited};
