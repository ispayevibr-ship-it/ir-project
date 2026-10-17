"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {automaticEntries,level}=require("./ai-mounting-auto");
// K62 regression: no guessed Z based on the old visualization's z=10.02.
const mark={id:62,title:"К62",data:{mark:"К62",name:"Колонна",qty:1}};
const grid={id:1,record_type:"scheme_grid",data:{
 axes_x:["1","2"],axes_y:["А","Б"],x_spans_mm:[6000],y_spans_mm:[6000]}};
const doc={id:9,record_type:"document",title:"041-2025 КМД л. 45-50 (К62-К67) Изм.1.pdf",
 data:{sha256:"a".repeat(64)}};
function rows(text){
 return {marks:[mark],scheme:[grid],"work-types":[],
 "ai-documents":[doc],"ai-pdf-geometry":[],
 "ai-pdf-index":[{id:1,record_type:"pdf_text_index",data:{
 source:{documentId:9,sha256:"a".repeat(64),name:doc.title},
 pages:[{page:1,text,fragments:[{text,x:10,y:10,width:90,height:8}],
 widthPt:500,heightPt:500,rotation:0,hasTextLayer:true}]}}]};
}
test("K62 without explicit elevations is NOT automatically placed",()=>{
 const result=automaticEntries(rows("Колонна К62 по осям 1-А"));
 assert.equal(result.entries.length,0);
 assert.ok(result.review.some(x=>x.mark==="К62"));
});
test("K62 explicit Z0 and Z1 parser returns millimetres (synthetic fixture)",()=>{
 const text="К62 низ +0,000 м верх +10,020 м";
 assert.equal(level(text,0),0);
 assert.equal(level(text,1),10020);
});
test("K62 old model Z=10.02 is not enough to infer bottom or height",()=>{
 assert.equal(level("К62 z=10.02",0),null);
 assert.equal(level("К62 z=10.02",1),null);
});

test("K62 rejects a lone upper level without an explicit bottom",()=>{
 const text="К62 верх +10,020 м";
 assert.equal(level(text,0),null);
 assert.equal(level(text,1),10020);
});
test("K62 rejects conflicting bottom elevations",()=>{
 const text="К62 низ +0,000 м; низ +0,150 м; верх +10,020 м";
 assert.equal(level(text,0),null);
});
