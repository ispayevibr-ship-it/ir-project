"use strict";
/* IR Project AI: user-invoked, non-inference readiness check.
 * This does NOT execute a model or certify the quality of KMD recognition. */
function createPreflight({models,engine,ocr}={}){
 if(!models?.info||!models?.resolveRuntime||!engine?.status||!ocr?.status)
  throw Error("Для проверки готовности необходимы оба локальных ИИ-движка");
 async function check(){
  const results=[];
  const add=(id,title,ok,description)=>results.push({id,title,ok:ok===true,
   description:String(description||"").slice(0,500)});
  let info;
  try{info=models.info()}catch(error){
   info={signedImportAvailable:false};
   add("model_manager","Менеджер моделей",false,
    "Не удалось прочитать реестр локальных моделей: "+String(error.message||error));
  }
  add("publisher_key","Доверенный ключ моделей",info.signedImportAvailable===true,
   info.signedImportAvailable?
    "Доверенный ключ издателя настроен":
    "Официальный открытый ключ издателя ещё не встроен: подписанные пакеты нельзя установить");
  for(const [id,title] of [["qwen3-vl-4b","Qwen3-VL 4B"],["paddleocr-vl-1.6","PaddleOCR-VL 1.6"]]){
   try{
    const item=await models.resolveRuntime(id);
    add(id,title,item?.installed===true,
     item?.installed?
      "Подпись и SHA-256 установленной версии "+String(item.version||"")+" проверены":
      String(item?.reason||"Не установлен подписанный комплект модели и локального движка"))
   }catch(error){
    add(id,title,false,
     "Не удалось проверить подпись и SHA-256: "+String(error.message||error))
   }
  }
  let status;
  try{status=engine.status()}catch(error){status={state:"failed",reason:String(error.message||error)}}
  add("qwen_running","Запущенная Qwen3-VL",status?.state==="ready",
   status?.state==="ready"?
    "Локальный сервер готов к запросу. Реальное распознавание листа ещё необходимо проверить":
    "Запустите Qwen в настройках моделей. Сейчас: "+
     String(status?.reason||status?.state||"неизвестно"));
  const filesReady=results.filter(x=>["publisher_key","qwen3-vl-4b","paddleocr-vl-1.6"].includes(x.id))
   .every(x=>x.ok);
  const ready=filesReady&&status?.state==="ready";
  return{readyForFirstPdf:ready,checkedAt:new Date().toISOString(),
   checks:results,reason:ready?
    "Локальные пакеты и запущенный движок готовы к первому испытанию КМД. Результаты нужно сверять с PDF":
    "Есть препятствия для испытания двух моделей. Исправьте пункты со статусом «Не готово»",
   modelTestingPerformed:false,releaseCertified:false}
 }
 return{check}
}
module.exports={createPreflight};
