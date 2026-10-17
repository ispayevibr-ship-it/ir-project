"use strict";
const assert=require("node:assert/strict");
const {markOccurrences}=require("../src/ai-pdf-mark-matcher");
const page={page:1,fragments:[{text:"К62-К67",x:10,y:10},{text:"К62",x:20,y:20},{text:"К63 К67",x:30,y:30},{text:"К620",x:40,y:40}]};
const hits=markOccurrences(page,["К62","К63","К67"]);
assert.deepEqual(hits.map(h=>h.mark),["К62","К63","К67"]);
assert.ok(hits.every(h=>h.fragmentIndex!==0&&h.fragmentIndex!==3));
const mixed=markOccurrences({page:2,fragments:[{text:"К62-К67, К68",x:5,y:7}]},["К62","К67","К68"]);
assert.deepEqual(mixed.map(x=>x.mark),["К68"]);
const titleBlockPage={page:1,titleBlockBounds:{x0:2000,y0:1550,x1:2384,y1:1684},fragments:[
 {text:"К62",x:617,y:28},{text:"К62",x:2143,y:1640}]};
const filtered=markOccurrences(titleBlockPage,["К62"]);
assert.equal(filtered.length,1);
assert.equal(filtered[0].x,617);
assert.equal(markOccurrences({...titleBlockPage,titleBlockBounds:null},["К62"]).length,2);
console.log("PDF registered mark matching passed");
