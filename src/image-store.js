"use strict";
const {app,nativeImage}=require("electron");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
function imagesRoot(){const dir=path.join(app.getPath("userData"),"images");fs.mkdirSync(dir,{recursive:true});return dir}
function root(){const dir=path.join(imagesRoot(),"objects");fs.mkdirSync(dir,{recursive:true});return dir}
function reportsRoot(){const dir=path.join(imagesRoot(),"reports");fs.mkdirSync(dir,{recursive:true});return dir}
function unique(ext){return Date.now()+"-"+crypto.randomBytes(6).toString("hex")+ext}
function centeredCrop(image,width,height){const size=image.getSize(),srcRatio=size.width/size.height,targetRatio=width/height;let x=0,y=0,w=size.width,h=size.height;if(srcRatio>targetRatio){w=Math.max(1,Math.round(size.height*targetRatio));x=Math.max(0,Math.round((size.width-w)/2))}else if(srcRatio<targetRatio){h=Math.max(1,Math.round(size.width/targetRatio));y=Math.max(0,Math.round((size.height-h)/2))}return image.crop({x,y,width:w,height:h}).resize({width,height,quality:"good"})}
function saveObject(source,type="cover"){if(!source||!fs.existsSync(source))return "";let image=nativeImage.createFromPath(source);if(image.isEmpty())return "";const target=type==="banner"?{width:1920,height:180}:{width:900,height:155};image=centeredCrop(image,target.width,target.height);const dest=path.join(root(),unique(".jpg"));fs.writeFileSync(dest,image.toJPEG(84));return dest}
function saveLogo(source){if(!source||!fs.existsSync(source))return "";let image=nativeImage.createFromPath(source);if(image.isEmpty())return "";const size=image.getSize(),maxWidth=360,maxHeight=120,scale=Math.min(1,maxWidth/Math.max(1,size.width),maxHeight/Math.max(1,size.height));if(scale<1)image=image.resize({width:Math.max(1,Math.round(size.width*scale)),height:Math.max(1,Math.round(size.height*scale)),quality:"good"});const dest=path.join(root(),unique(".png"));fs.writeFileSync(dest,image.toPNG());return dest}
function save(source){return saveObject(source,"cover")}
function saveReport(source){if(!source||!fs.existsSync(source))return "";let image=nativeImage.createFromPath(source);if(image.isEmpty())return "";const size=image.getSize(),maxSide=1600,largest=Math.max(size.width,size.height);if(largest>maxSide){const scale=maxSide/largest;image=image.resize({width:Math.max(1,Math.round(size.width*scale)),height:Math.max(1,Math.round(size.height*scale)),quality:"good"})}const dest=path.join(reportsRoot(),unique(".jpg"));fs.writeFileSync(dest,image.toJPEG(72));return dest}
function read(file){if(!file||!fs.existsSync(file))return "";const ext=path.extname(file).toLowerCase();const mime=ext===".png"?"image/png":ext===".webp"?"image/webp":"image/jpeg";return "data:"+mime+";base64,"+fs.readFileSync(file).toString("base64")}
function remove(file){if(!file)return false;const target=path.resolve(String(file)),base=path.resolve(imagesRoot())+path.sep;if(!target.startsWith(base))return false;try{fs.rmSync(target,{force:true});return true}catch{return false}}
module.exports={save,saveObject,saveLogo,saveReport,read,remove};