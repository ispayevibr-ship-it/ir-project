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
 ["Ф","column","fahwerk","Фахверк / ферма"],
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
].map(([code,kind,group,name])=>({code,kind,group,name}));
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
 ["Ог",null,null,"Ограждение"],["Огк",null,null,"Ограждение"],["Лш",null,null,"Лестница"],["Лм",null,null,"Лестничный марш"],["Пл",null,null,"Площадка"]
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
module.exports={MIXED_CODES,MARK_CODES,KIND_BY_CODE,markCode,prefixOf,sheetTitleKind,schemeTitleKind};
