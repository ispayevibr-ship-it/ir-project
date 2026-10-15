"use strict";
/* DEFERRED contract for final offline acceptance. DO NOT RUN during WIP. */
const assert=require("node:assert/strict");
const {createKmdReference}=require("../src/ai-kmd-reference");
(()=>{
 const sha="a".repeat(64),data=new Map();let seq=20,failure=false,duringTransaction=null;
 const clone=o=>o==null?null:JSON.parse(JSON.stringify(o));
 const key=(o,s,id)=>[o,s,id].join("|");
 const db={
  getObject:id=>[1,2].includes(Number(id))?{id:Number(id)}:null,
  getEntity:(o,s,id)=>clone(data.get(key(o,s,id))),
  listEntity:(o,s)=>[...data.values()].filter(x=>x.object_id===o&&x.section_key===s)
   .sort((x,y)=>y.id-x.id).map(clone),
  createEntity:(o,s,input)=>{
   if(failure&&s==="ai-kmd-reference-history")throw Error("simulated history failure");
   const r={id:++seq,object_id:o,section_key:s,record_type:input.record_type,
    parent_id:input.parent_id||null,title:input.title||"",data:clone(input.data||{}),
    created_at:"2026-10-15",updated_at:"2026-10-15"};
   data.set(key(o,s,r.id),r);return clone(r)
  },
  updateEntity:(o,s,id,input)=>{
   const prev=data.get(key(o,s,id));if(!prev)return null;
   const r={...prev,record_type:input.record_type,parent_id:input.parent_id||null,
    title:input.title||"",data:clone(input.data||{})};
   data.set(key(o,s,id),r);return clone(r)
  },
  deleteEntity:(o,s,id)=>data.delete(key(o,s,id)),
  transaction:fn=>{
   const before=clone([...data]),counter=seq;
   try{
    if(duringTransaction){
     const callback=duringTransaction;duringTransaction=null;callback()
    }
    return fn()
   }catch(e){data.clear();for(const [k,v] of before)data.set(k,v);seq=counter;throw e}
  }
 };
 const sheet1={id:301,setId:201,sheetCode:"КМД-01",documentId:11,page:1,
  sha256:sha,valid:true,kind:"КМД"};
 const sheet2={...sheet1,id:302,setId:202};
 let active=null,available=true,sourceStateCalls=0;
 const rev={
  active:(o,k)=>o===1&&k==="КМД"?active:null,
  getSheets:(o,setId)=>setId===201?[sheet1]:setId===202?[sheet2]:[],
  sourceState:(o,src)=>{
   sourceStateCalls++;
   return{current:available&&o===1&&active&&
    src.documentId===11&&src.page===1&&src.sha256===sha}
  }
 };
 const mark={id:31,mark:"К41",cipher:"041",secondaryCipher:"",
  status:"confirmed",sourceValid:true,quantity:6};
 const parts=[{id:41,assemblyId:31,position:"Д1",partCount:2,counted:true},
  {id:42,assemblyId:31,position:"Д2",partCount:1,counted:true}];
 const nodes=[{id:51,assemblyId:31,scope:"fabrication",jointCode:"У1",
  occurrencesPerAssembly:2,counted:true}];
 const components=[{id:61,assemblyId:31,jointId:51,category:"fastener",kind:"bolt",
  position:"Б1",perJoint:4,counted:true}];
 const api=createKmdReference({database:db,revisions:rev,
  quantities:{list:()=>[mark]},materials:{list:()=>parts},
  connections:{listNodes:()=>nodes,listComponents:()=>components},
  clock:()=>"2026-10-15T18:00:00Z"});
 const base={sheetId:301,mark:"К41",cipher:"041",secondaryCipher:"",
  sourcePosition:"КМД лист 01",expectedRevision:0,comment:"",
  status:"confirmed"};
 assert.throws(()=>api.save(1,null,{...base,type:"mark",quantity:6},
  {role:"engineer"}),/действующий комплект/);
 active={id:201,data:{kind:"КМД",status:"active",issue:"Изм.0"}};
 assert.throws(()=>api.save(1,null,{...base,type:"mark",quantity:6},
  {role:"guest"}),/инженер/);
 let markRef=api.save(1,null,{...base,type:"mark",quantity:6},{role:"engineer"});
 duringTransaction=()=>db.createEntity(1,"ai-kmd-reference-rows",{
  record_type:"kmd_reference",title:"Concurrent duplicate",
  data:{...db.getEntity(1,"ai-kmd-reference-rows",markRef.id).data,mark:"К99"}
 });
 assert.throws(()=>api.save(1,null,{...base,type:"mark",mark:"К99",quantity:1},
  {role:"engineer"}),/уже существует/,
  "a duplicate inserted after preliminary checks is rejected inside SQLite transaction");
 assert.equal(api.list(1).length,1,
  "failed entry transaction rolls back the simulated simultaneous insert");
 duringTransaction=()=>{available=false};
 assert.throws(()=>api.save(1,null,{...base,type:"mark",mark:"К98",quantity:1},
  {role:"engineer"}),/Оригинальный лист КМД/,
  "a source that goes missing just before writing cannot create a new reference");
 available=true;
 assert.equal(api.list(1).length,1);
 const partRef=api.save(1,null,{...base,type:"part",position:"Д1",quantity:2},
  {role:"engineer"});
 const missing=api.save(1,null,{...base,type:"part",position:"Д3",quantity:1,
  status:"requires_review"},{role:"engineer"});
 sourceStateCalls=0;
 assert.equal(api.list(1).length,3);
 assert.equal(sourceStateCalls,1,
  "large KMD reference registers should check the same sheet source once per listing");
 sourceStateCalls=0;
 const snapshot=api.snapshot(1);
 assert.equal(snapshot.entries.length,3);
 assert.equal(snapshot.checks.reviewed,0);
 assert.equal(snapshot.comparison.pendingPositions,1);
 assert.equal(snapshot.comparison.activeReferencePositions,2);
 assert.equal(sourceStateCalls,1,
  "a unified snapshot must verify each source only once, not once per subreport");
 assert.deepEqual(snapshot.entries,api.list(1),
  "single read-only snapshot must contain the same current reference positions");
 assert.equal(api.compare(1).allSheetsReviewed,false);
 assert.equal(api.compare(1).mismatches.some(x=>x.code==="unlisted_position"),false,
  "unlisted actual parts must not be diagnosed before all sheets checked");
 assert.throws(()=>api.seal(1,301,0,{reviewedEntireSheet:true,
  comment:"Полностью сверено по КМД"},{role:"engineer"}),/Сначала проверьте/);
 assert.throws(()=>api.save(1,markRef.id,{...base,type:"mark",quantity:7},
  {role:"engineer"}),/другом окне/,"optimistic revision must be respected");
 api.save(1,missing.id,{...base,type:"part",position:"Д3",quantity:1,
  expectedRevision:1,status:"confirmed"},{role:"engineer"});
 const jointRef=api.save(1,null,{...base,type:"joint",jointCode:"У1",
  scope:"fabrication",quantity:2},{role:"engineer"});
 api.save(1,null,{...base,type:"component",jointCode:"У1",scope:"fabrication",
  category:"fastener",kind:"bolt",position:"Б1",quantity:4},{role:"engineer"});
 assert.throws(()=>api.save(1,null,{...base,type:"part",position:"Д1",quantity:2},
  {role:"engineer"}),/уже существует/);
 let sealed=api.seal(1,301,0,{reviewedEntireSheet:true,
  comment:"По листу, по спецификации и выноскам, все позиции"},{role:"admin"});
 assert.equal(sealed.checked,true);
 assert.equal(api.checks(1).allSheetsReviewed,true);
 duringTransaction=()=>db.createEntity(1,"ai-kmd-reference-rows",{
  record_type:"kmd_reference",title:"Added before transaction commit",
  data:{...db.getEntity(1,"ai-kmd-reference-rows",markRef.id).data,
   type:"part",position:"Р-ОПАЗДАЛ",status:"requires_review"}
 });
 assert.throws(()=>api.seal(1,301,1,{reviewedEntireSheet:true,
  comment:"Повторная сверка исходного листа КМД"},{role:"engineer"}),
  /состав эталона изменился/,
  "late SQLite changes must invalidate an engineer's precomputed signoff");
 assert.equal(api.checks(1).allSheetsReviewed,true,
  "failed signoff and simulated concurrent modification must roll back");
 const duplicate=api.list(1).find(x=>x.id===markRef.id);
 const duplicateStored=db.getEntity(1,"ai-kmd-reference-rows",markRef.id);
 const duplicateRow=db.createEntity(1,"ai-kmd-reference-rows",{
  record_type:"kmd_reference",title:"Duplicate physical K41",
  data:{...duplicateStored.data,revision:2}
 });
 assert.equal(api.checks(1).allSheetsReviewed,false,
  "duplicate confirmed KMD references invalidate per-sheet attestation");
 assert.equal(api.checks(1).sheets[0].status,"needs_review",
  "invalidated stored signoff cannot leak sealed as current API status");
 assert.equal(api.checks(1).sheets[0].storedStatus,"sealed",
  "original persisted signoff state remains available for audit");
 assert(api.checks(1).sheets[0].duplicatePositions>0);
 assert.throws(()=>api.seal(1,301,1,{reviewedEntireSheet:true,
  comment:"Контрольный повторный акт из двух одинаковых строк"},{role:"engineer"}),
 /повторяются физические позиции/);
 db.deleteEntity(1,"ai-kmd-reference-rows",duplicateRow.id);
 assert.equal(api.checks(1).allSheetsReviewed,true);
 const validMarkRecord=db.getEntity(1,"ai-kmd-reference-rows",markRef.id);
 for(const field of ["type","scope","source.kind"]){
  const damaged=clone(validMarkRecord.data);
  if(field==="type")damaged.type="unknown_physical_piece";
  else if(field==="scope"){
   damaged.type="joint";damaged.jointCode="У1";damaged.scope="not_a_real_scope"
  }else damaged.source.kind="КМ";
  db.updateEntity(1,"ai-kmd-reference-rows",markRef.id,{
   record_type:"kmd_reference",title:validMarkRecord.title,data:damaged
  });
  assert.equal(api.list(1).find(x=>x.id===markRef.id).approved,false,
   "invalid identity field "+field+" cannot be considered an engineer approval");
  db.updateEntity(1,"ai-kmd-reference-rows",markRef.id,{
   record_type:"kmd_reference",title:validMarkRecord.title,data:validMarkRecord.data
  })
 }
 db.updateEntity(1,"ai-kmd-reference-rows",markRef.id,{
  record_type:"kmd_reference",title:validMarkRecord.title,
  data:{...validMarkRecord.data,reviewedBy:null}
 });
 assert.equal(api.list(1).find(x=>x.id===markRef.id).approved,false,
  "confirmed without an actual engineer decision must never be counted");
 assert.equal(api.checks(1).allSheetsReviewed,false);
 assert.equal(api.compare(1).pendingPositions,1);
 db.updateEntity(1,"ai-kmd-reference-rows",markRef.id,{
  record_type:"kmd_reference",title:validMarkRecord.title,data:validMarkRecord.data
 });
 assert.equal(api.checks(1).allSheetsReviewed,true);
 const tamperedRow=db.createEntity(1,"ai-kmd-reference-rows",{
  record_type:"kmd_reference",title:"Unexpected reference position",
  data:{setId:201,sheetId:301,type:"part",mark:"К41",
   position:"Д999",status:"confirmed",quantity:1}
 });
 assert.equal(api.checks(1).allSheetsReviewed,false,
  "an inserted reference invalidates the signed sheet even without using the editor");
 db.deleteEntity(1,"ai-kmd-reference-rows",tamperedRow.id);
 assert.equal(api.checks(1).allSheetsReviewed,true,
  "the signed fingerprint must match the exact original record set");
 const oldPart=db.getEntity(1,"ai-kmd-reference-rows",partRef.id);
 db.updateEntity(1,"ai-kmd-reference-rows",partRef.id,{
  record_type:"kmd_reference",title:oldPart.title,
  data:{...oldPart.data,quantity:7}
 });
 assert.equal(api.checks(1).allSheetsReviewed,false,
  "a tampered quantity must revoke a previously signed source sheet");
 assert.match(api.checks(1).sheets[0].reason,/акт не совпадает/,
  "diagnostics must explain invalidated signoff rather than showing zero errors");
 db.updateEntity(1,"ai-kmd-reference-rows",partRef.id,{
  record_type:"kmd_reference",title:oldPart.title,data:oldPart.data
 });
 assert.equal(api.checks(1).allSheetsReviewed,true);
 let report=api.compare(1);
 assert.equal(report.fullSpecificationVerified,false);
 assert.equal(report.releaseCertified,false);
 mark.status="requires_review";
 assert(api.compare(1).mismatches.some(x=>x.code==="unverified_mark"&&
  x.type==="mark"&&x.actualId===31),
  "an existing draft mark must link to its record, not be described as missing");
 mark.status="confirmed";
 mark.sourceValid=false;
 assert(api.compare(1).mismatches.some(x=>x.code==="unverified_mark"&&
  x.actualId===31),"a stale source cannot count as a missing physical mark");
 mark.sourceValid=true;
 parts[0].counted=false;
 parts[0].status="requires_review";
 parts[0].reason="Деталь ожидает подписи инженера";
 assert(api.compare(1).mismatches.some(x=>x.code==="unverified_position"&&
  x.type==="part"&&x.actualId===41&&x.reason==="Деталь ожидает подписи инженера"),
  "an existing draft part must preserve its ledger link and rejection reason");
 parts[0].counted=true;
 parts[0].status="confirmed";
 nodes[0].counted=false;
 nodes[0].status="requires_review";
 assert(api.compare(1).mismatches.some(x=>x.code==="unverified_position"&&
  x.type==="joint"&&x.actualId===51),
  "an unverified joint is not a missing connection");
 nodes[0].counted=true;
 nodes[0].status="confirmed";
 components[0].counted=false;
 components[0].status="requires_review";
 assert(api.compare(1).mismatches.some(x=>x.code==="unverified_position"&&
  x.type==="component"&&x.actualId===61&&x.jointId===51),
  "an unverified fastener must open the exact existing component");
 components[0].counted=true;
 components[0].status="confirmed";
 assert(report.mismatches.some(x=>x.code==="missing_position"&&x.position==="Д3"&&
  x.sourceDocumentId===11&&x.sourcePage===1),
  "missing engineering entries must offer their original KMD reference sheet");
 assert(report.mismatches.some(x=>x.code==="unlisted_position"&&
  x.position==="Д2"&&x.actualId===42&&x.assemblyId===31),
  "extra actual part must link to its precise engineering-ledger row");
 assert(report.mismatches.some(x=>x.code==="missing_position"&&
  x.position==="Д3"&&x.actualId===null),
  "missing positions never point to an invented engineering record");
 assert.equal(report.reviewedSheets,1);
 assert.equal(report.activeReferencePositions,5);
 assert.equal(api.history(1,markRef.id).length,1);
 markRef=api.list(1).find(x=>x.id===markRef.id);
 failure=true;
 assert.throws(()=>api.save(1,markRef.id,{...base,type:"mark",
  quantity:5,expectedRevision:1},{role:"engineer"}),/simulated history failure/);
 failure=false;
 assert.equal(api.list(1).find(x=>x.id===markRef.id).quantity,6,
  "history-write failure rolls back original row edit");
 api.save(1,markRef.id,{...base,type:"mark",
  quantity:5,expectedRevision:1},{role:"engineer"});
 assert(api.compare(1).mismatches.some(x=>x.code==="quantity_mismatch"&&
  x.type==="mark"&&x.actualId===31),
  "quantity mismatch must open the exact existing mark ledger record");
 assert.equal(api.checks(1).allSheetsReviewed,false,
  "editing an engineer reference must revoke complete-sheet attestation");
 assert(!api.compare(1).mismatches.some(x=>x.code==="unlisted_position"),
  "unlisted reports disabled again until sheet is reconfirmed");
 assert.equal(api.checks(1).sheets[0].status,"needs_review");
 assert.equal(api.history(1,markRef.id).length,2);
 api.seal(1,301,2,{reviewedEntireSheet:true,
  comment:"Повторная проверка после исправления марки"},{role:"engineer"});
 assert.equal(api.compare(1).allSheetsReviewed,true);
 available=false;
 assert.equal(api.list(1).filter(x=>x.approved).length,0);
 assert.equal(api.checks(1).allSheetsReviewed,false,"lost PDF revokes approval");
 available=true;
 active={id:202,data:{kind:"КМД",status:"active",issue:"Изм.1"}};
 assert.equal(api.list(1).filter(x=>x.approved).length,0,
  "same PDF in new drawing set cannot auto-renew engineer decisions");
 assert.equal(api.compare(1).archivedPositions,5);
 assert.equal(api.checks(1).reviewed,0);
 assert.equal(api.history(1,markRef.id).length,2,
  "an archived KMD position must retain the engineer's audit history");
 const archivedMark=api.list(1).find(x=>x.id===markRef.id);
 assert.equal(archivedMark.current,false);
 assert.equal(archivedMark.source.documentId,11);
 assert.equal(archivedMark.source.page,1);
 assert.throws(()=>api.save(1,markRef.id,{...base,sheetId:302,
  type:"mark",quantity:6,expectedRevision:2},{role:"engineer"}),/архивный/);
 const fresh=api.save(1,null,{...base,sheetId:302,type:"mark",quantity:6},
  {role:"engineer"});
 assert.equal(fresh.current,true);
 assert.equal(api.list(2).length,0);
 // Corrupt duplicate sealed declarations never resolve by arbitrary 'first'.
 db.createEntity(1,"ai-kmd-reference-checks",{record_type:"kmd_sheet_check",
  data:{setId:202,sheetId:302,status:"sealed",reviewedEntireSheet:true,
   reviewedBy:"engineer",documentId:11,page:1,sha256:sha}});
 db.createEntity(1,"ai-kmd-reference-checks",{record_type:"kmd_sheet_check",
  data:{setId:202,sheetId:302,status:"sealed",reviewedEntireSheet:true,
   reviewedBy:"engineer",documentId:11,page:1,sha256:sha}});
 assert.throws(()=>api.checks(1),/несколько актов/);
 console.log("Deferred contract: signed sheets, active revisions, missing/extra positions and audited edit rollback");
})();
