"use strict";
/*
 * IR Project: the montage scheme updates without updating the program (the engineer, 02.11.2026: «как бы нам так сделать
 * чтобы каждый раз не обновлять всю программу из-за изменений в монтажной схеме?»).
 *
 * Two things change the scheme of an object after the program is installed:
 *  - how the 3D draws it (src/scheme-three-view.js and the files beside it, FILES below) — «пакет схем»;
 *  - the checked data of the drawings (knowledge/sets, projects, rules) — they already come from the closed repository
 *    (pullData, src/ai-github-sync.js) and take effect at the next placement.
 * The pack is described by hot/scheme.json of the closed repository (the branch of the data, knowledge/data.json):
 * {version, requires, files:[{source, target, size, sha256}]}. It is taken with the program's GitHub key — the closed
 * repository is not public. Only the files of FILES are ever written, only into the active hot update
 * (userData/app-updates/current) and only when its version is not below «requires»; each file is checked by its size
 * and SHA-256, and the manifest of the hot update gets their new sums (src/updater.js checks them at every file the
 * window loads). The window of the scheme (src/scheme-updates.js) sees a new pack or newer data and offers to refresh.
 * A full hot update replaces these files with its own later; the next check brings the pack again when it is newer.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
// What the pack may carry: the 3D of the scheme and the window that refreshes it — renderer files only (the main
// process keeps what it loaded until the program restarts).
const FILES=["src/scheme-three-view.js","src/scheme-element-card.js","src/scheme-export-html.js","src/ai-structure-types.js","src/ai-joint-catalog.js","src/scheme-updates.js"];
const MANIFEST="hot/scheme.json";
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
function compare(a,b){const A=String(a||"0").split(".").map(Number),B=String(b||"0").split(".").map(Number);for(let i=0;i<Math.max(A.length,B.length);i++){const d=(A[i]||0)-(B[i]||0);if(d)return d>0?1:-1}return 0}
// A manifest of the pack, as it may be trusted: a whole version, known files, sums of 64 hex.
function validPack(p){
 if(!p||!Number.isSafeInteger(p.version)||p.version<1||!Array.isArray(p.files))throw Error("Пакет схем имеет неверный формат");
 if(p.requires&&!/^\d+(\.\d+){1,3}$/.test(String(p.requires)))throw Error("Пакет схем: неверная версия программы");
 const files=p.files.map(f=>{
  if(!FILES.includes(f?.target)||f.source!==f.target)throw Error("Пакет схем: недопустимый файл "+String(f?.target||""));
  if(!/^[0-9a-f]{64}$/.test(String(f.sha256||""))||!Number.isSafeInteger(f.size)||f.size<1||f.size>20e6)throw Error("Пакет схем: нет суммы файла "+f.target);
  return{source:f.source,target:f.target,size:f.size,sha256:f.sha256}
 });
 return{version:p.version,requires:String(p.requires||""),files}
}
// The «?v=» of a changed file in index.html: the window then loads it anew, not from its memory.
function bumpIndex(html,targets){
 let out=String(html);
 for(const t of targets){const name=path.posix.basename(t.target).replace(/[.]/g,"\\.");out=out.replace(new RegExp("(\\./"+name+"\\?v=)[0-9A-Za-z]+","g"),"$1"+t.sha256.slice(0,10))}
 return out
}

function createSchemePack({getUserDataPath,appVersion,readBranch,pull,montage,now=()=>new Date()}){
 const current=()=>path.join(getUserDataPath(),"app-updates","current");
 const stateFile=()=>path.join(getUserDataPath(),"ai-scheme-pack.json");
 function state(){try{return JSON.parse(fs.readFileSync(stateFile(),"utf8"))||{}}catch{return{}}}
 function save(next){const f=stateFile(),tmp=f+".tmp";fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(tmp,JSON.stringify(next,null,1),"utf8");fs.renameSync(tmp,f);return next}
 const manifestFile=()=>path.join(current(),"hot-manifest.json");
 function runtime(){try{const m=JSON.parse(fs.readFileSync(manifestFile(),"utf8"));return m?.version&&Array.isArray(m.files)&&compare(m.version,appVersion())>0?m:null}catch{return null}}
 function writeManifest(m){const f=manifestFile(),tmp=f+".pack-tmp";fs.writeFileSync(tmp,JSON.stringify(m,null,2));fs.renameSync(tmp,f)}
 // The new files into the hot update without a moment where the manifest and a file disagree: first the manifest
 // without the sums of these files (src/updater.js then accepts both the old and the new file), then the files, then
 // the manifest with their new sums.
 function install(m,items){
  const dir=current(),entry=t=>m.files.find(f=>f.target===t);
  const loose={...m,files:m.files.map(f=>items.some(i=>i.target===f.target)?(({sha256,...rest})=>rest)(f):f)};
  for(const i of items){const p=path.join(dir,...i.target.split("/"));fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p+".pack-tmp",i.data)}
  writeManifest(loose);
  for(const i of items){const p=path.join(dir,...i.target.split("/"));fs.renameSync(p+".pack-tmp",p)}
  const files=m.files.map(f=>{const i=items.find(x=>x.target===f.target);return i?{...f,size:i.data.length,sha256:i.sha256}:f});
  for(const i of items)if(!entry(i.target))files.push({source:i.target,target:i.target,size:i.data.length,sha256:i.sha256});
  writeManifest({...m,files})
 }
 let running=null;
 async function check({force=false}={}){
  const s=state();
  if(!force&&s.checkedAt&&now()-new Date(s.checkedAt)<120e3)return status();
  if(running)return running;
  running=(async()=>{
   const m=runtime();
   if(!m){save({...state(),checkedAt:now().toISOString(),note:"нет горячего обновления — пакет схем ставится поверх него"});return status()}
   let pack,commit,changed=[];
   try{
    const got=await readBranch([MANIFEST]);commit=got.commit;
    const raw=got.files.get(MANIFEST);
    if(!raw){save({...state(),checkedAt:now().toISOString(),note:"в хранилище нет пакета схем"});return status()}
    pack=validPack(JSON.parse(raw.toString("utf8")));
    if(pack.requires&&compare(m.version,pack.requires)<0){
     save({...state(),checkedAt:now().toISOString(),waiting:pack.requires,remote:pack.version,note:"пакет схем №"+pack.version+" ждёт версию программы "+pack.requires});return status()}
    const have=t=>{try{return hash(fs.readFileSync(path.join(current(),...t.split("/"))))}catch{return""}};
    const need=pack.files.filter(f=>have(f.target)!==f.sha256);
    if(need.length){
     const got2=await readBranch(need.map(f=>f.source),commit);
     const items=need.map(f=>{
      const data=got2.files.get(f.source);
      if(!data)throw Error("Пакет схем: файл не получен "+f.source);
      if(data.length!==f.size||hash(data)!==f.sha256)throw Error("Пакет схем: файл не совпадает с суммой "+f.source+" — пакет не собран заново (node scripts/scheme-pack.js)");
      return{target:f.target,data,sha256:f.sha256}
     });
     // index.html of the hot update loads the changed files anew
     const indexPath=path.join(current(),"src","index.html");
     if(fs.existsSync(indexPath)){const before=fs.readFileSync(indexPath,"utf8"),after=bumpIndex(before,items);if(after!==before){const b=Buffer.from(after,"utf8");items.push({target:"src/index.html",data:b,sha256:hash(b)})}}
     install(m,items);
     changed=need.map(f=>f.target)
    }
    const prev=state();
    save({...prev,checkedAt:now().toISOString(),version:pack.version,commit,runtime:m.version,...(changed.length?{appliedAt:now().toISOString(),changed}:{}),error:undefined,waiting:undefined,note:undefined,remote:undefined})
   }catch(e){save({...state(),checkedAt:now().toISOString(),error:String(e?.message||e)+" ("+now().toLocaleString("ru-RU")+")"});throw e}
   // the data of the drawings at once, not at the next hour
   try{
    const r=await pull?.();
    const paths=(r?.paths||[]).filter(p=>/^knowledge\/(sets|projects)\/|^knowledge\/rules\.json$/.test(p));
    if(paths.length)save({...state(),dataAt:now().toISOString(),dataPaths:paths.slice(0,50)})
   }catch(_e){}
   return status()
  })().finally(()=>{running=null});
  return running
 }
 // What the window of an object needs: the pack it runs and whether the checked data came after its placement.
 function status(objectId){
  const s=state(),r={version:s.version||0,appliedAt:s.appliedAt||"",changed:s.changed||[],checkedAt:s.checkedAt||"",error:s.error||"",note:s.note||"",waiting:s.waiting||"",dataAt:s.dataAt||"",dataNewer:false};
  if(objectId&&s.dataAt&&montage?.placedInfo){try{const p=montage.placedInfo(objectId);r.placedAt=p?.placedAt||"";r.dataNewer=Boolean(p?.placedAt&&p.verified&&new Date(s.dataAt)>new Date(p.placedAt))}catch(_e){}}
  return r
 }
 // «Обновить схему»: the object placed again from its last analysis with the checked data that came (what the
 // engineer mounted or edited is kept by the placement itself, src/ai-montage.js place).
 function apply(objectId){
  const p=montage.placedInfo(objectId);
  if(!p?.draftId)throw Error("У объекта нет расстановки по чертежам");
  const v=montage.place(objectId,p.draftId);
  return{placed:v?.placed||null,status:status(objectId)}
 }
 return{check,status,apply,FILES}
}
module.exports={createSchemePack,validPack,bumpIndex,FILES,MANIFEST};
