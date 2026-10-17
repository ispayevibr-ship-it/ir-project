"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {analyzeSheet}=require("./ai-pdf-sheet-analysis");
const page={page:1,heightPt:100,rotation:0,fragments:[{str:"К62",x:50,y:80}]};
const geometry={page:1,heightPt:100,coordinateSystem:"viewport_points_top_left",
 segments:[{x1:40,y1:20,x2:60,y2:20}]};
const anchors=[{pdfX:0,pdfY:20,mmX:0,mmY:0},{pdfX:100,pdfY:20,mmX:45000,mmY:0}];
test("combines mark and nearby vector geometry without auto placement",()=>{
 const r=analyzeSheet({page,geometry,registerMarks:["К62"],anchors});
 assert.equal(r.candidates.length,1);
 assert.equal(r.candidates[0].xMm,22500);
 assert.equal(r.candidates[0].nearbySegments.length,1);
 assert.equal(r.candidates[0].geometryEvidenceStatus,"nearby_unclassified_segments");
 assert.equal(r.candidates[0].z0Mm,null);
 assert.equal(r.verifiedInstances,0);
 assert.equal(r.safeForAutoPlacement,false);
});
test("rejects geometry from a different page",()=>{
 const r=analyzeSheet({page,geometry:{...geometry,page:2},registerMarks:["К62"],anchors});
 assert.equal(r.geometryAligned,false);
 assert.equal(r.candidates[0].nearbySegments.length,0);
});

test("normalized and grouped register labels retain source geometry evidence",()=>{
 for(const str of ["К 62", "К62, К63"]){
  const r=analyzeSheet({page:{...page,fragments:[{str,x:50,y:80}]},geometry,
   registerMarks:["К62","К63"],anchors});
  assert.ok(r.candidates.length);
  for(const candidate of r.candidates){
   assert.equal(candidate.fragmentIndex,0);
   assert.equal(candidate.nearbySegments.length,1);
   assert.equal(candidate.safeForAutoPlacement,false);
  }
 }
});
test("missing source coordinates never attach geometry at origin",()=>{
 const r=analyzeSheet({page:{...page,fragments:[{str:"К62",y:80}]},geometry,
  registerMarks:["К62"],anchors});
 assert.equal(r.candidates[0].geometryEvidenceStatus,"label_position_unavailable");
 assert.equal(r.candidates[0].nearbySegments.length,0);
});
test("rotated geometry is not compared using unrotated label coordinates",()=>{
 for(const change of [{page:{...page,rotation:90}},{geometry:{...geometry,rotation:90}}]){
  const r=analyzeSheet({page,geometry,registerMarks:["К62"],anchors,...change});
  assert.equal(r.geometryAligned,false);
  assert.equal(r.candidates[0].nearbySegments.length,0);
 }
});

test("geometry API combines the matching index and refreshes marks on cache hits",async()=>{
 const {EventEmitter}=require("node:events");
 const {createPdfGeometry}=require("./ai-pdf-geometry");
 let marks=[{data:{mark:"К62"}}],workers=0;
 const entries={"ai-pdf-geometry":[],"ai-pdf-index":[{
  id:1,record_type:"pdf_text_index",data:{source:{documentId:9,sha256:"current"},pages:[page]}
 }]};
 const database={getObject:()=>({id:1}),
  listEntity:(_id,entity)=>entity==="marks"?marks:entries[entity]||[],
  createEntity:(_id,entity,row)=>{entries[entity].push(row);return row}};
 const documents={readForPdfIndex:async()=>({buffer:Buffer.from("PDF"),source:{sha256:"current"}}),verify:()=>true};
 const workerFactory=()=>{
  workers++;const worker=new EventEmitter();worker.terminate=()=>{};
  setImmediate(()=>worker.emit("message",{type:"result",...geometry,widthPt:100}));return worker;
 };
 const service=createPdfGeometry({database,documents,workerFactory});
 const first=await service.page(1,9,1);
 assert.equal(first.sheetAnalysisStatus,"ready");
 assert.equal(first.sheetAnalysis.candidates[0].mark,"К62");
 assert.equal(first.sheetAnalysis.candidates[0].nearbySegments.length,1);
 assert.equal(first.sheetAnalysis.sourceSha256,"current");
 assert.equal(first.sheetAnalysis.safeForAutoPlacement,false);
 marks=[{data:{mark:"Б1"}}];
 const second=await service.page(1,9,1);
 assert.equal(second.cached,true);
 assert.equal(second.sheetAnalysis.candidates.length,0);
 assert.equal(workers,1);
 entries["ai-pdf-index"][0].data.source.sha256="old";
 const stale=await service.page(1,9,1);
 assert.equal(stale.sheetAnalysis,null);
 assert.equal(stale.sheetAnalysisStatus,"matching_text_index_required");
 assert.equal(entries["ai-pdf-geometry"][0].data.result.sheetAnalysis,undefined,
  "register-dependent evidence must not be persisted into geometry cache");
});
