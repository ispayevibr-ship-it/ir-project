"use strict";
(()=>{
 const KEYS=["reports","schedule","work-types","marks","deliveries"];
 const ALIASES={
  reports:["daily-reports","daily_reports","dailyreports","report"],
  schedule:["work-schedule","work_schedule","schedule-items","timeline"],
  "work-types":["work_types","worktypes","works"],
  marks:["mark-list","mark_list","statement-marks","statement_marks"],
  deliveries:["invoices","delivery","supplies"]
 };
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const sameObject=(a,b)=>norm(a?.name)===norm(b?.name)&&norm(a?.customer)===norm(b?.customer)&&norm(a?.address)===norm(b?.address);
 async function readOnce(oid,key){return irProject.data.forObject(oid).section(key).list()}
 async function readRetry(oid,key,tries=3){
  let firstError=false,lastError=null;
  for(let i=0;i<tries;i++){
   try{
    const rows=await readOnce(oid,key);
    if(Array.isArray(rows))return{rows,firstError,retried:i>0};
    return{rows:[],firstError,retried:i>0};
   }catch(e){if(i===0)firstError=true;lastError=e;if(i<tries-1)await sleep(90*(i+1))}
  }
  console.error(`IR data read failed: object ${oid}, section ${key}`,lastError);
  return{rows:[],firstError:true,retried:true,error:lastError};
 }
 async function copyRows(oid,key,rows){
  if(!rows?.length)return 0;
  const api=irProject.data.forObject(oid).section(key);let count=0;
  for(const r of rows){
   const payload={record_type:r.record_type||"item",title:r.title||"",data:{...(r.data||{})}};
   try{await api.create(payload);count++}catch(e){console.error(`IR recovery copy failed: ${key}`,e)}
  }
  return count;
 }
 async function readAny(oid,key){
  const primary=await readRetry(oid,key);
  if(primary.rows.length)return{...primary,key};
  for(const alias of ALIASES[key]||[]){
   const x=await readRetry(oid,alias,2);
   if(x.rows.length)return{...x,key:alias,alias:true};
  }
  return{...primary,key};
 }
 async function exactSibling(oid,current,objects){
  const matches=(objects||[]).filter(o=>String(o.id)!==String(oid)&&sameObject(o,current));
  return matches.length===1?matches[0]:null;
 }
 async function ensureObject(oid){
  const current=await irProject.data.objects.get(oid).catch(()=>null);if(!current)return{changed:false,refresh:false};
  const objects=await irProject.data.objects.list().catch(()=>[]),sibling=await exactSibling(oid,current,objects);
  let changed=false,refresh=false;
  for(const key of KEYS){
   const target=await readRetry(oid,key);
   if(target.rows.length){if(target.firstError||target.retried)refresh=true;continue}
   let source=null;
   for(const alias of ALIASES[key]||[]){const a=await readRetry(oid,alias,2);if(a.rows.length){source=a.rows;break}}
   if(!source&&sibling){const s=await readAny(sibling.id,key);if(s.rows.length)source=s.rows}
   if(source?.length){const copied=await copyRows(oid,key,source);if(copied){changed=true;refresh=true;console.warn(`IR recovery: restored ${copied} ${key} rows for object ${oid}`)}}
  }
  return{changed,refresh};
 }
 window.irObjectDataRecovery={ensureObject,readRetry,readAny};
 const overviewId=()=>location.hash.match(/^#\/objects\/object\/(\d+)\/?$/)?.[1]||"";
 let busy=false,lastRefresh="";
 async function run(){
  const oid=overviewId();if(!oid||busy)return;busy=true;
  try{
   const result=await ensureObject(oid);
   if(result.refresh&&lastRefresh!==String(oid)){
    lastRefresh=String(oid);
    const render=typeof window.objectPage==="function"?window.objectPage:(typeof objectPage==="function"?objectPage:null);
    if(render)await render(oid);
    setTimeout(()=>window.dispatchEvent(new Event("hashchange")),40);
   }
  }catch(e){console.error("IR object data recovery",e)}finally{busy=false}
 }
 window.addEventListener("hashchange",()=>{lastRefresh="";setTimeout(run,60)});
 setTimeout(run,80);
})();
