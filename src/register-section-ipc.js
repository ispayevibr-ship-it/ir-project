"use strict";
module.exports=function registerSectionIpc(ipcMain,database){
  ipcMain.handle("sections:create",(_event,input)=>database.createSection(input.objectId,input.key,input.title,input.settings||{}));
};
