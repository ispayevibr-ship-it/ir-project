"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const page=fs.readFileSync("src/scheme-page.js","utf8");
const view=fs.readFileSync("src/scheme-building-view.js","utf8");
const css=fs.readFileSync("src/scheme-page.css","utf8");
const viewCss=fs.readFileSync("src/scheme-building-view.css","utf8");
const html=fs.readFileSync("src/index.html","utf8");
assert(viewCss.includes(".scheme-page-building .scheme-stage-toolbar{display:none!important}"),
 "3D outer toolbar is hidden so switches must be in 3D viewport");
assert.match(view, /topControls\.innerHTML=[\s\S]*?id="irbDimensionsToggle"/);
assert.match(view, /topControls\.innerHTML=[\s\S]*?id="irbLabelsToggle"/);
assert(view.includes('dimensionButton.onclick=()=>'));
assert(view.includes('labelButton.onclick=()=>'));
assert(view.includes('props.onAnnotationToggle?.(showMemberLabels,showDimensions)'));
assert(page.includes('onAnnotationToggle:(labels,dimensions)=>'));
assert(/scheme-grid-outline-plan" fill="none"/.test(page),"plan outline must not cover the plan with SVG default black fill");
assert(css.includes(".scheme-grid-outline-plan{fill:none!important"),
 "CSS must prevent plan outline black fill");
assert(html.includes("ir-runtime.js?v="), "generated JS must have cache busting");
console.log("3D visible annotation controls and non-black 2D plan outline verified");


// 1.7.202: prevent the 3D toolbar / selected-mark actions from colliding.
assert(view.includes('viewport.classList.toggle("irb-webgl",!!webgl)'),"WebGL class belongs to the viewport");
assert(view.includes('viewport.appendChild(addButton)')&&view.includes('addButton.id="irbQuickAdd"'),"Add control is a direct viewport child");
assert(viewCss.includes(".irb-immersive>.irb-viewport>#irbQuickAdd.irb-floating-add{"),"Add positioning targets its actual DOM parent");
assert(!viewCss.includes(".irb-webgl .irb-viewport>.irb-floating-add"),"incorrect ancestor selector removed");
assert(viewCss.includes('.irb-immersive .irb-layers #irbStart{display:none!important}'),"old sidebar Add action cannot duplicate the floating Add button");
assert(view.includes('id="irbSelectDetails"')&&view.includes('id="irbCopySelected"')&&view.includes('id="irbCopyPosition"')&&view.includes('id="irbDeleteSelected"'),"details panel still contains edit, both copy actions and delete");
assert(view.includes('pane.dataset.irbPanelMode=nextMode'),"selected member actions use the details panel mode");
assert(viewCss.includes('.irb-properties[data-irb-panel-mode="details"] .irb-action-row{'),"details actions use their own layout rather than the old three-slot grid");
assert(viewCss.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'),"two independent copy action columns");
assert(viewCss.includes('.irb-action-row>:is(#irbCopySelected,#irbCopyPosition){'),"copy actions receive equal cell widths and wrapping");
assert(viewCss.includes('grid-column:1/-1!important'),"edit action spans the full panel width");
assert(viewCss.includes('.irb-action-row>#irbDeleteSelected{'),"delete action has a dedicated grid cell");
assert(viewCss.includes('height:auto!important;min-height:43px!important;max-height:none!important'),"long copy labels wrap instead of overlapping");
assert(viewCss.includes('right:calc(min(305px,38vw) + 16px)!important'),"floating Add stays to the left of an open details panel");
assert(viewCss.includes('overflow-x:auto!important;overflow-y:hidden!important'),"toolbar remains accessible in narrow windows without covering the Add action");
assert(viewCss.includes('@media(max-width:820px){'),"compact width uses separate camera and toolbar rows");
const builtCss=fs.readFileSync("src/ir-styles.css","utf8");
assert(builtCss.includes('.irb-immersive>.irb-viewport>#irbQuickAdd.irb-floating-add{'),"generated CSS includes the corrected controls");
console.log("3D controls: fixed Add, non-overlapping copy/edit/delete, desktop/mobile toolbar and generated CSS OK");
