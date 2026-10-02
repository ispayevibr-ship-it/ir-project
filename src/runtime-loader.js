"use strict";
const {protocol}=require("electron");
const fs=require("fs");
const path=require("path");
function type(file){const e=path.extname(file).toLowerCase();const map={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml"};return map[e]||"application/octet-stream"}
function register(updates){protocol.handle("irapp",async req=>{try{let rel=decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/,"")||"src/index.html";const file=updates.resolveFile(rel);if(!fs.existsSync(file))return new Response("Not found",{status:404});return new Response(fs.readFileSync(file),{headers:{"Content-Type":type(file),"Cache-Control":"no-store"}})}catch{return new Response("Runtime error",{status:500})}})}
module.exports={register};
