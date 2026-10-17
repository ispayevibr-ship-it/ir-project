"use strict";
const assert=require("node:assert/strict");
const {automaticEntries,level}=require("../src/ai-mounting-auto");
const sha="a".repeat(64);
function fixture(texts){
 return {scheme:[{id:1,record_type:"scheme_grid",data:{axes_x:["101","102"],axes_y:["Р","С"],x_spans_mm:[6000],y_spans_mm:[9000]}}],
  marks:[{id:2,title:"К62",data:{mark:"К62",name:"Колонна",qty:2,work_type_id:3}}],
  "work-types":[{id:3,data:{scheme_enabled:true}}],
  "ai-documents":[{id:4,record_type:"document",title:"План колонн",data:{sha256:sha}}],
  "ai-pdf-index":[{id:5,record_type:"pdf_text_index",data:{source:{documentId:4,sha256:sha,name:"План колонн"},pages:[{
   page:1,text:"План колонн "+texts.join(" "),fragments:texts.map((text,i)=>({text,x:10,y:200-i*30,width:250,height:10}))
  }]}}]};
}
const a="Колонна К62 оси 101/Р отм. низа -0,400 отм. верха +9,595";
const b="Колонна К62 оси 102/Р низ -0.400 верх +9.595";
assert.equal(automaticEntries(fixture([a,a.replace("9,595","8,595")])).entries.length,0,"conflicting elevations on same axis");
let rows=fixture([a,b]),r=automaticEntries(rows);
assert.equal(r.entries.length,2);
assert.equal(r.entries[0].axisX,"101");assert.equal(r.entries[1].axisX,"102");
assert.equal(r.entries[0].z0Mm,-400);assert.equal(r.entries[0].z1Mm,9595);
assert.deepEqual(r.entries[0].source.regions[0].fragmentIds,[0]);
assert.equal(r.stats.pages,1);
assert.equal(automaticEntries(fixture([a,a])).entries.length,1,"duplicate labels do not duplicate columns");
rows=fixture([a,b]);rows.marks[0].data.qty=1;
assert.equal(automaticEntries(rows).entries.length,0,"quantity conflict blocks every conflicting instance");
for(const text of ["К62",a.replace("оси 101/Р",""),a.replace("отм. верха +9,595",""),
 a+" смещение от оси 200 мм","Не устанавливать "+a,a.replace("К62","К62 К63"),a+" отм. верха +8,000",a+" оси 102/Р",
 a.replace("-0,400","0"),a.replace("К62","К620")]){
 assert.equal(automaticEntries(fixture([text])).entries.length,0,text);
}
assert.equal(level("низ 400 мм",0),400);assert.equal(level("верх 10 м",1),10000);
assert.equal(level("низ 400",0),null);
rows=fixture([a]);rows["ai-pdf-index"][0].data.source.sha256="stale";
assert.equal(automaticEntries(rows).entries.length,0);
rows=fixture([a]);rows["ai-documents"][0].data.archived=true;
assert.equal(automaticEntries(rows).entries.length,0);
for(const flag of ["uncertainEncoding","truncated"]){
 rows=fixture([a]);rows["ai-pdf-index"][0].data.pages[0][flag]=true;
 assert.equal(automaticEntries(rows).entries.length,0,flag);
}
rows=fixture([a]);rows["ai-pdf-index"][0].data.source.name="Колонна К62";
rows["ai-pdf-index"][0].data.pages[0].text=a;
assert.equal(automaticEntries(rows).entries.length,0,"fabrication detail is not a montage plan");
rows=fixture([a]);rows.marks.push({...rows.marks[0],id:99});
assert.equal(automaticEntries(rows).entries.length,0,"ambiguous register IDs");
rows=fixture([a]);rows.scheme.push({id:9,record_type:"scheme_column",data:{entity_type:"column",mark_id:2,geometry_type:"column",absolute_x_mm:0,absolute_y_mm:0,z0_mm:-400,z1_mm:9595}});
assert.equal(automaticEntries(rows).entries.length,0,"already placed instance is not repeated");
rows=fixture(["Балка Б1 начало 101/Р конец 102/С Z0 +5.000 Z1 +6.000"]);
rows.marks=[{id:2,title:"Б1",data:{mark:"Б1",name:"Балка",qty:1,work_type_id:3}}];
r=automaticEntries(rows);assert.equal(r.entries.length,1);assert.equal(r.entries[0].endAxisX,"102");
// Adjacent fragments on one baseline are joined; another line is not borrowed.
rows=fixture([]);rows["ai-pdf-index"][0].data.pages[0].fragments=[
 {text:"К62",x:10,y:100,width:20,height:10},
 {text:"оси 101/Р низ -0.400 верх +9.595",x:35,y:100,width:200,height:10}
];assert.equal(automaticEntries(rows).entries.length,1);
rows["ai-pdf-index"][0].data.pages[0].fragments[1].y=80;
assert.equal(automaticEntries(rows).entries.length,0);
rows=fixture([a,a.replace("К62","К63")]);
rows.marks.push({id:99,title:"К63",data:{mark:"К63",name:"Колонна",qty:1,work_type_id:3}});
assert.equal(automaticEntries(rows).entries.length,0,"two marks at one location remain unresolved");
rows=fixture([a.toLowerCase()]);assert.equal(automaticEntries(rows).entries[0].axisY,"Р");
console.log("Automatic placement: per-instance annotations, arbitrary grid, heights, source, counts and ambiguity PASS");
