"use strict";
(()=>{
  let lastSignature="";
  async function enhance(){
    const section=document.querySelector(".objects-section"),grid=section?.querySelector(".objects"),head=section?.querySelector(".section-head");
    if(!section||!grid||!head||head.dataset.filtersReady)return;
    head.dataset.filtersReady="1";
    const addButton=head.querySelector("#add");
    if(addButton&&window.irAccess?.role?.()==="guest")addButton.remove();
    const cards=[...grid.querySelectorAll(".object-card")];
    const meta=cards.map(card=>({card,id:card.dataset.object,status:card.querySelector(".status")?.textContent.trim()||"В работе"}));
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
