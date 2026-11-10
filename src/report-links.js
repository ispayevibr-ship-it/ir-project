"use strict";
/*
 * IR Project: the report of an object by a link (the engineer, 10.11.2026 «Отчет по объекту ссылкой»). The HTML report the
 * program makes for a file (src/object-export-html.js) goes packed to the company's server (collection report_links,
 * server/pb_migrations/1762810000_ir_report_links.js); the server shows it at https://a-ts.kz/r/<slug> to anyone with the
 * link — a customer, a director, on a phone — without the program and without signing in. One link per object: sharing
 * again puts the new report under the same link (it does not need to be sent again); «Удалить ссылку» turns it off at once.
 */
const zlib=require("node:zlib"),crypto=require("node:crypto");
const q=s=>encodeURIComponent(s);
const short=(v,n)=>String(v==null?"":v).slice(0,n);
const slugMake=()=>crypto.randomBytes(24).toString("base64url");
function createReportLinks({account}){
 const acc=()=>typeof account==="function"?account():account;
 const me=()=>{const i=acc().info();if(!i.signedIn||!i.user)throw Error("Войдите в программу (профиль → «Войти»): ссылка на отчёт делается через сервер компании");if(i.user.role==="guest")throw Error("Гость не может делиться отчётом");return i.user};
 const urlOf=r=>acc().info().server.replace(/\/+$/,"")+"/r/"+r.slug;
 const view=r=>r?{id:r.id,url:urlOf(r),title:r.title||"",updated:String(r.updated||"").replace(" ","T"),views:r.views||0,author:r.author_name||""}:null;
 async function find(objectId){
  const rid=Number(objectId);if(!Number.isInteger(rid)||rid<=0)throw Error("Неверный объект");
  const r=await acc().api(`/api/collections/report_links/records?perPage=1&sort=-updated&filter=${q(`object_rid=${rid}`)}`);
  return r?.items?.[0]||null
 }
 async function info({objectId}={}){try{me();return{link:view(await find(objectId))}}catch(e){return{link:null,error:String(e.message||e)}}}
 async function share({objectId,objectName,title,html}={}){
  const u=me(),text=String(html||"");
  if(!/^<!doctype html>/i.test(text))throw Error("Нет отчёта");
  const gz=zlib.gzipSync(Buffer.from(text,"utf8"),{level:9});
  if(gz.length>58e6)throw Error("Отчёт слишком большой для ссылки — уберите часть разделов (например, фотографии)");
  const old=await find(objectId),file=[{field:"file",name:"report.html.gz",buffer:gz}];
  const fields={object_name:short(objectName,300),title:short(title,300),author_name:short(u.name||u.email,200)};
  let r;
  if(old)r=await acc().upload(`report_links/records/${old.id}`,fields,null,null,file,"PATCH");
  else r=await acc().upload("report_links",{...fields,author:u.id,object_rid:Number(objectId),slug:slugMake()},null,null,file);
  return{link:view(r),updated:Boolean(old),size:gz.length}
 }
 async function remove({objectId}={}){
  me();const r=await find(objectId);if(!r)return{link:null};
  await acc().api(`/api/collections/report_links/records/${r.id}`,{method:"DELETE"});return{link:null,removed:true}
 }
 return{info,share,remove}
}
module.exports={createReportLinks};
