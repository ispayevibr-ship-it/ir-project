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
