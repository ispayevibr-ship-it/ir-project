"use strict";
/* A KM/DMD recognition bar must report only an estimated elapsed-time fraction,
 * never pretend that unstreamed Qwen has parsed a known percent of the sheet.
 * Exercise the real page handler with deferred IPC and deterministic fake time.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("src/ai-recognition-page.js","utf8");
new vm.Script(source,{filename:"src/ai-recognition-page.js"});
const spin=async test=>{
 for(let i=0;i<150;i++){
  if(test())return;
  await new Promise(resolve=>setImmediate(resolve))
 }
 throw Error("UI handler did not start PDF recognition")
};
(async()=>{
 let now=1000000,resolveAnalysis=null,rejectAnalysis=null,interval=null,cleared=false;
 const savedAnalyses=[];
 const progressFields=new Map();
 for(const key of ["value","bar","elapsed","remaining","state"])
  progressFields.set('[data-ai-progress-'+key+']',{textContent:"",value:0});
 const progressNode={querySelector:sel=>progressFields.get(sel)||null};
 const hash="a".repeat(64),drawing={id:3,name:"041-2025 КМД К60.pdf",
  kind:"КМД",ext:".pdf",size:300000,sha256:hash,exists:true};
 const visionButton={dataset:{aiPdfVision:"3:1"},onclick:null};
 const content={innerHTML:"",querySelector:()=>null,
  querySelectorAll:sel=>sel==="[data-ai-pdf-vision]"?[visionButton]:[]};
 const controls=new Map(),app={
  innerHTML:"",
  querySelector:sel=>{
   if(sel==="#irAiContent")return content;
   if(sel==="[data-ai-analysis-progress]")
    return app.innerHTML.includes('data-ai-analysis-progress')?progressNode:null;
   if(!controls.has(sel))controls.set(sel,{onclick:null,value:"КМД"});
   return controls.get(sel)
  },querySelectorAll:()=>[]
 };
 const pwInput={value:"password",focus(){}},pwForm={onsubmit:null};
 const passwordDialog={
  innerHTML:"",className:"",querySelector:sel=>
   sel==="form"?pwForm:sel==="input"?pwInput:{onclick:null},
  showModal(){queueMicrotask(()=>pwForm.onsubmit?.({preventDefault(){}}))},
  close(){},remove(){}
 };
 const document={getElementById:name=>name==="app"?app:null,
  createElement:tag=>{assert.equal(tag,"dialog");return passwordDialog},
  body:{appendChild(){}}
 };
 const irProject={
  data:{objects:{get:async()=>({id:7,name:"Варваринское"})},
   forObject:()=>({section:()=>({list:async()=>[{id:1,title:"К60"}]})})},
  aiDocuments:{list:async()=>[drawing],select:async()=>({canceled:true})},
  aiEngine:{status:async()=>({installed:true,state:"ready",
   analysisTimeoutSeconds:600,model:"qwen3-vl-4b"}),results:async()=>savedAnalyses},
  aiReview:{list:async()=>savedAnalyses,register:async()=>[],authorize:async()=>true},
  aiPdf:{list:async()=>[{id:8,documentId:3,sourceName:drawing.name,
   sourceSha256:hash,totalPages:1,pages:[{page:1,hasTextLayer:true}]}],
   analyze:async()=>new Promise((resolve,reject)=>{
    resolveAnalysis=resolve;rejectAnalysis=reject
   })}
 };
 const window={irProject,irAccess:{canEdit:()=>true,role:()=>"admin"}};
 const FakeDate=class extends Date{static now(){return now}};
 vm.runInNewContext(source,{window,irProject,document,
  location:{hash:"#/objects/7/ai-recognition"},console,Date:FakeDate,
  setInterval:fn=>{interval=fn;return 23},
  clearInterval:token=>{assert.equal(token,23);cleared=true},
  queueMicrotask
 },{filename:"src/ai-recognition-page.js"});
 await window.irAiRecognitionPage(7);
 assert.equal(typeof visionButton.onclick,"function");
 const task=visionButton.onclick();
 await spin(()=>typeof resolveAnalysis==="function");
 assert.match(app.innerHTML,/data-ai-analysis-progress/);
 assert.match(app.innerHTML,/Оценочный|Процент оценочный/);
 assert.match(app.innerHTML,/КМД · лист 1/);
 assert.match(app.innerHTML,/До лимита ожидания: 10:00/);
 assert.doesNotMatch(app.innerHTML,/100%/,"never claim completion before a model result");
 assert.equal(typeof interval,"function");
 now+=300000;interval();
 assert.equal(progressFields.get("[data-ai-progress-bar]").value,50);
 assert.match(progressFields.get("[data-ai-progress-value]").textContent,/≈ 50%/);
 assert.match(progressFields.get("[data-ai-progress-remaining]").textContent,/5:00/);
 now+=500000;interval();
 assert.equal(progressFields.get("[data-ai-progress-bar]").value,94,
  "estimated progress cannot hit 100% without a finished response");
 assert.match(progressFields.get("[data-ai-progress-remaining]").textContent,/0:00/);
 savedAnalyses.push({id:12,documentId:3,sha256:hash,originalMarks:["К60"],
  notes:{text:"Колонна К60"},status:"requires_review"});
 resolveAnalysis({id:12,source:drawing.name,page:1,marks:["К60"]});
 await task;
 assert.equal(cleared,true);
 assert.match(app.innerHTML,/completed/);
 assert.match(app.innerHTML,/100%/);
 assert.match(app.innerHTML,/Обработка завершена/);
 assert.match(app.innerHTML,/Следующий шаг: 4/);
 // Check failure path starts a fresh job and never displays 100% after error.
 cleared=false;resolveAnalysis=null;rejectAnalysis=null;
 const retry=visionButton.onclick();
 await spin(()=>typeof rejectAnalysis==="function"&&!cleared);
 now+=60000;interval();
 rejectAnalysis(new Error("AbortError: simulated timeout"));
 await retry;
 assert.match(app.innerHTML,/failed/);
 assert.match(app.innerHTML,/Прервано/);
 assert.match(app.innerHTML,/simulated timeout/);
 assert.doesNotMatch(app.innerHTML,/100%/);
 assert.match(app.innerHTML,/Обработка сложного листа через Qwen прервана/,
  "a failed latest attempt cannot advance to step 6 despite previous successful analysis");
 console.log("KMD recognition: visible estimate, elapsed/remaining clock, 94% cap, 100% only on success, error PASS");
})().catch(e=>{console.error(e);process.exitCode=1});
