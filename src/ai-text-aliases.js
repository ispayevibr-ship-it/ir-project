"use strict";
/*
 * IR Project AI: abbreviations of drawings learned from Claude's processing (lessons of kind "alias", see
 * src/ai-knowledge.js): «в.к.» → «верх», «Шв.» → «Швеллер», «Б.» → «Болт». Every text of a sheet is written out in
 * full before it is read, so the same rules of the program (levels on schemes, profiles, fasteners, names of
 * structures) read sets that use other abbreviations. The original text is kept in `raw`.
 */
const LETTER="A-Za-zА-ЯЁа-яё";
const esc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\s+/g,"\\s*");
// [{from:["в.к."], to:"верх"}] → one function over a text; longer abbreviations first.
function aliasExpander(list){
 const pairs=[];
 for(const a of Array.isArray(list)?list:[])for(const f of Array.isArray(a?.from)?a.from:[]){const from=String(f).trim();if(from.length>=2&&String(a.to||"").trim())pairs.push([from,String(a.to).trim()])}
 if(!pairs.length)return null;
 pairs.sort((a,b)=>b[0].length-a[0].length);
 const map=new Map(pairs.map(([f,t])=>[f.toLowerCase().replace(/\s+/g,""),t]));
 // A word of its own: no letter right before, no letter right after (unless the abbreviation ends with a dot).
 const re=new RegExp(pairs.map(([f])=>"(?<!["+LETTER+".])"+esc(f)+(/\.$/.test(f)?"":"(?!["+LETTER+"])")).join("|"),"giu");
 // "Шв.16П" → "Швеллер 16П": a space where the abbreviation's dot stood right before the next word.
 return text=>String(text).replace(re,(m,at,all)=>{const t=map.get(m.toLowerCase().replace(/\s+/g,""));if(!t)return m;
  const next=all[at+m.length];return t+(/\.$/.test(m)&&next&&/\S/.test(next)?" ":"")})
}
// The texts of a sheet with the abbreviations written out (the geometry itself unchanged).
function expandTexts(texts,list){
 const f=aliasExpander(list);if(!f)return texts;
 return texts.map(t=>{const s=f(t.str);return s===t.str?t:{...t,str:s,raw:t.str}})
}
module.exports={aliasExpander,expandTexts};
