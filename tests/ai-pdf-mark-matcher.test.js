"use strict";
const assert=require("node:assert/strict");
const {markOccurrences}=require("../src/ai-pdf-mark-matcher");
const page={page:1,fragments:[{text:"К62-К67",x:10,y:10},{text:"К62",x:20,y:20},{text:"К63 К67",x:30,y:30},{text:"К620",x:40,y:40}]};
const hits=markOccurrences(page,["К62","К63","К67"]);
assert.deepEqual(hits.map(h=>h.mark),["К62","К63","К67"]);
assert.ok(hits.every(h=>h.fragmentIndex!==0&&h.fragmentIndex!==3));
console.log("PDF registered mark matching passed");
