"use strict";
const {protocol}=require("electron");
const fs=require("fs");
const path=require("path");
function type(file){const e=path.extname(file).toLowerCase();const map={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml"};return map[e]||"application/octet-stream"}
// The window's files (the engineer, 07.11.2026 «Сам хром быстрее работает»): a file with its version in the address
// (?v=…) never changes — kept in memory after the first reading and given to the window as one it may keep; read
// without holding the main process (the database answers meanwhile). index.html and files without a version — fresh
// each time. The copy in memory is per file and its place on the disk: a hot update in another folder is read anew.
const KEEP_MAX=8*1048576,kept=new Map();
async function body(file,stamp){
 const key=file+"|"+stamp,hit=kept.get(key);if(hit)return hit;
 const data=await fs.promises.readFile(file);
 if(data.length<=KEEP_MAX)kept.set(key,data);
 return data
}
function register(updates){protocol.handle("irapp",async req=>{try{const u=new URL(req.url);let rel=decodeURIComponent(u.pathname).replace(/^\/+/,"");if(u.hostname&&u.hostname!=="app")rel=`${u.hostname}/${rel}`;if(!rel)rel="src/index.html";const file=updates.resolveFile(rel);
 let st;try{st=await fs.promises.stat(file)}catch{st=null}
 if(!st||!st.isFile())return new Response(`Not found: ${rel}`,{status:404,headers:{"Content-Type":"text/plain; charset=utf-8"}});
 const versioned=u.searchParams.has("v")&&!/\.html$/i.test(file);
 const data=await body(file,st.size+":"+st.mtimeMs);
 return new Response(data,{headers:{"Content-Type":type(file),"Cache-Control":versioned?"public, max-age=31536000, immutable":"no-cache"}})}catch(e){return new Response(`Runtime error: ${e.message}`,{status:500,headers:{"Content-Type":"text/plain; charset=utf-8"}})}})}
module.exports={register,_kept:kept};
