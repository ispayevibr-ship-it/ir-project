/*
 * IR Project: the window of the montage scheme takes the fixes of the scheme without a new version of the program
 * (src/ai-scheme-pack.js). When the scheme of an object is open, it asks the main process for the pack of schemes at
 * once and every 10 minutes:
 *  - a newer 3D of the scheme came (files of the pack were written after this window loaded) — «Обновить схему» reloads the
 *    window with it;
 *  - newer checked data of the drawings came after the last placement of this object — «Обновить схему» places it
 *    again (what is mounted and the engineer's edits are kept) and reloads the window.
 * The bar stands over the page (document.body), so the drawing of the scheme does not take it away.
 * A button «⟳ Обновить схему» stands there always (the engineer, 09.11.2026: «сделай кнопку обновить схему, надоело
 * ждать»): at once it takes a newer hot update of the program (the pack of schemes comes only on top of it — then the
 * program restarts), the pack and the data of the drawings, and refreshes the scheme; nothing new — it says so.
 */
(function(){
 "use strict";
 if(window.irSchemeUpdates)return;
 const ROUTE=/^#\/objects\/object\/(\d+)\/(?:[^#]*\/)?scheme$/;
 const ask=(objectId,action)=>window.irProject?.ai?.invoke?window.irProject.ai.invoke("ai-montage:scheme-pack",{objectId:Number(objectId),action}):Promise.resolve(null);
 const clean=e=>String(e?.message||e||"").replace(/^Error invoking remote method '[^']+': (Error: )?/,"");
 let loaded=null,timer=null,bar=null,busy=false;
 let btn=null;
 function hide(){bar?.remove();bar=null;if(btn)btn.style.display=""}
 // The button: left of the round «Чат» in the corner, where the bar stands when it is shown.
 function button(){
  if(btn&&btn.isConnected)return;
  btn=document.createElement("button");btn.type="button";btn.className="scheme-updates-now";btn.textContent="⟳ Обновить схему";
  btn.title="Сразу проверить и взять обновление программы, пакет схем и данные чертежей";
  btn.style.cssText="position:fixed;right:86px;bottom:22px;z-index:8999;border:0;border-radius:18px;padding:8px 14px;background:#1f2937;color:#fff;"+
   "font:600 13px/1.2 system-ui,'Segoe UI',sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.22);cursor:pointer";
  btn.onclick=()=>now(ROUTE.exec(location.hash)?.[1]);if(bar)btn.style.display="none";document.body.appendChild(btn)
 }
 async function now(objectId){
  if(!objectId||busy)return;busy=true;
  try{
   const up=window.irProject?.updater;listen();
   if(up?.check){show("Проверяю обновление программы…");
    let r=null;try{r=await up.check()}catch(_e){}
    const remote=String(r?.updateInfo?.version||""),local=String(await up.version?.().catch(()=>"")||"");
    if(remote&&local&&remote!==local&&newer(remote,local)){downloading=remote;show("Скачиваю обновление программы "+remote+"…");progress(0,0);try{await up.download()}finally{downloading=""}
     show("Программа обновлена до "+remote+" — перезапускаю, затем схема откроется с новым пакетом");try{sessionStorage.setItem("ir-scheme-updates-done","Программа обновлена до "+remote)}catch(_e){}
     setTimeout(()=>up.install(),1200);return}}
   show("Проверяю пакет схем и данные чертежей…");
   if(loaded===null){const s0=await ask(objectId,"status");loaded=s0?.appliedAt||""}
   // («check» first: a program not restarted since its hot update knows no «check-now»)
   await ask(objectId,"check").catch(()=>null);const s=await ask(objectId,"check-now");
   const code=Boolean(s?.appliedAt)&&s.appliedAt!==loaded,data=s?.dataNewer===true;
   busy=false;
   if(code||data)return refresh(objectId,data);
   show("Обновлений нет. Схема №\u00a0"+(s?.version||"—")+"."+(s?.waiting?" (новый пакет ждёт версию программы "+s.waiting+")":"")+(s?.error?" · "+s.error:""));
   setTimeout(()=>{if(bar&&!busy&&bar.dataset.kind!=="update")hide()},6000)
  }catch(error){show("Не обновлено: "+clean(error),"Повторить",()=>{hide();now(objectId)})}
  finally{busy=false}
 }
 // The line of the download of the program (the engineer, 13.11.2026: «линию загрузки добавить? чтобы понимать сколько
 // ждать»): the main process sends «update:status» only to the window of the tabs (this page is in its frame), so the
 // events are taken from there — the size of the update from «available», the bytes done from «progress».
 let downloading="",totalBytes=0,listening=false;
 function listen(){
  if(listening)return;let top=null;try{top=window.top!==window?window.top.irProject:null}catch(_e){}
  const up=top?.updater?.onStatus?top.updater:window.irProject?.updater;if(!up?.onStatus)return;listening=true;
  up.onStatus(info=>{if(!info)return;if(info.type==="available")totalBytes=Math.max(0,Number(info.size)||0);
   else if(info.type==="progress"&&downloading){const done=Math.max(0,Number(info.transferred)||0);
    progress(totalBytes>0?Math.min(100,Math.round(done/totalBytes*100)):Math.max(0,Math.min(100,Number(info.percent)||0)),done)}})
 }
 const mb=n=>(n/1048576).toFixed(n<10485760?1:0).replace(".",",");
 function progress(pct,done){
  if(!bar?.querySelector)return;let w=bar.querySelector(".scheme-updates-progress");
  if(!w){w=document.createElement("div");w.className="scheme-updates-progress";w.style.cssText="flex-basis:100%;order:9;display:flex;gap:8px;align-items:center";
   w.innerHTML='<div style="flex:1;height:6px;border-radius:3px;background:#374151;overflow:hidden"><div class="fill" style="height:100%;width:0;background:#22c55e;transition:width .2s"></div></div><span class="pct" style="min-width:110px;text-align:right;font-variant-numeric:tabular-nums"></span>';
   bar.style.flexWrap="wrap";bar.appendChild(w)}
  w.querySelector(".fill").style.width=pct+"%";
  w.querySelector(".pct").textContent=pct+" %"+(done?" · "+mb(done)+(totalBytes?" из "+mb(totalBytes):"")+" МБ":"")
 }
 function newer(a,b){const A=String(a).split(".").map(Number),B=String(b).split(".").map(Number);for(let i=0;i<Math.max(A.length,B.length);i++){const d=(A[i]||0)-(B[i]||0);if(d)return d>0}return false}
 function show(text,button,onClick){
  if(!bar){
   bar=document.createElement("div");bar.className="scheme-updates-bar";bar.setAttribute("role","status");
   // (left of the round «Чат» button in the corner, right 18 px, 54 px wide: they lay one on the other — the engineer, 03.11.2026)
   bar.style.cssText="position:fixed;right:86px;bottom:16px;z-index:9000;max-width:min(460px,calc(100vw - 104px));display:flex;gap:10px;align-items:center;"+
    "padding:10px 12px;border-radius:10px;background:#1f2937;color:#fff;font:13px/1.35 system-ui,'Segoe UI',sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)";
   document.body.appendChild(bar)
  }
  bar.innerHTML="";bar.dataset.kind=button?"update":"info";if(btn)btn.style.display="none";
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
  if(!ROUTE.test(location.hash)){hide();btn?.remove();btn=null;return}
  button();
  try{const done=sessionStorage.getItem("ir-scheme-updates-done");if(done){sessionStorage.removeItem("ir-scheme-updates-done");show(done);setTimeout(()=>{if(bar&&!busy)hide()},6000)}}catch(_e){}
  setTimeout(poll,3000);timer=setInterval(poll,600e3)
 }
 window.irSchemeUpdates={poll,route,ROUTE};
 window.addEventListener("hashchange",route);
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",route);else route();
})();
