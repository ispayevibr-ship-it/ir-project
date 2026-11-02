"use strict";
/*
 * Исходящие письма объекта: текст из редактора программы (HTML окна) → абзацы с жирным, курсивом, подчёркиванием,
 * списками и выравниванием → письмо на бланке в Word (.docx, без пакетов — ZIP из executive-docs.js) или HTML для PDF
 * (печатает главный процесс). Бланк: логотип и название компании, реквизиты; исходящий номер и дата, адресат справа,
 * заголовок, текст, подпись (должность — ФИО), исполнитель.
 */
(function(root){
 const ENT={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:"\u00a0",laquo:"«",raquo:"»",mdash:"—",ndash:"–",hellip:"…",bull:"•",deg:"°",times:"×",laquo2:"«"};
 const decode=s=>String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi,(m,k)=>k[0]==="#"?String.fromCodePoint(k[1]==="x"||k[1]==="X"?parseInt(k.slice(2),16):Number(k.slice(1))):ENT[k.toLowerCase()]??m);
 const BLOCK=new Set(["p","div","li","h1","h2","h3","h4","h5","h6","blockquote","pre","tr","table"]);
 const attr=(a,name)=>{const m=new RegExp(name+'\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))',"i").exec(a||"");return m?decode(m[2]??m[3]??m[4]??""):""};
 const styleOf=a=>{const s=attr(a,"style").toLowerCase(),o={};
  const al=/text-align\s*:\s*(left|center|right|justify|start|end)/.exec(s)?.[1]||attr(a,"align").toLowerCase();
  if(al)o.align=al==="justify"?"both":al==="start"?"left":al==="end"?"right":al;
  if(/font-weight\s*:\s*(bold|[6-9]00)/.test(s))o.b=true;else if(/font-weight\s*:\s*(normal|[1-4]00)/.test(s))o.b=false;
  if(/font-style\s*:\s*italic/.test(s))o.i=true;
  if(/text-decoration[^;]*underline/.test(s))o.u=true;
  return o};
 // HTML редактора → [{align, list:"ul"|"ol"|null, num, level, runs:[{text,b,i,u}|{br:true}]}].
 function blocksFromHtml(html){
  const blocks=[],stack=[],lists=[];let cur=null;
  const fmt=()=>{const f={b:false,i:false,u:false};for(const s of stack){if(s.b!=null)f.b=s.b;if(s.i)f.i=true;if(s.u)f.u=true}return f};
  const alignNow=()=>{for(let k=stack.length-1;k>=0;k--)if(stack[k].align)return stack[k].align;return""};
  const close=()=>{if(cur){blocks.push(cur);cur=null}};
  const open=(extra={})=>{close();const l=lists[lists.length-1];cur={align:alignNow(),list:null,runs:[],...extra};if(extra.li&&l){cur.list=l.type;cur.num=++l.n;cur.level=lists.length-1}delete cur.li};
  const re=/<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)/g;let m;
  while((m=re.exec(String(html||"")))){
   if(m[3]!=null){const t=decode(m[3]).replace(/[\r\n\t]+/g," ");if(!t)continue;if(!cur){if(!t.trim())continue;open()}cur.runs.push({text:t,...fmt()});continue}
   if(!m[1])continue;
   const tag=m[1].toLowerCase(),end=m[0][1]==="/",a=m[2]||"";
   if(tag==="style"||tag==="script"){if(!end){const stop=new RegExp("</"+tag+"\\s*>","i");stop.lastIndex=re.lastIndex;const rest=String(html).slice(re.lastIndex),k=rest.search(stop);re.lastIndex+=k<0?rest.length:k}continue}
   if(tag==="br"){if(!cur)open();cur.runs.push({br:true});continue}
   if(tag==="ul"||tag==="ol"){if(end){lists.pop();close()}else{close();lists.push({type:tag,n:0})}continue}
   if(end){
    for(let k=stack.length-1;k>=0;k--)if(stack[k].tag===tag){stack.splice(k);break}
    if(BLOCK.has(tag))close();continue}
   if(/\/\s*$/.test(a))continue;
   const st=styleOf(a),fx={tag,...st};
   if(tag==="b"||tag==="strong"||/^h\d$/.test(tag))fx.b=true;if(tag==="i"||tag==="em")fx.i=true;if(tag==="u"||tag==="ins")fx.u=true;
   stack.push(fx);
   if(BLOCK.has(tag)&&tag!=="table"&&tag!=="tr")open({li:tag==="li"});
  }
  close();
  // Пустые строки редактора (<div><br></div>) — пустые абзацы; перевод строки в конце абзаца лишний.
  for(const b of blocks){while(b.runs.length&&b.runs[b.runs.length-1].br&&b.runs.some(r=>!r.br))b.runs.pop();if(b.runs.every(r=>r.br||!r.text.trim()))b.runs=[]}
  // Слить соседние куски одного вида.
  for(const b of blocks){const out=[];for(const r of b.runs){const p=out[out.length-1];if(p&&!p.br&&!r.br&&p.b===r.b&&p.i===r.i&&p.u===r.u)p.text+=r.text;else out.push({...r})}b.runs=out}
  // Пустые строки в начале и в конце не нужны.
  while(blocks.length&&!blocks[0].runs.length&&!blocks[0].list)blocks.shift();while(blocks.length&&!blocks[blocks.length-1].runs.length&&!blocks[blocks.length-1].list)blocks.pop();
  return blocks
 }
 const plain=blocks=>blocks.map(b=>(b.list?(b.list==="ol"?b.num+". ":"• "):"")+b.runs.map(r=>r.br?"\n":r.text).join("")).join("\n");
 const textToBlocks=text=>String(text||"").split(/\r?\n/).map(l=>({align:"",list:null,runs:l.trim()?[{text:l,b:false,i:false,u:false}]:[]}));
 const ruDate=d=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(d||""));return m?`${m[3]}.${m[2]}.${m[1]}`:String(d||"")};
 const numberText=L=>{const n=String(L.number||"").trim();return"№ "+(n||"____")+" от "+(L.date?ruDate(L.date)+" г.":"«___» ________ 20__ г.")};
 // «С уважением,» перед подписью — если текст письма сам им не кончается.
 const needClosing=L=>(L.sign_position||L.sign_name)&&!/уважением/i.test((L.blocks||[]).slice(-3).map(b=>b.runs.map(r=>r.text||"").join("")).join(" "));
 const replyText=L=>L.reply_number||L.reply_date?"На № "+(L.reply_number||"____")+(L.reply_date?" от "+ruDate(L.reply_date)+" г.":""):"";
 const lines=v=>String(v||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 // Строки шапки: пустая строка внутри — отступ (как в бланке компании).
 const blockLines=v=>{const a=String(v||"").split(/\r?\n/).map(s=>s.trim());while(a.length&&!a[0])a.shift();while(a.length&&!a[a.length-1])a.pop();return a};
 // Реквизиты бланка в две колонки (с трёх строк): слева адрес и связь, справа банк и коды.
 // Объект и договор письма: строки под номером.
 const aboutLines=L=>[L.object_name?"Объект: "+L.object_name:"",L.contract?"Договор: "+L.contract:""].filter(Boolean);

 // ---- HTML для PDF ----
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const ALIGN={left:"left",center:"center",right:"right",both:"justify"};
 function blocksHtml(blocks){
  const out=[];let list=null;
  const runs=b=>b.runs.map(r=>{if(r.br)return"<br>";let t=esc(r.text);if(r.u)t="<u>"+t+"</u>";if(r.i)t="<i>"+t+"</i>";if(r.b)t="<b>"+t+"</b>";return t}).join("")||"&nbsp;";
  for(const b of blocks){
   if(b.list){if(list!==b.list){if(list)out.push(`</${list}>`);out.push(`<${b.list}>`);list=b.list}out.push(`<li style="text-align:${ALIGN[b.align]||"justify"}">${runs(b)}</li>`);continue}
   if(list){out.push(`</${list}>`);list=null}
   out.push(`<p style="text-align:${ALIGN[b.align]||"justify"}">${runs(b)}</p>`)}
  if(list)out.push(`</${list}>`);
  return out.join("")
 }
 function toHtml(L,head={}){
  const logo=head.logo?.url?`<img class="logo" src="${esc(head.logo.url)}" alt="">`:"";
  // Шапка бланка как у писем компании: слева по-русски, по центру логотип, справа по-казахски; черта; реквизиты.
  const left=blockLines(head.org),right=blockLines(head.orgKz),details=lines(head.details);
  const side=(list,cls)=>`<div class="${cls}">${list.map(l=>`<div>${l?esc(l):"&nbsp;"}</div>`).join("")}</div>`;
  const blank=left.length||right.length||details.length||logo?`<div class="blank"><div class="hd">${side(left,"sl")}<div class="lg">${logo}</div>${side(right,"sr")}</div>${details.length?`<div class="det">${details.map(esc).join("<br>")}</div>`:""}</div>`:"";
  const about=aboutLines(L);
  const sign=L.sign_position||L.sign_name?`<table class="sign"><tr><td>${lines(L.sign_position).map(esc).join("<br>")}</td><td class="r">${esc(L.sign_name||"")}</td></tr></table>`:"";
  const ex=lines(L.executor);
  return`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(L.title||"Письмо")}</title><style>
@page{size:A4;margin:15mm 15mm 18mm 25mm}
body{margin:0;font:12pt/1.4 "Times New Roman",Times,serif;color:#000}
.blank{margin-bottom:9mm}
.hd{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6mm;padding-bottom:2mm;border-bottom:1.5px solid #000}
.sl,.sr{font-size:10.5pt;line-height:1.25;font-weight:bold}.sr{text-align:right}
.lg{text-align:center}.blank .logo{display:block;max-height:27mm;max-width:50mm;object-fit:contain}
.det{margin-top:1.5mm;text-align:center;font-size:10pt;line-height:1.3}
.top{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:18px}
.num{font-size:11pt;min-width:60mm;max-width:85mm}.num .no{font-weight:bold;text-decoration:underline}.closing{margin-top:22px;font-weight:bold;text-indent:0}.sign td{font-weight:bold}.num .ab{margin-top:2mm;font-size:10pt}.to{width:80mm;white-space:pre-line}
h1{font-size:12pt;text-align:center;margin:6px 0 12px}
p{margin:0 0 4px;text-indent:12.5mm}li p,li{text-indent:0}ul,ol{margin:0 0 4px;padding-left:12.5mm}
.sign{width:100%;margin-top:8px;border-collapse:collapse}.sign td{vertical-align:bottom;padding:0}.sign .r{text-align:right;white-space:nowrap}
.ex{margin-top:30px;font-size:9pt;line-height:1.3}
</style></head><body>${blank}<div class="top"><div class="num"><span class="no">${esc(numberText(L))}</span>${replyText(L)?"<br>"+esc(replyText(L)):""}${about.length?`<div class="ab">${about.map(esc).join("<br>")}</div>`:""}</div><div class="to">${esc(lines(L.to).join("\n"))}</div></div>
${L.title?`<h1>${esc(L.title)}</h1>`:""}${blocksHtml(L.blocks||[])}${needClosing(L)?'<p class="closing">С уважением,</p>':""}${sign}${ex.length?`<div class="ex">${ex.map(esc).join("<br>")}</div>`:""}</body></html>`
 }

 // ---- Word ----
 const xml=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,"");
 const run=(text,o={})=>`<w:r><w:rPr>${o.font?`<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}" w:cs="${o.font}"/>`:""}${o.b?"<w:b/>":""}${o.i?"<w:i/>":""}${o.u?'<w:u w:val="single"/>':""}${o.color?`<w:color w:val="${o.color}"/>`:""}${o.sz?`<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>`:""}</w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
 const brRun='<w:r><w:br/></w:r>';
 const para=(inner,o={})=>`<w:p><w:pPr>${o.keep?"<w:keepNext/>":""}<w:spacing w:before="${o.before||0}" w:after="${o.after??60}"/>${o.ind?`<w:ind ${o.ind}/>`:""}<w:jc w:val="${o.jc||"both"}"/></w:pPr>${inner}</w:p>`;
 const cell=(inner,w,o={})=>`<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.v?`<w:vAlign w:val="${o.v}"/>`:""}</w:tcPr>${inner||"<w:p/>"}</w:tc>`;
 const table=(cols,rows,o={})=>`<w:tbl><w:tblPr><w:tblW w:w="${cols.reduce((s,x)=>s+x,0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${["top","left","right","insideH","insideV"].map(k=>`<w:${k} w:val="nil"/>`).join("")}<w:bottom w:val="${o.line?"single":"nil"}" w:sz="12" w:space="0" w:color="000000"/></w:tblBorders><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${cols.map(w=>`<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rows.map(r=>`<w:tr>${r.map((c,i)=>cell(c,cols[i],o)).join("")}</w:tr>`).join("")}</w:tbl>`;
 const WIDTH=9638;// A4 без полей 25 + 15 мм, в twips
 function pictureXml(logo,media,hMm=22,wMm=45){
  const n=media.length+1,id="rIdImg"+n,ext=logo.type==="image/jpeg"?"jpeg":"png",h=Math.round(hMm/25.4*914400),w=Math.round(h/Math.max(.1,logo.ratio||1));
  const cx=Math.min(w,Math.round(wMm/25.4*914400)),cy=Math.round(cx*(logo.ratio||1));
  media.push({id,name:`logo${n}.${ext}`,data:logo.data});
  return`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Логотип"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="logo${n}.${ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
 }
 const JC={left:"left",center:"center",right:"right",both:"both"};
 function documentXml(L,head={},media=[]){
  const body=[];
  const left=blockLines(head.org),right=blockLines(head.orgKz),details=lines(head.details),logo=head.logo?.data?.length?head.logo:null;
  if(left.length||right.length||details.length||logo){
   // Шапка: слева по-русски, по центру логотип, справа по-казахски; снизу черта; под ней реквизиты по центру.
   const sideW=3700,midW=WIDTH-2*sideW;
   const side=(list,jc)=>list.map(l=>l?para(run(l,{b:true,sz:21}),{jc,after:0}):para("",{jc,after:0})).join("")||"<w:p/>";
   const mid=logo?para(pictureXml(logo,media,27,50),{jc:"center",after:0}):"<w:p/>";
   body.push(table([sideW,midW,sideW],[[side(left,"left"),mid,side(right,"right")]],{line:true,v:"center"}));
   for(const l of details)body.push(para(run(l,{sz:20}),{jc:"center",after:0,before:l===details[0]?60:0}));
   body.push(para("",{after:240}))}
  const reply=replyText(L);
  body.push(table([4300,WIDTH-4300-4800,4800],[[para(run(numberText(L),{sz:22,b:true,u:true}),{jc:"left",after:0})+(reply?para(run(reply,{sz:22}),{jc:"left",after:0}):"")+aboutLines(L).map((l,i)=>para(run(l,{sz:20}),{jc:"left",after:0,before:i?0:100})).join(""),"<w:p/>",lines(L.to).map(l=>para(run(l),{jc:"left",after:0})).join("")||"<w:p/>"]],{v:"bottom"}));
  body.push(para("",{after:200}));
  if(L.title)body.push(para(run(L.title,{b:true}),{jc:"center",after:200}));
  for(const b of L.blocks||[]){
   const inner=b.runs.map(r=>r.br?brRun:run(r.text,r)).join("");
   if(b.list){const mark=b.list==="ol"?b.num+".":"•",left=709+360*(b.level||0);
    body.push(para(run(mark+"\t")+inner,{jc:JC[b.align]||"both",ind:`w:left="${left}" w:hanging="360"`}))}
   else body.push(para(inner,{jc:JC[b.align]||"both",ind:'w:firstLine="709"'}))}
  if(L.sign_position||L.sign_name){
   body.push(para("",{after:300}));
   if(needClosing(L))body.push(para(run("С уважением,",{b:true}),{jc:"left",after:60}));
   body.push(table([5600,WIDTH-5600],[[lines(L.sign_position).map(l=>para(run(l,{b:true}),{jc:"left",after:0})).join("")||"<w:p/>",para(run(L.sign_name||"",{b:true}),{jc:"right",after:0})]],{v:"bottom"}))}
  const ex=lines(L.executor);if(ex.length){body.push(para("",{after:480}));for(const l of ex)body.push(para(run(l,{sz:18}),{jc:"left",after:0}))}
  return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="1020" w:left="1418" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`
 }
 const STYLES='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
 function docxFiles(L,head={}){
  const media=[],doc=documentXml(L,head,media);
  return[
   ["[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
   ["_rels/.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
   ["docProps/core.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(L.title||"Письмо")}</dc:title><dc:creator>IR Project</dc:creator></cp:coreProperties>`],
   ["word/_rels/document.xml.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+media.map(m=>`<Relationship Id="${m.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join("")+'</Relationships>'],
   ["word/styles.xml",STYLES],
   ["word/document.xml",doc],...media.map(m=>["word/media/"+m.name,m.data])]
 }
 const zipper=()=>root.irExecDocs?.zip||(typeof require==="function"?require("./executive-docs").zip:null);
 const toDocx=(L,head)=>zipper()(docxFiles(L,head));
 // Имя файла: «Исх. 15 от 02.11.2026 — О поставке металла».
 const fileName=L=>("Исх. "+(String(L.number||"").trim()||"б-н")+(L.date?" от "+ruDate(L.date):"")+(L.title?" — "+L.title:"")).replace(/[<>:"/\\|?*\x00-\x1F]/g,"_").replace(/\s+/g," ").trim().slice(0,110);
 // Следующий номер: наибольший номер писем (с тем же началом) + 1. «АТС-14» → «АТС-15».
 // Следующий номер. «Начало номера» из бланка — буквы («АТ-») или первый номер («АТ-1»): номер идёт за наибольшим
 // номером писем с тем же началом, но не меньше заданного. Без начала берётся начало последнего письма.
 // ["АТ-1"] → «АТ-2»; начало «АТ-1» и ["АТ-1","2"] → «АТ-2»; начало «АТ-» и ["АТ-14","АТ-9","15"] → «АТ-15».
 const splitNo=v=>{const m=/^(.*?)(\d+)\s*$/.exec(String(v||"").trim());return m?{base:m[1],n:Number(m[2])}:{base:String(v||"").trim(),n:null}};
 const baseKey=v=>String(v||"").trim().toLowerCase().replace(/\s+/g,"");
 function nextNumber(numbers,prefix=""){
  const list=(numbers||[]).map(x=>String(x||"").trim()).filter(Boolean),p=splitNo(prefix);
  const base=String(prefix||"").trim()?p.base:list.length?splitNo(list[0]).base:"",start=p.n!=null?p.n:1;
  let max=0;for(const s of list){const x=splitNo(s);if(x.n!=null&&baseKey(x.base)===baseKey(base))max=Math.max(max,x.n)}
  return base+Math.max(max+1,start)
 }

 const api={blocksFromHtml,plain,textToBlocks,toHtml,blocksHtml,toDocx,documentXml,docxFiles,fileName,nextNumber,ruDate,numberText};
 root.irLetters=api;
 if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
