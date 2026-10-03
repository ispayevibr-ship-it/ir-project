"use strict";
(()=>{
 const PAGE_SIZE=15;
 const pages=new Map();
 let timer=0;
 const objectKey=()=>location.hash.match(/^#?\/objects\/object\/(\d+)\/reports/)?.[1]||"reports";
 const schedule=(delay=20)=>{clearTimeout(timer);timer=setTimeout(apply,delay)};
 function controls(list,total,page,totalPages){
  let bar=list.parentElement.querySelector(':scope > .reports-pagination');
  if(totalPages<=1){bar?.remove();return}
  if(!bar){bar=document.createElement('div');bar.className='reports-pagination';list.insertAdjacentElement('afterend',bar)}
  const start=(page-1)*PAGE_SIZE+1,end=Math.min(page*PAGE_SIZE,total),sig=`${total}:${page}:${totalPages}`;
  if(bar.dataset.sig===sig)return;
  bar.dataset.sig=sig;
  const nums=[];for(let p=1;p<=totalPages;p++){if(totalPages<=7||p===1||p===totalPages||Math.abs(p-page)<=1)nums.push(p);else if(nums[nums.length-1]!==0)nums.push(0)}
  bar.innerHTML=`<div class="reports-pagination-info">Показано ${start}–${end} из ${total}</div><div class="reports-pagination-buttons"><button type="button" data-page="prev" ${page===1?'disabled':''} aria-label="Предыдущая страница">←</button>${nums.map(p=>p===0?'<span class="reports-pagination-dots">…</span>':`<button type="button" data-page="${p}" class="${p===page?'active':''}">${p}</button>`).join('')}<button type="button" data-page="next" ${page===totalPages?'disabled':''} aria-label="Следующая страница">→</button></div>`;
  bar.querySelectorAll('button[data-page]').forEach(btn=>btn.onclick=()=>{const key=objectKey(),cur=pages.get(key)||1,v=btn.dataset.page;const next=v==='prev'?cur-1:v==='next'?cur+1:Number(v);pages.set(key,Math.max(1,Math.min(totalPages,next)));apply(true)});
 }
 function apply(fromClick=false){
  const list=document.querySelector('.reports-page .reports-list');if(!list)return;
  const rows=[...list.querySelectorAll(':scope > .report-row')],total=rows.length,key=objectKey();
  if(!total){list.parentElement.querySelector(':scope > .reports-pagination')?.remove();return}
  const totalPages=Math.ceil(total/PAGE_SIZE);let page=pages.get(key)||1;if(page>totalPages)page=totalPages;if(page<1)page=1;pages.set(key,page);
  rows.forEach((row,i)=>{const visible=totalPages<=1||Math.floor(i/PAGE_SIZE)+1===page;if(visible)row.style.removeProperty('display');else row.style.setProperty('display','none','important')});
  controls(list,total,page,totalPages);
  if(fromClick){document.querySelector('.reports-toolbar')?.scrollIntoView({block:'nearest'})}
 }
 document.addEventListener('input',e=>{if(e.target?.id==='reportsSearch'){pages.set(objectKey(),1);schedule(30)}},true);
 window.addEventListener('hashchange',()=>schedule(30));
 new MutationObserver(()=>schedule()).observe(document.getElementById('app')||document.body,{subtree:true,childList:true});
 schedule(50);
})();