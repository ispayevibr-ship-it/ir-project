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
   section==="ai-assembly-attachments"?[]:[]:[]
 };
 const coverage=createAiCoverage({
  database,quantities,materials:{list:()=>details},connections:{
   listNodes:()=>joints,listComponents:()=>items
  },assemblies:{list:()=>[{
   id:70,assemblyId:31,partId:40,partPosition:"Д1",instanceIndex:1,
   status:"confirmed",counted:true
  }]},attachments:{list:()=>[]},proposals:{list:()=>proposals}
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
 assert.equal(first.metrics.erectionJointInstances,5,
  "site joints are never multiplied by assembly copies again");
 assert.equal(first.metrics.registeredFastenerPieces,48);
 assert(first.issues.some(x=>x.code==="kmd_partial_3d_placement"));
 assert(first.issues.some(x=>x.code==="kmd_confirmed_parts_not_transferred"&&x.count===1));
 assert(!first.issues.some(x=>x.code==="kmd_quantity_conflicts"));
 proposals[0].values.quantity=5;
 const mismatched=coverage.report(1);
 assert(mismatched.issues.some(x=>x.code==="kmd_quantity_conflicts"));
 proposals[0].values.quantity=6;
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
