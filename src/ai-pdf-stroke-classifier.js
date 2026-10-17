'use strict';
/* Heuristic vector stroke categories. Never interpret a drawing stroke as
 * a structural member without verified topology and drawing context. */
function classifySegments(segments,{minStructuralLengthPt=14}={}){
 const valid=(segments||[]).map((s,index)=>{
  if(!s||!['x1','y1','x2','y2'].every(k=>Number.isFinite(s[k])))return null;
  const dx=s.x2-s.x1,dy=s.y2-s.y1,lengthPt=Math.hypot(dx,dy);
  if(lengthPt<0.01)return null;
  const angle=Math.atan2(dy,dx);
  return {index,lengthPt,angle,midX:(s.x1+s.x2)/2,midY:(s.y1+s.y2)/2,
   horizontal:Math.abs(dy)<=Math.max(0.75,lengthPt*0.01),
   vertical:Math.abs(dx)<=Math.max(0.75,lengthPt*0.01)};
 }).filter(Boolean);
 return valid.map(item=>{
  // Length and orientation are useful ranking signals, not reliable classes.
  const structuralCandidate=item.lengthPt>=minStructuralLengthPt;
  return {...item,classification:structuralCandidate?'unclassified_long_stroke':'short_or_detail_stroke',
   couldBeAxis:structuralCandidate&&(item.horizontal||item.vertical),
   couldBeDimension:structuralCandidate,
   couldBeStructure:structuralCandidate,
   verified:false};
 });
}
function rankSegmentsNearMarks({segments,marks,maxDistancePt=12}={}){
 const categories=classifySegments(segments);
 return (marks||[]).map(mark=>{
  const point=mark?.pdfPoint;
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))
   return {mark:mark?.mark,candidates:[],verified:false};
  const candidates=categories.map(s=>{
   const raw=segments[s.index],dx=raw.x2-raw.x1,dy=raw.y2-raw.y1;
   const t=Math.max(0,Math.min(1,((point.x-raw.x1)*dx+(point.y-raw.y1)*dy)/(dx*dx+dy*dy)));
   const distancePt=Math.hypot(point.x-(raw.x1+t*dx),point.y-(raw.y1+t*dy));
   return {...s,distancePt};
  }).filter(s=>s.distancePt<=maxDistancePt)
   .sort((a,b)=>a.distancePt-b.distancePt||b.lengthPt-a.lengthPt).slice(0,12);
  return {mark:mark.mark,candidates,verified:false,safeForAutoPlacement:false};
 });
}
module.exports={classifySegments,rankSegmentsNearMarks};
