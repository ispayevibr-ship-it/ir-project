"use strict";
const {markOccurrences,normalize}=require("./ai-pdf-mark-matcher");
const {extractPageCandidates}=require("./ai-pdf-candidates");
function candidatePlacements(pages,register,grid={}){
 const allowed=Array.isArray(register)?register.map(x=>typeof x==="string"?x:x.mark).filter(Boolean):[];
 const unique=new Map();
 for(const page of pages||[]){
  const hits=markOccurrences(page,allowed);
  const axisProjection=extractPageCandidates(page,allowed,grid).axisProjection;
  const projected=axisProjection.placements||[];
  for(const hit of hits){
   const key=normalize(hit.mark);
   if(!unique.has(key))unique.set(key,[]);
   const nearby=(page.levelCandidates||[]).filter(v=>v.x!=null&&v.y!=null&&hit.x!=null&&hit.y!=null)
    .map(v=>({...v,distancePt:Math.hypot(v.x-hit.x,v.y-hit.y)}))
    .filter(v=>v.distancePt<=100).sort((a,b)=>a.distancePt-b.distancePt);
   const mapped=projected.find(p=>p.fragmentIndex===hit.fragmentIndex&&normalize(p.mark)===key);
   unique.get(key).push({mark:hit.mark,page:page.page,point:{x:hit.x,y:hit.y},
    xMm:mapped?.xMm??null,yMm:mapped?.yMm??null,z0Mm:null,z1Mm:null,
    coordinateStatus:mapped?.xMm!=null&&mapped?.yMm!=null?"label_coordinate_only":"unresolved",
    levelCandidates:nearby.slice(0,10),status:"requires_review",safeForAutoPlacement:false});
  }
 }
 const positions=[...unique.values()].flat();
 return {registerCount:allowed.length,matchedMarks:unique.size,occurrences:positions.length,
  candidates:positions,readyForPlacement:[],requiresReview:positions,
  missingMarks:allowed.filter(m=>!unique.has(normalize(m))),
  gridProvided:!!grid&&Object.keys(grid).length>0,safeForAutoPlacement:false};
}
module.exports={candidatePlacements};
