"use strict";
/*
 * IR Project AI: training — the program learns from what the engineer does with its result.
 *
 * - Placement record: every placement keeps, per element, what the program placed (its origin: position, levels,
 *   kind, mark and the sheet it came from). Records live in the object (section "ai-training"): the real
 *   coordinates, marks and levels of one object never mix with another.
 * - Corrections: the engineer moves an element, changes its levels, kind or mark, deletes it or adds a missed one —
 *   each change is a correction «было → стало» tied to the source drawing (file, sheet, set of files by SHA-256).
 *   They are kept on this computer (userData/ai-learned/corrections/<set>.json) and go to GitHub with the answers;
 *   a development session turns them into rules of the code and tests (knowledge/cases/).
 * - Verified example: «Схема проверена» saves the scheme as it stands now as the checked result of that set of
 *   drawings; the next analysis of the same files places it as checked, and similar sets get it as an example.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const ST=require("./ai-structure-types");
const SECTION="ai-training";
const n=v=>Number.isFinite(Number(v))?Number(v):null;
const LOOKALIKE={a:"а",b:"в",c:"с",e:"е",h:"н",k:"к",m:"м",o:"о",p:"р",t:"т",x:"х",y:"у"};
const normMark=v=>[...String(v||"").trim().toLowerCase().replace(/ё/g,"е").replace(/\s+/g,"")].map(c=>LOOKALIKE[c]||c).join("");
const isGrid=r=>r.record_type==="scheme_grid"||r.data?.entity_type==="grid";
const point=g=>g==="column"||g==="shell"||g==="plate";
// What the program placed for one element, as the scheme stores it.
function originOf(d){
 const g=String(d.geometry_type||"column");
 return{mark:String(d.mark||""),type_key:String(d.type_key||""),group:String(d.scheme_group||""),geometry:g,
  x:n(d.absolute_x_mm),y:n(d.absolute_y_mm),x2:point(g)?null:n(d.absolute_x2_mm),y2:point(g)?null:n(d.absolute_y2_mm),
  z0:n(d.z0_mm),z1:point(g)?n(d.z1_mm):n(d.end_z_mm??d.z1_mm),radius:n(d.radius_mm),source:String(d.source_import_doc||"")}
}
// The differences of one element from what was placed (mm; a few mm of rounding are not a correction).
function diff(before,now){
 const out=[],far=(a,b,t)=>a!==null&&b!==null&&Math.abs(a-b)>t;
 if(far(before.x,now.x,50)||far(before.y,now.y,50)||far(before.x2,now.x2,50)||far(before.y2,now.y2,50))out.push("position");
 if(far(before.z0,now.z0,20)||far(before.z1,now.z1,20))out.push("levels");
 if(before.type_key&&now.type_key&&before.type_key!==now.type_key||before.group&&now.group&&before.group!==now.group)out.push("type");
 if(normMark(before.mark)!==normMark(now.mark))out.push("mark");
 if(before.geometry!==now.geometry)out.push("geometry");
 if(far(before.radius,now.radius,20))out.push("radius");
 return out
}
const KIND={position:"перемещён",levels:"изменены отметки",type:"изменён вид",mark:"изменена марка",geometry:"изменена геометрия",radius:"изменён радиус",deleted:"удалён",added:"добавлен вручную (не найден программой)",grid:"изменена сетка осей"};
// The code of a set by its first file ("041-2025 КМД л.М1.19.pdf" → "041-2025"): what a rule of the engineer names its
// project by (the same as the teaching form of the recognition page).
const setCodeOf=set=>{const n=String(set?.files?.[0]?.name||set?.name||"").replace(/\.pdf$/i,"");return(/\d{2,}(?:[-.]\d{2,})+/.exec(n)||[n])[0].trim().slice(0,60)};
// The kind the engineer gave an element becomes a rule of its set: the same mark, a kind of the group it is in now
// (its name says which; the type the program gave it, if that is of the same group). A changed mark is not a rule — the
// element went to another mark, whose kind is its own.
function ruleOf(entry){
 const a=entry?.element,c=entry?.changes||[];if(!a||!c.includes("type")||c.includes("mark")||!a.mark)return null;
 const project=setCodeOf(entry.set);if(!project)return null;
 const byName=ST.typeOf({name:a.name,mark:a.mark}),own=ST.byKey.get(a.type_key);
 const t=byName&&(!a.group||byName.group===a.group)?byName:own&&(!a.group||own.group===a.group)?own:null;
 return t?{mark:a.mark,type:t.key,typeName:t.name,project,note:"по правке инженера на монтажной схеме"}:null
}
const setIdOf=files=>{const s=(files||[]).map(f=>f.sha256).filter(Boolean).sort();return s.length?crypto.createHash("sha256").update(s.join(",")).digest("hex").slice(0,16):""};

function createTraining({database,getUserDataPath,base=null}){
 const dir=sub=>path.join(getUserDataPath(),"ai-learned",sub);
 // After a placement: what was placed, element by element, with the set of drawings it came from.
 // Elements the engineer had changed and the placement left as they were (`carried`) keep what was placed before, so
 // that their correction is not lost with the new placement.
 function recordPlacement(oid,{batch,draftId,source,carried=[]}={}){
  const rows=database.listEntity(oid,"scheme").filter(r=>!isGrid(r)&&r.data?.import_batch===batch);
  const files=(source?.documents||[]).map(f=>({name:f.name,sha256:f.sha256,type:f.type||f.kind||""}));
  const own=rows.map(r=>({id:String(r.id),origin:originOf(r.data||{})})),ids=new Set(own.map(e=>e.id));
  const kept=(carried||[]).filter(e=>e?.id&&e.origin&&!ids.has(String(e.id))).map(e=>({id:String(e.id),origin:e.origin}));
  return database.createEntity(oid,SECTION,{record_type:"placement",title:batch,data:{batch,draftId:draftId??null,at:new Date().toISOString(),
   set:{id:setIdOf(files),name:String(source?.name||""),files},elements:[...own,...kept]}})
 }
 const placements=oid=>database.listEntity(oid,SECTION).filter(r=>r.record_type==="placement").sort((a,b)=>String(a.data?.at).localeCompare(String(b.data?.at)));
 // Corrections of the latest placement of each set: compared with the scheme as it is now.
 function corrections(oid){
  const rows=database.listEntity(oid,"scheme").filter(r=>!isGrid(r)),byId=new Map(rows.map(r=>[String(r.id),r]));
  const latest=new Map();for(const p of placements(oid))latest.set(p.data?.set?.id||p.data?.batch,p);
  const out=[];
  for(const p of latest.values()){
   const d=p.data||{},placedIds=new Set((d.elements||[]).map(e=>e.id));
   for(const e of d.elements||[]){
    const r=byId.get(e.id);
    if(!r){out.push({kind:["deleted"],set:d.set,batch:d.batch,before:e.origin,after:null});continue}
    const now=originOf(r.data||{}),k=diff(e.origin,now);
    if(k.length)out.push({kind:k,id:e.id,set:d.set,batch:d.batch,before:e.origin,after:now,mounted:r.data?.status==="mounted"})
   }
   // Elements the engineer added after this placement: what the recognition missed.
   for(const r of rows)if(!r.data?.import_batch&&!placedIds.has(String(r.id))&&String(r.created_at||"").replace("T"," ").slice(0,19)>=String(d.at||"").replace("T"," ").slice(0,19))
    out.push({kind:["added"],set:d.set,batch:d.batch,before:null,after:originOf(r.data||{})})
  }
  return out.map(c=>({...c,text:c.kind.map(k=>KIND[k]).join(", ")}))
 }
 // Kept on this computer per set of drawings (the object's own values stay in the object; this file is about the
 // drawings: what the program read wrong on them) and sent to GitHub with the answers.
 function saveCorrections(oid){
  const list=corrections(oid),bySet=new Map();
  for(const c of list){const id=c.set?.id;if(!id)continue;if(!bySet.has(id))bySet.set(id,{set:c.set,items:[]});bySet.get(id).items.push(c)}
  fs.mkdirSync(dir("corrections"),{recursive:true});
  for(const [id,v] of bySet){
   const file=path.join(dir("corrections"),id+".json"),tmp=file+".tmp";
   const summary={};for(const c of v.items)for(const k of c.kind)summary[k]=(summary[k]||0)+1;
   fs.writeFileSync(tmp,JSON.stringify({id,set:v.set,at:new Date().toISOString(),summary,items:v.items.slice(0,2000)},null,1),"utf8");fs.renameSync(tmp,file)
  }
  return{sets:bySet.size,total:list.length}
 }
 // «Схема проверена»: the scheme as it stands is the checked result of the drawings of its latest placement.
 function confirmScheme(oid,{note=""}={}){
  const all=placements(oid),p=all[all.length-1];
  if(!p)throw Error("Схема не расставлялась из чертежей — сохранять как пример нечего");
  const d=p.data||{};if(!d.set?.files?.length)throw Error("Не известны файлы чертежей этой расстановки");
  const scheme=database.listEntity(oid,"scheme"),grid=scheme.find(isGrid)?.data||null;
  const elements=scheme.filter(r=>!isGrid(r)).map(r=>{const x=r.data||{},o=originOf(x);
   return{mark:o.mark,name:String(x.mark_name||""),type_key:o.type_key,scheme_group:o.group,geometry_type:o.geometry,x_mm:o.x,y_mm:o.y,
    ...(point(o.geometry)?{}:{x2_mm:o.x2,y2_mm:o.y2}),z0_mm:o.z0,z1_mm:o.z1,
    ...(o.radius?{radius_mm:o.radius}:{}),...(n(x.inner_radius_mm)?{inner_radius_mm:n(x.inner_radius_mm)}:{}),...(x.shell_open?{shell_open:true}:{}),
    ...(n(x.sector_deg)?{sector_start_deg:n(x.sector_start_deg)||0,sector_deg:n(x.sector_deg)}:{}),...(x.fitting_type?{fitting_type:x.fitting_type,diameter_mm:n(x.diameter_mm)}:{}),
    ...(x.mid_z_mm!=null?{mid_x_mm:n(x.absolute_mid_x_mm),mid_y_mm:n(x.absolute_mid_y_mm),mid_z_mm:n(x.mid_z_mm)}:{}),
    ...(x.layout&&typeof x.layout==="object"?{layout:x.layout}:{}),profile:String(x.profile_name||"")}}).filter(e=>e.x_mm!==null&&e.y_mm!==null);
  if(!elements.length)throw Error("В схеме нет элементов");
  const marks=database.listEntity(oid,"marks").map(r=>r.data||{}).filter(m=>m.mark).map(m=>({mark:String(m.mark),doc:"КМД",profile:String(m.profile||""),length_mm:n(m.length_mm)||0,count:Math.round(n(m.qty)||0),mass_kg:n(m.mass_kg)||0,has_levels:false,z0_mm:0,z1_mm:0,sheet:"",note:String(m.name||"")}));
  const fixed=corrections(oid).filter(c=>c.set?.id===d.set.id);
  const entry=base?.saveVerified?.({files:d.set.files,title:d.set.name,verified:{grid,elements,at:new Date().toISOString(),corrections:fixed.length},marks,note});
  saveCorrections(oid);
  database.createEntity(oid,SECTION,{record_type:"verified",title:d.set.name||"Схема проверена",data:{at:new Date().toISOString(),set:d.set,elements:elements.length,corrections:fixed.length,note:String(note||"")}});
  return{elements:elements.length,corrections:fixed.length,set:d.set.name,id:entry?.id||d.set.id}
 }
 function status(oid){
  const list=corrections(oid),summary={};for(const c of list)for(const k of c.kind)summary[k]=(summary[k]||0)+1;
  const verified=database.listEntity(oid,SECTION).filter(r=>r.record_type==="verified").map(r=>r.data);
  return{placements:placements(oid).length,corrections:list.slice(0,300),correctionsTotal:list.length,summary,verified:verified[verified.length-1]||null}
 }
 const readJson=f=>{try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch{return null}};
 const correctionsOf=id=>id?readJson(path.join(dir("corrections"),id+".json")):null;
 // What the engineer changed, in short lines: kinds, levels, deleted and missed elements.
 function correctionLines(file,limit=20){
  const lines=[],types=new Map(),removed=new Map(),added=new Map();
  for(const c of file?.items||[]){
   const b=c.before||{},a=c.after||{},label=(a.mark||b.mark||"без марки");
   if(c.kind.includes("deleted"))removed.set(b.type_key||b.geometry,(removed.get(b.type_key||b.geometry)||0)+1);
   else if(c.kind.includes("added"))added.set(a.type_key||a.geometry,(added.get(a.type_key||a.geometry)||0)+1);
   else{
    if(c.kind.includes("type")){const k=(b.type_key||b.group)+" → "+(a.type_key||a.group);types.set(k,[...(types.get(k)||[]),label])}
    if(c.kind.includes("levels")&&lines.length<limit)lines.push("— "+label+": отметки "+b.z0+"…"+b.z1+" → "+a.z0+"…"+a.z1+(b.source?" ("+b.source+")":""));
    if(c.kind.includes("position")&&lines.length<limit)lines.push("— "+label+": перемещён на "+Math.round(Math.hypot((a.x??0)-(b.x??0),(a.y??0)-(b.y??0)))+" мм"+(b.source?" ("+b.source+")":""))
   }
  }
  for(const [k,marks] of types)lines.unshift("— вид "+k+": "+[...new Set(marks)].slice(0,6).join(", ")+(marks.length>6?" и ещё "+(marks.length-6):""));
  for(const [k,v] of removed)lines.push("— удалено как лишнее: "+k+" ×"+v);
  for(const [k,v] of added)lines.push("— не найдено программой, добавлено вручную: "+k+" ×"+v);
  return lines.slice(0,limit)
 }
 // For the request to Claude: corrections of these very drawings, then checked examples of similar sets and what
 // was corrected on them (kinds only — values of another object are not given as values).
 function promptFor({files=[],similar=[]}={}){
  const out=[],own=journalLines(setIdOf(files));
  if(own.length)out.push("ЖУРНАЛ ПРАВОК ИНЖЕНЕРА ПО ЭТИМ ЧЕРТЕЖАМ (учти: так правильно):",...own);
  const entries=new Map((base?.all?.()||[]).map(e=>[e.id,e]));
  for(const x of (similar||[]).slice(0,3)){
   const e=entries.get(x.id);if(!e)continue;const r=e.result||{};
   const count=new Map(),add=k=>k&&count.set(k,(count.get(k)||0)+1);
   for(const el of r.verified?.elements||r.elements||[])add(el.type_key||el.type);
   for(const p of r.vessel?.parts||[])add("vessel:"+p.role);
   if(r.tank?.is_tank)add("резервуар");
   const kinds=[...count].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k,v])=>k+" ×"+v).join(", ");
   out.push("","ПРИМЕР ПОХОЖЕГО КОМПЛЕКТА «"+(e.title||e.id)+"» ("+(r.verified?"схема проверена инженером":e.origin==="база знаний"?"проверено":"ответ Claude")+"; похоже: "+(x.reasons||[]).join(", ")+"):",
    (r.summary?"итог: "+String(r.summary).slice(0,400):"")+(kinds?(r.summary?"; ":"")+"виды элементов: "+kinds:""));
   const fix=correctionLines(correctionsOf(setIdOf(e.files)),8).filter(l=>/вид |удалено|не найдено/.test(l));
   if(fix.length)out.push("в нём инженер исправлял:",...fix)
  }
  if(out.length)out.push("Примеры — образец того, как читать такие листы; размеры, отметки и количество бери только с листов этого комплекта.");
  return out.join("\n")
 }
 // The journal of edits: everything the engineer does on the montage scheme goes there by itself — an element edited,
 // placed by hand or copied, deleted, the grid of axes changed (src/scheme-page.js) — and with a comment by the button
 // «В журнал». An entry keeps what the program placed (from the latest placement of the element), what the element is
 // now, what changed and the comment. Kept on this computer (userData/ai-learned/journal.json) and sent to GitHub every
 // hour; a kind the engineer gave a mark becomes a rule of the set at once (ruleOf → src/ai-knowledge.js), the lines of
 // the same drawings go to Claude with the next analysis (promptFor) and a development session turns the rest into rules
 // of the code. An edit that changed nothing the drawings decide (a status, a profile) is not recorded by itself.
 const journalFile=()=>path.join(getUserDataPath(),"ai-learned","journal.json");
 const journalRead=()=>{const d=readJson(journalFile());return d&&Array.isArray(d.entries)?d:{about:"Журнал правок инженера IR Project: всё, что инженер правит и расставляет на монтажной схеме (записывается само), и комментарии кнопкой «В журнал».",entries:[]}};
 function journalWrite(d){fs.mkdirSync(path.dirname(journalFile()),{recursive:true});const tmp=journalFile()+".tmp";fs.writeFileSync(tmp,JSON.stringify(d,null,1),"utf8");fs.renameSync(tmp,journalFile())}
 const latestSet=oid=>{const all=placements(oid);return all.length?all[all.length-1].data?.set||null:null};
 const setOf=set=>set?{id:set.id,name:set.name,files:(set.files||[]).map(f=>({name:f.name,sha256:f.sha256}))}:null;
 const ACTION={edited:"правка",placed:"расставлен",deleted:"удалён",grid:"сетка осей",comment:"комментарий",confirmed:"подтверждён инженером"};
 function journalAdd(oid,{elementId,comment="",objectName="",action="",auto=false,grid=null}={}){
  const d=journalRead(),object={id:String(oid),name:String(objectName||"").slice(0,200)},at=new Date().toISOString();
  const push=entry=>{d.entries.push(entry);if(d.entries.length>20000)d.entries.splice(0,d.entries.length-20000);journalWrite(d);return{entry,total:d.entries.length}};
  // The grid of axes: what it was and what the engineer made of it.
  if(action==="grid"){
   const g=v=>({axes_x:(v?.axes_x||[]).map(String),axes_y:(v?.axes_y||[]).map(String),x_spans_mm:(v?.x_spans_mm||[]).map(Number),y_spans_mm:(v?.y_spans_mm||[]).map(Number)});
   const before=g(grid?.before),after=g(grid?.after);if(JSON.stringify(before)===JSON.stringify(after))return{entry:null,skipped:true};
   const line=v=>v.axes_x.join(",")+" ("+v.x_spans_mm.join("+")+") × "+v.axes_y.join(",")+" ("+v.y_spans_mm.join("+")+")";
   return push({id:crypto.randomUUID(),at,object,set:setOf(latestSet(oid)),action,auto:!!auto,element:null,grid:{before,after},placed:null,changes:["grid"],
    text:KIND.grid+": "+line(before)+" → "+line(after),comment:String(comment||"").trim().slice(0,2000)})
  }
  const row=database.listEntity(oid,"scheme").find(r=>String(r.id)===String(elementId)&&!isGrid(r));
  if(!row)throw Error("Элемент не найден в монтажной схеме");
  const x=row.data||{},now=originOf(x);
  let placed=null,set=null;
  for(const p of placements(oid)){const e=(p.data?.elements||[]).find(q=>q.id===String(row.id));if(e){placed=e.origin;set=p.data?.set||null}}
  const changes=action==="deleted"?["deleted"]:placed?diff(placed,now):["added"];
  // By itself: only what differs from the drawings, and not twice the same; an element added and deleted by hand is not
  // a lesson.
  if(auto){
   if(!changes.length||action==="deleted"&&!placed)return{entry:null,skipped:true};
   const last=[...d.entries].reverse().find(e=>e.object?.id===String(oid)&&e.element?.id===String(row.id));
   if(last&&JSON.stringify(last.changes)===JSON.stringify(changes)&&JSON.stringify({...last.element,id:undefined,name:undefined,profile:undefined,sheet:undefined})===JSON.stringify({...now,id:undefined}))return{entry:null,skipped:true};
  }
  const entry={id:crypto.randomUUID(),at,object,set:setOf(set||(placed?null:latestSet(oid))),action:ACTION[action]?action:"comment",auto:!!auto,
   element:{...now,id:String(row.id),name:String(x.mark_name||""),profile:String(x.profile_name||""),sheet:String(x.source_import_doc||"")},
   placed,changes,text:changes.length?changes.map(k=>KIND[k]).join(", "):"без изменений",comment:String(comment||"").trim().slice(0,2000)};
  const rule=ruleOf(entry);if(rule)entry.rule=rule;
  return push(entry)
 }
 function journalList({objectId=null,limit=200}={}){
  const all=journalRead().entries,list=objectId?all.filter(e=>e.object?.id===String(objectId)):all;
  return{total:all.length,count:list.length,entries:list.slice(-limit).reverse()}
 }
 // Lines for Claude from the journal of the same drawings: the latest entry of each element (each is measured from what
 // the program placed, so the latest says all) and of the grid.
 function journalLines(setId,limit=40){
  const out=[],latest=new Map();
  for(const e of journalRead().entries)if(e.set?.id&&e.set.id===setId){const k=e.grid?"grid":(e.object?.id||"")+"|"+(e.element?.id||e.id);latest.delete(k);latest.set(k,e)}
  for(const e of [...latest.values()].slice(-limit)){
   const a=e.element||{},b=e.placed||{};
   if(e.grid){out.push("— "+e.text+(e.comment?" — «"+e.comment+"»":""));continue}
   out.push("— "+(a.mark||b.mark||"без марки")+": "+e.text+(e.changes?.includes("levels")?" (отметки "+b.z0+"…"+b.z1+" → "+a.z0+"…"+a.z1+")":"")+(e.rule?" — это "+e.rule.typeName:"")+(e.comment?" — «"+e.comment+"»":""))
  }
  return out
 }
 return{recordPlacement,corrections,saveCorrections,confirmScheme,status,promptFor,correctionLines,journalAdd,journalList,journalLines,SECTION}
}
module.exports={createTraining,originOf,diff,setIdOf,setCodeOf,ruleOf,SECTION};
