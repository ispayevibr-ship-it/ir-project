"use strict";
const {contextBridge,ipcRenderer}=require("electron");
const markCollator=new Intl.Collator("ru",{numeric:true,sensitivity:"base"});
const sortMarkRows=rows=>Array.isArray(rows)?[...rows].sort((a,b)=>markCollator.compare(String(a?.data?.mark??a?.title??a?.data?.title??""),String(b?.data?.mark??b?.title??b?.data?.title??""))):rows;
const section=(objectId,key)=>({list:()=>ipcRenderer.invoke("entity:list",{objectId,entity:key}).then(rows=>key==="marks"?sortMarkRows(rows):rows),get:id=>ipcRenderer.invoke("entity:get",{objectId,entity:key,id}),create:data=>ipcRenderer.invoke("entity:create",{objectId,entity:key,data}),update:(id,data)=>ipcRenderer.invoke("entity:update",{objectId,entity:key,id,data}),remove:id=>ipcRenderer.invoke("entity:delete",{objectId,entity:key,id})});
const objects={list:()=>ipcRenderer.invoke("objects:list"),get:id=>ipcRenderer.invoke("objects:get",id),create:data=>ipcRenderer.invoke("objects:create",data),update:(id,data)=>ipcRenderer.invoke("objects:update",{id,data}),remove:id=>ipcRenderer.invoke("objects:delete",id),selectImage:type=>ipcRenderer.invoke("objects:select-image",type)};
const sections={get:id=>ipcRenderer.invoke("sections:get",id),set:(objectId,key,enabled)=>ipcRenderer.invoke("sections:set",{objectId,key,enabled}),create:(objectId,key,title,settings={})=>ipcRenderer.invoke("sections:create",{objectId,key,title,settings})};
const company={get:()=>ipcRenderer.invoke("company:get"),save:data=>ipcRenderer.invoke("company:save",data),selectLogo:()=>ipcRenderer.invoke("company:select-logo")};
const reportPhotos={selectImage:()=>ipcRenderer.invoke("report:select-photo"),remove:file=>ipcRenderer.invoke("report:remove-photo",file)};
const reportDocuments={selectAct:()=>ipcRenderer.invoke("report:select-act"),open:file=>ipcRenderer.invoke("report:open-document",file),remove:file=>ipcRenderer.invoke("report:remove-document",file)};
const reportExport={html:(html,defaultName)=>ipcRenderer.invoke("report:export-html",{html,defaultName}),pdf:defaultName=>ipcRenderer.invoke("report:export-pdf",{defaultName}),print:()=>ipcRenderer.invoke("report:print")};
const marksExcel={select:()=>ipcRenderer.invoke("marks:select-excel"),saveExample:()=>ipcRenderer.invoke("marks:save-example")};
const aiDocuments={
 list:objectId=>ipcRenderer.invoke("ai-documents:list",objectId),
 select:(objectId,kind)=>ipcRenderer.invoke("ai-documents:select",{objectId,kind}),
 open:(objectId,id)=>ipcRenderer.invoke("ai-documents:open",{objectId,id}),
 impact:(objectId,id)=>ipcRenderer.invoke("ai-documents:impact",{objectId,id}),
 archive:(objectId,id)=>ipcRenderer.invoke("ai-documents:archive",{objectId,id}),
 restore:(objectId,id)=>ipcRenderer.invoke("ai-documents:restore",{objectId,id}),
 remove:(objectId,id,opts={})=>ipcRenderer.invoke("ai-documents:remove",{
  objectId,id,discardUnreviewed:opts.discardUnreviewed===true,
  expectedAnalysisIds:Array.isArray(opts.expectedAnalysisIds)?opts.expectedAnalysisIds:[]
 })
};
const aiPdf={
 list:objectId=>ipcRenderer.invoke("ai-pdf:list",objectId),
 index:(objectId,id)=>ipcRenderer.invoke("ai-pdf:index",{objectId,id}),
 page:(objectId,indexId,page)=>ipcRenderer.invoke("ai-pdf:page",{objectId,indexId,page}),
 preview:(objectId,id,page)=>ipcRenderer.invoke("ai-pdf:preview",{objectId,id,page}),
 regionPreview:(objectId,id,page,region)=>ipcRenderer.invoke("ai-pdf:region-preview",{objectId,id,page,region}),
 regionAnalyze:(objectId,id,page,region)=>ipcRenderer.invoke("ai-pdf:region-analyze",{objectId,id,page,region}),
 analyze:(objectId,id,page)=>ipcRenderer.invoke("ai-pdf:analyze",{objectId,id,page}),
 onProgress:callback=>{
  const listener=(_event,data)=>{if(typeof callback==="function")callback(data)};
  ipcRenderer.on("ai-pdf:progress",listener);
  return()=>ipcRenderer.removeListener("ai-pdf:progress",listener)
 }
};
const aiDiagnostics={
 hardware:()=>ipcRenderer.invoke("ai-diagnostics:hardware"),
 status:()=>ipcRenderer.invoke("ai-diagnostics:status"),
 start:()=>ipcRenderer.invoke("ai-diagnostics:start"),
 stop:()=>ipcRenderer.invoke("ai-diagnostics:stop"),
 smokeTest:()=>ipcRenderer.invoke("ai-diagnostics:smoke-test")
};
const aiModels={
 openFolder:()=>ipcRenderer.invoke("ai-models:open-folder"),
 importManualQwen:()=>ipcRenderer.invoke("ai-models:import-manual-qwen"),
 info:()=>ipcRenderer.invoke("ai-models:info"),
 preflight:()=>ipcRenderer.invoke("ai-models:preflight"),
 checkUpdates:()=>ipcRenderer.invoke("ai-models:check-updates"),
 authorize:password=>ipcRenderer.invoke("ai-models:authorize",password),
 select:()=>ipcRenderer.invoke("ai-models:select"),
 install:token=>ipcRenderer.invoke("ai-models:install",token),
 rollback:id=>ipcRenderer.invoke("ai-models:rollback",id),
 download:(modelId,version)=>ipcRenderer.invoke("ai-models:download",{modelId,version}),
 downloadAndInstall:(modelId,version)=>ipcRenderer.invoke("ai-models:download-install",{modelId,version}),
 cancel:()=>ipcRenderer.invoke("ai-models:cancel"),
 verifyRuntime:()=>ipcRenderer.invoke("ai-models:verify-runtime"),
 onProgress:callback=>{
  const listener=(_event,data)=>{if(typeof callback==="function")callback(data)};
  ipcRenderer.on("ai-models:progress",listener);
  return()=>ipcRenderer.removeListener("ai-models:progress",listener)
 }
};
const aiAssemblyAttachments={
 list:(objectId,assemblyId)=>ipcRenderer.invoke("ai-attachment:list",{objectId,assemblyId}),
 summary:(objectId,assemblyId)=>ipcRenderer.invoke("ai-attachment:summary",{objectId,assemblyId}),
 history:(objectId,id)=>ipcRenderer.invoke("ai-attachment:history",{objectId,id}),
 save:(objectId,id,entry)=>ipcRenderer.invoke("ai-attachment:save",{objectId,id,entry})
};
const aiAssembly3d={
 list:(objectId,assemblyId)=>ipcRenderer.invoke("ai-assembly:list",{objectId,assemblyId}),
 summary:(objectId,assemblyId)=>ipcRenderer.invoke("ai-assembly:summary",{objectId,assemblyId}),
 history:(objectId,id)=>ipcRenderer.invoke("ai-assembly:history",{objectId,id}),
 save:(objectId,id,entry)=>ipcRenderer.invoke("ai-assembly:save",{objectId,id,entry})
};
const aiKmKmdCompare={
 list:objectId=>ipcRenderer.invoke("ai-compare:list",objectId),
 summary:objectId=>ipcRenderer.invoke("ai-compare:summary",objectId),
 fields:()=>ipcRenderer.invoke("ai-compare:fields"),
 history:(objectId,id)=>ipcRenderer.invoke("ai-compare:history",{objectId,id}),
 save:(objectId,id,entry)=>ipcRenderer.invoke("ai-compare:save",{objectId,id,entry})
};
const aiKmdConnections={
 nodes:objectId=>ipcRenderer.invoke("ai-connections:nodes",objectId),
 items:objectId=>ipcRenderer.invoke("ai-connections:items",objectId),
 summary:objectId=>ipcRenderer.invoke("ai-connections:summary",objectId),
 history:(objectId,type,id)=>ipcRenderer.invoke("ai-connections:history",{objectId,type,id}),
 saveNode:(objectId,id,entry)=>ipcRenderer.invoke("ai-connections:save-node",{objectId,id,entry}),
 saveItem:(objectId,id,entry)=>ipcRenderer.invoke("ai-connections:save-item",{objectId,id,entry})
};
const aiKmdMaterials={
 list:objectId=>ipcRenderer.invoke("ai-materials:list",objectId),
 summary:objectId=>ipcRenderer.invoke("ai-materials:summary",objectId),
 history:(objectId,id)=>ipcRenderer.invoke("ai-materials:history",{objectId,id}),
 save:(objectId,id,entry)=>ipcRenderer.invoke("ai-materials:save",{objectId,id,entry})
};
const aiMarkQuantities={
 list:objectId=>ipcRenderer.invoke("ai-quantities:list",objectId),
 summary:objectId=>ipcRenderer.invoke("ai-quantities:summary",objectId),
 history:(objectId,id)=>ipcRenderer.invoke("ai-quantities:history",{objectId,id}),
 save:(objectId,id,entry)=>ipcRenderer.invoke("ai-quantities:save",{objectId,id,entry})
};
const aiIntegrity={
 report:objectId=>ipcRenderer.invoke("ai-integrity:report",objectId)
};
const aiKmdReference={
 snapshot:objectId=>ipcRenderer.invoke("ai-kmd-reference:snapshot",objectId),
 list:objectId=>ipcRenderer.invoke("ai-kmd-reference:list",objectId),
 checks:objectId=>ipcRenderer.invoke("ai-kmd-reference:checks",objectId),
 compare:objectId=>ipcRenderer.invoke("ai-kmd-reference:compare",objectId),
 history:(objectId,id)=>ipcRenderer.invoke("ai-kmd-reference:history",{objectId,id}),
 save:(objectId,id,entry)=>ipcRenderer.invoke("ai-kmd-reference:save",{objectId,id,entry}),
 seal:(objectId,sheetId,expectedRevision,confirmation)=>
  ipcRenderer.invoke("ai-kmd-reference:seal",{objectId,sheetId,expectedRevision,confirmation})
};
const aiRevisions={
 list:objectId=>ipcRenderer.invoke("ai-revisions:list",objectId),
 impact:objectId=>ipcRenderer.invoke("ai-revisions:impact",objectId),
 preview:(objectId,setId)=>ipcRenderer.invoke("ai-revisions:preview",{objectId,setId}),
 history:(objectId,setId)=>ipcRenderer.invoke("ai-revisions:history",{objectId,setId}),
 create:(objectId,entry)=>ipcRenderer.invoke("ai-revisions:create",{objectId,entry}),
 addSheets:(objectId,setId,entries)=>ipcRenderer.invoke("ai-revisions:add-sheets",{objectId,setId,entries}),
 removeSheet:(objectId,setId,sheetId)=>ipcRenderer.invoke("ai-revisions:remove-sheet",{objectId,setId,sheetId}),
 activate:(objectId,setId,expectedRevision)=>ipcRenderer.invoke("ai-revisions:activate",{objectId,setId,expectedRevision})
};
const aiProposals={
 list:objectId=>ipcRenderer.invoke("ai-proposals:list",objectId),
 summary:objectId=>ipcRenderer.invoke("ai-proposals:summary",objectId),
 history:(objectId,analysisId,index)=>ipcRenderer.invoke("ai-proposals:history",{objectId,analysisId,index}),
 save:(objectId,analysisId,index,entry)=>ipcRenderer.invoke("ai-proposals:save",{objectId,analysisId,index,entry})
};
const aiWorkflow={
 list:objectId=>ipcRenderer.invoke("ai-workflow:list",objectId),
 summary:objectId=>ipcRenderer.invoke("ai-workflow:summary",objectId),
 history:(objectId,id)=>ipcRenderer.invoke("ai-workflow:history",{objectId,id}),
 enqueue:(objectId,documentId,pages)=>ipcRenderer.invoke("ai-workflow:enqueue",{objectId,documentId,pages}),
 start:objectId=>ipcRenderer.invoke("ai-workflow:start",objectId),
 pause:objectId=>ipcRenderer.invoke("ai-workflow:pause",objectId),
 retry:(objectId,id)=>ipcRenderer.invoke("ai-workflow:retry",{objectId,id}),
 cancel:(objectId,id)=>ipcRenderer.invoke("ai-workflow:cancel",{objectId,id}),
 onProgress:callback=>{
  const fn=(_event,data)=>{if(typeof callback==="function")callback(data)};
  ipcRenderer.on("ai-workflow:progress",fn);
  return()=>ipcRenderer.removeListener("ai-workflow:progress",fn)
 }
};
const schemeReset={preview:objectId=>ipcRenderer.invoke("scheme:reset-preview",objectId),
 clear:(objectId,options)=>ipcRenderer.invoke("scheme:reset",{objectId,...options})};
const aiReview={
 session:role=>ipcRenderer.invoke("ai-review:session",role),
 list:objectId=>ipcRenderer.invoke("ai-review:list",objectId),
 register:objectId=>ipcRenderer.invoke("ai-review:register",objectId),
 history:(objectId,id)=>ipcRenderer.invoke("ai-review:history",{objectId,id}),
 authorize:(role,password)=>ipcRenderer.invoke("ai-review:authorize",{role,password}),
 save:(objectId,id,review)=>ipcRenderer.invoke("ai-review:save",{objectId,id,review})
};
const aiEngine={
 status:()=>ipcRenderer.invoke("ai-engine:status"),
 start:()=>ipcRenderer.invoke("ai-engine:start"),
 stop:()=>ipcRenderer.invoke("ai-engine:stop"),
 cancel:()=>ipcRenderer.invoke("ai-engine:cancel"),
 results:objectId=>ipcRenderer.invoke("ai-analysis:list",objectId),
 analyze:(objectId,id)=>ipcRenderer.invoke("ai-analysis:image",{objectId,id})
};
contextBridge.exposeInMainWorld("irProject",{objects,company,images:{read:file=>ipcRenderer.invoke("images:read",file),remove:file=>ipcRenderer.invoke("images:remove",file),optimize:(file,type)=>ipcRenderer.invoke("images:optimize",{file,type})},reportPhotos,reportDocuments,reportExport,marksExcel,schemeReset,aiDocuments,aiEngine,aiPdf,aiModels,aiDiagnostics,aiReview,aiWorkflow,aiProposals,aiRevisions,aiIntegrity,aiKmdReference,aiMarkQuantities,aiKmdMaterials,aiKmdConnections,aiKmKmdCompare,aiAssembly3d,aiAssemblyAttachments,sections,data:{objects,sections,forObject:objectId=>({section:key=>section(objectId,key),records:key=>section(objectId,key)})},access:{login:(role,password)=>ipcRenderer.invoke("access:login",{role,password}),
 logout:()=>ipcRenderer.invoke("access:logout")},backup:{create:()=>ipcRenderer.invoke("backup:create"),restore:()=>ipcRenderer.invoke("backup:restore")},updater:{check:()=>ipcRenderer.invoke("update:check"),download:()=>ipcRenderer.invoke("update:download"),rollback:()=>ipcRenderer.invoke("update:rollback"),install:()=>ipcRenderer.invoke("update:install"),version:()=>ipcRenderer.invoke("update:version"),onStatus:cb=>ipcRenderer.on("update:status",(_e,d)=>cb(d))}});