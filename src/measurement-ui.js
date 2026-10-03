"use strict";
(()=>{
 const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)],meta=u=>window.irMeasure?.meta?.(u)||{totalLabel:"Общий объём",itemLabel:"Объём 1 ед."};
 function unitFromActiveMarks(){const card=q('.marks-work-card.on');if(!card)return"";if(card.dataset.work==="all"){const units=qa('.marks-work-card:not([data-work="all"]) .mwc-meta').map(x=>(x.textContent.split('·').pop()||'').trim()).filter(Boolean);const uniq=[...new Set(units)];return uniq.length===1?uniq[0]:""}return(card.querySelector('.mwc-meta')?.textContent.split('·').pop()||'').trim()}
 function textBeforeInput(label,text){if(!label)return;for(const n of [...label.childNodes])if(n.nodeType===3)n.remove();label.insertBefore(document.createTextNode(text),label.firstChild)}
 function apply(){
  const marks=q('.marks-page');if(marks){const unit=unitFromActiveMarks(),m=meta(unit),stats=qa('.marks-stat',marks),heads=qa('.marks-head>span',marks);if(stats[1]?.querySelector('span'))stats[1].querySelector('span').textContent=unit?m.totalLabel:'Общий объём / вес';if(heads[3])heads[3].textContent=unit?m.itemLabel:'Объём / вес 1 ед.';if(heads[4])heads[4].textContent=unit?m.totalLabel:'Общий объём / вес';const ed=q('#markEditForm',marks),active=q('.marks-work-card.on',marks);if(ed&&active&&unit)textBeforeInput(ed.querySelector('label:nth-of-type(4)'),m.itemLabel)}
  qa('.work-row').forEach(row=>{const unit=q('[name="unit"]',row)?.value||'',label=q('.rw-volume',row);if(label&&unit)textBeforeInput(label,meta(unit).totalLabel.replace('Общий ','')||'Объём')});
 }
 let t=0;const schedule=()=>{clearTimeout(t);t=setTimeout(apply,20)};new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','value']});document.addEventListener('change',schedule,true);window.addEventListener('hashchange',schedule);schedule();
})();