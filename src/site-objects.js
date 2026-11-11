"use strict";
/*
 * IR Project: the objects on the company's site a-ts.kz (the engineer, 10.11.2026 «в панели администратора сделаем
 * отправить на сайт объекты (я выбираю какие), и на сайте вся информация автоматически обновляется (общий тоннаж
 * смонтированный фирмой, общий объем и тд), сейчас все объекты с сайта удали. и чтобы я сделал отправку»).
 * The window (server-account-page.js → «Объекты на сайте») gathers each chosen object as the program shows it: the card
 * (name, customer, general contractor, address, status), the works with their volumes (a finished object — its own
 * table, an object in work — mounted by the daily reports), the cover and the photos. Here it goes to the server
 * collection `site_objects` (server/pb_migrations/1762800000_ir_site_objects.js) as the administrator signed in:
 * the site is exactly the chosen list — an object taken off the list is taken off the site. Photos are made smaller
 * (≤1600 px, JPEG) and sent again only when they changed (photo_key). The site sums the totals itself.
 */
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");

const COLL="site_objects";
const MAX_PHOTOS=30;
const MAX_SIDE=1600;
const clip=(v,n)=>String(v??"").replace(/\s+/g," ").trim().slice(0,n);
const numberOf=v=>{const n=Number(String(v??"").replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};

// What the window sends → only the known fields, of a known size.
function clean(list){
 const out=[],seen=new Set();
 for(const [i,o] of (Array.isArray(list)?list:[]).entries()){
  const rid=Number(o?.rid);if(!Number.isInteger(rid)||rid<=0||seen.has(rid))continue;seen.add(rid);
  const works=(Array.isArray(o.works)?o.works:[]).slice(0,60).map(w=>({name:clip(w?.name,200),unit:clip(w?.unit,20),
   volume:Math.round(numberOf(w?.volume)*1000)/1000,plan:Math.round(numberOf(w?.plan)*1000)/1000,note:clip(w?.note,400)})).filter(w=>w.name);
  const photos=[...new Set((Array.isArray(o.photos)?o.photos:[]).map(p=>String(p||"")).filter(Boolean))];
  out.push({rid,name:clip(o.name,300)||"Объект",customer:clip(o.customer,300),general_contractor:clip(o.general_contractor,300),
   address:clip(o.address,300),summary:String(o.summary??"").replace(/\r\n?/g,"\n").replace(/[^\S\n]+/g," ").replace(/ *\n */g,"\n").replace(/\n{3,}/g,"\n\n").trim().slice(0,2000),status:clip(o.status,50),years:clip(o.years,50),works,cover:String(o.cover||""),
   photos:photos.filter(p=>p!==String(o.cover||"")).slice(0,MAX_PHOTOS),skip:(Array.isArray(o.skip)?o.skip:[]).map(p=>String(p||"")).filter(Boolean).slice(0,4),sort:Number.isInteger(o.sort)?o.sort:i+1})
 }
 return out
}

function createSiteObjects({account,getUserDataPath,nativeImage=null}){
 let state={running:false,done:0,total:0,name:"",error:"",units:0,unitsDone:0,photo:0,photos:0};
 const requireAdmin=()=>{if(account.info().user?.role!=="admin")throw Error("Отправка на сайт — только для администратора")};
 // only the pictures of the program itself (its folder of data), never any file of the computer
 const inside=file=>{try{const rel=path.relative(getUserDataPath(),path.resolve(String(file)));return!!rel&&!rel.startsWith("..")&&!path.isAbsolute(rel)}catch{return false}};
 const usable=file=>{try{return inside(file)&&fs.statSync(file).isFile()}catch{return false}};
 function picture(file){
  if(nativeImage){
   const img=nativeImage.createFromPath(file);
   if(!img.isEmpty()){const s=img.getSize(),k=Math.min(1,MAX_SIDE/Math.max(s.width,s.height));
    const out=k<1?img.resize({width:Math.max(1,Math.round(s.width*k)),height:Math.max(1,Math.round(s.height*k)),quality:"best"}):img;
    return out.toJPEG(82)}
  }
  return fs.readFileSync(file)
 }
 // the photos as they are now: their places, sizes and times — a new key means «send the photos again»
 function photoKey(o){
  const h=crypto.createHash("sha1");
  for(const f of [o.cover,...o.photos]){if(!f)continue;h.update(f);try{const s=fs.statSync(f);h.update(":"+s.size+":"+s.mtimeMs)}catch{h.update(":-")}h.update("|")}
  return h.digest("hex").slice(0,40)
 }
 async function current(){return account.list(COLL,"fields=id,rid,name,status,photo_key,updated&sort=sort")}
 async function info(){requireAdmin();const rows=await current();return{objects:rows.map(r=>({id:r.id,rid:r.rid,name:r.name,status:r.status,updated:r.updated}))}}
 const status=()=>({...state});
 // Обложка и баннер объекта не идут в фото, даже если та же картинка лежит в фото копией под другим именем
 // (просьба инженера 11.11.2026 «баннер объекта почему-то тоже в галерее фото»): сравнение по содержимому файла.
 const digest=file=>{try{return usable(file)?crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex"):""}catch{return""}};
 function withoutCover(o){
  const same=new Set([o.cover,...o.skip].map(digest).filter(Boolean));if(!same.size)return o;
  return{...o,photos:o.photos.filter(f=>!same.has(digest(f)))}
 }

 async function sendOne(o,have){
  const key=photoKey(o);
  const fields={rid:o.rid,name:o.name,customer:o.customer,general_contractor:o.general_contractor,address:o.address,summary:o.summary,
   status:o.status,years:o.years,works:o.works,sort:o.sort,photo_key:key};
  if(have&&have.photo_key===key){state.unitsDone+=(o.cover?1:0)+o.photos.length;return account.api(`/api/collections/${COLL}/records/${have.id}`,{method:"PATCH",body:fields})}
  const form=new FormData();
  for(const [k,v] of Object.entries(fields))form.append(k,typeof v==="object"?JSON.stringify(v):String(v));
  // the progress for the window: every photo made smaller is one step, the sending of the object — one more
  state.photo=0;state.photos=(o.cover?1:0)+o.photos.length;
  const step=()=>{state.photo++;state.unitsDone++};
  if(o.cover&&usable(o.cover))form.append("cover",new Blob([picture(o.cover)],{type:"image/jpeg"}),"cover.jpg");
  else form.append("cover","");
  if(o.cover)step();
  let n=0;
  for(const f of o.photos){if(usable(f))try{form.append("photos",new Blob([picture(f)],{type:"image/jpeg"}),`photo-${++n}.jpg`)}catch{}step();await new Promise(r=>setImmediate(r))}
  if(!n)form.append("photos","");
  return have?account.form("PATCH",`/api/collections/${COLL}/records/${have.id}`,form):account.form("POST",`/api/collections/${COLL}/records`,form)
 }
 // The site becomes exactly the chosen list (an empty list — the site without objects).
 async function publish({objects}={}){
  requireAdmin();
  if(state.running)throw Error("Отправка уже идёт — подождите");
  const want=clean(objects).map(withoutCover);
  state={running:true,done:0,total:want.length,name:"",error:"",units:want.reduce((n,o)=>n+1+(o.cover?1:0)+o.photos.length,0),unitsDone:0,photo:0,photos:0};
  try{
   const rows=await current(),byRid=new Map(rows.map(r=>[Number(r.rid),r]));
   let removed=0;
   for(const r of rows)if(!want.some(o=>o.rid===Number(r.rid))){await account.api(`/api/collections/${COLL}/records/${r.id}`,{method:"DELETE"});removed++}
   for(const o of want){state.name=o.name;await sendOne(o,byRid.get(o.rid));state.done++;state.unitsDone++}
   state.running=false;state.name="";
   return{sent:want.length,removed,photos:want.reduce((n,o)=>n+(o.cover?1:0)+o.photos.length,0)}
  }catch(e){state.running=false;state.error=String(e?.message||e);throw e}
 }
 // «Удалить с сайта» one object (the engineer, 10.11.2026 «также сделай удалить с сайта кнопку»): the rest stay as they are.
 async function remove({rids}={}){
  requireAdmin();if(state.running)throw Error("Идёт отправка — подождите");
  const want=new Set((Array.isArray(rids)?rids:[]).map(Number).filter(n=>Number.isInteger(n)&&n>0));
  let removed=0;for(const r of await current())if(want.has(Number(r.rid))){await account.api(`/api/collections/${COLL}/records/${r.id}`,{method:"DELETE"});removed++}
  return{removed}
 }
 return{info,publish,status,remove}
}

module.exports={createSiteObjects,clean,MAX_PHOTOS};
