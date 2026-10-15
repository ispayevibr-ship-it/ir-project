"use strict";
/* Publisher-only: fetch and verify pinned official Windows llama.cpp runtime.
   This is NOT a user-side installation step. */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {pipeline}=require("node:stream/promises");
const yauzl=require("yauzl");
const release=require("../src/ai-llama-windows-source.json");
const {download,checksum}=require("./prepare-qwen4-source");
function extract(zip,target){
 return new Promise((resolve,reject)=>{
  yauzl.open(zip,{lazyEntries:true,autoClose:true},(error,archive)=>{
   if(error)return reject(error);
   let failed=false,foundServer=false,files=0;
   const fail=e=>{if(!failed){failed=true;archive.close();reject(e)}};
   archive.on("error",fail);
   archive.on("end",()=>{if(!failed){if(!foundServer)reject(Error("llama-server.exe missing from archive"));else resolve(files)}});
   archive.on("entry",entry=>{
    if(failed)return;
    const raw=entry.fileName.replace(/\\/g,"/");
    if(raw.startsWith("/")||raw.split("/").some(x=>x===".."||x===".")||/^[A-Za-z]:/.test(raw))
     return fail(Error("Unsafe ZIP entry: "+raw));
    if(raw.endsWith("/"))return archive.readEntry();
    const name=path.posix.basename(raw);
    // Only runtime binaries and license text belong in the signed model pack.
    if(!/^(llama-server\.exe|[^/]+\.dll|LICENSE(?:\.txt)?)$/i.test(name))
     return archive.readEntry();
    const destination=path.join(target,name);
    if(fs.existsSync(destination))return fail(Error("Duplicate runtime file: "+name));
    archive.openReadStream(entry,async(err,stream)=>{
     if(err)return fail(err);
     try{
      await pipeline(stream,fs.createWriteStream(destination,{flags:"wx",mode:0o600}));
      files++;
      if(name.toLowerCase()==="llama-server.exe")foundServer=true;
      archive.readEntry()
     }catch(e){fail(e)}
    })
   });
   archive.readEntry()
  })
 })
}
async function main(){
 if(process.platform!=="win32"&&process.env.IR_AI_ALLOW_CROSS_PREPARE!=="1")
  console.log("Preparing Windows binaries on a non-Windows publisher host; execution must be validated on Windows.");
 const dir=path.resolve(process.argv[2]||"qwen4-staging");
 fs.mkdirSync(dir,{recursive:true});
 const zip=path.join(dir,release.asset);
 const actual=await download(release.url,zip);
 if(actual.toLowerCase()!==release.sha256.toLowerCase()){
  fs.rmSync(zip,{force:true});
  throw Error("Official Windows runtime SHA-256 mismatch");
 }
 const runtime=path.join(dir,"runtime");
 if(fs.existsSync(runtime))throw Error("Runtime folder already exists; remove it explicitly before repackaging");
 fs.mkdirSync(runtime);
 try{
  const count=await extract(zip,runtime);
  const binary=path.join(runtime,"llama-server.exe");
  const binarySha256=await checksum(binary);
  const result={release:release.release,asset:release.asset,archiveSha256:actual,
   binarySha256,runtimeDir:runtime,files:count};
  fs.writeFileSync(path.join(dir,"runtime-verification.json"),JSON.stringify(result,null,2)+"\n");
  console.log("Windows runtime verified and extracted:",JSON.stringify(result,null,2));
 }catch(e){fs.rmSync(runtime,{recursive:true,force:true});throw e}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={extract,main};
