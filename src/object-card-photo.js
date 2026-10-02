"use strict";
(()=>{
  function toFileUrl(p){
    if(!p)return "";
    const normalized=String(p).replace(/\\/g,"/");
    if(/^file:\/\//i.test(normalized))return normalized;
    return `file:///${normalized.split("/").map((part,i)=>i===0?part:encodeURIComponent(part)).join("/")}`;
  }
  async function enhance(){
    const api=window.irProject?.data?.objects||window.irProject?.objects;
    if(!api)return;
    for(const card of document.querySelectorAll(".object-card[data-object]")){
      if(card.dataset.photoReady==="1")continue;
      card.dataset.photoReady="1";
      try{
        const o=await api.get(card.dataset.object);
        const cover=card.querySelector(".object-cover");
        if(!cover||!o?.photo)continue;
        const url=toFileUrl(o.photo);
        cover.style.backgroundImage=`linear-gradient(180deg,rgba(10,17,27,.08),rgba(10,17,27,.70)),url("${url.replace(/\"/g,"%22")}")`;
        cover.classList.add("has-object-photo");
      }catch(e){console.warn("Object photo:",e)}
    }
  }
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
  enhance();
})();
