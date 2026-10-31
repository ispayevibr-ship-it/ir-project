"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const files=Object.fromEntries(["main.js","preload.js","src/app.js","src/access.js","src/object-shell.js",
 "src/tabs-shell.js","src/ai-recognition-page.js","src/ai-recognition-page.css","src/ai-model-settings.js","src/index.html","src/ir-runtime.js","src/ai-claude-engine.js","src/ai-montage.js","src/ai-ipc.js","src/updater.js"].map(p=>[p,fs.readFileSync(p,"utf8")]));
for(const path of ["main.js","preload.js","src/ai-recognition-page.js","src/app.js","src/ir-runtime.js"])new vm.Script(files[path],{filename:path});
assert(files["main.js"].includes('require("./src/ai-ipc")')&&files["src/ai-ipc.js"].includes('require("./ai-document-store")'),"AI services are loaded by Electron main process");
assert(files["main.js"].includes('registerAi();')&&files["main.js"].includes('updates.resolveFile("src/ai-ipc.js")')&&files["main.js"].includes("ipcMain.removeHandler(channel)"),"IPC wired, AI services can come with a hot update");
assert(files["src/updater.js"].includes("irHotBranch")&&files["src/updater.js"].includes("commits/${encodeURIComponent(BRANCH)}")&&files["src/updater.js"].includes("ref=${encodeURIComponent(commit||BRANCH)}"),"hot updates come from the build's branch, one commit for the manifest and the files");
assert(files["main.js"].includes('ai.documents?.deleteObjectFiles(id)'),"cascade storage cleanup after object deletion");
assert(files["preload.js"].includes('aiDocuments,aiEngine,aiSettings,aiMontage,ai,sections,data:'),"context-isolated documents, Claude and montage bridge");
assert(files["src/app.js"].includes('key==="ai-recognition"&&window.irAiRecognitionPage'),"route connected");
// «Фотографии объекта» opened straight (a tab of its own): the first render runs before src/photos-page.js is loaded —
// the section waits for its page, not a bare title «photos» (27.10.2026).
for(const f of ["src/app.js","src/ir-runtime.js"])assert(files[f].includes('if(key==="photos"&&typeof window.irPhotosPage==="function")return window.irPhotosPage(id);app.innerHTML=`<button class="back" id="back">'),f+": photos on the first render");
assert(files["src/object-shell.js"].includes('makeButton("ИИ-распознавание","ai-recognition"'),"sidebar route");
assert(files["src/tabs-shell.js"].includes('"ai-recognition":"ИИ-распознавание"'),"tab naming");
assert(files["src/access.js"].includes('"ai-recognition"'),"role configuration");
assert(files["src/index.html"].includes('ai-recognition-page.js?v=1112200'),"UI script loads");
assert(files["src/index.html"].includes('ai-recognition-page.css?v=1112200'),"module css loads");
assert(files["src/index.html"].includes('ai-model-settings.js?v=191690'),"Claude settings loaded");
// Sub-pages: drawings, analysis, Claude, placement, journal.
for(const step of ["Чертежи","Анализ","Обработка Claude","Монтажная схема","Журнал"])assert(files["src/ai-recognition-page.js"].includes('"'+step+'"'),"step: "+step);
for(const call of ["montage.analyze(id,","montage.process(id,","montage.place(id,","montage.undo(id,","montage.skipAI(id,"])
 assert(files["src/ai-recognition-page.js"].includes(call),"wired: "+call);
assert(!/aiPdf|ai-pdf:|regionAnalyze|data-ai-tab/.test(files["src/ai-recognition-page.js"]+files["preload.js"]),"old tabs, previews and per-region AI removed");
for(const channel of ["ai-montage:analyze","ai-montage:process","ai-montage:place","ai-montage:undo"])
 assert(files["preload.js"].includes('"'+channel+'"')&&files["src/ai-ipc.js"].includes('"'+channel+'"'),"IPC: "+channel);
assert(files["src/ai-claude-engine.js"].includes("safeStorage.encryptString"),"API key stored only encrypted");
assert(!files["preload.js"].includes("decryptString")&&!files["preload.js"].includes("ai-settings:get-key"),"API key never returned to the renderer");
assert(files["src/ai-ipc.js"].includes('handle("ai-settings:set-key",(e,{key,model}={})=>{checkAdmin(e);')&&files["main.js"].includes("checkAdmin:checkAiAdmin"),"key change requires an admin session in the main process");
assert(files["main.js"].includes('ipcMain.handle("ai-settings:authorize"')&&!files["src/ai-ipc.js"].includes("roleHashes"),"the admin password check stays in the installer");
assert(files["src/ai-montage.js"].includes("координаты не меняй"),"AI may not move the elements the geometry found");
assert(files["src/ai-montage.js"].includes("import_requires_verification:false"),"placed elements are not drafts");
assert(!/processAI\(\)\s*$/m.test(files["src/ai-recognition-page.js"])&&!files["src/ai-recognition-page.js"].includes("Step 2 starts by itself"),"Claude runs only on request");
assert(files["preload.js"].includes('"ai-documents:set-kinds"')&&files["src/ai-ipc.js"].includes('"ai-documents:set-kinds"'),"drawing kinds are set by the engineer");
assert(!files["src/ai-montage.js"].includes("function docType("),"no automatic drawing kind detection");
assert(files["src/ai-recognition-page.js"].includes('"Журнал"')||files["src/ai-recognition-page.js"].includes(">Журнал<"),"journal is shown");
for(const channel of ["ai-documents:set-excluded","ai-documents:sheets","ai-documents:preview"])
 assert(files["preload.js"].includes('"'+channel+'"')&&files["src/ai-ipc.js"].includes('"'+channel+'"'),"IPC: "+channel);
assert(files["src/ai-recognition-page.js"].includes("data-ms-sheet"),"sheets are selected by checkboxes");
assert(!files["src/ai-recognition-page.css"].includes("max-width:980px"),"page uses full width");
assert(files["src/object-shell.js"].includes('key==="ai-recognition")continue'),"AI recognition appears once in the sidebar");
assert(files["src/ai-recognition-page.js"].includes("data-ms-remove-all")&&files["src/ai-recognition-page.js"].includes("data-ms-remove-picked"),"drawings are removed one by one, picked or all");
assert(!/ai-settings:spend|data-ms-balance/.test(files["preload.js"]+files["src/ai-ipc.js"]+files["src/ai-recognition-page.js"]),"no spending card");
assert(!/qwen|llama/i.test(files["main.js"]+files["preload.js"]),"local model runtime removed");
assert(files["preload.js"].includes("AI_CHANNEL=/^ai-(documents|engine|settings|montage|knowledge|github|diag):"),"generic AI bridge is limited to AI channels");
// Installers up to 1.9.9 pass only these channels: the windows send knowledge, GitHub and diagnostics as ai-settings:<group>-<name>.
{const OLD=/^ai-(documents|engine|settings|montage):[a-z-]{1,40}$/,map=ch=>ch.replace(/^ai-(knowledge|github|diag):/,"ai-settings:$1-");
 for(const f of ["src/ai-model-settings.js","src/ai-recognition-page.js"])assert(files[f].includes('replace(/^ai-(knowledge|github|diag):/,"ai-settings:$1-")'),"old preload passes channels: "+f);
 for(const ch of new Set((files["src/ai-model-settings.js"]+files["src/ai-recognition-page.js"]).match(/"ai-[a-z-]+:[a-z-]+"/g).map(x=>x.slice(1,-1))))assert(OLD.test(map(ch)),"old preload passes "+ch);
 assert(files["src/ai-ipc.js"].includes('ipcMain.handle("ai-settings:"+m[1]+"-"+m[2],fn)'),"main process serves the ai-settings aliases")}
assert(files["src/ai-recognition-page.js"].includes("data-ms-ai-note")&&files["src/ai-recognition-page.js"].includes('invoke("ai-montage:process",{objectId:id,draftId:view.draftId,restart:restart===true,comment})'),"comment for Claude on the processing page");
assert(files["src/ai-ipc.js"].includes("comment:typeof comment===\"string\"?comment:undefined"),"the comment reaches the montage");
assert(files["src/ir-runtime.js"].includes('key==="ai-recognition"&&window.irAiRecognitionPage'),"runtime bundle current");
// «ИИ-распознавание» is part of the montage scheme (the engineer, 27.10.2026): opened from the scheme's head, back to it
// from the page; in the object menu only while the scheme itself is not shown there.
{const scheme=fs.readFileSync("src/scheme-page.js","utf8");
 assert(scheme.includes('id="schemeAiRecognition" href="#/objects/object/${esc(oid)}/ai-recognition"'),"the scheme opens the recognition");
 assert(files["src/ir-runtime.js"].includes('id="schemeAiRecognition"'),"runtime bundle has the scheme's button");
 assert(files["src/ai-recognition-page.js"].includes("data-ms-back")&&files["src/ai-recognition-page.js"].includes('"/scheme"'),"back to the scheme");
 assert(files["src/object-shell.js"].includes('key==="marks"&&!schemeShown')&&files["src/object-shell.js"].includes('key="scheme"'),"menu: under the scheme, not after the marks")}
const m=JSON.parse(fs.readFileSync("hot/latest.json","utf8"));
const cmp=(a,b)=>{const A=a.split(".").map(Number),B=b.split(".").map(Number);for(let i=0;i<3;i++)if(A[i]!==B[i])return A[i]-B[i];return 0};
assert(cmp(m.version,JSON.parse(fs.readFileSync("package.json","utf8")).version)>=0,"hot version is not older than the installer");
assert(!m.files.some(x=>["main.js","preload.js"].includes(x.target)),"hot updater can't replace native process");
console.log("AI: drawings → analysis → Claude → montage scheme sub-pages, isolated bridge passed.");
// The chat with Claude: loaded in the window, its channels pass the old preload and are served by the main process.
{const panel=fs.readFileSync("src/ai-chat-panel.js","utf8"),OLD=/^ai-(documents|engine|settings|montage):[a-z-]{1,40}$/;
 new vm.Script(panel,{filename:"src/ai-chat-panel.js"});
 assert(files["src/index.html"].includes('ai-chat-panel.js?v=1112100'),"chat panel loads");
 const chs=[...new Set(panel.match(/"ai-[a-z-]+:[a-z-]+"/g).map(x=>x.slice(1,-1)))];
 assert(chs.length>=6,"chat channels");
 // Above each answer — its question in another colour, a click shows the question in the list (the engineer, 27.10.2026).
 assert(panel.includes('x.from==="user"&&x.id===m.reply_to')&&panel.includes('<div class="irc-q" data-goto="')&&panel.includes(".irc-q{")&&panel.includes('closest("[data-goto]")'),"the question above the answer");
 for(const ch of chs){assert(OLD.test(ch),"old preload passes "+ch);assert(files["src/ai-ipc.js"].includes('handle("'+ch+'"'),"main serves "+ch)}
 const hot=JSON.parse(fs.readFileSync("hot/latest.json","utf8")).files.map(f=>f.source);
 for(const f of ["src/ai-chat.js","src/ai-chat-panel.js"])assert(hot.includes(f),"hot update carries "+f);
 // The screenshot is of the montage scheme only, not of the whole program (the engineer, 25.10.2026): the window gives
 // the place of the scheme within it, the main process takes that part (by the zoom of the page).
 const rectSrc=panel.match(/const shotRect=\(\)=>\{[\s\S]*?\n \};/)[0];
 const shotRect=vm.runInNewContext("(function(){"+rectSrc+";return shotRect})()",{Math,window:{innerWidth:1600,innerHeight:900},
  document:{getElementById:id=>id==="schemePreviewStage"?{getBoundingClientRect:()=>({left:200.4,top:-30,right:1250,bottom:950})}:null,querySelector:()=>null}});
 assert.deepEqual({...shotRect()},{x:200,y:0,width:1050,height:900},"the stage of the scheme within the window");
 assert(panel.includes('invoke("ai-montage:chat-shot-take",{rect:shotRect()})'),"the panel sends the place of the scheme");
 const ipc=files["src/ai-ipc.js"],hs=ipc.indexOf('handle("ai-montage:chat-shot-take"'),he=ipc.indexOf("\n });",hs);
 const handler=vm.runInNewContext("(function(){var r;function handle(c,f){r=f};var chat={keepShot:b=>'s'+b.length};"+ipc.slice(hs,he+5)+";return r})()",{Math,Number});
 const shots=[];const sender={getZoomFactor:()=>1.25,capturePage:async box=>{shots.push(box);return{getSize:()=>({width:1000,height:600}),toJPEG:()=>Buffer.from("jpg")}}};
 (async()=>{await handler({sender},{rect:{x:200,y:0,width:1050,height:900}});await handler({sender},{rect:null});await handler({sender});
  assert.deepEqual({...shots[0]},{x:250,y:0,width:1313,height:1125},"the part of the scheme, by the zoom of the page");
  assert.equal(shots[1],undefined);assert.equal(shots[2],undefined,"without the place — the whole window")})().catch(e=>{console.error(e);process.exit(1)})}
console.log("Chat with Claude: panel, channels and hot files OK");
