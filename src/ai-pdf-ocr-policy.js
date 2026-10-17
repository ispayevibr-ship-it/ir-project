"use strict";
/* Local PDF OCR policy. Never download language packs or silently OCR vector sheets.
   A page with a usable text layer stays on the deterministic PDF.js path. */
function ocrDecision(page,{enabled=false,localLanguagesAvailable=false}={}){
 const text=String(page?.text||"").trim();
 const printable=[...text].filter(c=>/[\p{L}\p{N}]/u.test(c)).length;
 const bad=[...text].filter(c=>c==="\uFFFD"||c==="\u25A1").length;
 const missing=printable<12;
 const corrupt=text.length>=12&&bad/Math.max(1,text.length)>0.05;
 if(!missing&&!corrupt)return{needed:false,reason:"pdf_text_layer",offline:true};
 if(!enabled)return{needed:true,ready:false,reason:"ocr_disabled",offline:true};
 if(!localLanguagesAvailable)return{needed:true,ready:false,reason:"local_language_data_missing",offline:true};
 return{needed:true,ready:true,reason:missing?"no_text_layer":"corrupt_text_layer",
  offline:true,requiresManualVerification:true,safeForAutoPlacement:false}
}
function validateOcrResult(result){
 if(!result||!Array.isArray(result.words)||result.words.length>12000)return false;
 return result.words.every(w=>typeof w.text==="string"&&w.text.length<=200&&
  ["x0","y0","x1","y1"].every(k=>Number.isFinite(w[k]))&&
  w.x1>=w.x0&&w.y1>=w.y0);
}
module.exports={ocrDecision,validateOcrResult};
