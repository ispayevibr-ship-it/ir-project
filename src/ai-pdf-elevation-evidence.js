'use strict';
/* Associate elevation text with mark text in PDF point space.
 * Proximity alone is not evidence of structural bottom/top. */
function elevationEvidence(candidates,{radiusPt=120}={}){
 const associations=Array.isArray(candidates?.spatialAssociations)?candidates.spatialAssociations:[];
 const elevations=(candidates?.observations||[]).filter(o=>o.kind==='elevation'&&
   Number.isFinite(o.valueMm)&&o.point&&Number.isFinite(o.point.x)&&Number.isFinite(o.point.y));
 return associations.map(item=>{
  const p=item.pdfPoint;
  if(!p)return {mark:item.mark,page:item.page,z0Mm:null,z1Mm:null,evidence:[],status:'review'};
  const near=elevations.map(o=>({...o,distancePt:Math.hypot(o.point.x-p.x,o.point.y-p.y)}))
   .filter(o=>o.distancePt<=radiusPt).sort((a,b)=>a.distancePt-b.distancePt);
  const evidence=near.slice(0,12).map(o=>({fragmentIndex:o.fragmentIndex,valueMm:o.valueMm,
    distancePt:Math.round(o.distancePt*100)/100,text:o.text}));
  // Never assign Z0/Z1 from nearby elevation numbers: drawings may contain
  // roof, foundation, section and reference elevations on the same sheet.
  return {mark:item.mark,page:item.page,fragmentIndex:item.fragmentIndex,
    z0Mm:null,z1Mm:null,evidence,status:'review',verified:false};
 });
}
module.exports={elevationEvidence};
