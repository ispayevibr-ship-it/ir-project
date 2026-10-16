"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const bundle=fs.readFileSync("src/ir-runtime.js","utf8"),
 styles=fs.readFileSync("src/ir-styles.css","utf8"),
 ui=fs.readFileSync("src/scheme-page.js","utf8"),
 css=fs.readFileSync("src/scheme-page.css","utf8"),
 html=fs.readFileSync("src/index.html","utf8");
new vm.Script(bundle,{filename:"ir-runtime.js"});
assert(ui.includes('id="schemeResetAll"'),"source contains reset");
assert(bundle.includes('id="schemeResetAll"'),"Windows app loads reset control from bundled runtime");
assert(bundle.includes("resetWholeScheme"),"Windows runtime wires batch reset to IPC");
assert(css.includes(".scheme-reset-all"),"source styles reset button");
assert(styles.includes(".scheme-head-actions .scheme-reset-all"),"compiled styles reset button");
assert(html.includes("ir-runtime.js?v=17221")&&html.includes("ir-styles.css?v=17221"),
 "new Windows install invalidates stale UI cache");
console.log("Scheme reset: Windows bundle and cache token match source UI PASS");
