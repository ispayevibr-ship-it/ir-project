"use strict";
const {reviewToThreeJs}=require("./ai-placement-pipeline");
/* Pure preview adapter: does not mutate persisted scheme or database. */
function prepareSchemePreview(placements,approvals=[],existingIds=[]){
 const payload=reviewToThreeJs(placements,approvals);
 const occupied=new Set(existingIds);
 const elements=[],skipped=[...payload.rejected];
 for(const item of payload.items){
  if(occupied.has(item.placementId)){
   skipped.push({placementId:item.placementId,reason:"already_in_scheme"});continue;
  }
  if(!["колонна","фахверк"].includes(item.type)){
   skipped.push({placementId:item.placementId,reason:"requires_two_verified_endpoints"});continue;
  }
  occupied.add(item.placementId);
  elements.push({id:item.placementId,mark:item.mark,type:item.type,
   start:{x:item.xMm,y:item.yMm,z:item.z0Mm},
   end:{x:item.xMm,y:item.yMm,z:item.z1Mm},
   units:"mm",previewOnly:true});
 }
 return {elements,skipped,requiresExplicitSave:true,mutatesDatabase:false};
}
module.exports={prepareSchemePreview};
