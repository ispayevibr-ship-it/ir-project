"use strict";
/*
 * Wall rails off the axis, from the node sections of a wall sheet («2-2»: the rail «Рр», the column, the axis bubble «Б»
 * and the chain «370» «500» = «870» from the outer face of the rail to the axis). The chain is taken only when its parts
 * add up to the total under them; the rail is the mark labelled at the outer end of the chain. Its centre is the total
 * less half the width of its section (from the «Ведомость элементов»), which the plan applies.
 */
const NUM=/^\d{2,5}$/,AXIS=/^[А-ЯЁ]$|^О\s*\d{1,2}$|^O\s*\d{1,2}$/u;
const MARK=/^(?:[А-ЯЁ][а-яё]{1,2}|[А-ЯЁ][а-яё]{0,2}\s*\d{1,2})$/u;
const flat=t=>Math.abs(Number(t.angle)||0)<2;
const s=t=>String(t.str).replace(/\s+/g," ").trim();

function extractRailOffsets(geometry){
 const texts=(geometry?.texts||[]).filter(flat),out=[];
 for(const b of texts.filter(t=>AXIS.test(s(t)))){
  // The total right above the bubble, left of it.
  const total=texts.filter(t=>NUM.test(s(t))&&t.y<b.y-4&&t.y>b.y-45&&t.x<b.x&&t.x>b.x-420).sort((p,q)=>q.y-p.y)[0];
  if(!total)continue;
  const parts=texts.filter(t=>NUM.test(s(t))&&t.y<total.y-5&&t.y>total.y-40&&t.x<b.x+10&&t.x>2*total.x-b.x-60);
  const rows=new Map();for(const t of parts){const k=Math.round(t.y/3);(rows.get(k)||rows.set(k,[]).get(k)).push(t)}
  const chain=[...rows.values()].find(r=>r.length>=2&&r.reduce((a,t)=>a+Number(s(t)),0)===Number(s(total)));
  if(!chain)continue;
  const left=2*total.x-b.x;
  const label=texts.filter(t=>MARK.test(s(t))&&!AXIS.test(s(t))&&!/^(?:Поз|Лист|Вид|Узел|См)$/u.test(s(t))&&t.y<total.y-120&&t.y>b.y-320&&t.x>left-160&&t.x<left+60)
   .sort((p,q)=>Math.abs(p.x-left)-Math.abs(q.x-left))[0];
  if(!label)continue;
  out.push({mark:s(label).replace(/\s+/g,""),axis:s(b).replace(/\s+/g,"").replace(/^O/u,"О"),edge_mm:Number(s(total))})
 }
 // One reading per mark and axis.
 const seen=new Set();return out.filter(r=>{const k=r.mark+"|"+r.axis+"|"+r.edge_mm;if(seen.has(k))return false;seen.add(k);return true})
}
module.exports={extractRailOffsets};
