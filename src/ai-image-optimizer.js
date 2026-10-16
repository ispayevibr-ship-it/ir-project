"use strict";
/* Optional fast path for previously rasterized PDF regions. Original PDF and
 * render stay unchanged. Only a downscaled *copy* reaches the local VLM.
 * The native canvas dependency lives inside the signed Electron installer;
 * the downloaded hot patch must resolve it against the original app root. */
const path=require("node:path"),{createRequire}=require("node:module");
const FAST_REGION_MAX_SIDE=1280,MAX_IMAGE_BYTES=16*1024*1024;
function pngSize(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length<24||
    !buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
  return null;
 const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);
 if(width<1||height<1||width>16000||height>16000)return null;
 return{width,height}
}
function resizedDimensions(width,height,maxSide=FAST_REGION_MAX_SIDE){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)
  throw Error("Invalid image dimensions");
 if(!Number.isInteger(maxSide)||maxSide<384||maxSide>2048)
  throw Error("Invalid image resize threshold");
 const side=Math.max(width,height);
 const factor=Math.min(1,maxSide/side);
 return{width:Math.max(1,Math.round(width*factor)),
  height:Math.max(1,Math.round(height*factor)),changed:factor<1}
}
function bundledCanvas(){
 // The hot module is stored under userData rather than the app's node_modules.
 // Direct require() works in Node tests and when deployed as a bundled module.
 try{
  const electron=require("electron");
  if(electron?.app?.getAppPath)
   return createRequire(path.join(electron.app.getAppPath(),"main.js"))("@napi-rs/canvas")
 }catch{}
 return require("@napi-rs/canvas")
}
async function optimizeRegion(buffer,{loadCanvas=bundledCanvas,maxSide=FAST_REGION_MAX_SIDE}={}){
 const current=pngSize(buffer);
 if(!current)return{buffer,width:null,height:null,resized:false,reason:"not_png"};
 const dims=resizedDimensions(current.width,current.height,maxSide);
 if(!dims.changed)return{buffer,...current,resized:false,reason:"small_enough"};
 try{
  const canvasLib=loadCanvas();
  const bitmap=await canvasLib.loadImage(buffer);
  if(bitmap.width!==current.width||bitmap.height!==current.height)
   throw Error("PNG dimensions mismatch");
  const target=canvasLib.createCanvas(dims.width,dims.height),ctx=target.getContext("2d");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,dims.width,dims.height);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
  ctx.drawImage(bitmap,0,0,dims.width,dims.height);
  const resized=Buffer.from(await target.encode("png"));
  const output=pngSize(resized);
  if(!output||output.width!==dims.width||output.height!==dims.height||
     resized.length<16||resized.length>MAX_IMAGE_BYTES)
   throw Error("Invalid downscaled PNG");
  return{buffer:resized,...output,resized:true,originalWidth:current.width,
   originalHeight:current.height,reason:"fast_region_1280"}
 }catch(error){
  // Never prevent drawing analysis because native canvas could not be resolved
  // from the hot-update directory. No fake raster data is reported.
  return{buffer,...current,resized:false,reason:"optimization_unavailable",
   warning:String(error.message||error).slice(0,200)}
 }
}
module.exports={optimizeRegion,pngSize,resizedDimensions,FAST_REGION_MAX_SIDE};
