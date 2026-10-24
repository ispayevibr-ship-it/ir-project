"use strict";
/*
 * IR Project: the montage scheme as one HTML file for viewing without the program — the same 3D (views, colours,
 * labels, sizes, element selection), filters by kinds, statuses and levels, search, the element card and the progress
 * by the marks register; nothing can be changed. The header carries the company (name, logo), the object and its
 * address. Three.js, the 3D module and the catalog of structure types are put into the file, so it opens offline.
 * window.irSchemeHtmlExport.save(data) — data is gathered by the scheme page (src/scheme-page.js).
 */
(function(){
 var esc=function(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
 var dataUrl=function(v){return /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml)[;,]/i.test(String(v||""))};
 // Scripts are read from the files the program itself loaded (the hot update folder or the installed app).
 function scriptUrl(name){
  var s=[].slice.call(document.scripts).find(function(x){return x.src&&x.src.split("?")[0].endsWith("/"+name)});
  return s?s.src:"./"+name
 }
 async function text(url){var r=await fetch(url,{cache:"no-store"});if(!r.ok)throw Error("Не прочитан файл "+url);return r.text()}
 // The styles of the 3D view (.ir-three-…) as the program has them now.
 function threeCss(){
  var out=[];
  [].slice.call(document.styleSheets).forEach(function(sheet){
   var rules;try{rules=sheet.cssRules}catch(_e){return}
   [].slice.call(rules||[]).forEach(function(r){if(/ir-three/.test(r.cssText))out.push(r.cssText)})
  });
  return out.join("\n")
 }
 async function logoOf(company){
  var logo=String(company&&company.logo||"");if(!logo)return"";if(dataUrl(logo))return logo;
  try{var src=await window.irProject.images.read(logo);return dataUrl(src)?src:""}catch(_e){return""}
 }
 var inline=function(code){return String(code).replace(/<\/(script)/gi,"<\\/$1")};
 var LS=String.fromCharCode(0x2028),PS=String.fromCharCode(0x2029);
 var json=function(v){return JSON.stringify(v).replace(/</g,"\\u003c").split(LS).join("\\u2028").split(PS).join("\\u2029")};
 var safeFile=function(v){return String(v||"Монтажная схема").replace(/[<>:"/\\|?*\u0000-\u001f]/g,"_").trim().slice(0,90)||"Монтажная схема"};

 var PAGE_CSS=[
  // Without scripts the page is an ordinary scrolling document: the window layout, the toolbar and the panels need the 3D.
  "html:not(.js) .stage-bar,html:not(.js) .side,html:not(.js) .card{display:none!important}",
  ".still{padding:12px;max-width:1100px;margin:0 auto}.still-note{margin:0 0 12px;padding:10px 12px;background:#fff8e6;border:1px solid #f0d48a;border-radius:10px;font-size:13px}",
  ".still figure{margin:0 0 14px;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}.still img{display:block;width:100%;height:auto}",
  ".still figcaption{padding:6px 10px;font-size:12.5px;color:var(--muted)}.still h2{font-size:16px;margin:18px 0 8px}",
  ".still details{background:#fff;border:1px solid var(--line);border-radius:10px;margin-bottom:8px}.still summary{padding:9px 12px;cursor:pointer}.still summary span{color:var(--muted);font-size:12.5px}",
  ".still-table{overflow-x:auto}.still table{width:100%;border-collapse:collapse;font-size:12.5px}.still th,.still td{padding:5px 8px;border-top:1px solid #eef2f7;text-align:left;vertical-align:top}",
  ".still th{color:var(--muted);font-weight:600;white-space:nowrap}.still td small{display:block;color:var(--muted)}.still td:nth-child(4),.still td:nth-child(5){white-space:nowrap;font-variant-numeric:tabular-nums}",
  ":root{--bg:#eef2f7;--card:#fff;--ink:#17233a;--muted:#5d6b80;--line:#dbe3ee;--accent:#1f5fbf;--ok:#1f8a4c;--part:#c98a0b;--wait:#7a8699;color-scheme:light}",
  "*{box-sizing:border-box}html,body{margin:0}html.js,html.js body{height:100%}body{background:var(--bg);color:var(--ink);font:14px/1.4 'Segoe UI',system-ui,-apple-system,sans-serif}",
  ".hx{display:flex;align-items:center;gap:18px;padding:14px 20px;background:var(--card);border-bottom:1px solid var(--line);flex-wrap:wrap}",
  ".hx-co{display:flex;align-items:center;gap:12px;min-width:0}.hx-co img{max-height:52px;max-width:160px;object-fit:contain}",
  ".hx-co b{font-size:16px}.hx-obj{flex:1 1 320px;min-width:0}.hx-obj h1{margin:0;font-size:19px;line-height:1.25}",
  ".hx-obj .addr{color:var(--muted);margin-top:3px}.hx-meta{text-align:right;color:var(--muted);font-size:12.5px}.hx-meta b{display:block;color:var(--ink);font-size:14px}",
  ".sum{display:flex;gap:10px;padding:12px 20px;flex-wrap:wrap}.sum>div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 14px;min-width:120px}",
  ".sum span{display:block;color:var(--muted);font-size:12px}.sum b{font-size:18px;font-variant-numeric:tabular-nums}.sum .bar{height:6px;background:#e4e9f1;border-radius:3px;margin-top:5px;overflow:hidden}.sum .bar i{display:block;height:100%;background:var(--ok)}",
  // The scheme fills the window; the side panel (object, totals, kinds, filter, elements) opens over it on demand.
  // The window: the header (company, object, address, date) on top, the scheme under it to the edges; the side panel
  // (totals, kinds, filter, elements) opens over the scheme on demand, the card of a clicked element is its own box.
  "html.js,html.js body{height:100%;overflow:hidden}.js .wrap{position:fixed;inset:0;display:flex;flex-direction:column;padding:0}",
  ".wrap>.hx{flex:0 0 auto;padding:8px 16px;gap:14px}.wrap>.hx .hx-co img{max-height:40px}.wrap>.hx .hx-obj h1{font-size:17px}",
  ".area{position:relative;flex:1 1 auto;min-height:0}.js .area>.stage{position:absolute;inset:0;border:0;border-radius:0}",
  ".card{position:absolute;left:12px;top:122px;width:340px;max-width:calc(100% - 24px);max-height:calc(100% - 180px);overflow:auto;z-index:15;box-shadow:0 8px 24px rgba(15,30,60,.18)}",
  ".card[hidden]{display:none}.card .side-close{margin-left:8px}",
  ".side{position:absolute;top:0;right:0;bottom:0;width:360px;max-width:92vw;padding:10px;background:var(--bg,#eef2f7);box-shadow:-8px 0 24px rgba(15,30,60,.18);transform:translateX(105%);transition:transform .2s ease;z-index:20}",
  ".wrap.open .side{transform:none}.side .sum{padding:0;display:grid;grid-template-columns:1fr 1fr;gap:6px}.side .sum>div{min-width:0}",
  ".side-close{float:right;font:inherit;border:1px solid var(--line);background:#fff;border-radius:8px;padding:3px 9px;cursor:pointer}",
  "#panel{font-weight:600}",
  ".stage{position:relative;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;min-height:0}",
  ".stage-bar{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;padding:8px 10px;border-bottom:1px solid var(--line);background:#f8fafc}",
  ".stage-bar button,.stage-bar select,.stage-bar label{font:inherit;font-size:12.5px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:5px 9px;color:var(--ink);display:inline-flex;align-items:center;gap:5px;cursor:pointer}",
  "#stage3d{position:relative;flex:1 1 auto;min-height:0}#stage3d .ir-three-root{position:absolute;inset:0;height:100%}",
  // The pictures and the list of elements stand apart from the 3D: seen where the page's scripts do not run, and where
  // the 3D failed — then with the reason (red), not an empty field.
  "html.js #still{display:none}html:not(.js) #stage3d{display:none}",
  ".fail{margin:0 0 12px;padding:10px 12px;background:#fdecea;border:1px solid #f1a9a0;border-radius:10px;font-size:13px;color:#7a1f16}.fail[hidden]{display:none}.fail b{display:block;margin-bottom:4px}.fail span{display:block;white-space:pre-wrap;overflow-wrap:anywhere}",
  ".errnote{position:fixed;left:8px;right:8px;bottom:8px;z-index:40;padding:8px 36px 8px 10px;background:#fdecea;border:1px solid #f1a9a0;border-radius:10px;font-size:12.5px;color:#7a1f16;white-space:pre-wrap;overflow-wrap:anywhere}.errnote button{position:absolute;top:4px;right:6px;border:0;background:none;font-size:18px;color:#7a1f16;cursor:pointer}",
  // A phone: the page scrolls as a document and the scheme has its own height (78% of the screen, at least 420 px) —
  // the window-filling layout gave the 3D field no height in the iPhone viewer, and the scheme stayed empty.
  "@media(max-width:760px){html.js,html.js body{height:auto;overflow:auto}.js .wrap{position:static;display:block}.js .area>.stage{position:relative;inset:auto}",
  " #stage3d{flex:none;height:78vh;min-height:420px}.ir-three-footer{display:none!important}.side{position:fixed}.wrap>.hx{padding:8px 12px}.wrap>.hx .hx-obj h1{font-size:15px}}",
  ".side{display:flex;flex-direction:column;gap:10px;min-height:0;overflow:auto}.box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px}",
  ".box h3{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}",
  ".groups label{display:flex;align-items:center;gap:7px;padding:3px 0;cursor:pointer}.groups small{margin-left:auto;color:var(--muted)}",
  ".groups-actions{display:flex;gap:6px;margin-top:6px}.groups-actions button{font:inherit;font-size:12px;border:1px solid var(--line);background:#f6f8fb;border-radius:7px;padding:3px 8px;cursor:pointer}",
  ".row2{display:grid;grid-template-columns:1fr 1fr;gap:6px}.box input[type=checkbox]{width:auto;margin:0}.box select,.box input{width:100%;font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink)}",
  ".box label.f{display:block;font-size:12px;color:var(--muted);margin-bottom:6px}.box label.f input,.box label.f select{margin-top:3px}",
  ".list{max-height:260px;overflow:auto;margin-top:8px;border-top:1px solid var(--line)}.list button{display:block;width:100%;text-align:left;font:inherit;background:none;border:0;border-bottom:1px solid #eef2f7;padding:6px 4px;cursor:pointer;color:var(--ink)}",
  ".list button:hover{background:#f3f6fb}.list button.on{background:#e6efff}.list button span{display:block;font-size:12px;color:var(--muted)}",
  ".st{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}.st.mounted{background:var(--ok)}.st.partial{background:var(--part)}.st.planned{background:var(--wait)}",
  ".det-title b{font-size:18px;display:block}.det-title small{color:var(--muted)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin-top:8px}",
  ".grid div span{display:block;font-size:11.5px;color:var(--muted)}.grid div b{font-weight:600;word-break:break-word}.ok{color:var(--ok)}.partial{color:var(--part)}.wait{color:var(--wait)}",
  ".warn{background:#fff6e0;border:1px solid #f0d58a;border-radius:8px;padding:6px 8px;font-size:12px;margin-bottom:8px}",
  ".prog{margin-top:10px;font-size:12.5px}.prog .bar{height:6px;background:#e4e9f1;border-radius:3px;margin-top:5px;overflow:hidden}.prog .bar i{display:block;height:100%;background:var(--ok)}",
  ".empty{color:var(--muted)}.foot{padding:0 20px 16px;color:var(--muted);font-size:12px}",
  "@media(max-width:900px){.stage-bar{justify-content:flex-start}.side{width:100vw;max-width:100vw}}",
  "@media print{.stage-bar,.side{display:none}}"
 ].join("\n");

 // The read-only page: filters → visible elements → the same 3D module of the program.
 function viewer(){
  var D=JSON.parse(document.getElementById("ir-scheme-data").textContent);
  var $=function(id){return document.getElementById(id)};
  var esc=function(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
  var fmt=function(v){var n=Number(v);return Number.isFinite(n)?Number(n.toFixed(1)).toLocaleString("ru-RU",{maximumFractionDigits:1}):"—"};
  var S={hidden:new Set(),status:"all",work:"all",min:"",max:"",q:"",sel:"",color:"type",labels:false,dims:false,bg:D.background||"standard"};
  var statusText={mounted:"Смонтирована",partial:"Частично смонтирована",planned:"Не смонтирована"};
  var levelOk=function(c){var lo=Math.min(c.z0,c.z2),hi=Math.max(c.z0,c.z2);if(S.min!==""&&hi<Number(S.min))return false;if(S.max!==""&&lo>Number(S.max))return false;return true};
  var shown=function(){return D.elements.filter(function(c){return!S.hidden.has(c.scheme_group)&&(S.work==="all"||String(c.work||"")===S.work)&&(S.status==="all"||c.status===S.status)&&levelOk(c)})};
  var match=function(c){var q=S.q.trim().toLowerCase();return!q||[c.mark,c.mark_name,c.type_name,c.axisX,c.axisY].join(" ").toLowerCase().indexOf(q)>=0};
  function draw3d(){
   var els=shown();
   window.irThreeSchemeView.render($("stage3d"),{objectId:"export:"+D.objectId,axesX:D.axesX,axesY:D.axesY,spanX:D.spanX,spanY:D.spanY,gridDirX:D.gridDirX,gridDirY:D.gridDirY,
    gridX:D.gridX,gridY:D.gridY,elements:els,selected:S.sel,maxZ:els.reduce(function(m,c){return Math.max(m,c.z0,c.z2,c.mz||0)},0),
    colorMode:S.color,showLabels:S.labels,showDimensions:S.dims,background:S.bg,canEdit:false,marks:[],
    onColorModeChange:function(m){S.color=m;draw3d()},onSelect:function(id){S.sel=String(id||"");details();list()},onFirstPaint:firstPaint});
   $("cnt").textContent=els.length+" из "+D.elements.length
  }
  // The 3D drew (or showed its own error): an error, a field without height or the graphics taken away by the phone go
  // to the pictures with the reason (window.__irFail in the page head).
  function firstPaint(){
   var host=$("stage3d"),err=host.querySelector(".ir-three-error");
   if(err){window.__irFail([].slice.call(err.querySelectorAll("strong,span")).map(function(x){return x.textContent}).join(": "));return}
   window.__irOk=true;
   var h=host.getBoundingClientRect().height;if(h<40){window.__irOk=false;window.__irFail("Поле 3D-схемы получилось высотой "+Math.round(h)+" пкс (экран "+innerWidth+"×"+innerHeight+")");return}
   var cv=host.querySelector("canvas"),lost=0;
   if(cv){cv.addEventListener("webglcontextlost",function(){clearTimeout(lost);lost=setTimeout(function(){window.__irOk=false;window.__irFail("Телефон отключил 3D-графику (WebGL): не хватило памяти")},3000)});
    cv.addEventListener("webglcontextrestored",function(){clearTimeout(lost)})}
  }
  setTimeout(function(){if(!window.__irOk&&document.documentElement.classList.contains("js"))window.__irFail("3D-схема не построилась за 60 с")},60000);
  function groups(){
   var box=$("groups");
   box.innerHTML=D.groups.map(function(g){return'<label><input type="checkbox" data-g="'+esc(g.key)+'"'+(S.hidden.has(g.key)?"":" checked")+'> '+esc(g.label)+'<small>'+g.count+'</small></label>'}).join("");
   box.querySelectorAll("[data-g]").forEach(function(i){i.onchange=function(){if(i.checked)S.hidden.delete(i.dataset.g);else S.hidden.add(i.dataset.g);draw3d();list()}})
  }
  function list(){
   var found=shown().filter(match).sort(function(a,b){return String(a.mark).localeCompare(String(b.mark),"ru",{numeric:true})});
   $("found").textContent="Найдено: "+found.length;
   $("list").innerHTML=found.slice(0,300).map(function(c){return'<button type="button" data-id="'+esc(c.id)+'" class="'+(c.id===S.sel?"on":"")+'"><i class="st '+esc(c.status)+'"></i><b>'+esc(c.mark||"Без марки")+'</b> '+esc(c.type_name||"")+'<span>'+esc(c.axisText.x+" / "+c.axisText.y)+' · низ '+fmt(c.z0)+' · верх '+fmt(c.z2)+'</span></button>'}).join("")+(found.length>300?'<div class="empty">Показаны первые 300 — уточните поиск.</div>':"");
   $("list").querySelectorAll("[data-id]").forEach(function(b){b.onclick=function(){S.sel=b.dataset.id;draw3d();window.irThreeSchemeView.focus&&window.irThreeSchemeView.focus(S.sel);details();list()}})
  }
  function details(){
   var c=D.elements.find(function(x){return x.id===S.sel}),box=$("details");
   // The card of the element: apart from the panel, shown while an element is selected.
   box.hidden=!c;if(!c){box.innerHTML="";return}
   var p=c.progress,a=c.axisText,cls=c.status==="mounted"?"ok":c.status==="partial"?"partial":"wait";
   box.innerHTML='<button type="button" class="side-close" id="uncard" aria-label="Закрыть карточку">✕</button><h3>Выбранный элемент</h3>'+(c.draft?'<div class="warn">Черновое размещение из чертежей — координаты и отметки требуют проверки'+(c.draft_doc?" · "+esc(c.draft_doc):"")+'</div>':"")+
    '<div class="det-title"><b>'+esc(c.mark||"—")+'</b>'+(c.mark_name?'<small>'+esc(c.mark_name)+'</small>':"")+'</div><div class="grid">'+
    [["Тип элемента",c.type_name],["Сечение",c.section],["Профиль",c.profile],[p&&p.total>0?"Статус по ведомости":"Статус",'<span class="'+cls+'">'+esc(statusText[c.status]||c.status)+'</span>',1],
     ["Ось "+D.axesX[0]+"–"+D.axesX[D.axesX.length-1],a.x],["Ось "+D.axesY[0]+"–"+D.axesY[D.axesY.length-1],a.y],["Коорд. X",fmt(c.x)+" мм"],["Коорд. Y",fmt(c.y)+" мм"],
     ["Низ",fmt(c.z0)+" мм"],["Верх / конец Z",fmt(c.z2)+" мм"]].concat(c.geometryType!=="column"&&c.geometryType!=="shell"&&c.geometryType!=="plate"?[["Конец X",fmt(c.x2)+" мм"],["Конец Y",fmt(c.y2)+" мм"]]:[])
     .map(function(r){return'<div><span>'+esc(r[0])+'</span><b>'+(r[2]?r[1]:esc(r[1]||"—"))+'</b></div>'}).join("")+'</div>'+
    (p&&p.total>0?'<div class="prog"><b>Марка '+esc(c.mark)+' по ведомости:</b> всего '+fmt(p.total)+' шт., смонтировано '+fmt(p.mounted)+', осталось '+fmt(p.left)+'<div class="bar"><i style="width:'+Math.max(0,Math.min(100,p.mounted/p.total*100))+'%"></i></div></div>':"");
   $("uncard").onclick=function(){S.sel="";details();list();draw3d()}
  }
  $("status").onchange=function(e){S.status=e.target.value;draw3d();list()};
  // All the work types together, or one of them, as in the program.
  if($("work"))$("work").onchange=function(e){S.work=e.target.value;S.sel="";details();draw3d();list()};
  $("lmin").oninput=function(e){S.min=e.target.value;draw3d();list()};
  $("lmax").oninput=function(e){S.max=e.target.value;draw3d();list()};
  $("q").oninput=function(e){S.q=e.target.value;list()};
  $("all").onclick=function(){S.hidden.clear();groups();draw3d();list()};
  $("none").onclick=function(){D.groups.forEach(function(g){S.hidden.add(g.key)});groups();draw3d();list()};
  $("labels").onchange=function(e){S.labels=e.target.checked;draw3d()};
  $("dims").onchange=function(e){S.dims=e.target.checked;draw3d()};
  $("bg").value=S.bg;$("bg").onchange=function(e){S.bg=e.target.value;draw3d()};
  // The side panel: closed until opened; a click on an element opens it on the element's card.
  var panel=function(open){$("wrap").classList.toggle("open",open);$("panel").setAttribute("aria-expanded",String(open))};
  $("panel").onclick=function(){panel(!$("wrap").classList.contains("open"))};$("close").onclick=function(){panel(false)};
  // Escape closes the card first, then the panel.
  document.addEventListener("keydown",function(e){if(e.key!=="Escape")return;if(S.sel){S.sel="";details();list();draw3d()}else if($("wrap").classList.contains("open"))panel(false)});
  $("full").onclick=function(){var st=$("stage");if(document.fullscreenElement)document.exitFullscreen();else if(st.requestFullscreen)st.requestFullscreen()};
  groups();list();details();draw3d()
 }

 // What the page shows where its scripts do not run (files, mail and messengers on the iPhone and iPad open an HTML file
 // that way): the pictures of the scheme made at export, the totals and every element by its kind. The 3D replaces it
 // as soon as it starts.
 var num=function(v){var n=Number(v);return Number.isFinite(n)?Math.round(n).toLocaleString("ru-RU"):"—"};
 function still(d){
  var st={mounted:"смонтирован",partial:"частично",planned:"не смонтирован"},byGroup=new Map();
  (d.elements||[]).forEach(function(c){var k=c.scheme_group||"";if(!byGroup.has(k))byGroup.set(k,[]);byGroup.get(k).push(c)});
  var label=function(k){var g=(d.groups||[]).find(function(x){return x.key===k});return g?g.label:k||"Без вида"};
  var rows=function(list){return list.slice().sort(function(a,b){return String(a.mark).localeCompare(String(b.mark),"ru",{numeric:true})||a.z0-b.z0}).map(function(c){
   var a=c.axisText||{},s=c.status==="mounted"?"mounted":c.status==="partial"?"partial":"planned";
   return'<tr><td><b>'+esc(c.mark||"—")+'</b></td><td>'+esc(c.title||c.type_name||"")+'<small>'+esc(c.profile||"")+'</small></td><td>'+esc([a.x,a.y].filter(Boolean).join(" / "))+'</td><td>'+num(c.z0)+'</td><td>'+num(c.z2)+'</td><td><i class="st '+s+'"></i>'+st[s]+'</td></tr>'}).join("")};
  var shots=(d.shots||[]).map(function(p){return'<figure><img src="'+esc(p.src)+'" alt="'+esc(p.title)+'"><figcaption>'+esc(p.title)+'</figcaption></figure>'}).join("");
  var groups=[].concat.apply([],[...byGroup.keys()].sort(function(a,b){return byGroup.get(b).length-byGroup.get(a).length}).map(function(k){
   var list=byGroup.get(k),m=list.filter(function(c){return c.status==="mounted"}).length;
   return['<details><summary><b>'+esc(label(k))+'</b> <span>'+list.length+' шт. · смонтировано '+m+'</span></summary><div class="still-table"><table><thead><tr><th>Марка</th><th>Наименование</th><th>Оси</th><th>Низ, мм</th><th>Верх, мм</th><th>Статус</th></tr></thead><tbody>'+rows(list)+'</tbody></table></div></details>']}));
  return'<div class="still" id="still"><div class="fail" id="fail" hidden><b>3D-схема не запустилась</b><span id="failText"></span></div><p class="still-note">Схема показана картинками: в этом окне 3D не работает. Ниже — виды схемы и все элементы по видам.</p>'+
   shots+'<h2>Элементы по видам</h2>'+groups.join("")+'</div>'
 }
 // The page head: scripts run (the class "js" — the 3D layout), and every error of the page is kept and shown. Before the 3D
 // drew, an error turns the page to the pictures with the reason; after it, the reason is a note at the bottom.
 var HEAD='document.documentElement.className+=" js";(function(){var E=window.__irErrors=[],W=window;'+
  'W.__irFail=function(why){if(why)E.push(String(why));if(W.__irOk){var n=document.getElementById("errnote");if(!n&&document.body){n=document.createElement("div");n.id="errnote";n.className="errnote";'+
  'n.innerHTML=\'<button type="button" aria-label="Закрыть">×</button><span></span>\';n.firstChild.onclick=function(){n.remove()};document.body.appendChild(n)}if(n)n.lastChild.textContent="Ошибка на странице: "+E.join("\\n");return}'+
  'document.documentElement.classList.remove("js");var f=document.getElementById("fail"),t=document.getElementById("failText");if(f&&t){f.hidden=false;t.textContent=E.join("\\n")}};'+
  'W.addEventListener("error",function(e){var m=String(e.message||"ошибка");if(/ResizeObserver loop/i.test(m))return;W.__irFail(m+(e.lineno?" (строка "+e.lineno+")":""))});'+
  'W.addEventListener("unhandledrejection",function(e){var r=e.reason;W.__irFail(String(r&&r.message||r||"ошибка"))})})()';
 function page(d,libs){
  var s=d.summary;
  var head='<header class="hx"><div class="hx-co">'+(d.company.logo?'<img src="'+esc(d.company.logo)+'" alt="Логотип">':"")+(d.company.name?'<b>'+esc(d.company.name)+'</b>':"")+'</div>'+
   '<div class="hx-obj"><h1>'+esc(d.object.name||"Объект")+'</h1>'+(d.object.address?'<div class="addr">📍 '+esc(d.object.address)+'</div>':"")+'</div>'+
   '<div class="hx-meta"><b>Монтажная схема · '+esc(d.title)+'</b>'+(d.work?esc(d.work)+'<br>':"")+'Выгружено '+esc(d.date)+'</div></header>';
  var pct=s.total?Math.round(s.mounted/s.total*100):0;
  var sum='<section class="sum"><div><span>Элементов на схеме</span><b>'+s.placed+'</b></div><div><span>Смонтировано</span><b class="ok">'+s.placedMounted+'</b></div><div><span>Частично</span><b class="partial">'+s.placedPartial+'</b></div>'+
   '<div><span>Не смонтировано</span><b class="wait">'+(s.placed-s.placedMounted-s.placedPartial)+'</b></div>'+(s.total?'<div><span>По ведомости марок</span><b>'+pct+'%</b> <small>'+s.mounted+' из '+s.total+' шт.</small><div class="bar"><i style="width:'+pct+'%"></i></div></div>':"")+'</section>';
  var body='<main class="wrap" id="wrap">'+head+'<div class="area"><section class="stage" id="stage"><div class="stage-bar">'+
   '<label><input type="checkbox" id="labels"> Марки</label><label><input type="checkbox" id="dims"> Размеры</label>'+
   '<select id="bg" title="Фон"><option value="standard">Фон: стандартный</option><option value="white">Белый</option><option value="gray">Серый</option><option value="blue">Голубой</option><option value="sand">Песочный</option><option value="dark">Тёмный</option></select>'+
   '<button type="button" id="full">⛶ На весь экран</button><button type="button" id="panel" aria-expanded="false" aria-controls="side">☰ Сведения и фильтры</button></div><div id="stage3d"></div>'+still(d)+'</section>'+
   '<div class="box card" id="details" hidden></div>'+
   '<aside class="side" id="side"><div class="box"><button type="button" class="side-close" id="close" aria-label="Свернуть панель">✕</button><h3>Сводка</h3>'+sum+'</div><div class="box"><h3>Виды конструкций</h3><div class="groups" id="groups"></div><div class="groups-actions"><button type="button" id="all">Показать все</button><button type="button" id="none">Скрыть все</button></div></div>'+
   '<div class="box"><h3>Фильтр</h3>'+((d.works||[]).length>1?'<label class="f">Вид работ<select id="work"><option value="all">Все виды работ вместе</option>'+d.works.map(function(w){return'<option value="'+esc(w.id)+'">'+esc(w.label)+' · '+w.count+'</option>'}).join("")+'</select></label>':'')+'<label class="f">Статус<select id="status"><option value="all">Все</option><option value="mounted">Смонтированы</option><option value="partial">Частично</option><option value="planned">Не смонтированы</option></select></label>'+
   '<div class="row2"><label class="f">Отметка от, мм<input id="lmin" type="number" inputmode="numeric"></label><label class="f">до, мм<input id="lmax" type="number" inputmode="numeric"></label></div><div class="empty">На экране: <b id="cnt"></b></div></div>'+
   '<div class="box"><h3>Элементы</h3><input id="q" type="search" placeholder="Марка, наименование, ось" autocomplete="off"><div class="empty" id="found"></div><div class="list" id="list"></div></div>'+
   '<div class="empty foot">Выгружено из IR Project — только просмотр. Вращение — левая кнопка мыши, сдвиг — правая, масштаб — колесо; щелчок по элементу — его карточка.</div></aside></div></main>';
  return'<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>'+inline(HEAD)+'</script>'+
   '<title>'+esc((d.object.name||"Объект")+" — монтажная схема")+'</title><style>'+libs.css+'\n'+PAGE_CSS+'</style></head><body>'+body+
   '<script type="application/json" id="ir-scheme-data">'+json(Object.assign({},d,{shots:undefined}))+'</script>'+
   '<script>window.irSchemeSections='+inline(JSON.stringify(libs.sections||[]))+';window.irSchemeFasteners='+inline(JSON.stringify(libs.fasteners||[]))+';window.irSchemeJointKb='+inline(JSON.stringify(libs.jointKb||{families:[],groups:[]}))+';</script><script>'+inline(libs.three)+'</script><script>'+inline(libs.orbit)+'</script><script>'+inline(libs.types)+'</script>'+(libs.joints?'<script>'+inline(libs.joints)+'</script>':'')+'<script>'+inline(libs.view)+'</script>'+
   '<script>try{('+inline(viewer.toString())+')()}catch(e){window.__irFail(e&&e.message||e)}</script></body></html>'
 }

 async function save(d){
  var company=await window.irProject.company.get().catch(function(){return{}});
  d.company={name:String(company&&company.name||""),logo:await logoOf(company)};
  d.date=new Date().toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
  var libs={css:threeCss()};
  try{d.shots=window.irThreeSchemeView&&window.irThreeSchemeView.snapshots?window.irThreeSchemeView.snapshots():[]}catch(_e){d.shots=[]}
  var r=await Promise.all([text(scriptUrl("vendor/three/three.min.js")),text(scriptUrl("vendor/three/OrbitControls.js")),text(scriptUrl("ai-structure-types.js")),text(scriptUrl("scheme-three-view.js")),text(scriptUrl("ai-joint-catalog.js")).catch(function(){return""})]);
  libs.three=r[0];libs.orbit=r[1];libs.types=r[2];libs.view=r[3];libs.joints=r[4];
  libs.sections=window.irThreeSchemeView&&window.irThreeSchemeView.sectionRows?await window.irThreeSchemeView.sectionRows().catch(function(){return[]}):[];
  libs.fasteners=window.irThreeSchemeView&&window.irThreeSchemeView.fastenerRows?await window.irThreeSchemeView.fastenerRows().catch(function(){return[]}):[];
  // The catalog of joints: the node card of the exported scheme names the type of the node as the program does.
  libs.jointKb=window.irThreeSchemeView&&window.irThreeSchemeView.jointKbRows?await window.irThreeSchemeView.jointKbRows().catch(function(){return null}):null;
  var html=page(d,libs);
  return window.irProject.reportExport.html(html,safeFile((d.object.name||"Объект")+" — монтажная схема — "+d.title)+".html")
 }
 window.irSchemeHtmlExport={save:save,page:page,viewer:viewer};
})();
