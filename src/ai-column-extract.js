"use strict";
/*
 * Two-branch (lattice) columns from their КМ sheet «Колонна К 1». The view of the column gives:
 * - the lattice by its chain dimension «9 х 1200=10800» (vertical) and the dimensions below it down to the base
 *   («1000», «560»): the nodes of the lattice, counted from the base;
 * - the height of the lower (two-branch) part: the nearest vertical dimension beside the chain longer than it («13840»);
 * - the branches by the first row of two dimensions under the view: «350» «900» — the branch on the left at 350 from
 *   the axis, the other at 900 (the axis is where they meet); the axis named under them («Б», «Е») tells the plane;
 * - the parts by the letters of the «Ведомость элементов»: the part made of plates (а) is the branch, the channel (б)
 *   the strut, the angle (в) the diagonal, the part labelled above the lattice (г) the upper part.
 * Nothing is guessed: a column whose sheet does not give the chain or the branches is not a two-branch column here.
 */
const TITLE=/^Колонна\s+(К)\s*(\d{1,2})$/u;
const CHAIN=/^(\d{1,2})\s*[хx×]\s*(\d{3,4})\s*=\s*(\d{3,5})$/u;
const NUM=/^\d{2,5}$/;
const AXIS=/^[А-ЯA-Z](?:\d{0,2})?$|^О\s*\d{1,2}$/u;
const vertical=t=>Math.abs(Math.abs(Number(t.angle)||0)-90)<2;
const flat=t=>Math.abs(Number(t.angle)||0)<2;
const s=t=>String(t.str).replace(/\s+/g," ").trim();

// «-t20 х 300» → «−20×300»; rolled sections as written («[30П», «∟100х7», «I50Ш3»).
const plate=v=>{const m=/^[-−–]\s*t?\s*(\d{1,3})\s*[хx×]\s*(\d{2,4})$/u.exec(v);return m?"−"+m[1]+"×"+m[2]:null};
const rolled=v=>/^(?:\[|∟|L|I|□|2∟)\s*\d/u.test(v)||/^\d{2}[БШК]\d$/u.test(v)?v.replace(/\s+/g,""):null;

function parts(texts){
 const mark=texts.find(t=>flat(t)&&/^Марка$/u.test(s(t))),what=texts.find(t=>flat(t)&&/^Состав$/u.test(s(t)));
 if(!mark||!what)return null;
 const letters=texts.filter(t=>flat(t)&&/^[а-е]$/u.test(s(t))&&Math.abs(t.x-mark.x)<45&&t.y>mark.y&&t.y<mark.y+400).sort((a,b)=>a.y-b.y);
 const cells=texts.filter(t=>flat(t)&&Math.abs(t.x-what.x)<45&&t.y>what.y&&t.y<what.y+420&&(plate(s(t))||rolled(s(t))));
 const out={};
 for(const c of cells){
  const l=letters.slice().sort((a,b)=>Math.abs(a.y-c.y)-Math.abs(b.y-c.y))[0];
  if(!l||Math.abs(l.y-c.y)>30)continue;
  (out[s(l)]=out[s(l)]||[]).push({y:c.y,v:plate(s(c))||rolled(s(c)),plate:Boolean(plate(s(c)))})
 }
 const profile={};
 for(const [k,list] of Object.entries(out)){
  list.sort((a,b)=>a.y-b.y);
  profile[k]=list.every(x=>x.plate)?"Сварной "+list.map(x=>x.v).join(", "):list.find(x=>!x.plate)?.v||""
 }
 return profile
}

function extractColumnDetails(geometry){
 const texts=geometry?.texts||[],list=[];
 for(const title of texts.filter(t=>flat(t)&&TITLE.test(s(t)))){
  const m=TITLE.exec(s(title)),mk="К"+m[2];
  // The view of the column is under its title; the chain is the nearest one to it.
  const chain=texts.filter(t=>vertical(t)&&CHAIN.test(s(t))&&t.y>title.y&&Math.abs(t.x-title.x)<600).sort((a,b)=>Math.abs(a.x-title.x)-Math.abs(b.x-title.x))[0];
  if(!chain)continue;
  const [,n,step,total]=CHAIN.exec(s(chain)).map(Number);if(n*step!==total)continue;
  const nums=texts.filter(t=>vertical(t)&&NUM.test(s(t)));
  // Below the chain, on its line, down to the base.
  const below=nums.filter(t=>Math.abs(t.x-chain.x)<5&&t.y>chain.y).sort((a,b)=>a.y-b.y);
  const start=below.reduce((a,t)=>a+Number(s(t)),0);
  const lower=nums.filter(t=>Math.abs(t.x-chain.x)<70&&t.x!==chain.x&&Number(s(t))>total&&Math.abs(t.y-chain.y)<400).sort((a,b)=>Math.abs(a.y-chain.y)-Math.abs(b.y-chain.y))[0];
  if(!lower)continue;
  const lower_mm=Number(s(lower));
  // The whole height: the longest vertical dimension beside the chain (base to top).
  const whole=nums.filter(t=>Math.abs(t.x-chain.x)<110&&Number(s(t))>lower_mm&&t.y>title.y).sort((a,b)=>Number(s(b))-Number(s(a)))[0];
  if(start+total>lower_mm)continue;
  // Nodes from the base: the ends of the dimensions below the chain, then every step of it.
  const nodes=[];let z=0;
  for(const t of below.slice().reverse()){z+=Number(s(t));nodes.push(z)}
  for(let i=1;i<=n;i++)nodes.push(start+i*step);
  // The branches: the first row of two dimensions under the lowest label of the view, left of the chain.
  const low=Math.max(...below.map(t=>t.y),chain.y);
  const rows=new Map();
  for(const t of texts.filter(t=>flat(t)&&NUM.test(s(t))&&t.y>low&&t.y<low+260&&t.x<chain.x&&t.x>chain.x-450)){
   const k=Math.round(t.y/4);(rows.get(k)||rows.set(k,[]).get(k)).push(t)
  }
  const row=[...rows.values()].filter(r=>r.length===2).sort((a,b)=>a[0].y-b[0].y)[0];
  if(!row)continue;
  row.sort((a,b)=>a.x-b.x);
  const a_mm=Number(s(row[0])),b_mm=Number(s(row[1]));
  const axis=texts.filter(t=>flat(t)&&AXIS.test(s(t))&&t.y>row[0].y&&t.y<row[0].y+90&&t.x>row[0].x-80&&t.x<row[1].x+80).sort((a,b)=>a.y-b.y)[0];
  const profile=parts(texts)||{};
  const roles={};
  for(const [k,v] of Object.entries(profile)){
   if(/^Сварной/u.test(v)&&!roles.branch&&k==="а")roles.branch=v;
   else if(/^\[/u.test(v)&&!roles.strut)roles.strut=v;
   else if(/^(?:∟|L|2∟)/u.test(v)&&!roles.diagonal)roles.diagonal=v
  }
  // The upper part: the letter labelled in the view above the chain that is none of the others.
  const used=new Set(Object.entries(profile).filter(([,v])=>[roles.branch,roles.strut,roles.diagonal].includes(v)).map(([k])=>k));
  const upper=texts.filter(t=>flat(t)&&/^[а-е]$/u.test(s(t))&&!used.has(s(t))&&profile[s(t)]&&t.y>title.y&&t.y<chain.y-200&&Math.abs(t.x-chain.x)<350).sort((a,b)=>a.y-b.y)[0];
  if(upper)roles.upper=profile[s(upper)];
  // Flange width of a welded branch: the lattice lies on both its faces.
  const fw=/^Сварной\s+−\d+×(\d+)/u.exec(roles.branch||"");
  list.push({mark:mk,two_branch:{a_mm,b_mm,axis:axis?s(axis).replace(/\s+/g,""):null,flange_mm:fw?Number(fw[1]):null},lower_mm,height_mm:whole?Number(s(whole)):null,
   lattice:{nodes_mm:nodes,step_mm:step,count:n},parts:roles})
 }
 return list
}
module.exports={extractColumnDetails};
