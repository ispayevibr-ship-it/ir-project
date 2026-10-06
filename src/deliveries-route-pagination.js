"use strict";
(()=>{
 const base=window.irDeliveriesPage;if(typeof base!=="function")return;
 const PAGE_SIZE=15;
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const baseHash=oid=>`/objects/object/${oid}/deliveries`;
 const detailHash=(oid,id)=>`${baseHash(oid)}?id=${encodeURIComponent(id)}`;
 const pageHash=(oid,page)=>page>1?`${baseHash(oid)}?page=${page}`:baseHash(oid);
 function wireDetail(oid,id){
  const back=document.getElementById("deliveryDetailBack");if(back)back.onclick=()=>location.hash=baseHash(oid);
  const del=document.getElementById("deliveryDetailDelete");if(del&&typeof del.onclick==="function"){
   const old=del.onclick;del.onclick=async e=>{await old.call(del,e);if(!document.querySelector(".delivery-detail-card"))location.hash=baseHash(oid)};
  }
  const title=document.querySelector(".deliveries-head h1");if(title)title.dataset.deliveryId=String(id);
 }
 function paginate(oid,page){
  const list=document.querySelector(".delivery-list");if(!list)return;
  const rows=[...list.querySelectorAll(".delivery-row")];
  if(!rows.length)return;
  const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE)),current=Math.max(1,Math.min(totalPages,Number(page)||1));
  rows.forEach((row,i)=>{
   row.hidden=i<(current-1)*PAGE_SIZE||i>=current*PAGE_SIZE;
   row.addEventListener("click",e=>{
    if(e.target.closest(".delivery-actions"))return;
    e.preventDefault();e.stopImmediatePropagation();location.hash=detailHash(oid,row.dataset.deliveryId);
   },true);
  });
  document.querySelector(".delivery-pagination")?.remove();
  if(totalPages<=1)return;
  const wrap=document.createElement("div");wrap.className="delivery-pagination";
  const nums=Array.from({length:totalPages},(_,i)=>i+1);
  wrap.innerHTML=`<div class="delivery-pagination-info">Показано ${Math.min((current-1)*PAGE_SIZE+1,rows.length)}–${Math.min(current*PAGE_SIZE,rows.length)} из ${rows.length}</div><div class="delivery-pagination-buttons"><button type="button" data-page="${current-1}" ${current<=1?"disabled":""}>‹</button>${nums.map(n=>`<button type="button" data-page="${n}" class="${n===current?"active":""}">${n}</button>`).join("")}<button type="button" data-page="${current+1}" ${current>=totalPages?"disabled":""}>›</button></div>`;
  const card=document.querySelector(".delivery-card");card?.insertAdjacentElement("afterend",wrap);
  wrap.querySelectorAll("button[data-page]").forEach(b=>b.onclick=()=>{const p=Number(b.dataset.page);if(p>=1&&p<=totalPages)location.hash=pageHash(oid,p)});
 }
 window.irDeliveriesPage=async(oid,route={})=>{
  await base(oid);
  const id=String(route.deliveryId||"");
  if(id){
   const row=[...document.querySelectorAll(".delivery-row[data-delivery-id]")].find(x=>String(x.dataset.deliveryId)===id);
   if(!row){location.hash=baseHash(oid);return}
   row.click();
   wireDetail(oid,id);
   return;
  }
  paginate(oid,route.page||1);
 };
})();
