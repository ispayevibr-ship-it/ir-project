"use strict";
/* Optional PyMuPDF extractor. Never replaces pdf.js without explicit opt-in.
 * Requires a separately installed Python with pymupdf.
 */
const {spawn}=require("node:child_process");
const fs=require("node:fs/promises");
const os=require("node:os");
const path=require("node:path");
async function extractWithPyMuPDF(bytes,{python=process.env.IR_PYMUPDF_PYTHON||"python",timeoutMs=120000}={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),"ir-pdf-"));
 const file=path.join(directory,"input.pdf");
 try{
  await fs.writeFile(file,bytes,{flag:"wx",mode:0o600});
  const script=path.join(__dirname,"ai-pymupdf-extract.py");
  const result=await new Promise((resolve,reject)=>{
   const child=spawn(python,[script,file],{windowsHide:true,stdio:["ignore","pipe","pipe"],shell:false});
   let stdout="",stderr="",settled=false;
   const done=(error,value)=>{
    if(settled)return;settled=true;clearTimeout(timer);
    if(error)reject(error);else resolve(value);
   };
   const timer=setTimeout(()=>{child.kill();done(Error("PyMuPDF: превышено время обработки"))},timeoutMs);
   child.on("error",done);
   child.stdout.on("data",chunk=>{
    stdout+=chunk.toString("utf8");
    if(stdout.length>32*1024*1024){child.kill();done(Error("PyMuPDF: слишком большой ответ"))}
   });
   child.stderr.on("data",chunk=>{stderr=(stderr+chunk.toString("utf8")).slice(-1000)});
   child.on("close",code=>code===0?done(null,stdout):done(Error("PyMuPDF: "+(stderr||"exit "+code))));
  });
  const parsed=JSON.parse(result);
  if(parsed.parser!=="pymupdf"||!Array.isArray(parsed.pages))throw Error("Некорректный ответ PyMuPDF");
  return parsed;
 }finally{
  await fs.rm(directory,{recursive:true,force:true});
 }
}
module.exports={extractWithPyMuPDF};
