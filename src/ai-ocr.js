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
// Thin strokes (lettering drawn as curves, one pixel wide) thickened by r pixels: Tesseract reads thin digits poorly
// (the labels of axis bubbles, see readRings).
function thickenStrokes(ctx,w,h,r){
 const im=ctx.getImageData(0,0,w,h),d=im.data,dark=new Uint8Array(w*h);
 for(let k=0;k<w*h;k++)dark[k]=d[4*k]<170?1:0;
 const out=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!dark[y*w+x])continue;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const yy=y+dy,xx=x+dx;if(dx*dx+dy*dy<=r*r&&yy>=0&&yy<h&&xx>=0&&xx<w)out[yy*w+xx]=1}}
 for(let k=0;k<w*h;k++){const v=out[k]?0:255;d[4*k]=d[4*k+1]=d[4*k+2]=v}
 ctx.putImageData(im,0,0)
}
// Runs of words of one image, as a CAD text item would be: words of a line with no wide gap between them.
// lenient: the words of an area of the sheet (sure signs count, see keep); the turn of a sheet is judged by sure words.
// A word kept by its sure signs alone is of the height of the surely read words of its line: a box several lines tall
// is a misreading (УПН: "детина" 36 px tall beside "Шахтная" 8 px, joined, it swallowed the leader of the label).
// pixels: () => {data, width} of the image read; a "5" of a number is then checked for the flat-topped "3" (flatThree).
// all: every word with a letter or digit (a table cell read for what its column holds: the caller judges it).
async function recognise(worker,buffer,lenient=false,pixels=null,all=false){
 const r=await worker.recognize(buffer,{},{blocks:true});
 const runs=[],height=w=>w.bbox.y1-w.bbox.y0;let px=null;
 for(const w of pixels?(r.data.blocks||[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.flatMap(l=>l.words))):[])
  if(/5/.test(w.text||"")&&NUMBER_WORD.test(w.text)&&(w.symbols||[]).map(c=>c.text).join("")===w.text)w.text=w.symbols.map(c=>flatThree(px||(px=pixels()),c)).join("");
 for(const line of (r.data.blocks||[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines))){
  const sure=line.words.filter(w=>WORD.test(w.text||"")&&w.confidence>=MIN_CONFIDENCE).map(height).sort((a,b)=>a-b),usual=sure[sure.length>>1];
  let run=null;
  for(const w of line.words.filter(w=>(all?WORD.test(w.text||""):keep(w,lenient))&&(w.confidence>=MIN_CONFIDENCE||!sure.length||height(w)<=usual*2.2))){
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
// The rows of a sign's box that hold the sign itself: the longest run of rows with ink (a tick of a leader above it,
// read into the box, is left out).
function signRows(pixels,b){
 const {data,width}=pixels,x0=Math.max(0,Math.round(b.x0)),x1=Math.round(b.x1);let best=[b.y0,b.y1],start=-1,gap=0;
 for(let y=Math.round(b.y0);y<=b.y1+1;y++){
  let ink=false;if(y<=b.y1)for(let x=x0;x<=x1&&!ink;x++)ink=data[4*(y*width+x)]<128;
  if(ink){if(start<0)start=y;gap=0;if(y-start>best[1]-best[0])best=[start,y]}else if(start>=0&&++gap>2){start=-1;gap=0}
 }
 return best
}
// The drafting font of many CAD sheets draws "3" with a flat top, like "Ʒ": Tesseract reads it "5" (355-11: «30» as
// «50», «33» as «55»). A "5" has a stroke down the left from its top bar; a "3" has nothing there.
const NUMBER_WORD=/^[^\d]{0,3}\d[\d.,]*$/u;
function flatThree(pixels,c){
 if(c.text!=="5")return c.text;
 const b=c.bbox,[top,bottom]=signRows(pixels,b),h=bottom-top,w=b.x1-b.x0;if(h<8||w<4)return"5";
 for(let y=Math.round(top+0.22*h);y<=top+0.42*h;y++)for(let x=Math.round(b.x0);x<=b.x0+0.3*w;x++)if(pixels.data[4*(y*pixels.width+x)]<128)return"5";
 return"3"
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
async function readArea(page,rect,{canvas,worker,scale=SCALE,turned=false,shear=SHEAR,rotation=0,all=false}){
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
  return{k,runs:await recognise(worker,out.toBuffer("image/png"),true,()=>({data:oc.getImageData(0,0,out.width,th).data,width:out.width}),all)}
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
// Axis bubbles of a sheet whose lettering is drawn as strokes (355-11 «Площадки»: the stamp in text, the drawing in
// curves): a ring of short segments with one label inside. Read with the rest of the sheet the ring spoils the label
// ("Ш", "О" for "1"); read alone — the ring and what lies outside it whitened, the thin strokes thickened, at about
// 30 px a sign, as one line — the label comes out. Labels of a row (or a column) of bubbles are then checked by their
// order: numbers run on by one, letters by the alphabet of axes, a letter between two neighbouring letters is
// a fraction ("А/1", "А/2" between А and Б, ГОСТ 21.101).
const AXIS_LETTERS="АБВГДЕЖИКЛМНПРСТУФШЭЮЯ";
function ringsOf(segments){
 const key=p=>Math.round(p.x*20)+","+Math.round(p.y*20);
 const short=segments.filter(s=>Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y)<=9);
 const parent=new Map(),find=k=>{let r=k;while(parent.get(r)!==r)r=parent.get(r);let c=k;while(parent.get(c)!==r){const n=parent.get(c);parent.set(c,r);c=n}return r};
 for(const s of short){const a=key(s.a),b=key(s.b);if(!parent.has(a))parent.set(a,a);if(!parent.has(b))parent.set(b,b);const ra=find(a),rb=find(b);if(ra!==rb)parent.set(ra,rb)}
 const loops=new Map();for(const s of short){const r=find(key(s.a));if(!loops.has(r))loops.set(r,[]);loops.get(r).push(s)}
 const rings=[];
 for(const list of loops.values()){
  if(list.length<10||list.length>200)continue;
  const pts=list.flatMap(s=>[s.a,s.b]),x=pts.reduce((a,p)=>a+p.x,0)/pts.length,y=pts.reduce((a,p)=>a+p.y,0)/pts.length;
  const ds=pts.map(p=>Math.hypot(p.x-x,p.y-y)),r=ds.reduce((a,b)=>a+b,0)/ds.length;
  const octants=new Set(pts.map(p=>Math.floor((Math.atan2(p.y-y,p.x-x)+Math.PI)/(2*Math.PI)*8)%8));
  if(r>=7&&r<=20&&ds.every(d=>Math.abs(d-r)<=Math.max(0.6,r*0.08))&&octants.size>=7)rings.push({x,y,r})
 }
 return rings.slice(0,200)
}
// A label small in its ring and in a thin italic font (ГПЭС М1.9, a sheet saved as a picture: «1» read «7», «Л» «И»)
// is read again larger and straightened when the first reading is unsure; Й and Х, never axis letters, are the И and Ж
// of the drafting font.
const RING_LABEL=/^(?:\d{1,3}|[А-ЯЁA-Z]{1,2}\d{0,3})(?:\/\d{1,2})?$/u;
async function readRings(page,rings,{canvas,worker,rotation=0}){
 const out=[];
 await worker.setParameters({tessedit_pageseg_mode:"7"});
 const readOne=async(ring,px,shear)=>{
  const scale=px/(2*ring.r),pad=25,W=px+2*pad;
  const viewport=page.getViewport({scale,rotation:((page.rotate||0)+rotation)%360,offsetX:-(ring.x-ring.r)*scale+pad,offsetY:-(ring.y-ring.r)*scale+pad});
  const img=canvas.createCanvas(W,W),ctx=img.getContext("2d");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,W,W);
  await page.render({canvasContext:ctx,viewport,canvas:img}).promise;
  ctx.fillStyle="#fff";ctx.beginPath();ctx.rect(0,0,W,W);ctx.arc(W/2,W/2,px/2*0.9,0,2*Math.PI,true);ctx.fill("evenodd");
  let read=img;
  if(shear){read=canvas.createCanvas(Math.ceil(W*(1+shear)),W);const rc=read.getContext("2d");rc.fillStyle="#fff";rc.fillRect(0,0,read.width,W);rc.setTransform(1,0,shear,1,0,0);rc.drawImage(img,0,0)}
  const rc=read.getContext("2d");thickenStrokes(rc,read.width,W,2);
  const r=await worker.recognize(read.toBuffer("image/png"));
  const text=String(r.data.text||"").replace(/\s+/g,"").replace(/[.,:;!?'"`’]+$/u,"").replace(/^Й$/u,"И").replace(/^Х$/u,"Ж");
  return{text,confidence:Math.round(r.data.confidence||0)}
 };
 try{
  for(const ring of rings){
   let got=await readOne(ring,60,0);
   if(!RING_LABEL.test(got.text)||got.confidence<80){const again=await readOne(ring,120,SHEAR);if(RING_LABEL.test(again.text)&&(!RING_LABEL.test(got.text)||again.confidence>got.confidence))got=again}
   out.push({...ring,...got})
  }
 }finally{await worker.setParameters({tessedit_pageseg_mode:"11"})}
 return ringLabels(out).map(g=>{const size=g.r*0.9,width=g.label.length*size*0.6;
  return{str:g.label,x:g.x-width/2,y:g.y+size*0.36,width,size,angle:0,ocr:true,ring:true,confidence:g.confidence}})
}
// Rings read → labels: what was read surely, what the order of a row or a column of bubbles gives.
function ringLabels(read){
 const valid=/^(?:\d{1,3}|[А-ЯЁA-Z]{1,2}\d{0,3})(?:\/\d{1,2})?$/u;
 const out=read.map(g=>({...g,label:valid.test(g.text)?g.text:"",by:valid.test(g.text)?"read":""}));
 const lines=(along,across)=>{
  const groups=[];
  for(const g of out){const l=groups.find(l=>Math.abs(l[0][across]-g[across])<l[0].r*0.3&&Math.abs(l[0].r-g.r)<1);if(l)l.push(g);else groups.push([g])}
  return groups.filter(l=>l.length>=3).map(l=>l.sort((a,b)=>a[along]-b[along]))
 };
 // A row: numbers by one, left to right or the other way.
 for(const row of lines("x","y")){
  let best=null;
  for(const step of [1,-1]){
   const count=new Map();row.forEach((g,i)=>{if(/^\d{1,3}$/.test(g.label)){const o=Number(g.label)-step*i;count.set(o,(count.get(o)||0)+1)}});
   for(const [o,n] of count)if(!best||n>best.n)best={o,n,step}
  }
  const numbers=row.filter(g=>/^\d{1,3}$/.test(g.label)).length;
  if(!best||best.n<3||best.n<numbers*0.5)continue;
  row.forEach((g,i)=>{
   const e=String(best.o+best.step*i);if(Number(e)<1||g.label===e||/\//.test(g.label))return;
   const taken=row.some(o=>o!==g&&o.label===e),twice=g.label&&row.some(o=>o!==g&&o.label===g.label);
   // A number out of the row's order (a «7» before «2», «3»… read surely) cannot stand there.
   const n=Number(g.label),prev=row.slice(0,i).filter(o=>/^\d{1,3}$/.test(o.label)).map(o=>Number(o.label)),next=row.slice(i+1).filter(o=>/^\d{1,3}$/.test(o.label)).map(o=>Number(o.label));
   const outOfOrder=/^\d{1,3}$/.test(g.label)&&(best.step>0?prev.some(v=>v>=n)||next.some(v=>v<=n):prev.some(v=>v<=n)||next.some(v=>v>=n));
   if(!taken&&(!g.label||g.confidence<80||twice||outOfOrder)){g.label=e;g.by="order"}
  })
 }
 // A column: letters by the alphabet of axes from the bottom up (or down), fractions between neighbouring letters.
 for(const col of lines("y","x")){
  for(const list of [col.slice().reverse(),col]){
   const at=list.map(g=>/^[А-ЯЁ]$/u.test(g.label)&&g.confidence>=80?AXIS_LETTERS.indexOf(g.label):-1);
   const known=at.map((a,i)=>a>=0?i:-1).filter(i=>i>=0);
   if(known.length<2||at[known[known.length-1]]<at[known[0]])continue;
   for(let k=0;k+1<known.length;k++){
    const i=known[k],j=known[k+1],steps=at[j]-at[i];
    if(steps===j-i)for(let m=i+1;m<j;m++){if(list[m].label!==AXIS_LETTERS[at[i]+m-i]){list[m].label=AXIS_LETTERS[at[i]+m-i];list[m].by="order"}}
    else if(steps===1)for(let m=i+1;m<j;m++){const f=AXIS_LETTERS[at[i]]+"/"+(m-i);if(list[m].label!==f){list[m].label=f;list[m].by="order"}}
   }
   // Past the letters read surely the column goes on by the alphabet, where a bubble was read unsurely or not at all
   // (ГПЭС М1.9: К and Л sure, the И and Ж under them doubtful).
   const lo=known[0],hi=known[known.length-1];
   if(at[hi]-at[lo]===hi-lo)for(let m=0;m<list.length;m++){
    if(m>=lo&&m<=hi)continue;
    const e=AXIS_LETTERS[at[lo]+m-lo];
    if(e&&list[m].label!==e&&(!list[m].label||list[m].confidence<80)){list[m].label=e;list[m].by="order"}
   }
   break
  }
 }
 return out.filter(g=>g.label)
}
// Labels on the shelves of leaders on a sheet in curves (355-11: «23», «30» over a shelf, its leaders slanting down to
// two posts): read with the whole sheet, a label crossed by an axis line or next to the leader's tick is lost or
// misread («57» for «37»). Read alone — the area over the shelf, lines wiped, strokes thickened, as one line — it
// comes out. A shelf: a short level line with a slanted line from one of its ends, strokes over it and no word read.
function shelvesOf(segments,texts){
 const len=s=>Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y),cell=4,key=(x,y)=>Math.floor(x/cell)+","+Math.floor(y/cell);
 const ends=new Map();
 for(const s of segments){const dx=Math.abs(s.a.x-s.b.x),dy=Math.abs(s.a.y-s.b.y);if(len(s)<=5||dy<dx*0.27||dx<dy*0.18)continue;
  for(const p of [s.a,s.b]){const k=key(p.x,p.y);if(!ends.has(k))ends.set(k,[]);ends.get(k).push(p)}}
 const slanted=p=>{for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const q of ends.get(key(p.x+i*cell,p.y+j*cell))||[])if(Math.hypot(p.x-q.x,p.y-q.y)<=1.5)return true;return false};
 const known=texts.map(boxOf),strokes=segments.filter(s=>len(s)<6),out=[];
 for(const s of segments){
  if(Math.abs(s.a.y-s.b.y)>=0.3||len(s)<8||len(s)>60||!slanted(s.a)&&!slanted(s.b))continue;
  const x0=Math.min(s.a.x,s.b.x),x1=Math.max(s.a.x,s.b.x),y=s.a.y,h=Math.max(14,Math.min(30,(x1-x0)*1.1));
  const box={x0:x0-2,x1:x1+4,y0:y-h,y1:y-0.8};
  if(known.some(k=>overlaps(k,box))||out.some(o=>overlaps(o,box)))continue;
  if(strokes.filter(q=>[q.a,q.b].every(p=>p.x>=box.x0&&p.x<=box.x1&&p.y>=box.y0&&p.y<=box.y1)).length<6)continue;
  out.push(box)
 }
 return out.slice(0,400)
}
// Only what a mark can be: «23», «37.1», «Б4», «К12».
const SHELF_LABEL=/^[А-ЯЁA-Z]{0,3}\d{1,3}(?:\.\d{1,2})?$/u;
// onArea: called every 20 shelves, so that a sheet with many keeps reporting progress.
async function readShelves(page,boxes,{canvas,worker,rotation=0,onArea=()=>{}}){
 const out=[],scale=4,pad=20;
 await worker.setParameters({tessedit_pageseg_mode:"7"});
 try{
  for(const [i,box] of boxes.entries()){
   if(i&&i%20===0)onArea();
   const W=Math.ceil((box.x1-box.x0)*scale)+2*pad,H=Math.ceil((box.y1-box.y0)*scale)+2*pad;
   const viewport=page.getViewport({scale,rotation:((page.rotate||0)+rotation)%360,offsetX:-box.x0*scale+pad,offsetY:-box.y0*scale+pad});
   const img=canvas.createCanvas(W,H),ctx=img.getContext("2d");
   ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
   await page.render({canvasContext:ctx,viewport,canvas:img}).promise;
   ctx.fillStyle="#fff";ctx.beginPath();ctx.rect(0,0,W,H);ctx.rect(pad,pad,W-2*pad,H-2*pad);ctx.fill("evenodd");
   wipeRules(ctx,W,H,Math.round(RULE_PT*scale));thickenStrokes(ctx,W,H,2);
   const r=await worker.recognize(img.toBuffer("image/png"),{},{blocks:true});
   const pixels={data:ctx.getImageData(0,0,W,H).data,width:W};
   const words=(r.data.blocks||[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.flatMap(l=>l.words)));
   const signs=words.flatMap(w=>w.symbols||[]).filter(c=>WORD.test(c.text)||/^[.,]$/u.test(c.text));
   const str=signs.map(c=>flatThree(pixels,c)).join("").replace(/^[.,]+|[.,]+$/gu,"").replace(",",".");
   if(!signs.length||!SHELF_LABEL.test(str))continue;
   // The box of the signs without the ink added by thickening and without a tick read over them.
   const x0=Math.min(...signs.map(c=>c.bbox.x0))+2,x1=Math.max(...signs.map(c=>c.bbox.x1))-2;
   const rows=signs.map(c=>signRows(pixels,c.bbox)),y0=Math.min(...rows.map(r=>r[0]))+2,y1=Math.max(...rows.map(r=>r[1]))-2;
   out.push({str,x:box.x0+(x0-pad)/scale,y:box.y0+(y1-pad)/scale,width:(x1-x0)/scale,size:(y1-y0)/scale/0.75,angle:0,ocr:true,shelf:true,
    confidence:Math.round(Math.min(...words.map(w=>w.confidence)))})
  }
 }finally{await worker.setParameters({tessedit_pageseg_mode:"11"})}
 return out
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
// The rules of a table pasted as a picture, from its dark pixels (dark[y·W + x]): the columns of pixels with a dark run
// of minRun or more down them (the centres of adjacent ones), and the rows of pixels dark over 80 % of [b0, b1) — two
// together, a dotted rule between the rows, grey at this scale (its dark: below 230 of 255); through the merged cells
// of the marks and of the mass of a mark no rule runs across the whole table, so b0, b1 are those of one column.
function verticalRules(dark,W,H,minRun){
 // (or broken by merged cells across it, its pieces each longer than a word is tall — 30 pt — together over minRun: ГПЭС
 // В1–В8, the rows «1% на сварку» across the columns of the parts)
 const out=[],long=Math.min(60,minRun/2);let prev=-2;
 for(let x=0;x<W;x++){
  let r=0,best=0,sum=0;for(let y=0;y<H;y++){if(dark[y*W+x]){if(++r>best)best=r}else{if(r>=long)sum+=r;r=0}}if(r>=long)sum+=r;
  if(best>=minRun||sum>=minRun){if(x-prev<=1&&out.length)out[out.length-1].push(x);else out.push([x]);prev=x}
 }
 return out.map(g=>(g[0]+g[g.length-1]+1)/2)
}
function horizontalRules(dark,W,H,b0,b1){
 const out=[],w=b1-b0;let prev=-3;if(w<4)return out;
 for(let y=0;y+1<H;y++){
  let n=0;for(let x=b0;x<b1;x++)if(dark[y*W+x]||dark[(y+1)*W+x])n++;
  if(n>=w*0.8){if(y-prev<=2&&out.length)out[out.length-1].push(y);else out.push([y]);prev=y}
 }
 return out.map(g=>(g[0]+g[g.length-1]+2)/2)
}
// The rules of a table in rect (sheet points) at scale 2: x of its vertical rules over half its height; rowsIn(x0, x1)
// gives y of the horizontal ones across that column.
async function tableRules(page,rect,{canvas,rotation=0,scale=2}){
 const viewport=page.getViewport({scale,rotation:((page.rotate||0)+rotation)%360,offsetX:-rect.x*scale,offsetY:-rect.y*scale});
 const W=Math.ceil(rect.w*scale),H=Math.ceil(rect.h*scale),img=canvas.createCanvas(W,H),ctx=img.getContext("2d");
 ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
 await page.render({canvasContext:ctx,viewport,canvas:img}).promise;
 const p=ctx.getImageData(0,0,W,H).data,dark=new Uint8Array(W*H),grey=new Uint8Array(W*H);
 for(let i=0;i<W*H;i++){const v=p[i*4]+p[i*4+1]+p[i*4+2];dark[i]=v<600?1:0;grey[i]=v<690?1:0}
 return{xs:verticalRules(dark,W,H,Math.round(H*0.5)).map(v=>rect.x+v/scale),
  rowsIn:(x0,x1)=>horizontalRules(grey,W,H,Math.max(0,Math.round((x0-rect.x)*scale)+2),Math.min(W,Math.round((x1-rect.x)*scale)-2)).map(v=>rect.y+v/scale)}
}
// Cells of a table read one by one as a line at one slant: per cell its words joined, with the least confidence of
// them, or null.
async function readTableCells(page,cells,{canvas,worker,shear=SHEAR,rotation=0,onArea=()=>{}}){
 const out=[];if(!cells.length)return out;
 await worker.setParameters({tessedit_pageseg_mode:"7"});
 try{
  for(const c of cells){
   const got=(await readArea(page,c,{canvas,worker,shear,rotation,all:true})).sort((a,b)=>a.x-b.x);
   out.push(got.length?{str:got.map(t=>t.str).join(" ").trim(),confidence:Math.min(...got.map(t=>t.confidence))}:null);
   onArea()
  }
 }finally{await worker.setParameters({tessedit_pageseg_mode:"11"})}
 return out
}
// Table cells read one by one as a line, at the usual slant of a CAD italic and a steeper one: Tesseract doubts such a
// font as a whole («Тр.□160х5» at 5 of 100) yet reads it right; a cell is taken when accept() gives back a text for it
// (what its column holds, put right), as one text over the cell.
async function readCells(page,cells,{canvas,worker,accept,rotation=0,onArea=()=>{}}){
 const out=[];if(!cells.length)return out;
 await worker.setParameters({tessedit_pageseg_mode:"7"});
 try{
  for(const c of cells){
   for(const shear of [SHEAR,Math.tan(16*Math.PI/180)]){
    const got=await readArea(page,c,{canvas,worker,shear,rotation,all:true}),str=got.length?accept(got.sort((a,b)=>a.x-b.x).map(t=>t.str).join(" ").trim()):null;
    if(str){const size=Math.max(...got.map(t=>t.size));out.push({str,x:Math.min(...got.map(t=>t.x)),y:Math.max(...got.map(t=>t.y)),width:Math.max(...got.map(t=>t.x+t.width))-Math.min(...got.map(t=>t.x)),size,angle:0,ocr:true,cell:c,confidence:Math.min(...got.map(t=>t.confidence))});break}
   }
   onArea()
  }
 }finally{await worker.setParameters({tessedit_pageseg_mode:"11"})}
 return out
}
// Glyph outlines inside recognised words are not drawing lines: they would be taken for leaders and members.
function dropLettering(segments,texts){
 const boxes=texts.map(t=>{const b=boxOf(t);return{x0:b.x0-1,x1:b.x1+1,y0:b.y0-t.size*0.1,y1:b.y1+1}});
 const inside=(p,b)=>p.x>=b.x0&&p.x<=b.x1&&p.y>=b.y0&&p.y<=b.y1;
 return segments.filter(s=>!boxes.some(b=>inside(s.a,b)&&inside(s.b,b)))
}
module.exports={ocrPage,ocrImages,readCells,tableRules,readTableCells,verticalRules,horizontalRules,SHEAR,dropLettering,createOcrWorker,readArea,sheetTurn,turnGeometry,clean,keep,recognise,strokeWidth,clearSpecks,ringsOf,readRings,ringLabels,shelvesOf,readShelves,flatThree};
