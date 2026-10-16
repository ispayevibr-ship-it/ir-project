"use strict";
const assert=require("node:assert/strict");
const {createReset}=require("../src/scheme-reset");
const objects=new Set([1,2]),rows=new Map(),clone=x=>JSON.parse(JSON.stringify(x));
let failId=null;
const db={
 getObject:id=>objects.has(Number(id))?{id:Number(id)}:null,
 listEntity:(id,section)=>[...rows.values()].filter(x=>x.object_id===id&&x.section_key===section),
 listRecordChildren:id=>[...rows.values()].filter(x=>x.object_id===id&&x.parent_id!=null)
  .map(x=>({id:x.id,section_key:x.section_key,parent_id:x.parent_id})),
 deleteEntity:(id,section,rowId)=>{
  if(rowId===failId)throw Error("SQLite failure");
  const x=rows.get(rowId);if(!x||x.object_id!==id||x.section_key!==section)return false;
  rows.delete(rowId);return true
 },
 transaction:callback=>{
  const before=new Map([...rows].map(([i,x])=>[i,clone(x)]));
  try{return callback()}catch(e){rows.clear();for(const [i,x] of before)rows.set(i,x);throw e}
 }
};
function add(id,obj,section="scheme",type="scheme_column",data={}){
 rows.set(id,{id,object_id:obj,section_key:section,record_type:type,data})
}
add(11,1);add(12,1);add(13,1,"scheme","scheme_grid",{entity_type:"grid"});
add(14,1,"scheme","scheme_view",{entity_type:"scheme_view"});
add(15,1,"marks","mark",{mark:"К60"});
add(16,1,"reports","daily",{});
add(17,1,"ai-review-history","review_change",{analysisId:4046});
add(18,2);
const reset=createReset({database:db}),a=reset.snapshot(1);
assert.equal(a.count,2);
assert.throws(()=>reset.clear(1,{...a,confirmation:"wrong"}),/ОЧИСТИТЬ/);
assert.throws(()=>reset.clear(2,{expectedCount:a.count,expectedFingerprint:a.fingerprint,confirmation:"ОЧИСТИТЬ"}),/изменились/);
assert.throws(()=>reset.clear(3,{expectedCount:a.count,expectedFingerprint:a.fingerprint,confirmation:"ОЧИСТИТЬ"}),/не найден/);
add(19,1);
assert.throws(()=>reset.clear(1,{expectedCount:a.count,expectedFingerprint:a.fingerprint,confirmation:"ОЧИСТИТЬ"}),/изменились/);
const fresh=reset.snapshot(1);
rows.set(40,{id:40,object_id:1,section_key:"ai-review-history",
 record_type:"review_change",parent_id:11,data:{revision:2}});
assert.throws(()=>reset.clear(1,{
 expectedCount:fresh.count,expectedFingerprint:fresh.fingerprint,confirmation:"ОЧИСТИТЬ"
}),/связанную запись/);
rows.delete(40);
failId=12;
assert.throws(()=>reset.clear(1,{expectedCount:fresh.count,expectedFingerprint:fresh.fingerprint,confirmation:"ОЧИСТИТЬ"}),/SQLite failure/);
assert.equal(reset.snapshot(1).count,3,"partial reset rolled back");
failId=null;
const result=reset.clear(1,{expectedCount:fresh.count,expectedFingerprint:fresh.fingerprint,confirmation:"ОЧИСТИТЬ"});
assert.equal(result.cleared,3);
assert.equal(reset.snapshot(1).count,0);
for(const id of [13,14,15,16,17,18])assert(rows.has(id),"unrelated records preserved: "+id);
assert.equal(reset.clear(1,{expectedCount:0,expectedFingerprint:reset.snapshot(1).fingerprint,confirmation:"ОЧИСТИТЬ"}).cleared,0);
console.log("Scheme reset: all placements, stale confirmation, rollback, mark/report/grid/history preservation PASS");

const fs=require("node:fs");
const schemePage=fs.readFileSync("src/scheme-page.js","utf8");
const main=fs.readFileSync("main.js","utf8");
const preload=fs.readFileSync("preload.js","utf8");
assert(schemePage.includes('id="schemeResetAll"'));
assert(schemePage.includes("expectedFingerprint:preview.fingerprint"));
assert(schemePage.includes('entered!=="ОЧИСТИТЬ"'));
assert(main.includes('ipcMain.handle("scheme:reset"'));
assert(preload.includes('ipcRenderer.invoke("scheme:reset"'));
