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
  workflow:{summary:()=>({total:3,byStatus:{failed:1,queued:1,awaiting_review:1}})},
  proposals:{list:()=>[{analysisId:101,type:"mark_quantity",status:"requires_review",
   approved:false,values:{mark:"К41"}}]},
  quantities:{list:()=>[
   {id:31,mark:"К41",cipher:"041",quantity:4,status:"confirmed",sourceValid:false},
   {id:32,mark:"К42",cipher:"041",quantity:2,status:"confirmed",sourceValid:true}
  ]},
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
 return{shared,database,readMutationCount:()=>mutationCount}
}
(()=>{
 const {shared,readMutationCount}=fixture(),
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
 assert.throws(()=>api.report(2),/Объект не найден/);
 const broken={...shared,materials:{list:()=>{throw Error("Material table failure")}}};
 const y=createAiIntegrity(broken).report(1);
 assert(y.issues.some(row=>row.code==="integration_materials"));
 assert.equal(y.releaseCertified,false);
 console.log("Deferred IR Project AI integrity report — review required and no automatic certification");
})();
