"use strict";
/* Project-specific calibration is supplied by the user, never inferred from text labels.
 * A projected text label is evidence only, not an element anchor or placement. */
const {projectMarks}=require("./ai-pdf-mark-projection");
function buildCoordinateCandidates({page,registerMarks,anchors,documentId,sourceSha256}={}){
 const projected=projectMarks(page,registerMarks,anchors);
 return{documentId:documentId??null,sourceSha256:sourceSha256??null,
  page:Number(page?.page)||null,calibrated:projected.calibrated,
  reason:projected.reason||null,
  candidates:projected.candidates.map(hit=>({
   mark:hit.mark,page:hit.page,documentId:documentId??null,
   sourceSha256:sourceSha256??null,
   pdfX:hit.x,pdfY:hit.y,
   xMm:hit.xMm,yMm:hit.yMm,z0Mm:null,z1Mm:null,
   coordinateStatus:hit.coordinateStatus,
   verification:"required",safeForAutoPlacement:false
  })),safeForAutoPlacement:false};
}
module.exports={buildCoordinateCandidates};
