"use strict";
(()=>{
  async function enhance(){
    const root=window.irProject?.data;
    const imageApi=window.irProject?.images;
    if(!root?.forObject)return;
    for(const card of document.querySelectorAll(".object-card[data-object]")){
      if(card.dataset.photoReady==="1")continue;
      card.dataset.photoReady="1";
      try{
        const objectId=card.dataset.object;
        const photos=await root.forObject(objectId).photos.list();
        const photo=photos.find(x=>x.photo_type==="cover");
        const cover=card.querySelector(".object-cover");
        if(!cover||!photo?.file_path)continue;
        const url=imageApi?.read?await imageApi.read(photo.file_path):"";
        if(!url)continue;
        cover.style.backgroundImage=`linear-gradient(180deg,rgba(10,17,27,.08),rgba(10,17,27,.70)),url("${url}")`;
        cover.style.backgroundSize="cover";
        cover.style.backgroundPosition="center";
        cover.classList.add("has-object-photo");
      }catch(e){console.warn("Object cover:",e)}
    }
  }
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
  enhance();
})();
