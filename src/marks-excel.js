"use strict";
const {dialog}=require("electron");
const path=require("path");
const XLSX=require("xlsx");
const clean=s=>String(s??"").trim().toLowerCase().replace(/ё/g,"е").replace(/²/g,"2").replace(/³/g,"3").replace(/\s+/g," ");
const toNum=v=>{if(typeof v==="number")return Number.isFinite(v)?v:NaN;const s=String(v??"").trim().replace(/\s/g,"").replace(",",".");const n=Number(s);return Number.isFinite(n)?n:NaN};
const pick=(row,names)=>{for(const [k,v] of Object.entries(row||{})){if(names.includes(clean(k)))return v}return""};
function parseWorkbook(file){
 const wb=XLSX.readFile(file,{cellDates:false,cellFormula:true}),sheet=wb.Sheets[wb.SheetNames[0]];
 if(!sheet)throw new Error("В Excel-файле нет листов");
 const source=XLSX.utils.sheet_to_json(sheet,{defval:"",raw:true}),rows=[];
 for(const row of source){
  const mark=String(pick(row,["марка","mark"])||"").trim();
  const name=String(pick(row,["наименование","название","name"])||"").trim();
  const qty=toNum(pick(row,["кол-во","количество","кол во","qty","quantity"]));
  const unitVolume=toNum(pick(row,["объем 1 ед.","объём 1 ед.","объем 1 ед","объём 1 ед","вес 1 ед.","вес 1 ед","площадь 1 ед.","площадь 1 ед","длина 1 ед.","длина 1 ед","volume 1","unit volume"]));
  const exactTotal=toNum(pick(row,["общий объем","общий объём","общая площадь","общий вес","общая длина","итого","total"]));
  if(!mark&&!name&&!Number.isFinite(qty)&&!Number.isFinite(unitVolume)&&!Number.isFinite(exactTotal))continue;
  if(!mark)throw new Error("В одной из строк не заполнена колонка «Марка»");
  if(!Number.isFinite(qty))throw new Error(`Марка «${mark}»: неверное количество`);
  if(!Number.isFinite(unitVolume))throw new Error(`Марка «${mark}»: неверное значение «Объём 1 ед.»`);
  rows.push({mark,name,qty,unit_volume:unitVolume,total_value:Number.isFinite(exactTotal)?exactTotal:qty*unitVolume});
 }
 if(!rows.length)throw new Error("В Excel-файле не найдено строк ведомости");
 return{name:path.basename(file),rows};
}
async function select(win){const r=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"Excel",extensions:["xlsx","xls"]}]});if(r.canceled||!r.filePaths[0])return null;return parseWorkbook(r.filePaths[0])}
function writeExample(wb,file){
 try{XLSX.writeFile(wb,file);return file}catch(err){
  if(["EBUSY","EPERM","EACCES"].includes(err?.code))throw new Error("Файл с таким именем уже открыт. Закройте его или выберите другое имя — сохранить поверх открытого файла нельзя.");
  throw err;
 }
}
async function saveExample(win){
 const r=await dialog.showSaveDialog(win,{defaultPath:"Пример_ведомости_марок.xlsx",filters:[{name:"Excel",extensions:["xlsx"]}]});if(r.canceled||!r.filePath)return false;
 const ws=XLSX.utils.aoa_to_sheet([["Марка","Наименование","Кол-во","Объём 1 ед.","Общий объём"],["М1","Колонна К1",4,0.245,0.98],["Б1","Балка Б1",2,0.138,0.276]]);
 ws["!cols"]=[{wch:18},{wch:32},{wch:12},{wch:18},{wch:18}];
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Ведомость");return writeExample(wb,r.filePath);
}
module.exports={select,saveExample,parseWorkbook};
