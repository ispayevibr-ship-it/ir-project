"use strict";
(()=>{
 const craneUrl="url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' fill='none' stroke='%23e89400' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='13' cy='51' r='6'/%3E%3Ccircle cx='31' cy='51' r='6'/%3E%3Ccircle cx='51' cy='51' r='6'/%3E%3Cpath d='M5 45h48v6H5zM28 44V29l19-17 4 4-17 18v10M47 16h7v22M54 38v5'/%3E%3Cpath d='M50 45a4 4 0 0 0 8 0M35 33h12l7 12H35zM38 36h6l4 7H38zM10 45V35h16v10'/%3E%3C/svg%3E\")";
 function apply(){
  document.querySelectorAll('.reports-page .report-cell-equipment .report-list-icon').forEach(el=>{
   el.innerHTML='';
   el.style.backgroundColor='#ffe8b8';
   el.style.backgroundImage=craneUrl;
   el.style.backgroundRepeat='no-repeat';
   el.style.backgroundPosition='center';
   el.style.backgroundSize='34px 34px';
   el.style.color='#e89400';
   el.dataset.irCrane='exact';
  });
 }
 let timer=0;const schedule=()=>{clearTimeout(timer);timer=setTimeout(apply,25)};
 new MutationObserver(schedule).observe(document.getElementById('app')||document.body,{subtree:true,childList:true});
 window.addEventListener('hashchange',schedule);schedule();
})();