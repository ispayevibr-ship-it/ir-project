"use strict";
const assert=require("node:assert/strict");
const {reviewToThreeJs}=require("../src/ai-placement-pipeline");
const candidates={candidates:[
 {placementId:"a",mark:"К62",type:"колонна"},
 {placementId:"b",mark:"Б1",type:"балка"},
 {placementId:"c",mark:"Х1",type:"не определено"}
]};
assert.equal(reviewToThreeJs(candidates).items.length,0);
const result=reviewToThreeJs(candidates,[
 {placementId:"a",approved:true,xMm:0,yMm:45000,z0Mm:-400,z1Mm:9705},
 {placementId:"b",approved:true,xMm:0,yMm:0,z0Mm:5000,z1Mm:5000},
 {placementId:"c",approved:true,xMm:0,yMm:0,z0Mm:0,z1Mm:1000}
]);
assert.equal(result.items.length,1);
assert.equal(result.items[0].heightMm,10105);
assert.equal(result.rejected.length,2);
assert.equal(result.items[0].mark,"К62");
console.log("Reviewed Three.js payload tests passed");
