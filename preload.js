"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("irProject",{
 objects:{list:()=>ipcRenderer.invoke("objects:list"),get:id=>ipcRenderer.invoke("objects:get",id),create:data=>ipcRenderer.invoke("objects:create",data),update:(id,data)=>ipcRenderer.invoke("objects:update",{id,data}),remove:id=>ipcRenderer.invoke("objects:delete",id),selectImage:()=>ipcRenderer.invoke("objects:select-image")},
 sections:{get:objectId=>ipcRenderer.invoke("sections:get",objectId),set:(objectId,key,enabled)=>ipcRenderer.invoke("sections:set",{objectId,key,enabled})},
 data:{objects:{list:()=>ipcRenderer.invoke("objects:list"),get:id=>ipcRenderer.invoke("objects:get",id),create:data=>ipcRenderer.invoke("objects:create",data),update:(id,data)=>ipcRenderer.invoke("objects:update",{id,data}),remove:id=>ipcRenderer.invoke("objects:delete",id)},sections:{get:objectId=>ipcRenderer.invoke("sections:get",objectId),set:(objectId,key,enabled)=>ipcRenderer.invoke("sections:set",{objectId,key,enabled})}},
 access:{login:(role,password)=>ipcRenderer.invoke("access:login",{role,password})},
 backup:{create:()=>ipcRenderer.invoke("backup:create"),restore:()=>ipcRenderer.invoke("backup:restore")},
 updater:{check:()=>ipcRenderer.invoke("update:check"),download:()=>ipcRenderer.invoke("update:download"),install:()=>ipcRenderer.invoke("update:install"),version:()=>ipcRenderer.invoke("update:version"),onStatus:callback=>ipcRenderer.on("update:status",(_event,data)=>callback(data))}
});
