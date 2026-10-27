"use strict";
/*
 * IR Project AI: the global engineering knowledge base — what is true for every object (structure types, rolled
 * sections, steel grades, standards, drawing and geometry rules, examples), kept in knowledge/global/ of the
 * repository and arriving with hot updates. Read only in the program; the development session fills it.
 *
 * The project knowledge base is the object's own records in SQLite (object_records, object_id): actual marks,
 * sizes, levels and coordinates. Nothing of an object goes here, and nothing here is used as an object's value
 * unless it is confirmed (see knowledge/global/README.md).
 */
const fs=require("node:fs"),path=require("node:path");
const GLOBAL_DIR=path.join(__dirname,"..","knowledge","global");
// How drawings cite a standard: ГОСТ (Р, ISO, EN), СТ РК (ISO, EN, ASTM), строительные нормы РК (СП, СН, СНиП, НТП, РДС, МСН,
// МСП), СТО АСЧМ, DIN, ISO, and the codes of the RF met in older and Russian projects («СП 16.13330.2017», «СНиП II-23-81*»,
// «РД 11-02-2006»). One source for the sheet reader, the fastener reader and standardOf.
const STD_SOURCE="(ГОСТ\\s*Р?\\s*(?:ИСО|ISO|EN)?\\s*\\d+(?:\\.\\d+)*(?:-\\d+)*(?:-\\d{2,4})?"+
 "|(?:ҚР\\s*)?СТ\\s*РК\\s*(?:EN\\s*ISO|ИСО|ISO|EN|IEC|ASTM\\s*[A-Z]?)?\\s*\\d+(?:[.-]\\d+)*"+
 "|(?:СНиП|СП|СН|НТП|РДС|МСН|МСП)\\s*РК\\s*(?:EN\\s*)?\\d+(?:[.-]\\d+)*(?:\\(\\d+(?:\\.\\d+)*\\))?(?:[-:]\\d{4}(?:\\/\\d{4})?)?\\*?"+
 "|СП\\s*\\d+\\.\\d{5}(?:\\.\\d{4})?|СНиП\\s*(?:[IV]+-\\d+-\\d+|\\d+\\.\\d+\\.\\d+-\\d+)\\*?|РД\\s*\\d+-\\d+-\\d{4}"+
 "|СТО\\s*АСЧМ\\s*\\d+-\\d+|DIN\\s*(?:EN\\s*)?(?:ISO\\s*)?\\d+(?:-\\d+)?|ISO\\s*\\d+(?:-\\d+)?)";
const normStd=t=>String(t||"").toUpperCase().replace(/ИСО/g,"ISO").replace(/ҚР/g,"").replace(/[\s ]+/g,"").replace(/–|—/g,"-").replace(/\*$/,"");
const STATUSES=["confirmed","needs_check","unknown"];
// Fields that belong to one object: a global record carrying them would leak one project into another.
const PROJECT_FIELDS=["project","project_id","object_id","x_mm","y_mm","z_mm","x0","y0","z0","x1","y1","z1","x0_mm","y0_mm","z0_mm","x1_mm","y1_mm","z1_mm"];
const readJson=f=>{try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch{return null}};
// What is wrong with one record of a catalog; an empty list — the record may be used.
function recordProblems(r,sourceIds){
 const out=[];
 if(!r||typeof r!=="object")return["не объект"];
 if(!r.id)out.push("нет id");
 if(!STATUSES.includes(r.status))out.push("статус «"+r.status+"» не из "+STATUSES.join(", "));
 if(!Array.isArray(r.sources))out.push("нет списка источников");
 else{
  if(r.status==="confirmed"&&!r.sources.length)out.push("подтверждено без источника");
  for(const s of r.sources)if(sourceIds&&!sourceIds.has(s))out.push("источник «"+s+"» не найден в sources.json")
 }
 if(!r.example_only)for(const k of PROJECT_FIELDS)if(k in r)out.push("поле объекта «"+k+"» в глобальной базе");
 return out
}
function createGlobalKnowledge({dir=GLOBAL_DIR}={}){
 let cache=null;
 function load(){
  if(cache)return cache;
  const catalogs=new Map(),problems=[];
  let files=[];try{files=fs.readdirSync(dir).filter(f=>f.endsWith(".json")).sort()}catch{}
  for(const f of files){
   const d=readJson(path.join(dir,f)),name=f.slice(0,-5);
   if(!d||!Array.isArray(d.records)){problems.push({catalog:name,problem:"файл не читается"});continue}
   catalogs.set(name,d.records)
  }
  const sourceIds=new Set((catalogs.get("sources")||[]).map(s=>s.id));
  for(const [name,records] of catalogs){
   if(name==="sources"||name==="research-log")continue;
   const seen=new Set();
   for(const r of records){
    const p=recordProblems(r,sourceIds);
    if(r?.id&&seen.has(r.id))p.push("повтор id");seen.add(r?.id);
    for(const problem of p)problems.push({catalog:name,id:r?.id||"",problem})
   }
  }
  return cache={catalogs,problems}
 }
 const list=name=>load().catalogs.get(name)||[];
 const get=(name,id)=>list(name).find(r=>r.id===id)||null;
 // Only confirmed records may give a value; the rest are for understanding and are shown as such.
 const confirmed=name=>list(name).filter(r=>r.status==="confirmed"&&!recordProblems(r,new Set(list("sources").map(s=>s.id))).length);
 function search(text,{catalog}={}){
  const q=String(text||"").trim().toLowerCase();if(!q)return[];
  const out=[];
  for(const [name,records] of load().catalogs){
   if(catalog&&name!==catalog)continue;
   for(const r of records)if(JSON.stringify(r).toLowerCase().includes(q))out.push({catalog:name,record:r})
  }
  return out
 }
 // A rolled section by how drawings write it: «I20», «Двутавр 20», «[20У», «Швеллер 16аП», «L75x6», «∟75х6», «Уголок 75×6»,
// «L63x40x5», «Гн.□100х4».
 // Only confirmed rows; «I20Б1», «I30Ш2» are never taken for ГОСТ 8239 (they are ГОСТ Р 57837 rows, `standard` says so).
 function findProfile(text,{standard=""}={}){
  // The box sign of a font read as a letter: «Тр.r140х4», «Трубаr140х4» are «Тр.□140х4» (src/ai-sheet-extract.js profileWords).
  const t=String(text||"").replace(/\s+/g,"").replace(/[хХ×*]/g,"x").replace(/,/g,".").replace(/^(Тр\.?|Гн\.?|Труба(?:профильная)?)[rгзо0](?=\d{2,3}x)/iu,(s,a)=>(/^Труба/iu.test(a)?"Тр.":a)+"□");
  let m;
  // «Труба 160х5», «Тр.140х4» — a square tube 160×160×5 when a table of square ones has that size (the engineer, 25.10.2026:
  // «если труба указана как 160х5, то это 160х160х5»; the masses of the sheet agree) or the sheet cites a standard of square
  // tubes; «Ø», «ВГП» and a standard of round tubes cited keep it round.
  if((m=/^(?:Тр\.?|Труба)(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/iu.exec(t))&&squareTube(+m[1],Number(m[2]),standard+" "+text))return findProfile("Тр.кв."+m[1]+"x"+m[2],{standard});
  // A pair «2L80х6», «2[16П» (two angles or channels back to back): the row of one, mass of the pair.
  if((m=/^2(?=[L∟\[]|Уг|Шв)(.+)$/u.exec(t))){const one=findProfile(m[1],{standard});return one&&{...one,pair:2,mass_single_kg_m:one.mass_kg_m,mass_kg_m:Math.round(one.mass_kg_m*200)/100}}
  // A channel is often written without the bracket in a «Сечение» column: «10У», «20П» — only channel suffixes.
  if((m=/^(\d+(?:\.5)?а?[УПЭЛ])$/u.exec(t)))return findProfile("["+m[1],{standard});
  // «Балка 20» of a price list is a number without its series: under a sheet citing ГОСТ 26020 or 57837 it is not ГОСТ 8239.
  if((m=/^(?:I|І|Двутавр|Дв\.?|Балка)(\d{2})$/iu.exec(t)))return /^Балка/iu.test(t)&&/26020|57837/.test(standard+" "+text)?null:confirmed("profiles-ibeams").find(r=>r.id==="ibeam-8239-"+m[1])||null;
  // Parallel flanges: ГОСТ Р 57837 («I30Ш2», «30Б1», «35К1,5») or ГОСТ 26020-83 (same numbers, other sizes; ДБ, ДШ).
  // The standard of the sheet decides, and only it; without it 57837 first, then 26020.
  if((m=/^(?:I|І|Двутавр|Дв\.?|Балка)?(\d{2,3})(ДБ|ДШ|[БШКбшкKk])(\d+(?:\.5)?)$/u.exec(t))){
   const key=m[1]+({K:"К",k:"К",б:"Б",ш:"Ш",к:"К"}[m[2]]||m[2])+m[3];
   const order=/26020/.test(standard+" "+text)?["26020"]:/57837/.test(standard+" "+text)?["57837"]:["57837","26020"];
   for(const std of order){const r=confirmed(std==="26020"?"profiles-ibeams-26020":"profiles-ibeams-parallel").find(x=>x.id==="ibeam-"+std+"-"+key);if(r)return r}
   return null
  }
  // Special I-beams М of ГОСТ 19425-74 for monorails and hoist tracks: «24М», «I30М», «Двутавр 36М».
  if((m=/^(?:I|І|Двутавр|Дв\.?|Балка)?(\d{2})[МM]$/u.exec(t)))return confirmed("profiles-ibeams-19425").find(r=>r.id==="ibeam-19425-"+m[1]+"М")||null;
  // Crane rails of ГОСТ 4121-96: «КР70», «Рельс КР 100», «КР-80» (the number is the width of the head).
  if((m=/^(?:Рельс)?(?:КР|KP)-?(\d{2,3})$/u.exec(t)))return confirmed("rails-crane-4121").find(r=>r.id==="rail-4121-КР"+m[1])||null;
  // Special channels С of ГОСТ 19425-74: «18С», «[20С», «Швеллер 18Са».
  if((m=/^(?:\[|Швеллер|Шв\.?)?(\d{2})[СC]([аa]?)$/u.exec(t)))return confirmed("profiles-channels-19425").find(r=>r.id==="channel-19425-"+m[1]+"С"+(m[2]?"а":""))||null;
  // A bent unequal channel «[160×80×50×5» (ГОСТ 8281-80): h, the larger flange, the smaller one, the thickness.
  if((m=/^(?:\[|Швеллер(?:гнутый)?(?:неравнополочный)?|Шв\.?(?:гн\.?)?)(\d{2,3})x(\d{2,3})x(\d{2,3})x(\d+(?:\.\d+)?)$/iu.exec(t))){
   const key=Number(m[1])+"x"+Math.max(+m[2],+m[3])+"x"+Math.min(+m[2],+m[3])+"x"+Number(m[4]),rows=confirmed("profiles-channels-bent-8281");
   return rows.find(r=>r.id==="channel-8281-"+key)||rows.find(r=>r.id==="channel-8281-"+key+"-t2")||null
  }
  // A bent angle, written so: «Уголок гнутый 80×4», «∟гн.100×65×4» (ГОСТ 19771-93, 19772-93; table 1).
  if(/гн|гнут/iu.test(t)&&(m=/^(?:L|∟|Уголок|Уг\.?)(?:гнутый|гн\.?)?(\d+)x(\d+)(?:x(\d+(?:\.\d+)?))?(?:гн\.?)?$/iu.exec(t))){
   if(m[3]&&m[1]!==m[2])return confirmed("profiles-angles-bent-19772").find(r=>r.id==="angle-19772-"+Math.max(+m[1],+m[2])+"x"+Math.min(+m[1],+m[2])+"x"+Number(m[3]))||null;
   return confirmed("profiles-angles-bent-19771").find(r=>r.id==="angle-19771-"+Number(m[1])+"x"+Number(m[3]||m[2]))||null
  }
  // A bent channel «[160×60×4», «Швеллер гнутый 160х60х4» (ГОСТ 8278-83, equal flanges): the row of table 1 (carbon
  // steel), else of table 2; a size in neither is taken by the geometry of the bent strip without the bend radii,
  // A = t·(h + 2b − 2t), to be checked.
  if((m=/^(?:\[|Швеллер(?:гнутый)?|Шв\.?(?:гн\.?)?)(\d{2,3})x(\d{2,3})x(\d+(?:\.\d+)?)$/iu.exec(t))){
   const h=Number(m[1]),b=Number(m[2]),th=Number(m[3]);if(!(th>0&&th<b/2&&b<h*1.5))return null;
   const rows=confirmed("profiles-channels-bent-8278"),key="channel-8278-"+h+"x"+b+"x"+th,row=rows.find(r=>r.id===key)||rows.find(r=>r.id===key+"-t2");
   if(row)return row;
   const A=th*(h+2*b-2*th);
   return{id:"channel-bent-"+h+"x"+b+"x"+th,designation:"Швеллер гнутый "+h+"×"+b+"×"+th,standard:"ГОСТ 8278-83",h_mm:h,b_mm:b,s_mm:th,t_mm:th,
    bent:true,shape3d:"channel",A_cm2:Math.round(A)/100,mass_kg_m:Math.round(A*0.785)/100,listed:false,sources:[],status:"needs_check"}
  }
  if((m=/^(?:\[|Швеллер|Шв\.?)(\d+(?:\.5)?а?)([УПЭЛ])$/iu.exec(t)))return confirmed("profiles-channels").find(r=>r.id==="channel-"+m[1].toLowerCase()+m[2].toUpperCase())||null;
  if((m=/^(?:L|∟|Уголок|Уг\.?)(\d+)x(\d+)(?:x(\d+(?:\.\d)?))?$/iu.exec(t))){
   // «75x6» or «75x75x6» — an equal-leg angle (ГОСТ 8509); «63x40x5» — unequal (ГОСТ 8510).
   const [b,c,d]=[m[1],m[2],m[3]];
   if(d&&b!==c)return confirmed("profiles-angles-unequal").find(r=>r.id==="angle-"+Number(b)+"x"+Number(c)+"x"+Number(d))||null;
   return confirmed("profiles-angles").find(r=>r.id==="angle-"+b+"x"+Number(d||c))||null
  }
  const cites=n=>new RegExp(n).test(standard+" "+text);
  // Bent open sections by their tables: a C-shaped one with lips «С-образный 160×60×32×4» (ГОСТ 8282-83: h, b, the lip a,
  // s), a hat «Профиль корытный 80×60×32×3» (ГОСТ 8283-93: the web h, the walls b, the outer flanges a, s; table 1, else
  // table 2), a Z «Профиль Z 200×60×5» (ГОСТ 13229-78, equal flanges: h, b, s). Four numbers are a bent unequal channel
  // (ГОСТ 8281) unless the sheet or the name says which.
  if((m=/^(?:Профиль)?(?:гнутый)?(С-?образный|корытный|C|С)?(?:профиль)?(\d{2,3})x(\d{2,3})x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/iu.exec(t))&&(m[1]||cites("8282|8283"))){
   const key=Number(m[2])+"x"+Number(m[3])+"x"+Number(m[4])+"x"+Number(m[5]);
   if(/корыт/iu.test(m[1]||"")||!m[1]&&cites("8283")){const rows=confirmed("profiles-hat-8283");return rows.find(r=>r.id==="hat-8283-"+key)||rows.find(r=>r.id==="hat-8283-"+key+"-t2")||null}
   return confirmed("profiles-lipped-8282").find(r=>r.id==="lipped-8282-"+key)||null
  }
  if((m=/^(?:Профиль)?(?:гнутый)?(Z-?образный|зетовый|Z|Зет)?(?:профиль)?(\d{2,3})x(\d{2,3})x(\d+(?:\.\d+)?)$/iu.exec(t))&&(m[1]||cites("13229"))){
   const rows=confirmed("profiles-z-13229"),key="z-13229-"+Number(m[2])+"x"+Number(m[3])+"x"+Number(m[4]);
   return rows.find(r=>r.id===key)||rows.find(r=>r.id===key+"-t2")||null
  }
  // A square or rectangular tube: «Труба 100х100х4», «Тр.кв.100х4», «Труба прямоугольная 120х80х5 ГОСТ 8645-68» (ГОСТ 8639-82,
  // 8645-68, 32931-2015), a bent closed box «Гн.□100х4», «□120х80х5», «Профиль 120x80x5» (ГОСТ 30245-2003); the tables list the
  // larger side first. The standard of the sheet decides; without it a «Труба» is looked up among the tubes first (ГОСТ 8639/8645,
  // then 32931 — thin walls of the market), a «□», «Гн», «Профиль» among the boxes. A size the cited standard has not (a price
  // list writes every profile tube «ГОСТ 8639-82») is the row of another table, to be checked; a size in no table — by its
  // sizes with the corner of ГОСТ 32931 (1,5s up to 2,5; 2s; 2,5s; 3s), to be checked.
  if((m=/^(Гн\.?|Профиль(?:гнутый)?(?:замкнутый)?|Труба(?:профильная)?(?:квадратная|прямоугольная)?|Тр\.?(?:проф\.?)?(?:кв\.?|пр\.?)?)?(□)?(\d+)(?:x(\d+))?x(\d+(?:\.\d+)?)$/iu.exec(t))&&
   (m[2]||/^(?:Гн|Профиль)/iu.test(t)||/^Тр/iu.test(t)&&(m[4]||/кв|квадрат|прям|проф/iu.test(m[1])))){
   const h=Math.max(+m[3],+(m[4]||m[3])),b=Math.min(+m[3],+(m[4]||m[3])),s=Number(m[5]),hbs=h+"x"+b+"x"+s;
   const tube=()=>h===b?confirmed("profiles-pipes-square-8639").find(r=>r.id==="pipe-sq-8639-"+h+"x"+s):confirmed("profiles-pipes-rect-8645").find(r=>r.id==="pipe-rect-8645-"+hbs);
   const tube32931=()=>confirmed("profiles-pipes-32931").find(r=>r.id==="pipe-32931-"+hbs);
   const box=()=>confirmed("profiles-box-30245").find(r=>r.id==="box-30245-"+hbs);
   const byRule=()=>{
    const R=s<=2.5?1.5*s:s<=6?2*s:s<=10?2.5*s:3*s,q=R-s,A=(2*s*(h+b)-4*s*s-(4-Math.PI)*(R*R-q*q))/100;
    return{id:"pipe-32931-"+hbs,designation:"Труба "+(h===b?"квадратная ":"прямоугольная ")+h+"×"+b+"×"+s,standard:"ГОСТ 32931-2015",h_mm:h,b_mm:b,t_mm:s,R_mm:R,
     shape3d:"box",A_cm2:Math.round(A*100)/100,mass_kg_m:Math.round(A*78.5)/100,listed:false,sources:confirmed("pipes").find(r=>r.id==="pipe-rule-32931")?.sources||[],status:"needs_check",
     note:"размера нет в таблицах базы: площадь и масса по размерам, радиус угла по правилу ГОСТ 32931"}
   };
   if(cites("32931"))return tube32931()||byRule();
   const order=cites("30245")?[box]:cites("8639|8645")?[tube]:/^Тр/iu.test(t)?[tube,tube32931,box]:[box,tube32931,tube];
   for(const f of order){const r=f();if(r)return r}
   const cited=(standard+" "+text).match(/ГОСТ\s*(?:30245|8639|8645)(?:-\d+)?/u)?.[0];
   if(cited)for(const f of [tube,tube32931,box]){const r=f();if(r)return{...r,status:"needs_check",cited_standard:cited,note:"в "+cited+" такого размера нет; есть в "+r.standard+" — проверить"}}
   return byRule()
  }
  // A hexagon bar «Шестигранник 22», «S22» (ГОСТ 2879-2006, d — across flats): A = (√3/2)·d², mass at 7850 kg/m³.
  if((m=/^(?:Шестигранник|Шестигр\.?|S|⬡)(\d+(?:\.\d+)?)$/iu.exec(t))){
   const d=Number(m[1]),std=confirmed("bars").find(r=>r.id==="bar-std-2879"),A=Math.sqrt(3)/2*d*d,listed=Boolean(std?.sizes_mm.includes(d));
   return{id:"bar-hex-"+d,designation:"Шестигранник "+d,standard:"ГОСТ 2879-2006",d_mm:d,solid:true,shape3d:"hex",A_cm2:Math.round(A)/100,mass_kg_m:Math.round(A*0.785)/100,
    listed,sources:listed?std.sources:[],status:listed?"confirmed":"needs_check"}
  }
  // Reinforcing bar «Ø12А500С», «12А400», «Арматура 16 А500С» (ГОСТ 34028-2016): the row of the nominal diameter, the class.
  // The old classes of ГОСТ 5781-82 «20-А-II», «Ø12 А-III», «Ас-II» (А-I = А240 … А-VI = А1000), and «12А400 ГОСТ 5781-82».
  if((m=/^(?:Арматура|Арм\.?)?(?:Ø|ø|∅)?(\d+(?:\.\d+)?)-?([АA])([сc]?)-?([IІV]{1,3})(?:ГОСТ.*)?$/u.exec(t))){
   const std=confirmed("bars").find(r=>r.id==="bar-std-5781"),old="А"+(m[3]?"с":"")+"-"+m[4].replace(/І/g,"I"),cls=std?.old_classes.find(x=>x.old==="А-"+m[4].replace(/І/g,"I"));
   const row=std?.rows.find(r=>r.d_mm===Number(m[1])),known=Boolean(row&&cls);
   return{id:"rebar-"+Number(m[1])+"-"+old,designation:"Арматура "+Number(m[1])+" "+old+(cls?" ("+(m[3]?cls.class.replace("А","Ас"):cls.class)+")":""),standard:"ГОСТ 5781-82",d_mm:Number(m[1]),
    class:cls?(m[3]?cls.class.replace("А","Ас"):cls.class):null,class_old:old,solid:true,shape3d:"round",A_cm2:row?row.F_mm2/100:Math.round(Math.PI*Number(m[1])**2/4)/100,
    mass_kg_m:row?row.mass_kg_m:Math.round(Math.PI*Number(m[1])**2/4*0.00785*1000)/1000,listed:known,sources:known?std.sources:[],status:known?"confirmed":"needs_check"}
  }
  if((m=/^(?:Арматура|Арм\.?)?(?:Ø|ø|∅)?(\d+(?:\.\d+)?)([АA]п?\d{3,4})([СCНHЕEКKУР]*)$/u.exec(t))){
   const std=confirmed("bars").find(r=>r.id===(cites("5781")?"bar-std-5781":"bar-std-34028")),row=std?.rows.find(r=>r.d_mm===Number(m[1])),cls=m[2].replace(/A/g,"А")+m[3].replace(/C/g,"С").replace(/H/g,"Н").replace(/E/g,"Е").replace(/K/g,"К");
   const known=Boolean(row&&std.classes.includes(cls.replace(/[СНЕКУР]+$/u,"")));
   return{id:"rebar-"+Number(m[1])+"-"+cls,designation:"Арматура "+Number(m[1])+" "+cls,standard:std?.standard||"ГОСТ 34028-2016",d_mm:Number(m[1]),class:cls,solid:true,shape3d:"round",
    A_cm2:row?row.F_mm2/100:Math.round(Math.PI*Number(m[1])**2/4)/100,mass_kg_m:row?row.mass_kg_m:Math.round(Math.PI*Number(m[1])**2/4*0.00785*1000)/1000,
    listed:known,sources:known?std.sources:[],status:known?"confirmed":"needs_check"}
  }
  // Profiled sheeting «Н75-750-0,8», «Профнастил НС35-1000-0,7», «С21-1000-0,6» (ГОСТ 24045-2016; wall profiles С by the 1994
  // edition): mass per metre and per m² of the table. A profile of the market — «МП20-1100-0,5», «С8-1150-0,5», «Профлист НС21»
  // — is the supplier's (profiled-sheets-market): its height and widths, to be checked (one name, other widths at other works).
  if((m=/^(?:Профнастил|Профлист|Профиль)?(НС|МП|Н|С|HC|MP|H|C)(\d{1,3})(?:-(\d{3,4})-(\d(?:\.\d+)?))?$/u.exec(t))&&(m[3]||/^(?:Профнастил|Профлист)/iu.test(t))){
   const k={HC:"НС",MP:"МП",H:"Н",C:"С"}[m[1]]||m[1];
   const row=m[3]&&confirmed("profiled-sheets-24045").find(r=>r.id==="deck-24045-"+k+m[2]+"-"+m[3]+"-"+Number(m[4]).toFixed(1));
   if(row)return row;
   const market=list("profiled-sheets-market").find(r=>r.id==="deck-market-"+k+m[2]);
   return market?{...market,designation:k+m[2]+(m[3]?"-"+m[3]+"-"+m[4]:""),width_written_mm:m[3]?Number(m[3]):null,t_mm:m[4]?Number(m[4]):null,listed:false}:null
  }
  // Rails of ГОСТ 19240-73 for runways of hoists: «Рельс Р5», «Рельс двухголовый», «Рельс тавровый».
  // («х» of «двухголовый» is read as a «x» of sizes above.)
  if((m=/^Рельс(дву[xх]головый|тавровый)$|^(?:Рельс)?(?:Р|P)5$/iu.exec(t)))return confirmed("rails-19240").find(r=>r.id==="rail-19240-"+(m[1]?m[1].toLowerCase().replace("x","х"):"Р5"))||null;
  // A solid bar — a tie rod, a rung, a railing post: round «Ø18», «Круг 20» (ГОСТ 2590-2006), square «□20», «Квадрат 20»
  // (ГОСТ 2591-2006), wire rod «Катанка 6,5», «Катанка В-6,0-Ст3кп» (ГОСТ 30136-95, sizes of the circle). Mass by the geometry at
  // 7850 kg/m³ (as the sortaments give it); a size not in the list of the standard is shown for a check.
  if((m=/^(?:Ø|ø|∅|Круг)(\d+(?:\.\d+)?)$/iu.exec(t))||(m=/^(?:□|Квадрат|Кв\.)(\d+(?:\.\d+)?)$/iu.exec(t))||(m=/^Катанка(?:[АБВA-C]-)?(\d+(?:\.\d+)?)(?:-|$)/iu.exec(t))){
   const d=Number(m[1]),round=!/^(?:□|Кв)/iu.test(t),rod=/^Катанка/iu.test(t);if(!(d>0&&d<=300))return null;
   const A=round?Math.PI*d*d/4:d*d,std=confirmed("bars").find(r=>r.id===(rod?"bar-std-30136":round?"bar-std-2590":"bar-std-2591")),listed=Boolean(std?.sizes_mm.includes(d));
   return{id:(rod?"wire-rod-":round?"bar-round-":"bar-square-")+d,designation:(rod?"Катанка ":round?"Круг ":"Квадрат ")+d,standard:rod?"ГОСТ 30136-95":round?"ГОСТ 2590-2006":"ГОСТ 2591-2006",
    D_mm:d,solid:true,shape3d:round?"round":"plate",A_cm2:Math.round(A)/100,mass_kg_m:Math.round(A*0.785)/100,listed,sources:listed?std.sources:[],status:listed?"confirmed":"needs_check"}
  }
  if(/^(?:Тр\.?|Труба|Ø|ø)(?:ВГП)?(?:[ЦРМНДП]-)*\d/iu.test(t))return pipeOf(text,{standard});
  return null
 }
 // A plate «Лист 10», «Лист t=10», «-10х200», «PL10x200», «Лист 10х1500х6000 ГОСТ 19903-2015», a strip «Полоса 10х200 ГОСТ 82-70»
 // (or «Полоса 40×4», width first), a chequered or an expanded sheet:
 // the thickness checked against the sortament the sheet cites (hot-rolled ГОСТ 19903-2015, cold-rolled ГОСТ 19904-90, strip
 // ГОСТ 103-2006 and wide universal ГОСТ 82-70 with their widths), else the first that has it; mass 1 m² = 7,85·t; with a
 // width — mass 1 m of the strip. `listed` false — the thickness is not in the list, shown for a check.
 function squareTube(a,s,std){
  if(/10704|8732|8734|3262|20295/.test(std))return false;if(/30245|8639|8645|32931/.test(std))return true;
  return Boolean(confirmed("profiles-pipes-square-8639").find(r=>r.id==="pipe-sq-8639-"+a+"x"+s)||confirmed("profiles-box-30245").find(r=>r.id==="box-30245-"+a+"x"+a+"x"+s)||
   confirmed("profiles-pipes-32931").find(r=>r.id==="pipe-32931-"+a+"x"+a+"x"+s))
 }
 function plateOf(text,{standard=""}={}){
  const t=String(text||"").replace(/\s+/g,"").replace(/[хХ×*]/g,"x").replace(/,/g,".");
  let c;
  // A chequered plate «Лист риф. 4», «Лист рифлёный 5×1500×6000», «Лист ромб. 4», «Лист чечевичный 4» (ГОСТ 8568-77): the thickness
  // of the base; mass 1 m² of the rhombic or the lentil pattern.
  if((c=/^(?:Лист)?(?:риф(?:л[её]н(?:ый|ая|\.)?|\.)?|ромб(?:ический|\.)?|чечев(?:ичный|\.)?)(\d+(?:\.\d+)?)/iu.exec(t))){
   const th=Number(c[1]),row=confirmed("sheets").find(r=>r.kind==="chequered_sheet"&&r.t_mm===th),lentil=/чечев/iu.test(t);
   return{id:"plate-chequer-"+th,kind:"chequered_sheet",t_mm:th,pattern:lentil?"чечевичное":"ромбическое",shape3d:"deck",standard:"ГОСТ 8568-77",listed:Boolean(row),
    rib_h_mm:row?row.rib_h_mm:null,mass_kg_m2:row?(lentil?row.mass_lentil_kg_m2:row.mass_rhombic_kg_m2):null,sources:row?.sources||[],status:row?"confirmed":"needs_check"}
  }
  // An expanded sheet «ПВ 506», «Лист ПВ-508» (ГОСТ 8706-78: the blank 5, the feed 6). «ПВЛ 506» is how the market names it,
  // and sheets of ТУ 36.26.11-5-89 bear the same marks with other weights: with ГОСТ 8706 cited it is its row, else to be checked.
  if((c=/^(?:Лист)?(ПВЛ|ПВ)-?(\d{3})/u.exec(t))){
   const row=confirmed("sheets").find(r=>r.id==="sheet-pv-"+c[2]),sure=Boolean(row)&&(c[1]==="ПВ"||/8706/.test(standard+" "+text));
   return{id:"sheet-pv-"+c[2],kind:"expanded_sheet",designation:"Лист "+c[1]+" "+c[2],standard:"ГОСТ 8706-78",blank_t_mm:row?row.blank_t_mm:Number(c[2][0]),feed_mm:row?row.feed_mm:Number(c[2].slice(1)),
    S_mm:row?.S_mm??null,mass_kg_m2:row?.mass_kg_m2??null,shape3d:"deck",listed:Boolean(row),sources:row?.sources||[],status:sure?"confirmed":"needs_check",
    ...(sure?{}:{note:row?"«ПВЛ» без ссылки на ГОСТ 8706-78: по ТУ 36.26.11-5-89 масса может быть другой — проверить":"марки нет в ГОСТ 8706-78 (406…610) — по ТУ изготовителя"})}
  }
  const m=/^(?:Лист|Л\.?|PL|Полоса|Пол\.?|—|–|-)(?:t=|δ=?|s=)?(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?(?:x(\d+))?/iu.exec(t);if(!m)return null;
  let th=Number(m[1]),w=m[2]?Number(m[2]):null;if(!(th>0&&th<=400))return null;
  // A strip is often written width first: «Полоса 40×4» is 4 thick.
  if(w&&w<th&&/^(?:Полоса|Пол)/iu.test(t))[th,w]=[w,th];
  const pool=confirmed("sheets").filter(r=>r.kind==="sheet_standard").concat(confirmed("bars").filter(r=>r.kind==="strip_standard"));
  const cited=pool.filter(r=>new RegExp("ГОСТ\\s*"+r.standard.replace(/^ГОСТ\s*/,"").split("-")[0]+"-").test(standard+" "+text));
  const fits=r=>r.thicknesses_mm.includes(th)&&(r.kind!=="strip_standard"||!w||r.widths_mm.includes(w)&&!(r.not_listed||[]).some(x=>x.startsWith(w+"×"+th+" ")));
  // Without a cited standard a «Полоса» is looked up among the strips (ГОСТ 103-2006 first), the rest among the sheets.
  const strip=/^(?:Полоса|Пол)/iu.test(t),std=(cited.length?cited:strip?pool.filter(r=>r.kind==="strip_standard").concat(pool.filter(r=>r.kind==="sheet_standard")):pool.filter(r=>r.kind==="sheet_standard")).find(fits)||null;
  return{id:"plate-"+th+(w?"x"+w:""),t_mm:th,width_mm:w,length_mm:m[3]?Number(m[3]):null,shape3d:"plate",
   standard:std?.standard||cited[0]?.standard||null,listed:Boolean(std),mass_kg_m2:Math.round(7.85*th*100)/100,
   mass_kg_m:w?Math.round(7.85*th*w/1000*100)/100:null,sources:std?.sources||[],status:std?"confirmed":"needs_check"}
 }
 // The steel of a member by ГОСТ 27772-2021 (steel-grades.json): the strength class «С345», «С255», «С355-1», «С390», the
 // thickness of the rolled product and its kind (sheet — table 4, section — table 5): the yield strength σт and the
 // ultimate σв, Н/мм², not less (Ryn, Run). Only confirmed rows; a thickness out of the ranges gives null.
 function steelOf(grade,{thickness_mm,product="section"}={}){
  const g=String(grade||"").replace(/\s+/g,"").toUpperCase().replace(/C/g,"С").replace(/K/g,"К").replace(/P/g,"П").replace(/^С?(\d{3})/,"С$1");
  const rows=confirmed("steel-grades").filter(r=>r.grade===g&&r.product===product);
  if(!rows.length)return null;
  if(!(thickness_mm>0))return{grade:g,product,rows,standard:rows[0].standard};
  const t=Number(thickness_mm),r=rows.find(x=>(x.t_from==="свыше"?t>x.t_from_mm:t>=x.t_from_mm)&&t<=x.t_to_mm);
  return r?{grade:g,product,row:r,sigma_y_min_mpa:r.sigma_y_min_mpa,sigma_u_min_mpa:r.sigma_u_min_mpa??r.sigma_u_mpa?.[0]??null,standard:r.standard,sources:r.sources}:null
 }
 // A round pipe «Труба 159x6 ГОСТ 8732-78», «Тр.140х4», «Ø273х8»: the standard (from the text or the sheet) whose lists
 // hold both D and t, mass 1 m by the formula of the standard M = 0,02466·t·(D − t) (checked against its tables).
 // `listed` false — the size is not in the sortament of any known standard: the mass is still geometry, the size is shown
 // for a check. A thickness out of the known range of a diameter (ГОСТ 8732) is also `listed` false.
 function pipeOf(text,{standard=""}={}){
  const t=String(text||"").replace(/\s+/g,"").replace(/[хХ×*]/g,"x").replace(/,/g,".");
  const m=/^(?:Тр\.?|Труба|Ø|ø)?(ВГП)?((?:[ЦРМНДП]-)*)(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/iu.exec(t);if(!m)return null;
  const D=Number(m[3]),th=Number(m[4]);if(!(th>0&&th<D/2))return null;
  // A water-gas pipe (ГОСТ 3262-75) is written by its conditional pass: «Труба 20×2,8 ГОСТ 3262-75», «Труба ВГП Ц-25х3,2» —
  // Ду 20 is D = 26,8. The row of the table gives D, the series and the mass; galvanized («Ц») is 3 % heavier.
  if(m[1]||m[2]||/3262/.test(standard+" "+text)){
   const rows=confirmed("pipes").filter(r=>r.kind==="pipe_rows"&&r.standard==="ГОСТ 3262-75").flatMap(r=>r.rows.map(x=>({...x,src:r})));
   const SERIES={light:"лёгкая",light_alt:"лёгкая",ordinary:"обыкновенная",reinforced:"усиленная"};
   for(const row of rows.filter(x=>x.DN===D).concat(rows.filter(x=>x.D_mm===D)))for(const k of Object.keys(SERIES))if(row[k]&&row[k][0]===th){
    const zinc=/Ц-/.test(m[2]||"");
    return{id:"pipe-3262-"+row.DN+"x"+th+(zinc?"-zn":""),designation:"Труба "+(zinc?"Ц-":"")+row.DN+"×"+th+" ГОСТ 3262-75",DN:row.DN,D_mm:row.D_mm,t_mm:th,series:SERIES[k],
     galvanized:zinc,shape3d:"round",standard:"ГОСТ 3262-75",standards:["ГОСТ 3262-75"],listed:true,A_cm2:Math.round(Math.PI*th*(row.D_mm-th))/100,
     mass_kg_m:zinc?Math.round(row[k][1]*103)/100:row[k][1],sources:row.src.sources,status:"confirmed"}
   }
   return{id:"pipe-3262-"+D+"x"+th,designation:"Труба "+D+"×"+th+" ГОСТ 3262-75",DN:D,D_mm:null,t_mm:th,shape3d:"round",standard:"ГОСТ 3262-75",standards:[],listed:false,
    A_cm2:null,mass_kg_m:null,sources:[],status:"needs_check",note:"нет такого сочетания условного прохода и стенки в табл. 1, 2"}
  }
  const stds=confirmed("pipes").filter(r=>r.kind==="pipe_standard"),cited=stds.filter(r=>new RegExp(r.standard.replace(/^ГОСТ\s*/,"").split("-")[0]).test(standard+" "+text));
  const fits=r=>r.diameters_mm.includes(D)&&r.thicknesses_mm.includes(th)&&
   !confirmed("pipes").some(x=>x.kind==="pipe_range"&&x.standard===r.standard&&x.D_mm===D&&(th<x.t_min_mm||th>x.t_max_mm));
  const pool=cited.length?cited:stds,hit=pool.filter(fits);
  return{id:"pipe-"+D+"x"+th,designation:"Труба "+D+"x"+th,D_mm:D,t_mm:th,shape3d:"round",
   standard:hit[0]?.standard||cited[0]?.standard||null,standards:hit.map(r=>r.standard),listed:hit.length>0,
   A_cm2:Math.round(Math.PI*th*(D-th))/100,mass_kg_m:Math.round(0.02466*th*(D-th)*100)/100,
   sources:[...new Set(pool.flatMap(r=>r.sources))],status:hit.length?"confirmed":"needs_check"}
 }
 // How two kinds of members are joined (connections.json): «beam»+«column», «beam-beam», «base», «truss»…
 // Confirmed records first; the rest are shown as needing a check, never used as a fact.
 function connectionsFor(a,b){
  const want=[a,b].filter(Boolean),all=list("connections").filter(r=>want.every(w=>r.joins?.includes(w)));
  return all.sort((x,y)=>(x.status==="confirmed"?0:1)-(y.status==="confirmed"?0:1))
 }
 // A standard as drawings cite it: «ГОСТ 7798-70», «ГОСТ7798», «ГОСТ Р ИСО 4014-2013», «DIN 933», «СТ РК ISO 4014-2012»,
 // «СП РК EN 1993-1-1:2005/2011», «НТП РК 03-01-1.1-2011», «СН РК 5.03-07-2013». The exact edition when the year is given,
 // otherwise the family; `kz_current` — the edition in force in Kazakhstan (Kazstandart catalog), `current` — in the RF.
 // The note warns first about Kazakhstan, where the company works: a standard replaced or not introduced there.
 function standardOf(text){
  const m=new RegExp(STD_SOURCE,"iu").exec(String(text||""));
  if(!m)return null;
  const want=normStd(m[1]),reg=list("standards-registry");
  const exact=reg.find(r=>normStd(r.designation)===want)||null;
  // An edition the registry has not got («ГОСТ 8239-72», «СП 28.13330.2017») still belongs to the family of its number.
  const number=exact?normStd(exact.number):want.replace(/(?:-(?:\d{2}|\d{4})|\.\d{4})$/,"");
  const family=reg.filter(r=>normStd(r.number)===number||normStd(r.number)===want);
  const current=family.find(r=>r.ru?.status==="in_force")||null,kzCurrent=family.find(r=>r.kz?.status==="in_force")||null;
  const r=exact||(family.length===1&&number===want?family[0]:null);
  if(!r&&!family.length){
   // «ГОСТ Р 21.501-2018» — an interstate standard written with «Р» by mistake: the registry row without it, said so.
   if(/^ГОСТР(?!ISO|EN)\d/.test(want)){
    const alt=standardOf(m[1].replace(/ГОСТ\s*Р\s*/u,"ГОСТ "));
    if(alt?.known)return{...alt,designation:m[1],note:m[1]+": в реестре — межгосударственный "+(alt.record||alt.family[0]).designation+" (без «Р»)"+(alt.note?"; "+alt.note:"")}
   }
   return{designation:m[1],known:false}
  }
  const KZ={replaced:"заменён",cancelled:"отменён",adopted_not_introduced:"принят, но не введён",not_in_force:"не действует",not_applicable:"не применяется (документ РФ)"};
  const RU={replaced:"заменён",cancelled:"отменён",not_in_force:"не действует",expired:"срок действия истёк"};
  let note="";
  if(r&&KZ[r.kz?.status])
   note=r.designation+": в РК "+KZ[r.kz.status]+(kzCurrent&&kzCurrent.id!==r.id?" — в РК действует "+kzCurrent.designation:r.kz.current?" — в РК действует "+r.kz.current:"")+(r.kz.note?"; "+r.kz.note:"");
  else if(r&&r.kz?.status!=="in_force"&&RU[r.ru?.status])
   note=r.designation+": в РФ "+RU[r.ru.status]+(current&&current.id!==r.id?" — действует "+current.designation:"")+
    (kzCurrent?"; в РК действует "+kzCurrent.designation:"; действие в РК проверить");
  else if(r&&r.status==="needs_check"&&r.kz?.status!=="in_force")
   note=r.designation+": действие в РК не подтверждено"+(r.kz?.note?" — "+r.kz.note:"");
  else if(!r&&number!==want)
   note=m[1]+": такой редакции нет в реестре"+(kzCurrent?" — в РК действует "+kzCurrent.designation:family.some(x=>x.kz?.status==="not_applicable")?" — документ РФ, в РК не применяется":
    family.some(x=>KZ[x.kz?.status])?" — в РК ни одна редакция не действует по каталогу":"; действие в РК проверить");
  else if(!r&&!kzCurrent&&family.some(x=>KZ[x.kz?.status]))
   note=m[1]+": в РК ни одна редакция не действует по каталогу";
  return{designation:m[1],known:true,record:r,family,current,kz_current:kzCurrent,group:(r||family[0]).group,item:(r||family[0]).item||null,note}
 }
 const summary=()=>{const {catalogs,problems}=load();return{catalogs:[...catalogs].map(([name,r])=>({name,records:r.length,confirmed:r.filter(x=>x.status==="confirmed").length})),problems}};
 return{list,get,confirmed,search,findProfile,pipeOf,plateOf,steelOf,connectionsFor,standardOf,summary,problems:()=>load().problems,reload:()=>{cache=null}}
}
module.exports={STD_SOURCE,normStd,createGlobalKnowledge,recordProblems,STATUSES,PROJECT_FIELDS,GLOBAL_DIR};
