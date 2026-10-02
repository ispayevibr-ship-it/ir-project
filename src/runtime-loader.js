"use strict";
const {protocol}=require("electron");
const fs=require("fs");
const path=require("path");
function type(file){const e=path.extname(file).toLowerCase();const map={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml"};return map[e]||"application/octet-stream"}
function register(updates){protocol.handle("irapp",async req=>{try{const u=new URL(req.url);let rel=decodeURIComponent(u.pathname).replace(/^\/+/,"");if(u.hostname&&u.hostname!=="app")rel=`${u.hostname}/${rel}`;if(!rel)rel="src/index.html";const file=updates.resolveFile(rel);if(!fs.existsSync(file))return new Response(`Not found: ${rel}`,{status:404,headers:{"Content-Type":"text/plain; charset=utf-8"}});return new Response(fs.readFileSync(file),{headers:{"Content-Type":type(file),"Cache-Control":"no-store"}})}catch(e){return new Response(`Runtime error: ${e.message}`,{status:500,headers:{"Content-Type":"text/plain; charset=utf-8"}})}})}
module.exports={register};
