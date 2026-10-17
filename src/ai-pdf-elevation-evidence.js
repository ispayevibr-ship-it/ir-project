'use strict';
/* Associate elevation text with mark text in PDF point space.
 * Proximity alone is not evidence of structural bottom/top. */
function elevationEvidence(candidates,{radiusPt=120}={}){
 const associations=Array.isArray(candidates?.spatialAssociations)?candidates.spatialAssociations:[];
 const elevations=(candidates?.observations||[]).filter(o=>o.kind==='elevation'&&
   Number.isFinite(o.valueMm)&&o.point&&Number.isFinite(o.point.x)&&Number.isFinite(o.point.y));
 const shared=new Set();
 elevations.forEach((observation,index)=>{
  const matches=associations.filter(a=>a.pdfPoint&&Number.isFinite(a.pdfPoint.x)&&Number.isFinite(a.pdfPoint.y)&&
   Math.hypot(observation.point.x-a.pdfPoint.x,observation.point.y-a.pdfPoint.y)<=radiusPt);
  if(matches.length>1)shared.add(index);
 });
 return associations.map(item=>{
  const p=item.pdfPoint;
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return {mark:item.mark,page:item.page,z0Mm:null,z1Mm:null,evidence:[],status:'review'};
  const near=elevations.map((o,index)=>({...o,observationIndex:index,distancePt:Math.hypot(o.point.x-p.x,o.point.y-p.y)}))
   .filter(o=>o.distancePt<=radiusPt).sort((a,b)=>a.distancePt-b.distancePt);
  const evidence=near.slice(0,12).map(o=>({fragmentIndex:o.fragmentIndex,valueMm:o.valueMm,
    distancePt:Math.round(o.distancePt*100)/100,text:o.text,
    sharedWithNearbyMarks:shared.has(o.observationIndex),
    levelHint:/^(?:низ|z0)\b/iu.test(o.text)?'bottom':/^(?:верх|z1)\b/iu.test(o.text)?'top':null}));
  const bottom=evidence.filter(o=>o.levelHint==='bottom');
  const top=evidence.filter(o=>o.levelHint==='top');
  const levelReview={bottomCandidates:bottom.length,topCandidates:top.length,
    sharedElevationEvidence:evidence.some(o=>o.sharedWithNearbyMarks),
    status:bottom.length===1&&top.length===1&&bottom[0].valueMm<top[0].valueMm&&!evidence.some(o=>o.sharedWithNearbyMarks)?
     'explicit_pair_unverified':bottom.length>1||top.length>1?'ambiguous_levels':'insufficient_levels'};
  // Never assign Z0/Z1 from nearby elevation numbers: drawings may contain
  // roof, foundation, section and reference elevations on the same sheet.
  return {mark:item.mark,page:item.page,fragmentIndex:item.fragmentIndex,
    z0Mm:null,z1Mm:null,evidence,levelReview,status:'review',verified:false};
 });
}
module.exports={elevationEvidence};
