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

test("preserves PDF fragment coordinates without claiming placement",()=>{
 const [hit]=markOccurrences({page:2,fragments:[{text:"К62",x:120.5,y:80,width:24,height:9}]},["К62"]);
 assert.equal(hit.x,120.5);
 assert.equal(hit.y,80);
 assert.equal(hit.width,24);
 assert.equal(hit.height,9);
 assert.equal(hit.safeForAutoPlacement,false);
});

test("missing coordinates are unknown, not zero",()=>{
 const [hit]=markOccurrences({page:1,fragments:[{text:"К62"}]},["К62"]);
 assert.equal(hit.x,null);
 assert.equal(hit.y,null);
 assert.equal(hit.width,null);
 assert.equal(hit.height,null);
});

test("distinguishes prefix marks and repeated occurrences",()=>{
 const hits=markOccurrences({page:4,fragments:[{text:"К62 К620 К62"}]},["К62","К620"]);
 assert.deepEqual(hits.map(h=>h.mark),["К620","К62","К62"]);
 assert.equal(hits.filter(h=>h.mark==="К62").length,2);
});
