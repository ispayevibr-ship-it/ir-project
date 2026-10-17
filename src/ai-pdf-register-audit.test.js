"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {auditMarkRegister}=require("./ai-pdf-register-audit");
test("audit counts only marks present in the register and never calls hits placements",()=>{
 const pages=[{page:1,fragments:[
  {str:"К62",x:2,y:3},{str:"К62",x:4,y:5},
  {str:"К63",x:6,y:7},{str:"К999",x:8,y:9}
 ]}];
 const result=auditMarkRegister(pages,["К62","К63","К64"]);
 assert.equal(result.registerMarks,3);
 assert.equal(result.matchedMarks,2);
 assert.equal(result.occurrences,3);
 assert.deepEqual(result.missing,["К64"]);
 assert.equal(result.verifiedInstances,0);
 assert.equal(result.safeForAutoPlacement,false);
 assert.equal(result.found.find(x=>x.mark==="К62").occurrences,2);
});
test("audit does not match K41 inside K410",()=>{
 const result=auditMarkRegister([{page:1,fragments:[{str:"К410"}]}],["К41"]);
 assert.equal(result.occurrences,0);
});
