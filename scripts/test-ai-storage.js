"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {createStore}=require("../src/ai-document-store");
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-doc-test-"));
 let source=path.join(tmp,"K41 KMD.pdf");
 fs.writeFileSync(source,"%PDF-1.4\nReal fixture marker only, not AI recognition");
 const rows=new Map(),objects=new Set([1,2]);let counter=1,dialogCalls=0,opened="";
 const db={
  getObject:id=>objects.has(Number(id))?{id:Number(id)}:null,
  listEntity:(id,key)=>[...rows.values()].filter(x=>x.object_id===id&&x.section_key===key),
  getEntity:(id,key,recordId)=>[...rows.values()].find(x=>x.object_id===id&&x.section_key===key&&x.id===recordId)||null,
  createEntity:(id,key,value)=>{
   const row={id:counter++,object_id:id,section_key:key,record_type:value.record_type,title:value.title,data:value.data,
    created_at:"2026-10-15 13:00"};rows.set(row.id,row);return row
  },
  updateEntity:(id,key,recordId,value)=>{const row=db.getEntity(id,key,recordId);if(!row)return null;row.data=value.data;return row},
  deleteEntity:(id,key,recordId)=>{const row=db.getEntity(id,key,recordId);if(!row)return false;rows.delete(row.id);return true}
 };
 const store=createStore({getUserDataPath:()=>tmp,database:db,getWindow:()=>null,
  dialog:{showOpenDialog:async()=>{dialogCalls++;return{canceled:false,filePaths:[source]}}},
  shell:{openPath:async(file)=>{opened=file;return""}}
 });
 try{
  assert.deepEqual(store.list(1),[]);
  assert.throws(()=>store.list("../1"),/Объект/);
  const first=await store.select(1,"КМД");assert.equal(dialogCalls,1);
  assert.equal(first.imported.length,1);
  assert.equal(first.imported[0].kind,"Не определён","the drawing kind is chosen after import");
  assert.match(first.imported[0].sha256,/^[a-f0-9]{64}$/);
  assert.equal(first.imported[0].exists,true);
  assert.equal(first.imported[0].status,"Не распознано");
  assert.equal(store.list(2).length,0,"other objects must be isolated");
  const duplicate=await store.select(1,"КМД");
  assert.equal(duplicate.imported.length,0);assert.equal(duplicate.skipped.length,1);
  assert.equal(store.list(1).length,1);
  const id=first.imported[0].id;
  const kinds=store.setKinds(1,[{id,kind:"КМД сборочные"}]);
  assert.deepEqual([kinds.changed,kinds.documents[0].kind],[1,"КМД сборочные"]);
  assert.throws(()=>store.setKinds(1,[{id,kind:"Чертёж"}]),/Неизвестный тип/);
  assert.throws(()=>store.setKinds(2,[{id,kind:"КМ"}]),/не найден/,"kinds cannot be changed across objects");
  const excluded=store.setExcluded(1,id,[3,1,3]);
  assert.deepEqual(excluded.excluded,[1,3],"excluded sheets are unique and sorted");
  assert.throws(()=>store.setExcluded(1,id,[0]),/Некорректный список/);
  assert.throws(()=>store.setExcluded(2,id,[1]),/не найден/,"sheets cannot be changed across objects");
  assert.equal(store.sheets(1,id),null,"no sheet list before the first read");
  store.saveSheets(1,id,[{page:1,code:"КМ-1"},{page:2,code:"КМ-2"}]);
  assert.deepEqual([store.sheets(1,id).length,store.list(1)[0].pages,store.list(1)[0].excluded],[2,2,[1,3]]);
  assert.rejects(()=>store.open(2,id),/не найден/);
  await store.open(1,id);assert(opened.startsWith(path.join(tmp,"ir-project-ai","objects","1")+path.sep));
  assert.equal(fs.readFileSync(opened,"utf8"),fs.readFileSync(source,"utf8"));
  const row=db.getEntity(1,"ai-documents",id);
  assert(!row.data.stored_name.includes("K41"),"private source filename isn't the storage key");
  assert.equal(store.remove(1,id),true);
  assert(!fs.existsSync(opened));assert.equal(store.list(1).length,0);
  const bad=path.join(tmp,"blocked.exe");fs.writeFileSync(bad,"file");
  const restricted=createStore({getUserDataPath:()=>tmp,database:db,
   dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[bad]})},
   shell:{openPath:async()=>""}});
  const blocked=await restricted.select(1);
  assert.equal(blocked.imported.length,0);assert.equal(blocked.errors.length,1);
  const other=await store.select(2,"КМ");
  assert.equal(other.imported.length,1);assert.equal(other.imported[0].kind,"КМ");
  store.deleteObjectFiles(2);assert(!fs.existsSync(path.join(tmp,"ir-project-ai","objects","2")));
  console.log("AI storage: local-only, SHA-256, duplicate safety, object isolation, open/delete passed.");
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
