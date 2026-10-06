"use strict";
(()=>{
 const PAGE_SIZE=15;
 let token=0,lastSig="";
 const route=()=>{
  const m=location.hash.match(/^#?\/objects\/object\/(\d+)\/deliveries(?:\?([^#]*))?$/);
  if(!m)return null;
  const params=new URLSearchParams(m[2]||"");
  if(params.get("mode")||params.get("id"))return null;
  return{oid:m[1],page:Math.max(1,Number(params.get("page"))||1)};
 };
 const hashFor=(oid,page)=>page>1?`/objects/object/${oid}/deliveries?page=${page}`:`/objects/object/${oid}/deliveries`;
 function apply(){
  const r=route();if(!r)return false;
  const list=document.querySelector(".delivery-list");
  if(!list)return false;
  const rows=[...list.querySelectorAll(".delivery-row[data-delivery-id]")];
  if(!rows.length){document.querySelector(".delivery-pagination")?.remove();return true}
  const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
  const current=Math.min(totalPages,r.page);
  if(current!==r.page){location.hash=hashFor(r.oid,current);return true}
  rows.forEach((row,i)=>{
   const visible=i>=(current-1)*PAGE_SIZE&&i<current*PAGE_SIZE;
   row.hidden=!visible;
   row.style.display=visible?"":"none";
  });
  document.querySelectorAll(".delivery-pagination").forEach(x=>x.remove());
  if(totalPages<=1)return true;
  const start=(current-1)*PAGE_SIZE+1,end=Math.min(current*PAGE_SIZE,rows.length);
  const wrap=document.createElement("div");wrap.className="delivery-pagination delivery-pagination-fixed";
  wrap.innerHTML=`<div class="delivery-pagination-info">Показано ${start}–${end} из ${rows.length}</div><div class="delivery-pagination-buttons"><button type="button" data-fixed-page="${current-1}" ${current===1?"disabled":""}>‹</button>${Array.from({length:totalPages},(_,i)=>i+1).map(p=>`<button type="button" data-fixed-page="${p}" class="${p===current?"active":""}">${p}</button>`).join("")}<button type="button" data-fixed-page="${current+1}" ${current===totalPages?"disabled":""}>›</button></div>`;
  (document.querySelector(".delivery-card")||list).insertAdjacentElement("afterend",wrap);
  wrap.querySelectorAll("button[data-fixed-page]").forEach(btn=>btn.addEventListener("click",e=>{
   e.preventDefault();e.stopPropagation();
   const p=Number(btn.dataset.fixedPage);if(!p||p<1||p>totalPages||p===current)return;
   location.hash=hashFor(r.oid,p);
   setTimeout(schedule,30);
  }));
  return true;
 }
 function schedule(){
  const mine=++token;let tries=0;
  const run=()=>{
   if(mine!==token)return;
   try{if(apply())return}catch(e){console.error("deliveries pagination fix",e)}
   if(++tries<40)setTimeout(run,100);
  };
  setTimeout(run,20);
 }
 window.addEventListener("hashchange",()=>{lastSig="";schedule()});
 setInterval(()=>{
  const r=route();if(!r)return;
  const count=document.querySelectorAll(".delivery-list .delivery-row[data-delivery-id]").length;
  const sig=`${location.hash}|${count}|${!!document.querySelector(".delivery-card")}`;
  if(sig!==lastSig){lastSig=sig;schedule()}
 },300);
 schedule();
})();
