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
  const issues=x.issues||[],coverage=x.coverage||null;
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
  const number=value=>Number.isFinite(value)?Number(value).toLocaleString("ru-RU"):"—";
  const summary=coverage?.metrics||{};
  const coverageHtml=!coverage?"":'<section class="ir-ai-coverage">'+
   '<div class="ir-ai-integrity-actions"><div><b>Сверка ведомостей и 3D по маркам</b>'+
   '<small>Подсчитываются только действующие подтверждённые инженерные записи</small></div></div>'+
   '<div class="ir-ai-quantity-warning">Сопоставление не устанавливает наличие всех позиций в исходной спецификации КМД. '+
   '3D-детали считаются на один экземпляр каждой марки, физический крепёж — по зарегистрированным узлам объекта.</div>'+
   (coverage.ambiguousTotals?'<div class="ir-ai-quantity-warning">Итоги не показаны: обнаружены повторные подтверждённые марки, детали или физические соединения. Проверьте замечания ниже.</div>':"")+
   '<div class="ir-ai-coverage-metrics>'+
   '<div><small>Экземпляров отправочных марок</small><strong>'+number(summary.confirmedMarkCopies)+'</strong></div>'+
   '<div><small>Деталей в объекте по внесённым позициям</small><strong>'+number(summary.registeredDetailUnitsInProject)+'</strong></div>'+
   '<div><small>3D-деталей на уникальные марки</small><strong>'+number(summary.modeledUnitsPerUniqueMarks)+' / '+number(summary.expectedModelUnitsPerUniqueMarks)+'</strong></div>'+
   '<div><small>Метизов по подтверждённым узлам</small><strong>'+number(summary.registeredFastenerPieces)+'</strong></div>'+
   '</div>'+
   '<div class="ir-ai-coverage-rows">'+(coverage.marks||[]).map(row=>
    '<details class="ir-ai-coverage-mark"><summary>'+
     '<span><b>'+esc(row.mark)+'</b> '+esc(row.cipher||"")+(row.secondaryCipher?' · '+esc(row.secondaryCipher):"")+'</span>'+
     '<small>'+number(row.copies)+' шт. · деталей 3D '+number(row.modeledUnitsPerMark)+' / '+number(row.detailUnitsPerMark)+'</small>'+
    '</summary><div class="ir-ai-coverage-detail">'+
     '<span>Деталей по подтверждённым позициям на одну марку: <b>'+number(row.detailUnitsPerMark)+'</b></span>'+
     '<span>Деталей по этим позициям на объект: <b>'+number(row.declaredDetailUnitsInProject)+'</b></span>'+
     '<span>Позиции деталей КМД: <b>'+number(row.confirmedDetailPositions)+
      '</b> подтверждено · <b>'+number(row.pendingDetailPositions)+'</b> требуют проверки</span>'+
     '<span>Не размещено в начатой 3D-сборке: <b>'+(row.modelStarted===null?
      "Индекс 3D недоступен":row.modelStarted?number(row.pendingModelUnits):
      "3D ещё не начинали")+'</b></span>'+
     '<span>Узлы: <b>'+number(row.confirmedJointPositions)+'</b> позиций, заводских '+number(row.factoryJointInstances)+
      ', монтажных '+number(row.erectionJointInstances)+'</span>'+
     '<span>Метизы: <b>'+number(row.fastenerPieces)+'</b> шт. · сварка: <b>'+number(row.weldLengthM)+'</b> м</span>'+
     '<span>3D-аннотации соединений: <b>'+number(row.confirmed3dAnnotations)+'</b> (не количество метизов)</span>'+
     '<span>Полная спецификация: <b>не удостоверена</b></span>'+
    '</div></details>').join("")+
   (!(coverage.marks||[]).length?'<div class="ir-ai-doc-empty">Нет подтверждённых отправочных марок для сверки.</div>':"")+
   '</div></section>';
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
     '</span><b>'+(k.count==null?"—":number(k.count))+'</b></button>').join("")+'</div>'+
   coverageHtml+
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
