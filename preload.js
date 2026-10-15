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
 remove:(objectId,id)=>ipcRenderer.invoke("ai-documents:remove",{objectId,id})
};
const aiPdf={
 list:objectId=>ipcRenderer.invoke("ai-pdf:list",objectId),
 index:(objectId,id)=>ipcRenderer.invoke("ai-pdf:index",{objectId,id}),
 page:(objectId,indexId,page)=>ipcRenderer.invoke("ai-pdf:page",{objectId,indexId,page}),
 preview:(objectId,id,page)=>ipcRenderer.invoke("ai-pdf:preview",{objectId,id,page}),
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
 info:()=>ipcRenderer.invoke("ai-models:info"),
 checkUpdates:()=>ipcRenderer.invoke("ai-models:check-updates"),
 authorize:password=>ipcRenderer.invoke("ai-models:authorize",password),
 select:()=>ipcRenderer.invoke("ai-models:select"),
 install:token=>ipcRenderer.invoke("ai-models:install",token),
 rollback:id=>ipcRenderer.invoke("ai-models:rollback",id),
 download:(modelId,version)=>ipcRenderer.invoke("ai-models:download",{modelId,version}),
 cancel:()=>ipcRenderer.invoke("ai-models:cancel"),
 verifyRuntime:()=>ipcRenderer.invoke("ai-models:verify-runtime"),
 onProgress:callback=>{
  const listener=(_event,data)=>{if(typeof callback==="function")callback(data)};
  ipcRenderer.on("ai-models:progress",listener);
  return()=>ipcRenderer.removeListener("ai-models:progress",listener)
 }
};
const aiEngine={
 status:()=>ipcRenderer.invoke("ai-engine:status"),
 start:()=>ipcRenderer.invoke("ai-engine:start"),
 stop:()=>ipcRenderer.invoke("ai-engine:stop"),
 cancel:()=>ipcRenderer.invoke("ai-engine:cancel"),
 results:objectId=>ipcRenderer.invoke("ai-analysis:list",objectId),
 analyze:(objectId,id)=>ipcRenderer.invoke("ai-analysis:image",{objectId,id})
};
contextBridge.exposeInMainWorld("irProject",{objects,company,images:{read:file=>ipcRenderer.invoke("images:read",file),remove:file=>ipcRenderer.invoke("images:remove",file),optimize:(file,type)=>ipcRenderer.invoke("images:optimize",{file,type})},reportPhotos,reportDocuments,reportExport,marksExcel,aiDocuments,aiEngine,aiPdf,aiModels,aiDiagnostics,sections,data:{objects,sections,forObject:objectId=>({section:key=>section(objectId,key),records:key=>section(objectId,key)})},access:{login:(role,password)=>ipcRenderer.invoke("access:login",{role,password})},backup:{create:()=>ipcRenderer.invoke("backup:create"),restore:()=>ipcRenderer.invoke("backup:restore")},updater:{check:()=>ipcRenderer.invoke("update:check"),download:()=>ipcRenderer.invoke("update:download"),install:()=>ipcRenderer.invoke("update:install"),version:()=>ipcRenderer.invoke("update:version"),onStatus:cb=>ipcRenderer.on("update:status",(_e,d)=>cb(d))}});