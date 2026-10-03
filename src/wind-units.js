"use strict";
(()=>{
 const unit=v=>{const s=String(v??"").trim();if(!s)return"";return /(?:м\s*\/\s*с|m\s*\/\s*s)$/i.test(s)?s:`${s} м/с`};
 function apply(){const el=document.querySelector('.rv-summary-weather em');if(!el||el.dataset.windUnitReady==='1')return;const t=el.textContent.trim();if(/^Ветер:\s*/i.test(t)&&!/не указан/i.test(t)){el.textContent=`Ветер: ${unit(t.replace(/^Ветер:\s*/i,""))}`;el.dataset.windUnitReady='1'}}
 let timer=0;const schedule=()=>{clearTimeout(timer);timer=setTimeout(apply,20)};new MutationObserver(schedule).observe(document.getElementById('app')||document.body,{subtree:true,childList:true});window.addEventListener('hashchange',schedule);schedule();
})();