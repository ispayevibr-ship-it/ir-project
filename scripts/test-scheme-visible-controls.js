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



// 1.7.203: actual DOM, not cascading over legacy 3-column action styles.
assert(view.includes('viewport.classList.toggle("irb-webgl",!!webgl)'),"WebGL mode class belongs to the viewport");
assert(view.includes('viewport.appendChild(addButton)')&&view.includes('addButton.id="irbQuickAdd"'),"the only Add action belongs to the 3D viewport");
assert(!view.includes('id="irbStartRight"')&&!view.includes('id="irbStart"'),"no duplicate Add actions in properties or layers sidebar");
assert(!view.includes('class="irb-action-row"'),"legacy selected-member action layout is not generated");
assert(view.includes('class="irb-mark-actions"'),"selected element owns a dedicated action grid");
for(const id of ["irbSelectDetails","irbCopyPosition","irbCopySelected","irbDeleteSelected"])
 assert(view.includes('id="'+id+'"'),id+" action is retained");
assert(view.includes('props.onCopyPosition(String(c.id))'),"copy-position handler remains functional");
assert(view.includes('props.onEdit(String(c.id))'),"edit handler remains functional");
assert(view.includes('props.onDelete(String(c.id))'),"delete handler remains functional");
assert(view.includes('if(!props.canEdit||!quota?.left)return'),"copy placement respects remaining quantities");
assert(viewCss.includes('.irb-immersive>.irb-viewport>#irbQuickAdd.irb-floating-add{'),"Add fixed at the viewport corner");
assert(viewCss.includes('.irb-immersive>.irb-viewport>.irb-properties .irb-mark-actions{'),"grid matches the actual nested panel");
assert(viewCss.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'),"mark actions have two equal columns");
assert(viewCss.includes('grid-auto-rows:minmax(52px,auto)!important'),"rows expand for wrapped action labels");
assert(viewCss.includes('>.irb-mark-action{'),"all four buttons have the same size and styling");
assert(viewCss.includes('max-height:none!important;overflow:visible!important'),"grid does not clip actions");
assert(viewCss.includes('>#irbDeleteSelected{'),"delete button occupies its own equal-size cell");
assert(!viewCss.includes('/* The selected mark has four actions, not the old three-column layout. */'),"obsolete 1.7.202 patch removed");
assert(viewCss.includes('overflow-x:auto!important;overflow-y:hidden!important'),"upper toolbar remains scrollable when needed");
const builtCss=fs.readFileSync("src/ir-styles.css","utf8");
assert(builtCss.includes('.irb-immersive>.irb-viewport>.irb-properties .irb-mark-actions{'),"generated CSS contains revised grid");
console.log("3D layout: single Add button, aligned 2x2 mark actions, no old 3-column cascade.");
