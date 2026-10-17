"use strict";
/* Read-only matching audit against the uploaded mark register. A label is not a placed element. */
const {markOccurrences,normalize}=require("./ai-pdf-mark-matcher");
function auditMarkRegister(pages,register){
 const allowed=new Map();
 for(const item of register||[]){
  const label=typeof item==="string"?item:item?.mark??item?.code??item?.title;
  const key=normalize(label);
  if(key&&key.length>=2&&!allowed.has(key))allowed.set(key,String(label));
 }
 const totals=new Map(),byPage=[],seen=new Set();
 for(const page of pages||[]){
  const hits=markOccurrences(page,[...allowed.values()]);
  for(const hit of hits){
   const key=normalize(hit.mark);
   totals.set(key,(totals.get(key)||0)+1);seen.add(key);
  }
  byPage.push({page:Number(page?.page)||null,occurrences:hits.length,
   uniqueMarks:new Set(hits.map(h=>normalize(h.mark))).size});
 }
 const found=[...totals.entries()].map(([key,occurrences])=>({
  mark:allowed.get(key),occurrences,verifiedInstances:0,
  coordinateStatus:"unverified",safeForAutoPlacement:false
 })).sort((a,b)=>b.occurrences-a.occurrences||a.mark.localeCompare(b.mark));
 const missing=[...allowed].filter(([key])=>!seen.has(key)).map(([,mark])=>mark);
 return{registerMarks:allowed.size,matchedMarks:found.length,missingMarks:missing.length,
  occurrences:found.reduce((sum,x)=>sum+x.occurrences,0),found,missing,byPage,
  verifiedInstances:0,safeForAutoPlacement:false};
}
module.exports={auditMarkRegister};
