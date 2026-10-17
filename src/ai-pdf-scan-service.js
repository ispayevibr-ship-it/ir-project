"use strict";
/* OCR evidence stored separately from PDF index and installation geometry. */
const {analyzeScan}=require("./ai-pdf-scan-analysis");
const {scanPages}=require("./ai-pdf-scan-queue");
function createScanService({database,documents,pdfIndex,renderer,languageDir,analyzer=analyzeScan}){
 if(!database||!documents||!pdfIndex||!renderer)throw Error("OCR dependencies missing");
 const running=new Set();
 function object(id){const n=Number(id);if(!Number.isSafeInteger(n)||n<1||!database.getObject(n))throw Error("Object not found");return n}
 function records(id){return database.listEntity(object(id),"ai-pdf-ocr")||[]}
 function list(id){return records(id).filter(r=>r.record_type==="pdf_ocr_evidence").map(r=>({
  id:r.id,documentId:r.data.documentId,page:r.data.page,sourceSha256:r.data.sourceSha256,
  text:r.data.text,wordCount:r.data.words?.length||0,status:r.data.status,
  safeForAutoPlacement:false
 }))}
 async function run(id,documentId,page){
  id=object(id);documentId=Number(documentId);page=Number(page);
  if(!Number.isSafeInteger(documentId)||documentId<1||!Number.isSafeInteger(page)||page<1)throw Error("Invalid OCR page");
  const key=id+":"+documentId+":"+page;
  if(running.size)throw Error("OCR already running");
  running.add(key);
  try{
   const doc=(await documents.readForPdfIndex(id,documentId)).source;
   const index=pdfIndex.list(id).find(x=>String(x.documentId)===String(documentId)&&x.sourceSha256===doc.sha256);
   if(!index)throw Error("Index this PDF before OCR");
   const target=scanPages(index).find(x=>x.page===page);
   if(!target)throw Error("OCR not required for this page");
   const previous=records(id).find(r=>r.record_type==="pdf_ocr_evidence"&&
    r.data.documentId===documentId&&r.data.page===page&&r.data.sourceSha256===doc.sha256);
   if(previous)return{cached:true,id:previous.id,page,wordCount:previous.data.words.length};
   const indexedPage=index.pages.find(p=>p.page===page);
   const result=await analyzer({renderer,objectId:id,documentId,page,indexedPage,
    languageDir,enabled:true});
   if(result.status!=="review_required"||result.sourceSha256!==doc.sha256)
    throw Error("OCR source verification failed");
   if(typeof documents.verify==="function"&&!documents.verify(id,documentId))
    throw Error("PDF changed during OCR");
   const saved=database.createEntity(id,"ai-pdf-ocr",{
    record_type:"pdf_ocr_evidence",title:"OCR: "+doc.name+" / "+page,
    data:{documentId,page,sourceSha256:doc.sha256,status:"review_required",
     source:"local_tesseract_ocr",text:result.text,words:result.words,
     widthPt:result.widthPt,heightPt:result.heightPt,
     imageWidth:result.imageWidth,imageHeight:result.imageHeight,
     safeForAutoPlacement:false,generatedByAI:false}
   });
   if(!saved)throw Error("OCR evidence could not be saved");
   return{cached:false,id:saved.id,page,wordCount:result.words.length,status:"review_required"}
  }finally{running.delete(key)}
 }
 return{run,list,busy:()=>running.size>0}
}
module.exports={createScanService};
