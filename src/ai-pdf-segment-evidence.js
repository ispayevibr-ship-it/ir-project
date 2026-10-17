"use strict";
/* Geometry adjacency is evidence only; drawing strokes may be axes, dimensions or details. */
function nearestSegments(point,segments,{maxDistancePt=12,limit=5}={}){
 if(!point||![point.x,point.y].every(Number.isFinite))return[];
 if(!Number.isFinite(maxDistancePt)||maxDistancePt<=0)return[];
 const found=[];
 for(let i=0;i<(segments||[]).length;i++){
  const s=segments[i];
  if(!s||![s.x1,s.y1,s.x2,s.y2].every(Number.isFinite))continue;
  const dx=s.x2-s.x1,dy=s.y2-s.y1,lengthSq=dx*dx+dy*dy;
  if(lengthSq<1e-8)continue;
  const t=Math.max(0,Math.min(1,((point.x-s.x1)*dx+(point.y-s.y1)*dy)/lengthSq));
  const closestX=s.x1+t*dx,closestY=s.y1+t*dy;
  const distancePt=Math.hypot(point.x-closestX,point.y-closestY);
  if(distancePt>maxDistancePt)continue;
  found.push({segmentIndex:i,distancePt,closestX,closestY,
   segmentLengthPt:Math.sqrt(lengthSq),angleRadians:Math.atan2(dy,dx),
   x1:s.x1,y1:s.y1,x2:s.x2,y2:s.y2,
   verification:"required",safeForAutoPlacement:false});
 }
 found.sort((a,b)=>a.distancePt-b.distancePt||a.segmentIndex-b.segmentIndex);
 return found.slice(0,Math.max(0,Math.floor(limit)));
}
module.exports={nearestSegments};
