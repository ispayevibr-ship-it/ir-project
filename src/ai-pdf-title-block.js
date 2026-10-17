"use strict";
// Conservative title-block detection from positioned PDF text fragments.
// No inferred bounds unless a cluster of title-block field labels is present.
const LABEL=/^(?:лист|листов|стадия|разраб\.?|пров\.?|н\.?\s*контр\.?|гип|изм\.?|подп\.?|дата|формат)$/iu;
function detectTitleBlock(page){
 const width=Number(page?.width??page?.pageWidth);
 const height=Number(page?.height??page?.pageHeight);
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null;
 const fragments=Array.isArray(page?.fragments)?page.fragments:[];
 const labels=fragments.filter(f=>{
  const s=String(f?.text??f?.str??"").trim();
  const x=Number(f?.x),y=Number(f?.y);
  return LABEL.test(s)&&Number.isFinite(x)&&Number.isFinite(y)&&x>=width*.58&&y>=height*.70&&x<=width&&y<=height;
 });
 if(labels.length<4)return null;
 const unique=new Set(labels.map(f=>String(f.text??f.str).trim().toLowerCase().replace(/\./g,"")));
 if(unique.size<3)return null;
 const x0=Math.max(0,Math.min(...labels.map(f=>Number(f.x)))-width*.07);
 const y0=Math.max(0,Math.min(...labels.map(f=>Number(f.y)))-height*.06);
 return {x0,y0,x1:width,y1:height,source:"text_label_cluster",verified:false};
}
module.exports={detectTitleBlock};
