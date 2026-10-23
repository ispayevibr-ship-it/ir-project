"use strict";
/*
 * IR Project AI: Claude through the Claude Code program installed on this computer, signed in with the user's own
 * Claude subscription (Pro/Max) — no API key. The unmodified `claude` binary is run in print mode: one user message
 * with the sheet images on stdin (stream-json), no tools, the answer constrained to the JSON schema.
 * For personal use on one's own computer: the subscription login is never read or stored by IR Project.
 */
const fs=require("node:fs"),path=require("node:path"),{spawn,execFile}=require("node:child_process");
const ALIASES={"claude-opus-5-5":"opus","claude-sonnet-5-5":"sonnet"};
// Where Claude Code puts itself: the native installer, npm global, or what PATH finds.
function candidates(env=process.env){
 const home=env.USERPROFILE||env.HOME||"",out=[];
 if(env.IR_CLAUDE_CODE_PATH)out.push(env.IR_CLAUDE_CODE_PATH);
 if(process.platform==="win32"){
  out.push(path.join(home,".local","bin","claude.exe"));
  if(env.APPDATA)out.push(path.join(env.APPDATA,"npm","claude.cmd"));
  if(env.LOCALAPPDATA)out.push(path.join(env.LOCALAPPDATA,"Programs","claude","claude.exe"));
 }else out.push(path.join(home,".local","bin","claude"),"/usr/local/bin/claude","/opt/homebrew/bin/claude");
 for(const dir of String(env.PATH||env.Path||"").split(path.delimiter).filter(Boolean))
  for(const name of process.platform==="win32"?["claude.exe","claude.cmd"]:["claude"])out.push(path.join(dir,name));
 return[...new Set(out)]
}
// A command that can be started without a shell. An npm ".cmd" shim is replaced by Node running its cli.js
// (Electron itself serves as Node with ELECTRON_RUN_AS_NODE).
function locate(env=process.env){
 for(const file of candidates(env)){
  try{if(!fs.statSync(file).isFile())continue}catch{continue}
  if(!/\.cmd$/i.test(file))return{command:file,prefix:[],env:{}};
  const cli=path.join(path.dirname(file),"node_modules","@anthropic-ai","claude-code","cli.js");
  if(fs.existsSync(cli))return{command:process.execPath,prefix:[cli],env:process.versions.electron?{ELECTRON_RUN_AS_NODE:"1"}:{}}
 }
 return null
}
// The subscription login must win: an API key in the environment would take precedence in print mode.
function childEnv(extra){
 const env={...process.env,...extra};
 for(const k of ["ANTHROPIC_API_KEY","ANTHROPIC_AUTH_TOKEN","ANTHROPIC_BASE_URL","CLAUDE_CODE_USE_BEDROCK","CLAUDE_CODE_USE_VERTEX"])delete env[k];
 return env
}
// On Windows kill() stops only claude.exe (or cmd.exe of claude.cmd); the whole tree goes with taskkill.
function killTree(p,execFileProcess=execFile){
 if(!p||p.exitCode!==null&&p.exitCode!==undefined)return;
 if(process.platform==="win32"&&p.pid){try{execFileProcess("taskkill",["/pid",String(p.pid),"/T","/F"],{windowsHide:true},()=>{})}catch{}}
 try{p.kill()}catch{}
}
// The program may close while Claude Code is answering: it must not stay running.
const running=new Set();
process.once("exit",()=>{for(const p of running)killTree(p)});
function createClaudeCode({locateBinary=locate,spawnProcess=spawn,execFileProcess=execFile}={}){
 let child=null;
 // Installed version, for the settings screen; never starts a model.
 function check(){
  const bin=locateBinary();
  if(!bin)return Promise.resolve({available:false,reason:"Claude Code не найден на этом компьютере. Установите его с claude.com/code и войдите своей подпиской (claude, затем /login)."});
  return new Promise(resolve=>{
   execFileProcess(bin.command,[...bin.prefix,"--version"],{env:childEnv(bin.env),timeout:15000,windowsHide:true},(error,stdout)=>{
    if(error)return resolve({available:false,reason:"Claude Code не запускается: "+String(error.message||error).slice(0,200)});
    resolve({available:true,version:String(stdout).trim().slice(0,80),path:bin.command})
   })
  })
 }
 // One structured answer. content: Messages API content blocks (text and base64 images).
 function request({system,content,schema,model,timeout=900000}){
  const bin=locateBinary();
  if(!bin)return Promise.reject(Error("Claude Code не найден на этом компьютере"));
  if(child)return Promise.reject(Error("Claude Code уже выполняет запрос"));
  const args=[...bin.prefix,"-p","--input-format","stream-json","--output-format","stream-json","--verbose",
   "--tools","","--no-session-persistence","--permission-prompts","none",
   "--system-prompt",String(system||""),"--json-schema",JSON.stringify(schema),
   ...(ALIASES[model]?["--model",ALIASES[model]]:[])];
  return new Promise((resolve,reject)=>{
   let out="",err="",result=null,done=false;
   const p=spawnProcess(bin.command,args,{env:childEnv(bin.env),windowsHide:true,stdio:["pipe","pipe","pipe"]});
   child=p;running.add(p);
   const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);child=null;running.delete(p);killTree(p,execFileProcess);error?reject(error):resolve(value)};
   const timer=setTimeout(()=>finish(Error("Claude Code не ответил за "+Math.round(timeout/60000)+" мин")),timeout);
   p.on("error",error=>finish(Error("Claude Code не запустился: "+String(error.message||error).slice(0,200))));
   p.stderr.on("data",d=>{err=(err+d).slice(-4000)});
   p.stdout.on("data",d=>{
    out+=d;let i;
    while((i=out.indexOf("\n"))>=0){
     const line=out.slice(0,i).trim();out=out.slice(i+1);if(!line)continue;
     let event;try{event=JSON.parse(line)}catch{continue}
     if(event.type==="result")result=event
    }
   });
   p.on("close",code=>{
    if(!result)return finish(Error("Claude Code завершился без ответа"+(code?" (код "+code+")":"")+(err?": "+err.trim().split("\n").pop().slice(0,300):"")));
    const text=String(result.result||"");
    if(result.subtype!=="success"||result.is_error){
     if(/limit|лимит|usage/i.test(text))return finish(Error("Лимит подписки Claude исчерпан: "+text.slice(0,300)));
     if(/log ?in|auth|credential/i.test(text))return finish(Error("Claude Code не авторизован. Откройте терминал, запустите claude и выполните /login. "+text.slice(0,200)));
     return finish(Error("Claude Code: "+(text||result.subtype||"ошибка").slice(0,400)))
    }
    let data=result.structured_output;
    if(data===undefined){try{data=JSON.parse(text)}catch{return finish(Error("Claude Code вернул ответ не по схеме. Повторите обработку."))}}
    const u=result.usage||{};
    finish(null,{data,model:Object.keys(result.modelUsage||{})[0]||model,
     usage:{input_tokens:u.input_tokens||0,output_tokens:u.output_tokens||0,cache_read_input_tokens:u.cache_read_input_tokens||0,cache_creation_input_tokens:u.cache_creation_input_tokens||0}})
   });
   // The whole request is one user message; stdin closes after it, so the run ends after the answer.
   p.stdin.on("error",()=>{});
   p.stdin.end(JSON.stringify({type:"user",message:{role:"user",content},parent_tool_use_id:null})+"\n")
  })
 }
 function cancel(){if(child)killTree(child,execFileProcess)}
 return{check,request,cancel}
}
module.exports={createClaudeCode,locate,candidates,childEnv};
