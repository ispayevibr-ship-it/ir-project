"use strict";
const {app}=require("electron");
const path=require("path"),fs=require("fs");
function file(){return path.join(app.getPath("userData"),"company-profile.json")}
function get(){try{return {...{name:"",logo:""},...JSON.parse(fs.readFileSync(file(),"utf8"))}}catch{return {name:"",logo:""}}}
function save(data={}){const value={name:String(data.name||"").trim(),logo:String(data.logo||"")};fs.writeFileSync(file(),JSON.stringify(value,null,2),"utf8");return value}
module.exports={get,save};
