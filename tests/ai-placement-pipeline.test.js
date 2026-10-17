"use strict";
const assert=require("node:assert/strict");
const {reviewToThreeJs,candidatePlacements}=require("../src/ai-placement-pipeline");
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
const repeated=candidatePlacements([{documentId:"doc1",page:1,fragments:[
 {text:"К62 К62",x:100,y:100,width:90,height:12},
 {text:"К62",x:200,y:200,width:30,height:12}
]}],[{mark:"К62",name:"Колонна"}],{});
assert.equal(repeated.occurrences,3);
assert.equal(new Set(repeated.candidates.map(x=>x.placementId)).size,3);
assert.ok(repeated.candidates.every(x=>x.documentId==="doc1"));
assert.equal(repeated.readyForPlacement.length,0);
console.log("Reviewed Three.js payload and repeated PDF marks tests passed");
