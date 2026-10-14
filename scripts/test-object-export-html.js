"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const hero=fs.readFileSync("src/object-overview-direct-v3.js","utf8");
const runtime=fs.readFileSync("src/ir-runtime.js","utf8");
const html=fs.readFileSync("src/index.html","utf8");
const source=fs.readFileSync("src/object-export-html.js","utf8");
assert(hero.includes("data-hero-export-html"),"export entry available in object header menu");
assert(hero.includes("window.irObjectHtmlExport?.save"),"export action connected");
assert(runtime.includes("data-hero-export-html"),"bundled runtime updated");
assert(html.includes('object-export-html.js?v=17173'),"source loaded after runtime");
assert(source.includes("cloneNode(true)"),"overview snapshot captured");
assert(source.includes("extractOverviewPreviews(copy,keys)"),"overview cards move into corresponding sections");
assert(source.includes('.object-overview-reports > .oor2-card,.object-overview-marks-wrap > .object-overview-marks-card,.object-overview-deliveries-wrap > .ood-deliveries'),"duplicate reports, photos, marks, invoices are removed from overview");
assert(!source.includes('["reports",".object-overview-reports > .oor2-card'),"do not duplicate recent reports as an overview preview");
assert(!source.includes("ir-export-preview-daily"),"obsolete recent report expanders removed");
assert(!source.includes('["photos",".object-overview-reports > .oor2-photo-card"]'),"photos are drawn from the latest 12 actual report images");
assert(!source.includes('["deliveries",".object-overview-deliveries-wrap > .ood-deliveries"]'),"latest invoice widget is not duplicated");
assert(source.includes('["schedule",".object-overview-dashboard > .object-overview-schedule"]'),"schedule widget is relocated");
assert(source.includes("renderDailyReports(rows,images)"),"daily reports use specialized cards");
assert(source.includes('exportMoreCards(cards,"reports")'),"only five report cards initially visible");
assert(source.includes('<details class="ir-export-more ir-export-more-'),"show-more works with native details in offline HTML");
assert(source.includes("renderMarksOverview(markRows,workRows,reportRows)"),"grouped marks overview is generated");
assert(!source.includes('ir-export-mark-radio--mounted" type="radio"'),"work progress has no mounted status toggle");
assert(!source.includes('ir-export-mark-radio--remaining" type="radio"'),"work progress has no remaining status toggle");
assert(source.includes('markProgressPanel(groups,"all")'),"readiness shows all work types");
assert(source.includes('ir-export-status-radio ir-export-status-mounted'),"mounted filter belongs to individual marks");
assert(source.includes('ir-export-status-radio ir-export-status-remaining'),"remaining filter belongs to individual marks");
assert(source.includes('nth-child(-n+5 of .status-done,.status-partial)'),"first five mounted/partial marks appear for mounted filter");
assert(source.includes('nth-child(-n+5 of .status-left,.status-partial)'),"first five remaining/partial marks appear for remaining filter");
assert(source.includes('markProgressPanel(groups,"all")'),"all grouped mark rows are shown by default");
assert(source.includes('return\'<div class="ir-export-mark-rows">\'+groups.map(markProgressRow).join(\"\")'),"all work and code readiness rows are displayed");
assert(source.includes('renderMarkSection(rows,support.workTypes||[],support.reports||[],images)'),"marks have grouped read-only cards");
assert(source.includes('class="ir-export-work-filter"'),"mark cards immediately follow readiness overview without closed outer wrapper");
assert(source.includes("renderMarkCards(rows,workRows,reportRows)"),"mark-by-mark list uses the new designed card renderer");
assert(source.includes("markDetailData(markRows,workRows,reportRows)"),"mark details match source data");
assert(!source.includes("const full=rows.length?'<details class=\"ir-export-mark-raw\""),"no surrounding collapsed mark register");
assert(source.includes("workChoices.map((w,i)=>"),"filter covers each real work type");
assert(source.includes("dynamicTag+panels"),"generated CSS selectors link work choices to visible cards");
assert(source.includes("const full=renderMarkCards(rows,workRows,reportRows)"),"five marks appear directly under work progress");
assert(source.includes("for(const [wid,work] of catalog)"),"work types with zero marks remain in readiness overview");
assert(source.includes('class="ir-export-mark-card status-'),"individual marks have styled cards");
assert(source.includes('class="ir-export-daily-chevron" aria-hidden="true"><svg'),"mark cards reuse daily report SVG chevrons");
assert(source.includes("ir-export-mark-card>details[open] .ir-export-daily-chevron svg{transform:rotate(180deg)}"),"mark card chevron turns on expansion");
assert(source.includes("ir-export-mark-cardlist"),"mark cards can be CSS-filtered by status");
assert(source.includes("ir-export-mark-show-check"),"users can expand the full selected list");
assert(source.includes("ir-export-mark-card:nth-child(-n+5)"),"only five cards shown initially");
assert(source.includes("Показать всю ведомость марок"),"users can reveal full register");
assert(source.includes('ir-export-work-radio-'+""),"per-work offline filter controls are generated");
assert(!source.includes('renderRows(rows,"marks",images)'),"technical ID/Type/mounted/received list is no longer exported for marks");
const detailStart=source.indexOf(" function markDetailData("),detailEnd=source.indexOf(" function renderMarkCards(",detailStart);
assert(detailStart>=0&&detailEnd>detailStart,"mark detail math helper exists");
const detailFn=vm.runInNewContext('(function(){const array=x=>Array.isArray(x)?x:[];const exportNumber=v=>{const n=Number(String(v??0).replace(/\\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};'+source.slice(detailStart,detailEnd)+';return markDetailData})()', {});
const detailRows=detailFn(
 [{id:101,data:{work_type_id:7,mark:"В1",name:"Связь горизонтальная",qty:36,mounted:36,unit:"тн",unit_volume:0.023}},{id:102,data:{work_type_id:7,mark:"В2",qty:4,mounted:0,unit:"тн",total_volume:0.1}}],
 [{id:7,title:"Монтаж металлоконструкций",data:{project_code:"041-2025 КМД"}}],
 [{id:1,data:{items:[{mark_id:101,qty:13}]}}]
);
assert.equal(detailRows.length,2);
const det=detailRows.find(x=>x.mark==="В1");
assert.equal(det.qty,36);
assert.equal(det.done,13,"report facts override cached mounted value");
assert.equal(det.left,23);
assert.equal(det.status,"partial");
assert(Math.abs(det.total-.828)<1e-9,"mark total mass calculated from unit value and qty");
assert.equal(detailRows.find(x=>x.mark==="В2").status,"left");
assert(!source.includes("'<details'+(i===0?' open'"),"first mark card is also collapsed on export");
assert(source.includes("ir-export-mark-showmore"),"show-full register uses accessible checkbox label");


assert(!source.includes('["marks",".object-overview-marks-wrap > .object-overview-marks-card"]'),"old limited marks preview removed");
assert(!source.includes('["marks",".object-overview-reports > .oor-marks-card"]'),"old duplicate marks preview removed");
const groupStart=source.indexOf(" function markProgressGroups(");
const groupEnd=source.indexOf(" function markProgressRow(",groupStart);
assert(groupStart>=0&&groupEnd>groupStart,"pure mark grouping code exists");
const groupCalc=vm.runInNewContext('(function(){const array=x=>Array.isArray(x)?x:[];const exportNumber=v=>{const n=Number(String(v??0).replace(/\\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};'+source.slice(groupStart,groupEnd)+';return markProgressGroups})()', {});
const sampleGroups=groupCalc(
 [{id:101,data:{work_type_id:"7",qty:5,mark:"Б1"}},{id:102,data:{work_type_id:"7",qty:3,mark:"Б2"}},{id:103,data:{work_type_id:"8",qty:2,mark:"К1"}}],
 [{id:7,title:"Монтаж балок",data:{project_code:"КМ-01"}},{id:8,title:"Монтаж колонн",data:{project_code:"КМ-02"}}],
 [{id:1,data:{items:[{mark_id:101,qty:2},{mark_id:101,qty:2},{mark_id:102,qty:7}]}}]
);
assert.equal(sampleGroups.length,2,"group by work type and project code");
const beam=sampleGroups.find(x=>x.name==="Монтаж балок");
assert.equal(beam.total,8,"quantities of all individual marks are added");
assert.equal(beam.mounted,7,"report installation is capped per mark and summed");
assert.equal(beam.remaining,1,"remaining pieces are calculated");
assert.equal(beam.mountedPct,87.5,"mounted percentage is based on mark quantities");
assert.equal(beam.remainingPct,12.5,"remaining percentage complements mounted");
assert.equal(sampleGroups.find(x=>x.name==="Монтаж колонн").remaining,2,"unmounted groups remain visible");
const withEmptyGroup=groupCalc([], [{id:88,title:"Монтаж связей",data:{project_code:"КМ-08"}}], []);
assert.equal(withEmptyGroup.length,1,"all configured work types appear even before their marks are loaded");
assert.equal(withEmptyGroup[0].positions,0);
assert.equal(withEmptyGroup[0].total,0);

assert(source.includes('class="ir-export-daily-card"'),"daily reports use expandable cards");
assert(source.includes("reportFull(record,r,images)"),"daily report cards include complete detail");
assert(source.includes("reportWorkTable(works)"),"daily report details include work list");
assert(source.includes("Content-Security-Policy"),"snapshot remains offline");
assert(source.includes('class="ir-export-topnav"'),"centered horizontal archive navigation exists");
assert(source.includes('<span>Обзор объекта</span></a>'),"overview is first link");
assert(source.includes('<span>Разделы меню</span>'),"remaining sections are under dropdown");
assert(source.includes('<details class="ir-export-menu">'),"native offline disclosure works without scripts");
assert(source.includes('class="ir-export-subnav-link"'),"all remaining sections have submenu links");
assert(source.includes('original(key)?.querySelector(".nav-label")?.textContent'),"real section names preserved");
assert(source.includes('original(key)?.querySelector(".nav-icon")?.innerHTML'),"real menu icons reused");
assert(source.includes('hero.insertAdjacentHTML("afterend",sidebarHtml('),"navigation follows the object banner");
assert(source.includes('ir-export-topnav-inner{display:flex;align-items:center;justify-content:center'),"menu is centered");
assert(source.includes('body.ir-object-route.ir-object-overview #app{margin:0!important;width:100%!important'),"right-side content fills the page");
assert(!source.includes('ir-export-sidebar.ir-object-sidebar-fixed'),"fixed left archive sidebar removed");
assert(!source.includes("'+sidebar+'<main id="),"no left sidebar rendered before main");
assert(source.includes("activeNavStyles"),"dropdown highlights current section offline");
assert(source.includes("body:has(#section-"),"anchor highlighting needs no JavaScript");
assert(source.includes("if(!/^\\d+$/.test(id))"),"numeric object ID must be accepted");
assert(!source.includes("if(!/^\\\\d+$/.test(id))"),"escaped digit matcher would reject every object");
assert(source.includes("if(String(activeHero?.dataset.objectId||\"\")!==id)"),"avoid exporting another object after navigation");
assert(source.includes("ir-styles.css"),"all current component styles embedded");
assert(source.includes("Content-Security-Policy"),"standalone report does not execute code");
assert(source.includes("function chooseExportSections(keys,nav)"),"configurable section dialog exists");
assert(source.includes('dlg.showModal()'),"native export options dialog opens");
assert(source.includes('Выбрать все')&&source.includes('Снять все'),"select/deselect all controls exist");
assert(source.includes('if(!selection)return false;'),"cancel never starts saving");
assert(source.includes('const keys=selection.keys;'),"only selected sections are loaded");
assert(source.includes('snapshot(keys,selection.overview,companyHeader.markup)'),"export can omit overview while retaining company header");
assert(source.includes('if(!includeOverview)'),"unselected overview content is discarded");
assert(!source.includes("IR Project / Объект"),"repeated section breadcrumb is absent across the entire HTML export source");
assert(source.includes('ir-export-group{scroll-margin-top:14px;min-width:0;width:100%;max-width:none;margin:0;padding:0}'),"all report groups span the available content width");
assert(source.includes('body.ir-object-overview #app .ir-object-overview-sidehead{width:100%!important;max-width:none!important;margin:0 0 13px!important;padding:0 0 14px!important;min-height:0!important;border:0!important;border-bottom:1px solid'),"summary heading is no longer a separate outer card");
assert(source.includes('body.ir-object-overview #app .ir-export-section-head{box-sizing:border-box!important;min-height:0!important;margin:0 0 14px!important;padding:0 0 14px!important;border-bottom:1px solid'),"headings have same aligned divider style");
assert(source.includes('body.ir-object-overview #app .ir-export-section{padding:18px 12px 20px!important}'),"compact screens keep consistent gutters");
assert(source.includes('ir-export-daily-card{border:1px'),"individual daily report designs remain intact");
assert(source.includes('ir-export-mark-card{border:1px'),"individual mark designs remain intact");
assert(source.includes('body.ir-object-overview #app .ir-export-preview{box-sizing:border-box!important;width:100%!important;max-width:none!important;margin:0!important;padding:18px 20px 0!important'),"preview content uses continuous full-width document layout");
assert(source.includes('body.ir-object-overview #app .ir-export-section{box-sizing:border-box!important;display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:22px 20px 25px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important'),"section outer cards no longer have frames or margins");
assert(source.includes('body.ir-object-overview #app .ir-export-group{box-sizing:border-box!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;background:#fff!important;border:0!important;border-top:1px solid #edf1f4!important'),"sections flow continuously with subtle separators");
assert(source.includes('body.ir-object-overview #app .ir-object-overview-layout{box-sizing:border-box!important;width:100%!important;max-width:none!important;margin:0!important;padding:19px 20px 20px!important'),"summary also spans full report width");

assert(source.includes("default-src &#39;none&#39;"),"offline report blocks external calls");
assert(source.includes('button,input,textarea,select,[contenteditable]'),"edit controls removed");
assert(source.includes('irProject.reportExport.html(html'),"uses existing native save dialog");
assert(source.includes('window.irProjectNotice'),'success and failure messages available');
assert(!source.includes('irProject.data.objects.update('),"export may not edit object");
assert(!source.includes('api.section(key).remove('),"export may not delete records");
const scope={window:{},console};vm.runInNewContext(source,scope);
assert.equal(typeof scope.window.irObjectHtmlExport?.save,"function");
assert(source.includes("ir-export-daily-brief"),"report cards display a short summary");
assert(source.includes("ir-export-daily-full"),"report cards disclose full details");
assert(source.includes("reportWorkTable(works)"),"daily report works table included");
assert(source.includes("reportChips(workers"),"worker details included");
assert(source.includes("reportChips(equipment"),"equipment details included");
assert(source.includes("ir-export-daily-photos"),"report photos included");
assert(source.includes('if(section==="reports")for(const photo'),"reportPhotos images are bundled into the offline HTML");
assert(source.includes("reportFull(record,r,images)"),"full report detail present");
const start=source.indexOf(" function reportFull("),end=source.indexOf(" function renderDailyReports(",start);
assert(start>=0&&end>start,"report details function exists");
const reportDetails=source.slice(start,end);
assert(!reportDetails.includes("Дополнительная информация"),"technical additional-information panel removed");
assert(!reportDetails.includes("record.record_type"),"technical record type not shown");
assert(!reportDetails.includes("<small>ID</small>"),"technical record ID is not listed as a field");
assert(reportDetails.includes("reportWorkTable(works)"),"full report still includes work table");
assert(reportDetails.includes("reportChips(workers"),"full report still includes workers");
assert(reportDetails.includes("reportChips(responsible"),"full report still includes supervisors");
assert(reportDetails.includes("reportChips(equipment"),"full report still includes equipment");
assert(reportDetails.includes("ir-export-daily-photos"),"full report still includes photos");
assert(source.includes('class="ir-export-daily-chevron" aria-hidden="true"><svg'),"native SVG chevron in daily report summary");
assert(source.includes('ir-export-daily-chevron svg{transform:rotate(180deg)}'),"chevron rotates when expanded");
assert(source.includes('ir-export-record>details[open]>summary:after'),"other record chevrons reflect disclosure state");

const cardStart=source.indexOf(" function markDetailData(");
const cardEnd=source.indexOf(" function renderMarkSection(",cardStart);
assert(cardStart>=0&&cardEnd>cardStart,"render helpers can be executed independently");
const renderCards=vm.runInNewContext(
 '(function(){'+
 'const array=x=>Array.isArray(x)?x:[];'+
 'const exportNumber=v=>{const n=Number(v);return Number.isFinite(n)?n:0};'+
 'const exportFormat=v=>String(v);'+
 'const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;");'+
 source.slice(cardStart,cardEnd)+';return renderMarkCards})()',{}
);
const cardMarks=Array.from({length:11},(_,i)=>({
 id:100+i,data:{work_type_id:i<8?"7":"8",mark:"В"+(i+1),name:"Связь "+(i+1),qty:2,mounted:0,unit:"тн",unit_volume:0.25}
}));
const cardWorks=[{id:7,title:"Монтаж металлоконструкций",data:{project_code:"КМ"}},{id:8,title:"Монтаж сэндвич-панелей",data:{project_code:"СП"}}];
const cardHTML=renderCards(cardMarks,cardWorks,[]);
assert(cardHTML.includes("Показать всю ведомость марок"),"show all button is present");
assert(cardHTML.includes('ir-export-count-all">11</span>'),"register includes correct total");
assert(cardHTML.includes('ir-export-status-mounted'),"status filters are present above mark records");
assert(cardHTML.includes('id="ir-export-work-0"')&&cardHTML.includes('id="ir-export-work-1"'),"each populated work gets a radio filter");
assert(cardHTML.includes('ir-export-work-radio-0:checked ~ .ir-export-work-panels > .ir-export-work-panel-0'),"work filter uses offline CSS");
const allCardsHTML=cardHTML.split('<div class="ir-export-work-panel ir-export-work-panel-all">')[1].split('<div class="ir-export-work-panel ir-export-work-panel-0">')[0];
assert(allCardsHTML.includes('class="ir-export-mark-cardlist"'),"cards share CSS-controlled list");
assert(source.includes('nth-child(-n+5 of .status-done,.status-partial)'),"filter displays correct first five by status");
assert.equal((allCardsHTML.match(/class="ir-export-mark-card status-/g)||[]).length,11,"all 11 marks remain accessible");
assert(!allCardsHTML.includes('<details open>'),"all mark cards start closed, including the first");
const selectedCardsHTML=cardHTML.split('<div class="ir-export-work-panel ir-export-work-panel-0">')[1].split('<div class="ir-export-work-panel ir-export-work-panel-1">')[0];
assert.equal((selectedCardsHTML.match(/class="ir-export-mark-card status-/g)||[]).length,8,"filter shows only selected work's eight marks");
assert(selectedCardsHTML.includes('ir-export-count-all">8</span>'),"work-filtered total is correct");
const otherCardsHTML=cardHTML.split('<div class="ir-export-work-panel ir-export-work-panel-1">')[1];
assert(otherCardsHTML.includes("В10")&&otherCardsHTML.includes("В11"),"second work's marks remain selectable");


const extraSource=fs.readFileSync("src/object-export-extras.js","utf8");
new vm.Script(extraSource,{filename:"object-export-extras.js"});
assert(html.includes('object-export-extras.js?v=17168'),"standalone asset renderer loaded");
const extraCtx={window:{},console};
vm.runInNewContext(extraSource,extraCtx);
const extras=extraCtx.window.irObjectExportExtras;
assert.equal(typeof extras?.deliveries,"function");
assert.equal(typeof extras?.recentPhotos,"function");
assert.equal(typeof extras?.schemeData,"function");
assert.equal(typeof extras?.schemeHtml,"function");
assert.equal(typeof extras?.schemeViewer,"function");
assert(source.includes("project_code_2"),"secondary project codes are printed in readiness and mark cards");
assert(source.includes('key==="deliveries"?extras.deliveries(rows)'),"invoices use a read-only dedicated view");
assert(source.includes('key==="photos"?extras.recentPhotos('),"photo gallery is built from real report images");
assert(source.includes('key==="scheme"?extras.schemeHtml('),"scheme uses embedded viewport");
assert(source.includes('const schemeDetails=keys.includes("scheme")?markDetailData('),"mark quantities are available even when marks section is not selected");
assert(source.includes('extras.schemeData(rows.scheme||[],schemeDetails)'),"export embeds complete mark details in read-only scheme");
assert(source.includes('["schedule","acted-days","penalties"].includes(key)'),"analysis and schedule are preview-only");
assert(source.includes("keys.includes(\"scheme\")"),"scheme data is embedded when selected");
assert(source.includes("script-src 'nonce-"),"viewer only runs a nonce-authorized script");
assert(source.includes("viewerScripts"),"offline HTML includes viewer engine");
assert(!extras.schemeViewer.toString().includes("irProject.data"),"viewer has no DB access");
const deliverySample=Array.from({length:5},(_,i)=>({
 id:10+i,data:{number:"К-"+i,date:"2026-10-0"+(i+1),vehicle_number:"AB001",items:[
  {mark:"Б1",work_type:"Монтаж",project_code:"КМ",qty:2,unit:"тн",volume:1.23}
 ]}
}));
const deliveryHTML=extras.deliveries(deliverySample);
assert((deliveryHTML.match(/ir-export-invoice-summary/g)||[]).length===5,"all five invoices exported");
assert(deliveryHTML.includes("Показать ещё (всего 5 накладных)"),"first three invoices appear before show-more");
assert(deliveryHTML.includes("ood-delivery-row"),"original invoice design is reused");
const imgMap=new Map([["a.png","data:image/png;base64,QQ=="],["b.png","data:image/png;base64,Qg=="]]);
const gallery=extras.recentPhotos([
 {id:1,data:{date:"2026-10-10",photos:["a.png","b.png"]}},
 {id:2,data:{date:"2026-10-09",photos:["c.png"]}}
],imgMap);
assert((gallery.match(/class="ir-export-gallery-tile"/g)||[]).length===2,"only available inlined photos exported");
assert(gallery.includes('href="#ir-export-lightbox-0"'),"lightbox opens without JavaScript");
assert(gallery.includes('data:image/png;base64,QQ=='),"embedded gallery images work offline");
const grid=[{id:1,record_type:"scheme_grid",data:{axes_x:["1","2"],axes_y:["А","Б"],span_x_mm:10000,span_y_mm:5000}},
 {id:2,record_type:"scheme_column",data:{mark:"К1",axis_x:"1",axis_y:"А",z0_mm:0,z1_mm:8400,geometry_type:"column",status:"mounted"}},
 {id:3,record_type:"scheme_column",data:{mark:"Б1",axis_x:"1",axis_y:"А",absolute_x2_mm:10000,absolute_y2_mm:0,z0_mm:8400,z1_mm:8400,geometry_type:"beam"}}];
const model=extras.schemeData(grid);
assert.equal(model.members.length,2,"actual placed members are read from scheme records");
assert.equal(model.members[0].end[2],8400,"column height is preserved");
assert.equal(model.members[1].end[0],10000,"beam endpoint coordinates are preserved");
const detailedModel=extras.schemeData(grid,[{id:44,mark:"К1",name:"Колонна главная",work:"Монтаж МК",code:"041-2025 КМД",code2:"КМ-2",qty:7,done:4,left:3,pct:57.14,unit:"тн",uv:1.25,total:8.75}]);
assert.equal(detailedModel.members[0].name,"","unlinked elements keep source fallback values");
const linkedGrid=grid.map((r,i)=>i===1?{...r,data:{...r.data,mark_id:44}}:r);
const linkedModel=extras.schemeData(linkedGrid,[{id:44,mark:"К1",name:"Колонна главная",work:"Монтаж МК",code:"041-2025 КМД",code2:"КМ-2",qty:7,done:4,left:3,pct:57.14,unit:"тн",uv:1.25,total:8.75}]);
assert.equal(linkedModel.members[0].name,"Колонна главная","scheme element resolves its original mark ID");
assert.equal(linkedModel.members[0].done,4,"mounted quantities appear in selected mark details");
assert.equal(linkedModel.members[0].left,3,"remaining quantities appear in selected mark details");
assert.equal(linkedModel.members[0].code,"041-2025 КМД","mark work code appears");
assert.equal(linkedModel.members[0].code2,"КМ-2","second project code appears");
assert.equal(linkedModel.members[0].qty,7,"total mark count appears");
assert(extras.schemeHtml(model).includes('data-view="plan"'),"Plan toggle is present");
assert(!extras.schemeHtml(model).includes('data-view="labels"'),"inline labels control is removed");
assert(extras.schemeHtml(model).includes('ir-export-scheme-member-card'),"selected mark info panel exists");
assert(extras.schemeViewer.toString().includes("pointermove"),"3D rotates with pointer drag");
assert(extras.schemeViewer.toString().includes("wheel"),"3D wheel zoom is implemented");
assert(extras.schemeViewer.toString().includes('.93*w/Math.max(1,maxX-minX)'),"3D auto-fits the model using full viewport width");
assert(extras.schemeViewer.toString().includes('.90*h/Math.max(1,maxY-minY)'),"3D auto-fits the model vertically");
assert(extras.schemeViewer.toString().includes('paint(true)'),"3D re-fits on view changes and resizing");
assert(extras.schemeViewer.toString().includes('selectMember(found.s.m)'),"clicking a model element opens its mark card");
assert(extras.schemeViewer.toString().includes('field(fields,"Шифр",m.code)'),"mark card includes project code");
assert(!extras.schemeViewer.toString().includes('if(labels)'),"3D no longer draws persistent label clutter");
assert(extras.schemeViewer.toString().includes('center[0]'),"3D model is centered");
const secondary=groupCalc(
 [{id:111,data:{work_type_id:"7",qty:2,mark:"Б1"}}],
 [{id:7,title:"Монтаж балок",data:{project_code:"КМ-01",project_code_2:"КМ-02"}}],
 []
);
assert.equal(secondary[0].code2,"КМ-02","second project code is retained in work readiness");
assert(!extras.schemeHtml(model).includes("Редактировать"),"no editing in scheme export");


assert(source.includes("function schedulePreviewHtml(card)"),"work-specific Gantt selectors exist");
assert(source.includes('key==="schedule"?schedulePreviewHtml(card):card.outerHTML'),"Gantt uses filtered offline snapshot");
assert(source.includes('class="ir-export-marks-unified"'),"work readiness and marks form one visual section");
assert(source.includes('class="ir-export-section ir-export-deliveries-unified"'),"deliveries summary and invoices share one visual section");
assert(source.includes('class="ir-export-delivery-register"'),"invoice register appears directly under supply comparison");
assert(source.includes("ir-export-gantt-options"),"Gantt includes work-type choices");
assert(source.includes("#section-scheme>.ir-export-section{padding:0!important"),"scheme fills complete section width");
assert(source.includes("body.ir-object-overview #app #section-scheme .ir-export-scheme-controls button{display:inline-flex!important"),"3D and plan switches override global read-only button hiding");
assert(source.includes('class="ir-export-daily-photo-link"'),"daily report photo thumbnails are clickable");
assert(source.includes('class="ir-export-gallery-lightbox"'),"daily report photos have standalone lightboxes");
assert(!source.includes('<span>Редактировать</span></a>'),"no edit action linked from photos");
assert(extras.schemeViewer.toString().includes('viewPlan.classList.toggle("active",plan)'),"Plan visibly activates after switching");
assert(extras.schemeViewer.toString().includes('view3D.classList.toggle("active",!plan)'),"3D visibly activates on return");
assert(extras.schemeViewer.toString().includes('view3D.setAttribute("aria-pressed",String(!plan))'),"3D button accessibility state updates");
assert(extras.schemeViewer.toString().includes("const reset=()=>setPlan(plan)"),"Reset preserves selected scheme view");
const scheduleStart=source.indexOf(" function schedulePreviewHtml("),scheduleEnd=source.indexOf(" function extractOverviewPreviews(",scheduleStart);
assert(scheduleStart>=0&&scheduleEnd>scheduleStart,"Gantt filter function is available");
const scheduleFn=vm.runInNewContext(
 '(function(){const esc=v=>String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;");'+source.slice(scheduleStart,scheduleEnd)+';return schedulePreviewHtml})()'
);
const ganttRows=[
 {label:"Колонны",code:"КМ-01",classes:[]},
 {label:"Балки",code:"КМ-02",classes:[]},
 {label:"Колонны",code:"КМ-01",classes:[]}
];
const ganttFake={
 querySelectorAll:()=>ganttRows.map(g=>({
  querySelector:selector=>({textContent:selector.endsWith(" b")?g.label:g.code}),
  classList:{add:v=>g.classes.push(v)}
 })),
 get outerHTML(){return'<section class="object-overview-schedule">'+ganttRows.map(g=>'<div class="overview-gantt-row '+g.classes.join(" ")+'">'+g.label+'</div>').join("")+'</section>'}
};
const ganttHTML=scheduleFn(ganttFake);
assert(ganttHTML.includes('id="ir-export-gantt-all"'),"all-work Gantt view exists");
assert(ganttHTML.includes('id="ir-export-gantt-0"'),"first work radio exists");
assert(ganttHTML.includes('id="ir-export-gantt-1"'),"second work radio exists");
assert(ganttHTML.includes('.overview-gantt-row:not(.ir-export-gantt-type-1){display:none!important}'),"Gantt filter hides unrelated rows");
assert(ganttRows[0].classes.includes("ir-export-gantt-type-0")&&ganttRows[2].classes.includes("ir-export-gantt-type-0"),"same work type uses a consistent selector");
assert(ganttRows[1].classes.includes("ir-export-gantt-type-1"),"different work types have independent selectors");
const photosStart=source.indexOf(" function reportFull("),photosEnd=source.indexOf(" function exportMoreCards(",photosStart);
const fullReport=vm.runInNewContext(
 '(function(){const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;");'+
 'const array=v=>Array.isArray(v)?v:[];const reportWorks=()=>[];const reportPeople=()=>[];const reportResponsible=()=>[];'+
 'const reportPhotos=r=>r.photos||[];const photoPath=p=>String(p||"");const dataUrl=v=>String(v).startsWith("data:image/");'+
 'const reportWorkTable=()=>"";const reportChips=()=>"";'+source.slice(photosStart,photosEnd)+';return reportFull})()'
);
const photoReport=fullReport({id:139},{photos:["picture.png"]},new Map([["picture.png","data:image/png;base64,QQ=="]]));
assert(photoReport.includes('href="#ir-export-daily-photo-139-0"'),"clicking a daily photo opens its correct lightbox");
assert(photoReport.includes('id="ir-export-daily-photo-139-0"'),"daily report photo has matching fullscreen target");
assert(photoReport.includes('href="#section-reports"'),"photo can be closed without scripts");
assert(photoReport.includes("data:image/png;base64,QQ=="),"full-sized photo bytes are inlined");


assert(source.includes("function exportCompanyHeader(api,object,underContractor)"),"export reads the three company identities");
assert(source.includes('api.section("object-meta").list()'),"client and general contractor logos come from object metadata");
assert(source.includes('irProject.company.get()'),"own company comes from company profile");
assert(source.includes('readLogo(filePath("customer_logo"))')&&source.includes('readLogo(filePath("general_contractor_logo"))'),"party logos are inlined");
assert(source.includes('underContractor?Promise.resolve(""):readLogo(String(profile?.logo||""))'),"owner logo is never read for contractor-flagged export");
assert(source.includes('hero.insertAdjacentHTML("beforebegin",headerMarkup)'),"participants are above object banner");
assert(source.includes('copy.querySelector(".ir-export-companies")'),"company header kept when overview is excluded");
assert(source.includes('<input type="checkbox" data-under-contractor>'),"flag is off by default");
assert(source.includes('underContractor:dlg.querySelector("[data-under-contractor]").checked===true'),"export receives checked contractor flag");
assert(source.includes('if(selection.underContractor)html=redactCompanyIdentity(html,companyHeader.ownName)'),"own company name is redacted throughout HTML output");
assert(source.includes('redactCompanyIdentity(name,companyHeader.ownName)'),"own company is also excluded from filename");
assert(source.includes('.ir-export-companies{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))'),"three columns share full width");
const brandStart=source.indexOf(" function companyHeaderHtml("),brandEnd=source.indexOf(" function sidebarHtml(",brandStart);
assert(brandStart>=0&&brandEnd>brandStart,"standalone brand helpers can be tested");
const brandFns=vm.runInNewContext('(function(){const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");const array=x=>Array.isArray(x)?x:[];'+source.slice(brandStart,brandEnd)+';return {companyHeaderHtml,redactCompanyIdentity}})()', {});
const companies={customerName:'АО "Заказчик"',contractorName:'ТОО "Генподрядчик"',ownName:'ТОО "А-Темир Строй"',
 customerLogo:"data:image/png;base64,QQ==",contractorLogo:"data:image/png;base64,Qg==",ownLogo:"data:image/png;base64,Qw==",underContractor:false};
const regular=brandFns.companyHeaderHtml(companies);
assert.equal((regular.match(/class="ir-export-company-card"/g)||[]).length,3,"normal export displays customer contractor and own company");
assert(regular.indexOf("Заказчик")<regular.indexOf("Генподрядчик")&&regular.indexOf("Генподрядчик")<regular.indexOf("Наша компания"),"correct participant ordering");
assert(regular.includes("А-Темир Строй")&&regular.includes("data:image/png;base64,Qw=="),"owner name and logo are embedded after contractor");
const contractor=brandFns.companyHeaderHtml({...companies,underContractor:true});
assert.equal((contractor.match(/class="ir-export-company-card"/g)||[]).length,2,"contractor mode has exactly two participants");
assert(!contractor.includes("А-Темир")&&!contractor.includes("Наша компания")&&!contractor.includes("data:image/png;base64,Qw=="),"owner identity absent from header");
assert(contractor.includes("data:image/png;base64,QQ==")&&contractor.includes("data:image/png;base64,Qg=="),"customer and contractor logos are preserved");
const redacted=brandFns.redactCompanyIdentity('<p>Исполнитель: ТОО &quot;А-Темир Строй&quot;</p><div>ТОО «А-Темир Строй»</div><span>ТОО "А-Темир Строй"</span>',companies.ownName);
assert(!redacted.includes("А-Темир")&&!redacted.includes("Строй"),"name is redacted across HTML entities and quote styles");
assert(!redacted.includes("&quot;")&&!redacted.includes("»</div>"),"redaction does not leave dangling company-name quotes");
assert(redacted.includes("<p>Исполнитель: ")&&redacted.includes("<div>"),"other content survives redaction");
assert.equal(brandFns.redactCompanyIdentity("<p>Заказчик</p>",""),"<p>Заказчик</p>","empty owner name does not censor other content");


assert(source.includes('dialog.ir-export-options[open]{display:flex!important;flex-direction:column!important}'),"only the open export modal receives flex column layout");
assert(source.includes('height:min(760px,calc(100dvh - 28px))!important'),"modal height fits available viewport");
assert(source.includes('max-height:calc(100dvh - 28px)!important'),"modal never exceeds viewport height");
assert(source.includes('flex:1 1 auto!important;min-height:0!important;max-height:none!important;overflow-y:auto!important'),"section list alone scrolls and may shrink");
assert(source.includes('align-content:start;gap:7px'),"scrollable choices do not stretch vertically");
assert(source.includes('.ir-export-options-head,.ir-export-options-tools,.ir-export-options-foot{flex:0 0 auto!important}'),"header controls and footer do not shrink");
assert(source.includes('.ir-export-options-foot{display:flex;position:relative;z-index:1;flex:0 0 auto'),"bottom actions remain visible");
assert(source.includes('min-height:64px;padding:12px 20px;border-top:1px solid #e3ebf1;background:#fff!important'),"footer retains dedicated height");
assert(source.includes('@media(max-height:540px){.ir-export-options-head{padding:12px 18px 10px}'),"short screens receive compact layout");
const dialogStart=source.indexOf("dlg.innerHTML="),dialogEnd=source.indexOf("document.body.append(dlg)",dialogStart);
const dialogMarkup=source.slice(dialogStart,dialogEnd);
assert(dialogMarkup.includes('data-under-contractor'),"contractor flag remains selectable");
assert(dialogMarkup.indexOf('ir-export-options-list')<dialogMarkup.indexOf('ir-export-options-flag'),"contractor flag follows section choices");
assert(dialogMarkup.includes('</p></div></div>'),"contractor flag belongs to scrollable content");
assert(dialogMarkup.indexOf('ir-export-options-flag')<dialogMarkup.indexOf('ir-export-options-foot'),"fixed export buttons remain below the scrollable content");
assert(!source.includes('max-height:49vh;overflow:auto'),"old overflow that clipped the buttons is removed");

console.log("Full object HTML export: snapshot, offline navigation, read-only records, native save and no DB writes OK");
