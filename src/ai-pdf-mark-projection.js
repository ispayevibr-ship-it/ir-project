"use strict";
const {markOccurrences}=require("./ai-pdf-mark-matcher");
const {calibrate}=require("./ai-pdf-axis-calibration");
/* Produces candidate coordinates only. A PDF label is not a verified structural anchor. */
function projectMarks(page,allowedMarks,anchors){
 const hits=markOccurrences(page,allowedMarks);
 if(!Array.isArray(anchors)||anchors.length<2)
  return {calibrated:false,reason:"Опорные точки не заданы",candidates:hits.map(hit=>({
   ...hit,xMm:null,yMm:null,z0Mm:null,z1Mm:null,
   coordinateStatus:"not_calibrated",safeForAutoPlacement:false
  }))};
 let mapping;
 try{mapping=calibrate({anchors})}
 catch(error){return {calibrated:false,reason:String(error.message),candidates:hits.map(hit=>({
  ...hit,xMm:null,yMm:null,z0Mm:null,z1Mm:null,
  coordinateStatus:"invalid_calibration",safeForAutoPlacement:false
 }))}}
 return {calibrated:true,scaleMmPerPdfUnit:mapping.scaleMmPerPdfUnit,
  rotationRadians:mapping.rotationRadians,anchorsSupplied:mapping.anchorsSupplied,
  candidates:hits.map(hit=>{
   // Existing text indexes store PDF.js transform coordinates (origin bottom-left).
   // Geometry extractor uses viewport coordinates (origin top-left). Never mix them.
   const rotation=Number(page?.rotation||0);
   const supported=rotation===0&&Number.isFinite(Number(page?.heightPt))&&
    Number(page.heightPt)>0;
   const pdfX=supported&&hit.x!==null?hit.x:null;
   const pdfY=supported&&hit.y!==null?Number(page.heightPt)-hit.y:null;
   const xy=mapping.transform(pdfX,pdfY);
   return {...hit,xMm:xy?.xMm??null,yMm:xy?.yMm??null,
    z0Mm:null,z1Mm:null,
    coordinateStatus:xy?"label_coordinate_only":
     !supported?"unsupported_page_coordinates":"missing_pdf_position",
    safeForAutoPlacement:false};
  })};
}
module.exports={projectMarks};
