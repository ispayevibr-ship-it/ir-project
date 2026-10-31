"use strict";
/*
 * Ведомость метизов: what the register holds, where it comes from and how much of it the montage has used.
 * A register filled by hand (section «fasteners») goes first; without one it is read from the drawings — the fasteners
 * of the analysed КМД/КМ sheets (ai-project-log) and the permanent fasteners of each mark's assembly sheet on the
 * montage scheme (joint.fasteners of scheme_column records).
 * Mass of one piece: the tables of the standards (knowledge/global/fasteners.json, ГОСТ Р 52645 and 52646 annexes Б),
 * else the geometry of the standard's sizes — head and shank of a bolt checked against ГОСТ 7798-70 appendix 1
 * (M12…M24, l 40…120: within 2 %), a nut against ГОСТ 5915-70 (within 1 %). A value found nowhere stays empty.
 * Used by the montage: the fasteners of a mark go with its mounted pieces; what the drawings give for the whole object
 * goes with the mounted share of the steel (by mass, else by pieces).
 */
(()=>{
 const RHO=7.85e-6;// kg/mm³
 const PITCH={3:.5,4:.7,5:.8,6:1,8:1.25,10:1.5,12:1.75,14:2,16:2,18:2.5,20:2.5,22:2.5,24:3,27:3,30:3.5,33:3.5,36:4,39:4,42:4.5,48:5,56:5.5,64:6};
 // Bolts: [S, k, {length: kg per 1000}] — ГОСТ 7798-70, 22353-77, Р 52644-2006.
 const BOLT={"7798":{"6":[10,4],"8":[13,5.3],"10":[16,6.4],"12":[18,7.5],"14":[21,8.8],"16":[24,10],"18":[27,12],"20":[30,12.5],"22":[34,14],"24":[36,15],"27":[41,17],"30":[46,18.7],"36":[55,22.5],"42":[65,26],"48":[75,30]},
  "22353":{"16":[27,12,{"40":111,"45":118,"50":126,"55":134,"60":141,"65":149,"70":157,"75":164,"80":172,"85":180,"90":188,"95":195,"100":203,"105":210,"110":218,"115":226,"120":233,"125":241,"130":249,"140":264,"150":279,"160":293,"170":309,"180":324,"190":340,"200":355,"220":386,"240":416,"260":447,"280":478,"300":509}],"18":[30,13],"20":[32,14,{"50":198,"55":211,"60":223,"65":235,"70":247,"75":259,"80":271,"85":283,"90":295,"95":307,"100":319,"105":331,"110":343,"115":355,"120":367,"125":379,"130":391,"140":415,"150":439,"160":461,"170":485,"180":509,"190":533,"200":557,"220":605,"240":654,"260":702,"280":750,"300":798}],"22":[36,15],"24":[41,17,{"60":367,"65":386,"70":404,"75":421,"80":438,"85":456,"90":473,"95":491,"100":508,"105":525,"110":543,"115":560,"120":578,"125":595,"130":612,"140":646,"150":682,"160":714,"170":748,"180":783,"190":818,"200":853,"220":922,"240":992,"260":1061,"280":1131,"300":1200}],"27":[46,19],"36":[55,23],"42":[65,26],"48":[75,30]},
  "52644":{"16":[27,12],"18":[30,13],"20":[34,14],"22":[36,15],"24":[41,17],"27":[46,19],"30":[50,19],"36":[60,23],"42":[65,26],"48":[75,30]}};
 // Nuts: [S, m, kg per 1000] — ГОСТ 5915-70, 22354-77, Р 52645-2006 (annex Б, normal height).
 const NUT={"5915":{"6":[10,5.2,2.573],"8":[13,6.8,5.548],"10":[16,8.4,10.22],"12":[18,10.8,15.67],"14":[21,12.8,25.33],"16":[24,14.8,37.61],"18":[27,16.4,53.27],"20":[30,18,71.44],"22":[34,19.8,103.15],"24":[36,21.5,122.87],"27":[41,23.6,175.28],"30":[46,25.6,242.54],"36":[55,31,416.78],"42":[65,34,623.88],"48":[75,38,956.2]},
  "22354":{"16":[27,null,50],"18":[30,null,66],"20":[32,null,80],"22":[36,null,108],"24":[41,null,171],"27":[46,null,224],"30":[50,null,266],"36":[55,null,368],"42":[65,null,611],"48":[75,null,921]},
  "52645":{"16":[27,17.1,56],"18":[30,18,72],"20":[34,20.7,89],"22":[36,23.6,130],"24":[41,24.2,183],"27":[46,27.6,250],"30":[50,30.7,266],"36":[60,36.6,454],"42":[65,42,740],"48":[75,48,1144]}};
 // Washers: [d1, d2, s, kg per 1000: исп. A (1), C, исп. 2] — ГОСТ 11371-78, 6958-78, Р 52646-2006.
 const WASHER={"11371":{"6":[6.4,12,1.6,1.016,.99,.925],"8":[8.4,16,1.6,1.828,1.725,1.706],"10":[10.5,20,2,3.571,3.438,3.333],"12":[13,24,2.5,6.27,6.066,5.824],"14":[15,28,2.5,8.612,8.377,8.089],"16":[17,30,3,11.295,10.976,10.491],"18":[19,34,3,14.697,13.976,13.782],"20":[21,37,3,17.156,16.361,16.157],"22":[23,39,3,18.339,17.47,17.285],"24":[25,44,4,32.315,31.058,30.211],"27":[28,50,4,42.298,39.438,39.898],"30":[31,56,4,53.612,50.456,50.917],"33":[34,60,5,75.303,null,70.809],"36":[37,66,5,92.033,87.35,87.078],"39":[40,72,6,132.513,null,124.748],"42":[43,78,7,182.68,175.088,171.256],"48":[50,92,8,294.013,283.956,276.397]},
  "6958":{"6":[6.4,18,1.6,2.796,2.77],"8":[8.4,24,2,6.13,6],"10":[10.5,30,2.5,12.17,12],"12":[13,37,3,22,21.63],"14":[15,44,3,32,31.56],"16":[17,50,3,41,40.34],"18":[19,56,4,68,67.14],"20":[21,60,4,78,77],"22":[23,66,5,118,116],"27":[28,85,6,238,234],"30":[31,92,6,277,273],"36":[37,110,8,529,522],"42":[null,125,10,null,838.4],"48":[null,145,10,null,1129.606]},
  "52646":{"16":[18,34,4,23.6,null,28.6],"18":[20,38,4,29.6,null,30.6],"20":[22,42,4,36.3,null,39.9],"22":[24,44,4,38.6,null,53.1],"24":[26,50,4,51.7,null,68.2],"27":[30,56,4,63.4,null,96.2],"30":[33,60,4,71.2,null,96.3],"36":[39,72,4,103.8,null,122.5],"42":[46,84,4,140,null,164.3],"48":[52,96,4,184.6,null,200.8]}};
 const SOURCE={"7798":"ГОСТ 7798-70","22353":"ГОСТ 22353-77","52644":"ГОСТ Р 52644-2006","5915":"ГОСТ 5915-70","22354":"ГОСТ 22354-77","52645":"ГОСТ Р 52645-2006","11371":"ГОСТ 11371-78","6958":"ГОСТ 6958-78","52646":"ГОСТ Р 52646-2006","6402":"ГОСТ 6402-70","24379":"ГОСТ 24379.1-2012"};
 // Standards of the same item written otherwise: their sizes as the nearest table (ISO/DIN of the same series).
 const LIKE={bolt:{"15589":"7798","7805":"7798","7796":"7798","7795":"7798","4014":"7798","4017":"7798","931":"7798","933":"7798","32484":"52644","14399":"52644"},
  nut:{"5927":"5915","15526":"5915","4032":"5915","934":"5915","32484":"52645","14399":"52645"},
  washer:{"10906":"11371","10907":"11371","125":"11371","7089":"11371","7091":"11371","22355":"52646","32484":"52646","14399":"52646","9021":"6958"}};
 const HIGH=/22353|22354|22355|52644|52645|52646|32484|14399/;
 const ITEM=[["anchor",/фундаментн|анкерн\S*\s+болт|^\s*анкер/iu],["bolt",/болт/iu],["nut",/гайк/iu],["washer",/шайб/iu],["stud",/шпильк/iu],["screw",/саморез|шуруп|винт/iu],["rivet",/заклёп|заклеп/iu],["pin",/штифт|шплинт/iu],["dowel",/дюбел/iu]];
 const STD_ITEM=[[/^(7798|7805|7796|7795|15589|22353|52644|4014|4017|931|933)$/,"bolt"],[/^(5915|5927|15526|22354|52645|4032|934)$/,"nut"],[/^(11371|6958|22355|52646|10906|10907|6402|125|127|9021)$/,"washer"],[/^24379/,"anchor"]];
 const CLS={"46":"4.6","48":"4.8","56":"5.6","58":"5.8","66":"6.6","68":"6.8","88":"8.8","98":"9.8","109":"10.9","129":"12.9"};
 const LAT={M:"М",X:"х",x:"х",C:"С",A:"А",H:"Н"};
 const num=v=>{if(v==null||v==="")return null;const n=Number(String(v).replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:null};
 const arr=v=>Array.isArray(v)?v:[];
 const norm=v=>String(v??"").trim().toLowerCase().replace(/ё/g,"е").replace(/\s+/g," ");
 const LOOK={a:"а",b:"в",c:"с",e:"е",h:"н",k:"к",m:"м",o:"о",p:"р",t:"т",x:"х",y:"у"};
 const markKey=v=>[...String(v||"").trim().toLowerCase().replace(/ё/g,"е").replace(/\s+/g,"")].map(c=>LOOK[c]||c).join("");
 const ITEM_NAME={bolt:"Болт",nut:"Гайка",washer:"Шайба",anchor:"Болт фундаментный",stud:"Шпилька",screw:"Саморез, винт",rivet:"Заклёпка",pin:"Штифт",dowel:"Дюбель"};
 // One designation as drawings write it: «Болт М20-6gх60.58 ГОСТ 7798-70», «Гайка М20.10 ГОСТ Р 52645-2006», «Шайба
 // С.20.01.08кп ГОСТ 11371-78», «Болт 1.1.М20х800 ГОСТ 24379.1-2012». null when the text names no fastener.
 function parse(text){
  const raw=String(text||"").replace(/\s+/g," ").trim();if(!raw)return null;
  const c=raw.replace(/(^|[^A-Za-zА-Яа-яЁё])([MXxCAH])(?=[\d.\s-])/g,(m,p,ch)=>p+LAT[ch]).replace(/[×*xX]/g,"х");
  const stdM=/(ГОСТ\s*Р?\s*(?:ИСО\s*|ISO\s*)?(\d+(?:\.\d+)?)(?:-\d{2,4})?|DIN\s*(?:EN\s*)?(?:ISO\s*)?(\d+)|ISO\s*(\d+)|СТ\s*РК\s*(?:EN\s*|ISO\s*|ИСО\s*)*(\d+(?:-\d+)?))/iu.exec(c);
  const stdNo=stdM?String(stdM[2]||stdM[3]||stdM[4]||stdM[5]||"").replace(/-\d+$/,""):"";
  let item=(ITEM.find(([,re])=>re.test(c.replace(stdM?.[0]||"","")))||[])[0]||"";
  if(!item&&stdNo||/^24379/.test(stdNo))item=(STD_ITEM.find(([re])=>re.test(stdNo))||[])[1]||item;
  if(!item)return null;
  const body=c.replace(stdM?.[0]||"","");
  const out={item,text:raw,standard:stdM?stdM[0].replace(/\s+/g," ").trim():"",std:stdNo,d:null,len:null,cls:null,exec:null,high:false};
  let m;
  if(item==="washer"){
   // «Шайба 20», «Шайба С.20.01», «Шайба А.12», «Шайба 2.12», «Шайба 2-16» (ГОСТ Р 52646), «Шайба 20 Н» (6402).
   if((m=/шайба\S*\s*(?:([АС])\.?\s*|(2)[.-]\s*)?М?\s*(\d{1,2})(?![\d,])/iu.exec(body))){out.exec=m[1]||(m[2]?"2":null);out.d=num(m[3])}
   else if((m=/М\s*(\d{1,2})/u.exec(body)))out.d=num(m[1])
  }else if((m=/(?:(\d)\.(\d)\.?\s*)?М\s*(\d{1,3})(?:\s*х\s*\d(?:[.,]\d+)?(?=\s*-|\s*х))?(?:\s*-\s*\d[a-zа-я])?(?:\s*х\s*(\d{2,5}))?(?:\s*\.\s*(\d{1,3})(?!\d))?/iu.exec(body))){
   out.d=num(m[3]);out.len=item==="nut"?null:num(m[4]);
   const code=m[5];
   if(code&&item==="nut"&&/^(4|5|6|8|9|10|12)$/.test(code))out.cls=code;
   else if(code&&CLS[code])out.cls=CLS[code];
   else if(code&&Number(code)>=100)out.cls=String(Number(code)*10)+" МПа"
  }else if(item==="screw"||item==="pin"||item==="rivet"||item==="dowel"){
   if((m=/(\d+(?:[.,]\d)?)\s*х\s*(\d{1,3})/u.exec(body))){out.d=num(m[1]);out.len=num(m[2])}
  }
  if(!out.cls&&(m=/(?:кл(?:асс)?[а-я.]*\s*(?:пр(?:очности)?\.?)?\s*)(4\.6|4\.8|5\.6|5\.8|6\.8|8\.8|10\.9|12\.9|10|8|5)\b/iu.exec(raw)))out.cls=m[1];
  if(!out.cls&&(m=/\b(4\.6|4\.8|5\.6|5\.8|6\.8|8\.8|10\.9|12\.9)\b/.exec(raw)))out.cls=m[1];
  out.high=HIGH.test(stdNo)||/высокопрочн/iu.test(raw)||["10.9","12.9","10","12"].includes(out.cls)||/^1[01]\d0 МПа/.test(out.cls||"");
  return out
 }
 const keyOf=f=>[f.item,f.std||"",f.d||"",f.len||"",f.item==="washer"?f.exec||"":f.cls||""].join("|");
 const table=(t,item,std)=>t[std]?std:t[LIKE[item]?.[std]]?LIKE[item][std]:null;
 // Mass of one piece, kg, with where it comes from; null when nothing gives it.
 function massOf(f){
  if(!f||!f.d)return{kg:null,src:"нет диаметра"};
  const d=f.d,P=PITCH[d]||d*.125,item=f.item;
  if(item==="bolt"){
   let std=table(BOLT,"bolt",f.std)||(f.high?"52644":"7798"),row=BOLT[std]?.[String(d)];
   if(!row&&std!=="7798"){std="7798";row=BOLT[std][String(d)]}
   if(!f.len)return{kg:null,src:"нет длины болта"};
   if(row?.[2]?.[String(f.len)])return{kg:row[2][String(f.len)]/1000,src:SOURCE[std]+", таблица массы",exact:true};
   const S=row?.[0]||1.5*d,k=row?.[1]||.62*d,head=HIGH.test(std)?.78:.88;
   return{kg:RHO*(Math.PI*d*d/4*f.len+head*.866*S*S*k),src:"расчёт по размерам "+(SOURCE[std]||"ГОСТ 7798-70")+(row?"":" (размеры по d)")}
  }
  if(item==="nut"){
   let std=table(NUT,"nut",f.std)||(f.high?"52645":"5915"),row=NUT[std]?.[String(d)];
   if(row?.[2])return{kg:row[2]/1000,src:SOURCE[std]+", таблица массы",exact:true};
   const S=row?.[0]||NUT["5915"][String(d)]?.[0]||1.5*d,mh=row?.[1]||NUT["5915"][String(d)]?.[1]||.9*d;
   return{kg:RHO*(.866*S*S-Math.PI*(d-1.0825*P)**2/4)*mh*.93,src:"расчёт по размерам "+(SOURCE[std]||"ГОСТ 5915-70")}
  }
  if(item==="washer"){
   if(f.std==="6402"){// spring washer: square section about a quarter of d (normal series)
    const b=Math.max(1,.23*d);return{kg:RHO*Math.PI*(d+.3+b)*b*b,src:"расчёт по размерам ГОСТ 6402-70 (сечение ≈ 0,23 d)"}
   }
   const std=table(WASHER,"washer",f.std)||(f.high?"52646":"11371"),row=WASHER[std]?.[String(d)];
   if(row){
    const w=f.exec==="2"?row[5]:f.exec==="С"?row[4]:row[3];
    const like=std!==f.std&&f.std?" (для "+(SOURCE[f.std]||f.standard||f.std)+" — по аналогу)":"";
    if(w)return{kg:w/1000,src:SOURCE[std]+", таблица массы"+(f.exec?" (исп. "+f.exec+")":"")+like,exact:true};
    const any=row[3]||row[4]||row[5];if(any)return{kg:any/1000,src:SOURCE[std]+", таблица массы"}
   }
   const d1=d+1,d2=2*d,s=Math.max(1.6,.15*d);return{kg:RHO*Math.PI/4*(d2*d2-d1*d1)*s,src:"расчёт по размерам (d2 ≈ 2d, s ≈ 0,15d)"}
  }
  if(item==="anchor"||item==="stud"){
   if(!f.len)return{kg:null,src:"нет длины"};
   return{kg:RHO*Math.PI*d*d/4*f.len,src:"расчёт по длине стержня"+(item==="anchor"?" (без гаек и шайб)":"")}
  }
  return{kg:null,src:"масса по ГОСТ не найдена"}
 }
 // «К-1:8; Б-2:4» — the marks a fastener goes with and how many on one piece of each.
 function parseMarks(text){
  return String(text||"").split(/[;\n]+/).map(s=>s.trim()).filter(Boolean).map(s=>{const m=/^(.+?)\s*[:=×x]\s*(\d+(?:[.,]\d+)?)\s*(?:шт\.?)?$/iu.exec(s);return m?{mark:m[1].trim(),per:num(m[2])||0}:{mark:s,per:1}}).filter(x=>x.mark)
 }
 const marksText=list=>arr(list).map(x=>x.mark+":"+String(x.per).replace(".",",")).join("; ");
 // «Болт М20-6gх60.58 ГОСТ 7798-70 кл. 8.8 — 8 шт.» of a scheme card: the designation and the count.
 function splitCount(line){const m=/^(.*?)\s*[—–-]\s*(\d+(?:[.,]\d+)?)\s*шт\.?\s*$/u.exec(String(line||""));return m?{text:m[1].replace(/\s*\(высокопрочный\)\s*$/u,"").replace(/\s+кл\.\s*\d+(?:\.\d+)?$/u,"").trim(),count:num(m[2])}:{text:String(line||"").trim(),count:null}}
 const isMontageWork=w=>{const d=w?.data||w||{};if(d.accounting_type==="service"||norm(d.unit)==="услуга")return false;return d.work_category==="installation"||norm(d.work_type||w?.title).includes("монтаж")};
 // Marks of the montage: those of the montage work types, else all (one per mark name).
 function montageMarks(markRows,workRows){
  const montage=new Set(arr(workRows).filter(isMontageWork).map(r=>String(r.id)));
  const rows=arr(markRows).map(r=>({id:String(r.id),...(r.data||{}),title:r.title||r.data?.title||""})).filter(x=>x.accounting_type!=="service"&&norm(x.unit)!=="услуга");
  const own=montage.size?rows.filter(x=>montage.has(String(x.work_type_id||""))):[];
  return own.length?own:rows
 }
 const isMass=unit=>{const k=window.irMeasure?.meta?.(unit)?.kind;return k?k==="mass":/^(т|тн|тонн|кг)/i.test(String(unit||"").trim())};
 const markTotal=x=>{const raw=num(x?.total_value??x?.total_volume);if(raw!=null)return raw;return(num(x?.qty??x?.count)||0)*(num(x?.unit_volume??x?.volume_one)||0)};
 // Mounted pieces of each mark by the daily reports: all of them, or those before a report / through it.
 function mountedBy(reports,marks,{until=null,before=null}={}){
  const byId=new Map(marks.map(m=>[String(m.id),m])),out=new Map();
  const at=r=>{const d=r.data||r;return String(d.date||d.report_date||"").slice(0,10)};
  const take=r=>{if(!until&&!before)return true;const day=at(r),ref=until||before,refDay=at(ref);
   if(day!==refDay)return day<refDay;return until?(Number(r.id)||0)<=(Number(ref.id)||0):(Number(r.id)||0)<(Number(ref.id)||0)};
  for(const r of arr(reports)){if(!take(r))continue;const d=r.data||r;
   for(const w of arr(d.items).length?d.items:arr(d.works)){if(w?.accounting_type==="service"||w?.is_service===true)continue;
    const m=byId.get(String(w?.mark_id??w?.markId??""));if(!m)continue;
    const q=Math.max(0,num(w.qty??w.count??w.quantity)||0),id=String(m.id);out.set(id,(out.get(id)||0)+q)}}
  for(const[id,q]of out){const m=byId.get(id);out.set(id,Math.min(q,num(m.qty??m.count)||q))}
  return out
 }
 // The mounted share of the steel: by mass where the marks are in tonnes/kg, else by pieces.
 function mountedShare(marks,mounted){
  const massRows=marks.filter(x=>isMass(x.unit)&&markTotal(x)>0),rows=massRows.length?massRows:marks;let all=0,done=0;
  for(const x of rows){const q=num(x.qty??x.count)||0;if(q<=0)continue;const w=massRows.length?markTotal(x):q;all+=w;done+=w*Math.min(1,(mounted.get(String(x.id))||0)/q)}
  return all>0?done/all:0
 }
 function rowFrom(f,extra={}){
  const mass=massOf(f);return{key:keyOf(f),text:f.text,item:f.item,standard:f.standard,d:f.d,len:f.len,cls:f.cls,exec:f.exec,high:f.high,qty:null,unit_kg:mass.kg,mass_src:mass.src,marks:[],sources:[],...extra}
 }
 // The register from the drawings.
 function fromDrawings({logs=[],scheme=[]}={}){
  const rows=new Map(),add=(f,count,source)=>{
   if(!f)return null;const k=keyOf(f);let r=rows.get(k);if(!r){r=rowFrom(f);rows.set(k,r)}
   if(count!=null)r.qty=(r.qty||0)+count;if(source&&!r.sources.includes(source))r.sources.push(source);return r};
  // The latest analysis of each file (a file analysed again replaces its fasteners).
  const latest=new Map();
  for(const l of arr(logs)){const d=l.data||l;if(d.status&&d.status!=="ok"||!arr(d.fasteners).length)continue;const k=String(d.file||"");const old=latest.get(k);if(!old||String(d.at||"")>String(old.at||""))latest.set(k,d)}
  for(const d of latest.values())for(const x of d.fasteners){
   // (temporary bolts stay out; a line without a count is a note of the sheet — «болтов М20 класса точности В по…» — not a row of a table)
   if(x.temporary||num(x.count)==null||/^[а-яё]/u.test(String(x.text||"").trim()))continue;const f=parse(x.text)||(x.item?{item:x.item,text:x.text,standard:x.standard||"",std:String(x.standard||"").replace(/\D+/g," ").trim().split(" ")[0]||"",d:x.d_mm,len:x.length_mm,cls:x.strength_class,exec:null,high:Boolean(x.high_strength)}:null);
   add(f,num(x.count),(d.file||"чертёж")+(arr(x.sheets).length?", л. "+x.sheets.join(", "):""))}
  // The fasteners of each mark's assembly sheet, once per mark.
  const seen=new Set();
  for(const s of arr(scheme)){const d=s.data||{};if(s.record_type&&s.record_type!=="scheme_column")continue;const mark=String(d.mark||s.title||"").trim(),list=arr(d.joint?.fasteners);if(!mark||!list.length||seen.has(markKey(mark)))continue;seen.add(markKey(mark));
   for(const line of list){const {text,count}=splitCount(line),f=parse(text);if(!f)continue;const k=keyOf(f);let r=rows.get(k);if(!r){r=rowFrom(f);rows.set(k,r)}
    if(!r.marks.some(x=>markKey(x.mark)===markKey(mark)))r.marks.push({mark,per:count||1});const src=d.joint?.fasteners_sheet?"сборочный лист "+d.joint.fasteners_sheet:"монтажная схема";if(!r.sources.includes(src))r.sources.push(src)}}
  return[...rows.values()]
 }
 // The register filled by hand.
 function fromManual(records){
  return arr(records).filter(r=>(r.record_type||"fastener")==="fastener").map(r=>{const d=r.data||{},f=parse(d.text)||{item:d.item||"bolt",text:d.text||"",standard:d.standard||"",std:"",d:num(d.d_mm),len:num(d.length_mm),cls:d.strength_class||null,exec:null,high:false};
   // (the class of its own column — «к.п.» of a loaded list — over the one read in the name)
   const cls=String(d.strength_class||"").trim();if(cls&&!f.cls){f.cls=cls;if(["10.9","12.9","10","12"].includes(cls))f.high=true}
   const g=massOf(f),own=num(d.unit_mass_kg);
   return{...rowFrom(f),id:String(r.id),qty:num(d.qty),unit_kg:own??g.kg,mass_src:own!=null?"указана вручную":g.src,marks:parseMarks(d.marks),sources:[d.file?"загружена из "+d.file:"ведомость, заполненная вручную"],note:d.note||""}})
 }
 // The register against the drawings (rows of account(): their total counts the pieces of the marks): for each row what the drawings need of it, where it goes and the difference
 // (+ extra, − missing); rows of the drawings the register has not, all missing. Matched by the same item, standard,
 // size and class, else by the same item and size (a list may write the standard otherwise; another class is said).
 function compare(rows,drawn){
  const loose=r=>[r.item,r.d||"",r.len||""].join("|"),used=new Set(),out=[];
  const pick=(r,test)=>drawn.find(x=>!used.has(x)&&test(x));
  for(const r of rows){
   const m=pick(r,x=>x.key===r.key)||pick(r,x=>loose(x)===loose(r)&&(!x.cls||!r.cls||String(x.cls)===String(r.cls)))||pick(r,x=>loose(x)===loose(r));
   if(m)used.add(m);
   const need=m?(m.total??m.qty):null,clsDiff=m&&m.cls&&r.cls&&String(m.cls)!==String(r.cls)?m.cls:null;
   out.push({row:r,drawn:m||null,need,clsDiff,diff:need==null||r.qty==null?null:r.qty-need,where:m?(m.marks.length?marksText(m.marks):"на весь объект")+(m.sources.length?" · "+m.sources.join("; "):""):""})
  }
  const missing=drawn.filter(x=>!used.has(x)&&(x.total??x.qty)>0).map(x=>({row:null,drawn:x,need:x.total??x.qty,diff:-(x.total??x.qty),where:(x.marks.length?marksText(x.marks):"на весь объект")+(x.sources.length?" · "+x.sources.join("; "):"")}));
  return{lines:out,missing,short:out.filter(l=>l.diff<0).length+missing.length,extra:out.filter(l=>l.diff>0).length}
 }
 // How many of a row the montage has used, given the mounted pieces of each mark and the mounted share.
 function usedOf(row,marksByKey,mounted,share){
  let linkedTotal=0,linkedUsed=0;
  for(const l of arr(row.marks)){const m=marksByKey.get(markKey(l.mark));if(!m)continue;const q=num(m.qty??m.count)||0;linkedTotal+=l.per*q;linkedUsed+=l.per*Math.min(q,mounted.get(String(m.id))||0)}
  const total=row.qty!=null?row.qty:linkedTotal,rest=Math.max(0,total-linkedTotal);
  return{total,used:Math.min(total,Math.round(linkedUsed+rest*share))}
 }
 async function load(oid){
  const root=irProject.data.forObject(oid),get=k=>root.section(k).list().catch(()=>[]);
  const [manual,marks,works,reports,scheme,logs]=await Promise.all([get("fasteners"),get("marks"),get("work-types"),get("reports"),get("scheme"),get("ai-project-log")]);
  const manualRows=fromManual(manual),auto=fromDrawings({logs,scheme}),base={marks:montageMarks(marks,works),reports};
  // The register against the drawings; a row of the register without its marks goes where the drawings put it.
  const check=manualRows.length&&auto.length?compare(manualRows,account({...base,rows:auto}).rows):null;
  if(check)for(const l of check.lines)if(!l.row.marks.length&&l.drawn?.marks.length){l.row.marks=l.drawn.marks.map(x=>({...x}));l.row.marks_from="чертёж"}
  return{manual,manualRows,autoRows:auto,rows:manualRows.length?manualRows:auto,mode:manualRows.length?"manual":"auto",check,...base}
 }
 // The register with its use: overall, or for one daily report (before it, on its day, through it).
 function account(data,report=null){
  const marks=data.marks,marksByKey=new Map();for(const m of marks){const k=markKey(m.mark||m.title);if(k&&!marksByKey.has(k))marksByKey.set(k,m)}
  const now=mountedBy(data.reports,marks,report?{until:report}:{}),prev=report?mountedBy(data.reports,marks,{before:report}):null;
  const shareNow=mountedShare(marks,now),sharePrev=prev?mountedShare(marks,prev):0;
  const rows=data.rows.map(r=>{const a=usedOf(r,marksByKey,now,shareNow),b=prev?usedOf(r,marksByKey,prev,sharePrev):{used:0},kg=r.unit_kg;
   const day=Math.max(0,a.used-b.used),left=Math.max(0,a.total-a.used);
   return{...r,total:a.total,used:a.used,before:b.used,day,left,total_kg:kg!=null?a.total*kg:null,used_kg:kg!=null?a.used*kg:null,before_kg:kg!=null?b.used*kg:null,day_kg:kg!=null?day*kg:null,left_kg:kg!=null?left*kg:null}});
  const sum=k=>rows.reduce((s,r)=>s+(r[k]||0),0);
  return{rows,share:shareNow,sharePrev,totals:{total:sum("total"),used:sum("used"),before:sum("before"),day:sum("day"),left:sum("left"),total_kg:sum("total_kg"),used_kg:sum("used_kg"),before_kg:sum("before_kg"),day_kg:sum("day_kg"),left_kg:sum("left_kg")},noMass:rows.filter(r=>r.unit_kg==null).length}
 }
 window.irFasteners={compare,parse,massOf,parseMarks,marksText,splitCount,fromDrawings,fromManual,load,account,mountedBy,mountedShare,ITEM_NAME,keyOf,markKey};
})();
