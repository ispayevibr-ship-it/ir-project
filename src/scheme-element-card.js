"use strict";
/*
 * The card of the selected element in plain words (the engineer, 27.10.2026: «вот это описание элемента мне вообще не
 * нравится, толком ничего не понятно. переделай на основе чертежей»): what it is and what it does in the structure, its
 * section, where it stands — by the axes and levels as the drawings give them, its length or height — and what the
 * drawings say of it (the sheet, where each value was taken, what to check, what a new analysis gives after an edit
 * of the engineer). The exact coordinates are folded away. The same text in the montage scheme (src/scheme-page.js) and
 * in the exported HTML (src/scheme-export-html.js).
 *
 * e: {mark, name, type_name, group, geometry, profile, standard, section, status, status_label, x, y, x2, y2, z0, z2, mx, my,
 *     mz, r, ri, sw, ft, doc, src_section, instance_status, preliminary, reasons[], sources{}, pdf_new{}, check_note, manual}
 * grid: {axesX:[…], axesY:[…], posX:{axis: mm}, posY:{axis: mm}}
 */
(function(root){
 // What an element of each group does in the structure (by its geometry where the group has both).
 var ROLE={
  columns:"вертикальная несущая опора каркаса: держит балки, ригели и фермы и передаёт нагрузку на фундамент",
  fahwerk:{column:"стойка каркаса стены (фахверка): держит стеновые панели, окна и ворота между основными колоннами",
   beam:"горизонтальный элемент каркаса стены (фахверка): к нему крепятся стеновые панели, по нему — края окон и ворот"},
  posts:"вертикальная стойка: держит площадку, перекрытие или фахверк",
  beams:"горизонтальная несущая балка: держит настил, перекрытие или другие балки",
  crane:"подкрановый путь: по нему ходит мостовой кран или кран-балка",
  girders:"ригель — горизонтальная балка между колоннами: держит покрытие или перекрытие",
  purlins:"прогон — лежит поперёк ригелей или ферм, на него крепится кровля",
  spacers:"распорка — держит колонны или фермы на нужном расстоянии и не даёт им отклоняться",
  ties:"связь — делает каркас жёстким: держит его от ветра, торможения крана и раскачивания",
  trusses:"ферма — решётчатая балка покрытия, перекрывает большой пролёт",
  stairs:"лестница — подъём на площадки и отметки",
  platforms:"площадка — место прохода и обслуживания оборудования",
  guards:"ограждение — перила площадок и лестниц, защищает от падения",
  brackets:"кронштейн или опорный столик — выступ на колонне или стене, на него опирается балка или оборудование",
  embeds:"закладная деталь, анкер или база — крепит конструкцию к фундаменту",
  cladding:"ограждающая конструкция — стена или кровля здания",
  trims:"нащельник или доборный элемент — закрывает стыки и края обшивки",
  openings:"проём — ворота, дверь или окно",
  tanks:"стенка резервуара — пояс из вальцованных листов, сваренных встык; держит давление продукта",
  bottom:"днище резервуара — листы, сваренные на основании",
  roof:"крыша резервуара — каркас и настил покрытия",
  nozzles:"патрубок, люк или оборудование резервуара",
  rings:"кольцо жёсткости — держит круглую форму стенки",
  welds:"сварной шов соединения",
  fasteners:"метизы соединения — болты, гайки, шайбы",
  equipment:"технологическое оборудование",
  pipes:"трубопровод",
  supports:"опора трубопровода"
 };
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
 // The axes in the order of their coordinates.
 function sorted(axes,pos){return(axes||[]).filter(function(a){return has(pos&&pos[a])}).map(function(a){return{a:String(a),p:num(pos[a])}}).sort(function(x,y){return x.p-y.p})}
 // A point along a line of the grid by the axes around it: "на оси 3", "в 4 450 мм от оси 3 (4 550 мм до оси 4)".
 function between(axes,pos,v){
  var L=sorted(axes,pos);v=num(v);if(!L.length)return fmt(v)+" мм";
  for(var i=0;i<L.length;i++)if(Math.abs(v-L[i].p)<5)return"на оси "+L[i].a;
  if(v<L[0].p)return"в "+fmt(L[0].p-v)+" мм перед осью "+L[0].a;
  if(v>L[L.length-1].p)return"в "+fmt(v-L[L.length-1].p)+" мм за осью "+L[L.length-1].a;
  for(var j=0;j+1<L.length;j++)if(v>L[j].p&&v<L[j+1].p)return"в "+fmt(v-L[j].p)+" мм от оси "+L[j].a+" ("+fmt(L[j+1].p-v)+" мм до оси "+L[j+1].a+")";
  return fmt(v)+" мм"
 }
 // The axes a stretch lies between: "между осями 3 и 4".
 function range(axes,pos,a,b){
  var L=sorted(axes,pos),lo=Math.min(num(a),num(b)),hi=Math.max(num(a),num(b)),from=null,to=null;
  L.forEach(function(x){if(x.p<=lo+5)from=x;if(!to&&x.p>=hi-5)to=x});
  return from&&to&&from!==to?"между осями "+from.a+" и "+to.a:""
 }
 function ax(g,v){return axisOf(g.axesX,g.posX,v)}
 function ay(g,v){return axisOf(g.axesY,g.posY,v)}
 function point(g,x,y){var a=ax(g,x),b=ay(g,y);return a&&b?a+"/"+b:a||b||"("+fmt(x)+"; "+fmt(y)+")"}
 function length(e){
  if(e.geometry==="bent")return Math.hypot(num(e.mx)-num(e.x),num(e.my)-num(e.y),num(e.mz)-num(e.z0))+Math.hypot(num(e.x2)-num(e.mx),num(e.y2)-num(e.my),num(e.z2)-num(e.mz));
  return Math.hypot(num(e.x2)-num(e.x),num(e.y2)-num(e.y),num(e.z2)-num(e.z0))
 }
 var POINT={column:1,shell:1,plate:1};
 // Where it stands, in sentences.
 function place(e,g){
  g=g||{};var out=[],kind=e.geometry||"column",z0=num(e.z0),z2=num(e.z2),flat=Math.hypot(num(e.x2)-num(e.x),num(e.y2)-num(e.y));
  if(kind==="shell"){
   out.push((e.sw>0&&e.sw<360?"Дуга "+fmt(e.sw)+"°":"Кольцо")+(e.r>0?" радиусом "+fmt(e.r)+" мм":"")+(e.ri>0?" (внутри "+fmt(e.ri)+" мм)":"")+" с центром у осей "+point(g,e.x,e.y)+".");
   out.push("От отметки "+level(z0)+" до "+level(z2)+" — высота "+fmt(z2-z0)+" мм.");return out
  }
  if(kind==="plate"){
   out.push((e.r>0?"Круг радиусом "+fmt(e.r)+" мм":"Плоский элемент")+(e.ri>0?" с отверстием "+fmt(e.ri)+" мм":"")+" с центром у осей "+point(g,e.x,e.y)+", на отметке "+level(z0)+(Math.abs(z2-z0)>5?" … "+level(z2):"")+".");return out
  }
  if(POINT[kind]||flat<5&&kind!=="bent"){
   var a=ax(g,e.x),b=ay(g,e.y);
   out.push((e.ft?"Стоит у осей ":"Стоит на пересечении осей ")+(a&&b?a+" и "+b:a||b)+".");
   out.push("Низ на отметке "+level(z0)+", верх "+level(z2)+" — высота "+fmt(z2-z0)+" мм.");return out
  }
  if(kind==="bent"){
   out.push("Ломаная, с коньком: от осей "+point(g,e.x,e.y)+" на отметке "+level(z0)+" через конёк "+point(g,e.mx,e.my)+" на "+level(e.mz)+" до "+point(g,e.x2,e.y2)+" на "+level(z2)+".");
   out.push("Длина двух частей "+fmt(length(e))+" мм.");return out
  }
  var rise=Math.abs(z2-z0)>20,len=length(e);
  if(!rise){
   // Along a line of the grid: the line, the axes it lies between, where it starts and ends between them.
   var alongX=Math.abs(num(e.y2)-num(e.y))<5,alongY=!alongX&&Math.abs(num(e.x2)-num(e.x))<5;
   if(alongX||alongY){
    var axes=alongX?g.axesX:g.axesY,pos=alongX?g.posX:g.posY,a0=alongX?e.x:e.y,a1=alongX?e.x2:e.y2,span=range(axes,pos,a0,a1);
    out.push("Лежит горизонтально на отметке "+level(z0)+" по оси "+(alongX?ay(g,e.y):ax(g,e.x))+(span?", "+span:"")+".");
    out.push("Начало — "+between(axes,pos,a0)+", конец — "+between(axes,pos,a1)+". Длина "+fmt(len)+" мм.")
   }else{
    out.push("Лежит горизонтально на отметке "+level(z0)+", наискось в плане: от осей "+point(g,e.x,e.y)+" до "+point(g,e.x2,e.y2)+".");
    out.push("Длина "+fmt(len)+" мм.")
   }
  }else{
   out.push("Идёт наклонно: от осей "+point(g,e.x,e.y)+" на отметке "+level(z0)+" до "+point(g,e.x2,e.y2)+" на отметке "+level(z2)+".");
   out.push("Длина "+fmt(len)+" мм, перепад высоты "+fmt(Math.abs(z2-z0))+" мм.")
  }
  return out
 }
 function role(e){var r=ROLE[e.group];return r&&typeof r==="object"?r[e.geometry==="column"?"column":"beam"]:r||""}
 function section(e){
  var p=String(e.profile||"").trim(),s=String(e.section||"").trim();if(p==="—")p="";
  var low=function(v){return v.toLowerCase().replace(/ё/g,"е")};
  var both=p&&s&&low(p).indexOf(low(s))<0?p+" ("+low(s)+")":p||s;
  return both+(e.standard&&both.indexOf(e.standard)<0?", "+e.standard:"")
 }
 function head(e){
  var cls=e.status==="mounted"?"ec-ok":e.status==="partial"?"ec-partial":"ec-wait",sec=section(e);
  return'<div class="ec-head"><div><b class="ec-mark">'+esc(e.mark||"—")+'</b>'+(e.name?'<span class="ec-name">'+esc(e.name)+'</span>':"")+'</div>'+
   '<span class="ec-status '+cls+'"'+(e.status_title?' title="'+esc(e.status_title)+'"':"")+'>'+esc(e.status_label||"")+'</span></div>'+(sec?'<div class="ec-section">'+esc(sec)+'</div>':"")
 }
 function what(e){
  var r=role(e),t=String(e.type_name||"").trim(),other=t&&String(e.name||"").toLowerCase().indexOf(t.toLowerCase())<0;
  if(!r&&!other)return"";
  return'<div class="ec-block"><b>Что это</b>'+(r?'<p>'+esc((e.name||t||"Элемент")+" — "+r)+'.</p>':"")+(other?'<p class="ec-muted">Вид в программе: '+esc(t)+'.</p>':"")+'</div>'
 }
 function where(e,g){return'<div class="ec-block"><b>Где стоит</b>'+place(e,g).map(function(s){return'<p>'+esc(s)+'</p>'}).join("")+'</div>'}
 // What a new reading of the drawings gives for an element the engineer changed (his values stay).
 function renewed(e){
  var n=e.pdf_new;if(!n||typeof n!=="object")return"";
  var top=POINT[e.geometry]?n.z1:(n.end_z!=null?n.end_z:n.z1),d=[];
  if(n.mark&&String(n.mark).trim().toLowerCase()!==String(e.mark||"").trim().toLowerCase())d.push("марка "+n.mark);
  [["X",e.x,n.x],["Y",e.y,n.y]].forEach(function(r){if(has(r[2])&&Math.abs(num(r[1])-num(r[2]))>5)d.push(r[0]+" "+fmt(r[2])+" мм")});
  if(has(n.z0)&&Math.abs(num(e.z0)-num(n.z0))>5)d.push("низ "+level(n.z0));
  if(has(top)&&Math.abs(num(e.z2)-num(top))>5)d.push("верх "+level(top));
  return'<p>Вы меняли этот элемент — сохранены ваши значения. '+(d.length?"Повторный анализ чертежей даёт другое: "+esc(d.join(", "))+".":"Повторный анализ чертежей даёт то же самое.")+'</p>'
 }
 function drawings(e){
  var f=e.manual?["manual","Поставлен вручную, не из анализа чертежей"]:FOUND[e.instance_status]||null,rows=[];
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
 var api={ROLE:ROLE,FOUND:FOUND,esc:esc,fmt:fmt,level:level,axisOf:axisOf,between:between,range:range,place:place,role:role,section:section,head:head,what:what,where:where,drawings:drawings,coords:coords};
 root.irSchemeElementCard=api;
 if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
