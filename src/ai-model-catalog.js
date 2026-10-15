"use strict";
/* IR Project AI trusted model catalog.
   Catalog publication and official Ed25519 keys MUST be configured by publisher.
   Signed catalog != signed model-pack; both signatures are independently checked. */
const crypto=require("node:crypto");
const MAX_CATALOG_BYTES=256*1024,MAX_RELEASES=60,MAX_PACK_BYTES=16*1024**3;
const ID_PATTERN=/^(paddleocr-vl-1\.6|qwen3-vl-4b)$/;
const VERSION=/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i;
function createModelCatalog({catalogUrl=null,trustedKeys={},request=fetch,now=()=>Date.now(),
 appVersion=()=>"1.7.212"}={}){
 const configured=()=>Boolean(catalogUrl&&Object.keys(trustedKeys).length);
 const safeUrl=(input,base)=>{
  const u=new URL(input);
  if(u.protocol!=="https:"||u.username||u.password||u.hash||u.port&&u.port!=="443")
   throw Error("Недопустимый HTTPS-адрес каталога/пакета");
  if(base&&u.origin!==base.origin)throw Error("Пакет расположен вне доверенного источника");
  return u
 };
 const base=catalogUrl?safeUrl(catalogUrl):null;
 const compare=(a,b)=>{
  const aa=a.split("-",1)[0].split(".").map(Number),bb=b.split("-",1)[0].split(".").map(Number);
  for(let i=0;i<3;i++)if(aa[i]!==bb[i])return aa[i]-bb[i];
  return 0
 };
 async function readBounded(body,max,signal){
  if(!body)throw Error("Сервер вернул пустой ответ");
  let chunks=[],total=0;
  for await(const chunk of body){
   if(signal?.aborted)throw Error("Операция отменена");
   const v=Buffer.from(chunk);total+=v.length;
   if(total>max)throw Error("Превышен допустимый размер каталога");
   chunks.push(v)
  }
  return Buffer.concat(chunks,total)
 }
 async function check(){
  if(!configured())return{configured:false,checkedAt:new Date(now()).toISOString(),available:[],
   reason:"Официальный подписанный каталог моделей ещё не настроен. Загрузка заблокирована."};
  const signal=AbortSignal.timeout(15000);
  const res=await request(base.href,{redirect:"error",cache:"no-store",credentials:"omit",signal});
  if(!res.ok)throw Error("Сервер моделей ответил HTTP "+res.status);
  const encoded=await readBounded(res.body,MAX_CATALOG_BYTES,signal);
  let envelope;
  try{envelope=JSON.parse(encoded.toString("utf8"))}catch{throw Error("Каталог не является JSON")}
  if(!envelope||!/^[-\w.]{1,70}$/.test(String(envelope.keyId||""))||
    typeof envelope.payload!=="string"||typeof envelope.signature!=="string"||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.payload)||
    !/^[A-Za-z0-9+/]{86}==?$/.test(envelope.signature))throw Error("Неверный формат подписи каталога");
  const key=trustedKeys[envelope.keyId];
  if(!key)throw Error("Каталог подписан неизвестным издателем");
  const raw=Buffer.from(envelope.payload,"base64");
  if(!raw.length||raw.length>MAX_CATALOG_BYTES)throw Error("Размер подписанных данных некорректен");
  let pub;try{pub=crypto.createPublicKey(key)}catch{throw Error("Некорректный ключ издателя")}
  if(pub.asymmetricKeyType!=="ed25519"||
    !crypto.verify(null,raw,pub,Buffer.from(envelope.signature,"base64")))
   throw Error("Недействительная цифровая подпись каталога");
  let payload;try{payload=JSON.parse(raw.toString("utf8"))}catch{throw Error("Повреждены подписанные данные")}
  const stamp=x=>Date.parse(x);
  if(payload?.schema!==1||!Array.isArray(payload.releases)||payload.releases.length>MAX_RELEASES||
    !Number.isFinite(stamp(payload.expiresAt))||!Number.isFinite(stamp(payload.generatedAt))||
    stamp(payload.generatedAt)>now()+300000||stamp(payload.expiresAt)<=now()||
    stamp(payload.expiresAt)-stamp(payload.generatedAt)>31*24*60*60*1000)
    throw Error("Каталог устарел либо имеет некорректный срок действия");
  const seen=new Set(),items=[];
  for(const entry of payload.releases){
   if(!entry||!ID_PATTERN.test(entry.modelId)||!VERSION.test(entry.version)||entry.version.length>60||
    !["paddleocr","llama.cpp"].includes(entry.engine)||
    entry.engine!==(entry.modelId==="qwen3-vl-4b"?"llama.cpp":"paddleocr")||
    !Number.isSafeInteger(entry.size)||entry.size<1||entry.size>MAX_PACK_BYTES||
    !/^[0-9a-f]{64}$/i.test(String(entry.sha256||""))||
    typeof entry.url!=="string"||entry.url.length>2048||
    entry.minAppVersion&&!VERSION.test(entry.minAppVersion))
    throw Error("Каталог содержит некорректную версию модели");
   const uri=safeUrl(entry.url,base);
   const index=entry.modelId+"@"+entry.version;
   if(seen.has(index))throw Error("Дублирующаяся модель в подписанном каталоге");
   seen.add(index);
   if(entry.minAppVersion&&compare(appVersion(),entry.minAppVersion)<0)continue;
   items.push({modelId:entry.modelId,version:entry.version,engine:entry.engine,
    url:uri.href,bytes:entry.size,sha256:entry.sha256.toLowerCase(),
    notes:typeof entry.notes==="string"?entry.notes.slice(0,1200):"",
    keyId:envelope.keyId,expiresAt:payload.expiresAt})
  }
  return{configured:true,checkedAt:new Date(now()).toISOString(),expiresAt:payload.expiresAt,
   available:items,reason:items.length?"Найдены версии в проверенном подписанном каталоге.":"Совместимых версий пока нет."}
 }
 return{check,configured,compare,safeUrl,MAX_PACK_BYTES};
}
module.exports={createModelCatalog,MAX_CATALOG_BYTES,MAX_PACK_BYTES};
