"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const page=fs.readFileSync("src/scheme-page.js","utf8");
const view=fs.readFileSync("src/scheme-three-view.js","utf8");
const css=fs.readFileSync("src/scheme-page.css","utf8");
const built=fs.readFileSync("src/ir-styles.css","utf8");
const runtime=fs.readFileSync("src/ir-runtime.js","utf8");
const html=fs.readFileSync("src/index.html","utf8");
assert(page.includes('data-mode="building"')&&page.includes('data-mode="plan"')&&page.includes('data-mode="three"'),"all three modes remain");
assert(page.includes('["building","plan","three"].includes(b.dataset.mode)'),"three-mode selector");
assert(page.includes('window.irThreeSchemeView.render(box,{'),"independent Three.js viewer");
assert(page.includes('members.map(c=>({...c,scheme_group:recordMarkGroup(c).key}))'),"real member records");
assert(page.includes('gridX:Object.fromEntries(axisXPos),gridY:Object.fromEntries(axisYPos)'),"saved axes used");
assert(page.includes('canEdit:Boolean(canEdit()&&activeWorkId)'),"role-based editing rights");
for(const action of ["onAdd:()=>","onEdit:id=>","onCopyPosition:id=>",
 "onCopyPlacement:(id,target)=>copySchemeMember(id,target)","onCopied:id=>",
 "onDelete:async id=>","onFullscreen:()=>"]){
 assert(page.includes(action),"scheme editor delegation: "+action)
}
assert(view.includes('props.onEdit&&props.onEdit(selected)')&&view.includes('props.onAdd&&props.onAdd()'),"add/edit button wiring");
assert(view.includes('props.onDelete&&props.onDelete(selected)')&&view.includes('props.onCopyPosition&&props.onCopyPosition(selected)'),"copy/delete buttons");
assert(view.includes('props.onCopyPlacement(copySource,{x:point.x*1000,y:point.z*1000})'),"ground picking converts to original XY mm");
assert(view.includes('copyBusy=true')&&view.includes('if(copyBusy||!copySource||!props.canEdit'),"copy guards");
assert(view.includes('if(props.canEdit)')&&view.includes('props.canEdit?'),"viewer actions hidden for viewer role");
assert(view.includes('props.onFullscreen&&props.onFullscreen()')&&view.includes('props.isFullscreen'),"stage fullscreen delegated");
assert(css.includes('.scheme-workspace:has(>.scheme-three-stage){grid-template-columns:minmax(0,1fr)!important}'),"three full width");
assert(css.includes('.scheme-three-stage.scheme-preview-fullscreen .scheme-canvas'),"real full height");
assert(built.includes('.ir-three-copy-hint')&&built.includes('.scheme-workspace:has(>.scheme-three-stage)'),"compiled CSS");
assert(runtime.includes('onCopyPlacement:(id,target)=>copySchemeMember(id,target)'),"compiled JS");
assert(html.indexOf('scheme-three-view.js?v=')<html.indexOf('ir-runtime.js?v='),"script order");
assert(view.includes("three@0.147.0"),"fixed Three.js version");
assert(view.includes("new T.WebGLRenderer(")&&view.includes("new T.Raycaster()"),"real WebGL and picking");
assert(view.includes("new T.ExtrudeGeometry("),"volumetric member sections");
assert(view.includes("renderer.dispose();renderer.forceContextLoss?.();"),"GPU cleanup");
assert(!view.includes("schemeApi.create(")&&!view.includes("schemeApi.remove("),"viewer delegates data changes");
vm.runInNewContext(view,{window:{},Promise,Map,Math,Number,Array,String,Error});
console.log("Three.js full-width editing integration and 3D viewer regression passed.");
