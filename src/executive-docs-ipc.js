"use strict";
/*
 * Исполнительная документация, main process: the documents of quality loaded for an object (copied into
 * userData/executive-documents/<object>) and the export — a .docx made by the page, or a PDF printed here from its HTML in
 * a hidden window; the loaded documents of quality and as-built surveys go next to it, in a folder by groups.
 * Channels ai-documents:exec-* — the installed preload passes ai-documents:*.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
function createExecutiveDocs({getUserDataPath,dialog,shell,getWindow}){
 const root=()=>{const dir=path.join(getUserDataPath(),"executive-documents");fs.mkdirSync(dir,{recursive:true});return dir};
 const safe=v=>String(v||"файл").replace(/[<>:"/\\|?*\x00-\x1F]/g,"_").replace(/\s+/g," ").trim().slice(0,120)||"файл";
 const inside=file=>{if(!file)return false;const t=path.resolve(String(file));return t.startsWith(path.resolve(root())+path.sep)};
 // Documents of quality: PDF or a photo; as-built surveys also come as drawings (DWG, DXF) and scans (TIFF).
 const KINDS={cert:{title:"Документ о качестве (сертификат, паспорт)",name:"Сертификат",ext:["pdf","png","jpg","jpeg"]},
  survey:{title:"Исполнительная съёмка",name:"Исполнительная съёмка",ext:["pdf","png","jpg","jpeg","tif","tiff","dwg","dxf"]}};
 async function add({objectId,kind}={}){
  const K=KINDS[kind]||KINDS.cert,EXT=K.ext.map(e=>"."+e);
  const r=await dialog.showOpenDialog(getWindow(),{title:K.title,properties:["openFile","multiSelections"],filters:[{name:K.name,extensions:K.ext}]});
  if(r.canceled||!r.filePaths?.length)return[];
  const dir=path.join(root(),String(Number(objectId)||0));fs.mkdirSync(dir,{recursive:true});
  return r.filePaths.filter(f=>EXT.includes(path.extname(f).toLowerCase())).map(f=>{const ext=path.extname(f).toLowerCase(),name=path.basename(f),dest=path.join(dir,`${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safe(path.basename(f,ext))}${ext}`);fs.copyFileSync(f,dest);return{path:dest,name}})
 }
 async function open({path:file}={}){if(!inside(file)||!fs.existsSync(file))return false;const e=await shell.openPath(path.resolve(file));if(e)throw Error(e);return true}
 function remove({path:file}={}){if(!inside(file))return false;try{fs.rmSync(path.resolve(file),{force:true});return true}catch{return false}}
 async function pdfOf(html){
  const {BrowserWindow}=require("electron"),tmp=path.join(root(),`print-${Date.now()}-${crypto.randomBytes(3).toString("hex")}.html`);
  fs.writeFileSync(tmp,String(html||""),"utf8");
  const w=new BrowserWindow({show:false,webPreferences:{javascript:false,sandbox:true}});
  try{await w.loadFile(tmp);return await w.webContents.printToPDF({pageSize:"A4",printBackground:true,preferCSSPageSize:true})}
  finally{w.destroy();fs.rmSync(tmp,{force:true})}
 }
 async function exportDocs({format="docx",name="Исполнительная документация",html="",docx=null,attachments=[]}={}){
  const pdf=format==="pdf",r=await dialog.showSaveDialog(getWindow(),{defaultPath:safe(name)+(pdf?".pdf":".docx"),filters:[pdf?{name:"PDF",extensions:["pdf"]}:{name:"Документ Word",extensions:["docx"]}]});
  if(r.canceled||!r.filePath)return null;
  fs.writeFileSync(r.filePath,pdf?await pdfOf(html):Buffer.from(docx||[]));
  // The documents of quality and surveys: next to the file, «<имя> — приложения/<группа>/<что это> — <файл>».
  let copied=0;const missing=[];
  if(Array.isArray(attachments)&&attachments.length){
   const base=path.join(path.dirname(r.filePath),path.basename(r.filePath,path.extname(r.filePath))+" — приложения");
   for(const a of attachments){if(!inside(a?.path)||!fs.existsSync(a.path)){missing.push(a?.name||"");continue}
    const dir=path.join(base,safe(a.group||"Прочее"));fs.mkdirSync(dir,{recursive:true});
    const ext=path.extname(a.path);let dest=path.join(dir,safe((a.title?a.title+" — ":"")+path.basename(a.name||a.path,path.extname(a.name||a.path)))+ext);
    for(let i=2;fs.existsSync(dest);i++)dest=dest.replace(/( \(\d+\))?(\.[^.]+)$/,` (${i})$2`);
    fs.copyFileSync(a.path,dest);copied++}}
  try{shell.showItemInFolder(r.filePath)}catch{}
  return{path:r.filePath,copied,missing}
 }
 return{add,open,remove,exportDocs}
}
module.exports={createExecutiveDocs};
