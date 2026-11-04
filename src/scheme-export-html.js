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
  // (a rule whose every property a later rule of the same selector gives again is left out — the later one wins there
  // anyway, whatever stands between; the same rule twice once; the spaces of the text out: «уменьши размер схемы
  // выгружаемой, удали стили если повторно друг на друга наложены», the engineer, 03.11.2026)
  var out=[],seen=new Set();
  [].slice.call(document.styleSheets).forEach(function(sheet){
   var rules;try{rules=sheet.cssRules}catch(_e){return}
   [].slice.call(rules||[]).forEach(function(r){if(!/ir-three/.test(r.cssText))return;
    if(r.type===1&&r.style){var ps=[],imp=[];for(var i=0;i<r.style.length;i++){ps.push(r.style[i]);if(r.style.getPropertyPriority(r.style[i]))imp.push(r.style[i])}out.push({sel:r.selectorText,ps:ps,imp:imp,text:r.cssText})}
    else if(!seen.has(r.cssText)){seen.add(r.cssText);out.push({text:r.cssText})}})
  });
  var keep=out.map(function(o,i){if(!o.ps)return true;
   for(var j=i+1;j<out.length;j++){var l=out[j];if(!l.ps||l.sel!==o.sel)continue;
    if(l.text===o.text)return false;
    if(o.ps.every(function(p){return l.ps.indexOf(p)>=0&&(o.imp.indexOf(p)<0||l.imp.indexOf(p)>=0)}))return false}
   return true});
  return out.filter(function(o,i){return keep[i]}).map(function(o){return o.text.replace(/\s*\{\s*/,"{").replace(/;\s+/g,";").replace(/\s*\}\s*$/,"}")}).join("\n")
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
  ".hx-co{display:flex;align-items:center;gap:12px;min-width:0}.hx-co:empty{display:none}.hx-co img{min-height:70px;max-height:90px;max-width:240px;object-fit:contain}",
  ".hx-obj{flex:1 1 320px;min-width:0}.hx-obj h1{margin:0;font-size:15px;line-height:1.25}.hx-obj .pin{flex:none;color:#1f5fbf}.hx-obj .addr{display:flex;align-items:center;gap:5px}",
  ".hx-obj .addr{color:var(--muted);margin-top:3px}.hx-meta{text-align:right;color:var(--muted);font-size:12.5px}.hx-meta b{display:block;color:var(--ink);font-size:14px}.hx-meta .made{display:block;margin-top:2px;font-size:10.5px;letter-spacing:.02em;opacity:.8}",
  ".sum{display:flex;gap:10px;padding:12px 20px;flex-wrap:wrap}.sum>div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 14px;min-width:120px}",
  ".sum span{display:block;color:var(--muted);font-size:12px}.sum b{font-size:18px;font-variant-numeric:tabular-nums}.sum .bar{height:6px;background:#e4e9f1;border-radius:3px;margin-top:5px;overflow:hidden}.sum .bar i{display:block;height:100%;background:var(--ok)}",
  // The scheme fills the window; the side panel (object, totals, kinds, filter, elements) opens over it on demand.
  // The window: the header (company, object, address, date) on top, the scheme under it to the edges; the side panel
  // (totals, kinds, filter, elements) opens over the scheme on demand, the card of a clicked element is its own box.
  "html.js,html.js body{height:100%;overflow:hidden}.js .wrap{position:fixed;inset:0;display:flex;flex-direction:column;padding:0}",
  ".wrap>.hx{flex:0 0 auto;padding:8px 16px;gap:14px}",
  ".area{position:relative;flex:1 1 auto;min-height:0}.js .area>.stage{position:absolute;inset:0;border:0;border-radius:0}",
  ".card{position:absolute;left:12px;top:122px;width:340px;max-width:calc(100% - 24px);max-height:calc(100% - 180px);overflow:auto;z-index:15;box-shadow:0 8px 24px rgba(15,30,60,.18)}",
  ".card[hidden]{display:none}.card .side-close{margin-left:8px}",
  ".side{position:absolute;top:0;right:0;bottom:0;width:360px;max-width:92vw;padding:10px;background:var(--bg,#eef2f7);box-shadow:-8px 0 24px rgba(15,30,60,.18);transform:translateX(105%);transition:transform .2s ease;z-index:20}",
  ".wrap.open .side{transform:none}.side .sum{padding:0;display:grid;grid-template-columns:1fr 1fr;gap:6px}.side .sum>div{min-width:0}",
  ".side-close{float:right;font:inherit;border:1px solid var(--line);background:#fff;border-radius:8px;padding:3px 9px;cursor:pointer}",
  "#panel{font-weight:600}",
  ".stage{position:relative;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;min-height:0}",
  ".stage-bar{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;padding:8px 10px;border-bottom:1px solid var(--line);background:#f8fafc}",
  ".stage-bar .bgdd{position:relative;display:inline-flex}.stage-bar .bgdd>button i{width:34px;height:16px;border-radius:4px;border:1px solid rgba(23,35,58,.3);display:inline-block}.stage-bar .bgdd>button b{font-weight:400;font-size:10px;color:var(--muted)}",
  ".bglist{position:absolute;top:calc(100% + 4px);right:0;z-index:18;margin:0;padding:5px;list-style:none;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px rgba(15,30,60,.18);display:grid;gap:4px}.bglist[hidden]{display:none}",
  ".bglist li{width:96px;height:22px;border-radius:5px;border:1px solid rgba(23,35,58,.3);cursor:pointer}.bglist li:hover{box-shadow:0 0 0 2px #fff,0 0 0 3px rgba(22,104,234,.45)}.bglist li[aria-selected=true]{box-shadow:0 0 0 2px #fff,0 0 0 4px var(--accent)}",
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
  " #stage3d{flex:none;height:78vh;height:calc(100svh - 150px);min-height:380px}.side{position:fixed}.wrap>.hx{padding:8px 12px}.wrap>.hx .hx-obj h1{font-size:14px}}",
  // A phone (the engineer, 03.11.2026, a picture of the export on a phone: «Мобильную версию подправь» — the header,
  // the bar in three rows and the bar of the 3D over half of it, the scheme a strip under them): the header in a few
  // lines — the logo small beside the name, the company, the work and the date in one small line —; the bar in one row,
  // its buttons by their icons (the words in their titles); the bar of the 3D one row that scrolls sideways, its hints
  // of the mouse hidden (the help is in «Инструкция»); the 3D the rest of the screen.
  "@media(max-width:760px){.wrap>.hx{gap:4px 10px;padding:6px 10px}.hx-co img{min-height:0;max-height:38px;max-width:96px}.hx-obj{flex:1 1 180px}",
  " .wrap>.hx .hx-obj h1{font-size:12.5px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.hx-obj .addr{font-size:11.5px;margin-top:1px}",
  " .hx-meta{flex:1 1 100%;text-align:left;font-size:11px;line-height:1.35}.hx-meta b{display:inline;font-size:11.5px;margin-right:6px}.hx-meta .wk{margin-right:6px}.hx-meta br{display:none}.hx-meta .made{display:inline;margin:0 0 0 6px}",
  " .stage-bar{flex-wrap:nowrap;justify-content:flex-start;gap:5px;padding:5px 6px}.stage-bar button,.stage-bar label{padding:6px 8px;font-size:12.5px;white-space:nowrap}.stage-bar .lbl{display:none}",
  " .stage-bar #panel{margin-left:auto}#help{top:46px;right:6px;left:6px;width:auto;max-width:none}",
  " #stage3d .ir-three-toolbar{left:6px;right:6px;top:6px;min-height:0;padding:4px 5px;gap:4px;flex-wrap:nowrap;justify-content:flex-start;overflow-x:auto;scrollbar-width:none;border-radius:9px;background:#ffffffe6}",
  " #stage3d .ir-three-toolbar::-webkit-scrollbar{display:none}#stage3d .ir-three-toolbar>*{flex:none}#stage3d .ir-three-views{flex-wrap:nowrap;padding:2px}",
  " #stage3d .ir-three-toolbar button,#stage3d .ir-three-toolbar select{min-height:30px;padding:4px 7px;font-size:11.5px}#stage3d .ir-three-check{font-size:11.5px;margin:0 2px;white-space:nowrap}",
  " #stage3d .ir-three-count{display:none}#stage3d .ir-three-footer{display:none}.card{top:52px;left:6px;max-width:calc(100% - 12px);max-height:calc(100% - 64px)}}",
  "#helpBtn{display:inline-flex;align-items:center;gap:6px}#helpBtn .ic{flex:none;color:#1668ea}.help{position:absolute;right:12px;top:52px;width:380px;max-width:calc(100% - 24px);z-index:16;box-shadow:0 8px 24px rgba(15,30,60,.18)}.help[hidden]{display:none}.help ul{margin:0;padding-left:18px;display:grid;gap:5px;font-size:13px}.help p{margin:8px 0 0;color:var(--muted);font-size:12px}",
  ".side{display:flex;flex-direction:column;gap:10px;min-height:0;overflow:auto}.box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px}",
  ".box h3{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}",
  ".groups label{display:flex;align-items:center;gap:7px;padding:3px 0;cursor:pointer}.groups small{margin-left:auto;color:var(--muted)}",
  ".groups-actions{display:flex;gap:6px;margin-top:6px}.groups-actions button{font:inherit;font-size:12px;border:1px solid var(--line);background:#f6f8fb;border-radius:7px;padding:3px 8px;cursor:pointer}",
  ".row2{display:grid;grid-template-columns:1fr 1fr;gap:6px}.box input[type=checkbox]{width:auto;margin:0}.box select,.box input{width:100%;font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink)}",
  ".box label.f{display:block;font-size:12px;color:var(--muted);margin-bottom:6px}.box label.f input,.box label.f select{margin-top:3px}",
  // The list by marks: a card a mark, its elements under it when opened.
  "#found{margin-top:7px;font-size:12px}#found b{color:var(--ink)}.list{max-height:380px;overflow:auto;margin-top:8px;display:grid;gap:5px;align-content:start;padding:1px}",
  ".mk{border:1px solid var(--line);border-radius:9px;background:#fff;overflow:hidden}.mk-h{display:flex;align-items:center;gap:8px;width:100%;text-align:left;font:inherit;background:none;border:0;padding:7px 9px;cursor:pointer;color:var(--ink)}",
  ".mk-h:hover{background:#f5f8fc}.mk.open>.mk-h{background:#f3f7fd;border-bottom:1px solid #e8eef6}.mk .chev{flex:none;width:0;height:0;border-left:5px solid #8a96a8;border-top:4px solid transparent;border-bottom:4px solid transparent;transition:transform .15s}.mk.open .chev{transform:rotate(90deg)}",
  ".mk .chip{flex:none;min-width:48px;box-sizing:border-box;max-width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 7px;border-radius:6px;background:#e7effd;color:#1450b4;font-size:12.5px;text-align:center}",
  ".mk-t{flex:1;min-width:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mk-t small{margin-left:6px;font-size:12px;color:var(--muted)}.mk-n{flex:none;font-size:12px;color:var(--muted);white-space:nowrap}.mk-n i.st{margin-right:4px}",
  ".mk-l{display:grid}.mk-l .it{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:7px;width:100%;text-align:left;font:inherit;font-size:12.5px;background:none;border:0;border-top:1px solid #f0f3f7;padding:5px 9px 5px 22px;cursor:pointer;color:var(--ink)}",
  ".mk-l .it:first-child{border-top:0}.mk-l .it:hover{background:#f5f8fc}.mk-l .it.on{background:#e6efff;box-shadow:inset 3px 0 0 #1668ea}.mk-l .it i.st{margin:0}.mk-l .ax{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mk-l .lv{color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}.mk-l .empty{padding:5px 9px 6px 22px;font-size:12px}",
  "i.st{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}i.st.mounted{background:var(--ok)}i.st.partial{background:var(--part)}i.st.planned{background:var(--wait)}",
  ".det-title b{font-size:18px;display:block}.det-title small{color:var(--muted)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin-top:8px}",
  ".grid div span{display:block;font-size:11.5px;color:var(--muted)}.grid div b{font-weight:600;word-break:break-word}.ok{color:var(--ok)}.partial{color:var(--part)}.wait{color:var(--wait)}",
  ".warn{background:#fff6e0;border:1px solid #f0d58a;border-radius:8px;padding:6px 8px;font-size:12px;margin-bottom:8px}",
  ".from{font-size:12px;margin-bottom:8px}.from summary{cursor:pointer;font-weight:700}",
  ".inst{background:#eef8f2;border:1px solid #bfdcc9;border-radius:8px;padding:6px 8px;font-size:12px;margin-bottom:8px;color:#2c5e45}",
  ".fast{margin-top:10px;font-size:12.5px;border:1px solid #dcd6c8;border-radius:8px;padding:6px 8px;background:#fbf9f4}.fast span,.fast small{display:block}.fast small{color:#6b7280}",
  ".prog{margin-top:10px;font-size:12.5px}.prog .bar{height:6px;background:#e4e9f1;border-radius:3px;margin-top:5px;overflow:hidden}.prog .bar i{display:block;height:100%;background:var(--ok)}",
  ".empty{color:var(--muted)}.foot{padding:0 20px 16px;color:var(--muted);font-size:12px}",
  // The card in plain words (src/scheme-element-card.js), as in the program.
  ".ec-card{display:grid;gap:8px}.ec-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.ec-head>div{display:grid;gap:2px;min-width:0}.ec-mark{font-size:20px;line-height:1.1}.ec-name{font-weight:700}",
  ".ec-status{flex:none;padding:3px 8px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;background:#fdeeee;color:#b93838}.ec-status.ec-ok{background:#e9f6ef;color:#23784f}.ec-status.ec-partial{background:#fdf5e4;color:#946411}",
  ".ec-section{padding:6px 9px;border-radius:8px;background:#f1f5f9;font-weight:700;font-size:13px}.ec-block{display:grid;gap:3px;padding:8px 9px;border:1px solid var(--line);border-radius:9px;background:#fbfcfd}",
  ".ec-block>b{color:var(--muted);font-size:11px;letter-spacing:.04em;text-transform:uppercase}.ec-block p{margin:0;font-size:13px;line-height:1.45}.ec-block p.ec-muted,.ec-block p.ec-src,.ec-src-title{font-size:12px;color:#3e5568}.ec-src span{font-weight:700}",
  ".ec-drawings{border-color:#cfe0d6;background:#f5fbf7}.ec-drawings.ec-warn{border-color:#e7d2a6;background:#fdf9ef}.ec-found{font-weight:700}.ec-found.ec-ok{color:#23784f}.ec-found.ec-warn,.ec-block p.ec-check{color:#8a6416}",
  ".ec-coords{border:1px solid var(--line);border-radius:9px}.ec-coords summary{padding:7px 9px;cursor:pointer;font-weight:700;font-size:12px}.ec-coords>div{display:flex;justify-content:space-between;gap:10px;padding:4px 9px;border-top:1px solid #eef2f7;font-size:12px}.ec-coords span{color:var(--muted)}",
  // The top of the card as in the report of 21.10.2026, as in the program.
  ".ec-badge{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}.ec-badge .ec-status{padding:5px 11px;font-size:12px}.ec-badge small{color:#5f7383;font-size:11px}",
  ".ec-traits dl{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin:0}.ec-traits dl>div{display:contents}.ec-traits dl>div[hidden]{display:none}.ec-traits dt{color:var(--muted);font-size:12px;line-height:1.45}.ec-traits dd{margin:0;font-size:13px;font-weight:600;line-height:1.45}",
  ".ec-facts{color:#4f6474;font-size:12px;line-height:1.45}",
  ".ec-facts.ec-warn{color:#8a6416;margin-top:4px}",
  ".ec-nodes>span{color:#4f6474;font-size:12px}.ec-nodes>div{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}.ec-more{align-self:center;color:#6b7f8e;font-size:11px}",
  ".ec-chip{padding:5px 10px;border:1px solid #cdd8e1;border-radius:999px;background:#fff;color:#22394b;font:inherit;font-size:11.5px;cursor:pointer}.ec-chip:hover{border-color:#1668ea;color:#1668ea}",
  ".ec-tools{display:flex;flex-wrap:wrap;gap:6px}.ec-tools button{padding:7px 12px;border:1px solid #cdd8e1;border-radius:8px;background:#fff;color:#22394b;font:inherit;font-size:12px;cursor:pointer}.ec-tools button:hover{border-color:#1668ea}",
  ".ec-looks{display:flex;flex-wrap:wrap;align-items:center;gap:4px}.ec-looks span{color:#6b7f8e;font-size:11px;margin-right:2px}.ec-looks button{padding:4px 8px;border:1px solid #cdd8e1;border-radius:7px;background:#fff;color:#22394b;font:inherit;font-size:11px;cursor:pointer}.ec-looks button:hover{border-color:#1668ea;color:#1668ea}",
  ".ec-parts{width:100%;border-collapse:collapse;font-size:12px}.ec-parts th{padding:5px 4px;border-bottom:1px solid #cfd9e2;color:#536a7a;font-weight:700;text-align:left}",
  ".ec-parts td{padding:6px 4px;border-bottom:1px solid #e6edf2;vertical-align:top}.ec-parts td:first-child{white-space:nowrap}.ec-parts .ec-n{text-align:right;white-space:nowrap}.ec-parts tr[data-ec-pos]{cursor:pointer}.ec-parts tr.on td{background:#e8f1fc}",
  ".ec-sw{display:inline-block;width:11px;height:11px;margin-right:6px;border-radius:2px;background:#c5ced6;vertical-align:-1px}.ec-note{color:#5f7383;font-size:11px}.ec-calc{color:#6b7f8e}",
  ".ec-parts-src{margin:4px 0 0;color:#6b7f8e;font-size:11px}",
  "@media(max-width:900px){.stage-bar{justify-content:flex-start}.side{width:100vw;max-width:100vw}}",
  ".ir-three-footer .ir-three-st{display:inline-flex;align-items:center;gap:6px;margin-right:16px}.ir-three-footer .ir-three-st i{width:11px;height:11px;border-radius:3px;display:inline-block}",
    "@media print{.stage-bar,.side{display:none}}"
 ].join("\n");

 // The read-only page: filters → visible elements → the same 3D module of the program.
 function viewer(){
  var D=window.__irSchemeData||JSON.parse(document.getElementById("ir-scheme-data").textContent);
  var $=function(id){return document.getElementById(id)};
  // No word of the conventional in the exported page (the engineer, 03.11.2026: «все упоминания об условных убери при
  // выгрузке»): «(условно)», «(сечение условно)», «· сечение условное: 24», a sentence «… показаны условно …» are taken
  // out of every text and hint the page and its 3D write, now and later.
  var plain=function(t){
   if(!/условн/i.test(t))return t;
   return t.replace(/\s*\([^()]*условн[^()]*\)/gi,"").replace(/\s*·[^·.!?;]*условн[^·.!?;]*/gi,"").replace(/[^.!?;]*условн[^.!?;]*[.!?;]?\s*/gi,"").replace(/[\s,—–-]+$/,"")
  };
  var clean=function(node){
   if(node.nodeType===3){var v=plain(node.nodeValue);if(v!==node.nodeValue)node.nodeValue=v;return}
   if(node.nodeType!==1)return;
   if(node.title&&/условн/i.test(node.title))node.title=plain(node.title);
   var w=document.createTreeWalker(node,5),n;while((n=w.nextNode())){if(n.nodeType===3){var t=plain(n.nodeValue);if(t!==n.nodeValue)n.nodeValue=t}else if(n.title&&/условн/i.test(n.title))n.title=plain(n.title)}
  };
  clean(document.body);
  new MutationObserver(function(list){list.forEach(function(m){if(m.type==="characterData")clean(m.target);else if(m.type==="attributes")clean(m.target);else m.addedNodes.forEach(clean)})})
   .observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["title"]});
  var esc=function(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
  var fmt=function(v){var n=Number(v);return Number.isFinite(n)?Number(n.toFixed(1)).toLocaleString("ru-RU",{maximumFractionDigits:1}):"—"};
  var S={open:new Set(),hidden:new Set(),sec:new Set(),conf:"all",status:"all",work:"all",min:"",max:"",q:"",sel:"",color:"status",labels:false,dims:false,bg:D.background||"standard"};
  var statusText={mounted:"Смонтирована",partial:"Частично смонтирована",planned:"Не смонтирована"};
  var levelOk=function(c){var lo=Math.min(c.z0,c.z2),hi=Math.max(c.z0,c.z2);if(S.min!==""&&hi<Number(S.min))return false;if(S.max!==""&&lo>Number(S.max))return false;return true};
  // How fully the drawings determined an element and its section, as in the program: the preliminary ones are pale.
  var instText={confirmed:"подтверждено",computed:"вычислено",partial:"определено частично",ambiguous:"неоднозначно",conflict:"конфликт данных",not_found:"нет в новом анализе"};
  var confOk=function(c){return S.conf==="all"||(S.conf==="prelim")===Boolean(c.preliminary)};
  var shown=function(){return D.elements.filter(function(c){return!S.hidden.has(c.scheme_group)&&!S.sec.has(c.source_section||"")&&confOk(c)&&(S.work==="all"||String(c.work||"")===S.work)&&(S.status==="all"||c.status===S.status)&&levelOk(c)})};
  var match=function(c){var q=S.q.trim().toLowerCase();return!q||[c.mark,c.mark_name,c.type_name,c.axisX,c.axisY].join(" ").toLowerCase().indexOf(q)>=0};
  function draw3d(){
   var els=shown();
   window.irThreeSchemeView.render($("stage3d"),{objectId:"export:"+D.objectId,axesX:D.axesX,axesY:D.axesY,spanX:D.spanX,spanY:D.spanY,gridDirX:D.gridDirX,gridDirY:D.gridDirY,
    gridX:D.gridX,gridY:D.gridY,elements:els,selected:S.sel,maxZ:els.reduce(function(m,c){return Math.max(m,c.z0,c.z2,c.mz||0)},0),
    colorMode:S.color,showLabels:S.labels,showDimensions:S.dims,background:S.bg,canEdit:false,marks:[],report:true,
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
  function sections(){
   var box=$("sections");if(!box)return;var m=new Map();
   D.elements.forEach(function(c){var k=c.source_section||"";m.set(k,(m.get(k)||0)+1)});
   box.innerHTML=[...m].map(function(e){return'<label><input type="checkbox" data-sec="'+esc(e[0])+'"'+(S.sec.has(e[0])?"":" checked")+'> '+esc(e[0]||"Без раздела")+'<small>'+e[1]+'</small></label>'}).join("");
   box.querySelectorAll("[data-sec]").forEach(function(i){i.onchange=function(){if(i.checked)S.sec.delete(i.dataset.sec);else S.sec.add(i.dataset.sec);draw3d();list()}})
  }
  // The permanent fasteners and the holes of the member's assembly sheet, as the program's card shows them.
  function fastenersHtml(j){
   if(!j||!((j.fasteners||[]).length||(j.holes_mm||[]).length))return"";
   return'<div class="fast"><b>Метизы и отверстия</b>'+(j.fasteners||[]).map(function(f){return'<span>'+esc(f)+'</span>'}).join("")+
    ((j.holes_mm||[]).length?'<span>Отверстия Ø'+esc(j.holes_mm.join(", Ø"))+(j.hole_mm?" (все Ø"+esc(j.hole_mm)+", кроме оговоренных)":"")+'</span>':"")+(j.fasteners_sheet?'<small>'+esc(j.fasteners_sheet)+'</small>':"")+'</div>'
  }
  // The holes of the member at their places on the views of its assembly sheet, as the program's card shows them.
  function drillHtml(c){
   var views=Array.isArray(c.drill)?c.drill.filter(function(v){return v&&Array.isArray(v.holes)}):[];if(!views.length)return"";
   var row=function(v){var own=v.holes.filter(function(h){return!Number(h[3])}),part=v.holes.filter(function(h){return Number(h[3])===1}).length,far=v.holes.filter(function(h){return Number(h[3])===2}).length,by=new Map();
    own.forEach(function(h){var d=Number(h[2])||0;if(!by.has(d))by.set(d,[]);by.get(d).push(Number(h[0])||0)});
    var groups=[];by.forEach(function(at,d){groups.push((d?"Ø"+d:"Ø не указан")+" — "+at.length+" шт.: "+at.filter(function(x,i){return at.indexOf(x)===i}).sort(function(a,b){return a-b}).slice(0,24).map(fmt).join(", ")+" мм от "+(v.leg===1?"перелома":"начала"))});
    return'<span>Вид «'+esc(v.view||"")+'»'+(v.leg===0?", первая половина":v.leg===1?", вторая половина":"")+(v.scale?", М "+esc(v.scale):"")+', длина '+fmt(v.length_mm)+' мм'+(v.not_to_scale?" (нарисован не в масштабе — по размерам чертежа)":"")+': '+esc(groups.join("; ")||"—")+(part?"; в фасонках на нём — "+part+" шт.":"")+(far?"; дальней полки сквозь вырыв — "+far+" шт.":"")+'</span>'};
   return'<div class="fast"><b>Отверстия по сборочному чертежу</b>'+views.map(row).join("")+(views[0].sheet?'<small>'+esc(views[0].sheet)+'</small>':"")+'</div>'
  }
  // The plates drawn apart with their holes, as the program's card shows them.
  function cutsHtml(c){
   var rows=c.cuts&&Array.isArray(c.cuts.rows)?c.cuts.rows:[];if(!rows.length)return"";
   var line=function(r){var p=Array.isArray(r.plate)?r.plate:[],L=Number(p[0])||0,W=Number(p[1])||0,flat=r.dir!=="по вертикали",of=Number(r.of)||0,at=Number(r.at)||0,on=esc(r.on||"");
    var edge=Math.max(250,of*.05),up=r.on_dir==="по вертикали",cut="разрез в "+fmt(at)+" из "+fmt(of)+" мм от "+(up?"верха":"начала")+" вида «"+on+"»";
    var where=r.at===undefined||r.at===null?"":r.both?", у обоих концов (стрелки вида у обоих концов вида «"+on+"»)":of>0&&at>=of-edge?", "+(up?"внизу":"у конца")+" ("+cut+")":of>0&&at<=edge?", "+(up?"вверху":"у начала")+" ("+cut+")":", "+cut;
    var ip=r.inner&&Array.isArray(r.inner.plate)?r.inner.plate:null,shim=ip?"; на ней прокладка "+fmt(flat?Number(ip[0])||0:Number(ip[1])||0)+"×"+fmt(flat?Number(ip[1])||0:Number(ip[0])||0)+"×"+fmt(Number(r.inner.t)||0)+" мм — поз. "+esc(r.inner.pos!=null?r.inner.pos:"—"):"";
    var spec=(r.section?" — поз. "+esc(r.pos!=null?r.pos:"—")+" «"+esc(r.section)+"» по спецификации":"")+shim;
    var by={},keys=[];(Array.isArray(r.holes)?r.holes:[]).forEach(function(h){var d=Number(h[2])||0,a=(Number(h[0])||0)-L/2,o=Number(h[1])||0;if(!by[d]){by[d]=[];keys.push(d)}by[d].push(flat?[a,o]:[o,a])});
    var holes=keys.map(function(d){return(d?"Ø"+d:"Ø не указан")+" — "+by[d].length+" шт.: "+by[d].slice(0,16).map(function(q){return"("+fmt(q[0])+"; "+fmt(q[1])+")"}).join(", ")}).join("; ");
    return'<span>«'+esc(r.view||"")+'»: пластина '+fmt(flat?L:W)+'×'+fmt(flat?W:L)+' мм'+spec+where+'; отверстия '+esc(holes||"—")+' мм от середины пластины (вправо; вниз по чертежу)</span>'};
   return'<div class="fast"><b>Пластины с отверстиями по разрезам</b>'+rows.map(line).join("")+'<small>'+esc(c.cuts.sheet||"")+'</small></div>'
  }
  // The plates across the member (ribs, connection plates) of its assembly sheet, as the program's card shows them.
  function platesHtml(c){
   var rows=c.plates&&Array.isArray(c.plates.rows)?c.plates.rows:[],gussets=c.plates&&Array.isArray(c.plates.gussets)?c.plates.gussets:[];if(!rows.length&&!gussets.length)return"";
   var groups=new Map();rows.forEach(function(r){var k=(r.at||[]).join("–")+"|"+(r.pos!=null?r.pos:r.section!=null?r.section:r.t);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)});
   var line=function(list){var r=list[0],x=list.filter(function(o){return Array.isArray(o.x)}),signs=new Set(x.map(function(o){return Math.sign((Number(o.x[0])||0)+(Number(o.x[1])||0))})),w=x.length?Math.max.apply(null,x.map(function(o){return(Number(o.x[1])||0)-(Number(o.x[0])||0)})):0;
    var h=Array.isArray(r.z)?(Number(r.z[1])||0)-(Number(r.z[0])||0):Number(r.h_mm)||0,at=r.at||[];
    var side=!x.length?"сторона стенки на плане не показана":signs.size>1?"с двух сторон стенки":"с одной стороны стенки";
    return'<span>'+(r.pos?"поз. "+esc(r.pos)+" — ":"")+esc(r.section||"пластина "+fmt(r.t)+" мм")+': '+fmt(Number(at[0])||0)+'–'+fmt(Number(at[1])||0)+' мм от начала, '+side+(w?", ширина "+fmt(w)+" мм":"")+(h?", высота "+fmt(h)+" мм":", высота — между полками")+(r.approx?" (место примерно: вид нарисован с разрывом)":"")+'</span>'};
   var out=[];groups.forEach(function(list){out.push(line(list))});
   gussets.forEach(function(g){var cs=(g.poly||[]).map(function(e){return Math.abs(Number(e[1])||0)}),far=cs.length?Math.max.apply(null,cs):0,d=Array.isArray(g.depth)?g.depth:null,x=Array.isArray(g.x)?g.x:null,at=g.at||[];
    var where=g.plane==="план"?(d?"параллельно полкам, "+fmt(Number(d[0])||0)+"–"+fmt(Number(d[1])||0)+" мм от "+(g.edge>0?"нижней":"верхней")+" грани":"параллельно полкам"):(x&&Math.abs((Number(x[0])||0)+(Number(x[1])||0))>10?"параллельно стенке, "+fmt(Number(x[0])||0)+"…"+fmt(Number(x[1])||0)+" мм от оси":"в плоскости стенки");
    var by={},keys=[];(Array.isArray(g.holes)?g.holes:[]).forEach(function(h){var dm=Number(h[2])||0;if(!by[dm]){by[dm]=[];keys.push(dm)}by[dm].push(Number(h[0])||0)});
    var holes=keys.map(function(dm){return(dm?"Ø"+dm:"Ø не указан")+" — "+by[dm].length+" шт. ("+by[dm].sort(function(a,b){return a-b}).map(fmt).join(", ")+" мм от начала)"}).join("; ");
    out.push('<span>'+(g.pos?"поз. "+esc(g.pos)+" — ":"")+esc(g.section||"пластина "+fmt(g.t)+" мм")+': фасонка '+fmt(Number(at[0])||0)+'–'+fmt(Number(at[1])||0)+' мм от начала, '+where+(far?", до "+fmt(far)+" мм от оси":"")+(holes?", отверстия: "+esc(holes):"")+'</span>')});
   return'<div class="fast"><b>Рёбра, пластины и фасонки по сборочному чертежу</b>'+out.join("")+'<small>'+esc(c.plates.sheet||"")+'</small></div>'
  }
  // The parts of the member by the specification of its assembly sheet, as the program's card shows them.
  function partsHtml(c){
   var rows=c.parts&&Array.isArray(c.parts.rows)?c.parts.rows:[];if(!rows.length)return"";
   return'<div class="fast"><b>Детали марки по спецификации</b>'+rows.map(function(r){return'<span>'+(r.pos?"поз. "+esc(r.pos)+" — ":"")+esc(r.section||"сечение не прочитано")+(r.length_mm?", L "+fmt(r.length_mm)+" мм":"")+(r.count?", "+fmt(r.count)+" шт.":"")+(r.note?" ("+esc(r.note)+")":"")+'</span>'}).join("")+
    '<small>'+esc(c.parts.sheet||"")+(c.parts.by?" · как "+esc(c.parts.by):"")+'</small></div>'
  }
  // The list of elements by marks (the engineer, 03.11.2026, a picture of it: «не нравится вид блока» — 5071 rows
  // «● 1 Балка / О4 − 2 280 мм / Л + 1 140 мм · низ 2 225 · верх 2 225» one under another): a row a mark — its badge, its
  // kind and section, how many and how many mounted —; opened, its elements: the place by the axes, short, and the level as
  // on the drawings (+2,225). Few found — all open; the mark of the element selected — open, the element in view.
  var plural=function(n,a,b,c){var m=n%10,h=n%100;return m===1&&h!==11?a:m>=2&&m<=4&&(h<12||h>14)?b:c};
  var lvl=function(v){v=Number(v)||0;return(v<0?"−":"+")+(Math.abs(v)/1000).toFixed(3).replace(".",",")};
  var lvls=function(c){var a=Number(c.z0)||0,b=Number(c.z2);return!Number.isFinite(b)||Math.abs(b-a)<1?lvl(a):lvl(Math.min(a,b))+" … "+lvl(Math.max(a,b))};
  var axShort=function(t){return String(t||"").replace(/\s*мм/g,"").replace(/\s+([−+–-])\s+/g," $1")};
  function list(){
   var found=shown().filter(match),by=new Map();
   found.forEach(function(c){var k=String(c.mark||"");if(!by.has(k))by.set(k,[]);by.get(k).push(c)});
   var keys=Array.from(by.keys()).sort(function(a,b){return!a?1:!b?-1:a.localeCompare(b,"ru",{numeric:true})}),auto=found.length<=40;
   $("found").innerHTML=found.length?"<b>"+found.length.toLocaleString("ru-RU")+"</b> "+plural(found.length,"элемент","элемента","элементов")+" · <b>"+keys.length.toLocaleString("ru-RU")+"</b> "+plural(keys.length,"марка","марки","марок"):"Ничего не найдено — измените поиск или фильтр";
   $("list").innerHTML=keys.slice(0,300).map(function(k){
    var g=by.get(k),c=g[0],open=auto||S.open.has(k)||g.some(function(o){return o.id===S.sel}),m=g.filter(function(o){return o.status==="mounted"}).length;
    var kinds=new Set(g.map(function(o){return o.type_name||""})),profs=new Set(g.map(function(o){return o.profile||""}));
    var kind=kinds.size===1?c.type_name||c.mark_name||"":"разные виды",prof=profs.size===1?c.profile||"":"";
    return'<div class="mk'+(open?" open":"")+'"><button type="button" class="mk-h" data-mark="'+esc(k)+'" aria-expanded="'+open+'" title="'+esc((k||"Без марки")+" — "+(c.mark_name||kind))+'">'+
     '<i class="chev"></i><b class="chip">'+esc(k||"Без марки")+'</b><span class="mk-t">'+esc(kind)+(prof?'<small>'+esc(prof)+'</small>':"")+'</span>'+
     '<span class="mk-n" title="'+(m?"Смонтировано "+m+" из "+g.length:"Всего на схеме: "+g.length)+'">'+(m?'<i class="st mounted"></i>'+m+" из ":"")+g.length+" шт.</span></button>"+
     (open?'<div class="mk-l">'+g.slice(0,200).map(function(o){var a=o.axisText||{};return'<button type="button" data-id="'+esc(o.id)+'" class="it'+(o.id===S.sel?" on":"")+'" title="'+esc((a.x||"")+" / "+(a.y||""))+'">'+
      '<i class="st '+esc(o.status)+'"></i><span class="ax">'+esc(axShort(a.x)+" / "+axShort(a.y))+'</span><span class="lv">'+esc(lvls(o))+"</span></button>"}).join("")+(g.length>200?'<div class="empty">Показаны первые 200 — уточните поиск.</div>':"")+"</div>":"")+"</div>"}).join("")+
    (keys.length>300?'<div class="empty">Показаны первые 300 марок — уточните поиск.</div>':"");
   $("list").querySelectorAll("[data-mark]").forEach(function(b){b.onclick=function(){var k=b.dataset.mark;if(S.open.has(k))S.open.delete(k);else S.open.add(k);if(!S.open.has(k)&&auto)S.open.add(k);list()}});
   $("list").querySelectorAll("[data-id]").forEach(function(b){b.onclick=function(){S.sel=b.dataset.id;draw3d();window.irThreeSchemeView.focus&&window.irThreeSchemeView.focus(S.sel);details();list()}});
   var on=$("list").querySelector(".it.on");if(on&&on.scrollIntoView)on.scrollIntoView({block:"nearest"})
  }
  function details(){
   var c=D.elements.find(function(x){return x.id===S.sel}),box=$("details");
   // The card of the element: apart from the panel, shown while an element is selected.
   box.hidden=!c;if(!c){box.innerHTML="";return}
   var p=c.progress,a=c.axisText,cls=c.status==="mounted"?"ok":c.status==="partial"?"partial":"wait",EC=window.irSchemeElementCard,V=window.irThreeSchemeView;
   var prog=p&&p.total>0?'<div class="prog"><b>Марка '+esc(c.mark)+' по ведомости:</b> всего '+fmt(p.total)+' шт., смонтировано '+fmt(p.mounted)+', осталось '+fmt(p.left)+'<div class="bar"><i style="width:'+Math.max(0,Math.min(100,p.mounted/p.total*100))+'%"></i></div></div>':"";
   if(EC){
    var e={mark:c.mark,name:c.mark_name,type_name:/\s\/\s/.test(c.type_name||"")?"":c.type_name,type_key:c.type_key,lay:c.lay||null,group:c.scheme_group,geometry:c.geometryType,profile:c.profile,standard:c.profile_standard,section:c.section,steel:c.steel||"",joint:c.joint||null,
     status:c.status,status_label:statusText[c.status]||c.status,status_title:p&&p.total>0?"Статус по ведомости марок":"",x:c.x,y:c.y,x2:c.x2,y2:c.y2,z0:c.z0,z2:c.z2,mx:c.mx,my:c.my,mz:c.mz,r:c.r,ri:c.ri,sw:c.sw,ft:c.ft,
     doc:c.draft_doc,src_section:c.source_section,src_sheet:c.source_sheet||"",src_file:c.source_file||"",instance_status:c.instance_status,preliminary:!!c.preliminary,reasons:c.instance_reasons||[],sources:c.param_sources||null,pdf_new:c.pdf_new||null,check_note:c.check_note||"",manual:!!c.manual,confirmed:c.engineer_confirmed||null,edited:!!c.engineer_edited,
     // As in the program: the day of mounting, the sheet, the masses, the bolts, the nodes and the parts in their colours.
     status_date:c.status_date||"",status_more:c.status_more||"",sheet:c.sheet||"",mass_kmd:c.mass_kmd||null,spec:c.parts||null,
     model:V&&V.card?V.card(c.id):null,kgm:function(t){return V&&V.massPerMetre?V.massPerMetre(t,c.profile_standard):null}};
    box.innerHTML='<button type="button" class="side-close" id="uncard" aria-label="Закрыть карточку">✕</button><h3>Выбранный элемент</h3><div class="ec-card">'+EC.head(e)+EC.facts(e)+EC.nodes(e)+EC.tools(e)+EC.parts(e)+EC.traits(e,{axesX:D.axesX,axesY:D.axesY,posX:D.gridX||{},posY:D.gridY||{}})+EC.drawings(e)+
     prog+fastenersHtml(c.joint)+drillHtml(c)+cutsHtml(c)+platesHtml(c)+EC.coords(e)+'</div>';
    if(EC.bind)EC.bind(box,c.id);
    $("uncard").onclick=function(){S.sel="";details();list();draw3d()};return
   }
   box.innerHTML='<button type="button" class="side-close" id="uncard" aria-label="Закрыть карточку">✕</button><h3>Выбранный элемент</h3>'+(c.draft?'<div class="warn">Черновое размещение из чертежей — координаты и отметки требуют проверки'+(c.draft_doc?" · "+esc(c.draft_doc):"")+'</div>':"")+
    '<div class="det-title"><b>'+esc(c.mark||"—")+'</b>'+(c.mark_name?'<small>'+esc(c.mark_name)+'</small>':"")+'</div>'+
    (instText[c.instance_status]?'<div class="'+(c.preliminary?"warn":"inst")+'">По чертежам: '+esc(instText[c.instance_status])+(c.preliminary?" · предварительно":"")+(c.source_section?" · раздел "+esc(c.source_section):"")+
     (c.instance_reasons||[]).map(function(r){return'<br>• '+esc(r)}).join("")+'</div>':"")+
    (c.param_sources?'<details class="from"><summary>Откуда данные</summary>'+[["Положение","position"],["Отметки","levels"],["Наименование","name"],["Наименование на чертеже","name_other"],["Профиль","profile"],["Габарит","size"],["Другой профиль","profile_other"]].filter(function(r){return c.param_sources[r[1]]}).map(function(r){return'<div>'+esc(r[0])+': '+esc(c.param_sources[r[1]])+'</div>'}).join("")+'</details>':"")+'<div class="grid">'+
    [["Тип элемента",c.type_name],["Сечение",c.section],["Профиль",c.profile],[p&&p.total>0?"Статус по ведомости":"Статус",'<span class="'+cls+'">'+esc(statusText[c.status]||c.status)+'</span>',1],
     ["Ось "+D.axesX[0]+"–"+D.axesX[D.axesX.length-1],a.x],["Ось "+D.axesY[0]+"–"+D.axesY[D.axesY.length-1],a.y],["Коорд. X",fmt(c.x)+" мм"],["Коорд. Y",fmt(c.y)+" мм"],
     ["Низ",fmt(c.z0)+" мм"],["Верх / конец Z",fmt(c.z2)+" мм"]].concat(c.geometryType!=="column"&&c.geometryType!=="shell"&&c.geometryType!=="plate"?[["Конец X",fmt(c.x2)+" мм"],["Конец Y",fmt(c.y2)+" мм"]]:[])
     .map(function(r){return'<div><span>'+esc(r[0])+'</span><b>'+(r[2]?r[1]:esc(r[1]||"—"))+'</b></div>'}).join("")+'</div>'+
    fastenersHtml(c.joint)+drillHtml(c)+cutsHtml(c)+platesHtml(c)+partsHtml(c)+prog;
   $("uncard").onclick=function(){S.sel="";details();list();draw3d()}
  }
  $("status").onchange=function(e){S.status=e.target.value;draw3d();list()};
  if($("conf"))$("conf").onchange=function(e){S.conf=e.target.value;draw3d();list()};
  // All the work types together, or one of them, as in the program.
  if($("work"))$("work").onchange=function(e){S.work=e.target.value;S.sel="";details();draw3d();list()};
  $("lmin").oninput=function(e){S.min=e.target.value;draw3d();list()};
  $("lmax").oninput=function(e){S.max=e.target.value;draw3d();list()};
  $("q").oninput=function(e){S.q=e.target.value;list()};
  $("all").onclick=function(){S.hidden.clear();groups();draw3d();list()};
  $("none").onclick=function(){D.groups.forEach(function(g){S.hidden.add(g.key)});groups();draw3d();list()};
  $("labels").onchange=function(e){S.labels=e.target.checked;draw3d()};
  $("dims").onchange=function(e){S.dims=e.target.checked;draw3d()};
  // The background: a button of the colour chosen opens the list of the colours (the engineer, 03.11.2026: «Цвета
  // выпадающим списком сделай»); a colour chosen closes it.
  var bgOpen=function(open){$("bgList").hidden=!open;$("bgBtn").setAttribute("aria-expanded",String(open))};
  var paintBg=function(){var on=null;Array.prototype.forEach.call($("bgList").querySelectorAll("li[data-bg]"),function(b){var me=b.getAttribute("data-bg")===S.bg;b.setAttribute("aria-selected",me?"true":"false");if(me)on=b});
   if(on){$("bgBtn").querySelector("i").style.background=on.style.background;$("bgBtn").title=on.title}};
  paintBg();$("bgBtn").onclick=function(){bgOpen($("bgList").hidden)};
  $("bgList").onclick=function(e){var b=e.target.closest&&e.target.closest("li[data-bg]");if(!b)return;S.bg=b.getAttribute("data-bg");paintBg();bgOpen(false);draw3d()};
  // The side panel: closed until opened; a click on an element opens it on the element's card.
  var panel=function(open){$("wrap").classList.toggle("open",open);$("panel").setAttribute("aria-expanded",String(open))};
  $("panel").onclick=function(){panel(!$("wrap").classList.contains("open"))};$("close").onclick=function(){panel(false)};
  // Escape closes the card first, then the panel.
  document.addEventListener("keydown",function(e){if(e.key!=="Escape")return;if(!$("bgList").hidden)bgOpen(false);else if(S.sel){S.sel="";details();list();draw3d()}else if($("wrap").classList.contains("open"))panel(false)});
  // Every window closes by a click elsewhere (the engineer, 03.11.2026: «Все окна должны после открытия закрываться при
  // нажатие в другое место»): the panel of the filters, the card of an element (a click on the 3D chooses there itself),
  // the card of a node, a bolt or a crane, the help.
  document.addEventListener("pointerdown",function(e){
   var t=e.target,inside=function(sel){return t.closest&&t.closest(sel)};
   if($("wrap").classList.contains("open")&&!inside("#side")&&!inside("#panel"))panel(false);
   if(!$("help").hidden&&!inside("#help")&&!inside("#helpBtn"))$("help").hidden=true;
   if(!$("bgList").hidden&&!inside("#bg"))bgOpen(false);
   var node=document.querySelector("#irThreeNode");if(node&&!node.hidden&&!inside("#irThreeNode")){var x=node.querySelector('[data-node="close"]');if(x)x.click();else node.hidden=true}
   if(S.sel&&!$("details").hidden&&!inside("#details")&&!inside("#stage3d canvas")&&!inside("#list")){S.sel="";details();list();draw3d()}
  },true);
  // «Инструкция» (was «? Помощь по 3D»; the engineer, 03.11.2026: «нормальную иконку поставь, переименуй Инструкция»): how to move through the scheme (the hints that stood under it).
  $("helpBtn").onclick=function(){$("help").hidden=!$("help").hidden};
  $("full").onclick=function(){var st=$("stage");if(document.fullscreenElement)document.exitFullscreen();else if(st.requestFullscreen)st.requestFullscreen()};
  groups();sections();list();details();draw3d()
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
   return'<tr><td><b>'+esc(c.mark||"—")+'</b></td><td>'+esc(c.title||c.type_name||"")+'<small>'+esc(c.profile||"")+'</small></td><td>'+esc([a.x,a.y].filter(Boolean).join(" / "))+'</td><td>'+num(c.z0)+'</td><td>'+num(c.z2)+'</td><td><i class="st '+s+'"></i>'+st[s]+(c.preliminary?'<small>предварительно</small>':"")+'</td></tr>'}).join("")};
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
 // A kind of work with the code of its drawings cut to its tail («Монтаж металлоконструкций · ИР-71535.00-05.2025-01-КМ3» —
 // «… · КМ3»; the whole in the option's title): the list of the filter as wide as its field — with the whole codes it
 // opened out to the left over the scheme (the engineer, 03.11.2026: «окно кривое»).
 var BGS=[["standard","стандартный","#dfe8f3"],["white","белый","#ffffff"],["gray","серый","#d9dde2"],["blue","голубой","#d6e6f6"],["sand","песочный","#efe6d6"],["dark","тёмный","#1d2733"]];
 var workShort=function(t){var s=String(t||""),i=s.lastIndexOf(" · ");if(i<0)return s;var code=s.slice(i+3),m=/[-–.]([A-Za-zА-Яа-яЁё]{1,4}\d*(?:\.\d+)?)$/.exec(code);return m&&code.length>12?s.slice(0,i+3)+m[1]:s};
 function page(d,libs){
  var s=d.summary;
  // Under the date in small letters — «Сделано в IR Project» (the engineer, 27.10.2026).
  // (the engineer, 03.11.2026: the logo at least 70 px high; the company's name where «Монтажная схема · Весь каркас»
  // stood; the pin of the address drawn, the name of the object smaller)
  var PIN='<svg class="pin" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
  var head='<header class="hx"><div class="hx-co">'+(d.company.logo?'<img src="'+esc(d.company.logo)+'" alt="Логотип">':"")+'</div>'+
   '<div class="hx-obj"><h1>'+esc(d.object.name||"Объект")+'</h1>'+(d.object.address?'<div class="addr">'+PIN+esc(d.object.address)+'</div>':"")+'</div>'+
   '<div class="hx-meta">'+(d.company.name?'<b>'+esc(d.company.name)+'</b>':"")+(d.work?'<span class="wk">'+esc(d.work)+'</span><br>':"")+'Выгружено '+esc(d.date)+'<small class="made">Сделано в IR Project</small></div></header>';
  var pct=s.total?Math.round(s.mounted/s.total*100):0;
  var sum='<section class="sum"><div><span>Элементов на схеме</span><b>'+s.placed+'</b></div><div><span>Смонтировано</span><b class="ok">'+s.placedMounted+'</b></div><div><span>Частично</span><b class="partial">'+s.placedPartial+'</b></div>'+
   '<div><span>Не смонтировано</span><b class="wait">'+(s.placed-s.placedMounted-s.placedPartial)+'</b></div>'+(s.total?'<div><span>По ведомости марок</span><b>'+pct+'%</b> <small>'+s.mounted+' из '+s.total+' шт.</small><div class="bar"><i style="width:'+pct+'%"></i></div></div>':"")+'</section>';
  var body='<main class="wrap" id="wrap">'+head+'<div class="area"><section class="stage" id="stage"><div class="stage-bar">'+
   '<label><input type="checkbox" id="labels"> Марки</label><label><input type="checkbox" id="dims"> Размеры</label>'+
   // (the background chosen by its colour, not by words — the engineer, 03.11.2026: «просто цвет сделай выбор, вместо текста»,
   // «Цвета выпадающим списком сделай»: the button shows the colour chosen, its list — the colours, their names on hover)
   '<span class="bgdd" id="bg"><button type="button" id="bgBtn" aria-haspopup="listbox" aria-expanded="false" aria-controls="bgList" title="Фон: '+BGS[0][1]+'"><span class="lbl">Фон</span><i style="background:'+BGS[0][2]+'"></i><b>▼</b></button>'+
   '<ul class="bglist" id="bgList" role="listbox" aria-label="Фон" hidden>'+BGS.map(function(b){return'<li role="option" data-bg="'+b[0]+'" title="Фон: '+b[1]+'" aria-label="Фон: '+b[1]+'" style="background:'+b[2]+'"></li>'}).join("")+'</ul></span>'+
   '<button type="button" id="helpBtn" aria-controls="help"><svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/><path d="M9 7h7M9 11h5"/></svg><span class="lbl">Инструкция</span></button><button type="button" id="full" title="На весь экран">⛶<span class="lbl"> На весь экран</span></button><button type="button" id="panel" aria-expanded="false" aria-controls="side" title="Сведения и фильтры">☰<span class="lbl"> Сведения и фильтры</span></button></div><div id="stage3d"></div>'+still(d)+'</section>'+
   '<div class="box card" id="details" hidden></div>'+
   '<div class="box help" id="help" hidden><h3>Инструкция</h3><ul>'+
   '<li><b>Левая кнопка мыши</b> — вращение схемы</li><li><b>Правая кнопка или нажатое колесо</b> — сдвиг</li><li><b>Колесо</b> — приблизить или отдалить к точке под курсором</li>'+
   '<li><b>Двойной щелчок</b> — сделать точку центром вращения</li><li><b>W A S D, стрелки</b> — движение по схеме, <b>Q E</b> — вниз и вверх, <b>Shift</b> — быстрее</li>'+
   '<li><b>Щелчок по элементу</b> — его карточка; по маркеру узла — карточка узла</li><li><b>Телефон:</b> один палец — вращение, два — сдвиг и масштаб</li>'+
   '<li><b>☰ Сведения и фильтры</b> — сводка, виды конструкций, фильтр и список элементов</li><li>Окна закрываются щелчком в любом другом месте или клавишей Esc</li></ul>'+
   '<p>Выгружено из IR Project — только просмотр.</p></div>'+
   '<aside class="side" id="side"><div class="box"><button type="button" class="side-close" id="close" aria-label="Свернуть панель">✕</button><h3>Сводка</h3>'+sum+'</div><div class="box"><h3>Виды конструкций</h3><div class="groups" id="groups"></div><div class="groups-actions"><button type="button" id="all">Показать все</button><button type="button" id="none">Скрыть все</button></div></div>'+
   '<div class="box"><h3>Фильтр</h3>'+((d.works||[]).length>1?'<label class="f">Вид работ<select id="work"><option value="all">Все виды работ вместе</option>'+d.works.map(function(w){return'<option value="'+esc(w.id)+'" title="'+esc(w.label)+'">'+esc(workShort(w.label))+' · '+w.count+'</option>'}).join("")+'</select></label>':'')+((d.elements||[]).some(function(c){return c.preliminary})?'<label class="f" title="Предварительно — экземпляры, определённые по чертежам не полностью; показаны бледно">Достоверность<select id="conf"><option value="all">Все</option><option value="sure">Определены полностью</option><option value="prelim">Только предварительные</option></select></label>':'')+
   (new Set((d.elements||[]).map(function(c){return c.source_section||""})).size>1?'<div class="f">Разделы чертежей<div class="groups" id="sections"></div></div>':'')+'<label class="f">Статус<select id="status"><option value="all">Все</option><option value="mounted">Смонтированы</option><option value="partial">Частично</option><option value="planned">Не смонтированы</option></select></label>'+
   '<div class="row2"><label class="f">Отметка от, мм<input id="lmin" type="number" inputmode="numeric"></label><label class="f">до, мм<input id="lmax" type="number" inputmode="numeric"></label></div><div class="empty">На экране: <b id="cnt"></b></div></div>'+
   '<div class="box"><h3>Элементы</h3><input id="q" type="search" placeholder="Марка, наименование, ось" autocomplete="off"><div class="empty" id="found"></div><div class="list" id="list"></div></div>'+
   '</aside></div></main>';
  return'<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>'+inline(HEAD)+'</script>'+
   '<title>'+esc((d.object.name||"Объект")+" — монтажная схема")+'</title><style>'+libs.css+'\n'+PAGE_CSS+'</style></head><body>'+body+
   (libs.packed?'<script type="application/octet-stream" id="ir-pack">'+libs.packed+'</script><script>('+inline(UNPACK.toString())+')()</script></body></html>':
   '<script type="application/json" id="ir-scheme-data">'+json(Object.assign({},d,{shots:undefined}))+'</script>'+
   '<script>window.irSchemeSections='+inline(JSON.stringify(libs.sections||[]))+';window.irSchemeFasteners='+inline(JSON.stringify(libs.fasteners||[]))+';window.irSchemeJointKb='+inline(JSON.stringify(libs.jointKb||{families:[],groups:[]}))+';</script><script>'+inline(libs.three)+'</script><script>'+inline(libs.orbit)+'</script><script>'+inline(libs.types)+'</script>'+(libs.joints?'<script>'+inline(libs.joints)+'</script>':'')+(libs.card?'<script>'+inline(libs.card)+'</script>':'')+'<script>'+inline(libs.view)+'</script>'+
   '<script>try{('+inline(viewer.toString())+')()}catch(e){window.__irFail(e&&e.message||e)}</script></body></html>')
 }
 // The data, the tables and the scripts of the 3D packed (gzip, base64) — the file is about three times lighter (5,3 MB of
 // a frame of 1600 elements were 1,9 MB; the engineer, 27.10.2026 «монтажные схемы выгруженные слишком много весят»).
 // The pictures and the list of elements stay plain: they are what a viewer without scripts shows.
 function payload(d,libs){
  return JSON.stringify({data:Object.assign({},d,{shots:undefined}),sections:libs.sections||[],fasteners:libs.fasteners||[],jointKb:libs.jointKb||{families:[],groups:[]},
   scripts:[libs.three,libs.orbit,libs.types,libs.joints||"",libs.card||"",libs.view,"try{("+viewer.toString()+")()}catch(e){window.__irFail(e&&e.message||e)}"]})
 }
 async function gzip64(text){
  if(!window.CompressionStream)return"";
  var buf=new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer()),out="";
  for(var i=0;i<buf.length;i+=32768)out+=String.fromCharCode.apply(null,buf.subarray(i,i+32768));
  return btoa(out)
 }
 // In the page: unpacked and run in order (the 3D module after three.js), the data for the viewer in window.__irSchemeData.
 function UNPACK(){
  var W=window,el=document.getElementById("ir-pack");
  if(!W.DecompressionStream||!W.Response||!W.Blob){W.__irFail("Этот браузер не открывает 3D-схему: откройте файл в Chrome, Edge, Яндекс Браузере, Firefox или Safari (2023 года и новее).");return}
  var b=atob(el.textContent),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);
  new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).text().then(function(t){
   var P=JSON.parse(t);W.irSchemeSections=P.sections;W.irSchemeFasteners=P.fasteners;W.irSchemeJointKb=P.jointKb;W.__irSchemeData=P.data;
   P.scripts.forEach(function(code){if(!code)return;var e=document.createElement("script");e.textContent=code;document.body.appendChild(e)})
  }).catch(function(e){W.__irFail("3D-схема не распакована: "+(e&&e.message||e))})
 }

 async function save(d){
  var company=await window.irProject.company.get().catch(function(){return{}});
  d.company={name:String(company&&company.name||""),logo:await logoOf(company)};
  d.date=new Date().toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
  var libs={css:threeCss()};
  try{d.shots=window.irThreeSchemeView&&window.irThreeSchemeView.snapshots?window.irThreeSchemeView.snapshots():[]}catch(_e){d.shots=[]}
  var r=await Promise.all([text(scriptUrl("vendor/three/three.min.js")),text(scriptUrl("vendor/three/OrbitControls.js")),text(scriptUrl("ai-structure-types.js")),text(scriptUrl("scheme-three-view.js")),text(scriptUrl("ai-joint-catalog.js")).catch(function(){return""}),text(scriptUrl("scheme-element-card.js")).catch(function(){return""})]);
  // (the lines of comments of the program's scripts left out — a third of the 3D module: «уменьши размер схемы выгружаемой»,
  // the engineer, 03.11.2026; the code itself unchanged)
  var bare=function(t){return String(t||"").replace(/^[ \t]*\/\/.*(?:\r?\n|$)/gm,"")};
  libs.three=r[0];libs.orbit=r[1];libs.types=bare(r[2]);libs.view=bare(r[3]);libs.joints=bare(r[4]);libs.card=bare(r[5]);
  libs.sections=window.irThreeSchemeView&&window.irThreeSchemeView.sectionRows?await window.irThreeSchemeView.sectionRows().catch(function(){return[]}):[];
  libs.fasteners=window.irThreeSchemeView&&window.irThreeSchemeView.fastenerRows?await window.irThreeSchemeView.fastenerRows().catch(function(){return[]}):[];
  // The catalog of joints: the node card of the exported scheme names the type of the node as the program does.
  libs.jointKb=window.irThreeSchemeView&&window.irThreeSchemeView.jointKbRows?await window.irThreeSchemeView.jointKbRows().catch(function(){return null}):null;
  try{libs.packed=await gzip64(payload(d,libs))}catch(_e){libs.packed=""}
  var html=page(d,libs);
  return window.irProject.reportExport.html(html,safeFile((d.object.name||"Объект")+" — монтажная схема — "+d.title)+".html")
 }
 window.irSchemeHtmlExport={save:save,page:page,viewer:viewer,payload:payload,gzip64:gzip64,unpack:UNPACK};
})();
