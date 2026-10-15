"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const page=fs.readFileSync("src/scheme-page.js","utf8");
const view=fs.readFileSync("src/scheme-three-view.js","utf8");
const css=fs.readFileSync("src/scheme-page.css","utf8");
const built=fs.readFileSync("src/ir-styles.css","utf8");
const html=fs.readFileSync("src/index.html","utf8");
assert(page.includes('data-mode="building"')&&page.includes('data-mode="plan"')&&page.includes('data-mode="three"'),
 "Plan, existing 3D, and independent Three.js modes stay selectable");
assert(page.includes('["building","plan","three"].includes(b.dataset.mode)'),"mode switch allows exactly three modes");
assert(page.includes('if(mode==="three"){')&&page.includes('window.irThreeSchemeView.render(box,{'),
 "Three.js is rendered from the existing scheme screen, not a replacement");
assert(page.includes("members.map(c=>({...c,scheme_group:recordMarkGroup(c).key}))"),
 "Three.js consumes current scheme elements and their actual mark groups");
assert(page.includes("objectId:oid,axesX:[...axesX],axesY:[...axesY],spanX,spanY,"),
 "Three.js receives authoritative scheme axes and dimensions");
assert(page.includes("gridX:Object.fromEntries(axisXPos),gridY:Object.fromEntries(axisYPos),"),
 "model coordinates use saved grid positions");
assert(page.includes("onSelect:id=>{selectedId=id;renderDetails()}"),
 "selected element is shared with Plan and 3D");
assert(page.includes('if(mode==="three")window.irBuildingView?.dispose?.();'),
 "old WebGL renderer stops before starting Three.js");
assert(page.includes('else window.irThreeSchemeView?.dispose?.();'),
 "Three.js disposes before returning to Plan or original 3D");
assert(page.includes('mode!=="three"?'),"editor Add button is not shown in read-only Three.js");
assert(html.indexOf('scheme-three-view.js?v=')<html.indexOf('ir-runtime.js?v='),
 "independent Three.js view module loads before main scheme page");
assert(css.includes(".scheme-three-stage .scheme-canvas"),"independent mode has its own canvas layout");
assert(css.includes(".ir-three-toolbar")&&css.includes(".ir-three-properties"),
 "new toolbar and properties panel are not the legacy 3D controls");
assert(built.includes(".ir-three-viewport")&&built.includes(".ir-three-right"),
 "generated stylesheet includes the experimental viewer");
assert(view.includes("three@0.147.0"),"Three.js and controls are locked to one compatible release");
assert(view.includes('if(!loadPromise)loadPromise=Promise.resolve()'),
 "Three.js is loaded lazily, not on every application page");
assert(view.includes("window.THREE.OrbitControls"),"real Three.js OrbitControls are used");
assert(view.includes("new T.ExtrudeGeometry("),"members have real volumetric profiles");
assert(view.includes("new T.WebGLRenderer(")&&view.includes("new T.Raycaster()"),
 "3D uses real WebGL with interactive member selection");
assert(view.includes('return member.geometryType==="bent"?')&&view.includes("c.z0")&&view.includes("c.z2"),
 "members are built from persisted XYZ and both elevation coordinates");
assert(view.includes('renderer.dispose();renderer.forceContextLoss?.();'),
 "renderer and GPU are released when leaving mode");
assert(view.includes("token++")&&view.includes("myToken!==token"),
 "late library loads cannot overwrite Plan after mode switch");
for(const forbidden of ["schemeApi.create(","schemeApi.update(","schemeApi.remove(","irProject.data.","onEdit:","onDelete:"]){
 assert(!view.includes(forbidden),"standalone test view must not mutate construction data: "+forbidden)
}
vm.runInNewContext(view,{window:{},Promise,Map,Math,Number,Array,String,Error});
console.log("Independent Three.js scheme: real records, safe read-only lifecycle and three modes verified.");
