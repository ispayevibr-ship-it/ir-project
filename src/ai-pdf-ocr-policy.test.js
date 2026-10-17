"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {ocrDecision,validateOcrResult}=require("./ai-pdf-ocr-policy");
test("vector PDF with readable text never requires OCR",()=>{
 assert.equal(ocrDecision({text:"Колонна К62, отметка +9,595"},{enabled:true,localLanguagesAvailable:true}).needed,false)
});
test("scanned PDF cannot trigger a network model download",()=>{
 const r=ocrDecision({text:""},{enabled:true,localLanguagesAvailable:false});
 assert.equal(r.reason,"local_language_data_missing");
 assert.equal(r.ready,false)
});
test("OCR requires explicit enablement and verified local data",()=>{
 assert.equal(ocrDecision({text:""},{enabled:false,localLanguagesAvailable:true}).ready,false);
 const r=ocrDecision({text:""},{enabled:true,localLanguagesAvailable:true});
 assert.equal(r.ready,true);
 assert.equal(r.safeForAutoPlacement,false)
});
test("OCR evidence rejects invalid pixel coordinates",()=>{
 assert.equal(validateOcrResult({words:[{text:"К62",x0:1,y0:2,x1:4,y1:6}]}),true);
 assert.equal(validateOcrResult({words:[{text:"К62",x0:5,y0:2,x1:4,y1:6}]}),false)
});
