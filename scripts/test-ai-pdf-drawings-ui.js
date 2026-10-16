"use strict";
/* Regression: imported PDF rows must render with running or stopped manual Qwen.
 * No Electron/network/model weights needed. Catch JS scope errors in the actual page. */
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("src/ai-recognition-page.js","utf8");
new vm.Script(source,{filename:"src/ai-recognition-page.js"});
async function run(state){
 const controls=new Map(),content={
  innerHTML:"",
  querySelector:()=>null,
  querySelectorAll:()=>[]
 };
 const app={
  innerHTML:"",
  querySelector(name){
   if(name==="#irAiContent")return content;
   if(!controls.has(name))controls.set(name,{onclick:null,disabled:false,textContent:""});
   return controls.get(name)
  },
  querySelectorAll:()=>[]
 };
 const hash="a".repeat(64),drawing={
  id:3,name:"041-2025 КМД К60.pdf",kind:"КМД",ext:".pdf",
  size:341269,sha256:hash,exists:true,addedAt:"2026-10-16"
 };
 const irProject={
  data:{objects:{get:async()=>({id:7,name:"Варваринское"})}},
  aiDocuments:{list:async()=>[drawing],select:async()=>({canceled:true})},
  aiEngine:{status:async()=>({installed:true,state,model:"qwen3-vl-4b",
   modelVersion:"manual-beta"}),results:async()=>[]},
  aiPdf:{list:async()=>[{id:9,documentId:3,sourceName:drawing.name,
   sourceSha256:hash,totalPages:1,pages:[{page:1,hasTextLayer:true,
    uncertainEncoding:true,widthPt:841,heightPt:1189,fragmentCount:12,
    excerpt:"Колонна К60"}]}]}
 };
 const window={irAccess:{canEdit:()=>true,role:()=>"admin"},irProject};
 const context={window,irProject,location:{hash:"#/objects/7/ai-recognition"},
  document:{getElementById:name=>name==="app"?app:null},console};
 vm.runInNewContext(source,context,{filename:"src/ai-recognition-page.js"});
 await window.irAiRecognitionPage(7);
 assert.match(content.innerHTML,/Чертежи КМ\/КМД/);
 assert.match(content.innerHTML,/041-2025 КМД К60.pdf/);
 assert.match(content.innerHTML,/Распознать лист 1/);
 assert.match(content.innerHTML,/Колонна К60/);
 assert.match(content.innerHTML,/Индексировать PDF/);
 assert.match(app.innerHTML,/ir-ai-step-guide/,"six-step instructions beside controls");
 assert.match(app.innerHTML,/Выбрать КМ\/КМД/);
 assert.match(app.innerHTML,/Добавить PDF/);
 assert.match(app.innerHTML,/Индексировать PDF/);
 assert.match(app.innerHTML,/Запустить Qwen/);
 assert.match(app.innerHTML,/Распознать лист/);
 assert.match(app.innerHTML,/Проверить результат/);
 assert.match(content.innerHTML,/Шаг 3 выполнен/,"index action marked done");
 assert.match(content.innerHTML,/Шаг 5/,"recognition button numbered");
 if(state==="ready")assert.match(app.innerHTML,/Следующий шаг: 5/);
 else assert.match(app.innerHTML,/Следующий шаг: 4/);

 assert(!content.innerHTML.includes("undefined"),"PDF list must not show undefined");
 if(state==="ready"){
  assert.match(app.innerHTML,/Qwen запущена/);
  assert.match(content.innerHTML,/data-ai-pdf-vision="3:1"/);
 }else assert.match(app.innerHTML,/Qwen подключена, но остановлена/);
}
(async()=>{
 await run("ready");await run("stopped");
 console.log("PDF drawings UI: K60 row, indexed sheet and manual Qwen status PASS");
})().catch(e=>{console.error(e);process.exitCode=1});
