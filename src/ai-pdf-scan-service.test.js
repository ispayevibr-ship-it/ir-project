"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {createScanService}=require("./ai-pdf-scan-service");
function fixture(){
 const saved=[];
 const database={getObject:id=>id===1?{}:null,
  listEntity:()=>saved,
  createEntity:(_id,_type,row)=>{const item={id:saved.length+1,...row};saved.push(item);return item}};
 const documents={readForPdfIndex:async()=>({source:{sha256:"abc",name:"scan.pdf"}}),
  verify:()=>true};
 const pdfIndex={list:()=>[{documentId:2,sourceSha256:"abc",
  pages:[{page:1,hasTextLayer:false,text:""}]}]};
 const renderer={};
 return{saved,database,documents,pdfIndex,renderer}
}
test("scan OCR evidence is persisted and cached without changing text index",async()=>{
 const f=fixture();let calls=0;
 const service=createScanService({...f,languageDir:"/test",analyzer:async()=>{
  calls++;return{status:"review_required",sourceSha256:"abc",text:"К62",
   words:[{text:"К62",x0:1,y0:1,x1:20,y1:12}],widthPt:100,heightPt:100,
   imageWidth:200,imageHeight:200}
 }});
 const a=await service.run(1,2,1);
 const b=await service.run(1,2,1);
 assert.equal(a.cached,false);assert.equal(b.cached,true);
 assert.equal(calls,1);assert.equal(f.saved.length,1);
 assert.equal(f.saved[0].data.safeForAutoPlacement,false);
});
test("scan OCR rejects source mismatch",async()=>{
 const f=fixture();
 const service=createScanService({...f,languageDir:"/test",analyzer:async()=>({
  status:"review_required",sourceSha256:"different"})});
 await assert.rejects(service.run(1,2,1),/verification failed/);
 assert.equal(f.saved.length,0);
});
