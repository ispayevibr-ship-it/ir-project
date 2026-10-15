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
  kind:"bolt",position:"Б1",perJoint:4,totalPieces:48,
  status:"confirmed",counted:true}];
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
 let placementIndexFails=false,attachmentIndexFails=false;
 const database={
  getObject:id=>Number(id)===1?{id:1}:null,
  listEntity:(id,section)=>{
   if(id!==1)return [];
   if(section==="ai-assembly-placement"){
    if(placementIndexFails)throw Error("Corrupted placement index");
    return placements
   }
   if(section==="ai-assembly-attachments"){
    if(attachmentIndexFails)throw Error("Corrupted attachment index");
    return annotationRows
   }
   return []
  }
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
 placementIndexFails=true;
 const damagedIndex=coverage.report(1);
 assert.equal(damagedIndex.metrics.confirmedMarkCopies,6,
  "missing 3D SQLite index must not erase physical KMD assembly copies");
 assert.equal(damagedIndex.metrics.registeredDetailUnitsInProject,18,
  "confirmed metal detail quantities survive 3D index read failures");
 assert.equal(damagedIndex.metrics.registeredFastenerPieces,48,
  "confirmed fastener takeoff survives broken placement index");
 assert.equal(damagedIndex.metrics.modeledUnitsPerUniqueMarks,null,
  "a broken placement index must not imply zero 3D placements");
 assert.equal(damagedIndex.marks[0].modelStarted,null,
  "index failure must not be presented as an untouched 3D model");
 assert.equal(damagedIndex.marks[0].modeledUnitsPerMark,null);
 assert(damagedIndex.issues.some(x=>x.code==="kmd_invalid_3d_placement"));
 assert(!damagedIndex.issues.some(x=>x.code==="kmd_partial_3d_placement"),
  "unreadable index is not evidence of a physically incomplete 3D model");
 placementIndexFails=false;
 attachmentIndexFails=true;
 const damagedAttachments=coverage.report(1);
 assert.equal(damagedAttachments.metrics.modeledUnitsPerUniqueMarks,1,
  "an attachment-index failure cannot invalidate independent 3D placement counts");
 assert.equal(damagedAttachments.marks[0].confirmed3dAnnotations,null,
  "an unreadable attachment index must be unknown, not a zero");
 assert.equal(damagedAttachments.metrics.registeredFastenerPieces,48);
 assert(damagedAttachments.issues.some(x=>x.code==="kmd_invalid_3d_placement"));
 attachmentIndexFails=false;
 assert.equal(coverage.report(1).metrics.modeledUnitsPerUniqueMarks,1,
  "recovering the index restores verified 3D counts");
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
 // Independently approved OCR/VLM evidence must not silently pick the first
 // quantity or part specification when different source sheets disagree.
 proposals.push({...proposals[0],analysisId:22,index:4,
  values:{...proposals[0].values,quantity:5}});
 const conflictingQuantities=coverage.report(1);
 assert(conflictingQuantities.issues.some(x=>x.code==="kmd_conflicting_reviewed_evidence"&&
  x.count===1&&x.examples[0].includes("quantity: 6 / 5")),
  "contradictory reviewed quantities for one mark require explicit resolution");
 assert(!conflictingQuantities.issues.some(x=>x.code==="kmd_quantity_conflicts"),
  "neither side of conflicting reviewed evidence may be arbitrarily compared to ledger");
 assert.equal(conflictingQuantities.metrics.confirmedMarkCopies,6,
  "AI disagreement must never change engineer-entered physical quantities");
 proposals.pop();
 proposals.push({...proposals[0],analysisId:22,index:4,
  values:{...proposals[0].values}});
 const identicalCopies=coverage.report(1);
 assert(identicalCopies.issues.some(x=>x.code==="kmd_duplicate_reviewed_evidence"&&x.count===1));
 assert(!identicalCopies.issues.some(x=>x.code==="kmd_conflicting_reviewed_evidence"),
  "two equal reviews are duplicates, not contradictory engineer assertions");
 proposals.pop();
 proposals.push({...proposals[1],analysisId:23,index:4,
  values:{...proposals[1].values,partCount:3}});
 const conflictingParts=coverage.report(1);
 assert(conflictingParts.issues.some(x=>x.code==="kmd_conflicting_reviewed_evidence"&&
  x.examples.some(y=>y.includes("partCount: 2 / 3"))),
  "a conflicting number of KMD details per assembly must be distinguished from a simple duplicate");
 proposals.pop();
 proposals.push({...proposals[3],analysisId:24,index:4,
  values:{...proposals[3].values,perJoint:4}});
 proposals.push({...proposals[3],analysisId:25,index:5,
  values:{...proposals[3].values,perJoint:6}});
 const conflictingHardware=coverage.report(1);
 assert(conflictingHardware.issues.some(x=>x.code==="kmd_conflicting_reviewed_evidence"&&
  x.examples.some(y=>y.includes("perJoint: 4 / 6"))),
  "two verified hardware counts per joint require engineering reconciliation");
 proposals.pop();proposals.pop();
 proposals.push({...proposals[0],analysisId:26,index:4,sourceValid:false,
  values:{...proposals[0].values,quantity:5}});
 assert(!coverage.report(1).issues.some(x=>x.code==="kmd_conflicting_reviewed_evidence"),
  "outdated PDF review evidence must not create a conflict with current sheets");
 proposals.pop();
 proposals[3].values.perJoint=5;
 const differentPerJoint=coverage.report(1);
 assert(differentPerJoint.issues.some(x=>x.code==="kmd_hardware_per_joint_conflicts"&&
  x.examples.some(y=>y.includes("проверено 5 на узел, в ведомости 4"))),
  "a verified bolt count per connection cannot be replaced by a project-wide total");
 assert.equal(differentPerJoint.metrics.registeredFastenerPieces,48,
  "an AI disagreement must not change human-confirmed physical hardware pieces");
 proposals[3].values.perJoint=4;
 assert(!coverage.report(1).issues.some(x=>x.code==="kmd_hardware_per_joint_conflicts"),
  "equal hardware counts per joint should not be flagged as different");
 items.push({...items[0],id:62,counted:false,status:"requires_review"});
 const competingHardware=coverage.report(1);
 assert(competingHardware.issues.some(x=>x.code==="kmd_ambiguous_component_evidence"),
  "a confirmed bolt must not hide a pending identical hardware position");
 items.pop();
 delete proposals[3].values.perJoint;
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
