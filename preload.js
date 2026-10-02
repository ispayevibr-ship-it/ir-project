"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("irProject",{
 objects:{list:()=>ipcRenderer.invoke("objects:list"),get:id=>ipcRenderer.invoke("objects:get",id),create:data=>ipcRenderer.invoke("objects:create",data),selectImage:()=>ipcRenderer.invoke("objects:select-image")},
 sections:{get:objectId=>ipcRenderer.invoke("sections:get",objectId),set:(objectId,key,enabled)=>ipcRenderer.invoke("sections:set",{objectId,key,enabled})},
 backup:{create:()=>ipcRenderer.invoke("backup:create"),restore:()=>ipcRenderer.invoke("backup:restore")},
 updater:{check:()=>ipcRenderer.invoke("update:check"),download:()=>ipcRenderer.invoke("update:download"),install:()=>ipcRenderer.invoke("update:install"),onStatus:callback=>ipcRenderer.on("update:status",(_event,data)=>callback(data))}
});
