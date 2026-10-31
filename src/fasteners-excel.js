"use strict";
/*
 * Excel of the «Ведомость метизов»: columns «Наименование», «ГОСТ», «Кол-во, шт», «к.п.» (класс прочности); «Марка»
 * (куда идёт: «К-1:8; Б-2:4»), «Масса 1 шт.» and «Примечание» may be added. Served to the window as
 * ai-settings:fasteners-excel / -example (src/ai-ipc.js) — the installed preload passes only these channels.
 */
const path=require("node:path");
// (xlsx on first use: the header search is tested where the package is not installed)
const xlsx=()=>require("xlsx");
const clean=s=>String(s??"").trim().toLowerCase().replace(/ё/g,"е").replace(/\s+/g," ");
const toNum=v=>{if(typeof v==="number")return Number.isFinite(v)?v:NaN;const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return String(v??"").trim()&&Number.isFinite(n)?n:NaN};
const HEAD={
 name:/^(наименование|название|обозначение|метиз|name)(?![а-яёa-z])/,
 standard:/^(гост|стандарт|нормативный документ|нд|standard)(?![а-яёa-z])/,
 qty:/^(кол-?во|количество|кол\.?|qty|quantity)(?![а-яёa-z])/,
 cls:/^(к\.?\s*п\.?|кл(асс)?\.?\s*(пр(очности)?\.?)?|класс прочности)$/,
 marks:/^(марк[аи]|куда|где|узел|marks?)(?![а-яёa-z])/,
 mass:/^(масса|вес)\s*(1|одной|ед)/,
 note:/^(примечание|note)\b/
};
// The header row: the first of the first 15 rows with «Наименование» and the quantity.
function headerOf(rows){
 for(let i=0;i<Math.min(15,rows.length);i++){
  const cols={};rows[i].forEach((c,j)=>{const h=clean(c);for(const[k,re]of Object.entries(HEAD))if(cols[k]==null&&re.test(h))cols[k]=j});
  if(cols.name!=null&&cols.qty!=null)return{at:i,cols}
 }
 return null
}
function parseWorkbook(file){
 const XLSX=xlsx(),wb=XLSX.readFile(file,{cellDates:false}),rows=[];
 for(const sheetName of wb.SheetNames){
  const grid=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:"",raw:true}),head=headerOf(grid);if(!head)continue;
  const {cols}=head,cell=(r,k)=>cols[k]==null?"":r[cols[k]];
  for(const r of grid.slice(head.at+1)){
   const name=String(cell(r,"name")).replace(/\s+/g," ").trim(),std=String(cell(r,"standard")).replace(/\s+/g," ").trim(),qty=toNum(cell(r,"qty"));
   if(!name&&!std)continue;
   if(/^итого|^всего/i.test(name))continue;
   if(!Number.isFinite(qty))throw new Error(`«${name||std}»: не указано количество`);
   const cls=String(cell(r,"cls")).replace(",",".").trim(),mass=toNum(cell(r,"mass"));
   const text=std&&!name.replace(/\s/g,"").toLowerCase().includes(std.replace(/\s/g,"").toLowerCase())?name+" "+std:name||std;
   rows.push({text,name,standard:std,qty,strength_class:cls||null,marks:String(cell(r,"marks")).trim(),unit_mass_kg:Number.isFinite(mass)?mass:null,note:String(cell(r,"note")).trim()})
  }
  if(rows.length)break
 }
 if(!rows.length)throw new Error("Не найдены колонки «Наименование» и «Кол-во» или строки под ними");
 return{name:path.basename(file),rows}
}
async function select(dialog,win){
 const r=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"Excel",extensions:["xlsx","xls"]}]});
 if(r.canceled||!r.filePaths[0])return null;return parseWorkbook(r.filePaths[0])
}
async function saveExample(dialog,win){
 const r=await dialog.showSaveDialog(win,{defaultPath:"Пример_ведомости_метизов.xlsx",filters:[{name:"Excel",extensions:["xlsx"]}]});if(r.canceled||!r.filePath)return false;
 const XLSX=xlsx(),ws=XLSX.utils.aoa_to_sheet([["Наименование","ГОСТ","Кол-во, шт","к.п.","Марка (необязательно)"],
  ["Болт М20-6gх60","ГОСТ 7798-70",120,"8.8","К-1:8; Б-2:4"],["Гайка М20-6Н","ГОСТ 5915-70",120,"8",""],["Шайба 20","ГОСТ 11371-78",240,"",""],
  ["Болт М24-6gх80","ГОСТ Р 52644-2006",64,"10.9",""]]);
 ws["!cols"]=[{wch:28},{wch:20},{wch:12},{wch:8},{wch:26}];
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Метизы");
 try{XLSX.writeFile(wb,r.filePath)}catch(err){if(["EBUSY","EPERM","EACCES"].includes(err?.code))throw new Error("Файл с таким именем уже открыт. Закройте его или выберите другое имя.");throw err}
 return r.filePath
}
module.exports={parseWorkbook,select,saveExample,headerOf};
