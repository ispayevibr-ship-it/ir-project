"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {calibrate}=require("./ai-pdf-axis-calibration");
test("converts verified PDF points to millimetres",()=>{
 const c=calibrate({anchors:[
  {pdfX:10,pdfY:20,mmX:0,mmY:0},
  {pdfX:110,pdfY:20,mmX:45000,mmY:0}
 ]});
 assert.deepEqual(c.transform(60,20),{xMm:22500,yMm:0});
 assert.equal(c.safeForAutoPlacement,false);
});
test("supports rotated drawings",()=>{
 const c=calibrate({anchors:[
  {pdfX:0,pdfY:0,mmX:0,mmY:0},
  {pdfX:0,pdfY:100,mmX:45000,mmY:0}
 ]});
 const p=c.transform(0,50);
 assert(Math.abs(p.xMm-22500)<1e-6);
 assert(Math.abs(p.yMm)<1e-6);
});
test("rejects contradictory third anchor",()=>{
 assert.throws(()=>calibrate({anchors:[
  {pdfX:0,pdfY:0,mmX:0,mmY:0},
  {pdfX:100,pdfY:0,mmX:45000,mmY:0},
  {pdfX:50,pdfY:0,mmX:999,mmY:0}
 ]}),/противоречат/);
});
test("does not invent coordinates for missing PDF positions",()=>{
 const c=calibrate({anchors:[
  {pdfX:0,pdfY:0,mmX:0,mmY:0},
  {pdfX:100,pdfY:0,mmX:45000,mmY:0}
 ]});
 assert.equal(c.transform(null,20),null);
});
