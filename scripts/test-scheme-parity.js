"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm");
const page=fs.readFileSync("src/scheme-page.js","utf8"),
  view=fs.readFileSync("src/scheme-building-view.js","utf8"),
  styles=fs.readFileSync("src/scheme-page.css","utf8");
const start=page.indexOf(" // Shared view state:"),
 end=page.indexOf(" const backgroundChoices=",start);
assert(start>=0&&end>start,"shared plan/3D view-state helpers are present");
const storageValues={"ir-project-3d-colors":"status","ir-project-3d-sections.test":'["x:1:2"]'};
const storage={getItem:key=>storageValues[key]??null,setItem:(key,value)=>{storageValues[key]=value}};
const calls=[],control={textContent:""};
const scope={
 oid:"test",localStorage:storage,
 axesX:["1","2","3"],axesY:["А","Б","В"],
 axisXPos:new Map([["1",0],["2",5000],["3",10000]]),
 axisYPos:new Map([["А",0],["Б",7500],["В",15000]]),
 mode:"plan",num:v=>Number(v)||0,recordMarkGroup:c=>({key:c.group||"beams"}),
 document:{getElementById:id=>id==="schemePlanColor"?control:null},
 renderScene:()=>calls.push("render")
};
const parity=vm.runInNewContext(page.slice(start,end)+"\n({cutBands,cutFor,planCutVisible,changeColorMode,planMemberColor})",scope);
const col={geometryType:"column",x:1500,y:1000,z0:0,z2:10000,mark:"К105",group:"columns"};
const second={...col,x:7000};
assert.equal(parity.cutFor(col,"X").id,"x:1:2","plan cut maps the same x-axis bay as 3D");
assert.equal(parity.cutFor(second,"X").id,"x:2:3","next column belongs to the next x bay");
assert.equal(parity.planCutVisible(col),false,"shared hidden 3D section removes the plan member");
assert.equal(parity.planCutVisible(second),true,"other grid sections remain visible");
parity.changeColorMode("type");
assert.equal(storageValues["ir-project-3d-colors"],"type","plan stores the 3D color preference");
assert.equal(control.textContent,"◉ Цвет: виды","plan toolbar displays the new color mode");
assert.equal(parity.planMemberColor(col),"#2970d4","type colors use the 3D category palette");
parity.changeColorMode("mark");
assert.equal(parity.planMemberColor(col),parity.planMemberColor({...col,id:"different"}),"same marks keep identical colors");
assert.notEqual(parity.planMemberColor(col),parity.planMemberColor({...col,mark:"К106"}),"different mark colors are distinguishable");
assert.equal(calls.length,2,"plan color mode changes repaint the plan");
assert(page.includes('data-plan-cut='),"plan has 3D-style section checkboxes");
assert(page.includes('id="schemePlanCutsReset"'),"plan cuts can be reset");
assert(page.includes('id="schemePlanColor"'),"plan can cycle colors by status, category, and mark");
assert(page.includes('cutHidden=input.checked?cutHidden.filter'),"cut section visibility is saved from plan");
assert(view.includes("props.onCutsChange?.([...state.hiddenSections])"),"3D propagates cut changes back to the shared controller");
assert(view.includes("props.onColorModeChange?.(mode)"),"3D propagates the color mode to the shared controller");
assert(view.includes("Array.isArray(props.hiddenSections)"),"3D reads cuts modified in Plan");
assert(view.includes('includes(props.colorMode)'),"3D reads Plan color changes");
assert(page.includes('const cols=mode==="plan"?columns().filter(planCutVisible):columns()'),"plan only filters the drawn construction set");
assert(page.includes('data-scheme-copy-place'),"plan has the same placement-copy action as 3D");
assert(page.includes('copySchemeMember(planCopySource,{x,y})'),"plan uses the existing quota-safe geometry-preserving copy function");
assert(page.includes('layer.getScreenCTM()'),"plan pointer translation handles panning/zooming");
assert(page.includes('if(r===90)')&&page.includes('else if(r===180)')&&page.includes('else if(r===270)'),"plan copy placement accounts for rotated grid");
assert(page.includes('id="schemeCopyCancel"'),"plan copy can be cancelled");
assert(page.includes('planCopySource="";mode=b.dataset.mode'),"pending copy is cancelled when switching view");
assert(styles.includes('.scheme-column[data-parity-color="1"]:not(.selected)'),"plan colors apply without overriding selected highlights");
assert(styles.includes(".scheme-detail-actions{display:grid!important"),"all four plan actions use an adaptive grid");
assert(styles.includes(".scheme-plan-cuts>summary"),"cut control has local layout");
assert(styles.includes(".scheme-copy-instruction"),"plan copy mode has a visible hint");
console.log("Plan/3D parity: common colors, cuts, copy, and selection actions verified.");
