"use strict";
/* Deterministic PDF text matching. Never infers unknown marks or placements. */
function normalize(value){
 return String(value??"").normalize("NFKC").toUpperCase()
  .replace(/[\u2010-\u2015\u2212]/g,"-")
  .replace(/\s+/g,"").replace(/Ё/g,"Е");
}
function markOccurrences(page,allowedMarks){
 const fragments=Array.isArray(page?.fragments)?page.fragments:[];
 const allowed=new Map();
 for(const value of allowedMarks||[]){
  const key=normalize(value);
  if(key&&key.length>=2&&!allowed.has(key))allowed.set(key,String(value));
 }
 const ordered=[...allowed.keys()].sort((a,b)=>b.length-a.length||a.localeCompare(b));
 const found=[];
 // Text fragments are treated independently unless PDF extraction provides a
 // trustworthy combined text line. Avoid fabricating joins across drawing space.
 for(let i=0;i<fragments.length;i++){
  const item=fragments[i],raw=typeof item==="string"?item:
   String(item?.str??item?.text??"");
  const text=normalize(raw);
  const compactSpans=raw.trim().split(/\s+/u).map(normalize);
  const spacedSingle=compactSpans.length===2 && allowed.has(compactSpans.join(""));
  if(!text)continue;
  // Match separate tokens independently, even when adjacent tokens are unknown.
  if(compactSpans.length>1 && !spacedSingle && true){
   for(const token of compactSpans){
    if(allowed.has(token))found.push({mark:allowed.get(token),page:Number(page.page)||null,
     fragmentIndex:i,offset:null,x:item?.x!=null&&Number.isFinite(Number(item.x))?Number(item.x):null,
     y:item?.y!=null&&Number.isFinite(Number(item.y))?Number(item.y):null,
     width:item?.width!=null&&Number.isFinite(Number(item.width))?Number(item.width):null,
     height:item?.height!=null&&Number.isFinite(Number(item.height))?Number(item.height):null,
     source:"pdf_text_fragment",confidence:"text_exact",safeForAutoPlacement:false});
   }
   continue;
  }
  for(const key of ordered){
   let pos=0;
   while((pos=text.indexOf(key,pos))!==-1){
    const before=pos?text[pos-1]:"",after=text[pos+key.length]||"";
    // Do not match K41 within K410, K41A or other identifiers.
    if(!/[A-ZА-Я0-9]/u.test(before)&&!/[A-ZА-Я0-9]/u.test(after)){
     found.push({mark:allowed.get(key),page:Number(page.page)||null,
      fragmentIndex:i,offset:pos,
      x:item?.x!=null&&Number.isFinite(Number(item.x))?Number(item.x):null,
      y:item?.y!=null&&Number.isFinite(Number(item.y))?Number(item.y):null,
      width:item?.width!=null&&Number.isFinite(Number(item.width))?Number(item.width):null,
      height:item?.height!=null&&Number.isFinite(Number(item.height))?Number(item.height):null,
      source:"pdf_text_fragment",
      confidence:"text_exact",safeForAutoPlacement:false});
    }
    pos+=key.length;
   }
  }
 }
 return found;
}
module.exports={normalize,markOccurrences};
