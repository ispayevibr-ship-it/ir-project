"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {projectMarks}=require("./ai-pdf-mark-projection");
const anchors=[{pdfX:10,pdfY:20,mmX:0,mmY:0},{pdfX:110,pdfY:20,mmX:45000,mmY:0}];
const sheet={page:1,heightPt:100,rotation:0,fragments:[{text:"К62",x:60,y:80}]};
test("converts text bottom-left coordinates to geometry top-left coordinates",()=>{
 const output=projectMarks(sheet,["К62"],anchors);
 assert.equal(output.calibrated,true);
 assert.equal(output.candidates[0].xMm,22500);
 assert.equal(output.candidates[0].yMm,0);
 assert.equal(output.candidates[0].coordinateStatus,"label_coordinate_only");
 assert.equal(output.candidates[0].safeForAutoPlacement,false);
});
test("missing X or Y must never become zero",()=>{
 for(const fragment of [{text:"К62",y:80},{text:"К62",x:60}]){
  const output=projectMarks({...sheet,fragments:[fragment]},["К62"],anchors);
  assert.equal(output.candidates[0].xMm,null);
  assert.equal(output.candidates[0].yMm,null);
 }
});
test("rotated pages and missing dimensions remain unplaced",()=>{
 for(const change of [{rotation:90},{heightPt:null}]){
  const output=projectMarks({...sheet,...change},["К62"],anchors);
  assert.equal(output.candidates[0].xMm,null);
  assert.equal(output.candidates[0].safeForAutoPlacement,false);
 }
});
