"use strict";
/* Offline-only Tesseract adapter for PNGs rendered by the existing PDF renderer.
   OCR text is evidence, NEVER automatic geometry or a mark instance. */
const fs=require("node:fs"),path=require("node:path");
const {ocrDecision,validateOcrResult}=require("./ai-pdf-ocr-policy");
const MAX_IMAGE=16*1024*1024,MAX_PIXELS=3_500_000;
function localLanguages(dir,langs=["rus","eng"]){
 if(typeof dir!=="string"||!path.isAbsolute(dir)||!Array.isArray(langs)||!langs.length||
  langs.some(l=>!["rus","eng"].includes(l)))return false;
 return langs.every(lang=>{
  try{const p=path.join(dir,lang+".traineddata.gz");
   return fs.statSync(p).isFile()&&fs.statSync(p).size>1024}
  catch{return false}
 })
}
async function recognizePng({png,width,height,languageDir,languages=["rus","eng"],
 createWorker}={}){
 if(!Buffer.isBuffer(png)||png.length<16||png.length>MAX_IMAGE||
  !png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
  throw Error("OCR принимает только локальное PNG изображение листа");
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
  width<1||height<1||width*height>MAX_PIXELS)
  throw Error("Превышен размер изображения OCR");
 if(!localLanguages(languageDir,languages))
  throw Error("Локальные языковые пакеты Tesseract не найдены: rus/eng");
 const factory=createWorker||require("tesseract.js").createWorker;
 // Explicit langPath, cache disabled, workerPath/corePath resolved by the
 // installed package. No remote traineddata URLs are allowed.
 let worker;
 try{
  worker=await factory(languages.join("+"),1,{
   langPath:languageDir,gzip:true,cacheMethod:"none",
   errorHandler:error=>{throw Error(String(error))}
  });
  const result=await worker.recognize(png,{}, {text:true,blocks:true});
  const blocks=result?.data?.blocks||[];
  const words=[];
  for(const block of blocks)for(const para of block.paragraphs||[])
   for(const line of para.lines||[])for(const w of line.words||[]){
    const b=w.bbox||{};
    words.push({text:String(w.text||"").slice(0,200),
     x0:Number(b.x0),y0:Number(b.y0),x1:Number(b.x1),y1:Number(b.y1),
     confidence:Number(w.confidence)||0});
    if(words.length>12000)throw Error("Слишком много слов OCR")
   }
  if(!validateOcrResult({words}))throw Error("OCR вернул неверные координаты");
  return{source:"local_tesseract_ocr",text:String(result?.data?.text||"").slice(0,24000),
   words,width,height,offline:true,requiresManualVerification:true,
   safeForAutoPlacement:false}
 }finally{if(worker)await worker.terminate()}
}
module.exports={localLanguages,recognizePng,ocrDecision};
