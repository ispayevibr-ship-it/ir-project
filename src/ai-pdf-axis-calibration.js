"use strict";
/* Deterministic conversion from PDF drawing coordinates to project millimetres.
   Requires two verified, distinct reference points. Never guesses scale or axes. */
const finite=n=>typeof n==="number"&&Number.isFinite(n);
function calibrate(input){
 const points=input?.anchors;
 if(!Array.isArray(points)||points.length<2)throw Error("Нужны минимум две проверенные опорные точки");
 const [a,b]=points;
 for(const p of [a,b]){
  if(!p||!finite(p.pdfX)||!finite(p.pdfY)||!finite(p.mmX)||!finite(p.mmY))
   throw Error("Координаты опорных точек должны быть числами");
 }
 const dx=b.pdfX-a.pdfX,dy=b.pdfY-a.pdfY;
 const mx=b.mmX-a.mmX,my=b.mmY-a.mmY;
 const pdfDistance=Math.hypot(dx,dy),mmDistance=Math.hypot(mx,my);
 if(pdfDistance<1e-6||mmDistance<1e-6)throw Error("Опорные точки должны различаться");
 const scale=mmDistance/pdfDistance;
 const cos=(dx*mx+dy*my)/(pdfDistance*mmDistance);
 const sin=(dx*my-dy*mx)/(pdfDistance*mmDistance);
 const tolerance=Number(input.toleranceMm??1);
 if(!finite(tolerance)||tolerance<0)throw Error("Некорректный допуск");
 const transform=(pdfX,pdfY)=>{
  if(!finite(pdfX)||!finite(pdfY))return null;
  const x=pdfX-a.pdfX,y=pdfY-a.pdfY;
  return {xMm:a.mmX+scale*(cos*x-sin*y),yMm:a.mmY+scale*(sin*x+cos*y)};
 };
 for(const p of points){
  if(!p||![p.pdfX,p.pdfY,p.mmX,p.mmY].every(finite))throw Error("Некорректная опорная точка");
  const result=transform(p.pdfX,p.pdfY);
  if(Math.hypot(result.xMm-p.mmX,result.yMm-p.mmY)>tolerance)
   throw Error("Опорные точки противоречат единому масштабу/повороту");
 }
 return {scaleMmPerPdfUnit:scale,rotationRadians:Math.atan2(sin,cos),
  anchorsVerified:points.length,transform,
  verifiedByUser:true,safeForAutoPlacement:false};
}
module.exports={calibrate};
