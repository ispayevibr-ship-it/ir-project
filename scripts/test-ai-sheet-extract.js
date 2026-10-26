"use strict";
/* Assembly views, "Требуется" and КМ element tables are read from the text layer; КМ and КМД marks stay apart. */
const assert=require("node:assert/strict");
const {extractSheet,titleMarks,levelMm,specTable,normProfile}=require("../src/ai-sheet-extract");
const {buildCatalog,buildPlan}=require("../src/ai-montage-plan");
const T=(str,x,y,size=15,angle=0,width=str.length*size*0.5)=>({str,x,y,size,angle,width});
assert.deepEqual(titleMarks("Ф4, Ф5 (обр. Ф4)"),["Ф4","Ф5"]);
assert.deepEqual(titleMarks("К1, К2 (обратно К1)"),["К1","К2"]);
assert.equal(titleMarks("Вид А"),null);assert.equal(titleMarks("С245"),null,"steel grade is not a mark");
assert.deepEqual([levelMm("+4,144"),levelMm("-0,400"),levelMm("0,000"),levelMm("4144")],[4144,-400,0,null]);
// A КМД assembly sheet: two column views with levels, a beam view, a "Требуется" table and the stamp.
const W=2384,H=1684;
const assembly=extractSheet({widthPt:W,heightPt:H,texts:[
 T("Ф3",290,58,31),T("+4,144",360,96),T("+2,510",446,599),T("-0,400",441,1424),T("4544",420,700,15,90),T("130",300,1500),
 T("Ф4, Ф5 (обр. Ф4)",1085,58,31),T("+4,144",1219,96),T("-0,400",1316,1424),
 T("К3",1700,1100,31),T("4760",1720,1300),T("1200",1800,1250),
 T("Требуется",1953,846,22),T("Марка",1895,874,22),T("Кол.",1950,874,22),T("Масса, кг",2001,865,22),T("марки",1985,882,22),T("всех",2044,882,22),
 T("Ф3",1911,901),T("2",1955,901),T("343",1990,901),T("686",2044,901),
 T("Ф4",1911,923),T("3",1955,923),T("381",1990,923),T("1143",2044,923),T("Всего",1941,946,22),
 T("041-2025 КМД (по ПК-05/25-1-КМ1-1)",2086,1536,22),T("Стойка бокса",2078,1646,22),T("Ф3, Ф4, Ф5",2063,1665,22)]});
assert.equal(assembly.stamp.code,"041-2025 КМД (по ПК-05/25-1-КМ1-1)");
assert.equal(assembly.stamp.name,"Стойка бокса · Ф3, Ф4, Ф5");
const view=t=>assembly.views.find(v=>v.title===t);
assert.deepEqual([view("Ф3").z0_mm,view("Ф3").z1_mm],[-400,4144]);
assert.deepEqual(view("Ф4, Ф5 (обр. Ф4)").marks,["Ф4","Ф5"]);
assert.deepEqual([view("К3").z0_mm,view("К3").length_mm],[null,4760],"a beam view has a length but no levels");
assert(!assembly.views.some(v=>v.marks.includes("Ф3")&&v.title!=="Ф3"),"stamp text is not a view title");
assert.deepEqual(assembly.required,[{mark:"Ф3",count:2,mass_kg:343},{mark:"Ф4",count:3,mass_kg:381}]);
// A КМ element list: profile symbol and size are separate text items.
const km=extractSheet({widthPt:1684,heightPt:2384,texts:[T("Ведомость элементов",256,39,22),
 T("Ф3",81,120),T("ｴ",258,120),T("50Ш2",263,120),T("C345-3",494,120),
 T("ВС1",79,345),T("Гн.□200х10",251,345),T("C345-3",494,345),T("С245",815,105)]});
assert.deepEqual(km.elements,[{mark:"Ф3",profile:"I50Ш2",steel:"C345-3"},{mark:"ВС1",profile:"Гн.□200х10",steel:"C345-3"}]);
// The catalog keeps КМ "Ф3" and КМД "Ф3" apart; КМД levels and quantities feed the plan.
const scheme={title:"Схема расположения стоек",axesX:["1","2"],axesY:["А","Б"],spansX:[6000],spansY:[6000],
 placements:[{mark:"Ф3",geometry_type:"column",x_mm:0,y_mm:0,confidence:"high",notes:[]},{mark:"Ф9",geometry_type:"column",x_mm:6000,y_mm:0,confidence:"high",notes:[]}]};
const draft={pages:[
 {page:1,docType:"КМД монтажные",sourceName:"mount.pdf",schemes:[scheme]},
 {page:2,docType:"КМД сборочные",sourceName:"asm.pdf",schemes:[{...scheme,title:"Узел, похожий на сетку"}],sheet:assembly},
 {page:3,docType:"КМ",sourceName:"km.pdf",schemes:[{...scheme,title:"КМ план"}],sheet:km}]};
const catalog=buildCatalog(draft,{marks:[{mark:"Ф9",doc:"КМД",profile:"Гн.□140х4",length_mm:4544,count:4,mass_kg:120,has_levels:true,z0_mm:-400,z1_mm:4100,sheet:"",note:""}]});
assert.equal(catalog.get("КМД|ф3").profile,"","КМ profile is not given to the КМД mark");
assert.equal(catalog.get("КМ|ф3").profile,"I50Ш2");
assert.deepEqual([catalog.get("КМД|ф3").z0_mm,catalog.get("КМД|ф3").z1_mm,catalog.get("КМД|ф3").count,catalog.get("КМД|ф3").levelsFrom],[-400,4144,2,"PDF"]);
assert.deepEqual([catalog.get("КМД|ф9").z1_mm,catalog.get("КМД|ф9").profile,catalog.get("КМД|ф9").levelsFrom],[4100,"Гн.□140х4","Claude"]);
const plan=buildPlan(draft,{schemes:[],marks:[{mark:"Ф9",doc:"КМД",profile:"Гн.□140х4",length_mm:4544,count:4,mass_kg:120,has_levels:true,z0_mm:-400,z1_mm:4100,sheet:"",note:""}]},{});
assert.equal(plan.schemes.find(s=>s.page===3).place,false,"КМ plans are reference only when КМД mounting schemes exist");
assert.deepEqual(plan.elements.map(e=>[e.mark,e.z0_mm,e.z1_mm,e.profile,e.levels]),[["Ф3",-400,4144,"","чертёж марки (PDF)"],["Ф9",-400,4100,"Гн.□140х4","чертёж марки (Claude)"]]);
assert.equal(plan.ready,true,"elements with levels from their drawings are placed without scheme levels");
assert(!plan.schemes.some(s=>s.page===2),"assembly drawings never provide placements");
// The bottom level drawn by another view: the top minus the length matches a level elsewhere on the sheet.
{
 const s=extractSheet({widthPt:W,heightPt:H,texts:[T("К77",600,30,22),T("+9,975",460,60),T("+9,865",600,100,11),T("10375",700,1000,11),T("-0,400",80,2190),
  ...Array.from({length:30},(_,i)=>T(String(100+i),1500,300+i*20,11))]});
 assert.deepEqual([s.views[0].z0_mm,s.views[0].z1_mm],[-400,9975]);
}
// The "Спецификация" table: profile of the longest rolled part, mass per mark, "обратно" copies profile and length, the next table is not mixed in.
assert.deepEqual([normProfile("} 30Ш2"),normProfile("Tp.140x4 (С255)"),normProfile("Сб. двутавр 30Ш1")],["I30Ш2","Тр.140х4","Св.I30Ш1"]);
const spec=specTable([T("Спецификация стали",100,100),T("Марка",100,140),T("Поз.",160,140),T("Сечение",260,140),T("Длина",420,140),T("Кол.",500,140),T("элем.",600,140),
 T("К1",100,200),T("1",160,200),T("Tp.140x4",260,200),T("4144",420,200),T("1",500,200),T("120,5",600,200),
 T("2",160,230),T("-200х16",260,230),T("300",420,230),T("1% на сварку",260,260),
 T("К2",100,300),T("обратно К1",260,300),T("1% на сварку",260,330),
 T("Требуется",100,380),T("К3",100,410),T("I30Ш1",260,410),T("6000",420,410)]);
// (Each row of its own a part of the mark: position, section, length, count; a mark made «обратно» has the parts of that one.)
const K1parts=[{pos:1,section:"Тр.140х4",length_mm:4144,count:1},{pos:2,section:"−200х16",length_mm:300,count:null}];
assert.deepEqual(spec,[{mark:"К1",profile:"Тр.140х4",mass_kg:120.5,length_mm:4144,parts:K1parts},
 {mark:"К2",profile:"Тр.140х4",mass_kg:null,length_mm:4144,parts:K1parts,parts_by:"К1"}]);
// The plan takes the parts for the mark from its assembly sheet; the placed member, its card and the exported page carry
// them.
{
 const {markKey}=require("../src/ai-montage-plan"),fs=require("fs"),path=require("path");
 const cat=buildCatalog({pages:[{docType:"КМД сборочные",sourceName:"К1.pdf",page:2,sheet:{spec}}]});
 assert.deepEqual(cat.get(markKey("КМД","К1")).parts.rows,K1parts);
 assert.equal(cat.get(markKey("КМД","К2")).parts.by,"К1");
 const src=f=>fs.readFileSync(path.join(__dirname,"..","src",f),"utf8");
 assert(/cat\?\.parts\?\{parts:cat\.parts\}/.test(src("ai-montage-plan.js"))&&/parts:e\.parts\|\|undefined/.test(src("ai-montage.js")),"the plan and the montage carry the parts");
 for(const f of ["scheme-page.js","ir-runtime.js"])assert(/\$\{partsHtml\(c\)\}/.test(src(f))&&/parts:Array\.isArray\(c\.parts\?\.rows\)\?c\.parts:undefined/.test(src(f)),f+": the card and the export");
 assert(/drillHtml\(c\)\+platesHtml\(c\)\+partsHtml\(c\)/.test(src("scheme-export-html.js")),"the exported page");
}
// A column without levels of its own takes those of the nearest column of its plan; it is placed, to be checked.
{
 const sch={...scheme,placements:[...scheme.placements,{mark:"Ф10",geometry_type:"column",x_mm:6000,y_mm:6000,confidence:"high",notes:[]}]};
 const p=buildPlan({pages:[{page:1,docType:"КМД монтажные",sourceName:"m.pdf",schemes:[sch]}]},{schemes:[],marks:[{mark:"Ф9",doc:"КМД",profile:"",length_mm:4500,count:1,mass_kg:null,has_levels:true,z0_mm:-400,z1_mm:4100,sheet:"",note:""}]},{});
 const e=p.elements.find(e=>e.mark==="Ф10");
 assert.deepEqual([e.z0_mm,e.z1_mm,e.levels,e.confidence],[-400,4100,"по соседним колоннам","low"]);
}
// A beam broken at the ridge in a section becomes a bent beam on the plan; one cut across (other length) stays straight.
{
 const sch={...scheme,placements:[{mark:"Б1",geometry_type:"beam",x_mm:0,y_mm:0,x2_mm:6000,y2_mm:0,confidence:"high",notes:[]},
  {mark:"Б2",geometry_type:"beam",x_mm:0,y_mm:6000,x2_mm:6000,y2_mm:6000,confidence:"high",notes:[]}]};
 const sections=[{mark:"Б1",section:"1-1",beam_mm:9400,ridge_mm:10000,ridge_t:0.5,ridge_len_mm:5800},{mark:"Б2",section:"1-1",beam_mm:9400,ridge_mm:10000,ridge_t:0.5,ridge_len_mm:9000}];
 const p=buildPlan({pages:[{page:1,docType:"КМД монтажные",sourceName:"m.pdf",schemes:[sch],sections}]},{schemes:[],marks:[]},{});
 const b1=p.elements.find(e=>e.mark==="Б1"),b2=p.elements.find(e=>e.mark==="Б2");
 assert.deepEqual([b1.geometry_type,b1.z0_mm,b1.mid_x_mm,b1.mid_z_mm],["bent",9400,3000,10000]);
 assert.deepEqual([b2.geometry_type,b2.z1_mm,b2.mid_z_mm],["beam",9400,undefined]);
}
// The overall size of a view is the dimension between its extreme extension lines (the chain under it adds up to it),
// not the largest number of the view: «8400» written beside it is not a dimension of the part.
{
 const T=(str,x,y,size=7,width=str.length*4.5)=>({str,x,y,size,width,angle:0});
 const H=(y,x0,x1)=>({a:{x:x0,y},b:{x:x1,y}}),V=(x,y0,y1)=>({a:{x,y:y0},b:{x,y:y1}});
 const texts=[T("К1",240,200,12,18),T("6000",232,300),T("2000",141,320),T("4000",291,320),T("8400",420,360),T("Прочее",600,500),T("Прочее",620,520),T("Прочее",640,540)];
 const segments=[H(302,100,400),H(322,100,400),V(100,290,325),V(400,290,325),V(200,315,325)];
 const v=extractSheet({widthPt:1200,heightPt:800,texts,segments}).views.find(x=>x.marks.includes("К1"));
 assert.deepEqual([v.length_mm,v.length_how,v.length_candidates],[6000,"по крайним выносным линиям, цепочка сходится",undefined]);
 const bare=extractSheet({widthPt:1200,heightPt:800,texts}).views.find(x=>x.marks.includes("К1"));
 assert.deepEqual([bare.length_mm,bare.length_how,bare.length_candidates],[8400,"наибольшее число вида — общий размер не найден",[8400,6000,4000]],"no lines — the largest number, ambiguous");
 // A railing drawn with a break: «12000» over a shortened drawing (off the scale, drawn shorter) is its length, not the
 // height «1200» of its posts that the scale agrees with (the recheck of 1.9.81: Ог1 of a KM set came out 1200 long).
 const rail=extractSheet({widthPt:1200,heightPt:800,texts:[T("Ог1",150,200,12,18),T("12000",160,300),T("1200",120,320),T("1000",115,340),T("200",148.25,340),T("Прочее",600,500),T("Прочее",620,520),T("Прочее",640,540)],
  segments:[H(302,100,250),H(322,100,160),H(342,100,160),V(100,290,345),V(250,290,305),V(160,315,345),V(150,335,345)]}).views.find(x=>x.marks.includes("Ог1"));
 assert.deepEqual([rail.length_mm,rail.length_how],[12000,"по крайним выносным линиям, вид с разрывом"]);
 // A mark written inside a scheme of another thing («Ог1» beside a roof plan): one dimension alone confirms nothing —
 // the other numbers stay as candidates (the element is «неоднозначно» where the size is used).
 const lone=extractSheet({widthPt:1200,heightPt:800,texts:[T("Ог1",150,200,12,18),T("1200",120,320),T("12000",300,360),T("Прочее",600,500),T("Прочее",620,520),T("Прочее",640,540)],
  segments:[H(322,100,160),V(100,315,325),V(160,315,325)]}).views.find(x=>x.marks.includes("Ог1"));
 assert.deepEqual([lone.length_mm,lone.length_how,lone.length_candidates],[1200,"единственный размер вида — общий размер не подтверждён",[1200,12000]]);
 const {cardsFromPages,gradeOf}=require("../src/ai-project-kb");
 const size=c=>c.fields.size_mm;
 const [card]=cardsFromPages([{page:1,docType:"КМД",sourceName:"a.pdf",sheet:{views:[bare]}}]);
 assert.deepEqual([size(card).value,size(card).how,gradeOf(size(card))],[8400,"наибольшее число вида — общий размер не найден","неоднозначно"]);
}
// ГПЭС 041-2025, Ф26–Ф28 (25.10.2026): the tables of the sheet are a picture read by OCR. The italic font reads
// «двутавр» as «Обутавр», the mark of the «Требуется» row sits 7 pt under its numbers, «Кол.» is lost; «позиции 2, 6, 11 по
// Ф26» (some parts as in Ф26) is not «все позиции по». The note «Неоговоренные отверстия ф23мм» gives the holes for all.
{const o=(str,x,y,size=11)=>T(str,x,y,size);
 const f26=extractSheet({widthPt:2384,heightPt:1684,texts:[o("Спецификация",78,1115,16),o("Сечение",170,1142,13),o("Длина",247,1143,14),o("Марка",62,1145,16),
  o("№",100,1142,13),o("дет.",113,1142,13),o("Масса кг.",376,1136,18),o("Всех",387,1152,13),o("Марка",461,1145,16),
  o("1",114,1170),o("35Ш2",196,1170),o("6160",251,1170),o("491",390,1170),o("2",112,1191),o("− 80х20",182,1191),o("80",256,1191),
  ...[3,4,5,6,7,8,9,10,11].flatMap(i=>[o(String(i),112,1191+20.5*(i-2)),o("− 120х12",182,1191+20.5*(i-2)),o("312",254,1191+20.5*(i-2))]),
  o("12",112,1395),o("швеллер 20",164,1397,13),o("4350",251,1395),o("13",112,1415),o("швеллер 20",164,1417,13),o("510",254,1415),o("14",112,1436),o("швеллер 20",164,1438,13),o("434",254,1436),o("Ф26",67,1323,13),o("693",428,1323,13),o("1% на сборку",209,1479,23),
  o("позиции 2, 6, 11 по Ф26",102,1498,13),o("4",112,1517),o("60х16",182,1517),o("250",253,1517),o("15",112,1558),o("Обутавр 35Ш2",159,1560,13),o("6000",251,1558),
  o("Ф27",67,1568,13),o("558",428,1568,13),o("16",112,1578),o("− 270х18",180,1578),o("340",254,1578),o("17",112,1599),o("уголок 160х14",159,1601,13),o("410",254,1599),
  o("1% на сварку",209,1640,13),o("Ф28",67,1660,13),o("обратно Ф27, все позиции по Ф27",102,1660,13),o("558",428,1660,13),
  o("Требуется изготовить",922,1494,18),o("Отправочная",884,1517,18),o("марка",901,1535,13),o("Вес В кг.",1021,1514,14),o("марки",1008,1536,13),o("Всех",1054,1533,14),
  o("1",979,1553),o("693",1015,1553),o("693",1057,1553),o("Ф26",904,1560,21),o("Ф27",906,1576,14),o("1",980,1575),o("558",1015,1575),o("558",1057,1575),o("Итого",1007,1663,14),
  T("1. Неоговоренные отверстия ф23мм.",1845,1380,15),T("Ф26-Ф28",2091,1665,22)]});
 assert.deepEqual(f26.spec.map(r=>[r.mark,r.profile,r.length_mm,r.mass_kg]),[["Ф26","I35Ш2",6160,693],["Ф27","I35Ш2",6000,558],["Ф28","I35Ш2",6000,558]]);
 assert.deepEqual(f26.required.map(r=>[r.mark,r.count,r.mass_kg]),[["Ф26",1,693],["Ф27",1,558]]);
 assert.deepEqual(f26.holes,{all_mm:23,diameters_mm:[23],notes:["1. Неоговоренные отверстия ф23мм."]});
 // «Марка дет.» (one word under «Марка») still lists parts, not marks.
 assert.equal(specTable([T("Спецификация",100,100),T("Марка",100,140),T("дет.",104,156),T("Сечение",260,140),T("Длина",420,140),T("К1",100,190),T("I30Ш1",260,190),T("6000",420,190)]).length,0);
 // OCR spellings of the profile words and a box sign read as a letter.
 assert.deepEqual(["Обутавр 35Ш2","дбутавр 40Б1","шбеллер 20П","уголак 100х8","Тр.r140х4","тавр 20ШТ1"].map(normProfile),["I35Ш2","I40Б1","[20П","L100х8","Тр.□140х4","тавр20ШТ1"])}
// ГПЭС В65–В67: OCR of the picture lost «Тр.□160х5» (Tesseract doubts the italic as a whole) and the mark В66. The cells
// of the «Сечение» column in rows with a length and the mark of a group without one are read again one by one.
{const {specCells,cellAccept}=require("../src/ai-sheet-extract"),o=(str,x,y,size=13.7)=>T(str,x,y,size);
 const t=[o("Спецификация на отправочный элемент",1804,639,17),o("Марка",1751,672,17),o("Сечение",1880,669),o("Длина",1974,670),
  o("1",1807,704),o("5640",1976,704),o("2",1805,726),o("95х10",1887,726),o("350",1979,726),o("В65",1757,761),o("1% на сборку",1915,820,29),
  o("5",1807,839),o("ро",1840,839),o("5280",1976,839),o("2",1805,861),o("−220х10",1880,861),o("350",1980,861),o("3",1805,884),o("−95х10",1880,884),o("220",1978,884),o("1% на сварку",1916,954,17),
  o("Требуется изготовить",1584,906),o("Отправочная",1473,933,17),o("марка",1491,952,13),o("В65",1497,974),o("2",1562,974),o("158",1608,974),o("316",1666,974),
  o("6",1562,996),o("146",1608,996),o("888",1665,996)];
 const cells=specCells(t).map(c=>[c.kind,Math.round(c.x),Math.round(c.y)]);
 assert.deepEqual(cells,[["section",1817,688],["section",1817,823],["mark",1726,874],["mark",1443,978]],JSON.stringify(cells));
 assert.deepEqual(["Тр. 160х5","Тр.з160х5","ро","160к5"].map(cellAccept.section),["Тр. 160х5","Тр.з160х5",null,null]);
 assert.deepEqual(["Вб6","В 65","КЗ","Итого","В65, В66"].map(cellAccept.mark),["В66","В65","К3",null,null]);
 const w=require("node:fs").readFileSync("src/ai-scheme-worker.js","utf8"),ocr=require("node:fs").readFileSync("src/ai-ocr.js","utf8");
 assert(w.includes("const cells=specCells(geometry.texts);")&&w.includes("accept:cellAccept[kind]")&&w.includes("filter(t=>!inCell(t))"),"the worker reads them after the pictures");
 assert(ocr.includes("async function readCells(")&&ocr.includes('tessedit_pageseg_mode:"7"')&&ocr.includes('tessedit_pageseg_mode:"11"'),"one line at a time, then back to sparse text")}
// ГПЭС Ф17–Ф25 (pasted table, 41 % of the marks of the set without a section before 1.10.0): the box sign of «□ 140х4»
// lost by OCR («а 140х4», «140х4»), the weld row read «19% на сборки.», masses with a lost comma («934» for 93,4), the mark
// of a group lost («Ф24»). A bare size is a square tube or an angle by its mass per metre; typed in one row of the table,
// in its other rows too; a group without its mark is named by the table «Требуется» (the one mark between its
// neighbours that the specification has not).
{const {cellAccept}=require("../src/ai-sheet-extract"),o=(str,x,y,size=13.7)=>T(str,x,y,size);
 assert.deepEqual(["а 140х4","В 120х4","2х4","140х4","−112х4"].map(cellAccept.section),["140х4","120х4",null,"140х4","−112х4"],"a lost sign before a size; «2х4» is not a section");
 const t=[o("Спецификация на отправочные элементы",1950,30,17),o("Марка",1820,63),o("Сечение",1935,63),o("Длина",2018,63),o("Кол-во",2068,55),o("дет.",2126,73),o("Всех",2168,73),o("марки",2206,73),
  o("1",1876,91),o("140х4",1949,91),o("5770",2022,91),o("1",2068,91),o("96,7",2128,91),o("97",2174,91),o("Ф17",1826,113),o("101",2213,113),o("19% на сборки.",1978,182),
  o("позиции 2, 3 по Ф17",1863,202),o("5",1876,222),o("140х4",1949,222),o("5570",2023,222),o("1",2068,222),o("934",2129,222),o("93",2174,222),o("Ф18",1826,234),o("98",2215,234),o("1% на сварку",1978,268),
  o("8",1874,300),o("120х4",1949,300),o("4175",2023,300),o("2",2066,300),o("595",2128,300),o("119",2174,300),o("13",1874,322),o("120х4",1949,322),o("1290",2023,322),o("2",2066,322),o("61",2128,322),o("146",2212,322),o("1% на сварку",1978,350),
  o("Ф25",1826,380),o("14",1874,380),o("120х4",1949,380),o("4360",2023,380),o("2",2066,380),o("621",2128,380),o("1% на сварку",1978,410),
  o("Требуется изготовить",1550,30),o("Отправочная",1500,55,17),o("марка",1510,70,13),o("Ф17",1520,95),o("2",1580,95),o("101",1620,95),o("Ф18",1520,115),o("2",1580,115),o("98",1620,115),
  o("Ф24",1520,135),o("6",1580,135),o("146",1620,135),o("Ф25",1520,155),o("4",1580,155),o("151",1620,155),o("Итого",1520,180)];
 const s=extractSheet({widthPt:2384,heightPt:1684,texts:t}).spec.map(r=>[r.mark,r.profile,r.length_mm,Boolean(r.by_order)]);
 assert.deepEqual(s,[["Ф17","□140х4",5770,false],["Ф18","□140х4",5570,false],["Ф25","□120х4",4360,false],["Ф24","□120х4",4175,true]],JSON.stringify(s))}
// ГПЭС К105–К108 (text layer): a welded I-beam «Св I50 ШC2»; «Обратна марке К105»; «Поз. 1, 2, 9-14 по марке К105» —
// the member of К107 is that of К105; «Таблица отправочных марок» is the «Требуется» table.
{const o=(str,x,y,size=17.6)=>T(str,x,y,size);
 const k=extractSheet({widthPt:3574,heightPt:1684,texts:[o("Спецификация",3056,33),o("Кол.",3113,73),o("Длина,",3267,74),o("№",3082,75),o("Сечение",3174,81),o("Марка",3031,81),
  o("мм",3281,93),o("всех марки",3366,93),o("поз.",3327,93),o("н",3133,94),o("т",3109,94),o("поз.",3077,94),
  o("8576",3275,115),o("1160",3367,117),o("1",3085,118),o("Св I50 ШC2",3173,118),o("2",3084,139),o("-140х12",3183,137),o("460",3279,138),o("К105",3034,147,22),
  o("3",3084,163),o("-255х12",3183,160),o("460",3279,160),
  ...[4,5,6,7,8,9,10,11,12,13,14].flatMap(i=>[o(String(i),3084,163+22.8*(i-3)),o("-300х10",3182,160+22.8*(i-3)),o("395",3279,160+22.8*(i-3))]),o("На сварку 1%",3172,457),o("Обратна марке К105",3146,479),o("К106",3033,487,22),
  o("Поз. 1, 2, 9-14 по марке К105",3114,526),o("К107",3029,564,22),o("15",3081,590),o("-140х12",3183,590),o("460",3279,590),o("На сварку 1%",3172,639),
  o("Обратна марке К103",3146,661),o("К108",3031,673,22),
  o("Таблица отправочных",3054,922,22),o("марок",3131,945,22),o("Отпр.",3039,965,20),o("Вес, кг",3178,965,20),o("Кол.",3097,977,22),o("марки",3153,985,20),o("всех",3233,985,20),o("марка",3037,986,20),
  o("1380",3167,1008),o("1380",3236,1009),o("1",3113,1009),o("К105",3043,1011),o("1381",3168,1054),o("1381",3236,1054),o("1",3113,1055),o("К107",3042,1056)]});
 assert.deepEqual(k.spec.map(r=>r.mark+" "+r.profile),["К105 Св.I50ШС2","К106 Св.I50ШС2","К107 Св.I50ШС2","К108 Св.I50ШС2"]);
 assert.deepEqual(k.required.map(r=>[r.mark,r.count,r.mass_kg]),[["К105",1,1380],["К107",1,1381]]);
 assert.deepEqual(["IЗОК1","I&5Ш1","Тр.1&0х&","орнойдвутавр5ОШС2","Двутавр сварной 50Ш2","Св. двутавр 40КС2","уголок 75хб"].map(normProfile),["I30К1","I45Ш1","Тр.140х4","Св.I50ШС2","Св.I50Ш2","Св.I40КС2","L75х6"])}
// ГПЭС К76–К79 (the tables pasted as pictures, read by OCR): the title «Спецификация на отправочный элемент» stands 124
// right of «Марка»; «Требуется изготовить» beside it with words of its own within reach; the welded «Св. двутавр 40КС2
// (С255)» read as «Сб. обутаёр &ОКС2 (С255», «СВ. бутавр 4ОКС2 (С253»; the mark of the sheet's title «Колонна К77» is known,
// so «В0» read in no cell of a mark is not a mark.
{const o=(str,x,y,size=15.3)=>({...T(str,x,y,size),ocr:true});
 const t=[o("Спецификация",1266,39),o("на отправочный элемент (марка стали",1334,39),o("дет.",1205,72),o("Сечение",1272,72),o("Длина",1354,73),
  o("Кол-во",1414,64),o("Массакг.",1518,65),o("Марка",1141,74),o("Примечание",1615,74),o("Ш",1407,90),o("дет.",1484,90),o("Всех",1534,90),o("марки",1576,93),
  o("1",1206,112),o("Сб. обутаёр &ОКС2 (С255",1222,113),o("10335",1356,112),o("1",1410,112),o("1836,0",1479,114),o("1638",1534,112),
  o("2",1205,139),o("500х40",1260,139),o("900",1359,139),o("1",1409,139),
  ...Array.from({length:32},(_,i)=>[o(String(i+3),1205,165+25*i),o(i===26?"Уголок 180х110х12":"−100х6",1240,165+25*i),o("160",1359,165+25*i),o("2",1408,165+25*i)]).flat(),
  o("К77",1146,550),o("2480",1577,550),o("на сварку",1278,991),o("В0",1107,808),
  o("Требуется изготовить",947,56),o("Отправочная",894,87),o("Кол.",977,93),o("Вес В кг.",1040,85),o("марка",910,103),o("марка",1022,113),o("Всех",1075,111),
  o("К77",914,133),o("1",984,133),o("2480",1024,133),o("2480",1074,133),{...T("Колонна К77",1384,1151,22)}];
 const k=extractSheet({widthPt:1684,heightPt:1191,texts:t});
 assert.deepEqual(k.spec.map(r=>[r.mark,r.profile,r.length_mm,r.mass_kg]),[["К77","Св.I40КС2",10335,2480]]);
 assert.deepEqual(k.required.map(r=>[r.mark,r.count,r.mass_kg]),[["К77",1,2480]]);
 assert.deepEqual(k.unread,[{table:"Спецификация",text:"В0"}]);
 const {specCells}=require("../src/ai-sheet-extract");
 assert.deepEqual(specCells(t.filter(x=>!/обутаёр/.test(x.str)).concat(o("бутавр",1249,114),o("С253",1317,113))).filter(c=>c.kind==="section").map(c=>Math.round(c.y)),[95],"«двутавр С255» without its size is read again");
 assert.deepEqual(["СВ. бутавр 4ОКС2 (С253","сё. двутавр 40КС2 (255","Пуголок125х80х10"].map(normProfile),["Св.I40КС2","Св.I40КС2","L125х80х10"])}
// ГПЭС Ф36, Ф126, В80: the letter of «двутавр 35Ш2» lost by OCR («3512») is the one the sheet writes elsewhere; marks of
// a «Требуется изготовить» table are not views; «16,361» (the mass of 1000 washers) among the numbers of a row is no level.
{const o=(str,x,y,size=15.3)=>({...T(str,x,y,size),ocr:true}),rows=Array.from({length:6},(_,i)=>[o(String(i+2),130,300+25*i),o("−80х20",180,300+25*i),o("80",260,300+25*i)]).flat();
 const tbl=[o("Спецификация",200,220),o("Марка",80,250),o("Сечение",180,250),o("Длина",260,250),o("1",130,275),o("двутавр 3512",165,275),o("5800",260,275),o("Ф36",85,330),...rows];
 const a=extractSheet({widthPt:2384,heightPt:1684,texts:[...tbl,o("35Ш2",754,1420)]}),b=extractSheet({widthPt:2384,heightPt:1684,texts:tbl});
 assert.deepEqual([a.spec[0].profile,b.spec[0].profile,b.unread],["I35Ш2","",[{table:"Спецификация",text:"Ф36: I3512"}]]);
 const v=extractSheet({widthPt:2384,heightPt:1684,texts:[T("К5",600,100,22),T("+4,144",560,300),T("+0,050",560,900),T("4094",520,600),
  T("Ведомость постоянных метизов",520,1400),T("Шайба 20 (оц.)",420,1500),T("1344",640,1500),T("16,361",700,1500),T("22,0",760,1500),
  T("Требуется изготовить",1500,100),T("Отправочная",1460,130),T("марка",1470,150),T("Кол.",1560,140),T("Ф94",1470,180,22),T("1",1560,180),T("379",1610,180),T("379",1660,180),
  T("Ф126",1470,205,22),T("6",1560,205),T("109",1610,205),T("654",1660,205)]}).views;
 assert.deepEqual(v.map(x=>[x.marks.join(),x.levels.join()]),[["К5","50,4144"]])}
// ГПЭС, the 128 marks of 58 assembly sheets without a section in 1.10.0. Signs of the CAD symbol font in the text layer
// («~ 12» a channel, «{ 50х5» an angle), OCR of the italic («Сборной двутавр &5ШСТ», «Сбарной дбутабр 50ШС2», «Дбутодр
// 25Ш2», «балка 24М» a monorail I-beam, «в7» in the mark column, «&130» a length), and «250х6» a plate, not an angle.
{const {cellAccept}=require("../src/ai-sheet-extract");
 assert.deepEqual(["Сборной двутавр &5ШСТ","Сбарной дбутабр 50ШС2","Дбутодр 25Ш2","~ 12","{ 50х5","балка 24М","Двутавр 30КТ"].map(normProfile),
  ["Св.I45ШС1","Св.I50ШС2","I25Ш2","[12","L50х5","I24М","I30К1"]);
 assert.deepEqual([cellAccept.mark("в7"),cellAccept.mark("Вб6"),cellAccept.length("&130"),cellAccept.length("ВОТ")],["В7","В66","4130",null])}
// ГПЭС Ф78–Ф93 (a pasted table read by OCR): «Все позиции по Ф78, кроме поз. 1» with an I-beam of its own is that I-beam;
// «29%» among the masses (a «294» read badly) does not close the group; a row «подобна Ф78, все позиции по Ф78» with its
// mark is a mark by itself; the italic 8 read 6 («Ф62» for Ф82: «Требуется» lists Ф82; «Ф60» for Ф80, between Ф79 and Ф81).
{const o=(str,x,y,size=11)=>({...T(str,x,y,size),ocr:true}),like=(m,y,base,mass)=>[o(m,1822,y,14),o("подобна "+base+", Все позиции по "+base,1861,y,13),o(mass,2170,y),o(mass,2211,y,14)];
 const t=[o("Спецификация",1885,33,17),o("Марка",1817,65,17),o("дет.",1873,65,14),o("Сечение",1934,65,14),o("Длина",2016,65,14),o("Примечание",2297,65,17),o("т",2082,74,9),o("дет.",2125,74,14),o("Всех",2167,74,13),
  o("1",1874,95),o("30Ш2",1962,95),o("4370",2021,95),o("1",2067,95),o("2998",2124,95,13),o("300",2170,95),o("2",1872,117),o("210х12",1945,117),o("220",2021,117),o("2",2066,117),o("44",2130,117,13),o("9",2175,117),
  o("Ф78",1822,150,14),o("317",2212,150,14),o("1% на сварку",1976,204,14),o("3",2176,204),
  o("Все позиции по Ф78, кроме поз. 1",1861,228,14),o("5",1873,248),o("30Ш2",1962,248),o("4280",2021,248),o("2936",2124,248,13),o("29%",2169,248),o("Ф79",1823,259,14),o("311",2212,259,14),o("1% на сборку",1976,296,14),
  ...like("Ф60",314,"Ф79","311"),...like("Ф81",336,"Ф78","317"),...like("Ф62",358,"Ф78","317"),
  o("Требуется изготовить",1550,900,17),o("Отправочная",1500,925,17),o("марка",1510,940,13),
  ...["Ф78","Ф79","Ф81","Ф82"].flatMap((m,i)=>[o(m,1520,965+20*i,14),o("1",1580,965+20*i),o("317",1620,965+20*i)]),o("Итого",1520,1060)];
 const s=extractSheet({widthPt:2384,heightPt:1684,texts:t}).spec.map(r=>[r.mark,r.profile,r.length_mm,r.read||""]);
 assert.deepEqual(s,[["Ф78","I30Ш2",4370,""],["Ф79","I30Ш2",4280,""],["Ф80","I30Ш2",4280,"Ф60"],["Ф81","I30Ш2",4370,""],["Ф82","I30Ш2",4370,"Ф62"]],JSON.stringify(s))}
// ГПЭС В9–В12: a group whose mark both tables lost («Требуется» lists В9, В10 only) is named by the numbers between the
// groups round it (В10, В11 between В9 and В12); a row whose section the reading lost is the part of the row of the same
// mass of one part and length within 1 % («6160 330,3» of В5 and «Двутавр 25Ш2 6140 330,3» of В7).
{const o=(str,x,y,size=14)=>({...T(str,x,y,size),ocr:true}),hdr=[o("Спецификация",1880,600,17),o("Марка",1765,630,17),o("дет.",1813,630),o("Сечение",1880,630),o("Длина",1984,630),o("Примечание",2290,630,17),o("т",2030,645,10),o("дет.",2087,645),o("Всех",2134,645)];
 const t=[...hdr,o("1",1815,659),o("25Ш2",1917,659),o("5980",1983,659),o("1",2030,659),o("3217",2087,659,16),o("322",2133,659),o("181х10",1892,681),o("222",1986,681),o("2",2029,681),o("32",2092,681,16),o("6",2139,681),o("В9",1767,716,15),o("338",2175,716,15),o("19% на сварку",1923,776,29),
  o("Обратна В9",1876,794,18),o("335",2134,794),o("339",2175,818,15),o("1% на сварку",1923,842,18),
  o("60",1975,868,22),o("303",2086,868,22),o("80х10",1893,907),o("222",1986,907),o("4",2029,907),o("14",2094,907,16),o("347",2174,920,15),o("1% на сварку",1923,975,18),
  o("Дбутавр 25Ш2",1869,998,18),o("5980",1983,998),o("1",2030,998),o("3217",2087,998,16),o("В12",1765,1043,15),o("335",2175,1043,15),o("1% на сварку",1923,1091,18),
  o("Требуется изготовить",1552,600,18),o("Отправочная",1498,624,18),o("марка",1516,642,13),o("В9",1523,665),o("3",1587,665),o("338",1631,665),o("В10",1521,687),o("3",1587,687),o("338",1631,687),o("Итого",1632,799)];
 const s=extractSheet({widthPt:2384,heightPt:1684,texts:t}).spec.map(r=>[r.mark,r.profile,Boolean(r.by_order)]);
 assert.deepEqual(s,[["В9","I25Ш2",false],["В12","I25Ш2",false],["В10","I25Ш2",true],["В11","",true]],JSON.stringify(s));
 const u=[...hdr,o("6160",1982,966,22),o("3303",2086,966,22),o("331",2133,966,22),o("32",2092,982,15),o("1",2031,982),o("3",2139,982),o("В5",1767,1005,15),o("80х10",1893,1005,23),o("14",2094,1005,25),o("1% на сварку",1923,1052,18),
  o("Обратна В5",1876,1072,18),o("В6",1767,1096,15),o("1% на сварку",1923,1118,18),o("Дбутавр 25Ш2",1869,1140,18),o("3303",2087,1140,16),o("6140",1984,1140),o("1",2030,1140),o("331",2134,1140),o("В7",1767,1185,15),o("1% на сварку",1923,1234,29)];
 assert.deepEqual(extractSheet({widthPt:2384,heightPt:1684,texts:u}).spec.map(r=>[r.mark,r.profile,r.length_mm]),[["В5","I25Ш2",6160],["В6","I25Ш2",6160],["В7","I25Ш2",6140]])}
// A table beside the specification (its «Требуется изготовить» at the height of the header) does not move the header down;
// the box sign of a tube drawn as a square of lines before «140х4» on a leader; views drawn in steps (Ф15 high, Ф16 lower and
// aside, Ф15's post running down past Ф16's title) part the sheet across; the one rolled section labelled in a view is the section of a mark the specification lacks.
{const sq=(x,y,a)=>[[x,y,x+a,y],[x+a,y,x+a,y-a],[x+a,y-a,x,y-a],[x,y-a,x,y]].map(([x0,y0,x1,y1])=>({a:{x:x0,y:y0},b:{x:x1,y:y1}}));
 const v=extractSheet({widthPt:1684,heightPt:1191,segments:[...sq(745.4,343.2,9.9),...sq(1040,522,9.9),{a:{x:743,y:141},b:{x:743,y:872}}],texts:[T("Ф15",707,58,31),T("140х4",756.8,343.2,15.3),T("+3,600",760,90),T("3580",700,700),
  T("Ф16",1007,220,31),T("120х4",1051,522,15.3),T("+2,100",1060,250),T("2080",1000,700),
  T("Требуется изготовить",1000,1050),T("Отправочная",960,1080),T("марка",970,1100),T("Ф15",990,1272,14),T("24",1040,1272),T("70",1090,1272),T("Ф16",990,1300,14),T("12",1040,1300),T("39",1090,1300),T("Итого",1100,1340)]});
 assert.deepEqual(v.views.map(x=>[x.marks[0],x.profile]),[["Ф15","□140х4"],["Ф16","□120х4"]]);
 assert.deepEqual(v.spec.map(r=>[r.mark,r.profile,Boolean(r.from_view)]),[["Ф15","□140х4",true],["Ф16","□120х4",true]])}
// ГПЭС Ф110–Ф115 (pasted table read by OCR, «Требуется» lists Ф110, Ф112, Ф115): the groups go in the order of the stamp
// «Ф110-Ф115»; a group without a label is the mark of the stamp there (Ф111, Ф113); «ФИ2» is Ф112; «подобна …» whose
// sample name was lost takes the mark of the same mass of one mark (Ф113: 385 as Ф111, not 4920 of the group above);
// a mark with only its mass left (Ф115: 367) is the section of the marks of that mass.
{const o=(str,x,y,size=11)=>({...T(str,x,y,size),ocr:true}),like=(y,base,mass)=>[o("подобна "+base+", Все позиции по "+base,1861,y,13),o(mass,2170,y),o(mass,2211,y,14)];
 const t=[o("Спецификация",1885,33,17),o("Марка",1817,65,17),o("дет.",1873,65,14),o("Сечение",1934,65,14),o("Длина",2016,65,14),o("Примечание",2297,65,17),o("т",2082,74,9),o("дет.",2125,74,14),o("Всех",2167,74,13),o("марки",2205,74,13),
  o("6",1874,95),o("двутавр 30Ш2",1923,95,14),o("4920",2021,95),o("1",2067,95),o("3373",2125,95,13),o("338",2170,95),o("Ф110",1822,106,14),o("367",2211,106,14),o("1% на сборку",1977,140,14),o("4",2176,140),
  o("7",1874,170),o("двутавр 30Ш2",1923,170,14),o("5120",2022,170),o("1",2067,170),o("3512",2126,170,13),o("351",2172,170),o("385",2211,170,14),o("1% на сварку",1977,214,14),o("4",2176,214),
  o("ФИ2",1822,236,14),...like(236,"Ф110","367"),
  o("Все позиции по",1923,258,13),o("пободна",1862,258),o("385",2171,258),o("385",2211,258,14),
  o("Ф114",1822,280,14),...like(280,"Ф110","367"),
  o("Ф115",1822,302,14),o("367",2170,302),o("367",2211,302,14),
  o("Требуется изготовить",1550,900,17),o("Отправочная",1500,925,17),o("марка",1510,940,13),
  ...["Ф110","Ф112","Ф115"].flatMap((m,i)=>[o(m,1520,965+20*i,14),o("1",1580,965+20*i),o("367",1620,965+20*i)]),o("Итого",1520,1060),
  T("Балка покрытия бокса",2047,1646,22),T("Ф110-Ф115",2092,1665,22)];
 const s=extractSheet({widthPt:2384,heightPt:1684,texts:t}).spec.map(r=>[r.mark,r.profile,r.length_mm,r.by_mass||""]).sort((a,b)=>a[0].localeCompare(b[0]));
 assert.deepEqual(s,[["Ф110","I30Ш2",4920,""],["Ф111","I30Ш2",5120,""],["Ф112","I30Ш2",4920,""],["Ф113","I30Ш2",5120,"Ф111"],["Ф114","I30Ш2",4920,""],["Ф115","I30Ш2",4920,"Ф110"]],JSON.stringify(s))}
// ГПЭС Ф60–Ф63: «обратна Ф60, все позиции по Ф60 | 546» whose label the reading lost is a mark by itself (Ф61); «позиции»
// and «6,7 по Ф60» read apart still open the group of Ф62 with its own I-beam and length; «Все детали по В60» is «Все
// позиции по В60»; «ВА5» is В45 and «ВА3» between В42 and В45 is В43.
{const o=(str,x,y,size=11)=>({...T(str,x,y,size),ocr:true});
 const hdr=[o("Спецификация",80,1202,17),o("Марка",62,1234,17),o("дет.",117,1234,14),o("Сечение",178,1231,14),o("Длина",266,1231,14),o("Примечание",560,1231,17),o("т",311,1244,9),o("дет.",370,1244,14),o("всех",415,1244,13),o("марки",452,1244,13)];
 const t=[...hdr,o("1",119,1261),o("двутавр 30Ш2",167,1261,14),o("5850",266,1261),o("1",311,1261),o("466,2",369,1261,13),o("466",414,1261),o("80х20",191,1283),o("80",270,1283),o("4",310,1283),o("60х16",192,1327),o("250",268,1327),o("19",376,1327),o("Ф60",67,1360,14),o("уголок 160х14",167,1414,14),o("410",268,1414),o("139",373,1414),o("546",456,1360,14),o("1% на сварку",221,1461,14),o("5",420,1461),
  o("обратна",105,1482,14),o("Все позиции по Ф60",169,1482,13),o("546",415,1482),o("546",455,1482,14),
  o("позиции",104,1512,17),o("6,7 по Ф60",173,1512,20),o("58",416,1512,20),o("4",117,1528),o("60х16",192,1528),o("250",268,1528),o("4",420,1528),
  o("двутавр 30Ш2",167,1550,14),o("6010",266,1550),o("1",311,1550),o("479,0",369,1550,13),o("479",414,1550),o("Ф62",67,1572,14),o("556",455,1572,14),o("1% на сварку",221,1637,14),o("6",420,1637),
  o("обратна Ф62, Все позиции по Ф62",105,1662,14),o("Ф63",67,1662,14),o("556",415,1662),o("556",455,1662,14)];
 const s=specTable(t,["Ф60","Ф61","Ф62","Ф63"]).map(r=>[r.mark,r.profile,r.length_mm]).sort((a,b)=>a[0].localeCompare(b[0]));
 assert.deepEqual(s,[["Ф60","I30Ш2",5850],["Ф61","I30Ш2",5850],["Ф62","I30Ш2",6010],["Ф63","I30Ш2",6010]],JSON.stringify(s));
 const u=[...hdr,o("Тр. 120х4",167,1261,14),o("1095",266,1261),o("1",311,1261),o("15,6",369,1261,13),o("16",414,1261),o("В60",67,1282,14),o("22",455,1282,14),o("1% на сварку",221,1310,14),
  o("Все детали по В60",169,1332,14),o("21",414,1332),o("В61",67,1354,14),o("22",455,1354,14),o("1% на сварку",221,1380,14)];
 assert.deepEqual(specTable(u,["В60","В61"]).map(r=>[r.mark,r.profile,r.length_mm]),[["В60","Тр.120х4",1095],["В61","Тр.120х4",1095]]);
 const w=[...hdr,o("Св. двутавр 50ШС2",167,1261,14),o("4311",266,1261),o("В42",67,1282,14),o("1343",455,1282,14),o("1% на сварку",221,1310,14),
  o("двутавр 25Ш2",167,1332,14),o("7800",266,1332),o("ВА3",67,1354,14),o("436",455,1354,14),o("1% на сварку",221,1380,14),
  o("Тр. 80х4",167,1402,14),o("2890",266,1402),o("33",455,1424,14),o("1% на сварку",221,1450,14),
  o("Тр. 80х4",167,1472,14),o("1060",266,1472),o("ВА5",67,1494,14),o("16",455,1494,14),o("1% на сварку",221,1520,14)];
 assert.deepEqual(specTable(w,["В44","В45"]).map(r=>[r.mark,r.profile,r.length_mm]).sort((a,b)=>a[0].localeCompare(b[0])),[["В42","Св.I50ШС2",4311],["В43","I25Ш2",7800],["В44","Тр.80х4",2890],["В45","Тр.80х4",1060]])}
// A title written at a slant (a stair's railing drawn along its flight, ГПЭС Ф136 at −45°): its view is read along it —
// its own texts (along it or across it), its overall dimension between its extreme extension lines; a level number by it
// is another view's; a level view beside it keeps its own.
{
 const T=(str,x,y,size=7,width=str.length*4.5)=>({str,x,y,size,width,angle:0});
 const H=(y,x0,x1)=>({a:{x:x0,y},b:{x:x1,y}}),V=(x,y0,y1)=>({a:{x,y:y0},b:{x,y:y1}});
 const c=Math.SQRT1_2,R=p=>({x:600+(p.x-250)*c-(p.y-300)*c,y:300+(p.x-250)*c+(p.y-300)*c});
 const slant=[T("Ф9",240,200,12,18),T("6000",232,300),T("2000",141,320),T("4000",291,320),T("8400",420,360)].map(t=>({...t,...R(t),angle:-45}));
 const lines=[H(302,100,400),H(322,100,400),V(100,290,325),V(400,290,325),V(200,315,325)].map(q=>({a:R(q.a),b:R(q.b)}));
 const texts=[...slant,T("9000",560,420),T("Ф10",1300,200,12,18),T("1500",1290,300),T("Прочее",1600,700),T("Прочее",1620,720),T("Прочее",1640,740)];
 const segments=[...lines,H(302,1200,1400),V(1200,290,305),V(1400,290,305)];
 const views=extractSheet({widthPt:2000,heightPt:900,texts,segments}).views,v=views.find(x=>x.marks.includes("Ф9")),o=views.find(x=>x.marks.includes("Ф10"));
 assert(v,"the slanted title is a view: "+JSON.stringify(views.map(x=>x.marks)));
 assert.deepEqual([v.length_mm,v.length_how,v.angle],[6000,"по крайним выносным линиям, цепочка сходится",-45],"its overall dimension along it");
 const at=R({x:249,y:200});assert(Math.hypot(v.title_at.x-at.x,v.title_at.y-at.y)<1,"its title where it is drawn: "+JSON.stringify(v.title_at));
 assert(v.box.x0<=R({x:100,y:320}).x&&v.box.x1>=R({x:420,y:360}).x&&v.box.y1>=R({x:400,y:320}).y,"its area round its texts: "+JSON.stringify(v.box));
 assert.deepEqual([o.length_mm,o.angle],[1500,undefined],"the level view beside it")}
// A group drawing — one view for several marks, the sizes that differ by mark on rows of their own, «для К1» at the end
// of the row (ГПЭС л. 123: К137, К140 7500; К138, К139 6000): each mark's length is its own row's; a short row «305 · 305
// для К1» is the place of a part. Drawn at a slant under its level title (ГПЭС К114–К118, a brace at 39°), it is read
// along its line. The catalog takes the mark's own length.
{
 const T=(str,x,y,size=7,width=str.length*4.5)=>({str,x,y,size,width,angle:0});
 const H=(y,x0,x1)=>({a:{x:x0,y},b:{x:x1,y}}),V=(x,y0,y1)=>({a:{x,y:y0},b:{x,y:y1}}),K=(x,y)=>({a:{x:x-1.5,y:y+1.5},b:{x:x+1.5,y:y-1.5}});
 // (a row: its line, its extension lines and ticks, each number over the middle of its span)
 const row=(y,xs,vals)=>({lines:[H(y,xs[0],xs[xs.length-1]),...xs.flatMap(x=>[V(x,y-10,y+3),K(x,y)])],texts:vals.map((v,k)=>T(String(v),(xs[k]+xs[k+1])/2-String(v).length*1.5,y-2,6,String(v).length*3))});
 const rows=[row(242,[100,475],[7500]),row(262,[100,115,460,475],[300,6900,300]),row(282,[100,112,390,400],[240,5560,200]),row(302,[100,400],[6000]),row(322,[200,215.25,230.5],[305,305])];
 const labels=[T("для К1",480,260),T("для К2",405,280),T("для К1",150,320)];
 const draw=[...rows.flatMap(r=>r.texts),...labels],lines=rows.flatMap(r=>r.lines);
 const level=extractSheet({widthPt:2000,heightPt:900,texts:[T("К1, К2",215,200,12,40),...draw],segments:lines}).views.find(x=>x.marks.includes("К1"));
 assert.deepEqual([level.length_mm,level.lengths],[7500,{К1:7500,К2:6000}],"each mark its own row: "+JSON.stringify(level));
 const c=Math.SQRT1_2,R=p=>({x:600+(p.x-250)*c-(p.y-300)*c,y:300+(p.x-250)*c+(p.y-300)*c});
 const turned=extractSheet({widthPt:2000,heightPt:900,texts:[T("К1, К2",560,40,12,40),...draw.map(t=>({...t,...R(t),angle:-45}))],segments:lines.map(q=>({a:R(q.a),b:R(q.b)}))}).views.find(x=>x.marks.includes("К1"));
 assert.deepEqual([turned.length_mm,turned.lengths,turned.slope],[7500,{К1:7500,К2:6000},-45],"at a slant, along it: "+JSON.stringify(turned));
 const {markKey}=require("../src/ai-montage-plan"),cat=buildCatalog({pages:[{page:1,docType:"КМД сборочные",sourceName:"s.pdf",sheet:{views:[level]}}]});
 assert.deepEqual(["К1","К2"].map(m=>[cat.get(markKey("КМД",m))?.length_mm,cat.get(markKey("КМД",m))?.lengthFrom]),[[7500,"s.pdf, лист 1 · вид «К1, К2» (размер «для К1»)"],[6000,"s.pdf, лист 1 · вид «К1, К2» (размер «для К2»)"]]);
 // The holes drawn are К1's (6900 between them, its «300 · 6900 · 300»): К2's at its far end 1340 nearer, its plates
 // 240 and 200 off its axes — its middle 20 past theirs (ГПЭС К137 and К138).
 assert.deepEqual(level.spans,{К1:[{span:6900,a:300,b:300,c:262}],К2:[{span:5560,a:240,b:200,c:282}]},"the spans of the marks: "+JSON.stringify(level.spans));
 const hole=(at,off)=>({at_mm:at,off_mm:off,d_mm:23});
 const drill={views:[{title:"К1, К2",marks:["К1","К2"],main:true,scale:"1:10",length_mm:7040,band_mm:160,dir:"по горизонтали",holes:[hole(70,-55),hole(70,55),hole(6970,-55),hole(6970,55)]}]};
 const cd=buildCatalog({pages:[{page:1,docType:"КМД сборочные",sourceName:"s.pdf",sheet:{views:[level],drill}}]});
 assert.deepEqual(["К1","К2"].map(m=>{const d=cd.get(markKey("КМД",m)).drill[0];return[d.length_mm,d.center_mm,d.holes.map(h=>h[0])]}),[[7040,undefined,[70,70,6970,6970]],[5700,20,[70,70,5630,5630]]]);
 assert(require("fs").readFileSync(require("path").join(__dirname,"../src/scheme-three-view.js"),"utf8").includes("at-len/2+ctr"),"the 3D sets the holes off the middle by center_mm")}
// A view ended above a lower title aside of it is above it, not beside it (ГПЭС Ф137 over Ф140): the lower one's area
// reaches its left end, «250 · 500 · 500 · 250», «1500».
{
 const T=(str,x,y,size=7,width=str.length*4.5)=>({str,x,y,size,width,angle:0});
 const H=(y,x0,x1)=>({a:{x:x0,y},b:{x:x1,y}}),V=(x,y0,y1)=>({a:{x,y:y0},b:{x,y:y1}}),K=(x,y)=>({a:{x:x-1.5,y:y+1.5},b:{x:x+1.5,y:y-1.5}});
 const row=(y,xs,vals)=>({lines:[H(y,xs[0],xs[xs.length-1]),...xs.flatMap(x=>[V(x,y-10,y+3),K(x,y)])],texts:vals.map((v,k)=>T(String(v),(xs[k]+xs[k+1])/2-String(v).length*1.5,y-2,6,String(v).length*3))});
 const rows=[row(940,[1070,1120,1220,1320,1370],[250,500,500,250]),row(960,[1070,1370],[1500]),row(500,[950,1150],[1000])];
 const sheet={widthPt:2400,heightPt:1700,texts:[T("Ф137",1045,70,31,62),T("Ф138",1640,70,31,62),T("Ф140",1278,600,31,62),...rows.flatMap(r=>r.texts)],
  segments:[...rows.flatMap(r=>r.lines),V(960,100,520),V(1140,100,520),V(1300,630,980)]};
 const v=extractSheet(sheet).views.find(x=>x.marks.includes("Ф140"));
 assert.deepEqual([v.length_mm,v.box.x0<1070],[1500,true],"the whole of the lower view: "+JSON.stringify(v));
 // (Ф137's post running down past it: beside it)
 const w=extractSheet({...sheet,segments:[...sheet.segments,V(1140,100,900)]}).views.find(x=>x.marks.includes("Ф140"));
 assert(w.box.x0>1150,"beside: "+JSON.stringify(w.box))}
// A beam drawn wider than the area round its title (ГПЭС Ф48: 5700 drawn 1700 pt long): its long lines under the title
// carry its area to its ends, so its overall «6000» is read, not the «3000» of its middle. Pieces joined end to end, each
// named over its own («Ф76, Ф77»): each its part of the row adding up to the whole.
{
 const T=(str,x,y,size=7,width=str.length*4.5)=>({str,x,y,size,width,angle:0});
 const H=(y,x0,x1)=>({a:{x:x0,y},b:{x:x1,y}}),V=(x,y0,y1)=>({a:{x,y:y0},b:{x,y:y1}}),K=(x,y)=>({a:{x:x-1.5,y:y+1.5},b:{x:x+1.5,y:y-1.5}});
 const row=(y,xs,vals)=>({lines:[H(y,xs[0],xs[xs.length-1]),...xs.flatMap(x=>[V(x,y-10,y+3),K(x,y)])],texts:vals.map((v,k)=>T(String(v),(xs[k]+xs[k+1])/2-String(v).length*1.5,y-2,6,String(v).length*3))});
 const beam=[H(150,200,1800),H(200,200,1800),V(200,150,200),V(1800,150,200)];
 const one=[row(260,[200,600,1400,1800],[1500,3000,1500]),row(280,[200,1800],[6000]),row(300,[970.7,1000,1029.3],[110,110])];
 const v=extractSheet({widthPt:2400,heightPt:1700,texts:[T("Б1",990,100,31,40),...one.flatMap(r=>r.texts)],segments:[...beam,...one.flatMap(r=>r.lines)]}).views.find(x=>x.marks.includes("Б1"));
 assert.deepEqual([v.length_mm,v.box.x0<200,v.box.x1>1800],[6000,true,true],"the whole beam: "+JSON.stringify(v));
 const two=[row(260,[200,1100,1800],[3375,2625]),row(280,[200,1800],[6000])];
 const p=extractSheet({widthPt:2400,heightPt:1700,texts:[T("Б2, Б3",970,100,31,80),T("Б2",500,130,10,20),T("Б3",1500,130,10,20),...two.flatMap(r=>r.texts)],segments:[...beam,...two.flatMap(r=>r.lines)]}).views.find(x=>x.marks.includes("Б2"));
 assert.deepEqual([p.length_mm,p.lengths],[6000,{Б2:3375,Б3:2625}],"each piece: "+JSON.stringify(p))}
// A length that is only the largest number of a view gives way to the mark's own size in another view («7500 для К5»).
{const {markKey}=require("../src/ai-montage-plan");
 const views=[{marks:["К5"],title:"К5",levels:[],z0_mm:null,z1_mm:null,length_mm:4047,length_how:"наибольшее число вида — общий размер не найден"},
  {marks:["К4","К5"],title:"К4, К5",levels:[],z0_mm:null,z1_mm:null,length_mm:6000,lengths:{К4:6000,К5:7500}}];
 const e=buildCatalog({pages:[{page:1,docType:"КМД сборочные",sourceName:"s.pdf",sheet:{views}}]}).get(markKey("КМД","К5"));
 assert.deepEqual([e.length_mm,e.lengthWeak,e.lengthFrom],[7500,undefined,"s.pdf, лист 1 · вид «К4, К5» (размер «для К5»)"])}
// A beam drawn with a break: its plate sizes at the end (one scale, «120 · 150», «270») are no overall size — they span a
// small part of the view; its «7480» over the shortened drawing spans the extension lines of the sizes at the scale,
// and a size of another view in the area running past them («7360», ГПЭС К161 over К160) is not taken.
{
 const T=(str,x,y,size=7,width=str.length*4.5)=>({str,x,y,size,width,angle:0});
 const H=(y,x0,x1)=>({a:{x:x0,y},b:{x:x1,y}}),V=(x,y0,y1)=>({a:{x,y:y0},b:{x,y:y1}}),K=(x,y)=>({a:{x:x-1.5,y:y+1.5},b:{x:x+1.5,y:y-1.5}});
 const row=(y,xs,vals)=>({lines:[H(y,xs[0],xs[xs.length-1]),...xs.flatMap(x=>[V(x,y-10,y+3),K(x,y)])],texts:vals.map((v,k)=>T(String(v),(xs[k]+xs[k+1])/2-String(v).length*1.5,y-2,6,String(v).length*3))});
 const rows=[row(242,[100,112,127],[120,150]),row(262,[100,127],[270]),row(282,[100,400],[7480]),row(302,[90,410],[7360])];
 const v=extractSheet({widthPt:2000,heightPt:900,texts:[T("К1",240,200,12,16),...rows.flatMap(r=>r.texts)],segments:rows.flatMap(r=>r.lines)}).views.find(x=>x.marks.includes("К1"));
 assert.deepEqual([v.length_mm,v.length_how],[7480,"по крайним выносным линиям, вид с разрывом"],"the length over the break: "+JSON.stringify(v))}
// «Итого:» of «Выборка металла» beside the marks table, on the row of К140 (ГПЭС л. 123): it does not end the marks
// table — К140–К142 are its rows, and their cells are no views.
{const o=(str,x,y,size=17.6)=>T(str,x,y,size);
 const rows=[["К138",2,154,308],["К139",2,159,318],["К140",2,210,420],["К141",3,184,552],["К142",3,147,441]].flatMap(([m,n,a,b],i)=>{const y=1143+22.7*i;return[o(m,1854,y),o(String(n),1924,y),o(String(a),1983,y),o(String(b),2050,y)]});
 const k=extractSheet({widthPt:2400,heightPt:1700,texts:[o("Таблица отправочных",1866,986,22),o("марок",1943,1010,22),o("Отпр.",1851,1030,20),o("Вес, кг",1990,1030,20),
  o("Кол.",1910,1042,22),o("марки",1965,1049,20),o("всех",2046,1049,20),o("марка",1849,1051,20),o("Выборка металла",2176,998,22),o("Марка",2152,1030,20),
  ...rows,o("Итого:",2159,1184,20),o("4047",2304,1187),o("Итого:",1862,1276,20),o("4047",2045,1278)],segments:[]});
 assert.deepEqual(k.required.map(r=>r.mark),["К138","К139","К140","К141","К142"],"the whole marks table: "+JSON.stringify(k.required));
 assert(!k.views.some(v=>v.marks.includes("К140")),"a cell of the table is no view")}
console.log("Sheets: assembly levels, quantities, КМ profiles, separate КМ/КМД catalogs and per-mark heights, slanted views, group drawings, tables beside tables PASS");
