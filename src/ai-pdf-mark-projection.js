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
  rotationRadians:mapping.rotationRadians,anchorsVerified:mapping.anchorsVerified,
  candidates:hits.map(hit=>{
   const xy=mapping.transform(hit.x,hit.y);
   return {...hit,xMm:xy?.xMm??null,yMm:xy?.yMm??null,
    z0Mm:null,z1Mm:null,
    coordinateStatus:xy?"label_coordinate_only":"missing_pdf_position",
    safeForAutoPlacement:false};
  })};
}
module.exports={projectMarks};
