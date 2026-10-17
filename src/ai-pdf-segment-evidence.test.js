"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {nearestSegments}=require("./ai-pdf-segment-evidence");
test("finds nearest drawing segment and preserves unverified status",()=>{
 const result=nearestSegments({x:5,y:2},[
  {x1:0,y1:0,x2:10,y2:0},{x1:50,y1:50,x2:60,y2:60}],{maxDistancePt:4});
 assert.equal(result.length,1);
 assert.equal(result[0].distancePt,2);
 assert.equal(result[0].closestX,5);
 assert.equal(result[0].safeForAutoPlacement,false);
});
test("ignores zero-length segments and invalid positions",()=>{
 assert.deepEqual(nearestSegments({x:0,y:0},[{x1:0,y1:0,x2:0,y2:0}]),[]);
 assert.deepEqual(nearestSegments({x:null,y:0},[{x1:0,y1:0,x2:1,y2:1}]),[]);
});
