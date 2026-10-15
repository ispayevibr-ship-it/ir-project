"use strict";
/* The renderer must produce an actual PNG from a vector PDF, not a fake response. */
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),
 path=require("node:path"),crypto=require("node:crypto");
const {createPdfRenderer}=require("../src/ai-pdf-renderer");
const {createAnalysis}=require("../src/ai-analysis");
function pdfFixture(label){
 const commands="q 0.13 0.44 0.83 rg 90 550 240 140 re f Q\nBT /F1 22 Tf 105 740 Td ("+label+") Tj ET";
 const bodies=[
 "<< /Type /Catalog /Pages 2 0 R >>",
 "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
 "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
 "<< /Length "+Buffer.byteLength(commands,"latin1")+" >>\nstream\n"+commands+"\nendstream",
 "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
 ];
 let data="%PDF-1.4\n",offsets=[0];
 for(let i=0;i<bodies.length;i++){offsets.push(Buffer.byteLength(data,"latin1"));data+=(i+1)+" 0 obj\n"+bodies[i]+"\nendobj\n"}
 const xref=Buffer.byteLength(data,"latin1");
 data+="xref\n0 6\n0000000000 65535 f \n";
 for(const off of offsets.slice(1))data+=String(off).padStart(10,"0")+" 00000 n \n";
 data+="trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
 return Buffer.from(data,"latin1")
}
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-pdf-image-"));
 const pdf=pdfFixture("K41 FRAME KM");
 const digest=crypto.createHash("sha256").update(pdf).digest("hex");
 const database={rows:[],getObject:id=>Number(id)===7?{id:7}:null,
  listEntity(id,key){return this.rows.filter(x=>x.object_id===id&&x.section_key===key)},
  createEntity(id,key,item){const row={id:this.rows.length+1,object_id:id,section_key:key,
    record_type:item.record_type,data:item.data,created_at:"2026-10-15"};this.rows.push(row);return row}};
 const documents={readForPdfIndex:async(oid,did)=>{
  assert.equal(oid,7);assert.equal(did,31);
  return{buffer:pdf,source:{documentId:31,name:"frame-K41.pdf",sha256:digest,kind:"КМД",format:"PDF"}}
 }};
 const renderer=createPdfRenderer({database,documents});
 try{
  assert.rejects(renderer.preview(9,31,1),/Объект/);
  assert.rejects(renderer.preview(7,31,0),/Номер листа/);
  const result=await renderer.renderForAnalysis(7,31,1);
  assert.equal(result.page,1);assert.equal(result.total,1);
  assert.equal(result.mime,"image/png");
  assert.equal(result.widthPt,595);assert.equal(result.heightPt,842);
  assert(result.width>=595);assert(result.height>=842);
  assert(result.buffer.length>2000,"PNG should contain rendered PDF pixels");
  assert.deepEqual([...result.buffer.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(result.source.page,1);assert.equal(result.source.sha256,digest);
  const preview=await renderer.preview(7,31,1);
  assert(preview.dataUrl.startsWith("data:image/png;base64,"));
  assert.equal(preview.sourceName,"frame-K41.pdf");
  const engine={status:()=>({state:"ready"}),analyzeImage:async({buffer,mime,prompt})=>{
   assert.equal(mime,"image/png");assert(buffer.length>2000);
   assert(prompt.includes("лист 1"));
   return{raw:JSON.stringify({text:"Виден K41",marks:["K41"],notes:[],unknowns:["масса не определена"]}),
    engine:"local-qwen3-vl",complete:true}
  }};
  const analysis=createAnalysis({database,documents,engine,pdfRenderer:renderer});
  const item=await analysis.analyzePdf(7,31,1);
  assert.deepEqual(item.marks,["K41"]);assert.equal(item.status,"Требует проверки инженера");
  const stored=analysis.list(7);
  assert.equal(stored.length,1);assert.equal(stored[0].page,1);
  assert.equal(stored[0].sha256,digest);
  assert(stored[0].region.includes("PDF лист 1"));
  assert.equal(database.rows[0].data.verification,"requires_review");
  assert.equal(database.rows[0].data.origin,"locally_executed_llama_cpp_pdf_raster");
  console.log("PDF raster: real vector PDF to PNG, verified source/page, preview and unverified AI pipeline PASS");
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
