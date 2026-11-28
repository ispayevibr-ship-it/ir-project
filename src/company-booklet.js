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
 // значок WhatsApp у номера (инженер 27.11.2026 «рядом с каждым номером поставь значок ватсапа»)
 const WA='<svg class="wa" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#f5a700"/><path fill="#141414" d="M12 5.2a6.8 6.8 0 0 0-5.85 10.27L5.2 18.8l3.4-.9A6.8 6.8 0 1 0 12 5.2zm0 12.4c-1.03 0-2.04-.28-2.92-.8l-.21-.12-2.02.53.54-1.97-.14-.22A5.6 5.6 0 1 1 12 17.6zm3.07-4.2c-.17-.08-1-.49-1.15-.55-.16-.06-.27-.08-.38.09-.11.17-.44.55-.54.66-.1.11-.2.13-.37.04-.17-.08-.71-.26-1.36-.84-.5-.45-.84-1-.94-1.17-.1-.17-.01-.26.07-.34.08-.08.17-.2.25-.3.08-.1.11-.17.17-.28.06-.11.03-.21-.01-.3-.04-.08-.38-.92-.52-1.26-.14-.33-.28-.28-.38-.29h-.33c-.11 0-.3.04-.45.21-.16.17-.6.58-.6 1.42 0 .84.61 1.65.7 1.76.08.11 1.2 1.84 2.92 2.58.41.18.73.28.98.36.41.13.79.11 1.08.07.33-.05 1-.41 1.15-.81.14-.4.14-.74.1-.81-.04-.07-.16-.11-.33-.2z"/></svg>';
 const COMPANY={
  name:"ТОО «А-Темир Строй»",
  full:"Товарищество с ограниченной ответственностью «А-Темир Строй»",
  bin:"990740008450",
  address:"Республика Казахстан, Карагандинская обл., г. Темиртау, Спортивный переулок 5, офис 17",
  phones:[["Директор","+7 701 466 86 96"],["Зам. директора","+7 778 459 73 93"],["Бухгалтерия","+7 775 730 00 05"]],
  mail:"kasken7@mail.ru · a-tk@list.ru",site:"a-ts.kz",whatsapp:"+7 701 466 86 96",contactMail:"kasken7@mail.ru · a-tk@list.ru",
  head:"Саргаскаев Аслан Каскенович",
  bank:["ИИК KZ20601A371002289201","АО «Народный Банк Казахстана»","БИК HSBKKZKX · КБе 17"],
  title:"Изготовление и монтаж металлоконструкций",
  about:["ТОО «А-Темир Строй» — строительно-монтажная компания, специализирующаяся на изготовлении и монтаже металлоконструкций, монтаже технологического оборудования, общестроительных, демонтажных и специальных работах на промышленных объектах Казахстана."],
  // преимущества, заказчики, принципы — из буклета фирмы в Canva (инженер 24.11.2026 «текста с канвы еще возьми,
  // добавь, а то пустовато первая и вторая страница»)
  adv:[["Собственный штат","Инженеры, прорабы, сварщики, монтажники, рабочие"],["Своя строительная техника","Работаем оперативно, без зависимости от подрядчиков"],["Комплексный подход","От проекта и смет до сдачи объекта «под ключ»"],["Сроки и качество","Строгое соответствие нормам и требованиям заказчика"]],
  pledges:[["Весь Казахстан","Работаем на объектах по всей стране"]],
  license:"Государственная лицензия на строительно-монтажные работы II категории",
  principles:{lead:"Мы стремимся к постоянному развитию, внедряем современные строительные технологии и применяем передовые материалы. Это позволяет повышать эффективность работ и обеспечивать высокое качество на всех этапах строительства.",
   items:[["Индивидуальный подход","Внимательно изучаем задачи каждого заказчика и подбираем оптимальные решения."],["Прозрачность и честность","Понятные объёмы, сроки и отчётность на каждом этапе."],["Безопасность прежде всего","Строго соблюдаем требования охраны труда и техники безопасности на объектах."],["Гарантийные обязательства","Предоставляем гарантию на все виды выполненных работ."]],
   note:"Надёжное строительство начинается с ответственности — и именно это является основой нашей репутации."},
  services:["Металлоконструкции","Технологическое оборудование","Сэндвич-панели и профнастил","Резервуары до 3 000 м³","Изготовление и окраска","Демонтаж и реконструкция"],
  // лист «Что мы делаем» — как раздел сайта a-ts.kz (server/pb_public/index.html #services; инженер 20.11.2026
 // «такую информацию еще можно добавить»)
 what:{lead:"Выполняем изготовление и монтаж металлоконструкций, установку технологического оборудования, демонтаж и другие строительно-монтажные работы на промышленных объектах Казахстана.",
  // тексты по выполненным работам объектов программы (инженер 27.11.2026 «доработай, а то выглядит будто мы кроме этого
  // больше ничего не делаем»)
  items:[["Металлоконструкции любой сложности","Изготовление и монтаж металлоконструкций для промышленных и гражданских объектов, включая несущие каркасы, инженерные сооружения и вспомогательные конструкции."],
   ["Монтаж технологического оборудования","Комплексный монтаж промышленного и технологического оборудования, производственных линий, инженерных систем и сопутствующих конструкций."],
   ["Грузоподъёмные механизмы","Монтаж грузоподъёмного оборудования, крановых систем, подкрановых конструкций и сопутствующих элементов."],
   ["Ограждающие конструкции","Монтаж стеновых и кровельных конструкций, фасадных систем, ограждающих элементов и комплектующих зданий и сооружений."],
   ["Резервуары и трубные конструкции","Строительство и монтаж резервуаров и ёмкостей любого назначения и объёма, резервуарных парков, котельных, дымовых труб и трубных конструкций."],
   ["Изготовление, окраска и огнезащита","Изготовление металлоконструкций и металлических изделий, подготовка и обработка поверхностей, грунтование, окраска и нанесение защитных покрытий."],
   ["Общестроительные и отделочные работы","Выполнение общестроительных, монтажных и отделочных работ, устройство фундаментов, возведение конструкций и комплексное обустройство помещений."],
   ["Демонтаж и реконструкция","Выполнение демонтажных работ любой сложности, разборка металлоконструкций и строительных сооружений, демонтаж технологического оборудования, реконструкция и перепланировка существующих объектов."],
   ["Исполнительная документация и снабжение","Подготовка и оформление полного комплекта исполнительной документации, ведение технической документации, комплектация объектов, закупка и поставка строительных материалов и оборудования."]]},
 slogan:["Мы строим не просто объекты —","мы строим доверие."],
  trust:"Каждый из этих проектов стал подтверждением нашего <b>профессионализма, качества исполнения и соблюдения сроков</b>. Мы гордимся доверием, оказанным нашими партнёрами."
 };

 // журнал — свои тексты, буклет — свои (инженер 27.11.2026 «буклет и журнал это разные вещи … раздели их»)
 const JOURNAL={about:["Мы стремимся к постоянному развитию, внедряем современные строительные технологии и применяем передовые материалы. Это позволяет повышать эффективность работ и обеспечивать высокое качество на всех этапах строительства."],
  what:{lead:"Выполняем изготовление и монтаж металлоконструкций, установку технологического оборудования, демонтаж и другие строительно-монтажные работы на промышленных объектах Казахстана.",
  items:[["Металлоконструкции","Монтаж каркасов зданий и цехов, эстакад, бункеров, площадок, лестниц и ограждений."],
   ["Технологическое оборудование","Конвейеры, дозаторы, сушильное оборудование, мостовые краны, ёмкости, экстракторы, электролизные ванны."],
   ["Ограждающие конструкции","Стеновые и кровельные сэндвич-панели, профнастил, нащельники, водосток, ворота, двери, зенитные фонари."],
   ["Резервуары","Вертикальные стальные резервуары до 3 000 м³, противопожарные и кислотные резервуары, дымовые трубы."],
   ["Изготовление","Изготовление металлоконструкций, регистров и опор трубопроводов, огрунтовка, окраска, огнезащита."],
   ["Демонтаж и реконструкция","Демонтаж металлоконструкций, капитальный ремонт, перенос блочно-модульных зданий."],
   ["Общестроительные работы","Фундаментные плиты, ФБС, бетонные колонны, приямки, подготовка строительной площадки."],
   ["Документация","Полный пакет исполнительной документации по каждому объекту, закуп материалов."]]}};
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
.lx{position:absolute;inset:0;z-index:40;pointer-events:none}.lx svg{position:absolute;inset:0;width:297mm;height:210mm}
.lx polyline{fill:none;stroke:var(--or);stroke-width:.5;stroke-linejoin:round}.lx circle{fill:#fff;stroke:var(--or);stroke-width:.75}
.lx .lb{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;background:rgba(29,34,40,.88);color:#fff;font:800 8pt/1.1 Montserrat,"Segoe UI",Arial,sans-serif;letter-spacing:.2px;padding:0 2.2mm;border-radius:1.2mm;border-bottom:.7mm solid var(--or);white-space:nowrap;box-shadow:0 .6mm 2mm rgba(0,0,0,.35)}.lx .lr{text-align:right}
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
.gal.gl1,.gal.gl2{background:#eef1f4}.gal.gl3{background:#0d1013}.gal.gl3 .gh{background:#15191d}.gal.gl3 .gh b{color:#fff}.gal.gl3 .gg{gap:1.2mm}.gal.gl3 .gg div{border-radius:0}
.gal .gg.jr{display:flex;flex-direction:column}.gal .gg.jb .top{display:flex;gap:3mm;min-height:0;background:none;border-radius:0;box-shadow:none}.gal .gg.jb .jc{display:flex;flex-direction:column;gap:3mm;min-width:0;background:none;border-radius:0;box-shadow:none}.gal .gg.jb .big{position:relative;border-radius:2mm;box-shadow:0 0 0 .9mm var(--or),0 1mm 4mm rgba(0,0,0,.4)}.gal .gg.jb .big:after{content:"";position:absolute;left:0;right:0;bottom:0;height:40%;border-radius:0 0 2mm 2mm;background:linear-gradient(transparent,rgba(0,0,0,.55))}.gal .gg.jb .big .cnt{position:absolute;left:4mm;bottom:3.5mm;z-index:1;color:#fff;font-size:7pt;font-weight:800;letter-spacing:1px;text-transform:uppercase}.gal .gg.jb .big .cnt b{display:block;font-size:20pt;font-weight:900;line-height:1;color:var(--or);letter-spacing:0}.gal .gg.jb .jc .rw:first-child div:first-child{box-shadow:0 .8mm 2.5mm rgba(0,0,0,.35)}.gal .gg.jb .jc .rw:first-child div:first-child:after{display:none}.gl3 .gg.jr,.gl3 .gg.jr .rw,.gl3 .gg.jb .jc{gap:1.2mm}.gl3 .gg.jr .rw div,.gl3 .gg.jb .big{border-radius:0}.gal .gg.jr .rw{display:flex;gap:3mm;min-height:0;background:none;border-radius:0}.gal .gg.jr .rw div{position:relative;min-width:0;border-radius:2mm;box-shadow:0 .8mm 2.5mm rgba(0,0,0,.35)}.gal .gg.jr .rw:first-child div:first-child{box-shadow:0 0 0 .9mm var(--or),0 1mm 4mm rgba(0,0,0,.4)}.gal .gg.jr .rw:first-child div:first-child:after{content:"";position:absolute;left:0;right:0;bottom:0;height:40%;border-radius:0 0 2mm 2mm;background:linear-gradient(transparent,rgba(0,0,0,.55))}.gal .gg.jr .cnt{position:absolute;left:4mm;bottom:3.5mm;z-index:1;color:#fff;font-size:7pt;font-weight:800;letter-spacing:1px;text-transform:uppercase}.gal .gg.jr .cnt b{display:block;font-size:20pt;font-weight:900;line-height:1;color:var(--or);letter-spacing:0}.gal.solo .gs{width:auto;right:6mm}.gal.solo .gt,.gal.solo .gw{column-count:2;column-gap:10mm}.gal .gw{flex:0 0 auto;margin-bottom:2mm}.gal .gw .wk{padding:2mm 0;break-inside:avoid}.gal .gw .wk b{font-size:7.4pt}.gal .gw .vol i{font-size:13pt}.gal.gsm .gw .wk{padding:1.2mm 0}.gal.gsm .gw .wk b{font-size:6.6pt}.gal.gsm .gw .vol i{font-size:11pt}.gal .gs small.s2{margin-top:3mm}.gal .gs>.gw:first-child{margin-top:-4mm}.gal .gs>.gw:first-child .wk:first-child{padding-top:0}
.gal .n4{grid-template:1fr 1fr/1fr 1fr}.gal .n5{grid-template:1fr 1fr/1.5fr 1fr 1fr}.gal .n5 div:first-child{grid-row:span 2}.gal .n6{grid-template:1fr 1fr/1fr 1fr 1fr}
.svcp:before{content:"";position:absolute;left:0;top:0;width:70mm;height:52mm;background:linear-gradient(135deg,var(--or2),var(--or));clip-path:polygon(0 0,100% 0,0 100%)}
.svcp .sh{position:absolute;left:16mm;top:20mm;width:190mm}.svcp .sh .kick{font-size:7.5pt;font-weight:800;letter-spacing:1.4px;color:var(--ink);margin-bottom:2mm}
.svcp h2{margin:0;font-size:34pt;font-weight:900;line-height:1;text-transform:uppercase;letter-spacing:-.5px}
.svcp .ld{margin:5mm 0 0;font-size:10pt;line-height:1.55;color:#4b525c}
.svcp .lg{position:absolute;right:14mm;top:13mm;height:20mm;width:60mm;display:flex;justify-content:flex-end;align-items:flex-start}.svcp .lg img{max-height:20mm;max-width:60mm;object-fit:contain}.svcp .lg b{font-size:11pt;font-weight:900}
.svcp .sg{position:absolute;left:16mm;right:16mm;top:58mm;bottom:58mm;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:1fr 1fr;border-top:.35mm solid var(--ink);border-bottom:.35mm solid var(--ink)}
.svcp .sc{padding:4mm 6mm 3mm 0;border-left:.35mm solid var(--ink);padding-left:6mm;overflow:hidden}
.svcp .sc:nth-child(4n+1){border-left:0;padding-left:0}
.svcp .sc:nth-child(n+5){border-top:.35mm solid var(--ink)}
.svcp .sc i{display:block;font-style:normal;font-size:9pt;font-weight:800;color:var(--ord);letter-spacing:.6px;margin-bottom:2mm}
.svcp .pr{position:absolute;left:16mm;right:16mm;top:157mm;bottom:14mm;display:grid;grid-template-columns:1.25fr repeat(4,1fr);gap:4mm}
.svcp .ph .kick{font-size:7.5pt;font-weight:800;letter-spacing:1.4px;color:var(--ord);margin-bottom:2mm}.svcp .ph h3{margin:0;font-size:15pt;font-weight:900;line-height:1.15}
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
.ph.soft{overflow:hidden}.ph.soft>b{position:absolute;inset:-8mm;background:center/cover no-repeat;filter:blur(6mm) brightness(.62) saturate(.9)}.ph.soft>i{position:absolute;inset:0;background:center/contain no-repeat;z-index:0}.ph.soft:after{z-index:1}
.R .ph{position:absolute;inset:0 0 25mm 0;background:#3a4047 center 40%/cover no-repeat}
.R .ph:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,0) 30%,rgba(0,0,0,0) 55%,rgba(0,0,0,.35))}
.logo{position:absolute;top:9mm;right:10mm;background:rgba(255,255,255,.95);border-radius:3mm;padding:2.5mm 4mm;box-shadow:0 2mm 6mm rgba(0,0,0,.18);z-index:3}
.logo img{width:auto;height:auto;max-height:12mm;max-width:60mm;display:block}.logo b{display:block;font-size:11pt;font-weight:900}
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
.foot b,.lay3 .strip b{display:block;line-height:1.15;overflow-wrap:break-word;max-height:3.5em;overflow:hidden}.foot b.s1,.lay3 .strip b.s1{font-size:8pt}.foot b.s2,.lay3 .strip b.s2{font-size:7pt}
.chain{position:absolute;inset:0;z-index:3;pointer-events:none}.chain .c{position:absolute;margin:0;width:32mm;height:32mm}
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
.A3 h2{font-size:15pt;font-weight:900;margin:1mm 0 5mm;line-height:1.15}.cust{list-style:none;margin:0;padding:0;max-height:138mm;overflow:hidden}.cust.many li{font-size:7.2pt;padding:1.2mm 0}.cust.few li{font-size:10pt;padding:4mm 0;line-height:1.3}.cust li.more{color:#c9ced5;font-weight:500}.cust li.more:before{background:none}
.gar{margin-top:auto;padding-top:3mm;display:grid;grid-template-columns:1fr;gap:2.4mm}.gar div{background:#1d2228;color:#fff;border-radius:2mm;padding:2.4mm 2.6mm;font-size:6.8pt;line-height:1.35;color:#d6d9dd}.gar b{display:block;color:var(--or);font-size:8.4pt;font-weight:800;margin-bottom:.5mm}
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
.lay3 .strip{position:absolute;left:0;right:0;bottom:0;height:17mm;background:linear-gradient(100deg,var(--or),var(--or2));display:grid;grid-template-columns:1.3fr 1fr auto;gap:8mm;align-items:center;padding:0 14mm}
.lay3 .strip small{display:block;font-size:6.3pt;font-weight:800;letter-spacing:.8px;opacity:.7}.lay3 .strip b{font-size:9pt;font-weight:800}
.lay3 .strip .doc em{background:#1d2228}
.lay4 .M{position:absolute;left:7mm;top:7mm;bottom:29mm;width:180mm;display:grid;gap:3mm;background:#fff;padding:0}.lay4 .g{border-radius:2mm}
.lay4 .g{background:#3a4047 center/cover no-repeat}
.lay4 .m1{grid-template:1fr/1fr}.lay4 .m2{grid-template:1fr/1.6fr 1fr}.lay4 .m3{grid-template:1fr 1fr/1.7fr 1fr}.lay4 .m3 .g0{grid-row:1/3}
.lay4 .m4{grid-template:1fr 1fr 1fr/1.7fr 1fr}.lay4 .m4 .g0{grid-row:1/4}
.lay4 .logo{left:6mm;top:6mm;right:auto}
.lay4 .info{position:absolute;left:6mm;bottom:6mm;z-index:3;background:rgba(255,255,255,.95);border-radius:3mm;padding:4mm 5mm;width:78mm;box-shadow:0 2mm 6mm rgba(0,0,0,.18)}
.lay4 .info{text-align:left}.lay4 .info .yr{background:var(--or)}
.lay4 .O{position:absolute;right:7mm;top:7mm;bottom:29mm;width:96mm;border-radius:2mm;background:linear-gradient(170deg,var(--or2),var(--or) 55%,var(--ord))}
.lay4 .O .in{position:absolute;left:8mm;right:8mm;top:10mm;bottom:8mm;display:flex;flex-direction:column}
.lay4 .O .sub{color:#4a3500}.lay4 .O .wk{border-bottom-color:rgba(0,0,0,.12)}.lay4 .O .vol s{color:#1d2228}.lay4 .O .sum{border-left-color:#1d2228;color:#2a2410}.lay4 .O .ost div{border-top-color:#1d2228}.lay4 .O .ost span{color:#4a3500}
.lay4 .O .ring{background:conic-gradient(#1d2228 calc(var(--p)*1%),rgba(255,255,255,.45) 0)}.lay4 .O .doc em{background:#1d2228}
.lay4 .f4{height:22mm;grid-template-columns:1fr 1fr}
.lay5 .ph{position:absolute;left:0;right:0;top:0;height:112mm;background:#3a4047 center 45%/cover no-repeat;clip-path:polygon(0 0,100% 0,100% 82%,0 100%)}
.lay5 .ph:after{content:"";position:absolute;left:0;right:0;bottom:0;height:4mm;background:var(--or)}
.lay5 .circles{left:auto;right:14mm;bottom:auto;top:78mm}.lay5 .c{width:28mm;height:28mm}.lay5 .c.big{width:34mm;height:34mm;margin-top:-6mm}
.lay5 .lo{position:absolute;left:14mm;top:118mm;width:84mm;bottom:25mm;display:flex;flex-direction:column}.lay5 .lo .badges{margin-top:2.5mm;padding-top:0;gap:4mm}.lay5 .lo .ring{width:19mm;height:19mm}.lay5 .lo .ring div{width:15mm;height:15mm}.lay5 .lo .ring b{font-size:11.5pt}.lay5 .lo .ring span{font-size:4.6pt;margin-top:.4mm}.lay5 .lo .doc em{width:9mm;height:9mm}.lay5 .lo .doc{font-size:6pt}
.lay5 .lo .ttl{font-size:16pt}.lay5 .lo .ttl.s{font-size:13.5pt}.lay5 .lo .ttl.xs{font-size:11.5pt}.lay5 .lo .sub{margin-bottom:3mm}.lay5 .info .yr{margin-bottom:1.5mm}
.lay5 .info{position:static;text-align:left;width:auto;margin-top:auto}.lay5 .info .yr{background:var(--or);margin-bottom:2mm}.lay5 .info p{font-size:8pt}.lay5 .contact{display:none}
.lay5 .ro{position:absolute;left:108mm;right:14mm;top:118mm;bottom:23mm;display:flex}
.lay5 .ro .wks{flex:1;display:block;column-count:2;column-gap:9mm;column-fill:balance}.lay5 .ro .wk{break-inside:avoid;page-break-inside:avoid}.lay5 .ro .wk{padding:2.4mm 0}.lay5 .ro .vol i{font-size:13pt}.lay5 .ro .wk b{font-size:7.4pt}

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
.lay9{background:#fff}.lay9 .ph{position:absolute;left:0;top:0;bottom:0;width:172mm;background:#3a4047 center/cover no-repeat}
.lay9 .ph:not(.soft):after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.4),rgba(0,0,0,0) 38%)}
.lay9 .bar{position:absolute;left:172mm;top:0;bottom:0;width:3mm;background:var(--or)}.lay9 .logo.l9{left:9mm;right:auto;top:9mm}
.lay9 .th{position:absolute;left:9mm;bottom:9mm;display:flex;gap:3.5mm;z-index:2}.lay9 .th div{width:36mm;height:27mm;border:1.2mm solid #fff;background:#ddd center/cover no-repeat;box-shadow:0 2mm 6mm rgba(0,0,0,.35)}
.lay9 .in{position:absolute;left:186mm;right:10mm;top:13mm;bottom:10mm;display:flex;flex-direction:column}
.lay9 .kick{font-size:6.8pt;letter-spacing:1.4px;margin-bottom:2.5mm}.lay9 .ttl{font-size:17pt}.lay9 .ttl.s{font-size:14pt}.lay9 .ttl.xs{font-size:12pt}
.lay9 .hero{flex:none;border-top:1mm solid var(--or);padding-top:3mm;margin:3mm 0 1.5mm}
.lay9 .hero i{display:block;font-style:normal;font-size:40pt;font-weight:900;line-height:.95;color:var(--or);white-space:nowrap}.lay9 .hero.s i{font-size:30pt}.lay9 .hero i s{text-decoration:none;font-size:13pt;color:var(--ord);margin-left:1.5mm}
.lay9 .hero b{display:block;font-size:7.6pt;font-weight:800;margin-top:1.8mm;line-height:1.25}.lay9 .hero u{display:inline;text-decoration:none;font-size:6.6pt;font-weight:700;color:var(--mut)}
.lay9 .wk{padding:2.1mm 0;gap:3mm}.lay9 .wk b{font-size:7pt}.lay9 .vol i{font-size:12pt}.lay9 .sum{max-height:26mm;font-size:7.2pt}
.lay9 .badges{gap:4mm}.lay9 .ring{width:22mm;height:22mm}.lay9 .ring div{width:17.5mm;height:17.5mm}.lay9 .ring b{font-size:12pt}
.lay9 .gp,.lay10 .gp{flex:none;margin-top:3.5mm;display:grid;grid-template-columns:1fr 1fr;gap:4mm;font-size:6.9pt;font-weight:800;line-height:1.3}.lay9 .gp small,.lay10 .gp small{display:block;font-size:5.6pt;letter-spacing:.8px;color:var(--mut);margin-bottom:.8mm}
.lay10{background:#2b3036}.lay10 .ph{position:absolute;inset:0;background:#3a4047 center/cover no-repeat}
.lay10 .dk{position:absolute;right:0;top:0;bottom:0;width:162mm;background:#1d2228;clip-path:polygon(32mm 0,40mm 0,8mm 100%,0 100%);z-index:1}
.lay10 .pn{position:absolute;right:0;top:0;bottom:0;width:150mm;background:linear-gradient(165deg,var(--or2),var(--or) 55%,var(--ord));clip-path:polygon(32mm 0,100% 0,100% 100%,0 100%);z-index:1}
.lay10 .logo.l10{left:10mm;right:auto;top:10mm}
.lay10 .dc .c{position:absolute;width:30mm;height:30mm;margin:0;z-index:3}.lay10 .d0{left:148mm;top:35mm}.lay10 .d1{left:140mm;top:90mm}.lay10 .d2{left:132mm;top:145mm}
.lay10 .card{position:absolute;left:10mm;bottom:10mm;max-width:112mm;background:rgba(255,255,255,.96);border-left:1.6mm solid var(--or);border-radius:2mm;padding:4mm 5mm;z-index:2;box-shadow:0 2mm 6mm rgba(0,0,0,.25)}
.lay10 .card .yr{background:#f3efe6;font-size:9pt;margin-bottom:2.5mm}.lay10 .card h4{margin:0 0 .8mm;font-size:6.6pt;font-weight:900;letter-spacing:.8px;color:var(--mut)}.lay10 .card p{margin:0;font-size:8pt;font-weight:700;line-height:1.3}
.lay10 .card .gp{margin-top:3mm}
.lay10 .in{position:absolute;left:186mm;right:10mm;top:14mm;bottom:10mm;display:flex;flex-direction:column;z-index:2}
.lay10 .ttl{font-size:17pt}.lay10 .ttl.s{font-size:14pt}.lay10 .ttl.xs{font-size:12pt}.lay10 .wk{padding:2.3mm 0;border-bottom-color:rgba(0,0,0,.12)}.lay10 .wk b{font-size:7.2pt}.lay10 .vol i{font-size:13pt}.lay10 .vol s{color:#1d2228}
.lay10 .sum{border-left-color:#1d2228;color:#2a2410}.lay10 .ring{width:23mm;height:23mm;background:conic-gradient(#1d2228 calc(var(--p)*1%),rgba(255,255,255,.45) 0)}.lay10 .ring div{width:18mm;height:18mm}.lay10 .ring b{font-size:12.5pt}.lay10 .doc em{background:#1d2228}
.gal.gl4{background:#ece7dc}.gal .gg.film{display:flex;flex-direction:column;justify-content:center;gap:6mm;left:9mm;right:9mm}.gal.wsum .gg.film{left:106mm}
.gal .gg.film .fs{flex:1 1 0;min-height:0;background:#111417;padding:6.5mm 4mm;display:flex;gap:2.5mm;position:relative;border-radius:1mm;box-shadow:0 2mm 5mm rgba(0,0,0,.25)}
.gal .gg.film .fs:before,.gal .gg.film .fs:after{content:"";position:absolute;left:3mm;right:3mm;height:2.2mm;background:repeating-linear-gradient(90deg,#ece7dc 0 2.6mm,transparent 2.6mm 5.6mm)}
.gal .gg.film .fs:before{top:2.1mm}.gal .gg.film .fs:after{bottom:2.1mm}
.gal .gg.film .fr{flex:1 1 0;min-width:0;background:#23282e center/cover no-repeat;border-radius:.6mm;position:relative}
.gal .gg.film .fr em{position:absolute;left:1.5mm;top:1.5mm;font-style:normal;font-size:5.6pt;font-weight:900;color:var(--or);background:rgba(0,0,0,.55);padding:.3mm 1.2mm;border-radius:.6mm;letter-spacing:.5px}
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
.geop div.pl{position:absolute;left:222mm;right:14mm;top:62mm;bottom:14mm;display:flex;flex-direction:column;gap:2mm;overflow:hidden}
.geop div.pl div{display:flex;justify-content:space-between;align-items:center;gap:3mm;background:#f3f1ec;border-radius:2.5mm;padding:2.6mm 3.4mm;font-size:8.6pt;font-weight:700;line-height:1.2}
.geop div.pl span{color:var(--mut);font-weight:500;font-size:7.6pt;white-space:nowrap}.geop div.pl .more{background:none;color:var(--mut);font-weight:500}
.geop .bd{position:absolute;left:0;right:0;bottom:0;height:20mm;background:#1d2228;color:#fff;display:flex;align-items:center;padding:0 16mm;gap:8mm}
.geop .bd .sl{font-size:11pt;font-weight:800;line-height:1.25}.geop .bd .sl i{font-style:normal;color:var(--or)}.geop .bd .ct{margin-left:auto;text-align:right;font-size:8pt;line-height:1.6;color:#d6d9dd}`;
 const CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
 const CAL='<svg viewBox="0 0 24 24" fill="none" stroke="#1d2228" stroke-width="2.4" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
 const bg=src=>src?` style="background-image:url('${String(src).replace(/'/g,"%27")}')"`:"";

 function servicesPage(co,logo){const w=co.jwhat||JOURNAL.what;
  return`<section class="page svcp"><div class="lg">${logo?`<img src="${esc(logo)}" alt="">`:`<b>${esc(co.name)}</b>`}</div>
  <div class="sh"><div class="kick up">Услуги</div><h2>Что мы делаем</h2><p class="ld">${esc(w.lead)}</p></div>
  <div class="sg">${w.items.slice(0,8).map(([t,d],i)=>`<div class="sc"><i>${String(i+1).padStart(2,"0")}</i><b>${esc(t)}</b><p>${esc(d)}</p></div>`).join("")}</div>
  ${(()=>{const pr=co.principles||COMPANY.principles;return`<div class="pr"><div class="ph"><div class="kick up">Наши принципы</div><h3>Работаем так, чтобы нам доверяли</h3></div>${pr.items.map(([t,d])=>`<div class="pi"><b>${esc(t)}</b><p>${esc(d)}</p></div>`).join("")}</div>`})()}
</section>`}
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
</section>`}
 // предпросмотр в окне «Буклет» — те же листы уменьшенными, серый фон, номер и название листа над каждым
 const SCREEN=`body{background:#5d646c;padding:8mm 0}.page{margin:0 auto 10mm;box-shadow:0 2mm 8mm rgba(0,0,0,.35)}.pvn{width:297mm;margin:0 auto 2.5mm;color:#fff;font:600 11pt Montserrat,"Segoe UI",Arial,sans-serif}`;
 // заказчики и генподрядчики — только из объектов программы, отмеченных для буклета (инженер 24.11.2026 «из канвы ты
 // берешь только реквизиты и текста, объемы, объекты, заказчики с программы»); одинаковые названия — один раз
 const clientList=(objects,co)=>{const seen=new Set(),out=[];for(const t of parties(objects)){const k=String(t).toLowerCase().replace(/ё/g,"е").replace(/[«»"“”'\s.,-]|^(тоо|ао|ип)/g,"");if(t&&!seen.has(k)){seen.add(k);out.push(t)}}return out};
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
  <div class="A2"><div class="kick up">О компании</div><h2>${esc(co.title)}</h2>${(co.jabout||JOURNAL.about).map(p=>`<p>${esc(p)}</p>`).join("")}
  <div class="nums${totals(objects).length>6?" many":""}">${totals(objects).map(([b,s])=>`<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("")}</div>
  <div class="adv">${co.adv.map(([b,s])=>`<div><b>${esc(b)}</b>${esc(s)}</div>`).join("")}</div>
  <div class="slogan">${esc(co.slogan[0])}<br><i>${esc(co.slogan[1])}</i></div></div>
  <div class="A3"><div class="kick up">Нам доверяют</div><h2>Заказчики и генподрядчики</h2>
  <ul class="cust${many?" many":ps.length<=6?" few":""}">${cut.map(p=>`<li>${esc(p)}</li>`).join("")}${cut.length<ps.length?`<li class="more">и ещё ${ps.length-cut.length}</li>`:""}</ul>${(co.principles||COMPANY.principles).note?`<div class="rep">${esc((co.principles||COMPANY.principles).note)}</div>`:""}<div class="q">${co.trust}</div></div></section>`
 }
 // лист объекта — четыре макета, чтобы листы не были одинаковыми (инженер 20.11.2026 «чтобы не все страницы были
 // одинаковые, макет разный»): 1 «Классика» — текст слева, фото справа с полосой и кругами; 2 «Зеркало» — фото слева,
 // текст справа; 3 «Обложка» — фото на весь лист, виды работ плитками внизу; 4 «Мозаика» — фото сеткой, текст на
 // оранжевой колонке; 5 «Панорама» — фото полосой сверху, виды работ в две колонки; 6 «Тёмный» — тёмный лист, фото в
 // рамке и малые под ним. Макет выбирается у каждого объекта (инженер «выбор для каждого объекта макета своего, сделай
 // 5-6 разных макетов»); Авто — по очереди, по числу фото.
 // 9 «Журнал», 10 «Диагональ» (инженер 24.11.2026 «еще есть макеты?», «поинтереснее»; «Полароид» — «фигня, удали»)
 const LAYOUTS=["Классика","Зеркало","Обложка","Мозаика","Панорама","Тёмный","Альбом","Фотоотчёт","Акцент","Диагональ"];
 const titleCls=name=>{const len=name.length,word=Math.max(...name.split(/\s+/).map(w=>w.length));return len>70||word>15?" xs":len>45||word>12?" s":""};
 const worksOf=o=>(o.works||[]).filter(w=>num(w.volume)>0||num(w.plan)>0);
 // объём — смонтировано по программе на день выгрузки буклета, план — «из N», пока не выполнено (инженер 20.11.2026
 // «объемы должны также браться с программы, на день выгрузки буклета»)
 // работа в услугах — без числа и слова «услуга»: «Монтаж ворот», а не «Монтаж ворот — 1 услуга» (инженер 27.11.2026)
 const isSvc=w=>/^услуг/i.test(String(w&&w.unit||"").trim());
 const planOf=w=>!isSvc(w)&&num(w.plan)>num(w.volume)?`<u>из ${esc(fmt(w.plan))}</u>`:"";
 // сколько видов работ на листе объекта: у макета свой предел (Обложка 4, Тёмный 8, остальные 12) и wkMax после подгонки;
 // остальные — на листе «Фото с объекта» колонкой без заголовка (инженер 26.11.2026 «ВИДЫ РАБОТ (ПРОДОЛЖЕНИЕ) убери»; 24.11.2026 «если часть верхняя
 // работы не вмещаются, можно их перенести на вторую страницу?»)
 const WK_CAP={3:4,6:8,9:9,10:8};
 const wkShown=(o,i)=>{const l0=layoutOf(o,i),l=l0===7?1:l0===8?4:l0,cap=WK_CAP[l]||12;return Math.min(cap,o.wkMax||cap)};
 const wkRest=(o,i)=>worksOf(o).slice(wkShown(o,i));
 const wkRows=ws=>ws.map(w=>`<div class="wk"><b class="up">${esc(w.name)}</b>${isSvc(w)?"":`<div class="vol"><i>${esc(fmt(num(w.volume)))}</i><s>${esc(unitOf(w.unit))}</s>${planOf(w)}</div>`}</div>`).join("");
 const ringOf=p=>`<div class="ring" style="--p:${p}"><div><b>${p}%</b><span class="up">выполнено</span></div></div>`;
 const docOf=()=>`<div class="doc up"><em>${CHECK}</em>Полный пакет<br>исполнительной<br>документации</div>`;
 const logoOf=(co,logo,cls="")=>`<div class="logo${cls}">${logo?`<img src="${esc(logo)}" alt="">`:`<b>${esc(co.name)}</b>`}</div>`;
 // генподрядчик и заказчик одним размером, длинное название — в две строки (инженер 26.11.2026 «почему генподрядчик таким маленьким шрифтом?»)
 const nmOf=v=>{const t=String(v||"—").trim()||"—";return`<b>${esc(t)}</b>`};
 const footOf=(o,cls="")=>`<div class="foot${cls}"><div><small class="up">Генеральный подрядчик</small>${nmOf(o.general_contractor)}</div><div><small class="up">Заказчик</small>${nmOf(o.customer)}</div></div>`;
 const yearOf=o=>{const y=String(o.years||"").trim();return y?`<div class="yr">${CAL}${esc(y)}</div>`:""};
 // сколько фото берёт каждый макет (инженер 24.11.2026 «сделай для каждого вида макета ограничение по количеству
 // фото»): на листе объекта у всех до 4 (главное и 3 малых), остальные — листом «Фото с объекта»; «Обложка» и «Тёмный» —
 // одним листом, без листа фото. Индекс 0 — «Авто»: выбирается только макет, в который входят все выбранные фото.
 // 7 «Альбом» — лист как «Классика» и до 8 фото листом фото, всего 12; 8 «Фотоотчёт» — лист как «Мозаика» и до 12 фото
 // листом фото, всего 16 (инженер 24.11.2026 «макеты добавь где есть хотя бы 12 фотографий»)
 const LAYOUT_MAX=[16,16,16,16,16,16,16,16,16,16,16];
 const capOf=o=>LAYOUT_MAX[Number(o?.layout)||0]||LAYOUT_MAX[0];
 // «Альбом» (7) и «Фотоотчёт» (8) и лист фото «Плёнка» (4) убраны (инженер 26.11.2026 «что за два макета странных? и пленку
 // вроде как договорились убрать»): номера остаются, чтобы сохранённые «Акцент» и «Диагональ» не сдвинулись; выбранные
 // раньше — «Альбом» как «Классика», «Фотоотчёт» как «Мозаика», «Плёнка» как «Авто»
 const LAY_GONE={7:1,8:4},GAL_GONE={4:0};
 const layoutOf=(o,i)=>{const n=Number(o.layout);if(LAY_GONE[n])return LAY_GONE[n];if(n>=1&&n<=LAYOUTS.length)return n;const pics=(o.pictures||[]).length;if(!pics)return 1;
  const seq=(pics>=3?[1,3,5,2,4,6]:[1,3,5,2,6]).filter(l=>LAYOUT_MAX[l]>=pics);return seq.length?seq[i%seq.length]:1};
 function textCol(o,max,co){const name=String(o.name||"Объект"),ws=worksOf(o),p=doneOf(o);
  return`<h1 class="ttl up${titleCls(name)}">${esc(name)}</h1>
  <div class="wks">${wkRows(ws.slice(0,Math.min(max,o.wkMax||max)))}</div>${o.summary&&!o.sumMoved?`<div class="sum">${sumHtml(o.summary)}</div>`:""}
  ${statsOf(o,co)}<div class="badges">${ringOf(p)}${docOf()}</div>`}
 function placeOf(o,co){const place=String(o.address||"").trim();
  return`${yearOf(o)}${place?`<h4 class="up">Место выполнения</h4><p>${esc(place)}</p>`:""}`}
 // главное фото на листе объекта (инженер 24.11.2026 «такое чувство что фото слишком растягивается», «или наоборот
 // меньше не делается»): фото на всю ячейку обрезается и растягивается; если для этого у него мало точек (меньше
 // 4 на мм — ~100 точек на дюйм, например обложка 900×405 на ячейку 197×185 мм — 2,2) — оно целиком в своих
 // пропорциях, без увеличения сверх нужного, а поле вокруг — то же фото размыто и затемнено
 const PH_MM={1:[197,185],2:[197,185],3:[297,210],5:[297,112],6:[168,124],9:[172,210],10:[297,210]};
 const softMain=(o,lay)=>{const d=o.mainPx,c=PH_MM[lay];if(!d||!c||!(d[0]>0&&d[1]>0))return false;return Math.min(d[0]/c[0],d[1]/c[1])<4};
 const phOf=(o,lay,main)=>softMain(o,lay)?`<div class="ph soft"${bg(main)}><b${bg(main)}></b><i${bg(main)}></i></div>`:`<div class="ph"${bg(main)}></div>`;
 const CHAIN=6,onPage=(o,i)=>{const l=layoutOf(o,i);return l===1||l===2?1+CHAIN:4};
 // центр круга — на косом крае полосы: край от 68,4 мм над низом у низкого конца до 87 мм у высокого, ширина фото 197 мм
 function chainOf(rest,mir){return rest.length?`<div class="chain">${rest.slice(0,CHAIN).map((s,k)=>{const cx=18+31.4*k,y=68.4+18.6*cx/197;return`<div class="c" style="${mir?"right":"left"}:${(cx-16).toFixed(1)}mm;bottom:${(y-16).toFixed(1)}mm${s?`;background-image:url('${String(s).replace(/'/g,"%27")}')`:""}"></div>`}).join("")}</div>`:""}
 function circlesOf(rest){return rest.length?`<div class="circles">${rest.map((s,i)=>`<div class="c${rest.length===3&&i===1?" big":""}"${bg(s)}></div>`).join("")}</div>`:""}
 function objectPage(o,co,logo,i=0){const h=withLabels(objectPage0(o,co,logo,i),o.lbl);return o.fit?h.replace('<section class="page','<section class="page fit'+o.fit):h}
 // один лист объекта — для окна, где щелчком ставятся точки подписей (те же размеры, что в PDF)
 function pageHtml(o,i=0,{logo="",company={},page=""}={}){const co={...COMPANY,...company};
  return`<!doctype html><html lang="ru"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>${CSS}body{margin:0;overflow:hidden}</style></head><body>${page==="gal"?galleryPage(o,co,logo,i):objectPage(o,co,logo,i)}</body></html>`}
 // есть ли у объекта лист «Фото с объекта» — для тегов на нём в окне (инженер 26.11.2026 «почему теги только на одной странице?»)
 const hasGallery=(o,i=0)=>!!galleryPage(o,COMPANY,"",i);
 function objectPage0(o,co,logo,i=0){
  const lay0=layoutOf(o,i),lay=lay0===7?1:lay0===8?4:lay0,pics=o.pictures||[],main=pics[0]||"",rest=pics.slice(1,lay0===1||lay0===2?1+CHAIN:4);
  if(lay===2)return`<section class="page lay2"><div class="L"><div class="in">${textCol(o,12,co)}</div></div>
  <div class="R">${phOf(o,2,main)}${logoOf(co,logo)}<div class="band"></div>${chainOf(rest,true)}
  <div class="info">${placeOf(o,co)}</div>${footOf(o)}</div></section>`;
  if(lay===3){const name=String(o.name||"Объект"),ws=worksOf(o).slice(0,Math.min(4,o.wkMax||4)),p=doneOf(o),place=String(o.address||"").trim();
   return`<section class="page lay3">${phOf(o,3,main)}<div class="shade"></div>${logoOf(co,logo)}
   <div class="hd"><div class="kick up">${esc(o.years?String(o.years):"Объект")}${place?" · "+esc(place):""}</div><h1 class="ttl up${titleCls(name)}">${esc(name)}</h1>
   ${o.summary&&!o.sumMoved?`<div class="sm">${sumHtml(o.summary)}</div>`:""}</div>
   ${rest.length?`<div class="thumbs">${rest.slice(0,3).map(s=>`<div${bg(s)}></div>`).join("")}</div>`:""}
   <div class="tiles"><div class="tw">${ws.map(w=>`<div class="tl">${isSvc(w)?"":`<i>${esc(fmt(num(w.volume)))}<s>${esc(unitOf(w.unit))}</s></i>`}${planOf(w)}<b class="up">${esc(w.name)}</b></div>`).join("")}</div>
   <div class="tr">${ringOf(p)}</div></div>
   <div class="strip"><div><small class="up">Генеральный подрядчик</small>${nmOf(o.general_contractor)}</div><div><small class="up">Заказчик</small>${nmOf(o.customer)}</div><div class="doc up"><em>${CHECK}</em>Полный пакет исполнительной документации</div></div></section>`}
  if(lay===5){const name=String(o.name||"Объект"),ws=worksOf(o).slice(0,12),p=doneOf(o);
   return`<section class="page lay5">${phOf(o,5,main)}${logoOf(co,logo)}${circlesOf(rest)}
   <div class="lo"><h1 class="ttl up${titleCls(name)}">${esc(name)}</h1>
   <div class="info">${placeOf(o,co)}</div><div class="badges">${ringOf(p)}${docOf()}</div></div>
   <div class="ro"><div class="wks">${wkRows(ws.slice(0,o.wkMax||ws.length))}</div></div>${footOf(o," f5")}</section>`}
  if(lay===6){const name=String(o.name||"Объект"),p=doneOf(o);
   return`<section class="page lay6"><div class="fr${rest.length?"":" full"}">${phOf(o,6,main)}</div>
   ${rest.length?`<div class="row">${rest.slice(0,3).map(s=>`<div${bg(s)}></div>`).join("")}</div>`:""}
   <div class="tx">${logoOf(co,logo," l6")}<h1 class="ttl up${titleCls(name)}">${esc(name)}</h1>
   <div class="wks">${wkRows(worksOf(o).slice(0,Math.min(8,o.wkMax||8)))}</div><div class="badges">${ringOf(p)}<div class="meta">${yearOf(o)}<p>${esc(o.address||"")}</p></div></div>
   <div class="gp"><small class="up">Генподрядчик</small>${esc(o.general_contractor||"—")}<small class="up">Заказчик</small>${esc(o.customer||"—")}</div></div></section>`}
  // «Журнал» — фото слева во всю высоту, справа как разворот журнала: главный объём крупно оранжевым, остальные списком
  if(lay===9){const name=String(o.name||"Объект"),ws=worksOf(o),cap=Math.min(9,o.wkMax||9),h=ws[0],p=doneOf(o),place=String(o.address||"").trim(),hv=h&&!isSvc(h)?fmt(num(h.volume)):"";
   return`<section class="page lay9">${phOf(o,9,main)}<div class="bar"></div>${logoOf(co,logo," l9")}
   ${rest.length?`<div class="th">${rest.map(s=>`<div${bg(s)}></div>`).join("")}</div>`:""}
   <div class="in"><div class="kick up">${esc(o.years?String(o.years):"Объект")}${place?" · "+esc(place):""}</div><h1 class="ttl up${titleCls(name)}">${esc(name)}</h1>
   ${h?`<div class="hero${hv.length>7?" s":""}">${hv?`<i>${esc(hv)}<s>${esc(unitOf(h.unit))}</s></i>`:""}<b class="up">${esc(h.name)}</b>${planOf(h)}</div>`:""}
   <div class="wks">${wkRows(ws.slice(1,cap))}</div>${o.summary&&!o.sumMoved?`<div class="sum">${sumHtml(o.summary)}</div>`:""}
   <div class="badges">${ringOf(p)}${docOf()}</div>
   <div class="gp"><div><small class="up">Генподрядчик</small>${esc(o.general_contractor||"—")}</div><div><small class="up">Заказчик</small>${esc(o.customer||"—")}</div></div></div></section>`}
  // «Диагональ» — фото на весь лист, справа оранжевая панель косым краем, тёмная полоса и малые фото по диагонали
  if(lay===10)return`<section class="page lay10">${phOf(o,10,main)}<div class="dk"></div><div class="pn"></div>${logoOf(co,logo," l10")}
   ${rest.length?`<div class="dc">${rest.map((s,k)=>`<div class="c d${k}"${bg(s)}></div>`).join("")}</div>`:""}
   <div class="card">${placeOf(o,co)}<div class="gp"><div><small class="up">Генподрядчик</small>${esc(o.general_contractor||"—")}</div><div><small class="up">Заказчик</small>${esc(o.customer||"—")}</div></div></div>
   <div class="in">${textCol(o,8,co)}</div></section>`;
  if(lay===4){const n=Math.min(4,pics.length);
   return`<section class="page lay4"><div class="M m${n}">${pics.slice(0,4).map((s,k)=>`<div class="g g${k}"${bg(s)}></div>`).join("")}${logoOf(co,logo)}
   <div class="info">${placeOf(o,co)}</div></div>
   <div class="O"><div class="in">${textCol(o,12,co)}</div></div>${footOf(o," f4")}</section>`}
  return`<section class="page"><div class="L"><div class="in">${textCol(o,12,co)}</div></div>
  <div class="R">${phOf(o,1,main)}${logoOf(co,logo)}
  <div class="band"></div>${lay0===7?circlesOf(rest):chainOf(rest)}
  <div class="info">${placeOf(o,co)}</div>${footOf(o)}</div></section>`
 }
 // больше фото (инженер 20.11.2026 «сделай в буклетах больше фото, а то везде 2-3»): макет листа берёт первые 4,
 // остальные выбранные (до 6) — следующим листом «Фото с объекта» сеткой по их числу
 const MAX_PHOTOS=16;
 // макет листа «Фото с объекта» (инженер 24.11.2026 «как выбирать макет второго листа?», выбор «Да, 4 варианта»):
 // 0 «Авто» — сетка по числу фото на тёмном фоне, 1 «Сетка» — равные ячейки на светлом, 2 «Крупное + мелкие» — первое
 // фото крупно слева, остальные сеткой справа, 3 «Тёмный» — тёмный лист и шапка, фото встык
 // 4 «Плёнка» — фото кадрами фотоплёнки (инженер 24.11.2026 «поинтереснее»)
 const GALLERIES=["Сетка","Крупное + мелкие","Тёмный","Плёнка"];
 const galleryOf=o=>{const n=Number(o?.gallery);if(n in GAL_GONE)return GAL_GONE[n];return n>=1&&n<=GALLERIES.length?n:0};
 // раскладка без пустых ячеек: число столбцов по форме ячейки ближе к 4:3, лишние ячейки — первые фото на два столбца
 function galFit(m,w,h){let best=null;for(let k=1;k<=m;k++){const r=Math.ceil(m/k),e=k*r-m;if(e>=r)continue;const s=e*.3+Math.abs(Math.log((w/k)/(h/r)/1.33));if(!best||s<best.s)best={c:k,r,e,s}}return best}
 // «Авто» — фото рядами, каждое в своих пропорциях (инженер 24.11.2026 «сделай тут фотографий 12», «красиво оформи»,
 // «вот такие фотографии подобрать тяжело» — крупная квадратная и широкая ячейки требовали особых фото): ряды подбираются
 // так, чтобы при высоте ряда по его фото они вместе заняли лист, порядок фото тот, что выбран; обрезка — только от
 // подгонки высоты, в пределах нескольких процентов. a — ширина/высота каждого фото (без размера — 4:3)
 function rowsOf(a,W,H,g=3,maxR=4){const n=a.length;if(!n)return null;let best=null;
  for(let m=0;m<1<<(n-1);m++){const rows=[];let cur=[0];for(let i=1;i<n;i++){if(m>>(i-1)&1){rows.push(cur);cur=[i]}else cur.push(i)}rows.push(cur);
   if(rows.length>maxR)continue;let tot=g*(rows.length-1),pen=0;const hs=rows.map(r=>{const sa=r.reduce((t,i)=>t+a[i],0),h=(W-g*(r.length-1))/sa;if(r.length===1&&n>2)pen+=.25;if(h<H*.18)pen+=1;return h});
   tot+=hs.reduce((t,h)=>t+h,0);const sc=Math.abs(Math.log(tot/H))+pen+.02*Math.abs(rows[0].length-Math.min(...rows.map(r=>r.length)));
   if(!best||sc<best.sc)best={sc,rows,hs}}return best}
 const ratioOk=x=>Number(x)>0.3&&Number(x)<4?Math.round(Number(x)*100)/100:4/3; // до 0,01 — окно (малые фото), предпросмотр и PDF раскладывают одинаково
 function bigOf(a,W,H,g=3){const a0=a[0],Hb=Math.min(H*.72,W*.6/a0),bw=Hb*a0,rest=a.slice(1);let best=null;
  for(let k=0;k<=rest.length;k++){const R=k?rowsOf(rest.slice(0,k),W-bw-g,Hb,g,3):null,D=k<rest.length?rowsOf(rest.slice(k),W,H-Hb-g,g,2):null;
   if(k&&!R||k<rest.length&&!D)continue;const sc=(R?R.sc:(W-bw-g>20?.6:0))+(D?D.sc:(H-Hb-g>20?.6:0));if(!best||sc<best.sc)best={sc,k,R,D,bw,Hb}}return best}
 function galGrid(gv,n,narrow){if(n<2)return null;const W=narrow?187:285,H=176;
  if(gv===2){const f=galFit(n-1,W*.5,H);return{st:`grid-template:repeat(${f.r},1fr)/${(f.c*1.25).toFixed(2)}fr repeat(${f.c},1fr)`,cell:i=>i===0?"grid-row:1/-1;grid-column:1":i<=f.e?"grid-row:auto;grid-column:span 2":"grid-row:auto;grid-column:auto"}}
  const f=galFit(n,W,H);return{st:`grid-template:repeat(${f.r},1fr)/repeat(${f.c},1fr)`,cell:i=>i<f.e?"grid-row:auto;grid-column:span 2":"grid-row:auto;grid-column:auto"}}
 // схемы макетов для окна «Буклет» (инженер 24.11.2026 «какое-нибудь превью или схему при выборе макета»): лист
 // условно — фото серым, текст линиями, оранжевое — оранжевым, тёмное — тёмным
 const SK={ph:"#9aa7b3",or:"#f5a700",dk:"#1f252b",ln:"#55606b",lt:"#fff"};
 const skR=(x,y,w,h,f,r=0)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${f}"/>`;
 const skT=(x,y,w,n,f=SK.ln,s=3.2)=>Array.from({length:n},(_,k)=>skR(x,y+k*s,k%3===2?w*.7:w,1.3,f,.6)).join("");
 const skC=(x,y,r,f=SK.ph)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${f}" stroke="#fff" stroke-width=".8"/>`;
 const skFoot=f=>skR(0,38,60,4,f||"#e9edf1");
 function skPage(k){switch(k){
  case 1:return skR(0,0,20,38,SK.lt)+skR(2,3,13,2.4,SK.dk)+skT(2,8,15,8)+skR(20,0,40,38,SK.ph)+skR(20,28,40,10,SK.or)+skC(28,29,3.4)+skC(35,29,4)+skC(42,29,3.4)+skFoot();
  case 2:return skR(0,0,40,38,SK.ph)+skR(0,28,40,10,SK.or)+skC(18,29,3.4)+skC(25,29,4)+skC(32,29,3.4)+skR(40,0,20,38,SK.lt)+skR(43,3,13,2.4,SK.dk)+skT(43,8,15,8)+skFoot();
  case 3:return skR(0,0,60,38,SK.ph)+skR(3,3,26,2.6,SK.lt)+skR(3,7,20,2.6,SK.lt)+[0,1,2].map(k=>skR(50,4+k*8,8,6.5,"#c9d1d8",.8)).join("")+[0,1,2,3].map(k=>skR(3+k*10.5,29,9.5,6,SK.lt,.8)).join("")+skFoot(SK.dk);
  case 4:return skR(0,0,26,38,SK.ph)+skR(2,30,12,5,SK.lt,.8)+[0,1,2].map(k=>skR(27,k*12.8,12,12,SK.ph)).join("")+skR(40,0,20,38,SK.or)+skR(42,3,14,2.4,SK.dk)+skT(42,8,15,8,SK.dk)+skFoot();
  case 5:return skR(0,0,60,20,SK.ph)+skR(0,20,60,18,SK.lt)+skC(40,19,3)+skC(46,19,3.6)+skC(52,19,3)+skR(3,23,16,2.2,SK.dk)+skT(22,23,15,4)+skT(40,23,13,4)+skFoot();
  case 9:return skR(0,0,60,42,SK.lt)+skR(0,0,34.7,42,SK.ph)+skR(34.7,0,.8,42,SK.or)+[0,1,2].map(k=>skR(2+k*8.2,34,7.4,5.6,"#c9d1d8",.3)).join("")+skR(38,3,17,2.4,SK.dk)+skR(38,8,13,5,SK.or)+skT(38,15.5,19,6)+skC(41.5,37.5,3,SK.or);
  case 10:return skR(0,0,60,42,SK.ph)+`<polygon points="34,0 35.5,0 29,42 27.3,42" fill="${SK.dk}"/><polygon points="36.2,0 60,0 60,42 29.7,42" fill="${SK.or}"/>`+skC(33,10,3.2)+skC(31.3,21,3.2)+skC(29.7,32,3.2)+skR(2,33,19,6.5,SK.lt,.8)+skR(39,3,16,2.4,SK.dk)+skT(39,8,17,8,SK.dk);
  case 6:return skR(0,0,60,42,SK.dk)+skR(3,3,34,22,SK.ph)+[0,1,2].map(k=>skR(3+k*11.6,27,10.6,8,SK.ph)).join("")+skR(41,3,15,2.4,SK.lt)+skT(41,8,16,8,"#aab4be")+skC(44,35,3,SK.or);
 }return""}
 function skGal(gv){
  if(gv===4){const head5=skR(0,0,60,7,SK.lt)+skR(0,0,2,7,SK.or)+skR(4,2.4,18,2,SK.dk);let c="";[0,1].forEach(r=>{const y=10+r*15.5;c+=skR(3,y,54,13.5,"#111417",.5);for(let q=0;q<4;q++)c+=skR(4.5+q*13.1,y+2.6,12,8.3,SK.ph,.3);for(let q=0;q<18;q++){c+=skR(4+q*3,y+.7,1.5,1,"#ece7dc")+skR(4+q*3,y+11.8,1.5,1,"#ece7dc")}});return skR(0,0,60,42,"#ece7dc")+head5+c}
  const head=gv===3?skR(0,0,60,7,SK.dk)+skR(0,0,2,7,SK.or)+skR(4,2.4,18,2,SK.lt):skR(0,0,60,7,SK.lt)+skR(0,0,2,7,SK.or)+skR(4,2.4,18,2,SK.dk);
  const bgc=gv===0||gv===3?(gv===3?"#0d1013":SK.dk):"#eef1f4",g=gv===3?1:2,X=3,Y=9,W=54,H=31;let cells="";
  const grid=(x,y,w,h,cols,rows)=>{const cw=(w-(cols-1)*g)/cols,ch=(h-(rows-1)*g)/rows;let s="";for(let r=0;r<rows;r++)for(let q=0;q<cols;q++)s+=skR(x+q*(cw+g),y+r*(ch+g),cw,ch,SK.ph,gv===3?0:.8);return s};
  if(gv===0){const rs=[[1.33,.75,1.5],[1.5,1.78,.75,1.33],[1.33,.75,1.5,1.33]],hs=rs.map(r=>(W-g*(r.length-1))/r.reduce((t,a)=>t+a,0)),k=(H-g*2)/hs.reduce((t,h)=>t+h,0);let y=Y;rs.forEach((r,j)=>{const h=hs[j]*k,sa=r.reduce((t,a)=>t+a,0);let x=X;r.forEach(a=>{const w=(W-g*(r.length-1))*a/sa;cells+=skR(x,y,w,h,j||x>X?SK.ph:SK.or,.8);x+=w+g});y+=h+g})}
  else if(gv===2){const bw=W*.58,bh=H*.68;cells=skR(X,Y,bw,bh,SK.ph,.8)+grid(X+bw+g,Y,W-bw-g,bh,2,2)+grid(X,Y+bh+g,W,H-bh-g,3,1)}
  else cells=grid(X,Y,W,H,3,2);
  return skR(0,0,60,42,bgc)+head+cells}
 const skSvg=b=>`<svg viewBox="0 0 60 42" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto">${b}</svg>`;
 // k — номер макета (1…8; 7 «Альбом» как «Классика», 8 «Фотоотчёт» как «Мозаика», с листом фото рядом)
 function layoutSketch(k){k=Number(k)||0;if(!k)return"";const base=k===7?1:k===8?4:k;
  return k===7||k===8?`<svg viewBox="0 0 124 42" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto"><g>${skPage(base)}</g><g transform="translate(64 0)">${skGal(1)}</g></svg>`:skSvg(skPage(base))}
 const gallerySketch=gv=>skSvg(skGal(Number(gv)||0));
 // лист «Фото с объекта» — фото с пятого (1–4 уже на листе объекта, без повторов — инженер 24.11.2026 «одни и те же фото почему используется на разных листах»), если их больше четырёх или краткая характеристика не вместилась на
 // лист объекта: тогда она здесь, слева тёмной колонкой (инженер 20.11.2026 «если на страницу переносишь, то больше фото
 // показывай с краткой информацией»)
 // «Плёнка»: полосы плёнки с перфорацией — 1 полоса до 3 фото, 2 до 8, иначе 3; кадры равные, пустые — тёмные
 function filmOf(ps,gn,W){const k=gn<=3?1:gn<=8?2:3,per=Math.ceil(gn/k),fw=(W-8-2.5*(per-1))/per,fh=Math.min(fw*.75,(176-6*(k-1))/k-13),sh=`flex:0 0 ${(fh+13).toFixed(1)}mm`;let h="";for(let r=0;r<k;r++){let f="";for(let q=0;q<per;q++){const n=r*per+q;f+=`<div class="fr"${n<gn?bg(ps[n]):""}>${n<gn?`<em>${String(n+1).padStart(2,"0")}</em>`:""}</div>`}h+=`<div class="fs" style="${sh}">${f}</div>`}return`<div class="gg film">${h}</div>`}
 function galleryPage(o,co,logo,i=0){const h=galleryPage0(o,co,logo,i);return h?withLabels(h,o.lbl2):""}
 function galleryPage0(o,co,logo,i=0){const all=o.pictures||[],sm=o.summary&&o.sumMoved,wr=wkRest(o,i),side=sm||wr.length>0;
  const st=onPage(o,i);if(all.length<=st&&!side)return"";const ps=all.slice(st,MAX_PHOTOS);const gn=Math.min(ps.length,12);if(!ps.length&&!side)return"";
  const gv=galleryOf(o),ra=k=>ratioOk((o.ratios||[])[st+k]),W0=side?187:285,
   // «Крупное + мелкие» (инженер 24.11.2026 «вот такие фотографии подобрать тяжело»): крупное — в своей пропорции слева
   // сверху (до 0,6 ширины и 0,72 высоты), справа от него и под ним — остальные рядами в своих пропорциях
   big=gv===2&&gn>=3&&bigOf(ps.slice(0,gn).map((_,k)=>ra(k)),W0,176),
   jr=!big&&gv!==1&&gv<4&&gn>=2&&rowsOf(ps.slice(0,gn).map((_,k)=>ra(k)),W0,176),gst=!big&&!jr&&galGrid(gv,gn,!!sm);
  const cellImg=s=>s?`background-image:url('${String(s).replace(/'/g,"%27")}')`:"";
  return`<section class="page gal${gv?" gl"+gv:""}${side?" wsum":""}${side&&!ps.length?" solo":""}${o.galSmall?" gsm":""}"><div class="gh"><div class="t"><small class="up">${ps.length?"Фото с объекта":"Виды работ"}</small><b>${esc(o.name||"Объект")}</b></div>
  <div class="lg">${logo?`<img src="${esc(logo)}" alt="">`:`<b>${esc(co.name)}</b>`}</div></div>
  ${side?`<div class="gs">${wr.length?`<div class="gw">${wkRows(wr)}</div>`:""}${sm?`<small class="up${wr.length?" s2":""}">Краткая характеристика</small><div class="gt">${sumHtml(o.summary)}</div>`:""}</div>`:""}
  ${gv===4&&ps.length?filmOf(ps,gn,side?182:279):big||jr?(()=>{const cnt=`<span class="cnt"><b>${gn}</b> фото</span>`,rowsH=(J,off)=>J.rows.map((r,j)=>`<div class="rw" style="flex:${J.hs[j].toFixed(2)} 1 0">${r.map(q=>{const k=q+off;return`<div style="flex:${ra(k).toFixed(3)} 1 0;${cellImg(ps[k])}">${k===0?cnt:""}</div>`}).join("")}</div>`).join("");
   if(!big)return`<div class="gg jr">${rowsH(jr,0)}</div>`;const H0=176;
   return`<div class="gg jr jb"><div class="top" style="flex:${big.Hb.toFixed(1)} 1 0"><div class="big" style="flex:${big.bw.toFixed(1)} 1 0;${cellImg(ps[0])}">${cnt}</div>${big.R?`<div class="jc" style="flex:${(W0-big.bw-3).toFixed(1)} 1 0">${rowsH(big.R,1)}</div>`:""}</div>${big.D?`<div class="jc" style="flex:${(H0-big.Hb-3).toFixed(1)} 1 0">${rowsH(big.D,1+big.k)}</div>`:""}</div>`})():ps.length?`<div class="gg n${gn}${gst?.big?" bento":""}"${gst?` style="${gst.st}"`:""}>${ps.slice(0,12).map((s,k)=>gst?`<div style="${gst.cell(k)}${s?`;background-image:url('${String(s).replace(/'/g,"%27")}')`:""}">${gst.big&&k===0?`<span class="cnt"><b>${gn}</b> фото</span>`:""}</div>`:`<div${bg(s)}></div>`).join("")}</div>`:""}</section>`}
 // objects: [{name, customer, general_contractor, address, status, years, summary, works:[{name,unit,volume,plan}], pictures:[src…]}]
 // сохранённый лист объекта (live — то, что сейчас в программе): лист объекта остаётся на день сохранения, а сведения о
 // фирме — общий объём, заказчики, география — всегда по нынешним данным (инженер 27.11.2026 «при выгрузке (сохраненных)
 // обновляется только информация о компании - объемы и тд, а об объекте остается»)
 // сведения о фирме — по всем объектам фирмы, как на сайте (инженер 27.11.2026 «где вся инфа и объемы компании за
 // все время по всем объектам?», «на передней стороне вся инфа о компании, на задней объект»): all — все объекты из
 // окна, отмеченные в буклете берутся своими данными (rid), остальные — как есть
 const firmOf=(all,data)=>{if(!Array.isArray(all)||!all.length)return null;const mine=new Map((data||[]).filter(o=>o&&o.rid).map(o=>[Number(o.rid),o]));
  const out=all.map(o=>mine.get(Number(o?.rid))||o);for(const o of data||[])if(!o?.rid||!all.some(a=>Number(a?.rid)===Number(o.rid)))out.push(o);return out};
 const liveOf=list=>(Array.isArray(list)?list:[]).map(o=>o&&o.live?{...o,...o.live}:o);
 function build(objects,{logo="",company={},services=true,map=true,screen=false,all}={}){
  const d=new Date(),co={date:String(d.getDate()).padStart(2,"0")+"."+String(d.getMonth()+1).padStart(2,"0")+"."+d.getFullYear(),...COMPANY,...company},list=(Array.isArray(objects)?objects:[]).map((o,i)=>{const m=LAYOUT_MAX[layoutOf(o,i)];return(o.pictures||[]).length>m?{...o,pictures:o.pictures.slice(0,m)}:o}),firm=liveOf(Array.isArray(all)&&all.length?all:list);
  return`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Журнал ${esc(co.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>${CSS}${screen?SCREEN:""}</style></head><body>
${(()=>{const pages=[["О компании",aboutPage(firm,co,logo)],...(services?[["Что мы делаем",servicesPage(co,logo)]]:[]),...list.flatMap((o,i)=>{const g=galleryPage(o,co,logo,i),n=String(o.name||"Объект");return[[n,objectPage(o,co,logo,i)],...(g?[[n+" — фото",g]]:[])]})];const mp=map&&mapPage(firm,co,logo);if(mp)pages.push(["География работ",mp]);
 return pages.map(([t,h],i)=>(screen?`<div class="pvn">Лист ${i+1} · ${esc(t)}</div>`:"")+h).join("")})()}</body></html>`
 }

 // ---- евробуклет в 3 сложения (инженер 24.11.2026 «а ты можешь как буклет прям сделать? чтобы в 3 раза сложить можно
 // было»): один лист А4, две стороны, по 3 полосы, сгиб «гармошкой внутрь» — внутренняя полоса, уходящая внутрь, на 3 мм
 // уже (97 мм). Снаружи: клапан «О компании» | задняя — карта и контакты | обложка. Внутри: цифры и заказчики | услуги |
 // объекты. Как в строительных буклетах (инженер «найди примеры строительных буклетов»): обложка — фото и чем занимаемся,
 // сзади контакты, клапан — о компании и преимущества, внутри — цифры, услуги, объекты с фото. Каждый текст один раз;
 // объёмы, объекты, заказчики, фото — из программы. Печать с двух сторон, переворот по короткому краю.
 const FOLD_CSS=`.tf{position:relative;width:297mm;height:210mm;overflow:hidden;page-break-after:always;background:#fff;color:var(--ink)}
.tf .pn{position:absolute;top:0;bottom:0;overflow:hidden}.tf .mk{position:absolute;width:.25mm;height:4mm;background:#b9c0c7}.tf .mk.t{top:0}.tf .mk.b{bottom:0}
.tf .kk{font-size:6.6pt;font-weight:800;letter-spacing:1.6px;color:var(--ord);margin-bottom:1.8mm}.tf h2{margin:0 0 4mm;font-size:16pt;font-weight:900;line-height:1.1}
.tf .ab{left:0;width:97mm;padding:8mm 9mm 9mm 10mm;display:flex;flex-direction:column}.tf .ab:before{content:"";position:absolute;left:0;top:0;width:32mm;height:20mm;background:linear-gradient(135deg,var(--or2),var(--or));clip-path:polygon(0 0,100% 0,0 100%)}
.tf .ab .ld{font-size:7.6pt;line-height:1.55;color:#3a414a;margin:0 0 4mm}.tf .lic{display:flex;gap:3mm;align-items:center;background:#1d2228;color:#fff;border-radius:2mm;padding:3mm 3.5mm;font-size:6.8pt;font-weight:700;line-height:1.35;margin-bottom:4mm}
.tf .lic em{flex:none;width:8mm;height:8mm;border-radius:2mm;background:var(--or);display:grid;place-items:center}.tf .lic em svg{width:5mm;height:5mm}
.tf .adv{display:flex;flex-direction:column;gap:3mm}.tf .adv div{border-left:1mm solid var(--or);padding-left:3mm}.tf .adv b{display:block;font-size:7.6pt;font-weight:900}.tf .adv span{display:block;font-size:6.6pt;color:var(--mut);line-height:1.35;margin-top:.6mm}
.tf .alg{margin:0 0 4mm}
.tf .alg img{display:block;width:auto;height:auto;max-width:64mm;max-height:20mm;margin:0 auto}
.tf .amap{flex:1 1 0;min-height:22mm;padding-top:7mm;display:flex;flex-direction:column}
.tf .ab:has(.amap) .adv{gap:2mm}
.tf .ab:has(.amap) .ld{margin-bottom:3mm}
.tf .amap svg{flex:1 1 0;min-height:0;width:100%;height:100%;display:block;margin-top:1mm}
.tf .amap .rk{flex:none;margin-top:1.2mm;text-align:center;font-size:7pt;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#1d2228}.tf .amap .rk:before,.tf .amap .rk:after{content:"";display:inline-block;width:6mm;height:.35mm;background:var(--or);vertical-align:middle;margin:0 2mm}
.tf .amap .kz{fill:#ece7dd;stroke:#d6cfc1;stroke-width:2}
.tf .amap .dt{fill:var(--or)}
.tf .amap .dn{fill:#1d2228;font:900 17px Montserrat,sans-serif;text-anchor:middle;dominant-baseline:central}
.tf .amap .of{fill:#1d2228}
.tf .amap+.slg{margin-top:3mm}
.tf .ab:has(.art) .adv{gap:1.6mm}.tf .ab:has(.art) .adv div{padding:1.8mm 2.6mm}.tf .ab:has(.art) .ld{margin-bottom:3mm}.tf .ab:has(.art) .lic{margin-bottom:3mm;padding:2.4mm 3mm}.tf .ab:has(.art) .alg{margin-bottom:3mm}
.tf .ab .art{flex:1 1 0;min-height:30mm;display:flex;flex-direction:column;padding-top:3.5mm}
.tf .ab .art .aimg{flex:1 1 0;min-height:18mm;border-radius:2.5mm;background:#faf6ee;margin-bottom:3mm;display:flex;overflow:hidden;position:relative}
.tf .ab .art .aimg:before{content:"";position:absolute;left:0;top:0;bottom:0;width:1mm;background:var(--or)}
.tf .asvg{position:absolute;left:2mm;top:1mm;right:1mm;bottom:1mm;width:calc(100% - 3mm);height:calc(100% - 2mm);display:block}
.tf .asvg line{stroke-linecap:round}.tf .asvg .ga{stroke:#d6cfc1;stroke-width:.6;stroke-dasharray:3 2.5}
.tf .asvg .gb{fill:#fff;stroke:#1d2228;stroke-width:.8}.tf .asvg .gt{font:800 6px Montserrat,sans-serif;fill:#1d2228;text-anchor:middle;dominant-baseline:central}
.tf .asvg .pw{fill:#e9e3d6;stroke:#d6cfc1;stroke-width:.5}.tf .asvg .pr{fill:#f1ece2;stroke:#d6cfc1;stroke-width:.5}.tf .asvg .ps{stroke:#d6cfc1;stroke-width:.4}
.tf .asvg .sd{stroke:#1d2228}.tf .asvg .so{stroke:#f5a700}.tf .asvg .sx{stroke:#1d2228;stroke-width:.7}
.tf .asvg .bs{fill:#1d2228}.tf .asvg .ld{stroke:#1d2228;stroke-width:.6}.tf .asvg .tg{fill:#1d2228}.tf .asvg .mt{font:900 7px Montserrat,sans-serif;fill:#f5a700;text-anchor:middle;dominant-baseline:central}
.tf .ab .art .kk{margin-bottom:1.2mm}
.tf .ab .art p{font-size:6.9pt;line-height:1.5;color:#3a414a;margin:0}.tf .ab .art p b{color:var(--ink)}
.tf .ab .art+.slg{margin-top:4mm}
.tf .fr:has(.amap) .tot{grid-template-columns:1fr 1fr;gap:2mm 4mm;margin-bottom:3.5mm}
.tf .fr:has(.amap) .tot div{display:block;padding-bottom:1.6mm}
.tf .fr:has(.amap) .tot b{display:block;font-size:12.5pt;margin-bottom:.8mm}
.tf .fr:has(.amap) .tot span{display:block;font-size:6pt}
.tf .fr .amap{flex:1 0 44mm;min-height:0;padding-top:5mm}
.tf .fr .cl+.amap{margin-top:0}
.tf .slg{margin-top:auto;font-size:10.5pt;font-weight:900;line-height:1.25}.tf .slg span{color:var(--ord)}
.tf .bk{left:97mm;width:100.3mm;background:#1d2228;color:#fff;padding:8mm 9mm 9mm;display:flex;flex-direction:column}.tf .bk .kk{color:var(--or)}
.tf .bk svg{width:100%;height:auto;display:block;margin:1mm 0 2mm}.tf .bk .kz{fill:#2f363e;stroke:#4a535d;stroke-width:2}.tf .bk .dt{fill:var(--or)}.tf .bk .dn{fill:#1d2228;font:900 17px Montserrat,sans-serif;text-anchor:middle;dominant-baseline:central}.tf .bk .of{fill:#fff}
.tf .bk .pl{font-size:6.6pt;color:#aab2bc;line-height:1.45;margin-bottom:6mm}.tf .bk .pl b{color:#fff}
.tf .ct{display:flex;flex-direction:column;gap:2.4mm;margin-bottom:5mm}.tf .ct div{display:flex;justify-content:space-between;gap:3mm;font-size:7.6pt;border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:2mm}.tf .ct small{color:#aab2bc;font-size:6.4pt;font-weight:700;letter-spacing:.5px}.tf .ct b{font-weight:800;white-space:nowrap}
.tf .bk h2{font-size:14pt;margin-bottom:2mm}
.tf .svd{margin-bottom:3mm}
.tf .svd .it{display:grid;grid-template-columns:7mm 1fr;gap:0 2mm;padding:1.2mm 0;border-bottom:1px solid rgba(255,255,255,.1)}
.tf .svd i{font-style:normal;font-size:8pt;font-weight:900;color:var(--or);grid-row:span 2}
.tf .svd b{font-size:7pt;font-weight:900}
.tf .svd p{margin:.4mm 0 0;font-size:5.9pt;line-height:1.3;color:#aab2bc}
.tf .bk h2{margin-bottom:3mm}.tf .svd.n9 .it{padding:.9mm 0}.tf .svd.n9 b{font-size:6.6pt}.tf .svd.n9 p{font-size:5.3pt;line-height:1.28;margin-top:.2mm}.tf .svd.n9 i{font-size:7.4pt}
.tf .bk .ct{gap:1.2mm;margin-bottom:3mm}
.tf .bk .ct div{padding-bottom:1.1mm;font-size:7pt}
.tf .ct .ph{display:inline-flex;align-items:center;gap:1.4mm;white-space:nowrap}.tf .ct .ml{text-align:right;line-height:1.35}
svg.wa{width:3.4mm;height:3.4mm;flex:none;vertical-align:-.7mm;margin-right:1mm}svg.wa{width:3.4mm!important;height:3.4mm!important}.tf .ct svg.wa{margin:0}
.tf .cv.oq{left:0;width:100.3mm}
.tf .oq .lg img{width:auto;height:auto;max-height:16mm;max-width:76mm}
.tf .oq .od{position:absolute;left:9mm;right:9mm;bottom:11mm;z-index:2}
.tf .oq .yr{display:inline-block;background:var(--or);color:var(--ink);font-size:7pt;font-weight:900;padding:.8mm 2.4mm;border-radius:1mm;margin-bottom:2.5mm}
.tf .oq h2{font-size:16pt;line-height:1.12;margin:0 0 2mm;color:#fff}
.tf .oq .pl{font-size:7.4pt;font-weight:700;color:#d5dae0;margin-bottom:3.5mm}
.tf .oq .pr{border-left:1mm solid var(--or);padding-left:3mm;margin-top:2mm}
.tf .oq .pr small{display:block;font-size:5.8pt;font-weight:800;letter-spacing:1.2px;color:var(--or2)}
.tf .oq .pr b{display:block;font-size:7.8pt;font-weight:800;line-height:1.3}
.tf .ow{left:100mm;width:197mm;padding:9mm 12mm 10mm 11mm;display:flex;flex-direction:column}
.tf .ow h2{font-size:18pt;margin-bottom:6mm}
.tf .ow .wl{flex:1 1 0;min-height:0}
.tf .ow .fin{flex:none;position:relative;overflow:hidden;display:flex;align-items:center;gap:3.6mm;margin-top:3mm;background:linear-gradient(110deg,#1d2228 55%,#2a2f36);color:#fff;border-radius:2.5mm;padding:2.3mm 4mm 2.3mm 5mm}.tf .ow .fin:before{content:"";position:absolute;left:0;top:0;bottom:0;width:1.3mm;background:var(--or)}.tf .ow .fin:after{content:"";position:absolute;right:-9mm;top:-9mm;width:26mm;height:26mm;border-radius:50%;border:2.2mm solid rgba(245,167,0,.12)}.tf .ow .fin .rg{position:relative;flex:none;width:12.5mm;height:12.5mm}.tf .ow .fin .rg svg{position:absolute;inset:0;width:100%;height:100%}.tf .ow .fin .rg b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:7.6pt;font-weight:900;color:#fff;letter-spacing:-.2px}.tf .ow .fin .tx{position:relative;display:flex;flex-direction:column;gap:1mm;min-width:0}.tf .ow .fin .tx strong{font-size:8pt;font-weight:900;line-height:1.15;text-transform:uppercase;letter-spacing:.3px}.tf .ow .fin .tx span{display:flex;align-items:center;gap:1.6mm;font-size:6.6pt;font-weight:600;line-height:1.3;color:#cfd4da}.tf .ow .fin .tx span svg{flex:none;width:3.2mm;height:3.2mm}


.tf .ow .wl.c2{column-count:2;column-gap:9mm}
.tf .ow .wl div{break-inside:avoid;display:flex;justify-content:space-between;align-items:baseline;gap:4mm;border-bottom:1px solid var(--line);padding:3mm 0;font-size:10pt;font-weight:700;line-height:1.3}
.tf .ow .wl b{font-size:14pt;font-weight:900;color:var(--or);white-space:nowrap}
.tf .ow .wl s{text-decoration:none;font-size:.6em;color:var(--mut)}
.tf .ow.nar{width:100.3mm;padding:8mm 9mm 9mm 10mm}
.tf .ow.nar h2{font-size:15pt;margin-bottom:4mm}
.tf .ow.nar .wl.c2{column-gap:5mm}
.tf .ow .wl{flex:0 1 auto}
.tf .ow .ofl{flex:1 1 0;min-height:0;display:flex;flex-direction:column;gap:3mm;padding-top:4mm;overflow:hidden}
.tf .ow .osm{flex:0 1 auto;min-height:0;overflow:hidden;position:relative;border-left:1.1mm solid var(--or);padding:.5mm 0 7mm 3.5mm;-webkit-mask-image:linear-gradient(#000 calc(100% - 7mm),transparent);mask-image:linear-gradient(#000 calc(100% - 7mm),transparent)}
.tf .ow .osm small{display:block;font-size:6.6pt;font-weight:800;color:var(--mut);letter-spacing:.8px;margin-bottom:1.3mm}
.tf .ow .osm .tx{font-size:8.6pt;line-height:1.45;color:var(--ink)}
.tf .ow .osm .tx p{margin:0 0 1.4mm}
.tf .ow .osm .tx ul{margin:0 0 1.4mm;padding-left:4mm}
.tf .ow.nar .osm .tx{font-size:7.6pt}
.tf .ow .oart{flex:1 1 0;min-height:0;container-type:size}
.tf .ow .oart .in{height:100%;display:flex;align-items:center;justify-content:center;border-radius:2.5mm;background:linear-gradient(135deg,#f4f5f7,#eceef1);padding:3mm 5mm;box-sizing:border-box}
.tf .ow .oart svg{width:100%;height:100%;max-height:46mm}
@container (max-height:18mm){.tf .ow .oart .in{display:none}}
.tf .opx{left:200mm;width:97mm;padding:8mm 9mm 9mm 2mm;display:flex;flex-direction:column}
.tf .opx .gx{flex:1 1 0;min-height:0;display:grid;gap:2.2mm;grid-template-columns:1fr 1fr;margin-top:2mm}
.tf .opx.n1 .gx{grid-template-areas:"a a"}
.tf .opx.n2 .gx{grid-template-areas:"a a" "b b";grid-template-rows:1.3fr 1fr}
.tf .opx.n3 .gx{grid-template-areas:"a a" "b c";grid-template-rows:1.5fr 1fr}
.tf .opx.n4 .gx{grid-template-areas:"a a" "b c" "d d";grid-template-rows:1.35fr 1fr 1fr}
.tf .opx.n5 .gx{grid-template-areas:"a a" "b c" "d e";grid-template-rows:1.35fr 1fr 1fr}
.tf .opx.n6 .gx{grid-template-areas:"a a" "b c" "d e" "f f";grid-template-rows:1.3fr 1fr 1fr 1.05fr}
.tf .opx i{border-radius:2.5mm;background:#3a4047 center/cover no-repeat;min-height:0;box-shadow:0 .6mm 2mm rgba(0,0,0,.18)}
.tf .ow.f1 .wl div{font-size:8.4pt;padding:2.2mm 0}.tf .ow.f1 .wl b{font-size:11pt}
.tf .ow.f2 .wl div{font-size:7.4pt;padding:1.7mm 0}.tf .ow.f2 .wl b{font-size:9.5pt}
.tf .ow.f3 .wl div{font-size:6.6pt;padding:1.3mm 0}.tf .ow.f3 .wl b{font-size:8.4pt}
.tf .ow.f4 .wl div{font-size:5.8pt;padding:.9mm 0}.tf .ow.f4 .wl b{font-size:7.4pt}
.tf .nm.fr{left:196.7mm;width:100.3mm}
.tf .fr .tot{gap:1.8mm;margin-bottom:4mm}
.tf .fr .tot div{padding-bottom:1.6mm}
.tf .fr .cl{flex:0 1 auto;min-height:0;overflow:hidden;margin-top:0}.tf .cl .oth{margin:1.6mm 0 0;font-size:6.4pt;font-weight:600;font-style:italic;color:#6b7280}
.tf .fr .cl .cg div{font-size:6.8pt}
.tf .fr .cl.f1 .cg div{font-size:6.2pt;padding:.9mm 0}
.tf .fr .cl.f2 .cg div{font-size:5.6pt;padding:.7mm 0}
.tf .fr .cl.f3 .cg div{font-size:5pt;padding:.55mm 0}
.tf .fr .cl.f4 .cg div{font-size:4.6pt;padding:.45mm 0}
.tf .fr .cl.c2 .cg{column-count:2;column-gap:3mm}
.tf .fr .cl.c2 .cg div{break-inside:avoid}
.tf .rq{margin-top:auto;font-size:6pt;line-height:1.5;color:#aab2bc}.tf .rq b{color:#fff;font-size:6.6pt}
.tf .cv{left:196.7mm;width:100.3mm;background:#2b3036;color:#fff}.tf .cv .ph{position:absolute;inset:0;background:#3a4047 center/cover no-repeat}
.tf .cv .ph:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,0) 30%,rgba(0,0,0,.15) 50%,rgba(0,0,0,.82))}
.tf .cv .lg{position:absolute;left:9mm;top:10mm;background:#fff;border-radius:2.5mm;padding:2.5mm 3.5mm;z-index:2}.tf .cv .lg img{width:auto;height:auto;max-height:12mm;max-width:60mm;display:block}.tf .cv .lg b{font-size:10pt;font-weight:900;color:var(--ink)}
.tf .cv .tt{position:absolute;left:9mm;right:9mm;bottom:14mm;z-index:2}.tf .cv .tt:before{content:"";display:block;width:20mm;height:1.6mm;background:var(--or);margin-bottom:5mm}
.tf .cv h1{margin:0;font-size:20pt;font-weight:900;line-height:1.1}.tf .cv .tt p{margin:4mm 0 0;font-size:8pt;font-weight:700;color:var(--or2);letter-spacing:.6px}
.tf .cv .cut{position:absolute;right:0;top:0;width:34mm;height:40mm;background:linear-gradient(225deg,var(--or2),var(--or));clip-path:polygon(0 0,100% 0,100% 100%);z-index:1}
.tf .nm{left:0;width:100mm;padding:8mm 9mm 9mm 10mm;display:flex;flex-direction:column}.tf .tot{display:grid;grid-template-columns:1fr;gap:2.6mm;margin-bottom:6mm}
.tf .tot div{display:grid;grid-template-columns:38mm 1fr;align-items:baseline;gap:3mm;border-bottom:1px solid var(--line);padding-bottom:2.2mm}.tf .tot b{font-size:14pt;font-weight:900;color:var(--or);white-space:nowrap;line-height:1}.tf .tot span{font-size:6.6pt;font-weight:700;color:var(--mut);line-height:1.3}
.tf .cl{background:#f6f3ec;border-radius:2mm;padding:4mm 4.5mm;margin-top:auto}.tf .cl .kk{margin-bottom:2.4mm}.tf .cl div{font-size:6.8pt;font-weight:700;line-height:1.3;padding:1.1mm 0;border-bottom:1px solid #e6e0d3}.tf .cl div:last-child{border:0}
.tf .sv{left:99.8mm;width:100.4mm;background:linear-gradient(170deg,var(--or2),var(--or) 55%,var(--ord));padding:14mm 9mm 10mm;display:flex;flex-direction:column}.tf .sv .kk{color:#4a3500}
.tf .sv .it{display:grid;grid-template-columns:8mm 1fr;gap:0 2.5mm;padding:2.2mm 0;border-bottom:1px solid rgba(0,0,0,.12)}.tf .sv i{font-style:normal;font-size:9pt;font-weight:900;color:#1d2228;opacity:.55;grid-row:span 2}.tf .sv b{font-size:7.6pt;font-weight:900}.tf .sv p{margin:.6mm 0 0;font-size:6.4pt;line-height:1.35;color:#3a2a00}
.tf .ob{left:200mm;width:97mm;padding:14mm 9mm 10mm;display:flex;flex-direction:column}.tf .oc{flex:1 1 0;min-height:0;display:flex;flex-direction:column;margin-bottom:4mm}.tf .oc:last-of-type{margin-bottom:0}
.tf .oc .op{flex:1 1 0;min-height:16mm;border-radius:2mm;background:#3a4047 center/cover no-repeat;position:relative}.tf .oc .op span{position:absolute;left:2mm;bottom:2mm;background:var(--or);color:var(--ink);font-size:6pt;font-weight:900;padding:.6mm 2mm;border-radius:1mm}
.tf .oc b{display:block;font-size:7.6pt;font-weight:900;line-height:1.25;margin-top:2mm;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.tf .oc small{display:block;font-size:6.2pt;color:var(--mut);font-weight:600;margin-top:.6mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tf .oc .ov{display:flex;gap:4mm;margin-top:1.2mm}.tf .oc .ov em{font-style:normal;font-size:9pt;font-weight:900}.tf .oc .ov s{text-decoration:none;font-size:6.4pt;font-weight:700;color:var(--ord);margin-left:.6mm}
.tf .om{font-size:6.6pt;font-weight:700;color:var(--mut);margin-top:3mm}
.tf.sp{background:#2b3036}.tf.sp>.ph{position:absolute;inset:0;background:#3a4047 center/cover no-repeat}.tf.sp .sh{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 55%,rgba(0,0,0,0) 40%,rgba(0,0,0,.35));pointer-events:none}
.tf.sp svg.ld{position:absolute;inset:0;width:297mm;height:210mm;z-index:2}.tf.sp .ld polyline{fill:none;stroke:var(--or);stroke-width:.45;stroke-linejoin:round}.tf.sp .ld circle{fill:#fff;stroke:var(--or);stroke-width:.6}
.tf.sp .lb{position:absolute;z-index:3;color:#fff;font-size:9.5pt;font-weight:900;line-height:1.08;letter-spacing:.4px;text-shadow:0 .3mm 1.2mm rgba(0,0,0,.85),0 0 .4mm rgba(0,0,0,.6);white-space:nowrap}
.tf.sp .lr{text-align:right}.tf.sp .row{position:absolute;left:12mm;right:12mm;bottom:12mm;display:flex;flex-wrap:wrap;gap:3mm 7mm;z-index:3}.tf.sp .row .lb{position:static;border-bottom:.45mm solid var(--or);padding-bottom:1mm}
.tf.sp .cap{position:absolute;left:10mm;top:9mm;z-index:3;background:rgba(29,34,40,.82);color:#fff;border-left:1.4mm solid var(--or);border-radius:1.5mm;padding:2.4mm 4mm;max-width:120mm}
.tf.sp .cap small{display:block;font-size:5.8pt;font-weight:800;letter-spacing:1.4px;color:var(--or2)}.tf.sp .cap b{display:block;font-size:8pt;font-weight:800;line-height:1.25;margin-top:.6mm}.tf.sp .cap span{display:block;font-size:6.4pt;color:#c9ced5;margin-top:.4mm}
.tf .oc .og{flex:1 1 0;min-height:16mm;display:grid;grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr;gap:1.2mm}.tf .oc .og .op{min-height:0;grid-row:span 2}.tf .oc .og.n2 .op{grid-row:span 2}.tf .oc .og i{border-radius:1.5mm;background:#3a4047 center/cover no-repeat}.tf .oc .og.n2 i{grid-row:span 2}
.tf .o3{width:99mm;padding:9mm 7mm 8mm;display:flex;flex-direction:column}.tf .o3.k0{left:0}.tf .o3.k1{left:98.8mm;width:99.4mm;background:#f6f3ec}.tf .o3.k2{left:198mm}.tf .o3 .no{font-size:24pt;font-weight:900;color:var(--or);line-height:1;margin-bottom:2mm}
.tf .o3 .m{flex:1 1 0;min-height:30mm;border-radius:2mm;background:#3a4047 center/cover no-repeat;position:relative}.tf .o3 .m span{position:absolute;left:2mm;top:2mm;background:var(--or);color:var(--ink);font-size:6.4pt;font-weight:900;padding:.6mm 2mm;border-radius:1mm}
.tf .o3 .s{display:grid;grid-template-columns:1fr 1fr;gap:1.6mm;height:30mm;margin-top:1.6mm}.tf .o3 .s i{border-radius:2mm;background:#3a4047 center/cover no-repeat}.tf .o3 .s.n1{grid-template-columns:1fr}
.tf .o3 h3{margin:3.5mm 0 0;font-size:10pt;font-weight:900;line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.tf .o3 small{display:block;font-size:6.6pt;color:var(--mut);font-weight:600;margin-top:1mm}
.tf .o3 .w{margin-top:2.5mm;display:flex;flex-direction:column;gap:1.2mm}.tf .o3 .w div{display:flex;justify-content:space-between;gap:3mm;font-size:6.8pt;border-bottom:1px solid var(--line);padding-bottom:1.1mm}.tf .o3 .w b{font-weight:900;color:var(--ord);white-space:nowrap}
.tf.co{background:#1d2228}.tf.co .cg{position:absolute;inset:0;display:grid;gap:1.4mm;padding:1.4mm}.tf.co .cg i{position:relative;background:#3a4047 center/cover no-repeat;border-radius:1mm}.tf.co .cg i.big{grid-column:span 2;grid-row:span 2}
.tf.co .cg i span{position:absolute;left:2mm;bottom:2mm;max-width:80%;background:rgba(29,34,40,.85);color:#fff;border-left:1mm solid var(--or);font-style:normal;font-size:6.4pt;font-weight:800;padding:1mm 2mm;border-radius:1mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tf .q1{left:0;width:100.3mm;display:flex;flex-direction:column}.tf .q1 .m{height:112mm;flex:none;background:#3a4047 center/cover no-repeat;position:relative}.tf .q1 .m span{position:absolute;left:9mm;bottom:4mm;background:var(--or);color:var(--ink);font-size:7pt;font-weight:900;padding:.8mm 2.4mm;border-radius:1mm}
.tf .q1 .tx{padding:7mm 9mm 10mm 10mm;display:flex;flex-direction:column;flex:1 1 0;min-height:0}.tf .q1 h2{font-size:15pt;margin-bottom:2.5mm;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}.tf .q1 .pl{font-size:7.4pt;font-weight:700;color:var(--mut);margin-bottom:4mm}
.tf .q1 .pt{margin-top:auto;display:flex;flex-direction:column;gap:2.2mm}.tf .q1 .pt div{border-left:1mm solid var(--or);padding-left:3mm}.tf .q1 .pt small{display:block;font-size:5.8pt;font-weight:800;letter-spacing:1.2px;color:var(--mut)}.tf .q1 .pt b{display:block;font-size:7.6pt;font-weight:800;line-height:1.3}
.tf .q2{left:100mm;width:100.3mm;background:#f6f3ec;padding:14mm 9mm 10mm;display:flex;flex-direction:column}.tf .q2 .w{display:flex;flex-direction:column}.tf .q2 .w div{display:flex;justify-content:space-between;align-items:baseline;gap:3mm;font-size:7.2pt;font-weight:600;line-height:1.3;border-bottom:1px solid #e6e0d3;padding:1.7mm 0}.tf .q2 .w b{font-weight:900;color:var(--ord);white-space:nowrap}
.tf .q2 .s{margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:1.6mm;height:44mm;flex:none;padding-top:4mm}.tf .q2 .s.n1{grid-template-columns:1fr}.tf .q2 .s i{border-radius:2mm;background:#3a4047 center/cover no-repeat}
.tf .q3{left:200mm;width:97mm;background:#1d2228;color:#fff;padding:14mm 9mm 10mm;display:flex;flex-direction:column}.tf .q3 .kk{color:var(--or)}.tf .q3 .sm{flex:1 1 0;min-height:0;overflow:hidden;font-size:7.2pt;line-height:1.5;color:#d5dae0;-webkit-mask-image:linear-gradient(180deg,#000 88%,transparent)}
.tf .q3 .sm p{margin:0 0 2mm}.tf .q3 .sm h5{margin:2mm 0 1mm;font-size:7.6pt;color:#fff}.tf .q3 .sm ul,.tf .q3 .sm ol{margin:0 0 2mm;padding-left:4mm}.tf .q3 .sm b,.tf .q3 .sm strong{color:#fff}
.tf .q3 .ct{margin:5mm 0 0}.tf .q3 .lg2{font-size:9pt;font-weight:900;margin-top:2mm}.tf .q3 .lg2 span{color:var(--or)}
.tf .nb{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-bottom:4mm}.tf .nb div{border-top:1mm solid var(--or);padding-top:1.8mm}.tf .nb b{display:block;font-size:11.5pt;font-weight:900;line-height:1.05;white-space:nowrap}.tf .nb span{display:block;font-size:6pt;font-weight:700;color:var(--mut);line-height:1.25;margin-top:.8mm}
.tf .ab.hp .adv{display:grid;grid-template-columns:1fr 1fr;gap:1.6mm}.tf .ab.hp .adv span{font-size:6.1pt}
.tf .aph{flex:none;display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:1.6mm;height:25mm;margin-top:3mm}.tf .aph.n2{grid-template-columns:1fr 1fr}
.tf .aph i{display:block;border-radius:2mm;background:#e9e3d6 center/cover no-repeat;box-shadow:0 .6mm 1.6mm rgba(29,34,40,.18)}.tf .aph i:first-child{border-bottom:1mm solid var(--or)}
.tf .bk{background-position:center;background-size:cover}
.tf .fr .fbd{flex:none;position:relative;margin:-8mm -9mm 3.5mm -10mm;height:31mm;background:#1d2228 center/cover no-repeat;display:flex;align-items:flex-end;padding:0 9mm 4mm 10mm;border-bottom:1.2mm solid var(--or)}
.tf .fr .fbd:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(29,34,40,.05) 15%,rgba(29,34,40,.9))}
.tf .fr:has(.fbd) .tot{gap:1mm 4mm;margin-bottom:3mm}.tf .fr:has(.fbd) .tot b{font-size:11.5pt;margin-bottom:.5mm}.tf .fr:has(.fbd) .tot div{padding-bottom:1.1mm}
.tf .fr:has(.fbd) .cl{padding:3mm 4mm}.tf .fr:has(.fbd) .cl.c2 .cg div{padding:.75mm 0;font-size:6.2pt}.tf .fr:has(.fbd) .amap{padding-top:3.5mm}
.tf .fr .fbd>div{position:relative}.tf .fr .fbd .kk{color:var(--or);text-shadow:0 .2mm 1mm rgba(0,0,0,.6)}.tf .fr .fbd h2{color:#fff;margin:0;text-shadow:0 .3mm 1.5mm rgba(0,0,0,.35)}

/* обложка — первый сгиб (28.11.2026), цвета сайта a-ts.kz */
.tf .fc{left:0;width:97mm;background:#efede8;color:#141414;padding:9mm 9mm 8mm 10mm;display:flex;flex-direction:column;--g:#d29a00;font-family:Montserrat,sans-serif}
.tf .fc:before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 50%,rgba(20,20,20,.035) 50%),repeating-linear-gradient(90deg,rgba(20,20,20,.06) 0 .2mm,transparent .2mm 9.7mm),repeating-linear-gradient(0deg,rgba(20,20,20,.06) 0 .2mm,transparent .2mm 15mm)}
.tf .fc:after{content:"";position:absolute;top:0;bottom:0;right:0;width:2.6mm;background:repeating-linear-gradient(135deg,rgba(20,20,20,.13) 0 .45mm,transparent .45mm 1.8mm)}
.tf .fc>*{position:relative}
.tf .fc .fw{position:absolute;left:-14mm;right:-6mm;bottom:0;height:104mm;background:#141414;opacity:.62;-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-composite:source-in;mask-composite:intersect}
.tf .fc .cm{position:absolute;width:5mm;height:5mm;border:0 solid var(--g)}.tf .fc .cm.tl{left:6mm;top:5.5mm;border-width:.55mm 0 0 .55mm}.tf .fc .cm.tr{right:6mm;top:5.5mm;border-width:.55mm .55mm 0 0}
.tf .fc .fl{display:flex;justify-content:center;margin:1mm 0 6mm}.tf .fc .fl img{max-width:62mm;max-height:24mm;object-fit:contain;display:block}.tf .fc .fl b{font:700 16pt Oswald,Montserrat,sans-serif}
.tf .fc h1{margin:0;font:600 23pt/1.03 Oswald,Montserrat,sans-serif;text-transform:uppercase;letter-spacing:.2px;color:#141414}
/* третья полоса в цветах обложки (инженер 28.11.2026 «третий сгиб как-будто вообще не смотрится») */
.tf .fr.fx{background-color:#efede8;background-image:linear-gradient(rgba(29,34,40,.045) .2mm,transparent .2mm),linear-gradient(90deg,rgba(29,34,40,.045) .2mm,transparent .2mm);background-size:8mm 8mm;padding:9mm 9mm 8mm 9mm}
.tf .fr.fx .kk{color:#a87b00}.tf .fr.fx h2{margin:0;font:600 19pt/1.02 Oswald,Montserrat,sans-serif;text-transform:uppercase;letter-spacing:.2px;color:#141414}
.tf .fr.fx .fst{display:flex;gap:1mm;margin:2.2mm 0 3mm 1mm;flex:none}.tf .fr.fx .fst i{width:4.2mm;height:2mm;background:#d29a00;transform:skewX(-35deg)}.tf .fr.fx .fst i:nth-child(n+3){background:#a87b00}
.tf .fr.fx .fph{flex:none;height:21mm;border-radius:2.4mm;background:#1d2228 center/cover no-repeat;margin:0 0 3.4mm;box-shadow:0 .6mm 2mm rgba(0,0,0,.18);border-bottom:1.1mm solid #d29a00}
.tf .fr.fx .tot{grid-template-columns:1fr 1fr;gap:1.5mm;margin-bottom:2.6mm}
.tf .fr.fx .tot div{display:block;background:#fff;border:0;border-left:.9mm solid #d29a00;border-radius:1.4mm;padding:1.1mm 2.2mm 1.2mm}
.tf .fr.fx .tot b{display:block;font:600 11.5pt/1 Oswald,Montserrat,sans-serif;color:#141414;margin-bottom:.4mm}.tf .fr.fx .tot span{display:block;font-size:5.8pt;line-height:1.25;color:#5b6168}
.tf .fr.fx .cl{background:#fff;border-radius:1.6mm;padding:3mm 3.6mm}.tf .fr.fx .cl div{border-color:#eee8dc}
.tf .fr.fx .amap{flex:1 1 30mm;padding-top:3mm}.tf .fr.fx .amap .kz{fill:#fff;stroke:#d6cfc1}
.tf .fc .fl img{mix-blend-mode:multiply}
.tf .opx{padding:8mm 6mm 8mm 6mm}
.tf .fc .st{display:flex;gap:1mm;margin:4mm 0 4.5mm 1mm}.tf .fc .st i{width:4.2mm;height:2mm;background:var(--g);transform:skewX(-35deg)}.tf .fc .st i:nth-child(n+3){background:#a87b00}
.tf .fc .sl{font-size:9pt;font-weight:800;line-height:1.3;margin-bottom:4mm}.tf .fc .sl span{color:var(--g)}
.tf .fc .li{display:flex;align-items:center;gap:2.4mm;background:#141414;color:#fff;border-radius:2mm;padding:2.2mm 3mm;font-size:6.6pt;font-weight:700;line-height:1.3;margin-bottom:3.2mm}.tf .fc .li em{flex:none;width:6mm;height:6mm;border-radius:1.4mm;background:var(--g);display:flex;align-items:center;justify-content:center}.tf .fc .li em svg{width:3.6mm;height:3.6mm}
.tf .fc .ad{display:grid;grid-template-columns:1fr 1fr;gap:1.6mm 3mm}.tf .fc .ad div{display:flex;align-items:center;gap:1.8mm;font-size:6.8pt;font-weight:800;line-height:1.2}.tf .fc .ad i{flex:none;width:2.2mm;height:2.2mm;background:var(--g);transform:rotate(45deg)}
.tf .fc .fmk{position:absolute;right:8mm;top:124mm;width:9mm;height:9mm;fill:var(--g);background:none;margin:0;border:0}
.tf .fc .ft{margin-top:auto;display:flex;justify-content:space-between;align-items:center;font-size:8pt;letter-spacing:.6px}.tf .fc .ft b{background:#efede8;padding:.6mm 1.6mm .6mm 0}
.tf .fc .ft span{display:flex;gap:.8mm;align-items:center}.tf .fc .ft span i{width:2.6mm;height:1.6mm;background:var(--g);transform:skewX(-35deg)}.tf .fc .ft span s{width:2.6mm;height:2.6mm;border-radius:50%;background:var(--g);margin-left:1mm}
/* сторона объекта: виды работ на тёмной полосе, как «Что мы делаем» (28.11.2026 «в темный цвет, как на первом листе») */
.tf .ow{background:#1d2228;color:#fff}.tf .ow h2{color:#fff}.tf .ow .kk{color:var(--or)}
.tf .ow .wl div{border-bottom-color:rgba(255,255,255,.12);color:#fff}.tf .ow .wl s{color:#aab2bc}
.tf .ow .osm small{color:#aab2bc}.tf .ow .osm .tx{color:#d8dde3}
.tf .ow .oart .in{background:linear-gradient(135deg,#262c33,#20262c)}.tf .ow .oart [stroke="#1d2228"]{stroke:#d8dde3}.tf .ow .oart [stroke="#c9ced5"]{stroke:#5a636d}
.tf .ow .fin{background:linear-gradient(110deg,#2a3038 55%,#323941)}
`;
 const FOLD_OBJ=3,FOLD_PH=3,FOLD_PH_OBJ=7;
 // сколько фото объекта берётся в буклет: «Лист объекта» и «Буклет на объект» — до 7 у каждого (полоса + 6 в галерее),
 // остальные макеты — до 3 у первых трёх (инженер 27.11.2026 «фото 2, хотя выбрано 7»: PDF брал по-старому 3)
 const foldCap=(i,inside,spread)=>{let n=inside===undefined?(spread&&spread.src?0:1):Number(inside)||0;if(n===0&&!(spread&&spread.src))n=1;return n===1||n===4?FOLD_PH_OBJ:i<FOLD_OBJ?FOLD_PH:0};
 // макеты разворота внутри евробуклета (инженер 24.11.2026 «в буклете выбор нескольких фото и макетов сделай»):
 // 0 — одно фото на весь разворот с подписями, 1 — цифры, услуги, объекты, 2 — три объекта по полосе с фото,
 // 3 — фотоколлаж из фото отмеченных объектов. У каждого из первых трёх объектов до 3 фото, первое — главное.
 const FOLD_LAYOUTS=["Фото с подписями","Лист объекта","Три объекта","Фотоколлаж","Буклет на объект"];
 // коллаж: число фото → [столбцов, рядов, крупное 2×2]
 const COLLAGE={1:[1,1,0],2:[2,1,0],3:[3,1,0],4:[2,2,0],5:[4,2,1],6:[3,2,0],7:[5,2,1],8:[4,2,0],9:[4,3,1]};
 function foldSketch(k){const r=(x,y,w,h,c="#cfd5db")=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${c}"/>`,O="#f5a700",fm=`<line x1="20" y1="2" x2="20" y2="40" stroke="#fff" stroke-dasharray="2 2"/><line x1="40" y1="2" x2="40" y2="40" stroke="#fff" stroke-dasharray="2 2"/>`;
  const b=[r(1,1,58,40,"#7d8790")+`<line x1="12" y1="14" x2="22" y2="20" stroke="${O}"/><line x1="44" y1="10" x2="36" y2="22" stroke="${O}"/>`+r(4,12,8,2,"#fff")+r(44,8,10,2,"#fff"),
   r(1,1,19,40,"#59626b")+r(3,3,9,4,"#fff")+r(3,30,10,2,O)+r(3,34,13,2,"#fff")+r(20,1,39,40,"#fff")+r(23,4,16,3,"#1d2228")+r(23,10,15,2)+r(42,10,15,2)+r(23,14,15,2)+r(42,14,15,2)+r(23,18,15,2)+r(42,18,15,2)+r(23,26,10,12)+r(35,26,10,12)+r(47,26,10,12),
   r(1,1,19,40,"#fff")+r(3,4,15,20)+r(3,25,7,6)+r(11,25,7,6)+r(3,33,12,2,O)+r(20,1,20,40,"#f6f3ec")+r(22,4,16,20)+r(22,25,8,6)+r(31,25,7,6)+r(22,33,12,2,O)+r(40,1,19,40,"#fff")+r(42,4,15,20)+r(42,25,7,6)+r(50,25,7,6)+r(42,33,12,2,O),
   r(1,1,58,40,"#1d2228")+r(2,2,28,25)+r(31,2,13,12)+r(45,2,13,12)+r(31,15,13,12)+r(45,15,13,12)+r(2,28,13,12)+r(16,28,14,12)+r(31,28,13,12)+r(45,28,13,12),
   r(1,1,20,40,"#fff")+r(1,1,20,20,"#7d8790")+r(3,24,14,3,O)+r(3,29,12,2)+r(3,33,12,2)+r(21,1,19,40,"#f6f3ec")+r(23,5,14,3,O)+r(23,11,15,2)+r(23,15,15,2)+r(23,19,15,2)+r(23,30,7,8)+r(31,30,7,8)+r(40,1,19,40,"#1d2228")+r(42,5,13,2,O)+r(42,10,15,2,"#59626b")+r(42,14,15,2,"#59626b")+r(42,33,15,4,"#59626b")];
  return skSvg((b[Number(k)||0]||b[0])+fm)}
 function foldMap(objects){const all=geoGroups(objects),f=v=>v.toFixed(1),[ox,oy]=gxy(50.06,72.96);
  return`<svg viewBox="0 0 1000 546"><path class="kz" d="${KZ_PATH}"/>${all.map(g=>{const [x,y]=gxy(g.lat,g.lon),r=Math.min(30,16+g.list.length*2.5);return`<circle class="dt" cx="${f(x)}" cy="${f(y)}" r="${r}"/><text class="dn" x="${f(x)}" y="${f(y)}">${g.list.length}</text>`}).join("")}<circle class="of" cx="${f(ox)}" cy="${f(oy)}" r="9"/></svg>`}
 // разворот «фото с подписями» (инженер 24.11.2026 прислал образец — внутри одно фото на весь разворот, подписи с линиями
 // к частям фото): подписи — направления работ фирмы, точку каждой ставит инженер щелчком по фото в окне «Буклет»
 // (pts: [[подпись, x, y]] в долях листа). Подпись уходит от точки к ближнему краю: вверх на 14 мм, в сторону на 10 мм,
 // линия под подписью и наискось к точке. Без точек — подписи строкой внизу, без линий.
 const SPREAD_LABELS=()=>COMPANY.what.items.map(([t])=>t);
 const lbLines=t=>{t=String(t);if(t.length<=16)return[t];const ws=t.split(" ");let best=[t],bd=1e9;for(let i=1;i<ws.length;i++){const a=ws.slice(0,i).join(" "),b=ws.slice(i).join(" "),d=Math.max(a.length,b.length);if(d<bd){bd=d;best=[a,b]}}return best};
 // подписи с линиями к точкам (pts: [[подпись, x, y]] в долях листа 297×210): на фото разворота — белым по фото,
 // на остальных листах (инженер 24.11.2026 «везде дай подписи ставить», «и в журнале тоже», «на одном фото как я могу
 // показать несколько видов работ») — тёмной плашкой с оранжевой чертой, чтобы читалась и на белом
 const ptsOk=pts=>(Array.isArray(pts)?pts:[]).filter(p=>p&&p[0]&&p[1]>=0&&p[1]<=1&&p[2]>=0&&p[2]<=1);
 function lbGeo(pts,pill){const f=v=>v.toFixed(1);let svg="",lbs="";
  for(const [t,x,y] of ptsOk(pts)){const P=[x*297,y*210],dir=P[0]<148.5?-1:1,ls=lbLines(t),w=Math.max(...ls.map(l=>l.length))*(pill?2.2:2.45)+(pill?5:1),h=ls.length*(pill?3.9:4.3)+(pill?2.8:0);
   let ey=P[1]<34?P[1]+16+h:P[1]-14,ex=P[0]+dir*10;ey=Math.min(200,Math.max(8+h,ey));
   let x0=dir<0?ex-w:ex,x1=dir<0?ex:ex+w;if(x0<7){const k=7-x0;x0+=k;x1+=k}if(x1>290){const k=x1-290;x0-=k;x1-=k}
   const near=dir<0?x1:x0;
   svg+=(pill?`<polyline points="${f(near)},${f(ey-h/2)} ${f(P[0])},${f(P[1])}"/>`:`<polyline points="${f(dir<0?x0:x1)},${f(ey+1)} ${f(near)},${f(ey+1)} ${f(P[0])},${f(P[1])}"/>`)+`<circle cx="${f(P[0])}" cy="${f(P[1])}" r="${pill?1.3:1.1}"/>`;
   lbs+=pill?`<div class="lb${dir<0?" lr":""}" style="left:${f(x0)}mm;width:${f(x1-x0)}mm;top:${f(ey-h)}mm;height:${f(h)}mm">${ls.map(esc).join("<br>")}</div>`
    :`<div class="lb up${dir<0?" lr":""}" style="left:${f(x0)}mm;width:${f(x1-x0)}mm;top:${f(ey-h)}mm">${ls.map(esc).join("<br>")}</div>`}
  return{svg,lbs}}
 const labelsLayer=pts=>{const g=lbGeo(pts,true);return g.svg?`<div class="lx"><svg viewBox="0 0 297 210">${g.svg}</svg>${g.lbs}</div>`:""};
 const withLabels=(h,pts)=>{const L=labelsLayer(pts);if(!L)return h;const i=h.lastIndexOf("</section>");return i<0?h+L:h.slice(0,i)+L+h.slice(i)};
 function spreadHtml(sp){const pts=ptsOk(sp.pts);
  const d=sp.px,soft=d&&d[0]>0&&Math.min(d[0]/297,d[1]/210)<4,src=sp.src;
  const ph=soft?`<div class="ph soft"${bg(src)}><b${bg(src)}></b><i${bg(src)}></i></div>`:`<div class="ph"${bg(src)}></div>`;
  const {svg,lbs}=lbGeo(pts,false);
  const row=pts.length?"":`<div class="row">${(sp.labels||SPREAD_LABELS()).map(t=>`<div class="lb up">${esc(t)}</div>`).join("")}</div>`;
  const cap=sp.cap&&sp.cap.name?`<div class="cap"><small class="up">На фото</small><b>${esc(sp.cap.name)}</b>${sp.cap.place?`<span>${esc(sp.cap.place)}</span>`:""}</div>`:"";
  return`<section class="tf sp">${ph}<div class="sh"></div><svg class="ld" viewBox="0 0 297 210">${svg}</svg>${lbs}${row}${cap}`}
 // сторона о фирме (инженер 27.11.2026, лист с двух сторон в 3 сложения): клапан — о компании, логотип на всю ширину,
 // лицензия, преимущества, карта без списка городов | тёмная — что мы делаем, контакты, реквизиты | цифры за всё время и все
 // заказчики (без «и ещё», много — шрифт мельче, больше 24 — в две колонки). L — все объекты фирмы (firmOf).
 // рисунок монтажной схемы на клапане (src/booklet-art.js), подпись про ИИ (инженер 27.11.2026)
 // рисунок монтажной схемы в цветах буклета (инженер 27.11.2026 «схема не нравится вид, нарисуй под дизайн буклета»):
 // каркас цеха в изометрии — колонны, ригели, прогоны, связи тёмным, смонтированное оранжевым, часть стен сэндвичем,
 // сетка осей с кружками
 const ART=()=>{const c=Math.cos(Math.PI/6),sn=.5,K=11,ox=150,oy=128;
  const P=(x,y,z)=>[ox+(x-y)*c*K,oy+(x+y)*sn*K-z*K],pt=a=>a.map(v=>v.toFixed(1)).join(",");
  const L=(a,b,cl,w)=>`<line x1="${P(...a)[0].toFixed(1)}" y1="${P(...a)[1].toFixed(1)}" x2="${P(...b)[0].toFixed(1)}" y2="${P(...b)[1].toFixed(1)}" class="${cl}"${w?` stroke-width="${w}"`:""}/>`;
  const Q=(ps,cl)=>`<polygon points="${ps.map(q=>pt(P(...q))).join(" ")}" class="${cl}"/>`;
  const W=12,H=6,R=8,ys=[0,4,8,12,16],xs=[0,3,6,9,12],zr=x=>H+(R-H)*(1-Math.abs(x-W/2)/(W/2));
  let g="",pn="",st="";
  // сетка осей на земле
  for(const y of ys)g+=L([-1.6,y,0],[W+2,y,0],"ga");for(const x of [0,W])g+=L([x,-1.6,0],[x,18,0],"ga");
  ys.forEach((y,i)=>{const [X,Y]=P(W+2.8,y,0);g+=`<circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="5.2" class="gb"/><text x="${X.toFixed(1)}" y="${(Y+.2).toFixed(1)}" class="gt">${i+1}</text>`});
  ["А","Б"].forEach((t,i)=>{const [X,Y]=P(i?W:0,18.8,0);g+=`<circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="5.2" class="gb"/><text x="${X.toFixed(1)}" y="${(Y+.2).toFixed(1)}" class="gt">${t}</text>`});
  // стены и кровля сэндвич-панелями — дальний ряд и часть кровли
  pn+=Q([[0,12,0],[0,16,0],[0,16,H],[0,12,H]],"pw")+Q([[0,8,0],[0,12,0],[0,12,H],[0,8,H]],"pw");
  pn+=Q([[0,8,H],[0,16,H],[W/2,16,R],[W/2,8,R]],"pr");
  for(let y=8.8;y<16;y+=.8)pn+=L([0,y,0],[0,y,H],"ps");for(let x=.75;x<W/2;x+=.75)pn+=L([x,8,zr(x)],[x,16,zr(x)],"ps");
  // каркас: колонны, ригели, прогоны, связи
  ys.forEach((y,i)=>{const on=i>=2;const k=on?"so":"sd";
   st+=L([0,y,0],[0,y,H],k,2.4)+L([W,y,0],[W,y,H],k,2.4)+L([0,y,H],[W/2,y,R],k,2.2)+L([W/2,y,R],[W,y,H],k,2.2);
   for(const [x0,x1] of [[0,3],[3,6],[6,9],[9,12]])st+=L([x0,y,zr(x0)],[x1,y,zr(x1)],"sd",.6)});
  for(const x of xs)st+=L([x,0,zr(x)],[x,16,zr(x)],x===W/2?"so":"sd",x===W/2?1.6:1);
  st+=L([W,0,0],[W,4,H],"sx")+L([W,4,0],[W,0,H],"sx")+L([W,12,0],[W,16,H],"sx")+L([W,16,0],[W,12,H],"sx");
  for(const z of [2,4])st+=L([W,0,z],[W,16,z],"sd",.8);
  // плиты баз
  for(const y of ys)for(const x of [0,W]){const [X,Y]=P(x,y,0);st+=`<rect x="${(X-2.6).toFixed(1)}" y="${(Y-1.2).toFixed(1)}" width="5.2" height="2.4" class="bs"/>`}
  // выноска «марка»
  const [mx,my]=P(W/2,8,R);st+=`<line x1="${mx.toFixed(1)}" y1="${my.toFixed(1)}" x2="${(mx+30).toFixed(1)}" y2="${(my-18).toFixed(1)}" class="ld"/><rect x="${(mx+30).toFixed(1)}" y="${(my-24.5).toFixed(1)}" width="34" height="13" rx="2.5" class="tg"/><text x="${(mx+47).toFixed(1)}" y="${(my-18).toFixed(1)}" class="mt">Ф-1</text>`;
  return`<svg class="asvg" viewBox="-38 58 336 250" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${g}${pn}${st}</svg>`};
 // шрифт и колонки заказчиков по числу строк; с картой под ними места меньше
 const clC2=(n,map,b)=>n>(map?(b?9:14):24),clF=(n,map,b)=>{const rows=clC2(n,map,b)?Math.ceil(n/2):n;if(map)return clC2(n,map,b)?(n<=15?0:n<=19?1:n<=30?2:n<=40?3:4):(n<=9?0:n<=11?1:n<=13?2:3);return rows<=9?0:rows<=13?1:rows<=17?2:rows<=24?3:4};
 // первый сгиб — обложка (инженер 28.11.2026 образец обложки «заглавная страница, более красивая», «логотипы проставь,
 // конструкцию более масштабную», «возьми из 3д схемы, только подгони под дизайн», «текст какой-нибудь еще», «в цвет сайта»,
 // «именно первый сгиб только сделай, остальное оставь»): фон и золото сайта a-ts.kz, логотип, крупно направление работ,
 // девиз, лицензия, преимущества, внизу каркас ИР-71535 из 3D схемы тонкими линиями (src/booklet-cover.js — маска линий,
 // цвет задаётся здесь), уголки и полоски как на образце. Текст «О компании» и подпись про IR Project с клапана ушли.
 const COVER_WIRE=()=>{try{const g=typeof window!=="undefined"?window:globalThis;return(g.irBookletCover&&g.irBookletCover.wire)||""}catch(_){return""}};
 function coverPanel(co,logo){const w=COVER_WIRE(),adv=(co.adv||[]).slice(0,4);
  return`<div class="pn fc">${w?`<div class="fw" style="-webkit-mask-image:url('${w}'),linear-gradient(transparent,#000 30%);mask-image:url('${w}'),linear-gradient(transparent,#000 30%)"></div>`:""}<i class="cm tl"></i><i class="cm tr"></i><i class="hz"></i>
   <div class="fl">${logo?`<img src="${esc(logo)}" alt="">`:`<b>${esc(co.name)}</b>`}</div>
   <h1>Изготовление<br>и монтаж<br>металлоконструкций</h1><div class="st"><i></i><i></i><i></i><i></i></div>
   <div class="sl">${esc(co.slogan[0])} <span>${esc(co.slogan[1])}</span></div>
   ${co.license?`<div class="li"><em>${CHECK}</em>${esc(co.license)}</div>`:""}
   ${adv.length?`<div class="ad">${adv.map(([t])=>`<div><i></i>${esc(t)}</div>`).join("")}</div>`:""}
   <svg class="fmk" viewBox="0 0 30 30"><path d="M4 4H26V26Z"/><path d="M4 12L18 26H4Z"/><circle cx="4" cy="26" r="2.4"/></svg>
   <div class="ft"><b>${esc(co.site)}</b><span><i></i><i></i><i></i><s></s></span></div></div>`}
 // первая сторона ярче (инженер 28.11.2026 «не кажется тебе первая страница слишком тусклая, мало картинок»): P — фото
 // разных объектов фирмы (firmPicsLoad): первое — полоса с заголовком «Что мы уже сделали» на третьей полосе, три — рядом
 // под преимуществами на клапане (преимущества тогда 2×2), пятое — приглушённым фоном тёмной полосы. Без фото — как было.
 function firmSide(co,logo,L,P){const geo=geoGroups(L),tot=totals(L),cl=clientList(L,co),sv=(co.what||COMPANY.what).items.slice(0,9),mk=()=>"";
  const ps=(Array.isArray(P)?P:[]).filter(Boolean),band=ps[0]||"",row=ps.length>=4?ps.slice(1,4):ps.length===3?ps.slice(1,3):[],dk=ps[4]||ps[ps.length-1]||"",bnd=band?1:0;
  return`<section class="tf">${coverPanel(co,logo)}
  <div class="pn bk"><div class="kk up">Услуги</div><h2>Что мы делаем</h2><div class="svd n${sv.length}">${sv.map(([t,d],i)=>`<div class="it"><i>${String(i+1).padStart(2,"0")}</i><b>${esc(t)}</b><p>${esc(d)}</p></div>`).join("")}</div>
   <div class="kk up">Контакты</div><div class="ct">${co.phones.map(([t,v])=>`<div><small class="up">${esc(t)}</small><b class="ph">${WA}${esc(v)}</b></div>`).join("")}<div><small class="up">Почта</small><b class="ml">${(co.contactMail||co.mail).split(/\s*·\s*/).map(esc).join("<br>")}</b></div><div><small class="up">Сайт</small><b>${esc(co.site)}</b></div></div>
   <div class="rq"><b>${esc(co.full)}</b><br>БИН ${esc(co.bin)}<br>${esc(co.address)}<br>${co.bank.map(esc).join("<br>")}<br>Директор — ${esc(co.head)}</div></div>
  <div class="pn nm fr fx"><div class="kk up">В цифрах</div><h2>Что мы уже сделали</h2><div class="fst"><i></i><i></i><i></i><i></i></div>${band?`<div class="fph"${bg(band)}></div>`:""}<div class="tot">${tot.slice(0,8).map(([b,t])=>`<div><b>${esc(b)}</b><span>${esc(t)}</span></div>`).join("")}</div>
   ${cl.length?`<div class="cl ${clC2(cl.length,geo.length,bnd)?"c2 ":""}f${clF(cl.length,geo.length,bnd)}"><div class="kk up">Нам доверяют</div><div class="cg">${cl.map(t=>`<div>${esc(t)}</div>`).join("")}</div><p class="oth">И другие предприятия и организации.</p></div>`:""}
   ${geo.length?`<div class="amap"><div class="kk up">География работ</div>${foldMap(L)}<div class="rk">Республика Казахстан</div></div>`:""}</div>${mk([97,197])}</section>`}
 // сторона объекта: первая полоса — фото на всю полосу, логотип фирмы, внизу название, адрес, генподрядчик, заказчик;
 // вторая и третья — виды работ с объёмами (много работ — две колонки и шрифт мельче)
 // пустое место под видами работ (инженер 27.11.2026 «чем то надо пустые места заполнить»): список видов работ по своей
 // высоте, остаток полосы — краткая характеристика объекта (на стороне объекта больше нигде не выводится), не влезающая —
 // с плавным обрезом снизу; ниже, если остаётся 18 мм и больше, — рисунок фермы в цветах буклета, без текста (свои слова
 // не повторяются — данные объекта уже на листе)
 const FILL_ART=`<svg viewBox="0 0 240 90" preserveAspectRatio="xMidYMid meet"><g fill="none" stroke-linejoin="round" stroke-linecap="round">
<path d="M12 78h216M20 78V44M220 78V44" stroke="#c9ced5" stroke-width="2.4"/>
<path d="M20 44L120 14L220 44M20 58h200" stroke="#1d2228" stroke-width="3"/>
<path d="M20 58L45 36.5L70 58L95 21.5L120 58L145 21.5L170 58L195 36.5L220 58M45 36.5V58M70 29V58M95 21.5V58M120 14V58M145 21.5V58M170 29V58M195 36.5V58" stroke="#1d2228" stroke-width="1.5" opacity=".75"/>
<path d="M20 44L120 14L220 44" stroke="#f5a700" stroke-width="1.4" transform="translate(0 -4)" opacity=".9"/>
<path d="M20 84h200M20 81v6M120 81v6M220 81v6" stroke="#f5a700" stroke-width="1"/>
<circle cx="20" cy="58" r="2.2" fill="#f5a700" stroke="none"/><circle cx="220" cy="58" r="2.2" fill="#f5a700" stroke="none"/><circle cx="120" cy="14" r="2.2" fill="#f5a700" stroke="none"/></g></svg>`;
 function objFill(o){const sm=String(o.summary||"").trim();
  return`<div class="ofl">${sm?`<div class="osm"><small class="up">Об объекте</small><div class="tx">${sumHtml(sm)}</div></div>`:""}<div class="oart"><div class="in">${FILL_ART}</div></div></div>`}
 function objSide(o,co,logo){const ps=(o.pictures||[]),cvp=ps[0]||"",score=o.mainPx&&o.mainPx[0]>0?Math.min(o.mainPx[0]/100,o.mainPx[1]/210):9;
  const cover=score<4?`<div class="ph soft"${bg(cvp)}><b${bg(cvp)}></b><i${bg(cvp)}></i></div>`:`<div class="ph"${bg(cvp)}></div>`;
  const lg=logo?`<img src="${esc(logo)}" alt="">`:`<b>${esc(co.name)}</b>`,place=String(o.address||"").trim();
  const pt=[["Генподрядчик",o.general_contractor],["Заказчик",o.customer]].filter(([,v])=>String(v||"").trim());
  const ws=(o.works||[]).filter(w=>String(w.name||"").trim()),ex=ps.slice(1,FOLD_PH_OBJ),done=/заверш/i.test(String(o.status||"")),
   // строки по длине названия (длинное — в две строки), плашка «100%» занимает место трёх строк (инженер 27.11.2026: плашка легла на работы)
   n=ex.length?ws.reduce((a,w)=>a+(String(w.name||"").length>34?1:.8),0)+(done?1:0):ws.length+(done?2:0),f=ex.length?(n<=9?0:n<=12?1:n<=16?2:n<=19?3:4):(n<=8?0:n<=14?1:n<=22?2:n<=30?3:4),c2=ex.length?n>23:n>10;
  return`<section class="tf"><div class="pn cv oq">${cover}<div class="lg">${lg}</div><div class="od">${o.years?`<span class="yr">${esc(o.years)}</span>`:""}<h2>${esc(o.name||"Объект")}</h2>${place?`<div class="pl">${esc(place)}</div>`:""}
   ${pt.map(([t,v])=>`<div class="pr"><small class="up">${t}</small><b>${esc(v)}</b></div>`).join("")}</div></div>
  <div class="pn ow f${f}${ex.length?" nar":""}"><div class="kk up">Выполнено на объекте</div><h2>Виды работ и объёмы</h2><div class="wl${c2?" c2":""}">${ws.map(w=>`<div><span>${esc(w.name)}</span>${isSvc(w)||!(num(w.volume)>0)?"":`<b>${esc(fmt(num(w.volume)))} <s>${esc(unitOf(w.unit))}</s></b>`}</div>`).join("")}</div>${objFill(o)}${done?`<div class="fin"><div class="rg"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="3.2"/><circle cx="20" cy="20" r="17" fill="none" stroke="#f5a700" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="106.8" transform="rotate(-90 20 20)"/></svg><b>100%</b></div><div class="tx"><strong>Работы выполнены полностью</strong><span><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#f5a700"/><path d="M4.4 8.3l2.4 2.3 4.8-5" fill="none" stroke="#1d2228" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Полный пакет исполнительной документации</span></div></div>`:""}</div>${ex.length?`<div class="pn opx n${ex.length}"><div class="kk up">Фото с объекта</div><div class="gx">${ex.map((p,k)=>`<i style="grid-area:${"abcdef"[k]}${p?`;background-image:url('${String(p).replace(/'/g,"%27")}')`:""}"></i>`).join("")}</div></div>`:""}</section>`}
 // фото фирмы для первой стороны буклета: по одному с разных объектов — фото «в шапку» сайта, иначе обложка, иначе первое
 // фото объекта; у буклета на объект его собственные фото на первую сторону не идут (они на второй), если есть другие
 const firmFiles=(all,data,n=8)=>{const out=[],seen=new Set();for(const o of [...(Array.isArray(all)?all:[]),...(Array.isArray(data)?data:[])]){if(!o)continue;
  const k=Number(o.rid)||String(o.name||"");if(seen.has(k))continue;seen.add(k);const f=[...(o.hero||[]),o.cover_full||o.cover,...(o.photos||[])].find(x=>x&&x!==o.banner);if(f)out.push({rid:Number(o.rid)||0,f});if(out.length>=n)break}return out};
 async function firmPicsLoad(all,data,size,pic){const out=[];for(const {rid,f} of firmFiles(all,data)){let s="";try{s=(pic&&await pic(f))||await small(await read(f),size,.85)}catch(_){}if(s)out.push({rid,src:s})}return out}
 const picsFor=(pool,o)=>{const p=Array.isArray(pool)?pool.filter(x=>x&&x.src):[];const other=o&&o.rid?p.filter(x=>x.rid!==Number(o.rid)):p;return(other.length>=4||!o?other:[...other,...p.filter(x=>!other.includes(x))]).map(x=>x.src)};
 function foldBuild(objects,{logo="",company={},screen=false,spread=null,inside,all,firmPics}={}){
  let IN=inside===undefined?(spread&&spread.src?0:1):Number(inside)||0;if(IN===0&&!(spread&&spread.src))IN=1;
  if(IN===4)return foldPerObject(objects,{logo,company,screen,all,firmPics});
  const spOn=IN!==1,inLb=IN?labelsLayer(spread?.pts):"";
  const co={...COMPANY,...company},list=Array.isArray(objects)?objects:[],lg=logo?`<img src="${esc(logo)}" alt="">`:`<b>${esc(co.name)}</b>`;
  // метки сгиба убраны (инженер 27.11.2026 «что за белые полосы между фото сверху»): светлые черточки 4 мм у сгибов
  // на тёмной полосе и фото были видны белыми полосами; полосы на 0,3 мм заходят друг под друга — без белого шва
  const mk=()=>"";
  // обложка — фото с лучшим разрешением для полосы 100×210 мм; мало точек — целиком, вокруг размыто (как softMain)
  const withPic=list.filter(o=>(o.pictures||[])[0]),score=o=>{const d=o.mainPx;return d&&d[0]>0?Math.min(d[0]/100,d[1]/210):1},cvo=withPic.slice().sort((a,b)=>score(b)-score(a))[0],cvp=cvo?.pictures[0]||"";
  const cover=cvo&&cvo.mainPx&&score(cvo)<4?`<div class="ph soft"${bg(cvp)}><b${bg(cvp)}></b><i${bg(cvp)}></i></div>`:`<div class="ph"${bg(cvp)}></div>`;
  const L=liveOf(Array.isArray(all)&&all.length?all:list),shown=list.slice(0,FOLD_OBJ);
  const out=`${firmSide(co,logo,L,picsFor(firmPics))}
${IN===0?spreadHtml(spread)+mk([100,200])+"</section>":IN===2?foldThree(shown)+mk([99,198])+inLb+"</section>":IN===3?foldCollage(shown)+mk([100,200])+inLb+"</section>":list.map((o,i)=>{const h=objSide(o,co,logo);return i||!inLb?h:h.replace(/<\/section>$/,inLb+"</section>")}).join("\n")}`;
  return`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Буклет ${esc(co.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Oswald:wght@500;600&display=swap" rel="stylesheet"><style>${CSS}${FOLD_CSS}${screen?SCREEN.replace(/\.page\{/g,".tf{")+".tf{margin:0 auto 10mm}":""}</style></head><body>
${screen?`<div class="pvn">Снаружи · клапан | задняя сторона | обложка</div>`:""}${screen?out.replace(/<\/section>(\s*)<section class="tf/,`</section><div class="pvn">Внутри · ${["фото на весь разворот с подписями","объект: фото | виды работ и объёмы","три объекта","фотоколлаж"][IN]}</div><section class="tf`):out}</body></html>`}
 // буклет на каждый объект (инженер 27.11.2026 «на каждый объект будет свой буклет … первый лист идет общий со всей
 // информацией об фирме, общий объем работ, виды работ и тд, а второй лист (задняя сторона) объект и информация об
 // объекте»): лист с двух сторон, в 3 сложения. Первая сторона — о фирме: о компании, лицензия, общий объём по всем
 // отмеченным объектам | что мы делаем | обложка с главным фото объекта. Вторая — объект: фото, место, годы, генподрядчик
 // и заказчик | виды работ с объёмами и ещё фото | краткая характеристика и контакты. one — один объект (в PDF — свой
 // файл на объект), all — все отмеченные, по ним общий объём.
 function foldPerObject(objects,{logo="",company={},screen=false,all,firmPics}={}){
  const co={...COMPANY,...company},list=Array.isArray(objects)?objects:[],every=Array.isArray(all)&&all.length?all:list,lg=logo?`<img src="${esc(logo)}" alt="">`:`<b>${esc(co.name)}</b>`;
  const tot=totals(liveOf(every)),sv=(co.what||COMPANY.what).items.slice(0,9);
  const side=o=>{const ps=(o.pictures||[]).slice(0,FOLD_PH),score=o.mainPx&&o.mainPx[0]>0?Math.min(o.mainPx[0]/100,o.mainPx[1]/210):9,cvp=ps[0]||"";
   const cover=score<4?`<div class="ph soft"${bg(cvp)}><b${bg(cvp)}></b><i${bg(cvp)}></i></div>`:`<div class="ph"${bg(cvp)}></div>`;
   const place=String(o.address||"").trim(),ws=(o.works||[]).filter(w=>String(w.name||"").trim()).slice(0,16),sum=sumHtml(o.summary);
   const pt=[["Генподрядчик",o.general_contractor],["Заказчик",o.customer]].filter(([,v])=>String(v||"").trim());
   return firmSide(co,logo,liveOf(every),picsFor(firmPics,o))+"\n"+objSide(o,co,logo)};
  const body=list.map(o=>screen?`<div class="pvn">${esc(o.name||"Объект")} · о компании, карта | услуги, контакты | цифры, заказчики</div>`+side(o).replace(/<\/section>\s*<section class="tf">/,`</section><div class="pvn">${esc(o.name||"Объект")} · фото объекта | виды работ и объёмы</div><section class="tf">`):side(o)).join("\n");
  return`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Буклет ${esc(co.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Oswald:wght@500;600&display=swap" rel="stylesheet"><style>${CSS}${FOLD_CSS}${screen?SCREEN.replace(/\.page\{/g,".tf{")+".tf{margin:0 auto 10mm}":""}</style></head><body>${body}</body></html>`}
 function foldThree(list){return`<section class="tf">${list.slice(0,3).map((o,k)=>{const ps=(o.pictures||[]).slice(0,FOLD_PH),place=String(o.address||"").trim(),ws=worksOf(o).slice(0,4);
   return`<div class="pn o3 k${k}"><div class="no">${String(k+1).padStart(2,"0")}</div><div class="m"${bg(ps[0])}>${o.years?`<span>${esc(o.years)}</span>`:""}</div>${ps.length>1?`<div class="s n${ps.length-1}">${ps.slice(1).map(p=>`<i${bg(p)}></i>`).join("")}</div>`:""}
    <h3>${esc(o.name||"Объект")}</h3>${place?`<small>${esc(place)}</small>`:""}${o.customer?`<small>Заказчик — ${esc(o.customer)}</small>`:""}<div class="w">${ws.map(w=>`<div><span>${esc(w.name||"")}</span>${isSvc(w)?"":`<b>${esc(fmt(num(w.volume)))} ${esc(unitOf(w.unit))}</b>`}</div>`).join("")}</div></div>`}).join("")}`}
 function foldCollage(list){const ps=[];list.slice(0,FOLD_OBJ).forEach(o=>(o.pictures||[]).slice(0,FOLD_PH).forEach((p,k)=>ps.push([p,k?"":o.name||""])));
  const n=Math.min(9,ps.length);if(!n)return`<section class="tf co">`;const [c,r,big]=COLLAGE[n];
  return`<section class="tf co"><div class="cg" style="grid-template-columns:repeat(${c},1fr);grid-template-rows:repeat(${r},1fr)">${ps.slice(0,n).map(([p,t],k)=>`<i class="${big&&!k?"big":""}"${bg(p)}>${t?`<span>${esc(t)}</span>`:""}</i>`).join("")}</div>`}
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
 // пропорции фото для листа «Фото с объекта» (ряды без обрезки)
 const dims=src=>new Promise(ok=>{if(!src||typeof Image==="undefined")return ok(null);const i=new Image();i.onload=()=>ok([i.naturalWidth,i.naturalHeight]);i.onerror=()=>ok(null);i.src=src});
 const ratios=ps=>Promise.all(ps.map(async src=>{const d=await dims(src);return d?d[0]/Math.max(1,d[1]):0}));
 // маленькая картинка для окна выбора фото
 const thumb=src=>small(src,360,.8);
 const read=async f=>{if(!f)return"";if(/^data:/.test(f))return f;try{return await root.irProject.images.read(f)||""}catch{return""}};
 // фото объекта на выбор: исходник обложки вместо выреза, фото «в шапку», фото объекта
 // баннер (полоса 1920×180) в буклет не годится
 const allFiles=o=>[...new Set([o.cover_full||o.cover,...(o.hero||[]),...(o.photos||[])].filter(f=>f&&f!==o.banner&&!(o.cover_full&&f===o.cover)))];
 // что отмечено по умолчанию: сохранённый выбор (object-meta «booklet_photos»), иначе первые 4
 const pickDefault=o=>{const all=allFiles(o),saved=(o.booklet?.files||[]).filter(f=>all.includes(f));return{all,files:saved.length?saved:all.slice(0,7),layout:Number(o.booklet?.layout)||0,gallery:Number(o.booklet?.gallery)||0}};
 // data: объекты так, как их собирает окно «Сайт» (siteObjectData) — cover, cover_full, photos, hero; files — выбранные
 // фото (первое — главное), layout — номер макета (0 — авто)
 async function make(data,{onProgress,services=true,map=true,fold=false,spread=null,inside,title="",all}={}){
  const profile=await root.irProject.company.get().catch(()=>({}));
  const logo=await small(await read(profile?.logo||""),1200);
  const objects=[];
  for(const [i,o] of data.entries()){
   onProgress?.(i,data.length,o.name);
   const files=(o.files||pickDefault(o).files).slice(0,fold?foldCap(i,inside,spread):capOf(o)),pictures=[];
   for(const f of files){const s=await read(f);if(s)pictures.push(await small(s,pictures.length?1400:2800))}
   objects.push({...o,pictures,ratios:await ratios(pictures),mainPx:await dims(pictures[0])})
  }
  const opts={logo,company:profile?.name?{name:profile.name}:{},services,map,inside,all:firmOf(all,data)};
  if(fold)opts.firmPics=await firmPicsLoad(all,data,1600);
  if(fold&&spread?.file){const s=await read(spread.file);if(s){const src=await small(s,3500);opts.spread={...spread,src,px:await dims(s)}}}
  if(!fold)await dropTooLong(objects,opts);
  if(fold&&spread&&!opts.spread)opts.spread=spread;
  const clean=t=>String(t||"").replace(/[\\/:*?"<>|«»]/g,"").trim();
  if(fold&&Number(inside)===4){let r=null;for(const o of objects){const html=foldPerObject([o],{...opts,all:opts.all||objects});
    r=await root.irProject.ai.invoke("ai-documents:exec-export",{format:"pdf",name:"Буклет — "+clean(o.name||"объект").slice(0,80)+" "+new Date().toLocaleDateString("ru-RU"),html});if(!r)break}return r}
  const html=fold?foldBuild(objects,opts):build(objects,opts);
  const name=(fold?"Буклет ":"Журнал ")+String(profile?.name||COMPANY.name).replace(/[«»"]/g,"")+(title?" — "+String(title).replace(/[\\/:*?"<>|«»]/g,"").trim():"")+" "+new Date().toLocaleDateString("ru-RU");
  return root.irProject.ai.invoke("ai-documents:exec-export",{format:"pdf",name,html})
 }
 // предпросмотр (инженер 20.11.2026 «сделать предпросмотр как каждая страница выглядеть будет»): те же листы, что уйдут
 // в PDF, с малыми фото (pic(f) — готовая маленькая картинка из окна), краткая характеристика — по той же проверке
 async function preview(data,{pic,services=true,map=true,fold=false,spread=null,inside,all}={}){
  const profile=await root.irProject.company.get().catch(()=>({}));
  const logo=await small(await read(profile?.logo||""),600);
  const objects=[];
  for(const [i,o] of data.entries()){const pictures=[];for(const f of (o.files||pickDefault(o).files).slice(0,fold?foldCap(i,inside,spread):capOf(o))){const s=(pic&&await pic(f))||await small(await read(f),900,.8);if(s)pictures.push(s)}const f0=(o.files||pickDefault(o).files)[0];objects.push({...o,pictures,ratios:await ratios(pictures),mainPx:await dims(await read(f0))})}
  const opts={logo,company:profile?.name?{name:profile.name}:{},services,map,inside,all:firmOf(all,data)};
  if(fold){opts.firmPics=await firmPicsLoad(all,data,900);if(spread?.file){const s=await read(spread.file);if(s)opts.spread={...spread,src:await small(s,1400,.82),px:await dims(s)}}if(spread&&!opts.spread)opts.spread=spread;return foldBuild(objects,{...opts,screen:true})}
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
 // подгонка одного листа объекта для окна «Журнал» — как в PDF: краткая характеристика, не вместившаяся на лист объекта,
 // уходит на лист «Фото с объекта» и в окне тоже (инженер 27.11.2026 «краткая характеристика где? где теги добавляю»)
 async function fitOne(o,i=0){const a=[{...o,layout:layoutOf(o,i)}];await dropTooLong(a,{services:false,map:false});
  const r=a[0];return{sumMoved:!!r.sumMoved,fit:r.fit||0,wkMax:r.wkMax||0,galSmall:!!r.galSmall}}
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
    gals.forEach(g=>{const name=g.querySelector(".gh b")?.textContent;const i=objects.findIndex(o=>!o.galSmall&&String(o.name||"Объект")===name);
     if(i>=0&&(overflows(g.querySelector(".gt"))||overflows(g.querySelector(".gs")))){objects[i]={...objects[i],galSmall:true};changed=true}});
   }catch(_){return}finally{fr.remove()}
   if(!changed)return;
  }
 }
 const api={firmOf,firmFiles,picsFor,liveOf,foldPerObject,fitOne,hasGallery,LAY_GONE,GAL_GONE,labelsLayer,pageHtml,FOLD_PH,FOLD_PH_OBJ,FOLD_LAYOUTS,foldSketch,foldBuild,spreadHtml,SPREAD_LABELS,FOLD_OBJ,softMain,rowsOf,wkShown,wkRest,GALLERIES,galleryOf,layoutSketch,gallerySketch,MAX_PHOTOS,LAYOUT_MAX,capOf,clientList,mapPage,geoGroups,dropTooLong,build,make,preview,totals,doneOf,parties,COMPANY,LAYOUTS,layoutOf,thumb,read,pickDefault};
 if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.irBooklet=api;
})(typeof window!=="undefined"?window:globalThis);
