"use strict";
/*
 * IR Project: the report of an object by a link (the engineer, 10.11.2026 «Отчет по объекту ссылкой»). The HTML report the
 * program makes for a file (src/object-export-html.js) goes packed to the company's server (collection report_links,
 * server/pb_migrations/1762810000_ir_report_links.js); the server shows it at https://a-ts.kz/r/<slug> to anyone with the
 * link — a customer, a director, on a phone — without the program and without signing in. One link per object: sharing
 * again puts the new report under the same link (it does not need to be sent again); «Удалить ссылку» turns it off at once.
 * The montage scheme alone has a link of its own (the engineer, 11.11.2026 «как получить ссылку на монтажную схему?» —
 * «добавь»): kind "scheme", one more link per object, from the «🔗 Ссылка» button of the scheme window — the page of the
 * «HTML» button. The reports are shown at https://r.a-ts.kz/r/<slug> (the subdomain: a report page cannot reach the
 * site's sign-in on a-ts.kz; the old a-ts.kz/r/… address is redirected there by the server).
 */
const zlib=require("node:zlib"),crypto=require("node:crypto");
const q=s=>encodeURIComponent(s);
const short=(v,n)=>String(v==null?"":v).slice(0,n);
const slugMake=()=>crypto.randomBytes(24).toString("base64url");
const KINDS={report:"report",scheme:"scheme"};
const kindOf=k=>KINDS[k]||"report";
// https://a-ts.kz → https://r.a-ts.kz (a server by its numbers or on this computer — as it is)
function reportHost(server){
 const base=String(server||"").replace(/\/+$/,"");
 const m=/^(https?:\/\/)([^/:]+)(.*)$/.exec(base);if(!m)return base;
 const host=m[2].toLowerCase();
 if(/^(localhost|127\.|\d+\.\d+\.\d+\.\d+$)/.test(host)||host.startsWith("r."))return base;
 return m[1]+"r."+host.replace(/^www\./,"")+m[3]
}
function createReportLinks({account}){
 const acc=()=>typeof account==="function"?account():account;
 const me=()=>{const i=acc().info();if(!i.signedIn||!i.user)throw Error("Войдите в программу (профиль → «Войти»): ссылка на отчёт делается через сервер компании");if(i.user.role==="guest")throw Error("Гость не может делиться отчётом");return i.user};
 const urlOf=r=>reportHost(acc().info().server)+"/r/"+r.slug;
 const view=r=>r?{id:r.id,url:urlOf(r),title:r.title||"",updated:String(r.updated||"").replace(" ","T"),views:r.views||0,author:r.author_name||""}:null;
 // (a server without the field kind — not updated yet: the report alone, as before 11.11.2026)
 async function find(objectId,kind){
  const rid=Number(objectId);if(!Number.isInteger(rid)||rid<=0)throw Error("Неверный объект");
  const k=kindOf(kind),list=f=>acc().api(`/api/collections/report_links/records?perPage=1&sort=-updated&filter=${q(f)}`);
  let r;
  try{r=await list(`object_rid=${rid} && `+(k==="scheme"?`kind="scheme"`:`kind!="scheme"`))}
  catch(e){if(e?.status!==400)throw e;if(k==="scheme")throw Error("Сервер компании ещё не обновлён для ссылки на схему — скажите администратору");r=await list(`object_rid=${rid}`)}
  return r?.items?.[0]||null
 }
 async function info({objectId,kind}={}){try{me();return{link:view(await find(objectId,kind))}}catch(e){return{link:null,error:String(e.message||e)}}}
 async function share({objectId,objectName,title,html,kind}={}){
  const u=me(),text=String(html||"");
  if(!/^<!doctype html>/i.test(text))throw Error("Нет отчёта");
  const gz=zlib.gzipSync(Buffer.from(text,"utf8"),{level:9});
  if(gz.length>58e6)throw Error("Отчёт слишком большой для ссылки — уберите часть разделов (например, фотографии)");
  const k=kindOf(kind),old=await find(objectId,k),file=[{field:"file",name:"report.html.gz",buffer:gz}];
  const fields={object_name:short(objectName,300),title:short(title,300),author_name:short(u.name||u.email,200)};
  let r;
  if(old)r=await acc().upload(`report_links/records/${old.id}`,fields,null,null,file,"PATCH");
  else r=await acc().upload("report_links",{...fields,author:u.id,object_rid:Number(objectId),slug:slugMake(),...(k==="scheme"?{kind:k}:{})},null,null,file);
  return{link:view(r),updated:Boolean(old),size:gz.length}
 }
 async function remove({objectId,kind}={}){
  me();const r=await find(objectId,kind);if(!r)return{link:null};
  await acc().api(`/api/collections/report_links/records/${r.id}`,{method:"DELETE"});return{link:null,removed:true}
 }
 return{info,share,remove}
}
module.exports={createReportLinks,reportHost};
