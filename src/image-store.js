"use strict";
const {app}=require("electron");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
function root(){const dir=path.join(app.getPath("userData"),"images","objects");fs.mkdirSync(dir,{recursive:true});return dir}
function save(source){if(!source||!fs.existsSync(source))return "";const ext=path.extname(source).toLowerCase()||".jpg";const name=Date.now()+"-"+crypto.randomBytes(6).toString("hex")+ext;const dest=path.join(root(),name);fs.copyFileSync(source,dest);return dest}
function read(file){if(!file||!fs.existsSync(file))return "";const ext=path.extname(file).toLowerCase();const mime=ext===".png"?"image/png":ext===".webp"?"image/webp":"image/jpeg";return "data:"+mime+";base64,"+fs.readFileSync(file).toString("base64")}
module.exports={save,read};
