"use strict";
/* Fast KMD stamp recognition uses a smaller image/prompt and output budget.
 * Source page, original PDF SHA and engineering review remain unchanged.
 * Runs without native canvas on Ubuntu; Windows also tests the real decoder. */
const assert=require("node:assert/strict"),crypto=require("node:crypto");
const {optimizeRegion,pngSize,resizedDimensions,FAST_REGION_MAX_SIDE}=require("../src/ai-image-optimizer");
const {createAnalysis}=require("../src/ai-analysis");
const header=Buffer.from([137,80,78,71,13,10,26,10]);
const fakePng=(width,height)=>{
 const b=Buffer.alloc(128);header.copy(b);b.writeUInt32BE(13,8);
 b.write("IHDR",12,"ascii");b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);
 return b
};
(async()=>{
 assert.equal(FAST_REGION_MAX_SIDE,1280);
 assert.deepEqual(pngSize(fakePng(1800,900)),{width:1800,height:900});
 assert.equal(pngSize(Buffer.alloc(40)),null);
 assert.deepEqual(resizedDimensions(1800,900),{width:1280,height:640,changed:true});
 assert.deepEqual(resizedDimensions(300,200),{width:300,height:200,changed:false});
 const mockCanvas={
  loadImage:async()=>({width:1800,height:900}),
  createCanvas:(w,h)=>({
   getContext:()=>({fillStyle:"",imageSmoothingEnabled:false,
    imageSmoothingQuality:"",fillRect(){},drawImage(){}}),
   encode:async()=>fakePng(w,h)
  })
 };
 const shrink=await optimizeRegion(fakePng(1800,900),{loadCanvas:()=>mockCanvas});
 assert.equal(shrink.resized,true);
 assert.equal(shrink.width,1280);assert.equal(shrink.height,640);
 assert.equal(shrink.originalWidth,1800);
 const safeFallback=await optimizeRegion(fakePng(1800,900),{loadCanvas:()=>{throw Error("native unavailable")}});
 assert.equal(safeFallback.resized,false,"no native canvas must never cancel analysis");
 assert.equal(safeFallback.width,1800);
 let authentic=false;
 try{
  const {createCanvas}=require("@napi-rs/canvas");
  const canvas=createCanvas(1600,800),ctx=canvas.getContext("2d");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,1600,800);
  ctx.fillStyle="#111";ctx.font="bold 90px Arial";ctx.fillText("K60",50,240);
  const native=Buffer.from(await canvas.encode("png"));
  const output=await optimizeRegion(native,{loadCanvas:()=>require("@napi-rs/canvas")});
  assert.equal(output.width,1280);
  assert.equal(output.height,640);
  assert.equal(output.resized,true);
  authentic=true
 }catch(error){
  if(error?.code!=="MODULE_NOT_FOUND"&&error?.code!=="ERR_MODULE_NOT_FOUND")
   throw error
 }
 const sha="a".repeat(64),rows=[],calls=[];
 const db={getObject:id=>id===7?{id:7}:null,
  createEntity:(id,key,record)=>{
   const value={id:rows.length+1,record_type:record.record_type,data:record.data};
   rows.push(value);return value
  }};
 const renderer={renderForAnalysis:async(_oid,_did,page,region)=>({
  buffer:fakePng(1800,900),mime:"image/png",
  width:1800,height:900,scale:2,
  source:{documentId:3,sha256:sha,name:"041-2025 КМД К60.pdf",
   kind:"КМД",page,region:region||null}
 })};
 const engine={status:()=>({state:"ready"}),analyzeImage:async opts=>{
  calls.push(opts);
  return{raw:JSON.stringify({schema:"ir-kmd-v1",
   text:"Колонна",marks:["К60"],notes:[],unknowns:[],records:[]}),
   engine:"llama.cpp",complete:true}
 }};
 const analysis=createAnalysis({database:db,documents:{verify:()=>true},engine,pdfRenderer:renderer});
 const region={x:0.62,y:0.72,width:0.3,height:0.2};
 const partial=await analysis.analyzePdf(7,3,1,region);
 assert.deepEqual(partial.marks,["К60"]);
 assert.equal(calls[0].maxOutputTokens,576);
 assert(calls[0].prompt.includes("экспресс-проверка"));
 assert(!calls[0].prompt.includes("массу и число метизов"),"no long full-sheet prompt");
 assert.equal(rows[0].data.source.sha256,sha);
 assert.deepEqual(rows[0].data.source.region,region);
 assert.equal(rows[0].data.raster.originalWidth,1800);
 assert.equal(rows[0].data.raster.fastRegion,true);
 assert.equal(rows[0].data.verification,"requires_review");
 const full=await analysis.analyzePdf(7,3,1);
 assert.equal(calls[1].maxOutputTokens,undefined);
 assert(calls[1].prompt.includes("видимые данные листа КМ/КМД"));
 assert.equal(rows[1].data.raster.fastRegion,false);
 assert.equal(rows[1].data.raster.width,1800);
 console.log("Fast KMD stamp: 1280px optimization, 576-token cap, original PDF provenance, unverified result PASS"+
  (authentic?" (native image resize passed)":" (native canvas unavailable in Node runner)"));
})().catch(e=>{console.error(e);process.exitCode=1});
