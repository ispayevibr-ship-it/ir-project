'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {intersections,intersectionEvidence}=require('./ai-pdf-intersection-evidence');
test('finds crossings between vector line segments',()=>{
 const p=intersections([{x1:0,y1:10,x2:20,y2:10},{x1:10,y1:0,x2:10,y2:20}]);
 assert.equal(p.length,1);assert.equal(p[0].x,10);assert.equal(p[0].y,10);
});
test('converts PDF text Y into viewport Y before comparison',()=>{
 const r=intersectionEvidence({page:{page:1,heightPt:100,rotation:0},
 geometry:{page:1,heightPt:100,rotation:0,coordinateSystem:'viewport_points_top_left',
 segments:[{x1:0,y1:80,x2:20,y2:80},{x1:10,y1:70,x2:10,y2:90}]},
 candidates:[{mark:'К62',pdfX:10,pdfY:20}]});
 assert.equal(r.marks[0].nearbyIntersections.length,1);
 assert.equal(r.safeForAutoPlacement,false);
});
