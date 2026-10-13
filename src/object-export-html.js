"use strict";
/* Self-contained read-only HTML object archive. Source DB is never changed. */
(()=>{
 const labels={overview:"Обзор объекта",reports:"Ежедневные отчёты","extra-works":"Дополнительные работы","work-types":"Виды работ",marks:"Ведомость марок",deliveries:"Поставки",schedule:"График работ",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
 const fields={mark:"Марка",name:"Наименование",title:"Наименование",date:"Дата",report_date:"Дата отчёта",type:"Тип",work_type:"Вид работы",work_type_id:"ID вида работ",project_code:"Шифр",code:"Шифр",qty:"Кол-во",count:"Кол-во",unit:"Ед. изм.",unit_volume:"Объём 1 ед.",total_volume:"Общий объём",total_value:"Общий объём",volume:"Объём",status:"Статус",note:"Примечание",extra:"Дополнительная информация",address:"Адрес",start_date:"Начало",end_date:"Окончание",weather:"Погода",temperature:"Температура",wind:"Ветер",workers:"Работники",responsible:"Ответственные",equipment:"Техника",items:"Выполненные работы",works:"Выполненные работы",photos:"Фотографии",mark_id:"ID марки",created_at:"Создано",updated_at:"Изменено",record_type:"Тип записи",parent_id:"Родительская запись"};
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const array=x=>Array.isArray(x)?x:[];
 const safeFile=name=>String(name||"IR Project").replace(/[<>:"/\\|?*\u0000-\u001f]/g,"_").trim().slice(0,75)||"IR Project";
 const label=k=>fields[k]||String(k||"").replaceAll("_"," ");
 const type=x=>x===null?"":Array.isArray(x)?"array":typeof x;
 const flatText=v=>type(v)==="object"||type(v)==="array"?JSON.stringify(v,null,2):String(v??"");
 const imageKey=k=>/^(photos?|photo_path|image|image_path|cover|banner|file_path)$/i.test(String(k||""));
 const dataUrl=v=>/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,/i.test(String(v||""))||/^data:image\/svg\+xml,/i.test(String(v||""));
 function photoRefs(value,refs,key="",depth=0){
  if(depth>10||refs.size>4000||value==null)return;
  if(Array.isArray(value)){for(const item of value)photoRefs(item,refs,key,depth+1);return}
  if(typeof value==="object"){for(const [k,v] of Object.entries(value))photoRefs(v,refs,k,depth+1);return}
  if(typeof value!=="string"||!imageKey(key)||dataUrl(value))return;
  if(/\.(pdf|docx?|xlsx?)$/i.test(value))return;
  if(value.length<1200)refs.add(value)
 }
 async function inlinePhotos(sectionRows){
  const refs=new Set();
  for(const rows of Object.values(sectionRows))for(const row of rows)photoRefs(row.data||row,refs);
  const keys=[...refs],output=new Map();let cursor=0;
  async function worker(){
   while(cursor<keys.length){
    const key=keys[cursor++];
    try{const result=await irProject.images.read(key);if(dataUrl(result))output.set(key,result)}
    catch(error){console.warn("Object HTML: photo unavailable",error)}
   }
  }
  await Promise.all(Array.from({length:Math.min(keys.length,5)},worker));
  return output
 }
 function mediaHtml(key,value,images){
  if(!imageKey(key))return"";
  const values=Array.isArray(value)?value:typeof value==="string"?[value]:[];
  return values.map(v=>{
   const src=dataUrl(v)?v:images.get(v);
   return src?'<img class="ir-export-photo" src="'+esc(src)+'" loading="lazy" alt="Фото объекта">':""
  }).join("")
 }
 function fieldHtml(key,value,images){
  const media=mediaHtml(key,value,images);
  const t=type(value);
  if(value==null)return'<span class="ir-export-empty">—</span>';
  if(t==="boolean")return value?"Да":"Нет";
  if(t==="array"||t==="object"){
   const count=Array.isArray(value)?value.length:Object.keys(value).length;
   return (media||"")+'<details><summary>Показать данные ('+count+')</summary><pre>'+esc(flatText(value))+'</pre></details>'
  }
  if(value==="")return'<span class="ir-export-empty">—</span>';
  const s=String(value);
  if(media)return'<div class="ir-export-field-media">'+media+(s.startsWith("data:")?"":'<small>'+esc(s)+'</small>')+"</div>";
  return'<span class="ir-export-value">'+esc(s)+'</span>'
 }
 function rowHeading(r,i,key){
  const d=r.data||{};
  const date=d.date||d.report_date||d.delivery_date||"";
  const title=d.mark||d.name||d.work_type||d.title||r.title||d.number||d.invoice_number||"";
  const base=title?String(title):"Запись №"+(i+1);
  return(key==="reports"&&date?"Отчёт за "+date+" — ":"")+base
 }
 function renderRows(rows,key,images){
  if(!rows.length)return'<div class="ir-export-empty-card">Данные в этом разделе отсутствуют</div>';
  return'<div class="ir-export-records">'+rows.map((r,i)=>{
   const d=r.data||{},entries=Object.entries(d).filter(([k,v])=>!k.startsWith("__")&&v!==undefined);
   const heading=rowHeading(r,i,key);
   const pills=[d.date||d.report_date,d.project_code||d.code,d.qty!=null?"Кол-во: "+d.qty:null,d.status].filter(Boolean);
   const details=[["ID",r.id],["Тип",r.record_type],...entries];
   return'<article class="ir-export-record"><details><summary><span class="ir-export-row-no">'+(i+1)+'</span><span class="ir-export-row-title">'+esc(heading)+'</span><span class="ir-export-row-meta">'+pills.map(v=>'<small>'+esc(v)+'</small>').join("")+'</span></summary><div class="ir-export-details">'+details.map(([name,value])=>'<div class="ir-export-detail"><b>'+esc(label(name))+'</b><div>'+fieldHtml(name,value,images)+'</div></div>').join("")+'</div></details></article>'
  }).join("")+"</div>"
 }
 function renderSection(key,rows,images){
  return'<section class="ir-export-section" id="section-'+esc(key)+'"><header class="ir-export-section-head"><div><small>IR Project / Объект</small><h2>'+esc(labels[key]||key)+'</h2></div><span class="ir-export-count">'+rows.length+' записей</span></header>'+renderRows(rows,key,images)+'</section>'
 }
 function sidebarHtml(aside,keys,objectName){
  const nav=aside?.querySelector(".ir-object-nav");
  const links=nav?[...nav.querySelectorAll("button[data-key]")].filter(n=>!n.disabled):[];
  const icon=key=>links.find(el=>el.dataset.key===key)?.querySelector(".nav-icon")?.innerHTML||"";
  const item=(key,text,href,active=false)=>'<a class="ir-export-nav'+(active?' active':'')+'" href="'+href+'" title="'+esc(text)+'"><span class="nav-icon" aria-hidden="true">'+icon(key)+'</span><span class="ir-export-nav-label">'+esc(text)+'</span></a>';
  const overview=item("overview","Обзор","#overview",true);
  const pages=keys.map(key=>item(key,labels[key]||key,"#section-"+esc(key))).join("");
  const logoImg=aside?.querySelector(".ir-object-brand img");
  const logo=logoImg?'<img src="'+esc(logoImg.src)+'" alt="Логотип компании">':'<strong>IR Project</strong>';
  return'<aside class="ir-object-sidebar-fixed ir-export-sidebar" aria-label="Навигация по отчёту"><div class="ir-export-brand">'+logo+'</div><div class="ir-export-object-label"><small>ОБЪЕКТ</small><strong title="'+esc(objectName)+'">'+esc(objectName)+'</strong></div><div class="ir-export-nav-caption">РАЗДЕЛЫ ОТЧЁТА</div><nav class="ir-object-nav" aria-label="Разделы объекта">'+overview+pages+'</nav><a class="ir-export-top" href="#overview"><span aria-hidden="true">↑</span> Наверх</a></aside>'
 }
 function copyCanvas(live,copy){
  const originals=[...live.querySelectorAll("canvas")],copies=[...copy.querySelectorAll("canvas")];
  originals.forEach((canvas,i)=>{try{const src=canvas.toDataURL("image/png");if(!dataUrl(src))return;const img=document.createElement("img");img.src=src;img.alt="График";img.style.width=canvas.width+"px";img.style.maxWidth="100%";copies[i]?.replaceWith(img)}catch{copies[i]?.remove()}})
 }
 function snapshot(){
  const live=document.getElementById("app");
  if(!live?.querySelector(".object-overview-hero"))throw Error("Откройте страницу «Обзор» нужного объекта.");
  const copy=live.cloneNode(true);
  copyCanvas(live,copy);
  copy.querySelectorAll("dialog,form,script,iframe,object,embed,video,audio,button,input,textarea,select,[contenteditable],.window-update,.profile-panel,.ir-notice-stack").forEach(el=>el.remove());
  copy.querySelectorAll("a").forEach(el=>{const t=document.createElement("span");t.innerHTML=el.innerHTML;el.replaceWith(t)});
  copy.querySelectorAll("*").forEach(el=>{for(const att of [...el.attributes]){if(/^on/i.test(att.name)||att.name==="tabindex")el.removeAttribute(att.name)}});
  const hero=copy.querySelector(".object-overview-hero");if(hero)hero.id="overview";
  const menu=copy.querySelector(".object-hero-menu");if(menu)menu.remove();
  return copy.innerHTML
 }
 async function exportObject(objectId){
  const id=String(objectId);
  if(!/^\d+$/.test(id))throw Error("Неверный ID объекта.");
  if(exportObject.busy)return false;
  exportObject.busy=true;
  try{
   const object=await irProject.data.objects.get(id);
   if(!object)throw Error("Объект не найден.");
   const sections=array(await irProject.data.sections.get(id));
   const nav=document.querySelector(".ir-object-sidebar-fixed .ir-object-nav");
   const visibleKeys=nav?[...nav.querySelectorAll("button[data-key]")].filter(b=>!b.disabled&&b.dataset.key!=="overview").map(b=>b.dataset.key):[];
   const keys=[...new Set(visibleKeys.length?visibleKeys:sections.filter(s=>s.enabled).map(s=>s.section_key))];
   const api=irProject.data.forObject(id);
   const batches=await Promise.all(keys.map(async key=>{
    try{return[key,array(await api.section(key).list())]}
    catch(error){console.warn("Object HTML: failed to load section",key,error);return[key,[]]}
   }));
   const rows=Object.fromEntries(batches);
   const photos=await inlinePhotos(rows);
   const cssResponse=await fetch("./ir-styles.css?v=17149",{cache:"no-store"});
   if(!cssResponse.ok)throw Error("Не удалось загрузить оформление отчёта.");
   const css=await cssResponse.text();
   const extraStyles=[
    "*{box-sizing:border-box}",
    "html{scroll-behavior:smooth}body.ir-object-overview{padding-top:0!important;min-width:760px;background:#f4f6f9}",
    "body.ir-object-overview #app{padding-bottom:30px!important}",
    ".ir-export-sidebar{top:0!important;height:100vh!important;overflow-y:auto!important}",
    ".ir-export-brand{padding:13px 10px;text-align:center;background:#fff;border-bottom:1px solid #e1e9f0;font-weight:800;color:#225172}",
    ".ir-export-brand img{max-height:58px;max-width:100%;object-fit:contain}",
    ".ir-export-object-label{padding:12px 14px;border-bottom:1px solid #e3eaf0;font:700 12px/1.5 'Segoe UI',sans-serif;color:#2c536b;overflow-wrap:anywhere}",
    ".ir-object-nav .ir-export-nav{display:flex!important;align-items:center!important;gap:10px!important;min-height:37px!important;padding:9px 12px!important;text-decoration:none!important;color:#3e5d71!important;font-size:11px!important;line-height:1.35!important;border-radius:7px!important}",
    ".ir-object-nav .ir-export-nav:hover,.ir-object-nav .ir-export-nav.active{background:#e9f4fc!important;color:#196ca5!important}",
    ".ir-object-nav .ir-export-nav .nav-icon{display:inline-grid;width:18px;flex:0 0 18px}.ir-export-nav svg{width:17px;height:17px}",
    ".ir-export-top{display:block;padding:14px;color:#417592;text-decoration:none;font-size:12px}",
    "body.ir-object-route.ir-object-overview #app{margin-left:226px!important;width:calc(100% - 226px)!important;max-width:none!important}",
    ".ir-export-sidebar.ir-object-sidebar-fixed{position:fixed!important;top:0!important;left:0!important;bottom:0!important;width:226px!important;height:100vh!important;display:flex!important;flex-direction:column!important;gap:0!important;padding:0!important;overflow:hidden!important;background:linear-gradient(180deg,#142b41 0%,#0d2032 100%)!important;color:#e3edf6!important;border-right:1px solid #29455d!important}",
    ".ir-export-sidebar .ir-export-brand{flex:0 0 auto;display:flex!important;align-items:center!important;justify-content:center!important;min-height:85px!important;max-height:100px!important;padding:12px 14px!important;margin:0!important;background:#fff!important;border-bottom:1px solid #dae4ec!important;color:#173b54!important;overflow:hidden!important}",
    ".ir-export-sidebar .ir-export-brand img{display:block!important;width:auto!important;max-width:100%!important;height:auto!important;max-height:72px!important;object-fit:contain!important}",
    ".ir-export-sidebar .ir-export-brand strong{font:800 18px/1.2 'Segoe UI',sans-serif!important}",
    ".ir-export-sidebar .ir-export-object-label{flex:0 0 auto;display:grid!important;gap:7px!important;margin:0 12px!important;padding:15px 4px!important;border-bottom:1px solid rgba(210,231,248,.24)!important;color:#eff6fc!important}",
    ".ir-export-sidebar .ir-export-object-label small{font:700 9px/1.4 'Segoe UI',sans-serif!important;letter-spacing:1.15px!important;color:#94bdd5!important}",
    ".ir-export-sidebar .ir-export-object-label strong{display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:5!important;overflow:hidden!important;overflow-wrap:anywhere!important;font:650 12px/1.6 'Segoe UI',sans-serif!important;color:#eff6fc!important}",
    ".ir-export-sidebar .ir-export-nav-caption{flex:0 0 auto;padding:14px 16px 8px!important;font:700 9px/1.4 'Segoe UI',sans-serif!important;letter-spacing:1.2px!important;color:#9cbdd3!important}",
    ".ir-export-sidebar .ir-object-nav{flex:1 1 auto!important;min-height:0!important;display:flex!important;flex-direction:column!important;gap:4px!important;padding:3px 9px 10px!important;overflow-y:auto!important;overflow-x:hidden!important;scrollbar-width:thin!important;scrollbar-color:#59798f transparent!important}",
    ".ir-export-sidebar .ir-object-nav::-webkit-scrollbar{display:block!important;width:5px!important}.ir-export-sidebar .ir-object-nav::-webkit-scrollbar-thumb{background:#59798f!important;border-radius:8px!important}",
    ".ir-export-sidebar .ir-object-nav a.ir-export-nav{box-sizing:border-box!important;display:flex!important;align-items:center!important;gap:10px!important;min-height:42px!important;flex:0 0 auto!important;width:100%!important;margin:0!important;padding:10px 11px!important;border:1px solid transparent!important;border-radius:9px!important;background:transparent!important;text-decoration:none!important;white-space:normal!important;color:#dce9f6!important;opacity:1!important;font:550 12px/1.4 'Segoe UI',sans-serif!important;cursor:pointer!important;transition:background-color .12s,color .12s}",
    ".ir-export-sidebar .ir-object-nav a.ir-export-nav .nav-icon{display:grid!important;place-items:center!important;flex:0 0 18px!important;width:18px!important;height:18px!important;color:#a5c7de!important;opacity:1!important}",
    ".ir-export-sidebar .ir-object-nav a.ir-export-nav svg{width:18px!important;height:18px!important;color:inherit!important;stroke:currentColor!important}",
    ".ir-export-sidebar .ir-object-nav a.ir-export-nav .ir-export-nav-label{min-width:0!important;flex:1!important;white-space:normal!important;overflow-wrap:anywhere!important;color:inherit!important}",
    ".ir-export-sidebar .ir-object-nav a.ir-export-nav:hover{background:#264b65!important;color:#fff!important;border-color:#365d7c!important}",
    ".ir-export-sidebar .ir-object-nav a.ir-export-nav.active,.ir-export-sidebar .ir-object-nav a.ir-export-nav:focus-visible{background:#eaf4fd!important;color:#1766a0!important;border-color:#b4d6ef!important;font-weight:750!important;outline-offset:1px!important}",
    ".ir-export-sidebar .ir-object-nav a.ir-export-nav.active .nav-icon,.ir-export-sidebar .ir-object-nav a.ir-export-nav:focus-visible .nav-icon{color:#1766a0!important}",
    "body:has(.ir-export-section:target) .ir-export-sidebar .ir-object-nav a.ir-export-nav[href=\"#overview\"]{background:transparent!important;color:#dce9f6!important;border-color:transparent!important;font-weight:550!important}",
    "body:has(.ir-export-section:target) .ir-export-sidebar .ir-object-nav a.ir-export-nav[href=\"#overview\"] .nav-icon{color:#a5c7de!important}",
    ".ir-export-sidebar .ir-export-top{flex:0 0 auto;display:flex!important;align-items:center!important;gap:9px!important;min-height:45px!important;margin:0!important;padding:12px 17px!important;border-top:1px solid rgba(210,231,248,.2)!important;background:#0d2134!important;text-decoration:none!important;color:#bbd4e6!important;font:600 12px/1.4 'Segoe UI',sans-serif!important}",
    ".ir-export-sidebar .ir-export-top:hover{background:#1c3b54!important;color:#fff!important}",
    "#overview,.ir-export-section{scroll-margin-top:14px}",
    "@media(max-width:900px){.ir-export-sidebar.ir-object-sidebar-fixed{width:200px!important}body.ir-object-route.ir-object-overview #app{margin-left:200px!important;width:calc(100% - 200px)!important}}",
    ".ir-export-section{padding:18px;margin:18px 22px;border:1px solid #dce5ed;border-radius:13px;background:#fff;scroll-margin-top:14px;color:#21435b}",
    ".ir-export-section-head{display:flex;justify-content:space-between;align-items:center;gap:14px;border-bottom:1px solid #e4edf3;padding:0 0 15px;margin-bottom:12px}",
    ".ir-export-section-head small{font-size:11px;color:#7d92a3}.ir-export-section-head h2{font:750 20px/1.4 'Segoe UI',sans-serif;margin:4px 0 0}",
    ".ir-export-count{white-space:nowrap;font-size:12px;color:#63849c;background:#f2f7fb;border-radius:8px;padding:8px 12px}",
    ".ir-export-records{display:grid;gap:8px}.ir-export-record{border:1px solid #e3ebf1;border-radius:9px;background:#fbfdff;overflow:hidden}",
    ".ir-export-record>details>summary{display:flex;align-items:center;gap:12px;min-height:45px;padding:10px 13px;cursor:pointer;list-style:none}",
    ".ir-export-record>details>summary::-webkit-details-marker{display:none}.ir-export-record>details>summary:after{content:'▾';color:#7290a5;margin-left:auto}",
    ".ir-export-record>details[open]>summary{border-bottom:1px solid #e2eaf0;background:#eff7fd}.ir-export-row-no{flex:0 0 24px;color:#91a7b6;text-align:right;font-size:11px}",
    ".ir-export-row-title{min-width:150px;flex:1;font-size:12px;font-weight:700;overflow-wrap:anywhere}.ir-export-row-meta{display:flex;flex-wrap:wrap;gap:5px}",
    ".ir-export-row-meta small{font-size:10px;color:#53839f;background:#edf5fa;border-radius:5px;padding:3px 6px}",
    ".ir-export-details{padding:4px 14px 12px}.ir-export-detail{display:grid;grid-template-columns:minmax(130px,23%) minmax(0,1fr);gap:16px;padding:9px 0;border-bottom:1px solid #edf1f4;font-size:12px}",
    ".ir-export-detail:last-child{border:0}.ir-export-detail>b{color:#627f92}.ir-export-detail>div{min-width:0;overflow-wrap:anywhere}",
    ".ir-export-detail pre{margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f6f9;border-radius:7px;padding:10px;font-size:11px}",
    ".ir-export-detail details summary{cursor:pointer;color:#3976a5}.ir-export-photo{max-width:210px;max-height:150px;object-fit:contain;border-radius:7px;margin:4px 6px 4px 0}",
    ".ir-export-field-media{display:grid;gap:4px}.ir-export-field-media small{color:#8298a8;overflow-wrap:anywhere}.ir-export-empty{color:#99a9b5}",
    ".ir-export-empty-card{padding:20px;text-align:center;color:#8195a6;font-size:12px}",
    "body.ir-object-overview #app button,body.ir-object-overview #app .object-hero-actions{display:none!important}",
    "body.ir-object-overview #app .ir-export-section{display:block!important}",
    "@media(max-width:1000px){.ir-export-section{margin:12px!important}.ir-export-row-meta{display:none}}",
    "@media print{.ir-export-sidebar{position:static!important;width:100%!important;height:auto!important}.ir-export-sidebar .ir-object-nav{display:flex!important;flex-wrap:wrap!important}body.ir-object-overview #app{margin:0!important;width:100%!important}.ir-export-record{break-inside:avoid}.ir-export-section{break-before:page;margin:8px 0!important}details{display:block!important}}"
   ].join("\n");
   const activeHero=document.querySelector(".object-overview-hero");
   if(String(activeHero?.dataset.objectId||"")!==id)throw Error("Во время выгрузки изменился открытый объект. Повторите действие.");
   const htmlSnapshot=snapshot();
   const activeNavStyles=keys.map(key=>'body:has(#section-'+key+':target) .ir-export-sidebar .ir-object-nav a.ir-export-nav[href="#section-'+key+'"]{background:#eaf4fd!important;color:#1766a0!important;border-color:#b4d6ef!important;font-weight:750!important}body:has(#section-'+key+':target) .ir-export-sidebar .ir-object-nav a.ir-export-nav[href="#section-'+key+'"] .nav-icon{color:#1766a0!important}').join("\n");
   const sidebar=sidebarHtml(document.querySelector(".ir-object-sidebar-fixed"),keys,object.name||"Объект");
   const sectionsHtml=keys.map(key=>renderSection(key,rows[key]||[],photos)).join("");
   const generated=new Date().toLocaleString("ru-RU");
   const html='<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; img-src data:; font-src data:"><title>'+esc(object.name||"IR Project")+' — отчёт объекта</title><style>'+css+'</style><style>'+extraStyles+'\n'+activeNavStyles+'</style></head><body class="ir-object-route ir-object-overview">'+sidebar+'<main id="app">'+htmlSnapshot+sectionsHtml+'<footer class="ir-export-section"><b>IR Project</b> · Снимок объекта от '+esc(generated)+'. Только просмотр. Данные не связаны с рабочей базой.</footer></main></body></html>';
   const name=safeFile(object.short_name||object.name||"Объект");
   const result=await irProject.reportExport.html(html,"IR Project — "+name+" — весь объект.html");
   if(result&&typeof window.irProjectNotice==="function")window.irProjectNotice("HTML-отчёт объекта сохранён. Файл доступен только для просмотра.","success");
   return result
  }catch(error){
   console.error("HTML export of object failed",error);
   if(typeof window.irProjectNotice==="function")window.irProjectNotice("Не удалось выгрузить объект: "+String(error?.message||error),"error");
   else alert("Не удалось выгрузить объект: "+String(error?.message||error));
   return false
  }finally{exportObject.busy=false}
 }
 window.irObjectHtmlExport={save:exportObject};
})();
