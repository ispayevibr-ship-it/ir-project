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

// A password the person can type from a letter: no look-alike letters (0/O, 1/l/I), 14 signs, letters and digits.
function generatePassword(n=14){
 const abc="abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
 for(;;){
  const bytes=crypto.randomBytes(n*2);let s="";
  for(const b of bytes){if(b<abc.length*4)s+=abc[b%abc.length];if(s.length===n)break}
  if(s.length===n&&/[a-z]/.test(s)&&/[A-Z]/.test(s)&&/\d/.test(s))return s
 }
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
 const person=r=>r?{id:r.id,email:r.email||"",name:r.full_name||"",role:r.role||"guest",roleName:ROLES[r.role]||ROLES.guest,verified:Boolean(r.verified),created:r.created||""}:null;

 async function api(p,{method="GET",body,auth=true}={}){
  const headers={"content-type":"application/json"};
  if(auth){const t=token();if(!t)throw Error("Войдите в программу (почта и пароль)");headers.Authorization=t}
  let res;
  try{res=await fetch(server()+p,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)})}
  catch(e){throw Error("Нет связи с сервером "+server().replace(/^https?:\/\//,"")+" — проверьте интернет")}
  const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
  if(!res.ok){
   if(res.status===401&&auth){const d=load();delete d.token;store(d)}
   const e=Error(explain(res.status,data));e.status=res.status;e.data=data;throw e
  }
  return data
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
   checkedAt:d.checkedAt||"",adminTrusted:isAdmin(),roles:ROLES,sections:SECTIONS.map(({key,name})=>({key,name})),mailReady:Boolean(mail?.info?.().ready)}
 }
 async function login({email,password}={}){
  const identity=String(email||"").trim().toLowerCase();
  if(!EMAIL.test(identity))throw Error("Введите почту");if(!password)throw Error("Введите пароль");
  const r=await api("/api/collections/users/auth-with-password",{method:"POST",auth:false,body:{identity,password:String(password)}});
  store({...load(),server:server(),token:secret(r.token),user:person(r.record),lastEmail:identity,checkedAt:new Date().toISOString()});
  void heartbeat();
  return info()
 }
 // At the start and every so often: the token is renewed, the role is taken fresh (the administrator may have changed
 // it). No network — the last known sign-in stays (the work goes on without the server).
 async function refresh(){
  if(!load().token)return info();
  try{const r=await api("/api/collections/users/auth-refresh",{method:"POST"});
   store({...load(),token:secret(r.token),user:person(r.record),checkedAt:new Date().toISOString()})}
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

 // ---- the administrator's panel ----
 async function people(){
  requireAdmin();
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
 async function letter({email,name,role,password,grants,again}){
  const from=load().user;
  const text=[
   (name?"Здравствуйте, "+name+"!":"Здравствуйте!"),"",
   again?"Вам выдан новый пароль для входа в программу IR Project.":"Вам открыт доступ в программу IR Project (ТОО «А-Темир Строй»)"+(from?.name?", доступ выдал администратор "+from.name:"")+".","",
   "Логин: "+email,"Пароль: "+password,"Роль: "+(ROLES[role]||ROLES.guest),"",
   ...(grants&&grants.length?["Доступ:",objectNames(grants),""]:[]),
   "Как войти: откройте IR Project, нажмите на профиль вверху справа → «Войти», введите почту и пароль.",
   "Пароль можно сменить там же: профиль → «Сменить пароль».","",
   "Это письмо отправлено программой IR Project. Не пересылайте его — в нём ваш пароль."].join("\n");
  try{await mail.send({to:email,subject:again?"IR Project: новый пароль":"IR Project: доступ в программу",text,noCopy:true});return{mailed:true}}
  catch(e){return{mailed:false,mailError:String(e?.message||e)}}
 }
 async function invite({email,name,role,grants}={}){
  requireAdmin();
  const address=String(email||"").trim().toLowerCase();if(!EMAIL.test(address))throw Error("Неверный адрес почты");
  const r=ROLES[role]?role:"foreman",password=generatePassword();
  const u=await api("/api/collections/users/records",{method:"POST",body:{email:address,emailVisibility:true,verified:true,password,passwordConfirm:password,role:r,full_name:String(name||"").trim().slice(0,200)}});
  if(r!=="admin")await writeGrants(u.id,grants);
  const sent=await letter({email:address,name:String(name||"").trim(),role:r,password,grants:r==="admin"?[]:grants});
  // the password is shown to the administrator only when the letter did not go — to pass it on himself
  return{person:person(u),...sent,...(sent.mailed?{}:{password})}
 }
 async function update({id,name,role,grants}={}){
  requireAdmin();if(!id)throw Error("Не выбран человек");
  if(id===load().user?.id&&role&&role!=="admin")throw Error("Себе роль администратора не снимайте — иначе панель закроется");
  const body={};if(name!==undefined)body.full_name=String(name||"").trim().slice(0,200);if(ROLES[role])body.role=role;
  const u=Object.keys(body).length?await api(`/api/collections/users/records/${id}`,{method:"PATCH",body}):null;
  if(grants!==undefined)await writeGrants(id,(u?.role||role)==="admin"?[]:grants);
  return{ok:true}
 }
 async function resetPassword({id}={}){
  requireAdmin();if(!id)throw Error("Не выбран человек");
  if(id===load().user?.id)throw Error("Свой пароль меняйте через «Сменить пароль»");
  const password=generatePassword();
  const u=await api(`/api/collections/users/records/${id}`,{method:"PATCH",body:{password,passwordConfirm:password}});
  const sent=await letter({email:u.email,name:u.full_name,role:u.role,password,again:true});
  return{...sent,...(sent.mailed?{}:{password})}
 }
 async function remove({id}={}){
  requireAdmin();if(!id)throw Error("Не выбран человек");if(id===load().user?.id)throw Error("Себя удалить нельзя");
  await api(`/api/collections/users/records/${id}`,{method:"DELETE"});return{ok:true}
 }
 return{info,login,refresh,logout,changePassword,setName,people,invite,update,resetPassword,remove,heartbeat,isAdmin,api}
}

module.exports={createServerAccount,generatePassword,explain,SECTIONS,ROLES,SERVER};
