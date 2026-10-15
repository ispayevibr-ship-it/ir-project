"use strict";
/* Read-only IR Project AI cross-module consistency check. */
window.irAiIntegrityPage={
 render(host,{report=null,onNavigate=null,onRefresh=null}={}){
  if(!host)return;
  if(!report){
   host.innerHTML='<section class="ir-ai-integrity"><div class="ir-ai-doc-empty">'+
    '<b>Диагностика недоступна</b><p>Не удалось получить данные из модулей IR Project AI. '+
    'Это не означает отсутствия ошибок. Повторите загрузку или проверьте сообщения программы.</p>'+
    '<button type="button" data-integrity-retry>Повторить</button></div></section>';
   host.querySelector("[data-integrity-retry]").onclick=()=>void onRefresh?.();
   return
  }
  const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const x=report||{issues:[],stages:[],bySeverity:{error:0,warning:0},releaseCertified:false};
  const issues=x.issues||[],severities={error:"Требует внимания",warning:"Нужно проверить"};
  const issuesHtml=items=>items.map((issue,i)=>
   '<article class="ir-ai-integrity-issue '+esc(issue.severity)+'" data-issue-severity="'+esc(issue.severity)+'">'+
    '<div class="ir-ai-integrity-heading"><div><span>'+
     (issue.severity==="error"?"!":"?")+'</span><b>'+esc(issue.title)+'</b></div>'+
     '<strong>'+esc(issue.count)+' поз.</strong></div>'+
    '<p>'+esc(issue.description)+'</p>'+
    (issue.examples?.length?'<div class="ir-ai-integrity-examples">'+
     issue.examples.map(t=>'<div>'+esc(t)+'</div>').join("")+'</div>':"")+
    '<button type="button" data-integrity-nav="'+esc(issue.tab||"documents")+'">Открыть раздел →</button></article>'
   ).join("");
  host.innerHTML='<section class="ir-ai-integrity">'+
   '<div class="ir-ai-review-heading"><div><h2>Контроль данных IR Project AI</h2>'+
    '<p>Сквозная диагностика исходников, очереди, решений инженера, ведомостей КМД и 3D.</p></div>'+
    '<b>Без изменений базы</b></div>'+
   '<div class="ir-ai-integrity-overview">'+
    '<div><small>Требуют внимания</small><strong>'+Number(x.bySeverity?.error||0)+'</strong></div>'+
    '<div><small>Нужна проверка</small><strong>'+Number(x.bySeverity?.warning||0)+'</strong></div>'+
    '<div><small>Замечаний по группам</small><strong>'+issues.length+'</strong></div>'+
    '<div><small>Последний просмотр</small><strong class="time">'+esc(x.generatedAt?
     new Date(x.generatedAt).toLocaleString("ru-RU"):"Не выполнялся")+'</strong></div></div>'+
   '<div class="ir-ai-quantity-warning">Этот экран показывает технические несоответствия и неполные данные, но не удостоверяет правильность проекта. Даже отсутствие замечаний не означает, что нейросеть правильно прочитала каждую позицию КМД, или что 3D пригодна для изготовления.</div>'+
   '<div class="ir-ai-integrity-actions"><div><b>Сводка по этапам</b><small>Нажмите на раздел, чтобы открыть его</small></div>'+
    '<button type="button" data-integrity-refresh>Обновить диагностику</button></div>'+
   '<div class="ir-ai-integrity-stages">'+(x.stages||[]).map(k=>
    '<button type="button" data-integrity-nav="'+esc(k.tab)+'"><span>'+esc(k.label)+
     '</span><b>'+Number(k.count||0).toLocaleString("ru-RU")+'</b></button>').join("")+'</div>'+
   '<div class="ir-ai-integrity-actions"><div><b>Выявленные вопросы</b><small>Выберите категорию</small></div>'+
    '<select data-integrity-filter aria-label="Фильтр замечаний">'+
     '<option value="all">Все замечания</option><option value="error">Требуют внимания</option>'+
     '<option value="warning">Нужна проверка</option></select></div>'+
   (issues.length?'<div class="ir-ai-integrity-list">'+issuesHtml(issues)+'</div>':
    '<div class="ir-ai-doc-empty"><b>Автоматическая диагностика не выявила замечаний</b>'+
     '<p>Это не заключение о готовности IR Project AI или подтверждение точности КМ/КМД. Продолжайте проверку исходных чертежей, геометрии и спецификаций инженером.</p></div>')+
   '<p class="ir-ai-storage-note">'+esc(x.explanation||"Отчёт не заменяет инженерную экспертизу.")+'</p>'+
   '</section>';
  const root=host.querySelector(".ir-ai-integrity");
  root.querySelector("[data-integrity-refresh]").onclick=()=>void onRefresh?.();
  root.querySelectorAll("[data-integrity-nav]").forEach(b=>b.onclick=()=>onNavigate?.(b.dataset.integrityNav));
  root.querySelector("[data-integrity-filter]").onchange=event=>{
   const current=event.target.value;
   root.querySelectorAll("[data-issue-severity]").forEach(node=>{
    node.hidden=current!=="all"&&node.dataset.issueSeverity!==current
   })
  }
 }
};
