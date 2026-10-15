"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const code=fs.readFileSync("src/scheme-page.js","utf8");
const i=code.indexOf(" let cachedSchemeRows="),j=code.indexOf("\n const recordWorkId=",i);
const k=code.indexOf(" const markPlacement=m=>"),l=code.indexOf("\n const searchMarks=",k);
assert(i>0&&j>i&&k>0&&l>k);
const scope={rows:[],arr:v=>Array.isArray(v)?v:[],linkedMark:r=>r.mark_id?{id:r.mark_id}:null,num:v=>Number(v)||0};
const api=vm.runInNewContext(code.slice(i,j)+"\n"+code.slice(k,l)+"\n({allRecords,markPlacement,markAvailable,storedSchemeElement,rememberSavedSchemeRecord})",scope);
scope.rows=Array.from({length:1900},(_,i)=>({id:i+1,record_type:"scheme_column",data:{mark_id:String(i%100)}}));
const first=api.allRecords();assert.equal(first.length,1900);
assert.equal(api.allRecords(),first,"identical source rows reuse the same cached view");
for(let n=0;n<350;n++)assert.equal(api.markPlacement({id:String(n%100),qty:25}).placed,19);
assert.equal(api.markAvailable({id:"1",qty:19},"2"),true);
assert.equal(api.markAvailable({id:"1",qty:19},"none"),false);
assert.equal(api.rememberSavedSchemeRecord({id:1901,record_type:"scheme_column",data:{mark_id:"1"}}),true);
assert.notEqual(api.allRecords(),first,"new rows invalidate the cached view");
assert.equal(api.markPlacement({id:"1",qty:25}).placed,20);
assert.equal(api.rememberSavedSchemeRecord({id:1901,record_type:"scheme_column",data:{mark_id:"2"}}),true);
assert.equal(api.markPlacement({id:"1",qty:25}).placed,19);
assert.equal(api.markPlacement({id:"2",qty:25}).placed,20);
const viewer=fs.readFileSync("src/scheme-building-view.js","utf8");
assert(viewer.includes("updateRecords:(elements,groups,marks,selected)"));
assert.equal(viewer.includes("＋ Добавить марку"),false);

const recordBefore=api.allRecords().find(r=>r.id==="1901");
assert.equal(api.rememberSavedSchemeRecord({id:"1901",record_type:"scheme_column",data:{
 mark_id:"2",mark:"К105",z0_mm:9325,z1_mm:9695,end_z_mm:9695
}}),true);
const elevation=api.storedSchemeElement("1901");
assert.notEqual(elevation,recordBefore,"edited construction is replaced in the cache");
assert.equal(elevation.z0_mm,9325,"bottom level is refreshed in memory");
assert.equal(elevation.end_z_mm,9695,"end elevation is refreshed in memory");
assert.equal(api.markPlacement({id:"2",qty:25}).placed,20,"updating geometry does not create extra placements");
assert(code.includes("const latest=await schemeApi.list();"),"existing edits re-read persisted elevations immediately");
assert(code.includes("if(id||!merged)"),"normal create path remains fast; existing edits fetch authoritative state");
assert(code.includes("window.irBuildingView.updateRecords(visible"),"3D model is refreshed in place");
assert(code.includes("renderDetails();\n  const s=stats(),mp=statusCounts();"),"outer properties panel refreshes the new Z values");
assert(viewer.includes("let boxCache=new WeakMap()"),"GPU prism geometry cache is resettable");
assert(viewer.includes("invalidate(){boxCache=new WeakMap()}"),"WebGL renderer can discard outdated elevations");
assert(viewer.includes("webgl?.invalidate();"),"3D data refresh invalidates cached solid geometry");
assert(viewer.includes("refreshPanel();refreshFindControls()"),"3D sidebar refreshes selected mark coordinates");
console.log("Scheme performance: cached quotas, persisted Z changes, sidebars and in-place GPU geometry refresh OK");



// Top-view vertical members collapse to points. Keep their plan symbols and picking.
const helperStart=viewer.indexOf("  const isPlanUpright=c=>"),helperEnd=viewer.indexOf("\n  // Batch pointer/",helperStart);
assert(helperStart>0&&helperEnd>helperStart,"plan upright helper exists");
const isPlanUpright=vm.runInNewContext(viewer.slice(helperStart,helperEnd)+"\n isPlanUpright",{
 num:v=>Number(v)||0,typeKey:c=>c.scheme_group||"other",Math
});
assert.equal(isPlanUpright({geometryType:"column",x:0,y:0,z0:0,z2:9750}),true,"column appears overhead");
assert.equal(isPlanUpright({geometryType:"beam",scheme_group:"posts",x:8000,y:9000,z0:0,z2:9000}),true,"upright post appears overhead");
assert.equal(isPlanUpright({geometryType:"beam",x:0,y:0,x2:0,y2:0,z0:0,z2:4500}),true,"legacy vertical element is visible overhead");
assert.equal(isPlanUpright({geometryType:"beam",x:0,y:0,x2:6000,y2:0,z0:8500,z2:8500}),false,"horizontal beam does not get a column symbol");
assert(viewer.includes('if(state.preset==="top")')&&viewer.includes("ctx.strokeRect(p.x-size/2"),"overhead footprint drawn above WebGL");
assert(viewer.includes("const nearestMember=(x,y)=>")&&viewer.includes("if(best&&distance<=12)return best"),"vertical plan symbols can be selected");
assert(viewer.includes("viewport.appendChild(addButton)")&&viewer.includes('addButton.id="irbQuickAdd"'),"Add button is always in the 3D viewport");
assert(!viewer.includes('id="irbQuickAdd" class="irb-top-add"'),"Add no longer buried in the left toolbar");
console.log("Overhead plan: columns/posts visible, selectable; Add pinned right.");
