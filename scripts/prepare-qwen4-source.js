"use strict";
/* Publisher-side preparation only. End users install signed IR AI packs in the app.
   Downloads exact pinned upstream files; never invents hashes or signs unverified bytes. */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {Readable,Transform}=require("node:stream"),{pipeline}=require("node:stream/promises");
const source=require("../src/ai-qwen-source.json");
const MAX_REDIRECTS=8;
function fileUrl(name){
 if(!/^[a-zA-Z0-9_.-]+\.gguf$/.test(name))throw Error("Invalid GGUF filename");
 if(!/^[a-f0-9]{40}$/.test(source.revision))throw Error("Source revision must be pinned");
 return "https://huggingface.co/"+source.source+"/resolve/"+source.revision+"/"+name;
}
async function get(url,headers={},redirects=0){
 if(redirects>MAX_REDIRECTS)throw Error("Too many download redirects");
 const response=await fetch(url,{headers,redirect:"manual",signal:AbortSignal.timeout(600000)});
 if([301,302,303,307,308].includes(response.status)){
  const next=new URL(response.headers.get("location")||"",url);
  if(next.protocol!=="https:"||next.username||next.password)throw Error("Unsafe redirect");
  await response.body?.cancel();
  return get(next.href,headers,redirects+1)
 }
 return response
}
async function download(url,destination){
 fs.mkdirSync(path.dirname(destination),{recursive:true});
 const partial=destination+".part";
 let offset=fs.existsSync(partial)?fs.statSync(partial).size:0;
 if(fs.existsSync(destination)){
  console.log("Already present:",destination);
  return checksum(destination)
 }
 const response=await get(url,offset?{Range:"bytes="+offset+"-"}:{});
 if(offset&&response.status===200){
  await response.body?.cancel();fs.rmSync(partial,{force:true});offset=0;
  return download(url,destination)
 }
 if(!(response.status===200&&!offset||response.status===206&&offset))throw Error("HTTP "+response.status+" for "+url);
 if(offset){
  const range=response.headers.get("content-range")||"";
  if(!range.startsWith("bytes "+offset+"-"))throw Error("Incorrect resume range");
 }
 if(!response.body)throw Error("Empty response");
 let received=offset;
 const progress=new Transform({transform(chunk,enc,done){
  received+=chunk.length;
  if(received%(64*1024*1024)<chunk.length)console.log(path.basename(destination),Math.round(received/1048576)+" MiB");
  done(null,chunk)
 }});
 await pipeline(Readable.fromWeb(response.body),progress,fs.createWriteStream(partial,{flags:offset?"a":"w"}));
 const total=response.headers.get("content-range")?.split("/").pop();
 if(total&&Number(total)!==received)throw Error("Incomplete download; resume on next run");
 fs.renameSync(partial,destination);
 return checksum(destination)
}
async function checksum(file){
 const hash=crypto.createHash("sha256");
 for await(const chunk of fs.createReadStream(file))hash.update(chunk);
 const digest=hash.digest("hex");
 console.log(path.basename(file),"SHA256",digest);
 return digest
}
async function main(){
 const folder=path.resolve(process.argv[2]||"qwen4-staging");
 const models=path.join(folder,"models");
 const hashes={};
 for(const [role,name] of Object.entries(source.files)){
  hashes[role]=await download(fileUrl(name),path.join(models,name))
 }
 const result={repository:source.source,revision:source.revision,files:source.files,sha256:hashes,
  runtime:"NOT DOWNLOADED: select and verify a compatible official Windows llama.cpp release separately",
  packaging:"Run scripts/build-qwen4-pack.js with the verified runtime and publisher signing key"};
 fs.writeFileSync(path.join(folder,"source-verification.json"),JSON.stringify(result,null,2)+"\n");
 console.log("Source weights downloaded and hashed. Signed Windows pack NOT yet published.");
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={fileUrl,download,checksum};
