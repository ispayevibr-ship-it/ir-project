"use strict";
/*
 * IR Project montage scheme: the only view, Three.js 3D. The page owns the data, filters, cuts and the details
 * panel; this viewer draws the members, labels, grid dimensions and colour legend, and places new members
 * by clicking grid nodes or existing members. Every write goes through the page (quota and bounds checks).
 */
window.irThreeSchemeView=(function(){
 var token=0,active=null,loadPromise=null,cameraMemory={};
 // Bundled with the app (works offline); the CDN is only a fallback for an incomplete hot update.
 var sources=[
  ["./vendor/three/three.min.js","https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js"],
  ["./vendor/three/OrbitControls.js","https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js"]
 ];
 function include(urls,index){
  index=index||0;
  return new Promise(function(resolve,reject){
   var node=document.createElement("script");node.src=urls[index];node.async=true;
   node.onload=function(){resolve()};
   node.onerror=function(){
    node.remove();
    if(index+1<urls.length)include(urls,index+1).then(resolve,reject);
    else reject(new Error("Не удалось загрузить Three.js."))
   };
   document.head.appendChild(node)
  })
 }
 function ensure(){
  // Three.js may be on the page already (an exported scheme): the sortament tables are still needed.
  if(window.THREE&&window.THREE.OrbitControls)return loadSections();
  if(!loadPromise)loadPromise=Promise.resolve().then(function(){
   return window.THREE?null:include(sources[0])
  }).then(function(){
   return window.THREE&&window.THREE.OrbitControls?null:include(sources[1])
  }).then(function(){
   if(!window.THREE||!window.THREE.OrbitControls)throw new Error("Three.js или управление камерой недоступны.");
   return loadSections()
  }).catch(function(e){loadPromise=null;throw e});
  return loadPromise
 }
 function escapeHtml(value){
  return String(value==null?"":value).replace(/[&<>"']/g,function(ch){
   return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]
  })
 }
 var groups={
  columns:["Колонны",0x2563eb],fahwerk:["Фахверки",0x8b40de],girders:["Ригели",0xf07818],
  beams:["Балки",0x008c86],purlins:["Прогоны",0x009fce],ties:["Связи",0xdd9b13],
  spacers:["Распорки",0xcf5b32],posts:["Стойки",0x87951e],trusses:["Фермы",0x994bdb],
  stairs:["Лестницы",0x526dbe],tanks:["Резервуар",0x7f9bb8],bottom:["Днище",0x6b7f95],roof:["Крыша",0x008c86],nozzles:["Патрубки, люки",0xc0392b],guards:["Ограждения",0x7590a8],platforms:["Площадки",0x8c99b8],other:["Прочее",0x586e84]
 };
 // Every group of the catalog of structure types has its colour and name in the legend.
 (window.irStructureTypes?.GROUPS||[]).forEach(function(g){if(!groups[g.key])groups[g.key]=[g.label,g.color]});
 var statusColors={mounted:[0x159b65,"Смонтировано"],partial:[0xe09b00,"Частично"],planned:[0xc47a7a,"Не смонтировано"]};
 // How fully the reading of the drawings determined an element (src/ai-montage.js). The preliminary ones (not confirmed
 // or computed) are drawn pale in every colouring: placed all the same, to be edited by the engineer.
 var instanceColors={confirmed:[0x159b65,"Подтверждено"],computed:[0x2f6fd6,"Вычислено"],partial:[0xe09b00,"Частично"],ambiguous:[0x8b40de,"Неоднозначно"],
  conflict:[0xd03a2f,"Конфликт данных"],not_found:[0x7a8796,"Нет в новом анализе"],none:[0x586e84,"Без оценки"]};
 function instanceKey(c){return instanceColors[c.instance_status]&&c.instance_status!=="none"?c.instance_status:"none"}
 var COLOR_MODES=["status","type","mark","confidence"];
 var backgrounds={standard:0xdfe8f3,white:0xffffff,gray:0xd9dde2,blue:0xd6e6f6,sand:0xefe6d6,dark:0x1d2733};
 var kindNames={column:"колонна",beam:"балка",bent:"ломаная балка",brace:"связь",truss:"ферма",shell:"стенка резервуара",plate:"днище / площадка"};
 function kind(member){
  var key=String(member.scheme_group||member.schemeGroup||"").toLowerCase();
  return groups[key]?key:(member.geometryType==="column"?"columns":member.geometryType==="brace"?"ties":"beams")
 }
 function number(v){var n=Number(v);return Number.isFinite(n)?n:0}
 function fmt(v){return Math.round(number(v)).toLocaleString("ru-RU")}
 function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)}
 function hsvMark(T,key){
  var h=2166136261;for(var ch of String(key)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)}
  return new T.Color().setHSL(((h>>>0)*.6180339887)%1,.82,.40).getHex()
 }
 // Rolled sections from the global knowledge base (knowledge/global, confirmed rows only): a member whose profile is
 // found is drawn by its real section; the rest keep a conventional one and are counted as such.
 var sections=new Map(),sectionsPromise=null;
 var CATALOGS=["profiles-ibeams","profiles-ibeams-parallel","profiles-ibeams-26020","profiles-ibeams-19425","profiles-channels","profiles-channels-19425",
  "profiles-channels-bent-8278","profiles-channels-bent-8281","profiles-angles","profiles-angles-unequal","profiles-angles-bent-19771","profiles-angles-bent-19772","profiles-box-30245","pipes",
  "profiles-pipes-square-8639","profiles-pipes-rect-8645","profiles-pipes-32931","profiles-lipped-8282","profiles-hat-8283","profiles-z-13229","bars"];
 function loadSections(){
  // An exported scheme carries the rows it needs (a file opened from the disk cannot fetch the tables).
  if(!sectionsPromise&&Array.isArray(window.irSchemeSections)){window.irSchemeSections.forEach(function(r){if(r&&r.id)sections.set(r.id,r)});sectionsPromise=Promise.resolve()}
  if(!sectionsPromise)sectionsPromise=Promise.all(CATALOGS.map(function(name){
   return fetch("../knowledge/global/"+name+".json").then(function(r){return r.ok?r.json():{records:[]}}).catch(function(){return{records:[]}})
  })).then(function(list){
   list.forEach(function(d){(d.records||[]).forEach(function(r){if(r.status==="confirmed")sections.set(r.id,r)})})
  });
  return Promise.all([sectionsPromise,loadFasteners(),loadJointKb()])
 }
 // The catalog of mounting joints (knowledge/global/joints.json, connections.json; src/ai-joint-catalog.js): the type of a
 // node of the scheme, its parts and rules by the norms, the state of the family and its sources. An exported scheme
 // carries the families (window.irSchemeJointKb).
 var jointKb=null,jointKbData=null,jointKbPromise=null;
 function loadJointKb(){
  if(jointKbPromise)return jointKbPromise;
  var lib=window.irJointCatalog;if(!lib)return jointKbPromise=Promise.resolve();
  var use=function(d){jointKbData=d;jointKb=d&&d.families&&d.families.length?lib.create(d):null};
  if(window.irSchemeJointKb&&window.irSchemeJointKb.families){use(window.irSchemeJointKb);return jointKbPromise=Promise.resolve()}
  var get=function(name){return fetch("../knowledge/global/"+name+".json").then(function(r){return r.ok?r.json():null}).catch(function(){return null})};
  return jointKbPromise=Promise.all([get("connections"),get("joints")]).then(function(r){use(lib.slim(r[0]||{records:[]},r[1]||{}))})
 }
 function jointKbRows(){return loadJointKb().then(function(){return jointKbData||{families:[],groups:[]}})}
 // Bolts, nuts and washers of the joints by their standards (knowledge/global/fasteners.json, confirmed rows only):
 // bolt ГОСТ 7798 (S, k), nut ГОСТ 5915 (S, m), washer ГОСТ 11371 (d2, s), thread pitch from the bolt rows that give it.
 var fasteners=new Map(),fastenersPromise=null;
 function fastenerKey(r){
  if(r.kind==="bolt"&&r.standard==="ГОСТ 7798-70")return"bolt:"+r.d_mm;
  if(r.kind==="nut"&&r.standard==="ГОСТ 5915-70")return"nut:"+r.d_mm;
  if(r.kind==="washer"&&r.standard==="ГОСТ 11371-78")return"washer:"+r.d_mm;
  if(r.kind==="bolt"&&r.pitch_mm>0)return"pitch:"+r.d_mm;
  return""
 }
 function loadFasteners(){
  if(!fastenersPromise&&Array.isArray(window.irSchemeFasteners)){window.irSchemeFasteners.forEach(function(r){var k=r&&fastenerKey(r);if(k&&!fasteners.has(k))fasteners.set(k,r)});fastenersPromise=Promise.resolve()}
  if(!fastenersPromise)fastenersPromise=fetch("../knowledge/global/fasteners.json").then(function(r){return r.ok?r.json():{records:[]}}).catch(function(){return{records:[]}}).then(function(d){
   // The thread pitch is the standard's own (ГОСТ 24705) even in a row whose other sizes are still to be checked.
   (d.records||[]).forEach(function(r){var k=fastenerKey(r);if(k&&(r.status==="confirmed"||k.indexOf("pitch:")===0)&&!fasteners.has(k))fasteners.set(k,r)})
  });
  return fastenersPromise
 }
 // The rows for an exported scheme.
 function fastenerRows(){
  return loadFasteners().then(function(){var out=[];fasteners.forEach(function(r){var o={};
   ["id","kind","standard","d_mm","S_mm","k_mm","m_mm","d2_mm","s_mm","pitch_mm","status"].forEach(function(k){if(r[k]!=null)o[k]=r[k]});out.push(o)});return out})
 }
 // How drawings write a section → {shape, h, b, s, t (mm), std}; null when it is not known. `standard` — the one the
 // sheet cites: «30Ш2» of ГОСТ 26020-83 is not «30Ш2» of ГОСТ Р 57837, so only that one; without it 57837 first, then
 // 26020 (ДБ, ДШ, 100Б).
 function sectionOf(text,standard){
  var t=String(text||"").replace(/\s+/g,"").replace(/[хХ×*]/g,"x").replace(/,/g,"."),m,r;
  // A welded section from the «Ведомость элементов»: «Сварной −20×380, −25×290» — the flange plate first, the web
  // second (thickness × width). A web far taller than the flange is not read as an I (the parts are not that).
  // A strip «−150×4» (the toe board of a railing), «−20×380»: a solid bar standing on its edge, the wider side upright.
  if((m=/^(?:[−-]|Полоса|Пол\.?)(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(t))){var pw=Math.max(+m[1],+m[2]),pt=Math.min(+m[1],+m[2]);return{shape:"plate",h:pw,b:pt,s:pt,t:pt,std:"полоса по обозначению"}}
  if((m=/^Сварной[−-](\d+)x(\d+)\.[−-](\d+)x(\d+)/.exec(t))){
   var tf=+m[1],bf=+m[2],tw=+m[3],hw=+m[4];
   if(hw+2*tf<=4*bf&&tw<bf/3)return{shape:"ibeam",h:hw+2*tf,b:bf,s:tw,t:tf,std:"сварное сечение по ведомости элементов"};
   return null
  }
  // «10У» in a «Сечение» column is a channel; «2L80х6» is drawn by one angle of the pair.
  if(/^\d+(?:\.5)?а?[УПЭЛ]$/.test(t))t="["+t;
  if((m=/^2([L∟\[].+)$/.exec(t)))t=m[1];
  // «Балка 20 К1», «Балка 24 М» — as a price list or a specification writes them; a bare «Балка 20» under ГОСТ 26020/57837 is not ГОСТ 8239.
  if((m=/^(?:I|І|Двутавр|Дв\.?|Балка)(\d{2})$/i.exec(t))&&!(/^Балка/i.test(t)&&/26020|57837/.test(standard||""))&&(r=sections.get("ibeam-8239-"+m[1])))return{shape:"ibeam",h:r.h_mm,b:r.b_mm,s:r.s_mm,t:r.t_mm,r:root(r),std:r.standard};
  if((m=/^(?:I|І|Двутавр|Дв\.?|Балка)?(\d{2,3})(ДБ|ДШ|[БШКбшкKk])(\d+(?:\.5)?)$/.exec(t))){
   var key=m[1]+({K:"К",k:"К",б:"Б",ш:"Ш",к:"К"}[m[2]]||m[2])+m[3],order=/26020/.test(standard||"")?["26020"]:/57837/.test(standard||"")?["57837"]:["57837","26020"];
   for(var i=0;i<order.length&&!r;i++)r=sections.get("ibeam-"+order[i]+"-"+key);
   if(r)return{shape:"ibeam",h:r.h_mm,b:r.b_mm,s:r.s_mm,t:r.t_mm,r:root(r),std:r.standard}
  }
  // An I-beam М of ГОСТ 19425-74 (monorail, hoist track): «24М», «I30М».
  if((m=/^(?:I|І|Двутавр|Дв\.?|Балка)?(\d{2})[МM]$/.exec(t))&&(r=sections.get("ibeam-19425-"+m[1]+"М")))return{shape:"ibeam",h:r.h_mm,b:r.b_mm,s:r.s_mm,t:r.t_mm,r:root(r),std:r.standard};
  // A special channel С of ГОСТ 19425-74: «18С», «[20С».
  if((m=/^(?:\[|Швеллер|Шв\.?)?(\d{2})[СC]([аa]?)$/.exec(t))&&(r=sections.get("channel-19425-"+m[1]+"С"+(m[2]?"а":""))))return{shape:"channel",h:r.h_mm,b:r.b_mm,s:r.s_mm,t:r.t_mm,r:root(r),std:r.standard};
  // Bent sections drawn by their bend: the wall all round, the outer corner rounded by R + s, the inner by R (the radius of
  // the table). A bent channel «[160×60×4» (ГОСТ 8278-83, table 1, else table 2; a size in neither — by designation,
  // square corners), an unequal one «[160×80×50×5» (ГОСТ 8281-80), a bent angle «Уголок гнутый 80×4» (ГОСТ 19771/19772-93).
  if((m=/^(?:\[|Швеллер(?:гнутый)?(?:неравнополочный)?|Шв\.?(?:гн\.?)?)(\d{2,3})x(\d{2,3})x(\d{2,3})x(\d+(?:\.\d+)?)$/i.exec(t))){
   var k4=+m[1]+"x"+Math.max(+m[2],+m[3])+"x"+Math.min(+m[2],+m[3])+"x"+Number(m[4]);r=sections.get("channel-8281-"+k4)||sections.get("channel-8281-"+k4+"-t2");
   if(r)return{shape:"channel",bent:true,h:r.h_mm,b:r.b_mm,b1:r.b1_mm,s:r.s_mm,t:r.s_mm,r:number(r.R_mm),std:r.standard}
  }
  if((m=/^(?:\[|Швеллер(?:гнутый)?|Шв\.?(?:гн\.?)?)(\d{2,3})x(\d{2,3})x(\d+(?:\.\d+)?)$/i.exec(t))&&+m[3]<+m[2]/2){
   var k3="channel-8278-"+(+m[1])+"x"+(+m[2])+"x"+Number(m[3]);r=sections.get(k3)||sections.get(k3+"-t2");
   if(r)return{shape:"channel",bent:true,h:r.h_mm,b:r.b_mm,s:r.s_mm,t:r.s_mm,r:number(r.R_mm),std:r.standard};
   return{shape:"channel",h:+m[1],b:+m[2],s:+m[3],t:+m[3],r:0,std:"ГОСТ 8278-83 по обозначению"}
  }
  if(/гн|гнут/i.test(t)&&(m=/^(?:L|∟|Уголок|Уг\.?)(?:гнутый|гн\.?)?(\d+)x(\d+)(?:x(\d+(?:\.\d+)?))?(?:гн\.?)?$/i.exec(t))){
   r=m[3]&&m[1]!==m[2]?sections.get("angle-19772-"+Math.max(+m[1],+m[2])+"x"+Math.min(+m[1],+m[2])+"x"+Number(m[3])):sections.get("angle-19771-"+Number(m[1])+"x"+Number(m[3]||m[2]));
   if(r)return{shape:"angle",bent:true,h:r.B_mm||r.b_mm,b:r.b_mm,s:r.t_mm,t:r.t_mm,r:number(r.R_mm),std:r.standard};
   return null
  }
  if((m=/^(?:\[|Швеллер|Шв\.?)(\d+(?:\.5)?а?)([УПЭЛ])$/i.exec(t))&&(r=sections.get("channel-"+m[1].toLowerCase()+m[2].toUpperCase())))return{shape:"channel",h:r.h_mm,b:r.b_mm,s:r.s_mm,t:r.t_mm,r:root(r),std:r.standard};
  if((m=/^(?:L|∟|Уголок|Уг\.?)(\d+)x(\d+)(?:x(\d+(?:\.\d)?))?$/i.exec(t))&&(!m[3]||m[1]===m[2])&&(r=sections.get("angle-"+m[1]+"x"+Number(m[3]||m[2]))))return{shape:"angle",h:r.b_mm,b:r.b_mm,s:r.t_mm,t:r.t_mm,r:root(r),std:r.standard};
  // Unequal legs «L63x40x5»: h — the long leg, b — the short one.
  if((m=/^(?:L|∟|Уголок|Уг\.?)(\d+)x(\d+)x(\d+(?:\.\d)?)$/i.exec(t))&&(r=sections.get("angle-"+Number(m[1])+"x"+Number(m[2])+"x"+Number(m[3]))))return{shape:"angle",h:r.B_mm,b:r.b_mm,s:r.t_mm,t:r.t_mm,r:root(r),std:r.standard};
  // A C-shaped bent section with lips «С-образный 160×60×32×4» (ГОСТ 8282-83), a hat «Профиль корытный 80×60×32×3» (ГОСТ
  // 8283-93: the web h, the walls b, the flanges a turned out), a Z «Профиль Z 200×60×5» (ГОСТ 13229-78) — by their tables.
  if((m=/^(?:Профиль)?(?:гнутый)?(С-?образный|корытный|C|С)?(?:профиль)?(\d{2,3})x(\d{2,3})x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(t))&&(m[1]||/8282|8283/.test(standard||""))){
   var k4b=+m[2]+"x"+(+m[3])+"x"+Number(m[4])+"x"+Number(m[5]),hat=/корыт/i.test(m[1]||"")||!m[1]&&/8283/.test(standard||"");
   r=hat?sections.get("hat-8283-"+k4b)||sections.get("hat-8283-"+k4b+"-t2"):sections.get("lipped-8282-"+k4b);
   return r?{shape:hat?"hat":"lipped",bent:true,h:r.h_mm,b:r.b_mm,a:r.a_mm,s:r.s_mm,t:r.s_mm,r:number(r.R_mm),std:r.standard}:null
  }
  if((m=/^(?:Профиль)?(?:гнутый)?(Z-?образный|зетовый|Z|Зет)?(?:профиль)?(\d{2,3})x(\d{2,3})x(\d+(?:\.\d+)?)$/i.exec(t))&&(m[1]||/13229/.test(standard||""))){
   var kz="z-13229-"+(+m[2])+"x"+(+m[3])+"x"+Number(m[4]);r=sections.get(kz)||sections.get(kz+"-t2");
   return r?{shape:"zed",bent:true,h:r.h_mm,b:r.b_mm,s:r.s_mm,t:r.s_mm,r:number(r.R_mm),std:r.standard}:null
  }
  // A hexagon bar «Шестигранник 22», «S22» (ГОСТ 2879-2006, across flats), a reinforcing bar «Ø12А500С», «12А400» (ГОСТ 34028).
  if((m=/^(?:Шестигранник|Шестигр\.?|S|⬡)(\d+(?:\.\d+)?)$/i.exec(t))){r=sections.get("bar-std-2879");
   return{shape:"hex",h:+m[1],b:+m[1],s:+m[1],t:+m[1],solid:true,std:r&&r.sizes_mm.indexOf(+m[1])>=0?r.standard:"шестигранник по обозначению"}}
  if((m=/^(?:Арматура|Арм\.?)?(?:Ø|ø|∅)?(\d+(?:\.\d+)?)([АA]п?\d{3,4})([СCНHЕEКKУР]*)$/.exec(t))){r=sections.get("bar-std-34028");
   return{shape:"round",h:+m[1],b:+m[1],s:+m[1]/2,t:+m[1]/2,solid:true,std:r&&r.rows.some(function(x){return x.d_mm===+m[1]})?r.standard:"арматура по обозначению"}}
  // The old classes of ГОСТ 5781-82: «Ø12 А-III», «20-А-II», «Ø10 Ас-II».
  if((m=/^(?:Арматура|Арм\.?)?(?:Ø|ø|∅)?(\d+(?:\.\d+)?)-?[АA][сc]?-?[IІV]{1,3}(?:ГОСТ.*)?$/.exec(t))){r=sections.get("bar-std-5781");
   return{shape:"round",h:+m[1],b:+m[1],s:+m[1]/2,t:+m[1]/2,solid:true,std:r&&r.rows.some(function(x){return x.d_mm===+m[1]})?r.standard:"арматура по обозначению"}}
  // A round bar (tie rod, rung): «∅16», «Ø20», «Круг 20» without a wall thickness (ГОСТ 2590-2006), wire rod «Катанка 6,5» (ГОСТ 30136-95).
  var listed=function(id,d,label){var x=sections.get(id);return x&&x.sizes_mm.indexOf(d)>=0?x.standard:label};
  if((m=/^(?:∅|Ø|ø|Круг)(\d{1,3}(?:\.\d)?)$/i.exec(t)))return{shape:"round",h:+m[1],b:+m[1],s:+m[1]/2,t:+m[1]/2,solid:true,std:listed("bar-std-2590",+m[1],"круг по обозначению")};
  if((m=/^Катанка(?:[АБВA-C]-)?(\d+(?:\.\d+)?)(?:-|$)/i.exec(t)))return{shape:"round",h:+m[1],b:+m[1],s:+m[1]/2,t:+m[1]/2,solid:true,std:listed("bar-std-30136",+m[1],"катанка по обозначению")};
  // A solid square bar «□20», «Квадрат 20» (no wall thickness: a box always has one), ГОСТ 2591-2006.
  if((m=/^(?:□|Квадрат|Кв\.)(\d{1,3})$/i.exec(t)))return{shape:"plate",h:+m[1],b:+m[1],s:+m[1],t:+m[1],std:listed("bar-std-2591",+m[1],"квадрат по обозначению")};
  // A tube is its own designation: «Тр.140х4», «Труба 159x6», «Ø273х8» (round), «Гн.□100х4», «□120х80х5» (box).
  if((m=/^(?:Тр\.?|Труба|Ø|ø)(ВГП)?((?:[ЦРМНДП]-)*)(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(t))){
   // A water-gas pipe (ГОСТ 3262-75) is written by its conditional pass: «Труба 20×2,8» of the sheet citing 3262, «Труба
   // ВГП Ц-20х2,8» — Ду 20, D = 26,8.
   if(m[1]||m[2]||/3262/.test(standard||"")){
    var vgp=null;["pipe-std-3262","pipe-std-3262-t2"].forEach(function(id){var x=sections.get(id);(x&&x.rows||[]).forEach(function(row){
     if(!vgp&&(row.DN===+m[3]||row.D_mm===+m[3])&&["light","light_alt","ordinary","reinforced"].some(function(k){return row[k]&&row[k][0]===+m[4]}))vgp=row})});
    if(vgp)return{shape:"round",h:vgp.D_mm,b:vgp.D_mm,s:+m[4],t:+m[4],std:"ГОСТ 3262-75"}
   }
   // The sortament whose lists hold both sizes (the one the sheet cites first): ГОСТ 10704-91, ГОСТ 8732-78, ГОСТ 8734-75.
   var pipeStd=["pipe-std-8732","pipe-std-10704","pipe-std-8734"].map(function(id){return sections.get(id)}).filter(function(x){
    return x&&x.diameters_mm.indexOf(+m[3])>=0&&x.thicknesses_mm.indexOf(+m[4])>=0}).sort(function(a,b){
    return (String(standard||"").indexOf(a.standard.slice(5,9))>=0?0:1)-(String(standard||"").indexOf(b.standard.slice(5,9))>=0?0:1)})[0];
   return{shape:"round",h:+m[3],b:+m[3],s:+m[4],t:+m[4],std:pipeStd?pipeStd.standard:"по обозначению"}
  }
  // A box: a bent closed one of ГОСТ 30245-2003 «Гн.□100х4», «□120х80х5», «Профиль 120х80х5», a square or rectangular tube of
  // ГОСТ 8639-82, 8645-68, 32931-2015 «Труба 100х100х6», «Тр.кв.100х6», «Труба прямоугольная 120х80х5». The table of the cited
  // standard (a «Труба» — the tubes first, the rest — the boxes first) gives the corner; a size the cited standard has not — the
  // row of another table; ГОСТ 32931-2015 out of its table — by its rule (1,5s up to 2,5; 2s; 2,5s; 3s); a size in no table — by
  // designation, square corners.
  if((m=/^(Гн\.?|Профиль(?:гнутый)?(?:замкнутый)?|Труба(?:профильная)?(?:квадратная|прямоугольная)?|Тр\.?(?:проф\.?)?(?:кв\.?|пр\.?)?)?(□)?(\d+)(?:x(\d+))?x(\d+(?:\.\d+)?)$/i.exec(t))&&
   (m[2]||/Гн|Профиль/i.test(m[1]||"")||/^Тр/i.test(t)&&(m[4]||/кв|квадрат|прям|проф/i.test(m[1])))){
   var bh=+m[3],bb=+(m[4]||m[3]),bs=Number(m[5]),hbs=Math.max(bh,bb)+"x"+Math.min(bh,bb)+"x"+bs,std=String(standard||"");
   var tube=function(){return bh===bb?sections.get("pipe-sq-8639-"+bh+"x"+bs):sections.get("pipe-rect-8645-"+hbs)},box=function(){return sections.get("box-30245-"+hbs)};
   var tube32931=function(){return sections.get("pipe-32931-"+hbs)};
   if(/32931/.test(std)){r=tube32931();return{shape:"box",h:bh,b:bb,s:bs,t:bs,r:r?number(r.R_mm):bs<=2.5?1.5*bs:bs<=6?2*bs:bs<=10?2.5*bs:3*bs,std:r?r.standard:"ГОСТ 32931-2015 по обозначению"}}
   var order=/30245/.test(std)?[box]:/8639|8645/.test(std)?[tube]:/^Тр/i.test(t)?[tube,tube32931,box]:[box,tube32931,tube];
   r=null;for(var bi=0;bi<order.length&&!r;bi++)r=order[bi]();
   if(r)return{shape:"box",h:bh,b:bb,s:bs,t:bs,r:number(r.R_mm),std:r.standard};
   // A price list writes every profile tube «ГОСТ 8639-82»: the size it has not is drawn by the table that has it.
   order=[tube,tube32931,box];for(bi=0;bi<order.length&&!r;bi++)r=order[bi]();
   return{shape:"box",h:bh,b:bb,s:bs,t:bs,r:r?number(r.R_mm):0,std:r?r.standard+(std?" (размера нет в "+std+")":""):"по обозначению"}
  }
  return null
 }
 // Root fillet of a rolled section (R of ГОСТ 8239, 8240, 8509; r of ГОСТ 26020 and 57837): 0 when the table has none.
 function root(r){return number(r.R_mm!=null?r.R_mm:r.r_mm)}
 function materialProfile(member){
  var source=String(member.profile_name||member.profileName||""),
   match=source.match(/(\d{2,3})\s*[КБKБШ]/i);
  var h=match?Math.max(.18,Math.min(.7,number(match[1])/100)):.32;
  var category=kind(member);
  if(category==="columns")h=Math.max(h,.36);
  if(category==="purlins")h=Math.min(h,.20);
  return [h,h*(category==="columns"?.62:.48),Math.max(.009,h*.037),Math.max(.013,h*.07)]
 }
 // The section as drawn by the sortament: root fillets between the web and the flanges (rounded box corners), so
 // that a member reads as rolled steel close up.
 function realGeometry(T,cache,sec){
  var key="real:"+sec.shape+(sec.solid?"s":"")+(sec.bent?"g"+(sec.b1||""):"")+":"+sec.h+":"+sec.b+":"+sec.s+":"+sec.t+":"+(sec.r||0)+(sec.a?":"+sec.a:"");
  if(cache.has(key))return cache.get(key);
  var h=sec.h/2000,b=sec.b/2000,w=sec.s/2000,fl=sec.t/1000,geo,shape=new T.Shape(),rf=Math.max(0,number(sec.r)/1000),cw=true;
  if(sec.shape==="plate"){
   shape.moveTo(-b,-h);shape.lineTo(b,-h);shape.lineTo(b,h);shape.lineTo(-b,h);shape.closePath()
  }else if(sec.shape==="round"){
   var outer=sec.h/2000,hole=new T.Path();
   shape.absarc(0,0,outer,0,Math.PI*2,false);
   // A solid bar (tie rod «∅16») has no hole.
   if(!sec.solid){hole.absarc(0,0,Math.max(.001,outer-sec.s/1000),0,Math.PI*2,true);shape.holes.push(hole)}
  }else if(sec.shape==="box"){
   var hole2=new T.Path(),ws=sec.s/1000,ro=Math.min(rf,b,h),ri=Math.max(0,ro-ws);
   var rounded=function(path,x0,y0,x1,y1,r,ccw){
    var pts=ccw?[[x1,y0,-Math.PI/2,0],[x1,y1,0,Math.PI/2],[x0,y1,Math.PI/2,Math.PI],[x0,y0,Math.PI,Math.PI*1.5]]:
     [[x0,y0,Math.PI*1.5,Math.PI],[x0,y1,Math.PI,Math.PI/2],[x1,y1,Math.PI/2,0],[x1,y0,0,-Math.PI/2]];
    path.moveTo(x0+r,y0);
    pts.forEach(function(q){var cx=q[0]+(q[0]===x0?r:-r),cy=q[1]+(q[1]===y0?r:-r);if(r>0)path.absarc(cx,cy,r,q[2],q[3],!ccw);else path.lineTo(q[0],q[1])})
   };
   rounded(shape,-b,-h,b,h,ro,true);rounded(hole2,-b+ws,-h+ws,b-ws,h-ws,ri,false);shape.holes.push(hole2)
  }else if(sec.shape==="channel"&&sec.bent){
   // A bent channel: web on the left, the top flange b, the bottom one b1 (= b for an equal one); bends round.
   var H=sec.h/2000,bt=sec.b/1000,bb=(sec.b1||sec.b)/1000,st=sec.s/1000,x0=-Math.max(bt,bb)/2,ri=Math.max(0,number(sec.r)/1000),ro=ri+st;
   shape.moveTo(x0+bt,H);shape.lineTo(x0+ro,H);shape.absarc(x0+ro,H-ro,ro,Math.PI/2,Math.PI,false);shape.lineTo(x0,-H+ro);
   shape.absarc(x0+ro,-H+ro,ro,Math.PI,Math.PI*1.5,false);shape.lineTo(x0+bb,-H);shape.lineTo(x0+bb,-H+st);shape.lineTo(x0+ro,-H+st);
   if(ri>0)shape.absarc(x0+ro,-H+ro,ri,Math.PI*1.5,Math.PI,true);else shape.lineTo(x0+st,-H+st);
   shape.lineTo(x0+st,H-ro);if(ri>0)shape.absarc(x0+ro,H-ro,ri,Math.PI,Math.PI/2,true);else shape.lineTo(x0+st,H-st);
   shape.lineTo(x0+bt,H-st);shape.closePath()
  }else if(sec.shape==="lipped"||sec.shape==="hat"||sec.shape==="zed"){
   // Along the middle line: runs between the bends k = R + s from the outer faces, bends of radius R + s/2.
   var Sm=sec.s/1000,k=number(sec.r)/1000+Sm,rm=k-Sm/2,Hh=sec.h/1000,Bb=sec.b/1000,Aa=number(sec.a)/1000;
   if(sec.shape==="lipped")stripShape(shape,[Bb/2-Sm/2,Hh/2-Aa,Math.PI/2],[["L",Aa-k],["A",rm,1],["L",Bb-2*k],["A",rm,1],["L",Hh-2*k],["A",rm,1],["L",Bb-2*k],["A",rm,1],["L",Aa-k]],Sm);
   else if(sec.shape==="hat")stripShape(shape,[Bb/2-Sm/2,Hh/2+Aa-Sm,-Math.PI/2],[["L",Aa-k],["A",rm,-1],["L",Bb-2*k],["A",rm,1],["L",Hh-2*k],["A",rm,1],["L",Bb-2*k],["A",rm,-1],["L",Aa-k]],Sm);
   else stripShape(shape,[Bb-Sm/2,Hh/2-Sm/2,Math.PI],[["L",Bb-k],["A",rm,1],["L",Hh-2*k],["A",rm,-1],["L",Bb-k]],Sm)
  }else if(sec.shape==="hex"){
   // Across flats d: the flats up and down.
   var hr=sec.h/1000/Math.sqrt(3);for(var hi=0;hi<6;hi++){var ha=hi*Math.PI/3;hi?shape.lineTo(hr*Math.cos(ha),hr*Math.sin(ha)):shape.moveTo(hr,0)}shape.closePath()
  }else if(sec.shape==="angle"&&sec.bent){
   // A bent angle: the heel rounded outside by R + t and inside by R.
   var lg=sec.h/1000,lg2=sec.b/1000,tb=sec.t/1000,rib=Math.max(0,number(sec.r)/1000),rob=rib+tb;
   shape.moveTo(rob,0);shape.lineTo(lg2,0);shape.lineTo(lg2,tb);shape.lineTo(rob,tb);
   if(rib>0)shape.absarc(rob,rob,rib,Math.PI*1.5,Math.PI,true);else shape.lineTo(tb,tb);
   shape.lineTo(tb,lg);shape.lineTo(0,lg);shape.lineTo(0,rob);shape.absarc(rob,rob,rob,Math.PI,Math.PI*1.5,false);shape.closePath()
  }else if(sec.shape==="channel"){
   // Web on the left, flanges to the right.
   var wx=-b+2*w,rc=Math.min(rf,b-2*w,h-fl);
   shape.moveTo(-b,-h);shape.lineTo(b,-h);shape.lineTo(b,-h+fl);shape.lineTo(wx+rc,-h+fl);
   shape.absarc(wx+rc,-h+fl+rc,rc,Math.PI*1.5,Math.PI,cw);shape.lineTo(wx,h-fl-rc);
   shape.absarc(wx+rc,h-fl-rc,rc,Math.PI,Math.PI/2,cw);shape.lineTo(b,h-fl);shape.lineTo(b,h);shape.lineTo(-b,h);shape.closePath()
  }else if(sec.shape==="angle"){
   var leg=sec.h/1000,leg2=sec.b/1000,th=sec.t/1000,ra=Math.min(rf,leg2-th,leg-th);
   shape.moveTo(0,0);shape.lineTo(leg2,0);shape.lineTo(leg2,th);shape.lineTo(th+ra,th);
   shape.absarc(th+ra,th+ra,ra,Math.PI*1.5,Math.PI,cw);shape.lineTo(th,leg);shape.lineTo(0,leg);shape.closePath()
  }else{
   var ri2=Math.min(rf,b-w,h-fl);
   shape.moveTo(-b,-h);shape.lineTo(b,-h);shape.lineTo(b,-h+fl);shape.lineTo(w+ri2,-h+fl);
   shape.absarc(w+ri2,-h+fl+ri2,ri2,Math.PI*1.5,Math.PI,cw);shape.lineTo(w,h-fl-ri2);
   shape.absarc(w+ri2,h-fl-ri2,ri2,Math.PI,Math.PI/2,cw);shape.lineTo(b,h-fl);
   shape.lineTo(b,h);shape.lineTo(-b,h);shape.lineTo(-b,h-fl);shape.lineTo(-w-ri2,h-fl);
   shape.absarc(-w-ri2,h-fl-ri2,ri2,Math.PI/2,0,cw);shape.lineTo(-w,-h+fl+ri2);
   shape.absarc(-w-ri2,-h+fl+ri2,ri2,0,-Math.PI/2,cw);shape.lineTo(-b,-h+fl);shape.closePath()
  }
  geo=new T.ExtrudeGeometry(shape,{depth:1,steps:1,bevelEnabled:false,curveSegments:sec.shape==="round"?16:rf>0?5:1});
  geo.computeVertexNormals();cache.set(key,geo);return geo
 }
 // A bent open section by its middle line: from the start [x, y, heading] straight runs ["L", length] and 90° bends
 // ["A", radius of the middle, +1 left / −1 right]; the wall s on both sides of the line.
 function stripShape(shape,start,segs,s){
  var x=start[0],y=start[1],a=start[2],pts=[[x,y,a]];
  segs.forEach(function(g){
   if(g[0]==="L"){x+=Math.cos(a)*Math.max(0,g[1]);y+=Math.sin(a)*Math.max(0,g[1]);pts.push([x,y,a]);return}
   var r=g[1],turn=g[2],cx=x+Math.cos(a+turn*Math.PI/2)*r,cy=y+Math.sin(a+turn*Math.PI/2)*r,a0=Math.atan2(y-cy,x-cx);
   for(var i=1;i<=6;i++){var q=a0+turn*Math.PI/2*i/6;pts.push([cx+r*Math.cos(q),cy+r*Math.sin(q),a+turn*Math.PI/2*i/6])}
   a+=turn*Math.PI/2;x=pts[pts.length-1][0];y=pts[pts.length-1][1]
  });
  var out=pts.map(function(p){return[p[0]-Math.sin(p[2])*s/2,p[1]+Math.cos(p[2])*s/2]}).concat(pts.map(function(p){return[p[0]+Math.sin(p[2])*s/2,p[1]-Math.cos(p[2])*s/2]}).reverse());
  shape.moveTo(out[0][0],out[0][1]);for(var j=1;j<out.length;j++)shape.lineTo(out[j][0],out[j][1]);shape.closePath()
 }
 function addGeometry(T,cache,member){
  var sec=sectionOf(member.profile_name||member.profileName,member.profile_standard);
  if(sec)return realGeometry(T,cache,sec);
  var section=String(member.section_type||"").toLowerCase(),category=kind(member);
  var style=section==="round"||category==="ties"&&String(member.profile_name||"").match(/труб|ø|Ø/i)?"round":
   section==="square"||section==="box"?"box":"ibeam";
  var dimensions=materialProfile(member),key=style+":"+category+":"+dimensions[0].toFixed(2);
  if(cache.has(key))return cache.get(key);
  var geo;
  if(style==="round"){
   geo=new T.CylinderGeometry(Math.max(.025,dimensions[0]/6),Math.max(.025,dimensions[0]/6),1,10);
   geo.rotateX(Math.PI/2);geo.translate(0,0,.5)
  }else if(style==="box"){
   geo=new T.BoxGeometry(dimensions[1],dimensions[0],1);geo.translate(0,0,.5)
  }else{
   var h=dimensions[0]/2,b=dimensions[1]/2,w=dimensions[2]/2,fl=dimensions[3],
    shape=new T.Shape();
   shape.moveTo(-b,-h);shape.lineTo(b,-h);shape.lineTo(b,-h+fl);
   shape.lineTo(w,-h+fl);shape.lineTo(w,h-fl);shape.lineTo(b,h-fl);
   shape.lineTo(b,h);shape.lineTo(-b,h);shape.lineTo(-b,h-fl);
   shape.lineTo(-w,h-fl);shape.lineTo(-w,-h+fl);shape.lineTo(-b,-h+fl);shape.closePath();
   geo=new T.ExtrudeGeometry(shape,{depth:1,steps:1,bevelEnabled:false,curveSegments:1})
  }
  geo.computeVertexNormals();cache.set(key,geo);return geo
 }
 function gridKey(props){
  return JSON.stringify([props.objectId,props.axesX,props.axesY,props.gridX,props.gridY,props.spanX,props.spanY,props.gridDirX,props.gridDirY])
 }
 function dispose(){
  token++;
  if(active){active.dispose();active=null}
 }
 // Same grid on the same host: only the members and annotations change, the camera stays where it is.
 function render(host,props){
  var key=gridKey(props);
  if(active&&active.host===host&&active.key===key&&host.isConnected){active.update(props);return}
  // The page redrew itself and gave a new box for the same scheme: the built model moves there (no rebuild, no new WebGL).
  if(active&&active.key===key&&active.host!==host&&!active.host.isConnected&&host.isConnected&&active.root){
   host.innerHTML="";host.appendChild(active.root);active.host=host;active.update(props);return
  }
  dispose();
  var myToken=token;
  host.innerHTML='<div class="ir-three-loading" role="status"><strong>Подготавливаем 3D…</strong><span>Строим модель монтажной схемы</span></div>';
  ensure().then(function(){
   if(myToken!==token||!host.isConnected)return;
   active=createViewer(host,props,key);
   if(myToken!==token){active.dispose();active=null}
  }).catch(function(error){
   if(myToken!==token||!host.isConnected)return;
   host.innerHTML='<div class="ir-three-loading ir-three-error" role="alert"><strong>3D не загрузился</strong><span>'+
    escapeHtml(error.message||error)+'</span><small>Переустановите программу или проверьте обновление.</small></div>';
   props.onFirstPaint&&props.onFirstPaint()
  })
 }
 function call(name){
  var args=Array.prototype.slice.call(arguments,1);
  return active&&active[name]?active[name].apply(null,args):undefined
 }
 function softwareGl(){
  try{var c=document.createElement("canvas"),gl=c.getContext("webgl");if(!gl)return true;var x=gl.getExtension("WEBGL_debug_renderer_info");
   var name=String(gl.getParameter(x?x.UNMASKED_RENDERER_WEBGL:gl.RENDERER)||"");var lose=gl.getExtension("WEBGL_lose_context");lose&&lose.loseContext();
   return/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)}catch(e){return false}
 }
 function createViewer(host,props,key){
  var T=window.THREE,P=props;
  var spanX=number(P.spanX),spanY=number(P.spanY),X=spanX/1000,Y=spanY/1000;
  var axesX=P.axesX||[],axesY=P.axesY||[],gridX=P.gridX||{},gridY=P.gridY||{};
  var dirX=P.gridDirX==="rtl"?"rtl":"ltr",dirY=P.gridDirY==="ttb"?"ttb":"btt";
  var elems=[],selected=String(P.selected||""),colorMode=COLOR_MODES.indexOf(P.colorMode)>=0?P.colorMode:"type";
  var showGrid=true,showAxes=true,hover="",alive=true,raf=0,firstPaint=false,copySource="",copyBusy=false,placing=null;
  var memoryKey=String(P.objectId||"")+"|"+key;
  // Drawing millimetres (X right, Y up the grid) ↔ world metres (x, height, z towards the viewer).
  function toWorld(x,y,z){
   return new T.Vector3((dirX==="rtl"?spanX-number(x):number(x))/1000,number(z)/1000,(dirY==="btt"?spanY-number(y):number(y))/1000)
  }
  function fromWorld(v){
   return{x:dirX==="rtl"?spanX-v.x*1000:v.x*1000,y:dirY==="btt"?spanY-v.z*1000:v.z*1000,z:v.y*1000}
  }
  function memberPoints(m){
   var hd=hangDrop&&hangDrop.get(String(m.id||""))||[0,0];
   var start=toWorld(m.x,m.y,number(m.z0)-hd[0]);
   var end=m.geometryType==="column"?toWorld(m.x,m.y,topOf(m)):m.geometryType==="shell"||m.geometryType==="plate"?toWorld(m.x,m.y,m.z2):toWorld(m.x2,m.y2,number(m.z2)-hd[1]);
   return m.geometryType==="bent"?[start,toWorld(m.mx,m.my,m.mz),end]:[start,end]
  }
  host.innerHTML='<div class="ir-three-root">'+
   '<div class="ir-three-toolbar">'+
   '<div class="ir-three-views">'+
   '<button data-three-view="iso" class="active">3D</button><button data-three-view="top">Сверху</button>'+
   '<button data-three-view="front">Фасад</button><button data-three-view="side">Сбоку</button></div>'+
   '<button id="irThreeReset" title="Вернуть исходный ракурс">⟲ Ракурс</button>'+
   '<select id="irThreeColors" data-native-select="1" aria-label="Раскраска конструкции">'+
   '<option value="type">Цвет: виды</option><option value="status">Цвет: монтаж</option><option value="mark">Цвет: марки</option><option value="confidence">Цвет: достоверность</option></select>'+
   '<label class="ir-three-check"><input type="checkbox" id="irThreeGrid" checked> Сетка</label>'+
   '<label class="ir-three-check"><input type="checkbox" id="irThreeAxes" checked> Оси</label>'+
   '<select id="irThreeNodes" data-native-select="1" aria-label="Узлы" title="Маркеры узлов: опоры колонн, оголовки, концы балок"><option value="sel">Узлы: у выбранного</option><option value="all">Узлы: все</option><option value="open">Узлы: не готовые</option><option value="off">Узлы: скрыть</option></select>'+
   '<label class="ir-three-check" title="Опорные плиты, анкеры и оголовки вблизи, краны на путях — условно, не по КМД"><input type="checkbox" id="irThreeDetails" checked> Детали</label>'+
   '<span class="ir-three-count" id="irThreeCount"></span><span class="ir-three-count" id="irThreeLight" hidden title="Окно рисует 3D без видеокарты (процессором): сечения и болты показаны только вблизи, края без сглаживания. Включите видеокарту для программы в настройках Windows («Графика» → высокая производительность) или обновите её драйвер.">· упрощённый показ: видеокарта не используется</span>'+
   (P.canEdit?'<button class="ir-three-add" id="irThreeAdd">＋ Добавить элемент</button>':"")+'</div>'+
   '<div id="irThreeCopyHint" class="ir-three-copy-hint" hidden>Щёлкните новое начало конструкции на плоскости X/Y. <button id="irThreeCancelCopy" type="button">Отмена</button></div>'+
   '<div class="ir-three-viewport" id="irThreeViewport" role="img" aria-label="Интерактивная 3D модель металлического каркаса"></div>'+
   '<div class="ir-three-axis-layer" id="irThreeAxisLayer" aria-hidden="true"></div>'+
   '<div class="ir-three-label-layer" id="irThreeLabelLayer" aria-hidden="true"></div>'+
   '<div class="ir-three-cursor" id="irThreeCursor" hidden></div>'+
   '<div class="ir-three-legend" id="irThreeLegend"></div>'+
   '<aside class="ir-three-place" id="irThreePlace" hidden></aside>'+
   '<aside class="ir-three-place ir-three-node" id="irThreeNode" hidden></aside>'+
   '<div class="ir-three-footer">ЛКМ — вращение · ПКМ — сдвиг · колесо — к точке под курсором · двойной щелчок — центр вращения · W A S D / стрелки — движение, Q E — вниз и вверх, Shift — быстрее · Esc — отмена</div></div>';
  var root=host.querySelector(".ir-three-root"),viewport=root.querySelector("#irThreeViewport"),
   axisLayer=root.querySelector("#irThreeAxisLayer"),labelLayer=root.querySelector("#irThreeLabelLayer"),
   cursor=root.querySelector("#irThreeCursor"),legend=root.querySelector("#irThreeLegend"),placePanel=root.querySelector("#irThreePlace");
  nodePanel=root.querySelector("#irThreeNode");
  var scene=new T.Scene();
  var camera=new T.PerspectiveCamera(42,1,.08,3000);
  // Without the graphics card (Windows draws WebGL by the processor: SwiftShader, «Basic Render») the picture is made
  // lighter: no smoothing of edges, fewer pixels, the sections and bolts nearer the camera only. A picture that takes
  // longer than 0.4 s three times running switches to it too.
  var light=softwareGl();
  var renderer=new T.WebGLRenderer({antialias:!light,powerPreference:"high-performance"});
  renderer.setPixelRatio(light?.75:Math.min(window.devicePixelRatio||1,1.5));renderer.outputEncoding=T.sRGBEncoding;
  viewport.appendChild(renderer.domElement);
  scene.add(new T.HemisphereLight(0xffffff,0x7a94b3,.95));
  var sun=new T.DirectionalLight(0xffffff,1.05);sun.position.set(-35,72,48);scene.add(sun);
  var fill=new T.DirectionalLight(0xc8dfff,.35);fill.position.set(45,26,-38);scene.add(fill);
  // The members are kept apart from the scene (`steel`) for picking and highlighting; the screen draws them merged into one
  // mesh per material (`batches`) — thousands of separate draws stalled the window. The selected and hovered member are
  // drawn once more over the batch (`overlay`), the base and cap details near the camera in their own group.
  var steel=new T.Group(),batches=new T.Group(),overlay=new T.Group(),detailGroup=new T.Group(),equipment=new T.Group();scene.add(batches,overlay,detailGroup,equipment);
  var ground=new T.Group();scene.add(ground);
  var dims=new T.Group();scene.add(dims);
  var helpers=new T.Group();scene.add(helpers);
  var floorMaterial=new T.MeshStandardMaterial({color:0xd0dfec,roughness:1});
  // (colours of materials are shown brighter than written — linear values: 0x030507 shows as #18212b)
  var darkFloorMaterial=new T.MeshBasicMaterial({color:0x030507});
  var floor=new T.Mesh(new T.PlaneGeometry(Math.max(X+16,24),Math.max(Y+16,24)),floorMaterial);
  floor.rotation.x=-Math.PI/2;floor.position.set(X/2,-.26,Y/2);ground.add(floor);
  // The floor grid follows the background: light lines on a light floor, dim ones on a dark floor.
  var grid=null;
  function floorGrid(dark){
   if(grid){ground.remove(grid);grid.geometry.dispose();grid.material.dispose()}
   grid=new T.GridHelper(Math.max(X,Y)+12,Math.min(80,Math.max(8,Math.ceil(Math.max(X,Y)/2))),dark?0x0c1420:0x6487a5,dark?0x05080d:0xa8bfd3);
   grid.position.set(X/2,-.23,Y/2);ground.add(grid)
  }
  floorGrid(false);
  var axisMaterial=new T.LineDashedMaterial({color:0x8fa6bb,dashSize:1.6,gapSize:.35,transparent:true,opacity:.55});
  var dimMaterial=new T.LineBasicMaterial({color:0x35556f});
  var screenTags=[];
  function addLine(group,a,b,material){
   var geo=new T.BufferGeometry().setFromPoints([a,b]),line=new T.Line(geo,material);
   if(material.isLineDashedMaterial)line.computeLineDistances();group.add(line);return line
  }
  function tag(layer,cls,text,pos,group){
   var el=document.createElement("span");el.className=cls;el.textContent=text;layer.appendChild(el);
   var t={el:el,pos:pos,group:group};screenTags.push(t);return t
  }
  // Grid lines with axis bubbles at both ends.
  var wx=function(name){return toWorld(number(gridX[name]),0,0).x},wz=function(name){return toWorld(0,number(gridY[name]),0).z};
  axesX.forEach(function(name){
   var x=wx(name);addLine(ground,new T.Vector3(x,-.19,0),new T.Vector3(x,-.19,Y),axisMaterial);
   tag(axisLayer,"ir-three-axis-label",name,new T.Vector3(x,.1,-2.4),"axes");tag(axisLayer,"ir-three-axis-label",name,new T.Vector3(x,.1,Y+4.6),"axes")
  });
  axesY.forEach(function(name){
   var z=wz(name);addLine(ground,new T.Vector3(0,-.19,z),new T.Vector3(X,-.19,z),axisMaterial);
   tag(axisLayer,"ir-three-axis-label",name,new T.Vector3(-4.6,.1,z),"axes");tag(axisLayer,"ir-three-axis-label",name,new T.Vector3(X+2.4,.1,z),"axes")
  });
  // Bay dimensions along the near X side and the left Y side, totals further out.
  function dimensionChain(points,fixed,along){
   var at=function(v,off){return along==="x"?new T.Vector3(v,-.15,fixed+off):new T.Vector3(fixed-off,-.15,v)};
   var sorted=points.slice().sort(function(a,b){return a.w-b.w});
   for(var i=0;i<sorted.length;i++){
    addLine(dims,at(sorted[i].w,-.4),at(sorted[i].w,.4),dimMaterial);
    if(i){
     addLine(dims,at(sorted[i-1].w,0),at(sorted[i].w,0),dimMaterial);
     tag(axisLayer,"ir-three-dim-label",fmt(Math.abs(sorted[i].mm-sorted[i-1].mm)),at((sorted[i-1].w+sorted[i].w)/2,.55),"dims")
    }
   }
   if(sorted.length>1){
    var a=sorted[0],b=sorted[sorted.length-1];
    addLine(dims,at(a.w,1.5),at(b.w,1.5),dimMaterial);addLine(dims,at(a.w,1.1),at(a.w,1.9),dimMaterial);addLine(dims,at(b.w,1.1),at(b.w,1.9),dimMaterial);
    tag(axisLayer,"ir-three-dim-label total",fmt(Math.abs(b.mm-a.mm))+" мм",at((a.w+b.w)/2,2.05),"dims")
   }
  }
  dimensionChain(axesX.map(function(n){return{w:wx(n),mm:number(gridX[n])}}),Y+1.6,"x");
  dimensionChain(axesY.map(function(n){return{w:wz(n),mm:number(gridY[n])}}),-1.6,"z");
  var meshGeo=new Map(),mats=new Map(),allMeshes=[],rayTargets=[],dataById=new Map(),meshesById=new Map(),labels=[];
  var selectedMat=new T.MeshStandardMaterial({color:0x1668ea,emissive:0x07396d,emissiveIntensity:.15,metalness:.25,roughness:.42,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4});
  var hoverMat=new T.MeshStandardMaterial({color:0xffad1c,emissive:0x59410e,emissiveIntensity:.10,metalness:.22,roughness:.45,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4});
  var zAxis=new T.Vector3(0,0,1),failures=0,conventional=new Set();
  function baseColor(c){
   if(colorMode==="status")return(statusColors[c.status]||statusColors.planned)[0];
   if(colorMode==="confidence")return instanceColors[instanceKey(c)][0];
   if(colorMode==="mark")return hsvMark(T,c.mark||c.mark_name||c.id);
   return(groups[kind(c)]||groups.other)[1]
  }
  function pale(c){return Boolean(c&&c.preliminary===true)}
  function baseMaterial(c){
   var color=baseColor(c),key=pale(c)?"p"+color:color;
   if(!mats.has(key))mats.set(key,pale(c)?new T.MeshStandardMaterial({color:color,metalness:.05,roughness:.8,side:T.DoubleSide,transparent:true,opacity:.36,depthWrite:false}):
    new T.MeshStandardMaterial({color:color,metalness:.13,roughness:.64,side:T.DoubleSide}));
   return mats.get(key)
  }
  var shellMats=new Map();
  function shellMaterial(c){
   var color=baseColor(c),key=pale(c)?"p"+color:color;
   if(!shellMats.has(key))shellMats.set(key,new T.MeshStandardMaterial({color:color,metalness:.1,roughness:.7,side:T.DoubleSide,transparent:true,opacity:pale(c)?.2:.42,depthWrite:false}));
   return shellMats.get(key)
  }
  // A roof shield is nearly solid: a see-through roof over a see-through wall was not seen at all.
  var roofMats=new Map();
  function roofMaterial(c){
   var color=baseColor(c),key=pale(c)?"p"+color:color;
   if(!roofMats.has(key))roofMats.set(key,new T.MeshStandardMaterial({color:color,metalness:.12,roughness:.6,side:T.DoubleSide,transparent:true,opacity:pale(c)?.36:.82,depthWrite:!pale(c)}));
   return roofMats.get(key)
  }
  // Joints of the sheets drawn on a wall course or a bottom (c.lay from the reading: sheet length, height, the shift
  // of the vertical joints of a course; sheet width and length of the bottom rows) and, in the layer of welds, the welds
  // themselves: vertical and ring seams of the wall, the seams of the bottom, the corner weld of the wall to the bottom.
  var jointMat=new T.MeshStandardMaterial({color:0x3b4552,metalness:.1,roughness:.8});
  // Shared geometries: a bar of a section t×t along +Z from 0 to 1 (stretched by scale.z), any other by its key.
  function shared(key,make){var g=meshGeo.get(key);if(!g){g=make();meshGeo.set(key,g)}return g}
  function barGeo(t){return shared("bar:"+t,function(){var g=new T.BoxGeometry(t,t,1);g.translate(0,0,.5);return g})}
  function drawJoints(c,id,weld){
   var L=c.lay||{},rr=number(c.r),z0=number(c.z0),z1=number(c.z1),t=weld?.035:.014,mat=weld?baseMaterial(c):jointMat,parts=[];
   var P=function(deg,r,z){var a=deg*Math.PI/180;return toWorld(number(c.x)+Math.cos(a)*r,number(c.y)+Math.sin(a)*r,z)};
   var bar=function(a,b){var v=b.clone().sub(a),len=v.length();if(len<.005)return;
    var m=new T.Mesh(barGeo(t),mat);m.position.copy(a);m.scale.z=len;m.quaternion.setFromUnitVectors(zAxis,v.normalize());parts.push(m)};
   var ring=function(z,r){var pts=[];for(var i=0;i<96;i++)pts.push(P(i*360/96,r,z));parts.push(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts,true),96,t/2,4,true),mat))};
   if(L.kind==="wall"||L.kind==="wall_welds"){
    var circ=2*Math.PI*rr,len=number(L.sheet_len_mm)||6000,n=Math.max(1,Math.ceil(circ/len)),off=weld?10:5;
    for(var j=0;j<n;j++){var deg=((number(L.shift_mm)+j*len)%circ)/circ*360;bar(P(deg,rr+off,z0),P(deg,rr+off,z1))}
    if(weld)ring(z1,rr+off)
   }else if(L.kind==="ring")ring(z0,rr+10);
   else if(L.kind==="bottom"||L.kind==="bottom_welds"){
    var w=number(L.sheet_w_mm)||1500,ln=number(L.sheet_len_mm)||6000,sh=number(L.shift_mm)||ln/2,zz=z1+(weld?8:4),cx=number(c.x),cy=number(c.y);
    var Q=function(x,y){return toWorld(cx+x,cy+y,zz)};
    // Rows of sheets across the bottom: their long joints, then the end joints of each row, staggered row by row.
    for(var y=-rr+w;y<rr;y+=w){var hx=Math.sqrt(rr*rr-y*y);bar(Q(-hx,y),Q(hx,y))}
    for(var y0=-rr,row=0;y0<rr;y0+=w,row++){var y1=Math.min(rr,y0+w);
     for(var x=-rr+(row%2?sh:0)+ln;x<rr;x+=ln){var lim=Math.sqrt(Math.max(0,rr*rr-x*x)),a=Math.max(y0,-lim),b=Math.min(y1,lim);if(b>a)bar(Q(x,a),Q(x,b))}}
   }
   parts.forEach(function(m){m.userData.memberId=id;steel.add(m);allMeshes.push(m);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(m)});
   return parts.length
  }
  // Plan angle (counter-clockwise from X) → angle of the cylinder geometry (x = sin θ, z = cos θ) in this view's axes.
  function planTheta(deg){var a=deg*Math.PI/180,w=toWorld(Math.cos(a),Math.sin(a),0).sub(toWorld(0,0,0));return Math.atan2(w.x,w.z)}
  // ---- Joints: members are given by their centre lines, so a beam or a brace coming to a column (or a beam framing
  // into another beam) would run into it up to its axis. Its end is cut back to the face of the member it comes to,
  // 10 mm short; a brace ends on a gusset plate (фасонка, drawn conventionally) welded to that face.
  // A column's section stands with its height along world z (the minimal turn of +Z to +Y), a horizontal beam's upright.
  function halfSection(c){
   var sec=sectionOf(c.profile_name||c.profileName,c.profile_standard);
   if(sec)return{h:sec.h/2000,b:(sec.shape==="round"?sec.h:sec.b)/2000};
   var d=materialProfile(c);return{h:d[0]/2,b:d[1]/2}
  }
  function jointHosts(list){
   var cells=new Map(),C=3,add=function(x0,z0,x1,z1,host){
    for(var i=Math.floor(Math.min(x0,x1)/C);i<=Math.floor(Math.max(x0,x1)/C);i++)for(var j=Math.floor(Math.min(z0,z1)/C);j<=Math.floor(Math.max(z0,z1)/C);j++){
     var k=i+","+j;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(host)}
   };
   list.forEach(function(c){
    if(!c.id||c.ft||c.truss||c.column&&Array.isArray(c.column.members)&&c.column.members.length)return;
    var hs=halfSection(c),p=memberPoints(c);if(p.length!==2)return;
    if(c.geometryType==="column"){
     if(p[1].y-p[0].y<.3)return;
     add(p[0].x-hs.b,p[0].z-hs.h,p[0].x+hs.b,p[0].z+hs.h,{id:String(c.id),col:true,c:p[0],y0:p[0].y,y1:p[1].y,hx:hs.b,hz:hs.h})
    }else if(c.geometryType==="beam"){
     var v=p[1].clone().sub(p[0]),L=v.length();if(L<1||Math.abs(v.y)/L>.03)return;v.divideScalar(L);
     add(p[0].x-hs.b,p[0].z-hs.b,p[1].x+hs.b,p[1].z+hs.b,{id:String(c.id),col:false,a:p[0],u:v,L:L,y:(p[0].y+p[1].y)/2,hv:hs.b,hy:hs.h})
    }
   });
   // Ends of the linear members by point (5 cm cells): where braces end together with others and nothing runs
   // through, the joint is a gusset of its own.
   var ends=new Map(),Q=function(v){return Math.round(v.x*20)+","+Math.round(v.y*20)+","+Math.round(v.z*20)};
   list.forEach(function(c){
    if(!c.id||c.ft||c.truss||c.geometryType==="column"||c.geometryType==="shell"||c.geometryType==="plate")return;
    var p=memberPoints(c);if(p.length<2)return;
    [[p[0],p[1]],[p[p.length-1],p[p.length-2]]].forEach(function(e){var v=e[1].clone().sub(e[0]);if(v.lengthSq()<1e-6)return;
     var k=Q(e[0]);if(!ends.has(k))ends.set(k,[]);ends.get(k).push({id:String(c.id),d:v.normalize(),brace:c.geometryType==="brace"||kind(c)==="ties"})})
   });
   var find=function(id,E,d){
    var best=null;(cells.get(Math.floor(E.x/C)+","+Math.floor(E.z/C))||[]).forEach(function(h){
     if(h.id===id)return;var t=Infinity,exit=function(rel,dd,half){if(Math.abs(rel)>half+.02)return-1;if(Math.abs(dd)<1e-6)return Infinity;return((dd>0?half:-half)-rel)/dd};
     if(h.col){
      if(E.y<h.y0-.05||E.y>h.y1+.05)return;
      var ex=exit(E.x-h.c.x,d.x,h.hx),ez=exit(E.z-h.c.z,d.z,h.hz);if(ex<0||ez<0)return;t=Math.min(ex,ez)
     }else{
      var r=E.clone().sub(h.a),s=r.dot(h.u);if(s<h.hv+.1||s>h.L-h.hv-.1)return;
      var vx=-h.u.z,vz=h.u.x,ev=exit(r.x*vx+r.z*vz,d.x*vx+d.z*vz,h.hv),ey=Math.abs(E.y-h.y)<h.hy-.02?exit(E.y-h.y,d.y,h.hy):-1;if(ev<0||ey<0)return;t=Math.min(ev,ey)
     }
     if(t>0&&t<Infinity&&(!best||t>best.t))best={t:t,col:h.col}
    });
    return best
   };
   find.node=function(E){var k=Q(E),list=ends.get(k);return list&&list.length>=2?{key:k,list:list}:null};
   find.made=new Set();
   return find
  }
  // Bolts of a joint as its sheet gives them (c.joint.bolt «М24», class «8.8»), each as a set by the standards: a hex
  // head (ГОСТ 7798: S, k), a washer under it (ГОСТ 11371: d2, s), the shank through the package, two nuts (ГОСТ 5915:
  // S, m) and the end of the thread two pitches out. The spring washer under the nut (ГОСТ 6402) is not drawn: its sizes
  // are not confirmed in the base. Class 8.8 dark, 5.8 light. Number and places of the bolts are of the КМД (two on a
  // gusset, four through an end plate), not of the scheme. The sets are not separate meshes: they go straight into the
  // merged picture of their cell (thousands of bolts × five parts as objects took the memory).
  var boltMats={"8.8":new T.MeshStandardMaterial({color:0x2a2e35,metalness:.45,roughness:.45}),"5.8":new T.MeshStandardMaterial({color:0x8d949c,metalness:.55,roughness:.4})};
  var boltList=[];
  function boltDia(c){var m=/(\d{2})/.exec(String(c.joint&&c.joint.bolt||""));return m&&!slight(c)?number(m[1])/1000:0}
  function boltSet(dmm){
   var b=fasteners.get("bolt:"+dmm),n=fasteners.get("nut:"+dmm),w=fasteners.get("washer:"+dmm),p=fasteners.get("pitch:"+dmm);
   return b&&n&&w&&b.S_mm&&b.k_mm&&n.S_mm&&n.m_mm&&w.d2_mm&&w.s_mm?{S:b.S_mm/1000,k:b.k_mm/1000,nS:n.S_mm/1000,m:n.m_mm/1000,d2:w.d2_mm/1000,s:w.s_mm/1000,p:p&&p.pitch_mm?p.pitch_mm/1000:0}:null
  }
  // `at` — the middle of the package, `axis` — toward the head, `grip` — the package thickness.
  function addBolt(c,at,axis,dia,grip){
   var cls=String(c.joint&&c.joint.cls||"")==="8.8"||/^(?:8\.8|10\.9|12\.9)$/.test(String(c.joint&&c.joint.cls||""))?"8.8":"5.8";
   boltList.push({id:String(c.id||""),at:at.clone(),axis:axis.clone().normalize(),d:dia,grip:grip,cls:cls})
  }
  var boltY=new T.Vector3(0,1,0);
  function boltParts(b){
   var q=new T.Quaternion().setFromUnitVectors(boltY,b.axis),set=boltSet(Math.round(b.d*1000)),out=[],u=b.axis,g=b.grip;
   var part=function(geo,along,r,h){var m=new T.Matrix4().compose(b.at.clone().add(u.clone().multiplyScalar(along)),q,new T.Vector3(r,h,r));out.push({geometry:geo,matrixWorld:m})};
   var hex=shared("bolt:hex",function(){return new T.CylinderGeometry(1,1,1,6)}),rnd=shared("bolt:round",function(){return new T.CylinderGeometry(1,1,1,12)}),rod=shared("bolt:rod",function(){return new T.CylinderGeometry(1,1,1,8)});
   if(!set){part(hex,0,b.d*.95,g+b.d*1.6);return out}
   var tail=2*(set.p||b.d*.15),nuts=2*set.m;
   part(rnd,g/2+set.s/2,set.d2/2,set.s);
   part(hex,g/2+set.s+set.k/2,set.S/Math.sqrt(3),set.k);
   part(rod,(set.s-nuts-tail)/2,b.d/2,g+set.s+nuts+tail);
   part(hex,-g/2-set.m/2,set.nS/Math.sqrt(3),set.m*.98);
   part(hex,-g/2-set.m*1.5,set.nS/Math.sqrt(3),set.m*.98);
   return out
  }
  function legT(c){var sec=sectionOf(c.profile_name||c.profileName,c.profile_standard);return sec&&sec.t?sec.t/1000:.008}
  // The gusset as thick as the notes of the sheet say («Толщину фасонок принять 10 мм»), else 12 mm (conventional).
  function gussetT(c){var g=number(c.joint&&c.joint.gusset_mm);return g>=6&&g<=40?g/1000:.012}
  // Bolts of a brace end on its gusset by the least distances of СП 16.13330 (табл. 40): the first 2,5d from the end of
  // the brace (not less than 2d along the force), the next 3d further (not less than 2,5d) — until the КМД gives its own.
  function boltRow(dia){return[2.5*dia,5.5*dia]}
  // Railings, treads and thin bars (Ø up to 60, strips) are welded: no nodes, end plates or bolts on them — a base
  // plate and a marker on every railing post hid the landings.
  function slight(c){var t=String(c.mark_name||c.title||""),sec=sectionOf(c.profile_name||c.profileName,c.profile_standard);
   return kind(c)==="guards"||/огражд|поручен|перекладин|ступен/i.test(t)||Boolean(sec&&(sec.shape==="round"&&sec.h<=60||sec.shape==="plate"))}
  function trimSegment(c,id,a,b,host,parts){
   var v=b.clone().sub(a),L=v.length();if(L<.3)return[a,b];v.divideScalar(L);
   var brace=c.geometryType==="brace"||kind(c)==="ties",ends=[[a,v],[b,v.clone().negate()]],out=[a.clone(),b.clone()];
   ends.forEach(function(e,k){
    var hit=host(id,e[0],e[1]);
    if(!hit){
     // Braces meeting at a point with nothing through it: one gusset there, the braces 120 mm short of the point.
     var node=brace&&host.node(e[0]);if(!node)return;
     out[k]=e[0].clone().add(e[1].clone().multiplyScalar(Math.min(.12,L*.3)));
     if(host.made.has(node.key))return;host.made.add(node.key);
     var a=node.list[0].d,n=null;node.list.forEach(function(m){if(!n){var x=a.clone().cross(m.d);if(x.lengthSq()>.04)n=x.normalize()}});
     if(!n||node.list.every(function(m){return Math.abs(m.d.y)<.25}))n=new T.Vector3(0,1,0);
     var ax=a.clone().sub(n.clone().multiplyScalar(a.dot(n))).normalize(),by=n.clone().cross(ax);
     var plate=new T.Mesh(shared("gusset",function(){return new T.BoxGeometry(1,1,1)}),baseMaterial(c));
     var gt=gussetT(c),c0=Math.min(.12,L*.3);
     plate.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(ax,by,n));plate.scale.set(.5,.5,gt);plate.position.copy(e[0]);
     plate.userData.gusset=true;parts.push(plate);
     var dn=boltDia(c);if(dn)boltRow(dn).forEach(function(s){addBolt(c,e[0].clone().add(e[1].clone().multiplyScalar(c0+s)),n,dn,gt+legT(c))});
     return
    }
    var face=Math.min(hit.t,L*.4),cut=Math.min(face+(brace?.1:.01),L*.45);
    out[k]=e[0].clone().add(e[1].clone().multiplyScalar(cut));
    var dia=boltDia(c);
    if(!brace){
     // A beam at a face: an end plate there, its bolts through it into the face.
     if(!dia)return;var hs=halfSection(c),d0=e[1],side0=Math.abs(d0.y)>.9?new T.Vector3(1,0,0):d0.clone().cross(new T.Vector3(0,1,0)).normalize(),up0=side0.clone().cross(d0).normalize();
     var at0=e[0].clone().add(d0.clone().multiplyScalar(face+.01));
     var ep=new T.Mesh(shared("gusset",function(){return new T.BoxGeometry(1,1,1)}),baseMaterial(c));
     ep.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(side0,up0,d0));ep.scale.set(hs.b*2+.02,hs.h*2+.04,.016);ep.position.copy(at0);parts.push(ep);
     // The package: the end plate (16) and the flange behind it, taken as thick as the plate.
     var mid0=at0.clone().sub(d0.clone().multiplyScalar(.008));
     [-1,1].forEach(function(i){[-1,1].forEach(function(j){addBolt(c,mid0.clone().add(side0.clone().multiplyScalar(i*Math.max(.04,hs.b-.035))).add(up0.clone().multiplyScalar(j*Math.max(.05,hs.h-.05))),d0,dia,.032)})});
     return
    }
    // The gusset (12 mm): in a vertical brace's plane with one edge upright along the face it is welded to; under a
    // horizontal brace, lying flat, 400 × 400. A brace nearly upright gets none.
    var d=e[1],up=new T.Vector3(0,1,0),hl=Math.hypot(d.x,d.z),g=new T.Mesh(shared("gusset",function(){return new T.BoxGeometry(1,1,1)}),baseMaterial(c));
    if(hl<.2)return;
    var hd=new T.Vector3(d.x/hl,0,d.z/hl),flat=Math.abs(d.y)<.25,side=hd.clone().cross(up);
    g.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(hd,up,side));g.userData.gusset=true;parts.push(g);
    var gt=gussetT(c);
    if(flat){
     g.scale.set(.4,gt,.4);g.position.copy(e[0]).add(d.clone().multiplyScalar(face+.2/hl));
     if(dia)boltRow(dia).forEach(function(s){addBolt(c,e[0].clone().add(d.clone().multiplyScalar(cut+s)),up,dia,gt+legT(c))});
     return
    }
    // A steep brace (a portal leg, a brace of a tall bay) ends 60 mm off the face, inside its gusset: the plate runs from
    // the face past 400 mm of the brace — a gusset placed by its middle left the end of a steep leg hanging below it.
    var end=Math.min(face+.06/hl,L*.45),run=.4,h0=face*hl,h1=Math.max(h0+.3,(end+run)*hl+.05),dy=Math.abs(d.y);
    out[k]=e[0].clone().add(d.clone().multiplyScalar(end));
    g.scale.set(h1-h0,Math.max(.3,run*dy+.15),gt);
    g.position.copy(e[0]).add(hd.clone().multiplyScalar((h0+h1)/2));g.position.y=e[0].y+d.y*(end+run/2);
    if(dia)boltRow(dia).forEach(function(s){addBolt(c,e[0].clone().add(d.clone().multiplyScalar(end+s)),side,dia,gt+legT(c))})
   });
   return out
  }
  // ---- Braces and struts in the plane of a roof (горизонтальные связи Сг, распорки Рс) are given at the top of the
  // roof beams — the level of the scheme of the roof, where the purlins lie too. On the КМ they are bolted to gussets
  // welded to the beam under its top flange (по КМ: узлы связей покрытия на фасонках): drawn so — the top of the brace 10 mm
  // under the top flange of the beam it ends on; drawn at the top they went through the purlins. Only at a beam that
  // carries something (a purlin, a beam lying on its top); the ends meeting at one point go down together.
  var hangDrop=new Map();
  function hangTies(list){
   hangDrop.clear();
   var hosts=[],ties=[],C=3000,cells=new Map();
   var add=function(it){
    for(var i=Math.floor((Math.min(it.ax,it.bx)-400)/C);i<=Math.floor((Math.max(it.ax,it.bx)+400)/C);i++)for(var j=Math.floor((Math.min(it.ay,it.by)-400)/C);j<=Math.floor((Math.max(it.ay,it.by)+400)/C);j++){
     var k=i+","+j;(cells.get(k)||cells.set(k,[]).get(k)).push(it)}
   };
   list.forEach(function(c){
    if(!c.id||c.ft||c.truss||c.cross||["column","shell","plate","bent"].indexOf(c.geometryType)>=0)return;
    var ax=number(c.x),ay=number(c.y),bx=number(c.x2),by=number(c.y2),L=Math.hypot(bx-ax,by-ay),az=number(c.z0),bz=number(c.z2);
    if(L<500||Math.abs(bz-az)/L>.2)return;
    var sec=sectionOf(c.profile_name||c.profileName,c.profile_standard),rolled=sec&&(sec.shape==="ibeam"||sec.shape==="channel");
    var it={c:c,ax:ax,ay:ay,bx:bx,by:by,az:az,bz:bz,L:L,ux:(bx-ax)/L,uy:(by-ay)/L,sec:sec};
    if(kind(c)==="ties"&&!(rolled&&sec.h>=200))ties.push(it);
    else if(rolled&&sec.h>=120){hosts.push(it);add(it)}
   });
   if(!ties.length||!hosts.length)return;
   var topAt=function(h,t){return h.az+(h.bz-h.az)*t+h.sec.h/2};
   // Something lies on the beam: another rolled member crossing it in plan with its bottom at the beam's top.
   var carries=new Map();
   var carrying=function(h){
    if(carries.has(h))return carries.get(h);var yes=false,seen=new Set();
    for(var i=Math.floor((Math.min(h.ax,h.bx)-400)/C);i<=Math.floor((Math.max(h.ax,h.bx)+400)/C)&&!yes;i++)for(var j=Math.floor((Math.min(h.ay,h.by)-400)/C);j<=Math.floor((Math.max(h.ay,h.by)+400)/C)&&!yes;j++)(cells.get(i+","+j)||[]).forEach(function(p){
     if(yes||p===h||seen.has(p))return;seen.add(p);
     var den=h.ux*p.uy-h.uy*p.ux;if(Math.abs(den)<.2)return;
     var rx=p.ax-h.ax,ry=p.ay-h.ay,t=(rx*p.uy-ry*p.ux)/den,s=(rx*h.uy-ry*h.ux)/den;
     if(t<-200||t>h.L+200||s<-200||s>p.L+200)return;
     var bottom=p.az+(p.bz-p.az)*Math.max(0,Math.min(1,s/p.L))-p.sec.h/2;
     if(Math.abs(bottom-topAt(h,Math.max(0,Math.min(1,t/h.L))))<=60)yes=true
    });
    carries.set(h,yes);return yes
   };
   var ends=[],groups=new Map();
   ties.forEach(function(it){
    var up=it.sec&&it.sec.shape==="angle"?it.sec.h:halfSection(it.c).h*1000;
    [[it.ax,it.ay,it.az],[it.bx,it.by,it.bz]].forEach(function(e,k){
     var best=null;
     (cells.get(Math.floor(e[0]/C)+","+Math.floor(e[1]/C))||[]).forEach(function(h){
      var rx=e[0]-h.ax,ry=e[1]-h.ay,along=rx*h.ux+ry*h.uy,off=Math.abs(rx*h.uy-ry*h.ux);
      if(along<-300||along>h.L+300||off>h.sec.b/2+250)return;
      var top=topAt(h,Math.max(0,Math.min(1,along/h.L))),d=Math.abs(e[2]-top);
      if(d<=100&&(!best||d<best.d))best={d:d,h:h,top:top}
     });
     if(!best||!carrying(best.h))return;
     var z=best.top-best.h.sec.t-10-up;if(z>=e[2])return;
     var key=Math.round(e[0]/50)+","+Math.round(e[1]/50)+","+Math.round(e[2]/50);
     groups.set(key,Math.min(groups.has(key)?groups.get(key):Infinity,z));
     ends.push({id:String(it.c.id),k:k,z0:e[2],key:key})
    })
   });
   ends.forEach(function(e){var d=hangDrop.get(e.id)||[0,0];d[e.k]=e.z0-groups.get(e.key);hangDrop.set(e.id,d)})
  }
  // ---- A beam on a column top (опирание сверху). A column whose top is under a beam — not up past the middle of the
  // beam's depth — ends under it: at the bottom of the beam less the cap plate (20 mm), so the beam lies on the plate
  // instead of going into the column (members are given by their centre lines; a beam at the level of the column top
  // went half into it). The bottom flange is bolted to the plate (the bolts of the beam's sheet), a pair of bearing ribs
  // stands in the beam over the support. Ends meeting over one column: in line — 20 mm apart; across — the second
  // stops at the side of the first; alone — flush with the far face of the column. Conventional, not by the КМД.
  var seatTop=new Map(),seatEnd=new Map(),seats=[];
  function topOf(c){var id=String(c.id||"");return seatTop.has(id)?seatTop.get(id):c.z2}
  function seatOnTops(list){
   seatTop.clear();seatEnd.clear();seats=[];
   var C=2000,cells=new Map(),byCol=new Map();
   list.forEach(function(c){
    if(c.geometryType!=="column"||!c.id||c.ft||number(c.r)>0||c.column&&Array.isArray(c.column.members)&&c.column.members.length||slight(c))return;
    var k=Math.floor(number(c.x)/C)+","+Math.floor(number(c.y)/C);(cells.get(k)||cells.set(k,[]).get(k)).push(c)
   });
   list.forEach(function(b){
    if(b.geometryType!=="beam"||!b.id||b.ft||b.truss||slight(b))return;
    var ax=number(b.x),ay=number(b.y),bx=number(b.x2),by=number(b.y2),L=Math.hypot(bx-ax,by-ay),az=number(b.z0),bz=number(b.z2);
    if(L<300||Math.abs(bz-az)/L>.1)return;
    var ux=(bx-ax)/L,uy=(by-ay)/L,hb=halfSection(b).h*1000,seen=new Set();
    for(var i=Math.floor((Math.min(ax,bx)-600)/C);i<=Math.floor((Math.max(ax,bx)+600)/C);i++)for(var j=Math.floor((Math.min(ay,by)-600)/C);j<=Math.floor((Math.max(ay,by)+600)/C);j++)(cells.get(i+","+j)||[]).forEach(function(c){
     if(seen.has(c))return;seen.add(c);
     var cx=number(c.x),cy=number(c.y),along=(cx-ax)*ux+(cy-ay)*uy,off=Math.abs((cx-ax)*uy-(cy-ay)*ux),hs=halfSection(c),reach=Math.max(hs.b,hs.h)*1000;
     if(off>Math.min(150,Math.max(60,reach))||along<-reach||along>L+reach)return;
     var zb=az+(bz-az)*Math.max(0,Math.min(1,along/L)),top=number(c.z2),bottom=zb-hb,seat=bottom-20;
     if(top>=zb+hb/2||top<bottom-250||seat<number(c.z0)+300)return;
     var id=String(c.id),k=byCol.get(id);if(!k)byCol.set(id,k={c:c,seat:seat,beams:[]});
     k.seat=Math.min(k.seat,seat);
     var end=along<reach+50?0:along>L-reach-50?1:-1;
     k.beams.push({b:b,end:end,d:end===1?{x:-ux,y:-uy}:{x:ux,y:uy},zb:zb,hb:hb})
    })
   });
   byCol.forEach(function(k,id){
    seatTop.set(id,k.seat);seats.push(k);
    var hs=halfSection(k.c),cx=number(k.c.x),cy=number(k.c.y),ends=k.beams.filter(function(e){return e.end>=0}),through=k.beams.filter(function(e){return e.end<0});
    ends.forEach(function(e,i){
     var dot=function(o){return o.d.x*e.d.x+o.d.y*e.d.y};
     var first=through.concat(ends.filter(function(o,j){return j<i&&Math.abs(dot(o))<.3}))[0];
     var t=first?halfSection(first.b).b*1000+10:ends.some(function(o){return o!==e&&dot(o)<-.9})?10:-(Math.abs(e.d.x)*hs.b+Math.abs(e.d.y)*hs.h)*1000;
     e.at={x:cx+e.d.x*t,y:cy+e.d.y*t};e.bolts=first||t===10?{x:cx+e.d.x*(t+60),y:cy+e.d.y*(t+60)}:{x:cx,y:cy};
     var bid=String(e.b.id),arr=seatEnd.get(bid)||[null,null];arr[e.end]=e.at;seatEnd.set(bid,arr)
    });
    through.forEach(function(e){e.bolts={x:cx,y:cy}})
   })
  }
  // The bolts through the bottom flange into the cap plate and the bearing ribs of a seated beam (I sections only).
  function seatParts(k,e,parts){
   var b=e.b,sec=sectionOf(b.profile_name||b.profileName,b.profile_standard);if(!sec||sec.shape!=="ibeam")return;
   var h=sec.h/1000,w=sec.b/1000,tf=sec.t/1000,tw=sec.s/1000,at=toWorld(e.bolts.x,e.bolts.y,e.zb),dir=toWorld(e.bolts.x+e.d.x,e.bolts.y+e.d.y,e.zb).sub(at).normalize(),up=new T.Vector3(0,1,0),side=dir.clone().cross(up).normalize();
   var dia=boltDia(b)||boltDia(k.c),bottom=at.y-h/2;
   if(dia&&w>=.1){var g=Math.max(.035,w/2-.035),mid=new T.Vector3(at.x,bottom+(tf-.02)/2,at.z);
    [-1,1].forEach(function(q){addBolt(b,mid.clone().add(side.clone().multiplyScalar(q*g)),up,dia,tf+.02)})}
   var rw=Math.max(.02,(w-tw)/2-.005),rh=Math.max(.05,h-2*tf);
   [-1,1].forEach(function(q){
    var rib=new T.Mesh(shared("gusset",function(){return new T.BoxGeometry(1,1,1)}),baseMaterial(b));
    rib.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(dir,up,side));rib.scale.set(.01,rh,rw);
    rib.position.copy(at).add(side.clone().multiplyScalar(q*(tw/2+rw/2)));rib.userData.small=true;parts.push(rib)
   })
  }
  function buildMembers(list){
   var cached=new Set(meshGeo.values()),gone=new Set();
   allMeshes.forEach(function(m){steel.remove(m);if(!cached.has(m.geometry))gone.add(m.geometry)});gone.forEach(function(g){g.dispose()});
   allMeshes=[];boltList=[];dataById.clear();meshesById.clear();failures=0;conventional.clear();
   labels.forEach(function(l){l.el.remove()});labels=[];
   elems=Array.isArray(list)?list:[];
   seatOnTops(elems);hangTies(elems);
   var host=jointHosts(elems);
   elems.forEach(function(c){
    var id=String(c.id||"");if(!id)return;
    dataById.set(id,c);
    var p=memberPoints(c),segments=[],seated=seatEnd.get(id);
    if(seated)[0,1].forEach(function(k){var q=seated[k];if(q)p[k?p.length-1:0]=toWorld(q.x,q.y,k?c.z2:c.z0)});
    // Welds — a layer of their own on the scheme.
    if(c.ft==="weld"&&number(c.r)>0){
     if(!drawJoints(c,id,true)){failures++;return}
     var wl=toWorld(number(c.x)+number(c.r),number(c.y),number(c.z1));wl.y+=.2;
     var we=document.createElement("span");we.className="ir-three-member-label";we.textContent=c.mark||c.title||"";
     labelLayer.appendChild(we);labels.push({el:we,pos:wl,id:id});
     return
    }
    // A round plate: a tank bottom (a disc) or a ring platform (an annulus) lying flat at its level. A plate of an
    // annular ring (sector_deg) is its sector, with its two radial joints; a conical bottom rises to its centre by
    // cone_rise_mm (falls when negative: «уклон к центру»).
    if(c.geometryType==="plate"&&number(c.r)>0){
     if(c.lay)drawJoints(c,id,false);
     var ro=number(c.r)/1000,ri=Math.max(0,Math.min(number(c.ri)/1000,ro-.05)),rise=number(c.cr)/1000;
     var ps=number(c.sw)>0&&number(c.sw)<360,p0=0,pw=2*Math.PI;
     if(ps){var pa=planTheta(number(c.sa)),pb=planTheta(number(c.sa)+number(c.sw));pw=((pb-pa)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);p0=pa;
      if(pw>Math.PI&&number(c.sw)<180){p0=pb;pw=2*Math.PI-pw}}
     // The ring lies in the plane of its geometry: its angle φ there is the plan angle θ less a quarter turn.
     var pg=ri>0||ps?new T.RingGeometry(ri,ro,ps?Math.max(4,Math.ceil(96*pw/(2*Math.PI))):96,rise?8:1,p0-Math.PI/2,pw):new T.CircleGeometry(ro,96);
     if(rise){var pp=pg.attributes.position;for(var q=0;q<pp.count;q++){var d=Math.hypot(pp.getX(q),pp.getY(q));pp.setZ(q,rise*(1-d/ro))}pp.needsUpdate=true;pg.computeVertexNormals()}
     var plate=new T.Mesh(pg,shellMaterial(c));
     plate.rotation.x=-Math.PI/2;plate.position.copy(p[0]);plate.position.y+=.005;
     plate.userData.memberId=id;plate.userData.shell=true;steel.add(plate);allMeshes.push(plate);
     if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(plate);
     if(ps)[p0,p0+pw].forEach(function(t){var a=p[0].clone().add(new T.Vector3(Math.sin(t)*Math.max(ri,.01),.006,Math.cos(t)*Math.max(ri,.01))),b=p[0].clone().add(new T.Vector3(Math.sin(t)*ro,.006,Math.cos(t)*ro));
      var v=b.clone().sub(a),m=new T.Mesh(barGeo(.02),jointMat);m.position.copy(a);m.scale.z=v.length();m.quaternion.setFromUnitVectors(zAxis,v.normalize());
      m.userData.memberId=id;steel.add(m);allMeshes.push(m);meshesById.get(id).push(m)});
     var pl=p[0].clone(),pm=p0+pw/2;if(ps){pl.x+=Math.sin(pm)*(ri+ro)/2;pl.z+=Math.cos(pm)*(ri+ro)/2}else pl.x+=ri>0?(ri+ro)/2:0;pl.y+=.35+(ri>0||ps?0:Math.max(0,rise));
     var pe=document.createElement("span");pe.className="ir-three-member-label";pe.textContent=c.mark||c.title||"";
     labelLayer.appendChild(pe);labels.push({el:pe,pos:pl,id:id});
     return
    }
    // A tank wall: an open cylinder with its bottom, see-through so that the roof and the nozzles stay visible.
    // A railing round the roof is the same cylinder without a bottom.
    // A railing round a platform (ГОСТ 31385): posts at their step, the handrail at the top, two intermediate rails
    // and a toe board — one record, drawn piece by piece.
    if(c.geometryType==="shell"&&c.ft==="railing"&&number(c.r)>0){
     var rr=number(c.r),hh=dist(p[0],p[1]);if(hh<=.005){failures++;return}
     // Round the plan centre, over the whole circle or over its sector (an opening for a bridge or a stair).
     var a0=number(c.sw)>0&&number(c.sw)<360?number(c.sa):0,aw=number(c.sw)>0&&number(c.sw)<360?number(c.sw):360;
     var onArc=function(deg,z){var a=deg*Math.PI/180;return toWorld(number(c.x)+Math.cos(a)*rr,number(c.y)+Math.sin(a)*rr,z)};
     var stepM=Math.max(.5,(number(c.fd)||1000)/1000),span=2*Math.PI*rr/1000*aw/360,posts=Math.max(aw<360?2:8,Math.round(span/stepM)+(aw<360?1:0)),parts=[],mat=baseMaterial(c);
     var postGeo=new T.BoxGeometry(.05,hh,.05),z0=number(c.z0),zz=function(f){return z0+hh*1000*f};
     for(var k=0;k<posts;k++){var post=new T.Mesh(postGeo,mat);post.position.copy(onArc(a0+aw*k/(aw<360?posts-1:posts),z0));post.position.y+=hh/2;parts.push(post)}
     var segs=Math.max(24,Math.round(aw/3));
     var ring=function(f,t){var pts=[];for(var i=0;i<=segs;i++)pts.push(onArc(a0+aw*i/segs,zz(f)));
      parts.push(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts,aw>=360),segs,t,6,aw>=360),mat))};
     ring(1,.025);ring(.712,.015);ring(.424,.015);ring(.06,.012);
     parts.forEach(function(mesh){mesh.userData.memberId=id;steel.add(mesh);allMeshes.push(mesh);
      if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)});
     var rl=onArc(a0+aw/2,zz(1));rl.y+=.2;
     var rlab=document.createElement("span");rlab.className="ir-three-member-label";rlab.textContent=c.mark||c.title||"";
     labelLayer.appendChild(rlab);labels.push({el:rlab,pos:rl,id:id});
     return
    }
    // A roof of a tank (a shield of it): a cone from the wall down to the inner radius at its top, a sector of it
    // (the cone of a vessel bottom is the other way: narrow below, wide at the top — inner radius larger)
    // when the shield gives one (sector_start_deg on the plan, counter-clockwise, sector_deg wide).
    if(c.geometryType==="shell"&&number(c.r)>0&&number(c.ri)>0&&number(c.ri)!==number(c.r)){
     var cr=number(c.r)/1000,ci=number(c.ri)/1000,ch=p[1].y-p[0].y;if(Math.abs(ch)<=.005){failures++;return}
     // Plan angle → angle of the cylinder geometry (x = sin θ, z = cos θ) in this view's mirrored axes.
     var theta=planTheta;
     var t0=0,tl=2*Math.PI;
     if(number(c.sw)>0&&number(c.sw)<360){var ta=theta(number(c.sa)),tb=theta(number(c.sa)+number(c.sw));tl=((tb-ta)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);t0=ta;
      if(tl>Math.PI){t0=tb;tl=2*Math.PI-tl}}
     var cone=new T.Mesh(new T.CylinderGeometry(ci,cr,Math.abs(ch),48,1,true,t0,tl),roofMaterial(c));
     cone.position.copy(p[0]);cone.position.y+=ch/2;if(ch<0)cone.rotation.x=Math.PI;
     cone.userData.memberId=id;cone.userData.shell=true;cone.userData.roof=true;steel.add(cone);allMeshes.push(cone);
     if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(cone);
     // The joints of a shield (its two radial edges) as thin bars, so that the shields read apart.
     if(tl<2*Math.PI-.01)[t0,t0+tl].forEach(function(t){var a=p[0].clone().add(new T.Vector3(Math.sin(t)*cr,0,Math.cos(t)*cr)),b=p[0].clone().add(new T.Vector3(Math.sin(t)*ci,ch,Math.cos(t)*ci));
      var v=b.clone().sub(a),m=new T.Mesh(barGeo(.04),baseMaterial(c));m.position.copy(a);m.scale.z=v.length();
      m.quaternion.setFromUnitVectors(zAxis,v.normalize());m.userData.memberId=id;steel.add(m);allMeshes.push(m);meshesById.get(id).push(m)});
     var cm=t0+tl/2,cl=p[0].clone().add(new T.Vector3(Math.sin(cm)*(cr+ci)/2,ch/2+.3,Math.cos(cm)*(cr+ci)/2));
     var ce=document.createElement("span");ce.className="ir-three-member-label";ce.textContent=c.mark||c.title||"";
     labelLayer.appendChild(ce);labels.push({el:ce,pos:cl,id:id});
     return
    }
    if(c.geometryType==="shell"&&number(c.r)>0){
     var r=number(c.r)/1000,h=dist(p[0],p[1]);if(h<=.005){failures++;return}
     // One sheet of a course (sheet-by-sheet assembly): its sector of the course, with its two vertical joints.
     var ws=number(c.sw)>0&&number(c.sw)<360,w0=0,wl=2*Math.PI;
     if(ws){var wa=planTheta(number(c.sa)),wb=planTheta(number(c.sa)+number(c.sw));wl=((wb-wa)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);w0=wa;
      if(wl>Math.PI&&number(c.sw)<180){w0=wb;wl=2*Math.PI-wl}}
     var wall=new T.Mesh(new T.CylinderGeometry(r,r,h,ws?Math.max(4,Math.ceil(64*wl/(2*Math.PI))):64,1,true,w0,wl),shellMaterial(c));
     wall.position.copy(p[0]).add(p[1]).multiplyScalar(.5);
     var parts=[wall];
     // The seam at the top of a course (and the wall top) as a thin ring: courses read apart in 3D.
     var seam=new T.Mesh(ws?new T.TorusGeometry(r,.02,4,Math.max(4,Math.ceil(96*wl/(2*Math.PI))),wl):new T.TorusGeometry(r,.02,4,96),baseMaterial(c));seam.rotation.x=Math.PI/2;
     if(ws)seam.rotation.z=w0-Math.PI/2;
     seam.position.copy(p[1]);parts.push(seam);
     if(ws)[w0,w0+wl].forEach(function(t){var j=new T.Mesh(new T.BoxGeometry(.03,h,.03),jointMat);j.position.set(p[0].x+Math.sin(t)*(r+.006),(p[0].y+p[1].y)/2,p[0].z+Math.cos(t)*(r+.006));parts.push(j)});
     if(c.lay)drawJoints(c,id,false);
     if(!c.open){var bottom=new T.Mesh(new T.CircleGeometry(r,64),shellMaterial(c));bottom.rotation.x=-Math.PI/2;bottom.position.copy(p[0]);bottom.position.y+=.01;parts.push(bottom)}
     parts.forEach(function(mesh){mesh.userData.memberId=id;mesh.userData.shell=true;steel.add(mesh);allMeshes.push(mesh);
      if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)});
     var top=p[1].clone();top.y+=.35;
     var tl=document.createElement("span");tl.className="ir-three-member-label";tl.textContent=c.mark||c.title||"";
     labelLayer.appendChild(tl);labels.push({el:tl,pos:top,id:id});
     return
    }
    // Tank fittings are drawn as what they are: a pipe of their own diameter with a flange, a hatch with a cover,
    // a valve body, a foam generator, a lightning rod.
    if(c.ft&&c.ft!=="ring"&&p.length===2&&dist(p[0],p[1])>.005){addFitting(c,id,p[0],p[1]);return}
    if(c.truss&&Array.isArray(c.truss.members)&&c.truss.members.length&&addTruss(c,id))return;
    if(c.column&&Array.isArray(c.column.members)&&c.column.members.length&&addColumnLattice(c,id))return;
    for(var i=0;i<p.length-1;i++)if(dist(p[i],p[i+1])>.005)segments.push([p[i],p[i+1]]);
    // A vertical brace drawn as a cross: the second diagonal from the top of the first end to the foot of the second.
    if(c.cross&&p.length===2&&segments.length){var q0=p[0].clone(),q1=p[1].clone();q0.y=p[1].y;q1.y=p[0].y;segments.push([q0,q1])}
    if(!segments.length){failures++;return}
    var extra=[];
    if(c.geometryType!=="column")segments=segments.map(function(sg,i){
     var t=trimSegment(c,id,sg[0],sg[1],host,extra);
     // A bent member keeps its middle point: only its outer ends are cut.
     return segments.length>1&&!c.cross?[i?sg[0]:t[0],i===segments.length-1?t[1]:sg[1]]:t
    });
    extra.forEach(function(m){m.userData.memberId=id;steel.add(m);allMeshes.push(m);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(m)});
    segments.forEach(function(points){
     if(!sectionOf(c.profile_name||c.profileName,c.profile_standard))conventional.add(id);
     var mesh=new T.Mesh(addGeometry(T,meshGeo,c),baseMaterial(c));
     mesh.position.copy(points[0]);mesh.scale.z=dist(points[0],points[1]);
     mesh.quaternion.setFromUnitVectors(zAxis,points[1].clone().sub(points[0]).normalize());
     mesh.userData.memberId=id;steel.add(mesh);allMeshes.push(mesh);
     if(!meshesById.has(id))meshesById.set(id,[]);
     meshesById.get(id).push(mesh)
    });
    // Mark label above the top of a column, over the middle of a beam.
    var anchor=c.geometryType==="column"?p[p.length-1].clone():p[0].clone().add(p[p.length-1]).multiplyScalar(.5);
    anchor.y+=.35;
    var el=document.createElement("span");el.className="ir-three-member-label";el.textContent=c.mark||c.title||"";
    labelLayer.appendChild(el);labels.push({el:el,pos:anchor,id:id})
   });
   seats.forEach(function(k){k.beams.forEach(function(e){
    var id=String(e.b.id);if(!dataById.has(id))return;var parts=[];seatParts(k,e,parts);
    parts.forEach(function(m){m.userData.memberId=id;steel.add(m);allMeshes.push(m);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(m)})
   })});
   pedestals=[];
   elems.forEach(function(c){if(c.geometryType==="column"&&dataById.has(String(c.id))&&!c.ft&&!(number(c.r)>0)&&!slight(c)&&!(c.column&&Array.isArray(c.column.members)&&c.column.members.length))baseParts(c)})
  }
  // The base plate of a column under its foot (with the frame, seen from any distance: without it a column stood in the
  // air) and, under a base at the ground (up to +0.300), a conditional concrete footing — the footings are of the КЖ, not
  // of the КМ: their size is not known here, only that the column stands on one. Hidden with the details.
  var concreteMat=new T.MeshStandardMaterial({color:0xaeb3b8,roughness:.95}),pedestals=[];
  function baseSize(c){
   var sec=sectionOf(c.profile_name||c.profileName,c.profile_standard),bw=sec?sec.b/1000:.36,hh=sec?sec.h/1000:.4;
   var an=c.base&&c.base.anchors||null,cnt=an&&number(an.count)>0?Math.min(24,number(an.count)):4,dia=an&&number(an.d_mm)>0?number(an.d_mm)/1000:.03;
   var side=Math.ceil(cnt/2),step=Math.max(.1,dia*4);
   return{cnt:cnt,dia:dia,side:side,step:step,pw:Math.max(bw+.2,(side-1)*step+.1),pd:hh+.2+dia*2,pt:.03}
  }
  function baseParts(c){
   var id=String(c.id),bs=baseSize(c),at=toWorld(number(c.x),number(c.y),number(c.z0));
   var plate=new T.Mesh(shared("plate:"+bs.pw.toFixed(3)+":"+bs.pd.toFixed(3),function(){return new T.BoxGeometry(bs.pw,bs.pt,bs.pd)}),baseMaterial(c));
   plate.position.copy(at);plate.position.y-=bs.pt/2;plate.userData.memberId=id;steel.add(plate);allMeshes.push(plate);
   if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(plate);
   if(number(c.z0)>300)return;
   var fw=bs.pw+.3,fd=bs.pd+.3,fh=1;
   var foot=new T.Mesh(shared("footing:"+fw.toFixed(3)+":"+fd.toFixed(3),function(){return new T.BoxGeometry(fw,fh,fd)}),concreteMat);
   foot.position.copy(at);foot.position.y-=bs.pt+fh/2;foot.visible=showDetails;
   foot.userData.memberId=id;foot.userData.fixed=true;foot.userData.footing=true;steel.add(foot);allMeshes.push(foot);pedestals.push(foot)
  }
  // ---- Cranes on their runways, drawn conventionally (the crane is equipment, not in the КМ): an overhead crane on a
  // pair of rails (or crane girders without rails) — end carriages, two girders of the bridge and a trolley with its hook;
  // a suspended crane under a pair of runway beams («Путь подвесного крана») — carriages on the bottom flanges, a single
  // girder with cantilevers and a hoist; a monorail — a hoist under it. The pair: parallel at one level, 3–40 m apart,
  // overlapping by half; the crane stands at a third of the common length. Shown with the details, in orange (amber
  // was the colour of the braces: among them the engineer did not find the cranes); the legend counts them and a click
  // on it shows them one by one.
  var craneMat=new T.MeshStandardMaterial({color:0xff6a00,metalness:.2,roughness:.55}),hoistMat=new T.MeshStandardMaterial({color:0x3a4048,metalness:.3,roughness:.5}),
   wheelMat=new T.MeshStandardMaterial({color:0x1f2328,metalness:.6,roughness:.35});
  // Only the member's own name makes it a runway: a type «Кран-балка, монорельс» given to a beam by its letters (a beam of
  // a crane service platform, an opening) put cranes and hoists all over the frame. A pair of «путь подвесного крана»
  // carries a suspended crane, a «монорельс» a hoist, a «рельс» (or a rail profile Р43) and a «подкрановая балка» an
  // overhead crane. The name is mark_name: the title of a record in the program is its position («PDF-…»), so read
  // first it left only the rails of profile Р43 (a suspended crane on its runways was not drawn).
  var cranes=[],craneTurn=0;
  function runwayKind(c){
   var n=String(c.mark_name||c.title||""),pr=String(c.profile_name||c.profileName||"");
   if(/площадк|лестниц|ограждени|обрамлени|проём|проем|упор/i.test(n))return"";
   if(/(^|[^о])рельс/i.test(n)||/^(?:Р|КР)\d{2,3}$/.test(pr))return"rail";
   if(/монорельс/i.test(n))return"mono";
   if(/подвесн\S*\s+(?:кран|пут)|пут[ьи]\s+подвесн|кран[\s-]*балк/i.test(n))return"hung";
   if(/подкранов\S*\s+балк|балк\S*\s+подкранов/i.test(n))return"girder";
   return""
  }
  // A welded I of plates «−16×200, −10×494»: the web is the thinner plate, the height is it and two flanges.
  function weldedHeight(p){
   var pl=[],re=/[−-]\s*(\d+(?:[.,]\d+)?)\s*[×xх]\s*(\d+)/g,m;while((m=re.exec(String(p||""))))pl.push({t:number(m[1].replace(",",".")),w:number(m[2])});
   if(pl.length<2)return 0;pl.sort(function(a,b){return a.t-b.t});return pl[0].w+2*pl[pl.length-1].t
  }
  function buildCranes(){
   equipment.children.slice().forEach(function(m){equipment.remove(m);m.geometry.dispose()});
   cranes=[];craneTurn=0;
   var ways=[];
   elems.forEach(function(c){
    if(c.geometryType!=="beam"||c.ft)return;var k=runwayKind(c);if(!k)return;
    var a={x:number(c.x),y:number(c.y)},b={x:number(c.x2),y:number(c.y2)},L=Math.hypot(b.x-a.x,b.y-a.y);if(L<3000||Math.abs(number(c.z0)-number(c.z2))>50)return;
    var sec=sectionOf(c.profile_name||c.profileName,c.profile_standard);ways.push({c:c,kind:k,a:a,b:b,L:L,u:{x:(b.x-a.x)/L,y:(b.y-a.y)/L},z:number(c.z0),h:sec?sec.h:weldedHeight(c.profile_name||c.profileName),fb:sec&&sec.b?sec.b:200})
   });
   // Rails decide where there are any; crane girders carry a crane only where no rail lies on them.
   var rails=ways.filter(function(w){return w.kind==="rail"});
   var pairs=[],used=new Set(),list=function(kind){return ways.filter(function(w){return w.kind===kind})};
   var pairUp=function(group){
    group.forEach(function(w){
     if(used.has(w))return;var best=null;
     group.forEach(function(o){
      if(o===w||used.has(o)||Math.abs(o.z-w.z)>300||Math.abs(w.u.x*o.u.y-w.u.y*o.u.x)>.02)return;
      var d=Math.abs((o.a.x-w.a.x)*-w.u.y+(o.a.y-w.a.y)*w.u.x);if(d<3000||d>40000)return;
      var p=function(q){return(q.x-w.a.x)*w.u.x+(q.y-w.a.y)*w.u.y},lo=Math.max(0,Math.min(p(o.a),p(o.b))),hi=Math.min(w.L,Math.max(p(o.a),p(o.b)));
      if(hi-lo<Math.min(w.L,o.L)*.5)return;
      if(!best||d<best.d)best={o:o,d:d,lo:lo,hi:hi}
     });
     if(best){used.add(w);used.add(best.o);pairs.push({w:w,o:best.o,lo:best.lo,hi:best.hi})}
    })
   };
   // Several runway pieces in one line (girders of a span each) make one line: the longest stands for it.
   var lines=function(group){var out=[];group.slice().sort(function(p,q){return q.L-p.L}).forEach(function(w){
    if(!out.some(function(o){return Math.abs(o.z-w.z)<=300&&Math.abs(o.u.x*w.u.y-o.u.y*w.u.x)<=.02&&Math.abs((w.a.x-o.a.x)*-o.u.y+(w.a.y-o.a.y)*o.u.x)<300}))out.push(w)});return out};
   if(rails.length)pairUp(lines(rails));else pairUp(lines(list("girder")));
   var hung=lines(list("hung"));pairUp(hung);
   // Parts in a frame of the crane: X — across (the span), Z — along the runway, Y — up.
   var UP=new T.Vector3(0,1,0);
   var place=function(geo,mat,at,X,Y,Z){var m=new T.Mesh(geo,mat);m.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(X,Y,Z));m.position.copy(at);equipment.add(m);return m};
   var box=function(w,h,d,mat,at,X,Z){return place(new T.BoxGeometry(w,h,d),mat,at,X,UP,Z)};
   var cyl=function(r,len,mat,at,dir,seg){var d=dir.clone().normalize(),x=Math.abs(d.y)>.9?new T.Vector3(1,0,0):new T.Vector3().crossVectors(UP,d).normalize();
    return place(new T.CylinderGeometry(r,r,len,seg||14),mat,at,x,d,new T.Vector3().crossVectors(x,d))};
   // An I of three plates along `dir`: height h, flange b, web tw, flange tf; `at` — the middle of its top.
   var ibeam=function(len,h,b,tw,tf,mat,at,dir,side){
    box(b,tf,len,mat,at.clone().add(new T.Vector3(0,-tf/2,0)),side,dir);box(tw,h-2*tf,len,mat,at.clone().add(new T.Vector3(0,-h/2,0)),side,dir);box(b,tf,len,mat,at.clone().add(new T.Vector3(0,-h+tf/2,0)),side,dir)
   };
   // The hook block under the ropes and its hook.
   var hookBlock=function(at,X,Z,k){
    box(.22*k,.3*k,.14*k,craneMat,at,X,Z);cyl(.1*k,.16*k,wheelMat,at.clone().add(new T.Vector3(0,.04*k,0)),Z,16);
    cyl(.022*k,.16*k,wheelMat,at.clone().add(new T.Vector3(0,-.23*k,0)),UP,10);
    var hook=place(new T.TorusGeometry(.075*k,.022*k,8,18,Math.PI*1.45),wheelMat,at.clone().add(new T.Vector3(0,-.37*k,0)),X,UP,Z);hook.rotateZ(Math.PI*.78)
   };
   // An electric hoist under a flange (`at` — the underside of the flange, `dir` — along the beam): trolley plates and
   // wheels on the flange, the drum with the rope, the motor and the gearbox at its ends, the control box, the pendant.
   var hoist=function(at,dir,drop){
    var Z=dir.clone().setY(0).normalize(),X=new T.Vector3().crossVectors(UP,Z).normalize();
    [-1,1].forEach(function(i){box(.012,.36,.5,hoistMat,at.clone().add(X.clone().multiplyScalar(i*.14)).add(new T.Vector3(0,-.06,0)),X,Z);
     [-1,1].forEach(function(j){cyl(.055,.035,wheelMat,at.clone().add(X.clone().multiplyScalar(i*.09)).add(Z.clone().multiplyScalar(j*.16)).add(new T.Vector3(0,.075,0)),X,16)})});
    var drum=at.clone().add(new T.Vector3(0,-.42,0));cyl(.15,.56,hoistMat,drum,Z,18);
    cyl(.115,.34,hoistMat,drum.clone().add(Z.clone().multiplyScalar(.45)),Z,16);box(.3,.32,.16,hoistMat,drum.clone().add(Z.clone().multiplyScalar(-.36)),X,Z);
    box(.14,.24,.3,craneMat,drum.clone().add(X.clone().multiplyScalar(.24)),X,Z);
    var low=drum.clone().add(new T.Vector3(0,-.15-drop,0));
    [-1,1].forEach(function(i){var r=drum.clone().add(Z.clone().multiplyScalar(i*.06)).add(new T.Vector3(0,-.15-drop/2,0));cyl(.007,drop,wheelMat,r,UP,6)});
    hookBlock(low.clone().add(new T.Vector3(0,-.15,0)),X,Z,1);
    var pend=drum.clone().add(X.clone().multiplyScalar(.28)).add(new T.Vector3(0,-1.2,0));cyl(.005,2.1,wheelMat,pend.clone().add(new T.Vector3(0,.15,0)),UP,5);box(.08,.24,.07,craneMat,pend.clone().add(new T.Vector3(0,-.95,0)),X,Z)
   };
   pairs.forEach(function(p){
    var w=p.w,o=p.o,s=p.lo+(p.hi-p.lo)/3,A={x:w.a.x+w.u.x*s,y:w.a.y+w.u.y*s},t=((A.x-o.a.x)*o.u.x+(A.y-o.a.y)*o.u.y),B={x:o.a.x+o.u.x*t,y:o.a.y+o.u.y*t};
    var pa=toWorld(A.x,A.y,0),pb=toWorld(B.x,B.y,0),span=Math.hypot(pb.x-pa.x,pb.z-pa.z),mid=pa.clone().add(pb).multiplyScalar(.5);
    var along=toWorld(A.x+w.u.x*1000,A.y+w.u.y*1000,0).sub(pa).normalize(),S=pb.clone().sub(pa).setY(0).normalize(),AL=along.clone().setY(0).normalize();
    if(w.kind==="hung"){
     // A suspended crane: on each runway a carriage — two pairs of wheels on the bottom flange either side of the web,
     // its side plates and the end beam below; the girder (I) hung under the end beams with cantilevers; the hoist on
     // the girder's bottom flange.
     var bottom=(Math.min(w.z,o.z)-(w.h||400)/2)/1000;
     [pa,pb].forEach(function(q){
      // The wheels on the flange halves either side of the web, the side plates just outside the flange edges.
      var c0=q.clone(),fb=(q===pa?w.fb:o.fb)/1000;c0.y=bottom;
      [-1,1].forEach(function(i){[-1,1].forEach(function(j){cyl(.065,.04,wheelMat,c0.clone().add(S.clone().multiplyScalar(i*fb/4)).add(AL.clone().multiplyScalar(j*.32)).add(new T.Vector3(0,.08,0)),S,16)});
       box(.012,.36,.85,craneMat,c0.clone().add(S.clone().multiplyScalar(i*(fb/2+.025))).add(new T.Vector3(0,-.02,0)),S,AL);
       cyl(.02,fb+.06,wheelMat,c0.clone().add(AL.clone().multiplyScalar(i*.32)).add(new T.Vector3(0,.08,0)),S,8)});
      box(.26,.3,1.5,craneMat,c0.clone().add(new T.Vector3(0,-.38,0)),S,AL)
     });
     var gTop=bottom-.53,gLen=span+1.6;ibeam(gLen,.45,.2,.012,.018,craneMat,mid.clone().setY(gTop),S,AL);cranes.push({at:mid.clone().setY(gTop),size:span,along:AL.clone()});
     hoist(pa.clone().lerp(pb,.35).setY(gTop-.45),S,Math.max(1.2,Math.min(3.5,gTop-1.5-1)))
    }else{
     // An overhead crane on rails: end trucks with two wheels on each rail, the bridge of two box girders, the trolley
     // on the girders with its drum, motor and gearbox, four falls of rope to the hook block, the cabin under the bridge.
     var top=(Math.max(w.z,o.z)+(w.kind==="rail"?(w.h||140)/2:(w.h||1000)/2))/1000;
     [pa,pb].forEach(function(q){
      var c0=q.clone();c0.y=top;
      [-1,1].forEach(function(j){cyl(.25,.12,wheelMat,c0.clone().add(AL.clone().multiplyScalar(j*1.5)).add(new T.Vector3(0,.25,0)),S,20)});
      box(.42,.55,4,craneMat,c0.clone().add(new T.Vector3(0,.62,0)),S,AL)
     });
     var gB=top+.9;[-1,1].forEach(function(k){box(span+.5,1.2,.5,craneMat,mid.clone().add(AL.clone().multiplyScalar(k*1.1)).setY(gB+.6),S,AL)});cranes.push({at:mid.clone().setY(gB),size:span,along:AL.clone()});
     var tr=pa.clone().lerp(pb,.4).setY(gB+1.2);
     box(2.0,.3,2.8,hoistMat,tr.clone().add(new T.Vector3(0,.15,0)),S,AL);
     [-1,1].forEach(function(i){[-1,1].forEach(function(j){cyl(.16,.08,wheelMat,tr.clone().add(S.clone().multiplyScalar(i*.8)).add(AL.clone().multiplyScalar(j*1.1)).add(new T.Vector3(0,.0,0)),S,16)})});
     var dr=tr.clone().add(new T.Vector3(0,.68,0));cyl(.34,1.5,hoistMat,dr,AL,20);cyl(.2,.6,hoistMat,dr.clone().add(AL.clone().multiplyScalar(1.1)).add(S.clone().multiplyScalar(.5)),AL,16);
     box(.6,.55,.5,hoistMat,dr.clone().add(AL.clone().multiplyScalar(-1.05)),S,AL);
     var drop=Math.max(2,Math.min(6,gB-2)),hb=tr.clone().add(new T.Vector3(0,-drop,0));
     [-.25,-.08,.08,.25].forEach(function(z){cyl(.011,drop+.3,wheelMat,tr.clone().add(AL.clone().multiplyScalar(z)).add(new T.Vector3(0,-drop/2+.15,0)),UP,6)});
     hookBlock(hb,S,AL,2);
     box(1.5,1.7,1.5,hoistMat,pa.clone().lerp(pb,.12).add(AL.clone().multiplyScalar(-1.1)).setY(gB-.85),S,AL)
    }
   });
   list("mono").concat(hung.filter(function(w){return!used.has(w)})).forEach(function(w){
    var s=w.L/3,at=toWorld(w.a.x+w.u.x*s,w.a.y+w.u.y*s,w.z-(w.h||300)/2),dir=toWorld(w.a.x+w.u.x*(s+1000),w.a.y+w.u.y*(s+1000),0).sub(toWorld(w.a.x+w.u.x*s,w.a.y+w.u.y*s,0));
    hoist(at,dir,1.6);cranes.push({at:at.clone(),size:4})
   });
   equipment.visible=showDetails
  }
  // ---- Nodes: where members meet — column bases and tops, beam ends at a column or on another beam, joints of
  // members. A marker per node coloured by montage (all mounted, part, none); a click opens the node: its members,
  // their status, what is still missing. Base plates, anchors and cap plates near the camera are drawn schematically
  // (not by the КМД), only to read the node.
  var nodeColors={mounted:0x1f9e89,partial:0xf25c05,planned:0x9aa3ad};
  var nodeKinds={base:"База колонны",top:"Оголовок колонны",side:"Примыкание к колонне",beam:"Опирание на балку",joint:"Стык элементов"};
  var nodes=[],nodeMeshes=[],nodeMats=new Map(),nodeMode="sel",showDetails=true,selectedNode=null,details=[];
  var boltMat=new T.MeshStandardMaterial({color:0x30363d,metalness:.35,roughness:.5});
  var plateMat=new T.MeshStandardMaterial({color:0x7d8793,metalness:.25,roughness:.55});
  function nodeMaterial(status){
   if(!nodeMats.has(status))nodeMats.set(status,new T.MeshBasicMaterial({color:nodeColors[status]||nodeColors.planned,depthTest:false,transparent:true,opacity:.92}));
   return nodeMats.get(status)
  }
  function statusOf(list){
   var st=list.map(function(m){return m.c.status==="mounted"?"mounted":m.c.status==="partial"?"partial":"planned"});
   return st.every(function(x){return x==="mounted"})?"mounted":st.some(function(x){return x!=="planned"})?"partial":"planned"
  }
  function computeNodes(){
   var list=[],plain=function(c){return !c.ft&&!(number(c.r)>0)&&!slight(c)};
   var cols=elems.filter(function(c){return c.geometryType==="column"&&plain(c)&&dataById.has(String(c.id))});
   var lines=elems.filter(function(c){return(c.geometryType==="beam"||c.geometryType==="brace"||c.geometryType==="bent")&&plain(c)&&dataById.has(String(c.id))});
   // Plan cells of 1 m: a node, a column or a member line is looked for in its own cells only (thousands of members
   // compared each with each took seconds).
   var CELL=1000,cellOf=function(v){return Math.floor(v/CELL)},key=function(i,j){return i+":"+j};
   var near=function(index,x,y,r,fn){for(var i=cellOf(x-r);i<=cellOf(x+r);i++)for(var j=cellOf(y-r);j<=cellOf(y+r);j++){var l=index.get(key(i,j));if(l)l.forEach(fn)}};
   var into=function(index,x0,y0,x1,y1,item){for(var i=cellOf(Math.min(x0,x1));i<=cellOf(Math.max(x0,x1));i++)for(var j=cellOf(Math.min(y0,y1));j<=cellOf(Math.max(y0,y1));j++){var k=key(i,j);(index.get(k)||index.set(k,[]).get(k)).push(item)}};
   var nodeCells=new Map(),colCells=new Map(),lineCells=new Map();
   cols.forEach(function(k){into(colCells,number(k.x),number(k.y),number(k.x),number(k.y),k)});
   lines.forEach(function(o){var ax=number(o.x),ay=number(o.y),bx=number(o.x2),by=number(o.y2);if(Math.hypot(bx-ax,by-ay)<=60000)into(lineCells,ax-350,ay-350,bx+350,by+350,o);else lineCells.set("long",(lineCells.get("long")||[]).concat([o]))});
   var put=function(kind,x,y,z,c,role,tol){
    tol=tol||450;var best=null;
    near(nodeCells,x,y,tol,function(n){var d=Math.hypot(n.x-x,n.y-y,n.z-z);if(d<=tol&&(!best||d<best.d))best={d:d,n:n}});
    var n=best?best.n:null;
    if(!n){n={kind:kind,x:x,y:y,z:z,members:[]};list.push(n);into(nodeCells,x,y,x,y,n)}
    else if(kind==="base"||kind==="top"&&n.kind!=="base"||kind==="side"&&(n.kind==="beam"||n.kind==="joint"))n.kind=kind;
    if(!n.members.some(function(m){return m.c===c&&m.role===role}))n.members.push({c:c,role:role});
    return n
   };
   cols.forEach(function(c){put("base",number(c.x),number(c.y),number(c.z0),c,"низ",250);put("top",number(c.x),number(c.y),number(topOf(c)),c,"верх",250)});
   var onLine=function(x,y,z,self){
    var best=null,seen=new Set();
    var test=function(o){
     if(o===self||seen.has(o))return;seen.add(o);
     var a={x:number(o.x),y:number(o.y),z:number(o.z0)},b={x:number(o.x2),y:number(o.y2),z:number(o.z2)},ab={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},L=ab.x*ab.x+ab.y*ab.y+ab.z*ab.z;if(L<1)return;
     var t=((x-a.x)*ab.x+(y-a.y)*ab.y+(z-a.z)*ab.z)/L;if(t<.02||t>.98)return;
     var q={x:a.x+ab.x*t,y:a.y+ab.y*t,z:a.z+ab.z*t},d=Math.hypot(q.x-x,q.y-y,q.z-z);
     if(d<=350&&(!best||d<best.d))best={d:d,q:q,o:o}
    };
    near(lineCells,x,y,0,test);(lineCells.get("long")||[]).forEach(test);
    return best
   };
   lines.forEach(function(c){
    [[number(c.x),number(c.y),number(c.z0),"начало"],[number(c.x2),number(c.y2),number(c.z2),"конец"]].forEach(function(e){
     var x=e[0],y=e[1],z=e[2],col=null;
     near(colCells,x,y,800,function(k){var d=Math.hypot(number(k.x)-x,number(k.y)-y);if(d<=800&&z>=number(k.z0)-300&&z<=number(topOf(k))+600&&(!col||d<col.d))col={d:d,k:k}});
     if(col){
      var k=col.k,kt=number(topOf(k)),top=Math.abs(z-kt)<=450||seatTop.has(String(k.id))&&z>kt&&z-kt<=650;
      put(top?"top":"side",number(k.x),number(k.y),top?kt:z,c,e[3],top?500:450);
      if(!top)put("side",number(k.x),number(k.y),z,k,"примыкание",450);
      return
     }
     var on=onLine(x,y,z,c);
     if(on){put("beam",on.q.x,on.q.y,on.q.z,c,e[3]);put("beam",on.q.x,on.q.y,on.q.z,on.o,"опора",450);return}
     put("joint",x,y,z,c,e[3])
    })
   });
   // A joint of one member's own end alone is not a node.
   return list.filter(function(n){return n.kind==="base"||n.kind==="top"||n.members.length>1}).map(function(n,i){n.id="У-"+String(i+1).padStart(4,"0");n.status=statusOf(n.members);return n})
  }
  function clearNodes(){
   nodeMeshes.forEach(function(m){helpers.remove(m)});nodeMeshes=[];
   details.forEach(function(d){detailGroup.remove(d.group)});details=[]
  }
  var nodeGeo=new T.OctahedronGeometry(.1,0);
  function buildNodes(){
   clearNodes();nodes=computeNodes();
   nodes.forEach(function(n){
    var mesh=new T.Mesh(nodeGeo,nodeMaterial(n.status));
    mesh.position.copy(toWorld(n.x,n.y,n.z));mesh.renderOrder=6;mesh.userData.node=n;
    helpers.add(mesh);nodeMeshes.push(mesh);n.mesh=mesh;
    var d=nodeDetail(n);if(d){detailGroup.add(d);details.push({group:d,node:n})}
   });
   if(selectedNode)selectedNode=nodes.find(function(n){return Math.hypot(n.x-selectedNode.x,n.y-selectedNode.y,n.z-selectedNode.z)<300})||null;
   paintNode()
  }
  function nodeDetail(n){
   if(n.kind!=="base"&&n.kind!=="top")return null;
   var col=n.members.find(function(m){return m.c.geometryType==="column"});if(!col)return null;
   var sec=sectionOf(col.c.profile_name||col.c.profileName,col.c.profile_standard),bw=sec?sec.b/1000:.36,hh=sec?sec.h/1000:.4,g=new T.Group();
   var at=toWorld(n.x,n.y,n.z);g.position.copy(at);
   if(n.kind==="base"){
    // Anchors as the base sheet gives them (number and diameter); without it four conditional ones. The plate itself is
    // drawn with the frame (seen from any distance), see baseParts.
    var bs=baseSize(col.c),cnt=bs.cnt,dia=bs.dia,side=bs.side,step=bs.step,pd=bs.pd;
    for(var i=0;i<cnt;i++){
     var row=i<side?-1:1,k=row<0?i:i-side,inRow=row<0?side:cnt-side,ax=inRow>1?-(inRow-1)*step/2+k*step:0,az=row*(pd/2-Math.max(.05,dia*1.5));
     var rod=new T.Mesh(shared("rod:"+dia,function(){return new T.CylinderGeometry(dia/2,dia/2,.1+dia*2,10)}),boltMat);rod.position.set(ax,(.1+dia*2)/2-.02,az);g.add(rod);
     var nut=new T.Mesh(shared("nut:"+dia,function(){return new T.CylinderGeometry(dia*.92,dia*.92,dia*.8,6)}),boltMat);nut.position.set(ax,dia*.4,az);g.add(nut)
    }
    // Ribs of the base on both flanges.
    [-1,1].forEach(function(q){var rib=new T.Mesh(shared("rib",function(){return new T.BoxGeometry(.012,.22,.14)}),plateMat);rib.position.set(0,.11,q*(hh/2+.07));g.add(rib)})
   }else{
    // The cap plate: wider than the column under a beam lying on it; flush with the section where beams come to the
    // sides at the top (an overhang went into their ends).
    var ov=seatTop.has(String(col.c.id))?.04:0;
    var cap=new T.Mesh(shared("cap:"+bw+":"+hh+":"+ov,function(){return new T.BoxGeometry(bw+ov,.02,hh+ov)}),plateMat);cap.position.y=.01;g.add(cap)
   }
   g.userData.detail=true;g.children.forEach(function(m){m.userData.memberId=String(col.c.id)});
   return g
  }
  // By default only the nodes of the selected member are marked (all of them at once hid the frame behind markers).
  function nodeVisible(n,cam){
   if(nodeMode==="off")return false;
   if(nodeMode==="sel")return Boolean(selected)&&n.members.some(function(m){return String(m.c.id)===selected});
   if(nodeMode==="open"&&n.status==="mounted")return false;
   return n.kind==="base"||n.kind==="top"||n.mesh.position.distanceTo(cam)<60
  }
  function paintNodesFrame(){
   var cam=camera.position;
   // Markers keep about the same size on the screen: small close up, still seen from afar.
   nodeMeshes.forEach(function(m){var n=m.userData.node;m.visible=nodeVisible(n,cam)||n===selectedNode;
    if(m.visible){var k=Math.max(.35,Math.min(6,m.position.distanceTo(cam)*.045))*(n===selectedNode?1.6:1)*Math.min(1.5,.85+n.members.length*.08);m.scale.set(k,k,k)}});
   details.forEach(function(d){d.group.visible=showDetails&&d.group.position.distanceTo(cam)<45})
  }
  function hitNode(){
   var hits=raycaster.intersectObjects(nodeMeshes.filter(function(m){return m.visible}),false);
   return hits[0]?hits[0].object.userData.node:null
  }
  var nodePanel;
  function axisOf(x,y){var ax=nearestAxis(axesX,gridX,x),ay=nearestAxis(axesY,gridY,y),dx=Math.round(x-number(gridX[ax])),dy=Math.round(y-number(gridY[ay]));
   return ax+"/"+ay+(dx||dy?" ("+(dx>0?"+":"")+fmt(dx)+"; "+(dy>0?"+":"")+fmt(dy)+")":"")}
  function level(z){var v=number(z)/1000;return(v>0?"+":v<0?"−":"")+Math.abs(v).toFixed(3).replace(".",",")}
  function paintNode(){
   if(!nodePanel)return;
   var n=selectedNode;nodePanel.hidden=!n;if(!n)return;
   var st={mounted:"смонтирован",partial:"частично",planned:"не смонтирован"},missing=n.members.filter(function(m){return m.c.status!=="mounted"});
   var names=n.members.filter(function(m){return m.c.geometryType==="column"}).map(function(m){return m.c.mark}).filter(Boolean);
   nodePanel.innerHTML='<div class="ir-three-place-head"><b>'+escapeHtml(n.id+" · "+nodeKinds[n.kind]+(names.length?" "+names[0]:""))+'</b><button type="button" data-node="close" title="Закрыть">×</button></div>'+
    '<div class="ir-three-node-meta"><span>Оси <b>'+escapeHtml(axisOf(n.x,n.y))+'</b></span><span>Отм. <b>'+level(n.z)+'</b></span><span class="st '+n.status+'">'+st[n.status]+'</span></div>'+
    '<div class="ir-three-node-list">'+n.members.map(function(m){
     var ms=m.c.status==="mounted"?"mounted":m.c.status==="partial"?"partial":"planned";
     return '<button type="button" data-node-member="'+escapeHtml(m.c.id)+'"><i class="'+ms+'"></i><b>'+escapeHtml(m.c.mark||m.c.title||"—")+'</b><span>'+escapeHtml((m.c.type_name||kindNames[m.c.geometryType]||"")+" · "+m.role)+'</span><small>'+escapeHtml(m.c.profile_name||"")+'</small></button>'
    }).join("")+'</div>'+
    jointHtml(n)+typeHtml(n)+
    (missing.length?'<p class="ir-three-node-wait">Ждёт монтажа: <b>'+escapeHtml([...new Set(missing.map(function(m){return m.c.mark||"—"}))].join(", "))+'</b></p>':'<p class="ir-three-node-ok">Все элементы узла смонтированы.</p>')+
    baseHtml(n)+
    (n.kind==="base"||n.kind==="top"?'<p class="ir-three-place-note">'+(n.kind==="top"?(n.members.some(function(m){return m.c.geometryType==="column"&&seatTop.has(String(m.c.id))})?
     "Опирание сверху: балка лежит на плите оголовка колонны, нижний пояс на болтах к плите, над опорой — пара опорных рёбер. Плита (t=20), рёбра и места болтов показаны условно — по узлам КМД.":
     "Плита оголовка показана условно — размеры не из КМД."):
     (baseOf(n)&&baseOf(n).anchors?"Число и диаметр анкеров — с листа базы; плита и рёбра показаны условно.":"Плита и анкеры на модели показаны условно — размеры не из КМД.")+
     (n.z<=300?" Фундамент под базой — условно, по КЖ.":""))+'</p>':"");
   nodePanel.querySelector('[data-node="close"]').onclick=function(){selectedNode=null;paintNode()};
   nodePanel.querySelectorAll("[data-node-member]").forEach(function(b){b.onclick=function(){choose(b.dataset.nodeMember)}})
  }
  // How the members of the node are joined, as the notes of their sheets say (bolts, their class, mounting welds).
  function jointHtml(n){
   var seen=new Map();n.members.forEach(function(m){var j=m.c.joint;if(j&&j.text){var k=j.text+"|"+(j.sheet||"");if(!seen.has(k))seen.set(k,{j:j,marks:[]});seen.get(k).marks.push(m.c.mark||"—")}});
   if(!seen.size)return'<p class="ir-three-place-note">Соединение: на листах элементов болты не указаны — смотрите узлы КМД.</p>';
   return'<div class="ir-three-node-base"><b>Соединение</b>'+[...seen.values()].map(function(x){
    return'<span>'+escapeHtml([...new Set(x.marks)].join(", ")+": "+x.j.text)+'</span>'+(x.j.sheet?'<small>'+escapeHtml("по указаниям "+x.j.sheet)+'</small>':"")+boltHtml(x.j)}).join("")+
    '<em>Число и места болтов на модели условные — по узлам КМД; комплект болта — по ГОСТ. Болты связей на фасонках стоят по наименьшим расстояниям СП 16.13330 (табл. 40): от торца 2,5d, шаг 3d.'+
    (n.members.some(function(m){return m.c.joint&&m.c.joint.gusset_mm})?"":" Фасонки показаны толщиной 12 мм условно — на листах толщина фасонок не указана.")+'</em></div>'
  }
  // The type of the node by the catalog of 1000 joints: chosen by what meets there (a column base, a beam end at a
  // column or on a beam, a joint of members), the nodes the sheets name first. Only a hint: the scheme is not changed.
  function nodeQuery(n){
   var named=[],seen=new Set(),bolted=false,hsb=false;
   n.members.forEach(function(m){var j=m.c.joint;if(!j)return;if(j.bolt)bolted=true;if(/высокопрочн|фрикц/i.test(j.text||""))hsb=true;
    (j.named||[]).forEach(function(x){var k=x.label+"|"+x.title;if(!seen.has(k)){seen.add(k);named.push(x)}})});
   var b=n.kind==="base"?baseOf(n):null;
   return{kind:n.kind,anchors:b&&b.anchors&&number(b.anchors.count)||0,named:named,bolted:bolted,hsb:hsb,
    members:n.members.map(function(m){return{geometry:m.c.geometryType,group:m.c.scheme_group||m.c.schemeGroup||"",name:m.c.mark_name||m.c.type_name||"",mark:m.c.mark||"",role:m.role}})}
  }
  function typeHtml(n){
   if(!jointKb)return"";
   var q=nodeQuery(n),k=jointKb.card(q);if(!k)return"";
   var cut=function(t,len){t=String(t||"");return t.length>len?t.slice(0,len-1)+"…":t};
   var list=function(title,items,max){items=(items||[]).filter(Boolean).slice(0,max);return items.length?'<small>'+escapeHtml(title+": "+items.map(function(x){return cut(x,200)}).join("; "))+'</small>':""};
   var named=q.named.filter(function(x){return x.group===k.group||(x.joints||[]).some(function(j){return j.group===k.group})});
   return'<div class="ir-three-node-base ir-three-node-type"><b>Тип узла по справочнику</b>'+
    '<span>'+escapeHtml(k.group+" · "+k.group_name)+': <b>'+escapeHtml(k.name)+'</b></span>'+
    (k.rows.length?'<small>'+escapeHtml("Ближайшие по перечню: "+k.rows.map(function(r){return r.code+" «"+cut(r.name,90)+"»"}).join("; "))+'</small>':"")+
    '<small>'+escapeHtml("Способ: "+k.method+"; работа узла: "+k.behaviour)+' · <i class="kb-st '+escapeHtml(k.status)+'">'+escapeHtml(k.status_text)+'</i></small>'+
    list("Состав",k.parts,4)+(k.drawing?'<small>'+escapeHtml("На чертеже: "+cut(k.drawing,220))+'</small>':"")+
    (k.placement?'<small>'+escapeHtml("Расстановка: "+cut(k.placement,220))+'</small>':"")+list("Правила",k.rules,3)+list("Нормы",k.norms,3)+
    (k.note?'<small>'+escapeHtml("Замечание: "+cut(k.note,220))+'</small>':"")+
    (named.length?'<small>'+escapeHtml("На листе: "+named.slice(0,3).map(function(x){var j=(x.joints||[])[0];return x.label+(x.title?" «"+x.title+"»":"")+(j?" — похоже на "+j.code+" «"+cut(j.name,80)+"»":"")}).join("; "))+'</small>':"")+
    (k.others.length?'<small>'+escapeHtml("Может быть и: "+k.others.slice(0,3).map(function(o){return o.name+" ("+o.status_text+")"}).join("; "))+'</small>':"")+
    '<em>Тип выбран по тому, какие элементы сходятся в узле; проверьте по узлу КМД. Справочник ничего не меняет в схеме.</em></div>'
  }
  // The bolt set drawn, with the sizes from the standards.
  function boltHtml(j){
   var m=/(\d{2})/.exec(String(j.bolt||""));if(!m)return"";var d=number(m[1]),set=boltSet(d),mm=function(v){return String(Math.round(v*10000)/10).replace(".",",")};
   if(!set)return'<small>'+escapeHtml("Размеров болта М"+d+" нет в базе — болт показан условно.")+'</small>';
   return'<small>'+escapeHtml("Болт М"+d+(j.cls?" кл. "+j.cls:"")+" ГОСТ 7798-70: головка S"+mm(set.S)+", высота "+mm(set.k)+"; шайба ГОСТ 11371-78 Ø"+mm(set.d2)+"×"+mm(set.s)+" под головку; 2 гайки ГОСТ 5915-70 S"+mm(set.nS)+"×"+mm(set.m)+
    ". Пружинная шайба ГОСТ 6402-70 под гайку не показана: её размеры в базе не подтверждены.")+'</small>'
  }
  function baseOf(n){var col=n.members.find(function(m){return m.c.geometryType==="column"&&m.c.base});return col?col.c.base:null}
  // The base of the column as the drawings give it: its mark on the base scheme, the anchors and the plate hole.
  function baseHtml(n){
   var b=n.kind==="base"?baseOf(n):null;if(!b)return"";
   var a=b.anchors||{},size=a.d_mm?"М"+a.d_mm+(a.length_mm?"×"+a.length_mm:""):"";
   return '<div class="ir-three-node-base"><b>База '+escapeHtml(b.mark||"")+'</b>'+
    (b.anchors?'<span>Анкерные болты: '+escapeHtml([a.count?a.count+" шт.":"",size,a.steel||""].filter(Boolean).join(" · "))+'</span>'+(a.designation?'<small>'+escapeHtml(a.designation)+'</small>':""):'<span>Лист базы не найден — анкеры не указаны</span>')+
    (b.plate_hole_mm?'<span>Отверстия в опорной плите ∅'+escapeHtml(b.plate_hole_mm)+' мм</span>':"")+
    (b.note?'<em>'+escapeHtml(b.note)+'</em>':"")+
    '<small>'+escapeHtml([b.scheme?"схема баз: "+b.scheme:"",b.sheet?"лист базы: "+b.sheet:""].filter(Boolean).join("; "))+'</small></div>'
  }
  function chooseNode(n){
   selectedNode=n;paintNode();
   if(n){var c=toWorld(n.x,n.y,n.z),dir=camera.position.clone().sub(controls.target).normalize(),d=Math.min(camera.position.distanceTo(controls.target),14);
    flight={from:controls.target.clone(),to:c,camFrom:camera.position.clone(),camTo:c.clone().add(dir.multiplyScalar(d)),t:0,ms:850,st:performance.now()}}
  }
  // Members of a lattice ([u0, z0, u1, z1, role, profile, across] in mm) placed by `at(u, z, across)`: a member with a profile
  // of the sortament is drawn by its section (paired angles back to back), the rest by a thin bar.
  function drawMembers(c,members,at,plane){
   var up=new T.Vector3(0,1,0),parts=[],mat=baseMaterial(c);
   members.forEach(function(m){
    var p0=at(number(m[0]),number(m[1]),number(m[6])),p1=at(number(m[2]),number(m[3]),number(m[6])),v=p1.clone().sub(p0),len=v.length();if(len<.05)return;
    var dir=v.clone().normalize(),y=up.clone().sub(dir.clone().multiplyScalar(up.dot(dir)));if(y.lengthSq()<1e-6)y=plane.clone().sub(dir.clone().multiplyScalar(plane.dot(dir)));
    y.normalize();var x=new T.Vector3().crossVectors(y,dir).normalize(),basis=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,dir));
    var pr=String(m[5]||""),sec=pr?sectionOf(/^\d/.test(pr)?"∟"+pr:pr):null;
    var put=function(geo,mirror){var mesh=new T.Mesh(geo,mat);mesh.position.copy(p0);mesh.quaternion.copy(basis);mesh.scale.set(mirror?-1:1,1,len);parts.push(mesh)};
    if(sec&&sec.shape==="angle"&&/^(?:2|\d)/.test(pr)){var g=realGeometry(T,meshGeo,sec);put(g,false);put(g,true)}
    else if(sec)put(realGeometry(T,meshGeo,sec),false);
    else{var key="truss-bar",bar=meshGeo.get(key);if(!bar){bar=new T.BoxGeometry(.08,.08,1);bar.translate(0,0,.5);meshGeo.set(key,bar)}put(bar,false)}
   });
   return parts
  }
  // A two-branch column: branches, upper part and the lattice on both faces of the branches, from its point and base.
  function addColumnLattice(c,id){
   var k=c.column,d=k.dir||[0,1],ux=number(d[0]),uy=number(d[1]),x0=number(c.x),y0=number(c.y),z0=number(c.z0);
   var at=function(u,z,w){return toWorld(x0+ux*u-uy*(w||0),y0+uy*u+ux*(w||0),z0+z)};
   var parts=drawMembers(c,k.members,at,at(1000,0).sub(at(0,0)).normalize());
   if(!parts.length)return false;
   parts.forEach(function(mesh){mesh.userData.memberId=id;steel.add(mesh);allMeshes.push(mesh);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)});
   var lab=toWorld(x0,y0,number(c.z2)||z0);lab.y+=.35;
   var el=document.createElement("span");el.className="ir-three-member-label";el.textContent=c.mark||c.title||"";
   labelLayer.appendChild(el);labels.push({el:el,pos:lab,id:id});
   return true
  }
  // A truss by its geometric scheme: chords, posts and diagonals in the plane of the truss over its plan line, from the
  // bottom node of its left support (the scheme's left end may be the plan line's end). A member with a profile of the
  // sortament («140х10» of paired angles) is drawn by two angles back to back; the rest — by a thin bar.
  function addTruss(c,id){
   var t=c.truss,a={x:number(c.x),y:number(c.y)},b={x:number(c.x2),y:number(c.y2)};
   if(t.flip){var q=a;a=b;b=q}
   var L=Math.hypot(b.x-a.x,b.y-a.y),span=number(t.span_mm)||L;if(L<500)return false;
   var ux=(b.x-a.x)/L,uy=(b.y-a.y)/L,k=L/span,base=number(t.base_mm);
   var at=function(x,z){return toWorld(a.x+ux*x*k,a.y+uy*x*k,base+z)};
   var parts=drawMembers(c,t.members,at,at(1000,0).sub(at(0,0)).normalize());
   if(!parts.length)return false;
   parts.forEach(function(mesh){mesh.userData.memberId=id;steel.add(mesh);allMeshes.push(mesh);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)});
   var tops=t.members.filter(function(m){return m[4]==="top"}),hi=tops.length?Math.max.apply(null,tops.map(function(m){return Math.max(number(m[1]),number(m[3]))})):0;
   var lab=at(span/2,hi);lab.y+=.35;
   var el=document.createElement("span");el.className="ir-three-member-label";el.textContent=c.mark||c.title||"";
   labelLayer.appendChild(el);labels.push({el:el,pos:lab,id:id});
   return true
  }
  function addFitting(c,id,start,end){
   var dir=end.clone().sub(start),len=dir.length();dir.normalize();
   if(c.ft==="flight"||c.ft==="ladder"){addStair(c,id,start,end);return}
   // A deck of a landing or a platform: a flat grating of its width between the two points.
   if(c.ft==="deck"){
    var dw=Math.max(.3,(number(c.fd)||1000)/1000),dm=new T.Mesh(new T.BoxGeometry(dw,.04,len),baseMaterial(c));
    dm.position.copy(start).add(end).multiplyScalar(.5);dm.rotation.y=Math.atan2(dir.x,dir.z);
    dm.userData.memberId=id;steel.add(dm);allMeshes.push(dm);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(dm);
    var dl=dm.position.clone();dl.y+=.3;
    var de=document.createElement("span");de.className="ir-three-member-label";de.textContent=c.mark||c.title||"";
    labelLayer.appendChild(de);labels.push({el:de,pos:dl,id:id});
    return
   }
   // A field of sandwich panels (АР): a wall one stands on its lower edge to its height, a roof one lies on the slope at
   // its width; a trim (нащельник, планка) — a thin bent strip of two shelves along its line.
   if(c.ft==="panel"||c.ft==="trim"){
    var up=new T.Vector3(0,1,0),xv=new T.Vector3().crossVectors(up,dir);if(xv.lengthSq()<1e-6)xv.set(1,0,0);xv.normalize();
    var yv=new T.Vector3().crossVectors(dir,xv).normalize(),q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(xv,yv,dir));
    var pm=[],put=function(geo,off){var m=new T.Mesh(geo,baseMaterial(c));m.quaternion.copy(q);m.position.copy(start).add(end).multiplyScalar(.5).add(off.applyQuaternion(q));pm.push(m)};
    var pt=Math.max(.04,(number(c.lay&&c.lay.thickness_mm)||120)/1000),pw=Math.max(.3,(number(c.fd)||1000)/1000);
    if(c.ft==="panel"&&c.lay&&c.lay.panel==="wall")put(new T.BoxGeometry(pt,pw,len),new T.Vector3(0,pw/2,0).applyQuaternion(q.clone().invert()));
    else if(c.ft==="panel")put(new T.BoxGeometry(pw,pt,len),new T.Vector3(0,pt/2,0));
    else{var leg=Math.max(.04,Math.min(.4,(number(c.fd)||100)/1000));put(new T.BoxGeometry(leg,.008,len),new T.Vector3(leg/2,0,0));put(new T.BoxGeometry(.008,leg,len),new T.Vector3(0,leg/2,0))}
    pm.forEach(function(mesh){mesh.userData.memberId=id;steel.add(mesh);allMeshes.push(mesh);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)});
    var pl=start.clone().add(end).multiplyScalar(.5);pl.y+=c.ft==="panel"&&c.lay&&c.lay.panel==="wall"?pw+.3:.3;
    var pe=document.createElement("span");pe.className="ir-three-member-label";pe.textContent=c.mark||c.title||"";
    labelLayer.appendChild(pe);labels.push({el:pe,pos:pl,id:id});
    return
   }
   var r=Math.max(.02,(number(c.fd)||159)/2000),type=c.ft,parts=[];
   var along=function(geo,at,lenZ){
    // geo is built along +Z from 0 to 1 (or centred when lenZ is 0): turned onto the fitting's axis at `at`.
    var mesh=new T.Mesh(geo,baseMaterial(c));mesh.position.copy(at);if(lenZ)mesh.scale.z=lenZ;
    mesh.quaternion.setFromUnitVectors(zAxis,dir);parts.push(mesh);return mesh
   };
   var tube=function(radius){var g=new T.CylinderGeometry(radius,radius,1,24,1,false);g.rotateX(Math.PI/2);g.translate(0,0,.5);return g};
   var disc=function(radius,thick){var g=new T.CylinderGeometry(radius,radius,thick,28);g.rotateX(Math.PI/2);return g};
   if(type==="rod"){along(tube(.02),start,len)}
   // Bolts of a joint: as many as the list gives, round the joint point — a shank and a hexagonal head.
   else if(type==="bolt"){
    var nb=Math.max(1,Math.min(24,number(c.lay&&c.lay.count)||2)),rb=Math.max(.006,(number(c.fd)||20)/2000);
    for(var k=0;k<nb;k++){var a=2*Math.PI*k/nb,o=new T.Vector3(Math.cos(a)*.07,0,Math.sin(a)*.07),at=start.clone().add(o);
     along(tube(rb),at,Math.max(.04,len));var hg=new T.CylinderGeometry(rb*1.8,rb*1.8,rb*1.4,6);hg.rotateX(Math.PI/2);along(hg,at.clone().add(dir.clone().multiplyScalar(Math.max(.04,len))),0)}
   }
   else{
    along(tube(r),start,len);
    // Flange at the outer end; hatches and manholes carry a cover over it.
    along(disc(r*1.3+.03,.03),end,0);
    if(type==="manhole"||type==="hatch")along(disc(r*1.25+.03,.05),end.clone().add(dir.clone().multiplyScalar(.04)),0);
    if(type==="valve"){var vb=new T.BoxGeometry(r*2.6,r*2.6,r*2.2);vb.translate(0,0,r*1.1);along(vb,end,0)}
    if(type==="foam"){var fb=new T.BoxGeometry(.45,.45,.7);fb.translate(0,0,.35);along(fb,end,0)}
    if(type==="sensor"){var sb=new T.BoxGeometry(r*2,r*2,r*1.6);sb.translate(0,0,r*.8);along(sb,end,0)}
   }
   parts.forEach(function(mesh){mesh.userData.memberId=id;steel.add(mesh);allMeshes.push(mesh);
    if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)});
   var top=end.clone();top.y+=.35;
   var el=document.createElement("span");el.className="ir-three-member-label";el.textContent=c.mark||c.title||"";
   labelLayer.appendChild(el);labels.push({el:el,pos:top,id:id})
  }
  // A stair flight (ГОСТ 23120, ГОСТ 31385): two stringers, treads at a rise of 200 (no more than 250), handrails 1.0 m
  // over the treads on both sides with a middle rail. A ladder (стремянка): two strings, rungs every 300 (no more than
  // 350) and cage hoops (R 400–450) every 800 from 2 m up. Width — diameter_mm of the record.
  function addStair(c,id,a,b){
   var ladder=c.ft==="ladder",w=Math.max(.4,(number(c.fd)||(ladder?600:800))/1000),parts=[],mat=baseMaterial(c);
   var lo=a.y<=b.y?a:b,hi=a.y<=b.y?b:a,d=hi.clone().sub(lo),flat=new T.Vector3(d.x,0,d.z),run=flat.length(),rise=d.y;
   if(run<.05)ladder=true;
   var up=new T.Vector3(0,1,0),side=run>.05?new T.Vector3(-flat.z,0,flat.x).normalize():new T.Vector3(1,0,0);
   var out=new T.Vector3().crossVectors(side,up).normalize(),basis=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(side,up,out));
   var bar=function(p,q,t){var v=q.clone().sub(p),L=v.length();if(L<.005)return;
    var m=new T.Mesh(barGeo(t),mat);m.position.copy(p);m.scale.z=L;m.quaternion.setFromUnitVectors(zAxis,v.normalize());parts.push(m)};
   var off=function(p,s,h){return p.clone().add(side.clone().multiplyScalar(s)).add(new T.Vector3(0,h||0,0))};
   var at=function(f){return lo.clone().add(d.clone().multiplyScalar(f))};
   [-w/2,w/2].forEach(function(s){bar(off(lo,s),off(hi,s),ladder?.05:.07)});
   if(ladder){
    var nr=Math.max(1,Math.ceil(rise/.3)-1);
    for(var k=1;k<=nr;k++){var p=at(k/(nr+1));bar(off(p,-w/2),off(p,w/2),.025)}
    if(rise>2.2)for(var z=2;z<rise;z+=.8){var hoop=new T.TorusGeometry(Math.max(.4,w/2+.1),.015,6,24,Math.PI);hoop.rotateX(Math.PI/2);
     var hm=new T.Mesh(hoop,mat);hm.position.copy(at(z/rise));hm.quaternion.copy(basis);parts.push(hm)}
   }else{
    var n=Math.max(2,Math.round(rise/.2));if(rise/n>.25)n=Math.ceil(rise/.25);
    var depth=Math.max(.2,run/n+.03);
    var tg=shared("tread:"+w+":"+depth.toFixed(3),function(){return new T.BoxGeometry(w,.03,depth)});
    for(var k=1;k<n;k++){var tm=new T.Mesh(tg,mat);tm.position.copy(at(k/n));tm.quaternion.copy(basis);parts.push(tm)}
    [-w/2,w/2].forEach(function(s){bar(off(lo,s,1),off(hi,s,1),.04);bar(off(lo,s,.5),off(hi,s,.5),.025);
     [0,.5,1].forEach(function(f){var p=at(f);bar(off(p,s),off(p,s,1),.035)})});
   }
   parts.forEach(function(mesh){mesh.userData.memberId=id;steel.add(mesh);allMeshes.push(mesh);
    if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)});
   var top=at(.5);top.y+=ladder?.35:1.3;
   var el=document.createElement("span");el.className="ir-three-member-label";el.textContent=c.mark||c.title||"";
   labelLayer.appendChild(el);labels.push({el:el,pos:top,id:id})
  }
  function refreshMaterials(){
   allMeshes.forEach(function(mesh){
    var c=dataById.get(mesh.userData.memberId);
    if(!mesh.userData.fixed)mesh.material=mesh.userData.roof?roofMaterial(c):mesh.userData.shell?shellMaterial(c):baseMaterial(c)
   });
   rayTargets=allMeshes.filter(function(m){return!m.userData.small});rebatch();lit=null;paintHighlight();
   root.querySelector("#irThreeCount").textContent=elems.length+" элементов"+(failures?" · без геометрии: "+failures:"")+(conventional.size?" · сечение условное: "+conventional.size:"");
   root.querySelector("#irThreeCount").title=conventional.size?"Профиль этих элементов не найден в справочнике сортаментов (или не указан) — сечение нарисовано условно, не по размерам":"Сечения нарисованы по справочнику сортаментов";
   paintLegend()
  }
  // Members merged into one mesh per material and per 15 m cell of the plan (a mirrored member keeps its faces turned
  // out). A cell far from the camera is drawn by boxes of the members (12 triangles each, not the rolled section), the
  // bolts only near: 4000 members with their sections, plates and bolts are near a million triangles, and a computer
  // whose graphics card is not used drew one picture for seconds — the program and the whole computer stood.
  var CELL=15,unitBox=null,boxMatrix=new T.Matrix4(),boxCentre=new T.Vector3(),boxSize=new T.Vector3();
  function merge(list,geoOf,matOf,mat){
   var nv=0,ni=0,p=new T.Vector3(),nm=new T.Matrix3();
   list.forEach(function(m){var g=geoOf(m),c=g.attributes.position.count;nv+=c;ni+=g.index?g.index.count:c});
   var pos=new Float32Array(nv*3),nor=new Float32Array(nv*3),idx=new Uint32Array(ni),v=0,i=0;
   list.forEach(function(m){
    var g=geoOf(m),P=g.attributes.position,N=g.attributes.normal,I=g.index,e=matOf(m),flip=e.determinant()<0,n=I?I.count:P.count;
    nm.getNormalMatrix(e);
    for(var k=0;k<P.count;k++){
     p.fromBufferAttribute(P,k).applyMatrix4(e);pos[(v+k)*3]=p.x;pos[(v+k)*3+1]=p.y;pos[(v+k)*3+2]=p.z;
     if(N){p.fromBufferAttribute(N,k).applyMatrix3(nm).normalize();nor[(v+k)*3]=p.x;nor[(v+k)*3+1]=p.y;nor[(v+k)*3+2]=p.z}
    }
    for(var t=0;t+2<n;t+=3){var a=I?I.getX(t):t,b=I?I.getX(t+1):t+1,c=I?I.getX(t+2):t+2;
     idx[i++]=v+a;idx[i++]=v+(flip?c:b);idx[i++]=v+(flip?b:c)}
    v+=P.count
   });
   var bg=new T.BufferGeometry();bg.setAttribute("position",new T.BufferAttribute(pos,3));bg.setAttribute("normal",new T.BufferAttribute(nor,3));
   bg.setIndex(new T.BufferAttribute(idx.subarray(0,i),1));bg.computeBoundingSphere();
   var bm=new T.Mesh(bg,mat);bm.matrixAutoUpdate=false;return bm
  }
  // The box of a member in its own axes: the section's extent along its length.
  function coarse(m){var g=m.geometry;return g.index&&g.index.count<=36||!g.index&&g.attributes.position.count<=36?g:unitBox}
  function coarseMatrix(m){
   var g=m.geometry;if(coarse(m)===g)return m.matrixWorld;
   if(!g.boundingBox)g.computeBoundingBox();g.boundingBox.getCenter(boxCentre);g.boundingBox.getSize(boxSize);
   return boxMatrix.copy(m.matrixWorld).multiply(new T.Matrix4().makeTranslation(boxCentre.x,boxCentre.y,boxCentre.z)).scale(boxSize)
  }
  function rebatch(){
   batches.children.slice().forEach(function(b){batches.remove(b);b.geometry.dispose()});
   steel.updateMatrixWorld(true);if(!unitBox)unitBox=new T.BoxGeometry(1,1,1);
   var groups=new Map();
   allMeshes.forEach(function(m){if(!m.visible)return;var e=m.matrixWorld.elements,k=(m.userData.small?"s":"m")+"|"+Math.floor(e[12]/CELL)+","+Math.floor(e[14]/CELL);
    var byMat=groups.get(k);if(!byMat)groups.set(k,byMat=new Map());var l=byMat.get(m.material);if(!l)byMat.set(m.material,l=[]);l.push(m)});
   // The bolt sets of the cell, by class.
   var seen=function(id){var l=meshesById.get(id);return!l||l.some(function(m){return m.visible})};
   var bolts=new Map();boltList.forEach(function(b){if(!seen(b.id))return;var k=b.cls+"|"+Math.floor(b.at.x/CELL)+","+Math.floor(b.at.z/CELL);if(!bolts.has(k))bolts.set(k,[]);bolts.get(k).push(b)});
   bolts.forEach(function(list,k){var items=[];list.forEach(function(b){items.push.apply(items,boltParts(b))});
    var bm=merge(items,function(m){return m.geometry},function(m){return m.matrixWorld},boltMats[k.split("|")[0]]);bm.userData.lod="small";batches.add(bm)});
   groups.forEach(function(byMat,k){
    var small=k[0]==="s";
    byMat.forEach(function(list,mat){
     var fine=merge(list,function(m){return m.geometry},function(m){return m.matrixWorld},mat);fine.userData.lod=small?"small":"fine";batches.add(fine);
     if(small)return;
     var box=merge(list,coarse,coarseMatrix,mat);box.userData.lod="coarse";box.visible=false;batches.add(box)
    })
   });
   lodAt=null;invalidate()
  }
  // Which of the two pictures of a cell is drawn: by the distance from the camera to the cell's members.
  var lodAt=null;
  function lod(){
   var cam=camera.position;if(lodAt&&lodAt.distanceToSquared(cam)<.25)return;lodAt=cam.clone();
   var near=light?22:45,bolts=light?8:18;
   batches.children.forEach(function(b){
    var s=b.geometry.boundingSphere,d=s?Math.max(0,cam.distanceTo(s.center)-s.radius):0;
    b.visible=b.userData.lod==="small"?d<bolts:b.userData.lod==="coarse"?d>=near:d<near
   })
  }
  // The selected member (blue) and the one under the cursor (orange) over their batch.
  var lit=null;
  function paintHighlight(){
   var key=selected+"|"+hover;if(lit===key)return;lit=key;
   overlay.children.slice().forEach(function(o){overlay.remove(o)});
   [[selected,selectedMat],[hover!==selected?hover:"",hoverMat]].forEach(function(s){
    if(s[0])(meshesById.get(s[0])||[]).forEach(function(m){var o=new T.Mesh(m.geometry,s[1]);o.matrixAutoUpdate=false;o.matrix.copy(m.matrixWorld);overlay.add(o)})
   });
   invalidate()
  }
  function legendRows(){
   var counts=new Map(),rows=[];
   elems.forEach(function(c){
    var k=colorMode==="status"?(statusColors[c.status]?c.status:"planned"):colorMode==="confidence"?instanceKey(c):colorMode==="mark"?String(c.mark||"Без марки"):kind(c);
    counts.set(k,(counts.get(k)||0)+1)
   });
   counts.forEach(function(n,k){
    var color=colorMode==="status"?statusColors[k][0]:colorMode==="confidence"?instanceColors[k][0]:colorMode==="mark"?hsvMark(T,k):(groups[k]||groups.other)[1];
    var name=colorMode==="status"?statusColors[k][1]:colorMode==="confidence"?instanceColors[k][1]:colorMode==="mark"?k:(groups[k]||groups.other)[0];
    rows.push({name:name,n:n,color:color})
   });
   rows.sort(function(a,b){return b.n-a.n||a.name.localeCompare(b.name,"ru",{numeric:true})});
   return rows
  }
  function prelimCount(){var n=0;elems.forEach(function(c){if(pale(c))n++});return n}
  function paintLegend(){
   var rows=legendRows(),shown=rows.slice(0,colorMode==="mark"?12:20);
   legend.innerHTML=shown.map(function(r){
    return '<span><i style="background:#'+r.color.toString(16).padStart(6,"0")+'"></i>'+escapeHtml(r.name)+' <small>'+r.n+'</small></span>'
   }).join("")+(rows.length>shown.length?'<span class="more">ещё '+(rows.length-shown.length)+'</span>':"")+
    (prelimCount()?'<span title="Экземпляры, определённые по чертежам не полностью: расставлены и показаны бледно. Причина — в карточке элемента."><i style="background:#c9d3dd;opacity:.6;outline:1px dashed #6f7f8f"></i>Предварительно <small>'+prelimCount()+'</small></span>':"")+
    (cranes.length&&showDetails?'<span data-crane style="cursor:pointer;font-weight:700" title="Краны и тали нарисованы условно (в КМ их нет): по рельсам и подкрановым путям. Щелчок — показать следующий"><i style="background:#ff6a00"></i>Краны (условно) <small>'+cranes.length+'</small></span>':"");
   legend.hidden=!rows.length&&!(cranes.length&&showDetails)
  }
  function applyBackground(){
   var choice=P.background||"standard",color=choice==="custom"&&P.backgroundColor?new T.Color(P.backgroundColor).getHex():backgrounds[choice]||backgrounds.standard;
   scene.background=new T.Color(color);
   var dark=new T.Color(color).getHSL({}).l<.35;
   // A dark floor is not lit (lit, it turned grey and the grid stood out light on it).
   floorMaterial.color.setHex(0xd0dfec);floor.material=dark?darkFloorMaterial:floorMaterial;
   if(Boolean(grid.userData.dark)!==dark){floorGrid(dark);grid.userData.dark=dark}
   root.classList.toggle("dark",dark)
  }
  var center=new T.Vector3(X/2,Math.max(4,Math.min(15,number(P.maxZ||10000)/1900)),Y/2);
  var radius=Math.max(24,Math.hypot(X,Y)*.95),controls=new T.OrbitControls(camera,renderer.domElement);
  controls.target.copy(center);controls.enableDamping=true;controls.dampingFactor=.12;
  controls.screenSpacePanning=true;controls.minDistance=.05;controls.maxDistance=radius*5;
  var raycaster=new T.Raycaster(),pointer=new T.Vector2(),flight=null;
  function setView(name){
   flight=null;
   root.querySelectorAll("[data-three-view]").forEach(function(b){b.classList.toggle("active",b.dataset.threeView===name)});
   controls.target.copy(center);camera.up.set(0,1,0);
   if(name==="top"){camera.position.set(center.x,Math.max(45,radius),center.z+.001);camera.up.set(0,0,-1)}
   else if(name==="front")camera.position.set(center.x,center.y+6,center.z+radius);
   else if(name==="side")camera.position.set(center.x+radius,center.y+6,center.z);
   else camera.position.set(center.x+radius*.78,center.y+radius*.5,center.z+radius*.92);
   camera.lookAt(center);controls.update()
  }
  // Smooth camera move to a member, keeping the viewing direction.
  function focus(id){
   var meshes=meshesById.get(String(id));if(!meshes||!meshes.length)return false;
   var box=new T.Box3();meshes.forEach(function(m){box.expandByObject(m)});
   var c=box.getCenter(new T.Vector3()),size=Math.max(6,box.getSize(new T.Vector3()).length()*2.2);
   var dir=camera.position.clone().sub(controls.target).normalize();
   flight={from:controls.target.clone(),to:c,camFrom:camera.position.clone(),camTo:c.clone().add(dir.multiplyScalar(size)),t:0,ms:850,st:performance.now()};
   return true
  }
  function choose(id){
   selected=String(id||"");P.onSelect&&P.onSelect(selected);paintHighlight()
  }
  function screenRay(e){
   var rect=renderer.domElement.getBoundingClientRect();
   pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
   raycaster.setFromCamera(pointer,camera)
  }
  function hitMember(){
   var hits=raycaster.intersectObjects(rayTargets,false);
   return hits[0]?{id:hits[0].object.userData.memberId,point:hits[0].point}:null
  }
  // ---- Copy a member to another place on the ground plane.
  function reportCopyError(message){
   var hint=root.querySelector("#irThreeCopyHint");
   hint.hidden=false;hint.querySelector(".ir-three-action-error")?.remove();
   var p=document.createElement("span");p.className="ir-three-action-error";p.textContent=message;hint.appendChild(p)
  }
  function startCopy(id){
   if(!P.canEdit||!dataById.has(String(id)))return;
   cancelPlacement();copySource=String(id);root.querySelector("#irThreeCopyHint").hidden=false;viewport.classList.add("copy-target")
  }
  function cancelCopy(){
   copySource="";copyBusy=false;viewport.classList.remove("copy-target");
   var hint=root.querySelector("#irThreeCopyHint");hint.hidden=true;
   hint.querySelector(".ir-three-action-error")?.remove()
  }
  function copyToGround(e){
   if(copyBusy||!copySource||!P.canEdit||!P.onCopyPlacement)return;
   screenRay(e);
   var point=new T.Vector3();
   if(!raycaster.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),0),point)||point.x<0||point.x>X||point.z<0||point.z>Y){
    reportCopyError("Выберите точку внутри сетки монтажной схемы.");return
   }
   var mm=fromWorld(point);copyBusy=true;
   Promise.resolve().then(function(){return P.onCopyPlacement(copySource,{x:mm.x,y:mm.y})})
    .then(function(id){cancelCopy();P.onCopied&&P.onCopied(id)})
    .catch(function(error){copyBusy=false;reportCopyError(String(error&&error.message||error))})
  }
  // ---- Interactive placement: pick a mark, click grid nodes or existing members.
  var markerMat=new T.MeshBasicMaterial({color:0xff7a00,depthTest:false}),pointMat=new T.MeshBasicMaterial({color:0x0b63d1,depthTest:false});
  var previewMat=new T.LineBasicMaterial({color:0xff7a00,depthTest:false});
  var marker=new T.Mesh(new T.SphereGeometry(.18,16,12),markerMat);marker.renderOrder=10;marker.visible=false;helpers.add(marker);
  var preview=null,pointMarks=[];
  function nearestAxis(names,pos,value){
   var best=names[0]||"";names.forEach(function(n){if(Math.abs(number(pos[n])-value)<Math.abs(number(pos[best])-value))best=n});return best
  }
  function anchor(x,y,z,memberId,source){
   var ax=nearestAxis(axesX,gridX,x),ay=nearestAxis(axesY,gridY,y);
   return{x:x,y:y,z:z,ax:ax,ay:ay,dx:Math.round(x-number(gridX[ax])),dy:Math.round(y-number(gridY[ay])),memberId:memberId||"",source:source}
  }
  function snapGround(mm,z){
   var ax=nearestAxis(axesX,gridX,mm.x),ay=nearestAxis(axesY,gridY,mm.y),nx=number(gridX[ax]),ny=number(gridY[ay]);
   var tol=Math.max(250,camera.position.distanceTo(controls.target)*14);
   if(Math.hypot(mm.x-nx,mm.y-ny)<=tol*1.6)return anchor(nx,ny,z,"","узел "+ax+"/"+ay);
   var x=Math.abs(mm.x-nx)<=tol?nx:Math.round(mm.x/50)*50,y=Math.abs(mm.y-ny)<=tol?ny:Math.round(mm.y/50)*50;
   return anchor(x,y,z,"",x===nx?"ось "+ax:y===ny?"ось "+ay:"между осями")
  }
  // A beam rests on the top of a column, or on any point of another member.
  function snapMember(hit,mark){
   var c=dataById.get(hit.id);if(!c)return null;
   if(c.geometryType==="column"&&mark.geometry!=="column")return anchor(number(c.x),number(c.y),number(c.z2),c.id,"верх "+(c.mark||"колонны"));
   var p=memberPoints(c),best=null;
   for(var i=0;i<p.length-1;i++){
    var a=p[i],b=p[i+1],ab=b.clone().sub(a),t=Math.max(0,Math.min(1,hit.point.clone().sub(a).dot(ab)/Math.max(1e-9,ab.lengthSq())));
    var q=a.clone().add(ab.multiplyScalar(t)),d=q.distanceTo(hit.point);
    if(!best||d<best.d)best={d:d,q:q,a:a,b:b}
   }
   [best.a,best.b].forEach(function(end){if(end.distanceTo(best.q)<.3)best.q=end.clone()});
   var mm=fromWorld(best.q);
   return anchor(Math.round(mm.x),Math.round(mm.y),Math.round(mm.z),c.id,"на "+(c.mark||"элементе"))
  }
  function placementSnap(e){
   screenRay(e);
   var mark=placing.mark,hit=hitMember();
   if(hit&&mark){var s=snapMember(hit,mark);if(s)return s}
   var level=mark&&mark.geometry==="column"?placing.z0:placing.level,point=new T.Vector3();
   if(!raycaster.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-level/1000),point))return null;
   var mm=fromWorld(point);
   if(mm.x<-1||mm.x>spanX+1||mm.y<-1||mm.y>spanY+1)return null;
   return snapGround(mm,level)
  }
  function needed(){
   var g=placing.geometry;return g==="column"?1:g==="bent"&&placing.ridge==="manual"?3:2
  }
  function pointNames(){return placing.geometry==="bent"&&placing.ridge==="manual"?["Начало","Конёк","Конец"]:placing.geometry==="column"?["Точка"]:["Начало","Конец"]}
  function clearPreview(){
   if(preview){helpers.remove(preview);preview.geometry.dispose();preview=null}
   pointMarks.forEach(function(m){helpers.remove(m)});pointMarks=[]
  }
  function drawPoints(current){
   clearPreview();
   var pts=placing.points.map(function(p){return toWorld(p.x,p.y,p.z)});
   pts.forEach(function(v){var m=new T.Mesh(marker.geometry,pointMat);m.position.copy(v);m.renderOrder=10;helpers.add(m);pointMarks.push(m)});
   if(placing.geometry==="column"&&current)pts=[toWorld(current.x,current.y,placing.z0),toWorld(current.x,current.y,placing.z1)];
   else if(current&&pts.length<needed())pts.push(toWorld(current.x,current.y,current.z));
   if(pts.length>1){preview=new T.Line(new T.BufferGeometry().setFromPoints(pts),previewMat);preview.renderOrder=9;helpers.add(preview)}
  }
  function availableMarks(){return(P.marks||[]).filter(function(m){return m.left>0})}
  function startPlacement(){
   if(!P.canEdit)return;
   cancelCopy();
   var marks=availableMarks();
   placing={query:"",mark:null,geometry:"column",ridge:"center",ridgeZ:"",points:[],z0:0,z1:number(P.lastTopZ)||6000,level:number(P.lastLevel)||4500,
    series:true,chain:false,error:"",busy:false};
   if(marks.length)selectMark(marks[0].id);
   paintPlacement();placePanel.hidden=false;viewport.classList.add("placing")
  }
  function selectMark(id){
   var m=(P.marks||[]).find(function(x){return String(x.id)===String(id)});
   placing.mark=m||null;placing.points=[];placing.error="";
   placing.geometry=m?(m.geometry==="beam"&&placing.geometry==="bent"?"bent":m.geometry):"column"
  }
  function cancelPlacement(){
   placing=null;clearPreview();marker.visible=false;cursor.hidden=true;placePanel.hidden=true;viewport.classList.remove("placing")
  }
  function pointText(p,i){
   return '<div class="ir-three-place-point"><b>'+pointNames()[i]+'</b><span>'+escapeHtml(p.ax+"/"+p.ay+(p.dx||p.dy?" ("+(p.dx?(p.dx>0?"+":"")+fmt(p.dx):"0")+"; "+(p.dy?(p.dy>0?"+":"")+fmt(p.dy):"0")+")":""))+
    ' · '+escapeHtml(p.source||"")+'</span><label>Z, мм <input type="number" step="10" data-place-z="'+i+'" value="'+Math.round(p.z)+'"></label></div>'
  }
  function paintPlacement(){
   if(!placing)return;
   var marks=(P.marks||[]),q=placing.query.trim().toLowerCase(),list=marks.filter(function(m){return m.left>0&&(!q||String(m.title+" "+m.mark).toLowerCase().indexOf(q)>=0)});
   var m=placing.mark,g=placing.geometry,count=needed(),ready=m&&placing.points.length>=count;
   placePanel.innerHTML='<div class="ir-three-place-head"><b>Добавить элемент</b><button type="button" data-place="close" title="Закрыть (Esc)">×</button></div>'+
    (!marks.some(function(x){return x.left>0})?'<p class="ir-three-place-note">Нет марок с остатком по ведомости. Добавьте марки или откройте форму.</p>':
    '<label class="ir-three-place-field">Марка<input type="search" data-place="search" value="'+escapeHtml(placing.query)+'" placeholder="Поиск марки"></label>'+
    '<select data-place="mark" data-native-select="1" size="5">'+list.slice(0,200).map(function(x){
     return '<option value="'+escapeHtml(x.id)+'" '+(m&&String(m.id)===String(x.id)?"selected":"")+'>'+escapeHtml(x.title||x.mark)+' · '+(kindNames[x.geometry]||x.geometry)+' · осталось '+x.left+' из '+x.total+'</option>'
    }).join("")+'</select>')+
    (m?'<div class="ir-three-place-kind">'+escapeHtml(m.mark||m.title)+' — '+escapeHtml(kindNames[g]||g)+
     (m.geometry==="beam"?'<label class="ir-three-check"><input type="checkbox" data-place="bent" '+(g==="bent"?"checked":"")+'> ломаная (конёк)</label>':"")+'</div>'+
     (g==="bent"?'<div class="ir-three-place-row"><label>Конёк <select data-place="ridge" data-native-select="1"><option value="center" '+(placing.ridge==="center"?"selected":"")+'>посередине</option><option value="manual" '+(placing.ridge==="manual"?"selected":"")+'>указать точкой</option></select></label>'+
      (placing.ridge==="center"?'<label>Z конька, мм <input type="number" step="10" data-place="ridgeZ" value="'+escapeHtml(placing.ridgeZ)+'"></label>':"")+'</div>':"")+
     (g==="column"?'<div class="ir-three-place-row"><label>Низ, мм <input type="number" step="10" data-place="z0" value="'+placing.z0+'"></label><label>Верх, мм <input type="number" step="10" data-place="z1" value="'+placing.z1+'"></label></div>':
      '<div class="ir-three-place-row"><label title="Высота, на которой выбираются точки, если не попали на колонну или балку">Плоскость, мм <input type="number" step="10" data-place="level" value="'+placing.level+'"></label></div>')+
     '<p class="ir-three-place-note">'+(g==="column"?"Щёлкните узел сетки или точку на плане.":
      "Щёлкните "+pointNames().slice(placing.points.length).join(", затем ").toLowerCase()+": верх колонны, точку на балке или узел сетки.")+'</p>'+
     placing.points.map(pointText).join("")+
     '<div class="ir-three-place-row"><label class="ir-three-check"><input type="checkbox" data-place="series" '+(placing.series?"checked":"")+'> серия</label>'+
     (g!=="column"?'<label class="ir-three-check"><input type="checkbox" data-place="chain" '+(placing.chain?"checked":"")+'> цепочкой</label>':"")+'</div>':"")+
   (placing.error?'<p class="ir-three-action-error">'+escapeHtml(placing.error)+'</p>':"")+
   '<div class="ir-three-place-actions">'+
    (P.onQuickPlace?'<button type="button" class="primary" data-place="save" '+(ready&&!placing.busy?"":"disabled")+'>Сохранить</button>':"")+
    '<button type="button" data-place="form" '+(m?"":"disabled")+' title="Открыть полную форму с выбранными точками">В форме…</button>'+
    '<button type="button" data-place="reset" '+(placing.points.length?"":"disabled")+'>Сбросить точки</button></div>';
   bindPlacement()
  }
  function bindPlacement(){
   var on=function(sel,ev,fn){var el=placePanel.querySelector('[data-place="'+sel+'"]');if(el)el.addEventListener(ev,fn)};
   on("close","click",cancelPlacement);
   on("search","input",function(e){
    placing.query=e.target.value;var at=e.target.selectionStart;paintPlacement();
    var s=placePanel.querySelector('[data-place="search"]');s.focus();try{s.setSelectionRange(at,at)}catch(_e){}
   });
   on("mark","change",function(e){selectMark(e.target.value);drawPoints(null);paintPlacement()});
   on("bent","change",function(e){placing.geometry=e.target.checked?"bent":"beam";placing.points=[];drawPoints(null);paintPlacement()});
   on("ridge","change",function(e){placing.ridge=e.target.value;placing.points=[];drawPoints(null);paintPlacement()});
   on("ridgeZ","change",function(e){placing.ridgeZ=e.target.value});
   on("z0","change",function(e){placing.z0=number(e.target.value)});
   on("z1","change",function(e){placing.z1=number(e.target.value)});
   on("level","change",function(e){placing.level=number(e.target.value)});
   on("series","change",function(e){placing.series=e.target.checked});
   on("chain","change",function(e){placing.chain=e.target.checked});
   on("reset","click",function(){placing.points=[];placing.error="";drawPoints(null);paintPlacement()});
   on("save","click",savePlacement);
   on("form","click",function(){var data=placementData(true);if(!data)return;var p=P.onPlacement;cancelPlacement();p&&p(data)});
   placePanel.querySelectorAll("[data-place-z]").forEach(function(input){
    input.addEventListener("change",function(){var p=placing.points[Number(input.dataset.placeZ)];if(p){p.z=number(input.value);drawPoints(null)}})
   })
  }
  function placementData(partial){
   var m=placing.mark;if(!m)return null;
   var pts=placing.points,g=placing.geometry,strip=function(p){return p?{ax:p.ax,ay:p.ay,dx:p.dx,dy:p.dy,z:p.z,memberId:p.memberId}:null};
   if(!partial&&pts.length<needed())return null;
   var start=pts[0]||null;
   if(g==="column")return{markId:m.id,geometry:"column",start:start?{ax:start.ax,ay:start.ay,dx:start.dx,dy:start.dy,z:start.memberId?start.z:placing.z0,memberId:start.memberId}:null,topZ:placing.z1,height:placing.z1};
   var end=g==="bent"&&placing.ridge==="manual"?pts[2]:pts[1];
   var data={markId:m.id,geometry:g,start:strip(start),end:strip(end),height:end?end.z:placing.level,ridgeMode:g==="bent"?placing.ridge:undefined,zigzag:placing.chain};
   if(g==="bent")data.middle=placing.ridge==="manual"?strip(pts[1]):{z:number(placing.ridgeZ)};
   return data
  }
  function savePlacement(){
   if(!placing||placing.busy||!P.onQuickPlace)return;
   var data=placementData(false);if(!data){placing.error="Укажите все точки.";paintPlacement();return}
   if(data.geometry==="bent"&&data.ridgeMode==="center"&&!String(placing.ridgeZ).trim()){placing.error="Укажите отметку конька.";paintPlacement();return}
   placing.busy=true;placing.error="";paintPlacement();
   Promise.resolve().then(function(){return P.onQuickPlace(data)}).then(function(result){
    if(!placing)return;
    var end=placing.points[placing.points.length-1];
    placing.busy=false;placing.points=[];
    if(placing.geometry==="column")P.lastTopZ=placing.z1;else P.lastLevel=placing.level;
    if(placing.chain&&end&&placing.geometry!=="column"){var saved=result&&result.savedEnd||end;placing.points=[anchor(number(saved.x),number(saved.y),number(saved.z),"","конец предыдущего")]}
    var keep=placing.series;
    P.onQuickPlaced&&P.onQuickPlaced(result);
    if(!keep)cancelPlacement()
   }).catch(function(error){if(!placing)return;placing.busy=false;placing.error=String(error&&error.message||error);paintPlacement()})
  }
  function placementMove(e){
   var s=placementSnap(e);
   if(!s){marker.visible=false;cursor.hidden=true;drawPoints(null);return}
   var z=placing.geometry==="column"&&!s.memberId?placing.z0:s.z;
   marker.position.copy(toWorld(s.x,s.y,z));marker.visible=true;drawPoints(s);
   var rect=viewport.getBoundingClientRect();
   cursor.hidden=false;cursor.style.left=(e.clientX-rect.left+14)+"px";cursor.style.top=(e.clientY-rect.top+14)+"px";
   cursor.textContent=s.ax+"/"+s.ay+" · "+s.source+" · Z "+fmt(z)
  }
  function placementClick(e){
   if(!placing.mark){placing.error="Выберите марку.";paintPlacement();return}
   var s=placementSnap(e);if(!s){placing.error="Точка вне сетки схемы.";paintPlacement();return}
   if(placing.points.length>=needed())placing.points=[];
   placing.points.push(s);placing.error="";drawPoints(null);paintPlacement();
   // A column is complete after one click.
   if(placing.geometry==="column"&&P.onQuickPlace)savePlacement()
  }
  // ---- Pointer and keys.
  var pointerDown=null;
  function down(e){if(e.button===0)pointerDown=[e.clientX,e.clientY]}
  function up(e){
   if(!pointerDown||e.button!==0)return;
   var moved=Math.hypot(e.clientX-pointerDown[0],e.clientY-pointerDown[1]);pointerDown=null;
   if(moved>=5)return;
   if(placing){placementClick(e);return}
   if(copySource){copyToGround(e);return}
   screenRay(e);
   var node=hitNode();if(node){chooseNode(node);return}
   var hit=hitMember();choose(hit?hit.id:"")
  }
  // The member under the cursor is looked for once a frame, not on every move of the mouse.
  var pendingHover=null;
  function move(e){
   if(pointerDown||e.buttons)return;
   if(placing){placementMove(e);invalidate();return}
   pendingHover={clientX:e.clientX,clientY:e.clientY}
  }
  function hoverNow(){
   var e=pendingHover;pendingHover=null;screenRay(e);var hit=hitMember(),next=hit?hit.id:"";
   if(next!==hover){hover=next;paintHighlight()}
  }
  function leave(){pendingHover=null;if(hover){hover="";paintHighlight()}if(placing){marker.visible=false;cursor.hidden=true;drawPoints(null);invalidate()}}
  function onKey(e){
   if(e.key!=="Escape"&&e.key!=="Enter")return;
   invalidate();
   if(e.target&&e.target.closest&&e.target.closest("dialog"))return;
   if(e.key==="Escape"&&placing){cancelPlacement();e.preventDefault()}
   else if(e.key==="Escape"&&copySource){cancelCopy();e.preventDefault()}
   else if(e.key==="Enter"&&placing&&placePanel.contains(document.activeElement)&&document.activeElement.dataset.place!=="search")savePlacement()
  }
  renderer.domElement.addEventListener("pointerdown",down);
  renderer.domElement.addEventListener("pointerup",up);
  renderer.domElement.addEventListener("pointermove",move);
  renderer.domElement.addEventListener("pointerleave",leave);
  renderer.domElement.addEventListener("pointerenter",function(){overView=true});
  renderer.domElement.addEventListener("pointerleave",function(){overView=false});
  document.addEventListener("keydown",onKey);
  viewport.addEventListener("wheel",wheel,{capture:true,passive:false});renderer.domElement.addEventListener("dblclick",dblclick);
  document.addEventListener("keydown",keyDown);document.addEventListener("keyup",keyUp);document.addEventListener("keydown",shiftKey);document.addEventListener("keyup",shiftKey);
  function releaseKeys(){held.clear()}
  window.addEventListener("blur",releaseKeys);
  controls.addEventListener("change",function(){invalidate(700)});controls.addEventListener("start",function(){flight=null});
  // Anything done on the panels (toggles, the node card, placement) may change the picture.
  ["click","change","input","keydown","pointerup"].forEach(function(t){root.addEventListener(t,invalidate,true)});
  root.querySelectorAll("[data-three-view]").forEach(function(button){button.onclick=function(){setView(button.dataset.threeView)}});
  root.querySelector("#irThreeReset").onclick=function(){setView("iso")};
  root.querySelector("#irThreeAdd")?.addEventListener("click",function(){placing?cancelPlacement():startPlacement()});
  root.querySelector("#irThreeCancelCopy").onclick=cancelCopy;
  root.querySelector("#irThreeColors").value=colorMode;
  root.querySelector("#irThreeColors").onchange=function(e){colorMode=e.target.value;P.onColorModeChange&&P.onColorModeChange(colorMode);refreshMaterials()};
  root.querySelector("#irThreeGrid").onchange=function(e){showGrid=e.target.checked;ground.visible=showGrid};
  root.querySelector("#irThreeAxes").onchange=function(e){showAxes=e.target.checked};
  root.querySelector("#irThreeNodes").onchange=function(e){nodeMode=e.target.value;if(nodeMode==="off"){selectedNode=null;paintNode()}};
  // «Краны» in the legend: the camera goes to the next crane. A crane on a runway is looked at along its span from below
  // the bridge (from above the roof hid it); the crane stands at a third of the runway, the camera on the longer side.
  legend.onclick=function(e){
   if(!e.target.closest("[data-crane]")||!cranes.length)return;
   var k=cranes[craneTurn++%cranes.length],d=Math.max(12,k.size*.9);
   var to=k.along?k.at.clone().add(k.along.clone().multiplyScalar(d)).add(new T.Vector3(0,-2.5,0)):k.at.clone().add(camera.position.clone().sub(controls.target).normalize().multiplyScalar(d));
   flight={from:controls.target.clone(),to:k.at.clone(),camFrom:camera.position.clone(),camTo:to,t:0,ms:850,st:performance.now()};invalidate()
  };
  root.querySelector("#irThreeDetails").onchange=function(e){showDetails=e.target.checked;equipment.visible=showDetails;paintLegend();
   pedestals.forEach(function(m){m.visible=showDetails});rebatch()};
  function resize(){
   var w=Math.max(250,viewport.clientWidth),h=Math.max(300,viewport.clientHeight);
   renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();invalidate()
  }
  var observer=window.ResizeObserver?new ResizeObserver(resize):null;
  if(observer)observer.observe(viewport);
  window.addEventListener("resize",resize);resize();
  function project(v,w,h){var p=v.clone().project(camera);return{x:(p.x*.5+.5)*w,y:(-p.y*.5+.5)*h,inside:p.z<1&&p.z>-1}}
  // Axis bubbles that would cover one another on the screen (dense grids seen from afar) are left out.
  function paintTags(w,h){
   var taken=[];
   screenTags.forEach(function(t){
    var on=t.group==="axes"?showAxes&&showGrid:P.showDimensions&&showGrid;
    if(!on){t.el.hidden=true;return}
    var p=project(t.pos,w,h);
    t.el.hidden=!p.inside||p.x<10||p.x>w-10||p.y<10||p.y>h-10;
    if(!t.el.hidden&&t.group==="axes"){
     if(taken.some(function(q){return Math.abs(q.x-p.x)<22&&Math.abs(q.y-p.y)<20}))t.el.hidden=true;else taken.push(p)
    }
    if(!t.el.hidden){t.el.style.left=p.x+"px";t.el.style.top=p.y+"px"}
   })
  }
  // Member labels: nearest first, never on top of each other, at most 160.
  function paintLabels(w,h){
   if(!P.showLabels){labels.forEach(function(l){l.el.hidden=true});return}
   var cam=camera.position,cells=new Set(),shown=0;
   var order=labels.map(function(l){return{l:l,d:l.pos.distanceToSquared(cam)}}).sort(function(a,b){return a.d-b.d});
   order.forEach(function(o){
    var l=o.l,p=project(l.pos,w,h);
    if(shown>=160||!p.inside||p.x<6||p.x>w-6||p.y<6||p.y>h-6){l.el.hidden=true;return}
    var cx=Math.floor(p.x/58),cy=Math.floor(p.y/18),k=cx+":"+cy;
    if(cells.has(k)&&l.id!==selected){l.el.hidden=true;return}
    cells.add(k);shown++;l.el.hidden=false;l.el.classList.toggle("selected",l.id===selected);
    l.el.style.left=p.x+"px";l.el.style.top=p.y+"px"
   })
  }
  // ---- Moving through the model. The wheel flies to the point under the cursor (a member, else the floor); W A S D or
  // the arrows move over the plan along the view, Q and E down and up, Shift faster; a double click makes the point under
  // the cursor the centre of rotation.
  var held=new Set(),overView=false;
  function pointAt(e){
   screenRay(e);var hit=hitMember();if(hit)return hit.point;
   var q=new T.Vector3();return raycaster.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-ground.position.y),q)?q:null
  }
  // Like the report of 21.10.2026: each step scales the camera and the centre of rotation toward the point under the
  // cursor (16 % a notch), the point is looked for once and kept while the wheel turns at one place.
  var wheelAt={x:-9,y:-9,t:0,p:null};
  function wheel(e){
   if(placing&&e.ctrlKey)return;
   e.preventDefault();e.stopPropagation();flight=null;
   var now=performance.now(),p;
   if(wheelAt.p&&now-wheelAt.t<250&&Math.hypot(e.clientX-wheelAt.x,e.clientY-wheelAt.y)<4)p=wheelAt.p;
   else{p=pointAt(e)||controls.target.clone();wheelAt={x:e.clientX,y:e.clientY,t:now,p:p}}
   wheelAt.t=now;
   var k=Math.pow(1.0015,e.deltaY*(e.deltaMode===1?33:1)),cam=camera.position;
   var next=p.clone().add(cam.clone().sub(p).multiplyScalar(k));
   if(k<1&&next.distanceTo(p)<.3)return;
   if(k>1&&next.distanceTo(controls.target)>controls.maxDistance)return;
   controls.target.copy(p.clone().add(controls.target.clone().sub(p).multiplyScalar(k)));cam.copy(next);invalidate(700)
  }
  function dblclick(e){
   if(placing||copySource)return;
   var p=pointAt(e);if(!p)return;
   var shift=p.clone().sub(controls.target);
   flight={from:controls.target.clone(),to:p,camFrom:camera.position.clone(),camTo:camera.position.clone().add(shift),t:0,ms:280,st:performance.now(),out:true}
  }
  var walkKeys={KeyW:1,KeyA:1,KeyS:1,KeyD:1,KeyQ:1,KeyE:1,ArrowUp:1,ArrowDown:1,ArrowLeft:1,ArrowRight:1};
  function typing(t){return t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))}
  function keyDown(e){
   if(!walkKeys[e.code]||e.ctrlKey||e.altKey||e.metaKey||typing(e.target))return;
   if(!overView&&!root.contains(document.activeElement))return;
   held.add(e.code);e.preventDefault()
  }
  function keyUp(e){held.delete(e.code)}
  function walk(dt){
   if(!held.size||!dt)return false;
   var f=camera.getWorldDirection(new T.Vector3());f.y=0;if(f.lengthSq()<1e-6)f.set(0,0,-1).applyQuaternion(camera.quaternion).setY(0);f.normalize();
   var r=new T.Vector3(-f.z,0,f.x),v=new T.Vector3(),has=function(a,b){return held.has(a)||held.has(b)};
   if(has("KeyW","ArrowUp"))v.add(f);if(has("KeyS","ArrowDown"))v.sub(f);if(has("KeyD","ArrowRight"))v.add(r);if(has("KeyA","ArrowLeft"))v.sub(r);
   if(held.has("KeyE"))v.y+=1;if(held.has("KeyQ"))v.y-=1;
   if(v.lengthSq()<1e-6)return false;
   var speed=Math.max(3,Math.min(60,camera.position.distanceTo(controls.target)*.7))*(held.has("ShiftLeft")||held.has("ShiftRight")||window.event&&window.event.shiftKey?3:1);
   v.normalize().multiplyScalar(speed*dt);camera.position.add(v);controls.target.add(v);flight=null;return true
  }
  function shiftKey(e){if(e.code==="ShiftLeft"||e.code==="ShiftRight"){if(e.type==="keydown")held.add(e.code);else held.delete(e.code)}}
  // The picture is drawn again only when something changed: the camera, the members, a toggle (a still scheme cost
  // a full redraw of thousands of members and labels every frame).
  var dirty=true,lastTime=0,needUntil=0,drew=false,slow=0;
  function goLight(){light=true;renderer.setPixelRatio(.75);lodAt=null;resize();showLight()}
  function showLight(){var n=root.querySelector("#irThreeLight");if(n)n.hidden=!light}
  // A change draws the picture now and for a while after it (the camera eases out of a turn, like the report).
  function invalidate(ms){dirty=true;if(ms>0)needUntil=Math.max(needUntil,performance.now()+ms)}
  // Near and far planes follow the distance to the centre: no flicker of faces close up, nothing cut far away.
  function camRange(){var d=camera.position.distanceTo(controls.target),n=Math.max(.02,d/300),f=Math.max(600,d*25+400);
   if(Math.abs(camera.near-n)>n*.05||camera.far!==f){camera.near=n;camera.far=f;camera.updateProjectionMatrix()}}
  function frame(time){
   if(!alive)return;
   raf=requestAnimationFrame(frame);
   var gap=(time||0)-lastTime,dt=Math.min(.1,Math.max(0,gap/1000));lastTime=time||0;
   // The frame after a picture came late: that picture took that long.
   if(drew&&!light&&gap>400){if(++slow>=3)goLight()}else if(drew)slow=0;drew=false;
   if(flight){
    flight.t=Math.min(1,(performance.now()-(flight.st||0))/(flight.ms||850));
    var k=flight.out?flight.t*(2-flight.t):flight.t<.5?4*flight.t*flight.t*flight.t:1-Math.pow(-2*flight.t+2,3)/2;
    controls.target.lerpVectors(flight.from,flight.to,k);camera.position.lerpVectors(flight.camFrom,flight.camTo,k);
    if(flight.t>=1)flight=null;dirty=true
   }
   if(walk(dt))dirty=true;
   if(controls.update())dirty=true;
   if(performance.now()<needUntil)dirty=true;
   if(pendingHover)hoverNow();
   if(!dirty)return;dirty=false;camRange();
   var w=viewport.clientWidth,h=viewport.clientHeight;
   paintTags(w,h);paintLabels(w,h);paintNodesFrame();lod();
   renderer.render(scene,camera);drew=true;
   if(!firstPaint){firstPaint=true;P.onFirstPaint&&P.onFirstPaint()}
  }
  // The members are rebuilt only when they changed: choosing a member or a toggle on the page only repaints.
  var built="";
  function signature(list){try{return JSON.stringify(list||[])}catch(e){return String(Math.random())}}
  function update(next){
   var keepPlace=P.lastTopZ,keepLevel=P.lastLevel,mode=colorMode;
   P=next;P.lastTopZ=keepPlace;P.lastLevel=keepLevel;
   // The page opened again over the built model waits for its own first picture (its loading screen stayed forever:
   // the model was drawn behind it, but only the first opening was told so).
   firstPaint=false;
   if(COLOR_MODES.indexOf(P.colorMode)>=0&&P.colorMode!==colorMode){colorMode=P.colorMode;root.querySelector("#irThreeColors").value=colorMode}
   selected=String(P.selected||"");
   var sig=signature(P.elements);
   if(sig!==built){built=sig;buildMembers(P.elements);buildCranes();buildNodes();lowerGround();refreshMaterials()}
   else if(mode!==colorMode)refreshMaterials();
   else paintHighlight();
   applyBackground();dims.visible=Boolean(P.showDimensions);invalidate();
   if(placing){
    var m=placing.mark&&(P.marks||[]).find(function(x){return String(x.id)===String(placing.mark.id)});
    if(m&&m.left>0)placing.mark=m;else{var left=(P.marks||[]).filter(function(x){return x.left>0});if(left.length)selectMark(left[0].id);else placing.mark=null}
    paintPlacement()
   }
  }
  built=signature(P.elements);buildMembers(P.elements);buildCranes();buildNodes();lowerGround();applyBackground();refreshMaterials();dims.visible=Boolean(P.showDimensions);
  var memory=cameraMemory[memoryKey];
  if(memory){camera.position.copy(memory.position);controls.target.copy(memory.target);camera.up.copy(memory.up);controls.update()}
  else setView("iso");
  showLight();frame();
  // Footings below ±0.000 (bases at −0.600): the floor, the grid and the dimensions go down to the lowest member,
  // so that bases and their plates stay above the floor.
  function lowerGround(){
   var low=0;elems.forEach(function(c){var z=Math.min(number(c.z0),c.geometryType==="column"?number(c.z0):number(c.z2));if(z<low)low=z});
   var y=Math.min(0,low/1000+.12);ground.position.y=y;dims.position.y=y
  }
  function nodeList(){return nodes.map(function(n){return{id:n.id,kind:n.kind,name:nodeKinds[n.kind],status:n.status,x:n.x,y:n.y,z:n.z,axes:axisOf(n.x,n.y),
   members:n.members.map(function(m){return{id:String(m.c.id),mark:m.c.mark||"",role:m.role,status:m.c.status||"planned"}})}})}
  function openNode(id){var n=nodes.find(function(x){return x.id===id});if(n)chooseNode(n);return Boolean(n)}
  // Pictures of the scheme for an exported file opened where its scripts do not run (the iPhone preview): the whole
  // model from fixed views with the axis bubbles and the legend drawn in. The camera and the colours come back after.
  function snapshots(){
   var W=1600,H=1000,ratio=renderer.getPixelRatio(),keep={pos:camera.position.clone(),target:controls.target.clone(),up:camera.up.clone(),mode:colorMode},out=[];
   renderer.setPixelRatio(1);renderer.setSize(W,H,false);camera.aspect=W/H;camera.updateProjectionMatrix();overlay.visible=false;
   var shot=function(title,view,mode){
    if(mode!==colorMode){colorMode=mode;refreshMaterials()}
    // The view set as on the toolbar, then moved along its direction so that the whole model fills the picture.
    setView(view);var sphere=new T.Box3().setFromObject(batches).getBoundingSphere(new T.Sphere());
    if(sphere.radius>0){var dir=camera.position.clone().sub(controls.target).normalize(),fov=camera.fov*Math.PI/360,fit=sphere.radius/Math.sin(Math.min(fov,Math.atan(Math.tan(fov)*camera.aspect)));
     controls.target.copy(sphere.center);camera.position.copy(sphere.center).add(dir.multiplyScalar(fit*.8));camera.lookAt(sphere.center)}
    paintNodesFrame();helpers.visible=false;renderer.render(scene,camera);helpers.visible=true;
    var c=document.createElement("canvas");c.width=W;c.height=H;var g=c.getContext("2d");g.drawImage(renderer.domElement,0,0,W,H);
    if(showAxes&&showGrid){var taken=[];g.font="600 22px system-ui,sans-serif";g.textAlign="center";g.textBaseline="middle";
     screenTags.forEach(function(t){if(t.group!=="axes")return;var q=project(t.pos,W,H);if(!q.inside||q.x<14||q.x>W-14||q.y<14||q.y>H-14)return;
      if(taken.some(function(o){return Math.abs(o.x-q.x)<46&&Math.abs(o.y-q.y)<36}))return;taken.push(q);
      var hw=Math.max(17,g.measureText(t.el.textContent).width/2+9);g.beginPath();g.moveTo(q.x-hw+17,q.y-17);g.lineTo(q.x+hw-17,q.y-17);
      g.arc(q.x+hw-17,q.y,17,-Math.PI/2,Math.PI/2);g.lineTo(q.x-hw+17,q.y+17);g.arc(q.x-hw+17,q.y,17,Math.PI/2,Math.PI*1.5);g.closePath();g.fillStyle="rgba(255,255,255,.85)";g.fill();
      g.strokeStyle="#9fb4c6";g.lineWidth=1.5;g.stroke();g.fillStyle="#3d5d76";g.fillText(t.el.textContent,q.x,q.y+1)})}
    var rows=legendRows().slice(0,mode==="mark"?12:16),x=18,y=H-24;g.font="600 28px system-ui,sans-serif";g.textAlign="left";g.textBaseline="middle";
    rows.slice(0,8).reverse().forEach(function(r,i){var t=r.name+" · "+r.n,w=g.measureText(t).width+58;
     g.fillStyle="rgba(255,255,255,.9)";g.fillRect(x-8,y-22-i*46,w,44);g.fillStyle="#"+r.color.toString(16).padStart(6,"0");g.fillRect(x,y-12-i*46,24,24);
     g.fillStyle="#1d2b3a";g.fillText(t,x+34,y+1-i*46)});
    out.push({title:title,src:c.toDataURL("image/jpeg",.84)})
   };
   try{
    shot("Общий вид · цвет по монтажу","iso","status");shot("Общий вид · цвет по видам конструкций","iso","type");
    shot("Сверху · цвет по видам","top","type");shot("Фасад · цвет по монтажу","front","status");shot("Сбоку · цвет по монтажу","side","status")
   }finally{
    if(colorMode!==keep.mode){colorMode=keep.mode;refreshMaterials()}
    overlay.visible=true;camera.position.copy(keep.pos);controls.target.copy(keep.target);camera.up.copy(keep.up);camera.lookAt(controls.target);controls.update();
    renderer.setPixelRatio(ratio);resize();
    root.querySelectorAll("[data-three-view]").forEach(function(b){b.classList.toggle("active",b.dataset.threeView==="iso")})
   }
   return out
  }
  // The members as drawn now, for the USDZ file (src/scheme-export-usdz.js): the selected one keeps its own colour.
  function model(){
   var both={updateMatrixWorld:function(f){steel.updateMatrixWorld(f);detailGroup.updateMatrixWorld(f);equipment.updateMatrixWorld(f)},
    traverseVisible:function(fn){steel.traverseVisible(fn);detailGroup.traverseVisible(fn);equipment.traverseVisible(fn)}};
   return{root:both,material:function(mesh){return mesh.material}}
  }
  return{host:host,key:key,root:root,update:update,focus:focus,startCopy:startCopy,startPlacement:startPlacement,nodes:nodeList,openNode:openNode,model:model,snapshots:snapshots,
   dispose:function(){
    cameraMemory[memoryKey]={position:camera.position.clone(),target:controls.target.clone(),up:camera.up.clone()};
    alive=false;cancelCopy();cancelPlacement();if(raf)cancelAnimationFrame(raf);
    observer&&observer.disconnect();window.removeEventListener("resize",resize);document.removeEventListener("keydown",onKey);
    renderer.domElement.removeEventListener("pointerdown",down);
    renderer.domElement.removeEventListener("pointerup",up);
    renderer.domElement.removeEventListener("pointermove",move);
    renderer.domElement.removeEventListener("pointerleave",leave);
    viewport.removeEventListener("wheel",wheel,true);renderer.domElement.removeEventListener("dblclick",dblclick);
    document.removeEventListener("keydown",keyDown);document.removeEventListener("keyup",keyUp);document.removeEventListener("keydown",shiftKey);document.removeEventListener("keyup",shiftKey);
    window.removeEventListener("blur",releaseKeys);
    controls.dispose();clearNodes();nodeGeo.dispose();nodeMats.forEach(function(m){m.dispose()});boltMat.dispose();plateMat.dispose();concreteMat.dispose();craneMat.dispose();hoistMat.dispose();wheelMat.dispose();boltMats["8.8"].dispose();boltMats["5.8"].dispose();
    meshGeo.forEach(function(g){g.dispose()});mats.forEach(function(m){m.dispose()});shellMats.forEach(function(m){m.dispose()});roofMats.forEach(function(m){m.dispose()});
    [selectedMat,hoverMat,axisMaterial,dimMaterial,floorMaterial,darkFloorMaterial,markerMat,pointMat,previewMat].forEach(function(m){m.dispose()});
    var cached=new Set(meshGeo.values());
    [scene,steel].forEach(function(top){top.traverse(function(obj){if(obj.geometry&&obj.geometry.dispose&&!cached.has(obj.geometry))obj.geometry.dispose()})});
    renderer.dispose();renderer.forceContextLoss?.();
    renderer.domElement.remove()
   }}
 }
 // The sortament rows for an exported scheme: only what drawing a section takes.
 function sectionRows(){
  return loadSections().then(function(){var out=[];sections.forEach(function(r){var o={};
   ["id","status","standard","h_mm","b_mm","B_mm","b1_mm","a_mm","s_mm","t_mm","R_mm","r_mm","diameters_mm","thicknesses_mm","sizes_mm","rows"].forEach(function(k){if(r[k]!=null)o[k]=r[k]});out.push(o)});return out})
 }
 return{render:render,dispose:dispose,sectionOf:sectionOf,loadSections:loadSections,sectionRows:sectionRows,fastenerRows:fastenerRows,jointKbRows:jointKbRows,
  focus:function(id){return call("focus",id)},
  startCopy:function(id){return call("startCopy",id)},
  startPlacement:function(){return call("startPlacement")},
  nodes:function(){return call("nodes")||[]},
  openNode:function(id){return call("openNode",id)},
  model:function(){return call("model")||null},
  snapshots:function(){return call("snapshots")||[]}}
})();
