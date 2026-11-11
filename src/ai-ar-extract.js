"use strict";
/*
 * IR Project: АР read from its sheets without AI (the engineer, 25.10.2026: «Ар чертеж вообще ничего не
 * раставляется»; «сэндвич панель (если есть цвет, то и цвет тоже), окна, все 100% должен показывать»).
 * - specifications of sandwich panels («Спецификация наружных сэндвич-панелей (RAL 7047)»): a position «ПН-1», its
 *   size from the name «ПС 8260.1190.150» (length.width.thickness), the colours from the code
 *   «…(ПЭ-RAL2008-0.5/ПЭ-RAL9003-0.5)» (outside/inside) or from the title of its table, the count;
 * - specifications of windows, doors and gates: «ОСвп-П-1160х3530» and «ДБН 2080х1280» (height×width of the
 *   block), «ВМ П Р С Г К 3600-4000» (height-width), «О-П (6000 х 3600)» (width×height);
 * - schemes of panels on the facades: a view is the field above its row of axis bubbles; every label «ПН-30» is one
 *   panel in the rectangle of its joints (the hatching inside a panel is not a joint), from the line under it to the
 *   line over it (dimension lines are not), heights by the level marks of the view, along the wall by the bubbles.
 */
const {bubbleRows,levelOf,levelOffset,fit}=require("./ai-section-extract");
const {textBox}=require("./ai-scheme-extract");

const POS=/^([А-ЯЁ]{1,3})-(\d{1,3}[а-я]?)$/u;
const PANEL_NAME=/П[СCК]\s*(\d{3,5})[.,](\d{3,4})[.,](\d{2,3})/u;
// RAL codes in a text: RAL Classic «RAL 7047», «ПЭ-RAL7047-0.5» (the coating's thickness after it) — "7047"; RAL Design
// System+ «RAL 210 50 15», «RAL 210-50-15» — "210 50 15" (hue, lightness, chroma); RAL Effect «RAL 110-M» — "110-M".
const RAL=/RAL\s*(?:D\d\s+)?(\d{3})(?:[\s-](\d{2})[\s-](\d{2})(?!\d)|-([1-6M])(?![\dA-Za-zА-Яа-я])|(\d)(?!\d))/giu;
const ralCodes=str=>[...String(str||"").matchAll(RAL)].map(m=>m[2]?m[1]+" "+m[2]+" "+m[3]:m[4]?m[1]+"-"+m[4].toUpperCase():m[1]+m[5]);
const horizontalText=t=>Math.abs(t.angle||0)<10;

// One row of a table: the texts on the line of its position, to the right of it.
const rowOf=(texts,p,span)=>texts.filter(o=>o!==p&&Math.abs(o.y-p.y)<3&&o.x>p.x&&o.x<p.x+span);
// The nearest title above a position of its table.
const titleOf=(titles,p)=>titles.filter(t=>t.y<p.y&&Math.abs(t.x-p.x)<420).sort((a,b)=>b.y-a.y)[0]||null;

function panelSpec(texts){
 const titles=texts.filter(t=>/Спецификация.*панел/iu.test(String(t.str)));
 const out=[];
 for(const p of texts){
  const m=POS.exec(String(p.str).trim());if(!m||!horizontalText(p))continue;
  const row=rowOf(texts,p,620),nameT=row.find(o=>PANEL_NAME.test(String(o.str)));if(!nameT)continue;
  const n=PANEL_NAME.exec(String(nameT.str)),title=titleOf(titles,p);
  const count=row.filter(o=>o.x>nameT.x+20&&/^\d{1,4}$/.test(String(o.str).trim())).sort((a,b)=>a.x-b.x)[0];
  // The code is written over the row (the cell holds two lines): «ТСП-Z-150-1190-Н-П-МВ (ПЭ-RAL2008-0.5/…)».
  const code=texts.filter(o=>o.y<=p.y+1&&o.y>p.y-14&&o.x>=p.x-5&&o.x<nameT.x&&/RAL\s*\d{3}|ТСП|^\S*-\d{2,3}-\d{3,4}-/iu.test(String(o.str))).sort((a,b)=>b.y-a.y)[0];
  const rals=code?ralCodes(code.str):[],own=title?ralCodes(title.str):[];
  out.push({at:p,pos:m[1]+"-"+m[2],kind:m[1],length_mm:Number(n[1]),width_mm:Number(n[2]),thickness_mm:Number(n[3]),
   ral:rals[0]||own[0]||"",...(rals[1]?{ral_inside:rals[1]}:{}),count:count?Number(count.str):null,
   name:String(nameT.str).replace(/[-\s]+$/u,"").trim(),...(code?{code:String(code.str).trim()}:{}),table:title?String(title.str).trim():""})
 }
 return out
}
// Tables of a layout of panels by columns (ГПЭС 40 МВт «Раскладка сэндвич-панелей», ООО «Металл Престиж», 09.11.2026:
// «где мои сэндвич-панели?»): «Поз.» — a letter and the length in centimetres, no hyphen («Р380», «С704»: 3800, 7040);
// «Обозначение» «МП-СМ 150х1190 К/К (ПЭ-0,5/ПЭ-0,5)» — thickness × width; then «Тип», RAL outside, RAL inside, length,
// width, thickness, count, area — each in its own column. The lettering of such a sheet is in curves and comes from OCR:
// a letter of a position is lost («578»), a width «1190» read «119», a thickness «150» read «50», RAL «7004» read «04».
// A row is told by its length: the number of its position × 10 in that row. A position without its letter takes it from
// the rows of the same table with the same RAL outside; the label on the facade decides as well (panelViews).
const LAYOUT_POS=/^([А-ЯЁ]{1,2})?(\d{2,3})$/u;
const latin=s=>String(s).trim().replace(/C/g,"С").replace(/P/g,"Р").replace(/H/g,"Н").replace(/K/g,"К");
const WIDTHS=[1000,1150,1160,1190,1200],THICK=[40,50,60,80,100,120,150,170,200,250];
function layoutSpec(texts){
 const rows=[];
 for(const p of texts){
  if(!horizontalText(p))continue;
  const m=LAYOUT_POS.exec(latin(p.str));if(!m)continue;
  const digits=m[2],L=Number(digits)*10,row=rowOf(texts,p,620),nums=row.map(o=>({o,s:String(o.str).trim()}));
  const len=nums.find(n=>Number(n.s)===L);if(!len||row.length<4)continue;
  const after=nums.filter(n=>n.o.x>len.o.x).sort((a,b)=>a.o.x-b.o.x),before=nums.filter(n=>n.o.x<len.o.x).sort((a,b)=>a.o.x-b.o.x);
  const name=nums.find(n=>/(\d{2,3})\s*[хx×]\s*(\d{3,4})/u.test(n.s)),nm=name&&/(\d{2,3})\s*[хx×]\s*(\d{3,4})/u.exec(name.s);
  let width=0,thick=0,count=null;
  for(const n of after){
   const v=Number(n.s);if(!/^\d{2,4}$/.test(n.s)){if(/^\d+[.,]\d+$/.test(n.s))break;continue}
   if(!width&&(WIDTHS.includes(v)||WIDTHS.includes(v*10))){width=WIDTHS.includes(v)?v:v*10;continue}
   if(width&&!thick&&THICK.includes(v)){thick=v;continue}
   if(width&&thick&&count===null&&v>0&&v<1000){count=v;break}
  }
  // (the count stands just before the area, a number with a point)
  if(count===null){const i=after.findIndex(n=>/^\d+[.,]\d+$/.test(n.s)),c=i>0?after[i-1]:null;if(c&&/^\d{1,3}$/.test(c.s)&&c.o.x>len.o.x+60)count=Number(c.s)}
  if(nm){thick=Number(nm[1]);width=width||Number(nm[2])}
  const ral=before.filter(n=>/^\d{4}$/.test(n.s)).map(n=>n.s),short=before.filter(n=>/^\d{2}$/.test(n.s)).map(n=>n.s);
  rows.push({at:p,letter:m[1]||"",digits,length_mm:L,width_mm:width,thickness_mm:thick,count,ral:ral.length>=2?ral[0]:"",ral_inside:ral[ral.length-1]||"",
   short:ral.length>=2?"":short[0]||"",x:p.x,lenX:len.o.x,name:name?String(name.o.str).trim():""})
 }
 // A row whose position the OCR lost («337», «Ø0380»): told by its length in the column of the lengths of its table.
 for(const col of [...new Set(rows.map(r=>Math.round(r.lenX)))]){
  const at=rows.find(r=>Math.round(r.lenX)===col);
  for(const t of texts){
   const v=String(t.str).trim();if(!horizontalText(t)||Math.abs(t.x-col)>6||!/^\d{3,5}$/.test(v)||Number(v)%10||Number(v)<300)continue;
   if(rows.some(r=>Math.abs(r.at.y-t.y)<3&&Math.abs(r.x-at.x)<8))continue;
   const line=texts.filter(o=>o!==t&&Math.abs(o.y-t.y)<3&&o.x>at.x-10&&o.x<at.x+620);if(line.length<4)continue;
   const pos=line.filter(o=>o.x<at.x+40).sort((a,b)=>a.x-b.x)[0]||{x:at.x,y:t.y,str:""};
   const ral=line.filter(o=>o.x<t.x&&/^\d{4}$/.test(String(o.str).trim())).sort((a,b)=>a.x-b.x).map(o=>String(o.str).trim());
   const short=line.filter(o=>o.x<t.x&&o.x>at.x+150&&/^\d{2}$/.test(String(o.str).trim())).map(o=>String(o.str).trim());
   const after=line.filter(o=>o.x>t.x).sort((a,b)=>a.x-b.x).map(o=>String(o.str).trim());
   const w=after.map(Number).find(x=>WIDTHS.includes(x)||WIDTHS.includes(x*10)),th=after.map(Number).find(x=>THICK.includes(x));
   rows.push({at:{...pos,y:t.y,x:at.x},letter:"",digits:String(Number(v)/10),length_mm:Number(v),width_mm:w?(WIDTHS.includes(w)?w:w*10):0,thickness_mm:th||0,count:null,
    ral:ral.length>=2?ral[0]:"",ral_inside:ral[ral.length-1]||"",short:ral.length>=2?"":short[0]||"",x:at.x,lenX:t.x,name:"",lost:true})
  }
 }
 // (the letter and RAL of a row read short: from the rows of the same table column with the same RAL)
 const sameTable=(a,b)=>Math.abs(a.x-b.x)<8;
 for(const r of rows){
  // («04» is 7004 and 2004 alike: the RAL of the nearest such row of the table — its rows go by colour)
  if(!r.ral&&r.short)r.ral=(rows.filter(o=>o!==r&&sameTable(o,r)&&o.ral.endsWith(r.short)&&(!r.letter||o.letter===r.letter)).sort((a,b)=>Math.abs(a.at.y-r.at.y)-Math.abs(b.at.y-r.at.y))[0]||{}).ral||"";
  if(!r.letter){const votes=new Map();for(const o of rows)if(o!==r&&o.letter&&!o.lost&&sameTable(o,r)&&o.ral&&o.ral===r.ral)votes.set(o.letter,(votes.get(o.letter)||0)+1);
   r.letter=[...votes].sort((a,b)=>b[1]-a[1])[0]?.[0]||""}
 }
 // (a RAL of a table none of whose rows kept its letter, while the table has one letter not of another RAL: that one —
 // ГПЭС лист 1: «Р…» are 2004, every row of 7004 read without its «С»)
 for(const r of rows.filter(q=>!q.letter&&q.ral)){
  const kin=rows.filter(o=>sameTable(o,r)),other=new Set(kin.filter(o=>o.letter&&o.ral&&o.ral!==r.ral).map(o=>o.letter));
  const free=[...new Set(kin.map(o=>o.letter).filter(Boolean))].filter(l=>!other.has(l));if(free.length===1)r.letter=free[0]
 }
 // A table whose every row of one RAL lost its letter (ГПЭС лист 2: «825», «434», «251»): the letter of the labels of the
 // facades with that number, other than the letter a row of another RAL with that number already has.
 const onFacade=new Map(),letterCount=new Map();for(const t of texts){const m=/^([А-ЯЁ])(\d{2,3})$/u.exec(latin(t.str));if(!m||horizontalText(t)&&rowOf(texts,t,620).length>=4)continue;if(!onFacade.has(m[2]))onFacade.set(m[2],new Set());onFacade.get(m[2]).add(m[1]);letterCount.set(m[1],(letterCount.get(m[1])||0)+1)}
 for(const r of rows.filter(q=>!q.letter)){
  const taken=new Set(rows.filter(o=>o.letter&&o.digits===r.digits&&o.ral!==r.ral).map(o=>o.letter));
  const known=new Set([...rows.map(o=>o.letter).filter(Boolean),...[...letterCount].filter(x=>x[1]>=5).map(x=>x[0])]),free=[...(onFacade.get(r.digits)||[])].filter(l=>known.has(l)&&!taken.has(l));if(free.length===1)r.letter=free[0]
 }
 for(const r of rows.filter(q=>q.lost)){const kin=rows.filter(o=>!o.lost&&sameTable(o,r)&&o.letter===r.letter);if(!kin.length)continue;r.width_mm=r.width_mm||kin[0].width_mm;r.thickness_mm=r.thickness_mm||kin[0].thickness_mm;r.name=kin[0].name}
 // (a width or thickness not read: the one of the rows of its table — «90» for «1190», a name on the line above)
 const modeOf=(list,k)=>{const c=new Map();for(const o of list)if(o[k])c.set(o[k],(c.get(o[k])||0)+1);return[...c].sort((a,b)=>b[1]-a[1])[0]?.[0]||0};
 for(const r of rows){const kin=rows.filter(o=>sameTable(o,r));if(!r.width_mm)r.width_mm=modeOf(kin,"width_mm")||modeOf(rows,"width_mm");if(!r.thickness_mm)r.thickness_mm=modeOf(kin,"thickness_mm")||modeOf(rows,"thickness_mm")}
 // (a thickness read without its leading «1» — «50» in a table whose other rows read «150»)
 for(const r of rows){if(rows.some(o=>sameTable(o,r)&&o.thickness_mm===r.thickness_mm+100))r.thickness_mm+=100}
 return rows.filter(r=>r.letter).map(r=>({at:r.at,pos:r.letter+r.digits,kind:r.letter,length_mm:r.length_mm,width_mm:r.width_mm,thickness_mm:r.thickness_mm,
  ral:r.ral||"",...(r.ral_inside&&r.ral_inside!==r.ral?{ral_inside:r.ral_inside}:{}),count:r.count,name:r.name,table:"",layout:true}))
}
// Tables of panels with a sketch of each (ИР-71535 АР ч.2, ТОО «ПСК Инженерные решения»; the engineer, 10.11.2026:
// «сэндвич-панели так и не раставляет, вообще»): «Марка поз.» — «Пс-1», «Пс-7.1», «Пк-12» (a capital and small letters);
// «Обозначение» «МП-ТСП-Z-120-1000-Т-Т-МВ (ПРМ-01-5012-0,5/ ПРМ-01-5012-0,5)» — the thickness 120 and the width 1000, the
// colours outside/inside; «-//-» in a row — as the row above. The «Эскиз» gives the length: the largest number written
// along the panel without «*» (the width is written across it, sizes with «*» are the cuts). «Площадь, м2», «Кол-во,
// шт.», «Цвет по RAL (наружный)» and «(внутренний)» in their columns. A table «…кровельных сэндвич-панелей» is of the roof.
const SKETCH_POS=/^(П[А-ЯЁа-яё]{0,2})-(\d{1,3}(?:\.\d{1,2})?)$/u;
const sketchDesignation=str=>{const s=String(str||"").replace(/\s+/g,""),m=/ТСП-[A-ZА-ЯЁ]-(\d{2,3})-(\d{3,4})/u.exec(s);
 if(!m)return null;const c=[...s.matchAll(/(?:ПРМ|ПЭ|ПВДФ|PE|PVDF)?-\d{2}-(\d{4})-0[.,]\d/gu)].map(x=>x[1]);
 return{thickness_mm:Number(m[1]),width_mm:Number(m[2]),name:s.replace(/\(.*$/u,""),rals:c}};
function sketchSpec(texts){
 const out=[];
 for(const head of texts.filter(t=>horizontalText(t)&&/^Эскиз$/u.test(String(t.str).trim()))){
  const hdr=texts.filter(t=>horizontalText(t)&&Math.abs(t.y-head.y)<20&&Math.abs(t.x-head.x)<900);
  const markH=hdr.filter(t=>/^Марка/u.test(String(t.str))&&t.x<head.x).sort((a,b)=>b.x-a.x)[0];
  const areaH=hdr.filter(t=>/^Площадь/u.test(String(t.str))&&t.x>head.x).sort((a,b)=>a.x-b.x)[0];
  const countH=hdr.filter(t=>/^Кол/u.test(String(t.str))&&t.x>head.x).sort((a,b)=>a.x-b.x)[0];
  const colours=hdr.filter(t=>/^Цвет/u.test(String(t.str))&&t.x>head.x).sort((a,b)=>a.x-b.x).slice(0,2);
  if(!markH||!areaH)continue;
  const title=texts.filter(t=>/Спецификация.*панел/iu.test(String(t.str))&&t.y<head.y&&head.y-t.y<90&&Math.abs(t.x-head.x)<700).sort((a,b)=>b.y-a.y)[0];
  const roof=/кровельн/iu.test(String(title?.str||""));
  const marks=texts.filter(t=>horizontalText(t)&&t.y>head.y&&Math.abs(t.x-markH.x)<30&&SKETCH_POS.test(String(t.str).trim())).sort((a,b)=>a.y-b.y);
  const lo=markH.x+(head.x-markH.x)*.45,hi=areaH.x-150;
  let prev=null;
  marks.forEach((m,i)=>{
   const y0=i?(marks[i-1].y+m.y)/2:Math.max(head.y+15,m.y-(marks[1]?(marks[1].y-m.y)/2:40)),y1=marks[i+1]?(m.y+marks[i+1].y)/2:m.y+(m.y-y0);
   const band=texts.filter(o=>o!==m&&o.y>=y0&&o.y<y1&&o.x>markH.x+20&&o.x<areaH.x+700),line=band.filter(o=>Math.abs(o.y-m.y)<4);
   const at=(x,re,tol)=>line.filter(o=>re.test(String(o.str).trim())&&Math.abs(o.x-x)<tol).sort((a,b)=>Math.abs(a.x-x)-Math.abs(b.x-x))[0];
   const area=at(areaH.x,/^\d+[.,]\d+$/,40),count=countH?at(countH.x,/^\d{1,4}$/,30):null;
   const des=band.filter(o=>o.x<areaH.x&&sketchDesignation(o.str)).sort((a,b)=>Math.abs(a.x-markH.x)-Math.abs(b.x-markH.x))[0],d=des?sketchDesignation(des.str):prev?.d||null;
   const ral=colours.map(c=>{const own=band.filter(o=>Math.abs(o.x-c.x)<30).flatMap(o=>ralCodes(o.str));return own[0]||""});
   const rals=[ral[0]||(d&&des?d.rals[0]:"")||prev?.ral[0]||"",ral[1]||(d&&des?d.rals[1]:"")||prev?.ral[1]||""];
   const lens=band.filter(o=>horizontalText(o)&&o.x>lo&&o.x<hi&&/^\d{3,5}$/.test(String(o.str).trim())).map(o=>Number(o.str)).filter(v=>v>=300&&v<=20000);
   const width=d?.width_mm||1000,sq=area?Number(String(area.str).replace(",",".")):0;
   const length=lens.length?Math.max(...lens):sq?Math.round(sq*1e6/width/10)*10:0;
   prev={d,ral:rals};
   if(!length)return;
   const mm=SKETCH_POS.exec(String(m.str).trim());
   out.push({at:m,pos:String(m.str).trim(),kind:mm[1].toUpperCase(),length_mm:length,width_mm:width,thickness_mm:d?.thickness_mm||0,ral:rals[0]||rals[1]||"",
    ...(rals[1]&&rals[1]!==rals[0]?{ral_inside:rals[1]}:{}),count:count?Number(count.str):null,name:d?.name||"",table:String(title?.str||"").trim(),
    ...(sq?{area_m2:sq}:{}),sketch:true,...(roof?{roof:true}:{})})
  })
 }
 return out
}
// A label of a panel on a facade of such a sheet: a position of its table, read by OCR («С704» upright or turned; «Ø380»,
// «0372», «6372» — the letter misread). A number that two positions share («С380», «Р380») is settled by the labels read
// whole in the same band of the view.
function layoutLabel(str,byPos,byDigits,turned=true){
 const s=latin(str);if(byPos.has(s))return[s];
 // (a bare number or one with a misread first sign only as a turned label: upright ones are dimensions — «2380»)
 if(!turned)return null;
 const m=/^\D?(\d{2,3})$/u.exec(s)||/^[^\d]?[0-9]?(\d{3})$/u.exec(s);if(!m)return null;
 return byDigits.get(m[1])||null
}

// «ОСвп-П-1160х3530» and «ДБН 2080х1280»: height×width; «О-П (6000 х 3600)»: width×height as drawn; gates
// «ВМ П Р С Г К 3600-4000»: height-width. A table of openings headed «Размер проема, мм. (b x h)» («ш х в», «ширина х
// высота») and a size marked «3000 х 2800( h )» — width×height (ИР-71535 АР ч.1 л.12: «В-1 10740 х 10930» is a gate
// 10740 wide; read as height×width it was found nowhere on the facades). The row is read from its label on: the
// nearest size is its own (a table beside it on the same line is another one).
const WIDTH_FIRST=/\(?\s*(?:b\s*[хx×]\s*h|ш\s*[хx×]\s*в|ширина\s*[хx×]\s*высота)\s*\)?/iu;
function fillSpec(texts){
 const out=[];
 const heads=texts.filter(t=>horizontalText(t)&&WIDTH_FIRST.test(String(t.str)));
 const widthFirst=o=>heads.some(t=>t.y<o.y&&o.y-t.y<1500&&o.x<t.x+(t.width||0)+40&&o.x+(o.width||0)>t.x-40&&
  !texts.some(q=>q!==t&&q.y>t.y+4&&q.y<o.y-4&&Math.abs(q.x-t.x)<40&&/Марка|Наименование|Обозначение/u.test(String(q.str))));
 for(const p of texts){
  const str=String(p.str).trim(),m=/^(ОК|Д|В|ВР|ДВ)-(\d{1,3}[а-я]?)$/u.exec(str);if(!m||!horizontalText(p))continue;
  const kind=m[1]==="ОК"?"window":m[1]==="Д"||m[1]==="ДВ"?"door":"gate";
  const row=rowOf(texts,p,480).sort((a,b)=>a.x-b.x);let w=0,h=0,name="";
  for(const o of row){
   const s=String(o.str),br=/\(\s*(\d{3,5})\s*[хx×]\s*(\d{3,5})\s*\)/u.exec(s),hw=/(\d{3,5})\s*[хx×]\s*(\d{3,5})/u.exec(s),gate=/^В[МР]\s.*?(\d{3,5})\s*-\s*(\d{3,5})$/u.exec(s);
   if(br){w=Number(br[1]);h=Number(br[2]);name=s.trim();break}
   if(gate){h=Number(gate[1]);w=Number(gate[2]);name=s.trim();break}
   if(hw&&!/ГОСТ/u.test(s)){
    const wh=/\d\s*\(\s*h\s*\)/iu.test(s)||widthFirst(o);
    if(wh){w=Number(hw[1]);h=Number(hw[2])}else{h=Number(hw[1]);w=Number(hw[2])}
    name=s.trim();break}
  }
  if(!w||!h)continue;
  const count=row.filter(o=>/^\d{1,3}$/.test(String(o.str).trim())).sort((a,b)=>a.x-b.x).find(o=>o.x>p.x+200);
  out.push({pos:str,kind,width_mm:w,height_mm:h,name,count:count?Number(count.str):null})
 }
 return out
}

// Positions of lines across a label; a run of four and more at one spacing is hatching, not a joint.
function uniq(list){const out=[];for(const v of list.sort((a,b)=>a-b))if(!out.length||v-out[out.length-1]>.2)out.push(v);return out}
function hatching(xs){
 const hatch=new Set();
 for(let i=0;i+3<xs.length;){
  let j=i+1;const g=xs[i+1]-xs[i];
  if(g<1.8||g>9){i++;continue}
  while(j+1<xs.length&&Math.abs(xs[j+1]-xs[j]-g)<=.4)j++;
  if(j-i>=3){for(let k=i;k<=j;k++)hatch.add(xs[k]);i=j}else i++
 }
 return hatch
}
// A dimension line has its number written on it.
function dimensionLine(h,numbers){
 return numbers.some(t=>{const b=textBox(t);return b.angle===0&&b.y1<=h.y+.5&&b.y1>=h.y-8&&b.cx>=h.x0&&b.cx<=h.x1})
}
// A panel drawn as its own rectangle: the edges under and over its label start and end together.
// A panel under a slope of a lower roof is cut along it: its lower edge slopes (its height at its middle).
function edgesAround(b,horiz,scale,slopes=[],sized=null){
 const min=250/scale,max=14000/scale,fits=h=>h.x0<=b.x0+1&&h.x1>=b.x1-1&&h.x1-h.x0>=min&&h.x1-h.x0<=max;
 const at=h=>h.ya===undefined?h:{...h,y:h.ya+(h.yb-h.ya)*((h.x0+h.x1)/2-h.x0)/(h.x1-h.x0),slope:true};
 const below=[...horiz,...slopes].map(at).filter(h=>h.y>b.y1-.3&&h.y-b.y1<max&&fits(h)).sort((p,q)=>p.y-q.y).slice(0,8);
 const above=horiz.filter(h=>h.y<b.y0+.3&&b.y0-h.y<max&&fits(h)).sort((p,q)=>q.y-p.y).slice(0,8);
 const all=[];
 for(const lo of below)for(const hi of above){
  if(Math.abs(lo.x0-hi.x0)>.6||Math.abs(lo.x1-hi.x1)>.6||lo.y-hi.y<min)continue;
  all.push({l:(lo.x0+hi.x0)/2,r:(lo.x1+hi.x1)/2,top:hi.y,bottom:lo.y,...(lo.slope?{cut:{l:lo.ya,r:lo.yb}}:{})})
 }
 // The smallest rectangle round the label, the one of the size of its specification first.
 all.sort((p,q)=>p.bottom-p.top-(q.bottom-q.top));
 return(sized&&all.find(sized))||all[0]||null
}
// A panel whose top edge is its own and its lower edge is broken (at a corner of an opening, along a slope): the
// sides that go down from the ends of the top edge end at its bottom. Cut along a slope only where both ends lie on a
// sloping line; sides of different length otherwise are the corner of a door or a window in the panel (its hole is
// cut by the block placed there), the panel goes down by its longer side.
function sidesAround(b,horiz,vert,scale,sized=null,slopes=[]){
 const min=250/scale,max=14000/scale;
 const onSlope=(x,y)=>slopes.some(s=>x>=s.x0-1&&x<=s.x1+1&&Math.abs(s.ya+(s.yb-s.ya)*(x-s.x0)/(s.x1-s.x0)-y)<=.8);
 const above=horiz.filter(h=>h.y<b.y0+.3&&b.y0-h.y<max&&h.x0<=b.x0+1&&h.x1>=b.x1-1&&h.x1-h.x0>=min&&h.x1-h.x0<=max).sort((p,q)=>q.y-p.y).slice(0,4);
 for(const hi of above){
  const side=x=>vert.filter(v=>Math.abs(v.x-x)<=.5&&Math.abs(v.y0-hi.y)<=.6&&v.y1>b.y1+.3).sort((p,q)=>q.y1-p.y1)[0];
  const sl=side(hi.x0),sr=side(hi.x1);if(!sl||!sr)continue;
  const flat=Math.abs(sl.y1-sr.y1)<=.6,sloped=!flat&&onSlope(hi.x0,sl.y1)&&onSlope(hi.x1,sr.y1);
  const rect={l:hi.x0,r:hi.x1,top:hi.y,bottom:flat||sloped?(sl.y1+sr.y1)/2:Math.max(sl.y1,sr.y1),...(sloped?{cut:{l:sl.y1,r:sr.y1}}:{})};
  if(!sized||sized(rect))return rect
 }
 return null
}
// A panel whose outline the drawing breaks — a gate or a grille cut in it, a grille drawn over its joint (ГПЭС, АР-1
// лист 9: «ПН-27» inside the grille 1000×1400 over a gate): the rectangle of the size its specification gives round its
// label. Its sides — joints, the lines where the lines along the tiers end (hatching does not end them); its ends — lines
// across it, however short the pieces of them left; of several, the one whose lines cover it most.
function sizedAround(b,vert,horiz,scale,kinds,numbers){
 const tol=40/scale,lines=horiz.filter(h=>!dimensionLine(h,numbers));
 const near=(v,reach)=>v.y1>b.cy-reach&&v.y0<b.cy+reach&&Math.abs(v.x-b.cx)<reach;
 let best=null;
 for(const q of kinds)for(const [w,h] of [[q.width_mm,q.length_mm],[q.length_mm,q.width_mm]]){
  if(!(w>0&&h>0))continue;
  const W=w/scale,H=h/scale,ends=lines.filter(l=>Math.abs(l.y-b.cy)<H+1);
  const joints=uniq(vert.filter(v=>near(v,Math.max(W,H)+1)&&ends.some(l=>(Math.abs(l.x0-v.x)<=.6||Math.abs(l.x1-v.x)<=.6)&&l.y>=v.y0-1&&l.y<=v.y1+1)).map(v=>v.x));
  for(const l of joints.filter(x=>x<b.cx))for(const r of joints.filter(x=>x>b.cx&&Math.abs(x-l-W)<=tol)){
   const across=ends.filter(e=>Math.min(e.x1,r)-Math.max(e.x0,l)>=100/scale),ys=uniq(across.map(e=>e.y));
   const cover=y=>{let s=0,need=l;for(const e of across.filter(e=>Math.abs(e.y-y)<=.3).sort((p,q)=>p.x0-q.x0)){const a=Math.max(need,e.x0),z=Math.min(r,e.x1);if(z>a)s+=z-a;need=Math.max(need,z)}return s/(r-l)};
   const side=x=>{let s=0;for(const v of vert.filter(v=>Math.abs(v.x-x)<=.3))s+=Math.max(0,Math.min(v.y1,b.cy+H)-Math.max(v.y0,b.cy-H));return s};
   for(const top of ys.filter(y=>y<b.y0))for(const bottom of ys.filter(y=>y>b.y1&&Math.abs(y-top-H)<=tol)){
    const score=Math.abs(r-l-W)+Math.abs(bottom-top-H)-(cover(top)+cover(bottom))*2-Math.min(1,(side(l)+side(r))/(2*H));
    if(!best||score<best.score)best={score,rect:{l,r,top,bottom}}
   }
  }
 }
 return best?.rect||null
}
// Panels drawn by one line along a tier: the joints left and right of the label (not its hatching), the lines under
// and over it (not dimension lines).
function jointsAround(b,vert,horiz,numbers,win){
 const xs=uniq(vert.filter(v=>v.y0<=b.cy&&v.y1>=b.cy&&Math.abs(v.x-b.cx)<win).map(v=>v.x)),hx=hatching(xs);
 const l=xs.filter(x=>!hx.has(x)&&x<b.x0-.3).at(-1),r=xs.find(x=>!hx.has(x)&&x>b.x1+.3);
 if(l===undefined||r===undefined)return null;
 const w=r-l,mid0=l+w*.3,mid1=r-w*.3;
 const ys=uniq(horiz.filter(h=>h.x0<=mid0&&h.x1>=mid1&&Math.abs(h.y-b.cy)<win*2&&!dimensionLine(h,numbers)).map(h=>h.y)),hy=hatching(ys);
 const top=ys.filter(y=>!hy.has(y)&&y<b.y0-.3).at(-1),bottom=ys.find(y=>!hy.has(y)&&y>b.y1+.3);
 return top===undefined||bottom===undefined?null:{l,r,top,bottom}
}
// Panels of a layout by columns drawn by their joints (ИР-71535 АР ч.2 «Схема раскладки стеновых панелей по ряду 08»): a
// joint runs the whole height of its panel, the lines along the wall run on past it (its tiers, the foot of the wall). The
// joints left and right of the label from its foot to its top; the nearest line along the wall over and under the label
// that runs across the whole column closes it sooner. Under the slope of a roof the top is where each joint ends (topCut).
// (gap: the longest break bridged — a dashed line is one run)
function columnRuns(vert,gap=.2){
 const runs=[];
 for(const v of vert.slice().sort((a,b)=>a.x-b.x||a.y0-b.y0)){const p=runs.find(q=>Math.abs(q.x-v.x)<=.3&&v.y0<=q.y1+gap&&v.y1>=q.y0-gap);
  if(p){p.y0=Math.min(p.y0,v.y0);p.y1=Math.max(p.y1,v.y1)}else runs.push({...v})}
 return runs
}
// With the size its table gives (size: width × length, mm): a side that is the edge of an opening in it (a hole for a beam,
// a duct) gives way to the joint a panel's width off, and a panel the opening's edge would end goes on to its length where
// its joints do — the opening is a hole in it, not its end.
function columnAround(b,runs,horiz,numbers,hs,scale,size=null,slopes=[],ext=null){
 const cross=runs.filter(v=>v.y0<=b.cy&&v.y1>=b.cy);
 let l=cross.filter(v=>v.x<b.x0-.3).sort((p,q)=>q.x-p.x)[0],r=cross.filter(v=>v.x>b.x1+.3).sort((p,q)=>p.x-q.x)[0];
 if(!l||!r)return null;
 if(size?.width_mm&&Math.abs((r.x-l.x)*hs-size.width_mm)>40){
  const reach=v=>v.y0<=b.cy+size.length_mm/scale&&v.y1>=b.cy-size.length_mm/scale;
  const r2=runs.filter(v=>reach(v)&&Math.abs(v.x-l.x-size.width_mm/hs)<=40/hs)[0],l2=runs.filter(v=>reach(v)&&Math.abs(r.x-v.x-size.width_mm/hs)<=40/hs)[0];
  if(r2&&r2.x>b.x1)r=r2;else if(l2&&l2.x<b.x0)l=l2;
 }
 const w=(r.x-l.x)*hs;if(w<150||w>1300)return null;
 // (an extension line of a dimension the joints run on through is not its end — ext, panelViews)
 const spans=h=>h.x0<=l.x+1&&h.x1>=r.x-1&&!dimensionLine(h,numbers)&&!(ext&&ext.has(h)&&[l,r].every(v=>v.y0<h.y-1&&v.y1>h.y+1));
 const over=horiz.filter(h=>h.y<b.y0-.3&&spans(h)).sort((p,q)=>q.y-p.y)[0],under=horiz.filter(h=>h.y>b.y1+.3&&spans(h)).sort((p,q)=>p.y-q.y)[0];
 // (a joint broken by small holes on it — openings for the beams of the roof drawn across it —: on through the gaps,
 // up to where the other joint goes)
 const chain=(v,lim,dirUp)=>{let y=dirUp?v.y0:v.y1;for(let k=0;k<40;k++){const n=runs.find(q=>Math.abs(q.x-v.x)<=.3&&(dirUp?q.y1<y-.1&&y-q.y1<=40&&q.y0<y:q.y0>y+.1&&q.y0-y<=40&&q.y1>y));
   if(!n||(dirUp?n.y0<lim-.5:n.y1>lim+.5))break;y=dirUp?n.y0:n.y1}return y};
 let l0=l.y0,r0=r.y0,l1=l.y1,r1=r.y1;
 if(l0>r0+.8)l0=chain(l,r0,true);else if(r0>l0+.8)r0=chain(r,l0,true);
 if(l1<r1-.8)l1=chain(l,r1,false);else if(r1<l1-.8)r1=chain(r,l1,false);
 let tl=Math.max(l0,over?over.y:-Infinity),tr=Math.max(r0,over?over.y:-Infinity),bl=Math.min(l1,under?under.y:Infinity),br=Math.min(r1,under?under.y:Infinity);
 // (under the slope of a roof: the top where the line of the roof crosses each joint — the piece over it is cut off on
 // the site, «Обрезать по месту»)
 const yAt=(s,x)=>s.ya+(s.yb-s.ya)*(x-s.x0)/(s.x1-s.x0);
 const roof=slopes.filter(s=>s.x0<=l.x+1&&s.x1>=r.x-1&&yAt(s,(l.x+r.x)/2)<b.y0&&yAt(s,(l.x+r.x)/2)>Math.min(tl,tr)-.5).sort((p,q)=>yAt(q,(l.x+r.x)/2)-yAt(p,(l.x+r.x)/2))[0];
 if(roof){tl=Math.max(tl,yAt(roof,l.x));tr=Math.max(tr,yAt(roof,r.x))}
 let bottom=Math.max(bl,br),top=Math.min(tl,tr);
 if(size?.length_mm&&Math.abs((bottom-Math.min(tl,tr))*scale-size.length_mm)>60&&Math.abs(tl-tr)<=.8){
  const L=size.length_mm/scale,tol=60/scale,up=bottom-L,down=top+L;
  if(Math.min(l0,r0)<=up+tol&&Math.max(l0,r0)<=bottom-L*.5){top=up;tl=tr=up}
  else if(Math.max(l1,r1)>=down-tol){bottom=down}
 }
 if((bottom-top)*scale<250)return null;
 return{l:l.x,r:r.x,top,bottom,...(Math.abs(tl-tr)>.8?{topCut:{l:tl,r:tr}}:{}),column:true}
}
function along(bubbles,dims,scale){
 const left=[0];
 for(let i=1;i<bubbles.length;i++){
  const raw=(bubbles[i].pt-bubbles[i-1].pt)*scale,near=dims.filter(d=>Math.abs(d-raw)<=raw*.04).sort((a,b)=>Math.abs(a-raw)-Math.abs(b-raw))[0];
  left.push(left[i-1]+(near||Math.round(raw/50)*50))
 }
 return left
}
// A facade is drawn at one scale both ways: at the scale of its level marks most distances between its bubbles are the
// dimensions written under them (a plan with marks of floors here and there gives a scale of nothing).
function sameScale(bubbles,dims,scale){
 let n=0;for(let i=1;i<bubbles.length;i++){const raw=(bubbles[i].pt-bubbles[i-1].pt)*scale;if(dims.some(d=>Math.abs(d-raw)<=raw*.04))n++}
 return n>=Math.max(1,(bubbles.length-1)/2)
}
const LETTERS="АБВГДЕЖЗИКЛМНПРСТУФХЦЧШЩЭЮЯ";
const numbered=n=>/\d/.test(String(n));
const axisRank=n=>{const m=/(\d+)(?:\/(\d+))?/.exec(String(n));return m?Number(m[1])+(m[2]?Number(m[2])/100:0):1000+LETTERS.indexOf(String(n).toUpperCase())};
// The view a text belongs to: the nearest row of bubbles under it; of two views side by side (their rows within 100 pt
// of height), the one it stands over (a window at the end of one facade is not of the facade drawn next to it).
const ownerOf=rows=>(x,y)=>{
 const near=rows.filter(r=>r.y>y&&r.y-y<1300&&x>=r.x0-260&&x<=r.x1+260).sort((a,b)=>a.y-b.y),out=r=>Math.max(0,r.x0-x,x-r.x1)>30;
 const best=near[0]||null;if(!best||!out(best))return best;
 // (off the nearest row, between the bubbles of a row a little lower — ИР-71535 АР ч.2 л.5: «Пс-111» of «по фасаду
 // 3-1» on «3», «2В» 200 pt under it, 230 pt left of the bubbles of «по ряду К, в осях 01-03» 44 pt under it)
 return near.find(r=>r.y-best.y<100&&!out(r))||near.find(r=>r.y-best.y<300&&r.items?.length>=2&&x>=r.x0&&x<=r.x1+(r.items.at(-1).width||0))||best};
// Rows of axis bubbles only: names that do not repeat, all numbers or all letters, in their order along the row (sizes of
// windows in circles, «24 26 21 18», or marks of nodes, «54 54 54», are not axes and would take the labels above them).
const axisRows=(texts,segments)=>bubbleRows(texts,segments).filter(r=>{const n=r.items.slice().sort((a,b)=>a.x-b.x).map(t=>String(t.str).trim().toUpperCase()),k=n.map(axisRank);
 return n.length>=2&&new Set(n).size===n.length&&new Set(n.map(numbered)).size===1&&(k.every((v,i)=>!i||v>k[i-1])||k.every((v,i)=>!i||v<k[i-1]))});

// The title of a view of a layout: «Схема раскладки стеновых панелей по ряду 08» over it (the nearest above, nearest the
// middle of its bubbles), and the row it names — the axis its wall stands on: «08» → «8», «Л».
const VIEW_TITLE=/^Схем[аы]\s+раскладки\s+стенов/iu;
function viewTitle(texts,row,top){
 const mid=(row.x0+row.x1)/2,cost=t=>top-t.y+Math.abs(t.x+(t.width||0)/2-mid)*.5;
 return texts.filter(t=>horizontalText(t)&&VIEW_TITLE.test(String(t.str).trim())&&t.y<top&&top-t.y<700&&t.x+(t.width||0)>row.x0-260&&t.x<row.x1+260).sort((a,b)=>cost(a)-cost(b))[0]||null
}
const titleRow=str=>{
 const m=/по\s+ряду\s+([А-ЯЁ]|\d{1,3}(?:\/\d{1,2})?)\s*(?=[,.;]|\s+в\s|$)/iu.exec(String(str).replace(/\s+/g," ").trim());if(!m)return null;
 const n=m[1].toUpperCase();return /^\d/.test(n)?n.replace(/^0+(?=\d)/,""):n
};
// Roofs of a layout by sketches (ИР-71535 АР ч.2 л.21, 22: «Схема раскладки кровельных панелей в осях 03-08 - Б-Л»): a
// plan — its numbered axes in a row under it, its lettered ones in a column at its left; the panels in columns between
// their joints and in bands between the lines across the whole roof (the eaves, the joints of the tiers — dashed —, the
// ridge); a panel's label «Пк-6» stands over the lower line of its band. Its levels: «+21,750» at the eaves,
// «~+26,800 отм. конька» at the ridge — each at the line across nearest its text. All in points of the sheet: the scheme
// puts it on the grid by its bubbles.
const ROOF_POS=/^Пк-\d{1,3}(?:\.\d{1,2})?$/u;
function roofPlans({segments=[],texts=[]}={}){
 const titles=texts.filter(t=>horizontalText(t)&&/^Схем[аы]\s+раскладки\s+кровельн/iu.test(String(t.str).trim()));
 const labels=texts.filter(t=>horizontalText(t)&&ROOF_POS.test(String(t.str).trim()));
 if(!titles.length||labels.length<4)return[];
 const name=t=>String(t.str).trim().toUpperCase(),mid=t=>t.x+(t.width||0)/2;
 const ringed=bubbleRows(texts,segments,1).flatMap(r=>r.items);
 // (rows of numbered bubbles split where a name comes again or the order turns — two plans side by side; columns of
 // lettered ones at one x)
 // A row of one numbered bubble beside a lettered one (ИР-71535 л.21 «в осях К-03 - В-К»: «К» and «03» under a roof
 // over the annex, «~10000» between them — the edge of the building beside it) is kept apart: its plan takes the place
 // from that one axis and the scale of its lettered column, and says which bubble it did not use.
 const rows=[],lone=[];
 for(const r of bubbleRows(texts,segments,1)){let cur=[];
  const nums=r.items.filter(q=>numbered(name(q)));
  if(nums.length===1){lone.push(Object.assign([nums[0]],{mixed:r.items.filter(q=>!numbered(name(q))).map(name)}));continue}
  const flush=()=>{if(cur.length>=2)rows.push(cur);cur=[]};
  for(const t of r.items.filter(q=>numbered(name(q))).sort((a,b)=>a.x-b.x)){const k=cur.map(q=>axisRank(name(q))),way=k.length>=2?Math.sign(k[1]-k[0]):0;
   if(cur.some(q=>name(q)===name(t))||way&&Math.sign(axisRank(name(t))-k[k.length-1])!==way)flush();cur.push(t)}
  flush()}
 const cols=[];for(const t of ringed.filter(q=>!numbered(name(q))).sort((a,b)=>a.y-b.y)){const g=cols.find(c=>Math.abs(mid(c[0])-mid(t))<=4&&!c.some(q=>name(q)===name(t)));if(g)g.push(t);else cols.push([t])}
 const views=[],used=new Set();
 for(const row of rows.sort((a,b)=>a[0].y-b[0].y)){
  const x0=Math.min(...row.map(mid)),x1=Math.max(...row.map(mid)),y=row[0].y;
  const col=cols.filter(c=>c.length>=2&&!used.has(c)&&mid(c[0])<x0&&Math.max(...c.map(q=>q.y))<y).sort((a,b)=>(x0-mid(a[0]))+(y-Math.max(...a.map(q=>q.y)))-((x0-mid(b[0]))+(y-Math.max(...b.map(q=>q.y)))))[0];
  if(!col)continue;used.add(col);
  const cx=mid(col[0]),y0=Math.min(...col.map(q=>q.y));
  views.push({row,col,box:{x0:cx,x1:x1+150,y0:y0-150,y1:y}})
 }
 // (a row of one bubble: after the full ones, with a column left free, under a title of a roof plan of its own)
 for(const row of lone.sort((a,b)=>a[0].y-b[0].y)){
  const x0=mid(row[0]),y=row[0].y;
  const col=cols.filter(c=>c.length>=2&&!used.has(c)&&mid(c[0])<x0&&x0-mid(c[0])<=900&&Math.max(...c.map(q=>q.y))<y).sort((a,b)=>(x0-mid(a[0]))-(x0-mid(b[0])))[0];
  if(!col)continue;
  const cx=mid(col[0]),y0=Math.min(...col.map(q=>q.y));
  if(!titles.some(t=>{const b=textBox(t);return b.cy<y0&&y0-b.cy<=400&&b.x1>=cx-50&&b.x0<=x0+150}))continue;
  used.add(col);views.push({row,col,mixed:row.mixed,box:{x0:cx,x1:x0+150,y0:y0-150,y1:y}})
 }
 if(!views.length)return[];
 // (a label in two boxes: the smaller)
 const area=b=>(b.x1-b.x0)*(b.y1-b.y0),inBox=(b,x,y)=>x>=b.x0&&x<=b.x1&&y>=b.y0&&y<=b.y1;
 const own=new Map(views.map(v=>[v,[]]));
 for(const t of labels){const b=textBox(t),v=views.filter(w=>inBox(w.box,b.cx,b.cy)).sort((p,q)=>area(p.box)-area(q.box))[0];if(v)own.get(v).push(t)}
 // Lines along both ways (dashes too) — but not the dashes of an axis (ИР-71535 л.21 «в осях 03-08 - Б-Л»: the axes К
 // and В across the slope cut the eaves panels at them, О3, О4/1, О6, О8 along it narrowed the strips by 190 mm). A
 // line drawn solid on an axis (the ridge on Е) stays.
 const ax=[...rows.flat(),...lone.flat()].map(mid),ay=cols.flat().map(q=>q.y-(q.size||8)*.36);
 const dash=(c,len,list)=>len<60&&list.some(a=>Math.abs(a-c)<=2.5);
 // (nor a dimension line — its number written along it: л.22 «08-010 - Ж-Н», the chain «2385 900 5000 900 3150» of the
 // openings across the strip Пк-13 took a third of it)
 const H=[],V=[];
 for(const s of segments){const dx=Math.abs(s.a.x-s.b.x),dy=Math.abs(s.a.y-s.b.y);
  if(dx<=.3&&dy>=.8){if(!dash((s.a.x+s.b.x)/2,dy,ax))V.push({x:(s.a.x+s.b.x)/2,y0:Math.min(s.a.y,s.b.y),y1:Math.max(s.a.y,s.b.y)})}
  else if(dy<=.3&&dx>=.8&&!dash((s.a.y+s.b.y)/2,dx,ay))H.push({y:(s.a.y+s.b.y)/2,x0:Math.min(s.a.x,s.b.x),x1:Math.max(s.a.x,s.b.x)})}
 // (the line nearest under a number, or right of an upright one, within 8 pt)
 const sized=new Set();
 for(const b of texts.filter(t=>/^\d{2,5}\*?$/.test(String(t.str).trim())).map(textBox)){
  const at=b.angle===0?H.filter(h=>h.y>=b.y1-.5&&h.y<=b.y1+8&&b.cx>=h.x0&&b.cx<=h.x1).sort((p,q)=>p.y-q.y)[0]:V.filter(v=>v.x>=b.x1-.5&&v.x<=b.x1+8&&b.cy>=v.y0&&b.cy<=v.y1).sort((p,q)=>p.x-q.x)[0];
  if(at)sized.add(at)
 }
 for(const list of [H,V])for(let i=list.length-1;i>=0;i--)if(sized.has(list[i]))list.splice(i,1);
 // Panels along the slope as drawn: columns of a plan whose panels run up and down the sheet (л.21), or — the sheet
 // turned in thought (x for y) — strips running across it (л.22: the roofs of the annexes, panels from О8 to О10, the
 // label at the end of each strip).
 const ways=[false,true].map(flip=>{
  const run=columnRuns((flip?H.map(h=>({x:h.y,y0:h.x0,y1:h.x1})):V).filter(v=>v.y1-v.y0>=4),20);
  const cross=flip?V.map(v=>({y:v.x,x0:v.y0,x1:v.y1})):H;
  return{flip,run,cross,box:t=>{const b=textBox(t);return flip?{x0:b.y0,x1:b.y1,y0:b.x0,y1:b.x1,cx:b.cy,cy:b.cx}:b}}
 });
 const out=[];
 for(const v of views){
  const list=own.get(v);if(list.length<4)continue;
  let best=null;
  for(const w of ways){
   const bs=list.map(w.box),lx0=Math.min(...bs.map(b=>b.x0))-30,lx1=Math.max(...bs.map(b=>b.x1))+30,ly0=Math.min(...bs.map(b=>b.y0))-700,ly1=Math.max(...bs.map(b=>b.y1))+700;
   // The lines across the roof: dashes and lines at one height covering most of the width of its labels.
   const byY=new Map();for(const h of w.cross){if(h.x1<lx0||h.x0>lx1||h.y<ly0||h.y>ly1)continue;const k=Math.round(h.y*2);if(!byY.has(k))byY.set(k,[]);byY.get(k).push(h)}
   const tiers=[],hidden=new Set();
   for(const [k,hs] of byY){
    const all=[...hs,...(byY.get(k-1)||[]),...(byY.get(k+1)||[])].map(h=>[Math.max(lx0,h.x0),Math.min(lx1,h.x1)]).filter(q=>q[1]>q[0]).sort((a,b)=>a[0]-b[0]);
    let cov=0,at=lx0;for(const [a,b] of all){const c=Math.max(at,a);if(b>c)cov+=b-c;at=Math.max(at,b)}
    if(cov>=(lx1-lx0)*.6&&!tiers.some(y=>Math.abs(y-k/2)<=.6)){tiers.push(k/2);
     // (a hidden line: dashes only, none a tenth as long as the roof is wide)
     if(all.length>=6&&all.every(q=>q[1]-q[0]<=(lx1-lx0)*.1))hidden.add(k/2)}
   }
   tiers.sort((a,b)=>a-b);
   // (a strip's label may stand off its start — the edge of a wall beside it, «Пк-15» 40 pt from it)
   const panels=[],tol=w.flip?50:20;let lost=0;
   for(const [i,t] of list.entries()){
    const b=bs[i];
    // (the line the label stands at, within tol of it; the band runs from it past the label to the next line)
    const near=tiers.filter(y=>y>=b.y0-tol&&y<=b.y1+tol).sort((p,q)=>Math.min(Math.abs(p-b.y0),Math.abs(p-b.y1))-Math.min(Math.abs(q-b.y0),Math.abs(q-b.y1)))[0];
    const far=near===undefined?undefined:near>=b.cy?tiers.filter(y=>y<b.y0-5).sort((p,q)=>q-p)[0]:tiers.filter(y=>y>b.y1+5).sort((p,q)=>p-q)[0];
    if(far===undefined){lost++;continue}
    let a0=Math.min(near,far),a1=Math.max(near,far);
    // (the sides of the strip run along at least half its band, pieces broken at an opening counted together — not a
    // dimension line or the side of an opening in it: л.21 «3350» from an opening ОВ 700×900 across the label Пк-2
    // took 290 mm of the strip)
    const sides=w.run.filter(q=>q.y1>a0&&q.y0<a1),along=x=>{let c=0,at=a0;
     for(const [p,q] of sides.filter(q=>Math.abs(q.x-x)<=.3).map(q=>[Math.max(a0,q.y0),Math.min(a1,q.y1)]).sort((m,n)=>m[0]-n[0])){const s=Math.max(at,p);if(q>s)c+=q-s;at=Math.max(at,q)}
     return c};
    const cross=sides.filter(q=>along(q.x)>=(a1-a0)*.5);
    const l=cross.filter(q=>q.x<b.x0+.3).sort((p,q)=>q.x-p.x)[0],r=cross.filter(q=>q.x>b.x1-.3).sort((p,q)=>p.x-q.x)[0];
    if(!l||!r||r.x-l.x>120){lost++;continue}
    // (the strip runs on past the line at either end of its band to where both its sides end, at a line across it
    // within 40 pt: л.22 «08-010 - А-А/1» — the dashed line of a wall under the roof crosses the strips 300 mm before
    // their end; «08-010 - Ж-Н» — the line of a wall above, 1200 mm from the eaves, and the line short of the end)
    const reach=(y,s)=>{
     const ends=[l.x,r.x].map(x=>{const q=w.run.filter(q=>Math.abs(q.x-x)<=.3&&q.y0<=y+.5&&q.y1>=y-.5);return q.length?s>0?Math.max(...q.map(q=>q.y1)):Math.min(...q.map(q=>q.y0)):y});
     const e=s>0?Math.min(...ends):Math.max(...ends);if(Math.abs(e-y)<=1||Math.abs(e-y)>40)return y;
     let c=0,at=l.x;for(const [p,q] of w.cross.filter(h=>Math.abs(h.y-e)<=.8&&h.x1>l.x&&h.x0<r.x).map(h=>[Math.max(l.x,h.x0),Math.min(r.x,h.x1)]).sort((m,n)=>m[0]-n[0])){const g=Math.max(at,p);if(q>g)c+=q-g;at=Math.max(at,q)}
     return c>=(r.x-l.x)*.6?e:y};
    a0=reach(a0,-1);a1=reach(a1,1);
    panels.push({mark:String(t.str).trim(),a0,a1,l:l.x,r:r.x,pt:{x:Math.round(textBox(t).cx),y:Math.round(textBox(t).cy)}})
   }
   // A joint of two tiers lapped (ИР-71535 АР ч.2 л.21 «в осях 03-08 - Б-Л»: a solid line and a dashed one 7 pt — 250 mm —
   // past it, over the purlin П1 of КМ1 under the joint; the panels stopped at them, a gap of 250 mm across the whole roof,
   // each panel 250 mm shorter than its table — Пк-6 12530, Пк-1 12550): the band whose edge is the solid line runs on
   // under the next panel to the hidden line (the joint over the purlin); the band whose edge is the hidden line laps the
   // outer sheet of its panel over the next one to the solid line (lap, pt, at a0 and at a1). With no band past it (л.22
   // «08-010 - Б-Ж»: the dashed line of the wall 2,5 pt — 90 mm — short of the eaves, Пк-16 9550 by its table) the band
   // at the hidden line runs on to the solid one, the edge of the roof. Within 10 pt.
   const isHidden=y=>[...hidden].some(q=>Math.abs(q-y)<=.6),isTier=y=>tiers.some(q=>Math.abs(q-y)<=.6);
   const beyond=(p,y,s)=>panels.some(q=>q!==p&&Math.min(q.r,p.r)-Math.max(q.l,p.l)>(p.r-p.l)*.5&&(s>0?Math.abs(q.a0-y)<=.6:Math.abs(q.a1-y)<=.6));
   for(const p of panels){p.lap=[0,0];
    for(const [k,s] of [[0,-1],[1,1]]){const e=k?p.a1:p.a0;if(!isTier(e))continue;
     const past=tiers.filter(y=>(y-e)*s>.6&&(y-e)*s<=10).sort((m,n)=>Math.abs(m-e)-Math.abs(n-e));
     if(isHidden(e)){const sol=past.find(y=>!isHidden(y));if(sol===undefined)continue;
      if(beyond(p,sol,s))p.lap[k]=Math.round(Math.abs(sol-e)*10)/10;else p[k?"b1":"b0"]=sol}
     else{const hid=past.find(y=>isHidden(y));if(hid!==undefined&&beyond(p,hid,s))p[k?"b1":"b0"]=hid}}}
   for(let i=0;i<panels.length;i++){const p=panels[i],a0=p.b0??p.a0,a1=p.b1??p.a1;
    // (the band as drawn, before that: its table decides — src/ai-montage-plan.js)
    panels[i]={mark:p.mark,...(w.flip?{x0:a0,x1:a1,y0:p.l,y1:p.r,dir:"x"}:{x0:p.l,x1:p.r,y0:a0,y1:a1,dir:"y"}),pt:p.pt,...(p.lap[0]||p.lap[1]?{lap:p.lap}:{}),...(a0!==p.a0||a1!==p.a1?{drawn:[p.a0,p.a1]}:{})}}
   if(!best||panels.length>best.panels.length)best={w,tiers,panels,lost}
  }
  if(!best.panels.length)continue;
  // Levels at the line across nearest their text («~» — approximate — read as written).
  const levels=[];
  for(const t of texts){
   // (a plan of strips writes its marks upright along its edges: the line nearest the text's foot)
   const str=String(t.str).trim().replace(/^~\s*/,"");if(horizontalText(t)===best.w.flip||!/^[+\-−±]\d{1,2}[,.]\d{3}$/u.test(str))continue;
   if(t.x<v.box.x0-150||t.x>v.box.x1+60||t.y<v.box.y0-100||t.y>v.box.y1)continue;
   const mm=levelOf(str),c=best.w.flip?t.x:t.y;if(mm===null)continue;
   const at=best.tiers.filter(y=>Math.abs(y-c)<=25).sort((p,q)=>Math.abs(p-c)-Math.abs(q-c))[0];if(at!==undefined)levels.push({mm,at,dir:best.w.flip?"x":"y"})
  }
  const title=titles.filter(q=>q.y<v.box.y0+150&&q.x+(q.width||0)>v.box.x0-100&&q.x<v.box.x1+100).sort((p,q)=>q.y-p.y)[0];
  out.push({...(title?{title:String(title.str).replace(/\s+/g," ").trim()}:{}),xAxes:v.row.map(q=>({name:name(q),pt:Math.round(mid(q)*10)/10})),
   yAxes:v.col.map(q=>({name:name(q),pt:Math.round((q.y-(q.size||8)*.36)*10)/10})),levels,panels:best.panels,unplaced:best.lost,...(v.mixed?.length?{mixed:v.mixed}:{}),
   ...(()=>{const o=roofOpenings(segments,best.panels);return o.length?{openings:o}:{}})()})
 }
 return out
}
// Openings in a roof (ИР-71535 АР ч.2 л.21 «Отверстие ОВ 700 x 900(h)», л.22 «ОВ 900 x 600»): a rectangle of its own four
// lines among the strips — over a strip or the joint of two, the joint broken at it —, no side longer than three strips
// are wide, no label of a panel in it. Its panels are cut round it (holes), none of them is lost.
function roofOpenings(segments,panels){
 if(!panels.length)return[];
 const ws=panels.map(p=>p.dir==="x"?p.y1-p.y0:p.x1-p.x0).sort((a,b)=>a-b),w=ws[ws.length>>1],max=w*3,min=Math.max(3,w*.3);
 const x0=Math.min(...panels.map(p=>p.x0)),x1=Math.max(...panels.map(p=>p.x1)),y0=Math.min(...panels.map(p=>p.y0)),y1=Math.max(...panels.map(p=>p.y1));
 const H=[],V=[];
 for(const s of segments){const dx=Math.abs(s.a.x-s.b.x),dy=Math.abs(s.a.y-s.b.y);
  if(dx<=.3&&dy>=min&&dy<=max){const x=(s.a.x+s.b.x)/2;if(x>=x0&&x<=x1)V.push({x,y0:Math.min(s.a.y,s.b.y),y1:Math.max(s.a.y,s.b.y)})}
  else if(dy<=.3&&dx>=min&&dx<=max){const y=(s.a.y+s.b.y)/2;if(y>=y0&&y<=y1)H.push({y,x0:Math.min(s.a.x,s.b.x),x1:Math.max(s.a.x,s.b.x)})}}
 const out=[],same=(a,b)=>Math.abs(a-b)<=.6;
 for(const t of H)for(const b of H){
  if(b.y-t.y<min||b.y-t.y>max||!same(t.x0,b.x0)||!same(t.x1,b.x1))continue;
  const r={x0:(t.x0+b.x0)/2,x1:(t.x1+b.x1)/2,y0:t.y,y1:b.y},side=x=>V.some(v=>same(v.x,x)&&same(v.y0,r.y0)&&same(v.y1,r.y1));
  if(!side(r.x0)||!side(r.x1)||out.some(o=>same(o.x0,r.x0)&&same(o.x1,r.x1)&&same(o.y0,r.y0)&&same(o.y1,r.y1)))continue;
  const cx=(r.x0+r.x1)/2,cy=(r.y0+r.y1)/2;
  if(!panels.some(p=>cx>=p.x0&&cx<=p.x1&&cy>=p.y0&&cy<=p.y1))continue;
  if(panels.some(p=>p.pt.x>r.x0&&p.pt.x<r.x1&&p.pt.y>r.y0&&p.pt.y<r.y1||[p.x0-r.x0,p.x1-r.x1,p.y0-r.y0,p.y1-r.y1].every(d=>Math.abs(d)<=1.5)))continue;
  out.push(r)
 }
 return out.map(o=>({x0:Math.round(o.x0*10)/10,x1:Math.round(o.x1*10)/10,y0:Math.round(o.y0*10)/10,y1:Math.round(o.y1*10)/10}))
}
// A level mark of a layout by sketches: its text on a shelf, a stem from the end of the shelf to the line it marks (the
// arrow a filled triangle, no strokes) — down, or up («-0,250 Ур.з.», «+2,000» under «+2,020»). The mark's height is the
// end of its stem; a mark without one keeps the offset common to the sheet.
function stemLevels(levels,horiz,vert){
 const offset=levelOffset(levels,horiz);
 for(const l of levels){
  const best=[];
  for(const h of horiz){
   if(h.x0>l.x+l.w*.5||h.x1<l.x+l.w*.5||h.y-l.y<-1||h.y-l.y>4)continue;
   for(const v of vert){
    if(v.x<h.x0-.5||v.x>h.x1+.5||v.y1-v.y0>45)continue;
    const tip=Math.abs(v.y0-h.y)<=.4?v.y1:Math.abs(v.y1-h.y)<=.4?v.y0:null;
    if(tip!==null)best.push({tip,d:Math.min(Math.abs(v.x-l.x),Math.abs(v.x-l.x-l.w))})
   }
  }
  best.sort((p,q)=>p.d-q.d);
  if(best.length&&best[0].d<=l.w+20){l.y=best[0].tip;l.tip=true}else l.y+=offset
 }
 return levels
}
// A label written on a shelf with a leader from it: «Пс -106» (spaced so, as the leaders of the sheet are). The shelf
// under the text; the leader from an end of it to its point — or the shelf drawn on past the text to it.
function leaderLabels(texts,segments,isPos,taken=[]){
 const out=[],near=(p,x,y)=>Math.abs(p.x-x)<=1&&Math.abs(p.y-y)<=1;
 for(const t of texts){
  const s=String(t.str).replace(/\s+/g,"");if(!horizontalText(t)||!SKETCH_POS.test(s)||!isPos(s)||taken.includes(t))continue;
  const w=t.width||0,shelf=segments.find(q=>Math.abs(q.a.y-q.b.y)<=.3&&Math.abs(q.a.y-t.y-1.3)<=2.5&&Math.min(q.a.x,q.b.x)<=t.x+3&&Math.max(q.a.x,q.b.x)>=t.x+w-3);
  if(!shelf)continue;
  const y=shelf.a.y,x0=Math.min(shelf.a.x,shelf.b.x),x1=Math.max(shelf.a.x,shelf.b.x);
  // (on past the text one way only, ending with it the other way: a line under a label written in a panel runs on both)
  if(t.x-x0>8&&x1-t.x-w>3||x1-t.x-w>8&&t.x-x0>3)continue;
  let at=t.x-x0>8?{x:x0,y}:x1-t.x-w>8?{x:x1,y}:null,lead=null;
  if(!at)for(const e of [{x:x0,y},{x:x1,y}]){const l=segments.find(q=>q!==shelf&&(near(q.a,e.x,e.y)||near(q.b,e.x,e.y))&&Math.abs(q.a.y-q.b.y)>3&&Math.hypot(q.a.x-q.b.x,q.a.y-q.b.y)>=8);
   if(l){at=near(l.a,e.x,e.y)?l.b:l.a;const d=Math.hypot(at.x-e.x,at.y-e.y);lead={x:(at.x-e.x)/d,y:(at.y-e.y)/d};break}}
  if(!at)continue;
  // (a point of the label's width, not the text — a cut piece may be narrower than it; the way the leader comes to it:
  // its dot drawn on the very line of the piece's edge — ИР-71535 АР ч.2 л.8 Пс-137 on the lower edge of its row — is
  // the piece the leader goes into)
  out.push({...t,str:s,x:at.x-.5,width:1,y:at.y+(t.size||8)*.36,leader:true,...(lead?{lead}:{})})
 }
 return out
}
// An arrow from the ring of one bubble to the ring of the other, its head at the other (two strokes back from its tip):
// the bubble it starts from and whether the axes go down along the sheet (the way of «03 → 04» drawn to the left).
function arrowWay(two,segments){
 const [a,b]=two,ya=(a.ring.y+b.ring.y)/2;
 const shaft=segments.find(s=>Math.abs(s.a.y-s.b.y)<=.6&&Math.abs((s.a.y+s.b.y)/2-ya)<=Math.max(a.ring.r,b.ring.r)*.5&&
  Math.abs(Math.min(s.a.x,s.b.x)-(a.ring.x+a.ring.r))<=2&&Math.abs(Math.max(s.a.x,s.b.x)-(b.ring.x-b.ring.r))<=2);
 if(!shaft)return null;
 const y=(shaft.a.y+shaft.b.y)/2,x0=Math.min(shaft.a.x,shaft.b.x),x1=Math.max(shaft.a.x,shaft.b.x);
 const head=x=>segments.filter(s=>{const [p,q]=Math.abs(s.a.x-x)<=.6&&Math.abs(s.a.y-y)<=.6?[s.a,s.b]:Math.abs(s.b.x-x)<=.6&&Math.abs(s.b.y-y)<=.6?[s.b,s.a]:[null,null];
  return p&&Math.abs(q.y-y)>=.4&&Math.abs(q.x-x)>=2&&Math.abs(q.x-x)<=14&&(q.x-x)*(x0+x1-2*x)>0}).length>=2;
 const toB=head(x1),toA=head(x0);if(toB===toA)return null;
 const from=toB?a:b,to=toB?b:a;
 return{from,to,reversed:Math.sign(to.pt-from.pt)*Math.sign(axisRank(to.name)-axisRank(from.name))<0}
}
// Rows of bubbles of a layout of panels by sketches (ИР-71535 АР ч.2 л.6): small views side by side at one height make
// one row of bubbles («О8 О10 О8 О10 О10 О8» — the walls along Г, К and Л, two bubbles each) — split where a name comes
// again, the kind changes or the order turns; a view may show two bubbles only. A bubble alone (a view of another
// building, «по фасаду 3-1» on «3», «2В») keeps the labels over it from the view beside it, and makes no view.
const viewRows=(texts,segments)=>{
 const out=[],name=t=>String(t.str).trim().toUpperCase();
 for(const r of bubbleRows(texts,segments,1,true)){
  if(r.items.length===1){out.push({...r,lone:true});continue}
  let cur=[];
  const flush=()=>{if(cur.length)out.push({...r,items:cur,x0:cur[0].x,x1:cur[cur.length-1].x,x:(cur[0].x+cur[cur.length-1].x)/2,...(cur.length<2?{lone:true}:{})});cur=[]};
  for(const t of r.items.slice().sort((a,b)=>a.x-b.x)){
   const k=cur.map(c=>axisRank(name(c))),way=k.length>=2?Math.sign(k[1]-k[0]):0,rk=axisRank(name(t));
   if(cur.some(c=>name(c)===name(t))||cur.length&&numbered(name(cur[0]))!==numbered(name(t))||way&&Math.sign(rk-k[k.length-1])!==way)flush();
   cur.push(t)
  }
  flush()
 }
 return out
};
// Openings of a wall of panels: what no panel covers under a panel over it, column by column between the joints of
// the panels, joined along the wall where they share their top and bottom; then cut down to its own sides, the lines
// that start at its top and go down its height (pieces of panels beside it without a label are not the opening). Under
// a panel cut along a lower roof is that roof, not an opening. One whose bottom is the foot of the wall starts there.
function openingRects(panels,vert,horiz,scale,u,z,numbers=[],texts=[],ticks=[]){
 if(panels.length<4)return[];
 const rects=panels.map(p=>p.rect),xs=[];
 for(const v of rects.flatMap(r=>[r.l,r.r]).sort((a,b)=>a-b))if(!xs.length||v-xs[xs.length-1]>.4)xs.push(v);
 const foot=Math.max(...rects.map(r=>r.bottom)),cells=[];
 for(let i=0;i+1<xs.length;i++){
  const c0=xs[i],c1=xs[i+1];if((c1-c0)*scale<150)continue;
  let y=foot;
  for(const r of rects.filter(r=>r.l<=c0+.4&&r.r>=c1-.4).sort((a,b)=>b.bottom-a.bottom)){
   if(!r.cut&&(y-r.bottom)*scale>=250)cells.push({l:c0,r:c1,top:r.bottom,bottom:y});
   y=Math.min(y,r.top)
  }
 }
 const merged=[];
 for(const c of cells.sort((a,b)=>a.top-b.top||a.l-b.l)){
  const o=merged.find(o=>Math.abs(o.r-c.l)<=.4&&Math.abs(o.top-c.top)<=.8&&Math.abs(o.bottom-c.bottom)<=.8);
  if(o)o.r=c.r;else merged.push({...c})
 }
 const out=[];
 for(const o of merged){
  // The sides of the opening start at its top (hatching of the pieces beside it runs on up past it).
  const h=o.bottom-o.top,sides=uniq(vert.filter(v=>v.x>=o.l-.5&&v.x<=o.r+.5&&Math.abs(v.y0-o.top)<=1.5&&v.y1>=o.bottom-h*.1).map(v=>v.x));
  if(sides.length>=2&&(sides[sides.length-1]-sides[0])*scale>=400)out.push({...o,l:sides[0],r:sides[sides.length-1]});
  else out.push(o)
 }
 // Openings cut in panels drawn whole — a door in the lower part of a panel, a gate in the corner of two, a grille over
 // a joint (ГПЭС, АР-1 лист 9: grilles 1000×1400 and 800×800 over the gates): a rectangle its lines close. Two sides
 // (pieces drawn end to end as one: a side broken at the joint of the tiers), its top drawn across them (a piece of
 // it may be missing, a tenth), its bottom drawn or the foot of the wall; nothing running through its top but dimension
 // lines; empty — no joint, hatching or line across through it but dimension lines; in the wall, not a strip of a panel's
 // full height; no label of its own (the label of the panel round it may stand in it). It takes the place of the gaps
 // between panels it holds.
 const x0=Math.min(...rects.map(r=>r.l))-1,x1=Math.max(...rects.map(r=>r.r))+1,y0=Math.min(...rects.map(r=>r.top))-1;
 const pieces=vert.filter(v=>v.x>=x0&&v.x<=x1&&v.y0>=y0&&v.y1<=foot+2).sort((a,b)=>a.x-b.x||a.y0-b.y0),joined=[];
 for(const v of pieces){const o=joined.find(o=>Math.abs(o.x-v.x)<=.3&&Math.abs(o.y1-v.y0)<=.3);if(o)o.y1=Math.max(o.y1,v.y1);else joined.push({...v})}
 const vs=joined.filter(v=>(v.y1-v.y0)*scale>=300).sort((a,b)=>a.x-b.x);
 // A dimension line along a side: the nearest line its number is written along (not the side of the opening behind it).
 const dims=new Set();
 for(const b of numbers.map(textBox).filter(b=>b.angle!==0)){
  const at=joined.filter(v=>v.x>=b.x1-.5&&v.x<=b.x1+8&&b.cy>=v.y0&&b.cy<=v.y1).sort((p,q)=>p.x-q.x)[0];
  if(at)for(const v of joined)if(Math.abs(v.x-at.x)<=.3&&b.cy>=v.y0&&b.cy<=v.y1)dims.add(v)
 }
 // … or a line with the ticks of a dimension at both its ends (its number may stand off it).
 const ticked=v=>[v.y0,v.y1].every(y=>ticks.some(t=>[t.a,t.b].some(p=>Math.abs(p.x-v.x)<=.3&&p.y>=v.y0-.5&&p.y<=v.y1+.5&&Math.abs(p.y-y)<=6)));
 const sized=v=>dims.has(v)||ticked(v);
 const rows=new Map();for(const h of horiz){const k=Math.round(h.y*2);if(!rows.has(k))rows.set(k,[]);rows.get(k).push(h)}
 // The length of [a, b] the pieces cover.
 const span=(list,a,b)=>{let s=0,need=a;for(const [p,q] of list.sort((x,y)=>x[0]-y[0])){const c=Math.max(need,p),d=Math.min(b,q);if(d>c)s+=d-c;need=Math.max(need,d)}return s};
 const cover=(y,l,r,skip)=>span([-1,0,1].flatMap(d=>rows.get(Math.round(y*2)+d)||[]).filter(h=>Math.abs(h.y-y)<=.6&&h.x1>l&&h.x0<r&&!(skip&&skip(h))).map(h=>[h.x0,h.x1]),l,r)/(r-l);
 // The line under a level mark («+2,650») is its shelf, not a line of the wall; one under a number, a dimension line.
 const marks=texts.filter(t=>horizontalText(t)&&/^[+\-−±]?\d{1,2}[,.]\d{3}$/u.test(String(t.str).trim())).map(textBox);
 const noted=h=>marks.some(b=>b.y1<=h.y+.5&&b.y1>=h.y-4.5&&b.cx>=h.x0&&b.cx<=h.x1);
 // An extension line of a dimension — it runs a little past the dimension line across it (ИР-71535 АР ч.2 л.8 ряд Б:
 // «3570», «3400» from the top and the bottom of an opening ОВ 900×900, 3.5 pt past, made the panel Пс-129 beside it all
 // holes) — is not a line of the wall, unless it starts at a side of the opening (its top drawn on to the dimension: л.9
 // ряд Л, «ОВ 500 х 300» and «300»).
 const from=h=>{for(const v of vert){if(h.y<v.y0-1||h.y>v.y1+1)continue;if(h.x1-v.x>=.5&&h.x1-v.x<=6)return h.x0;if(v.x-h.x0>=.5&&v.x-h.x0<=6)return h.x1}return null};
 const plain=(l,r)=>h=>{if(noted(h))return true;const f=from(h);return f!==null&&Math.abs(f-l)>1&&Math.abs(f-r)>1};
 for(let i=0;i<vs.length;i++){
  const A=vs[i];
  for(let j=i+1;j<vs.length&&vs[j].x-A.x<=6500/scale;j++){
   const B=vs[j];if(B.x-A.x<380/scale||sized(A)||sized(B))continue;
   const l=A.x,r=B.x,top=Math.max(A.y0,B.y0),bottom=Math.min(A.y1,B.y1);
   if((bottom-top)*scale<300||cover(top,l,r,plain(l,r))<.9||!(Math.abs(bottom-foot)<=1.5||cover(bottom,l,r,plain(l,r))>=.9))continue;
   const within=joined.filter(v=>v.x>l+.5&&v.x<r-.5&&v.y1>top&&v.y0<bottom&&!sized(v));
   // (a joint over it may run on past its top up to 100 mm — л.8 ряд Б, ОВ 1050×1050 at +19,070)
   if(within.some(v=>v.y0<top-1&&v.y1>top+Math.max(1,100/scale)))continue;
   // Lines through it drawn in pieces (a joint of the tiers panel by panel) as much as whole ones.
   const xs=uniq(within.map(v=>v.x));
   if(xs.some(x=>span(within.filter(v=>Math.abs(v.x-x)<=.3).map(v=>[v.y0,v.y1]),top,bottom)>=(bottom-top)/2))continue;
   const aside=h=>noted(h)||dimensionLine(h,numbers),ys=uniq(horiz.filter(h=>h.y>top+1&&h.y<bottom-1&&h.x1>l&&h.x0<r&&!aside(h)).map(h=>h.y));
   if(ys.some(y=>cover(y,l,r,aside)>=.5))continue;
   const over=rects.filter(q=>Math.min(q.r,r)-Math.max(q.l,l)>1&&Math.min(q.bottom,bottom)-Math.max(q.top,top)>1);
   if(!over.length||over.some(q=>q.l<=l+1&&q.r>=r-1&&(top-q.top)*scale<100&&(q.bottom-bottom)*scale<100))continue;
   const same=q=>Math.max(Math.abs(q.l-l),Math.abs(q.r-r),Math.abs(q.top-top),Math.abs(q.bottom-bottom))*scale<100;
   // (a label in it of a panel not round it: panels, not an opening — л.5 ряд 03, the gable panels Пс-67 under the slope
   // two by two between their joints)
   const round=q=>q.l<=l+1&&q.r>=r-1&&q.top<=top+1&&q.bottom>=bottom-1;
   if(panels.some(p=>p.pt.x>l&&p.pt.x<r&&p.pt.y>top&&p.pt.y<bottom&&(same(p.rect)||!round(p.rect)))||rects.some(same))continue;
   const o={l,r,top,bottom,inner:true},held=q=>q.l>=l-1&&q.r<=r+1&&q.top>=top-1&&q.bottom<=bottom+1;
   const k=out.findIndex(q=>!held(q)&&q.l<r-1&&q.r>l+1&&q.top<bottom-1&&q.bottom>top+1);
   if(k<0){for(let n=out.length-1;n>=0;n--)if(held(out[n]))out.splice(n,1);out.push(o)}
   else if(r-l<out[k].r-out[k].l)out[k]=o;
   break
  }
 }
 return out.map(o=>{const a=u(o.l),b=u(o.r);return{u0:Math.min(a,b),u1:Math.max(a,b),z0:z(o.bottom),z1:z(o.top),base:Math.abs(o.bottom-foot)<=1.5,...(o.inner?{inner:true}:{}),at:{l:o.l,r:o.r,top:o.top,bottom:o.bottom}}}).sort((p,q)=>p.u0-q.u0||p.z0-q.z0)
}
// The note of an opening with its leader to it — «Отверстие ОВ 1050 х 1050(h).» and «отм .низа +19,070» under it (ИР-71535
// АР ч.2 л.8 ряд Б: drawn with its bottom at +17,300 beside the two «ОВ 900 х 900» at +17,300) —: an opening of the note's
// size goes to the level the note writes; the level it was drawn at is kept for the warning. A level mark at its bottom
// on the view (л.9 ряд Л: «+4,800» and «4880» at «ОВ 500 х 300», the note «+3,400») — the view stays, the note is kept.
const OPENING_NOTE=/Отверсти[еяй]\s+[А-ЯA-Z]{0,3}\s*(\d{2,5})\s*[хxХX×]\s*(\d{2,5})/u,LOW=/низа\s*([+\-−±]?\d{1,2}[,.]\d{3})/u;
function noteLevels(openings,texts,segments){
 const notes=texts.filter(t=>horizontalText(t)&&OPENING_NOTE.test(String(t.str))).map(t=>{
  const m=OPENING_NOTE.exec(String(t.str)),b=textBox(t);let low=LOW.exec(String(t.str));
  if(!low){const u=texts.filter(q=>q!==t&&horizontalText(q)&&LOW.test(String(q.str))).map(q=>({q,b:textBox(q)})).filter(o=>o.b.y0>=b.y1-2&&o.b.y0-b.y1<=18&&o.b.x1>=b.x0&&o.b.x0<=b.x1+30).sort((p,q)=>p.b.y0-q.b.y0)[0];if(u)low=LOW.exec(String(u.q.str))}
  const lv=low?levelOf(low[1]):null;return{w:Number(m[1]),h:Number(m[2]),lv,b}}).filter(n=>n.lv!==null);
 if(!notes.length)return openings;
 const marks=texts.filter(t=>horizontalText(t)&&levelOf(String(t.str).trim())!==null).map(t=>({mm:levelOf(String(t.str).trim()),b:textBox(t)}));
 const marked=o=>marks.some(m=>Math.abs(m.mm-o.z0)<=30&&m.b.x1>=o.at.l-60&&m.b.x0<=o.at.r+60&&Math.abs(m.b.y1-o.at.bottom)<=12);
 const on=(o,p)=>p.x>=o.at.l-2&&p.x<=o.at.r+2&&p.y>=o.at.top-2&&p.y<=o.at.bottom+2;
 for(const n of notes){
  const near=p=>p.x>=n.b.x0-15&&p.x<=n.b.x1+15&&p.y>=n.b.y0-3&&p.y<=n.b.y1+8;
  for(const s of segments){
   const [p,q]=near(s.a)?[s.a,s.b]:near(s.b)?[s.b,s.a]:[null,null];if(!p||Math.hypot(q.x-p.x,q.y-p.y)<20)continue;
   const o=openings.find(o=>o.at&&on(o,q));if(!o||Math.abs(o.u1-o.u0-n.w)>60||Math.abs(o.z1-o.z0-n.h)>60)continue;
   if(Math.abs(o.z0-n.lv)>30){if(marked(o))o.note_z0=n.lv;else{const h=o.z1-o.z0;o.drawn_z0=o.z0;o.z0=n.lv;o.z1=n.lv+h}}
   o.noted=true;break
  }
 }
 return openings
}
// Openings inside a panel drawn whole are holes of that panel (along it from its start, and up).
function holesOf(panels,openings){
 for(const p of panels){
  const holes=openings.filter(o=>o.u0>=p.u0-20&&o.u1<=p.u1+20&&o.z0>=p.z0-20&&o.z1<=p.z1+20&&o.u1-o.u0<p.u1-p.u0-20||o.inner&&o.u0<p.u1-20&&o.u1>p.u0+20&&o.z0<p.z1-20&&o.z1>p.z0+20)
   .map(o=>[Math.max(0,o.u0-p.u0),Math.min(p.u1-p.u0,o.u1-p.u0),Math.max(p.z0,o.z0),Math.min(p.z1,o.z1)]);
  if(holes.length)p.holes=holes
 }
 return panels
}
// Views of panels: every row of bubbles with panel labels over it.
function panelViews({segments=[],texts=[],paint=[]}={},spec=[]){
 // The colour laid inside a rectangle of the sheet (the most of its cells), if any.
 const cells=new Map();for(const c of paint){const k=Math.floor(c.x/30)+","+Math.floor(c.y/30);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(c)}
 const colourOf=rc=>{const n=new Map();for(let x=Math.floor(rc.l/30);x<=Math.floor(rc.r/30);x++)for(let y=Math.floor(rc.top/30);y<=Math.floor(rc.bottom/30);y++)for(const c of cells.get(x+","+y)||[])if(c.x>rc.l&&c.x+3<rc.r&&c.y>rc.top&&c.y+3<rc.bottom)n.set(c.c,(n.get(c.c)||0)+1);
  const b=[...n].sort((a,q)=>q[1]-a[1])[0];return b&&b[1]>=4?b[0]:""};
 // Positions of the tables are not labels of panels.
 const rowsOf=new Set(spec.map(p=>p.at));
 // Labels of panels: «ПН-30» (наружная), «ПС», «ПК», «ПП», «ПВ», «ПШ», or the positions of the panel table of the
 // sheet («ПД-3» is a sill board, not a panel).
 const kinds=new Set(spec.map(p=>p.kind));
 let labels=texts.filter(t=>{const m=horizontalText(t)&&POS.exec(String(t.str).trim());return m&&(/^П[НСКПВШ]$/u.test(m[1])||kinds.has(m[1]))&&!rowsOf.has(t)});
 // Tables with sketches: labels «Пс-1», «Пс-7.1» as the positions are written; the roof's («Пк-6») are on its own plans.
 // (a sheet of a layout without its table — the table is on the next sheet: the same labels)
 if(spec.some(p=>p.sketch)||!labels.length){const wall=new Set(spec.filter(p=>p.sketch&&!p.roof).map(p=>p.pos)),roof=new Set(spec.filter(p=>p.roof).map(p=>p.pos));
  const mixed=texts.filter(t=>{const s=String(t.str).trim(),m=horizontalText(t)&&SKETCH_POS.exec(s);return m&&!rowsOf.has(t)&&!roof.has(s)&&(wall.has(s)||/^П[НС]$/u.test(m[1].toUpperCase()))});
  // Labels on leaders («Пс -106» on a shelf under the axes of «по ряду 08, в осях Б-А», its line going up to a cut piece
  // of a panel past axis А; «Пс -84», «Пс -102.1» beside their views — ИР-71535 АР ч.2 л.6): the label at the end of its
  // leader, as if written there.
  if(spec.some(p=>p.sketch)||mixed.length>=4)labels=[...mixed,...leaderLabels(texts,segments,s=>!roof.has(s)&&(wall.has(s)||/^П[НС]-/u.test(s.replace(/^Пс/u,"ПС"))),mixed)]}
 // A layout by columns: its labels, upright or turned, as the positions of its table.
 if(spec.some(p=>p.layout)){
  // A position read whole on the facades at least twice whose row the OCR of the table lost («С704», «Р380»): its length
  // from its number, the width, thickness and RAL of the rows of its letter.
  const read=new Map();for(const t of texts){if(rowsOf.has(t))continue;const s=latin(t.str),m=/^([А-ЯЁ])(\d{2,3})$/u.exec(s);if(m&&!spec.some(p=>p.pos===s))read.set(s,(read.get(s)||0)+1)}
  for(const [pos,n] of read){const kin=spec.filter(p=>p.layout&&p.kind===pos[0]);
   // (not a cut-off label of a position of the table — «Р21» of «Р212», «Р214»)
   // (nor a misread one: «Р218» among «Р219» — a position of its letter one off)
   if(n<2||!kin.length||Number(pos.slice(1))<50||spec.some(p=>p.pos!==pos&&p.pos.startsWith(pos))||kin.some(p=>Math.abs(Number(p.pos.slice(1))-Number(pos.slice(1)))===1))continue;
   const mode=k=>{const c=new Map();for(const p of kin)c.set(p[k],(c.get(p[k])||0)+1);return[...c].sort((a,b)=>b[1]-a[1])[0][0]};
   spec.push({pos,kind:pos[0],length_mm:Number(pos.slice(1))*10,width_mm:mode("width_mm"),thickness_mm:mode("thickness_mm"),ral:mode("ral"),
    ...(mode("ral_inside")?{ral_inside:mode("ral_inside")}:{}),count:null,name:kin[0].name,table:"",layout:true,fromFacade:true})}
  const byPos=new Map(),byDigits=new Map();for(const p of spec.filter(q=>q.layout)){byPos.set(p.pos,p);const d=p.pos.replace(/^\D+/u,"");if(!byDigits.has(d))byDigits.set(d,[]);if(!byDigits.get(d).includes(p.pos))byDigits.get(d).push(p.pos)}
  const found=[];for(const t of texts){if(rowsOf.has(t)||horizontalText(t)&&rowOf(texts,t,620).length>=4)continue;const c=layoutLabel(t.str,byPos,byDigits,!horizontalText(t));if(c)found.push({t,c})}
  const band=f=>Math.round(textBox(f.t).cy/6);
  labels=found.map(f=>{let pos=f.c[0];
   if(f.c.length>1){const votes=new Map();for(const o of found)if(o.c.length===1&&f.c.includes(o.c[0])&&Math.abs(textBox(o.t).cy-textBox(f.t).cy)<6&&Math.abs(textBox(o.t).cx-textBox(f.t).cx)<900)votes.set(o.c[0],(votes.get(o.c[0])||0)+1);
    pos=[...votes].sort((a,b)=>b[1]-a[1])[0]?.[0]||pos}
   return{...f.t,str:pos,...(f.c.length>1?{cands:f.c}:{})}});void band
 }
 const sizes=new Map();for(const p of spec){if(!sizes.has(p.pos))sizes.set(p.pos,[]);sizes.get(p.pos).push(p)}
 if(labels.length<4)return[];
 const sketch=labels.some(t=>SKETCH_POS.test(String(t.str).trim())&&!POS.test(String(t.str).trim()));
 const rows=sketch?viewRows(texts,segments):axisRows(texts,segments);if(!rows.length)return[];
 const owner=ownerOf(rows);
 const vert=[],horiz=[],slopes=[],ticks=[];
 for(const s of segments){
  const dx=Math.abs(s.a.x-s.b.x),dy=Math.abs(s.a.y-s.b.y);
  // The ticks of dimensions: short strokes at 45°.
  if(dx>.3&&dy>.3&&dy/dx>.5&&dy/dx<2&&Math.hypot(dx,dy)>.8&&Math.hypot(dx,dy)<6)ticks.push(s);
  if(dx<=.3&&dy>=4)vert.push({x:(s.a.x+s.b.x)/2,y0:Math.min(s.a.y,s.b.y),y1:Math.max(s.a.y,s.b.y)});
  else if(dy<=.3&&dx>=3)horiz.push({y:(s.a.y+s.b.y)/2,x0:Math.min(s.a.x,s.b.x),x1:Math.max(s.a.x,s.b.x)});
  else if(dx>=3&&dy/dx<.35){const [p,q]=s.a.x<s.b.x?[s.a,s.b]:[s.b,s.a];slopes.push({x0:p.x,x1:q.x,ya:p.y,yb:q.y})}
 }
 const numbers=texts.filter(t=>/^\d{2,5}$/.test(String(t.str).trim()));
 const runs=sketch?columnRuns(vert):[];
 // (strokes neither upright nor level: the hatching of a section)
 const diag=sketch?segments.filter(q=>Math.abs(q.a.x-q.b.x)>.3&&Math.abs(q.a.y-q.b.y)>.3):[];
 // (an extension line of a dimension — from an opening to its dimension line, overshooting it by a few pt, a tick where
 // they cross — across a column whose joints run on through it: not the end of its panel; ИР-71535 АР ч.2 л.8, ряд Б: the
 // lines of ОВ 900×900 at +17,300 and +18,195 to the chain «3400 · 3570» ended the two panels Пс-127 right of it at
 // +17,300 and nothing stood over them up to +21,745 — the table of their sizes is on л.10, so the length of the position
 // did not take them on) — columnAround
 // (its tick as long as the size of the numbers wants it: 10 pt at «3400» of л.8)
 const marks=segments.filter(q=>{const dx=Math.abs(q.a.x-q.b.x),dy=Math.abs(q.a.y-q.b.y),l=Math.hypot(dx,dy);return dx>.3&&dy>.3&&dy/dx>.5&&dy/dx<2&&l>.8&&l<14});
 // (from a corner of the opening: its other end 0,3…3 pt off the end of a side no longer than an opening is high —
 // 100 pt, 3,5 m at 1:100 —, the edge of the opening at that height running from it the other way; a line of a tier
 // starts at the end of the wall)
 const extension=new Set();
 for(const h of horiz)for(const end of [h.x1,h.x0]){const sg=end===h.x1?1:-1,start=sg>0?h.x0:h.x1;
  const v=vert.find(q=>h.y>=q.y0-1&&h.y<=q.y1+1&&(end-q.x)*sg>=.5&&(end-q.x)*sg<=6);
  if(!v||!marks.some(t=>Math.abs((t.a.x+t.b.x)/2-v.x)<=1.5&&Math.abs((t.a.y+t.b.y)/2-h.y)<=1.5))continue;
  if(vert.some(q=>(start-q.x)*sg>=.3&&(start-q.x)*sg<=3&&q.y1-q.y0<=100&&(Math.abs(q.y0-h.y)<=.6||Math.abs(q.y1-h.y)<=.6)&&
   horiz.some(e=>e!==h&&Math.abs(e.y-h.y)<=.6&&(sg>0?Math.abs(e.x1-q.x)<=.6&&e.x0<q.x-1:Math.abs(e.x0-q.x)<=.6&&e.x1>q.x+1)))){extension.add(h);break}}
 const views=[],found=[];
 for(const row of rows){
  if(row.lone)continue;
  const own=labels.filter(t=>{const b=textBox(t);return owner(b.cx,b.cy)===row});
  // (a layout by sketches: a view of a piece of a wall titled of its own may hold two panels — ИР-71535 АР ч.2 л.5 «по
  // ряду К, в осях 03-04», Пс-112 ×2)
  if(own.length<4&&!(sketch&&own.length&&viewTitle(texts,row,Math.min(...own.map(t=>textBox(t).y0)))))continue;
  const region=texts.filter(t=>{const b=textBox(t);return owner(b.cx,b.cy)===row});
  // (a number with a point and no sign is an area or a sum read by OCR — «37х1190= 44.030» —, not a level mark)
  const levels=region.filter(t=>horizontalText(t)&&!/^\d{1,2}\.\d{3}$/.test(String(t.str).trim())).map(t=>({mm:levelOf(t.str),y:t.y,x:t.x,w:t.width||0,s:t.size||0})).filter(l=>l.mm!==null);
  // (a layout by sketches pairs its marks — «+2,020» over the shelf and «+2,000» under it, pointing up —: each at the
  // point of its own arrow)
  if(sketch)stemLevels(levels,horiz,vert);else{const offset=levelOffset(levels,horiz);levels.forEach(l=>{l.y+=offset})}
  found.push({row,own,region,levels,f:fit(levels)})
 }
 // A level mark the view that took it does not agree with (off its scale by more than 200 mm), within reach of another
 // view whose marks it fits at that scale: that view's (ИР-71535 АР ч.2 л.5: «+4,020», «+2,120» left of «по ряду 03, в
 // осях К-Л», their shelves running on to its wall, 140 pt right of the bubbles of «по фасаду 3-1» and nearer under them).
 if(sketch)for(const v of found){if(!v.f)continue;let moved=false;
  for(const l of v.levels.slice()){if(Math.abs(v.f.a+v.f.b*l.y-l.mm)<=200)continue;
   for(const w of found){if(w===v||!(w.row.y>l.y&&w.row.y-l.y<1300&&l.x>=w.row.x0-260&&l.x<=w.row.x1+260))continue;
    const g=fit([...w.levels,l]);if(!g||g.residual>80||Math.abs(g.b-v.f.b)>Math.abs(v.f.b)*.05||Math.abs(g.a+g.b*l.y-l.mm)>60)continue;
    v.levels.splice(v.levels.indexOf(l),1);w.levels.push(l);w.f=g;moved=true;break}}
  if(moved)v.f=fit(v.levels)||v.f}
 // Marks of openings drawn under their line («+7,450» under the head of a window) can make two scales agree as well:
 // the scale of the other views of the sheet decides (a facade is drawn at one scale both ways).
 const sure=found.filter(v=>v.f).map(v=>v.f.b).sort((x,y)=>x-y);
 // (a layout by sketches draws all its views at one scale: a mark written wrong — «+15,205» over a wall the dimension
 // gives 8820 high, ИР-71535 АР ч.2 л.6, ряд 08 в осях Н-Л — does not set a scale of its own)
 if(sketch&&sure.length>=3){const m=sure[sure.length>>1];
  for(const v of found)if(v.f&&Math.abs(v.f.b-m)>Math.abs(m)*.1){
   // (at that scale, the height most marks agree on)
   const as=v.levels.map(l=>l.mm-m*l.y);let best=null;for(const a of as){const n=as.filter(x=>Math.abs(x-a)<=60).length;if(!best||n>best.n)best={a,n}}
   if(best&&best.n>=2)v.f={a:best.a,b:m}}}
 for(const v of found){
  const {row,own,region,levels}=v,f=v.f||(sure.length?fit(levels,sure[sure.length>>1]):null);if(!f)continue;
  const scale=Math.abs(f.b);
  let bubbles=row.items.map(t=>({name:String(t.str).trim().toUpperCase(),pt:t.x+(t.width||0)/2,ring:t.ring})).sort((a,b)=>a.pt-b.pt);
  if(new Set(bubbles.map(b=>b.name)).size!==bubbles.length||new Set(bubbles.map(b=>numbered(b.name))).size!==1)continue;
  // Two bubbles joined by an arrow, «03 → 04» (ИР-71535 АР ч.2 л.5, «по ряду К, в осях 03-04»): the one it starts from
  // is the axis the panels are measured from, the other only the way along the wall — drawn beside it, not at its place.
  const arrow=bubbles.length===2&&bubbles.every(b=>b.ring)?arrowWay(bubbles,segments):null;
  if(arrow)bubbles=[arrow.from];
  const dims=region.filter(t=>/^\d{3,5}$/.test(String(t.str).trim())).map(t=>Number(t.str));
  // Along the wall the scale of the dimensions between the bubbles: a facade drawn lower than its length (ГПЭС
  // «Раскладка сэндвич-панелей», ряд Ж: heights at 1:31.8, lengths at 1:35.3) is read at each scale its own way.
  const hs=(()=>{if(sameScale(bubbles,dims,scale))return scale;let best=null;
   for(let i=1;i<bubbles.length;i++)for(const d of dims){const s=d/(bubbles[i].pt-bubbles[i-1].pt);if(!(s>0))continue;
    let n=0;for(let j=1;j<bubbles.length;j++){const raw=(bubbles[j].pt-bubbles[j-1].pt)*s;if(dims.some(q=>Math.abs(q-raw)<=raw*.01))n++}
    if(!best||n>best.n)best={s,n}}
   // (not another scale altogether: dimensions of the panels, «1000 1000», fit any two bubbles at a sixth of it)
   return best&&best.n>=Math.max(2,(bubbles.length-1)/2)&&best.s>scale/1.5&&best.s<scale*1.5?best.s:scale})();
  const left=along(bubbles,dims,hs),total=left[left.length-1];
  const reversed=arrow?arrow.reversed:axisRank(bubbles[0].name)>axisRank(bubbles[bubbles.length-1].name);
  const canon=m=>arrow?(reversed?-m:m):reversed?total-m:m;
  const u=xpt=>{let k=0;for(let i=1;i<bubbles.length;i++)if(Math.abs(bubbles[i].pt-xpt)<Math.abs(bubbles[k].pt-xpt))k=i;return Math.round(canon(left[k]+(xpt-bubbles[k].pt)*hs)/5)*5};
  const z=ypt=>Math.round((f.a+f.b*ypt)/5)*5;
  const win=3000/scale,panels=[];
  // (labels in the panels first, then those on leaders: a piece is checked against the panels of its view — its floor,
  // a panel already labelled there, the length of its position)
  for(const t of [...own.filter(t=>!t.leader),...own.filter(t=>t.leader)]){
   // A rectangle of the size the specification gives the position (either way round: a panel may lie), ±40 mm.
   const kinds=sizes.get(String(t.str).trim()),sized=kinds?rc=>{const w=(rc.r-rc.l)*hs,h=(rc.bottom-rc.top)*scale;
    return kinds.some(q=>Math.abs(q.width_mm-w)<=40&&Math.abs(q.length_mm-h)<=40||Math.abs(q.length_mm-w)<=40&&Math.abs(q.width_mm-h)<=40)}:null;
   // Of the size first: drawn round it, by its sides, by its joints and the lines across it; then the nearest outline.
   // (a label on a leader: its point, not the text's height round it — the dot sits on the piece 2–3 pt over the line of
   // the floor, ИР-71535 АР ч.2 л.6 Пс-84, Пс-88: with the height of the text the floor fell inside and the piece ran
   // down to the dimension line under it)
   const b0=textBox(t),px=b0.cx+(t.lead?t.lead.x*.8:0),py=b0.cy+(t.lead?t.lead.y*.8:0);
   const b=t.leader?{...b0,x0:px,x1:px,cx:px,y0:py,y1:py,cy:py}:b0,first=edgesAround(b,horiz,scale,slopes,sized);
   let rect=(sketch&&columnAround(b,runs,horiz,numbers,hs,scale,kinds?.[0]||null,slopes,extension))||(sized&&((first&&sized(first)?first:null)||sidesAround(b,horiz,vert,scale,sized,slopes)||sizedAround(b,vert,horiz,scale,kinds,numbers)))||
    first||sidesAround(b,horiz,vert,scale,null,slopes)||jointsAround(b,vert,horiz,numbers,win);
   if(!rect)continue
   // A label on a leader marks a piece cut on site: its column as drawn, not widened to the panel's width over a joint
   // or a hatched strip beside it (ИР-71535 АР ч.2 л.5: «по фасаду 3-1» Пс-110 of 320 beside the hatched section,
   // Пс-113 of 600 beside a strip of 180; «по ряду В, в осях 02-03» Пс-64, Пс-66 of 240 at the wall of the shop ММА;
   // л.4 «по ряду 010» Пс-39 of 490). Widened over nothing — an edge read on a dimension line (Пс-57 under a window, its
   // «880» drawn inside it) — it stays a panel.
   if(t.leader&&sketch&&rect.column&&kinds?.[0]){
    const narrow=columnAround(b,runs,horiz,numbers,hs,scale,{length_mm:kinds[0].length_mm},slopes,extension);
    if(narrow&&(narrow.l>rect.l+.3||narrow.r<rect.r-.3)){
     const [g0,g1]=narrow.l>rect.l+.3?[rect.l,narrow.l]:[narrow.r,rect.r],y0=Math.min(rect.top,narrow.top)-1,y1=Math.max(rect.bottom,narrow.bottom)+1;
     const joint=runs.some(v=>v.x>g0+.3&&v.x<g1-.3&&v.y0<=b.cy&&v.y1>=b.cy);
     const hatched=diag.filter(q=>Math.min(q.a.x,q.b.x)>=g0-.3&&Math.max(q.a.x,q.b.x)<=g1+.3&&Math.min(q.a.y,q.b.y)>=y0&&Math.max(q.a.y,q.b.y)<=y1).length>=3;
     if(joint||hatched)rect=narrow}}
   if(t.leader&&sketch&&rect.column){
    // A piece runs down no further than the floor its view's panels stand on: one side of it an extension line going on
    // to the dimensions under the view (ИР-71535 АР ч.2 л.6 «по ряду Ж» Пс-84 down to −1,730).
    const floor=panels.reduce((m,p)=>p.leader?m:Math.max(m,p.rect.bottom),-Infinity);
    if(floor>-Infinity&&rect.bottom>floor+300/scale&&(floor-rect.top)*scale>=250)rect={...rect,bottom:floor};
    // A piece wider over a step (cut round the thicker base of the wall it meets — л.6 «по ряду К», «по ряду Л» Пс-84,
    // Пс-88 270 wide under +2,000 by the concrete, some 620 over it): one side of its column ends at the step, from
    // there a line goes off the piece to the side going on up — the piece is one, to the top of that side.
    const side=x=>runs.filter(v=>Math.abs(v.x-x)<=.3&&v.y0<=b.cy&&v.y1>=b.cy).sort((p,q)=>p.y0-q.y0)[0],L=side(rect.l),R=side(rect.r);
    const short=L&&R?(L.y0>R.y0+500/scale?L:R.y0>L.y0+500/scale?R:null):null;
    if(short){const out=short===R?1:-1,x=short.x,y=short.y0;
     const step=runs.filter(v=>(v.x-x)*out>.3&&Math.abs(v.x-x)*hs<=1300&&Math.abs(v.y1-y)<=1.5&&(y-v.y0)*scale>=500&&
      horiz.some(h=>Math.abs(h.y-y)<=1&&h.x0<=Math.min(x,v.x)+1&&h.x1>=Math.max(x,v.x)-1)).sort((p,q)=>Math.abs(p.x-x)-Math.abs(q.x-x))[0];
     const l=Math.min(rect.l,step?step.x:rect.l),r=Math.max(rect.r,step?step.x:rect.r);
     if(step&&(r-l)*hs<=1300&&(rect.bottom-step.y0)*scale>=250){const {topCut,...rest}=rect;rect={...rest,l,r,top:step.y0}}}}
   const u0=u(rect.l),u1=u(rect.r);
   // (a label on a leader: a panel or a piece of one — not wider than a panel —, not one labelled of its own)
   // (a piece cut along its length: not wider than the panel, as long as its table gives it or as the panels of its
   // position in the view are drawn — «по фасаду 3-1» Пс-110 5640 against 5800 of the table)
   // (under the slope of a roof cut on site along it — л.4 «по ряду 010» Пс-45 of 690 at А, 4785 long, 4686 at its higher
   // side under the slope —: up to 300 shorter at its higher side)
   const pieceOk=q=>{const w=(rect.r-rect.l)*hs,h=(rect.bottom-Math.min(rect.top,rect.topCut?Math.min(rect.topCut.l,rect.topCut.r):rect.top))*scale,
    long=v=>Math.abs(v-q.length_mm)<=60||rect.topCut&&v<=q.length_mm+60&&v>=q.length_mm-300||panels.some(o=>!o.leader&&o.mark===String(t.str).trim()&&Math.abs(o.z1-o.z0-v)<=60);
    return w<=q.width_mm+40&&long(h)||h<=q.width_mm+40&&long(w)};
   if(t.leader&&(Math.abs(u1-u0)>1250||kinds&&!kinds.some(pieceOk)||panels.some(p=>Math.min(p.rect.r,rect.r)-Math.max(p.rect.l,rect.l)>(rect.r-rect.l)*.5&&Math.min(p.rect.bottom,rect.bottom)-Math.max(p.rect.top,rect.top)>(rect.bottom-rect.top)*.5)))continue;
   // The cut of a panel under a slope: the heights of its lower edge at the ends, in the order along the wall.
   const cut=rect.cut?(u0<=u1?[z(rect.cut.l),z(rect.cut.r)]:[z(rect.cut.r),z(rect.cut.l)]):null;
   // (the top under a slope: its heights at the ends, in the order along the wall)
   const topCut=rect.topCut?(u0<=u1?[z(rect.topCut.l),z(rect.topCut.r)]:[z(rect.topCut.r),z(rect.topCut.l)]):null;
   panels.push({...(t.cands?{cands:t.cands}:{}),...(t.leader?{leader:true}:{}),mark:String(t.str).trim(),u0:Math.min(u0,u1),u1:Math.max(u0,u1),z0:z(rect.bottom),z1:z(rect.top),...(cut?{cut}:{}),...(topCut?{top:topCut}:{}),pt:{x:Math.round(b.cx),y:Math.round(b.cy)},rect})
  }
  // (a layout by sketches: a label of another view over this row — «по фасаду 3-1» beside «по ряду К, в осях 01-03»,
  // ИР-71535 АР ч.2 л.5 — lies off its axes, past the 3 m a wall runs on beyond its last axis)
  if(sketch)for(let i=panels.length-1;i>=0;i--)if(panels[i].u1<-3000||panels[i].u0>total+3000)panels.splice(i,1);
  if(!panels.length)continue;
  // A panel of a layout by columns is as long as its position says (its height on the facade): a view drawn lower than
  // its length, with a break under the wall (ГПЭС ряд Ж: «+0,300» 47 pt under the foot), keeps the top as its level mark
  // gives it and the length of its table.
  if(spec.some(p=>p.layout))for(const p of panels){const q=(sizes.get(p.mark)||[])[0];if(q&&q.length_mm&&Math.abs(p.z1-p.z0-q.length_mm)>100&&!p.cut){p.z0=p.z1-q.length_mm;p.lengthFromTable=true}}
  // A layout by columns read by OCR loses labels: a field between two joints that run the whole height of a band of its
  // labelled panels, of their width, is one of them — of the position of the nearest labelled panel of that band and of
  // its size (the engineer: «все 100% должен показывать»).
  if(spec.some(p=>p.layout)){
   // (a label two positions share, «Ø380» of «С380» and «Р380»: the one whose panels read whole are of its colour)
   for(const p of panels.filter(q=>q.cands)){const col=colourOf(p.rect);if(!col)continue;
    const hit=p.cands.filter(c=>panels.some(o=>!o.cands&&o.mark===c&&colourOf(o.rect)===col));if(hit.length===1)p.mark=hit[0]}
   const bands=new Map();for(const p of panels){const k=Math.round(p.rect.top)+":"+Math.round(p.rect.bottom);if(!bands.has(k))bands.set(k,[]);bands.get(k).push(p)}
   for(const list of bands.values()){
    const {top,bottom}=list[0].rect,h=bottom-top,mod=list.map(p=>p.rect.r-p.rect.l).sort((a,b)=>a-b)[list.length>>1];
    const full=[...new Set(vert.filter(v=>v.y0<=top+1.5&&v.y1>=bottom-1.5).map(v=>Math.round(v.x*2)/2))].sort((a,b)=>a-b);
    const lo=Math.min(...list.map(p=>p.rect.l))-mod*40,hi=Math.max(...list.map(p=>p.rect.r))+mod*40;
    // (the hatching of a coloured panel runs its whole height too: a field is two such lines a panel's width apart)
    const pairs=[];for(const l of full){const r=full.filter(x=>Math.abs(x-l-mod)<=40/hs).sort((a,b)=>Math.abs(a-l-mod)-Math.abs(b-l-mod))[0];if(r!==undefined)pairs.push([l,r])}
    for(const [l,r] of pairs){
     if(l<lo||r>hi)continue;
     if(panels.some(p=>p.rect.l<r-1&&p.rect.r>l+1&&p.rect.top<bottom-1&&p.rect.bottom>top+1))continue;
     // (its lower edge is the band's: no edge of a shorter panel just above it — «С372» beside «Р380»)
     const across=y=>horiz.some(hh=>Math.abs(hh.y-y)<1&&hh.x0<=l+(r-l)*.1&&hh.x1>=r-(r-l)*.1);
     if(!across(bottom)||!across(top)||horiz.some(hh=>hh.y<bottom-1&&hh.y>bottom-150/scale&&hh.x0<=l+(r-l)*.1&&hh.x1>=r-(r-l)*.1))continue;
     const col=colourOf({l,r,top,bottom}),same=list.filter(p=>!p.byJoints&&col&&colourOf(p.rect)===col);
     // (of another colour than the labelled panels of its band: a labelled panel of its colour and height elsewhere in the
     // view; none — not guessed)
     const other=!same.length&&col?panels.filter(p=>!p.byJoints&&Math.abs((p.rect.bottom-p.rect.top)-h)*scale<=40&&colourOf(p.rect)===col):[];
     if(col&&!same.length&&!other.length)continue;
     const near=(same.length?same:other.length?other:list.filter(p=>!p.byJoints)).slice().sort((a,b)=>Math.abs((a.rect.l+a.rect.r)/2-(l+r)/2)-Math.abs((b.rect.l+b.rect.r)/2-(l+r)/2))[0];
     const rect={l,r,top,bottom},u0=u(l),u1=u(r);
     panels.push({mark:near.mark,u0:Math.min(u0,u1),u1:Math.max(u0,u1),z0:near.lengthFromTable?near.z0:z(bottom),z1:near.lengthFromTable?near.z1:z(top),pt:{x:Math.round((l+r)/2),y:Math.round((top+bottom)/2)},rect,byJoints:true});
     list.push(panels[panels.length-1])
    }
   }
  }
  const axes=bubbles.map((bb,i)=>({name:bb.name,mm:canon(left[i])})).sort((a,b)=>a.mm-b.mm);
  // A view under a title of a section («4-4») is a cut through the building (partitions, barriers), not a facade.
  const top=Math.min(...own.map(t=>t.y)),cut=texts.filter(t=>horizontalText(t)&&/^(\d{1,2}|[А-ЯЁ])\s*[-–—]\s*\1$/u.test(String(t.str).trim())&&t.y<top&&top-t.y<220&&t.x>=row.x0-260&&t.x<=row.x1+260).sort((a,b)=>b.y-a.y)[0];
  // (its title: the row its wall stands on — «по ряду 08», «по ряду К, в осях 03-02»; «по фасаду 3-1», «в нише въезда»
  // name none)
  const title=viewTitle(texts,row,Math.min(...panels.map(p=>p.rect.top))),wallRow=title?titleRow(title.str):null;
  views.push({axes,numbered:numbered(bubbles[0].name),reversed,...(cut?{section:String(cut.str).replace(/\s+/g,"")}:{}),scaleMmPerPt:Math.round(scale*1000)/1000,
   ...(title?{title:String(title.str).replace(/\s+/g," ").trim()}:{}),...(wallRow?{row:wallRow}:{}),
   bbox:{x0:row.x0-260,x1:row.x1+260,y1:row.y},levels:[...new Set(levels.map(l=>l.mm))].sort((a,b)=>a-b),
   ...(()=>{let openings=noteLevels(openingRects(panels,vert,horiz,scale,u,z,numbers,region,ticks),texts,segments);
    // (a layout's wall whose foot follows a slope — ГПЭС ряд Ж, +5,260 at the ends, +5,950 in the middle —: what lies under
    // its panels down to the lowest foot is the slope, not openings)
    if(spec.some(p=>p.layout)){const col=new Map();for(const p of panels){const k=Math.round(p.u0/100);col.set(k,Math.min(col.get(k)??Infinity,p.z0))}
     const feet=[...col.values()],lo=Math.min(...feet);if(feet.filter(f=>f>lo+50).length>feet.length/2){const foot=z(Math.max(...panels.map(p=>p.rect.bottom)));openings=openings.filter(o=>o.z0>foot+5)}}
    openings=openings.map(({at,...o})=>o);
    return{panels:holesOf(panels.map(({rect,...p})=>p),openings),openings}})(),unplaced:own.length-panels.filter(p=>!p.byJoints).length})
 }
 // A piece of a wall drawn on beyond its view (row 010: «М», «Н» a little lower than «А»…«Л», ИР-71535 АР ч.2 л.4) is
 // of the view titled beside it, at the height of its bubbles, of the same kind and with axes of its own.
 for(const v of views)if(!v.title){const o=views.find(w=>w!==v&&w.title&&w.numbered===v.numbered&&Math.abs(w.bbox.y1-v.bbox.y1)<=40&&!w.axes.some(a=>v.axes.some(b=>b.name===a.name)));
  if(o){v.title=o.title;if(o.row)v.row=o.row}}
 return views
}
// Windows, doors and gates on the facades («ОК-1», «Д-7», «В-1» at each of them): every label with the rectangles
// drawn near it (a top and a bottom of one extent and the sides between them), in the frame of its view; the plan picks
// the one of the size of the block its table gives.
const FILL=/^(ОК|Д|В|ВР|ДВ)-(\d{1,3}[а-я]?)$/u;
// The rows of bubbles of facades. A facade of the extension drawn on with the end of the building beside it shows both
// in one row (ИР-71535 АР ч.1 л.15 «Фасад 01-010»: «А Е К» of the old building, then «О1 … О10»; an axis of the old one
// in between, «О1/2», out of the order): the run of numbers or of letters of four and more, in their order along the
// row without the few that break it, is a row of its own.
function facadeRows(texts,segments){
 const ok=axisRows(texts,segments),out=[...ok];
 for(const r of bubbleRows(texts,segments)){
  if(ok.includes(r))continue;
  const items=r.items.slice().sort((a,b)=>a.x-b.x),runs=[];
  for(const t of items){const k=numbered(String(t.str).trim());if(!runs.length||runs[runs.length-1].k!==k)runs.push({k,list:[]});runs[runs.length-1].list.push(t)}
  for(const run of runs){
   if(run.list.length<4)continue;
   const rank=run.list.map(t=>axisRank(String(t.str).trim().toUpperCase()));
   // the longest run in order (up or down) of the row; of two as long, the one with fewer axes «1/2» (of the old building)
   let best=[],bestW=0;const wt=rank.map(v=>Number.isInteger(v)?1:.99);
   for(const dir of [1,-1]){const len=wt.slice(),prev=rank.map(()=>-1);
    for(let i=0;i<rank.length;i++)for(let j=0;j<i;j++)if(dir*(rank[i]-rank[j])>0&&len[j]+wt[i]>len[i]+1e-9){len[i]=len[j]+wt[i];prev[i]=j}
    let i=len.indexOf(Math.max(...len));const keep=[],w=len[i];while(i>=0){keep.unshift(run.list[i]);i=prev[i]}
    if(w>bestW+1e-9){best=keep;bestW=w}}
   const names=best.map(t=>String(t.str).trim().toUpperCase());
   if(best.length<4||best.length<run.list.length*.8||new Set(names).size!==names.length)continue;
   const x0=Math.min(...best.map(t=>t.x)),x1=Math.max(...best.map(t=>t.x));
   out.push({...r,items:best,x0,x1,x:(x0+x1)/2})
  }
 }
 return out
}
function fillViews({segments=[],texts=[]}={}){
 const inTable=t=>texts.some(o=>o!==t&&Math.abs(o.y-t.y)<3&&o.x>t.x&&o.x<t.x+520&&/ГОСТ|\d{3,5}\s*[хx×-]\s*\d{3,5}/u.test(String(o.str)));
 const labels=texts.filter(t=>horizontalText(t)&&FILL.test(String(t.str).trim())&&!inTable(t));
 if(labels.length<3)return[];
 const rows=facadeRows(texts,segments);if(!rows.length)return[];
 const owner=ownerOf(rows);
 const box=labels.map(textBox),near=(x,y,d)=>box.some(b=>Math.abs(b.cx-x)<d&&Math.abs(b.cy-y)<d);
 const horiz=[],vert=[],lines=[];
 for(const s of segments){
  const dx=Math.abs(s.a.x-s.b.x),dy=Math.abs(s.a.y-s.b.y);
  if(dy<=.3&&dx>=3)lines.push({y:(s.a.y+s.b.y)/2,x0:Math.min(s.a.x,s.b.x),x1:Math.max(s.a.x,s.b.x)});
  if(dy<=.3&&dx>=8&&near((s.a.x+s.b.x)/2,s.a.y,360))horiz.push({y:(s.a.y+s.b.y)/2,x0:Math.min(s.a.x,s.b.x),x1:Math.max(s.a.x,s.b.x)});
  else if(dx<=.3&&dy>=8&&near(s.a.x,(s.a.y+s.b.y)/2,360))vert.push({x:(s.a.x+s.b.x)/2,y0:Math.min(s.a.y,s.b.y),y1:Math.max(s.a.y,s.b.y)})
 }
 const found=[];
 for(const row of rows){
  const own=labels.filter(t=>{const b=textBox(t);return owner(b.cx,b.cy)===row});
  if(!own.length)continue;
  const region=texts.filter(t=>{const b=textBox(t);return owner(b.cx,b.cy)===row});
  const levels=region.filter(horizontalText).map(t=>({mm:levelOf(t.str),y:t.y,x:t.x,w:t.width||0})).filter(l=>l.mm!==null);
  const offset=levelOffset(levels,lines);levels.forEach(l=>{l.y+=offset});
  found.push({row,own,region,levels,f:fit(levels)})
 }
 const sure=found.filter(v=>v.f).map(v=>v.f.b).sort((x,y)=>x-y),views=[];
 for(const v of found){
  const {row,own,region,levels}=v,f=v.f||(sure.length?fit(levels,sure[sure.length>>1]):null);if(!f)continue;
  const scale=Math.abs(f.b);
  const bubbles=row.items.map(t=>({name:String(t.str).trim().toUpperCase(),pt:t.x+(t.width||0)/2})).sort((a,b)=>a.pt-b.pt);
  if(new Set(bubbles.map(b=>b.name)).size!==bubbles.length||new Set(bubbles.map(b=>numbered(b.name))).size!==1)continue;
  // (a bubble «010» read as plain text is no dimension)
  const dims=region.filter(t=>/^[1-9]\d{2,4}$/.test(String(t.str).trim())).map(t=>Number(t.str));
  if(dims.length&&!sameScale(bubbles,dims,scale))continue;
  const left=along(bubbles,dims,scale),total=left[left.length-1];
  const reversed=axisRank(bubbles[0].name)>axisRank(bubbles[bubbles.length-1].name),canon=m=>reversed?total-m:m;
  const u=xpt=>{let k=0;for(let i=1;i<bubbles.length;i++)if(Math.abs(bubbles[i].pt-xpt)<Math.abs(bubbles[k].pt-xpt))k=i;return Math.round(canon(left[k]+(xpt-bubbles[k].pt)*scale)/5)*5};
  const z=ypt=>Math.round((f.a+f.b*ypt)/5)*5;
  // (a gate 10740×10930 has its label at its foot, a strip of windows 19200 long — ИР-71535 АР ч.1 л.15, 17)
  const reach=4000/scale,up=12000/scale,fills=[];
  for(const t of own){
   const b=box[labels.indexOf(t)],hs=horiz.filter(h=>Math.abs(h.y-b.cy)<up&&h.x1>b.cx-reach&&h.x0<b.cx+reach&&(h.x1-h.x0)*scale>=400&&(h.x1-h.x0)*scale<=20000);
   // A side down from the top to the bottom; a railing or a stair drawn in front may break it for a fifth of its height.
   const side=(x,top,bottom)=>{let need=top,gap=0;for(const q of vert.filter(q=>Math.abs(q.x-x)<=.6&&q.y1>top&&q.y0<bottom).sort((p,q)=>p.y0-q.y0)){if(q.y0>need+1)gap+=q.y0-need;need=Math.max(need,q.y1)}
    return gap+Math.max(0,bottom-need)<=(bottom-top)*.2};
   const rects=[];
   for(let i=0;i<hs.length;i++)for(let j=0;j<hs.length;j++){
    // The top and the bottom of one extent, or one of them a part of a longer line (a gate behind a platform stands on
    // its deck, a window under the line of a canopy).
    const a=hs[i],c=hs[j],h=(c.y-a.y)*scale;if(h<400||h>12000)continue;
    const same=Math.abs(a.x0-c.x0)<=.6&&Math.abs(a.x1-c.x1)<=.6,n=same?a:c.x0<=a.x0+.6&&c.x1>=a.x1-.6?a:a.x0<=c.x0+.6&&a.x1>=c.x1-.6?c:null;if(!n)continue;
    if(rects.some(r=>Math.abs(r.l-n.x0)<.3&&Math.abs(r.r-n.x1)<.3&&Math.abs(r.top-a.y)<.3&&Math.abs(r.bottom-c.y)<.3))continue;
    if(!side(n.x0,a.y,c.y)||!side(n.x1,a.y,c.y))continue;
    // (a rectangle round the label of another block is no block: windows one over another and the lines between them)
    if(box.some(o=>o!==b&&o.cx>n.x0+.5&&o.cx<n.x1-.5&&o.cy>a.y+.5&&o.cy<c.y-.5))continue;
    const dx=Math.max(0,n.x0-b.cx,b.cx-n.x1),dy=Math.max(0,a.y-b.cy,b.cy-c.y);
    rects.push({l:n.x0,r:n.x1,top:a.y,bottom:c.y,d:Math.hypot(dx,dy)+(same?0:.5)})
   }
   rects.sort((p,q)=>p.d-q.d);
   fills.push({mark:String(t.str).trim(),u:u(b.cx),z:z(b.cy),rects:rects.slice(0,60).map(r=>{const p=u(r.l),q=u(r.r);return[Math.min(p,q),Math.max(p,q),z(r.bottom),z(r.top)]})})
  }
  views.push({axes:bubbles.map((bb,i)=>({name:bb.name,mm:canon(left[i])})).sort((a,b)=>a.mm-b.mm),numbered:numbered(bubbles[0].name),reversed,scaleMmPerPt:Math.round(scale*1000)/1000,fills})
 }
 return views
}
// Schemes of the blocks over their tables, drawn as on the facade (from outside): the block «ОК-3» is the rectangle of
// its proportions under its label. Inside it a window's fields (a pane in the frame; a sash — a second rectangle in its
// field); the joints of the leaves of a door or a gate (lines over its height); a wicket (a rectangle on the foot of a
// leaf); the glass of a door (a rectangle with the strokes of glass). The lines of a sash meet at the side it opens
// from: at its handle (turn — hinged at the other side), at the top (tilt — hinged at its foot); both — «ПОТ» (ГОСТ
// 23166: «с поворотом створки вокруг вертикальной и нижней крайних осей»). Millimetres from the lower left corner of
// the block as drawn. The engineer, 27.10.2026: «Окна и ворота сделай в 3д нормальное отображение».
function fillSketches({segments=[],texts=[]}={},fills=[]){
 const want=new Map(fills.filter(f=>f.width_mm&&f.height_mm).map(f=>[f.pos,f]));
 const labels=texts.filter(t=>horizontalText(t)&&want.has(String(t.str).trim())&&!rowOf(texts,t,480).some(o=>/ГОСТ|\d{3,5}\s*[хx×-]\s*\d{3,5}/u.test(String(o.str))));
 if(!labels.length)return;
 const H=[],V=[],D=[];
 for(const s of segments){
  const dx=Math.abs(s.a.x-s.b.x),dy=Math.abs(s.a.y-s.b.y);
  if(dy<=.3&&dx>=2)H.push({y:(s.a.y+s.b.y)/2,x0:Math.min(s.a.x,s.b.x),x1:Math.max(s.a.x,s.b.x)});
  else if(dx<=.3&&dy>=2)V.push({x:(s.a.x+s.b.x)/2,y0:Math.min(s.a.y,s.b.y),y1:Math.max(s.a.y,s.b.y)});
  else if(dx>.4&&dy>.4)D.push(s)
 }
 // Rectangles: two upright lines and the outermost lines across both of them, each side one unbroken line; the glass of
 // a door — from a corner for 80 % of it at least (a handle drawn over a leaf breaks its lines).
 const cover=(list,a,b,part)=>{
  const runs=[];for(const q of list.slice().sort((p,q)=>p[0]-q[0])){const r=runs[runs.length-1];if(r&&q[0]<=r[1]+.8)r[1]=Math.max(r[1],q[1]);else runs.push(q.slice())}
  let best=0;for(const r of runs){if(r[0]>a+.8&&r[1]<b-.8)continue;if(!part&&(r[0]>a+.8||r[1]<b-.8))continue;const lo=Math.max(a,r[0]),hi=Math.min(b,r[1]);if(hi>lo)best=Math.max(best,(hi-lo)/(b-a))}
  return part?best:best>=.99?1:0
 };
 const rectsIn=(x0,x1,y0,y1,part=false)=>{
  const vs=V.filter(v=>v.x>=x0&&v.x<=x1&&v.y1>=y0&&v.y0<=y1&&v.y1-v.y0>=4),ys=new Map(),xs=new Map(),key=v=>Math.round(v*3)/3,out=[];
  for(const v of vs){const k=key(v.x);if(!xs.has(k))xs.set(k,[]);xs.get(k).push([v.y0,v.y1])}
  for(const h of H)if(h.y>=y0&&h.y<=y1&&h.x1>=x0&&h.x0<=x1){const k=key(h.y);if(!ys.has(k))ys.set(k,[]);ys.get(k).push([h.x0,h.x1])}
  for(const a of vs)for(const b of vs){
   if(b.x-a.x<3||Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)<4)continue;
   const lo=Math.min(a.y0,b.y0)-.8,hi=Math.max(a.y1,b.y1)+.8,across=[...ys.keys()].filter(y=>y>=lo&&y<=hi&&cover(ys.get(y),a.x,b.x,part)>=.8);if(across.length<2)continue;
   const t=Math.min(...across),u=Math.max(...across);if(u-t<4)continue;
   if(cover(xs.get(key(a.x)),t,u,part)<.8||cover(xs.get(key(b.x)),t,u,part)<.8)continue;
   if(!out.some(r=>Math.abs(r.l-a.x)<.3&&Math.abs(r.r-b.x)<.3&&Math.abs(r.t-t)<.3&&Math.abs(r.b-u)<.3))out.push({l:a.x,r:b.x,t,b:u})
  }
  return out
 };
 const inside=(r,q,e=.4)=>r!==q&&r.l>=q.l-e&&r.r<=q.r+e&&r.t>=q.t-e&&r.b<=q.b+e;
 // The strokes along a line from p to q: their length over its length.
 const along=(p,q,box)=>{
  const L=Math.hypot(q.x-p.x,q.y-p.y),ux=(q.x-p.x)/L,uy=(q.y-p.y)/L,tol=Math.max(.8,.04*Math.min(box.r-box.l,box.b-box.t));let sum=0;
  for(const s of D){
   const off=[s.a,s.b].map(e=>Math.abs((e.x-p.x)*uy-(e.y-p.y)*ux)),at=[s.a,s.b].map(e=>((e.x-p.x)*ux+(e.y-p.y)*uy)/L);
   if(off[0]<=tol&&off[1]<=tol&&Math.min(...at)>=-.05&&Math.max(...at)<=1.05)sum+=Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y)
  }
  return sum/L
 };
 for(const t of labels){
  const f=want.get(String(t.str).trim());if(f.sketch)continue;
  const b=textBox(t),aspect=f.width_mm/f.height_mm;
  const all=rectsIn(b.cx-420,b.cx+420,b.cy-4,b.cy+520);
  const blocks=all.filter(r=>r.t>b.cy&&r.t-b.cy<(r.b-r.t)*.9+90&&b.cx>=r.l-10&&b.cx<=r.r+10&&Math.abs((r.r-r.l)/(r.b-r.t)/aspect-1)<=.04)
   .sort((p,q)=>Math.abs((p.r-p.l)/(p.b-p.t)/aspect-1)-Math.abs((q.r-q.l)/(q.b-q.t)/aspect-1)||(q.r-q.l)*(q.b-q.t)-(p.r-p.l)*(p.b-p.t));
  const B=blocks[0];if(!B)continue;
  const w=B.r-B.l,h=B.b-B.t,mmU=x=>Math.round((x-B.l)/w*f.width_mm/5)*5,mmZ=y=>Math.round((B.b-y)/h*f.height_mm/5)*5;
  const box=r=>[mmU(r.l),mmU(r.r),mmZ(r.b),mmZ(r.t)];
  const own=all.filter(r=>inside(r,B)&&!(r.r-r.l>=.95*w&&r.b-r.t>=.9*h));
  const sketch={};
  if(f.kind==="window"){
   let fields=own.filter(r=>r.r-r.l>=.08*w&&r.b-r.t>=.2*h);fields=fields.filter(r=>!fields.some(q=>inside(r,q)));
   // A transom: a pair of lines across the whole field.
   fields=fields.flatMap(r=>{
    const cut=H.filter(l=>l.x0<=r.l+.03*(r.r-r.l)&&l.x1>=r.r-.03*(r.r-r.l)&&l.y>r.t+.08*(r.b-r.t)&&l.y<r.b-.08*(r.b-r.t)).map(l=>l.y).sort((p,q)=>p-q);
    if(!cut.length)return[r];const out=[];let top=r.t;
    for(let i=0;i<cut.length;){let j=i;while(j+1<cut.length&&cut[j+1]-cut[j]<6)j++;out.push({l:r.l,r:r.r,t:top,b:cut[i]});top=cut[j];i=j+1}
    out.push({l:r.l,r:r.r,t:top,b:r.b});return out.filter(q=>q.b-q.t>=4)
   });
   fields=fields.filter(r=>!fields.some(q=>q!==r&&inside(q,r,.3)));
   // Fields over each other are not read (the lines of a frame behind a glazing drawn over it).
   if(!fields.length||fields.some(r=>fields.some(q=>q!==r&&Math.min(r.r,q.r)-Math.max(r.l,q.l)>1&&Math.min(r.b,q.b)-Math.max(r.t,q.t)>1)))continue;
   sketch.fields=fields.sort((p,q)=>p.l-q.l||q.t-p.t).map(r=>{
    const inner=own.filter(q=>inside(q,r)&&q.r-q.l>=.6*(r.r-r.l)).sort((p,q)=>(p.r-p.l)-(q.r-q.l))[0]||r,g=inner;
    const mid={x:(g.l+g.r)/2,y:(g.t+g.b)/2},meets=(p1,p2,q)=>along(p1,q,g)>=.25&&along(p2,q,g)>=.25;
    const right=meets({x:g.l,y:g.t},{x:g.l,y:g.b},{x:g.r,y:mid.y}),left=meets({x:g.r,y:g.t},{x:g.r,y:g.b},{x:g.l,y:mid.y});
    const top=meets({x:g.l,y:g.b},{x:g.r,y:g.b},{x:mid.x,y:g.t}),foot=meets({x:g.l,y:g.t},{x:g.r,y:g.t},{x:mid.x,y:g.b});
    const turn=right?"right":left?"left":"",open=turn&&top?"ПОТ":turn?"ПР":top?"ОТ":foot?"П":"";
    const [u0,u1,z0,z1]=box(r);
    return{u:[u0,u1],z:[z0,z1],sash:Boolean(open)||inner!==r&&inner.l-r.l>=.5&&r.r-inner.r>=.5&&inner.t-r.t>=.5&&r.b-inner.b>=.5,...(open?{open,handle:turn||(top?"top":"bottom")}:{})}
   })
  }
  else{
   const joints=[];
   for(const v of V.filter(v=>v.x>B.l+.08*w&&v.x<B.r-.08*w&&v.y0<=B.t+.15*h&&v.y1>=B.b-.15*h&&v.y1-v.y0>=.8*h).sort((p,q)=>p.x-q.x)){
    const last=joints[joints.length-1];if(last&&v.x-last.x1<=3)last.x1=v.x;else joints.push({x0:v.x,x1:v.x})
   }
   if(joints.length)sketch.joints=joints.map(j=>mmU((j.x0+j.x1)/2));
   const wicket=f.kind==="gate"&&own.filter(r=>r.b-r.t>=.3*h&&r.b-r.t<=.85*h&&r.r-r.l>=.12*w&&r.r-r.l<=.45*w&&B.b-r.b<=.08*h).sort((p,q)=>(q.r-q.l)*(q.b-q.t)-(p.r-p.l)*(p.b-p.t))[0];
   if(wicket)sketch.wicket=box(wicket);
   // Glass: a rectangle with the strokes of glass inside it (short parallel strokes, not across it).
   const loose=rectsIn(B.l-1,B.r+1,B.t-1,B.b+1,true).filter(r=>inside(r,B)&&!(r.r-r.l>=.95*w&&r.b-r.t>=.9*h));
   // Glass: a rectangle with its mark inside — two or three short strokes side by side (not the dashes of one line).
   const strokes=r=>D.filter(s=>Math.min(s.a.x,s.b.x)>=r.l-.5&&Math.max(s.a.x,s.b.x)<=r.r+.5&&Math.min(s.a.y,s.b.y)>=r.t-.5&&Math.max(s.a.y,s.b.y)<=r.b+.5&&Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y)>=2&&Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y)<.6*Math.max(r.r-r.l,r.b-r.t));
   const marked=r=>{const list=strokes(r);return list.some((s,i)=>list.some((q,k)=>{if(k<=i)return false;
    const L1=Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y),L2=Math.hypot(q.b.x-q.a.x,q.b.y-q.a.y),ux=(s.b.x-s.a.x)/L1,uy=(s.b.y-s.a.y)/L1;
    if(Math.abs(ux*(q.b.y-q.a.y)-uy*(q.b.x-q.a.x))/L2>.09||Math.min(L1,L2)/Math.max(L1,L2)<.4)return false;
    const off=Math.abs((q.a.x-s.a.x)*uy-(q.a.y-s.a.y)*ux),c=((q.a.x+q.b.x)/2-s.a.x)*ux+((q.a.y+q.b.y)/2-s.a.y)*uy;
    return off>=.8&&off<=5&&c>-.2*L1&&c<1.2*L1}))};
   const glass=loose.filter(r=>r!==wicket&&r.r-r.l>=.1*w&&r.b-r.t>=.1*h&&marked(r));
   const panes=glass.filter(r=>!glass.some(q=>inside(q,r)));
   if(panes.length)sketch.panes=panes.sort((p,q)=>p.l-q.l||q.b-p.b).map(box)
  }
  f.sketch=sketch
 }
}
// The finish of the facade («Ведомость отделки фасада»): the colour of window profiles («Окна | Профиль ПВХ | Белый»),
// of gates and doors («Ворота, двери | Стальные с полимерным покрытием | RAL 7047»).
const COLOUR_WORD=/^(бел|сер|черн|чёрн|коричн|графит|антрацит|серебр)[а-яё]*$/iu;
function facadeFinish(texts){
 const titles=texts.filter(t=>/Ведомость отделки фасада/iu.test(String(t.str)));if(!titles.length)return[];
 const out=[];
 for(const p of texts){
  const s=String(p.str).trim();if(!horizontalText(p)||!/^(окна|окон|витраж|ворота|двер)/iu.test(s)||s.length>40)continue;
  if(!titles.some(t=>t.y<p.y&&p.y-t.y<500&&p.x>=t.x-220&&p.x<t.x+500))continue;
  const what=[...(/окн|окон|витраж/iu.test(s)?["window"]:[]),...(/ворот/iu.test(s)?["gate"]:[]),...(/двер/iu.test(s)?["door"]:[])];
  const row=texts.filter(o=>o!==p&&Math.abs(o.y-p.y)<9&&o.x>p.x&&o.x<p.x+450).sort((a,b)=>a.x-b.x);
  const ral=row.flatMap(o=>ralCodes(o.str))[0],word=row.map(o=>String(o.str).trim()).find(x=>COLOUR_WORD.test(x));
  if(ral||word)out.push({what,...(ral?{ral}:{colour:word.toLowerCase()})})
 }
 return out
}
// The sills under the windows («Спецификация отливов»: «Отлив из оцинкованной стали … (RAL9003)») and the window
// boards («ПД-1 | ГОСТ 30673-2015 | 7 | 250х1820»: its depth and length).
function sillSpec(texts){
 const out={},title=texts.find(t=>/Спецификация отливов/iu.test(String(t.str)));
 if(title){const own=texts.filter(t=>t.y>title.y&&t.y<title.y+200&&Math.abs(t.x-title.x)<300&&/отлив|RAL/iu.test(String(t.str)));
  const ral=own.flatMap(t=>ralCodes(t.str))[0];if(ral)out.sill_ral=ral}
 const boards=[];
 for(const p of texts){
  if(!/^ПД-\d{1,3}$/u.test(String(p.str).trim())||!horizontalText(p))continue;
  const m=rowOf(texts,p,520).map(o=>/^(\d{2,3})\s*[хx×]\s*(\d{3,5})$/u.exec(String(o.str).trim())).find(Boolean);
  if(m)boards.push({pos:String(p.str).trim(),depth_mm:Number(m[1]),length_mm:Number(m[2])})
 }
 if(boards.length)out.boards=boards;
 return out
}
// The axes of a plan of the АР, both ways: rows of bubbles (their places along the sheet — the axes across it) and
// columns (their heights). A plan may show beside the new grid the axes of a building it adjoins (ИР-71535 АР ч.1 л.10:
// the shop ММА, «1»…«3» in a column at the left edge across our «01»…«010», «А»…«К/1» in the row of ours): src/ai-montage-
// plan.js puts them on the grid by the axes of the grid on the same plan. A name twice in a line is no axis of it.
function planAxes({segments=[],texts=[]}={}){
 if(!texts.some(t=>horizontalText(t)&&/^\s*Планы?\s/u.test(String(t.str))))return null;
 // (the bubbles of the axes are written larger than the numbers of the rooms in circles — 12.9 against 10.7 pt on л.10)
 const all=bubbleRows(texts,segments,1,true).flatMap(r=>r.items).filter(t=>t.ring),sizes=all.map(t=>t.size||0).sort((a,b)=>b-a),big=sizes[0]||0;
 const items=all.filter(t=>(t.size||0)>=big*.92);
 const lines=key=>{const out=[];for(const t of items.slice().sort((a,b)=>a.ring[key]-b.ring[key])){const l=out.find(o=>Math.abs(o.at-t.ring[key])<=3);if(l)l.items.push(t);else out.push({at:t.ring[key],items:[t]})}
  return out.map(l=>{const n=new Map();for(const t of l.items)n.set(t.str,(n.get(t.str)||0)+1);
   const own=l.items.filter(t=>n.get(t.str)===1);return{at:Math.round(l.at*10)/10,items:own.map(t=>({name:String(t.str).trim().toUpperCase(),pt:Math.round((key==="y"?t.ring.x:t.ring.y)*10)/10}))}}).filter(l=>l.items.length>=4)};
 const rows=lines("y"),cols=lines("x");
 return rows.length&&cols.length?{rows,cols}:null
}
// The trims of the cladding (нащельники, фасонные элементы — ИР-71535 АР ч.2 л.14–18, ч.1 л.12–14): the table
// «Спецификация к схемам расположения элементов» (поз., the sheet «БТ-ПН-О-0,5 х 500 х 2000» they are bent of, the
// number of pieces) and the labels «Поз. 32 Угловой элемент из оцинкованной кровельной стали» of the nodes — the name
// of a position, on whichever sheet its node is drawn. The kind by the name: corner, отлив, накрывка, откос, joint
// (нащельник, стыковочный элемент), gutter.
function trimKind(name){const s=String(name||"").toLowerCase();
 return/желоб|ж[её]лоб/u.test(s)?(/обрамлени/u.test(s)?"gutter_trim":"gutter"):/углов/u.test(s)?"corner":/накрывк/u.test(s)?(/парапет|парпет/u.test(s)?"parapet":"cap"):
  /откос/u.test(s)?"reveal":/отлив/u.test(s)?"sill":/стыковоч/u.test(s)?"joint":/нащельник|фасонн/u.test(s)?"joint":/костыл|опорн\S*\s+элемент/u.test(s)?"support":null}
function trimSpec(texts){
 const flat=texts.filter(t=>Math.abs(t.angle||0)<10),names=[];
 for(const t of flat){const m=/^Поз\s*\.?\s*(\d{1,3})\s*([а-яa]?)(?![\d])\s*(.*)$/u.exec(String(t.str).trim());if(!m)continue;
  let rest=m[3].replace(/^[,\s]+/,"").trim(),pos=m[1]+m[2];
  // (its name a text of its own on the line right after it: «Поз . 4» · «1 Нащельник…»)
  if(!rest){const nx=flat.find(q=>q!==t&&Math.abs(q.y-t.y)<2&&q.x>=t.x+(t.width||0)-1&&q.x-t.x-(t.width||0)<8);if(nx)rest=String(nx.str).trim()}
  // («Поз . 4» with «1 Нащельник…», «Поз . 5» with «а Угловой…»: the number read apart from its last sign)
  const tail=/^(\d|а)(?:\s+(?=[А-ЯЁ,(])|$)/u.exec(rest);if(tail&&!m[2]){pos+=tail[1];rest=rest.slice(tail[0].length).replace(/^[,\s]+/,"")}
  if(!/[а-яё]{3}/iu.test(rest)){const nx=flat.filter(q=>q!==t&&q.y>t.y&&q.y-t.y<16&&q.x>=t.x-60&&q.x<=t.x+(t.width||40)).sort((p,q)=>p.y-q.y)[0];rest=nx?String(nx.str).replace(/^[,\s]+/,"").trim():""}
  // (insulation laid with it — «( по периметру желоба ) ППС 35» — is no trim)
  if(/ППС|утеплител|минеральн|вата/iu.test(rest)||/^\(/u.test(rest))continue;
  if(/[а-яё]{3}/iu.test(rest)&&trimKind(rest))names.push({pos,name:rest.replace(/\s+/g," ").replace(/\s*,\s*$/,"").slice(0,120)})}
 const out=[],title=flat.find(t=>/Спецификация\s+к\s+схемам\s+расположения\s+элементов/iu.test(String(t.str)));
 if(title){const T=flat.filter(t=>t.x>title.x-300&&t.x<title.x+700&&t.y>title.y&&t.y<title.y+700).sort((p,q)=>p.y-q.y||p.x-q.x);
  const rows=[];for(const t of T){let r=rows.find(r=>Math.abs(r.y-t.y)<3.5);if(!r)rows.push(r={y:t.y,c:[]});r.c.push(t)}
  rows.forEach(r=>r.c.sort((p,q)=>p.x-q.x));
  const kol=T.find(t=>/^Кол\.?$/u.test(String(t.str).trim()));
  for(let i=0;i<rows.length;i++){const c=rows[i].c.map(t=>String(t.str).trim());if(!/^\d{1,3}[а-яa]?$/u.test(c[0]||""))continue;
   const u=c.findIndex(v=>/^(?:шт|п\.?\s*м)\.?$/u.test(v));if(u<1)continue;
   // (the number in the column «Кол.», not the mass of a piece after it: «277,0 · 3,06 · п.м.»)
   const cells=rows[i].c.slice(1,u).filter(t=>Number(String(t.str).trim().replace(",","."))>0),at=kol?cells.sort((p,q)=>Math.abs(p.x-kol.x)-Math.abs(q.x-kol.x))[0]:cells.at(-1);
   const num=at?Number(String(at.str).trim().replace(",",".")):0;if(!(num>0))continue;
   // (the sheet it is bent of on the row over its number: «БТ-ПН-О-0,5 х 500 х 2000 ГОСТ 19904-90»)
   const above=rows.slice(Math.max(0,i-2),i).flatMap(r=>r.c).map(t=>String(t.str)).join(" "),sh=/(\d+[,.]\d+)\s*[хx]\s*(\d{2,4})\s*[хx]\s*(\d{3,5})/u.exec(above);
   out.push({pos:c[0],count:num,unit:/^шт/u.test(c[u])?"шт":"п.м",...(sh?{sheet_t_mm:Number(sh[1].replace(",",".")),sheet_w_mm:Number(sh[2]),length_mm:Number(sh[3])}:{})})}}
 return{trims:out,names}
}
function extractArchitecture(geometry){
 const texts=geometry?.texts||[];
 const spec=(()=>{const a=panelSpec(texts);if(a.length)return a;const s=sketchSpec(texts);return s.length?s:layoutSpec(texts)})(),fills=fillSpec(texts),views=panelViews(geometry||{},spec),facades=fillViews(geometry||{});
 if(fills.length)fillSketches(geometry||{},fills);
 const finish=facadeFinish(texts),sills=sillSpec(texts);
 const axes=planAxes(geometry||{});
 const tr=trimSpec(texts);
 const roofs=roofPlans(geometry||{}),panels=spec.map(({at,...p})=>p),extra={...(facades.length?{facades}:{}),...(finish.length?{finish}:{}),...(Object.keys(sills).length?{sills}:{}),...(roofs.length?{roofs}:{}),...(axes?{axes}:{}),...(tr.trims.length?{trims:tr.trims}:{}),...(tr.names.length?{trimNames:tr.names}:{})};
 return panels.length||fills.length||views.length||Object.keys(extra).length?{panels,fills,views,...extra}:null
}
module.exports={trimSpec,trimKind,planAxes,facadeRows,arrowWay,leaderLabels,extractArchitecture,roofPlans,roofOpenings,openingRects,noteLevels,stemLevels,titleRow,viewRows,panelSpec,sketchSpec,layoutSpec,layoutLabel,fillSpec,panelViews,fillViews,fillSketches,facadeFinish,sillSpec,ralCodes};
