"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),Module=require("node:module");
const {DatabaseSync}=require("node:sqlite");
const folder=fs.mkdtempSync(path.join(os.tmpdir(),"ir-project-data-safety-"));
const file=path.join(folder,"ir-project.db");
const originalLoad=Module._load;
Module._load=function(request,...rest){if(request==="electron")return{app:{getPath:()=>folder}};return originalLoad.call(this,request,...rest)};
const database=require("../src/database");
Module._load=originalLoad;
try{
 database.openDatabase();
 const saved=database.createObject({name:"Контрольный объект",customer:"Тест",address:"Тест",status:"В работе"});
 database.closeDatabase();
 database.openDatabase();
 assert.equal(database.getObject(saved.id).name,"Контрольный объект","valid database remains readable");
 database.closeDatabase();
 const external=new DatabaseSync(file);
 external.prepare("UPDATE app_meta SET value='999' WHERE key='schema_version'").run();
 external.close();
 const incompatible=fs.readFileSync(file);
 assert.throws(()=>database.openDatabase(),/Существующий файл сохранён/);
 assert.deepEqual(fs.readFileSync(file),incompatible,"incompatible database must never be deleted or overwritten");
 assert(fs.statSync(file).size>0);
 fs.writeFileSync(file,"not an SQLite database");
 const corrupt=fs.readFileSync(file);
 assert.throws(()=>database.openDatabase(),/Существующий файл сохранён/);
 assert.deepEqual(fs.readFileSync(file),corrupt,"corrupt database must never be deleted or overwritten");
 fs.rmSync(file);
 database.openDatabase();
 assert.deepEqual(database.listObjects(),[],"new installation still initializes an empty database");
 database.closeDatabase();
 console.log("Database protection: first-run, valid records, unknown schema and corrupt files OK");
}finally{
 try{database.closeDatabase()}catch{}
 fs.rmSync(folder,{recursive:true,force:true})
}
