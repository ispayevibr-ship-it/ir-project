"use strict";
/* Run only during the final verification phase. Uses no AI weights/downloads. */
const assert=require("node:assert/strict");
const {createAiReview}=require("../src/ai-review");
function makeFakeDatabase(){
 let seq=5;
 const data=new Map(),objects=new Set([7,8]);
 const rows=[];
 function clone(x){return JSON.parse(JSON.stringify(x))}
 function key(o,s,n){return o+":"+s+":"+n}
 function insert(o,s,payload){
  const id=++seq;
  const row={id,object_id:o,section_key:s,record_type:payload.record_type||"item",
   parent_id:payload.parent_id||null,title:payload.title||"",data:clone(payload.data||{}),
   created_at:"2026-10-16",updated_at:"2026-10-16"};
  data.set(key(o,s,id),row);return clone(row)
 }
 const db={
  getObject:id=>objects.has(Number(id))?{id:Number(id)}:null,
  listEntity:(oid,section)=>[...data.values()].filter(x=>x.object_id===Number(oid)&&x.section_key===section).map(clone),
  getEntity:(oid,section,id)=>clone(data.get(key(Number(oid),section,Number(id)))||null),
  createEntity:(oid,section,payload)=>insert(Number(oid),section,payload),
  updateEntity:(oid,section,id,payload)=>{
   const k=key(Number(oid),section,Number(id)),r=data.get(k);if(!r)return null;
   const next={...r,record_type:payload.record_type||r.record_type,
    parent_id:payload.parent_id||null,title:payload.title||r.title,data:clone(payload.data)};
   data.set(k,next);return clone(next)
  },
  transaction:fn=>{
   const backup=[...data.entries()].map(([k,v])=>[k,clone(v)]),old=seq;
   try{return fn()}catch(e){data.clear();for(const [k,v] of backup)data.set(k,v);seq=old;throw e}
  }
 };
 return{db,insert}
}
(()=>{
 const {db,insert}=makeFakeDatabase();
 const first=insert(7,"ai-analysis",{
  record_type:"image_analysis",title:"Колонна К41",
  data:{source:{documentId:2,name:"К41.pdf",page:45,sha256:"a".repeat(64),
   region:{x:0.2,y:0.1,width:0.4,height:0.3}},
   raw:'{"marks":["К41"]}',extracted:{text:"Колонна",marks:["К41"],unknowns:[]},verification:"requires_review"}
 });
 insert(7,"ai-analysis",{record_type:"image_analysis",title:"Балки",
  data:{source:{documentId:3,name:"КМД.pdf",page:55,sha256:"b".repeat(64)},
   raw:'{"marks":["К41"]}',extracted:{marks:["К41"],unknowns:[]}}});
 const foreign=insert(8,"ai-analysis",{record_type:"image_analysis",title:"Иной объект",
  data:{source:{documentId:1,name:"other.pdf"},extracted:{marks:["К41"]}}});
 const ai=createAiReview({database:db,clock:()=>"2026-10-16T10:00:00Z"});
 assert.equal(ai.list(7).length,2);
 assert.equal(ai.list(7)[0].status,"requires_review");
 assert.equal(ai.register(7).length,0,"raw model guesses never enter verified marks");
 assert.throws(()=>ai.confirm(7,foreign.id,{expectedRevision:0,status:"confirmed",marks:["К41"],comment:""},{role:"admin"}),/не найден/);
 assert.throws(()=>ai.confirm(7,first.id,{expectedRevision:0,status:"confirmed",marks:["К41"],comment:""},{role:"guest"}),/Только/);
 assert.throws(()=>ai.confirm(7,first.id,{expectedRevision:0,status:"confirmed",marks:[],comment:""},{role:"engineer"}),/хотя бы одну/);
 assert.throws(()=>ai.confirm(7,first.id,{expectedRevision:0,status:"confirmed",marks:["К41; DROP"],comment:""},{role:"engineer"}),/Недопустимое/);
 const change=ai.confirm(7,first.id,{expectedRevision:0,status:"confirmed",marks:["К41","К41","K41"],
  comment:"Подтверждено по листу 45"},{role:"engineer"});
 assert.equal(change.revision,1);assert.equal(change.reviewedBy,"engineer");
 assert.deepEqual(change.marks,["К41","K41"],"Latin K and Cyrillic К must remain distinct");
 assert.equal(db.getEntity(7,"ai-analysis",first.id).data.raw,'{"marks":["К41"]}',"model raw immutable");
 let register=ai.register(7);
 assert.deepEqual(register.map(x=>x.mark),["K41","К41"]);
 assert(register.every(x=>x.analysisCount===1));
 assert.equal(register[0].sources[0].page,45);
 assert.throws(()=>ai.confirm(7,first.id,{expectedRevision:0,status:"rejected",marks:[],comment:""},{role:"admin"}),/другом окне/);
 assert.equal(ai.history(7,first.id).length,1);
 const second=ai.list(7).find(x=>x.id!==first.id);
 ai.confirm(7,second.id,{expectedRevision:0,status:"confirmed",marks:["К41"],comment:""},{role:"admin"});
 register=ai.register(7);
 assert.equal(register.find(x=>x.mark==="К41").analysisCount,2);
 assert.equal(register.find(x=>x.mark==="К41").sources.length,2);
 assert.equal(register.find(x=>x.mark==="K41").analysisCount,1);
 ai.confirm(7,first.id,{expectedRevision:1,status:"rejected",marks:[],comment:"Ошибочная запись"},{role:"admin"});
 assert.equal(ai.register(7).find(x=>x.mark==="К41").analysisCount,1);
 assert.equal(ai.history(7,first.id).length,2);
 assert.equal(ai.list(8).length,1);
 assert.equal(ai.register(8).length,0);
 console.log("Review contracts: immutable AI source, manual confirmation, provenance, Latin/Cyrillic separation, stale revision, cross-object isolation and audit PASS");
})();
