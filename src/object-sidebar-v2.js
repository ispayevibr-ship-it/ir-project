"use strict";
(()=>{
const labels={overview:"Обзор",reports:"Ежедневные отчёты","work-types":"Виды работ",marks:"Ведомость марок",deliveries:"Поставки",schedule:"График работ",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
const paths={
overview:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
reports:'<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4"/><path d="M9 11h6M9 15h6M9 19h4"/>',
"work-types":'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="10" cy="18" r="1.5"/>',
marks:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
deliveries:'<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
schedule:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h3M13 14h3M8 18h3"/>',
photos:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m5 17 4-4 3 3 2-2 5 3"/>',
scheme:'<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6.5 7.5l4 8M17.5 7.5l-4 8"/>',
"acted-days":'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m8 15 2.5 2.5L16 12"/>',
penalties:'<path d="M12 3 2.8 20h18.4z"/><path d="M12 9v5M12 17h.01"/>',
finance:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4M16 14h2"/>'};
const svg=body=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const backSvg=svg('<path d="m15 18-6-6 6-6"/>');
const upSvg=svg('<path d="m6 15 6-6 6 6"/>');
function patch(){
 const aside=document.querySelector('.ir-object-sidebar-fixed');if(!aside)return;
 const all=aside.querySelector('.ir-object-all');if(all)all.innerHTML=`<span class="menu-icon">${backSvg}</span><b>Все объекты</b>`;
 const top=aside.querySelector('.ir-object-top');if(top)top.innerHTML=`<span class="menu-icon round">${upSvg}</span><b>Наверх</b>`;
 aside.querySelectorAll('.ir-object-nav button').forEach(b=>{
   const key=b.dataset.key||'';
   const label=labels[key]||b.querySelector('.nav-label')?.textContent||b.textContent.trim();
   b.innerHTML=`<span class="nav-icon">${svg(paths[key]||'<circle cx="12" cy="12" r="7"/>')}</span><span class="nav-label"></span>`;
   const t=b.querySelector('.nav-label');if(t)t.textContent=label;
 });
}
const mo=new MutationObserver(()=>patch());mo.observe(document.body,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>requestAnimationFrame(patch));
patch();
})();