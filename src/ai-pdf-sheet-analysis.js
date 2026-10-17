"use strict";
/* Combined, read-only PDF evidence: label -> nearby vector strokes -> calibrated XY.
 * No claim that a stroke is a physical structural element. */
const {buildCoordinateCandidates}=require("./ai-pdf-coordinate-candidates");
const {nearestSegments}=require("./ai-pdf-segment-evidence");
const {intersectionEvidence}=require("./ai-pdf-intersection-evidence");
const {classifySegments}=require("./ai-pdf-stroke-classifier");
function analyzeSheet({page,geometry,registerMarks,anchors,documentId,sourceSha256,maxDistancePt=12}={}){
 const base=buildCoordinateCandidates({page,registerMarks,anchors,documentId,sourceSha256});
 const geometryValid=geometry?.coordinateSystem==="viewport_points_top_left"&&
  Number(geometry.page)===Number(page?.page)&&
  Number(page?.rotation||0)===0&&Number(geometry.rotation||0)===0&&
  Number.isFinite(geometry.heightPt)&&Number.isFinite(page?.heightPt)&&
  Math.abs(geometry.heightPt-page.heightPt)<1;
 const segments=geometryValid?geometry.segments||[]:[];
 const candidates=base.candidates.map(candidate=>{
  // Match by extraction provenance: normalized or grouped labels need not
  // equal the complete source fragment, and equal coordinates are not identity.
  const textHit=page?.fragments?.[candidate.fragmentIndex];
  // PDF text positions are bottom-left; geometry is top-left.
  const x=candidate.pdfX,y=candidate.pdfY;
  const positionValid=textHit&&Number.isFinite(x)&&Number.isFinite(y);
  const adjacent=geometryValid&&positionValid?
   nearestSegments({x,y:Number(page.heightPt)-y},segments,{maxDistancePt}):[];
  return{...candidate,nearbySegments:adjacent,
   geometryEvidenceStatus:!geometryValid?"geometry_unavailable":
    !positionValid?"label_position_unavailable":
    adjacent.length?"nearby_unclassified_segments":"no_nearby_segments",
   verification:"required",safeForAutoPlacement:false};
 });
 const vectorIntersections=intersectionEvidence({page,geometry,candidates});
 const intersectionsByFragment=new Map(vectorIntersections.marks.map(item=>[item.fragmentIndex,item.nearbyIntersections]));
 const candidatesWithIntersections=candidates.map(item=>({...item,
  nearbyIntersections:intersectionsByFragment.get(item.fragmentIndex)||[],
  intersectionEvidenceStatus:(intersectionsByFragment.get(item.fragmentIndex)||[]).length?'nearby_unverified_intersections':'no_nearby_intersections'}));
 return{...base,geometryAligned:geometryValid,segmentCount:segments.length,candidates:candidatesWithIntersections,
  vectorIntersections,strokeCandidates:classifySegments(segments),
  verifiedInstances:0,safeForAutoPlacement:false};
}
module.exports={analyzeSheet};
