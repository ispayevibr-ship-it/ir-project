"use strict";
const assert=require("node:assert/strict");
const {createDraftService,identity,parseValues}=require("../src/ai-mounting-drafts");
const SHA="d".repeat(64);
let writes=0,failHistory=false,next=100;
const rows=new Map(),clone=x=>JSON.parse(JSON.stringify(x));
function add(id,section,type,title,data){
 const row={id,object_id:1,section_key:section,record_type:type,title,data:clone(data)};
 rows.set(id,row);return clone(row)
}
add(10,"marks","item","К62",{mark:"К62",qty:4,work_type_id:3});
add(20,"ai-documents","document","К62.pdf",{sha256:SHA,archived:false});
add(21,"ai-pdf-index","pdf_text_index","Индекс К62",{
 source:{documentId:20,sha256:SHA},pages:[{page:1},{page:2}]
});
const db={
 getObject:id=>id===1?{id:1}:null,
 listEntity:(id,section)=>[...rows.values()].filter(r=>
  r.object_id===id&&r.section_key===section).map(clone),
 createEntity:(id,section,payload)=>{
  if(failHistory&&section==="ai-mounting-draft-history")throw Error("simulated IO failure");
  writes++;return add(next++,section,payload.record_type,payload.title,payload.data)
 },
 updateEntity:(id,section,rid,payload)=>{
  const old=rows.get(Number(rid));
  if(!old||old.section_key!==section)throw Error("Missing draft");
  writes++;return add(old.id,section,payload.record_type,payload.title,payload.data)
 },
 transaction:fn=>{
  const original=clone([...rows]),before=next;
  try{return fn()}catch(error){
   rows.clear();for(const [id,row] of original)rows.set(id,row);
   next=before;throw error
  }
 }
};
const service=createDraftService({database:db,verifyDocument:(_id,docId)=>docId===20});
const candidate=(page=1)=>({mark:"К62",type:"column",origin:"text_layer",
 source:{documentId:20,page,sha256:SHA}});
const input={type:"column",axisX:"3",axisY:"Г",endAxisX:"",
 endAxisY:"",z0Mm:-400,z1Mm:9705};
assert.notEqual(identity(candidate(1)).key,identity(candidate(2)).key);
assert.deepEqual(parseValues({...input,z0Mm:"−400"}),input);
assert.throws(()=>parseValues({...input,z0Mm:NaN}),/Отметка/);
assert.deepEqual(service.list(1),[]);
const v1=service.save(1,{candidate:candidate(),values:input});
assert.equal(v1.revision,1);
assert.equal(v1.status,"requires_review");
assert.equal(service.list(1).length,1);
assert.equal(service.list(1)[0].stale,false);
const current=service.save(1,{candidate:candidate(),
 values:{...input,axisX:"2",z1Mm:9700},expectedRevision:1});
assert.equal(current.revision,2);
assert.equal(service.list(1)[0].values.axisX,"2");
assert.equal(db.listEntity(1,"ai-mounting-draft-history").length,2);
assert.throws(()=>service.save(1,{candidate:candidate(),
 values:input,expectedRevision:1}),/другом окне/);
assert.throws(()=>service.save(1,{candidate:candidate(3),
 values:input}),/Нет индекса PDF/);
assert.throws(()=>service.save(1,{candidate:{...candidate(),mark:"К99"},
 values:input}),/отсутствует/);
assert.throws(()=>service.save(1,{candidate:{...candidate(),
 source:{documentId:20,page:1,sha256:"a".repeat(64)}},values:input}),/изменён/);
assert.equal(db.listEntity(1,"scheme").length,0,"saving drafts must never place any steel");
assert.equal(db.listEntity(1,"ai-mounting-draft-history").length,2);
failHistory=true;
assert.throws(()=>service.save(1,{candidate:candidate(),values:input,expectedRevision:2}),/simulated IO/);
failHistory=false;
assert.equal(service.list(1)[0].revision,2,"draft and revision write are atomic");
assert.equal(db.listEntity(1,"ai-mounting-draft-history").length,2);
rows.get(20).data.archived=true;
assert.equal(service.list(1)[0].stale,true);
assert.throws(()=>service.save(1,{candidate:candidate(),values:input,expectedRevision:2}),/архивирован/);
console.log("AI montage drafts: source identity, revision, stale PDF, history and rollback PASS");
