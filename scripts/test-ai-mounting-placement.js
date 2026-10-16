"use strict";
/* Unit tests for native SQLite transaction layer, without Electron dependency. */
const assert=require("node:assert/strict");
const {createService}=require("../src/ai-mounting-placement");
const SHA="a".repeat(64);
const records=new Map();let nextId=100,failAt=0,writes=0;
const clone=x=>JSON.parse(JSON.stringify(x));
function add(section,id,record_type,data={},title="",parent_id=null){
 const row={id,object_id:1,section_key:section,record_type,title,parent_id,data:clone(data)};
 records.set(id,row);return row
}
const db={
 getObject:id=>Number(id)===1?{id:1}:null,
 listEntity:(id,section)=>[...records.values()].filter(x=>x.object_id===id&&x.section_key===section).map(clone),
 getEntity:(id,section,rowId)=>clone([...records.values()].find(x=>
  x.object_id===id&&x.section_key===section&&x.id===Number(rowId))||null),
 createEntity:(id,section,payload)=>{
  if(section==="scheme"&&++writes===failAt)throw Error("simulated disk failure");
  return clone(add(section,nextId++,payload.record_type,payload.data,payload.title,payload.parent_id))
 },
 deleteEntity:(id,section,rid)=>{const row=db.getEntity(id,section,rid);if(!row)return false;records.delete(Number(rid));return true},
 updateEntity:(id,section,rid,payload)=>{const row=db.getEntity(id,section,rid);if(!row)return null;
  return clone(add(section,row.id,payload.record_type,payload.data,payload.title,payload.parent_id))},
 listRecordChildren:id=>[...records.values()].filter(x=>x.object_id===id&&x.parent_id!=null).map(clone),
 transaction:fn=>{
  const snap=clone([...records]),oldNext=nextId;
  try{return fn()}catch(error){records.clear();for(const row of snap)records.set(row[0],row[1]);
   nextId=oldNext;throw error}
 }
};
const idGrid=20;
add("scheme",idGrid,"scheme_grid",{entity_type:"grid",
 axes_x:["1","2","3"],x_spans_mm:[6000,6000],
 axes_y:["А","Б","В"],y_spans_mm:[6000,6000]});
add("work-types",21,"item",{scheme_enabled:true,project_code:"PK-01"});
add("marks",22,"item",{mark:"К62",name:"Колонна",qty:2,work_type_id:21,project_code:"PK-01"},"К62");
add("ai-documents",23,"document",{sha256:SHA,archived:false},"Монтажная схема");
add("ai-pdf-index",24,"pdf_text_index",{source:{documentId:23,sha256:SHA},
 pages:[{page:1,hasTextLayer:true}]},"Лист 1");
const candidate=(axis,overrides={})=>({
 mark:"К62",markId:22,projectCode:"PK-01",type:"column",
 origin:"text_layer",sheetType:"plan",axisX:axis,axisY:"Б",
 z0Mm:-400,z1Mm:9705,source:{documentId:23,sha256:SHA,page:1},
 evidence:["К62 на монтажном плане","Разрез по оси Б"],...overrides
});
const service=createService({database:db});
const original=service.inventory(1);
assert.equal(original.positions,1);
assert.equal(original.totalInstances,2);
assert.equal(original.unplaced,2);
const first=service.preview(1,[candidate("1"),candidate("2")]);
assert.equal(first.ready.length,2);
assert.equal(first.skipped.length,0);
assert.equal(first.existing,0);
assert.equal(service.preview(1,[candidate("1"),candidate("1")]).ready.length,1);
const outside=service.preview(1,[candidate("1",{mark:"К90"})]);
assert.equal(outside.ready.length,0);
assert.match(outside.skipped[0].reason,/не совпадает/);
const missingZ=service.preview(1,[candidate("1",{z0Mm:null})]);
assert.equal(missingZ.ready.length,0);
assert.match(missingZ.skipped[0].reason,/Не указано/);
const noPdf=service.preview(1,[candidate("1",{source:{documentId:23,sha256:"b".repeat(64),page:1}})]);
assert.equal(noPdf.ready.length,0);
const wrongCipher=service.preview(1,[candidate("1",{projectCode:"ПК-02"})]);
assert.equal(wrongCipher.ready.length,0);
const diag=service.preview(1,[candidate("1",{axisX:"999"})]);
assert.equal(diag.ready.length,0);
const detail=service.preview(1,[candidate("1",{sheetType:"detail"})]);
assert.equal(detail.ready.length,0);
const apply=service.apply(1,[candidate("1"),candidate("2")],first.token);
assert.equal(apply.created,2);
assert.equal(service.inventory(1).placed,2);
const instanceIds=db.listEntity(1,"scheme").filter(x=>x.record_type==="scheme_column")
 .map(x=>x.data.ai_instance_id);
assert.equal(new Set(instanceIds).size,2,"physical instances have unique stable IDs");
assert.equal(db.listEntity(1,"scheme").filter(x=>x.record_type==="scheme_column").length,2);
assert.equal(db.listEntity(1,"ai-placement-operations").length,1);
assert.throws(()=>service.apply(1,[candidate("1")],first.token),/изменились/);
const repeat=service.preview(1,[candidate("1"),candidate("2")]);
assert.equal(repeat.ready.length,0);
assert.equal(repeat.skipped.length,2);
const undo=service.undo(1,apply.operationId);
assert.equal(undo.undone,2);
assert.equal(db.listEntity(1,"scheme").filter(x=>x.record_type==="scheme_column").length,0);
assert.equal(db.listEntity(1,"ai-placement-operations")[0].data.status,"undone");
assert.throws(()=>service.undo(1,apply.operationId),/не найдена/);
const second=service.preview(1,[candidate("1"),candidate("2")]);
const result=service.apply(1,[candidate("1"),candidate("2")],second.token);
const edited= db.listEntity(1,"scheme").find(x=>x.record_type==="scheme_column");
const value={...edited.data,z0_mm:-300};
db.updateEntity(1,"scheme",edited.id,{record_type:edited.record_type,title:edited.title,data:value});
assert.throws(()=>service.undo(1,result.operationId),/вручную изменён/);
assert.equal(db.listEntity(1,"scheme").filter(x=>x.record_type==="scheme_column").length,2);
assert.equal(db.listEntity(1,"ai-placement-operations").at(-1).data.status,"applied");
// Atomicity: if any SQLite insert fails, no placements or audit rows survive.
for(const row of db.listEntity(1,"scheme").filter(x=>x.record_type==="scheme_column"))db.deleteEntity(1,"scheme",row.id);
const before=db.listEntity(1,"ai-placement-operations").length;
writes=0;failAt=2;
const planned=service.preview(1,[candidate("1"),candidate("2")]);
assert.throws(()=>service.apply(1,[candidate("1"),candidate("2")],planned.token),/simulated disk failure/);
failAt=0;
assert.equal(db.listEntity(1,"scheme").filter(x=>x.record_type==="scheme_column").length,0);
assert.equal(db.listEntity(1,"ai-placement-operations").length,before);
console.log("AI placement: closed register, mark quantity, axes, source SHA, atomicity, undo PASS");
