"use strict";
// Verified against the original 041-2025 KMD revision-1 drawings, sheets 45-50.
// This is a REAL-DRAWING regression for extracted evidence, not a claim that
// the six columns' 3D placements have been solved.
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const file=process.env.IR_KMD_TEST_REPORT||"041-2025-kmd-regression.json";
if(!fs.existsSync(file)){
 console.error("Run node scripts/test-041-2025-archive.js first");process.exit(2)
}
const report=JSON.parse(fs.readFileSync(file,"utf8"));
assert.equal(report.archiveSha256,
 "1603d8ba5bb865069a88db62cdd8db732b597a771106de5ea160887bb1f68bba");
assert.equal(report.metrics.files,62);
assert.equal(report.metrics.pages,252);
assert.equal(report.metrics.errors,0);
const filename="041-2025 КМД л. 45-50 (К62-К67) Изм.1.pdf";
const drawing=report.documents.find(x=>x.name===filename);
assert(drawing,"The six-column drawing must be in the archive");
assert.equal(drawing.sha256,
 "3dd8c1a533f248fc317f5ebbffa72dfb8c6779be0dfc9404066c0300244243cb");
assert.equal(drawing.pages.length,6);
for(let i=0;i<6;i++){
 const p=drawing.pages[i],mark="К"+(62+i);
 assert.equal(p.page,i+1);
 assert.equal(p.sheetMark,mark,"Each page must identify its own column");
 assert.equal(p.sheetTitleMatched,true,"The column must be named in the title block");
 assert.equal(p.sheetMarkMentions,2,"A title and a drawing label are not two physical columns");
 assert(p.elevationEvidence.includes("-0,400"));
 assert(p.elevationEvidence.includes("+9,595"));
 assert.equal(p.placementConfirmed,false);
}
assert.equal(report.metrics.recognition99Verified,false);
console.log("Real 041-2025 K62-K67 drawings: 6 titles, page hashes, elevation evidence PASS");
