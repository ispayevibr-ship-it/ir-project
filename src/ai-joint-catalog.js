/*
 * IR Project AI: the catalog of mounting joints (узлы) — 1000 joints in 25 groups (knowledge/global/joints.json) and
 * the families with their rules by the norms (knowledge/global/connections.json, ТЗ «1000 монтажных узлов»).
 *  - sheetNodes(text): the titles of the nodes a sheet names («Узел 3», «Узел опирания балки на колонну»), each with
 *    the joints of the catalog its words fit — a hint («похоже на БК-012»), never a confirmation;
 *  - pick(node): the group and the families for a node of the scheme by where its members meet (a column base, a
 *    beam end at a column or on a beam, a joint of members) and what they are (column, beam, brace, truss, purlin,
 *    crane girder…), the families the sheet names first;
 *  - card(node): what the 3D card and the exported scheme show of it.
 * The catalog never moves an element or changes its data: it only names the kind of node and its rules, with the
 * state of the family (подтверждено / проверить / изучить) and its sources.
 * Works in Node (require) and in the page (window.irJointCatalog).
 */
(function(root){
"use strict";
var METHOD={bolted:"болты",hsb:"высокопрочные болты (фрикционное)",friction:"высокопрочные болты (фрикционное)",welded:"сварка",
 anchor:"анкерные болты",flange:"фланец на болтах",milled:"фрезерованный торец",screws:"самонарезающие винты, заклёпки",pin:"палец, шарнир",
 bearing:"опорная часть",threaded:"резьбовое (муфта, талреп)",clamp:"зажимы, хомуты",temporary:"временное крепление",detail:"деталь узла"};
var BEHAVIOUR={pinned:"шарнир",rigid:"жёсткий","semi-rigid":"полужёсткий",sliding:"подвижный (скользящий)",temporary:"монтажный, временный",detail:"деталь узла"};
var STATUS={confirmed:"подтверждено нормой",needs_check:"проверить",unknown:"изучить"};
var STOP={"и":1,"на":1,"к":1,"с":1,"в":1,"по":1,"из":1,"для":1,"от":1,"до":1,"при":1,"без":1,"через":1,"или":1,"узел":1,"узлы":1,"узла":1,"со":1,"под":1,"над":1,"об":1};
var ENDS=["иями","ями","ами","ого","его","ому","ему","ыми","ими","ой","ей","ий","ый","ая","яя","ое","ее","ые","ие","ов","ев","ам","ям","ах","ях","ом","ем","ую","юю","ия","ие","а","я","о","е","ы","и","у","ю","ь"];
function stem(w){
 w=String(w).toLowerCase().replace(/ё/g,"е");
 for(var i=0;i<ENDS.length;i++){var e=ENDS[i];if(w.length-e.length>=3&&w.slice(-e.length)===e){w=w.slice(0,-e.length);break}}
 // Numbers in words: «два анкера» and «двумя анкерами» are one.
 if(/^дв[уа]/.test(w))return"два";if(/^четыр/.test(w))return"четыр";if(/^шест/.test(w))return"шест";if(/^восьм|^восем/.test(w))return"восем";
 return w.slice(0,6)
}
function words(text){
 var out=[],seen={};
 String(text||"").toLowerCase().replace(/ё/g,"е").split(/[^а-яa-z]+/).forEach(function(w){
  if(w.length<3||STOP[w])return;var s=stem(w);if(!seen[s]){seen[s]=1;out.push(s)}
 });
 return out
}
// The group of a node by the words of its title on a sheet (the first that fits).
var GROUP_WORDS=[
 ["СК",/стык\S*\s+колонн|колонн\S*\s+стык/u],["СБ",/стык\S*\s+балк|балк\S*\s+стык/u],
 ["ББ",/балк\S*\s+(?:к|на)\s+балк|сопряжени\S*\s+балок|второстепенн|вспомогательн\S*\s+балк/u],
 ["ФО",/опорн\S*\s+узе?л\S*\s+ферм|опирани\S*\s+ферм|ферм\S*\s+(?:к|на)\s+колонн/u],["ФС",/укрупнит|стык\S*\s+(?:пояс|ферм)/u],
 ["ОЧ",/опорн\S*\s+част|фрезерован/u],["БАЗ",/(?:^|[^а-я])баз[аыу]?(?![а-я])|анкерн|фундаментн\S*\s+болт/u],["ОГ",/оголовк/u],
 ["МР",/монорельс|подвесн\S*\s+пут/u],["ПК",/подкранов|кранов\S*\s+рельс|рельс|тормозн/u],["ПР",/прогон|тяж/u],["СВ",/связ|распорк/u],
 ["ФХ",/фахверк/u],["ПЛ",/площадк|настил/u],["ЛО",/лестниц|марш|ограждени|стремянк/u],["ПФ",/подстропильн|фонар/u],
 ["БК",/балк\S*\s+(?:к|на)\s+колонн|примыкани\S*\s+балк|опирани\S*\s+балк|ригел\S*\s+к\s+колонн/u],
 ["ФР",/ферм|решетк|раскос/u],["РМ",/(?:^|[^а-я])рам[аыу]?(?![а-я])|карнизн|коньков|ригел\S*\s+рам/u],
 ["ЖБ",/закладн|бетон|(?:^|[^а-я])кладк|кирпич/u],["ТР",/(?:^|[^а-я])труб/u],["ЭС",/эстакад|галере/u],
 ["ПШ",/проушин|пальц|палец/u],["ЛК",/лстк|термопрофил|тонкостенн/u]
];
function groupOfTitle(t){
 t=String(t||"").toLowerCase().replace(/ё/g,"е");
 for(var i=0;i<GROUP_WORDS.length;i++)if(GROUP_WORDS[i][1].test(t))return GROUP_WORDS[i][0];
 return""
}
function create(data){
 data=data||{};
 var families=new Map(),groups=new Map(),joints=Array.isArray(data.joints)?data.joints:[],count=new Map();
 (data.families||[]).forEach(function(r){if(r&&r.id)families.set(r.id,r)});
 (data.groups||[]).forEach(function(g){if(g&&g.code)groups.set(g.code,g)});
 var famWords=new Map();families.forEach(function(f,id){famWords.set(id,words(f.name))});
 var index=joints.map(function(j){count.set(j.family,(count.get(j.family)||0)+1);return{j:j,w:words(j.name),fw:famWords.get(j.family)||[]}});
 // The joints of the catalog whose names the words of a title fit best: a word of the title found in the name counts
 // one; at least two words and half of the title; the group of the title first.
 function match(title,group,limit){
  var tw=words(title);if(tw.length<2)return[];
  var best=[];
  index.forEach(function(x){
   if(group&&x.j.group!==group)return;
   var hit=0,own=0;tw.forEach(function(w){var a=x.w.indexOf(w)>=0;if(a)own++;if(a||x.fw.indexOf(w)>=0)hit++});
   if(hit<2||hit/tw.length<.5)return;
   best.push({j:x.j,score:hit/tw.length+own/(tw.length*5)+own/(x.w.length*20)})
  });
  best.sort(function(a,b){return b.score-a.score||String(a.j.code).localeCompare(String(b.j.code))});
  return best.slice(0,limit||3).map(function(b){return{code:b.j.code,name:b.j.name,family:b.j.family,group:b.j.group,score:Math.round(b.score*100)/100}})
 }
 // «Узел 3», «Узел А», «Узлы 5, 6», «Узел опирания балки на колонну», «Узел 2. Крепление связей к колонне К1» — the
 // words of the title up to a mark, a number or a scale (М1:10); not the references («см. узел 3», «по узлу 2»).
 function sheetNodes(text){
  var t=String(text||"").replace(/\s+/g," "),out=[],seen={},re=/()(Узел|УЗЕЛ|Узлы|УЗЛЫ)\s*((?:[0-9]{1,3}[а-яa-z]?|[А-ЯA-Z])(?:\s*(?:,|и)\s*[0-9]{1,3})*)?\s*[.:—–-]?\s*/g,m;
  while((m=re.exec(t))){
   // Not inside a word (no look-behind: the exported scheme opens on old Safari too).
   if(m.index>0&&/[а-яёА-ЯЁ]/.test(t.charAt(m.index-1)))continue;
   var before=t.slice(Math.max(0,m.index-6),m.index).toLowerCase();
   if(/см\.?\s*$|по\s*$|в\s*$/.test(before))continue;
   var rest=t.slice(re.lastIndex,re.lastIndex+140),ws=[],tok=rest.split(" ");
   for(var i=0;i<tok.length&&ws.length<10;i++){
    var w=tok[i];if(!w)continue;
    if(/^[0-9]|^М\s*1|^[А-ЯA-Z]{1,3}[0-9]|^\(|^Узл|^УЗЛ|^Узел|^УЗЕЛ|^Лист|^лист/.test(w))break;
    if(!/^[а-яё]/i.test(w))break;
    ws.push(w.replace(/[.,;:]+$/,""));if(/[.;:]$/.test(w))break
   }
   var label=(m[2].charAt(0)+m[2].slice(1).toLowerCase())+(m[3]?" "+m[3].replace(/\s+/g," "):""),title=ws.join(" ");
   if(!m[3]&&words(title).length<2)continue;
   var key=label+"|"+title;if(seen[key])continue;seen[key]=1;
   var group=groupOfTitle(title),found=title?match(title,group,3):[];
   if(!found.length&&group&&title)found=match(title,"",3).filter(function(f){return f.group===group});
   out.push({label:label,title:title,group:group||(found[0]&&found[0].group)||"",joints:found});
   if(out.length>=40)break
  }
  return out
 }
 // ---- Nodes of the scheme ----
 function memberKind(m){
  var g=String(m.group||"").toLowerCase(),n=String(m.name||"").toLowerCase(),mk=String(m.mark||"").toLowerCase();
  if(g==="crane"||/подкранов|тормозн/.test(n))return"crane";
  if(g==="trusses"||/ферм/.test(n))return"truss";
  if(g==="purlins"||/прогон/.test(n))return"purlin";
  if(g==="fahwerk"||/фахверк/.test(n))return"fahwerk";
  if(g==="ties"||m.geometry==="brace"||/связ|распорк/.test(n))return"brace";
  if(g==="platforms"||m.geometry==="plate"||/настил/.test(n))return"platform";
  if(g==="stairs"||/лестниц|марш/.test(n))return"stair";
  if(g==="guards"||/огражден/.test(n))return"railing";
  if(m.geometry==="column"||g==="columns"||g==="posts"||/^к/.test(mk)&&m.geometry!=="beam")return"column";
  return"beam"
 }
 var BY_KIND={
  base:{group:"БАЗ",families:["column-base-pinned","column-base-rigid","anchor-bolts"]},
  top:{group:"ОГ",families:["beam-on-column-cap","column-cap"]},
  "top:truss":{group:"ФО",families:["truss-support","column-cap"]},
  "side:beam":{group:"БК",families:["beam-column-fin-plate","beam-column-end-plate-pinned","beam-on-seat","beam-column-end-plate-rigid"]},
  "side:crane":{group:"ПК",families:["crane-girder-support","crane-girder-top-fixing"]},
  "side:truss":{group:"ФО",families:["truss-support","beam-on-seat"]},
  "side:brace":{group:"СВ",families:["bracing-connection","gusset-plate"]},
  "side:purlin":{group:"ПР",families:["purlin-connection"]},
  "side:fahwerk":{group:"ФХ",families:["girt-wind-post"]},
  "side:platform":{group:"ПЛ",families:["platform-deck","beam-column-fin-plate"]},
  "side:stair":{group:"ЛО",families:["stair-stringer"]},
  "side:railing":{group:"ЛО",families:["railing"]},
  "beam:beam":{group:"ББ",families:["beam-framing-levels","beam-column-fin-plate"]},
  "beam:purlin":{group:"ПР",families:["purlin-connection","purlin-sag-rods"]},
  "beam:brace":{group:"СВ",families:["bracing-connection","gusset-plate"]},
  "beam:platform":{group:"ПЛ",families:["platform-deck","beam-framing-levels"]},
  "beam:truss":{group:"ПФ",families:["subtruss","truss-support"]},
  "beam:stair":{group:"ЛО",families:["stair-stringer"]},
  "beam:railing":{group:"ЛО",families:["railing"]},
  "beam:fahwerk":{group:"ФХ",families:["girt-wind-post"]},
  "beam:crane":{group:"ПК",families:["crane-girder-support"]},
  "joint:brace":{group:"СВ",families:["bracing-connection","gusset-plate"]},
  "joint:beam":{group:"СБ",families:["beam-splice-cover-plates","beam-splice-end-plate"]},
  "joint:column":{group:"СК",families:["column-splice","milled-ends"]},
  "joint:truss":{group:"ФС",families:["truss-chord-splice","truss-gusset-joint"]},
  "joint:crane":{group:"ПК",families:["crane-girder-support"]},
  "joint:purlin":{group:"ПР",families:["purlin-connection"]},
  "joint:platform":{group:"ПЛ",families:["platform-deck"]},
  "joint:stair":{group:"ЛО",families:["stair-stringer"]},
  "joint:railing":{group:"ЛО",families:["railing"]},
  "joint:fahwerk":{group:"ФХ",families:["girt-wind-post"]}
 };
 // The members that meet the node besides the column (side, top) or the support (beam): the kind with the most say.
 var RANK=["crane","truss","fahwerk","purlin","platform","stair","railing","beam","brace","column"];
 function leading(node){
  var ms=(node.members||[]).filter(function(m){
   if(node.kind==="side"||node.kind==="top"||node.kind==="base")return memberKind(m)!=="column";
   if(node.kind==="beam")return m.role!=="опора";
   return true
  }).map(memberKind);
  if(!ms.length)return node.kind==="joint"?"beam":"";
  ms.sort(function(a,b){return RANK.indexOf(a)-RANK.indexOf(b)});
  return ms[0]
 }
 function pick(node){
  node=node||{};
  var lead=leading(node),key=node.kind==="base"?"base":node.kind==="top"?(lead==="truss"?"top:truss":"top"):node.kind+":"+(lead||"beam");
  var rule=BY_KIND[key]||BY_KIND[node.kind]||null;if(!rule)return null;
  var list=rule.families.slice();
  // A base with four anchors and more is likely rigid; with fewer, pinned (the КМД decides).
  if(node.kind==="base"&&node.anchors>=4)list=["column-base-rigid","column-base-pinned","anchor-bolts"];
  // Bolts on high-strength bolts: the friction rules of the bolt field come along.
  var named=[];(node.named||[]).forEach(function(s){(s.joints||[]).forEach(function(j){if(j.group===rule.group&&named.indexOf(j)<0)named.push(j)})});
  named.forEach(function(j){var i=list.indexOf(j.family);if(i>0){list.splice(i,1)}if(i!==0)list.unshift(j.family)});
  // Braces meeting a node of beams or columns have their own joint there.
  if(rule.group!=="СВ"&&(node.members||[]).some(function(m){return memberKind(m)==="brace"})&&list.indexOf("bracing-connection")<0)list.splice(1,0,"bracing-connection");
  if(node.hsb&&list.indexOf("bolt-spacing-hsb")<0)list.push("bolt-spacing-hsb");
  if(node.bolted&&list.indexOf("bolt-placement-sp16")<0)list.push("bolt-placement-sp16");
  return{key:key,group:groups.get(rule.group)||{code:rule.group,name:rule.group},families:list.map(function(id){return families.get(id)}).filter(Boolean),named:named}
 }
 // The rows of the catalog nearest to the node: its group and family, the words of where it is (at a column, on a
 // beam, a base with two or four anchors…); the sheet's own match first.
 var WHERE={base:/баз/,top:/оголов|над колонн|сверху|на колонн/,side:/к (?:полке |стенке )?колонн|к стойк|на колонн/,
  beam:/балк\S* (?:\S+ )?(?:к|на) (?:главн|балк)|в одном уровне|этажн|сопряж/,joint:/стык|пересечени|крест|между/};
 function rowsFor(node,p,f){
  var list=joints.filter(function(j){return j.group===p.group.code&&j.family===f.id});if(!list.length)return[];
  var re=WHERE[node.kind],n=node.anchors,cnt=n>=8?"восемь":n>=6?"шесть":n>=4?"четыре":n>=2?"два":"";
  var score=function(j){var t=String(j.name||"").toLowerCase().replace(/ё/g,"е");return(re&&re.test(t)?2:0)+(cnt&&t.indexOf(cnt+" анкер")>=0?1:0)};
  var named=p.named.filter(function(x){return x.family===f.id}).map(function(x){return x.code});
  return list.slice().sort(function(a,b){return(named.indexOf(b.code)>=0)-(named.indexOf(a.code)>=0)||score(b)-score(a)||String(a.code).localeCompare(String(b.code))})
   .slice(0,2).map(function(j){return{code:j.code,name:j.name,method:METHOD[j.method]||j.method||"",behaviour:BEHAVIOUR[j.behaviour]||j.behaviour||""}})
 }
 function card(node){
  var p=pick(node);if(!p||!p.families.length)return null;
  var f=p.families[0],rows=rowsFor(node||{},p,f);
  return{rows:rows,
   group:p.group.code,group_name:p.group.name||"",
   family:f.id,name:f.name,method:rows[0]?rows[0].method:METHOD[f.kind]||f.kind||"",behaviour:rows[0]?rows[0].behaviour:BEHAVIOUR[f.behaviour]||f.behaviour||"",
   status:f.status,status_text:STATUS[f.status]||f.status||"",
   parts:(f.parts||[]).slice(0,6),drawing:f.drawing||"",placement:f.placement||"",rules:(f.rules||[]).slice(0,6),norms:(f.norms||[]).slice(0,4),
   note:f.note||"",sources:(f.sources||[]).slice(),count:count.get(f.id)||f.count||0,
   others:p.families.slice(1).map(function(o){return{id:o.id,name:o.name,status:o.status,status_text:STATUS[o.status]||o.status}}),
   named:p.named
  }
 }
 return{family:function(id){return families.get(id)||null},group:function(code){return groups.get(code)||null},
  joints:function(){return joints},match:match,sheetNodes:sheetNodes,pick:pick,card:card,memberKind:memberKind}
}
// The rows a page or an exported scheme needs: the families whole, the joints by code, name and how they work.
function slim(connections,jointsFile){
 var keep=["id","name","kind","joins","behaviour","parts","drawing","placement","rules","norms","status","sources","note"];
 var fam=(connections&&connections.records||connections||[]).map(function(r){var o={};keep.forEach(function(k){if(r[k]!=null)o[k]=r[k]});return o});
 var rec=jointsFile&&jointsFile.records||[],count={};rec.forEach(function(j){count[j.family]=(count[j.family]||0)+1});
 fam.forEach(function(f){if(count[f.id])f.count=count[f.id]});
 return{families:fam,groups:(jointsFile&&jointsFile.groups||[]).map(function(g){return{code:g.code,name:g.name,count:g.count}}),
  joints:rec.map(function(j){return{code:j.code,name:j.name,group:j.group,family:j.family,method:j.method,behaviour:j.behaviour}})}
}
var api={create:create,slim:slim,words:words,stem:stem,groupOfTitle:groupOfTitle,METHOD:METHOD,BEHAVIOUR:BEHAVIOUR,STATUS:STATUS};
// In Node the catalog of the program's own knowledge folder.
if(typeof module==="object"&&module.exports){
 api.load=function(dir){
  var fs=require("fs"),path=require("path");dir=dir||path.join(__dirname,"..","knowledge","global");
  var read=function(f){try{return JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"))}catch(_e){return null}};
  var j=read("joints.json"),c=read("connections.json");
  return create({families:c&&c.records||[],groups:j&&j.groups||[],joints:j&&j.records||[]})
 };
 module.exports=api
}
root.irJointCatalog=api;
})(typeof window!=="undefined"?window:globalThis);
