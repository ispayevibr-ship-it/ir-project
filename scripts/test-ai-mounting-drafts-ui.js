"use strict";
const assert=require("node:assert/strict");
const {createPage,matchesDraft}=require("../src/ai-scheme-lite-page");
const SHA="e".repeat(64);
const document={id:20,name:"План расположения колонн.pdf",kind:"КМ",sha256:SHA,exists:true};
const index={id:22,documentId:20,sourceSha256:SHA,
 pages:[{page:1,hasTextLayer:true,uncertainEncoding:false}]};
const grid={id:18,record_type:"scheme_grid",data:{entity_type:"grid",
 axes_x:["1","2","3"],x_spans_mm:[9000,9000],
 axes_y:["А","Б","В","Г"],y_spans_mm:[6000,6000,6000]}};
const wait=async predicate=>{
 for(let n=0;n<90;n++){
  if(predicate())return;
  await new Promise(resolve=>setImmediate(resolve))
 }
 throw Error("Timed out waiting for draft UI")
};
function makeHost(){
 const fields={type:"column",axisX:"3",axisY:"Г",endX:"",endY:"",
  z0:"-400",z1:"9705"},feedback={textContent:"",dataset:{}};
 const save={dataset:{liteSaveDraft:"0"},onclick:null},scan={disabled:false,onclick:null},
  scheme={},slot={innerHTML:"",
   querySelectorAll:selector=>selector==="[data-lite-save-draft]"&&
    slot.innerHTML.includes('data-lite-save-draft="0"')?[save]:[],
   querySelector:()=>null
  },card={querySelector:()=>null,
   querySelectorAll:()=>Object.entries(fields).map(([name,value])=>({name,value}))},
  status={textContent:""};
 const host={innerHTML:"",querySelector:selector=>({
  "[data-lite-results]":slot,"[data-lite-status]":status,
  "[data-lite-scan]":scan,"[data-lite-scheme]":scheme,
  '[data-lite-row="0"]':card
 })[selector]||null};
 return{host,scan,slot,save,fields,status}
}
(async()=>{
 let saved=null,writes=0,edits=0;
 const mounting={
  drafts:async()=>saved?[saved]:[],
  saveDraft:async(objectId,candidate,values,expectedRevision)=>{
   assert.equal(objectId,7);
   assert.equal(candidate.source.sha256,SHA);
   assert.equal(expectedRevision,saved?.revision||0);
   edits++;
   saved={id:90,revision:edits,mark:"К62",extractedType:"column",
    source:{documentId:20,page:1,sha256:SHA},values,
    updatedAt:"2026-10-17T00:00:00Z",stale:false};
   return saved
  },
  inventory:async()=>({positions:1,totalInstances:1,placed:0,unplaced:1,instances:[]}),
  latest:async()=>null
 };
 const api={
  marks:{list:async()=>[{id:6,title:"К62",data:{mark:"К62",qty:1,work_type_id:4}}]},
  scheme:{list:async()=>[grid],create:async()=>{writes++;throw Error("drafts must not place elements")}},
  "work-types":{list:async()=>[{id:4,data:{scheme_enabled:true}}]}
 };
 const root={section:section=>api[section]};
 const window={irProject:{aiDocuments:{list:async()=>[document]}},
  irAccess:{role:()=>"engineer",canEdit:()=>true},confirm:()=>true};
 const pdf={page:async()=>({source:{documentId:20,sha256:SHA},
  page:{text:"Колонна К62 отм. низа -0,400 отм. верха +9,705 по осям 3–Г"}}),
  list:async()=>[index]};
 const props={objectId:7,documents:[document],indexes:[index],canEdit:true,
  root,window,pdf,mounting,
  reviewer:{authorize:async()=>true},askPassword:async()=>""};
 const initial=makeHost(),page=createPage();
 await page.render(initial.host,props);
 initial.scan.onclick();
 await wait(()=>initial.slot.innerHTML.includes('data-lite-save-draft="0"'));
 initial.fields.axisX="2";initial.fields.z0="-500";
 initial.save.onclick();
 await wait(()=>edits===1&&initial.slot.innerHTML.includes("ревизия №1"));
 assert.equal(writes,0,"saving a correction must be draft-only");
 assert.equal(saved.values.axisX,"2");
 assert.equal(saved.values.z0Mm,-500);
 page.dispose();
 const reopened=makeHost(),nextPage=createPage();
 await nextPage.render(reopened.host,props);
 reopened.scan.onclick();
 await wait(()=>reopened.slot.innerHTML.includes("ревизия №1"));
 assert.match(reopened.slot.innerHTML,/name="axisX"[^>]*value="2"/);
 assert.match(reopened.slot.innerHTML,/name="z0"[^>]*value="-500"/);
 reopened.fields.axisX="1";reopened.fields.z0="-600";
 reopened.save.onclick();
 await wait(()=>edits===2&&reopened.slot.innerHTML.includes("ревизия №2"));
 assert.equal(writes,0,"rescan and second correction never write scheme rows");
 assert(matchesDraft({mark:"К62",type:"column",
  source:{documentId:20,sha256:SHA,page:1}},saved));
 assert.equal(matchesDraft({mark:"К62",type:"column",
  source:{documentId:20,sha256:"f".repeat(64),page:1}},saved),false);
 nextPage.dispose();
 console.log("Draft UI: save -> reopen -> rescan -> preserve/manual revise without placement PASS");
})().catch(error=>{console.error(error);process.exitCode=1});
