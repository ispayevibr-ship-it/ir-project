"use strict";
/*
 * What a КМ/КМД drawing set means: letter codes of shipping marks (ГОСТ 26047-2016, приложение А, plus
 * codes common in КМД practice), sheet titles (ГОСТ 21.502-2016) and how a mark becomes a scheme element.
 * The drawing still decides: a mark drawn as a line on a plan is a member whatever its letters say.
 */
// Longest prefix wins: "СВ" before "С", "ФС" before "Ф". kind: geometry used when the drawing does not tell;
// null means "decide by the sheet and the position". group: group in the montage scheme.
const MARK_CODES=[
 ["К","column","columns","Колонна"],
 ["КФ","column","fahwerk","Колонна фахверка"],
 ["ТФ","column","fahwerk","Стойка фахверка"],
 ["СФ","brace","ties","Связь фонаря"],
 ["СК","column","posts","Стойка"],
 ["СТ","column","posts","Стойка"],
 ["С","column","posts","Стойка"],
 // Ф is a truss in ГОСТ 26047, but КМД sets often use it for wind posts and girts: a post unless drawn as a line.
 ["Ф","column","fahwerk","Фахверк / ферма",true],
 ["ФС","beam","beams","Ферма стропильная"],
 ["ФП","beam","beams","Ферма подстропильная"],
 ["ФН","beam","beams","Фонарь"],
 ["Б","beam","beams","Балка"],
 ["БК","beam","beams","Балка подкрановая"],
 ["БП","beam","beams","Балка подстропильная"],
 ["БР","beam","beams","Балка рабочей площадки"],
 ["БМ","beam","beams","Балка под монорельс"],
 ["БТ","beam","beams","Балка тормозная"],
 ["БН","beam","beams","Балка"],
 ["Р","beam","girders","Ригель"],
 ["РР","beam","girders","Ригель рамы"],
 ["РФ","beam","girders","Ригель фахверка"],
 ["РС","beam","spacers","Распорка"],
 ["П","beam","purlins","Прогон"],
 ["ПР","beam","purlins","Прогон"],
 ["СВ","brace","ties","Связь вертикальная"],
 ["ВС","brace","ties","Связь вертикальная"],
 ["СГ","brace","ties","Связь горизонтальная"],
 ["ГС","brace","ties","Связь горизонтальная"],
 ["Т","brace","ties","Тяж"],
 // "В" is a brace on some projects and a beam or post on others: position decides.
 ["В",null,null,"Элемент"],
 ["Л",null,null,"Лестница"],
 ["ЛМ",null,null,"Лестничный марш"],
 ["ПЛ",null,null,"Площадка"],
 ["О",null,null,"Ограждение"]
// loose: a letter used for anything on some sets — its kind is only a guess where the scheme does not say otherwise.
].map(([code,kind,group,name,loose])=>({code,kind,group,name,...(loose?{loose}:{})}));
// Codes written in mixed case on many КМ sets (Kazakhstan and others): "Фс1", "Сгф3", "Свк2". The case matters:
// "Бк" is a column base, "БК" a crane girder. Checked before the upper-case table, longest first.
const MIXED_CODES=[
 ["Фс","beam","beams","Ферма стропильная"],["Фп","beam","beams","Ферма подстропильная"],
 ["Св","brace","ties","Связь вертикальная"],["Свк","brace","ties","Связь вертикальная по колоннам"],["Свф","brace","ties","Связь вертикальная по фермам"],
 ["Сг","brace","ties","Связь горизонтальная"],["Сгф","brace","ties","Связь горизонтальная по фермам"],["Сгк","brace","ties","Связь горизонтальная"],
 ["Вс","brace","ties","Связь вертикальная"],
 ["Рп","beam","spacers","Распорка"],["Рпф","beam","spacers","Распорка по фермам"],["Рпк","beam","spacers","Распорка по колоннам"],
 ["Рр","beam","girders","Ригель рамы"],["Рц","beam","girders","Ригель"],["Ро","beam","girders","Ригель"],["Рн","beam","girders","Ригель"],
 ["Бп","beam","beams","Балка проёма"],["Бл","beam","beams","Балка"],["Бф","beam","beams","Балка фахверка"],["Бкр","beam","beams","Балка крановая"],
 ["Тб","beam","beams","Тормозная балка"],["Ст","column","posts","Стойка"],["Ос","column","posts","Стойка"],
 ["Бк",null,null,"База колонны"],["Кр",null,null,"Кронштейн"],["Крв",null,null,"Кронштейн"],["Крк",null,null,"Кронштейн"],["Кс",null,null,"Элемент"],
 ["Ог",null,null,"Ограждение"],["Огк",null,null,"Ограждение"],["Лш","beam","fahwerk","Листовой шарнир"],["Лм",null,null,"Лестничный марш"],["Пл",null,null,"Площадка"]
].map(([code,kind,group,name])=>({code,kind,group,name}));
const LOOKALIKE={A:"А",B:"В",C:"С",E:"Е",H:"Н",K:"К",M:"М",O:"О",P:"Р",T:"Т",X:"Х"};
const prefixOf=mark=>[...String(mark||"").trim().toUpperCase().replace(/[^A-ZА-ЯЁ].*$/u,"")].map(c=>LOOKALIKE[c]||c).join("");
function markCode(mark){
 const raw=String(mark||"").trim().replace(/[^A-Za-zА-Яа-яЁё].*$/u,"");
 if(/[а-яё]/u.test(raw))for(let n=raw.length;n>1;n--){const hit=MIXED_CODES.find(c=>c.code===raw.slice(0,n));if(hit)return hit}
 const p=prefixOf(mark);
 for(let n=p.length;n>0;n--){const hit=MARK_CODES.find(c=>c.code===p.slice(0,n));if(hit)return hit}
 return null
}
// Prefix → kind, for the plan extractor.
const KIND_BY_CODE=Object.fromEntries(MARK_CODES.filter(c=>c.kind).map(c=>[c.code,c.kind]));

// Sheet titles of a КМ/КМД set (stamp name or title over a view).
const SHEET_TITLES=[
 [/общие\s+данные|титульн|пояснительн|ведомость\s+(рабочих|ссылочных|основных)/iu,"general"],
 [/спецификац|ведомость\s+(элементов|металлопроката|отправочных|марок)|техническая\s+спецификация/iu,"list"],
 [/схема\s+(расположения|монтажная)|монтажная\s+схема|план\s+(балок|покрытия|перекрытия|колонн|связей|прогонов)|развертка|развёртка/iu,"montage"],
 [/узл[ыа]?(?![а-яё])|узел|разрез|сечени[ея]/iu,"section"]
];
function sheetTitleKind(title){for(const [re,kind] of SHEET_TITLES)if(re.test(String(title||"")))return kind;return null}
// Element kind written in a scheme title: "Схема расположения колонн", "… прогонов", "… вертикальных связей".
function schemeTitleKind(title){
 const t=String(title||"").toLowerCase();
 if(/колонн|стоек|стойк/.test(t))return"column";
 if(/связ/.test(t))return"brace";
 if(/балок|балк|ригел|прогон|покрыт|перекрыт|путей|ферм|распор|площад|фонар|настил/.test(t))return"beam";
 return null
}
// ---- A sheet of a КМД: montage or assembly, by the sheet itself (the engineer, 31.10.2026: «объедини кмд монтажные и
// сборочные в одно, сделай так чтобы программа их сама различала»). One file often holds both: the montage schemes М1.x
// and the drawings of the shipping marks. "КМД монтажные" — the montage schemes (М1, М1.1 … of the stamp or the sheet
// number), the general data, the lists of marks and elements, nodes and sections, a scheme with axes; "КМД сборочные" —
// the drawing of a shipping mark («Требуется изготовить», «Спецификация на отправочную марку», the views of a mark with
// its parts); null — the sheet says nothing (lettering as curves, a sheet of notes): the file and the set decide.
const KMD_MOUNTING="КМД монтажные",KMD_ASSEMBLY="КМД сборочные";
const KMD_LEGACY=new Set([KMD_MOUNTING,KMD_ASSEMBLY]);
const isKmd=kind=>kind==="КМД"||KMD_LEGACY.has(kind);
// (М1, М1.1, M2.3 — a montage sheet's number in the stamp's name or in its sheet field; С1 — the specification of the set)
const MOUNT_NO=/(?:^|[\s·,;(])[МM]\s?\d+(?:\.\d+)*(?=$|[\s·,;)])/u;
const MOUNT_NO_DOTTED=/(?:^|[\s·,;(])[МM]\s?\d+(?:\.\d+)+(?=$|[\s·,;)])/u;
function kmdSheetType(p){return kmdEvidence(p).strong}
// {strong, weak}: what decides the sheet by itself, and what only leans (the text «Требуется…» of the notes of a КМ
// scheme, views titled by a mark on a montage sheet) — a lean counts when the file says nothing.
function kmdEvidence(p){
 const sheet=p?.sheet||{},st=sheet.stamp||{},name=String(st.name||""),no=String(st.block?.sheet||"").trim();
 const titles=(p?.context?.titles||[]).join(" · "),titled=sheetTitleKind(name),text=String(p?.context?.text||"");
 // (the titles of its drawings: «Схема расположения…», «Ведомость рабочих чертежей…» — the stamp is often unread)
 const titleKinds=new Set((p?.context?.titles||[]).map(sheetTitleKind));
 const schemes=(p?.schemes||[]).filter(s=>!s.error);
 const out=(strong,weak)=>({strong:strong||null,weak:weak||strong||null});
 // (a sheet number М1.1 decides; a bare «М1» may be the mark of an embedded part — after «Требуется изготовить»)
 if(MOUNT_NO_DOTTED.test(name)||/^[МMСC]\s?\d/u.test(no)||titled==="montage")return out(KMD_MOUNTING);
 if(titleKinds.has("montage")||/монтажн[а-яё]*\s+схем|схем[аы]\s+(?:монтажн|расположения)/iu.test(titles))return out(KMD_MOUNTING);
 const views=(sheet.views||[]).some(v=>v.marks?.length),parts=(sheet.spec||[]).some(x=>x.parts?.length);
 if(sheet.required?.length||/спецификация\s+на\s+отправочн/iu.test(titles+" "+text)||sheet.assemblyText&&(views||parts))return out(KMD_ASSEMBLY);
 // (a grid of axes after «Требуется изготовить»: a node drawn on an assembly sheet can look like one)
 if(MOUNT_NO.test(name)||schemes.some(s=>(s.axesX?.length||0)+(s.axesY?.length||0)>=3))return out(KMD_MOUNTING);
 // (a stamp naming the elements of its marks — «Колонна К184, К185 · Спецификация металла», the second sheet of an
 // assembly drawing — is not the specification of the set)
 const named=/(?:колонн|балк|ригел|стойк|связ|ферм|прогон|лестниц|стремянк|площадк|огражден|кронштейн|марш|опор|распорк|подкос|сегмент|рам[аы])[а-яё]*\s+(?:[A-ZА-ЯЁ]{1,3}[-‐–]?\d)/iu.test(name);
 if(!named&&(titled==="general"||titled==="list"||titleKinds.has("general")||/ведомость\s+(?:отправочных|марок|элементов)/iu.test(titles)))return out(KMD_MOUNTING);
 if(views||parts||sheet.assemblyText||named)return out(null,KMD_ASSEMBLY);
 if(schemes.length||titled==="section")return out(null,KMD_MOUNTING);
 return out(null)
}
// The sheets of one КМД file (each its own kind when the sheet tells it; the rest as most sheets of the file, else as
// the engineer gave the file before, else by its name (л.М1.4), else as the sheet leans, else unknown — the set
// decides): [{type, by}] in their order.
const KMD_BY={sheet:"по листу",file:"по другим листам файла",engineer:"как указал инженер",name:"по имени файла",set:"по комплекту",default:"не определён — как монтажный"};
function kmdFileTypes(pages,{name="",hint=""}={}){
 const ev=(pages||[]).map(kmdEvidence),own=ev.map(e=>e.strong),a=own.filter(t=>t===KMD_ASSEMBLY).length,m=own.filter(t=>t===KMD_MOUNTING).length;
 const file=a>m?KMD_ASSEMBLY:m>a?KMD_MOUNTING:null;
 const base=String(name).replace(/\.[a-z0-9]+$/i,"");
 const named=MOUNT_NO.test(base.replace(/(?:^|[^А-ЯЁA-Z])л\.\s?(?=[МM]\d)/giu," "))||/монтаж|схем[аы]\s+(?:расположения|монтажн)/iu.test(base)?KMD_MOUNTING:
  /сборочн|отправочн/iu.test(base)?KMD_ASSEMBLY:null;
 return own.map((t,i)=>t?{type:t,by:"sheet"}:file?{type:file,by:"file"}:KMD_LEGACY.has(hint)?{type:hint,by:"engineer"}:named?{type:named,by:"name"}:
  ev[i].weak?{type:ev[i].weak,by:"sheet"}:{type:null,by:"default"})
}
// What is still unknown takes the kind most sheets of the set have; with none, a montage sheet (it is placed, and the
// image goes to Claude). pages: the КМД sheets of the set with {docType, docTypeBy}; changes them in place.
function kmdSetTypes(pages){
 const known=(pages||[]).filter(p=>p.docTypeBy&&p.docTypeBy!=="default"&&p.docTypeBy!=="set");
 const a=known.filter(p=>p.docType===KMD_ASSEMBLY).length,m=known.length-a;
 for(const p of pages||[])if(p.docTypeBy==="default"||p.docTypeBy==="set"){
  if(a>m){p.docType=KMD_ASSEMBLY;p.docTypeBy="set"}else{p.docType=KMD_MOUNTING;p.docTypeBy=m>a?"set":"default"}
 }
 return pages
}
module.exports={MIXED_CODES,MARK_CODES,KIND_BY_CODE,markCode,prefixOf,sheetTitleKind,schemeTitleKind,
 KMD_MOUNTING,KMD_ASSEMBLY,KMD_LEGACY,KMD_BY,isKmd,kmdSheetType,kmdEvidence,kmdFileTypes,kmdSetTypes};
