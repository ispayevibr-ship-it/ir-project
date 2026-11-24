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
   "Собственный штат специалистов и полный комплект исполнительной документации по каждому объекту."],
  // преимущества, заказчики, принципы — из буклета фирмы в Canva (инженер 24.11.2026 «текста с канвы еще возьми,
  // добавь, а то пустовато первая и вторая страница»)
  adv:[["Собственный штат","Инженеры, прорабы, сварщики, монтажники, рабочие"],["Своя строительная техника","Работаем оперативно, без зависимости от подрядчиков"],["Комплексный подход","От проекта и смет до сдачи объекта «под ключ»"],["Сроки и качество","Строгое соответствие нормам и требованиям заказчика"]],
  pledges:[["Гарантия","На все виды выполненных работ"],["Весь Казахстан","Объекты по всей стране, офис в Темиртау"]],
  license:"Государственная лицензия на строительно-монтажные работы II категории",
  clients:["ТОО «Темиртауский Казмеханомонтаж №2»","ТОО «СМУ-5»","ТОО «KVINTEC Construction»","ТОО «КазМетКокс»","ТОО «Құрылыс ТС»","ТОО «Eurasia Copper Operating»","ТОО «QAZCLINKER»","ТОО «ВЕЛЕТ»","ТОО «AAEngineering Group»","ТОО «Fonet Er-Tai AK Mining»","ТОО «KYZYL ARAY COPPER»","ТОО «Завод Техно-Караганда»","ТОО «Средазэнергомонтаж Павлодар»"],
  principles:{lead:"Мы стремимся к постоянному развитию, внедряем современные строительные технологии и применяем передовые материалы. Это позволяет повышать эффективность работ и обеспечивать высокое качество на всех этапах строительства.",
   items:[["Индивидуальный подход","Внимательно изучаем задачи каждого заказчика и подбираем оптимальные решения."],["Прозрачность и честность","Понятные объёмы, сроки и отчётность на каждом этапе."],["Безопасность прежде всего","Строго соблюдаем требования охраны труда и техники безопасности на объектах."],["Гарантийные обязательства","Предоставляем гарантию на все виды выполненных работ."]],
   note:"Надёжное строительство начинается с ответственности — и именно это является основой нашей репутации."},
  services:["Металлоконструкции","Технологическое оборудование","Сэндвич-панели и профнастил","Резервуары до 3 000 м³","Изготовление и окраска","Демонтаж и реконструкция"],
  // лист «Что мы делаем» — как раздел сайта a-ts.kz (server/pb_public/index.html #services; инженер 20.11.2026
 // «такую информацию еще можно добавить»)
 what:{lead:"Выполняем изготовление и монтаж металлоконструкций, установку технологического оборудования, демонтаж и другие строительно-монтажные работы на промышленных объектах Казахстана.",
  items:[["Металлоконструкции","Монтаж каркасов зданий и цехов, эстакад, бункеров, площадок, лестниц и ограждений."],
   ["Технологическое оборудование","Конвейеры, дозаторы, сушильное оборудование, мостовые краны, ёмкости, экстракторы, электролизные ванны."],
   ["Ограждающие конструкции","Стеновые и кровельные сэндвич-панели, профнастил, нащельники, водосток, ворота, двери, зенитные фонари."],
   ["Резервуары","Вертикальные стальные резервуары до 3 000 м³, противопожарные и кислотные резервуары, дымовые трубы."],
   ["Изготовление","Изготовление металлоконструкций, регистров и опор трубопроводов, огрунтовка, окраска, огнезащита."],
   ["Демонтаж и реконструкция","Демонтаж металлоконструкций, капитальный ремонт, перенос блочно-модульных зданий."],
   ["Общестроительные работы","Фундаментные плиты, ФБС, бетонные колонны, приямки, подготовка строительной площадки."],
   ["Документация","Полный пакет исполнительной документации по каждому объекту, закуп материалов."]]},
 slogan:["Мы строим не просто объекты —","мы строим доверие."],
  trust:"Каждый из этих проектов стал подтверждением нашего <b>профессионализма, качества исполнения и соблюдения сроков</b>. Мы гордимся доверием, оказанным нашими партнёрами."
 };
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const num=v=>{const n=Number(String(v??"").replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const fmt=(v,d)=>{const n=num(v),k=d??3;
  return n.toLocaleString("ru-RU",{minimumFractionDigits:0,maximumFractionDigits:k}).replace(/ /g," ")};
 const unitOf=u=>String(u||"").replace(/^м2$/i,"м²").replace(/^м3$/i,"м³").replace(/^тн$/i,"т");
 // итоги — как на сайте (KINDS в server/pb_public/index.html), по видам работ отмеченных объектов
 const DEMO=n=>/демонт/.test(n);
 // итоги — как на сайте a-ts.kz (KINDS в server/pb_public/index.html), каждый вид отдельно: металл, сэндвич, профнастил,
 // оборудование, изготовлено, демонтаж (инженер 20.11.2026 «где остальные объемы? почему все в кучу?», «сюда больше
 // информации, как на сайте объемы указаны»); фирма — totals, объект — objStats
 const PROF=n=>/профнаст|профлист|проф\.\s*лист|профилирован/.test(n),SAND=n=>/сэндвич|сендвич|панел/.test(n);
 const SKINDS=[["dmeq","т","оборудования демонтировано",n=>DEMO(n)&&/оборуд/.test(n)],["dmt","т","металлоконструкций демонтировано",DEMO],
  ["dmsp","м²","сэндвич-панелей демонтировано",n=>DEMO(n)&&SAND(n)],["dmpn","м²","профнастила демонтировано",n=>DEMO(n)&&PROF(n)],
  ["dmm","м²","покрытий демонтировано",DEMO],["fab","т","изготовлено металлоконструкций",n=>/изготов/.test(n)],
  ["eq","т","оборудования смонтировано",n=>/оборуд/.test(n)],["mk","т","металлоконструкций смонтировано",()=>true],
  ["sp","м²","сэндвич-панелей смонтировано",SAND],["pn","м²","профнастила смонтировано",PROF]];
 const ORDER=["mk","sp","pn","eq","fab","dmt","dmeq","dmsp","dmpn","dmm"];
 const fmtK=(v,u)=>fmt(v,u==="т"?(v>=100?1:2):(v>=1000?0:1));
 function sumKinds(list){const by=new Map();
  for(const o of list)for(const w of o.works||[]){const v=num(w.volume),u=unitOf(w.unit),n=String(w.name||"").toLowerCase();if(!(v>0))continue;
   const K=SKINDS.find(([,ku,,t])=>ku===u&&t(n));if(K)by.set(K[0],(by.get(K[0])||0)+v)}
  return by}
 const kindRows=(by,max)=>ORDER.filter(k=>by.get(k)>0).slice(0,max).map(k=>{const K=SKINDS.find(x=>x[0]===k);return[fmtK(by.get(k),K[1])+" "+K[1],K[2]]});
 function totals(objects){const n=objects.length,word=n%10===1&&n%100!==11?"объект выполнен":n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?"объекта выполнено":"объектов выполнено";
  return[["с 2023 года","на рынке строительства"],...kindRows(sumKinds(objects),10),[String(n),word]]}
 const objStats=o=>kindRows(sumKinds([o]),6);
 // на листе объекта итогов по типам нет — объёмы уже в списке видов работ, а сумма по типам путала: работа в тоннах без
 // своего типа шла в «металлоконструкций» (инженер 24.11.2026 «почему тут указаны эти данные? которые не относят вроде
 // как к объекту»)
 const statsOf=(o,co)=>"",statsOld=(o,co)=>{const st=objStats(o);return st.length?`<div class="osd up">Выполнено на ${esc(o.asOf||co.date)}</div><div class="ost">${st.map(([b,t])=>`<div><b>${esc(b)}</b><span>${esc(t)}</span></div>`).join("")}</div>`:""};
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
.gal{background:#15191d}.gal .gh{position:absolute;left:0;right:0;top:0;height:22mm;background:#fff;display:flex;align-items:center;padding:0 14mm 0 16mm;gap:6mm}
.gal .gh:before{content:"";position:absolute;left:0;top:0;bottom:0;width:6mm;background:var(--or)}
.gal .gh .t{min-width:0}.gal .gh small{display:block;font-size:7pt;font-weight:800;letter-spacing:1.4px;color:var(--ord)}.gal .gh b{display:block;font-size:13pt;font-weight:900;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gal .gh .lg{margin-left:auto;flex:none;height:14mm;display:flex;align-items:center}.gal .gh .lg img{max-height:14mm;max-width:50mm;object-fit:contain}.gal .gh .lg b{font-size:10pt}
.gal .gg{position:absolute;left:6mm;right:6mm;top:28mm;bottom:6mm;display:grid;gap:3mm}.gal .gg div{background:#3a4047 center/cover no-repeat;border-radius:1.5mm}
.gal .n1{grid-template:1fr/1fr}.gal .n2{grid-template:1fr/1fr 1fr}.gal .n3{grid-template:1fr 1fr/1.6fr 1fr}.gal .n3 div:first-child{grid-row:span 2}
.gal .n7{grid-template:1fr 1fr/repeat(4,1fr)}.gal .n7 div:first-child{grid-row:span 2}.gal .n8{grid-template:1fr 1fr/repeat(4,1fr)}.gal .n9{grid-template:repeat(3,1fr)/repeat(3,1fr)}
.gal .n10{grid-template:1fr 1fr/repeat(5,1fr)}
.gal .n11{grid-template:repeat(3,1fr)/repeat(4,1fr)}
.gal .n11 div:first-child{grid-column:span 2}
.gal .n12{grid-template:repeat(3,1fr)/repeat(4,1fr)}
.gal.wsum .gg{left:104mm}.gal .gs{position:absolute;left:6mm;top:28mm;bottom:6mm;width:94mm;background:#fff;border-radius:1.5mm;border-top:1.4mm solid var(--or);padding:6mm 6mm 5mm;overflow:hidden;display:flex;flex-direction:column}
.gal .gs small{font-size:7pt;font-weight:800;letter-spacing:1.4px;color:var(--ord);margin-bottom:3mm}.gal .gt{font-size:8.6pt;line-height:1.55;color:#2c333b;overflow:hidden;min-height:0}.gal.gsm .gt{font-size:7.2pt;line-height:1.45}
.gal .gt p,.gal .gt h5,.gal .gt ul,.gal .gt ol{margin:0 0 1.6mm}.gal .gt ul,.gal .gt ol{padding-left:4mm}.gal .gt h5{font-size:1.05em;font-weight:800}
.gal .n4{grid-template:1fr 1fr/1fr 1fr}.gal .n5{grid-template:1fr 1fr/1.5fr 1fr 1fr}.gal .n5 div:first-child{grid-row:span 2}.gal .n6{grid-template:1fr 1fr/1fr 1fr 1fr}
.svcp:before{content:"";position:absolute;left:0;top:0;width:70mm;height:52mm;background:linear-gradient(135deg,var(--or2),var(--or));clip-path:polygon(0 0,100% 0,0 100%)}
.svcp .sh{position:absolute;left:16mm;top:20mm;width:190mm}.svcp .sh .kick{font-size:7.5pt;font-weight:800;letter-spacing:1.4px;color:var(--ink);margin-bottom:2mm}
.svcp h2{margin:0;font-size:34pt;font-weight:900;line-height:1;text-transform:uppercase;letter-spacing:-.5px}
.svcp .ld{margin:5mm 0 0;font-size:10pt;line-height:1.55;color:#4b525c}
.svcp .lg{position:absolute;right:14mm;top:13mm;height:20mm;width:60mm;display:flex;justify-content:flex-end;align-items:flex-start}.svcp .lg img{max-height:20mm;max-width:60mm;object-fit:contain}.svcp .lg b{font-size:11pt;font-weight:900}
.svcp .sg{position:absolute;left:16mm;right:16mm;top:56mm;bottom:64mm;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:1fr 1fr;border-top:.35mm solid var(--ink);border-bottom:.35mm solid var(--ink)}
.svcp .sc{padding:4mm 6mm 3mm 0;border-left:.35mm solid var(--ink);padding-left:6mm;overflow:hidden}.svcp .sc:nth-child(4n+1){border-left:0;padding-left:0}.svcp .sc:nth-child(n+5){border-top:.35mm solid var(--ink)}
.svcp .sc i{display:block;font-style:normal;font-size:9pt;font-weight:800;color:var(--ord);letter-spacing:.6px;margin-bottom:2mm}
.svcp .pr{position:absolute;left:16mm;right:16mm;top:151mm;bottom:26mm;display:grid;grid-template-columns:1.25fr repeat(4,1fr);gap:4mm}
.svcp .ph .kick{font-size:7.5pt;font-weight:800;letter-spacing:1.4px;color:var(--ord);margin-bottom:2mm}.svcp .ph p{margin:0;font-size:8pt;line-height:1.5;color:#4b525c}
.svcp .pi{background:#faf6ee;border-radius:2.5mm;padding:3.2mm 3.6mm;border-top:1.2mm solid var(--or);overflow:hidden}.svcp .pi b{display:block;font-size:9.5pt;font-weight:800;line-height:1.2;margin-bottom:2mm}.svcp .pi p{margin:0;font-size:7.8pt;line-height:1.45;color:var(--mut)}
.svcp .sc b{display:block;font-size:11.5pt;font-weight:800;line-height:1.15;margin-bottom:2mm}.svcp .sc p{margin:0;font-size:7.9pt;line-height:1.45;color:var(--mut)}
.svcp .bd{position:absolute;left:0;right:0;bottom:0;height:20mm;background:#1d2228;color:#fff;display:flex;align-items:center;padding:0 16mm;gap:8mm}
.svcp .bd .sl{font-size:11pt;font-weight:800;line-height:1.25}.svcp .bd .sl i{font-style:normal;color:var(--or)}.svcp .bd .ct{margin-left:auto;text-align:right;font-size:8pt;line-height:1.6;color:#d6d9dd}
.svcp .bd:before{content:"";position:absolute;left:0;top:0;width:6mm;bottom:0;background:var(--or)}
:root{--or:#f5a700;--or2:#ffbf2e;--ord:#d48f00;--ink:#1d2228;--mut:#6b7380;--line:#ece7dc}
*{box-sizing:border-box}body{margin:0;font-family:Montserrat,"Segoe UI",Arial,sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:297mm;height:210mm;position:relative;overflow:hidden;page-break-after:always;background:#fff}.page:last-child{page-break-after:auto}.up{text-transform:uppercase}
.L{position:absolute;left:0;top:0;bottom:0;width:100mm;background:#fff;z-index:2}
.L:before{content:"";position:absolute;left:0;top:0;width:58mm;height:46mm;background:linear-gradient(135deg,var(--or2),var(--or));clip-path:polygon(0 0,100% 0,0 100%)}
.L .in{position:absolute;left:11mm;right:9mm;top:15mm;bottom:12mm;display:flex;flex-direction:column}
.ttl{font-size:21pt;font-weight:900;line-height:1.08;margin:0 0 2mm;position:relative;overflow-wrap:anywhere;hyphens:auto}.ttl.s{font-size:17pt}.ttl.xs{font-size:14pt}
.sub{font-size:8pt;color:var(--mut);font-weight:600;letter-spacing:.6px;margin-bottom:6mm}
.wks{overflow:hidden;flex:0 1 auto;min-height:0}
.wk{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:4mm;padding:3mm 0;border-bottom:1px solid var(--line)}
.wk b{font-size:8.4pt;font-weight:800;line-height:1.25;hyphens:auto;overflow-wrap:break-word}.vol{text-align:right;white-space:nowrap}
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
.A1{position:absolute;left:0;top:0;bottom:0;width:86mm;background:linear-gradient(170deg,var(--or2),var(--or) 60%,var(--ord));padding:12mm 9mm;display:flex;flex-direction:column}
.A1 .lg{background:#fff;border-radius:3mm;padding:4mm;text-align:center;margin-bottom:7mm;box-shadow:0 2mm 6mm rgba(0,0,0,.12)}
.A1 .lg img{max-height:30mm;max-width:100%;object-fit:contain}.A1 .lg b{font-size:15pt;font-weight:900}
.A1 h3{font-size:10pt;font-weight:900;margin:0 0 1mm;line-height:1.25}.A1 .bin{font-size:8pt;font-weight:700;margin-bottom:5mm}
.kv{font-size:7.6pt;line-height:1.45;margin-bottom:2.6mm}.kv small{display:block;font-weight:900;font-size:6.6pt;letter-spacing:.8px;opacity:.75}
.A2{position:absolute;left:86mm;top:0;bottom:0;width:113mm;padding:13mm 10mm 12mm 11mm;display:flex;flex-direction:column}
.kick{font-size:7.5pt;font-weight:800;color:var(--ord);letter-spacing:2px}
.A2 h2{font-size:19pt;font-weight:900;margin:1mm 0 4mm;line-height:1.05}.A2 p{font-size:8.6pt;line-height:1.55;margin:0 0 3mm;color:#333a42}
.nums{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin:3mm 0 5mm}.nums div{border-top:1mm solid var(--or);padding-top:2mm}
.nums.many{gap:2.5mm 3mm;margin:2mm 0 4mm}.nums.many b{font-size:12.5pt}.nums.many span{font-size:6.2pt}.nums.many div{padding-top:1.5mm}
.nums b{display:block;font-size:16pt;font-weight:900;line-height:1.1}.nums span{font-size:6.8pt;color:var(--mut);font-weight:600}
.adv{display:grid;grid-template-columns:1fr 1fr;gap:3mm}.adv div{background:#faf6ee;border-radius:2mm;padding:3mm;font-size:7.4pt;line-height:1.35}.adv b{display:block;font-size:8pt;margin-bottom:.6mm}
.slogan{margin-top:auto;padding-top:6mm;font-size:13pt;font-weight:900;line-height:1.2}.slogan i{font-style:normal;color:var(--or)}
.A3{position:absolute;left:199mm;right:0;top:0;bottom:0;background:#1d2228;color:#fff;padding:13mm 9mm 12mm;display:flex;flex-direction:column}.A3 .kick{color:var(--or)}
.A3 h2{font-size:15pt;font-weight:900;margin:1mm 0 5mm;line-height:1.15}.cust{list-style:none;margin:0;padding:0;max-height:138mm;overflow:hidden}.cust.many li{font-size:7.2pt;padding:1.2mm 0}.cust li.more{color:#c9ced5;font-weight:500}.cust li.more:before{background:none}
.gar{margin-top:auto;padding-top:3mm;display:grid;grid-template-columns:1fr 1fr;gap:2.4mm}.gar div{background:#1d2228;color:#fff;border-radius:2mm;padding:2.4mm 2.6mm;font-size:6.8pt;line-height:1.35;color:#d6d9dd}.gar b{display:block;color:var(--or);font-size:8.4pt;font-weight:800;margin-bottom:.5mm}
.lic{margin-top:1.5mm;padding:3mm;border-radius:2mm;background:rgba(255,255,255,.35);font-size:7.6pt;line-height:1.4;font-weight:700}.lic small{display:block;font-weight:900;font-size:6.6pt;letter-spacing:.8px;opacity:.75}
.cust li{font-size:8pt;font-weight:600;padding:1.9mm 0;border-bottom:1px solid rgba(255,255,255,.1);display:flex;gap:2.5mm;align-items:center}
.cust li:before{content:"";flex:none;width:1.6mm;height:1.6mm;background:var(--or);transform:rotate(45deg)}
.A3 .q{margin-top:5mm;font-size:8pt;line-height:1.5;color:#c9ced5}
.A3 .rep{margin-top:auto;padding:5mm 0 0 5mm;border-left:1.4mm solid var(--or);font-size:11pt;font-weight:800;line-height:1.35}.A3 .rep:before{content:"«";display:block;font-size:30pt;line-height:.6;color:var(--or);margin-bottom:2mm}.A3 .q b{color:#fff}
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
.lay5 .ro .wks{flex:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:6mm;align-content:start}.lay5 .ro .wk{padding:2.4mm 0}.lay5 .ro .vol i{font-size:13pt}.lay5 .ro .wk b{font-size:7.4pt}
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
.lay6 .gp{margin-top:5mm;font-size:7.6pt;font-weight:700;line-height:1.35}.lay6 .gp small{display:block;font-size:6pt;letter-spacing:.8px;color:var(--or2);margin-top:2.5mm}
.page.fit1 .wk{padding:2mm 0}.page.fit1 .vol i{font-size:14pt}.page.fit1 .wk b{font-size:7.8pt}.page.fit1 .sub{margin-bottom:4mm}.page.fit1 .badges{padding-top:3mm}.page.fit1 .osd{padding-top:3mm}
.page.fit2 .wk{padding:1.5mm 0}.page.fit2 .vol i{font-size:12.5pt}.page.fit2 .wk b{font-size:7.1pt}.page.fit2 .vol s{font-size:7.5pt}.page.fit2 .sub{margin-bottom:3mm}.page.fit2 .badges{padding-top:2.5mm}.page.fit2 .osd{padding-top:2.5mm}.page.fit2 .ost b{font-size:11pt}
.page.fit3 .wk{padding:1.1mm 0;gap:3mm}.page.fit3 .vol i{font-size:11pt}.page.fit3 .wk b{font-size:6.4pt;line-height:1.2}.page.fit3 .vol s{font-size:6.8pt}.page.fit3 .vol u{font-size:5.8pt}.page.fit3 .sub{margin-bottom:2.5mm}.page.fit3 .badges{padding-top:2mm}.page.fit3 .osd{padding-top:2mm}.page.fit3 .ost b{font-size:10pt}.page.fit3 .ost span{font-size:5.6pt}
.page.fit4 .wk{padding:.9mm 0;gap:3mm}.page.fit4 .vol i{font-size:10pt}.page.fit4 .wk b{font-size:5.9pt;line-height:1.2}.page.fit4 .vol s{font-size:6.4pt}.page.fit4 .vol u{font-size:5.4pt}.page.fit4 .sub{margin-bottom:2mm}.page.fit4 .badges{padding-top:2mm}.page.fit4 .osd,.page.fit4 .ost{display:none}
.geop:before{content:"";position:absolute;left:0;top:0;width:70mm;height:52mm;background:linear-gradient(135deg,var(--or2),var(--or));clip-path:polygon(0 0,100% 0,0 100%)}
.geop .sh{position:absolute;left:16mm;top:20mm;width:200mm}.geop .sh .kick{font-size:7.5pt;font-weight:800;letter-spacing:1.4px;color:var(--ink);margin-bottom:2mm}
.geop h2{margin:0;font-size:34pt;font-weight:900;line-height:1;text-transform:uppercase;letter-spacing:-.5px}.geop .ld{margin:4mm 0 0;font-size:10pt;line-height:1.5;color:#4b525c}
.geop .lg{position:absolute;right:14mm;top:13mm;height:20mm;width:60mm;display:flex;justify-content:flex-end;align-items:flex-start}.geop .lg img{max-height:20mm;max-width:60mm;object-fit:contain}.geop .lg b{font-size:11pt;font-weight:900}
.geop .mp{position:absolute;left:12mm;top:62mm;width:200mm}.geop .mp svg{display:block;width:100%;height:auto}
.geop .kz{fill:#e6e3dc;stroke:#b9b4a8;stroke-width:1.5;stroke-linejoin:round}
.geop .pt circle.o{fill:var(--or);stroke:#fff;stroke-width:3}.geop .pt circle.h{fill:var(--or);opacity:.22}
.geop .pt text{font:700 19px Montserrat,Arial,sans-serif;fill:var(--ink);paint-order:stroke;stroke:#fff;stroke-width:5px;stroke-linejoin:round}
.geop .pt text.n{fill:#141414;stroke:none;font-size:15px;font-weight:800;text-anchor:middle;dominant-baseline:central}
.geop .office line{stroke:#141414;stroke-width:2;stroke-dasharray:4 4}.geop .office rect{fill:#141414}.geop .office .od{fill:#141414;stroke:#fff;stroke-width:3}.geop .office .oc{fill:var(--or)}
.geop .office .pl{fill:none;stroke:var(--or);stroke-width:2.5;opacity:.6}.geop .office text{font:800 17px Montserrat,Arial,sans-serif;fill:#fff}.geop .office text.s{font-weight:500;font-size:13px;fill:#d9d4c7}
.geop .office path{fill:none;stroke:var(--or);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.geop div.pl{position:absolute;left:222mm;right:14mm;top:62mm;bottom:28mm;display:flex;flex-direction:column;gap:2mm;overflow:hidden}
.geop div.pl div{display:flex;justify-content:space-between;align-items:center;gap:3mm;background:#f3f1ec;border-radius:2.5mm;padding:2.6mm 3.4mm;font-size:8.6pt;font-weight:700;line-height:1.2}
.geop div.pl span{color:var(--mut);font-weight:500;font-size:7.6pt;white-space:nowrap}.geop div.pl .more{background:none;color:var(--mut);font-weight:500}
.geop .bd{position:absolute;left:0;right:0;bottom:0;height:20mm;background:#1d2228;color:#fff;display:flex;align-items:center;padding:0 16mm;gap:8mm}
.geop .bd .sl{font-size:11pt;font-weight:800;line-height:1.25}.geop .bd .sl i{font-style:normal;color:var(--or)}.geop .bd .ct{margin-left:auto;text-align:right;font-size:8pt;line-height:1.6;color:#d6d9dd}`;
 const CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
 const CAL='<svg viewBox="0 0 24 24" fill="none" stroke="#1d2228" stroke-width="2.4" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
 const bg=src=>src?` style="background-image:url('${String(src).replace(/'/g,"%27")}')"`:"";

 function servicesPage(co,logo){const w=co.what||COMPANY.what;
  return`<section class="page svcp"><div class="lg">${logo?`<img src="${esc(logo)}" alt="">`:`<b>${esc(co.name)}</b>`}</div>
  <div class="sh"><div class="kick up">Услуги</div><h2>Что мы делаем</h2><p class="ld">${esc(w.lead)}</p></div>
  <div class="sg">${w.items.slice(0,8).map(([t,d],i)=>`<div class="sc"><i>${String(i+1).padStart(2,"0")}</i><b>${esc(t)}</b><p>${esc(d)}</p></div>`).join("")}</div>
  ${(()=>{const pr=co.principles||COMPANY.principles;return`<div class="pr"><div class="ph"><div class="kick up">Наши принципы</div><p>${esc(pr.lead)}</p></div>${pr.items.map(([t,d])=>`<div class="pi"><b>${esc(t)}</b><p>${esc(d)}</p></div>`).join("")}</div>`})()}
  <div class="bd"><div class="sl">${esc(co.slogan[0])} <i>${esc(co.slogan[1])}</i></div><div class="ct">${esc(co.site)} · ${esc(co.contactMail)}<br>WhatsApp ${esc(co.whatsapp)}</div></div></section>`}
 // лист «География работ» — последний лист буклета, как раздел сайта a-ts.kz (server/pb_public/index.html #geo:
 // тот же контур Казахстана, те же города и центры областей, близкие города одной точкой, офис в Темиртау; инженер
 // 20.11.2026 «карту тоже сделай отдельной страницей в самом низу»). Точки — по адресам объектов буклета. Окно печати
 // без скриптов, поэтому подписи ставятся здесь по оценке ширины текста: справа от точки, слева, сверху, снизу, иначе без
 // подписи — не на чужих точках, подписях и плашке офиса (как на сайте).
 const KZ_PATH="M598 483 596 484 594 485 593 486 591 488 590 490 588 490 587 489 585 489 583 491 581 494 578 498 574 501 570 503 567 504 565 505 561 508 560 510 557 511 555 513 552 515 552 519 551 521 547 524 545 527 543 530 541 533 540 534 540 537 541 539 541 541 540 542 539 542 537 542 534 541 530 538 529 537 528 535 528 533 529 530 529 527 528 526 527 525 526 524 525 521 523 522 522 522 520 521 515 522 511 522 508 522 503 523 498 523 496 523 495 522 494 518 494 516 492 510 492 506 491 501 490 496 490 492 486 492 482 492 478 492 478 489 478 485 478 480 479 475 479 470 480 464 480 460 480 456 478 457 475 458 473 460 471 456 470 453 467 448 466 444 462 442 460 440 458 437 455 434 453 432 451 429 449 430 446 432 444 433 441 435 440 435 437 435 434 435 429 434 425 434 421 434 415 433 410 433 406 433 401 434 396 435 391 436 386 437 382 438 380 437 378 434 374 429 371 426 369 423 365 419 363 416 360 413 358 410 357 406 356 405 353 402 350 400 346 398 343 395 339 393 336 390 333 388 329 386 326 383 323 381 319 378 316 376 313 374 309 371 306 369 302 366 299 364 296 362 294 363 290 364 286 365 282 367 275 369 270 370 266 371 263 373 258 374 253 376 248 378 244 379 240 380 236 382 233 383 233 391 233 399 233 408 233 416 233 425 233 433 233 441 233 450 233 458 233 466 233 475 233 483 233 491 233 500 233 508 233 517 232 516 230 517 226 518 223 519 222 518 220 517 219 516 217 513 216 512 214 508 212 505 208 499 208 497 207 495 206 493 202 489 197 485 192 482 191 481 188 480 185 480 183 480 178 481 173 482 167 484 162 486 161 487 158 490 153 494 149 500 148 496 148 490 148 488 149 483 150 480 152 476 152 472 151 464 150 462 149 462 147 462 144 462 143 463 141 460 138 460 137 460 136 461 134 460 133 459 132 457 131 455 129 452 127 450 125 449 121 449 119 449 119 447 120 442 120 440 119 438 119 436 118 434 116 432 114 428 111 420 108 412 107 411 104 409 99 408 96 407 94 406 94 404 94 402 94 400 95 398 98 396 104 396 109 396 113 400 115 400 116 401 120 400 121 399 125 400 124 398 123 397 121 397 120 396 117 393 114 389 113 388 112 385 113 383 116 381 118 378 119 374 120 372 122 369 125 370 130 368 138 368 147 368 149 368 155 370 159 371 163 371 166 370 163 368 157 364 155 362 158 354 162 347 164 339 164 331 162 329 163 326 164 324 165 322 164 319 163 315 162 314 159 311 153 311 148 310 147 311 146 312 145 313 141 316 140 316 139 316 137 313 135 313 130 312 128 309 127 309 119 306 116 306 110 308 106 311 104 312 102 314 101 314 99 314 98 314 95 317 90 321 88 323 85 324 82 325 79 325 78 326 74 327 72 327 72 328 72 331 70 330 68 332 69 334 68 333 62 330 58 328 54 325 53 325 52 324 51 322 51 321 52 319 53 319 54 318 55 318 56 319 58 320 61 320 62 320 62 318 59 311 56 306 54 300 52 298 49 293 46 288 43 284 42 283 37 282 29 281 26 280 24 282 22 283 20 281 18 278 17 275 17 272 18 269 16 265 15 263 11 261 6 258 5 252 7 244 11 238 14 235 15 233 15 231 15 230 13 228 11 226 10 223 10 219 12 211 14 206 18 203 21 200 22 198 22 195 22 192 23 190 24 189 25 187 27 186 29 185 32 187 35 190 40 197 43 201 44 203 47 206 50 207 54 205 58 203 59 202 60 200 59 197 58 195 57 192 56 187 55 180 54 178 55 178 57 178 59 178 61 177 65 174 71 169 73 166 74 163 76 161 80 160 83 159 86 157 90 155 94 153 95 152 96 150 100 146 103 142 106 139 107 137 109 138 113 139 116 140 119 142 119 144 119 146 121 147 122 147 124 146 127 146 131 144 137 139 142 138 145 139 147 142 149 145 150 146 152 146 154 146 157 146 159 147 162 147 166 146 167 146 169 146 172 148 174 149 178 155 180 156 184 158 186 160 189 162 190 164 193 167 196 172 196 176 197 179 198 181 199 181 200 180 201 179 201 176 201 172 200 168 199 167 199 166 199 164 201 164 203 164 206 166 210 169 214 173 218 176 223 178 226 179 229 178 232 177 235 174 237 172 238 170 242 166 246 163 248 164 249 165 253 163 255 162 259 162 263 163 266 166 269 168 272 168 274 167 276 165 277 162 279 161 284 161 287 161 292 162 296 165 299 169 303 174 304 175 307 176 309 176 311 177 318 178 319 178 320 179 319 182 320 182 325 181 327 179 329 175 330 171 332 170 333 169 334 170 336 172 339 175 342 176 344 176 347 176 354 175 361 172 365 169 367 164 368 159 370 156 369 152 366 149 365 148 356 146 356 145 355 144 347 141 343 140 342 138 341 136 338 134 333 131 332 130 333 128 337 127 342 123 344 122 348 122 352 119 354 117 356 115 355 113 352 107 350 103 351 100 353 98 355 96 356 94 357 92 361 91 366 91 369 92 373 92 378 93 380 93 381 92 382 91 382 89 381 87 375 85 372 83 370 83 367 82 363 81 361 81 360 79 360 76 361 75 363 74 366 74 368 73 369 73 369 72 369 71 367 70 366 70 364 70 362 71 358 70 355 68 356 67 358 65 359 64 359 61 359 59 359 56 362 54 364 53 370 55 379 57 380 56 380 55 381 55 392 54 395 53 396 52 406 51 408 50 409 48 412 48 415 48 419 47 422 46 425 46 429 45 430 44 431 44 434 42 440 41 442 41 445 42 449 41 452 40 453 41 456 42 457 41 458 39 459 36 461 35 463 34 464 33 465 32 471 32 476 29 477 31 483 30 491 29 496 28 505 26 508 24 514 24 519 23 522 20 525 20 528 20 530 19 532 18 532 16 532 14 532 12 534 11 537 11 539 11 544 7 547 5 550 4 557 5 563 5 569 7 572 9 575 11 577 12 580 12 582 12 584 10 585 9 587 8 593 7 595 9 597 14 599 20 603 29 604 33 604 35 604 38 603 41 601 45 602 47 608 49 616 48 621 47 624 47 626 46 627 43 629 43 631 45 632 48 633 50 633 53 634 56 635 57 637 56 638 55 639 54 638 53 638 51 638 50 639 50 642 50 646 51 651 55 654 56 655 56 658 56 661 55 663 53 663 52 665 52 666 53 666 55 665 57 662 59 658 62 656 65 655 69 656 71 657 73 657 75 658 75 660 74 664 70 666 69 669 68 674 69 678 70 680 72 681 73 683 73 683 71 683 69 684 67 689 64 693 61 694 61 697 61 698 61 703 59 706 56 707 54 707 52 708 51 713 51 714 50 719 49 725 45 728 43 734 42 735 42 737 41 740 39 742 39 741 43 739 48 738 49 732 49 732 51 733 53 733 54 734 55 736 57 742 61 749 67 757 73 763 77 765 80 767 81 771 88 775 94 782 104 788 114 794 126 798 132 806 146 808 150 812 158 816 166 819 172 821 173 821 171 821 170 822 169 824 167 826 167 827 167 829 166 830 164 830 161 829 159 830 157 831 157 832 156 834 156 835 154 837 153 839 154 840 154 842 155 843 157 844 157 847 157 847 159 846 161 845 163 845 165 846 166 851 165 853 166 853 167 854 169 854 170 854 172 855 173 859 173 862 173 866 172 870 174 873 174 876 173 880 174 883 172 885 170 885 169 886 168 890 168 893 168 894 165 896 164 899 164 901 164 906 166 910 168 913 171 915 172 917 176 919 178 921 181 921 184 923 190 924 192 926 192 929 192 931 193 937 197 939 197 941 198 941 200 940 202 941 204 943 207 944 209 946 213 947 214 948 215 950 214 953 215 962 217 964 217 965 219 966 218 968 218 970 219 971 217 972 215 976 214 978 211 980 209 982 208 983 210 983 211 982 213 980 215 981 216 983 216 985 219 989 225 990 226 991 228 993 228 995 229 997 231 998 234 995 233 991 233 988 233 987 233 985 235 984 236 983 239 984 242 983 248 981 250 979 254 977 255 974 256 972 257 967 258 961 258 959 259 958 262 957 264 956 266 955 271 954 276 955 282 955 289 955 292 957 295 957 297 957 300 955 303 954 306 953 307 950 308 947 308 944 311 941 313 937 315 936 316 935 315 934 312 933 311 931 311 930 311 925 310 922 310 920 310 917 311 912 310 910 309 908 308 903 306 897 303 894 302 893 303 893 305 892 308 892 311 887 323 885 332 881 340 880 346 878 353 876 358 875 361 875 362 876 364 879 365 882 366 883 367 883 369 883 372 882 375 881 377 881 378 879 378 877 377 876 375 874 375 871 375 868 377 866 377 865 376 863 374 862 371 860 370 858 371 852 374 844 376 840 378 838 378 835 378 831 379 829 380 825 381 820 382 818 385 816 387 816 388 817 389 819 390 822 390 825 390 828 391 830 392 831 393 830 394 829 394 828 395 829 396 828 399 827 403 828 407 828 411 828 413 828 415 829 417 830 421 831 423 834 430 835 435 836 440 835 443 835 444 837 445 838 448 838 449 838 451 837 452 834 451 831 452 829 454 828 455 828 456 830 458 832 459 832 460 829 461 825 463 824 465 823 468 823 469 823 473 824 477 825 482 825 483 825 484 824 485 821 481 817 477 814 476 809 475 807 475 805 474 804 472 802 470 800 468 799 464 798 464 796 464 793 464 792 464 790 463 786 462 783 460 779 460 777 460 771 461 765 459 761 459 758 459 757 459 755 459 752 459 747 456 746 456 745 456 737 458 734 458 727 458 720 458 718 458 716 458 714 462 713 462 706 461 698 459 693 456 688 453 682 449 678 447 677 448 676 448 675 449 672 448 670 451 666 452 663 454 662 455 659 466 659 470 660 477 658 477 656 475 655 473 653 473 645 471 643 470 642 469 640 468 637 467 631 464 628 464 620 462 618 462 614 463 612 464 610 463 606 465 604 467 602 470 600 472 600 475 599 477 597 479 597 481 598 483Z";
 const GEO=[["темиртау",50.06,72.96],["караганд",49.80,73.10],["шахтинск",49.71,72.59],["сарань",49.79,72.85],["абай",49.63,72.86],["балхаш",46.84,74.98],["жезказган",47.78,67.71],["сатпаев",47.90,67.53],["приозерск",46.03,73.70],
  ["астан",51.17,71.43],["нур-султан",51.17,71.43],["алмат",43.24,76.89],["шымкент",42.32,69.59],["павлодар",52.29,76.97],["экибастуз",51.73,75.32],["аксу",52.04,76.92],["актобе",50.28,57.17],["актюбинск",50.28,57.17],
  ["атырау",47.11,51.92],["актау",43.65,51.17],["жанаозен",43.34,52.86],["уральск",51.23,51.37],["орал",51.23,51.37],["аксай",51.17,52.99],["костанай",53.21,63.63],["рудный",52.97,63.12],["лисаковск",52.54,62.49],
  ["кокшетау",53.28,69.39],["степногорск",52.35,71.89],["петропавловск",54.87,69.15],["усть-каменогорск",49.95,82.61],["оскемен",49.95,82.61],["риддер",50.34,83.51],["семей",50.41,80.23],["семипалатинск",50.41,80.23],
  ["тараз",42.90,71.37],["кызылорда",44.85,65.51],["байконур",45.62,63.31],["туркестан",43.30,68.25],["талдыкорган",45.02,78.37],["конаев",43.87,77.07],["капшагай",43.87,77.07],["жанатас",43.57,69.73],["каратау",43.18,70.46],["хромтау",50.25,58.44],["кандыагаш",49.47,57.42],["тенгиз",46.15,53.40],["кульсары",46.95,54.01],
  ["карагандинск",49.80,73.10],["акмолинск",51.17,71.43],["павлодарск",52.29,76.97],["алматинск",43.24,76.89],["актюбинск",50.28,57.17],["атырауск",47.11,51.92],["мангистауск",43.65,51.17],["западно-казахстанск",51.23,51.37],["костанайск",53.21,63.63],["северо-казахстанск",54.87,69.15],["восточно-казахстанск",49.95,82.61],["жамбылск",42.90,71.37],["кызылординск",44.85,65.51],["туркестанск",43.30,68.25],["абайск",50.41,80.23],["жетысуск",45.02,78.37],["улытауск",47.78,67.71]];
 const GK=36.4303,GC=Math.cos(48*Math.PI/180),gxy=(lat,lon)=>[(lon-46.4)*GC*GK,(55.5-lat)*GK];
 const GEO_FULL={астан:"Астана","нур-султан":"Астана",алмат:"Алматы",караганд:"Караганда",актюбинск:"Актобе",орал:"Уральск",оскемен:"Усть-Каменогорск",семипалатинск:"Семей",капшагай:"Конаев"};
 function geoOf(o){const raw=String(o.address||""),a=raw.toLowerCase().replace(/ё/g,"е"),m=raw.match(/(?:г\.|город)\s*([А-ЯЁA-Z][\wа-яё-]+)/i);
  const city=m?m[1].toLowerCase().replace(/ё/g,"е"):"",hit=(city&&GEO.find(([k])=>city.startsWith(k)))||GEO.find(([k])=>!/ск$/.test(k)&&a.includes(k))||GEO.find(([k])=>a.includes(k));
  if(!hit)return null;const [,lat,lon]=hit,gx=GEO.find(([k,la,lo])=>la===lat&&lo===lon&&!/ск$/.test(k));
  const nice=k=>GEO_FULL[k]||k.replace(/(^|-)([а-я])/g,(x,d,c)=>d+c.toUpperCase());
  const name=gx?nice(gx[0]):m?m[1]:raw.split(",")[0].trim();
  return{lat,lon,key:lat+","+lon,name,names:[name]}}
 const objWord=n=>n%10===1&&n%100!==11?"объект":n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?"объекта":"объектов";
 function geoGroups(objects){
  const groups=new Map();for(const o of objects){const p=geoOf(o);if(!p)continue;const g=groups.get(p.key)||{...p,list:[]};g.list.push(o);groups.set(p.key,g)}
  const merged=[];for(const g of [...groups.values()].sort((a,b)=>b.list.length-a.list.length)){const [x,y]=gxy(g.lat,g.lon),near=merged.find(m=>{const [mx,my]=gxy(m.lat,m.lon);return Math.hypot(mx-x,my-y)<22});
   if(near){near.list.push(...g.list);if(!near.names.includes(g.name))near.names.push(g.name)}else merged.push(g)}
  merged.forEach(g=>g.name=g.names.join(" и "));return merged.sort((a,b)=>b.list.length-a.list.length)}
 function mapPage(objects,co,logo){
  const all=geoGroups(objects);if(!all.length)return"";
  const f=v=>v.toFixed(1),hit=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  // офис — Темиртау, плашка слева снизу от точки, линия пунктиром
  const [ox,oy]=gxy(50.06,72.96),ow=Math.max(4*17*.68,8*13*.6)+58,oh=56;
  const dots=all.map(g=>{const [x,y]=gxy(g.lat,g.lon),n=g.list.length,r=Math.min(26,13+n*2.2);return{g,x,y,r,box:{x:x-r-9,y:y-r-9,w:2*r+18,h:2*r+18}}});
  // плашка офиса — слева снизу от точки, если там точка объекта — слева сверху, справа снизу, справа сверху
  const [ldx,ldy]=[[-1,1],[-1,-1],[1,1],[1,-1]].find(([sx,sy])=>{const b={x:sx<0?ox-40-ow:ox+40,y:oy+sy*52-oh/2,w:ow,h:oh};return !dots.some(o=>hit(b,o.box))})||[-1,1];
  const orx=ldx<0?ox-40-ow:ox+40,ory=oy+ldy*52-oh/2,ix=orx+14,iy=ory+oh/2-10,lx=ldx<0?orx+ow:orx;
  const office={x:orx,y:ory,w:ow,h:oh},placed=[],labels=new Map();
  for(const d of dots){const w=d.g.name.length*19*.64+4,h=22,R=d.r+9;
   const tries=[["start",d.x+R+8,d.y+7,{x:d.x+R+8,y:d.y-15,w,h}],["end",d.x-R-8,d.y+7,{x:d.x-R-8-w,y:d.y-15,w,h}],["middle",d.x,d.y-R-8,{x:d.x-w/2,y:d.y-R-8-h+5,w,h}],["middle",d.x,d.y+R+22,{x:d.x-w/2,y:d.y+R+5,w,h}]];
   const ok=tries.find(([,,,b])=>b.x>=0&&b.x+b.w<=1000&&!placed.some(o=>hit(b,o))&&!hit(b,office)&&!dots.some(o=>o!==d&&hit(b,o.box)));
   if(ok){placed.push(ok[3]);labels.set(d,ok)}}
  const pts=dots.slice().reverse().map(d=>{const L=labels.get(d);
   return`<g class="pt"><circle class="h" cx="${f(d.x)}" cy="${f(d.y)}" r="${f(d.r+9)}"/><circle class="o" cx="${f(d.x)}" cy="${f(d.y)}" r="${f(d.r)}"/><text class="n" x="${f(d.x)}" y="${f(d.y)}">${d.g.list.length}</text>${L?`<text x="${f(L[1])}" y="${f(L[2])}" text-anchor="${L[0]}">${esc(d.g.name)}</text>`:""}</g>`}).join("");
  const off=`<g class="office"><line x1="${f(ox)}" y1="${f(oy)}" x2="${f(lx)}" y2="${f(oy+ldy*52)}"/><circle class="pl" cx="${f(ox)}" cy="${f(oy)}" r="14"/><circle class="od" cx="${f(ox)}" cy="${f(oy)}" r="8"/><circle class="oc" cx="${f(ox)}" cy="${f(oy)}" r="3.5"/>
   <rect x="${f(orx)}" y="${f(ory)}" width="${f(ow)}" height="${oh}" rx="12"/><path d="M${f(ix)} ${f(iy+20)}h20M${f(ix+2)} ${f(iy+20)}V${f(iy+7)}l8-7 8 7v13M${f(ix+7)} ${f(iy+20)}v-6h6v6"/>
   <text class="t" x="${f(orx+44)}" y="${f(ory+25)}">Офис</text><text class="s" x="${f(orx+44)}" y="${f(ory+44)}">Темиртау</text></g>`;
  const n=all.reduce((s,g)=>s+g.list.length,0),rows=all.slice(0,14);
  return`<section class="page geop"><div class="lg">${logo?`<img src="${esc(logo)}" alt="">`:`<b>${esc(co.name)}</b>`}</div>
  <div class="sh"><div class="kick up">Где мы работали</div><h2>География работ</h2><p class="ld">${n} ${objWord(n)} в ${all.length} ${all.length%10===1&&all.length%100!==11?"месте":"местах"} Казахстана. Офис компании — г. Темиртау.</p></div>
  <div class="mp"><svg viewBox="0 0 1000 546"><path class="kz" d="${KZ_PATH}"/>${off}${pts}</svg></div>
  <div class="pl">${rows.map(g=>`<div><b>${esc(g.name)}</b><span>${g.list.length} ${objWord(g.list.length)}</span></div>`).join("")}${all.length>rows.length?`<div class="more">и ещё ${all.length-rows.length}</div>`:""}</div>
  <div class="bd"><div class="sl">${esc(co.slogan[0])} <i>${esc(co.slogan[1])}</i></div><div class="ct">${esc(co.address)}<br>${esc(co.site)} · WhatsApp ${esc(co.whatsapp)}</div></div></section>`}
 // предпросмотр в окне «Буклет» — те же листы уменьшенными, серый фон, номер и название листа над каждым
 const SCREEN=`body{background:#5d646c;padding:8mm 0}.page{margin:0 auto 10mm;box-shadow:0 2mm 8mm rgba(0,0,0,.35)}.pvn{width:297mm;margin:0 auto 2.5mm;color:#fff;font:600 11pt Montserrat,"Segoe UI",Arial,sans-serif}`;
 // заказчики объектов буклета первыми, затем список из буклета Canva; одинаковые названия — один раз
 const clientList=(objects,co)=>{const seen=new Set(),out=[];for(const t of [...parties(objects),...(co.clients||[])]){const k=String(t).toLowerCase().replace(/ё/g,"е").replace(/[«»"“”'\s.,-]|^(тоо|ао|ип)/g,"");if(t&&!seen.has(k)){seen.add(k);out.push(t)}}return out};
 function aboutPage(objects,co,logo){
  const ps=clientList(objects,co),many=ps.length>14,cut=ps.length>20?ps.slice(0,19):ps;
  return`<section class="page"><div class="A1"><div class="lg">${logo?`<img src="${esc(logo)}" alt="">`:`<b>${esc(co.name)}</b>`}</div>
  <h3 class="up">${esc(co.full)}</h3><div class="bin">БИН ${esc(co.bin)}</div>
  <div class="kv"><small class="up">Юридический адрес</small>${esc(co.address)}</div>
  <div class="kv"><small class="up">Телефоны</small>${co.phones.map(([k,v])=>esc(k)+": "+esc(v)).join("<br>")}</div>
  <div class="kv"><small class="up">Почта и сайт</small>${esc(co.mail)}<br>${esc(co.site)}</div>
  <div class="kv"><small class="up">Директор</small>${esc(co.head)}</div>
  <div class="kv"><small class="up">Банковские реквизиты</small>${co.bank.map(esc).join("<br>")}</div>
  ${co.license?`<div class="lic"><small class="up">Лицензия</small>${esc(co.license)}</div>`:""}
  <div class="gar">${(co.pledges||COMPANY.pledges).map(([b,t])=>`<div><b>${esc(b)}</b>${esc(t)}</div>`).join("")}</div></div>
  <div class="A2"><div class="kick up">О компании</div><h2>${esc(co.title)}</h2>${co.about.map(p=>`<p>${esc(p)}</p>`).join("")}
  <div class="nums${totals(objects).length>6?" many":""}">${totals(objects).map(([b,s])=>`<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("")}</div>
  <div class="adv">${co.adv.map(([b,s])=>`<div><b>${esc(b)}</b>${esc(s)}</div>`).join("")}</div>
  <div class="slogan">${esc(co.slogan[0])}<br><i>${esc(co.slogan[1])}</i></div></div>
  <div class="A3"><div class="kick up">Нам доверяют</div><h2>Заказчики и генподрядчики</h2>
  <ul class="cust${many?" many":""}">${cut.map(p=>`<li>${esc(p)}</li>`).join("")}${cut.length<ps.length?`<li class="more">и ещё ${ps.length-cut.length}</li>`:""}</ul>${(co.principles||COMPANY.principles).note?`<div class="rep">${esc((co.principles||COMPANY.principles).note)}</div>`:""}<div class="q">${co.trust}</div></div></section>`
 }
 // лист объекта — четыре макета, чтобы листы не были одинаковыми (инженер 20.11.2026 «чтобы не все страницы были
 // одинаковые, макет разный»): 1 «Классика» — текст слева, фото справа с полосой и кругами; 2 «Зеркало» — фото слева,
 // текст справа; 3 «Обложка» — фото на весь лист, виды работ плитками внизу; 4 «Мозаика» — фото сеткой, текст на
 // оранжевой колонке; 5 «Панорама» — фото полосой сверху, виды работ в две колонки; 6 «Тёмный» — тёмный лист, фото в
 // рамке и малые под ним. Макет выбирается у каждого объекта (инженер «выбор для каждого объекта макета своего, сделай
 // 5-6 разных макетов»); Авто — по очереди, по числу фото.
 const LAYOUTS=["Классика","Зеркало","Обложка","Мозаика","Панорама","Тёмный","Альбом","Фотоотчёт"];
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
 // сколько фото берёт каждый макет (инженер 24.11.2026 «сделай для каждого вида макета ограничение по количеству
 // фото»): на листе объекта у всех до 4 (главное и 3 малых), остальные — листом «Фото с объекта»; «Обложка» и «Тёмный» —
 // одним листом, без листа фото. Индекс 0 — «Авто»: выбирается только макет, в который входят все выбранные фото.
 // 7 «Альбом» — лист как «Классика» и до 8 фото листом фото, всего 12; 8 «Фотоотчёт» — лист как «Мозаика» и до 12 фото
 // листом фото, всего 16 (инженер 24.11.2026 «макеты добавь где есть хотя бы 12 фотографий»)
 const LAYOUT_MAX=[16,7,7,4,10,8,4,12,16];
 const capOf=o=>LAYOUT_MAX[Number(o?.layout)||0]||LAYOUT_MAX[0];
 const layoutOf=(o,i)=>{const n=Number(o.layout);if(n>=1&&n<=LAYOUTS.length)return n;const pics=(o.pictures||[]).length;if(!pics)return 1;
  const seq=(pics>=3?[1,3,5,2,4,6]:[1,3,5,2,6]).filter(l=>LAYOUT_MAX[l]>=pics);return seq.length?seq[i%seq.length]:pics<=12?7:8};
 function textCol(o,max,co){const name=String(o.name||"Объект"),ws=worksOf(o),p=doneOf(o);
  return`<h1 class="ttl up${titleCls(name)}">${esc(name)}</h1>${o.customer?`<div class="sub up">${esc(o.customer)}</div>`:""}
  <div class="wks">${wkRows(ws.slice(0,Math.min(max,o.wkMax||max)))}</div>${o.summary&&!o.sumMoved?`<div class="sum">${sumHtml(o.summary)}</div>`:""}
  ${statsOf(o,co)}<div class="badges">${ringOf(p)}${docOf()}</div>`}
 function placeOf(o,co){const place=String(o.address||"").trim();
  return`${yearOf(o)}${place?`<h4 class="up">Место выполнения</h4><p>${esc(place)}</p>`:""}<div class="contact">${esc(co.contactMail)}<br>WhatsApp ${esc(co.whatsapp)}</div>`}
 function circlesOf(rest){return rest.length?`<div class="circles">${rest.map((s,i)=>`<div class="c${rest.length===3&&i===1?" big":""}"${bg(s)}></div>`).join("")}</div>`:""}
 function objectPage(o,co,logo,i=0){const h=objectPage0(o,co,logo,i);return o.fit?h.replace('<section class="page','<section class="page fit'+o.fit):h}
 function objectPage0(o,co,logo,i=0){
  const lay0=layoutOf(o,i),lay=lay0===7?1:lay0===8?4:lay0,pics=o.pictures||[],main=pics[0]||"",rest=pics.slice(1,4);
  if(lay===2)return`<section class="page lay2"><div class="L"><div class="in">${textCol(o,12,co)}</div></div>
  <div class="R"><div class="ph"${bg(main)}></div>${logoOf(co,logo)}<div class="band"></div>${circlesOf(rest)}
  <div class="info">${placeOf(o,co)}</div>${footOf(o)}</div></section>`;
  if(lay===3){const name=String(o.name||"Объект"),ws=worksOf(o).slice(0,4),p=doneOf(o),place=String(o.address||"").trim();
   return`<section class="page lay3"><div class="ph"${bg(main)}></div><div class="shade"></div>${logoOf(co,logo)}
   <div class="hd"><div class="kick up">${esc(o.years?String(o.years):"Объект")}${place?" · "+esc(place):""}</div><h1 class="ttl up${titleCls(name)}">${esc(name)}</h1>
   ${o.summary&&!o.sumMoved?`<div class="sm">${sumHtml(o.summary)}</div>`:""}</div>
   ${rest.length?`<div class="thumbs">${rest.slice(0,3).map(s=>`<div${bg(s)}></div>`).join("")}</div>`:""}
   <div class="tiles"><div class="tw">${ws.map(w=>`<div class="tl"><i>${esc(fmt(num(w.volume)))}<s>${esc(unitOf(w.unit))}</s></i>${planOf(w)}<b class="up">${esc(w.name)}</b></div>`).join("")}</div>
   <div class="tr">${ringOf(p)}</div></div>
   <div class="strip"><div><small class="up">Генеральный подрядчик</small><b>${esc(o.general_contractor||"—")}</b></div><div><small class="up">Заказчик</small><b>${esc(o.customer||"—")}</b></div><div class="doc up"><em>${CHECK}</em>Полный пакет исполнительной документации</div></div></section>`}
  if(lay===5){const name=String(o.name||"Объект"),ws=worksOf(o).slice(0,12),p=doneOf(o);
   return`<section class="page lay5"><div class="ph"${bg(main)}></div>${logoOf(co,logo)}${circlesOf(rest)}
   <div class="lo"><h1 class="ttl up${titleCls(name)}">${esc(name)}</h1>${o.customer?`<div class="sub up">${esc(o.customer)}</div>`:""}
   <div class="info">${placeOf(o,co)}</div></div>
   <div class="ro"><div class="wks">${wkRows(ws.slice(0,o.wkMax||ws.length))}</div><div class="badges">${ringOf(p)}${docOf()}</div></div>${footOf(o," f5")}</section>`}
  if(lay===6){const name=String(o.name||"Объект"),p=doneOf(o);
   return`<section class="page lay6"><div class="fr${rest.length?"":" full"}"><div class="ph"${bg(main)}></div></div>
   ${rest.length?`<div class="row">${rest.slice(0,3).map(s=>`<div${bg(s)}></div>`).join("")}</div>`:""}
   <div class="tx">${logoOf(co,logo," l6")}<h1 class="ttl up${titleCls(name)}">${esc(name)}</h1>${o.customer?`<div class="sub up">${esc(o.customer)}</div>`:""}
   <div class="wks">${wkRows(worksOf(o).slice(0,Math.min(8,o.wkMax||8)))}</div><div class="badges">${ringOf(p)}<div class="meta">${yearOf(o)}<p>${esc(o.address||"")}</p></div></div>
   <div class="gp"><small class="up">Генподрядчик</small>${esc(o.general_contractor||"—")}<small class="up">Заказчик</small>${esc(o.customer||"—")}</div></div></section>`}
  if(lay===4){const n=Math.min(4,pics.length);
   return`<section class="page lay4"><div class="M m${n}">${pics.slice(0,4).map((s,k)=>`<div class="g g${k}"${bg(s)}></div>`).join("")}${logoOf(co,logo)}
   <div class="info">${placeOf(o,co)}</div></div>
   <div class="O"><div class="in">${textCol(o,12,co)}</div></div>${footOf(o," f4")}</section>`}
  return`<section class="page"><div class="L"><div class="in">${textCol(o,12,co)}</div></div>
  <div class="R"><div class="ph"${bg(main)}></div>${logoOf(co,logo)}
  <div class="band"></div>${circlesOf(rest)}
  <div class="info">${placeOf(o,co)}</div>${footOf(o)}</div></section>`
 }
 // больше фото (инженер 20.11.2026 «сделай в буклетах больше фото, а то везде 2-3»): макет листа берёт первые 4,
 // остальные выбранные (до 6) — следующим листом «Фото с объекта» сеткой по их числу
 const MAX_PHOTOS=16;
 // лист «Фото с объекта» — все фото, кроме главного, если их больше четырёх или краткая характеристика не вместилась на
 // лист объекта: тогда она здесь, слева тёмной колонкой (инженер 20.11.2026 «если на страницу переносишь, то больше фото
 // показывай с краткой информацией»)
 function galleryPage(o,co,logo){const all=o.pictures||[],sm=o.summary&&o.sumMoved;
  if(all.length<=4&&!sm)return"";const ps=all.length>=8?all.slice(4,MAX_PHOTOS):all.slice(all.length>1?1:0,MAX_PHOTOS);const gn=Math.min(ps.length,12);if(!ps.length&&!sm)return"";
  return`<section class="page gal${sm?" wsum":""}${o.galSmall?" gsm":""}"><div class="gh"><div class="t"><small class="up">Фото с объекта</small><b>${esc(o.name||"Объект")}</b></div>
  <div class="lg">${logo?`<img src="${esc(logo)}" alt="">`:`<b>${esc(co.name)}</b>`}</div></div>
  ${sm?`<div class="gs"><small class="up">Краткая характеристика</small><div class="gt">${sumHtml(o.summary)}</div></div>`:""}
  ${ps.length?`<div class="gg n${gn}">${ps.map(s=>`<div${bg(s)}></div>`).join("")}</div>`:""}</section>`}
 // objects: [{name, customer, general_contractor, address, status, years, summary, works:[{name,unit,volume,plan}], pictures:[src…]}]
 function build(objects,{logo="",company={},services=true,map=true,screen=false}={}){
  const d=new Date(),co={date:String(d.getDate()).padStart(2,"0")+"."+String(d.getMonth()+1).padStart(2,"0")+"."+d.getFullYear(),...COMPANY,...company},list=(Array.isArray(objects)?objects:[]).map((o,i)=>{const m=LAYOUT_MAX[layoutOf(o,i)];return(o.pictures||[]).length>m?{...o,pictures:o.pictures.slice(0,m)}:o});
  return`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Буклет ${esc(co.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>${CSS}${screen?SCREEN:""}</style></head><body>
${(()=>{const pages=[["О компании",aboutPage(list,co,logo)],...(services?[["Что мы делаем",servicesPage(co,logo)]]:[]),...list.flatMap((o,i)=>{const g=galleryPage(o,co,logo),n=String(o.name||"Объект");return[[n,objectPage(o,co,logo,i)],...(g?[[n+" — фото",g]]:[])]})];const mp=map&&mapPage(list,co,logo);if(mp)pages.push(["География работ",mp]);
 return pages.map(([t,h],i)=>(screen?`<div class="pvn">Лист ${i+1} · ${esc(t)}</div>`:"")+h).join("")})()}</body></html>`
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
 const pickDefault=o=>{const all=allFiles(o),saved=(o.booklet?.files||[]).filter(f=>all.includes(f));return{all,files:saved.length?saved:all.slice(0,7),layout:Number(o.booklet?.layout)||0}};
 // data: объекты так, как их собирает окно «Сайт» (siteObjectData) — cover, cover_full, photos, hero; files — выбранные
 // фото (первое — главное), layout — номер макета (0 — авто)
 async function make(data,{onProgress,services=true,map=true}={}){
  const profile=await root.irProject.company.get().catch(()=>({}));
  const logo=await small(await read(profile?.logo||""),1200);
  const objects=[];
  for(const [i,o] of data.entries()){
   onProgress?.(i,data.length,o.name);
   const files=(o.files||pickDefault(o).files).slice(0,capOf(o)),pictures=[];
   for(const f of files){const s=await read(f);if(s)pictures.push(await small(s,pictures.length?1400:2800))}
   objects.push({...o,pictures})
  }
  const opts={logo,company:profile?.name?{name:profile.name}:{},services,map};
  await dropTooLong(objects,opts);
  const html=build(objects,opts);
  const name="Буклет "+String(profile?.name||COMPANY.name).replace(/[«»"]/g,"")+" "+new Date().toLocaleDateString("ru-RU");
  return root.irProject.ai.invoke("ai-documents:exec-export",{format:"pdf",name,html})
 }
 // предпросмотр (инженер 20.11.2026 «сделать предпросмотр как каждая страница выглядеть будет»): те же листы, что уйдут
 // в PDF, с малыми фото (pic(f) — готовая маленькая картинка из окна), краткая характеристика — по той же проверке
 async function preview(data,{pic,services=true,map=true}={}){
  const profile=await root.irProject.company.get().catch(()=>({}));
  const logo=await small(await read(profile?.logo||""),600);
  const objects=[];
  for(const o of data){const pictures=[];for(const f of (o.files||pickDefault(o).files).slice(0,capOf(o))){const s=(pic&&await pic(f))||await small(await read(f),900,.8);if(s)pictures.push(s)}objects.push({...o,pictures})}
  const opts={logo,company:profile?.name?{name:profile.name}:{},services,map};
  await dropTooLong(objects,opts);
  return build(objects,{...opts,screen:true})
 }
 // краткая характеристика — только если вмещается на лист вместе со всеми видами работ, иначе её нет (инженер
 // 20.11.2026 «там где есть краткая характеристика и она не вмещается, то не выкладывай»). Лист печатается окном без
 // скриптов, поэтому мерим здесь: тот же HTML (без фото — на размеры они не влияют) в скрытой рамке.
 const overflows=(el,wide)=>el&&(el.scrollHeight>el.clientHeight+1||wide&&el.scrollWidth>el.clientWidth+1);
 function tooLong(page){return[".wks",".sum",".sm",".in",".hd"].some(q=>[...page.querySelectorAll(q)].some(e=>overflows(e,q===".wks")))}
 // всё на листе объекта видно целиком: не вмещается — краткая характеристика уходит на лист «Фото с объекта», затем
 // шрифт видов работ меньше по шагам (fit1–fit3, инженер «если не вмещается, то уменьшает размер шрифта»), без строки итогов (fit4), и только потом лишние строки снизу (wkMax); строка, не вместившаяся целиком, уходит в невидимую колонку справа —
 // не обрезанной наполовину строкой поверх итогов (инженер 20.11.2026 «поправь» — «Демонтаж» под «Выполнено на»)
 async function dropTooLong(objects,opts){
  const doc=root.document;if(!doc||!objects.length)return;
  for(let pass=0;pass<14;pass++){
   const fr=doc.createElement("iframe");fr.setAttribute("aria-hidden","true");
   fr.style.cssText="position:fixed;left:-10000px;top:0;width:297mm;height:210mm;border:0;visibility:hidden";
   let changed=false;
   try{
    await new Promise(ok=>{fr.onload=ok;fr.srcdoc=build(objects.map(o=>({...o,pictures:(o.pictures||[]).map(()=>"")})),opts);doc.body.appendChild(fr);setTimeout(ok,8000)});
    const d=fr.contentDocument;if(!d)return;
    await Promise.race([d.fonts?.ready,new Promise(ok=>setTimeout(ok,4000))]);
    const pages=[...d.querySelectorAll("section.page:not(.svcp):not(.gal):not(.geop)")].slice(1);
    pages.forEach((pg,i)=>{const o=objects[i];if(!o||!tooLong(pg))return;changed=true;
     if(o.summary&&!o.sumMoved)objects[i]={...o,sumMoved:true};
     else if((o.fit||0)<4)objects[i]={...o,fit:(o.fit||0)+1};
     else{const n=pg.querySelectorAll(".wk").length;if(n>1)objects[i]={...o,wkMax:n-1};else changed=false}});
    const gals=[...d.querySelectorAll("section.gal.wsum")];
    gals.forEach(g=>{const name=g.querySelector(".gh b")?.textContent;const i=objects.findIndex(o=>o.sumMoved&&!o.galSmall&&String(o.name||"Объект")===name);
     if(i>=0&&overflows(g.querySelector(".gt"))){objects[i]={...objects[i],galSmall:true};changed=true}});
   }catch(_){return}finally{fr.remove()}
   if(!changed)return;
  }
 }
 const api={MAX_PHOTOS,LAYOUT_MAX,capOf,clientList,mapPage,geoGroups,dropTooLong,build,make,preview,totals,doneOf,parties,COMPANY,LAYOUTS,layoutOf,thumb,read,pickDefault};
 if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.irBooklet=api;
})(typeof window!=="undefined"?window:globalThis);
