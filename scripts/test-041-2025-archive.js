"use strict";
// Real 041-2025 KMD archive regression. Offline, read-only and opt-in.
// Usage: node scripts/test-041-2025-archive.js "/path/041-2025 KMD.zip"
// Optional reference: IR_KMD_REGISTER_JSON=/path/marks.json
const fs=require("node:fs"),crypto=require("node:crypto"),path=require("node:path");
const yauzl=require("yauzl"),pdfjs=require("pdfjs-dist/legacy/build/pdf.mjs");
const {markOccurrences}=require("../src/ai-pdf-mark-matcher");
const archive=process.argv[2]||process.env.IR_KMD_TEST_ARCHIVE;
if(!archive||!fs.existsSync(archive)){
 console.error("Provide 041-2025 KMD ZIP path as first argument or IR_KMD_TEST_ARCHIVE");
 process.exit(2);
}
const EXPECTED_SHA256="1603d8ba5bb865069a88db62cdd8db732b597a771106de5ea160887bb1f68bba";
const actualSha256=crypto.createHash("sha256");
const fd=fs.openSync(archive,"r"),chunk=Buffer.allocUnsafe(1024*1024);
try{let bytes;while((bytes=fs.readSync(fd,chunk,0,chunk.length,null))>0)
 actualSha256.update(chunk.subarray(0,bytes))}
finally{fs.closeSync(fd)}
const digest=actualSha256.digest("hex");
if(digest!==EXPECTED_SHA256){
 console.error("Wrong fixture revision: expected 041-2025 archive SHA256 "+EXPECTED_SHA256+
  ", received "+digest);
 process.exit(2);
}
const referencePath=process.env.IR_KMD_REGISTER_JSON;
const register=referencePath?JSON.parse(fs.readFileSync(referencePath,"utf8")):null;
const allowed=Array.isArray(register)?register.map(x=>typeof x==="string"?x:x.mark||x.code||x.title).filter(Boolean):[];
const readZip=filename=>new Promise((resolve,reject)=>{
 yauzl.open(filename,{lazyEntries:true,autoClose:true},(err,zip)=>{
  if(err)return reject(err);
  const items=[];zip.on("error",reject);zip.on("end",()=>resolve(items));
  zip.on("entry",entry=>{
   if(!/\\.pdf$/i.test(entry.fileName)){zip.readEntry();return}
   zip.openReadStream(entry,(e,stream)=>{
    if(e)return reject(e);
    const chunks=[];stream.on("data",b=>chunks.push(b));
    stream.on("error",reject);
    stream.on("end",()=>{items.push({name:entry.fileName.split("/").pop(),
     bytes:Buffer.concat(chunks)});zip.readEntry()})
   })
  });zip.readEntry()
 })
});
(async()=>{
 const docs=await readZip(archive),results=[],errors=[];
 for(const doc of docs){
  try{
   const task=pdfjs.getDocument({data:new Uint8Array(doc.bytes),
    useSystemFonts:true,disableFontFace:true});
   const pdf=await task.promise,rows=[];
   for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i),tc=await page.getTextContent();
    const fragments=tc.items.filter(x=>typeof x.str==="string").map(x=>({
     text:x.str,x:Number(x.transform?.[4]||0),y:Number(x.transform?.[5]||0),
     width:Number(x.width||0),height:Number(x.height||0)}));
    const text=fragments.map(x=>x.text).join(" ");
    let hits=[];
    if(allowed.length)hits=markOccurrences({page:i,fragments},allowed);
    rows.push({page:i,fragments:fragments.length,textChars:text.length,
     matchedMentions:hits.length,matchedUnique:[...new Set(hits.map(x=>x.mark))].length,
     hasText:text.trim().length>0});
    page.cleanup()
   }
   results.push({name:doc.name,sha256:crypto.createHash("sha256").update(doc.bytes).digest("hex"),
    pages:rows});
   await task.destroy()
  }catch(error){errors.push({name:doc.name,error:String(error.message||error)})}
 }
 const pages=results.flatMap(x=>x.pages);
 const metrics={files:results.length,pages:pages.length,errors:errors.length,
  textPages:pages.filter(x=>x.hasText).length,
  textCoveragePct:pages.length?Number((100*pages.filter(x=>x.hasText).length/pages.length).toFixed(2)):0,
  matchedMentions:pages.reduce((n,x)=>n+x.matchedMentions,0),
  registerProvided:!!allowed.length,registerMarks:allowed.length,
  placementVerified:0,placementAccuracyPct:null,
  geometryAccuracyPct:null,recognition99Verified:false};
 const report={fixture:"041-2025 KMD",archiveSha256:digest,engine:"pdfjs-dist",metrics,errors,documents:results};
 const output=path.resolve(process.env.IR_KMD_TEST_REPORT||"041-2025-kmd-regression.json");
 fs.writeFileSync(output,JSON.stringify(report,null,2));
 console.log(JSON.stringify({report:output,...metrics},null,2));
 if(errors.length||results.length!==62||pages.length!==252)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
