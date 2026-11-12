"use strict";
/*
 * IR Project: the sign-in to the company's server (https://a-ts.kz, PocketBase) and the administrator's panel
 * (the engineer, 09.11.2026: «в программе создай панель администратора и вход, если вхожу под логином и паролем
 * администратора, открывается панель администратора, в которой я могу раздавать права другим, например Дать доступ
 * инженеру, прописываю почту, он получает уведомление на почту Доступ в программу логин - почта, пароль - генерация
 * (потом может поменять)»).
 * The login is the e-mail; the server keeps who is who (role) and what each one sees (collection `access`: a row per
 * object and section, section "" — the whole object; server/pb_migrations). The server itself checks every request:
 * this module only asks. The token is kept on this computer encrypted (safeStorage); a password is never written down.
 * An invitation goes by the program's own mail (Settings → «Почта», src/mail-smtp.js).
 */
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");

const SERVER="https://a-ts.kz";
const ROLES={admin:"Администратор",pto:"Инженер ПТО",foreman:"Прораб",guest:"Гость (только просмотр)"};
// The sections of an object as the engineer sees them, and the rows of the database behind each (one row of `access`
// per section_key — the server compares the names exactly).
const SECTIONS=[
 {key:"reports",name:"Ежедневные отчёты",keys:["reports"]},
 {key:"work-types",name:"Виды работ",keys:["work-types"]},
 {key:"marks",name:"Ведомость марок",keys:["marks"]},
 {key:"deliveries",name:"Поставки",keys:["deliveries"]},
 {key:"schedule",name:"График работ",keys:["schedule"]},
 {key:"photos",name:"Фотографии объекта",keys:["photos"]},
 {key:"scheme",name:"Монтажная схема и ИИ-распознавание",keys:["scheme","ai-scheme-draft","ai-documents","ai-recognition","ai-project-kb","ai-project-log"]},
 {key:"executive-docs",name:"Исполнительная документация",keys:["executive-docs"]},
 {key:"letters",name:"Исходящие письма",keys:["letters"]},
 {key:"acted-days",name:"Актированные дни",keys:["acted-days"]},
 {key:"penalties",name:"Штрафы",keys:["penalties"]},
 {key:"finance",name:"Финансы",keys:["finance"]},
];
const EMAIL=/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

// ---- роли и права (просьба инженера 12.11.2026 «сделай систему прав настройки прямо в программе, чтобы администратор
// решал кому какие права и название Администратор, Инженер и тд тоже мог менять») ----
// Роль — название и права: по каждому разделу объекта «изменяет» / «только просмотр» / «скрыт» и действия (заводить
// объекты, удалять, выгружать отчёт). Четыре встроенные роли (их можно переименовать, у администратора права все и
// не меняются) и свои роли администратора. Хранится на сервере в коллекции meta (ключ "roles_config": читают все
// вошедшие, пишет только администратор — pb_migrations/1762690000_ir_access.js), кто какую роль носит — там же (people).
// Сервер по-прежнему проверяет каждый запрос по своему уровню users.role (admin / pto / foreman / guest) и по доступу
// к объектам (`access`); уровень человека программа ставит сама по правам его роли (levelOf), без перестройки сервера.
const ROLE_ACTIONS=[
 {key:"create",name:"Заводить новые объекты"},
 {key:"delete",name:"Удалять объекты"},
 {key:"export",name:"Выгружать отчёт и схему, делиться ссылкой"},
];
const ROLE_LEVELS=["edit","view","none"];
const ROLES_KEY="roles_config",ROLES_RID=2,ROLES_MAX=20;
function defaultRoles(){
 const all=v=>Object.fromEntries(SECTIONS.map(s=>[s.key,v]));
 return[
  {id:"admin",name:"Администратор",fixed:true,sections:all("edit"),actions:{create:true,delete:true,export:true}},
  {id:"pto",name:"Инженер ПТО",sections:all("edit"),actions:{create:true,delete:true,export:true}},
  {id:"foreman",name:"Прораб",sections:all("edit"),actions:{create:false,delete:true,export:true}},
  {id:"guest",name:"Гость",sections:all("view"),actions:{create:false,delete:false,export:true}},
 ]
}
// Приводит сохранённое к порядку: встроенные роли всегда есть, у администратора все права, лишнее отбрасывается.
function normalizeRoles(cfg){
 const src=cfg&&typeof cfg==="object"?cfg:{};
 const saved=Array.isArray(src.roles)?src.roles:[];
 const clean=(r,base)=>{
  const name=String(r?.name??base?.name??"").replace(/\s+/g," ").trim().slice(0,60)||base?.name||"Роль";
  const sections={},actions={};
  for(const s of SECTIONS){const v=r?.sections?.[s.key];sections[s.key]=ROLE_LEVELS.includes(v)?v:(base?.sections?.[s.key]||"view")}
  for(const a of ROLE_ACTIONS){const v=r?.actions?.[a.key];actions[a.key]=typeof v==="boolean"?v:Boolean(base?.actions?.[a.key])}
  return{name,sections,actions}
 };
 const roles=defaultRoles().map(d=>{const r=saved.find(x=>x&&x.id===d.id);const c=clean(r,d);
  return d.fixed?{...d,name:c.name}:{id:d.id,builtin:true,...c}});
 for(const r of saved){
  if(roles.length>=ROLES_MAX)break;
  const id=String(r?.id||"");if(!/^r[a-z0-9]{3,20}$/.test(id)||roles.some(x=>x.id===id))continue;
  roles.push({id,...clean(r,{name:"Роль",sections:Object.fromEntries(SECTIONS.map(s=>[s.key,"view"])),actions:{}})})
 }
 roles.forEach(r=>{r.level=levelOf(r)});
 const people={};
 if(src.people&&typeof src.people==="object")for(const [u,rid] of Object.entries(src.people))
  if(/^[a-z0-9]{5,30}$/i.test(u)&&roles.some(r=>r.id===rid))people[u]=rid;
 return{roles,people}
}
// Уровень на сервере по правам роли: администратор; может заводить объекты — pto; что-то изменяет — foreman; иначе гость.
function levelOf(r){
 if(r.id==="admin")return"admin";
 if(r.actions?.create)return"pto";
 if(SECTIONS.some(s=>r.sections?.[s.key]==="edit"))return"foreman";
 return"guest"
}

// A password the person can type from a letter: no look-alike letters (0/O, 1/l/I), 14 signs, letters and digits.
function generatePassword(n=14){
 const abc="abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
 for(;;){
  const bytes=crypto.randomBytes(n*2);let s="";
  for(const b of bytes){if(b<abc.length*4)s+=abc[b%abc.length];if(s.length===n)break}
  if(s.length===n&&/[a-z]/.test(s)&&/[A-Z]/.test(s)&&/\d/.test(s))return s
 }
}

// The letters to a person: the default text (neutral, the administrator changes it in the panel → «Шаблон письма»).
const LETTER_FIELDS=[["имя","имя человека (пусто, если не указано)"],["почта","почта — логин"],["пароль","пароль — обязательно"],
 ["роль","роль в программе"],["объекты","список объектов и разделов"],["сайт","адрес сервера компании"],["администратор","кто выдал доступ"]];
const LETTERS={
 invite:{subject:"IR Project: доступ в программу",text:["Здравствуйте, {имя}!","","Вам открыт доступ в программу IR Project. Доступ выдал администратор {администратор}.","",
  "Логин: {почта}","Пароль: {пароль}","Роль: {роль}","","Доступ:","{объекты}","",
  "Как войти: откройте IR Project, нажмите на профиль вверху справа → «Войти», введите почту и пароль.",
  "Пароль можно сменить там же: профиль → «Сменить пароль».","","Это письмо отправлено программой IR Project. Не пересылайте его — в нём ваш пароль."].join("\n")},
 again:{subject:"IR Project: новый пароль",text:["Здравствуйте, {имя}!","","Вам выдан новый пароль для входа в программу IR Project.","",
  "Логин: {почта}","Пароль: {пароль}","Роль: {роль}","",
  "Как войти: откройте IR Project, нажмите на профиль вверху справа → «Войти», введите почту и пароль.",
  "Пароль можно сменить там же: профиль → «Сменить пароль».","","Это письмо отправлено программой IR Project. Не пересылайте его — в нём ваш пароль."].join("\n")}
};
// Fills {поле}; an empty field takes away what is left hanging: «Здравствуйте, !» → «Здравствуйте!», a line «Доступ:» before an
// empty list, a sentence about an empty administrator.
function fill(t,v){
 const E="\u0000",lines=String(t||"").replace(/\{([а-яё]+)\}/gi,(m,k)=>{k=k.toLowerCase();
  return Object.prototype.hasOwnProperty.call(v,k)?(String(v[k]??"").trim()||E):m}).split("\n");
 const out=[];
 for(let i=0;i<lines.length;i++){
  let l=lines[i].replace(new RegExp(",\\s*"+E+"(?=\\s*[!.?,])","g"),"");
  if(l.includes(E)){
   if(!l.replace(new RegExp(E,"g"),"").trim()){if(out.length&&/:\s*$/.test(out[out.length-1]))out.pop();continue}
   l=l.replace(new RegExp("[^.!?]*"+E+"[^.!?]*[.!?]?\\s*","g"),"").trimEnd();if(!l.trim())continue
  }
  out.push(l)
 }
 return out.join("\n").replace(/\n{3,}/g,"\n\n").trim()
}

// The server's answer in words the engineer understands.
function explain(status,body,fallback){
 const fields=body&&body.data&&typeof body.data==="object"?body.data:{};
 if(fields.email?.code==="validation_not_unique")return"Человек с этой почтой уже есть";
 if(fields.email)return"Неверный адрес почты";
 if(fields.oldPassword)return"Старый пароль введён неверно";
 if(fields.password)return"Пароль не подходит: не короче 8 знаков";
 if(fields.passwordConfirm)return"Пароли не совпадают";
 if(status===400&&/authenticate/i.test(String(body?.message||"")))return"Неверная почта или пароль";
 if(status===401)return"Вход истёк — войдите снова";
 if(status===403)return"Нет прав: это может только администратор";
 if(status===404)return"Не найдено на сервере (или нет прав)";
 if(status===429)return"Слишком много попыток — подождите минуту";
 return fallback||("Сервер ответил: "+(body?.message||status))
}

function createServerAccount({getUserDataPath,safeStorage,fetch,mail,objects,appVersion,machine,timers=true}){
 const file=()=>path.join(getUserDataPath(),"server-account.json");
 const load=()=>{try{return JSON.parse(fs.readFileSync(file(),"utf8"))||{}}catch{return{}}};
 const store=v=>{fs.mkdirSync(path.dirname(file()),{recursive:true});fs.writeFileSync(file(),JSON.stringify(v,null,1),"utf8")};
 const secret=v=>{if(!v)return"";if(safeStorage?.isEncryptionAvailable?.())return"enc:"+safeStorage.encryptString(String(v)).toString("base64");return"b64:"+Buffer.from(String(v)).toString("base64")};
 const reveal=v=>{const s=String(v||"");try{if(s.startsWith("enc:"))return safeStorage.decryptString(Buffer.from(s.slice(4),"base64"));if(s.startsWith("b64:"))return Buffer.from(s.slice(4),"base64").toString("utf8")}catch{}return""};
 const server=()=>String(load().server||SERVER).replace(/\/+$/,"");
 const token=()=>reveal(load().token);
 const roleConfig=()=>normalizeRoles(load().roles);
 // Роль человека: назначенная администратором (people), иначе встроенная по уровню сервера. Если уровень сервера
 // не совпадает с ролью (роль поменяли с другого компьютера) — права не выше уровня сервера.
 function roleOf(userId,level,cfg=roleConfig()){
  const lv=["admin","pto","foreman","guest"].includes(level)?level:"guest";
  let r=cfg.roles.find(x=>x.id===cfg.people[userId]);
  if(!r||(lv==="admin")!==(r.id==="admin"))r=cfg.roles.find(x=>x.id===lv);
  return r
 }
 function permsOf(r,level){
  const sections={...r.sections},actions={...r.actions};
  if(level==="guest"){for(const k in sections)if(sections[k]==="edit")sections[k]="view";actions.create=false;actions.delete=false}
  if(level==="foreman")actions.create=false;
  return{role:r.id,name:r.name,sections,actions}
 }
 const person=r=>{if(!r)return null;const lv=r.role||"guest",ro=roleOf(r.id,lv);
  return{id:r.id,email:r.email||"",name:r.full_name||"",role:lv,roleId:ro.id,roleName:ro.name,perms:permsOf(ro,lv),verified:Boolean(r.verified),created:r.created||""}};

 async function api(p,{method="GET",body,auth=true}={}){
  const headers={"content-type":"application/json"};
  if(auth){const t=token();if(!t)throw Error("Войдите в программу (почта и пароль)");headers.Authorization=t}
  let res;
  try{res=await fetch(server()+p,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)})}
  catch(e){throw Error("Нет связи с сервером — проверьте интернет")}
  const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
  if(!res.ok){
   if(res.status===401&&auth){const d=load();delete d.token;store(d)}
   const e=Error(explain(res.status,data));e.status=res.status;e.data=data;throw e
  }
  return data
 }
 // Files on the server (the photos of the objects — server-sync.js): sending as a form with the file, taking back
 // through a short file token (works for protected and open file fields alike).
 // `extra`: more files of other fields [{field,name,buffer}] (a chat message to the administrator with its pictures).
 // `collection` may be "<name>/records/<id>" with method "PATCH": a record's file replaced (a report by a link).
 async function upload(collection,fields,name,buffer,extra=[],method="POST"){
  const t=token();if(!t)throw Error("Войдите в программу (почта и пароль)");
  const form=new FormData();for(const [k,v] of Object.entries(fields||{}))form.append(k,typeof v==="object"&&v!==null?JSON.stringify(v):String(v));
  if(buffer)form.append("file",new Blob([buffer]),name);
  for(const f of extra||[])form.append(f.field,new Blob([f.buffer],{type:f.type||"application/octet-stream"}),f.name);
  let res;
  try{res=await fetch(server()+`/api/collections/${/\/records\//.test(collection)?collection:collection+"/records"}`,{method:method==="PATCH"?"PATCH":"POST",headers:{Authorization:t},body:form,signal:AbortSignal.timeout(300000)})}
  catch(e){throw Error("Нет связи с сервером — проверьте интернет")}
  const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
  if(!res.ok){const e=Error(explain(res.status,data));e.status=res.status;e.data=data;throw e}
  return data
 }
 // A request with a form (files and fields — the objects of the site, src/site-objects.js), any method.
 async function form(method,p,body,timeout=300000){
  const t=token();if(!t)throw Error("Войдите в программу (почта и пароль)");
  let res;
  try{res=await fetch(server()+p,{method,headers:{Authorization:t},body,signal:AbortSignal.timeout(timeout)})}
  catch(e){throw Error("Нет связи с сервером — проверьте интернет")}
  const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
  if(!res.ok){const e=Error(explain(res.status,data));e.status=res.status;e.data=data;throw e}
  return data
 }
 async function download(collection,id,name){
  const ft=await api("/api/files/token",{method:"POST"});
  let res;
  try{res=await fetch(server()+`/api/files/${collection}/${id}/${encodeURIComponent(name)}?token=${encodeURIComponent(ft?.token||"")}`,{headers:{Authorization:token()},signal:AbortSignal.timeout(120000)})}
  catch(e){throw Error("Нет связи с сервером — проверьте интернет")}
  if(!res.ok){const e=Error("Сервер не отдал файл: "+res.status);e.status=res.status;throw e}
  return Buffer.from(await res.arrayBuffer())
 }
 const list=async(collection,query="")=>{
  const out=[];
  for(let page=1;page<50;page++){
   const r=await api(`/api/collections/${collection}/records?perPage=500&page=${page}${query?"&"+query:""}`);
   out.push(...(r?.items||[]));if(!r||page>=r.totalPages)break
  }
  return out
 };
 const requireAdmin=()=>{if(load().user?.role!=="admin")throw Error("Это может только администратор")};

 // What the window shows: who is signed in (without the token).
 function info(){
  const d=load();
  return{server:server(),signedIn:Boolean(d.token&&d.user),user:d.user||null,lastEmail:d.lastEmail||d.user?.email||"",
   checkedAt:d.checkedAt||"",adminTrusted:isAdmin(),roles:Object.fromEntries(roleConfig().roles.map(r=>[r.id,r.name])),roleList:roleConfig().roles.map(r=>({id:r.id,name:r.name,level:r.level})),sections:SECTIONS.map(({key,name})=>({key,name})),mailReady:Boolean(mail?.info?.().ready)}
 }
 async function login({email,password}={}){
  const identity=String(email||"").trim().toLowerCase();
  if(!EMAIL.test(identity))throw Error("Введите почту");if(!password)throw Error("Введите пароль");
  const r=await api("/api/collections/users/auth-with-password",{method:"POST",auth:false,body:{identity,password:String(password)}});
  store({...load(),server:server(),token:secret(r.token),user:person(r.record),lastEmail:identity,checkedAt:new Date().toISOString()});
  await pullRoles().catch(()=>{});store({...load(),user:person(r.record)});
  void heartbeat();
  return info()
 }
 // At the start and every so often: the token is renewed, the role is taken fresh (the administrator may have changed
 // it). No network — the last known sign-in stays (the work goes on without the server).
 async function refresh(){
  if(!load().token)return info();
  try{const r=await api("/api/collections/users/auth-refresh",{method:"POST"});
   store({...load(),token:secret(r.token)});await pullRoles().catch(()=>{});
   store({...load(),user:person(r.record),checkedAt:new Date().toISOString()})}
  catch(e){if(e.status===401||e.status===404){const d=load();delete d.token;delete d.user;store(d)}else return{...info(),offline:e.message}}
  return info()
 }
 // The administrator signed in to the server is the administrator of this computer too: the old password of the
 // administrator (Claude key, GitHub key, «Отправка в хранилище») is no longer asked (the engineer, 09.11.2026
 // «в отправке репозитория просит пароль администратора»). The sign-in is renewed with the server every 30 minutes,
 // a person removed or no longer administrator loses it at the next check.
 function isAdmin(){const d=load();return Boolean(d.user?.role==="admin"&&reveal(d.token))}
 function logout(){const d=load();delete d.token;delete d.user;store(d);return info()}
 async function changePassword({oldPassword,password}={}){
  const d=load();if(!d.user)throw Error("Войдите в программу");
  if(String(password||"").length<8)throw Error("Новый пароль — не короче 8 знаков");
  await api(`/api/collections/users/records/${d.user.id}`,{method:"PATCH",body:{oldPassword:String(oldPassword||""),password:String(password),passwordConfirm:String(password)}});
  // the server ends every sign-in of this person after a new password — sign in again with it
  return login({email:d.user.email,password})
 }
 async function setName({name}={}){
  const d=load();if(!d.user)throw Error("Войдите в программу");
  const r=await api(`/api/collections/users/records/${d.user.id}`,{method:"PATCH",body:{full_name:String(name||"").trim().slice(0,200)}});
  store({...load(),user:person(r)});return info()
 }

 // «Кто сейчас в программе» (the engineer, 09.11.2026 «Сделать проверку подключения, кто сейчас подключен из добавленных»):
 // every computer keeps its row in `devices` (one per person and computer — later its range of row numbers for the sync)
 // and touches it every 2 minutes while the program is open; the server's `updated` is the last time it was seen.
 const machineName=()=>{try{return String(machine?.()||require("node:os").hostname()||"ПК").slice(0,200)}catch{return"ПК"}};
 let beating=null;
 function heartbeat(){if(!beating)beating=beat().finally(()=>{beating=null});return beating}
 async function beat(){
  const d=load();if(!d.token||!d.user)return false;
  try{
   const body={machine:machineName(),name:("IR Project "+(appVersion?.()||"")).trim().slice(0,200)};
   const key=d.user.id+"|"+body.machine;
   let id=d.devices?.[key];
   if(id){try{await api(`/api/collections/devices/records/${id}`,{method:"PATCH",body});return true}catch(e){if(e.status!==404)throw e;id=null}}
   const mine=(await list("devices",`filter=${encodeURIComponent(`author='${d.user.id}' && machine='${body.machine.replace(/'/g,"")}'`)}`))[0];
   if(mine){id=mine.id;await api(`/api/collections/devices/records/${id}`,{method:"PATCH",body})}
   else for(let i=0;i<5&&!id;i++){
    const top=await api("/api/collections/devices/records?perPage=1&sort=-rid");
    const rid=(top?.items?.[0]?.rid||0)+1+i;
    try{id=(await api("/api/collections/devices/records",{method:"POST",body:{...body,rid}})).id}catch(e){if(e.status!==400)throw e}
   }
   if(id)store({...load(),devices:{...(load().devices||{}),[key]:id}});
   return Boolean(id)
  }catch(e){return false}
 }
 if(timers){const t=setInterval(()=>void heartbeat(),120e3);t.unref?.();setTimeout(()=>void heartbeat(),5e3).unref?.()}
 const ONLINE_MS=5*60e3;

 // ---- роли: с сервера и на сервер ----
 async function rolesRecord(){
  const r=await api(`/api/collections/meta/records?perPage=1&filter=${encodeURIComponent(`key="${ROLES_KEY}"`)}`);
  return r?.items?.[0]||null
 }
 async function pullRoles(){
  const it=await rolesRecord();
  const row=it&&!it.deleted&&it.row&&typeof it.row==="object"?it.row:null;
  store({...load(),roles:row});restamp();return row
 }
 // своя запись (имя роли и права) — по новым ролям
 function restamp(){const d=load(),u=d.user;if(!u)return;store({...d,user:person({id:u.id,email:u.email,full_name:u.name,role:u.role,verified:u.verified,created:u.created})})}
 async function pushRoles(cfg){
  const row={roles:cfg.roles.map(r=>r.id==="admin"?{id:r.id,name:r.name}:{id:r.id,name:r.name,sections:r.sections,actions:r.actions}),people:cfg.people,at:new Date().toISOString()};
  const it=await rolesRecord();
  if(it)await api(`/api/collections/meta/records/${it.id}`,{method:"PATCH",body:{row,deleted:false}});
  else await api("/api/collections/meta/records",{method:"POST",body:{rid:ROLES_RID,key:ROLES_KEY,row,device:0}});
  store({...load(),roles:row});restamp()
 }
 // Окно «Роли и права»: роли, разделы и действия.
 async function rolesGet(){
  requireAdmin();await pullRoles().catch(()=>{});
  const cfg=roleConfig();
  return{roles:cfg.roles,sections:SECTIONS.map(({key,name})=>({key,name})),actions:ROLE_ACTIONS,
   counts:Object.fromEntries(cfg.roles.map(r=>[r.id,0]))}
 }
 // Сохранить роли; у людей с изменённой ролью уровень на сервере ставится по новым правам.
 async function rolesSet({roles}={}){
  requireAdmin();
  if(!Array.isArray(roles))throw Error("Нет ролей");
  await pullRoles().catch(()=>{});
  const before=roleConfig();
  const names=new Set();
  for(const r of roles){const n=String(r?.name||"").replace(/\s+/g," ").trim().toLowerCase();if(!n)throw Error("У каждой роли должно быть название");if(names.has(n))throw Error("Две роли с одним названием: «"+r.name+"»");names.add(n)}
  const keep=roles.map(r=>String(r?.id||"")).filter(Boolean);
  const users=await list("users","sort=email");
  const holder=u=>roleOf(u.id,u.role,before).id;
  const gone=before.roles.filter(r=>!r.builtin&&!r.fixed&&!keep.includes(r.id));
  for(const g of gone){const who=users.filter(u=>holder(u)===g.id);if(who.length)throw Error("Роль «"+g.name+"» носят: "+who.map(u=>u.full_name||u.email).join(", ")+". Сначала дайте им другую роль.")}
  const next=normalizeRoles({roles:roles.map(r=>({...r,id:/^r[a-z0-9]{3,20}$/.test(String(r?.id||""))||before.roles.some(x=>x.id===r?.id)?r.id:"r"+crypto.randomBytes(5).toString("hex")})),people:before.people});
  // кто носит роль — у того уровень сервера по её правам
  const changed=[];
  for(const u of users){
   const rid=holder(u),r=next.roles.find(x=>x.id===rid);if(!r)continue;
   if(rid!=="admin"){if(rid!==r.level)next.people[u.id]=rid;else delete next.people[u.id]}
   if(r.level!==u.role&&u.role!=="admin"&&r.id!=="admin"){await api(`/api/collections/users/records/${u.id}`,{method:"PATCH",body:{role:r.level}});changed.push(u.full_name||u.email)}
  }
  await pushRoles(next);
  return{ok:true,changed,roles:next.roles}
 }
 // Роль человеку: уровень сервера по её правам, сама роль — в people.
 async function assignRole(userId,roleId){
  const cfg=roleConfig(),r=cfg.roles.find(x=>x.id===roleId);if(!r)throw Error("Нет такой роли");
  const people={...cfg.people};if(r.id===r.level)delete people[userId];else people[userId]=r.id;
  if(JSON.stringify(people)!==JSON.stringify(cfg.people))await pushRoles({...cfg,people});
  return r.level
 }

 // ---- the administrator's panel ----
 async function people(){
  requireAdmin();
  await pullRoles().catch(()=>{});
  const [users,rows,devs]=await Promise.all([list("users","sort=email"),list("access"),list("devices").catch(()=>[])]);
  const by={};for(const a of rows)(by[a.user]||(by[a.user]=[])).push(a);
  const seen={};for(const v of devs){const at=Date.parse(String(v.updated||"").replace(" ","T"));if(!v.author||!at)continue;
   const s=seen[v.author]||(seen[v.author]={lastSeen:0,machines:[]});if(at>s.lastSeen)s.lastSeen=at;
   if(Date.now()-at<ONLINE_MS)s.machines.push(v.machine||"ПК")}
  return users.map(u=>{const s=seen[u.id];return{...person(u),grants:grantsOf(by[u.id]||[]),
   online:Boolean(s?.machines.length),onlineOn:s?.machines||[],lastSeen:s?.lastSeen?new Date(s.lastSeen).toISOString():""}})
 }
 // The rows of `access` → per object: whole or by sections, may change or only view.
 function grantsOf(rows){
  const objs={};
  for(const a of rows){
   const g=objs[a.object_rid]||(objs[a.object_rid]={objectId:a.object_rid,whole:false,sections:[],canEdit:false});
   if(!a.section_key)g.whole=true;
   else{const s=SECTIONS.find(x=>x.keys.includes(a.section_key));if(s&&!g.sections.includes(s.key))g.sections.push(s.key)}
   if(a.can_edit)g.canEdit=true
  }
  for(const g of Object.values(objs))if(g.whole)g.sections=[];
  return Object.values(objs)
 }
 // The wanted grants → the rows of `access` (object, section_key, can_edit).
 function rowsOf(grants){
  const out=new Map();
  for(const g of Array.isArray(grants)?grants:[]){
   const id=Number(g?.objectId);if(!Number.isInteger(id)||id<=0)continue;
   const canEdit=g.canEdit===true;
   // with chosen sections the card of the object itself (status, cover, the people of the object — «object-meta») goes too
   const keys=g.whole!==false&&!(Array.isArray(g.sections)&&g.sections.length)?[""]:
    ["object-meta",...SECTIONS.filter(s=>g.sections.includes(s.key)).flatMap(s=>s.keys)];
   for(const k of keys)out.set(id+"|"+k,{object_rid:id,section_key:k,can_edit:canEdit})
  }
  return out
 }
 async function writeGrants(userId,grants){
  const want=rowsOf(grants),have=await list("access",`filter=${encodeURIComponent(`user='${userId}'`)}`);
  for(const a of have){
   const k=a.object_rid+"|"+(a.section_key||""),w=want.get(k);
   if(!w)await api(`/api/collections/access/records/${a.id}`,{method:"DELETE"});
   else{if(Boolean(a.can_edit)!==w.can_edit)await api(`/api/collections/access/records/${a.id}`,{method:"PATCH",body:{can_edit:w.can_edit}});want.delete(k)}
  }
  for(const w of want.values())await api("/api/collections/access/records",{method:"POST",body:{user:userId,...w}})
 }
 const objectNames=grants=>{
  let all=[];try{all=objects?.()||[]}catch{}
  return grants.map(g=>{const o=all.find(x=>Number(x.id)===Number(g.objectId));const name=o?o.name:"объект №"+g.objectId;
   const what=g.whole!==false&&!(g.sections||[]).length?"весь объект":SECTIONS.filter(s=>(g.sections||[]).includes(s.key)).map(s=>s.name).join(", ");
   return"• "+name+" — "+what+(g.canEdit?" (просмотр и изменение)":" (только просмотр)")}).join("\n")
 };
 // The letter is the administrator's own template (the engineer, 10.11.2026 «письмо инженеру шаблон где поменять? сделай
 // возможность редактирования»): kept on this computer in server-account.json, fields in braces are filled for each person.
 async function letter({email,name,role,roleName,password,grants,again,to}){
  const from=load().user,t=template()[again?"again":"invite"];
  const v={"имя":name||"","почта":email,"пароль":password,"роль":roleName||roleConfig().roles.find(x=>x.id===role)?.name||ROLES[role]||ROLES.guest,"сайт":server(),
   "объекты":grants&&grants.length?objectNames(grants):"","администратор":from?.name||from?.email||""};
  try{await mail.send({to:to||email,subject:fill(t.subject,v),text:fill(t.text,v),noCopy:true});return{mailed:true}}
  catch(e){return{mailed:false,mailError:String(e?.message||e)}}
 }
 const template=()=>{const own=load().letters||{};const out={};
  for(const k of Object.keys(LETTERS))out[k]={subject:own[k]?.subject||LETTERS[k].subject,text:own[k]?.text||LETTERS[k].text,own:Boolean(own[k])};
  return out};
 function letterTemplate(){requireAdmin();return{templates:template(),defaults:LETTERS,fields:LETTER_FIELDS}}
 function setLetterTemplate({kind,subject,text,reset}={}){
  requireAdmin();if(!LETTERS[kind])throw Error("Неизвестное письмо");
  const d=load(),own={...(d.letters||{})};
  if(reset)delete own[kind];
  else{
   subject=String(subject||"").trim().slice(0,300);text=String(text||"").replace(/\r\n/g,"\n").trim().slice(0,20000);
   if(!subject)throw Error("Впишите тему письма");
   for(const f of["почта","пароль"])if(!text.includes("{"+f+"}"))throw Error("В тексте нужно поле {"+f+"} — без него человек не узнает, как войти");
   own[kind]={subject,text}
  }
  store({...d,letters:own});return letterTemplate()
 }
 function previewLetter({kind,subject,text}={}){
  const t=template()[kind]||template().invite,from=load().user;
  const v={"имя":"Иванов Иван","почта":"name@site.kz","пароль":"Пример7Пароль","роль":ROLES.pto,"сайт":server(),
   "объекты":"• Объект для примера — весь объект (просмотр и изменение)","администратор":from?.name||from?.email||""};
  return{subject:fill(subject??t.subject,v),text:fill(text??t.text,v)}
 }
 async function testLetter({kind,subject,text}={}){
  requireAdmin();const me=load().user;if(!me?.email)throw Error("Войдите в программу");
  const p=previewLetter({kind,subject,text});
  try{await mail.send({to:me.email,subject:"Проверка: "+p.subject,text:p.text,noCopy:true});return{mailed:true,to:me.email}}
  catch(e){throw Error("Письмо не ушло: "+String(e?.message||e))}
 }
 async function invite({email,name,role,grants}={}){
  requireAdmin();
  const address=String(email||"").trim().toLowerCase();if(!EMAIL.test(address))throw Error("Неверный адрес почты");
  await pullRoles().catch(()=>{});
  const cfg=roleConfig(),ro=cfg.roles.find(x=>x.id===role)||cfg.roles.find(x=>x.id==="foreman"),r=ro.level,password=generatePassword();
  const u=await api("/api/collections/users/records",{method:"POST",body:{email:address,emailVisibility:true,verified:true,password,passwordConfirm:password,role:r,full_name:String(name||"").trim().slice(0,200)}});
  await assignRole(u.id,ro.id);
  if(r!=="admin")await writeGrants(u.id,grants);
  const sent=await letter({email:address,name:String(name||"").trim(),role:r,roleName:ro.name,password,grants:r==="admin"?[]:grants});
  // the password is shown to the administrator only when the letter did not go — to pass it on himself
  return{person:person(u),...sent,...(sent.mailed?{}:{password})}
 }
 async function update({id,name,role,grants}={}){
  requireAdmin();if(!id)throw Error("Не выбран человек");
  if(id===load().user?.id&&role&&role!=="admin")throw Error("Себе роль администратора не снимайте — иначе панель закроется");
  const body={};if(name!==undefined)body.full_name=String(name||"").trim().slice(0,200);
  if(role){await pullRoles().catch(()=>{});if(!roleConfig().roles.some(x=>x.id===role))throw Error("Нет такой роли");body.role=await assignRole(id,role)}
  const u=Object.keys(body).length?await api(`/api/collections/users/records/${id}`,{method:"PATCH",body}):null;
  if(grants!==undefined)await writeGrants(id,(u?.role||role)==="admin"?[]:grants);
  return{ok:true}
 }
 async function resetPassword({id}={}){
  requireAdmin();if(!id)throw Error("Не выбран человек");
  if(id===load().user?.id)throw Error("Свой пароль меняйте через «Сменить пароль»");
  const password=generatePassword();
  const u=await api(`/api/collections/users/records/${id}`,{method:"PATCH",body:{password,passwordConfirm:password}});
  const sent=await letter({email:u.email,name:u.full_name,role:u.role,roleName:roleOf(u.id,u.role).name,password,again:true});
  return{...sent,...(sent.mailed?{}:{password})}
 }
 async function remove({id}={}){
  requireAdmin();if(!id)throw Error("Не выбран человек");if(id===load().user?.id)throw Error("Себя удалить нельзя");
  await api(`/api/collections/users/records/${id}`,{method:"DELETE"});return{ok:true}
 }
 return{info,login,refresh,logout,changePassword,setName,people,rolesGet,rolesSet,pullRoles,invite,update,resetPassword,remove,heartbeat,isAdmin,api,upload,form,download,list,letterTemplate,setLetterTemplate,previewLetter,testLetter}
}

module.exports={createServerAccount,generatePassword,explain,fill,LETTERS,SECTIONS,ROLES,SERVER,ROLE_ACTIONS,defaultRoles,normalizeRoles,levelOf};
