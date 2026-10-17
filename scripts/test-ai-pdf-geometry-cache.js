'use strict';
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createPdfGeometry}=require('../src/ai-pdf-geometry');
let sha='a'.repeat(64),count=0,valid=true,malformed=false;
const rows=[];
const database={getObject:()=>({}),listEntity:id=>rows.filter(r=>r.objectId===id),
 createEntity:(objectId,entity,entry)=>{const row={...entry,objectId};rows.push(row);return row}};
const documents={readForPdfIndex:async()=>({buffer:Buffer.from('%PDF sample'),source:{sha256:sha}}),verify:()=>valid};
const workerFactory=()=>{count++;const w=new EventEmitter();w.terminate=()=>{};
 setImmediate(()=>w.emit('message',{type:'result',page:1,widthPt:300,heightPt:400,
 coordinateSystem:'viewport_points_top_left',segments:[{x1:malformed?NaN:0,y1:0,x2:20,y2:20}]}));return w};
const make=()=>createPdfGeometry({database,documents,workerFactory});
(async()=>{
 const first=await make().page(1,4,1);assert.equal(first.cached,false);
 const restart=await make().page(1,4,1);assert.equal(restart.cached,true);assert.equal(count,1);
 assert.equal(restart.safeForAutoPlacement,false);
 await make().page(2,4,1);assert.equal(count,2,'object isolation');
 sha='b'.repeat(64);await make().page(1,4,1);assert.equal(count,3,'changed bytes invalidate cache');
 valid=false;await assert.rejects(make().page(1,4,1),/изменился/);valid=true;
 rows.at(-1).data.result.segments[0].x1=null;
 await make().page(1,4,1);assert.equal(count,4,'corrupt cache is rebuilt');
 sha='c'.repeat(64);malformed=true;
 const before=rows.length;await assert.rejects(make().page(1,4,1),/Недопустимые/);
 assert.equal(rows.length,before,'invalid worker output never persisted');
 console.log('PDF geometry cache: restart, checksum, isolation, corruption, verification PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
