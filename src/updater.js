"use strict";
const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { EventEmitter } = require("events");

const OWNER="ispayevibr-ship-it", REPO="ir-project";
const events=new EventEmitter();
let available=null;
const root=()=>path.join(app.getPath("userData"),"app-updates");
const current=()=>path.join(root(),"current");
const stateFile=()=>path.join(root(),"state.json");

function getJson(url){return new Promise((resolve,reject)=>{https.get(url,{headers:{"User-Agent":"IR-Project","Cache-Control":"no-cache"}},res=>{if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();return getJson(res.headers.location).then(resolve,reject)}if(res.statusCode!==200){res.resume();return reject(new Error(`HTTP ${res.statusCode}`))}let a=[];res.on("data",c=>a.push(c));res.on("end",()=>{try{resolve(JSON.parse(Buffer.concat(a).toString("utf8")))}catch(e){reject(e)}})}).on("error",reject)})}
function download(url,dest,onBytes){return new Promise((resolve,reject)=>{fs.mkdirSync(path.dirname(dest),{recursive:true});const go=u=>https.get(u,{headers:{"User-Agent":"IR-Project","Cache-Control":"no-cache"}},res=>{if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();return go(res.headers.location)}if(res.statusCode!==200){res.resume();return reject(new Error(`HTTP ${res.statusCode}: ${u}`))}const out=fs.createWriteStream(dest);res.on("data",c=>onBytes(c.length));res.pipe(out);out.on("finish",()=>out.close(resolve));out.on("error",reject)}).on("error",reject);go(url)})}
function installedVersion(){try{return JSON.parse(fs.readFileSync(stateFile(),"utf8")).version||app.getVersion()}catch{return app.getVersion()}}
function newer(a,b){const A=String(a).split(".").map(Number),B=String(b).split(".").map(Number);for(let i=0;i<Math.max(A.length,B.length);i++){if((A[i]||0)!==(B[i]||0))return (A[i]||0)>(B[i]||0)}return false}
async function check(){try{const url=`https://raw.githubusercontent.com/${OWNER}/${REPO}/main/hot/latest.json?t=${Date.now()}`;const m=await getJson(url);if(newer(m.version,installedVersion())){available=m;events.emit("update-available",{version:m.version,size:m.files.reduce((s,f)=>s+(f.size||0),0)});return {updateInfo:{version:m.version}}}events.emit("update-not-available",{version:installedVersion()});return {updateInfo:{version:installedVersion()}}}catch(e){events.emit("error",e);throw e}}
async function downloadUpdate(){if(!available)await check();if(!available)throw new Error("Обновление не найдено");const stage=path.join(root(),"staging");fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true});const total=available.files.reduce((s,f)=>s+(f.size||0),0)||1;let done=0;for(const f of available.files){const url=`https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${f.source}?t=${Date.now()}`;await download(url,path.join(stage,f.target),n=>{done+=n;events.emit("download-progress",{percent:Math.min(100,done/total*100),transferred:done,total,bytesPerSecond:0})})}fs.rmSync(current(),{recursive:true,force:true});fs.renameSync(stage,current());fs.mkdirSync(root(),{recursive:true});fs.writeFileSync(stateFile(),JSON.stringify({version:available.version,installedAt:new Date().toISOString()},null,2));events.emit("update-downloaded",{version:available.version});return [current()]}
function install(){app.relaunch();app.exit(0)}
module.exports={check,download:downloadUpdate,install,updater:events,currentDir:current,installedVersion};
