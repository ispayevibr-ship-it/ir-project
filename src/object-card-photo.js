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
        const photos=await root.forObject(objectId).section("photos").list();
        const photo=photos.find(x=>x.record_type==="cover"||x.data?.photo_type==="cover");
        const file=photo?.data?.file_path||photo?.data?.file||"";
        const cover=card.querySelector(".object-cover");
        if(!cover||!file)continue;
        const url=imageApi?.read?await imageApi.read(file):"";
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
