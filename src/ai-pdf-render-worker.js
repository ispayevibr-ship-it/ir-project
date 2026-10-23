"use strict";
/* Render one genuine PDF sheet to PNG with PDF.js and a native Node canvas.
   Runs in a short-lived worker: no external URLs, no OCR, no generated geometry. */
const {parentPort,workerData}=require("node:worker_threads");
const {importPdfjs,requireCanvas,pdfWasm}=require("./ai-packages");
const MAX_PAGES=80,MAX_PIXELS=3_500_000,MAX_SIDE=2400,MAX_IMAGE_BYTES=16*1024*1024;
(async()=>{
 let loading,doc,page;
 try{
  const {createCanvas}=requireCanvas(workerData.packages);
  const pdfjs=await importPdfjs(workerData.packages);
  if(!workerData?.bytes||workerData.bytes.byteLength>48*1024*1024)throw Error("Недопустимый размер PDF");
  loading=pdfjs.getDocument({data:new Uint8Array(workerData.bytes),isEvalSupported:false,wasmUrl:pdfWasm(workerData.packages),
   disableFontFace:true,useSystemFonts:false,stopAtErrors:false,verbosity:pdfjs.VerbosityLevel.ERRORS});
  doc=await loading.promise;
  const total=doc.numPages,n=Number(workerData.page);
  if(!Number.isSafeInteger(total)||total<1||total>MAX_PAGES)throw Error("Поддерживается не более 80 листов в PDF");
  if(!Number.isSafeInteger(n)||n<1||n>total)throw Error("Лист PDF не найден");
  page=await doc.getPage(n);
  const natural=page.getViewport({scale:1});
  if(!Number.isFinite(natural.width)||!Number.isFinite(natural.height)||natural.width<=0||natural.height<=0)
   throw Error("Недопустимые размеры листа PDF");
  const rect=workerData.region??null;
  if(rect!==null&&(!rect||typeof rect!=="object"||!["x","y","width","height"].every(k=>typeof rect[k]==="number"&&Number.isFinite(rect[k]))||
   rect.x<0||rect.y<0||rect.width<0.01||rect.height<0.01||
   rect.x+rect.width>1.000001||rect.y+rect.height>1.000001))
   throw Error("Фрагмент выходит за пределы листа PDF");
  const preferred=Math.max(600,Math.min(2000,Number(workerData.maxSide)||1800));
  const viewportWidth=rect?rect.width*natural.width:natural.width;
  const viewportHeight=rect?rect.height*natural.height:natural.height;
  const scale=Math.min(rect?8:2.0,
   preferred/Math.max(viewportWidth,viewportHeight),
   MAX_SIDE/viewportWidth,MAX_SIDE/viewportHeight,
   Math.sqrt(MAX_PIXELS/(viewportWidth*viewportHeight)));
  const viewport=page.getViewport({scale});
  const left=rect?Math.floor(rect.x*viewport.width):0;
  const top=rect?Math.floor(rect.y*viewport.height):0;
  const width=rect?Math.max(1,Math.ceil((rect.x+rect.width)*viewport.width)-left):
   Math.max(1,Math.round(viewport.width));
  const height=rect?Math.max(1,Math.ceil((rect.y+rect.height)*viewport.height)-top):
   Math.max(1,Math.round(viewport.height));
  if(width*height>MAX_PIXELS+MAX_SIDE)throw Error("PDF превышает допустимую область визуализации");
  const canvas=createCanvas(width,height),context=canvas.getContext("2d");
  context.fillStyle="#ffffff";context.fillRect(0,0,width,height);
  await page.render({canvasContext:context,viewport,
   ...(rect?{transform:[1,0,0,1,-left,-top]}:{}),canvasFactory:{
   create:(w,h)=>{const c=createCanvas(Math.ceil(w),Math.ceil(h));return{canvas:c,context:c.getContext("2d")}},
   reset:(entry,w,h)=>{entry.canvas.width=Math.ceil(w);entry.canvas.height=Math.ceil(h)},
   destroy:entry=>{entry.canvas.width=0;entry.canvas.height=0}
  }}).promise;
  const image=Buffer.from(await canvas.encode("png"));
  if(image.length<16||image.length>MAX_IMAGE_BYTES)throw Error("PNG изображения листа превышает ограничение 16 МиБ");
  parentPort.postMessage({type:"result",page:n,total,width,height,
   widthPt:Math.round(natural.width*100)/100,heightPt:Math.round(natural.height*100)/100,
   scale:Math.round(scale*10000)/10000,mime:"image/png",bytes:image,
   region:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null,
   sourceRectPt:rect?{
    x:Math.round(rect.x*natural.width*100)/100,
    y:Math.round(rect.y*natural.height*100)/100,
    width:Math.round(rect.width*natural.width*100)/100,
    height:Math.round(rect.height*natural.height*100)/100
   }:null});
  page.cleanup();await loading.destroy();
 }catch(error){
  try{page?.cleanup()}catch{}
  try{await loading?.destroy()}catch{}
  parentPort.postMessage({type:"error",message:String(error?.message||error).slice(0,800)});
 }
})().catch(error=>parentPort.postMessage({type:"error",message:String(error?.message||error).slice(0,800)}));
