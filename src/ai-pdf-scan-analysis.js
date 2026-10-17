"use strict";
const {recognizePng,ocrDecision}=require("./ai-pdf-ocr");
async function analyzeScan(input){
 const {renderer,objectId,documentId,page,indexedPage,languageDir,enabled=false}=input||{};
 if(!renderer||typeof renderer.renderForAnalysis!=="function")throw Error("PDF renderer required");
 const decision=ocrDecision(indexedPage,{enabled,localLanguagesAvailable:!!languageDir});
 if(!decision.needed)return{status:"text_layer",ocrNeeded:false};
 if(!enabled)return{status:"ocr_disabled",ocrNeeded:true};
 if(!languageDir)return{status:"languages_missing",ocrNeeded:true};
 const img=await renderer.renderForAnalysis(objectId,documentId,page);
 const result=await recognizePng({png:img.buffer,width:img.width,height:img.height,languageDir});
 return{status:"review_required",page,documentId,sourceSha256:img.source.sha256,
  widthPt:img.widthPt,heightPt:img.heightPt,imageWidth:img.width,imageHeight:img.height,
  text:result.text,words:result.words,source:"local_tesseract_ocr",
  safeForAutoPlacement:false};
}
module.exports={analyzeScan};
