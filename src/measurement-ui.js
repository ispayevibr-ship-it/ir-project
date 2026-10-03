"use strict";
(()=>{
 const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)],meta=u=>window.irMeasure?.meta?.(u)||{totalLabel:"Общий объём",itemLabel:"Объём 1 ед."};
 function unitFromActiveMarks(){const card=q('.marks-work-card.on');if(!card)return"";if(card.dataset.work==="all"){const units=qa('.marks-work-card:not([data-work="all"]) .mwc-meta').map(x=>(x.textContent.split('·').pop()||'').trim()).filter(Boolean);const uniq=[...new Set(units)];return uniq.length===1?uniq[0]:""}return(card.querySelector('.mwc-meta')?.textContent.split('·').pop()||'').trim()}
 function directText(label){return[...label.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()}
 function textBeforeInput(label,text){if(!label||directText(label)===text)return false;for(const n of [...label.childNodes])if(n.nodeType===3)n.remove();label.insertBefore(document.createTextNode(text),label.firstChild);return true}
 function setText(el,text){if(el&&el.textContent!==text)el.textContent=text}
 function apply(){
  const marks=q('.marks-page');if(marks){const unit=unitFromActiveMarks(),m=meta(unit),stats=qa('.marks-stat',marks),heads=qa('.marks-head>span',marks);setText(stats[1]?.querySelector('span'),unit?m.totalLabel:'Общий объём / вес');setText(heads[3],unit?m.itemLabel:'Объём / вес 1 ед.');setText(heads[4],unit?m.totalLabel:'Общий объём / вес');const ed=q('#markEditForm',marks),active=q('.marks-work-card.on',marks);if(ed&&active&&unit)textBeforeInput(ed.querySelector('label:nth-of-type(4)'),m.itemLabel)}
  qa('.work-row').forEach(row=>{const unit=q('[name="unit"]',row)?.value||'',label=q('.rw-volume',row);if(label&&unit)textBeforeInput(label,meta(unit).totalLabel.replace('Общий ','')||'Объём')});
 }
 let t=0;const schedule=()=>{clearTimeout(t);t=setTimeout(apply,30)};new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});document.addEventListener('change',schedule,true);window.addEventListener('hashchange',schedule);schedule();
})();