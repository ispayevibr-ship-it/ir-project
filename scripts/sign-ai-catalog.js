"use strict";
/* Sign one coherent multi-model catalog. Every pack must be independently
 * Ed25519-verified under the SAME trusted publisher key before publication.
 * The original --pack/--url CLI remains supported for one release. */
const fs=require("node:fs"),crypto=require("node:crypto");
const {verifyBuiltArchive,checksum}=require("./ai-pack-publisher");
const MAX_RELEASES=60,MAX_INPUT_BYTES=65536;
function parse(args){
 const out={};
 for(let i=0;i<args.length;i++){
  const key=args[i],value=args[++i];
  if(!/^--[a-z][a-z0-9-]*$/.test(key)||!value||value.startsWith("--")||Object.hasOwn(out,key))
   throw Error("Неверный аргумент: "+key);
  out[key]=value
 }
 const allowed=["--pack","--url","--releases-file","--key-file","--key-id",
  "--out","--expires-days","--notes"];
 for(const k of Object.keys(out))if(!allowed.includes(k))throw Error("Неизвестный аргумент: "+k);
 for(const key of ["--key-file","--key-id","--out"])if(!out[key])
  throw Error("Обязательный аргумент: "+key);
 if(Boolean(out["--releases-file"])===Boolean(out["--pack"]||out["--url"]))
  throw Error("Укажите --releases-file либо пару --pack/--url");
 if(!out["--releases-file"]&&(!out["--pack"]||!out["--url"]))
  throw Error("Для одного пакета необходимы --pack и --url");
 if(out["--releases-file"]&&out["--notes"])
  throw Error("--notes для нескольких моделей задаётся отдельно в releases-файле");
 return out
}
function releaseFile(filename){
 const stat=fs.lstatSync(filename);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>MAX_INPUT_BYTES)
  throw Error("Неверный файл перечня релизов");
 const input=JSON.parse(fs.readFileSync(filename,"utf8"));
 if(!Array.isArray(input)||!input.length||input.length>MAX_RELEASES)
  throw Error("Требуется список от 1 до 60 локальных подписанных релизов");
 return input
}
async function signCatalog({pack,url,releases=null,keyFile,keyId,output,
 notes="",expiresDays=7,now=()=>Date.now()}){
 const list=releases==null?[{pack,url,notes}]:releases;
 if(!Array.isArray(list)||list.length<1||list.length>MAX_RELEASES||
  !keyFile||!keyId||!output)throw Error("Не указан корректный список релизов или ключ издателя");
 if(!/^[A-Za-z0-9_.-]{1,70}$/.test(String(keyId)))
  throw Error("Недопустимый идентификатор ключа издателя");
 if(!Number.isSafeInteger(expiresDays)||expiresDays<1||expiresDays>30)
  throw Error("Срок каталога от 1 до 30 дней");
 if(fs.existsSync(output))throw Error("Каталог существует, перезапись запрещена");
 const secret=crypto.createPrivateKey(fs.readFileSync(keyFile));
 if(secret.asymmetricKeyType!=="ed25519")throw Error("Нужен Ed25519-ключ");
 const pub=crypto.createPublicKey(secret);
 const seen=new Set(),items=[];
 let origin=null;
 for(const item of list){
  if(!item||typeof item!=="object"||typeof item.pack!=="string"||
   !item.pack||typeof item.url!=="string"||item.url.length>2048||
   typeof item.notes!=="undefined"&&typeof item.notes!=="string")
   throw Error("Неверный адрес или путь подписанного пакета");
  const endpoint=new URL(item.url);
  if(endpoint.protocol!=="https:"||endpoint.username||endpoint.password||
   endpoint.hash||endpoint.port&&endpoint.port!=="443")
   throw Error("Публикация разрешена только по HTTPS");
  if(origin&&endpoint.origin!==origin)
   throw Error("Все модели в одном каталоге должны иметь один доверенный HTTPS-источник");
  origin=endpoint.origin;
  const verified=await verifyBuiltArchive(item.pack,pub);
  const m=verified.manifest;
  if(m.keyId!==keyId)throw Error("Каталог и все модели должны быть подписаны одним ключом");
  const unique=m.modelId+"@"+m.version;
  if(seen.has(unique))throw Error("Повторная версия модели в каталоге: "+unique);
  seen.add(unique);
  const size=fs.statSync(item.pack).size,sha256=await checksum(item.pack);
  items.push({modelId:m.modelId,version:m.version,engine:m.engine,
   url:endpoint.href,size,sha256,minAppVersion:m.minAppVersion,
   notes:String(item.notes||"").slice(0,1000)})
 }
 const stamp=now();
 if(!Number.isFinite(stamp))throw Error("Некорректная дата подписания");
 const payload={schema:1,generatedAt:new Date(stamp).toISOString(),
  expiresAt:new Date(stamp+expiresDays*86400000).toISOString(),
  releases:items};
 const raw=Buffer.from(JSON.stringify(payload));
 const envelope={keyId,payload:raw.toString("base64"),
  signature:crypto.sign(null,raw,secret).toString("base64")};
 fs.writeFileSync(output,JSON.stringify(envelope),{flag:"wx",mode:0o600});
 const sha256=await checksum(output);
 return{file:output,sha256,packSha256:items.length===1?items[0].sha256:null,
  modelId:items.length===1?items[0].modelId:null,
  version:items.length===1?items[0].version:null,releases:items}
}
async function main(args=process.argv.slice(2)){
 const a=parse(args);
 const result=await signCatalog({
  ...(a["--releases-file"]?{releases:releaseFile(a["--releases-file"])}:
   {pack:a["--pack"],url:a["--url"],notes:a["--notes"]||""}),
  keyFile:a["--key-file"],keyId:a["--key-id"],output:a["--out"],
  expiresDays:a["--expires-days"]?Number(a["--expires-days"]):7
 });
 console.log("Проверенный и подписанный каталог готов:",result.file);
 console.log("SHA-256 каталога:",result.sha256);
 for(const row of result.releases)
  console.log("Подписанный релиз:",row.modelId,row.version,row.sha256);
 console.log("Важно: URL на сервере и открытый ключ должны быть утверждены отдельно.")
}
if(require.main===module)main().catch(e=>{console.error("Каталог не создан:",e.message);process.exitCode=1});
module.exports={signCatalog,parse,main,releaseFile};
