"use strict";
/* Inspect real indexed PDF fragments for a specific register mark.
 * A sheet-wide level is never assigned to K62 merely because K62 is printed. */
const {markOccurrences,normalize}=require("./ai-pdf-mark-matcher");
const {localLines,level}=require("./ai-mounting-auto");
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
module.exports={inspectMarkElevations};
