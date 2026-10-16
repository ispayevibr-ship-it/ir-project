"use strict";
/* Deterministic KM/KMD documents UI regression. No model executor or OCR. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync(require("node:path").join(__dirname,"../src/ai-recognition-page.js"),"utf8");
for(const phrase of ["Проиндексировать все чертежи","Чертежи КМ/КМД",
 "Геометрический анализ","irapp://app/src/ai-scheme-lite-page.js","✓ Индексирован"])
 assert(source.includes(phrase),phrase);
for(const bad of [/aiEngine\b/,/aiModels\b/,/aiWorkflow\b/,/PaddleOCR/,/\bQwen\b/,
 /data-ai-pdf-vision/,/\/v1\/chat\/completions/])
 assert(!bad.test(source),"no neural runtime in document page: "+bad);
const sha=n=>String(n).repeat(64);
const docs=[{id:1,name:"КМД 01.pdf",kind:"КМД",ext:".pdf",sha256:sha(1),
 exists:true,size:2800},{id:2,name:"КМД 02.pdf",kind:"КМД",ext:".pdf",
 sha256:sha(2),exists:true,size:4000},{id:3,name:"КМД 03.pdf",kind:"КМД",
 ext:".pdf",sha256:sha(3),exists:true,size:5000}];
const indexes=[{id:101,documentId:1,sourceSha256:sha(1),totalPages:2,
 pages:[{page:1,hasTextLayer:true},{page:2,hasTextLayer:true}]}];
const dom=new Map();
function get(selector){
 if(!dom.has(selector))dom.set(selector,{innerHTML:"",
  onclick:null,disabled:false,textContent:"",value:"КМД",className:"",
  style:{},focus(){},setSelectionRange(){},addEventListener(){},dataset:{},
  querySelector:get,querySelectorAll:()=>[]});
 return dom.get(selector)
}
const root={innerHTML:"",querySelector:get,querySelectorAll:()=>[]};
const app=document=>document==="app"?root:null;
let runs=[],inflight=0,peak=0,finishSecond;
const pending=new Promise(resolve=>{finishSecond=resolve});
const fakePdf={
 list:async()=>indexes,
 index:async (_objectId,documentId)=>{
  const id=Number(documentId);runs.push(id);inflight++;peak=Math.max(peak,inflight);
  if(id===2)await pending;
  inflight--;if(id===3)throw Error("повреждённый PDF");
  const item={id:100+id,documentId:id,sourceSha256:sha(id),totalPages:2,
   pages:[{page:1,hasTextLayer:true},{page:2,hasTextLayer:false}]};
  indexes.push(item);return item
 },
 onProgress:()=>()=>{},
 preview:async()=>({dataUrl:"data:image/png;base64,iVBORw0KGgo="})
};
const page={
 data:{objects:{get:async()=>({id:7,name:"Стройка"})}},
 aiDocuments:{list:async()=>docs,select:async()=>({canceled:true})},
 aiPdf:fakePdf
};
const context={window:{irProject:page},document:{getElementById:app},
 location:{hash:"#/objects/object/7/ai-recognition"},console};
vm.runInNewContext(source,context,{filename:"src/ai-recognition-page.js"});
const wait=async check=>{
 for(let n=0;n<150;n++){if(check())return;await new Promise(r=>setImmediate(r))}
 throw Error("Timed out; "+runs.join(","))
};
(async()=>{
 await context.window.irAiRecognitionPage(7);
 assert.match(root.innerHTML,/Чертежи КМ\/КМД/);
 assert.match(root.innerHTML,/Без нейросетей/);
 const content=dom.get("#irAiContent");
 assert.match(content.innerHTML,/Проиндексировать все чертежи/);
 assert.match(content.innerHTML,/✓ Индексирован/);
 assert.match(content.innerHTML,/КМД 03/);
 dom.get("[data-kmd-all]").onclick();
 await wait(()=>runs.length===1);
 assert.deepEqual(runs,[2]);
 assert.equal(peak,1,"index workers must be serial");
 finishSecond();
 await wait(()=>runs.length===2);
 await wait(()=>!inflight);
 await wait(()=>content.innerHTML.includes("Ошибка"));
 assert.deepEqual(runs,[2,3],"existing SHA-matched PDF skipped, failure isolated");
 assert.equal(peak,1);
 assert.match(content.innerHTML,/✓ Индексирован/);
 assert.match(content.innerHTML,/Ошибка/);
 assert.equal(page.aiEngine,undefined);
 console.log("Algorithmic PDF UI: batch index serial, SHA cache, ✓ saved, errors, no AI runtime PASS");
})().catch(e=>{console.error(e);process.exitCode=1});
