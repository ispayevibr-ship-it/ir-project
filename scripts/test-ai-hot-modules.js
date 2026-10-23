"use strict";
/*
 * Hot update of the AI services: every main-process AI module is in the hot manifest, and the set
 * works when it is loaded from another folder (like userData/app-updates/current) with the installed
 * packages found only through NODE_PATH — including the PDF workers and their pdfjs import.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,".."),manifest=JSON.parse(fs.readFileSync(path.join(root,"hot/latest.json"),"utf8"));
const targets=new Set(manifest.files.map(f=>f.target));
// Every module required by ai-ipc.js, directly or through other AI modules and workers.
const needed=new Set(),queue=["src/ai-ipc.js"];
while(queue.length){
 const file=queue.pop();if(needed.has(file))continue;needed.add(file);
 const text=fs.readFileSync(path.join(root,file),"utf8");
 for(const m of text.matchAll(/require\("\.\/([\w-]+)"\)|"(ai-[\w-]+\.js)"\)/g))queue.push("src/"+(m[1]?m[1]+".js":m[2]))
}
for(const file of needed)assert(targets.has(file),"hot manifest carries "+file);
assert(!targets.has("main.js")&&!targets.has("preload.js"),"main.js and preload.js only come with the installer");
const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
const cmp=(a,b)=>{const A=a.split(".").map(Number),B=b.split(".").map(Number);for(let i=0;i<3;i++)if(A[i]!==B[i])return A[i]-B[i];return 0};
assert(cmp(manifest.version,pkg.version)>=0,"hot version is not older than the app");

// Copy the set to a folder without node_modules above it and run it there.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ir-hot-"));
fs.mkdirSync(path.join(dir,"src"));
for(const file of needed)fs.copyFileSync(path.join(root,file),path.join(dir,file));
const {schemeFixture}=require("./test-ai-scheme-extract");
fs.writeFileSync(path.join(dir,"plan.pdf"),schemeFixture());
const child=`
const path=require("node:path"),fs=require("node:fs"),wt=require("node:worker_threads");
// Like Electron: worker threads do not get NODE_PATH, only what the main process passes them.
const Original=wt.Worker;
wt.Worker=class extends Original{constructor(file,options={}){const env={...process.env};delete env.NODE_PATH;super(file,{...options,env})}};
const {API,register}=require(path.join(process.argv[1],"src/ai-ipc.js"));
const channels=[];
const db={getObject:()=>({id:1}),listEntity:()=>[],createEntity:()=>({}),updateEntity:()=>({}),deleteEntity:()=>true};
const out=register({ipcMain:{handle:c=>channels.push(c)},getUserDataPath:()=>process.argv[1],safeStorage:null,netFetch:null,
 dialog:{},shell:{},database:db,getWindow:()=>null,checkAdmin:()=>{}});
const docs={readForPdfIndex:async()=>({buffer:fs.readFileSync(path.join(process.argv[1],"plan.pdf")),source:{name:"plan.pdf",sha256:"x"}})};
const {createSchemeDrafts}=require(path.join(process.argv[1],"src/ai-scheme-draft.js"));
const {createPdfRenderer}=require(path.join(process.argv[1],"src/ai-pdf-renderer.js"));
const {resolvePackage}=require(path.join(process.argv[1],"src/ai-packages.js"));
(async()=>{
 const r=await createSchemeDrafts({database:db,documents:docs}).scan(1,1);
 const png=await createPdfRenderer({database:db,documents:docs}).preview(1,1,1);
 const sdk=require(resolvePackage("@anthropic-ai/sdk"));
 console.log(JSON.stringify({API,channels,engine:out.engine.status().state,schemes:r.pages[0].schemes.length,png:png.dataUrl.length,sdk:typeof(sdk.default||sdk)}))
})().catch(e=>{console.error(e);process.exit(1)});
`;
const result=spawnSync(process.execPath,["-e",child,dir],{cwd:dir,encoding:"utf8",timeout:120000,
 env:{...process.env,NODE_PATH:path.join(root,"node_modules")}});
fs.rmSync(dir,{recursive:true,force:true});
assert.equal(result.status,0,result.stderr);
const r=JSON.parse(result.stdout.trim().split("\n").pop());
assert.equal(r.API,1);
for(const c of ["ai-documents:list","ai-settings:set-key","ai-montage:process","ai-montage:place"])assert(r.channels.includes(c),"channel "+c);
assert(!r.channels.includes("ai-settings:authorize"),"the admin password check stays in main.js");
assert.equal(r.engine,"missing");assert(r.schemes>=1,"the PDF worker reads geometry from the hot folder");
assert(r.png>2000,"the render worker draws a sheet from the hot folder");assert.equal(r.sdk,"function","the Claude SDK is found from the hot folder");
console.log("AI hot modules: complete set in the manifest, loads from another folder; workers get package paths without NODE_PATH (as in Electron) PASS");
