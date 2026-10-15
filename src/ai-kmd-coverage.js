"use strict";
/* Read-only evidence coverage. Never certifies that a complete KMD drawing set was
   recognized; no automatic insertion into production or engineering ledgers. */
const norm=value=>String(value??"").trim().replace(/\s+/g," ").toLocaleUpperCase("ru-RU");
const identity=value=>[value.mark,value.cipher,value.secondaryCipher].map(norm).join("\u0001");
function createAiCoverage({database,quantities,materials,connections,assemblies,attachments,
 proposals,clock=()=>new Date().toISOString()}={}){
 if(![database,quantities,materials,connections,assemblies,attachments,proposals].every(Boolean))
  throw Error("Для контроля полноты нужны действующие модули КМД и 3D");
 const checkedInteger=x=>Number.isSafeInteger(x)&&x>=0?x:null;
 const sample=(items,format)=>items.slice(0,12).map(format);
 function report(id){
  const objectId=Number(id);
  if(!Number.isSafeInteger(objectId)||objectId<=0||!database.getObject(objectId))
   throw Error("Объект IR Project не найден");
  const marks=quantities.list(objectId),parts=materials.list(objectId),
   nodes=connections.listNodes(objectId),items=connections.listComponents(objectId),
   claims=proposals.list(objectId).filter(x=>x.approved&&x.sourceValid);
  const messages=[],byMark=new Map();
  const add=(severity,code,title,tab,examples)=>{
   if(examples.length)messages.push({severity,code,title,tab,count:examples.length,
    examples:sample(examples,x=>x)})
  };
  const known=new Map(),sameName=new Map();
  for(const row of marks.filter(x=>x.status!=="rejected")){
   const key=identity(row);
   if(!known.has(key))known.set(key,[]);
   known.get(key).push(row);
   const label=norm(row.mark);
   if(!sameName.has(label))sameName.set(label,[]);
   sameName.get(label).push(row)
  }
  const compatibleClaim=p=>{
   const v=p.values||{},label=norm(v.mark);
   if(!label)return[];
   // When a cipher is specified, never match an identically named mark under a
   // different cipher. Without a cipher the name must be unambiguous.
   const exact=(v.cipher||v.secondaryCipher)?
    (known.get(identity(v))||[]):(sameName.get(label)||[]);
   return exact.length===1?exact:[]
  };
  const conflictingMarkKeys=new Set(),duplicateMarkRows=[];
  for(const [key,rows] of known){
   if(rows.length>1&&rows.some(x=>x.status==="confirmed"&&x.sourceValid)){
    conflictingMarkKeys.add(key);
    duplicateMarkRows.push(...rows.map(x=>x.mark+" / "+x.cipher+" · ID "+x.id))
   }
  }
  add("error","kmd_duplicate_mark_identity","Конфликт подтверждённых марок и шифров",
   "marks",duplicateMarkRows);
  const qtyMissing=[],qtyMismatch=[],partMissing=[],partMismatch=[],jointMissing=[],itemMissing=[],
   ambiguous=[],duplicateEvidence=[];
  const seenEvidence=new Set();
  for(const p of claims){
   if(!["mark_quantity","steel_part","connection"].includes(p.type))continue;
   const v=p.values||{},match=compatibleClaim(p);
   const evidenceKey=[p.type,identity(v),v.position,v.jointCode,v.fastenerKind].map(norm).join("\u0001");
   if(seenEvidence.has(evidenceKey)){duplicateEvidence.push(p);continue}
   seenEvidence.add(evidenceKey);
   if(!match.length){
    const similar=sameName.get(norm(v.mark))||[];
    if(similar.length>1)ambiguous.push(p);
    else if(p.type==="mark_quantity")qtyMissing.push(p);
    else if(p.type==="steel_part")partMissing.push(p);
    else jointMissing.push(p);
    continue
   }
   const mark=match[0],tag=mark.mark+" / "+mark.cipher;
   if(p.type==="mark_quantity"){
    if(mark.status!=="confirmed"||!mark.sourceValid)qtyMissing.push(p);
    else if(checkedInteger(mark.quantity)!==checkedInteger(v.quantity))
     qtyMismatch.push(tag+": проверено "+v.quantity+", в ведомости "+mark.quantity);
   }else if(p.type==="steel_part"){
    const hits=parts.filter(x=>x.assemblyId===mark.id&&norm(x.position)===norm(v.position));
    if(!hits.some(x=>x.status==="confirmed"&&x.counted))partMissing.push(p);
    else if(Number.isSafeInteger(v.partCount)&&
     hits.some(x=>x.counted&&x.partCount!==v.partCount))
     partMismatch.push(tag+" / "+v.position+": предложение "+v.partCount+
      ", подтверждено "+hits.find(x=>x.counted).partCount);
   }else{
    const joint=nodes.find(x=>x.assemblyId===mark.id&&
     norm(x.jointCode)===norm(v.jointCode)&&x.counted);
    if(!joint){jointMissing.push(p);continue}
    if(v.fastenerKind){
     const matches=items.filter(x=>x.jointId===joint.id&&x.counted&&
      norm(x.kind)===norm(v.fastenerKind)&&(!v.position||norm(x.position)===norm(v.position)));
     if(!matches.length)itemMissing.push(p)
    }
   }
  }
  const claimTag=p=>String(p.values?.mark||"Без марки")+" · "+
   String(p.values?.position||p.values?.jointCode||p.values?.specPosition||"позиция не указана")+
   " · анализ № "+p.analysisId;
  add("warning","kmd_confirmed_marks_not_transferred","Проверенные количества не внесены в ведомость",
   "marks",qtyMissing.map(claimTag));
  add("error","kmd_quantity_conflicts","Различается подтверждённое количество марки",
   "marks",qtyMismatch);
  add("warning","kmd_confirmed_parts_not_transferred","Проверенные предложения деталей не отражены в ведомости",
   "metal",partMissing.map(claimTag));
  add("error","kmd_detail_count_conflicts","Различается число деталей на одну марку",
   "metal",partMismatch);
  add("warning","kmd_confirmed_joints_not_transferred","Проверенные узлы не внесены в ведомость",
   "fasteners",jointMissing.map(claimTag));
  add("warning","kmd_confirmed_items_not_transferred","Проверенные компоненты узла не внесены в ведомость",
   "fasteners",itemMissing.map(claimTag));
  add("warning","kmd_ambiguous_ciphers","Невозможно однозначно сопоставить марку и шифр",
   "proposals",ambiguous.map(claimTag));
  add("warning","kmd_duplicate_reviewed_evidence","Повторно проверенные предложения одной позиции",
   "proposals",duplicateEvidence.map(claimTag));
  // Even damaged SQLite imports must never inflate the coverage totals.
  const collisionAssemblies=new Set(),duplicatePhysical=[];
  const physicalKeys=new Map();
  for(const part of parts.filter(x=>x.counted)){
   const k="detail:"+part.assemblyId+":"+norm(part.position);
   if(physicalKeys.has(k)){
    collisionAssemblies.add(part.assemblyId);
    duplicatePhysical.push("Деталь "+part.assemblyMark+" / "+part.position)
   }else physicalKeys.set(k,part)
  }
  for(const node of nodes.filter(x=>x.counted)){
   const k="joint:"+node.scope+":"+
    (node.scope==="erection"?"объект":node.assemblyId)+":"+norm(node.jointCode);
   if(physicalKeys.has(k)){
    collisionAssemblies.add(node.assemblyId);
    collisionAssemblies.add(physicalKeys.get(k).assemblyId);
    duplicatePhysical.push("Узел "+node.jointCode+" / "+node.scope)
   }else physicalKeys.set(k,node)
  }
  for(const item of items.filter(x=>x.counted)){
   const k="item:"+item.jointId+":"+item.category+":"+norm(item.position);
   if(physicalKeys.has(k)){
    collisionAssemblies.add(item.assemblyId);
    duplicatePhysical.push("Соединение "+item.jointId+" / "+item.position)
   }else physicalKeys.set(k,item)
  }
  add("error","kmd_duplicate_physical_positions","Повторные подтверждённые детали или соединения",
   "integrity",duplicatePhysical);
  const noDetails=[],partial3d=[],invalid3d=[],unlinkedHardware=[];
  let declaredCopies=0,declaredPartUnitsPerCopies=0,modeledUnits=0,expectedModelUnits=0,
   confirmedFactoryJoints=0,confirmedErectionJoints=0,fastenerPieces=0,weldLengthM=0;
  for(const mark of marks.filter(x=>x.status==="confirmed"&&x.sourceValid)){
   if(conflictingMarkKeys.has(identity(mark))||collisionAssemblies.has(mark.id))continue;
   const pieces=checkedInteger(mark.quantity);
   if(pieces===null||pieces<=0)continue;
   declaredCopies+=pieces;
   const relevant=parts.filter(x=>x.assemblyId===mark.id&&x.status!=="rejected");
   const confirmed=relevant.filter(x=>x.status==="confirmed"&&x.counted);
   const validParts=confirmed.filter(x=>checkedInteger(x.partCount)!==null&&x.partCount>0);
   const declaredUnitParts=validParts.reduce((sum,x)=>sum+x.partCount,0);
   const projectPartUnits=declaredUnitParts*pieces;
   if(!Number.isSafeInteger(projectPartUnits))throw Error("Превышен допустимый предел числа деталей");
   declaredPartUnitsPerCopies+=projectPartUnits;
   if(!relevant.length)noDetails.push(mark.mark+" / "+mark.cipher);
   const partIds=new Set(validParts.map(x=>x.id));
   const rawPlacements=database.listEntity(objectId,"ai-assembly-placement")
    .filter(x=>x.record_type==="part_placement"&&Number(x.data?.assemblyId)===mark.id);
   const activeIndices=new Set(),collisions=[];
   let placed=[];
   if(rawPlacements.length){
    try{placed=assemblies.list(objectId,mark.id)}
    catch(error){invalid3d.push(mark.mark+": "+String(error?.message||error));continue}
   }
   for(const p of placed.filter(x=>x.status==="confirmed")){
    const key=p.partId+":"+p.instanceIndex;
    if(!partIds.has(p.partId)||!p.counted){invalid3d.push(mark.mark+" / "+p.partPosition+" № "+p.instanceIndex);continue}
    if(activeIndices.has(key)){collisions.push(p);continue}
    activeIndices.add(key)
   }
   if(collisions.length)invalid3d.push(mark.mark+": повторное размещение "+collisions.length+" экз.");
   // 3D is one standard mark assembly; don't multiply modeled geometry by
   // the number of identical shipped marks.
   const modeled=activeIndices.size;
   modeledUnits+=modeled;
   expectedModelUnits+=declaredUnitParts;
   if(rawPlacements.length&&modeled<declaredUnitParts)
    partial3d.push(mark.mark+" / "+mark.cipher+": "+modeled+" из "+
     declaredUnitParts+" деталей на одну марку");
   const relevantNodes=nodes.filter(x=>x.assemblyId===mark.id&&x.counted);
   const relevantItems=items.filter(x=>x.assemblyId===mark.id&&x.counted);
   confirmedFactoryJoints+=relevantNodes.filter(x=>x.scope==="fabrication")
    .reduce((s,x)=>s+(x.instances||0),0);
   confirmedErectionJoints+=relevantNodes.filter(x=>x.scope==="erection")
    .reduce((s,x)=>s+(x.instances||0),0);
   fastenerPieces+=relevantItems.filter(x=>x.category==="fastener")
    .reduce((s,x)=>s+(x.totalPieces||0),0);
   weldLengthM+=relevantItems.filter(x=>x.category==="weld")
    .reduce((s,x)=>s+(x.totalLengthM||0),0);
   let annotations=0;
   if(database.listEntity(objectId,"ai-assembly-attachments")
    .some(x=>x.record_type==="assembly_attachment"&&Number(x.data?.assemblyId)===mark.id)){
    try{annotations=attachments.list(objectId,mark.id).filter(x=>x.visible).length}
    catch(error){invalid3d.push(mark.mark+": "+String(error?.message||error))}
   }
   byMark.set(mark.id,{
    id:mark.id,mark:mark.mark,cipher:mark.cipher,secondaryCipher:mark.secondaryCipher,
    copies:pieces,confirmedDetailPositions:confirmed.length,
    pendingDetailPositions:relevant.filter(x=>x.status!=="confirmed"||
     !x.counted).length,detailUnitsPerMark:declaredUnitParts,
    declaredDetailUnitsInProject:projectPartUnits,modeledUnitsPerMark:modeled,
    pendingModelUnits:Math.max(0,declaredUnitParts-modeled),
    modelStarted:rawPlacements.length>0,confirmedJointPositions:relevantNodes.length,
    factoryJointInstances:relevantNodes.filter(x=>x.scope==="fabrication")
     .reduce((s,x)=>s+(x.instances||0),0),
    erectionJointInstances:relevantNodes.filter(x=>x.scope==="erection")
     .reduce((s,x)=>s+(x.instances||0),0),
    fastenerPieces:relevantItems.filter(x=>x.category==="fastener")
     .reduce((s,x)=>s+(x.totalPieces||0),0),
    weldLengthM:relevantItems.filter(x=>x.category==="weld")
     .reduce((s,x)=>s+(x.totalLengthM||0),0),
    confirmed3dAnnotations:annotations,fullSpecificationVerified:false
   })
  }
  add("warning","kmd_marks_without_details","В подтверждённой марке нет ведомости деталей",
   "metal",noDetails);
  add("warning","kmd_partial_3d_placement","Начатая 3D-сборка содержит не все подтверждённые детали",
   "assembly",partial3d);
  add("error","kmd_invalid_3d_placement","Недействительные или повторные 3D-размещения",
   "assembly",invalid3d);
  for(const row of items.filter(x=>x.status==="confirmed"&&!x.counted))
   if(!nodes.some(n=>n.id===row.jointId&&n.counted))
    unlinkedHardware.push("№ "+row.id+" / "+row.position+" → узел "+row.jointId);
  add("error","kmd_unlinked_hardware","Компоненты соединений без действующего узла",
   "fasteners",unlinkedHardware);
  if(![declaredCopies,declaredPartUnitsPerCopies,modeledUnits,expectedModelUnits,
   confirmedFactoryJoints,confirmedErectionJoints,fastenerPieces].every(Number.isSafeInteger)||
   !Number.isFinite(weldLengthM))
   throw Error("Количество по КМД выходит за безопасные пределы");
  const ambiguousTotals=conflictingMarkKeys.size>0||collisionAssemblies.size>0;
  return{objectId,generatedAt:clock(),fullSpecificationVerified:false,
   ambiguousTotals,scope:"Только подтверждённые и зарегистрированные позиции; не проверка полного состава исходного КМД",
   metrics:{confirmedMarkCopies:ambiguousTotals?null:declaredCopies,
    registeredDetailUnitsInProject:ambiguousTotals?null:declaredPartUnitsPerCopies,
    expectedModelUnitsPerUniqueMarks:ambiguousTotals?null:expectedModelUnits,
    modeledUnitsPerUniqueMarks:ambiguousTotals?null:modeledUnits,
    factoryJointInstances:ambiguousTotals?null:confirmedFactoryJoints,
    erectionJointInstances:ambiguousTotals?null:confirmedErectionJoints,
    registeredFastenerPieces:ambiguousTotals?null:fastenerPieces,
    registeredWeldLengthM:ambiguousTotals?null:Math.round(weldLengthM*1000)/1000,
    reviewedCandidates:claims.length,markRows:byMark.size},
   marks:[...byMark.values()].sort((a,b)=>new Intl.Collator("ru",{numeric:true}).compare(a.mark,b.mark)),
   issues:messages,complete:false}
 }
 return{report}
}
module.exports={createAiCoverage};
