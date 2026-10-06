"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const iso=v=>String(v||"").slice(0,10);
 const dmy=v=>{const p=iso(v).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:"—"};
 const reportData=r=>({id:String(r.id),title:r.title||"",...(r.data||{})});
 async function loadPhotos(report){
  const out=[];
  for(const [index,path] of arr(report.photos).slice(0,12).entries()){
   if(!path)continue;
   const src=await irProject.images.read(path).catch(()=>"");
   if(src)out.push({path,src,index});
  }
  return out;
 }
 window.irPhotosPage=async oid=>{
  const app=document.getElementById("app"),object=await irProject.data.objects.get(oid);
  if(!object){location.hash="/objects";return}
  document.body.classList.remove("ir-object-overview");
  const raw=await irProject.data.forObject(oid).section("reports").list().catch(()=>[]);
  const reports=raw.map(reportData).sort((a,b)=>String(b.date||b.report_date||"").localeCompare(String(a.date||a.report_date||""))||Number(b.id)-Number(a.id));
  const groups=[];
  for(const report of reports){
   const photos=await loadPhotos(report);
   if(photos.length)groups.push({report,photos});
  }
  const total=groups.reduce((s,g)=>s+g.photos.length,0),latest=groups[0]?.report?.date||groups[0]?.report?.report_date||"";
  const content=groups.length?groups.map(g=>{
   const date=g.report.date||g.report.report_date;
   return `<section class="object-photo-report-group" data-report-id="${esc(g.report.id)}"><div class="object-photo-report-head"><div><h2>${esc(dmy(date))}</h2><p>Ежедневный отчёт · ${g.photos.length} фото</p></div><button type="button" data-open-report="${esc(g.report.id)}">Открыть отчёт</button></div><div class="object-photo-grid">${g.photos.map((p,i)=>`<button type="button" class="object-photo-tile" data-photo-src="${esc(p.src)}" data-photo-date="${esc(dmy(date))}" data-photo-number="${i+1}"><img src="${esc(p.src)}" alt="Фото ${i+1} от ${esc(dmy(date))}" loading="lazy"><span>Фото ${i+1}</span></button>`).join("")}</div></section>`;
  }).join(""):`<div class="object-photos-empty"><b>Фотографий пока нет</b><span>Здесь появятся только фотографии, добавленные в ежедневные отчёты.</span></div>`;
  app.innerHTML=`<div class="object-photos-page"><div class="object-photos-head"><button class="back" id="objectPhotosBack">← Назад</button><div><h1>Фотографии объекта</h1><p>${esc(object.name||"")} · только фото из ежедневных отчётов</p></div></div><div class="object-photos-summary"><div><span>Всего фотографий</span><b>${total}</b></div><div><span>Отчётов с фото</span><b>${groups.length}</b></div><div><span>Последняя съёмка</span><b>${latest?dmy(latest):"—"}</b></div></div><div class="object-photo-groups">${content}</div></div><div class="object-photo-lightbox" id="objectPhotoLightbox" hidden><button type="button" class="object-photo-lightbox-close" id="objectPhotoLightboxClose">×</button><div class="object-photo-lightbox-meta" id="objectPhotoLightboxMeta"></div><img id="objectPhotoLightboxImg" alt="Фото из ежедневного отчёта"></div>`;
  document.getElementById("objectPhotosBack").onclick=()=>location.hash=`/objects/object/${oid}`;
  document.querySelectorAll("[data-open-report]").forEach(btn=>btn.onclick=()=>location.hash=`/objects/object/${oid}/reports/${btn.dataset.openReport}`);
  const lb=document.getElementById("objectPhotoLightbox"),img=document.getElementById("objectPhotoLightboxImg"),meta=document.getElementById("objectPhotoLightboxMeta");
  document.querySelectorAll(".object-photo-tile").forEach(tile=>tile.onclick=()=>{img.src=tile.dataset.photoSrc||"";meta.textContent=`${tile.dataset.photoDate||""} · Фото ${tile.dataset.photoNumber||""}`;lb.hidden=false});
  const close=()=>{lb.hidden=true;img.src=""};
  document.getElementById("objectPhotoLightboxClose").onclick=close;lb.onclick=e=>{if(e.target===lb)close()};
 };
})();
