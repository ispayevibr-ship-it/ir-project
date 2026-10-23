"use strict";
/*
 * IR Project AI: what the program has learned from the engineer — kept for every object and every later set.
 * Rules "a mark (or the letters a mark starts with) is such a structure type", optionally for one project code only,
 * and short notes. The placement applies them before the catalog's own guesses; Claude gets them in every request.
 * Stored in userData/ai-knowledge.json (local, never sent anywhere except inside the request to Claude).
 */
const fs=require("node:fs"),path=require("node:path");
const ST=require("./ai-structure-types");
const LOOKALIKE={A:"А",B:"В",C:"С",E:"Е",H:"Н",K:"К",M:"М",O:"О",P:"Р",T:"Т",X:"Х"};
const norm=v=>[...String(v||"").trim().replace(/\s+/g,"")].map(c=>LOOKALIKE[c]||c).join("").toUpperCase().replace(/Ё/g,"Е");
function createKnowledge({getUserDataPath}){
 const file=()=>path.join(getUserDataPath(),"ai-knowledge.json");
 function read(){
  try{const d=JSON.parse(fs.readFileSync(file(),"utf8"));const out={rules:Array.isArray(d.rules)?d.rules:[],notes:Array.isArray(d.notes)?d.notes:[],types:Array.isArray(d.types)?d.types:[]};ST.extend(out.types);return out}
  catch{return{rules:[],notes:[],types:[]}}
 }
 // General rules from the repository (knowledge/rules.json, GitHub): after the engineer's own, never shown as his.
 function repoRules(){
  try{const d=JSON.parse(fs.readFileSync(require("./ai-knowledge-dirs").file("rules.json"),"utf8"));
   return(d.rules||[]).filter(r=>ST.byKey.get(r.type)).map(r=>({...r,mark:norm(r.mark),prefix:norm(r.prefix).replace(/\d.*$/,""),repo:true}))}
  catch{return[]}
 }
 // Lessons of Claude's processing (what it found out about reading drawings, not about one object): kept in
 // userData/ai-learned/lessons.json, sent to GitHub with the answers; the checked ones of the repository are in
 // knowledge/lessons.json. Letters of marks → a kind, words of names → a kind (applied by the program itself on every
 // later set), reading hints (given to Claude in every later request and turned into code rules after review).
 const lessonsFile=()=>path.join(getUserDataPath(),"ai-learned","lessons.json");
 const readList=f=>{try{const d=JSON.parse(fs.readFileSync(f,"utf8"));return Array.isArray(d.lessons)?d.lessons:[]}catch{return[]}};
 function lessons(){
  const repo=readList(require("./ai-knowledge-dirs").file("lessons.json")).map(l=>({...l,repo:true}));
  const own=readList(lessonsFile()).filter(l=>!repo.some(r=>lessonKey(r)===lessonKey(l)));
  return[...repo,...own]
 }
 const lessonKey=l=>l.kind==="alias"?"a|"+String(l.words||[]).toLowerCase()+"|"+String(l.to||"").toLowerCase():l.kind==="mark_letters"?"m|"+norm(l.letters)+"|"+l.type:l.kind==="name_words"?"w|"+String(l.words||[]).toLowerCase()+"|"+l.type:"r|"+String(l.text||"").toLowerCase();
 // Only what holds for any drawing: no sizes, levels or coordinates of one object (ТЗ: object values never go to the
 // general base). Letters 1–4, words of 4+ letters, a hint without numbers of 3+ digits.
 function cleanLesson(l){
  const kind=["mark_letters","name_words","alias","reading"].includes(l?.kind)?l.kind:null;if(!kind)return null;
  const type=ST.byKey.get(l.type)?l.type:"",text=String(l.text||"").trim().slice(0,300),sheet=String(l.sheet||"").slice(0,80);
  if(kind==="mark_letters"){const letters=norm(l.letters).replace(/[^A-ZА-ЯЁ]/gu,"");return /^[A-ZА-ЯЁ]{1,4}$/u.test(letters)&&type?{kind,letters,type,text,sheet}:null}
  if(kind==="name_words"){const words=(Array.isArray(l.words)?l.words:[]).map(w=>String(w).trim().toLowerCase()).filter(w=>w.length>=4&&w.length<=60&&!/\d{3,}/.test(w)).slice(0,6);
   return words.length&&type?{kind,words,type,text,sheet}:null}
  // An abbreviation of drawings and its full form («в.к.» → «верх», «Шв.» → «Швеллер»): 2–20 signs, not a number.
  if(kind==="alias"){const words=(Array.isArray(l.words)?l.words:[]).map(w=>String(w).trim()).filter(w=>w.length>=2&&w.length<=20&&/[A-Za-zА-ЯЁа-яё]/u.test(w)&&!/\d{2,}/.test(w)).slice(0,6);
   const to=String(l.to||l.text||"").trim().slice(0,40);
   return words.length&&to.length>=2&&!/\d{3,}/.test(to)&&!words.some(w=>w.toLowerCase()===to.toLowerCase())?{kind,words,to,type,text:String(l.text||"").trim().slice(0,300),sheet}:null}
  return text.length>=10&&!/\d{3,}/.test(text)?{kind,text,type,sheet}:null
 }
 // Claude's lessons of one run: new ones are kept (a lesson already known only gets one more set to its count).
 function addLessons(list,{set="",model=""}={}){
  const all=readList(lessonsFile()),known=new Set(lessons().filter(l=>l.repo).map(lessonKey));let added=0;
  for(const raw of Array.isArray(list)?list:[]){const l=cleanLesson(raw);if(!l||known.has(lessonKey(l)))continue;
   const same=all.find(x=>lessonKey(x)===lessonKey(l));
   if(same){if(set&&!(same.sets||[]).includes(set)){same.sets=[...(same.sets||[]),set].slice(-20)}continue}
   all.push({...l,source:"Claude"+(model?" ("+model+")":""),sets:set?[set]:[],at:new Date().toISOString()});added++}
  fs.mkdirSync(path.dirname(lessonsFile()),{recursive:true});
  const tmp=lessonsFile()+".tmp";fs.writeFileSync(tmp,JSON.stringify({about:"Уроки обработки Claude: буквы марок и слова наименований → вид конструкции, советы по чтению чертежей. Проверяются и переносятся в knowledge/lessons.json.",lessons:all.slice(-2000)},null,1),"utf8");fs.renameSync(tmp,lessonsFile());
  applyWords();return{added,total:all.length}
 }
 // The abbreviations for the reading of sheets (src/ai-text-aliases.js).
 const aliases=()=>lessons().filter(l=>l.kind==="alias").map(l=>({from:l.words,to:l.to}));
 function applyWords(){try{ST.learn(lessons().filter(l=>l.kind==="name_words").map(l=>({key:l.type,words:l.words})))}catch{}}
 function write(d){
  fs.mkdirSync(path.dirname(file()),{recursive:true});
  const tmp=file()+".tmp";fs.writeFileSync(tmp,JSON.stringify(d,null,1),"utf8");fs.renameSync(tmp,file())
 }
 const id=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
 // A rule: {mark} for one mark, or {prefix} for every mark starting with these letters (followed by a digit);
 // {project} limits it to the sets whose files start with this code ("047-2025").
 function setType({mark="",prefix="",type,project="",note=""}){
  read();if(!ST.byKey.get(type))throw Error("Неизвестный вид конструкции");
  const m=norm(mark),p=norm(prefix).replace(/\d.*$/,"");
  if(!m&&!p)throw Error("Укажите марку или её буквы");
  const d=read(),key=r=>(r.mark||"")+"|"+(r.prefix||"")+"|"+(r.project||"");
  const rule={id:id(),mark:m,prefix:m?"":p,type,project:String(project||"").trim().slice(0,60),note:String(note||"").slice(0,300),at:new Date().toISOString()};
  d.rules=d.rules.filter(r=>key(r)!==key(rule));d.rules.push(rule);write(d);return list()
 }
 // A kind of structure the catalog has no entry for ("Балка-стенка", "Опора под оборудование"): its name, group on the
 // montage scheme, geometry, the letters of its marks and the words of its name. Becomes part of the catalog at once
 // (placement, scheme, 3D, Claude) and goes to GitHub with the other lessons, to be added to the built-in catalog.
 const TR={а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"i",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",щ:"sh",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya"};
 const slug=v=>[...String(v).toLowerCase()].map(c=>TR[c]??c).join("").replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,50)||"vid";
 const list2=v=>(Array.isArray(v)?v:String(v||"").split(/[,;]+/)).map(x=>String(x).trim()).filter(Boolean).slice(0,20);
 function addType({name,group="other",geometry="beam",marks=[],words=[],note="",source="инженер"}={}){
  name=String(name||"").trim().slice(0,80);if(!name)throw Error("Укажите наименование вида конструкции");
  if(!ST.GROUPS.some(g=>g.key===group))throw Error("Неизвестная группа схемы");
  if(!ST.GEOMETRIES.includes(geometry))throw Error("Неизвестная геометрия");
  const d=read(),same=d.types.find(t=>t.name.toLowerCase()===name.toLowerCase());
  const builtIn=ST.TYPES.find(t=>!t.user&&t.name.toLowerCase()===name.toLowerCase());if(builtIn)throw Error("Такой вид уже есть в справочнике: "+builtIn.name);
  const key=same?.key||("user_"+slug(name)+(d.types.some(t=>t.key==="user_"+slug(name))?"_"+id().slice(-3):""));
  const type={key,name,group,geometry,marks:list2(marks).filter(m=>/^[A-Za-zА-ЯЁа-яё]{1,4}$/u.test(m)),words:list2(words).map(w=>w.toLowerCase()),note:String(note||"").slice(0,300),source:String(source).slice(0,60),at:new Date().toISOString()};
  d.types=d.types.filter(t=>t.key!==key);d.types.push(type);write(d);ST.extend(d.types);return list()
 }
 function addNote(text){const t=String(text||"").trim().slice(0,1000);if(!t)throw Error("Пустая заметка");const d=read();d.notes.push({id:id(),text:t,at:new Date().toISOString()});write(d);return list()}
 function remove(ruleId){const d=read();d.rules=d.rules.filter(r=>r.id!==ruleId);d.notes=d.notes.filter(n=>n.id!==ruleId);d.types=d.types.filter(t=>t.key!==ruleId);write(d);ST.extend(d.types);return list()}
 function list(){const d=read();return{rules:d.rules.map(r=>({...r,typeName:ST.byKey.get(r.type)?.name||r.type})),notes:d.notes,
  types:d.types.map(t=>({...t,groupName:ST.group(t.group).label}))}}
 // A mark means different things in different sets (К12 is a column in one, a purlin in another). What the engineer
 // said about a mark (or its letters) of this very set (the rule names its project) decides first; every other rule — a mark
 // without a project, the letters of marks, the letters Claude found — is a hint only, used where the set's own names
 // say nothing: resolver(hint)(mark) gives the first, resolver(hint).loose(mark) the second.
 function resolver(projectHint=""){
  const own=read().rules,proj=String(projectHint||"");
  // The engineer's rules first, then the repository's.
  applyWords();
  const general=[...repoRules(),...lessons().filter(l=>l.kind==="mark_letters").map(l=>({prefix:l.letters,type:l.type,lesson:true}))];
  const rules=[...own,...general.filter(r=>!own.some(o=>o.mark===(r.mark||"")&&o.prefix===(r.prefix||"")&&(o.project||"")===(r.project||"")))];
  const ours=r=>r.project&&proj.includes(r.project),fits=r=>!r.project||ours(r);
  const scoped=mark=>{
   const m=norm(mark);if(!m)return null;
   const exact=rules.find(r=>r.mark&&r.mark===m&&ours(r));
   if(exact)return ST.byKey.get(exact.type)||null;
   const pre=rules.filter(r=>r.prefix&&ours(r)&&m.startsWith(r.prefix)&&/^\d/.test(m.slice(r.prefix.length))).sort((a,b)=>b.prefix.length-a.prefix.length)[0];
   return pre?ST.byKey.get(pre.type)||null:null
  };
  scoped.loose=mark=>{
   const m=norm(mark);if(!m)return null;
   const exact=rules.find(r=>r.mark&&r.mark===m&&!r.project);
   if(exact)return ST.byKey.get(exact.type)||null;
   const pre=rules.filter(r=>r.prefix&&m.startsWith(r.prefix)&&/^\d/.test(m.slice(r.prefix.length))&&fits(r))
    .sort((a,b)=>b.prefix.length-a.prefix.length||(b.project?1:0)-(a.project?1:0))[0];
   return pre?ST.byKey.get(pre.type)||null:null
  };
  return scoped
 }
 // For the request to Claude: the engineer's rules and notes in plain words.
 // Rules of other projects are left out: their marks mean other things.
 function forPrompt(projectHint=""){
  const proj=String(projectHint||""),d=read(),repo=repoRules();if(!d.rules.length&&!d.notes.length&&!repo.length&&!d.types.length&&!lessons().length)return"";
  d.rules=[...d.rules,...repo].filter(r=>!r.project||proj.includes(r.project));
  const lines=["УКАЗАНИЯ ИНЖЕНЕРА (запомненные программой, выполняй их):",
   "- Марка в разных комплектах значит разное (К12 в одном — колонна, в другом — прогон). Вид элемента бери из ведомости и наименований этого комплекта; марки без проекта и буквы марок ниже — только подсказка, когда наименования нет."];
  for(const r of d.rules)lines.push("- "+(r.mark?"марка "+r.mark:"марки на «"+r.prefix+"…»")+" — "+(ST.byKey.get(r.type)?.name||r.type)+" ("+r.type+")"+(r.project?", в этом комплекте ("+r.project+")":", подсказка")+(r.note?" — "+r.note:""));
  for(const n of d.notes.slice(-40))lines.push("- "+n.text);
  const learned=lessons();
  if(learned.length){
   lines.push("УЖЕ ВЫУЧЕНО ПО ПРЕЖНИМ КОМПЛЕКТАМ (не повторяй это в lessons, дополняй новым):");
   for(const l of learned.slice(-120))lines.push("- "+(l.kind==="mark_letters"?"марки на «"+l.letters+"…» — "+(ST.byKey.get(l.type)?.name||l.type):l.kind==="name_words"?"«"+l.words.join("», «")+"» в наименовании — "+(ST.byKey.get(l.type)?.name||l.type):l.kind==="alias"?"«"+l.words.join("», «")+"» = «"+l.to+"»":l.text)+(l.repo?" (проверено)":""))
  }
  if(d.types.length)lines.push("Виды конструкций, добавленные инженером (ключ — наименование (буквы марок) — слова): "+d.types.map(t=>t.key+" — "+t.name+(t.marks.length?" ("+t.marks.join(", ")+")":"")+(t.words.length?" — "+t.words.join(", "):"")).join("; "));
  return lines.join("\n")
 }
 return{list,setType,addNote,addType,remove,resolver,forPrompt,lessons,addLessons,lessonsFile,aliases}
}
module.exports={createKnowledge};
