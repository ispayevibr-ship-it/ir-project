"use strict";
/* IR Project: read stroked line segments and text items of one PDF page in top-down points, page rotation applied. */
const MAX_SEGMENTS=400000,MAX_TEXTS=20000,MAX_GLYPHS=200000,GLYPH_PT=20,PAINT_PT=3,MAX_PAINT=200000,FILL_PT2=200,MAX_FILLS=3000,MAX_FILL_NUM=120000;
// A sheet whose lettering is drawn in strokes flattened into specks (ГПЭС «Раскладка сэндвич-панелей», 04.11.2026: 567 000
// and 814 000 lines, 533 000 and 790 000 of them shorter than half a point): its first 400 000 lines were all the lettering
// could give, more than half of the drawing's own lines (8 700 of 14 000 — the joints of the panels) were never read, and the
// worker holding them and the list of the page's paths ran out of memory before its OCR. From COMPACT_AT lines on, a
// speck (SPECK_PT) gives way to the lines of the drawing: it is only counted (tiny) — the lettering is read by OCR from
// the picture of the sheet. What would still be over MAX_SEGMENTS is counted too (cut), not lost unseen.
const COMPACT_AT=150000,SPECK_PT=0.5;
const mul=(m,n)=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];
// Text items only — fast enough to list the sheets of a large PDF.
async function readPageTexts(page,viewport=page.getViewport({scale:1})){
 const vt=viewport.transform,content=await page.getTextContent(),texts=[];
 for(const item of content.items){
  if(texts.length>=MAX_TEXTS)break;
  const str=typeof item.str==="string"?item.str.trim():"";if(!str)continue;
  const m=mul(vt,item.transform||[1,0,0,1,0,0]);
  // In y-down space an upward-reading text has a negative y direction; angle +90 means "up".
  texts.push({str:str.slice(0,200),x:m[4],y:m[5],width:Number(item.width)||0,
   size:Math.hypot(m[2],m[3])||Number(item.height)||10,angle:-Math.atan2(m[1],m[0])*180/Math.PI})
 }
 return{texts:joinProfiles(texts.map(t=>({...t,str:plainText(t.str)})).filter(t=>t.str)),widthPt:viewport.width,heightPt:viewport.height}
}
// AutoCAD sheets write profile signs with a ГОСТ symbol font whose glyphs come out as private-use characters:
// U+F056 angle, U+F058 I-beam, U+F059 channel, U+F04D box tube. A shipping mark written with a space «К 1»,
// «Рп 1», «Свк 1», «Св 4-1» is one mark; steel «С 345» and words («Лист 7», «Поз 2») are not joined.
const GLYPH={"\uf056":"∟","\uf058":"I","\uf059":"[","\uf04d":"□"};
const SPACED_MARK=/^([А-ЯЁ]{1,3}|[А-ЯЁ][а-яё]{1,2})\s+(\d{1,3}(?:\s*[-.]\s*\d{1,3})?)$/u;
const NOT_SPACED=/^(?:С|C|Поз|Ось|См|Изм|Кол|Отм|Шаг|Вид|Тип|Ряд|Лит|Ст|Бк|КМ|КЖ|АР|ТХ|Гр|Кл|Кат|Ед|Шт|Ф)$/u;
// Russian written in Windows-1251 and read as Latin-1 — «ÒÎÎ «Ïðîåêòíî…» on the title sheets of ИР-71535 (13.11.2026):
// turned back into Cyrillic when the text is made of those letters.
const CP1251="ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—\u0098™љ›њќћџ\u00a0ЎўЈ¤Ґ¦§Ё©Є«¬\u00ad®Ї°±Ііґµ¶·ё№є»јЅѕї";
function cp1251(s){
 const hi=(s.match(/[\u00c0-\u00ff]/gu)||[]).length,letters=(s.match(/[A-Za-z\u00c0-\u00ff]/gu)||[]).length;
 if(hi<2||hi<letters*.6||/[\u0400-\u04ff]/u.test(s))return s;
 return[...s].map(c=>{const k=c.charCodeAt(0);return k>=0xc0&&k<=0xff?String.fromCharCode(0x410+k-0xc0):k>=0x80&&k<0xc0?CP1251[k-0x80]||c:c}).join("")
}
function plainText(str){
 let s=cp1251(String(str)).replace(/[\uf056\uf058\uf059\uf04d]/g,c=>GLYPH[c]).trim();
 const m=SPACED_MARK.exec(s);
 if(m&&!NOT_SPACED.test(m[1]))s=m[1]+m[2].replace(/\s+/g,"");
 return s
}
// A profile sign is its own text item before the size: «2» «∟» «180х11» → «2∟180х11», «I» «30Ш1» → «I30Ш1».
// The sign may come with the first size: «2» «∟ 125» «х10» → «2∟125х10».
function joinProfiles(texts){
 const sign=/^[∟I\[□](?:\s*\d{2,3})?$/u,used=new Set(),out=texts.map(t=>({...t}));
 out.forEach((a,i)=>{
  if(used.has(i)||!sign.test(a.str)||Math.abs(a.angle)>5)return;
  const sized=/\d$/.test(a.str),reach=sized?a.width+a.size*1.2:a.size*2.2;
  const line=k=>k!==i&&!used.has(k)&&Math.abs(out[k].y-a.y)<=a.size*.35&&Math.abs(out[k].angle)<=5;
  const after=out.map((b,k)=>[b,k]).filter(([b,k])=>line(k)&&b.x>=a.x&&b.x-a.x<=reach&&(sized?/^[хx×]\s*\d/u:/^\d/).test(b.str)).sort((p,q)=>p[0].x-q[0].x)[0];
  if(!after)return;
  const before=out.map((b,k)=>[b,k]).filter(([b,k])=>line(k)&&b.x<a.x&&a.x-b.x<=a.size*1.4&&/^2$/.test(b.str)).sort((p,q)=>q[0].x-p[0].x)[0];
  const start=before?before[0]:a;
  out[i]={...a,x:start.x,str:(before?"2":"")+a.str.replace(/\s+/g,"")+after[0].str.replace(/\s+/g,""),width:after[0].x+after[0].width-start.x};
  used.add(after[1]);if(before)used.add(before[1])
 });
 return out.filter((_,k)=>!used.has(k))
}
// Some CAD exports split one label into pieces: "К" + "36", "10-10 (" + "М1.2)". Pieces on one baseline
// that touch are joined when the result is a shipping mark or a section name — or a list of marks, the title of a
// group drawing ("К" + "114, К115, К116, К117, К118", ГПЭС л. 111).
const JOINED=/^(?:[А-ЯЁA-Z]{1,3}\d{1,4}(?:[-.]\d{1,3})?[а-я]?(?:\s*,\s*[А-ЯЁA-Z]{1,3}\d{1,4}(?:[-.]\d{1,3})?[а-я]?)*|(?:\d{1,2}|[А-ЯЁ])\s*-\s*(?:\d{1,2}|[А-ЯЁ])\s*\(\s*[А-ЯЁA-Z]?\d+(?:\.\d+)?\s*\))$/u;
function joinSplitTexts(texts){
 const out=[...texts],used=new Set();
 const order=[...texts.keys()].sort((a,b)=>texts[a].y-texts[b].y||texts[a].x-texts[b].x);
 for(const i of order){
  if(used.has(i))continue;
  // A label turned up a post comes glyph by glyph («В1» «9» «5», ГПЭС М1.19): read along its direction, piece after
  // piece; the pieces overlap a little more than on a line.
  const turned=Math.abs(texts[i].angle)>5;
  for(let more=true;more;){
   more=false;
   const a=out[i],r=a.angle*Math.PI/180,dir={x:Math.cos(r),y:-Math.sin(r)};let next=null;
   for(const j of order){
    if(j===i||used.has(j))continue;
    const b=texts[j];
    if((turned?Math.abs(b.angle-a.angle)>5:Math.abs(b.angle)>5)||Math.abs(b.size-a.size)>a.size*.25)continue;
    const dx=b.x-a.x,dy=b.y-a.y,along=dx*dir.x+dy*dir.y;
    if(Math.abs(dx*dir.y-dy*dir.x)>Math.max(1,a.size*.12))continue;
    const gap=along-a.width;if(gap<-a.size*(turned?.3:.2)||gap>a.size*.45)continue;
    const str=a.str+(gap>a.size*.15?" ":"")+b.str;
    if(!JOINED.test(str.replace(/\s+/g," ").trim()))continue;
    if(!turned){next={j,str,along,b};break}
    if(!next||along<next.along)next={j,str,along,b}
   }
   if(next){out[i]={...a,str:next.str,width:next.along+next.b.width};used.add(next.j);more=turned}
  }
 }
 return out.filter((_,k)=>!used.has(k))
}
async function readPageGeometry(pdfjs,page){
 // The viewport transform maps PDF space to the page as it is shown: y down, /Rotate applied.
 const viewport=page.getViewport({scale:1}),vt=viewport.transform;
 const OPS=pdfjs.OPS,list=await page.getOperatorList();
 // Filled paths are glyph outlines and hatching; drawing lines are stroked.
 const stroked=new Set([OPS.stroke,OPS.closeStroke]);
 const filled=new Set([OPS.fill,OPS.eoFill,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke]);
 // Small filled shapes: letters of lettering exported as curves (OCR reads their areas later).
 const segments=[],glyphs=[],images=[];
 // The colour laid on the sheet, in cells of PAINT_PT (ГПЭС «Раскладка сэндвич-панелей»: panels of RAL 2004 coloured
 // orange, of RAL 7004 grey, by hatching of thin coloured strokes — the colour tells two positions of one size apart):
 // filled areas larger than a letter and coloured strokes, not black or white.
 let fillColor="",strokeColor="",fillNum=0;const fillColors=[],strokeColors=[],painted=new Map(),fills=[];
 const images_=new Set([OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageMaskXObject,OPS.paintImageXObjectRepeat].filter(v=>v!==undefined));let ctm=[1,0,0,1,0,0];const stack=[];
 // The width of the line drawn, pt (`w` of a segment): an outline is drawn thick, an axis, a dimension and its
 // extension lines thin (ГОСТ 2.303).
 let lw=1;const lws=[];
 const point=(x,y)=>{const ux=ctm[0]*x+ctm[2]*y+ctm[4],uy=ctm[1]*x+ctm[3]*y+ctm[5];return{x:vt[0]*ux+vt[2]*uy+vt[4],y:vt[1]*ux+vt[3]*uy+vt[5]}};
 let tiny=0,cut=0,compact=false;
 const specks=from=>{let k=from;for(let j=from;j<segments.length;j++){const s=segments[j];if(Math.abs(s.a.x-s.b.x)<SPECK_PT&&Math.abs(s.a.y-s.b.y)<SPECK_PT&&Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y)<SPECK_PT){tiny++;continue}segments[k++]=s}segments.length=k};
 for(let i=0;i<list.fnArray.length;i++){
  if(segments.length>=MAX_SEGMENTS){cut=list.fnArray.length-i;break}
  const fn=list.fnArray[i],args=list.argsArray[i];
  if(fn===OPS.save){stack.push(ctm);lws.push(lw);fillColors.push(fillColor);strokeColors.push(strokeColor)}
  else if(fn===OPS.restore){ctm=stack.pop()||[1,0,0,1,0,0];lw=lws.length?lws.pop():1;fillColor=fillColors.length?fillColors.pop():"";strokeColor=strokeColors.length?strokeColors.pop():""}
  else if(fn===OPS.setFillRGBColor)fillColor=typeof args?.[0]==="string"?args[0].toLowerCase():""
  else if(fn===OPS.setStrokeRGBColor)strokeColor=typeof args?.[0]==="string"?args[0].toLowerCase():""
  else if(fn===OPS.transform)ctm=mul(ctm,args);
  else if(fn===OPS.setLineWidth)lw=Number(args?.[0])||0;
  else if(fn===OPS.setGState){for(const [k,v] of args?.[0]||[])if(k==="LW")lw=Number(v)||0}
  // A picture pasted into the drawing (often a scanned table): its place on the sheet, for OCR.
  else if(images_.has(fn)){
   const c=[point(0,0),point(1,0),point(0,1),point(1,1)];
   const box={x0:Math.min(...c.map(p=>p.x)),y0:Math.min(...c.map(p=>p.y)),x1:Math.max(...c.map(p=>p.x)),y1:Math.max(...c.map(p=>p.y))};
   if(box.x1-box.x0>=30&&box.y1-box.y0>=20)images.push(box)
  }
  else if(fn===OPS.constructPath){
   const [paint,[data]]=args;if(!data)continue;
   if(filled.has(paint)){
    if(glyphs.length>=MAX_GLYPHS)continue;
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(let j=0;j<data.length;){
     const op=data[j],n=op===0||op===1?2:op===2?6:op===3?4:0;
     for(let k=0;k<n;k+=2){const p=point(data[j+1+k],data[j+2+k]);if(p.x<x0)x0=p.x;if(p.x>x1)x1=p.x;if(p.y<y0)y0=p.y;if(p.y>y1)y1=p.y}
     j+=1+n
    }
    const coloured=fillColor&&!/^#(ffffff|000000)$/.test(fillColor);
    // A coloured area as drawn, by its outline (ИР-71535 АР ч.2 л.29 «План типов полов»: the covering of the floor by
    // colours — a few large filled outlines, their cells of PAINT_PT over MAX_PAINT and so not kept): the rings of the
    // path, curves by their ends; from FILL_PT2 of its box (a square of a
    // chequered covering of 17 pt too, small as a letter), MAX_FILLS of them and MAX_FILL_NUM numbers a sheet.
    if(coloured&&(x1-x0)*(y1-y0)>=FILL_PT2&&fills.length<MAX_FILLS&&fillNum<MAX_FILL_NUM){const rings=[];let ring=null;
     for(let j=0;j<data.length;){const op=data[j],n=op===0||op===1?2:op===2?6:op===3?4:0;
      if(op===0){ring=[];rings.push(ring)}
      if(n&&ring){const p=point(data[j+n-1],data[j+n]);ring.push(Math.round(p.x*10)/10,Math.round(p.y*10)/10)}
      j+=1+n}
     const ok=rings.filter(r=>r.length>=6);if(ok.length){fills.push({c:fillColor,box:[x0,y0,x1,y1].map(v=>Math.round(v*10)/10),rings:ok});fillNum+=ok.reduce((t,r)=>t+r.length,0)}}
    if(x1-x0<=GLYPH_PT&&y1-y0<=GLYPH_PT&&x1>x0)glyphs.push({x0,y0,x1,y1});
    else if(coloured&&(x1-x0)*(y1-y0)>=40){
     for(let x=Math.floor(x0/PAINT_PT);x<=Math.floor(x1/PAINT_PT);x++)for(let y=Math.floor(y0/PAINT_PT);y<=Math.floor(y1/PAINT_PT);y++)painted.set(x+","+y,fillColor)}
    continue
   }
   if(!stroked.has(paint))continue;
   const d=Array.from(data),from=segments.length,w=Math.round(lw*Math.sqrt(Math.abs(ctm[0]*ctm[3]-ctm[1]*ctm[2])*Math.abs(vt[0]*vt[3]-vt[1]*vt[2]))*100)/100;let start=null,last=null,startRaw=null,lastRaw=null;
   for(let j=0;j<d.length;){
    const op=d[j];
    if(op===0){start=last=point(d[j+1],d[j+2]);startRaw=lastRaw=[d[j+1],d[j+2]];j+=3}
    else if(op===1){const p=point(d[j+1],d[j+2]);if(last)segments.push({a:last,b:p});last=p;lastRaw=[d[j+1],d[j+2]];j+=3}
    // Curves become short chords: an axis bubble drawn as four arcs must still look like a ring of short segments.
    else if(op===2||op===3){
     // A quadratic curve is the cubic with control points 2/3 of the way to its one control point.
     const n=op===2?6:4,q=[d[j+1],d[j+2]],end=op===2?[d[j+5],d[j+6]]:[d[j+3],d[j+4]];
     if(last&&lastRaw){
      const c=op===2?[d[j+1],d[j+2],d[j+3],d[j+4]]:[lastRaw[0]+(q[0]-lastRaw[0])*2/3,lastRaw[1]+(q[1]-lastRaw[1])*2/3,end[0]+(q[0]-end[0])*2/3,end[1]+(q[1]-end[1])*2/3];
      let prev=last;
      for(let k=1;k<=n;k++){
       const t=k/n,u=1-t,b0=u*u*u,b1=3*u*u*t,b2=3*u*t*t,b3=t*t*t;
       const p=point(b0*lastRaw[0]+b1*c[0]+b2*c[2]+b3*end[0],b0*lastRaw[1]+b1*c[1]+b2*c[3]+b3*end[1]);
       segments.push({a:prev,b:p});prev=p
      }
      last=prev
     }else last=point(end[0],end[1]);
     lastRaw=end;j+=op===2?7:5;continue
    }
    else{if(last&&start&&(last.x!==start.x||last.y!==start.y))segments.push({a:last,b:start});last=start;lastRaw=startRaw;j+=1}
   }
   for(let k=from;k<segments.length;k++)segments[k].w=w;
   if(strokeColor&&!/^#(ffffff|000000)$/.test(strokeColor))for(let k=from;k<segments.length;k++){const q=segments[k];painted.set(Math.floor((q.a.x+q.b.x)/2/PAINT_PT)+","+Math.floor((q.a.y+q.b.y)/2/PAINT_PT),strokeColor)}
   if(!compact&&segments.length>=COMPACT_AT){compact=true;specks(0)}else if(compact)specks(from)
  }
 }
 const {texts}=await readPageTexts(page,viewport);
 return{segments,glyphs,images,...(fills.length?{fills}:{}),...(painted.size&&painted.size<=MAX_PAINT?{paint:[...painted].map(([k,c])=>{const [x,y]=k.split(",").map(Number);return{x:x*PAINT_PT,y:y*PAINT_PT,c}})}:{}),texts:joinSplitTexts(texts),widthPt:viewport.width,heightPt:viewport.height,...(tiny?{tiny}:{}),...(cut?{cut}:{})}
}
module.exports={readPageGeometry,readPageTexts,joinSplitTexts,plainText,joinProfiles};
