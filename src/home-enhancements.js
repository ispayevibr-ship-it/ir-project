"use strict";
(()=>{
 let filter="active";
 function statusOf(card){return card.querySelector(".status")?.textContent.trim()||""}
 function applyFilter(){
  const grid=document.querySelector(".objects");if(!grid)return;
  grid.querySelectorAll(".object-card").forEach(card=>{const done=/заверш/i.test(statusOf(card));card.hidden=filter==="active"?done:filter==="done"?!done:false});
  const count=[...grid.querySelectorAll(".object-card")].filter(x=>!x.hidden).length;
  const p=document.querySelector(".section-head p");if(p)p.textContent=`Показано объектов: ${count}`;
 }
 function addFilter(){
  const head=document.querySelector(".section-head");if(!head||document.getElementById("objectStatusFilter"))return;
  head.classList.add("with-filter");
  const box=document.createElement("label");box.className="object-filter";box.innerHTML='<span>Статус</span><select id="objectStatusFilter"><option value="active">В работе</option><option value="done">Завершён</option><option value="all">Все</option></select>';
  head.appendChild(box);const select=box.querySelector("select");select.value=filter;select.onchange=()=>{filter=select.value;applyFilter()};applyFilter();
 }
 function applyAccess(){
  const admin=window.irAccess?.role?.()==="admin";
  document.querySelectorAll("#editObject,#deleteObject,#saveObject,#photoButton,#bannerButton,#toggleAllSections").forEach(el=>{if(!admin){el.disabled=true;el.setAttribute("data-access-lock","1")}else{el.disabled=false;el.removeAttribute("data-access-lock")}});
  const brand=document.querySelector(".brand");if(brand){brand.classList.toggle("brand-access-locked",!admin);brand.title=admin?"Профиль компании":"Профиль компании доступен администратору"}
 }
 document.addEventListener("click",e=>{if(window.irAccess?.role?.()!=="admin"&&e.target.closest(".brand")){e.preventDefault();e.stopImmediatePropagation()}},true);
 const observer=new MutationObserver(()=>{addFilter();applyFilter();applyAccess()});observer.observe(document.getElementById("app"),{childList:true,subtree:true});
 window.addEventListener("hashchange",()=>setTimeout(()=>{addFilter();applyFilter();applyAccess()},0));
 setTimeout(()=>{addFilter();applyFilter();applyAccess()},0);
})();
