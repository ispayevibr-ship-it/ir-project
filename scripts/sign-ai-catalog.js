"use strict";
/* Sign a one-release public catalog using the SAME private Ed25519 key as the pack. */
const fs=require("node:fs"),crypto=require("node:crypto");
const {verifyBuiltArchive,checksum}=require("./ai-pack-publisher");
function parse(args){
 const out={};
 for(let i=0;i<args.length;i++){
  const key=args[i],value=args[++i];
  if(!/^--[a-z][a-z0-9-]*$/.test(key)||!value||value.startsWith("--")||Object.hasOwn(out,key))
   throw Error("Неверный аргумент: "+key);
  out[key]=value
 }
 const allowed=["--pack","--url","--key-file","--key-id","--out","--expires-days","--notes"];
 for(const k of Object.keys(out))if(!allowed.includes(k))throw Error("Неизвестный аргумент: "+k);
 for(const k of allowed.slice(0,5))if(!out[k])throw Error("Обязательный аргумент: "+k);
 return out
}
async function signCatalog({pack,url,keyFile,keyId,output,notes="",expiresDays=7,now=()=>Date.now()}){
 if(!pack||!url||!keyFile||!keyId||!output)throw Error("Не указаны обязательные параметры каталога");
 if(!Number.isSafeInteger(expiresDays)||expiresDays<1||expiresDays>30)throw Error("Срок каталога от 1 до 30 дней");
 if(fs.existsSync(output))throw Error("Каталог существует, перезапись запрещена");
 const endpoint=new URL(url);
 if(endpoint.protocol!=="https:"||endpoint.username||endpoint.password||endpoint.hash||
    endpoint.port&&endpoint.port!=="443")throw Error("Публикация разрешена только по HTTPS");
 const secret=crypto.createPrivateKey(fs.readFileSync(keyFile));
 if(secret.asymmetricKeyType!=="ed25519")throw Error("Нужен Ed25519-ключ");
 const pub=crypto.createPublicKey(secret);
 const verified=await verifyBuiltArchive(pack,pub);
 const m=verified.manifest;
 if(m.keyId!==keyId)throw Error("Каталог и модель должны быть подписаны одним ключом");
 const size=fs.statSync(pack).size,sha256=await checksum(pack);
 const stamp=now();
 const payload={schema:1,generatedAt:new Date(stamp).toISOString(),
  expiresAt:new Date(stamp+expiresDays*86400000).toISOString(),
  releases:[{modelId:m.modelId,version:m.version,engine:m.engine,
   url:endpoint.href,size,sha256,minAppVersion:m.minAppVersion,
   notes:String(notes).slice(0,1000)}]};
 const raw=Buffer.from(JSON.stringify(payload));
 const envelope={keyId,payload:raw.toString("base64"),signature:crypto.sign(null,raw,secret).toString("base64")};
 fs.writeFileSync(output,JSON.stringify(envelope),{flag:"wx",mode:0o600});
 return{file:output,sha256:await checksum(output),packSha256:sha256,modelId:m.modelId,version:m.version}
}
async function main(args=process.argv.slice(2)){
 const a=parse(args);
 const result=await signCatalog({pack:a["--pack"],url:a["--url"],keyFile:a["--key-file"],
  keyId:a["--key-id"],output:a["--out"],notes:a["--notes"]||"",
  expiresDays:a["--expires-days"]?Number(a["--expires-days"]):7});
 console.log("Проверенный и подписанный каталог готов:",result.file);
 console.log("SHA-256 каталога:",result.sha256);
 console.log("SHA-256 модели:",result.packSha256);
 console.log("Важно: URL на сервере и открытый ключ должны быть утверждены отдельно.");
}
if(require.main===module)main().catch(e=>{console.error("Каталог не создан:",e.message);process.exitCode=1});
module.exports={signCatalog,parse,main};
