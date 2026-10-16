"use strict";
const structured=require("./ai-structured-extraction");
/* IR Project AI: save only actual unverified results with exact source linkage. */
function createAnalysis({database,documents,engine,ocr=null,pdfRenderer,pdfIndex=null,revisions=null}){
 if(!database||!documents||!engine)throw Error("Missing analysis dependencies");
 let busy=false;
 const object=id=>{const n=Number(id);if(!Number.isSafeInteger(n)||n<=0||!database.getObject(n))throw Error("Объект не найден");return n};
 function parseClaims(raw){
  const obj=structured.readJson(raw);
  if(!obj)return null;
  const strings=x=>Array.isArray(x)?x.filter(y=>typeof y==="string").slice(0,70).map(y=>y.slice(0,300)):[];
  const records=structured.extract(raw);
  const declaredMarks=strings(obj.marks);
  // For structured records, include exact mark labels only when provided by the model.
  // Duplicates from detail rows do not imply any construction quantity.
  const recordMarks=records.records.map(x=>x.data.mark).filter(Boolean);
  const marks=[...new Map([...declaredMarks,...recordMarks].map(mark=>[mark.toLocaleUpperCase("ru-RU"),mark])).values()].slice(0,70);
  return{text:typeof obj.text==="string"?obj.text.slice(0,12000):"",
   marks,notes:strings(obj.notes),unknowns:strings(obj.unknowns),
   structured:records}
 }
 // Qwen-only beta is allowed when the optional PaddleOCR pack is absent.
 // If OCR is installed but fails, preserve the error instead of silently bypassing it.
 async function recognizeOptionalOcr(input){
  if(!ocr||typeof ocr.recognize!=="function")return null;
  if(typeof ocr.status==="function"&&ocr.status()?.installed!==true)return null;
  return ocr.recognize({buffer:input.buffer,mime:input.mime})
 }
 // The original PDF text layer is independent local evidence, not an OCR/VLM
 // approval. Never pass an index from a different source hash or uncertain font map.
 function localPdfText(id,source){
  if(!pdfIndex?.list||!pdfIndex?.page||!source?.page)return null;
  try{
  const found=pdfIndex.list(id).find(row=>
   Number(row.documentId)===Number(source.documentId)&&
   row.sourceSha256===source.sha256&&
   Array.isArray(row.pages)&&row.pages.some(p=>
    Number(p.page)===Number(source.page)&&p.hasTextLayer===true&&p.uncertainEncoding!==true));
  if(!found)return null;
  const detail=pdfIndex.page(id,found.id,source.page);
  if(detail?.source?.sha256!==source.sha256||
     Number(detail?.source?.documentId)!==Number(source.documentId))return null;
  const original=String(detail.page?.text||"").replace(/\0/g," ").trim();
  if(original.length<5)return null;
  const compact=original.length>2100?
   original.slice(0,1050)+"\n[Пропущен длинный участок слоя PDF]\n"+original.slice(-1050):original;
  return{text:compact,indexId:found.id,usedChars:compact.length,
   unverified:true,sourceSha256:source.sha256}
  }catch(error){
   // Stale or corrupt cache must never block visualization of the original PDF.
   console.warn("IR Project AI: PDF text index is not available for visual analysis:",String(error.message||error));
   return null
  }
 }
 function imageEvidence(ocrEvidence,textLayer){
  if(!textLayer)return ocrEvidence?.text||"";
  const caption="НЕПРОВЕРЕННЫЙ ТЕКСТОВЫЙ СЛОЙ ИСХОДНОГО PDF (сверить с изображением):\n";
  if(!ocrEvidence?.text)return caption+textLayer.text;
  return String(ocrEvidence.text).slice(0,850)+"\n"+caption+textLayer.text.slice(0,1450)
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
   const ocrEvidence=await recognizeOptionalOcr(input);
   const result=await engine.analyzeImage({buffer:input.buffer,mime:input.mime,
    prompt:structured.PROMPT,ocrContext:ocrEvidence?.text||""});
   if(typeof documents.verify==="function"&&!documents.verify(id,input.source.documentId))
    throw Error("Исходный файл изменился или удалён во время анализа — результат не сохранён");
   const extracted=parseClaims(result.raw);
   const saved=database.createEntity(id,"ai-analysis",{record_type:"image_analysis",
    title:"Анализ изображения: "+input.source.name,
    data:{source:input.source,model:result.engine,modelId:result.modelId||null,modelVersion:result.modelVersion||null,raw:result.raw,
     ocr:ocrEvidence,extracted,complete:!!result.complete,finishReason:result.finishReason||null,verification:"requires_review",
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
   const ocrEvidence=await recognizeOptionalOcr(input);
   const textLayer=localPdfText(id,input.source);
   const result=await engine.analyzeImage({buffer:input.buffer,mime:input.mime,
    prompt:"PDF лист "+input.source.page+(region?" — выделенный фрагмент":" — весь лист")+". "+structured.PROMPT,
    ocrContext:imageEvidence(ocrEvidence,textLayer)});
   if(typeof documents.verify==="function"&&!documents.verify(id,input.source.documentId))
    throw Error("Исходный PDF изменился во время распознавания — результат не сохранён");
   if(revisions&&!revisions.isCurrent(id,input.source))
    throw Error("Во время распознавания поменялся действующий комплект КМ/КМД. Результат не сохранён");
   const extracted=parseClaims(result.raw);
   const saved=database.createEntity(id,"ai-analysis",{record_type:"image_analysis",
    title:"Анализ PDF · лист "+input.source.page+(region?" · фрагмент":"")+" · "+input.source.name,
    data:{source:input.source,model:result.engine,modelId:result.modelId||null,modelVersion:result.modelVersion||null,raw:result.raw,
     ocr:ocrEvidence,pdfTextLayer:textLayer?{indexId:textLayer.indexId,usedChars:textLayer.usedChars,
      unverified:true,sourceSha256:textLayer.sourceSha256}:null,
     raster:{width:input.width||null,height:input.height||null,scale:input.scale||null},
     extracted,complete:!!result.complete,finishReason:result.finishReason||null,verification:"requires_review",
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
