"use strict";
(()=>{
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const fmtDate=v=>{if(!v)return"—";const p=String(v).slice(0,10).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:String(v)};
 const fmt=v=>{const n=Number(String(v??0).replace(",","."))||0;return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const route=()=>location.hash.match(/^#?\/objects\/object\/(\d+)\/deliveries$/)?.[1]||"";
 const rowsOf=d=>{for(const k of ["items","marks","positions","rows","products"]){if(Array.isArray(d?.[k]))return d[k]}return[]};
 async function run(){
  const oid=route();if(!oid)return;const key=`ir-open-delivery-${oid}`,id=sessionStorage.getItem(key);if(!id)return;
  const app=document.getElementById("app");if(!app||app.dataset.deliveryFocus===String(id))return;
  const rec=await irProject.data.forObject(oid).section("deliveries").get(id).catch(()=>null);if(!rec){sessionStorage.removeItem(key);return}
  const d=rec.data||{},items=rowsOf(d),date=d.date||d.delivery_date||d.invoice_date||rec.created_at||"",number=d.number||d.no||d.invoice_number||d.delivery_number||rec.id;
  app.dataset.deliveryFocus=String(id);
  const body=items.length?items.map(x=>`<tr><td><b>${esc(x.mark||x.mark_name||x.position_mark||"—")}</b></td><td>${esc(x.name||x.title||"")}</td><td>${fmt(x.qty??x.count??x.quantity)}</td><td>${esc(x.unit||"")}</td><td>${x.volume!=null||x.total_value!=null?`${fmt(x.volume??x.total_value)} ${esc(x.unit||"")}`:"—"}</td></tr>`).join(""):'<tr><td colspan="5" class="delivery-focus-empty">Позиции в накладной не найдены</td></tr>';
  app.innerHTML=`<div class="delivery-focus-page"><div class="delivery-focus-top"><button class="back" id="deliveryFocusBack">← К объекту</button><div><h1>Накладная №${esc(number)}</h1><p>Накладная от ${fmtDate(date)}</p></div></div><div class="delivery-focus-card"><div class="delivery-focus-meta"><div><span>Дата</span><b>${fmtDate(date)}</b></div><div><span>Номер</span><b>${esc(number)}</b></div><div><span>Шифр</span><b>${esc(d.project_code||d.code||"—")}</b></div><div><span>Позиций</span><b>${items.length}</b></div></div><div class="delivery-focus-table"><table><thead><tr><th>Марка</th><th>Наименование</th><th>Кол-во</th><th>Ед.</th><th>Объём</th></tr></thead><tbody>${body}</tbody></table></div></div></div>`;
  document.getElementById("deliveryFocusBack").onclick=()=>{sessionStorage.removeItem(key);location.hash=`/objects/object/${oid}`};
 }
 let timer=0;const schedule=()=>{clearTimeout(timer);timer=setTimeout(run,30)};new MutationObserver(schedule).observe(document.getElementById("app")||document.body,{childList:true,subtree:true});window.addEventListener("hashchange",schedule);schedule();
})();
