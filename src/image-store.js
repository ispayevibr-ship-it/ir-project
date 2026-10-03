"use strict";
const {app,nativeImage}=require("electron");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
function imagesRoot(){const dir=path.join(app.getPath("userData"),"images");fs.mkdirSync(dir,{recursive:true});return dir}
function root(){const dir=path.join(imagesRoot(),"objects");fs.mkdirSync(dir,{recursive:true});return dir}
function reportsRoot(){const dir=path.join(imagesRoot(),"reports");fs.mkdirSync(dir,{recursive:true});return dir}
function save(source){if(!source||!fs.existsSync(source))return "";const ext=path.extname(source).toLowerCase()||".jpg";const name=Date.now()+"-"+crypto.randomBytes(6).toString("hex")+ext;const dest=path.join(root(),name);fs.copyFileSync(source,dest);return dest}
function saveReport(source){if(!source||!fs.existsSync(source))return "";let image=nativeImage.createFromPath(source);if(image.isEmpty())return "";const size=image.getSize(),maxSide=1600,largest=Math.max(size.width,size.height);if(largest>maxSide){const scale=maxSide/largest;image=image.resize({width:Math.max(1,Math.round(size.width*scale)),height:Math.max(1,Math.round(size.height*scale)),quality:"good"})}const name=Date.now()+"-"+crypto.randomBytes(6).toString("hex")+".jpg",dest=path.join(reportsRoot(),name);fs.writeFileSync(dest,image.toJPEG(72));return dest}
function read(file){if(!file||!fs.existsSync(file))return "";const ext=path.extname(file).toLowerCase();const mime=ext===".png"?"image/png":ext===".webp"?"image/webp":"image/jpeg";return "data:"+mime+";base64,"+fs.readFileSync(file).toString("base64")}
function remove(file){if(!file)return false;const target=path.resolve(String(file)),base=path.resolve(imagesRoot())+path.sep;if(!target.startsWith(base))return false;try{fs.rmSync(target,{force:true});return true}catch{return false}}
module.exports={save,saveReport,read,remove};
