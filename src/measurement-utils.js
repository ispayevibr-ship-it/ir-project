"use strict";
(()=>{
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
 const valueOf=w=>num(w?.volume)||num(w?.qty??w?.count)*num(w?.unit_volume??w?.volume_one??w?.volume1);
 const totals=items=>{
  const map=new Map();
  for(const w of Array.isArray(items)?items:[]){const unit=String(w?.unit||"").trim()||"ед.",key=clean(unit)||unit;if(!map.has(key))map.set(key,{unit,label:meta(unit).totalLabel,kind:meta(unit).kind,accent:meta(unit).accent,value:0});map.get(key).value+=valueOf(w)}
  return [...map.values()];
 };
 window.irMeasure={clean,meta,valueOf,totals};
})();