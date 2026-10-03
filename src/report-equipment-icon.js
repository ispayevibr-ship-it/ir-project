"use strict";
(()=>{
 const crane=`<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="13" cy="51" r="6"/><circle cx="31" cy="51" r="6"/><circle cx="51" cy="51" r="6"/><path d="M5 45h48v6H5zM28 44V29l19-17 4 4-17 18v10M47 16h7v22M54 38v5"/><path d="M50 45a4 4 0 0 0 8 0M35 33h12l7 12H35zM38 36h6l4 7H38zM10 45V35h16v10"/></svg>`;
 function apply(){document.querySelectorAll('.reports-page .report-cell-equipment .report-list-icon').forEach(el=>{if(el.dataset.irCrane==='1')return;el.innerHTML=crane;el.dataset.irCrane='1'})}
 let timer=0;const schedule=()=>{clearTimeout(timer);timer=setTimeout(apply,20)};
 new MutationObserver(schedule).observe(document.getElementById('app')||document.body,{subtree:true,childList:true});
 window.addEventListener('hashchange',schedule);schedule();
})();