"use strict";
/* All-or-nothing reset of erection placements. No report, mark, grid, view,
 * document or engineering review record is altered. */
const crypto=require("node:crypto");
function createReset({database}={}){
 if(!database||typeof database.transaction!=="function")
  throw Error("Очистка монтажной схемы требует транзакционной SQLite");
 const object=id=>{
  const n=Number(id);if(!Number.isSafeInteger(n)||n<1||!database.getObject(n))
   throw Error("Объект монтажной схемы не найден");
  return n
 };
 const isPlacement=r=>r.record_type==="scheme_column"||r.data?.entity_type==="column";
 function snapshot(objectId){
  const id=object(objectId),rows=database.listEntity(id,"scheme").filter(isPlacement);
  const ids=rows.map(r=>Number(r.id)).sort((a,b)=>a-b);
  if(ids.some(n=>!Number.isSafeInteger(n)))throw Error("Неверный ID конструкции");
  const fingerprint=crypto.createHash("sha256").update(JSON.stringify(ids)).digest("hex");
  return{objectId:id,count:ids.length,fingerprint};
 }
 function clear(objectId,{expectedCount,expectedFingerprint,confirmation}={}){
  if(confirmation!=="ОЧИСТИТЬ")throw Error("Для очистки схемы введите ОЧИСТИТЬ");
  if(!Number.isSafeInteger(expectedCount)||typeof expectedFingerprint!=="string"||
     !/^[0-9a-f]{64}$/.test(expectedFingerprint))
   throw Error("Необходимо сначала проверить состав монтажной схемы");
  return database.transaction(()=>{
   const before=snapshot(objectId);
   if(before.count!==expectedCount||before.fingerprint!==expectedFingerprint)
    throw Error("Размещения изменились. Обновите окно очистки и подтвердите заново");
   const ids=database.listEntity(before.objectId,"scheme")
    .filter(isPlacement).map(r=>Number(r.id)).sort((a,b)=>a-b);
   for(const id of ids)
    if(!database.deleteEntity(before.objectId,"scheme",id))
     throw Error("Не удалось удалить элемент монтажной схемы № "+id);
   if(snapshot(before.objectId).count!==0)
    throw Error("Схема не очищена полностью; транзакция будет отменена");
   return{cleared:ids.length,objectId:before.objectId,preserved:[
    "scheme_grid","scheme_view","marks","reports","deliveries","ai-analysis","ai-review-history"
   ]}
  })
 }
 return{snapshot,clear}
}
module.exports={createReset};
