"use strict";
/* Integration test uses a genuine generated PDF, not a mocked PDF.js answer. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),crypto=require("node:crypto");
const {createPdfIndex}=require("../src/ai-pdf-index");
function pdfWithText(text){
 const stream=text?"BT /F1 16 Tf 72 760 Td ("+text+") Tj ET":"";
 const bodies=[
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  "<< /Length "+Buffer.byteLength(stream,"latin1")+" >>\nstream\n"+stream+"\nendstream",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
 ];
 let data="%PDF-1.4\n",offsets=[0];
 for(let i=0;i<bodies.length;i++){offsets.push(Buffer.byteLength(data,"latin1"));data+=(i+1)+" 0 obj\n"+bodies[i]+"\nendobj\n"}
 const start=Buffer.byteLength(data,"latin1");
 data+="xref\n0 6\n0000000000 65535 f \n";
 for(const pos of offsets.slice(1))data+=String(pos).padStart(10,"0")+" 00000 n \n";
 data+="trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+start+"\n%%EOF\n";
 return Buffer.from(data,"latin1")
}
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-pdf-index-"));
 let created=0;const rows=[];
 const database={
  getObject:id=>Number(id)===1||Number(id)===2?{id}:null,
  listEntity:(objectId,section)=>rows.filter(r=>r.object_id===objectId&&r.section_key===section),
  createEntity:(objectId,sectionKey,entry)=>{
   const r={id:++created,object_id:objectId,section_key:sectionKey,
    record_type:entry.record_type,title:entry.title,created_at:"2026-10-15",data:entry.data};
   rows.push(r);return r
  }
 };
 const one=pdfWithText("K41 KM Drawing"),two=pdfWithText("");
 const source={documentId:8,name:"KM_K41.pdf",sha256:crypto.createHash("sha256").update(one).digest("hex"),format:"PDF"};
 const docs={readForPdfIndex:async(id,docId)=>{
  if(id!==1)throw Error("isolation enforced");
  if(docId===8)return{buffer:one,source};
  if(docId===9)return{buffer:two,source:{...source,documentId:9,name:"scan.pdf",sha256:crypto.createHash("sha256").update(two).digest("hex")}};
  throw Error("document not found")
 }};
 const events=[];const index=createPdfIndex({database,documents:docs,onProgress:p=>events.push(p)});
 try{
  assert.equal(index.list(1).length,0);
  assert.rejects(()=>index.index(3,8),/Объект/);
  const result=await index.index(1,8);
  assert.equal(result.cached,false);assert.equal(result.totalPages,1);
  assert.equal(result.pages[0].page,1);
  assert.equal(result.pages[0].hasTextLayer,true);
  assert.match(result.pages[0].excerpt,/K41/);
  assert.equal(result.pages[0].widthPt,595);assert.equal(result.pages[0].heightPt,842);
  assert.equal(events.length,1);
  const full=index.page(1,result.id,1);
  assert.match(full.page.text,/K41/);
  assert(full.page.fragments.some(f=>f.text.includes("K41")&&f.x>0&&f.y>0));
  assert.equal(full.source.sha256,source.sha256);
  assert.throws(()=>index.page(2,result.id,1),/Индекс PDF не найден/);
  const cached=await index.index(1,8);assert.equal(cached.cached,true);
  assert.equal(rows.length,1,"no duplicate DB records");
  const blank=await index.index(1,9);
  assert.equal(blank.pages[0].hasTextLayer,false);
  assert.equal(blank.pages[0].excerpt,"");
  assert.equal(index.list(1).length,2);
  assert.equal(index.list(2).length,0);
  assert.equal(rows[0].data.generatedByAI,false);
  console.log("AI PDF: actual PDF.js worker extracted text and geometry; scanned-page warning and object isolation passed.");
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
