"use strict";
const {markOccurrences,normalize}=require("./ai-pdf-mark-matcher");
function candidatePlacements(pages,register,grid={}){
 const allowed=Array.isArray(register)?register.map(x=>typeof x==="string"?x:x.mark).filter(Boolean):[];
 const unique=new Map();
 for(const page of pages||[]){
  const hits=markOccurrences(page,allowed);
  for(const hit of hits){
   const key=normalize(hit.mark);
   if(!unique.has(key))unique.set(key,[]);
   const nearby=(page.levelCandidates||[]).filter(v=>v.x!=null&&v.y!=null&&hit.x!=null&&hit.y!=null)
    .map(v=>({...v,distancePt:Math.hypot(v.x-hit.x,v.y-hit.y)}))
    .filter(v=>v.distancePt<=100).sort((a,b)=>a.distancePt-b.distancePt);
   unique.get(key).push({mark:hit.mark,page:page.page,point:{x:hit.x,y:hit.y},
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
