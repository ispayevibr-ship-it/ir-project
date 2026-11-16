"use strict";
// The plan of floors and finishes of АР (ИР-71535 АР ч.2 л.19 «План типов полов и внутренней отделки стен и перегородок»,
// the engineer 16.11.2026: «Пропустил много»): the tables beside the plan and the signs on it, every label of them read.
//  - «Экспликация полов»: rows of the rooms, the type of the floor, the scheme (its level, the references «см. КЖ-40, 41»),
//    the layers «1. Плитка … — 9 мм.», «5. Монолитная плита … — см. КЖ», the area «22,8» or a note «(площади цветового
//    покрытия см. ниже)»;
//  - «Условные обозначения и площади покрытия по цветам»: a colour «RAL 3020 - красный, площадь покрытия 651,63 м2», a
//    stripe «(с красными полосами шириной 5 см, с шагом 600 мм)», and the signs of the plan — the type of the floor in a
//    triangle, the type of the finish of a wall in a rhombus «3 / > 2,1»;
//  - «Ведомость отделки помещений»: the rooms, the ceiling (its type, a reference, a text «Существующие сэндвич панели …»),
//    the walls and partitions — type and area or reference by line —, the note «см. п.п. 1, 2, 4»;
//  - «Виды отделки помещений»: «3а - Улучшенная штукатурка … Общая площадь отделки = 947,42 м2 (Код АГСК …)»;
//  - on the plan: the number of a room in a circle, the type of its floor in a triangle, its level in a frame — each room
//    takes the floor type and the level nearest it (a level of the floor, «Ур.ч.п.»), the rhombi of the finishes of its
//    walls.
// Points of the sheet; null — no such plan on the sheet.
const LEVEL=/^([+\-−±]?\d{1,2}[,.]\d{3})$/u;
const num=s=>Number(String(s).replace(/\s/gu,"").replace(",","."));
const box=t=>{const s=t.size||8;return{x0:t.x,x1:t.x+(t.width||s*String(t.str).length*.5),y0:t.y-s*.75,y1:t.y,cx:t.x+(t.width||0)/2,cy:t.y-s*.36}};
const flat=t=>Math.abs(Math.round(t.angle||0))<10;
// Horizontal and vertical lines of the sheet.
function linesOf(segments){
 const H=[],V=[];
 for(const s of segments){const dx=Math.abs(s.a.x-s.b.x),dy=Math.abs(s.a.y-s.b.y);
  if(dy<=.3&&dx>=3)H.push({y:(s.a.y+s.b.y)/2,x0:Math.min(s.a.x,s.b.x),x1:Math.max(s.a.x,s.b.x)});
  else if(dx<=.3&&dy>=3)V.push({x:(s.a.x+s.b.x)/2,y0:Math.min(s.a.y,s.b.y),y1:Math.max(s.a.y,s.b.y)})}
 return{H,V}
}
// A table under its title: the top line under it, its width; its bottom where its left side ends; the columns by the lines
// down through its head; the texts inside.
function gridTable(title,texts,L){
 const tb=box(title),top=L.H.filter(h=>h.y>tb.y1-2&&h.y<tb.y1+70&&h.x1-h.x0>=200&&h.x0<=tb.cx&&h.x1>=tb.cx).sort((a,b)=>a.y-b.y)[0];if(!top)return null;
 const X0=top.x0,X1=top.x1;
 const left=L.V.filter(v=>Math.abs(v.x-X0)<=1.5&&v.y0<=top.y+2&&v.y1>top.y+20);if(!left.length)return null;
 let Y1=Math.max(...left.map(v=>v.y1));for(let k=0;k<20;k++){const n=L.V.filter(v=>Math.abs(v.x-X0)<=1.5&&v.y0<=Y1+1&&v.y1>Y1+1);if(!n.length)break;Y1=Math.max(...n.map(v=>v.y1))}
 const span=L.H.filter(h=>h.x0<=X0+3&&h.x1>=X1-3&&h.y>=top.y-.5&&h.y<=Y1+.5).map(h=>h.y).sort((a,b)=>a-b),ys=[];for(const y of span)if(!ys.length||y-ys[ys.length-1]>1)ys.push(y);
 const hy=(ys[1]||top.y+40),cols=[...new Set(L.V.filter(v=>v.x>X0+3&&v.x<X1-3&&v.y0<=hy+2&&v.y1>=hy+10).map(v=>Math.round(v.x)))].sort((a,b)=>a-b),xs=[X0,...cols.filter((x,i,a)=>!i||x-a[i-1]>2),X1];
 const inside=texts.filter(t=>{const b=box(t);return b.cx>X0&&b.cx<X1&&b.cy>top.y&&b.cy<Y1});
 return{box:{x0:X0,y0:top.y,x1:X1,y1:Y1},rows:ys,cols:xs,texts:inside,L}
}
const colOf=(T,t)=>{const b=box(t);let k=0;for(let i=0;i+1<T.cols.length;i++)if(b.cx>=T.cols[i]&&b.cx<T.cols[i+1]){k=i;break}return k};
// The column of each head word (the first band of the table, or two).
function heads(T,words){
 const headY=T.rows.length>1?T.rows[1]:T.box.y0+40,out={};
 for(const [key,re] of Object.entries(words)){const ts=T.texts.filter(t=>box(t).cy<headY&&re.test(String(t.str)));if(ts.length)out[key]=ts.map(t=>colOf(T,t))}
 return{headY,cols:out}
}
// Rows by the texts of the key column: lines across the key column where drawn; a band with several keys split at each key.
function rowsBy(T,keyCol,headY,top=false){
 const keys=T.texts.filter(t=>colOf(T,t)===keyCol&&box(t).cy>headY).sort((a,b)=>a.y-b.y);if(!keys.length)return[];
 // (a name over lines: a key line 14 pt and less under the one over it, not a number — «Коридор / существующего / цеха»)
 const starts=[];for(const t of keys){const p=starts.length?starts[starts.length-1]:null;
  if(p&&t.y-p.last.y<=14&&!/^\d/u.test(String(t.str).trim())&&!/^\d/u.test(String(p.last.str).trim()))p.last=t,p.list.push(t);else starts.push({first:t,last:t,list:[t]})}
 const cross=T.L.H.filter(h=>h.x0<=T.cols[keyCol]+2&&h.x1>=T.cols[keyCol+1]-2&&h.y>headY+1&&h.y<T.box.y1-1).map(h=>h.y).sort((a,b)=>a-b);
 const bands=[];let prev=headY;for(const y of [...cross,T.box.y1]){if(y-prev>3)bands.push([prev,y]);prev=y}
 const out=[];
 for(const [a,b] of bands){const own=starts.filter(s=>box(s.first).cy>a&&box(s.first).cy<b);if(!own.length)continue;
  if(own.length===1||!top){if(own.length===1){out.push({y0:a,y1:b,key:own[0]});continue}}
  // (several in one band: each from its first line — a key standing at the top of its row)
  own.forEach((s,i)=>out.push({y0:i?s.first.y-(s.first.size||10)*.9:a,y1:i+1<own.length?own[i+1].first.y-(own[i+1].first.size||10)*.9:b,key:s}))}
 return out
}
const lineText=list=>{const ls=[];for(const t of [...list].sort((a,b)=>a.y-b.y||a.x-b.x)){const l=ls.find(l=>Math.abs(l.y-t.y)<=3);if(l)l.items.push(t);else ls.push({y:t.y,items:[t]})}
 return ls.map(l=>l.items.sort((a,b)=>a.x-b.x).map(t=>String(t.str).trim()).join(" ").replace(/\s+/gu," ").trim())};
const REF=/см\s*\.?\s*(?:л(?:ист)?\.?\s*)?(?:КМД?|АР|ТХ|КЖ\d?|АС|ОВ|ВК|ЭМ)\s?[\d\-.,\s…]*/iu;
const rooms=s=>{const out=[];for(const part of String(s).split(/,\s*/u)){const r=/^(\d{1,3})\s*(?:\.\s?\.\s?\.|…)\s*(\d{1,3})$/u.exec(part.trim());if(r){for(let n=Number(r[1]);n<=Number(r[2])&&n-Number(r[1])<200;n++)out.push(String(n))}else if(/^\d{1,3}[а-я]?$/u.test(part.trim()))out.push(part.trim())}return out};
// «Экспликация полов».
function explication(texts,L){
 const title=texts.find(t=>/^\s*Экспликация\s+полов\s*$/iu.test(String(t.str)));if(!title)return null;
 const T=gridTable(title,texts,L);if(!T)return null;
 const {headY,cols}=heads(T,{rooms:/помещени|^№$/iu,type:/Тип\s+пола/iu,scheme:/Схема\s+пола/iu,data:/Данные|элементов\s+пола/iu,area:/Площадь/iu});
 const C=k=>(cols[k]||[])[0];if(C("type")===undefined||C("data")===undefined)return null;
 const out=[],rest=[];
 for(const r of rowsBy(T,C("type"),headY)){
  const own=T.texts.filter(t=>{const c=box(t).cy;return c>r.y0&&c<r.y1}),by=k=>own.filter(t=>colOf(T,t)===C(k));
  const row={type:String(r.key.first.str).trim(),rooms:[],levels:[],refs:[],layers:[]};
  const rm=lineText(by("rooms")).join(" ").trim();if(rm){row.rooms_text=rm;row.rooms=rooms(rm)}
  for(const t of by("scheme")){const s=String(t.str).trim();if(LEVEL.test(s))row.levels.push(s);else if(REF.test(s))row.refs.push(s);else if(/^Перемен/iu.test(s))row.level_note=s;else if(/^Ур\./u.test(s))row.level_of=s;else if(/^\d{1,2}(?:\s*[а-я])?(?:\s+\d{1,2}\s*[а-я]?)*$/u.test(s))(row.callouts=row.callouts||[]).push(s);else rest.push(s)}
  // (the layers: «N.» starts one — written apart or with its words —, the lines under it are its words, its thickness at
  //  the right side of the column «- 9 мм.», «- см. КЖ»)
  const data=by("data").sort((a,b)=>a.y-b.y||a.x-b.x),cx=T.cols[C("data")+1]||T.box.x1,right=cx-(cx-T.cols[C("data")])*.12;
  let cur=null;const words=[];
  for(const t of data){const s=String(t.str).trim(),b=box(t);
   const th=/^-\s*(\d+(?:[,.]\d+)?)\s*мм\s*\.?$/u.exec(s)||/^-?\s*(см\s*\.?\s*.+)$/u.exec(s);
   if(th&&b.x0>=right-40){const host=[...row.layers].reverse().find(l=>l.y<=t.y+4)||cur;if(host){if(/^\d/u.test(th[1]))host.thick_mm=num(th[1]);else host.ref=th[1].replace(/\s+/gu," ").trim()}else rest.push(s);continue}
   const m=/^(\d{1,2}\s?[а-я]?)\s?\.\s*(.*)$/u.exec(s);
   if(m){cur={n:m[1].replace(/\s/gu,""),name:m[2],y:t.y};row.layers.push(cur);continue}
   if(cur&&t.y-cur.y<=40&&row.layers.length){const host=[...row.layers].reverse().find(l=>l.y<=t.y+3)||cur;host.name=(host.name+" "+s).trim();host.y=Math.max(host.y,t.y);continue}
   words.push(s)}
  if(words.length){const w=words.join(" ");if(row.layers.length)row.layers[row.layers.length-1].name=(row.layers[row.layers.length-1].name+" "+w).trim();else row.name=w}
  for(const l of row.layers){l.name=l.name.replace(/\s+/gu," ").replace(/\s+([,.;)])/gu,"$1").trim();delete l.y}
  const ar=by("area"),at=lineText(ar).join(" ");const a=REF.test(at)?null:/(\d{1,3}(?:\s?\d{3})*[,.]\d{1,2})/u.exec(at);
  if(a)row.area_m2=num(a[1]);const note=at.replace(a?a[1]:"\u0000","").trim();if(note)row.area_note=note;
  if(!row.rooms.length)delete row.rooms;if(!row.levels.length)delete row.levels;if(!row.refs.length)delete row.refs;if(!row.layers.length)delete row.layers;
  out.push(row)}
 return{box:T.box,rows:out,...(rest.length?{rest}:{})}
}
// «Ведомость отделки помещений».
function finishSchedule(texts,L){
 const title=texts.find(t=>/^\s*Ведомость\s+отделки\s+помещений\s*$/iu.test(String(t.str)));if(!title)return null;
 const T=gridTable(title,texts,L);if(!T)return null;
 const {headY,cols}=heads(T,{rooms:/Наименование|номер\s+помещ/iu,ceiling:/Потолок/iu,walls:/Стены|перегородки/iu,area:/^Площадь$/iu,note:/Примечание/iu});
 if(cols.rooms===undefined)return null;
 const areaCols=(cols.area||[]).slice().sort((a,b)=>a-b),cCol=(cols.ceiling||[])[0],wCol=(cols.walls||[])[0],nCol=(cols.note||[])[0];
 // (the ceiling's area — the column after the ceiling; the walls' — after the walls)
 const cArea=areaCols.find(c=>c>cCol&&c<wCol),wArea=areaCols.find(c=>c>wCol);
 const out=[];
 for(const r of rowsBy(T,cols.rooms[0],headY,true)){
  const own=T.texts.filter(t=>{const c=box(t).cy;return c>r.y0&&c<r.y1});
  const row={rooms_text:lineText(own.filter(t=>colOf(T,t)===cols.rooms[0])).join(" ")};const rr=rooms(row.rooms_text);if(rr.length)row.rooms=rr;else row.name=row.rooms_text;
  const ce=lineText(own.filter(t=>colOf(T,t)===cCol)).join(" "),ca=lineText(own.filter(t=>colOf(T,t)===cArea)).join(" ");
  row.ceiling={...(/^\d{1,2}[а-я]?$/u.test(ce)?{type:ce}:ce?{text:ce}:{}),...(ca?REF.test(ca)?{ref:ca}:/^\d/u.test(ca)?{area_m2:num(ca)}:{text:ca}:{})};
  // (the walls by lines: the type, its area or reference on its line)
  const ws=own.filter(t=>colOf(T,t)===wCol),wa=own.filter(t=>colOf(T,t)===wArea);row.walls=[];
  for(const t of ws.sort((a,b)=>a.y-b.y)){const s=String(t.str).trim(),a=wa.find(q=>Math.abs(q.y-t.y)<=4),v=a?String(a.str).trim():"";
   row.walls.push({...(/^\d{1,2}[а-я]?$/u.test(s)?{type:s}:{text:s}),...(v?REF.test(v)?{ref:v}:/^\d/u.test(v)?{area_m2:num(v)}:{text:v}:{})})}
  for(const a of wa)if(!ws.some(t=>Math.abs(t.y-a.y)<=4))row.walls.push({ref:String(a.str).trim()});
  const nt=lineText(own.filter(t=>colOf(T,t)===nCol)).join(" ");if(nt)row.note=nt;
  out.push(row)}
 return{box:T.box,rows:out}
}
// A list under its title: lines from «-» or «N -» on, the lines after one its own, up to the next title (larger text) or a gap.
function listUnder(title,texts,start,L,x1=Infinity){
 // (its left side — that of the tables over and under it in the column of the sheet; else 100 pt left of its title)
 const tb=box(title),big=(title.size||12)*.85,cols=(L?.H||[]).filter(h=>h.x1-h.x0>=200&&h.x0>=tb.x0-320&&h.x0<=tb.x0&&Math.abs(h.y-tb.cy)<=900),x0=cols.length?Math.min(...cols.map(h=>h.x0))-30:tb.x0-100;
 const items=texts.filter(t=>flat(t)&&t.y>tb.y1+2&&t.x>=x0&&t.x<=x1).sort((a,b)=>a.y-b.y||a.x-b.x),lines=[];
 for(const t of items){if((t.size||8)>=big&&t!==title)break;const l=lines.find(l=>Math.abs(l.y-t.y)<=3);if(l)l.items.push(t);else{if(lines.length&&t.y-lines[lines.length-1].y>60)break;lines.push({y:t.y,items:[t]})}}
 const out=[];
 for(const l of lines){const s=l.items.sort((a,b)=>a.x-b.x).map(t=>String(t.str).trim()).join(" ").replace(/\s+/gu," ").trim();
  if(start.test(s)||!out.length)out.push({text:s,y:l.y,x:l.items[0].x,items:l.items.slice()});else{const o=out[out.length-1];o.text=(o.text+" "+s).trim();o.items.push(...l.items)}}
 return out
}
// «Условные обозначения и площади покрытия по цветам».
function colourLegend(texts,L){
 const title=texts.find(t=>/Условные\s+обозначения\s+и\s+площади\s+покрыти/iu.test(String(t.str)));if(!title)return null;
 const items=listUnder(title,texts,/^(?:-|\d|[<>])/u,L),colours=[],signs=[];
 for(const it of items){const s=it.text.replace(/\s+,/gu,",");const ral=/RAL\s?(\d{4})/iu.exec(s),a=/площадь\s+покрытия\s+(\d[\d\s]*[,.]\s?\d+)\s*м/iu.exec(s);
  const stripe=/\(\s*(с\s+[^)]*полос[^)]*)\)/iu.exec(s);
  if(a||ral){colours.push({...(ral?{ral:ral[1]}:{}),name:(s.replace(/^-\s*/u,"").split(/,/u)[0].replace(/RAL\s?\d{4}\s*-?\s*/iu,"").trim()),...(a?{area_m2:num(a[1])}:{}),...(stripe?{stripe:stripe[1].replace(/\s+/gu," ")}:{}),text:s});continue}
  if(/тип\s+пола/iu.test(s))signs.push({kind:"floor_type",text:s.replace(/^[\d\s]*-\s*/u,"")});
  else if(/тип\s+отделки/iu.test(s))signs.push({kind:"finish",text:s.replace(/^[\d\s<>,.\-]*-\s*/u,"")});
  else signs.push({kind:"other",text:s})}
 const ys=items.flatMap(i=>i.items.map(t=>t.y)),xs=items.flatMap(i=>i.items.map(t=>t.x));
 return{colours,signs,box:{x0:Math.min(...xs)-60,y0:box(title).y0,x1:Math.max(...items.flatMap(i=>i.items.map(t=>box(t).x1)),box(title).x1)+5,y1:Math.max(...ys,box(title).y1)+8}}
}
// «Виды отделки помещений» (and «Примечания по ведомости отделки помещений» — its notes by number).
function finishKinds(texts,L){
 const title=texts.find(t=>/^\s*Виды\s+отделки\s+помещений\s*:?\s*$/iu.test(String(t.str)));if(!title)return null;
 const items=listUnder(title,texts,/^\d{1,2}\s?[а-я]?\s*-\s/u,L),kinds=[];
 for(const it of items){const m=/^(\d{1,2}\s?[а-я]?)\s*-\s*(.*)$/u.exec(it.text);if(!m)continue;const s=m[2];
  const a=/Общая\s+площадь\s+отделки\s*[=\-]\s*(\d[\d\s]*[,.]\s?\d+)\s*м/iu.exec(s),code=/Код\s+АГСК\s+([\d\-]+)/iu.exec(s),mass=/Масса\s*-?\s*(\d[\d\s]*[,.]\d+)\s*кг/iu.exec(s),h=/на\s+высоту\s+(\d+[,.]\d+)\s*м/iu.exec(s),ref=/Расход\s+см\s*\.?\s*лист\s+(.+?)\s*\.?$/iu.exec(s);
  kinds.push({type:m[1].replace(/\s/gu,""),text:s.replace(/\s+/gu," ").trim(),...(a?{area_m2:num(a[1])}:{}),...(code?{code:code[1]}:{}),...(mass?{mass_kg:num(mass[1])}:{}),...(h?{height_m:num(h[1])}:{}),...(ref?{ref:ref[1].trim()}:{})})}
 const all=items.flatMap(i=>i.items);
 return kinds.length?{kinds,box:{x0:Math.min(...all.map(t=>t.x))-5,y0:box(title).y0,x1:Math.max(...all.map(t=>box(t).x1))+5,y1:Math.max(...all.map(t=>t.y))+5}}:null
}
// The signs on the plan: a number in a triangle (the floor type), in a rhombus (a finish «3 / > 2,1»), in a small circle (a
// room), a level in a frame (the floor of the room).
function planSigns(texts,segments,inPlan){
 const near=(c,r)=>segments.filter(s=>Math.min(s.a.x,s.b.x)<c.x+r&&Math.max(s.a.x,s.b.x)>c.x-r&&Math.min(s.a.y,s.b.y)<c.y+r&&Math.max(s.a.y,s.b.y)>c.y-r);
 const slant=s=>{const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y;return Math.abs(dx)>.5&&Math.abs(dy)>.5?dy/dx:null};
 const signs=[];
 for(const t of texts){if(!flat(t))continue;const s=String(t.str).trim(),b=box(t),c={x:b.cx,y:b.cy};if(!inPlan(c))continue;
  if(/^\d{1,2}[а-яa-z]?$/u.test(s)){
   const ns=near(c,18);
   // a base under the number across it; slanted sides from it meeting over the number — a triangle (the floor type); the
   // same sides going on under the base, meeting under it — a rhombus split by the base (the finish over its height)
   const base=ns.filter(q=>Math.abs(q.a.y-q.b.y)<.3&&q.a.y>=b.y1-1.5&&q.a.y<=b.y1+6&&Math.min(q.a.x,q.b.x)<c.x-2&&Math.max(q.a.x,q.b.x)>c.x+2).sort((p,q)=>p.a.y-q.a.y)[0];
   if(base){const y=base.a.y,x0=Math.min(base.a.x,base.b.x)-.8,x1=Math.max(base.a.x,base.b.x)+.8,on=q=>Math.min(q.a.x,q.b.x)>=x0&&Math.max(q.a.x,q.b.x)<=x1;
    const sl=ns.filter(q=>slant(q)!==null&&on(q)&&Math.abs(Math.abs(slant(q))-1.4)<1.1);
    const up=sl.filter(q=>Math.max(q.a.y,q.b.y)<=y+.8&&Math.min(q.a.y,q.b.y)<b.y0+1),dn=sl.filter(q=>Math.min(q.a.y,q.b.y)>=y-.8&&Math.max(q.a.y,q.b.y)>y+4);
    const pos=a=>a.some(q=>slant(q)>0),neg=a=>a.some(q=>slant(q)<0);
    if(pos(up)&&neg(up)&&pos(dn)&&neg(dn)){const bot=Math.max(...dn.flatMap(q=>[q.a.y,q.b.y]));signs.push({kind:"finish",type:s,x:Math.round(c.x),y:Math.round(c.y),box:{x0,x1,y0:b.y0,y1:bot},t});continue}
    if(pos(up)&&neg(up)){signs.push({kind:"floor_type",type:s,x:Math.round(c.x),y:Math.round(c.y),t});continue}}
  }
  if(LEVEL.test(s)){const ns=near(c,40),fr=ns.filter(q=>Math.abs(q.a.y-q.b.y)<.3&&Math.min(q.a.x,q.b.x)<=b.x0+1&&Math.max(q.a.x,q.b.x)>=b.x1-1&&Math.abs(q.a.y-c.y)<=12);
   const mm=Math.round(Number(s.replace(/[−–]/gu,"-").replace(/[^\d,.\-+]/gu,"").replace(",","."))*1000);signs.push({kind:"level",level:s,...(Number.isFinite(mm)?{level_mm:mm}:{}),framed:fr.length>=2,x:Math.round(c.x),y:Math.round(c.y),t})}}
 // (the height of a finish under its rhombus «> 2,1», «< 3,6», «-» — the denominator of the sign)
 for(const s of signs.filter(q=>q.kind==="finish")){const d=texts.find(t=>t!==s.t&&flat(t)&&box(t).cx>s.box.x0&&box(t).cx<s.box.x1&&box(t).cy>s.y+2&&box(t).cy<s.box.y1&&/^(?:[<>]\s?\d+[,.]\d|-|\d+[,.]\d)$/u.test(String(t.str).trim()));if(d){s.height=String(d.str).trim();s.ht=d}}
 return signs
}
function floorPlan(geometry,axes){
 const texts=(geometry?.texts||[]),segments=geometry?.segments||[];
 if(!texts.some(t=>/^\s*План\s+(?:типов\s+)?пол(?:ов|а)(?:\s|$)/iu.test(String(t.str))))return null;
 const L=linesOf(segments),ex=explication(texts,L),fs=finishSchedule(texts,L),lg=colourLegend(texts,L),fk=finishKinds(texts,L);
 // (the plan: its axes widened by a quarter each way — the rooms by the existing building beyond the axes —, short of the
 //  tables beside it)
 let inPlan=null,bubbles=[];
 if(axes){const xs=axes.rows.flatMap(r=>r.items.map(i=>i.pt)),ys=axes.cols.flatMap(c=>c.items.map(i=>i.pt));
  if(xs.length>=2&&ys.length>=2){const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),dx=(x1-x0)*.25,dy=(y1-y0)*.25;
   const tl=Math.min(...[ex,fs,lg,fk].filter(Boolean).map(q=>q.box.x0).filter(x=>x>x1),Infinity);
   const B={x0:x0-dx,x1:Math.min(x1+dx,tl-15),y0:y0-dy,y1:y1+dy};inPlan=c=>c.x>=B.x0&&c.x<=B.x1&&c.y>=B.y0&&c.y<=B.y1;
   // (a number in a circle smaller than the axes' and not an axis of the plan where its line runs — a room)
   const E=require("./ai-scheme-extract"),idx=E.buildIndex(segments),all=[];
   for(const t of texts){if(!/^\d{1,3}[а-я]?$/u.test(String(t.str).trim()))continue;let b=null;try{b=E.findBubble(t,segments,idx)}catch{}if(b)all.push({...b,t})}
   const axisR=Math.max(0,...texts.filter(t=>/^[А-ЯЁ]$/u.test(String(t.str).trim())).map(t=>{try{return E.findBubble(t,segments,idx)?.r||0}catch{return 0}}));
   const onAxis=b=>axes.rows.some(r=>r.items.some(i=>i.name===b.name&&Math.abs(i.pt-b.x)<=3))||axes.cols.some(c=>c.items.some(i=>i.name===b.name&&Math.abs(i.pt-b.y)<=3));
   bubbles=all.filter(b=>inPlan(b)&&(!axisR||b.r<=axisR*.85)&&!onAxis(b))}}
 const signs=inPlan?planSigns(texts,segments,inPlan):[];
 // (the rooms: the numbers in the small circles on the plan — not the axes —, each with the floor type, the level and the
 //  finishes nearest it, 6 m round at most)
 const rooms=[],R=200;
 for(const b of bubbles){if(!inPlan||!inPlan(b))continue;const d=q=>Math.hypot(q.x-b.x,q.y-b.y);
  const ft=signs.filter(q=>q.kind==="floor_type"&&d(q)<=R).sort((p,q)=>d(p)-d(q))[0],lv=signs.filter(q=>q.kind==="level"&&d(q)<=R).sort((p,q)=>(q.framed-p.framed)||d(p)-d(q))[0];
  const room={n:b.name,x:Math.round(b.x),y:Math.round(b.y),...(ft?{floor_type:ft.type}:{}),...(lv?{level:lv.level,level_mm:lv.level_mm}:{})};
  const e=(ex?.rows||[]).find(r=>(r.rooms||[]).includes(b.name)&&(!ft||r.type===ft.type))||(ex?.rows||[]).find(r=>(r.rooms||[]).includes(b.name));if(e&&!room.floor_type)room.floor_type=e.type;
  const f=(fs?.rows||[]).find(r=>(r.rooms||[]).includes(b.name));if(f)room.finish={ceiling:f.ceiling,walls:f.walls};
  rooms.push(room)}
 // (every sign: the floor type and level of the nearest room, or of the zone of the floor it stands in)
 // (the slopes of the floor to its trays and pits — «i=5%», «i=0,066%», «i=0,01» as a fraction, 1 %)
 const slopes=[];for(const t of texts){const m=/^i\s*=\s*(\d+(?:[,.]\d+)?)\s*(%?)$/u.exec(String(t.str).trim());if(!m)continue;const c={x:box(t).cx,y:box(t).cy};if(inPlan&&!inPlan(c))continue;
  const v=Number(m[1].replace(",","."));slopes.push({text:String(t.str).trim(),percent:m[2]?v:Math.round(v*1e4)/100,x:Math.round(c.x),y:Math.round(c.y)})}
 const out={...(ex?{explication:ex}:{}),...(fs?{finishSchedule:fs}:{}),...(lg?{colourLegend:lg}:{}),...(fk?{finishKinds:fk}:{}),
  ...(rooms.length?{rooms}:{}),...(slopes.length?{slopes}:{}),signs:signs.map(({t,ht,...s})=>s)};
 Object.defineProperty(out,"_texts",{value:new Set([...signs.map(s=>s.t),...signs.map(s=>s.ht).filter(Boolean),...bubbles.map(b=>b.t)]),enumerable:false});
 return out
}
module.exports={floorPlan,gridTable,explication,finishSchedule,colourLegend,finishKinds,planSigns,linesOf};
