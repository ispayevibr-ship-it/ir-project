"use strict";
/* A real PDF file in memory, processed by installed pdfjs-dist 6.4.299.
 * This catches packed-operator protocol regressions that synthetic mock
 * tests cannot catch. No fixture or user drawing needed on disk. */
const assert=require("node:assert/strict");
const {extractSegments}=require("../src/ai-pdf-vector-paths");
function fixture(){
 const drawing="q\n1 0 0 1 0 0 cm\n20 40 m\n160 40 l\nS\n"+
  "60 20 m\n60 160 l\nS\n"+
  "20 20 m\n160 20 l\nf\nQ\n";
 const obj=[
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << >> >>",
  "<< /Length "+Buffer.byteLength(drawing)+" >>\nstream\n"+drawing+"endstream"
 ];
 let pdf="%PDF-1.4\n",offsets=[0];
 for(let i=0;i<obj.length;i++){
  offsets.push(Buffer.byteLength(pdf));
  pdf+=(i+1)+" 0 obj\n"+obj[i]+"\nendobj\n"
 }
 const start=Buffer.byteLength(pdf);
 pdf+="xref\n0 5\n0000000000 65535 f \n";
 for(let i=1;i<=4;i++)pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
 pdf+="trailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n"+start+"\n%%EOF\n";
 return new Uint8Array(Buffer.from(pdf))
}
(async()=>{
 const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
 const task=pdfjs.getDocument({data:fixture(),isEvalSupported:false,disableFontFace:true,
  useSystemFonts:false,verbosity:pdfjs.VerbosityLevel.ERRORS});
 const doc=await task.promise;
 const page=await doc.getPage(1);
 const list=await page.getOperatorList();
 assert(list.fnArray.includes(pdfjs.OPS.constructPath),
  "real PDF.js did not emit constructPath");
 const geo=extractSegments(list,pdfjs.OPS,page.getViewport({scale:1}));
 assert(geo.segments.length>=2,
  "real PDF.js painted paths were not decoded (possibly changed packed path format)");
 assert(geo.segments.some(s=>s.direction==="horizontal"&&
  Math.abs(s.y1-160)<=.2&&Math.abs(s.x1-20)<=.2&&Math.abs(s.x2-160)<=.2),
 "original horizontal line should transform to viewport y=160");
 assert(geo.segments.some(s=>s.direction==="vertical"&&
  Math.abs(s.x1-60)<=.2),"vertical PDF line should be visible");
 assert(!geo.segments.some(s=>s.y1===180&&s.x1===20&&s.x2===160),
  "fill-only path should never be inferred as a stroked line");
 console.log("Real pdfjs-dist integration: "+geo.segments.length+" genuine PDF strokes PASS");
 page.cleanup();await task.destroy()
})().catch(error=>{console.error(error);process.exitCode=1});
