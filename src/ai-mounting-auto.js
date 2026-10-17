"use strict";
/* Automatic proposals from explicit, instance-local PDF annotations.
 * No label coordinate, nearby stroke, bare number, or register quantity is
 * interpreted as a physical placement. The transactional service rechecks all. */
const {classSheet,buildBatchPlan,axisGeometry,reviewIndexedPlanPage}=require("./ai-scheme-lite-page");
const {markOccurrences}=require("./ai-pdf-mark-matcher");
const {candidatePlacements}=require("./ai-placement-pipeline");
const normalize=s=>String(s??"").normalize("NFKC").toUpperCase().replace(/[−–—]/g,"-").replace(/\s+/g,"");
const escape=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
function typeOf(text){
 const types=[["column",/колонн|стойк|фахверк/iu],["beam",/балк|ригел|прогон|распорк/iu],["brace",/связ|раскос/iu]];
 const found=types.filter(([,r])=>r.test(text));return found.length===1?found[0][0]:null;
}
function level(text,kind){
 const label=kind===0?"(?:отм(?:етка|\\.)?\\s*низа|низ(?:\\s+(?:колонны|элемента|конструкции))?|Z0)":
  "(?:отм(?:етка|\\.)?\\s*верха|верх(?:\\s+(?:колонны|элемента|конструкции))?|Z1)";
 const rx=new RegExp("(?:^|[\\s;,:])"+label+"\\s*[:=]?\\s*([+\\-−]?\\s*\\d{1,6}(?:[.,]\\d{1,3})?)\\s*(мм|м)?(?=$|[\\s;,)])","giu");
 const values=new Set();
 for(const m of text.matchAll(rx)){
  const n=Number(m[1].replace(/\s/g,"").replace("−","-").replace(",","."));
  // Unitless integers are ambiguous (metres vs millimetres).
  if(!m[2]&&!/[.,]/.test(m[1]))return null;
  const mm=n*(m[2]?.toLowerCase()==="мм"?1:1000);
  if(!Number.isFinite(mm)||Math.abs(mm)>300000)return null;
  if(m[2]?.toLowerCase()==="мм"&&!Number.isInteger(mm))return null;
  values.add(Math.round(mm));
 }
 return values.size===1?[...values][0]:null;
}
function intersections(text,grid){
 const xs=grid.axes_x.map(escape).sort((a,b)=>b.length-a.length).join("|"),
  ys=grid.axes_y.map(escape).sort((a,b)=>b.length-a.length).join("|");
 const rx=new RegExp("(?:^|[\\s;,])(?:по\\s+осям|пересечени[еи]\\s+осей|оси|ось|начало|конец)\\s*[:=]?\\s*(?:((?:"+xs+"))\\s*[/–—-]\\s*((?:"+ys+"))|((?:"+ys+"))\\s*[/–—-]\\s*((?:"+xs+")))(?=$|[\\s;,)])","giu");
 return [...text.matchAll(rx)].map(m=>({
  x:grid.axes_x.find(x=>normalize(x)===normalize(m[1]||m[4])),
  y:grid.axes_y.find(y=>normalize(y)===normalize(m[2]||m[3])),
  end:/конец/iu.test(m[0]),quote:m[0].trim()}));
}
function localLines(page){
 // Only spatially adjacent fragments on a common baseline are joined.
 const lines=[];
 for(const [i,f] of (page.fragments||[]).entries()){
  const text=String(f?.text??f?.str??"").trim();if(!text)continue;
  if(![f.x,f.y,f.width,f.height].every(Number.isFinite)||/[\r\n]/.test(text)){
   lines.push({text,ids:[i],x:null,y:null,right:null,height:0});continue;
  }
  lines.push({text,ids:[i],x:f.x,y:f.y,right:f.x+f.width,height:f.height});
 }
 lines.sort((a,b)=>(b.y??-Infinity)-(a.y??-Infinity)||(a.x??0)-(b.x??0));
 const groups=[];
 for(const line of lines){
  const prior=groups.at(-1);
  if(prior&&line.x!==null&&prior.x!==null&&Math.abs(line.y-prior.y)<=1&&
   line.x-prior.right>=-1&&line.x-prior.right<=Math.min(18,Math.max(4,prior.height*1.5))&&
   prior.text.length+line.text.length<1200){
   prior.text+=" "+line.text;prior.ids.push(...line.ids);prior.right=line.right;
  }else groups.push({...line,ids:[...line.ids]});
 }
 return groups;
}
function automaticEntries(rows){
 const grid=rows.scheme.find(r=>r.record_type==="scheme_grid"||r.data?.entity_type==="grid")?.data;
 if(!grid?.axes_x?.length||!grid?.axes_y?.length)throw Error("Сначала сохраните сетку осей в монтажной схеме");
 const marks=rows.marks,allowed=marks.map(m=>m.data?.mark||m.title),
  register=new Map(marks.map(m=>[normalize(m.data?.mark||m.title),m])),
  docs=new Map(rows["ai-documents"].filter(d=>d.record_type==="document"&&!d.data?.archived).map(d=>[String(d.id),d]));
 const latest=new Map();
 for(const row of rows["ai-pdf-index"]){
  const src=row.data?.source,doc=docs.get(String(src?.documentId));
  if(row.record_type!=="pdf_text_index"||!doc||doc.data?.sha256!==src.sha256)continue;
  if(!latest.has(String(doc.id))||Number(row.id)>Number(latest.get(String(doc.id)).id))latest.set(String(doc.id),row);
 }
 const geometryByPage=new Map();
 for(const row of rows["ai-pdf-geometry"]||[]){
  const d=row.data;if(row.record_type!=="pdf_page_geometry"||d?.version!==2)continue;
  const key=[d.documentId,d.sourceSha256,d.result?.page].join(":");
  const old=geometryByPage.get(key);
  if(!old||Number(row.id)>Number(old.id))geometryByPage.set(key,row);
 }
 const graphicReview=[],projectGrid=axisGeometry(rows.scheme);
 const placementPages=[];
 const graphicByMark=new Map();
 const graphicSeen=new Set();
 const candidates=[],seenMarks=new Set(),reasons=new Map();let pages=0;
 for(const index of latest.values())for(const p of index.data?.pages||[]){
  pages++;
  const src=index.data.source,doc=docs.get(String(src.documentId)),
   sheetType=classSheet(src.name||doc.title,p.text||"");
  placementPages.push({...p,documentId:src.documentId,sourceSha256:src.sha256??index.data?.sourceSha256??null});
  for(const hit of markOccurrences(p,allowed))seenMarks.add(normalize(hit.mark));
  if(p.uncertainEncoding||p.truncated||!["plan","section"].includes(sheetType))continue;
  const vector=geometryByPage.get([src.documentId,src.sha256,p.page].join(":"))?.data?.result;
  if(sheetType==="plan"&&vector?.coordinateSystem==="viewport_points_top_left"&&Number(p.rotation||0)===0&&
    Number.isFinite(p.widthPt)&&Number.isFinite(p.heightPt)&&
    Math.abs(vector.widthPt-p.widthPt)<1&&Math.abs(vector.heightPt-p.heightPt)<1){
   const graphical=reviewIndexedPlanPage({raw:p,vector,grid:projectGrid,marks,
    documentId:src.documentId,sha256:src.sha256,page:p.page,sheetType,nodesOnly:true});
   for(const region of graphical.regions)for(const item of region.nodeLinks?.suggested||[]){
    const identity=JSON.stringify([src.documentId,src.sha256,p.page,item.markId,
      item.label?.fragmentIds,region.name]);
    if(graphicSeen.has(identity))continue;
    graphicSeen.add(identity);
    const suggestion={mark:item.mark,markId:item.markId,axisX:item.axisX,axisY:item.axisY,
     nodeXmm:item.nodeXmm,nodeYmm:item.nodeYmm,region:region.name,
     source:{documentId:src.documentId,sha256:src.sha256,page:p.page},
     fragmentIds:item.label.fragmentIds,rectPt:item.label.rectPt,
     leaderSegments:item.evidence.segments,status:"requires_review",safeForAutoPlacement:false};
    graphicReview.push(suggestion);
    const markKey=normalize(item.mark);
    if(!graphicByMark.has(markKey))graphicByMark.set(markKey,[]);
    graphicByMark.get(markKey).push(suggestion);
   }
  }
  for(const line of localLines(p)){
   // Most fragments are dimensions or labels. Avoid rebuilding the register
   // matcher for rows that cannot contain an explicit placement record.
   if(!/(?:ось|оси|осям|осей|начало)/iu.test(line.text))continue;
   if(/не\s+(?:устан|монтир|примен)|демонт|отмен|замен|исключ|вариант|пример|справоч/iu.test(line.text))continue;
   const hits=markOccurrences({fragments:[{text:line.text}]},allowed);
   if(hits.length!==1)continue;
   const printed=[...line.text.matchAll(/(?:^|[\s;,])([КKБВBРPСCФFМM]\s*-?\s*\d{1,4}(?:-\d{1,3})?[А-ЯA-Z]?)(?=$|[\s;,])/giu)];
   if(printed.length>1)continue;
   const mark=register.get(normalize(hits[0].mark));if(!mark)continue;
   const explicit=typeOf(line.text),registered=typeOf(mark.data?.name||"");
   const type=explicit||registered;
   let reason="";
   if(!type||explicit&&registered&&explicit!==registered)reason="Не определён однозначный тип конструкции";
   if(/смещ|отступ|привязк|расстояни|от\s+ос(?:и|ей)|Δ|\b(?:dx|dy)\b/iu.test(line.text))reason="Смещение от оси требует ручной проверки";
   const points=intersections(line.text,grid),starts=points.filter(p=>!p.end),ends=points.filter(p=>p.end),
    start=starts.length===1?starts[0]:null,end=ends.length===1?ends[0]:null,
    z0=level(line.text,0),z1=level(line.text,1);
   if(!start||type!=="column"&&!end||type==="column"&&ends.length)reason="Нет однозначной привязки к осям конкретного экземпляра";
   if(z0===null||z1===null)reason="Нет однозначных отметок Z0/Z1 в записи этой марки";
   if(reason){reasons.set(String(mark.id),reason);continue}
   candidates.push({mark:hits[0].mark,type,origin:"text_layer",sheetType,
    axisX:start.x,axisY:start.y,endAxisX:end?.x||"",endAxisY:end?.y||"",z0Mm:z0,z1Mm:z1,
    evidence:[line.text],evidenceLocations:[{fragmentIds:line.ids}],
    source:{documentId:src.documentId,sha256:src.sha256,page:p.page,name:src.name||doc.title}});
  }
 }
 // Conflicting marks/heights at one physical plan position cannot be
 // resolved by choosing whichever PDF happens to be processed first.
 const locations=new Map();
 for(const c of candidates){
  const ends=c.type==="column"?[[c.axisX,c.axisY]]:
   [[c.axisX,c.axisY],[c.endAxisX,c.endAxisY]].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const key=JSON.stringify([c.type,ends]);
  if(!locations.has(key))locations.set(key,[]);locations.get(key).push(c);
 }
 const conflicts=new Set(),duplicates=new Set();
 for(const group of locations.values()){
  const signatures=new Map();
  for(const c of group){
   const ends=c.type==="column"?[[c.axisX,c.axisY,c.z0Mm,c.z1Mm]]:
    [[c.axisX,c.axisY,c.z0Mm],[c.endAxisX,c.endAxisY,c.z1Mm]].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
   const key=JSON.stringify([normalize(c.mark),ends]);
   if(signatures.has(key))duplicates.add(c);else signatures.set(key,c);
  }
  if(signatures.size>1)for(const c of group)conflicts.add(c);
 }
 const batch=buildBatchPlan({candidates:candidates.filter(c=>!conflicts.has(c)&&!duplicates.has(c)),marks,schemeRows:rows.scheme,workRows:rows["work-types"]});
 for(const c of conflicts)batch.review.push({candidate:c,reason:"Противоречивые марки или высоты для одного положения"});
 const entries=batch.ready.map(({candidate:c,mark:m})=>({markId:m.id,mark:c.mark,
  projectCode:m.project_code||"",type:c.type,origin:c.origin,sheetType:c.sheetType,
  axisX:c.axisX,axisY:c.axisY,endAxisX:c.endAxisX,endAxisY:c.endAxisY,z0Mm:c.z0Mm,z1Mm:c.z1Mm,
  offsetXmm:0,offsetYmm:0,evidence:c.evidence,source:{...c.source,regions:c.evidenceLocations}}));
 const review=batch.review.map(x=>({mark:x.candidate.mark,reason:x.reason}));
 const represented=new Set(candidates.map(c=>normalize(c.mark)));
 for(const mark of marks){
  const name=mark.data?.mark||mark.title;
  if(!represented.has(normalize(name))){
   const suggestions=graphicByMark.get(normalize(name))||[];
   review.push({mark:name,reason:reasons.get(String(mark.id))||
    (suggestions.length?"Найдена графическая привязка, но требуются проверенные высоты и положение конструкции":
     seenMarks.has(normalize(name))?"Марка найдена, но её монтажные оси и высоты не определены":"Марка не найдена в актуальном текстовом индексе"),
    graphicCandidates:suggestions.length});
  }
 }
 const reviewGrid=projectGrid?{x:Object.fromEntries(projectGrid.x),y:Object.fromEntries(projectGrid.y)}:{};
 const pdfPlacementReview=candidatePlacements(placementPages,marks.map(m=>({mark:m.data?.mark||m.title,name:m.data?.name||""})),reviewGrid);
 pdfPlacementReview.requiresReview=pdfPlacementReview.candidates;
 pdfPlacementReview.readyForPlacement=[];
 return{entries:entries.slice(0,400),review,graphicReview,pdfPlacementReview,stats:{pages,documents:latest.size,
  candidates:candidates.length,graphicLinks:graphicReview.length,ready:entries.length,deferred:Math.max(0,entries.length-400)}};
}
module.exports={automaticEntries,localLines,level,intersections};

