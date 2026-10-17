'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeMark, classify, planPlacements } = require('./placement-resolver');
const grid = { axes: { x: { '1': 0, '2': 45000 }, y: { 'А': 0, 'Б': 6000 } } };
test('normalizes marks and recognizes types', () => {
  assert.equal(normalizeMark(' к 62 '), 'К62');
  for (const [label, expected] of [['Колонна','column'],['Балка','beam'],['Ригель','girder'],['Связь','brace'],['Фахверк','wall-post'],['Прогон','purlin'],['Распорка','strut']]) {
    assert.equal(classify(label), expected);
  }
});
test('only registered marks are processed; verified geometry is ready', () => {
  const result = planPlacements([{mark:'К62',name:'Колонна'}], [
    {mark:'К62',xAxis:'1',yAxis:'А',z0:0,z1:12000,page:45,verified:true},
    {mark:'К99',xAxis:'2',yAxis:'Б',z0:0,z1:5000,verified:true}
  ], grid);
  assert.equal(result.placements.length,1);
  assert.equal(result.ready,1);
  assert.deepEqual(result.placements[0].geometry,{x:0,y:0,z0:0,z1:12000,x1:null,y1:null});
});
test('missing geometry is never guessed', () => {
  const result = planPlacements([{mark:'Б1',name:'Балка'}], [{mark:'Б1',xAxis:'1',yAxis:'А',z0:5000,verified:true}],grid);
  assert.equal(result.review,1);
  assert.deepEqual(result.placements[0].missing,['z1','endX','endY']);
});
test('inverted elevations are a conflict', () => {
  const result = planPlacements([{mark:'К1',name:'Колонна'}], [{mark:'К1',xAxis:'1',yAxis:'А',z0:10000,z1:0,verified:true}],grid);
  assert.equal(result.conflicts,1);
});
test('multiple instances of one registered mark remain separate', () => {
  const result = planPlacements([{mark:'К1',name:'Колонна'}], [
    {mark:'К1',xAxis:'1',yAxis:'А',z0:0,z1:6000,verified:true},
    {mark:'К1',xAxis:'2',yAxis:'Б',z0:0,z1:6000,verified:true}
  ],grid);
  assert.equal(result.ready,2);
});
