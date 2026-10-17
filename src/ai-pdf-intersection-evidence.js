'use strict';
/* Vector intersection evidence in viewport coordinates, read-only. */
function intersections(segments,{limit=800,tolerance=0.75}={}){
 const lines=(segments||[]).map((s,index)=>({...s,originalIndex:index})).filter(s=>['x1','y1','x2','y2'].every(k=>Number.isFinite(s?.[k])))
  .slice(0,Math.max(0,Math.min(limit,800)));
 const results=[];
 for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
  const a=lines[i],b=lines[j],rx=a.x2-a.x1,ry=a.y2-a.y1,
   sx=b.x2-b.x1,sy=b.y2-b.y1,den=rx*sy-ry*sx;
  if(Math.abs(den)<1e-6)continue;
  const qx=b.x1-a.x1,qy=b.y1-a.y1;
  const t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
  if(t<0||t>1||u<0||u>1)continue;
  const x=a.x1+t*rx,y=a.y1+t*ry;
  if(results.some(p=>Math.hypot(p.x-x,p.y-y)<=tolerance))continue;
  results.push({x:Math.round(x*100)/100,y:Math.round(y*100)/100,segmentIds:[a.originalIndex,b.originalIndex]});
  if(results.length>=5000)return results;
 }
 return results;
}
function intersectionEvidence({page,geometry,candidates,maxDistancePt=20}={}){
 const aligned=geometry?.coordinateSystem==='viewport_points_top_left'&&
  Number(geometry.page)===Number(page?.page)&&
  Number(page?.rotation||0)===0&&Number(geometry.rotation||0)===0&&
  Number.isFinite(page?.heightPt)&&Number.isFinite(geometry?.heightPt)&&Math.abs(Number(geometry.heightPt)-Number(page.heightPt))<1;
 const points=aligned?intersections(geometry.segments):[];
 return {geometryAligned:aligned,intersectionCount:points.length,
  marks:(candidates||[]).map(mark=>{
   const x=Number(mark.pdfX??mark.x),rawY=Number(mark.pdfY??mark.y);
   const valid=aligned&&Number.isFinite(x)&&Number.isFinite(rawY)&&
    (mark.pdfY!=null||mark.y!=null)&&(mark.pdfX!=null||mark.x!=null)&&
    String(mark.pdfX??mark.x).trim()!==''&&String(mark.pdfY??mark.y).trim()!=='';
   const y=Number(page?.heightPt)-rawY;
   const nearby=valid?points.map(p=>({...p,distancePt:Math.hypot(p.x-x,p.y-y)}))
    .filter(p=>p.distancePt<=maxDistancePt).sort((a,b)=>a.distancePt-b.distancePt).slice(0,8):[];
   return {mark:mark.mark,fragmentIndex:mark.fragmentIndex,
    nearbyIntersections:nearby,status:'unverified_vector_evidence',safeForAutoPlacement:false};
  }),safeForAutoPlacement:false};
}
module.exports={intersections,intersectionEvidence};
