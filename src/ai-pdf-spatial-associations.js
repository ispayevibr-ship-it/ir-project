'use strict';
/* Spatial associations between PDF labels. PDF-point proximity is evidence,
 * not proof of physical construction coordinates. */
function associateLabels(candidates, {radiusPt=90,maxNeighbors=6}={}) {
 const marks=Array.isArray(candidates?.marks)?candidates.marks:[];
 const observations=Array.isArray(candidates?.observations)?candidates.observations:[];
 const chains=Array.isArray(candidates?.dimensionChains)?candidates.dimensionChains:[];
 const nearby=(point,items)=>items.map(item=>{
  const p=item.point||{x:item.xPt,y:item.yPt};
  if(!p||p.x==null||p.y==null||String(p.x).trim()===''||String(p.y).trim()===''||!Number.isFinite(Number(p.x))||!Number.isFinite(Number(p.y)))return null;
  const dx=Number(p.x)-Number(point.x),dy=Number(p.y)-Number(point.y);
  const distancePt=Math.hypot(dx,dy);
  return distancePt<=radiusPt?{...item,distancePt:Math.round(distancePt*100)/100}:null;
 }).filter(Boolean).sort((a,b)=>a.distancePt-b.distancePt).slice(0,maxNeighbors);
 return marks.map(mark=>{
  const point={x:Number(mark.x),y:Number(mark.y)};
  const valid=Number.isFinite(point.x)&&Number.isFinite(point.y)&&mark.x!=null&&mark.y!=null&&String(mark.x).trim()!==''&&String(mark.y).trim()!=='';
  const axisCandidates=valid?nearby(point,observations.filter(o=>o.kind==='axis')):[];
  const elevationCandidates=valid?nearby(point,observations.filter(o=>o.kind==='elevation')):[];
  const dimensionCandidates=valid?nearby(point,[...observations.filter(o=>o.kind==='dimension'),...chains]):[];
  return {mark:mark.mark,page:mark.page,fragmentIndex:mark.fragmentIndex,
   pdfPoint:valid?point:null,axisCandidates,elevationCandidates,dimensionCandidates,
   status:'requires_geometric_verification',safeForAutoPlacement:false};
 });
}
module.exports={associateLabels};
