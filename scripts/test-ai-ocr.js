"use strict";
/* Lettering without a text layer is read locally by OCR, upright and turned, in the PDF's top-down points; lines are wiped. */
const assert=require("node:assert/strict");
const {ocrPage,dropLettering,createOcrWorker}=require("../src/ai-ocr");
const {workerPackages}=require("../src/ai-packages");
const canvas=require("@napi-rs/canvas");
(async()=>{
 const ocr=workerPackages().ocr;assert(ocr,"OCR packages are installed");
 // A page of 600×300 pt: a level mark, a title and an upward-reading mark.
 const page={getViewport:({scale})=>({width:600*scale,height:300*scale,scale}),
  render:({canvasContext:c,viewport:v})=>({promise:(async()=>{
   const s=v.scale;c.fillStyle="#000";c.font=Math.round(9*s)+"px sans-serif";
   c.fillText("+4,500",60*s,80*s);c.fillRect(0,200*s,600*s,2*s);c.fillText("СХЕМА РАСПОЛОЖЕНИЯ КОЛОНН",60*s,160*s);
   c.save();c.translate(500*s,250*s);c.rotate(-Math.PI/2);c.fillText("К12",0,0);c.restore()})()})};
 const worker=await createOcrWorker(ocr);
 const texts=await ocrPage(page,{canvas,worker});await worker.terminate();
 if(process.env.SHOW)console.log(JSON.stringify(texts));
 const find=s=>texts.find(t=>t.str.replace(/\s+/g," ").includes(s));
 const level=find("+4,500"),title=find("РАСПОЛОЖЕНИЯ"),mark=find("К12");
 assert(level&&Math.abs(level.x-60)<4&&Math.abs(level.y-80)<4&&level.angle===0,"upright text in page points: "+JSON.stringify(level));
 assert(title&&/СХЕМА РАСПОЛОЖЕНИЯ/.test(title.str),"words of one run are joined");
 assert(mark&&mark.angle===90&&Math.abs(mark.x-500)<4&&Math.abs(mark.y-250)<5,"upward text keeps its baseline start: "+JSON.stringify(mark));
 // Glyph strokes inside a recognised word are dropped, drawing lines are kept.
 const segs=[{a:{x:62,y:76},b:{x:70,y:80}},{a:{x:0,y:200},b:{x:600,y:200}}];
 assert.equal(dropLettering(segs,[level]).length,1);
 console.log("OCR: curves lettering read locally, upright and turned PASS")
})().catch(e=>{console.error(e);process.exit(1)});
