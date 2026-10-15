"use strict";
/* IR Project AI: save only actual unverified results with exact source linkage. */
function createAnalysis({database,documents,engine}){
 if(!database||!documents||!engine)throw Error("Missing analysis dependencies");
 let busy=false;
 const object=id=>{const n=Number(id);if(!Number.isSafeInteger(n)||n<=0||!database.getObject(n))throw Error("Объект не найден");return n};
 function parseClaims(raw){
  let text=String(raw||"").trim(),structured=null;
  if(text.startsWith(String.fromCharCode(96,96,96)))text=text.replace(/^\x60{3}[a-z]*\s*/i,"").replace(/\s*\x60{3}$/,"");
  try{
   const obj=JSON.parse(text);
   if(obj&&typeof obj==="object"&&!Array.isArray(obj)){
    const strings=x=>Array.isArray(x)?x.filter(y=>typeof y==="string").slice(0,70).map(y=>y.slice(0,300)):[];
    structured={text:typeof obj.text==="string"?obj.text.slice(0,12000):"",
     marks:strings(obj.marks),notes:strings(obj.notes),unknowns:strings(obj.unknowns)};
   }
  }catch{}
  return structured
 }
 function list(id){
  return database.listEntity(object(id),"ai-analysis").filter(r=>r.record_type==="image_analysis")
   .map(r=>({id:r.id,documentId:r.data?.source?.documentId,
    sourceName:String(r.data?.source?.name||""),
    sha256:String(r.data?.source?.sha256||""),
    model:String(r.data?.model||""),status:"Требует проверки инженера",
    notes:r.data?.extracted||null,
    raw:String(r.data?.raw||""),createdAt:r.created_at,region:"Лист целиком — координаты фрагментов не установлены"}));
 }
 async function analyze(id,documentId){
  id=object(id);
  if(busy)throw Error("Выполняется другое распознавание. Дождитесь его завершения.");
  busy=true;
  try{
   const input=await documents.readForAnalysis(id,documentId);
   const result=await engine.analyzeImage({buffer:input.buffer,mime:input.mime,
    prompt:"Рассмотри изображение строительного чертежа КМ/КМД. Извлеки только явно видимые обозначения отправочных марок, текстовые фрагменты и замечания. Не восстанавливай 3D, массу или количество без точного источника. Ответ JSON {text,marks,notes,unknowns}. Неразборчивые данные перечисли в unknowns."});
   const extracted=parseClaims(result.raw);
   const saved=database.createEntity(id,"ai-analysis",{record_type:"image_analysis",
    title:"Анализ изображения: "+input.source.name,
    data:{source:input.source,model:result.engine,raw:result.raw,
     extracted,complete:!!result.complete,verification:"requires_review",
     sourceRegion:null,origin:"locally_executed_llama_cpp"}});
   if(!saved)throw Error("Не удалось сохранить результат анализа");
   return{id:saved.id,source:input.source.name,
    status:"Требует проверки инженера",parsed:!!extracted,
    marks:extracted?.marks||[],unknowns:extracted?.unknowns||[]};
  }finally{busy=false}
 }
 return{list,analyze,parseClaims};
}
module.exports={createAnalysis};
