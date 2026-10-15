"use strict";
/* FINAL-ACCEPTANCE CONTRACT ONLY. Do not execute during AI integration WIP. */
const assert=require("node:assert/strict");
const {createAiCoverage}=require("../src/ai-kmd-coverage");
(()=>{
 const kmd="a".repeat(64),mark={
  id:31,mark:"К41",cipher:"041",secondaryCipher:"",
  quantity:6,status:"confirmed",sourceValid:true,revision:1
 };
 const details=[
  {id:40,assemblyId:31,assemblyMark:"К41",position:"Д1",type:"plate",
   partCount:2,status:"confirmed",counted:true},
  {id:41,assemblyId:31,assemblyMark:"К41",position:"Д2",type:"rib",
   partCount:1,status:"confirmed",counted:true}
 ];
 const joints=[
  {id:50,assemblyId:31,jointCode:"У1",scope:"fabrication",instances:12,
   status:"confirmed",counted:true},
  {id:51,assemblyId:31,jointCode:"Монтаж 1",scope:"erection",instances:5,
   status:"confirmed",counted:true}
 ];
 const items=[{id:60,assemblyId:31,jointId:50,category:"fastener",
  kind:"bolt",position:"Б1",totalPieces:48,status:"confirmed",counted:true}];
 const placements=[{id:70,record_type:"part_placement",data:{assemblyId:31,partId:40,instanceIndex:1}}];
 const annotationRows=[];
 const proposals=[
  {analysisId:21,index:0,approved:true,sourceValid:true,type:"mark_quantity",
   values:{mark:"К41",cipher:"041",quantity:6,specPosition:"17"}},
  {analysisId:21,index:1,approved:true,sourceValid:true,type:"steel_part",
   values:{mark:"К41",position:"Д1",partCount:2}},
  {analysisId:21,index:2,approved:true,sourceValid:true,type:"steel_part",
   values:{mark:"К41",position:"Д9",partCount:3}},
  {analysisId:21,index:3,approved:true,sourceValid:true,type:"connection",
   values:{mark:"К41",jointCode:"У1",fastenerKind:"bolt",position:"Б1"}}
 ];
 const quantities={list:()=>[mark]};
 const database={
  getObject:id=>Number(id)===1?{id:1}:null,
  listEntity:(id,section)=>id===1?
   section==="ai-assembly-placement"?placements:
   section==="ai-assembly-attachments"?annotationRows:[]:[]
 };
 let assemblyReadFails=false,annotationReadFails=false;
 const coverage=createAiCoverage({
  database,quantities,materials:{list:()=>details},connections:{
   listNodes:()=>joints,listComponents:()=>items
  },assemblies:{list:()=>{
   if(assemblyReadFails)throw Error("PDF-linked 3D placement index is unreadable");
   return [{
    id:70,assemblyId:31,partId:40,partPosition:"Д1",instanceIndex:1,
    status:"confirmed",counted:true
   }]
  }},attachments:{list:()=>{
   if(annotationReadFails)throw Error("3D attachment index is unreadable");
   return []
  }},proposals:{list:()=>proposals}
 });
 const first=coverage.report(1);
 assert.equal(first.complete,false);
 assert.equal(first.fullSpecificationVerified,false);
 assert.equal(first.metrics.confirmedMarkCopies,6);
 assert.equal(first.metrics.registeredDetailUnitsInProject,18,
  "three individual parts per shipped mark times six copies");
 assert.equal(first.metrics.modeledUnitsPerUniqueMarks,1,
  "one standard mark is modeled, not six repeated copies");
 assert.equal(first.metrics.expectedModelUnitsPerUniqueMarks,3);
 assert.equal(first.metrics.factoryJointInstances,12);
 placements.length=0;
 const notStarted=coverage.report(1);
 assert.equal(notStarted.marks[0].modelStarted,false);
 assert(!notStarted.issues.some(x=>x.code==="kmd_partial_3d_placement"),
  "an untouched 3D assembly cannot be declared an interrupted partial model");
 placements.push({id:70,record_type:"part_placement",data:{
  assemblyId:31,partId:40,instanceIndex:1
 }});

 assert.equal(first.metrics.erectionJointInstances,5,
  "site joints are never multiplied by assembly copies again");
 assert.equal(first.metrics.registeredFastenerPieces,48);
 assert(first.issues.some(x=>x.code==="kmd_partial_3d_placement"));
 assemblyReadFails=true;
 const broken3d=coverage.report(1);
 assert.equal(broken3d.metrics.confirmedMarkCopies,6,
  "a failed 3D view must not delete engineer-confirmed assembly quantity");
 assert.equal(broken3d.metrics.registeredDetailUnitsInProject,18,
  "part takeoff must survive inability to read placement geometry");
 assert.equal(broken3d.metrics.registeredFastenerPieces,48,
  "joint and hardware totals must survive a broken 3D placement");
 assert.equal(broken3d.metrics.factoryJointInstances,12);
 assert.equal(broken3d.metrics.erectionJointInstances,5);
 assert.equal(broken3d.metrics.modeledUnitsPerUniqueMarks,null,
  "unknown 3D count cannot be published as a false zero");
 assert.equal(broken3d.marks[0].modeledUnitsPerMark,null);
 assert.equal(broken3d.marks[0].confirmedJointPositions,2);
 assert(broken3d.issues.some(x=>x.code==="kmd_invalid_3d_placement"));
 assert(!broken3d.issues.some(x=>x.code==="kmd_partial_3d_placement"),
  "cannot assert incomplete 3D geometry when the source could not be read");
 assemblyReadFails=false;
 annotationRows.push({id:71,record_type:"assembly_attachment",data:{assemblyId:31}});
 annotationReadFails=true;
 const brokenAnnotations=coverage.report(1);
 assert.equal(brokenAnnotations.marks[0].confirmed3dAnnotations,null,
  "unknown 3D annotations must not be reported as none");
 assert.equal(brokenAnnotations.metrics.registeredFastenerPieces,48);
 annotationReadFails=false;
 annotationRows.pop();
 assert(first.issues.some(x=>x.code==="kmd_confirmed_parts_not_transferred"&&x.count===1));
 assert(!first.issues.some(x=>x.code==="kmd_quantity_conflicts"));
 proposals[0].values.quantity=5;
 const mismatched=coverage.report(1);
 assert(mismatched.issues.some(x=>x.code==="kmd_quantity_conflicts"));
 proposals[0].values.quantity=6;
 // A single joint code can exist in fabrication and erection: the source
 // proposal does not carry a verified physical scope, so never choose first.
 joints.push({...joints[0],id:52,scope:"erection",instances:5});
 const ambiguousJoint=coverage.report(1);
 assert(ambiguousJoint.issues.some(x=>x.code==="kmd_ambiguous_connection_scope"&&x.count===1),
  "the same KMD joint code under two physical scopes requires human disambiguation");
 assert(!ambiguousJoint.issues.some(x=>x.code==="kmd_confirmed_joints_not_transferred"),
  "an ambiguous existing joint must not be reported as missing");
 joints.pop();
 joints.push({...joints[0],id:52,scope:"erection",instances:5,
  status:"requires_review",counted:false});
 const pendingOtherScope=coverage.report(1);
 assert(pendingOtherScope.issues.some(x=>x.code==="kmd_ambiguous_connection_scope"),
  "a pending site joint with the same code still makes AI evidence ambiguous");
 joints.pop();
 items[0].category="weld";
 const wrongCategory=coverage.report(1);
 assert(wrongCategory.issues.some(x=>x.code==="kmd_confirmed_items_not_transferred"),
  "a weld record may not satisfy an explicitly verified fastener proposal");
 items[0].category="fastener";
 mark.quantity=0;
 const invalidConfirmedQty=coverage.report(1);
 assert(invalidConfirmedQty.issues.some(x=>x.code==="kmd_confirmed_marks_not_transferred"),
  "a corrupted zero-count mark must never satisfy reviewed quantity evidence");
 mark.quantity=6;
 quantities.list=()=>[mark,{...mark,id:32,quantity:6}];
 const conflict=coverage.report(1);
 assert.equal(conflict.metrics.confirmedMarkCopies,null);
 assert.equal(conflict.metrics.registeredFastenerPieces,null);
 assert.equal(conflict.ambiguousTotals,true);
 assert(conflict.issues.some(x=>x.code==="kmd_duplicate_mark_identity"));
 quantities.list=()=>[mark];
 details.push({...details[0],id:42});
 const duplicatePart=coverage.report(1);
 assert.equal(duplicatePart.metrics.registeredDetailUnitsInProject,null,
  "duplicate approved details must hide aggregate physical totals");
 assert(duplicatePart.issues.some(x=>x.code==="kmd_duplicate_physical_positions"));
 details.pop();
 joints.push({...joints[0],id:52});
 const duplicateNode=coverage.report(1);
 assert.equal(duplicateNode.metrics.registeredFastenerPieces,null,
  "duplicate joint identity must not inflate hardware takeoff");
 joints.pop();
 items.push({...items[0],id:61});
 const duplicateItem=coverage.report(1);
 assert.equal(duplicateItem.ambiguousTotals,true);
 items.pop();
 assert.throws(()=>coverage.report(2),/Объект/);
 console.log("Deferred contract: mark copies, per-mark KMD parts, site/factory joints and 3D coverage");
})();
