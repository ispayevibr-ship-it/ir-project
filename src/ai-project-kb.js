"use strict";
/*
 * IR Project AI: the project knowledge base — the facts of one object: mark cards (type, section, sizes, levels),
 * where each value was read, checks and the processing log. Lives in the object's own records of SQLite
 * (object_records, sections "ai-project-kb" / "-log" / "-check"), so object_id is the project: nothing is shared between objects and
 * deleting an object deletes its records. No schema change: new record types only.
 *
 * Every value is kept with its origin: {value, unit, source:{document, page, sheet, box, method}, tolerance_mm,
 * status}. status: confirmed | needs_check | unknown. A value from the global knowledge base (method "global")
 * explains, it never becomes a confirmed fact of the object.
 */
// Each kind in its own section: listing the cards never reads the long log.
const SECTION="ai-project-kb",LOG_SECTION="ai-project-log",CHECK_SECTION="ai-project-check",LOG_LIMIT=2000;
const STATUSES=["confirmed","needs_check","unknown"];
const METHODS=["text","dimension","geometry","table","ocr","claude","engineer","computed","global"];
const LOOKALIKE={A:"А",B:"В",C:"С",E:"Е",H:"Н",K:"К",M:"М",O:"О",P:"Р",T:"Т",X:"Х"};
const markKey=v=>[...String(v||"").trim().replace(/\s+/g,"")].map(c=>LOOKALIKE[c]||c).join("").toUpperCase().replace(/Ё/g,"Е");
// One value with its origin; throws on what would be an engineering value without provenance.
function sourced(value,{unit="",source={},tolerance_mm=null,status="needs_check",formula=""}={}){
 if(!STATUSES.includes(status))throw Error("Статус значения: "+status);
 const method=String(source.method||"");
 if(!METHODS.includes(method))throw Error("Не указан способ получения значения");
 if(method==="computed"&&!formula)throw Error("Вычисленное значение без формулы");
 if(method==="global"&&status==="confirmed")throw Error("Значение из общей базы не может быть подтверждённым фактом объекта");
 if(!["engineer","computed","global"].includes(method)&&!(source.document||source.sheet))throw Error("Не указан документ или лист значения");
 const out={value,unit,source:{document:source.document??null,page:source.page??null,sheet:source.sheet||"",box:source.box||null,method},status};
 if(tolerance_mm!=null)out.tolerance_mm=Number(tolerance_mm);
 if(formula)out.formula=String(formula);
 return out
}
// Mark cards from what the sheets of one analysis read: assembly views (levels, size), «Требуется» (count, mass),
// «Ведомость элементов» КМ (section, steel), «Спецификация» КМД (section, length, mass). Each value keeps its sheet;
// a second, different value of the same field becomes a conflict, the first is kept.
function cardsFromPages(pages){
 const cards=new Map();
 for(const p of pages||[]){
  const sh=p.sheet;if(!sh)continue;
  const scope=p.docType==="КМ"?"КМ":"КМД",ocr=Number(p.ocr)>0;
  const at=method=>({document:p.documentId??null,page:p.pdfPage||p.page||null,sheet:sh.stamp?.code||sh.stamp?.name||p.sourceName||"",method:ocr?"ocr":method});
  const put=(mark,field,value,method,unit="")=>{
   if(value===null||value===undefined||value==="")return;
   const key=scope+"|"+markKey(mark);if(!markKey(mark))return;
   const c=cards.get(key)||{mark:String(mark).trim(),scope,fields:{},conflicts:[],files:[]};cards.set(key,c);
   const doc=String(p.documentId??"");if(doc&&!c.files.includes(doc))c.files.push(doc);
   const v=sourced(value,{unit,source:at(method)});
   const old=c.fields[field];
   if(!old)c.fields[field]=v;
   else if(JSON.stringify(old.value)!==JSON.stringify(value))c.conflicts.push({field,kept:old,read:v,at:new Date().toISOString()})
  };
  for(const v of sh.views||[])for(const m of v.marks||[]){
   if(v.z0_mm!==null&&v.z0_mm!==undefined)put(m,"z0_mm",v.z0_mm,"text","мм");
   if(v.z1_mm!==null&&v.z1_mm!==undefined)put(m,"z1_mm",v.z1_mm,"text","мм");
   if(v.length_mm)put(m,"size_mm",v.length_mm,"dimension","мм")
  }
  for(const r of sh.required||[]){put(r.mark,"count",r.count,"table","шт");put(r.mark,"mass_kg",r.mass_kg,"table","кг")}
  for(const r of sh.elements||[]){put(r.mark,"profile",r.profile,"table");put(r.mark,"steel",r.steel,"table")}
  for(const r of sh.spec||[]){put(r.mark,"profile",r.profile,"table");put(r.mark,"length_mm",r.length_mm,"table","мм");put(r.mark,"mass_kg",r.mass_kg,"table","кг")}
 }
 return[...cards.values()]
}
function createProjectKnowledge({database}){
 if(!database)throw Error("Project knowledge needs the database");
 const object=id=>{
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<1||!database.getObject(n))throw Error("Объект не найден");
  return n
 };
 // Oldest first (the database lists newest first).
 const rows=(oid,type,section=SECTION)=>database.listEntity(object(oid),section).filter(r=>r.record_type===type).sort((a,b)=>Number(a.id)-Number(b.id));
 const cards=oid=>rows(oid,"mark_card").map(r=>({id:r.id,...r.data}));
 // КМ and КМД number their marks independently: К1 of КМ is not К1 of КМД.
 const cardKey=(mark,scope)=>(scope==="КМ"?"КМ":"КМД")+"|"+markKey(mark);
 const card=(oid,mark,scope)=>cards(oid).find(c=>c.key===cardKey(mark,scope))||null;
 // A field confirmed by the engineer is not overwritten by recognition: the new reading goes to `conflicts`.
 // `existing` — the object's card rows read once by the caller that saves many cards.
 function saveCard(oid,mark,fields={},{scope="КМД",conflicts=[],existing=null}={}){
  const n=object(oid),key=cardKey(mark,scope);
  if(!markKey(mark))throw Error("Пустая марка");
  for(const [k,v] of Object.entries(fields))if(!v||typeof v!=="object"||!("source" in v))throw Error("Поле «"+k+"» без источника");
  const row=(existing||rows(n,"mark_card")).find(r=>r.data?.key===key);
  const prev=row?.data||{key,mark:String(mark).trim(),scope:scope==="КМ"?"КМ":"КМД",fields:{},conflicts:[]};
  const next={...prev,fields:{...prev.fields},conflicts:[...(prev.conflicts||[]),...conflicts].slice(-50),updated:new Date().toISOString()};
  for(const [k,v] of Object.entries(fields)){
   const old=next.fields[k];
   if(old?.status==="confirmed"&&old.source?.method==="engineer"&&v.source.method!=="engineer"){
    if(JSON.stringify(old.value)!==JSON.stringify(v.value))next.conflicts.push({field:k,kept:old,read:v,at:next.updated});
    continue
   }
   next.fields[k]=v
  }
  if(row){database.updateEntity(n,SECTION,row.id,{record_type:"mark_card",title:next.mark,data:next});row.data=next}
  else{const made=database.createEntity(n,SECTION,{record_type:"mark_card",title:next.mark,data:next});if(existing)existing.push(made||{data:next})}
  return next
 }
 // The processing log of the object (file, sheet, kind, start, duration, status, marks, errors, reasons).
 function log(oid,entry={}){
  const n=object(oid),list=rows(n,"processing_log",LOG_SECTION);
  const data={at:new Date().toISOString(),file:"",sheet:"",kind:"",status:"ok",duration_ms:null,marks:[],placements:0,errors:[],uncertain:[],checks:[],...entry};
  database.createEntity(n,LOG_SECTION,{record_type:"processing_log",title:data.file||data.kind||"Обработка",data});
  // The oldest entries go first once the log is long.
  for(const r of list.slice(0,Math.max(0,list.length+1-LOG_LIMIT)))database.deleteEntity(n,LOG_SECTION,r.id);
  return data
 }
 const logEntries=oid=>rows(oid,"processing_log",LOG_SECTION).map(r=>r.data).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
 function saveValidation(oid,result={}){
  const n=object(oid),data={at:new Date().toISOString(),checks:[],problems:[],...result};
  database.createEntity(n,CHECK_SECTION,{record_type:"validation",title:"Проверка",data});
  return data
 }
 const validations=oid=>rows(oid,"validation",CHECK_SECTION).map(r=>r.data);
 // Step «Анализ»: a log entry per file and the mark cards read from the sheets. Never breaks the analysis.
 function recordAnalysis(oid,{pages=[],sources=[],failed=[],started=Date.now()}={}){
  const n=object(oid),out={cards:0,conflicts:0,errors:[]};
  const read=cardsFromPages(pages),existing=rows(n,"mark_card");
  for(const c of read){
   try{saveCard(n,c.mark,c.fields,{scope:c.scope,conflicts:c.conflicts,existing});out.cards++;out.conflicts+=c.conflicts.length}
   catch(e){out.errors.push(c.mark+": "+(e.message||e))}
  }
  const duration=Date.now()-started;
  // Fasteners of a file, summed by designation; a count read under no «Кол.» header stays null.
  const fastenersOf=list=>{const by=new Map();for(const p of list)for(const f of p.sheet?.fasteners||[]){
   const k=f.text,o=by.get(k)||{...f,count:null,sheets:[]};by.set(k,o);
   if(f.count!=null)o.count=(o.count||0)+f.count;const sh=p.pdfPage||p.page;if(sh&&!o.sheets.includes(sh))o.sheets.push(sh)}
   return[...by.values()]};
  out.fasteners=fastenersOf(pages).length;
  for(const s of sources){
   const own=pages.filter(p=>String(p.documentId)===String(s.documentId));
   log(n,{file:s.name,kind:s.type,sheets:own.length,status:"ok",duration_ms:duration,
    marks:[...new Set(read.filter(c=>c.files.includes(String(s.documentId))).map(c=>c.mark))],
    fasteners:fastenersOf(own),
    placements:own.reduce((k,p)=>k+(p.schemes||[]).reduce((m,x)=>m+(x.placements||[]).length,0),0),
    uncertain:own.filter(p=>p.noText&&!p.ocr).map(p=>"лист "+(p.pdfPage||p.page)+": текст кривыми, не прочитан"),
    checks:[...read.filter(c=>c.conflicts.length&&c.files.includes(String(s.documentId))).map(c=>c.mark+": разные значения на листах"),
     // Replaced or cancelled standards the file cites.
     ...new Set(own.flatMap(p=>(p.sheet?.standards||[]).filter(x=>x.note).map(x=>x.note)))],
    standards:[...new Set(own.flatMap(p=>(p.sheet?.standards||[]).map(x=>x.designation)))]})
  }
  for(const f of failed)log(n,{file:f.name,status:"error",duration_ms:duration,errors:[f.error]});
  return out
 }
 return{cards,card,saveCard,log,logEntries,saveValidation,validations,recordAnalysis,SECTION}
}
module.exports={createProjectKnowledge,cardsFromPages,sourced,markKey,STATUSES,METHODS,SECTION,LOG_SECTION,CHECK_SECTION};
