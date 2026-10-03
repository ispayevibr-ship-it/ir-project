"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>Number(String(v??0).replace(",","."))||0;
 const fmt=v=>Number.isInteger(num(v))?String(num(v)):String(Number(num(v).toFixed(4))).replace(".",",");
 const route=()=>{const m=location.hash.match(/^#?\/objects\/object\/(\d+)\/reports(?:\/(\d+))?/);return m?{oid:m[1],rid:m[2]||""}:null};
 const data=r=>({id:String(r.id),...(r.data||{})});
 const peopleTotal=r=>{
  const workers=arr(r.workers).length?arr(r.workers):arr(r.people);
  const responsible=arr(r.responsible).length?arr(r.responsible):arr(r.responsibles);
  const workersCount=workers.reduce((s,x)=>s+num(x.count??x.qty),0);
  const responsibleCount=responsible.reduce((s,x)=>{
   const explicit=num(x.count??x.qty);
   if(explicit>0)return s+explicit;
   return s+(String(x.name||x.role||"").trim()?1:0);
  },0);
  return workersCount+responsibleCount;
 };
 let busy=false,timer=0;
 async function apply(){
  const rt=route();if(!rt||busy)return;busy=true;
  try{
   const raw=await irProject.data.forObject(rt.oid).section("reports").list().catch(()=>[]),map=new Map(raw.map(x=>[String(x.id),data(x)]));
   document.querySelectorAll('.reports-list .report-row[data-report-id]').forEach(row=>{
    const r=map.get(String(row.dataset.reportId)),b=row.querySelector('.report-cell-people b');if(!r||!b)return;
    const next=fmt(peopleTotal(r));if(b.textContent!==next)b.textContent=next;
   });
   if(rt.rid){const r=map.get(String(rt.rid)),b=document.querySelector('.rv-summary-people b');if(r&&b){const next=`${fmt(peopleTotal(r))} чел.`;if(b.textContent!==next)b.textContent=next}}
  }finally{busy=false}
 }
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(apply,25)};
 new MutationObserver(schedule).observe(document.getElementById('app')||document.body,{subtree:true,childList:true});
 window.addEventListener('hashchange',schedule);schedule();
})();