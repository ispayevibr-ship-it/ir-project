"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {pdfOcrReadiness}=require("./ai-pdf-ocr-readiness");
test("document OCR readiness reports missing local runtime",()=>{
 const r=pdfOcrReadiness({pages:[{page:1,hasTextLayer:false}]},
  {languageDir:"/unavailable",packageResolver:()=>{throw Error("not installed")}});
 assert.equal(r.ocrCandidatePages,1);
 assert.equal(r.canProcess,false);
 assert.equal(r.autoPlacement,false);
});
test("readable PDF needs no OCR jobs",()=>{
 const r=pdfOcrReadiness({pages:[{page:1,hasTextLayer:true}]},
  {packageResolver:()=>"/installed"});
 assert.equal(r.ocrCandidatePages,0);
 assert.equal(r.canProcess,false);
});
