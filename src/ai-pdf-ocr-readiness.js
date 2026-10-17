"use strict";
/* Read-only OCR status for indexed PDF pages. Never changes mounting data. */
const {scanSummary}=require("./ai-pdf-scan-queue");
const {ocrStatus}=require("./ai-pdf-ocr-status");
function pdfOcrReadiness(index,{languageDir,packageResolver}={}){
 const selection=scanSummary(index);
 const runtime=ocrStatus({languageDir,packageResolver});
 return{...selection,runtime,
  canProcess:selection.ocrCandidatePages>0&&runtime.ready,
  autoPlacement:false}
}
module.exports={pdfOcrReadiness};
