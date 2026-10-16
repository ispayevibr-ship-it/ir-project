"use strict";
/* Regression for selected K60 stamp, stale model state and zoomed-region AI action.
 * Tests actual renderer callbacks against a minimal fake DOM; no model/files fetched. */
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("src/ai-recognition-page.js","utf8");
new vm.Script(source,{filename:"src/ai-recognition-page.js"});
const spin=async until=>{
 for(let i=0;i<120;i++){
  if(until())return;
  await new Promise(resolve=>setImmediate(resolve))
 }
 throw Error("Timed out waiting for PDF preview callback")
};
(async()=>{
 const sheetData="data:image/png;base64,AQIDBA==";
 let ready=false,statusCalls=0,dialog=null;
 const previewButton={dataset:{aiPdfPreview:"3:1"},onclick:null};
 const content={innerHTML:"",
  querySelector:()=>null,
  querySelectorAll:sel=>sel==="[data-ai-pdf-preview]"?[previewButton]:[]};
 const controls=new Map();
 const app={innerHTML:"",querySelectorAll:()=>[],
  querySelector:sel=>{
   if(sel==="#irAiContent")return content;
   if(!controls.has(sel))controls.set(sel,{onclick:null,value:"КМД"});
   return controls.get(sel)
  }};
 const rect={style:{}},extract={disabled:true},recognize={disabled:true,title:""},back={hidden:true};
 const aiText={textContent:""},meta={textContent:""},title={textContent:""};
 const layer={style:{},getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),
  setPointerCapture:()=>{},onpointerdown:null,onpointermove:null,onpointerup:null};
 const tags=new Map([
  ["img",{src:""}],[".ir-ai-pdf-image-wrap",{style:{}}],
  [".ir-ai-pdf-region-layer",layer],[".ir-ai-pdf-region-selection",rect],
  ["[data-region-extract]",extract],["[data-region-analyze]",recognize],
  ["[data-region-back]",back],["[data-pdf-fit]",{textContent:"100%"}],
  ["[data-region-meta]",meta],["[data-region-ai-status]",aiText],
  ["[data-region-title]",title],["[data-pdf-close]",{onclick:null}]
 ]);
 const listeners={};
 const createDialog=()=>({
  innerHTML:"",className:"",isConnected:false,open:false,
  querySelector:sel=>tags.get(sel)||null,
  addEventListener:(name,fn)=>{listeners[name]=fn},
  showModal(){this.open=true},
  close(){this.open=false;this.isConnected=false;listeners.close?.()},
  remove(){}
 });
 const irProject={
  data:{objects:{get:async()=>({id:7,name:"Варваринское"})}},
  aiDocuments:{list:async()=>[{
   id:3,name:"041-2025 КМД К60.pdf",kind:"КМД",ext:".pdf",
   sha256:"a".repeat(64),size:342000,exists:true
  }],select:async()=>({canceled:true})},
  aiEngine:{status:async()=>{statusCalls++;return{
   installed:true,model:"qwen3-vl-4b",state:ready?"ready":"stopped"
  }}},
  aiPdf:{list:async()=>[],preview:async()=>({dataUrl:sheetData,
   width:1800,height:1275,page:1,total:1,sha256:"a".repeat(64),
   sourceName:"041-2025 КМД К60.pdf"}),
   regionPreview:async(_oid,_did,_page,selected)=>({
    dataUrl:sheetData,width:900,height:700,region:selected
   })}
 };
 const window={irProject,irAccess:{canEdit:()=>true,role:()=>"admin"}};
 const document={getElementById:sel=>sel==="app"?app:null,
  createElement:tag=>{
   assert.equal(tag,"dialog");dialog=createDialog();return dialog
  },body:{appendChild:d=>{d.isConnected=true}}};
 const context={window,document,irProject,location:{hash:"#/objects/7/ai-recognition"},
  console,confirm:()=>true};
 vm.runInNewContext(source,context,{filename:"src/ai-recognition-page.js"});
 await window.irAiRecognitionPage(7);
 previewButton.onclick();
 await spin(()=>dialog?.open===true&&statusCalls>=2);
 assert.match(aiText.textContent,/Qwen не готова/);
 assert.equal(recognize.disabled,true);
 const down={pointerId:4,button:0,pointerType:"mouse",clientX:15,clientY:10,
  preventDefault(){}};
 layer.onpointerdown(down);
 const move={pointerId:4,clientX:85,clientY:80};
 layer.onpointermove(move);
 await layer.onpointerup(move);
 assert.equal(extract.disabled,false,"valid K60 stamp region");
 assert.equal(recognize.disabled,true,"recognition blocked while Qwen is stopped");
 ready=true;
 layer.onpointerdown(down);layer.onpointermove(move);layer.onpointerup(move);
 await spin(()=>recognize.disabled===false);
 assert.match(aiText.textContent,/Qwen готова/);
 assert.equal(recognize.disabled,false,"live readiness unlocks recognition without reopening PDF");
 await extract.onclick();
 assert.equal(recognize.disabled,false,
  "after zoom the original selected PDF coordinates must remain actionable");
 assert(statusCalls>=3);
 console.log("PDF K60 stamp UI: disabled reason, live Qwen recheck, zoom then recognize PASS");
})().catch(error=>{console.error(error);process.exitCode=1});
