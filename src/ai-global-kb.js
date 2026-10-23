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
// МСП), СТО АСЧМ, DIN, ISO. One source for the sheet reader, the fastener reader and standardOf.
const STD_SOURCE="(ГОСТ\\s*Р?\\s*(?:ИСО|ISO|EN)?\\s*\\d+(?:\\.\\d+)*(?:-\\d+)*(?:-\\d{2,4})?"+
 "|(?:ҚР\\s*)?СТ\\s*РК\\s*(?:EN\\s*ISO|ИСО|ISO|EN|IEC|ASTM\\s*[A-Z]?)?\\s*\\d+(?:[.-]\\d+)*"+
 "|(?:СНиП|СП|СН|НТП|РДС|МСН|МСП)\\s*РК\\s*(?:EN\\s*)?\\d+(?:[.-]\\d+)*(?:\\(\\d+(?:\\.\\d+)*\\))?(?:[-:]\\d{4}(?:\\/\\d{4})?)?\\*?"+
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
  const t=String(text||"").replace(/\s+/g,"").replace(/[хХ×*]/g,"x").replace(/,/g,".");
  let m;
  // A pair «2L80х6», «2[16П» (two angles or channels back to back): the row of one, mass of the pair.
  if((m=/^2(?=[L∟\[]|Уг|Шв)(.+)$/u.exec(t))){const one=findProfile(m[1],{standard});return one&&{...one,pair:2,mass_single_kg_m:one.mass_kg_m,mass_kg_m:Math.round(one.mass_kg_m*200)/100}}
  // A channel is often written without the bracket in a «Сечение» column: «10У», «20П» — only channel suffixes.
  if((m=/^(\d+(?:\.5)?а?[УПЭЛ])$/u.exec(t)))return findProfile("["+m[1],{standard});
  if((m=/^(?:I|І|Двутавр|Дв\.?)(\d{2})$/iu.exec(t)))return confirmed("profiles-ibeams").find(r=>r.id==="ibeam-8239-"+m[1])||null;
  // Parallel flanges: ГОСТ Р 57837 («I30Ш2», «30Б1», «35К1,5») or ГОСТ 26020-83 (same numbers, other sizes; ДБ, ДШ).
  // The standard of the sheet decides, and only it; without it 57837 first, then 26020.
  if((m=/^(?:I|І|Двутавр|Дв\.?)?(\d{2,3})(ДБ|ДШ|[БШКбшкKk])(\d+(?:\.5)?)$/u.exec(t))){
   const key=m[1]+({K:"К",k:"К",б:"Б",ш:"Ш",к:"К"}[m[2]]||m[2])+m[3];
   const order=/26020/.test(standard+" "+text)?["26020"]:/57837/.test(standard+" "+text)?["57837"]:["57837","26020"];
   for(const std of order){const r=confirmed(std==="26020"?"profiles-ibeams-26020":"profiles-ibeams-parallel").find(x=>x.id==="ibeam-"+std+"-"+key);if(r)return r}
   return null
  }
  if((m=/^(?:\[|Швеллер|Шв\.?)(\d+(?:\.5)?а?)([УПЭЛ])$/iu.exec(t)))return confirmed("profiles-channels").find(r=>r.id==="channel-"+m[1].toLowerCase()+m[2].toUpperCase())||null;
  if((m=/^(?:L|∟|Уголок|Уг\.?)(\d+)x(\d+)(?:x(\d+(?:\.\d)?))?$/iu.exec(t))){
   // «75x6» or «75x75x6» — an equal-leg angle (ГОСТ 8509); «63x40x5» — unequal (ГОСТ 8510).
   const [b,c,d]=[m[1],m[2],m[3]];
   if(d&&b!==c)return confirmed("profiles-angles-unequal").find(r=>r.id==="angle-"+Number(b)+"x"+Number(c)+"x"+Number(d))||null;
   return confirmed("profiles-angles").find(r=>r.id==="angle-"+b+"x"+Number(d||c))||null
  }
  // A bent closed box (ГОСТ 30245-2003): «Гн.□100х4», «□120х80х5», «Профиль 120x80x5»; the table lists the larger side first.
  if((m=/^(?:Гн\.?|Профиль(?:гнутый)?(?:замкнутый)?)?(□)?(\d+)(?:x(\d+))?x(\d+(?:\.\d+)?)$/iu.exec(t))&&(m[1]||/^(?:Гн|Профиль)/iu.test(t))){
   const h=Number(m[2]),b=Number(m[3]||m[2]),s=Number(m[4]),rows=confirmed("profiles-box-30245");
   return rows.find(r=>r.id==="box-30245-"+Math.max(h,b)+"x"+Math.min(h,b)+"x"+s)||null
  }
  if(/^(?:Тр\.?|Труба|Ø|ø)\d/iu.test(t))return pipeOf(text,{standard});
  return null
 }
 // A plate «Лист 10», «Лист t=10», «-10х200», «PL10x200», «Лист 10х1500х6000 ГОСТ 19903-2015»: the thickness checked against
 // the sortament (ГОСТ 19903-2015), mass 1 m² = 7,85·t; with a width — mass 1 m of the strip. `listed` false — the
 // thickness is not in the list, shown for a check.
 function plateOf(text){
  const t=String(text||"").replace(/\s+/g,"").replace(/[хХ×*]/g,"x").replace(/,/g,".");
  const m=/^(?:Лист|Л\.?|PL|—|–|-)(?:t=|δ=?|s=)?(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?(?:x(\d+))?/iu.exec(t);if(!m)return null;
  const th=Number(m[1]),w=m[2]?Number(m[2]):null;if(!(th>0&&th<=400))return null;
  const std=confirmed("sheets").find(r=>r.kind==="sheet_standard"&&r.thicknesses_mm.includes(th))||null;
  return{id:"plate-"+th+(w?"x"+w:""),t_mm:th,width_mm:w,length_mm:m[3]?Number(m[3]):null,shape3d:"plate",
   standard:std?.standard||null,listed:Boolean(std),mass_kg_m2:Math.round(7.85*th*100)/100,
   mass_kg_m:w?Math.round(7.85*th*w/1000*100)/100:null,sources:std?.sources||[],status:std?"confirmed":"needs_check"}
 }
 // A round pipe «Труба 159x6 ГОСТ 8732-78», «Тр.140х4», «Ø273х8»: the standard (from the text or the sheet) whose lists
 // hold both D and t, mass 1 m by the formula of the standard M = 0,02466·t·(D − t) (checked against its tables).
 // `listed` false — the size is not in the sortament of any known standard: the mass is still geometry, the size is shown
 // for a check. A thickness out of the known range of a diameter (ГОСТ 8732) is also `listed` false.
 function pipeOf(text,{standard=""}={}){
  const t=String(text||"").replace(/\s+/g,"").replace(/[хХ×*]/g,"x").replace(/,/g,".");
  const m=/^(?:Тр\.?|Труба|Ø|ø)?(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/iu.exec(t);if(!m)return null;
  const D=Number(m[1]),th=Number(m[2]);if(!(th>0&&th<D/2))return null;
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
  const family=reg.filter(r=>normStd(r.number)===normStd(exact?.number||want)||normStd(r.number)===want);
  const current=family.find(r=>r.ru?.status==="in_force")||null,kzCurrent=family.find(r=>r.kz?.status==="in_force")||null;
  const r=exact||(family.length===1?family[0]:null);
  if(!r&&!family.length)return{designation:m[1],known:false};
  const KZ={replaced:"заменён",cancelled:"отменён",adopted_not_introduced:"принят, но не введён",not_in_force:"не действует"};
  const RU={replaced:"заменён",cancelled:"отменён",not_in_force:"не действует",expired:"срок действия истёк"};
  let note="";
  if(r&&KZ[r.kz?.status])
   note=r.designation+": в РК "+KZ[r.kz.status]+(kzCurrent&&kzCurrent.id!==r.id?" — в РК действует "+kzCurrent.designation:"")+(r.kz.note?"; "+r.kz.note:"");
  else if(r&&r.kz?.status!=="in_force"&&RU[r.ru?.status])
   note=r.designation+": в РФ "+RU[r.ru.status]+(current&&current.id!==r.id?" — действует "+current.designation:"")+
    (kzCurrent?"; в РК действует "+kzCurrent.designation:"; действие в РК проверить");
  else if(!r&&!kzCurrent&&family.some(x=>KZ[x.kz?.status]))
   note=m[1]+": в РК ни одна редакция не действует по каталогу";
  return{designation:m[1],known:true,record:r,family,current,kz_current:kzCurrent,group:(r||family[0]).group,item:(r||family[0]).item||null,note}
 }
 const summary=()=>{const {catalogs,problems}=load();return{catalogs:[...catalogs].map(([name,r])=>({name,records:r.length,confirmed:r.filter(x=>x.status==="confirmed").length})),problems}};
 return{list,get,confirmed,search,findProfile,pipeOf,plateOf,connectionsFor,standardOf,summary,problems:()=>load().problems,reload:()=>{cache=null}}
}
module.exports={STD_SOURCE,normStd,createGlobalKnowledge,recordProblems,STATUSES,PROJECT_FIELDS,GLOBAL_DIR};
