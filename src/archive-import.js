"use strict";
/*
 * Загрузка завершённых объектов портфолио компании (просьба инженера 10.11.2026: объекты с сайта — в программу, но не в
 * саму программу: новый пользователь видит их только после входа под своим логином).
 * Данные — в закрытом хранилище (portfolio/objects.json, portfolio/covers, portfolio/photos), берутся ключом GitHub
 * программы (readBranch) и ложатся в базу этого компьютера обычными объектами «ранее завершённый» (archive-objects.js);
 * дальше их, как любые объекты, разносит синхронизация с сервером (server-sync.js — и фото).
 * Повторная загрузка не задваивает: у объекта запись object-meta «portfolio_key».
 */
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");

const LIST="portfolio/objects.json";
const SECTIONS=["reports","work-types","marks","deliveries","schedule","photos","scheme","acted-days","penalties","finance"];

function createArchiveImport({database,github,imageStore=()=>require("./image-store")}){
 let running=null,progress=null;
 function imported(){
  const keys=new Map();
  for(const o of database.listObjects()){
   try{for(const r of database.listEntity(o.id,"object-meta"))if(r.record_type==="portfolio_key"&&r.data?.value)keys.set(String(r.data.value),o.id)}catch{}
  }
  return keys
 }
 async function readList(){
  const {files,commit}=await github.readBranch([LIST]);
  const buf=files.get(LIST);if(!buf)throw Error("В хранилище нет списка объектов портфолио");
  const data=JSON.parse(buf.toString("utf8"));
  return{commit,objects:Array.isArray(data?.objects)?data.objects:[]}
 }
 async function status(){
  if(!github.hasToken())return{ready:false,why:"Нужен ключ GitHub программы (Настройки → GitHub)"};
  const {objects}=await readList(),have=imported();
  return{ready:true,total:objects.length,imported:objects.filter(o=>have.has(String(o.key))).length,photos:objects.reduce((s,o)=>s+(o.photos||[]).length,0),progress}
 }
 const tmpFile=(buf,name)=>{const f=path.join(os.tmpdir(),"ir-portfolio-"+process.pid+"-"+path.basename(name));fs.writeFileSync(f,buf);return f};
 async function importOne(o,commit){
  const store=imageStore();
  const wanted=[o.cover,...(o.photos||[])].filter(p=>typeof p==="string"&&/^portfolio\/[A-Za-z0-9_\/.-]+\.jpe?g$/i.test(p)&&!p.includes(".."));
  const {files}=await github.readBranch(wanted,commit);
  const sections=Object.fromEntries(SECTIONS.map(k=>[k,false]));
  const obj=database.createObject({name:String(o.name||"Объект"),customer:String(o.customer||""),general_contractor:String(o.general_contractor||""),address:String(o.address||""),status:"Завершен",sections});
  const id=obj.id;
  const meta=(type,title,value)=>database.createEntity(id,"object-meta",{record_type:type,title,data:{entity_type:type,value}});
  meta("object_short_name","Краткое название объекта",String(o.short_name||o.name||"").slice(0,80));
  meta("object_kind","Вид объекта","archive");
  meta("portfolio_key","Объект портфолио",String(o.key));
  if(Array.isArray(o.years)&&o.years.length)meta("object_years","Годы работ",o.years.join("–"));
  const cover=files.get(o.cover);
  if(cover){
   const src=tmpFile(cover,o.cover);
   try{
    const c=store.saveObject(src,"cover");if(c)database.createEntity(id,"photos",{record_type:"cover",title:"cover",data:{photo_type:"cover",file_path:c}});
    const b=store.saveObject(src,"banner");if(b)database.createEntity(id,"photos",{record_type:"banner",title:"banner",data:{photo_type:"banner",file_path:b}});
   }finally{fs.rmSync(src,{force:true})}
  }
  (o.works||[]).forEach((w,i)=>database.createEntity(id,"archive",{record_type:"work",title:String(w.name||""),data:{name:String(w.name||""),unit:String(w.unit||""),volume:String(w.volume??""),note:String(w.note||""),year:String(w.year||""),order:i+1}}));
  let photos=0;
  for(const p of o.photos||[]){
   const buf=files.get(p);if(!buf)continue;
   const src=tmpFile(buf,p);
   try{const f=store.saveReport(src);if(f){database.createEntity(id,"archive",{record_type:"photo",title:"Фото объекта",data:{file_path:f}});photos++}}
   finally{fs.rmSync(src,{force:true})}
  }
  return{id,photos}
 }
 function run(){
  if(running)return running;
  running=(async()=>{
   if(!github.hasToken())throw Error("Нужен ключ GitHub программы (Настройки → GitHub)");
   const {objects,commit}=await readList(),have=imported();
   const todo=objects.filter(o=>o&&o.key&&!have.has(String(o.key)));
   progress={done:0,total:todo.length,name:""};
   const made=[];
   for(const o of todo){progress.name=String(o.name||"");made.push(await importOne(o,commit));progress.done++}
   progress=null;
   return{imported:made.length,photos:made.reduce((s,m)=>s+m.photos,0),skipped:objects.length-todo.length}
  })().finally(()=>{running=null;progress=null});
  return running
 }
 return{status,run,progress:()=>progress}
}
module.exports={createArchiveImport};
