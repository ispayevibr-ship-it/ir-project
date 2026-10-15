"use strict";
/* Download a previously signed catalog entry into a private .part file.
   No redirects, no uploads, no automatic installation. */
const fs=require("node:fs"),crypto=require("node:crypto");
const {pipeline}=require("node:stream/promises"),{Transform}=require("node:stream");
const MAX_PACK_BYTES=16*1024**3;
async function downloadVerifiedPack({release,destination,request=fetch,signal,onProgress=()=>{}}={}){
 if(!release||!Number.isSafeInteger(release.bytes)||release.bytes<1||release.bytes>MAX_PACK_BYTES||
    !/^[0-9a-f]{64}$/i.test(String(release.sha256||"")))throw Error("Пакет не прошёл проверку подписанного каталога");
 const uri=new URL(release.url);
 if(uri.protocol!=="https:"||uri.username||uri.password||uri.hash||uri.port&&uri.port!=="443")
  throw Error("Для загрузки разрешён только HTTPS без перенаправлений");
 let response;
 for(let attempt=0;attempt<3;attempt++){
  try{
   response=await request(uri.href,{redirect:"error",cache:"no-store",credentials:"omit",signal});
   if(response.status>=500&&attempt<2){await response.body?.cancel?.();continue}
   break;
  }catch(error){
   if(signal?.aborted||attempt===2)throw error;
  }
 }
 if(!response.ok||!response.body)throw Error("Ошибка загрузки пакета: HTTP "+response.status);
 const declared=response.headers?.get?.("content-length");
 if(declared!==null&&declared!==undefined&&declared!==""&&Number(declared)!==release.bytes)
  throw Error("Размер на сервере отличается от подписанного каталога");
 const hash=crypto.createHash("sha256");let received=0,previous=-1;
 const counter=new Transform({transform(chunk,_enc,callback){
  received+=chunk.length;
  if(received>release.bytes)return callback(new Error("Файл превышает заявленный размер"));
  hash.update(chunk);
  const percent=Math.floor(received*100/release.bytes);
  if(percent!==previous){previous=percent;try{onProgress({received,total:release.bytes,percent})}catch{}}
  callback(null,chunk)
 }});
 try{
  await pipeline(response.body,counter,fs.createWriteStream(destination,{flags:"wx",mode:0o600}),{signal});
  if(received!==release.bytes)throw Error("Загружен неполный пакет");
  if(hash.digest("hex")!==release.sha256.toLowerCase())throw Error("SHA-256 скачанного пакета не совпадает");
  return{path:destination,size:received,sha256:release.sha256.toLowerCase()}
 }catch(error){try{fs.rmSync(destination,{force:true})}catch{}throw error}
}
module.exports={downloadVerifiedPack};
