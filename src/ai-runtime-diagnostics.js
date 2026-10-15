"use strict";
/* IR Project AI: actual local GPU/RAM probe and real multimodal smoke test.
   No cloud requests or simulated neural responses in production. */
const os=require("node:os");
const childProcess=require("node:child_process");
const {promisify}=require("node:util");
const {createCanvas}=require("@napi-rs/canvas");
const execute=promisify(childProcess.execFile);
const GB=1024**3;
function normalizeLines(output){
 return String(output||"").replace(/\r/g,"").split("\n").map(x=>x.trim()).filter(Boolean)
}
function parseGpuCsv(data){
 return normalizeLines(data).slice(0,8).map(line=>{
  const parts=line.split(",").map(x=>x.trim());
  if(parts.length!==4)throw Error("Неожиданный формат ответа NVIDIA");
  const [name,total,free,driver]=parts;
  const totalMiB=Number(total),freeMiB=Number(free);
  if(!name||!Number.isFinite(totalMiB)||!Number.isFinite(freeMiB)||
    totalMiB<1||freeMiB<0||freeMiB>totalMiB||totalMiB>1048576)
   throw Error("Некорректные показатели NVIDIA");
  return{name:name.slice(0,150),vramTotalMiB:Math.round(totalMiB),
   vramFreeMiB:Math.round(freeMiB),driver:String(driver).slice(0,50)}
 })
}
function createDiagnostics({engine,platform=()=>process.platform,
 totalmem=()=>os.totalmem(),freemem=()=>os.freemem(),cpus=()=>os.cpus().length,
 execFile=execute,canvasFactory=createCanvas,clock=()=>Date.now()}={}){
 if(!engine||typeof engine.status!=="function"||typeof engine.analyzeImage!=="function")
  throw Error("AI runtime diagnostics require local engine");
 let running=false,last=null;
 async function hardware(){
  const result={platform:platform(),ramTotalGiB:Math.round(totalmem()/GB*10)/10,
   ramFreeGiB:Math.round(freemem()/GB*10)/10,cpuThreads:cpus(),gpu:[],
   gpuStatus:"unknown",gpuReason:"Данные NVIDIA ещё не получены",
   model:engine.status()?.model||"",modelVersion:engine.status()?.modelVersion||null};
  try{
   // Windows drivers often install nvidia-smi outside PATH.
   // Probe the standard driver location without invoking a shell.
   const candidates=["nvidia-smi"];
   if(platform()==="win32"){
    const path=require("node:path");
    const fs=require("node:fs");
    const programFiles=process.env.ProgramFiles||"C:\\Program Files";
    const installed=path.join(programFiles,"NVIDIA Corporation","NVSMI","nvidia-smi.exe");
    if(fs.existsSync(installed))candidates.push(installed);
   }
   let out,lastError;
   for(const candidate of candidates){
    try{
     out=await execFile(candidate,[
      "--query-gpu=name,memory.total,memory.free,driver_version",
      "--format=csv,noheader,nounits"],{
      timeout:6000,maxBuffer:16384,windowsHide:true,encoding:"utf8",shell:false
     });
     break;
    }catch(error){lastError=error}
   }
   if(!out)throw lastError||Error("nvidia-smi недоступен");
   result.gpu=parseGpuCsv(out.stdout??out);
   result.gpuStatus=result.gpu.length?"available":"unknown";
   result.gpuReason=result.gpu.length?"NVIDIA обнаружена; CUDA-ускорение модели ещё не подтверждено":
    "NVIDIA не обнаружена. Запуск возможен на CPU при совместимом движке."
  }catch(error){
   result.gpuReason=String(error?.code==="ENOENT"?
    "nvidia-smi недоступен; это не обязательно означает отсутствие видеокарты":
    "Не удалось получить сведения NVIDIA: "+String(error?.message||error)).slice(0,280)
  }
  return result
 }
 function makeTarget(){
  const canvas=canvasFactory(960,480),ctx=canvas.getContext("2d");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,960,480);
  ctx.strokeStyle="#182f41";ctx.lineWidth=16;
  ctx.strokeRect(65,65,830,350);
  ctx.fillStyle="#102b48";ctx.font="bold 165px Arial";ctx.textAlign="center";
  ctx.textBaseline="middle";ctx.fillText("K41",480,218);
  ctx.font="36px Arial";ctx.fillText("KMД • TEST",480,353);
  return Buffer.from(canvas.toBuffer("image/png"))
 }
 async function smokeTest(){
  if(running)throw Error("Диагностика ИИ уже выполняется");
  const state=engine.status();
  if(state?.state!=="ready"||!state?.installed)
   throw Error("Сначала установите и запустите локальную модель. Тест не выполняется без настоящего работающего ИИ");
  if(state.active)throw Error("Модель занята другим распознаванием");
  running=true;
  const start=clock();
  try{
   const img=makeTarget();
   if(img.length<16||img.length>16*1024*1024)throw Error("Не удалось создать тестовый PNG");
   const result=await engine.analyzeImage({
    buffer:img,mime:"image/png",
    prompt:"Это диагностический тест IR Project. На изображении есть крупное обозначение строительной марки. Укажи только то обозначение, которое действительно прочитано с изображения. Используй JSON {text, marks, notes, unknowns}. Если обозначение не распознано, укажи его в unknowns и не угадывай."
   });
   const raw=String(result?.raw||"").slice(0,6000);
   const found=/\bK[\s-]*41\b|К[\s-]*41\b/i.test(raw);
   last={success:found,elapsedMs:Math.max(0,clock()-start),
    modelId:result?.modelId||state.model,modelVersion:result?.modelVersion||state.modelVersion||null,
    recognizedMark:found?"К41":null,
    diagnostic:found?"Реальная модель ответила и распознала маркировку К41 на тестовом PNG.":
     "Модель ответила, но маркировка К41 не подтверждена. Проверьте настройки и качество распознавания.",
    responseExcerpt:raw.slice(0,900),local:true,at:new Date().toISOString()};
   return last
  }catch(error){
   last={success:false,elapsedMs:Math.max(0,clock()-start),
    modelId:state.model,modelVersion:state.modelVersion||null,
    diagnostic:"Реальное распознавание не прошло: "+String(error?.message||error).slice(0,350),
    local:true,at:new Date().toISOString()};
   return last
  }finally{running=false}
 }
 function status(){return{running,last}}
 return{hardware,smokeTest,status,parseGpuCsv}
}
module.exports={createDiagnostics,parseGpuCsv};
