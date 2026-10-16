"use strict";
/* Regression: imported PDF rows must render with running or stopped manual Qwen.
 * No Electron/network/model weights needed. Catch JS scope errors in the actual page. */
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("src/ai-recognition-page.js","utf8");
new vm.Script(source,{filename:"src/ai-recognition-page.js"});
assert(source.includes('impact?.policyRevision!=="pdf-draft-guard-diagnostics-v1"'),
 "outdated Electron document store is detected before deletion");
assert(source.includes("diag.sourceShaMatches"),
 "blocked PDF analysis shows safe diagnostic checks");
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
  data:{objects:{get:async()=>({id:7,name:"Варваринское"})},
   forObject:()=>({section:()=>({list:async()=>[{id:1,title:"К60"}]})})},
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
 assert.match(app.innerHTML,/ir-ai-step-guide/,"four-step workflow");
 assert.match(app.innerHTML,/Загрузить ведомость марок/);
 assert.match(app.innerHTML,/Добавить КМ\/КМД/);
 assert.match(app.innerHTML,/Индексировать PDF/);
 assert.match(app.innerHTML,/Подготовить расстановку/);
 assert.match(app.innerHTML,/Qwen требуется только для сложных листов/);
 assert.match(content.innerHTML,/Шаг 3 выполнен/,"index action marked done");
 assert.match(content.innerHTML,/Шаг 5/,"Qwen sheet button stays available");
 assert.match(app.innerHTML,/Следующий шаг: 4/);

 assert(!content.innerHTML.includes("undefined"),"PDF list must not show undefined");
 if(state==="ready"){
  assert.match(app.innerHTML,/Qwen запущена/);
  assert.match(content.innerHTML,/data-ai-pdf-vision="3:1"/);
 }else assert.match(app.innerHTML,/Qwen подключена, но остановлена/);
}

async function runBulkIndex(){
 const sha=n=>String(n).repeat(64),doc=(id,exists=true,ext=".pdf")=>({
  id,name:"Чертёж "+id+ext,kind:"КМД",ext,exists,sha256:sha(id),
  size:200000,addedAt:"2026-10-17"
 });
 const docs=[doc(1),doc(2),doc(3),doc(4),doc(5,false),doc(6,true,".png")];
 const indexed=new Map([[1,{id:101,documentId:1,sourceName:docs[0].name,
  sourceSha256:sha(1),pages:[{page:1,hasTextLayer:true}],
  totalPages:1}]]);
 const buttons=new Map(),statuses=new Map(),header={textContent:"",dataset:{}};
 const content={
  innerHTML:"",
  querySelector(q){
   if(q==="[data-ai-index-all]"){
    if(!this.innerHTML.includes("data-ai-index-all"))return null;
    if(!buttons.has(q))buttons.set(q,{onclick:null,disabled:false});
    return buttons.get(q)
   }
   if(q==="[data-ai-bulk-summary]")return header;
   if(q.startsWith('[data-ai-index-status="')){
    const k=q.slice(23,-2);
    if(!statuses.has(k))statuses.set(k,{textContent:"",className:"",title:""});
    return statuses.get(k)
   }
   return null
  },
  querySelectorAll:()=>[]
 };
 const appControls=new Map();
 const app={innerHTML:"",
  querySelector:q=>{
   if(q==="#irAiContent")return content;
   if(!appControls.has(q))appControls.set(q,{
    onclick:null,disabled:false,textContent:"",value:"КМД"
   });
   return appControls.get(q)
  },
  querySelectorAll:()=>[]
 };
 let progress=null,indexedIds=[],active=0,maxActive=0;
 let finishTwo,finishFour;
 const second=new Promise(resolve=>{finishTwo=resolve});
 const fourth=new Promise(resolve=>{finishFour=resolve});
 const irProject={
  data:{objects:{get:async()=>({id:7,name:"Варваринское"})},
   forObject:()=>({section:()=>({list:async()=>[{id:1,title:"К60"}]})})},
  aiDocuments:{list:async()=>docs,select:async()=>({canceled:true})},
  aiEngine:{status:async()=>({installed:false,state:"missing"}),results:async()=>[]},
  aiPdf:{
   list:async()=>[...indexed.values()],
   onProgress:fn=>{progress=fn;return()=>{progress=null}},
   index:async(_oid,id)=>{
    indexedIds.push(Number(id));active++;maxActive=Math.max(maxActive,active);
    try{
     if(Number(id)===2)await second;
     if(Number(id)===3)throw Error("повреждённый PDF");
     if(Number(id)===4)await fourth;
     const d=docs.find(d=>d.id===Number(id));
     const result={id:100+Number(id),documentId:Number(id),
      sourceName:d.name,sourceSha256:d.sha256,totalPages:2,
      pages:[{page:1,hasTextLayer:true},{page:2,hasTextLayer:false}]};
     indexed.set(Number(id),result);return result
    }finally{active--}
   }
  }
 };
 const win={irProject,irAccess:{role:()=>"admin",canEdit:()=>true}};
 const context={window:win,irProject,location:{hash:"#/objects/7/ai-recognition"},
  document:{getElementById:q=>q==="app"?app:null},console};
 vm.runInNewContext(source,context,{filename:"src/ai-recognition-page.js"});
 await win.irAiRecognitionPage(7);
 assert.match(content.innerHTML,/Проиндексировать все чертежи/);
 assert.match(content.innerHTML,/✓ Индексирован · 1 лист/);
 assert.match(content.innerHTML,/Ожидает индексации/);
 assert.match(content.innerHTML,/Файл отсутствует/);
 const all=buttons.get("[data-ai-index-all]");
 assert.equal(typeof all.onclick,"function");
 all.onclick();
 const tick=async fn=>{
  for(let i=0;i<500;i++){
   if(fn())return;
   await new Promise(resolve=>setImmediate(resolve))
  }
  throw Error("Timed out waiting for PDF index-all status: "+header.textContent)
 };
 await tick(()=>indexedIds.includes(2));
 assert.deepEqual(indexedIds,[2],"already indexed PDF skipped; images and missing files ignored");
 assert.equal(maxActive,1,"never run two PDF workers simultaneously");
 assert.match(content.innerHTML,/Проиндексировать все чертежи/);
 assert.equal(typeof progress,"function","PDF page progress callback is subscribed");
 progress({objectId:7,documentId:2,page:1,total:2});
 assert.match(statuses.get("2").textContent,/лист 1 из 2/);
 assert.match(header.textContent,/обработано 1 из 4/);
 all.onclick();
 assert.deepEqual(indexedIds,[2],"repeat click cannot start another job");
 finishTwo();
 await tick(()=>indexedIds.includes(4));
 assert.deepEqual(indexedIds,[2,3,4],
  "batch continues after corrupted PDF and does not retry existing PDF");
 assert.match(statuses.get("2").textContent,/✓ Индексирован · 2 лист/);
 assert.match(statuses.get("3").textContent,/✕ Ошибка индексации/);
 assert.match(header.textContent,/обработано 3 из 4/);
 finishFour();
 await tick(()=>header.textContent.includes("обработано 4 из 4")&&
  !header.textContent.includes("Индексируем по очереди"));
 assert.match(header.textContent,/✓ 3/);
 assert.match(header.textContent,/✕ 1/);
 assert.equal(progress,null,"onProgress subscription cleaned after batch");
 assert.match(content.innerHTML,/✓ Индексирован · 2 лист/);
 assert.match(content.innerHTML,/Ошибка индексации/);
 assert.equal(maxActive,1);
 assert(!indexedIds.includes(1)&&!indexedIds.includes(5)&&!indexedIds.includes(6));
 // Retrying must target ONLY prior failures.
 const retry=buttons.get("[data-ai-index-all]");
 assert.equal(retry.disabled,false);
 retry.onclick();
 await tick(()=>indexedIds.length===4);
 assert.deepEqual(indexedIds,[2,3,4,3]);
 assert.match(header.textContent,/✕ 1/);
 console.log("PDF index-all UI: 1-click, immediate ✓, page progress, SHA cache, serial jobs, failures and retry PASS");
}

(async()=>{
 await run("ready");await run("stopped");await runBulkIndex();
 console.log("PDF drawings UI: K60 row, indexed sheet and manual Qwen status PASS");
})().catch(e=>{console.error(e);process.exitCode=1});
