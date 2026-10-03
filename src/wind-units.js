"use strict";
(()=>{
 const unit=v=>{const s=String(v??"").trim();if(!s)return"";return /(?:м\s*\/\s*с|m\s*\/\s*s)$/i.test(s)?s:`${s} м/с`};
 const plain=v=>String(v??"").replace(/\s*(?:м\s*\/\s*с|m\s*\/\s*s)\s*$/i,"").trim();
 function apply(){
  const input=document.querySelector('#dailyReportForm [name="wind"]');
  if(input&&!input.dataset.windUnitReady){input.dataset.windUnitReady="1";input.value=plain(input.value);input.placeholder="Например: 5";input.inputMode="decimal";const label=input.closest("label");if(label){const text=[...label.childNodes].find(n=>n.nodeType===3);if(text)text.nodeValue="Ветер, м/с"}}
  document.querySelectorAll('.report-cell-weather small').forEach(el=>{const t=el.textContent.trim();if(!t||t==="—")return;const prefix=t.startsWith("≈")?"≈ ":"";const raw=t.replace(/^≈\s*/,"");const next=prefix+unit(raw);if(el.textContent!==next)el.textContent=next});
  const view=document.querySelector('.rv-summary-weather em');if(view){const t=view.textContent.trim();if(/^Ветер:\s*/i.test(t)&&!/не указан/i.test(t)){const raw=t.replace(/^Ветер:\s*/i,"");const next=`Ветер: ${unit(raw)}`;if(view.textContent!==next)view.textContent=next}}
  document.querySelectorAll('.report-meta span').forEach(el=>{const t=el.textContent.trim();if(t.startsWith("🌬")){const raw=t.replace(/^🌬\s*/,"");const next=`🌬 ${unit(raw)}`;if(el.textContent!==next)el.textContent=next}});
 }
 let timer=0;const schedule=()=>{clearTimeout(timer);timer=setTimeout(apply,40)};
 new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
 window.addEventListener("hashchange",schedule);document.addEventListener("change",schedule,true);
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule);else schedule();
})();