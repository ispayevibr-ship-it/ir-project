"use strict";
/* FINAL ACCEPTANCE CONTRACT — intentionally not executed during WIP development. */
const assert=require("node:assert/strict");
const {createAiIntegrity}=require("../src/ai-integrity-report");
function fixture(){
 const document={id:11,name:"КМД.pdf",kind:"КМД",ext:".pdf",
  sha256:"a".repeat(64),exists:true};
 const stores={
  "ai-assembly-placement":[{id:88,record_type:"part_placement",data:{assemblyId:21}}],
  "ai-assembly-attachments":[{id:89,record_type:"assembly_attachment",data:{assemblyId:21}}]
 };
 let mutationCount=0;
 const database={
  getObject:id=>Number(id)===1?{id:1}:null,
  listEntity:(id,section)=>stores[section]||[],
  createEntity:()=>{mutationCount++;throw Error("read-only report wrote to database")},
  updateEntity:()=>{mutationCount++;throw Error("read-only report updated database")}
 };
 const quantitiesRows=[
  {id:31,mark:"К41",cipher:"041",quantity:4,status:"confirmed",sourceValid:false},
  {id:32,mark:"К42",cipher:"041",quantity:2,status:"confirmed",sourceValid:true}
 ];
 const parts=[
  {id:88,assemblyId:21,status:"confirmed",counted:false,
   reason:"Исходный PDF КМД изменён"}
 ];
 const anchors=[
  {id:89,assemblyId:21,status:"confirmed",visible:false,
   reason:"3D-размещение устарело"}
 ];
 const shared={
  database,documents:{list:()=>[document]},
  pdfIndex:{list:()=>[{id:10,documentId:11,sourceSha256:document.sha256,totalPages:2}]},
  revisions:{
   list:()=>[{kind:"КМД",status:"active",sheets:[{valid:true}]}],
   impact:()=>({outdated:1,uncontrolled:0,records:[
    {id:31,title:"Количество марок",recordTitle:"К41",outdated:true,
     reasons:["Исключён из действующей редакции"]}]})
  },
  review:{list:()=>[{id:101,status:"requires_review",sourceName:"КМД.pdf",page:1}]},
  workflow:{summary:()=>({total:3,byStatus:{failed:1,queued:1,awaiting_review:1}}),list:()=>[]},
  proposals:{list:()=>[{analysisId:101,type:"mark_quantity",status:"requires_review",
   approved:false,values:{mark:"К41"}}]},
  quantities:{list:()=>quantitiesRows},
  materials:{list:()=>[{id:40,position:"Д1",assemblyMark:"К41",
   status:"confirmed",counted:false,reason:"Старая ревизия"}]},
  connections:{
   listNodes:()=>[{id:50,jointCode:"У1",status:"confirmed",counted:false,
    reason:"Проверить КМД"}],
   listComponents:()=>[{id:51,position:"Б1",status:"requires_review",counted:false}]
  },
  comparisons:{list:()=>[
   {id:60,mark:"К41",position:"Балка",status:"confirmed",approved:true,
    result:"difference",disposition:"correction_required",fieldName:"Длина"},
   {id:61,mark:"К42",position:"Колонна",status:"requires_review",approved:false,
    result:"match",fieldName:"Масса"}
  ]},
  assemblies:{list:()=>parts},
  attachments:{list:()=>anchors},clock:()=>"2026-10-15T12:00:00Z"
 };
 return{shared,database,quantitiesRows,readMutationCount:()=>mutationCount}
}
(()=>{
 const {shared,quantitiesRows,readMutationCount}=fixture(),
  api=createAiIntegrity(shared),
  x=api.report(1);
 assert.equal(x.objectId,1);
 assert.equal(x.releaseCertified,false);
 assert.equal(x.metrics.documents,1);
 assert.equal(x.metrics.approvedMarkCopies,2,"stale quantities must not count");
 assert.equal(x.metrics.confirmed3dDetails,0);
 assert.equal(x.metrics.confirmed3dAnchors,0);
 assert(x.bySeverity.error>=4,"stale PDF evidence, mark counts, steel and discrepancies");
 assert(x.bySeverity.warning>=3,"pending human review and incomplete workflow");
 assert(x.issues.some(y=>y.code==="engineering_discrepancies"&&y.count===1));
 assert(x.issues.some(y=>y.code==="unreviewed_3d"&&y.count===2));
 assert.equal(readMutationCount(),0);
 quantitiesRows.push({id:33,mark:"К42",cipher:"041",secondaryCipher:"",
  quantity:3,status:"confirmed",sourceValid:true});
 const duplicate=api.report(1);
 assert.equal(duplicate.metrics.approvedMarkCopies,null,
  "duplicate approved rows must not expose an inflated physical-piece total");
 assert(duplicate.issues.some(issue=>issue.code==="duplicate_approved_marks"&&issue.count===1));
 const withReference=createAiIntegrity({...shared,reference:{compare:()=>({
  setId:201,activeReferencePositions:2,reviewedSheets:0,sheetCount:1,
  sheets:[{id:301,sheetCode:"КМД-01",page:1,checked:false}],
  mismatches:[{code:"missing_position",mark:"К41",position:"Д3",
   expected:2,actual:null,label:"Отсутствующая деталь"}]
 })}}).report(1);
 assert(withReference.issues.some(x=>x.code==="kmd_reference_sheets_pending"&&x.count===1),
  "engineering source sheets that are not signed must appear in integrity report");
 assert(withReference.issues.some(x=>x.code==="kmd_reference_missing_position"&&x.count===1),
  "KMD reference discrepancies must survive integration into global diagnostics");
 assert.equal(withReference.metrics.referencePositions,2);
 assert(!withReference.issues.some(x=>x.code==="kmd_reference_missing_set"),
  "an active reference set must not be reported as absent");
 assert.equal(withReference.releaseCertified,false);
 const missingSet=createAiIntegrity({...shared,reference:{compare:()=>({
  setId:null,activeReferencePositions:0,reviewedSheets:0,sheetCount:0,
  sheets:[],mismatches:[]
 })}}).report(1);
 assert(missingSet.issues.some(x=>x.code==="kmd_reference_missing_set"),
  "an empty active KMD baseline is not verified or complete");
 assert.equal(missingSet.metrics.referencePositions,0);
 assert.equal(missingSet.releaseCertified,false);
 const referenceFailure=createAiIntegrity({...shared,reference:{compare:()=>{
  throw Error("tampered KMD source snapshot")
 }}}).report(1);
 assert(referenceFailure.issues.some(x=>x.code==="integration_kmd_reference"),
  "failure to read KMD reference is an error, not zero discrepancies");
 assert.equal(referenceFailure.metrics.referencePositions,null,
  "failed KMD reference read must yield unknown, never a fictitious zero");
 assert.equal(referenceFailure.stages.find(x=>x.tab==="reference").count,null,
  "the integrity stage count must retain unavailable status");
 assert.throws(()=>api.report(2),/Объект не найден/);
 const broken={...shared,materials:{list:()=>{throw Error("Material table failure")}}};
 const y=createAiIntegrity(broken).report(1);
 assert(y.issues.some(row=>row.code==="integration_materials"));
 assert.equal(y.releaseCertified,false);
 console.log("Deferred IR Project AI integrity report — review required and no automatic certification");
})();
