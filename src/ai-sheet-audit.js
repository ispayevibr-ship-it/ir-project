"use strict";
/*
 * IR Project AI: сверка листа (жёсткое правило инженера 02.11.2026: «каждый символ чтобы перепроверяло, каждую линию,
 * не все узлы показываются, не все размеры читаются, монтажные схемы так вообще толком не распознаёт»).
 *
 * После чтения листа каждая надпись листа разбирается по видам — марка, ось, размер, отметка, выноска узла, разрез,
 * сечение профиля, текст примечаний, штамп, — и для каждой проверяется, попала ли она в то, что программа взяла с листа:
 *   марка  — в элемент схемы (у той же надписи) или в ведомость/вид сборочного листа;
 *   ось    — в сетку осей схемы;
 *   размер — в пролёт, габарит или расстояние между осями, линиями и элементами схемы;
 *   отметка — в отметки элементов, примечаний «низ/верх», разрезов и видов листа;
 *   выноска узла «1 (М1.11)» — записывается с осями, у которых стоит, и проверяется по комплекту (src/ai-montage.js).
 * Что не попало — пропуск: он показывается в журнале листа, идёт Claude отдельным списком (каждый пропуск —
 * разместить или объяснить) и считается ещё раз после расстановки.
 * Нераспознанные надписи (ни один вид не подошёл) перечисляются: ни один символ листа не пропадает молча.
 * Только чтение: сверка ничего не меняет в найденном.
 */
const {textBox,textFrame,leaderTarget,buildIndex,buildLineIndex,dimensionsOf,markIndexOf,notMark,aMarksOn,findBubble,joinSplitMarks}=require("./ai-scheme-extract");

const MARK=/^([А-ЯЁA-Z]{1,3}|[А-ЯЁA-Z][а-яё]{1,2})\s?(\d{1,4})(?:[-.]\d{1,3})?[а-я]?$/u;
const AXIS=/^(?:[А-ЯЁA-Z]{0,2}\d{1,3}[а-яa-z]?|[А-ЯЁA-Z]{1,2})(?:\/\d{1,2})?$/u;
const LEVEL=/(?:^|[^\d,.])([+\-−±]?\s?\d{1,3}[,.]\d{3})(?![\d])/u;
const DIM=/^\d{1,6}\s*[*!]?$/u;
// «1 (М1.11)», «3(КМ-5)», «2а (л.7)»: узел и лист, где он начерчен.
const NODE_REF=/^(\d{1,3}[а-яa-z]?)\s*\(\s*(?:л\.?\s*)?([А-ЯЁA-Z]{0,4}[\s\-]?\d{1,3}(?:[.\-]\d{1,3})?)\s*\)$/u;
const NODE_TITLE=/^Узел\s+([А-ЯЁA-Z]?\d{1,3}[а-яa-z]?)/u;
const CUT=/^([А-ЯЁA-Z]|\d{1,2})\s*[-–—]\s*\1$/u;
const ALONG=/^по\s?(?:оси\s?|ряду\s?)?([А-ЯЁA-Z]{0,2}\d{0,3})$/u;
const PROFILE=/(?:^|[^А-ЯЁа-яё])(?:\d{2,4}\s?[хx×]\s?\d{1,3}|[IШБКД]\d{2}|∟|□|Тр\.?|Гн\.?|L\d|⌀|Ø|\d{2,3}[БКШ]\d)/u;
const WORDS=/[А-ЯЁа-яё]{3,}/u;
// Sheet references, sheet formats, numbers of notes, dates; steels, thicknesses and profiled sheets.
const REF=/^(?:[AА][0-4]|[МM]\d+(?:\.\d+)*|(?:КМД?|КЖ|АР|ТХ)[\s\-]?\d.*|л\.\s?\S+|\d{1,2}\.|\(\S+\))$/u,DATE=/^(?:\d{2}\.\s?)?\d{2}\.\s?\d{2,4}$/u;
const STEEL=/^(?:Ст\d|С\d{3}|09Г2С|10ХСНД|t\s?\d|[НС]\d{2}-\d{3,4}-)/u;
// (Latin letters that look Cyrillic — «O4» of the axes of КМ1 ИР-71535 against «О4» of its scheme, «C345» — one key)
const LOOK={A:"А",B:"В",C:"С",E:"Е",H:"Н",K:"К",M:"М",O:"О",P:"Р",T:"Т",X:"Х",Y:"У",a:"а",c:"с",e:"е",o:"о",p:"р",x:"х",y:"у"};
const keyOf=m=>String(m||"").trim().replace(/\s+/gu,"").replace(/ё/gu,"е").replace(/[ABCEHKMOPTXYaceopxy](?=[^A-Za-z]|$)/gu,c=>LOOK[c]);
const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const inBox=(c,b,pad)=>c.x>=b.x0-pad&&c.x<=b.x1+pad&&c.y>=b.y0-pad&&c.y<=b.y1+pad;
const levelMm=s=>{const v=Number(String(s).replace(/\s/gu,"").replace("−","-").replace("±","").replace(",","."));return Number.isFinite(v)?Math.round(v*1000):null};

// Every value in mm a scheme gave (its axes, secondary lines, ends of elements) along X and Y: a size is accounted for
// when it is one of the spans or the distance between any two of them.
function positions(s){
 const cum=a=>a.reduce((acc,v)=>{acc.push(acc[acc.length-1]+Number(v||0));return acc},[0]);
 const xs=new Set([...cum(s.spansX||[]),...(s.secondaryX||[])]),ys=new Set([...cum(s.spansY||[]),...(s.secondaryY||[])]);
 // (the other grid of the sheet, the openings and the points of the elements of a roof plan: sizes from them — «5460»,
 // «3350» of the openings 3, «3725» between И and И1 of ММА on АР ч.1 л.5 — are tied too)
 for(const a of s.otherAxes?.axes||[])if(Number.isFinite(a.mm))(a.orient==="V"?xs:ys).add(a.mm);
 for(const o of s.roof?.openings||[]){xs.add(o.x0_mm);xs.add(o.x1_mm);ys.add(o.y0_mm);ys.add(o.y1_mm)}
 for(const o of s.roof?.items||[]){xs.add(o.x_mm);ys.add(o.y_mm)}
 // (a section's levels: the sizes of its chains up the height — АР ч.1 л.12 «Разрез 1-1» — are the distances between them)
 for(const l of s.levels||[])if(Number.isFinite(l.z_mm))ys.add(l.z_mm);
 // (the bases of a plan of bases: their points and the edges of their plates drawn round the columns)
 for(const b of s.bases||[]){for(const v of [b.x_mm,b.plate_mm?.x0_mm,b.plate_mm?.x1_mm])if(Number.isFinite(v))xs.add(v);for(const v of [b.y_mm,b.plate_mm?.y0_mm,b.plate_mm?.y1_mm])if(Number.isFinite(v))ys.add(v)}
 for(const e of s.placements||[]){for(const v of [e.x_mm,e.x2_mm])if(Number.isFinite(v))xs.add(v);for(const v of [e.y_mm,e.y2_mm])if(Number.isFinite(v))ys.add(v);
  for(const v of [e.length_mm,e.diameter_mm,e.width_mm,e.dx_mm,e.dy_mm])if(Number.isFinite(v)&&v>0)xs.add(v),ys.add(v)}
 // (an elevation — a wall unfolded along its axis —: along the wall the elements' places y_mm, up — their heights z_mm)
 if(s.kind==="elevation"){for(const e of s.placements||[]){for(const v of [e.y_mm,e.y2_mm])if(Number.isFinite(v))xs.add(v);for(const v of [e.z0_mm,e.z1_mm,e.z_mm])if(Number.isFinite(v))ys.add(v)}}
 const diffs=set=>{const a=[...set].slice(0,600),out=new Set();for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)out.add(Math.abs(a[i]-a[j]));return[...out]};
 return{x:diffs(xs),y:diffs(ys),all:[...(s.spansX||[]),...(s.spansY||[]),s.sizeX,s.sizeY].filter(Number.isFinite)}
}
function hasValue(list,v,tol){return list.some(x=>Math.abs(x-v)<=tol)}
// All numbers of a structure in mm (levels of notes, sections, views): a level read anywhere of the sheet's results.
function numbersIn(obj,out=new Set(),depth=0){
 if(depth>8||obj===null||obj===undefined)return out;
 if(typeof obj==="number"){if(Number.isFinite(obj))out.add(Math.round(obj));return out}
 if(Array.isArray(obj)){for(const v of obj.slice(0,4000))numbersIn(v,out,depth+1);return out}
 if(typeof obj==="object")for(const [k,v] of Object.entries(obj))if(k!=="sheet_point_pt"&&k!=="bbox")numbersIn(v,out,depth+1);
 return out
}

function auditSheet(geometry,page){
 // (one label of several marks «Св 2, Св 3» — each mark, as the scheme reads it)
 const MULTI=/^(?:[А-ЯЁA-Z][а-яёА-ЯЁA-Z]{0,2}\s*\d{1,3}(?:[-.]\d{1,2})?\s*,\s*)+[А-ЯЁA-Z][а-яёА-ЯЁA-Z]{0,2}\s*\d{1,3}(?:[-.]\d{1,2})?$/u;
 const texts=joinSplitMarks((geometry?.texts||[]).filter(t=>String(t?.str||"").trim())).flatMap(t=>MULTI.test(String(t.str).trim())?String(t.str).split(",").map(p=>({...t,str:p.trim()})):[t]);
 const segments=(geometry?.segments||[]).filter(s=>s&&Number.isFinite(s.a?.x)&&Number.isFinite(s.b?.y)&&near(s.a,s.b)>0.05);
 const schemes=(page?.schemes||[]).filter(s=>!s.error&&s.bbox);
 const aMarks=aMarksOn(texts),markIndex=markIndexOf(texts);
 const index=buildIndex(segments);let lineIndex=null;const lines=()=>lineIndex||(lineIndex=buildLineIndex(segments));
 const schemeOf=c=>schemes.findIndex(s=>inBox(c,s.bbox,40));
 const sheetMarks=new Set([...(page?.sheet?.views||[]).flatMap(v=>v.marks||[]),...(page?.sheet?.required||[]).map(r=>r.mark),...(page?.sheet?.elements||[]).map(r=>r.mark),
  ...(page?.sheet?.spec||[]).map(r=>r.mark)].filter(Boolean).map(keyOf));
 const usedMarks=new Set(schemes.flatMap(s=>(s.placements||[]).map(p=>keyOf(p.mark))));
 for(const k of ["trusses","baseDetails","columnDetails","sections"])for(const m of JSON.stringify(page?.[k]||[]).match(/"mark":"([^"]+)"/gu)||[])usedMarks.add(keyOf(m.slice(8,-1)));
 // (a bubble «01» read with a digit is the axis «О1» of the grid, «I» is «И»: АР ч.1 л.5 ИР-71535, ten axes of the grid
 // counted as misses; the axes of the other grid of the sheet — the existing building beside — are read too)
 const axisKey=m=>keyOf(m).replace(/^[0O](?=\d)/u,"О").replace(/^I(?=\d|\/|$)/u,"И").replace(/^J(?=\d|\/|$)/u,"Й");
 // (and the axes of the АР layouts of walls — «Б»…«Л» of the layout along row 08 on АР ч.2 л.2 ИР-71535)
 const bubblesNamed=new Set([...schemes.flatMap(s=>[...(s.axesX||[]),...(s.axesY||[]),...(Array.isArray(s.otherAxes)?s.otherAxes.flat():s.otherAxes?.axes||[]).map(a=>a.name)]),
  ...(page?.ar?.views||[]).flatMap(v=>[...(v.axes||[]).map(a=>a.name),v.row].filter(Boolean))].map(axisKey));
 const levelsUsed=numbersIn([schemes.map(s=>[s.levelNotes,s.title,(s.levels||[]).map(l=>l.z_mm),(s.roof?.levels||[]).map(l=>l.z_mm),(s.placements||[]).map(p=>[p.z0_mm,p.z1_mm,p.z_mm]),(s.lines?.openings||[]).map(o=>o.bottom_mm)]),page?.sections,page?.sectionProfiles,
  (page?.sheet?.views||[]).map(v=>[v.z0_mm,v.z1_mm]),page?.trusses,page?.columnDetails,page?.baseDetails,page?.tank,page?.ar]);
 for(const s of schemes)for(const m of String(s.title||"").match(/[+\-−]?\d{1,3}[,.]\d{3}/gu)||[]){const v=levelMm(m);if(v!==null)levelsUsed.add(v)}
 // The wall layouts of АР on the sheet: their positions along (axes, panels, openings) and up (levels, panels, openings),
 // every distance between two of them; a text belongs to the view whose row line is the nearest under it.
 const pairs=set=>{const a=[...set].filter(Number.isFinite).slice(0,500),out=[];for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)out.push(Math.abs(a[i]-a[j]));return out};
 const arViews=(page?.ar?.views||[]).filter(v=>v?.bbox&&Array.isArray(v.panels)).map(v=>{let U=null,Z=null;const tops=v.panels.map(p=>p.pt?.y).filter(Number.isFinite);
  return{v,top:tops.length?Math.min(...tops):v.bbox.y1-400,
   u:()=>U||(U=pairs(new Set([...(v.axes||[]).map(a=>a.mm),...v.panels.flatMap(p=>[p.u0,p.u1]),...(v.openings||[]).flatMap(o=>[o.u0,o.u1])]))),
   z:()=>Z||(Z=pairs(new Set([...(v.levels||[]),...v.panels.flatMap(p=>[p.z0,p.z1]),...(v.openings||[]).flatMap(o=>[o.z0,o.z1])])))}});
 // (a layout of roof panels of АР — the panels, openings, axes and level lines of the plan in points of the sheet —: a size
 //  is tied when it measures its value at the plan's scale (1000 mm a panel's width) from one of them, or runs from end to
 //  end of a panel — its length along the slope; АР ч.2 л.11 ИР-71535 «12550» of the strips, «5460», «3510» from the axes to
 //  the openings, «1190», «300», «250» of the edges at the walls)
 const arRoofs=(page?.ar?.roofs||[]).filter(r=>Array.isArray(r.panels)&&r.panels.length>=4).map(r=>{
   const xs=[...r.panels.flatMap(p=>[p.x0,p.x1]),...(r.openings||[]).flatMap(o=>[o.x0,o.x1]),...(r.xAxes||[]).map(a=>a.pt),...(r.levels||[]).filter(l=>l.dir==="x").map(l=>l.at)].filter(Number.isFinite),
    ys=[...r.panels.flatMap(p=>[p.y0,p.y1]),...(r.openings||[]).flatMap(o=>[o.y0,o.y1]),...(r.yAxes||[]).map(a=>a.pt),...(r.levels||[]).filter(l=>l.dir==="y").map(l=>l.at)].filter(Number.isFinite);
   const w=r.panels.map(p=>Math.min(Math.abs(p.x1-p.x0),Math.abs(p.y1-p.y0))).sort((a,b)=>a-b)[r.panels.length>>1];
   return w>0?{r,xs,ys,scale:1000/w,box:{x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)}}:null}).filter(Boolean);
 const arRoofTie=(c,d,v)=>{for(const R of arRoofs){if(!inBox(c,R.box,160)||!Number.isFinite(d.lo)||!Number.isFinite(d.hi))continue;
   const lo=Math.min(d.lo,d.hi),hi=Math.max(d.lo,d.hi),len=hi-lo,m=len*R.scale,fits=Math.abs(m-v)<=Math.max(20,v*.015);
   // (the end of a panel lapped by the next tier — «12530» of Пк-6 up to where Пк-1 lies on it, 7 pt short of its own end)
   const laps=R.r.panels.filter(p=>Array.isArray(p.lap)).flatMap(p=>d.flat?[]:[Math.min(p.y0,p.y1)-p.lap[0],Math.max(p.y0,p.y1)+p.lap[1]]);
   const P=[...(d.flat?R.xs:R.ys),...laps],on=x=>P.some(p=>Math.abs(p-x)<=1.5);
   if((on(lo)||on(hi))&&fits)return true;
   const pe=(a,b)=>Math.abs(a-b)<=1.5||Math.abs(a-b)<=10&&laps.some(q=>Math.abs(q-b)<=1.5);
   if(R.r.panels.some(p=>(d.flat?p.dir==="x":p.dir!=="x")&&pe(d.flat?Math.min(p.x0,p.x1):Math.min(p.y0,p.y1),lo)&&pe(d.flat?Math.max(p.x0,p.x1):Math.max(p.y0,p.y1),hi)))return true;
   // (an offset between two lines drawn across the plan — the edge and the line of the wall at the eaves, «300» past «1190»)
   const drawn=y=>segments.reduce((a,q)=>{const ok=d.flat?Math.abs(q.a.x-y)<=.4&&Math.abs(q.b.x-y)<=.4:Math.abs(q.a.y-y)<=.4&&Math.abs(q.b.y-y)<=.4;return ok?a+Math.abs(d.flat?q.a.y-q.b.y:q.a.x-q.b.x):a},0);
   if(fits&&v<=1500&&drawn(lo)>=30&&drawn(hi)>=30)return true;
   // (a short offset at the end of a chain whose own ticks merge with its neighbour's — «80» from the line of the wall to the
   //  edge of Пк-17 under «1100», АР ч.2 л.12): a point of the plan by an end and a drawn line that far from it
   if(v<=300&&P.some(p=>[lo,hi].some(e=>Math.abs(p-e)<=3)&&[p-v/R.scale,p+v/R.scale].some(y=>Math.abs(y-p)>=1&&drawn(y)>=30)))return true;
   // (a slip of the sheet: both ends on the plan's lines, the size drawn to the value of the same sizes beside it but one
   //  digit written otherwise — «4510» from О4/1 to the opening where the three others read «3510»)
   const t=String(v),r=[0,-1,1,-2,2].map(k=>String(Math.round(m/10)*10+k*10)).find(r=>r.length===t.length&&[...t].filter((ch,k)=>ch!==r[k]).length===1);
   if(on(lo)&&on(hi)&&r&&Math.abs(Number(r)-v)>=100)return{slip:Number(r)}}
  return false};
 const arViewAt=c=>arViews.filter(w=>c.x>=w.v.bbox.x0&&c.x<=w.v.bbox.x1&&c.y<=w.v.bbox.y1+40&&c.y>=w.top-250).sort((p,q)=>(p.v.bbox.y1-c.y)-(q.v.bbox.y1-c.y))[0];
 const pos=schemes.map(positions),dims=(()=>{try{return dimensionsOf(texts,segments)}catch{return[]}})(),dimOf=new Map(dims.map(d=>[d.text,d]));
 // Placements of each scheme by mark, to pair each label with the element it named.
 const pool=schemes.map(s=>{const m=new Map();for(const p of s.placements||[]){const k=keyOf(p.mark);if(!m.has(k))m.set(k,[]);m.get(k).push({p,taken:false})}return m});
 const items={marks:[],axes:[],dims:[],levels:[],nodes:[],cuts:[],along:[],profiles:[],notes:[],unknown:[]};
 const missed=[];
 const where=c=>{const k=schemeOf(c);return k<0?null:k};
 // The axes nearest a point of a scheme (by its bubbles): «у осей 2/И».
 const bubbles=[];
 for(const t of texts){const str=String(t.str).trim();if(!AXIS.test(str))continue;const b=(()=>{try{return findBubble(t,segments,index)}catch{return null}})();if(b)bubbles.push({...b,text:t})}
 const bubbleTexts=new Set(bubbles.map(b=>b.text));
 const axesAt=c=>{const vx=bubbles.filter(b=>Math.abs(b.y-c.y)>Math.abs(b.x-c.x));const v=[...vx].sort((a,b)=>Math.abs(a.x-c.x)-Math.abs(b.x-c.x))[0],h=bubbles.filter(b=>Math.abs(b.x-c.x)>=Math.abs(b.y-c.y)).sort((a,b)=>Math.abs(a.y-c.y)-Math.abs(b.y-c.y))[0];
  return[v?.name,h?.name].filter(Boolean).join("/")};
 const at=t=>{const c=textFrame(t).c;return{x:Math.round(c.x*10)/10,y:Math.round(c.y*10)/10}};
 const pending=[];let arJson=null;const arText=()=>arJson||(arJson=JSON.stringify(page?.ar||{}));
 const inNiche=(t,key,v)=>{const c=at(t);return (page?.ar?.niches||[]).some(n=>(n.views||[]).some(w=>w.box&&c.x>=w.box.x0-12&&c.x<=w.box.x1+12&&c.y>=w.box.y0-12&&c.y<=w.box.y1+12&&(w[key]||[]).includes(v)))};
 let arSet=null;const arNums=()=>arSet||(arSet=new Set([...arText().matchAll(/"(?:area_m2|mass_kg|total_m2|total_kg|rows_m2|rows_kg|count|panels|volume_m3)":(\d+(?:\.\d+)?)/gu)].map(m=>Math.round(Number(m[1])*100))));
 // (a number in a circle that is the number of a node titled on the sheet — «Узел 40» — and no axis of a scheme: the mark
 // of that node on a section, not an axis; АР ч.1 л.12 ИР-71535, the circle «40» on the section 1-1 at the gutter)
 // (a label taken into a view of the sheet — a node, a section, a sketch — by src/ai-sheet-details.js)
 const inView=(t,key,str)=>{const c=textFrame(t).c;return (page?.details?.views||[]).some(w=>w.box&&c.x>=w.box.x0-8&&c.x<=w.box.x1+8&&c.y>=w.box.y0-8&&c.y<=w.box.y1+8&&(w[key]||[]).some(x=>x===str||String(x).replace(/\s/gu,"")===str.replace(/\s/gu,"")))};
 // (the words of a note broken into pieces by the drawing — «г», «не», «в», «на», «III А , с», «№165)» — and the rows of the
 //  stamp: a piece on one line with others, close together, the line holding words — read in the line; the whole full run
 //  of ИР-71535 17.11.2026: of 7 650 «unknowns» ~2 000 were such pieces of the notes and the stamps of КМ1–КМ3)
 let lineOf=null;const proseLine=t=>{if(!lineOf){lineOf=new Map();const H=t=>Math.max(1,Number(t.size)||8),list=texts.map(t=>{const f=textFrame(t),a=((Number(t.angle)||0)%360+360)%360;return{t,c:f.c,w:f.w,h:H(t),v:Math.abs(a-90)<20||Math.abs(a-270)<20}});
   const rows=new Map();for(const q of list){const k=(q.v?"v":"h")+Math.round((q.v?q.c.x:q.c.y)/3);if(!rows.has(k))rows.set(k,[]);rows.get(k).push(q)}
   for(const q of list){const near=[];for(const d of [-1,0,1]){const k=(q.v?"v":"h")+(Math.round((q.v?q.c.x:q.c.y)/3)+d);for(const o of rows.get(k)||[])if(o!==q&&Math.abs((q.v?o.c.x-q.c.x:o.c.y-q.c.y))<=q.h*.45&&Math.abs((q.v?o.c.y-q.c.y:o.c.x-q.c.x))<=(o.w+q.w)/2+2.5*q.h)near.push(o)}
    const words=near.reduce((a,o)=>a+(String(o.t.str).match(/[А-ЯЁа-яёA-Za-z]{3,}/gu)||[]).length,0);lineOf.set(q.t,words)}}
  return (lineOf.get(t)||0)>=2};
 // (a cell of a ruled table — a number, a letter, a code with the lines of its cell round it and the row line going on over
 //  other cells: the tables of loads, steel, bolts, masses of КМ, given to Claude by rows)
 let cellTexts=null,titleS=null;const sheetTitle=()=>titleS??(titleS=String(page?.sheet?.stamp?.name||"")+" "+schemes.map(s=>s.title||"").join(" "));
 let hz=null,vt=null;const tableCell=c=>{if(!hz){hz=segments.filter(q=>Math.abs(q.a.y-q.b.y)<.3&&Math.abs(q.a.x-q.b.x)>4);vt=segments.filter(q=>Math.abs(q.a.x-q.b.x)<.3&&Math.abs(q.a.y-q.b.y)>4)}
  const over=hz.filter(q=>Math.min(q.a.x,q.b.x)<=c.x&&Math.max(q.a.x,q.b.x)>=c.x&&q.a.y<c.y&&c.y-q.a.y<=40).sort((p,q)=>q.a.y-p.a.y)[0],under=hz.filter(q=>Math.min(q.a.x,q.b.x)<=c.x&&Math.max(q.a.x,q.b.x)>=c.x&&q.a.y>c.y&&q.a.y-c.y<=40).sort((p,q)=>p.a.y-q.a.y)[0];
  if(!over||!under)return false;const y0=over.a.y,y1=under.a.y;
  const sides=vt.filter(q=>Math.min(q.a.y,q.b.y)<=y0+.5&&Math.max(q.a.y,q.b.y)>=y1-.5);const L=sides.filter(q=>q.a.x<c.x).sort((p,q)=>q.a.x-p.a.x)[0],R=sides.filter(q=>q.a.x>c.x).sort((p,q)=>p.a.x-q.a.x)[0];
  if(!L||!R||R.a.x-L.a.x>400)return false;
  const ox0=Math.min(over.a.x,over.b.x),ox1=Math.max(over.a.x,over.b.x),more=sides.filter(q=>q!==L&&q!==R&&q.a.x>=ox0-.5&&q.a.x<=ox1+.5).length;
  return more>=1||ox1-ox0>(R.a.x-L.a.x)*2.5};
 const titledNodes=new Set(texts.map(t=>NODE_TITLE.exec(String(t.str).trim())).filter(Boolean).map(m=>m[1]));
 // (a floor plan of АР — src/ai-floor-plan.js, АР ч.2 л.19 ИР-71535: the explication of floors, the finishes of rooms, the
 //  colour legend and the kinds of finishes read whole as tables; on the plan the numbers in triangles (floor types), in
 //  rhombi over their heights (finishes), the levels of the floors and the rooms in their circles — each taken by a sign)
 const fp=page?.ar?.floorPlan,fpBoxes=fp?["explication","finishSchedule","colourLegend","finishKinds"].map(k=>fp[k]?.box).filter(Boolean):[];
 const fpRead=(t,str)=>{if(!fp)return null;const c=textFrame(t).c,s=str.replace(/\s+/gu," ");
  if(fpBoxes.some(b=>inBox(c,b,1)))return "table";
  for(const q of fp.signs||[]){const nearIt=Math.abs(q.x-c.x)<=4&&Math.abs(q.y-c.y)<=4;
   if(nearIt&&(q.type===s||q.level===s))return q.kind;
   if(q.kind==="finish"&&q.height&&q.height.replace(/\s+/gu," ")===s&&q.box&&c.x>=q.box.x0&&c.x<=q.box.x1&&c.y>q.y&&c.y<=q.box.y1+1)return "finish"}
  if((fp.slopes||[]).some(q=>q.text===s&&Math.abs(q.x-c.x)<=20&&Math.abs(q.y-c.y)<=20))return "slope";
  if((fp.rooms||[]).some(r=>r.n===s&&Math.abs(r.x-c.x)<=6&&Math.abs(r.y-c.y)<=6))return "room";
  return null};
 for(const t of texts){
  const str=String(t.str).trim(),c=textFrame(t).c,k=where(c);
  {const f=fpRead(t,str);if(f){items.notes.push({text:str,floor:f});continue}}
  if(bubbleTexts.has(t)&&/^\d{1,3}$/u.test(str)&&titledNodes.has(str)&&!bubblesNamed.has(axisKey(str))){items.nodes.push({text:str,node:str,mark:true,scheme:k});continue}
  if(bubbleTexts.has(t)){const used=bubblesNamed.has(axisKey(str));items.axes.push({text:str,used});if(!used&&k!==null)missed.push({kind:"axis",text:str,scheme:k,at:at(t),why:"ось в кружке не вошла в сетку схемы"});continue}
  const node=NODE_REF.exec(str);
  if(node){let target=c;try{const tg=leaderTarget(t,segments,index,new Set(),lines());if(tg?.leader)target={x:tg.x,y:tg.y}}catch{}
   items.nodes.push({text:str,node:node[1],sheet:node[2].replace(/\s/gu,""),scheme:k,axes:axesAt(target),at:{x:Math.round(target.x*10)/10,y:Math.round(target.y*10)/10}});continue}
  const title=NODE_TITLE.exec(str);if(title){items.nodes.push({text:str,node:title[1],title:true,scheme:k});continue}
  if(CUT.test(str)||/^(?:[А-ЯЁ]|\d{1,2})$/u.test(str)&&k===null){items.cuts.push({text:str,scheme:k});continue}
  if(ALONG.test(str)){items.along.push({text:str,scheme:k});continue}
  const lv=LEVEL.exec(str)||(/^\+\d{4,5}$/u.test(str)?[str,(Number(str.slice(1))/1000).toFixed(3)]:null);
  // (a level inside a sentence of the notes — «За условную отметку 0,000 принят…» — is the note's, read in the whole text)
  // (a level that sends to another sheet — «на отм. +16,100, см. лист КМ 3-17» — is a reference: what stands there is
  // placed by that sheet; АР ч.1 л.13 ИР-71535, the crane platform of КМ3 л.17 on the section 2-2)
  if(lv&&/см\s*\.?\s*л(?:ист)?\.?\s*(?:КМД?|АР|КЖ|ТХ|ОВ|ВК|ЭМ)/iu.test(str)){items.notes.push({text:str,scheme:k,ref:true});continue}
  // (a bare number with three decimals that is a number of a table the АР reader took — the mass of one «0,134» kg of the
  //  anchor поз. 44, АР ч.2 л.18 —, not a level)
  if(lv&&str===lv[1]&&page?.ar&&arNums().has(Math.round(Number(str.replace(",","."))*100))&&/,\d{3}$/u.test(str)){const x=Number(str.replace(",","."));if((page.ar.trims||[]).some(q=>q.mass_kg===x)){items.notes.push({text:str,ar:true});continue}}
  // (a level in a sentence of the notes outside the schemes — «относительную отметку 0,000», «+18,980 м , по оси Е»,
  //  «до отм . -0,200.» — the note's, read in its line)
  if(lv&&k===null&&(/[А-ЯЁа-яё]{4,}/u.test(str.replace(/отм/giu,""))||proseLine(t))){items.notes.push({text:str,level:true});continue}
  if(lv&&str.length<=40&&(/отм|верх|низ|^[+\-−±]/iu.test(str)||str===lv[1])){
   // (or written on a node or a section of the sheet and taken into its details — ИР-71535 АР ч.2 л.14–л.18, the levels of
   //  nodes 1, 2, 5: the node's own, nothing in a scheme to tie them to)
   const v=levelMm(lv[1]),used=v!==null&&(hasValue([...levelsUsed],v,1)||inNiche(t,"levels_mm",v))||inView(t,"levels",str);
   items.levels.push({text:str,mm:v,used,scheme:k});
   if(!used)missed.push({kind:"level",text:str,scheme:k,at:at(t),why:k!==null?"отметка не попала в высоты элементов схемы":"отметка на виде или разрезе вне схем — ни к чему не отнесена"});continue
  }
  const mk=keyOf(str);
  // (a mark of a door, gate, window, partition with a hyphen «Д-2», «В-6», «ОК-4», «П-1» — the АР reader takes it from its
  // plans and tables: read when the АР of the sheet has it; on ИР-71535 АР ч.1 л.10 they stood «unknown», 13.11.2026)
  if(/^[А-ЯЁ](?:[А-ЯЁ]{0,2}|[а-яё]{1,2})-\d{1,3}(?:\.\d{1,2})?[а-я]?$/u.test(mk)&&!/^(?:АР|КМД?|КЖ|ТХ|ОВ|ВК|ЭМ|ЭО|ГП|АС|КР|ПЗ)-/u.test(mk)&&page?.ar){const used=arText().includes('"'+mk+'"')||usedMarks.has(mk)||sheetMarks.has(mk);items.marks.push({text:str,used,scheme:k});
   if(!used)missed.push({kind:"mark",text:mk,scheme:k,at:at(t),axes:axesAt(c),why:"марка проёма или перегородки АР на листе — в найденном её нет"});continue}
  // (a colour «RAL5012» and a position of a table «Поз.23» are no marks of elements: on the АР of ИР-71535 they were 77 of
  // 82 «misses» — the colours of the panels the АР reader takes from its own tables)
  if(/^(?:RAL|РАЛ)\d{4}$/iu.test(mk)||/^Поз\.?\d/u.test(mk))continue;
  // (steel «C345» in Latin, concrete «F150», «W6», primer «ГФ021» — no marks of elements)
  if(/^[CС]\d{3}(?:-\d)?$/u.test(mk)||/^[FW]\d{1,3}$/u.test(mk)||/^ГФ\d{3}$/u.test(mk))continue;
  // (a mark with a hyphen of КМ «Рс-1», «Сг-10», «Св-3», «Ф-1» written «Рс -1» — paired with its element like any mark)
  if(!page?.ar&&/^(?:[А-ЯЁ]{1,3}|[А-ЯЁ][а-яё]{1,2})-\d{1,3}(?:\.\d{1,2})?[а-я]?$/u.test(mk)&&!/^(?:АР|КМД?|КЖ|ТХ|ОВ|ВК|ЭМ|ЭО|ГП|АС|КР|ПЗ|ИР|СП|СН)-/u.test(mk)&&!notMark(mk,aMarks)){pending.push({t,str,mk,c,k});continue}
  // (a mark of letters only or small letters «Рр», «Ро», «а», «б», «р1», «б 1» — the girts, posts, braces of the frames of
  //  КМ1 л.30, КМ3 —: read when an element of a scheme or a list of the sheet has it)
  if(/^(?:[А-ЯЁ][а-яё]{0,2}|[а-яё]{1,2})\d{0,2}$/u.test(mk)&&(usedMarks.has(mk)||sheetMarks.has(mk))){items.marks.push({text:str,used:true,scheme:k,letters:true});continue}
  if(MARK.test(str)&&!notMark(mk,aMarks)&&!/^\d/u.test(mk)&&!/^[AА][0-4]$/u.test(mk)&&!/^С(?:235|245|255|275|285|345|355|375|390|440|590)$/u.test(mk)){pending.push({t,str,mk,c,k});continue}
  if(DIM.test(str)){
   const v=Number(str.replace(/[^\d]/gu,"")),d=dimOf.get(t);
   if(!d||k===null||v<10){items.dims.push({text:str,used:null,scheme:k});continue}
   const p=pos[k],tol=Math.max(10,v*0.004);let used=hasValue(p.all,v,tol)||hasValue(d.flat?p.x:p.y,v,tol);
   // (a size over twice the whole plan — «171000», «239000» of the existing workshop on АР ч.1 л.5, written on a broken
   // dimension line — is the overall size of what lies beyond the plan: read as such, nothing on the plan to tie it to)
   const whole=Math.max(schemes[k].sizeX||0,schemes[k].sizeY||0),broken=!used&&whole>0&&v>whole*2&&(d.hi-d.lo)*(schemes[k].scaleMmPerPt||0)<v*.5;
   if(broken)used=true;
   // (a size on a wall layout of АР — the panels, openings and doors of the view along the wall (u) and up (z) —: tied by
   // the view's own positions; АР ч.2 л.16 ИР-71535 «4660», «3580», «620» of the openings and panels of ряд Ж — 38 «unbound»)
   if(!used){const w=arViewAt(c);if(w)used=hasValue(d.flat?w.u():w.z(),v,tol)}
   let roofSlip=null;if(!used){const rt=arRoofTie(c,d,v);if(rt){used=true;if(rt.slip)roofSlip=rt.slip}}
   // (a size kept by the section with its place — measured at the section's scale, src/ai-section-extract.js)
   if(!used&&schemes[k].kind==="section")used=(schemes[k].dims||[]).some(x=>Math.abs(x.mm-v)<=tol)
   const slip=schemes[k]?.kind==="section"&&(schemes[k].dims||[]).find(x=>x.sheet_slip&&Math.abs(x.mm-v)<=tol);
   // (a short offset of an edge from an axis — one end of the size on an axis line run across the plan, the other on a line
   // drawn by it: АР ч.1 л.5 ИР-71535 «370» of the roof edge at each axis О2…О8 and «400» at the axis К of ММА — the edge is
   // drawn, not an element of the scheme; tied as its offset from that axis)
   if(!used&&v<=1000&&schemes[k].roof){const bb=schemes[k].bbox,run=bb?(d.flat?bb.y1-bb.y0:bb.x1-bb.x0):0;
    const along=X=>segments.reduce((a,q)=>{const ok=d.flat?Math.abs(q.a.x-X)<=.4&&Math.abs(q.b.x-X)<=.4:Math.abs(q.a.y-X)<=.4&&Math.abs(q.b.y-X)<=.4;return ok?a+Math.abs(d.flat?q.a.y-q.b.y:q.a.x-q.b.x):a},0);
    const la=along(d.lo),lb=along(d.hi);if(run>0&&Math.max(la,lb)>=run*.5&&Math.min(la,lb)>=3)used=true}
   // (a size on a view of a gate niche — its plan, its sections — read with the niche: АР ч.2 л.8 ИР-71535 «740», «640»…)
   if(!used&&inNiche(t,"dims_mm",v))used=true;
   // (a size of a node or a section drawn inside the scheme's frame — the sections 1-1…7-7 of the girts at the edge of the
   //  elevations of КМ1 л.30 —, taken into that view with its plates and bolts by src/ai-sheet-details.js)
   if(!used&&inView(t,"dims",str))used=true;
   // (a size on a floor plan of АР — the walls, partitions, pits of the plan not elements of a scheme —: tied when it measures
   //  its value at the plan's scale between its ticks, its own pair or two ticks along its line — «250» of the gap at the wall
   //  under a line run up to the number, АР ч.2 л.19 ИР-71535)
   // (and on a girt elevation of КМ — the heights between the levels of girt bottoms, the places of posts and openings along
   //  the wall: КМ2 л.14 ИР-71535 «1500», «2050» — to the scale of the view)
   if(!used&&(fp||schemes[k].kind==="elevation")&&schemes[k].scaleMmPerPt>0){const sc=schemes[k].scaleMmPerPt,tl=Math.max(10,v*(fp?.005:.012));
    if(Math.abs((d.hi-d.lo)*sc-v)<=tl)used=true;
    else if(Number.isFinite(d.line)){const L=d.line,f=Math.min(d.from??d.lo,d.lo)-2,e=Math.max(d.to??d.hi,d.hi)+2;
     const ticks=segments.filter(q=>{const a=d.flat?[q.a.y,q.b.y]:[q.a.x,q.b.x],b=d.flat?[q.a.x,q.b.x]:[q.a.y,q.b.y];return Math.min(...a)<L-1.5&&Math.max(...a)>L+1.5&&Math.abs(a[0]-a[1])<=8&&Math.abs(b[0]-b[1])>=1.5&&Math.abs(b[0]-b[1])<=8&&(b[0]+b[1])/2>=f&&(b[0]+b[1])/2<=e}).map(q=>d.flat?(q.a.x+q.b.x)/2:(q.a.y+q.b.y)/2);
     used=ticks.some(x=>ticks.some(y=>y>x&&Math.abs((y-x)*sc-v)<=tl))}}
   items.dims.push({text:str,mm:v,used,scheme:k,...(broken?{broken:true}:{}),...(slip?{sheet_slip:true,measured_mm:slip.measured_mm}:{}),...(roofSlip?{sheet_slip:true,measured_mm:roofSlip}:{})});
   if(!used)missed.push({kind:"dim",text:str,scheme:k,at:at(t),why:"размер не привязан: нет такого расстояния между осями, линиями и элементами схемы"});continue
  }
  if(PROFILE.test(str)||STEEL.test(str)){items.profiles.push({text:str,scheme:k});continue}
  // (the bolts «М 24-8.8», «М20-5.8,», their class «кл . С 25», «8.8,»; profiles written apart «35 Ш 1», «20 К 1», «[16 П»,
  //  «[16П/С245», «┐┌» of a pair of angles, «∅33 мм»; profiled sheet «Н 60-845-0.8»; steel «( С 245)», «С 345,»; a plate
  //  «t=10», a radius «R=350», a slope «i=0.1», a count «2 шт .»; a base type «Бк 7» drawn on its own sheet)
  {const q=str.replace(/[\s,;.)]+$/u,"").replace(/^\(\s?/u,"");
   if(/^[МM]\s?\d{2}(?:\s?-\s?\d{1,2}\.\d)?$/u.test(q)||/^кл\s?\.?\s?(?:прочн\.?\s?)?[СC]?\s?\d{1,2}(?:\.\d)?$/u.test(q)||/^\d{1,2}\.\d$/u.test(q)&&/^(?:4\.6|5\.6|5\.8|8\.8|10\.9)/u.test(q)){items.profiles.push({text:str,scheme:k,bolt:true});continue}
   if(/^\d{2}\s?[БКШУПД]\s?\d$/u.test(q)||/^\[\s?\d{1,2}(?:\s?[ПУ])?(?:\s?\/\s?[СC]\s?\d{3})?$/u.test(q)||/^[┐┌┘└]{2}$/u.test(q)||/^[∅Ø⌀]\s?\d{1,3}(?:\s?мм)?$/u.test(q)||/^[НСН]\s?\d{2,3}-\d{3,4}-\d[.,]\d$/u.test(q)||/^[СC]\s?\d{3}(?:-\d)?$/u.test(q)){items.profiles.push({text:str,scheme:k});continue}
   if(/^t\s?=\s?\d{1,3}(?:[,.]\d)?(?:\s?мм)?$/u.test(q)||/^R\s?=\s?\d{1,5}$/u.test(q)||/^i\s?=\s?\d+(?:[,.]\d+)?\s?%?$/u.test(q)||/^\d{1,4}\s?шт$/u.test(q)||/^\/?\s?\d{1,4}\s?шт\.?\s?\/?$/u.test(str.trim())||/^Бк\s?\d{1,2}$/u.test(q)||/^см\s?\.?\s?[А-ЯЁ]{2}/u.test(q)){items.notes.push({text:str,note:true});continue}
   const eq=/^(\d{1,2})\s?[хx×*]\s?(\d{2,5})\s?=\s?(\d{3,6})$/u.exec(q);if(eq&&Number(eq[1])*Number(eq[2])===Number(eq[3])){items.notes.push({text:str,chain:true});continue}}
  // (a plate by its thickness «-t44», «- 30», «- 12,0 х 57,0»; a bolt or an anchor «М24х170», «1.1.М30х900.09Г2С-4»)
  if(/^[-–]\s?(?:t\s?)?\d{1,3}(?:[,.]\d{1,2})?(?:\s?[хx×]\s?\d{1,4}(?:[,.]\d{1,2})?)?$/u.test(str)&&!/^[-–]\s?\d[,.]\d{3}$/u.test(str)&&(/t|[хx×]/u.test(str)||/^[-–]\s?\d{1,3}$/u.test(str))){items.profiles.push({text:str,scheme:k,plate:true});continue}
  if(/^(?:\d\.\d\.)?[МM]\d{2}\s?[хx×]\s?\d{2,4}/u.test(str)){items.profiles.push({text:str,scheme:k,bolt:true});continue}
  // (the code of the set in the stamp «ИР-71535.00-05.2025-01-», and its line in Latin-1 of a font without Cyrillic)
  if(/^ИР\s?-\s?\d{5}/u.test(str)){items.notes.push({text:str,stamp:true});continue}
  if((str.match(/[\u00C0-\u00FF]/gu)||[]).length>=Math.max(2,str.replace(/[\s\d\W]/gu,"").length*.4)){items.notes.push({text:str,stamp:true,latin1:true});continue}
  if(REF.test(str)||DATE.test(str)){items.notes.push({text:str});continue}
  // (an approximate level «~+14,400» — the top of a wall under a slope written about: АР ч.2 л.8 ИР-71535 —, a note, the panels
  //  of the view give the height)
  if(/^[~≈]\s?[+\-−]?\d{1,2}[,.]\d{3}$/u.test(str)){items.notes.push({text:str,approx:true});continue}
  // (the stamp and the heads of tables: the stage «РП», the code of the set, units «м2», «ед.кг», «шт.», «по RAL», «см.п.п.1»,
  //  the panel series «Prisma» — АР ч.2 л.3 ИР-71535)
  if(/^(?:РП|П|Р|ЭП|м2|м3|м|кг|т|шт\.?|ед\.?\s?кг\.?|ОЦ|по\s?RAL|[сС]м\s?\.?\s?п\s?\.?\s?п\s?\.?\s?\d+(?:[.,]\s?\d+)*|Prisma|Ур\.\s?[зч]\.(?:\s?п\.)?|\d{1,2}\s?[хx×]\s?\d{3,5}|\d{1,2}(?:[.,]\d)?\s?%|[А-ЯЁ]{2,3}-\d{3,6}(?:\.\d{2}-\d{2}\.\d{4}-\d{2})?-[А-ЯЁ]{2,3}.*)$/u.test(str)){items.notes.push({text:str});continue}
  if(/^\d{1,6}(?:\s+\d{1,6})+$/u.test(str)){items.dims.push({text:str,used:null,scheme:k});continue}
  if(WORDS.test(str)){items.notes.push({text:str});continue}
  if(/^[\s\-–—_.,:;()\[\]{}|/\\*!°"«»'`~=+<>]+$/u.test(str))continue;
  // (a number cell of a panel table — area, mass of one, total area, the «Итого» — taken by the АР reader: АР ч.2 л.3
  //  ИР-71535 «258,50», «24 188,27» stood among the unknowns, 101 of them; инженер 16.11.2026)
  if(/^\d{1,3}(?:\s?\d{3})*(?:[.,]\d{1,3})?$/u.test(str)&&page?.ar){const v=Number(str.replace(/\s/gu,"").replace(",","."));if(arNums().has(Math.round(v*100))){items.notes.push({text:str,ar:true});continue}}
  // (two labels in one text «Пс-46.1 Пс-46.1» — two panels side by side, АР ч.2 л.4: read when the АР has each)
  if(page?.ar&&/\s/u.test(str)){const parts=str.split(/\s+/u).map(keyOf);if(parts.length>=2&&parts.every(m=>/^[А-ЯЁ][а-яёА-ЯЁ]{0,2}-\d/u.test(m)&&arText().includes('"'+m+'"'))){items.marks.push({text:str,used:true,scheme:k,joined:true});continue}}
  // (an approximate size «~10000» and the axes of a title written apart from its words «К -03 - В -К» — АР ч.2 л.11
  //  ИР-71535 «Схема раскладки кровельных панелей в осях К-03 - В-К»)
  if(/^[~≈]\s?\d{3,6}$/u.test(str)){items.notes.push({text:str,approx:true});continue}
  // (АР nodes: the layers of a wall «- 120 мм.», references «см. КЖ-28 … 36», «см. КМ 1-7», «см. АС-6, 7», the angles of bends
  //  «95°», the sizes of fixings «~42», «х 20», «t=0,8 мм», «∅4,8», a slope «i=10%» — kept in the node by the details)
  {const D=require("./ai-sheet-details"),q=str.replace(/[\s.,;)\-]+$/u,"");if(D.LAYER.test(str)||D.ANGLE.test(q)||D.SIZE.test(q)||D.REF_TO.test(str)||D.SIZE.test(str)){items.notes.push({text:str,view:true});continue}
   // (pieces of a note broken over lines: «мм.», «4 мм.», «на 100 мм.», «мм.) -»; a size range «180-190», «40-50»; the number
   //  of a standard split off «9467-75,», «10144-89)», «ТУ 5762-005-…»; the unit «п.м.»)
   const rg=/^(\d{1,4})\s?[-–]\s?(\d{1,4})$/u.exec(q);
   if(/^(?:на\s)?(?:\d+(?:[,.]\d+)?\s?)?мм(?:\s?\.)?(?:\s?\))?(?:\s?-)?$/u.test(str.trim())||rg&&Number(rg[2])>Number(rg[1])&&q.length<=9||/^\d{4,5}-\d{2}$/u.test(q)||/^(?:ТУ|ГОСТ|СТО|СП|СН|ОСТ)\s/u.test(str)||/^п\s?\.?\s?м\s?\.?$/u.test(str)){items.notes.push({text:str,piece:true});continue}}
  // (the axes of a node in their circles read as one text «04/2 06/2 06/1 04/1»)
  if(/^(?:[А-ЯЁ\d]{1,3}\/\d{1,2}\s+){1,}[А-ЯЁ\d]{1,3}\/\d{1,2}$/u.test(str)){items.notes.push({text:str,axes:true});continue}
  // (a position of the spec table with a letter «5а» — a row of ar.trims)
  if(/^\d{1,3}[а-я]$/u.test(str)&&(page?.ar?.trims||[]).some(q=>q.pos===str)){items.notes.push({text:str,pos:true});continue}
  if(/^[А-ЯЁ\d\/]{1,4}(?:\s?[-–]\s?[А-ЯЁ\d\/]{1,4}){2,3}(?:\s?;\s?[А-ЯЁ\d\/]{1,4}(?:\s?[-–]\s?[А-ЯЁ\d\/]{1,4}){2,3})*$/u.test(str)){items.notes.push({text:str,axes:true});continue}
  // (a sheet reference written apart from its «см.» — «л . 16», АР ч.2 л.6 under a note at ряд К)
  if(/^л\s?\.\s?\d{1,3}$/u.test(str)){items.notes.push({text:str,ref:true});continue}
  // (a range of a size cut on site «20-40*» — the gap at the wall, АР ч.2 л.12)
  if(/^\d{1,4}\s?[-–]\s?\d{1,4}\*$/u.test(str)){items.notes.push({text:str,range:true});continue}
  // (a chain of equal sizes «3*1000» — three panels of 1000 — under a layout of АР, ч.2 л.5 ИР-71535: tied by the view's own
  //  positions — the run of the chain or one of its steps)
  const chain=/^(\d{1,2})\s?[*×xх]\s?(\d{2,5})$/u.exec(str);
  if(chain){const n=Number(chain[1]),step=Number(chain[2]),w=arViewAt(c),tol=Math.max(10,n*step*.004);const used=w?hasValue(w.u(),n*step,tol)||hasValue(w.z(),n*step,tol)||hasValue(w.u(),step,10)||hasValue(w.z(),step,10):null;
   items.dims.push({text:str,mm:n*step,used,scheme:k,chain:true});if(used===false)missed.push({kind:"dim",text:str,scheme:k,at:at(t),why:"цепочка размеров не привязана к панелям и проёмам вида"});continue}
  // (the name of an axis of an АР view written without its circle found — «2В» of the existing workshop on the facade 3-1, л.5)
  if(page?.ar&&/^[А-ЯЁA-Z\d\/]{1,4}$/u.test(str)&&arText().includes('{"name":"'+str+'"')){items.axes.push({text:str,used:true});continue}
  // (a letter or a position on a leader «а», «б», «в», «р1» that is a row of a table of the sheet — the parts of the column
  //  К1 in «Марка элемента», КМ1 л.26 —: the part of that row)
  if(/^[а-яё]{1,2}\s?\d{0,2}$/u.test(str)&&!tableCell(c)){if(!cellTexts){cellTexts=new Set();for(const o of texts){const q=String(o.str).trim();if(/^[а-яё]{1,2}\s?\d{0,2}$/u.test(q)&&tableCell(textFrame(o).c))cellTexts.add(q.replace(/\s/gu,""))}}
   if(cellTexts.has(str.replace(/\s/gu,""))){items.notes.push({text:str,part:true});continue}}
  // (the forces of a geometric scheme of a truss or a brace «+27,90», «-0,40», «0,00» written on its members)
  if(/^[+\-−]?\d{1,3}[,.]\d{1,2}$/u.test(str)&&k!==null&&/Геометрическ/iu.test(schemes[k]?.title||"")){items.notes.push({text:str,force:true});continue}
  if(/^[+\-−]?\d{1,3}[,.]\d{2}$/u.test(str)&&/Геометрическ/iu.test(sheetTitle())){items.notes.push({text:str,force:true});continue}
  // (the names of standards split off «РК», «СП», «EN»; the axes of a note «О 4/», «О 8/ Б -Л», «08-010/ Б -Ж»)
  if(/^(?:РК|СП|СН|EN|ЕН|ГОСТ|СТ|ТУ|ISO|СНиП)$/u.test(str)||/^[ОO0]?\s?\d{1,3}(?:\s?-\s?[ОO0]?\s?\d{1,3})?\s?\/(?:\s?[А-ЯЁ]\d?(?:\s?[-,]\s?[А-ЯЁ]\d?)*)?\s?\.?$/u.test(str)){items.notes.push({text:str,note:true});continue}
  // (pieces of a chain «3 х» «50=150», a lone «х»; a text of a symbol font — the welds of КМ3 л.47 — in control codes)
  if(/^(?:\d{1,2}\s?)?[хx×]$/u.test(str)||/^\d{1,3}\s?[хx×]$/u.test(str)||/^(\d{2,4})=(\d{3,5})$/u.test(str)&&Number(str.split("=")[1])%Number(str.split("=")[0])===0){items.notes.push({text:str,chain:true});continue}
  if(/[\u0000-\u001f\u01c4-\u01cc\u023c]/u.test(str)){items.notes.push({text:str,symbol:true});continue}
  if(proseLine(t)){items.notes.push({text:str,prose:true});continue}
  if(tableCell(c)){items.notes.push({text:str,cell:true});continue}
  items.unknown.push({text:str,scheme:k,at:at(t)})
 }
 // (a level of a girt elevation of КМ is its bottom, the member's height drawn at its top edge: КМ2 л.14 ИР-71535 «+5,000»
 //  under Рр at 5180, «+2,080» under Рц1 at 2320 — tied when one offset of 60…320 mm holds for two levels of the view or more)
 for(const [k,s] of schemes.entries()){if(s.kind!=="elevation")continue;
  const zs=(s.placements||[]).flatMap(p=>[p.z0_mm,p.z1_mm,p.z_mm]).filter(Number.isFinite);if(!zs.length)continue;
  const ls=items.levels.filter(l=>l.scheme===k&&!l.used&&Number.isFinite(l.mm)),off=new Map(),cnt=new Map();
  for(const l of ls){const d=zs.map(z=>Math.round(z-l.mm)).filter(d=>d>=60&&d<=320).sort((a,b)=>a-b)[0];if(d===undefined)continue;off.set(l,d);cnt.set(d,(cnt.get(d)||0)+1)}
  for(const [l,d] of off){if(cnt.get(d)<2)continue;l.used=true;l.bottom=d;const i=missed.findIndex(m=>m.kind==="level"&&m.scheme===k&&m.text===l.text);if(i>=0)missed.splice(i,1)}}
 // Marks: each label paired with an element of its scheme placed from it (the element keeps the label's point), then
 // by count; a label outside the schemes is read when a view, list or table of the sheet has it.
 const wide=t=>Math.max(30,Number(t.width)||0);
 for(const x of pending){
  // (or a mark on a node or a section of the sheet, taken into that view with its plates, bolts, sizes — the members that
  //  meet in the node, src/ai-sheet-details.js: КМ2 л.12 «Б2, К3, Рс-1, П1» of the section 3-3)
  // (the column under the end of a truss on its geometric scheme «К2», «К4», «Фп1» — the support named, КМ1 л.14)
  if(x.k===null&&/Геометрическ/iu.test(sheetTitle())&&/^(?:К|Фп|Ст|Кф)\d/u.test(x.mk)){items.marks.push({text:x.str,used:true,scheme:null,support:true});continue}
  if(x.k===null){const used=sheetMarks.has(x.mk)||usedMarks.has(x.mk)||inView(x.t,"marks",x.str)||inView(x.t,"marks",x.mk);items.marks.push({text:x.str,used,scheme:null});
   if(!used)missed.push({kind:"mark",text:x.mk,scheme:null,at:at(x.t),axes:"",why:"марка на виде или разрезе вне схем — элемент с листа не взят"});continue}
  const list=pool[x.k].get(x.mk)||[];
  let hit=list.find(e=>!e.taken&&e.p.sheet_point_pt&&near(e.p.sheet_point_pt,x.c)<=wide(x.t));
  if(hit)hit.taken=true;x.hit=Boolean(hit)
 }
 for(const x of pending){
  if(x.k===null||x.hit)continue;
  const list=pool[x.k].get(x.mk)||[],free=list.find(e=>!e.taken);
  if(free){free.taken=true;x.hit=true}
  // A label repeated beside the same element (a plan and its section side by side) is the element already found.
  else if(list.length&&pending.some(o=>o!==x&&o.k===x.k&&o.mk===x.mk&&o.hit))x.hit="repeat";
 }
 for(const x of pending){
  if(x.k===null)continue;
  items.marks.push({text:x.str,used:Boolean(x.hit),scheme:x.k});
  if(!x.hit){let target=x.c;try{const tg=leaderTarget(x.t,segments,index,new Set(),lines());if(tg?.leader)target={x:tg.x,y:tg.y}}catch{}
   missed.push({kind:"mark",text:x.mk,scheme:x.k,at:{x:Math.round(target.x*10)/10,y:Math.round(target.y*10)/10},axes:axesAt(target),
    why:(pool[x.k].get(x.mk)||[]).length?"марка подписана на схеме ещё раз, а элемент найден реже":"марка на схеме, элемент не найден (выноска или линия элемента не прочитаны)"})}
 }
 // The cut of the panels under one slope one straight line (the engineer, 16.11.2026: «Обрезаешь сэндвич не ровно», АР ч.2
 // л.6): of two panels side by side in one tier, one cut along a slope, the tops at their joint at one height and, both cut,
 // at one slope — a step or a kink there is the program's (a ridge or a valley, the slopes the other way, is not).
 for(const v of page?.ar?.views||[]){const ps=(v.panels||[]).filter(p=>Number.isFinite(p.u0)&&Number.isFinite(p.u1)&&Number.isFinite(p.z1));
  for(const a of ps)for(const b of ps){if(a===b||Math.abs(a.u1-b.u0)>10||Math.abs(a.z0-b.z0)>60||!(a.top||b.top))continue;
   const ha=a.top?a.top[1]:a.z1,hb=b.top?b.top[0]:b.z1,sa=a.top?(a.top[1]-a.top[0])/(a.u1-a.u0):0,sb=b.top?(b.top[1]-b.top[0])/(b.u1-b.u0):0;
   if(a.top&&b.top&&sa*sb<0)continue;
   // (a panel of the same position drawn whole beside its cut one — its height the cut one's highest: the end strip of a
   //  gable past its axis, ряд 03 л.5 Пс-62 at −850 and 47850 — is the drawing's)
   const whole=(f,c)=>!f.top&&c.top&&f.mark===c.mark&&Math.abs(f.z1-Math.max(...c.top))<=15;
   if(whole(a,b)||whole(b,a)||a.flatEnd||b.flatEnd)continue;
   const step=Math.abs(ha-hb),kink=a.top&&b.top&&a.u1-a.u0>=500&&b.u1-b.u0>=500&&Math.abs(sa-sb)>.015;
   if(step>15&&step<=700||kink)missed.push({kind:"top",text:a.mark+" / "+b.mark,scheme:null,at:{u:a.u1,z:Math.max(ha,hb)},
    why:(v.title||"вид")+": "+(step>15?"верх по скату ступенькой "+step+" мм у "+a.u1:"уклон верха "+Math.round(sa*1000)/10+" % и "+Math.round(sb*1000)/10+" % у "+a.u1)})}}
 const count=list=>({total:list.length,used:list.filter(i=>i.used===true).length});
 // (every label of the sheet goes to Claude in its whole text — `sheetText`, 13.11.2026: the notes, tables and words not
 // taken by a rule are read there; `read` — labels of the sheet, all)
 // (a label in no scheme, but on a view of the sheet — a node, a section, a sketch —: kept in the details of that view by
 // rules, src/ai-sheet-details.js, 13.11.2026 «чтобы все брал по листам всем»; still told to Claude to place or explain)
 let kept=0;if(page?.details&&!page.details.error){const {viewOfLabel}=require("./ai-sheet-details");for(const m of missed){const v=viewOfLabel(page.details,m.text);if(v){m.kept=v;kept++}}}
 // Slips of the drawing itself — the sheet against itself, not the program against the sheet (АР ч.2 л.5 ИР-71535, инженер
 // 16.11.2026): a row of the panel table whose area is not its length × width, whose total is not area × count, whose mass is
 // not of its area; the «Итого» against the rows; the panels of the layouts against the table, mark by mark.
 const drawing=[];const f2=v=>String(Math.round(v*100)/100).replace(".",",");
 for(const r of page?.ar?.panels||[]){
  if(r.length_slip)drawing.push({text:r.pos,why:"площадь «"+f2(r.length_slip.area_m2)+"» не равна длине "+r.length_mm+" × ширине "+r.width_mm+" = "+f2(r.length_slip.by_length_m2)+" м²"+(r.length_slip.copied_from?" — площадь, масса и общая площадь строки "+r.length_slip.copied_from:"")});
  if(r.area_slip)drawing.push({text:r.pos,why:"площадь «"+f2(r.area_slip.area_m2)+"» не по длине "+r.length_mm+" — по длине и общей площади "+f2(r.area_slip.by_length_m2)+" м²"});
  if(r.total_slip)drawing.push({text:r.pos,why:"общая площадь «"+f2(r.total_m2)+"» не равна площади × кол. = "+f2(r.total_slip.area_x_count_m2)+" м²"});
  if(r.mass_slip)drawing.push({text:r.pos,why:"масса «"+f2(r.mass_kg)+"» кг — "+f2(r.mass_slip.row_kg_m2)+" кг/м² при "+f2(r.mass_slip.kg_m2)+" у панелей этого вида: масса панели "+f2(r.mass_slip.mass_of_m2)+" м²"})}
 // (a table running over two sheets — «Итого» of the whole under its end, the rows of this sheet only — is not checked here)
 // (its start on the same sheet — whole — it is: АР ч.2 л.10)
 for(const t of (page?.ar?.panelTotals||[]).filter(t=>t.whole||!t.panels||!t.rows_panels||t.panels===t.rows_panels)){
  if(t.total_m2&&Math.abs(t.total_m2-t.rows_m2)>.05)drawing.push({text:"Итого "+f2(t.total_m2)+" м²",why:"сумма строк площадь × кол. "+f2(t.rows_m2)+(t.rows_written_m2!==undefined&&Math.abs(t.total_m2-t.rows_written_m2)<=.05?", сумма столбца «общая площадь» как написан — "+f2(t.rows_written_m2)+": «Итого» сложено по нему":"")});
  if(t.panels&&t.rows_panels&&t.panels!==t.rows_panels)drawing.push({text:"Итого "+t.panels+" панелей",why:"по строкам "+t.rows_panels});
  // (the mass: «Итого» of the masses of the rows, or the area of «Итого» × the mass of 1 m² of the note — 22,42 kg, л.10;
  //  not the rounding of the masses of the rows, up to 0,2 % — л.4 12 173,16 at 12 174,88)
  if(t.total_kg&&t.rows_kg&&Math.abs(t.total_kg-t.rows_kg)>Math.max(1,t.total_kg*.002)){const k=t.total_m2?t.total_kg/t.total_m2:0;
   drawing.push({text:"Итого "+f2(t.total_kg)+" кг",why:"сумма строк масса × кол. "+f2(t.rows_kg)+(k&&Math.abs(k*100-Math.round(k*100))<.02?", «Итого» = общая площадь "+f2(t.total_m2)+" × "+f2(k)+" кг/м²":"")})}}
 for(const d of page?.ar?.layoutCheck?.diff||[])drawing.push({text:d.mark,why:"на схемах раскладки листа "+d.layout+", в таблице листа "+d.spec});
 const counts={texts:texts.length,read:texts.length,kept,notes:items.notes.length,marks:count(items.marks),axes:count(items.axes),dims:count(items.dims.filter(d=>d.used!==null)),levels:count(items.levels),
  nodes:items.nodes.length,cuts:items.cuts.length,unknown:items.unknown.length,missed:missed.length,drawing:drawing.length,...(page?.ar?.layoutCheck?{layout:{marks:page.ar.layoutCheck.marks,same:page.ar.layoutCheck.same}}:{})};
 return{counts,missed:missed.slice(0,400),nodes:items.nodes.slice(0,200),unknown:[...new Set(items.unknown.map(u=>u.text))].slice(0,80),...(drawing.length?{drawing}:{}),...(markIndex?{markIndex}:{}),...(process.env.IR_AUDIT_ALL?{unknownAt:items.unknown,missedAll:missed}:{})}
}

// The whole text of a sheet for Claude (the engineer, 13.11.2026: «1 страница без разницы чего АР, КМД, КМ, ТХ — при анализе
// должно читаться все с этого листа, абсолютно все»): every label, none left out, gathered into blocks by place — a note,
// a table, a legend, a label of the plan — each block with its point on the sheet, its rows top down, the cells of a row
// apart « | ». Until 1.12.117 Claude got 300 characters of a sheet with schemes (of ~15 000 on АР ч.1 л.10 of ИР-71535)
// and its picture 1800 px wide — the text of a large sheet unreadable in it.
function sheetText(texts){
 const list=(texts||[]).map(t=>{const str=String(t?.str||"").replace(/\s+/gu," ").trim();if(!str)return null;const f=textFrame(t),h=Math.max(1,Number(t.size)||8);
  const ang=((Number(t.angle)||0)%360+360)%360,vert=Math.abs(ang-90)<20||Math.abs(ang-270)<20;
  // along the text: its own axis; a vertical one is read as turned
  const w=Math.max(h*.5,f.w),half=vert?{x:h*.6,y:w/2}:{x:w/2,y:h*.6};
  return{str,c:f.c,h,vert,x0:f.c.x-half.x,x1:f.c.x+half.x,y0:f.c.y-half.y,y1:f.c.y+half.y}}).filter(Boolean);
 // Blocks: labels whose boxes come within a text height of each other (a cell grid of a table, lines of a note).
 const parent=list.map((_,i)=>i),find=i=>{while(parent[i]!==i)i=parent[i]=parent[parent[i]];return i};
 const cell=60,grid=new Map();list.forEach((t,i)=>{const ex=t.vert?1.2*t.h:10*t.h,ey=t.vert?10*t.h:1.2*t.h;for(let gx=Math.floor((t.x0-ex)/cell);gx<=Math.floor((t.x1+ex)/cell);gx++)for(let gy=Math.floor((t.y0-ey)/cell);gy<=Math.floor((t.y1+ey)/cell);gy++){const k=gx+","+gy;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i)}});
 const seen=new Set();
 for(const ids of grid.values())for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++){const i=ids[a],j=ids[b],key=i<j?i+":"+j:j+":"+i;if(seen.has(key))continue;seen.add(key);
  const p=list[i],q=list[j];if(p.vert!==q.vert)continue;const h=Math.min(p.h,q.h),gap=h*1.2;
  // (cells of one row of a table: on one line up to 10 text heights apart)
  const row=p.vert?Math.abs(p.c.x-q.c.x)<h*.6&&p.y0-10*h<=q.y1&&q.y0-10*h<=p.y1:Math.abs(p.c.y-q.c.y)<h*.6&&p.x0-10*h<=q.x1&&q.x0-10*h<=p.x1;
  if(row||p.x0-gap<=q.x1&&q.x0-gap<=p.x1&&p.y0-gap<=q.y1&&q.y0-gap<=p.y1)parent[find(i)]=find(j)}
 const blocks=new Map();list.forEach((t,i)=>{const r=find(i);if(!blocks.has(r))blocks.set(r,[]);blocks.get(r).push(t)});
 const out=[];
 for(const b of blocks.values()){
  const vert=b[0].vert,across=t=>vert?t.c.x:t.c.y,along=t=>vert?-t.c.y:t.c.x;
  b.sort((p,q)=>across(p)-across(q));const rows=[];
  for(const t of b){const r=rows[rows.length-1];if(r&&Math.abs(across(t)-r.at)<=Math.min(t.h,r.h)*.55){r.items.push(t);r.at=(r.at*(r.items.length-1)+across(t))/r.items.length}else rows.push({at:across(t),h:t.h,items:[t]})}
  const lines=rows.map(r=>{r.items.sort((p,q)=>along(p)-along(q));let s="",end=null;for(const t of r.items){const st=vert?-t.y1:t.x0;if(end!==null)s+=st-end>t.h*1.5?" | ":" ";s+=t.str;end=vert?-t.y0:t.x1}return s});
  const x=Math.min(...b.map(t=>t.x0)),y=Math.min(...b.map(t=>t.y0));
  out.push({x:Math.round(x),y:Math.round(y),n:b.length,text:lines.join(" / ")})
 }
 // top down, left to right by bands of the sheet
 out.sort((p,q)=>Math.floor(p.y/60)-Math.floor(q.y/60)||p.x-q.x);
 return out
}
// The sheet's picture in parts at a readable scale: a sheet larger than A2 (its long side over 2000 pt) in tiles of up to
// 1300 pt with 4 % overlap, each rendered at 1800 px — ~1,4 px a point, a label of 3 pt is 4 px.
function sheetTiles(widthPt,heightPt,side=1300){
 const W=Number(widthPt)||0,H=Number(heightPt)||0;if(Math.max(W,H)<=2000)return[];
 const nx=Math.max(1,Math.ceil(W/side)),ny=Math.max(1,Math.ceil(H/side)),ov=.04,out=[];
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const x=Math.max(0,i/nx-ov/2),y=Math.max(0,j/ny-ov/2),x1=Math.min(1,(i+1)/nx+ov/2),y1=Math.min(1,(j+1)/ny+ov/2);
  out.push({x:+x.toFixed(4),y:+y.toFixed(4),width:+(x1-x).toFixed(4),height:+(y1-y).toFixed(4),label:"часть "+(j*nx+i+1)+" из "+nx*ny+" (ряд "+(j+1)+", колонка "+(i+1)+")"})}
 return out
}

// Set-level check of the node callouts: the sheet of each «1 (М1.11)» is in the set, and a «Узел 1» is read on it.
function auditNodes(pages){
 const sheetKey=s=>keyOf(s).toUpperCase().replace(/[^A-ZА-ЯЁ0-9.]/gu,"");
 const sheets=new Map();
 for(const p of pages||[]){const name=sheetKey(p.sheet?.stamp?.name||"");if(name)sheets.set(name,p);
  const code=String(p.sheet?.stamp?.code||""),n=String(p.sheet?.stamp?.block?.sheet||"");if(code&&n)sheets.set(sheetKey(n),sheets.get(sheetKey(n))||p)}
 const out=[];
 for(const p of pages||[])for(const n of p.audit?.nodes||[]){
  if(n.title)continue;
  const target=sheets.get(sheetKey(n.sheet))||sheets.get(sheetKey(n.sheet).replace(/^[A-ZА-ЯЁ]+[-]?/u,""));
  const titled=target&&(target.audit?.nodes||[]).some(x=>x.title&&keyOf(x.node)===keyOf(n.node));
  const titles=target&&(target.context?.titles||[]).some(x=>new RegExp("^Узел\\s+"+n.node.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"(?![\\dа-я])","u").test(x));
  out.push({page:p.page,node:n.node,sheet:n.sheet,axes:n.axes,state:!target?"no-sheet":titled||titles?"found":"no-title",...(target?{targetPage:target.page}:{})})
 }
 return out
}

// After placement (the plan with Claude's answer): the marks the sheets showed on their schemes that no element of the
// plan carries. These are the misses the engineer is told of.
function planMisses(pages,elements,norm=keyOf){
 const have=new Set((elements||[]).map(e=>norm(e.mark)));
 const out=[];
 for(const p of pages||[])for(const m of p.audit?.missed||[])if(m.kind==="mark"&&!have.has(norm(m.text)))out.push({page:p.page,file:p.sourceName||"",sheet:p.pdfPage||p.page,mark:m.text,axes:m.axes||"",why:m.why});
 return out
}

// The misses of one sheet for Claude: each to be placed (elements) or explained (summary).
function promptLines(page,limit=60){
 const a=page?.audit;if(!a||!a.missed?.length&&!a.unknown?.length&&!a.drawing?.length)return[];
 const name={mark:"марка",axis:"ось",dim:"размер",level:"отметка"};
 const lines=["СВЕРКА ПРОГРАММЫ, лист page="+page.page+": на листе есть, в найденное не попало "+a.missed.length+" — каждое разместить (elements) или объяснить в summary, почему не ставится:"];
 const order={mark:0,level:1,axis:2,dim:3},list=[...a.missed].sort((x,y)=>(order[x.kind]??9)-(order[y.kind]??9));
 for(const m of list.slice(0,limit))lines.push("— "+name[m.kind]+" «"+m.text+"»"+(m.scheme!==null&&m.scheme!==undefined?" (схема index="+m.scheme+")":"")+(m.axes?" у осей "+m.axes:"")+": "+m.why+(m.kept?" (правилами взято в сведения вида «"+m.kept+"»)":""));
 if(a.missed.length>limit)lines.push("… ещё "+(a.missed.length-limit));
 if(a.drawing?.length)lines.push("Расхождения самого чертежа (лист сам с собой; в сводке сказать инженеру, взять как написано): "+a.drawing.map(d=>d.text+" — "+d.why).join("; "));
 if(a.unknown?.length)lines.push("Надписи, которые программа не опознала (проверь, что это): "+a.unknown.slice(0,40).join(" · "));
 const refs=(a.nodes||[]).filter(n=>!n.title);
 if(refs.length)lines.push("Выноски узлов на листе: "+refs.slice(0,40).map(n=>"узел "+n.node+" (лист "+n.sheet+")"+(n.axes?" у осей "+n.axes:"")).join("; "));
 return lines
}

module.exports={auditSheet,auditNodes,planMisses,promptLines,sheetText,sheetTiles,NODE_REF,NODE_TITLE};
