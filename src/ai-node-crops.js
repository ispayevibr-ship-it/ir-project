"use strict";
/*
 * IR Project: a picture of a node cut from its drawing (the engineer, 13.11.2026: «добавь снимок данного узла стыка с
 * чертежа … сохраняя в базу данных, чтобы они постоянно подгружались … чтобы в дальнейшем она выгружалась вместе с базой
 * данных», «он не должен много места занимать … не будешь фоткать весь лист … чисто узла»).
 * The 3D page «Узлы и стыки» asks for «Узел 16» of «КМ1 л.19»: the newest analysis tells where the view is drawn
 * (src/ai-montage.js nodeView), only that piece of the sheet is drawn (src/ai-pdf-renderer.js regionPreview), made a JPEG
 * not wider than 720 points (~40–90 KB) and kept as images/nodes/<sum>.jpg with a record of the object (section
 * ai-project-kb, record_type node_crop): the record and the picture go to the server and the other computers like any
 * photo (src/server-sync.js), stay when the drawings of a completed object are removed, and are asked again only when
 * the drawing changes (its sum).
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const SECTION="ai-project-kb",TYPE="node_crop",WIDTH=720,QUALITY=80;
function createNodeCrops({database,renderer,montage,getUserDataPath,toJpeg=null,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 const dir=()=>path.join(getUserDataPath(),"images","nodes");
 const keyOf=(sheet,title)=>String(sheet||"").replace(/\s+/gu," ").trim()+"|"+String(title||"").trim();
 const rows=oid=>database.listEntity(oid,SECTION).filter(r=>r.record_type===TYPE);
 const jpeg=toJpeg||(png=>{const {nativeImage}=require("electron");let img=nativeImage.createFromBuffer(png);const s=img.getSize();if(s.width>WIDTH)img=img.resize({width:WIDTH,quality:"best"});return img.toJPEG(QUALITY)});
 const url=file=>"data:image/jpeg;base64,"+fs.readFileSync(file).toString("base64");
 let chain=Promise.resolve();
 const serial=fn=>{const p=chain.then(fn,fn);chain=p.catch(()=>{});return p};
 // the pictures already kept for an object: {key → {url, source}} (the page asks once for all its cards)
 function list(objectId){
  const oid=Number(objectId),out={};
  for(const r of rows(oid)){const d=r.data||{},f=String(d.file_path||"");try{if(d.key&&f&&fs.existsSync(f))out[d.key]={url:url(f),source:d.source||"",sheet:d.sheet||"",title:d.title||""}}catch{}}
  return out
 }
 async function render(oid,v){
  for(let i=0;;i++){
   try{return await renderer.regionPreview(oid,v.documentId,v.page,v.region)}
   catch(e){if(i<20&&/уже обрабатывается/u.test(String(e.message||"")))await wait(1500);else throw e}
  }
 }
 function crop(objectId,{sheet="",title=""}={}){return serial(async()=>{
  const oid=Number(objectId),key=keyOf(sheet,title);
  const v=montage.nodeView(oid,{sheet,title});
  const had=rows(oid).find(r=>r.data?.key===key);
  if(had){const f=String(had.data?.file_path||"");if(f&&fs.existsSync(f)&&(!v||!v.sha||had.data?.sha===v.sha))return{key,url:url(f),source:had.data.source||""}}
  if(!v)return{key,url:null,note:"Узла нет в последнем анализе чертежей"};
  const r=await render(oid,v);
  const png=Buffer.from(String(r.dataUrl).replace(/^data:image\/png;base64,/u,""),"base64");
  const jpg=jpeg(png);
  fs.mkdirSync(dir(),{recursive:true});
  const file=path.join(dir(),crypto.createHash("sha1").update(oid+"|"+key+"|"+v.sha).digest("hex").slice(0,24)+".jpg");
  fs.writeFileSync(file,jpg);
  const data={entity_type:TYPE,key,sheet:String(sheet),title:String(title),source:v.source,sha:v.sha,page:v.page,region:v.region,file_path:file,bytes:jpg.length};
  if(had){const old=String(had.data?.file_path||"");database.updateEntity(oid,SECTION,had.id,{record_type:TYPE,title:key,data});if(old&&old!==file)try{fs.rmSync(old,{force:true})}catch{}}
  else database.createEntity(oid,SECTION,{record_type:TYPE,title:key,data});
  return{key,url:url(file),source:v.source}
 })}
 return{list,crop,keyOf}
}
module.exports={createNodeCrops,SECTION,TYPE};
