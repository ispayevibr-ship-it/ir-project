"use strict";
/*
 * IR Project: the database kept light (the engineer, 06.11.2026 «Бд тоже перепровь на лишнее»; on the card «Удалять старые
 * анализы ИИ автоматически?» — «Хранить 2 последних»). Every «Анализ» of the drawings leaves its draft in the database
 * (section ai-scheme-draft, ~9 MB each) and they piled up with no end: 188 MB on one object by 02.11.2026, and the
 * database is read in the main process — the window waits while it reads.
 * Kept of each object: the 2 newest analyses and the newest placed one (its placement can still be undone); the older
 * ones deleted, then the freed space given back to the disk (VACUUM). Before the first cleanup a copy of the whole
 * database is put beside it once (ir-project-before-cleanup.db). On a second connection to the same file, inside
 * BEGIN IMMEDIATE (no one writes meanwhile) — as src/ai-db-batch.js. What was done goes to ai-db-cleanup.json.
 */
const path=require("node:path"),fs=require("node:fs");
const SECTION="ai-scheme-draft",TYPE="pdf_scheme_draft",KEEP=2,VACUUM_MB=32;
// Which drafts go: rows {id, object_id, placed} → ids to delete (pure, for the test).
function plan(rows,keep=KEEP){
 const by=new Map();for(const r of rows){const k=Number(r.object_id);if(!by.has(k))by.set(k,[]);by.get(k).push(r)}
 const drop=[];
 for(const list of by.values()){
  list.sort((a,b)=>Number(b.id)-Number(a.id));
  const stay=new Set(list.slice(0,keep).map(r=>Number(r.id)));
  const placed=list.find(r=>r.placed);if(placed)stay.add(Number(placed.id));
  for(const r of list)if(!stay.has(Number(r.id)))drop.push(Number(r.id))
 }
 return drop.sort((a,b)=>a-b)
}
function createCleanup({getUserDataPath,log=console}){
 const dir=()=>getUserDataPath();
 function run(){
  const file=path.join(dir(),"ir-project.db");if(!fs.existsSync(file))return null;
  let Sync=null;try{Sync=require("node:sqlite").DatabaseSync}catch{return null}
  const before=fs.statSync(file).size,report={at:new Date().toISOString(),before_mb:+(before/1048576).toFixed(1),deleted:0,objects:{}};
  const db=new Sync(file);
  try{
   db.exec("PRAGMA busy_timeout=10000");
   // (placed: the stored mark of a placement, read by SQLite itself — the 9 MB of each draft are not brought into the program)
   let rows;
   try{rows=db.prepare("SELECT id,object_id,CASE WHEN json_type(data_json,'$.placed') IN ('object') THEN 1 ELSE 0 END AS placed FROM object_records WHERE section_key=? AND record_type=?").all(SECTION,TYPE)}
   catch{rows=db.prepare("SELECT id,object_id,CASE WHEN instr(data_json,'\"placed\":{')>0 THEN 1 ELSE 0 END AS placed FROM object_records WHERE section_key=? AND record_type=?").all(SECTION,TYPE)}
   const drop=plan(rows);
   if(drop.length){
    db.exec("BEGIN IMMEDIATE");
    try{
     const copy=path.join(dir(),"ir-project-before-cleanup.db");
     if(!fs.existsSync(copy)){fs.copyFileSync(file,copy);report.backup=copy}
     const del=db.prepare("DELETE FROM object_records WHERE id=? AND section_key=? AND record_type=?");
     for(const id of drop){const r=rows.find(x=>Number(x.id)===id);if(del.run(id,SECTION,TYPE).changes){report.deleted++;const k=String(r?.object_id??"?");report.objects[k]=(report.objects[k]||0)+1}}
     db.exec("COMMIT")
    }catch(error){try{db.exec("ROLLBACK")}catch{}throw error}
   }
   // the space freed (now or by an earlier delete) given back, when there is enough of it
   const free=Number(db.prepare("PRAGMA freelist_count").get()?.freelist_count||0)*Number(db.prepare("PRAGMA page_size").get()?.page_size||4096);
   if(free>=VACUUM_MB*1048576){try{db.exec("VACUUM");report.vacuum=true}catch(error){report.vacuum_error=String(error?.message||error)}}
  }finally{try{db.close()}catch{}}
  report.after_mb=+(fs.statSync(file).size/1048576).toFixed(1);
  try{fs.writeFileSync(path.join(dir(),"ai-db-cleanup.json"),JSON.stringify(report,null,1),"utf8")}catch{}
  if(report.deleted||report.vacuum)log.log?.("IR Project: database cleanup",report);
  return report
 }
 // after the start, when the window is up and quiet; then once a day
 function start(delayMs=90000){
  const go=()=>{try{run()}catch(error){log.warn?.("IR Project: database cleanup",error);try{fs.writeFileSync(path.join(dir(),"ai-db-cleanup.json"),JSON.stringify({at:new Date().toISOString(),error:String(error?.message||error)},null,1),"utf8")}catch{}}};
  const t=setTimeout(go,delayMs);t.unref?.();const d=setInterval(go,24*3600*1000);d.unref?.();
  return()=>{clearTimeout(t);clearInterval(d)}
 }
 return{run,start}
}
module.exports={createCleanup,plan,KEEP};
