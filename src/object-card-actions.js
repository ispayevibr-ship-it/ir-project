"use strict";
(()=>{
  function enhance(){
    document.querySelectorAll(".object-card[data-object]").forEach(card=>{
      if(card.querySelector(".object-card-actions"))return;
      const id=card.dataset.object;
      const info=card.querySelector(".object-info");
      if(!info)return;
      const actions=document.createElement("div");
      actions.className="object-card-actions";
      actions.innerHTML='<button type="button" class="object-card-edit">✎ Редактировать</button><button type="button" class="object-card-delete">Удалить</button>';
      actions.addEventListener("click",e=>e.stopPropagation());
      actions.querySelector(".object-card-edit").onclick=async e=>{
        e.preventDefault();e.stopPropagation();
        if(typeof window.openObjectForm==="function")await window.openObjectForm(id);
      };
      actions.querySelector(".object-card-delete").onclick=async e=>{
        e.preventDefault();e.stopPropagation();
        const api=window.irProject?.data?.objects||window.irProject?.objects;
        if(!api)return;
        const object=await api.get(id);
        if(!object)return;
        if(!confirm(`Удалить объект «${object.name}»?\n\nВсе данные этого объекта будут удалены.`))return;
        await api.remove(id);
        card.remove();
        location.reload();
      };
      card.appendChild(actions);
    });
  }
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
  enhance();
})();
