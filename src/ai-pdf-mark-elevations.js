"use strict";
/* Inspect real indexed PDF fragments for a specific register mark.
 * A sheet-wide level is never assigned to K62 merely because K62 is printed. */
const {markOccurrences,normalize}=require("./ai-pdf-mark-matcher");
const {localLines,level}=require("./ai-mounting-auto");
function selectMaxElevationPair({bottoms=[],tops=[]}={}){
 const valid=a=>a.filter(Number.isFinite);
 const b=valid(bottoms),t=valid(tops);
 if(!b.length||!t.length)return{z0Mm:null,z1Mm:null,heightMm:null,method:"max_bottom_max_top",requiresReview:true};
 const z0Mm=Math.max(...b),z1Mm=Math.max(...t);
 return{z0Mm,z1Mm,heightMm:z1Mm>=z0Mm?z1Mm-z0Mm:null,
  method:"max_bottom_max_top",requiresReview:true};
}

/* Coordinate-based diagnostics for a SINGLE-MARK fabrication sheet.
 * Coordinates are pdf.js bottom-origin points. Never run on a multi-mark
 * sheet: marks must be explicitly scoped by the caller.
 * Elevation is a signed decimal in metres, NOT an arbitrary dimension in mm.
 */
function inspectSingleMarkSheetLevels(page,{assumedBaseMm=null}={}){
 const height=Number(page?.heightPt),fragments=page?.fragments||[];
 if(!(height>0))return{status:"missing_page_geometry",safeForAutoPlacement:false};
 const levels=[];
 for(let i=0;i<fragments.length;i++){
  const f=fragments[i],raw=String(f?.text||"").trim().replace("−","-");
  if(!/^(?:[+-][0-9]{1,2}|0)[,.][0-9]{3}$/.test(raw))continue;
  const y=Number(f.y);
  if(!Number.isFinite(y))continue;
  const mm=Math.round(Number(raw.replace(",","."))*1000);
  const band=y>=height*.65?"upper":y<=height*.35?"lower":"middle";
  levels.push({mm,raw,fragmentId:i,yPt:y,band});
 }
 const bottoms=levels.filter(x=>x.band==="lower"),tops=levels.filter(x=>x.band==="upper");
 const candidates=[...levels].sort((a,b)=>a.mm-b.mm);
 // The project datum is Z=0. A nearby +0.050 annotation is not proof
 // that the structural column begins at +0.050.
 // PDF page height is not structural height: a title block or detail view
 // may sit above the column drawing. Expose candidates but do not promote
 // page position to a verified top-of-column elevation.
 const topValues=levels.filter(x=>x.mm>0).map(x=>x.mm);
 const z1Mm=topValues.length?Math.max(...topValues):null;
 const z0Mm=Number.isFinite(assumedBaseMm)?assumedBaseMm:null;
 const chosen={z0Mm,z1Mm,heightMm:z1Mm===null||z0Mm===null||z1Mm<z0Mm?null:z1Mm-z0Mm,
  method:"explicit_assumed_base_max_positive_candidate",requiresReview:true};
 return {...chosen,levels,candidates,bottomEvidence:[],datumBasis:z0Mm===null?"not_established":"user_assumed_base",
  topEvidence:levels.filter(x=>x.mm===chosen.z1Mm),
  status:chosen.heightMm===null?"needs_manual_review":"candidate_only_requires_drawing_verification",
  safeForAutoPlacement:false};
}
function inspectMarkElevations({pages=[],mark="К62",allowedMarks=[mark]}={}){
 const wanted=normalize(mark),result=[];
 if(!allowedMarks.some(x=>normalize(x)===wanted))throw Error("Марка отсутствует в ведомости");
 for(const page of pages){
  const hits=markOccurrences(page,allowedMarks).filter(x=>normalize(x.mark)===wanted);
  const lines=localLines(page);
  const evidence=[];
  for(const line of lines){
   if(!markOccurrences({page:page.page,fragments:[{text:line.text}]},[mark]).length)continue;
   const bottom=level(line.text,0),top=level(line.text,1);
   evidence.push({text:line.text,fragmentIds:line.ids,z0Mm:bottom,z1Mm:top,
    heightMm:bottom!==null&&top!==null&&top>=bottom?top-bottom:null,
    verified:false});
  }
  result.push({page:page.page,mark,occurrences:hits.length,
   evidence,hasExplicitPair:evidence.some(x=>x.heightMm!==null),
   status:evidence.some(x=>x.heightMm!==null)?"requires_drawing_verification":"elevations_not_resolved",
   safeForAutoPlacement:false});
 }
 return {mark,pages:result,safeForAutoPlacement:false};
}
module.exports={inspectMarkElevations,selectMaxElevationPair,inspectSingleMarkSheetLevels};
