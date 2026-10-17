"use strict";
const assert=require("node:assert/strict");
const {associateLabels}=require("../src/ai-pdf-spatial-associations");
const input={marks:[{mark:"К62",page:1,fragmentIndex:0,x:100,y:100}],observations:[
 {kind:"axis",value:"1",point:{x:"",y:100}},
 {kind:"axis",value:"2",point:{x:110,y:100}},
 {kind:"elevation",valueMm:9705,point:{x:null,y:100}}
]};
const result=associateLabels(input);
assert.equal(result.length,1);
assert.deepEqual(result[0].axisCandidates.map(x=>x.value),["2"]);
assert.equal(result[0].elevationCandidates.length,0);
assert.equal(result[0].safeForAutoPlacement,false);
const noPoint=associateLabels({marks:[{mark:"К62",x:"",y:100}],observations:input.observations});
assert.equal(noPoint[0].pdfPoint,null);
console.log("PDF spatial association safety tests passed");
