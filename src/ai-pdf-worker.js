"use strict";
/* IR Project AI: bounded PDF text extraction in an isolated Node worker. */
const {parentPort,workerData}=require("node:worker_threads");
const MAX_PAGES=80,MAX_TEXT_PER_PAGE=24000,MAX_FRAGMENTS=1000;
(async()=>{
 let loading;
 try{
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const input=new Uint8Array(workerData.bytes);
  loading=pdfjs.getDocument({data:input,isEvalSupported:false,disableFontFace:true,
   useSystemFonts:false,stopAtErrors:false,verbosity:pdfjs.VerbosityLevel.ERRORS});
  const pdf=await loading.promise;
  const total=pdf.numPages;
  if(!Number.isSafeInteger(total)||total<1||total>MAX_PAGES)
   throw Error("Комплект PDF содержит "+total+" страниц. На этом этапе поддерживается не более "+MAX_PAGES+" страниц на один файл.");
  const pages=[];
  for(let n=1;n<=total;n++){
   const page=await pdf.getPage(n);
   const viewport=page.getViewport({scale:1});
   const content=await page.getTextContent({disableNormalization:false});
   const fragments=[];let textSize=0;
   for(const item of content.items){
    if(typeof item.str!=="string"||!item.str.trim())continue;
    const str=item.str.slice(0,500);
    const remaining=MAX_TEXT_PER_PAGE-textSize;
    if(remaining<=0||fragments.length>=MAX_FRAGMENTS)break;
    const clipped=str.slice(0,remaining);
    const t=item.transform||[];
    const finite=(n)=>Number.isFinite(Number(n))?Math.round(Number(n)*100)/100:0;
    fragments.push({text:clipped,x:finite(t[4]),y:finite(t[5]),
     width:finite(item.width),height:finite(item.height)});
    textSize+=clipped.length
   }
   const plain=fragments.map(f=>f.text).join(" ");
   const uncertain=(plain.match(/[\uFFFD\u25A1\u0000]/g)||[]).length;
   pages.push({page:n,widthPt:Math.round(viewport.width*100)/100,
    heightPt:Math.round(viewport.height*100)/100,rotation:viewport.rotation,
    text:plain.slice(0,MAX_TEXT_PER_PAGE),fragments,
    hasTextLayer:plain.trim().length>=12,
    uncertainEncoding:plain.length>0&&uncertain/Math.max(1,plain.length)>0.05,
    truncated:fragments.length>=MAX_FRAGMENTS||textSize>=MAX_TEXT_PER_PAGE});
   parentPort.postMessage({type:"progress",page:n,total})
   page.cleanup();
  }
  await loading.destroy();
  parentPort.postMessage({type:"result",pages,total,parser:"pdfjs-dist",mode:"text-layer-only"});
 }catch(error){
  try{await loading?.destroy()}catch{}
  parentPort.postMessage({type:"error",message:String(error?.message||error).slice(0,600)})
 }
})().catch(error=>parentPort.postMessage({type:"error",message:String(error?.message||error).slice(0,600)}));
