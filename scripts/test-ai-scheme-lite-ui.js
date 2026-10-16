"use strict";
/* Exercise the actual quick-scheme tab controller without Electron or Qwen.
 * Stand-in DOM elements capture real button callbacks and form values.
 * A verified schematic must never be silently inserted before approval. */
const assert=require("node:assert/strict");
const {createPage}=require("../src/ai-scheme-lite-page");
const sha="a".repeat(64);
const drawing={id:2,name:"041-2025 КМД К60.pdf",kind:"КМД",sha256:sha,exists:true};
const idx={id:5,documentId:2,sourceSha256:sha,
 pages:[{page:1,hasTextLayer:true}]};
const grid={id:19,record_type:"scheme_grid",data:{
 entity_type:"grid",axes_x:["1","2","3","4","5","6"],
 axes_y:["А","Б","В","Г","Д","Е","Ж","И","К","Л"],
 x_spans_mm:[9000,9000,9000,9000,9000],
 y_spans_mm:Array(9).fill(6000)
}};
const documentText="Колонна К60 отм. низа -0,400 отм. верха +9,705 Общая длина 10105 мм по осям 3–Г";
const flush=async fn=>{
 for(let n=0;n<100;n++){
  if(fn())return;
  await new Promise(resolve=>setImmediate(resolve))
 }
 throw Error("Timed out waiting for fast PDF scheme action")
};
function makeHost(){
 let html="";
 const refs={};
 const fields={
  type:"column",axisX:"3",axisY:"Г",endX:"",endY:"",
  z0:"-400",z1:"9705"
 };
 const row={querySelectorAll:()=>Object.entries(fields).map(([name,value])=>({
  name,value
 }))};
 const source={dataset:{liteSource:"0"},onclick:null};
 const approve={dataset:{liteApprove:"0"},onclick:null};
 const slot={
  innerHTML:"",
  querySelectorAll:selector=>{
   if(selector==="[data-lite-source]")return slot.innerHTML.includes('data-lite-source="0"')?[source]:[];
   if(selector==="[data-lite-approve]")return slot.innerHTML.includes('data-lite-approve="0"')?[approve]:[];
   return []
  }
 };
 const scan={disabled:false,onclick:null},scheme={onclick:null},status={textContent:""};
 return {
  get innerHTML(){return html},
  set innerHTML(value){html=value},
  querySelector:selector=>({
   "[data-lite-results]":slot,"[data-lite-status]":status,
   "[data-lite-scan]":scan,"[data-lite-scheme]":scheme,
   '[data-lite-row="0"]':row
  })[selector]||null,
  inspect:{slot,scan,scheme,status,source,approve,fields}
 }
}
(async()=>{
 let documents=[drawing],grids=[grid],saved=[],approvalCalls=0;
 let opened=null,navigation=null,readCalls=0,passwordCalls=0,confirmed=0;
 let role="admin",schemeAllowed=true;
 const pdf={
  page:async(_oid,indexId,page)=>{
   readCalls++;assert.equal(indexId,5);assert.equal(page,1);
   return{source:{documentId:2,sha256:sha},
    page:{text:documentText}}
  },
  list:async()=>[idx]
 };
 const marks={list:async()=>[{
  id:7,title:"Колонна",data:{mark:"К60",qty:1,
   work_type_id:11,name:"Колонна"}
 }]};
 const scheme={list:async()=>[...grids,...saved],
  create:async payload=>{
   const entity={id:123,...payload};saved.push(entity);return entity
  }};
 const workTypes={list:async()=>[{
  id:11,title:"Монтаж МК",data:{scheme_enabled:true}
 }]};
 const root={section:name=>({
  "marks":marks,"scheme":scheme,"work-types":workTypes
 })[name]};
 const window={
  irProject:{aiDocuments:{list:async()=>documents},aiPdf:pdf},
  irAccess:{role:()=>role,canEdit:section=>section==="scheme"?schemeAllowed:true},
  confirm:()=>{confirmed++;return true}
 };
 const reviewer={authorize:async(role,password)=>{
  approvalCalls++;return role==="admin"&&password==="correct"
 }};
 const askPassword=async()=>{passwordCalls++;return"correct"};
 const page=createPage(),host=makeHost();
 await page.render(host,{objectId:7,documents,indexes:[idx],canEdit:true,
  pdf,root,window,reviewer,askPassword,
  onOpenPdf:(id,p)=>opened=[id,p],
  onNavigate:tab=>navigation=tab
 });
 assert.match(host.innerHTML,/Монтажная схема · быстрый режим/);
 assert.equal(typeof host.inspect.scan.onclick,"function");
 assert.equal(host.inspect.scan.disabled,false);
 host.inspect.scan.onclick();
 await flush(()=>host.inspect.slot.innerHTML.includes("К60")&&
  host.inspect.status.textContent.includes("Быстрое извлечение завершено"));
 assert.match(host.inspect.slot.innerHTML,/9705/);
 assert.match(host.inspect.slot.innerHTML,/-400/);
 assert.match(host.inspect.slot.innerHTML,/10105/);
 assert.equal(saved.length,0,"no scheme writes from auto-extraction");
 assert.equal(readCalls,1,"only one indexed page fetched, no Qwen");
 host.inspect.source.onclick();
 assert.deepEqual(opened,[2,1]);
 host.inspect.scheme.onclick();
 assert.equal(navigation,"scheme");
 // Access revoked after scanning: no placement, despite an enabled button.
 schemeAllowed=false;
 host.inspect.approve.onclick();
 await flush(()=>host.inspect.status.textContent.includes("нет разрешения"));
 assert.equal(saved.length,0);
 assert.equal(passwordCalls,0,"unauthorized users never request reviewer password");
 schemeAllowed=true;
 documents=[{...drawing,sha256:"b".repeat(64)}];
 host.inspect.approve.onclick();
 await flush(()=>host.inspect.status.textContent.includes("Исходный PDF изменён"));
 assert.equal(saved.length,0,"stale source blocks before confirm/write");
 documents=[drawing];
 host.inspect.approve.onclick();
 await flush(()=>saved.length===1);
 assert.equal(approvalCalls,2);
 assert.equal(passwordCalls,2);
 assert.equal(confirmed,1);
 assert.equal(saved[0].data.mark,"К60");
 assert.equal(saved[0].data.geometry_type,"column");
 assert.equal(saved[0].data.absolute_x_mm,18000);
 assert.equal(saved[0].data.absolute_y_mm,18000);
 assert.equal(saved[0].data.z0_mm,-400);
 assert.equal(saved[0].data.z1_mm,9705);
 assert.equal(saved[0].data.status,"planned");
 assert.equal(saved[0].data.ai_source.sha256,sha);
 // Repeating the same proposal cannot add a second construction.
 host.inspect.approve.onclick();
 await flush(()=>host.inspect.status.textContent.includes("Все экземпляры"));
 assert.equal(saved.length,1);
 page.dispose();
 // Guests can scan but cannot submit a placement.
 const guestHost=makeHost(),guestPage=createPage();
 role="guest";schemeAllowed=false;
 await guestPage.render(guestHost,{objectId:7,documents,indexes:[idx],
  pdf,root,window,reviewer,askPassword,canEdit:false
 });
 assert.equal(guestHost.inspect.scan.disabled,false);
 guestHost.inspect.scan.onclick();
 await flush(()=>guestHost.inspect.status.textContent.includes("Быстрое извлечение завершено"));
 assert.equal(saved.length,1);
 guestPage.dispose();
 console.log("KMD lite workflow: fast PDF extraction, axes/Z, read-only guest, stale PDF, approval, no duplicates PASS")
})().catch(error=>{console.error(error);process.exitCode=1});
