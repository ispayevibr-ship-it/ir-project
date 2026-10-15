"use strict";
/* Deferred source-provenance contract. Do not run until final acceptance. */
const assert=require("node:assert/strict");
const {createAiWorkflow}=require("../src/ai-workflow");
(()=>{
 const sha="b".repeat(64),source={documentId:7,name:"КМД.pdf",sha256:sha,kind:"КМД"};
 const task={id:55,object_id:1,record_type:"sheet_task",
  created_at:"2026-10-15",updated_at:"2026-10-15",
  data:{page:2,source,indexId:10,status:"awaiting_review",analysisId:99,attempts:1}};
 let analysisPage=1,region=null;
 const database={
  getObject:id=>Number(id)===1?{id:1}:null,
  listEntity:(id,section)=>section==="ai-workflow-tasks"?[task]:[]
 };
 const docs={list:()=>[{id:7,name:"КМД.pdf",exists:true,ext:".pdf",kind:"КМД",sha256:sha}]};
 const reviews={list:()=>[{id:99,documentId:7,sha256:sha,kind:"КМД",
  page:analysisPage,region,status:"confirmed",reviewedAt:"2026-10-15"}]};
 const flow=createAiWorkflow({database,documents:docs,pdfIndex:{list:()=>[]},
  analysis:{},reviews,engine:{status:()=>({state:"ready"})}});
 let entry=flow.list(1)[0];
 assert.equal(entry.status,"failed","confirmation of another PDF page must not count");
 assert.match(entry.lastError,/не принадлежит исходному PDF/);
 assert.equal(entry.reviewStatus,null);
 analysisPage=2;
 entry=flow.list(1)[0];
 assert.equal(entry.status,"confirmed","exact original PDF sheet can be confirmed");
 region={x:0.1,y:0.1,width:0.2,height:0.2};
 entry=flow.list(1)[0];
 assert.equal(entry.status,"failed","region-only proposal is not a whole-sheet task result");
 assert.equal(flow.summary(1).byStatus.failed,1);
 console.log("Deferred IR Project AI workflow provenance acceptance");
})();
