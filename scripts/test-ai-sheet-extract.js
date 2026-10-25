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
assert.deepEqual(spec,[{mark:"К1",profile:"Тр.140х4",mass_kg:120.5,length_mm:4144},{mark:"К2",profile:"Тр.140х4",mass_kg:null,length_mm:4144}]);
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
console.log("Sheets: assembly levels, quantities, КМ profiles, separate КМ/КМД catalogs and per-mark heights PASS");
