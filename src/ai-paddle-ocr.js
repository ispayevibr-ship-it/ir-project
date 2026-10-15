"use strict";
/* Signed, strictly local PaddleOCR-VL 1.6 document OCR worker.
 * Its results are unverified source evidence, NEVER engineering quantities.
 * The actual executable and both model trees must come from a signed pack.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),
 os=require("node:os"),cp=require("node:child_process");
const MAX_IMAGE=16*1024*1024,MAX_RESULT=2*1024*1024;
function createPaddleOcr({getUserDataPath,models,spawn=cp.spawn,timeoutMs=240000}={}){
 if(typeof getUserDataPath!=="function"||!models?.resolveRuntime||
  typeof models.managedRuntime!=="function")
  throw Error("Для OCR нужен менеджер подписанных локальных моделей");
 let active=null;
 const inspect=()=>models.managedRuntime("paddleocr-vl-1.6");
 function status(){
  const candidate=inspect();
  return{installed:Boolean(candidate?.installed),modelId:"PaddleOCR-VL-1.6",
   version:candidate?.version||null,busy:!!active,offline:true,
   reason:candidate?.reason||(!candidate?"Подписанный OCR-пакет ещё не установлен":"")}
 }
 function cancel(){
  active?.abort();
  return status()
 }
 async function recognize({buffer,mime}={}){
  if(active)throw Error("OCR уже обрабатывает другой лист");
  if(!Buffer.isBuffer(buffer)||buffer.length<16||buffer.length>MAX_IMAGE||
   !["image/png","image/jpeg"].includes(mime))
   throw Error("PaddleOCR принимает только локальные PNG/JPEG до 16 МиБ");
  const validImage=mime==="image/png"?
   buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
   buffer[0]===255&&buffer[1]===216&&buffer[2]===255;
  if(!validImage)throw Error("Заголовок исходного изображения не соответствует заявленному типу");
  const task=new AbortController();
  active=task;
  let scratch="";
  try{
   const installed=await models.resolveRuntime("paddleocr-vl-1.6");
   if(task.signal.aborted)throw Error("OCR отменён");
   if(!installed?.installed||installed.protocol!=="ir-paddleocr-vl-json-1")
    throw Error(installed?.reason||"Подписанный офлайн-пакет PaddleOCR-VL 1.6 отсутствует или несовместим");
   const root=path.join(getUserDataPath(),"ir-project-ai","ocr-work");
   fs.mkdirSync(root,{recursive:true});
   scratch=fs.mkdtempSync(path.join(root,"job-"));
   const image=path.join(scratch,mime==="image/png"?"sheet.png":"sheet.jpg"),
    resultFile=path.join(scratch,"result.json");
   fs.writeFileSync(image,buffer,{flag:"wx",mode:0o600});
   const args=["--input",image,"--output",resultFile,
    "--layout",installed.layoutDir,"--vision",installed.visionDir];
   await new Promise((resolve,reject)=>{
    let settled=false,stderr="",child=null;
    const finish=error=>{
     if(settled)return;
     settled=true;clearTimeout(timer);
     task.signal.removeEventListener("abort",abort);
     if(error)reject(error);else resolve()
    };
    const abort=()=>{
     try{child?.kill()}catch{}
     finish(Error("OCR отменён"))
    };
    // Fail closed on timeout. No shell, no configured network endpoints.
    const timer=setTimeout(()=>{
     try{child?.kill()}catch{}
     finish(Error("Локальный PaddleOCR превысил лимит времени"))
    },timeoutMs);
    task.signal.addEventListener("abort",abort,{once:true});
    try{
     child=spawn(installed.files.binary.path,args,{
      cwd:installed.cwd,windowsHide:true,shell:false,
      stdio:["ignore","ignore","pipe"],
      env:{...process.env,HF_HUB_OFFLINE:"1",TRANSFORMERS_OFFLINE:"1",
       PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK:"True",
       PADDLEOCR_HOME:path.join(scratch,"cache"),
       NO_PROXY:"*",no_proxy:"*",
       HTTP_PROXY:"",HTTPS_PROXY:"",ALL_PROXY:"",
       http_proxy:"",https_proxy:"",all_proxy:""}
     });
     child.stderr?.on("data",part=>{stderr=(stderr+String(part)).slice(-1500)});
     child.once("error",e=>finish(Error("Не удалось запустить подписанный OCR-движок: "+e.message)));
     child.once("close",code=>finish(code===0?null:
      Error("Локальный PaddleOCR завершился с кодом "+code+": "+stderr.slice(-350))));
     if(task.signal.aborted)abort()
    }catch(error){finish(error)}
   });
   if(task.signal.aborted)throw Error("OCR отменён");
   const st=fs.lstatSync(resultFile);
   if(!st.isFile()||st.isSymbolicLink()||st.size<2||st.size>MAX_RESULT)
    throw Error("OCR вернул недопустимый объём или тип результата");
   const raw=fs.readFileSync(resultFile,"utf8");
   let data;
   try{data=JSON.parse(raw)}catch{throw Error("OCR не вернул корректный JSON")}
   if(data?.schema!=="ir-paddleocr-vl-json-1"||!Array.isArray(data.blocks))
    throw Error("OCR-пакет использует неподдерживаемый формат результатов");
   const blocks=data.blocks.slice(0,600).map(b=>{
    const bbox=Array.isArray(b?.bbox)&&b.bbox.length>=4?
     b.bbox.slice(0,4).map(Number):null;
    return{text:String(b?.text||"").slice(0,1400),
     type:String(b?.type||"text").slice(0,60),
     bbox:bbox&&bbox.every(Number.isFinite)?bbox:null}
   }).filter(b=>b.text);
   const text=String(data.text||blocks.map(b=>b.text).join("\n")).slice(0,60000);
   if(task.signal.aborted)throw Error("OCR отменён");
   return{engine:"paddleocr-vl-1.6",modelId:installed.modelId,
    modelVersion:installed.version,sourceImageSha256:crypto.createHash("sha256")
     .update(buffer).digest("hex"),text,blocks,complete:data.complete===true,
    unverified:true,offline:true}
  }finally{
   if(active===task)active=null;
   if(scratch)try{fs.rmSync(scratch,{recursive:true,force:true})}catch{}
  }
 }
 return{status,recognize,cancel,inspect}
}
module.exports={createPaddleOcr};
