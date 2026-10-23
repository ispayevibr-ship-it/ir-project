"use strict";
const {app,shell}=require("electron");
const fs=require("fs"),path=require("path"),crypto=require("crypto");
function root(){const dir=path.join(app.getPath("userData"),"report-documents");fs.mkdirSync(dir,{recursive:true});return dir}
function safeName(name){return String(name||"act").replace(/[<>:"/\\|?*\x00-\x1F]/g,"_").slice(0,120)||"act"}
function save(source){if(!source||!fs.existsSync(source))return null;const ext=path.extname(source).toLowerCase();if(![".pdf",".png",".jpg",".jpeg"].includes(ext))return null;const original=path.basename(source),base=safeName(path.basename(original,ext)),name=`${Date.now()}-${crypto.randomBytes(5).toString("hex")}-${base}${ext}`,dest=path.join(root(),name);fs.copyFileSync(source,dest);return{path:dest,name:original}}
function allowed(file){if(!file)return false;const target=path.resolve(String(file)),base=path.resolve(root())+path.sep;return target.startsWith(base)}
function remove(file){if(!allowed(file))return false;try{fs.rmSync(path.resolve(String(file)),{force:true});return true}catch{return false}}
async function open(file){if(!allowed(file)||!fs.existsSync(file))return false;const error=await shell.openPath(path.resolve(String(file)));if(error)throw new Error(error);return true}
module.exports={save,remove,open};