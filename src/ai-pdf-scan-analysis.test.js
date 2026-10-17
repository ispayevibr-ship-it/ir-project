"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {analyzeScan}=require("./ai-pdf-scan-analysis");
test("text-layer pages do not invoke PDF rendering",async()=>{
 let calls=0;
 const renderer={renderForAnalysis:async()=>{calls++;throw Error("should not render")}};
 const result=await analyzeScan({renderer,indexedPage:{text:"Монтажная схема с обозначениями колонн"},enabled:true,languageDir:"/unused"});
 assert.equal(result.status,"text_layer");assert.equal(calls,0);
});
test("scans remain disabled unless explicitly opted in",async()=>{
 let calls=0;
 const renderer={renderForAnalysis:async()=>{calls++;throw Error("should not render")}};
 const result=await analyzeScan({renderer,indexedPage:{text:""},enabled:false});
 assert.equal(result.status,"ocr_disabled");assert.equal(calls,0);
});
