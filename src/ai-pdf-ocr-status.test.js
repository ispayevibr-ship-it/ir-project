"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {ocrStatus}=require("./ai-pdf-ocr-status");
test("missing OCR package does not initiate installation",()=>{
 const state=ocrStatus({languageDir:"/missing",packageResolver:()=>{throw Error("missing")}});
 assert.equal(state.installed,false);
 assert.equal(state.ready,false);
 assert.equal(state.reason,"tesseract_not_installed");
});
test("OCR needs local language packs even when package is installed",()=>{
 const state=ocrStatus({languageDir:"/missing",packageResolver:()=>"/installed"});
 assert.equal(state.installed,true);
 assert.equal(state.languagesReady,false);
 assert.equal(state.reason,"local_languages_missing");
});
