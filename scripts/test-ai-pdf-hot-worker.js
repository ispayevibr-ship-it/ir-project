"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const {Worker}=require('node:worker_threads');
const {createPdfGeometry}=require('../src/ai-pdf-geometry');
const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
assert(main.includes('hotAiModule("ai-pdf-geometry").createPdfGeometry('));
assert(main.includes('resolveWorker:()=>updates.resolveFile("src/ai-pdf-vector-worker.js")'));
assert(main.includes('require.resolve("pdfjs-dist/legacy/build/pdf.mjs")'));
// Reproduce app-updates/current/src OUTSIDE the installer/node_modules tree.
// This dependency-free fake PDF parser tests the production worker/IPC path.
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ir-pdf-hot-'));
(async()=>{try{
 const hot=path.join(tmp,'user data','current','src'),app=path.join(tmp,'app');
 fs.mkdirSync(hot,{recursive:true});fs.mkdirSync(app);
 for(const file of ['ai-pdf-vector-worker.js','ai-pdf-vector-paths.js'])
  fs.copyFileSync(path.join(__dirname,'..','src',file),path.join(hot,file));
 const parser=path.join(app,'parser.mjs');
 fs.writeFileSync(parser,`export const OPS={constructPath:91,stroke:20};
 export const VerbosityLevel={ERRORS:0};
 export function getDocument(){return {destroy:async()=>{},promise:Promise.resolve({numPages:1,
 getPage:async()=>({getViewport:()=>({width:300,height:300,rotation:0,transform:[1,0,0,-1,0,300]}),
 getOperatorList:async()=>({fnArray:Array(8).fill(91),argsArray:Array.from({length:8},(_,i)=>
 [20,[new Float32Array([0,40,20+i*25,1,40,35+i*25])],new Float32Array([40,20+i*25,40,35+i*25])])}),cleanup(){}})})}}`);
 const api=createPdfGeometry({database:{getObject:()=>({id:1})},
  documents:{readForPdfIndex:async()=>({buffer:Buffer.from('%PDF test'),source:{sha256:'a'.repeat(64)}}),verify:()=>true},
  resolveWorker:()=>path.join(hot,'ai-pdf-vector-worker.js'),
  pdfjsModuleUrl:pathToFileURL(parser).href});
 const result=await api.page(1,1,1);
 assert.equal(result.stats.axisEvidenceComplete,true);
 assert.equal(result.axisBands.vertical.length,1);
 assert.equal(result.safeForAutoPlacement,false);
 console.log('Hot geometry: worker outside installer loads bundled parser and hot axis decoder PASS');
}finally{fs.rmSync(tmp,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
