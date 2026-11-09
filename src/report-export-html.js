"use strict";
/*
 * The daily report saved as HTML (the «HTML» button of the report's page) in the look of the program (the engineer,
 * 09.11.2026 «ежедневный отчет который выгружается тоже дизайн подгони под программу»): the card of the report as the
 * program shows it — its own styles (ir-styles.css, only the rules the card uses), fonts, colours, the headers of the blocks,
 * the icons of weather, people, equipment, photo — under a menu bar as the object's report has: the logo of the company,
 * the name of the object, «Ежедневный отчёт №… за …», the dark theme an icon in the bar (the same dark colours as the object's
 * report: irObjectHtmlExport.theme), photos opened large by a click. Read-only: no buttons of editing, no links into the program.
 * Loaded with the object's report (index.html, data-lazy="export"), after src/object-export-html.js.
 */
(()=>{
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const dataUrl=v=>/^data:image\//i.test(String(v||""));
 const icon=path=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
 const MOON=icon('<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>');
 const SUN=icon('<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>');
 const CALENDAR=icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>');
 const THEME_KEY="ir-project.object-export-theme";
 // The styles of the export page itself: the bar over the report (as the bar of the object's report), the page as wide as
 // the object's report, the card as in the program; a phone — one column; print — without the bar.
 const PAGE_CSS=[
  "*{box-sizing:border-box}",
  "html,body{min-height:100%}body.ir-report-export{margin:0!important;padding:0!important;min-width:0!important;background:#eef3f8!important}",
  "body.ir-report-export #app{width:100%!important;max-width:1100px!important;min-width:0!important;margin:0 auto!important;padding:18px 20px 30px!important;background:transparent!important}",
  "body.ir-report-export .report-view-page{padding:0!important;margin:0!important}",
  "body.ir-report-export .report-view-card{border-color:#dae5ee;border-radius:13px;box-shadow:0 5px 18px rgba(24,62,89,.055)}",
  "body.ir-report-export .rv-photo{cursor:zoom-in}",
  ".ir-rx-top{position:sticky;top:0;z-index:95;display:flex;align-items:center;gap:14px;width:100%;min-height:58px;margin:0;padding:9px 18px;background:rgba(255,255,255,.98);border-bottom:1px solid #dce6ee;box-shadow:0 4px 16px rgba(29,60,82,.075);font-family:Inter,'Segoe UI',Arial,sans-serif}",
  ".ir-rx-top-inner{display:flex;align-items:center;gap:14px;width:100%;max-width:1060px;margin:0 auto;min-width:0}",
  ".ir-rx-logo{display:block;flex:none;max-height:34px;max-width:140px;object-fit:contain}",
  ".ir-rx-name{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0}",
  ".ir-rx-name b{color:#183b56;font:800 13px/1.3 Inter,'Segoe UI',Arial,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".ir-rx-name i{font-style:normal}.ir-rx-name span{color:#6b8399;font:600 11px/1.3 Inter,'Segoe UI',Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".ir-rx-date{display:inline-flex;flex:none;align-items:center;gap:7px;padding:7px 14px;border-radius:999px;background:#e3f0fb;border:1px solid #b9d7f0;color:#145f97;font:800 13px/1.3 Inter,'Segoe UI',Arial,sans-serif;white-space:nowrap}",
  ".ir-rx-date svg{width:16px;height:16px}",
  ".ir-rx-theme{flex:none;display:grid;place-items:center;width:38px;height:38px;margin:0;padding:0;border:1px solid #d3dfe8;border-radius:10px;background:#fff;color:#24435c;cursor:pointer;box-shadow:none}",
  ".ir-rx-theme svg{width:20px;height:20px}.ir-rx-theme:hover{background:#eef4f9}.ir-rx-theme:focus-visible{outline:2px solid #2b7cc0;outline-offset:2px}",
  ".ir-rx-lang{font:800 12px/1 Inter,'Segoe UI',Arial,sans-serif;width:auto;min-width:42px;padding:0 8px}",
  ".ir-rx-foot{max-width:1100px;margin:0 auto;padding:0 20px 24px;color:#81909c;font:400 11px/1.4 Inter,'Segoe UI',Arial,sans-serif;text-align:right}",
  "html.ir-dark,html.ir-dark body,html.ir-dark body.ir-report-export{background:#111417!important}html.ir-dark{color-scheme:dark}html.ir-dark #app img{opacity:.92}",
  "html.ir-dark .ir-rx-top{background:rgba(22,27,33,.98);border-bottom-color:#313131;box-shadow:none}html.ir-dark .ir-rx-theme{background:#22282f;border-color:#3a434d;color:#e7edf3}",
  "html.ir-dark .ir-rx-name b{color:#e7edf3}html.ir-dark .ir-rx-name span,html.ir-dark .ir-rx-foot{color:#9aabb9}html.ir-dark .ir-rx-date{background:#163b5c;border-color:#2f6c9f;color:#d4ebff}",
  "@media(max-width:720px){body.ir-report-export #app{padding:10px 8px 20px!important}body.ir-report-export .report-view-card{padding:12px!important}.ir-rx-top{padding:7px 10px;min-height:0}.ir-rx-top-inner{gap:9px;flex-wrap:wrap}.ir-rx-logo{max-height:26px;max-width:90px}.ir-rx-name{flex-basis:calc(100% - 140px)}.ir-rx-date{order:3;padding:5px 11px;font-size:12px}.ir-rx-theme{width:34px;height:34px}.ir-rx-lang{margin-left:auto}body.ir-report-export .rv-summary{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}body.ir-report-export .rv-summary>div{min-height:0!important;padding:10px!important;gap:9px!important}body.ir-report-export .rv-summary-icon{flex-basis:36px!important;width:36px!important;height:36px!important}body.ir-report-export .rv-summary-icon svg{width:22px!important;height:22px!important}body.ir-report-export .rv-table-wrap{-webkit-overflow-scrolling:touch}}",
  "@media print{@page{size:A4;margin:8mm 0}.ir-rx-top,.ir-rx-theme,.rv-lightbox{display:none!important}html.ir-dark,html.ir-dark body{background:#fff!important}body.ir-report-export{background:#fff!important}body.ir-report-export #app{max-width:none!important;padding:0 8mm!important}body.ir-report-export .report-view-card{border:0;box-shadow:none;padding:0!important}.rv-photo{break-inside:avoid}}"
 ].join("\n");

 // The card as the program shows it, without what does something in the program.
 function cleanCard(live){
  const card=live.cloneNode(true);
  card.removeAttribute("id");card.id="rvCard";
  card.querySelectorAll("script,iframe,object,embed,video,audio,input,textarea,select,dialog,form,[contenteditable],.report-view-actions").forEach(el=>el.remove());
  // (the «Карточка → Открыть» column of the additional works leads into the program — not in the file)
  card.querySelectorAll("table").forEach(table=>{
   if(!table.querySelector(".rv-extra-open"))return;
   const col=[...(table.querySelector("thead tr")?.children||[])].findIndex(th=>/Карточка/i.test(th.textContent||""));
   if(col<0){table.querySelectorAll(".rv-extra-open").forEach(a=>a.remove());return}
   table.querySelectorAll("tr").forEach(tr=>tr.children[col]?.remove())
  });
  card.querySelectorAll("a").forEach(a=>{const s=document.createElement("span");s.className=a.className;s.innerHTML=a.innerHTML;a.replaceWith(s)});
  // (photos open large by a click in the file too; other buttons — only their words)
  card.querySelectorAll("button").forEach(b=>{if(b.classList.contains("rv-photo")){b.removeAttribute("data-photo-index");return}
   if(b.closest(".rv-act")){b.remove();return}const s=document.createElement("span");s.className=b.className;s.innerHTML=b.innerHTML;b.replaceWith(s)});
  card.querySelectorAll("*").forEach(el=>{for(const att of [...el.attributes])if(/^on/i.test(att.name)||att.name==="tabindex"||/^data-(?:report-act|photo)/.test(att.name))el.removeAttribute(att.name)});
  card.querySelectorAll("img").forEach(img=>{if(!dataUrl(img.getAttribute("src")))img.remove()});
  return card
 }
 async function programStyles(){
  const link=document.querySelector('link[href*="ir-styles.css"]');
  const href=link?.getAttribute("href")||"./ir-styles.css";
  const res=await fetch(href,{cache:"no-store"});
  if(!res.ok)throw Error("Не удалось загрузить оформление отчёта.");
  return res.text()
 }
 async function companyLogo(){
  try{
   const profile=await irProject.company?.get?.();const path=String(profile?.logo||"");
   if(!path)return{logo:"",name:String(profile?.name||"")};
   const src=dataUrl(path)?path:await irProject.images.read(path).catch(()=>"");
   return{logo:dataUrl(src)?src:"",name:String(profile?.name||"")}
  }catch(_e){return{logo:"",name:""}}
 }
 // The page of the file. o: {card, object, no, date (ДД.ММ.ГГГГ), fileName, company:{logo,name}, css}
 const safe=v=>JSON.stringify(v).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
 function build(o){
  const X=window.irObjectHtmlExport||{},nonce=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const object=o.object||{},objectName=String(object.name||object.short_name||"Объект"),shortName=String(object.short_name||object.name||"Объект").trim();
  const title="Ежедневный отчёт №"+o.no+" за "+o.date+"г., "+shortName;
  const company=o.company||{};
  const bar='<header class="ir-rx-top"><div class="ir-rx-top-inner">'+(company.logo?'<img class="ir-rx-logo" src="'+esc(company.logo)+'" alt="Логотип">':"")+
   '<div class="ir-rx-name"><b>'+esc(objectName)+'</b><span>'+(company.name?'<i>'+esc(company.name)+'</i> · ':"")+'<i>Ежедневный отчёт №'+esc(o.no)+'</i></span></div>'+
   '<span class="ir-rx-date">'+CALENDAR+'Отчёт за '+esc(o.date)+'г.</span>'+
   (o.kk?'<button type="button" class="ir-rx-theme ir-rx-lang" id="ir-export-lang" title="Қазақша" aria-label="Қазақша" aria-pressed="false" lang="kk">ҚАЗ</button>':"")+
   '<button type="button" class="ir-rx-theme" id="ir-export-theme" title="Тёмная тема" aria-label="Тёмная тема" aria-pressed="false">'+MOON+'</button></div></header>';
  const generated=new Date().toLocaleString("ru-RU");
  const body=bar+'<main id="app"><div class="report-view-page">'+o.card.outerHTML+'</div></main><div class="ir-rx-foot"><span>Выгружено из IR Project</span> <span>'+esc(generated)+'</span> · <span>Только для просмотра</span></div>'+
   '<div class="rv-lightbox" id="rvLightbox" hidden><button type="button" id="rvLightboxClose" aria-label="Закрыть">×</button><img id="rvLightboxImg" alt="Фото отчёта"></div>';
  const theme=typeof X.theme==="function"?'('+X.theme.toString()+')()':'{dark:function(){},light:function(){}}';
  const scripts='<script nonce="'+nonce+'">(function(){var b=document.getElementById("ir-export-theme"),k='+JSON.stringify(THEME_KEY)+',moon='+JSON.stringify(MOON)+',sun='+JSON.stringify(SUN)+',T='+theme+';'+
   'function paint(d){T.light();if(d)T.dark();document.documentElement.classList.toggle("ir-dark",d);document.documentElement.classList.remove("ir-dark-wait");b.innerHTML=d?sun:moon;b.title=d?"Светлая тема":"Тёмная тема";b.setAttribute("aria-label",b.title);b.setAttribute("aria-pressed",String(d))}'+
   'var d=false;try{d=localStorage.getItem(k)==="dark"}catch(e){}paint(d);'+
   'b.addEventListener("click",function(){d=!document.documentElement.classList.contains("ir-dark");paint(d);try{localStorage.setItem(k,d?"dark":"light")}catch(e){}});'+
   'addEventListener("beforeprint",function(){T.light()});addEventListener("afterprint",function(){if(d)T.dark()})})();'+
   '(function(){var lb=document.getElementById("rvLightbox"),img=document.getElementById("rvLightboxImg");'+
   '[].forEach.call(document.querySelectorAll(".rv-photo img"),function(p){p.parentNode.addEventListener("click",function(){img.src=p.src;lb.hidden=false})});'+
   'document.getElementById("rvLightboxClose").addEventListener("click",function(){lb.hidden=true});lb.addEventListener("click",function(e){if(e.target===lb)lb.hidden=true});'+
   'document.addEventListener("keydown",function(e){if(e.key==="Escape")lb.hidden=true})})();'+
   // (in Kazakh, as the object's report: the button РУС/ҚАЗ beside the theme, the words of the page put into Kazakh and back,
   // the data as entered — src/object-export-kk.js; the choice kept as the object's report keeps it)
   (o.kk?'(function(){var K=('+o.kk.runtime.toString()+')('+safe(o.kk.dict)+','+safe(o.kk.patterns)+'),b=document.getElementById("ir-export-lang"),key="ir-project.object-export-lang",main=K.make(document),on=false;'+
    'function paint(){main.set(on);b.textContent=on?"РУС":"ҚАЗ";b.title=on?"Орысша":"Қазақша";b.setAttribute("lang",on?"ru":"kk");b.setAttribute("aria-label",b.title);b.setAttribute("aria-pressed",String(on))}'+
    'try{on=localStorage.getItem(key)==="kk"}catch(e){}if(on)paint();b.addEventListener("click",function(){on=!on;paint();try{localStorage.setItem(key,on?"kk":"ru")}catch(e){}})})();':"")+
   '</script>';
  const csp="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; img-src data:; font-src data:; script-src &#39;nonce-"+nonce+"&#39;; connect-src &#39;none&#39;; object-src &#39;none&#39;";
  // (a dark report opens dark: hidden on the dark background until the dark colours are made — as the object's report)
  const early='<style>html.ir-dark-wait,html.ir-dark-wait body{background:#111417!important}html.ir-dark-wait body>*{visibility:hidden!important}</style><script nonce="'+nonce+'">try{if(localStorage.getItem('+JSON.stringify(THEME_KEY)+')==="dark"){document.documentElement.classList.add("ir-dark-wait");setTimeout(function(){document.documentElement.classList.remove("ir-dark-wait")},4000)}}catch(e){}</script>';
  let css=String(o.css||""),page=PAGE_CSS;
  // (only the rules the card uses: the whole ir-styles.css is ~1 MB)
  try{if(typeof X.slimCss==="function"&&typeof DOMParser==="function"){const doc=new DOMParser().parseFromString('<!doctype html><html><body class="ir-report-export">'+body+'</body></html>',"text/html");[css,page]=X.slimCss([css,page],s=>doc.querySelector(s))}}catch(e){console.warn("Ежедневный отчёт: стили не сжаты",e)}
  return'<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+csp+'"><title>'+esc(title)+'</title>'+early+
   '<style>'+css+'</style><style>'+page+'</style></head><body class="ir-report-export">'+body+scripts+'</body></html>'
 }
 async function save(o){
  const live=o.card;if(!live)throw Error("Нет отчёта на странице.");
  const [css,company]=await Promise.all([programStyles(),companyLogo()]);
  const kk=window.irReportKk&&typeof window.irReportKk.runtime==="function"?window.irReportKk:null;
  const html=build({...o,card:cleanCard(live),css,company,kk});
  const result=await irProject.reportExport.html(html,o.fileName);
  if(result&&typeof window.irProjectNotice==="function")window.irProjectNotice("Ежедневный отчёт сохранён в HTML. Файл только для просмотра.","success");
  return result
 }
 window.irDailyReportHtml={save,build,cleanCard,PAGE_CSS};
})();
