'use strict';
/* Axis-label calibration in PDF point space. A candidate is not an approved
 * structural position: axes must be checked against actual grid lines. */
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function axisMap(grid, dimension){
 const raw=dimension==='x'?(grid?.axes_x??grid?.x):(grid?.axes_y??grid?.y);
 if(raw&&typeof raw==='object'&&!Array.isArray(raw))
  return Object.fromEntries(Object.entries(raw).filter(([k,v])=>String(k).trim()!==''&&v!=null&&String(v).trim()!==''&&finite(Number(v))).map(([k,v])=>[String(k),Number(v)]));
 const names=Array.isArray(raw)?raw:[];
 const spans=dimension==='x'?(grid?.x_spans_mm??[]):(grid?.y_spans_mm??[]);
 if(names.length<2||names.some(v=>v==null||String(v).trim()==='')||
   new Set(names.map(v=>String(v).trim().toUpperCase())).size!==names.length||
   !Array.isArray(spans)||spans.length!==names.length-1||
   spans.some(v=>v==null||String(v).trim()===''||!Number.isFinite(Number(v))||Number(v)<=0))return {};
 const result={};let at=0;
 names.forEach((name,i)=>{result[String(name)]=at;if(i<names.length-1)at+=Number(spans[i])});
 return result;
}
function calibrateDimension(axes, positions, dimension){
 const labels=axes.filter(a=>a.dimension===dimension&&a.point&&
   finite(a.point.x)&&finite(a.point.y)&&Object.hasOwn(positions,a.value));
 const direction=dimension==='x'?'x':'y';
 // Repeated labels are ambiguous; do not select a convenient occurrence.
 const counts=new Map();
 for(const a of labels)counts.set(a.value,(counts.get(a.value)||0)+1);
 const unique=labels.filter(a=>counts.get(a.value)===1);
 const pairs=[];
 for(let i=0;i<unique.length;i++)for(let j=i+1;j<unique.length;j++){
  const a=unique[i],b=unique[j],deltaPt=b.point[direction]-a.point[direction];
  const deltaMm=positions[b.value]-positions[a.value];
  if(Math.abs(deltaPt)<1||Math.abs(deltaMm)<1)continue;
  pairs.push({a,b,scale:deltaMm/deltaPt});
 }
 if(!pairs.length)return {calibrated:false,reason:'insufficient_unique_axis_anchors'};
 const reference=pairs[0],scale=reference.scale;
 // Independent axis pairs must agree to within 2%. Otherwise reject.
 if(pairs.some(p=>Math.sign(p.scale)!==Math.sign(scale)||
  Math.abs(p.scale-scale)/Math.abs(scale)>0.02))
  return {calibrated:false,reason:'inconsistent_axis_scale'};
 const origin=positions[reference.a.value]-reference.a.point[direction]*scale;
 if(unique.some(a=>Math.abs(origin+a.point[direction]*scale-positions[a.value])>Math.max(50,Math.abs(scale)*3)))
  return {calibrated:false,reason:'inconsistent_axis_positions'};
 return {calibrated:true,scaleMmPerPt:scale,originMm:origin,
  anchorLabels:unique.map(a=>a.value),requiresVerification:true};
}
function projectAxisCandidates(candidates,grid={}){
 const axes=(candidates?.observations??[]).filter(o=>o.kind==='axis');
 const x=calibrateDimension(axes,axisMap(grid,'x'),'x');
 const y=calibrateDimension(axes,axisMap(grid,'y'),'y');
 return {x,y,placements:(candidates?.spatialAssociations??[]).map(item=>{
  const p=item.pdfPoint;
  return {mark:item.mark,page:item.page,fragmentIndex:item.fragmentIndex,
   xMm:p&&x.calibrated?Math.round(x.originMm+p.x*x.scaleMmPerPt):null,
   yMm:p&&y.calibrated?Math.round(y.originMm+p.y*y.scaleMmPerPt):null,
   z0Mm:null,z1Mm:null,status:'review',verified:false,
   reason:'PDF label position is not necessarily the construction anchor'};
 }),safeForAutoPlacement:false};
}
module.exports={axisMap,calibrateDimension,projectAxisCandidates};
