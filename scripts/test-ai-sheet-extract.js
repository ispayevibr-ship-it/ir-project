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
assert.deepEqual([normProfile("} 30Ш2"),normProfile("Tp.140x4 (С255)"),normProfile("Сб. двутавр 30Ш1")],["I30Ш2","Тр.140х4","I30Ш1"]);
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
console.log("Sheets: assembly levels, quantities, КМ profiles, separate КМ/КМД catalogs and per-mark heights PASS");
