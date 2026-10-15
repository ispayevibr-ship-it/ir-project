"use strict";
/* Deferred final-acceptance contract: do not run during WIP development. */
const assert=require("node:assert/strict");
const {createDrawingRevisions}=require("../src/ai-drawing-revisions");
const {createMarkQuantities}=require("../src/ai-mark-quantities");
function fixture(){
 let sequence=10,objects=new Set([1,2]);const table=new Map(),clone=x=>x==null?null:JSON.parse(JSON.stringify(x));
 const key=(obj,section,id)=>[obj,section,id].join("|");
 const create=(obj,section,input)=>{
  const row={id:++sequence,object_id:obj,section_key:section,record_type:input.record_type,
   title:input.title||"",parent_id:input.parent_id||null,data:clone(input.data||{}),
   created_at:"2026-10-15",updated_at:"2026-10-15"};
  table.set(key(obj,section,row.id),row);return clone(row)
 };
 const db={
  getObject:id=>objects.has(Number(id))?{id:Number(id)}:null,
  getEntity:(o,s,id)=>clone(table.get(key(Number(o),s,Number(id)))),
  listEntity:(o,s)=>[...table.values()].filter(x=>x.object_id===Number(o)&&x.section_key===s).map(clone),
  createEntity:(o,s,input)=>create(o,s,input),
  updateEntity:(o,s,id,input)=>{
   const k=key(Number(o),s,Number(id)),old=table.get(k);
   if(!old)return null;
   const row={...old,title:input.title||old.title,
    record_type:input.record_type,parent_id:input.parent_id||null,data:clone(input.data)};
   table.set(k,row);return clone(row)
  },
  deleteEntity:(o,s,id)=>table.delete(key(Number(o),s,Number(id))),
  transaction:fn=>{
   const old=new Map([...table].map(([k,v])=>[k,clone(v)])),counter=sequence;
   try{return fn()}catch(e){table.clear();for(const [k,v] of old)table.set(k,v);sequence=counter;throw e}
  }
 };
 return{db,create}
}
(()=>{
 const {db,create}=fixture(),shaA="a".repeat(64),shaB="b".repeat(64),shaC="c".repeat(64);
 const old=create(1,"ai-documents",{record_type:"document",title:"KMD original",
  data:{kind:"КМД",extension:".pdf",original_name:"Original.pdf",sha256:shaA}});
 const newer=create(1,"ai-documents",{record_type:"document",title:"KMD change 2",
  data:{kind:"КМД",extension:".pdf",original_name:"Change2.pdf",sha256:shaB}});
 const km=create(1,"ai-documents",{record_type:"document",title:"KM",
  data:{kind:"КМ",extension:".pdf",original_name:"KM.pdf",sha256:shaC}});
 const gone=new Set(),tampered=new Set(),indexed=[
  {id:1,documentId:old.id,sourceSha256:shaA,pages:[{page:1},{page:2}]},
  {id:2,documentId:newer.id,sourceSha256:shaB,pages:[{page:1}]},
  {id:3,documentId:km.id,sourceSha256:shaC,pages:[{page:1}]}
 ];
 const docs={list:o=>o===1?[old,newer,km].map(d=>({
  id:d.id,name:d.data.original_name,kind:d.data.kind,ext:".pdf",
  exists:!gone.has(d.id),sha256:d.data.sha256
 })):[],verify:(o,documentId)=>o===1&&!gone.has(documentId)&&!tampered.has(documentId)};
 const pdf={list:o=>o===1?indexed:[]};
 const rev=createDrawingRevisions({database:db,documents:docs,pdfIndex:pdf,
  clock:()=>"2026-10-15T14:00:00Z"});
 const kmdInput=(documentId,page,sha256)=>({documentId,page,sha256,kind:"КМД"});
 assert.equal(rev.sourceState(1,kmdInput(old.id,2,shaA)).state,"uncontrolled");
 assert.equal(rev.sourceState(1,{documentId:old.id,sha256:shaA,kind:"КМД",page:null}).state,"invalid",
  "missing page cannot count even without an active drawing set");
 assert.throws(()=>rev.createSet(1,{kind:"КМД",issue:"Изм.0",label:"Основной КМД"},{role:"guest"}),/инженер/);
 const initial=rev.createSet(1,{kind:"КМД",issue:"Изм.0",label:"Основной КМД"},{role:"engineer"});
 assert.throws(()=>rev.addSheets(1,initial.id,[{documentId:km.id,page:1,sheetCode:"KM-1"}],{role:"engineer"}),/КМД/);
 assert.throws(()=>rev.addSheets(1,initial.id,[
  {documentId:old.id,page:1,sheetCode:"КМД-01"},
  {documentId:old.id,page:2,sheetCode:"КМД-01"}],{role:"engineer"}),/повторяется/);
 assert.deepEqual(rev.addSheets(1,initial.id,[
  {documentId:old.id,page:1,sheetCode:"КМД-01"},
  {documentId:old.id,page:2,sheetCode:"КМД-02"}],{role:"engineer"}).added,2);
 assert.throws(()=>rev.activate(1,initial.id,1,{role:"engineer"}),/устарела/);
 let set=rev.list(1).find(s=>s.id===initial.id);
 assert.equal(rev.activate(1,initial.id,set.revision,{role:"engineer"}).status,"active");
 assert.equal(rev.isCurrent(1,kmdInput(old.id,2,shaA)),true);
 assert.throws(()=>rev.addSheets(1,initial.id,[{documentId:newer.id,page:1,sheetCode:"КМД-02"}],{role:"engineer"}),/чернового/);
 const qty=createMarkQuantities({database:db,revisions:rev});
 const q=qty.save(1,null,{expectedRevision:0,mark:"К41",cipher:"041",
  secondaryCipher:"",quantity:4,documentId:old.id,page:2,
  specPosition:"Поз. К41",drawingRevision:"Изм.0",status:"confirmed",comment:"Сверено"},
 {role:"engineer"});
 assert.equal(q.sourceValid,true);
 assert.equal(qty.summary(1).confirmedPieces,4);
 const second=rev.createSet(1,{kind:"КМД",issue:"Изм.2",label:"Комплект изменения"},{role:"engineer"});
 rev.addSheets(1,second.id,[
  {documentId:old.id,page:1,sheetCode:"КМД-01"},
  {documentId:newer.id,page:1,sheetCode:"КМД-02"}
 ],{role:"engineer"});
 const checkedRow=db.createEntity(1,"ai-kmd-reference-rows",{
  record_type:"kmd_reference",title:"К41 эталон",
  data:{setId:initial.id,sheetId:rev.getSheets(1,initial.id)[0].id,
   type:"mark",mark:"К41",cipher:"041",quantity:4,
   source:kmdInput(old.id,1,shaA),status:"confirmed"}
 });
 const checkedSheet=db.createEntity(1,"ai-kmd-reference-checks",{
  record_type:"kmd_sheet_check",title:"Проверен лист",
  data:{setId:initial.id,sheetId:rev.getSheets(1,initial.id)[0].id,
   documentId:old.id,sha256:shaA,page:1,status:"sealed",
   reviewedEntireSheet:true,reviewedBy:"engineer"}
 });
 const before=rev.previewActivation(1,second.id);
 assert(before.affected.some(x=>x.section==="ai-kmd-reference-rows"&&x.id===checkedRow.id),
  "new drawing set archives signed reference even when original PDF is unchanged");
 assert(before.affected.some(x=>x.section==="ai-kmd-reference-checks"&&x.id===checkedSheet.id));
 assert.equal(before.affectedCount>=1,true);
 assert.equal(before.invalidPages,0);
 assert.equal(rev.isCurrent(1,kmdInput(old.id,2,shaA)),true,"draft has no effect");
 set=rev.list(1).find(s=>s.id===second.id);
 const activated=rev.activate(1,second.id,set.revision,{role:"admin"});
 assert.equal(activated.previousSetId,initial.id);
 assert.equal(rev.list(1).find(s=>s.id===initial.id).status,"superseded");
 assert.equal(rev.isCurrent(1,kmdInput(old.id,2,shaA)),false);
 assert.equal(rev.isCurrent(1,kmdInput(newer.id,1,shaB)),true);
 assert.equal(rev.isCurrent(1,kmdInput(old.id,1,shaA)),true);
 assert.equal(qty.summary(1).confirmedPieces,0,"old quantities cannot count toward current set");
 assert.throws(()=>qty.save(1,q.id,{expectedRevision:1,mark:"К41",cipher:"041",
  secondaryCipher:"",quantity:4,documentId:old.id,page:2,specPosition:"Поз. К41",
  drawingRevision:"Изм.0",status:"confirmed",comment:"Повторная проверка"},
 {role:"engineer"}),/Подтверждение запрещено/,"superseded PDF cannot be newly confirmed");
 assert.equal(qty.list(1)[0].status,"confirmed","old decision stays in audit");
 assert.equal(qty.list(1)[0].sourceValid,false);
 assert.equal(rev.impact(1).outdated>=1,true);
 const previousReference=rev.impact(1).records.filter(x=>
  x.section==="ai-kmd-reference-rows"||x.section==="ai-kmd-reference-checks");
 assert.equal(previousReference.length,2);
 assert(previousReference.every(x=>x.outdated),
  "source matching alone cannot reactivate signed references from an older set");
 assert.equal(rev.history(1,initial.id).length>=3,true);
 assert.equal(rev.list(2).length,0);
 assert.throws(()=>rev.history(2,initial.id),/не найден/);
 gone.add(newer.id);
 assert.equal(rev.sourceState(1,kmdInput(newer.id,1,shaB)).state,"missing");
 assert.equal(rev.list(1).find(s=>s.id===second.id).sheets.some(s=>!s.valid),true);
 tampered.add(old.id);
 assert.equal(rev.sourceState(1,kmdInput(old.id,1,shaA)).state,"missing",
  "stored SHA cannot conceal altered on-disk bytes");
 assert.equal(rev.list(1).find(s=>s.id===second.id).sheets.some(s=>!s.valid),true);
 console.log("Deferred acceptance: explicit set activation, partial replacement, source invalidation, atomic audit, no data removal");
})();
