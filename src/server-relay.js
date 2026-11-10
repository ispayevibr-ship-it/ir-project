"use strict";
/*
 * IR Project: a person without Claude of their own works through the administrator (the engineer, 10.11.2026: «как быть
 * с тем у кого нет клода? он может передевать информацию кому-нибудь (например администратору в программе)»; «если у
 * него не подключен клод, то чат с администратором — а дальше администратор клоду отправляет»). Through the company's
 * server (server/pb_migrations/1762790000_ir_relay.js):
 *  1. Recognition. On a computer without Claude (no API key, no Claude Code) but signed in to the server, the engine is
 *     «Claude администратора»: every request of the analysis (the rendered sheets and the text of the request, never the
 *     PDF itself) goes to the queue `ai_jobs`; the program of an administrator with Claude takes it, runs it on the
 *     administrator's Claude (subscription) and puts the answer back; the analysis goes on as with Claude of its own.
 *  2. The chat. The chat of the montage scheme of such a computer goes to the administrators (`admin_chat`). The
 *     administrator sees it in the chat of the program (tab «Инженеры»), answers himself or presses «Передать Claude»:
 *     the message goes to Claude from the administrator's chat with its pictures, and Claude's answer comes back to the
 *     engineer by itself.
 * The administrator's program does the jobs while it is open (it can be turned off on that computer).
 */
const fs=require("node:fs"),path=require("node:path"),zlib=require("node:zlib"),os=require("node:os");

const POLL=8000,WAIT_MAX=12*3600e3,JOB_MAX=55e6;
const q=s=>encodeURIComponent(s);
const short=(v,n)=>String(v==null?"":v).slice(0,n);
// the server writes «2026-11-10 08:00:00.000Z»: the chat sorts by ISO time
const iso=t=>String(t||"").replace(" ","T");

function createRelay({account,engine,getUserDataPath,chat=()=>null,computer=()=>os.hostname(),version=()=>"",now=()=>Date.now(),wait=ms=>new Promise(r=>setTimeout(r,ms)),poll=POLL}){
 const acc=()=>typeof account==="function"?account():account;
 const file=()=>path.join(getUserDataPath(),"server-relay.json");
 const load=()=>{try{return JSON.parse(fs.readFileSync(file(),"utf8"))||{}}catch{return{}}};
 const store=v=>{fs.mkdirSync(path.dirname(file()),{recursive:true});fs.writeFileSync(file(),JSON.stringify(v),"utf8")};
 const me=()=>{try{const i=acc()?.info();return i&&i.signedIn&&i.user?i.user:null}catch{return null}};
 const isAdmin=()=>{try{return Boolean(acc()?.isAdmin())}catch{return false}};
 const nameOf=u=>u?(u.name||u.email||"").slice(0,200):"";
 const api=(p,o)=>acc().api(p,o);

 // ---- 1. The engine: its own Claude when there is one, else the administrator's.
 const localOk=()=>{try{const s=engine.status();return Boolean(s.installed)&&s.state!=="missing"}catch{return false}};
 const viaAdmin=()=>{const u=me();return!localOk()&&Boolean(u)&&u.role!=="guest"};
 const pending=new Map();
 function status(){
  if(!viaAdmin())return engine.status();
  return{state:"ready",installed:true,reason:"",active:pending.size>0,model:"Claude администратора",modelId:"admin",modelVersion:null,
   transport:"сервер компании → программа администратора",offline:false,provider:"admin",
   note:"На этом компьютере Claude не подключён: листы для распознавания уходят администратору, его программа обрабатывает их своим Claude и возвращает ответ"}
 }
 async function start(){try{await engine.start()}catch{}return status()}
 function cancel(){for(const p of pending.values())p.cancelled=true;try{engine.cancel()}catch{}return status()}
 async function requestJSON(args){
  if(!viaAdmin())return engine.requestJSON(args);
  const u=me(),{system,shared="",images=[],text,schema,maxTokens=16000,title=""}=args||{};
  for(const i of images)if(!Buffer.isBuffer(i.buffer)||!["image/png","image/jpeg"].includes(i.mime))throw Error("Поддерживаются PNG и JPG");
  const gz=zlib.gzipSync(JSON.stringify({system,shared,text,schema,maxTokens,images:images.map(i=>({mime:i.mime,label:i.label||"",data:i.buffer.toString("base64")}))}));
  if(gz.length>JOB_MAX)throw Error("Запрос слишком большой для передачи администратору — уменьшите число листов в одном запросе");
  const rec=await acc().upload("ai_jobs",{author:u.id,author_name:nameOf(u),computer:short(computer(),100),version:short(version(),30),
   title:short(title||String(text||"").split("\n")[0],300),status:"waiting"},null,null,[{field:"request",name:"request.json.gz",buffer:gz}]);
  const job={id:rec.id,cancelled:false,since:now()};pending.set(rec.id,job);
  try{
   let misses=0;
   for(;;){
    if(job.cancelled){await api(`/api/collections/ai_jobs/records/${rec.id}`,{method:"PATCH",body:{status:"cancelled"}}).catch(()=>{});throw Error("Анализ отменён")}
    if(now()-job.since>WAIT_MAX){await api(`/api/collections/ai_jobs/records/${rec.id}`,{method:"PATCH",body:{status:"cancelled"}}).catch(()=>{});
     throw Error("Администратор не обработал листы за 12 часов — его программа не была открыта. Повторите «Анализ» позже")}
    let r=null;
    try{r=await api(`/api/collections/ai_jobs/records/${rec.id}`);misses=0}
    catch(e){if(e.status===404)throw Error("Задание на распознавание удалено на сервере");if(++misses>450)throw e}
    if(r?.status==="done"&&r.result&&r.result.data)return{data:r.result.data,model:r.result.model||"Claude администратора",usage:r.result.usage||null,via:"admin"};
    if(r?.status==="failed")throw Object.assign(Error("Claude администратора: "+(r.error||"ошибка")),r.error_code?{code:r.error_code}:{});
    if(r?.status==="cancelled")throw Error("Задание отменено");
    await wait(poll)
   }
  }finally{pending.delete(rec.id)}
 }
 const wrapped={...engine,status,start,cancel,requestJSON};

 // ---- The administrator's program does the jobs (one at a time) while it is open and has Claude.
 const doJobs=()=>load().jobs!==false;
 let working=null,current=null,queue={waiting:0,checkedAt:""};
 function setJobs({on}={}){const d=load();d.jobs=on!==false;store(d);return jobsInfo()}
 function jobsInfo(){return{admin:isAdmin(),on:doJobs(),claude:localOk(),waiting:queue.waiting,current,checkedAt:queue.checkedAt}}
 function work(){
  if(working||!isAdmin()||!localOk()||!doJobs())return working;
  working=(async()=>{
   const list=await api(`/api/collections/ai_jobs/records?perPage=1&sort=created&filter=${q("status='waiting'")}`);
   queue={waiting:list?.totalItems||0,checkedAt:new Date(now()).toISOString()};
   const j=list?.items?.[0];if(!j)return null;
   const u=me();
   await api(`/api/collections/ai_jobs/records/${j.id}`,{method:"PATCH",body:{status:"working",worker:u.id,started:new Date(now()).toISOString()}});
   // two administrators may take the same job: the one written last keeps it
   await wait(1500);
   const mine=await api(`/api/collections/ai_jobs/records/${j.id}`);if(mine?.worker!==u.id||mine?.status!=="working")return null;
   current={id:j.id,author:j.author_name||"",title:j.title||"",since:new Date(now()).toISOString()};
   try{
    const p=JSON.parse(zlib.gunzipSync(await acc().download("ai_jobs",j.id,j.request)).toString("utf8"));
    const images=(p.images||[]).map(i=>({mime:i.mime,label:i.label||"",buffer:Buffer.from(String(i.data||""),"base64")}));
    const a=await engine.requestJSON({system:p.system,shared:p.shared||"",images,text:p.text,schema:p.schema,maxTokens:p.maxTokens||16000});
    await api(`/api/collections/ai_jobs/records/${j.id}`,{method:"PATCH",body:{status:"done",result:{data:a.data,model:a.model||"",usage:a.usage||null},error:""}});
    return{done:j.id}
   }catch(e){
    await api(`/api/collections/ai_jobs/records/${j.id}`,{method:"PATCH",body:{status:"failed",error:short(e?.message||e,2000),error_code:short(e?.code||"",40)}}).catch(()=>{});
    return{failed:j.id,error:String(e?.message||e)}
   }
  })().catch(()=>null).finally(()=>{working=null;current=null});
  return working
 }

 // ---- 2. The chat with the administrator.
 const chatReady=()=>Boolean(me());
 // a message of the engineer: text, what goes with it, the screenshot and the photos
 async function post({localId,text,context,images=[]}={}){
  const u=me();if(!u)throw Error("Войдите в программу (профиль → «Войти»), чтобы писать администратору");
  return acc().upload("admin_chat",{author:u.id,author_name:nameOf(u),from:"engineer",computer:short(computer(),100),version:short(version(),30),
   local_id:short(localId,40),text:short(text,20000),...(context?{context}:{})},null,null,
   images.slice(0,7).map((b,i)=>({field:"images",name:(i?"photo"+i:"shot")+".jpg",buffer:b,type:"image/jpeg"})))
 }
 // what was written to this person (the administrator's answers and Claude's answers passed on)
 async function replies(){
  const u=me();if(!u)return[];
  const list=await acc().list("admin_chat",`sort=created&filter=${q(`to='${u.id}'`)}`);
  return list.map(r=>({id:r.id,from:r.from==="claude"?"claude":"admin",text:r.text||"",reply_to:r.reply_to||"",at:iso(r.created),author:r.author_name||""}))
 }
 // The administrator: the messages of the engineers with what was answered to each.
 let inboxCache=null,inboxAt=0;
 async function inbox({maxAge=0}={}){
  if(!isAdmin())return null;
  if(inboxCache&&now()-inboxAt<maxAge)return inboxCache;
  const since=new Date(now()-60*86400e3).toISOString().replace("T"," ");
  const list=await acc().list("admin_chat",`sort=created&filter=${q(`created >= '${since}'`)}`);
  const asked=list.filter(r=>r.from==="engineer"),seen=load().inboxSeen||"";
  const items=asked.map(r=>({id:r.id,author:r.author,name:r.author_name||"инженер",computer:r.computer||"",version:r.version||"",at:iso(r.created),text:r.text||"",
   context:r.context||null,images:Array.isArray(r.images)?r.images:[],forwarded:r.forwarded||"",
   answers:list.filter(a=>a.from!=="engineer"&&a.to===r.author&&a.reply_to&&a.reply_to===r.local_id).map(a=>({id:a.id,from:a.from,text:a.text||"",at:iso(a.created),by:a.author_name||""}))}));
  inboxCache={items,unread:items.filter(i=>i.at>iso(seen)&&!i.answers.length).length,jobs:jobsInfo()};inboxAt=now();
  return inboxCache
 }
 function inboxSeen(){const d=load();d.inboxSeen=new Date(now()).toISOString().replace("T"," ");store(d);if(inboxCache)inboxCache={...inboxCache,unread:0};return inboxCache}
 const record=async id=>{if(!isAdmin())throw Error("Это может только администратор");return api(`/api/collections/admin_chat/records/${q(String(id||""))}`)};
 async function image({id,name}={}){
  if(!/^[\w.-]+$/.test(String(name||"")))throw Error("Нет такого снимка");
  return"data:image/jpeg;base64,"+(await acc().download("admin_chat",String(id||""),String(name))).toString("base64")
 }
 async function answer({id,text}={}){
  text=String(text||"").trim();if(!text)throw Error("Пустой ответ");
  const r=await record(id),u=me();
  await api("/api/collections/admin_chat/records",{method:"POST",body:{author:u.id,author_name:nameOf(u),from:"admin",to:r.author,reply_to:r.local_id,text:short(text,20000)}});
  inboxAt=0;return inbox()
 }
 // «Передать Claude»: from the administrator's chat, with the engineer's pictures; Claude's answer goes back by itself.
 async function forward({id,note=""}={}){
  const c=chat();if(!c)throw Error("Чат недоступен");
  const r=await record(id);if(r.forwarded)throw Error("Уже передано Claude");
  const shots=[];
  for(const n of Array.isArray(r.images)?r.images:[])try{shots.push(c.keepShot(await acc().download("admin_chat",r.id,n)))}catch{}
  const head="Сообщение инженера «"+(r.author_name||"инженер")+"» (компьютер "+(r.computer||"?")+", программа "+(r.version||"?")+"), передал администратор:";
  const text=[head,"",String(r.text||""),...(String(note||"").trim()?["","Администратор: "+String(note).trim()]:[])].join("\n");
  const v=await c.send({text,context:r.context&&typeof r.context==="object"?r.context:null,shotId:shots[0]||"",photoIds:shots.slice(1),relay:{record:r.id}});
  const sent=v?.sent;if(!sent)throw Error("Сообщение Claude не отправлено");
  await api(`/api/collections/admin_chat/records/${r.id}`,{method:"PATCH",body:{forwarded:sent}});
  inboxAt=0;return{...(await inbox()),chat:v}
 }
 // Claude's answers to what the administrator passed on go back to the engineers (once each).
 async function passBack(){
  const c=chat();if(!c||!isAdmin())return 0;
  const v=c.list(),d=load(),done=new Set(d.passed||[]);let n=0;
  const asked=new Map(v.messages.filter(m=>m.from==="user"&&m.relay&&m.relay.record).map(m=>[m.id,m.relay.record]));
  if(!asked.size)return 0;
  const u=me();
  for(const m of v.messages){
   if(m.from!=="claude"||!m.reply_to||!asked.has(m.reply_to)||done.has(m.id))continue;
   const r=await record(asked.get(m.reply_to)).catch(()=>null);if(!r){done.add(m.id);continue}
   await api("/api/collections/admin_chat/records",{method:"POST",body:{author:u.id,author_name:nameOf(u),from:"claude",to:r.author,reply_to:r.local_id,text:short(m.text,20000)}});
   done.add(m.id);n++
  }
  if(n||done.size!==(d.passed||[]).length){const x=load();x.passed=[...done].slice(-2000);store(x)}
  if(n)inboxAt=0;
  return n
 }
 // Every half a minute in the main process: the jobs (administrator) and Claude's answers passed back.
 let ticking=null;
 function tick(){
  if(ticking)return ticking;
  ticking=(async()=>{
   if(!isAdmin())return;
   work();
   const c=chat();
   if(c&&c.list().messages.some(m=>m.from==="user"&&m.relay&&!m.answered))await c.sync().catch(()=>{});
   await passBack().catch(()=>{})
  })().finally(()=>{ticking=null});
  return ticking
 }
 return{engine:wrapped,viaAdmin,work,jobsInfo,setJobs,chat:{ready:chatReady,post,replies},inbox,inboxSeen,image,answer,forward,passBack,tick}
}
module.exports={createRelay};
