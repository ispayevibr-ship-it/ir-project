"use strict";
/*
 * Column base details («База колонн Бк 4»): the anchor bolts of each base as the sheet writes them — «Анкерный болт -
 * 12 шт.» with the designation on the next line «1.1. М 48 х 1600.09 Г 2 С -4» — and the hole in the base plate
 * («Отв. в опорной плите ∅58 мм»). A sheet shows a few bases side by side, each under its own title: a note belongs to
 * the title nearest across the sheet among the titles above it. Nothing is guessed: what the sheet does not say stays null.
 */
const {parseFastener}=require("./ai-fasteners");
const TITLE=/^База\s+колонн[ы]?\s+(Бк)\s*(\d{1,2})$/iu;
const COUNT=/^Анкерн\S*\s+болт\S*\s*[-–—]\s*(\d{1,3})\s*шт/iu;
const HOLE=/^Отв\s*\.?\s*в\s+опорной\s+плите\s*[∅ØФ]\s*(\d{2,3})\s*мм/iu;
const DESIGNATION=/^\d\s*\.\s*\d\s*\.?\s*М\s*\d{2,3}\s*[хx×]\s*\d{3,4}/u;
const flat=t=>Math.abs(Number(t.angle)||0)<2;

function extractBaseDetails(geometry){
 const texts=(geometry?.texts||[]).filter(flat);
 const titles=texts.filter(t=>TITLE.test(String(t.str).trim())).map(t=>{const m=TITLE.exec(String(t.str).trim());return{t,mark:"Бк"+m[2]}});
 if(!titles.length)return[];
 const owner=t=>{
  let best=null;
  for(const x of titles){
   // Titles above the note (or level with it); the one nearest across, then nearest above.
   if(x.t.y>t.y+x.t.size*2)continue;
   const d=Math.abs(x.t.x-t.x)+Math.max(0,t.y-x.t.y)*0.5;if(!best||d<best.d)best={d,x}
  }
  return best?.x||null
 };
 const out=new Map(titles.map(x=>[x.mark,{mark:x.mark,anchors:null,plate_hole_mm:null,votes:new Map(),holes:new Map()}]));
 const used=new Set();
 // Counts first: a designation under a count is not read again on its own.
 const ordered=[...texts].sort((a,b)=>Number(DESIGNATION.test(String(a.str).trim()))-Number(DESIGNATION.test(String(b.str).trim())));
 for(const t of ordered){
  const s=String(t.str).trim();let m;
  // «Анкерный болт - 12 шт.» with the designation on the line right under it, or the designation alone.
  const lone=DESIGNATION.test(s)&&!used.has(t);
  if((m=COUNT.exec(s))||lone){
   const o=owner(t);if(!o)continue;
   const next=lone?t:texts.filter(u=>u!==t&&u.y>t.y&&u.y-t.y<=t.size*2&&Math.abs(u.x-t.x)<=t.size*3).sort((a,b)=>a.y-b.y)[0];
   if(next)used.add(next);
   const f=next?parseFastener("Анкерный болт "+next.str):null,count=m?Number(m[1]):null;
   const key=[count,f?.d_mm||"",f?.length_mm||"",f?.steel||"",f?.type||"",f?.execution||""].join("|");
   const v=out.get(o.mark).votes;
   if(!v.has(key))v.set(key,{n:0,count,f,text:next?String(next.str).replace(/\s+/g," ").trim():""});
   v.get(key).n++
  }else if((m=HOLE.exec(s))){
   const o=owner(t);if(!o)continue;
   const h=out.get(o.mark).holes;h.set(Number(m[1]),(h.get(Number(m[1]))||0)+1)
  }
 }
 const list=[];
 for(const b of out.values()){
  const top=[...b.votes.values()].sort((x,y)=>(y.count!==null)-(x.count!==null)||y.n-x.n)[0],hole=[...b.holes].sort((x,y)=>y[1]-x[1])[0];
  if(!top&&!hole)continue;
  const f=top?.f;
  list.push({mark:b.mark,
   anchors:top?{count:top.count,designation:top.text,d_mm:f?.d_mm??null,length_mm:f?.length_mm??null,steel:f?.steel||null,type:f?.type??null,execution:f?.execution??null,
    standard:f?.standard||null}:null,
   plate_hole_mm:hole?hole[0]:null,
   ...(new Set([...b.votes.values()].map(v=>[v.f?.d_mm,v.f?.length_mm].join())).size>1?{note:"На листе разные анкеры для "+b.mark+" — взят чаще указанный, проверьте"}:{})})
 }
 return list
}
module.exports={extractBaseDetails};
