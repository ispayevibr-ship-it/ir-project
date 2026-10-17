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
assert.equal(result.items.length,2);
assert.equal(result.items[0].heightMm,10105);
assert.equal(result.rejected.length,1);
assert.equal(result.items[0].mark,"К62");
const repeated=candidatePlacements([{documentId:"doc1",page:1,fragments:[
 {text:"К62 К62",x:100,y:100,width:90,height:12},
 {text:"К62",x:200,y:200,width:30,height:12}
]}],[{mark:"К62",name:"Колонна"}],{});
assert.equal(repeated.occurrences,3);
assert.equal(repeated.matchedMarks,1);
assert.equal(repeated.missingMarks.length,0);
assert.equal(new Set(repeated.candidates.map(x=>x.placementId)).size,3);
assert.ok(repeated.candidates.every(x=>x.documentId==="doc1"));
assert.equal(repeated.readyForPlacement.length,0);
const revised=candidatePlacements([{documentId:"doc1",sourceSha256:"new-revision",page:1,fragments:[{text:"К62",x:100,y:100}]}],[{mark:"К62",name:"Колонна"}],{});
assert.notEqual(repeated.candidates[0].placementId,revised.candidates[0].placementId);
const unknown=candidatePlacements([{documentId:"doc2",page:1,fragments:[{text:"К999",x:10,y:20}]}],[{mark:"К62",name:"Колонна"}],{});
assert.equal(unknown.occurrences,0);
assert.deepEqual(unknown.missingMarks,["К62"]);
const blank=reviewToThreeJs({candidates:[{placementId:"blank",mark:"К1",type:"колонна"}]},[{placementId:"blank",approved:true,xMm:"  ",yMm:0,z0Mm:0,z1Mm:9000}]);
assert.equal(blank.items.length,0);
assert.equal(blank.rejected[0].reason,"invalid_approved_geometry");
const planRole=candidatePlacements([{page:1,fragments:[{text:"Монтажный план",x:10,y:10},{text:"К62",x:20,y:20}]}],[{mark:"К62",name:"Колонна"}]);
assert.equal(planRole.candidates[0].sheetRole,"placement_plan");
const detailRole=candidatePlacements([{page:2,fragments:[{text:"Чертеж колонны",x:10,y:10},{text:"К62",x:20,y:20}]}],[{mark:"К62",name:"Колонна"}]);
assert.equal(detailRole.candidates[0].sheetRole,"detail_or_schedule");
assert.equal(detailRole.placementPlanOccurrences,0);
assert.equal(detailRole.detailReferenceOccurrences,1);
assert.equal(detailRole.unknownSheetOccurrences,0);
assert.equal(planRole.placementPlanOccurrences,1);
assert.equal(planRole.detailReferenceOccurrences,0);
assert.equal(repeated.unknownSheetOccurrences,3);
assert.equal(repeated.candidates[0].sheetRole,"unknown");
console.log("Reviewed Three.js payload and repeated PDF marks tests passed");
