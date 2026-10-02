"use strict";
(()=>{
  async function enhance(){
    const api=window.irProject?.data?.objects||window.irProject?.objects;
    const imageApi=window.irProject?.images;
    if(!api)return;
    for(const card of document.querySelectorAll(".object-card[data-object]")){
      if(card.dataset.photoReady==="1")continue;
      card.dataset.photoReady="1";
      try{
        const o=await api.get(card.dataset.object);
        const cover=card.querySelector(".object-cover");
        if(!cover||!o?.photo)continue;
        const url=imageApi?.read?await imageApi.read(o.photo):"";
        if(!url)continue;
        cover.style.backgroundImage=`linear-gradient(180deg,rgba(10,17,27,.08),rgba(10,17,27,.70)),url("${url}")`;
        cover.classList.add("has-object-photo");
      }catch(e){console.warn("Object photo:",e)}
    }
  }
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
  enhance();
})();
