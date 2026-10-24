"use strict";
/* Montage-scheme drafts are built from real vector PDF geometry: axes, dimensions, leaders. No AI. */
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createSchemeDrafts}=require("../src/ai-scheme-draft");
// A 1:~140 plan: axes 1-3 (6000 + 6000 mm) and A-C (6000 + 4500 mm), 50 mm per point.
function schemeFixture(){
 const ops=[];
 const line=(x1,y1,x2,y2)=>ops.push(x1+" "+y1+" m "+x2+" "+y2+" l S");
 const circle=(cx,cy,r)=>{
  const pts=[];for(let i=0;i<=24;i++){const a=i/24*2*Math.PI;pts.push((cx+r*Math.cos(a)).toFixed(2)+" "+(cy+r*Math.sin(a)).toFixed(2))}
  ops.push(pts[0]+" m "+pts.slice(1).map(p=>p+" l").join(" ")+" S")
 };
 // Dash-dot axis line: 12 pt dash, gap, 1 pt dot, gap.
 const dashed=(x1,y1,x2,y2)=>{
  const len=Math.hypot(x2-x1,y2-y1),ux=(x2-x1)/len,uy=(y2-y1)/len;
  for(let t=0;t<len;t+=19){
   const a=t,b=Math.min(len,t+12),c=Math.min(len,t+15),d=Math.min(len,t+16);
   line(x1+ux*a,y1+uy*a,x1+ux*b,y1+uy*b);if(c<len)line(x1+ux*c,y1+uy*c,x1+ux*d,y1+uy*d)
  }
 };
 const text=(str,x,y,size=10,rotate=false)=>ops.push("BT /F1 "+size+" Tf "+(rotate?"0 1 -1 0 ":"1 0 0 1 ")+x+" "+y+" Tm ("+str+") Tj ET");
 const xs=[200,320,440],ys=[150,270,360];
 xs.forEach((x,i)=>{circle(x,100,9);text(String(i+1),x-2.8,96.4);dashed(x,109,x,420)});
 ys.forEach((y,i)=>{circle(150,y,9);text("ABC"[i],150-3.3,y-3.6);dashed(159,y,500,y)});
 // Dimension chains: horizontal values for X, rotated values for Y.
 text("6000",250,118);text("6000",370,118);text("3000",222,132);
 text("6000",120,200,10,true);text("4500",120,305,10,true);
 // Shipping marks: label on a shelf, solid diagonal leader to the element.
 const mark=(str,tx,ty,ex,ey)=>{text(str,tx,ty);line(tx,ty-4,tx+16,ty-4);line(tx+1,ty-4,ex,ey)};
 mark("K1",206,166,201.5,151.5);   // column at 1/A
 mark("K7",446,286,441.5,271.5);   // column at 3/B
 mark("K2",266,166,261.5,151.5);   // column 3000 mm from axis 1, on axis A
 mark("P1",380,286,384,270.6);     // beam on axis B between axes 2 and 3
 const commands=ops.join("\n");
 const bodies=[
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 500] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  "<< /Length "+Buffer.byteLength(commands,"latin1")+" >>\nstream\n"+commands+"\nendstream",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
 ];
 let data="%PDF-1.4\n";const offsets=[];
 bodies.forEach((body,i)=>{offsets.push(Buffer.byteLength(data,"latin1"));data+=(i+1)+" 0 obj\n"+body+"\nendobj\n"});
 const xref=Buffer.byteLength(data,"latin1");
 data+="xref\n0 6\n0000000000 65535 f \n"+offsets.map(o=>String(o).padStart(10,"0")+" 00000 n \n").join("");
 data+="trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
 return Buffer.from(data,"latin1")
}
module.exports={schemeFixture};
if(require.main===module)(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-scheme-"));
 const pdf=schemeFixture();
 const database={rows:[],getObject:id=>Number(id)===7?{id:7}:null,
  listEntity(id,key){return this.rows.filter(x=>x.object_id===id&&x.section_key===key)},
  createEntity(id,key,item){const row={id:this.rows.length+1,object_id:id,section_key:key,title:item.title,
   record_type:item.record_type,data:item.data,created_at:"2026-10-21"};this.rows.push(row);return row},
  deleteEntity(id,key,rowId){const i=this.rows.findIndex(r=>r.object_id===id&&r.section_key===key&&r.id===rowId);if(i<0)return false;this.rows.splice(i,1);return true}};
 const documents={readForPdfIndex:async(oid,did)=>{
  assert.equal(oid,7);assert.equal(did,31);
  return{buffer:pdf,source:{documentId:31,name:"plan-K.pdf",sha256:"x".repeat(64),kind:"КМ",format:"PDF"}}
 }};
 const drafts=createSchemeDrafts({database,documents});
 try{
  await assert.rejects(drafts.scan(9,31),/Объект/);
  const progress=[];
  const draft=await drafts.scan(7,31,p=>progress.push(p));
  assert.deepEqual(progress,[{page:1,total:1}]);assert.equal(draft.source.name,"plan-K.pdf");
  assert.equal(draft.pages.length,1);
  const [scheme]=draft.pages[0].schemes;
  assert(scheme,"the axis grid is recognised as a scheme");
  assert(!scheme.error);
  assert.deepEqual(scheme.axesX,["1","2","3"]);
  assert.deepEqual(scheme.axesY,["A","B","C"]);
  assert.deepEqual(scheme.spansX,[6000,6000],"spans come from dimension texts");
  assert.deepEqual(scheme.spansY,[6000,4500]);
  assert.equal(scheme.sizeX,12000);assert.equal(scheme.sizeY,10500);
  // The journal of the sheet: spans as drawn by the scale against the spans written.
  assert.equal(scheme.calibration.spans,4);assert(scheme.calibration.max_pct<1,JSON.stringify(scheme.calibration));
  assert(draft.pages[0].ms>=0,"time of the sheet");
  const by=mark=>scheme.placements.find(p=>p.mark===mark);
  assert.deepEqual([by("K1").x_mm,by("K1").y_mm,by("K1").geometry_type,by("K1").confidence],[0,0,"column","high"]);
  assert.deepEqual([by("K7").x_mm,by("K7").y_mm,by("K7").axis_x,by("K7").axis_y],[12000,6000,"3","B"]);
  assert.deepEqual([by("K2").x_mm,by("K2").y_mm],[3000,0],"off-axis column snaps to a written dimension");
  assert.notEqual(by("K2").confidence,"high");
  assert.deepEqual([by("P1").geometry_type,by("P1").x_mm,by("P1").x2_mm,by("P1").y_mm,by("P1").y2_mm],["beam",6000,12000,6000,6000]);
  assert.equal(scheme.placements.length,4,"axis labels and dimensions are not marks");
  assert.deepEqual(draft.pages[0].context.titles,[],"sheet context is returned for the AI step");
  assert(draft.pages[0].context.text.includes("6000"));
  // Marks with the letter А: marks when the sheet uses them (many different "А…"), else a format or a rebar class.
  const {notMark,aMarksOn}=require("../src/ai-scheme-extract");
  const set=["А1","А2","А7","А20","А31","А44"].map(str=>({str}));
  assert.equal(aMarksOn(set),true);assert.equal(notMark("А20",true),false);
  assert.equal(notMark("А3",aMarksOn([{str:"Формат"},{str:"А3"}])),true,"a lone А3 is the sheet format");
  assert.equal(notMark("А500",true),true,"a rebar class is never a mark");
  assert.equal(notMark("М12",true),true);assert.equal(notMark("К12",false),false);
  console.log("PDF scheme drafts: real vector axes, dimension spans, leaders, sheet context PASS");
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
