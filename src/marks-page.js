"use strict";
(()=>{
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const num=v=>Number(v)||0;
 let query="",filter="all";
 async function enhance(){
  const m=location.hash.match(/^#\/objects\/object\/(\d+)\/marks$/);if(!m)return;
  const app=document.getElementById("app");if(!app||app.dataset.marksDesigned===m[1])return;
  const oid=m[1];app.dataset.marksDesigned=oid;
  const o=await irProject.data.objects.get(oid);const rows=await irProject.data.forObject(oid).section("marks").list().catch(()=>[]);
  const items=rows.map(x=>({id:x.id,...(x.data||{}),title:x.title||x.data?.title||""}));
  function render(){
   const total=items.length,done=items.filter(x=>num(x.mounted??x.done)>=num(x.qty??x.count)&&num(x.qty??x.count)>0).length,work=items.filter(x=>{const d=num(x.mounted??x.done),q=num(x.qty??x.count);return d>0&&d<q}).length,left=items.filter(x=>num(x.mounted??x.done)===0).length;
   const qty=items.reduce((s,x)=>s+num(x.qty??x.count),0),mounted=items.reduce((s,x)=>s+Math.min(num(x.qty??x.count),num(x.mounted??x.done)),0),remain=Math.max(0,qty-mounted),pct=qty?Math.round(mounted/qty*100):0;
   let list=items.filter(x=>{const q=num(x.qty??x.count),d=num(x.mounted??x.done),state=q>0&&d>=q?"done":d>0?"work":"left";return(!query||`${x.mark||x.title||""} ${x.name||""}`.toLowerCase().includes(query))&&(filter==="all"||filter===state||(filter==="left"&&state!=="done"))});
   app.innerHTML=`<div class="marks-page"><div class="marks-top"><button class="back" id="marksBack">← ${esc(o?.name||"Объект")}</button><div><h1>Ведомость марок</h1><p>${esc(o?.name||"")}</p></div></div><div class="marks-stats">${[["Позиций марок",total],["Полностью смонтировано",done],["В работе",work],["Не начато",left],["По проекту, шт.",qty],["Смонтировано, шт.",mounted],["Осталось, шт.",remain],["Готовность",pct+"%"]].map((x,i)=>`<div class="marks-stat ${i===7?"good":""}"><span>${x[0]}</span><b>${x[1]}</b></div>`).join("")}</div><div class="marks-tools"><input id="marksSearch" value="${esc(query)}" placeholder="Поиск по марке или наименованию…"><button data-mf="all" class="${filter==="all"?"on":""}">Все</button><button data-mf="done" class="${filter==="done"?"on":""}">Смонтировано</button><button data-mf="work" class="${filter==="work"?"on":""}">В работе</button><button data-mf="left" class="${filter==="left"?"on":""}">Осталось</button></div><div class="marks-table"><div class="marks-head"><span>Марка</span><span>Наименование</span><span>Кол-во</span><span>Поступило</span><span>Статус</span><span>Факт монтажа</span><span>%</span><span>Прогресс</span></div>${list.length?list.map(x=>{const q=num(x.qty??x.count),d=Math.min(q,num(x.mounted??x.done)),got=num(x.received??x.got),p=q?Math.min(100,Math.round(d/q*100)):0,state=q>0&&d>=q?"done":d>0?"work":"left";return `<div class="marks-row"><b>${esc(x.mark||x.title||"—")}</b><span>${esc(x.name||"")}</span><span>${q}</span><span>${got}</span><span><i class="marks-status ${state}">${state==="done"?"Смонтировано":state==="work"?"В работе":"Не начато"}</i></span><span>${d} / ${q}</span><strong>${p}%</strong><span class="marks-bar ${state}"><i style="width:${p}%"></i></span></div>`}).join(""):'<div class="marks-empty">Марки пока не загружены</div>'}</div></div>`;
   document.getElementById("marksBack").onclick=()=>location.hash=`/objects/object/${oid}`;
   const s=document.getElementById("marksSearch");s.oninput=e=>{query=e.target.value.toLowerCase();app.dataset.marksDesigned="";enhance()};
   document.querySelectorAll("[data-mf]").forEach(b=>b.onclick=()=>{filter=b.dataset.mf;app.dataset.marksDesigned="";enhance()});
  }render();
 }
 setInterval(()=>enhance().catch(console.error),250);
})();
