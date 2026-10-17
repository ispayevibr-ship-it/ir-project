"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {buildCoordinateCandidates}=require("./ai-pdf-coordinate-candidates");
const anchors=[{pdfX:0,pdfY:0,mmX:0,mmY:0},{pdfX:100,pdfY:0,mmX:45000,mmY:0}];
test("candidate has source, projected label coordinate and unverified placement",()=>{
 const result=buildCoordinateCandidates({
  page:{page:3,heightPt:100,rotation:0,fragments:[{str:"К62",x:50,y:100}]},
  registerMarks:["К62","К63"],anchors,documentId:7,sourceSha256:"sha"});
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].xMm,22500);
 assert.equal(result.candidates[0].yMm,0);
 assert.equal(result.candidates[0].z0Mm,null);
 assert.equal(result.candidates[0].safeForAutoPlacement,false);
 assert.equal(result.candidates[0].documentId,7);
});
test("missing anchors never become verified coordinates",()=>{
 const result=buildCoordinateCandidates({
  page:{page:1,fragments:[{str:"К62",x:1,y:2}]},registerMarks:["К62"]});
 assert.equal(result.candidates[0].xMm,null);
 assert.equal(result.candidates[0].verification,"required");
});
