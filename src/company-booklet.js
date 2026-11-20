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
 // итоги объекта — как на сайте: «466,3 т металлоконструкций смонтировано» (инженер 20.11.2026 «сюда больше
 // информации, как на сайте объемы указаны»); группы — KINDS сайта
 const SKINDS=[["fab","т","изготовлено металлоконструкций",n=>/изготов/.test(n)],
  ["dm","т","металлоконструкций демонтировано",n=>DEMO(n)],["dms","м²","демонтировано",n=>DEMO(n)],
  ["eq","т","оборудования смонтировано",n=>/оборуд/.test(n)],["mk","т","металлоконструкций смонтировано",()=>true],
  ["pn","м²","профнастила смонтировано",n=>/профнаст|профлист|проф\.\s*лист|профилирован/.test(n)],
  ["sp","м²","сэндвич-панелей смонтировано",n=>/сэндвич|сендвич|панел/.test(n)]];
 const ORDER=["mk","sp","pn","eq","fab","dm","dms"];
 function objStats(o){const by=new Map();
  for(const w of o.works||[]){const v=num(w.volume),u=unitOf(w.unit),n=String(w.name||"").toLowerCase();if(!(v>0))continue;
   const K=SKINDS.find(([,ku,,t])=>ku===u&&t(n));if(K)by.set(K[0],(by.get(K[0])||0)+v)}
  return ORDER.filter(k=>by.get(k)>0).slice(0,3).map(k=>{const K=SKINDS.find(x=>x[0]===k),v=by.get(k);return[fmt(v,K[1]==="т"?1:v>=1000?0:1)+" "+K[1],K[2]]})}
 const statsOf=(o,co)=>{const st=objStats(o);return st.length?`<div class="osd up">Выполнено на ${esc(co.date)}</div><div class="ost">${st.map(([b,t])=>`<div><b>${esc(b)}</b><span>${esc(t)}</span></div>`).join("")}</div>`:""};
 // краткая характеристика — разметка карточки объекта (summaryHtml в archive-objects.js): **жирный**, *курсив*,
 // списки «- », заголовки «#»; пункты, слитые в одну строку («…:***- **…**- **…**»), — каждый с новой строки
 // (инженер 20.11.2026 «текст криво показывает»)
 const mdInline=t=>t.replace(/\*\*\*([^*]+?)\*\*\*/g,"<b><i>$1</i></b>").replace(/\*\*([^*]+?)\*\*/g,"<b>$1</b>").replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g,"$1<i>$2</i>").replace(/\*+/g,"");
 function sumHtml(md){
  const src=String(md??"").replace(/\r/g,"").replace(/([^\n])\s*(?=-\s+\*\*)/g,"$1\n").replace(/([^\n\s])\s*(?=[•]\s)/g,"$1\n");
  let out="",list="";const close=()=>{if(list){out+="</"+list+">";list=""}};
  for(const raw of src.split("\n")){const l=raw.trim();let m;
   if((m=l.match(/^#{1,3}\s+(.*)$/))){close();out+="<h5>"+mdInline(esc(m[1]))+"</h5>"}
   else if((m=l.match(/^[-•]\s+(.*)$/))){if(list!=="ul"){close();out+="<ul>";list="ul"}out+="<li>"+mdInline(esc(m[1]))+"</li>"}
   else if((m=l.match(/^\d+[.)]\s+(.*)$/))){if(list!=="ol"){close();out+="<ol>";list="ol"}out+="<li>"+mdInline(esc(m[1]))+"</li>"}
   else if(!l)close();
   else{close();out+="<p>"+mdInline(esc(l))+"</p>"}}
  close();return out}
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
.wks{overflow:hidden;flex:0 1 auto;min-height:0}
.wk{display:grid;grid-template-columns:1fr auto;align-items:center;gap:4mm;padding:3mm 0;border-bottom:1px solid var(--line)}
.wk b{font-size:8.4pt;font-weight:800;line-height:1.25}.vol{text-align:right;white-space:nowrap}
.vol i{font-style:normal;font-size:16pt;font-weight:900;line-height:1}.vol u,.tl u{display:block;text-decoration:none;font-size:6.6pt;font-weight:700;color:var(--mut);margin-top:.6mm}.vol s{text-decoration:none;font-size:8.5pt;font-weight:700;color:var(--ord);margin-left:1mm}
.sum{margin-top:4mm;font-size:7.8pt;line-height:1.5;color:#3a414a;border-left:1mm solid var(--or);padding-left:3mm;overflow:hidden;max-height:34mm;flex:none}
.sum p,.sm p,.sum h5,.sm h5{margin:0 0 1mm}.sum h5,.sm h5{font-size:1.05em;font-weight:800}.sum ul,.sum ol,.sm ul,.sm ol{margin:0 0 1mm;padding-left:4mm}.sum li,.sm li{margin:0}
.osd{flex:none;margin-top:auto;padding-top:4mm;font-size:6pt;font-weight:800;letter-spacing:.6px;color:var(--mut)}.lay4 .O .osd{color:#4a3500}
.ost{flex:none;padding-top:1.5mm;display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}.ost div{border-top:1mm solid var(--or);padding-top:2mm}
.ost b{display:block;font-size:12pt;font-weight:900;line-height:1.1;white-space:nowrap}.ost span{display:block;font-size:6.2pt;color:var(--mut);font-weight:600;line-height:1.3;margin-top:1mm}
.ost+.badges{margin-top:0}
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
.A3 .q{position:absolute;left:9mm;right:9mm;bottom:12mm;font-size:8pt;line-height:1.5;color:#c9ced5}.A3 .q b{color:#fff}
.lay2 .L{left:auto;right:0}.lay2 .L:before{left:auto;right:0;clip-path:polygon(0 0,100% 0,100% 100%)}.lay2 .L .in{left:10mm;right:11mm}
.lay2 .R{left:0;right:100mm}.lay2 .band{clip-path:polygon(0 0,100% 30%,100% 100%,0 100%);background:linear-gradient(260deg,var(--or),var(--or2))}
.lay2 .logo{right:auto;left:10mm}.lay2 .circles{left:auto;right:10mm;flex-direction:row-reverse}.lay2 .c{margin-right:0;margin-left:-5mm}
.lay2 .info{right:auto;left:10mm;text-align:left}
.lay3{background:#1d2228}.lay3 .ph{position:absolute;inset:0;background:#3a4047 center 45%/cover no-repeat}
.lay3 .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(18,21,25,.86),rgba(18,21,25,.55) 42%,rgba(18,21,25,0) 70%),linear-gradient(0deg,rgba(18,21,25,.7),rgba(18,21,25,0) 45%)}
.lay3 .hd{position:absolute;left:14mm;top:16mm;width:150mm;color:#fff}.lay3 .kick{color:var(--or2)}.lay3 .ttl{font-size:27pt;margin-top:2mm}.lay3 .ttl.s{font-size:21pt}.lay3 .ttl.xs{font-size:17pt}
.lay3 .hd:before{content:"";display:block;width:22mm;height:1.6mm;background:var(--or);margin-bottom:5mm}
.lay3 .sm{font-size:8.6pt;line-height:1.55;color:#dfe3e8;max-width:130mm;margin:3mm 0 0;max-height:30mm;overflow:hidden}
.lay3 .thumbs{position:absolute;right:12mm;top:36mm;display:flex;flex-direction:column;gap:4mm}.lay3 .thumbs div{width:46mm;height:32mm;border-radius:2.5mm;border:1.2mm solid #fff;background:#ddd center/cover no-repeat;box-shadow:0 2mm 6mm rgba(0,0,0,.3)}
.lay3 .tiles{position:absolute;left:14mm;right:14mm;bottom:24mm;display:flex;gap:4mm;align-items:stretch}
.lay3 .tw{flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:3mm}
.lay3 .tl{background:rgba(255,255,255,.95);border-radius:2.5mm;padding:3.5mm 4mm;border-top:1.4mm solid var(--or);display:flex;flex-direction:column;gap:1.5mm}
.lay3 .tl i{font-style:normal;font-size:17pt;font-weight:900;line-height:1}.lay3 .tl s{text-decoration:none;font-size:8.5pt;font-weight:700;color:var(--ord);margin-left:1mm}
.lay3 .tl b{font-size:7pt;font-weight:800;line-height:1.25}
.lay3 .tr{flex:none;background:#fff;border-radius:2.5mm;padding:2.5mm;display:grid;place-items:center}.lay3 .tr .ring{width:25mm;height:25mm}.lay3 .tr .ring div{width:20mm;height:20mm}
.lay3 .strip{position:absolute;left:0;right:0;bottom:0;height:17mm;background:linear-gradient(100deg,var(--or),var(--or2));display:grid;grid-template-columns:1fr 1fr auto;gap:8mm;align-items:center;padding:0 14mm}
.lay3 .strip small{display:block;font-size:6.3pt;font-weight:800;letter-spacing:.8px;opacity:.7}.lay3 .strip b{font-size:9pt;font-weight:800}
.lay3 .strip .doc em{background:#1d2228}
.lay4 .M{position:absolute;left:0;top:0;bottom:22mm;width:190mm;display:grid;gap:2.5mm;background:#fff;padding:0 0 2.5mm}
.lay4 .g{background:#3a4047 center/cover no-repeat}
.lay4 .m1{grid-template:1fr/1fr}.lay4 .m2{grid-template:1fr/1.6fr 1fr}.lay4 .m3{grid-template:1fr 1fr/1.7fr 1fr}.lay4 .m3 .g0{grid-row:1/3}
.lay4 .m4{grid-template:1fr 1fr 1fr/1.7fr 1fr}.lay4 .m4 .g0{grid-row:1/4}
.lay4 .logo{left:10mm;right:auto}
.lay4 .info{position:absolute;left:10mm;bottom:8mm;z-index:3;background:rgba(255,255,255,.95);border-radius:3mm;padding:4mm 5mm;width:78mm;box-shadow:0 2mm 6mm rgba(0,0,0,.18)}
.lay4 .info{text-align:left}.lay4 .info .yr{background:var(--or)}
.lay4 .O{position:absolute;right:0;top:0;bottom:22mm;width:107mm;background:linear-gradient(170deg,var(--or2),var(--or) 55%,var(--ord))}
.lay4 .O .in{position:absolute;left:10mm;right:10mm;top:14mm;bottom:9mm;display:flex;flex-direction:column}
.lay4 .O .sub{color:#4a3500}.lay4 .O .wk{border-bottom-color:rgba(0,0,0,.12)}.lay4 .O .vol s{color:#1d2228}.lay4 .O .sum{border-left-color:#1d2228;color:#2a2410}.lay4 .O .ost div{border-top-color:#1d2228}.lay4 .O .ost span{color:#4a3500}
.lay4 .O .ring{background:conic-gradient(#1d2228 calc(var(--p)*1%),rgba(255,255,255,.45) 0)}.lay4 .O .doc em{background:#1d2228}
.lay4 .f4{height:22mm;grid-template-columns:1fr 1fr}
.lay5 .ph{position:absolute;left:0;right:0;top:0;height:112mm;background:#3a4047 center 45%/cover no-repeat;clip-path:polygon(0 0,100% 0,100% 82%,0 100%)}
.lay5 .ph:after{content:"";position:absolute;left:0;right:0;bottom:0;height:4mm;background:var(--or)}
.lay5 .circles{left:auto;right:14mm;bottom:auto;top:78mm}.lay5 .c{width:28mm;height:28mm}.lay5 .c.big{width:34mm;height:34mm;margin-top:-6mm}
.lay5 .lo{position:absolute;left:14mm;top:118mm;width:105mm;bottom:22mm;display:flex;flex-direction:column}
.lay5 .lo .ttl{font-size:18pt}.lay5 .lo .ttl.s{font-size:15pt}.lay5 .lo .ttl.xs{font-size:12.5pt}
.lay5 .info{position:static;text-align:left;width:auto;margin-top:auto}.lay5 .info .yr{background:var(--or);margin-bottom:2mm}.lay5 .info p{font-size:8pt}.lay5 .contact{display:none}
.lay5 .ro{position:absolute;left:128mm;right:14mm;top:118mm;bottom:22mm;display:flex;gap:6mm}
.lay5 .ro .wks{flex:1;display:grid;grid-template-columns:1fr 1fr;column-gap:6mm;align-content:start}.lay5 .ro .wk{padding:2.4mm 0}.lay5 .ro .vol i{font-size:13pt}.lay5 .ro .wk b{font-size:7.4pt}
.lay5 .ro .badges{flex:none;flex-direction:column;margin:0;padding:0;align-items:flex-start;justify-content:flex-end}.lay5 .ro .doc{font-size:6pt}
.lay5 .f5{height:20mm;background:#faf6ee;padding:0 14mm}
.lay6{background:#1d2228;color:#fff}
.lay6 .fr{position:absolute;left:14mm;top:14mm;width:168mm;height:124mm}.lay6 .fr:before{content:"";position:absolute;left:-5mm;top:-5mm;width:60mm;height:45mm;background:var(--or)}
.lay6 .fr.full{height:182mm}.lay6 .ttl.s{font-size:12.5pt}.lay6 .ph{position:absolute;inset:0;background:#3a4047 center/cover no-repeat;border-radius:2mm}
.lay6 .row{position:absolute;left:14mm;top:144mm;width:168mm;height:52mm;display:flex;gap:4mm}.lay6 .row div{flex:1;background:#3a4047 center/cover no-repeat;border-radius:2mm}
.lay6 .tx{position:absolute;left:192mm;right:12mm;top:14mm;bottom:12mm;display:flex;flex-direction:column}
.lay6 .logo.l6{position:static;align-self:flex-start;margin-bottom:6mm;box-shadow:none}.lay6 .logo.l6 img{height:10mm}
.lay6 .ttl{font-size:16pt}.lay6 .ttl.s{font-size:13.5pt}.lay6 .ttl.xs{font-size:11.5pt}.lay6 .sub{color:var(--or2)}
.lay6 .wk{border-bottom-color:rgba(255,255,255,.12);padding:2.4mm 0;gap:2mm}.lay6 .wk b{font-size:7pt}.lay6 .vol i{font-size:12.5pt}.lay6 .vol s{color:var(--or2)}
.lay6 .badges{gap:4mm}.lay6 .ring{background:conic-gradient(var(--or) calc(var(--p)*1%),#3a4047 0);width:24mm;height:24mm}.lay6 .ring div{background:#1d2228;width:19mm;height:19mm}.lay6 .ring span{color:#aab2bc}
.lay6 .meta .yr{color:#1d2228;font-size:10pt;margin-bottom:1.5mm}.lay6 .meta p{margin:0;font-size:7.2pt;line-height:1.35;color:#c9ced5}
.lay6 .gp{margin-top:5mm;font-size:7.6pt;font-weight:700;line-height:1.35}.lay6 .gp small{display:block;font-size:6pt;letter-spacing:.8px;color:var(--or2);margin-top:2.5mm}`;
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
  <div class="osd up" style="margin:3mm 0 0">По программе на ${esc(co.date)}</div><div class="nums">${totals(objects).map(([b,s])=>`<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("")}</div>
  <div class="adv">${co.adv.map(([b,s])=>`<div><b>${esc(b)}</b>${esc(s)}</div>`).join("")}</div>
  <div class="svc">${co.services.map(s=>`<span>${esc(s)}</span>`).join("")}</div>
  <div class="slogan">${esc(co.slogan[0])}<br><i>${esc(co.slogan[1])}</i></div></div>
  <div class="A3"><div class="kick up">Нам доверяют</div><h2>Заказчики и генподрядчики</h2>
  <ul class="cust">${ps.map(p=>`<li>${esc(p)}</li>`).join("")}</ul><div class="q">${co.trust}</div></div></section>`
 }
 // лист объекта — четыре макета, чтобы листы не были одинаковыми (инженер 20.11.2026 «чтобы не все страницы были
 // одинаковые, макет разный»): 1 «Классика» — текст слева, фото справа с полосой и кругами; 2 «Зеркало» — фото слева,
 // текст справа; 3 «Обложка» — фото на весь лист, виды работ плитками внизу; 4 «Мозаика» — фото сеткой, текст на
 // оранжевой колонке; 5 «Панорама» — фото полосой сверху, виды работ в две колонки; 6 «Тёмный» — тёмный лист, фото в
 // рамке и малые под ним. Макет выбирается у каждого объекта (инженер «выбор для каждого объекта макета своего, сделай
 // 5-6 разных макетов»); Авто — по очереди, по числу фото.
 const LAYOUTS=["Классика","Зеркало","Обложка","Мозаика","Панорама","Тёмный"];
 const titleCls=name=>{const len=name.length,word=Math.max(...name.split(/\s+/).map(w=>w.length));return len>70||word>15?" xs":len>45||word>12?" s":""};
 const worksOf=o=>(o.works||[]).filter(w=>num(w.volume)>0||num(w.plan)>0);
 // объём — смонтировано по программе на день выгрузки буклета, план — «из N», пока не выполнено (инженер 20.11.2026
 // «объемы должны также браться с программы, на день выгрузки буклета»)
 const planOf=w=>num(w.plan)>num(w.volume)?`<u>из ${esc(fmt(w.plan))}</u>`:"";
 const wkRows=ws=>ws.map(w=>`<div class="wk"><b class="up">${esc(w.name)}</b><div class="vol"><i>${esc(fmt(num(w.volume)))}</i><s>${esc(unitOf(w.unit))}</s>${planOf(w)}</div></div>`).join("");
 const ringOf=p=>`<div class="ring" style="--p:${p}"><div><b>${p}%</b><span class="up">выполнено</span></div></div>`;
 const docOf=()=>`<div class="doc up"><em>${CHECK}</em>Полный пакет<br>исполнительной<br>документации</div>`;
 const logoOf=(co,logo,cls="")=>`<div class="logo${cls}">${logo?`<img src="${esc(logo)}" alt="">`:`<b>${esc(co.name)}</b>`}</div>`;
 const footOf=(o,cls="")=>`<div class="foot${cls}"><div><small class="up">Генеральный подрядчик</small><b>${esc(o.general_contractor||"—")}</b></div><div><small class="up">Заказчик</small><b>${esc(o.customer||"—")}</b></div></div>`;
 const yearOf=o=>{const y=String(o.years||"").trim();return y?`<div class="yr">${CAL}${esc(y)}</div>`:""};
 const layoutOf=(o,i)=>{const n=Number(o.layout);if(n>=1&&n<=LAYOUTS.length)return n;const pics=(o.pictures||[]).length;if(!pics)return 1;
  const seq=pics>=3?[1,3,5,2,4,6]:[1,3,5,2,6];return seq[i%seq.length]};
 function textCol(o,max,co){const name=String(o.name||"Объект"),ws=worksOf(o),p=doneOf(o);
  return`<h1 class="ttl up${titleCls(name)}">${esc(name)}</h1>${o.customer?`<div class="sub up">${esc(o.customer)}</div>`:""}
  <div class="wks">${wkRows(ws.slice(0,o.summary?max-3:max))}</div>${o.summary?`<div class="sum">${sumHtml(o.summary)}</div>`:""}
  ${statsOf(o,co)}<div class="badges">${ringOf(p)}${docOf()}</div>`}
 function placeOf(o,co){const place=String(o.address||"").trim();
  return`${yearOf(o)}${place?`<h4 class="up">Место выполнения</h4><p>${esc(place)}</p>`:""}<div class="contact">${esc(co.contactMail)}<br>WhatsApp ${esc(co.whatsapp)}</div>`}
 function circlesOf(rest){return rest.length?`<div class="circles">${rest.map((s,i)=>`<div class="c${rest.length===3&&i===1?" big":""}"${bg(s)}></div>`).join("")}</div>`:""}
 function objectPage(o,co,logo,i=0){
  const lay=layoutOf(o,i),pics=o.pictures||[],main=pics[0]||"",rest=pics.slice(1,4);
  if(lay===2)return`<section class="page lay2"><div class="L"><div class="in">${textCol(o,7,co)}</div></div>
  <div class="R"><div class="ph"${bg(main)}></div>${logoOf(co,logo)}<div class="band"></div>${circlesOf(rest)}
  <div class="info">${placeOf(o,co)}</div>${footOf(o)}</div></section>`;
  if(lay===3){const name=String(o.name||"Объект"),ws=worksOf(o).slice(0,4),p=doneOf(o),place=String(o.address||"").trim();
   return`<section class="page lay3"><div class="ph"${bg(main)}></div><div class="shade"></div>${logoOf(co,logo)}
   <div class="hd"><div class="kick up">${esc(o.years?String(o.years):"Объект")}${place?" · "+esc(place):""}</div><h1 class="ttl up${titleCls(name)}">${esc(name)}</h1>
   ${o.summary?`<div class="sm">${sumHtml(o.summary)}</div>`:""}</div>
   ${rest.length?`<div class="thumbs">${rest.slice(0,3).map(s=>`<div${bg(s)}></div>`).join("")}</div>`:""}
   <div class="tiles"><div class="tw">${ws.map(w=>`<div class="tl"><i>${esc(fmt(num(w.volume)))}<s>${esc(unitOf(w.unit))}</s></i>${planOf(w)}<b class="up">${esc(w.name)}</b></div>`).join("")}</div>
   <div class="tr">${ringOf(p)}</div></div>
   <div class="strip"><div><small class="up">Генеральный подрядчик</small><b>${esc(o.general_contractor||"—")}</b></div><div><small class="up">Заказчик</small><b>${esc(o.customer||"—")}</b></div><div class="doc up"><em>${CHECK}</em>Полный пакет исполнительной документации</div></div></section>`}
  if(lay===5){const name=String(o.name||"Объект"),ws=worksOf(o).slice(0,8),p=doneOf(o);
   return`<section class="page lay5"><div class="ph"${bg(main)}></div>${logoOf(co,logo)}${circlesOf(rest)}
   <div class="lo"><h1 class="ttl up${titleCls(name)}">${esc(name)}</h1>${o.customer?`<div class="sub up">${esc(o.customer)}</div>`:""}
   <div class="info">${placeOf(o,co)}</div></div>
   <div class="ro"><div class="wks">${wkRows(ws)}</div><div class="badges">${ringOf(p)}${docOf()}</div></div>${footOf(o," f5")}</section>`}
  if(lay===6){const name=String(o.name||"Объект"),p=doneOf(o);
   return`<section class="page lay6"><div class="fr${rest.length?"":" full"}"><div class="ph"${bg(main)}></div></div>
   ${rest.length?`<div class="row">${rest.slice(0,3).map(s=>`<div${bg(s)}></div>`).join("")}</div>`:""}
   <div class="tx">${logoOf(co,logo," l6")}<h1 class="ttl up${titleCls(name)}">${esc(name)}</h1>${o.customer?`<div class="sub up">${esc(o.customer)}</div>`:""}
   <div class="wks">${wkRows(worksOf(o).slice(0,5))}</div><div class="badges">${ringOf(p)}<div class="meta">${yearOf(o)}<p>${esc(o.address||"")}</p></div></div>
   <div class="gp"><small class="up">Генподрядчик</small>${esc(o.general_contractor||"—")}<small class="up">Заказчик</small>${esc(o.customer||"—")}</div></div></section>`}
  if(lay===4){const n=Math.min(4,pics.length);
   return`<section class="page lay4"><div class="M m${n}">${pics.slice(0,4).map((s,k)=>`<div class="g g${k}"${bg(s)}></div>`).join("")}${logoOf(co,logo)}
   <div class="info">${placeOf(o,co)}</div></div>
   <div class="O"><div class="in">${textCol(o,6,co)}</div></div>${footOf(o," f4")}</section>`}
  return`<section class="page"><div class="L"><div class="in">${textCol(o,7,co)}</div></div>
  <div class="R"><div class="ph"${bg(main)}></div>${logoOf(co,logo)}
  <div class="band"></div>${circlesOf(rest)}
  <div class="info">${placeOf(o,co)}</div>${footOf(o)}</div></section>`
 }
 // objects: [{name, customer, general_contractor, address, status, years, summary, works:[{name,unit,volume,plan}], pictures:[src…]}]
 function build(objects,{logo="",company={}}={}){
  const d=new Date(),co={date:String(d.getDate()).padStart(2,"0")+"."+String(d.getMonth()+1).padStart(2,"0")+"."+d.getFullYear(),...COMPANY,...company},list=Array.isArray(objects)?objects:[];
  return`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Буклет ${esc(co.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>${CSS}</style></head><body>
${aboutPage(list,co,logo)}${list.map((o,i)=>objectPage(o,co,logo,i)).join("")}</body></html>`
 }

 // ---- в окне программы ----
 // Качество фото (инженер 20.11.2026 «почему такое плохое качество фото»): обложка объекта в программе хранится
 // вырезом 900×400 — на весь лист она расплывалась. Берётся её исходник (original_path, до 4000 точек — object-image-crop),
 // фото не пережимаются, если уже JPEG и не больше нужного; большое фото — до 2800 точек, остальные — до 1400, JPEG 0,92.
 async function small(src,side=2800,q=.92){
  if(!src||typeof document==="undefined")return src||"";
  try{const img=await new Promise((ok,bad)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=bad;i.src=src});
   const k=Math.min(1,side/Math.max(img.naturalWidth,img.naturalHeight));if(k>=1&&/^data:image\/jpe?g/.test(src))return src;
   const c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.naturalWidth*k));c.height=Math.max(1,Math.round(img.naturalHeight*k));
   const g=c.getContext("2d");g.imageSmoothingQuality="high";g.drawImage(img,0,0,c.width,c.height);return c.toDataURL("image/jpeg",q)}catch{return src}
 }
 // маленькая картинка для окна выбора фото
 const thumb=src=>small(src,360,.8);
 const read=async f=>{if(!f)return"";if(/^data:/.test(f))return f;try{return await root.irProject.images.read(f)||""}catch{return""}};
 // фото объекта на выбор: исходник обложки вместо выреза, фото «в шапку», фото объекта
 // баннер (полоса 1920×180) в буклет не годится
 const allFiles=o=>[...new Set([o.cover_full||o.cover,...(o.hero||[]),...(o.photos||[])].filter(f=>f&&f!==o.banner&&!(o.cover_full&&f===o.cover)))];
 // что отмечено по умолчанию: сохранённый выбор (object-meta «booklet_photos»), иначе первые 4
 const pickDefault=o=>{const all=allFiles(o),saved=(o.booklet?.files||[]).filter(f=>all.includes(f));return{all,files:saved.length?saved:all.slice(0,4),layout:Number(o.booklet?.layout)||0}};
 // data: объекты так, как их собирает окно «Сайт» (siteObjectData) — cover, cover_full, photos, hero; files — выбранные
 // фото (первое — главное), layout — номер макета (0 — авто)
 async function make(data,{onProgress}={}){
  const profile=await root.irProject.company.get().catch(()=>({}));
  const logo=await small(await read(profile?.logo||""),1200);
  const objects=[];
  for(const [i,o] of data.entries()){
   onProgress?.(i,data.length,o.name);
   const files=(o.files||pickDefault(o).files).slice(0,4),pictures=[];
   for(const f of files){const s=await read(f);if(s)pictures.push(await small(s,pictures.length?1400:2800))}
   objects.push({...o,pictures})
  }
  const html=build(objects,{logo,company:profile?.name?{name:profile.name}:{}});
  const name="Буклет "+String(profile?.name||COMPANY.name).replace(/[«»"]/g,"")+" "+new Date().toLocaleDateString("ru-RU");
  return root.irProject.ai.invoke("ai-documents:exec-export",{format:"pdf",name,html})
 }
 const api={build,make,totals,doneOf,parties,COMPANY,LAYOUTS,layoutOf,thumb,read,pickDefault};
 if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.irBooklet=api;
})(typeof window!=="undefined"?window:globalThis);
