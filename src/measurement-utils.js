"use strict";
(()=>{
 // Visual labels only; source work types and IDs are preserved.
 const labels={
  metal:["Металлоконструкция","Монтаж металлоконструкций","Поставка металлоконструкций"],
  sandwich:["Сэндвич-панели","Монтаж сэндвич-панелей","Поставка сэндвич-панелей"],
  profile:["Профнастил","Монтаж профнастила","Поставка профнастила"]
 };
 const normalizeName=v=>String(v??"").trim().toLowerCase().replace(/ё/g,"е")
  .replace(/\s+/g," ").replace(/\s*[-–—]\s*/g,"-").replace(/^(?:монтаж|поставка)\s+/,"");
 // Preserve descriptive Cyrillic tails (боксов, кровли, веншахт).
 // Numeric drawing identifiers stay untouched.
 const parseWork=raw=>{
  const m=normalizeName(raw).match(/^(металлоконструкция|металлоконструкции|металлоконструкций|сэндвич-панель|сэндвич-панели|сэндвич-панелей|профнастил|профнастила)(\s+[а-яё]+(?:[\s-][а-яё]+)*)?$/u);
  if(!m)return null;
  const kind=m[1].startsWith("металло")?"metal":m[1].startsWith("сэндвич")?"sandwich":"profile";
  return{kind,suffix:m[2]||""}
 };
 const workKind=raw=>parseWork(raw)?.kind||null;
 const formatName=(raw,context="base")=>{
  const parsed=parseWork(raw);
  if(!parsed)return String(raw??"");
  const noun=parsed.kind==="metal"&&parsed.suffix&&context==="base"?"Металлоконструкции":
   labels[parsed.kind][context==="mount"?1:context==="delivery"?2:0];
  return noun+parsed.suffix
 };
 window.irWorkNames={category:workKind,format:formatName,base:v=>formatName(v),mount:v=>formatName(v,"mount"),delivery:v=>formatName(v,"delivery")};
 const clean=u=>String(u||"").trim().toLowerCase().replace(/²/g,"2").replace(/³/g,"3").replace(/\s+/g,"");
 const meta=unit=>{
  const u=clean(unit);
  if(["тн","т","тонна","тонн","kg","кг"].includes(u))return{kind:"mass",totalLabel:"Общий вес",itemLabel:"Вес 1 ед.",accent:"blue"};
  if(["м2","m2","кв.м","квм"].includes(u))return{kind:"area",totalLabel:"Общая площадь",itemLabel:"Площадь 1 ед.",accent:"violet"};
  if(["м3","m3","куб.м","кубм"].includes(u))return{kind:"volume",totalLabel:"Общий объём",itemLabel:"Объём 1 ед.",accent:"green"};
  if(["м","m","пог.м","погм","п.м"].includes(u))return{kind:"length",totalLabel:"Общая длина",itemLabel:"Длина 1 ед.",accent:"cyan"};
  if(["шт","шт.","ед","ед.","компл","комплект","комп."].includes(u))return{kind:"count",totalLabel:"Общее количество",itemLabel:"Количество",accent:"amber"};
  return{kind:"other",totalLabel:"Общий объём",itemLabel:"Объём 1 ед.",accent:"slate"};
 };
 const num=v=>Number(String(v??0).replace(",","."))||0;
 const valueOf=w=>{const direct=num(w?.volume),q=num(w?.qty??w?.count),uv=num(w?.unit_volume??w?.volume_one??w?.volume1),hasMark=Boolean(String(w?.mark_id||w?.mark||"").trim());return direct||(uv?q*uv:(!hasMark?q:0))};
 const totals=items=>{
  const map=new Map();
  for(const w of Array.isArray(items)?items:[]){
   const unit=String(w?.unit||"").trim()||"ед.",workType=String(w?.work_type||w?.type||"Работа").trim(),code=String(w?.project_code||w?.code||"").trim(),m=meta(unit),key=[workType.toLowerCase(),code.toLowerCase(),clean(unit)||unit].join("|");
   if(!map.has(key))map.set(key,{unit,workType,projectCode:code,label:code?`${m.totalLabel} · ${code}`:m.totalLabel,kind:m.kind,accent:m.accent,value:0});
   map.get(key).value+=valueOf(w);
  }
  return [...map.values()];
 };
 window.irMeasure={clean,meta,valueOf,totals};
})();