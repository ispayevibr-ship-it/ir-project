"use strict";
/*
 * IR Project AI: sending what this computer learned to the repository (GitHub), so that it is reviewed in a
 * development session and becomes part of the knowledge base for every computer (knowledge/, see knowledge/README.md).
 *
 * What is sent — into knowledge/inbox/<computer>/ of the chosen branch, never into the curated folders:
 *  - sets/<id>.json — Claude's answers for drawing sets (userData/ai-learned/sets);
 *  - engineer.json  — the engineer's rules and notes (userData/ai-knowledge.json);
 *  - lessons.json   — what Claude's processing taught the program (userData/ai-learned/lessons.json);
 *  - journal.json   — the journal of edits sent by the engineer (userData/ai-learned/journal.json), every hour or by hand.
 * One commit per sending (Git Data API), only files that changed since the last one.
 *
 * Access: a GitHub token typed in by the administrator (fine-grained, "Contents: read and write" for this repository
 * only). It is stored encrypted with Electron safeStorage (Windows DPAPI) and never shown again or put in an update.
 *
 * The closed repository of the data (knowledge/data.json of the update): the data of the drawings, what the computers
 * send and the chat live there, the program itself in the open one. It is found by its number (repo_id), so that its
 * name may change: everything this computer sends goes there, never to a repository of the same name, and the data
 * of the drawings come from there (pullData) into userData/knowledge-data/.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),os=require("node:os");
const API="https://api.github.com";
const DEFAULTS={repo:"ispayevibr-ship-it/ir-project",branch:"claude/pdf-scheme-claude"};
const DATA_FILE=path.join(__dirname,"..","knowledge","data.json"),CHAT_BRANCH="claude/ir-chat";
// The data of the drawings in the closed repository: knowledge/ without what the computers send and the open standards.
const PRIVATE=p=>/^knowledge\/(?!inbox\/|global\/)[^\0]+\.json$/.test(p)&&!p.split("/").some(x=>x===".."||x===".");
const REPO_RE=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,BRANCH_RE=/^[A-Za-z0-9_.\/-]{1,100}$/;
const sha=t=>crypto.createHash("sha256").update(t).digest("hex");
const computerName=()=>String(os.hostname()||"pc").toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40)||"pc";

function createGithubSync({getUserDataPath,safeStorage,fetch:doFetch=globalThis.fetch,now=()=>new Date(),dataFile=DATA_FILE}){
 const file=()=>path.join(getUserDataPath(),"ai-github.json");
 function read(){try{return{...DEFAULTS,auto:false,sent:{},...JSON.parse(fs.readFileSync(file(),"utf8"))}}catch{return{...DEFAULTS,auto:false,sent:{}}}}
 function write(d){fs.mkdirSync(path.dirname(file()),{recursive:true});const tmp=file()+".tmp";fs.writeFileSync(tmp,JSON.stringify(d,null,1),"utf8");fs.renameSync(tmp,file())}
 const encryption=()=>Boolean(safeStorage?.isEncryptionAvailable?.());
 function token(){
  const d=read();if(!d.token)return"";
  if(!encryption())throw Error("Шифрование Windows недоступно — ключ GitHub не может быть прочитан");
  return safeStorage.decryptString(Buffer.from(d.token,"base64"))
 }
 async function gh(method,url,body,tk=token()){
  if(!tk)throw Error("Ключ доступа GitHub не указан");
  const r=await doFetch(API+url,{method,headers:{Authorization:"Bearer "+tk,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"IR-Project",
   ...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
  if(!r.ok){const e=Error(r.status===401?"GitHub не принял ключ — проверьте его или срок действия":r.status===403?"У ключа нет прав на запись в репозиторий (нужно Contents: Read and write)":r.status===404?"Репозиторий или ветка не найдены — либо ключ не даёт к ним доступа":"GitHub: "+r.status+" "+(data?.message||""));e.status=r.status;e.url=url;throw e}
  return data
 }
 // The closed repository of the data, by its number: its name (asked again once an hour) and the branches.
 const dataConf=()=>{try{const c=JSON.parse(fs.readFileSync(dataFile,"utf8"));return Number.isSafeInteger(c?.repo_id)&&c.repo_id>0?c:null}catch{return null}};
 async function dataRepo(){
  const c=dataConf(),d=read();
  if(!c)return{repo:d.repo,branch:d.branch,chatBranch:CHAT_BRANCH};
  const branch=BRANCH_RE.test(String(c.branch||""))?String(c.branch):d.branch,chatBranch=BRANCH_RE.test(String(c.chat_branch||""))?String(c.chat_branch):CHAT_BRANCH;
  let name=d.dataRepo?.id===c.repo_id&&now()-new Date(d.dataRepo.at)<3600e3?d.dataRepo.full_name:"";
  if(!name){
   try{
    const r=await gh("GET","/repositories/"+c.repo_id);name=REPO_RE.test(String(r?.full_name||""))?String(r.full_name):"";
    if(name){const a=read();a.dataRepo={id:c.repo_id,full_name:name,private:Boolean(r.private),at:now().toISOString()};write(a)}
   }catch(e){if(d.dataRepo?.id===c.repo_id)name=d.dataRepo.full_name;else throw e}
  }
  if(!name)throw Error("Закрытое хранилище данных не найдено");
  return{repo:name,branch,chatBranch}
 }
 // The files to send, as {path in the repository, text}.
 function outgoing(){
  const pc=computerName(),out=[],base="knowledge/inbox/"+pc+"/";
  const sets=path.join(getUserDataPath(),"ai-learned","sets");
  try{for(const f of fs.readdirSync(sets).filter(f=>f.endsWith(".json")))out.push({path:base+"sets/"+f,text:fs.readFileSync(path.join(sets,f),"utf8")})}catch{}
  try{const t=fs.readFileSync(path.join(getUserDataPath(),"ai-knowledge.json"),"utf8");out.push({path:base+"engineer.json",text:t})}catch{}
  try{const t=fs.readFileSync(path.join(getUserDataPath(),"ai-learned","lessons.json"),"utf8");out.push({path:base+"lessons.json",text:t})}catch{}
  // The journal of edits the engineer sent with the button next to an element.
  try{const t=fs.readFileSync(path.join(getUserDataPath(),"ai-learned","journal.json"),"utf8");out.push({path:base+"journal.json",text:t})}catch{}
  return out
 }
 function pending(){const d=read();return outgoing().filter(f=>d.sent[f.path]!==sha(f.text)).length}
 function info(){
  const d=read();
  return{repo:d.repo,branch:d.branch,hasToken:Boolean(d.token),encryption:encryption(),auto:Boolean(d.auto),computer:computerName(),
   folder:"knowledge/inbox/"+computerName()+"/",last:d.last||null,lastError:d.lastError||"",pending:pending(),total:outgoing().length,
   data:dataConf()?{repo:d.dataRepo?.full_name||"",private:Boolean(d.dataRepo?.private),pulled:d.pulled||null,error:d.pullError||""}:null}
 }
 // The administrator's settings; a new token is checked against the repository before it is kept.
 async function set({repo,branch,token:tk,auto}={}){
  const d=read();
  if(repo!==undefined){repo=String(repo).trim().replace(/^https?:\/\/github\.com\//i,"").replace(/\.git$/,"").replace(/\/+$/,"");if(!REPO_RE.test(repo))throw Error("Репозиторий — в виде владелец/имя");d.repo=repo}
  if(branch!==undefined){branch=String(branch).trim();if(!BRANCH_RE.test(branch))throw Error("Неверное имя ветки");d.branch=branch}
  if(auto!==undefined)d.auto=Boolean(auto);
  if(tk!==undefined&&String(tk).trim()){
   tk=String(tk).trim();
   if(!encryption())throw Error("Шифрование Windows недоступно — ключ не сохраняется открытым текстом");
   const c=dataConf(),r=await gh("GET",c?"/repositories/"+c.repo_id:"/repos/"+d.repo,null,tk);
   if(!r?.permissions?.push)throw Error("Ключ видит репозиторий, но не может в него записывать (нужно Contents: Read and write)");
   d.token=safeStorage.encryptString(tk).toString("base64")
  }
  // A changed repository or branch: everything is sent again there.
  if(repo!==undefined||branch!==undefined){const old=read();if(old.repo!==d.repo||old.branch!==d.branch)d.sent={}}
  delete d.lastError;write(d);return info()
 }
 function clearToken(){const d=read();delete d.token;d.auto=false;write(d);return info()}
 async function test(){
  const d=await dataRepo(),r=await gh("GET","/repos/"+d.repo);
  if(!r?.permissions?.push)throw Error("Ключ не может записывать в "+d.repo);
  await gh("GET","/repos/"+d.repo+"/git/ref/heads/"+d.branch.split("/").map(encodeURIComponent).join("/"));
  return{ok:true,repo:d.repo,branch:d.branch}
 }
 // One commit of the given files ({path, text} or {path, base64}) on the branch; a branch moved meanwhile — once more.
 async function commitFiles(d,files,message){
  const ref="/repos/"+d.repo+"/git/refs/heads/"+d.branch.split("/").map(encodeURIComponent).join("/");
  for(let attempt=0;attempt<2;attempt++){
   const head=await gh("GET","/repos/"+d.repo+"/git/ref/heads/"+d.branch.split("/").map(encodeURIComponent).join("/"));
   const parent=await gh("GET","/repos/"+d.repo+"/git/commits/"+head.object.sha);
   const tree=[];
   for(const f of files){const b=await gh("POST","/repos/"+d.repo+"/git/blobs",f.base64!==undefined?{content:f.base64,encoding:"base64"}:{content:f.text,encoding:"utf-8"});tree.push({path:f.path,mode:"100644",type:"blob",sha:b.sha})}
   const t=await gh("POST","/repos/"+d.repo+"/git/trees",{base_tree:parent.tree.sha,tree});
   const c=await gh("POST","/repos/"+d.repo+"/git/commits",{message,tree:t.sha,parents:[head.object.sha]});
   try{await gh("PATCH",ref,{sha:c.sha,force:false});return c.sha}catch(e){if(e.status!==422||attempt)throw e}
  }
 }
 let running=null;
 // One commit with every changed file; a branch moved meanwhile (another computer, a development session) — once more.
 async function push({reason="вручную"}={}){
  if(running)return running;
  running=(async()=>{
   const d=read(),files=outgoing().filter(f=>d.sent[f.path]!==sha(f.text));
   if(!files.length){d.last={...(d.last||{}),checked:now().toISOString()};write(d);return{sent:0,info:info()}}
   const commit=await commitFiles(await dataRepo(),files,"Обучение IR Project с компьютера "+computerName()+": "+files.length+" файл(ов), "+reason);
   const after=read();for(const f of files)after.sent[f.path]=sha(f.text);
   after.last={at:now().toISOString(),files:files.length,commit,reason};delete after.lastError;write(after);
   return{sent:files.length,commit,info:info()}
  })().catch(e=>{const d=read();d.lastError=String(e.message||e)+" ("+now().toLocaleString("ru-RU")+")";write(d);throw e}).finally(()=>{running=null});
  return running
 }
 // After Claude's answer or a lesson of the engineer: sent by itself when the administrator turned it on.
 let timer=null;
 function schedule(reason){
  const d=read();if(!d.auto||!d.token)return;
  clearTimeout(timer);timer=setTimeout(()=>push({reason}).catch(e=>console.warn("IR Project: sending to GitHub failed",e.message)),5000);timer.unref?.()
 }
 // Every hour: whatever changed (the journal first of all) goes by itself when a token is given.
 let hourly=null;
 function startHourly(ms=3600e3){
  clearInterval(hourly);
  hourly=setInterval(()=>{const d=read();if(d.token)push({reason:"журнал, каждый час"}).catch(e=>console.warn("IR Project: hourly sending to GitHub failed",e.message))},ms);hourly.unref?.()
 }
 // ---- The chat with Claude (src/ai-chat.js): a message goes as one commit into chat/<computer>/ of the chat branch;
 // the check of that branch marks it on the branch's pull request, which wakes the development session. Claude's
 // answers for this computer come back from chat/<computer>/claude.json of the same branch. No key of claude.ai.
 // The chat lives in the closed repository of the data (unless the update names another one).
 const chatPath=f=>"chat/"+computerName()+"/"+f;
 async function chatAt(o={}){
  const branch=BRANCH_RE.test(String(o.branch||""))?String(o.branch):"";
  if(REPO_RE.test(String(o.repo||"")))return{repo:String(o.repo),branch:branch||CHAT_BRANCH};
  const t=await dataRepo();return{repo:t.repo,branch:branch||t.chatBranch}
 }
 const chatReady=()=>Boolean(read().token)&&encryption();
 async function chatPost({id,text,shot,photos=[],repo,branch}){
  const files=[{path:chatPath(id+".json"),text:JSON.stringify({id,computer:computerName(),at:now().toISOString(),text},null,1)}];
  if(shot)files.push({path:chatPath(id+".jpg"),base64:shot});
  // Photos from the computer: <id>-p1.jpg, <id>-p2.jpg…
  (Array.isArray(photos)?photos:[]).slice(0,6).forEach((b,i)=>{if(b)files.push({path:chatPath(id+"-p"+(i+1)+".jpg"),base64:b})});
  return commitFiles(await chatAt({repo,branch}),files,"Чат IR Project с компьютера "+computerName()+": сообщение "+id)
 }
 async function chatAnswers({repo,branch}={}){
  const at=await chatAt({repo,branch});
  try{const r=await gh("GET","/repos/"+at.repo+"/contents/"+chatPath("claude.json")+"?ref="+encodeURIComponent(at.branch));return JSON.parse(Buffer.from(String(r?.content||""),"base64").toString("utf8"))}
  catch(e){if(e.status===404)return null;throw e}
 }
 // The data of the drawings of the closed repository into a folder of this computer (userData/knowledge-data): only
 // what changed since the last time (by the hash of each file); what was removed there is removed here.
 let pulling=null;
 async function pullData({dir}={}){
  if(!dir)throw Error("Не указана папка данных");
  if(pulling)return pulling;
  pulling=(async()=>{
   if(!read().token)return{skipped:"нет ключа GitHub"};
   const t=await dataRepo();
   const head=await gh("GET","/repos/"+t.repo+"/git/ref/heads/"+t.branch.split("/").map(encodeURIComponent).join("/"));
   const commit=await gh("GET","/repos/"+t.repo+"/git/commits/"+head.object.sha);
   const tree=await gh("GET","/repos/"+t.repo+"/git/trees/"+commit.tree.sha+"?recursive=1");
   const want=(tree?.tree||[]).filter(x=>x.type==="blob"&&PRIVATE(x.path)&&!(x.size>50e6));
   const indexFile=path.join(dir,".index.json"),dest=p=>path.join(dir,...p.slice("knowledge/".length).split("/"));
   let index={};try{index=JSON.parse(fs.readFileSync(indexFile,"utf8"))||{}}catch{}
   const next={};let changed=0,removed=0;
   for(const x of want){
    if(index[x.path]===x.sha&&fs.existsSync(dest(x.path))){next[x.path]=x.sha;continue}
    const b=await gh("GET","/repos/"+t.repo+"/git/blobs/"+x.sha);
    const f=dest(x.path),tmp=f+".tmp";fs.mkdirSync(path.dirname(f),{recursive:true});
    fs.writeFileSync(tmp,Buffer.from(String(b?.content||""),"base64"));fs.renameSync(tmp,f);next[x.path]=x.sha;changed++
   }
   for(const p of Object.keys(index))if(!next[p]&&PRIVATE(p)){try{fs.rmSync(dest(p),{force:true});removed++}catch{}}
   fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(indexFile,JSON.stringify(next),"utf8");
   const a=read();a.pulled={at:now().toISOString(),repo:t.repo,files:want.length,changed,removed};delete a.pullError;write(a);
   return a.pulled
  })().catch(e=>{const a=read();a.pullError=String(e.message||e)+" ("+now().toLocaleString("ru-RU")+")";write(a);throw e}).finally(()=>{pulling=null});
  return pulling
 }
 return{info,set,clearToken,test,push,schedule,outgoing,startHourly,computer:computerName,chatReady,chatPost,chatAnswers,CHAT_BRANCH,dataRepo,pullData}
}
module.exports={createGithubSync,DEFAULTS};
