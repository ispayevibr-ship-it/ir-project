"use strict";
const {markOccurrences,normalize}=require("./ai-pdf-mark-matcher");
const {extractPageCandidates}=require("./ai-pdf-candidates");
const {axisMap}=require("./ai-pdf-axis-projection");
function classifyMark(entry){
 const name=String(typeof entry==="string"?entry:(entry?.name||entry?.title||entry?.type||entry?.mark||"")).toLowerCase();
 if(/фахверк/.test(name))return "фахверк";
 if(/колонн|стойк/.test(name))return "колонна";
 if(/ригел/.test(name))return "ригель";
 if(/балк/.test(name))return "балка";
 if(/прогон/.test(name))return "прогон";
 if(/распорк/.test(name))return "распорка";
 if(/связ/.test(name))return "связь";
 return "не определено";
}
function candidatePlacements(pages,register,grid={}){
 const axesX=axisMap(grid,"x"),axesY=axisMap(grid,"y");
 const nearest=(value,axes)=>{
  if(value==null||!Number.isFinite(value))return null;
  const entries=Object.entries(axes).sort((a,b)=>Math.abs(a[1]-value)-Math.abs(b[1]-value));
  if(!entries.length)return null;
  return {axis:entries[0][0],offsetMm:Math.round(value-entries[0][1])};
 };
 const allowed=Array.isArray(register)?register.map(x=>typeof x==="string"?x:x.mark).filter(Boolean):[];
 const typeByMark=new Map((register||[]).map(entry=>[normalize(typeof entry==="string"?entry:entry.mark),classifyMark(entry)]));
 const unique=new Map();
 const seen=new Set();

 for(const page of pages||[]){
  const hits=markOccurrences(page,allowed);
  const axisProjection=extractPageCandidates(page,allowed,grid).axisProjection;
  const projected=axisProjection.placements||[];
  const markHits=hits.filter(h=>h.x!=null&&h.y!=null&&Number.isFinite(Number(h.x))&&Number.isFinite(Number(h.y)));
  for(const hit of hits){
   const key=normalize(hit.mark);
   const identity=[page.documentId??page.sourceDocumentId??"",page.page,hit.fragmentIndex,key].join(":");
   if(seen.has(identity))continue;
   seen.add(identity);
   if(!unique.has(key))unique.set(key,[]);
   const nearby=(page.levelCandidates||[]).filter(v=>v.x!=null&&v.y!=null&&hit.x!=null&&hit.y!=null&&Number.isFinite(Number(v.x))&&Number.isFinite(Number(v.y)))
    .map(v=>({...v,distancePt:Math.hypot(v.x-hit.x,v.y-hit.y)}))
    .filter(v=>v.distancePt<=100).sort((a,b)=>a.distancePt-b.distancePt);
   const uniquelyNearest=nearby.filter(v=>markHits.every(other=>other===hit||Math.hypot(v.x-other.x,v.y-other.y)>v.distancePt));
   const mapped=projected.find(p=>p.fragmentIndex===hit.fragmentIndex&&normalize(p.mark)===key);
   unique.get(key).push({mark:hit.mark,type:typeByMark.get(key)||"не определено",page:page.page,point:{x:hit.x,y:hit.y},
    xMm:mapped?.xMm??null,yMm:mapped?.yMm??null,z0Mm:null,z1Mm:null,
    coordinateStatus:mapped?.xMm!=null&&mapped?.yMm!=null?"label_coordinate_only":"unresolved",
    nearestXAxis:nearest(mapped?.xMm,axesX),nearestYAxis:nearest(mapped?.yMm,axesY),
    levelCandidates:uniquelyNearest.slice(0,10),ambiguousLevelCandidates:nearby.filter(v=>!uniquelyNearest.includes(v)).slice(0,10),status:"requires_review",safeForAutoPlacement:false,
    placementId:identity});
  }
 }
 const positions=[...unique.values()].flat();
 return {registerCount:allowed.length,matchedMarks:unique.size,occurrences:positions.length,
  candidates:positions,readyForPlacement:[],requiresReview:positions,
  missingMarks:allowed.filter(m=>!unique.has(normalize(m))),
  gridProvided:!!grid&&Object.keys(grid).length>0,safeForAutoPlacement:false};
}
module.exports={candidatePlacements,classifyMark};
