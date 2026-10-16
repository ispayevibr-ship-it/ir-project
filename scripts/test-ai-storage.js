"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {createStore}=require("../src/ai-document-store");
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-doc-test-"));
 let source=path.join(tmp,"K41 KMD.pdf");
 fs.writeFileSync(source,"%PDF-1.4\nReal fixture marker only, not AI recognition");
 const rows=new Map(),objects=new Set([1,2]);let counter=1,dialogCalls=0,opened="",failDeleteIndex=false;
 const db={
  getObject:id=>objects.has(Number(id))?{id:Number(id)}:null,
  listEntity:(id,key)=>[...rows.values()].filter(x=>x.object_id===id&&x.section_key===key),
  getEntity:(id,key,recordId)=>[...rows.values()].find(x=>x.object_id===id&&x.section_key===key&&x.id===recordId)||null,
  createEntity:(id,key,value)=>{
   const row={id:counter++,object_id:id,section_key:key,record_type:value.record_type,title:value.title,data:value.data,
    created_at:"2026-10-15 13:00"};rows.set(row.id,row);return row
  },
  deleteEntity:(id,key,recordId)=>{
   if(key==="ai-pdf-index"&&failDeleteIndex)throw Error("Simulated SQLite index failure");
   const row=db.getEntity(id,key,recordId);if(!row)return false;rows.delete(row.id);return true
  },
  transaction:fn=>{
   const snapshot=new Map([...rows].map(([key,value])=>[key,JSON.parse(JSON.stringify(value))]));
   try{return fn()}catch(error){
    rows.clear();for(const [key,value] of snapshot)rows.set(key,value);
    throw error
   }
  }
 };
 const store=createStore({getUserDataPath:()=>tmp,database:db,getWindow:()=>null,
  dialog:{showOpenDialog:async()=>{dialogCalls++;return{canceled:false,filePaths:[source]}}},
  shell:{openPath:async(file)=>{opened=file;return""}}
 });
 try{
  assert.deepEqual(store.list(1),[]);
  assert.throws(()=>store.list("../1"),/Объект/);
  const first=await store.select(1,"КМД");assert.equal(dialogCalls,1);
  assert.equal(first.imported.length,1);
  assert.equal(first.imported[0].kind,"КМД");
  assert.match(first.imported[0].sha256,/^[a-f0-9]{64}$/);
  assert.equal(first.imported[0].exists,true);
  assert.equal(first.imported[0].status,"Не распознано");
  assert.equal(store.list(2).length,0,"other objects must be isolated");
  const duplicate=await store.select(1,"КМД");
  assert.equal(duplicate.imported.length,0);assert.equal(duplicate.skipped.length,1);
  assert.equal(store.list(1).length,1);
  const id=first.imported[0].id;
  assert.rejects(()=>store.open(2,id),/не найден/);
  await store.open(1,id);assert(opened.startsWith(path.join(tmp,"ir-project-ai","objects","1")+path.sep));
  assert.equal(fs.readFileSync(opened,"utf8"),fs.readFileSync(source,"utf8"));
  const row=db.getEntity(1,"ai-documents",id);
  assert(!row.data.stored_name.includes("K41"),"private source filename isn't the storage key");
  const history=db.createEntity(1,"ai-mark-quantity-history",{
   record_type:"quantity_change",title:"Historic evidence",
   data:{previous:{source:{documentId:id,sha256:first.imported[0].sha256}}}
  });
  assert.throws(()=>store.remove(1,id),/Нельзя удалить исходный файл/,
   "original PDF remains when engineering history refers to its ID");
  assert(fs.existsSync(opened),"source bytes must be preserved after blocked deletion");
  db.deleteEntity(1,"ai-mark-quantity-history",history.id);
  const baseline=db.createEntity(1,"ai-kmd-reference-rows",{
   record_type:"kmd_reference",title:"Engineer's source position",
   data:{source:{documentId:id,sha256:first.imported[0].sha256}}
  });
  assert.throws(()=>store.remove(1,id),/Нельзя удалить исходный файл/,
   "a signed KMD reference blocks deletion of its original drawing");
  db.deleteEntity(1,"ai-kmd-reference-rows",baseline.id);
  const approval=db.createEntity(1,"ai-kmd-reference-checks",{
   record_type:"kmd_sheet_check",title:"Drawing approval",
   data:{documentId:id,sha256:first.imported[0].sha256}
  });
  assert.throws(()=>store.remove(1,id),/Нельзя удалить исходный файл/,
   "per-sheet signoff prevents removal of its originating PDF");
  db.deleteEntity(1,"ai-kmd-reference-checks",approval.id);
  // An indexed but never analyzed PDF can be removed with its disposable index.
  const technicalIndex=db.createEntity(1,"ai-pdf-index",{
   record_type:"pdf_text_index",title:"PDF text cache",
   data:{source:{documentId:id,sha256:first.imported[0].sha256},
    extraction:"text_layer",generatedByAI:false,pages:[{page:1,text:"K41"}]}
  });
  assert.throws(()=>store.remove(2,id),/Чертёж не найден/,"other object cannot delete source");
  const laterEvidence=db.createEntity(1,"ai-analysis",{
   record_type:"image_analysis",title:"Qwen candidate",
   data:{source:{documentId:id,sha256:first.imported[0].sha256},verification:"requires_review"}
  });
  assert.throws(()=>store.remove(1,id),/ai-analysis/,"unreviewed AI drafts are never silently discarded");
  assert(db.getEntity(1,"ai-pdf-index",technicalIndex.id));
  const preview=store.removalImpact(1,id);
  assert.equal(preview.canDelete,true);
  assert.deepEqual(preview.unreviewedAnalysisIds,[laterEvidence.id]);
  assert.deepEqual(preview.technicalIndexIds,[technicalIndex.id]);
  assert.throws(()=>store.remove(1,id,{discardUnreviewed:true}),/Список связанных анализов изменился/);
  assert.throws(()=>store.remove(1,id,{discardUnreviewed:true,expectedAnalysisIds:[999]}),
   /Список связанных анализов изменился/,"stale confirmation cannot wipe new analysis records");
  // A reviewed analysis or anything referring to that analysis's ID must block deletion.
  const confirmed=db.createEntity(1,"ai-analysis",{
   record_type:"image_analysis",title:"Reviewed K41",
   data:{source:{documentId:id,sha256:first.imported[0].sha256},
    review:{status:"confirmed",revision:1},verification:"requires_review"}
  });
  assert.equal(store.removalImpact(1,id).canDelete,false);
  assert.throws(()=>store.remove(1,id,{discardUnreviewed:true,expectedAnalysisIds:[laterEvidence.id]}),
   /ai-analysis/);
  db.deleteEntity(1,"ai-analysis",confirmed.id);
  // An initialized review object without a decision is still an unreviewed draft.
  const initialized=db.createEntity(1,"ai-analysis",{
   record_type:"image_analysis",title:"Old draft with initialized review",
   data:{source:{documentId:id,sha256:first.imported[0].sha256},
    verification:"requires_review",
    review:{status:"requires_review",revision:0,reviewedAt:null,reviewedBy:null,marks:[]}}
  });
  assert.equal(store.removalImpact(1,id).canDelete,true);
  assert(store.removalImpact(1,id).unreviewedAnalysisIds.includes(initialized.id),
   "initialized, never-reviewed candidate is included in explicit deletion preview");
  db.deleteEntity(1,"ai-analysis",initialized.id);
  const decided=db.createEntity(1,"ai-analysis",{
   record_type:"image_analysis",title:"Already reviewed but currently awaiting review",
   data:{source:{documentId:id,sha256:first.imported[0].sha256},
    verification:"requires_review",
    review:{status:"requires_review",revision:1}}
  });
  assert.equal(store.removalImpact(1,id).canDelete,false,
   "previous engineering decision prevents deletion even if current status requires review");
  assert.match(store.removalImpact(1,id).protectedRecords[0].reason,/ревизия/);
  db.deleteEntity(1,"ai-analysis",decided.id);
  const rejected=db.createEntity(1,"ai-analysis",{
   record_type:"image_analysis",title:"Rejected engineering claim",
   data:{source:{documentId:id,sha256:first.imported[0].sha256},
    verification:"requires_review",review:{status:"rejected",revision:1}}
  });
  assert.equal(store.removalImpact(1,id).canDelete,false);
  assert.match(store.removalImpact(1,id).protectedRecords[0].reason,/отклонён/);
  db.deleteEntity(1,"ai-analysis",rejected.id);
  const mismatched=db.createEntity(1,"ai-analysis",{
   record_type:"image_analysis",title:"Unverified data from old source",
   data:{source:{documentId:id,sha256:"0".repeat(64)},
    verification:"requires_review"}
  });
  assert.equal(store.removalImpact(1,id).canDelete,false);
  assert.match(store.removalImpact(1,id).protectedRecords[0].reason,/SHA-256/);
  db.deleteEntity(1,"ai-analysis",mismatched.id);
  const dependent=db.createEntity(1,"ai-review-history",{
   record_type:"review_change",parent_id:laterEvidence.id,title:"Decision",
   data:{analysisId:laterEvidence.id,revision:1}
  });
  assert.equal(store.removalImpact(1,id).canDelete,false);
  assert.throws(()=>store.remove(1,id,{discardUnreviewed:true,expectedAnalysisIds:[laterEvidence.id]}),
   /ai-review-history/);
  db.deleteEntity(1,"ai-review-history",dependent.id);
  // Verified placements and registered marks cannot become orphaned evidence.
  const placement=db.createEntity(1,"scheme",{
   record_type:"scheme_column",title:"COL-0001",
   data:{entity_type:"column",mark:"К41",
    ai_source:{documentId:id,sha256:first.imported[0].sha256,
     verifiedManually:true}}
  });
  assert.equal(store.removalImpact(1,id).canDelete,false,
   "approved scheme placement blocks removal of source PDF");
  assert.throws(()=>store.remove(1,id,{discardUnreviewed:true,
   expectedAnalysisIds:[laterEvidence.id]}),/scheme/);
  assert(fs.existsSync(opened),"PDF survives blocked scheme deletion");
  db.deleteEntity(1,"scheme",placement.id);
  const markRow=db.createEntity(1,"marks",{
   record_type:"mark",title:"К41",
   data:{mark:"К41",source:{documentId:id,sha256:first.imported[0].sha256}}
  });
  assert.equal(store.removalImpact(1,id).canDelete,false,
   "mark register source reference protects original PDF");
  assert.throws(()=>store.remove(1,id,{discardUnreviewed:true,
   expectedAnalysisIds:[laterEvidence.id]}),/marks/);
  db.deleteEntity(1,"marks",markRow.id);
  const unrelated=db.createEntity(1,"scheme",{
   record_type:"scheme_column",title:"COL-9999",
   data:{ai_source:{documentId:id+999,sha256:"other"}}
  });
  assert.equal(store.removalImpact(1,id).canDelete,true,
   "unrelated scheme placements should not block removal");
  db.deleteEntity(1,"scheme",unrelated.id);
  const unknownIndex=db.createEntity(1,"ai-pdf-index",{
   record_type:"pdf_text_index",title:"unclassified index",
   data:{source:{documentId:id},pages:[]}
  });
  assert.throws(()=>store.remove(1,id),/Индекс неизвестного типа/,
   "unknown index formats may not be silently deleted");
  db.deleteEntity(1,"ai-pdf-index",unknownIndex.id);
  failDeleteIndex=true;
  assert.throws(()=>store.remove(1,id,{
    discardUnreviewed:true,expectedAnalysisIds:[laterEvidence.id]}),/Simulated SQLite index failure/,
   "a SQL failure must restore the stored original and all analyses");
  failDeleteIndex=false;
  assert(fs.existsSync(opened),"original is restored after a failed deletion transaction");
  assert(db.getEntity(1,"ai-documents",id),"original metadata restored after failed transaction");
  assert(db.getEntity(1,"ai-pdf-index",technicalIndex.id),"index restored after failed transaction");
  assert(db.getEntity(1,"ai-analysis",laterEvidence.id),"draft restored after failed transaction");
  const deleted=store.remove(1,id,{
   discardUnreviewed:true,expectedAnalysisIds:[laterEvidence.id]});
  assert.equal(deleted.deleted,true);
  assert.equal(deleted.discardedAnalyses,1);
  assert.equal(deleted.removedIndexes,1);
  assert.equal(db.getEntity(1,"ai-analysis",laterEvidence.id),null,
   "discarded draft cannot leave orphaned analysis referencing a removed PDF");
  assert.equal(db.getEntity(1,"ai-pdf-index",technicalIndex.id),null,
   "deleted document must leave no dangling PDF cache");

  assert(!fs.existsSync(opened));assert.equal(store.list(1).length,0);
  const bad=path.join(tmp,"blocked.exe");fs.writeFileSync(bad,"file");
  const restricted=createStore({getUserDataPath:()=>tmp,database:db,
   dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[bad]})},
   shell:{openPath:async()=>""}});
  const blocked=await restricted.select(1);
  assert.equal(blocked.imported.length,0);assert.equal(blocked.errors.length,1);
  const other=await store.select(2,"КМ");
  assert.equal(other.imported.length,1);
  store.deleteObjectFiles(2);assert(!fs.existsSync(path.join(tmp,"ir-project-ai","objects","2")));
  console.log("AI storage: local-only, SHA-256, duplicate safety, object isolation, open/delete passed.");
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
