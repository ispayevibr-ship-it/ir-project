"use strict";
/* IR Project: montage-scheme extraction from one PDF page in an isolated Node worker. */
const {parentPort,workerData}=require("node:worker_threads");
const {readPageGeometry,readPageTexts}=require("./ai-scheme-geometry");
const {extractScheme}=require("./ai-scheme-extract");
const {extractSheet,sheetStamp}=require("./ai-sheet-extract");
const {extractSections,extractElevations,schemeNotes}=require("./ai-section-extract");
const {importPdfjs,requireCanvas,pdfWasm}=require("./ai-packages");
const {joinSplitTexts}=require("./ai-scheme-geometry");
const {ocrPage,ocrImages,dropLettering,createOcrWorker,sheetTurn,turnGeometry}=require("./ai-ocr");
const {extractTank}=require("./ai-tank-extract");
const {extractTrusses}=require("./ai-truss-extract");
const {extractBaseDetails}=require("./ai-base-extract");
const {extractColumnDetails}=require("./ai-column-extract");
const {extractRailOffsets}=require("./ai-rail-extract");
const {expandTexts}=require("./ai-text-aliases");
// The level marks written on the sheet («+4,700», «0,000»): the levels of a structure drawn on its own sheets.
function levelMarksOf(geometry){
 const out=new Set();
 for(const t of geometry?.texts||[]){const m=/^([+−-]?)(\d{1,2})[,.](\d{3})$/u.exec(String(t.str||"").trim());if(m)out.add(Math.round(Number((m[1]==="−"||m[1]==="-"?"-":"")+m[2]+"."+m[3])*1000))}
 return[...out].sort((a,b)=>a-b)
}
// Sheet text that the AI step needs: titles, level marks and a bounded excerpt.
function pageContext(texts){
 const strings=texts.map(t=>t.str);
 const titles=[...new Set(strings.filter(s=>/^(Схема|Разрез|Сечение|Узел|Ведомость|Спецификация|Вид|Фасад|План|Общий вид)(?![а-яё])/iu.test(s)))].slice(0,40);
 const levels=[...new Set(strings.filter(s=>/^[+\-−±]?\d{1,2}[,.]\d{3}$/.test(s)))].slice(0,60);
 return{titles,levels,text:strings.join(" ").slice(0,2500)}
}
(async()=>{
 let loading,ocrWorker=null;
 try{
  const pdfjs=await importPdfjs(workerData.packages);
  loading=pdfjs.getDocument({data:new Uint8Array(workerData.bytes),isEvalSupported:false,wasmUrl:pdfWasm(workerData.packages),disableFontFace:true,
   useSystemFonts:false,stopAtErrors:false,verbosity:pdfjs.VerbosityLevel.ERRORS});
  const pdf=await loading.promise;
  // Sheets the engineer left out are not read at all.
  const excluded=new Set((workerData.exclude||[]).map(Number));
  const pages=Array.from({length:pdf.numPages},(_,i)=>i+1).filter(n=>!excluded.has(n));
  const results=[];
  for(const n of pages){
   const page=await pdf.getPage(n);
   if(workerData.mode==="sheets"){
    const texts=await readPageTexts(page);
    // Rotated КМ stamps often give no name; the first drawing title still tells the sheet apart.
    results.push({page:n,...sheetStamp(texts),title:pageContext(texts.texts.map(t=>t)).titles[0]||""});
    parentPort.postMessage({type:"progress",page:n,total:pages.length});
    page.cleanup();continue
   }
   const started=Date.now();
   let geometry=await readPageGeometry(pdfjs,page);
   // A drawing whose lettering was exported as curves, or a scanned sheet, has no text layer: the lettering
   // is recognised from the image.
   // A few stray text items (angle signs "∟", single digits, the stamp's side labels) do not make a sheet readable:
   // what counts is how much lettering there is for a drawing of that size.
   const letters=geometry.texts.reduce((n,t)=>n+(String(t.str).match(/[0-9A-Za-zА-Яа-яЁё]/gu)||[]).length,0);
   // Dimensions drawn as strokes beside a stamp in text: many tiny strokes (letters) and not one number in the text layer.
   const tiny=geometry.segments.reduce((n,s)=>n+(Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y)<2?1:0),0);
   const strokedDims=tiny>1500&&!geometry.texts.some(t=>/^\d{3,6}$/.test(String(t.str).trim()));
   const noText=strokedDims||(geometry.segments.length>3000?letters<Math.max(120,geometry.segments.length/150):geometry.texts.length<5&&geometry.segments.length<50);
   // Pictures pasted into a sheet (scanned tables) are read the same way, only their areas.
   let ocr=0;
   const pictures=noText?[]:(geometry.images||[]).filter(b=>(b.x1-b.x0)*(b.y1-b.y0)>=4000);
   if((noText||pictures.length)&&workerData.ocr!==false&&workerData.packages?.ocr){
    parentPort.postMessage({type:"progress",page:n,total:pages.length,ocr:true});
    try{
     ocrWorker=ocrWorker||await createOcrWorker(workerData.packages.ocr);
     const options={canvas:requireCanvas(workerData.packages),worker:ocrWorker,
      onArea:()=>parentPort.postMessage({type:"progress",page:n,total:pages.length,ocr:true})};
     if(noText){
      // A scan lying sideways or upside down is read in its reading position; its lines are turned with it.
      const turn=strokedDims?0:await sheetTurn(page,options);
      if(turn)geometry=turnGeometry(geometry,turn);
      const read=joinSplitTexts(await ocrPage(page,{...options,turn}));
      // Dimensions drawn as strokes on a sheet whose names are text: the text layer stays, OCR adds what it lacks.
      const box=t=>({x0:t.x,x1:t.x+(t.width||String(t.str).length*(t.size||8)*0.55),y0:t.y-(t.size||8),y1:t.y});
      const over=(a,b)=>a.x0<b.x1&&b.x0<a.x1&&a.y0<b.y1&&b.y0<a.y1;
      const texts=strokedDims&&geometry.texts.length?[...geometry.texts,...read.filter(o=>!geometry.texts.some(t=>over(box(t),box(o))))]:read;
      geometry={...geometry,texts,segments:dropLettering(geometry.segments,read)};ocr=read.length
     }else{
      const extra=await ocrImages(page,pictures,geometry.texts,options);
      geometry={...geometry,texts:[...geometry.texts,...extra]};ocr=extra.length
     }
    }catch{}
   }
   // Abbreviations the program has learned (Claude's lessons): written out before the sheet is read.
   if(workerData.aliases?.length)geometry={...geometry,texts:expandTexts(geometry.texts,workerData.aliases)};
   const result=extractScheme({...geometry,page:n});
   // Elevations along one grid line ("по оси 1", "по ряду А") place members with their own heights.
   result.schemes.push(...extractElevations(geometry,n));
   // Level notes written next to the elements ("низ на отм. +0,050") and levels read from sections.
   for(const s of result.schemes){const notes=schemeNotes(geometry.texts,s.bbox,s.title);if(notes.notes.length||notes.z0_mm!==null||notes.z1_mm!==null)s.levelNotes=notes}
   // Read by OCR or not at all, such a sheet also goes to Claude as an image.
   results.push({page:n,widthPt:geometry.widthPt,heightPt:geometry.heightPt,schemes:result.schemes,context:pageContext(geometry.texts),noText,ocr,...(geometry.turn?{turn:geometry.turn}:{}),
    sheet:extractSheet(geometry),sections:extractSections(geometry),tank:extractTank(geometry),trusses:extractTrusses(geometry),baseDetails:extractBaseDetails(geometry),columnDetails:extractColumnDetails(geometry),railOffsets:extractRailOffsets(geometry),levelMarks:levelMarksOf(geometry),ms:Date.now()-started});
   parentPort.postMessage({type:"progress",page:n,total:pages.length});
   page.cleanup()
  }
  await ocrWorker?.terminate();
  await loading.destroy();
  parentPort.postMessage({type:"result",pages:results,totalPages:pdf.numPages})
 }catch(error){
  try{await ocrWorker?.terminate()}catch{}
  try{await loading?.destroy()}catch{}
  parentPort.postMessage({type:"error",message:String(error?.message||error).slice(0,600)})
 }
})();
