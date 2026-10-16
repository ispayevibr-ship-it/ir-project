"use strict";
/* Exercise the REAL lightweight AI page's preview -> apply -> undo callbacks. */
const assert=require("node:assert/strict");
const {createPage}=require("../src/ai-scheme-lite-page");
const sha="c".repeat(64);
const drawing={id:30,name:"Схема расположения колонн.pdf",sha256:sha,kind:"КМД",exists:true};
const index={id:31,documentId:30,sourceSha256:sha,
 pages:[{page:1,hasTextLayer:true,uncertainEncoding:false}]};
const grid={id:12,record_type:"scheme_grid",data:{entity_type:"grid",
 axes_x:["1","2","3","4"],x_spans_mm:[9000,9000,9000],
 axes_y:["А","Б","В","Г"],y_spans_mm:[6000,6000,6000]}};
const wait=async fn=>{for(let i=0;i<120;i++){
 if(fn())return;
 await new Promise(resolve=>setImmediate(resolve))
}throw Error("No UI callback/result for AI placement")};
function makeHost(){
 const btn={scan:{disabled:false},scheme:{},batch:{},apply:{},undo:{},cancel:{}},
  status={textContent:""},slot={
   innerHTML:"",
   querySelectorAll:()=>[],
   querySelector:q=>{
    const key={"[data-lite-batch]":"batch","[data-lite-apply]":"apply",
     "[data-lite-undo]":"undo","[data-lite-cancel-preview]":"cancel"}[q];
    return key&&slot.innerHTML.includes(q.slice(1,-1))?btn[key]:null
   }
  };
 const root={
  innerHTML:"",
  querySelector:q=>({
   "[data-lite-results]":slot,"[data-lite-status]":status,
   "[data-lite-scan]":btn.scan,"[data-lite-scheme]":btn.scheme
  })[q]||null
 };
 return{root,btn,status,slot}
}
(async()=>{
 let writes=0,previews=0,undos=0,confirmations=0,last=null;
 const mount={
  latest:async()=>last,
  inventory:async()=>({positions:1,totalInstances:1,placed:writes-undos,unplaced:1-writes+undos,instances:[]}),
  preview:async(id,proposals)=>{
   assert.equal(id,8);assert.equal(proposals.length,1);previews++;
   assert.equal(proposals[0].mark,"К62");
   assert.equal(proposals[0].source.sha256,sha);
   return{ready:[{index:0,mark:"К62",markId:"20",instanceId:"20:1",
    axes:"3/Г",xMm:18000,yMm:18000,z0Mm:-400,z1Mm:9705,
    source:{documentId:30,page:1,sha256:sha}}],
    skipped:[],token:"a".repeat(64),existing:0}
  },
  apply:async (id,proposals,token)=>{
   assert.equal(token,"a".repeat(64));assert.equal(id,8);
   assert.equal(proposals.length,1);writes++;
   last={operationId:"12345678-1234-1234-1234-123456789012",created:1,
    createdAt:"2026-10-16T13:00:00.000Z"};
   return{...last,created:1,skipped:[]}
  },
  undo:async(id,operationId)=>{
   assert.equal(id,8);assert.equal(operationId,last.operationId);
   undos++;last=null;return{undone:1,operationId}
  }
 };
 const irProject={aiMounting:mount,aiDocuments:{list:async()=>[drawing]},
  aiPdf:{list:async()=>[index]}};
 const window={irProject,irAccess:{canEdit:()=>true,role:()=>"admin"},
  confirm:()=>{confirmations++;return true}};
 const data={section:name=>({
  marks:{list:async()=>[{id:20,record_type:"item",title:"К62",
   data:{mark:"К62",qty:1,work_type_id:4}}]},
  "work-types":{list:async()=>[{id:4,data:{scheme_enabled:true}}]},
  scheme:{list:async()=>[grid]}
 })[name]};
 const pdf={page:async()=>({source:{documentId:30,sha256:sha},
  page:{text:"Колонна К62 отм. низа -0,400 отм. верха +9,705 по осям 3–Г"}}),
 list:async()=>[index]};
 const host=makeHost(),page=createPage();
 await page.render(host.root,{objectId:8,documents:[drawing],indexes:[index],
  canEdit:true,pdf,root:data,window,mounting:mount,
  reviewer:{authorize:async()=>true},askPassword:async()=>""});
 assert.equal(typeof host.btn.scan.onclick,"function");
 host.btn.scan.onclick();
 await wait(()=>host.slot.innerHTML.includes("data-lite-batch"));
 assert.equal(writes,0,"parsing alone must never alter the scheme");
 assert.equal(typeof host.btn.batch.onclick,"function");
 host.btn.batch.onclick();
 await wait(()=>host.slot.innerHTML.includes("data-lite-apply"));
 assert.equal(previews,1);
 assert.equal(writes,0,"preview is read-only");
 assert.match(host.slot.innerHTML,/20:1/);
 assert.match(host.slot.innerHTML,/18000/);
 assert.equal(typeof host.btn.apply.onclick,"function");
 host.btn.apply.onclick();
 await wait(()=>writes===1&&host.slot.innerHTML.includes("data-lite-undo"));
 assert.equal(confirmations,1);
 assert.equal(typeof host.btn.undo.onclick,"function");
 host.btn.undo.onclick();
 await wait(()=>undos===1&&host.status.textContent.includes("отменена"));
 page.dispose();
 console.log("Mounting UI: scan -> readonly preview -> atomic apply -> guarded undo PASS");
})().catch(error=>{console.error(error);process.exitCode=1});
