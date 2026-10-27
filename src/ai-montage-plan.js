"use strict";
/*
 * IR Project: turn a PDF scheme draft (+ optional Claude decisions) into one montage plan.
 * Pure functions, no I/O. Coordinates always come from the PDF geometry; the AI may only
 * choose which schemes/elements to place, element kinds and heights.
 */
const {markCode}=require("./ai-kmd-rules");
const ST=require("./ai-structure-types");
const {stampNames}=require("./ai-sheet-extract");
const {ralCodes}=require("./ai-ar-extract");
// Groups of the montage scheme: the catalog of structure types (src/ai-structure-types.js).
const GROUPS=Object.fromEntries(ST.GROUPS.map(g=>[g.key,g.label]));
const FITTING_TYPE={deck:"platform",weld:"weld",bolt:"bolt",manhole:"manhole",hatch:"roof_hatch",valve:"valve",foam:"foam",sensor:"instrument",rod:"lightning",nozzle:"nozzle",ring:"tank_ring",railing:"railing",flight:"stair_flight",ladder:"ladder",panel:"sandwich",trim:"trim"};
// What an element is: the engineer's word on this exact mark of this set; the kind the reading gave (a fitting, a
// tank part); the words of its name from the set's own schedule and sheets; only then what was learned of marks
// elsewhere and the letters of the mark (ГОСТ 26047) — a mark means different things in different sets. A type whose
// geometry contradicts the drawing (a "beam" mark drawn as a post) gives way to the drawing.
function typeFor(pl,geometry,learned){
 const taught=learned?.(pl.mark);if(taught&&!pl.fitting_type&&geometry!=="shell")return taught;
 const given=pl.type_key&&ST.byKey.get(pl.type_key);if(given)return given;
 if(pl.fitting_type)return ST.byKey.get(FITTING_TYPE[pl.fitting_type]||"nozzle");
 if(geometry==="shell")return ST.byKey.get(pl.scheme_group==="guards"?"railing":"tank_wall");
 // The index the notes give every mark («ФП», «Т») is the project's own: no kind by its letters.
 const byName=ST.typeByName(pl.name),t=byName||learned?.loose?.(pl.mark)||(pl.mark_index?null:ST.typeByMark(pl.mark));if(!t)return null;
 const fits={column:["column"],beam:["beam","brace"],bent:["beam"],brace:["brace","beam"],plate:["plate"]}[geometry]||[geometry];
 return fits.includes(t.geometry)||byName===t?t:null
}
// The mounting joints a sheet's notes give: «…монтажной сварки, болтов М24 класса точности В по ГОСТ 7798-70* класса
// прочности 8.8», «Все болты М16 класса прочности 5.8», «Все неоговоренные болты М20» (with the class said before it).
// {bolt:"М24", cls:"8.8", weld, text} of the first bolts named; null where the sheet names none.
function jointNote(text){
 const t=String(text||"").replace(/\s+/g," ");const found=[];let m;
 const re=/болт\S*\s*((?:М\s*\d{2}(?:\s*,\s*)?)+)[^.]{0,160}?класс\S*\s+прочности\s*(\d+\.\d)/giu;
 while((m=re.exec(t)))found.push({bolts:m[1].match(/\d{2}/g).map(d=>"М"+d),cls:m[2]});
 const rest=/прочности\s*(\d+\.\d)[^М]{0,160}?неоговоренные\s+болты\s*М\s*(\d{2})/u.exec(t);
 if(rest)found.push({bolts:["М"+rest[2]],cls:rest[1],rest:true});
 // The thickness of the gussets, as the general notes give it: «Толщину фасонок принять 10 мм», «фасонки t = 8 мм»,
 // «Фасонки толщиной 12 мм», «толщина всех фасонок — 10 мм» (6–40 mm; a number further than two words is not taken).
 const g=/толщин\S*\s+(?:всех\s+)?фасон\S*(?:\s+[а-яё]+){0,2}?\s*[—–-]?\s*(\d{1,2})\s*мм/iu.exec(t)||
  /фасон\S*(?:\s+[а-яё]+){0,2}?\s*(?:толщин\S*|t\s*=|δ\s*=?)\s*(\d{1,2})(?:[,.]\d)?\s*мм/iu.exec(t);
 const gusset=g&&+g[1]>=6&&+g[1]<=40?+g[1]:null;
 if(!found.length&&!gusset)return null;
 const weld=/монтажн\S*\s+сварк|на\s+болтах\s+и\s+сварке/iu.test(t);
 const words=[...new Set(found.map(f=>(f.rest?"неоговоренные ":"")+"болты "+f.bolts.join(", ")+" кл. "+f.cls))];
 if(gusset)words.push("фасонки t = "+gusset+" мм");
 return{bolt:found[0]?.bolts[0]||null,cls:found[0]?.cls||null,weld,...(gusset?{gusset_mm:gusset}:{}),text:(weld?"монтажная сварка; ":"")+words.join("; ")}
}
// The joint of a member with the fasteners of its assembly sheet: the montage sheet's bolt stays; without one, the most
// numerous permanent bolt of the sheet is drawn (its class, else none). The list and the holes go to the card.
function withFasteners(joint,f){
 if(!f||!f.bolts?.length&&!f.holes)return joint||undefined;
 const main=[...f.bolts].sort((a,b)=>(b.count||0)-(a.count||0)||b.d_mm-a.d_mm)[0];
 const list=f.bolts.map(b=>b.text+(b.cls&&!b.text.includes(b.cls)?" кл. "+b.cls:"")+(b.high&&!/высокопр/iu.test(b.text)?" (высокопрочный)":"")+(b.count?" — "+b.count+" шт.":"")),holes=f.holes?.diameters_mm?.length?"отверстия Ø"+f.holes.diameters_mm.join(", Ø")+(f.holes.all_mm?" (все Ø"+f.holes.all_mm+", кроме оговоренных)":""):"";
 const own={fasteners:list,...(f.holes?{holes_mm:f.holes.diameters_mm,...(f.holes.all_mm?{hole_mm:f.holes.all_mm}:{})}:{}),fasteners_sheet:f.sheet};
 if(joint?.bolt)return{...joint,...own};
 return{...(joint||{}),bolt:main?"М"+main.d_mm:null,cls:main?.cls||joint?.cls||null,weld:Boolean(joint?.weld),
  text:[joint?.text,list.length?"постоянные метизы: "+list.join("; "):"",holes].filter(Boolean).join("; "),sheet:joint?.sheet||f.sheet,...own}
}
const LOOKALIKE={a:"а",b:"в",c:"с",e:"е",h:"н",k:"к",m:"м",o:"о",p:"р",t:"т",x:"х",y:"у"};
const normMark=v=>[...String(v||"").trim().toLowerCase().replace(/ё/g,"е").replace(/\s+/g,"")].map(c=>LOOKALIKE[c]||c).join("");
const cumulative=spans=>spans.reduce((acc,v)=>{acc.push(acc[acc.length-1]+Number(v));return acc},[0]);

// Group by geometry first, then by the letter code of the mark (ГОСТ 26047, src/ai-kmd-rules.js).
function groupFor(mark,geometry){
 const prefix=normMark(mark).replace(/[^а-яa-z].*$/,""),code=markCode(mark);
 if(geometry==="brace")return"ties";
 const fits=geometry==="column"?["columns","fahwerk","posts"]:["beams","girders","purlins","spacers","fahwerk"];
 if(code?.group&&fits.includes(code.group))return code.group;
 if(geometry==="beam")return prefix.startsWith("п")?"purlins":prefix.startsWith("р")?"girders":"beams";
 if(prefix.startsWith("ф"))return"fahwerk";
 if(prefix.startsWith("с")&&!prefix.startsWith("св"))return"posts";
 return"columns"
}

// A point of a scheme in the common frame: its offset, and for a turned scheme the swap and the reversed direction.
const frameOf=(o,x,y)=>{const u=o.swap?y:x,v=o.swap?x:y;return[(o.fx||1)*u+o.dx,(o.fy||1)*v+o.dy]};
// Axis positions of every scheme are local (first axis = 0). Shared axis names put
// all schemes into one frame; a scheme without a shared axis cannot be aligned.
function mergeGrids(schemes){
 // The base: of the schemes with nearly the most grid lines (strays of the other kind not counted), the larger drawing —
 // a small-scale location plan of the whole site reads its spans less exactly (1970 for 1950); its outer axes join
 // the frame through the axes it shares.
 const own=s=>{const c=names=>{const n=(names||[]).filter(x=>/\d/.test(String(x).split("/")[0])).length;return Math.max(n,(names||[]).length-n)};return c(s.axesX)+c(s.axesY)};
 const most=Math.max(...schemes.map(own)),scale=s=>Number(s.scaleMmPerPt)||Infinity;
 const base=[...schemes].sort((a,b)=>(own(b)>=most*0.6)-(own(a)>=most*0.6)||(own(a)>=most*0.6&&scale(a)!==scale(b)?scale(a)-scale(b):own(b)-own(a)))[0];
 const X=new Map(base.axesX.map((n,i)=>[n,cumulative(base.spansX)[i]]));
 const Y=new Map(base.axesY.map((n,i)=>[n,cumulative(base.spansY)[i]]));
 const offsets=new Map([[base,{dx:0,dy:0}]]),rejected=[];
 // Numbered ("1", "О3", "12/1") or lettered ("Б", "Л"): grids number one direction and letter the other.
 // «К/1» is a row between К and Л (a letter), «О4/1» an axis between О4 and О5 (a number).
 const isNumber=n=>/\d/.test(String(n).split("/")[0]);
 const prefixOf=n=>(/^([^\d]*)\d/u.exec(n)||[])[1]??null;
 const prefixFits=(n,map)=>{
  const p=prefixOf(n);if(p===null)return true;
  const list=[...map.keys()].map(prefixOf).filter(x=>x!==null);if(list.length<3)return true;
  const common=list.filter(x=>x&&x===list[0]).length;
  return!(list[0]&&common>=list.length*0.8&&p!==list[0])
 };
 const numbered=names=>names.filter(isNumber).length*2>names.length;
 const numberedX=numbered(base.axesX),numberedY=numbered(base.axesY);
 // A stray bubble of the other kind on the base scheme itself (a row letter «К» at the end of a numbered row of axes)
 // is not a grid line either.
 for(const [map,num] of [[X,numberedX],[Y,numberedY]])for(const n of [...map.keys()])if(isNumber(n)!==num&&map.size>2)map.delete(n);
 const shift=(own,global)=>{
  const shared=own.filter(([n])=>global.has(n));
  if(!shared.length)return null;
  const deltas=shared.map(([n,v])=>global.get(n)-v);
  if(Math.max(...deltas)-Math.min(...deltas)<=50)return deltas[0];
  // An elevation draws the axes of the next building at its ends without their true span (a break, «О8 О9» side by
  // side): it fits when most of its shared axes agree; the odd ones out are left alone.
  if(!elevation)return null;
  const best=deltas.map(d=>deltas.filter(o=>Math.abs(o-d)<=50)).sort((a,b)=>b.length-a.length)[0];
  return best.length>=2&&best.length*3>=deltas.length*2?best[0]:null
 };
 let elevation=false;
 // Add schemes that share axes with the frame, repeating until nothing changes.
 let pending=schemes.filter(s=>s!==base),progress=true;
 // A scheme drawn as it is, or turned by 90° on its sheet (lettered axes across, numbered up — annexes of a long
 // building drawn on a portrait sheet): turned, its axes swap and one direction reverses (a turn, never a mirror).
 const VARIANTS=[{swap:false,fx:1,fy:1},{swap:true,fx:-1,fy:1},{swap:true,fx:1,fy:-1}];
 while(pending.length&&progress){
  progress=false;
  // Plans first: an elevation only finds its place in the frame they make.
  for(const s of [...pending].sort((a,b)=>(a.kind==="elevation")-(b.kind==="elevation"))){
   let fit=null;elevation=s.kind==="elevation";
   for(const v of VARIANTS){
    const ax=v.swap?s.axesY:s.axesX,ay=v.swap?s.axesX:s.axesY,sx=v.swap?s.spansY:s.spansX,sy=v.swap?s.spansX:s.spansY;
    if(numbered(ax)!==numberedX||numbered(ay)!==numberedY)continue;
    const ownX=ax.map((n,i)=>[n,v.fx*cumulative(sx)[i]]),ownY=ay.map((n,i)=>[n,v.fy*cumulative(sy)[i]]);
    const dx=shift(ownX,X),dy=shift(ownY,Y);
    if(dx!==null&&dy!==null){fit={...v,dx,dy,ownX,ownY};break}
   }
   if(!fit)continue;
   // A stray bubble of the other kind (a row letter among numbered axes) does not become a grid line, nor a bare
   // number among axes that all carry a letter («12» among О1…О10: a misread, a dimension or a node number).
   // An elevation adds no axes of its own: its end bubbles are not to scale.
   if(!elevation){
    for(const [n,v] of fit.ownX)if(!X.has(n)&&isNumber(n)===numberedX&&prefixFits(n,X))X.set(n,v+fit.dx);
    for(const [n,v] of fit.ownY)if(!Y.has(n)&&isNumber(n)===numberedY&&prefixFits(n,Y))Y.set(n,v+fit.dy)
   }
   offsets.set(s,{dx:fit.dx,dy:fit.dy,swap:fit.swap,fx:fit.fx,fy:fit.fy});pending=pending.filter(x=>x!==s);progress=true
  }
 }
 rejected.push(...pending);
 // Normalise so that the lowest axis is at 0 in both directions.
 const finish=map=>{
  const list=[...map].sort((a,b)=>a[1]-b[1]),min=list[0][1];
  return{names:list.map(x=>x[0]),pos:list.map(x=>Math.round(x[1]-min)),min}
 };
 const gx=finish(X),gy=finish(Y);
 for(const [s,o] of offsets)offsets.set(s,{...o,dx:o.dx-gx.min,dy:o.dy-gy.min});
 const spans=pos=>pos.slice(1).map((v,i)=>v-pos[i]);
 return{grid:{axes_x:gx.names,axes_y:gy.names,x_spans_mm:spans(gx.pos),y_spans_mm:spans(gy.pos),
  span_x_mm:gx.pos[gx.pos.length-1],span_y_mm:gy.pos[gy.pos.length-1],x_direction:"ltr",y_direction:"btt"},
  posX:new Map(gx.names.map((n,i)=>[n,gx.pos[i]])),posY:new Map(gy.names.map((n,i)=>[n,gy.pos[i]])),offsets,rejected}
}

// A plan drawn without axes (a platform standing on its own: «Схема расположения балок на отм. +5,500; +11,100») goes
// on the outline of the same size on the location plan («Схема расположения площадок, лестниц, крылец»), centre to
// centre; of outlines of about the same size the one whose level the plan names first, then the closest in size.
function seatFramed(merged,placed,draft){
 const outlines=[];
 for(const p of draft.pages||[])for(const s of p.schemes||[]){
  const off=merged.offsets.get(s);if(!off||!(s.footprints||[]).length)continue;
  for(const f of s.footprints){
   const rects=f.rects.map(r=>{const [ax,ay]=frameOf(off,r.x0_mm,r.y0_mm),[bx,by]=frameOf(off,r.x1_mm,r.y1_mm);return{x0:Math.min(ax,bx),x1:Math.max(ax,bx),y0:Math.min(ay,by),y1:Math.max(ay,by)}});
   outlines.push({name:f.mark||f.name,level:f.level_mm,rects,x0:Math.min(...rects.map(r=>r.x0)),x1:Math.max(...rects.map(r=>r.x1)),y0:Math.min(...rects.map(r=>r.y0)),y1:Math.max(...rects.map(r=>r.y1))})
  }
 }
 if(!outlines.length)return;
 const added=[];
 const cover=(o,x,y,w,h)=>o.rects.reduce((a,r)=>a+Math.max(0,Math.min(r.x1,x+w)-Math.max(r.x0,x))*Math.max(0,Math.min(r.y1,y+h)-Math.max(r.y0,y)),0);
 for(const c of placed){
  const f=c.scheme.framed;if(!f||!merged.rejected.includes(c.scheme))continue;
  // The plan with what is drawn beside it (its stair) is matched against the outline, as drawn or mirrored (a twin
  // platform has its stair on the other side).
  const e=f.extent||{x0:0,x1:f.w_mm,y0:0,y1:f.h_mm},W=e.x1-e.x0,H=e.y1-e.y0,tol=v=>Math.max(400,v*0.12);
  // The outline may hold more than the plan (a stair drawn with its platform in one hatch): the plan goes where it
  // covers the hatch best — centred, or to a side or a corner of the outline.
  // The box found is where the extent lies: as drawn x' = x + dx, mirrored x' = −x + dx.
  const placeOf=b=>({dx:Math.round(b.fx>0?b.x-e.x0:b.x+e.x1),dy:Math.round(b.fy>0?b.y-e.y0:b.y+e.y1),...(b.fx<0?{fx:-1}:{}),...(b.fy<0?{fy:-1}:{})});
  const seat=list=>{let best=null;
  for(const o of list){
   const w=o.x1-o.x0,h=o.y1-o.y0;
   if(W>w+tol(W)||H>h+tol(H)||W<w*0.6||H<h*0.6)continue;
   const exact=Math.abs(w-W)<=tol(W)&&Math.abs(h-H)<=tol(H);
   // A smaller plan in a larger outline must still fill most of its hatch (a stair of 2200×2500 is not the stair tower).
   const area=o.rects.reduce((a,r)=>a+(r.x1-r.x0)*(r.y1-r.y0),0);
   if(!exact&&W*H<area*0.6)continue;
   for(const fx of [1,-1])for(const fy of [1,-1])for(const x of [(o.x0+o.x1-W)/2,o.x0,o.x1-W])for(const y of [(o.y0+o.y1-H)/2,o.y0,o.y1-H]){
    const share=cover(o,x,y,W,H)/(W*H);if(share<0.7)continue;
    // How well the parts of the plan (frame, flights) and the hatch fill each other.
    const at=placeOf({x,y,fx,fy}),parts=(e.shapes||[{x0:e.x0,x1:e.x1,y0:e.y0,y1:e.y1}]).map(r=>{const [a,b]=[at.fx||1,at.fy||1];const xs=[a*r.x0+at.dx,a*r.x1+at.dx],ys=[b*r.y0+at.dy,b*r.y1+at.dy];return{x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)}});
    const both=parts.reduce((a,r)=>a+cover(o,r.x0,r.y0,r.x1-r.x0,r.y1-r.y0),0),own=parts.reduce((a,r)=>a+(r.x1-r.x0)*(r.y1-r.y0),0);
    const fill=both/own+both/area;
    const score=[(f.levels_mm||[]).includes(o.level)?0:1,exact?0:1,-Math.round(fill*50),Math.abs(w-W)+Math.abs(h-H),(fx<0)+(fy<0)];
    const k=best?score.findIndex((v,i)=>v!==best.score[i]):-1;
    if(!best||k>=0&&score[k]<best.score[k])best={score,o,x,y,fx,fy}
   }
  }
  return best};
  const place=placeOf;
  const best=seat(outlines);
  if(!best)continue;
  merged.rejected.splice(merged.rejected.indexOf(c.scheme),1);
  merged.offsets.set(c.scheme,place(best));
  c.framedOn=best.o;
  // The same structure built twice (two platforms of one name on the location plan): the plan on each of them.
  const twins=outlines.filter(o=>o!==best.o&&o.name&&o.name===best.o.name);
  twins.forEach((o,k)=>{const b=seat([o]);if(!b)return;
   const scheme={...c.scheme},twin={...c,scheme,info:{...c.info,index:c.info.index+"·"+(k+2)},framedOn:o};
   merged.offsets.set(scheme,place(b));added.push(twin)})
 }
 placed.push(...added);
 // A structure whose plans name no level («Схема расположения балок» of a platform): the highest level mark on the
 // sheets of the plans put on the same outline (the section beside them: «+4,700»).
 const groups=new Map();
 for(const c of placed)if(c.framedOn){(groups.get(c.framedOn)||groups.set(c.framedOn,[]).get(c.framedOn)).push(c)}
 for(const list of groups.values()){
  const pages=new Set(list.map(c=>c.info?.page));
  // Also the levels the other plans of the structure name (a base plan of the platform: its columns up to +16,100).
  const marks=[...(draft.pages||[]).filter(p=>pages.has(p.page)).flatMap(p=>p.levelMarks||[]),...list.flatMap(c=>c.scheme.framed.levels_mm||[])].filter(z=>z>0);
  if(!marks.length)continue;
  const top=Math.max(...marks),levels=[...new Set([0,...marks])].sort((a,b)=>a-b);
  for(const c of list){c.structureLevels=levels;if(!(c.scheme.framed.levels_mm||[]).length&&!Number.isFinite(c.scheme.levelNotes?.z1_mm))c.structureLevel=top}
 }
}

/*
 * draft: stored ai-scheme-draft data ({pages:[{page,schemes}]}); ai: Claude result or null;
 * heights: {"page:index":{z0_mm,z1_mm}} entered by the engineer (override AI).
 */
/*
 * Everything known about each shipping mark across the set: levels and length from assembly
 * views, quantity and mass from "Требуется" tables, profile from КМ lists, then what Claude
 * read from tables drawn without text. Values found in the PDF text win over the AI.
 */
// КМ and КМД number marks independently, so the same text is two different marks.
// Several КМ volumes in one set (КМ1 — the main shop, КМ2 — the annexes) number their marks each from 1: «К1» of
// КМ1 and «К1» of КМ2 are different columns. With more than one volume a КМ mark is kept per volume.
const scopeOf=(docType,volume="")=>docType==="КМ"?volume||"КМ":"КМД";
const volumeOf=p=>{const m=/КМ\s*(\d{1,2})(?!\d)/u.exec(String(p?.sheet?.stamp?.code||""))||/КМ\s*(\d{1,2})(?![\dД])/u.exec(String(p?.sourceName||""));return m?"КМ"+m[1]:""};
const markKey=(scope,mark)=>scope+"|"+normMark(mark);
// The plates of a member's views with the rows of its specification: a row of a plate «−b×t» (the less of the two is
// the thickness) fits a plate as thick (±1,5 mm) whose width and height seen fit its width and length (±6 mm); the rows
// with pieces left first. → [{at, t, z, x, pos?, section?, h_mm? (its height by the row, seen in plan only), from,
// approx?}], mm.
function platesBySpec(plates,rows){
 const PLATE=/^[-−–]\s*(\d+(?:[.,]\d+)?)\s*[хx×*]\s*(\d+(?:[.,]\d+)?)/iu,num=v=>Number(String(v).replace(",","."));
 const list=rows.map(r=>{const m=PLATE.exec(String(r.section||"").trim());if(!m)return null;const a=num(m[1]),b=num(m[2]);return{r,t:Math.min(a,b),b:Math.max(a,b),L:Number(r.length_mm)||0,left:Number(r.count)||0}}).filter(Boolean);
 const near=(a,b)=>b>0&&Math.abs(a-b)<=6;
 return plates.map(p=>{
  const w=p.x_mm?p.x_mm[1]-p.x_mm[0]:null,h=p.z_mm?p.z_mm[1]-p.z_mm[0]:null;
  const fit=list.filter(o=>Math.abs(o.t-p.t_mm)<=1.5&&(w===null||h===null?[w??h].every(v=>near(v,o.b)||near(v,o.L)):near(w,o.b)&&near(h,o.L)||near(w,o.L)&&near(h,o.b)));
  const o=fit.sort((a,b)=>(b.left>0)-(a.left>0))[0];if(o)o.left--;
  const hSpec=o&&h===null&&w!==null?(near(w,o.b)?o.L:o.b):null;
  return{at:p.at_mm,t:p.t_mm,z:p.z_mm||null,x:p.x_mm||null,...(o?{pos:o.r.pos??null,section:o.r.section}:{}),...(hSpec?{h_mm:hSpec}:{}),from:p.from,...(p.approx?{approx:true}:{})}
 })
}
// The gussets of a mark's sheet (src/ai-holes-extract.js sheetPlates — an outline in one view, two lines in the other)
// with the plates of its specification: as thick (±1,5 mm), the outline's sides as the plate's width and length (±8 mm or
// 4 %: its corners cut inside them). When the specification lists plates and none is as thick, the outline is not a
// gusset (an angle's leg, a part of another kind); one as thick of other sizes (a size read wrong) leaves it unnamed.
function gussetsBySpec(gussets,rows){
 const PLATE=/^[-−–]\s*(\d+(?:[.,]\d+)?)\s*[хx×*]\s*(\d+(?:[.,]\d+)?)/iu,num=v=>Number(String(v).replace(",","."));
 const list=rows.map(r=>{const m=PLATE.exec(String(r.section||"").trim());if(!m)return null;const a=num(m[1]),b=num(m[2]);return{r,t:Math.min(a,b),b:Math.max(a,b),L:Number(r.length_mm)||0}}).filter(Boolean);
 const near=(a,b)=>b>0&&Math.abs(a-b)<=Math.max(8,b*0.04);
 return gussets.map(q=>{
  const A=q.at_mm[1]-q.at_mm[0],cs=q.poly.map(e=>e[1]),C=Math.max(...cs)-Math.min(...cs);
  const o=list.find(o=>Math.abs(o.t-q.t_mm)<=1.5&&(near(A,o.L)&&near(C,o.b)||near(A,o.b)&&near(C,o.L)));
  if(list.length&&!o&&!list.some(o=>Math.abs(o.t-q.t_mm)<=1.5))return null;
  return{at:q.at_mm,plane:q.plane,poly:q.poly,t:q.t_mm,...(q.plane==="план"?{edge:q.edge,depth:q.depth_mm}:{x:q.x_mm}),...(o?{pos:o.r.pos??null,section:o.r.section}:{}),...(q.view?{view:q.view}:{})}
 }).filter(Boolean)
}
// The holes of a gusset: the signs in a part on the member (drill views, 1 in the fourth place) of the view its outline
// is drawn in (its title, as long), inside the outline (2 mm on its line) — [along, across, Ø] as the member's holes.
function gussetHoles(gussets,drill){
 const inside=(poly,x,y)=>{let w=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [ax,ay]=poly[i],[bx,by]=poly[j];if(ay>y!==by>y&&x<(bx-ax)*(y-ay)/(by-ay)+ax)w=!w}
  if(w)return true;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [ax,ay]=poly[j],[bx,by]=poly[i],dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy,t=l2?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/l2)):0;if(Math.hypot(ax+t*dx-x,ay+t*dy-y)<=2)return true}
  return false};
 for(const g of gussets){if(!g.view||!Array.isArray(g.poly)||g.poly.length<3)continue;const len=g.length_mm;
  const holes=(drill||[]).filter(v=>v.view===g.view&&(!(len>0)||Math.abs((v.length_mm||0)-len)<=Math.max(10,len*0.01))).flatMap(v=>v.holes).filter(h=>h[3]&&inside(g.poly,h[0],h[1]));
  const own=[];for(const h of holes)if(!own.some(o=>Math.abs(o[0]-h[0])<=1&&Math.abs(o[1]-h[1])<=1))own.push([h[0],h[1],h[2]]);
  delete g.length_mm;if(own.length)g.holes=own.slice(0,40)}
 return gussets
}
// A group drawing's holes for each of its marks (src/ai-sheet-extract.js markLengths, the view's spans): the drawing is
// of the mark whose span between the holes at its ends is the drawn one; another mark's holes at the far end move by the
// difference of the spans, its member as much longer; its middle off the middle between its axes by half the difference
// of its ends (ГПЭС К138 «240 · 5560 · 200» under К137 «300 · 6900 · 300»: the holes at 70 from its plates, the plates
// 170 and 130 off its axes). Holes in the middle of it (a node) — the view kept as drawn.
function groupDrill(v,mark,views){
 // (the spans of its own view, else of the view of the same marks — another view of the group, ГПЭС «Вид Е» of
 // «К85, К87»: the holes of the drawn one's span, К85 4620; К87's 250 nearer)
 const sv=(views||[]).find(x=>x.title===v.title&&x.spans)||(views||[]).find(x=>x.spans?.[mark]&&(v.marks||[]).length>1&&(v.marks||[]).every(m=>(x.marks||[]).includes(m))),own=sv?.spans?.[mark];if(!own?.length||!v.holes?.length)return null;
 const L=Number(v.length_mm)||0,at=v.holes.map(h=>h.at_mm);if(!(L>0)||at.some(a=>a>L*0.25&&a<L*0.75))return null;
 const start=at.filter(a=>a<=L/2),end=at.filter(a=>a>L/2);if(!start.length||!end.length)return null;
 const outer=Math.max(...end)-Math.min(...start),inner=Math.min(...end)-Math.max(...start),all=Object.values(sv.spans).flat();
 const base=all.find(o=>Math.abs(o.span-outer)<=2)||all.find(o=>Math.abs(o.span-inner)<=2);if(!base)return null;
 const m=own.slice().sort((p,q)=>Math.abs(p.c-base.c)-Math.abs(q.c-base.c))[0],d=m.span-base.span,center=(m.a-m.b)/2;
 if(!d&&!center)return null;
 return{length_mm:L+d,holes:v.holes.map(h=>({...h,at_mm:h.at_mm>L/2?h.at_mm+d:h.at_mm})),...(center?{center_mm:center}:{})}
}
function buildCatalog(draft,ai=null){
 const map=new Map();
 const volumes=new Set((draft.pages||[]).filter(p=>p.docType==="КМ").map(volumeOf).filter(Boolean));
 map.multi=volumes.size>1;
 const scopeAt=p=>scopeOf(p.docType,map.multi?volumeOf(p):"");
 let scope="КМД";
 const entry=mark=>{const k=markKey(scope,mark);if(!map.has(k))map.set(k,{mark,doc:scope,z0_mm:null,z1_mm:null,length_mm:null,profile:"",steel:"",count:null,mass_kg:null,levelsFrom:"",sources:[]});return map.get(k)};
 const where=p=>(p.sourceName||"PDF")+", лист "+(p.pdfPage||p.page);
 for(const p of draft.pages||[]){
  const sheet=p.sheet||{};scope=scopeAt(p);
  for(const v of sheet.views||[])for(const mark of v.marks){
   const e=entry(mark);
   if(v.z0_mm!==null&&v.z1_mm!==null&&v.z1_mm>v.z0_mm&&e.z0_mm===null){e.z0_mm=v.z0_mm;e.z1_mm=v.z1_mm;e.levelsFrom="PDF"}
   // A single level on a member's view is the level of that member.
   if(v.levels?.length===1&&e.view_level_mm===undefined)e.view_level_mm=v.levels[0];
   // A column's length is the distance between its levels; otherwise the largest dimension of the view — of a group
   // drawing, the mark's own row «для К114» (src/ai-sheet-extract.js markLengths).
   // (a length that is only the largest number of a view gives way to a sure one of another view of the mark: ГПЭС К140,
   // «4047» of a view of its own under the «7500 для К140» of its group drawing)
   const own=v.lengths?.[mark],levelled=v.z1_mm!==null&&v.z0_mm!==null&&v.z1_mm>v.z0_mm,weak=!levelled&&!own&&/^наибольшее/u.test(v.length_how||"");
   if(e.length_mm===null||e.lengthWeak&&!weak&&(levelled||own||v.length_mm>0)){e.length_mm=levelled?v.z1_mm-v.z0_mm:own||v.length_mm;delete e.length_ambiguous;
    if(e.length_mm!==null&&e.length_mm!==undefined){e.lengthFrom=where(p)+" · вид «"+v.title+"»"+(levelled?" (между отметками)":own?" (размер «для "+mark+"»)":v.length_how?" ("+v.length_how+")":"");if(weak)e.lengthWeak=true;else delete e.lengthWeak}
    // No overall dimension drawn: the largest number of the view, the others kept — the size is ambiguous.
    if(!levelled&&!own&&v.length_candidates?.length>1)e.length_ambiguous=v.length_candidates.slice(0,4)}
   e.sources.push(where(p)+" · вид «"+v.title+"»")
  }
  // Geometric scheme of a truss: its lattice, for drawing it as a truss and seating it on its supports.
  for(const t of p.trusses||[]){const e=entry(t.mark);if(!e.truss&&t.members?.length){e.truss={span_mm:t.span_mm,kind:t.kind,left:t.left,right:t.right,height_left_mm:t.height_left_mm,height_right_mm:t.height_right_mm,
   members:t.members.map(m=>[m.x0,m.z0,m.x1,m.z1,m.role==="верхний пояс"?"top":m.role==="нижний пояс"?"bottom":m.role==="стойка"?"post":"diag",m.profile||""])};e.sources.push(where(p)+" · геометрическая схема фермы")}}
  // Column base details: anchor bolts and the hole in the base plate, as the base sheet writes them.
  for(const b of p.baseDetails||[]){const e=entry(b.mark);if(!e.base_detail){e.base_detail={...b,source:where(p)};e.sources.push(where(p)+" · база колонны")}}
  // Wall rails off the axis: the chain from the outer face of the rail to the axis in a node section.
  for(const r of p.railOffsets||[]){const e=entry(r.mark);(e.rail_offsets=e.rail_offsets||[]);if(!e.rail_offsets.some(x=>x.axis===r.axis)){e.rail_offsets.push({...r,source:where(p)});e.sources.push(where(p)+" · привязка ригеля к оси "+r.axis)}}
  // A two-branch column: branches, lattice and upper part, as its sheet draws them.
  for(const c of p.columnDetails||[]){const e=entry(c.mark);if(!e.column_detail){e.column_detail={...c,source:where(p)};e.sources.push(where(p)+" · двухветвевая колонна")}}
  // The stamp of an assembly sheet says what its marks are («Колонна Ф52, Ф53», «Распорка Ф76-Ф81»): on sets where one
  // letter indexes every mark, the only word on the kind of each.
  if(!/схема|план\s|разрез|узл/iu.test(sheet.stamp?.name||""))for(const r of stampNames(sheet.stamp?.name)){const e=entry(r.mark);if(!e.name){e.name=r.name;e.nameFrom=where(p)+" · штамп";e.sources.push(e.nameFrom)}}
  for(const r of sheet.required||[]){const e=entry(r.mark);if(e.count===null)e.count=r.count;if(e.mass_kg===null&&r.mass_kg)e.mass_kg=r.mass_kg;e.sources.push(where(p)+" · «Требуется»")}
  for(const r of sheet.elements||[]){const e=entry(r.mark);if(!e.profile&&r.profile){e.profile=r.profile;e.profileFrom=where(p)+" · ведомость элементов";if(r.profile_standard)e.profile_standard=r.profile_standard}if(!e.steel&&r.steel)e.steel=r.steel;e.sources.push(where(p)+" · ведомость элементов")}
  // Specification of an assembly drawing: the main profile and the mass of the mark.
  // The profile of a shipping mark is the assembly sheet's (rules of 24.10.2026: each parameter from the section where it
  // is the main one): its specification takes the place of a list read before, the other reading is kept beside.
  for(const r of sheet.spec||[]){const e=entry(r.mark);
   if(r.profile&&e.profile&&e.profile!==r.profile&&/ведомость элементов/.test(e.profileFrom||"")&&p.docType==="КМД сборочные"){e.profile_other={value:e.profile,from:e.profileFrom};e.profile="";delete e.profile_standard}
   if(!e.profile&&r.profile){e.profile=r.profile;e.profileFrom=where(p)+" · спецификация"+(r.by_mass?" (сечение — по массе, как "+r.by_mass+")":"");if(r.profile_standard)e.profile_standard=r.profile_standard}if(e.mass_kg===null&&r.mass_kg)e.mass_kg=r.mass_kg;e.sources.push(where(p)+" · спецификация");
   if(!r.profile&&r.profile_read&&!e.profile_read)e.profile_read={value:r.profile_read,from:where(p)+" · спецификация"};
   // Its parts as the specification of its assembly sheet lists them (position, section, length, count, note): the first
   // sheet that lists them («все позиции по К32» — those of К32).
   if(p.docType==="КМД сборочные"&&r.parts?.length&&!e.parts)e.parts={sheet:where(p),...(r.parts_by?{by:r.parts_by}:{}),
    rows:r.parts.slice(0,40).map(x=>({pos:x.pos??null,section:x.section||"",length_mm:x.length_mm??null,count:x.count??null,...(x.note?{note:x.note}:{})}))}}
 }
 // An I-beam whose letter OCR lost on its sheet («двутавр 3512» for 35Ш2) and that sheet does not write elsewhere: the
 // letter the other sheets of the set give that number, when they give one.
 for(const e of map.values()){
  const m=!e.profile&&/^(I|Св\.I)(\d{2})[10](\d)$/u.exec(e.profile_read?.value||"");if(!m)continue;
  const re=new RegExp("^(?:I|Св\\.I)"+m[2]+"(ДБ|ДШ|[БШКМ]С?)"+m[3]+"$","u");
  const letters=[...new Set([...map.values()].map(o=>re.exec(o.profile||"")).filter(Boolean).map(x=>x[1]))];
  if(letters.length===1){e.profile=m[1]+m[2]+letters[0]+m[3];e.profileFrom=e.profile_read.from+" (буква двутавра — по другим листам комплекта, прочитано «"+e.profile_read.value+"»)"}
 }
 // The permanent fasteners and the holes of an assembly sheet («Ведомость постоянных метизов», «Все отверстия Ø23»): the
 // sheet's own, for every mark it makes; the first assembly sheet of a mark gives them.
 for(const p of draft.pages||[]){
  const sheet=p.sheet||{},bolts=(sheet.fasteners||[]).filter(f=>f.item==="bolt"&&!f.temporary&&f.d_mm>0);
  if(p.docType!=="КМД сборочные"||!bolts.length&&!sheet.holes)continue;scope=scopeAt(p);
  const marks=new Set([...(sheet.spec||[]).map(r=>r.mark),...(sheet.required||[]).map(r=>r.mark)]);
  for(const mark of marks){const e=entry(mark);if(!e.fasteners)e.fasteners={bolts:bolts.map(f=>({text:f.text,d_mm:f.d_mm,length_mm:f.length_mm,cls:f.strength_class||null,high:Boolean(f.high_strength),count:f.count})),holes:sheet.holes||null,sheet:where(p)}}
 }
 // The holes of each mark at their places on its views (sheet.drill, src/ai-holes-extract.js): the views of the first
 // assembly sheet that has them, up to four; a hole is [along from the start, across from the axis, Ø (0 — not named),
 // 1 — in a part on the member (a gusset), mm].
 for(const p of draft.pages||[]){
  const sheet=p.sheet||{};if(p.docType!=="КМД сборочные"||!sheet.drill?.views?.length)continue;scope=scopeAt(p);
  for(const v of sheet.drill.views)for(const mark of v.marks||[]){const e=entry(mark);
   if(e.drillFrom&&e.drillFrom!==where(p)||(e.drill||[]).length>=4)continue;e.drillFrom=where(p);const fit=groupDrill(v,mark,sheet.views);
   (e.drill=e.drill||[]).push({view:v.title,sheet:where(p),scale:v.scale,length_mm:fit?fit.length_mm:v.length_mm,band_mm:v.band_mm,dir:v.dir,...(v.main?{main:true}:{}),...(v.not_to_scale?{not_to_scale:true}:{}),...(fit?.center_mm?{center_mm:fit.center_mm}:{}),
    holes:(fit?fit.holes:v.holes).slice(0,80).map(h=>[h.at_mm,h.off_mm,h.d_mm||0,h.part?1:0])})}
 }
 // The plates across each mark (ribs, connection plates; sheet.plates, src/ai-holes-extract.js sheetPlates) of the first
 // assembly sheet that has them, each with its row of the sheet's specification when one fits it (a plate «−80×10»
 // 222 long: as thick, as wide and as high) — its position and section; the height of one seen only in plan from it.
 for(const p of draft.pages||[]){
  const sheet=p.sheet||{};if(p.docType!=="КМД сборочные"||!sheet.plates?.length)continue;scope=scopeAt(p);
  for(const m of sheet.plates){const e=entry(m.mark);if(e.plates)continue;
   const gussets=gussetHoles(gussetsBySpec(m.gussets||[],e.parts?.rows||[]).slice(0,40).map(g=>({...g,length_mm:m.length_mm})),e.drillFrom===where(p)?e.drill:null);
   e.plates={sheet:where(p),views:m.views,length_mm:m.length_mm,dir:m.dir,rows:platesBySpec(m.plates,e.parts?.rows||[]).slice(0,40),...(gussets.length?{gussets}:{})}}
 }
 // The plates drawn apart with their holes (sheet.sections, src/ai-holes-extract.js sheetHoles: a base plate «1 - 1», an
 // end plate «2 - 2» seen from the end of a beam) of the first assembly sheet that has them: their size, their holes from
 // the start of the plate's view and its axis, the place of the cut along the mark's view («8-8» 3436 of 3594 — by the
 // foot of the post Ф15).
 for(const p of draft.pages||[]){
  const sheet=p.sheet||{};if(p.docType!=="КМД сборочные"||!sheet.sections?.length)continue;scope=scopeAt(p);
  for(const s of sheet.sections)for(const mark of s.marks||[]){const e=entry(mark);if(e.cuts&&e.cuts.sheet!==where(p)||(e.cuts?.rows||[]).length>=8)continue;
   // (its row of the specification: a plate «−20×320» 320 long — its thickness and position)
   const spec=(e.parts?.rows||[]).map(r=>{const m=/^[-−–]\s*(\d+(?:[.,]\d+)?)\s*[хx×*]\s*(\d+(?:[.,]\d+)?)/iu.exec(String(r.section||"").trim());if(!m)return null;const a=Number(m[1].replace(",",".")),b=Number(m[2].replace(",","."));return{r,t:Math.min(a,b),b:Math.max(a,b),L:Number(r.length_mm)||0}}).filter(Boolean);
   const near=(a,b)=>b>0&&Math.abs(a-b)<=6,[P,Q]=s.plate_mm,o=spec.find(o=>near(P,o.b)&&near(Q,o.L)||near(P,o.L)&&near(Q,o.b));
   (e.cuts=e.cuts||{sheet:where(p),rows:[]}).rows.push({view:s.title,plate:s.plate_mm,dir:s.dir,...(s.at_mm!==undefined?{at:s.at_mm,of:s.of_mm,on:s.cut_on,on_dir:s.cut_dir}:{}),
    ...(o?{t:o.t,pos:o.r.pos??null,section:o.r.section}:{}),holes:s.holes.slice(0,40).map(h=>[h.at_mm,h.off_mm,h.d_mm||0])})}
 }
 // Sections of the mounting drawings: the most frequent reading of each mark wins.
 const votes=new Map();
 for(const p of draft.pages||[]){
  if(p.docType!=="КМД монтажные"&&p.docType!=="КМ")continue;
  scope=scopeAt(p);
  for(const r of p.sections||[]){
   const k=markKey(scope,r.mark);if(!votes.has(k))votes.set(k,{scope,mark:r.mark,beam:new Map(),post:new Map(),ridge:new Map(),span:new Map(),where:new Set()});
   const v=votes.get(k),add=(map,key)=>map.set(key,(map.get(key)||0)+1);
   if(Number.isFinite(r.beam_mm))add(v.beam,r.beam_mm);
   if(Number.isFinite(r.ridge_mm))add(v.ridge,[r.beam_mm,r.ridge_mm,r.ridge_t,r.ridge_len_mm].join("|"));
   if(Number.isFinite(r.z0_mm)&&Number.isFinite(r.z1_mm))add(v.post,r.z0_mm+"|"+r.z1_mm);
   if(Array.isArray(r.span_mm)&&r.span_mm[1]-r.span_mm[0]>=1000)add(v.span,r.span_mm.join("|"));
   v.where.add(where(p)+" · разрез "+r.section)
  }
 }
 const mode=map=>[...map].sort((a,b)=>b[1]-a[1])[0]?.[0];
 for(const v of votes.values()){
  scope=v.scope;const e=entry(v.mark);
  // A node detail ("Разрез 3-3" of a column top) shows only a piece of the post high above the ground:
  // it must not set the levels of a column whose drawing is much longer.
  for(const key of [...v.post.keys()]){const [z0,z1]=key.split("|").map(Number);if(z0>1000&&e.length_mm>0&&z1-z0<e.length_mm*0.6)v.post.delete(key)}
  const beam=mode(v.beam),post=mode(v.post);
  if(beam!==undefined)e.section_beam_mm=beam;
  // A beam broken at the ridge: ends, ridge level, ridge position along it and its length in the section.
  const ridge=mode(v.ridge);
  if(ridge!==undefined&&v.ridge.get(ridge)>=(v.beam.get(beam)||0)/2){const [end,z,t,len]=ridge.split("|").map(Number);e.section_beam_mm=end;e.section_ridge={z,t,len}}
  if(post!==undefined){const [z0,z1]=post.split("|").map(Number);e.section_z0_mm=z0;e.section_z1_mm=z1}
  const span=mode(v.span);if(span!==undefined)e.section_span_mm=span.split("|").map(Number);
  e.sources.push(...[...v.where].slice(0,3))
 }
 for(const m of ai?.marks||[]){
  if(!m?.mark)continue;
  scope=m.doc==="КМ"?"КМ":"КМД";const e=entry(m.mark);
  if(!e.profile&&m.profile){e.profile=m.profile;e.profileFrom="Claude"+(m.sheet?" · "+m.sheet:"")}
  if(e.length_mm===null&&m.length_mm>0){e.length_mm=m.length_mm;e.lengthFrom="Claude"+(m.sheet?" · "+m.sheet:"")}
  if(e.count===null&&m.count>0)e.count=m.count;
  if(e.mass_kg===null&&m.mass_kg>0)e.mass_kg=m.mass_kg;
  if(e.z0_mm===null&&m.has_levels&&m.z1_mm>m.z0_mm){e.z0_mm=m.z0_mm;e.z1_mm=m.z1_mm;e.levelsFrom="Claude"}
  e.sources.push("Claude"+(m.sheet?" · "+m.sheet:""))
 }
 for(const e of map.values())e.sources=[...new Set(e.sources)].slice(0,8);
 return map
}

// Levels of one element found in the drawings: the mark's assembly view, sections, notes on the scheme.
function drawingLevels(geometry,cat,notes,point){
 // A plan titled with its level («… покрытия на отм. +13,150») places its members there when a section of the same
 // mark gives a level far from it (one mark used at several levels in one volume); a section near it is more exact.
 if(geometry==="beam"&&Number.isFinite(notes?.z1_mm)&&!(notes.notes||[]).length){
  const sec=Number.isFinite(cat?.section_beam_mm)?cat.section_beam_mm:Number.isFinite(cat?.view_level_mm)?cat.view_level_mm:null;
  if(sec===null||Math.abs(sec-notes.z1_mm)>1500)return{z0:notes.z1_mm,z1:notes.z1_mm,from:"отметка в названии схемы"}
 }
 if(geometry==="beam"&&Number.isFinite(cat?.section_beam_mm)&&cat.section_ridge)return{z0:cat.section_beam_mm,z1:cat.section_beam_mm,ridge:cat.section_ridge,from:"разрез"};
 if(geometry!=="beam"&&cat?.z0_mm!==null&&cat?.z0_mm!==undefined)return{z0:cat.z0_mm,z1:cat.z1_mm,from:"чертёж марки ("+cat.levelsFrom+")"};
 if(geometry==="beam"&&Number.isFinite(cat?.section_beam_mm))return{z0:cat.section_beam_mm,z1:cat.section_beam_mm,from:"разрез"};
 if(geometry==="beam"&&Number.isFinite(cat?.view_level_mm))return{z0:cat.view_level_mm,z1:cat.view_level_mm,from:"чертёж марки (PDF)"};
 if(geometry!=="beam"&&Number.isFinite(cat?.section_z0_mm))return{z0:cat.section_z0_mm,z1:cat.section_z1_mm,from:"разрез"};
 if(!notes)return null;
 // The note written closest to the element, then the levels in the scheme title.
 let near=null;
 for(const n of notes.notes||[]){const d=point?Math.hypot(n.x-point.x,n.y-point.y):0;if(!near||d<near.d)near={...n,d}}
 let z0=near?.z0_mm??notes.z0_mm??null,z1=near?.z1_mm??notes.z1_mm??null;
 if(geometry==="beam")return Number.isFinite(z1)?{z0:z1,z1,from:"надпись на схеме"}:null;
 // A post with its bottom written on the scheme and its length on the assembly drawing.
 if(Number.isFinite(z0)&&!Number.isFinite(z1)&&cat?.length_mm>0)z1=z0+cat.length_mm;
 return Number.isFinite(z0)&&Number.isFinite(z1)&&z1>z0?{z0,z1,from:"надпись на схеме"}:null
}

// Claude's answer about a tank as one more tank "page": its numbers fill what the sheets did not give locally.
// A set of several different tanks: one group of pages per tank (ai.tanks holds the ones after the first).
function claudeTankPage(ai){
 const others=Array.isArray(ai?.tanks)?ai.tanks.filter(t=>t?.is_tank&&t.diameter_mm>0):[];
 if(!others.length)return claudeTankPageOf(ai,ai?.tank);
 return [ai?.tank,...others].flatMap((t,k)=>claudeTankPageOf(ai,t).map(p=>({...p,tankGroup:k})))
}
function claudeTankPageOf(ai,t){
 if(!t?.is_tank||!(t.diameter_mm>0))return[];
 const rows=(t.items||[]).filter(i=>Number.isFinite(i.bearing_deg)).map((i,k)=>({pos:i.pos>0?i.pos:900+k,name:i.name||"",du:i.du>0?i.du:null,size:null,
  ...(i.mark?{mark:String(i.mark)}:{}),bearing:Math.round(i.bearing_deg*10)/10,a:i.on_roof?(i.radius_mm>0?i.radius_mm:null):(i.height_mm>0?i.height_mm:null),roof:Boolean(i.on_roof),from:ai.fromKnowledge||ai.checkedTank?"база знаний":"Claude"}));
 const levels=[t.ladder_foot_mm,t.ladder_top_mm].filter(v=>Number.isFinite(v)&&v!==0);
 return[{page:0,pdfPage:0,docType:"КМ",sourceName:ai.fromKnowledge||ai.checkedTank?"База знаний":"Claude",tank:{fromClaude:true,diameters:[Math.round(t.diameter_mm)],
  facade:t.wall_height_mm>0?{height:Math.round(t.wall_height_mm),rise:t.roof_rise_mm>0?Math.round(t.roof_rise_mm):null,items:[],levels,...(t.beside_mm>0?{beside:Math.round(t.beside_mm)}:{})}:null,
  nozzleTable:rows.length?rows:null,ladder:t.ladder_bearing_deg>=0&&t.ladder_kind!=="none"?{bearing:t.ladder_bearing_deg,kind:t.ladder_kind==="ring"||t.ladder_kind==="single"?t.ladder_kind:"shaft",name:t.ladder_kind==="ring"?"Кольцевая лестница":t.ladder_kind==="single"?"Лестница":"Шахтная лестница",fromBase:Boolean(ai.fromKnowledge||ai.checkedTank),
   ...(t.ladder_top_mm>0?{top:Math.round(t.ladder_top_mm)}:{}),...(Number.isFinite(t.ladder_foot_mm)&&t.ladder_foot_mm!==0?{foot:Math.round(t.ladder_foot_mm)}:{}),
   ...(t.ladder_depth_mm>0?{depth:Math.round(t.ladder_depth_mm)}:{}),...(t.ladder_width_mm>0?{width:Math.round(t.ladder_width_mm)}:{}),...(t.ladder_gap_mm>0?{gap:Math.round(t.ladder_gap_mm)}:{})}:null,
  platforms:t.platform_level_mm>0?{exact:true,levels:[Math.round(t.platform_level_mm)],width:t.platform_width_mm>0?Math.round(t.platform_width_mm):null,rail:t.railing_height_mm>0?Math.round(t.railing_height_mm):null,post:t.railing_post_step_mm>0?Math.round(t.railing_post_step_mm):null,
   ...(t.platform_offset_mm>0?{offset:Math.round(t.platform_offset_mm)}:{})}:null,
  parts:t.bottom?{bottom:{name:"Днище"}}:null,
  // What a checked entry of the knowledge base keeps beyond Claude's answer (courses, shields, the central ring,
  // anchors, bottom sheet, walkway offset): the same things the sheets give when read.
  ...(Array.isArray(t.courses_mm)&&t.courses_mm.length>1?{courses:[t.courses_mm.map(Number)]}:{}),
  ...(t.roof_sectors>0||t.central_ring_outer_mm>0?{roof:{sectors:t.roof_sectors>0?Number(t.roof_sectors):null,kinds:Array.isArray(t.roof_shield_kinds)?t.roof_shield_kinds:[],
   ring:t.central_ring_outer_mm>0?{outer:Number(t.central_ring_outer_mm),inner:t.central_ring_inner_mm>0?Number(t.central_ring_inner_mm):null}:null,...(t.central_ring_mark==="ЦК1"?{ck:true}:{})}}:{}),
  ...(Array.isArray(t.anchors_deg)&&t.anchors_deg.length?{anchors:{bearings:t.anchors_deg.map(Number),ratio:t.anchors_ratio>0?Number(t.anchors_ratio):1.01}}:{}),
  // The bottom: its thickness and its kind (annular plates or one thickness, rolled or sheet by sheet, the slope).
  ...((()=>{const kind={...(t.bottom_kind==="annular"?{kind:"annular"}:{}),...(t.bottom_assembly==="rolled"||t.bottom_assembly==="sheet"?{assembly:t.bottom_assembly}:{}),
   ...(t.bottom_slope>=20?{slope:Number(t.bottom_slope),toCentre:Boolean(t.bottom_to_centre)}:{}),...(t.annular_width_mm>0?{annular_width_mm:Number(t.annular_width_mm)}:{})};
   return t.bottom_thickness_mm>0||Object.keys(kind).length?{bottom:{diameters:[],...(t.bottom_thickness_mm>0?{thickness:Number(t.bottom_thickness_mm)}:{}),...(Object.keys(kind).length?{kind}:{})}}:{}})()),
  // The dispatch list, the sheets, several tanks of the set (centres in mm, the bearing of each one's stair) and the
  // transition platform between them.
  ...(Array.isArray(t.ship_list)&&t.ship_list.length?{ship:t.ship_list.filter(r=>r&&r.name).map(r=>({mark:r.mark||null,name:String(r.name),qty:r.qty>0?Number(r.qty):null,...(r.du>0?{du:Number(r.du)}:{})}))}:{}),
  ...(t.wall_sheet_mm||t.bottom_sheet_mm?{sheets:{...(t.wall_sheet_mm?{wall:{width:Number(t.wall_sheet_mm[0])||1500,length:Number(t.wall_sheet_mm[1])||6000,fromDevelopment:true}}:{}),...(t.bottom_sheet_mm?{bottom:{width:Number(t.bottom_sheet_mm[0])||1500,length:Number(t.bottom_sheet_mm[1])||6000}}:{})}}:{}),
  ...(Array.isArray(t.layout_mm)&&t.layout_mm.length>1?{layout:t.layout_mm.map(l=>({x:Number(l.dx)||0,y:-(Number(l.dy)||0),r:t.diameter_mm/2,...(Number.isFinite(l.stair_deg)?{outside:Number(l.stair_deg)}:{}),
   spanDims:{pt:Math.hypot((t.layout_mm[1].dx||0)-(t.layout_mm[0].dx||0),(t.layout_mm[1].dy||0)-(t.layout_mm[0].dy||0)),mm:[Math.hypot((t.layout_mm[1].dx||0)-(t.layout_mm[0].dx||0),(t.layout_mm[1].dy||0)-(t.layout_mm[0].dy||0))]}}))}:{}),
  ...(t.bridge?{bridge:true}:{}),...(t.title?{label:String(t.title)}:{}),
  // A bottom on beams, a wall in rolls, the outer ring platform (its level and overall diameter).
  ...(t.bottom_beams?{bottomBeams:{...(t.bottom_beams_step_mm>0?{step:Number(t.bottom_beams_step_mm)}:{}),...(t.bottom_beams_height_mm>0?{height:Number(t.bottom_beams_height_mm)}:{}),...(t.bottom_beams_count>0?{count:Number(t.bottom_beams_count)}:{})}}:{}),
  ...(t.rolled_wall?{rolled:true}:{}),
  ...(t.outer_platform_level_mm>0||t.outer_platform_diameter_mm>0?{outerPlatform:{...(t.outer_platform_level_mm>0?{level:Number(t.outer_platform_level_mm)}:{}),...(t.outer_platform_diameter_mm>0?{diameter:Number(t.outer_platform_diameter_mm)}:{}),...(t.outer_platform_railing_mm>0?{rail:Number(t.outer_platform_railing_mm)}:{})}}:{})}}]
}
// A field of sandwich panels: the wall one stands on its lower edge (both ends at its bottom, its height up), the roof
// one lies on the slope (its width across). {fit, z0, z1, note}.
function panelOf(key,z0,z1,width){
 if(key==="sandwich_wall"){const lo=Math.min(z0,z1),h=Math.abs(z1-z0);
  return{fit:{fitting_type:"panel",diameter_mm:h>=300?Math.round(h):1000,layout:{panel:"wall"}},z0:lo,z1:lo,note:h>=300?"":"высота поля панелей не найдена, показана условно 1000 — проверьте"}}
 return{fit:{fitting_type:"panel",diameter_mm:width>=300?Math.round(width):1000,layout:{panel:"roof"}},z0,z1,note:width>=300?"":"ширина поля панелей не найдена, показана условно 1000 — проверьте"}
}
// Elements Claude listed by axes and offsets: placed on Claude's grid. A mark the geometry already placed is left to it.
function claudeScheme(ai,candidates,{wallPanels=true}={}){
 const list=(ai?.elements||[]).filter(e=>e?.mark&&["column","beam","brace"].includes(e.geometry_type)&&(wallPanels||e.type!=="sandwich_wall"));
 const g=ai?.grid;if(!list.length||!g||(g.axes_x||[]).length<2||(g.axes_y||[]).length<2)return null;
 const ax=g.axes_x.map(String),ay=g.axes_y.map(String);
 const sx=(g.spans_x_mm||[]).length===ax.length-1&&g.spans_x_mm.every(v=>v>0)?g.spans_x_mm.map(Number):null;
 const sy=(g.spans_y_mm||[]).length===ay.length-1&&g.spans_y_mm.every(v=>v>0)?g.spans_y_mm.map(Number):null;
 if(!sx||!sy)return null;
 const px=new Map(ax.map((n,i)=>[n,cumulative(sx)[i]])),py=new Map(ay.map((n,i)=>[n,cumulative(sy)[i]]));
 const known=new Set(candidates.flatMap(c=>(c.scheme.placements||[]).map(pl=>normMark(pl.mark))));
 const placements=[],docs={};
 for(const e of list){
  if(known.has(normMark(e.mark)))continue;
  const x=px.get(String(e.axis_x)),y=py.get(String(e.axis_y));if(x===undefined||y===undefined)continue;
  const column=e.geometry_type==="column";
  const x2=column?undefined:px.get(String(e.axis_x2)),y2=column?undefined:py.get(String(e.axis_y2));
  if(!column&&(x2===undefined||y2===undefined))continue;
  const z0=Number(e.z0_mm),z1=Number(e.z1_mm);if(!Number.isFinite(z0)||!Number.isFinite(z1))continue;
  docs[e.doc]=(docs[e.doc]||0)+1;
  // A kind the engineer added (its words in the name) wins over the nearest one Claude had to choose.
  const own=ST.typeByName(e.name),type=own?.user?own:ST.byKey.get(e.type);
  // A flight or a ladder is drawn as one (stringers, treads, handrails; strings, rungs, hoops) at its width.
  const stair=type?.key==="stair_flight"?{fitting_type:"flight",diameter_mm:e.width_mm>=400?Math.round(e.width_mm):800}:type?.key==="ladder"?{fitting_type:"ladder",diameter_mm:e.width_mm>=400?Math.round(e.width_mm):600}:{};
  // A field of sandwich panels of АР: a wall one along its lower edge (z0 its bottom, z1 its top — the height of the
  // field), a roof one from the eave (z0) to the ridge (z1), its width across; a trim along its line. What the sheets
  // do not give is shown conventionally and marked.
  const panel=type?.fitting==="panel"&&!column?panelOf(type.key,z0,z1,e.width_mm):null,trim=type?.fitting==="trim"?{fitting_type:"trim",diameter_mm:e.width_mm>0?Math.round(e.width_mm):0}:null;
  // Its colour, when its name or note gives a RAL («Стеновая сэндвич-панель 150 мм, RAL 9006»): drawn in it.
  const ral=panel||trim?ralCodes((e.name||"")+" "+(e.note||""))[0]:"";if(ral)(panel?panel.fit:trim).layout={...((panel?panel.fit:trim).layout||{}),ral};
  placements.push({...stair,...(panel?.fit||trim||{}),mark:String(e.mark).trim(),name:e.name||type?.name||"",type_key:type?.key||"",...(type&&!["shell","plate","fitting"].includes(type.geometry)?{scheme_group:type.group}:{}),geometry_type:e.geometry_type,x_mm:Math.round(x+(Number(e.dx_mm)||0)),y_mm:Math.round(y+(Number(e.dy_mm)||0)),
   ...(column?{}:{x2_mm:Math.round(x2+(Number(e.dx2_mm)||0)),y2_mm:Math.round(y2+(Number(e.dy2_mm)||0))}),
   z0_mm:panel?panel.z0:column?Math.min(z0,z1):z0,z1_mm:panel?panel.z1:column?Math.max(z0,z1):z1,levels_from:"Claude",confidence:"low",axis_x:String(e.axis_x),axis_y:String(e.axis_y),...(e.sheet?{sheet:String(e.sheet)}:{}),
   ...(/^(?:АР|ТХ)$/u.test(e.doc||"")?{section:e.doc}:{}),
   notes:["Определено Claude"+(e.sheet?" · "+e.sheet:"")+(e.note?" · "+e.note:""),...(panel?.note?[panel.note]:[])]})
 }
 if(!placements.length)return null;
 const doc=Object.entries(docs).sort((a,b)=>b[1]-a[1])[0]?.[0]||"КМД";
 return{kind:"claude",title:"Элементы по данным Claude",docType:doc==="КМ"?"КМ":"КМД монтажные",axesX:ax,axesY:ay,spansX:sx,spansY:sy,
  sizeX:cumulative(sx).at(-1),sizeY:cumulative(sy).at(-1),placements,warnings:[]}
}

// АР read from its sheets (src/ai-ar-extract.js), without Claude: every panel of the facade layouts on its wall, of
// the size and colour its specification gives. A facade seen with its axes rising to the right is the wall on the
// first axis across (1-6 — the wall on А, А-Л — on 6, 6-1 — on Л, Л-А — on 1); the wall stands where the facades
// across it end at its height (its outer face; a wall over a lower part stands back, where the higher part ends).
function arScheme(pages){
 const ar=pages.filter(p=>p.docType==="АР"&&p.ar);if(!ar.length)return null;
 const spec=new Map();for(const p of ar)for(const s of p.ar.panels||[]){if(!spec.has(s.pos))spec.set(s.pos,[]);spec.get(s.pos).push(s)}
 const all=ar.flatMap(p=>(p.ar.views||[]).map(v=>({...v,page:p.page,sheet:p.pdfPage||p.page,file:p.sourceName||""})));
 const views=all.filter(v=>!v.section&&v.panels.length);
 const most=k=>views.filter(v=>v.numbered===k).sort((a,b)=>b.axes.length-a.axes.length)[0];
 const vx=most(true),vy=most(false);if(!vx||!vy)return null;
 const ax=vx.axes.map(a=>a.name),ay=vy.axes.map(a=>a.name),sx=vx.axes.slice(1).map((a,i)=>a.mm-vx.axes[i].mm),sy=vy.axes.slice(1).map((a,i)=>a.mm-vy.axes[i].mm);
 const px=new Map(vx.axes.map(a=>[a.name,a.mm])),py=new Map(vy.axes.map(a=>[a.name,a.mm]));
 // A view's own distances from its first axis, on the grid of the scheme.
 const shift=v=>{const a=v.axes[0],g=(v.numbered?px:py).get(a.name);return g===undefined?null:g-a.mm};
 const sizeOf=(mark,w,h)=>{const list=spec.get(mark)||[];
  return list.find(q=>Math.abs(q.width_mm-w)<=40&&Math.abs(q.length_mm-h)<=40||Math.abs(q.length_mm-w)<=40&&Math.abs(q.width_mm-h)<=40)||list[0]||null};
 const placements=[],warnings=[];
 for(const v of views){
  const off=shift(v);if(off===null){warnings.push("Фасад на листе "+v.sheet+": оси не совпадают с осями других фасадов — не поставлен");continue}
  // The middle height of the wall, and the facades across it there.
  const zs=v.panels.map(p=>(p.z0+p.z1)/2).sort((a,b)=>a-b),zm=zs[zs.length>>1];
  const across=views.filter(w=>w.numbered!==v.numbered).flatMap(w=>{const o=shift(w);return o===null?[]:w.panels.filter(p=>p.z0<=zm&&p.z1>=zm).map(p=>({u0:p.u0+o,u1:p.u1+o}))});
  const low=v.numbered!==v.reversed,first=(v.numbered?ay:ax)[0],last=(v.numbered?ay:ax).at(-1),pos=v.numbered?py:px;
  let face=across.length?(low?Math.min(...across.map(p=>p.u0)):Math.max(...across.map(p=>p.u1))):null;
  if(face===null){face=pos.get(low?first:last);warnings.push("Фасад на листе "+v.sheet+": положение стены по фасадам поперёк не найдено — поставлен по оси "+(low?first:last))}
  const axis=[...pos].reduce((b,a)=>Math.abs(a[1]-face)<Math.abs(b[1]-face)?a:b);
  for(const p of v.panels){
   // With tables of panels in the set, a label they do not know is not a panel.
   if(spec.size&&!spec.has(p.mark)){warnings.push(p.mark+" (лист "+v.sheet+"): нет в спецификациях панелей — не поставлена");continue}
   const w=p.u1-p.u0,h=p.z1-p.z0,q=sizeOf(p.mark,w,h),t=q?.thickness_mm||150;
   // The panel's middle plane: half its thickness inside the outer face.
   const across0=Math.round(face+(low?t/2:-t/2)),a=p.u0+off,b=p.u1+off;
   const differs=q&&!(Math.abs(q.width_mm-w)<=40&&Math.abs(q.length_mm-h)<=40||Math.abs(q.length_mm-w)<=40&&Math.abs(q.width_mm-h)<=40||p.cut&&Math.abs(q.width_mm-w)<=40&&h<=q.length_mm+40);
   placements.push({mark:p.mark,name:"Сэндвич-панель стеновая"+(q?.name?" "+q.name:""),type_key:"sandwich_wall",scheme_group:"cladding",geometry_type:"beam",
    fitting_type:"panel",diameter_mm:Math.max(1,Math.round(h)),
    layout:{panel:"wall",thickness_mm:t,...(q?.ral?{ral:q.ral}:{}),...(q?.ral_inside?{ral_inside:q.ral_inside}:{}),...(p.cut?{cut:p.cut}:{}),...(q?.code?{code:q.code}:{}),width_mm:Math.round(w)},
    ...(v.numbered?{x_mm:a,y_mm:across0,x2_mm:b,y2_mm:across0}:{x_mm:across0,y_mm:a,x2_mm:across0,y2_mm:b}),
    z0_mm:p.z0,z1_mm:p.z0,levels_from:"раскладка панелей АР",confidence:q&&!differs?"high":"medium",section:"АР",view:v,line:across0,
    axis_x:v.numbered?"":axis[0],axis_y:v.numbered?axis[0]:"",sheet:String(v.sheet),sheet_point_pt:p.pt,
    notes:["Раскладка панелей АР, лист "+v.sheet+(q?" · "+q.name+(q.ral?" · RAL "+q.ral+(q.ral_inside?"/"+q.ral_inside:""):""):" · позиции нет в спецификации панелей"),
     ...(p.cut?["Низ панели по скату кровли: "+p.cut.join(" → ")]:[]),...(differs?["Размер по чертежу "+Math.round(w)+"×"+Math.round(h)+", по спецификации "+q.width_mm+"×"+q.length_mm+" — проверьте"]:[])]})
  }
 }
 // Windows, doors and gates in the openings of the walls: the block of its table whose size fits the opening (a window
 // block is 40 smaller than its opening, a door 40 narrower; one at the foot of the wall stands on ±0,000). Outer doors
 // («ДБН», «ДСН») first; each position as many times as its table counts, then again with a note.
 const fills=ar.flatMap(p=>p.ar.fills||[]),used=new Map();
 // The block as its scheme in the АР draws it (from outside), turned to the direction of its record (along the axes): a
 // facade whose axes fall to the right shows it mirrored. Outside — the side of the facade. Its colour from the finish
 // of the facade (window profiles, gates and doors); a window's sill and its board (the length 40 over the block).
 const finish=ar.flatMap(p=>p.ar.finish||[]),sills=Object.assign({},...ar.map(p=>p.ar.sills||{})),boards=sills.boards||[];
 const fillLayout=(f,numbered,reversed,t)=>{
  const W=f.width_mm,low=numbered!==reversed,sk=f.sketch||{},flip=u=>reversed?W-u:u,box=r=>reversed?[W-r[1],W-r[0],r[2],r[3]]:r;
  const lay={opening:f.kind,thickness_mm:t,width_mm:W,outside:numbered?[0,low?-1:1]:[low?-1:1,0]};
  const end=h=>h==="left"?(reversed?"end":"start"):h==="right"?(reversed?"start":"end"):h;
  if(sk.fields)lay.fields=sk.fields.map(x=>({u:reversed?[W-x.u[1],W-x.u[0]]:x.u,z:x.z,sash:x.sash,...(x.open?{open:x.open,handle:end(x.handle)}:{})})).sort((a,b)=>a.u[0]-b.u[0]||a.z[0]-b.z[0]);
  if(sk.joints)lay.joints=sk.joints.map(flip).sort((a,b)=>a-b);
  if(sk.wicket)lay.wicket=box(sk.wicket);
  if(sk.panes)lay.panes=sk.panes.map(box);
  const c=finish.find(x=>x.what.includes(f.kind));if(c?.ral)lay.ral=c.ral;else if(c?.colour)lay.colour=c.colour;
  if(f.kind==="window"){if(sills.sill_ral)lay.sill_ral=sills.sill_ral;const bd=boards.find(q=>Math.abs(q.length_mm-W-40)<=15);if(bd)lay.board_mm=bd.depth_mm}
  return lay
 };
 const fitOf=(o,h,floor)=>{
  let best=null;
  for(const f of fills){
   const shapes=f.kind==="window"?[[40,40]]:f.kind==="door"?[[40,20],[40,40]]:[[0,0],[40,20]];
   for(const [dw,dh] of shapes){
    const ew=f.width_mm+dw,eh=f.height_mm+dh,dwid=o.u1-o.u0-ew,ow=Math.abs(dwid),oh=h-eh;
    // A door or a gate may stand under a panel higher than it (a transom, a louvre over it), and in a gap between the
    // joints of the panels wider than it (the pieces of panels beside it drawn without their labels).
    const wide=f.kind!=="window"&&o.base&&dwid>0&&dwid<=260;
    if(ow>60&&!wide||!(Math.abs(oh)<=60||f.kind!=="window"&&o.base&&oh>0&&oh<=900))continue;
    const outer=f.kind!=="door"||/^Д[БС]?Н/u.test(f.name),left=(f.count||1)-(used.get(f.pos)||0);
    const score=ow*(wide?.5:1)+Math.abs(oh)*(oh>0&&f.kind!=="window"?.2:1)+(outer?0:200)+(left>0?0:500);
    if(!best||score<best.score)best={f,score,dh}
   }
  }
  return best
 };
let loose=0;
 // The facades show every window, door and gate by its label («ОК-1», «Д-7», «В-1») at its block: the block of the size
 // its table gives, in the rectangle of that size (or of its opening: a window 40 larger, a door 40 wider and 20 higher)
 // nearest the label, in the wall of that side whose panels are round it (a facade shows a lower wall in front and a
 // higher one behind it). The panels the block crosses get its hole. Without facade sheets — the openings of the layouts.
 const blocks=new Map();for(const f of fills)if(!blocks.has(f.pos))blocks.set(f.pos,f);
 const facades=ar.flatMap(p=>(p.ar.facades||[]).map(v=>({...v,sheet:p.pdfPage||p.page})));
 const walls=views.map(v=>({v,off:shift(v),list:placements.filter(p=>p.view===v)})).filter(w=>w.off!==null&&w.list.length);
 const fillOf=(f,numbered,reversed,a,b,z,wall,sheet,notes,over)=>{
  const line=wall.line,t=wall.layout?.thickness_mm||150;
  placements.push({mark:f.pos,name:{window:"Окно",door:"Дверь",gate:"Ворота"}[f.kind]+" "+f.name,type_key:f.kind,scheme_group:"openings",geometry_type:"beam",
   fitting_type:f.kind,diameter_mm:f.height_mm,layout:fillLayout(f,numbered,reversed,t),
   ...(numbered?{x_mm:Math.round(a),y_mm:line,x2_mm:Math.round(b),y2_mm:line}:{x_mm:line,y_mm:Math.round(a),x2_mm:line,y2_mm:Math.round(b)}),
   z0_mm:z,z1_mm:z,levels_from:"фасады АР",confidence:over?"low":"high",section:"АР",axis_x:wall.axis_x,axis_y:wall.axis_y,sheet:String(sheet),
   notes:[...notes,...(over?["Таких по спецификации "+(f.count||1)+" — этот сверх, проверьте"]:[])]})
 };
 const cutHoles=(numbered,a,b,z0,z1,list)=>{
  for(const p of list){
   if(p.layout.cut)continue;
   const p0=numbered?p.x_mm:p.y_mm,p1=numbered?p.x2_mm:p.y2_mm,lo=Math.min(p0,p1),hi=Math.max(p0,p1),pz0=p.z0_mm,pz1=p.z0_mm+p.diameter_mm;
   const h0=Math.max(a,lo),h1=Math.min(b,hi),v0=Math.max(z0,pz0),v1=Math.min(z1,pz1);
   if(h1-h0<20||v1-v0<20)continue;
   (p.layout.holes||(p.layout.holes=[])).push([Math.round(h0-lo),Math.round(h1-lo),Math.round(v0-pz0),Math.round(v1-pz0)])
  }
 };
 if(facades.length){
  const lost=[],unknown=new Map(),taken=new Set();
  for(const fv of facades){
   const off=shift(fv);
   for(const x of fv.fills){
    const f=blocks.get(x.mark);if(!f){unknown.set(x.mark,(unknown.get(x.mark)||0)+1);continue}
    if(off===null){lost.push(x.mark+" (лист "+fv.sheet+")");continue}
    const shapes=[[0,0],...(f.kind==="window"?[[40,40]]:f.kind==="door"?[[40,20],[40,40]]:[[40,20]])];
    // Of the rectangles of its size, the nearest to the label not taken by another label.
    let best=null;
    for(const r of x.rects){const w=r[1]-r[0],h=r[3]-r[2];if(taken.has(Math.round((r[0]+r[1])/2/100)+"|"+Math.round((r[2]+r[3])/2/100)+"|"+fv.numbered+fv.reversed))continue;
     const far=Math.hypot(Math.max(0,r[0]-x.u,x.u-r[1]),Math.max(0,r[2]-x.z,x.z-r[3]));
     for(const [dw,dh] of shapes){const ew=Math.abs(w-f.width_mm-dw),eh=Math.abs(h-f.height_mm-dh);if(ew>60||eh>60)continue;
      const score=far+ew+eh+(dw||dh?10:0);if(!best||score<best.score)best={r,score}}}
    // A door or a gate whose foot a stair or a platform in front hides: by its width and its head.
    let byHead=null;
    if(!best&&f.kind!=="window")for(const r of x.rects){const ew=Math.abs(r[1]-r[0]-f.width_mm),ew2=Math.abs(r[1]-r[0]-f.width_mm-40);
     if(Math.min(ew,ew2)<=60&&r[3]-r[2]>=f.height_mm-60){byHead={r};break}}
    if(!best&&!byHead){lost.push(x.mark+" (лист "+fv.sheet+")");continue}
    {const q=(best||byHead).r;taken.add(Math.round((q[0]+q[1])/2/100)+"|"+Math.round((q[2]+q[3])/2/100)+"|"+fv.numbered+fv.reversed)}
    const r=(best||byHead).r,uc=(r[0]+r[1])/2+off,a=Math.round(uc-f.width_mm/2),b=a+f.width_mm;
    let z=byHead?Math.round(r[3]-f.height_mm-(Math.abs(r[1]-r[0]-f.width_mm-40)<Math.abs(r[1]-r[0]-f.width_mm)?20:0)):f.kind==="window"?Math.round((r[2]+r[3]-f.height_mm)/2):r[2];if(Math.abs(z)<=30)z=0;
    const zc=z+f.height_mm/2;let wall=null,wd=Infinity;
    for(const w of walls){if(w.v.numbered!==fv.numbered||w.v.reversed!==fv.reversed)continue;
     for(const p of w.v.panels){const d=Math.hypot(Math.max(0,p.u0+w.off-uc,uc-(p.u1+w.off)),Math.max(0,p.z0-zc,zc-p.z1));if(d<wd){wd=d;wall=w}}}
    if(!wall||wd>3000){lost.push(x.mark+" (лист "+fv.sheet+", стены этой стороны нет в раскладке)");continue}
    used.set(f.pos,(used.get(f.pos)||0)+1);
    fillOf(f,fv.numbered,fv.reversed,a,b,z,wall.list[0],fv.sheet,["Фасад АР, лист "+fv.sheet+": "+f.pos+" "+f.width_mm+"×"+f.height_mm+" ("+f.name+")",...(byHead?["Низ закрыт на фасаде лестницей или площадкой — поставлен по верху, проверьте"]:[])],(used.get(f.pos)||0)>(f.count||1));
    cutHoles(fv.numbered,a,b,z,z+f.height_mm,wall.list)
   }
  }
  if(lost.length)warnings.push("Окна, двери, ворота на фасадах без контура своего размера — не поставлены: "+lost.join(", "));
  if(unknown.size)warnings.push("На фасадах есть позиции, которых нет в спецификациях окон, дверей и ворот: "+[...unknown].map(([k,n])=>k+(n>1?" ×"+n:"")).join(", "));
  // What the tables count and the facades do not show: inner doors and gates (in the partitions), or not found.
  const fewer=[],inner=[];
  for(const f of blocks.values()){const n=used.get(f.pos)||0,k=f.count||1;if(n>=k)continue;(n?fewer:inner).push(f.pos+(n?" "+n+" из "+k:" ×"+k))}
  if(fewer.length)warnings.push("На фасадах меньше, чем по спецификации: "+fewer.join(", "));
  if(inner.length)warnings.push("Нет на фасадах (внутренние, в перегородках) — пока не поставлены: "+inner.join(", "));
 }
 else for(const v of views){
  const off=shift(v);if(off===null)continue;
  const wall=placements.find(p=>p.sheet===String(v.sheet)&&p.view===v);
  for(const o of v.openings||[]){
   const floor=o.base&&o.z0<=600?0:o.z0,h=o.z1-floor,fit=fitOf(o,h,floor);
   if(!fit){loose++;continue}
   const f=fit.f;used.set(f.pos,(used.get(f.pos)||0)+1);
   const w=o.u1-o.u0,t=wall?.layout?.thickness_mm||150,a=o.u0+off+(w-f.width_mm)/2,b=a+f.width_mm;
   const z=f.kind==="window"?Math.round(o.z0+(o.z1-o.z0-f.height_mm)/2):floor,line=wall?.line;
   if(!line)continue;
   const over=(used.get(f.pos)||0)>(f.count||1);
   placements.push({mark:f.pos,name:{window:"Окно",door:"Дверь",gate:"Ворота"}[f.kind]+" "+f.name,type_key:f.kind,scheme_group:"openings",geometry_type:"beam",
    fitting_type:f.kind,diameter_mm:f.height_mm,layout:fillLayout(f,v.numbered,v.reversed,t),
    ...(v.numbered?{x_mm:Math.round(a),y_mm:line,x2_mm:Math.round(b),y2_mm:line}:{x_mm:line,y_mm:Math.round(a),x2_mm:line,y2_mm:Math.round(b)}),
    z0_mm:z,z1_mm:z,levels_from:"проём в раскладке панелей АР",confidence:over?"low":"medium",section:"АР",axis_x:wall.axis_x,axis_y:wall.axis_y,sheet:String(v.sheet),
    notes:["Проём "+Math.round(w)+"×"+Math.round(h)+" в раскладке панелей АР, лист "+v.sheet+"; "+f.pos+" по размеру ("+f.width_mm+"×"+f.height_mm+")"+(fit.dh&&h-f.height_mm>80?"; над ним панель или решётка — проверьте":""),
     ...(over?["Таких по спецификации "+(f.count||1)+" — этот сверх, проверьте"]:[])]})
  }
 }
 if(loose)warnings.push("Проёмов без подходящего окна, двери или ворот в спецификациях: "+loose+" (вентрешётки, проёмы под оборудование) — не заполнены");
 for(const p of placements){delete p.view;delete p.line}
 const cuts=all.filter(v=>v.section).map(v=>v.section);
 if(cuts.length)warnings.push("Перегородки по разрезам "+[...new Set(cuts)].join(", ")+": место разреза на плане не читается — пока не поставлены");
 if(!placements.length)return null;
 return{kind:"ar",title:"АР: стены из сэндвич-панелей, окна, двери, ворота",docType:"АР",axesX:ax,axesY:ay,spansX:sx,spansY:sy,sizeX:cumulative(sx).at(-1),sizeY:cumulative(sy).at(-1),placements,warnings}
}

// Architecture and technology drawings are reference for the frame: their schemes are off unless ticked.
const reference=p=>p.docType==="АР"||p.docType==="ТХ";
// Roof sheeting and decking are not frame members; such schemes are off unless ticked.
const SHEETING=/лист[аы]?\s+покрыти|настил|профлист|профнастил/iu;
const {buildTanks:buildTank,tankGap}=require("./ai-tank-extract");
const {buildVessel,vesselFromSheets}=require("./ai-vessel");
// The checked scheme as one scheme of the plan: its grid and its elements in mm, levels as they were checked.
function verifiedScheme(ai){
 const v=ai?.verified;if(!v?.elements?.length)return null;
 const g=v.grid||{},ax=(g.axes_x||[]).map(String),ay=(g.axes_y||[]).map(String);
 const sx=(g.x_spans_mm||g.spans_x_mm||[]).map(Number),sy=(g.y_spans_mm||g.spans_y_mm||[]).map(Number);
 const fx=Math.max(1000,...v.elements.map(e=>Math.max(e.x_mm||0,e.x2_mm||0)+(e.radius_mm||0))),fy=Math.max(1000,...v.elements.map(e=>Math.max(e.y_mm||0,e.y2_mm||0)+(e.radius_mm||0)));
 const ok=ax.length>=2&&ay.length>=2&&sx.length===ax.length-1&&sy.length===ay.length-1;
 return{kind:"verified",title:"Проверенная схема"+(v.title?" · "+v.title:""),at:v.at,axesX:ok?ax:["1","2"],axesY:ok?ay:["А","Б"],spansX:ok?sx:[fx],spansY:ok?sy:[fy],
  // Joints are kept once per sheet (verified.joints) and named by the elements.
  placements:withNodes(v,v.elements.map(e=>({...e,...(typeof e.joint==="string"?{joint:v.joints?.[e.joint]||undefined}:{}),levels_from:"проверено инженером",confidence:"high",notes:["Как в проверенной инженером схеме"]}))),warnings:[]}
}
// The nodes of the drawings checked for this set (verified.nodes / node_rules), each element its own.
function withNodes(v,list){require("./ai-node-specs").attachNodes(list,v.nodes,v.node_rules);return list}
// The nodes a sheet names («Узел 2. Крепление связей к колонне») with the joints of the catalog their words fit
// (src/ai-joint-catalog.js, ТЗ «1000 монтажных узлов») — a hint the 3D card shows, never a confirmation.
let jointCatalog=null;
function sheetNodes(text){
 if(!jointCatalog){try{jointCatalog=require("./ai-joint-catalog").load()}catch{jointCatalog={sheetNodes:()=>[]}}}
 return jointCatalog.sheetNodes(text).filter(n=>n.joints.length).slice(0,12).map(n=>({label:n.label,title:n.title,group:n.group,joints:n.joints.slice(0,2)}))
}
function buildPlan(draft,ai=null,heights={},opts={}){
 const catalog=buildCatalog(draft,ai);
 // КМ and КМД number their marks differently: with КМД mounting schemes in the set, КМ plans are reference only.
 const kmdMounting=(draft.pages||[]).some(p=>p.docType==="КМД монтажные"&&(p.schemes||[]).some(s=>!s.error));
 // Joints of a scheme: its own sheet's notes, else the notes of the volume («все неоговоренные болты М20»).
 const sheetJoint=new Map(),fileJoint=new Map();
 for(const p of draft.pages||[]){const j=jointNote(p.context?.text),named=sheetNodes(p.context?.text);if(!j&&!named.length)continue;
  sheetJoint.set(p.page,{...(j||{bolt:null,cls:null,weld:false,text:""}),...(named.length?{named}:{}),sheet:(p.sourceName||"")+" стр. "+(p.pdfPage||p.page)});
  if(j&&/неоговоренные/.test(j.text)&&!fileJoint.has(p.sourceName))fileJoint.set(p.sourceName,{...j,sheet:sheetJoint.get(p.page).sheet})}
 // A sheet that names its nodes but not its bolts takes the bolts of the volume's notes.
 const joints=info=>{if(!info)return null;const s=sheetJoint.get(info.page),f=fileJoint.get(info.file);return s&&!s.text&&f?{...f,named:s.named}:s||f||null};
 const decisions=new Map((ai?.schemes||[]).map(s=>[s.page+":"+s.index,s]));
 const candidates=[],skipped=[],schemeInfo=[];
 const docTypes=new Set((draft.pages||[]).map(p=>p.docType).filter(Boolean));
 // A scheme the engineer checked for these very drawings («Схема проверена»): placed as it was checked, nothing
 // is read again over it.
 const ver=verifiedScheme(ai);
 if(ver){
  const key="verified";
  const info={key,page:0,index:"verified",title:ver.title,file:"База знаний",sheet:"",count:ver.placements.length,
   place:typeof heights[key]?.place==="boolean"?heights[key].place:true,reason:"Проверено инженером"+(ver.at?" "+String(ver.at).slice(0,10):""),docType:"КМД монтажные",manual:false,z0_mm:null,z1_mm:null};
  schemeInfo.push(info);if(info.place)candidates.push({scheme:ver,info,decision:null})
 }
 // Assembly drawings never provide placements, even if a detail looks like a grid.
 if(!ver)for(const p of draft.pages||[])if(p.docType!=="КМД сборочные")(p.schemes||[]).forEach((s,index)=>{
  const key=p.page+":"+index,decision=decisions.get(key);
  const manual=Number.isFinite(Number(heights[key]?.z0_mm))&&Number.isFinite(Number(heights[key]?.z1_mm))&&heights[key].z0_mm!==""&&heights[key].z1_mm!=="";
  const info={key,page:p.page,index,title:s.title,file:p.sourceName||"",volume:volumeOf(p),sheet:p.pdfPage||p.page,count:(s.placements||[]).length,
   place:!s.error&&(s.placements||[]).length>0&&!reference(p)&&(decision?decision.place!==false:!(kmdMounting&&p.docType==="КМ")&&!SHEETING.test(s.title||"")),
   reason:s.error||(reference(p)?p.docType+" — справочно: монтажные элементы из него добавляет Claude (можно включить)":"")||decision?.reason||(kmdMounting&&p.docType==="КМ"?"КМ — справочно, расстановка по КМД":SHEETING.test(s.title||"")?"Настил, листы — не каркас (можно включить)":""),docType:p.docType||"",
   manual,z0_mm:manual?Number(heights[key].z0_mm):decision?Number(decision.z0_mm):null,
   z1_mm:manual?Number(heights[key].z1_mm):decision?Number(decision.z1_mm):null};
  // The engineer's checkbox overrides the AI decision.
  if(typeof heights[key]?.place==="boolean"&&!s.error&&(s.placements||[]).length)info.place=heights[key].place;
  schemeInfo.push(info);
  if(info.place)candidates.push({scheme:s,info,decision})
 });
 // A tank set: one tank built from its plan and facade sheets (src/ai-tank-extract.js).
 // A checked entry of the knowledge base goes before the reading of the sheets; Claude's fresh answer after it.
 const tank=ver?null:buildTank(ai?.fromKnowledge||ai?.checkedTank?[...claudeTankPage(ai),...(draft.pages||[])]:[...(draft.pages||[]),...claudeTankPage(ai)]);
 if(tank){
  const key="tank",decision=decisions.get(key),s=tank.scheme;
  const info={key,page:tank.page,index:"tank",title:s.title,file:tank.sourceName||"",sheet:tank.pdfPage||tank.page,count:s.placements.length,
   place:typeof heights[key]?.place==="boolean"?heights[key].place:decision?decision.place!==false:true,reason:(s.warnings||[]).join("; "),docType:tank.docType||"",manual:false,z0_mm:null,z1_mm:null};
  schemeInfo.push(info);if(info.place)candidates.push({scheme:s,info,decision})
 }
 // A vessel on supports (чан, ёмкость с конусом) with no mounting scheme: built round its centre from Claude's answer
 // (or a checked set), else from its assembly sheets (src/ai-vessel.js). Never when a tank or a scheme was found.
 if(!tank&&!candidates.length){
  const v=ai?.vessel?.is_vessel&&((ai.vessel.parts||[]).length||ai.vessel.diameter_mm>0)?ai.vessel:vesselFromSheets(draft.pages,mark=>catalog.get(markKey("КМД",mark)));
  const built=v&&buildVessel(v);
  if(built){
   const key="vessel",s=built.scheme;
   const info={key,page:0,index:"vessel",title:s.title,file:built.sourceName,sheet:"",count:s.placements.length,
    place:typeof heights[key]?.place==="boolean"?heights[key].place:true,reason:(s.warnings||[]).join("; "),docType:built.docType,manual:false,z0_mm:null,z1_mm:null};
   schemeInfo.push(info);if(info.place)candidates.push({scheme:s,info,decision:null})
  }
 }
 // АР read from its sheets: the panels of the facades on their walls.
 const fromAr=ver?null:arScheme(draft.pages||[]);
 if(fromAr){
  const key="ar",s=fromAr;
  const info={key,page:0,index:"ar",title:s.title,file:"",sheet:"",count:s.placements.length,
   place:typeof heights[key]?.place==="boolean"?heights[key].place:true,reason:(s.warnings||[]).join("; "),docType:"АР",manual:false,z0_mm:null,z1_mm:null};
  schemeInfo.push(info);if(info.place)candidates.push({scheme:s,info,decision:null})
 }
 // Members Claude found that the geometry did not: a scheme of their own, on Claude's grid (merged by axis names).
 // Walls of panels the АР sheets placed are not taken from Claude again.
 const fromClaude=ver?null:claudeScheme(ai,candidates,{wallPanels:!fromAr});
 if(fromClaude){
  const key="claude",s=fromClaude;
  const info={key,page:0,index:"claude",title:s.title,file:"",sheet:"",count:s.placements.length,
   place:typeof heights[key]?.place==="boolean"?heights[key].place:true,reason:"Определено Claude по листам — проверьте положение",docType:s.docType,manual:false,z0_mm:null,z1_mm:null};
  schemeInfo.push(info);if(info.place)candidates.push({scheme:s,info,decision:null})
 }
 const placed=candidates.filter(c=>c.scheme.kind==="tank"||c.scheme.kind==="verified"||c.scheme.kind==="elevation"&&(c.scheme.axesX?.length||0)+(c.scheme.axesY?.length||0)>=3||c.scheme.axesX?.length>=2&&c.scheme.axesY?.length>=2||c.scheme.local&&c.scheme.axesX?.length>=1&&c.scheme.axesY?.length>=1);
 // Sheets of a tank that gave none say what they lack (a scan of a montage scheme without the diameter).
 const gap=!tank&&!ver?tankGap(draft.pages||[]):null;
 if(!placed.length)return{grid:null,elements:[],skipped,schemes:schemeInfo,ready:false,problems:["Нет схем для расстановки",...(gap?[gap]:[])],catalog};
 const merged=mergeGrids(placed.map(c=>c.scheme));
 seatFramed(merged,placed,draft);
 // Marks placed as columns on plans (not elevations).
 const planColumns=new Set(placed.filter(c=>c.scheme.kind!=="elevation").flatMap(c=>(c.scheme.placements||[]).filter(p=>p.geometry_type==="column").map(p=>p.mark)));
 // How many marks of an index («ФП1»…) the sheets of the set know.
 const indexCount=new Map(),indexed=prefix=>{if(!indexCount.has(prefix)){let n=0;for(const e of catalog.values())if(String(e.mark).startsWith(prefix)&&/^\d/u.test(String(e.mark).slice(prefix.length)))n++;indexCount.set(prefix,n)}return indexCount.get(prefix)};
 const problems=[],elements=[],later=[];
// Without such elements: beams and bracing at the top of the columns, columns from 0 up to the beams.
 const usual=kind=>{
  const med=v=>v.sort((a,b)=>a-b)[v.length>>1];
  const of=k=>elements.filter(e=>k==="beam"?e.geometry_type==="beam"||e.geometry_type==="bent":e.geometry_type===k).map(e=>[e.z0_mm,e.z1_mm]);
  const same=of(kind);
  if(same.length)return{z0:med(same.map(v=>v[0])),z1:med(same.map(v=>v[1]))};
  if(kind==="beam"){const c=of("column");if(c.length){const z=med(c.map(v=>v[1]));return{z0:z,z1:z}}}
  if(kind==="column"){const b=of("beam");if(b.length){const z=med(b.map(v=>v[1]));if(z>0)return{z0:0,z1:z}}}
  return null
 };
 const push=(c,q,z0,z1,levels,note)=>{
  const type=typeFor(q.pl,q.geometry,opts.typeOfMark),group=q.pl.scheme_group&&GROUPS[q.pl.scheme_group]?q.pl.scheme_group:type?type.group:groupFor(q.pl.mark,q.geometry);
  elements.push({key:"p"+c.info.page+"s"+c.info.index+"e"+q.i,mark:q.pl.mark,name:q.pl.name||type?.name||markCode(q.pl.mark)?.name||"",type_key:type?.key||"",type_name:type?.name||"",geometry_type:q.geometry,x_mm:q.x,y_mm:q.y,
   x2_mm:q.geometry==="column"?undefined:q.x2,y2_mm:q.geometry==="column"?undefined:q.y2,
   z0_mm:z0,z1_mm:z1,group,group_label:GROUPS[group],profile:q.cat?.profile||"",profile_standard:q.cat?.profile_standard||"",doc:scopeOf(c.info.docType,catalog.multi?c.info.volume:""),length_mm:q.cat?.length_mm??null,
   levels,page:c.info.page,file:c.info.file,sheet:c.info.sheet,scheme:c.info.title,confidence:"low",
   note:[...(q.pl.notes||[]),note,q.change?.note,...(q.guess||[])].filter(Boolean).join("; ")})
 };
 // A dog-leg stair read from its own plan (ГПЭС М1.25): the lower flight from the ground to the landing, the upper one
 // from it to the top. Each rises its length by its mark's sheets times the sine of the slope written on the sheet (else
 // 45°), or its run on the plan times the tangent; the top is the level of the sheet nearest their sum (within a
 // quarter of it), the landing parts the rise as the flights do.
 const legs=new Map();
 const stairLevels=c=>{
  if(legs.has(c.scheme))return legs.get(c.scheme);
  const fl=c.scheme.placements.filter(p=>p.flight?.stair==="dog-leg").sort((a,b)=>a.flight.order-b.flight.order);
  let out=null;
  if(fl.length===2){
   const deg=fl[0].flight.slope_deg||45,a=deg*Math.PI/180;
   const rise=fl.map(p=>{const run=p.flight.run_mm||0,len=catalog.get(markKey(scopeOf(c.info.docType,catalog.multi?c.info.volume:""),p.mark))?.length_mm;
    return len>0&&len*Math.cos(a)>=run*0.7&&len*Math.cos(a)<=run*1.6?{v:len*Math.sin(a),by:"length"}:{v:run*Math.tan(a),by:"run"}});
   const sum=rise[0].v+rise[1].v,page=(draft.pages||[]).find(p=>p.page===c.info.page);
   const L=[...new Set([...(c.structureLevels||[]),...(page?.levelMarks||[])])].filter(v=>Number.isFinite(v)&&v>0);
   const near=L.reduce((m,v)=>m===null||Math.abs(v-sum)<Math.abs(m-sum)?v:m,null);
   if(sum>0){const top=near!==null&&Math.abs(near-sum)<=sum*0.25?near:Math.round(sum/10)*10;
    out={base:0,top,landing:Math.round(top*rise[0].v/sum/10)*10,
     from:"двухмаршевая лестница: уклон "+deg+"°"+(fl[0].flight.slope_deg?" (по листу)":" (принят)")+", подъём маршей по "+(rise.every(r=>r.by==="length")?"длине марок":"заложению на плане")+(near===top?", верх — отметка листа":", верх по маршам")}}
  }
  legs.set(c.scheme,out);return out
 };
 for(const c of placed){
  if(merged.rejected.includes(c.scheme)){
   c.info.place=false;c.info.reason="Оси схемы не совпадают с основной сеткой";continue
  }
  // Beams sit at one level, so equal marks are valid; columns are checked per element.
  const schemeLevels=Number.isFinite(c.info.z0_mm)&&Number.isFinite(c.info.z1_mm)&&c.info.z1_mm>=c.info.z0_mm;
  let missing=0;
  const off=merged.offsets.get(c.scheme),changes=new Map((c.decision?.changes||[]).map(x=>[x.i,x]));
  const pending=[],first=elements.length;
  c.scheme.placements.forEach((pl,i)=>{
   const change=changes.get(i);
   if(change&&change.keep===false){skipped.push({mark:pl.mark,page:c.info.page,reason:change.note||"Исключено ИИ"});return}
   // A member whose place is given by another section (a platform standing on the concrete of АР): not placed
   // until that section is in the set — listed as not placed with the reason, never hung in the air.
   if(pl.needs_doc&&!docTypes.has(pl.needs_doc)){skipped.push({mark:pl.mark,page:c.info.page,reason:"Нужен раздел "+pl.needs_doc+(pl.needs_note?" — "+pl.needs_note:"")});return}
   // Element change first, then the scheme-wide kind chosen by the AI, then the PDF guess.
   const kinds=["column","beam","brace"];
   const geometry=kinds.includes(change?.geometry_type)?change.geometry_type:kinds.includes(c.decision?.geometry_type)?c.decision.geometry_type:pl.geometry_type;
   // A point found in the PDF becomes a member only if its ends were found too.
   // A column, a tank wall and a round plate (bottom, ring platform) stand at one point (the wall at its centre).
   const point=geometry==="column"||geometry==="shell"||geometry==="plate";
   let ends=!point&&pl.x2_mm===undefined?pl.line:null;
   // Everything read is placed: a member whose ends were not found is drawn from its point along the grid, as long as
   // its mark (or 1 m), and marked to be checked.
   const guess=pl.needs_doc?["Место — по разделу "+pl.needs_doc+", проверьте"]:[];
   if(!point&&pl.x2_mm===undefined&&!ends){
    const cat0=catalog.get(markKey(scopeOf(c.info.docType,catalog.multi?c.info.volume:""),pl.mark)),L=cat0?.length_mm>300?cat0.length_mm:1000;
    ends={x_mm:pl.x_mm,y_mm:pl.y_mm,x2_mm:(pl.x_mm||0)+L,y2_mm:pl.y_mm};guess.push("Концы не найдены — поставлен условно от надписи, проверьте")
   }
   // Heights: AI per element, then the mark's assembly drawing, then the scheme (typed or AI).
   const cat=catalog.get(markKey(scopeOf(c.info.docType,catalog.multi?c.info.volume:""),pl.mark));
   // The name the mark's own sheet gives it (kept on the scheme's copy only).
   if(!pl.name&&cat?.name)pl={...pl,name:cat.name};
   // A bare number read as a mark by the index of the notes that no sheet of the set knows, while the set's sheets
   // know marks of that index (a small size on a shelf looks the same): not placed, listed with the reason.
   if(pl.by_index&&!cat&&indexed(pl.by_index)>=5){skipped.push({mark:pl.mark,page:c.info.page,reason:"Марки нет на листах комплекта — вероятно, это размер, проверьте"});return}
   // A column labelled under its line on the elevation of a wall (the girts' scheme) is read as a member along the wall;
   // the plan of columns places it.
   const named=pl.name?ST.typeByName(pl.name):null;
   if(c.scheme.kind==="elevation"&&named?.geometry==="column"&&geometry!=="column"&&planColumns.has(pl.mark)){skipped.push({mark:pl.mark,page:c.info.page,reason:"Колонна на развёртке стены — поставлена по схеме колонн"});return}
   // A tie, a purlin or a spacer of a roof plan read at a point (its label by a column symbol, its line not found) is
   // not a post standing from the ground up into the roof: listed as not placed, to be put in by hand.
   if(geometry==="column"&&!c.scheme.kind&&ROOF.test(String(c.info.title||""))&&named&&named.geometry!=="column"&&["ties","purlins","spacers","braces"].includes(named.group)){skipped.push({mark:pl.mark,page:c.info.page,reason:"На схеме покрытия найдено точкой, а по названию это «"+pl.name+"» — линия не найдена, поставьте вручную"});return}
   // The name the sheets give and the drawing disagree (a «Балка площадки» labelled at a small square): placed as
   // drawn, said.
   if(named&&!c.scheme.kind&&(named.geometry==="column")!==(geometry==="column")&&["column","beam"].includes(named.geometry))guess.push("По названию «"+pl.name+"» — "+(named.geometry==="column"?"колонна/стойка":"балка")+", на схеме найдено "+(geometry==="column"?"точкой":"линией")+" — проверьте");
   const own=change&&!c.info.manual&&Number.isFinite(change.z0_mm)&&Number.isFinite(change.z1_mm);
   // An elevation gives every member its own heights.
   const drawn=!own&&Number.isFinite(pl.z0_mm)&&Number.isFinite(pl.z1_mm)?{z0:pl.z0_mm,z1:pl.z1_mm,from:pl.levels_from||"развёртка"}:null;
   // Bracing drawn on a plan lies in the plane of the beams: its height is a beam level.
   const levelKind=geometry==="brace"&&c.scheme.kind!=="elevation"?"beam":geometry;
   // A structure on its own sheets: the level of its sheets, not that of the same mark elsewhere in the volume.
   const sheetLevel=!own&&!drawn&&Number.isFinite(c.structureLevel)?(geometry==="column"?{z0:0,z1:c.structureLevel,from:"отметки листов конструкции",zeroBase:true}:{z0:c.structureLevel,z1:c.structureLevel,from:"отметки листов конструкции"}):null;
   // A stair flight climbs from its tier to the next level of the structure (or, on the top plan, arrives there from
   // the level below); flights without a tier follow one another up the levels of the structure's sheets.
   let flightLevel=null;
   // A dog-leg stair read from its own plan: its flights, landing and railings at the stair's levels.
   const leg=!own&&(pl.flight?.stair==="dog-leg"||pl.stair)?stairLevels(c):null;
   if(leg){const k=pl.flight?.stair==="dog-leg"?pl.flight.order:pl.stair==="flight"?pl.stair_flight:null;
    flightLevel=k===0?{z0:leg.base,z1:leg.landing}:k===1?{z0:leg.landing,z1:leg.top}:pl.stair==="landing"?{z0:leg.landing,z1:leg.landing}:pl.stair==="top"?{z0:leg.top,z1:leg.top}:null;
    if(flightLevel)flightLevel.from=leg.from}
   if(pl.flight&&!own&&!flightLevel){
    const L=c.structureLevels||[0,...[c.structureLevel,c.scheme.levelNotes?.z1_mm].filter(Number.isFinite)];
    const f=pl.flight,t=f.tier,above=z=>L.find(v=>v>z),below=z=>[...L].reverse().find(v=>v<z);
    const pick=v=>!Array.isArray(v)||!v.length?null:Number.isFinite(t)?v.reduce((a,b)=>Math.abs(b-t)<Math.abs(a-t)?b:a):v[0];
    // The marks of the landings at its ends. A flight going up from its landing toward a lower mark is cut by the plan:
    // that mark is of the landing below, seen under the cut, and the flight climbs to the next level of the structure.
    const a=pick(f.from_mm),b=pick(f.to_mm);
    if(a!==null&&b!==null&&b>a)flightLevel={z0:a,z1:b};
    else if(a!==null){
     const up=above(a);
     if(up!==undefined)flightLevel={z0:a,z1:up};
     else if(L.length>=2&&b!==null){skipped.push({mark:pl.mark,page:c.info.page,reason:"Марш выше верхней отметки конструкции ("+a+") — не ставится, проверьте по разрезу"});return}
    }
    else if(b!==null){const down=below(b);if(down!==undefined)flightLevel={z0:down,z1:b}}
    if(flightLevel)flightLevel.from="отметки площадок на схеме";
    else{
     // Without marks: from its tier to the next level (or, on the top plan, from the level below to it); the plan of
     // one level is reached from the level below; flights without either follow one another up the levels.
     const T=c.scheme.framed?.levels_mm||[];
     if(Number.isFinite(t)){const up=above(t),down=below(t);flightLevel=up!==undefined?{z0:t,z1:up}:down!==undefined?{z0:down,z1:t}:null}
     else if(T.length===1&&below(T[0])!==undefined)flightLevel={z0:below(T[0]),z1:T[0]};
     else if(L.length>=2){const i=Math.min(f.order,L.length-2);flightLevel={z0:L[i],z1:L[i+1]}}
     if(flightLevel)flightLevel.from="уровни листов конструкции"
    }
   }
   // A ladder (стремянка) stands from the lowest to the highest level of its section (ГПЭС М1.27 «4-4»: +0,210 … +7,890).
   const ladder=!own&&!drawn&&(pl.fitting_type==="ladder"||named?.key==="ladder")&&Array.isArray(cat?.section_span_mm)?{z0:cat.section_span_mm[0],z1:cat.section_span_mm[1],from:"разрез (низ и верх стремянки)"}:null;
   let local=own?null:flightLevel||drawn||ladder||sheetLevel||drawingLevels(levelKind,cat,c.scheme.levelNotes,pl.sheet_point_pt);
   // A roof is never at the ground: a beam of a roof plan read under +1,000 (a size of the section taken for its level)
   // takes its level from its neighbours instead.
   if(local&&levelKind!=="column"&&ROOF.test(String(c.info.title||""))&&Math.max(local.z0,local.z1)<1000&&!flightLevel)local=null;
   let z0=own?change.z0_mm:local?local.z0:c.info.z0_mm,z1=own?change.z1_mm:local?local.z1:c.info.z1_mm;
   const src=ends||pl;let [x,y]=frameOf(off,src.x_mm,src.y_mm),[x2,y2]=frameOf(off,src.x2_mm??src.x_mm,src.y2_mm??src.y_mm);
   if(!(Number.isFinite(z0)&&Number.isFinite(z1))||(!own&&!local&&!schemeLevels)){
    // Without levels of its own a member takes them from its neighbours (below): it is still placed, to be checked.
    pending.push({pl,i,geometry,cat,change,x,y,x2,y2,guess});
    return
   }
   const inside=v=>v>=-1&&v<=merged.grid.span_x_mm+1,insideY=v=>v>=-1&&v<=merged.grid.span_y_mm+1;
   // A verified scheme also holds what stands beyond the outer axes (canopies, stairs, platforms).
   if(c.scheme.kind!=="verified"&&c.scheme.kind!=="tank"&&c.scheme.kind!=="ar"&&(!inside(x)||!insideY(y)||!point&&(!inside(x2)||!insideY(y2))))guess.push("За крайними осями — проверьте");
   // A size taken from the view where several numbers could be it: the element is «неоднозначно».
   const vague=cat?.length_mm>300&&cat.length_ambiguous?" (размер вида неоднозначен: "+cat.length_ambiguous.join(" или ")+")":"";
   if(!point&&Math.hypot(x2-x,y2-y)<1){x2=x+(cat?.length_mm>300?cat.length_mm:1000);guess.push("Концы совпали — поставлен условно"+vague+", проверьте")}
   if(point&&z1<=z0){z1=z0+(cat?.length_mm>300?cat.length_mm:3000);guess.push("Верх не выше низа — высота условная"+vague+", проверьте")}
   const type=typeFor(pl,geometry,opts.typeOfMark);
   const group=pl.scheme_group&&GROUPS[pl.scheme_group]?pl.scheme_group:type?type.group:geometry==="shell"?"tanks":groupFor(pl.mark,geometry);
   // The ridge applies when the member in the section is as long as on the plan (not a beam cut across).
   const plan=Math.hypot(x2-x,y2-y),rg=geometry==="beam"&&local?.ridge&&Math.abs(local.ridge.len-plan)<=plan*0.25?local.ridge:null;
   const ridge=rg?{mid_x_mm:Math.round(x+(x2-x)*rg.t),mid_y_mm:Math.round(y+(y2-y)*rg.t),mid_z_mm:rg.z}:{};
   elements.push({key:"p"+c.info.page+"s"+c.info.index+"e"+i,mark:pl.mark,name:pl.name||type?.name||markCode(pl.mark)?.name||"",type_key:type?.key||"",type_name:type?.name||"",geometry_type:rg?"bent":geometry,...ridge,
    x_mm:x,y_mm:y,x2_mm:point?undefined:x2,y2_mm:point?undefined:y2,...(geometry==="shell"||geometry==="plate"?{radius_mm:pl.radius_mm,inner_radius_mm:pl.inner_radius_mm,shell_open:pl.shell_open,...(pl.cone_rise_mm?{cone_rise_mm:pl.cone_rise_mm}:{}),...(pl.sector_deg>0?{sector_start_deg:pl.sector_start_deg,sector_deg:pl.sector_deg}:{})}:{}),...(pl.fitting_type?{fitting_type:pl.fitting_type,diameter_mm:pl.diameter_mm}:{}),...(pl.layout&&typeof pl.layout==="object"?{layout:pl.layout}:{}),
    z0_mm:geometry==="beam"&&!drawn&&!flightLevel?z1:z0,z1_mm:z1,group,group_label:GROUPS[group],
    // A verified scheme carries its own profiles and truss lattices.
    profile:pl.profile||cat?.profile||"",profile_standard:pl.profile?"":cat?.profile_standard||"",...(pl.truss?{truss:pl.truss.kind==="frame"&&cat?.profile?{...pl.truss,members:pl.truss.members.map(m=>m[5]?m:[...m.slice(0,5),cat.profile])}:pl.truss}:{}),...(pl.nodes?{nodes:pl.nodes}:{}),...(pl.base&&typeof pl.base==="object"?{base:pl.base}:{}),...(pl.joint||joints(c.info)||cat?.fasteners?{joint:withFasteners(pl.joint||joints(c.info),cat?.fasteners)}:{}),...(cat?.drill?{drill:cat.drill}:{}),...(cat?.cuts?{cuts:cat.cuts}:{}),...(cat?.parts?{parts:cat.parts}:{}),...(cat?.plates?{plates:cat.plates}:{}),doc:scopeOf(c.info.docType,catalog.multi?c.info.volume:""),length_mm:cat?.length_mm??null,levels:own?"Claude":local?local.from:"схема",...(!own&&local?.zeroBase?{z0_assumed:true}:{}),
    page:c.info.page,file:c.info.file,sheet:c.info.sheet,...(!c.info.page&&pl.sheet?{source_sheet:String(pl.sheet)}:{}),...(pl.section?{section:pl.section}:{}),scheme:c.info.title,confidence:pl.confidence,note:[...(pl.notes||[]),change?.note,...guess].filter(Boolean).join("; ")})
  });
  // Bracing and secondary members meet the beams of the same plan: their ends take those beams' levels.
  const beams=elements.slice(first).filter(e=>e.geometry_type!=="column");
  const levelAt=(x,y)=>{
   let best=null;
   for(const b of beams){
    const vx=b.x2_mm-b.x_mm,vy=b.y2_mm-b.y_mm,l2=vx*vx+vy*vy||1,t=Math.max(0,Math.min(1,((x-b.x_mm)*vx+(y-b.y_mm)*vy)/l2));
    const d=Math.hypot(b.x_mm+vx*t-x,b.y_mm+vy*t-y);
    if(d<=400&&(!best||d<best.d))best={d,z:b.z0_mm+(b.z1_mm-b.z0_mm)*t}
   }
   return best?Math.round(best.z/10)*10:null
  };
  // Columns: a column of the same plan with levels (columns of one frame share base and top). Marks numbered next
  // to it (К184 for К185) come first, then columns on the same grid line, then the nearest.
  const columns=elements.slice(first).filter(e=>e.geometry_type==="column");
  const family=m=>{const r=/^(\D+)(\d+)/u.exec(normMark(m)||"");return r?{p:r[1],n:Number(r[2])}:null};
  const columnAt=(x,y,mark)=>{
   const f=family(mark);let best=null;
   for(const e of columns){
    const d=Math.hypot(e.x_mm-x,e.y_mm-y);if(d>24000)continue;
    const g=family(e.mark),near=f&&g&&f.p===g.p&&Math.abs(f.n-g.n)<=3,line=Math.abs(e.x_mm-x)<1||Math.abs(e.y_mm-y)<1;
    const score=d+(near?0:1e5)+(line?0:3e4);
    if(!best||score<best.score)best={score,z0:e.z0_mm,z1:e.z1_mm}
   }
   return best
  };
  const schemeMode=geometry=>{
   const col=geometry==="column",same=elements.slice(first).filter(e=>(e.geometry_type==="column")===col&&!e.fitting_type&&e.levels!=="схема"&&!WEAK_LEVELS.test(String(e.levels||"")));
   if(same.length<3)return null;
   const count=new Map();for(const e of same){const k=col?e.z0_mm+"|"+e.z1_mm:String(e.z1_mm);count.set(k,(count.get(k)||0)+1)}
   const [k,n]=[...count].sort((a,b)=>b[1]-a[1])[0];
   if(n<3||n<same.length*0.4)return null;
   const [a,b]=k.split("|").map(Number);return col?{z0:a,z1:b}:{z0:a,z1:a}
  };
  // Last resort: the usual levels of that kind on the whole set, so that the element is in the scheme to be corrected.
  const inside=v=>v>=-1&&v<=merged.grid.span_x_mm+1,insideY=v=>v>=-1&&v<=merged.grid.span_y_mm+1;
  for(const q of pending){
   if(c.scheme.kind!=="tank"&&(!inside(q.x)||!insideY(q.y)||q.geometry!=="column"&&(!inside(q.x2)||!insideY(q.y2))))q.guess=[...(q.guess||[]),"За крайними осями — проверьте"];
   let z0=null,z1=null,levels="",note="";
   // A bracket or support table without its own level is not a post: the height of the column it is fixed to
   // would draw it as one. It goes to the list of what was not placed, to be put in by hand.
   const kind=typeFor(q.pl,q.geometry,opts.typeOfMark);
   if(q.geometry==="column"&&kind?.group==="brackets"){q.guess=[...(q.guess||[]),"Кронштейн без своей отметки — высота условная, проверьте"];missing++;later.push({c,q});continue}
   // A post of a small structure is not the building column next to it.
   if(q.geometry==="column"&&!c.scheme.local){const n=columnAt(q.x,q.y,q.pl.mark);if(n){z0=n.z0;z1=n.z1;levels="по соседним колоннам";note="Отметки по ближайшей колонне схемы"}}
   else if(c.scheme.kind!=="elevation"){z0=levelAt(q.x,q.y);z1=levelAt(q.x2,q.y2);levels="по соседним балкам";note="Отметки по балкам, к которым примыкает"}
   // The posts of a small structure (a porch: «Схема расположения стоек» beside «… балок на отм. +2,100» on one sheet)
   // stand from ±0.000 up to the beams of the same sheet.
   // Its purlins («Схема расположения прогонов покрытия» beside «… элементов покрытия на отм. +2,200») lie at the level
   // of the cover plan of the same sheet.
   if((z0===null||z1===null)&&c.scheme.local&&!Number.isFinite(c.scheme.levelNotes?.z1_mm)){
    const top=((draft.pages||[]).find(p=>p.page===c.info.page)?.schemes||[]).filter(o=>o!==c.scheme&&o.local&&Number.isFinite(o.levelNotes?.z1_mm)).map(o=>o.levelNotes.z1_mm).sort((a,b)=>q.geometry==="column"?a-b:b-a)[0];
    if(Number.isFinite(top)&&top>0){
     if(q.geometry==="column"){z0=0;z1=top;levels="по балкам листа";note="Низ ±0,000, верх — отметка балок этого листа, проверьте"}
     else{z0=z1=top;levels="по схеме того же листа";note="Отметка — по схеме того же листа, проверьте"}
    }
   }
   // The level most members of the same scheme have from the drawings (the beams of a box roof at +4,510): a member
   // without its own takes it before the typical level of the whole set.
   if(z0===null||z1===null){const m=schemeMode(q.geometry);if(m){z0=m.z0;z1=m.z1;levels="как у большинства в схеме";note="Отметки — как у большинства "+(q.geometry==="column"?"колонн":"балок")+" этой схемы, проверьте"}}
   if(z0===null||z1===null){
    // Typical levels are taken once every scheme has been read (below), whatever the order of the sheets.
    missing++;later.push({c,q});continue
   }
   push(c,q,z0,z1,levels,note)
  }
 }
 // Several passes: columns placed with typical levels give the beams theirs, and the other way round.
 for(let pass=0,left=later;pass<3&&left.length;pass++){
  const next=[];
  for(const item of left){
   const {c,q}=item,u=usual(q.geometry==="brace"?"beam":q.geometry);
   if(!u){next.push(item);continue}
   push(c,q,q.geometry==="column"?u.z0:u.z1,u.z1,"нет отметок","Отметок нет — поставлены типовые для такого элемента, укажите низ и верх")
  }
  if(next.length===left.length||pass===2){for(const {c,q} of next)push(c,q,q.geometry==="column"?0:3000,3000,"нет отметок","Отметок нет ни у схемы, ни у таких элементов — поставлен условно (0…3000), укажите низ и верх");break}
  left=next
 }
 // A truss with its geometric scheme is seated by it: the end over the column named at the left of the scheme (К1 of
 // «К1 … К2») is its left end, and the bottom chord there rests on the top of that column (or on the bottom chord of a
 // supporting truss). Trusses of the same direction whose ends name no column take the direction of their neighbours.
 seatTrusses(elements,catalog);
 seatOnChords(elements);
 sectionOutliers(elements);
 roofProfiles(elements,draft,merged);
 roofOnColumns(elements);
 purlinsOnBeams(elements);
 hangTracks(elements);
 relevelNeighbours(elements);
 oneLadder(elements,skipped);
 // What is still without levels of its own after all that, per scheme: to be checked.
 const unlevelled=new Map();
 for(const e of elements){if(e.levels!=="нет отметок")continue;const k=(e.file?e.file+", лист "+e.sheet:"Лист "+e.page)+" · "+e.scheme;unlevelled.set(k,(unlevelled.get(k)||0)+1)}
 for(const [k,n] of unlevelled)problems.push(k+": "+n+" эл. без своих отметок — поставлены типовые, проверьте низ и верх");
 // A deck from the location plan without a level lies on the members drawn inside its outline (a porch roof, the
 // beams of a platform read from its own sheet): at the top most of them share.
 for(const e of elements){
  if(e.fitting_type!=="deck"||!/Отметка не найдена/.test(e.note||""))continue;
  const half=(Number(e.diameter_mm)||0)/2,x0=Math.min(e.x_mm,e.x2_mm)-(e.x_mm===e.x2_mm?half:0)-200,x1=Math.max(e.x_mm,e.x2_mm)+(e.x_mm===e.x2_mm?half:0)+200;
  const y0=Math.min(e.y_mm,e.y2_mm)-(e.y_mm===e.y2_mm?half:0)-200,y1=Math.max(e.y_mm,e.y2_mm)+(e.y_mm===e.y2_mm?half:0)+200;
  const inside=elements.filter(o=>o!==e&&o.fitting_type!=="deck"&&[[o.x_mm,o.y_mm],[o.x2_mm??o.x_mm,o.y2_mm??o.y_mm]].every(([x,y])=>x>=x0&&x<=x1&&y>=y0&&y<=y1));
  if(inside.length<2)continue;
  // The level most members inside share: a wall column passing the outline does not lift a porch roof.
  const count=new Map();for(const o of inside){const z=Math.max(o.z0_mm,o.z1_mm);count.set(z,(count.get(z)||0)+1)}
  const [top,many]=[...count].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0];
  if(!(top>0)||many<3)continue;
  e.z0_mm=e.z1_mm=top;e.levels="по конструкциям под ним";
  e.note=e.note.replace(/Отметка не найдена на схеме — поставлено на ±0,000, проверьте/,"Отметка — верх конструкций в контуре ("+(top/1000).toFixed(3).replace(".",",")+")")
 }
 raiseVerticalBraces(elements);
 trimGuardPosts(elements);
 // Purlins rest on the frames of their sheet: a purlin running more than a metre past the outer column line of the
 // same volume (around it) has been traced into an axis or a dimension line beyond it, and is cut back to that column line.
 for(const e of elements){
  if(e.group!=="purlins"||e.geometry_type!=="beam"||e.levels==="проверено инженером")continue;
  const along=Math.abs(e.x2_mm-e.x_mm)>=Math.abs(e.y2_mm-e.y_mm)?["x_mm","x2_mm"]:["y_mm","y2_mm"],k=along[0];
  const [a,b]=along,flip=e[a]>e[b],s0=flip?b:a,s1=flip?a:b,kk=k==="x_mm"?"y_mm":"x_mm";
  const near=elements.filter(c=>c.geometry_type==="column"&&c.doc===e.doc&&c[k]>=e[s0]-3000&&c[k]<=e[s1]+3000);
  if(!near.length||e[kk]<Math.min(...near.map(c=>c[kk]))-6500||e[kk]>Math.max(...near.map(c=>c[kk]))+6500)continue;
  const lines=[...new Set(near.map(c=>Math.round(c[k])))];
  if(lines.length<2)continue;
  const lo=Math.min(...lines),hi=Math.max(...lines);
  if(e[s1]<lo||e[s0]>hi)continue;
  const cut=[];if(e[s0]<lo-1000){e[s0]=lo;cut.push("начало")}if(e[s1]>hi+1000){e[s1]=hi;cut.push("конец")}
  if(cut.length)e.note=[e.note,"Обрезан по крайней колонне листа ("+cut.join(", ")+") — проверьте"].filter(Boolean).join("; ")
 }
 // The same element is often drawn on two sheets. Shields of a roof share the centre: their sectors tell them apart.
 const unique=[],seen=new Set();
 for(const e of elements){
  const k=[normMark(e.mark),e.geometry_type,Math.round(e.x_mm/100),Math.round(e.y_mm/100),Math.round((e.x2_mm??0)/100),Math.round((e.y2_mm??0)/100),Math.round(e.z0_mm/100),Math.round((e.radius_mm||0)/100),e.sector_deg>0?Math.round(e.sector_start_deg):""].join("|");
  // A verified scheme is one drawing: its close members (lattice of a two-branch column, rails) are all real.
  if(e.levels!=="проверено инженером"&&seen.has(k)){skipped.push({mark:e.mark,page:e.page,reason:"Повтор на другом листе"});continue}
  seen.add(k);unique.push(e)
 }
 // A flight is drawn on two plans (going up from one, arriving at the next): one of them.
 const flights=unique.filter(e=>e.fitting_type==="flight"),again=new Set();
 flights.forEach((e,i)=>{if(flights.slice(0,i).some(o=>!again.has(o)&&o.z0_mm===e.z0_mm&&o.z1_mm===e.z1_mm&&Math.hypot(o.x_mm-e.x_mm,o.y_mm-e.y_mm)<=400&&Math.hypot(o.x2_mm-e.x2_mm,o.y2_mm-e.y2_mm)<=400)){again.add(e);skipped.push({mark:e.mark,page:e.page,reason:"Марш показан и на соседнем плане"})}});
 if(again.size)unique.splice(0,unique.length,...unique.filter(e=>!again.has(e)));
 // A column drawn on two sheets can land a little apart (a sheet tied to the grid less exactly): of two columns of one
 // mark from different sheets closer than 2.5 m at one level, the one farther from an axis crossing is the repeat
 // (closer than 0.3 m they are one column whatever the crossing).
 const xs=[...merged.posX.values()].map(Number),ys=[...merged.posY.values()].map(Number);
 const off=e=>Math.hypot(Math.min(...xs.map(v=>Math.abs(v-e.x_mm))),Math.min(...ys.map(v=>Math.abs(v-e.y_mm))));
 const cols=unique.filter(e=>e.geometry_type==="column"&&xs.length&&ys.length),drop=new Set();
 for(const a of cols)for(const b of cols){
  if(a===b||drop.has(a)||drop.has(b)||a.page===b.page&&a.file===b.file||normMark(a.mark)!==normMark(b.mark)||a.doc!==b.doc)continue;
  if(Math.hypot(a.x_mm-b.x_mm,a.y_mm-b.y_mm)>=2500||Math.abs(a.z0_mm-b.z0_mm)>100)continue;
  const [oa,ob]=[off(a),off(b)];if(Math.abs(oa-ob)<200&&Math.hypot(a.x_mm-b.x_mm,a.y_mm-b.y_mm)>=300)continue;
  const worse=oa>ob?a:b;drop.add(worse);skipped.push({mark:worse.mark,page:worse.page,reason:"Повтор на другом листе (смещён от осей)"})
 }
 if(drop.size)unique.splice(0,unique.length,...unique.filter(e=>!drop.has(e)));
 // Sandwich panels and the trims are placed by АР only (the engineer: «сэндвич-панели не показывай без ар»): without АР
 // in the set they are listed as not placed, with the reason.
 if(!docTypes.has("АР")){const off=new Set(unique.filter(e=>ST.byKey.get(e.type_key)?.needs==="АР"));
  for(const e of off)skipped.push({mark:e.mark,page:e.page,reason:"Нужен раздел АР — сэндвич-панели и доборные элементы ставятся по АР"});
  if(off.size)unique.splice(0,unique.length,...unique.filter(e=>!off.has(e)))}
 seatBases(unique,draft,merged,catalog);
 seatColumnLattices(unique,merged,catalog);
 seatWallRails(unique,merged,catalog);
 deckFrames(unique);
 for(const e of unique){const st=instanceStatus(e);e.instance_status=st.status;if(st.reasons.length)e.instance_reasons=st.reasons}
 return{grid:merged.grid,posX:merged.posX,posY:merged.posY,elements:unique,skipped,schemes:schemeInfo,problems,ready:unique.length>0,catalog}
}
// The status of a placed element (ТЗ монтажных схем п. 24). «Подтверждено» — the engineer checked it; «вычислено» —
// its place and levels come from the drawings (scheme, section, the mark's sheet, notes, Claude reading the sheet);
// «частично» — something of it is assumed: levels of its neighbours or typical ones, a bottom at ±0,000 nobody wrote,
// ends cut or guessed (the notes «… проверьте»). An element beyond the outer axes is not assumed for that alone.
const WEAK_LEVELS=/^(по соседним|по балкам листа|по схеме того же листа|нет отметок|по конструкциям под ним|как у большинства в схеме)/u;
const SET_BY_HAND=new Set(["проверено инженером","Claude"]);
// Plans of a roof: «Схема расположения элементов покрытия…», «… на уровне верха прогонов», кровля, ригели.
const ROOF=/покрыти|кровл|прогон|ригел|стропил/iu;
const mmText=z=>(z<0?"−":"+")+(Math.abs(z)/1000).toFixed(3).replace(".",",");
// The depth of a section (mm) from the sortament of the general base (ГОСТ tables): null when the profile is unknown.
let sortament=null;
// A welded copy of a rolled I is as deep as the rolled one: «Св.I45ШС1» (written «СВ 145ШС1», its «I» as «1») — 45Ш1.
const WELDED_I=/^(?:Св\.?|Сварной)(?:I|І|1(?=\d{2}(?:ДБ|ДШ|[БШК]))|двутавр)?(\d{2,3}(?:ДБ|ДШ|[БШК]))[СC]?(\d+)$/iu;
function depthOf(e){
 if(!e?.profile)return null;
 const w=WELDED_I.exec(String(e.profile).replace(/\s+/g,"")),name=w?w[1].toUpperCase()+w[2]:String(e.profile);
 try{sortament=sortament||require("./ai-global-kb").createGlobalKnowledge()}catch{return sectionHeight(name)||null}
 const r=sortament.findProfile?.(name,{standard:e.profile_standard||""});
 return r&&r.h_mm>0?Number(r.h_mm):sectionHeight(name)||null
}
// The level of a member at a point of its plan line (a beam broken at the ridge — through its ridge).
function levelAlong(e,x,y){
 const ax=e.x_mm,ay=e.y_mm,bx=e.x2_mm??e.x_mm,by=e.y2_mm??e.y_mm,vx=bx-ax,vy=by-ay,L2=vx*vx+vy*vy||1;
 const t=Math.max(0,Math.min(1,((x-ax)*vx+(y-ay)*vy)/L2));
 if(Number.isFinite(e.mid_z_mm)&&Number.isFinite(e.mid_x_mm)){
  const tm=Math.max(0.01,Math.min(0.99,((e.mid_x_mm-ax)*vx+(e.mid_y_mm-ay)*vy)/L2));
  return t<=tm?e.z0_mm+(e.mid_z_mm-e.z0_mm)*t/tm:e.mid_z_mm+(e.z1_mm-e.mid_z_mm)*(t-tm)/(1-tm)
 }
 return e.z0_mm+(e.z1_mm-e.z0_mm)*t
}
// Where two members cross in plan: the share along each (0…1, a little past the ends allowed), or null when they
// run alongside (less than 45° between them) or miss each other.
function crossing(p,s,reach=300){
 const px=p.x2_mm-p.x_mm,py=p.y2_mm-p.y_mm,sx=s.x2_mm-s.x_mm,sy=s.y2_mm-s.y_mm,Lp=Math.hypot(px,py),Ls=Math.hypot(sx,sy);
 if(Lp<300||Ls<300)return null;
 const den=px*sy-py*sx;if(Math.abs(den)/(Lp*Ls)<Math.SQRT1_2)return null;
 const rx=s.x_mm-p.x_mm,ry=s.y_mm-p.y_mm,t=(rx*sy-ry*sx)/den,u=(rx*py-ry*px)/den;
 if(t<-reach/Lp||t>1+reach/Lp||u<-reach/Ls||u>1+reach/Ls)return null;
 return{t,u,x:p.x_mm+px*t,y:p.y_mm+py*t}
}
const firmLevels=e=>e.levels!=="схема"&&!WEAK_LEVELS.test(String(e.levels||""));
const beamLike=e=>(e.geometry_type==="beam"||e.geometry_type==="bent")&&!e.fitting_type&&Number.isFinite(e.x2_mm);
// A plan of one level (the roof of the boxes at +4,510): a beam whose level read from a section is far from the level
// nearly all the beams of the plan share has been read off another view of the sheet (a box beam drawn in the section
// of the hall under its roof, «+8,800»). It takes the plan's level, said.
function sectionOutliers(elements){
 const byScheme=new Map();
 for(const e of elements){if(!beamLike(e)||!firmLevels(e))continue;const k=e.page+"|"+e.scheme;(byScheme.get(k)||byScheme.set(k,[]).get(k)).push(e)}
 for(const list of byScheme.values()){
  if(list.length<8)continue;
  const count=new Map();for(const e of list){const z=Math.round(e.z1_mm/10)*10;count.set(z,(count.get(z)||0)+1)}
  const mode=[...count].sort((a,b)=>b[1]-a[1])[0][0],near=list.filter(e=>Math.abs(e.z0_mm-mode)<=400&&Math.abs(e.z1_mm-mode)<=400).length;
  if(near<list.length*0.6)continue;
  for(const e of list){
   if(e.levels!=="разрез"||Math.abs(e.z0_mm-mode)<=1500&&Math.abs(e.z1_mm-mode)<=1500)continue;
   e.note=[e.note,"В разрезе прочитано "+mmText(e.z1_mm)+" — выбивается из схемы (у большинства балок "+mmText(mode)+"), поставлено "+mmText(mode)+", проверьте"].filter(Boolean).join("; ");
   e.z0_mm=e.z1_mm=mode;e.levels="как у большинства в схеме"
  }
 }
}
// The line of a pitched roof through the levels written along a row of axes ({u, z}): one slope (z = c + s·u) or two
// meeting at the ridge (the lower of two lines, one rising, one falling) — the one most levels lie on, within 30 mm;
// a slip of the pen («+9,695» for +9,595, ГПЭС М1.5) falls off it. The two slopes of a ridge are alike and the ridge is
// over the middle of the levels: a ridge otherwise must hold two levels more (two slips on one side line up into a
// slope of their own, «+9,695», «+9,965» at 3 % moving the ridge 1,7 m). Null when the levels lie on no slope (a flat
// roof, a step): the readings of the sections stand.
function roofLine(points){
 const n=points.length;if(n<3)return null;
 const lines=new Map();
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
  const p=points[i],q=points[j];if(Math.abs(q.u-p.u)<1000)continue;
  const s=(q.z-p.z)/(q.u-p.u);if(Math.abs(s)<0.005||Math.abs(s)>0.3)continue;
  const c=p.z-s*p.u;lines.set(Math.round(s*1e4)+"|"+Math.round(c/5),{s,c})
 }
 const list=[...lines.values()],lo=Math.min(...points.map(p=>p.u)),hi=Math.max(...points.map(p=>p.u));
 const score=f=>{let k=0,r=0;for(const p of points){const d=Math.abs(f(p.u)-p.z);if(d<=30){k++;r+=d}}return{k,r}};
 let best=null;
 const take=(m,sc)=>{if(!best||sc.k>best.k||sc.k===best.k&&(m.parts<best.parts||m.parts===best.parts&&sc.r<best.r))best={...m,...sc}};
 for(const a of list)take({f:u=>a.c+a.s*u,parts:1,slope:a.s},score(u=>a.c+a.s*u));
 for(const a of list)for(const b of list){
  if(a.s<=0||b.s>=0)continue;
  const ur=(b.c-a.c)/(a.s-b.s);if(ur<=lo+500||ur>=hi-500)continue;
  const f=u=>Math.min(a.c+a.s*u,b.c+b.s*u),side=p=>Math.abs(f(p.u)-p.z)<=30;
  // Each slope stands on a level of its own at least, four in all.
  if(points.filter(p=>p.u<ur-500&&side(p)).length<1||points.filter(p=>p.u>ur+500&&side(p)).length<1||points.filter(side).length<4)continue;
  const sc=score(f),odd=Math.abs(a.s+b.s)>0.001||Math.abs(ur-(lo+hi)/2)>Math.max(600,(hi-lo)*0.02);
  take({f,parts:2,ridge:ur,slope:a.s},odd?{...sc,k:sc.k-1.5,real:sc.k}:sc)
 }
 if(best&&best.real!==undefined){best.k=best.real;delete best.real}
 return best&&best.k>=3&&best.k>=n*0.6?best:null
}
// A pitched roof by its sections. A section across a roof plan («3-3» along the axes 1…6 of ГПЭС М1.2) writes the
// levels of its beams at the axes (src/ai-section-extract.js, sink.profiles); one mark of a roof beam is used up and
// down the slope, and the reading of a section gives it one level only («К130» on the axes 2…5 read at 9,4…9,9, «К144»
// from +8,900 to +9,325 — the engineer, 27.10.2026: «почему висит? изучи все балки покрытия, криво все стоят»). The
// sections of a plan are those naming its marks; their levels within 0,4 m of those read there for its members (not
// those of the wall girts or of another roof drawn in the same section) and inside its axes give the line of the roof
// across one direction of the grid (the other direction stays level: the ridge runs along it). Each end of the plan's
// beams then takes its level from that line: the top of the beam on the written tops (its centre half its depth under),
// or the axis of the beams («+9,175 ось») when its profile is not known. A beam over the ridge is broken there.
function roofProfiles(elements,draft,merged){
 const profiles=(draft?.pages||[]).filter(p=>(p.docType==="КМД монтажные"||p.docType==="КМ")&&p.sectionProfiles?.length);
 if(!profiles.length||!merged?.posX)return;
 const groups=new Map();
 for(const e of elements){
  if(!ROOF.test(String(e.scheme||""))||/прогон/iu.test(String(e.scheme||""))||e.group==="purlins"||SET_BY_HAND.has(e.levels)||e.levels==="развёртка"||!Number.isFinite(e.x2_mm))continue;
  if(!beamLike(e)&&!(e.geometry_type==="brace"&&!e.fitting_type))continue;
  const k=e.page+"|"+e.scheme;(groups.get(k)||groups.set(k,[]).get(k)).push(e)
 }
 const median=v=>{v=[...v].sort((a,b)=>a-b);return v[v.length>>1]};
 for(const list of groups.values()){
  const beams=list.filter(beamLike);if(beams.length<4)continue;
  const marks=new Set(list.map(e=>normMark(e.mark)));
  const doc=beams[0].doc,found=[];
  for(const [dir,pos,a,b] of [["x",merged.posX,"x_mm","x2_mm"],["y",merged.posY,"y_mm","y2_mm"]]){
   const from=Math.min(...list.map(e=>Math.min(e[a],e[b]))),to=Math.max(...list.map(e=>Math.max(e[a],e[b])));
   const pts=[],names=new Set();
   for(const p of profiles){
    if((doc==="КМД")!==(p.docType==="КМД монтажные"))continue;
    for(const pr of p.sectionProfiles){
     const own=pr.marks.filter(m=>marks.has(normMark(m[0]))),read=own.flatMap(m=>m.slice(1)).filter(Number.isFinite);
     if(own.length<2||!read.length||pr.axes.filter(x=>pos.has(x)).length<3)continue;
     let used=false;
     for(const l of pr.levels){
      const [la,lb,t]=l.at||[];if(!pos.has(la)||!pos.has(lb))continue;
      const u=pos.get(la)+t*(pos.get(lb)-pos.get(la));
      if(u<from-1000||u>to+1000||!read.some(z=>Math.abs(l.mm-z)<=400))continue;
      pts.push({u,z:l.mm,axis:!!l.axis});used=true
     }
     if(used)names.add(pr.section)
    }
   }
   // The line by the axis levels when they give one (no slip among them), else by the tops; the tops over the axis
   // line give the depth between them.
   const axis=pts.filter(p=>p.axis),tops=pts.filter(p=>!p.axis),la=roofLine(axis),lt=roofLine(tops);
   const ratio=(l,v)=>l?l.k/v.length:0,useAxis=la&&ratio(la,axis)>=ratio(lt,tops);
   const line=useAxis?la:lt;if(!line)continue;
   const other=useAxis?tops:axis,off=other.length?median(other.map(p=>useAxis?p.z-line.f(p.u):line.f(p.u)-p.z)):null;
   found.push({dir,a,b,line,useAxis,off,names:[...names]})
  }
  // A roof sloping both ways (a hipped one) is not of this rule.
  if(found.length!==1)continue;
  const {dir,a,b,line,useAxis,off,names}=found[0];
  const top=u=>useAxis?(off!==null?line.f(u)+off:null):line.f(u),axisAt=u=>useAxis?line.f(u):off!==null?line.f(u)-off:line.f(u);
  const hb=median(beams.map(depthOf).filter(h=>h>0))||null;
  const fmt=z=>mmText(Math.round(z/5)*5);
  for(const e of list){
   const h=beamLike(e)?depthOf(e):hb;
   const zAt=u=>{const t=top(u);return Math.round((h>0&&t!==null?t-h/2:axisAt(u))/5)*5};
   const u0=e[a],u1=e[b];
   e.z0_mm=zAt(u0);e.z1_mm=zAt(u1);
   delete e.mid_x_mm;delete e.mid_y_mm;delete e.mid_z_mm;if(e.geometry_type==="bent")e.geometry_type="beam";
   if(line.ridge!==undefined&&Math.min(u0,u1)<line.ridge-100&&Math.max(u0,u1)>line.ridge+100&&beamLike(e)){
    const t=(line.ridge-u0)/(u1-u0);
    e.mid_x_mm=Math.round(e.x_mm+(e.x2_mm-e.x_mm)*t);e.mid_y_mm=Math.round(e.y_mm+(e.y2_mm-e.y_mm)*t);e.mid_z_mm=zAt(line.ridge);e.geometry_type="bent"
   }
   e.levels="по скату кровли";
   const tops=[u0,u1].map(top).filter(z=>z!==null);
   e.note=[...String(e.note||"").split("; ").filter(x=>x&&!/^(В разрезе прочитано|Отметки по балкам|Концы на колоннах|Отметки —|Отметок нет)/u.test(x)),
    "Отметки концов — по скату кровли из разрезов "+names.join(", ")+(tops.length&&beamLike(e)?" (верх "+[...new Set(tops.map(fmt))].join(" … ")+")":useAxis||off!==null?" (по оси балок)":"")].join("; ")
  }
  // A column under these beams, drawn in the section up to the roof line (its top read there at the beam's top, or a
  // slip of the pen over it: «+9,695»), would stand through the roof: it ends under the beam (the view seats it on the
  // beam's bottom with its cap plate). A post rising on past the roof (more than 0,4 m over it — a wall post to the
  // upper level) is not under the roof.
  for(const c of elements){
   if(c.geometry_type!=="column"||c.fitting_type||c.doc!==doc||SET_BY_HAND.has(c.levels)||!Number.isFinite(c.z1_mm))continue;
   let under=null;
   for(const e of beams){
    const vx=e.x2_mm-e.x_mm,vy=e.y2_mm-e.y_mm,L=Math.hypot(vx,vy);if(L<300)continue;
    const along=((c.x_mm-e.x_mm)*vx+(c.y_mm-e.y_mm)*vy)/L,off=Math.abs((c.x_mm-e.x_mm)*vy-(c.y_mm-e.y_mm)*vx)/L;
    if(off>400||along<-400||along>L+400)continue;
    const z=levelAlong(e,c.x_mm,c.y_mm),h=depthOf(e)||0;
    if(!under||z-h/2<under.bottom)under={mark:e.mark,top:z+h/2,bottom:z-h/2}
   }
   if(!under||c.z1_mm<=under.bottom||c.z1_mm>under.top+400)continue;
   c.z1_mm=Math.round(under.bottom/5)*5;
   c.note=[String(c.note||"").trim(),"Верх — под балкой покрытия "+under.mark+" (в разрезе колонна доведена до кровли), проверьте по узлу"].filter(Boolean).join("; ")
  }
 }
}
// Roof beams by the tops of the columns under their ends: the rafter of a frame is fixed flush with the column cap, so
// where a column of the set stands under the end of a beam of a roof plan and reaches its level (not more than 150 mm
// under it — a beam lying on a shorter post keeps its level; not more than 800 mm over — a wall post rising past the
// roof is not its support), the end takes the column top. A section cut across a pitched roof gives one level per
// mark; the columns give each end its own, so the roof keeps its slope.
function roofOnColumns(elements){
 const cols=elements.filter(e=>e.geometry_type==="column"&&!e.fitting_type&&Number.isFinite(e.z1_mm)&&firmLevels(e));
 for(const e of elements){
  if(!beamLike(e)&&!(e.geometry_type==="brace"&&Number.isFinite(e.x2_mm))||SET_BY_HAND.has(e.levels)||e.levels==="по скату кровли"||!ROOF.test(String(e.scheme||""))||e.group==="purlins"||/прогон/iu.test(String(e.scheme||"")))continue;
  const on=[];
  for(const [k,x,y] of [["z0_mm",e.x_mm,e.y_mm],["z1_mm",e.x2_mm,e.y2_mm]]){
   const z=e[k];let best=null;
   for(const c of cols){const d=Math.hypot(c.x_mm-x,c.y_mm-y);if(d>400||c.doc!==e.doc||c.z1_mm<z-150||c.z1_mm>z+800)continue;if(!best||d<best.d)best={d,c}}
   if(best){on.push(best.c.mark);if(best.c.z1_mm!==z)e[k]=best.c.z1_mm}
  }
  if(!on.length)continue;
  if(on.length===2&&!firmLevels(e))e.levels="по верху колонн";
  if(Number.isFinite(e.mid_z_mm)&&e.mid_z_mm<Math.max(e.z0_mm,e.z1_mm)){delete e.mid_x_mm;delete e.mid_y_mm;delete e.mid_z_mm;e.geometry_type="beam"}
  e.note=[e.note,"Концы на колоннах "+[...new Set(on)].join(", ")+" — отметки по верху колонн"].filter(Boolean).join("; ")
 }
}
// Purlins lie on the beams under them: each end at the top of the beam it rests on (with the depths of both sections,
// the members being drawn by their centre lines), so the purlins follow the slope of the roof. One mark of a purlin is
// used up and down the slope, and a section gives it one level only — the beams under it give each its own.
function purlinsOnBeams(elements){
 const lying=e=>beamLike(e)&&!SET_BY_HAND.has(e.levels)&&(e.group==="purlins"||/прогон/iu.test(String(e.scheme||""))&&(e.group==="beams"||e.group==="roof"));
 // A welded frame of a wall (a window's rails and posts) and the rails of a guard carry no purlins.
 const beams=elements.filter(e=>beamLike(e)&&!lying(e)&&e.truss?.kind!=="frame"&&!/огражд/iu.test(String(e.scheme||""))&&!["ties","guards","stairs","purlins","crane"].includes(e.group));
 // Where a beam of a roof plan lies under a purlin of a roof plan, the purlin lies on it (on one with its levels from
 // the neighbours too, when the purlin has none of its own); the members of a wall's elevation crossing it there on the
 // plan are not under it (ГПЭС М1.3: «К38» over row А taken down onto the girt «К1» at +4,140, the roof beams «К143»,
 // «К101» at +9,4…9,5). A wall's top beam where the roof plan has none is.
 const roofPlan=e=>ROOF.test(String(e.scheme||""))&&e.levels!=="развёртка";
 const supports=beams.filter(e=>firmLevels(e)||roofPlan(e)&&e.levels!=="нет отметок");
 // The tier of a plan: the middle of the levels its sections give its members. A beam under a purlin metres off it is
 // of another tier (ГПЭС М1.3, the roof at +9,2…9,9: the roof of the boxes inside, «Ф83» at +4,510, under «К38»).
 const tiers=new Map();
 for(const e of elements){if(!lying(e)||!firmLevels(e)||e.levels==="развёртка")continue;const k=e.page+"|"+e.scheme;(tiers.get(k)||tiers.set(k,[]).get(k)).push((e.z0_mm+e.z1_mm)/2)}
 for(const [k,v] of tiers){v.sort((a,b)=>a-b);tiers.set(k,v[v.length>>1])}
 for(const p of elements){
  if(!lying(p))continue;
  const hp=depthOf(p);let points=[];
  for(const s of supports){
   if(s.doc!==p.doc)continue;
   const x=crossing(p,s);if(!x)continue;
   const hs=depthOf(s),z=levelAlong(s,x.x,x.y)+((hs||0)+(hp||0))/2;
   points.push({t:x.t,z,mark:s.mark,roof:roofPlan(s),weak:!firmLevels(s)})
  }
  // A roof beam with its levels from the neighbours does not overrule a purlin's own levels from a section.
  if(firmLevels(p))points=points.filter(q=>!q.weak);
  const tier=tiers.get(p.page+"|"+p.scheme);if(Number.isFinite(tier))points=points.filter(q=>Math.abs(q.z-tier)<=1500);
  if(roofPlan(p)){const at=points.filter(q=>q.roof).map(q=>q.t);points=points.filter(q=>q.roof||!at.some(t=>Math.abs(t-q.t)<=.05))}
  if(!points.length)continue;
  // Several members under one place (the rafter over the eaves and the low beam of a box or an annex beside it): of
  // those at its two ends, the pair that keeps the purlin level — a purlin runs across the slope — and of equal
  // pairs the higher one, the top of the roof.
  const buckets=new Map();for(const q of points){const k=Math.round(q.t*20);(buckets.get(k)||buckets.set(k,[]).get(k)).push(q)}
  const keys=[...buckets.keys()].sort((x,y)=>x-y),A=buckets.get(keys[0]),B=buckets.get(keys[keys.length-1]);
  let a=null,b=null,score=Infinity;
  for(const qa of A)for(const qb of B){const sc=Math.abs(qa.z-qb.z)-(qa.z+qb.z)*1e-4;if(sc<score){score=sc;a=qa;b=qb}}
  const pts=[a,b].filter((q,k,l)=>l.indexOf(q)===k);
  const zAt=t=>Math.round((b.t-a.t>0.2?a.z+(b.z-a.z)*(t-a.t)/(b.t-a.t):(a.z+b.z)/2)/5)*5;
  p.z0_mm=zAt(0);p.z1_mm=zAt(1);p.levels="на балках под ним";
  p.note=[String(p.note||"").replace(/Отметок нет[^;]*(;\s*)?/u,""),"Лежит на "+[...new Set(pts.map(q=>q.mark))].join(", ")+" — отметки по верху балок под ним"].filter(Boolean).join("; ")
 }
}
// A suspended track (монорельс of a «Схема расположения путей подвесного транспорта») hangs under the beams it crosses:
// its top at their bottom. Only a track without levels of its own read from the sheets.
function hangTracks(elements){
 const supports=elements.filter(e=>beamLike(e)&&firmLevels(e)&&e.group!=="crane");
 for(const p of elements){
  if(!beamLike(p)||SET_BY_HAND.has(p.levels)||firmLevels(p)||!(/подвесн/iu.test(String(p.scheme||""))||p.type_key==="monorail"))continue;
  const hp=depthOf(p),under=[];
  for(const s of supports){
   if(s.doc!==p.doc||s.scheme===p.scheme)continue;
   const x=crossing(p,s,150);if(!x)continue;
   const z=levelAlong(s,x.x,x.y)-((depthOf(s)||0)+(hp||0))/2;
   if(z>2000)under.push({z:Math.round(z/5)*5,mark:s.mark,t:x.t})
  }
  if(!under.length)continue;
  // At each crossing the lowest beam over it; the track is level — the level most of them give.
  const at=new Map();for(const q of under){const k=Math.round(q.t*20);if(!at.has(k)||q.z<at.get(k).z)at.set(k,q)}
  const count=new Map();for(const q of at.values())count.set(q.z,(count.get(q.z)||0)+1);
  const z=[...count].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0][0];
  p.z0_mm=p.z1_mm=z;p.levels="подвешен к балкам";
  p.note=[String(p.note||"").replace(/Отметок нет[^;]*(;\s*)?/u,""),"Подвешен к "+[...new Set([...at.values()].map(q=>q.mark))].slice(0,6).join(", ")+" — верх пути под низом балок ("+mmText(z)+")"].filter(Boolean).join("; ")
 }
}
// Members that took their levels from the beams they meet («по соседним балкам») follow those beams once these have
// been moved (onto the column tops, onto the beams under them).
// Members still without levels (their neighbours had none while the scheme was read) take them now, as do those of
// «как у большинства в схеме» where a beam of their own scheme meets them.
const LEVELLED_LATER=new Set(["по соседним балкам","нет отметок","как у большинства в схеме"]);
// A ladder drawn on the plan of the building and again on its own plan (ГПЭС: В124 by the column И/6 on the partitions'
// plan and on «Схема … пожарной лестницы в осях И/6») is one ladder: the surer place is kept, the other listed.
function oneLadder(elements,skipped){
 const rank={high:3,medium:2,low:1},ladders=elements.filter(e=>e.geometry_type==="column"&&(e.type_key==="ladder"||e.fitting_type==="ladder"));
 const gone=new Set();
 for(const e of ladders){
  if(gone.has(e))continue;
  const same=ladders.filter(o=>o!==e&&!gone.has(o)&&o.mark===e.mark&&Math.hypot(o.x_mm-e.x_mm,o.y_mm-e.y_mm)<=2500);
  for(const o of same){
   const keep=(rank[o.confidence]||0)>(rank[e.confidence]||0)?o:e,drop=keep===e?o:e;gone.add(drop);
   skipped.push({mark:drop.mark,page:drop.page,reason:"Та же стремянка есть на схеме «"+keep.scheme+"» — поставлена один раз"});
   if(drop===e)break
  }
 }
 if(gone.size)for(let i=elements.length-1;i>=0;i--)if(gone.has(elements[i]))elements.splice(i,1)
}
function relevelNeighbours(elements){
 const bySheet=new Map();
 for(const e of elements){if(!beamLike(e))continue;const k=e.page+"|"+e.scheme;(bySheet.get(k)||bySheet.set(k,[]).get(k)).push(e)}
 for(const e of elements){
  if(!LEVELLED_LATER.has(e.levels)||!Number.isFinite(e.x2_mm)||e.fitting_type)continue;
  const beams=(bySheet.get(e.page+"|"+e.scheme)||[]).filter(b=>b!==e&&!LEVELLED_LATER.has(b.levels));
  const at=(x,y)=>{let best=null;for(const b of beams){const vx=b.x2_mm-b.x_mm,vy=b.y2_mm-b.y_mm,l2=vx*vx+vy*vy||1,t=Math.max(0,Math.min(1,((x-b.x_mm)*vx+(y-b.y_mm)*vy)/l2)),d=Math.hypot(b.x_mm+vx*t-x,b.y_mm+vy*t-y);if(d<=400&&(!best||d<best.d))best={d,z:levelAlong(b,x,y)}}return best?Math.round(best.z/10)*10:null};
  const z0=at(e.x_mm,e.y_mm),z1=at(e.x2_mm,e.y2_mm);
  if(z0===null&&z1===null)continue;
  e.z0_mm=z0??z1;e.z1_mm=z1??z0;
  if(e.levels!=="по соседним балкам"){e.levels="по соседним балкам";e.note=[String(e.note||"").replace(/Отметк[^;]*(;\s*)?/u,""),"Отметки по балкам, к которым примыкает"].filter(Boolean).join("; ")}
 }
}
function instanceStatus(e){
 if(e.levels==="проверено инженером")return{status:"confirmed",reasons:[]};
 const reasons=[];
 if(WEAK_LEVELS.test(String(e.levels||"")))reasons.push(e.levels==="нет отметок"?"отметок нет на листах — поставлены условно":"отметки "+e.levels);
 if(e.z0_assumed)reasons.push("низ не найден на чертежах — показан на ±0,000 условно");
 for(const n of String(e.note||"").split("; "))if(/проверьте/iu.test(n)&&!/^За крайними осями/u.test(n))reasons.push(n);
 return{status:reasons.some(r=>/размер вида неоднозначен/u.test(r))?"ambiguous":reasons.length?"partial":"computed",reasons:[...new Set(reasons)].slice(0,4)}
}
// Column bases: a base drawn on a base scheme («Бк 4» with its leader) belongs to the column standing at that place (within
// 1.5 m: a base of two branches is drawn at one branch) of the same volume. Its anchors come from the base sheet.
function seatBases(elements,draft,merged,catalog){
 const points=[];
 for(const p of draft.pages||[]){
  if(p.docType!=="КМ"&&p.docType!=="КМД монтажные")continue;
  const scope=scopeOf(p.docType,catalog.multi?volumeOf(p):"");
  for(const s of p.schemes||[])for(const b of s.bases||[]){
   const ax=merged.posX.get(b.axis_x),ay=merged.posY.get(b.axis_y);
   if(ax===undefined||ay===undefined)continue;
   points.push({mark:b.mark,scope,x:ax+b.dx_mm,y:ay+b.dy_mm,where:(p.sourceName||"PDF")+", лист "+(p.pdfPage||p.page)})
  }
 }
 if(!points.length)return;
 for(const e of elements){
  // A post on a plate of its own (a roof guard of a verified set) keeps it.
  if(e.geometry_type!=="column"||e.base?.plate)continue;
  let best=null;
  for(const b of points){if(b.scope!==e.doc)continue;const d=Math.hypot(b.x-e.x_mm,b.y-e.y_mm);if(d<=1500&&(!best||d<best.d))best={d,b}}
  if(!best)continue;
  const detail=catalog.get(markKey(e.doc,best.b.mark))?.base_detail||null;
  e.base={mark:best.b.mark,scheme:best.b.where,...(detail?{anchors:detail.anchors,plate_hole_mm:detail.plate_hole_mm,sheet:detail.source,...(detail.note?{note:detail.note}:{})}:{})}
 }
}
// A two-branch column stands on its axis point as one element; its branches, lattice and upper part are drawn from its
// sheet. The branches spread across the axis named under the view (Б — across the lettered axes); of two unequal
// offsets the shorter one is the outer branch, turned to the nearer edge of the grid (the crane branch inwards), so a
// column on the other edge («Л — зеркально») is mirrored. Members: [along, z0, along, z1, role, profile, across] in mm
// from the column's point and its base level.
function seatColumnLattices(elements,merged,catalog){
 for(const e of elements){
  if(e.geometry_type!=="column"||e.levels==="проверено инженером")continue;
  const d=catalog.get(markKey(e.doc,e.mark))?.column_detail;if(!d?.two_branch)continue;
  const tb=d.two_branch,alongY=tb.axis?merged.posY.has(tb.axis)||!merged.posX.has(tb.axis):true;
  const pos=alongY?e.y_mm:e.x_mm,span=alongY?merged.grid.span_y_mm:merged.grid.span_x_mm;
  const sign=tb.a_mm<tb.b_mm&&pos>span/2?-1:1;
  // The sheet's whole height wins over a level read elsewhere (a crane level taken for the top).
  if(d.height_mm>d.lower_mm&&Math.abs(e.z1_mm-e.z0_mm-d.height_mm)>300){
   e.note=[e.note,"Верх по листу колонны: "+(e.z0_mm+d.height_mm)+" (было "+e.z1_mm+")"].filter(Boolean).join("; ");e.z1_mm=e.z0_mm+d.height_mm
  }
  const H=e.z1_mm-e.z0_mm,low=Math.min(d.lower_mm,H);if(!(low>1000))continue;
  const A=-tb.a_mm,B=tb.b_mm,faces=tb.flange_mm>0?[-tb.flange_mm/2,tb.flange_mm/2]:[0],members=[];
  const p=d.parts||{};
  members.push([A,0,A,low,"branch",p.branch||e.profile||"",0],[B,0,B,low,"branch",p.branch||e.profile||"",0]);
  if(H>low+100)members.push([tb.a_mm<tb.b_mm?A:0,low,tb.a_mm<tb.b_mm?A:0,H,"upper",p.upper||"",0]);
  const nodes=(d.lattice?.nodes_mm||[]).filter(z=>z<low);
  for(const w of faces)nodes.forEach((z,i)=>{
   members.push([A,z,B,z,"strut",p.strut||"",w]);
   const nz=nodes[i+1];if(nz!==undefined)members.push(i%2?[B,z,A,nz,"diag",p.diagonal||"",w]:[A,z,B,nz,"diag",p.diagonal||"",w])
  });
  e.column={dir:alongY?[0,sign]:[sign,0],members,lower_mm:low,parts:p,sheet:d.source};
  e.note=[e.note,"Двухветвевая колонна по листу "+d.source+": ветви "+tb.a_mm+" и "+tb.b_mm+" мм от оси, решётка "+(d.lattice?.count||0)+"×"+(d.lattice?.step_mm||0)].filter(Boolean).join("; ")
 }
}
// Wall rails (girders) on an outer line of the grid stand off it, outside the building: their centre is the chain of the
// node section («870» from the outer face to the axis) less half the width of their section («□180х5» — 90). The
// section of the same axis first, otherwise of any axis.
function seatWallRails(elements,merged,catalog){
 const cx=merged.grid.span_x_mm/2,cy=merged.grid.span_y_mm/2,lettered=n=>/^[А-ЯЁA-Z]$/u.test(n);
 for(const e of elements){
  if(e.group!=="girders"||e.geometry_type==="column"||e.x2_mm===undefined||e.levels==="проверено инженером")continue;
  const cat=catalog.get(markKey(e.doc,e.mark)),list=cat?.rail_offsets;if(!list?.length)continue;
  const alongX=Math.abs(e.y_mm-e.y2_mm)<50,alongY=Math.abs(e.x_mm-e.x2_mm)<50;if(!alongX&&!alongY)continue;
  const v=alongX?(e.y_mm+e.y2_mm)/2:(e.x_mm+e.x2_mm)/2,pos=alongX?merged.posY:merged.posX;
  const name=[...pos].find(([,p])=>Math.abs(p-v)<60)?.[0];if(!name)continue;
  // The section of this axis, otherwise of an axis of the same kind (Б for Л, О8 for О3).
  const r=list.find(x=>x.axis===name)||list.find(x=>lettered(x.axis)===lettered(name));if(!r)continue;
  const w=Number(/(\d{2,3})/.exec(String(e.profile||cat.profile||""))?.[1])||0,d=Math.round(r.edge_mm-w/2);if(!(d>0))continue;
  const out=v<(alongX?cy:cx)?-1:1;
  if(alongX){e.y_mm+=out*d;e.y2_mm+=out*d}else{e.x_mm+=out*d;e.x2_mm+=out*d}
  e.note=[e.note,"Снаружи от оси "+name+" на "+d+" мм (узел: "+r.edge_mm+" до наружной грани"+(w?", сечение "+w:"")+"; "+r.source+")"].filter(Boolean).join("; ")
 }
}
// Members of a plan «… по нижним поясам ферм» (bracing, struts) lie on the bottom chords of the seated trusses, and those
// of «… по верхним поясам», purlins and their ties on the top chords: each end takes the chord level of the truss
// under it (a chord of a pitched truss slopes, so do they). An end with no truss under it keeps its level.
// Height of a section from its designation, mm (I25Б1 → 250, [16П → 160, □180х5 → 180, Тр.140х4 → 140); 0 when unknown.
function sectionHeight(profile){
 // A pair «2L75×6», «2[16П» stands as tall as one of it.
 const t=String(profile||"").replace(/\s+/g,"").replace(/^2(?=[L∟\[])/,"");let m;
 if((m=/^(?:I|І|Дв\.?)?(\d{2,3})(?:ДБ|ДШ|[БШКбшк])\d/.exec(t)))return +m[1]*10;
 // An I-beam М of ГОСТ 19425 for a monorail: «24М».
 if((m=/^(?:I|І|Дв\.?)?(\d{2})[МM]$/.exec(t)))return +m[1]*10;
 if((m=/^(?:I|І|\[|Шв\.?|Дв\.?)(\d{2})(?:[УПуп]|$)/.exec(t)))return +m[1]*10;
 // A tube, a box, an angle, a bent channel «[160×60×4» — the first size; a solid bar «Ø18», «□20» — its size.
 if((m=/^(?:□|Гн\.?□?|Тр\.?|Ø|∅|L|∟|\[)(\d{2,3})[xх×]/.exec(t)))return +m[1];
 if((m=/^(?:Ø|∅|□)(\d{1,3})$/.exec(t)))return +m[1];
 return 0
}
// A platform or a stair landing drawn as a frame of beams carries a grating deck (настил): every cell of one level
// closed by beams on its four sides gets one, on the top of the beams; neighbouring cells are joined into rectangles.
// A cell a flight passes through (going on above the level) is the stair opening and stays open. A deck the drawings
// already gave over the cell is not repeated. Members of buildings (roofs, floors) are left alone: only the beams of
// platforms, landings, porches, raised floors and walkways (not the frame of an annex filed with the platforms).
const DECKED=/площадк|крыльц|фальшпол|мостик|настил/i;
function deckFrames(elements){
 const own=e=>e.geometry_type==="beam"&&!e.fitting_type&&Math.abs(e.z0_mm-e.z1_mm)<=20&&!/каркас/i.test(e.name||"")&&(e.group==="platforms"||DECKED.test(e.name||"")&&e.group!=="guards"||e.type_key==="stair_landing"||e.type_key==="platform_beam");
 // A flight: a flight element, a sloped stair beam, or a stringer (косоур, тетива) of a platform's stair.
 const beams=elements.filter(own),decks=elements.filter(e=>e.fitting_type==="deck"),flights=elements.filter(e=>e.x2_mm!=null&&Math.abs(e.z1_mm-e.z0_mm)>300&&(e.fitting_type==="flight"||e.group==="stairs"&&e.geometry_type==="beam"||/косоур|тетив/i.test(e.name||"")));
 const levels=new Map();
 for(const b of beams){
  const dx=Math.abs(b.x2_mm-b.x_mm),dy=Math.abs(b.y2_mm-b.y_mm);if(Math.max(dx,dy)<300||Math.min(dx,dy)>30)continue;
  const top=b.z0_mm+sectionHeight(b.profile)/2,k=Math.round(top/20)*20;
  if(!levels.has(k))levels.set(k,{top,beams:[]});levels.get(k).beams.push({b,alongX:dx>dy})
 }
 const snap=(v,list)=>{for(const x of list)if(Math.abs(x-v)<=40)return x;list.push(v);return v};
 const added=[];
 for(const [,L] of levels){
  if(L.beams.length<4)continue;
  const xs=[],ys=[],vert=[],hor=[];
  for(const {b,alongX} of L.beams){
   if(alongX){const y=snap((b.y_mm+b.y2_mm)/2,ys);hor.push({at:y,lo:Math.min(b.x_mm,b.x2_mm),hi:Math.max(b.x_mm,b.x2_mm),b})}
   else{const x=snap((b.x_mm+b.x2_mm)/2,xs);vert.push({at:x,lo:Math.min(b.y_mm,b.y2_mm),hi:Math.max(b.y_mm,b.y2_mm),b})}
  }
  xs.sort((a,b)=>a-b);ys.sort((a,b)=>a-b);if(xs.length<2||ys.length<2||xs.length*ys.length>40000)continue;
  // A side is closed when the beams on its line cover it end to end (a beam may run past it, several may meet on it).
  const closed=(lines,at,lo,hi)=>{const segs=lines.filter(l=>l.at===at&&l.hi>=lo-60&&l.lo<=hi+60).sort((p,q)=>p.lo-q.lo);let reach=lo;
   for(const s of segs){if(s.lo>reach+60)return null;reach=Math.max(reach,s.hi);if(reach>=hi-60)return segs}return null};
  // Cells between neighbouring lines, joined across every side no beam closes: a deck is a region closed by beams all
  // round. A line of the level that stops short (the middle beam of a stair bay next to a platform) splits nothing
  // beyond its own reach. A region open to the outside or with a cell over 12 m is not a deck.
  const nx=xs.length-1,ny=ys.length-1,par=[],find=a=>{while(par[a]!==a)a=par[a]=par[par[a]];return a},leak=new Set(),sideOf=[];
  const most=(segs,lo,hi)=>segs&&segs.reduce((a,q)=>Math.min(hi,q.hi)-Math.max(lo,q.lo)>Math.min(hi,a.hi)-Math.max(lo,a.lo)?q:a).b;
  for(let k=0;k<nx*ny;k++)par[k]=k;
  for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){
   const k=i*ny+j,x0=xs[i],x1=xs[i+1],y0=ys[j],y1=ys[j+1];
   const sides=[closed(vert,x0,y0,y1),closed(vert,x1,y0,y1),closed(hor,y0,x0,x1),closed(hor,y1,x0,x1)];
   sideOf[k]=[most(sides[0],y0,y1),most(sides[1],y0,y1),most(sides[2],x0,x1),most(sides[3],x0,x1)];
   if(x1-x0>12000||y1-y0>12000||!sides[0]&&i===0||!sides[1]&&i===nx-1||!sides[2]&&j===0||!sides[3]&&j===ny-1)leak.add(k);
   if(!sides[1]&&i<nx-1)par[find(k)]=find(k+ny);
   if(!sides[3]&&j<ny-1)par[find(k)]=find(k+1);
  }
  // A strip under 300 is decked only as a part of a wider region (not the gap between two beams side by side).
  const open=new Set([...leak].map(find)),beamOf=new Map(),wide=new Set(),thin=(i,j)=>xs[i+1]-xs[i]<300||ys[j+1]-ys[j]<300;
  // The region is named after the structure most of its sides belong to (a landing framed against a platform beam).
  const byName=new Map(),pre=b=>String(b.name||"").replace(/\s+—.*$/,"");
  for(let k=0;k<nx*ny;k++){const r=find(k);if(!thin(Math.floor(k/ny),k%ny))wide.add(r);
   for(const b of sideOf[k])if(b){if(!byName.has(r))byName.set(r,new Map());const m=byName.get(r),n=pre(b);m.set(n,[(m.get(n)?.[0]||0)+1,m.get(n)?.[1]||b])}}
  for(const [r,m] of byName)beamOf.set(r,[...m.values()].sort((a,b)=>b[0]-a[0])[0][1]);
  const cell=new Map();
  for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){
   const x0=xs[i],x1=xs[i+1],y0=ys[j],y1=ys[j+1],k=i*ny+j,r=find(k);
   if(open.has(r)||!beamOf.has(r)||!wide.has(r))continue;
   const cx=(x0+x1)/2,cy=(y0+y1)/2;
   if(decks.some(d=>{const h=(Number(d.diameter_mm)||0)/2,ax=d.x_mm===d.x2_mm;return Math.abs(d.z0_mm-L.top)<=300&&cx>=Math.min(d.x_mm,d.x2_mm)-(ax?h:0)&&cx<=Math.max(d.x_mm,d.x2_mm)+(ax?h:0)&&cy>=Math.min(d.y_mm,d.y2_mm)-(ax?0:h)&&cy<=Math.max(d.y_mm,d.y2_mm)+(ax?0:h)}))continue;
   // The stair opening: a flight crossing the cell at this level, not ending at it; a flight arriving at this level from
   // below through the cell (under a deck there it would have no headroom); a flight going up from this level over the
   // cell from its edge (the deck stops where the flight starts: a stair tower of a crane platform — настил
   // площадок лестничной клетки только в пролётах 1000, под маршами связи без настила). A flight starting inside the cell
   // keeps the deck (a stair going up from the floor of a platform).
   const inside=(f,z)=>{const t=(z-f.z0_mm)/((f.z1_mm-f.z0_mm)||1),x=f.x_mm+(f.x2_mm-f.x_mm)*t,y=f.y_mm+(f.y2_mm-f.y_mm)*t;return x>x0+100&&x<x1-100&&y>y0+100&&y<y1-100};
   const over=(f,a,b)=>{for(let k=0;k<=8;k++)if(inside(f,a+(b-a)*k/8))return true;return false};
   const through=flights.some(f=>{const lo=Math.min(f.z0_mm,f.z1_mm),hi=Math.max(f.z0_mm,f.z1_mm);
    if(lo<L.top-300&&hi>L.top+300)return inside(f,L.top);
    if(Math.abs(hi-L.top)<=300&&lo<L.top-300)return over(f,Math.max(lo,L.top-2100),L.top-300);
    if(Math.abs(lo-L.top)<=300&&hi>L.top+300)return !inside(f,lo)&&over(f,L.top+300,Math.min(hi,L.top+2100));
    return false});
   if(through)continue;
   const b=beamOf.get(r);cell.set(i+":"+j,{i,j,x0,x1,y0,y1,b,r:pre(b)})
  }
  // Cells of a row joined while they follow one another on one structure (over its inner beams, not from a stair landing
  // onto the platform beside it), then rows of the same span joined.
  const rows=[];
  for(let j=0;j+1<ys.length;j++)for(let i=0;i+1<xs.length;i++){const c=cell.get(i+":"+j);if(!c)continue;
   const last=rows[rows.length-1];if(last&&last.j===j&&last.i1===i-1&&last.r===c.r){last.x1=c.x1;last.i1=i}else rows.push({j,i0:i,i1:i,x0:c.x0,x1:c.x1,y0:c.y0,y1:c.y1,r:c.r,b:c.b})}
  const rects=[];
  for(const r of rows){const up=rects.find(q=>q.x0===r.x0&&q.x1===r.x1&&q.j1===r.j-1&&q.r===r.r);if(up){up.y1=r.y1;up.j1=r.j}else rects.push({...r,j1:r.j})}
  for(const r of rects){
   const w=r.x1-r.x0,h=r.y1-r.y0,alongX=w>=h,src=r.b,group=src.group==="stairs"?"stairs":"platforms";
   const name=String(src.name||"Площадка").replace(/\s+—.*$/,"").replace(/,\s*площадка$/,"")+(group==="stairs"?", площадка — настил":" — настил");
   added.push({...src,key:(src.key||"deck")+"-n"+added.length,mark:"Настил",name,type_key:group==="stairs"?"stair_landing":"platform",type_name:group==="stairs"?"Площадка лестницы":"Площадка",
    geometry_type:"beam",fitting_type:"deck",group,group_label:group==="stairs"?"Лестницы":"Площадки",profile:"",profile_standard:"",
    x_mm:alongX?r.x0:(r.x0+r.x1)/2,y_mm:alongX?(r.y0+r.y1)/2:r.y0,x2_mm:alongX?r.x1:(r.x0+r.x1)/2,y2_mm:alongX?(r.y0+r.y1)/2:r.y1,diameter_mm:Math.round(alongX?h:w),
    z0_mm:Math.round(L.top),z1_mm:Math.round(L.top),length_mm:Math.round(Math.max(w,h)),confidence:"low",
    note:"Настил по раме балок площадки (на верх балок) — марка настила по чертежу не прочитана, проверьте"})
  }
 }
 elements.push(...added);
 return added
}
// Distance from the heel of an angle of a chord to its axis, mm, by the areas of its legs («∟140×10» — 38.7; the first
// size is the upright leg): the truss is given by the axes of its members, the purlins lie on the top of its top chord.
function angleAxisOf(profile){
 const m=/^2?(?:L|∟|Уголок|Уг\.?)?(\d{2,3})[xх×](\d{1,3}(?:[.,]\d+)?)(?:[xх×](\d{1,2}(?:[.,]\d+)?))?$/u.exec(String(profile||"").replace(/\s+/g,""));
 if(!m)return 0;
 const h=+m[1],b=m[3]?+m[2]:h,t=+String(m[3]||m[2]).replace(",",".");
 return h>0&&b>0&&t>0&&t<b?(h*h+(b-t)*t)/(2*(h+b-t)):0
}
function seatOnChords(elements){
 // A welded frame of a wall (a window's rails and posts) carries no purlins.
 const trusses=elements.filter(e=>e.truss?.members?.length&&e.truss.kind!=="frame");if(!trusses.length)return;
 let chordProfile="";
 const zAt=(t,x,role)=>{const m=t.members.filter(q=>q[4]===role).sort((p,q)=>Math.max(0,p[0]-x,x-p[2])-Math.max(0,q[0]-x,x-q[2]))[0];
  if(m)chordProfile=String(m[5]||"");
  return m?m[1]+(m[3]-m[1])*(Math.max(m[0],Math.min(m[2],x))-m[0])/Math.max(1,m[2]-m[0]):null};
 let purlin=null;
 const chordAt=(x,y,role,self)=>{
  let best=null;
  for(const t of trusses){
   if(t===self)continue;
   const a=t.truss.flip?{x:t.x2_mm,y:t.y2_mm}:{x:t.x_mm,y:t.y_mm},b=t.truss.flip?{x:t.x_mm,y:t.y_mm}:{x:t.x2_mm,y:t.y2_mm};
   const L=Math.hypot(b.x-a.x,b.y-a.y);if(L<1000)continue;
   const ux=(b.x-a.x)/L,uy=(b.y-a.y)/L,along=(x-a.x)*ux+(y-a.y)*uy,off=Math.abs((x-a.x)*uy-(y-a.y)*ux);
   if(off>400||along<-300||along>L+300)continue;
   const z=zAt(t.truss,Math.max(0,Math.min(L,along))*t.truss.span_mm/L,role);
   if(z!==null&&(!best||off<best.off))best={off,z:Math.round(t.truss.base_mm+z),profile:chordProfile}
  }
  // A purlin lies on the top chord: its centre over the chord's axis by the chord's angle to its top and half its own
  // height (КМ: прогон на верхнем поясе фермы); at the axis it went half through the chord.
  if(best&&purlin)best.z=Math.round(best.z+angleAxisOf(best.profile)+sectionHeight(purlin.profile)/2);
  return best?.z??null
 };
 for(const e of elements){
  if(e.truss||e.geometry_type==="column"||e.x2_mm===undefined||["Claude","развёртка","проверено инженером"].includes(e.levels))continue;
  const title=String(e.scheme||"");
  const role=/по\s+нижним\s+поясам/iu.test(title)?"bottom":/по\s+верхним\s+поясам/iu.test(title)||e.group==="purlins"?"top":null;
  if(!role)continue;
  purlin=e.group==="purlins"&&role==="top"&&e.geometry_type==="beam"?e:null;
  const z0=chordAt(e.x_mm,e.y_mm,role),z1=chordAt(e.x2_mm,e.y2_mm,role);
  if(z0===null&&z1===null)continue;
  e.z0_mm=z0??z1;e.z1_mm=z1??z0;e.levels=role==="bottom"?"по нижнему поясу фермы":"по верхнему поясу фермы";
  e.note=[e.note,purlin?"Прогон на верхнем поясе фермы под ним: низ прогона — верх пояса":"Отметки по "+(role==="bottom"?"нижнему":"верхнему")+" поясу фермы под элементом"].filter(Boolean).join("; ")
 }
}
// A post of a railing (ограждение лестницы, площадки) is about a metre tall: one of several metres is a level taken from
// another tier (a stair tower of repeated flights: the top moved up with the tier, the foot left on the first one —
// posts of 5–17 m under the handrail, the engineer 25.10.2026: «труба в никуда выходит?»). Its top stays (it is at the
// handrail), the foot comes up by the height of the posts of the same railing (else 1000 mm). Not the rows checked by the
// engineer.
function trimGuardPosts(elements){
 const post=e=>e.group==="guards"&&e.geometry_type==="column"&&/стойк/iu.test(e.name||"");
 const usual=new Map();
 for(const e of elements){const h=e.z1_mm-e.z0_mm;if(post(e)&&h>=600&&h<=1500){const k=String(e.name).replace(/\s+\S*\d[\d,.]*$/u,"");usual.set(k,Math.max(usual.get(k)||0,h))}}
 for(const e of elements){
  if(!post(e)||e.levels==="проверено инженером"||e.z1_mm-e.z0_mm<=2500)continue;
  const h=usual.get(String(e.name).replace(/\s+\S*\d[\d,.]*$/u,""))||1000,was=e.z0_mm;
  e.z0_mm=e.z1_mm-h;e.note=[e.note,"Стойка ограждения была высотой "+(e.z1_mm-was)+" мм — низ поднят на высоту стоек этого ограждения ("+h+" мм), проверьте"].filter(Boolean).join("; ")
 }
}
// A vertical brace is drawn on a plan as a line between two columns (or trusses), with one level from a section. In the
// structure it is a cross in the vertical plane through that line, from the level below to the level above: column
// bases and tops, struts and beams along the same line, the crane beams beside it, the chords of the trusses at its ends.
// The tier holding the drawn level is taken (a level equal to a node level starts the tier above it).
function raiseVerticalBraces(elements){
 const cols=elements.filter(e=>e.geometry_type==="column");
 const trusses=elements.filter(e=>e.truss?.members?.length&&e.truss.kind!=="frame");
 const zAt=(t,x,role)=>{const m=t.members.filter(q=>q[4]===role).sort((p,q)=>Math.max(0,p[0]-x,x-p[2])-Math.max(0,q[0]-x,x-q[2]))[0];
  return m?m[1]+(m[3]-m[1])*(Math.max(m[0],Math.min(m[2],x))-m[0])/Math.max(1,m[2]-m[0]):null};
 const VERTICAL=/^(?:Св|Свк|Вс|СВ|ВС)(?!ф)/u;
 for(const e of elements){
  if(e.geometry_type==="column"||e.truss||e.x2_mm===undefined||!(e.type_key==="brace_vertical"||VERTICAL.test(String(e.mark||"").replace(/\s+/g,"")))||/^Свф/u.test(e.mark))continue;
  if(["Claude","развёртка","проверено инженером"].includes(e.levels)||/поясу фермы/u.test(e.levels||""))continue;
  const L=Math.hypot(e.x2_mm-e.x_mm,e.y2_mm-e.y_mm);if(L<1000)continue;
  const ux=(e.x2_mm-e.x_mm)/L,uy=(e.y2_mm-e.y_mm)/L,z=(e.z0_mm+e.z1_mm)/2,levels=[];
  const ends=[{x:e.x_mm,y:e.y_mm},{x:e.x2_mm,y:e.y2_mm}];
  for(const c of cols)if(ends.some(p=>Math.hypot(c.x_mm-p.x,c.y_mm-p.y)<=700))levels.push(c.z0_mm,c.z1_mm);
  for(const h of elements){
   if(h===e||h.geometry_type==="column"||h.x2_mm===undefined)continue;
   if(h.truss){
    const a=h.truss.flip?{x:h.x2_mm,y:h.y2_mm}:{x:h.x_mm,y:h.y_mm},b=h.truss.flip?{x:h.x_mm,y:h.y_mm}:{x:h.x2_mm,y:h.y2_mm},M=Math.hypot(b.x-a.x,b.y-a.y);if(M<1000)continue;
    const vx=(b.x-a.x)/M,vy=(b.y-a.y)/M;
    for(const p of ends){const along=(p.x-a.x)*vx+(p.y-a.y)*vy,off=Math.abs((p.x-a.x)*vy-(p.y-a.y)*vx);
     if(off<=700&&along>=-300&&along<=M+300)for(const role of ["bottom","top"]){const zz=zAt(h.truss,Math.max(0,Math.min(M,along))*h.truss.span_mm/M,role);if(zz!==null)levels.push(Math.round(h.truss.base_mm+zz))}}
    continue
   }
   if(Math.abs(h.z0_mm-h.z1_mm)>50)continue;
   const M=Math.hypot(h.x2_mm-h.x_mm,h.y2_mm-h.y_mm);if(M<500)continue;
   const vx=(h.x2_mm-h.x_mm)/M,vy=(h.y2_mm-h.y_mm)/M;if(Math.abs(ux*vy-uy*vx)>0.1)continue;
   const off=Math.abs((e.x_mm-h.x_mm)*vy-(e.y_mm-h.y_mm)*vx);if(off>1200)continue;
   const t0=(e.x_mm-h.x_mm)*vx+(e.y_mm-h.y_mm)*vy,t1=(e.x2_mm-h.x_mm)*vx+(e.y2_mm-h.y_mm)*vy;
   if(Math.max(t0,t1)<300||Math.min(t0,t1)>M-300)continue;
   levels.push(h.z0_mm)
  }
  const list=[...new Set(levels.filter(Number.isFinite).map(v=>Math.round(v)))].sort((a,b)=>a-b);
  const below=list.filter(v=>v<=z+50),lo=below.length?below[below.length-1]:null;
  const hi=lo===null?null:list.find(v=>v>=lo+500&&v>z+50)??null;
  if(lo===null||hi===null)continue;
  e.z0_mm=lo;e.z1_mm=hi;e.cross=true;e.levels="между узлами по вертикали";
  e.note=[e.note,"Вертикальная связь — крест от "+lo+" до "+hi+" (по колоннам, распоркам и фермам на её линии) — проверьте"].filter(Boolean).join("; ")
 }
}
function seatTrusses(elements,catalog){
 const trusses=elements.map(e=>({e,t:e.geometry_type==="beam"&&!e.truss?catalog.get(markKey(e.doc,e.mark))?.truss:null})).filter(x=>x.t);
 if(!trusses.length)return;
 const cols=elements.filter(c=>c.geometry_type==="column");
 const near=(x,y,list)=>list.filter(c=>Math.hypot(c.x_mm-x,c.y_mm-y)<=1200);
 const seated=new Map();
 const top=t=>Math.max(...t.members.flatMap(m=>[m[1],m[3]]));
 // Level of a chord at a place along the span (the chord nearest to it: the drawn lines stop short of the supports).
 const zAt=(t,x,role)=>{const m=t.members.filter(q=>q[4]===role).sort((p,q)=>Math.max(0,p[0]-x,x-p[2])-Math.max(0,q[0]-x,x-q[2]))[0];
  return m?m[1]+(m[3]-m[1])*(Math.max(m[0],Math.min(m[2],x))-m[0])/Math.max(1,m[2]-m[0]):null};
 const support=(x,y,name,done)=>{
  const c=near(x,y,cols).sort((a,b)=>(normMark(b.mark)===normMark(name))-(normMark(a.mark)===normMark(name))||Math.hypot(a.x_mm-x,a.y_mm-y)-Math.hypot(b.x_mm-x,b.y_mm-y))[0];
  if(c&&(!name||normMark(c.mark)===normMark(name)))return{z:c.z1_mm,named:Boolean(name),by:c.mark};
  // A truss resting on another truss: on its bottom chord at the crossing.
  for(const [o,s] of done){
   if(normMark(o.mark)!==normMark(name))continue;
   const ax=o.x2_mm-o.x_mm,ay=o.y2_mm-o.y_mm,L=Math.hypot(ax,ay);if(L<1)continue;
   const u=((x-o.x_mm)*ax+(y-o.y_mm)*ay)/(L*L),d=Math.abs((x-o.x_mm)*ay-(y-o.y_mm)*ax)/L;
   if(u<-0.05||u>1.05||d>1200)continue;
   const along=(s.flip?1-u:u)*s.t.span_mm,z=zAt(s.t,along,"bottom");
   if(z!==null)return{z:s.base+z,named:true,by:o.mark}
  }
  return c?{z:c.z1_mm,named:false,by:c.mark}:null
 };
 for(let pass=0;pass<3;pass++)for(const {e,t} of trusses){
  if(seated.has(e))continue;
  const L=Math.hypot(e.x2_mm-e.x_mm,e.y2_mm-e.y_mm);if(Math.abs(L-t.span_mm)>Math.max(1500,t.span_mm*0.25))continue;
  const a=support(e.x_mm,e.y_mm,t.left,seated),b=support(e.x2_mm,e.y2_mm,t.left,seated);
  let flip=null,base=null;
  // Only one end over the named support tells the direction (both ends on Фп1 do not).
  if(!t.left&&!t.right&&(a||b)){flip=false;base=(a||b).z}
  else if(a?.named&&!b?.named){flip=false;base=a.z}
  else if(b?.named&&!a?.named){flip=true;base=b.z}
  if(flip===null&&pass<2)continue;
  if(flip===null){
   // The direction of the nearest seated truss along the same line.
   const dir=[e.x2_mm-e.x_mm,e.y2_mm-e.y_mm],other=[...seated.entries()].filter(([o])=>{const v=[o.x2_mm-o.x_mm,o.y2_mm-o.y_mm];return Math.abs(dir[0]*v[1]-dir[1]*v[0])<=0.1*Math.hypot(...dir)*Math.hypot(...v)})
    .sort((p,q)=>Math.hypot(p[0].x_mm-e.x_mm,p[0].y_mm-e.y_mm)-Math.hypot(q[0].x_mm-e.x_mm,q[0].y_mm-e.y_mm))[0];
   if(!other)continue;
   const [o,s]=other,v=s.flip?[o.x_mm-o.x2_mm,o.y_mm-o.y2_mm]:[o.x2_mm-o.x_mm,o.y2_mm-o.y_mm];
   flip=dir[0]*v[0]+dir[1]*v[1]<0;
   const end=flip?support(e.x2_mm,e.y2_mm,t.left,seated):support(e.x_mm,e.y_mm,t.left,seated);
   base=end?end.z:null
  }
  if(base===null||!Number.isFinite(base))base=e.z1_mm-top(t);
  seated.set(e,{t,flip,base});
 }
 // Trusses of one mark rest at one level: one seated on a column that runs past its chord (an end-wall column going up
 // to the roof) or on a lower column of another frame takes the level of most of its mark.
 const byMark=new Map();for(const [e,s] of seated){const k=normMark(e.mark);if(!byMark.has(k))byMark.set(k,[]);byMark.get(k).push(s)}
 for(const list of byMark.values()){
  if(list.length<3)continue;
  const count=new Map();for(const s of list){const k=Math.round(s.base/100);count.set(k,(count.get(k)||0)+1)}
  const [k,n]=[...count].sort((a,b)=>b[1]-a[1])[0];if(n<list.length/2)continue;
  for(const s of list)if(Math.abs(s.base-k*100)>500){s.base=list.find(x=>Math.round(x.base/100)===k).base;s.moved=true}
 }
 // Families of one direction: a mark of its own (Фс2 at the end walls) takes the level of the trusses beside it.
 const all=[...seated];
 for(const [e,s] of all){
  const others=all.filter(([o,q])=>o!==e&&normMark(o.mark)!==normMark(e.mark)&&q.t.span_mm===s.t.span_mm&&Math.abs((e.x2_mm-e.x_mm)*(o.y2_mm-o.y_mm)-(e.y2_mm-e.y_mm)*(o.x2_mm-o.x_mm))<=0.1*Math.hypot(e.x2_mm-e.x_mm,e.y2_mm-e.y_mm)*Math.hypot(o.x2_mm-o.x_mm,o.y2_mm-o.y_mm));
  if(others.length<3)continue;
  const lv=others.map(([,q])=>q.base).sort((a,b)=>a-b),med=lv[Math.floor(lv.length/2)];
  if(lv.filter(v=>Math.abs(v-med)<=200).length>=others.length*0.7&&Math.abs(s.base-med)>500){s.base=med;s.moved=true}
 }
 for(const [e,{t,flip,base,moved}] of seated){
  const zl=zAt(t,0,"bottom")??0,zr=zAt(t,t.span_mm,"bottom")??0;
  e.truss={span_mm:t.span_mm,flip,base_mm:Math.round(base),members:t.members};
  e.z0_mm=Math.round(base+(flip?zr:zl));e.z1_mm=Math.round(base+(flip?zl:zr));
  e.levels="геометрическая схема фермы";
  e.note=[e.note,"Ферма по геометрической схеме"+(moved?", отметка низа — как у соседних ферм":"")+" — проверьте"].filter(Boolean).join("; ")
 }
}
module.exports={depthOf,instanceStatus,sheetNodes,jointNote,platesBySpec,gussetsBySpec,gussetHoles,typeFor,deckFrames,sectionHeight,seatFramed,seatColumnLattices,seatWallRails,buildPlan,buildCatalog,markKey,scopeOf,volumeOf,mergeGrids,groupFor,normMark,GROUPS,cumulative,seatBases,seatOnChords,raiseVerticalBraces,trimGuardPosts,sectionOutliers,roofProfiles,roofLine,roofOnColumns,purlinsOnBeams,hangTracks,relevelNeighbours,oneLadder};
