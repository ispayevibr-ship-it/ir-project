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

test("existing PDF list returns register match statistics without new IPC",()=>{
 const database={
  getObject:id=>id===1?{id}:null,
  listEntity:(_id,key)=>key==="marks"?[{data:{mark:"К62"}},{data:{mark:"Б1"}}]:
   key==="ai-pdf-index"?[{id:10,record_type:"pdf_text_index",data:{
    source:{documentId:7,name:"sheet.pdf"},total:2,
    pages:[{page:1,fragments:[{text:"К62 Б1"}]},{page:2,fragments:[{text:"К62"}]}]
   }}]:[]
 };
 const report=createPdfIndex({database,documents:{}}).list(1)[0].markStats;
 assert.equal(report.registerMarks,2);
 assert.equal(report.matchedMarks,2);
 assert.equal(report.occurrences,3);
 assert.deepEqual(report.perPage.map(p=>p.occurrences),[2,1]);
 assert.equal(report.safeForAutoPlacement,false);
});

test("does not double-count old indexes of the same drawing",()=>{
 const database={
  getObject:()=>({id:1}),
  listEntity:(_id,key)=>key==="marks"?[{data:{mark:"К62"}}]:
   key==="ai-pdf-index"?[{
    id:4,record_type:"pdf_text_index",data:{source:{documentId:9,name:"old.pdf"},
     pages:[{page:1,fragments:[{text:"К62 К62"}]}]}
   },{
    id:5,record_type:"pdf_text_index",data:{source:{documentId:9,name:"new.pdf"},
     pages:[{page:1,fragments:[{text:"К62"}]}]}
   }]:[]
 };
 const index=createPdfIndex({database,documents:{}});
 assert.equal(index.list(1).length,1);
 assert.equal(index.markSummary(1).totalOccurrences,1);
});

test("existing PDF page API exposes calibrated mark candidates without placing structures",()=>{
 const database={
  getObject:()=>({id:1}),
  listEntity:(_id,key)=>key==="marks"?[{data:{mark:"К62"}}]:
   key==="ai-pdf-index"?[{id:7,record_type:"pdf_text_index",data:{
    source:{documentId:2,name:"sheet.pdf"},
    pages:[{page:1,heightPt:100,rotation:0,fragments:[{text:"К62",x:60,y:80}]}]
   }}]:[]
 };
 const index=createPdfIndex({database,documents:{}});
 const unknown=index.page(1,7,1);
 assert.equal(unknown.projection.calibrated,false);
 assert.equal(unknown.markMatches[0].xMm,null);
 const calibrated=index.page(1,7,1,{anchors:[
  {pdfX:10,pdfY:20,mmX:0,mmY:0},
  {pdfX:110,pdfY:20,mmX:45000,mmY:0}
 ]});
 assert.equal(calibrated.projection.calibrated,true);
 assert.equal(calibrated.markMatches[0].xMm,22500);
 assert.equal(calibrated.markMatches[0].z0Mm,null);
 assert.equal(calibrated.markMatches[0].safeForAutoPlacement,false);
});

test("counts each indexed page independently even when PDF page numbers repeat",()=>{
 const database={
  getObject:()=>({id:1}),
  listEntity:(_id,key)=>key==="marks"?[{data:{mark:"К62"}}]:
   key==="ai-pdf-index"?[{id:12,record_type:"pdf_text_index",data:{
    source:{documentId:12,name:"drawing.pdf"},total:2,
    pages:[{page:1,fragments:[{text:"К62"}]},
     {page:1,fragments:[{text:"К62 К62"}]}]
   }}]:[]
 };
 const stats=createPdfIndex({database,documents:{}}).list(1)[0].markStats;
 assert.equal(stats.occurrences,3);
 assert.deepEqual(stats.perPage.map(p=>p.occurrences),[1,2]);
});
