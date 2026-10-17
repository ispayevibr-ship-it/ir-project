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
  if(!text)continue;
  for(const key of ordered){
   let pos=0;
   while((pos=text.indexOf(key,pos))!==-1){
    const before=pos?text[pos-1]:"",after=text[pos+key.length]||"";
    // Do not match K41 within K410, K41A or other identifiers.
    if(!/[A-ZА-Я0-9]/u.test(before)&&!/[A-ZА-Я0-9]/u.test(after)){
     found.push({mark:allowed.get(key),page:Number(page.page)||null,
      fragmentIndex:i,offset:pos,source:"pdf_text_fragment",
      confidence:"text_exact",safeForAutoPlacement:false});
    }
    pos+=key.length;
   }
  }
 }
 return found;
}
module.exports={normalize,markOccurrences};
