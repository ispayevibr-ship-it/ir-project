"use strict";
/*
 * IR Project: turn a PDF scheme draft (+ optional Claude decisions) into one montage plan.
 * Pure functions, no I/O. Coordinates always come from the PDF geometry; the AI may only
 * choose which schemes/elements to place, element kinds and heights.
 */
const {markCode}=require("./ai-kmd-rules");
const ST=require("./ai-structure-types");
const {stampNames}=require("./ai-sheet-extract");
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
   // A column's length is the distance between its levels; otherwise the largest dimension of the view.
   if(e.length_mm===null){e.length_mm=v.z1_mm!==null&&v.z0_mm!==null&&v.z1_mm>v.z0_mm?v.z1_mm-v.z0_mm:v.length_mm;
    if(e.length_mm!==null&&e.length_mm!==undefined)e.lengthFrom=where(p)+" · вид «"+v.title+"»"+(v.z1_mm>v.z0_mm?" (между отметками)":v.length_how?" ("+v.length_how+")":"");
    // No overall dimension drawn: the largest number of the view, the others kept — the size is ambiguous.
    if(!(v.z1_mm>v.z0_mm)&&v.length_candidates?.length>1)e.length_ambiguous=v.length_candidates.slice(0,4)}
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
   if(!e.profile&&r.profile){e.profile=r.profile;e.profileFrom=where(p)+" · спецификация";if(r.profile_standard)e.profile_standard=r.profile_standard}if(e.mass_kg===null&&r.mass_kg)e.mass_kg=r.mass_kg;e.sources.push(where(p)+" · спецификация")}
 }
 // Sections of the mounting drawings: the most frequent reading of each mark wins.
 const votes=new Map();
 for(const p of draft.pages||[]){
  if(p.docType!=="КМД монтажные"&&p.docType!=="КМ")continue;
  scope=scopeAt(p);
  for(const r of p.sections||[]){
   const k=markKey(scope,r.mark);if(!votes.has(k))votes.set(k,{scope,mark:r.mark,beam:new Map(),post:new Map(),ridge:new Map(),where:new Set()});
   const v=votes.get(k),add=(map,key)=>map.set(key,(map.get(key)||0)+1);
   if(Number.isFinite(r.beam_mm))add(v.beam,r.beam_mm);
   if(Number.isFinite(r.ridge_mm))add(v.ridge,[r.beam_mm,r.ridge_mm,r.ridge_t,r.ridge_len_mm].join("|"));
   if(Number.isFinite(r.z0_mm)&&Number.isFinite(r.z1_mm))add(v.post,r.z0_mm+"|"+r.z1_mm);
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
function claudeScheme(ai,candidates){
 const list=(ai?.elements||[]).filter(e=>e?.mark&&["column","beam","brace"].includes(e.geometry_type));
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
 // Members Claude found that the geometry did not: a scheme of their own, on Claude's grid (merged by axis names).
 const fromClaude=ver?null:claudeScheme(ai,candidates);
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
   if(pl.flight&&!own){
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
   const local=own?null:flightLevel||drawn||sheetLevel||drawingLevels(levelKind,cat,c.scheme.levelNotes,pl.sheet_point_pt);
   let z0=own?change.z0_mm:local?local.z0:c.info.z0_mm,z1=own?change.z1_mm:local?local.z1:c.info.z1_mm;
   const src=ends||pl;let [x,y]=frameOf(off,src.x_mm,src.y_mm),[x2,y2]=frameOf(off,src.x2_mm??src.x_mm,src.y2_mm??src.y_mm);
   if(!(Number.isFinite(z0)&&Number.isFinite(z1))||(!own&&!local&&!schemeLevels)){
    // Without levels of its own a member takes them from its neighbours (below): it is still placed, to be checked.
    pending.push({pl,i,geometry,cat,change,x,y,x2,y2,guess});
    return
   }
   const inside=v=>v>=-1&&v<=merged.grid.span_x_mm+1,insideY=v=>v>=-1&&v<=merged.grid.span_y_mm+1;
   // A verified scheme also holds what stands beyond the outer axes (canopies, stairs, platforms).
   if(c.scheme.kind!=="verified"&&c.scheme.kind!=="tank"&&(!inside(x)||!insideY(y)||!point&&(!inside(x2)||!insideY(y2))))guess.push("За крайними осями — проверьте");
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
    profile:pl.profile||cat?.profile||"",profile_standard:pl.profile?"":cat?.profile_standard||"",...(pl.truss?{truss:pl.truss}:{}),...(pl.nodes?{nodes:pl.nodes}:{}),...(pl.base&&typeof pl.base==="object"?{base:pl.base}:{}),...(pl.joint||joints(c.info)?{joint:pl.joint||joints(c.info)}:{}),doc:scopeOf(c.info.docType,catalog.multi?c.info.volume:""),length_mm:cat?.length_mm??null,levels:own?"Claude":local?local.from:"схема",...(!own&&local?.zeroBase?{z0_assumed:true}:{}),
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
   if(z0===null||z1===null){
    // Typical levels are taken once every scheme has been read (below), whatever the order of the sheets.
    missing++;later.push({c,q});continue
   }
   push(c,q,z0,z1,levels,note)
  }
  if(missing)problems.push((c.info.file?c.info.file+", лист "+c.info.sheet:"Лист "+c.info.page)+" · "+c.info.title+": "+missing+" эл. без своих отметок — поставлены типовые, проверьте низ и верх")
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
const WEAK_LEVELS=/^(по соседним|по балкам листа|по схеме того же листа|нет отметок|по конструкциям под ним)/u;
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
 const trusses=elements.filter(e=>e.truss?.members?.length);if(!trusses.length)return;
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
// A vertical brace is drawn on a plan as a line between two columns (or trusses), with one level from a section. In the
// structure it is a cross in the vertical plane through that line, from the level below to the level above: column
// bases and tops, struts and beams along the same line, the crane beams beside it, the chords of the trusses at its ends.
// The tier holding the drawn level is taken (a level equal to a node level starts the tier above it).
function raiseVerticalBraces(elements){
 const cols=elements.filter(e=>e.geometry_type==="column");
 const trusses=elements.filter(e=>e.truss?.members?.length);
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
module.exports={instanceStatus,sheetNodes,jointNote,typeFor,deckFrames,sectionHeight,seatFramed,seatColumnLattices,seatWallRails,buildPlan,buildCatalog,markKey,scopeOf,volumeOf,mergeGrids,groupFor,normMark,GROUPS,cumulative,seatBases,seatOnChords,raiseVerticalBraces};
