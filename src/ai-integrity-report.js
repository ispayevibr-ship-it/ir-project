"use strict";
/* Read-only cross-module integrity dashboard; not engineering certification.
 * It does not run AI, mutate SQLite, open files, or mark any item as approved.
 */
function createAiIntegrity({database,documents,pdfIndex,revisions,review,workflow,proposals,
 quantities,materials,connections,comparisons,assemblies,attachments,coverage=null,reference=null,
 clock=()=>new Date().toISOString()}={}){
 if(!database||!documents||!pdfIndex||!revisions||!review||!workflow||!proposals||
  !quantities||!materials||!connections||!comparisons||!assemblies||!attachments)
  throw Error("Для общего контроля IR Project AI необходимы все установленные модули");
 const oid=value=>{
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<1||!database.getObject(n))throw Error("Объект не найден");
  return n
 };
 function report(id){
  const objectId=oid(id),issues=[],metrics={},stageStats=[];
  const sample=(items,format)=>items.slice(0,12).map(format);
  const note=(severity,code,title,description,tab,count=1,examples=[])=>{
   const n=Number(count)||0;
   if(n>0)issues.push({severity,code,title,description,tab,count:n,examples:examples.slice(0,12)})
  };
  const safe=(name,fn,otherwise)=>{
   try{return fn()}
   catch(error){
    note("error","integration_"+name,"Ошибка чтения модуля «"+name+"»",
     String(error?.message||error).slice(0,300),"integrity",1);
    return otherwise
   }
  };
  const docs=safe("documents",()=>documents.list(objectId),[]);
  const documentMap=new Map(docs.map(x=>[x.id,x]));
  metrics.documents=docs.length;
  const missing=docs.filter(x=>!x.exists);
  note("error","missing_pdfs","Недоступны исходные документы",
   "Невозможно подтвердить записи, связанные с отсутствующими PDF.","documents",missing.length,
   sample(missing,x=>x.name||"Документ № "+x.id));
  const corrupt=safe("source_hash",()=>typeof documents.verify!=="function"?[]:
   docs.filter(x=>x.exists&&!documents.verify(objectId,x.id)),[]);
  note("error","modified_originals","Оригинальные файлы отличаются от сохранённого SHA-256",
   "Физический файл изменён или повреждён. Инженерские подтверждения с этим источником недействительны.","documents",
   corrupt.length,sample(corrupt,x=>x.name||"Документ № "+x.id));
  const indexes=safe("pdf_index",()=>pdfIndex.list(objectId),[]);
  metrics.indexedSheets=indexes.reduce((sum,x)=>sum+(x.totalPages||0),0);
  const oldIndex=indexes.filter(x=>{
   const d=documentMap.get(x.documentId);
   return !d||!d.exists||d.sha256!==x.sourceSha256
  });
  note("warning","outdated_pdf_indexes","Индексы не соответствуют оригинальным PDF",
   "Повторно проиндексируйте изменённые листы. Старые индексы не считаются подтверждением содержимого.","documents",
   oldIndex.length,sample(oldIndex,x=>x.sourceName||"Индекс № "+x.id));
  const sets=safe("revisions",()=>revisions.list(objectId),[]);
  metrics.drawingSets=sets.length;
  const activeKinds=["КМ","КМД"].filter(kind=>sets.some(x=>x.kind===kind&&x.status==="active"));
  const missingKind=["КМ","КМД"].filter(kind=>!activeKinds.includes(kind)&&docs.some(d=>d.kind===kind));
  note("warning","uncontrolled_revisions","Для части чертежей не назначен действующий комплект",
   "Устаревший PDF может оставаться доступным. Подтвердите полный состав актуальных листов.","revisions",
   missingKind.length,missingKind);
  const activeSets=sets.filter(x=>x.status==="active");
  const badSetPages=activeSets.flatMap(x=>x.sheets.filter(sheet=>!sheet.valid)
   .map(sheet=>x.kind+" · "+sheet.sheetCode));
  note("error","invalid_active_pages","В действующих комплектах недоступные листы",
   "Проверьте исходные PDF и состав действующего комплекта. Не следует использовать ссылки на исчезнувшие листы.","revisions",
   badSetPages.length,badSetPages);
  const revisionImpact=safe("revision_impact",()=>revisions.impact(objectId),{outdated:0,uncontrolled:0,records:[]});
  metrics.outdatedEvidence=revisionImpact.outdated||0;
  const impacted=(revisionImpact.records||[]).filter(x=>x.outdated);
  note("error","superseded_evidence","Позиции с устаревшими источниками КМ/КМД",
   "История сохраняется, но решение по заменённому листу больше нельзя считать актуальным.","revisions",
   impacted.length,sample(impacted,x=>x.title+" № "+x.id+" · "+x.recordTitle));
  const queue=safe("workflow",()=>workflow.summary(objectId),{total:0,byStatus:{},modelState:"missing"});
  metrics.queueTasks=queue.total||0;
  const queueStatus=queue.byStatus||{};
  const failed=(queueStatus.failed||0)+(queueStatus.interrupted||0);
  note("warning","queue_failed","Незавершённые задания распознавания",
   "Повторите только нужные задания после проверки исходного PDF и состояния модели.","workflow",failed);
  const mismatchedTasks=safe("workflow_links",()=>workflow.list(objectId)
   .filter(x=>x.status==="failed"&&x.lastError?.includes("не принадлежит исходному PDF")),[]);
  note("error","workflow_wrong_analysis","Результат ИИ связан с другим листом или PDF",
   "Такая очередь не считается подтверждённой. Сверьте источник и создайте новое задание для верного листа.","workflow",
   mismatchedTasks.length,sample(mismatchedTasks,x=>"Задание № "+x.id+" · лист "+x.page));
  note("warning","model_required","Очередь ожидает локальную модель",
   "Обработка не выполняется, пока проверенный офлайн-движок не готов.","workflow",queueStatus.needs_model||0);
  note("warning","queued_sheets","Листы ожидают распознавания",
   "Запуск выполняется вручную, результаты остаются предложениями для инженера.","workflow",queueStatus.queued||0);
  const reviewItems=safe("review",()=>review.list(objectId),[]);
  metrics.analysisResults=reviewItems.length;
  const uncheckedAnalyses=reviewItems.filter(x=>x.status==="requires_review");
  note("warning","raw_ai_unreviewed","Общие результаты ИИ требуют проверки",
   "Подтверждённое распознавание текста не является утверждённой ведомостью марок.","checks",
   uncheckedAnalyses.length,sample(uncheckedAnalyses,x=>x.sourceName+" · лист "+(x.page||"—")));
  const structured=safe("proposals",()=>proposals.list(objectId),[]);
  metrics.proposals=structured.length;
  const persistedReviews=database.listEntity(objectId,"ai-structured-reviews")
   .filter(x=>x.record_type==="structured_review");
  const proposalKeys=new Set(structured.map(x=>x.analysisId+":"+x.index));
  const seenReviewKeys=new Set(),orphanReviews=[],duplicatedReviews=[];
  for(const entry of persistedReviews){
   const key=entry.data?.analysisId+":"+entry.data?.index;
   if(!proposalKeys.has(key))orphanReviews.push(entry);
   if(seenReviewKeys.has(key))duplicatedReviews.push(entry);
   else seenReviewKeys.add(key)
  }
  const changedReviews=structured.filter(x=>x.reviewId&&!x.reviewValid);
  note("error","orphan_structured_reviews","Инженерские проверки не связаны с предложением ИИ",
   "Записи истории сохранены, но соответствующего исходного предложения сейчас нет.","proposals",
   orphanReviews.length,sample(orphanReviews,x=>"Проверка № "+x.id+" / анализ "+x.data?.analysisId));
  note("error","duplicate_structured_reviews","Несколько решений для одного предложения",
   "Нарушена однозначность связи анализ — номер предложения. Требуется сверка сохранённой истории.","proposals",
   duplicatedReviews.length,sample(duplicatedReviews,x=>"Проверка № "+x.id+" / анализ "+x.data?.analysisId));
  note("warning","changed_proposal_fingerprints","Изменилось содержание подтверждённых предложений",
   "Сохранённое решение не относится к текущей версии предложения и не должно переноситься автоматически.","proposals",
   changedReviews.length,sample(changedReviews,x=>"Анализ № "+x.analysisId+" / позиция "+x.index));
  const pendingClaims=structured.filter(x=>!x.approved&&x.status!=="rejected");
  note("warning","structured_unreviewed","Структурированные предложения без подтверждения",
   "Проверьте цитаты по первоисточнику. Предложения не должны напрямую заполнять производственные ведомости.","proposals",
   pendingClaims.length,sample(pendingClaims,x=>x.type+" · "+(x.values?.mark||"без марки")+
    " · анализ № "+x.analysisId));
  const marks=safe("quantities",()=>quantities.list(objectId),[]);
  metrics.marks=marks.length;
  const approvedMarks=marks.filter(x=>x.status==="confirmed"&&x.sourceValid);
  // Never publish a plausible-looking total if persisted approved records collide.
  const approvedKeys=new Map(),duplicateMarks=[],invalidCounts=[];
  for(const mark of approvedMarks){
   const key=[mark.mark,mark.cipher,mark.secondaryCipher]
    .map(v=>String(v||"").trim().toLocaleUpperCase("ru-RU")).join("\u0001");
   if(approvedKeys.has(key))duplicateMarks.push(mark);
   else approvedKeys.set(key,mark);
   if(!Number.isSafeInteger(mark.quantity)||mark.quantity<=0)invalidCounts.push(mark)
  }
  const sumMarks=approvedMarks.reduce((sum,x)=>sum+x.quantity,0);
  metrics.approvedMarkCopies=duplicateMarks.length||invalidCounts.length||
   !Number.isSafeInteger(sumMarks)?null:sumMarks;
  note("error","duplicate_approved_marks","Дубли подтверждённых отправочных марок",
   "Итог количества скрыт: одинаковые марка и шифры не должны учитываться повторно. Исправьте конфликт записей.","marks",
   duplicateMarks.length,sample(duplicateMarks,x=>x.mark+" · "+x.cipher+" · № "+x.id));
  note("error","invalid_approved_quantities","Некорректное подтверждённое количество",
   "Итог количества скрыт, пока записи с пустым или ошибочным количеством не будут проверены.","marks",
   invalidCounts.length,sample(invalidCounts,x=>x.mark+" · № "+x.id));
  const staleMarks=marks.filter(x=>x.status==="confirmed"&&!x.sourceValid);
  note("error","stale_mark_quantities","Ранее утверждённые количества утратили актуальность",
   "Исключены из текущей сводки. Проверьте количество экземпляров по действующей спецификации КМД.","marks",
   staleMarks.length,sample(staleMarks,x=>x.mark+" · "+x.cipher));
  const pendingMarks=marks.filter(x=>x.status==="requires_review");
  note("warning","mark_review_pending","Количество отправочных марок не подтверждено",
   "Количество упоминаний марки в PDF не заменяет спецификацию.","marks",
   pendingMarks.length,sample(pendingMarks,x=>x.mark+" · "+x.cipher));
  const steel=safe("materials",()=>materials.list(objectId),[]);
  metrics.steelPositions=steel.length;
  const steelStale=steel.filter(x=>x.status==="confirmed"&&!x.counted);
  note("error","steel_unaccounted","Подтверждённые ранее детали не участвуют в текущем тоннаже",
   "Причина может быть в устаревшем листе, непроверенной родительской марке или отсутствии нужного размера/массы.","metal",
   steelStale.length,sample(steelStale,x=>x.position+" / "+x.assemblyMark+": "+x.reason));
  const seenParts=new Map(),duplicateParts=[];
  for(const part of steel.filter(x=>x.counted)){
   const key=part.assemblyId+"\u0001"+String(part.position||"").trim().toLocaleUpperCase("ru-RU");
   if(seenParts.has(key))duplicateParts.push(part);
   else seenParts.set(key,part)
  }
  note("error","duplicate_confirmed_parts","Дубли подтверждённых деталей КМД",
   "Одна позиция детали в пределах отправочной марки не должна повторно увеличивать массу.","metal",
   duplicateParts.length,sample(duplicateParts,x=>x.assemblyMark+" / "+x.position+" · № "+x.id));
  const pendingSteel=steel.filter(x=>x.status==="requires_review");
  note("warning","steel_review_pending","Детали КМД ожидают проверки инженера",
   "Данные не используются в подтверждённой массе.","metal",
   pendingSteel.length,sample(pendingSteel,x=>x.position+" / "+x.assemblyMark));
  const nodes=safe("connections",()=>connections.listNodes(objectId),[]);
  const items=safe("hardware",()=>connections.listComponents(objectId),[]);
  metrics.connections=nodes.length;metrics.hardwareRows=items.length;
  const usedJoints=new Set(),duplicatedJoints=[],usedComponents=new Set(),duplicatedComponents=[];
  for(const joint of nodes.filter(x=>x.counted)){
   const key=joint.scope+"\u0001"+(joint.scope==="erection"?"объект":joint.assemblyId)+
    "\u0001"+String(joint.jointCode||"").trim().toLocaleUpperCase("ru-RU");
   if(usedJoints.has(key))duplicatedJoints.push(joint);else usedJoints.add(key)
  }
  for(const item of items.filter(x=>x.counted)){
   const key=item.jointId+"\u0001"+item.category+"\u0001"+
    String(item.position||"").trim().toLocaleUpperCase("ru-RU");
   if(usedComponents.has(key))duplicatedComponents.push(item);else usedComponents.add(key)
  }
  note("error","duplicate_confirmed_hardware","Дубли физических узлов или компонентов",
   "Повторные позиции могут привести к завышению учёта метизов и сварных швов.","fasteners",
   duplicatedJoints.length+duplicatedComponents.length,[
    ...sample(duplicatedJoints,x=>"Узел "+x.jointCode+" · № "+x.id),
    ...sample(duplicatedComponents,x=>"Позиция "+x.position+" · № "+x.id)]);
  const staleNodes=nodes.filter(x=>x.status==="confirmed"&&!x.counted),
   staleItems=items.filter(x=>x.status==="confirmed"&&!x.counted);
  note("error","invalid_hardware","Подтверждённые метизы, швы или узлы требуют пересмотра",
   "Несоответствие источников или зависимостей исключает запись из действующей сводки.","fasteners",
   staleNodes.length+staleItems.length,[
    ...sample(staleNodes,x=>"Узел "+x.jointCode+": "+x.reason),
    ...sample(staleItems,x=>"Позиция "+x.position+": "+x.reason)].slice(0,12));
  const outdatedParents=[
   ...steel.filter(x=>x.status==="confirmed"&&!x.parentRevisionValid)
     .map(x=>x.assemblyMark+" / деталь "+x.position),
   ...nodes.filter(x=>x.status==="confirmed"&&!x.parentRevisionValid)
     .map(x=>"Узел "+x.jointCode+" / марка № "+x.assemblyId),
   ...items.filter(x=>x.status==="confirmed"&&!x.parentRevisionValid)
     .map(x=>"Крепёж или шов "+x.position+" / узел № "+x.jointId)
  ];
  note("error","outdated_parent_revisions","Зависимые данные подтверждены по прежней редакции",
   "История сохранена, но после изменения марки или узла требуется повторная инженерная проверка.",
   "integrity",outdatedParents.length,outdatedParents.slice(0,12));
  const differences=safe("comparisons",()=>comparisons.list(objectId),[]);
  metrics.comparisons=differences.length;
  const staleComparisons=differences.filter(x=>x.result==="invalid_source");
  note("error","comparison_sources","В сравнении КМ/КМД есть устаревшие источники",
   "Сверку нужно повторить на действующих ревизиях обеих дисциплин.","compare",
   staleComparisons.length,sample(staleComparisons,x=>x.mark+" · "+x.position));
  const corrections=differences.filter(x=>x.approved&&x.disposition==="correction_required");
  note("error","engineering_discrepancies","Расхождения КМ/КМД требуют исправления",
   "Проверенное расхождение не исчезает, пока инженер не согласует новую редакцию.","compare",
   corrections.length,sample(corrections,x=>x.mark+" · "+x.fieldName));
  const approvedDeviations=differences.filter(x=>x.approved&&x.disposition==="accepted_deviation");
  note("warning","accepted_deviations","Есть принятые отклонения КМ/КМД",
   "Принятие отклонения не меняет размеры исходного PDF или геометрию марки.","compare",
   approvedDeviations.length,sample(approvedDeviations,x=>x.mark+" · "+x.fieldName));
  const pendingComparisons=differences.filter(x=>x.status==="requires_review");
  note("warning","comparison_pending","Сопоставление КМ/КМД ожидает решения",
   "Результат численного сравнения не является самостоятельным инженерным утверждением.","compare",
   pendingComparisons.length);
  let confirmedPlacements=0,pendingPlacements=0,verifiedAnchors=0,
   assemblyErrors=0;
  const outdated3d=[];
  const in3d=new Set(database.listEntity(objectId,"ai-assembly-placement")
   .filter(x=>x.record_type==="part_placement").map(x=>Number(x.data?.assemblyId)));
  const inAnchors=new Set(database.listEntity(objectId,"ai-assembly-attachments")
   .filter(x=>x.record_type==="assembly_attachment").map(x=>Number(x.data?.assemblyId)));
  for(const assemblyId of new Set([...in3d,...inAnchors])){
   try{
    const parts=assemblies.list(objectId,assemblyId);
    confirmedPlacements+=parts.filter(x=>x.counted).length;
    pendingPlacements+=parts.filter(x=>!x.counted&&x.status!=="rejected").length;
    for(const part of parts.filter(x=>x.status==="confirmed"&&
     (!x.assemblyRevisionValid||!x.partRevisionValid)))
     outdated3d.push(part.assemblyMark+" / "+part.partPosition+" № "+part.instanceIndex);
    if(inAnchors.has(assemblyId)){
     const anchors=attachments.list(objectId,assemblyId);
     verifiedAnchors+=anchors.filter(x=>x.visible).length;
     pendingPlacements+=anchors.filter(x=>!x.visible&&x.status!=="rejected").length
    }
   }catch(e){
    assemblyErrors++;
    note("error","broken_assembly_"+assemblyId,"Нарушена 3D-связь отправочной марки № "+assemblyId,
     String(e?.message||e).slice(0,250),"assembly")
   }
  }
  note("error","outdated_geometry_revisions","3D-сборка использует прежние редакции марки или деталей",
   "Проверьте размещения по действующим редакциям марки и деталей КМД.",
   "assembly",outdated3d.length,outdated3d.slice(0,12));
  metrics.confirmed3dDetails=confirmedPlacements;
  metrics.confirmed3dAnchors=verifiedAnchors;
  note("warning","unreviewed_3d","3D-размещения и соединения требуют повторной проверки",
   "Неподтверждённая геометрия не должна показываться как рабочая сборка.","assembly",pendingPlacements);
  const evidenceCoverage=coverage?safe("kmd_coverage",()=>coverage.report(objectId),null):null;
  if(evidenceCoverage){
   metrics.kmdReviewedEvidence=evidenceCoverage.metrics.reviewedCandidates;
   metrics.kmdRegisteredDetailInstances=evidenceCoverage.metrics.registeredDetailUnitsInProject;
   metrics.kmdModeledDetailInstances=evidenceCoverage.metrics.modeledUnitsPerUniqueMarks;
   for(const finding of evidenceCoverage.issues)note(
    finding.severity,finding.code,finding.title,
    "Сопоставлены только подтверждённые предложения и внесённые инженерные позиции. Это не сертификат полноты КМД.",
    finding.tab,finding.count,finding.examples);
  }
  const referenceReport=reference?safe("kmd_reference",()=>reference.compare(objectId),null):null;
  if(referenceReport){
   metrics.referencePositions=referenceReport.activeReferencePositions;
   metrics.referenceSheetsReviewed=referenceReport.reviewedSheets;
   metrics.referenceSheetsTotal=referenceReport.sheetCount;
   const missingSheets=referenceReport.sheets.filter(x=>!x.checked);
   note("warning","kmd_reference_sheets_pending","Листы КМД без полной инженерной сверки",
    "Эталон ещё не охватывает весь действующий комплект КМД; подтверждение полноты запрещено.",
    "reference",missingSheets.length,sample(missingSheets,x=>x.sheetCode+" · лист "+x.page));
   const groups=new Map();
   for(const m of referenceReport.mismatches){
    if(!groups.has(m.code))groups.set(m.code,[]);
    groups.get(m.code).push(m)
   }
   for(const [code,group] of groups){
    const extra=code==="unlisted_position";
    const severity=extra?"warning":"error";
    note(severity,"kmd_reference_"+code,
     extra?"Позиции внесены в ведомость, но отсутствуют в эталоне":
      "Расхождения утверждённого эталона КМД с инженерными ведомостями",
     "Не изменяйте ведомости автоматически: сверьте каждую позицию с оригинальным листом КМД.",
     "reference",group.length,sample(group,x=>x.mark+" / "+x.position+
       " · "+x.label+" (эталон "+(x.expected??"—")+", запись "+(x.actual??"—")+")"))
   }
  }
  const bySeverity={error:issues.filter(x=>x.severity==="error").reduce((s,x)=>s+x.count,0),
   warning:issues.filter(x=>x.severity==="warning").reduce((s,x)=>s+x.count,0)};
  stageStats.push({label:"Исходники",tab:"documents",count:metrics.documents},
   {label:"Листы PDF",tab:"documents",count:metrics.indexedSheets},
   {label:"Анализы ИИ",tab:"checks",count:metrics.analysisResults},
   {label:"Предложения",tab:"proposals",count:metrics.proposals},
   {label:"Марки КМД",tab:"marks",count:metrics.marks},
   {label:"Детали",tab:"metal",count:metrics.steelPositions},
   {label:"Узлы и крепёж",tab:"fasteners",count:metrics.connections+metrics.hardwareRows},
   {label:"3D-детали",tab:"assembly",count:metrics.confirmed3dDetails},
   {label:"Эталон КМД",tab:"reference",count:metrics.referencePositions||0});
  return{objectId,generatedAt:clock(),metrics,stages:stageStats,issues,bySeverity,
   coverage:evidenceCoverage,reference:referenceReport,
   checksWithFindings:issues.length,releaseCertified:false,
   explanation:"Диагностика проверяет связи, актуальность PDF, статусы и полноту данных. Она не доказывает корректность OCR, чертежей, расчётов или 3D; итоговая приёмка выполняется инженером на реальных КМД."}
 }
 return{report}
}
module.exports={createAiIntegrity};
