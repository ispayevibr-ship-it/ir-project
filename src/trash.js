"use strict";
/*
 * IR Project: корзина удалённого (просьба инженера 03.11.2026: «журнал удаления элементов и храни за последнюю неделю,
 * чтобы можно было восстановить, прямо в монтажной схеме, а также в самой программе — в каждом объекте свой»).
 *
 * Всё, что удаляется в объекте (элемент схемы, марка, отчёт, поставка, письмо, сетка, очистка схемы, отмена расстановки,
 * загруженный чертёж) и сам объект целиком, сначала копируется в таблицы trash_* той же базы, а потом удаляется — в
 * одной транзакции, на отдельном соединении с файлом базы (как src/ai-db-batch.js). Запись корзины — «пачка»: одно
 * действие инженера (несколько удалений одного раздела подряд в течение нескольких секунд — одна пачка, например
 * «Удалить все Б1»). Пачка хранится 7 дней, потом стирается сама вместе со своими файлами.
 * Восстановление возвращает строки с их прежними номерами (на них ссылаются схема, отчёты, журнал), файлы — на место.
 * Файлы фото и актов, которые окно удаляет вместе с записью, не стираются сразу: стираются через те же 7 дней, чтобы
 * восстановленный отчёт был с фото.
 */
const path=require("node:path"),fs=require("node:fs");
const KEEP_DAYS=7,KEEP_MS=KEEP_DAYS*864e5,GROUP_MS=4000;
const RECORD_COLS="id,object_id,section_key,record_type,parent_id,title,data_json,created_at,updated_at";
// Служебные разделы: их записи программа удаляет сама (копии очистки схемы, журналы) — в корзину не идут.
const SKIP_SECTIONS=new Set(["scheme-snapshots","trash"]);
const SECTION_NAMES={scheme:"Монтажная схема",marks:"Ведомость марок",fasteners:"Ведомость метизов",reports:"Ежедневные отчёты",
 "extra-works":"Доп. работы","work-types":"Виды работ",deliveries:"Поставки",schedule:"График работ",photos:"Фотографии объекта",
 "acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы",letters:"Исходящие письма","executive-docs":"Исполнительная документация",
 "ai-documents":"Чертежи (ИИ-распознавание)"};
const sectionName=k=>SECTION_NAMES[k]||k;
// Короткое имя записи для списка корзины: марка элемента, номер отчёта, заголовок.
function label(row){
 let d={};try{d=JSON.parse(row.data_json||"{}")||{}}catch{d={}}
 if(row.record_type==="scheme_grid")return"Сетка «"+(d.name||row.title||"")+"»";
 const v=d.mark||d.number||d.name||d.title||d.text||d.original_name||row.title||d.date||"";
 const s=String(v).replace(/\s+/g," ").trim().slice(0,80);
 return s||("запись "+row.id)
}
function createTrash({getUserDataPath,now=()=>Date.now()}){
 const dbFile=()=>path.join(getUserDataPath(),"ir-project.db");
 const filesRoot=()=>path.join(getUserDataPath(),"ir-project-trash");
 const insideUserData=file=>{try{const base=path.resolve(getUserDataPath())+path.sep,f=path.resolve(String(file||""));return f.startsWith(base)?f:""}catch{return""}};
 let ready=false;
 // Соединение на одно действие: восстановление копии базы («Резервная копия → Восстановить») подменяет файл, и
 // открытое надолго соединение держало бы старый.
 function open(){
  const {DatabaseSync}=require("node:sqlite");
  const db=new DatabaseSync(dbFile());
  db.exec("PRAGMA foreign_keys=ON;PRAGMA busy_timeout=8000");
  if(!ready){
   db.exec(`CREATE TABLE IF NOT EXISTS trash_batches(id INTEGER PRIMARY KEY AUTOINCREMENT,object_id INTEGER NOT NULL,object_name TEXT NOT NULL DEFAULT '',kind TEXT NOT NULL,section_key TEXT NOT NULL DEFAULT '',title TEXT NOT NULL DEFAULT '',count INTEGER NOT NULL DEFAULT 0,deleted_at TEXT NOT NULL,info_json TEXT NOT NULL DEFAULT '{}');
    CREATE INDEX IF NOT EXISTS idx_trash_batches_object ON trash_batches(object_id,deleted_at);
    CREATE TABLE IF NOT EXISTS trash_records(batch_id INTEGER NOT NULL,id INTEGER NOT NULL,object_id INTEGER NOT NULL,section_key TEXT NOT NULL,record_type TEXT NOT NULL,parent_id INTEGER,title TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT,updated_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_trash_records_batch ON trash_records(batch_id);
    CREATE TABLE IF NOT EXISTS trash_rows(batch_id INTEGER NOT NULL,tbl TEXT NOT NULL,row_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS trash_files(id INTEGER PRIMARY KEY AUTOINCREMENT,batch_id INTEGER,original TEXT NOT NULL,stored TEXT NOT NULL DEFAULT '',removed_at TEXT NOT NULL);`);
   ready=true
  }
  return db
 }
 const run=fn=>{const db=open();try{return fn(db)}finally{try{db.close()}catch(_e){}}};
 const tx=(db,fn)=>{db.exec("BEGIN IMMEDIATE");try{const r=fn();db.exec("COMMIT");return r}catch(e){try{db.exec("ROLLBACK")}catch(_e){}throw e}};
 const iso=t=>new Date(t).toISOString();
 const objectName=(db,oid)=>String(db.prepare("SELECT name FROM objects WHERE id=?").get(oid)?.name||"");
 // Запись и все её вложенные (parent_id: база удаляет их каскадом вместе с ней).
 function withChildren(db,oid,section,ids){
  const out=new Set(),queue=ids.map(Number).filter(Number.isSafeInteger);
  const own=db.prepare("SELECT id FROM object_records WHERE object_id=? AND section_key=? AND id=?"),kids=db.prepare("SELECT id FROM object_records WHERE parent_id=?");
  for(const id of queue)if(own.get(oid,section,id))out.add(id);
  const stack=[...out];
  while(stack.length){const id=stack.pop();for(const k of kids.all(id))if(!out.has(k.id)){out.add(k.id);stack.push(k.id)}}
  return[...out]
 }
 // Пачка, к которой присоединяется удаление: тот же объект, тот же раздел и тот же вид, последняя — и моложе GROUP_MS.
 function batchFor(db,oid,section,kind,title,info){
  const t=now(),last=db.prepare("SELECT * FROM trash_batches WHERE object_id=? ORDER BY id DESC LIMIT 1").get(oid);
  if(last&&kind==="record"&&last.kind==="record"&&last.section_key===section){
   let inf={};try{inf=JSON.parse(last.info_json||"{}")}catch{inf={}}
   if(t-Number(inf.last_at||Date.parse(last.deleted_at))<GROUP_MS){
    db.prepare("UPDATE trash_batches SET info_json=? WHERE id=?").run(JSON.stringify({...inf,last_at:t}),last.id);
    return last.id}
  }
  const r=db.prepare("INSERT INTO trash_batches(object_id,object_name,kind,section_key,title,count,deleted_at,info_json) VALUES(?,?,?,?,?,0,?,?)")
   .run(oid,objectName(db,oid),kind,section,String(title||""),iso(t),JSON.stringify({...(info||{}),last_at:t}));
  return Number(r.lastInsertRowid)
 }
 function copyRecords(db,batch,ids){
  const ins=db.prepare(`INSERT INTO trash_records(batch_id,${RECORD_COLS}) SELECT ?,${RECORD_COLS} FROM object_records WHERE id=?`);
  let n=0;for(const id of ids)n+=Number(ins.run(batch,id).changes)||0;
  db.prepare("UPDATE trash_batches SET count=(SELECT COUNT(*) FROM trash_records WHERE batch_id=?) WHERE id=?").run(batch,batch);
  return n
 }
 // Копия в корзину и удаление — вместе. Возвращает true, если запись была (как database.deleteEntity).
 function deleteRecords(objectId,section,ids,{title="",kind="record",info=null}={}){
  const oid=Number(objectId);section=String(section||"");
  if(!Number.isSafeInteger(oid))throw Error("Неверный номер объекта");
  return run(db=>{
   if(!db.prepare("SELECT id FROM objects WHERE id=?").get(oid))throw Error("Object not found");
   const all=withChildren(db,oid,section,Array.isArray(ids)?ids:[ids]);
   if(!all.length)return{removed:0,batch:null};
   return tx(db,()=>{
    let batch=null;
    if(!SKIP_SECTIONS.has(section)){batch=batchFor(db,oid,section,kind,title,info);copyRecords(db,batch,all)}
    const del=db.prepare("DELETE FROM object_records WHERE object_id=? AND id=?");
    let removed=0;for(const id of Array.isArray(ids)?ids:[ids])removed+=Number(del.run(oid,Number(id)).changes)||0;
    // Вложенные ушли каскадом; оставшиеся (другого раздела) — тоже.
    for(const id of all)del.run(oid,id);
    return{removed,batch}
   })
  })
 }
 // Только копия (удалит вызывающий): очистка схемы и отмена расстановки удаляют сами, в своей транзакции.
 function capture(objectId,section,ids,{title="",kind="records",info=null}={}){
  const oid=Number(objectId);
  return run(db=>{
   const all=withChildren(db,oid,String(section),ids||[]);
   if(!all.length)return null;
   return tx(db,()=>{const batch=batchFor(db,oid,String(section),kind,title,info);copyRecords(db,batch,all);return batch})
  })
 }
 // Объект целиком: строка объекта, его разделы и записи, его чертежи (папка ИИ-распознавания) — в корзину.
 function deleteObject(objectId,{docsDir=""}={}){
  const oid=Number(objectId);
  const r=run(db=>{
   const obj=db.prepare("SELECT * FROM objects WHERE id=?").get(oid);
   if(!obj)return{ok:false};
   return tx(db,()=>{
    const ins=db.prepare("INSERT INTO trash_batches(object_id,object_name,kind,section_key,title,count,deleted_at,info_json) VALUES(?,?,?,?,?,0,?,?)")
     .run(oid,String(obj.name||""),"object","","Объект «"+String(obj.name||"")+"»",iso(now()),"{}");
    const batch=Number(ins.lastInsertRowid);
    db.prepare("INSERT INTO trash_rows(batch_id,tbl,row_json) VALUES(?,?,?)").run(batch,"objects",JSON.stringify(obj));
    for(const s of db.prepare("SELECT * FROM object_sections WHERE object_id=?").all(oid))db.prepare("INSERT INTO trash_rows(batch_id,tbl,row_json) VALUES(?,?,?)").run(batch,"object_sections",JSON.stringify(s));
    db.prepare(`INSERT INTO trash_records(batch_id,${RECORD_COLS}) SELECT ?,${RECORD_COLS} FROM object_records WHERE object_id=?`).run(batch,oid);
    db.prepare("UPDATE trash_batches SET count=(SELECT COUNT(*) FROM trash_records WHERE batch_id=?) WHERE id=?").run(batch,batch);
    db.prepare("DELETE FROM objects WHERE id=?").run(oid);
    return{ok:true,batch}
   })
  });
  if(r.ok&&docsDir&&fs.existsSync(docsDir))moveIn(r.batch,docsDir,"docs");
  return r.ok
 }
 // Файл (или папка) уезжает в папку корзины и возвращается при восстановлении.
 function moveIn(batch,file,name){
  const dir=path.join(filesRoot(),String(batch));fs.mkdirSync(dir,{recursive:true});
  const stored=path.join(dir,(name||path.basename(file))+"-"+Date.now().toString(36));
  try{fs.renameSync(file,stored)}catch(_e){fs.cpSync(file,stored,{recursive:true});fs.rmSync(file,{recursive:true,force:true})}
  run(db=>db.prepare("INSERT INTO trash_files(batch_id,original,stored,removed_at) VALUES(?,?,?,?)").run(batch,path.resolve(file),stored,iso(now())));
  return stored
 }
 function keepFile(batch,file){if(batch&&file&&fs.existsSync(file))return moveIn(batch,file);return""}
 // Фото и акты, которые окно стирает вместе с записью: стираются через 7 дней (только внутри папки программы).
 function deferFile(file){
  const f=insideUserData(file);if(!f)return false;
  run(db=>db.prepare("INSERT INTO trash_files(batch_id,original,stored,removed_at) VALUES(NULL,?,'',?)").run(f,iso(now())));
  return true
 }
 function parseInfo(b){try{return JSON.parse(b.info_json||"{}")||{}}catch{return{}}}
 function summary(db,b){
  const items=db.prepare("SELECT id,section_key,record_type,title,data_json FROM trash_records WHERE batch_id=? ORDER BY id LIMIT 30").all(b.id).map(r=>({id:r.id,section:r.section_key,name:label(r)}));
  const info=parseInfo(b);delete info.last_at;
  const t=Date.parse(b.deleted_at);
  return{id:b.id,objectId:b.object_id,objectName:b.object_name,kind:b.kind,section:b.section_key,sectionName:b.kind==="object"?"Объект":sectionName(b.section_key),
   title:b.title,count:b.count,deletedAt:b.deleted_at,expiresAt:iso(t+KEEP_MS),items,info}
 }
 function list({objectId=null,section="",kind=""}={}){
  purge();
  return run(db=>{
   const rows=objectId==null?db.prepare("SELECT * FROM trash_batches ORDER BY id DESC").all():db.prepare("SELECT * FROM trash_batches WHERE object_id=? ORDER BY id DESC").all(Number(objectId));
   return rows.filter(b=>(!section||b.section_key===section)&&(!kind||b.kind===kind)&&(objectId==null||b.kind!=="object")).map(b=>summary(db,b))
  })
 }
 function insertRow(db,tbl,row){
  const cols=new Set(db.prepare(`PRAGMA table_info(${tbl})`).all().map(c=>c.name)),keys=Object.keys(row).filter(k=>cols.has(k));
  db.prepare(`INSERT INTO ${tbl}(${keys.join(",")}) VALUES(${keys.map(()=>"?").join(",")})`).run(...keys.map(k=>row[k]))
 }
 // Восстановить пачку: строки с прежними номерами (занятый номер — новый), разделы и строка объекта, файлы на место.
 function restore(batchId){
  const id=Number(batchId);
  const out=run(db=>{
   const b=db.prepare("SELECT * FROM trash_batches WHERE id=?").get(id);
   if(!b)throw Error("Этой записи в корзине уже нет (восстановлена или прошло 7 дней)");
   return tx(db,()=>{
    db.exec("PRAGMA defer_foreign_keys=ON");
    if(b.kind==="object"){
     if(db.prepare("SELECT id FROM objects WHERE id=?").get(b.object_id))throw Error("Объект с этим номером уже есть");
     for(const r of db.prepare("SELECT row_json FROM trash_rows WHERE batch_id=? AND tbl='objects'").all(id))insertRow(db,"objects",JSON.parse(r.row_json));
     for(const r of db.prepare("SELECT row_json FROM trash_rows WHERE batch_id=? AND tbl='object_sections'").all(id)){const s=JSON.parse(r.row_json);delete s.id;insertRow(db,"object_sections",s)}
    }else if(!db.prepare("SELECT id FROM objects WHERE id=?").get(b.object_id))throw Error("Объект «"+b.object_name+"» удалён — сначала восстановите объект");
    const taken=db.prepare("SELECT id FROM object_records WHERE id=?"),rows=db.prepare(`SELECT ${RECORD_COLS} FROM trash_records WHERE batch_id=? ORDER BY id`).all(id);
    const map=new Map(),plain=db.prepare(`INSERT INTO object_records(${RECORD_COLS}) VALUES(?,?,?,?,?,?,?,?,?)`),fresh=db.prepare("INSERT INTO object_records(object_id,section_key,record_type,parent_id,title,data_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)");
    for(const r of rows){
     const parent=r.parent_id==null?null:(map.get(r.parent_id)??r.parent_id);
     if(!taken.get(r.id)){plain.run(r.id,r.object_id,r.section_key,r.record_type,parent,r.title,r.data_json,r.created_at,r.updated_at);map.set(r.id,r.id)}
     else map.set(r.id,Number(fresh.run(r.object_id,r.section_key,r.record_type,parent,r.title,r.data_json,r.created_at,r.updated_at).lastInsertRowid))
    }
    const files=db.prepare("SELECT * FROM trash_files WHERE batch_id=?").all(id);
    // Фото восстановленных записей больше не ждут стирания.
    for(const f of db.prepare("SELECT id,original FROM trash_files WHERE batch_id IS NULL").all()){
     const name=path.basename(String(f.original||""));if(name&&rows.some(r=>String(r.data_json).includes(name)))db.prepare("DELETE FROM trash_files WHERE id=?").run(f.id)}
    db.prepare("DELETE FROM trash_records WHERE batch_id=?").run(id);db.prepare("DELETE FROM trash_rows WHERE batch_id=?").run(id);
    db.prepare("DELETE FROM trash_files WHERE batch_id=?").run(id);db.prepare("DELETE FROM trash_batches WHERE id=?").run(id);
    return{batch:summaryLite(b),restored:rows.length,files,renumbered:[...map].filter(([a,c])=>a!==c).length}
   })
  });
  for(const f of out.files){
   try{if(f.stored&&fs.existsSync(f.stored)&&!fs.existsSync(f.original)){fs.mkdirSync(path.dirname(f.original),{recursive:true});fs.renameSync(f.stored,f.original)}}catch(e){console.warn("IR Project: trash file not restored",f.original,e.message)}
  }
  try{fs.rmSync(path.join(filesRoot(),String(id)),{recursive:true,force:true})}catch(_e){}
  delete out.files;
  return out
 }
 function setInfo(batchId,extra){
  run(db=>{const b=db.prepare("SELECT info_json FROM trash_batches WHERE id=?").get(Number(batchId));if(!b)return;
   let inf={};try{inf=JSON.parse(b.info_json||"{}")}catch{inf={}}
   db.prepare("UPDATE trash_batches SET info_json=? WHERE id=?").run(JSON.stringify({...inf,...extra}),Number(batchId))});
  return true
 }
 const summaryLite=b=>({id:b.id,objectId:b.object_id,objectName:b.object_name,kind:b.kind,section:b.section_key,title:b.title,count:b.count,info:parseInfo(b)});
 // Убрать пачку без восстановления (её содержимое вернули другим путём — кнопкой «Вернуть» очистки схемы).
 function drop(batchId){
  const id=Number(batchId);
  run(db=>tx(db,()=>{for(const t of["trash_records","trash_rows","trash_files"])db.prepare(`DELETE FROM ${t} WHERE batch_id=?`).run(id);db.prepare("DELETE FROM trash_batches WHERE id=?").run(id)}));
  try{fs.rmSync(path.join(filesRoot(),String(id)),{recursive:true,force:true})}catch(_e){}
  return true
 }
 // Старше 7 дней — стереть: пачки, их файлы, отложенные фото.
 let lastPurge=0;
 function purge({force=false}={}){
  const t=now();if(!force&&t-lastPurge<60e3)return 0;lastPurge=t;
  const edge=iso(t-KEEP_MS);
  const r=run(db=>{
   const old=db.prepare("SELECT id FROM trash_batches WHERE deleted_at<?").all(edge).map(x=>x.id);
   const files=db.prepare("SELECT * FROM trash_files WHERE removed_at<?").all(edge);
   if(!old.length&&!files.length)return{old,files};
   tx(db,()=>{for(const id of old){for(const tb of["trash_records","trash_rows","trash_files"])db.prepare(`DELETE FROM ${tb} WHERE batch_id=?`).run(id);db.prepare("DELETE FROM trash_batches WHERE id=?").run(id)}
    db.prepare("DELETE FROM trash_files WHERE removed_at<?").run(edge)});
   return{old,files}
  });
  for(const f of r.files)if(!f.batch_id){const p=insideUserData(f.original);if(p)try{fs.rmSync(p,{force:true})}catch(_e){}}
  for(const id of r.old)try{fs.rmSync(path.join(filesRoot(),String(id)),{recursive:true,force:true})}catch(_e){}
  return r.old.length
 }
 return{deleteRecords,capture,deleteObject,keepFile,deferFile,list,restore,drop,setInfo,purge,KEEP_DAYS}
}
module.exports={createTrash,KEEP_DAYS,label};
