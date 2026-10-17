"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createPdfIndex}=require("./ai-pdf-index");
test("summarizes only marks in object register across indexed PDF pages",()=>{
 const database={
  getObject:id=>id===1?{id}:null,
  listEntity:(id,key)=>key==="marks"?
   [{data:{mark:"К62"}},{data:{mark:"Б1"}}]:
   key==="ai-pdf-index"?[{id:5,record_type:"pdf_text_index",data:{
    source:{documentId:9,name:"drawing.pdf"},
    pages:[{page:1,fragments:[{text:"К62"},{text:"К62"},{text:"НЕИЗВЕСТНО"}]},
     {page:2,fragments:[{text:"Б1"}]}]}}]:[]
 };
 const index=createPdfIndex({database,documents:{}});
 const report=index.markSummary(1);
 assert.equal(report.totalRegisterMarks,2);
 assert.equal(report.matchedMarks,2);
 assert.equal(report.totalOccurrences,3);
 assert.deepEqual(report.unmatchedMarks,[]);
 assert.equal(report.documents[0].pages[0].occurrences,2);
 assert.equal(report.safeForAutoPlacement,false);
});
