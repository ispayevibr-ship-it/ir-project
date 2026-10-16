"use strict";
/* One page at a time, isolated with worker_threads. No network, no OCR,
 * no whole-document geometry pass, no automatic mark placements. */
const {parentPort,workerData}=require("node:worker_threads");
const {extractSegments}=require("./ai-pdf-vector-paths");
const MAX_PDF_BYTES=48*1024*1024,MAX_PAGES=80;
(async()=>{
 let loading,doc,page;
 try{
  const bytes=workerData?.bytes,pageNumber=Number(workerData?.page);
  if(!bytes||bytes.byteLength<5||bytes.byteLength>MAX_PDF_BYTES)
   throw Error("Недопустимый размер PDF");
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  loading=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,
   disableFontFace:true,useSystemFonts:false,stopAtErrors:false,
   verbosity:pdfjs.VerbosityLevel.ERRORS});
  doc=await loading.promise;
  if(!Number.isSafeInteger(doc.numPages)||doc.numPages<1||doc.numPages>MAX_PAGES)
   throw Error("Комплект PDF содержит более 80 листов");
  if(!Number.isSafeInteger(pageNumber)||pageNumber<1||pageNumber>doc.numPages)
   throw Error("Указанный лист PDF отсутствует");
  page=await doc.getPage(pageNumber);
  const viewport=page.getViewport({scale:1});
  const operatorList=await page.getOperatorList();
  const result=extractSegments(operatorList,pdfjs.OPS,viewport);
  parentPort.postMessage({type:"result",page:pageNumber,total:doc.numPages,
   rotation:viewport.rotation,source:"pdfjs_vector_strokes",...result});
  page.cleanup();await loading.destroy()
 }catch(error){
  try{page?.cleanup()}catch{}
  try{await loading?.destroy()}catch{}
  parentPort.postMessage({type:"error",message:String(error.message||error).slice(0,500)})
 }
})().catch(error=>parentPort.postMessage({type:"error",message:String(error.message||error).slice(0,500)}));
