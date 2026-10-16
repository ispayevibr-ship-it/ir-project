"use strict";
/* Deferred final acceptance contract. DO NOT execute during WIP development. */
const assert=require("node:assert/strict");
const {createAiWorkflow}=require("../src/ai-workflow");
function fixture(){
 let seq=20;const objects=new Set([1,2]),table=new Map(),copy=x=>x==null?null:JSON.parse(JSON.stringify(x));
 const key=(o,s,n)=>[o,s,n].join(":");
 const create=(o,s,value)=>{
  const row={id:++seq,object_id:o,section_key:s,record_type:value.record_type,
   title:value.title||"",parent_id:value.parent_id||null,
   data:copy(value.data||{}),created_at:"2026-10-16"};
  table.set(key(o,s,row.id),row);return copy(row)
 };
 const db={
  getObject:o=>objects.has(Number(o))?{id:Number(o)}:null,
  listEntity:(o,s)=>[...table.values()].filter(x=>x.object_id===Number(o)&&x.section_key===s).map(copy),
  getEntity:(o,s,n)=>copy(table.get(key(Number(o),s,Number(n)))),
  createEntity:(o,s,value)=>create(o,s,value),
  updateEntity:(o,s,n,value)=>{
   const k=key(Number(o),s,Number(n)),row=table.get(k);if(!row)return null;
   const next={...row,title:value.title,record_type:value.record_type,
    parent_id:value.parent_id||null,data:copy(value.data)};
   table.set(k,next);return copy(next)
  },
  transaction:fn=>{
   const backup=new Map([...table].map(([k,v])=>[k,copy(v)])),old=seq;
   try{return fn()}catch(e){table.clear();for(const [k,v] of backup)table.set(k,v);seq=old;throw e}
  }
 };
 return{db,create}
}
(async()=>{
 const {db,create}=fixture(),sha="a".repeat(64);
 const document=create(1,"ai-documents",{record_type:"document",title:"041-2025-КМД",
  data:{kind:"КМД",extension:".pdf",sha256:sha,original_name:"041 КМД.pdf"}});
 let existing=true,ready=false,analysisCount=0;
 let reviewEntries=[];
 const documents={list:oid=>oid===1?[{id:document.id,kind:"КМД",name:"041 КМД.pdf",
  ext:".pdf",sha256:sha,exists:existing}]:[]};
 const pdfIndex={list:oid=>oid===1?[{id:55,documentId:document.id,
  sourceSha256:sha,totalPages:2,pages:[{page:1,hasTextLayer:true},{page:2,hasTextLayer:false}]}]:[]};
 const engine={status:()=>({state:ready?"ready":"missing"})};
 const reviews={list:oid=>oid===1?reviewEntries:[]};
 const analysis={analyzePdf:async(oid,doc,page)=>{
  analysisCount++;
  const result={id:100+analysisCount,documentId:doc,page,sha256:sha,kind:"КМД",sourceName:"041 КМД.pdf",
   region:null,status:"requires_review"};
  reviewEntries.push(result);
  return{id:result.id}
 }};
 let signals=0;
 const queue=createAiWorkflow({database:db,documents,pdfIndex,analysis,reviews,engine,
  clock:()=>"2026-10-16T10:00:00Z",onProgress:()=>{signals++}});
 assert.throws(()=>queue.enqueue(1,document.id,[1],{role:"guest"}),/инженер/);
 assert.throws(()=>queue.enqueue(1,document.id,[3],{role:"engineer"}),/отсутствует/);
 assert.throws(()=>queue.enqueue(1,document.id,[1,1],{role:"engineer"}),/дважды/);
 assert.deepEqual(queue.enqueue(1,document.id,[1,2],{role:"engineer"}).added,2);
 assert.equal(queue.enqueue(1,document.id,[1],{role:"engineer"}).skipped,1);
 assert.equal(queue.summary(1).total,2);
 assert.equal(queue.summary(2).total,0);
 assert.equal(queue.start(1,{role:"engineer"}).started,true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(analysisCount,0,"offline missing engine never fabricates analyses");
 assert.equal(queue.list(1).filter(x=>x.status==="needs_model").length,1);
 ready=true;
 const blocked=queue.list(1).find(x=>x.status==="needs_model");
 queue.retry(1,blocked.id,{role:"engineer"});
 queue.start(1,{role:"engineer"});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(analysisCount,2);
 assert.equal(queue.list(1).filter(x=>x.status==="awaiting_review").length,2);
 assert.equal(queue.summary(1).confirmedAnalyses,0);
 reviewEntries[0].status="confirmed";
 assert.equal(queue.list(1).filter(x=>x.status==="confirmed").length,1);
 assert.equal(queue.history(1,blocked.id).length>=3,true);
 assert.throws(()=>queue.retry(1,blocked.id,{role:"engineer"}),/разрешён/);
 assert.throws(()=>queue.history(2,blocked.id),/не найдено/);
 existing=false;
 assert.equal(queue.list(1).every(x=>x.status==="outdated"),true);
 assert(signals>0);
 console.log("Deferred workflow acceptance: source bounds, deduplication, real inference only, review, integrity PASS");
})().catch(error=>{console.error(error);process.exitCode=1});
