"use strict";
const assert=require("node:assert/strict");
const {fragmentEvidence,extractPage}=require("../src/ai-scheme-lite-page");
const f=[
 {text:"Колонна ",x:80,y:310,width:53,height:10},
 {text:"К62",x:134,y:310,width:21,height:10},
 {text:"отм. низа ",x:80,y:285,width:65,height:10},
 {text:"-0,400",x:146,y:285,width:38,height:10},
 {text:"по осям ",x:80,y:255,width:55,height:10},
 {text:"3–Г",x:136,y:255,width:21,height:10}
];
const found=fragmentEvidence({fragments:f},["Колонна К62","отм. низа -0,400","по осям 3–Г"]);
assert.equal(found.length,3,"all quotes must map to exact source fragments");
assert.deepEqual(found[0].fragmentIds,[0,1]);
assert.equal(found[0].rectPt.x,80);
assert.equal(found[0].rectPt.width,75);
assert.equal(found[1].rectPt.y,285);
assert.equal(found[2].rectPt.height,10);
assert.deepEqual(fragmentEvidence({fragments:f},["К90"]),[],"no invented match");
assert.deepEqual(fragmentEvidence({fragments:[]},["Колонна К62"]),[]);
const distant=[...f];
distant[1]={...distant[1],y:45};
assert.equal(fragmentEvidence({fragments:distant},["Колонна К62"]).length,0,
 "separate text bands must not be united into fabricated evidence");
const sha="a".repeat(64);
const fs=require("node:fs");
const ui=fs.readFileSync("src/ai-scheme-lite-page.js","utf8"),
 viewer=fs.readFileSync("src/ai-recognition-page.js","utf8");
assert(ui.includes("data-lite-preview-source"),"ready rows can open their exact PDF page");
assert(ui.includes("item.source.textRegions"),"source-linked rectangle goes to the viewer");
assert(viewer.includes("data-pdf-evidence"),"PDF preview offers on/off source-text highlights");
assert(viewer.includes("pageInfo?.rotation||0"),"rotated pages avoid invented boxes");
const c=extractPage({documentId:30,sha256:sha,name:"План расположения колонн.pdf",
 kind:"КМ",page:1,raw:{text:"Колонна К62\nотм. низа -0,400\nпо осям 3–Г",fragments:f}});
assert.equal(c.marks.length,1);
assert(c.marks[0].evidenceLocations.some(x=>x.fragmentIds.length===2));
assert.equal(c.marks[0].locationConfirmed,false);
assert(!c.marks[0].evidenceLocations.some(x=>x.rectPt.x===99999));
const repeated=extractPage({documentId:30,sha256:sha,name:"План расположения колонн.pdf",
 kind:"КМ",page:1,raw:{text:"Колонна К62\nКолонна К62\nпо осям 3–Г\nотм. низа -0,400"}});
assert.equal(repeated.markMentions,2);
assert.equal(repeated.marks[0].axisX,"");
assert.equal(repeated.marks[0].z0Mm,null);
console.log("PDF text evidence: exact fragment rectangles, no fabricated geometry, repeated labels safe PASS");
