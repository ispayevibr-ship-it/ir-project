"use strict";
// Real Windows smoke test for the official Qwen3-VL GGUF pair.
// Run with: node scripts/test-qwen-windows.js <llama-server.exe> <model.gguf> <mmproj.gguf>
const fs=require("node:fs"),cp=require("node:child_process"),net=require("node:net");
const {createCanvas}=require("@napi-rs/canvas");
async function port(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once("error",reject);server.listen(0,"127.0.0.1",()=>{const p=server.address().port;server.close(()=>resolve(p))})})}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 if(process.platform!=="win32")throw Error("Этот тест предназначен для Windows");
 const [exe,model,vision]=process.argv.slice(2);
 for(const f of [exe,model,vision])if(!f||!fs.statSync(f).isFile())throw Error("Укажите существующие llama-server.exe, model.gguf и mmproj.gguf");
 const p=await port();
 const args=["-m",model,"--mmproj",vision,"--host","127.0.0.1","--port",String(p),"--ctx-size","4096","--n-gpu-layers","0","--no-webui"];
 const child=cp.spawn(exe,args,{windowsHide:true,stdio:["ignore","ignore","pipe"],shell:false});
 let logs="";child.stderr.on("data",x=>{logs=(logs+String(x)).slice(-12000)});
 try{
  let ready=false;
  for(let i=0;i<180;i++){
   if(child.exitCode!==null)throw Error("llama-server завершился: "+child.exitCode+" "+logs.slice(-1500));
   try{const res=await fetch("http://127.0.0.1:"+p+"/health",{signal:AbortSignal.timeout(1200)});if(res.ok){ready=true;break}}catch{}
   await wait(1000);
  }
  if(!ready)throw Error("llama-server не запустился за 180 секунд: "+logs.slice(-1500));
  const canvas=createCanvas(800,400),ctx=canvas.getContext("2d");
  ctx.fillStyle="white";ctx.fillRect(0,0,800,400);
  ctx.fillStyle="black";ctx.font="bold 130px Arial";ctx.fillText("K41",230,245);
  const png=canvas.toBuffer("image/png");
  const response=await fetch("http://127.0.0.1:"+p+"/v1/chat/completions",{
   method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({model:"local-qwen3-vl",temperature:0,max_tokens:180,
    messages:[{role:"user",content:[{type:"text",text:"Read the large alphanumeric mark in this image. Return only the mark."},
     {type:"image_url",image_url:{url:"data:image/png;base64,"+png.toString("base64")}}]}]}),
   signal:AbortSignal.timeout(180000)
  });
  if(!response.ok)throw Error("Ошибка API "+response.status+": "+(await response.text()).slice(0,1000));
  const result=await response.json(),answer=String(result.choices?.[0]?.message?.content||"");
  if(!/\bK\s*41\b/i.test(answer))throw Error("Реальное распознавание не подтвердило K41: "+answer.slice(0,400));
  console.log("PASS: Qwen3-VL 4B llama.cpp Windows CPU распознал K41");
 }finally{child.kill()}
}
main().catch(e=>{console.error("FAIL:",e.message);process.exitCode=1});
