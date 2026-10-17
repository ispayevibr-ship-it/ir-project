"use strict";
/* Combined, read-only PDF evidence: label -> nearby vector strokes -> calibrated XY.
 * No claim that a stroke is a physical structural element. */
const {buildCoordinateCandidates}=require("./ai-pdf-coordinate-candidates");
const {nearestSegments}=require("./ai-pdf-segment-evidence");
const {intersectionEvidence}=require("./ai-pdf-intersection-evidence");
const {classifySegments}=require("./ai-pdf-stroke-classifier");
const {elevationEvidence}=require("./ai-pdf-elevation-evidence");
const {extractPageCandidates}=require("./ai-pdf-candidates");
function classifyMarkType(name){
 const s=String(name??"").normalize("NFKC").toLowerCase().trim();
 const types=[
  ["column",/^(?:колонн|стойк)/u],

  ["rigel",/^ригел/u],
  ["brace",/^(?:связ|раскос)/u],
  ["fachwerk",/^фахверк/u],
  ["purlin",/^прогон/u],
  ["beam",/^балк/u],
  ["strut",/^распорк/u]
 ];
 const cleaned=s.replace(/^[а-яa-z]{1,3}\s*[-–—]?\s*\d+[а-яa-z0-9-]*\s*[:—–-]?\s+/iu,"");
 const matches=types.filter(([,pattern])=>pattern.test(s)||pattern.test(cleaned));
 return matches.length===1?{type:matches[0][0],status:"name_classified_unverified"}:
  {type:null,status:s?"unknown_type":"missing_name"};
}
function analyzeSheet({page,geometry,registerMarks,anchors,documentId,sourceSha256,maxDistancePt=12}={}){
 const markNames=Array.isArray(registerMarks)?registerMarks.map(entry=>entry&&typeof entry==='object'?entry.mark??entry.mark_name??entry.code??entry.marking:entry).filter(Boolean):[];
 const base=buildCoordinateCandidates({page,registerMarks:markNames,anchors,documentId,sourceSha256});
 const registerEntries=Array.isArray(registerMarks)?registerMarks:[];
 const registerByMark=new Map();
 for(const entry of registerEntries){
  if(!entry||typeof entry!=="object")continue;
  const key=String(entry.mark??entry.mark_name??entry.code??entry.marking??"").normalize("NFKC").toUpperCase().replace(/\s+/g,"");
  if(!key)continue;
  const name=entry.name??entry.title??entry.description??entry.naimenovanie??entry.work_name??entry.mark_description??"";
  const normalizedName=String(name??"").normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
  if(!registerByMark.has(key))registerByMark.set(key,normalizedName);
  else if(registerByMark.get(key)!==normalizedName)registerByMark.set(key,null);
 }
 const geometryValid=geometry?.coordinateSystem==="viewport_points_top_left"&&
  Number(geometry.page)===Number(page?.page)&&
  Number(page?.rotation||0)===0&&Number(geometry.rotation||0)===0&&
  Number.isFinite(geometry.heightPt)&&Number.isFinite(page?.heightPt)&&
  Math.abs(geometry.heightPt-page.heightPt)<1;
 const segments=geometryValid&&Array.isArray(geometry.segments)?geometry.segments:[];
 const candidates=base.candidates.map(candidate=>{
  // Match by extraction provenance: normalized or grouped labels need not
  // equal the complete source fragment, and equal coordinates are not identity.
  const textHit=page?.fragments?.[candidate.fragmentIndex];
  // PDF text positions are bottom-left; geometry is top-left.
  const x=candidate.pdfX,y=candidate.pdfY;
  const positionValid=textHit&&x!=null&&y!=null&&String(x).trim()!==''&&String(y).trim()!==''&&Number.isFinite(x)&&Number.isFinite(y);
  const adjacent=geometryValid&&positionValid?
   nearestSegments({x,y:Number(page.heightPt)-y},segments,{maxDistancePt}):[];
  return{...candidate,structuralType:classifyMarkType(registerByMark.get(String(candidate.mark).normalize('NFKC').toUpperCase().replace(/\s+/g,''))||''),nearbySegments:adjacent,
   geometryEvidenceStatus:!geometryValid?"geometry_unavailable":
    !positionValid?"label_position_unavailable":
    adjacent.length?"nearby_unclassified_segments":"no_nearby_segments",
   verification:"required",safeForAutoPlacement:false};
 });
 const vectorIntersections=intersectionEvidence({page,geometry,candidates,maxDistancePt});

 const strokeCandidates=classifySegments(segments);
 const strokeByIndex=new Map(strokeCandidates.map(item=>[item.index,item]));
 const candidatesWithIntersections=candidates.map((item,index)=>{
  const nearby=vectorIntersections.marks[index]?.nearbyIntersections||[];
  const ranked=nearby.map(point=>({
   ...point,
   strokeClasses:point.segmentIds.map(id=>strokeByIndex.get(id)?.classification||'unclassified'),
   classificationVerified:false
  }));
  const ambiguous=ranked.length>1&&ranked[1].distancePt-ranked[0].distancePt<=3;
  const anchorIsCandidate=ranked.length>0&&ranked[0].distancePt<=maxDistancePt;
  return {...item,
  nearbyIntersections:ranked,
  proposedAnchorPt:anchorIsCandidate&&!ambiguous?{x:ranked[0].x,y:ranked[0].y}:null,
  proposedAnchorStatus:!ranked.length?'no_intersection':ambiguous?'ambiguous_intersections':anchorIsCandidate?'unverified_intersection':'intersection_outside_search_radius',
  nearbyStrokeEvidence:item.nearbySegments.map(segment=>({
   segmentIndex:segment.segmentIndex,distancePt:segment.distancePt,
   classification:strokeByIndex.get(segment.segmentIndex)?.classification||'unclassified',
   couldBeAxis:strokeByIndex.get(segment.segmentIndex)?.couldBeAxis===true,
   couldBeDimension:strokeByIndex.get(segment.segmentIndex)?.couldBeDimension===true,
   couldBeStructure:strokeByIndex.get(segment.segmentIndex)?.couldBeStructure===true,
   verified:false})),
  intersectionEvidenceStatus:nearby.length?'nearby_unverified_intersections':'no_nearby_intersections'};
 });
 const elevationObservations=extractPageCandidates(page,markNames).observations.filter(item=>item.kind==="elevation");
 const elevations=elevationEvidence({spatialAssociations:candidatesWithIntersections.map(item=>({
  mark:item.mark,page:item.page,fragmentIndex:item.fragmentIndex,
  pdfPoint:Number.isFinite(item.pdfX)&&Number.isFinite(item.pdfY)&&Number.isFinite(page?.heightPt)?
   {x:item.pdfX,y:page.heightPt-item.pdfY}:null
 })),observations:elevationObservations.map(item=>({...item,point:item.point?{x:item.point.x,y:page.heightPt-item.point.y}:null}))});
 const candidatesWithElevations=candidatesWithIntersections.map((item,index)=>({
  ...item,elevationEvidence:elevations[index]?.evidence||[],
  levelReview:elevations[index]?.levelReview||null,
  elevationStatus:"review_required",z0Mm:null,z1Mm:null
 }));
 const anchorSummary={total:candidatesWithIntersections.length,proposed:0,ambiguous:0,missing:0,unavailable:0,unverified:0};
 for(const item of candidatesWithElevations){
  if(item.proposedAnchorPt)anchorSummary.proposed++;
  if(item.proposedAnchorStatus==='ambiguous_intersections')anchorSummary.ambiguous++;
  if(item.geometryEvidenceStatus==='geometry_unavailable'||item.geometryEvidenceStatus==='label_position_unavailable')anchorSummary.unavailable++;
  else if(item.proposedAnchorStatus==='no_intersection')anchorSummary.missing++;
  if(item.verification==='required')anchorSummary.unverified++;
 }
 return{...base,geometryAligned:geometryValid,segmentCount:segments.length,candidates:candidatesWithElevations,anchorSummary,
  vectorIntersections,strokeCandidates,elevations,
  verifiedInstances:0,safeForAutoPlacement:false};
}
function reconcileMarkCounts(sheets,registerMarks){
 const found=new Map();
 for(const sheet of Array.isArray(sheets)?sheets:[])
  for(const item of Array.isArray(sheet?.candidates)?sheet.candidates:[]){
   const key=String(item.mark??"").normalize("NFKC").toUpperCase().replace(/\s+/g,"");
   if(key)found.set(key,(found.get(key)||0)+1);
  }
 const result=[];
 const seen=new Set();
 for(const entry of Array.isArray(registerMarks)?registerMarks:[]){
  const raw=entry&&typeof entry==="object"?entry.mark??entry.mark_name??entry.code??entry.marking:entry;
  const mark=String(raw??"").trim();
  if(!mark)continue;
  const key=mark.normalize("NFKC").toUpperCase().replace(/\s+/g,"");
  if(seen.has(key)){result.push({mark,expected:null,detected:result.find(row=>row.mark.normalize("NFKC").toUpperCase().replace(/\s+/g,"")===key)?.detected||0,missing:null,excess:null,status:"duplicate_register_mark"});continue;}
  seen.add(key);
  const count=entry&&typeof entry==="object"?entry.quantity??entry.qty??entry.count??entry.kolichestvo:null;
  const expected=count==null||count===""?null:Number(String(count).trim().replace(",", "."));
  const detected=found.get(key)||0;
  const valid=expected!=null&&Number.isSafeInteger(expected)&&expected>=0;
  result.push({mark,expected:valid?expected:null,detected,
   missing:valid?Math.max(0,expected-detected):null,
   excess:valid?Math.max(0,detected-expected):null,
   status:!valid?"quantity_unknown":detected===expected?"matched":detected<expected?"missing":"excess"});
  found.delete(key);
 }
 const summary={matched:0,missing:0,excess:0,quantityUnknown:0,duplicateRegisterMarks:0,expectedInstances:0,detectedInstances:0,missingInstances:0,excessInstances:0,unregisteredInstances:0};
 for(const row of result){
  if(row.status==="matched")summary.matched++;
  if(row.status==="missing")summary.missing++;
  if(row.status==="excess")summary.excess++;
  if(row.status==="quantity_unknown")summary.quantityUnknown++;
  if(row.status==="duplicate_register_mark")summary.duplicateRegisterMarks++;
  if(row.status!=="duplicate_register_mark"){
   summary.detectedInstances+=row.detected;
   if(row.expected!==null)summary.expectedInstances+=row.expected;
   summary.missingInstances+=row.missing||0;
   summary.excessInstances+=row.excess||0;
  }
 }
 summary.unregisteredInstances=[...found.values()].reduce((sum,count)=>sum+count,0);
 return {marks:result,summary,unregistered:[...found].map(([mark,detected])=>({mark,detected})),
  safeForAutoPlacement:false};
}
function summarizeSheets(sheets){
 const totals={sheets:0,total:0,proposed:0,ambiguous:0,missing:0,unavailable:0,unverified:0,classified:0,unclassified:0,uniqueMarks:0};
 const uniqueMarks=new Set();
 for(const sheet of Array.isArray(sheets)?sheets:[]){
  const summary=sheet?.anchorSummary;
  if(!summary)continue;
  totals.sheets++;
  totals.total+=summary.total||0;
  totals.proposed+=summary.proposed||0;
  totals.ambiguous+=summary.ambiguous||0;
  totals.missing+=summary.missing||0;
  totals.unavailable+=summary.unavailable||0;
  totals.unverified+=summary.unverified||0;
  const entries=Array.isArray(sheet?.candidates)?sheet.candidates:[];
  for(const item of entries)if(item.mark!=null)uniqueMarks.add(String(item.mark).normalize("NFKC").toUpperCase());
  totals.classified+=entries.filter(item=>item.structuralType?.type).length;
  totals.unclassified+=entries.filter(item=>!item.structuralType?.type).length;
 }
 totals.uniqueMarks=uniqueMarks.size;
 return totals;
}
module.exports={analyzeSheet,summarizeSheets,classifyMarkType,reconcileMarkCounts};
