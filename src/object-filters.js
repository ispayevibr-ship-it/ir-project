"use strict";
(()=>{
  const SECTION_KEYS=["reports","work-types","marks","deliveries","schedule","photos","scheme","acted-days","penalties","finance"];
  let lastSignature="";
  async function latestActivity(objectId){
    let latest=0;
    const results=await Promise.all(SECTION_KEYS.map(k=>irProject.data.forObject(objectId).section(k).list().catch(()=>[])));
    for(const rows of results)for(const r of rows){const t=Date.parse(r.updated_at||r.created_at||"")||0;if(t>latest)latest=t}
    return latest;
  }
  async function enhance(){
    const section=document.querySelector(".objects-section"),grid=section?.querySelector(".objects"),head=section?.querySelector(".section-head");
    if(!section||!grid||!head||head.dataset.filtersReady)return;
    head.dataset.filtersReady="1";
    const addButton=head.querySelector("#add");
    if(addButton&&window.irAccess?.role?.()==="guest")addButton.remove();
    const cards=[...grid.querySelectorAll(".object-card")];
    const meta=await Promise.all(cards.map(async card=>({card,id:card.dataset.object,status:card.querySelector(".status")?.textContent.trim()||"В работе",activity:await latestActivity(card.dataset.object)})));
    meta.sort((a,b)=>{
      const aa=a.status!=="Завершен",bb=b.status!=="Завершен";
      if(aa!==bb)return aa?-1:1;
      if(a.activity!==b.activity)return b.activity-a.activity;
      return Number(b.id)-Number(a.id);
    });
    meta.forEach(x=>grid.appendChild(x.card));
    const left=head.querySelector("div");
    if(left){left.innerHTML='<div class="object-filter-tabs"><button class="object-filter active" data-filter="all">Все</button><button class="object-filter" data-filter="active">В работе</button><button class="object-filter" data-filter="done">Завершен</button></div><p class="object-count"></p>'}
    const apply=filter=>{
      let shown=0;
      meta.forEach(x=>{const visible=filter==="all"||(filter==="active"&&x.status!=="Завершен")||(filter==="done"&&x.status==="Завершен");x.card.hidden=!visible;if(visible)shown++});
      head.querySelectorAll(".object-filter").forEach(b=>b.classList.toggle("active",b.dataset.filter===filter));
      const count=head.querySelector(".object-count");if(count)count.textContent=`Показано объектов: ${shown}`;
    };
    head.querySelectorAll(".object-filter").forEach(b=>b.onclick=()=>apply(b.dataset.filter));
    apply("all");
  }
  setInterval(()=>{const sig=location.hash+":"+(document.querySelector(".objects")?.childElementCount||0)+":"+(window.irAccess?.role?.()||"");if(sig!==lastSignature){lastSignature=sig;enhance().catch(console.error)}},300);
})();
