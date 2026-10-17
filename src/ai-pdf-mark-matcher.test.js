"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const {normalize,markOccurrences}=require("./ai-pdf-mark-matcher");
test("normalizes PDF typography",()=>assert.equal(normalize(" ф 8–1 "),"Ф8-1"));
test("matches only listed marks",()=>{
 const matches=markOccurrences({page:3,fragments:[{str:"К41"},{str:"К410"},{str:"К41а"},{str:"К42"}]},["К41","К41А"]);
 assert.deepEqual(matches.map(x=>x.mark),["К41","К41А"]);
 assert(matches.every(x=>x.safeForAutoPlacement===false));
});
test("does not invent text across unrelated fragments",()=>{
 assert.deepEqual(markOccurrences({page:1,fragments:[{str:"К"},{str:"62"}]},["К62"]),[]);
});
