"use strict";
const assert=require("node:assert/strict");
const {extractPageCandidates}=require("../src/ai-pdf-candidates");
const fragments=[
 {text:"К62",x:100,y:100},
 {text:"+9.705",x:120,y:120},
 {text:"К62",x:2200,y:1600},
 {text:"+0.000",x:2200,y:1620}
];
const page={page:1,fragments,titleBlockBounds:{x0:2000,y0:1500,x1:2400,y1:1700}};
const result=extractPageCandidates(page,["К62"],{});
assert.equal(result.marks.length,1);
assert.equal(result.marks[0].x,100);
assert.ok(result.observations.every(o=>o.fragmentIndex<2));
console.log("PDF title block exclusion passed");
