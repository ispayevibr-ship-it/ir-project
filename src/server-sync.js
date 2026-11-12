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

// ---- the photos (просьба инженера 10.11.2026: завершённые объекты и их фото видны другому пользователю после входа) ----
// A row keeps the place of its picture on its own computer (C:\Users\…\ir-project\images\reports\….jpg). The file
// goes to the server collection «files» by its place inside the program's folder («images/reports/….jpg»); a row
// that comes from another computer gets the place of the same file here, and the file is taken from the server.
const IMAGE_RE=/[\\/]images[\\/]((?:[A-Za-z0-9_-]+[\\/])?[A-Za-z0-9_.-]+\.(?:jpe?g|png|webp))$/i;
function relOf(value){const m=typeof value==="string"&&value.length<1000?IMAGE_RE.exec(value):null;if(!m||m[1].includes(".."))return"";return"images/"+m[1].replace(/\\/g,"/")}
function imagesIn(json){
 const out=new Set();let data;try{data=JSON.parse(json||"{}")}catch{return out}
 const walk=v=>{if(typeof v==="string"){const r=relOf(v);if(r)out.add(r)}else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==="object")Object.values(v).forEach(walk)};
 walk(data);return out
}
// the same text with every picture place of another computer turned into the place here
function localizeJson(json,base){
 if(!base||typeof json!=="string"||!/images/i.test(json))return json;
 let data;try{data=JSON.parse(json)}catch{return json}
 let changed=false;
 const walk=v=>{if(typeof v==="string"){const r=relOf(v);if(r){const here=path.join(base,...r.split("/"));if(here!==v){changed=true;return here}}return v}if(Array.isArray(v))return v.map(walk);if(v&&typeof v==="object"){for(const k of Object.keys(v))v[k]=walk(v[k]);return v}return v};
 data=walk(data);return changed?JSON.stringify(data):json
}
const fileRid=rel=>parseInt(require("node:crypto").createHash("sha1").update(rel).digest("hex").slice(0,12),16);
const FILES_PER_CYCLE=12;

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
CREATE TABLE IF NOT EXISTS sync_map(tbl TEXT NOT NULL,rid INTEGER NOT NULL,sid TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(tbl,rid));
CREATE TABLE IF NOT EXISTS sync_files(rel TEXT PRIMARY KEY,state TEXT NOT NULL,object_rid INTEGER,section_key TEXT,tries INTEGER NOT NULL DEFAULT 0,at TEXT DEFAULT CURRENT_TIMESTAMP);`;

function createServerSync({dbFile,account,getUserDataPath,DatabaseSync=require("node:sqlite").DatabaseSync,timers=true,now=()=>Date.now(),onCompany=null}){
 let db=null;
 const open=()=>{if(!db){db=new DatabaseSync(dbFile());db.exec("PRAGMA busy_timeout=8000");db.exec("PRAGMA foreign_keys=OFF");db.exec(SCHEMA)}return db};
 const getState=k=>{try{return open().prepare("SELECT v FROM sync_state WHERE k=?").get(k)?.v??""}catch{return""}};
 const setState=(k,v)=>open().prepare("INSERT INTO sync_state(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(k,String(v));
 const status={state:"off",error:"",lastAt:"",changedAt:0,progress:null,rejected:0,rejectedWhy:""};
 const columns={};
 const colsOf=t=>columns[t]||(columns[t]=open().prepare(`PRAGMA table_info(${t})`).all().map(c=>c.name));
 const enabled=()=>getState("enabled")==="1";
 const userBase=()=>{try{return getUserDataPath?getUserDataPath():""}catch{return""}};
 const fileState=rel=>open().prepare("SELECT state,tries FROM sync_files WHERE rel=?").get(rel);
 const setFile=(rel,state,objectRid,sectionKey)=>open().prepare("INSERT INTO sync_files(rel,state,object_rid,section_key) VALUES(?,?,?,?) ON CONFLICT(rel) DO UPDATE SET state=excluded.state,object_rid=COALESCE(excluded.object_rid,sync_files.object_rid),section_key=COALESCE(excluded.section_key,sync_files.section_key),at=CURRENT_TIMESTAMP").run(rel,state,objectRid??null,sectionKey??null);
 // a sent row: its pictures that the server has not got yet are put in the queue
 function queueUploads(row){
  if(!row||!userBase()||typeof account.upload!=="function")return;
  for(const rel of imagesIn(row.data_json)){
   const st=fileState(rel)?.state;
   if(st==="up"||st==="down")continue;
   if(fs.existsSync(path.join(userBase(),...rel.split("/"))))setFile(rel,"send",Number(row.object_id),row.section_key)
  }
 }
 async function findFile(rel){const f=await account.api(`/api/collections/files/records?perPage=1&fields=id,file,path&filter=${encodeURIComponent(`path="${rel}"`)}`);return f?.items?.[0]||null}
 async function sendFiles(){
  if(!userBase()||typeof account.upload!=="function")return 0;
  const list=open().prepare("SELECT rel,object_rid,section_key FROM sync_files WHERE state='send' ORDER BY at LIMIT ?").all(FILES_PER_CYCLE);
  let n=0;
  for(const f of list){
   const file=path.join(userBase(),...f.rel.split("/"));
   if(!fs.existsSync(file)){open().prepare("DELETE FROM sync_files WHERE rel=?").run(f.rel);continue}
   try{
    if(!await findFile(f.rel)){
     try{await account.upload("files",{rid:fileRid(f.rel),path:f.rel,object_rid:Number(f.object_rid)||0,section_key:f.section_key||"",device:Number(getState("range"))||0},path.basename(file),fs.readFileSync(file))}
     catch(e){if(!(e.status===400&&e.data?.data?.rid))throw e}
    }
    setFile(f.rel,"up");n++
   }catch(e){
    if(!e.status||e.status>=500||e.status===401||e.status===429)throw e;
    open().prepare("UPDATE sync_files SET state='refused',tries=tries+1 WHERE rel=?").run(f.rel);status.filesRefused=(status.filesRefused||0)+1
   }
  }
  return n
 }
 // pictures of rows that came from other computers and are not here yet
 async function takeFiles(){
  if(!userBase()||typeof account.download!=="function")return 0;
  const list=open().prepare("SELECT rel FROM sync_files WHERE state='need' AND tries<20 ORDER BY tries,at LIMIT ?").all(FILES_PER_CYCLE);
  let n=0;
  for(const {rel} of list){
   const file=path.join(userBase(),...rel.split("/"));
   if(fs.existsSync(file)){setFile(rel,"down");continue}
   try{
    const it=await findFile(rel);
    if(!it?.file){open().prepare("UPDATE sync_files SET tries=tries+1 WHERE rel=?").run(rel);continue}
    const buf=await account.download("files",it.id,it.file);
    fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+".part";fs.writeFileSync(tmp,buf);fs.renameSync(tmp,file);
    setFile(rel,"down");n++
   }catch(e){
    if(!e.status||e.status>=500||e.status===401||e.status===429)throw e;
    open().prepare("UPDATE sync_files SET tries=tries+1 WHERE rel=?").run(rel)
   }
  }
  if(n)status.changedAt=now();
  return n
 }
 // once: the pictures of the rows that went to the server before the photos were sent (all records of this database)
 function queueOldFiles(){
  if(getState("files_backfill")==="1"||!userBase()||typeof account.upload!=="function")return;
  const ph=[...LOCAL_ONLY].map(()=>"?").join(",");
  const rows=open().prepare(`SELECT object_id,section_key,data_json FROM object_records WHERE section_key NOT IN (${ph}) AND data_json LIKE '%images%'`).all(...LOCAL_ONLY);
  for(const r of rows)queueUploads(r);
  setState("files_backfill","1")
 }
 const filesPending=()=>{try{return open().prepare("SELECT SUM(state='send') up,SUM(state='need' AND tries<20) down FROM sync_files").get()}catch{return{up:0,down:0}}};

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
  const fp=on?filesPending():{up:0,down:0};
  return{enabled:on,range:Number(getState("range"))||0,uploaded:getState("uploaded"),pending:on?pending():0,filesUp:Number(fp?.up)||0,filesDown:Number(fp?.down)||0,...status,
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
  const patch=id=>account.api(`/api/collections/${t.coll}/records/${id}`,{method:"PATCH",body});
  let r;
  if(sid)r=await patch(sid);
  else{
   try{r=await account.api(`/api/collections/${t.coll}/records`,{method:"POST",body:{rid:Number(rid),...body}})}
   catch(e){
    // the row is already there (an earlier sending reached the server, the answer did not come back) — change it instead
    if(e.status!==400||!e.data?.data?.rid)throw e;
    const f=await account.api(`/api/collections/${t.coll}/records?perPage=1&fields=id,version&filter=${encodeURIComponent("rid="+Number(rid))}`);
    const id=f?.items?.[0]?.id;if(!id)throw e;r=await patch(id)
   }
  }
  setMap(tbl,rid,r.id,r.version);
  if(local&&tbl==="object_records")try{queueUploads(local)}catch{}
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
     // all six finish before the next step (a failed one must not leave the others running into the next cycle,
     // which would send the same rows again — 3 «rid not unique» at the first sending, 09.11.2026)
     const done=await Promise.allSettled(g.slice(i,i+6).map(async b=>{
      let res;
      try{res=await sendOne(b)}
      catch(e){if(!e.status||e.status>=500||e.status===401||e.status===429)throw e;res="refused";status.rejected++;status.rejectedWhy=e.data?.data?.rid?"Строка с таким номером уже есть на сервере":"Нет прав на этот объект или раздел — изменение осталось только на этом компьютере"}
      d.prepare("DELETE FROM sync_outbox WHERE tbl=? AND rid=? AND seq<=?").run(b.tbl,b.rid,b.seq);
      if(status.progress)status.progress.done++;
      return res
     }));
     const failed=done.find(x=>x.status==="rejected");if(failed)throw failed.reason
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
     if(table==="object_records"&&typeof row.data_json==="string"&&userBase()){
      for(const rel of imagesIn(row.data_json)){const st=fileState(rel)?.state;if(st!=="up"&&st!=="down"&&!fs.existsSync(path.join(userBase(),...rel.split("/"))))setFile(rel,"need",Number(row.object_id),row.section_key)}
      row.data_json=localizeJson(row.data_json,userBase())
     }
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
 // Доступ, выданный позже (просьба инженера 12.11.2026 «инженеру дал доступ в завершённые ранее объекты, а у него
 // они не подгрузились»): забираются только строки, изменённые после прошлого обмена, а строки старого объекта не
 // меняются от того, что человеку открыли доступ. Поэтому набор своих строк доступа (`access`: объект и раздел)
 // сверяется при каждом обмене; изменился — обмен идёт с начала: сервер отдаёт все видимые строки, а забираются
 // только те, которых здесь нет или они старее (по номеру версии).
 async function accessChanged(){
  const u=account.info().user;if(!u||u.role==="admin")return null;
  const rows=await account.list("access",`filter=${encodeURIComponent(`user='${u.id}'`)}`);
  const sig=u.id+":"+rows.map(a=>a.object_rid+"|"+(a.section_key||"")).sort().join(",");
  return sig!==getState("access_sig")?sig:null
 }
 async function pullNow(){
  let changed=0;
  let sig=null;try{sig=await accessChanged()}catch{}
  if(sig)for(const {coll} of TABLES)setState("since_"+coll,"");
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
  if(sig)setState("access_sig",sig);
  if(changed)status.changedAt=now();
  return changed
 }

 // ---- the company card: name and logo (the engineer, 12.11.2026 «логотип фирмы не переносится когда другой пользователь
 // заходит под своим логином») ----
 // The card lives in company-profile.json of the computer (src/company-store.js), the logo — a picture in images/. The
 // administrator's card goes to the server collection «meta» (key "company_profile", the logo inline as data:…;
 // everyone signed in reads it, only the administrator writes — pb_migrations/1762690000_ir_access.js); every other
 // computer takes it into its own company-profile.json and the windows paint it at once (onCompany).
 // The last card sent or taken is remembered by its sum: a card changed here goes up (administrator), a newer one on
 // the server comes down; a computer that has not exchanged yet takes the server's card first, so a second computer
 // of the administrator with an old card does not send it over the real one.
 const COMPANY_KEY="company_profile",COMPANY_RID=1;
 const LOGO_RE=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
 const companyFile=()=>path.join(userBase(),"company-profile.json");
 const sumOf=c=>require("node:crypto").createHash("sha1").update(String(c.name||"")+"\n"+String(c.logo||"")).digest("hex");
 function localCompany(){
  let p={};try{p=JSON.parse(fs.readFileSync(companyFile(),"utf8"))||{}}catch{}
  let logo="";
  try{const f=String(p.logo||"");if(f&&fs.existsSync(f)){const ext=path.extname(f).toLowerCase();logo="data:"+(ext===".png"?"image/png":ext===".webp"?"image/webp":"image/jpeg")+";base64,"+fs.readFileSync(f).toString("base64")}}catch{}
  return{name:String(p.name||"").trim(),logo,file:String(p.logo||"")}
 }
 function takeCompany(row,here){
  const name=String(row.name||"").trim().slice(0,300),logo=LOGO_RE.test(String(row.logo||""))&&String(row.logo).length<8e6?String(row.logo):"";
  let file="";
  if(logo){
   const m=/^data:image\/(png|jpeg|webp)/.exec(logo),ext=m[1]==="jpeg"?".jpg":"."+m[1];
   const dir=path.join(userBase(),"images");fs.mkdirSync(dir,{recursive:true});
   file=path.join(dir,"company-logo-"+sumOf({logo}).slice(0,12)+ext);
   if(!fs.existsSync(file)){const tmp=file+".part";fs.writeFileSync(tmp,Buffer.from(logo.slice(logo.indexOf(",")+1),"base64"));fs.renameSync(tmp,file)}
  }
  const tmp=companyFile()+".part";fs.writeFileSync(tmp,JSON.stringify({name,logo:file},null,2),"utf8");fs.renameSync(tmp,companyFile());
  // the earlier logo taken from the server is not needed any more (a logo chosen here by hand is left alone)
  if(here.file&&here.file!==file&&/^company-logo-[0-9a-f]{12}\.(png|jpg|webp)$/.test(path.basename(here.file))){try{fs.rmSync(here.file,{force:true})}catch{}}
  status.companyAt=new Date(now()).toISOString();
  try{onCompany?.({name,logo:file})}catch{}
 }
 async function companyExchange(){
  if(!userBase()||!account.info().signedIn)return"";
  const r=await account.api(`/api/collections/meta/records?perPage=1&filter=${encodeURIComponent(`key="${COMPANY_KEY}"`)}`);
  const it=r?.items?.[0]||null,srv=it&&it.row&&typeof it.row==="object"&&!it.deleted?it.row:null;
  const last=getState("company_sum"),here=localCompany(),hereSum=sumOf(here);
  const admin=account.info().user?.role==="admin";
  if(admin&&hereSum!==last&&(last||!srv)&&(here.name||here.logo)){
   const row={name:here.name,logo:here.logo};
   if(it)await account.api(`/api/collections/meta/records/${it.id}`,{method:"PATCH",body:{row,deleted:false}});
   else await account.api("/api/collections/meta/records",{method:"POST",body:{rid:COMPANY_RID,key:COMPANY_KEY,row,device:Number(getState("range"))||0}});
   setState("company_sum",hereSum);return"sent"
  }
  if(srv){
   const srvSum=sumOf({name:String(srv.name||"").trim(),logo:String(srv.logo||"")});
   if(srvSum!==last){if(srvSum!==hereSum)takeCompany(srv,here);setState("company_sum",srvSum);return srvSum!==hereSum?"taken":""}
  }
  return""
 }
 let lastCompany=0;
 function companyTick(force){
  if(!force&&now()-lastCompany<60e3)return;
  lastCompany=now();
  serial(companyExchange).catch(e=>{status.companyError=String(e?.message||e)})
 }

 // ---- the loop ----
 // one exchange at a time: a timer and a button must not send the same row twice
 let chain=Promise.resolve();
 const serial=fn=>{const p=chain.then(fn,fn);chain=p.catch(()=>{});return p};
 const push=()=>serial(pushNow),pull=()=>serial(pullNow);
 let running=false,again=false,lastPull=0,timer=null;
 async function cycle({force=false}={}){
  if(running){again=true;return}
  // (the company card goes and comes for everyone signed in, even with the exchange of the base turned off)
  try{if(account.info().signedIn)companyTick(force)}catch{}
  if(!enabled())return;
  if(!account.info().signedIn){status.state="signed-out";return}
  running=true;
  try{
   await push();
   if(force||now()-lastPull>15e3||again){await pull();lastPull=now()}
   await serial(async()=>{queueOldFiles();await sendFiles();await takeFiles()});
   status.state="idle";status.error="";status.lastAt=new Date(now()).toISOString()
  }catch(e){status.state=e.status?"error":"offline";status.error=String(e.message||e)}
  finally{running=false;if(again){again=false;setTimeout(()=>void cycle(),500)}}
 }
 function kick(){setTimeout(()=>void cycle(),50)}
 if(timers){timer=setInterval(()=>void cycle(),5e3);timer.unref?.();setTimeout(()=>void cycle(),8e3).unref?.()}
 function close(){if(timer)clearInterval(timer);try{db?.close()}catch{}db=null}
 return{info,enable,disable,uploadAll,cycle,push,pull,close,companyExchange:()=>serial(companyExchange),LOCAL_ONLY}
}
module.exports={createServerSync,LOCAL_ONLY,RANGE,triggersSql,relOf,imagesIn,localizeJson};
