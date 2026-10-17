"use strict";
/* Pure scan OCR selection for bulk indexing; no OCR on vector/text pages. */
function scanPages(index){
 if(!index||!Array.isArray(index.pages))return [];
 return index.pages.filter(p=>Number.isSafeInteger(Number(p.page))&&
  (!p.hasTextLayer||p.uncertainEncoding||p.ocr?.needed===true))
  .map(p=>({page:Number(p.page),reason:p.uncertainEncoding?"uncertain_encoding":"missing_text_layer"}));
}
function scanSummary(index){
 const pages=scanPages(index);
 return{totalPages:Array.isArray(index?.pages)?index.pages.length:0,
  ocrCandidatePages:pages.length,pages,
  status:pages.length?"ocr_available_if_installed":"text_layer_complete",
  safeForAutoPlacement:false}
}
module.exports={scanPages,scanSummary};
