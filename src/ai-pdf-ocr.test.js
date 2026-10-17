"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {localLanguages,recognizePng}=require("./ai-pdf-ocr");
test("OCR cannot run without local language packs",async()=>{
 assert.equal(localLanguages("https://example.com/models"),false);
 await assert.rejects(recognizePng({png:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(20)]),
  width:100,height:100,languageDir:"https://example.com/models"}),
  /Локальные языковые пакеты/)
});
test("OCR rejects invalid images before loading a worker",async()=>{
 await assert.rejects(recognizePng({png:Buffer.from("not a png"),width:1,height:1}),
  /PNG изображение/)
});
