/*
 * IR Project: the window of the montage scheme takes the fixes of the scheme without a new version of the program
 * (src/ai-scheme-pack.js). When the scheme of an object is open, it asks the main process for the pack of schemes at
 * once and every 10 minutes:
 *  - a newer 3D of the scheme came (files of the pack were written after this window loaded) — «Обновить схему» reloads the
 *    window with it;
 *  - newer checked data of the drawings came after the last placement of this object — «Обновить схему» places it
 *    again (what is mounted and the engineer's edits are kept) and reloads the window.
 * The bar stands over the page (document.body), so the drawing of the scheme does not take it away.
 */
(function(){
 "use strict";
 if(window.irSchemeUpdates)return;
 const ROUTE=/^#\/objects\/object\/(\d+)\/(?:[^#]*\/)?scheme$/;
 const ask=(objectId,action)=>window.irProject?.ai?.invoke?window.irProject.ai.invoke("ai-montage:scheme-pack",{objectId:Number(objectId),action}):Promise.resolve(null);
 const clean=e=>String(e?.message||e||"").replace(/^Error invoking remote method '[^']+': (Error: )?/,"");
 let loaded=null,timer=null,bar=null,busy=false;
 function hide(){bar?.remove();bar=null}
 function show(text,button,onClick){
  if(!bar){
   bar=document.createElement("div");bar.className="scheme-updates-bar";bar.setAttribute("role","status");
   // (left of the round «Чат» button in the corner, right 18 px, 54 px wide: they lay one on the other — the engineer, 03.11.2026)
   bar.style.cssText="position:fixed;right:86px;bottom:16px;z-index:9000;max-width:min(460px,calc(100vw - 104px));display:flex;gap:10px;align-items:center;"+
    "padding:10px 12px;border-radius:10px;background:#1f2937;color:#fff;font:13px/1.35 system-ui,'Segoe UI',sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)";
   document.body.appendChild(bar)
  }
  bar.innerHTML="";bar.dataset.kind=button?"update":"info";
  const t=document.createElement("span");t.textContent=text;t.style.flex="1";bar.appendChild(t);
  if(button){const b=document.createElement("button");b.type="button";b.textContent=button;b.style.cssText="border:0;border-radius:8px;padding:6px 10px;background:#22c55e;color:#04210f;font-weight:600;cursor:pointer;white-space:nowrap";b.onclick=onClick;bar.appendChild(b)}
  const x=document.createElement("button");x.type="button";x.textContent="×";x.title="Позже";x.style.cssText="border:0;background:none;color:#cbd5e1;font-size:18px;cursor:pointer;padding:0 2px";x.onclick=hide;bar.appendChild(x)
 }
 async function refresh(objectId,needPlace){
  if(busy)return;busy=true;
  try{
   if(needPlace){show("Расставляю схему заново по новым данным чертежей…");const r=await ask(objectId,"apply");
    const p=r?.placed;try{sessionStorage.setItem("ir-scheme-updates-done",p?"Схема обновлена: новых "+(p.created||0)+", обновлено "+(p.updated||0)+(p.keptMounted?", смонтированные сохранены":""):"Схема обновлена")}catch(_e){}}
   else{try{sessionStorage.setItem("ir-scheme-updates-done","3D-вид схемы обновлён")}catch(_e){}}
   location.reload()
  }catch(error){show("Схема не обновлена: "+clean(error),"Повторить",()=>refresh(objectId,needPlace))}
  finally{busy=false}
 }
 async function poll(){
  const m=ROUTE.exec(location.hash);if(!m){hide();return}
  const objectId=m[1];
  try{
   if(loaded===null){const s=await ask(objectId,"status");loaded=s?.appliedAt||""}
   const s=await ask(objectId,"check");if(!s||ROUTE.exec(location.hash)?.[1]!==objectId)return;
   const code=Boolean(s.appliedAt)&&s.appliedAt!==loaded,data=s.dataNewer===true;
   if(code||data)show(code&&data?"Пришли исправления монтажной схемы: 3D-вид и данные чертежей.":code?"Пришло исправление 3D-вида монтажной схемы (пакет №"+s.version+").":"Пришли исправленные данные чертежей для этой схемы.",
    "Обновить схему",()=>refresh(objectId,data));
   else if(bar&&!busy&&bar.dataset.kind==="update")hide()
  }catch(error){console.warn("IR Project: pack of schemes",error)}
 }
 function route(){
  clearInterval(timer);timer=null;
  if(!ROUTE.test(location.hash)){hide();return}
  try{const done=sessionStorage.getItem("ir-scheme-updates-done");if(done){sessionStorage.removeItem("ir-scheme-updates-done");show(done);setTimeout(()=>{if(bar&&!busy)hide()},6000)}}catch(_e){}
  setTimeout(poll,3000);timer=setInterval(poll,600e3)
 }
 window.irSchemeUpdates={poll,route,ROUTE};
 window.addEventListener("hashchange",route);
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",route);else route();
})();
