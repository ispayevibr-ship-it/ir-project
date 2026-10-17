"use strict";
const {reviewToThreeJs}=require("./ai-placement-pipeline");
/* Pure preview adapter: does not mutate persisted scheme or database. */
function prepareSchemePreview(placements,approvals=[],existingIds=[]){
 const eligible=(placements?.candidates||[]).filter(p=>p.sheetRole!=="detail_or_schedule");
 const blocked=(placements?.candidates||[]).filter(p=>p.sheetRole==="detail_or_schedule");
 const payload=reviewToThreeJs({candidates:eligible},approvals);
 const occupied=new Set(existingIds);
 const approvalById=new Map((approvals||[]).filter(a=>a?.approved===true).map(a=>[a.placementId,a]));
 const elements=[],skipped=[...payload.rejected,...blocked.filter(p=>(approvals||[]).some(a=>a?.placementId===p.placementId&&a.approved===true)).map(p=>({placementId:p.placementId,reason:"detail_sheet_not_for_placement"}))];
 for(const item of payload.items){
  if(occupied.has(item.placementId)){
   skipped.push({placementId:item.placementId,reason:"already_in_scheme"});continue;
  }
  const approval=approvalById.get(item.placementId);
  const endpoint=approval?.endPoint;
  const validEndpoint=endpoint&&[endpoint.xMm,endpoint.yMm,endpoint.zMm].every(v=>v!=null&&String(v).trim()!==""&&Number.isFinite(Number(v)));
  const end=validEndpoint?{x:Number(endpoint.xMm),y:Number(endpoint.yMm),z:Number(endpoint.zMm)}:{x:item.xMm,y:item.yMm,z:item.z1Mm};
  const start={x:item.xMm,y:item.yMm,z:item.z0Mm};
  if(Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z)<1){
   skipped.push({placementId:item.placementId,reason:"zero_length_element"});continue;
  }
  if(!["колонна","фахверк"].includes(item.type)&&!validEndpoint){
   skipped.push({placementId:item.placementId,reason:"requires_two_verified_endpoints"});continue;
  }
  occupied.add(item.placementId);
  elements.push({id:item.placementId,mark:item.mark,type:item.type,
   start,end,
   units:"mm",previewOnly:true});
 }
 return {elements,skipped,requiresExplicitSave:true,mutatesDatabase:false};
}
module.exports={prepareSchemePreview};
