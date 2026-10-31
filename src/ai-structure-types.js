/*
 * IR Project: the catalog of structure types — one list for the whole program.
 * What a drawing element is (a column, a crane girder, a tank wall, a nozzle…), how it is recognised (shipping
 * mark letters by ГОСТ 26047 and КМД practice, words of its name), which group it belongs to on the montage
 * scheme, how it is placed (geometry) and how it is drawn in 3D. Used by the PDF analysis, the placement, the
 * montage scheme page, the 3D view, the marks register and the request to Claude.
 * Works in Node (require) and in the page (window.irStructureTypes).
 */
(function(root){
"use strict";
// geometry: column — a point with a bottom and a top; beam — a line at a level; brace — a line between two
// levels; shell — a cylinder (tank wall); plate — a disc or a ring lying flat; fitting — tank equipment (a pipe with
// a flange…). shape: how 3D draws it (see scheme-three-view.js).
const GROUPS=[
 // Frames (КМ/КМД)
 ["columns","Колонны",0x2563eb],["fahwerk","Фахверк",0x8b40de],["posts","Стойки",0x87951e],
 ["beams","Балки",0x008c86],["crane","Подкрановые пути и кран-балки",0xb23a48],["girders","Ригели",0xf07818],
 ["purlins","Прогоны",0x009fce],["spacers","Распорки",0xcf5b32],["ties","Связи",0xdd9b13],["trusses","Фермы",0x994bdb],
 ["stairs","Лестницы",0x526dbe],["platforms","Площадки",0x8c99b8],["guards","Ограждения",0x7590a8],
 ["brackets","Кронштейны, опорные столики",0x6d8f3a],["embeds","Закладные, анкеры, базы",0x7a6a58],
 ["cladding","Ограждающие конструкции",0x9aa5b1],["trims","Нащельники, доборные элементы",0x8d7b68],["openings","Ворота, двери, окна",0x5e7f99],
 // Tanks (РВС, РВСП, РГС)
 ["tanks","Резервуар, чан (стенка)",0x7f9bb8],["bottom","Днище",0x6b7f95],["roof","Крыша резервуара",0x008c86],
 ["nozzles","Патрубки, люки, оборудование",0xc0392b],["rings","Кольца жёсткости",0x4f6d7a],
 // Joints: welds (ГОСТ 5264, 8713, 14771) and fasteners (bolts, nuts, washers) — shown as their own layers.
 ["welds","Сварные швы",0xe8590c],["fasteners","Метизы",0x495057],
 // Technology (ТХ)
 ["equipment","Технологическое оборудование",0x2f855a],["pipes","Трубопроводы",0x3182ce],["supports","Опоры трубопроводов",0x718096],
 ["other","Прочее",0x586e84]
].map(([key,label,color])=>({key,label,color}));
const T=(key,name,group,geometry,shape,marks,words,extra)=>({key,name,group,geometry,shape,marks:marks||[],words:words||null,...(extra||{})});
const TYPES=[
 // Columns and posts
 T("column","Колонна","columns","column","ibeam",["К","Кн","Ко"],/колонн/iu),
 T("column_fahwerk","Колонна фахверка","fahwerk","column","ibeam",["КФ","ТФ","Кф"],/(?:колонн|стойк)\S*\s+фахверк/iu),
 T("fahwerk","Элемент фахверка","fahwerk","column","ibeam",[],/фахверк/iu),
 T("post","Стойка","posts","column","ibeam",["С","СК","СТ","Ст","Ос"],/стойк/iu),
 T("crane_column","Колонна под кран","columns","column","ibeam",["КП"],/колонн\S*\s+(?:под\s+)?кран|подкранов\S*\s+колонн/iu),
 // Beams
 T("beam","Балка","beams","beam","ibeam",["Б","БН","Бл","Бн"],/балк/iu),
 T("crane_girder","Балка подкрановая","crane","beam","ibeam",["БК","Бкр"],/подкранов|крановая\s+балк/iu),
 // A crane rail (Р43, КР70) lies on its crane girder: «Р» of its mark is not a girder (ригель).
 T("crane_rail","Рельс крановый","crane","beam","ibeam",[],/(?:^|[^о]|(?:^|[^н])о|(?:^|[^о])но|(?:^|[^м])оно)рельс/iu),
 T("crane_runway","Кран-балка, монорельс","crane","beam","ibeam",["БМ","Мр"],/кран[\s-]*балк|монорельс|подвесн\S*\s+(?:кран|пут)|пут[ьи]\s+подвесн/iu),
 T("brake_beam","Балка тормозная","crane","beam","ibeam",["БТ","Тб"],/тормозн/iu),
 T("platform_beam","Балка рабочей площадки","beams","beam","ibeam",["БР"],/балк\S*\s+(?:рабоч|площадк)/iu),
 T("sub_beam","Балка подстропильная","beams","beam","ibeam",["БП"],/подстропильн\S*\s+балк|балк\S*\s+подстропильн/iu),
 T("opening_beam","Балка проёма","beams","beam","ibeam",["Бп"],/балк\S*\s+про[её]м|перемычк/iu),
 // Girders, purlins, spacers
 T("girder","Ригель","girders","beam","ibeam",["Р","РР","Рр","Рц","Ро","Рн"],/ригел/iu),
 // (a wall girder — «стеновой ригель» — is of the framing: the analysis found them so, the register names them so)
 T("girder_fahwerk","Ригель фахверка","fahwerk","beam","channel",["РФ","Рф"],/ригел\S*\s+фахверк|стенов\S*\s+ригел|ригел\S*\s+стенов/iu),
 // A leaf hinge «Лш» (КМ, узел крепления колонны торцевого фахверка: a sheet −10 between the column under the end truss
 // and the column of the framing, bolted at both ends; it bends across the wall and carries the wind along it) — not a
 // shaft ladder; it lies flat between the columns (the engineer, 28.10.2026: «лестница проходит сквозь стеновой ригель»
 // — «Лш1 −t10» of the register had been taken for a ladder 21 m high).
 T("plate_hinge","Листовой шарнир","fahwerk","beam","plate",["Лш"],/листов\S*\s+шарнир/iu),
 T("purlin","Прогон","purlins","beam","channel",["П","ПР","Пр","Пс","Пк"],/прогон/iu),
 T("spacer","Распорка","spacers","beam","round",["РС","Рп","Рпф","Рпк"],/распорк/iu),
 // Bracing
 T("brace_vertical","Связь вертикальная","ties","brace","angle",["СВ","ВС","Св","Свк","Свф","Вс"],/связ\S*\s+вертикал|вертикальн\S*\s+связ/iu),
 T("brace_horizontal","Связь горизонтальная","ties","brace","angle",["СГ","ГС","Сг","Сгф","Сгк"],/связ\S*\s+горизонт|горизонтальн\S*\s+связ/iu),
 // «Раскос» alone is a brace; a diagonal of a truss («раскос фермы») stays with the truss.
 T("brace","Связь","ties","brace","angle",["СФ"],/связ|раскос(?![а-яё]*\s+(?:\S+\s+)?ферм)/iu),
 // «Тяж» as a word, not inside «вытяжной» (a platform of a supply-and-exhaust unit is not a tie rod).
 T("tie_rod","Тяж","ties","brace","round",["Т"],/(?:^|[^а-яё])тяж/iu),
 T("strut","Подкос","ties","brace","angle",[],/подкос/iu),
 // Trusses
 T("truss","Ферма стропильная","trusses","beam","truss",["Ф","ФС","Фс","ВП","НП"],/ферм/iu),
 T("sub_truss","Ферма подстропильная","trusses","beam","truss",["ФП","Фп"],/подстропильн\S*\s+ферм|ферм\S*\s+подстропильн/iu),
 T("lantern","Фонарь","trusses","beam","truss",["ФН"],/фонар/iu),
 // Stairs, platforms, railings
 // Stairs (ГОСТ 23120-2016, серия 1.450.3-7.94; tanks — ГОСТ 31385): flights at 45° or 60° (tanks ≤ 50°), landings,
 // shaft and ring (spiral) stairs of tanks, ladders with cage hoops. Г — hot-rolled, Х — cold-formed profiles.
 T("stair_flight","Лестничный марш","stairs","brace","stair",["ЛГФ","ЛГВ","ЛГР","ЛХФ","ЛХВ","ЛХР","ЛМ","Лм","МЛ","Л"],/марш|косоур|тетив|ступен/iu),
 T("stair_landing","Площадка лестницы","stairs","plate","plate",["ПГФ","ПГВ","ПГР","ПХФ","ПХВ","ПХР","П1Х","П2Х","П1Г","П2Г"],/площадк\S*\s+лестниц|лестничн\S*\s+площадк|переходн\S*\s+площадк/iu),
 T("stair_shaft","Шахтная лестница","stairs","column","stair",["Ш"],/шахтн\S*\s+лестниц/iu),
 T("stair_spiral","Кольцевая (винтовая) лестница","stairs","brace","stair",[],/кольцев\S*\s+лестниц|винтов\S*\s+лестниц|спиральн\S*\s+лестниц/iu),
 T("ladder","Стремянка","stairs","column","ladder",["СХ","Стр"],/стремянк|вертикальн\S*\s+лестниц|лестниц\S*\s+вертикальн/iu),
 T("stair","Лестница","stairs","brace","stair",[],/лестниц/iu),
 T("platform","Площадка","platforms","plate","plate",["ПЛ","Пл","Н"],/площадк|настил\s+площад/iu),
 // A railing: posts, the handrail (поручень) on top, a middle rail and the toe board (бортовая полоса) below.
 T("railing","Ограждение","guards","beam","rail",["О","Ог","Огк","ОГ","ОГМ","ОГП","ОПБГ","ОПТГ","ОПБХ","ОПТХ","ОЛГ","ОЛХ","ОСГ","ОСХ"],/ограждени|перил|поручн|поручен|бортов\S*\s+(?:полос|лист|элемент)/iu),
 // Small parts
 T("bracket","Кронштейн, столик","brackets","column","ibeam",["Кр","Крв","Крк"],/кронштейн|столик/iu),
 T("base","База колонны, анкер","embeds","column","plate",["Бк","АБ"],/баз[аы]\s+колонн|анкер|фундаментн\S*\s+болт/iu),
 T("embed","Закладная деталь","embeds","column","plate",["МН","ЗД"],/закладн/iu),
 // Joints (ГОСТ 5264, 8713, 14771, 23518; ГОСТ 7798, 5915, 11371, 22353–22356): shown on the montage scheme.
 T("weld_butt","Сварной шов стыковой","welds","beam","weld",[],/стыков\S*\s+(?:сварн\S*\s+)?шов|шов\s+стыков|вертикальн\S*\s+шов|горизонтальн\S*\s+шов|кольцев\S*\s+шов/iu),
 T("weld_fillet","Сварной шов угловой, уторный","welds","beam","weld",[],/уторн|углов\S*\s+(?:сварн\S*\s+)?шов/iu),
 T("weld_lap","Сварной шов нахлёсточный","welds","beam","weld",[],/нахлёсточн|нахлесточн|шов\s+внахлест/iu),
 T("weld","Сварной шов","welds","beam","weld",[],/(?:^|\s)(?:шов|швы)(?![а-яё])/iu),
 T("bolt","Болты, гайки, шайбы (метизы)","fasteners","column","bolt",[],/(?:^|\s)(?:болт|гайк|шайб|шпильк|метиз|винт)/iu),
 // Cladding and openings (АР, КМ)
 T("sheeting","Профнастил, листы покрытия","cladding","plate","plate",["ПН"],/профнастил|профлист|настил|лист\S*\s+покрыти/iu,{placeByDefault:false}),
 T("sandwich","Сэндвич-панель","cladding","plate","plate",["СП"],/сэндвич|трёхслойн|трехслойн/iu,{placeByDefault:false,needs:"АР"}),
 // Sandwich panels and the trims of АР (ТЗ 2.3.1 of 24.10.2026): placed only when АР is in the set (the engineer: «сэндвич-
 // панели не показывай без ар»). A wall panel (a field of panels) lies along its lower edge, its height up; a roof panel
 // from the eave to the ridge, its width across. Trims lie along their line of installation.
 T("sandwich_wall","Стеновая сэндвич-панель","cladding","beam","panel",[],/стенов\S*\s+(?:сэндвич|тр[её]хслойн|панел)|(?:сэндвич|тр[её]хслойн)\S*\s*-?\s*панел\S*\s+(?:\S+\s+)?стен|панел\S*\s+стенов/iu,{needs:"АР",fitting:"panel"}),
 T("sandwich_roof","Кровельная сэндвич-панель","cladding","beam","panel",[],/кровельн\S*\s+(?:сэндвич|тр[её]хслойн|панел)|(?:сэндвич|тр[её]хслойн)\S*\s*-?\s*панел\S*\s+(?:\S+\s+)?(?:кровл|кровел|покрыти)|панел\S*\s+(?:кровл|покрыти)/iu,{needs:"АР",fitting:"panel"}),
 T("trim_corner","Нащельник угловой (наружный, внутренний)","trims","beam","trim",[],/углов\S*\s+нащельник|нащельник\S*\s+(?:\S+\s+)?углов|(?:наружн|внешн|внутренн)\S*\s+(?:угл\S*\s+)?(?:нащельник|доборн)/iu,{needs:"АР",fitting:"trim"}),
 T("trim_joint","Нащельник стыка (вертикальный, горизонтальный)","trims","beam","trim",[],/нащельник\S*\s+(?:\S+\s+)?стык|стыков\S*\s+нащельник|(?:вертикальн|горизонтальн)\S*\s+нащельник/iu,{needs:"АР",fitting:"trim"}),
 T("trim_plinth","Цокольная планка","trims","beam","trim",[],/цокол\S*\s+(?:планк|отлив|нащельник|элемент|доборн|профил)|(?:планк|отлив|нащельник)\S*\s+(?:\S+\s+)?цокол/iu,{needs:"АР",fitting:"trim"}),
 T("trim_start","Стартовый, завершающий профиль","trims","beam","trim",[],/(?:стартов|завершающ|финишн)\S*\s+(?:профил|планк|элемент|нащельник)/iu,{needs:"АР",fitting:"trim"}),
 T("trim_ridge","Коньковый элемент","trims","beam","trim",[],/коньков\S*\s+(?:элемент|планк|нащельник|доборн|накладк)|(?:планк|элемент|нащельник|накладк)\S*\s+коньк|^\s*кон[её]к(?![а-яё])/iu,{needs:"АР",fitting:"trim"}),
 T("trim_eaves","Карнизная планка","trims","beam","trim",[],/карнизн\S*\s+(?:планк|элемент|нащельник|свес|доборн)|(?:планк|нащельник)\S*\s+(?:\S+\s+)?карниз|капельник/iu,{needs:"АР",fitting:"trim"}),
 T("trim_gable","Торцевая, ветровая планка","trims","beam","trim",[],/(?:ветров|торцев|фронтон)\S*\s+(?:планк|нащельник|доборн)|(?:планк|нащельник)\S*\s+(?:\S+\s+)?(?:торц|фронтон)/iu,{needs:"АР",fitting:"trim"}),
 T("trim_sill","Отлив, оконный элемент","trims","beam","trim",[],/отлив|оконн\S*\s+(?:нащельник|планк|откос|доборн|элемент)|откос\S*\s+(?:окон|окн)/iu,{needs:"АР",fitting:"trim"}),
 T("trim_opening","Обрамление дверного, воротного проёма","trims","beam","trim",[],/нащельник\S*\s+(?:\S+\s+){0,2}(?:двер|ворот|про[её]м)|(?:дверн|воротн)\S*\s+(?:нащельник|откос|доборн|обрамлени)|обрамлени\S*\s+(?:дверн|воротн|двер|ворот)/iu,{needs:"АР",fitting:"trim"}),
 T("trim_parapet","Парапетная крышка","trims","beam","trim",[],/парапетн\S*\s+(?:крышк|планк|нащельник|отлив|элемент|фартук)|(?:крышк|нащельник|планк|отлив|фартук)\S*\s+(?:\S+\s+)?парапет/iu,{needs:"АР",fitting:"trim"}),
 T("trim_abutment","Примыкание кровли к стене","trims","beam","trim",[],/(?:планк|нащельник|элемент|фартук)\S*\s+(?:\S+\s+)?примыкани|примыкани\S*\s+(?:кровл|покрыти)|(?:^|\s)фартук/iu,{needs:"АР",fitting:"trim"}),
 T("trim_drain","Водосток (жёлоб, труба)","trims","beam","trim",[],/водосточ|водосток|водоотводящ\S*\s+(?:ж[её]лоб|элемент|планк)/iu,{needs:"АР",fitting:"trim"}),
 T("trim","Фасонный, доборный элемент","trims","beam","trim",[],/нащельник|доборн\S*\s+(?:элемент|издели|планк)|фасонн\S*\s+(?:элемент|издели|планк)|^\s*планк\S*\s+(?:\S+\s+)?(?:фасад|стен|кровл)/iu,{needs:"АР",fitting:"trim"}),
 T("gate","Ворота","openings","column","frame",["ВР"],/ворот/iu),
 T("door","Дверь","openings","column","frame",["Д","ДН"],/двер/iu),
 T("window","Окно, витраж","openings","column","frame",["ОК"],/окн[оа]|витраж/iu),
 // Tanks: the wall, the bottom, the roof and the equipment (ГОСТ 31385, ГОСТ Р 52910)
 T("tank_wall","Стенка резервуара","tanks","shell","shell",[],/стенк\S*(?:\s+резервуар)?|пояс\S*\s+стенк/iu),
 // Vessels on supports (чан, сгуститель, бункер, ёмкость с конусом): the wall of segments, the cone below it, posts and
 // their struts, the toothed weir at the top, the small parts of the segment joints.
 T("vessel_shell","Сегмент (обечайка) стенки чана, ёмкости","tanks","shell","shell",[],/сегмент|обечайк/iu),
 T("vessel_cone","Конус (коническое днище) чана, ёмкости","bottom","shell","shell",[],/конус|коническ\S*\s+дн/iu),
 T("vessel_support","Опорная стойка чана, ёмкости","posts","column","ibeam",[],/опорн\S*\s+стойк|стойк\S*\s+опор/iu),
 // A strut of a vessel only when the name says so: «подкос» of a platform is a strut of the platform.
 T("vessel_strut","Подкос опоры чана, ёмкости","ties","brace","round",[],/(?:подкос|раскос)\S*\s+(?:\S+\s+){0,2}(?:чан|[её]мкост|аппарат|сосуд)/iu),
 T("vessel_weir","Зубчатое ограждение (переливной порог)","rings","shell","shell",[],/зубчат\S*\s+огражд|перелив\S*\s+порог|водослив/iu),
 T("vessel_detail","Деталь стыка (стяжка, петля, направляющая)","fasteners","column","box",[],/стяжк|петл[яиь]|направляющ/iu),
 T("tank_annular","Окрайка днища","bottom","plate","plate",["ОК"],/окрайк/iu),
 T("tank_bottom","Днище","bottom","plate","plate",[],/днищ|полотнищ\S*\s+днищ/iu),
 // Roof (ГОСТ 31385: frame cone roof of radial members, shield roof, frameless roof): its parts.
 // (a tank's roof is «крыша»; «покрытие», «стропильная» of a building are not it — ГПЭС «Балка покрытия Б1», «Ферма
 // стропильная Фс1», «Ферма подстропильная Фп1» are beams and trusses)
 T("roof_shield","Щит покрытия","roof","shell","shell",["Щ","ЩП","ЩК"],/щит/iu),
 T("roof_central_ring","Центральное кольцо крыши","roof","plate","ring",["ЦК"],/центральн\S*\s+кольц/iu),
 T("roof_support_ring","Опорное кольцо крыши","rings","plate","ring",["ОК"],/опорн\S*\s+кольц|кольц\S*\s+опорн/iu),
 T("roof_rafter","Балка (элемент) каркаса крыши","roof","beam","ibeam",["РБ"],/элемент\S*\s+(?:крыш|покрыти)|радиальн\S*\s+балк|балк\S*\s+(?:каркас\S*\s+)?крыш|каркас\S*\s+крыш/iu),
 T("roof_deck","Настил крыши (листы покрытия)","roof","plate","plate",[],/настил\S*\s+крыш|лист\S*\s+настил\S*\s+крыш/iu),
 T("tank_roof","Крыша резервуара","roof","beam","ibeam",[],/^\s*крыш|(?:крыш|покрыти)\S*\s+резервуар/iu),
 T("tank_ring","Кольцо жёсткости / ветровое","rings","plate","ring",[],/кольц\S*\s+(?:жестк|жёстк|ветров|орошен)|ветров\S*\s+кольц/iu),
 T("tank_bottom_beam","Балка под днищем","bottom","beam","ibeam",[],/балк\S*\s+под\s+дн/iu),
 // The end stop of a crane runway — not the stop of a tank wall.
 T("crane_stop","Упор тупиковый (кранового пути)","crane","column","box",[],/тупиков|упор\S*\s+(?:\S+\s+)?(?:кран|пут[иья]|рельс)/iu),
 T("tank_stop","Упор стенки (по окрайке днища)","bottom","column","plate",[],/^\s*упор(?![а-яё]*\s+(?:лестниц|площадк))/iu),
 T("roll_frame","Каркас наворачивания рулона (оснастка)","other","column","frame",[],/наворачивани|каркас\S*\s+(?:рулон|для\s+рулон)/iu,{placeByDefault:false}),
 T("shipping","Контейнер, тара для отправки","other","column","box",[],/контейнер|(?:^|\s)тара(?![а-яё])/iu,{placeByDefault:false}),
 T("montage_ring","Монтажное кольцо, монтажная стойка (временные)","other","plate","ring",[],/монтажн\S*\s+(?:кольц|стойк|приспособ)/iu),
 T("rung_ladder","Ступени-скобы","stairs","column","ladder",[],/ступен\S*\s*-?\s*скоб|скоб\S*\s+(?:ходов|ступен)/iu),
 T("reinforcing_plate","Усиливающий лист (накладка) патрубка","nozzles","plate","plate",[],/усиливающ|накладк\S*\s+(?:патруб|люк)/iu),
 T("flange","Фланец, заглушка","nozzles","fitting","nozzle",[],/фланц|фланец|заглушк/iu,{fitting:"nozzle"}),
 T("heater","Подогреватель (змеевик)","equipment","beam","round",[],/подогреват|змеевик/iu),
 T("mixer","Мешалка, устройство размыва","equipment","fitting","nozzle",[],/мешалк|размыв/iu,{fitting:"nozzle"}),
 T("grounding","Заземление, токоотвод","embeds","column","plate",[],/заземл|токоотвод/iu),
 T("pontoon","Понтон, плавающая крыша","roof","plate","plate",[],/понтон|плавающ\S*\s+крыш/iu),
 T("manhole","Люк-лаз","nozzles","fitting","manhole",["ЛЛ"],/люк\s*-?\s*лаз|лаз(?![а-яё])|придонн\S*\s+(?:очистн|люк)|очистн\S*\s+люк/iu,{fitting:"manhole"}),
 T("roof_hatch","Люк на крыше","nozzles","fitting","hatch",["ЛС","ЛЗ"],/люк\s+(?:светов|замерн|монтажн|смотров|обслуживани)|(?:светов|замерн|монтажн|смотров)\S*\s+люк/iu,{fitting:"hatch"}),
 T("valve","Клапан, огнепреградитель","nozzles","fitting","valve",["КДМ","НДКМ","СМДК","КПГ","ОП"],/клапан|огне\s*-?\s*преград|огнепрегр|хлопушк|задвижк|затвор|вентил(?:ь|я)(?![а-яё]*ци)/iu,{fitting:"valve"}),
 T("foam","Пеногенератор, КНП","nozzles","fitting","foam",["ГПСС","КНП"],/пеногенерат|генератор\s+пен|камер\S*\s+(?:низкократн|пен)/iu,{fitting:"foam"}),
 T("instrument","Уровнемер, датчик, пробоотборник","nozzles","fitting","sensor",["ПСР","ПП"],/уровнемер|сигнализатор|датчик|извещател|пробоотборн/iu,{fitting:"sensor"}),
 T("lightning","Молниеприёмник","nozzles","fitting","rod",[],/молние(?:приемн|приёмн|отвод)/iu,{fitting:"rod"}),
 T("nozzle","Патрубок","nozzles","fitting","nozzle",["ПМ","ППР","ПВ","ПРУ"],/патруб|штуцер|кран\s+сифон|сифон|ПРУ|ППР|переливн|сливн|наливн|загрузочн|раздаточн|приёмн|приемн|зачистн|дренаж|(?:^|\s)КИП|^\s*технологическ\S*\s*$/iu,{fitting:"nozzle"}),
 // Technology (ТХ)
 T("vessel","Аппарат, ёмкость","equipment","shell","shell",[],/аппарат|ёмкост|емкост|сосуд|сепаратор|колонн\S*\s+аппарат/iu),
 T("pump","Насос, агрегат","equipment","column","box",[],/насос|агрегат|компрессор|вентилятор/iu),
 T("pipe","Трубопровод","pipes","beam","round",[],/трубопровод|коллектор/iu),
 T("pipe_support","Опора трубопровода","supports","column","ibeam",["ОПТ"],/опор\S*\s+(?:труб|трубопровод)|эстакад/iu),
 // A conveyor gallery: a closed span at height between its supports (two side trusses, floor and roof).
 T("gallery","Галерея (конвейерная, переходная)","trusses","beam","truss",[],/галере/iu),
 // «Оп1» of a KM set — a support of a conveyor or a gallery (a column-like frame); «ОП» upper case stays a fire arrester.
 T("support","Опора (конвейера, галереи)","supports","column","ibeam",["Оп"],/^\s*опор[аыи](?![а-яё])|рам\S*\s+под\s+(?:оборудован|привод|двигател|редуктор|насос|агрегат|конвейер)/iu),
 // Sheet structures with ribs (ТХ, КМ): a bunker, a chute, a trough.
 T("bunker","Бункер, течка, жёлоб","other","column","box",[],/бункер|(?:^|[^у])течк|ж[её]лоб/iu),
 T("mast","Мачта, башня, вышка","other","column","box",[],/мачт|башн|вышк/iu),
 // Equipment of a process line (ТХ): mounted on its frames and supports, not a steel member.
 T("conveyor","Конвейер, питатель, дозатор, грохот","equipment","beam","box",[],/конвейер|транспорт[её]р|питател|дозатор|грохот|дробилк/iu),
 // A part of a node named on its own (КМД positions): a gusset, a stiffener, a splice plate, a base plate, a traverse,
 // a spacer between paired angles. Only when the name starts with it («Подвеска пути (рёбра t16)» is not one).
 T("node_detail","Деталь узла (фасонка, ребро, накладка, плита, траверса, прокладка)","other","plate","plate",[],/^\s*(?:фасонк|р[её]бр|накладк|опорн\S*\s+плит|траверс|прокладк|сухар)/iu)
];
const byKey=new Map(TYPES.map(t=>[t.key,t]));
const groupByKey=new Map(GROUPS.map(g=>[g.key,g]));
// Specific names first: "колонна фахверка" before "колонна", "балка подкрановая" before "балка",
// "люк-лаз" before "патрубок", "связь вертикальная" before "связь".
const NAME_ORDER=["trim_corner","trim_joint","trim_plinth","trim_start","trim_ridge","trim_eaves","trim_gable","trim_parapet","trim_abutment","trim_sill","trim_opening","trim_drain","trim","sandwich_wall","sandwich_roof","crane_column","column_fahwerk","girder_fahwerk","plate_hinge","crane_rail","crane_girder","crane_runway","brake_beam","platform_beam","sub_beam","opening_beam",
 "sub_truss","brace_vertical","brace_horizontal","vessel_detail","tie_rod","fahwerk","weld_fillet","weld_lap","weld_butt","weld","rung_ladder","reinforcing_plate","montage_ring",
 "vessel_weir","vessel_detail","vessel_strut","strut","vessel_support","vessel_cone","vessel_shell","roll_frame","shipping","tank_bottom_beam","crane_stop","tank_stop","tank_annular","tank_wall","tank_bottom","roof_central_ring","roof_support_ring","roof_shield","roof_rafter","roof_deck","tank_ring","pontoon","tank_roof","manhole","roof_hatch","valve","foam",
 "instrument","lightning","heater","mixer","flange","nozzle","grounding","bolt","vessel","pump","pipe_support","gallery","support","bunker","mast","conveyor","pipe","sheeting","sandwich","gate","door","window","bracket","base","embed",
 "stair_shaft","stair_spiral","ladder","stair_landing","stair_flight","stair","platform","railing","column","post","beam","girder","purlin","spacer","brace","truss","lantern","node_detail"];
// What an element is by the words of its name ("Балка подкрановая", "Патрубок приемно-раздаточный").
// Words learned from drawings (Claude's lessons, checked lessons of the repository): {key, words} — a phrase met in
// names of real sets ("щит покрытия укрупнённый", "кольцо жёсткости"); checked before the built-in words.
const learnedWords=[];
function learn(list){
 learnedWords.length=0;
 for(const l of Array.isArray(list)?list:[]){const t=byKey.get(l?.key);const re=t&&wordRe((Array.isArray(l.words)?l.words:[]).filter(w=>String(w).trim().length>=4));
  if(re)learnedWords.push({t,re:new RegExp(re,"iu")})}
 return learnedWords.length
}
function typeByWords(s){
 for(const l of learnedWords)if(l.re.test(s))return l.t;
 // "Ограждение площадки", "Ограждение лестницы" — a railing: the first word names the element.
 if(/^\s*(ограждени|перил|поручн)/iu.test(s))return byKey.get("railing");
 // The deck of a platform, a raised floor, a walkway, a landing («Площадка … — настил», «Фальшпол … — настил −Риф.5»,
 // «Настил площадки»): a platform — not the sheeting of a roof (its card said «ограждающая конструкция — стена или кровля»).
 if(/настил|рифл[её]н/iu.test(s)&&/площадк|фальшпол|мостик|крыльц|риф\.|рифл[её]н|ромб/iu.test(s)&&!/профнастил|профлист|кровл|покрыти/iu.test(s))
  return byKey.get(/лестниц/iu.test(s)?"stair_landing":"platform");
 for(const k of NAME_ORDER){const t=byKey.get(k);if(t?.words&&t.words.test(s))return t}
 return null
}
// "Площадка приточно-вытяжной установки (юг) — колонна 30К1", "Лестница Лм1 — балка I25Б1": the words after the dash
// name the member, the words before it the structure it belongs to. The member wins when it is of another geometry
// (a column of a platform is a column); of the same geometry the whole name is the more exact one ("Балка площадки").
// A railing named first stays a railing (its posts and rails).
function typeByName(name){
 const s=String(name||"");if(!s.trim())return null;
 const whole=typeByWords(s),parts=s.split(/\s+[—–]\s+/u);
 // "Горизонтальная связь Сгк1 L100×8 (тормозная ферма)": the words in brackets name the structure the member is part
 // of. The name without them wins when it is of another geometry (a brace of the braking truss is a brace, not a beam).
 const bare=s.replace(/\([^()]*\)/gu," ");
 if(bare!==s&&whole){const own=typeByWords(bare);if(own&&own.geometry!==whole.geometry)return typeByName(bare)}
 if(parts.length<2||whole?.key==="railing")return whole;
 const tail=parts[parts.length-1],part=typeByWords(tail);
 if(!part||whole&&whole.geometry===part.geometry)return whole;
 // The member's word with the structure's name: "балка" + "Площадка …" — a beam of a platform.
 const both=typeByWords(tail.split(/[\s,]+/u)[0]+" "+parts.slice(0,-1).join(" "));
 return both&&both.geometry===part.geometry?both:part
}
const LOOKALIKE={A:"А",B:"В",C:"С",E:"Е",H:"Н",K:"К",M:"М",O:"О",P:"Р",T:"Т",X:"Х"};
// What an element is by its shipping mark ("БК3" → crane girder): the longest code that the mark starts with and
// that is followed by a digit; mixed case ("Фс", "Свк") is matched as written first.
function typeByMark(mark){
 const m=/^([A-Za-zА-ЯЁа-яё]{1,4})\s?[-–]?\s?\d/u.exec(String(mark||"").trim());if(!m)return null;
 const raw=m[1],up=[...raw].map(c=>LOOKALIKE[c]||c).join("").toUpperCase();
 let best=null;
 for(const t of TYPES)for(const code of t.marks){
  const exact=code===raw,upper=code===code.toUpperCase()&&code===up;
  if((exact||upper)&&(!best||code.length>best.code.length||exact&&!best.exact))best={t,code,exact}
 }
 return best?best.t:null
}
// The type of an element: its name wins over its letters (projects reuse letters), the letters over nothing.
function typeOf({name,mark}={}){return typeByName(name)||typeByMark(mark)||null}
function group(key){return groupByKey.get(key)||groupByKey.get("other")}
// The list given to Claude: key — name (group).
function promptList(){return TYPES.map(t=>t.key+" — "+t.name+(t.marks.length?" ("+t.marks.slice(0,4).join(", ")+")":"")).join("; ")}
// Types added by the engineer in the program (src/ai-knowledge.js, sent to GitHub with his lessons): checked before
// the built-in ones by their words, so that a new kind is not swallowed by a general one ("балка" for "балка-стенка").
// {key, name, group, geometry, marks:[…], words:[…]} — the words are the beginnings of the words of a name.
const GEOMETRIES=["column","beam","brace","plate"],SHAPE_OF={column:"ibeam",beam:"ibeam",brace:"angle",plate:"plate"};
const userKeys=new Set();
const wordRe=w=>w.map(x=>String(x).trim().toLowerCase()).filter(x=>x.length>=3).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\s+/g,"\\s+")).join("|");
function userType(u){
 const key=String(u?.key||""),name=String(u?.name||"").trim();if(!/^user_[a-z0-9_]{1,60}$/.test(key)||!name)return null;
 const geometry=GEOMETRIES.includes(u.geometry)?u.geometry:"beam",groupKey=groupByKey.has(u.group)?u.group:"other";
 const marks=(Array.isArray(u.marks)?u.marks:[]).map(m=>String(m).trim()).filter(m=>/^[A-Za-zА-ЯЁа-яё]{1,4}$/u.test(m));
 const re=wordRe(Array.isArray(u.words)&&u.words.length?u.words:[name]);
 return T(key,name,groupKey,geometry,SHAPE_OF[geometry],marks,re?new RegExp(re,"iu"):null,{user:true})
}
function extend(list){
 for(const k of userKeys){byKey.delete(k);const i=TYPES.findIndex(t=>t.key===k);if(i>=0)TYPES.splice(i,1);const j=NAME_ORDER.indexOf(k);if(j>=0)NAME_ORDER.splice(j,1);const n=api.keys.indexOf(k);if(n>=0)api.keys.splice(n,1)}
 userKeys.clear();
 for(const u of Array.isArray(list)?list:[]){const t=userType(u);if(!t||byKey.has(t.key))continue;TYPES.push(t);byKey.set(t.key,t);NAME_ORDER.unshift(t.key);api.keys.push(t.key);userKeys.add(t.key)}
 return [...userKeys]
}
// Several work types of one drawing (the engineer, 31.10.2026: «для одного чертежа может быть несколько видов работ… в АР
// идет Монтаж окон, сэндвич-панелей, дверей и ворот»): each element goes to the work type whose name speaks of its kind.
// kind: by its type, else by its group; words: how a work type of the object names that kind; along: the kind whose
// work type takes it when none of the drawing names it (the trims go with the panels, the sheeting too).
const WORK_KINDS=[
 {key:"windows",label:"окна, витражи",types:["window"],words:/окон|окн[аоы]|витраж|светопрозрачн/iu},
 {key:"doors",label:"двери",types:["door"],words:/двер/iu},
 {key:"gates",label:"ворота",types:["gate"],words:/ворот/iu},
 {key:"panels",label:"сэндвич-панели",types:["sandwich","sandwich_wall","sandwich_roof"],groups:["cladding"],words:/сэндвич|панел|ограждающ|обшивк|трёхслойн|трехслойн/iu},
 {key:"sheeting",label:"профнастил",types:["sheeting"],words:/профнастил|профлист|кровл/iu,along:"panels"},
 {key:"trims",label:"нащельники, доборные элементы",groups:["trims"],words:/нащельник|доборн|фасонн\S*\s+(?:элем|издел)/iu,along:"panels"},
 // an opening whose kind is not known: a work type of openings of any kind
 {key:"openings",label:"",groups:["openings"],words:/окон|окн[аоы]|витраж|двер|ворот|про[её]м/iu},
 {key:"steel",label:"металлоконструкции",words:/металлоконструкц|металлокаркас|каркас|(?:^|[^а-яё])(?:мк|кмд?)(?![а-яё])/iu}
];
const workKindByKey=new Map(WORK_KINDS.map(k=>[k.key,k]));
function workKindOf(e){
 const type=String(e?.type_key||""),grp=String(e?.group||e?.scheme_group||(type&&byKey.get(type)?.group)||"");
 return WORK_KINDS.find(k=>k.types&&k.types.includes(type))||WORK_KINDS.find(k=>k.groups&&k.groups.includes(grp))||workKindByKey.get("steel")
}
// works: the work types of the drawing in its order, [{id, name}]. Its own kind, then the kind it goes along with; an
// element no work type speaks of — the first of the drawing (and, for the steel, a work type of the steel first).
function workTypeFor(e,works){
 const list=(Array.isArray(works)?works:[]).filter(w=>w&&w.id!=null&&String(w.id)!=="");if(!list.length)return"";if(list.length===1)return String(list[0].id);
 const named=k=>list.find(w=>k.words.test(String(w.name||"")));
 for(let k=workKindOf(e),n=0;k&&n<3;k=k.along?workKindByKey.get(k.along):null,n++){const w=named(k);if(w)return String(w.id)}
 return String(list[0].id)
}
// What each work type of a drawing takes, for the page «Чертежи»: [{id, kinds:[label…]}] and the rest.
function workSplit(works){
 const list=(Array.isArray(works)?works:[]).filter(w=>w&&w.id!=null&&String(w.id)!=="");
 const out=list.map(w=>({id:String(w.id),name:String(w.name||""),kinds:[]}));
 for(const k of WORK_KINDS){if(!k.label)continue;const id=workTypeFor({type_key:(k.types||[])[0]||"",group:(k.groups||[])[0]||(k.key==="steel"?"columns":"")},list),o=out.find(x=>x.id===id);
  if(o)o.kinds.push(k.key==="steel"&&list.length>1&&!list.some(w=>k.words.test(String(w.name||"")))?"остальное":k.label)}
 return out
}
const api={GROUPS,TYPES,byKey,typeByName,typeByMark,typeOf,group,promptList,extend,learn,GEOMETRIES,WORK_KINDS,workKindOf,workTypeFor,workSplit,keys:TYPES.map(t=>t.key)};
if(typeof module==="object"&&module.exports)module.exports=api;
else{root.irStructureTypes=api;
 // In the program window: the engineer's own kinds (kept in the main process) join at start.
 try{root.irProject?.ai?.invoke?.("ai-settings:knowledge-list")?.then(k=>extend(k?.types)).catch(()=>{})}catch(_e){}}
})(typeof window!=="undefined"?window:globalThis);
