"use strict";
/*
 * IR Project: буклет фирмы PDF (просьба инженера 20.11.2026 «нужно еще сделать буклет фирмы, чтобы можно было с
 * программы выгружать буклеты»; вид — как буклет фирмы в Canva, «только красивее»). Кнопка «Буклет» в окне «Сайт»
 * (server-account-page.js): отмеченные объекты → первый лист «О компании» (реквизиты, о компании, итоги по объектам,
 * заказчики и генподрядчики объектов) и по листу на объект (название, виды работ с объёмами, процент выполнения, фото
 * объекта, год, место, генподрядчик, заказчик). Горизонтальный А4. PDF печатает главный процесс
 * (ai-documents:exec-export, executive-docs-ipc.js pdfOf) — без новых каналов и без установщика.
 * build(objects, company) — только разметка (проверка: scripts/test-company-booklet.js); make() — в окне программы.
 */
(function(root){
 const COMPANY={
  name:"ТОО «А-Темир Строй»",
  full:"Товарищество с ограниченной ответственностью «А-Темир Строй»",
  bin:"990740008450",
  address:"Республика Казахстан, Карагандинская обл., г. Темиртау, Спортивный переулок 5, офис 17",
  phones:[["WhatsApp","+7 701 466 86 96"],["Директор","+7 778 459 73 93"],["Бухгалтерия","+7 775 730 00 05"]],
  mail:"kasken7@mail.ru · a-tk@list.ru",site:"a-ts.kz",whatsapp:"+7 701 466 86 96",contactMail:"kasken7@mail.ru",
  head:"Саргаскаев Аслан Каскенович",
  bank:["ИИК KZ20601A371002289201","АО «Народный Банк Казахстана»","БИК HSBKKZKX · КБе 17"],
  title:"Изготовление и монтаж металлоконструкций",
  about:["ТОО «А-Темир Строй» работает в промышленном строительстве с 2023 года: изготовление и монтаж металлоконструкций, монтаж технологического оборудования, ограждающих конструкций и резервуаров, демонтажные работы по всему Казахстану.",
   "Строительная лицензия II категории, собственный штат специалистов и полный комплект исполнительной документации по каждому объекту."],
  adv:[["Собственный штат","Инженеры, прорабы, сварщики, монтажники"],["Работа по чертежам","КМ, КМД, АР и ТХ по проекту"],["Соблюдение сроков","Контроль работ и нормы качества"],["Документация","Исполнительные схемы, акты, журналы"]],
  services:["Металлоконструкции","Технологическое оборудование","Сэндвич-панели и профнастил","Резервуары до 3 000 м³","Изготовление и окраска","Демонтаж и реконструкция"],
  slogan:["Мы строим не просто объекты —","мы строим доверие."],
  trust:"Каждый проект — подтверждение нашего <b>профессионализма, качества исполнения и соблюдения сроков</b>. Гарантия на все виды выполненных работ."
 };
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const num=v=>{const n=Number(String(v??"").replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const fmt=(v,d)=>{const n=num(v),k=d??3;
  return n.toLocaleString("ru-RU",{minimumFractionDigits:0,maximumFractionDigits:k}).replace(/ /g," ")};
 const unitOf=u=>String(u||"").replace(/^м2$/i,"м²").replace(/^м3$/i,"м³").replace(/^тн$/i,"т");
 // итоги — как на сайте (KINDS в server/pb_public/index.html), по видам работ отмеченных объектов
 const DEMO=n=>/демонт/.test(n);
 const kindOf=w=>{const n=String(w.name||"").toLowerCase(),u=unitOf(w.unit);
  if(DEMO(n))return null;if(/изготов/.test(n))return null;
  if(u==="т"&&!/оборуд/.test(n))return"mk";
  if(u==="м²"&&/сэндвич|сендвич|панел|профнаст|профлист|проф\.\s*лист|профилирован/.test(n))return"skin";
  return null};
 function totals(objects){
  let mk=0,skin=0;for(const o of objects)for(const w of o.works||[]){const v=num(w.volume),k=kindOf(w);if(v>0&&k==="mk")mk+=v;if(v>0&&k==="skin")skin+=v}
  const n=objects.length,word=n%10===1&&n%100!==11?"объект":n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?"объекта":"объектов";
  const out=[];if(mk>0)out.push([fmt(mk,1)+" т","металлоконструкций смонтировано"]);if(skin>0)out.push([fmt(skin,0)+" м²","сэндвич-панелей и профнастила"]);
  out.push([String(n),n%10===1&&n%100!==11?"объект выполнен":word+" выполнено"]);return out}
 const doneOf=o=>{if(/заверш/i.test(o.status||""))return 100;let v=0,p=0;for(const w of o.works||[]){if(num(w.plan)>0){p+=Math.min(1,num(w.volume)/num(w.plan));v++}}return v?Math.round(p/v*100):0};
 const parties=objects=>{const seen=new Set(),out=[];for(const o of objects)for(const s of [o.general_contractor,o.customer]){const t=String(s||"").trim(),k=t.toLowerCase().replace(/[«»"“”'\s]/g,"");if(t&&!seen.has(k)){seen.add(k);out.push(t)}}return out};

 const CSS=`@page{size:297mm 210mm;margin:0}
:root{--or:#f5a700;--or2:#ffbf2e;--ord:#d48f00;--ink:#1d2228;--mut:#6b7380;--line:#ece7dc}
*{box-sizing:border-box}body{margin:0;font-family:Montserrat,"Segoe UI",Arial,sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:297mm;height:210mm;position:relative;overflow:hidden;page-break-after:always;background:#fff}.page:last-child{page-break-after:auto}.up{text-transform:uppercase}
.L{position:absolute;left:0;top:0;bottom:0;width:100mm;background:#fff;z-index:2}
.L:before{content:"";position:absolute;left:0;top:0;width:58mm;height:46mm;background:linear-gradient(135deg,var(--or2),var(--or));clip-path:polygon(0 0,100% 0,0 100%)}
.L .in{position:absolute;left:11mm;right:9mm;top:15mm;bottom:12mm;display:flex;flex-direction:column}
.ttl{font-size:21pt;font-weight:900;line-height:1.08;margin:0 0 2mm;position:relative;overflow-wrap:anywhere;hyphens:auto}.ttl.s{font-size:17pt}.ttl.xs{font-size:14pt}
.sub{font-size:8pt;color:var(--mut);font-weight:600;letter-spacing:.6px;margin-bottom:6mm}
.wks{overflow:hidden}
.wk{display:grid;grid-template-columns:1fr auto;align-items:center;gap:4mm;padding:3mm 0;border-bottom:1px solid var(--line)}
.wk b{font-size:8.4pt;font-weight:800;line-height:1.25}.vol{text-align:right;white-space:nowrap}
.vol i{font-style:normal;font-size:16pt;font-weight:900;line-height:1}.vol s{text-decoration:none;font-size:8.5pt;font-weight:700;color:var(--ord);margin-left:1mm}
.sum{margin-top:4mm;font-size:7.8pt;line-height:1.5;color:#3a414a;border-left:1mm solid var(--or);padding-left:3mm;white-space:pre-line;overflow:hidden;max-height:34mm}
.badges{margin-top:auto;padding-top:4mm;display:flex;gap:5mm;align-items:center}
.ring{flex:none;width:27mm;height:27mm;border-radius:50%;background:conic-gradient(var(--or) calc(var(--p)*1%),#f1ece2 0);display:grid;place-items:center}
.ring div{width:21.5mm;height:21.5mm;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ring b{font-size:15pt;font-weight:900;line-height:1}.ring span{font-size:5.6pt;font-weight:700;color:var(--mut);letter-spacing:.5px;margin-top:.8mm}
.doc{display:flex;align-items:center;gap:3mm;font-size:6.8pt;font-weight:800;line-height:1.3;letter-spacing:.3px}
.doc em{flex:none;width:11mm;height:11mm;border-radius:3mm;background:var(--or);display:grid;place-items:center}.doc em svg{width:6.5mm;height:6.5mm}
.R{position:absolute;left:100mm;right:0;top:0;bottom:0;background:#2b3036}
.R .ph{position:absolute;inset:0 0 25mm 0;background:#3a4047 center 40%/cover no-repeat}
.R .ph:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,0) 30%,rgba(0,0,0,0) 55%,rgba(0,0,0,.35))}
.logo{position:absolute;top:9mm;right:10mm;background:rgba(255,255,255,.95);border-radius:3mm;padding:2.5mm 4mm;box-shadow:0 2mm 6mm rgba(0,0,0,.18);z-index:3}
.logo img{height:12mm;max-width:60mm;object-fit:contain;display:block}.logo b{display:block;font-size:11pt;font-weight:900}
.band{position:absolute;left:0;right:0;bottom:25mm;height:62mm;background:linear-gradient(100deg,var(--or),var(--or2));clip-path:polygon(0 30%,100% 0,100% 100%,0 100%);z-index:1}
.circles{position:absolute;left:10mm;bottom:31mm;display:flex;z-index:3}
.c{width:31mm;height:31mm;border-radius:50%;border:1.4mm solid #fff;background:#ddd center/cover no-repeat;box-shadow:0 2mm 5mm rgba(0,0,0,.25);margin-right:-5mm}
.c.big{width:38mm;height:38mm;margin-top:-7mm}
.info{position:absolute;right:10mm;bottom:31mm;z-index:3;text-align:right;width:62mm}
.yr{display:inline-flex;align-items:center;gap:2mm;background:#fff;border-radius:10mm;padding:1.6mm 4mm;font-weight:900;font-size:11pt;margin-bottom:3.5mm}.yr svg{width:4.2mm;height:4.2mm}
.info h4{margin:0 0 1mm;font-size:8pt;font-weight:900;letter-spacing:.8px}.info p{margin:0;font-size:8.5pt;font-weight:600;line-height:1.35}
.contact{margin-top:3mm;font-size:7.5pt;font-weight:700}
.foot{position:absolute;left:0;right:0;bottom:0;height:25mm;background:#fff;display:grid;grid-template-columns:1fr 1fr;align-items:center;padding:0 10mm;gap:8mm;z-index:2}
.foot small{display:block;font-size:6.5pt;font-weight:800;color:var(--ord);letter-spacing:.8px;margin-bottom:1mm}.foot b{font-size:9.5pt;font-weight:800}
.foot div+div{border-left:1px solid var(--line);padding-left:8mm}
.A1{position:absolute;left:0;top:0;bottom:0;width:86mm;background:linear-gradient(170deg,var(--or2),var(--or) 60%,var(--ord));padding:12mm 9mm}
.A1 .lg{background:#fff;border-radius:3mm;padding:4mm;text-align:center;margin-bottom:7mm;box-shadow:0 2mm 6mm rgba(0,0,0,.12)}
.A1 .lg img{max-height:30mm;max-width:100%;object-fit:contain}.A1 .lg b{font-size:15pt;font-weight:900}
.A1 h3{font-size:10pt;font-weight:900;margin:0 0 1mm;line-height:1.25}.A1 .bin{font-size:8pt;font-weight:700;margin-bottom:5mm}
.kv{font-size:7.6pt;line-height:1.45;margin-bottom:3.2mm}.kv small{display:block;font-weight:900;font-size:6.6pt;letter-spacing:.8px;opacity:.75}
.A2{position:absolute;left:86mm;top:0;bottom:0;width:113mm;padding:13mm 10mm 12mm 11mm;display:flex;flex-direction:column}
.kick{font-size:7.5pt;font-weight:800;color:var(--ord);letter-spacing:2px}
.A2 h2{font-size:19pt;font-weight:900;margin:1mm 0 4mm;line-height:1.05}.A2 p{font-size:8.6pt;line-height:1.55;margin:0 0 3mm;color:#333a42}
.nums{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin:3mm 0 5mm}.nums div{border-top:1mm solid var(--or);padding-top:2mm}
.nums b{display:block;font-size:16pt;font-weight:900;line-height:1.1}.nums span{font-size:6.8pt;color:var(--mut);font-weight:600}
.adv{display:grid;grid-template-columns:1fr 1fr;gap:3mm}.adv div{background:#faf6ee;border-radius:2mm;padding:3mm;font-size:7.4pt;line-height:1.35}.adv b{display:block;font-size:8pt;margin-bottom:.6mm}
.svc{display:flex;flex-wrap:wrap;gap:2mm;margin-top:4mm}.svc span{font-size:7pt;font-weight:700;border:1px solid var(--or);border-radius:10mm;padding:1.2mm 3mm}
.slogan{margin-top:auto;font-size:13pt;font-weight:900;line-height:1.2}.slogan i{font-style:normal;color:var(--or)}
.A3{position:absolute;left:199mm;right:0;top:0;bottom:0;background:#1d2228;color:#fff;padding:13mm 9mm 12mm}.A3 .kick{color:var(--or)}
.A3 h2{font-size:15pt;font-weight:900;margin:1mm 0 5mm;line-height:1.15}.cust{list-style:none;margin:0;padding:0;max-height:120mm;overflow:hidden}
.cust li{font-size:8pt;font-weight:600;padding:1.9mm 0;border-bottom:1px solid rgba(255,255,255,.1);display:flex;gap:2.5mm;align-items:center}
.cust li:before{content:"";flex:none;width:1.6mm;height:1.6mm;background:var(--or);transform:rotate(45deg)}
.A3 .q{position:absolute;left:9mm;right:9mm;bottom:12mm;font-size:8pt;line-height:1.5;color:#c9ced5}.A3 .q b{color:#fff}`;
 const CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
 const CAL='<svg viewBox="0 0 24 24" fill="none" stroke="#1d2228" stroke-width="2.4" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
 const bg=src=>src?` style="background-image:url('${String(src).replace(/'/g,"%27")}')"`:"";

 function aboutPage(objects,co,logo){
  const ps=parties(objects);
  return`<section class="page"><div class="A1"><div class="lg">${logo?`<img src="${esc(logo)}" alt="">`:`<b>${esc(co.name)}</b>`}</div>
  <h3 class="up">${esc(co.full)}</h3><div class="bin">БИН ${esc(co.bin)}</div>
  <div class="kv"><small class="up">Юридический адрес</small>${esc(co.address)}</div>
  <div class="kv"><small class="up">Телефоны</small>${co.phones.map(([k,v])=>esc(k)+": "+esc(v)).join("<br>")}</div>
  <div class="kv"><small class="up">Почта и сайт</small>${esc(co.mail)}<br>${esc(co.site)}</div>
  <div class="kv"><small class="up">Руководитель</small>${esc(co.head)}</div>
  <div class="kv"><small class="up">Банковские реквизиты</small>${co.bank.map(esc).join("<br>")}</div></div>
  <div class="A2"><div class="kick up">О компании</div><h2>${esc(co.title)}</h2>${co.about.map(p=>`<p>${esc(p)}</p>`).join("")}
  <div class="nums">${totals(objects).map(([b,s])=>`<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("")}</div>
  <div class="adv">${co.adv.map(([b,s])=>`<div><b>${esc(b)}</b>${esc(s)}</div>`).join("")}</div>
  <div class="svc">${co.services.map(s=>`<span>${esc(s)}</span>`).join("")}</div>
  <div class="slogan">${esc(co.slogan[0])}<br><i>${esc(co.slogan[1])}</i></div></div>
  <div class="A3"><div class="kick up">Нам доверяют</div><h2>Заказчики и генподрядчики</h2>
  <ul class="cust">${ps.map(p=>`<li>${esc(p)}</li>`).join("")}</ul><div class="q">${co.trust}</div></div></section>`
 }
 function objectPage(o,co,logo){
  const name=String(o.name||"Объект"),len=name.length,word=Math.max(...name.split(/\s+/).map(w=>w.length)),works=(o.works||[]).filter(w=>num(w.volume)>0||num(w.plan)>0);
  const shown=works.slice(0,o.summary?5:7),p=doneOf(o),pics=o.pictures||[],main=pics[0]||"",rest=pics.slice(1,4);
  const circles=rest.length?`<div class="circles">${rest.map((s,i)=>`<div class="c${rest.length===3&&i===1?" big":""}"${bg(s)}></div>`).join("")}</div>`:"";
  const year=String(o.years||"").trim(),place=String(o.address||"").trim();
  return`<section class="page"><div class="L"><div class="in">
  <h1 class="ttl up${len>70||word>15?" xs":len>45||word>12?" s":""}">${esc(name)}</h1>${o.customer?`<div class="sub up">${esc(o.customer)}</div>`:""}
  <div class="wks">${shown.map(w=>`<div class="wk"><b class="up">${esc(w.name)}</b><div class="vol"><i>${esc(fmt(num(w.plan)||num(w.volume)))}</i><s>${esc(unitOf(w.unit))}</s></div></div>`).join("")}</div>
  ${o.summary?`<div class="sum">${esc(o.summary)}</div>`:""}
  <div class="badges"><div class="ring" style="--p:${p}"><div><b>${p}%</b><span class="up">выполнено</span></div></div>
  <div class="doc up"><em>${CHECK}</em>Полный пакет<br>исполнительной<br>документации</div></div></div></div>
  <div class="R"><div class="ph"${bg(main)}></div><div class="logo">${logo?`<img src="${esc(logo)}" alt="">`:`<b>${esc(co.name)}</b>`}</div>
  <div class="band"></div>${circles}
  <div class="info">${year?`<div class="yr">${CAL}${esc(year)}</div>`:""}${place?`<h4 class="up">Место выполнения</h4><p>${esc(place)}</p>`:""}
  <div class="contact">${esc(co.contactMail)}<br>WhatsApp ${esc(co.whatsapp)}</div></div>
  <div class="foot"><div><small class="up">Генеральный подрядчик</small><b>${esc(o.general_contractor||"—")}</b></div><div><small class="up">Заказчик</small><b>${esc(o.customer||"—")}</b></div></div></div></section>`
 }
 // objects: [{name, customer, general_contractor, address, status, years, summary, works:[{name,unit,volume,plan}], pictures:[src…]}]
 function build(objects,{logo="",company={}}={}){
  const co={...COMPANY,...company},list=Array.isArray(objects)?objects:[];
  return`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Буклет ${esc(co.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>${CSS}</style></head><body>
${aboutPage(list,co,logo)}${list.map(o=>objectPage(o,co,logo)).join("")}</body></html>`
 }

 // ---- в окне программы ----
 // фото поменьше (до 1600 точек, JPEG) — чтобы PDF не весил сотни мегабайт
 async function small(src,side=1600){
  if(!src||typeof document==="undefined")return src||"";
  try{const img=await new Promise((ok,bad)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=bad;i.src=src});
   const k=Math.min(1,side/Math.max(img.naturalWidth,img.naturalHeight));if(k>=1&&/^data:image\/jpe?g/.test(src))return src;
   const c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.naturalWidth*k));c.height=Math.max(1,Math.round(img.naturalHeight*k));
   c.getContext("2d").drawImage(img,0,0,c.width,c.height);return c.toDataURL("image/jpeg",.85)}catch{return src}
 }
 const read=async f=>{if(!f)return"";if(/^data:/.test(f))return f;try{return await root.irProject.images.read(f)||""}catch{return""}};
 // data: объекты так, как их собирает окно «Сайт» (siteObjectData) — cover, photos, hero
 async function make(data,{onProgress}={}){
  const profile=await root.irProject.company.get().catch(()=>({}));
  const logo=await small(await read(profile?.logo||""),800);
  const objects=[];
  for(const [i,o] of data.entries()){
   onProgress?.(i,data.length,o.name);
   const files=[...new Set([o.cover,...(o.hero||[]),...(o.photos||[])].filter(Boolean))],pictures=[];
   for(const f of files){if(pictures.length>=4)break;const s=await read(f);if(s)pictures.push(await small(s,pictures.length?900:1800))}
   objects.push({...o,pictures})
  }
  const html=build(objects,{logo,company:profile?.name?{name:profile.name}:{}});
  const name="Буклет "+String(profile?.name||COMPANY.name).replace(/[«»"]/g,"")+" "+new Date().toLocaleDateString("ru-RU");
  return root.irProject.ai.invoke("ai-documents:exec-export",{format:"pdf",name,html})
 }
 const api={build,make,totals,doneOf,parties,COMPANY};
 if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.irBooklet=api;
})(typeof window!=="undefined"?window:globalThis);
