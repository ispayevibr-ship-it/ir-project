"use strict";
/*
 * IR Project: чертежи и разборы завершённого объекта (просьба инженера 13.11.2026: «после того, как статус объекта
 * становится завершен, удаляются чертежи и разборы. Остается только схема»). После сохранения объекта со статусом
 * «Завершен» администратору — окно: удалить чертежи и разборы Claude (в корзину на 30 дней) или нет. Схема, отметки
 * монтажа, отчёты остаются. «Не удалять у этого объекта» — больше не спрашивать на этом компьютере.
 * Удаляет главный процесс (ai-documents:purge-object в src/ai-ipc.js, src/ai-document-store.js purge).
 */
(()=>{
 const KEY="ir-drawings-purge-no";
 const invoke=(ch,v)=>window.irProject?.ai?.invoke?window.irProject.ai.invoke(ch,v):Promise.reject(Error("нет связи с программой"));
 const declined=()=>{try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch{return[]}};
 const decline=id=>{try{const l=new Set(declined().map(String));l.add(String(id));localStorage.setItem(KEY,JSON.stringify([...l]))}catch{}};
 const mb=b=>b>=1048576?(b/1048576).toLocaleString("ru-RU",{maximumFractionDigits:1})+" МБ":Math.max(1,Math.round(b/1024))+" КБ";
 const word=(n,a,b,c)=>{const m=n%10,h=n%100;return m===1&&h!==11?a:m>=2&&m<=4&&(h<12||h>14)?b:c};
 function ask(info){return new Promise(done=>{
  const d=document.createElement("dialog");d.className="object-dialog ir-purge-dialog";
  const what=[info.documents?info.documents+" "+word(info.documents,"чертёж","чертежа","чертежей")+(info.bytes?" ("+mb(info.bytes)+")":""):"",
   info.analyses?info.analyses+" "+word(info.analyses,"разбор","разбора","разборов")+" Claude":""].filter(Boolean).join(" и ");
  d.innerHTML='<form method="dialog" style="max-width:520px"><div class="form-heading"><div><h2>Объект завершён</h2><p class="form-subtitle">Удалить чертежи и разборы?</p></div></div>'+
   '<p style="margin:0 0 10px">У объекта '+what+'. Их можно удалить, чтобы не занимали место на сервере и на компьютерах.</p>'+
   '<p style="margin:0 0 10px">Останутся монтажная схема со всеми элементами и отметками монтажа, картинки узлов, отчёты и ссылки.</p>'+
   '<p style="margin:0 0 16px;opacity:.75">Удалённое 30 дней лежит в корзине объекта и возвращается оттуда. Без чертежей схему нельзя распознать заново, пока их не загрузят снова.</p>'+
   '<div class="actions split"><button type="button" data-v="never">Не удалять у этого объекта</button><div><button type="button" data-v="later">Не сейчас</button><button type="button" class="primary danger" data-v="yes">Удалить чертежи и разборы</button></div></div></form>';
  document.body.appendChild(d);
  const end=v=>{try{d.close()}catch{}d.remove();done(v)};
  d.querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>end(b.dataset.v));
  d.addEventListener("cancel",e=>{e.preventDefault();end("later")});
  d.showModal()
 })}
 function toast(text){
  const t=document.createElement("div");t.textContent=text;
  t.style.cssText="position:fixed;right:20px;bottom:20px;z-index:99999;max-width:420px;padding:12px 16px;border-radius:10px;background:#1f2937;color:#fff;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)";
  document.body.appendChild(t);setTimeout(()=>t.remove(),7000)
 }
 async function offer(objectId){
  try{
   if(!objectId||declined().map(String).includes(String(objectId)))return;
   const info=await invoke("ai-documents:purge-info",{objectId:Number(objectId)});
   if(!info||info.status!=="Завершен"||!info.admin||!(info.documents||info.analyses))return;
   const v=await ask(info);
   if(v==="never")return decline(objectId);
   if(v!=="yes")return;
   const r=await invoke("ai-documents:purge-object",{objectId:Number(objectId)});
   toast("Чертежи и разборы удалены ("+(r?.removed||0)+"). Они 30 дней лежат в корзине объекта.")
  }catch(e){toast("Чертежи не удалены: "+String(e?.message||e))}
 }
 window.irDrawingsPurge={offer};
})();
