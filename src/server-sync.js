"use strict";
/*
 * IR Project: the data of the program kept the same on every computer through the company's server https://a-ts.kz
 * (the engineer, 09.11.2026 «перенос на хостинг с автосинхронизацией программы»; design — server/README.md).
 * Every computer keeps its own ir-project.db. A change made here (by any part of the program — the windows, the
 * recognition, the trash, the cleanup) is caught by the database itself: triggers write «row N of table T changed» into
 * sync_outbox; this module sends those rows to the server as the person signed in (the server checks the rights:
 * a row of an object or section not given to him is refused and stays only here). Every 20 seconds it asks the server
 * what others changed since the last time and writes it into the database (the triggers are quiet then).
 * A row is known everywhere by its number (rid = id in the program). So that two computers never make two different
 * rows with one number, each database takes its own range of numbers once: range N — from N·10⁹ (the rows that were
 * here before, the administrator's database, are below 10⁹).
 * Not sent (heavy, made again on each computer — «Распознавание делает каждый пк»): the analyses of the drawings, the
 * training placements, the snapshots of the scheme, the list of PDF files, the processing log.
 * Deleted rows are marked deleted on the server — nothing is lost there (the history keeps every previous state).
 */
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");

const RANGE=1e9;
const LOCAL_ONLY=new Set(["ai-training","ai-scheme-draft","scheme-snapshots","ai-documents","ai-project-log"]);
const TABLES=[
 {table:"objects",coll:"objects",fields:r=>({row:r})},
 {table:"object_sections",coll:"sections",fields:r=>({object_rid:r.object_id,section_key:r.section_key,row:r})},
 {table:"object_records",coll:"records",fields:r=>({object_rid:r.object_id,section_key:r.section_key,record_type:r.record_type||"",row:r})},
];
const byTable=Object.fromEntries(TABLES.map(t=>[t.table,t]));
const MAX_ROW=60*1048576;

function triggersSql(){
 const quiet="(SELECT v FROM sync_state WHERE k='applying') IS NOT '1'";
 return TABLES.map(({table})=>[
  `CREATE TRIGGER IF NOT EXISTS sync_${table}_ins AFTER INSERT ON ${table} WHEN ${quiet} BEGIN INSERT INTO sync_outbox(tbl,rid) VALUES('${table}',NEW.id); END;`,
  `CREATE TRIGGER IF NOT EXISTS sync_${table}_upd AFTER UPDATE ON ${table} WHEN ${quiet} BEGIN INSERT INTO sync_outbox(tbl,rid) VALUES('${table}',NEW.id); END;`,
  `CREATE TRIGGER IF NOT EXISTS sync_${table}_del AFTER DELETE ON ${table} WHEN ${quiet} BEGIN INSERT INTO sync_outbox(tbl,rid) VALUES('${table}',OLD.id); END;`,
 ].join("\n")).join("\n")
}
const SCHEMA=`CREATE TABLE IF NOT EXISTS sync_state(k TEXT PRIMARY KEY,v TEXT);
CREATE TABLE IF NOT EXISTS sync_outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT,tbl TEXT NOT NULL,rid INTEGER NOT NULL,at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_row ON sync_outbox(tbl,rid);
CREATE TABLE IF NOT EXISTS sync_map(tbl TEXT NOT NULL,rid INTEGER NOT NULL,sid TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(tbl,rid));`;

function createServerSync({dbFile,account,getUserDataPath,DatabaseSync=require("node:sqlite").DatabaseSync,timers=true,now=()=>Date.now()}){
 let db=null;
 const open=()=>{if(!db){db=new DatabaseSync(dbFile());db.exec("PRAGMA busy_timeout=8000");db.exec("PRAGMA foreign_keys=OFF");db.exec(SCHEMA)}return db};
 const getState=k=>{try{return open().prepare("SELECT v FROM sync_state WHERE k=?").get(k)?.v??""}catch{return""}};
 const setState=(k,v)=>open().prepare("INSERT INTO sync_state(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(k,String(v));
 const status={state:"off",error:"",lastAt:"",changedAt:0,progress:null,rejected:0,rejectedWhy:""};
 const columns={};
 const colsOf=t=>columns[t]||(columns[t]=open().prepare(`PRAGMA table_info(${t})`).all().map(c=>c.name));
 const enabled=()=>getState("enabled")==="1";

 // ---- this database's range of numbers ----
 function fixSequences(){
  const base=Number(getState("range"))*RANGE;if(!base)return;
  for(const {table} of TABLES){
   const top=open().prepare(`SELECT MAX(id) m FROM ${table} WHERE id>=? AND id<?`).get(base,base+RANGE)?.m||base;
   const has=open().prepare("SELECT seq FROM sqlite_sequence WHERE name=?").get(table);
   if(has)open().prepare("UPDATE sqlite_sequence SET seq=? WHERE name=?").run(top,table);
   else open().prepare("INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)").run(table,top)
  }
 }
 async function takeRange(){
  if(Number(getState("range")))return Number(getState("range"));
  const name="База данных · "+os.hostname();
  for(let i=0;i<6;i++){
   const top=await account.api("/api/collections/devices/records?perPage=1&sort=-rid");
   const rid=Math.max(100,(top?.items?.[0]?.rid||0))+1+i;
   try{await account.api("/api/collections/devices/records",{method:"POST",body:{rid,name,machine:os.hostname().slice(0,200)}});setState("range",rid);return rid}
   catch(e){if(e.status!==400)throw e}
  }
  throw Error("Сервер не выдал номер для этой базы — попробуйте ещё раз")
 }

 // ---- on / off ----
 async function enable(){
  if(!account.info().signedIn)throw Error("Сначала войдите в программу (почта и пароль)");
  open();await takeRange();
  open().exec(triggersSql());fixSequences();
  setState("enabled","1");setState("user",account.info().user.id);
  status.state="idle";status.error="";kick();
  return info()
 }
 function disable(){
  if(db)for(const {table} of TABLES)for(const s of ["ins","upd","del"])open().exec(`DROP TRIGGER IF EXISTS sync_${table}_${s}`);
  if(db)setState("enabled","0");status.state="off";return info()
 }
 // The first sending of the whole database — only the administrator's computer, once (the engineer: «База которая
 // сейчас у меня на пк пока главная»). A copy of the database is made first: ir-project-before-sync.db next to it.
 async function uploadAll(){
  if(account.info().user?.role!=="admin")throw Error("Всю базу на сервер отправляет только администратор");
  if(!enabled())await enable();
  const copy=path.join(path.dirname(dbFile()),"ir-project-before-sync.db");
  if(!fs.existsSync(copy))open().exec(`VACUUM INTO '${copy.replace(/'/g,"''")}'`);
  const d=open();
  d.exec("BEGIN");
  try{
   d.exec("INSERT INTO sync_outbox(tbl,rid) SELECT 'objects',id FROM objects ORDER BY id");
   d.exec("INSERT INTO sync_outbox(tbl,rid) SELECT 'object_sections',id FROM object_sections ORDER BY id");
   const ph=[...LOCAL_ONLY].map(()=>"?").join(",");
   d.prepare(`INSERT INTO sync_outbox(tbl,rid) SELECT 'object_records',id FROM object_records WHERE section_key NOT IN (${ph}) ORDER BY id`).run(...LOCAL_ONLY);
   d.exec("COMMIT")
  }catch(e){d.exec("ROLLBACK");throw e}
  setState("uploaded",new Date().toISOString());
  status.progress={done:0,total:pending()};kick();
  return info()
 }

 const pending=()=>{try{return open().prepare("SELECT COUNT(DISTINCT tbl||':'||rid) n FROM sync_outbox").get().n}catch{return 0}};
 function info(){
  const on=enabled();
  return{enabled:on,range:Number(getState("range"))||0,uploaded:getState("uploaded"),pending:on?pending():0,...status,
   state:on?status.state:"off",localOnly:[...LOCAL_ONLY]}
 }

 // ---- sending ----
 const rowOf=(table,id)=>open().prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
 const mapOf=(table,rid)=>open().prepare("SELECT sid,version FROM sync_map WHERE tbl=? AND rid=?").get(table,rid);
 const setMap=(table,rid,sid,version)=>open().prepare("INSERT INTO sync_map(tbl,rid,sid,version) VALUES(?,?,?,?) ON CONFLICT(tbl,rid) DO UPDATE SET sid=excluded.sid,version=excluded.version").run(table,rid,sid,version||0);
 const plain=r=>{const o={};for(const [k,v] of Object.entries(r))o[k]=typeof v==="bigint"?Number(v):v;return o};
 async function sendOne({tbl,rid}){
  const t=byTable[tbl];if(!t)return"skip";
  const local=rowOf(tbl,rid);
  if(local&&tbl==="object_records"&&LOCAL_ONLY.has(local.section_key))return"skip";
  let sid=mapOf(tbl,rid)?.sid;
  if(!sid){const f=await account.api(`/api/collections/${t.coll}/records?perPage=1&fields=id,version&filter=${encodeURIComponent("rid="+Number(rid))}`);sid=f?.items?.[0]?.id||""}
  if(!local&&!sid)return"skip";
  let body;
  if(local){const row=plain(local);if(JSON.stringify(row).length>MAX_ROW)return"big";body={...t.fields(row),deleted:false,device:Number(getState("range"))||0}}
  else body={deleted:true};
  const r=sid?await account.api(`/api/collections/${t.coll}/records/${sid}`,{method:"PATCH",body}):
   await account.api(`/api/collections/${t.coll}/records`,{method:"POST",body:{rid:Number(rid),...body}});
  setMap(tbl,rid,r.id,r.version);
  return"ok"
 }
 async function pushNow(){
  const d=open();
  for(;;){
   const batch=d.prepare("SELECT tbl,rid,MAX(seq) seq FROM sync_outbox GROUP BY tbl,rid ORDER BY MIN(seq) LIMIT 60").all();
   if(!batch.length)break;
   status.state="sending";
   // the objects before their sections and records (the server gives the rights by the object)
   const groups=[batch.filter(b=>b.tbl==="objects"),batch.filter(b=>b.tbl==="object_sections"),batch.filter(b=>b.tbl==="object_records")];
   for(const g of groups){
    for(let i=0;i<g.length;i+=6){
     await Promise.all(g.slice(i,i+6).map(async b=>{
      let res;
      try{res=await sendOne(b)}
      catch(e){if(!e.status||e.status>=500||e.status===401||e.status===429)throw e;res="refused";status.rejected++;status.rejectedWhy=e.data?.data?.rid?"Строка с таким номером уже есть на сервере":"Нет прав на этот объект или раздел — изменение осталось только на этом компьютере"}
      d.prepare("DELETE FROM sync_outbox WHERE tbl=? AND rid=? AND seq<=?").run(b.tbl,b.rid,b.seq);
      if(status.progress)status.progress.done++;
      return res
     }))
    }
   }
  }
  if(status.progress&&!pending())status.progress=null;
  if(status.state==="sending")status.state="idle"
 }

 // ---- receiving ----
 function applyRows(table,items){
  const d=open(),cols=colsOf(table);
  let n=0;
  d.exec("BEGIN");
  try{
   setState("applying","1");
   for(const it of items){
    const rid=Number(it.rid);
    // a change made here and not yet sent wins: it goes to the server next
    if(d.prepare("SELECT 1 FROM sync_outbox WHERE tbl=? AND rid=? LIMIT 1").get(table,rid))continue;
    if(it.deleted){
     if(table==="objects"){d.prepare("DELETE FROM object_records WHERE object_id=?").run(rid);d.prepare("DELETE FROM object_sections WHERE object_id=?").run(rid)}
     d.prepare(`DELETE FROM ${table} WHERE id=?`).run(rid)
    }else{
     const row=it.row&&typeof it.row==="object"?it.row:null;if(!row)continue;
     if(table==="object_records"&&LOCAL_ONLY.has(row.section_key))continue;
     const keys=cols.filter(c=>c!=="id"&&row[c]!==undefined);
     const vals=keys.map(k=>{const v=row[k];return v===null||typeof v==="number"||typeof v==="string"?v:typeof v==="boolean"?(v?1:0):JSON.stringify(v)});
     // a row that does not fit this database (an older or a broken one) is passed by, the rest go on
     try{d.prepare(`INSERT INTO ${table}(id${keys.map(k=>","+k).join("")}) VALUES(?${keys.map(()=>",?").join("")}) ON CONFLICT(id) DO UPDATE SET ${keys.map(k=>k+"=excluded."+k).join(",")||"id=id"}`).run(rid,...vals)}
     catch(e){status.skipped=(status.skipped||0)+1;continue}
    }
    setMap(table,rid,it.id,it.version);n++
   }
   setState("applying","0");
   fixSequences();
   d.exec("COMMIT")
  }catch(e){try{setState("applying","0")}catch{}d.exec("ROLLBACK");throw e}
  return n
 }
 async function pullNow(){
  let changed=0;
  for(const {table,coll} of TABLES){
   const since=getState("since_"+coll);
   const filter=since?`&filter=${encodeURIComponent(`updated>="${since}"`)}`:"";
   let last=since,need=[];
   for(let page=1;page<500;page++){
    const r=await account.api(`/api/collections/${coll}/records?perPage=500&page=${page}&sort=updated,id&fields=id,rid,version,updated${filter}`);
    for(const it of r?.items||[]){
     const m=mapOf(table,Number(it.rid));
     if(!(m&&m.sid===it.id&&Number(m.version)>=Number(it.version)))need.push(it.id);
     if(it.updated>last)last=it.updated
    }
    if(!r||page>=r.totalPages)break
   }
   for(let i=0;i<need.length;i+=40){
    const ids=need.slice(i,i+40),f=ids.map(id=>`id='${id}'`).join("||");
    const r=await account.api(`/api/collections/${coll}/records?perPage=40&filter=${encodeURIComponent(f)}`);
    const items=(r?.items||[]).sort((a,b)=>Number(a.rid)-Number(b.rid));
    changed+=applyRows(table,items)
   }
   if(last&&last!==since)setState("since_"+coll,last)
  }
  if(changed)status.changedAt=now();
  return changed
 }

 // ---- the loop ----
 // one exchange at a time: a timer and a button must not send the same row twice
 let chain=Promise.resolve();
 const serial=fn=>{const p=chain.then(fn,fn);chain=p.catch(()=>{});return p};
 const push=()=>serial(pushNow),pull=()=>serial(pullNow);
 let running=false,again=false,lastPull=0,timer=null;
 async function cycle({force=false}={}){
  if(running){again=true;return}
  if(!enabled())return;
  if(!account.info().signedIn){status.state="signed-out";return}
  running=true;
  try{
   await push();
   if(force||now()-lastPull>15e3||again){await pull();lastPull=now()}
   status.state="idle";status.error="";status.lastAt=new Date(now()).toISOString()
  }catch(e){status.state=e.status?"error":"offline";status.error=String(e.message||e)}
  finally{running=false;if(again){again=false;setTimeout(()=>void cycle(),500)}}
 }
 function kick(){setTimeout(()=>void cycle(),50)}
 if(timers){timer=setInterval(()=>void cycle(),5e3);timer.unref?.();setTimeout(()=>void cycle(),8e3).unref?.()}
 function close(){if(timer)clearInterval(timer);try{db?.close()}catch{}db=null}
 return{info,enable,disable,uploadAll,cycle,push,pull,close,LOCAL_ONLY}
}
module.exports={createServerSync,LOCAL_ONLY,RANGE,triggersSql};
