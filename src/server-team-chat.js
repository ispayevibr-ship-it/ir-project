"use strict";
/*
 * IR Project: the shared chat of the company (the engineer, 12.11.2026: «давай сделаем чат общий, в чате возможность
 * писать какому-то определенному сотруднику или всем»; «не хранить сообщения чата больше 3-х месяцев и все»).
 * Through the company's server (server/pb_migrations/1762940000_ir_team_chat.js, pb_hooks/ir_team_chat.pb.js):
 *  - a message to everybody (`to` empty) or to one person; the server gives each person only what they may see;
 *  - the messages of the last 90 days are kept on this computer in userData/team-chat.json (only the text — the files
 *    are taken from the server when opened), older ones go here and on the server (every night);
 *  - read marks per conversation are of this computer: «all» and the id of the other person.
 * The main process asks the server every 20 s for the new messages (the count on the icon, the notification of Windows
 * when the program is behind other windows) and every 3 s while the chat is open.
 */
const fs=require("node:fs"),path=require("node:path");

const KEEP=90*86400e3,FILE_MAX=20*1048576,FILES_MAX=5;
const q=s=>encodeURIComponent(s);
// the server writes «2026-11-12 08:00:00.000Z»
const iso=t=>String(t||"").replace(" ","T");
const srv=t=>new Date(t).toISOString().replace("T"," ");

function createTeamChat({account,getUserDataPath,now=()=>Date.now()}){
 const acc=()=>typeof account==="function"?account():account;
 const file=()=>path.join(getUserDataPath(),"team-chat.json");
 let data=null;
 const load=()=>{if(data)return data;try{data=JSON.parse(fs.readFileSync(file(),"utf8"))||{}}catch{data={}}
  if(!Array.isArray(data.messages))data.messages=[];if(!data.seen||typeof data.seen!=="object")data.seen={};return data};
 const store=()=>{try{fs.mkdirSync(path.dirname(file()),{recursive:true});fs.writeFileSync(file(),JSON.stringify(data),"utf8")}catch{}};
 const me=()=>{try{const i=acc()?.info();return i&&i.signedIn&&i.user?i.user:null}catch{return null}};
 const api=(p,o)=>acc().api(p,o);

 // the messages of another person signed in on this computer are not shown: the cache belongs to one account
 const own=()=>{const d=load(),u=me();if(!u)return null;if(d.user!==u.id){data={user:u.id,messages:[],seen:{},since:""};store()}return data};
 const shape=r=>({id:r.id,author:r.author,name:r.author_name||"",to:r.to||"",text:r.text||"",files:Array.isArray(r.files)?r.files:[],at:iso(r.created)});
 const convOf=(m,uid)=>!m.to?"all":m.author===uid?m.to:m.author;

 let team=null,teamAt=0;
 async function people(){
  if(team&&now()-teamAt<10*60e3)return team;
  try{const r=await api("/api/ir/team");team=(Array.isArray(r)?r:[]).map(p=>({id:String(p.id),name:String(p.name||""),role:String(p.role||"")}));teamAt=now()}
  catch(e){if(!team)throw e}
  return team
 }

 let rev=0,fetchedAt=0,checkedAt=0,busy=null,error="";
 // New messages from the server (by the time written; nothing is edited). Every 5 minutes: the ones deleted there go.
 function refresh({maxAge=0}={}){
  const d=own();if(!d)return Promise.resolve({fresh:[]});
  if(now()-fetchedAt<maxAge)return Promise.resolve({fresh:[]});
  if(busy)return busy;
  busy=(async()=>{
   const fresh=[];
   try{
    const from=srv(now()-KEEP),since=d.since&&d.since>from?d.since:from;
    const list=await acc().list("team_chat",`sort=created&filter=${q(`created > '${since}'`)}`);
    const have=new Set(d.messages.map(m=>m.id));
    for(const r of list){if(have.has(r.id))continue;const m=shape(r);d.messages.push(m);fresh.push(m)}
    if(list.length)d.since=list[list.length-1].created;
    let changed=fresh.length>0;
    const cut=new Date(now()-KEEP).toISOString(),before=d.messages.length;
    d.messages=d.messages.filter(m=>m.at>=cut);if(d.messages.length!==before)changed=true;
    if(now()-checkedAt>5*60e3){
     const ids=new Set((await acc().list("team_chat",`fields=id&filter=${q(`created >= '${from}'`)}`)).map(r=>r.id));
     const n=d.messages.length;d.messages=d.messages.filter(m=>ids.has(m.id)||m.at>iso(d.since));if(d.messages.length!==n)changed=true;
     checkedAt=now()
    }
    d.messages.sort((a,b)=>a.at<b.at?-1:a.at>b.at?1:0);
    if(changed){rev++;store()}
    fetchedAt=now();error=""
   }catch(e){error=String(e?.message||e)}
   return{fresh}
  })().finally(()=>{busy=null});
  return busy
 }

 function unreadBy(d,uid){
  const by={};
  for(const m of d.messages){if(m.author===uid)continue;const k=convOf(m,uid);if(m.at>(d.seen[k]||""))by[k]=(by[k]||0)+1}
  return by
 }
 async function unread({maxAge=15e3}={}){
  const u=me();if(!u)return{signedIn:false,count:0};
  await refresh({maxAge});const d=own(),by=unreadBy(d,u.id);
  return{signedIn:true,count:Object.values(by).reduce((a,b)=>a+b,0),error}
 }
 // What the window shows: the people, the conversations with their counts, all messages (3 months — a few thousand
 // lines at most). With `rev` of the last answer and nothing new — only {same:true}.
 async function view({rev:known,maxAge=2500}={}){
  const u=me();if(!u)return{signedIn:false};
  await refresh({maxAge});
  let list=[];try{list=await people()}catch(e){error=error||String(e?.message||e)}
  const d=own();
  if(known!=null&&Number(known)===rev&&!view.dirty)return{same:true,rev,error};
  view.dirty=false;
  return{signedIn:true,me:{id:u.id,name:u.name||u.email||""},admin:u.role==="admin",rev,people:list.filter(p=>p.id!==u.id),
   messages:d.messages,unread:unreadBy(d,u.id),seen:d.seen,error,keepDays:90}
 }
 function seen({conv}={}){
  const d=own();if(!d)return null;const k=String(conv||"all");
  const last=d.messages.reduce((a,m)=>convOf(m,me()?.id)===k&&m.at>a?m.at:a,d.seen[k]||"");
  if(last!==d.seen[k]){d.seen[k]=last;store();view.dirty=true}
  return{ok:true}
 }
 async function send({to="",text="",files=[]}={}){
  const u=me();if(!u)throw Error("Войдите в программу (профиль → «Войти»), чтобы писать в чат");
  text=String(text||"").trim().slice(0,20000);
  const list=(Array.isArray(files)?files:[]).slice(0,FILES_MAX).map(f=>({name:String(f.name||"file").replace(/[\\/:*?"<>|]+/g,"_").slice(0,120)||"file",
   type:String(f.type||"application/octet-stream"),buffer:Buffer.isBuffer(f.data)?f.data:Buffer.from(f.data instanceof Uint8Array?f.data:String(f.data||""),f.data instanceof Uint8Array?undefined:"base64")}));
  if(!text&&!list.length)throw Error("Пустое сообщение");
  for(const f of list)if(f.buffer.length>FILE_MAX)throw Error(`Файл «${f.name}» больше 20 МБ`);
  const r=await acc().upload("team_chat",{author:u.id,to:String(to||""),text},null,null,list.map(f=>({field:"files",name:f.name,buffer:f.buffer,type:f.type})));
  const d=own(),m=shape(r);if(!d.messages.some(x=>x.id===m.id)){d.messages.push(m);rev++;store()}
  return view({maxAge:0})
 }
 async function remove({id}={}){
  const d=own();if(!d)throw Error("Войдите в программу");
  await api(`/api/collections/team_chat/records/${q(String(id||""))}`,{method:"DELETE"});
  d.messages=d.messages.filter(m=>m.id!==id);rev++;store();
  return view({maxAge:0})
 }
 const cache=new Map();
 async function fileData({id,name}={}){
  if(!/^[^\\/]+$/.test(String(name||"")))throw Error("Нет такого файла");
  const k=id+"/"+name;if(cache.has(k))return cache.get(k);
  const b=await acc().download("team_chat",String(id||""),String(name));
  if(cache.size>60)cache.delete(cache.keys().next().value);
  cache.set(k,b);return b
 }
 // what the server named the file: «photo_ab12cd34ef.jpg» → «photo.jpg»
 const plain=n=>String(n).replace(/_[a-z0-9]{10}(\.[^.]+)?$/i,"$1");
 return{refresh,unread,view,seen,send,remove,fileData,plain,convOf}
}
module.exports={createTeamChat,FILE_MAX,FILES_MAX,KEEP};
