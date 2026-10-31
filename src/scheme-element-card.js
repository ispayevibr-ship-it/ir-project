"use strict";
/*
 * The card of the selected element in plain words (the engineer, 27.10.2026: «вот это описание элемента мне вообще не
 * нравится, толком ничего не понятно. переделай на основе чертежей»): its characteristic — the kind, the section, the
 * steel, the fasteners, the axes and the levels of its bottom and top, its height or length (the engineer, 30.10.2026:
 * «убери из описаний лишние тексты… просто сделай общую характеристику») — and what the drawings say of it (the sheet,
 * where each value was taken, what to check, what a new analysis gives after an edit of the engineer). The exact
 * coordinates are folded away. The same text in the montage scheme (src/scheme-page.js) and in the exported HTML
 * (src/scheme-export-html.js).
 *
 * e: {mark, name, type_name, type_key, lay, group, geometry, profile, standard, section, steel, joint, status, status_label, x, y, x2, y2, z0, z2, mx, my,
 *     mz, r, ri, sw, ft, doc, src_section, instance_status, preliminary, reasons[], sources{}, pdf_new{}, check_note, manual}
 * grid: {axesX:[…], axesY:[…], posX:{axis: mm}, posY:{axis: mm}}
 */
(function(root){
 // How the drawings determined it (instance_status of src/ai-montage.js), in words.
 var FOUND={confirmed:["ok","Найден на чертеже: положение и отметки подтверждены"],computed:["ok","Положение и отметки вычислены по чертежам"],
  partial:["warn","По чертежам определено не всё"],ambiguous:["warn","Чертежи допускают несколько вариантов"],
  conflict:["warn","На разных листах разные значения"],not_found:["warn","Повторный анализ чертежей этот элемент не нашёл"]};
 var SOURCE=[["position","Положение"],["levels","Отметки"],["name","Наименование"],["name_other","На чертеже названо"],["profile","Профиль"],["size","Длина"],["profile_other","Другой профиль на чертеже"]];
 function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
 function num(v){var n=Number(v);return isFinite(n)?n:0}
 function has(v){return v!==null&&v!==undefined&&v!==""&&isFinite(Number(v))}
 function fmt(v){var n=Math.round(num(v)),s=String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g," ");return(n<0?"−":"")+s}
 // A level as on the drawings: +11,100 / ±0,000 / −0,300.
 function level(mm){var n=Math.round(num(mm));return(n>0?"+":n<0?"−":"±")+(Math.abs(n)/1000).toFixed(3).replace(".",",")}
 // The nearest axis of a coordinate and how far from it: "3", "4 (−1 540 мм)".
 function axisOf(axes,pos,v){
  var best=null;(axes||[]).forEach(function(a){var p=pos&&pos[a];if(!has(p))return;var d=num(v)-num(p);if(!best||Math.abs(d)<Math.abs(best.d))best={a:String(a),d:d}});
  if(!best)return"";return Math.abs(best.d)<5?best.a:best.a+" ("+(best.d>0?"+":"−")+fmt(Math.abs(best.d))+" мм)"
 }
 function ax(g,v){return axisOf(g.axesX,g.posX,v)}
 function ay(g,v){return axisOf(g.axesY,g.posY,v)}
 function point(g,x,y){var a=ax(g,x),b=ay(g,y);return a&&b?a+"/"+b:a||b||"("+fmt(x)+"; "+fmt(y)+")"}
 function length(e){
  if(e.geometry==="bent")return Math.hypot(num(e.mx)-num(e.x),num(e.my)-num(e.y),num(e.mz)-num(e.z0))+Math.hypot(num(e.x2)-num(e.mx),num(e.y2)-num(e.my),num(e.z2)-num(e.mz));
  return Math.hypot(num(e.x2)-num(e.x),num(e.y2)-num(e.y),num(e.z2)-num(e.z0))
 }
 var POINT={column:1,shell:1,plate:1};
 // Where it is, as rows of the characteristic: its axes, the levels of its bottom and top (of a horizontal one its level),
 // its height or length.
 function position(e,g){
  g=g||{};var out=[],kind=e.geometry||"column",z0=num(e.z0),z2=num(e.z2),flat=Math.hypot(num(e.x2)-num(e.x),num(e.y2)-num(e.y)),L=e.lay&&typeof e.lay==="object"?e.lay:null;
  var span=function(){out.push(["Низ",level(Math.min(z0,z2))]);out.push(["Верх",level(Math.max(z0,z2))]);out.push(["Высота",fmt(Math.abs(z2-z0))+" мм"])};
  if(kind==="shell"){
   out.push(["Оси","центр у осей "+point(g,e.x,e.y)]);out.push([e.sw>0&&e.sw<360?"Дуга":"Радиус",(e.sw>0&&e.sw<360?fmt(e.sw)+"°, радиус ":"")+fmt(e.r)+" мм"+(e.ri>0?" (внутри "+fmt(e.ri)+" мм)":"")]);span();return out
  }
  if(L&&L.kind==="central_ring"){
   // The central ring of a shield roof: in the middle of the roof, its own levels and the top of its shield.
   out.push(["Оси","центр крыши у осей "+point(g,e.x,e.y)]);span();
   if(L.cap&&num(L.cap.r_mm)>0&&num(L.cap.base_mm)>0)out.push(["Верх центрального щита",level(z0+num(L.cap.base_mm)+num(L.cap.rise_mm))]);return out
  }
  if(kind==="plate"){
   out.push(["Оси","центр у осей "+point(g,e.x,e.y)]);if(e.r>0)out.push(["Радиус",fmt(e.r)+" мм"+(e.ri>0?", отверстие "+fmt(e.ri)+" мм":"")]);
   out.push(["Отметка",level(z0)+(Math.abs(z2-z0)>5?" … "+level(z2):"")]);return out
  }
  if(POINT[kind]||flat<5&&kind!=="bent"){out.push(["Оси",point(g,e.x,e.y)]);span();return out}
  if(kind==="bent"){
   out.push(["Оси","от "+point(g,e.x,e.y)+" через "+point(g,e.mx,e.my)+" до "+point(g,e.x2,e.y2)]);
   out.push(["Концы",level(z0)+" и "+level(z2)]);out.push(["Конёк",level(e.mz)]);out.push(["Длина",fmt(length(e))+" мм"]);return out
  }
  var alongX=Math.abs(num(e.y2)-num(e.y))<5,alongY=!alongX&&Math.abs(num(e.x2)-num(e.x))<5;
  // (along a line of the grid: the line, then from where to where along it)
  if(alongX)out.push(["Оси",ay(g,e.y)+": от "+ax(g,e.x)+" до "+ax(g,e.x2)]);
  else if(alongY)out.push(["Оси",ax(g,e.x)+": от "+ay(g,e.y)+" до "+ay(g,e.y2)]);
  else out.push(["Оси","от "+point(g,e.x,e.y)+" до "+point(g,e.x2,e.y2)]);
  if(Math.abs(z2-z0)<=20)out.push(["Отметка",level(z0)]);
  else{out.push(["Низ",level(Math.min(z0,z2))]);out.push(["Верх",level(Math.max(z0,z2))])}
  out.push(["Длина",fmt(length(e))+" мм"]);
  return out
 }
 // The fasteners of its joints as its sheet names them (the joint of the КМ: «монтажная сварка; болты М24 кл. 8.8»), else
 // its bolt and class and the weld, else the list of its КМД; the bolts the model puts there.
 function fasteners(e){
  var j=e.joint&&typeof e.joint==="object"?e.joint:{},m=e.model||{},out=[];
  if(j.text)out.push(String(j.text));
  else{if(j.bolt)out.push("болты "+j.bolt+(j.cls?" кл. "+j.cls:""));if(j.weld)out.push("монтажная сварка")}
  if(!out.length&&Array.isArray(j.fasteners)&&j.fasteners.length)out.push(j.fasteners.slice(0,3).join("; ")+(j.fasteners.length>3?" …":""));
  if(num(m.bolts)>0)out.push("на модели "+fmt(m.bolts)+" шт.");
  return out.join("; ")
 }
 // What it is made of, when the reading of its sheet says (the central ring of a shield roof: its box, ribs, shield).
 function made(e){
  var L=e.lay;
  // An oval manhole of the wall (РВС-700 КМ-14): its opening, shell and flange, how it lies.
  if(L&&typeof L==="object"&&Array.isArray(L.oval_mm)&&L.oval_mm.length===2){
   var pair=function(v){return Array.isArray(v)&&v.length===2&&num(v[0])>0?fmt(v[1])+"×"+fmt(v[0]):""},sh=pair(L.shell_mm),fl=pair(L.flange_mm);
   return["Овальный люк "+pair(L.oval_mm)+" мм — длинной стороной вдоль стенки"+(sh?"; обечайка снаружи "+sh:"")+(fl?", фланец и крышка "+fl:"")+"."+(sh&&fl?"":" Обечайка и фланец показаны условно — размеры по листу люка.")]
  }
  if(!L||typeof L!=="object"||L.kind!=="central_ring")return[];
  var out=["Кольцо коробчатого сечения: наружная стенка Ø"+fmt(2*num(L.wall_r_mm))+" и внутренняя обечайка Ø"+fmt(2*num(L.shell_r_mm))+" высотой "+fmt(L.height_mm)+" мм, пояса t"+fmt(L.plate_mm)+"; нижний лист до Ø"+fmt(2*num(e.r))+" — на него опираются щиты."];
  if(num(L.lugs)>0)out.push(fmt(L.lugs)+" рёбер t"+fmt(L.plate_mm)+" "+fmt((L.lug_mm||[])[0])+"×"+fmt((L.lug_mm||[])[1])+" мм по стыкам щитов"+(L.bolt?", щит крепится к ребру болтом "+L.bolt:"")+".");
  if(L.cap&&num(L.cap.r_mm)>0)out.push("Сверху центральный щит — конус Ø"+fmt(2*num(L.cap.r_mm))+" из листов t"+fmt(L.cap.t_mm)+" внахлёст, подъём "+fmt(L.cap.rise_mm)+" мм.");
  return out
 }
 function section(e){
  var p=String(e.profile||"").trim(),s=String(e.section||"").trim();if(p==="—")p="";
  if(!p&&e.lay&&e.lay.kind==="central_ring")s="Коробчатое кольцо из листов"+(num(e.lay.plate_mm)>0?" t"+fmt(e.lay.plate_mm):"");
  var low=function(v){return v.toLowerCase().replace(/ё/g,"е")};
  var both=p&&s&&low(p).indexOf(low(s))<0?p+" ("+low(s)+")":p||s;
  return both+(e.standard&&both.indexOf(e.standard)<0?", "+e.standard:"")
 }
 // The top of the card as the report of 21.10.2026 has it (the engineer, 27.10.2026: «вывод информации об элементе сделай
 // такой»): the mark — its name; its state with the day it was mounted by the daily reports (e.status_date), for a mark
 // mounted in part how many and the last day (e.status_more); a line of the sheet and the masses of the КМД and of the
 // model (facts — the section and the bolts in the characteristic, traits); the nodes of the member (nodes); «Приблизить»
 // (tools); the parts
 // of the specification of its assembly sheet with their colours on the model (parts). e.model — what the 3D gives of the
 // member (irThreeSchemeView.card: mass_kg, bolts, nodes, colors, lit), e.spec — its parts (c.parts), e.kgm(section) —
 // kilograms in a metre of a section (irThreeSchemeView.massPerMetre).
 function head(e){
  var cls=e.status==="mounted"?"ec-ok":e.status==="partial"?"ec-partial":"ec-wait";
  return'<div class="ec-head"><div><b class="ec-mark">'+esc(e.mark||"—")+'</b>'+(e.name?'<span class="ec-name">'+esc(e.name)+'</span>':"")+'</div></div>'+
   '<div class="ec-badge"><span class="ec-status '+cls+'"'+(e.status_title?' title="'+esc(e.status_title)+'"':"")+'>'+esc((e.status_label||"")+(e.status_date?" "+e.status_date:""))+'</span>'+
   (e.status_more?'<small>'+esc(e.status_more)+'</small>':"")+'</div>'
 }
 // Kilograms as the report writes them: «74», «4,6».
 function kgs(v){var n=num(v);return n>=100?fmt(n):String(Math.round(n*10)/10).replace(".",",")}
 // «041-2025 КМД л. 79, 80.pdf, лист 2» → «041-2025 КМД л. 79, 80, л. 2».
 function sheetName(v){return String(v||"").replace(/\.pdf\b/gi,"").replace(/\s*[·,]\s*лист\s+/g,", л. ").trim()}
 function facts(e){
  var m=e.model||{},out=[],kg=[];
  if(e.sheet)out.push(sheetName(e.sheet));
  if(num(e.mass_kmd)>0)kg.push("масса "+kgs(e.mass_kmd)+" кг (КМД)");
  if(num(m.mass_kg)>0)kg.push((kg.length?"по модели ":"масса по модели ")+kgs(m.mass_kg)+" кг");
  if(kg.length)out.push(kg.join(", "));
  // (a member that crossed a wall of sandwich panels: drawn to the panel, what was past it named — not hidden)
  // (a wall of panels moved out onto the outer face of the frame: by how much, from the line of the facades of the АР)
  if(num(m.line_mm)>0)out.push("стена поставлена по наружной грани каркаса — на "+fmt(m.line_mm)+" мм наружу от линии по фасадам АР");
  var wall=num(m.wall_mm)>0?'<div class="ec-facts ec-warn">За стену из сэндвич-панелей выходило '+esc(fmt(m.wall_mm))+' мм — показан до стены. Проверьте положение элемента по чертежу.</div>':"";
  return(out.length?'<div class="ec-facts">'+esc(out.join(" · "))+'</div>':"")+wall
 }
 function nodes(e){
  var l=e.model&&Array.isArray(e.model.nodes)?e.model.nodes:[];if(!l.length)return"";
  return'<div class="ec-nodes"><span>Узлы марки ('+l.length+'):</span><div>'+l.slice(0,14).map(function(n){
   return'<button type="button" class="ec-chip" data-ec-node="'+esc(n.id)+'">'+esc([n.id,n.name,n.axes].filter(Boolean).join(" "))+'</button>'}).join("")+(l.length>14?'<span class="ec-more">ещё '+(l.length-14)+'</span>':"")+'</div></div>'
 }
 // (no «Снять подсветку»: a lit position goes out by its row pressed again — the engineer, 30.10.2026, «убери снять подсветку»)
 // The member from several sides (the engineer, 30.10.2026: «возможно смотреть с нескольких ракурсов»): irThreeSchemeView.look.
 var LOOKS=[["top","Сверху"],["bottom","Снизу"],["front","Спереди"],["back","Сзади"],["left","Слева"],["right","Справа"],["iso","3D"]];
 function tools(){return'<div class="ec-tools"><button type="button" data-ec-zoom>Приблизить</button></div>'+
  '<div class="ec-looks"><span>Ракурс:</span>'+LOOKS.map(function(l){return'<button type="button" data-ec-look="'+l[0]+'">'+l[1]+'</button>'}).join("")+'</div>'}
 // The parts: position (its colour on the model), section with its note, length, count, kilograms — of the specification
 // where the sheet gives the mass of a part, else by the sortament (pale, with a hint).
 function parts(e){
  // (without a КМД: the positions the model gives of its pieces, model.spec, with a note that they are conventional)
  var p=e.spec&&Array.isArray(e.spec.rows)&&e.spec.rows.length?e.spec:e.model&&e.model.spec,rows=p&&Array.isArray(p.rows)?p.rows:[];if(!rows.length)return"";
  var colors=e.model&&e.model.colors||{},lit=e.model?e.model.lit:null,kgm=typeof e.kgm==="function"?e.kgm:function(){return null};
  var body=rows.map(function(r){
   var pos=r.pos===null||r.pos===undefined?"":String(r.pos),n=num(r.count),L=num(r.length_mm),one=num(r.mass_kg),per=one>0?0:kgm(r.section),kg=n>0?one>0?one*n:per>0&&L>0?per*L/1000*n:0:0,c=colors[pos];
   return'<tr'+(pos?' data-ec-pos="'+esc(pos)+'"'+(lit===pos?' class="on"':""):"")+'><td><span class="ec-sw"'+(c?' style="background:'+esc(c)+'"':"")+'></span>'+esc(pos||"—")+'</td>'+
    '<td>'+esc(r.section||"сечение не прочитано")+(r.note?'<div class="ec-note">'+esc(r.note)+'</div>':"")+'</td><td class="ec-n">'+(L>0?esc(fmt(L)):"")+'</td><td class="ec-n">'+(n>0?esc(fmt(n)):"")+'</td>'+
    '<td class="ec-n'+(kg&&!(one>0)?' ec-calc" title="По сортаменту: '+esc(kgs(per))+' кг/м':"")+'">'+(kg?esc(kgs(kg)):"")+'</td></tr>'}).join("");
  return'<div class="ec-parts-box"><table class="ec-parts"><thead><tr><th>Поз</th><th>Сечение</th><th class="ec-n">L</th><th class="ec-n">Шт</th><th class="ec-n">кг</th></tr></thead><tbody>'+body+'</tbody></table>'+
   (p.sheet?'<p class="ec-parts-src">Спецификация: '+esc(sheetName(p.sheet))+(p.by?" · как "+esc(p.by):"")+'</p>':"")+(p.note?'<p class="ec-parts-src">'+esc(p.note)+'</p>':"")+'</div>'
 }
 // The buttons and the rows of the card on the 3D (the montage scheme and the exported page alike).
 function bind(box,id){
  var V=root.irThreeSchemeView;if(!box||!V)return;
  [].forEach.call(box.querySelectorAll("[data-ec-node]"),function(b){b.onclick=function(){if(V.openNode)V.openNode(b.getAttribute("data-ec-node"))}});
  var z=box.querySelector("[data-ec-zoom]");
  if(z)z.onclick=function(){if(V.focus)V.focus(String(id))};
  [].forEach.call(box.querySelectorAll("[data-ec-look]"),function(b){b.onclick=function(){if(V.look)V.look(String(id),b.getAttribute("data-ec-look"))}});
  [].forEach.call(box.querySelectorAll("[data-ec-pos]"),function(r){r.onclick=function(){if(V.lightPart)V.lightPart(r.classList.contains("on")?null:r.getAttribute("data-ec-pos"))}})
 }
 // The characteristic, a table (the engineer, 30.10.2026: «Колонна К7 — вертикальная несущая опора каркаса… зачем такие
 // тексты? Где стоит? Просто сделай общую характеристику… металл какой используется, какие метизы используются, положение
 // (высота, низ, верх…)»): the kind, the section, the steel (of the record; else the mark card of the drawings fills it,
 // data-ec-steel), the fasteners, where it is; what a ring or a manhole is made of, by its sheet.
 function traits(e,g){
  var rows=[],t=String(e.type_name||"").trim(),sec=section(e),f=fasteners(e),st=String(e.steel||"").trim();
  if(t)rows.push(["Вид",t]);if(sec)rows.push(["Сечение",sec]);rows.push(["Сталь",st,"steel"]);if(f)rows.push(["Метизы",f]);
  position(e,g).forEach(function(r){rows.push(r)});made(e).forEach(function(x){rows.push(["Устройство",x])});
  return'<div class="ec-block ec-traits"><b>Характеристика</b><dl>'+rows.map(function(r){
   return'<div'+(r[2]?' data-ec-'+r[2]+(r[1]?"":" hidden"):"")+'><dt>'+esc(r[0])+'</dt><dd>'+esc(r[1])+'</dd></div>'}).join("")+'</dl></div>'
 }
 // What a new reading of the drawings gives for an element the engineer changed (his values stay).
 function renewed(e){
  var n=e.pdf_new;if(!n||typeof n!=="object")return"";
  var top=POINT[e.geometry]?n.z1:(n.end_z!=null?n.end_z:n.z1),d=[];
  if(n.mark&&String(n.mark).trim().toLowerCase()!==String(e.mark||"").trim().toLowerCase())d.push("марка "+n.mark);
  [["X",e.x,n.x],["Y",e.y,n.y]].forEach(function(r){if(has(r[2])&&Math.abs(num(r[1])-num(r[2]))>5)d.push(r[0]+" "+fmt(r[2])+" мм")});
  if(has(n.z0)&&Math.abs(num(e.z0)-num(n.z0))>5)d.push("низ "+level(n.z0));
  if(has(top)&&Math.abs(num(e.z2)-num(top))>5)d.push("верх "+level(top));
  return'<p>'+(e.confirmed&&!e.edited?"Вы подтвердили этот элемент":"Вы меняли этот элемент")+' — сохранены ваши значения. '+(d.length?"Повторный анализ чертежей даёт другое: "+esc(d.join(", "))+".":"Повторный анализ чертежей даёт то же самое.")+'</p>'
 }
 function drawings(e){
  // Confirmed by the engineer (a button of the card): his word, not the drawings'.
  var cf=e.confirmed&&typeof e.confirmed==="object"?e.confirmed:null,cd=cf&&cf.at?new Date(cf.at):null;
  var f=e.manual?["manual","Поставлен вручную, не из анализа чертежей"]:cf?["ok","Подтверждено инженером"+(cf.by?" ("+cf.by+")":"")+(cd&&!isNaN(cd)?", "+cd.toLocaleDateString("ru-RU"):"")+" — повторная расстановка его не меняет"]:FOUND[e.instance_status]||null,rows=[];
  if(e.doc)rows.push('<p>Лист: '+esc(e.doc)+(e.src_section&&String(e.doc).indexOf(e.src_section)<0?" (раздел "+esc(e.src_section)+")":"")+'</p>');
  // Where each value was taken (the position only when it says more than the sheet above: the title of the scheme).
  var s=e.sources&&typeof e.sources==="object"?e.sources:null,file=String(e.doc||"").split(" · ")[0],from=[];
  if(s)SOURCE.forEach(function(r){var v=String(s[r[0]]||"");
   if(r[0]==="position"&&file&&v.indexOf(file)>=0){var t=v.indexOf(" · «");v=t>=0?v.slice(t+3):""}
   if(v)from.push('<p class="ec-src"><span>'+esc(r[1])+'</span> — '+esc(v)+'</p>')});
  if(from.length)rows.push('<p class="ec-src-title">Откуда взято:</p>'+from.join(""));
  var checks=[];(e.reasons||[]).concat(e.check_note?String(e.check_note).split("; "):[]).forEach(function(r){var t=String(r).replace(/\s*—?\s*проверьте\.?/gi,"").trim();if(t&&checks.indexOf(t)<0)checks.push(t)});
  checks.forEach(function(t){rows.push('<p class="ec-check">Проверьте: '+esc(t)+'</p>')});
  var again=renewed(e);if(again)rows.push(again);
  if(!f&&!rows.length)return"";
  var warn=e.preliminary||f&&f[0]==="warn";
  return'<div class="ec-block ec-drawings'+(warn?" ec-warn":"")+'"><b>По чертежам</b>'+(f?'<p class="ec-found ec-'+(warn?"warn":f[0])+'">'+(warn?"⚠ ":f[0]==="ok"?"✓ ":"")+esc(f[1])+(e.preliminary&&f[0]==="ok"?" · предварительно":"")+'</p>':"")+rows.join("")+'</div>'
 }
 function coords(e){
  var rows=[];
  if(POINT[e.geometry]){rows.push(["Центр / низ","X "+fmt(e.x)+", Y "+fmt(e.y)+", Z "+fmt(e.z0)]);rows.push(["Верх","Z "+fmt(e.z2)])}
  else{rows.push(["Начало","X "+fmt(e.x)+", Y "+fmt(e.y)+", Z "+fmt(e.z0)]);if(e.geometry==="bent")rows.push(["Конёк","X "+fmt(e.mx)+", Y "+fmt(e.my)+", Z "+fmt(e.mz)]);rows.push(["Конец","X "+fmt(e.x2)+", Y "+fmt(e.y2)+", Z "+fmt(e.z2)])}
  if(e.r>0)rows.push(["Радиус",fmt(e.r)+(e.ri>0?", внутри "+fmt(e.ri):"")]);
  return'<details class="ec-coords"><summary>Точные координаты, мм</summary>'+rows.map(function(r){return'<div><span>'+esc(r[0])+'</span><b>'+esc(r[1])+'</b></div>'}).join("")+'</details>'
 }
 var api={made:made,FOUND:FOUND,esc:esc,fmt:fmt,level:level,axisOf:axisOf,position:position,fasteners:fasteners,traits:traits,section:section,head:head,facts:facts,nodes:nodes,tools:tools,parts:parts,bind:bind,kgs:kgs,sheetName:sheetName,drawings:drawings,coords:coords};
 root.irSchemeElementCard=api;
 if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
