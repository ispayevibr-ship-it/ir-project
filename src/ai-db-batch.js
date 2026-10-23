"use strict";
/*
 * IR Project AI: many records written at once in one transaction. database.js commits every record by itself, and a
 * placement of 4000 elements into a database of hundreds of megabytes waited for the disk 8000 times — the program
 * stood for a minute. Here the same rows (the same table and columns as database.js) are written on a second
 * connection to the same file inside BEGIN … COMMIT: all of them or, on an error, none (ROLLBACK).
 * Without the file (tests, another storage) the writes go to `database` one by one, as before.
 */
const path=require("node:path"),fs=require("node:fs");
function createBatch({getUserDataPath,database}){
 const file=()=>{try{const f=path.join(getUserDataPath(),"ir-project.db");return fs.existsSync(f)?f:""}catch{return""}};
 return function writes(fn){
  const f=file();let Sync=null;
  if(f)try{Sync=require("node:sqlite").DatabaseSync}catch{Sync=null}
  if(!Sync)return fn(database);
  const db=new Sync(f);
  try{
   db.exec("PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000");
   const parse=r=>{if(!r)return null;const out={...r};try{out.data=JSON.parse(r.data_json||"{}")}catch{out.data={}}delete out.data_json;return out};
   const object=id=>{if(!db.prepare("SELECT id FROM objects WHERE id=?").get(id))throw Error("Object not found")};
   const get=(oid,section,id)=>parse(db.prepare("SELECT * FROM object_records WHERE object_id=? AND section_key=? AND id=?").get(oid,section,id));
   const facade={
    getObject:id=>database.getObject(id),
    listEntity:(oid,section)=>{object(oid);return db.prepare("SELECT * FROM object_records WHERE object_id=? AND section_key=? ORDER BY id DESC").all(oid,section).map(parse)},
    getEntity:(oid,section,id)=>{object(oid);return get(oid,section,id)},
    createEntity:(oid,section,payload={})=>{object(oid);
     const r=db.prepare("INSERT INTO object_records(object_id,section_key,record_type,parent_id,title,data_json) VALUES(?,?,?,?,?,?)").run(oid,section,payload.record_type||"item",payload.parent_id||null,payload.title||"",JSON.stringify(payload.data||payload));
     return get(oid,section,Number(r.lastInsertRowid))},
    updateEntity:(oid,section,id,payload={})=>{
     if(!get(oid,section,id))return null;
     db.prepare("UPDATE object_records SET record_type=?,parent_id=?,title=?,data_json=?,updated_at=CURRENT_TIMESTAMP WHERE object_id=? AND section_key=? AND id=?").run(payload.record_type||"item",payload.parent_id||null,payload.title||"",JSON.stringify(payload.data||payload),oid,section,id);
     return get(oid,section,id)},
    deleteEntity:(oid,section,id)=>{object(oid);return db.prepare("DELETE FROM object_records WHERE object_id=? AND section_key=? AND id=?").run(oid,section,id).changes>0}
   };
   db.exec("BEGIN IMMEDIATE");
   try{const out=fn(facade);db.exec("COMMIT");return out}
   catch(error){try{db.exec("ROLLBACK")}catch{}throw error}
  }finally{db.close()}
 }
}
module.exports={createBatch};
