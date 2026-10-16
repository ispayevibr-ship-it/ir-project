"use strict";
/* IR Project AI: secure dynamic loader for destructive PDF operations.
 * Safe if a hot update was installed after Electron started. Never substitute
 * an old document module silently: fail closed if provenance can't be checked.
 */
const path=require("node:path");
const REL="src/ai-document-store.js",POLICY="pdf-draft-guard-diagnostics-v1";
function createGuard({updates,appRoot,getUserDataPath,database,dialog,shell,getWindow}={}){
 if(!updates?.resolveFile||!updates?.installedVersion||!appRoot||!database)
  throw Error("Не настроена безопасная загрузка удаления PDF");
 let loaded=null;
 const bundled=path.join(appRoot,REL);
 function store(){
  const resolved=updates.resolveFile(REL),version=updates.installedVersion();
  if(loaded&&loaded.resolved===resolved&&loaded.version===version)return loaded;
  let factory;
  try{
   // A new package replaces the same pathname; Node's require cache must not
   // retain the former build. resolveFile verifies manifest SHA before this.
   const location=require.resolve(resolved);
   if(loaded&&loaded.resolved===resolved&&loaded.version!==version)
    delete require.cache[location];
   factory=require(location)
  }catch(error){
   throw Error("Не удалось загрузить модуль удаления PDF ("+
    (resolved===bundled?"установщик":"hot-пакет")+"): "+String(error.message||error))
  }
  if(factory?.POLICY_REVISION!==POLICY||typeof factory.createStore!=="function")
   throw Error("Модуль удаления PDF не соответствует политике безопасности "+
    POLICY+". Установите актуальную Windows Beta; удаление не выполнялось.");
  const instance=factory.createStore({getUserDataPath,database,dialog,shell,getWindow});
  if(typeof instance.removalImpact!=="function"||typeof instance.remove!=="function")
   throw Error("Модуль удаления PDF не поддерживает безопасные операции");
  loaded={resolved,version,source:resolved===bundled?"installer":"hot",instance};
  return loaded
 }
 return{
  removalImpact(objectId,documentId){
   const loaded=store(),impact=loaded.instance.removalImpact(objectId,documentId);
   if(impact.policyRevision!==POLICY)
    throw Error("Версия политики удаления изменилась. Операция заблокирована.");
   return{...impact,moduleSource:loaded.source,installedVersion:loaded.version}
  },
  remove(objectId,documentId,options){
   // Preview again under current module, then defer dependency rechecking and
   // rollback to the document store's SQLite transaction.
   const ready=store(),impact=ready.instance.removalImpact(objectId,documentId);
   if(impact.policyRevision!==POLICY)
    throw Error("Небезопасная версия политики удаления PDF");
   return ready.instance.remove(objectId,documentId,options)
  }
 }
}
module.exports={createGuard,POLICY};
