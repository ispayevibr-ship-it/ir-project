"use strict";
(()=>{
  let timer=0,busy=false,lastBannerKey="";
  function patchHints(){
    const photo=document.querySelector("#photoPreview")?.closest("label")?.querySelector(".file-hint");
    const banner=document.querySelector("#bannerPreview")?.closest("label")?.querySelector(".file-hint");
    if(photo)photo.textContent="Размер в программе: 900×400 px. Сохраняется только подготовленная версия.";
    if(banner)banner.textContent="Размер в программе: 1920×180 px. Сохраняется только подготовленная версия.";
  }
  async function migrateBanner(){
    const m=location.hash.match(/^#\/objects\/object\/(\d+)$/);if(!m)return;
    const objectId=m[1],bannerEl=document.querySelector(".object-page-banner");
    if(!bannerEl||!window.irProject?.data?.forObject||!window.irProject?.images?.optimize)return;
    const api=window.irProject.data.forObject(objectId).section("photos");
    if(busy)return;busy=true;
    try{
      const rows=await api.list();
      const rec=rows.find(x=>x.record_type==="banner"||x.data?.photo_type==="banner");
      let file=rec?.data?.file_path||rec?.data?.file||"";if(!rec||!file)return;
      const key=`${objectId}:${rec.id}:${file}`;if(lastBannerKey===key)return;
      const old=file,optimized=await window.irProject.images.optimize(file,"banner");
      if(optimized&&optimized!==file){
        await api.update(rec.id,{record_type:rec.record_type||"banner",title:rec.title||"banner",data:{...(rec.data||{}),photo_type:"banner",file_path:optimized}});
        file=optimized;
        if(window.irProject.images.remove)await window.irProject.images.remove(old);
      }
      const url=await window.irProject.images.read(file);
      if(url)bannerEl.style.backgroundImage=`linear-gradient(180deg,rgba(10,17,27,.03),rgba(10,17,27,.20)),url("${url}")`;
      lastBannerKey=`${objectId}:${rec.id}:${file}`;
    }catch(e){console.warn("Object banner:",e)}finally{busy=false}
  }
  function apply(){patchHints();migrateBanner()}
  function schedule(){clearTimeout(timer);timer=setTimeout(apply,25)}
  new MutationObserver(schedule).observe(document.getElementById("app")||document.body,{childList:true,subtree:true});
  window.addEventListener("hashchange",()=>{lastBannerKey="";schedule()});
  schedule();
})();
