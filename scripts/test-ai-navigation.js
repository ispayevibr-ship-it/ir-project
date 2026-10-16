"use strict";
/* Algorithmic drawings integration regression: no neural runtime or model UI. */
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const paths=["main.js","preload.js","src/app.js","src/object-shell.js","src/tabs-shell.js",
 "src/profile-ui.js","src/index.html","src/ai-recognition-page.js",
 "src/ai-scheme-lite-page.js","src/ir-runtime.js"];
const src=Object.fromEntries(paths.map(p=>[p,fs.readFileSync(p,"utf8")]));
for(const path of paths.filter(x=>x.endsWith(".js")))new vm.Script(src[path],{filename:path});
assert(src["main.js"].includes("registerAiDocuments();"),"native documents registered");
assert(src["main.js"].includes('const aiPdf=aiPdfIndex.createPdfIndex'),"native PDF index retained");
assert(src["main.js"].includes('aiPdfGeometry'),"native PDF vector module retained");
assert(src["preload.js"].includes('ai-pdf:index'),"context bridge: PDF index");
assert(src["preload.js"].includes('ai-pdf:preview'),"context bridge: PDF source preview");
assert(src["preload.js"].includes('ai-pdf:geometry'),"context bridge: PDF geometry");
assert(src["preload.js"].includes('aiMounting'),"context bridge: montage placement");
assert(src["src/app.js"].includes('key==="ai-recognition"&&window.irAiRecognitionPage'),"old route remains compatible");
assert(src["src/object-shell.js"].includes('makeButton("Чертежи КМ/КМД","ai-recognition"'),"sidebar renamed");
assert(src["src/tabs-shell.js"].includes('"ai-recognition":"Чертежи КМ/КМД"'),"tab renamed");
assert(src["src/index.html"].includes("ai-recognition-page.js"),"document UI loaded");
assert(src["src/ai-recognition-page.js"].includes("Проиндексировать все чертежи"),"batch index");
assert(src["src/ai-recognition-page.js"].includes("data-kmd-tab"),"geometry analysis tab");
assert(src["src/ai-recognition-page.js"].includes("irapp://app/src/ai-scheme-lite-page.js"),"safe lazy scheme module");
assert(src["src/ai-scheme-lite-page.js"].includes("reviewIndexedPlanPage"),"vector plan workflow preserved");
assert(src["src/ir-runtime.js"].includes("Чертежи КМ/КМД"),"bundled navigation updated");
for(const path of ["main.js","preload.js","src/index.html","src/profile-ui.js",
 "src/ai-recognition-page.js","src/ai-scheme-lite-page.js"])
 assert(!/Qwen|PaddleOCR|aiModels|aiEngine|aiWorkflow|irAiModelSettings/.test(src[path]),
  "neural feature must not remain in "+path);
for(const path of ["src/ai-local-engine.js","src/ai-model-manager.js",
 "src/ai-paddle-ocr.js","src/ai-workflow.js","src/ai-model-settings.js"])
 assert(!fs.existsSync(path),"model/inference source must be absent: "+path);
console.log("KM/KMD algorithmic-only navigation and preserved indexes, source PDFs, 3D/montage bridge PASS");