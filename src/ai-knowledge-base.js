"use strict";
/*
 * IR Project AI: the knowledge base — what is already known about drawing sets, so that a set read once (by the
 * program, by Claude inside the program or by Claude in a development session) is not read again.
 *
 * Two places, the same format:
 *  - knowledge/ in the repository (GitHub): curated entries that arrive with every hot update — read only;
 *  - userData/ai-learned/: what this computer learned (Claude's answers), to be reviewed and moved into knowledge/.
 *
 * An entry (knowledge/sets/<id>.json) describes one set of PDFs, recognised by the SHA-256 of its files:
 * {id, title, project, files:[{name,sha256,kind}], source, created, result:{summary, marks, grid, elements, tank},
 *  notes:[…]}. `result` has the format of Claude's answer (src/ai-montage.js) without the per-scheme decisions,
 * which depend on page numbers; it fills step 3 when the set is analysed again, without a request.
 * knowledge/rules.json: general rules {rules:[{mark|prefix, type, project, note}]} — merged with the engineer's own.
 */
const fs=require("node:fs"),path=require("node:path");
// knowledge/ next to src/ — the hot update folder or the installed app.
const REPO_DIR=path.join(__dirname,"..","knowledge");
const readJson=f=>{try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch{return null}};
function entriesIn(dir){
 try{return fs.readdirSync(dir).filter(f=>f.endsWith(".json")).map(f=>({...readJson(path.join(dir,f)),file:f})).filter(e=>e&&Array.isArray(e.files)&&e.result)}
 catch{return[]}
}
// What a set is about, to find similar ones: document codes of the stamps, the kind of structure, the words of the
// names of sheets and marks (no numbers: values of one object never make sets similar).
const KIND_NAME={tank:"резервуар",vessel:"чан, ёмкость",frame:"каркас"};
const STOP=new Set(["лист","листов","марка","марки","схема","чертеж","чертёж","сборочный","монтажная","часть","элемент","элементы","спецификация","ведомость","общие","данные","стадия"]);
const wordsOf=text=>[...new Set(String(text||"").toLowerCase().replace(/ё/g,"е").split(/[^а-яa-z]+/u).filter(w=>w.length>=5&&!STOP.has(w)).map(w=>w.slice(0,7)))];
function signatureOf({pages,entry}={}){
 if(entry){
  const r=entry.result||{},text=[entry.title,...(r.marks||[]).map(m=>m.note),...(r.elements||[]).map(e=>e.name),...((r.vessel?.parts)||[]).map(p=>p.name),...((r.tank?.items)||[]).map(i=>i.name)].join(" ");
  const codes=[...new Set([entry.project,entry.title].join(" ").match(/\d{2,4}[-.]\d{2,4}(?:[-.]\d+)*\s*КМД?|[\w.-]*КМД?\d*(?:-\d+)?/gu)||[])].map(c=>c.replace(/\s+/g,"")).filter(c=>/\d/.test(c));
  return{codes,kind:r.tank?.is_tank?"tank":r.vessel?.is_vessel?"vessel":(r.elements||[]).length||(r.verified?.elements||[]).length?"frame":"",words:wordsOf(text)}
 }
 const names=(pages||[]).map(p=>p.sheet?.stamp?.name||"").join(" | ");
 const codes=[...new Set((pages||[]).map(p=>String(p.sheet?.stamp?.code||"").replace(/\s+/g,"")).filter(c=>/\d/.test(c)))];
 const kind=(pages||[]).some(p=>p.tank)?"tank":/(?:^|[^а-яё])(?:чан|сгустител|бункер|ёмкост|емкост|силос)/iu.test(names)?"vessel":(pages||[]).some(p=>(p.schemes||[]).length)?"frame":"";
 return{codes,kind,words:wordsOf(names)}
}
function createKnowledgeBase({getUserDataPath,repoDir=REPO_DIR}){
 const learnedDir=()=>path.join(getUserDataPath(),"ai-learned","sets");
 // The repository's knowledge: the data of the drawings pulled from the closed repository, then the update
 // (src/ai-knowledge-dirs.js); a folder given by a test is read alone. The same file once, the closed one first.
 const kd=require("./ai-knowledge-dirs"),own=repoDir!==REPO_DIR;
 const repoDirs=sub=>own?[path.join(repoDir,sub)]:kd.dirs(sub),repoFile=rel=>own?path.join(repoDir,rel):kd.file(rel);
 const once=list=>{const seen=new Set();return list.filter(e=>!seen.has(e.file)&&seen.add(e.file))};
 const repoSets=()=>once(repoDirs("sets").flatMap(entriesIn));
 const all=()=>[...repoSets().map(e=>({...e,origin:"база знаний"})),...entriesIn(learnedDir()).map(e=>({...e,origin:"этот компьютер"}))];
 // Entries all of whose files are in this set (a set may hold more files than an entry, e.g. КМ and КМД apart).
 function match(files){
  const have=new Set((files||[]).map(f=>f.sha256).filter(Boolean));
  if(!have.size)return[];
  const found=all().filter(e=>e.files.length&&e.files.every(f=>have.has(f.sha256)));
  // The repository entry wins over a local one for the same files.
  const seen=new Set();return found.filter(e=>{const k=e.files.map(f=>f.sha256).sort().join(",");if(seen.has(k))return false;seen.add(k);return true})
 }
 // One result from several entries: elements and marks add up, the fullest grid and tank win.
 function merged(entries){
  if(!entries.length)return null;
  const r={summary:entries.map(e=>e.result.summary).filter(Boolean).join(" "),schemes:[],marks:[],elements:[],grid:null,tank:null,fromKnowledge:true};
  for(const e of entries){
   r.marks.push(...(e.result.marks||[]));r.elements.push(...(e.result.elements||[]));
   const g=e.result.grid;if(g&&(g.axes_x||[]).length+(g.axes_y||[]).length>((r.grid?.axes_x||[]).length+(r.grid?.axes_y||[]).length))r.grid=g;
   const t=e.result.tank;if(t?.is_tank&&(!r.tank||(t.items||[]).length>(r.tank.items||[]).length))r.tank=t;
   // A set of several different tanks (РВС-2000 and РВС-400 in one КМ): the others besides the first.
   if(Array.isArray(e.result.tanks)&&e.result.tanks.length&&!r.tanks)r.tanks=e.result.tanks;
   // A vessel on supports (чан): the entry with the most parts.
   const v=e.result.vessel;if(v?.is_vessel&&(!r.vessel||(v.parts||[]).length>(r.vessel.parts||[]).length))r.vessel=v;
   // A scheme the engineer checked (Схема проверена): placed as it is, before everything else.
   if(e.result.verified?.elements?.length&&(!r.verified||e.result.verified.at>r.verified.at))r.verified={...e.result.verified,title:e.title||""}
  }
  return r
 }
 // Claude's fresh answer for a set that has a checked entry in the repository: the tank keeps every value of the
 // checked entry (courses, roof shields, the central ring, the stair and the walkway as checked on the sheets);
 // Claude only fills what the entry does not say. Claude's own marks and elements stay. Without such an entry — as is.
 function withChecked(result,files){
  if(!result||result.fromKnowledge)return result;
  const have=new Set((files||[]).map(f=>f.sha256).filter(Boolean));
  const checked=have.size?repoSets().filter(e=>e.files.length&&e.files.every(f=>have.has(f.sha256))):[];
  const kb=merged(checked);
  // A scheme the engineer checked on this computer (or in the repository) goes over a fresh answer of Claude.
  const ver=have.size?merged(all().filter(e=>e.result?.verified&&e.files.length&&e.files.every(f=>have.has(f.sha256))))?.verified:null;
  if(ver)result={...result,verified:ver};
  if(kb?.vessel&&!kb.tank){
   // The checked vessel keeps its numbers; parts Claude named that the entry does not have are added.
   const own=result.vessel?.is_vessel?result.vessel:{},known=new Set((kb.vessel.parts||[]).map(p=>p.mark));
   const vessel={...own,...kb.vessel,parts:[...(kb.vessel.parts||[]),...(own.parts||[]).filter(p=>!known.has(p.mark))]};
   return{...result,vessel,checkedTank:checked.map(e=>e.title||e.id).join(", ")}
  }
  if(!kb?.tank)return result;
  const own=result.tank?.is_tank?result.tank:{};
  const tank={...own,...kb.tank,items:(kb.tank.items||[]).length>=(own.items||[]).length?kb.tank.items:own.items};
  return{...result,tank,...(kb.tanks?{tanks:kb.tanks}:{}),checkedTank:checked.map(e=>e.title||e.id).join(", ")}
 }
 // What Claude answered for a set, kept on this computer for the next analysis and for the repository.
 function saveLearned({files,title,project,result,model,note}){
  const shas=(files||[]).map(f=>f.sha256).filter(Boolean).sort();
  if(!shas.length||!result)return null;
  const id=require("node:crypto").createHash("sha256").update(shas.join(",")).digest("hex").slice(0,16);
  const entry={id,title:String(title||""),project:String(project||""),files:files.map(f=>({name:f.name,sha256:f.sha256,kind:f.type||f.kind||""})),
   source:"Claude"+(model?" ("+model+")":"")+" в программе",created:new Date().toISOString(),
   result:{summary:result.summary||"",marks:result.marks||[],grid:result.grid||null,elements:result.elements||[],tank:result.tank||null,vessel:result.vessel||null,new_types:result.new_types||[],lessons:result.lessons||[]},notes:[]};
  fs.mkdirSync(learnedDir(),{recursive:true});
  const file=path.join(learnedDir(),id+".json"),tmp=file+".tmp";
  // A scheme checked by the engineer is not replaced by a later answer of Claude: the answer goes beside it.
  const prev=readJson(file);if(prev?.result?.verified){entry.result.verified=prev.result.verified;entry.source=prev.source+"; затем "+entry.source}
  // The engineer's comments to the runs of this set are kept with it (they go to the repository with the answer and
  // to the next run of the same set), the earlier ones first.
  const before=readJson(file)?.notes;if(Array.isArray(before))entry.notes.push(...before.filter(n=>n&&n.text));
  if(String(note||"").trim()&&!entry.notes.some(n=>n.text===String(note).trim()))entry.notes.push({at:entry.created,text:String(note).trim(),model:model||""});
  fs.writeFileSync(tmp,JSON.stringify(entry,null,1),"utf8");fs.renameSync(tmp,file);
  return entry
 }
 // «Схема проверена»: the scheme the engineer checked becomes the result of these files (the answer of Claude kept
 // in the same entry stays for the marks and the summary).
 function saveVerified({files,title,verified,marks,note}){
  const shas=(files||[]).map(f=>f.sha256).filter(Boolean).sort();
  if(!shas.length||!verified?.elements?.length)return null;
  const id=require("node:crypto").createHash("sha256").update(shas.join(",")).digest("hex").slice(0,16);
  fs.mkdirSync(learnedDir(),{recursive:true});
  const file=path.join(learnedDir(),id+".json"),tmp=file+".tmp",prev=readJson(file);
  const entry=prev&&prev.result?prev:{id,title:String(title||""),project:"",files:files.map(f=>({name:f.name,sha256:f.sha256,kind:f.type||f.kind||""})),created:new Date().toISOString(),result:{summary:"",marks:[],grid:null,elements:[],tank:null},notes:[]};
  entry.result.verified=verified;
  if(!(entry.result.marks||[]).length&&marks?.length)entry.result.marks=marks;
  entry.source="Инженер: схема проверена"+(prev?.source&&!/^Инженер/.test(prev.source)?" (ответ: "+prev.source+")":"");
  entry.verified_at=verified.at;
  if(String(note||"").trim())(entry.notes=entry.notes||[]).push({at:verified.at,text:String(note).trim(),model:"инженер"});
  fs.writeFileSync(tmp,JSON.stringify(entry,null,1),"utf8");fs.renameSync(tmp,file);
  return entry
 }
 // Checked sets like this one (not the same files): the same project code, the same kind of structure, the same
 // words in the names of sheets and marks. Given to Claude as examples and shown to the engineer before the analysis.
 function similar({files=[],pages=[]}={},limit=3){
  const have=new Set((files||[]).map(f=>f.sha256).filter(Boolean));
  const own=signatureOf({pages});
  const out=[];
  for(const e of all()){
   if(!e.files?.length||e.files.every(f=>have.has(f.sha256)))continue;
   const sig=e.signature||signatureOf({entry:e}),reasons=[];let score=0;
   const shared=e.files.filter(f=>have.has(f.sha256)).length;
   if(shared){score+=0.6*shared/e.files.length;reasons.push("общих файлов "+shared+" из "+e.files.length)}
   const codes=own.codes.filter(c=>sig.codes.includes(c));if(codes.length){score+=0.35;reasons.push("тот же шифр "+codes[0])}
   if(own.kind&&own.kind===sig.kind){score+=0.2;reasons.push(KIND_NAME[own.kind])}
   const words=own.words.filter(w=>sig.words.includes(w)),j=words.length/Math.max(1,new Set([...own.words,...sig.words]).size);
   if(words.length>=2){score+=Math.min(0.3,j*1.5);reasons.push("общие слова: "+words.slice(0,5).join(", "))}
   if(score>=0.3)out.push({id:e.id,title:e.title||e.id,origin:e.origin,checked:e.origin==="база знаний"||Boolean(e.result?.verified),score:Math.round(score*100)/100,reasons,entry:e})
  }
  return out.sort((a,b)=>b.checked-a.checked||b.score-a.score).slice(0,limit)
 }
 // The engineer's comments sent with earlier Claude runs of this very set (this computer and the repository).
 function notesFor(files){
  const have=new Set((files||[]).map(f=>f.sha256).filter(Boolean));if(!have.size)return[];
  const list=all().filter(e=>e.files.length&&e.files.every(f=>have.has(f.sha256))).flatMap(e=>(e.notes||[]).filter(n=>n&&typeof n.text==="string"&&n.text.trim()));
  const seen=new Set();return list.filter(n=>!seen.has(n.text)&&seen.add(n.text))
 }
 const rules=()=>readJson(repoFile("rules.json"))?.rules||[];
 const projects=()=>once(repoDirs("projects").flatMap(dir=>{try{return fs.readdirSync(dir).filter(f=>f.endsWith(".json")).map(f=>({...readJson(path.join(dir,f)),file:f}))}catch{return[]}})).map(({file,...p})=>p).filter(p=>Object.keys(p).length);
 // What the base holds, for the «База знаний и обучение» section.
 function stats(){
  const list=all();
  return{sets:list.filter(e=>e.origin==="база знаний").length,learned:list.filter(e=>e.origin==="этот компьютер").length,
   verified:list.filter(e=>e.result?.verified).length,rules:rules().length,projects:projects().length,
   list:list.map(e=>({id:e.id,title:e.title||e.id,origin:e.origin,verified:Boolean(e.result?.verified),files:e.files.length}))}
 }
 return{match,merged,withChecked,notesFor,saveLearned,saveVerified,similar,rules,projects,learnedDir,all,stats}
}
module.exports={createKnowledgeBase,signatureOf,REPO_DIR};
