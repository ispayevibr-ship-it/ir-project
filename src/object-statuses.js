"use strict";
/*
 * Статус объекта «Подготовка» (просьба инженера 10.11.2026). В базе установленной программы у objects.status проверка
 * IN('В работе','Завершен') (src/database.js не обновляется горячо) — к ней добавляется третье значение правкой текста
 * таблицы (PRAGMA writable_schema: ослабление CHECK без перестройки таблицы, данные и триггеры синхронизации на месте).
 */
const OBJECT_STATUSES=["Подготовка","В работе","Завершен"];
function ensure(file){
 let db=null;
 try{
  const {DatabaseSync}=require("node:sqlite");db=new DatabaseSync(file);
  const row=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='objects'").get();const sql=String(row?.sql||"");
  if(/CHECK\s*\(\s*status\s+IN\s*\([^)]*'Подготовка'/i.test(sql)||!/CHECK\s*\(\s*status\s+IN\s*\(/i.test(sql))return{statuses:OBJECT_STATUSES};
  const next=sql.replace(/(CHECK\s*\(\s*status\s+IN\s*\()([^)]*)\)/i,(m,a,b)=>a+b.trim()+",'Подготовка')");
  db.exec("BEGIN IMMEDIATE");
  try{
   db.exec("PRAGMA writable_schema=ON");
   db.prepare("UPDATE sqlite_master SET sql=? WHERE type='table' AND name='objects'").run(next);
   const v=Number(db.prepare("PRAGMA schema_version").get().schema_version)||0;db.exec("PRAGMA schema_version="+(v+1));
   db.exec("PRAGMA writable_schema=OFF");db.exec("COMMIT")
  }catch(e){try{db.exec("ROLLBACK")}catch{}throw e}
  // проверка без прохода по всей базе (~700 МБ): таблица читается заново с новым текстом
  db.prepare("SELECT id,status FROM objects LIMIT 1").get();
  const ok=/'Подготовка'/.test(String(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='objects'").get()?.sql||""));
  return ok?{statuses:OBJECT_STATUSES,migrated:true}:{statuses:OBJECT_STATUSES.slice(1),error:"schema"}
 }catch(e){return{statuses:OBJECT_STATUSES.slice(1),error:String(e?.message||e)}}
 finally{try{db?.close()}catch{}}
}
module.exports={ensure,OBJECT_STATUSES};
