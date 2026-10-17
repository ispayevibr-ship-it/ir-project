"use strict";
const assert=require("node:assert/strict");
const {inspectNearbyLevelCandidates}=require("../src/ai-pdf-mark-elevations");
const page={page:1,widthPt:600,heightPt:800,fragments:[
 {text:"К62",x:100,y:300,width:20,height:8},
 {text:"К63",x:400,y:300,width:20,height:8},
 {text:"+9,705",x:115,y:320,width:35,height:8},
 {text:"+8,500",x:410,y:320,width:35,height:8},
 {text:"К620",x:120,y:330,width:20,height:8},
 {text:"К62",x:null,y:null}
],levelCandidates:[
 {label:"+9,705",millimeters:9705,x:115,y:320},
 {label:"+8,500",millimeters:8500,x:410,y:320},
 {label:"bad",millimeters:0,x:null,y:null}
]};
const a=inspectNearbyLevelCandidates(page,"К62",["К62","К63"],{radiusPt:60});
assert.equal(a.occurrences,2);
assert.equal(a.matches.length,1);
assert.deepEqual(a.matches[0].nearby.map(x=>x.millimeters),[9705]);
assert.equal(a.safeForAutoPlacement,false);
assert.throws(()=>inspectNearbyLevelCandidates(page,"К64",["К62","К63"]),/ведомости/);
const b=inspectNearbyLevelCandidates(page,"К63",["К62","К63"],{radiusPt:60});
assert.deepEqual(b.matches[0].nearby.map(x=>x.millimeters),[8500]);
console.log("PDF elevation proximity tests passed");
