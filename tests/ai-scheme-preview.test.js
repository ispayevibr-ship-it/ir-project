"use strict";
const assert=require("node:assert/strict");
const {prepareSchemePreview}=require("../src/ai-scheme-preview");
const placements={candidates:[
 {placementId:"col",mark:"К62",type:"колонна"},
 {placementId:"beam",mark:"Б1",type:"балка"},
 {placementId:"brace",mark:"С1",type:"связь"}
]};
const approvals=[
 {placementId:"col",approved:true,xMm:0,yMm:0,z0Mm:0,z1Mm:9705},
 {placementId:"beam",approved:true,xMm:0,yMm:0,z0Mm:5000,z1Mm:6000,
  endPoint:{xMm:45000,yMm:0,zMm:6000}},
 {placementId:"brace",approved:true,xMm:0,yMm:0,z0Mm:0,z1Mm:4000}
];
const result=prepareSchemePreview(placements,approvals,[]);
assert.equal(result.elements.length,2);
assert.deepEqual(result.elements[0].start,{x:0,y:0,z:0});
assert.deepEqual(result.elements[1].end,{x:45000,y:0,z:6000});
assert.ok(result.skipped.some(s=>s.placementId==="brace"&&s.reason==="requires_two_verified_endpoints"));
assert.equal(prepareSchemePreview(placements,approvals,["col"]).elements.length,1);
assert.equal(result.mutatesDatabase,false);
console.log("Scheme preview adapter tests passed");
