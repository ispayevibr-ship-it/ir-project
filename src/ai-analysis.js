"use strict";
const structured=require("./ai-structured-extraction");
/* IR Project AI: save only actual unverified results with exact source linkage. */
function createAnalysis({database,documents,engine,ocr=null,pdfRenderer,revisions=null}){
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
     marks:strings(obj.marks),notes:strings(obj.notes),unknowns:strings(obj.unknowns),
     structured:structured.extract(raw)};
   }
  }catch{}
  return structured
 }
 function list(id){
  return database.listEntity(object(id),"ai-analysis").filter(r=>r.record_type==="image_analysis")
   .map(r=>({id:r.id,documentId:r.data?.source?.documentId,
    sourceName:String(r.data?.source?.name||""),
    sha256:String(r.data?.source?.sha256||""),
    model:String(r.data?.model||""),page:r.data?.source?.page||null,status:"Требует проверки инженера",
    notes:r.data?.extracted||null,
    raw:String(r.data?.raw||""),createdAt:r.created_at,region:r.data?.sourceRegion||"Лист целиком — координаты фрагментов не установлены"}));
 }
 async function analyze(id,documentId){
  id=object(id);
  if(busy)throw Error("Выполняется другое распознавание. Дождитесь его завершения.");
  busy=true;
  try{
   const input=await documents.readForAnalysis(id,documentId);
   const ocrEvidence=ocr?await ocr.recognize({buffer:input.buffer,mime:input.mime}):null;
   const result=await engine.analyzeImage({buffer:input.buffer,mime:input.mime,
    prompt:structured.PROMPT,ocrContext:ocrEvidence?.text||""});
   if(typeof documents.verify==="function"&&!documents.verify(id,input.source.documentId))
    throw Error("Исходный файл изменился или удалён во время анализа — результат не сохранён");
   const extracted=parseClaims(result.raw);
   const saved=database.createEntity(id,"ai-analysis",{record_type:"image_analysis",
    title:"Анализ изображения: "+input.source.name,
    data:{source:input.source,model:result.engine,modelId:result.modelId||null,modelVersion:result.modelVersion||null,raw:result.raw,
     ocr:ocrEvidence,extracted,complete:!!result.complete,verification:"requires_review",
     sourceRegion:null,origin:ocrEvidence?"paddleocr_vl_1_6_plus_llama_cpp":"locally_executed_llama_cpp"}});
   if(!saved)throw Error("Не удалось сохранить результат анализа");
   return{id:saved.id,source:input.source.name,
    status:"Требует проверки инженера",parsed:!!extracted,
    marks:extracted?.marks||[],unknowns:extracted?.unknowns||[]};
  }finally{busy=false}
 }
 async function analyzePdf(id,documentId,page,region=null){
  id=object(id);
  if(!pdfRenderer||typeof pdfRenderer.renderForAnalysis!=="function")
   throw Error("Рендеринг листов PDF недоступен в этой версии");
  if(busy)throw Error("Другой анализ уже выполняется");
  if(engine.status?.().state!=="ready")throw Error("Перед визуальным анализом листа запустите локальную модель");
  busy=true;
  try{
   const input=await pdfRenderer.renderForAnalysis(id,documentId,page,region);
   if(revisions&&!revisions.isCurrent(id,input.source))
    throw Error("Этот лист не входит в действующий комплект КМ/КМД. Сначала утвердите корректную ревизию");
   const ocrEvidence=ocr?await ocr.recognize({buffer:input.buffer,mime:input.mime}):null;
   const result=await engine.analyzeImage({buffer:input.buffer,mime:input.mime,
    prompt:"PDF лист "+input.source.page+(region?" — выделенный фрагмент":" — весь лист")+". "+structured.PROMPT,
    ocrContext:ocrEvidence?.text||""});
   if(typeof documents.verify==="function"&&!documents.verify(id,input.source.documentId))
    throw Error("Исходный PDF изменился во время распознавания — результат не сохранён");
   if(revisions&&!revisions.isCurrent(id,input.source))
    throw Error("Во время распознавания поменялся действующий комплект КМ/КМД. Результат не сохранён");
   const extracted=parseClaims(result.raw);
   const saved=database.createEntity(id,"ai-analysis",{record_type:"image_analysis",
    title:"Анализ PDF · лист "+input.source.page+(region?" · фрагмент":"")+" · "+input.source.name,
    data:{source:input.source,model:result.engine,modelId:result.modelId||null,modelVersion:result.modelVersion||null,raw:result.raw,
     ocr:ocrEvidence,extracted,complete:!!result.complete,verification:"requires_review",
     sourceRegion:region?"PDF лист "+input.source.page+": область "+JSON.stringify(input.source.region)+
      ", координаты прямоугольника в pt "+JSON.stringify(input.source.sourceRectPt)+
      "; координаты отдельных распознанных деталей пока не определены":
      "PDF лист "+input.source.page+" целиком; координаты распознанных элементов пока отсутствуют",
     origin:ocrEvidence?"paddleocr_vl_1_6_plus_llama_cpp_pdf":
      region?"locally_executed_llama_cpp_pdf_region":"locally_executed_llama_cpp_pdf_raster"}});
   if(!saved)throw Error("Не удалось сохранить анализ PDF");
   return{id:saved.id,source:input.source.name,page:input.source.page,region:input.source.region||null,
    status:"Требует проверки инженера",parsed:!!extracted,
    marks:extracted?.marks||[],unknowns:extracted?.unknowns||[]};
  }finally{busy=false}
 }
 return{list,analyze,analyzePdf,parseClaims};
}
module.exports={createAnalysis};
