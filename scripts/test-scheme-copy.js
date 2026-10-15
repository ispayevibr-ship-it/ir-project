"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const file=fs.readFileSync("src/scheme-page.js","utf8");
const i=file.indexOf(" async function copySchemeMember("),j=file.indexOf("\n function renderUnifiedBuilding(",i);
assert(i>=0&&j>i);
function fixture(kind="bent",qty=5){
 const original={id:"original",title:"COL-0001",record_type:"scheme_column",data:{
  mark_id:"mark-1",mark:"Б12",work_type_id:"work-1",geometry_type:kind,
  absolute_x_mm:2000.125,absolute_y_mm:3000.25,
  absolute_x2_mm:kind==="column"?undefined:6000.375,absolute_y2_mm:kind==="column"?undefined:4500.5,
  absolute_mid_x_mm:kind==="bent"?4600.125:undefined,absolute_mid_y_mm:kind==="bent"?3600.25:undefined,
  z0_mm:7400,z1_mm:kind==="column"?10300:7650,end_z_mm:kind==="column"?undefined:7650,
  mid_z_mm:kind==="bent"?9123:undefined,ridge_mode:"center",rotation_deg:17.25,
  profile_name:"30Б1",section_type:"ibeam",scheme_view_id:"all",position:"COL-0001"}};
 const rows=[structuredClone(original)],mark={id:"mark-1",mark:"Б12",name:"Балка",qty,work_type_id:"work-1"};
 const records=()=>rows.map(r=>({id:r.id,title:r.title,...r.data}));
 const env={
  rows,schemeApi:{list:async()=>rows,create:async item=>{const id="copy-"+rows.length;rows.push({id,...structuredClone(item)});return{id}}},
  canEdit:()=>true,allRecords:records,linkedMark:r=>r.mark_id===mark.id?mark:null,
  // The mock create() already appends its row. The production helper merges
  // the normalized returned row into a fresh immutable snapshot.
  rememberSavedSchemeRecord:saved=>saved?.id!=null,
  markPlacement:()=>{const n=records().filter(r=>r.mark_id===mark.id).length;return{total:qty,placed:n,left:Math.max(0,qty-n)}},
  coord:r=>({x:r.absolute_x_mm,y:r.absolute_y_mm,x2:r.absolute_x2_mm,y2:r.absolute_y2_mm,mx:r.absolute_mid_x_mm,
   my:r.absolute_mid_y_mm,z0:r.z0_mm,z1:r.z1_mm,z2:r.end_z_mm??r.z1_mm,mz:r.mid_z_mm,geometryType:r.geometry_type}),
  spanX:15000,spanY:15000,axesX:["1","2","3"],axesY:["А","Б","В"],
  axisXPos:new Map([["1",0],["2",7500],["3",15000]]),axisYPos:new Map([["А",0],["Б",7500],["В",15000]]),
  closestAxis:(v,axes,pos)=>axes.reduce((b,a)=>Math.abs(pos.get(a)-v)<Math.abs(pos.get(b)-v)?a:b),
  recordMarkGroup:()=>({key:"beams",label:"Балки"}),recordWorkId:()=>"work-1",sectionType:r=>r.section_type,
  num:v=>Number(v)||0,fmt:v=>String(v)
 };
 return{rows,records,original,copy:vm.runInNewContext("("+file.slice(i,j).trim()+")",env)}
}
(async()=>{
 for(const kind of ["bent","beam","column","brace","truss"]){
  const c=fixture(kind),before=structuredClone(c.rows[0]),id=await c.copy("original",{x:8000.625,y:9000.75});
  const d=c.records().find(x=>x.id===id),o=c.original.data;
  assert.equal(c.rows.length,2);assert.deepEqual(c.rows[0],before);
  for(const [key,value] of Object.entries({absolute_x_mm:8000.625,absolute_y_mm:9000.75,offset_x_mm:500.625,offset_y_mm:1500.75,
   z0_mm:7400,z1_mm:o.z1_mm,rotation_deg:17.25,profile_name:"30Б1",geometry_type:kind,status:"planned"}))
   assert.equal(d[key],value,key+" "+kind);
  if(kind!=="column"){
   assert.equal(d.absolute_x2_mm,12000.875);assert.equal(d.absolute_y2_mm,10501);assert.equal(d.end_z_mm,7650);
  }
  if(kind==="bent"){
   assert.equal(d.absolute_mid_x_mm,10600.625);assert.equal(d.absolute_mid_y_mm,9600.75);
   assert.equal(d.mid_z_mm,9123);assert.equal(d.ridge_mode,"manual");
  }
 }
 for(const [qty,destination,pattern] of [
  [1,{x:8000,y:9000},/Нет остатка/],[5,{x:2000.125,y:3000.25},/другое место/],
  [5,{x:13000,y:12000},/выходит за границу/]
 ]){
  const c=fixture("bent",qty);
  await assert.rejects(()=>c.copy("original",destination),pattern);
  assert.equal(c.rows.length,1);
 }
 const c=fixture("bent"),destination={x:8000,y:8500};
 await c.copy("original",destination);
 await assert.rejects(()=>c.copy("original",destination),/уже размещён/);
 assert.equal(c.rows.length,2);
 console.log("Scheme copy tests: bent, beams, columns, braces, trusses, quota, bounds and fractional offsets OK");
})().catch(e=>{console.error(e);process.exitCode=1});


// Position copy is separate from quota-limited placement copy.
const building=fs.readFileSync("src/scheme-building-view.js","utf8");
const styling=fs.readFileSync("src/scheme-building-view.css","utf8");
assert(building.includes('id="irbCopySelected"')&&building.includes('id="irbCopyPosition"'),"two distinct copy actions are available");
assert(building.includes("props.onCopyPosition(String(c.id))"),"position copy calls the existing scheme editor");
assert(building.includes("if(!props.canEdit||!quota?.left)return"),"placement copy still respects quotas");
assert(!building.includes("copyParams.disabled=true"),"position template available with exhausted mark");
assert(file.includes("onCopyPosition:id=>")&&file.includes("openEditor({...record,...coord(record)},true)"),"saved position and elevations passed to the editor");
assert(file.includes('f.dataset.copyPosition=copyingPosition?"1":"0"'),"template copies distinguished from editing");
assert(file.includes("if(value&&!editingId&&!copyingPosition)"),"mark change does not erase copied elevations");
assert(file.includes("f.elements.z0_mm.value=c?.z0??c?.z0_mm??0"),"bottom Z copied");
assert(file.includes("f.elements.z1_mm.value=c?.z2??c?.z1_mm??8400"),"end Z copied");
assert(file.includes("f.elements.mid_z_mm.value=c.mz"),"ridge Z copied");
assert(file.includes("f.elements.rotation_deg.value=c?.rotation_deg??0"),"rotation copied");
assert(file.includes('f.elements.profile_name.value=shapeSource.profile_name||""'),"profile copied");
assert(file.includes('if(!id&&f.dataset.copyPosition==="1")'),"copy duplicate position is rejected");
assert(file.includes('guessGeometry(m)!==(kind==="bent"?"beam":kind)'),"mark and copied geometry must agree");
assert(styling.includes(".irb-immersive>.irb-viewport>#irbQuickAdd.irb-floating-add{")&&styling.includes("position:absolute!important;top:13px!important;right:16px!important"),"Add remains top-right with selector matching its real parent");
console.log("Position copy: full geometry, quotas, and safe duplicate handling OK.");
