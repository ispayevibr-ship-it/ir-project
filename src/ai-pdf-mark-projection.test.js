"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {projectMarks}=require("./ai-pdf-mark-projection");
const page={page:1,heightPt:100,rotation:0,fragments:[{text:"К62",x:60,y:80},{text:"Б1",x:80,y:80}]};
const anchors=[{pdfX:10,pdfY:20,mmX:0,mmY:0},{pdfX:110,pdfY:20,mmX:45000,mmY:0}];
test("projects known PDF label positions using verified anchors",()=>{
 const result=projectMarks(page,["К62"],anchors);
 assert.equal(result.calibrated,true);
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].xMm,22500);
 assert.equal(result.candidates[0].yMm,0);
 assert.equal(result.candidates[0].z0Mm,null);
 assert.equal(result.candidates[0].z1Mm,null);
 assert.equal(result.candidates[0].safeForAutoPlacement,false);
});
test("does not fabricate coordinates without calibration",()=>{
 const result=projectMarks(page,["К62"],[]);
 assert.equal(result.calibrated,false);
 assert.equal(result.candidates[0].xMm,null);
});
test("does not fabricate coordinates for PDF fragments missing a position",()=>{
 const result=projectMarks({page:1,heightPt:100,rotation:0,fragments:[{text:"К62"}]},["К62"],anchors);
 assert.equal(result.candidates[0].xMm,null);
 assert.equal(result.candidates[0].coordinateStatus,"missing_pdf_position");
});
test("rejects inconsistent anchors without moving marks",()=>{
 const bad=[...anchors,{pdfX:60,pdfY:20,mmX:100,mmY:0}];
 const result=projectMarks(page,["К62"],bad);
 assert.equal(result.calibrated,false);
 assert.equal(result.candidates[0].xMm,null);
});
