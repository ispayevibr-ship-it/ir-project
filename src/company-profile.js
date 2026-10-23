"use strict";
(()=>{
let profile={name:"",logo:""},profileLoaded=false,brandPaintSerial=0;
const esc=v=>String(v||"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function load(){try{profile=await irProject.company.get()||profile;if(profile.logo&&irProject.images?.optimize){const old=profile.logo,optimized=await irProject.images.optimize(old,"logo");if(optimized&&optimized!==old){profile=await irProject.company.save({...profile,logo:optimized});if(irProject.images.remove)await irProject.images.remove(old)}}}catch(e){console.warn("Company profile:",e)}finally{profileLoaded=true;await paintBrand(true)}}
async function paintBrand(force=false){
 if(!profileLoaded)return;
 const brand=document.querySelector(".brand");
 if(!brand||(!force&&(brand.dataset.companyReady==="1"||brand.dataset.companyLoading==="1")))return;
 const serial=++brandPaintSerial;
 brand.dataset.companyLoading="1";
 let logo="";
 if(profile.logo)try{logo=await irProject.images.read(profile.logo)}catch(error){console.warn("Company logo read:",error)}
 let image=null;
 if(logo){
  const candidate=document.createElement("img");
  candidate.alt=profile.name||"Логотип компании";
  candidate.src=logo;
  try{
   // Wait until the image itself is decoded, not just its IPC read.
   if(typeof candidate.decode==="function")await candidate.decode();
   else if(!candidate.complete)await new Promise((resolve,reject)=>{
    candidate.onload=resolve;candidate.onerror=reject;
   });
   if(candidate.naturalWidth>0)image=candidate;
  }catch(error){console.warn("Company logo decode:",error)}
 }
 // Ignore a stale async result when the route changes or a new logo is saved.
 if(serial!==brandPaintSerial||!brand.isConnected||document.querySelector(".brand")!==brand)return;
 if(image){
  const mark=document.createElement("div");
  mark.className="brand-mark company-logo";
  mark.appendChild(image);
  brand.classList.add("brand-logo-only");
  brand.replaceChildren(mark);
 }else{
  brand.classList.remove("brand-logo-only");
  brand.innerHTML=`<div class="brand-mark company-logo">IR</div><div><strong>${esc(profile.name||"IR Project")}</strong><span>Управление строительными объектами</span></div>`;
 }
 brand.style.cursor="pointer";
 brand.title="На главную страницу";
 brand.setAttribute("role","link");
 brand.tabIndex=0;
 brand.onclick=()=>{location.hash="/objects"};
 brand.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();location.hash="/objects"}};
 brand.dataset.companyReady="1";
 delete brand.dataset.companyLoading;
 brand.removeAttribute("aria-label");
}
async function open(){if(window.irAccess?.role?.()!=="admin"){alert("Настройки профиля компании доступны только администратору.");return}let d=document.getElementById("companyDialog");if(!d){d=document.createElement("dialog");d.id="companyDialog";d.className="company-dialog";document.body.appendChild(d)}const originalLogo=profile.logo||"";let pendingLogo=originalLogo,pendingOwned="",logoUrl="";if(pendingLogo)try{logoUrl=await irProject.images.read(pendingLogo)}catch{};const discard=async()=>{if(pendingOwned)try{await irProject.images.remove(pendingOwned)}catch{}pendingOwned=""};const draw=()=>{d.innerHTML=`<form id="companyForm"><div class="form-heading"><div><h2>Профиль компании</h2><p class="form-subtitle">Фирменные данные для IR Project и документов</p></div><button type="button" class="dialog-x" id="companyClose">×</button></div><div class="company-profile-body"><div class="company-logo-editor" id="companyLogoPreview">${logoUrl?`<img src="${logoUrl}" alt="Логотип">`:`<span>Логотип не выбран</span>`}</div><div class="company-fields"><label>Название компании<input id="companyName" value="${esc(profile.name)}" placeholder="Например, ТОО «А-Темир Строй»" required></label><div><button type="button" class="ghost-btn" id="companyLogoButton">${logoUrl?"Заменить логотип":"Выбрать логотип"}</button><p class="company-hint"><strong>Рекомендуемый размер: 360×120 px.</strong><br>PNG, JPG или WEBP. В IR Project сохраняется только оптимизированная версия логотипа.</p></div></div></div><div class="actions"><button type="button" id="companyCancel">Отмена</button><button type="submit" class="primary">Сохранить</button></div></form>`;const close=async()=>{await discard();d.close()};d.querySelector("#companyClose").onclick=d.querySelector("#companyCancel").onclick=close;d.querySelector("#companyLogoButton").onclick=async()=>{const x=await irProject.company.selectLogo();if(!x)return;if(pendingOwned)try{await irProject.images.remove(pendingOwned)}catch{}pendingOwned=x;pendingLogo=x;logoUrl=await irProject.images.read(x);draw()};d.querySelector("#companyForm").onsubmit=async e=>{e.preventDefault();profile=await irProject.company.save({name:d.querySelector("#companyName").value,logo:pendingLogo});if(originalLogo&&originalLogo!==pendingLogo)try{await irProject.images.remove(originalLogo)}catch{}pendingOwned="";d.close();paintBrand(true);window.dispatchEvent(new Event("ir-company-profile-updated"));try{localStorage.setItem("ir-company-profile-updated",String(Date.now()))}catch{}}};draw();d.showModal()}
window.irCompanyProfile={open};
window.addEventListener("storage",async e=>{if(e.key!=="ir-company-profile-updated")return;try{profile=await irProject.company.get()||profile;profileLoaded=true;await paintBrand(true);window.dispatchEvent(new Event("ir-company-profile-updated"))}catch(error){console.warn("Company profile refresh:",error)}});
const root=document.getElementById("app");if(root)new MutationObserver(()=>paintBrand()).observe(root,{childList:true,subtree:true});load();
})();