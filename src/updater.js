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

function request(url,asJson=false){return new Promise((resolve,reject)=>{const go=u=>https.get(u,{headers:{"User-Agent":"IR-Project-Updater","Cache-Control":"no-cache, no-store, must-revalidate","Pragma":"no-cache","Expires":"0","Accept":asJson?"application/json":"*/*"}},res=>{if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();return go(res.headers.location)}if(res.statusCode!==200){res.resume();return reject(new Error(`HTTP ${res.statusCode}: ${u}`))}const chunks=[];res.on("data",c=>chunks.push(c));res.on("end",()=>{const data=Buffer.concat(chunks);if(!asJson)return resolve(data);try{resolve(JSON.parse(data.toString("utf8")))}catch(e){reject(e)}})}).on("error",reject);go(url)})}
function installedVersion(){try{const s=JSON.parse(fs.readFileSync(stateFile(),"utf8"));return s.version||app.getVersion()}catch{return app.getVersion()}}
function newer(a,b){const A=String(a).split(".").map(Number),B=String(b).split(".").map(Number);for(let i=0;i<Math.max(A.length,B.length);i++){const x=A[i]||0,y=B[i]||0;if(x!==y)return x>y}return false}
async function check(){try{available=null;const nonce=`${Date.now()}-${Math.random().toString(16).slice(2)}`;const url=`https://raw.githubusercontent.com/${OWNER}/${REPO}/main/hot/latest.json?ir=${nonce}`;const m=await request(url,true);const local=installedVersion();if(newer(m.version,local)){available=m;events.emit("update-available",{version:m.version,size:(m.files||[]).reduce((s,f)=>s+(Number(f.size)||0),0),installedVersion:local});return {updateInfo:{version:m.version}}}events.emit("update-not-available",{version:local,remoteVersion:m.version});return {updateInfo:{version:local}}}catch(e){events.emit("error",e);throw e}}
async function downloadUpdate(){if(!available){await check();if(!available)throw new Error("Обновление не найдено")};const stage=path.join(root(),"staging");fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true});const files=available.files||[];const total=files.reduce((s,f)=>s+(Number(f.size)||0),0)||1;let done=0;for(const f of files){const nonce=`${Date.now()}-${Math.random().toString(16).slice(2)}`;const url=`https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${f.source}?ir=${nonce}`;const data=await request(url,false);fs.mkdirSync(path.dirname(path.join(stage,f.target)),{recursive:true});fs.writeFileSync(path.join(stage,f.target),data);done+=data.length;events.emit("download-progress",{percent:Math.min(100,Math.round(done/Math.max(total,done)*100)),transferred:done,total:Math.max(total,done),bytesPerSecond:0})}fs.rmSync(current(),{recursive:true,force:true});fs.renameSync(stage,current());fs.mkdirSync(root(),{recursive:true});fs.writeFileSync(stateFile(),JSON.stringify({version:available.version,installedAt:new Date().toISOString()},null,2));events.emit("update-downloaded",{version:available.version});return [current()]}
function install(){app.relaunch();app.exit(0)}
module.exports={check,download:downloadUpdate,install,updater:events,currentDir:current,installedVersion};
