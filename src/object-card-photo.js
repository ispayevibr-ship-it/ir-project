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
        const objectId=card.dataset.object,photosApi=root.forObject(objectId).section("photos");
        const photos=await photosApi.list();
        const photo=photos.find(x=>x.record_type==="cover"||x.data?.photo_type==="cover");
        let file=photo?.data?.file_path||photo?.data?.file||"";
        const cover=card.querySelector(".object-cover");
        if(!cover||!file)continue;
        if(imageApi?.optimize&&photo){const optimized=await imageApi.optimize(file,"cover");if(optimized&&optimized!==file){file=optimized;await photosApi.update(photo.id,{record_type:photo.record_type||"cover",title:photo.title||"cover",data:{...(photo.data||{}),photo_type:"cover",file_path:file}})}}
        const url=imageApi?.read?await imageApi.read(file):"";
        if(!url)continue;
        cover.style.backgroundImage=`linear-gradient(180deg,rgba(10,17,27,.08),rgba(10,17,27,.70)),url("${url}")`;
        cover.style.backgroundSize="100% 100%,900px 155px";
        cover.style.backgroundPosition="center,center";
        cover.style.backgroundRepeat="no-repeat,no-repeat";
        cover.classList.add("has-object-photo");
      }catch(e){console.warn("Object cover:",e)}
    }
  }
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
  enhance();
})();
