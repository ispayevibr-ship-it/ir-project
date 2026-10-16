"use strict";
// Run locally with a supplied PDF path. No source PDF or extracted text is
// committed or required by the hot-update workflow.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const {axisGeometry,detectPlanGridAxes}=require('../src/ai-scheme-lite-page');
const gridData={entity_type:'grid',axes_x:['1','2','3','4','5','6'],
 x_spans_mm:[9000,9000,9000,9000,9000],
 axes_y:['А','Б','В','Г','Д','Е','Ж','И','К','Л'],
 y_spans_mm:[7500,7500,6000,6000,7500,6000,7500,6000,6000]};
const grid=axisGeometry([{data:gridData}]);
function verify({raw,vector}){
 const region={left:0,top:0,right:.5,bottom:1};
 const r=detectPlanGridAxes({raw,vector,grid,region});
 assert.equal(r.calibrated,true,JSON.stringify(r));
 assert.deepEqual(r.xMatches.map(x=>x.name),gridData.axes_x);
 assert.deepEqual(r.yMatches.map(x=>x.name),gridData.axes_y);
 assert(r.fitX.residualPt<.15&&r.fitY.residualPt<.15);
 assert.equal(r.reviewRequired,true);
 assert(!r.markLocations,'axis calibration must never place members');
 assert.equal(detectPlanGridAxes({raw,vector,grid}).calibrated,false,
  'whole sheet contains two separate plans; select a region');
 const wrong=axisGeometry([{data:{...gridData,x_spans_mm:Array(5).fill(45000)}}]);
 assert.equal(detectPlanGridAxes({raw,vector,grid:wrong,region}).calibrated,false);
 assert.equal(detectPlanGridAxes({raw,vector:{...vector,stats:{
  ...vector.stats,truncated:true,axisEvidenceComplete:false}},grid,region}).calibrated,false);
 console.log(JSON.stringify({axesX:r.xMatches.length,axesY:r.yMatches.length,
  residualPt:{x:r.fitX.residualPt,y:r.fitY.residualPt},stats:vector.stats}));
}
function worker(file,data){return new Promise((resolve,reject)=>{
 const w=new Worker(path.join(__dirname,'..','src',file),{workerData:data});
 let done=false;
 const timer=setTimeout(()=>{w.terminate();reject(Error('PDF worker timeout'))},60000);
 w.on('message',m=>{if(m.type==='result'||m.type==='error'){
  done=true;clearTimeout(timer);w.terminate();
  m.type==='error'?reject(Error(m.message)):resolve(m)
 }});
 w.on('error',e=>{clearTimeout(timer);reject(e)});
 w.on('exit',code=>{clearTimeout(timer);if(!done)reject(Error('Worker exited '+code))});
})}
(async()=>{
 if(!process.argv[2])throw Error('Usage: node scripts/test-ai-real-plan-grid.js /path/to/local.pdf');
 {
  const bytes=fs.readFileSync(process.argv[2]);
  const [text,vector]=await Promise.all([
   worker('ai-pdf-worker.js',{bytes}),worker('ai-pdf-vector-worker.js',{bytes,page:1})]);
  assert.equal(text.pages.length,6);
  assert.equal(text.pages[0].truncated,false);
  verify({raw:text.pages[0],vector});
  console.log('Production workers: all 6 text pages, page 1 vector scan PASS');
 }
 console.log('Real KMD first plan: 6 numeric + 10 letter axes, wrong grid and combined plans rejected PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
