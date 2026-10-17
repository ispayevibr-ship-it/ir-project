"use strict";
// Archive preserves source bytes, historic AI decisions, and revision references.
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),
 path=require("node:path"),crypto=require("node:crypto");
const {createStore}=require("../src/ai-document-store");
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-archive-"));
 const original=path.join(dir,"K60.pdf");
 fs.writeFileSync(original,"%PDF-1.4\nK60 mock sheet with original source bytes\n%%EOF");
 const records=new Map(),objects=new Set([1,2]);let nextId=1;
 const db={
  getObject:id=>objects.has(Number(id))?{id:Number(id)}:null,
  getEntity:(obj,sec,id)=>[...records.values()].find(x=>x.object_id===Number(obj)&&x.section_key===sec&&x.id===Number(id))||null,
  listEntity:(obj,sec)=>[...records.values()].filter(x=>x.object_id===Number(obj)&&x.section_key===sec),
  createEntity:(obj,sec,payload)=>{const x={id:nextId++,object_id:Number(obj),section_key:sec,
   record_type:payload.record_type,title:payload.title||"",parent_id:payload.parent_id||null,
   data:JSON.parse(JSON.stringify(payload.data))};records.set(x.id,x);return x},
  updateEntity:(obj,sec,id,payload)=>{
   const item=db.getEntity(obj,sec,id);if(!item)return null;
   const value={...item,record_type:payload.record_type,parent_id:payload.parent_id||null,
    title:payload.title,data:JSON.parse(JSON.stringify(payload.data))};
   records.set(value.id,value);return value
  },
  deleteEntity:(obj,sec,id)=>{const x=db.getEntity(obj,sec,id);if(!x)return false;records.delete(x.id);return true},
  transaction:fn=>{
   const copy=new Map([...records].map(([k,v])=>[k,JSON.parse(JSON.stringify(v))]));
   try{return fn()}catch(e){records.clear();for(const [k,v] of copy)records.set(k,v);throw e}
  }
 };
 const store=createStore({getUserDataPath:()=>dir,database:db,getWindow:()=>null,
  dialog:{showOpenDialog:async()=>({filePaths:[original],canceled:false})},
  shell:{openPath:async()=>""}});
 try{
  const chosen=await store.select(1,"КМД");
  const source=chosen.imported[0];assert(source);
  const history=db.createEntity(1,"ai-analysis",{record_type:"image_analysis",title:"K60 rejected",
   data:{source:{documentId:source.id,sha256:source.sha256},verification:"requires_review",
    review:{status:"rejected",revision:2,reviewedBy:"engineer",marks:["К60"]}}});
  const decision=db.createEntity(1,"ai-review-history",{record_type:"review_change",parent_id:history.id,
   data:{analysisId:history.id,source:{documentId:source.id,sha256:source.sha256},revision:2}});
  assert.equal(store.removalImpact(1,source.id).canDelete,false);
  assert.throws(()=>store.remove(1,source.id),/Нельзя удалить исходный файл/);
  assert.equal(store.list(2).length,0,"object isolation");
  const archived=store.archive(1,source.id);assert.equal(archived.archived,true);
  assert.equal(store.list(1).find(x=>x.id===source.id).archived,true);
  assert.equal(store.verify(1,source.id),true,"original bytes stay verifiable");
  assert.equal(db.getEntity(1,"ai-analysis",history.id).data.review.revision,2);
  assert.equal(db.getEntity(1,"ai-review-history",decision.id).data.revision,2);
  assert.equal(store.removalImpact(1,source.id).canDelete,false,"archive cannot bypass protected delete");
  await assert.rejects(store.readForPdfIndex(1,source.id),/архиве/);
  await assert.rejects(store.readForAnalysis(1,source.id),/архиве/);
  assert.equal(store.archive(1,source.id).alreadyArchived,true);
  const fresh=(await store.select(1,"КМД")).imported[0];
  assert(fresh&&fresh.id!==source.id,"fresh active document gets new id");
  assert.equal(store.list(1).filter(x=>!x.archived).length,1);
  assert.throws(()=>store.restore(1,source.id),/копия PDF уже активна/);
  assert.equal(store.list(1).find(x=>x.id===source.id).archived,true);
  assert.equal(store.remove(1,fresh.id).deleted,true);
  const restored=store.restore(1,source.id);assert.equal(restored.restored,true);
  assert.equal(store.restore(1,source.id).alreadyActive,true);
  assert.equal(store.list(1).filter(x=>!x.archived).length,1);
  assert.equal(store.verify(1,source.id),true);
  assert.equal(db.getEntity(1,"ai-review-history",decision.id).data.revision,2);
  assert.throws(()=>store.remove(1,source.id),/Нельзя удалить исходный файл/);
  assert.throws(()=>store.archive(2,source.id),/Чертёж не найден/);
  const page=fs.readFileSync(path.join(__dirname,"..","src","ai-recognition-page.js"),"utf8");
  assert(page.includes('data-kmd-archive')&&page.includes('data-kmd-restore'));
  assert(page.includes('docsApi.archive(id,')&&page.includes('docsApi.restore(id,'));
  assert(page.includes('archived=records.filter(x=>x.archived)'));
  assert(page.includes('original')||page.includes('архив'),'archived source is retained');
  const preload=fs.readFileSync(path.join(__dirname,"..","preload.js"),"utf8");
  const main=fs.readFileSync(path.join(__dirname,"..","main.js"),"utf8");
  assert(preload.includes('ipcRenderer.invoke("ai-documents:archive"'));
  assert(preload.includes('ipcRenderer.invoke("ai-documents:restore"'));
  assert(main.includes('ipcMain.handle("ai-documents:archive"'));
  assert(main.includes('ipcMain.handle("ai-documents:restore"'));
  console.log("PDF archive: protected review revision 2, retained original SHA, reimport, restore collision, IPC/UI PASS");
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
