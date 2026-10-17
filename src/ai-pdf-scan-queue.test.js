"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {scanPages,scanSummary}=require("./ai-pdf-scan-queue");
test("bulk OCR queue selects only unreadable sheets",()=>{
 const idx={pages:[{page:1,hasTextLayer:true},{page:2,hasTextLayer:false},
  {page:3,hasTextLayer:true,uncertainEncoding:true}]};
 assert.deepEqual(scanPages(idx).map(x=>x.page),[2,3]);
 assert.equal(scanSummary(idx).ocrCandidatePages,2);
});
test("empty index cannot create OCR jobs",()=>{
 assert.deepEqual(scanPages(null),[]);
 assert.equal(scanSummary({pages:[]}).ocrCandidatePages,0);
});
