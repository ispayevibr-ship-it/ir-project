"use strict";
(()=>{
  const patchHints=()=>{
    const photo=document.querySelector("#photoPreview")?.closest("label")?.querySelector(".file-hint");
    const banner=document.querySelector("#bannerPreview")?.closest("label")?.querySelector(".file-hint");
    if(photo&&photo.textContent!=="Размер в программе: 900×400 px. Сохраняется только подготовленная версия.")photo.textContent="Размер в программе: 900×400 px. Сохраняется только подготовленная версия.";
    if(banner&&banner.textContent!=="Размер в программе: 1920×180 px. Сохраняется только подготовленная версия.")banner.textContent="Размер в программе: 1920×180 px. Сохраняется только подготовленная версия.";
  };
  let scheduled=false;
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;patchHints()});
  };
  const app=document.getElementById("app");
  if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  window.addEventListener("hashchange",schedule);
  schedule();
})();
