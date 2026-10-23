"use strict";
/* The montage scheme has one view, 3D (Three.js). The page keeps data, filters, cuts and the details panel. */
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const page=fs.readFileSync("src/scheme-page.js","utf8");
const view=fs.readFileSync("src/scheme-three-view.js","utf8");
const css=fs.readFileSync("src/scheme-page.css","utf8");
const built=fs.readFileSync("src/ir-styles.css","utf8");
const runtime=fs.readFileSync("src/ir-runtime.js","utf8");
const html=fs.readFileSync("src/index.html","utf8");
// Only 3D: no mode switches, no plan or building renderer.
assert(!/data-mode=|Общий 3D|scheme-view-switch|scheme-preview-mode-switch/.test(page),"mode switches removed");
assert(!/renderUnifiedBuilding|irBuildingView|planSvg|bindScenePanZoom|schemePlanColor/.test(page),"plan and building renderers removed");
assert(!fs.existsSync("src/scheme-building-view.js")&&!html.includes("steel-geometry.js")&&!runtime.includes("irBuildingView.render"),"old 3D module removed");
assert(page.includes("window.irThreeSchemeView.render(box,{"),"3D is the scheme view");
// Functions moved from the plan and the old 3D view.
for(const prop of ["showLabels:labelsVisible","showDimensions:dimensionsVisible","background:currentBackground()","gridDirX,gridDirY",
 "marks:activeMarks().map(","onQuickPlace:frameMode?createFrameMember:null","onPlacement:placement=>openEditor(null,false,placement)",
 "onCopyPlacement:(id,target)=>copySchemeMember(id,target)","onColorModeChange:next=>changeColorMode(next)","elements:members.map(c=>({...c,scheme_group:recordMarkGroup(c).key}))"])
 assert(page.includes(prop),"3D gets "+prop);
assert(page.includes('<aside class="scheme-details" id="schemeDetails"></aside>'),"details panel with element search is shown next to 3D");
assert(page.includes('<details class="scheme-plan-cuts">')&&page.includes("const members=columns().filter(planCutVisible)"),"cuts work in 3D");
assert(page.includes("window.irThreeSchemeView?.startCopy?.(String(c.id))"),"copy placement picks the place in 3D");
assert(page.includes("window.irThreeSchemeView?.focus?.(String(entry.id))"),"choosing an element in the list flies the camera to it");
assert(page.includes('irProject.ai.invoke("ai-montage:clear-scheme"')&&page.includes('irProject.ai.invoke("ai-montage:restore-scheme"'),"clear and restore the scheme");
// Viewer features.
assert(view.includes("function paintLabels(")&&view.includes("shown>=160"),"member labels without overlap");
assert(view.includes("function dimensionChain(")&&view.includes('"dims"'),"grid bay dimensions");
assert(view.includes("function paintLegend(")&&view.includes("function applyBackground("),"colour legend and page background");
// Cranes: a runway is known by the member's own name (mark_name; the title of a record is its position «PDF-…»), they
// have their own colour, the legend counts them and a click there shows them one by one.
assert(/function runwayKind\(c\)\{\s*var n=String\(c\.mark_name\|\|c\.title\|\|""\)/.test(view)&&view.includes('function slight(c){var t=String(c.mark_name||c.title||"")'),"cranes and railings by the member's name");
assert(view.includes("color:0xff6a00")&&view.includes("Краны (условно)")&&view.includes("legend.onclick=function(e){")&&view.includes("cranes.push({at:mid.clone().setY(gTop)"),"cranes in the legend, a click flies to them");
assert(view.includes('dirX==="rtl"?spanX-number(x)')&&view.includes('dirY==="btt"?spanY-number(y)'),"grid direction honoured");
assert(view.includes("function startPlacement(")&&view.includes("function snapMember(")&&view.includes("function snapGround("),"placement by clicks with snapping");
assert(view.includes('"верх "+(c.mark||"колонны")'),"beams rest on column tops");
assert(view.includes("P.onQuickPlace(data)")&&view.includes("P.onQuickPlaced&&P.onQuickPlaced(result)"),"placement saved through the page checks");
assert(view.includes("active.host===host&&active.key===key")&&view.includes("cameraMemory[memoryKey]"),"updates keep WebGL and the camera");
assert(view.includes('"./vendor/three/three.min.js"')&&fs.existsSync("src/vendor/three/three.min.js")&&fs.existsSync("src/vendor/three/OrbitControls.js"),"Three.js works offline");
assert(!view.includes("schemeApi."),"viewer never writes data itself");
assert(view.includes("renderer.dispose();renderer.forceContextLoss?.();"),"GPU cleanup");
assert(css.includes(".ir-three-place{")&&built.includes(".ir-three-member-label{"),"styles compiled");
assert(html.indexOf("scheme-three-view.js?v=")<html.indexOf("ir-runtime.js?v="),"script order");
const scope={window:{},Promise,Map,Set,Math,Number,Array,String,Error,JSON,document:{}};
vm.runInNewContext(view,scope);
for(const fn of ["render","dispose","focus","startCopy","startPlacement"])assert.equal(typeof scope.window.irThreeSchemeView[fn],"function",fn);
assert.equal(scope.window.irThreeSchemeView.focus("1"),undefined,"API calls are safe without a model");
const manifest=JSON.parse(fs.readFileSync("hot/latest.json","utf8")).files.map(f=>f.target);
assert(manifest.includes("src/vendor/three/three.min.js")&&manifest.includes("src/scheme-three-view.js"),"3D files come with the hot update");
console.log("Montage scheme: single 3D view with labels, dimensions, cuts, placement, copy, clear/restore PASS");
