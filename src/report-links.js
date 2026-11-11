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
 * A readable link (the engineer, 11.11.2026 «ссылку более понятной… a-ts.kz/objectID/sheme» — chose «шифр + код»):
 * https://r.a-ts.kz/<object>/<kind>-<code>, e.g. r.a-ts.kz/ir-71535/scheme-k7x2m9qa4d — the object's short name in Latin
 * letters, the kind, 10 random signs (others' links are not guessed). Field path (server/pb_migrations/1762930000_…);
 * a link made before gets it at its next sharing, its old /r/<slug> address keeps working.
 */
const zlib=require("node:zlib"),crypto=require("node:crypto");
const q=s=>encodeURIComponent(s);
const short=(v,n)=>String(v==null?"":v).slice(0,n);
const slugMake=()=>crypto.randomBytes(24).toString("base64url");
const KINDS={report:"report",scheme:"scheme"};
const kindOf=k=>KINDS[k]||"report";
// «ИР-71535» → «ir-71535», «Цех дробления» → «tseh-drobleniya»: Latin letters, so the link is not turned into %D0%98… when copied
const LAT={а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",ә:"a",ғ:"g",қ:"k",ң:"n",ө:"o",ұ:"u",ү:"u",һ:"h",і:"i"};
function namePart(label){
 let t=[...String(label||"").toLowerCase()].map(c=>LAT[c]??c).join("").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
 if(t.length>40){t=t.slice(0,41);const cut=t.lastIndexOf("-");t=(cut>=12?t.slice(0,cut):t.slice(0,40)).replace(/-+$/,"")}
 return t||"obekt"
}
const CODE="abcdefghijkmnpqrstuvwxyz23456789";
const codeMake=()=>[...crypto.randomBytes(10)].map(b=>CODE[b&31]).join("");
const pathMake=(label,kind)=>namePart(label)+"/"+kindOf(kind)+"-"+codeMake();
const PATH_RE=/^[a-z0-9-]{1,48}\/(scheme|report)-[a-z0-9]{10}$/;
const isLocal=host=>/^(localhost|127\.|\d+\.\d+\.\d+\.\d+$)/.test(host);
// https://a-ts.kz → https://r.a-ts.kz (a server by its numbers or on this computer — as it is)
function reportHost(server){
 const base=String(server||"").replace(/\/+$/,"");
 const m=/^(https?:\/\/)([^/:]+)(.*)$/.exec(base);if(!m)return base;
 const host=m[2].toLowerCase();
 if(isLocal(host)||host.startsWith("r."))return base;
 return m[1]+"r."+host.replace(/^www\./,"")+m[3]
}
function createReportLinks({account}){
 const acc=()=>typeof account==="function"?account():account;
 const me=()=>{const i=acc().info();if(!i.signedIn||!i.user)throw Error("Войдите в программу (профиль → «Войти»): ссылка на отчёт делается через сервер компании");if(i.user.role==="guest")throw Error("Гость не может делиться отчётом");return i.user};
 // the readable address on r.<site> (Caddy passes it on as /r/<path>); a server by numbers or on this computer has no Caddy — /r/<path>
 function urlOf(r){
  const host=reportHost(acc().info().server);
  if(!PATH_RE.test(String(r.path||"")))return host+"/r/"+r.slug;
  const m=/^https?:\/\/([^/:]+)/.exec(host);return host+(m&&isLocal(m[1].toLowerCase())?"/r/":"/")+r.path
 }
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
 async function share({objectId,objectName,label,title,html,kind}={}){
  const u=me(),text=String(html||"");
  if(!/^<!doctype html>/i.test(text))throw Error("Нет отчёта");
  const gz=zlib.gzipSync(Buffer.from(text,"utf8"),{level:9});
  if(gz.length>58e6)throw Error("Отчёт слишком большой для ссылки — уберите часть разделов (например, фотографии)");
  const k=kindOf(kind),old=await find(objectId,k),file=[{field:"file",name:"report.html.gz",buffer:gz}];
  const fields={object_name:short(objectName,300),title:short(title,300),author_name:short(u.name||u.email,200)};
  let r;
  // (a server without the field path — not updated yet: it ignores the field, the link stays /r/<slug>)
  const name=label||objectName;
  if(old)r=await acc().upload(`report_links/records/${old.id}`,{...fields,...(old.path?{}:{path:pathMake(name,k)})},null,null,file,"PATCH");
  else r=await acc().upload("report_links",{...fields,author:u.id,object_rid:Number(objectId),slug:slugMake(),path:pathMake(name,k),...(k==="scheme"?{kind:k}:{})},null,null,file);
  return{link:view(r),updated:Boolean(old),size:gz.length}
 }
 async function remove({objectId,kind}={}){
  me();const r=await find(objectId,kind);if(!r)return{link:null};
  await acc().api(`/api/collections/report_links/records/${r.id}`,{method:"DELETE"});return{link:null,removed:true}
 }
 return{info,share,remove}
}
module.exports={createReportLinks,reportHost,namePart,pathMake};
