"use strict";
/*
 * IR Project AI: fasteners (метизы) as drawings write them — «Болт М20-6gх60.58 ГОСТ 7798-70», «Гайка М20-6Н.110
 * ГОСТ 22354-77», «Шайба А.12.01.08кп.016 ГОСТ 11371-78», «Болт 1.1.М20х800.ВСт3пс2 ГОСТ 24379.1-2012».
 * parseFastener reads one designation into its parts; fastenerInfo adds sizes and mass from the global knowledge
 * base (knowledge/global/fasteners.json) — only from confirmed rows, a missing value stays null.
 * A fastener is never a shipping mark and never a rolled section.
 */
const ITEM=[
 ["anchor",/фундаментн\S*\s+болт|анкерн\S*\s+болт|^анкер/iu],["bolt",/^болт|болт[ыа]?\b/iu],["nut",/^гайк|гайк[аи]\b/iu],
 ["washer",/^шайб|шайб[аы]\b/iu],["stud",/^шпильк/iu],["screw",/^(?:саморез|шуруп|винт)/iu],["rivet",/^заклёп|^заклеп/iu],["pin",/^(?:штифт|шплинт)/iu]
];
// The item of a standard, when the word is missing: «М20х60.88 ГОСТ 7798-70» is a bolt.
const STANDARD_ITEM=[
 [/^ГОСТ(?:Р)?(7798|7805|7796|7795|15589|15591|22353|52644)\b/u,"bolt"],[/^ГОСТ(?:Р)?(5915|5927|15526|22354|52645)\b/u,"nut"],
 [/^ГОСТ(?:Р)?(11371|6958|22355|52646|10906|10907|6402)\b/u,"washer"],[/^ГОСТ24379/u,"anchor"],[/^ГОСТ(2203\d|2204[0-3]|9066)\b/u,"stud"],
 [/^ГОСТ32484\.[13]/u,"bolt"],[/^ГОСТ32484\.[45]/u,"washer"],
 [/^DIN(93[13]|931|960|961)$|^ISO401[47]$/u,"bolt"],[/^DIN934$|^ISO4032$/u,"nut"],[/^DIN(125|127|9021|6916)$/u,"washer"],
 [/^DIN975$/u,"stud"],[/^DIN7504/u,"screw"]
];
const HIGH_STANDARD=/^ГОСТ(?:Р)?(22353|22354|22355|22356|52644|52645|52646|32484)/u;
// Strength class written without the dot: 58 = 5.8, 109 = 10.9.
const CLASS_CODE={"46":"4.6","48":"4.8","56":"5.6","58":"5.8","66":"6.6","68":"6.8","88":"8.8","98":"9.8","109":"10.9","129":"12.9"};
const STEEL=/(?:\d{2}Х\d?[А-ЯЁ\d]*|\d{2}Г2С(?:-\d+)?|09Г2С(?:-\d+)?|ВСт\d[а-я]*\d?|Ст\d[а-я]*\d?|65Г|08кп|10кп)/u;
const LOOK={M:"М",H:"Н",X:"Х",C:"С",A:"А",B:"В",K:"К",P:"Р",T:"Т",O:"О",E:"Е"};
// The registry of standards (knowledge/global/standards-registry.json) names the item of ~300 fastener standards.
let globalKb=null;
const kb=()=>{if(!globalKb){try{globalKb=require("./ai-global-kb").createGlobalKnowledge()}catch{globalKb={standardOf:()=>null}}}return globalKb};
const REGISTRY_ITEM={bolt:"bolt",anchor:"anchor",screw:"screw",woodscrew:"screw",nut:"nut",washer:"washer",stud:"stud",rivet:"rivet",pin:"pin"};
const num=s=>s==null||s===""?null:Number(String(s).replace(",","."));
// Latin lookalikes, the «х» of sizes, spaces and decimal commas into one form: «М20x60.88ГОСТ7798-70».
function compact(text){
 return String(text||"")
  .replace(/(^|[^A-Za-z])([MHXCABKPTOE])(?=[\d.\s\-]|$)/g,(m,p,c)=>p+LOOK[c])
  .replace(/([\dA-Za-z])\s*[хХxX×*]\s*(?=\d)/g,"$1x")
  .replace(/ГОСТ\s*Р\s*/gu,"ГОСТР").replace(/СТ\s*РК\s*/gu,"СТРК")
  // Separate groups stay apart: «1900 09Г2С» is a length and a steel, not «190009Г2С».
  .replace(/(\d)\s+(?=\d)/g,"$1.").replace(/\s+/g,"")
}
function standardOf(c){
 const m=/(ГОСТР?(?:ИСО|ISO)?\d+(?:\.\d+)*(?:-\d{2,4})?|СТРК(?:ENISO|ИСО|ISO|EN|ASTM[A-Z]?)?\d+(?:-\d+)*|DIN(?:EN)?(?:ISO)?\d+[A-Z]?|ISO\d+)/u.exec(c);
 return m?m[1]:""
}
// One designation; null when the text names no fastener.
function parseFastener(text){
 const raw=String(text||"").trim();if(!raw)return null;
 const word=raw.replace(/^[\d.\s-]*(?=[А-ЯЁа-яё])/u,"");
 let item=(ITEM.find(([,re])=>re.test(word))||[])[0]||"";
 const c=compact(raw),std=standardOf(c),stdKey=std.replace(/^(ГОСТР?(?:ИСО|ISO)?)(\d+(?:\.\d+)?).*/u,"$1$2");
 if(!item&&std)item=(STANDARD_ITEM.find(([re])=>re.test(std))||[])[1]||"";
 const cited=std?kb().standardOf(raw):null;
 if(!item&&cited?.group==="fastener")item=REGISTRY_ITEM[cited.item]||"";

 if(!item)return null;
 // The body: from the size to the standard, without the item word.
 const body=c.replace(std,"").replace(/^[^М\d]*?(?=\d?\.?\d?\.?М\d|\d|[АС2]\.\d)/u,"").replace(/^(?:Болт|Гайка|Шайба|Шпилька|Анкер)\S*?(?=[\dМАС])/iu,"");
 const out={item,raw,standard:cited?.record?.designation||std.replace(/^ГОСТР/u,"ГОСТ Р ").replace(/^ГОСТ(?=[\dИI])/u,"ГОСТ ").replace(/(ИСО|ISO)(?=\d)/u,"$1 ").replace(/^DIN/u,"DIN ").replace(/^ISO/u,"ISO "),
  d_mm:null,pitch_mm:null,length_mm:null,strength_class:null,tensile_MPa:null,steel:null,climatic:null,execution:null,type:null,high_strength:false};
 let m;
 if(item==="anchor"||/^ГОСТ24379/u.test(std)){
  // «1.1.М20х800.ВСт3пс2», «4.2.М100х6х1900 09Г2С-6»: type.execution.
  if((m=/(\d)\.(\d)\.?М(\d+)(?:x(\d+(?:[.,]\d+)?)(?=x))?(?:x(\d{2,5}))?/u.exec(body))){
   out.item="anchor";out.type=Number(m[1]);out.execution=Number(m[2]);out.d_mm=num(m[3]);out.pitch_mm=num(m[4]);out.length_mm=num(m[5])
  }else if((m=/М(\d+)(?:x(\d{2,5}))?/u.exec(body))){out.d_mm=num(m[1]);out.length_mm=num(m[2])}
 }else if(item==="washer"){
  // «20», «А.12.01.08кп.016», «С.20», «2.12.01», «8Л», «12.02.Ст3.016», «М20».
  if((m=/^(?:([АС])\.?|(2)\.)?М?(\d{1,2})(ОТ|Л|Н|Т)?(?=$|[.\s]|[А-ЯЁа-яё])/u.exec(body))){
   out.d_mm=num(m[3]);out.execution=m[1]||(m[2]?"2":null);out.type=m[4]||null
  }
 }else if((item==="screw"||item==="pin"||item==="rivet")&&(m=/^(\d+(?:[.,]\d)?)x(\d{1,3})/u.exec(body))){
  // «Саморез 4,8х19 DIN 7504K», «Штифт 6х30», «Заклёпка 4х10».
  out.d_mm=num(m[1]);out.length_mm=num(m[2])
 }else if(item==="bolt"&&(m=/^(\d)\.(\d)\.?М(\d+)(?:x(\d+(?:[.,]\d+)?)(?=x))?(?:x(\d{2,4}))?/u.exec(body))){
  // ГОСТ Р 52644: «2.1 М22×75 10.9» — body execution . head execution.
  out.execution=m[1]+"."+m[2];out.d_mm=num(m[3]);out.pitch_mm=num(m[4]);out.length_mm=num(m[5])
 }else if((m=/^(\d)?М(\d+)(?:x(\d+(?:[.,]\d+)?))?-(\d[a-zA-Zа-яА-Я])(?:x(\d{2,4}))?(?:\.(\d{1,3}))?/u.exec(body))||
  (m=/^(\d)?М(\d+)(?:x(\d(?:[.,]\d+)?)(?=x))?()(?:x(\d{2,4}))?(?:\.(\d{1,3}))?/u.exec(body))){
  // «2М12х1,25-6gх60.109», «М20-6gх60.58», «М20х60.88», «М20.8» (a nut of class 8).
  out.execution=m[1]?Number(m[1]):null;out.d_mm=num(m[2]);out.pitch_mm=num(m[3]);out.length_mm=item==="nut"?null:num(m[5]);
  const code=m[6];
  if(code){
   if(item==="nut"&&/^(4|5|6|8|9|10|12)$/.test(code))out.strength_class=code;
   else if(CLASS_CODE[code])out.strength_class=CLASS_CODE[code];
   else if(Number(code)>=100)out.tensile_MPa=Number(code)*10
  }
 }
 // «кл. 8.8», «класса прочности 5.8», a free «10.9».
 if(!out.strength_class&&(m=/(?:кл(?:асс)?[а-я.]*(?:прочности)?\s*)?\b(4\.6|4\.8|5\.6|5\.8|6\.8|8\.8|10\.9|12\.9)\b/iu.exec(raw)))out.strength_class=m[1];
 if((m=new RegExp("(?<!\\d)("+STEEL.source+")","u").exec(body)))out.steel=m[1];
 if((m=/ХЛ1?|\bУ1\b/u.exec(c)))out.climatic=m[0];
 out.standard_note=cited?.note||"";
 out.high_strength=HIGH_STANDARD.test(std)||/высокопрочн/iu.test(raw)||Number(out.tensile_MPa)>=1000||["10.9","12.9"].includes(out.strength_class)||(item==="nut"&&["10","12"].includes(out.strength_class));
 if(!out.d_mm)return out.standard?out:null;
 out.key=stdKey;
 return out
}
const STD_ROW={"ГОСТ7798":"bolt-7798","ГОСТР52644":"bolt-52644","ГОСТР52645":"nut-52645","ГОСТ6958":"washer-6958","ГОСТ22353":"bolt-22353","ГОСТ5915":"nut-5915","ГОСТ22354":"nut-22354","ГОСТ11371":"washer-11371","ГОСТР52646":"washer-52646"};
// Sizes and mass of one parsed fastener from the confirmed rows of the global base; the source says where from.
function fastenerInfo(f,kb){
 if(!f?.d_mm||!kb)return null;
 const confirmed=kb.confirmed("fasteners"),pick=id=>confirmed.find(r=>r.id===id)||null;
 const prefix=STD_ROW[f.key]||null;
 const row=prefix?pick(prefix+"-"+(prefix.startsWith("washer")?"":"M")+f.d_mm):null;
 const out={row:row?.id||null,standard:row?.standard||null,sources:row?.sources||[],mass_kg:null,dims:{}};
 if(!row)return out;
 for(const k of ["S_mm","k_mm","m_mm","e_min_mm","b_mm","d2_mm","s_mm","pitch_mm"])if(row[k]!=null)out.dims[k]=row[k];
 if(row.kind==="washer"){
  const hole=f.execution==="С"?row.d1_C_mm:row.d1_A_mm;if(hole)out.dims.d1_mm=hole;
  const w=f.execution==="2"?row.mass_kg_1000_exec2:f.execution==="С"?row.mass_kg_1000_C:row.mass_kg_1000_A;
  if(w)out.mass_kg=w/1000
 }else if(row.mass_kg_1000)out.mass_kg=row.mass_kg_1000/1000;
 else if(row.mass_kg_1000_by_length&&f.length_mm){const w=row.mass_kg_1000_by_length[String(f.length_mm)];if(w)out.mass_kg=w/1000}
 return out
}
const isFastener=text=>Boolean(parseFastener(text));
module.exports={parseFastener,fastenerInfo,isFastener,compact};
