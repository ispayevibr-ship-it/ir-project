"use strict";
// Фото (900×400) и баннер (1920×180) объекта: инженер сам выбирает кадр в окне подгонки (src/object-media-ui.js).
// Исходник хранится в images/objects/originals, чтобы кадр можно было подогнать заново без повторного выбора файла.
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const SIZES={cover:{width:900,height:400},banner:{width:1920,height:180}};
const MAX_ORIGINAL=4000;   // длинная сторона хранимого исходника, px
const MAX_PREVIEW=2400;    // длинная сторона картинки в окне подгонки, px
function create({getUserDataPath,nativeImage}){
 const objectsDir=()=>{const d=path.join(getUserDataPath(),"images","objects");fs.mkdirSync(d,{recursive:true});return d};
 const originalsDir=()=>{const d=path.join(objectsDir(),"originals");fs.mkdirSync(d,{recursive:true});return d};
 const unique=ext=>Date.now()+"-"+crypto.randomBytes(6).toString("hex")+ext;
 const load=file=>{if(!file||!fs.existsSync(file))throw Error("Файл картинки не найден");const img=nativeImage.createFromPath(file);if(img.isEmpty())throw Error("Не удалось открыть картинку");return img};
 const shrink=(img,max)=>{const s=img.getSize(),k=Math.min(1,max/Math.max(s.width,s.height));return k<1?img.resize({width:Math.max(1,Math.round(s.width*k)),height:Math.max(1,Math.round(s.height*k)),quality:"best"}):img};
 const inside=(file,dir)=>{const rel=path.relative(dir,path.resolve(file));return !!rel&&!rel.startsWith("..")&&!path.isAbsolute(rel)};
 // Картинка для окна подгонки: уменьшенная копия + размер исходника.
 function preview(file){const img=load(file),size=img.getSize(),small=shrink(img,MAX_PREVIEW);return {file,width:size.width,height:size.height,url:"data:image/jpeg;base64,"+small.toJPEG(90).toString("base64")}}
 async function pick(dialog,win){
  const r=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"Images",extensions:["png","jpg","jpeg","webp"]}]});
  if(r.canceled||!r.filePaths[0])return null;
  return {file:r.filePaths[0]};
 }
 // Обрезка по выбранной рамке (в пикселях исходника) до точного размера программы.
 function crop({source,type,rect}={}){
  const target=SIZES[type==="banner"?"banner":"cover"];
  let original=source;
  if(!inside(source,originalsDir())){const img=shrink(load(source),MAX_ORIGINAL);original=path.join(originalsDir(),unique(".jpg"));fs.writeFileSync(original,img.toJPEG(92))}
  const img=load(original),s=img.getSize(),src=load(source).getSize(),k=s.width/src.width;
  let x=Math.round((+rect?.x||0)*k),y=Math.round((+rect?.y||0)*k),w=Math.round((+rect?.w||s.width)*k),h=Math.round((+rect?.h||s.height)*k);
  w=Math.max(1,Math.min(s.width,w));h=Math.max(1,Math.min(s.height,h));x=Math.max(0,Math.min(s.width-w,x));y=Math.max(0,Math.min(s.height-h,y));
  const out=img.crop({x,y,width:w,height:h}).resize({width:target.width,height:target.height,quality:"best"});
  const file=path.join(objectsDir(),unique(".jpg"));fs.writeFileSync(file,out.toJPEG(88));
  return {file,original,crop:{x,y,w,h},width:s.width,height:s.height};
 }
 function remove(file){if(file&&inside(file,originalsDir())&&fs.existsSync(file))fs.unlinkSync(file);return true}
 return {pick,preview,crop,remove,SIZES};
}
module.exports={create,SIZES};
