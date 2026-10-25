"use strict";
/*
 * IR Project AI: reading lettering that has no text layer — lettering exported as curves, scanned sheets and
 * pictures pasted into a drawing (tables of assembly sheets are often such pictures). The area is rendered and
 * recognised locally (Tesseract, Russian model, no network). Before recognition long straight runs of dark pixels
 * (table rules, drawing lines) are wiped and an italic drafting font (ГОСТ 2.304 type Б, ~15°) is sheared upright:
 * both raise the share of read cells several times. Whether the font is italic is decided on the first area. Words come back as text items in the PDF's top-down points.
 * A scanned sheet (thick strokes, rules broken into dashes by the scanner) is also cleared of thin specks and dashes
 * before recognition, and a word read with every sign sure is kept though Tesseract doubts the word as a whole (a Ø it
 * does not know, a mark of the drafting font).
 */
const SCALE=3.5,MIN_CONFIDENCE=60,TILE_PT=700,OVERLAP_PT=40,MAX_PIXELS=60e6,SHEAR=Math.tan(12*Math.PI/180),RULE_PT=12;
// Words worth keeping: letters or digits, not stray strokes read as "|", "=", "—".
const WORD=/[0-9A-Za-zА-Яа-яЁё]/u;
async function createOcrWorker(ocr){
 const worker=await require(ocr.tesseract).createWorker("rus",1,{langPath:ocr.langPath,gzip:true,cacheMethod:"none"});
 // Sparse text: a drawing has scattered labels, not paragraphs.
 await worker.setParameters({tessedit_pageseg_mode:"11"});
 return worker
}
// A word Tesseract doubts as a whole while every sign of it is read surely (≥ 90): a number (the Ø it does not know
// comes as "@" or "©"), a mark ("П4", "ПЗ") or a word of four letters or more. Short words of letters are left out:
// dashed lines of a scan read as "Вай", "Ван" with sure signs. "#" before a number is the Ø too ("#10700" at 55), but a
// run of digits with commas read at a low word confidence comes the same way ("81,82,85" read "#18265" at 42): it is kept
// from a word confidence of 50.
const SURE_WORD=/^[@©Ø]?\d[\d.,]*$|^[А-ЯЁA-Z]{1,3}[З0-9]{1,3}$|^[А-ЯЁа-яё-]{4,}[.,:]?$/u,SURE_DIAMETER=/^#\d{4,6}$/u;
function keep(w,lenient){
 if(!WORD.test(w.text||""))return false;
 if(w.confidence>=MIN_CONFIDENCE)return true;
 const signs=w.symbols||[],text=String(w.text).replace(/[‘’'`]/gu,"");
 return lenient&&w.confidence>=30&&signs.length>0&&signs.every(c=>c.confidence>=90)&&(SURE_WORD.test(text)||w.confidence>=50&&SURE_DIAMETER.test(text))
}
// Runs of words of one image, as a CAD text item would be: words of a line with no wide gap between them.
// lenient: the words of an area of the sheet (sure signs count, see keep); the turn of a sheet is judged by sure words.
// A word kept by its sure signs alone is of the height of the surely read words of its line: a box several lines tall
// is a misreading (УПН: "детина" 36 px tall beside "Шахтная" 8 px, joined, it swallowed the leader of the label).
async function recognise(worker,buffer,lenient=false){
 const r=await worker.recognize(buffer,{},{blocks:true});
 const runs=[],height=w=>w.bbox.y1-w.bbox.y0;
 for(const line of (r.data.blocks||[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines))){
  const sure=line.words.filter(w=>WORD.test(w.text||"")&&w.confidence>=MIN_CONFIDENCE).map(height).sort((a,b)=>a-b),usual=sure[sure.length>>1];
  let run=null;
  for(const w of line.words.filter(w=>keep(w,lenient)&&(w.confidence>=MIN_CONFIDENCE||!sure.length||height(w)<=usual*2.2))){
   const h=height(w),hr=run?run.bbox.y1-run.bbox.y0:h,sureBoth=run&&w.confidence>=MIN_CONFIDENCE&&run.confidence>=MIN_CONFIDENCE;
   // Brackets make a word taller ("лестница (90)"): words read surely are joined whatever their heights.
   if(run&&w.bbox.x0-run.bbox.x1<=h*1.2&&Math.abs(w.bbox.y1-run.bbox.y1)<=h*0.4&&(sureBoth||Math.max(h,hr)<=Math.min(h,hr)*2.2)){
    run.text+=" "+w.text;run.bbox={x0:run.bbox.x0,y0:Math.min(run.bbox.y0,w.bbox.y0),x1:w.bbox.x1,y1:Math.max(run.bbox.y1,w.bbox.y1)};
    run.confidence=Math.min(run.confidence,w.confidence)
   }else{run={text:w.text,confidence:w.confidence,bbox:{...w.bbox}};runs.push(run)}
  }
 }
 return runs
}
// Typical misreadings of the drafting font in a mark: "ФЗ" for Ф3, "ПЗ2" for П32, "КО" for К0, "К!" for К1; the Ø sign read as "@"
// or "©" before a number; a stray quote inside a word ("Д‘нище").
function clean(str){
 const s=String(str).replace(/^[|\\/()[\]{}'"“”‘’«»,;:]+|[|\\/[\]{}'"“”‘’«»,;:]+$/gu,"").trim()
  .replace(/^[@©](?=\d{3,6}$)/u,"Ø").replace(/([А-ЯЁа-яё])[‘’'`](?=[а-яё])/gu,"$1").replace(/^([А-ЯЁ]{1,3}[З0-9]{0,2})!$/u,(m,a)=>a+"1");
 return s.replace(/^([А-ЯЁ]{0,2}[А-ЖИ-НП-ЯЁ])([З0-9О]{1,4})$/u,(m,a,b)=>/\d/.test(b)||b.length===1?a+b.replace(/З/g,"3").replace(/О/g,"0"):m)
}
// Wipes long horizontal and vertical runs of dark pixels: rules of tables and lines of the drawing.
function wipeRules(ctx,w,h,run){
 const img=ctx.getImageData(0,0,w,h),p=img.data,dark=new Uint8Array(w*h),kill=new Uint8Array(w*h);
 for(let i=0;i<w*h;i++)dark[i]=p[i*4]+p[i*4+1]+p[i*4+2]<600?1:0;
 for(let y=0;y<h;y++){let s=-1;for(let x=0;x<=w;x++){const v=x<w&&dark[y*w+x];if(v&&s<0)s=x;if(!v&&s>=0){if(x-s>=run)kill.fill(1,y*w+s,y*w+x);s=-1}}}
 for(let x=0;x<w;x++){let s=-1;for(let y=0;y<=h;y++){const v=y<h&&dark[y*w+x];if(v&&s<0)s=y;if(!v&&s>=0){if(y-s>=run)for(let k=s;k<y;k++)kill[k*w+x]=1;s=-1}}}
 for(let i=0;i<w*h;i++)if(kill[i])p[i*4]=p[i*4+1]=p[i*4+2]=255;
 ctx.putImageData(img,0,0)
}
// The usual width of strokes in pixels: the median length of dark runs across rows and columns. Lines drawn by a PDF
// are 1–3 px at the reading scale, those of a scan 5–8 px.
function strokeWidth(ctx,w,h){
 const p=ctx.getImageData(0,0,w,h).data,count=new Uint32Array(41);let all=0;
 const run=(n,len,at)=>{for(let a=0;a<n;a+=2){let r=0;for(let b=0;b<=len;b++){if(b<len&&p[at(a,b)*4]+p[at(a,b)*4+1]+p[at(a,b)*4+2]<600)r++;else if(r){if(r<=40){count[r]++;all++}r=0}}}};
 run(h,w,(y,x)=>y*w+x);run(w,h,(x,y)=>y*w+x);
 for(let i=1,c=0;i<=40;i++){c+=count[i];if(c>=all/2)return i}
 return 0
}
// Opening of a scanned image (thinned by a pixel, then thickened back): specks and the dashes left of the rules go,
// strokes of the lettering stay whole.
function clearSpecks(ctx,w,h){
 const img=ctx.getImageData(0,0,w,h),p=img.data,d=new Uint8Array(w*h),e=new Uint8Array(w*h);
 for(let i=0;i<w*h;i++)d[i]=p[i*4]+p[i*4+1]+p[i*4+2]<600?1:0;
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;e[i]=d[i]&&d[i-1]&&d[i+1]&&d[i-w]&&d[i+w]?1:0}
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;d[i]=e[i]||e[i-1]||e[i+1]||e[i-w]||e[i+w]?1:0}
 for(let i=0;i<w*h;i++){const v=d[i]?0:255;p[i*4]=p[i*4+1]=p[i*4+2]=v}
 ctx.putImageData(img,0,0)
}
// Renders a rectangle of the sheet (top-down points) and returns its words in sheet points.
// turned: the area is read turned clockwise, for upward lettering.
// shear: the slant to straighten (0 for an upright font); "auto" reads both ways and keeps the better reading.
// rotation: the sheet is read turned by this many degrees clockwise (a scan that lies sideways or upside down).
async function readArea(page,rect,{canvas,worker,scale=SCALE,turned=false,shear=SHEAR,rotation=0}){
 scale=Math.min(scale,Math.sqrt(MAX_PIXELS/Math.max(1,rect.w*rect.h)));
 const viewport=page.getViewport({scale,rotation:((page.rotate||0)+rotation)%360,offsetX:-rect.x*scale,offsetY:-rect.y*scale});
 const W=Math.ceil(rect.w*scale),H=Math.ceil(rect.h*scale);
 const img=canvas.createCanvas(W,H),ctx=img.getContext("2d");
 ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
 await page.render({canvasContext:ctx,viewport,canvas:img}).promise;
 wipeRules(ctx,W,H,Math.round(RULE_PT*scale));
 if(strokeWidth(ctx,W,H)>=5)clearSpecks(ctx,W,H);
 const read=async k=>{
  // Turned clockwise first when asked: x' = H - y, y' = x; then sheared upright: x" = x' + k·y'.
  const tw=turned?H:W,th=turned?W:H;
  const out=canvas.createCanvas(Math.ceil(tw+th*k),th),oc=out.getContext("2d");
  oc.fillStyle="#fff";oc.fillRect(0,0,out.width,th);
  oc.setTransform(1,0,k,1,0,0);
  if(turned){oc.translate(H,0);oc.rotate(Math.PI/2)}
  oc.drawImage(img,0,0);
  return{k,runs:await recognise(worker,out.toBuffer("image/png"),true)}
 };
 const score=r=>r.runs.reduce((a,w)=>a+w.confidence*w.text.length,0);
 let best=await read(shear==="auto"?SHEAR:shear);
 if(shear==="auto"){const plain=await read(0);if(score(plain)>score(best))best=plain}
 const texts=[],k=best.k;
 texts.shear=k;
 for(const w of best.runs){
  const str=clean(w.text);if(!str||!WORD.test(str))continue;
  const b=w.bbox,x0=b.x0-k*b.y1,x1=b.x1-k*b.y1,size=(b.y1-b.y0)/scale/0.75;
  if(!turned)texts.push({str,x:rect.x+x0/scale,y:rect.y+b.y1/scale,width:(x1-x0)/scale,size,angle:0,ocr:true,confidence:Math.round(w.confidence)});
  // Upward lettering: its baseline is the right edge on the sheet, it starts at the bottom.
  else texts.push({str,x:rect.x+b.y1/scale,y:rect.y+(H-x0)/scale,width:(x1-x0)/scale,size,angle:90,ocr:true,confidence:Math.round(w.confidence)})
 }
 return texts
}
const boxOf=t=>t.angle?{x0:t.x-t.size*0.75,x1:t.x,y0:t.y-t.width,y1:t.y}:{x0:t.x,x1:t.x+t.width,y0:t.y-t.size*0.75,y1:t.y};
const overlaps=(a,b)=>a.x0<b.x1&&b.x0<a.x1&&a.y0<b.y1&&b.y0<a.y1;
// Tiles with an overlap, so that a word cut by one tile is whole in the next.
function tiles(x,y,w,h){
 const out=[];
 for(let ty=y;ty<y+h;ty+=TILE_PT-OVERLAP_PT)for(let tx=x;tx<x+w;tx+=TILE_PT-OVERLAP_PT)
  out.push({x:tx,y:ty,w:Math.min(TILE_PT,x+w-tx),h:Math.min(TILE_PT,y+h-ty)});
 return out.filter(t=>t.w>10&&t.h>10)
}
// A word read twice in the overlap is kept once.
function addUnique(list,texts){
 for(const t of texts){const b=boxOf(t);if(!list.some(o=>Math.abs(o.angle-t.angle)<1&&overlaps(boxOf(o),b)))list.push(t)}
}
/*
 * Whole sheet (no text layer): upright lettering by tiles, then upward lettering from the turned tiles.
 * page: PDF.js page; canvas: @napi-rs/canvas module; worker: from createOcrWorker().
 */
// onArea: called after each area, so that a long sheet keeps reporting progress.
// The slant of the font is found on the first area that has lettering and kept for the rest of the sheet.
async function readAll(page,areas,{canvas,worker,onArea,turned=false,rotation=0},into,state){
 for(const t of areas){
  const got=await readArea(page,t,{canvas,worker,turned,rotation,shear:state.shear??"auto"});
  if(state.shear===undefined&&got.length>=3)state.shear=got.shear;
  addUnique(into,got);onArea()
 }
}
// turn: the sheet's reading position found by sheetTurn; the words come back in the turned sheet's points.
async function ocrPage(page,{canvas,worker,onArea=()=>{},turn=0}){
 const v=page.getViewport({scale:1,rotation:((page.rotate||0)+turn)%360}),texts=[],up=[],state={};
 await readAll(page,tiles(0,0,v.width,v.height),{canvas,worker,onArea,rotation:turn},texts,state);
 await readAll(page,tiles(0,0,v.width,v.height),{canvas,worker,onArea,turned:true,rotation:turn},up,state);
 // Short upright words also read sideways as noise: the upright reading wins where they overlap.
 const flat=texts.map(boxOf);
 for(const t of up)if(!flat.some(f=>overlaps(f,boxOf(t))))texts.push(t);
 return texts
}
// A scanned sheet may lie sideways or upside down (the scanner does not care): the whole sheet is read small in the
// four positions and the one with the most confident words of three letters or more wins — only by a clear margin,
// so that a sheet that reads poorly every way stays as it is. Returns degrees clockwise (0, 90, 180, 270).
// onArea: called after each position, so that a slow sheet keeps reporting progress (a scan read four ways).
async function sheetTurn(page,{canvas,worker,onArea=()=>{}}){
 const score={};
 for(const turn of [0,90,180,270]){
  const rotation=((page.rotate||0)+turn)%360,v=page.getViewport({scale:1,rotation}),scale=Math.min(2,Math.sqrt(4e6/(v.width*v.height)));
  const vp=page.getViewport({scale,rotation}),W=Math.ceil(vp.width),H=Math.ceil(vp.height);
  const img=canvas.createCanvas(W,H),ctx=img.getContext("2d");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
  await page.render({canvasContext:ctx,viewport:vp,canvas:img}).promise;
  wipeRules(ctx,W,H,Math.round(RULE_PT*scale));
  const runs=await recognise(worker,img.toBuffer("image/png"));
  score[turn]=runs.reduce((n,w)=>n+(w.text.match(/[А-Яа-яЁё]{3,}/gu)||[]).join("").length*(w.confidence>=75?1:0.3),0);
  onArea();
  // A sheet that reads well as it lies is not tried the other ways (most sheets: one probe, not four).
  if(turn===0&&score[0]>=40)return 0
 }
 const best=[90,180,270].sort((a,b)=>score[b]-score[a])[0];
 return score[best]>=30&&score[best]>score[0]*1.6?best:0
}
// The geometry of a sheet read turned: points, boxes and size in the turned sheet (x' = H − y, y' = x for 90°).
function turnGeometry(g,turn){
 const W=g.widthPt,H=g.heightPt;
 const f=turn===90?p=>({x:H-p.y,y:p.x}):turn===180?p=>({x:W-p.x,y:H-p.y}):turn===270?p=>({x:p.y,y:W-p.x}):p=>p;
 const box=b=>{const a=f({x:b.x0,y:b.y0}),c=f({x:b.x1,y:b.y1});return{...b,x0:Math.min(a.x,c.x),x1:Math.max(a.x,c.x),y0:Math.min(a.y,c.y),y1:Math.max(a.y,c.y)}};
 const side=turn===90||turn===270;
 return{...g,widthPt:side?H:W,heightPt:side?W:H,turn,
  segments:g.segments.map(s=>({...s,a:f(s.a),b:f(s.b)})),images:(g.images||[]).map(box),texts:[]}
}
// Pictures pasted into a sheet with text: only their areas are read, and only words not already in the text layer.
async function ocrImages(page,images,known,{canvas,worker,onArea=()=>{}}){
 const have=known.map(boxOf),texts=[],state={};
 await readAll(page,images.flatMap(im=>tiles(im.x0,im.y0,im.x1-im.x0,im.y1-im.y0)),{canvas,worker,onArea},texts,state);
 return texts.filter(t=>!have.some(h=>overlaps(h,boxOf(t))))
}
// Glyph outlines inside recognised words are not drawing lines: they would be taken for leaders and members.
function dropLettering(segments,texts){
 const boxes=texts.map(t=>{const b=boxOf(t);return{x0:b.x0-1,x1:b.x1+1,y0:b.y0-t.size*0.1,y1:b.y1+1}});
 const inside=(p,b)=>p.x>=b.x0&&p.x<=b.x1&&p.y>=b.y0&&p.y<=b.y1;
 return segments.filter(s=>!boxes.some(b=>inside(s.a,b)&&inside(s.b,b)))
}
module.exports={ocrPage,ocrImages,dropLettering,createOcrWorker,readArea,sheetTurn,turnGeometry,clean,keep,recognise,strokeWidth,clearSpecks};
