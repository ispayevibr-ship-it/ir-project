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
const {textBox,textFrame,leaderTarget,buildIndex,buildLineIndex,dimensionsOf,markIndexOf,notMark,aMarksOn,findBubble}=require("./ai-scheme-extract");

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
const REF=/^(?:[AА][0-4]|[МM]\d+(?:\.\d+)*|(?:КМД?|КЖ|АР|ТХ)[\s\-]?\d.*|л\.\s?\S+|\d{1,2}\.|\(\S+\))$/u,DATE=/^\d{2}\.\d{2}\.\d{2,4}$/u;
const STEEL=/^(?:Ст\d|С\d{3}|09Г2С|10ХСНД|t\s?\d|[НС]\d{2}-\d{3,4}-)/u;
const keyOf=m=>String(m||"").trim().replace(/\s+/gu,"").replace(/ё/gu,"е");
const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const inBox=(c,b,pad)=>c.x>=b.x0-pad&&c.x<=b.x1+pad&&c.y>=b.y0-pad&&c.y<=b.y1+pad;
const levelMm=s=>{const v=Number(String(s).replace(/\s/gu,"").replace("−","-").replace("±","").replace(",","."));return Number.isFinite(v)?Math.round(v*1000):null};

// Every value in mm a scheme gave (its axes, secondary lines, ends of elements) along X and Y: a size is accounted for
// when it is one of the spans or the distance between any two of them.
function positions(s){
 const cum=a=>a.reduce((acc,v)=>{acc.push(acc[acc.length-1]+Number(v||0));return acc},[0]);
 const xs=new Set([...cum(s.spansX||[]),...(s.secondaryX||[])]),ys=new Set([...cum(s.spansY||[]),...(s.secondaryY||[])]);
 for(const e of s.placements||[]){for(const v of [e.x_mm,e.x2_mm])if(Number.isFinite(v))xs.add(v);for(const v of [e.y_mm,e.y2_mm])if(Number.isFinite(v))ys.add(v);
  for(const v of [e.length_mm,e.diameter_mm,e.width_mm,e.dx_mm,e.dy_mm])if(Number.isFinite(v)&&v>0)xs.add(v),ys.add(v)}
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
 const texts=(geometry?.texts||[]).filter(t=>String(t?.str||"").trim());
 const segments=(geometry?.segments||[]).filter(s=>s&&Number.isFinite(s.a?.x)&&Number.isFinite(s.b?.y)&&near(s.a,s.b)>0.05);
 const schemes=(page?.schemes||[]).filter(s=>!s.error&&s.bbox);
 const aMarks=aMarksOn(texts),markIndex=markIndexOf(texts);
 const index=buildIndex(segments);let lineIndex=null;const lines=()=>lineIndex||(lineIndex=buildLineIndex(segments));
 const schemeOf=c=>schemes.findIndex(s=>inBox(c,s.bbox,40));
 const sheetMarks=new Set([...(page?.sheet?.views||[]).flatMap(v=>v.marks||[]),...(page?.sheet?.required||[]).map(r=>r.mark),...(page?.sheet?.elements||[]).map(r=>r.mark),
  ...(page?.sheet?.spec||[]).map(r=>r.mark)].filter(Boolean).map(keyOf));
 const usedMarks=new Set(schemes.flatMap(s=>(s.placements||[]).map(p=>keyOf(p.mark))));
 for(const k of ["trusses","baseDetails","columnDetails","sections"])for(const m of JSON.stringify(page?.[k]||[]).match(/"mark":"([^"]+)"/gu)||[])usedMarks.add(keyOf(m.slice(8,-1)));
 const bubblesNamed=new Set(schemes.flatMap(s=>[...(s.axesX||[]),...(s.axesY||[])]).map(keyOf));
 const levelsUsed=numbersIn([schemes.map(s=>[s.levelNotes,s.title,(s.placements||[]).map(p=>[p.z0_mm,p.z1_mm,p.z_mm])]),page?.sections,page?.sectionProfiles,
  (page?.sheet?.views||[]).map(v=>[v.z0_mm,v.z1_mm]),page?.trusses,page?.columnDetails,page?.baseDetails,page?.tank,page?.ar]);
 for(const s of schemes)for(const m of String(s.title||"").match(/[+\-−]?\d{1,3}[,.]\d{3}/gu)||[]){const v=levelMm(m);if(v!==null)levelsUsed.add(v)}
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
 const pending=[];
 for(const t of texts){
  const str=String(t.str).trim(),c=textFrame(t).c,k=where(c);
  if(bubbleTexts.has(t)){const used=bubblesNamed.has(keyOf(str));items.axes.push({text:str,used});if(!used&&k!==null)missed.push({kind:"axis",text:str,scheme:k,at:at(t),why:"ось в кружке не вошла в сетку схемы"});continue}
  const node=NODE_REF.exec(str);
  if(node){let target=c;try{const tg=leaderTarget(t,segments,index,new Set(),lines());if(tg?.leader)target={x:tg.x,y:tg.y}}catch{}
   items.nodes.push({text:str,node:node[1],sheet:node[2].replace(/\s/gu,""),scheme:k,axes:axesAt(target),at:{x:Math.round(target.x*10)/10,y:Math.round(target.y*10)/10}});continue}
  const title=NODE_TITLE.exec(str);if(title){items.nodes.push({text:str,node:title[1],title:true,scheme:k});continue}
  if(CUT.test(str)||/^(?:[А-ЯЁ]|\d{1,2})$/u.test(str)&&k===null){items.cuts.push({text:str,scheme:k});continue}
  if(ALONG.test(str)){items.along.push({text:str,scheme:k});continue}
  const lv=LEVEL.exec(str);
  if(lv&&(/отм|верх|низ|^[+\-−±]/iu.test(str)||str===lv[1])){
   const v=levelMm(lv[1]),used=v!==null&&hasValue([...levelsUsed],v,1);
   items.levels.push({text:str,mm:v,used,scheme:k});
   if(!used)missed.push({kind:"level",text:str,scheme:k,at:at(t),why:k!==null?"отметка не попала в высоты элементов схемы":"отметка на виде или разрезе вне схем — ни к чему не отнесена"});continue
  }
  const mk=keyOf(str);
  // (a colour «RAL5012» and a position of a table «Поз.23» are no marks of elements: on the АР of ИР-71535 they were 77 of
  // 82 «misses» — the colours of the panels the АР reader takes from its own tables)
  if(/^(?:RAL|РАЛ)\d{4}$/iu.test(mk)||/^Поз\.?\d/u.test(mk))continue;
  if(MARK.test(str)&&!notMark(mk,aMarks)&&!/^\d/u.test(mk)&&!/^[AА][0-4]$/u.test(mk)&&!/^С(?:235|245|255|275|285|345|355|375|390|440|590)$/u.test(mk)){pending.push({t,str,mk,c,k});continue}
  if(DIM.test(str)){
   const v=Number(str.replace(/[^\d]/gu,"")),d=dimOf.get(t);
   if(!d||k===null||v<10){items.dims.push({text:str,used:null,scheme:k});continue}
   const p=pos[k],tol=Math.max(10,v*0.004),used=hasValue(p.all,v,tol)||hasValue(d.flat?p.x:p.y,v,tol);
   items.dims.push({text:str,mm:v,used,scheme:k});
   if(!used)missed.push({kind:"dim",text:str,scheme:k,at:at(t),why:"размер не привязан: нет такого расстояния между осями, линиями и элементами схемы"});continue
  }
  if(PROFILE.test(str)||STEEL.test(str)){items.profiles.push({text:str,scheme:k});continue}
  if(REF.test(str)||DATE.test(str)){items.notes.push({text:str});continue}
  if(/^\d{1,6}(?:\s+\d{1,6})+$/u.test(str)){items.dims.push({text:str,used:null,scheme:k});continue}
  if(WORDS.test(str)){items.notes.push({text:str});continue}
  if(/^[\s\-–—_.,:;()\[\]{}|/\\*!°"«»'`~=+<>]+$/u.test(str))continue;
  items.unknown.push({text:str,scheme:k,at:at(t)})
 }
 // Marks: each label paired with an element of its scheme placed from it (the element keeps the label's point), then
 // by count; a label outside the schemes is read when a view, list or table of the sheet has it.
 const wide=t=>Math.max(30,Number(t.width)||0);
 for(const x of pending){
  if(x.k===null){const used=sheetMarks.has(x.mk)||usedMarks.has(x.mk);items.marks.push({text:x.str,used,scheme:null});
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
 const count=list=>({total:list.length,used:list.filter(i=>i.used===true).length});
 const counts={texts:texts.length,marks:count(items.marks),axes:count(items.axes),dims:count(items.dims.filter(d=>d.used!==null)),levels:count(items.levels),
  nodes:items.nodes.length,cuts:items.cuts.length,unknown:items.unknown.length,missed:missed.length};
 return{counts,missed:missed.slice(0,400),nodes:items.nodes.slice(0,200),unknown:[...new Set(items.unknown.map(u=>u.text))].slice(0,80),...(markIndex?{markIndex}:{})}
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
 const a=page?.audit;if(!a||!a.missed?.length&&!a.unknown?.length)return[];
 const name={mark:"марка",axis:"ось",dim:"размер",level:"отметка"};
 const lines=["СВЕРКА ПРОГРАММЫ, лист page="+page.page+": на листе есть, в найденное не попало "+a.missed.length+" — каждое разместить (elements) или объяснить в summary, почему не ставится:"];
 const order={mark:0,level:1,axis:2,dim:3},list=[...a.missed].sort((x,y)=>(order[x.kind]??9)-(order[y.kind]??9));
 for(const m of list.slice(0,limit))lines.push("— "+name[m.kind]+" «"+m.text+"»"+(m.scheme!==null&&m.scheme!==undefined?" (схема index="+m.scheme+")":"")+(m.axes?" у осей "+m.axes:"")+": "+m.why);
 if(a.missed.length>limit)lines.push("… ещё "+(a.missed.length-limit));
 if(a.unknown?.length)lines.push("Надписи, которые программа не опознала (проверь, что это): "+a.unknown.slice(0,40).join(" · "));
 const refs=(a.nodes||[]).filter(n=>!n.title);
 if(refs.length)lines.push("Выноски узлов на листе: "+refs.slice(0,40).map(n=>"узел "+n.node+" (лист "+n.sheet+")"+(n.axes?" у осей "+n.axes:"")).join("; "));
 return lines
}

module.exports={auditSheet,auditNodes,planMisses,promptLines,NODE_REF,NODE_TITLE};
